// 「対戦中にホストがルーム設定へ戻る」の確認モーダルを、複数の対戦中画面
// （js/onlineBattleScreen.js・js/onlineLyricsQuizBattleScreen.js・
// js/onlineInstantBattleScreen.js・js/onlineInstantCoopBattleScreen.js）で
// 安全に共有するための小さな仲介モジュール（2026-09-05新設、本人指示：
// 「対戦中にルーム設定へ戻れるようにしてほしい」への対応）。
//
// 【なぜ独立したファイルにしたか】上記4つの画面ファイルは、それぞれが互いを
// 直接importしない設計方針（歌詞クイズ・一瞬バトル・一瞬協力それぞれの冒頭コメント
// 参照。循環importを避けるため）を取っている。しかし「ルーム設定へ戻る」の確認
// モーダル自体は、index.html上に1つだけ存在する共有DOM要素（誤操作防止のワン
// クッションを、対戦モードごとに4つ複製する必要が無いため）。この葉モジュール
// （他のどの画面ファイルもimportしない、末端のモジュール）を介することで、
// 循環importを一切発生させずに4画面から同じモーダルを安全に呼べるようにする。

import { returnRoomToLobby } from "./onlineBattle.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null; // { modal, cancelButton, confirmButton }
let pendingRoomId = null;
let isConfirmBusy = false;

// main.js側から一度だけ呼ぶ。モーダルのキャンセル／確定ボタンのイベント配線を行う。
export function initReturnToLobbyPrompt(newElements) {
  elements = newElements;
  elements.cancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    elements.modal.hidden = true;
    pendingRoomId = null;
  });
  elements.confirmButton.addEventListener("click", async () => {
    if (isConfirmBusy || !pendingRoomId) return;
    playSfx(SFX_EVENTS.UI_CONFIRM);
    // 通信遅延中の連打・二重イベントで何度も書き込みが飛ばないよう、処理中は無効化する
    // （returnRoomToLobby()自体も冪等だが、UI側でも素直に多重送信を防いでおく）。
    isConfirmBusy = true;
    elements.confirmButton.disabled = true;
    const roomId = pendingRoomId;
    await returnRoomToLobby({ roomId });
    isConfirmBusy = false;
    elements.confirmButton.disabled = false;
    elements.modal.hidden = true;
    pendingRoomId = null;
  });
}

// 各対戦中画面の「ルーム設定へ戻る」ボタンから呼ぶ。確認モーダルを開くだけで、
// 実際にFirebaseへ書き込むのは確定ボタンが押されたときだけ（誤操作防止）。
export function promptReturnToLobby(roomId) {
  if (!elements || !roomId) return;
  pendingRoomId = roomId;
  elements.modal.hidden = false;
}
