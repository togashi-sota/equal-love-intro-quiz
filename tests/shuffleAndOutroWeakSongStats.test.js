// js/shuffleWeakSongStats.js・js/outroWeakSongStats.js のテスト（2026-08-30新設、本人指示：
// 苦手曲モードを5系統〈イントロ／アウトロ／シャッフル／リリック／一瞬〉へ完全分離）。
// しきい値（75%未満・3回以上）の判定ロジック自体はjs/weakSongStats.jsの
// computeWeakSongsFromStats()で既にテスト済みのため（tests/weakSongStats.test.js）、
// ここでは「record/getが正しく積み上がるか」「イントロ・シャッフル・アウトロの3つの
// 記録が完全に独立し、一切混ざらないか」だけを確認する。
import { recordWeakSongAttempt, getWeakSongStats, computeWeakSongsFromStats } from "../js/weakSongStats.js";
import { recordShuffleWeakSongAttempt, getShuffleWeakSongStats } from "../js/shuffleWeakSongStats.js";
import { recordOutroWeakSongAttempt, getOutroWeakSongStats } from "../js/outroWeakSongStats.js";
import { assertEqual } from "./test-utils.js";

const INTRO_KEY = "equalLoveIntroQuiz.weakSongStats";
const SHUFFLE_KEY = "equalLoveIntroQuiz.shuffleWeakSongStats";
const OUTRO_KEY = "equalLoveIntroQuiz.outroWeakSongStats";

function clearAllRelatedStorage() {
  localStorage.removeItem(INTRO_KEY);
  localStorage.removeItem(SHUFFLE_KEY);
  localStorage.removeItem(OUTRO_KEY);
}

export function runShuffleAndOutroWeakSongStatsTests() {
  // ---- シャッフル：1問答えるたびに、曲ごとのattempts・correctが積み上がる ----
  clearAllRelatedStorage();
  recordShuffleWeakSongAttempt("shuffle-song", true);
  assertEqual(
    getShuffleWeakSongStats()["shuffle-song"],
    { attempts: 1, correct: 1 },
    "シャッフル：正解を1回記録すると、attempts=1・correct=1になる"
  );
  recordShuffleWeakSongAttempt("shuffle-song", false);
  assertEqual(
    getShuffleWeakSongStats()["shuffle-song"],
    { attempts: 2, correct: 1 },
    "シャッフル：続けて不正解を記録すると、attemptsだけ増えてcorrectは増えない"
  );

  // ---- アウトロ：同様に積み上がる ----
  clearAllRelatedStorage();
  recordOutroWeakSongAttempt("outro-song", true);
  recordOutroWeakSongAttempt("outro-song", true);
  recordOutroWeakSongAttempt("outro-song", false);
  assertEqual(
    getOutroWeakSongStats()["outro-song"],
    { attempts: 3, correct: 2 },
    "アウトロ：3回分の記録が正しく積み上がる"
  );

  // ---- 重要：イントロ・シャッフル・アウトロの3つの記録は完全に独立し、一切混ざらない
  //      （本人指示：「シャッフル苦手曲を選んでも結局イントロで出題される」不具合の
  //      根本原因〈記録が合算されていた〉が解消されていることの回帰確認） ----
  clearAllRelatedStorage();
  const SAME_SONG_ID = "shared-song-id"; // あえて同じ曲IDを使い、混ざらないことを厳しく確認する
  recordWeakSongAttempt(SAME_SONG_ID, false); // イントロ：不正解
  recordWeakSongAttempt(SAME_SONG_ID, false);
  recordWeakSongAttempt(SAME_SONG_ID, false); // イントロ：3回連続不正解＝苦手曲
  recordShuffleWeakSongAttempt(SAME_SONG_ID, true); // シャッフル：全問正解＝苦手曲ではない
  recordShuffleWeakSongAttempt(SAME_SONG_ID, true);
  recordShuffleWeakSongAttempt(SAME_SONG_ID, true);
  recordOutroWeakSongAttempt(SAME_SONG_ID, true); // アウトロ：まだ1回だけ（3回未満のため対象外）

  assertEqual(
    getWeakSongStats()[SAME_SONG_ID],
    { attempts: 3, correct: 0 },
    "同じ曲IDでも、イントロの記録はイントロの呼び出し分だけを反映する（シャッフル・アウトロの記録が混ざらない）"
  );
  assertEqual(
    getShuffleWeakSongStats()[SAME_SONG_ID],
    { attempts: 3, correct: 3 },
    "同じ曲IDでも、シャッフルの記録はシャッフルの呼び出し分だけを反映する（イントロ・アウトロの記録が混ざらない）"
  );
  assertEqual(
    getOutroWeakSongStats()[SAME_SONG_ID],
    { attempts: 1, correct: 1 },
    "同じ曲IDでも、アウトロの記録はアウトロの呼び出し分だけを反映する（イントロ・シャッフルの記録が混ざらない）"
  );

  const introWeak = computeWeakSongsFromStats(getWeakSongStats()).map((stat) => stat.songId);
  const shuffleWeak = computeWeakSongsFromStats(getShuffleWeakSongStats()).map((stat) => stat.songId);
  const outroWeak = computeWeakSongsFromStats(getOutroWeakSongStats()).map((stat) => stat.songId);
  assertEqual(
    introWeak.includes(SAME_SONG_ID),
    true,
    "イントロでは3回連続不正解のため苦手曲として判定される"
  );
  assertEqual(
    shuffleWeak.includes(SAME_SONG_ID),
    false,
    "シャッフルでは全問正解のため苦手曲として判定されない（同じ曲IDでもイントロの結果に引きずられない）"
  );
  assertEqual(
    outroWeak.includes(SAME_SONG_ID),
    false,
    "アウトロではまだ3回未満（1回のみ）のため苦手曲として判定されない"
  );

  clearAllRelatedStorage();
}
