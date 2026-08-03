// プレイリスト画面（一覧・詳細）を組み立てるファイル。
// 曲の再生・シーク・歌詞表示は、収録曲一覧（js/songlist.js）のcreateTrackRow()を
// そのまま再利用する。試聴用の<audio>要素は収録曲一覧と1つだけ共有しているため、
// 別々に再生が始まって音が重なる、といったことは起きない（2026-08-04新設）。

import { getSongById } from "./data/songs.js";
import { createTrackRow, stopSongListPreview } from "./songlist.js";
import {
  getPlaylists,
  getPlaylistById,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  removeSongFromPlaylist,
  moveSongUp,
  moveSongDown,
} from "./playlists.js";

let elements = null;
let renamingPlaylistId = null; // 現在インライン編集中のプレイリストid（無ければnull）
let pendingDeletePlaylistId = null; // 削除確認モーダルで対象にしているプレイリストid（一覧画面からのみ削除可能）

// ---- プレイリスト一覧 ----

function buildPlaylistRow(playlist) {
  const row = document.createElement("div");
  row.className = "playlist-row";

  // インライン編集中（名前変更ボタンを押した直後）は、名前部分をテキスト入力に差し替える
  // （js/playerScreen.jsのプレイヤー名変更と同じ考え方・同じ不具合対策を踏襲する）。
  if (renamingPlaylistId === playlist.playlistId) {
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.value = playlist.playlistName;
    input.className = "playlist-row-rename-input";
    row.appendChild(input);

    const commitRename = () => {
      renamePlaylist(playlist.playlistId, input.value.trim() || playlist.playlistName);
      renamingPlaylistId = null;
      renderPlaylistList();
    };

    // ✓ボタンが押しづらい場合の代替として、Enterキーでも保存できるようにする。
    // stopPropagation()の理由はjs/playerScreen.jsのプレイヤー名変更と同じ
    // （documentのキー操作リスナーまでEnterが伝わって、別のショートカットが
    // 誤発火しないようにするため）。
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        event.stopPropagation();
        commitRename();
      }
    });

    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "playlist-row-icon-button is-save";
    saveButton.textContent = "✓";
    saveButton.setAttribute("aria-label", "名前を保存する");
    saveButton.addEventListener("click", commitRename);
    row.appendChild(saveButton);

    input.focus();
    input.select();
    return row;
  }

  const openButton = document.createElement("button");
  openButton.type = "button";
  openButton.className = "playlist-row-open-button";
  const nameSpan = document.createElement("span");
  nameSpan.className = "playlist-row-name";
  nameSpan.textContent = playlist.playlistName || "（名前未設定）";
  openButton.appendChild(nameSpan);
  const countSpan = document.createElement("span");
  countSpan.className = "playlist-row-count";
  countSpan.textContent = `${playlist.songIds.length}曲`;
  openButton.appendChild(countSpan);
  openButton.addEventListener("click", () => {
    elements.onSelectPlaylist(playlist.playlistId);
  });
  row.appendChild(openButton);

  const renameButton = document.createElement("button");
  renameButton.type = "button";
  renameButton.className = "playlist-row-icon-button";
  renameButton.textContent = "✎";
  renameButton.setAttribute("aria-label", "名前を変更する");
  renameButton.addEventListener("click", () => {
    renamingPlaylistId = playlist.playlistId;
    renderPlaylistList();
  });
  row.appendChild(renameButton);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "playlist-row-icon-button is-delete";
  deleteButton.textContent = "×";
  deleteButton.setAttribute("aria-label", "削除する");
  deleteButton.addEventListener("click", () => {
    pendingDeletePlaylistId = playlist.playlistId;
    elements.playlistDeleteConfirmModal.hidden = false;
  });
  row.appendChild(deleteButton);

  return row;
}

export function renderPlaylistList() {
  const playlists = getPlaylists();
  elements.playlistList.innerHTML = "";
  playlists.forEach((playlist) => {
    elements.playlistList.appendChild(buildPlaylistRow(playlist));
  });
  elements.playlistEmptyNotice.hidden = playlists.length > 0;
}

function commitCreatePlaylist() {
  const name = elements.playlistCreateInput.value.trim();
  if (!name) return;
  createPlaylist(name);
  elements.playlistCreateInput.value = "";
  renderPlaylistList();
}

// ---- プレイリスト詳細 ----

// 曲一覧・お気に入り一覧の1曲だけを常に選ぶ状況とは違い、プレイリストは
// 「まだ収録曲データが読み込まれていない曲id」を含む可能性は無い
// （追加時に必ず実在する曲からしか選べないため）。ただし念のため、
// getSongById()がundefinedを返した場合はその曲だけ静かに読み飛ばす。
export function renderPlaylistDetail(playlistId) {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return;

  elements.playlistDetailName.textContent = playlist.playlistName || "（名前未設定）";
  elements.playlistDetailCount.textContent = playlist.songIds.length;

  elements.playlistDetailList.innerHTML = "";
  playlist.songIds.forEach((songId, index) => {
    const song = getSongById(songId);
    if (!song) return;
    const row = createTrackRow(song, {
      playlistControls: {
        canMoveUp: index > 0,
        canMoveDown: index < playlist.songIds.length - 1,
        onMoveUp: () => {
          moveSongUp(playlistId, songId);
          renderPlaylistDetail(playlistId);
        },
        onMoveDown: () => {
          moveSongDown(playlistId, songId);
          renderPlaylistDetail(playlistId);
        },
        onRemove: () => {
          stopSongListPreview();
          removeSongFromPlaylist(playlistId, songId);
          renderPlaylistDetail(playlistId);
        },
      },
    });
    elements.playlistDetailList.appendChild(row);
  });
  elements.playlistDetailEmptyNotice.hidden = playlist.songIds.length > 0;
}

// elements: {
//   playlistList, playlistEmptyNotice: プレイリスト一覧,
//   playlistCreateInput, playlistCreateButton: 新規作成用の入力欄・ボタン,
//   playlistDeleteConfirmModal, playlistDeleteCancelButton, playlistDeleteConfirmButton: 削除確認モーダル,
//   playlistDetailName, playlistDetailCount, playlistDetailList, playlistDetailEmptyNotice: 詳細画面,
//   onSelectPlaylist: プレイリスト行がタップされたときに呼ばれるコールバック（playlistIdを受け取る）,
// }
export function initPlaylistScreen(newElements) {
  elements = newElements;

  elements.playlistCreateButton.addEventListener("click", commitCreatePlaylist);
  // Enterキーでも作成できるようにする（stopPropagationの理由は名前変更欄と同じ）。
  elements.playlistCreateInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      commitCreatePlaylist();
    }
  });

  elements.playlistDeleteCancelButton.addEventListener("click", () => {
    pendingDeletePlaylistId = null;
    elements.playlistDeleteConfirmModal.hidden = true;
  });
  elements.playlistDeleteConfirmButton.addEventListener("click", () => {
    if (pendingDeletePlaylistId) {
      deletePlaylist(pendingDeletePlaylistId);
      pendingDeletePlaylistId = null;
    }
    elements.playlistDeleteConfirmModal.hidden = true;
    renderPlaylistList();
  });
}
