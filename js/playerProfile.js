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

import {
  UID_MERGE_STATE,
  normalizeUidMergeQueue,
  enqueueUidMerge,
  selectActiveUidMerge,
  updateUidMergeEntry,
  buildLegacyPendingMirror,
  buildLegacyCompletedList,
  listKnownOldUids,
} from "./uidMergeQueue.js";

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
    // 表示名の変更・プレイヤー切り替え等で「今バックアップすべき内容」が変わりうるため、
    // クラウドバックアップも更新する（2026-08-29追加）。js/backupSync.js側がこのファイルを
    // importしている（getActivePlayer等）ため、循環参照を避けて動的importにしている。
    import("./backupSync.js").then(({ scheduleBackupSync }) => scheduleBackupSync());
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

// ---------------------------------------------------------------------------
// 【2026-10-29追加：プレイヤーの登録画面を分かりやすくする（本人の iPad での報告）】
// 「＋追加」を押しても、打てているのか・登録されたのかが分からなかった。画面（js/playerScreen.js）が
// 「名前が使えるか」「本当に保存できたか」を確かめてから閉じられるよう、確かめる関数を足す。
// 保存の形（players 一覧の中身・キー）は今までと同じ。addPlayer()・renamePlayer() もそのまま残す。
// ---------------------------------------------------------------------------
export const PLAYER_NAME_MAX_LENGTH = 20; // 入力欄の maxlength と同じ

// テスト用：players 一覧のキャッシュを捨てる（テストが保存場所を直接書き換えたあとに読み直させるため）
export function clearPlayersCacheForTest() {
  cachedPlayers = null;
}

// 名前の比べ方：前後の空白を除き、全角・半角と大文字・小文字の違いを同じとみなす
//（「そうた」と「そうた 」、「ＡＢＣ」と「abc」を別の人として2人作ってしまわないため）
export function normalizePlayerNameForCompare(name) {
  return String(name ?? "").normalize("NFKC").trim().toLowerCase();
}

// 名前が使えるかを確かめる（純粋関数）。exceptPlayerId は名前を変える本人（自分の今の名前とは重複扱いにしない）。
// 戻り値：{ ok:true, name } または { ok:false, reason:"empty"|"too-long"|"duplicate", message, duplicateOf? }
export function validatePlayerName(rawName, players, { exceptPlayerId = null } = {}) {
  const name = String(rawName ?? "").trim();
  if (!name) return { ok: false, reason: "empty", message: "名前を入力してください。" };
  if (name.length > PLAYER_NAME_MAX_LENGTH) {
    return { ok: false, reason: "too-long", message: `名前は${PLAYER_NAME_MAX_LENGTH}文字までです（今は${name.length}文字）。` };
  }
  const key = normalizePlayerNameForCompare(name);
  const duplicate = (players ?? []).find(
    (player) => player.playerId !== exceptPlayerId && player.playerName && normalizePlayerNameForCompare(player.playerName) === key
  );
  if (duplicate) {
    return {
      ok: false,
      reason: "duplicate",
      duplicateOf: duplicate.playerId,
      message: `「${duplicate.playerName}」はもう登録されています。上の一覧の名前を押すと、その人に切り替わります。`,
    };
  }
  return { ok: true, name };
}

// 端末（localStorage）に本当に書けたかを、キャッシュではなく保存場所を直接読んで確かめる。
// writePlayers() は保存に失敗しても例外を投げない（プライベートブラウズ等でもアプリを止めないため）ので、
// 画面が「登録しました」と言う前にここで確かめる。
function readStoredPlayersDirectly() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PLAYERS_KEY) ?? "null");
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isPlayerSavedToStorage(playerId, expectedName = null) {
  const stored = readStoredPlayersDirectly();
  const player = stored?.find((p) => p.playerId === playerId);
  if (!player) return false;
  return expectedName === null || player.playerName === expectedName;
}

function isActivePlayerIdSavedToStorage(playerId) {
  try {
    return localStorage.getItem(ACTIVE_PLAYER_ID_KEY) === playerId;
  } catch {
    return false;
  }
}

// 新しいプレイヤーを登録して、使用中にする。名前を確かめる → 追加 → 保存を確かめる → 使用中にする → 保存を確かめる。
// 保存できなかったときは、画面のキャッシュから取り消して { ok:false, reason:"save-failed" } を返す
//（保存されていない人が一覧に見えたまま「登録できた」と思い込ませないため）。既存のプレイヤーは一切書き換えない。
export function registerNewPlayer(rawName) {
  const check = validatePlayerName(rawName, getPlayers());
  if (!check.ok) return check;
  const newPlayer = addPlayer(check.name);
  if (!isPlayerSavedToStorage(newPlayer.playerId, check.name)) {
    cachedPlayers = null; // 保存場所の中身（＝追加されていない一覧）を読み直させる
    return { ok: false, reason: "save-failed", message: "この端末に保存できませんでした（空き容量・プライベートブラウズ等）。名前はそのまま残っています。" };
  }
  setActivePlayerId(newPlayer.playerId);
  if (!isActivePlayerIdSavedToStorage(newPlayer.playerId)) {
    // 登録はできたが「使用中」を保存できなかった。登録した人は残す（消すと二度手間になる）
    return { ok: false, reason: "activate-failed", player: newPlayer, message: "登録はできましたが、使用中に切り替えられませんでした。一覧の名前を押してください。" };
  }
  return { ok: true, player: newPlayer };
}

// 既存のプレイヤーに切り替える（保存できたかも確かめる）。データは何も作らない・消さない。
export function switchToPlayer(playerId) {
  const player = getPlayers().find((p) => p.playerId === playerId);
  if (!player) return { ok: false, reason: "not-found", message: "このプレイヤーが見つかりませんでした。" };
  setActivePlayerId(playerId);
  if (!isActivePlayerIdSavedToStorage(playerId)) {
    return { ok: false, reason: "save-failed", message: "切り替えを保存できませんでした。もう一度押してください。" };
  }
  return { ok: true, player };
}

// 今のプレイヤーの名前だけを変える（新しいプレイヤーは作らない。playerId・記録はそのまま）。名前を確かめ、保存も確かめる。
export function renamePlayerVerified(playerId, rawName) {
  const players = getPlayers();
  if (!players.some((p) => p.playerId === playerId)) return { ok: false, reason: "not-found", message: "このプレイヤーが見つかりませんでした。" };
  const check = validatePlayerName(rawName, players, { exceptPlayerId: playerId });
  if (!check.ok) return check;
  renamePlayer(playerId, check.name);
  if (!isPlayerSavedToStorage(playerId, check.name)) {
    cachedPlayers = null;
    return { ok: false, reason: "save-failed", message: "名前を保存できませんでした。もう一度試してください。" };
  }
  return { ok: true, name: check.name };
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

// 【2026-08-29追加：js/backupSync.jsの復元処理専用】クラウドのバックアップから復元した際に、
// このプレイヤーのbackupId・表示名を更新する。renamePlayer()と違い、backupIdの更新も
// 同時に行うための専用関数。writePlayers()を経由するため、他のモジュールが
// localStorageを直接書き換えてキャッシュ（cachedPlayers）と食い違う事故を防ぐ。
export function applyRestoredPlayerInfo(playerId, { backupId, playerName }) {
  const players = getPlayers();
  const updated = players.map((player) =>
    player.playerId === playerId
      ? {
          ...player,
          backupId: backupId ?? player.backupId,
          playerName: playerName || player.playerName,
          updatedAt: nowIso(),
        }
      : player
  );
  writePlayers(updated);
}

// 指定したプレイヤーがデフォルトプレイヤー（＝既存の端末データをそのまま使うプレイヤー）かどうか。
export function isDefaultPlayer(playerId) {
  return playerId === DEFAULT_PLAYER_ID;
}

// 【2026-08-29追加：クラウドバックアップ用のbackupId】playerIdとは別に、
// プレイヤーごとにクラウド（Firebase）上のバックアップ先を指し示す、永続的な識別子。
// playerIdと役割を分けている理由：
// ・playerId … この端末内で「複数プレイヤーを切り替える」ためだけのローカルな識別子。
//   サーバーには一切送らない（js/firebaseClient.jsのUIDとは無関係）。
// ・backupId … Firebase Realtime Databaseの backups/{backupId} を指す、クラウド側の
//   永続的な識別子。Firebase匿名認証のUIDは、サイトデータの削除・機種変更のたびに
//   別の値へ変わってしまうが、backupIdは（本人が「復旧」操作をしない限り）ずっと同じ
//   まま保たれる。バックアップ本体のcurrentUidフィールドだけを「今の正しい持ち主」へ
//   書き換えることで、UIDが変わっても同じbackupIdの下のデータへ復元できるようにする
//   設計（js/backupSync.js参照）。
//
// 既存プレイヤー（この機能が無かった頃に作られたプレイヤー）にはbackupIdがまだ無い。
// getOrCreateBackupId()は、無ければその場で発行してplayers一覧へ保存し、以後は
// 同じ値を使い続ける（初回バックアップのタイミングで自然に発行される想定）。
export function getOrCreateBackupId(playerId) {
  const players = getPlayers();
  const player = players.find((p) => p.playerId === playerId);
  if (!player) return null;
  if (player.backupId) return player.backupId;

  const backupId = generatePlayerId(); // crypto.randomUUID()と同じ生成方法をそのまま流用
  const updated = players.map((p) => (p.playerId === playerId ? { ...p, backupId, updatedAt: nowIso() } : p));
  writePlayers(updated);
  return backupId;
}

// 指定したプレイヤーのbackupIdを返す（無ければnull。発行はしない、確認専用）。
export function getBackupId(playerId) {
  const player = getPlayers().find((p) => p.playerId === playerId);
  return player?.backupId ?? null;
}

// ---------------------------------------------------------------------------
// 【2026-09-15追加：バックアップ所有権の自己修復（js/backupOwnership.js参照）】
// プレイヤーごとに、backupIdとは別の3つの値を players 一覧に持つ。
// ・ownerSecret … 端末だけが知る長い秘密。backups/{backupId}/ownerSecret にも保存され、
//   Firebase匿名UIDが変わったときに「同じ端末＝同じ本人」であることをRules側へ証明する材料。
//   画面・公開プロフィール・ログには一切出さない（players 一覧は端末の外へ出ない）。
// ・lastKnownUid … 最後にバックアップ同期が成功したときのUID。次回同期時に現在のUIDと
//   比べて「UIDが変わった」ことを検知し、旧UIDとして記録するために使う。
// ・pendingUidMerge … UID変更後、旧UIDのデータ（公開プロフィール・ランキング等）を
//   新UIDへ引き継いで整理する作業が「本人の確認待ち」であることを示す。
//   { oldUid, backupId, recordedAt } または null。
// いずれも writePlayers() 経由で保存する（cachedPlayersと食い違わせないため）。
// ---------------------------------------------------------------------------

// ownerSecret は複数タブで同時に使われても食い違わないよう、キャッシュではなく毎回 localStorage を読み直す
//（別タブで作り直された直後の値を取りこぼさないため）。
function refreshPlayersCache() {
  cachedPlayers = null;
  return getPlayers();
}

function updatePlayerFields(playerId, fields) {
  const players = refreshPlayersCache();
  if (!players.some((p) => p.playerId === playerId)) return false;
  const updated = players.map((p) => (p.playerId === playerId ? { ...p, ...fields, updatedAt: nowIso() } : p));
  writePlayers(updated);
  return true;
}

// ownerSecret を返す。無ければその場で発行して保存する（backupIdと同じ「初回に自然に発行」方式。
// 既存プレイヤーにも次回の同期時に1回だけ付与され、以後は同じ値を使い続ける＝冪等）。
// generate は差し替え可能（テスト用）。
export function getOrCreateOwnerSecret(playerId, generate) {
  const player = refreshPlayersCache().find((p) => p.playerId === playerId);
  if (!player) return null;
  if (typeof player.ownerSecret === "string" && player.ownerSecret.length > 0) return player.ownerSecret;
  const ownerSecret = generate();
  updatePlayerFields(playerId, { ownerSecret });
  return ownerSecret;
}

// 引き継ぎコード・復旧でバックアップを新しい端末のものにした直後に、ownerSecret を作り直す。
// 旧端末が持っていた ownerSecret を無効化し、旧端末がこのバックアップを取り返せないようにするため。
export function rotateOwnerSecret(playerId, generate) {
  const ownerSecret = generate();
  updatePlayerFields(playerId, { ownerSecret });
  return ownerSecret;
}

// ---------------------------------------------------------------------------
// 【2026-10-29追加：ownerSecret の新しい置き場所（backupSecrets/{backupId}）】
// 旧置き場所 backups/{backupId}/ownerSecret は管理者が backups 全体を読めるため管理者にも見えていた。
// 新しい置き場所は誰も読めない（Rules：firebase/database.rules.proposed.json の backupSecrets）。
// 移すときは必ず新しい値に作り直す（管理者に見えていた値を使い続けないため）。そのため端末側に2つの値を持つ：
// ・pendingOwnerSecrets … これからクラウドへ書く新しい秘密（最大3件）。書き込みの返事が届かずに終わっても
//   （通信が切れた・タブを閉じた）クラウド側が新しい値になっている可能性があるので、回復の証明の候補として残す。
//   書き込みが確定したら（commitOwnerSecret）全部消す。拒否された（＝書かれていない）値はその場で消す。
// ・ownerSecretVault … この端末の秘密が新しい置き場所に保存済みか（true なら同期のたびに作り直さない）。
// どちらも players 一覧（端末の外へ出ない）に保存する。
// ---------------------------------------------------------------------------
const MAX_PENDING_OWNER_SECRETS = 3;

export function getPendingOwnerSecrets(playerId) {
  const player = refreshPlayersCache().find((p) => p.playerId === playerId);
  const list = Array.isArray(player?.pendingOwnerSecrets) ? player.pendingOwnerSecrets : [];
  return list.filter((value) => typeof value === "string" && value.length > 0);
}

export function addPendingOwnerSecret(playerId, value) {
  if (typeof value !== "string" || value.length === 0) return false;
  const list = getPendingOwnerSecrets(playerId).filter((v) => v !== value);
  list.push(value);
  return updatePlayerFields(playerId, { pendingOwnerSecrets: list.slice(-MAX_PENDING_OWNER_SECRETS) });
}

export function removePendingOwnerSecret(playerId, value) {
  const list = getPendingOwnerSecrets(playerId);
  if (!list.includes(value)) return false;
  return updatePlayerFields(playerId, { pendingOwnerSecrets: list.filter((v) => v !== value) });
}

export function isOwnerSecretInVault(playerId) {
  const player = refreshPlayersCache().find((p) => p.playerId === playerId);
  return player?.ownerSecretVault === true;
}

export function setOwnerSecretInVault(playerId, inVault) {
  return updatePlayerFields(playerId, { ownerSecretVault: inVault === true });
}

// 新しい置き場所への書き込みが確定したときに呼ぶ：端末の秘密をその値にし、保留中の値を消し、移行済みにする（1回の保存）
export function commitOwnerSecret(playerId, ownerSecret, { inVault }) {
  return updatePlayerFields(playerId, { ownerSecret, pendingOwnerSecrets: [], ownerSecretVault: inVault === true });
}

export function getLastKnownUid(playerId) {
  const player = getPlayers().find((p) => p.playerId === playerId);
  return typeof player?.lastKnownUid === "string" && player.lastKnownUid ? player.lastKnownUid : null;
}

export function setLastKnownUid(playerId, uid) {
  if (typeof uid !== "string" || !uid) return;
  if (getLastKnownUid(playerId) === uid) return; // 変化が無ければ書かない（不要な再同期を避ける）
  updatePlayerFields(playerId, { lastKnownUid: uid });
}

// ---------------------------------------------------------------------------
// 【2026-10-28改訂：旧UIDの整理待ちを「列」にした（js/uidMergeQueue.js）】
// 以前は確認待ちを1件（pendingUidMerge）しか持てず、整理が終わる前にUIDがもう一度変わると前の旧UIDを
// 上書きして忘れていた。今は players[].uidMergeQueue に旧UIDごとの記録を持ち、1件ずつ順番に整理する。
// 既存の呼び出し側（getPendingUidMerge 等）は「今処理すべき1件」を返す形のまま使える。
// 旧形式（pendingUidMerge・completedUidMerges）は読むときに列へ移し、保存時にも同じ値を写しておく
// （古い版のアプリが別タブで動いていても壊れないように）。
// ---------------------------------------------------------------------------
export function getUidMergeQueue(playerId) {
  const player = refreshPlayersCache().find((p) => p.playerId === playerId);
  return player ? normalizeUidMergeQueue(player) : [];
}

function saveUidMergeQueue(playerId, queue) {
  const player = getPlayers().find((p) => p.playerId === playerId);
  if (!player) return false;
  return updatePlayerFields(playerId, {
    uidMergeQueue: queue,
    pendingUidMerge: buildLegacyPendingMirror(queue),
    completedUidMerges: buildLegacyCompletedList(queue, Array.isArray(player.completedUidMerges) ? player.completedUidMerges : []),
  });
}

function toLegacyPendingShape(entry) {
  if (!entry || typeof entry.backupId !== "string") return null;
  return {
    oldUid: entry.oldUid,
    backupId: entry.backupId,
    recordedAt: entry.recordedAt ?? null,
    // 【2026-09-22追加】ランキング記録の引き継ぎ（旧UID→新UID）だけは本人の確認を待たずに自動で行う
    // （記録を失わない統合のため）。完了した時刻。公開プロフィール・presence の整理は従来どおり本人確認待ち。
    leaderboardMergedAt: typeof entry.leaderboardMergedAt === "number" ? entry.leaderboardMergedAt : null,
    // 【2026-10-28追加】列の中での状態と、残りの件数（画面表示用）
    state: entry.state,
    queuedCount: 0,
  };
}

// 今処理すべき旧UID（列の先頭）。無ければ null。権限で止まっている（blocked）旧UIDは再確認の時刻まで返さない。
export function getPendingUidMerge(playerId, { nowMs = Date.now(), currentUid = null } = {}) {
  const queue = getUidMergeQueue(playerId);
  const head = selectActiveUidMerge(queue, { nowMs, currentUid });
  const shaped = toLegacyPendingShape(head);
  if (!shaped) return null;
  shaped.queuedCount = queue.filter((e) => e.state !== UID_MERGE_STATE.MERGED && e.oldUid !== currentUid).length;
  return shaped;
}

// 【2026-09-22追加】ランキング記録の自動引き継ぎが完了したことを記録する（同じ旧UIDについて二度と走らせない）。
// 【2026-10-28】oldUid を省略したときは列の先頭が対象。
export function markPendingUidMergeLeaderboardMerged(playerId, mergedAt = Date.now(), oldUid = null) {
  const target = oldUid ?? getPendingUidMerge(playerId)?.oldUid ?? null;
  if (!target) return false;
  const { queue, updated } = updateUidMergeEntry(getUidMergeQueue(playerId), target, { leaderboardMergedAt: mergedAt }, mergedAt);
  return updated ? saveUidMergeQueue(playerId, queue) : false;
}

// 【2026-09-22改訂】既に同じ旧UIDの引き継ぎが完了済み（completedUidMerges）なら、確認待ちを作り直さない
// （クラウド側の previousUids から旧UIDを再発見するたびに同じ整理を繰り返さないため）。
// 【2026-10-28改訂】別の旧UIDが整理待ちでも上書きしない。列の末尾へ足す（戻り値：新しく足したら true）。
export function setPendingUidMerge(playerId, { oldUid, backupId }) {
  if (getCompletedUidMerges(playerId).includes(oldUid)) return false;
  // 今のUIDと同じ旧UIDかどうかは、処理する側（runPendingUidMigration）が今のログインIDで判定する
  const before = getUidMergeQueue(playerId);
  const { queue, added } = enqueueUidMerge(before, { oldUid, backupId });
  if (!added) {
    // backupId を後から補えた場合だけ保存する（変化が無ければ書かない＝不要な保存・同期の予約をしない）
    if (JSON.stringify(queue) !== JSON.stringify(before)) saveUidMergeQueue(playerId, queue);
    return false;
  }
  saveUidMergeQueue(playerId, queue);
  return true;
}

// 【2026-10-28追加】整理の途中経過を記録する（merging／failed／blocked）。途中でアプリが閉じられても次回続きから。
export function markUidMergeAttempt(playerId, oldUid, state, { error = null, countAttempt = false, nowMs = Date.now() } = {}) {
  const { queue, updated } = updateUidMergeEntry(getUidMergeQueue(playerId), oldUid, { state, error, countAttempt }, nowMs);
  return updated ? saveUidMergeQueue(playerId, queue) : false;
}

// 引き継ぎが完了した旧UIDを記録してから確認待ちを消す（2026-09-22改訂：completedUidMerges に残す）。
// 【2026-10-28改訂】列の中のその旧UIDを「整理済み」にし、次の旧UIDが先頭になる。oldUid 省略時は先頭。
export function clearPendingUidMerge(playerId, oldUid = null) {
  const target = oldUid ?? getPendingUidMerge(playerId)?.oldUid ?? null;
  if (!target) return;
  const { queue, updated } = updateUidMergeEntry(getUidMergeQueue(playerId), target, { state: UID_MERGE_STATE.MERGED });
  if (updated) saveUidMergeQueue(playerId, queue);
}

// 【2026-10-28追加】端末が知っている「このプレイヤーの旧UID」全部（整理待ち＋整理済み）。表示の重複整理に使う。
export function getKnownOldUidsForPlayer(playerId, currentUid = null) {
  return listKnownOldUids(getUidMergeQueue(playerId), { currentUid });
}

// 【2026-09-22追加】この端末で引き継ぎ（旧UID→新UID）を完了済みの旧UID一覧（最大20件）。
export function getCompletedUidMerges(playerId) {
  const player = getPlayers().find((p) => p.playerId === playerId);
  const list = player?.completedUidMerges;
  return Array.isArray(list) ? list.filter((uid) => typeof uid === "string" && uid) : [];
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
