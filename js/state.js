// ゲーム全体の「状態」をひとまとめに管理するファイル。
// フレームワークを使わないので、gameState という1つのオブジェクトに全部の情報を持たせ、
// 状態を変えたいときは必ずこのファイルの関数を通して変更する、というルールにする。

export const gameState = {
  screen: "start",               // "start" | "quiz" | "result"
  questions: [],                 // このプレイで出題する問題の配列（{ song, choices } の形）
  currentIndex: 0,               // 今何問目か（0始まり）
  score: 0,                      // 合計得点
  answerLog: [],                 // 結果画面で使う、1問ごとの回答記録
  elapsedSec: 0,                 // 出題開始からの経過秒数（上限なしで数え上げる）
  timerId: null,                 // setIntervalのID（止めるときに使う）
  isAnswered: false,             // 今の問題にすでに回答済みかどうか
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
}

// 生成済みの問題配列を受け取ってクイズを開始する。
export function startQuiz(questions) {
  gameState.questions = questions;
  gameState.currentIndex = 0;
  gameState.score = 0;
  gameState.answerLog = [];
  gameState.screen = "quiz";
}

// 今出題中の問題（{ song, choices }）を取得する。
export function getCurrentQuestion() {
  return gameState.questions[gameState.currentIndex];
}

// 回答結果を記録し、得点を加算する。
export function recordAnswer(isCorrect, pointsEarned) {
  const question = getCurrentQuestion();
  gameState.answerLog.push({
    song: question.song,
    isCorrect,
    pointsEarned,
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
