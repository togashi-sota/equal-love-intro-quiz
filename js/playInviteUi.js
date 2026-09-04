// 「一緒に遊ぶ」（フレンド一覧から直接1対1で誘い、相手が参加した瞬間に新しいルームを
// 作る招待）機能の、画面配線を担当するファイル（2026-11-XX新設、本人指示）。
// js/roomInviteUi.jsと同じ設計方針：Firebaseの読み書き自体はjs/playInvites.jsに任せ、
// このファイルは「いつ・何を表示するか」「ボタンを押したら何を呼ぶか」だけを担当する。
//
// 【役割】
// ①フレンド一覧の「一緒に遊ぶ」ボタン：js/fanProfileCard.jsのonPlayInviteRequestから
//   呼ばれるrequestPlayInvite()が入口。相手へ招待を送り、送信者側の待機カードを出す。
// ②受信バナー：自分宛の1対1招待をリアルタイム監視し、js/roomInviteUi.jsと同じ
//   canShowInviteNotification()判定でバトル中には割り込まない。
// ③招待が成立する瞬間（受信者が「参加する」を押した後）の2段階のルーム作成
//   （js/playInvitePayloads.js冒頭のコメント参照：ルームを作れるのは常に送信者側）。
import {
  sendPlayInvite,
  cancelOutgoingPlayInvite,
  subscribeToMyIncomingPlayInvites,
  declineIncomingPlayInvite,
  acceptIncomingPlayInvite,
  watchOutgoingPlayInvite,
  attachRoomIdToOutgoingPlayInvite,
  cleanupExpiredPlayInvites,
} from "./playInvites.js";
import {
  listActivePlayInvites,
  listExpiredPlayInviteIds,
  PLAY_INVITE_ROOM_WAIT_TIMEOUT_MS,
} from "./playInvitePayloads.js";
import { canShowInviteNotification, computeIsOnlineForDisplay } from "./presencePayloads.js";
import { onScreenChange } from "./screens.js";
import { getActivePlayer } from "./playerProfile.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { fetchAllPresenceOnce } from "./presenceSync.js";
import { createRoom, MAX_PLAYERS } from "./onlineBattle.js";
import { getCurrentOnlineRoomId, joinRoomFromInvite, goToLobby } from "./onlineBattleScreen.js";

let elements = null;
let currentScreenName = null;

// ---- ①受信側（自分宛に届いた1対1招待） ----
let latestRawIncoming = {};
let activeIncoming = [];
let displayableIncoming = [];
const snoozedIncomingInviteIds = new Set();
// 「参加する」を押した後、送信者側がルームを作ってroomIdを書き戻すのを待っている間だけtrue。
// この間はボタンを無効化し、「参加処理中…」を表示する。
let isAcceptBusy = false;
let pendingAcceptInviteId = null;
let pendingAcceptTimeoutId = null;

// ---- ②送信側（自分が送った1対1招待） ----
// 【本人指示：送信者は同時に1件だけ】この変数がnullでなければ「今誰かを招待中」という意味。
let outgoingInvite = null; // { recipientUid, recipientDisplayName, inviteId } | null
let unsubscribeOutgoing = null;
let roomCreationInFlightForInviteId = null;

// ---- ③切り替え確認モーダル（送信者1件制限・受信者の二重招待対応の両方で共用） ----
let pendingSwitchConfirmAction = null;

function showFlowError(text) {
  if (!elements?.flowError) return;
  elements.flowError.textContent = text;
  elements.flowError.hidden = false;
}

function hideFlowError() {
  if (!elements?.flowError) return;
  elements.flowError.hidden = true;
}

// ===== 受信バナー =====

function setIncomingButtonsDisabled(disabled) {
  elements.incomingAcceptButton.disabled = disabled;
  elements.incomingDeclineButton.disabled = disabled;
  if (elements.incomingLaterButton) elements.incomingLaterButton.disabled = disabled;
}

function renderIncomingBanner() {
  if (!elements) return;
  const now = Date.now();
  activeIncoming = listActivePlayInvites(latestRawIncoming, now);
  const activeIdSet = new Set(activeIncoming.map((invite) => invite.inviteId));
  [...snoozedIncomingInviteIds].forEach((id) => {
    if (!activeIdSet.has(id)) snoozedIncomingInviteIds.delete(id);
  });

  const expiredIds = listExpiredPlayInviteIds(latestRawIncoming, now);
  if (expiredIds.length > 0) cleanupExpiredPlayInvites(expiredIds);

  displayableIncoming = activeIncoming.filter((invite) => !snoozedIncomingInviteIds.has(invite.inviteId));

  const shouldShow =
    displayableIncoming.length > 0 && canShowInviteNotification(currentScreenName);
  elements.incomingBanner.hidden = !shouldShow;
  if (!shouldShow) return;

  const topInvite = displayableIncoming[0];
  elements.incomingText.textContent = `${topInvite.inviterDisplayName}さんから一緒に遊ぼう！と招待されています`;
  const restCount = activeIncoming.length - 1;
  if (elements.incomingMoreLabel) {
    elements.incomingMoreLabel.hidden = restCount <= 0;
    elements.incomingMoreLabel.textContent = restCount > 0 ? `ほか${restCount}件の招待があります` : "";
  }

  // 「参加処理中…」の間は、3択ボタンを隠して待機表示だけを見せる。
  const isWaitingForThisInvite = isAcceptBusy && pendingAcceptInviteId === topInvite.inviteId;
  elements.incomingActionsRow.hidden = isWaitingForThisInvite;
  if (elements.incomingWaitingLabel) elements.incomingWaitingLabel.hidden = !isWaitingForThisInvite;
  setIncomingButtonsDisabled(isWaitingForThisInvite);
}

function clearPendingAcceptTimeout() {
  if (pendingAcceptTimeoutId !== null) {
    clearTimeout(pendingAcceptTimeoutId);
    pendingAcceptTimeoutId = null;
  }
}

// 「参加する」が成立した後の後片付け（成功・失敗どちらでも呼ぶ）。
function finishAcceptFlow() {
  isAcceptBusy = false;
  pendingAcceptInviteId = null;
  clearPendingAcceptTimeout();
  // 【本人指示・実機相当バグ修正】ここで無条件にincomingErrorを隠すと、失敗時に
  // runAcceptFlow()側がせっかく表示したエラー文言をこの直後の呼び出しが即座に
  // 打ち消してしまう（finishAcceptFlow()は成功・失敗どちらの後片付けからも呼ばれるため）。
  // エラー表示のクリアは「次の新しい試行を始めるとき」（runAcceptFlow()の冒頭）だけで
  // 十分なので、ここでは触らない。
  renderIncomingBanner();
}

async function runAcceptFlow(invite) {
  isAcceptBusy = true;
  pendingAcceptInviteId = invite.inviteId;
  if (elements.incomingError) elements.incomingError.hidden = true;
  renderIncomingBanner();

  const result = await acceptIncomingPlayInvite(invite.inviteId);
  if (!result.ok) {
    if (elements.incomingError) {
      elements.incomingError.textContent = "参加できませんでした。もう一度お試しください。";
      elements.incomingError.hidden = false;
    }
    finishAcceptFlow();
    return;
  }

  // 【本人指示：送信者側がルームを作るまで待つ】ここから先はhandleIncomingInvitesUpdate()が
  // latestRawIncoming[invite.inviteId].roomIdの出現を検知して joinRoomFromInvite() を呼ぶ。
  // 送信者側が既にオフラインになっていた場合は誰もルームを作らないため、タイムアウトで
  // 安全に諦める（本人指示：★リロードしない等と同じ「無反応のまま放置しない」方針）。
  pendingAcceptTimeoutId = setTimeout(async () => {
    pendingAcceptTimeoutId = null;
    if (!isAcceptBusy || pendingAcceptInviteId !== invite.inviteId) return;
    await declineIncomingPlayInvite(invite.inviteId);
    if (elements.incomingError) {
      elements.incomingError.textContent = `${invite.inviterDisplayName}さんとの接続が確認できず、参加できませんでした。`;
      elements.incomingError.hidden = false;
    }
    finishAcceptFlow();
  }, PLAY_INVITE_ROOM_WAIT_TIMEOUT_MS);
}

async function handleIncomingAcceptClick() {
  if (isAcceptBusy || displayableIncoming.length === 0) return;
  const topInvite = displayableIncoming[0];

  if (getCurrentOnlineRoomId() !== null) {
    if (elements.incomingError) {
      elements.incomingError.textContent = "現在ルームに参加中です。先にルームから退出してください。";
      elements.incomingError.hidden = false;
    }
    return;
  }

  playSfx(SFX_EVENTS.UI_CONFIRM);

  // 【本人指示：自分が誰かを招待中に、別の招待を受け取って参加する場合】自分からの招待を
  // 安全に取り消してから、こちらへ参加する。相手が偶然同じ人（お互いに同時に「一緒に遊ぶ」を
  // 送り合っていた場合）でも同じ扱いにする：取り消さずに進むと、自分の送信側の監視
  // （watchOutgoingPlayInvite）が生きたままになり、相手が先に自分の招待へ「参加する」を
  // 押した場合とここで自分が相手の招待へ「参加する」を押す場合の両方が同時に成立して
  // ルームが2つ作られてしまう恐れがあるため、常に安全側（取り消してから参加）にする。
  if (outgoingInvite) {
    openSwitchConfirm(
      `現在${outgoingInvite.recipientDisplayName}さんへの招待を送信中です。取り消して${topInvite.inviterDisplayName}さんの招待に参加しますか？`,
      async () => {
        await cancelOutgoing();
        await runAcceptFlow(topInvite);
      }
    );
    return;
  }

  await runAcceptFlow(topInvite);
}

function handleIncomingDeclineClick() {
  if (isAcceptBusy || displayableIncoming.length === 0) return;
  playSfx(SFX_EVENTS.UI_BACK);
  const topInvite = displayableIncoming[0];
  declineIncomingPlayInvite(topInvite.inviteId);
  renderIncomingBanner();
}

function handleIncomingLaterClick() {
  if (isAcceptBusy || displayableIncoming.length === 0) return;
  playSfx(SFX_EVENTS.UI_BACK);
  const topInvite = displayableIncoming[0];
  snoozedIncomingInviteIds.add(topInvite.inviteId);
  renderIncomingBanner();
}

async function handleIncomingInvitesUpdate(rawValue) {
  latestRawIncoming = rawValue || {};

  // 「参加処理中…」の対象になっている招待にroomIdが付いたら、実際にルームへ参加する。
  if (isAcceptBusy && pendingAcceptInviteId) {
    const target = latestRawIncoming[pendingAcceptInviteId];
    if (!target) {
      // 送信者に取り消された、または何らかの理由でデータごと消えた。
      if (elements.incomingError) {
        elements.incomingError.textContent = "この招待は終了しました。";
        elements.incomingError.hidden = false;
      }
      finishAcceptFlow();
      return;
    }
    if (typeof target.roomId === "string" && target.roomId.length > 0) {
      const roomId = target.roomId;
      const inviteId = pendingAcceptInviteId;
      finishAcceptFlow();
      const playerName = getActivePlayer().playerName || "プレイヤー";
      await joinRoomFromInvite({ roomId, playerName });
      // ルーム参加後は自分の受信箱からこの招待を消す（既存invites/と同じ、参加時点の
      // 最新状態を優先する設計。js/roomInviteUi.jsのhandleAcceptClick()と同じ考え方）。
      declineIncomingPlayInvite(inviteId);
      return;
    }
  }

  renderIncomingBanner();
}

// 【動作確認用】js/roomInviteUi.jsのsimulateInvitesUpdateForTesting()と同じ考え方。
// Firebaseの実データを介さずに、playInvites/{自分のuid}の生データが届いた場合と全く同じ
// 経路（handleIncomingInvitesUpdate→renderIncomingBanner）を直接呼び出す。本番Firebase
// Rulesが未公開の間、Browserペインで受信バナーの表示・3択の挙動を検証するために追加した
// （実際のFirebase書き込みには一切触れない、副作用の無い診断用の入口）。
export function simulateIncomingPlayInvitesForTesting(rawInvitesValue) {
  handleIncomingInvitesUpdate(rawInvitesValue);
}

// ===== 送信側（フレンド一覧の「一緒に遊ぶ」） =====

// 招待中ではないが、一時的に結果（「今回は参加しませんでした」等）だけを見せたい間の
// テキスト。outgoingInviteがnullでもこれがあれば、送信者側の待機カードの位置にそのまま
// 数秒だけ表示する（本人がフレンド一覧を離れた後でも気付けるよう、画面をまたいで
// 常に存在するbody直下のカード要素をそのまま流用する）。
let outgoingFlashText = null;
let outgoingFlashTimeoutId = null;

function renderOutgoingCard() {
  if (!elements?.outgoingCard) return;
  const isFlash = outgoingInvite === null && outgoingFlashText !== null;
  const shouldShow = (outgoingInvite !== null || isFlash) && canShowInviteNotification(currentScreenName);
  elements.outgoingCard.hidden = !shouldShow;
  if (!shouldShow) return;
  if (outgoingInvite) {
    elements.outgoingText.textContent = `${outgoingInvite.recipientDisplayName}さんを招待しています…`;
    elements.outgoingCancelButton.hidden = false;
  } else {
    elements.outgoingText.textContent = outgoingFlashText;
    elements.outgoingCancelButton.hidden = true;
  }
}

// 【本人指示：「今回は参加しませんでした」】強い「拒否されました」等の表現は使わない。
// 相手がどの画面へ移動していても気付けるよう、送信者側の待機カードの位置に数秒だけ表示する。
function flashOutgoingMessage(text) {
  outgoingFlashText = text;
  if (outgoingFlashTimeoutId !== null) clearTimeout(outgoingFlashTimeoutId);
  renderOutgoingCard();
  outgoingFlashTimeoutId = setTimeout(() => {
    outgoingFlashTimeoutId = null;
    outgoingFlashText = null;
    renderOutgoingCard();
  }, 5000);
}

async function cancelOutgoing() {
  if (!outgoingInvite) return;
  // 自分自身の取り消しでは「今回は参加しませんでした」を出したくないため、
  // Firebase側を消す前に監視を止めておく（js/playInviteUi.js冒頭の設計コメント参照）。
  if (unsubscribeOutgoing) {
    unsubscribeOutgoing();
    unsubscribeOutgoing = null;
  }
  const { recipientUid, inviteId } = outgoingInvite;
  outgoingInvite = null;
  roomCreationInFlightForInviteId = null;
  renderOutgoingCard();
  await cancelOutgoingPlayInvite({ recipientUid, inviteId });
}

async function handleOutgoingInviteChange(invite) {
  if (!outgoingInvite) return; // 自分から取り消した直後の残留イベント等は無視する

  if (invite === null) {
    // 受信者が「断る」を押した、またはFirebase側で期限切れ掃除された。
    const recipientDisplayName = outgoingInvite.recipientDisplayName;
    if (unsubscribeOutgoing) {
      unsubscribeOutgoing();
      unsubscribeOutgoing = null;
    }
    outgoingInvite = null;
    roomCreationInFlightForInviteId = null;
    flashOutgoingMessage(`${recipientDisplayName}さんは今回は参加しませんでした。`);
    return;
  }

  if (invite.status === "accepted" && !invite.roomId) {
    if (roomCreationInFlightForInviteId === outgoingInvite.inviteId) return;
    roomCreationInFlightForInviteId = outgoingInvite.inviteId;

    const { recipientUid, inviteId } = outgoingInvite;
    const playerName = getActivePlayer().playerName || "プレイヤー";
    const result = await createRoom({ playerName, maxPlayers: MAX_PLAYERS });
    if (!result.ok) {
      roomCreationInFlightForInviteId = null;
      await cancelOutgoing();
      flashOutgoingMessage("ルームの作成に失敗しました。通信環境をご確認のうえ、もう一度お試しください。");
      return;
    }
    await attachRoomIdToOutgoingPlayInvite({ recipientUid, inviteId, roomId: result.roomId });

    if (unsubscribeOutgoing) {
      unsubscribeOutgoing();
      unsubscribeOutgoing = null;
    }
    outgoingInvite = null;
    roomCreationInFlightForInviteId = null;
    renderOutgoingCard();
    playSfx(SFX_EVENTS.UI_CONFIRM);
    goToLobby(result.roomId);
  }
}

async function sendFlow(profile) {
  hideFlowError();
  const inviterDisplayName = getActivePlayer().playerName || "フレンド";
  const result = await sendPlayInvite({ recipientUid: profile.uid, inviterDisplayName });
  if (!result.ok) {
    showFlowError("招待の送信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。");
    return;
  }
  outgoingInvite = { recipientUid: profile.uid, recipientDisplayName: profile.displayName, inviteId: result.inviteId };
  unsubscribeOutgoing = watchOutgoingPlayInvite(
    { recipientUid: profile.uid, inviteId: result.inviteId },
    handleOutgoingInviteChange
  );
  renderOutgoingCard();
}

// フレンド一覧の「一緒に遊ぶ」ボタン（js/fanProfileCard.jsのonPlayInviteRequest）から呼ぶ。
export async function requestPlayInvite(profile, { isOnline }) {
  if (!isOnline) return; // ボタン自体がdisabledのはずだが念のため
  hideFlowError();

  // 【本人指示：既に別ルームに参加中なら1対1ルームを作らせない】
  if (getCurrentOnlineRoomId() !== null) {
    showFlowError("現在ルームに参加中です。先にルームから退出してください。");
    return;
  }

  // 【本人指示：送信直前に最新のオンライン状態を確認する】フレンド一覧の表示は
  // 少し前に取得したものである可能性があるため、送信直前にもう一度だけ確認する。
  const presenceByUid = await fetchAllPresenceOnce();
  const stillOnline = computeIsOnlineForDisplay(presenceByUid[profile.uid], Date.now());
  if (!stillOnline) {
    showFlowError("現在オフラインのため招待できません。");
    return;
  }

  if (outgoingInvite && outgoingInvite.recipientUid === profile.uid) {
    // 既に同じ相手を招待中：何もしない（重複送信しない）。
    renderOutgoingCard();
    return;
  }

  if (outgoingInvite) {
    openSwitchConfirm(
      `現在${outgoingInvite.recipientDisplayName}さんを招待中です。取り消して${profile.displayName}さんを招待しますか？`,
      async () => {
        await cancelOutgoing();
        await sendFlow(profile);
      }
    );
    return;
  }

  await sendFlow(profile);
}

// ===== 切り替え確認モーダル（共用） =====

function openSwitchConfirm(text, onConfirm) {
  pendingSwitchConfirmAction = onConfirm;
  elements.switchConfirmText.textContent = text;
  elements.switchConfirmModal.hidden = false;
}

function closeSwitchConfirm() {
  pendingSwitchConfirmAction = null;
  elements.switchConfirmModal.hidden = true;
}

async function handleSwitchConfirmOkClick() {
  const action = pendingSwitchConfirmAction;
  playSfx(SFX_EVENTS.UI_CONFIRM);
  closeSwitchConfirm();
  if (action) await action();
}

// js/main.jsから一度だけ呼ぶ。
export function initPlayInviteUi(newElements) {
  elements = newElements;
  currentScreenName = document.body.dataset.screen ?? null;

  elements.incomingAcceptButton.addEventListener("click", handleIncomingAcceptClick);
  elements.incomingDeclineButton.addEventListener("click", handleIncomingDeclineClick);
  elements.incomingLaterButton?.addEventListener("click", handleIncomingLaterClick);

  elements.outgoingCancelButton.addEventListener("click", async () => {
    playSfx(SFX_EVENTS.UI_BACK);
    await cancelOutgoing();
  });

  elements.switchConfirmCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeSwitchConfirm();
  });
  elements.switchConfirmOkButton.addEventListener("click", handleSwitchConfirmOkClick);
  elements.switchConfirmModal.addEventListener("click", (event) => {
    if (event.target !== elements.switchConfirmModal) return;
    playSfx(SFX_EVENTS.UI_BACK);
    closeSwitchConfirm();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || elements.switchConfirmModal.hidden) return;
    playSfx(SFX_EVENTS.UI_BACK);
    closeSwitchConfirm();
  });

  onScreenChange((screenName) => {
    if (currentScreenName !== null && screenName !== currentScreenName) {
      snoozedIncomingInviteIds.clear();
    }
    currentScreenName = screenName;
    renderIncomingBanner();
    renderOutgoingCard();
  });

  subscribeToMyIncomingPlayInvites(handleIncomingInvitesUpdate);
  setInterval(() => {
    renderIncomingBanner();
    renderOutgoingCard();
  }, 20000);
}
