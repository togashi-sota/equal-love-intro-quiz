// 苦手曲モードの確認画面を担当するファイル。
// 「4モード合算で3回以上答えていて、正答率75%未満」の対象曲を一覧表示し、
// 出題数を選んでから開始できる。判定ロジック自体はjs/weakSongStats.jsに任せ、
// ここでは画面の組み立てと、選ばれた出題数から実際に出題する曲IDを決めるところまでを行う。
// クイズを実際に組み立てて開始する処理（曲IDの配列を受け取る汎用エンジン）はmain.js側が担当する。
//
// 【2026-08-16改修、本人指示】以前は通常プレイ・タイムアタックの「完走したプレイの履歴」だけを
// 別々の基準（正誤の比率／ミス回数の比率）で判定してからmergeWeakSongStats()で統合していたが、
// ①通常のランダム再生クイズが判定に含まれていなかった、②途中で「タイトルへ」戻って中断した
// プレイの回答が一切反映されなかった、という2つの問題があった。
// 今回、js/weakSongStats.jsが「答えた瞬間ごとに曲別の合計回答数・正解数を記録する」専用の
// データを持つようになったため、ここでは1種類の指標（正答率）だけを扱えばよくなった。
//
// 【2026-08-29追加、本人指示】この画面をモードA（イントロ・タイムアタック・ランダム再生の
// 合算、既存）／モードB（歌詞クイズだけを対象にした別判定、新設）の2択タブに拡張した。
// 判定・記録は完全に別々のデータ（js/weakSongStats.js／js/lyricsQuizWeakSongStats.js）を使い、
// 一切混ざらない。曲一覧・出題数選択・「開始する」ボタンの見た目とロジックは、どちらの
// モードでも同じUI要素をそのまま使い回し（本人指示：見た目・操作感を揃える）、
// 表示内容と「開始する」の送り先だけをモードに応じて切り替える。
import { SONGS } from "./data/songs.js";
import { getWeakSongStats, computeWeakSongsFromStats } from "./weakSongStats.js";
import { computeLyricsQuizWeakSongs } from "./lyricsQuizWeakSongStats.js";
import { resolveQuestionCount } from "./quiz.js";

// この画面が使うDOM要素一式。initWeakSongsScreen()で受け取って保持する。
let elements = null;

// 現在選ばれているモード。"intro"＝既存のモードA、"lyrics"＝新設のモードB。
let currentMode = "intro";

// 今表示している対象曲（songオブジェクトの配列）。出題数の案内表示や、
// 開始ボタンが押されたときの出題曲決定に使う。
let currentWeakSongs = [];
// songId→「なぜ苦手曲として選ばれたか」の理由文の配列。チップの表示にだけ使う
// （出題曲の決定ロジックには影響しない、あくまで説明用のデータ）。
let currentWeakSongReasons = new Map();

// モードごとの表示文言・回答方式のデフォルト値をまとめた対応表。
// answerPoolSizeValueは、歌詞クイズ版の練習で使う回答候補数。専用の選択UIは設けず
// （本人指示の範囲外の追加UIを増やさない判断）、繰り返し練習という目的に合わせて
// 最も取り組みやすい4択に固定する（本人へは最終報告で判断理由として明記する）。
const MODE_CONFIG = {
  intro: {
    explanation:
      "間違えやすい曲を自動で集めて、繰り返し練習できます。イントロ・タイムアタック・ランダム再生、4つのモードの結果を曲ごとに合算して判定します。",
    reasonPrefix: "4モード合算",
  },
  lyrics: {
    explanation: "歌詞クイズだけの結果を対象に、間違えやすい曲を自動で集めて練習できます（イントロ側とは別の判定です）。",
    reasonPrefix: "歌詞クイズのみ",
    answerPoolSizeValue: "4",
  },
};

// 現在のモードに応じた「判定済み苦手曲」を、画面表示に使う形（severity・reasons付き）で返す。
// severityは「0に近いほど苦手」という意味で使う。
function getMergedWeakSongStats() {
  const stats = currentMode === "lyrics" ? computeLyricsQuizWeakSongs() : computeWeakSongsFromStats(getWeakSongStats());
  const reasonPrefix = MODE_CONFIG[currentMode].reasonPrefix;
  return stats.map((stat) => {
    const accuracyPercent = Math.round(stat.accuracy * 100);
    return {
      songId: stat.songId,
      severity: stat.accuracy,
      reasons: [`${reasonPrefix}で正答率${accuracyPercent}%（${stat.correct}/${stat.attempts}問正解）`],
    };
  });
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

// モードタブの見た目（is-active）とaria-selectedを更新する。
function updateModeTabAppearance() {
  elements.modeIntroButton.classList.toggle("is-active", currentMode === "intro");
  elements.modeIntroButton.setAttribute("aria-selected", String(currentMode === "intro"));
  elements.modeLyricsButton.classList.toggle("is-active", currentMode === "lyrics");
  elements.modeLyricsButton.setAttribute("aria-selected", String(currentMode === "lyrics"));
  elements.explanation.textContent = MODE_CONFIG[currentMode].explanation;
}

function handleModeIntroClick() {
  if (currentMode === "intro") return;
  currentMode = "intro";
  updateModeTabAppearance();
  renderWeakSongsScreen();
}

function handleModeLyricsClick() {
  if (currentMode === "lyrics") return;
  currentMode = "lyrics";
  updateModeTabAppearance();
  renderWeakSongsScreen();
}

// 画面を開くたびに呼び、最新のプレイ履歴から苦手曲を判定し直して表示する。
// 【2026-08-29改訂】モードを切り替えた場合はintro（モードA）に戻さず、今選ばれている
// モードのまま再描画する（呼び出し元のjs/main.jsのgoToWeakSongsScreenが画面を開くたびに
// 呼ぶため、モードを勝手にリセットすると選び直しの手間が生まれてしまう）。
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

// 苦手曲を判定し直し、指定した出題数に応じて実際に出題する曲IDを返す（モードAだけが対象。
// js/main.jsのretrySpecialQuiz()から呼ばれる、既存の仕様のまま）。
export function resolveWeakSongIds(questionCountValue) {
  const weakSongStats = computeWeakSongsFromStats(getWeakSongStats());
  const weakSongs = weakSongStats
    .map((stat) => SONGS.find((song) => song.id === stat.songId))
    .filter((song) => song !== undefined);
  const actualCount = resolveQuestionCount(questionCountValue, weakSongs.length);
  return weakSongs.slice(0, actualCount).map((song) => song.id);
}

// 「開始する」が押されたときの処理。選ばれた出題数と、今表示している対象曲から
// 実際に出題する曲IDを決め、モードに応じたコールバックに渡す（実際にクイズを組み立てて
// 開始する処理はmain.js側の汎用エンジンが担当する）。
function handleStart() {
  const questionCountValue = document.querySelector('input[name="weak-songs-question-count"]:checked').value;
  const actualCount = resolveQuestionCount(questionCountValue, currentWeakSongs.length);
  const songIds = currentWeakSongs.slice(0, actualCount).map((song) => song.id);

  if (currentMode === "lyrics") {
    elements.onStartLyrics(songIds, MODE_CONFIG.lyrics.answerPoolSizeValue);
    return;
  }
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
//   explanation: モード説明文の要素（2026-08-29追加）,
//   modeIntroButton, modeLyricsButton: A/B切り替えタブ（2026-08-29追加）,
//   onStart: 開始ボタンが押されたときに呼ばれるコールバック（モードA）。(songIds, questionCountValue)を受け取る,
//   onStartLyrics: 開始ボタンが押されたときに呼ばれるコールバック（モードB、2026-08-29追加）。
//     (songIds, answerPoolSizeValue)を受け取る,
// }
export function initWeakSongsScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", handleStart);
  elements.modeIntroButton.addEventListener("click", handleModeIntroClick);
  elements.modeLyricsButton.addEventListener("click", handleModeLyricsClick);
  document
    .querySelectorAll('input[name="weak-songs-question-count"]')
    .forEach((radio) => radio.addEventListener("change", updateCountNotice));
}
