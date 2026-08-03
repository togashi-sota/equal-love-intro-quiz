// 連続再生画面（再生元・再生方式の設定と、再生中の操作）を組み立てるファイル。
// 設定と再生操作を1つの画面にまとめ、再生元を変えるたびに別画面へ行き来しなくてよいように
// している。実際のキュー生成・再生制御はjs/continuousPlay.jsが行い、このファイルは
// 画面の組み立てと操作の受け付けだけを行う（2026-08-04新設、同日中に1画面構成へ改訂、
// その後2回のUI/UXレビューを経て情報の優先順位・リピートの扱い・お気に入り/プレイリストの
// 見え方を再設計）。

import { SONGS } from "./data/songs.js";
import { getPlaylists, getPlaylistById } from "./playlists.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { CATEGORY_PILL_INFO } from "./songlist.js";
import { openFullscreenLyrics } from "./lyricsFullscreen.js";
import {
  getPlaybackState,
  onPlaybackStateChange,
  startFromAllSongs,
  startFromFavorites,
  startFromPlaylist,
  setRepeatMode,
  togglePlayPause,
  goToPrevious,
  goToNextManually,
} from "./continuousPlay.js";

let elements = null;

// 設定パネルの開閉と、「この内容で再生」を押すまでの下書き（まだ実際の再生には反映しない）。
let isSettingsOpen = false;
let draftSource = "all"; // "all" | "favorites" | "playlist"
let draftPlaylistId = null;
let draftShuffle = false;

// プレイリスト選択欄は、既に選んでいるものがある間は畳んだ状態（コンパクト表示）から始め、
// 「変更する」を押したときだけ一覧を展開する（UI/UX再設計：選んだら自動で閉じるという要望への対応）。
let playlistListExpanded = false;

// リピートの循環順（なし→全体→1曲→なし）。設定パネルからは外し、
// 常時表示エリアの小さいアイコンボタンだけで切り替える（UI/UX再設計）。
const REPEAT_CYCLE = ["none", "all", "one"];

// ---- 設定パネル：再生元の説明・お気に入り/プレイリストの状態表示 ----

const SOURCE_EXPLAIN = {
  all: `全曲：収録されている${SONGS.length}曲すべてを対象にします`,
  favorites: "お気に入り：♡を付けた曲だけを再生します",
  playlist: "プレイリスト：作成した曲のまとめから選びます",
};
const ORDER_EXPLAIN = {
  sequential: "順番再生：一覧の1曲目から順に再生します",
  shuffle: "シャッフル：曲順をランダムに並べて再生します",
};

function updateFavoritesBlock() {
  const favoriteCount = getFavoriteSongIds().length;
  const hasFavorites = favoriteCount > 0;
  elements.favoritesOk.hidden = !hasFavorites;
  elements.favoritesOk.textContent = hasFavorites ? `♡ お気に入り${favoriteCount}曲を再生対象にします` : "";
  elements.favoritesEmpty.hidden = hasFavorites;
}

// プレイリスト選択欄を組み立てる。選んでいたプレイリストが無くなっていた・0曲になっていた
// 場合は、曲が入っている最初のプレイリストへ自動的に選び直す（空のプレイリストは選ばせない）。
function renderPlaylistPicker() {
  const playlists = getPlaylists();
  elements.playlistPicker.innerHTML = "";
  elements.playlistEmptyNotice.hidden = playlists.length > 0;

  if (!playlists.some((p) => p.playlistId === draftPlaylistId && p.songIds.length > 0)) {
    const firstPlayable = playlists.find((p) => p.songIds.length > 0);
    draftPlaylistId = firstPlayable ? firstPlayable.playlistId : null;
  }

  playlists.forEach((playlist) => {
    const isEmpty = playlist.songIds.length === 0;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "continuous-play-playlist-option";
    button.classList.toggle("is-active", playlist.playlistId === draftPlaylistId);
    button.disabled = isEmpty;
    button.textContent = isEmpty
      ? `${playlist.playlistName || "（名前未設定）"}（0曲）`
      : `${playlist.playlistName || "（名前未設定）"}（${playlist.songIds.length}曲）`;
    button.addEventListener("click", () => {
      draftPlaylistId = playlist.playlistId;
      playlistListExpanded = false; // 選んだら自動で折りたたむ（UI/UX再設計）
      updatePlaylistBlockUI();
    });
    elements.playlistPicker.appendChild(button);
  });
}

// プレイリスト選択欄を、「選択中のコンパクト表示」と「一覧」のどちらか一方だけ見せる。
function updatePlaylistBlockUI() {
  const playlists = getPlaylists();
  const hasPlayableSelection = playlists.some((p) => p.playlistId === draftPlaylistId && p.songIds.length > 0);

  if (hasPlayableSelection && !playlistListExpanded) {
    const selected = getPlaylistById(draftPlaylistId);
    elements.playlistSummary.hidden = false;
    elements.playlistSummaryText.textContent = `${selected.playlistName || "（名前未設定）"}（${selected.songIds.length}曲）`;
    elements.playlistPicker.hidden = true;
    elements.playlistEmptyNotice.hidden = true;
  } else {
    elements.playlistSummary.hidden = true;
    elements.playlistPicker.hidden = false;
    renderPlaylistPicker();
  }
}

function updateDraftSourceUI() {
  elements.sourceButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.source === draftSource);
  });
  elements.sourceExplain.textContent = SOURCE_EXPLAIN[draftSource] ?? "";

  const isFavoritesSource = draftSource === "favorites";
  const isPlaylistSource = draftSource === "playlist";
  elements.favoritesBlock.hidden = !isFavoritesSource;
  elements.playlistBlock.hidden = !isPlaylistSource;

  if (isFavoritesSource) {
    updateFavoritesBlock();
  }
  if (isPlaylistSource) {
    updatePlaylistBlockUI();
  }
}

function updateDraftOrderUI() {
  elements.orderButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.order === (draftShuffle ? "shuffle" : "sequential"));
  });
  elements.orderExplain.textContent = ORDER_EXPLAIN[draftShuffle ? "shuffle" : "sequential"];
}

// 設定パネルを開く/閉じる。ヘッダーのアイコン・常時表示エリアの控えめな入口、
// どちらからでも同じパネルを開閉できる（UI/UX再設計）。開くときは、下書きを
// 「今実際に再生している内容」で初期化し直す（前回開いたときの中途半端な選択を引きずらないため）。
function setSettingsOpen(open) {
  isSettingsOpen = open;
  elements.settingsToggle.classList.toggle("is-open", open);
  elements.settingsToggle.setAttribute("aria-expanded", String(open));
  elements.settingsIconButton.classList.toggle("is-open", open);
  elements.settingsIconButton.setAttribute("aria-expanded", String(open));
  elements.settingsPanel.hidden = !open;

  if (open) {
    const state = getPlaybackState();
    draftSource = state.source;
    draftPlaylistId = state.playlistId;
    draftShuffle = state.shuffle;
    playlistListExpanded = false; // 開くたびに、選択済み表示から始める
    updateDraftSourceUI();
    updateDraftOrderUI();
  }
}

async function handleApplyButtonClick() {
  if (draftSource === "all") {
    await startFromAllSongs(draftShuffle);
  } else if (draftSource === "favorites") {
    await startFromFavorites(draftShuffle);
  } else if (draftSource === "playlist") {
    if (!draftPlaylistId) return;
    await startFromPlaylist(draftPlaylistId, draftShuffle);
  }
  setSettingsOpen(false);
}

// ---- 常時表示の再生中エリア ----

function shortSourceLabel(state) {
  if (state.source === "all") return "全曲";
  if (state.source === "favorites") return "お気に入り";
  if (state.source === "playlist") {
    const playlist = state.playlistId ? getPlaylistById(state.playlistId) : null;
    return playlist ? playlist.playlistName || "プレイリスト" : "プレイリスト";
  }
  return "";
}

function updateSettingsSummary(state) {
  if (state.status === "idle") {
    elements.settingsSummary.textContent = "再生設定";
    return;
  }
  elements.settingsSummary.textContent = `${shortSourceLabel(state)}・${state.orderLabel}`;
}

function formatSongMeta(song) {
  const parts = [];
  const categoryInfo = CATEGORY_PILL_INFO[song.category];
  if (categoryInfo) parts.push(categoryInfo.text);
  if (song.members) {
    parts.push(song.members.length === 1 ? `歌唱：${song.members[0]}` : `歌唱：${song.members.join("・")}`);
  }
  return parts.join(" ／ ");
}

const STATUS_TEXT = {
  playing: "再生中",
  paused: "一時停止中",
  finished: "最後まで再生しました",
};

// リピートの循環ボタン（なし→全体→1曲→なし）。状態は見た目にも一目で分かるよう、
// 選択中は色を塗りつぶし、1曲リピートのときだけ小さな「1」バッジを添える。
function updateRepeatButton(repeatMode) {
  elements.repeatButton.classList.toggle("is-active", repeatMode !== "none");
  const REPEAT_TITLE = { none: "リピート：なし", all: "リピート：全体", one: "リピート：1曲" };
  elements.repeatButton.title = REPEAT_TITLE[repeatMode];
  elements.repeatButton.setAttribute("aria-label", `リピートを切り替える（現在：${REPEAT_TITLE[repeatMode]}）`);

  let badge = elements.repeatButton.querySelector(".continuous-play-repeat-badge");
  if (repeatMode === "one") {
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "continuous-play-repeat-badge";
      badge.textContent = "1";
      elements.repeatButton.appendChild(badge);
    }
  } else if (badge) {
    badge.remove();
  }
}

function renderNowPlaying(state) {
  const hasQueue = state.status === "playing" || state.status === "paused" || state.status === "finished";

  elements.emptyMessage.hidden = state.status !== "empty";
  if (state.status === "empty") {
    elements.emptyMessage.textContent = state.errorMessage;
  }

  elements.seekRow.hidden = !hasQueue;
  elements.controls.hidden = !hasQueue;
  elements.lyricsSection.hidden = !(hasQueue && state.hasLyrics);
  elements.lyricsFullscreenButton.hidden = !(hasQueue && state.hasLyrics);
  elements.queueLink.hidden = !hasQueue;

  // 「次に再生」カード：次の曲が無い場合（リピートなしで最後の曲）は非表示にする。
  const hasNextSong = hasQueue && state.nextSong !== null;
  elements.nextCard.hidden = !hasNextSong;
  if (hasNextSong) {
    elements.nextTitle.textContent = state.nextSong.title;
  }

  if (hasQueue) {
    elements.queueLinkCount.textContent = `${state.queueLength}曲 ›`;
  }

  if (!hasQueue) {
    elements.position.textContent = "";
    elements.songTitle.textContent = "";
    elements.songMeta.textContent = "";
    elements.statusText.textContent =
      state.status === "idle" ? "再生設定を開いて、再生元を選んでください" : "";
    elements.notice.hidden = true;
    return;
  }

  elements.position.textContent = `${state.currentIndex + 1} / ${state.queueLength} 曲`;
  elements.songTitle.textContent = state.currentSong ? state.currentSong.title : "";
  elements.songMeta.textContent = state.currentSong ? formatSongMeta(state.currentSong) : "";
  elements.statusText.textContent = STATUS_TEXT[state.status] ?? "";

  if (state.unavailableCount > 0) {
    elements.notice.hidden = false;
    elements.notice.textContent = `${state.unavailableCount}曲は音源が読み込まれていないため、再生対象から除いています。`;
  } else {
    elements.notice.hidden = true;
  }

  elements.toggleButton.classList.toggle("is-playing", state.status === "playing");
  elements.toggleButton.disabled = state.status === "finished";
  elements.toggleButton.setAttribute("aria-label", state.status === "playing" ? "一時停止する" : "再生する");
  elements.prevButton.disabled = !state.canGoPrevious;
  elements.nextButton.disabled = !state.canGoNext;
}

function renderState(state) {
  renderNowPlaying(state);
  updateSettingsSummary(state);
  updateRepeatButton(state.repeatMode);
}

// ---- シークバー（収録曲一覧のシーク欄と同じ考え方：<audio>要素へ直接配線する） ----

function formatTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function wireSeekBar() {
  const audio = document.getElementById("continuous-play-audio");
  audio.addEventListener("loadedmetadata", () => {
    elements.seekRange.max = audio.duration;
    elements.duration.textContent = formatTime(audio.duration);
  });
  audio.addEventListener("timeupdate", () => {
    elements.seekRange.value = audio.currentTime;
    elements.currentTime.textContent = formatTime(audio.currentTime);
  });
  elements.seekRange.addEventListener("input", () => {
    audio.currentTime = elements.seekRange.valueAsNumber;
  });
}

// elements: {
//   settingsIconButton: ヘッダーの控えめな設定アイコン（UI/UX再設計で追加）,
//   settingsToggle, settingsSummary, settingsPanel: 常時表示エリア末尾の設定入口とパネル,
//   sourceButtons, orderButtons: 設定内の選択ボタン群（配列。リピートはここから除外）,
//   sourceExplain, orderExplain: 開いたときだけ見せる短い説明文（UI/UX再設計で追加）,
//   favoritesBlock, favoritesOk, favoritesEmpty, favoritesExploreButton: お気に入りの対象曲数表示（UI/UX再設計で追加）,
//   playlistBlock, playlistSummary, playlistSummaryText, playlistPicker, playlistEmptyNotice: プレイリスト選択欄,
//   applyButton: 「この内容で再生」ボタン,
//   position, songTitle, songMeta, statusText, notice: 再生中の各種テキスト,
//   repeatButton: リピート循環ボタン（UI/UX再設計で追加）,
//   seekRow, seekRange, currentTime, duration: シークバー欄,
//   controls, toggleButton, prevButton, nextButton: 操作ボタン,
//   nextCard, nextTitle: 「次に再生」プレビューカード（タップで再生キュー画面へ）,
//   queueLink, queueLinkCount: 「再生キューを見る」入口,
//   lyricsSection, lyricsPanel, lyricsFullscreenButton: 歌詞欄,
//   emptyMessage: 再生元が空のときの案内,
//   onOpenQueue: 「再生キューを見る」・「次に再生」カードが押されたときに呼ばれるコールバック,
//   onExploreFavorites: 「お気に入りを探す」が押されたときに呼ばれるコールバック,
// }
export function initContinuousPlayScreen(newElements) {
  elements = newElements;

  elements.queueLink.addEventListener("click", () => elements.onOpenQueue());
  elements.nextCard.addEventListener("click", () => elements.onOpenQueue());

  elements.settingsToggle.addEventListener("click", () => setSettingsOpen(!isSettingsOpen));
  elements.settingsIconButton.addEventListener("click", () => setSettingsOpen(!isSettingsOpen));

  elements.sourceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      draftSource = button.dataset.source;
      updateDraftSourceUI();
    });
  });

  elements.orderButtons.forEach((button) => {
    button.addEventListener("click", () => {
      draftShuffle = button.dataset.order === "shuffle";
      updateDraftOrderUI();
    });
  });

  elements.playlistSummary.addEventListener("click", () => {
    playlistListExpanded = true; // 「変更する」で一覧を展開
    updatePlaylistBlockUI();
  });

  elements.favoritesExploreButton.addEventListener("click", () => elements.onExploreFavorites());

  elements.repeatButton.addEventListener("click", () => {
    const state = getPlaybackState();
    const currentIndex = REPEAT_CYCLE.indexOf(state.repeatMode);
    const nextMode = REPEAT_CYCLE[(currentIndex + 1) % REPEAT_CYCLE.length];
    setRepeatMode(nextMode);
  });

  elements.applyButton.addEventListener("click", handleApplyButtonClick);

  elements.toggleButton.addEventListener("click", togglePlayPause);
  elements.prevButton.addEventListener("click", goToPrevious);
  elements.nextButton.addEventListener("click", goToNextManually);

  elements.lyricsFullscreenButton.addEventListener("click", () => {
    const state = getPlaybackState();
    const audio = document.getElementById("continuous-play-audio");
    if (state.currentSong && !elements.lyricsPanel.hidden) {
      openFullscreenLyrics(state.currentSong.title, audio, elements.lyricsPanel);
    }
  });

  wireSeekBar();
  onPlaybackStateChange(renderState);
}

// 連続再生画面を開くたびに呼ぶ。
// prefillを渡すと（プレイリスト詳細・収録曲一覧からの入口）、設定パネルを開かせず、
// その場で指定の再生元から再生を始める。
// prefillが無いときは、今の再生状態をそのまま表示する（再生中ならそのまま、
// 何も始めていなければ設定パネルを開いた状態から始める）。
export function refreshContinuousPlayScreen(prefill) {
  if (prefill) {
    setSettingsOpen(false);
    if (prefill.source === "all") {
      startFromAllSongs(false);
    } else if (prefill.source === "favorites") {
      startFromFavorites(false);
    } else if (prefill.source === "playlist" && prefill.playlistId) {
      startFromPlaylist(prefill.playlistId, false);
    }
    return;
  }

  const state = getPlaybackState();
  setSettingsOpen(state.status === "idle");
  renderState(state);
}
