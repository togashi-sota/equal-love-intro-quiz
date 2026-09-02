// ライブコールモードの画面を組み立てるファイル。
// 収録曲一覧（songlist.js）とは完全に独立した、コール専用の一覧・再生画面
// （2026-08-06新設、本人の希望により収録曲一覧には一切手を加えず新設）。
//
// 流れ：特別モード → ライブコールモード（曲一覧、コールが登録されている曲だけ）→ 曲を選択 → 再生画面。
// 再生画面では、既存の同期歌詞表示（js/lyricsSync.js）をそのまま使い、
// その上にコール専用の重ね書き（js/callSync.js）を載せる。全画面表示も既存の
// js/lyricsFullscreen.jsをそのまま呼ぶだけでよい（歌詞パネルの中身がコールごと
// 一緒に移動するため）。

import { SONGS, getSongById } from "./data/songs.js";
import { getAudioBlob } from "./audioStorage.js";
import { getSongIdsWithCallData } from "./callStorage.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { loadCallsForSong, destroyCallSync } from "./callSync.js";
import { openFullscreenLyrics } from "./lyricsFullscreen.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

const SEEK_SKIP_SECONDS = 10;

let elements = null;
let currentObjectUrl = null;
let currentSongId = null;

function formatTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function releaseCurrentObjectUrl() {
  if (currentObjectUrl !== null) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

// 他の音声（クイズ・試聴・連続再生）が始まったときに、この再生を一時停止する。
function pauseDueToConflict() {
  elements.audio.pause();
}
registerPlaybackStopper("liveCallMode", pauseDueToConflict);

// ===== 1. 曲一覧画面 =====

function buildSongRow(song) {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "live-call-song-row";

  const title = document.createElement("span");
  title.className = "live-call-song-row-title";
  title.textContent = song.title;
  row.appendChild(title);

  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "special-mode-card-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("fill", "none");
  chevron.setAttribute("aria-hidden", "true");
  const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  chevronPath.setAttribute("d", "M9 5 16 12 9 19");
  chevronPath.setAttribute("stroke", "currentColor");
  chevronPath.setAttribute("stroke-width", "2.4");
  chevronPath.setAttribute("stroke-linecap", "round");
  chevronPath.setAttribute("stroke-linejoin", "round");
  chevron.appendChild(chevronPath);
  row.appendChild(chevron);

  row.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.onSelectSong(song.id);
  });
  return row;
}

// この画面を開くたびに呼ぶ。コールが登録されている曲だけを一覧表示する。
export async function renderLiveCallModeList() {
  const songIdsWithCalls = await getSongIdsWithCallData();
  const songs = songIdsWithCalls
    .map((songId) => SONGS.find((song) => song.id === songId))
    .filter((song) => song !== undefined)
    // 収録曲一覧と同じく、発売が新しい曲を上にする（songs.jsのreleaseDateで並び替え）。
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));

  elements.listContainer.innerHTML = "";
  songs.forEach((song) => {
    elements.listContainer.appendChild(buildSongRow(song));
  });

  const hasSongs = songs.length > 0;
  elements.listContainer.hidden = !hasSongs;
  elements.listEmptyState.hidden = hasSongs;
}

// ===== 2. 再生画面 =====

function updateSeekUI() {
  const duration = elements.audio.duration || 0;
  elements.seekRange.max = duration;
  elements.seekRange.value = elements.audio.currentTime;
  elements.currentTime.textContent = formatTime(elements.audio.currentTime);
  elements.duration.textContent = formatTime(duration);
}

function syncPlayButtonIcon() {
  elements.playButton.classList.toggle("is-playing", !elements.audio.paused);
}

// 指定した曲の再生画面を開く。音源・歌詞・コールを順番に読み込む。
// 音源が読み込まれていない曲は、再生できない旨を伝えて操作をできなくする
// （試聴・連続再生と同じ「エラー表示は出さず、静かに何もしない」方針ではなく、
// この画面では曲を選んだ直後なので、はっきり案内したほうが分かりやすいと判断）。
export async function openLiveCallModePlayer(songId) {
  closeLiveCallModePlayer(); // 前の曲の後片付けを必ず先に行う

  const song = getSongById(songId);
  if (!song) return;

  currentSongId = songId;
  elements.songTitle.textContent = song.title;
  elements.fullscreenButton.hidden = true;
  elements.noLyricsNotice.hidden = true;
  elements.lyricsPanel.hidden = true;

  const blob = await getAudioBlob(songId);
  if (!blob) {
    elements.noLyricsNotice.hidden = false;
    elements.noLyricsNotice.textContent =
      "この曲の音源が読み込まれていません。スタート画面の「音源を読み込む」から先に取り込んでください。";
    return;
  }

  releaseCurrentObjectUrl();
  currentObjectUrl = URL.createObjectURL(blob);
  elements.audio.src = currentObjectUrl;

  const lyricsFound = await loadLyricsForSong(songId, elements.audio, elements.lyricsPanel);
  if (!lyricsFound) {
    elements.noLyricsNotice.hidden = false;
    elements.noLyricsNotice.textContent =
      "この曲にはまだ歌詞データが登録されていないため、コールだけを表示できません。歌詞データの登録が先に必要です。";
    return;
  }

  await loadCallsForSong(songId, elements.audio, elements.lyricsPanel);
  elements.fullscreenButton.hidden = false;

  updateSeekUI();
  syncPlayButtonIcon();
}

// 今再生画面で開いている曲のIDを返す（曲を選んでいなければnull）。
// コールガイドパネルが「今の曲の指定色・コール考案者」を表示する際に使う。
export function getCurrentLiveCallSongId() {
  return currentSongId;
}

// この画面を離れるとき（戻る・別の曲を選び直す）に必ず呼ぶ。
export function closeLiveCallModePlayer() {
  elements.audio.pause();
  elements.audio.currentTime = 0;
  releaseCurrentObjectUrl();
  destroyLyricsSync();
  destroyCallSync();
  currentSongId = null;
}

function handlePlayButtonClick() {
  if (!currentSongId) return;
  if (elements.audio.paused) {
    notifyPlaybackStarting("liveCallMode");
    elements.audio.play().catch(() => {});
  } else {
    elements.audio.pause();
  }
}

function handleFullscreenButtonClick() {
  if (!currentSongId || elements.lyricsPanel.hidden) return;
  playSfx(SFX_EVENTS.UI_CLICK);
  const song = getSongById(currentSongId);
  openFullscreenLyrics(song ? song.title : "", elements.audio, elements.lyricsPanel);
}

// elements: {
//   listContainer, listEmptyState: 曲一覧画面,
//   songTitle, playButton, seekRange, currentTime, duration,
//   seekBackButton, audio, lyricsPanel, fullscreenButton, noLyricsNotice: 再生画面
//   （UI/UX第4版で+10秒ボタン(seekForwardButton)は廃止した）,
//   onSelectSong: 曲一覧で曲がタップされたときに呼ばれるコールバック（songIdを受け取る）,
// }
export function initLiveCallModeScreen(newElements) {
  elements = newElements;

  elements.playButton.addEventListener("click", handlePlayButtonClick);
  elements.audio.addEventListener("play", syncPlayButtonIcon);
  elements.audio.addEventListener("pause", syncPlayButtonIcon);
  elements.audio.addEventListener("loadedmetadata", updateSeekUI);
  elements.audio.addEventListener("timeupdate", updateSeekUI);

  elements.seekRange.addEventListener("input", () => {
    elements.audio.currentTime = elements.seekRange.valueAsNumber;
  });
  elements.seekBackButton.addEventListener("click", () => {
    elements.audio.currentTime = Math.max(0, elements.audio.currentTime - SEEK_SKIP_SECONDS);
  });

  elements.fullscreenButton.addEventListener("click", handleFullscreenButtonClick);
}
