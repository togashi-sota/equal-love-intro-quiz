// 「結果画面からルームを完全に退出する」の確認モーダルを、複数の対戦結果画面
// （js/onlineBattleScreen.js・js/onlineLyricsQuizBattleScreen.js・
// js/onlineInstantCoopBattleScreen.js）で安全に共有するための小さな仲介モジュール
// （2026-09-15新設、本人指示：ゲスト側の退出操作にも必ず確認ダイアログ）。
//
// js/onlineBattleLobbyReturnPrompt.js・js/onlineBattleLeaveMatchPrompt.jsと全く同じ
// 設計方針（循環importを避けるための末端モジュール）。ロビー画面の「ルームから退出」
// （js/onlineBattleScreen.js内、既存のlobbyLeaveConfirmModal）とは意図的に別のDOM・
// 別のリスナーにしている。既存のロビー離脱処理（isLeavingIntentionally等の細かい
// 状態管理を伴う）に手を加えると回帰のリスクがあるため、触れずに済ませるため。

let elements = null; // { modal, cancelButton, confirmButton }
let onConfirmCallback = null;
let isConfirmBusy = false;

export function initResultLeavePrompt(newElements) {
  elements = newElements;
  elements.cancelButton.addEventListener("click", () => {
    elements.modal.hidden = true;
    onConfirmCallback = null;
  });
  elements.modal.addEventListener("click", (event) => {
    if (event.target !== elements.modal) return;
    elements.modal.hidden = true;
    onConfirmCallback = null;
  });
  elements.confirmButton.addEventListener("click", async () => {
    if (isConfirmBusy || !onConfirmCallback) return;
    isConfirmBusy = true;
    elements.confirmButton.disabled = true;
    const callback = onConfirmCallback;
    onConfirmCallback = null;
    elements.modal.hidden = true;
    await callback();
    isConfirmBusy = false;
    elements.confirmButton.disabled = false;
  });
}

// 各結果画面の「ルームから退出」ボタンから呼ぶ。onConfirm：実際に退出処理を行う
// 非同期関数（各画面が既に持つelements.onLeaveRoomCompletely()相当を渡す想定）。
export function promptResultLeaveRoom(onConfirm) {
  if (!elements) return;
  onConfirmCallback = onConfirm;
  elements.modal.hidden = false;
}
