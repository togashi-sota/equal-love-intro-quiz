// パーティー対戦（2026-09-15新設）の「端末に残す小さなデータ」を担当するファイル。
//   ・直近に使ったプレイヤー名（次回の候補として再利用）
//   ・前回の設定（「設定を変えて再戦」「次回開いたとき」の初期値）
//   ・プレイ履歴（js/playHistory.js）へ保存する1件分のデータの組み立て
// 保存キーはすべて "equalLoveIntroQuiz.partyBattle." で始め、既存の保存キー（旧1台対戦の
// localBattle系や自己ベスト等）と衝突しないようにする（本人確定：partyBattle*名前空間）。
//
// 【絶対に記録しないもの】パーティー対戦は個人の自己ベスト・Firebaseランキング
// （timeAttackLeaderboardsV3）・称号進捗・苦手曲統計を一切更新しない。旧1台対戦の
// 「履歴だけ残す」思想を継承する。このファイルはそれらのモジュールをimportしない。

import { normalizePartySettings, computeStandings, PARTY_QUIZ_TYPE_LABELS, PARTY_SONG_SOURCE_LABELS } from "./partyBattleState.js";
import { savePlayHistoryEntry } from "./playHistory.js";

const RECENT_NAMES_KEY = "equalLoveIntroQuiz.partyBattle.recentNames";
const LAST_SETTINGS_KEY = "equalLoveIntroQuiz.partyBattle.lastSettings";
const MAX_RECENT_NAMES = 12;

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* 容量超過・プライベートモード等では黙って諦める（ゲーム進行には影響しない） */
  }
}

// 直近のプレイヤー名（新しい順、重複なし）。
export function getRecentPartyPlayerNames() {
  const names = readJson(RECENT_NAMES_KEY, []);
  return Array.isArray(names) ? names.filter((name) => typeof name === "string" && name.trim()) : [];
}

// 今回使った名前を先頭に追加して保存する（既定名「プレイヤーN」は候補に入れない）。
export function rememberPartyPlayerNames(names) {
  const existing = getRecentPartyPlayerNames();
  const merged = [];
  [...names, ...existing].forEach((rawName) => {
    const name = typeof rawName === "string" ? rawName.trim() : "";
    if (!name || /^プレイヤー\d+$/.test(name)) return;
    if (!merged.includes(name)) merged.push(name);
  });
  writeJson(RECENT_NAMES_KEY, merged.slice(0, MAX_RECENT_NAMES));
}

export function getLastPartySettings() {
  return normalizePartySettings(readJson(LAST_SETTINGS_KEY, null));
}

export function saveLastPartySettings(settings) {
  writeJson(LAST_SETTINGS_KEY, normalizePartySettings(settings));
}

// 選曲ソースの表示名（履歴・結果画面用）。曲リスト全量は保存しない（本人確定）。
export function describePartySongSource(settings, { playlistName = null } = {}) {
  if (settings.songSource === "manual") return `曲を選んで出題（${settings.manualSongIds.length}曲）`;
  if (settings.songSource === "playlist") return playlistName ? `プレイリスト「${playlistName}」` : "プレイリスト";
  return PARTY_SONG_SOURCE_LABELS[settings.songSource] ?? settings.songSource;
}

// 完走した試合をプレイ履歴へ保存する1件分のデータを組み立てる（純粋関数）。
// 途中終了した試合には呼ばない（呼び出し側の責務。本人確定：途中終了は保存しない）。
export function buildPartyBattleHistoryEntry(match, { playlistName = null, playedAt = Date.now() } = {}) {
  const standings = computeStandings(match);
  const { settings } = match;
  const totalCorrect = standings.reduce((sum, row) => sum + row.score, 0);
  return {
    playedAt,
    modeId: "partyBattle",
    modeLabel: "パーティー対戦",
    questionCount: match.plannedCount,
    isAllSongsMode: settings.songSource === "all",
    correctCount: totalCorrect,
    wrongCount: match.stats.wrongCount,
    skippedCount: match.stats.passCount,
    score: null,
    averageResponseMs: null,
    completed: true,
    details: {
      playerCount: match.players.length,
      quizType: settings.quizType,
      quizTypeLabel: PARTY_QUIZ_TYPE_LABELS[settings.quizType] ?? settings.quizType,
      plannedQuestionCount: match.plannedCount,
      songSource: settings.songSource,
      songSourceLabel: describePartySongSource(settings, { playlistName }),
      answerMethod: settings.answerMethod,
      otetsuki: settings.otetsuki,
      voiceStartTimeoutSec: settings.answerMethod === "voice" ? settings.voiceStartTimeoutSec : null,
      instantClipSec: settings.quizType === "instant" ? Number(settings.instantClipSec) : null,
      instantMaxListens: settings.quizType === "instant" ? settings.instantMaxListens : null,
      hadSuddenDeath: match.stats.suddenDeathQuestionCount > 0,
      suddenDeathQuestionCount: match.stats.suddenDeathQuestionCount,
      participantCount: match.players.length,
      winnerId: match.winnerId,
      standings: standings.map((row) => ({
        playerName: row.name,
        rank: row.rank,
        score: row.score,
        color: row.color,
        isWinner: row.playerId === match.winnerId,
      })),
    },
  };
}

// 完走した試合をプレイ履歴へ保存する（js/playHistory.jsへの唯一の書き込み口）。
export function savePartyBattleHistory(match, options) {
  return savePlayHistoryEntry(buildPartyBattleHistoryEntry(match, options));
}
