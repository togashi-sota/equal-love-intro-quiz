// 歌詞クイズ オンライン対戦「奪い取りルール」。
//
// 最初に正解した1人だけが、その問題のポイントを獲得する早押し系ルール。
// 他人の所持ポイントを直接減らすのではなく、「その問題を奪い取る」という意味
// （設計⑥1-b章）。MVPでは選択肢の多さが勝敗に影響しすぎないよう、
// 回答方式を4択・10択のみに制限する（設計⑧④）。
//
// 【重要：winnerの正当性はここで必ず検算する】Firebaseのセキュリティルールは
// 「本当に正解したか」までは検証できない（改造クライアントが偽ってclaimする可能性は
// 排除できない、設計⑨①）。そのため、winner候補として渡された人の実際の回答
// （answersByUid[winner.uid]）を、この関数の中で正解songIdと必ず照合し直す。
// 照合の結果、実は不正解だった場合はその問題を「誰にも得点を与えない」扱いにする
// （write-onceのため、正しい勝者に書き換えることはできないため）。
//
// 【設計⑪②・配点テーブルはFirebaseへ保存しない】DEFAULT_HINT_POINT_TABLEは
// このファイル内部の定数として直接使う（settings.pointTableのような外部注入はしない）。
// 詳細はjs/battleRules/classicRule.jsの同じ趣旨のコメントを参照。

import {
  DEFAULT_HINT_POINT_TABLE,
  DEFAULT_HINT_INTERVAL_SEC,
  MAX_HINT_LEVEL,
  ANSWER_POOL_SIZE_QUICK_ONLY,
  HINT_INTERVAL_SETTINGS_FIELD,
  deriveAnswerOutcome,
  computeResponseMs,
  validateHintIntervalSec,
} from "./sharedDefaults.js";

export const ruleId = "steal";
// 配点・勝者確定条件など、採点方法に影響する変更をしたら必ず1つ上げること（設計⑩③）。
export const ruleVersion = 1;
export const label = "奪い取り";
export const description = "最初に正解した1人だけが、その問題のポイントを獲得します。";

// MVPでは4択・10択のみ許可（設計⑧④）。将来ここに30・50・"all"を足すだけで解放できる。
export const allowedAnswerPoolSizes = ANSWER_POOL_SIZE_QUICK_ONLY;

export function defaultSettings() {
  return { hintIntervalSec: DEFAULT_HINT_INTERVAL_SEC };
}

export function validateSettings(settings) {
  if (!settings || typeof settings !== "object") return "設定が不正です。";
  return validateHintIntervalSec(settings.hintIntervalSec);
}

// answersByUid: { [uid]: { selectedSongId, hintLevel, submittedAt } }
// winner: { uid, submittedAt } | null（questionClaims/{questionIndex}/winnerの生データ、
//   write-onceでサーバーが最初に受理した1件。まだ誰も奪い取っていなければnull）
//
// 返り値の形はclassicRuleと同じ（{ [uid]: { outcome, hintLevel, responseMs,
// pointsAwarded, wonQuestion, nextComboCount } }）。wonQuestion=trueになるのは
// 「winnerとして書き込まれ、かつ実際の回答が正解だった」人だけ（上記の検算）。
export function resolveQuestionAnswers({ answersByUid, correctSongId, winner, questionStartedAt, settings }) {
  const winnerAnswer = winner ? answersByUid[winner.uid] : null;
  const isWinnerActuallyCorrect =
    !!winnerAnswer && deriveAnswerOutcome(correctSongId, winnerAnswer.selectedSongId) === "correct";
  const confirmedWinnerUid = isWinnerActuallyCorrect ? winner.uid : null;

  const outcomesByUid = {};
  for (const [uid, answer] of Object.entries(answersByUid)) {
    const outcome = deriveAnswerOutcome(correctSongId, answer.selectedSongId);
    const responseMs = computeResponseMs({
      submittedAt: answer.submittedAt,
      questionStartedAt,
      hintLevel: answer.hintLevel,
      hintIntervalSec: settings.hintIntervalSec,
    });
    const wonQuestion = uid === confirmedWinnerUid;
    outcomesByUid[uid] = {
      outcome,
      hintLevel: answer.hintLevel,
      responseMs,
      pointsAwarded: wonQuestion ? (DEFAULT_HINT_POINT_TABLE[answer.hintLevel] ?? 0) : 0,
      wonQuestion,
      nextComboCount: 0,
    };
  }
  return outcomesByUid;
}

// winnerが確定した瞬間に終了。まだ確定していない場合は、全員が回答済み
// （＝もう誰も奪い取れる見込みがない）か、ヒント4の受付時間が終われば終了。
export function shouldEndQuestion({ answersByUid, winner, allPlayerUids, questionStartedAt, nowMs, settings }) {
  if (winner) return true;
  const allAnswered = allPlayerUids.every((uid) => uid in answersByUid);
  const deadlineMs = questionStartedAt + MAX_HINT_LEVEL * settings.hintIntervalSec * 1000;
  return allAnswered || nowMs >= deadlineMs;
}

// skippedCountはmissCountと別集計（js/battleRules/classicRule.jsのaggregateResult()の
// コメント参照：選んで間違えた場合と時間切れ未回答は別のoutcome値として扱う設計）。
export function aggregateResult(questionOutcomes) {
  let totalPoints = 0;
  let questionsWon = 0;
  let firstHintWinCount = 0;
  let wonElapsedMsTotal = 0;
  let missCount = 0;
  let skippedCount = 0;

  for (const outcome of questionOutcomes) {
    totalPoints += outcome.pointsAwarded;
    if (outcome.wonQuestion) {
      questionsWon += 1;
      wonElapsedMsTotal += outcome.responseMs;
      if (outcome.hintLevel === 1) firstHintWinCount += 1;
    }
    if (outcome.outcome === "wrongAnswer") missCount += 1;
    if (outcome.outcome === "skipped") skippedCount += 1;
  }

  return {
    ruleVersion,
    completed: true,
    common: { elapsedMs: wonElapsedMsTotal, correctCount: questionsWon, missCount },
    detail: { totalPoints, questionsWon, firstHintWinCount, wonElapsedMsTotal, missCount, skippedCount },
  };
}

// タイブレーク順：①総ポイント②獲得問題数③ヒント1での獲得数④獲得時の総回答時間⑤ミス数
export function compareResults(resultA, resultB) {
  const a = resultA.detail;
  const b = resultB.detail;
  if (a.totalPoints !== b.totalPoints) return b.totalPoints - a.totalPoints;
  if (a.questionsWon !== b.questionsWon) return b.questionsWon - a.questionsWon;
  if (a.firstHintWinCount !== b.firstHintWinCount) return b.firstHintWinCount - a.firstHintWinCount;
  if (a.wonElapsedMsTotal !== b.wonElapsedMsTotal) return a.wonElapsedMsTotal - b.wonElapsedMsTotal;
  return a.missCount - b.missCount;
}

export function getRuleDescription() {
  return "最初に正解した1人だけがポイントを獲得し、その問題は終了します。通信状況により、僅かな判定差が生じる場合があります。";
}

// 【Phase6.5新設】画面層が「回答を送信するときに何を送るか」をruleIdで分岐せずに
// 決められるようにする窓口（js/battleRules/index.jsのgetAnswerSubmissionPlan()経由）。
// 奪い取りルールだけ、正解だった場合に限り「勝者claim」も一緒に送る必要がある
// （js/lyricsQuizBattleFirebase.jsのsubmitLyricsQuizAnswerWithStealClaim()参照）。
// selectedSongId・correctSongIdだけを見て決める、採点そのものとは独立した判定。
export function getAnswerSubmissionPlan({ selectedSongId, correctSongId }) {
  const outcome = deriveAnswerOutcome(correctSongId, selectedSongId);
  return { submitAnswer: true, submitWinnerClaim: outcome === "correct" };
}

export const settingsFields = [HINT_INTERVAL_SETTINGS_FIELD];

// 【Phase6.5・本人指摘で見直し】「現在の問題の獲得ポイント」（currentQuestionPoints）は、
// 配点テーブルを画面層へ公開しないと計算できず、かつ「今答えたら何点か」という
// 予測的な意味合いが強く仕様として曖昧だったため、宣言自体を削除した（未実装のまま
// 「―」表示で残す状態を作らないため）。「直近の獲得者」（lastWinnerName）は、
// 画面層が確定済みのquestionClaims/{index}/winner.uidから表示名を引くだけで実現できるため
// 宣言を維持し、実値を表示する（js/onlineLyricsQuizBattleScreen.js参照）。
export const hudFields = [
  { key: "totalPoints", label: "総ポイント" },
  { key: "questionsWon", label: "獲得問題数" },
  { key: "lastWinnerName", label: "直近の獲得者" },
];

export const resultColumns = [
  { key: "totalPoints", label: "獲得ポイント" },
  { key: "questionsWon", label: "獲得問題数" },
  { key: "wonElapsedMsTotal", label: "獲得時の総回答時間" },
  { key: "skippedCount", label: "未回答" },
];
