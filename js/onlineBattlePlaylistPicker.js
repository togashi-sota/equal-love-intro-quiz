// オンライン対戦の「出題する曲」を、プレイリストからまとめて選べるようにする
// 小さなモーダル（2026-08-27新設）。
//
// 【設計方針】js/onlineBattleSongPicker.js（3対戦モード共通の曲選択画面）とは別の、
// 軽量なモーダルとして実装する。「どのプレイリストを使うか」を1回選ぶだけの単純な操作
// のため、既存の画面遷移（elements.navigateTo）の仕組みには乗せず、
// 既存の#add-to-playlist-modal等と同じ「.modal-overlayの表示/非表示を切り替えるだけ」
// という軽量なモーダルパターンを踏襲した。
//
// 【共通曲プールとの掛け合わせ】選んだプレイリストの曲がそのまま使われるのではなく、
// 呼び出し側が渡した「今のルーム参加者全員が利用できる曲（commonSongPool）」との
// 共通部分だけを、選択曲として返す（本人指示：ホストのプレイリストに入っていても、
// 他の参加者が持っていない曲は使わない）。プレイリストの曲数・実際に使える曲数を
// 両方表示することで、「10曲中7曲がこのルームで使用できます」のような
// 分かりやすさを実現する。

import { getPlaylists } from "./playlists.js";

let elements = null;
let onChosenCallback = null;

function closeModal() {
  elements.overlay.hidden = true;
}

export function initOnlineBattlePlaylistPicker(newElements) {
  elements = newElements;
  elements.closeButton.addEventListener("click", closeModal);
  // 背景（オーバーレイ自身）をクリックしたときも閉じる。カード本体のクリックは
  // イベントがそこで止まる（バブリングしない）ため、誤って閉じることはない。
  elements.overlay.addEventListener("click", (event) => {
    if (event.target === elements.overlay) closeModal();
  });
}

// commonSongPool: Set<string>（今のルーム参加者全員が利用できる曲ID）。
// onChosen(songIds: string[])：プレイリストが選ばれたときに呼ばれる
//   （渡されるsongIdsは、選んだプレイリストの曲とcommonSongPoolの共通部分。
//   0曲の場合はそもそも行がクリックできない状態にしてあるため、空配列で
//   呼ばれることはない）。
export function openOnlineBattlePlaylistPicker(commonSongPool, onChosen) {
  onChosenCallback = onChosen;
  const playlists = getPlaylists();
  elements.listContainer.innerHTML = "";
  elements.emptyNotice.hidden = playlists.length > 0;

  playlists.forEach((playlist) => {
    const availableSongIds = playlist.songIds.filter((songId) => commonSongPool.has(songId));

    const row = document.createElement("button");
    row.type = "button";
    row.className = "online-battle-playlist-picker-row";
    row.disabled = availableSongIds.length === 0;

    const nameSpan = document.createElement("span");
    nameSpan.className = "online-battle-playlist-picker-name";
    nameSpan.textContent = playlist.playlistName;

    const countSpan = document.createElement("span");
    countSpan.className = "online-battle-playlist-picker-count";
    countSpan.textContent =
      availableSongIds.length === 0
        ? "この対戦で使える曲がありません"
        : `${playlist.songIds.length}曲中${availableSongIds.length}曲がこの対戦で使えます`;

    row.appendChild(nameSpan);
    row.appendChild(countSpan);
    row.addEventListener("click", () => {
      closeModal();
      onChosenCallback?.(availableSongIds);
    });
    elements.listContainer.appendChild(row);
  });

  elements.overlay.hidden = false;
}
