// ハイスコア（自己ベスト記録）を、ブラウザのlocalStorageに保存・読み込みするファイル。
// localStorageは「この端末・このブラウザだけに残る、簡易的な保存領域」で、
// タブを閉じても消えないため、自己ベストの記録を残すのに使う。

const HIGH_SCORE_KEY = "introDash.highScore";

// 保存されているハイスコアを取得する。未保存、または読み込みに失敗した場合は0を返す。
export function getHighScore() {
  try {
    const stored = localStorage.getItem(HIGH_SCORE_KEY);
    return stored ? Number(stored) : 0;
  } catch {
    return 0;
  }
}

// 今回の得点が過去のハイスコアを上回っていれば保存する。新記録だったかどうかを返す。
export function saveHighScoreIfBetter(score) {
  if (score <= getHighScore()) {
    return false;
  }

  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
  return true;
}
