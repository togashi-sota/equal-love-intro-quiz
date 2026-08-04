// オンライン対戦の「タイムアタック」モード用アダプター。
// 既存のオフライン対戦（js/localBattle.js・js/localBattleResult.js）のロジックを
// そのまま再利用し、js/battleModes/index.jsが定義する共通インターフェースに合わせて
// 薄くラップしているだけ。実際の出題・順位判定ロジックはここでは持たない。
//
// 【設計方針】このファイルが「タイムアタックモードならではの部分」を全部持つことで、
// js/onlineBattleScreen.js側はgameMode名を意識せず、js/battleModes/index.js経由の
// 共通関数だけを呼べばよい状態にしている（将来ランダム再生・歌詞クイズを追加するときも、
// 同じ形のファイルを1つ増やし、index.jsの登録簿に加えるだけで済む）。

import { buildBattleQuestions, validateBattleConfig, PENALTY_SECONDS_VALUES } from "../localBattle.js";
import { computeNormalFinalRecordMs } from "../localBattleResult.js";

export const gameMode = "timeAttack";
export const label = "タイムアタック";

// ロビー画面のホスト用設定フォームが最初に表示する既定値。
export function defaultSettings() {
  return { questionCountValue: "5", categoryFilterValue: "title-track", rule: "normal", penaltySeconds: 2 };
}

// 設定が実際に出題できる内容か検証する。問題なければnull、問題があればエラー文言を返す。
export function validateSettings(settings) {
  return validateBattleConfig({ categoryFilterValue: settings.categoryFilterValue });
}

// seed・settingsから、全端末で完全に一致する問題セットを組み立てる。
export function buildQuestions({ seed, settings }) {
  return buildBattleQuestions({
    seed,
    questionCountValue: settings.questionCountValue,
    categoryFilterValue: settings.categoryFilterValue,
  });
}

// 1人分のプレイ結果を、共通部分（elapsedMs・correctCount・missCount）と
// モード固有部分（reachedQuestionNumber：LOVE連チャンの途中終了時の到達問題数）に分けて格納する。
// 【Step3で使用予定】Step2では出題・回答画面を実装していないため、まだ呼び出されない。
export function createResult({ correctCount, missCount, totalElapsedMs, completed, reachedQuestionNumber }) {
  return {
    completed,
    common: { elapsedMs: totalElapsedMs, correctCount, missCount },
    detail: { reachedQuestionNumber: reachedQuestionNumber ?? null },
  };
}

// 2人分の結果を比較する（js/localBattleResult.jsの非公開compareResults()と同じ判定基準）。
// 戻り値がマイナスならresultAが上位。settingsのrule・penaltySecondsを見て判定を切り替える。
// 【Step3で使用予定】Step2ではまだ呼び出されない。
export function compareResults(resultA, resultB, settings) {
  const a = resultA.common;
  const b = resultB.common;

  if (settings.rule === "loveChain") {
    if (resultA.completed !== resultB.completed) return resultA.completed ? -1 : 1;
    const reachedA = resultA.detail.reachedQuestionNumber ?? 0;
    const reachedB = resultB.detail.reachedQuestionNumber ?? 0;
    if (!resultA.completed && reachedA !== reachedB) return reachedB - reachedA;
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
    return a.missCount - b.missCount;
  }

  if (settings.rule === "hard") {
    if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
    return a.missCount - b.missCount;
  }

  // ノーマル：ミスペナルティ込みの最終記録で比較する。
  const finalA = computeNormalFinalRecordMs({ totalElapsedMs: a.elapsedMs, missCount: a.missCount }, settings.penaltySeconds);
  const finalB = computeNormalFinalRecordMs({ totalElapsedMs: b.elapsedMs, missCount: b.missCount }, settings.penaltySeconds);
  if (finalA !== finalB) return finalA - finalB;
  return a.missCount - b.missCount;
}

// ロビー画面・ルール確認等で表示する、勝敗条件の短い案内文。
const RULE_WIN_CONDITION_HINTS = {
  hard: "正解数が多い人が上位。同点の場合はタイムで決まります",
  loveChain: "全問クリアを目指します。失敗時は到達問題数で競います",
};

export function getRuleDescription(settings) {
  if (settings.rule === "normal") {
    return `ミス1回につき+${settings.penaltySeconds}秒。ペナルティ込みの記録で競います`;
  }
  return RULE_WIN_CONDITION_HINTS[settings.rule] ?? "";
}

export { PENALTY_SECONDS_VALUES };
