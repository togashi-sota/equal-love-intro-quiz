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
import { computeIsOnlineForDisplay, canShowInviteNotification } from "./presencePayloads.js";
import { onScreenChange } from "./screens.js";
import { joinRoomFromInvite } from "./onlineBattleScreen.js";
import { getActivePlayer } from "./playerProfile.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

// 【2026-11-XX改訂・本人指示：招待通知を表示できる画面の拡大】以前は「ホーム画面
// （"start"）でだけ表示する」という固定の1画面限定だったが、「実際のバトルを邪魔しない
// 画面なら表示してよい」という指示により、js/presencePayloads.jsの
// canShowInviteNotification()（出題・回答中の画面以外はすべて許可）へ判定を一本化した。
// バトル中には絶対表示しない、という核心のルールはこちらの関数がそのまま担う。

// バナーの再判定（期限切れの掃除も含む）を、画面遷移が無いままでも取りこぼさないための
// 定期チェック間隔。招待の有効期限（5分）に対して十分細かく、かつ無駄なタイマー負荷にならない
// 長さとして選んだ。
const BANNER_RECHECK_INTERVAL_MS = 20000;

let elements = null;
let currentScreenName = null;
let latestRawInvites = {};
let activeInvites = [];
// 表示対象（activeInvitesからsnoozedRoomIdsを除いたもの）。accept/decline/laterの
// 各ハンドラは、常にこの配列の先頭（＝今バナーに表示されている招待）を対象にする。
let displayableInvites = [];
let isAcceptBusy = false;

// 【本人指示：3択仕様「参加する／あとで／断る」】「あとで」を押した招待のroomIdを
// 保持する。Firebaseの招待データそのものには一切触れず、この端末のこのセッション内だけの
// 表示状態として扱う（ページを離れず「あとで」を押した直後は表示から消えるが、
// ホーム画面を離れて再訪すると自動的に消える＝次に来たときにまた確認できる、という
// 本人指定の仕様を、onScreenChangeでホーム以外に切り替わった瞬間にクリアする形で実現する）。
const snoozedRoomIds = new Set();

// ---- ①ロビーの「友達を招待」ピッカー ----
let pendingInviteRoomId = null;
const sendCooldownByRecipientUid = new Map();

function closeInvitePicker() {
  if (!elements) return;
  elements.pickerModal.hidden = true;
  pendingInviteRoomId = null;
}

// 【本人指示：プレイ中の相手にも招待は送れる】isPlayingは表示・送信後メッセージの
// 出し分けだけに使い、招待の送信自体を止める判定には一切使わない。
function buildInviteRow(profile, isPlaying) {
  const row = document.createElement("div");
  row.className = "room-invite-picker-row";

  const name = document.createElement("span");
  name.className = "room-invite-picker-row-name";
  // 【2026-11-XX新設・本人指示：「🎮 プレイ中」表示】招待する側にも、相手が今
  // 対戦・出題中かどうかが分かるようにする（詳しい曲名・モード・対戦相手までは出さない）。
  name.textContent = isPlaying ? `🎮 ${profile.displayName}` : `🟢 ${profile.displayName}`;
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
      // 【本人指示】プレイ中の相手へ送った場合は、その場では相手のプレイを邪魔しないこと・
      // ホームへ戻った時に通知されることが招待した側にも分かるようにする。
      button.textContent = isPlaying ? "招待しました（プレイ終了後に通知されます）" : "招待を送りました";
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = "招待する";
      }, INVITE_RESEND_COOLDOWN_MS);
    } else {
      // 【2026-11-XX修正】js/roomInvites.jsのsendRoomInvite()はもう"cooldown"を返さない
      // （クールダウン判定は、この関数の直前で行っている端末内のcanResendInvite()判定だけで
      // 十分なため）。ここに来るのは「送信に失敗しました」という素直な失敗のみ。
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

  onlineFriends.forEach((profile) =>
    elements.pickerList.appendChild(buildInviteRow(profile, presenceByUid[profile.uid]?.isPlaying === true))
  );
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
  // snoozedRoomIdsに無い有効期限切れの招待IDは、次にactiveInvitesへ現れることが無いため
  // 自然に意味を失う（掃除自体は下のcleanupExpiredInvitesが担当）。ここでは、有効期限が
  // 切れた招待をいつまでもsnoozedRoomIdsに残さないよう、現存する招待のroomId集合に無い
  // ものを取り除いておく（メモリリークにはならない規模だが、意味の無いIDを持ち続けない）。
  const activeRoomIdSet = new Set(activeInvites.map((invite) => invite.roomId));
  [...snoozedRoomIds].forEach((roomId) => {
    if (!activeRoomIdSet.has(roomId)) snoozedRoomIds.delete(roomId);
  });

  const expiredRoomIds = listExpiredInviteRoomIds(latestRawInvites, now);
  if (expiredRoomIds.length > 0) cleanupExpiredInvites(expiredRoomIds);

  // 「あとで」にした招待は、Firebase上のデータとしては有効なまま（activeInvitesには
  // 含まれ続ける）だが、バナーに表示する候補からは除外する。
  displayableInvites = activeInvites.filter((invite) => !snoozedRoomIds.has(invite.roomId));

  const shouldShow =
    !isAcceptBusy && displayableInvites.length > 0 && canShowInviteNotification(currentScreenName);
  elements.banner.hidden = !shouldShow;
  if (!shouldShow) return;

  const topInvite = displayableInvites[0];
  elements.bannerText.textContent = `${topInvite.inviterDisplayName}さんから対戦ルームへの招待が届いています`;
  // 「ほか◯件」は、今表示している1件を除いた「有効な招待の総数」（あとで中のものも含む）。
  // あとでにした招待も本人にとっては「まだ残っている招待」であるため、件数からは省かない。
  const restCount = activeInvites.length - 1;
  if (elements.bannerMoreLabel) {
    elements.bannerMoreLabel.hidden = restCount <= 0;
    elements.bannerMoreLabel.textContent = restCount > 0 ? `ほか${restCount}件の招待があります` : "";
  }
}

function setBannerButtonsDisabled(disabled) {
  elements.bannerAcceptButton.disabled = disabled;
  elements.bannerDeclineButton.disabled = disabled;
  if (elements.bannerLaterButton) elements.bannerLaterButton.disabled = disabled;
}

async function handleAcceptClick() {
  if (isAcceptBusy || displayableInvites.length === 0) return;
  const topInvite = displayableInvites[0];
  playSfx(SFX_EVENTS.UI_CONFIRM);
  isAcceptBusy = true;
  setBannerButtonsDisabled(true);

  const playerName = getActivePlayer().playerName || "プレイヤー";
  const result = await joinRoomFromInvite({ roomId: topInvite.roomId, playerName });

  setBannerButtonsDisabled(false);
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

// 「断る」：処理済み扱い（本人指示どおり）。Firebase上の招待データを削除する。
function handleDeclineClick() {
  if (displayableInvites.length === 0) return;
  playSfx(SFX_EVENTS.UI_BACK);
  const topInvite = displayableInvites[0];
  removeMyInvite(topInvite.roomId);
  renderBanner();
}

// 【本人指示：3択仕様】「あとで」：Firebase上の招待データには一切触れない（未処理のまま
// 有効期限まで残る）。この端末では、いま表示していたバナーだけをその場で閉じる。
// 他の招待（複数招待のうち残りの分）には一切影響しない。
function handleLaterClick() {
  if (displayableInvites.length === 0) return;
  playSfx(SFX_EVENTS.UI_BACK);
  const topInvite = displayableInvites[0];
  snoozedRoomIds.add(topInvite.roomId);
  renderBanner();
}

function handleInvitesUpdate(rawInvitesValue) {
  latestRawInvites = rawInvitesValue || {};
  renderBanner();
}

// 【動作確認用】Firebaseの実データを介さずに、invites/{自分のuid}の生データが届いた場合と
// 全く同じ経路（handleInvitesUpdate→renderBanner）を直接呼び出す。本番Firebase Rulesが
// 未公開の間、Browserペインで3択（参加する／あとで／断る）の表示・状態遷移を検証するために
// 追加した（実際のFirebase書き込みには一切触れない、副作用の無い診断用の入口）。
export function simulateInvitesUpdateForTesting(rawInvitesValue) {
  handleInvitesUpdate(rawInvitesValue);
}

// js/main.jsから一度だけ呼ぶ。
export function initRoomInviteUi(newElements) {
  elements = newElements;

  // 【実機相当のBrowserペイン確認で発見・修正】js/main.jsは起動時、このinitRoomInviteUi()
  // より前の時点で既にshowScreen("start")を呼び終えている（オンボーディング不要な
  // 既存ユーザーの場合）。onScreenChange()は「これから先に起きる画面切り替え」しか
  // 通知しないため、登録が遅れるこのタイミングでは最初のstart画面表示を取りこぼし、
  // currentScreenNameがnullのままになる＝home画面にいるのにバナーが一切表示されない、
  // という実害のあるバグになっていた。js/screens.jsのshowScreen()がdocument.body.dataset.
  // screenへ同期的に書き込んでいることを利用し、起動時点の現在画面をここで直接読み取って
  // 初期同期する。
  currentScreenName = document.body.dataset.screen ?? null;

  elements.bannerAcceptButton.addEventListener("click", handleAcceptClick);
  elements.bannerDeclineButton.addEventListener("click", handleDeclineClick);
  elements.bannerLaterButton?.addEventListener("click", handleLaterClick);

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
    // 【2026-11-XX改訂・本人指示：「あとで」は画面を離れると再表示される】以前は
    // 「ホーム画面（"start"）から他画面へ切り替わった瞬間だけ」クリアしていたが、
    // 招待バナーを表示できる画面がホーム以外にも増えたため、画面が実際に切り替わる
    // たびにスヌーズ状態をクリアするよう一般化する。「あとで」はあくまで「今見ている
    // この画面ではいったん閉じる」という一時的な操作であり、次にどの安全な画面へ
    // 移動しても（canShowInviteNotification()がtrueであれば）renderBanner()が
    // 改めて表示するかどうかを判定する。
    if (currentScreenName !== null && screenName !== currentScreenName) {
      snoozedRoomIds.clear();
    }
    currentScreenName = screenName;
    renderBanner();
  });

  subscribeToMyInvites(handleInvitesUpdate);
  setInterval(renderBanner, BANNER_RECHECK_INTERVAL_MS);
}
