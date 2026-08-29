// 歌詞クイズの自己ベストを、ブラウザのlocalStorageに保存・読み込みするファイル。
// js/randomPlaybackScore.jsと同じ設計パターン（出題数・回答方式の組み合わせごとにキーを分ける、
// プレイヤーごとの接頭辞を付ける）を踏襲しつつ、保存先のキー名を完全に分けることで、
// イントロクイズ・ランダム再生クイズの自己ベストとは一切混ざらないようにしている
// （本人の指示：「自己ベストを入れる場合は、イントロ・ランダム再生と混ざらない保存キーにしてください」）。
//
// 歌詞クイズは単純なタイムではなく「正解数→合計ヒント使用数→ヒント1正解数→経過時間→ミス数」の
// 5段階で比較するため（js/lyricsQuizEngine.jsのcompareLyricsQuizResults()と同じ基準）、
// 単一の数値ではなく比較に必要な項目一式（createLyricsQuizResult()の戻り値）をまとめて保存する。
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { compareLyricsQuizResults } from "./lyricsQuizEngine.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildLyricsQuizBestKey(questionCountValue, answerPoolSizeValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}lyricsQuizBest.${questionCountValue}.${answerPoolSizeValue}`;
}

// 指定した出題数・回答方式の組み合わせにおける自己ベストを取得する。未保存ならnull。
export function getLyricsQuizBest(questionCountValue, answerPoolSizeValue) {
  try {
    const stored = localStorage.getItem(buildLyricsQuizBestKey(questionCountValue, answerPoolSizeValue));
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

// 今回の結果（js/lyricsQuizEngine.jsのcreateLyricsQuizResult()の戻り値）が、
// 同じ出題数・回答方式の組み合わせでの自己ベストより良ければ保存する。
// 新記録だったかどうかを返す（自己ベストが無い状態からの初記録も、新記録として扱う）。
export function saveLyricsQuizBestIfBetter(result, questionCountValue, answerPoolSizeValue) {
  const currentBest = getLyricsQuizBest(questionCountValue, answerPoolSizeValue);
  if (currentBest !== null && compareLyricsQuizResults(result, currentBest) >= 0) {
    return false;
  }

  try {
    localStorage.setItem(buildLyricsQuizBestKey(questionCountValue, answerPoolSizeValue), JSON.stringify(result));
    scheduleBackupSync(); // クラウドバックアップも更新する（2026-08-29追加、js/backupSync.js参照）
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}
