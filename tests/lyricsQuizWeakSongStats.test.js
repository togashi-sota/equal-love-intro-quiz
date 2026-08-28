// js/lyricsQuizWeakSongStats.js のテスト（2026-08-29新設）。
// 歌詞クイズ専用の苦手曲統計が、js/weakSongStats.js（イントロ側）と完全に独立した
// localStorageキーへ記録され、しきい値判定（75%未満）はcomputeWeakSongsFromStats()を
// 正しく再利用していることを確認する。
import {
  recordLyricsQuizWeakSongAttempt,
  getLyricsQuizWeakSongStats,
  computeLyricsQuizWeakSongs,
} from "../js/lyricsQuizWeakSongStats.js";
import { recordWeakSongAttempt, getWeakSongStats } from "../js/weakSongStats.js";
import { assertEqual } from "./test-utils.js";

const LYRICS_WEAK_SONG_STATS_KEY = "equalLoveIntroQuiz.lyricsQuizWeakSongStats";
const WEAK_SONG_STATS_KEY = "equalLoveIntroQuiz.weakSongStats";

function clearAllRelatedStorage() {
  localStorage.removeItem(LYRICS_WEAK_SONG_STATS_KEY);
  localStorage.removeItem(WEAK_SONG_STATS_KEY);
}

export function runLyricsQuizWeakSongStatsTests() {
  // ---- 1問答えるたびに、曲ごとのattempts・correctが積み上がる ----
  clearAllRelatedStorage();
  recordLyricsQuizWeakSongAttempt("aitakatta", true);
  assertEqual(
    getLyricsQuizWeakSongStats().aitakatta,
    { attempts: 1, correct: 1 },
    "正解を1回記録すると、attempts=1・correct=1になる"
  );
  recordLyricsQuizWeakSongAttempt("aitakatta", false);
  assertEqual(
    getLyricsQuizWeakSongStats().aitakatta,
    { attempts: 2, correct: 1 },
    "続けて不正解を記録すると、attemptsだけ増えてcorrectは増えない"
  );

  // ---- イントロ側（js/weakSongStats.js）とは完全に別のデータ（同じsongIdでも混ざらない） ----
  clearAllRelatedStorage();
  recordWeakSongAttempt("shared-song", true);
  recordWeakSongAttempt("shared-song", true);
  recordLyricsQuizWeakSongAttempt("shared-song", false);
  assertEqual(
    getWeakSongStats()["shared-song"],
    { attempts: 2, correct: 2 },
    "イントロ側の記録は歌詞クイズ側の記録によって変化しない"
  );
  assertEqual(
    getLyricsQuizWeakSongStats()["shared-song"],
    { attempts: 1, correct: 0 },
    "歌詞クイズ側の記録はイントロ側の記録によって変化しない（同じsongIdでも別集計）"
  );

  // ---- しきい値の再利用：75%未満・3回以上で苦手曲、ちょうど75%は対象外 ----
  // （js/weakSongStats.jsのcomputeWeakSongsFromStats()をそのまま使っていることの確認。
  // 本人の具体例：2/4=50%→苦手、3/4=75%→対象外）
  clearAllRelatedStorage();
  recordLyricsQuizWeakSongAttempt("weak-in-lyrics", true);
  recordLyricsQuizWeakSongAttempt("weak-in-lyrics", true);
  recordLyricsQuizWeakSongAttempt("weak-in-lyrics", false);
  recordLyricsQuizWeakSongAttempt("weak-in-lyrics", false);
  recordLyricsQuizWeakSongAttempt("not-weak-in-lyrics", true);
  recordLyricsQuizWeakSongAttempt("not-weak-in-lyrics", true);
  recordLyricsQuizWeakSongAttempt("not-weak-in-lyrics", true);
  recordLyricsQuizWeakSongAttempt("not-weak-in-lyrics", false);
  const weakIds = computeLyricsQuizWeakSongs().map((stat) => stat.songId);
  assertEqual(weakIds.includes("weak-in-lyrics"), true, "2/4=50%（歌詞クイズ側）は苦手曲");
  assertEqual(weakIds.includes("not-weak-in-lyrics"), false, "3/4=75%（歌詞クイズ側）は対象外");

  // ---- 合計3回未満は正答率0%でも対象外 ----
  clearAllRelatedStorage();
  recordLyricsQuizWeakSongAttempt("too-few-attempts", false);
  recordLyricsQuizWeakSongAttempt("too-few-attempts", false);
  assertEqual(
    computeLyricsQuizWeakSongs(),
    [],
    "合計2回（正答率0%）は3回未満のため苦手曲に含まれない"
  );

  clearAllRelatedStorage();
}
