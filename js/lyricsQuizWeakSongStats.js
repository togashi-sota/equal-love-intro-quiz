// 歌詞クイズ専用の苦手曲判定に使う、曲ごとの合計回答数・正解数を記録するファイル
// （2026-08-29新設、本人指示）。
//
// 【なぜ既存のjs/weakSongStats.jsと分けるか】既存の苦手曲モードは、通常イントロクイズ・
// イントロタイムアタック・通常のランダム再生クイズ・ランダム再生タイムアタックの4モードだけを
// 合算して判定している。歌詞クイズはヒントを使った記憶・連想が中心の全く別の遊び方のため、
// 「イントロは得意だが歌詞は苦手」「歌詞は得意だがイントロは苦手」という曲が両方ありうる
// （本人指示の具体例：イントロ正答率100%・歌詞クイズ正答率50%の曲は、苦手曲モードAでは
// 苦手曲扱いにならないが、歌詞クイズ版の苦手曲モードBでは苦手曲として扱われるべき、
// その逆も同様）。そのため、記録そのものを完全に別のlocalStorageキーへ分離し、
// 集計が一切混ざらないようにしている。
//
// 【しきい値の一元化】「何回answer中、正答率何%未満なら苦手曲か」の判定ロジック・数値は
// js/weakSongStats.jsのcomputeWeakSongsFromStats()・WEAK_SONG_MIN_ATTEMPTS・
// WEAK_SONG_MAX_ACCURACYをそのまま再利用する（同じ判定基準を2箇所に重複して書かない）。
//
// 【対象・除外】記録するのは「通常の1人用歌詞クイズ（カテゴリー絞り込みで出題）」の回答だけ。
// 苦手曲モードB自身の練習プレイ・オンライン対戦・（将来の）オリジナル問題作成モードの
// 歌詞クイズ枠は対象外にする（js/weakSongStats.jsが元々の4モードで「苦手曲モード自身は
// 対象外」としているのと同じ考え方：苦手曲判定のための練習結果を判定へ書き戻すと、
// 判定が実力以外の要因で歪む・自己強化ループになるため）。呼び出し側
// （js/lyricsQuizScreen.js）が、通常の入り口から開始した回だけこの関数を呼ぶ。
//
// 【過去データの移行について】既存の歌詞クイズのプレイ履歴（js/lyricsQuizScreen.jsの
// savePlayHistoryEntry）は、プレイ全体の集計（正解数・ヒント使用数等）だけを保存し、
// 曲ごとの内訳を保存しない設計のため、この機能追加より前のプレイから初期値を復元することは
// できない（js/weakSongStats.jsが通常のランダム再生クイズを復元できないのと同じ理由・
// 同じ限界）。新規データの欠損ではなく、記録の粒度の限界であり、今後のプレイからは
// 記録されていく。
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { computeWeakSongsFromStats } from "./weakSongStats.js";

function buildLyricsQuizWeakSongStatsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}lyricsQuizWeakSongStats`;
}

const CURRENT_SCHEMA_VERSION = 1;

function loadRawStatsData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, songs: {} };
  try {
    const stored = localStorage.getItem(buildLyricsQuizWeakSongStatsKey());
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
    localStorage.setItem(buildLyricsQuizWeakSongStatsKey(), JSON.stringify(data));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// 歌詞クイズで1問答えるたびに呼ぶ。js/weakSongStats.jsのrecordWeakSongAttempt()と同じく、
// プレイの完走を待たず、答えた瞬間ごとに保存する（アプリを閉じる等で中断されても、
// 答えた分の記録は失わないようにするため）。
export function recordLyricsQuizWeakSongAttempt(songId, isCorrect) {
  const data = loadRawStatsData();
  const stat = data.songs[songId] ?? { attempts: 0, correct: 0 };
  stat.attempts += 1;
  if (isCorrect) stat.correct += 1;
  data.songs[songId] = stat;
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveRawStatsData(data);
}

// 曲ごとの集計値をそのまま返す（読み取り専用）。{ [songId]: { attempts, correct } } の形。
export function getLyricsQuizWeakSongStats() {
  return loadRawStatsData().songs;
}

// 歌詞クイズ版の苦手曲一覧を計算する。しきい値・並び順のロジックはjs/weakSongStats.jsの
// computeWeakSongsFromStats()をそのまま再利用する（重複実装しない）。
export function computeLyricsQuizWeakSongs() {
  return computeWeakSongsFromStats(getLyricsQuizWeakSongStats());
}
