// js/lyricsQuizScore.js（歌詞クイズの自己ベスト保存）のテスト。
//
// この機能はlocalStorageを直接読み書きするため、他の純粋関数のテストと違い、
// 実際のブラウザのlocalStorageに対する副作用のあるテストになる。
// 今アクティブなプレイヤーの本物の自己ベストデータを壊さないよう、
// テストで使うキーの元の値を必ずバックアップし、終了後（成功・失敗にかかわらず）
// 復元してから終わる。

import { getLyricsQuizBest, saveLyricsQuizBestIfBetter } from "../js/lyricsQuizScore.js";
import { getPlayerKeyPrefix } from "../js/playerProfile.js";
import { assertEqual } from "./test-utils.js";

function buildKey(questionCountValue, answerPoolSizeValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}lyricsQuizBest.${questionCountValue}.${answerPoolSizeValue}`;
}

function buildResult(overrides) {
  return {
    totalQuestions: 5,
    correctCount: 5,
    missCount: 0,
    totalHintsUsed: 5,
    averageHintsUsed: 1,
    firstHintCorrectCount: 5,
    totalElapsedMs: 10000,
    ...overrides,
  };
}

export function runLyricsQuizScoreTests() {
  const testKeys = [buildKey("5", "4"), buildKey("5", "10"), buildKey("10", "4")];
  const backup = new Map(testKeys.map((key) => [key, localStorage.getItem(key)]));

  try {
    testKeys.forEach((key) => localStorage.removeItem(key));

    // ===== 記録が無い状態 =====
    assertEqual(getLyricsQuizBest("5", "4"), null, "記録が無ければnullを返す");

    // ===== 初回保存は必ず更新扱い =====
    const first = buildResult({ correctCount: 3, totalHintsUsed: 10 });
    assertEqual(saveLyricsQuizBestIfBetter(first, "5", "4"), true, "記録が無い状態からの保存は必ず自己ベスト更新になる");
    assertEqual(getLyricsQuizBest("5", "4"), first, "保存した内容がそのまま読み出せる");

    // ===== ①正解数優先のタイブレーク =====
    const moreCorrect = buildResult({ correctCount: 5, totalHintsUsed: 10 });
    assertEqual(saveLyricsQuizBestIfBetter(moreCorrect, "5", "4"), true, "正解数が多い結果は自己ベストを更新する");

    // ===== ②合計ヒント使用数のタイブレーク =====
    const fewerHints = buildResult({ correctCount: 5, totalHintsUsed: 6 });
    assertEqual(
      saveLyricsQuizBestIfBetter(fewerHints, "5", "4"),
      true,
      "正解数が同じでも合計ヒント使用数が少なければ更新する"
    );

    // ===== ③ヒント1正解数のタイブレーク =====
    const worseFirstHint = buildResult({ correctCount: 5, totalHintsUsed: 6, firstHintCorrectCount: 1 });
    assertEqual(
      saveLyricsQuizBestIfBetter(worseFirstHint, "5", "4"),
      false,
      "正解数・ヒント使用数が同じでもヒント1正解数が少なければ更新しない"
    );

    // ===== ④経過時間のタイブレーク =====
    const slower = buildResult({
      correctCount: 5,
      totalHintsUsed: 6,
      firstHintCorrectCount: 5,
      totalElapsedMs: 999999,
    });
    assertEqual(saveLyricsQuizBestIfBetter(slower, "5", "4"), false, "①〜③が同じでも経過時間が長ければ更新しない");

    // ===== ⑤ミス数のタイブレーク =====
    const moreMiss = buildResult({
      correctCount: 5,
      totalHintsUsed: 6,
      firstHintCorrectCount: 5,
      totalElapsedMs: 10000,
      missCount: 3,
    });
    assertEqual(saveLyricsQuizBestIfBetter(moreMiss, "5", "4"), false, "①〜④が同じでもミス数が多ければ更新しない");

    assertEqual(getLyricsQuizBest("5", "4").totalHintsUsed, 6, "更新されなかった場合、保存済みの記録は変化していない");

    // ===== 出題数・回答方式ごとにキーが衝突しない =====
    assertEqual(getLyricsQuizBest("5", "10"), null, "出題数が同じでも回答方式が違えば別の記録として扱う（まだ未保存）");
    saveLyricsQuizBestIfBetter(buildResult({ correctCount: 1 }), "5", "10");
    assertEqual(getLyricsQuizBest("5", "4").correctCount, 5, "「5問・10択」への保存は「5問・4択」の記録に影響しない");

    saveLyricsQuizBestIfBetter(buildResult({ correctCount: 1 }), "10", "4");
    assertEqual(getLyricsQuizBest("5", "4").correctCount, 5, "「10問・4択」への保存は「5問・4択」の記録に影響しない");
    assertEqual(getLyricsQuizBest("5", "10").correctCount, 1, "「5問・10択」の記録もそれぞれ独立して保存されている");
    assertEqual(getLyricsQuizBest("10", "4").correctCount, 1, "「10問・4択」の記録もそれぞれ独立して保存されている");

    // ===== 壊れた保存データを安全に扱う =====
    const corruptKey = buildKey("5", "4");
    localStorage.setItem(corruptKey, "これはJSONとして壊れた文字列{{{");
    assertEqual(getLyricsQuizBest("5", "4"), null, "保存データがJSONとして壊れていても例外を投げずnullを返す");
    assertEqual(
      saveLyricsQuizBestIfBetter(buildResult(), "5", "4"),
      true,
      "壊れたデータは「記録なし」扱いとなり、新しい結果でそのまま上書きできる"
    );
  } finally {
    backup.forEach((value, key) => {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, value);
      }
    });
  }
}
