// 通常イントロクイズ（タイムアタックではない、いつもの遊び方）専用の、
// 合計タイム（回答の思考時間だけを全問分合計した値）の自己ベストを、ブラウザの
// localStorageに保存・読み込みするファイル（2026-08-29新設、本人指示の追加4）。
//
// js/timeAttackScore.js・js/randomPlaybackScore.jsと全く同じ設計パターン
// （出題数・カテゴリの組み合わせごとにキーを分ける、プレイヤーごとの接頭辞を付ける、
// タイムは短いほど良い）を踏襲しつつ、保存先のキー名を完全に分けている。
//
// 【なぜ既存のjs/timeAttackScore.jsを再利用しないか】通常クイズとタイムアタックは
// 進め方のテンポが全く違う（本人指示：追加2「通常クイズ・タイムアタックはどちらが
// 客観的に速いとは言えない」と同じ理由）。timeAttackScore.jsのruleキー
// （"normal"|"hard"|"loveChain"）へ無理に相乗りすると、実際のタイムアタック
// （ノーマルルール）の自己ベストと同じキーを指してしまい、性質の異なる記録が混ざって
// しまう。そのため、ルールの概念を持たない専用の保存領域を新設する。
import { getPlayerKeyPrefix } from "./playerProfile.js";

function buildNormalQuizTimeKey(questionCountValue, categoryFilterValue) {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}normalQuizTimeBest.${questionCountValue}.${categoryFilterValue}`;
}

// 指定した出題数・カテゴリの組み合わせにおける自己ベスト（合計タイム、ミリ秒）を取得する。
// 未保存、または読み込みに失敗した場合はnullを返す（0秒ではなく「記録なし」を明示するため）。
export function getNormalQuizTimeBest(questionCountValue, categoryFilterValue) {
  try {
    const stored = localStorage.getItem(buildNormalQuizTimeKey(questionCountValue, categoryFilterValue));
    return stored ? Number(stored) : null;
  } catch {
    return null;
  }
}

// 今回の合計タイムが、同じ出題数・カテゴリの組み合わせでの自己ベストより短ければ保存する。
// 新記録だったかどうかを返す（自己ベストが無い状態からの初記録も、新記録として扱う）。
export function saveNormalQuizTimeBestIfBetter(totalThinkTimeMs, questionCountValue, categoryFilterValue) {
  const currentBest = getNormalQuizTimeBest(questionCountValue, categoryFilterValue);
  if (currentBest !== null && totalThinkTimeMs >= currentBest) {
    return false;
  }

  try {
    localStorage.setItem(buildNormalQuizTimeKey(questionCountValue, categoryFilterValue), String(totalThinkTimeMs));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}
