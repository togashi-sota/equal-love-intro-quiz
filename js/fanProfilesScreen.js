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
import { ADMIN_UID } from "./adminConfig.js";
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { getMemberById } from "./memberUtils.js";
import {
  buildProfileCard,
  buildOshiSwatch,
  buildAchievedAchievementsList,
  sortProfiles,
} from "./fanProfileCard.js";

let elements = null;
let members = null;
// 2026-08-16追加：この端末が管理者（js/adminConfig.jsのADMIN_UID）かどうか。
// ADMIN_UIDがnullの間は誰であってもfalseになり、管理者用UIは一切表示されない。
let isAdminUser = false;
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

async function renderProfileList() {
  renderLoadingState();
  const { ok, profiles } = await fetchAllPublicProfiles();
  if (!ok) {
    renderEmptyState("fetch-failed");
    return;
  }
  if (profiles.length === 0) {
    renderEmptyState("no-profiles");
    return;
  }
  elements.listContainer.innerHTML = "";
  sortProfiles(profiles).forEach((profile) =>
    elements.listContainer.appendChild(
      buildProfileCard(profile, members, openDetailModal, {
        isAdmin: isAdminUser,
        onAdminDeleteRequest: openAdminDeleteConfirm,
      })
    )
  );
}

// 自分のUIDを取得し、「🆔 あなたのID」表示の更新と管理者判定を行う（2026-08-16追加）。
// 通信に失敗してUIDが取れない場合でも、isAdminUserはfalseのままになるだけで画面は壊れない。
async function renderMyUidAndAdminState() {
  const uid = await getMyUid();
  if (elements.myUidValue) {
    elements.myUidValue.textContent = uid ?? "取得できませんでした";
  }
  isAdminUser = ADMIN_UID !== null && uid !== null && uid === ADMIN_UID;
}

// 設定カード（「みんなに公開する」トグル）を、今の公開設定に合わせて描画する。
function renderSharingSettings() {
  const playerKeyPrefix = getPlayerKeyPrefix();
  const enabled = isPublicProfileSharingEnabled(playerKeyPrefix);
  elements.sharingToggleButton.classList.toggle("is-on", enabled);
  elements.sharingToggleButton.setAttribute("aria-pressed", String(enabled));
  elements.sharingToggleLabel.textContent = enabled ? "ON" : "OFF";
}

// 【2026-08-16追加、本人指示】OFF→ONへ切り替えた瞬間、OFF中でもランキング条件を満たして
// ローカルに貯まっていた自己ベスト（js/rankingCandidateStore.js）をまとめてFirebaseへ同期する。
// 比較・上書き判定は既存のsubmitTimeAttackScoreIfBetter()をそのまま再利用するため、ここでは
// 「いつ呼ぶか」と「結果をどう見せるか」だけを担当する（js/timeAttackLeaderboardSync.jsの
// syncRankingCandidatesToFirebase参照）。ON→OFFのときは呼ばない（同期する新しい記録が無いため）。
async function handleSharingToggleClick() {
  const playerKeyPrefix = getPlayerKeyPrefix();
  const nextEnabled = !isPublicProfileSharingEnabled(playerKeyPrefix);
  setPublicProfileSharingEnabled(playerKeyPrefix, nextEnabled);
  renderSharingSettings();
  // 公開ON/OFFの直後は、自分の表示が一覧へ反映されたかどうかも合わせて確認できるよう再読込する。
  renderProfileList();

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

  elements.detailAchievementList.innerHTML = "";
  elements.detailAchievementList.appendChild(buildAchievedAchievementsList(profile.unlockedAchievementIds));

  elements.detailOverlay.hidden = false;
}

function closeDetailModal() {
  elements.detailOverlay.hidden = true;
}

// 右上の「🏅称号一覧」ボタン（2026-08-29追加）。称号一覧自体は常にモーダル内へ
// 描画済みのため、新しい画面は作らず、その場所まで滑らかにスクロールするだけでよい。
function handleDetailTitlesLinkClick() {
  elements.detailAchievementList.scrollIntoView({ behavior: "smooth", block: "start" });
}

function handleDetailOverlayClick(event) {
  if (event.target !== elements.detailOverlay) return;
  closeDetailModal();
}

function handleDetailKeydown(event) {
  if (event.key !== "Escape") return;
  if (elements.detailOverlay.hidden) return;
  closeDetailModal();
}

// ---- 管理者限定：公開プロフィール削除の確認モーダル（2026-08-16追加） ----
// buildProfileCard()のonAdminDeleteRequestから、対象profileを引数に呼ばれる。
function openAdminDeleteConfirm(profile) {
  pendingAdminDeleteProfile = profile;
  elements.adminDeleteTargetName.textContent = profile.displayName;
  elements.adminDeleteOverlay.hidden = false;
}

function closeAdminDeleteConfirm() {
  pendingAdminDeleteProfile = null;
  elements.adminDeleteOverlay.hidden = true;
}

function handleAdminDeleteOverlayClick(event) {
  if (event.target !== elements.adminDeleteOverlay) return;
  closeAdminDeleteConfirm();
}

function handleAdminDeleteKeydown(event) {
  if (event.key !== "Escape") return;
  if (elements.adminDeleteOverlay.hidden) return;
  closeAdminDeleteConfirm();
}

// 「削除する」確定時。UIDが変わっていないか（万一の二重クリック等）を都度再確認したうえで
// 削除し、削除後は一覧を再読み込みする。失敗してもローカルデータには一切影響しない。
async function handleAdminDeleteConfirmClick() {
  if (!isAdminUser || !pendingAdminDeleteProfile) return;
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
  renderProfileList();
}

// elements: {
//   sharingToggleButton, sharingToggleLabel: 公開ON/OFFトグル,
//   rankingSyncStatus: OFF→ON切替時のランキング後追い同期状況（2026-08-16新設）,
//   listContainer: プロフィールカードを並べる入れ物,
//   detailOverlay, detailCloseButton, detailSwatch, detailName, detailOshi, detailAchievementList,
//   detailTitlesLink: 右上「🏅称号一覧」リンク（2026-08-29追加、称号一覧までスクロールする）,
//   myUidValue: 「🆔 あなたのID」表示,
//   adminDeleteOverlay, adminDeleteTargetName, adminDeleteCancelButton, adminDeleteConfirmButton:
//     管理者限定の削除確認モーダル,
// }
export function initFanProfilesScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;

  elements.sharingToggleButton.addEventListener("click", handleSharingToggleClick);
  elements.detailCloseButton.addEventListener("click", closeDetailModal);
  if (elements.detailTitlesLink) {
    elements.detailTitlesLink.addEventListener("click", handleDetailTitlesLinkClick);
  }
  elements.detailOverlay.addEventListener("click", handleDetailOverlayClick);
  document.addEventListener("keydown", handleDetailKeydown);

  elements.adminDeleteCancelButton.addEventListener("click", closeAdminDeleteConfirm);
  elements.adminDeleteConfirmButton.addEventListener("click", handleAdminDeleteConfirmClick);
  elements.adminDeleteOverlay.addEventListener("click", handleAdminDeleteOverlayClick);
  document.addEventListener("keydown", handleAdminDeleteKeydown);
}
