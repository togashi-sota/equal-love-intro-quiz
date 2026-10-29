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
import { getSongIdsWithCallData, getCallData } from "./callStorage.js";
import { getLyricsData } from "./lyricsStorage.js";
import { buildCallTextLayout } from "./callTextLayout.js";
import { resolveApprovedCallText } from "./callTextEdits.js";
import { renderCallTextView } from "./callTextView.js";
import { APPROVED_CALL_TEXT_PLACEMENTS } from "./data/callTextPlacements.js";
import { isLiveCallTextModeEnabled } from "./liveCallTextModeFlag.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { loadCallsForSong, destroyCallSync } from "./callSync.js";
import { openFullscreenLyrics } from "./lyricsFullscreen.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

const SEEK_SKIP_SECONDS = 10;

// 【2026-10-24新設】文字モード。本人がコールの配置を確認・承認するまでは、?calltext=on で有効にした端末だけに出す
// （有効かどうかは js/liveCallTextModeFlag.js）。
const MODE = { SYNC: "sync", TEXT: "text" };
const SWIPE_MIN_DX = 60; // これ以上横に動いたら切り替え
const SWIPE_EDGE_PX = 24; // 画面の端から始まる横スワイプは iPhone の「戻る」操作に任せる
let currentMode = MODE.SYNC;
let swipeStart = null;

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
  // 文字モード：音源の有無に関係なく、端末内の歌詞とコールから全文コール表を作る（同期モードの処理とは独立）
  const textModeEnabled = isLiveCallTextModeEnabled();
  elements.tabs.hidden = !textModeEnabled;
  applyMode(textModeEnabled ? currentMode : MODE.SYNC);
  if (textModeEnabled) renderTextPanel(songId);
  elements.fullscreenButton.hidden = true;
  elements.noLyricsNotice.hidden = true;
  elements.playbackErrorNotice.hidden = true;
  elements.lyricsPanel.hidden = true;

  // 【QAで発見・修正：2026-09-07】IndexedDB自体が読み取りに失敗した場合（例外を投げた
  // 場合）にtry/catchが無く、未処理のPromise rejectionになっていた。下のblobが無い
  // 場合と同じ案内文で扱う。
  let blob;
  try {
    blob = await getAudioBlob(songId);
  } catch (error) {
    console.warn("ライブコールモード用の音源の読み込みに失敗しました", error);
    blob = null;
  }
  if (!blob) {
    elements.noLyricsNotice.hidden = false;
    elements.noLyricsNotice.textContent =
      "この曲の音源が読み込まれていません。ホームの「設定・データ管理」→「データ管理」から先に取り込んでください。";
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
  elements.textPanel.textContent = "";
}

// ===== 文字モード =====

function applyMode(mode) {
  currentMode = mode;
  const isText = mode === MODE.TEXT;
  elements.playerScreen.classList.toggle("is-text-mode", isText);
  elements.textPanel.hidden = !isText;
  elements.tabSync.classList.toggle("is-active", !isText);
  elements.tabText.classList.toggle("is-active", isText);
  elements.tabSync.setAttribute("aria-selected", String(!isText));
  elements.tabText.setAttribute("aria-selected", String(isText));
}

async function renderTextPanel(songId) {
  const panel = elements.textPanel;
  panel.textContent = "";
  let lyricsRecord = null;
  let callRecord = null;
  try {
    [lyricsRecord, callRecord] = await Promise.all([getLyricsData(songId), getCallData(songId)]);
  } catch (error) {
    console.warn("文字モード：歌詞・コールの読み込みに失敗しました", error);
  }
  if (songId !== currentSongId) return; // 読み込み中に別の曲へ移った
  const lines = Array.isArray(lyricsRecord?.lines) ? lyricsRecord.lines : [];
  const calls = Array.isArray(callRecord?.calls) ? callRecord.calls : [];
  const note = document.createElement("p");
  note.className = "live-call-text-note";
  if (lines.length === 0 && calls.length === 0) {
    note.textContent = "この曲の歌詞データとコールデータがこの端末にありません。データ管理から読み込むと表示できます。";
    panel.appendChild(note);
    return;
  }
  // 承認済みの配置・文章を当てはめる（端末のコールが承認したときと違えば当てはめず、未確認として表示する）
  const resolved = resolveApprovedCallText(calls, APPROVED_CALL_TEXT_PLACEMENTS[songId] ?? null);
  const approved = resolved.approved;
  if (lines.length === 0) {
    note.textContent = "この曲の歌詞データがこの端末にありません（インスト曲の場合はコールだけを順に表示します）。歌詞データはデータ管理から読み込めます。";
  } else if (calls.length === 0) {
    note.textContent = "この曲にはまだコールが登録されていません（歌詞だけを表示しています）。";
  } else if (resolved.mismatch) {
    note.textContent = "この端末のコールデータが、位置を確認したときの内容と違うため、確認済みの配置は使わず自動配置で表示しています（「配置要確認」の所は1行前後ずれている可能性があります）。";
  } else if (approved) {
    note.textContent = "歌詞は黒、コールは赤で表示しています。コールの位置は確認済みです。";
  } else {
    note.textContent = "歌詞は黒、コールは赤で表示しています。この曲のコールの位置はまだ確認前の自動配置です（「配置要確認」の所は1行前後ずれている可能性があります）。";
  }
  panel.appendChild(note);
  const layout = buildCallTextLayout(lines, resolved.calls, { overrides: resolved.overrides });
  const body = document.createElement("div");
  panel.appendChild(body);
  renderCallTextView(body, layout, { showReview: !approved });
}

function handleSwipeStart(event) {
  if (elements.tabs.hidden || event.touches.length !== 1) {
    swipeStart = null;
    return;
  }
  const touch = event.touches[0];
  const fromEdge = touch.clientX < SWIPE_EDGE_PX || touch.clientX > window.innerWidth - SWIPE_EDGE_PX;
  swipeStart = fromEdge ? null : { x: touch.clientX, y: touch.clientY, time: Date.now() };
}

function handleSwipeEnd(event) {
  if (!swipeStart) return;
  const touch = event.changedTouches[0];
  const dx = touch.clientX - swipeStart.x;
  const dy = touch.clientY - swipeStart.y;
  const elapsed = Date.now() - swipeStart.time;
  swipeStart = null;
  // 縦スクロール中・ゆっくりした操作では切り替えない（歌詞のスクロールと競合させない）
  if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < Math.abs(dy) * 2 || elapsed > 700) return;
  if (dx < 0 && currentMode === MODE.SYNC) selectMode(MODE.TEXT);
  else if (dx > 0 && currentMode === MODE.TEXT) selectMode(MODE.SYNC);
}

function selectMode(mode) {
  if (mode === currentMode) return;
  playSfx(SFX_EVENTS.UI_CLICK);
  applyMode(mode);
  if (mode === MODE.TEXT && currentSongId && !elements.textPanel.childElementCount) renderTextPanel(currentSongId);
}

function handlePlayButtonClick() {
  if (!currentSongId) return;
  if (elements.audio.paused) {
    notifyPlaybackStarting("liveCallMode");
    // 【QAで発見・修正：2026-09-07】以前はplay()が拒否された場合に何も起きず、押しても
    // 無反応に見えていた（js/songlist.jsの試聴プレイヤーが2026-09-05に同じ理由で
    // 修正済みだったのと同じ不具合形状）。この画面は音源の再生自体が主目的のため、
    // 案内文を出して気付けるようにする。
    elements.playbackErrorNotice.hidden = true;
    elements.audio.play().catch(() => {
      syncPlayButtonIcon();
      elements.playbackErrorNotice.hidden = false;
    });
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
//   seekBackButton, audio, lyricsPanel, fullscreenButton, noLyricsNotice,
//   playbackErrorNotice: 再生画面
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

  elements.tabSync.addEventListener("click", () => selectMode(MODE.SYNC));
  elements.tabText.addEventListener("click", () => selectMode(MODE.TEXT));
  elements.middleZone.addEventListener("touchstart", handleSwipeStart, { passive: true });
  elements.middleZone.addEventListener("touchend", handleSwipeEnd, { passive: true });
}
