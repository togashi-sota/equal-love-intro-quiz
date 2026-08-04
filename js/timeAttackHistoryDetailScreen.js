// タイムアタック履歴 詳細画面を担当するファイル。
// 履歴一覧（timeAttackHistoryScreen.js）で1件のカードがタップされたときに開く画面で、
// その回の問題ごとの内訳（表示された4択・押した順番・正解・ミス数・回答時間）を表示する。
// js/timeAttackHistory.jsに保存済みのentryをそのまま受け取って描画するだけで、
// 新しいデータの保存は行わない（js/historyDetailScreen.jsと同じ考え方）。

const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };
const RULE_LABELS = { normal: "ノーマル", hard: "ハード", loveChain: "LOVE連チャン" };

// この画面が使うDOM要素一式。initTimeAttackHistoryDetailScreen()で受け取って保持する。
let elements = null;

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

// サマリー部分（日時・出題数/カテゴリ/ルール・合計タイム・正解数/ミス数・新記録／失敗）を反映する。
function renderSummary(entry) {
  elements.date.textContent = formatPlayedAt(entry.playedAt);

  const questionCountLabel = QUESTION_COUNT_LABELS[entry.questionCountValue] ?? entry.questionCountValue;
  const categoryLabel = CATEGORY_LABELS[entry.categoryFilterValue] ?? entry.categoryFilterValue;
  const ruleLabel = RULE_LABELS[entry.rule] ?? entry.rule;
  elements.mode.textContent = `${questionCountLabel}・${categoryLabel}・${ruleLabel}`;

  elements.totalTime.textContent = `${formatSeconds(entry.totalElapsedMs)}秒`;
  elements.correctCount.textContent = `${entry.correctCount} / ${entry.questions.length}問`;
  elements.missCount.textContent = `${entry.missCount}回`;

  elements.newRecord.hidden = !entry.isNewRecord;
  elements.failStatus.hidden = entry.completed;
  if (!entry.completed) {
    elements.failStatus.textContent = `${entry.failedAtQuestionNumber}問目で失敗しました`;
  }
}

// 1問分の内訳行を1つ組み立てる。
// 表示された4択・押した順番（ノーマルルールで複数回答した場合は「曲A → 曲B → 正解曲」のように
// 矢印区切りで見せる）・正解・ミス数・回答時間まで、履歴に保存済みの情報をそのまま表示する。
function buildQuestionRow(question) {
  const row = document.createElement("li");
  row.className = "time-attack-history-detail-question-row";

  const header = document.createElement("div");
  header.className = "time-attack-history-detail-question-header";

  const number = document.createElement("span");
  number.className = "time-attack-history-detail-question-number";
  number.textContent = `Q${question.questionNumber}`;
  header.appendChild(number);

  const resultTag = document.createElement("span");
  resultTag.className = `time-attack-history-detail-question-tag ${question.isCorrect ? "is-correct" : "is-wrong"}`;
  resultTag.textContent = question.isCorrect ? "正解" : "不正解";
  header.appendChild(resultTag);

  row.appendChild(header);

  const correctAnswerLine = document.createElement("p");
  correctAnswerLine.className = "time-attack-history-detail-question-answer";
  correctAnswerLine.textContent = `正解：${question.correctAnswer}`;
  row.appendChild(correctAnswerLine);

  const choicesLine = document.createElement("p");
  choicesLine.className = "time-attack-history-detail-question-choices";
  choicesLine.textContent = `4択：${question.choices.map((choice) => choice.title).join("／")}`;
  row.appendChild(choicesLine);

  const selectedLine = document.createElement("p");
  selectedLine.className = "time-attack-history-detail-question-selected";
  selectedLine.textContent = `回答：${question.selectedAnswers.join(" → ")}`;
  row.appendChild(selectedLine);

  const meta = document.createElement("div");
  meta.className = "time-attack-history-detail-question-meta";

  const mistake = document.createElement("span");
  mistake.textContent = `ミス${question.mistakeCount}回`;
  meta.appendChild(mistake);

  const time = document.createElement("span");
  time.textContent = question.elapsedMs === null ? "―" : `${(question.elapsedMs / 1000).toFixed(1)}秒`;
  meta.appendChild(time);

  row.appendChild(meta);

  return row;
}

// 問題ごとの内訳一覧を反映する。
function renderQuestionList(entry) {
  elements.questionList.innerHTML = "";
  entry.questions.forEach((question) => {
    elements.questionList.appendChild(buildQuestionRow(question));
  });
}

// 履歴1件分のデータを受け取り、詳細画面全体を描画する。
// timeAttackHistoryScreen.jsの履歴カードがタップされたとき、main.js経由で呼ばれる想定。
export function renderTimeAttackHistoryDetail(entry) {
  renderSummary(entry);
  renderQuestionList(entry);
}

// タイムアタック履歴詳細画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   date, mode: 日時・出題数/カテゴリ/ルールを表示する要素,
//   totalTime, correctCount, missCount: サマリーの数値,
//   newRecord, failStatus: 新記録バッジ／失敗表示（どちらか一方だけが表示される）,
//   questionList: 問題ごとの内訳行を並べる<ul>,
// }
export function initTimeAttackHistoryDetailScreen(newElements) {
  elements = newElements;
}
