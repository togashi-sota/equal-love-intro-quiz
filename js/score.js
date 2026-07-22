// スピードボーナス方式の得点計算を担当するファイル。
// 正解が早いほど高得点、不正解・時間切れは0点。

const BASE_SCORE = 100;
const BONUS_PER_SECOND = 10;

// 正解したときの得点を計算する。
// 残り時間が1秒のときは110点、10秒（即答）のときは200点になる。
export function calculateScore(remainingSec) {
  return BASE_SCORE + remainingSec * BONUS_PER_SECOND;
}

// 満点（全問を即答で正解した場合の得点）に対する達成率から、S/A/B/Cのランクを判定する。
export function calculateRank(score, questionCount) {
  const maxPossibleScore = questionCount * 200;
  const achievementRate = score / maxPossibleScore;

  if (achievementRate >= 0.9) return "S";
  if (achievementRate >= 0.7) return "A";
  if (achievementRate >= 0.5) return "B";
  return "C";
}
