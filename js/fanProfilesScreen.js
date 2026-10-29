// 「みんなのプロフィール」画面を担当するファイル（2026-08-07新設）。
// このアプリを使っているファン同士で、表示名・推し・称号を見せ合える一覧画面。
// 対戦・ランキングではないため、勝敗や称号数での順位付けは一切行わない（本人指示）。
//
// 【役割分担】DOM構築はjs/fanProfileCard.js、Firebaseとのやり取りはjs/publicProfileSync.jsに
// 任せ、このファイルは状態管理・イベント配線だけを行う（既存パターンと同じ
// 「エンジンは再利用、画面は専用ファイル」の考え方）。
import {
  isPublicProfileSharingEnabled,
  setPublicProfileSharingEnabled,
  fetchAllPublicProfiles,
  getMyUid,
  deletePublicProfileByAdmin,
} from "./publicProfileSync.js";
import { syncRankingCandidatesToFirebase } from "./timeAttackLeaderboardSync.js";
import { resolveIsAdminUser } from "./adminConfig.js";
// 【2026-10-28追加】管理者の診断表示（表示だけ。権限は一切与えない）
import { getLastAdminCheck, getRememberedAdminUids } from "./adminConfig.js";
import { describeAdminDiagnostics } from "./adminAccess.js";
import { hasPendingUidMerge, planUidMerge, executeUidMerge, describeUidMergePlan, fetchSupersessionLinks } from "./uidSupersession.js";
import { getPlayerKeyPrefix, getActivePlayer, getPendingUidMerge, getCompletedUidMerges, getLastKnownUid, getUidMergeQueue, getKnownOldUidsForPlayer } from "./playerProfile.js";
// 【2026-10-28追加】以前のあなた／現在のあなたの比較・管理者の確認コード・アカウント保護（詳細情報の中に JS で作る）
import { mountAccountRecoveryPanel, refreshAccountRecoveryPanel } from "./accountRecoveryPanel.js";
// 【2026-10-28追加】同じプレイヤーの重複カードをまとめる／同じ名前の別プレイヤーを見分ける（純粋関数）
import { collapseSamePlayerProfiles, annotateSameNameProfiles, collectMyKnownOldUids, shortUidSuffix, selectSupersessionLookupCandidates, describeAdminDeleteTarget, normalizeDisplayNameForCompare } from "./fanProfilesIdentity.js";
import { getAuthUidHistory } from "./firebaseClient.js";
import { summarizeAuthUidHistory } from "./identityBootstrap.js";
import { getMemberById } from "./memberUtils.js";
import {
  buildProfileCard,
  buildOshiSwatch,
  buildAchievedAchievementsList,
  buildAchievementCountText,
  buildFriendAchievementSummary,
  sortProfiles,
} from "./fanProfileCard.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { describeSharedDataStatus } from "./dataStatusShare.js";
import { subscribeToAllPresence, getPresenceNowMs } from "./presenceSync.js";
import { describePresenceDiagnostics } from "./presenceDiagnostics.js";
import { sortProfilesByPresence, classifyPresenceEntry } from "./presencePayloads.js";
import { onScreenChange } from "./screens.js";
import { requestPlayInvite } from "./playInviteUi.js";
// 【2026-09-05新設・本人指示：実機フィードバックによる改善】既に自分と同じオンライン
// ルームにいるフレンドを「一緒に遊ぶ」の対象から除外するための判定に使う。
import { getCurrentOnlineRoomPlayerUids } from "./onlineBattleScreen.js";

let elements = null;
let members = null;
// 【2026-11-XX新設・本人指示：フレンドのオンライン状態】この画面を開いている間だけ
// presence/を購読する（画面を離れたら止め、無駄なFirebase接続を残さない）。
let latestProfiles = [];
let latestPresenceByUid = {};
let unsubscribePresence = null;
// 2026-08-16追加：この端末が管理者かどうか。
// 【2026-09-15改訂】以前はjs/adminConfig.jsに直書きしたADMIN_UIDとの一致で判定していたが、
// Firebase上の許可リスト admins/{uid} を読む方式（resolveIsAdminUser()）へ変更した。
// 読めない・未登録の間は誰であってもfalseになり、管理者用UIは一切表示されない。
let isAdminUser = false;
// 【2026-11-XX新設・本人指示：「一緒に遊ぶ」】自分自身のカードには「一緒に遊ぶ」ボタンを
// 出さないための判定に使う（js/fanProfileCard.jsのbuildProfileCard()のmyUid参照）。
let myUid = null;
// 削除確認モーダルで「削除する」が押されたときに対象を特定するための一時保持。
let pendingAdminDeleteProfile = null;

function renderEmptyState(kind) {
  elements.listContainer.innerHTML = "";
  const message = document.createElement("p");
  message.className = "fan-profiles-empty";
  if (kind === "no-profiles") {
    message.textContent = "まだ他のファンはいません。プロフィール公開をONにすると、ここに表示されます。";
  } else {
    message.textContent = "フレンドを読み込めませんでした。電波の良い場所でもう一度開いてみてください。";
  }
  elements.listContainer.appendChild(message);
}

function renderLoadingState() {
  elements.listContainer.innerHTML = "";
  const loading = document.createElement("p");
  loading.className = "fan-profiles-loading";
  loading.textContent = "読み込み中…";
  elements.listContainer.appendChild(loading);
}

// 【2026-11-XX新設・本人指示：フレンドのオンライン状態】プロフィール一覧の並び替え・
// カード描画だけをやり直す軽量な再描画。presence（オンライン状態）が更新されるたびに
// 何度も呼ばれる想定のため、Firebaseへの再取得（fetchAllPublicProfiles）は行わない
// （本人指示「毎秒Firebaseへ書く必要はない」と同じ考え方を、読み取り側にも適用する）。
function renderProfileListFromCache() {
  if (latestProfiles.length === 0) return;
  elements.listContainer.innerHTML = "";
  // 【2026-09-05新設・本人指示】この一覧を描画する瞬間の「今のルームの参加者」を
  // 1回だけ取得し、全カードで使い回す（カード1枚ごとに問い合わせる必要はない値のため）。
  const currentRoomPlayerUids = getCurrentOnlineRoomPlayerUids();
  // 【2026-10-28変更】判定の「今」はサーバー時刻の推定値（端末の時計がずれていても正しく判定する）
  const nowMs = getPresenceNowMs();
  const displayProfiles = buildDisplayProfiles(latestProfiles, nowMs);
  sortProfilesByPresence(sortProfiles(displayProfiles), latestPresenceByUid, nowMs).forEach((profile) =>
    elements.listContainer.appendChild(
      buildProfileCard(profile, members, openDetailModal, {
        isAdmin: isAdminUser,
        onAdminDeleteRequest: openAdminDeleteConfirm,
        presenceEntry: latestPresenceByUid[profile.uid] ?? null,
        onPlayInviteRequest: requestPlayInvite,
        myUid,
        isInMyCurrentRoom: currentRoomPlayerUids.has(profile.uid),
        nowMs,
      })
    )
  );
  renderIdentityDiagnostics();
}

// 【2026-10-28新設・本人の実機報告「がしおが2人」】同じプレイヤーだと強い証拠で分かるカードを1枚にまとめ、
// 同じ名前の別プレイヤーには短い印（UID末尾4文字）を付ける。Firebase のデータは一切変えない（表示だけ）。
// 管理者には旧IDのカードも残す（「以前のID」と明記。既存の削除ボタンで整理できるように）。
let lastHiddenDuplicates = [];
// 【2026-10-28追加】uidSupersession から読めた「旧UID→新UID」（今の本番 Rules では読めないので空のまま）
let supersessionLinks = {};

function getMyKnownOldUids() {
  const player = getActivePlayer();
  return collectMyKnownOldUids({
    currentUid: myUid,
    pendingOldUid: getPendingUidMerge(player.playerId)?.oldUid ?? null,
    completedOldUids: getCompletedUidMerges(player.playerId),
    lastKnownUid: getLastKnownUid(player.playerId),
    // 【2026-10-28】整理待ちの列にある旧UID全部（UIDが2回以上変わっても全部わかる）
    queuedOldUids: getKnownOldUidsForPlayer(player.playerId, myUid),
  });
}

function buildDisplayProfiles(profiles, nowMs) {
  const presenceRankByUid = {};
  profiles.forEach((profile) => {
    const classified = classifyPresenceEntry(latestPresenceByUid[profile.uid], nowMs);
    presenceRankByUid[profile.uid] = {
      online: classified.state === "online" || classified.state === "playing",
      lastSeen: classified.lastSeen ?? -Infinity,
    };
  });
  const { profiles: collapsed, hidden } = collapseSamePlayerProfiles(profiles, {
    myUid,
    myKnownOldUids: getMyKnownOldUids(),
    supersessionLinks,
    presenceRankByUid,
    keepHiddenForAdmin: isAdminUser,
  });
  lastHiddenDuplicates = hidden;
  return annotateSameNameProfiles(collapsed);
}

// 【2026-10-28新設】「詳細情報」の中に、IDの変更履歴・旧IDの整理状況・管理者判定を表示する（表示専用）。
// index.html を変えずに済むよう、要素はここで1回だけ作って詳細情報の末尾へ足す。
let identityDiagElement = null;

function renderIdentityDiagnostics() {
  if (!elements?.details) return;
  if (!identityDiagElement) {
    identityDiagElement = document.createElement("div");
    identityDiagElement.className = "fan-profiles-identity-diag";
    elements.details.appendChild(identityDiagElement);
  }
  const lines = [];
  const historySummary = summarizeAuthUidHistory(getAuthUidHistory());
  if (historySummary.uidChangeCount > 0) {
    const last = historySummary.lastChange;
    const when = typeof last?.at === "number" ? new Date(last.at).toLocaleString("ja-JP") : "不明";
    lines.push(`🔁 この端末でIDが変わった記録：${historySummary.uidChangeCount}回（最新：${when}、…${shortUidSuffix(last?.fromUid ?? "")} → …${shortUidSuffix(last?.toUid ?? "")}）`);
    if (historySummary.lastChangeReason) lines.push(`　推定される原因：${historySummary.lastChangeReason}`);
  }
  const player = getActivePlayer();
  const pending = getPendingUidMerge(player.playerId);
  if (pending) {
    const more = pending.queuedCount > 1 ? `／ほかに ${pending.queuedCount - 1}件が順番待ち` : "";
    lines.push(`🧹 以前のID（…${shortUidSuffix(pending.oldUid)}）の整理：未完了（上の案内から実行できます${more}）`);
  }
  const completedCount = getCompletedUidMerges(player.playerId).length;
  if (completedCount > 0) lines.push(`🧹 整理済みの以前のID：${completedCount}件`);
  if (lastHiddenDuplicates.length > 0) {
    lines.push(`👥 同じプレイヤーの重複カードを ${lastHiddenDuplicates.length}件まとめて表示しています（データは消していません）`);
  }
  const admin = describeAdminDiagnostics({
    currentUid: myUid,
    checkResult: getLastAdminCheck().result,
    rememberedAdminUids: getRememberedAdminUids(),
  });
  if (admin.status !== "not-admin") lines.push(...admin.lines.map((line) => `🔑 ${line}`));

  identityDiagElement.hidden = lines.length === 0;
  identityDiagElement.innerHTML = "";
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.className = "fan-profiles-identity-diag-line";
    p.textContent = line;
    identityDiagElement.appendChild(p);
  });
}

async function renderProfileList() {
  renderLoadingState();
  const { ok, profiles } = await fetchAllPublicProfiles();
  if (!ok) {
    renderEmptyState("fetch-failed");
    return;
  }
  if (profiles.length === 0) {
    latestProfiles = [];
    renderEmptyState("no-profiles");
    return;
  }
  latestProfiles = profiles;
  renderProfileListFromCache();
  // 【2026-10-28追加】同じ本人キーのカードがあるときだけ、改ざんできない対応表（uidSupersession）を読みに行く。
  // 今の本番 Rules では読めない（1回拒否されたら、このセッション中は読みに行かない）。読めたら表示をまとめ直す。
  const candidates = selectSupersessionLookupCandidates(profiles, { myUid });
  if (candidates.length > 0) {
    fetchSupersessionLinks(candidates)
      .then((links) => {
        if (Object.keys(links).length === 0) return;
        supersessionLinks = { ...supersessionLinks, ...links };
        renderProfileListFromCache();
      })
      .catch(() => {});
  }
}

// 自分のUIDを取得し、「🆔 あなたのID」表示の更新と管理者判定を行う（2026-08-16追加）。
// 通信に失敗してUIDが取れない場合でも、isAdminUserはfalseのままになるだけで画面は壊れない。
async function renderMyUidAndAdminState() {
  const uid = await getMyUid();
  myUid = uid;
  if (elements.myUidValue) {
    elements.myUidValue.textContent = uid ?? "取得できませんでした";
  }
  isAdminUser = uid !== null && (await resolveIsAdminUser());
  // 【2026-10-23】管理者は「詳細情報（ID・接続状態）」を最初から開いた状態にする（一般ユーザーは閉じたまま）。
  // 判定は既存の正式な管理者判定（admins/{uid}）だけを使う。
  if (elements.details && isAdminUser && !detailsInitialized) {
    elements.details.open = true;
  }
  // ログインIDが取れなかった（オフライン等）ときは判定できていないので、次回の表示で改めて判定する
  if (uid !== null) detailsInitialized = true;
  // 【2026-08-29追加】バックアップ管理画面への入口も、この時点で判明した管理者判定に合わせて
  // 表示/非表示を切り替える（既存の削除ボタンと同じ「非表示はUI上の配慮に過ぎず、
  // 本当の権限チェックはFirebase Rules側」という設計方針）。
  if (elements.adminBackupLinkButton) {
    elements.adminBackupLinkButton.hidden = !isAdminUser;
  }
  // 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
  // 音源診断ログ画面への入口も、上のバックアップ管理と全く同じ判定で出し分ける。
  if (elements.debugAudioLogLinkButton) {
    elements.debugAudioLogLinkButton.hidden = !isAdminUser;
  }
  // 【2026-10-28追加】IDの変更履歴・管理者判定の診断表示（表示専用）
  renderIdentityDiagnostics();
  // 【2026-10-28追加】以前のあなた／現在のあなた・管理者の確認コード・アカウント保護（1回だけ作り、以後は表示の更新だけ）
  if (elements.details) {
    mountAccountRecoveryPanel(elements.details, {
      getMyUid: () => myUid,
      isAdmin: () => isAdminUser,
      getRememberedAdminUids: () => getRememberedAdminUids(),
      getUidMergeQueue: () => getUidMergeQueue(getActivePlayer().playerId),
      getPendingUidMerge: () => getPendingUidMerge(getActivePlayer().playerId, { currentUid: myUid }),
      onMerged: () => renderProfileList(),
    });
    refreshAccountRecoveryPanel();
  }
}

// 設定カード（「みんなに公開する」トグル）を、今の公開設定に合わせて描画する。
function renderSharingSettings() {
  const playerKeyPrefix = getPlayerKeyPrefix();
  const enabled = isPublicProfileSharingEnabled(playerKeyPrefix);
  elements.sharingToggleButton.classList.toggle("is-on", enabled);
  elements.sharingToggleButton.setAttribute("aria-pressed", String(enabled));
  elements.sharingToggleLabel.textContent = enabled ? "ON" : "OFF";
  // 【2026-10-23】公開設定カードを一覧の下へ移したので、OFFの人には一覧の上で短く案内する
  if (elements.privateNote) elements.privateNote.hidden = enabled;
}

// 【2026-08-16追加、本人指示】OFF→ONへ切り替えた瞬間、OFF中でもランキング条件を満たして
// ローカルに貯まっていた自己ベスト（js/rankingCandidateStore.js）をまとめてFirebaseへ同期する。
// 比較・上書き判定は既存のsubmitTimeAttackScoreIfBetter()をそのまま再利用するため、ここでは
// 「いつ呼ぶか」と「結果をどう見せるか」だけを担当する（js/timeAttackLeaderboardSync.jsの
// syncRankingCandidatesToFirebase参照）。ON→OFFのときは呼ばない（同期する新しい記録が無いため）。
async function handleSharingToggleClick() {
  playSfx(SFX_EVENTS.UI_CLICK);
  const playerKeyPrefix = getPlayerKeyPrefix();
  const nextEnabled = !isPublicProfileSharingEnabled(playerKeyPrefix);
  setPublicProfileSharingEnabled(playerKeyPrefix, nextEnabled);
  renderSharingSettings();
  // 公開ON/OFFの直後は、自分の表示が一覧へ反映されたかどうかも合わせて確認できるよう再読込する。
  // 【2026-10-23追加（レビュー指摘）】公開設定が一覧の下に移ったため、再読込中に一覧が「読み込み中…」へ縮むと
  // 押したトグルが指の下から逃げる。読み込みが終わるまで一覧の高さを保つ。
  const list = elements.listContainer;
  if (list) list.style.minHeight = `${list.offsetHeight}px`;
  Promise.resolve(renderProfileList()).finally(() => {
    if (list) list.style.minHeight = "";
  });

  if (!nextEnabled) {
    if (elements.rankingSyncStatus) elements.rankingSyncStatus.hidden = true;
    return;
  }

  if (elements.rankingSyncStatus) {
    elements.rankingSyncStatus.hidden = false;
    elements.rankingSyncStatus.textContent = "ランキング記録を同期しています…";
  }
  const result = await syncRankingCandidatesToFirebase(playerKeyPrefix);
  if (!elements.rankingSyncStatus) return;
  if (result.updated > 0) {
    elements.rankingSyncStatus.textContent = "過去のベスト記録をランキングに反映しました";
  } else {
    // 同期対象が無かった・すでに最新だった・オフラインだった等、特に伝えるべきことが無い場合は
    // 控えめに消す（本人指示：「大げさなモーダルは不要」「UI/UX視点で自然な形に」）。
    elements.rankingSyncStatus.hidden = true;
  }
}

// 「すべての称号を見る」の初期表示文言（開くたびにここへ戻す）。
const ALL_ACHIEVEMENTS_TOGGLE_CLOSED_TEXT = "すべての称号を見る ＞";
const ALL_ACHIEVEMENTS_TOGGLE_OPEN_TEXT = "すべての称号を隠す";

// 【2026-10-29追加・本人の希望】「データ：音源 ○／84・歌詞 ○／83・コール ○曲」（数だけ。曲名は持っていない）
function renderDetailDataStatus(profile) {
  const textElement = document.getElementById("fan-profile-detail-data-status-text");
  const detailElement = document.getElementById("fan-profile-detail-data-status-detail");
  if (!textElement) return;
  const { text, detail, hasRecord } = describeSharedDataStatus(profile.dataStatus ?? null);
  textElement.textContent = text;
  textElement.classList.toggle("is-empty", !hasRecord);
  if (detailElement) {
    detailElement.textContent = detail;
    detailElement.hidden = !detail;
  }
}

function openDetailModal(profile) {
  elements.detailName.textContent = profile.displayName;
  const oshiMember = profile.oshiMemberId ? getMemberById(members, profile.oshiMemberId) : null;
  elements.detailOshi.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  elements.detailSwatch.innerHTML = "";
  elements.detailSwatch.appendChild(
    buildOshiSwatch(members, profile.oshiMemberId, {
      hasNoMissMaster: profile.hasNoMissMaster,
      hasEqualLoveMaster: profile.hasEqualLoveMaster,
      hasEqualLoveComplete: profile.hasEqualLoveComplete,
    })
  );

  // 【2026-08-29再設計・本人指示】ランキング順位は載せず、称号の総数・代表称号（最大3個）に
  // 特化する。総数は代表表示の絞り込み（getRepresentativeAchievementCandidates）とは別に、
  // unlockedAchievementIdsをそのまま数えるため、代表表示から省略された下位称号も含まれる。
  renderDetailDataStatus(profile);
  elements.detailAchievementCount.textContent = buildAchievementCountText(profile.unlockedAchievementIds);
  elements.detailSummary.innerHTML = "";
  elements.detailSummary.appendChild(buildFriendAchievementSummary(profile.unlockedAchievementIds));

  // 「すべての称号を見る」：中身は毎回組み立て直すが、開閉状態は毎回「閉じている」から
  // 始める（前に開いていたフレンドの状態を持ち越さない）。称号を1つも持っていない人には
  // 導線ごと出さない（本人指示：「他人のプロフィールに未獲得称号を大量に並べる必要はない」）。
  elements.detailAchievementList.innerHTML = "";
  elements.detailAchievementList.appendChild(buildAchievedAchievementsList(profile.unlockedAchievementIds));
  elements.detailAchievementList.hidden = true;
  elements.detailAllToggle.hidden = profile.unlockedAchievementIds.length === 0;
  elements.detailAllToggle.textContent = ALL_ACHIEVEMENTS_TOGGLE_CLOSED_TEXT;

  elements.detailOverlay.hidden = false;
}

// 【2026-10-29追加】詳しい画面を、渡したプロフィール（normalizePublicProfileEntry の形）で開く。
// 画面の撮影・確認用（Firebase に繋がない確認では一覧が読めないため）。開き方は一覧のカードを押したときと同じ。
export function openFanProfileDetailForPreview(profile) {
  if (!elements || !profile) return;
  openDetailModal(profile);
}

function closeDetailModal() {
  elements.detailOverlay.hidden = true;
}

// 右上の「🏅称号一覧」（ゲーム全体の称号・条件を見る）とは別物：今開いているフレンド本人が
// 取得済みの称号を全部確認するための、モーダル内アコーディオン開閉。
function handleDetailAllToggleClick() {
  playSfx(SFX_EVENTS.UI_CLICK);
  const willOpen = elements.detailAchievementList.hidden;
  elements.detailAchievementList.hidden = !willOpen;
  elements.detailAllToggle.textContent = willOpen
    ? ALL_ACHIEVEMENTS_TOGGLE_OPEN_TEXT
    : ALL_ACHIEVEMENTS_TOGGLE_CLOSED_TEXT;
}

function handleDetailOverlayClick(event) {
  if (event.target !== elements.detailOverlay) return;
  playSfx(SFX_EVENTS.UI_BACK);
  closeDetailModal();
}

function handleDetailKeydown(event) {
  if (event.key !== "Escape") return;
  if (elements.detailOverlay.hidden) return;
  playSfx(SFX_EVENTS.UI_BACK);
  closeDetailModal();
}

// ---- 管理者限定：公開プロフィール削除の確認モーダル（2026-08-16追加） ----
// buildProfileCard()のonAdminDeleteRequestから、対象profileを引数に呼ばれる。
// 【2026-10-29変更】名前だけでなく、ID（全体）・区分・推し・称号の数を出して、同じ名前の別人を取り違えないようにする。
// 今の自分自身は消せない（確定ボタンを押せなくする）。
function openAdminDeleteConfirm(profile) {
  const nameKey = normalizeDisplayNameForCompare(profile.displayName);
  const sameNameCount = latestProfiles.filter((p) => normalizeDisplayNameForCompare(p.displayName) === nameKey).length;
  const oshi = profile.oshiMemberId ? getMemberById(members, profile.oshiMemberId) : null;
  const target = describeAdminDeleteTarget(profile, { myUid, myKnownOldUids: getMyKnownOldUids(), sameNameCount, oshiName: oshi?.name ?? null });
  pendingAdminDeleteProfile = target.allowed ? profile : null;
  elements.adminDeleteTargetName.textContent = profile.displayName;
  renderAdminDeleteTargetDetails(target);
  elements.adminDeleteConfirmButton.disabled = !target.allowed;
  elements.adminDeleteOverlay.hidden = false;
}

// 削除確認の中に「対象の見分け方」の一覧を出す（index.html を増やさず、名前の段落の後ろに1つだけ作る）
let adminDeleteDetailsElement = null;
function renderAdminDeleteTargetDetails(target) {
  if (!adminDeleteDetailsElement) {
    adminDeleteDetailsElement = document.createElement("ul");
    adminDeleteDetailsElement.className = "modal-category-list fan-profiles-admin-delete-details";
    elements.adminDeleteTargetName.closest("p")?.after(adminDeleteDetailsElement);
  }
  adminDeleteDetailsElement.innerHTML = "";
  [...target.lines, ...(target.reason ? [`⚠️ ${target.reason}`] : [])].forEach((line) => {
    const item = document.createElement("li");
    item.textContent = line;
    adminDeleteDetailsElement.appendChild(item);
  });
}

function closeAdminDeleteConfirm() {
  pendingAdminDeleteProfile = null;
  elements.adminDeleteConfirmButton.disabled = false;
  elements.adminDeleteOverlay.hidden = true;
}

function handleAdminDeleteOverlayClick(event) {
  if (event.target !== elements.adminDeleteOverlay) return;
  playSfx(SFX_EVENTS.UI_BACK);
  closeAdminDeleteConfirm();
}

function handleAdminDeleteKeydown(event) {
  if (event.key !== "Escape") return;
  if (elements.adminDeleteOverlay.hidden) return;
  playSfx(SFX_EVENTS.UI_BACK);
  closeAdminDeleteConfirm();
}

// 「削除する」確定時。UIDが変わっていないか（万一の二重クリック等）を都度再確認したうえで
// 削除し、削除後は一覧を再読み込みする。失敗してもローカルデータには一切影響しない。
async function handleAdminDeleteConfirmClick() {
  if (!isAdminUser || !pendingAdminDeleteProfile) return;
  // 念のため確定の瞬間にも「今の自分ではない」ことを確かめる（確認を開いた後にIDが変わった場合など）
  if (pendingAdminDeleteProfile.uid === myUid) return;
  playSfx(SFX_EVENTS.UI_CONFIRM);
  const targetUid = pendingAdminDeleteProfile.uid;
  elements.adminDeleteConfirmButton.disabled = true;
  try {
    await deletePublicProfileByAdmin(targetUid);
  } catch (error) {
    console.warn("管理者による公開プロフィール削除に失敗しました", error);
  } finally {
    elements.adminDeleteConfirmButton.disabled = false;
    closeAdminDeleteConfirm();
    renderProfileList();
  }
}

// みんなのプロフィール画面を開くたびに呼ぶ想定（js/screens.jsのshowScreen("fanProfiles")と
// 合わせてmain.js側から呼ぶ）。設定の最新状態の反映と、一覧の再取得を行う。
// 【2026-08-16更新】管理者判定（自分のUID確認）を一覧の再取得より先に済ませてから
// 一覧を描画する（管理者用の削除ボタンをカード生成時点で正しく反映するため）。
export async function renderFanProfilesScreen() {
  renderSharingSettings();
  await renderMyUidAndAdminState();
  renderUidMergeCard();
  renderProfileList();
  startPresenceSubscriptionIfNeeded();
}

// ---- 【2026-09-15新設】旧IDからの引き継ぎ案内（js/uidSupersession.js） ----
// 自動バックアップがUIDの変化を検知して「確認待ち」を残しているときだけカードを出す。
// 「内容を確認する」→ 計画（読み取りのみ）を箇条書きで表示 →「引き継いで整理する」→ 実行。
let currentUidMergePlan = null;
// 詳細情報の折りたたみを、管理者向けに初回だけ開く（本人が閉じた後に勝手に開き直さない）
let detailsInitialized = false;

function renderUidMergeCard() {
  if (!elements.uidMergeCard) return;
  const pending = hasPendingUidMerge();
  elements.uidMergeCard.hidden = !pending;
  if (!pending) {
    currentUidMergePlan = null;
    if (elements.uidMergePlanList) elements.uidMergePlanList.hidden = true;
    if (elements.uidMergeExecuteButton) elements.uidMergeExecuteButton.hidden = true;
    if (elements.uidMergeStatus) elements.uidMergeStatus.hidden = true;
  }
}

function setUidMergeStatus(text) {
  if (!elements.uidMergeStatus) return;
  elements.uidMergeStatus.textContent = text;
  elements.uidMergeStatus.hidden = !text;
}

async function handleUidMergePlanClick() {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.uidMergePlanButton.disabled = true;
  setUidMergeStatus("確認しています…");
  try {
    const plan = await planUidMerge();
    if (!plan.ok) {
      // 【2026-10-23】起動時の自動引き継ぎで既に片付いていた（＝確認待ちが無くなった）場合は、
      // 「必要な記録はありません」と言いながら大きなカードが残り続けないよう、カード自体を閉じる。
      if (!hasPendingUidMerge()) {
        renderUidMergeCard();
        return;
      }
      setUidMergeStatus(plan.reason);
      return;
    }
    currentUidMergePlan = plan;
    const lines = describeUidMergePlan(plan);
    elements.uidMergePlanList.innerHTML = "";
    (lines.length ? lines : ["整理が必要な記録はありません（このまま「引き継いで整理する」で案内を閉じられます）"]).forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      elements.uidMergePlanList.appendChild(item);
    });
    elements.uidMergePlanList.hidden = false;
    elements.uidMergeExecuteButton.hidden = false;
    setUidMergeStatus("");
  } finally {
    elements.uidMergePlanButton.disabled = false;
  }
}

async function handleUidMergeExecuteClick() {
  if (!currentUidMergePlan) return;
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.uidMergeExecuteButton.disabled = true;
  setUidMergeStatus("引き継いでいます…");
  try {
    const result = await executeUidMerge(currentUidMergePlan);
    if (!result.ok) {
      setUidMergeStatus(result.reason ?? `一部を整理できませんでした：${result.errors.join(" / ")}`);
      return;
    }
    setUidMergeStatus(`引き継ぎが完了しました（ランキング引き継ぎ ${result.copied}件・重複整理 ${result.deletedOld}件）`);
    currentUidMergePlan = null;
    renderUidMergeCard();
    renderProfileList();
  } finally {
    elements.uidMergeExecuteButton.disabled = false;
  }
}

// 【2026-11-XX新設・本人指示：フレンドのオンライン状態】この画面を開いている間だけ
// presence/を購読し、離れたら止める（js/screens.jsのonScreenChangeを使い、
// 「フレンド画面以外へ切り替わった瞬間」を検知する。既存のshowScreen()自体の動きは
// 一切変更しない、末尾への通知フックへ乗るだけの追加）。
// 【2026-10-11新設・本人指示】「オンライン状態の送信」診断の表示を更新する（表示専用）。
function renderPresenceDiagnostics() {
  if (!elements?.presenceDiag) return;
  const { verdict, tone, detail } = describePresenceDiagnostics();
  elements.presenceDiag.hidden = false;
  elements.presenceDiag.dataset.tone = tone;
  if (elements.presenceDiagVerdict) elements.presenceDiagVerdict.textContent = `📡 オンライン状態の送信：${verdict}`;
  if (elements.presenceDiagDetail) elements.presenceDiagDetail.textContent = detail;
}

let presenceDiagTimerId = null;

function startPresenceSubscriptionIfNeeded() {
  if (unsubscribePresence) return;
  unsubscribePresence = subscribeToAllPresence((presenceByUid) => {
    latestPresenceByUid = presenceByUid;
    renderProfileListFromCache();
    renderPresenceDiagnostics();
  });
  // 画面を開いている間だけ、診断表示を2秒ごとに更新する（Firebaseには何も書かない・読まない）
  renderPresenceDiagnostics();
  presenceDiagTimerId = setInterval(() => {
    renderPresenceDiagnostics();
    // 【2026-10-23】起動直後の自動引き継ぎで確認待ちが消えたら、引き継ぎ案内カードも自動で閉じる
    // （計画を立てている途中・提示中は触らない）
    if (!currentUidMergePlan && !hasPendingUidMerge()) renderUidMergeCard();
  }, 2000);
}

function stopPresenceSubscription() {
  if (unsubscribePresence) {
    unsubscribePresence();
    unsubscribePresence = null;
  }
  if (presenceDiagTimerId !== null) {
    clearInterval(presenceDiagTimerId);
    presenceDiagTimerId = null;
  }
}

onScreenChange((screenName) => {
  if (screenName !== "fanProfiles") stopPresenceSubscription();
});

// elements: {
//   sharingToggleButton, sharingToggleLabel: 公開ON/OFFトグル,
//   rankingSyncStatus: OFF→ON切替時のランキング後追い同期状況（2026-08-16新設）,
//   listContainer: プロフィールカードを並べる入れ物,
//   detailOverlay, detailCloseButton, detailSwatch, detailName, detailOshi,
//   detailTitleListLink: 個人プロフィール内の「🏅称号一覧」（2026-08-29追加）。
//     ゲーム全体の称号一覧モーダルを開く実際の処理はjs/achievementList.js側
//     （openTriggers）が担当するため、ここではその直前にこのモーダル自身を閉じるだけ
//     （フレンド詳細モーダルの上に称号一覧モーダルが重なって残るのを防ぐ）,
//   detailAchievementCount: 「🏅獲得称号◯個」（2026-08-29新設）,
//   detailSummary: ランク感＋代表称号の入れ物（2026-08-29新設）,
//   detailAllToggle, detailAchievementList: 「すべての称号を見る」の開閉ボタンと中身
//     （2026-08-29再設計、代表表示には出ない称号もここでは確認できる）,
//   myUidValue: 「🆔 あなたのID」表示,
//   adminDeleteOverlay, adminDeleteTargetName, adminDeleteCancelButton, adminDeleteConfirmButton:
//     管理者限定の削除確認モーダル,
// }
// 【2026-08-29改訂・本人指示】フレンドページ自体のヘッダーにも同じ役割の「🏅称号一覧」
// ボタンがある（js/main.jsのfanProfilesTitleListLinkElement、initAchievementListModalの
// openTriggers参照）。どちらも既存の称号一覧モーダルをそのまま開くだけで、専用の開閉
// ロジックはjs/achievementList.js側にしか無い。
export function initFanProfilesScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;

  elements.sharingToggleButton.addEventListener("click", handleSharingToggleClick);
  // 【2026-08-29追加・本人指示（実機バグ報告）】フレンド詳細モーダルを開いたまま右上の
  // 「🏅称号一覧」を押すと、称号一覧モーダルが後ろのフレンド詳細モーダルに重なって
  // 表示され、×を2回押さないと元のフレンド一覧へ戻れない不具合があった。称号一覧を
  // 開く直前にこのモーダル自身を閉じることで、常に1枚だけが表示された自然な切り替えにする
  // （称号一覧モーダルを開く処理自体はjs/achievementList.jsのopenTriggersが別途行う。
  // 同じクリックで両方のリスナーが実行され、最終的に「フレンド詳細は閉・称号一覧は開」の
  // 状態に収束する）。
  if (elements.detailTitleListLink) {
    elements.detailTitleListLink.addEventListener("click", closeDetailModal);
  }
  elements.detailCloseButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeDetailModal();
  });
  elements.detailAllToggle.addEventListener("click", handleDetailAllToggleClick);
  elements.detailOverlay.addEventListener("click", handleDetailOverlayClick);
  document.addEventListener("keydown", handleDetailKeydown);

  if (elements.uidMergePlanButton) elements.uidMergePlanButton.addEventListener("click", handleUidMergePlanClick);
  if (elements.uidMergeExecuteButton) elements.uidMergeExecuteButton.addEventListener("click", handleUidMergeExecuteClick);

  elements.adminDeleteCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeAdminDeleteConfirm();
  });
  elements.adminDeleteConfirmButton.addEventListener("click", handleAdminDeleteConfirmClick);
  elements.adminDeleteOverlay.addEventListener("click", handleAdminDeleteOverlayClick);
  document.addEventListener("keydown", handleAdminDeleteKeydown);
}
