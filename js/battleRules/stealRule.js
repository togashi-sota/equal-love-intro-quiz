// 歌詞クイズ オンライン対戦「早押しバトル」（旧名：奪い取り）。
//
// 最初に正解した1人だけが、その問題のポイントを獲得する早押し系ルール。
// 他人の所持ポイントを直接減らすのではなく、「その問題を奪い取る」という意味
// （設計⑥1-b章）。MVPでは選択肢の多さが勝敗に影響しすぎないよう、
// 回答方式を4択・10択のみに制限する（設計⑧④）。
//
// 【2026-08-31全面改訂・本人指示】以前は「ヒント段階に応じた配点」だったが、
// ヒント自体を「歌詞の該当箇所が1文字ずつ表示される」方式に変更したため、配点も
// 段階に関係ない一律+1pt（不正解=0pt）に変更した。文字を1文字ずつ表示する処理は
// 画面層（js/onlineLyricsQuizBattleScreen.js）が経過時間から計算する表示専用の演出で、
// このファイル（採点ロジック）は一切関知しない。
// ruleId（"steal"）・ruleVersionは内部値のため変更していない（本人指示どおり、内部値は
// 既存のまま維持して表示名だけ変更）。
//
// 【重要：winnerの正当性はここで必ず検算する】Firebaseのセキュリティルールは
// 「本当に正解したか」までは検証できない（改造クライアントが偽ってclaimする可能性は
// 排除できない、設計⑨①）。そのため、winner候補として渡された人の実際の回答
// （answersByUid[winner.uid]）を、この関数の中で正解songIdと必ず照合し直す。
// 照合の結果、実は不正解だった場合はその問題を「誰にも得点を与えない」扱いにする
// （write-onceのため、正しい勝者に書き換えることはできないため）。
//
// 【不正解者は同じ問題に再挑戦できない】js/lyricsQuizMatchProgress.jsのrecordAnswer()が
// 「1人1回答（write-once）」を強制しているため、不正解の回答を1度送信した時点で、
// その問題にはもう回答できない（正解・不正解を問わず、同じ問題への2回目の回答は
// 既存の仕組みで既に拒否される）。この挙動を変える必要は無く、画面側で
// 「不正解になった後は選択肢を押せなくする／再挑戦できない旨を表示する」だけでよい。

import {
  MANUAL_PROGRESS_QUESTION_TIMEOUT_MS,
  ANSWER_POOL_SIZE_QUICK_ONLY,
  deriveAnswerOutcome,
  computeElapsedSinceQuestionStart,
} from "./sharedDefaults.js";

export const ruleId = "steal";
// 配点・勝者確定条件など、採点方法に影響する変更をしたら必ず1つ上げること（設計⑩③）。
// 【2026-08-31・v1→v2】配点方式（ヒント段階別→正解一律1pt）を変更したため上げた。
export const ruleVersion = 2;
export const label = "早押しバトル";
export const description = "最初に正解した1人だけが、その問題のポイントを獲得します。歌詞が1文字ずつ表示されます。";

// MVPでは4択・10択のみ許可（設計⑧④）。将来ここに30・50・"all"を足すだけで解放できる。
export const allowedAnswerPoolSizes = ANSWER_POOL_SIZE_QUICK_ONLY;

// 【2026-08-31改訂】ヒント表示時間はもう使わない（歌詞は1文字/秒の固定ペースで表示する
// 演出であり、設定で変えられる項目ではないため）。ルール固有の設定項目は無くなった。
export function defaultSettings() {
  return {};
}

export function validateSettings() {
  return null;
}

// answersByUid: { [uid]: { selectedSongId, hintLevel, submittedAt } }
//   hintLevelは早押しバトルでは採点に使わない自己申告値（結果画面には表示しない。
//   Firebase上のanswersスキーマを3ルール共通で保つための互換フィールドとして送信される）。
// winner: { uid, submittedAt } | null（questionClaims/{questionIndex}/winnerの生データ、
//   write-onceでサーバーが最初に受理した1件。まだ誰も奪い取っていなければnull）
//
// 返り値の形はclassicRuleと同じ（{ [uid]: { outcome, hintLevel, responseMs,
// pointsAwarded, wonQuestion, nextComboCount } }）。wonQuestion=trueになるのは
// 「winnerとして書き込まれ、かつ実際の回答が正解だった」人だけ（上記の検算）。
// pointsAwardedはwonQuestionがtrueなら常に1、それ以外は常に0。
export function resolveQuestionAnswers({ answersByUid, correctSongId, winner, questionStartedAt }) {
  const winnerAnswer = winner ? answersByUid[winner.uid] : null;
  const isWinnerActuallyCorrect =
    !!winnerAnswer && deriveAnswerOutcome(correctSongId, winnerAnswer.selectedSongId) === "correct";
  const confirmedWinnerUid = isWinnerActuallyCorrect ? winner.uid : null;

  const outcomesByUid = {};
  for (const [uid, answer] of Object.entries(answersByUid)) {
    const outcome = deriveAnswerOutcome(correctSongId, answer.selectedSongId);
    const responseMs = computeElapsedSinceQuestionStart({
      submittedAt: answer.submittedAt,
      questionStartedAt,
    });
    const wonQuestion = uid === confirmedWinnerUid;
    outcomesByUid[uid] = {
      outcome,
      hintLevel: answer.hintLevel,
      responseMs,
      pointsAwarded: wonQuestion ? 1 : 0,
      wonQuestion,
      nextComboCount: 0,
    };
  }
  return outcomesByUid;
}

// winnerが確定した瞬間に終了（正解者が出た時点で即座に問題を締め切り、全員へ結果を
// 見せる。本人指示：「正解者が出た瞬間にその問題は終了」）。まだ確定していない場合は、
// 全員が回答済み（＝もう誰も奪い取れる見込みがない）か、安全網のタイムアウトが
// 来れば終了する。
export function shouldEndQuestion({ answersByUid, winner, allPlayerUids, questionStartedAt, nowMs }) {
  if (winner) return true;
  const allAnswered = allPlayerUids.every((uid) => uid in answersByUid);
  const deadlineMs = questionStartedAt + MANUAL_PROGRESS_QUESTION_TIMEOUT_MS;
  return allAnswered || nowMs >= deadlineMs;
}

// skippedCountはmissCountと別集計（js/battleRules/classicRule.jsのaggregateResult()の
// コメント参照：選んで間違えた場合と時間切れ未回答は別のoutcome値として扱う設計）。
export function aggregateResult(questionOutcomes) {
  let totalPoints = 0;
  let questionsWon = 0;
  let wonElapsedMsTotal = 0;
  let missCount = 0;
  let skippedCount = 0;

  for (const outcome of questionOutcomes) {
    totalPoints += outcome.pointsAwarded;
    if (outcome.wonQuestion) {
      questionsWon += 1;
      wonElapsedMsTotal += outcome.responseMs;
    }
    if (outcome.outcome === "wrongAnswer") missCount += 1;
    if (outcome.outcome === "skipped") skippedCount += 1;
  }

  return {
    ruleVersion,
    completed: true,
    common: { elapsedMs: wonElapsedMsTotal, correctCount: questionsWon, missCount },
    detail: { totalPoints, questionsWon, wonElapsedMsTotal, missCount, skippedCount },
  };
}

// 【2026-08-31改訂・本人指示】「同点の場合に回答時間などで無理に順位を分けないでください」
// という明確な指示により、タイブレークを完全に撤廃した。合計ポイントだけで比較し、
// 同点なら0（＝同順位）を返す。
export function compareResults(resultA, resultB) {
  return resultB.detail.totalPoints - resultA.detail.totalPoints;
}

export function getRuleDescription() {
  return "歌詞が1文字ずつ表示され、最初に正解した1人だけがポイントを獲得します。不正解になった問題には再挑戦できません。同点の場合は同じ順位になります。";
}

// 【Phase6.5新設】画面層が「回答を送信するときに何を送るか」をruleIdで分岐せずに
// 決められるようにする窓口（js/battleRules/index.jsのgetAnswerSubmissionPlan()経由）。
// 早押しバトルだけ、正解だった場合に限り「勝者claim」も一緒に送る必要がある
// （js/lyricsQuizBattleFirebase.jsのsubmitLyricsQuizAnswerWithStealClaim()参照）。
// selectedSongId・correctSongIdだけを見て決める、採点そのものとは独立した判定。
export function getAnswerSubmissionPlan({ selectedSongId, correctSongId }) {
  const outcome = deriveAnswerOutcome(correctSongId, selectedSongId);
  return { submitAnswer: true, submitWinnerClaim: outcome === "correct" };
}

// 【2026-08-31改訂】ヒント表示時間の選択が無くなったため空配列にした。
export const settingsFields = [];

// 【2026-08-31改訂・本人指示】対戦中は自分の現在ポイントだけを見せる方針のため、
// 「直近の獲得者」（他プレイヤーの成功を知らせる情報）もHUDから外した
// （最終結果画面まで他プレイヤーの状況を見せない、という指示を厳密に適用した）。
export const hudFields = [{ key: "totalPoints", label: "現在のポイント" }];

export const resultColumns = [
  { key: "totalPoints", label: "獲得ポイント" },
  { key: "questionsWon", label: "獲得問題数" },
  { key: "wonElapsedMsTotal", label: "獲得時の総回答時間", unit: "ms" },
  { key: "skippedCount", label: "未回答" },
];
