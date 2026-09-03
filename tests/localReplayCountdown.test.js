// js/localReplayCountdown.js（一瞬バトル・一瞬協力・一瞬チャレンジ共通の3→2→1カウントダウン）
// のテスト。
//
// 【2026-11-XX新設・実機バグ調査：仕様総監査で発見】runLocalReplayCountdownForQuestion()の
// 「最初の問題だけ画面遷移アニメーション分（SCREEN_ENTER_ANIMATION_MS=480ms）待ってから
// 数え始める」setTimeoutが、以前はactiveTimerIdの管理外にあり、cancelLocalReplayCountdown()
// を呼んでもこの待機を打ち切れなかった。対戦を離脱した直後などにこの待機中だと、
// 古い問題向けのonComplete()（→音源再生）が遅れて発火しうる不具合だった。
import {
  runLocalReplayCountdown,
  runLocalReplayCountdownForQuestion,
  cancelLocalReplayCountdown,
  SCREEN_ENTER_ANIMATION_MS,
} from "../js/localReplayCountdown.js";
import { assertEqual } from "./test-utils.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockElements() {
  const containerElement = document.createElement("div");
  containerElement.hidden = true;
  const numberElement = document.createElement("p");
  return { containerElement, numberElement };
}

export async function runLocalReplayCountdownTests() {
  // ---- 最初の問題の画面遷移アニメーション待ち中のキャンセル ----
  {
    const { containerElement, numberElement } = createMockElements();
    let completeCallCount = 0;
    runLocalReplayCountdownForQuestion({ containerElement, numberElement, isFirstQuestion: true }, () => {
      completeCallCount++;
    });
    // 480ms経過する前（待機の途中）でキャンセルする。
    cancelLocalReplayCountdown();
    await sleep(SCREEN_ENTER_ANIMATION_MS + 200);
    assertEqual(completeCallCount, 0, "最初の問題の画面遷移待ち中にキャンセルすれば、待機後もonCompleteは呼ばれない");
    assertEqual(numberElement.textContent, "", "キャンセルされたので、カウントダウン自体（3→2→1の表示）も始まらない");
    assertEqual(containerElement.hidden, true, "キャンセルされたので、カウントダウンの表示領域も表示されないまま");
  }

  // ---- 最初の問題の画面遷移アニメーション待ちを、キャンセルしなければ最後まで進む ----
  {
    const { containerElement, numberElement } = createMockElements();
    let completeCallCount = 0;
    runLocalReplayCountdownForQuestion({ containerElement, numberElement, isFirstQuestion: true }, () => {
      completeCallCount++;
    });
    await sleep(SCREEN_ENTER_ANIMATION_MS + 3200); // 待機480ms＋3→2→1（1秒間隔）が終わるまで
    assertEqual(completeCallCount, 1, "キャンセルしなければ、待機後に通常どおりカウントダウンが進みonCompleteが呼ばれる");
    cancelLocalReplayCountdown(); // 後片付け（保険）。
  }

  // ---- 通常の3→2→1表示中のキャンセル（以前から動いていた挙動の回帰確認） ----
  {
    const { containerElement, numberElement } = createMockElements();
    let completeCallCount = 0;
    runLocalReplayCountdown({ containerElement, numberElement }, () => {
      completeCallCount++;
    });
    await sleep(200); // 「3」が表示された直後
    assertEqual(numberElement.textContent, "3", "カウントダウン開始直後は「3」が表示されている");
    cancelLocalReplayCountdown();
    await sleep(1200);
    assertEqual(completeCallCount, 0, "3→2→1表示中にキャンセルすれば、その後もonCompleteは呼ばれない");
  }

  // 後片付け：他のテストへタイマーを持ち越さない。
  cancelLocalReplayCountdown();
}
