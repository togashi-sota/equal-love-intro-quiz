// js/weakSongStats.js のテスト。
// 苦手曲判定用の「1問ごとの回答記録」（4モード合算タリー）と、既存プレイ履歴・
// タイムアタック履歴からの初回バックフィルを検証する（2026-08-16新設）。
import { recordWeakSongAttempt, getWeakSongStats, computeWeakSongsFromStats } from "../js/weakSongStats.js";
import { saveTimeAttackHistoryEntry } from "../js/timeAttackHistory.js";
import { assertEqual } from "./test-utils.js";

const WEAK_SONG_STATS_KEY = "equalLoveIntroQuiz.weakSongStats";
const PLAY_HISTORY_KEY = "equalLoveIntroQuiz.playHistory";
const TIME_ATTACK_HISTORY_KEY = "equalLoveIntroQuiz.timeAttackHistory";

function clearAllRelatedStorage() {
  localStorage.removeItem(WEAK_SONG_STATS_KEY);
  localStorage.removeItem(PLAY_HISTORY_KEY);
  localStorage.removeItem(TIME_ATTACK_HISTORY_KEY);
}

// js/history.jsのsaveHistoryEntry()が作る形のうち、computeWeakSongsFromStats用の
// バックフィルが実際に参照するanswersだけを持つ最小限の履歴データを直接書き込む
// （gameState・playResultをフルに組み立てる手間を省くため）。
function seedPlayHistory(entries) {
  localStorage.setItem(
    PLAY_HISTORY_KEY,
    JSON.stringify({ schemaVersion: 1, entries })
  );
}

function buildTimeAttackEntryInput(overrides) {
  return {
    rule: "normal",
    questionCountValue: "5",
    categoryFilterValue: "all",
    totalElapsedMs: 12345,
    correctCount: 1,
    missCount: 0,
    completed: true,
    failedAtQuestionNumber: null,
    isNewRecord: false,
    perQuestionResults: [],
    ...overrides,
  };
}

export function runWeakSongStatsTests() {
  // ---- 1問答えるたびに、曲ごとのattempts・correctが積み上がる ----
  clearAllRelatedStorage();
  recordWeakSongAttempt("aitakatta", true);
  assertEqual(
    getWeakSongStats().aitakatta,
    { attempts: 1, correct: 1 },
    "正解を1回記録すると、attempts=1・correct=1になる"
  );
  recordWeakSongAttempt("aitakatta", false);
  assertEqual(
    getWeakSongStats().aitakatta,
    { attempts: 2, correct: 1 },
    "続けて不正解を記録すると、attemptsだけ増えてcorrectは増えない"
  );

  // ---- 曲ごとに独立して集計される ----
  recordWeakSongAttempt("koibumi", true);
  assertEqual(
    getWeakSongStats().koibumi,
    { attempts: 1, correct: 1 },
    "別の曲は別のsongIdとして独立して集計される"
  );
  assertEqual(
    getWeakSongStats().aitakatta,
    { attempts: 2, correct: 1 },
    "別の曲を記録しても、既存の曲の集計は変わらない"
  );

  // ---- しきい値：3回未満は正答率0%でも対象外 ----
  clearAllRelatedStorage();
  recordWeakSongAttempt("song-a", false);
  recordWeakSongAttempt("song-a", false);
  assertEqual(
    computeWeakSongsFromStats(getWeakSongStats()),
    [],
    "合計2回（正答率0%）は3回未満のため苦手曲に含まれない"
  );

  // ---- しきい値：ちょうど50%は対象外（「未満」なので含めない） ----
  clearAllRelatedStorage();
  recordWeakSongAttempt("song-b", true);
  recordWeakSongAttempt("song-b", true);
  recordWeakSongAttempt("song-b", false);
  recordWeakSongAttempt("song-b", false);
  assertEqual(
    computeWeakSongsFromStats(getWeakSongStats()),
    [],
    "4回中2回正解（正答率ちょうど50%）は苦手曲に含まれない"
  );

  // ---- しきい値：50%未満・3回以上なら対象になる ----
  clearAllRelatedStorage();
  recordWeakSongAttempt("song-c", true);
  recordWeakSongAttempt("song-c", false);
  recordWeakSongAttempt("song-c", false);
  const songCResult = computeWeakSongsFromStats(getWeakSongStats());
  assertEqual(songCResult.length, 1, "3回中1回正解（正答率33%）は苦手曲として1件返る");
  assertEqual(
    { attempts: songCResult[0].attempts, correct: songCResult[0].correct },
    { attempts: 3, correct: 1 },
    "苦手曲として返る内訳がattempts=3・correct=1になっている"
  );

  // ---- 並び順：正答率が低い順、同率なら不正解数が多い順 ----
  clearAllRelatedStorage();
  // song-low: 4回中1回正解（正答率25%、不正解3回）
  recordWeakSongAttempt("song-low", true);
  recordWeakSongAttempt("song-low", false);
  recordWeakSongAttempt("song-low", false);
  recordWeakSongAttempt("song-low", false);
  // song-tie-a: 3回中1回正解（正答率33%、不正解2回）
  recordWeakSongAttempt("song-tie-a", true);
  recordWeakSongAttempt("song-tie-a", false);
  recordWeakSongAttempt("song-tie-a", false);
  // song-tie-b: 6回中2回正解（正答率33%、不正解4回。song-tie-aと同率だが不正解数が多い）
  recordWeakSongAttempt("song-tie-b", true);
  recordWeakSongAttempt("song-tie-b", true);
  recordWeakSongAttempt("song-tie-b", false);
  recordWeakSongAttempt("song-tie-b", false);
  recordWeakSongAttempt("song-tie-b", false);
  recordWeakSongAttempt("song-tie-b", false);
  const sortedResult = computeWeakSongsFromStats(getWeakSongStats()).map((stat) => stat.songId);
  assertEqual(
    sortedResult,
    ["song-low", "song-tie-b", "song-tie-a"],
    "正答率が低い順、同率なら不正解数が多い順に並ぶ"
  );

  // ---- 初回バックフィル：通常プレイ履歴（answers）から曲別に正しく復元される ----
  clearAllRelatedStorage();
  seedPlayHistory([
    {
      answers: [
        { songId: "backfill-normal", result: "correct" },
        { songId: "backfill-normal", result: "wrong" },
        { songId: "backfill-normal", result: "skip" },
      ],
    },
  ]);
  assertEqual(
    getWeakSongStats()["backfill-normal"],
    { attempts: 3, correct: 1 },
    "通常プレイ履歴のanswersから、正解1・不正解2（skip含む）として復元される"
  );

  // ---- 初回バックフィル：タイムアタック履歴（mistakeCount基準）から正しく復元される ----
  clearAllRelatedStorage();
  saveTimeAttackHistoryEntry(
    buildTimeAttackEntryInput({
      perQuestionResults: [
        { questionNumber: 1, songId: "backfill-ta", choices: [], correctAnswer: "x", selectedAnswers: [], elapsedMs: 1000, missCountThisQuestion: 0, isCorrect: true },
        { questionNumber: 2, songId: "backfill-ta", choices: [], correctAnswer: "x", selectedAnswers: [], elapsedMs: 1000, missCountThisQuestion: 2, isCorrect: true },
      ],
    })
  );
  assertEqual(
    getWeakSongStats()["backfill-ta"],
    { attempts: 2, correct: 1 },
    "タイムアタック履歴からは、isCorrectではなくmissCountThisQuestion===0を基準に復元される" +
      "（1問目は0ミスで正解、2問目は2回ミスしてから正解のため不正解扱い）"
  );

  // ---- 初回バックフィル：通常プレイ・タイムアタックの両方が同じ曲に合算される ----
  clearAllRelatedStorage();
  seedPlayHistory([{ answers: [{ songId: "backfill-both", result: "correct" }] }]);
  saveTimeAttackHistoryEntry(
    buildTimeAttackEntryInput({
      perQuestionResults: [
        { questionNumber: 1, songId: "backfill-both", choices: [], correctAnswer: "x", selectedAnswers: [], elapsedMs: 1000, missCountThisQuestion: 1, isCorrect: true },
      ],
    })
  );
  assertEqual(
    getWeakSongStats()["backfill-both"],
    { attempts: 2, correct: 1 },
    "同じ曲IDが通常プレイ・タイムアタック両方の履歴にある場合、合算されて1つの集計になる"
  );

  // ---- バックフィルは初回アクセス時の1回だけで、2回目以降は繰り返さない ----
  clearAllRelatedStorage();
  seedPlayHistory([{ answers: [{ songId: "backfill-once", result: "correct" }] }]);
  getWeakSongStats(); // 1回目のアクセスでバックフィルが走り、保存される
  seedPlayHistory([
    { answers: [{ songId: "backfill-once", result: "correct" }] },
    { answers: [{ songId: "backfill-once", result: "correct" }] },
  ]); // 履歴側が後から増えても、すでにバックフィル済みの集計には影響しないはず
  assertEqual(
    getWeakSongStats()["backfill-once"],
    { attempts: 1, correct: 1 },
    "2回目以降のアクセスではバックフィルを繰り返さず、保存済みの集計をそのまま返す"
  );

  // ---- バックフィル後に記録した分は、バックフィル分に上乗せされる ----
  clearAllRelatedStorage();
  seedPlayHistory([{ answers: [{ songId: "backfill-then-live", result: "correct" }] }]);
  getWeakSongStats(); // バックフィルを発生させる
  recordWeakSongAttempt("backfill-then-live", false);
  assertEqual(
    getWeakSongStats()["backfill-then-live"],
    { attempts: 2, correct: 1 },
    "バックフィルされた集計の上に、その後の記録が正しく積み上がる"
  );

  clearAllRelatedStorage();
}
