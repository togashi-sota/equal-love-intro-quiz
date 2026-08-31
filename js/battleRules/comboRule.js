// 歌詞クイズ オンライン対戦「ポイントバトル」（旧名：コンボ）。
//
// 【2026-08-31全面改訂・本人指示】以前は「正解を連続させるほど倍率が上がるコンボ制」
// だったが、本人とChatGPTで整理し直し、コンボ（連続正解による倍率）の概念自体を撤廃した。
// 新仕様は、正解数バトルと同じ「ヒントを手動で開く」方式のうえで、開いたヒント段階が
// 早いほど高得点になる固定配点制（ヒント1で正解=+4pt・ヒント2=+3pt・ヒント3=+2pt・
// ヒント4=+1pt・不正解/わからない=+0pt）。不正解になっても、それまでに獲得した
// ポイントが減ることは無い（ポイントは加算されるだけ）。全問終了後の合計ポイントで
// 順位を決め、同点は同じ順位にする（回答時間などで無理に差をつけない）。
// ruleId（"combo"）・ruleVersionは内部値のため変更していない（本人指示どおり、内部値は
// 既存のまま維持して表示名だけ変更）。
//
// 【comboCountByUid・nextComboCountを残す理由】js/lyricsQuizMatchProgress.jsは
// 3ルール共通の状態としてcomboCountByUidを持ち回す設計になっている。ポイントバトルから
// コンボの概念を無くしても、この共通の状態管理の形（進行エンジン側）まで変更すると
// 影響範囲が広がるため、resolveQuestionAnswers()はnextComboCountを常に0で返すだけの
// 形にとどめ、進行エンジン側は無改造のまま安全に済ませている。

import {
  DEFAULT_HINT_POINT_TABLE,
  MANUAL_PROGRESS_QUESTION_TIMEOUT_MS,
  ANSWER_POOL_SIZE_ALL_MODES,
  deriveAnswerOutcome,
  computeElapsedSinceQuestionStart,
} from "./sharedDefaults.js";

export const ruleId = "combo";
// 配点・タイブレーク順など、採点方法に影響する変更をしたら必ず1つ上げること（設計⑩③）。
// 【2026-08-31・v1→v2】コンボ倍率を撤廃し、ヒント段階別の固定配点＋完全同順位方式に
// 変更したため上げた。
export const ruleVersion = 2;
export const label = "ポイントバトル";
export const description = "早いヒント段階で正解するほど高得点。ポイントは減りません。";

export const allowedAnswerPoolSizes = ANSWER_POOL_SIZE_ALL_MODES;

// 【2026-08-31改訂】ヒント表示時間はヒントを手動で開く方式になったため不要になった。
export function defaultSettings() {
  return {};
}

export function validateSettings() {
  return null;
}

// answersByUid: { [uid]: { selectedSongId, hintLevel, submittedAt } }
//   hintLevelは「回答した時点で本人が開いていたヒント段階」の自己申告値。配点は
//   このhintLevelをDEFAULT_HINT_POINT_TABLEに当てはめて決まる（正解の場合のみ）。
// 返り値の形は正解数バトルと同じ。nextComboCountは常に0（コンボの概念を撤廃したため）。
export function resolveQuestionAnswers({ answersByUid, correctSongId, questionStartedAt }) {
  const outcomesByUid = {};
  for (const [uid, answer] of Object.entries(answersByUid)) {
    const outcome = deriveAnswerOutcome(correctSongId, answer.selectedSongId);
    const responseMs = computeElapsedSinceQuestionStart({
      submittedAt: answer.submittedAt,
      questionStartedAt,
    });
    const pointsAwarded = outcome === "correct" ? (DEFAULT_HINT_POINT_TABLE[answer.hintLevel] ?? 0) : 0;

    outcomesByUid[uid] = {
      outcome,
      hintLevel: answer.hintLevel,
      responseMs,
      pointsAwarded,
      wonQuestion: false,
      nextComboCount: 0,
    };
  }
  return outcomesByUid;
}

// 全参加者が回答済み、または安全網のタイムアウトが来れば問題終了（classicRuleと同じ）。
export function shouldEndQuestion({ answersByUid, allPlayerUids, questionStartedAt, nowMs }) {
  const allAnswered = allPlayerUids.every((uid) => uid in answersByUid);
  const deadlineMs = questionStartedAt + MANUAL_PROGRESS_QUESTION_TIMEOUT_MS;
  return allAnswered || nowMs >= deadlineMs;
}

// questionOutcomesは出題順に並んでいる前提。
// 【2026-08-31改訂】コンボ（currentCombo・maxCombo）の集計を削除した
// （概念自体を撤廃したため）。ヒント段階別の正解数（firstHintCorrectCountのように
// 「ヒント1で何回正解したか」）は、獲得ポイントの内訳として参考になるため残す。
export function aggregateResult(questionOutcomes) {
  let totalPoints = 0;
  let firstHintCorrectCount = 0;
  let totalHintsUsed = 0;
  let totalElapsedMs = 0;
  let missCount = 0;
  let skippedCount = 0;
  let correctCount = 0;

  for (const outcome of questionOutcomes) {
    totalPoints += outcome.pointsAwarded;
    totalHintsUsed += outcome.hintLevel;
    totalElapsedMs += outcome.responseMs;
    if (outcome.outcome === "correct") {
      correctCount += 1;
      if (outcome.hintLevel === 1) firstHintCorrectCount += 1;
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
    detail: { totalPoints, firstHintCorrectCount, totalHintsUsed, totalElapsedMs, missCount, skippedCount, correctCount },
  };
}

// 【2026-08-31改訂・本人指示】「同点の場合に回答時間などで無理に順位を分けないでください」
// という明確な指示により、タイブレークを完全に撤廃した。合計ポイントだけで比較し、
// 同点なら0（＝同順位）を返す。
export function compareResults(resultA, resultB) {
  return resultB.detail.totalPoints - resultA.detail.totalPoints;
}

export function getRuleDescription() {
  return "早いヒント段階で正解するほど高得点です（ヒント1=4pt・ヒント2=3pt・ヒント3=2pt・ヒント4=1pt）。不正解でもそれまでのポイントは減りません。同点の場合は同じ順位になります。";
}

// 【Phase6.5新設】ポイントバトルには奪い取りclaimの概念が無いため、常に回答ログだけを送る
// （js/battleRules/classicRule.jsの同名関数と同じ趣旨）。
export function getAnswerSubmissionPlan() {
  return { submitAnswer: true, submitWinnerClaim: false };
}

// 【2026-08-31改訂】コンボ倍率の概念を撤廃したため、この窓口は常にnullを返す
// （js/battleRules/index.jsのgetComboMultiplierForCount()はnullを「このルールには無い
// 項目」として扱う設計のため、呼び出し側の改修は不要）。呼び出し元
// （js/onlineLyricsQuizBattleScreen.js）の「現在倍率」表示は、この改訂に合わせて
// 撤去した。
export function getComboMultiplierForCount() {
  return null;
}

// 【2026-08-31改訂】ヒント表示時間の選択が無くなったため空配列にした。
export const settingsFields = [];

// 【2026-08-31改訂・本人指示】対戦中は自分の現在ポイントだけを見せる方針のため、
// 「現在コンボ」「最大コンボ」「現在倍率」はいずれもHUDから外した
// （コンボの概念自体を撤廃したため、そもそも表示する値が無い）。
export const hudFields = [{ key: "totalPoints", label: "現在のポイント" }];

export const resultColumns = [
  { key: "totalPoints", label: "獲得ポイント" },
  { key: "firstHintCorrectCount", label: "ヒント1正解数" },
  { key: "totalHintsUsed", label: "使用ヒント数" },
  { key: "skippedCount", label: "わからない回数" },
];
