// 歌詞クイズモードの「曲名を当てる」部分（回答候補の生成・採点）を担当する、
// UI・IndexedDBから完全に独立した純粋関数群。
// 歌詞本文そのものは一切扱わない（歌詞区間の生成・ヒント段階化はjs/lyricsSegmentEngine.js側の
// 責務。このファイルは「どの曲を回答候補として並べるか」「結果をどう比較するか」だけを扱う）。

import { createSeededRandom } from "./seededRandom.js";
import { computeQuestionRandomValue } from "./randomPlaybackEngine.js";

// 回答方式の選択肢。answerMode:"choices"は一覧からタップして選ぶ方式（4/10/30/50/all共通）、
// "search"は将来の拡張用に予約している値（本人の依頼にあった候補だが、MVPでは
// 「一覧から探す」方式に統一し、テキスト検索モードは未実装。値だけ先に定義しておく）。
export const LYRICS_QUIZ_ANSWER_MODE = {
  CHOICES: "choices",
  SEARCH: "search",
};

// answerPoolSizeの選択肢。"all"は「songPool全体」を意味する。
export const ANSWER_POOL_SIZE_VALUES = ["4", "10", "30", "50", "all"];

// 30択・50択・全曲では「検索付き・スクロール可能な曲一覧」にする、という本人の指示に
// 対応するため、UI側がこの値を見て一覧UIの見た目を切り替えられるようにしている
// （このファイル自体は見た目を決めない。あくまでUI側への判断材料）。
export const LARGE_ANSWER_POOL_THRESHOLD = 30;

function shuffleArray(array, randomFn) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomFn() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// answerPoolSizeの選択値（"4"|"10"|"30"|"50"|"all"）を、実際に使う回答候補数
// （正解込み）に変換する。songPoolがそれより少ない場合は、songPool全体を使う
// （本人の指示どおり。4択クイズのように「最低4曲必要」という下限は歌詞クイズには
// 設けない＝一覧から選ぶ方式のため、1曲しかなくても技術的には出題できる。
// ただし1曲だけだと自明に正解してしまうため、対戦開始可否の判定は呼び出し側
// 〈validateSettings相当〉で別途行う想定）。
export function resolveAnswerPoolSize(answerPoolSizeValue, songPoolSize) {
  if (answerPoolSizeValue === "all") return songPoolSize;
  const requested = Number(answerPoolSizeValue);
  if (!Number.isFinite(requested) || requested <= 0) return songPoolSize;
  return Math.min(requested, songPoolSize);
}

// songPool（出題対象となりうる曲一覧、song.idを持つオブジェクトの配列）・正解曲id・
// 回答候補数から、「正解1曲＋重複のない誤答」の回答候補一覧を作る（正解曲は必ず1件、
// 誤答側に正解曲が混入することもない）。
// randomFnは「0以上1未満の乱数を返す関数」。省略時はMath.random（1人用途向け）。
// オンライン対戦ではcreateAnswerPoolRandom()で作った決定論的な関数を渡すこと。
export function generateAnswerPool(songPool, correctSongId, answerPoolSizeValue, randomFn = Math.random) {
  const correctSong = songPool.find((song) => song.id === correctSongId);
  if (!correctSong) return [];

  const poolSize = resolveAnswerPoolSize(answerPoolSizeValue, songPool.length);
  const distractorCount = Math.max(0, poolSize - 1);

  const distractorCandidates = songPool.filter((song) => song.id !== correctSongId);
  const distractors = shuffleArray(distractorCandidates, randomFn).slice(0, distractorCount);

  return shuffleArray([correctSong, ...distractors], randomFn);
}

// オンライン対戦用：seed・songId・questionIndexから、generateAnswerPool()にそのまま
// 渡せる「決定論的な乱数関数」を作る。全端末が同じ入力から同じ関数（＝同じ乱数列）を
// 再現できるため、回答候補の並び順が全端末で一致する。
// js/lyricsSegmentEngine.jsのpickPrimarySegment()と乱数の出どころが混ざらないよう、
// songIdに用途を表す文字列（":answerPool"）を足してからハッシュ化している。
export function createAnswerPoolRandom(seed, songId, questionIndex) {
  const seedSourceValue = computeQuestionRandomValue(seed, `${songId}:answerPool`, questionIndex);
  const integerSeed = Math.floor(seedSourceValue * 0xffffffff) >>> 0;
  return createSeededRandom(integerSeed);
}

// 1問分の解答結果の形（呼び出し側〈画面側〉が組み立てて渡す想定）：
// { songId, isCorrect, hintsUsedCount, elapsedMs }
//   hintsUsedCount: 正解/不正解の時点で「見えていたヒントの段階数」（最小1）

// 複数問の解答結果から、1人分の集計済み結果を作る。
// 1人用MVPの結果表示、オンライン対戦のランキング比較（compareLyricsQuizResults）の
// どちらにもこの戻り値をそのまま使える。
export function createLyricsQuizResult(answers) {
  const totalQuestions = answers.length;
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const missCount = totalQuestions - correctCount;
  const totalHintsUsed = answers.reduce((sum, answer) => sum + answer.hintsUsedCount, 0);
  const firstHintCorrectCount = answers.filter(
    (answer) => answer.isCorrect && answer.hintsUsedCount === 1
  ).length;
  const totalElapsedMs = answers.reduce((sum, answer) => sum + answer.elapsedMs, 0);

  return {
    totalQuestions,
    correctCount,
    missCount,
    totalHintsUsed,
    averageHintsUsed: totalQuestions > 0 ? totalHintsUsed / totalQuestions : 0,
    firstHintCorrectCount,
    totalElapsedMs,
  };
}

// 2人分の集計結果（createLyricsQuizResult()の戻り値）を比較し、順位を決める。
// 優先順位（本人の指示どおり）：
//   1. 正解数が多い方が上位
//   2. 合計ヒント使用数が少ない方が上位
//   3. ヒント1だけで正解した回数が多い方が上位
//   4. 経過時間（totalElapsedMs）が短い方が上位
//   5. ミス数が少ない方が上位
// resultAが上位なら負の値、resultBが上位なら正の値、完全に同順位なら0を返す
// （Array.prototype.sortの比較関数としてそのまま使える。js/battleModes/index.jsの
// compareBattleResults()と同じ戻り値の規約に合わせている）。
export function compareLyricsQuizResults(resultA, resultB) {
  if (resultA.correctCount !== resultB.correctCount) {
    return resultB.correctCount - resultA.correctCount;
  }
  if (resultA.totalHintsUsed !== resultB.totalHintsUsed) {
    return resultA.totalHintsUsed - resultB.totalHintsUsed;
  }
  if (resultA.firstHintCorrectCount !== resultB.firstHintCorrectCount) {
    return resultB.firstHintCorrectCount - resultA.firstHintCorrectCount;
  }
  if (resultA.totalElapsedMs !== resultB.totalElapsedMs) {
    return resultA.totalElapsedMs - resultB.totalElapsedMs;
  }
  return resultA.missCount - resultB.missCount;
}
