// js/timeAttackLeaderboard.js（Firebaseに一切触れない純粋関数群）のテスト。
import {
  buildLeaderboardPath,
  buildLeaderboardEntryPayload,
  isBetterLeaderboardRecord,
  normalizeLeaderboardEntry,
  sortLeaderboardEntries,
  findRankByUid,
  findBestEntryPerVariantAndQuestionCount,
} from "../js/timeAttackLeaderboard.js";
import { assertEqual } from "./test-utils.js";

export function runTimeAttackLeaderboardTests() {
  // ---- パス組み立て：variant×questionCountで完全に分離される ----
  assertEqual(
    buildLeaderboardPath("intro", "5"),
    "timeAttackLeaderboards/intro/5",
    "introの5問はintro/5のパスになる"
  );
  assertEqual(
    buildLeaderboardPath("randomPlayback", "50"),
    "timeAttackLeaderboards/randomPlayback/50",
    "ランダム再生の50問は別のパスになる（introの50問とは混ざらない）"
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

  // ---- 履歴からの最速記録抽出（バックフィル用、2026-08-07追加） ----
  const historyEntries = [
    { variant: "intro", questionCountValue: "5", totalElapsedMs: 8000, missCount: 2, completed: true },
    { variant: "intro", questionCountValue: "5", totalElapsedMs: 6000, missCount: 0, completed: true },
    { variant: "intro", questionCountValue: "5", totalElapsedMs: 9000, missCount: 0, completed: false }, // LOVE連チャン失敗、対象外
    { variant: "randomPlayback", questionCountValue: "5", totalElapsedMs: 7000, missCount: 1, completed: true },
    { questionCountValue: "10", totalElapsedMs: 15000, missCount: 3, completed: true }, // variant省略はintro扱い
  ];
  const bestEntries = findBestEntryPerVariantAndQuestionCount(historyEntries);
  assertEqual(bestEntries.length, 3, "variant×questionCountの組み合わせごとに1件だけ抽出される");
  const introFive = bestEntries.find((e) => e.variant === "intro" && e.questionCountValue === "5");
  assertEqual(introFive.clearTimeMs, 6000, "同じ組み合わせの中で最速の記録が採用される");
  assertEqual(introFive.missCount, 0, "採用された記録のmissCountが正しく引き継がれる");
  const randomFive = bestEntries.find((e) => e.variant === "randomPlayback" && e.questionCountValue === "5");
  assertEqual(randomFive.clearTimeMs, 7000, "variantが違えば別記録として抽出される");
  const introTen = bestEntries.find((e) => e.variant === "intro" && e.questionCountValue === "10");
  assertEqual(introTen.clearTimeMs, 15000, "entry.variant省略（古い履歴データ）はintroとして扱われる");
}
