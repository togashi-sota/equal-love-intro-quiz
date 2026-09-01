// 苦手曲モードの確認画面を担当するファイル。
// 「3回以上答えていて、正答率75%未満」の対象曲を一覧表示し、出題数（一瞬タブだけは
// 再生時間・回答方式も）を選んでから開始できる。判定ロジック自体は各モード専用の
// 苦手曲統計ファイルに任せ、ここでは画面の組み立てと、選ばれた設定から実際に出題する
// 曲IDを決めるところまでを行う。クイズを実際に組み立てて開始する処理はmain.js側が担当する。
//
// 【2026-08-16改修、本人指示】以前は通常プレイ・タイムアタックの「完走したプレイの履歴」だけを
// 別々の基準（正誤の比率／ミス回数の比率）で判定してからmergeWeakSongStats()で統合していたが、
// ①通常のランダム再生クイズが判定に含まれていなかった、②途中で「タイトルへ」戻って中断した
// プレイの回答が一切反映されなかった、という2つの問題があった。
// 今回、js/weakSongStats.jsが「答えた瞬間ごとに曲別の合計回答数・正解数を記録する」専用の
// データを持つようになったため、ここでは1種類の指標（正答率）だけを扱えばよくなった。
//
// 【2026-08-30全面改訂、本人指示：苦手曲モードを5系統へ完全分離】以前は「イントロ・
// ランダム再生の合算（モードA）」「歌詞クイズ（モードB）」の2択タブだったが、実際の不具合
// （①通常のランダム再生クイズがモードAの判定に含まれていなかった、②どの苦手曲を選んでも
// 練習は常にイントロ形式で再生されていた）が見つかったため、5系統（イントロ／アウトロ／
// シャッフル／リリック／一瞬）を完全に独立させた。判定・記録は5つとも完全に別々のデータ
// （js/weakSongStats.js・js/outroWeakSongStats.js・js/shuffleWeakSongStats.js・
// js/lyricsQuizWeakSongStats.js・js/instantChallengeWeakSongStats.js）を使い、一切混ざらない。
// 練習の再生形式も、選んだタブに対応する本来の形式（アウトロなら5秒、シャッフルならランダム
// 位置、一瞬なら一瞬チャレンジ形式）に必ず一致させる（js/main.jsのrenderQuestion()・
// beginWeakSongsOutroPractice()・beginWeakSongsShufflePractice()参照）。
import { SONGS } from "./data/songs.js";
import { getWeakSongStats, computeWeakSongsFromStats } from "./weakSongStats.js";
import { getOutroWeakSongStats } from "./outroWeakSongStats.js";
import { getShuffleWeakSongStats } from "./shuffleWeakSongStats.js";
import { computeLyricsQuizWeakSongs } from "./lyricsQuizWeakSongStats.js";
import { computeInstantChallengeWeakSongs } from "./instantChallengeWeakSongStats.js";
import { resolveQuestionCount } from "./quiz.js";
import { attemptSilentUnlock } from "./audio.js";

// この画面が使うDOM要素一式。initWeakSongsScreen()で受け取って保持する。
let elements = null;

// 現在選ばれているモード。"intro"|"outro"|"shuffle"|"lyrics"|"instant"。
let currentMode = "intro";

// 今表示している対象曲（songオブジェクトの配列）。出題数の案内表示や、
// 開始ボタンが押されたときの出題曲決定に使う。
let currentWeakSongs = [];
// songId→「なぜ苦手曲として選ばれたか」の理由文の配列。チップの表示にだけ使う
// （出題曲の決定ロジックには影響しない、あくまで説明用のデータ）。
let currentWeakSongReasons = new Map();

// モードごとの表示文言・回答方式のデフォルト値をまとめた対応表。
// 歌詞クイズ・一瞬チャレンジの回答方式は、繰り返し練習という目的に合わせて
// もっとも取り組みやすい4択をデフォルトにする（一瞬は下のfieldsetで変更もできる）。
const MODE_CONFIG = {
  intro: {
    explanation: "間違えやすい曲を自動で集めて、繰り返し練習できます。イントロ・イントロタイムアタックの結果を曲ごとに合算して判定します。",
    reasonPrefix: "イントロ",
  },
  outro: {
    explanation: "アウトロクイズだけの結果を対象に、間違えやすい曲を自動で集めて練習できます（他の系統とは別の判定です）。",
    reasonPrefix: "アウトロ",
  },
  shuffle: {
    explanation: "ランダム再生クイズ・ランダム再生タイムアタックの結果を対象に、間違えやすい曲を自動で集めて練習できます（他の系統とは別の判定です）。",
    reasonPrefix: "シャッフル",
  },
  lyrics: {
    explanation: "歌詞クイズだけの結果を対象に、間違えやすい曲を自動で集めて練習できます（他の系統とは別の判定です）。",
    reasonPrefix: "リリック",
    answerPoolSizeValue: "4",
  },
  instant: {
    explanation: "一瞬チャレンジだけの結果を対象に、間違えやすい曲を自動で集めて練習できます（他の系統とは別の判定です）。再生時間・回答方式も選べます。",
    reasonPrefix: "一瞬",
  },
};

const MODE_STATS_RESOLVERS = {
  intro: () => computeWeakSongsFromStats(getWeakSongStats()),
  outro: () => computeWeakSongsFromStats(getOutroWeakSongStats()),
  shuffle: () => computeWeakSongsFromStats(getShuffleWeakSongStats()),
  lyrics: () => computeLyricsQuizWeakSongs(),
  instant: () => computeInstantChallengeWeakSongs(),
};

// 現在のモードに応じた「判定済み苦手曲」を、画面表示に使う形（severity・reasons付き）で返す。
// severityは「0に近いほど苦手」という意味で使う。
function getMergedWeakSongStats() {
  const stats = MODE_STATS_RESOLVERS[currentMode]();
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
  const questionCountValue = getSelectedQuestionCountValue();
  const actualCount = resolveQuestionCount(questionCountValue, currentWeakSongs.length);

  if (questionCountValue !== "all" && Number(questionCountValue) > currentWeakSongs.length) {
    elements.countNotice.textContent =
      `対象曲が${currentWeakSongs.length}曲のため、実際は${actualCount}問になります`;
    elements.countNotice.hidden = false;
  } else {
    elements.countNotice.hidden = true;
  }
}

// 現在のモードに応じた出題数の選択値を返す（一瞬タブだけ専用のラジオを見る）。
function getSelectedQuestionCountValue() {
  const radioName = currentMode === "instant" ? "weak-songs-instant-question-count" : "weak-songs-question-count";
  return document.querySelector(`input[name="${radioName}"]:checked`).value;
}

// モードタブの見た目（is-active）とaria-selectedを更新し、モードに応じて
// 出題数・再生時間・回答方式のfieldsetを出し分ける。
function updateModeTabAppearance() {
  const buttonsByMode = {
    intro: elements.modeIntroButton,
    outro: elements.modeOutroButton,
    shuffle: elements.modeShuffleButton,
    lyrics: elements.modeLyricsButton,
    instant: elements.modeInstantButton,
  };
  Object.entries(buttonsByMode).forEach(([mode, button]) => {
    button.classList.toggle("is-active", currentMode === mode);
    button.setAttribute("aria-selected", String(currentMode === mode));
  });
  elements.explanation.textContent = MODE_CONFIG[currentMode].explanation;

  const isInstant = currentMode === "instant";
  elements.questionCountFieldset.hidden = isInstant;
  elements.instantDurationFieldset.hidden = !isInstant;
  elements.instantAnswerPoolFieldset.hidden = !isInstant;
  elements.instantQuestionCountFieldset.hidden = !isInstant;
}

function handleModeButtonClick(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  updateModeTabAppearance();
  renderWeakSongsScreen();
}

// 画面を開くたびに呼び、最新のプレイ履歴から苦手曲を判定し直して表示する。
// 【2026-08-29改訂】モードを切り替えた場合はintroに戻さず、今選ばれているモードのまま
// 再描画する（呼び出し元のjs/main.jsのgoToWeakSongsScreenが画面を開くたびに呼ぶため、
// モードを勝手にリセットすると選び直しの手間が生まれてしまう）。
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

// 苦手曲を判定し直し、指定した出題数に応じて実際に出題する曲IDを返す（イントロタブだけが
// 対象。js/main.jsのretrySpecialQuiz()から呼ばれる、既存の仕様のまま）。
export function resolveWeakSongIds(questionCountValue) {
  const weakSongStats = computeWeakSongsFromStats(getWeakSongStats());
  const weakSongs = weakSongStats
    .map((stat) => SONGS.find((song) => song.id === stat.songId))
    .filter((song) => song !== undefined);
  const actualCount = resolveQuestionCount(questionCountValue, weakSongs.length);
  return weakSongs.slice(0, actualCount).map((song) => song.id);
}

// アウトロタブ版のresolveWeakSongIds（js/main.jsのretrySpecialQuiz()「weakSongsOutro」から呼ぶ）。
export function resolveOutroWeakSongIds(questionCountValue) {
  const weakSongStats = computeWeakSongsFromStats(getOutroWeakSongStats());
  const weakSongs = weakSongStats
    .map((stat) => SONGS.find((song) => song.id === stat.songId))
    .filter((song) => song !== undefined);
  const actualCount = resolveQuestionCount(questionCountValue, weakSongs.length);
  return weakSongs.slice(0, actualCount).map((song) => song.id);
}

// シャッフルタブ版のresolveWeakSongIds（js/main.jsのretrySpecialQuiz()「weakSongsShuffle」から呼ぶ）。
export function resolveShuffleWeakSongIds(questionCountValue) {
  const weakSongStats = computeWeakSongsFromStats(getShuffleWeakSongStats());
  const weakSongs = weakSongStats
    .map((stat) => SONGS.find((song) => song.id === stat.songId))
    .filter((song) => song !== undefined);
  const actualCount = resolveQuestionCount(questionCountValue, weakSongs.length);
  return weakSongs.slice(0, actualCount).map((song) => song.id);
}

// 「開始する」が押されたときの処理。選ばれた出題数（一瞬タブは再生時間・回答方式も）と、
// 今表示している対象曲から実際に出題する曲IDを決め、モードに応じたコールバックに渡す
// （実際にクイズを組み立てて開始する処理はmain.js側のエンジンが担当する）。
function handleStart() {
  // 【2026-09-15追加・本人指示：アプリ起動後最初の第1問だけ無音になるバグ対策】
  // 歌詞（lyrics）タブはヒント表示だけで音源を再生しないため無害だが、他タブ
  // （intro/outro/shuffle/instant）はすべて実際に曲を再生するため一律で呼んでおく。
  attemptSilentUnlock();
  const questionCountValue = getSelectedQuestionCountValue();
  const actualCount = resolveQuestionCount(questionCountValue, currentWeakSongs.length);
  const songIds = currentWeakSongs.slice(0, actualCount).map((song) => song.id);

  if (currentMode === "outro") {
    elements.onStartOutro(songIds, questionCountValue);
    return;
  }
  if (currentMode === "shuffle") {
    elements.onStartShuffle(songIds, questionCountValue);
    return;
  }
  if (currentMode === "lyrics") {
    elements.onStartLyrics(songIds, MODE_CONFIG.lyrics.answerPoolSizeValue);
    return;
  }
  if (currentMode === "instant") {
    // 【重要】一瞬タブだけは、出題数ぶんに絞り込んだsongIdsではなく対象曲全部
    // （currentWeakSongs）を渡す。一瞬チャレンジの回答候補（4/10/全曲検索）は出題対象曲
    // そのものから作られるため、出題数より少ない曲数を渡すと回答候補を作るための曲数が
    // 足りなくなってしまう（js/instantChallengeScreen.jsのbuildAndStartRun()が、渡された
    // 曲プールの中から実際に出題するquestionCount問を選ぶ設計のため）。
    const playDurationValue = document.querySelector('input[name="weak-songs-instant-play-duration"]:checked').value;
    const answerPoolSizeValue = document.querySelector('input[name="weak-songs-instant-answer-pool-size"]:checked').value;
    const allWeakSongIds = currentWeakSongs.map((song) => song.id);
    elements.onStartInstant(allWeakSongIds, { playDurationValue, answerPoolSizeValue, questionCountValue });
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
//   explanation: モード説明文の要素,
//   modeIntroButton, modeOutroButton, modeShuffleButton, modeLyricsButton, modeInstantButton: 5タブ,
//   questionCountFieldset: 通常4系統用の出題数fieldset,
//   instantDurationFieldset, instantAnswerPoolFieldset, instantQuestionCountFieldset: 一瞬専用fieldset,
//   onStart: 開始ボタンが押されたときに呼ばれるコールバック（イントロ）。(songIds, questionCountValue)を受け取る,
//   onStartOutro: 開始ボタンが押されたときに呼ばれるコールバック（アウトロ）。(songIds, questionCountValue)を受け取る,
//   onStartShuffle: 開始ボタンが押されたときに呼ばれるコールバック（シャッフル）。(songIds, questionCountValue)を受け取る,
//   onStartLyrics: 開始ボタンが押されたときに呼ばれるコールバック（リリック）。(songIds, answerPoolSizeValue)を受け取る,
//   onStartInstant: 開始ボタンが押されたときに呼ばれるコールバック（一瞬）。
//     (songIds, { playDurationValue, answerPoolSizeValue, questionCountValue })を受け取る,
// }
export function initWeakSongsScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", handleStart);
  elements.modeIntroButton.addEventListener("click", () => handleModeButtonClick("intro"));
  elements.modeOutroButton.addEventListener("click", () => handleModeButtonClick("outro"));
  elements.modeShuffleButton.addEventListener("click", () => handleModeButtonClick("shuffle"));
  elements.modeLyricsButton.addEventListener("click", () => handleModeButtonClick("lyrics"));
  elements.modeInstantButton.addEventListener("click", () => handleModeButtonClick("instant"));
  document
    .querySelectorAll('input[name="weak-songs-question-count"], input[name="weak-songs-instant-question-count"]')
    .forEach((radio) => radio.addEventListener("change", updateCountNotice));
}
