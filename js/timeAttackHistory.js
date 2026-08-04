// タイムアタック専用のプレイ履歴を、ブラウザのlocalStorageに保存・読み込みするファイル。
// js/history.js（通常プレイの履歴）と全く同じ設計パターン（1プレイ＝1レコード、新しい順の配列、
// プレイヤーごとの接頭辞、最大件数での切り捨て）を踏襲しつつ、保存先のキー名を完全に分けることで、
// 既存の通常プレイ履歴とは一切混ざらないようにしている（本人の要望どおり）。

import { getPlayerKeyPrefix, getActivePlayer } from "./playerProfile.js";

function buildTimeAttackHistoryKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}timeAttackHistory`;
}
const CURRENT_SCHEMA_VERSION = 1;

// 保存する履歴の最大件数。js/history.jsと同じ考え方・同じ件数にしている。
const MAX_HISTORY_ENTRIES = 100;

// 履歴1件ごとの一意なID。js/history.jsのgenerateHistoryId()と同じ実装。
function generateHistoryId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function loadHistoryData() {
  const empty = { schemaVersion: CURRENT_SCHEMA_VERSION, entries: [] };
  try {
    const stored = localStorage.getItem(buildTimeAttackHistoryKey());
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
    localStorage.setItem(buildTimeAttackHistoryKey(), JSON.stringify(data));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// ミリ秒の値を、保存用に小数第1位で丸める。nullはそのままnullを返す。
function roundMs(ms) {
  return ms === null ? null : Math.round(ms * 10) / 10;
}

// 今回のタイムアタックの結果から、履歴レコード1件分を組み立てて保存する。
// js/timeAttackScreen.jsのrenderTimeAttackResult()からだけ呼ばれる想定
// （結果画面が描画されたとき＝中断せず最後まで進んだ／LOVE連チャンで失敗したとき、のみ保存される。
// 「タイトルへ」で中断した場合は、既存の通常プレイ履歴と同じく履歴に残らない）。
export function saveTimeAttackHistoryEntry({
  rule,
  questionCountValue,
  categoryFilterValue,
  totalElapsedMs,
  correctCount,
  missCount,
  completed,
  failedAtQuestionNumber,
  isNewRecord,
  perQuestionResults,
}) {
  const data = loadHistoryData();
  const activePlayer = getActivePlayer();

  const entry = {
    id: generateHistoryId(),
    playerId: activePlayer.playerId,
    playerName: activePlayer.playerName,
    playedAt: Date.now(),
    questionCountValue,
    categoryFilterValue,
    rule,
    totalElapsedMs: roundMs(totalElapsedMs),
    correctCount,
    missCount,
    completed,
    failedAtQuestionNumber,
    isNewRecord,
    // 各問題の内訳。詳細画面（timeAttackHistoryDetailScreen.js）でのみ使う、やや重いデータのため、
    // 一覧側では参照しない（一覧はquestionCount等のサマリー値だけで組み立てる）。
    questions: perQuestionResults.map((question) => ({
      questionNumber: question.questionNumber,
      songId: question.songId,
      choices: question.choices,
      correctAnswer: question.correctAnswer,
      selectedAnswers: question.selectedAnswers,
      elapsedMs: roundMs(question.elapsedMs),
      mistakeCount: question.missCountThisQuestion,
      isCorrect: question.isCorrect,
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
// 通常プレイ履歴と違い、現在選択中のプレイヤーの履歴しか保存キー自体に含まれないため
// （buildTimeAttackHistoryKey()がgetPlayerKeyPrefix()でプレイヤーごとに分かれる）、
// ここでのフィルタリングは不要（プレイヤーごとに完全に別々のkeyに保存されている）。
export function getTimeAttackHistoryEntries() {
  return loadHistoryData().entries;
}

// ===== 苦手曲判定へのタイムアタック結果の反映（2026-08-06追加） =====
// js/history.jsのcomputeWeakSongs()と同じ考え方（3回以上出題され、基準を満たさない曲を抽出）
// だが、あえて別関数のまま独立させている。理由：タイムアタックのノーマルルールは「正解するまで
// やり直せる」仕組みのため、その問題の最終的な正誤（isCorrect）は常にtrueになってしまい、
// 通常プレイと同じ基準（正誤の比率）では判定できない。代わりに「その問題で何回間違えたか
// （mistakeCount）」を基準にする——1回でも間違えていればmistakeCount>0になるため、
// ノーマル・ハード・LOVE連チャンのどのルールでも一貫して使える指標になる。
// 判定を1つの計算式に無理に混ぜ込まず、それぞれのモードに合った基準で別々に判定してから
// 呼び出し側（weakSongsScreen.js）で統合する方針にした方が、後から見て分かりやすく、
// 保守もしやすいと判断した（本人と相談のうえで決定）。
const TIME_ATTACK_WEAK_MIN_APPEARANCES = 3;
const TIME_ATTACK_WEAK_MAX_NO_MISTAKE_RATE = 0.5;

// タイムアタックの履歴（全ルール込み）を曲IDごとに集計し、「3回以上出題され、ノーミス率50%未満
// （＝半分以上の出題で1回以上間違えている）」の曲を、ノーミス率が低い順（同率ならミス回数が
// 多い順）に並べて返す。songs.js側の情報（曲名等）は持たず、songIdだけを返す
// （js/history.jsのcomputeWeakSongs()と同じ設計方針）。
export function computeTimeAttackWeakSongs(entries) {
  const statsBySongId = new Map();

  entries.forEach((entry) => {
    entry.questions.forEach((question) => {
      const stats = statsBySongId.get(question.songId) ?? { appearances: 0, mistakeAppearances: 0 };
      stats.appearances += 1;
      if (question.mistakeCount > 0) {
        stats.mistakeAppearances += 1;
      }
      statsBySongId.set(question.songId, stats);
    });
  });

  return [...statsBySongId.entries()]
    .map(([songId, stats]) => ({
      songId,
      appearances: stats.appearances,
      mistakeAppearances: stats.mistakeAppearances,
      noMistakeRate: (stats.appearances - stats.mistakeAppearances) / stats.appearances,
    }))
    .filter(
      (stat) =>
        stat.appearances >= TIME_ATTACK_WEAK_MIN_APPEARANCES &&
        stat.noMistakeRate < TIME_ATTACK_WEAK_MAX_NO_MISTAKE_RATE
    )
    .sort((a, b) => {
      if (a.noMistakeRate !== b.noMistakeRate) return a.noMistakeRate - b.noMistakeRate;
      return b.mistakeAppearances - a.mistakeAppearances;
    });
}
