// 「対戦中にゲストが自分だけ途中離脱する」の確認モーダル配線と、離脱状態の共有を、
// 複数の対戦中画面（js/onlineBattleScreen.js・js/onlineLyricsQuizBattleScreen.js・
// js/onlineInstantBattleScreen.js・js/onlineInstantCoopBattleScreen.js）で安全に共有する
// ための小さな仲介モジュール（2026-09-14新設、本人指示）。
//
// js/onlineBattleLobbyReturnPrompt.js（ホスト専用「ルーム設定へ戻る」、対戦全体を中断する）
// と全く同じ設計方針（循環importを避けるための末端モジュール）だが、こちらは意味が別物：
// ホスト側はroom全体のstatusを書き換えて全員を巻き込むのに対し、こちらは「この試合の、
// この人」だけに付く小さなフラグ（js/onlineBattle.jsのleaveMatchInProgress()）を立てる
// だけで、room.status・他の参加者には一切影響しない。

import { leaveMatchInProgress } from "./onlineBattle.js";

let elements = null; // { modal, cancelButton, confirmButton }
let pendingRoomId = null;
let pendingMatchId = null;
let onLeftCallback = null;
let isConfirmBusy = false;

// 【2026-09-14新設】「このプレイヤーが、今の試合(matchId)を自分の意思で途中離脱した」
// という状態。この端末だけのローカルな状態で、Firebaseには保存しない（Firebase側には
// leaveMatchInProgress()が別途leftDuringMatchフラグを書き込む）。room.statusが
// "playing"のままでも、この端末だけは対戦画面へ自動的に戻らないようにするためのガードに
// 使う（本人指示：離脱後は自動同期で対戦画面へ呼び戻さない）。新しい試合が始まって
// activeMatchIdが変われば、比較対象が変わるため自動的に無関係になる（明示的なリセットは
// 不要な設計）。
let voluntarilyLeftMatchId = null;

export function hasVoluntarilyLeftMatch(matchId) {
  return matchId != null && voluntarilyLeftMatchId === matchId;
}

// main.js側から一度だけ呼ぶ。モーダルのキャンセル／確定ボタンのイベント配線を行う。
export function initLeaveMatchPrompt(newElements) {
  elements = newElements;
  elements.cancelButton.addEventListener("click", () => {
    elements.modal.hidden = true;
    pendingRoomId = null;
    pendingMatchId = null;
    onLeftCallback = null;
  });
  elements.confirmButton.addEventListener("click", async () => {
    if (isConfirmBusy || !pendingRoomId || !pendingMatchId) return;
    isConfirmBusy = true;
    elements.confirmButton.disabled = true;
    const roomId = pendingRoomId;
    const matchId = pendingMatchId;
    const callback = onLeftCallback;
    await leaveMatchInProgress({ roomId, matchId });
    // 【安全側の判断】Firebase書き込みが失敗しても、本人が「戻る」を押した操作自体は
    // 尊重してローカルのナビゲーションは必ず行う（対戦画面に閉じ込められる事故を防ぐ）。
    // 書き込み失敗時はleftDuringMatchフラグが立たないため、途中退出としての履歴・
    // 順位除外は反映されない可能性があるが、その場合でも「対戦画面から出られない」より
    // 安全側に倒れる。
    voluntarilyLeftMatchId = matchId;
    isConfirmBusy = false;
    elements.confirmButton.disabled = false;
    elements.modal.hidden = true;
    pendingRoomId = null;
    pendingMatchId = null;
    onLeftCallback = null;
    callback?.();
  });
}

// 各対戦中画面の「ルーム設定へ戻る」（ゲスト用）ボタンから呼ぶ。
// onLeft：実際に離脱が確定した後、呼び出し元がローカルのナビゲーション（ロビー表示へ
// 戻す等）を行うためのコールバック（画面ごとに戻し方が違うため、ここでは行わない）。
export function promptLeaveMatch(roomId, matchId, onLeft) {
  if (!elements || !roomId || !matchId) return;
  pendingRoomId = roomId;
  pendingMatchId = matchId;
  onLeftCallback = onLeft;
  elements.modal.hidden = false;
}
