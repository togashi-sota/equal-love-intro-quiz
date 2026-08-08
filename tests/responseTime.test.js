// js/responseTime.js（平均回答時間の計算・表示整形）のテスト。
import { calculateAverageResponseMs, formatResponseSeconds, formatSecondsUntilThreshold } from "../js/responseTime.js";
import { assertEqual } from "./test-utils.js";

export function runResponseTimeTests() {
  // ===== calculateAverageResponseMs =====
  assertEqual(calculateAverageResponseMs([1000, 2000, 3000, 4000, 5000]), 3000, "5問の平均を計算できる");
  assertEqual(
    calculateAverageResponseMs([1000, 1200, 800, 1500, 900, 1100, 1300, 1000, 950, 1050]),
    1080,
    "10問の平均を計算できる"
  );
  const allSongsElapsed = Array.from({ length: 70 }, (_, i) => 1000 + i * 10);
  const expectedAverage = allSongsElapsed.reduce((sum, ms) => sum + ms, 0) / allSongsElapsed.length;
  assertEqual(calculateAverageResponseMs(allSongsElapsed), expectedAverage, "全曲（70問）の平均を計算できる");
  assertEqual(calculateAverageResponseMs([1700]), 1700, "1700msちょうど1件の平均は1700");
  assertEqual(calculateAverageResponseMs([1701]), 1701, "1701ms1件の平均は1701");
  assertEqual(calculateAverageResponseMs([]), null, "0件のときは0除算のNaNではなくnullを返す");
  assertEqual(calculateAverageResponseMs(null), null, "配列でない値を渡してもnullを返す（防御的）");

  // ===== formatResponseSeconds =====
  assertEqual(formatResponseSeconds(1830), "1.83秒", "1830ms→1.83秒");
  assertEqual(formatResponseSeconds(1700), "1.70秒", "1700ms→1.70秒（末尾の0を省略しない）");
  assertEqual(formatResponseSeconds(954), "0.95秒", "954ms→0.95秒");
  assertEqual(formatResponseSeconds(1666), "1.67秒", "1666ms→四捨五入で1.67秒");
  assertEqual(formatResponseSeconds(null), null, "nullはnullのまま（呼び出し側で項目非表示に使う）");
  assertEqual(formatResponseSeconds(undefined), null, "undefinedもnullのまま");

  // ===== formatSecondsUntilThreshold =====
  assertEqual(formatSecondsUntilThreshold(1830, 1700), "0.13", "平均1.83秒・目標1.70秒→あと0.13秒");
  assertEqual(formatSecondsUntilThreshold(2050, 1700), "0.35", "平均2.05秒・目標1.70秒→あと0.35秒");
  assertEqual(formatSecondsUntilThreshold(1710, 1700), "0.01", "平均1.710秒・目標1.70秒→あと0.01秒");
  assertEqual(formatSecondsUntilThreshold(1701, 1700), "0.00", "1msの差は四捨五入で0.00秒になる（表示上は達成に見えるが、称号判定はmsの生値で行うため誤魔化せない）");
  assertEqual(formatSecondsUntilThreshold(1690, 1700), "-0.01", "しきい値未満なら負の値（達成側）を返す");
  assertEqual(formatSecondsUntilThreshold(null, 1700), null, "averageResponseMsがnullならnullを返す");
}
