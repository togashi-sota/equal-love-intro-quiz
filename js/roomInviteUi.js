// ルーム招待（フレンドを、今のオンライン対戦ルームへ招待する）の画面配線を担当するファイル
// （2026-11-XX新設、本人指示）。js/onlineBattleLeaveMatchPrompt.js冒頭のコメントと同じ設計方針で、
// このファイルはjs/onlineBattleScreen.jsを一切importしない「末端モジュール」にしてある
// （onlineBattleScreen.js側は逆に、招待を受けて参加するための窓口
// joinRoomFromInvite()をこのファイルへ向けて公開している。片方向のimportだけで完結させ、
// 循環importを避けるため）。
//
// 【役割】
// ①ロビー画面の「友達を招待」：今オンラインの公開プロフィール（フレンド）一覧を出し、
//   選んだ相手へ招待を送る（js/roomInvites.jsのsendRoomInvite()）。
// ②ホーム画面の招待バナー：自分宛の招待をリアルタイム監視し、js/screens.jsの
//   onScreenChangeで「今スタート画面にいるか」を判定したうえで、対戦中の画面へは絶対に
//   割り込まない（本人指示：「招待は安全な画面（ホーム）に来たときだけ表示する」）。
import { sendRoomInvite, subscribeToMyInvites, removeMyInvite, cleanupExpiredInvites } from "./roomInvites.js";
import { listActiveInvites, listExpiredInviteRoomIds, canResendInvite, INVITE_RESEND_COOLDOWN_MS } from "./roomInvitePayloads.js";
import { fetchAllPublicProfiles, getMyUid } from "./publicProfileSync.js";
import { fetchAllPresenceOnce } from "./presenceSync.js";
import { computeIsOnlineForDisplay } from "./presencePayloads.js";
import { onScreenChange } from "./screens.js";
import { joinRoomFromInvite } from "./onlineBattleScreen.js";
import { getActivePlayer } from "./playerProfile.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

// 【本人指示：招待バナーは「安全な画面」＝ホームでだけ表示する】対戦中・クイズ中の画面へ
// 割り込ませない、という要件を満たす唯一の判定箇所。将来「ホーム以外の待機的な画面でも
// 出してよい」となった場合は、ここへ画面名を足すだけで済む。
const SAFE_SCREENS_FOR_INVITE_BANNER = new Set(["start"]);

// バナーの再判定（期限切れの掃除も含む）を、画面遷移が無いままでも取りこぼさないための
// 定期チェック間隔。招待の有効期限（5分）に対して十分細かく、かつ無駄なタイマー負荷にならない
// 長さとして選んだ。
const BANNER_RECHECK_INTERVAL_MS = 20000;

let elements = null;
let currentScreenName = null;
let latestRawInvites = {};
let activeInvites = [];
let isAcceptBusy = false;

// ---- ①ロビーの「友達を招待」ピッカー ----
let pendingInviteRoomId = null;
const sendCooldownByRecipientUid = new Map();

function closeInvitePicker() {
  if (!elements) return;
  elements.pickerModal.hidden = true;
  pendingInviteRoomId = null;
}

function buildInviteRow(profile) {
  const row = document.createElement("div");
  row.className = "room-invite-picker-row";

  const name = document.createElement("span");
  name.className = "room-invite-picker-row-name";
  name.textContent = profile.displayName;
  row.appendChild(name);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button room-invite-picker-row-button";
  button.textContent = "招待する";
  button.addEventListener("click", async () => {
    if (!pendingInviteRoomId) return;
    const existing = sendCooldownByRecipientUid.get(profile.uid);
    if (!canResendInvite(existing, Date.now())) {
      button.textContent = "少し待ってから再送できます";
      return;
    }
    playSfx(SFX_EVENTS.UI_CLICK);
    button.disabled = true;
    const inviterDisplayName = getActivePlayer().playerName || "フレンド";
    const result = await sendRoomInvite({
      roomId: pendingInviteRoomId,
      recipientUid: profile.uid,
      inviterDisplayName,
    });
    button.disabled = false;
    if (result.ok) {
      sendCooldownByRecipientUid.set(profile.uid, { createdAt: Date.now() });
      button.textContent = "招待を送りました";
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = "招待する";
      }, INVITE_RESEND_COOLDOWN_MS);
    } else if (result.reason === "cooldown") {
      button.textContent = "少し待ってから再送できます";
    } else {
      button.textContent = "送信に失敗しました";
    }
  });
  row.appendChild(button);

  return row;
}

async function loadInvitePickerList() {
  elements.pickerList.innerHTML = "";
  elements.pickerEmpty.hidden = true;
  elements.pickerLoading.hidden = false;

  const [{ ok, profiles }, presenceByUid, myUid] = await Promise.all([
    fetchAllPublicProfiles(),
    fetchAllPresenceOnce(),
    getMyUid(),
  ]);

  elements.pickerLoading.hidden = true;
  // ピッカーを開いたまま別のルームへ移動した等、応答が返ってきた時点で状況が変わって
  // いた場合は何もしない（本人指示と同じ「後から届いた古い応答で表示を壊さない」方針）。
  if (elements.pickerModal.hidden) return;

  if (!ok) {
    elements.pickerEmpty.hidden = false;
    elements.pickerEmpty.textContent = "フレンド一覧を読み込めませんでした。電波の良い場所でもう一度お試しください。";
    return;
  }

  const now = Date.now();
  const onlineFriends = profiles.filter(
    (profile) => profile.uid !== myUid && computeIsOnlineForDisplay(presenceByUid[profile.uid], now)
  );

  if (onlineFriends.length === 0) {
    elements.pickerEmpty.hidden = false;
    elements.pickerEmpty.textContent = "今オンラインのフレンドはいません。";
    return;
  }

  onlineFriends.forEach((profile) => elements.pickerList.appendChild(buildInviteRow(profile)));
}

// ロビー画面から呼ぶ想定（js/main.jsの「友達を招待」ボタン配線から）。
export function openInvitePicker(roomId) {
  if (!elements || !roomId) return;
  pendingInviteRoomId = roomId;
  elements.pickerModal.hidden = false;
  loadInvitePickerList();
}

// ---- ②ホーム画面の招待バナー ----
function renderBanner() {
  if (!elements) return;
  const now = Date.now();
  activeInvites = listActiveInvites(latestRawInvites, now);

  const expiredRoomIds = listExpiredInviteRoomIds(latestRawInvites, now);
  if (expiredRoomIds.length > 0) cleanupExpiredInvites(expiredRoomIds);

  const shouldShow =
    !isAcceptBusy && activeInvites.length > 0 && SAFE_SCREENS_FOR_INVITE_BANNER.has(currentScreenName);
  elements.banner.hidden = !shouldShow;
  if (!shouldShow) return;

  const topInvite = activeInvites[0];
  elements.bannerText.textContent = `${topInvite.inviterDisplayName}さんから対戦ルームへの招待が届いています`;
  const restCount = activeInvites.length - 1;
  if (elements.bannerMoreLabel) {
    elements.bannerMoreLabel.hidden = restCount <= 0;
    elements.bannerMoreLabel.textContent = restCount > 0 ? `ほか${restCount}件の招待があります` : "";
  }
}

async function handleAcceptClick() {
  if (isAcceptBusy || activeInvites.length === 0) return;
  const topInvite = activeInvites[0];
  playSfx(SFX_EVENTS.UI_CONFIRM);
  isAcceptBusy = true;
  elements.bannerAcceptButton.disabled = true;
  elements.bannerDeclineButton.disabled = true;

  const playerName = getActivePlayer().playerName || "プレイヤー";
  const result = await joinRoomFromInvite({ roomId: topInvite.roomId, playerName });

  elements.bannerAcceptButton.disabled = false;
  elements.bannerDeclineButton.disabled = false;
  isAcceptBusy = false;

  // 参加の成否によらず、この招待自体は消す（参加失敗時は「ルームが既に無い」等、参加時点の
  // 最新状態で無効と判明したケースが多く、招待を残しても本人が再度押せるだけで意味が無い。
  // 本人指示のとおり、招待時点ではなく参加時点の最新状態を優先する設計）。
  removeMyInvite(topInvite.roomId);

  if (!result.ok && elements.bannerError) {
    elements.bannerError.textContent = "ルームへの参加に失敗しました（ルームが終了しているか、満員の可能性があります）。";
    elements.bannerError.hidden = false;
  } else if (elements.bannerError) {
    elements.bannerError.hidden = true;
  }
  renderBanner();
}

function handleDeclineClick() {
  if (activeInvites.length === 0) return;
  playSfx(SFX_EVENTS.UI_BACK);
  const topInvite = activeInvites[0];
  removeMyInvite(topInvite.roomId);
  renderBanner();
}

function handleInvitesUpdate(rawInvitesValue) {
  latestRawInvites = rawInvitesValue || {};
  renderBanner();
}

// js/main.jsから一度だけ呼ぶ。
export function initRoomInviteUi(newElements) {
  elements = newElements;

  elements.bannerAcceptButton.addEventListener("click", handleAcceptClick);
  elements.bannerDeclineButton.addEventListener("click", handleDeclineClick);

  elements.pickerCloseButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeInvitePicker();
  });
  elements.pickerModal.addEventListener("click", (event) => {
    if (event.target !== elements.pickerModal) return;
    playSfx(SFX_EVENTS.UI_BACK);
    closeInvitePicker();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || elements.pickerModal.hidden) return;
    playSfx(SFX_EVENTS.UI_BACK);
    closeInvitePicker();
  });

  onScreenChange((screenName) => {
    currentScreenName = screenName;
    renderBanner();
  });

  subscribeToMyInvites(handleInvitesUpdate);
  setInterval(renderBanner, BANNER_RECHECK_INTERVAL_MS);
}
