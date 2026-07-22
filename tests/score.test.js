// score.js（得点・ランク計算）のテスト。

import { calculateScore, calculateRank } from "../js/score.js";
import { assertEqual } from "./test-utils.js";

export function runScoreTests() {
  // 段階式スコアリング：経過秒数の境界値をひと通り確認する。
  assertEqual(calculateScore(0), 10, "0秒で正解 → 10点（3秒以内）");
  assertEqual(calculateScore(3), 10, "3秒で正解 → 10点（3秒以内の境界）");
  assertEqual(calculateScore(4), 9, "4秒で正解 → 9点（5秒以内）");
  assertEqual(calculateScore(5), 9, "5秒で正解 → 9点（5秒以内の境界）");
  assertEqual(calculateScore(6), 8, "6秒で正解 → 8点（8秒以内）");
  assertEqual(calculateScore(8), 8, "8秒で正解 → 8点（8秒以内の境界）");
  assertEqual(calculateScore(9), 7, "9秒で正解 → 7点（12秒以内）");
  assertEqual(calculateScore(12), 7, "12秒で正解 → 7点（12秒以内の境界）");
  assertEqual(calculateScore(13), 6, "13秒で正解 → 6点（20秒以内）");
  assertEqual(calculateScore(20), 6, "20秒で正解 → 6点（20秒以内の境界）");
  assertEqual(calculateScore(21), 5, "21秒で正解 → 5点（30秒以内）");
  assertEqual(calculateScore(30), 5, "30秒で正解 → 5点（30秒以内の境界）");
  assertEqual(calculateScore(31), 4, "31秒で正解 → 4点（45秒以内）");
  assertEqual(calculateScore(45), 4, "45秒で正解 → 4点（45秒以内の境界）");
  assertEqual(calculateScore(46), 3, "46秒で正解 → 3点（60秒以内）");
  assertEqual(calculateScore(60), 3, "60秒で正解 → 3点（60秒以内の境界）");
  assertEqual(calculateScore(61), 2, "61秒で正解 → 2点（60秒超え）");
  assertEqual(calculateScore(1000), 2, "1000秒で正解 → 2点（60秒超え）");

  // 無音補正（introLeadInSec）：経過秒数から差し引かれてから判定されることを確認する。
  assertEqual(calculateScore(5, 2), 10, "無音2秒の曲は、経過5秒でも実質3秒扱い → 10点");
  assertEqual(calculateScore(1, 5), 10, "無音補正後がマイナスになる場合は0秒として扱われる → 10点");

  // ランク判定：1問10点満点として、達成率の境界値を確認する。
  assertEqual(calculateRank(50, 5), "S", "5問満点(50点) → ランクS");
  assertEqual(calculateRank(45, 5), "S", "5問中45点(90%) → ランクS");
  assertEqual(calculateRank(35, 5), "A", "5問中35点(70%) → ランクA");
  assertEqual(calculateRank(34, 5), "B", "5問中34点(68%) → ランクB");
  assertEqual(calculateRank(25, 5), "B", "5問中25点(50%) → ランクB");
  assertEqual(calculateRank(24, 5), "C", "5問中24点(48%) → ランクC");
  assertEqual(calculateRank(0, 5), "C", "5問中0点 → ランクC");
}
