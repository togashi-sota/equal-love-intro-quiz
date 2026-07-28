// ゲーム全体の「状態」をひとまとめに管理するファイル。
// フレームワークを使わないので、gameState という1つのオブジェクトに全部の情報を持たせ、
// 状態を変えたいときは必ずこのファイルの関数を通して変更する、というルールにする。

export const gameState = {
  screen: "start",               // "start" | "quiz" | "result"
  questions: [],                 // このプレイで出題する問題の配列（{ song, choices } の形）
  currentIndex: 0,               // 今何問目か（0始まり）
  score: 0,                      // 合計得点
  answerLog: [],                 // 結果画面で使う、1問ごとの回答記録
  elapsedSec: 0,                 // 出題開始からの経過秒数（採点に使う。1秒単位で上限なしに数え上げる）
  timerId: null,                 // setIntervalのID（止めるときに使う）
  isAnswered: false,             // 今の問題にすでに回答済みかどうか
  answerTimerStartMs: null,      // 曲が実際に鳴り始めた時刻（performance.now()のミリ秒）。
                                  // 結果画面の回答時間表示・将来の記録機能用で、採点には使わない
  questionCountValue: null,      // 選択された出題数（"5" | "10" | "all"）。自己ベストを
                                  // モードごとに分けて保存するために結果画面まで持ち回す
  categoryFilterValue: null,     // 選択されたカテゴリ（"all" | "title-and-group" | "title-track"）。同上
};

// ゲームを最初の状態に戻す。リトライ時にも使う。
export function resetGameState() {
  gameState.screen = "start";
  gameState.questions = [];
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.elapsedSec = 0;
  gameState.timerId = null;
  gameState.isAnswered = false;
  gameState.answerTimerStartMs = null;
  gameState.questionCountValue = null;
  gameState.categoryFilterValue = null;
}

// 生成済みの問題配列を受け取ってクイズを開始する。
// questionCountValue・categoryFilterValueは、結果画面で自己ベストをモードごとに
// 分けて扱うために保持しておく（採点そのものには使わない）。
export function startQuiz(questions, questionCountValue, categoryFilterValue) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
  gameState.questionCountValue = questionCountValue;
  gameState.categoryFilterValue = categoryFilterValue;
  // 「もう一度挑戦する」はresetGameState()を経由せずここへ直接来るため、
  // 前回プレイ最後の回答済み状態が残らないよう、ここで確実にリセットする。
  gameState.isAnswered = false;
}

// 今出題中の問題（{ song, choices }）を取得する。
export function getCurrentQuestion() {
  return gameState.questions[gameState.currentIndex];
}

// 計測の起点を記録する。
// 曲の再生を試みる直前（暫定値。読み込みが一瞬で終わり、
// 「鳴り始めた瞬間」を待たずに超高速で回答された場合の保険）と、
// 曲が実際に鳴り始めた瞬間（audio.jsのplayingイベント。より正確な値で上書きする）の
// 2箇所から呼ばれる想定。
export function markPlaybackStarted() {
  gameState.answerTimerStartMs = performance.now();
}

// 曲が鳴り始めてから今までの経過ミリ秒を返す。
// 音源の再生に失敗するなどして計測が始まっていない場合は null を返す（＝時間データなし）。
export function getElapsedMsSincePlaybackStart() {
  if (gameState.answerTimerStartMs === null) return null;
  return performance.now() - gameState.answerTimerStartMs;
}

// 回答結果を記録し、得点を加算する。
// resultTypeは "correct" | "wrong" | "skip" | "reveal" の4種類。
// elapsedMsは結果画面の表示・プレイ履歴機能のためだけに使う値で、採点には影響しない。
export function recordAnswer(resultType, pointsEarned, elapsedMs) {
  const question = getCurrentQuestion();
  gameState.answerLog.push({
    song: question.song,
    resultType,
    pointsEarned,
    elapsedMs,
  });
  gameState.score += pointsEarned;
}

// 次の問題に進む。まだ問題が残っていれば true、全問終わっていれば false を返す。
export function advanceToNextQuestion() {
  gameState.currentIndex += 1;
  gameState.isAnswered = false;
  gameState.elapsedSec = 0;
  return gameState.currentIndex < gameState.questions.length;
}
