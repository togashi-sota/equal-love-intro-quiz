// 【2026-09-22新設・本人指示 第8回】管理者用「UID移行・重複修復」の計画（js/uidRepairPlanner.js）と
// TOP10 のページ取得（js/timeAttackLeaderboard.js collectUniqueTopEntries）の回帰テスト。Firebase には触れない。
import {
  stableStringify,
  hashPayload,
  extractRankingCandidateBests,
  collectPairEvidence,
  planOldLeaderboardEntry,
  buildUidRepairCandidates,
  buildBackupRebindWrites,
  evaluateRebindReadBack,
  shortUid,
} from "../js/uidRepairPlanner.js";
import { collectUniqueTopEntries, normalizeLeaderboardEntry, LEADERBOARD_TOP_MAX_PAGES } from "../js/timeAttackLeaderboard.js";
import { assertEqual } from "./test-utils.js";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

// 2026-09-22 の実データを模した最小スナップショット（UID・名前は架空）。
function buildSnapshot({ withOldProfile = true, newIsBackupOwner = false, oldFaster = false, noNewEntry = false } = {}) {
  const backups = {
    "backup-ju": {
      currentUid: "OLD-ju",
      displayName: "じゅ",
      oshiMemberId: "takiwaki-shoko",
      achievementCount: 2,
      updatedAt: 1000,
      schemaVersion: 1,
      payload: {
        achievements: "{}",
        rankingCandidateBest: JSON.stringify({ schemaVersion: 1, bestsByCombo: { "intro.5.title-track": { clearTimeMs: 8114, missCount: 0 } } }),
      },
    },
  };
  if (newIsBackupOwner) {
    backups["backup-other"] = { currentUid: "NEW-ju", displayName: "じゅ", achievementCount: 2, updatedAt: 1500, schemaVersion: 1, payload: {} };
  }
  const publicProfiles = {
    "NEW-ju": { displayName: "じゅ", oshiMemberId: "takiwaki-shoko", unlockedAchievementIds: ["intro_beginner", "outro_beginner"], updatedAt: 3000 },
    "uid-other": { displayName: "ぜんた", oshiMemberId: "otani-emiri", unlockedAchievementIds: ["intro_beginner"], updatedAt: 2500 },
  };
  if (withOldProfile) {
    publicProfiles["OLD-ju"] = { displayName: "じゅ", oshiMemberId: "takiwaki-shoko", unlockedAchievementIds: ["outro_beginner", "intro_beginner"], updatedAt: 1200 };
  }
  const leaderboards = {
    "intro/5/title-track": {
      "OLD-ju": { displayName: "じゅ", clearTimeMs: 8114, missCount: 0, achievedAt: 1100 },
      "uid-other": { displayName: "ぜんた", clearTimeMs: 9160, missCount: 0, achievedAt: 900 },
    },
    "outro/5/title-track": {
      "OLD-ju": { displayName: "じゅ", clearTimeMs: 11747, missCount: 0, achievedAt: 1150 },
    },
  };
  if (!noNewEntry) {
    leaderboards["intro/5/title-track"]["NEW-ju"] = { displayName: "じゅ", clearTimeMs: oldFaster ? 9000 : 8114, missCount: 0, achievedAt: 3000 };
    leaderboards["outro/5/title-track"]["NEW-ju"] = { displayName: "じゅ", clearTimeMs: 11747, missCount: 0, achievedAt: 3001 };
  }
  const presence = { "OLD-ju": { lastSeen: 1200 }, "NEW-ju": { lastSeen: 3100 } };
  return { backups, publicProfiles, leaderboards, presence };
}

export async function runUidRepairPlannerTests() {
  // ---- stableStringify / hashPayload ----
  assertEqual(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}', "stableStringify はキー順で安定");
  const h1 = await hashPayload({ x: "1", y: "2" });
  const h2 = await hashPayload({ y: "2", x: "1" });
  const h3 = await hashPayload({ x: "1", y: "3" });
  assertEqual(h1, h2, "hashPayload: キー順が違っても同じ内容なら同じハッシュ");
  assertEqual(h1 !== h3, true, "hashPayload: 内容が違えばハッシュも違う");
  assertEqual((await hashPayload({ a: 1 }, null)).startsWith("fnv-"), true, "hashPayload: crypto.subtle が無ければ予備のハッシュ");
  assertEqual(shortUid("OaX76aXXXXXXXXXXLRS2"), "…XXLRS2", "shortUid は末尾6文字");

  // ---- payload から自己ベストを取り出す ----
  const bests = extractRankingCandidateBests(buildSnapshot().backups["backup-ju"].payload);
  assertEqual(bests["intro.5.title-track"]?.clearTimeMs, 8114, "payload の rankingCandidateBest を読める");
  assertEqual(extractRankingCandidateBests({ rankingCandidateBest: "{broken" }), {}, "壊れた JSON は空");
  assertEqual(extractRankingCandidateBests(null), {}, "payload 無しは空");

  // ---- H. 旧／新ランキング同一 → 旧を消して新を残す ----
  assertEqual(planOldLeaderboardEntry({ clearTimeMs: 8114, missCount: 0 }, { clearTimeMs: 8114, missCount: 0 }).action, "deleteOld", "H: 同一記録は旧を削除できる");
  // ---- I. 旧が速い → 管理者は新へ複製できないので保留（絶対に自動削除しない） ----
  assertEqual(planOldLeaderboardEntry({ clearTimeMs: 8000, missCount: 0 }, { clearTimeMs: 8114, missCount: 0 }).action, "hold", "I: 旧の方が速ければ保留");
  // ---- J. 新が速い → 旧を削除 ----
  assertEqual(planOldLeaderboardEntry({ clearTimeMs: 9000, missCount: 0 }, { clearTimeMs: 8114, missCount: 0 }).action, "deleteOld", "J: 新の方が速ければ旧を削除");
  // ---- K. 新の記録なし → 保留 ----
  assertEqual(planOldLeaderboardEntry({ clearTimeMs: 9000, missCount: 0 }, null).action, "hold", "K: 新IDに記録が無ければ削除しない");
  assertEqual(planOldLeaderboardEntry({ clearTimeMs: 9000, missCount: 0 }, { clearTimeMs: 8000, missCount: 1 }).action, "hold", "新のミス数が0でなければ保留");
  assertEqual(planOldLeaderboardEntry(null, { clearTimeMs: 8000, missCount: 0 }).action, "none", "旧が無ければ何もしない");

  // ---- 候補検出：実データ相当（証拠3種＋時系列）→ 実行可能 ----
  {
    const candidates = buildUidRepairCandidates(buildSnapshot());
    assertEqual(candidates.length, 1, "候補は1件（じゅ）");
    const c = candidates[0];
    assertEqual([c.backupId, c.oldUid, c.newUid], ["backup-ju", "OLD-ju", "NEW-ju"], "旧UID→新UIDのペアが正しい");
    assertEqual(c.strong, true, "証拠が揃っている");
    assertEqual(c.executable, true, "実行可能");
    assertEqual(c.blockers, [], "阻害要因なし");
    assertEqual(c.leaderboardMatchCount, 2, "ランキング完全一致 2区分");
    assertEqual(c.payloadMatchCount, 1, "バックアップ内の自己ベスト一致 1区分");
    assertEqual(c.profileAchievementsEqual, true, "称号一覧一致（順序が違っても同じ集合）");
    assertEqual(c.evidence.some((line) => line.includes("時系列が自然")), true, "時系列の証拠");
    assertEqual(c.leaderboardPlan.map((p) => [p.division, p.action]), [["intro/5/title-track", "deleteOld"], ["outro/5/title-track", "deleteOld"]], "ランキング計画は2区分とも削除可");
    assertEqual(c.profilePlan.action, "deleteOld", "旧公開プロフィールは削除可（新側が存在）");
    assertEqual(c.presencePlan.action, "successor", "presence は後継者（本人端末）に任せる");
    assertEqual(c.backup.payloadKeyCount, 2, "payload キー数を表示用に持つ");
  }

  // ---- L. 同名別人（別UID・別 identity・記録も称号も一致しない）→ 候補にしない／統合しない ----
  {
    const snapshot = buildSnapshot();
    snapshot.publicProfiles["uid-namesake"] = { displayName: "じゅ", oshiMemberId: "otani-emiri", unlockedAchievementIds: ["lyric_beginner"], updatedAt: 4000 };
    snapshot.leaderboards["intro/5/title-track"]["uid-namesake"] = { displayName: "じゅ", clearTimeMs: 12000, missCount: 0, achievedAt: 4000 };
    const candidates = buildUidRepairCandidates(snapshot);
    assertEqual(candidates.length, 1, "L: 同名の別人は候補に増えない");
    assertEqual(candidates[0].newUid, "NEW-ju", "L: 選ばれるのは証拠が揃った方だけ");
    const namesake = collectPairEvidence({
      backupId: "backup-ju",
      backup: snapshot.backups["backup-ju"],
      oldUid: "OLD-ju",
      newUid: "uid-namesake",
      publicProfiles: snapshot.publicProfiles,
      leaderboards: snapshot.leaderboards,
      presence: snapshot.presence,
      backupCurrentUids: new Set(["OLD-ju"]),
    });
    assertEqual(namesake.strong, false, "L: 名前が同じだけでは同一人物にしない");
  }

  // ---- M. 同名・同タイム・別 identity（称号一覧が違う）→ 統合しない ----
  {
    const snapshot = buildSnapshot();
    snapshot.publicProfiles["NEW-ju"].unlockedAchievementIds = ["lyric_beginner"]; // 称号一覧が旧と食い違う
    const candidates = buildUidRepairCandidates(snapshot);
    assertEqual(candidates.length, 1, "M: 候補としては表示される（要個別対応）");
    assertEqual(candidates[0].executable, false, "M: 同名・同タイムでも称号一覧が違えば実行不可");
    assertEqual(candidates[0].blockers.some((b) => b.includes("称号一覧が一致しません")), true, "M: 理由を表示");
  }

  // ---- 新UIDが別のバックアップの持ち主 → 別人の可能性として実行不可 ----
  {
    const candidates = buildUidRepairCandidates(buildSnapshot({ newIsBackupOwner: true }));
    assertEqual(candidates.length, 0, "新UIDが別バックアップの持ち主なら候補にならない（UID差し替えの特徴を満たさない）");
  }

  // ---- 旧公開プロフィールが無い（消えている）場合：payload の一致があれば強い証拠 ----
  {
    const candidates = buildUidRepairCandidates(buildSnapshot({ withOldProfile: false }));
    assertEqual(candidates.length, 1, "旧プロフィール無しでも候補になる");
    assertEqual(candidates[0].strong, true, "旧プロフィール無しでも payload の一致で同一人物と判断できる");
    assertEqual(candidates[0].profilePlan.action, "none", "旧プロフィールが無ければ削除計画なし");
  }

  // ---- 時系列の逆転（新IDの活動が旧IDより前）→ 実行不可 ----
  {
    const snapshot = buildSnapshot();
    snapshot.presence["OLD-ju"].lastSeen = 5000; // 旧IDが新IDより後に活動
    const candidates = buildUidRepairCandidates(snapshot);
    assertEqual(candidates[0]?.executable ?? false, false, "時系列が不自然なら実行不可");
  }

  // ---- I／K を候補全体で：1区分でも保留があれば一括実行不可 ----
  {
    const oldFaster = buildUidRepairCandidates(buildSnapshot({ oldFaster: true }))[0];
    assertEqual(oldFaster.executable, false, "I: 旧の方が速い区分があれば一括実行不可");
    assertEqual(oldFaster.leaderboardPlan.find((p) => p.division === "intro/5/title-track").action, "hold", "I: その区分は保留");
    const noNew = buildUidRepairCandidates(buildSnapshot({ noNewEntry: true }))[0];
    assertEqual(noNew?.executable ?? false, false, "K: 新IDにランキング記録が無ければ（証拠不足＋保留で）実行不可");
    assertEqual((noNew?.leaderboardPlan ?? []).every((p) => p.action === "hold"), true, "K: 旧IDの記録はすべて保留（削除しない）");
  }

  // ---- N. 付け替えの書き込み内容：payload・updatedAt・schemaVersion に触れない／読み戻し検証 ----
  {
    const writes = buildBackupRebindWrites({ backupId: "backup-ju", oldUid: "OLD-ju", newUid: "NEW-ju", serverTimestampValue: "TS" });
    assertEqual(writes, {
      "backups/backup-ju/currentUid": "NEW-ju",
      "backups/backup-ju/previousUids/OLD-ju": "TS",
      "backups/backup-ju/ownerSecret": null,
    }, "N: 付け替えは currentUid・previousUids・ownerSecret の3項目だけ（payload には触れない）");
    assertEqual(Object.keys(writes).some((k) => k.includes("payload") || k.includes("updatedAt") || k.includes("schemaVersion")), false, "N: payload／updatedAt／schemaVersion への書き込みは無い");
    const before = { currentUid: "OLD-ju", updatedAt: 1000, schemaVersion: 1, payload: { a: "1" }, ownerSecret: "x".repeat(40) };
    const after = { currentUid: "NEW-ju", updatedAt: 1000, schemaVersion: 1, payload: { a: "1" }, previousUids: { "OLD-ju": 999 } };
    const hb = await hashPayload(before.payload);
    const ha = await hashPayload(after.payload);
    assertEqual(evaluateRebindReadBack({ before, after, oldUid: "OLD-ju", newUid: "NEW-ju", hashBefore: hb, hashAfter: ha }), { ok: true, problems: [] }, "N: 読み戻し検証 OK（payload 一致・currentUid 新・previousUids 記録・ownerSecret 無効化）");
    // ---- O. 付け替えが部分的に失敗した形（currentUid だけ変わって previousUids が無い等）は検証で検出 ----
    const partial = { ...after, previousUids: undefined };
    assertEqual(evaluateRebindReadBack({ before, after: partial, oldUid: "OLD-ju", newUid: "NEW-ju", hashBefore: hb, hashAfter: ha }).ok, false, "O: previousUids が無ければ検証 NG");
    const corrupted = { ...after, payload: { a: "2" } };
    assertEqual(evaluateRebindReadBack({ before, after: corrupted, oldUid: "OLD-ju", newUid: "NEW-ju", hashBefore: hb, hashAfter: await hashPayload(corrupted.payload) }).problems.some((p) => p.includes("ハッシュ")), true, "O: payload が変わっていれば検証 NG");
    const touchedUpdatedAt = { ...after, updatedAt: 2000 };
    assertEqual(evaluateRebindReadBack({ before, after: touchedUpdatedAt, oldUid: "OLD-ju", newUid: "NEW-ju", hashBefore: hb, hashAfter: ha }).problems.some((p) => p.includes("updatedAt")), true, "O: updatedAt が変わっていれば検証 NG");
    const notRebound = { ...after, currentUid: "OLD-ju" };
    assertEqual(evaluateRebindReadBack({ before, after: notRebound, oldUid: "OLD-ju", newUid: "NEW-ju", hashBefore: hb, hashAfter: ha }).ok, false, "O: currentUid が変わっていなければ検証 NG");
  }

  // ---- P. 旧公開プロフィール削除は新側が存在するときだけ ----
  {
    const snapshot = buildSnapshot();
    delete snapshot.publicProfiles["NEW-ju"];
    const c = buildUidRepairCandidates(snapshot)[0];
    // 新プロフィールが無いと称号一覧の一致が取れず候補は「要個別対応」になる。削除計画も hold。
    assertEqual(c?.profilePlan?.action ?? "hold", "hold", "P: 新IDの公開プロフィールが無ければ旧を削除しない");
    assertEqual(c?.executable ?? false, false, "P: その候補は実行不可");
  }
}

// ---- Q／R. TOP10 のページ取得（同一人物の重複が何件あっても正しいユニーク10人。データが尽きれば止まる） ----
export async function runLeaderboardPaginationTests() {
  const makeEntry = (uid, clearTimeMs, identityKey) => normalizeLeaderboardEntry(uid, { clearTimeMs, missCount: 0, achievedAt: 1, identityKey });
  // 偽の Firebase：clearTimeMs 昇順の配列を pageSize ずつ返す。cursor は「次の開始位置」。
  function createFakeFetcher(all, pageSize) {
    const sorted = [...all].sort((a, b) => a.clearTimeMs - b.clearTimeMs);
    let pageCalls = 0;
    const fetchPage = async (cursor) => {
      pageCalls += 1;
      const start = cursor ? cursor.index : 0;
      const entries = sorted.slice(start, start + pageSize);
      const nextCursor = start + pageSize < sorted.length ? { index: start + pageSize } : null;
      return { entries, nextCursor };
    };
    return { fetchPage, pageCalls: () => pageCalls };
  }

  // Q. 上位30件のうち25件が同一人物Aの重複（旧UIDが大量に残った想定）→ 31件目以降も取得して10人そろえる
  {
    const all = [];
    for (let i = 0; i < 25; i += 1) all.push(makeEntry(`dupA-${i}`, 1000 + i, KEY_A));
    for (let i = 0; i < 20; i += 1) all.push(makeEntry(`other-${i}`, 5000 + i, `${"c".repeat(60)}${String(i).padStart(4, "0")}`));
    const { fetchPage, pageCalls } = createFakeFetcher(all, 30);
    const top = await collectUniqueTopEntries(fetchPage, { displayCount: 10 });
    assertEqual(top.length, 10, "Q: 重複が多くてもユニーク10人");
    assertEqual(top[0].uid, "dupA-0", "Q: 同一人物Aは最良の1件だけ");
    assertEqual(top.slice(1).map((e) => e.uid), ["other-0", "other-1", "other-2", "other-3", "other-4", "other-5", "other-6", "other-7", "other-8"], "Q: 31件目以降の別ユーザーが正しく繰り上がる");
    assertEqual(pageCalls() >= 2, true, "Q: 1ページでは足りないので次ページを取った");
  }

  // R. ユニークが7人しかいない → 7人で終了、無限取得しない
  {
    const all = [];
    for (let i = 0; i < 40; i += 1) all.push(makeEntry(`dupA-${i}`, 1000 + i, KEY_A));
    for (let i = 0; i < 6; i += 1) all.push(makeEntry(`u-${i}`, 3000 + i, `${"d".repeat(60)}${String(i).padStart(4, "0")}`));
    const { fetchPage, pageCalls } = createFakeFetcher(all, 30);
    const top = await collectUniqueTopEntries(fetchPage, { displayCount: 10 });
    assertEqual(top.length, 7, "R: 存在するユニークが7人なら7人で終わる");
    assertEqual(pageCalls(), 2, "R: データが尽きたら止まる（46件＝2ページ）");
  }

  // ページ数の上限で必ず止まる（1ページに毎回同じ人しか来ない極端なケース）
  {
    let calls = 0;
    const fetchPage = async () => {
      calls += 1;
      return { entries: [makeEntry(`x-${calls}`, calls, KEY_B)], nextCursor: { index: calls } };
    };
    const top = await collectUniqueTopEntries(fetchPage, { displayCount: 10, maxPages: 5 });
    assertEqual(calls, 5, "maxPages で止まる");
    assertEqual(top.length, 1, "統合後の結果を返す");
    assertEqual(LEADERBOARD_TOP_MAX_PAGES, 20, "既定の上限ページ数は20");
  }

  // 空のページ／ページ無しでも壊れない
  {
    const top = await collectUniqueTopEntries(async () => ({ entries: [], nextCursor: null }));
    assertEqual(top, [], "データ無しは空配列");
    const top2 = await collectUniqueTopEntries(async () => null);
    assertEqual(top2, [], "不正な戻り値でも空配列");
  }

  // 1ページで10人そろえば追加取得しない（従来の負荷を増やさない）
  {
    const all = [];
    for (let i = 0; i < 12; i += 1) all.push(makeEntry(`p-${i}`, 100 + i, `${"e".repeat(60)}${String(i).padStart(4, "0")}`));
    const { fetchPage, pageCalls } = createFakeFetcher(all, 30);
    const top = await collectUniqueTopEntries(fetchPage, { displayCount: 10 });
    assertEqual([top.length, pageCalls()], [10, 1], "重複が無ければ1ページで終わる");
  }

  // 配線：Firebase 側は startAt(value, key) で次ページを取り、forEach で順序を保つ
  const sync = await (await fetch("js/timeAttackLeaderboardSync.js", { cache: "no-store" })).text();
  assertEqual(sync.includes("if (cursor) constraints.push(startAt(cursor.clearTimeMs, cursor.uid));"), true, "sync: 次ページは startAt(clearTimeMs, uid) から");
  assertEqual(sync.includes("snapshot.forEach((child) => {"), true, "sync: 取得順は forEach で保つ（val() は順序を失う）");
  assertEqual(sync.includes("const entries = await collectUniqueTopEntries(fetchPage);"), true, "sync: ユニークTOP10 は collectUniqueTopEntries で作る");
  assertEqual(sync.includes("limitToFirst(LEADERBOARD_TOP_FETCH_LIMIT + (cursor ? 1 : 0))"), true, "sync: 2ページ目以降は重なる1件ぶん多く取る");
}
