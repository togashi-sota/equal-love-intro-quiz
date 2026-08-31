// オンライン対戦の「在席確認システム」（2026-09-05新設、本人指示：49項目仕様書の
// 「在席確認システム（60秒無操作→在席確認→15秒）」への対応）。
//
// 【js/onlineBattle.jsの接続監視（connected）との違い】あちらは「通信が繋がっているか」
// （Firebaseの.info/connected・画面の表示/非表示）だけを見ており、「タブは開いたまま
// 何も操作していない」状態は区別できない。このファイルは、実際にプレイヤーが操作している
// かどうか（クリック・タップ・キー入力）を見て、「在席／離席かも／離席」を判定する、
// 完全に別のもう1つの状態を追加する。接続状態（connected）とは独立して動くため、
// 既存のjs/onlineBattle.jsの接続監視ロジックには一切手を加えていない。
//
// 【判定の流れ】
//   操作あり → "active"（既定値。プレイヤーが自分の分の状態を書いていない間もこの扱い）
//   60秒操作なし → "checking"（在席確認中。画面に控えめなバナーを出し、
//                                何か操作すれば即座にactiveへ戻る）
//   さらに15秒操作なし（合計75秒） → "away"（離席中）
// 状態が変わるたびにだけFirebaseへ書き込む（操作のたびに毎回書き込むと過剰なため）。
//
// 【安全設計】この状態はあくまで他プレイヤーへの表示用の目安であり、本人の回答権を
// 奪ったり、強制的にルームから外したりする効果は一切持たせていない（本人指示が無い限り、
// ゲームの進行・採点ロジックには影響させない）。

import { ref, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database } from "./firebaseClient.js";

export const PRESENCE_STATE = {
  ACTIVE: "active",
  CHECKING: "checking",
  AWAY: "away",
};

const DEFAULT_IDLE_THRESHOLD_MS = 60000; // 無操作からの60秒
const DEFAULT_AWAY_CONFIRM_MS = 15000; // 「在席確認中」からさらに15秒

// 操作とみなすイベント。pointerdownはマウスクリック・タップ・ペンを1つでまとめて拾える。
// touchstartは古いiOS Safari等、pointer eventsが不安定な環境向けの保険として併用する。
const ACTIVITY_EVENT_NAMES = ["pointerdown", "touchstart", "keydown"];

let idleTimerId = null;
let awayTimerId = null;
let currentState = PRESENCE_STATE.ACTIVE;
let trackingRoomId = null;
let trackingUid = null;
let trackingKind = "players";
let idleThresholdMs = DEFAULT_IDLE_THRESHOLD_MS;
let awayConfirmMs = DEFAULT_AWAY_CONFIRM_MS;
let bannerElement = null;

function clearTimers() {
  if (idleTimerId !== null) {
    clearTimeout(idleTimerId);
    idleTimerId = null;
  }
  if (awayTimerId !== null) {
    clearTimeout(awayTimerId);
    awayTimerId = null;
  }
}

function writePresenceState(state) {
  if (!trackingRoomId || !trackingUid) return;
  const presenceRef = ref(database, `rooms/${trackingRoomId}/${trackingKind}/${trackingUid}/presence`);
  set(presenceRef, state).catch((error) => {
    // 本人指示：通信に失敗しても対戦の進行自体には一切影響させない（あくまで表示用の情報）。
    console.warn("在席状態の同期に失敗しました（対戦の進行には影響ありません）", error);
  });
}

// 控えめな在席確認バナーを画面下部に表示する。タップ含む何らかの操作があれば、
// document全体のイベント監視（handleActivityEvent）が拾って自動的に消える
// （バナー自体に専用のクリック処理は持たせていない＝どこを押しても「見ている」扱いにするため）。
function showCheckingBanner() {
  if (bannerElement) return;
  bannerElement = document.createElement("div");
  bannerElement.className = "online-presence-checking-banner";
  bannerElement.textContent = "しばらく操作がないようです。まだ見ていますか？";
  document.body.appendChild(bannerElement);
}

function hideCheckingBanner() {
  if (!bannerElement) return;
  bannerElement.remove();
  bannerElement = null;
}

function enterCheckingState() {
  if (currentState !== PRESENCE_STATE.ACTIVE) return;
  currentState = PRESENCE_STATE.CHECKING;
  showCheckingBanner();
  writePresenceState(PRESENCE_STATE.CHECKING);
  awayTimerId = setTimeout(enterAwayState, awayConfirmMs);
}

function enterAwayState() {
  currentState = PRESENCE_STATE.AWAY;
  hideCheckingBanner(); // 本人はもう見ていない想定なので、バナーは片付ける
  writePresenceState(PRESENCE_STATE.AWAY);
}

function handleActivityEvent() {
  const wasActive = currentState === PRESENCE_STATE.ACTIVE;
  clearTimers();
  hideCheckingBanner();
  if (!wasActive) {
    currentState = PRESENCE_STATE.ACTIVE;
    writePresenceState(PRESENCE_STATE.ACTIVE);
  }
  idleTimerId = setTimeout(enterCheckingState, idleThresholdMs);
}

// ルームに参加している間、在席確認の監視を開始する。roomId・uidはjs/onlineBattle.jsの
// 接続監視（startPresenceTracking）と同じ値を渡す想定。kindは"players"または
// "spectators"（観戦者にも同じ仕組みを適用する）。
// options.idleThresholdMs／options.awayConfirmMsは、自動テスト・動作確認用に閾値を
// 短縮するための上書き（省略時は既定の60秒・15秒）。
export function startActivityPresenceTracking(roomId, uid, kind = "players", options = {}) {
  stopActivityPresenceTracking();
  trackingRoomId = roomId;
  trackingUid = uid;
  trackingKind = kind;
  idleThresholdMs = options.idleThresholdMs ?? DEFAULT_IDLE_THRESHOLD_MS;
  awayConfirmMs = options.awayConfirmMs ?? DEFAULT_AWAY_CONFIRM_MS;
  currentState = PRESENCE_STATE.ACTIVE;

  ACTIVITY_EVENT_NAMES.forEach((eventName) => {
    document.addEventListener(eventName, handleActivityEvent, { passive: true });
  });
  idleTimerId = setTimeout(enterCheckingState, idleThresholdMs);
}

export function stopActivityPresenceTracking() {
  clearTimers();
  hideCheckingBanner();
  ACTIVITY_EVENT_NAMES.forEach((eventName) => {
    document.removeEventListener(eventName, handleActivityEvent, { passive: true });
  });
  trackingRoomId = null;
  trackingUid = null;
  trackingKind = "players";
  currentState = PRESENCE_STATE.ACTIVE;
}
