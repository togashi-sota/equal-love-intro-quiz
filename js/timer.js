// 出題開始からの経過秒数をカウントアップするタイマー。
// 制限時間による強制終了は行わず、プレイヤーが自分で
// 「回答する」「スキップする」「答えを見る」のいずれかを選ぶまで数え続ける。

import { gameState } from "./state.js";

// タイマーを開始する。
// onTick : 1秒経過するたびに、その時点の経過秒数を渡して呼ばれる
//
// 【2026-11-XX修正・実機バグ調査】呼び出し側がstopTimer()を挟まずstartTimer()を
// 連続で呼ぶ経路（オンライン対戦で音源再生に失敗し、同じ問題を再試行・差し替えて
// renderQuestion()をやり直す場合等）があり、その場合ここでclearIntervalしていないと
// 古いsetIntervalが孤立したまま残り、経過秒数が二重・三重にカウントアップされて
// タイマー表示が1秒刻みでなく2秒・3秒単位で飛ぶ不具合の原因になっていた。
// 新しいintervalを張る前に、必ず古いintervalを止める。
export function startTimer(onTick) {
  if (gameState.timerId) {
    clearInterval(gameState.timerId);
    gameState.timerId = null;
  }
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

// 【2026-09-05新設・本人指示：オフラインの簡易効果音設定パネル】stopTimer()と違い、
// gameState.elapsedSecを0へ戻さずに、そこから数え直しを再開する（「一時停止→再開」用）。
// パネルを開いている間はstopTimer()を呼んで止め（elapsedSecはそのまま残る）、
// 閉じたときにこちらを呼んで、止めていた値からそのままカウントアップを再開する。
// 既にintervalが動いている場合は何もしない（二重にsetIntervalを張らないための安全策、
// startTimer()冒頭の「古いintervalを必ず止める」対策と対になる考え方）。
export function resumeTimer(onTick) {
  if (gameState.timerId) return;
  gameState.timerId = setInterval(() => {
    gameState.elapsedSec += 1;
    onTick(gameState.elapsedSec);
  }, 1000);
}
