// 出題プールの絞り込み・シャッフル・4択生成を担当するファイル。

import { CATEGORY, SONGS } from "./data/songs.js";

// 1問を作るのに最低限必要な曲数（正解1つ＋ダミー3つ＝4曲）。
// オリジナル問題作成モード（customQuizScreen.js）でも、選択曲だけをダミー選択肢の
// プールにする場合の下限として同じ値を使うため、外部公開している。
export const MIN_SONGS_REQUIRED = 4;

// カテゴリの選択値（"all" | "title-and-group" | "title-track"）に応じて曲を絞り込む。
// title-track      : 表題曲のみ
// title-and-group  : 表題曲＋全員曲（ユニット曲を除く）
// all              : 絞り込みなし（ユニット曲も含む全曲）
export function filterSongsByCategory(songs, categoryFilterValue) {
  if (categoryFilterValue === "title-track") {
    return songs.filter((song) => song.category === CATEGORY.TITLE_TRACK);
  }
  if (categoryFilterValue === "title-and-group") {
    return songs.filter(
      (song) => song.category === CATEGORY.TITLE_TRACK || song.category === CATEGORY.GROUP_SONG
    );
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

// 曲プールを、音源が読み込み済みの曲だけに絞り込む（純粋関数）。
// importedSongIdsは、この端末にIndexedDBで保存済みの曲idの集合（Set推奨。配列でも可）。
// 本人指示（2026-08-15）：音源（歌詞クイズの場合は歌詞）を読み込んでいない曲は、
// 出題にも4択の選択肢にも一切出さない。実際にIndexedDBへアクセスする部分は
// js/audioStorage.jsのfilterSongsWithImportedAudio()が担当し、この関数自体は
// IndexedDBに触れない（tests/quiz.test.jsでそのままテストできるようにするため）。
export function filterSongsByAvailableAudio(songs, importedSongIds) {
  const importedSet = importedSongIds instanceof Set ? importedSongIds : new Set(importedSongIds);
  return songs.filter((song) => importedSet.has(song.id));
}

// 音源を読み込み済みの曲だけで4択クイズを作れるかを検証する。
// validatePoolSize（カテゴリの絞り込みが原因）とはメッセージを分け、
// 「音源を読み込めば解決する」ことが伝わるようにする。
export function validatePlayablePoolSize(pool) {
  if (pool.length < MIN_SONGS_REQUIRED) {
    return "音源を読み込んだ曲が足りません。スタート画面の「音源を読み込む」から曲を追加するか、カテゴリの範囲を広げてください。";
  }
  return null;
}

// 配列をシャッフルした「新しい配列」を返す（元の配列は書き換えない）。
// Fisher–Yatesアルゴリズムを使い、どの並び順も同じ確率で出るようにしている。
//
// randomは「0以上1未満の乱数を返す関数」。デフォルトはMath.randomのため、
// 引数を渡さない既存の呼び出し元（通常プレイ・タイムアタック・苦手曲モード等）は
// 今までと完全に同じ動作のまま変わらない。対戦モードだけ、js/seededRandom.jsで作った
// 「シードから毎回同じ乱数列を返す関数」を渡すことで、全端末で同じ並び順を再現できる
// （2026-08-06、対戦モードのために追加）。
function shuffleArray(array, random = Math.random) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// プールをシャッフルし、先頭から count 曲を「出題する曲」として取り出す。
export function pickQuestionSongs(pool, count, random = Math.random) {
  return shuffleArray(pool, random).slice(0, count);
}

// 正解の曲とプール全体から、4択の選択肢（正解1つ＋ダミー3つ）を作る。
export function generateChoices(correctSong, pool, random = Math.random) {
  const distractorCandidates = pool.filter((song) => song.id !== correctSong.id);
  const distractors = shuffleArray(distractorCandidates, random).slice(0, 3);
  return shuffleArray([correctSong, ...distractors], random);
}

// 出題する曲一覧から、クイズ画面で使う問題データ（{ song, choices } の配列）を作る。
export function buildQuizQuestions(pool, count, random = Math.random) {
  const questionSongs = pickQuestionSongs(pool, count, random);
  return questionSongs.map((song) => ({
    song,
    choices: generateChoices(song, pool, random),
  }));
}

// 復習クイズの問題を作る。通常のbuildQuizQuestionsと違い、「出題する曲」と
// 「ダミー選択肢を選ぶ元になるプール」を別々に受け取る。
// 復習対象（questionSongs）は間違えた曲がそのまま渡される想定で、件数による間引きは行わない
// （4曲未満でも4択が成立するよう、ダミーは常により大きいdistractorPoolから選ぶため）。
// generateChoices自体は通常のクイズと完全に共用し、変更しない。
export function buildReviewQuizQuestions(questionSongs, distractorPool) {
  const shuffledQuestionSongs = shuffleArray(questionSongs);
  return shuffledQuestionSongs.map((song) => ({
    song,
    choices: generateChoices(song, distractorPool),
  }));
}

// 曲IDの配列から、クイズの問題データ（{ song, choices } の配列）を組み立てる。
// 苦手曲モード・将来のオリジナル問題作成モードなど、「曲IDの配列を渡してクイズを始める」系の
// 特別モード全般で共通して使う想定の汎用エンジン。「どの曲を選ぶか」は呼び出し側の責務とし、
// ここでは選ばれた曲IDをsongs.jsの曲データに引き直し、buildReviewQuizQuestions（既存、
// 出題対象とダミー選択肢のプールを別々に扱える）にそのまま渡すだけに専念する。
export function buildQuestionsFromSongIds(songIds, distractorPool) {
  const questionSongs = songIds
    .map((songId) => SONGS.find((song) => song.id === songId))
    .filter((song) => song !== undefined); // データ不整合で曲が見つからない場合は除外する
  return buildReviewQuizQuestions(questionSongs, distractorPool);
}
