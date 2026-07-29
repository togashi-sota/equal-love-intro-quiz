// プレイ履歴 詳細画面を担当するファイル。
// 履歴一覧（historyScreen.js）で1件のカードがタップされたときに開く画面で、
// その回の曲別内訳（正解/不正解/スキップ/答えを見た・得点・回答時間）を表示する。
// history.jsに保存済みのentryをそのまま受け取って描画するだけで、新しいデータの保存は行わない。

import { SONGS } from "./data/songs.js";
import { buildTitleBadges } from "./historyScreen.js";

// 結果タグの表示ラベルとCSSクラスの対応表。
const RESULT_TAG_INFO = {
  correct: { label: "正解", className: "is-correct" },
  wrong: { label: "不正解", className: "is-wrong" },
  skip: { label: "スキップ", className: "is-skip" },
  reveal: { label: "答えを見た", className: "is-reveal" },
};

// この画面が使うDOM要素一式。initHistoryDetailScreen()で受け取って保持する。
let elements = null;

// 今表示中の履歴entry。復習ボタンが押されたときに、この回の間違えた曲・出題数・
// カテゴリを参照するために保持しておく。
let currentEntry = null;

// songIdから曲名を引く。万一songs.jsに見つからない場合（データ不整合）でも
// 画面が壊れないよう、その場合はsongIdをそのまま表示する。
function findSongTitle(songId) {
  const song = SONGS.find((candidate) => candidate.id === songId);
  return song ? song.title : songId;
}

// playedAt（Date.now()のミリ秒）を、履歴一覧と同じ「7/28 14:32」形式にする。
function formatPlayedAt(playedAt) {
  const date = new Date(playedAt);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };

// サマリー部分（日時・モード・ランク・得点・平均回答時間・新記録・称号バッジ）を反映する。
function renderSummary(entry) {
  elements.date.textContent = formatPlayedAt(entry.playedAt);

  const questionCountLabel = QUESTION_COUNT_LABELS[entry.questionCountValue] ?? entry.questionCountValue;
  const categoryLabel = CATEGORY_LABELS[entry.categoryFilterValue] ?? entry.categoryFilterValue;
  elements.mode.textContent = `${questionCountLabel}・${categoryLabel}`;

  elements.rankDisplay.classList.remove("rank-s", "rank-a", "rank-b", "rank-c");
  elements.rankDisplay.classList.add(`rank-${entry.rank.toLowerCase()}`);
  elements.rankLetter.textContent = entry.rank;

  elements.score.textContent =
    `${entry.score} / ${entry.maxScore}点（${entry.correctCount}/${entry.questionCount}問正解）`;

  // averageCorrectElapsedMsは、正解が1問もなければnullになりうる（1問も正解していないため
  // 平均のとりようがない）。その場合は行ごと隠す。
  if (entry.averageCorrectElapsedMs === null) {
    elements.averageTime.hidden = true;
  } else {
    elements.averageTime.hidden = false;
    elements.averageTime.textContent = `平均回答時間 ${(entry.averageCorrectElapsedMs / 1000).toFixed(1)}秒`;
  }

  elements.newRecord.hidden = !entry.isNewRecord;

  elements.titleBadges.innerHTML = "";
  const titleBadges = buildTitleBadges(entry.titleResults);
  if (titleBadges) {
    elements.titleBadges.appendChild(titleBadges);
  }
}

// entryのanswers（songIdのみ）から、間違えた曲（不正解/スキップ/答えを見た）を
// songs.jsの曲オブジェクトに変換して返す。復習クイズの組み立て（quiz.jsのbuildReviewQuizQuestions）
// はsongオブジェクトを必要とするため、ここでsongIdから引き直す。
function getMissedSongsFromEntry(entry) {
  return entry.answers
    .filter((answer) => answer.result !== "correct")
    .map((answer) => SONGS.find((song) => song.id === answer.songId))
    .filter((song) => song !== undefined); // データ不整合で曲が見つからない場合は除外する
}

// 「今回間違えた曲」の復習エリアを反映する。全問正解なら復習エリアを隠し、
// 代わりに「全問正解でした」の一言を表示する。
function renderMissedSection(entry) {
  const missedAnswers = entry.answers.filter((answer) => answer.result !== "correct");
  const hasMissed = missedAnswers.length > 0;

  elements.missedSection.hidden = !hasMissed;
  elements.allCorrectMessage.hidden = hasMissed;

  if (!hasMissed) return;

  elements.missedHeading.textContent = `今回間違えた曲（${missedAnswers.length}曲）`;
  elements.missedChipRow.innerHTML = "";
  missedAnswers.forEach((answer) => {
    const chip = document.createElement("span");
    chip.className = "missed-song-chip";
    chip.textContent = findSongTitle(answer.songId);
    elements.missedChipRow.appendChild(chip);
  });
}

// 1問ごとの内訳行を1つ組み立てる。
function buildAnswerRow(answer, index) {
  const row = document.createElement("li");
  row.className = "history-detail-answer-row";

  const number = document.createElement("span");
  number.className = "history-detail-answer-number";
  number.textContent = `Q${index + 1}`;
  row.appendChild(number);

  const title = document.createElement("span");
  title.className = "history-detail-answer-title";
  title.textContent = findSongTitle(answer.songId);
  row.appendChild(title);

  const tagInfo = RESULT_TAG_INFO[answer.result];
  const tag = document.createElement("span");
  tag.className = `history-detail-answer-tag ${tagInfo.className}`;
  tag.textContent = tagInfo.label;
  row.appendChild(tag);

  const meta = document.createElement("span");
  meta.className = "history-detail-answer-meta";

  const score = document.createElement("span");
  score.className = "history-detail-answer-score";
  score.textContent = `${answer.score}点`;
  meta.appendChild(score);

  const time = document.createElement("span");
  time.className = "history-detail-answer-time";
  time.textContent = answer.elapsedMs === null ? "―" : `${(answer.elapsedMs / 1000).toFixed(1)}秒`;
  meta.appendChild(time);

  row.appendChild(meta);

  return row;
}

// 全問の内訳一覧と、末尾の「全○問表示しました」を反映する。
function renderAnswerList(entry) {
  elements.answerList.innerHTML = "";
  entry.answers.forEach((answer, index) => {
    elements.answerList.appendChild(buildAnswerRow(answer, index));
  });
  elements.listEnd.textContent = `全${entry.answers.length}問表示しました`;
}

// 履歴1件分のデータを受け取り、詳細画面全体を描画する。
// historyScreen.jsの履歴カードがタップされたとき、main.js経由で呼ばれる想定。
export function renderHistoryDetail(entry) {
  currentEntry = entry;
  renderSummary(entry);
  renderMissedSection(entry);
  renderAnswerList(entry);
}

// プレイ履歴詳細画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   date, mode: 日時・モードを表示する要素,
//   rankDisplay, rankLetter: ランクバッジの外枠・文字,
//   score, averageTime, newRecord, titleBadges: サマリーの残りの項目,
//   missedSection, missedHeading, missedChipRow, reviewButton: 復習エリア,
//   allCorrectMessage: 全問正解時の代替表示,
//   answerList, listEnd: 1問ごとの内訳一覧と末尾の表示,
//   onStartReview: 復習ボタンが押されたときに呼ばれるコールバック。
//                  (missedSongs, questionCountValue, categoryFilterValue) を受け取る。
//                  復習クイズを実際に組み立てて開始する処理自体はmain.js側が担当する。
// }
export function initHistoryDetailScreen(newElements) {
  elements = newElements;

  elements.reviewButton.addEventListener("click", () => {
    const missedSongs = getMissedSongsFromEntry(currentEntry);
    elements.onStartReview(missedSongs, currentEntry.questionCountValue, currentEntry.categoryFilterValue);
  });
}
