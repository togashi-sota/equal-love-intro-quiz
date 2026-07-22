// 出題プールの絞り込み・シャッフル・4択生成を担当するファイル。

import { CATEGORY } from "./data/songs.js";

// 1問を作るのに最低限必要な曲数（正解1つ＋ダミー3つ＝4曲）。
const MIN_SONGS_REQUIRED = 4;

// カテゴリの選択値（"all" | "title-track"）に応じて曲を絞り込む。
export function filterSongsByCategory(songs, categoryFilterValue) {
  if (categoryFilterValue === "title-track") {
    return songs.filter((song) => song.category === CATEGORY.TITLE_TRACK);
  }
  return songs;
}

// 曲プールに対して、出題数の選択値（"5" | "10" | "all"）を実際の問題数に変換する。
// プールの曲数より多い数は選べないので、プールの曲数で上限を切る。
export function resolveQuestionCount(questionCountValue, poolSize) {
  if (questionCountValue === "all") {
    return poolSize;
  }
  const requestedCount = Number(questionCountValue);
  return Math.min(requestedCount, poolSize);
}

// プールが4曲未満なら、4択クイズを作れないのでエラーメッセージを返す。
// 問題なければ null を返す。
export function validatePoolSize(pool) {
  if (pool.length < MIN_SONGS_REQUIRED) {
    return "曲数が足りません。カテゴリの範囲を広げてください。";
  }
  return null;
}

// 配列をシャッフルした「新しい配列」を返す（元の配列は書き換えない）。
// Fisher–Yatesアルゴリズムを使い、どの並び順も同じ確率で出るようにしている。
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// プールをシャッフルし、先頭から count 曲を「出題する曲」として取り出す。
export function pickQuestionSongs(pool, count) {
  return shuffleArray(pool).slice(0, count);
}

// 正解の曲とプール全体から、4択の選択肢（正解1つ＋ダミー3つ）を作る。
export function generateChoices(correctSong, pool) {
  const distractorCandidates = pool.filter((song) => song.id !== correctSong.id);
  const distractors = shuffleArray(distractorCandidates).slice(0, 3);
  return shuffleArray([correctSong, ...distractors]);
}

// 出題する曲一覧から、クイズ画面で使う問題データ（{ song, choices } の配列）を作る。
export function buildQuizQuestions(pool, count) {
  const questionSongs = pickQuestionSongs(pool, count);
  return questionSongs.map((song) => ({
    song,
    choices: generateChoices(song, pool),
  }));
}
