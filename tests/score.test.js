// score.js（得点・ランク計算）のテスト。

import { calculateScore, calculateRank } from "../js/score.js";
import { assertEqual } from "./test-utils.js";

export function runScoreTests() {
  assertEqual(calculateScore(10), 200, "残り10秒で正解 → 200点（即答ボーナス最大）");
  assertEqual(calculateScore(1), 110, "残り1秒で正解 → 110点");
  assertEqual(calculateScore(0), 100, "残り0秒で正解 → 100点（基礎点のみ）");

  assertEqual(calculateRank(1000, 5), "S", "5問満点(1000点) → ランクS");
  assertEqual(calculateRank(900, 5), "S", "5問中900点(90%) → ランクS");
  assertEqual(calculateRank(700, 5), "A", "5問中700点(70%) → ランクA");
  assertEqual(calculateRank(699, 5), "B", "5問中699点(69.9%) → ランクB");
  assertEqual(calculateRank(500, 5), "B", "5問中500点(50%) → ランクB");
  assertEqual(calculateRank(499, 5), "C", "5問中499点(49.9%) → ランクC");
  assertEqual(calculateRank(0, 5), "C", "5問中0点 → ランクC");
}
