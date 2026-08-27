// オンライン対戦の「お気に入りから選ぶ」「プレイリストから選ぶ」で、いきなり全曲一覧
// （js/onlineBattleSongPicker.js）を開くのではなく、まず「今選ばれている曲」だけを
// 確認できる共通の軽量モーダル（2026-08-28新設）。
//
// 【設計方針】js/onlineBattlePlaylistPicker.jsと同じ「.modal-overlayの表示/非表示を
// 切り替えるだけ」の軽量パターンを踏襲する。js/onlineBattleScreen.js（イントロ対戦・
// ランダム再生対戦）とjs/onlineLyricsQuizBattleScreen.js（歌詞クイズ対戦）の両方が、
// お互いを一切importせずにこの共有部品だけを使う（gameModeを一切意識しない）。
//
// 【役割分担】この部品は「曲を確認して、決定するか・もっと選ぶか」を選ぶ画面に徹し、
// 実際にFirebaseへ書き込む処理・全曲選択画面を開く処理はいずれも呼び出し側
// （onConfirm/onAddMoreコールバック）に任せる。

import { SONGS } from "./data/songs.js";

let elements = null;
let onConfirmCallback = null;
let onAddMoreCallback = null;

function closeModal() {
  elements.overlay.hidden = true;
}

export function initOnlineBattleSongListConfirmModal(newElements) {
  elements = newElements;
  elements.closeButton.addEventListener("click", closeModal);
  // 背景（オーバーレイ自身）をクリックしたときも閉じる（他の軽量モーダルと同じ考え方）。
  elements.overlay.addEventListener("click", (event) => {
    if (event.target === elements.overlay) closeModal();
  });
  elements.confirmButton.addEventListener("click", () => {
    closeModal();
    onConfirmCallback?.();
  });
  elements.addMoreButton.addEventListener("click", () => {
    closeModal();
    onAddMoreCallback?.();
  });
}

// title・subtitle：見出しと補足文（例：「⭐ お気に入りから選ぶ」「お気に入りから選ばれている
//   曲はこの曲です」）。
// songIds：表示する曲id配列（呼び出し側が既に必要な絞り込み〈お気に入り・プレイリスト・
//   共通曲〉を済ませたものを渡す。この部品自体は絞り込みを一切行わない）。
// onConfirm()：「この曲で決定する」が押されたときに呼ばれる（引数なし。songIdsは
//   呼び出し側が既に把握しているため渡し直さない）。
// onAddMore()：「＋ほかの曲も追加する」が押されたときに呼ばれる（呼び出し側が、この
//   songIdsを初期選択状態にして全曲選択画面を開く想定）。
export function openOnlineBattleSongListConfirm({ title, subtitle, songIds, onConfirm, onAddMore }) {
  onConfirmCallback = onConfirm;
  onAddMoreCallback = onAddMore;
  elements.title.textContent = title;
  elements.subtitle.textContent = subtitle;

  elements.list.innerHTML = "";
  // songs.js側の登録順（＝一覧表示と同じ並び）で表示する。
  const songs = SONGS.filter((song) => songIds.includes(song.id));
  songs.forEach((song) => {
    const item = document.createElement("li");
    item.textContent = song.title;
    elements.list.appendChild(item);
  });

  const hasSongs = songs.length > 0;
  elements.list.hidden = !hasSongs;
  elements.emptyNotice.hidden = hasSongs;
  elements.confirmButton.disabled = !hasSongs;

  elements.overlay.hidden = false;
}
