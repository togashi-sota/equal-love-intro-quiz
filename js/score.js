// 段階式（ティア）スコアリングを担当するファイル。
// 出題開始からの経過秒数が短いほど高得点、不正解・スキップ・答えを見るは0点。

// 経過秒数がこの値「以内」なら何点か、短い順に並べたもの。
// どのラインにも当てはまらない（＝一番長いラインより遅い）場合は SCORE_BEYOND_LAST_TIER 点になる。
const SCORE_TIERS = [
  { withinSec: 3, points: 10 },
  { withinSec: 5, points: 9 },
  { withinSec: 8, points: 8 },
  { withinSec: 12, points: 7 },
  { withinSec: 20, points: 6 },
  { withinSec: 30, points: 5 },
  { withinSec: 45, points: 4 },
  { withinSec: 60, points: 3 },
];
const SCORE_BEYOND_LAST_TIER = 2;

// 正解したときの得点を計算する。
// introLeadInSecは曲ごとの「頭の無音部分の長さ（秒）」。
// 曲によってイントロが鳴り始めるタイミングが違っても不公平にならないよう、経過秒数から差し引く。
export function calculateScore(elapsedSec, introLeadInSec = 0) {
  const adjustedSec = Math.max(0, elapsedSec - introLeadInSec);
  const tier = SCORE_TIERS.find((t) => adjustedSec <= t.withinSec);
  return tier ? tier.points : SCORE_BEYOND_LAST_TIER;
}

// 1問10点満点に対する達成率から、S/A/B/Cのランクを判定する。
export function calculateRank(score, questionCount) {
  const maxPossibleScore = questionCount * 10;
  const achievementRate = score / maxPossibleScore;

  if (achievementRate >= 0.9) return "S";
  if (achievementRate >= 0.7) return "A";
  if (achievementRate >= 0.5) return "B";
  return "C";
}
