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
// 【UI/UX第6版・2026-08-10】実機フィードバックを受け、一時停止まわりを再設計した。
//  1. 「一時停止していた時間の長さだけタイミング補正値がズレる」不具合を修正。
//     js/karaokeSync.js側で「再生位置」と「タイミング補正値」を状態としても完全に分離した
//     （詳細はjs/karaokeSync.jsの冒頭コメント参照）。
//  2. 第5版で追加した「楽曲だけ／コール同期だけ」を個別に一時停止できる⋯メニュー項目は、
//     実際に使うと2つの時計がズレて初心者には分かりにくいという本人指摘を受けて削除した。
//     今は常にメインボタン1つで「両方まとめて」止める・再開するだけのシンプルな挙動にしている
//     （判断の理由はdocs/HANDOFF.md参照）。
//  3. NEXT CALLカードに、その先1〜2件のコールをごく小さく予告する行を追加した
//     （現在／次のコールより優先度を下げた副次的な情報のため、長文MIXが実際に鳴っている間や
//     初心者ナビOFF中は表示しない）。
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
  getUpcomingCallPreviews,
  getCallPreviewLabel,
} from "./karaokeSync.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { getLyricsData } from "./lyricsStorage.js";
// 【2026-10-30 夜】新しいカラオケ（options.calls 付きで開いたとき）だけの演出。前のカラオケ同期では1つも使わない
import {
  enableKaraokeStage,
  disableKaraokeStage,
  resetKaraokeStage,
  setKaraokeStagePaused,
  showKaraokeStageFinale,
  updateKaraokeStage,
  setKaraokeStageOffset,
  karaokePreviewLabel,
  setKaraokeCallsVisible,
  areKaraokeCallsVisible,
  karaokeStageHasCalls,
  mountKaraokeCallRows,
  loadKaraokeCallsVisible,
  saveKaraokeCallsVisible,
  isKaraokeOffsetSuspicious,
} from "./karaokeStage.js";
import { buildModeTabs } from "./liveCallModeTabs.js";

// ===== 設定の保存（端末ごと。既存のsfx設定等と同じ命名規則・保存方式） =====
const BEGINNER_NAV_STORAGE_KEY = "equalLoveIntroQuiz.karaokeBeginnerNavEnabled";

function readBooleanSetting(key, defaultValue) {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "true") return true;
    if (saved === "false") return false;
    return defaultValue;
  } catch {
    return defaultValue;
  }
}

export function isKaraokeBeginnerNavEnabled() {
  return readBooleanSetting(BEGINNER_NAV_STORAGE_KEY, true);
}
export function setKaraokeBeginnerNavEnabled(enabled) {
  try {
    localStorage.setItem(BEGINNER_NAV_STORAGE_KEY, String(enabled));
  } catch {
    // 保存に失敗しても（プライベートブラウズ・ストレージ容量超過等）アプリ自体は動き続けられるようにする。
  }
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
const NEXT_CALL_PREVIEW_COUNT = 2; // NEXT CALLカードで、その先何件まで予告するか

let elements = null;
let clockSource = null;
let currentSongId = null;
let allCalls = []; // 曲全体のコール（start昇順）
let syncPointCandidates = [];
let syncState = createKaraokeSyncState();
let tickTimerId = null;
let tickFrameId = null; // 新しいカラオケだけ：毎フレーム（requestAnimationFrame）で描く
let lastFrameTickAt = -Infinity;
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
let lastRenderedPreviewKey = null;

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
  lastRenderedPreviewKey = null;
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
    // 【2026-10-31 live-unify】新しいカラオケだけ：ありえない大きさ（±10秒を超える）の調整に注意を出す（値は消さない。戻すのは本人が［0に戻す］で）
    if (followDeviceAudio && kx?.offsetWarning) {
      kx.offsetWarning.textContent = isKaraokeOffsetSuspicious(syncState.offsetMs)
        ? `タイミング調整が ${offsetLabel} になっています。ふつうは数秒以内です。歌詞・コールが音とずれているときは［0に戻す］を押してください。`
        : "";
    }
  }
  // 【2026-10-30 fix-live】新しいカラオケだけ：調整しているか（「0に戻す」の見た目を、調整なしのときは普通にする）
  if (followDeviceAudio) setKaraokeStageOffset(syncState.offsetMs);
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

  // NEXT予告：今表示している主役コールの、さらに先1〜2件を小さく予告する（UI/UX第6版で追加）。
  // 優先度は「現在／もうすぐのコール」＞「この予告」の順（本人指示）のため、長文MIXが実際に
  // 鳴っている間（読みやすさを最優先したい場面）は表示しない。
  const showPreviews = targetCall !== null && !longCallActive;
  const previewCalls = showPreviews ? getUpcomingCallPreviews(allCalls, targetCall.start, NEXT_CALL_PREVIEW_COUNT) : [];
  renderCallHudPreviews(previewCalls);

  // 「今！」メニュー項目の説明文（同期ポイント）も、ついでにここで更新する。
  const syncPointCall = findCurrentOrNextSyncPoint(syncPointCandidates, positionSec);
  if (syncPointCall !== lastRenderedSyncPointCall) {
    elements.syncPointLabel.textContent = syncPointCall
      ? `聞こえたら押してください：「${syncPointCall.text}」`
      : "この曲の同期ポイントは以上です";
    lastRenderedSyncPointCall = syncPointCall;
  }
}

// NEXT予告の2枠（callHudPreviewItem1/2）へ、予告するコールのラベルを描画する。
// 件数が変わる／中身が変わるとき以外は何もしない（同じ理由でtargetCallが変わらない限り
// tickのたびに再計算してもキー文字列が変わらないため、DOM書き込みは発生しない）。
function renderCallHudPreviews(previewCalls) {
  const key = previewCalls.map((call) => call.start).join(",");
  if (key === lastRenderedPreviewKey) return;
  lastRenderedPreviewKey = key;

  elements.callHudPreviewRow.hidden = previewCalls.length === 0;

  const first = previewCalls[0] ?? null;
  const second = previewCalls[1] ?? null;
  // 【2026-10-30 fix-live】新しいカラオケだけ、長いコールを「固有コール」などの種類の名前にせず、コールの文字の始めの部分を出す
  const previewLabel = followDeviceAudio ? karaokePreviewLabel : getCallPreviewLabel;
  elements.callHudPreviewItem1.hidden = !first;
  elements.callHudPreviewItem1.textContent = first ? previewLabel(first) : "";
  elements.callHudPreviewItem2.hidden = !second;
  elements.callHudPreviewItem2.textContent = second ? previewLabel(second) : "";
}

// 【2026-10-29】新しいライブコールのカラオケ（本人の完成版のコールを渡したとき）は、端末の音源が鳴っていれば
// 「音源の再生位置」を時計にする（文字モードと同じ基準）。今までの時計（曲スタートを押した時刻からの経過）だと、
// 音源の読み込みにかかった時間の分だけ、コール・歌詞と音がずれていた。タイミング補正（±0.1秒など）はそのまま足す
let followDeviceAudio = false;
function currentPositionSec() {
  if (followDeviceAudio && syncState.isSyncing && hasDeviceAudioLoaded() && elements.deviceAudio.readyState >= 2) {
    return elements.deviceAudio.currentTime + syncState.offsetMs / 1000;
  }
  return getKaraokePositionSec(syncState, performance.now());
}

function tick() {
  const positionSec = currentPositionSec();
  if (positionSec === null) return;

  // 歌詞パネル側（js/lyricsSync.js）のハイライト・自動スクロールは、この偽時計への
  // timeupdateイベントで駆動される。一時停止中はgetKaraokePositionSec自体が凍結された
  // 位置を返すため、ここで改めて何かを止める必要はない（常に同じ値を返し続けるだけ）。
  clockSource.currentTime = Math.max(0, positionSec);
  clockSource.dispatchEvent(new Event("timeupdate"));

  renderSyncStatus();
  renderCallHud(positionSec);
  // 新しいカラオケだけ：演出（js/karaokeStage.js）。見た目はこの時刻だけから決まる
  if (followDeviceAudio) updateKaraokeStage(positionSec, { ended: elements.deviceAudio.ended });
  if (followDeviceAudio) renderKaraokeSeek();
}

// 前のカラオケ同期：今までどおり 0.15 秒ごと（setInterval）。
// 新しいカラオケ：コールの始まりの光・進み具合のバーをなめらかにするため毎フレーム（requestAnimationFrame）。
//   画面が隠れている間は requestAnimationFrame 自体が止まる。端末の音源が止まっている間（読み込み中・曲の終わり）は
//   今までと同じ 0.15 秒ごとに間引く（止まっている間に毎フレーム描かない）
function startTickLoop() {
  stopTickLoop();
  if (followDeviceAudio) {
    lastFrameTickAt = -Infinity;
    const loop = (now) => {
      tickFrameId = window.requestAnimationFrame(loop);
      // 音源が止まっている・この画面が隠れている（端末の「戻る」で別の画面へ移った等）ときは、0.15 秒ごとに間引く
      const audioIdle = hasDeviceAudioLoaded() && elements.deviceAudio.paused;
      const screenHidden = !elements.callHudCard.closest(".screen")?.classList.contains("is-active");
      if ((audioIdle || screenHidden) && now - lastFrameTickAt < TICK_INTERVAL_MS) return;
      lastFrameTickAt = now;
      tick();
    };
    tickFrameId = window.requestAnimationFrame(loop);
    return;
  }
  tickTimerId = window.setInterval(tick, TICK_INTERVAL_MS);
}
function stopTickLoop() {
  if (tickTimerId !== null) {
    window.clearInterval(tickTimerId);
    tickTimerId = null;
  }
  if (tickFrameId !== null) {
    window.cancelAnimationFrame(tickFrameId);
    tickFrameId = null;
  }
}

// ===== 操作 =====

async function handleStartButtonClick() {
  // 重要：performance.now()はこのハンドラの一番最初で取得する（DOM更新・アニメーションを待たない）。
  // 効果音の再生（playSfx）はこの直後に置き、時刻取得そのものを遅らせないようにする。
  const nowMs = performance.now();
  playSfx(SFX_EVENTS.UI_CONFIRM);

  syncState = startKaraokeSync(syncState, nowMs);
  elements.startPanel.hidden = true;
  elements.syncPanel.hidden = false;
  elements.footerZone.hidden = false;
  elements.moreMenuButton.hidden = false;
  elements.deviceAudioNotice.hidden = true;
  elements.songEndBanner.hidden = true;

  syncBeginnerNavUI();
  updateAllPauseUI();
  await startDeviceAudioPlayback();

  startTickLoop();
  tick();
}

// 端末音源を、曲スタートと同時に0秒から自動再生する（選択UIは無く、常に試みる）。
// 未読み込みの曲ではエラーにせず、静かに「端末音源なしで同期する」旨を案内して続行する。
async function startDeviceAudioPlayback() {
  if (!currentSongId) return;
  // 【QAで発見・修正：2026-09-07】IndexedDB自体が読み取りに失敗した場合（例外を投げた
  // 場合）にtry/catchが無く、未処理のPromise rejectionになっていた。下のblobが無い
  // 場合と同じ「端末音源なしで同期する」案内で扱う。
  let blob;
  try {
    blob = await getAudioBlob(currentSongId);
  } catch (error) {
    console.warn("カラオケ同期用の端末音源の読み込みに失敗しました", error);
    blob = null;
  }
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
  if (followDeviceAudio) showKaraokeStageFinale();
}

// ===== 一時停止／再開（UI/UX第4版で追加、第6版で「両方まとめて」だけのシンプルな挙動に統一） =====
// 第5版では「楽曲（端末音源）だけ」「コール同期だけ」を個別に一時停止できる⋯メニュー項目を
// 用意していたが、実際に使うと2つの時計がズレてしまい、初心者には分かりにくいという
// 本人指摘を受けて削除した（判断の詳細はdocs/HANDOFF.md参照）。今はメインボタン1つが常に
// 楽曲（<audio>要素）とコール同期タイマー（js/karaokeSync.jsのsyncState.isPaused）の
// 両方を同時に止め、同時に再開するだけの、単一の状態しか存在しないシンプルな設計にしている。

// 端末音源が読み込まれているかどうか（「今！」・歌詞タップで音源側もseekすべきかの判定に使う）。
function hasDeviceAudioLoaded() {
  return deviceAudioObjectUrl !== null;
}

// メインボタンの表示を、syncState.isPausedだけから計算する（音源側の状態は見ない。
// 楽曲とコール同期は常にこの関数が一緒に操作するため、両者が食い違うことはない）。
function updateAllPauseUI() {
  const isPaused = syncState.isPaused;
  elements.pauseResumeButton.classList.toggle("is-paused", isPaused);
  elements.pauseResumeLabel.textContent = isPaused ? "再開" : "一時停止";
  elements.pauseResumeButton.setAttribute(
    "aria-label",
    isPaused ? "楽曲とコール同期を再開する" : "楽曲とコール同期を一時停止する"
  );
}

// 「⏸ 一時停止／▶ 再開」ボタン：楽曲（端末音源）とコール同期タイマーを、常に同時に
// 止める・再開する（本人指示：一番よく使う操作をシンプルに）。
function handleMainPauseResumeClick() {
  const nowMs = performance.now();
  if (syncState.isPaused) {
    syncState = resumeKaraokeSync(syncState, nowMs);
    if (hasDeviceAudioLoaded()) {
      notifyPlaybackStarting("karaokeSync");
      elements.deviceAudio.play().catch(() => {});
    }
    startTickLoop();
  } else {
    syncState = pauseKaraokeSync(syncState, nowMs);
    elements.deviceAudio.pause();
    stopTickLoop();
  }
  if (followDeviceAudio) setKaraokeStagePaused(syncState.isPaused); // 一時停止中は演出の CSS アニメーションも止める
  updateAllPauseUI();
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

// 「今！」：現在または次の同期ポイント（短いコール）のstart時刻へ、コール同期の基準時刻を
// 合わせ直す。端末音源が読み込まれていれば、その位置も一緒にseekする（本人指示：楽曲だけ／
// コール同期だけを個別に止めたあとでズレた場合の再同期手段として、歌詞タップと同じく
// 両方を揃える動作にする）。一時停止中でも使え、一時停止状態自体は維持される
// （js/karaokeSync.jsのresyncToPosition参照）。
function handleResyncButtonClick() {
  if (!syncState.isSyncing) {
    closeMoreMenu();
    return;
  }
  const positionSec = currentPositionSec();
  const syncPointCall = findCurrentOrNextSyncPoint(syncPointCandidates, positionSec ?? 0);
  if (!syncPointCall) {
    closeMoreMenu();
    return;
  }
  if (isFollowingDeviceAudio()) {
    // 新しいカラオケ（端末の音源が時計）：音源をその位置へ動かすだけ。タイミング調整の値は変えない（下の seekFollowedAudioTo）
    seekFollowedAudioTo(syncPointCall.start);
    tick();
    showToast(`「${syncPointCall.text}」の位置へ移りました`);
    closeMoreMenu();
    return;
  }
  syncState = resyncToPosition(syncState, syncPointCall.start, performance.now());
  if (hasDeviceAudioLoaded()) {
    elements.deviceAudio.currentTime = syncPointCall.start;
  }
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
  if (isFollowingDeviceAudio()) {
    seekFollowedAudioTo(line.start);
    tick();
    showToast("この行から再生します");
    return;
  }
  const nowMs = performance.now();
  syncState = resyncToPosition(syncState, line.start, nowMs);
  if (hasDeviceAudioLoaded()) {
    elements.deviceAudio.currentTime = line.start;
  }
  lastRenderedOffsetLabel = null;
  tick();
  showToast("この位置に合わせました");
}

// ===== 【2026-10-31 live-unify】新しいカラオケ（端末の音源が時計）のシーク =====
// 【+54.5秒の原因】新しいカラオケは「音源の再生位置＋タイミング調整」を時計にしている（currentPositionSec）。ところが歌詞の行のタップ・
// 「今！」は、前のカラオケ同期の決まり（resyncToPosition：［曲スタート］からの経過時間を基準に、調整の値を引き直す）のまま、
// さらに音源もその行へ動かしていた。音源の位置と調整の両方が動くので、行の時刻の「先へ飛んだ秒数」がそのまま調整に入っていた
// （例：0:01 から 0:56 の行を押すと、調整が約 +54.5秒になり、歌詞・コールがその分だけ先にずれる）。調整の値は保存していない
// （この画面を開いている間だけ）ので、開き直すと 0 に戻る。
// 直し方：新しいカラオケで音源が鳴っているときは、音源の位置だけを動かし、調整の値は変えない（前のカラオケ同期は今までどおり）。
function isFollowingDeviceAudio() {
  return followDeviceAudio && syncState.isSyncing && hasDeviceAudioLoaded();
}
// 表示の位置 positionSec（歌詞の行・コールの開始の時刻）に合う、音源の位置（純粋関数）。音源の位置＝表示の位置 − 調整（調整の値は変えない）
export function followedAudioSeekTarget(positionSec, offsetMs, durationSec) {
  const target = Math.max(0, Number(positionSec) - (Number(offsetMs) || 0) / 1000);
  return Number.isFinite(durationSec) && durationSec > 0 ? Math.min(target, durationSec) : target;
}
function seekFollowedAudioTo(positionSec) {
  const audio = elements.deviceAudio;
  audio.currentTime = followedAudioSeekTarget(positionSec, syncState.offsetMs, audio.duration);
}
// 赤いコールを押したとき：そのコールの少し前から（ライブコールと同じ 1 秒前）
const CALL_TAP_PRE_ROLL_SEC = 1;
function handleCallTapSeek(call) {
  if (!syncState.isSyncing) return;
  if (isFollowingDeviceAudio()) {
    seekFollowedAudioTo(Math.max(0, call.start - CALL_TAP_PRE_ROLL_SEC));
    tick();
  }
}

// ===== 【2026-10-31 live-unify】新しいカラオケだけの部品（モードの切り替え・コール表示 ON／OFF・再生の位置のバー・調整の注意） =====
let kx = null; // 使っている間だけ { parts, callsSwitch, seek, time, offsetWarning, restore }
let kxOnRequestMode = null;

export const KARAOKE_CALLS_SWITCH_LABELS = { on: "コール表示 ON", off: "コール表示 OFF", none: "コール表なし" };

function buildKaraokeExtras({ hasAudio, availability, onRequestMode }) {
  removeKaraokeExtras();
  const screen = elements.callHudCard.closest(".screen");
  const header = screen?.querySelector(".karaoke-header-zone");
  if (!screen || !header) return;
  kxOnRequestMode = typeof onRequestMode === "function" ? onRequestMode : null;
  const parts = [];
  // 上：3つのモードの切り替えと、コール表示 ON／OFF（いつでも押せる。再生の位置は変えない）
  const bar = document.createElement("div");
  bar.className = "kx-toolbar";
  const avail = availability ?? { sheet: { ok: false }, live: { ok: false }, karaoke: { ok: true } };
  bar.appendChild(buildModeTabs("karaoke", avail, (mode) => kxOnRequestMode?.(mode)));
  const callsSwitch = document.createElement("button");
  callsSwitch.type = "button";
  callsSwitch.className = "kx-calls-switch";
  callsSwitch.setAttribute("role", "switch");
  callsSwitch.addEventListener("click", () => {
    if (!karaokeStageHasCalls()) return;
    playSfx(SFX_EVENTS.UI_CLICK);
    const next = !areKaraokeCallsVisible();
    saveKaraokeCallsVisible(next);
    setKaraokeCallsVisible(next);
    syncKaraokeCallsSwitch();
    tick();
  });
  bar.appendChild(callsSwitch);
  header.appendChild(bar);
  parts.push(bar);

  // コール表の無い曲：歌詞だけのカラオケとして使えることを、始める前に1行で
  const noCallsNote = document.createElement("p");
  noCallsNote.className = "kx-no-calls-note";
  noCallsNote.textContent = "この曲はコール表がまだないので、歌詞だけのカラオケとして表示します。";
  noCallsNote.hidden = karaokeStageHasCalls();
  elements.startPanel.prepend(noCallsNote);
  parts.push(noCallsNote);

  // 下：再生の位置のバー（端末の音源があるときだけ。音源の位置を動かす。タイミング調整は変えない）
  let seek = null;
  let time = null;
  if (hasAudio) {
    screen.classList.add("kx-has-audio");
    const row = document.createElement("div");
    row.className = "kx-seek-row";
    time = document.createElement("span");
    time.className = "kx-seek-time";
    time.textContent = "0:00 / 0:00";
    seek = document.createElement("input");
    seek.type = "range";
    seek.className = "kx-seek";
    seek.min = "0";
    seek.step = "0.1";
    seek.value = "0";
    seek.setAttribute("aria-label", "再生の位置");
    seek.addEventListener("input", () => {
      const audio = elements.deviceAudio;
      if (!hasDeviceAudioLoaded()) return;
      audio.currentTime = seek.valueAsNumber;
      tick();
    });
    row.append(seek, time);
    if (elements.pauseResumeButton.parentNode === elements.footerZone) elements.footerZone.insertBefore(row, elements.pauseResumeButton);
    else elements.footerZone.prepend(row);
    parts.push(row);
  }

  // タイミング調整の注意（±10秒を超えたときだけ見える。css/karaokeStage.css の .kx-offset-warn）
  const offsetWarning = document.createElement("p");
  offsetWarning.className = "kx-offset-warning";
  offsetWarning.setAttribute("role", "status");
  elements.footerZone.appendChild(offsetWarning);
  parts.push(offsetWarning);

  // 開始前の案内：端末の音源で歌うときは、その言い方に（音源が無いときは前の版のまま＝カラオケ店の曲に合わせる）
  const instruction = elements.startPanel.querySelector(".karaoke-start-instruction");
  const note = elements.startPanel.querySelector(".karaoke-start-note");
  const restore = [
    [instruction, instruction?.textContent],
    [note, note?.textContent],
    [elements.startButton, elements.startButton.textContent],
  ];
  if (hasAudio) {
    if (instruction) instruction.textContent = "下のボタンを押すと、この端末の音源で曲が始まります。";
    if (note) {
      note.textContent = karaokeStageHasCalls()
        ? "歌詞の行や赤いコールを押すと、その位置へ移れます。音とずれるときは、画面の下のタイミング調整で直せます。"
        : "歌詞の行を押すと、その位置へ移れます。音とずれるときは、画面の下のタイミング調整で直せます。";
    }
    elements.startButton.textContent = "🎤 曲を再生して歌う";
  }
  kx = { parts, callsSwitch, seek, time, offsetWarning, restore, lastSeekKey: "" };
  syncKaraokeCallsSwitch();
}

function syncKaraokeCallsSwitch() {
  if (!kx) return;
  const has = karaokeStageHasCalls();
  const on = has && areKaraokeCallsVisible();
  kx.callsSwitch.textContent = has ? KARAOKE_CALLS_SWITCH_LABELS[on ? "on" : "off"] : KARAOKE_CALLS_SWITCH_LABELS.none;
  kx.callsSwitch.setAttribute("aria-checked", String(on));
  kx.callsSwitch.classList.toggle("is-on", on);
  kx.callsSwitch.disabled = !has;
  kx.callsSwitch.setAttribute("aria-label", has ? `コール表示：${on ? "ON（押すと、歌詞だけにします）" : "OFF（押すと、赤いコールも出します）"}` : "この曲はコール表がまだありません（歌詞だけで表示します）");
}

function renderKaraokeSeek() {
  if (!kx?.seek) return;
  const audio = elements.deviceAudio;
  const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  const now = audio.currentTime || 0;
  const key = `${Math.floor(now * 10)}|${Math.floor(duration)}`;
  if (key === kx.lastSeekKey) return;
  kx.lastSeekKey = key;
  kx.seek.max = String(duration);
  if (document.activeElement !== kx.seek) kx.seek.value = String(now);
  kx.time.textContent = `${formatKaraokeClock(now)} / ${formatKaraokeClock(duration)}`;
}
function formatKaraokeClock(sec) {
  const safe = Number.isFinite(sec) ? Math.max(0, sec) : 0;
  return `${Math.floor(safe / 60)}:${String(Math.floor(safe % 60)).padStart(2, "0")}`;
}

function removeKaraokeExtras() {
  if (!kx) return;
  kx.parts.forEach((node) => node.remove());
  kx.restore.forEach(([node, text]) => {
    if (node && text !== undefined) node.textContent = text;
  });
  elements.callHudCard.closest(".screen")?.classList.remove("kx-has-audio");
  kx = null;
  kxOnRequestMode = null;
}

function handleBeginnerNavToggleClick() {
  playSfx(SFX_EVENTS.UI_CLICK);
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
  elements.callHudPreviewRow.hidden = true;
  if (followDeviceAudio) resetKaraokeStage();
  updateAllPauseUI();
  lastRenderedCallHudEyebrow = null;
  lastRenderedCallHudText = null;
  lastRenderedCallHudCountdown = null;
  lastRenderedCallHudPhase = null;
  lastRenderedCallHudTier = null;
  lastRenderedLongCallActive = false;
  lastRenderedSyncPointCall = undefined;
  lastRenderedPreviewKey = null;
}

function handleRestartSongButtonClick() {
  playSfx(SFX_EVENTS.UI_BACK);
  resetToStartPanel();
  closeMoreMenu();
}

// ===== 画面の開閉 =====

// 指定した曲のカラオケ同期画面を開く。呼び出し前に、通常再生側は必ず閉じておくこと
// （main.js側でclosePlayerを呼んでから遷移する想定。同じ<audio>要素を共有しないため、
// 通常再生とカラオケ同期を同時に開くことはできない設計）。
// options.calls：使うコール（{ start, end, text } の配列）。【2026-10-29】新しいライブコールのカラオケから、本人の完成版のコール
// （本人の文章・本人の開始〜終了）を渡すために追加。渡さなければ今までどおり端末の元のコール
export async function openKaraokeSyncScreen(songId, options = {}) {
  closeKaraokeSyncScreen();

  const song = getSongById(songId);
  if (!song) return { ok: false };

  currentSongId = songId;
  elements.songTitle.textContent = song.title;
  resetPerSongRuntimeState();

  followDeviceAudio = Array.isArray(options.calls);
  if (Array.isArray(options.calls)) {
    allCalls = options.calls
      .filter((call) => Number.isFinite(call.start) && Number.isFinite(call.end))
      .map((call) => ({ ...call }))
      .sort((a, b) => a.start - b.start);
  } else {
    const callRecord = await getCallData(songId);
    allCalls = callRecord && Array.isArray(callRecord.calls) ? [...callRecord.calls].sort((a, b) => a.start - b.start) : [];
  }
  syncPointCandidates = selectSyncPointCandidates(allCalls);

  // 新しいカラオケ（本人の完成版のコール）だけ、演出の部品を作る。前のカラオケ同期では作らない（closeKaraokeSyncScreen で外したまま）
  if (followDeviceAudio) {
    let lyricLines = [];
    try {
      const lyricsRecord = await getLyricsData(songId);
      lyricLines = Array.isArray(lyricsRecord?.lines) ? lyricsRecord.lines.map((line) => ({ line: line.line, start: line.start, end: line.end })) : [];
    } catch {
      lyricLines = []; // 歌詞が読めなくても、コールの演出だけで続ける
    }
    enableKaraokeStage(
      { screen: elements.callHudCard.closest(".screen"), hudCard: elements.callHudCard, lyricsPanel: elements.lyricsContextPanel, hudText: elements.callHudText },
      { song, calls: allCalls, lines: lyricLines, layout: options.layout ?? null, callsVisible: loadKaraokeCallsVisible() },
    );
  }

  clockSource = new KaraokeClockSource();
  // 「現在の歌詞」表示パネル（js/lyricsSync.jsをそのまま再利用）。歌詞データが無い曲では
  // 何も描画されず、パネルは自動的に非表示のままになる。行タップはhandleLyricTapSeek()へ。
  await loadLyricsForSong(songId, clockSource, elements.lyricsContextPanel, { onLineClick: handleLyricTapSeek });

  if (followDeviceAudio) {
    // 【2026-10-31 live-unify】コール表示 ON：赤いコールを歌詞の行の間へ（コール表に近い並び）。コール1件＝部品1つ
    mountKaraokeCallRows({ onCallTap: handleCallTapSeek });
    buildKaraokeExtras({ hasAudio: options.hasAudio !== false, availability: options.availability ?? null, onRequestMode: options.onRequestMode });
  }

  // 【2026-10-31 live-unify】新しいカラオケは、コールの無い曲でも始められる（歌詞だけのカラオケ。以前は「コールデータを読み込めませんでした」で止まっていた）。
  // 前のカラオケ同期は今までどおり（コールの無い曲は案内を出して始めない）
  elements.startPanel.hidden = allCalls.length === 0 && !followDeviceAudio;
  elements.noCallsNotice.hidden = allCalls.length > 0 || followDeviceAudio;
  elements.syncPanel.hidden = true;
  elements.syncPanel.classList.remove("is-long-call-active");
  elements.footerZone.hidden = true;
  elements.moreMenuButton.hidden = true;
  elements.songEndBanner.hidden = true;
  elements.deviceAudioNotice.hidden = true;
  elements.toast.hidden = true;

  syncBeginnerNavUI();
  updateAllPauseUI();

  return { ok: true };
}

// この画面を離れるとき（戻る・曲を選び直す）に必ず呼ぶ。
export function closeKaraokeSyncScreen() {
  stopTickLoop();
  removeKaraokeExtras(); // 新しいカラオケだけの部品（モードの切り替え・コール表示・位置のバー）を外す（作っていなければ何もしない）
  disableKaraokeStage(); // 新しいカラオケの演出の部品を外す（作っていなければ何もしない）
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
//   callHudPreviewRow, callHudPreviewItem1, callHudPreviewItem2,
//   songEndBanner, songEndRestartButton, songEndChooseButton,
//   deviceAudio,
//   footerZone, toast,
//   pauseResumeButton, pauseResumeLabel,
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
  elements.pauseResumeButton.addEventListener("click", handleMainPauseResumeClick);

  elements.offsetMinus05Button.addEventListener("click", () => applyOffsetDelta(-OFFSET_STEP_BIG_MS));
  elements.offsetMinus01Button.addEventListener("click", () => applyOffsetDelta(-OFFSET_STEP_FINE_MS));
  elements.offsetResetButton.addEventListener("click", handleOffsetResetClick);
  elements.offsetPlus01Button.addEventListener("click", () => applyOffsetDelta(OFFSET_STEP_FINE_MS));
  elements.offsetPlus05Button.addEventListener("click", () => applyOffsetDelta(OFFSET_STEP_BIG_MS));

  elements.moreMenuButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openMoreMenu();
  });
  elements.moreMenuCloseButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeMoreMenu();
  });
  elements.moreMenuModal.addEventListener("click", (event) => {
    if (event.target === elements.moreMenuModal) {
      playSfx(SFX_EVENTS.UI_BACK);
      closeMoreMenu();
    }
  });

  elements.nowButton.addEventListener("click", handleResyncButtonClick);
  elements.beginnerNavToggleButton.addEventListener("click", handleBeginnerNavToggleClick);
  elements.restartSongButton.addEventListener("click", handleRestartSongButtonClick);

  elements.songEndRestartButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    resetToStartPanel();
  });
  elements.songEndChooseButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    resetToStartPanel();
    if (typeof elements.onRequestChooseSong === "function") {
      elements.onRequestChooseSong();
    }
  });
}

export function getCurrentKaraokeSongId() {
  return currentSongId;
}
