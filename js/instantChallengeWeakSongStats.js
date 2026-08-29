// 一瞬チャレンジ専用の苦手曲判定に使う、曲ごとの合計回答数・正解数を記録するファイル
// （2026-08-30新設、本人指示）。
//
// 【なぜ既存のjs/weakSongStats.js・js/lyricsQuizWeakSongStats.jsと分けるか】一瞬チャレンジは
// 「曲のごく一部を一瞬（1.5秒/1秒/0.5秒）だけ聞いて当てる」という、既存モードとは全く別の
// 難易度・遊び方の高難度モード。「通常イントロは得意だが一瞬チャレンジは苦手」という曲が
// 両方ありうるため、js/lyricsQuizWeakSongStats.jsを歌詞クイズ専用に分離したのと同じ理由で、
// 記録そのものを完全に別のlocalStorageキーへ分離し、他モードの集計と混ざらないようにしている。
//
// 【しきい値の一元化】判定ロジック・数値はjs/weakSongStats.jsのcomputeWeakSongsFromStats()・
// WEAK_SONG_MIN_ATTEMPTS・WEAK_SONG_MAX_ACCURACYをそのまま再利用する
// （同じ判定基準を複数箇所に重複して書かない）。
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { computeWeakSongsFromStats } from "./weakSongStats.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildInstantChallengeWeakSongStatsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}instantChallengeWeakSongStats`;
}

const CURRENT_SCHEMA_VERSION = 1;

function loadRawStatsData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, songs: {} };
  try {
    const stored = localStorage.getItem(buildInstantChallengeWeakSongStatsKey());
    if (!stored) return empty;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed.songs !== "object" || parsed.songs === null) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function saveRawStatsData(data) {
  try {
    localStorage.setItem(buildInstantChallengeWeakSongStatsKey(), JSON.stringify(data));
    scheduleBackupSync(); // クラウドバックアップも更新する（js/backupSync.js参照）
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// 一瞬チャレンジで1問答えるたびに呼ぶ。js/weakSongStats.jsのrecordWeakSongAttempt()と同じく、
// プレイの完走を待たず、答えた瞬間ごとに保存する。
export function recordInstantChallengeWeakSongAttempt(songId, isCorrect) {
  const data = loadRawStatsData();
  const stat = data.songs[songId] ?? { attempts: 0, correct: 0 };
  stat.attempts += 1;
  if (isCorrect) stat.correct += 1;
  data.songs[songId] = stat;
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveRawStatsData(data);
}

// 曲ごとの集計値をそのまま返す（読み取り専用）。{ [songId]: { attempts, correct } } の形。
export function getInstantChallengeWeakSongStats() {
  return loadRawStatsData().songs;
}

// 一瞬チャレンジ版の苦手曲一覧を計算する。しきい値・並び順のロジックはjs/weakSongStats.jsの
// computeWeakSongsFromStats()をそのまま再利用する（重複実装しない）。
export function computeInstantChallengeWeakSongs() {
  return computeWeakSongsFromStats(getInstantChallengeWeakSongStats());
}
