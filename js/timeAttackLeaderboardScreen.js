// タイムアタックのグローバルランキング（TOP10）画面を担当するファイル。
// データの取得・比較・並び替えはjs/timeAttackLeaderboardSync.js・js/timeAttackLeaderboard.jsに
// 任せ、このファイルは「取得した結果をどう画面に組み立てるか」だけに専念する。
//
// 【UI統一方針、本人指示】推しアイコン・王冠/ダイヤ装飾は、js/fanProfileCard.jsの
// buildOshiSwatch()をそのまま再利用する（みんなのプロフィール一覧・メンバーカードと
// 同じ見た目・同じ関数にすることで、3種類バラバラの実装にしない）。
import { buildOshiSwatch } from "./fanProfileCard.js";
import { getMemberById } from "./memberUtils.js";
import {
  fetchTimeAttackLeaderboardTop10,
  fetchMyTimeAttackLeaderboardEntry,
  deleteLeaderboardEntryByAdmin,
} from "./timeAttackLeaderboardSync.js";
import { fetchPublicProfileBadgeState, getMyUid } from "./publicProfileSync.js";
import { ADMIN_UID } from "./adminConfig.js";
import { TIME_ATTACK_VARIANT, TIME_ATTACK_RULE } from "./timeAttackScreen.js";

const VARIANT_LABELS = { [TIME_ATTACK_VARIANT.INTRO]: "🎧イントロ", [TIME_ATTACK_VARIANT.RANDOM_PLAYBACK]: "🔀ランダム再生" };
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全曲" };
const QUESTION_COUNT_ORDER = ["5", "10", "20", "50", "all"];

// 【2026-08-16追加】ルール・カテゴリー別のタブ。ラベルはjs/main.jsのRULE_LABELS・
// CATEGORY_LABELSと表記を揃える（同じ概念に別の呼び方をしない）。
const RULE_LABELS = {
  [TIME_ATTACK_RULE.NORMAL]: "ノーマル",
  [TIME_ATTACK_RULE.HARD]: "ハード",
  [TIME_ATTACK_RULE.LOVE_CHAIN]: "LOVE連チャン",
};
const RULE_ORDER = [TIME_ATTACK_RULE.NORMAL, TIME_ATTACK_RULE.HARD, TIME_ATTACK_RULE.LOVE_CHAIN];

const CATEGORY_LABELS = { "title-track": "表題のみ", "title-and-group": "表題＋全員", all: "全曲" };
const CATEGORY_ORDER = ["title-track", "title-and-group", "all"];

let elements = null;
let members = [];
let currentVariant = TIME_ATTACK_VARIANT.INTRO;
let currentRule = TIME_ATTACK_RULE.LOVE_CHAIN;
let currentQuestionCountValue = "5";
let currentCategoryFilterValue = "all";
// 連打・タブ切り替え中の描画競合を防ぐための世代番号（js/audio.jsのcurrentPlaybackTokenと
// 同じ考え方）。古い非同期取得が後から戻ってきても、世代が古ければ描画結果を捨てる。
let renderToken = 0;
// 2026-08-17追加：この端末が管理者（js/adminConfig.jsのADMIN_UID）かどうか。
// ADMIN_UIDがnullの間は誰であってもfalseになり、削除ボタンは一切表示されない。
let isAdminUser = false;
// 削除確認モーダルで「削除する」が押されたときに対象を特定するための一時保持。
let pendingAdminDeleteEntry = null;

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

function buildRankBadge(rank) {
  const badge = document.createElement("span");
  badge.className = "leaderboard-rank-badge";
  if (rank === 1) badge.classList.add("is-gold");
  else if (rank === 2) badge.classList.add("is-silver");
  else if (rank === 3) badge.classList.add("is-bronze");
  badge.textContent = String(rank);
  return badge;
}

// isAdmin/onAdminDeleteRequestは2026-08-17追加。isAdminがtrueのときだけ、行の右端に
// 管理者専用の削除ボタンを追加する（一般ユーザーには絶対に見えない導線。
// js/fanProfileCard.jsのbuildProfileCardと同じ考え方だが、この行はbutton要素ではなく
// div要素のため、button-in-buttonの制約なく直接子要素として追加できる）。
function buildLeaderboardRow(entry, rank, badgeState, isOwnRow, { isAdmin = false, onAdminDeleteRequest = null } = {}) {
  const row = document.createElement("div");
  row.className = "leaderboard-row";
  row.classList.toggle("is-own-row", isOwnRow);

  row.appendChild(buildRankBadge(rank));
  row.appendChild(buildOshiSwatch(members, entry.oshiMemberId, badgeState));

  const body = document.createElement("div");
  body.className = "leaderboard-row-body";

  const name = document.createElement("p");
  name.className = "leaderboard-row-name";
  name.textContent = entry.displayName;
  body.appendChild(name);

  const oshiMember = entry.oshiMemberId ? getMemberById(members, entry.oshiMemberId) : null;
  const oshi = document.createElement("p");
  oshi.className = "leaderboard-row-oshi";
  oshi.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  body.appendChild(oshi);

  row.appendChild(body);

  const time = document.createElement("p");
  time.className = "leaderboard-row-time";
  time.textContent = `${formatSeconds(entry.clearTimeMs)}秒`;
  row.appendChild(time);

  if (isAdmin) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "leaderboard-admin-delete-button";
    deleteButton.setAttribute("aria-label", `${entry.displayName}さんの記録を削除（管理者用）`);
    deleteButton.textContent = "🗑️";
    deleteButton.addEventListener("click", () => onAdminDeleteRequest?.(entry));
    row.appendChild(deleteButton);
  }

  return row;
}

function buildTabButton(label, isActive, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "leaderboard-tab-button";
  button.classList.toggle("is-active", isActive);
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderTabs() {
  elements.variantTabs.innerHTML = "";
  Object.values(TIME_ATTACK_VARIANT).forEach((variant) => {
    elements.variantTabs.appendChild(
      buildTabButton(VARIANT_LABELS[variant], variant === currentVariant, () => {
        currentVariant = variant;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  // 【2026-08-16追加】ルールタブ。
  elements.ruleTabs.innerHTML = "";
  RULE_ORDER.forEach((rule) => {
    elements.ruleTabs.appendChild(
      buildTabButton(RULE_LABELS[rule], rule === currentRule, () => {
        currentRule = rule;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  elements.questionCountTabs.innerHTML = "";
  QUESTION_COUNT_ORDER.forEach((questionCountValue) => {
    elements.questionCountTabs.appendChild(
      buildTabButton(QUESTION_COUNT_LABELS[questionCountValue], questionCountValue === currentQuestionCountValue, () => {
        currentQuestionCountValue = questionCountValue;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  // 【2026-08-16追加】カテゴリータブ。
  elements.categoryTabs.innerHTML = "";
  CATEGORY_ORDER.forEach((categoryFilterValue) => {
    elements.categoryTabs.appendChild(
      buildTabButton(CATEGORY_LABELS[categoryFilterValue], categoryFilterValue === currentCategoryFilterValue, () => {
        currentCategoryFilterValue = categoryFilterValue;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });
}

function setStateVisibility({ loading, offline, empty, list }) {
  elements.loadingState.hidden = !loading;
  elements.offlineState.hidden = !offline;
  elements.emptyState.hidden = !empty;
  elements.listContainer.hidden = !list;
}

// TOP10各行の王冠・ダイヤ装飾を、みんなのプロフィールと同じ見た目で添える（可能なら、の対応）。
// 本人指示「全ユーザー件数を毎回取得しないこと」を守るため、今回表示する最大10人分だけを
// 並行して個別取得する（全件ダウンロードにはしない）。1件でも失敗しても他の行の表示は続ける。
async function fetchBadgeStatesForEntries(entries) {
  const results = await Promise.all(
    entries.map((entry) =>
      fetchPublicProfileBadgeState(entry.uid).catch(() => ({
        hasNoMissMaster: false,
        hasEqualLoveMaster: false,
        hasEqualLoveComplete: false,
      }))
    )
  );
  const badgeStateByUid = new Map();
  entries.forEach((entry, index) => badgeStateByUid.set(entry.uid, results[index]));
  return badgeStateByUid;
}

async function loadAndRenderLeaderboard() {
  const myRenderToken = ++renderToken;
  setStateVisibility({ loading: true, offline: false, empty: false, list: false });
  elements.myRecordSection.hidden = true;

  const result = await fetchTimeAttackLeaderboardTop10(
    currentVariant,
    currentRule,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  if (myRenderToken !== renderToken) return; // タブが切り替わった後に古い結果が戻ってきた場合は捨てる

  if (!result.ok) {
    setStateVisibility({ loading: false, offline: true, empty: false, list: false });
    return;
  }

  if (result.entries.length === 0) {
    setStateVisibility({ loading: false, offline: false, empty: true, list: false });
    renderMyRecordIfNeeded(myRenderToken, []);
    return;
  }

  const badgeStateByUid = await fetchBadgeStatesForEntries(result.entries);
  if (myRenderToken !== renderToken) return;

  elements.listContainer.innerHTML = "";
  result.entries.forEach((entry, index) => {
    const rank = index + 1;
    const isOwnRow = elements.currentUid && entry.uid === elements.currentUid;
    elements.listContainer.appendChild(
      buildLeaderboardRow(entry, rank, badgeStateByUid.get(entry.uid), isOwnRow, {
        isAdmin: isAdminUser,
        onAdminDeleteRequest: openAdminDeleteConfirm,
      })
    );
  });
  setStateVisibility({ loading: false, offline: false, empty: false, list: true });

  renderMyRecordIfNeeded(myRenderToken, result.entries);
}

// 「あなたの記録」：TOP10にすでに含まれていれば重ねて表示しない。含まれていなければ、
// 自分のuidの記録だけを軽量に取得して「あなたのベスト ○○秒」の形で表示する
// （本人指示：「順位計算が重い場合は、あなたのベストだけでも可」）。
async function renderMyRecordIfNeeded(myRenderToken, top10Entries) {
  const alreadyInTop10 = elements.currentUid && top10Entries.some((entry) => entry.uid === elements.currentUid);
  if (alreadyInTop10) {
    elements.myRecordSection.hidden = true;
    return;
  }

  const myResult = await fetchMyTimeAttackLeaderboardEntry(
    currentVariant,
    currentRule,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  if (myRenderToken !== renderToken) return;
  elements.currentUid = myResult.uid ?? elements.currentUid;

  if (!myResult.ok || !myResult.entry) {
    elements.myRecordSection.hidden = true;
    return;
  }

  elements.myRecordText.textContent = `あなたのベスト：${formatSeconds(myResult.entry.clearTimeMs)}秒`;
  elements.myRecordSection.hidden = false;
}

// 自分のUIDを確認し、管理者判定を更新する（2026-08-17追加）。
// ADMIN_UIDがnullの間は誰であってもfalseのままになり、削除ボタンは一切表示されない。
async function refreshAdminState() {
  const uid = await getMyUid();
  isAdminUser = ADMIN_UID !== null && uid !== null && uid === ADMIN_UID;
}

// ---- 管理者限定：ランキング記録削除の確認モーダル（2026-08-17追加） ----
// buildLeaderboardRow()のonAdminDeleteRequestから、対象entryを引数に呼ばれる。
function openAdminDeleteConfirm(entry) {
  pendingAdminDeleteEntry = entry;
  elements.adminDeleteName.textContent = entry.displayName;
  elements.adminDeleteTime.textContent = `${formatSeconds(entry.clearTimeMs)}秒`;
  elements.adminDeleteVariant.textContent = VARIANT_LABELS[currentVariant] ?? currentVariant;
  elements.adminDeleteRule.textContent = RULE_LABELS[currentRule] ?? currentRule;
  elements.adminDeleteQuestionCount.textContent = QUESTION_COUNT_LABELS[currentQuestionCountValue] ?? currentQuestionCountValue;
  elements.adminDeleteCategory.textContent = CATEGORY_LABELS[currentCategoryFilterValue] ?? currentCategoryFilterValue;
  elements.adminDeleteOverlay.hidden = false;
}

function closeAdminDeleteConfirm() {
  pendingAdminDeleteEntry = null;
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

// 「削除する」確定時。表示中のタブ状態（variant/rule/questionCount/category）と
// 対象entryのuidから、一意な1件だけを削除する。削除後は一覧を再読み込みする。
async function handleAdminDeleteConfirmClick() {
  if (!isAdminUser || !pendingAdminDeleteEntry) return;
  const targetUid = pendingAdminDeleteEntry.uid;
  elements.adminDeleteConfirmButton.disabled = true;
  try {
    await deleteLeaderboardEntryByAdmin(
      currentVariant,
      currentRule,
      currentQuestionCountValue,
      currentCategoryFilterValue,
      targetUid
    );
  } catch (error) {
    console.warn("管理者によるランキング記録削除に失敗しました", error);
  } finally {
    elements.adminDeleteConfirmButton.disabled = false;
    closeAdminDeleteConfirm();
    loadAndRenderLeaderboard();
  }
}

// タイムアタック設定画面・結果画面から呼ぶ入口。直前にプレイした条件を最初に表示する
// （本人指示：「直前にプレイした条件のランキングを最初に表示」）。
// 【2026-08-16追加】rule・categoryFilterValueにも対応。未指定・不正な値は安全な既定値
// （LOVE連チャン・全曲）にフォールバックする。
// 【2026-08-17更新】管理者判定を、タブ描画・一覧読み込みより先に済ませる
// （削除ボタンをカード生成時点で正しく反映するため。js/fanProfilesScreen.jsと同じ順序）。
export async function showTimeAttackLeaderboard(variant, rule, questionCountValue, categoryFilterValue) {
  currentVariant = variant ?? TIME_ATTACK_VARIANT.INTRO;
  currentRule = RULE_ORDER.includes(rule) ? rule : TIME_ATTACK_RULE.LOVE_CHAIN;
  currentQuestionCountValue = QUESTION_COUNT_ORDER.includes(questionCountValue) ? questionCountValue : "5";
  currentCategoryFilterValue = CATEGORY_ORDER.includes(categoryFilterValue) ? categoryFilterValue : "all";
  await refreshAdminState();
  renderTabs();
  loadAndRenderLeaderboard();
}

// elements: {
//   variantTabs, ruleTabs, questionCountTabs, categoryTabs: タブボタンを並べるコンテナ,
//   loadingState, offlineState, emptyState: 状態ごとの案内文,
//   listContainer: TOP10の行を並べる場所,
//   myRecordSection, myRecordText: 「あなたの記録」欄,
//   backButton, onBack,
//   adminDeleteOverlay, adminDeleteName, adminDeleteTime, adminDeleteVariant, adminDeleteRule,
//   adminDeleteQuestionCount, adminDeleteCategory, adminDeleteCancelButton, adminDeleteConfirmButton:
//     管理者限定の記録削除確認モーダル（2026-08-17追加）,
// }
export function initTimeAttackLeaderboardScreen(newElements, membersList) {
  elements = { ...newElements, currentUid: null };
  members = membersList;
  elements.backButton.addEventListener("click", () => elements.onBack?.());

  elements.adminDeleteCancelButton.addEventListener("click", closeAdminDeleteConfirm);
  elements.adminDeleteConfirmButton.addEventListener("click", handleAdminDeleteConfirmClick);
  elements.adminDeleteOverlay.addEventListener("click", handleAdminDeleteOverlayClick);
  document.addEventListener("keydown", handleAdminDeleteKeydown);
}
