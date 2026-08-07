// js/timeAttackScore.js のテスト。
// 2026-08-07追加：ランダム再生タイムアタックのvariant次元を自己ベストキーに追加した際の
// 回帰防止テスト。「intro（省略時のデフォルト）は今までと完全に同じキー文字列のまま」
// であることが最重要（既存プレイヤーの自己ベストを一切失わせないため）。
import {
  getTimeAttackBest,
  saveTimeAttackBestIfBetter,
  getTimeAttackBestReach,
  saveTimeAttackBestReachIfBetter,
} from "../js/timeAttackScore.js";
import { assertEqual } from "./test-utils.js";

const LEGACY_KEY = "equalLoveIntroQuiz.timeAttackBest.normal.5.all";
const RANDOM_PLAYBACK_KEY = "equalLoveIntroQuiz.timeAttackBest.randomPlayback.normal.5.all";
const LEGACY_REACH_KEY = "equalLoveIntroQuiz.timeAttackBestReach.5.all";
const RANDOM_PLAYBACK_REACH_KEY = "equalLoveIntroQuiz.timeAttackBestReach.randomPlayback.5.all";

function cleanup() {
  [LEGACY_KEY, RANDOM_PLAYBACK_KEY, LEGACY_REACH_KEY, RANDOM_PLAYBACK_REACH_KEY].forEach((key) =>
    localStorage.removeItem(key)
  );
}

export function runTimeAttackScoreTests() {
  cleanup();

  // ---- variant省略（intro）は、既存のキー文字列と完全に一致する（後方互換の核心） ----
  saveTimeAttackBestIfBetter(12345, "normal", "5", "all");
  assertEqual(
    localStorage.getItem(LEGACY_KEY),
    "12345",
    "variant省略時は、既存プレイヤーの自己ベストと同じキー文字列にそのまま保存される"
  );
  assertEqual(
    getTimeAttackBest("normal", "5", "all"),
    12345,
    "variant省略で保存した自己ベストは、variant省略で読み出せる"
  );
  assertEqual(
    getTimeAttackBest("normal", "5", "all", "intro"),
    12345,
    "variant省略とvariant:'intro'明示は同じ記録を指す"
  );
  cleanup();

  // ---- randomPlaybackは、introとは完全に別の記録として扱われる ----
  saveTimeAttackBestIfBetter(9999, "normal", "5", "all", "intro");
  saveTimeAttackBestIfBetter(8888, "normal", "5", "all", "randomPlayback");
  assertEqual(getTimeAttackBest("normal", "5", "all", "intro"), 9999, "introの自己ベストはintroのまま");
  assertEqual(
    getTimeAttackBest("normal", "5", "all", "randomPlayback"),
    8888,
    "randomPlaybackの自己ベストはintroと混ざらず別に保存される"
  );
  assertEqual(
    localStorage.getItem(RANDOM_PLAYBACK_KEY),
    "8888",
    "randomPlaybackは別名前空間のキーに保存される"
  );
  cleanup();

  // ---- 「短いほど良い」比較は、variantを問わず正しく機能する ----
  assertEqual(
    saveTimeAttackBestIfBetter(5000, "hard", "10", "all", "randomPlayback"),
    true,
    "記録なしからの初記録は新記録扱いになる"
  );
  assertEqual(
    saveTimeAttackBestIfBetter(6000, "hard", "10", "all", "randomPlayback"),
    false,
    "自己ベストより遅いタイムは更新されない"
  );
  assertEqual(
    saveTimeAttackBestIfBetter(4000, "hard", "10", "all", "randomPlayback"),
    true,
    "自己ベストより速いタイムは更新される"
  );
  assertEqual(getTimeAttackBest("hard", "10", "all", "randomPlayback"), 4000, "最終的な自己ベストが正しく反映される");
  localStorage.removeItem("equalLoveIntroQuiz.timeAttackBest.randomPlayback.hard.10.all");

  // ---- 最高到達記録（LOVE連チャン）も同じ考え方でvariantが分離される ----
  cleanup();
  saveTimeAttackBestReachIfBetter(3, 1000, "5", "all", "intro");
  saveTimeAttackBestReachIfBetter(5, 2000, "5", "all", "randomPlayback");
  assertEqual(
    getTimeAttackBestReach("5", "all", "intro"),
    { questionsReached: 3, elapsedMs: 1000 },
    "introの最高到達記録はintroのまま"
  );
  assertEqual(
    getTimeAttackBestReach("5", "all", "randomPlayback"),
    { questionsReached: 5, elapsedMs: 2000 },
    "randomPlaybackの最高到達記録は別に保存される"
  );
  assertEqual(
    localStorage.getItem(LEGACY_REACH_KEY) !== null,
    true,
    "introの最高到達記録は既存のキー文字列のまま保存される"
  );

  cleanup();
}
