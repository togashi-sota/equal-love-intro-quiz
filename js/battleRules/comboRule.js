// 歌詞クイズ オンライン対戦「コンボルール」。
//
// クラシックと同じく全員が毎回回答できるが、正解を連続させるほど個人ごとの
// 得点倍率が上がる。コンボは各プレイヤー個別に管理し、他人の回答（正解・不正解・
// コンボ数）には一切影響されない（設計⑥1-c章）。
//
// 【コンボの持ち方について】このファイルの関数は状態を持たない純粋関数のため、
// 「直前までのコンボ数」は呼び出し元が comboCountByUid として毎回渡し、
// 返り値の nextComboCount を次回の comboCountByUid として使い回す設計にしている
// （問題を順番に処理していく呼び出し元がコンボの推移を管理する）。
//
// 【設計⑪②・配点/倍率テーブルはFirebaseへ保存しない】DEFAULT_HINT_POINT_TABLE・
// DEFAULT_COMBO_MULTIPLIER_TABLEはこのファイル内部の定数として直接使う
// （settings.pointTable/comboMultiplierTableのような外部注入はしない）。
// 詳細はjs/battleRules/classicRule.jsの同じ趣旨のコメントを参照。

import {
  DEFAULT_HINT_POINT_TABLE,
  DEFAULT_COMBO_MULTIPLIER_TABLE,
  DEFAULT_HINT_INTERVAL_SEC,
  MAX_HINT_LEVEL,
  ANSWER_POOL_SIZE_ALL_MODES,
  HINT_INTERVAL_SETTINGS_FIELD,
  deriveAnswerOutcome,
  computeResponseMs,
  getComboMultiplier,
  validateHintIntervalSec,
} from "./sharedDefaults.js";

export const ruleId = "combo";
// 配点・倍率テーブル・タイブレーク順など、採点方法に影響する変更をしたら必ず1つ上げること（設計⑩③）。
export const ruleVersion = 1;
export const label = "コンボ";
export const description = "正解を連続させるほど、得点倍率が上がります。";

export const allowedAnswerPoolSizes = ANSWER_POOL_SIZE_ALL_MODES;

export function defaultSettings() {
  return { hintIntervalSec: DEFAULT_HINT_INTERVAL_SEC };
}

export function validateSettings(settings) {
  if (!settings || typeof settings !== "object") return "設定が不正です。";
  return validateHintIntervalSec(settings.hintIntervalSec);
}

// comboCountByUid: { [uid]: 直前までのコンボ数（この問題を数える前の値） }
// 返り値のnextComboCountは「この問題を反映した後」のコンボ数。
export function resolveQuestionAnswers({ answersByUid, correctSongId, comboCountByUid, questionStartedAt, settings }) {
  const outcomesByUid = {};
  for (const [uid, answer] of Object.entries(answersByUid)) {
    const outcome = deriveAnswerOutcome(correctSongId, answer.selectedSongId);
    const responseMs = computeResponseMs({
      submittedAt: answer.submittedAt,
      questionStartedAt,
      hintLevel: answer.hintLevel,
      hintIntervalSec: settings.hintIntervalSec,
    });
    const comboBefore = comboCountByUid[uid] ?? 0;
    const nextComboCount = outcome === "correct" ? comboBefore + 1 : 0;
    const basePoints = outcome === "correct" ? (DEFAULT_HINT_POINT_TABLE[answer.hintLevel] ?? 0) : 0;
    const multiplier = getComboMultiplier(nextComboCount, DEFAULT_COMBO_MULTIPLIER_TABLE);

    outcomesByUid[uid] = {
      outcome,
      hintLevel: answer.hintLevel,
      responseMs,
      pointsAwarded: Math.round(basePoints * multiplier),
      wonQuestion: false,
      nextComboCount,
    };
  }
  return outcomesByUid;
}

// 全参加者が回答済み、またはヒント4の受付時間が終われば問題終了（classicRuleと同じ）。
export function shouldEndQuestion({ answersByUid, allPlayerUids, questionStartedAt, nowMs, settings }) {
  const allAnswered = allPlayerUids.every((uid) => uid in answersByUid);
  const deadlineMs = questionStartedAt + MAX_HINT_LEVEL * settings.hintIntervalSec * 1000;
  return allAnswered || nowMs >= deadlineMs;
}

// questionOutcomesは出題順に並んでいる前提（nextComboCountの推移をそのまま
// currentCombo／maxComboの算出に使うため、順序が重要）。
// skippedCountはmissCountと別集計（js/battleRules/classicRule.jsのaggregateResult()の
// コメント参照：選んで間違えた場合と時間切れ未回答は別のoutcome値として扱う設計）。
export function aggregateResult(questionOutcomes) {
  let totalPoints = 0;
  let currentCombo = 0;
  let maxCombo = 0;
  let totalHintsUsed = 0;
  let totalElapsedMs = 0;
  let missCount = 0;
  let skippedCount = 0;
  let correctCount = 0;

  for (const outcome of questionOutcomes) {
    totalPoints += outcome.pointsAwarded;
    totalHintsUsed += outcome.hintLevel;
    totalElapsedMs += outcome.responseMs;
    currentCombo = outcome.nextComboCount;
    if (currentCombo > maxCombo) maxCombo = currentCombo;
    if (outcome.outcome === "correct") {
      correctCount += 1;
    } else if (outcome.outcome === "wrongAnswer") {
      missCount += 1;
    } else if (outcome.outcome === "skipped") {
      skippedCount += 1;
    }
  }

  return {
    ruleVersion,
    completed: true,
    common: { elapsedMs: totalElapsedMs, correctCount, missCount },
    detail: { totalPoints, currentCombo, maxCombo, totalHintsUsed, totalElapsedMs, missCount, skippedCount, correctCount },
  };
}

// タイブレーク順：①合計ポイント②最大コンボ③ミス数④総使用ヒント数⑤総回答時間
// （本人の指示により確定。コンボを維持できる人ほどミスが少ないゲーム性のため、
// ヒント使用数より先にミス数を評価する。回答時間は通信遅延の影響も含むため最後）。
export function compareResults(resultA, resultB) {
  const a = resultA.detail;
  const b = resultB.detail;
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  if (a.maxCombo !== b.maxCombo) return b.maxCombo - a.maxCombo;
  if (a.missCount !== b.missCount) return a.missCount - b.missCount;
  if (a.totalHintsUsed !== b.totalHintsUsed) return a.totalHintsUsed - b.totalHintsUsed;
  return a.totalElapsedMs - b.totalElapsedMs;
}

export function getRuleDescription() {
  return "正解を連続させるほど得点倍率が上がります（不正解・スキップでコンボは0に戻ります）。ポイント合計、同点時は最大コンボ→使用ヒント数→回答時間→ミス数の順で順位が決まります。";
}

// 【Phase6.5新設】コンボには奪い取りclaimの概念が無いため、常に回答ログだけを送る
// （js/battleRules/classicRule.jsの同名関数と同じ趣旨）。
export function getAnswerSubmissionPlan() {
  return { submitAnswer: true, submitWinnerClaim: false };
}

// 【Phase6.5新設】対戦中HUDの「現在倍率」表示用。配点・倍率テーブル自体は
// このファイルの外へは出さず（設計⑪②）、「今のコンボ数なら倍率いくつか」という
// 結果の数値だけを返す窓口にする。
export function getComboMultiplierForCount(comboCount) {
  return getComboMultiplier(comboCount, DEFAULT_COMBO_MULTIPLIER_TABLE);
}

export const settingsFields = [HINT_INTERVAL_SETTINGS_FIELD];

export const hudFields = [
  { key: "totalPoints", label: "総ポイント" },
  { key: "currentCombo", label: "現在コンボ" },
  { key: "maxCombo", label: "最大コンボ" },
  { key: "currentMultiplier", label: "現在倍率" },
];

export const resultColumns = [
  { key: "totalPoints", label: "獲得ポイント" },
  { key: "maxCombo", label: "最大コンボ" },
  { key: "totalHintsUsed", label: "使用ヒント数" },
  { key: "skippedCount", label: "未回答" },
];
