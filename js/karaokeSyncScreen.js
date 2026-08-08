// ライブコールモード「カラオケ同期・初心者ナビ」画面。
//
// 【設計の要・同期エンジン】カラオケ側の音源はアプリから一切操作できないため、この画面専用の
// 「偽の再生要素」（KaraokeClockSourceクラス。EventTargetを継承し、currentTimeプロパティだけ持つ）
// を用意し、js/lyricsSync.jsのloadLyricsForSong()・js/callSync.jsのloadCallsForSong()に、
// 本物の<audio>要素の代わりとして渡す。この2つのモジュールは「timeupdateイベントが来たら
// audioElement.currentTimeを読む」という決まりごとだけで動いているため、本物の<audio>要素で
// なくても問題なく動作する。これにより、通常再生画面（js/liveCallModeScreen.js）が使っている
// 歌詞＋コールの同期表示・短いコールの飛び出しバースト演出・長いコールの持続表示演出を、
// 1行もコピーせずにそのまま再利用できる（実装を2箇所に複製しないという、このプロジェクト
// 全体の一貫した方針に沿う）。
//
// 「今何秒か」の計算そのもの（同期開始時刻・offset補正・同期ポイント選定など）は
// js/karaokeSync.jsの純粋関数にすべて任せ、このファイルはDOM操作・タイマー・振動・
// 端末音源の再生・localStorageへの設定保存だけを担当する。
//
// 【UI/UX第2版・2026-08-09】本人の実機フィードバックを受け、次の3点を中心に全面刷新した。
//  1. 端末音源のON/OFF（家での練習用。実際のカラオケではOFFのまま使う）。
//     同期の基準時刻（js/karaokeSync.js側の状態）とは完全に切り離しており、
//     「早い／遅い」「今！」の補正は表示側の時計だけを動かし、音源自体はseekしない
//     （本人の希望どおり。音源はあくまで「実際のカラオケ音源の代用品」という位置づけ）。
//  2. 「今！」ボタンを最重要操作として、画面下部の固定ゾーンに常時大きく表示する。
//     歌詞・コールの表示内容がどれだけ変わっても、この下部ゾーンの位置は動かない
//     （css/style.cssの3ゾーンflexレイアウト定義を参照。ページ本体のスクロールに
//     依存しない設計にしている）。
//  3. 「全文表示」ボタンが押せなかった不具合を修正。原因は前バージョンで参考パネル全体に
//     pointer-events:noneをかけていたことで、パネル内の表示切替ボタン
//     （lyricsSync.js/callSync.jsが描画するボタン）も巻き添えで押せなくなっていた。
//     css/style.cssで、pointer-events:noneの対象を歌詞行・コール行自体だけに絞り込んで解決した。

import { getCallData } from "./callStorage.js";
import { getSongById } from "./data/songs.js";
import { getAudioBlob } from "./audioStorage.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { loadCallsForSong, destroyCallSync } from "./callSync.js";
import {
  createKaraokeSyncState,
  startKaraokeSync,
  resetKaraokeSync,
  getKaraokePositionSec,
  reportCallTooEarly,
  reportCallTooLate,
  resyncToPosition,
  findActiveCallIndex,
  findNextCall,
  selectSyncPointCandidates,
  findCurrentOrNextSyncPoint,
  shouldShowSyncCheck,
  formatOffsetLabel,
  formatKaraokeMmSs,
  getNextCallCountdownDisplay,
} from "./karaokeSync.js";

// ===== 設定の保存（端末ごと。既存のsfx設定等と同じ命名規則・保存方式） =====
const BEGINNER_NAV_STORAGE_KEY = "equalLoveIntroQuiz.karaokeBeginnerNavEnabled";
const VIBRATION_STORAGE_KEY = "equalLoveIntroQuiz.karaokeVibrationEnabled";

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
export function isKaraokeVibrationEnabled() {
  return readBooleanSetting(VIBRATION_STORAGE_KEY, true);
}
export function setKaraokeVibrationEnabled(enabled) {
  localStorage.setItem(VIBRATION_STORAGE_KEY, String(enabled));
}

// 振動は対応端末だけで動かす（progressive enhancement）。非対応環境（iPhoneのSafari/PWA等）で
// 例外を出さないよう、必ず関数の存在確認をしてから呼ぶ。
function vibrateIfSupported(pattern) {
  if (!isKaraokeVibrationEnabled()) return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // 端末側の制限で失敗しても、アプリの動作には影響させない。
  }
}

// lyricsSync.js／callSync.jsに「本物の<audio>要素」の代わりとして渡す、時計だけの偽物。
// currentTimeを外から書き換えたあとdispatchEvent(new Event("timeupdate"))するだけで、
// 両モジュールの同期表示ロジックがそのまま動く。
class KaraokeClockSource extends EventTarget {
  constructor() {
    super();
    this.currentTime = 0;
  }
}

const TICK_INTERVAL_MS = 150; // 秒数表示・ハイライト更新の間隔（本人指示：毎フレームDOMを作り直さない）
const OFFSET_STEP_NORMAL_MS = 250;
const OFFSET_STEP_FINE_MS = 100;
const OFFSET_STEP_BIG_MS = 500;
const SYNC_CHECK_VISIBLE_SEC = 6; // 同期チェックバナーを表示し続ける秒数
const VIBRATE_LEAD_SEC = 2; // コールの何秒前に予告振動するか
const TOAST_VISIBLE_MS = 1400;

let elements = null;
let clockSource = null;
let currentSongId = null;
let allCalls = []; // 曲全体のコール（start昇順）
let syncPointCandidates = [];
let syncState = createKaraokeSyncState();
let tickTimerId = null;
let toastHideTimeoutId = null;

// 端末音源（家での練習用）。同期の基準時刻とは独立しており、offset補正で
// seekされることはない（曲スタート時に0秒から再生するだけ）。
let deviceAudioObjectUrl = null;
let deviceAudioRequested = false; // 開始前パネルのラジオで選んだ、次にスタートするときの希望値

// 同じ状態を毎回DOMへ書き込まないための「前回描画した値」の記録（変わったときだけ更新する）。
let lastRenderedNextCall = undefined;
let lastRenderedCountdownPhase = null;
let lastRenderedCountdownText = null;
let lastRenderedEyebrowText = null;
let lastRenderedSyncPointCall = undefined;
let lastRenderedOffsetLabel = null;
let lastRenderedResyncLabel = null;
let syncCheckLastShownAtPositionSec = null;
let syncCheckHideAtPositionSec = null;
let vibratedPreCallStarts = new Set();
let vibratedAtCallStarts = new Set();

function resetPerSongRuntimeState() {
  allCalls = [];
  syncPointCandidates = [];
  syncState = createKaraokeSyncState();
  lastRenderedNextCall = undefined;
  lastRenderedCountdownPhase = null;
  lastRenderedCountdownText = null;
  lastRenderedEyebrowText = null;
  lastRenderedSyncPointCall = undefined;
  lastRenderedOffsetLabel = null;
  lastRenderedResyncLabel = null;
  syncCheckLastShownAtPositionSec = null;
  syncCheckHideAtPositionSec = null;
  vibratedPreCallStarts = new Set();
  vibratedAtCallStarts = new Set();
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

function syncBeginnerNavUI() {
  const enabled = isKaraokeBeginnerNavEnabled();
  elements.beginnerNavToggleButton.textContent = `初心者ナビ：${enabled ? "ON" : "OFF"}`;
  elements.beginnerNavToggleButton.classList.toggle("is-muted", !enabled);
  elements.beginnerNav.hidden = !enabled;
  elements.statusChipNav.textContent = `🧭 初心者ナビ ${enabled ? "ON" : "OFF"}`;
}

function syncVibrationToggleUI() {
  const enabled = isKaraokeVibrationEnabled();
  elements.vibrationToggleButton.textContent = `振動：${enabled ? "ON" : "OFF"}`;
  elements.vibrationToggleButton.classList.toggle("is-muted", !enabled);
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

// ===== 描画 =====

function renderSyncStatus() {
  const offsetLabel = formatOffsetLabel(syncState.offsetMs);
  if (offsetLabel !== lastRenderedOffsetLabel) {
    elements.offsetLabel.textContent = offsetLabel;
    lastRenderedOffsetLabel = offsetLabel;
  }

  const resyncLabel =
    syncState.lastResyncAtPositionSec === null
      ? null
      : `最終再同期：${formatKaraokeMmSs(syncState.lastResyncAtPositionSec)}`;
  if (resyncLabel !== lastRenderedResyncLabel) {
    elements.resyncLabel.hidden = resyncLabel === null;
    elements.resyncLabel.textContent = resyncLabel ?? "";
    lastRenderedResyncLabel = resyncLabel;
  }
}

function renderNextCallAndSyncPoint(positionSec) {
  const activeIndex = findActiveCallIndex(allCalls, positionSec);
  const nextCall = activeIndex !== -1 ? allCalls[activeIndex] : findNextCall(allCalls, positionSec);
  const isCurrentlyActive = activeIndex !== -1;

  if (nextCall !== lastRenderedNextCall) {
    elements.nextCallText.textContent = nextCall ? nextCall.text : "この曲のコールは以上です";
    lastRenderedNextCall = nextCall;
  }

  if (nextCall) {
    const secondsUntil = Math.max(0, nextCall.start - positionSec);
    const display = getNextCallCountdownDisplay(secondsUntil, isCurrentlyActive);

    if (display.eyebrow !== lastRenderedEyebrowText) {
      elements.nextCallEyebrow.textContent = display.eyebrow;
      lastRenderedEyebrowText = display.eyebrow;
    }
    if (display.text !== lastRenderedCountdownText) {
      elements.nextCallCountdown.textContent = display.text;
      lastRenderedCountdownText = display.text;
    }
    if (display.phase !== lastRenderedCountdownPhase) {
      elements.nextCallCard.classList.toggle("is-imminent", display.phase === "imminent");
      elements.nextCallCard.classList.toggle("is-now", display.phase === "now");
      lastRenderedCountdownPhase = display.phase;
    }

    // 振動ナビ（対応端末のみ）：コールの約2秒前に軽く、コール開始時に少し強く。1コールにつき1回ずつ。
    if (!isCurrentlyActive && secondsUntil <= VIBRATE_LEAD_SEC && !vibratedPreCallStarts.has(nextCall.start)) {
      vibratedPreCallStarts.add(nextCall.start);
      vibrateIfSupported(40);
    }
    if (isCurrentlyActive && !vibratedAtCallStarts.has(nextCall.start)) {
      vibratedAtCallStarts.add(nextCall.start);
      vibrateIfSupported(90);
    }
  } else {
    if (lastRenderedEyebrowText !== "NEXT CALL") {
      elements.nextCallEyebrow.textContent = "NEXT CALL";
      lastRenderedEyebrowText = "NEXT CALL";
    }
    if (lastRenderedCountdownText !== "") {
      elements.nextCallCountdown.textContent = "";
      lastRenderedCountdownText = "";
    }
    if (lastRenderedCountdownPhase !== "upcoming") {
      elements.nextCallCard.classList.remove("is-imminent", "is-now");
      lastRenderedCountdownPhase = "upcoming";
    }
  }

  // 「今！」の対象（同期ポイント）表示。専門用語を避け、「聞こえたら押す」という行動で伝える。
  const syncPointCall = findCurrentOrNextSyncPoint(syncPointCandidates, positionSec);
  if (syncPointCall !== lastRenderedSyncPointCall) {
    elements.syncPointLabel.textContent = syncPointCall
      ? `このコールが聞こえたら「${syncPointCall.text}」`
      : "この曲の同期ポイントは以上です";
    lastRenderedSyncPointCall = syncPointCall;
  }

  return syncPointCall;
}

function renderSyncCheckBanner(syncPointCall, positionSec) {
  if (!isKaraokeBeginnerNavEnabled()) {
    elements.syncCheckBanner.hidden = true;
    return;
  }

  if (syncCheckHideAtPositionSec !== null && positionSec >= syncCheckHideAtPositionSec) {
    elements.syncCheckBanner.hidden = true;
    syncCheckHideAtPositionSec = null;
  }

  const shouldShow = shouldShowSyncCheck({
    nextSyncPointCall: syncPointCall,
    positionSec,
    lastShownAtPositionSec: syncCheckLastShownAtPositionSec,
  });
  if (shouldShow) {
    elements.syncCheckText.textContent = `次は「${syncPointCall.text}」。実際のカラオケと同時ならそのままでOK、ずれていたら「今！」で合わせてください。`;
    elements.syncCheckBanner.hidden = false;
    syncCheckLastShownAtPositionSec = positionSec;
    syncCheckHideAtPositionSec = positionSec + SYNC_CHECK_VISIBLE_SEC;
  }
}

function tick() {
  const positionSec = getKaraokePositionSec(syncState, performance.now());
  if (positionSec === null) return;

  clockSource.currentTime = Math.max(0, positionSec);
  clockSource.dispatchEvent(new Event("timeupdate"));

  renderSyncStatus();
  const syncPointCall = renderNextCallAndSyncPoint(positionSec);
  renderSyncCheckBanner(syncPointCall, positionSec);
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

  deviceAudioRequested = elements.deviceAudioOnRadio.checked;
  setKaraokeBeginnerNavEnabled(elements.beginnerNavOnRadio.checked);
  syncBeginnerNavUI();

  syncState = startKaraokeSync(syncState, nowMs);
  elements.startPanel.hidden = true;
  elements.syncPanel.hidden = false;
  elements.footerZone.hidden = false;
  elements.statusBar.hidden = false;

  if (deviceAudioRequested) {
    await startDeviceAudioPlayback();
  }
  elements.statusChipAudio.hidden = !deviceAudioRequested;

  startTickLoop();
  tick();
}

// 端末音源（家での練習用）を、曲スタートと同時に0秒から再生する。
// 未読み込みの曲ではエラーにせず、静かに「端末音源はOFFのまま同期する」扱いにする
// （本人指示：「エラーにせず、カラオケ音源のみで使用できる、と自然に案内する」）。
async function startDeviceAudioPlayback() {
  if (!currentSongId) return;
  const blob = await getAudioBlob(currentSongId);
  if (!blob) {
    elements.deviceAudioNotice.hidden = false;
    elements.deviceAudioNotice.textContent =
      "この曲の端末音源は読み込まれていません。カラオケ音源のみで使用できます。";
    deviceAudioRequested = false;
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

function applyOffsetAdjustment(nextState, toastText) {
  syncState = nextState;
  renderSyncStatus();
  showToast(toastText);
}

function handleResyncButtonClick() {
  const positionSec = getKaraokePositionSec(syncState, performance.now());
  if (positionSec === null) return;
  const syncPointCall = findCurrentOrNextSyncPoint(syncPointCandidates, positionSec);
  if (!syncPointCall) return;
  syncState = resyncToPosition(syncState, syncPointCall.start, performance.now());
  lastRenderedOffsetLabel = null; // 直後のtick()で必ず再描画させる
  lastRenderedResyncLabel = null;
  tick();
  showToast(`「${syncPointCall.text}」に合わせ直しました`);
}

function handleResetSyncButtonClick() {
  stopTickLoop();
  stopDeviceAudio();
  syncState = resetKaraokeSync();
  elements.startPanel.hidden = false;
  elements.syncPanel.hidden = true;
  elements.footerZone.hidden = true;
  elements.statusBar.hidden = true;
  elements.syncCheckBanner.hidden = true;
  lastRenderedNextCall = undefined;
  lastRenderedCountdownPhase = null;
  lastRenderedCountdownText = null;
  lastRenderedEyebrowText = null;
  lastRenderedSyncPointCall = undefined;
  vibratedPreCallStarts = new Set();
  vibratedAtCallStarts = new Set();
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

  // callSync.jsの決まりごとどおり、必ず歌詞を先に読み込んでから、コールを読み込む
  // （歌詞データが無い曲では、コールだけが参考パネルに追加される＝正常な劣化動作）。
  await loadLyricsForSong(songId, clockSource, elements.referencePanel);
  const hasCalls = await loadCallsForSong(songId, clockSource, elements.referencePanel);
  elements.referencePanel.hidden = !hasCalls;

  elements.startPanel.hidden = allCalls.length === 0;
  elements.noCallsNotice.hidden = allCalls.length > 0;
  elements.syncPanel.hidden = true;
  elements.footerZone.hidden = true;
  elements.statusBar.hidden = true;
  elements.syncCheckBanner.hidden = true;
  elements.deviceAudioNotice.hidden = true;
  elements.deviceAudioOffRadio.checked = true;
  elements.toast.hidden = true;

  const beginnerNavEnabled = isKaraokeBeginnerNavEnabled();
  elements.beginnerNavOnRadio.checked = beginnerNavEnabled;
  elements.beginnerNavOffRadio.checked = !beginnerNavEnabled;
  syncBeginnerNavUI();
  syncVibrationToggleUI();

  return { ok: true };
}

// この画面を離れるとき（戻る・曲を選び直す）に必ず呼ぶ。
export function closeKaraokeSyncScreen() {
  stopTickLoop();
  stopDeviceAudio();
  destroyLyricsSync();
  destroyCallSync();
  clockSource = null;
  currentSongId = null;
  syncState = createKaraokeSyncState();
}

// elements: {
//   songTitle, noCallsNotice,
//   statusBar, statusChipAudio, statusChipNav,
//   startPanel, startButton, deviceAudioOnRadio, deviceAudioOffRadio, deviceAudioNotice,
//   beginnerNavOnRadio, beginnerNavOffRadio,
//   syncPanel, offsetLabel, resyncLabel,
//   beginnerNav, syncCheckBanner, syncCheckText,
//   nextCallCard, nextCallEyebrow, nextCallText, nextCallCountdown,
//   referencePanel, deviceAudio,
//   footerZone, toast, syncPointLabel, tooEarlyButton, nowButton, tooLateButton,
//   fineEarlyButton, fineLateButton, bigEarlyButton, bigLateButton,
//   resetSyncButton, beginnerNavToggleButton, vibrationToggleButton,
// }
export function initKaraokeSyncScreen(newElements) {
  elements = newElements;

  elements.startButton.addEventListener("click", handleStartButtonClick);
  elements.tooEarlyButton.addEventListener("click", () =>
    applyOffsetAdjustment(reportCallTooEarly(syncState, OFFSET_STEP_NORMAL_MS), `${(OFFSET_STEP_NORMAL_MS / 1000).toFixed(2)}秒早めました`)
  );
  elements.tooLateButton.addEventListener("click", () =>
    applyOffsetAdjustment(reportCallTooLate(syncState, OFFSET_STEP_NORMAL_MS), `${(OFFSET_STEP_NORMAL_MS / 1000).toFixed(2)}秒遅らせました`)
  );
  elements.nowButton.addEventListener("click", handleResyncButtonClick);
  elements.fineEarlyButton.addEventListener("click", () =>
    applyOffsetAdjustment(reportCallTooEarly(syncState, OFFSET_STEP_FINE_MS), `${(OFFSET_STEP_FINE_MS / 1000).toFixed(2)}秒早めました`)
  );
  elements.fineLateButton.addEventListener("click", () =>
    applyOffsetAdjustment(reportCallTooLate(syncState, OFFSET_STEP_FINE_MS), `${(OFFSET_STEP_FINE_MS / 1000).toFixed(2)}秒遅らせました`)
  );
  elements.bigEarlyButton.addEventListener("click", () =>
    applyOffsetAdjustment(reportCallTooEarly(syncState, OFFSET_STEP_BIG_MS), `${(OFFSET_STEP_BIG_MS / 1000).toFixed(2)}秒早めました`)
  );
  elements.bigLateButton.addEventListener("click", () =>
    applyOffsetAdjustment(reportCallTooLate(syncState, OFFSET_STEP_BIG_MS), `${(OFFSET_STEP_BIG_MS / 1000).toFixed(2)}秒遅らせました`)
  );
  elements.resetSyncButton.addEventListener("click", handleResetSyncButtonClick);

  elements.beginnerNavToggleButton.addEventListener("click", () => {
    const nextEnabled = !isKaraokeBeginnerNavEnabled();
    setKaraokeBeginnerNavEnabled(nextEnabled);
    syncBeginnerNavUI();
  });
  elements.vibrationToggleButton.addEventListener("click", () => {
    setKaraokeVibrationEnabled(!isKaraokeVibrationEnabled());
    syncVibrationToggleUI();
  });
}

export function getCurrentKaraokeSongId() {
  return currentSongId;
}
