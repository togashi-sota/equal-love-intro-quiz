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
} from "./publicProfileSync.js";
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

function renderEmptyState(kind) {
  elements.listContainer.innerHTML = "";
  const message = document.createElement("p");
  message.className = "fan-profiles-empty";
  if (kind === "no-profiles") {
    message.textContent = "まだ他のファンはいません。プロフィール公開をONにすると、ここに表示されます。";
  } else {
    message.textContent = "プレイヤー広場を読み込めませんでした。電波の良い場所でもう一度開いてみてください。";
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
    elements.listContainer.appendChild(buildProfileCard(profile, members, openDetailModal))
  );
}

// 設定カード（「みんなに公開する」トグル）を、今の公開設定に合わせて描画する。
function renderSharingSettings() {
  const playerKeyPrefix = getPlayerKeyPrefix();
  const enabled = isPublicProfileSharingEnabled(playerKeyPrefix);
  elements.sharingToggleButton.classList.toggle("is-on", enabled);
  elements.sharingToggleButton.setAttribute("aria-pressed", String(enabled));
  elements.sharingToggleLabel.textContent = enabled ? "ON" : "OFF";
}

function handleSharingToggleClick() {
  const playerKeyPrefix = getPlayerKeyPrefix();
  const nextEnabled = !isPublicProfileSharingEnabled(playerKeyPrefix);
  setPublicProfileSharingEnabled(playerKeyPrefix, nextEnabled);
  renderSharingSettings();
  // 公開ON/OFFの直後は、自分の表示が一覧へ反映されたかどうかも合わせて確認できるよう再読込する。
  renderProfileList();
}

function openDetailModal(profile) {
  elements.detailName.textContent = profile.displayName;
  const oshiMember = profile.oshiMemberId ? getMemberById(members, profile.oshiMemberId) : null;
  elements.detailOshi.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  elements.detailSwatch.innerHTML = "";
  elements.detailSwatch.appendChild(
    buildOshiSwatch(members, profile.oshiMemberId, {
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

function handleDetailOverlayClick(event) {
  if (event.target !== elements.detailOverlay) return;
  closeDetailModal();
}

function handleDetailKeydown(event) {
  if (event.key !== "Escape") return;
  if (elements.detailOverlay.hidden) return;
  closeDetailModal();
}

// みんなのプロフィール画面を開くたびに呼ぶ想定（js/screens.jsのshowScreen("fanProfiles")と
// 合わせてmain.js側から呼ぶ）。設定の最新状態の反映と、一覧の再取得を行う。
export function renderFanProfilesScreen() {
  renderSharingSettings();
  renderProfileList();
}

// elements: {
//   sharingToggleButton, sharingToggleLabel: 公開ON/OFFトグル,
//   listContainer: プロフィールカードを並べる入れ物,
//   detailOverlay, detailCloseButton, detailSwatch, detailName, detailOshi, detailAchievementList,
// }
export function initFanProfilesScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;

  elements.sharingToggleButton.addEventListener("click", handleSharingToggleClick);
  elements.detailCloseButton.addEventListener("click", closeDetailModal);
  elements.detailOverlay.addEventListener("click", handleDetailOverlayClick);
  document.addEventListener("keydown", handleDetailKeydown);
}
