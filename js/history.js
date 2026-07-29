// プレイ履歴（過去のプレイ結果）を、ブラウザのlocalStorageに保存・読み込みするファイル。
// highscore.js・titleProgress.jsと同じく、localStorageへの読み書きは必ずこのファイルを経由し、
// 他のファイルが直接localStorageを触ることはない。
//
// 「1プレイ＝1レコード」として、新しい順の配列でまとめて1つのキーに保存する。
// ハイスコア・称号のように出題数ごとに保存キーを分けていないのは、履歴は時系列で
// 一覧したいデータのため（1つの配列にしておけば、新しい順に並べるだけで一覧になる）。

const HISTORY_KEY = "equalLoveIntroQuiz.playHistory";
const CURRENT_SCHEMA_VERSION = 1;

// 保存する履歴の最大件数。個人用の記録なので無制限には増やさず、
// 古いものから自動的に切り捨てる（想定容量はHANDOFF.md参照。100件でも余裕がある）。
const MAX_HISTORY_ENTRIES = 100;

// 履歴1件ごとの一意なID。crypto.randomUUID()が使える環境ではそれを使い、
// 使えない環境（対応していない古いブラウザ等）向けには、時刻＋乱数文字列で代替する。
function generateHistoryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// 保存されている履歴データを読み込む。
// 未保存・JSONとして壊れている・想定外の形など、何らかの理由で読み込めない場合は、
// アプリ全体を止めないよう「履歴なし」の状態として扱う。
function loadHistoryData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, entries: [] };
  try {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return empty;

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed.entries)) return empty;
    return parsed;
  } catch {
    return empty;
  }
}

function saveHistoryData(data) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(data));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// ミリ秒の値を、保存用に小数第1位で丸める。nullはそのままnullを返す。
// performance.now()由来の生の値は小数点以下が長く、保存データが無駄に大きくなるため。
function roundMs(ms) {
  return ms === null ? null : Math.round(ms * 10) / 10;
}

// 今回のプレイ結果から、履歴レコード1件分を組み立てて保存する。
//
// gameState   : 今回のプレイのgameState（answerLog・questions・score等を参照する）
// playResult  : titleProgress.jsのbuildPlayResult()の戻り値（correctCount・averageCorrectElapsedMs等）
// rank        : score.jsのcalculateRank()の戻り値（"S"|"A"|"B"|"C"）
// isNewRecord : highscore.jsのsaveHighScoreIfBetter()の戻り値
// titleEvents : titleProgress.jsのevaluateAndSaveTitles()の戻り値
//               （今回条件を達成した称号すべて。repeatも含む。表示側でnew/unlock-and-newだけに
//               絞り込むかどうかは、この関数の責務ではなく履歴画面側の責務とする）
export function saveHistoryEntry(gameState, playResult, { rank, isNewRecord, titleEvents }) {
  const data = loadHistoryData();

  const entry = {
    id: generateHistoryId(),
    playedAt: Date.now(),
    questionCountValue: gameState.questionCountValue,
    categoryFilterValue: gameState.categoryFilterValue,
    questionCount: playResult.totalQuestions,
    score: gameState.score,
    maxScore: playResult.totalQuestions * 10,
    rank,
    correctCount: playResult.correctCount,
    averageCorrectElapsedMs: roundMs(playResult.averageCorrectElapsedMs),
    isNewRecord,
    // 称号id・typeだけを保存する（曲名・カテゴリと同じく、称号名などsongs.js/titleDefinitions.js
    // から取得できる情報は重複して持たない）。
    titleResults: titleEvents.map((event) => ({ id: event.id, type: event.type })),
    // 曲別の内訳。今回の画面では表示しないが、将来の「苦手な曲」機能などのために保存しておく。
    // 曲名・カテゴリはsongs.js側から取得できるため、ここではsongIdだけを持つ。
    answers: gameState.answerLog.map((logEntry) => ({
      songId: logEntry.song.id,
      result: logEntry.resultType,
      elapsedMs: roundMs(logEntry.elapsedMs),
      score: logEntry.pointsEarned,
    })),
  };

  data.entries.unshift(entry); // 新しい順に並べるため、先頭に追加する
  if (data.entries.length > MAX_HISTORY_ENTRIES) {
    data.entries.length = MAX_HISTORY_ENTRIES; // 最新の分だけ残し、古いものは切り捨てる
  }
  data.schemaVersion = CURRENT_SCHEMA_VERSION;

  saveHistoryData(data);
  return entry;
}

// 保存されている履歴一覧を、新しい順のまま返す（読み取り専用）。
export function getHistoryEntries() {
  return loadHistoryData().entries;
}

// 履歴をすべて削除する。
export function clearHistoryEntries() {
  saveHistoryData({ schemaVersion: CURRENT_SCHEMA_VERSION, entries: [] });
}

// 履歴一覧画面の上部サマリーに使う集計値を計算する。
// 出題数が異なるプレイ同士は満点が違うため得点をそのまま比較できず、平均得点は使わない。
// 代わりに、総回答数・全体正答率という比較しやすい指標を中心にする。
export function computeHistorySummary(entries) {
  const totalPlayCount = entries.length;
  const totalQuestionCount = entries.reduce((sum, entry) => sum + entry.questionCount, 0);
  const totalCorrectCount = entries.reduce((sum, entry) => sum + entry.correctCount, 0);
  const overallAccuracy = totalQuestionCount > 0 ? totalCorrectCount / totalQuestionCount : null;

  return { totalPlayCount, totalQuestionCount, overallAccuracy };
}

// 苦手曲モードの判定条件。1回だけたまたま外れた曲が「苦手」認定されるのを防ぐため、
// 出題回数の下限を設けている（本人と相談の上で決定した値）。
const WEAK_SONG_MIN_APPEARANCES = 3;
const WEAK_SONG_MAX_ACCURACY = 0.5;

// プレイ履歴全体（最新100件）を曲IDごとに集計し、「3回以上出題され、正答率50%未満」の曲を、
// 正答率が低い順（同率なら不正解回数が多い順）に並べて返す。苦手曲モードの判定に使う。
// 曲名などsongs.js側の情報は持たず、songIdだけを返す（呼び出し側でsongs.jsから引く）。
export function computeWeakSongs(entries) {
  const statsBySongId = new Map();

  entries.forEach((entry) => {
    entry.answers.forEach((answer) => {
      const stats = statsBySongId.get(answer.songId) ?? { appearances: 0, correctCount: 0 };
      stats.appearances += 1;
      if (answer.result === "correct") {
        stats.correctCount += 1;
      }
      statsBySongId.set(answer.songId, stats);
    });
  });

  return [...statsBySongId.entries()]
    .map(([songId, stats]) => ({
      songId,
      appearances: stats.appearances,
      correctCount: stats.correctCount,
      accuracy: stats.correctCount / stats.appearances,
    }))
    .filter(
      (stat) => stat.appearances >= WEAK_SONG_MIN_APPEARANCES && stat.accuracy < WEAK_SONG_MAX_ACCURACY
    )
    .sort((a, b) => {
      if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;
      const aWrongCount = a.appearances - a.correctCount;
      const bWrongCount = b.appearances - b.correctCount;
      return bWrongCount - aWrongCount;
    });
}
