// 1問あたり10秒のカウントダウンタイマーを担当するファイル。

import { gameState, TIME_LIMIT_SEC } from "./state.js";

// タイマーを開始する。
// onTick    : 1秒経過するたびに、その時点の残り秒数を渡して呼ばれる
// onTimeout : 残り時間が0になったときに1回だけ呼ばれる
export function startTimer(onTick, onTimeout) {
  gameState.remainingSec = TIME_LIMIT_SEC;
  gameState.isAnswered = false;
  onTick(gameState.remainingSec);

  gameState.timerId = setInterval(() => {
    gameState.remainingSec -= 1;
    onTick(gameState.remainingSec);

    if (gameState.remainingSec <= 0) {
      stopTimer();
      onTimeout();
    }
  }, 1000);
}

// タイマーを止める。回答が確定した瞬間・画面遷移時に必ず呼ぶ。
export function stopTimer() {
  clearInterval(gameState.timerId);
  gameState.timerId = null;
}
