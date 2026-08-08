// ライブコールモード「カラオケ同期・初心者ナビ」画面。
//
// 【設計の要・同期エンジン】カラオケ側の音源はアプリから一切操作できないため、この画面専用の
// 「偽の再生要素」（KaraokeClockSourceクラス。EventTargetを継承し、currentTimeプロパティだけ持つ）
// を用意し、js/lyricsSync.jsのloadLyricsForSong()に、本物の<audio>要素の代わりとして渡す。
// このモジュールは「timeupdateイベントが来たらaudioElement.currentTimeを読む」という
// 決まりごとだけで動いているため、本物の<audio>要素でなくても問題なく動作する。これにより、
// 通常再生画面（js/liveCallModeScreen.js）が使っている歌詞の同期表示・ハイライト・自動スクロール・
// 全文表示切替を、1行もコピーせずにそのまま「現在の歌詞」表示として再利用できる。
//
// 「今何秒か」の計算そのもの（同期開始時刻・offset補正・一時停止・同期ポイント選定など）は
// js/karaokeSync.jsの純粋関数にすべて任せ、このファイルはDOM操作・タイマー・
// 端末音源の再生・localStorageへの設定保存だけを担当する。
//
// 【UI/UX第4版・2026-08-09】v142実機フィードバック「シンプルにしすぎて歌詞が見えなさすぎる」を
// 受け、次の3点を中心に見直した。
//  1. 歌詞をもう一度、複数行スクロール可能な状態で常時表示する。js/lyricsSync.jsのloadLyricsForSong()
//     に第4引数optionsを追加してもらい（js/lyricsSync.js側の変更、既存呼び出し元は無改修）、
//     歌詞行タップ時の処理をこの画面専用のresyncToPosition()呼び出しに差し替えている
//     （本物の<audio>要素ではないため、既定のaudioElement.currentTime代入は意味を持たない）。
//     これにより、ハイライト・自動追従スクロール・「全文表示にする」切替まで、通常再生画面と
//     完全に同じロジックを1行も複製せずに再利用できている。
//  2. 一時停止／再開を追加。js/karaokeSync.jsのpauseKaraokeSync/resumeKaraokeSyncを使い、
//     端末音源・同期時計・歌詞ハイライト・NEXT CALLカウントダウンを同時に止め、同時に再開する。
//  3. 「今！」は⋯メニューに残しつつ、歌詞タップという、より低摩擦で高頻度に使える補正手段を
//     常設した。「今！」はコールデータ（手動で0.1秒単位まで調整済み、精度が高い）を基準にでき、
//     歌詞タップは歌詞データ（一部AI補助で精度が一定でない）を基準にする、という精度の違いが
//     あるため、両方を残す判断をした（詳細はdocs/HANDOFF.md参照）。
//
// 【UI/UX第3版からの継続方針】画面全体を3ゾーン（①ヘッダー②中央スクロール③下部固定）の
// 固定レイアウトにし、歌詞・コールの表示内容がどれだけ変わっても、下部の操作ボタンの位置は
// 1pxも動かない。長いコールがカラオケHUDを乗っ取らないよう、js/callSync.jsは使わずコールデータを
// 直接扱う（詳しくは各関数のコメント参照）。

import { getCallData } from "./callStorage.js";
import { getSongById } from "./data/songs.js";
import { getAudioBlob } from "./audioStorage.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import {
  createKaraokeSyncState,
  startKaraokeSync,
  resetKaraokeSync,
  getKaraokePositionSec,
  pauseKaraokeSync,
  resumeKaraokeSync,
  adjustOffsetMs,
  resetOffsetToZero,
  resyncToPosition,
  findActiveCallIndex,
  findNextCall,
  selectSyncPointCandidates,
  findCurrentOrNextSyncPoint,
  getSecondsUntil,
  formatOffsetLabel,
  getNextCallCountdownDisplay,
  getCallDisplayTier,
} from "./karaokeSync.js";

// ===== 設定の保存（端末ごと。既存のsfx設定等と同じ命名規則・保存方式） =====
const BEGINNER_NAV_STORAGE_KEY = "equalLoveIntroQuiz.karaokeBeginnerNavEnabled";

function readBooleanSetting(key, defaultValue) {
  const saved = localStorage.getItem(key);
  if (saved === "true") return true;
  if (saved === "false") return false;
  return defaultValue;
}

export function isKaraokeBeginnerNavEnabled() {
  return readBooleanSetting(BEGINNER_NAV_STORAGE_KEY, true);
}
export function setKaraokeBeginnerNavEnabled(enabled) {
  localStorage.setItem(BEGINNER_NAV_STORAGE_KEY, String(enabled));
}

// lyricsSync.jsに「本物の<audio>要素」の代わりとして渡す、時計だけの偽物。
// currentTimeを外から書き換えたあとdispatchEvent(new Event("timeupdate"))するだけで、
// 歌詞の同期表示ロジックがそのまま動く。
class KaraokeClockSource extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
  }
}

const TICK_INTERVAL_MS = 150; // 秒数表示・ハイライト更新の間隔（本人指示：毎フレームDOMを作り直さない）
const OFFSET_STEP_FINE_MS = 100; // ±0.1秒
const OFFSET_STEP_BIG_MS = 500; // ±0.5秒
const TOAST_VISIBLE_MS = 1400;

let elements = null;
let clockSource = null;
let currentSongId = null;
let allCalls = []; // 曲全体のコール（start昇順）
let syncPointCandidates = [];
let syncState = createKaraokeSyncState();
let tickTimerId = null;
let toastHideTimeoutId = null;

// 端末音源。読み込まれていれば曲スタートと同時に常に自動再生する（選択UIは無い）。
let deviceAudioObjectUrl = null;

// 同じ状態を毎回DOMへ書き込まないための「前回描画した値」の記録（変わったときだけ更新する）。
let lastRenderedCallHudEyebrow = null;
let lastRenderedCallHudText = null;
let lastRenderedCallHudCountdown = null;
let lastRenderedCallHudPhase = null;
let lastRenderedCallHudTier = null;
let lastRenderedLongCallActive = false;
let lastRenderedOffsetLabel = null;
let lastRenderedSyncPointCall = undefined;

function resetPerSongRuntimeState() {
  allCalls = [];
  syncPointCandidates = [];
  syncState = createKaraokeSyncState();
  lastRenderedCallHudEyebrow = null;
  lastRenderedCallHudText = null;
  lastRenderedCallHudCountdown = null;
  lastRenderedCallHudPhase = null;
  lastRenderedCallHudTier = null;
  lastRenderedLongCallActive = false;
  lastRenderedOffsetLabel = null;
  lastRenderedSyncPointCall = undefined;
}

function releaseDeviceAudioObjectUrl() {
  if (deviceAudioObjectUrl !== null) {
    URL.revokeObjectURL(deviceAudioObjectUrl);
    deviceAudioObjectUrl = null;
  }
}

function stopDeviceAudio() {
  elements.deviceAudio.pause();
  elements.deviceAudio.currentTime = 0;
  releaseDeviceAudioObjectUrl();
}
registerPlaybackStopper("karaokeSync", stopDeviceAudio);

function updateBeginnerNavToggleLabel() {
  const enabled = isKaraokeBeginnerNavEnabled();
  elements.beginnerNavToggleLabel.textContent = `初心者ナビ：${enabled ? "ON" : "OFF"}`;
}

// 初心者ナビOFFのときは、HUDカードから見出し（NEXT CALL等）とカウントダウンの装飾を省き、
// コールの本文だけを見せるミニマルな表示にする（本人要望：カラオケに慣れている人はシンプルに）。
function syncBeginnerNavUI() {
  const enabled = isKaraokeBeginnerNavEnabled();
  elements.callHudCard.classList.toggle("is-nav-minimal", !enabled);
  updateBeginnerNavToggleLabel();
}

function showToast(text) {
  window.clearTimeout(toastHideTimeoutId);
  elements.toast.textContent = text;
  elements.toast.hidden = false;
  // 1フレーム空けてからクラスを付けることで、連続で押しても毎回transitionが再生される。
  elements.toast.classList.remove("is-visible");
  void elements.toast.offsetWidth;
  elements.toast.classList.add("is-visible");
  toastHideTimeoutId = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
    window.setTimeout(() => {
      elements.toast.hidden = true;
    }, 200);
  }, TOAST_VISIBLE_MS);
}

function openMoreMenu() {
  elements.moreMenuModal.hidden = false;
}
function closeMoreMenu() {
  elements.moreMenuModal.hidden = true;
}

// ===== 描画 =====

function renderSyncStatus() {
  const offsetLabel = formatOffsetLabel(syncState.offsetMs);
  if (offsetLabel !== lastRenderedOffsetLabel) {
    elements.offsetLabel.textContent = offsetLabel;
    lastRenderedOffsetLabel = offsetLabel;
  }
}

// 現在のコール／NEXT CALLを1枚のHUDカードにまとめて描画する。
// 「今まさに聞こえているコール」がある間は、その本文をtier別の大きさで主役として見せ、
// 無い間は「次に来るコール＋残り秒数」を見せる（js/karaokeSync.jsのgetNextCallCountdownDisplay
// が持つupcoming/imminent/nowの3段階をそのまま使う）。
function renderCallHud(positionSec) {
  const activeIndex = findActiveCallIndex(allCalls, positionSec);
  const isActive = activeIndex !== -1;
  const targetCall = isActive ? allCalls[activeIndex] : findNextCall(allCalls, positionSec);

  let eyebrow;
  let text;
  let countdownText;
  let phase;

  if (targetCall) {
    const secondsUntil = isActive ? 0 : getSecondsUntil(targetCall.start, positionSec);
    const display = getNextCallCountdownDisplay(secondsUntil, isActive);
    eyebrow = display.eyebrow;
    text = targetCall.text;
    countdownText = display.text;
    phase = display.phase;
  } else {
    eyebrow = "NEXT CALL";
    text = "この曲のコールは以上です";
    countdownText = "";
    phase = "upcoming";
  }

  const tier = getCallDisplayTier(text);

  if (eyebrow !== lastRenderedCallHudEyebrow) {
    elements.callHudEyebrow.textContent = eyebrow;
    lastRenderedCallHudEyebrow = eyebrow;
  }
  if (text !== lastRenderedCallHudText) {
    elements.callHudText.textContent = text;
    lastRenderedCallHudText = text;
  }
  if (countdownText !== lastRenderedCallHudCountdown) {
    elements.callHudCountdown.textContent = countdownText;
    lastRenderedCallHudCountdown = countdownText;
  }
  if (phase !== lastRenderedCallHudPhase) {
    elements.callHudCard.classList.toggle("is-imminent", phase === "imminent");
    elements.callHudCard.classList.toggle("is-now", phase === "now");
    lastRenderedCallHudPhase = phase;
  }
  if (tier !== lastRenderedCallHudTier) {
    elements.callHudCard.classList.remove("is-tier-short", "is-tier-medium", "is-tier-long");
    elements.callHudCard.classList.add(`is-tier-${tier}`);
    lastRenderedCallHudTier = tier;
  }

  // 長い口上・MIXが実際に鳴っている間だけ、歌詞コンテキストを控えめにしてコール本文を主役にする
  // （本人指示：歌詞を完全には消さない。終わったら自動で元の表示に戻す）。
  const longCallActive = isActive && tier === "long";
  if (longCallActive !== lastRenderedLongCallActive) {
    elements.syncPanel.classList.toggle("is-long-call-active", longCallActive);
    lastRenderedLongCallActive = longCallActive;
  }

  // 「今！」メニュー項目の説明文（同期ポイント）も、ついでにここで更新する。
  const syncPointCall = findCurrentOrNextSyncPoint(syncPointCandidates, positionSec);
  if (syncPointCall !== lastRenderedSyncPointCall) {
    elements.syncPointLabel.textContent = syncPointCall
      ? `聞こえたら押してください：「${syncPointCall.text}」`
      : "この曲の同期ポイントは以上です";
    lastRenderedSyncPointCall = syncPointCall;
  }
}

function tick() {
  const positionSec = getKaraokePositionSec(syncState, performance.now());
  if (positionSec === null) return;

  // 歌詞パネル側（js/lyricsSync.js）のハイライト・自動スクロールは、この偽時計への
  // timeupdateイベントで駆動される。一時停止中はgetKaraokePositionSec自体が凍結された
  // 位置を返すため、ここで改めて何かを止める必要はない（常に同じ値を返し続けるだけ）。
  clockSource.currentTime = Math.max(0, positionSec);
  clockSource.dispatchEvent(new Event("timeupdate"));

  renderSyncStatus();
  renderCallHud(positionSec);
}

function startTickLoop() {
  stopTickLoop();
  tickTimerId = window.setInterval(tick, TICK_INTERVAL_MS);
}
function stopTickLoop() {
  if (tickTimerId !== null) {
    window.clearInterval(tickTimerId);
    tickTimerId = null;
  }
}

// ===== 操作 =====

async function handleStartButtonClick() {
  // 重要：performance.now()はこのハンドラの一番最初で取得する（DOM更新・アニメーションを待たない）。
  const nowMs = performance.now();

  syncState = startKaraokeSync(syncState, nowMs);
  elements.startPanel.hidden = true;
  elements.syncPanel.hidden = false;
  elements.footerZone.hidden = false;
  elements.moreMenuButton.hidden = false;
  elements.deviceAudioNotice.hidden = true;
  elements.songEndBanner.hidden = true;

  syncBeginnerNavUI();
  updatePauseResumeButtonUI();
  await startDeviceAudioPlayback();

  startTickLoop();
  tick();
}

// 端末音源を、曲スタートと同時に0秒から自動再生する（選択UIは無く、常に試みる）。
// 未読み込みの曲ではエラーにせず、静かに「端末音源なしで同期する」旨を案内して続行する。
async function startDeviceAudioPlayback() {
  if (!currentSongId) return;
  const blob = await getAudioBlob(currentSongId);
  if (!blob) {
    elements.deviceAudioNotice.hidden = false;
    elements.deviceAudioNotice.textContent =
      "端末音源なしで同期します（この曲の音源データは読み込まれていません）。";
    return;
  }

  notifyPlaybackStarting("karaokeSync");
  releaseDeviceAudioObjectUrl();
  deviceAudioObjectUrl = URL.createObjectURL(blob);
  elements.deviceAudio.src = deviceAudioObjectUrl;
  elements.deviceAudio.currentTime = 0;
  try {
    await elements.deviceAudio.play();
  } catch {
    // 自動再生が拒否された場合も、同期タイマー自体は正常に動き続けるため、
    // ここでは静かに諦める（コールのタイミング表示自体はそのまま使える）。
  }
}

// 端末音源が最後まで再生し終えたときの案内（本人指示：「同期中」のまま延々と残らないように）。
// 端末音源が無い（＝そもそも鳴っていない）場合はこのイベント自体が発火しないため、
// カラオケ本体側の終了はユーザー自身の判断（「戻る」等）に委ねる、という自然な設計になる。
function handleDeviceAudioEnded() {
  elements.songEndBanner.hidden = false;
}

// ===== 一時停止／再開（UI/UX第4版で追加） =====
// 「0秒へ戻す完全停止」ではなく、今の位置から再開できる一時停止。端末音源・同期時計・
// 歌詞ハイライト・NEXT CALLカウントダウンを同時に止め、同時に再開する（本人の最重要要望）。
function updatePauseResumeButtonUI() {
  const isPaused = syncState.isPaused;
  elements.pauseResumeButton.classList.toggle("is-paused", isPaused);
  elements.pauseResumeButton.setAttribute("aria-label", isPaused ? "再開する" : "一時停止する");
}

function handlePauseResumeClick() {
  const nowMs = performance.now();
  if (syncState.isPaused) {
    syncState = resumeKaraokeSync(syncState, nowMs);
    if (elements.deviceAudio.src) {
      notifyPlaybackStarting("karaokeSync");
      elements.deviceAudio.play().catch(() => {});
    }
    startTickLoop();
  } else {
    syncState = pauseKaraokeSync(syncState, nowMs);
    elements.deviceAudio.pause();
    stopTickLoop();
  }
  updatePauseResumeButtonUI();
  tick(); // 停止した瞬間・再開した瞬間の位置を、次のtickを待たずに即座に描画へ反映する
}

// タイミング調整だけを一瞬でリセットする「0秒に戻す」も、この画面全体の状態リセットである
// resetToStartPanel()とは別物（前者はjs/karaokeSync.jsのresetOffsetToZero、後者はここ）。
function applyOffsetDelta(deltaMs) {
  syncState = adjustOffsetMs(syncState, deltaMs);
  renderSyncStatus();
  const direction = deltaMs > 0 ? "早めました" : "遅らせました";
  showToast(`${(Math.abs(deltaMs) / 1000).toFixed(1)}秒${direction}`);
}

function handleOffsetResetClick() {
  syncState = resetOffsetToZero(syncState);
  renderSyncStatus();
  showToast("タイミング調整を0秒に戻しました");
}

function handleResyncButtonClick() {
  if (!syncState.isSyncing) {
    closeMoreMenu();
    return;
  }
  const positionSec = getKaraokePositionSec(syncState, performance.now());
  const syncPointCall = findCurrentOrNextSyncPoint(syncPointCandidates, positionSec ?? 0);
  if (!syncPointCall) {
    closeMoreMenu();
    return;
  }
  syncState = resyncToPosition(syncState, syncPointCall.start, performance.now());
  lastRenderedOffsetLabel = null; // 直後のtick()で必ず再描画させる
  tick();
  showToast(`「${syncPointCall.text}」に合わせ直しました`);
  closeMoreMenu();
}

// 歌詞行タップ（js/lyricsSync.jsのoptions.onLineClickフック経由）：端末音源・同期時計・
// 現在歌詞・現在コール・NEXT CALL・カウントダウンを、まとめてその歌詞行のstart時刻へ合わせる。
// 一時停止中でもタップでき、一時停止状態自体は維持される（js/karaokeSync.jsのresyncToPosition
// 参照）。既存のoffset（早める/遅らせるの蓄積）は、この呼び出し1回で新しい値に上書きされるため、
// 別途ゼロへ戻す処理は不要（「今！」ボタンと全く同じ仕組み）。
function handleLyricTapSeek(line) {
  if (!syncState.isSyncing) return;
  const nowMs = performance.now();
  syncState = resyncToPosition(syncState, line.start, nowMs);
  if (elements.deviceAudio.src) {
    elements.deviceAudio.currentTime = line.start;
  }
  lastRenderedOffsetLabel = null;
  tick();
  showToast("この位置に合わせました");
}

function handleBeginnerNavToggleClick() {
  setKaraokeBeginnerNavEnabled(!isKaraokeBeginnerNavEnabled());
  syncBeginnerNavUI();
  closeMoreMenu();
}

// 曲そのものを最初からやり直す＝開始前パネルへ戻す（タイミング調整だけをやり直す
// 「0秒に戻す」とは異なり、同期・音源再生を完全に止めて最初の状態に戻す）。
function resetToStartPanel() {
  stopTickLoop();
  stopDeviceAudio();
  syncState = resetKaraokeSync();
  elements.startPanel.hidden = false;
  elements.syncPanel.hidden = true;
  elements.footerZone.hidden = true;
  elements.moreMenuButton.hidden = true;
  elements.songEndBanner.hidden = true;
  elements.deviceAudioNotice.hidden = true;
  elements.syncPanel.classList.remove("is-long-call-active");
  updatePauseResumeButtonUI();
  lastRenderedCallHudEyebrow = null;
  lastRenderedCallHudText = null;
  lastRenderedCallHudCountdown = null;
  lastRenderedCallHudPhase = null;
  lastRenderedCallHudTier = null;
  lastRenderedLongCallActive = false;
  lastRenderedSyncPointCall = undefined;
}

function handleRestartSongButtonClick() {
  resetToStartPanel();
  closeMoreMenu();
}

// ===== 画面の開閉 =====

// 指定した曲のカラオケ同期画面を開く。呼び出し前に、通常再生側は必ず閉じておくこと
// （main.js側でclosePlayerを呼んでから遷移する想定。同じ<audio>要素を共有しないため、
// 通常再生とカラオケ同期を同時に開くことはできない設計）。
export async function openKaraokeSyncScreen(songId) {
  closeKaraokeSyncScreen();

  const song = getSongById(songId);
  if (!song) return { ok: false };

  currentSongId = songId;
  elements.songTitle.textContent = song.title;
  resetPerSongRuntimeState();

  const callRecord = await getCallData(songId);
  allCalls = callRecord && Array.isArray(callRecord.calls) ? [...callRecord.calls].sort((a, b) => a.start - b.start) : [];
  syncPointCandidates = selectSyncPointCandidates(allCalls);

  clockSource = new KaraokeClockSource();
  // 「現在の歌詞」表示パネル（js/lyricsSync.jsをそのまま再利用）。歌詞データが無い曲では
  // 何も描画されず、パネルは自動的に非表示のままになる。行タップはhandleLyricTapSeek()へ。
  await loadLyricsForSong(songId, clockSource, elements.lyricsContextPanel, { onLineClick: handleLyricTapSeek });

  elements.startPanel.hidden = allCalls.length === 0;
  elements.noCallsNotice.hidden = allCalls.length > 0;
  elements.syncPanel.hidden = true;
  elements.syncPanel.classList.remove("is-long-call-active");
  elements.footerZone.hidden = true;
  elements.moreMenuButton.hidden = true;
  elements.songEndBanner.hidden = true;
  elements.deviceAudioNotice.hidden = true;
  elements.toast.hidden = true;

  syncBeginnerNavUI();
  updatePauseResumeButtonUI();

  return { ok: true };
}

// この画面を離れるとき（戻る・曲を選び直す）に必ず呼ぶ。
export function closeKaraokeSyncScreen() {
  stopTickLoop();
  stopDeviceAudio();
  destroyLyricsSync();
  clockSource = null;
  currentSongId = null;
  syncState = createKaraokeSyncState();
}

// elements: {
//   songTitle, noCallsNotice, moreMenuButton,
//   startPanel, startButton,
//   deviceAudioNotice,
//   syncPanel, lyricsContextPanel,
//   callHudCard, callHudEyebrow, callHudText, callHudCountdown,
//   songEndBanner, songEndRestartButton, songEndChooseButton,
//   deviceAudio,
//   footerZone, toast,
//   pauseResumeButton,
//   offsetMinus05Button, offsetMinus01Button, offsetResetButton, offsetPlus01Button, offsetPlus05Button,
//   offsetLabel,
//   moreMenuModal, moreMenuCloseButton,
//   nowButton, syncPointLabel,
//   beginnerNavToggleButton, beginnerNavToggleLabel,
//   restartSongButton,
//   onRequestChooseSong: 「曲を選ぶ」（曲終了バナー）が押されたときに呼ばれるコールバック,
// }
export function initKaraokeSyncScreen(newElements) {
  elements = newElements;

  elements.startButton.addEventListener("click", handleStartButtonClick);
  elements.deviceAudio.addEventListener("ended", handleDeviceAudioEnded);
  elements.pauseResumeButton.addEventListener("click", handlePauseResumeClick);

  elements.offsetMinus05Button.addEventListener("click", () => applyOffsetDelta(-OFFSET_STEP_BIG_MS));
  elements.offsetMinus01Button.addEventListener("click", () => applyOffsetDelta(-OFFSET_STEP_FINE_MS));
  elements.offsetResetButton.addEventListener("click", handleOffsetResetClick);
  elements.offsetPlus01Button.addEventListener("click", () => applyOffsetDelta(OFFSET_STEP_FINE_MS));
  elements.offsetPlus05Button.addEventListener("click", () => applyOffsetDelta(OFFSET_STEP_BIG_MS));

  elements.moreMenuButton.addEventListener("click", openMoreMenu);
  elements.moreMenuCloseButton.addEventListener("click", closeMoreMenu);
  elements.moreMenuModal.addEventListener("click", (event) => {
    if (event.target === elements.moreMenuModal) closeMoreMenu();
  });

  elements.nowButton.addEventListener("click", handleResyncButtonClick);
  elements.beginnerNavToggleButton.addEventListener("click", handleBeginnerNavToggleClick);
  elements.restartSongButton.addEventListener("click", handleRestartSongButtonClick);

  elements.songEndRestartButton.addEventListener("click", () => {
    resetToStartPanel();
  });
  elements.songEndChooseButton.addEventListener("click", () => {
    resetToStartPanel();
    if (typeof elements.onRequestChooseSong === "function") {
      elements.onRequestChooseSong();
    }
  });
}

export function getCurrentKaraokeSongId() {
  return currentSongId;
}
