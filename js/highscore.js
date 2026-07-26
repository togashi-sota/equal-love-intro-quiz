// ハイスコア（自己ベスト記録）を、ブラウザのlocalStorageに保存・読み込みするファイル。
// localStorageは「この端末・このブラウザだけに残る、簡易的な保存領域」で、
// タブを閉じても消えないため、自己ベストの記録を残すのに使う。
//
// 出題数・カテゴリの組み合わせによって満点が変わり、単純比較ができないため、
// 保存キーを組み合わせごとに分けている。出題数の選択肢自体が将来変わっても、
// 新しい値の組み合わせは自動的に新しいキーとして扱われるだけなので、
// 古い記録と混ざったり壊れたりすることはない。
const HIGH_SCORE_KEY_PREFIX = "equalLoveIntroQuiz.highScore";

function buildHighScoreKey(questionCountValue, categoryFilterValue) {
  return `${HIGH_SCORE_KEY_PREFIX}.${questionCountValue}.${categoryFilterValue}`;
}

// 指定した出題数・カテゴリの組み合わせにおけるハイスコアを取得する。
// 未保存、または読み込みに失敗した場合は0を返す。
export function getHighScore(questionCountValue, categoryFilterValue) {
  try {
    const stored = localStorage.getItem(buildHighScoreKey(questionCountValue, categoryFilterValue));
    return stored ? Number(stored) : 0;
  } catch {
    return 0;
  }
}

// 今回の得点が、同じ出題数・カテゴリの組み合わせでの過去のハイスコアを
// 上回っていれば保存する。新記録だったかどうかを返す。
export function saveHighScoreIfBetter(score, questionCountValue, categoryFilterValue) {
  if (score <= getHighScore(questionCountValue, categoryFilterValue)) {
    return false;
  }

  try {
    localStorage.setItem(buildHighScoreKey(questionCountValue, categoryFilterValue), String(score));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}
