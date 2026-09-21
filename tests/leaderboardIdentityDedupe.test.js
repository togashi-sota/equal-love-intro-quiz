// 【2026-09-22新設】ランキング「同一人物の重複」再発防止の回帰テスト。
//
// 【背景】2026-09-15にがしお（管理者）の匿名UID差し替えで起きた「同じ人が2人」を、旧UID→新UIDの
// 引き継ぎツール（js/uidSupersession.js）で直したが、2026-09-22に「じゅ」「サブ」「Olkya」の3人で再発した。
// 原因：ランキングの記録が匿名UIDだけをキーにしていて、UIDが差し替わった端末が同じ自己ベストを
// 新UID名義で自動再送信すると、旧UID名義の記録と並んで2件になる。前回の修正は「旧UIDが端末で分かる
// （v329以降に一度同期していた）端末で、本人がフレンド画面から手動実行」したときだけ効いた。
// 今回の恒久対策：①記録に identityKey（backupId のSHA-256＝UIDに依存しない本人キー）を保存する
// ②表示時に identityKey が同じ記録は最良の1件へ統合する（名前では絶対に統合しない）
// ③旧UIDが分かる端末では、候補の自動再送信より前に旧UID名義の記録を自動で引き継ぐ（記録は失わない）
// ④保存は「UIDをキーにした set／欠けた項目だけ update／何もしない」の3択（resolveLeaderboardWritePlan）で
//   二重送信しても1件のまま。
//
// このテストは Firebase に触れず、純粋関数と「UIDをキーにした区分ごとのメモリ上の保存先」で
// 保存→取得→統合の流れを再現する。
import {
  buildLeaderboardPath,
  buildLeaderboardEntryPayload,
  normalizeLeaderboardEntry,
  sortLeaderboardEntries,
  dedupeLeaderboardEntriesByIdentity,
  buildLeaderboardTopEntries,
  resolveLeaderboardWritePlan,
  needsIdentityKeyBackfill,
  isValidLeaderboardIdentityKey,
  computeLeaderboardIdentityKey,
  isBetterLeaderboardRecord,
  LEADERBOARD_TOP_DISPLAY_COUNT,
  LEADERBOARD_TOP_FETCH_LIMIT,
} from "../js/timeAttackLeaderboard.js";
import { planLeaderboardMerge, buildCopiedLeaderboardEntry } from "../js/backupOwnership.js";
import { assertEqual } from "./test-utils.js";

// ---- Firebase の代わり：区分（パス）ごとに { uid: 記録 } を持つメモリ上の保存先 ----
function createFakeLeaderboardStore() {
  const divisions = new Map();
  const divisionOf = (path) => {
    if (!divisions.has(path)) divisions.set(path, new Map());
    return divisions.get(path);
  };
  return {
    // js/timeAttackLeaderboardSync.js の submitTimeAttackScoreIfBetter と同じ判断順序を再現する
    // （get → resolveLeaderboardWritePlan → set／update／none）。戻り値は取った action。
    submit({ uid, identityKey = null, variant, questionCountValue, categoryFilterValue, clearTimeMs, missCount = 0, displayName, source = "normal", rule = null, actualQuestionCount = null, achievedAt }) {
      const division = divisionOf(buildLeaderboardPath(variant, questionCountValue, categoryFilterValue));
      const existingRaw = division.get(uid) ?? null;
      const existingEntry = existingRaw ? normalizeLeaderboardEntry(uid, existingRaw) : null;
      const plan = resolveLeaderboardWritePlan({
        existingEntry,
        candidate: { clearTimeMs, missCount, actualQuestionCount },
        identityKey,
      });
      if (plan.action === "set") {
        division.set(
          uid,
          buildLeaderboardEntryPayload({ displayName, oshiMemberId: null, clearTimeMs, missCount, rule, source, achievedAt, actualQuestionCount, identityKey })
        );
      } else if (plan.action === "update") {
        division.set(uid, { ...existingRaw, ...plan.fields });
      }
      return plan.action;
    },
    // fetchTimeAttackLeaderboardTop10 と同じ：clearTimeMs 昇順で上位 LEADERBOARD_TOP_FETCH_LIMIT 件 → 統合 → TOP10
    fetchTop(variant, questionCountValue, categoryFilterValue) {
      const division = divisionOf(buildLeaderboardPath(variant, questionCountValue, categoryFilterValue));
      const limited = [...division.entries()]
        .sort((a, b) => a[1].clearTimeMs - b[1].clearTimeMs)
        .slice(0, LEADERBOARD_TOP_FETCH_LIMIT)
        .map(([uid, raw]) => normalizeLeaderboardEntry(uid, raw))
        .filter((entry) => entry !== null);
      return buildLeaderboardTopEntries(limited);
    },
    rawCount(variant, questionCountValue, categoryFilterValue) {
      return divisionOf(buildLeaderboardPath(variant, questionCountValue, categoryFilterValue)).size;
    },
    rawDivision(variant, questionCountValue, categoryFilterValue) {
      return divisionOf(buildLeaderboardPath(variant, questionCountValue, categoryFilterValue));
    },
    // js/uidSupersession.js の autoMergeSupersededLeaderboardEntries と同じ判断：
    // 旧UIDの記録があれば「速い方を新UID名義で1件残し、旧を消す」
    autoMerge({ oldUid, newUid, identityKey, displayName }) {
      let copied = 0;
      let deletedOld = 0;
      divisions.forEach((division) => {
        const oldEntry = division.get(oldUid) ?? null;
        const newEntry = division.get(newUid) ?? null;
        const action = planLeaderboardMerge(oldEntry, newEntry);
        if (action === "none") return;
        if (action === "copyThenDeleteOld") {
          division.set(newUid, { ...buildCopiedLeaderboardEntry(oldEntry, { displayName, oshiMemberId: null }), identityKey });
          copied += 1;
        }
        division.delete(oldUid);
        deletedOld += 1;
      });
      return { copied, deletedOld };
    },
  };
}

const KEY_A = "a".repeat(64); // 同一人物Aの本人キー（テスト用の固定値）
const KEY_B = "b".repeat(64); // 別人Bの本人キー
const DIV = { variant: "intro", questionCountValue: "5", categoryFilterValue: "title-track" };

export async function runLeaderboardIdentityDedupeTests() {
  // ---- identityKey の生成：決定的・backupIdごとに違う・逆算不能な形（16進64文字）・使えない環境ではnull ----
  const backupIdA = "5f1c2b9e-1111-4a2b-9c3d-aaaaaaaaaaaa";
  const backupIdB = "5f1c2b9e-2222-4a2b-9c3d-bbbbbbbbbbbb";
  const keyA1 = await computeLeaderboardIdentityKey(backupIdA);
  const keyA2 = await computeLeaderboardIdentityKey(backupIdA);
  const keyB = await computeLeaderboardIdentityKey(backupIdB);
  assertEqual(typeof keyA1 === "string" && keyA1.length === 64 && /^[0-9a-f]+$/.test(keyA1), true, "identityKey は SHA-256 の16進64文字");
  assertEqual(keyA1, keyA2, "同じ backupId からは必ず同じ identityKey（決定的）");
  assertEqual(keyA1 !== keyB, true, "別の backupId からは別の identityKey");
  assertEqual(keyA1.includes(backupIdA.slice(0, 8)), false, "identityKey に backupId の断片が含まれない（一方向ハッシュ）");
  assertEqual(await computeLeaderboardIdentityKey(null), null, "backupId が無ければ null");
  assertEqual(await computeLeaderboardIdentityKey("short"), null, "短すぎる backupId は null");
  assertEqual(await computeLeaderboardIdentityKey(backupIdA, null), null, "crypto.subtle が使えない環境では null（記録にキーを付けないだけで壊れない）");
  assertEqual(isValidLeaderboardIdentityKey(keyA1), true, "生成した identityKey は形式チェックを通る");
  assertEqual(isValidLeaderboardIdentityKey("x".repeat(15)), false, "15文字以下は不正");
  assertEqual(isValidLeaderboardIdentityKey("x".repeat(65)), false, "65文字以上は不正");
  assertEqual(isValidLeaderboardIdentityKey("あ".repeat(20)), false, "英数字以外は不正");

  // ---- payload／normalize：identityKey の持ち回り ----
  const payloadWithKey = buildLeaderboardEntryPayload({ displayName: "じゅ", oshiMemberId: null, clearTimeMs: 8114, missCount: 0, rule: null, source: "normal", achievedAt: 1, actualQuestionCount: 5, identityKey: KEY_A });
  assertEqual(payloadWithKey.identityKey, KEY_A, "payload に identityKey が入る");
  const payloadWithoutKey = buildLeaderboardEntryPayload({ displayName: "じゅ", oshiMemberId: null, clearTimeMs: 8114, missCount: 0, rule: null, source: "normal", achievedAt: 1, actualQuestionCount: 5 });
  assertEqual("identityKey" in payloadWithoutKey, false, "identityKey が無いときはキー自体を付けない（旧Rulesでも受け付けられる形）");
  assertEqual(normalizeLeaderboardEntry("u1", { clearTimeMs: 100, missCount: 0, identityKey: KEY_A }).identityKey, KEY_A, "normalize: identityKey を保持");
  assertEqual(normalizeLeaderboardEntry("u1", { clearTimeMs: 100, missCount: 0 }).identityKey, null, "normalize: 旧形式（identityKey 無し）は null");
  assertEqual(normalizeLeaderboardEntry("u1", { clearTimeMs: 100, missCount: 0, identityKey: 12345 }).identityKey, null, "normalize: 壊れた identityKey は null（誰とも統合しない）");

  // ---- A. 同一UIDが同条件で同じ記録を2回送る → 1件 ----
  let store = createFakeLeaderboardStore();
  const a1 = store.submit({ uid: "uid-A", identityKey: KEY_A, ...DIV, clearTimeMs: 8114, displayName: "じゅ", achievedAt: 100 });
  const a2 = store.submit({ uid: "uid-A", identityKey: KEY_A, ...DIV, clearTimeMs: 8114, displayName: "じゅ", achievedAt: 200 });
  assertEqual([a1, a2], ["set", "none"], "A: 1回目は set、同じ記録の2回目は何もしない");
  assertEqual(store.rawCount(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue), 1, "A: 同一UIDの二重送信でも保存先は1件");
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).length, 1, "A: 表示も1件");

  // ---- B. より速い記録 → ベスト1件に置き換わる ----
  const b = store.submit({ uid: "uid-A", identityKey: KEY_A, ...DIV, clearTimeMs: 7000, displayName: "じゅ", achievedAt: 300 });
  assertEqual(b, "set", "B: 速い記録は set");
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).map((e) => e.clearTimeMs), [7000], "B: ベスト1件だけが残る");

  // ---- C. 遅い記録 → 既存ベスト維持 ----
  const c = store.submit({ uid: "uid-A", identityKey: KEY_A, ...DIV, clearTimeMs: 9000, displayName: "じゅ", achievedAt: 400 });
  assertEqual(c, "none", "C: 遅い記録は何もしない");
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).map((e) => e.clearTimeMs), [7000], "C: 既存ベストが維持される");

  // ---- G. 同一人物・同タイム・二重送信（別イベント経由）→ 1件 ----
  const g = store.submit({ uid: "uid-A", identityKey: KEY_A, ...DIV, clearTimeMs: 7000, displayName: "じゅ", source: "timeAttack", achievedAt: 500 });
  assertEqual(g, "none", "G: 同タイムの二重送信は何もしない（登録日時も動かさない）");
  assertEqual(store.rawCount(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue), 1, "G: 1件のまま");

  // ---- N. 同一保存処理が短時間に2回発火（並行）→ 1件 ----
  //   実装は「UIDをキーにした set」なので、順序に関係なく同じキーへの上書きにしかならない。
  store = createFakeLeaderboardStore();
  const nPlans = [
    store.submit({ uid: "uid-N", identityKey: KEY_A, ...DIV, clearTimeMs: 5000, displayName: "N", achievedAt: 1 }),
    store.submit({ uid: "uid-N", identityKey: KEY_A, ...DIV, clearTimeMs: 5000, displayName: "N", achievedAt: 1 }),
  ];
  assertEqual(nPlans, ["set", "none"], "N: 短時間の2回発火でも2回目は何もしない");
  assertEqual(store.rawCount(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue), 1, "N: 1件");
  // 【重要】push() を使わず、キーが必ず UID であること（別キーで増殖しない）
  assertEqual([...store.rawDivision(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).keys()], ["uid-N"], "N: 保存キーはUIDそのもの");

  // ---- D／M. 同一論理ユーザーの旧UID→新UID → 1人として扱う（表示側の統合） ----
  store = createFakeLeaderboardStore();
  store.submit({ uid: "uid-old", identityKey: KEY_A, ...DIV, clearTimeMs: 8114, displayName: "じゅ", achievedAt: 100 });
  // UID差し替え後：端末の自己ベスト（同じ値）が新UID名義で自動再送信される（2026-09-22の再発と同じ状況）
  store.submit({ uid: "uid-new", identityKey: KEY_A, ...DIV, clearTimeMs: 8114, displayName: "じゅ", achievedAt: 200 });
  assertEqual(store.rawCount(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue), 2, "D: 保存先には旧UID・新UIDの2件がある（旧UIDは新UIDからは書き換えられない）");
  let top = store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue);
  assertEqual(top.length, 1, "D: 表示では identityKey が同じ2件が1人に統合される");
  assertEqual(top[0].uid, "uid-old", "D: 同タイムなら登録日時が早い方（旧UID）が代表になる（既存の並び順どおり）");
  // 旧UIDが分かる端末では、自動引き継ぎで旧を消し、保存先も1件になる（第一線）
  const merged = store.autoMerge({ oldUid: "uid-old", newUid: "uid-new", identityKey: KEY_A, displayName: "じゅ" });
  assertEqual(merged, { copied: 0, deletedOld: 1 }, "M: 新UIDが同等以上に速いので旧UIDだけ消す（記録は失われない）");
  assertEqual(store.rawCount(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue), 1, "M: 自動引き継ぎ後は保存先も1件");
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).map((e) => e.uid), ["uid-new"], "M: 新UID名義だけが残る");

  // 旧UIDの方が速い場合：新UID名義へ複製（identityKey つき）してから旧を消す
  store = createFakeLeaderboardStore();
  store.submit({ uid: "uid-old", ...DIV, clearTimeMs: 6000, displayName: "じゅ", achievedAt: 100 }); // 旧形式（キー無し）
  store.submit({ uid: "uid-new", identityKey: KEY_A, ...DIV, clearTimeMs: 8114, displayName: "じゅ", achievedAt: 200 });
  const merged2 = store.autoMerge({ oldUid: "uid-old", newUid: "uid-new", identityKey: KEY_A, displayName: "じゅ" });
  assertEqual(merged2, { copied: 1, deletedOld: 1 }, "M: 旧の方が速ければ複製してから旧を消す");
  top = store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue);
  assertEqual(top.map((e) => [e.uid, e.clearTimeMs, e.identityKey]), [["uid-new", 6000, KEY_A]], "M: 速い方の記録が新UID名義・本人キーつきで1件残る");

  // ---- E. 同じ名前・別UID・別identity → 2人として残る ----
  store = createFakeLeaderboardStore();
  store.submit({ uid: "uid-1", identityKey: KEY_A, ...DIV, clearTimeMs: 9862, displayName: "サブ", achievedAt: 100 });
  store.submit({ uid: "uid-2", identityKey: KEY_B, ...DIV, clearTimeMs: 10500, displayName: "サブ", achievedAt: 200 });
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).length, 2, "E: 同名でも本人キーが違えば2人として残る");

  // ---- F. 同じ名前・同タイム・別人 → 2人として残る ----
  store = createFakeLeaderboardStore();
  store.submit({ uid: "uid-1", identityKey: KEY_A, ...DIV, clearTimeMs: 9862, displayName: "サブ", achievedAt: 100 });
  store.submit({ uid: "uid-2", identityKey: KEY_B, ...DIV, clearTimeMs: 9862, displayName: "サブ", achievedAt: 200 });
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).length, 2, "F: 同名・同タイムでも本人キーが違えば統合しない");
  // 旧形式（キー無し）同士も統合しない（名前・タイム一致では判断しない）
  store = createFakeLeaderboardStore();
  store.submit({ uid: "uid-1", ...DIV, clearTimeMs: 9862, displayName: "サブ", achievedAt: 100 });
  store.submit({ uid: "uid-2", ...DIV, clearTimeMs: 9862, displayName: "サブ", achievedAt: 200 });
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).length, 2, "F: 本人キーが無い記録同士は同名・同タイムでも統合しない（旧データを誤統合しない）");
  // キー有りとキー無しも統合しない
  store = createFakeLeaderboardStore();
  store.submit({ uid: "uid-1", identityKey: KEY_A, ...DIV, clearTimeMs: 9862, displayName: "サブ", achievedAt: 100 });
  store.submit({ uid: "uid-2", ...DIV, clearTimeMs: 9862, displayName: "サブ", achievedAt: 200 });
  assertEqual(store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue).length, 2, "F: 片方に本人キーが無ければ統合しない");

  // ---- H. 通常クイズ由来とTA由来 → 同じUID・同じ区分なら1件（速い方）。source は参考情報 ----
  store = createFakeLeaderboardStore();
  store.submit({ uid: "uid-H", identityKey: KEY_A, ...DIV, clearTimeMs: 9000, displayName: "H", source: "normal", achievedAt: 100 });
  const h = store.submit({ uid: "uid-H", identityKey: KEY_A, ...DIV, clearTimeMs: 8000, displayName: "H", source: "timeAttack", rule: "normal", achievedAt: 200 });
  assertEqual(h, "set", "H: TA由来の速い記録で置き換わる");
  top = store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue);
  assertEqual(top.map((e) => [e.clearTimeMs, e.source]), [[8000, "timeAttack"]], "H: 通常／TA は同じランキングで1件に統合され、source は参考情報として残る");

  // ---- I／J／K. 出題数・出題タイプ・カテゴリーをまたいで誤統合しない ----
  store = createFakeLeaderboardStore();
  const combos = [
    ["intro", "5", "title-track"],
    ["intro", "10", "title-track"], // I: 出題数違い
    ["intro", "all", "title-track"],
    ["randomPlayback", "5", "title-track"], // J: 出題タイプ違い
    ["outro", "5", "title-track"],
    ["intro", "5", "title-and-group"], // K: カテゴリー違い
    ["intro", "5", "all"],
  ];
  combos.forEach(([variant, questionCountValue, categoryFilterValue], index) => {
    store.submit({ uid: "uid-A", identityKey: KEY_A, variant, questionCountValue, categoryFilterValue, clearTimeMs: 1000 + index, displayName: "A", achievedAt: index });
  });
  assertEqual(
    combos.map(([v, q, c]) => store.fetchTop(v, q, c).length),
    combos.map(() => 1),
    "I/J/K: 7区分それぞれに同一人物の記録が1件ずつ残る（区分をまたいで消えない）"
  );
  assertEqual(new Set(combos.map(([v, q, c]) => buildLeaderboardPath(v, q, c))).size, combos.length, "I/J/K: 7区分のパスはすべて別");

  // ---- L. 旧データ形式 → 読み込み時に安全に扱える ----
  const legacyRaw = { displayName: "いくみ", oshiMemberId: "saito-kiara", clearTimeMs: 117970, missCount: 0, achievedAt: 1755324876170 };
  const legacy = normalizeLeaderboardEntry("uid-legacy", legacyRaw);
  assertEqual([legacy.identityKey, legacy.actualQuestionCount, legacy.source, legacy.rule], [null, null, null, null], "L: 旧形式は欠けた項目が null で読める");
  assertEqual(dedupeLeaderboardEntriesByIdentity([legacy, normalizeLeaderboardEntry("uid-legacy-2", legacyRaw)]).length, 2, "L: 旧形式同士は統合しない");
  // 旧形式の自分の記録には、次の送信時に identityKey だけ書き足せる（タイム・登録日時は触らない）
  assertEqual(needsIdentityKeyBackfill(legacy, KEY_A), true, "L: identityKey 無しの既存記録は後から補える");
  assertEqual(needsIdentityKeyBackfill({ ...legacy, identityKey: KEY_A }, KEY_A), false, "L: 既に identityKey があれば触らない");
  assertEqual(needsIdentityKeyBackfill(legacy, null), false, "L: 今回のキーが無ければ何もしない");
  assertEqual(
    resolveLeaderboardWritePlan({ existingEntry: legacy, candidate: { clearTimeMs: 117970, missCount: 0, actualQuestionCount: 20 }, identityKey: KEY_A }),
    { action: "update", fields: { actualQuestionCount: 20, identityKey: KEY_A } },
    "L: 同タイム再送信で、欠けている actualQuestionCount と identityKey だけを update する"
  );
  assertEqual(
    resolveLeaderboardWritePlan({ existingEntry: legacy, candidate: { clearTimeMs: 200000, missCount: 0, actualQuestionCount: 20 }, identityKey: KEY_A }),
    { action: "update", fields: { identityKey: KEY_A } },
    "L: 遅い記録でも identityKey だけは補う（タイム・登録日時は動かさない）"
  );
  assertEqual(
    resolveLeaderboardWritePlan({ existingEntry: { ...legacy, identityKey: KEY_A, actualQuestionCount: 20 }, candidate: { clearTimeMs: 200000, missCount: 0, actualQuestionCount: 20 }, identityKey: KEY_A }),
    { action: "none" },
    "L: 補うものが無ければ何もしない"
  );
  assertEqual(resolveLeaderboardWritePlan({ existingEntry: null, candidate: { clearTimeMs: 5000, missCount: 0 }, identityKey: null }), { action: "set" }, "初回は set（identityKey が無くても送信する）");
  assertEqual(isBetterLeaderboardRecord(legacy, { clearTimeMs: 117970, missCount: 0 }), false, "同じ記録は『良くなっていない』（従来どおり）");

  // ---- O. TOP10 境界付近で重複統合しても順位が正しい ----
  store = createFakeLeaderboardStore();
  // 12人分。3位と4位が同一人物（旧UID・新UID）、11位は統合後に10位へ繰り上がるべき
  const people = [
    ["p1", KEY_B.replace(/b/g, "1"), 1000],
    ["p2", KEY_B.replace(/b/g, "2"), 2000],
    ["p3-old", KEY_A, 3000],
    ["p3-new", KEY_A, 3000],
    ["p5", KEY_B.replace(/b/g, "5"), 5000],
    ["p6", KEY_B.replace(/b/g, "6"), 6000],
    ["p7", KEY_B.replace(/b/g, "7"), 7000],
    ["p8", KEY_B.replace(/b/g, "8"), 8000],
    ["p9", KEY_B.replace(/b/g, "9"), 9000],
    ["p10", KEY_B.replace(/b/g, "e"), 10000],
    ["p11", KEY_B.replace(/b/g, "c"), 11000],
    ["p12", KEY_B.replace(/b/g, "d"), 12000],
  ];
  people.forEach(([uid, identityKey, clearTimeMs], index) => {
    store.submit({ uid, identityKey, ...DIV, clearTimeMs, displayName: uid, achievedAt: index });
  });
  top = store.fetchTop(DIV.variant, DIV.questionCountValue, DIV.categoryFilterValue);
  assertEqual(top.length, LEADERBOARD_TOP_DISPLAY_COUNT, "O: 統合後も10件表示される");
  assertEqual(
    top.map((e) => e.uid),
    ["p1", "p2", "p3-old", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
    "O: 同一人物は1件になり、11番目の人が10位へ繰り上がる（順位が詰まる）"
  );
  assertEqual(LEADERBOARD_TOP_FETCH_LIMIT > LEADERBOARD_TOP_DISPLAY_COUNT, true, "O: 統合で減る分を見込んで表示件数より多く取得する");

  // ---- 並び順の維持：統合は sort の後に行い、先頭＝最良を残す ----
  const sorted = sortLeaderboardEntries([
    normalizeLeaderboardEntry("slow", { clearTimeMs: 9000, missCount: 0, achievedAt: 1, identityKey: KEY_A }),
    normalizeLeaderboardEntry("fast", { clearTimeMs: 4000, missCount: 0, achievedAt: 2, identityKey: KEY_A }),
  ]);
  assertEqual(dedupeLeaderboardEntriesByIdentity(sorted).map((e) => e.uid), ["fast"], "統合で残るのは速い方（並び順の先頭）");
  const tie = sortLeaderboardEntries([
    normalizeLeaderboardEntry("later", { clearTimeMs: 4000, missCount: 0, achievedAt: 200, identityKey: KEY_A }),
    normalizeLeaderboardEntry("earlier", { clearTimeMs: 4000, missCount: 0, achievedAt: 100, identityKey: KEY_A }),
  ]);
  assertEqual(dedupeLeaderboardEntriesByIdentity(tie).map((e) => e.uid), ["earlier"], "同タイムなら登録日時が早い方が残る（既存の tie-break を維持）");
}

// Rules・配線の構造テスト（実ファイルを読む）。
export async function runLeaderboardIdentityRulesAndWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const rules = JSON.parse(await fetchText("firebase/database.rules.json")).rules;
  const v3 = rules.timeAttackLeaderboardsV3?.["$variant"]?.["$questionCount"]?.["$category"]?.["$uid"];
  assertEqual(v3?.identityKey?.[".validate"], "newData.isString() && newData.val().length >= 16 && newData.val().length <= 64", "Rules: ランキングV3の記録に identityKey（16〜64文字の文字列）を保存できる（第11回：新規作成では必須）");
  assertEqual(v3?.["$other"]?.[".validate"], false, "Rules: それ以外の未知のキーは引き続き拒否");
  assertEqual(v3?.[".write"]?.includes("auth.uid === $uid"), true, "Rules: 記録を書けるのは自分のUIDのキーだけ（push() で別キーが増える余地が無い）");

  const pure = await fetchText("js/timeAttackLeaderboard.js");
  assertEqual(pure.includes("export function dedupeLeaderboardEntriesByIdentity(sortedEntries)"), true, "純粋関数: 同一人物の統合関数がある");
  assertEqual(pure.includes("if (!isValidLeaderboardIdentityKey(entry.identityKey)) return true;"), true, "純粋関数: 本人キーが無い記録は統合しない");
  assertEqual(/\.displayName\s*===\s*\w+\.displayName/.test(pure), false, "純粋関数: 名前の一致で同一人物と判断するコードが無い");

  const sync = await fetchText("js/timeAttackLeaderboardSync.js");
  assertEqual(/push\(ref\(|import \{[^}]*push/.test(sync), false, "sync: Firebase の push() は使わない（キーは常にUID）");
  assertEqual(sync.includes("await set(ref(database, entryPath), payload);"), true, "sync: 記録は UID のキーへ set() で置き換える");
  assertEqual(sync.includes("resolveLeaderboardWritePlan({"), true, "sync: 保存の判断は resolveLeaderboardWritePlan に集約");
  assertEqual(sync.includes("limitToFirst(LEADERBOARD_TOP_FETCH_LIMIT + (cursor ? 1 : 0))"), true, "sync: TOP取得は統合前に1ページ（30件）ずつ取得する");
  assertEqual(sync.includes("const entries = await collectUniqueTopEntries(fetchPage);"), true, "sync: 取得後に並び替え→同一人物の統合→ユニーク10人まで次ページ");
  assertEqual(sync.includes("await autoMergeSupersededLeaderboardEntries({ identityKey: await resolveMyIdentityKey() });"), true, "sync: 候補の再送信より前に旧UID名義の記録を自動で引き継ぐ");
  assertEqual(sync.includes("identityKeyRejectedByRules") || sync.includes("writeWithIdentityKeyFallback"), false, "sync: 【第11回】キー無しで保存する退避は撤去済み（キーが無ければクラウドへ書かない）");
  assertEqual(sync.includes('if (!identityKey) return { ok: false, reason: "identity-key-unavailable" };'), true, "sync: 本人キーを作れなければ送信しない（候補はローカルに残る）");
  assertEqual(sync.includes('return { ok: false, reason: "rules-rejected" };'), true, "sync: Rules に拒否されてもキー無しで強行しない");

  const supersession = await fetchText("js/uidSupersession.js");
  assertEqual(supersession.includes("export async function autoMergeSupersededLeaderboardEntries("), true, "uidSupersession: 自動引き継ぎ関数がある");
  assertEqual(supersession.includes("if (!readBack || readBack.clearTimeMs !== copied.clearTimeMs) {"), true, "uidSupersession: 複製を読み戻して確認してから旧を消す");
  assertEqual(supersession.includes("markPendingUidMergeLeaderboardMerged(player.playerId, now);"), true, "uidSupersession: 全区分成功のときだけ完了の印を付ける");

  const screen = await fetchText("js/timeAttackLeaderboardScreen.js");
  assertEqual(screen.includes("function isOwnEntry(entry) {"), true, "画面: 自分の行判定は UID または本人キー");
  assertEqual(screen.includes("elements.adminDeleteUid.textContent = `…${entry.uid.slice(-6)}`;"), true, "画面: 管理者の削除確認にID末尾を出す");
  const html = await fetchText("index.html");
  assertEqual(html.includes('id="time-attack-leaderboard-admin-delete-uid"'), true, "HTML: 削除確認にID末尾の欄がある");
  assertEqual(html.includes('id="time-attack-leaderboard-admin-delete-date"'), true, "HTML: 削除確認に登録日時の欄がある");
}
