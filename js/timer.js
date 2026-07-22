// 出題開始からの経過秒数をカウントアップするタイマー。
// 制限時間による強制終了は行わず、プレイヤーが自分で
// 「回答する」「スキップする」「答えを見る」のいずれかを選ぶまで数え続ける。

import { gameState } from "./state.js";

// タイマーを開始する。
// onTick : 1秒経過するたびに、その時点の経過秒数を渡して呼ばれる
export function startTimer(onTick) {
  gameState.elapsedSec = 0;
  onTick(gameState.elapsedSec);

  gameState.timerId = setInterval(() => {
    gameState.elapsedSec += 1;
    onTick(gameState.elapsedSec);
  }, 1000);
}

// タイマーを止める。回答・スキップが確定した瞬間や画面遷移時に必ず呼ぶ。
export function stopTimer() {
  clearInterval(gameState.timerId);
  gameState.timerId = null;
}
