// js/timeAttackHistory.js のテスト。
// 2026-08-07追加：ランダム再生タイムアタックのvariant次元を履歴に追加した際の回帰防止テスト。
import { saveTimeAttackHistoryEntry, getTimeAttackHistoryEntries } from "../js/timeAttackHistory.js";
import { assertEqual } from "./test-utils.js";

const HISTORY_KEY = "equalLoveIntroQuiz.timeAttackHistory";

function buildBaseEntryInput(overrides) {
  return {
    rule: "normal",
    questionCountValue: "5",
    categoryFilterValue: "all",
    totalElapsedMs: 12345,
    correctCount: 5,
    missCount: 0,
    completed: true,
    failedAtQuestionNumber: null,
    isNewRecord: false,
    perQuestionResults: [],
    ...overrides,
  };
}

export function runTimeAttackHistoryTests() {
  localStorage.removeItem(HISTORY_KEY);

  // ---- variantを省略すると、"intro"として保存される（既存呼び出し元との後方互換） ----
  saveTimeAttackHistoryEntry(buildBaseEntryInput());
  const [entryWithoutVariant] = getTimeAttackHistoryEntries();
  assertEqual(entryWithoutVariant.variant, "intro", "variant省略時は'intro'として保存される");
  localStorage.removeItem(HISTORY_KEY);

  // ---- variantを明示すると、その値がそのまま保存される ----
  saveTimeAttackHistoryEntry(buildBaseEntryInput({ variant: "randomPlayback" }));
  const [entryWithVariant] = getTimeAttackHistoryEntries();
  assertEqual(entryWithVariant.variant, "randomPlayback", "指定したvariantがそのまま履歴に残る");

  localStorage.removeItem(HISTORY_KEY);
}
