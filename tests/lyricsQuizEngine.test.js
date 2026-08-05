// js/lyricsQuizEngine.js（歌詞クイズの回答候補生成・採点）のテスト。
// 歌詞本文は一切扱わないファイルのため、テストデータも曲名・曲idのダミー値のみ。

import {
  resolveAnswerPoolSize,
  generateAnswerPool,
  createAnswerPoolRandom,
  createLyricsQuizResult,
  compareLyricsQuizResults,
} from "../js/lyricsQuizEngine.js";
import { assertEqual } from "./test-utils.js";

function buildDummySongPool(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `song-${i}`, title: `曲${i}` }));
}

export function runLyricsQuizEngineTests() {
  // ===== resolveAnswerPoolSize() =====

  assertEqual(resolveAnswerPoolSize("4", 81), 4, "\"4\" → 4件");
  assertEqual(resolveAnswerPoolSize("50", 81), 50, "\"50\" → 50件");
  assertEqual(resolveAnswerPoolSize("all", 81), 81, "\"all\" → songPool全体の件数");
  assertEqual(resolveAnswerPoolSize("50", 10), 10, "songPoolが50件より少ない場合はsongPool全体の件数に縮退する");
  assertEqual(resolveAnswerPoolSize("invalid", 20), 20, "不正な値 → songPool全体の件数にフォールバック");
  assertEqual(resolveAnswerPoolSize("0", 20), 20, "0以下の値 → songPool全体の件数にフォールバック");

  // ===== generateAnswerPool() =====

  {
    const pool = buildDummySongPool(20);
    const answerPool = generateAnswerPool(pool, "song-5", "4", () => 0.5);
    assertEqual(answerPool.length, 4, "回答候補数は指定どおり4件になる");
    assertEqual(
      answerPool.some((song) => song.id === "song-5"),
      true,
      "正解の曲が回答候補に含まれる"
    );
    const uniqueIds = new Set(answerPool.map((song) => song.id));
    assertEqual(uniqueIds.size, answerPool.length, "回答候補に重複がない");
  }

  {
    const pool = buildDummySongPool(3);
    const answerPool = generateAnswerPool(pool, "song-0", "10", () => 0.5);
    assertEqual(answerPool.length, 3, "songPoolが要求件数より少ない場合はsongPool全体の件数になる");
  }

  {
    const pool = buildDummySongPool(10);
    const answerPool = generateAnswerPool(pool, "not-in-pool", "4", () => 0.5);
    assertEqual(answerPool, [], "正解曲がsongPoolに存在しない → 空配列");
  }

  {
    // 同じ乱数列（常に0を返す）を使えば、生成される回答候補の並び順も毎回同じになる。
    const pool = buildDummySongPool(20);
    const poolA = generateAnswerPool(pool, "song-5", "10", () => 0);
    const poolB = generateAnswerPool(pool, "song-5", "10", () => 0);
    assertEqual(
      poolA.map((s) => s.id),
      poolB.map((s) => s.id),
      "同じ乱数関数（決定論的）を使えば、回答候補の並び順も毎回一致する"
    );
  }

  // ===== createAnswerPoolRandom() =====

  {
    const randomA = createAnswerPoolRandom(555, "song-x", 2);
    const randomB = createAnswerPoolRandom(555, "song-x", 2);
    const sequenceA = [randomA(), randomA(), randomA()];
    const sequenceB = [randomB(), randomB(), randomB()];
    assertEqual(sequenceA, sequenceB, "同じseed・songId・questionIndexなら同じ乱数列を再現する");

    const randomC = createAnswerPoolRandom(555, "song-y", 2);
    assertEqual(randomA() === randomC(), false, "songIdが違えば乱数列も変わる（衝突しない）");
  }

  // ===== createLyricsQuizResult() =====

  {
    const answers = [
      { songId: "a", isCorrect: true, hintsUsedCount: 1, elapsedMs: 3000 },
      { songId: "b", isCorrect: true, hintsUsedCount: 2, elapsedMs: 4000 },
      { songId: "c", isCorrect: false, hintsUsedCount: 4, elapsedMs: 6000 },
    ];
    const result = createLyricsQuizResult(answers);
    assertEqual(result.totalQuestions, 3, "totalQuestionsは解答件数と一致する");
    assertEqual(result.correctCount, 2, "correctCountは正解件数と一致する");
    assertEqual(result.missCount, 1, "missCountは不正解件数と一致する");
    assertEqual(result.totalHintsUsed, 7, "totalHintsUsedは合計ヒント使用数（1+2+4）と一致する");
    assertEqual(result.firstHintCorrectCount, 1, "firstHintCorrectCountはヒント1のみで正解した件数と一致する");
    assertEqual(result.totalElapsedMs, 13000, "totalElapsedMsは合計経過時間と一致する");
    assertEqual(Math.round(result.averageHintsUsed * 100) / 100, 2.33, "averageHintsUsedは平均ヒント使用数になる");
  }

  assertEqual(createLyricsQuizResult([]).totalQuestions, 0, "解答が0件でも例外を投げない");
  assertEqual(createLyricsQuizResult([]).averageHintsUsed, 0, "解答が0件のときaverageHintsUsedは0（0除算しない）");

  // ===== compareLyricsQuizResults() =====

  const base = {
    correctCount: 5,
    totalHintsUsed: 8,
    firstHintCorrectCount: 3,
    totalElapsedMs: 20000,
    missCount: 0,
  };

  assertEqual(
    Math.sign(compareLyricsQuizResults({ ...base, correctCount: 5 }, { ...base, correctCount: 4 })),
    -1,
    "① 正解数が多い方が上位（負の値）"
  );
  assertEqual(
    Math.sign(compareLyricsQuizResults({ ...base, totalHintsUsed: 6 }, { ...base, totalHintsUsed: 9 })),
    -1,
    "② 正解数が同じなら、合計ヒント使用数が少ない方が上位"
  );
  assertEqual(
    Math.sign(
      compareLyricsQuizResults({ ...base, firstHintCorrectCount: 4 }, { ...base, firstHintCorrectCount: 2 })
    ),
    -1,
    "③ 正解数・ヒント使用数が同じなら、ヒント1正解数が多い方が上位"
  );
  assertEqual(
    Math.sign(compareLyricsQuizResults({ ...base, totalElapsedMs: 15000 }, { ...base, totalElapsedMs: 25000 })),
    -1,
    "④ ①〜③が同じなら、経過時間が短い方が上位"
  );
  assertEqual(
    Math.sign(compareLyricsQuizResults({ ...base, missCount: 0 }, { ...base, missCount: 2 })),
    -1,
    "⑤ ①〜④が同じなら、ミス数が少ない方が上位"
  );
  assertEqual(compareLyricsQuizResults(base, { ...base }), 0, "すべての項目が同じなら0（同順位）");
}
