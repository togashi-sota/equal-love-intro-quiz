// 苦手曲モードの確認画面を担当するファイル。
// 「3回以上出題され、正答率50%未満」の対象曲を一覧表示し、出題数を選んでから開始できる。
// 判定ロジック自体はhistory.jsのcomputeWeakSongs()に任せ、ここでは画面の組み立てと、
// 選ばれた出題数から実際に出題する曲IDを決めるところまでを行う。
// クイズを実際に組み立てて開始する処理（曲IDの配列を受け取る汎用エンジン）はmain.js側が担当する。

import { SONGS } from "./data/songs.js";
import { getHistoryEntries, computeWeakSongs } from "./history.js";
import { resolveQuestionCount } from "./quiz.js";

// この画面が使うDOM要素一式。initWeakSongsScreen()で受け取って保持する。
let elements = null;

// 今表示している対象曲（songオブジェクトの配列）。出題数の案内表示や、
// 開始ボタンが押されたときの出題曲決定に使う。
let currentWeakSongs = [];

// 選んだ出題数が対象曲数を上回っているときだけ、実際の出題数を案内する。
// スタート画面のupdateQuestionCountNotice()と同じ考え方。
function updateCountNotice() {
  const checkedRadio = document.querySelector('input[name="weak-songs-question-count"]:checked');
  const questionCountValue = checkedRadio.value;
  const actualCount = resolveQuestionCount(questionCountValue, currentWeakSongs.length);

  if (questionCountValue !== "all" && Number(questionCountValue) > currentWeakSongs.length) {
    elements.countNotice.textContent =
      `対象曲が${currentWeakSongs.length}曲のため、実際は${actualCount}問になります`;
    elements.countNotice.hidden = false;
  } else {
    elements.countNotice.hidden = true;
  }
}

// 画面を開くたびに呼び、最新のプレイ履歴から苦手曲を判定し直して表示する。
export function renderWeakSongsScreen() {
  const weakSongStats = computeWeakSongs(getHistoryEntries());
  currentWeakSongs = weakSongStats
    .map((stat) => SONGS.find((song) => song.id === stat.songId))
    .filter((song) => song !== undefined); // データ不整合で曲が見つからない場合は除外する

  const hasWeakSongs = currentWeakSongs.length > 0;
  elements.availableSection.hidden = !hasWeakSongs;
  elements.emptyState.hidden = hasWeakSongs;

  if (!hasWeakSongs) return;

  elements.countValue.textContent = currentWeakSongs.length;
  elements.allLabel.textContent = `全対象・${currentWeakSongs.length}問`;

  elements.chipRow.innerHTML = "";
  currentWeakSongs.forEach((song) => {
    const chip = document.createElement("span");
    chip.className = "missed-song-chip";
    chip.textContent = song.title;
    elements.chipRow.appendChild(chip);
  });

  updateCountNotice();
}

// 苦手曲を判定し直し、指定した出題数に応じて実際に出題する曲IDを返す。
// この画面の「開始する」だけでなく、結果画面の「もう一度挑戦する」（苦手曲判定を
// 再計算して再開する）からも呼べるよう、画面の表示状態に依存しない形にしている。
export function resolveWeakSongIds(questionCountValue) {
  const weakSongStats = computeWeakSongs(getHistoryEntries());
  const weakSongs = weakSongStats
    .map((stat) => SONGS.find((song) => song.id === stat.songId))
    .filter((song) => song !== undefined);
  const actualCount = resolveQuestionCount(questionCountValue, weakSongs.length);
  return weakSongs.slice(0, actualCount).map((song) => song.id);
}

// 「開始する」が押されたときの処理。選ばれた出題数と、今表示している対象曲から
// 実際に出題する曲IDを決め、onStartコールバックに渡す（実際にクイズを組み立てて
// 開始する処理はmain.js側の汎用エンジンが担当する）。
function handleStart() {
  const questionCountValue = document.querySelector('input[name="weak-songs-question-count"]:checked').value;
  const actualCount = resolveQuestionCount(questionCountValue, currentWeakSongs.length);
  const songIds = currentWeakSongs.slice(0, actualCount).map((song) => song.id);
  elements.onStart(songIds, questionCountValue);
}

// 苦手曲モード確認画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   availableSection, emptyState: 対象曲の有無で出し分ける2つの表示,
//   countValue, allLabel: 対象曲数を表示する要素,
//   chipRow: 曲名チップを並べる入れ物,
//   countNotice: 出題数が対象曲数を上回るときの案内,
//   startButton: 「開始する」ボタン,
//   onStart: 開始ボタンが押されたときに呼ばれるコールバック。(songIds, questionCountValue)を受け取る,
// }
export function initWeakSongsScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", handleStart);
  document
    .querySelectorAll('input[name="weak-songs-question-count"]')
    .forEach((radio) => radio.addEventListener("change", updateCountNotice));
}
