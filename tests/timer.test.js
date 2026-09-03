// js/timer.js（クイズ画面の経過秒数タイマー）のテスト。
//
// 【2026-11-XX新設・実機バグ調査：アウトロ対戦のタイマーが1秒刻みでなく2〜3秒跳ぶ】
// 原因は、stopTimer()を挟まずstartTimer()を連続で呼ぶ経路（オンライン対戦で音源再生に
// 失敗し、同じ問題を再試行してrenderQuestion()をやり直す場合等）があり、以前の
// startTimer()は新しいintervalを張る前に古いintervalをclearしていなかったこと。
// 古いintervalが孤立したまま残り、1秒ごとに複数のintervalがelapsedSecを同時に
// インクリメントしてしまい、見た目上「2秒・3秒単位で飛ぶ」タイマー表示になっていた。
import { startTimer, stopTimer } from "../js/timer.js";
import { gameState } from "../js/state.js";
import { assertEqual } from "./test-utils.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runTimerTests() {
  // ---- 基本動作：1秒ごとに1ずつ増える ----
  {
    const ticks = [];
    startTimer((sec) => ticks.push(sec));
    assertEqual(ticks[0], 0, "startTimer()を呼んだ瞬間、経過0秒で1回目のonTickが呼ばれる");
    await sleep(1100);
    stopTimer();
    assertEqual(ticks.length, 2, "1.1秒待つ間に、開始時点＋1秒後の合計2回onTickが呼ばれる");
    assertEqual(ticks[1], 1, "1秒後のonTickは経過1秒を渡す");
  }

  // ---- 実機バグの再現条件：stopTimer()を挟まずstartTimer()を連続で呼ぶ ----
  // （オンライン対戦の音源再生失敗→同じ問題を再試行する経路を模している）
  {
    const ticks = [];
    startTimer((sec) => ticks.push(sec));
    // ここでstopTimer()を呼ばずに、もう一度startTimer()を呼ぶ（バグの再現条件そのもの）。
    startTimer((sec) => ticks.push(sec));
    await sleep(1100);
    stopTimer();
    // 修正前は、2つのintervalが同時にelapsedSecを増やすため、1秒後の時点で
    // gameState.elapsedSecが2（またはそれ以上）になってしまっていた。
    assertEqual(
      gameState.elapsedSec,
      1,
      "startTimer()を連続で呼んでも、古いintervalが必ず止まり、経過秒数は1秒あたり1ずつしか増えない"
    );
  }

  // ---- stopTimer()を呼べば、その後はintervalが動かない ----
  {
    const ticks = [];
    startTimer((sec) => ticks.push(sec));
    stopTimer();
    const countAfterStop = ticks.length;
    await sleep(1100);
    assertEqual(
      ticks.length,
      countAfterStop,
      "stopTimer()を呼んだ後は、1秒待ってもonTickが追加で呼ばれない（intervalが確実に止まっている）"
    );
  }

  // 後片付け：他のテストへタイマーを持ち越さない。
  stopTimer();
}
