// プレイヤープロフィール（複数プレイヤー対応）を管理するファイル。
// 1つの端末に複数のプレイヤーを作成し、プレイ履歴・自己ベスト・称号・推しメン等を
// プレイヤーごとに分けて管理できるようにする（2026-08-03新設、HANDOFF 10-29章参照）。
//
// 【最重要の設計方針】最初のプレイヤー（DEFAULT_PLAYER_ID）は、今までの端末データを
// そのまま引き継ぐ特別なプレイヤーとして扱う。highscore.js/history.js/titleProgress.js等の
// 保存キーは、このプレイヤーのときだけ従来通りの名前をそのまま使い、2人目以降の
// プレイヤーだけ新しいキー形式（例: equalLoveIntroQuiz.player.{playerId}.〜）を使う。
// これにより、既存データのコピー・移行処理が一切不要になり、データ消失リスクをなくしている
// （実際にhighscore.js等をプレイヤー対応させるのは次の段階。このファイル単体では
// プレイヤーの一覧管理・切り替えロジックだけを提供する）。

const PLAYERS_KEY = "equalLoveIntroQuiz.players";
const ACTIVE_PLAYER_ID_KEY = "equalLoveIntroQuiz.activePlayerId";

// 最初のプレイヤーの固定ID。「今までの端末データ」を表す特別な値として扱う。
export const DEFAULT_PLAYER_ID = "default";

function generatePlayerId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // crypto.randomUUIDが使えない古い環境向けの簡易フォールバック。
  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

// プレイヤー一覧をメモリ上に軽くキャッシュする。highscore.js/history.js/titleProgress.js等が
// 保存キーを組み立てるたびに（1回の称号判定だけで20〜30回呼ばれる）毎回localStorageから
// 読み直してJSONパースするのは無駄が大きいため、変更（追加・削除・名前変更・切替）があった
// ときだけ再読み込みする（2026-08-03、Step3着手前のレビューで対応）。
// ページを開き直せばリセットされる、あくまで同一セッション内だけのキャッシュ。
let cachedPlayers = null;

function readPlayers() {
  if (cachedPlayers !== null) return cachedPlayers;
  try {
    const stored = localStorage.getItem(PLAYERS_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    cachedPlayers = parsed;
    return cachedPlayers;
  } catch {
    return null;
  }
}

function writePlayers(players) {
  cachedPlayers = players;
  try {
    localStorage.setItem(PLAYERS_KEY, JSON.stringify(players));
  } catch {
    // 保存に失敗しても（プライベートブラウズ等）アプリ自体は動き続けられるようにする。
  }
}

// 初回起動時に、既存の端末データを引き継ぐ最初のプレイヤーを1件だけ作成する。
// すでにplayersが保存されていれば何もしない（2回目以降の起動でリセットされないように）。
function ensureDefaultPlayer() {
  const existing = readPlayers();
  if (existing && existing.length > 0) return existing;

  const defaultPlayer = {
    playerId: DEFAULT_PLAYER_ID,
    playerName: "",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const players = [defaultPlayer];
  writePlayers(players);
  return players;
}

// 登録済みプレイヤー一覧を返す（先頭は必ずデフォルトプレイヤー）。
export function getPlayers() {
  return ensureDefaultPlayer();
}

// 現在選択中のプレイヤーIDを返す。未保存、または保存されていたIDがすでに存在しない
// （削除済み等）場合はデフォルトプレイヤーにフォールバックする。
export function getActivePlayerId() {
  const players = ensureDefaultPlayer();
  try {
    const stored = localStorage.getItem(ACTIVE_PLAYER_ID_KEY);
    if (stored && players.some((player) => player.playerId === stored)) {
      return stored;
    }
  } catch {
    // 読み込み失敗時はデフォルトプレイヤーにフォールバックする。
  }
  return DEFAULT_PLAYER_ID;
}

// 現在選択中のプレイヤーの情報（オブジェクト全体）を返す。
export function getActivePlayer() {
  const activeId = getActivePlayerId();
  const players = getPlayers();
  return players.find((player) => player.playerId === activeId) ?? players[0];
}

// 選択中のプレイヤーを切り替える。存在しないIDを渡した場合は何もしない
// （UI側の不具合で不正なIDが渡っても、静かに無視して壊れないようにするため）。
export function setActivePlayerId(playerId) {
  if (!getPlayers().some((player) => player.playerId === playerId)) return;
  try {
    localStorage.setItem(ACTIVE_PLAYER_ID_KEY, playerId);
  } catch {
    // 保存に失敗してもアプリは動き続けられるようにする。
  }
}

// 新しいプレイヤーを追加する。新しいplayerId・初期状態のデータを持つ、完全に別人として扱う
// （履歴・自己ベスト・称号・推しメン等は、このplayerIdに紐づく新しいキーで始まる）。
// 「名前を変更」（renamePlayer）とは明確に分け、意図せず新しいデータになったり
// 逆に他人の履歴を引き継いだりしないようにする（本人方針）。
export function addPlayer(playerName) {
  const players = getPlayers();
  const newPlayer = {
    playerId: generatePlayerId(),
    playerName: playerName.trim(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  writePlayers([...players, newPlayer]);
  return newPlayer;
}

// 指定したプレイヤーの名前だけを変更する（プレイ履歴等のデータはそのまま維持する）。
export function renamePlayer(playerId, newName) {
  const players = getPlayers();
  const updated = players.map((player) =>
    player.playerId === playerId
      ? { ...player, playerName: newName.trim(), updatedAt: nowIso() }
      : player
  );
  writePlayers(updated);
}

// プレイヤーを削除する。デフォルトプレイヤーは削除できない（必ず1人は残す設計）。
// 削除したプレイヤーが選択中だった場合は、自動的にデフォルトプレイヤーへ切り替える。
//
// 注意：このファイルはプレイヤー一覧の管理だけを行う。履歴・自己ベスト・称号・推しメン等の
// 実データ（equalLoveIntroQuiz.player.{playerId}.〜のキー群）の削除は、呼び出し側
// （確認モーダルを出すUI側）が別途行う想定。このファイル単体では、どの機能がどんなキーを
// 使っているかを把握していないため、一覧からの削除だけに責任を絞っている。
export function deletePlayer(playerId) {
  if (playerId === DEFAULT_PLAYER_ID) return;
  const currentActiveId = getActivePlayerId();
  const players = getPlayers().filter((player) => player.playerId !== playerId);
  writePlayers(players);
  if (currentActiveId === playerId) {
    setActivePlayerId(DEFAULT_PLAYER_ID);
  }
}

// 指定したプレイヤーがデフォルトプレイヤー（＝既存の端末データをそのまま使うプレイヤー）かどうか。
export function isDefaultPlayer(playerId) {
  return playerId === DEFAULT_PLAYER_ID;
}

// highscore.js/history.js/titleProgress.js等が、保存キーの先頭に付ける接頭辞を返す。
// デフォルトプレイヤーのときは空文字列（＝今まで通りのキー名をそのまま使う、
// 例: "equalLoveIntroQuiz.highScore.5.all"）、それ以外は"player.{playerId}."を返す
// （例: "equalLoveIntroQuiz.player.abc123.highScore.5.all"）。
// これにより、最初のプレイヤーは既存データを一切コピー・移行せずそのまま使い続けられる。
export function getPlayerKeyPrefix() {
  const activePlayerId = getActivePlayerId();
  return isDefaultPlayer(activePlayerId) ? "" : `player.${activePlayerId}.`;
}
