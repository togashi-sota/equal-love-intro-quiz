// タイムアタック履歴一覧画面を担当するファイル。
// 通常プレイの履歴画面（js/historyScreen.js）と同じ組み立て方（1件＝カード、タップで詳細へ）を
// 踏襲しているが、データの読み込み元（js/timeAttackHistory.js）・表示項目（得点/ランクではなく
// タイム/正解数/ミス数/ルール）が異なるため、完全に別ファイルとして独立させている。

import { getTimeAttackHistoryEntries } from "./timeAttackHistory.js";

// 出題数・カテゴリの短縮ラベル。main.js・historyScreen.jsと同じ表記に揃えている。
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };
const RULE_LABELS = { normal: "ノーマル", hard: "ハード", loveChain: "LOVE連チャン" };
// 出題タイプ（2026-08-07追加）。古い履歴データにはentry.variant自体が無いため、
// 未設定は従来通りイントロ形式として扱う（entry.variant ?? "intro"）。
const VARIANT_LABELS = { intro: "🎧イントロ", randomPlayback: "🔀ランダム再生" };

// この画面が使うDOM要素一式。initTimeAttackHistoryScreen()で受け取って保持する。
let elements = null;

// playedAt（Date.now()のミリ秒）を、通常プレイ履歴と同じ「7/28 14:32」形式にする。
function formatPlayedAt(playedAt) {
  const date = new Date(playedAt);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

// 履歴1件分のカードを組み立てる。カード全体をボタンにして、タップで詳細画面を開けるようにする。
// 見た目は通常プレイ履歴の.history-entry系クラスをそのまま流用し、
// タイムアタック特有の項目（タイム・正解/ミス・失敗表示）だけ専用クラスを新設している。
function buildHistoryEntryCard(entry) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "history-entry";
  card.addEventListener("click", () => elements.onSelectEntry(entry));

  const content = document.createElement("div");
  content.className = "history-entry-content";

  const header = document.createElement("div");
  header.className = "history-entry-header";

  const dateText = document.createElement("span");
  dateText.className = "history-entry-date";
  dateText.textContent = formatPlayedAt(entry.playedAt);
  header.appendChild(dateText);

  if (entry.isNewRecord) {
    const newRecordMark = document.createElement("span");
    newRecordMark.className = "history-new-record-mark";
    newRecordMark.textContent = "🎉新記録";
    header.appendChild(newRecordMark);
  } else if (!entry.completed) {
    // LOVE連チャンで全問クリアできずに終了した回だけ、赤系の「失敗」マークを添える。
    const failMark = document.createElement("span");
    failMark.className = "time-attack-history-fail-mark";
    failMark.textContent = "失敗";
    header.appendChild(failMark);
  }

  content.appendChild(header);

  const modeLine = document.createElement("p");
  modeLine.className = "history-entry-mode";
  const questionCountLabel = QUESTION_COUNT_LABELS[entry.questionCountValue] ?? entry.questionCountValue;
  const categoryLabel = CATEGORY_LABELS[entry.categoryFilterValue] ?? entry.categoryFilterValue;
  const ruleLabel = RULE_LABELS[entry.rule] ?? entry.rule;
  const variantLabel = VARIANT_LABELS[entry.variant ?? "intro"] ?? VARIANT_LABELS.intro;
  modeLine.textContent = `${variantLabel}・${questionCountLabel}・${categoryLabel}・${ruleLabel}`;
  content.appendChild(modeLine);

  // クリアした回はタイムを主役に、LOVE連チャンで失敗した回は「何問目で終わったか」を主役にする
  // （本人の希望どおり、一覧は情報を詰め込みすぎず、これだけで結果の良し悪しが一目で分かる形にする）。
  const resultLine = document.createElement("p");
  resultLine.className = "time-attack-history-entry-time";
  resultLine.textContent = entry.completed
    ? `${formatSeconds(entry.totalElapsedMs)}秒`
    : `${entry.failedAtQuestionNumber}問目で失敗`;
  content.appendChild(resultLine);

  const statsLine = document.createElement("p");
  statsLine.className = "time-attack-history-entry-stats";
  statsLine.textContent = entry.completed
    ? `正解${entry.correctCount}／ミス${entry.missCount}`
    : `経過 ${formatSeconds(entry.totalElapsedMs)}秒`;
  content.appendChild(statsLine);

  card.appendChild(content);

  // 「タップで詳細に進める」ことを示すシェブロンアイコン（historyScreen.jsと同じ見た目）。
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

// 履歴一覧（新しい順）を反映する。0件のときは一覧の代わりに空状態のメッセージを見せる。
function renderHistoryList(entries) {
  const isEmpty = entries.length === 0;
  elements.emptyState.hidden = !isEmpty;
  elements.listContainer.hidden = isEmpty;

  elements.listContainer.innerHTML = "";
  entries.forEach((entry) => {
    elements.listContainer.appendChild(buildHistoryEntryCard(entry));
  });
}

// 現在の状態を読み込み直して、履歴一覧画面を描画する。
// 画面を開くたびに呼ぶことで、直前のプレイ結果も必ず反映される。
export function renderTimeAttackHistoryScreen() {
  const entries = getTimeAttackHistoryEntries();
  renderHistoryList(entries);
}

// タイムアタック履歴一覧画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   listContainer: 履歴カードを並べる入れ物,
//   emptyState: 履歴が0件のときだけ表示するメッセージ要素,
//   onSelectEntry: 履歴カードがタップされたときに呼ばれるコールバック（entryを受け取る）。
//                  詳細画面を開く処理自体はmain.js側が担当する。
// }
export function initTimeAttackHistoryScreen(newElements) {
  elements = newElements;
}
