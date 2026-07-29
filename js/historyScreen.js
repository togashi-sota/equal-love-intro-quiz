// プレイ履歴画面を担当するファイル。
// 履歴データの読み込み・集計・削除はhistory.js（データ層）に任せ、ここでは
// 画面の組み立て（サマリー・一覧）と、全削除の確認モーダルの開閉だけを扱う。
// titleList.jsと同じく、この画面に関わる処理はこのファイルの中に閉じ込める。

import { getHistoryEntries, computeHistorySummary, clearHistoryEntries } from "./history.js";
import { TITLES } from "./titleDefinitions.js";

// 出題数・カテゴリの短縮ラベル。main.js・titleList.jsと同じ表記に揃えている。
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };

// 称号id→表示名の対応表。履歴に保存しているのはidだけなので、表示時にここで名前を引く。
const TITLE_NAME_BY_ID = Object.fromEntries(TITLES.map((title) => [title.id, title.name]));

// この画面が使うDOM要素一式。initHistoryScreen()で受け取って保持する。
let elements = null;

function isConfirmModalOpen() {
  return elements !== null && !elements.confirmModalOverlay.hidden;
}

function openConfirmModal() {
  elements.confirmModalOverlay.hidden = false;
}

function closeConfirmModal() {
  elements.confirmModalOverlay.hidden = true;
}

// オーバーレイの背景部分をクリックしたときだけ閉じる（ルール説明・称号一覧モーダルと同じ考え方）。
function handleConfirmModalOverlayClick(event) {
  if (event.target !== elements.confirmModalOverlay) return;
  closeConfirmModal();
}

// Escキーは確認モーダルが開いているときだけ反応させる。
function handleKeydown(event) {
  if (event.key !== "Escape") return;
  if (!isConfirmModalOpen()) return;
  closeConfirmModal();
}

// 「削除する」が押されたときの処理。実際に削除し、モーダルを閉じてから画面を描画し直す。
function handleDeleteConfirmed() {
  clearHistoryEntries();
  closeConfirmModal();
  renderHistoryScreen();
}

// playedAt（Date.now()のミリ秒）を「7/28 14:32」のような表示用文字列にする。
function formatPlayedAt(playedAt) {
  const date = new Date(playedAt);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

// 正答率を「76%」のような表示用文字列にする。分母が0（履歴なし）のときはハイフンを表示する。
function formatAccuracy(accuracy) {
  if (accuracy === null) return "―";
  return `${Math.round(accuracy * 100)}%`;
}

// 上部のサマリー（総プレイ回数・総回答数・全体正答率）を反映する。
function renderSummary(entries) {
  const summary = computeHistorySummary(entries);
  elements.summaryPlayCount.textContent = `${summary.totalPlayCount}回`;
  elements.summaryAnswerCount.textContent = `${summary.totalQuestionCount}問`;
  elements.summaryAccuracy.textContent = formatAccuracy(summary.overallAccuracy);
}

// 称号バッジ：new・unlock-and-newだけ表示する（repeatは結果画面と同じ考え方で間引き、
// 履歴を賑やかしすぎないようにする。データ自体はtitleResultsにすべて保存済み）。
// プレイ履歴詳細画面（historyDetailScreen.js）でも同じ見た目で使うため、外部に公開している。
export function buildTitleBadges(titleResults) {
  const noteworthyResults = titleResults.filter(
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

// 履歴1件分のカードを組み立てる。カード全体をボタンにして、タップで詳細画面を開けるようにする。
function buildHistoryEntryCard(entry) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "history-entry";
  card.addEventListener("click", () => elements.onSelectEntry(entry));

  // 既存の中身（日時・ランク・モード・得点・称号バッジ）は、詳細への導線であることを示す
  // シェブロンアイコンと区別できるよう、1つの入れ物にまとめる。
  const content = document.createElement("div");
  content.className = "history-entry-content";

  const header = document.createElement("div");
  header.className = "history-entry-header";

  const dateText = document.createElement("span");
  dateText.className = "history-entry-date";
  dateText.textContent = formatPlayedAt(entry.playedAt);
  header.appendChild(dateText);

  const rankChip = document.createElement("span");
  rankChip.className = `history-rank-chip rank-${entry.rank.toLowerCase()}`;
  rankChip.textContent = entry.rank;
  header.appendChild(rankChip);

  if (entry.isNewRecord) {
    const newRecordMark = document.createElement("span");
    newRecordMark.className = "history-new-record-mark";
    newRecordMark.textContent = "🎉新記録";
    header.appendChild(newRecordMark);
  }

  content.appendChild(header);

  const modeLine = document.createElement("p");
  modeLine.className = "history-entry-mode";
  const questionCountLabel = QUESTION_COUNT_LABELS[entry.questionCountValue] ?? entry.questionCountValue;
  const categoryLabel = CATEGORY_LABELS[entry.categoryFilterValue] ?? entry.categoryFilterValue;
  modeLine.textContent = `${questionCountLabel}・${categoryLabel}`;
  content.appendChild(modeLine);

  const scoreLine = document.createElement("p");
  scoreLine.className = "history-entry-score";
  scoreLine.textContent =
    `${entry.score} / ${entry.maxScore}点（${entry.correctCount}/${entry.questionCount}問正解）`;
  content.appendChild(scoreLine);

  const titleBadges = buildTitleBadges(entry.titleResults);
  if (titleBadges) {
    content.appendChild(titleBadges);
  }

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
// 削除できる履歴が1件もないときは「全削除」ボタンも意味がないので一緒に隠す。
function renderHistoryList(entries) {
  const isEmpty = entries.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.listContainer.hidden = isEmpty;
  elements.clearButton.hidden = isEmpty;

  elements.listContainer.innerHTML = "";
  entries.forEach((entry) => {
    elements.listContainer.appendChild(buildHistoryEntryCard(entry));
  });
}

// 現在の状態を読み込み直して、履歴画面全体（サマリー＋一覧）を描画する。
// 画面を開くたびに呼ぶことで、直前のプレイ結果も必ず反映される。
export function renderHistoryScreen() {
  const entries = getHistoryEntries();
  renderSummary(entries);
  renderHistoryList(entries);
}

// プレイ履歴画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   summaryPlayCount, summaryAnswerCount, summaryAccuracy: サマリーの数値を表示する要素,
//   listContainer: 履歴カードを並べる入れ物,
//   emptyState: 履歴が0件のときだけ表示するメッセージ要素,
//   clearButton: 「履歴をすべて削除」ボタン,
//   confirmModalOverlay: 削除確認モーダルの背景要素,
//   confirmCancelButton, confirmDeleteButton: 確認モーダル内の「キャンセル」「削除する」ボタン,
//   onSelectEntry: 履歴カードがタップされたときに呼ばれるコールバック（entryを受け取る）。
//                  詳細画面を開く処理自体はmain.js側が担当する。
// }
export function initHistoryScreen(newElements) {
  elements = newElements;

  elements.clearButton.addEventListener("click", openConfirmModal);
  elements.confirmCancelButton.addEventListener("click", closeConfirmModal);
  elements.confirmDeleteButton.addEventListener("click", handleDeleteConfirmed);
  elements.confirmModalOverlay.addEventListener("click", handleConfirmModalOverlayClick);
  document.addEventListener("keydown", handleKeydown);
}
