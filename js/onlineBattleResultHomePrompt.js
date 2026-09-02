// 「結果画面から⌂ホームへ戻る」の確認モーダルを、4つの結果画面（js/onlineBattleScreen.js・
// js/onlineLyricsQuizBattleScreen.js・js/onlineInstantBattleScreen.js・
// js/onlineInstantCoopBattleScreen.js）で安全に共有するための小さな仲介モジュール
// （2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド。ゲストの「ホームへ戻る」に
// 二重確認を入れる）。
//
// js/onlineBattleResultLeavePrompt.js・js/onlineBattleLobbyReturnPrompt.js・
// js/onlineBattleLeaveMatchPrompt.jsと全く同じ設計方針（循環importを避けるための
// 末端モジュール。1つのモーダルDOMを、呼び出し元ごとにonConfirmコールバックだけ
// 差し替えて使い回す）。

import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null; // { modal, cancelButton, confirmButton }
let onConfirmCallback = null;

export function initResultHomePrompt(newElements) {
  elements = newElements;
  elements.cancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    elements.modal.hidden = true;
    onConfirmCallback = null;
  });
  elements.modal.addEventListener("click", (event) => {
    if (event.target !== elements.modal) return;
    elements.modal.hidden = true;
    onConfirmCallback = null;
  });
  elements.confirmButton.addEventListener("click", () => {
    if (!onConfirmCallback) return;
    playSfx(SFX_EVENTS.UI_CONFIRM);
    const callback = onConfirmCallback;
    onConfirmCallback = null;
    elements.modal.hidden = true;
    callback();
  });
}

// 各結果画面の「⌂ ホームへ戻る」ボタンから呼ぶ。onConfirm：実際に画面を切り替える
// 同期処理（Firebaseの状態には触れない、ローカルのnavigateTo()呼び出しだけの想定）。
export function promptResultGoHome(onConfirm) {
  if (!elements) return;
  onConfirmCallback = onConfirm;
  elements.modal.hidden = false;
}
