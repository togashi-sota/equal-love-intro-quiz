// js/normalQuizTimeScore.js のテスト（2026-08-29新設、本人指示の追加4）。
// 通常イントロクイズ専用の合計タイム自己ベストが、既存のjs/timeAttackScore.jsとは
// 完全に別のキーに保存され、混ざらないことを確認する。
import { getNormalQuizTimeBest, saveNormalQuizTimeBestIfBetter } from "../js/normalQuizTimeScore.js";
import { saveTimeAttackBestIfBetter, getTimeAttackBest } from "../js/timeAttackScore.js";
import { assertEqual } from "./test-utils.js";

const NORMAL_KEY = "equalLoveIntroQuiz.normalQuizTimeBest.5.all";
const TIME_ATTACK_KEY = "equalLoveIntroQuiz.timeAttackBest.normal.5.all";

function cleanup() {
  [NORMAL_KEY, TIME_ATTACK_KEY].forEach((key) => localStorage.removeItem(key));
}

export function runNormalQuizTimeScoreTests() {
  cleanup();

  // ---- 記録が無い状態からの初回保存は常に保存される ----
  assertEqual(getNormalQuizTimeBest("5", "all"), null, "未保存なら記録なし（null）");
  assertEqual(saveNormalQuizTimeBestIfBetter(20000, "5", "all"), true, "初回保存は常に新記録扱い");
  assertEqual(getNormalQuizTimeBest("5", "all"), 20000, "保存した記録がそのまま読み出せる");

  // ---- 短くなったときだけ更新される ----
  assertEqual(saveNormalQuizTimeBestIfBetter(25000, "5", "all"), false, "遅いタイムは更新されない");
  assertEqual(getNormalQuizTimeBest("5", "all"), 20000, "更新されなかったので記録は20000のまま");
  assertEqual(saveNormalQuizTimeBestIfBetter(15000, "5", "all"), true, "速いタイムは更新される");
  assertEqual(getNormalQuizTimeBest("5", "all"), 15000, "更新後は15000になっている");

  // ---- 出題数・カテゴリーが違えば別記録として扱われる ----
  assertEqual(getNormalQuizTimeBest("10", "all"), null, "出題数が違えば別記録（未保存）");
  assertEqual(getNormalQuizTimeBest("5", "title-track"), null, "カテゴリーが違えば別記録（未保存）");

  // ---- タイムアタックの自己ベスト（同じ出題数・カテゴリー）とは完全に別のキーに保存され、混ざらない ----
  cleanup();
  saveTimeAttackBestIfBetter(9999, "normal", "5", "all");
  saveNormalQuizTimeBestIfBetter(7777, "5", "all");
  assertEqual(getTimeAttackBest("normal", "5", "all"), 9999, "タイムアタック側の記録は通常クイズ側の保存によって変化しない");
  assertEqual(getNormalQuizTimeBest("5", "all"), 7777, "通常クイズ側の記録はタイムアタック側の保存によって変化しない");
  assertEqual(
    localStorage.getItem(NORMAL_KEY) !== localStorage.getItem(TIME_ATTACK_KEY),
    true,
    "保存先のキー自体が完全に別物になっている（進め方のテンポが違う記録を混ぜない、本人指示）"
  );

  cleanup();
}
