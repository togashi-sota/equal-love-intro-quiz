// シャッフル（ランダム再生）専用の苦手曲判定に使う、曲ごとの合計回答数・正解数を記録する
// ファイル（2026-08-30新設、本人指示：苦手曲モードを5系統〈イントロ／アウトロ／シャッフル／
// リリック／一瞬〉へ完全分離）。
//
// 【なぜ新設したか】これまでjs/weakSongStats.jsは「イントロ・イントロタイムアタック・
// ランダム再生・ランダム再生タイムアタック」の4モードを1つの合算データとして記録していた。
// しかし「イントロ苦手曲を練習してもシャッフルの弱点が分からない／シャッフル苦手曲を選んでも
// 結局イントロ形式で出題される」という実際の不具合につながっていたため、本人指示で
// イントロとシャッフルを完全に別々のデータへ分離することになった。
//
// 【既存データの扱い（本人指示・重要）】js/weakSongStats.jsの既存データは、曲ごとに
// 「合計回答数・合計正解数」という単純な積算値だけを持ち、その内訳が「イントロ由来か
// シャッフル由来か」を一切区別していない（1つの数値に混ざり込んでいる）。そのため、
// 過去のデータから100%正確にシャッフル分だけを取り出すことはできない
// （本人指示：「100%正確に分離できない情報は推測で分離しない」）。
// そこで、js/weakSongStats.js側のデータには一切手を加えず既存の記録をそのまま「イントロの
// 記録」として使い続け、シャッフル分だけをこの新しいファイル・新しいlocalStorageキーとして
// 今後のプレイから記録し始める、という安全な後方互換方式を採用した。
// 既存ユーザーの苦手曲記録が消える・0になる・別モードへ勝手に移る、ということは起こらない。
//
// 【対象】通常のランダム再生クイズ（gameState.playMode==="randomPlayback"）と、
// ランダム再生タイムアタック（gameState.playMode==="timeAttack" かつ
// currentVariant===TIME_ATTACK_VARIANT.RANDOM_PLAYBACK）の2つ。
// 判定しきい値・並び順のロジックはjs/weakSongStats.jsのcomputeWeakSongsFromStats()・
// WEAK_SONG_MIN_ATTEMPTS・WEAK_SONG_MAX_ACCURACYをそのまま再利用する
// （同じ判定基準を複数箇所に重複して書かない、本人指示に沿った一元化）。
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildShuffleWeakSongStatsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}shuffleWeakSongStats`;
}

const CURRENT_SCHEMA_VERSION = 1;

function loadRawStatsData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, songs: {} };
  try {
    const stored = localStorage.getItem(buildShuffleWeakSongStatsKey());
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
    localStorage.setItem(buildShuffleWeakSongStatsKey(), JSON.stringify(data));
    scheduleBackupSync(); // クラウドバックアップも更新する（js/backupSync.js参照）
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// シャッフル（ランダム再生）で1問答えるたびに呼ぶ。
export function recordShuffleWeakSongAttempt(songId, isCorrect) {
  const data = loadRawStatsData();
  const stat = data.songs[songId] ?? { attempts: 0, correct: 0 };
  stat.attempts += 1;
  if (isCorrect) stat.correct += 1;
  data.songs[songId] = stat;
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveRawStatsData(data);
}

// 曲ごとの集計値をそのまま返す（読み取り専用）。{ [songId]: { attempts, correct } } の形。
export function getShuffleWeakSongStats() {
  return loadRawStatsData().songs;
}
