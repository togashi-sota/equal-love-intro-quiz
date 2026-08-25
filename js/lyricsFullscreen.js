// 歌詞パネルを画面いっぱいに表示するオーバーレイ。
// 新しいaudio要素・新しい歌詞DOMは一切作らず、js/lyricsSync.jsが描画した既存の
// panelElement（.synced-lyrics-panel）を、開いている間だけこのオーバーレイの中へ
// 移動するだけの設計。閉じると元の場所へ戻す。
//
// 収録曲一覧（songlist.js）・オリジナル問題作成モード（customQuizScreen.js）の
// どちらからも、同じ関数（曲名・audio要素・パネル要素を渡すだけ）で使える
// （js/lyricsSync.jsのloadLyricsForSong()と同じ設計方針）。
//
// 歌詞本文はここでも一切コンソールへ出力しない。

const SEEK_SKIP_SECONDS = 10;

let overlayElement = null;
let titleElement = null;
let closeButtonElement = null;
let lyricsSlotElement = null;
let seekRangeElement = null;
let currentTimeElement = null;
let durationElement = null;
let seekBackButtonElement = null;
let playPauseButtonElement = null;
let seekForwardButtonElement = null;
let elementsResolved = false;

let currentAudioElement = null;
let currentPanelElement = null;
let originalPanelParent = null;
let originalPanelNextSibling = null;
let bodyScrollY = 0;

function formatTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? totalSeconds : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function syncPlayPauseIcon() {
  if (!currentAudioElement) return;
  playPauseButtonElement.classList.toggle("is-playing", !currentAudioElement.paused);
}

function syncSeekUI() {
  if (!currentAudioElement) return;
  const duration = currentAudioElement.duration || 0;
  seekRangeElement.max = duration;
  seekRangeElement.value = currentAudioElement.currentTime;
  currentTimeElement.textContent = formatTime(currentAudioElement.currentTime);
  durationElement.textContent = formatTime(duration);
}

function handleAudioTimeUpdate() {
  syncSeekUI();
}

function handleAudioPlayPauseChange() {
  syncPlayPauseIcon();
}

function handleAudioLoadedMetadata() {
  syncSeekUI();
}

function attachAudioListeners() {
  currentAudioElement.addEventListener("timeupdate", handleAudioTimeUpdate);
  currentAudioElement.addEventListener("play", handleAudioPlayPauseChange);
  currentAudioElement.addEventListener("pause", handleAudioPlayPauseChange);
  currentAudioElement.addEventListener("loadedmetadata", handleAudioLoadedMetadata);
}

function detachAudioListeners() {
  if (!currentAudioElement) return;
  currentAudioElement.removeEventListener("timeupdate", handleAudioTimeUpdate);
  currentAudioElement.removeEventListener("play", handleAudioPlayPauseChange);
  currentAudioElement.removeEventListener("pause", handleAudioPlayPauseChange);
  currentAudioElement.removeEventListener("loadedmetadata", handleAudioLoadedMetadata);
}

function handlePlayPauseClick() {
  if (!currentAudioElement) return;
  if (currentAudioElement.paused) {
    // 「歌詞を見る」（試聴なし）から開いた場合、audio要素にsrcが無いことがある。
    // その場合play()は拒否されたPromiseを返すだけで実害は無いが、コンソールへの
    // 未処理rejection警告を防ぐために握りつぶす（2026-08-25追加）。
    currentAudioElement.play().catch(() => {});
  } else {
    currentAudioElement.pause();
  }
}

function handleSeekBackClick() {
  if (!currentAudioElement) return;
  currentAudioElement.currentTime = Math.max(0, currentAudioElement.currentTime - SEEK_SKIP_SECONDS);
}

function handleSeekForwardClick() {
  if (!currentAudioElement) return;
  const duration = currentAudioElement.duration || currentAudioElement.currentTime;
  currentAudioElement.currentTime = Math.min(duration, currentAudioElement.currentTime + SEEK_SKIP_SECONDS);
}

function handleSeekRangeInput() {
  if (!currentAudioElement) return;
  currentAudioElement.currentTime = seekRangeElement.valueAsNumber;
}

// 背景（一覧画面）のスクロールを止める。iOS Safari/PWAでoverflow:hiddenだけでは
// タッチスクロールが抜けてしまうことがあるため、bodyをposition:fixedにして
// 今のスクロール位置をtopに焼き込む、定番の対策を使う。
function lockBodyScroll() {
  bodyScrollY = window.scrollY;
  document.body.style.top = `-${bodyScrollY}px`;
  document.body.classList.add("has-fullscreen-lyrics-open");
}

function unlockBodyScroll() {
  document.body.classList.remove("has-fullscreen-lyrics-open");
  document.body.style.top = "";
  window.scrollTo(0, bodyScrollY);
  bodyScrollY = 0;
}

function resolveElements() {
  if (elementsResolved) return;

  overlayElement = document.getElementById("lyrics-fullscreen-overlay");
  titleElement = document.getElementById("lyrics-fullscreen-title");
  closeButtonElement = document.getElementById("lyrics-fullscreen-close-button");
  lyricsSlotElement = document.getElementById("lyrics-fullscreen-lyrics-slot");
  seekRangeElement = document.getElementById("lyrics-fullscreen-seek-range");
  currentTimeElement = document.getElementById("lyrics-fullscreen-current-time");
  durationElement = document.getElementById("lyrics-fullscreen-duration");
  seekBackButtonElement = document.getElementById("lyrics-fullscreen-seek-back");
  playPauseButtonElement = document.getElementById("lyrics-fullscreen-play-pause");
  seekForwardButtonElement = document.getElementById("lyrics-fullscreen-seek-forward");

  closeButtonElement.addEventListener("click", closeFullscreenLyrics);
  seekRangeElement.addEventListener("input", handleSeekRangeInput);
  seekBackButtonElement.addEventListener("click", handleSeekBackClick);
  seekForwardButtonElement.addEventListener("click", handleSeekForwardClick);
  playPauseButtonElement.addEventListener("click", handlePlayPauseClick);

  elementsResolved = true;
}

// 全画面表示を開く。songTitleは見出しの表示用、audioElement/panelElementは
// 呼び出し元（収録曲一覧・オリジナル問題作成モード）が今使っているものをそのまま渡す。
export function openFullscreenLyrics(songTitle, audioElement, panelElement) {
  if (!audioElement || !panelElement) return;
  resolveElements();

  // 何らかの理由で前回のオーバーレイが開いたままだった場合に備え、先に片付ける
  if (currentAudioElement) {
    detachAudioListeners();
  }

  currentAudioElement = audioElement;
  currentPanelElement = panelElement;
  originalPanelParent = panelElement.parentElement;
  originalPanelNextSibling = panelElement.nextElementSibling;

  titleElement.textContent = songTitle;
  panelElement.classList.add("is-fullscreen-lyrics");
  lyricsSlotElement.appendChild(panelElement);

  attachAudioListeners();
  syncPlayPauseIcon();
  syncSeekUI();

  overlayElement.hidden = false;
  lockBodyScroll();
}

// 全画面表示を閉じる。audioElementには一切触れないため、再生位置・一時停止状態は
// 開く前のまま維持される。歌詞パネルは元あった場所へそのまま戻す。
export function closeFullscreenLyrics() {
  if (!overlayElement || overlayElement.hidden) return;

  detachAudioListeners();

  if (currentPanelElement) {
    currentPanelElement.classList.remove("is-fullscreen-lyrics");
    if (originalPanelParent) {
      originalPanelParent.insertBefore(currentPanelElement, originalPanelNextSibling);
    }
  }

  currentAudioElement = null;
  currentPanelElement = null;
  originalPanelParent = null;
  originalPanelNextSibling = null;

  overlayElement.hidden = true;
  unlockBodyScroll();
}
