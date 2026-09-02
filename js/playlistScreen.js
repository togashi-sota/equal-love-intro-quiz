// プレイリスト画面（一覧・詳細）を組み立てるファイル。
// 曲の再生・シーク・歌詞表示は、収録曲一覧（js/songlist.js）のcreateTrackRow()を
// そのまま再利用する。試聴用の<audio>要素は収録曲一覧と1つだけ共有しているため、
// 別々に再生が始まって音が重なる、といったことは起きない（2026-08-04新設）。

import { getSongById } from "./data/songs.js";
import { createTrackRow, stopSongListPreview } from "./songlist.js";
// この画面内で完結する操作（名前変更・削除確認モーダル）に効果音を鳴らすため追加。
import { SFX_EVENTS, playSfx } from "./soundManager.js";
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
let currentDetailPlaylistId = null; // 詳細画面で今表示しているプレイリストid（連続再生の入口ボタンで使う）

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
      // ✓ボタンのクリック・Enterキーのどちらから呼ばれても、名前変更の確定は1回だけ
      // 鳴ればよいため、ボタン側ではなくこの共通関数の中で鳴らす。
      playSfx(SFX_EVENTS.UI_CONFIRM);
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
  // 【二重再生防止】elements.onSelectPlaylist（main.js側）の先頭で既にplaySfx(UI_CLICK)相当の
  // playClickSound()が鳴っているため、ここでは重ねて鳴らさない。
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
    playSfx(SFX_EVENTS.UI_CLICK);
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
    playSfx(SFX_EVENTS.UI_CLICK);
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

// 作成したら一覧に留まらず、作った空のプレイリストの詳細画面へそのまま移動する
// （UI/UX再設計：以前は一覧に戻るだけで、そこからもう一度タップして詳細を開く必要があった。
// 「作成→曲を追加する」までを一続きの操作にするため、一覧画面用のonSelectPlaylistコールバックを
// そのまま使い回す＝main.js側で「詳細を描画してshowScreen」する処理を新たに増やさずに済む）。
function commitCreatePlaylist() {
  const name = elements.playlistCreateInput.value.trim();
  if (!name) return;
  const newPlaylist = createPlaylist(name);
  elements.playlistCreateInput.value = "";
  elements.onSelectPlaylist(newPlaylist.playlistId);
}

// ---- プレイリスト詳細 ----

// 曲一覧・お気に入り一覧の1曲だけを常に選ぶ状況とは違い、プレイリストは
// 「まだ収録曲データが読み込まれていない曲id」を含む可能性は無い
// （追加時に必ず実在する曲からしか選べないため）。ただし念のため、
// getSongById()がundefinedを返した場合はその曲だけ静かに読み飛ばす。
export function renderPlaylistDetail(playlistId) {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return;
  currentDetailPlaylistId = playlistId;

  elements.playlistDetailName.textContent = playlist.playlistName || "（名前未設定）";
  elements.playlistDetailCount.textContent = playlist.songIds.length;

  // 0曲のときは、押せない「連続再生」ボタンを出し続けるのではなく、ボタンごと隠して
  // アイコン＋見出し＋補足の空状態ブロックだけを見せる（本人フィードバック反映。2026-08-05、
  // 以前は案内文が2つ同時に表示されて文字とボタンが重なる不具合があった）。
  const isEmpty = playlist.songIds.length === 0;
  elements.continuousPlayButton.hidden = isEmpty;
  elements.emptyState.hidden = !isEmpty;

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
}

// elements: {
//   playlistList, playlistEmptyNotice: プレイリスト一覧,
//   playlistCreateInput, playlistCreateButton: 新規作成用の入力欄・ボタン,
//   playlistDeleteConfirmModal, playlistDeleteCancelButton, playlistDeleteConfirmButton: 削除確認モーダル,
//   playlistDetailName, playlistDetailCount, playlistDetailList: 詳細画面,
//   emptyState: 0曲のときだけ見せる空状態ブロック（UI/UX再設計で追加）,
//   continuousPlayButton: このプレイリストを連続再生する入口（0曲のときは非表示）,
//   addSongsButton: 「＋曲を追加する」ボタン（UI/UX再設計で追加）,
//   onSelectPlaylist: プレイリスト行がタップされたとき・新規作成直後に呼ばれるコールバック（playlistIdを受け取る）,
//   onContinuousPlay: 連続再生ボタンが押されたときに呼ばれるコールバック（playlistIdを受け取る）,
//   onAddSongs: 「＋曲を追加する」が押されたときに呼ばれるコールバック（playlistIdを受け取る）,
// }
export function initPlaylistScreen(newElements) {
  elements = newElements;

  // 【二重再生防止】continuousPlayButton/addSongsButtonは、それぞれelements.onContinuousPlay
  // （実体はmain.jsのopenContinuousPlayFromPlaylistDetail）・elements.onAddSongsの先頭で
  // 既にplaySfx(UI_CLICK)相当のplayClickSound()が鳴っているため、ここでは重ねて鳴らさない。
  elements.continuousPlayButton.addEventListener("click", () => {
    if (currentDetailPlaylistId) elements.onContinuousPlay(currentDetailPlaylistId);
  });

  elements.addSongsButton.addEventListener("click", () => {
    if (currentDetailPlaylistId) elements.onAddSongs(currentDetailPlaylistId);
  });

  // 【二重再生防止】commitCreatePlaylist()は成功時に必ずelements.onSelectPlaylist
  // （main.js側、先頭でplaySfx(UI_CLICK)相当のplayClickSound()を鳴らす）を呼ぶため、
  // ここでは重ねて鳴らさない。
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
    playSfx(SFX_EVENTS.UI_BACK);
    pendingDeletePlaylistId = null;
    elements.playlistDeleteConfirmModal.hidden = true;
  });
  elements.playlistDeleteConfirmButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    if (pendingDeletePlaylistId) {
      deletePlaylist(pendingDeletePlaylistId);
      pendingDeletePlaylistId = null;
    }
    elements.playlistDeleteConfirmModal.hidden = true;
    renderPlaylistList();
  });
}
