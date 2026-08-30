// アウトロ専用の苦手曲判定に使う、曲ごとの合計回答数・正解数を記録するファイル
// （2026-08-30新設、本人指示：苦手曲モードを5系統〈イントロ／アウトロ／シャッフル／
// リリック／一瞬〉へ完全分離）。
//
// 【経緯】アウトロクイズを主要モード化した直後は、js/weakSongStats.js（イントロ・シャッフル
// 合算の既存プール）へそのまま合流させる設計にしていたが、本人指示により「苦手曲は5系統を
// 完全に独立させる」方針へ変更されたため、専用の記録先を新設した。
// 合流させていた期間はごく短く、実データへの影響は軽微と判断し、js/shuffleWeakSongStats.js
// と同じ理由・同じ方式（既存データは一切書き換えず、今後のプレイから新しい専用の記録を
// 開始する）で安全に切り出した。
//
// 【対象】アウトロクイズの通常導線（gameState.playMode==="special"・
// gameState.specialModeId==="outroQuiz"）だけ。オリジナル問題作成モード経由
// （specialModeId==="customQuizOutro"）は、他モードのオリジナル問題作成と同じく対象外
// （本人方針：カスタム選曲プレイを苦手曲判定に混ぜない）。
// 判定しきい値・並び順のロジックはjs/weakSongStats.jsのcomputeWeakSongsFromStats()・
// WEAK_SONG_MIN_ATTEMPTS・WEAK_SONG_MAX_ACCURACYをそのまま再利用する。
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { scheduleBackupSync } from "./backupSync.js";

function buildOutroWeakSongStatsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}outroWeakSongStats`;
}

const CURRENT_SCHEMA_VERSION = 1;

function loadRawStatsData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, songs: {} };
  try {
    const stored = localStorage.getItem(buildOutroWeakSongStatsKey());
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
    localStorage.setItem(buildOutroWeakSongStatsKey(), JSON.stringify(data));
    scheduleBackupSync(); // クラウドバックアップも更新する（js/backupSync.js参照）
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// アウトロクイズ（通常導線）で1問答えるたびに呼ぶ。
export function recordOutroWeakSongAttempt(songId, isCorrect) {
  const data = loadRawStatsData();
  const stat = data.songs[songId] ?? { attempts: 0, correct: 0 };
  stat.attempts += 1;
  if (isCorrect) stat.correct += 1;
  data.songs[songId] = stat;
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveRawStatsData(data);
}

// 曲ごとの集計値をそのまま返す（読み取り専用）。{ [songId]: { attempts, correct } } の形。
export function getOutroWeakSongStats() {
  return loadRawStatsData().songs;
}
