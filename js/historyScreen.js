// プレイ履歴画面を担当するファイル（2026-08-08：全モード共通のタイムラインへ刷新）。
//
// 【設計方針】履歴データの読み込み・集計・変換はjs/playHistory.js（データ層）に任せ、
// ここでは画面の組み立て（フィルターチップ・カード一覧・詳細モーダル・全削除の確認モーダル）
// だけを扱う。以前は通常イントロクイズだけの一覧＋別画面（history-detail-screen）の
// 詳細表示だったが、今回から全モード共通のタイムライン＋詳細モーダルに変わった
// （historyDetailScreen.js・history-detail-screenは、他から参照されなくなったが、
// 削除は必須ではないため残してある）。

import {
  getUnifiedPlayHistoryEntries,
  computeUnifiedHistorySummary,
  filterUnifiedPlayHistoryEntries,
  filterOnlineHistoryEntries,
  splitHistoryEntriesByOnlineStatus,
  describeEntrySummaryLines,
  describeEntryDetailFields,
  formatPlayedAt,
  clearNativePlayHistoryEntries,
  HISTORY_FILTER_ORDER,
  HISTORY_FILTER_LABELS,
  HISTORY_FILTER_ORDER_ONLINE,
  HISTORY_FILTER_LABELS_ONLINE,
  HISTORY_MODE_DISPLAY,
} from "./playHistory.js";
import { clearHistoryEntries } from "./history.js";
import { clearTimeAttackHistoryEntries } from "./timeAttackHistory.js";
import { buildSpecialModeIcon } from "./specialModeIcons.js";
import { ACHIEVEMENTS, getAchievementById } from "./achievementDefinitions.js";
import { describeSpeedProgressForPlay, buildSpeedProgressResultBlock } from "./speedAchievementProgress.js";
import { renderQuestionBreakdownAccordion } from "./battleQuestionBreakdownUi.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

// 速度称号の対象になりうるmodeIdだけ、履歴詳細モーダルに「称号チャレンジ」ブロックを
// 追加で表示する（js/speedAchievementProgress.jsのSPEED_ACHIEVEMENT_BY_MODEと同じ対象）。
const SPEED_ACHIEVEMENT_ID_BY_MODE = { intro: "lightning_fast", timeAttack: "lightning_fast", randomPlayback: "melody_ace" };

// 称号id→表示名の対応表。履歴に保存しているのはidだけなので、表示時にここで名前を引く。
// js/historyDetailScreen.js（現在は未使用の旧・詳細専用画面）も、後方互換のためこの関数を
// そのままimportして使っている。
const TITLE_NAME_BY_ID = Object.fromEntries(ACHIEVEMENTS.map((achievement) => [achievement.id, achievement.name]));

// 称号バッジ：new・unlock-and-newだけ表示する（repeatは結果画面と同じ考え方で間引き、
// 履歴を賑やかしすぎないようにする。データ自体はtitleResultsにすべて保存済み）。
export function buildTitleBadges(titleResults) {
  const noteworthyResults = (titleResults ?? []).filter(
    (result) => result.type === "new" || result.type === "unlock-and-new"
  );
  if (noteworthyResults.length === 0) return null;

  const wrapper = document.createElement("div");
  wrapper.className = "history-title-badges";
  noteworthyResults.forEach((result) => {
    const badge = document.createElement("span");
    badge.className = "history-title-badge";
    badge.textContent = `🏆 ${TITLE_NAME_BY_ID[result.id] ?? result.id}`;
    wrapper.appendChild(badge);
  });
  return wrapper;
}

// この画面が使うDOM要素一式。initHistoryScreen()で受け取って保持する。
let elements = null;
let activeFilterId = "all";
// 【2026-09-09新設・本人指示3-1：プレイ履歴のオフライン/オンライン分離】
let activeTab = "offline"; // "offline" | "online"

function isConfirmModalOpen() {
  return elements !== null && !elements.confirmModalOverlay.hidden;
}

function openConfirmModal() {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.confirmModalOverlay.hidden = false;
}

function closeConfirmModal() {
  playSfx(SFX_EVENTS.UI_BACK);
  elements.confirmModalOverlay.hidden = true;
}

// オーバーレイの背景部分をクリックしたときだけ閉じる（他のモーダルと同じ考え方）。
function handleConfirmModalOverlayClick(event) {
  if (event.target !== elements.confirmModalOverlay) return;
  closeConfirmModal();
}

function isDetailModalOpen() {
  return elements !== null && !elements.detailModalOverlay.hidden;
}

function openDetailModal(entry) {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.detailModalTitle.textContent = entry.modeLabel;
  elements.detailModalBody.innerHTML = "";
  describeEntryDetailFields(entry).forEach(({ label, value }) => {
    const row = document.createElement("div");
    row.className = "history-detail-modal-row";
    const labelEl = document.createElement("span");
    labelEl.className = "history-detail-modal-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "history-detail-modal-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    elements.detailModalBody.appendChild(row);
  });
  const titleBadges = buildTitleBadges(entry.details?.titleResults);
  if (titleBadges) {
    elements.detailModalBody.appendChild(titleBadges);
  }

  // 【2026-09-12新設・本人指示：オンライン履歴詳細も完成させる】結果画面が保存した
  // 問題別結果（js/battleQuestionBreakdown.js参照）があれば、結果画面と全く同じ描画関数
  // （js/battleQuestionBreakdownUi.js）でここにも表示する。無ければ何も追加しない
  // （保存されていない古い履歴・対応していないモードの履歴は今までどおりの表示のまま）。
  if (Array.isArray(entry.details?.questionBreakdown) && entry.details.questionBreakdown.length > 0) {
    const heading = document.createElement("p");
    heading.className = "history-detail-modal-speed-heading";
    heading.textContent = "問題別結果";
    elements.detailModalBody.appendChild(heading);

    const breakdownContainer = document.createElement("div");
    breakdownContainer.className = "battle-question-breakdown-list";
    elements.detailModalBody.appendChild(breakdownContainer);
    renderQuestionBreakdownAccordion(breakdownContainer, entry.details.questionBreakdown);
  }

  // 称号チャレンジ（2026-08-09新設）：電光石火・メロディアスの対象になりうるモードの
  // 履歴だけ、当時のプレイがその称号にどれだけ近かったかを追加表示する。
  const speedAchievementId = SPEED_ACHIEVEMENT_ID_BY_MODE[entry.modeId];
  if (speedAchievementId) {
    const isCleanClear =
      entry.completed !== false &&
      entry.questionCount !== null &&
      entry.correctCount === entry.questionCount &&
      entry.wrongCount === 0 &&
      (entry.skippedCount === 0 || entry.skippedCount === null);
    const speedProgress = describeSpeedProgressForPlay({
      modeId: entry.modeId,
      isAllSongsMode: entry.isAllSongsMode,
      isCleanClear,
      averageResponseMs: entry.averageResponseMs,
    });
    const speedProgressBlock = buildSpeedProgressResultBlock(
      speedProgress,
      getAchievementById(speedAchievementId)?.name ?? speedAchievementId
    );
    if (speedProgressBlock) {
      const heading = document.createElement("p");
      heading.className = "history-detail-modal-speed-heading";
      heading.textContent = "称号チャレンジ";
      elements.detailModalBody.appendChild(heading);
      elements.detailModalBody.appendChild(speedProgressBlock);
    }
  }

  elements.detailModalOverlay.hidden = false;
}

function closeDetailModal() {
  playSfx(SFX_EVENTS.UI_BACK);
  elements.detailModalOverlay.hidden = true;
}

function handleDetailModalOverlayClick(event) {
  if (event.target !== elements.detailModalOverlay) return;
  closeDetailModal();
}

// Escキーは、開いているモーダルの方だけ閉じる（両方開くことは無いが念のため詳細を優先する）。
function handleKeydown(event) {
  if (event.key !== "Escape") return;
  if (isDetailModalOpen()) {
    closeDetailModal();
  } else if (isConfirmModalOpen()) {
    closeConfirmModal();
  }
}

// 「削除する」が押されたときの処理。3つの保存先（通常イントロ・タイムアタック・
// その他モード用の新しい保存先）をすべて削除してから、モーダルを閉じて画面を描画し直す
// （統一画面が複数の保存先をまたいで表示しているため、「全削除」も全部を対象にする）。
function handleDeleteConfirmed() {
  playSfx(SFX_EVENTS.UI_CONFIRM);
  clearHistoryEntries();
  clearTimeAttackHistoryEntries();
  clearNativePlayHistoryEntries();
  closeConfirmModal();
  renderHistoryScreen();
}

// 正答率を「76%」のような表示用文字列にする。分母が0（履歴なし）のときはハイフンを表示する。
function formatAccuracy(accuracy) {
  if (accuracy === null) return "―";
  return `${Math.round(accuracy * 100)}%`;
}

// 上部のサマリー（総プレイ回数・総回答数・全体正答率）を反映する。
function renderSummary(entries) {
  const summary = computeUnifiedHistorySummary(entries);
  elements.summaryPlayCount.textContent = `${summary.totalPlayCount}回`;
  elements.summaryAnswerCount.textContent = `${summary.totalQuestionCount}問`;
  elements.summaryAccuracy.textContent = formatAccuracy(summary.overallAccuracy);
}

// フィルターチップを組み立てる。横スクロール可能なチップ形式（本人指示どおり）。
// 選択中のチップはis-activeで強調する。
// 【2026-09-09改訂・本人指示3-1：オフライン/オンライン分離】タブごとに違うチップ構成
// （オフライン＝すべて／イントロ／ランダム／歌詞／タイムアタック／1台対戦、
// オンライン＝すべて／イントロ系／歌詞クイズ／一瞬系）を出し分ける。
function renderFilterChips() {
  const order = activeTab === "online" ? HISTORY_FILTER_ORDER_ONLINE : HISTORY_FILTER_ORDER;
  const labels = activeTab === "online" ? HISTORY_FILTER_LABELS_ONLINE : HISTORY_FILTER_LABELS;
  elements.filterChipsContainer.innerHTML = "";
  order.forEach((filterId) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "history-filter-chip";
    chip.classList.toggle("is-active", filterId === activeFilterId);
    chip.textContent = labels[filterId];
    chip.addEventListener("click", () => {
      if (activeFilterId === filterId) return;
      playSfx(SFX_EVENTS.UI_CLICK);
      activeFilterId = filterId;
      renderHistoryScreen();
    });
    elements.filterChipsContainer.appendChild(chip);
  });
}

// 【2026-09-09新設・本人指示3-1：オフライン/オンライン分離】タブを切り替える。
// タブが変わったら、そのタブでは意味を持たない可能性があるフィルター選択を
// 「すべて」へ戻す（例：オフラインの「タイムアタック」のままオンラインタブへ切り替えると、
// 該当チップが存在せず絞り込みが意図せず空になってしまうため）。
function switchHistoryTab(tab) {
  if (activeTab === tab) return;
  playSfx(SFX_EVENTS.UI_CLICK);
  activeTab = tab;
  activeFilterId = "all";
  elements.tabOfflineButton.classList.toggle("is-active", tab === "offline");
  elements.tabOnlineButton.classList.toggle("is-active", tab === "online");
  renderHistoryScreen();
}

// 履歴1件分のカードを組み立てる。カード全体をボタンにして、タップで詳細モーダルを開けるようにする。
function buildHistoryEntryCard(entry) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "history-entry";
  card.addEventListener("click", () => openDetailModal(entry));

  const iconKey = HISTORY_MODE_DISPLAY[entry.modeId]?.iconKey ?? entry.modeId;
  card.appendChild(buildSpecialModeIcon(iconKey));

  const content = document.createElement("div");
  content.className = "history-entry-content";

  const header = document.createElement("div");
  header.className = "history-entry-header";

  const modeText = document.createElement("span");
  modeText.className = "history-entry-mode-label";
  modeText.textContent = entry.modeLabel;
  header.appendChild(modeText);

  const dateText = document.createElement("span");
  dateText.className = "history-entry-date";
  dateText.textContent = formatPlayedAt(entry.playedAt);
  header.appendChild(dateText);

  content.appendChild(header);

  describeEntrySummaryLines(entry).forEach((line) => {
    const lineEl = document.createElement("p");
    lineEl.className = "history-entry-line";
    lineEl.textContent = line;
    content.appendChild(lineEl);
  });

  card.appendChild(content);

  // 「タップで詳細に進める」ことを示すシェブロンアイコン。
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "history-entry-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("fill", "none");
  chevron.setAttribute("aria-hidden", "true");
  const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  chevronPath.setAttribute("d", "M9 5 16 12 9 19");
  chevronPath.setAttribute("stroke", "currentColor");
  chevronPath.setAttribute("stroke-width", "2.4");
  chevronPath.setAttribute("stroke-linecap", "round");
  chevronPath.setAttribute("stroke-linejoin", "round");
  chevron.appendChild(chevronPath);
  card.appendChild(chevron);

  return card;
}

// 下部の履歴一覧（新しい順）を反映する。0件のときは一覧の代わりに空状態のメッセージを見せる。
// 【2026-09-09改訂・本人指示3-1：オフライン/オンライン分離】空状態の文言も、今見ている
// タブに合わせて出し分ける（オフライン履歴があるのに「まだ履歴がありません」と出て
// 誤解させないため）。
function renderHistoryList(entries) {
  const isEmpty = entries.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.emptyState.textContent =
    activeTab === "online"
      ? "まだオンライン対戦の記録がありません。オンライン対戦で遊ぶと、ここに記録が残っていきます。"
      : "まだプレイ履歴がありません。クイズを遊ぶと、ここに記録が残っていきます。";
  elements.listContainer.hidden = isEmpty;

  elements.listContainer.innerHTML = "";
  entries.forEach((entry) => {
    elements.listContainer.appendChild(buildHistoryEntryCard(entry));
  });
}

// 現在の状態を読み込み直して、履歴画面全体（サマリー＋タブ＋フィルター＋一覧）を描画する。
// 画面を開くたびに呼ぶことで、直前のプレイ結果も必ず反映される。
// 【2026-09-09改訂・本人指示3-1：オフライン/オンライン分離】サマリー（総プレイ回数等）は
// 「すべて」ではなく、今見ているタブの範囲だけを対象に計算する（オフラインの回数の中に
// オンライン対戦の回数が紛れ込まないようにするため）。
export function renderHistoryScreen() {
  const allEntries = getUnifiedPlayHistoryEntries();
  const { offline, online } = splitHistoryEntriesByOnlineStatus(allEntries);
  const tabEntries = activeTab === "online" ? online : offline;

  elements.clearButton.hidden = allEntries.length === 0;
  renderSummary(tabEntries);
  renderFilterChips();
  const filteredEntries =
    activeTab === "online"
      ? filterOnlineHistoryEntries(tabEntries, activeFilterId)
      : filterUnifiedPlayHistoryEntries(tabEntries, activeFilterId);
  renderHistoryList(filteredEntries);
}

// プレイ履歴画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   summaryPlayCount, summaryAnswerCount, summaryAccuracy: サマリーの数値を表示する要素,
//   tabOfflineButton, tabOnlineButton: オフライン/オンラインの切り替えタブ,
//   filterChipsContainer: フィルターチップを並べる入れ物,
//   listContainer: 履歴カードを並べる入れ物,
//   emptyState: 履歴が0件のときだけ表示するメッセージ要素,
//   clearButton: 「履歴をすべて削除」ボタン,
//   confirmModalOverlay, confirmCancelButton, confirmDeleteButton: 全削除の確認モーダル,
//   detailModalOverlay, detailModalTitle, detailModalBody, detailModalCloseButton: 詳細モーダル,
// }
export function initHistoryScreen(newElements) {
  elements = newElements;

  elements.tabOfflineButton.addEventListener("click", () => switchHistoryTab("offline"));
  elements.tabOnlineButton.addEventListener("click", () => switchHistoryTab("online"));
  elements.clearButton.addEventListener("click", openConfirmModal);
  elements.confirmCancelButton.addEventListener("click", closeConfirmModal);
  elements.confirmDeleteButton.addEventListener("click", handleDeleteConfirmed);
  elements.confirmModalOverlay.addEventListener("click", handleConfirmModalOverlayClick);
  elements.detailModalCloseButton.addEventListener("click", closeDetailModal);
  elements.detailModalOverlay.addEventListener("click", handleDetailModalOverlayClick);
  document.addEventListener("keydown", handleKeydown);
}
