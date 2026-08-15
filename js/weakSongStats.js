// 苦手曲判定専用の、1問ごとの回答記録を集計するファイル。
//
// js/history.js（通常プレイ履歴）・js/timeAttackHistory.js（タイムアタック履歴）は、
// どちらも「プレイが最後まで終わったときだけ」保存される設計になっている（本人の要望：
// 通常プレイ・タイムアタックの履歴機能自体は今まで通りにしたい）。そのため、途中で
// 「タイトルへ」戻って中断したプレイの回答は、これまで苦手曲の判定に一切反映されなかった。
//
// このファイルは、それとは別に「答えた瞬間に曲ごとの合計回答数・正解数だけを積み上げる」
// 専用の記録を持つ（2026-08-16新設、本人指示）。プレイ全体の詳細（何問目に何を選んだか等）は
// 持たず、曲ごとの合計値だけを持つ軽量な構造にしているため、履歴のような件数上限は設けていない。
//
// 対象は次の4モードのみ：通常イントロクイズ・イントロタイムアタック・
// 通常のランダム再生クイズ・ランダム再生タイムアタック。歌詞クイズ・対戦モード・復習モード・
// 苦手曲モード自身は対象外（呼び出し側でgameState.playModeを見て呼び分ける。
// js/state.jsのrecordAnswer()・js/timeAttackScreen.jsのrecordTimeAttackAnswer()を参照）。

import { getPlayerKeyPrefix } from "./playerProfile.js";
import { getHistoryEntries } from "./history.js";
import { getTimeAttackHistoryEntries } from "./timeAttackHistory.js";

function buildWeakSongStatsKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}weakSongStats`;
}

const CURRENT_SCHEMA_VERSION = 1;

function loadRawStatsData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, songs: {} };
  try {
    const stored = localStorage.getItem(buildWeakSongStatsKey());
    if (!stored) return null; // 未保存＝まだ一度も初期化していない、と区別するためnullを返す
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed.songs !== "object" || parsed.songs === null) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function saveRawStatsData(data) {
  try {
    localStorage.setItem(buildWeakSongStatsKey(), JSON.stringify(data));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// 曲ごとにattempts（合計回答数）を1増やし、isCorrectがtrueならcorrect（合計正解数）も1増やす。
function bumpStat(songs, songId, isCorrect) {
  const stat = songs[songId] ?? { attempts: 0, correct: 0 };
  stat.attempts += 1;
  if (isCorrect) stat.correct += 1;
  songs[songId] = stat;
}

// 【初回アクセス時だけの1回限りの移行処理】2026-08-16のこの機能追加より前から遊んでいる
// ユーザーの苦手曲一覧が、更新直後にいきなり空になってしまわないよう、既存のプレイ履歴・
// タイムアタック履歴（最後まで完走した分）から初期値を組み立てる。
//
// 正誤の判定基準は、既存のjs/history.js（answer.result === "correct"）・
// js/timeAttackHistory.js（question.mistakeCount === 0）の考え方をそのまま踏襲する
// （タイムアタックのノーマルルールは「正解するまでやり直せる」ため、mistakeCountが
// 0かどうかで「1回で正解できたか」を判定する。js/timeAttackHistory.jsのコメント参照）。
//
// 通常のランダム再生クイズ（js/playHistory.js）は、曲ごとの内訳を保存しない設計のため、
// 過去分は復元できない。これは新規のデータ欠損ではなく、今回の機能追加より前から
// 存在した記録の粒度の限界であり、今後のプレイからは他の3モードと同じく記録されていく。
function buildInitialStatsFromExistingHistory() {
  const songs = {};

  getHistoryEntries().forEach((entry) => {
    entry.answers.forEach((answer) => {
      bumpStat(songs, answer.songId, answer.result === "correct");
    });
  });

  getTimeAttackHistoryEntries().forEach((entry) => {
    entry.questions.forEach((question) => {
      bumpStat(songs, question.songId, question.mistakeCount === 0);
    });
  });

  return { schemaVersion: CURRENT_SCHEMA_VERSION, songs };
}

// 保存済みデータを読み込む。まだ一度も保存されていない場合だけ、既存履歴からの初期値を
// 組み立てて保存してから返す（2回目以降のアクセスでは移行処理を繰り返さない）。
function loadOrInitStatsData() {
  const existing = loadRawStatsData();
  if (existing !== null) return existing;

  const initial = buildInitialStatsFromExistingHistory();
  saveRawStatsData(initial);
  return initial;
}

// 1問答えるたびに呼ぶ。songIdの合計回答数・正解数を1件分だけ積み上げて、その場で保存する
// （プレイの完走を待たず、答えた瞬間ごとに保存するのは、アプリを閉じる・強制終了するなど
// 完走前に中断された場合でも、答えた分の記録は失わないようにするため。本人の要望どおり）。
export function recordWeakSongAttempt(songId, isCorrect) {
  const data = loadOrInitStatsData();
  bumpStat(data.songs, songId, isCorrect);
  data.schemaVersion = CURRENT_SCHEMA_VERSION;
  saveRawStatsData(data);
}

// 曲ごとの集計値をそのまま返す（読み取り専用）。{ [songId]: { attempts, correct } } の形。
export function getWeakSongStats() {
  return loadOrInitStatsData().songs;
}

const WEAK_SONG_MIN_ATTEMPTS = 3;
const WEAK_SONG_MAX_ACCURACY = 0.5;

// 苦手曲一覧を計算する。「合計3回以上答えていて、正答率が50%未満（ちょうど50%は対象外）」の
// 曲を、正答率が低い順（同率なら不正解数が多い順）に並べて返す。しきい値は既存の
// js/history.jsのcomputeWeakSongs()と完全に同じ値（本人と相談のうえで決めた値のため、
// 今回のモード統合でも変えていない）。
export function computeWeakSongsFromStats(songs) {
  return Object.entries(songs)
    .map(([songId, stat]) => ({
      songId,
      attempts: stat.attempts,
      correct: stat.correct,
      accuracy: stat.correct / stat.attempts,
    }))
    .filter(
      (stat) => stat.attempts >= WEAK_SONG_MIN_ATTEMPTS && stat.accuracy < WEAK_SONG_MAX_ACCURACY
    )
    .sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      const aWrongCount = a.attempts - a.correct;
      const bWrongCount = b.attempts - b.correct;
      return bWrongCount - aWrongCount;
    });
}
