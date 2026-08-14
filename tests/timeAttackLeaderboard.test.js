// js/timeAttackLeaderboard.js（Firebaseに一切触れない純粋関数群）のテスト。
// 【2026-08-16改訂】ランキングをノーマル/ハード/LOVE連チャンすべてに開放し、
// ルール・カテゴリー別にも分離した仕様変更に合わせて全面更新。
import {
  buildLeaderboardPath,
  buildLeaderboardEntryPayload,
  isBetterLeaderboardRecord,
  normalizeLeaderboardEntry,
  sortLeaderboardEntries,
  findRankByUid,
  findBestEntryPerVariantRuleQuestionCountAndCategory,
  isValidLeaderboardCandidate,
} from "../js/timeAttackLeaderboard.js";
import { assertEqual } from "./test-utils.js";

export function runTimeAttackLeaderboardTests() {
  // ---- パス組み立て：variant×rule×questionCount×categoryで完全に分離される ----
  assertEqual(
    buildLeaderboardPath("intro", "loveChain", "5", "all"),
    "timeAttackLeaderboardsV2/intro/loveChain/5/all",
    "イントロ・LOVE連チャン・5問・全曲の組み合わせのパスになる"
  );
  assertEqual(
    buildLeaderboardPath("randomPlayback", "normal", "50", "title-track"),
    "timeAttackLeaderboardsV2/randomPlayback/normal/50/title-track",
    "ランダム再生・ノーマル・50問・表題曲のみは別のパスになる"
  );
  assertEqual(
    buildLeaderboardPath("intro", "hard", "5", "all") === buildLeaderboardPath("intro", "loveChain", "5", "all"),
    false,
    "ルールが違えば別パスになる（ハードとLOVE連チャンは混ざらない）"
  );
  assertEqual(
    buildLeaderboardPath("intro", "loveChain", "5", "title-track") ===
      buildLeaderboardPath("intro", "loveChain", "5", "all"),
    false,
    "カテゴリーが違えば別パスになる（表題曲のみと全曲は混ざらない）"
  );
  assertEqual(
    buildLeaderboardPath("intro", "loveChain", "5", "all").startsWith("timeAttackLeaderboardsV2/"),
    true,
    "新しいランキングは旧構造（timeAttackLeaderboards、ルール・カテゴリー区別なし）とは別のキー配下に置かれる"
  );

  // ---- payload組み立て：uidを含まない、表示名の空欄はフォールバックする ----
  const payload = buildLeaderboardEntryPayload({
    displayName: "颯太",
    oshiMemberId: "noguchi-iori",
    clearTimeMs: 12345,
    missCount: 0,
    achievedAt: "SERVER_TIMESTAMP_PLACEHOLDER",
  });
  assertEqual(
    Object.keys(payload).sort(),
    ["achievedAt", "clearTimeMs", "displayName", "missCount", "oshiMemberId"].sort(),
    "payloadにuidは含まれない（キーとして使うため）"
  );
  assertEqual(payload.displayName, "颯太", "displayNameがそのまま反映される");

  const emptyNamePayload = buildLeaderboardEntryPayload({
    displayName: "",
    oshiMemberId: null,
    clearTimeMs: 1000,
    missCount: 0,
    achievedAt: 1,
  });
  assertEqual(emptyNamePayload.displayName, "名無しのファン", "表示名が空でも安全なフォールバック名になる");

  // ---- 自己ベスト更新判定：記録なしからは常に更新、タイムが縮んだときだけ更新 ----
  assertEqual(
    isBetterLeaderboardRecord(null, { clearTimeMs: 5000, missCount: 0 }),
    true,
    "記録が無い状態からの初記録は常に更新対象になる"
  );
  assertEqual(
    isBetterLeaderboardRecord({ clearTimeMs: 5000, missCount: 0 }, { clearTimeMs: 6000, missCount: 0 }),
    false,
    "自己ベストより遅いタイムは更新されない"
  );
  assertEqual(
    isBetterLeaderboardRecord({ clearTimeMs: 5000, missCount: 2 }, { clearTimeMs: 5000, missCount: 1 }),
    true,
    "同タイムでもミス数が減っていれば更新される"
  );
  assertEqual(
    isBetterLeaderboardRecord({ clearTimeMs: 5000, missCount: 1 }, { clearTimeMs: 5000, missCount: 1 }),
    false,
    "タイム・ミス数とも全く同じなら更新しない（登録日時をむやみに更新しない）"
  );

  // ---- 正規化：壊れたデータでも安全なデフォルトへ復旧する ----
  assertEqual(normalizeLeaderboardEntry("uid1", null), null, "entryがnullならnullを返す");
  assertEqual(normalizeLeaderboardEntry("uid1", { clearTimeMs: "not-a-number" }), null, "clearTimeMsが数値でなければnull");
  assertEqual(normalizeLeaderboardEntry("uid1", { clearTimeMs: -100 }), null, "clearTimeMsが負数ならnull（異常値として除外）");

  const normalized = normalizeLeaderboardEntry("uid2", {
    displayName: "テスト太郎",
    oshiMemberId: "otani-emiri",
    clearTimeMs: 4321,
    missCount: 2,
    achievedAt: 1700000000000,
  });
  assertEqual(
    normalized,
    {
      uid: "uid2",
      displayName: "テスト太郎",
      oshiMemberId: "otani-emiri",
      clearTimeMs: 4321,
      missCount: 2,
      achievedAt: 1700000000000,
    },
    "正常な形のentryは、値をそのまま保った形に正規化される"
  );

  const brokenEntry = normalizeLeaderboardEntry("uid3", {
    clearTimeMs: 999,
    missCount: "not-a-number",
    displayName: 12345,
    oshiMemberId: 999,
  });
  assertEqual(brokenEntry.missCount, 0, "missCountが数値でなければ0にフォールバックする");
  assertEqual(brokenEntry.displayName, "名無しのファン", "displayNameが文字列でなければフォールバックする");
  assertEqual(brokenEntry.oshiMemberId, null, "oshiMemberIdが文字列でなければnullにフォールバックする");

  // ---- 並び替え：①タイム②ミス数③登録日時の順 ----
  const entries = [
    { uid: "a", clearTimeMs: 5000, missCount: 1, achievedAt: 300 },
    { uid: "b", clearTimeMs: 4000, missCount: 3, achievedAt: 100 },
    { uid: "c", clearTimeMs: 4000, missCount: 1, achievedAt: 200 },
    { uid: "d", clearTimeMs: 4000, missCount: 1, achievedAt: 50 },
  ];
  const sorted = sortLeaderboardEntries(entries);
  assertEqual(
    sorted.map((entry) => entry.uid),
    ["d", "c", "b", "a"],
    "①クリアタイム昇順②ミス数昇順③登録日時昇順の順で並び替えられる"
  );
  assertEqual(entries.map((entry) => entry.uid), ["a", "b", "c", "d"], "sortLeaderboardEntriesは元の配列を変更しない");

  // ---- 順位検索 ----
  assertEqual(findRankByUid(sorted, "b"), 3, "並び替え後の配列からuidの順位（1始まり）を取得できる");
  assertEqual(findRankByUid(sorted, "not-in-list"), null, "圏外のuidはnullを返す");

  // ---- ランキング登録候補の妥当性検証（2026-08-16改訂：ルールを問わず、ミス0のみ有効） ----
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: 0 }), true, "ミス0の正常な記録は有効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: 1 }), false, "1問でも間違えていれば無効（ルール問わず）");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: 4 }), false, "ミスが複数あっても同様に無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 0, missCount: 0 }), false, "0秒は不正な記録として無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: -100, missCount: 0 }), false, "負のタイムは無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: NaN, missCount: 0 }), false, "NaNのタイムは無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: -1 }), false, "負のミス数は無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: NaN }), false, "NaNのミス数は無効");

  // ---- 履歴からの最速記録抽出（バックフィル用、2026-08-07新設、2026-08-16に
  //      ルール・カテゴリー別の抽出へ拡張） ----
  const historyEntries = [
    {
      variant: "intro",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "all",
      totalElapsedMs: 8000,
      missCount: 2,
      completed: true,
    }, // ミスありなので対象外
    {
      variant: "intro",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "all",
      totalElapsedMs: 6000,
      missCount: 0,
      completed: true,
    },
    {
      variant: "intro",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "all",
      totalElapsedMs: 9000,
      missCount: 0,
      completed: false,
    }, // LOVE連チャン失敗（completed:false）、対象外
    {
      variant: "intro",
      rule: "normal",
      questionCountValue: "5",
      categoryFilterValue: "all",
      totalElapsedMs: 4000,
      missCount: 0,
      completed: true,
    }, // 2026-08-16改訂：ノーマルでもミス0なら対象になる
    {
      variant: "intro",
      rule: "normal",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      totalElapsedMs: 3000,
      missCount: 0,
      completed: true,
    }, // カテゴリーが違うので上のノーマル記録とは別枠
    {
      variant: "randomPlayback",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "all",
      totalElapsedMs: 7000,
      missCount: 1,
      completed: true,
    }, // ミスありなので対象外
    {
      rule: "loveChain",
      questionCountValue: "10",
      categoryFilterValue: "all",
      totalElapsedMs: 15000,
      missCount: 0,
      completed: true,
    }, // variant省略はintro扱い
  ];
  const bestEntries = findBestEntryPerVariantRuleQuestionCountAndCategory(historyEntries);
  assertEqual(
    bestEntries.length,
    4,
    "variant×rule×questionCount×categoryの組み合わせごとに、ミス0で完走した記録だけが1件ずつ抽出される"
  );

  const introLoveChainFive = bestEntries.find(
    (e) => e.variant === "intro" && e.rule === "loveChain" && e.questionCountValue === "5"
  );
  assertEqual(introLoveChainFive.clearTimeMs, 6000, "同じ組み合わせの中で最速のミス0記録が採用される");

  const introNormalFiveAll = bestEntries.find(
    (e) => e.variant === "intro" && e.rule === "normal" && e.categoryFilterValue === "all"
  );
  assertEqual(introNormalFiveAll.clearTimeMs, 4000, "ノーマルでもミス0の完走記録はバックフィル対象になる");

  const introNormalFiveTitleTrack = bestEntries.find(
    (e) => e.variant === "intro" && e.rule === "normal" && e.categoryFilterValue === "title-track"
  );
  assertEqual(introNormalFiveTitleTrack.clearTimeMs, 3000, "カテゴリーが違えば別記録として抽出される");

  const randomFive = bestEntries.find((e) => e.variant === "randomPlayback");
  assertEqual(randomFive, undefined, "ミスがある記録（randomPlaybackの1件）はどのルールでも抽出されない");

  const introTen = bestEntries.find((e) => e.questionCountValue === "10");
  assertEqual(introTen.variant, "intro", "entry.variant省略（古い履歴データ）はintroとして扱われる");
  assertEqual(introTen.clearTimeMs, 15000, "10問の記録も正しく抽出される");
}
