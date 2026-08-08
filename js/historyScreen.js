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
  describeEntrySummaryLines,
  describeEntryDetailFields,
  formatPlayedAt,
  clearNativePlayHistoryEntries,
  HISTORY_FILTER_ORDER,
  HISTORY_FILTER_LABELS,
  HISTORY_MODE_DISPLAY,
} from "./playHistory.js";
import { clearHistoryEntries } from "./history.js";
import { clearTimeAttackHistoryEntries } from "./timeAttackHistory.js";
import { buildSpecialModeIcon } from "./specialModeIcons.js";
import { ACHIEVEMENTS } from "./achievementDefinitions.js";

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

function isConfirmModalOpen() {
  return elements !== null && !elements.confirmModalOverlay.hidden;
}

function openConfirmModal() {
  elements.confirmModalOverlay.hidden = false;
}

function closeConfirmModal() {
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
  elements.detailModalOverlay.hidden = false;
}

function closeDetailModal() {
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

// フィルターチップ（すべて／イントロ／ランダム／歌詞／タイムアタック／対戦）を組み立てる。
// 横スクロール可能なチップ形式（本人指示どおり）。選択中のチップはis-activeで強調する。
function renderFilterChips() {
  elements.filterChipsContainer.innerHTML = "";
  HISTORY_FILTER_ORDER.forEach((filterId) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "history-filter-chip";
    chip.classList.toggle("is-active", filterId === activeFilterId);
    chip.textContent = HISTORY_FILTER_LABELS[filterId];
    chip.addEventListener("click", () => {
      if (activeFilterId === filterId) return;
      activeFilterId = filterId;
      renderHistoryScreen();
    });
    elements.filterChipsContainer.appendChild(chip);
  });
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
function renderHistoryList(entries) {
  const isEmpty = entries.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.listContainer.hidden = isEmpty;

  elements.listContainer.innerHTML = "";
  entries.forEach((entry) => {
    elements.listContainer.appendChild(buildHistoryEntryCard(entry));
  });
}

// 現在の状態を読み込み直して、履歴画面全体（サマリー＋フィルター＋一覧）を描画する。
// 画面を開くたびに呼ぶことで、直前のプレイ結果も必ず反映される。
export function renderHistoryScreen() {
  const allEntries = getUnifiedPlayHistoryEntries();
  elements.clearButton.hidden = allEntries.length === 0;
  renderSummary(allEntries);
  renderFilterChips();
  renderHistoryList(filterUnifiedPlayHistoryEntries(allEntries, activeFilterId));
}

// プレイ履歴画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   summaryPlayCount, summaryAnswerCount, summaryAccuracy: サマリーの数値を表示する要素,
//   filterChipsContainer: フィルターチップを並べる入れ物,
//   listContainer: 履歴カードを並べる入れ物,
//   emptyState: 履歴が0件のときだけ表示するメッセージ要素,
//   clearButton: 「履歴をすべて削除」ボタン,
//   confirmModalOverlay, confirmCancelButton, confirmDeleteButton: 全削除の確認モーダル,
//   detailModalOverlay, detailModalTitle, detailModalBody, detailModalCloseButton: 詳細モーダル,
// }
export function initHistoryScreen(newElements) {
  elements = newElements;

  elements.clearButton.addEventListener("click", openConfirmModal);
  elements.confirmCancelButton.addEventListener("click", closeConfirmModal);
  elements.confirmDeleteButton.addEventListener("click", handleDeleteConfirmed);
  elements.confirmModalOverlay.addEventListener("click", handleConfirmModalOverlayClick);
  elements.detailModalCloseButton.addEventListener("click", closeDetailModal);
  elements.detailModalOverlay.addEventListener("click", handleDetailModalOverlayClick);
  document.addEventListener("keydown", handleKeydown);
}
