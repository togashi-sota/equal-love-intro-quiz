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
  buildAchievementCountText,
  buildFriendAchievementSummary,
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

// 「すべての称号を見る」の初期表示文言（開くたびにここへ戻す）。
const ALL_ACHIEVEMENTS_TOGGLE_CLOSED_TEXT = "すべての称号を見る ＞";
const ALL_ACHIEVEMENTS_TOGGLE_OPEN_TEXT = "すべての称号を隠す";

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

function closeDetailModal() {
  elements.detailOverlay.hidden = true;
}

// 右上の「🏅称号一覧」（ゲーム全体の称号・条件を見る）とは別物：今開いているフレンド本人が
// 取得済みの称号を全部確認するための、モーダル内アコーディオン開閉。
function handleDetailAllToggleClick() {
  const willOpen = elements.detailAchievementList.hidden;
  elements.detailAchievementList.hidden = !willOpen;
  elements.detailAllToggle.textContent = willOpen
    ? ALL_ACHIEVEMENTS_TOGGLE_OPEN_TEXT
    : ALL_ACHIEVEMENTS_TOGGLE_CLOSED_TEXT;
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
  elements.detailCloseButton.addEventListener("click", closeDetailModal);
  elements.detailAllToggle.addEventListener("click", handleDetailAllToggleClick);
  elements.detailOverlay.addEventListener("click", handleDetailOverlayClick);
  document.addEventListener("keydown", handleDetailKeydown);

  elements.adminDeleteCancelButton.addEventListener("click", closeAdminDeleteConfirm);
  elements.adminDeleteConfirmButton.addEventListener("click", handleAdminDeleteConfirmClick);
  elements.adminDeleteOverlay.addEventListener("click", handleAdminDeleteOverlayClick);
  document.addEventListener("keydown", handleAdminDeleteKeydown);
}
