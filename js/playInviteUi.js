// 「一緒に遊ぶ」（フレンド一覧から直接1対1で誘い、相手が参加した瞬間に新しいルームを
// 作る招待）機能の、画面配線を担当するファイル（2026-11-XX新設、本人指示）。
// js/roomInviteUi.jsと同じ設計方針：Firebaseの読み書き自体はjs/playInvites.jsに任せ、
// このファイルは「いつ・何を表示するか」「ボタンを押したら何を呼ぶか」だけを担当する。
//
// 【2026-11-XX全面改訂・本人の実機テスト指摘を受けて】
// ①受信通知を「コンパクト通知→確認する→詳細（3択）」の二段階にした（大きなパネルが
//   実機で「戻る」リンク等を覆っていたため）。
// ②送信者側の状態（招待中／あとでにされた／断られた等）を、js/playInvites.jsの
//   playInviteOutbox/{自分のuid}経由でFirebaseへ正本化した（以前はメモリ上の変数だけで
//   管理しており、ページの再読み込みやiOSのバックグラウンド復帰で状態が失われ、
//   「断られたのに送信側で招待中のまま」というバグになっていた）。
// ③「あとで」→後から「参加する」→送信者の再承認、という新しいフローに対応した。
import {
  sendPlayInvite,
  cancelOutgoingPlayInvite,
  clearMyOutboxOnly,
  finalizeOutgoingPlayInvite,
  subscribeToMyOutbox,
  subscribeToMyIncomingPlayInvites,
  watchPlayInvite,
  acceptIncomingPlayInvite,
  declineIncomingPlayInvite,
  snoozeIncomingPlayInvite,
  requestJoinPlayInvite,
  cancelJoinRequestPlayInvite,
  removeMyIncomingPlayInvite,
  respondToJoinRequest,
  attachRoomIdToOutgoingPlayInvite,
  cleanupExpiredPlayInvites,
  fetchInviterPresenceOnce,
} from "./playInvites.js";
import {
  listActivePlayInvites,
  listExpiredPlayInviteIds,
  PLAY_INVITE_STATUS,
  PLAY_INVITE_ROOM_WAIT_TIMEOUT_MS,
  truncateDisplayNameForNotice,
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

// ===================================================================
// ①受信側（自分宛に届いた1対1招待）
// ===================================================================
let latestRawIncoming = {};
let displayableIncoming = [];
// 【本人指示：「あとで」のUX】「あとで」を押した招待は、ページの再読み込みまでは
// 自動的には再表示しない（画面を切り替えただけで押し付けない）。有効な招待がすべて
// この理由で隠れている間だけ、再確認チップを出す（renderIncoming()参照）。
const locallySnoozedInviteIds = new Set();
// 二段階UI：コンパクト通知の「確認する」を押すまでは詳細（3択）を開かない。
// 表示対象の招待（displayableIncoming[0]）が変わったら自動的にコンパクトへ戻す。
let isIncomingDetailExpanded = false;
let expandedForInviteId = null;
// 「参加する」を押した後、送信者側がルームを作ってroomIdを書き戻すのを待っている間だけtrue。
let isAcceptBusy = false;
let pendingAcceptInviteId = null;
let pendingAcceptTimeoutId = null;
// 二重タップ防止（あとで／断る／後から参加する／取り消す、いずれも短い非同期処理を挟む）。
let isIncomingActionBusy = false;

// ===================================================================
// ②送信側（自分が送った1対1招待）：playInviteOutbox/{自分のuid}を正本にする
// ===================================================================
let myOutbox = null; // { recipientUid, recipientDisplayName, inviteId, createdAt } | null
let myOutboxInviteData = null; // playInvites/{recipientUid}/{inviteId}の生データ | null
let unsubscribeOutboxInviteWatch = null;
let lastKnownOutboxStatus = null;
let roomCreationInFlightForInviteId = null;
let isOutgoingActionBusy = false;
// 招待中ではないが、一時的に結果（「今回は参加しませんでした」等）だけを見せたい間の
// テキスト。myOutboxがnullでもこれがあれば、送信者側のバーの位置にそのまま数秒だけ表示する
// （本人がフレンド一覧を離れた後でも気付けるよう、画面をまたいで常に存在するbody直下の
// 要素をそのまま流用する）。
let outgoingFlashText = null;
let outgoingFlashTimeoutId = null;

// ===================================================================
// ③切り替え確認モーダル（送信者1件制限・受信者の二重招待対応の両方で共用）
// ===================================================================
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

// ===================================================================
// 受信：コンパクト通知 → 詳細
// ===================================================================

function setIncomingButtonsDisabled(disabled) {
  elements.incomingAcceptButton.disabled = disabled;
  elements.incomingDeclineButton.disabled = disabled;
  if (elements.incomingLaterButton) elements.incomingLaterButton.disabled = disabled;
}

function renderIncoming() {
  if (!elements) return;
  const now = Date.now();
  const activeAwaitingDecision = listActivePlayInvites(latestRawIncoming, now);
  const activeIdSet = new Set(activeAwaitingDecision.map((invite) => invite.inviteId));
  [...locallySnoozedInviteIds].forEach((id) => {
    if (!activeIdSet.has(id)) locallySnoozedInviteIds.delete(id);
  });

  const expiredIds = listExpiredPlayInviteIds(latestRawIncoming, now);
  if (expiredIds.length > 0) cleanupExpiredPlayInvites(expiredIds);

  displayableIncoming = activeAwaitingDecision.filter((invite) => !locallySnoozedInviteIds.has(invite.inviteId));

  const canShowHere = canShowInviteNotification(currentScreenName);
  const topInvite = displayableIncoming[0] ?? null;

  // 表示対象そのものが変わったら、常にコンパクト表示からやり直す
  // （本人指示：「最新の1件を上部通知で表示」）。
  if (!topInvite || topInvite.inviteId !== expandedForInviteId) {
    isIncomingDetailExpanded = false;
  }

  const shouldShowAnything = canShowHere && topInvite !== null;
  const shouldShowDetail = shouldShowAnything && isIncomingDetailExpanded;
  const shouldShowCompact = shouldShowAnything && !isIncomingDetailExpanded;
  const shouldShowReminder =
    canShowHere && !shouldShowAnything && activeAwaitingDecision.length > 0;

  if (elements.incomingCompact) {
    elements.incomingCompact.hidden = !shouldShowCompact;
    if (shouldShowCompact) {
      const restCount = activeAwaitingDecision.length - 1;
      const name = truncateDisplayNameForNotice(topInvite.inviterDisplayName);
      elements.incomingCompactText.textContent =
        restCount > 0
          ? `🤝 ${name}さんから「一緒に遊ぼう！」とほか${restCount}件の招待が届いています`
          : `🤝 ${name}さんから「一緒に遊ぼう！」と招待が届きました`;
    }
  }

  elements.incomingBanner.hidden = !shouldShowDetail;
  if (elements.incomingReminder) {
    elements.incomingReminder.hidden = !shouldShowReminder;
    elements.incomingReminder.textContent = shouldShowReminder
      ? `📩 保留中の「一緒に遊ぶ」招待が${activeAwaitingDecision.length}件あります`
      : "";
  }

  if (!shouldShowDetail) return;
  expandedForInviteId = topInvite.inviteId;

  elements.incomingText.textContent = `${topInvite.inviterDisplayName}さんから「一緒に遊ぼう！」と招待が届いています`;
  const restCount = activeAwaitingDecision.length - 1;
  if (elements.incomingMoreLabel) {
    elements.incomingMoreLabel.hidden = restCount <= 0;
    elements.incomingMoreLabel.textContent = restCount > 0 ? `ほか${restCount}件の招待があります` : "";
  }

  // 「参加処理中…」の間は、3択ボタンを隠して待機表示だけを見せる。
  const isWaitingForThisInvite = isAcceptBusy && pendingAcceptInviteId === topInvite.inviteId;
  elements.incomingActionsRow.hidden = isWaitingForThisInvite;
  if (elements.incomingWaitingLabel) elements.incomingWaitingLabel.hidden = !isWaitingForThisInvite;
  setIncomingButtonsDisabled(isWaitingForThisInvite || isIncomingActionBusy);
}

function handleIncomingCompactConfirmClick() {
  if (displayableIncoming.length === 0) return;
  playSfx(SFX_EVENTS.UI_CLICK);
  isIncomingDetailExpanded = true;
  expandedForInviteId = displayableIncoming[0].inviteId;
  renderIncoming();
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
  // 【実機相当バグ修正済み】ここで無条件にincomingErrorを隠すと、失敗時にせっかく表示した
  // エラー文言をこの直後の呼び出しが即座に打ち消してしまう。エラー表示のクリアは
  // 「次の新しい試行を始めるとき」だけで十分なので、ここでは触らない。
  renderIncoming();
}

async function runAcceptFlow(invite) {
  isAcceptBusy = true;
  pendingAcceptInviteId = invite.inviteId;
  if (elements.incomingError) elements.incomingError.hidden = true;
  renderIncoming();

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
    // 【本人指示との違い】これは受信者側が待ちきれずに諦めたケースであり、「断った」わけ
    // ではないため、statusをdeclinedByRecipientへ書き換えて送信者へ通知する必要は無い
    // （送信者側は自分のルーム作成が完了しなかった時点で、別途タイムアウト処理を持たない
    // ため、この場合は受信者側だけが静かに諦め、招待データを直接削除する）。
    await removeMyIncomingPlayInvite(invite.inviteId);
    if (elements.incomingError) {
      elements.incomingError.textContent = `${invite.inviterDisplayName}さんとの接続が確認できず、参加できませんでした。`;
      elements.incomingError.hidden = false;
    }
    finishAcceptFlow();
  }, PLAY_INVITE_ROOM_WAIT_TIMEOUT_MS);
}

async function handleIncomingAcceptClick() {
  if (isAcceptBusy || isIncomingActionBusy || displayableIncoming.length === 0) return;
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
  // 安全に取り消してから、こちらへ参加する。
  if (myOutbox) {
    openSwitchConfirm(
      `現在${myOutbox.recipientDisplayName}さんへの招待を送信中です。取り消して${topInvite.inviterDisplayName}さんの招待に参加しますか？`,
      async () => {
        await cancelOutgoing();
        await proceedWithIncomingAccept(topInvite);
      }
    );
    return;
  }

  await proceedWithIncomingAccept(topInvite);
}

// 【本人指示：あとで→後から参加フロー】既に一度「あとで」にした招待（Firebase側の
// statusがsnoozed）から「参加する」を押した場合は、即座には参加させず、送信者の
// 再承認を求める（joinRequested）。最初から参加する場合（status:pending）は、
// これまでどおり即座に成立させる。
async function proceedWithIncomingAccept(invite) {
  if (invite.status === PLAY_INVITE_STATUS.SNOOZED) {
    await runRequestJoinFlow(invite);
    return;
  }
  await runAcceptFlow(invite);
}

async function handleIncomingDeclineClick() {
  if (isAcceptBusy || isIncomingActionBusy || displayableIncoming.length === 0) return;
  const topInvite = displayableIncoming[0];
  isIncomingActionBusy = true;
  playSfx(SFX_EVENTS.UI_BACK);
  setIncomingButtonsDisabled(true);
  await declineIncomingPlayInvite(topInvite.inviteId);
  isIncomingActionBusy = false;
  locallySnoozedInviteIds.delete(topInvite.inviteId);
  renderIncoming();
}

async function handleIncomingLaterClick() {
  if (isAcceptBusy || isIncomingActionBusy || displayableIncoming.length === 0) return;
  const topInvite = displayableIncoming[0];
  isIncomingActionBusy = true;
  playSfx(SFX_EVENTS.UI_BACK);
  setIncomingButtonsDisabled(true);
  // 【本人指示：「あとで」も送信側の待機を解除する】以前は端末内のメモリだけで
  // スヌーズしていたが、送信者へ「あとでにされた」ことが伝わらないバグがあったため、
  // Firebase側のstatusもsnoozedへ書き換える（js/playInvites.jsのsnoozeIncomingPlayInvite()）。
  await snoozeIncomingPlayInvite(topInvite.inviteId);
  isIncomingActionBusy = false;
  locallySnoozedInviteIds.add(topInvite.inviteId);
  renderIncoming();
}

// 【本人指示：あとで→後から参加フロー】保留中の招待から「参加する」を押したとき。
async function runRequestJoinFlow(invite) {
  isIncomingActionBusy = true;
  if (elements.incomingError) elements.incomingError.hidden = true;
  renderIncoming();

  // 【本人指示：送信者の現在の状態を再確認】オフライン・別ゲーム中なら、そもそも
  // 再承認を求めずその場で理由を伝える。
  const presenceEntry = await fetchInviterPresenceOnce(invite.inviterUid);
  const inviterIsOnline = computeIsOnlineForDisplay(presenceEntry, Date.now());
  if (!inviterIsOnline) {
    isIncomingActionBusy = false;
    if (elements.incomingError) {
      elements.incomingError.textContent = `${invite.inviterDisplayName}さんは現在オフラインです。`;
      elements.incomingError.hidden = false;
    }
    renderIncoming();
    return;
  }
  if (presenceEntry?.isPlaying === true) {
    isIncomingActionBusy = false;
    if (elements.incomingError) {
      elements.incomingError.textContent = `${invite.inviterDisplayName}さんは現在ほかのゲームで遊んでいます。`;
      elements.incomingError.hidden = false;
    }
    renderIncoming();
    return;
  }

  const result = await requestJoinPlayInvite(invite.inviteId);
  isIncomingActionBusy = false;
  if (!result.ok) {
    if (elements.incomingError) {
      elements.incomingError.textContent = "通信に失敗しました。もう一度お試しください。";
      elements.incomingError.hidden = false;
    }
    renderIncoming();
    return;
  }
  playSfx(SFX_EVENTS.UI_CONFIRM);
  // joinRequestedへの遷移はhandleIncomingInvitesUpdate()がFirebase経由で検知し、
  // renderJoinRequestStatus()が待機表示へ切り替える。
}

// 保留中の招待から後から参加希望を出した後、受信者側が「取り消す」を押したとき。
async function handleJoinRequestCancelClick() {
  const invite = latestJoinRequestedInvite();
  if (!invite || isIncomingActionBusy) return;
  isIncomingActionBusy = true;
  playSfx(SFX_EVENTS.UI_BACK);
  await cancelJoinRequestPlayInvite(invite.inviteId);
  isIncomingActionBusy = false;
  renderJoinRequestStatus();
  renderIncoming();
}

// 「保留中の招待があります」チップを押したとき：スヌーズを全解除し、あとでにしていた
// 招待をまとめて通常の通知へ戻す。
function handleIncomingReminderClick() {
  playSfx(SFX_EVENTS.UI_CLICK);
  locallySnoozedInviteIds.clear();
  renderIncoming();
}

// 【2026-11-XX新設・本人指示：あとで→後から参加フロー】自分が後から参加希望を出して
// いる招待（status:joinRequestedで、自分がrecipientのもの）を1件だけ探す。
function latestJoinRequestedInvite() {
  const invites = Object.entries(latestRawIncoming)
    .map(([inviteId, invite]) => ({ ...invite, inviteId }))
    .filter((invite) => invite.status === PLAY_INVITE_STATUS.JOIN_REQUESTED)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  return invites[0] ?? null;
}

function renderJoinRequestStatus() {
  if (!elements?.joinRequestStatus) return;
  const invite = latestJoinRequestedInvite();
  const shouldShow = invite !== null && canShowInviteNotification(currentScreenName);
  elements.joinRequestStatus.hidden = !shouldShow;
  if (!shouldShow) return;
  const name = truncateDisplayNameForNotice(invite.inviterDisplayName);
  elements.joinRequestStatusText.textContent = `${name}さんの確認を待っています…`;
}

async function handleIncomingInvitesUpdate(rawValue) {
  latestRawIncoming = rawValue || {};

  // 「参加処理中…」の対象になっている招待にroomIdが付いたら、実際にルームへ参加する
  // （最初から参加した場合・後から参加が承認された場合のどちらもここで検知する）。
  if (isAcceptBusy && pendingAcceptInviteId) {
    const target = latestRawIncoming[pendingAcceptInviteId];
    if (!target) {
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
      // 最新状態を優先する設計）。
      await removeMyIncomingPlayInvite(inviteId);
      return;
    }
  }

  // 【本人指示：あとで→後から参加フロー／リロード復帰】自分宛の招待でstatusが
  // acceptedになっているのに、まだ自分がそれを「参加処理中」として追跡していない場合、
  // ここから追跡を始める（immediate acceptと全く同じ後段の経路に合流させる）。
  // 該当するのは主に2パターン：①後から参加希望（joinRequested）が送信者に承認された
  // 直後、②ページの再読み込み・iOSのバックグラウンド復帰で、accepted済み・roomId
  // 待ちの状態のままメモリ上の追跡（isAcceptBusy等）が失われていた場合。どちらも
  // 「acceptedなのに追跡していない」という同じ形で検出できるため、経路を分けない。
  if (!isAcceptBusy) {
    const acceptedInvite = Object.entries(latestRawIncoming)
      .map(([inviteId, invite]) => ({ ...invite, inviteId }))
      .find((invite) => invite.status === PLAY_INVITE_STATUS.ACCEPTED);
    if (acceptedInvite) {
      isAcceptBusy = true;
      pendingAcceptInviteId = acceptedInvite.inviteId;
      pendingAcceptTimeoutId = setTimeout(async () => {
        pendingAcceptTimeoutId = null;
        if (!isAcceptBusy || pendingAcceptInviteId !== acceptedInvite.inviteId) return;
        await removeMyIncomingPlayInvite(acceptedInvite.inviteId);
        finishAcceptFlow();
      }, PLAY_INVITE_ROOM_WAIT_TIMEOUT_MS);
      // 直後の再帰呼び出しで、上のroomId検知ブロックがそのまま処理してくれる。
      await handleIncomingInvitesUpdate(latestRawIncoming);
      return;
    }
  }

  // 【本人指示：後からの参加希望に「今回はやめる」と回答された場合】受信者側が
  // トーストで知り、招待データを片付ける。
  const declinedBySenderInvite = Object.entries(latestRawIncoming)
    .map(([inviteId, invite]) => ({ ...invite, inviteId }))
    .find((invite) => invite.status === PLAY_INVITE_STATUS.DECLINED_BY_SENDER);
  if (declinedBySenderInvite) {
    await removeMyIncomingPlayInvite(declinedBySenderInvite.inviteId);
    flashIncomingMessage("今回は一緒に遊べませんでした。");
  }

  renderIncoming();
  renderJoinRequestStatus();
}

// 【動作確認用】Firebaseの実データを介さずに、playInvites/{自分のuid}の生データが届いた場合と
// 全く同じ経路（handleIncomingInvitesUpdate→renderIncoming）を直接呼び出す。本番Firebase
// Rulesが未公開の間、Browserペインで受信通知の表示・状態遷移を検証するために追加した
// （実際のFirebase書き込みには一切触れない、副作用の無い診断用の入口）。
export function simulateIncomingPlayInvitesForTesting(rawInvitesValue) {
  handleIncomingInvitesUpdate(rawInvitesValue);
}

// ===================================================================
// 受信側の一時的なトースト（相手が「今回はやめる」等、こちらの操作を伴わない通知）
// ===================================================================
let incomingFlashText = null;
let incomingFlashTimeoutId = null;

function flashIncomingMessage(text) {
  incomingFlashText = text;
  if (!elements?.incomingFlash) return;
  elements.incomingFlash.hidden = false;
  elements.incomingFlash.textContent = text;
  if (incomingFlashTimeoutId !== null) clearTimeout(incomingFlashTimeoutId);
  incomingFlashTimeoutId = setTimeout(() => {
    incomingFlashTimeoutId = null;
    incomingFlashText = null;
    if (elements?.incomingFlash) elements.incomingFlash.hidden = true;
  }, 5000);
}

// ===================================================================
// ②送信側（フレンド一覧の「一緒に遊ぶ」）
// ===================================================================

function renderOutgoingCard() {
  if (!elements?.outgoingCard) return;
  const isFlash = myOutbox === null && outgoingFlashText !== null;
  const canShowHere = canShowInviteNotification(currentScreenName);

  if (isFlash) {
    elements.outgoingCard.hidden = !canShowHere;
    if (canShowHere) {
      elements.outgoingText.textContent = outgoingFlashText;
      elements.outgoingCancelButton.hidden = true;
      elements.outgoingDeclineRequestButton.hidden = true;
      elements.outgoingApproveRequestButton.hidden = true;
    }
    return;
  }

  if (!myOutbox) {
    elements.outgoingCard.hidden = true;
    return;
  }

  const status = myOutboxInviteData?.status ?? PLAY_INVITE_STATUS.PENDING;
  // 【本人指示：「あとで」も送信側の待機を解除する】snoozed中は、送信者側には
  // 何も表示しない（バックグラウンドで監視だけ続ける）。joinRequestedになった瞬間だけ
  // 再承認プロンプトを出す。
  if (status === PLAY_INVITE_STATUS.SNOOZED) {
    elements.outgoingCard.hidden = true;
    return;
  }

  elements.outgoingCard.hidden = !canShowHere;
  if (!canShowHere) return;

  const name = myOutbox.recipientDisplayName;
  if (status === PLAY_INVITE_STATUS.JOIN_REQUESTED) {
    elements.outgoingText.textContent = `🤝 ${name}さんが参加できるようになりました！一緒に遊びますか？`;
    elements.outgoingCancelButton.hidden = true;
    elements.outgoingDeclineRequestButton.hidden = false;
    elements.outgoingApproveRequestButton.hidden = false;
  } else {
    elements.outgoingText.textContent = `${name}さんを招待中…`;
    elements.outgoingCancelButton.hidden = false;
    elements.outgoingDeclineRequestButton.hidden = true;
    elements.outgoingApproveRequestButton.hidden = true;
  }
  const busy = isOutgoingActionBusy || roomCreationInFlightForInviteId === myOutbox.inviteId;
  elements.outgoingCancelButton.disabled = busy;
  elements.outgoingDeclineRequestButton.disabled = busy;
  elements.outgoingApproveRequestButton.disabled = busy;
}

// 【本人指示：「今回は参加しませんでした」等】強い「拒否されました」等の表現は使わない。
// 相手がどの画面へ移動していても気付けるよう、送信者側の状態バーの位置に数秒だけ表示する。
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

async function stopWatchingOutboxInvite() {
  if (unsubscribeOutboxInviteWatch) {
    unsubscribeOutboxInviteWatch();
    unsubscribeOutboxInviteWatch = null;
  }
  myOutboxInviteData = null;
  lastKnownOutboxStatus = null;
}

async function cancelOutgoing() {
  if (!myOutbox) return;
  const { recipientUid, inviteId } = myOutbox;
  await stopWatchingOutboxInvite();
  myOutbox = null;
  roomCreationInFlightForInviteId = null;
  renderOutgoingCard();
  await cancelOutgoingPlayInvite({ recipientUid, inviteId });
}

async function handleOutboxChange(outboxEntry) {
  const prevKey = myOutbox ? `${myOutbox.recipientUid}/${myOutbox.inviteId}` : null;
  const nextKey = outboxEntry ? `${outboxEntry.recipientUid}/${outboxEntry.inviteId}` : null;
  myOutbox = outboxEntry;

  if (nextKey !== prevKey) {
    await stopWatchingOutboxInvite();
    roomCreationInFlightForInviteId = null;
    if (outboxEntry) {
      unsubscribeOutboxInviteWatch = watchPlayInvite(
        { recipientUid: outboxEntry.recipientUid, inviteId: outboxEntry.inviteId },
        handleOutboxInviteDataChange
      );
    }
  }
  renderOutgoingCard();
}

async function handleOutboxInviteDataChange(inviteData) {
  if (!myOutbox) return; // 自分から取り消した直後の残留イベント等は無視する
  const previousStatus = lastKnownOutboxStatus;
  myOutboxInviteData = inviteData;

  if (inviteData === null) {
    // 【本人指示：Firebaseを正本にする】相手が断った場合はdeclinedByRecipientを経由する
    // ため、ここに来るのは主に期限切れ（自然消滅）のケース。
    const name = myOutbox.recipientDisplayName;
    lastKnownOutboxStatus = null;
    await stopWatchingOutboxInvite();
    myOutbox = null;
    roomCreationInFlightForInviteId = null;
    flashOutgoingMessage(`${name}さんとの「一緒に遊ぶ」招待の有効期限が切れました。`);
    return;
  }

  lastKnownOutboxStatus = inviteData.status;

  if (inviteData.status === PLAY_INVITE_STATUS.DECLINED_BY_RECIPIENT) {
    const name = myOutbox.recipientDisplayName;
    const target = { recipientUid: myOutbox.recipientUid, inviteId: myOutbox.inviteId };
    await stopWatchingOutboxInvite();
    myOutbox = null;
    roomCreationInFlightForInviteId = null;
    await finalizeOutgoingPlayInvite(target);
    flashOutgoingMessage(`${name}さんは今回は参加しませんでした。`);
    return;
  }

  if (inviteData.status === PLAY_INVITE_STATUS.SNOOZED && previousStatus !== PLAY_INVITE_STATUS.SNOOZED) {
    flashOutgoingMessage(`${myOutbox.recipientDisplayName}さんはあとで確認します。`);
  }

  if (inviteData.status === PLAY_INVITE_STATUS.ACCEPTED && !inviteData.roomId) {
    if (roomCreationInFlightForInviteId === myOutbox.inviteId) {
      renderOutgoingCard();
      return;
    }
    roomCreationInFlightForInviteId = myOutbox.inviteId;

    if (getCurrentOnlineRoomId() !== null) {
      const target = { recipientUid: myOutbox.recipientUid, inviteId: myOutbox.inviteId };
      roomCreationInFlightForInviteId = null;
      await stopWatchingOutboxInvite();
      myOutbox = null;
      await finalizeOutgoingPlayInvite(target);
      flashOutgoingMessage("現在ルームに参加中のため、この招待を成立できませんでした。");
      return;
    }

    const { recipientUid, inviteId } = myOutbox;
    const playerName = getActivePlayer().playerName || "プレイヤー";
    const result = await createRoom({ playerName, maxPlayers: MAX_PLAYERS });
    if (!result.ok) {
      roomCreationInFlightForInviteId = null;
      await stopWatchingOutboxInvite();
      myOutbox = null;
      await finalizeOutgoingPlayInvite({ recipientUid, inviteId });
      flashOutgoingMessage("ルームの作成に失敗しました。通信環境をご確認のうえ、もう一度お試しください。");
      return;
    }
    await attachRoomIdToOutgoingPlayInvite({ recipientUid, inviteId, roomId: result.roomId });

    // 【設計メモ：js/playInvites.jsのclearMyOutboxOnly()コメント参照】招待データ本体は
    // ここでは消さない（受信者側がroomIdを読み取って参加した後、自分で消す）。
    await stopWatchingOutboxInvite();
    myOutbox = null;
    roomCreationInFlightForInviteId = null;
    await clearMyOutboxOnly();
    renderOutgoingCard();
    playSfx(SFX_EVENTS.UI_CONFIRM);
    goToLobby(result.roomId);
    return;
  }

  renderOutgoingCard();
}

async function handleOutgoingCancelClick() {
  if (isOutgoingActionBusy || !myOutbox) return;
  isOutgoingActionBusy = true;
  playSfx(SFX_EVENTS.UI_BACK);
  renderOutgoingCard();
  await cancelOutgoing();
  isOutgoingActionBusy = false;
}

// 【本人指示：あとで→後から参加フロー】送信者が「一緒に遊ぶ」（後からの参加希望を承認）。
async function handleOutgoingApproveRequestClick() {
  if (isOutgoingActionBusy || !myOutbox) return;
  if (getCurrentOnlineRoomId() !== null) {
    flashOutgoingMessage("現在ルームに参加中のため、承認できません。");
    return;
  }
  isOutgoingActionBusy = true;
  playSfx(SFX_EVENTS.UI_CONFIRM);
  renderOutgoingCard();
  const result = await respondToJoinRequest({ recipientUid: myOutbox.recipientUid, inviteId: myOutbox.inviteId }, true);
  isOutgoingActionBusy = false;
  if (!result.ok) {
    flashOutgoingMessage("通信に失敗しました。もう一度お試しください。");
    return;
  }
  // 実際のルーム作成はhandleOutboxInviteDataChange()がstatus:'accepted'を検知して行う。
  renderOutgoingCard();
}

// 送信者が「今回はやめる」（後からの参加希望を断る）。
async function handleOutgoingDeclineRequestClick() {
  if (isOutgoingActionBusy || !myOutbox) return;
  isOutgoingActionBusy = true;
  playSfx(SFX_EVENTS.UI_BACK);
  renderOutgoingCard();
  const target = { recipientUid: myOutbox.recipientUid, inviteId: myOutbox.inviteId };
  await respondToJoinRequest(target, false);
  // 【設計メモ】招待データ本体は受信者側が後片付けする（js/playInvites.jsの
  // respondToJoinRequest()コメント・js/playInviteUi.jsのhandleIncomingInvitesUpdate参照）。
  // 送信者側は自分のoutboxだけを片付ける。
  await stopWatchingOutboxInvite();
  myOutbox = null;
  isOutgoingActionBusy = false;
  await clearMyOutboxOnly();
  renderOutgoingCard();
}

async function sendFlow(profile) {
  hideFlowError();
  const inviterDisplayName = getActivePlayer().playerName || "フレンド";
  const result = await sendPlayInvite({
    recipientUid: profile.uid,
    recipientDisplayName: profile.displayName,
    inviterDisplayName,
  });
  if (!result.ok) {
    if (result.reason === "already-sending") {
      showFlowError("既に別の招待を送信中です。少し待ってからもう一度お試しください。");
    } else {
      showFlowError("招待の送信に失敗しました。通信環境をご確認のうえ、もう一度お試しください。");
    }
    return;
  }
  // myOutbox・監視の開始は、subscribeToMyOutbox()の購読が自動的に検知して行う
  // （handleOutboxChange参照。ここで手動で設定する必要は無い＝Firebaseが正本）。
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

  if (myOutbox && myOutbox.recipientUid === profile.uid) {
    // 既に同じ相手を招待中：何もしない（重複送信しない）。
    return;
  }

  if (myOutbox) {
    openSwitchConfirm(
      `現在${myOutbox.recipientDisplayName}さんを招待中です。取り消して${profile.displayName}さんを招待しますか？`,
      async () => {
        await cancelOutgoing();
        await sendFlow(profile);
      }
    );
    return;
  }

  await sendFlow(profile);
}

// ===================================================================
// 切り替え確認モーダル（共用）
// ===================================================================

function openSwitchConfirm(text, onConfirm) {
  pendingSwitchConfirmAction = onConfirm;
  elements.switchConfirmText.textContent = text;
  elements.switchConfirmModal.hidden = false;
}

function closeSwitchConfirm() {
  pendingSwitchConfirmAction = null;
  elements.switchConfirmModal.hidden = true;
}

let isSwitchConfirmBusy = false;
async function handleSwitchConfirmOkClick() {
  if (isSwitchConfirmBusy) return;
  isSwitchConfirmBusy = true;
  const action = pendingSwitchConfirmAction;
  playSfx(SFX_EVENTS.UI_CONFIRM);
  closeSwitchConfirm();
  if (action) await action();
  isSwitchConfirmBusy = false;
}

// js/main.jsから一度だけ呼ぶ。
export function initPlayInviteUi(newElements) {
  elements = newElements;
  currentScreenName = document.body.dataset.screen ?? null;

  elements.incomingCompactConfirmButton?.addEventListener("click", handleIncomingCompactConfirmClick);
  elements.incomingAcceptButton.addEventListener("click", handleIncomingAcceptClick);
  elements.incomingDeclineButton.addEventListener("click", handleIncomingDeclineClick);
  elements.incomingLaterButton?.addEventListener("click", handleIncomingLaterClick);
  elements.incomingReminder?.addEventListener("click", handleIncomingReminderClick);
  elements.joinRequestCancelButton?.addEventListener("click", handleJoinRequestCancelClick);

  elements.outgoingCancelButton.addEventListener("click", handleOutgoingCancelClick);
  elements.outgoingApproveRequestButton?.addEventListener("click", handleOutgoingApproveRequestClick);
  elements.outgoingDeclineRequestButton?.addEventListener("click", handleOutgoingDeclineRequestClick);

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
    currentScreenName = screenName;
    renderIncoming();
    renderJoinRequestStatus();
    renderOutgoingCard();
  });

  subscribeToMyIncomingPlayInvites(handleIncomingInvitesUpdate);
  subscribeToMyOutbox(handleOutboxChange);
  setInterval(() => {
    renderIncoming();
    renderJoinRequestStatus();
    renderOutgoingCard();
  }, 20000);
}
