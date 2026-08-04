// 苦手曲モードの確認画面を担当するファイル。
// 「3回以上出題され、正答率50%未満」の対象曲を一覧表示し、出題数を選んでから開始できる。
// 判定ロジック自体はhistory.jsのcomputeWeakSongs()に任せ、ここでは画面の組み立てと、
// 選ばれた出題数から実際に出題する曲IDを決めるところまでを行う。
// クイズを実際に組み立てて開始する処理（曲IDの配列を受け取る汎用エンジン）はmain.js側が担当する。
//
// 【2026-08-06追加】判定にタイムアタックの結果も反映してほしいという要望を受け、
// 通常プレイ（computeWeakSongs）・タイムアタック（computeTimeAttackWeakSongs）それぞれの
// 判定を別々に計算してから、mergeWeakSongStats()で1つのリストに統合する方式にした。
// 2つのモードは「苦手」の基準（正誤の比率／ミス回数の比率）が異なるため、無理に1つの
// 計算式へ混ぜ込むより、モードごとに正しく判定してから合流させる方が分かりやすく、
// 保守もしやすいと判断した（本人と相談のうえで決定）。

import { SONGS } from "./data/songs.js";
import { getHistoryEntries, computeWeakSongs } from "./history.js";
import { getTimeAttackHistoryEntries, computeTimeAttackWeakSongs } from "./timeAttackHistory.js";
import { resolveQuestionCount } from "./quiz.js";

// この画面が使うDOM要素一式。initWeakSongsScreen()で受け取って保持する。
let elements = null;

// 今表示している対象曲（songオブジェクトの配列）。出題数の案内表示や、
// 開始ボタンが押されたときの出題曲決定に使う。
let currentWeakSongs = [];
// songId→「なぜ苦手曲として選ばれたか」の理由文の配列。チップの表示にだけ使う
// （出題曲の決定ロジックには影響しない、あくまで説明用のデータ）。
let currentWeakSongReasons = new Map();

// 通常プレイ・タイムアタックそれぞれの苦手曲判定を、1つのリストへ統合する。
// normalStats: computeWeakSongs()の戻り値（{songId, appearances, correctCount, accuracy}）
// timeAttackStats: computeTimeAttackWeakSongs()の戻り値（{songId, appearances, mistakeAppearances, noMistakeRate}）
// 両方で対象になった曲は、理由を2つとも表示する（severityはより低い方＝より苦手な方を採用）。
// severityは「0に近いほど苦手」という共通の意味で扱う（正答率・ノーミス率、どちらも
// 「うまくいっている割合」を表す0〜1の値のため、そのまま比較して問題ない）。
function mergeWeakSongStats(normalStats, timeAttackStats) {
  const statsBySongId = new Map();

  normalStats.forEach((stat) => {
    const accuracyPercent = Math.round(stat.accuracy * 100);
    statsBySongId.set(stat.songId, {
      songId: stat.songId,
      severity: stat.accuracy,
      reasons: [`正答率${accuracyPercent}%（${stat.correctCount}/${stat.appearances}問正解）`],
    });
  });

  timeAttackStats.forEach((stat) => {
    const reason = `タイムアタックでよく間違えている（${stat.mistakeAppearances}/${stat.appearances}回ミス）`;
    const existing = statsBySongId.get(stat.songId);
    if (existing) {
      existing.reasons.push(reason);
      existing.severity = Math.min(existing.severity, stat.noMistakeRate);
    } else {
      statsBySongId.set(stat.songId, {
        songId: stat.songId,
        severity: stat.noMistakeRate,
        reasons: [reason],
      });
    }
  });

  return [...statsBySongId.values()].sort((a, b) => a.severity - b.severity);
}

// 通常プレイ・タイムアタック両方の最新の履歴から、統合済みの苦手曲判定を計算し直す。
// 「判定し直す」タイミングを画面の描画時・出題曲の決定時の両方で必要とするため、共通化している。
function getMergedWeakSongStats() {
  return mergeWeakSongStats(
    computeWeakSongs(getHistoryEntries()),
    computeTimeAttackWeakSongs(getTimeAttackHistoryEntries())
  );
}

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
  const weakSongStats = getMergedWeakSongStats();
  currentWeakSongs = weakSongStats
    .map((stat) => SONGS.find((song) => song.id === stat.songId))
    .filter((song) => song !== undefined); // データ不整合で曲が見つからない場合は除外する
  currentWeakSongReasons = new Map(weakSongStats.map((stat) => [stat.songId, stat.reasons]));

  const hasWeakSongs = currentWeakSongs.length > 0;
  elements.availableSection.hidden = !hasWeakSongs;
  elements.emptyState.hidden = hasWeakSongs;

  if (!hasWeakSongs) return;

  elements.countValue.textContent = currentWeakSongs.length;
  elements.allLabel.textContent = `全対象・${currentWeakSongs.length}問`;

  elements.chipRow.innerHTML = "";
  currentWeakSongs.forEach((song) => {
    const chip = document.createElement("div");
    chip.className = "weak-song-chip";

    const title = document.createElement("span");
    title.className = "weak-song-chip-title";
    title.textContent = song.title;
    chip.appendChild(title);

    const reasons = currentWeakSongReasons.get(song.id) ?? [];
    if (reasons.length > 0) {
      const reason = document.createElement("span");
      reason.className = "weak-song-chip-reason";
      reason.textContent = reasons.join("／");
      chip.appendChild(reason);
    }

    elements.chipRow.appendChild(chip);
  });

  updateCountNotice();
}

// 苦手曲を判定し直し、指定した出題数に応じて実際に出題する曲IDを返す。
// この画面の「開始する」だけでなく、結果画面の「もう一度挑戦する」（苦手曲判定を
// 再計算して再開する）からも呼べるよう、画面の表示状態に依存しない形にしている。
export function resolveWeakSongIds(questionCountValue) {
  const weakSongStats = getMergedWeakSongStats();
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
