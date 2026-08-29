// プレイヤーデータの自動クラウドバックアップ・復旧を担当するファイル（2026-08-29新設）。
//
// 【背景】称号・プレイ履歴・自己ベスト等の「その人が積み上げてきた記録」は、すべて
// この端末のlocalStorageだけに保存されている（js/achievementProgress.js・js/history.js等）。
// 本人がブラウザのサイトデータを誤って削除する・機種変更する・PWAを入れ直す等の操作を
// すると、これらは復元不可能なまま完全に失われる。この問題に対応するため、
// 「失うと困るプレイヤー固有データ」だけを、本人が何も操作しなくてもFirebaseへ
// 自動的にバックアップし、万が一データが消えても本人（または管理者経由で）復元できる
// 仕組みを用意する。
//
// 【対象外にしたもの】音源・歌詞・コール・コールガイド（IndexedDB）は対象外。
// これらは「データパックを再インポートすれば直る」性質のもので、著作権保護の観点からも
// クラウドへ複製すべきではない（本人指示）。サウンド設定・端末固有のUIフラグ等、
// 「プレイヤー個人の記録」ではなく「この端末の使い勝手の設定」に近いものも対象外。
//
// 【設計の核心：backupIdとFirebase匿名UIDを分離する】js/firebaseClient.jsの匿名認証UIDは、
// サイトデータを削除すると失われ、次回は全くの別人として新しいUIDが発行される
// （匿名認証には「ログインし直す」手段が無いため）。そのため、UIDそのものを
// バックアップの恒久的な鍵にはできない。代わりに、プレイヤーごとに端末側で
// crypto.randomUUID()により発行する永続的な「backupId」
// （js/playerProfile.jsのgetOrCreateBackupId()参照）を、Firebase側の
// backups/{backupId}というパスの鍵として使う。backups/{backupId}の中のcurrentUidフィールドは
// 「今このbackupIdへ書き込んでよい、正式な持ち主のUID」を表し、普段は本人の現在のUIDと
// 一致している。サイトデータの消失等でUIDが変わってしまった場合は、管理者が
// 「復旧依頼」を確認したうえでcurrentUidを新しいUIDへ書き換えることで、
// 同じbackupId（＝同じプレイヤーの記録）を新しい端末へ引き継がせる
// （詳しい権限の設計はfirebase/database.rules.jsonのbackups・recoveryRequests参照）。
//
// 【安全設計：ローカルが常に正本】このファイルの通常の同期は、常にローカル→クラウドの
// 一方向だけを行う。クラウド側のデータでローカルを上書きするのは、本人が明示的に
// 「データを復旧する」を選び、管理者が復旧依頼を承認した場合だけ（restoreFromBackup()）。
// これにより、「新しい同期方式を入れた瞬間に既存ユーザーのデータが初期化された」
// という事故が構造的に起こらない（本人指示：既存ユーザーを絶対に壊さない）。
//
// 【自動同期のタイミング】称号取得・クイズ完了・自己ベスト更新・お気に入り変更・
// プロフィール変更等、プレイヤーデータが変化した直後に、呼び出し側（各データ層の
// 保存関数）からscheduleBackupSync()を呼んでもらう想定。数秒のデバウンスで
// 短時間に連続する変化を1回の書き込みにまとめ、Firebaseへの無駄な書き込みを避ける。
// 通信に失敗しても例外は投げず、ローカルの保存自体には一切影響しない
// （js/publicProfileSync.jsと同じ「失敗してもプレイ自体をブロックしない」方針）。

import {
  getActivePlayer,
  getPlayerKeyPrefix,
  getOrCreateBackupId,
  getBackupId,
  applyRestoredPlayerInfo,
} from "./playerProfile.js";

const SCHEMA_VERSION = 1;
const LOCAL_STORAGE_PREFIX = "equalLoveIntroQuiz.";
const DEBOUNCE_MS = 4000; // 短時間の連続更新をまとめる待ち時間

// バックアップ対象にする、localStorageキーの「論理名」（"equalLoveIntroQuiz."と
// プレイヤー接頭辞を除いた部分）のパターン一覧。exactは完全一致、prefixは前方一致
// （出題数・カテゴリ・ルール等の組み合わせでキー名が動的に変わるもの用）。
// ここに無いキー（音源・歌詞・コール・サウンド設定・端末固有のUIフラグ等）は対象外。
// 【一覧の出典】docs/data-backup-investigation-2026-08-29.mdのローカル保存データ調査結果。
const BACKUP_KEY_EXACT_NAMES = [
  "achievements", // 称号の取得状況・取得日（js/achievementProgress.js）
  "playHistory", // 通常イントロクイズの履歴（js/history.js）
  "unifiedPlayHistory", // その他モードの統一履歴（js/playHistory.js）
  "timeAttackHistory", // タイムアタック履歴（js/timeAttackHistory.js）
  "weakSongStats", // 苦手曲判定用データ（js/weakSongStats.js）
  "lyricsQuizWeakSongStats", // 苦手曲判定用データ（歌詞クイズ専用、js/lyricsQuizWeakSongStats.js）
  "rankingCandidateBest", // ランキング参加条件を満たした自己ベスト（js/rankingCandidateStore.js）
  "oshiMembers", // 推しメン・最推し（js/oshiMembers.js）
  "favoriteSongs", // お気に入り曲（js/favoriteSongs.js）
  "playlists", // 自作プレイリスト（js/playlists.js）
  "publicProfile.enabled", // 「みんなのプロフィール」公開設定（js/publicProfilePayloads.js）
  "customQuizPresets", // オリジナル問題作成モードのプリセット（js/customQuizPresets.js、2026-08-29よりプレイヤー単位）
  "titles.equalLoveKaiden", // 旧バージョンの称号進捗（js/achievementProgress.jsが読み取り専用で保持）
];
const BACKUP_KEY_PREFIXES = [
  "highScore.", // 通常イントロクイズのハイスコア（js/highscore.js）
  "normalQuizTimeBest.", // 通常イントロクイズの合計思考タイム自己ベスト（js/normalQuizTimeScore.js）
  "timeAttackBest.", // タイムアタック自己ベスト（js/timeAttackScore.js）
  "timeAttackBestReach.", // LOVE連チャンの最高到達記録（js/timeAttackScore.js）
  "randomPlaybackBest.", // ランダム再生クイズ自己ベスト（js/randomPlaybackScore.js）
  "randomPlaybackBestReach.", // ランダム再生版LOVE連チャンの最高到達記録（js/randomPlaybackScore.js）
  "lyricsQuizBest.", // 歌詞クイズ自己ベスト（js/lyricsQuizScore.js）
  "titles.perfect.", // 旧バージョンの称号進捗（js/achievementProgress.jsが読み取り専用で保持）
];

export function isBackupWorthyLogicalKey(logicalKey) {
  if (BACKUP_KEY_EXACT_NAMES.includes(logicalKey)) return true;
  return BACKUP_KEY_PREFIXES.some((prefix) => logicalKey.startsWith(prefix));
}

// 【重要】Firebase Realtime Databaseのキー名には "." "#" "$" "/" "[" "]" を使えない
// （使うとFirebase SDKがエラーを投げる）。一方、このアプリのlocalStorageキー名の多くは
// "highScore.5.all"のようにドットを区切りとして使っているため、そのままではFirebaseへ
// 保存できない。Firebaseとやり取りする直前・直後（performSync()・restoreFromBackup()）
// だけで、ドットを"~"（Firebaseのキーとして使用可能な文字）へ一時的に変換する。
// ローカル側（collectLocalBackupEntries()・buildBackupPayload()・テスト）は、
// 今までどおり本来のキー名（ドット区切り）のまま扱えるようにするため、
// この変換はFirebase入出力の境界だけに閉じ込めている。
function encodeKeyForFirebase(logicalKey) {
  return logicalKey.replace(/\./g, "~");
}
function decodeKeyFromFirebase(firebaseKey) {
  return firebaseKey.replace(/~/g, ".");
}

// 現在アクティブなプレイヤーの接頭辞配下にある、バックアップ対象のlocalStorageキーだけを
// { 論理キー名: 生の文字列値 } の形で集める。中身はJSON.parseし直さず、保存されている
// 文字列のまま持ち回る（各モジュールの内部形式を二重に理解する必要をなくし、
// 将来どこかのモジュールが保存形式を変えても、このファイルを直す必要が無いようにするため）。
export function collectLocalBackupEntries() {
  const prefix = getPlayerKeyPrefix();
  const fullPrefix = `${LOCAL_STORAGE_PREFIX}${prefix}`;
  const entries = {};

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(fullPrefix)) continue;

    const logicalKey = key.slice(fullPrefix.length);
    // プレイヤー接頭辞が空文字列（デフォルトプレイヤー）の場合、"player.xxx."で始まる
    // 「他のプレイヤー専用のキー」まで拾ってしまわないようにする。
    if (prefix === "" && logicalKey.startsWith("player.")) continue;
    if (!isBackupWorthyLogicalKey(logicalKey)) continue;

    const value = localStorage.getItem(key);
    if (value !== null) entries[logicalKey] = value;
  }

  return entries;
}

// 現在のローカルデータから、Firebaseへ送るバックアップの中身（payload）を組み立てる。
// DOM・Firebaseには一切触れない（テストしやすくするための純粋寄りの関数）。
export function buildBackupPayload() {
  const player = getActivePlayer();
  const entries = collectLocalBackupEntries();

  let achievementCount = 0;
  try {
    const parsed = JSON.parse(entries.achievements ?? "{}");
    achievementCount = Array.isArray(parsed.unlockedAchievementIds) ? parsed.unlockedAchievementIds.length : 0;
  } catch {
    achievementCount = 0;
  }

  let oshiMemberId = null;
  try {
    const parsed = JSON.parse(entries.oshiMembers ?? "{}");
    oshiMemberId = typeof parsed.mostOshiMemberId === "string" ? parsed.mostOshiMemberId : null;
  } catch {
    oshiMemberId = null;
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    displayName: player.playerName || null,
    oshiMemberId,
    achievementCount,
    entries,
  };
}

// entriesの内容だけを比較するための、順序に依存しない軽量な指紋文字列を作る
// （前回と全く同じ内容ならFirebaseへ書き込まない、という重複排除に使う。
// js/publicProfileSync.jsのlastSyncedPayloadJsonと同じ考え方）。
function fingerprintPayload(payload) {
  const sortedEntries = Object.keys(payload.entries)
    .sort()
    .map((key) => `${key}=${payload.entries[key]}`)
    .join("\n");
  return `${payload.displayName}|${payload.oshiMemberId}|${sortedEntries}`;
}

let lastSyncedFingerprint = null;
let debounceTimer = null;
let pendingResyncNeeded = false;

// 実際にFirebaseへ書き込む（内部専用）。認証待ち・通信失敗はすべてここで吸収し、
// 呼び出し側を絶対にブロックしない。失敗時はpendingResyncNeededを立てて、
// 次回のscheduleBackupSync()呼び出しで再試行されるようにする。
async function performSync() {
  const player = getActivePlayer();
  const payload = buildBackupPayload();
  const fingerprint = fingerprintPayload(payload);
  if (fingerprint === lastSyncedFingerprint && !pendingResyncNeeded) return;

  try {
    const { database, authReady, getCurrentUid } = await import("./firebaseClient.js");
    const { ref, set, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
    );
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return;

    const backupId = getOrCreateBackupId(player.playerId);
    if (!backupId) return;

    const firebaseSafeEntries = {};
    for (const [logicalKey, value] of Object.entries(payload.entries)) {
      firebaseSafeEntries[encodeKeyForFirebase(logicalKey)] = value;
    }

    await set(ref(database, `backups/${backupId}`), {
      schemaVersion: payload.schemaVersion,
      currentUid: uid,
      updatedAt: serverTimestamp(),
      displayName: payload.displayName,
      oshiMemberId: payload.oshiMemberId,
      achievementCount: payload.achievementCount,
      payload: firebaseSafeEntries,
    });

    lastSyncedFingerprint = fingerprint;
    pendingResyncNeeded = false;
  } catch (error) {
    // 本人指示：通信に失敗してもローカルのプレイ自体には一切影響させない。
    // 次にscheduleBackupSync()が呼ばれたタイミングで自然に再試行される。
    pendingResyncNeeded = true;
    console.warn("プレイヤーデータのバックアップに失敗しました（ローカルのデータには影響ありません）", error);
  }
}

// 称号取得・クイズ完了・自己ベスト更新等、プレイヤーデータが変化した直後に呼ぶ。
// 短時間の連続呼び出しは1回のFirebase書き込みにまとめる（デバウンス）。
// 呼び出し側は結果を待つ必要が無い（await せず呼び捨てにしてよい設計）。
export function scheduleBackupSync() {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    performSync();
  }, DEBOUNCE_MS);
}

// デバウンスを待たず、今すぐ同期する（アプリ起動時の初回同期・復旧直後の同期等、
// 「今すぐ確実に反映させたい」場面で使う）。
//
// 【既存ユーザーの初回バックアップについて】この関数を特別扱いする専用の「初回移行」処理は
// 用意していない。getOrCreateBackupId()が「無ければその場で発行する」設計のため、
// まだ一度もバックアップしたことが無いプレイヤー（真の新規ユーザーも、この機能が
// 実装される前から遊んでいた既存ユーザーも区別しない）が最初にsyncNow()を呼んだ瞬間、
// 自然にbackupIdが発行され、今のローカルデータがそのままクラウドへ送られる。
// この同期は常にローカル→クラウドの一方向であり、クラウド側の内容でローカルを
// 上書きすることは無いため、「新方式を入れた瞬間に既存データが初期化される」事故は
// 構造的に起こらない（本人指示への対応）。
export async function syncNow() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  await performSync();
}

// ---------------------------------------------------------------------------
// 復旧（本人が「データを復旧する」を選んだとき、新しい端末側で使う一連の関数）
// ---------------------------------------------------------------------------

// 6桁の復旧依頼番号を新しく作る（0埋めした数字の文字列。例："042817"）。
function generateRecoveryCode() {
  const n = Math.floor(Math.random() * 1000000);
  return String(n).padStart(6, "0");
}

// 復旧依頼を作成し、Firebaseへ登録する。戻り値の code を、本人が管理者へLINE等で
// 伝える想定（js/backupSync.js自身はLINE等の送信手段を一切持たない。番号を
// 表示するところまでがこの関数の責務）。
// 失敗した場合は { ok: false, reason } を返す（例外は投げない、呼び出し側が
// 画面にそのままエラー文言を出せるようにするため）。
export async function createRecoveryRequest() {
  let database, ref, set, serverTimestamp, uid;
  try {
    const firebaseClient = await import("./firebaseClient.js");
    const rtdb = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    database = firebaseClient.database;
    ref = rtdb.ref;
    set = rtdb.set;
    serverTimestamp = rtdb.serverTimestamp;
    await firebaseClient.authReady;
    uid = firebaseClient.getCurrentUid();
  } catch (error) {
    console.warn("復旧依頼の準備に失敗しました", error);
    return { ok: false, reason: "通信エラーにより復旧依頼を作成できませんでした。しばらくしてからもう一度お試しください。" };
  }
  if (!uid) return { ok: false, reason: "ログイン状態を確認できませんでした。通信環境をご確認のうえ、もう一度お試しください。" };

  // 【衝突回避について】recoveryRequests/{code}は「本人（newUidと一致するuid）だけが
  // 自分の分を読める」ルールのため、書き込み前に「このコードは既に使われていないか」を
  // get()で確認することができない（存在しない・他人のコードはそもそも読めない設計のため）。
  // 代わりに、firebase/database.rules.jsonの.writeルール自体が
  // 「!data.exists()（＝まだ誰も使っていないコード）のときだけ新規作成を許可する」形に
  // なっているため、衝突した場合はset()自体がPERMISSION_DENIEDで失敗する。
  // それを検知して、新しいコードで数回だけ再試行する（6桁＝100万通りに対しこのアプリの
  // 利用規模では衝突は極めて起こりにくいが、念のための保険）。
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateRecoveryCode();
    try {
      await set(ref(database, `recoveryRequests/${code}`), {
        newUid: uid,
        status: "pending",
        requestedAt: serverTimestamp(),
      });
      return { ok: true, code };
    } catch (error) {
      // このコードが既に使われていた（衝突した）可能性が高い。次のコードで再試行する。
      console.warn(`復旧依頼番号の発行に失敗しました（${attempt + 1}回目、コード衝突の可能性）`, error);
    }
  }
  return { ok: false, reason: "通信エラーにより復旧依頼を作成できませんでした。しばらくしてからもう一度お試しください。" };
}

// 復旧依頼の今の状態を確認する。管理者がまだ対応していなければstatus:"pending"、
// 対応済みならstatus:"resolved"とresolvedBackupIdが返る。
export async function checkRecoveryRequestStatus(code) {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    const snap = await get(ref(database, `recoveryRequests/${code}`));
    if (!snap.exists()) return { ok: false, reason: "指定した番号の復旧依頼が見つかりませんでした" };
    const value = snap.val();
    return { ok: true, status: value.status, resolvedBackupId: value.resolvedBackupId ?? null };
  } catch (error) {
    console.warn("復旧依頼の状態確認に失敗しました", error);
    return { ok: false, reason: "通信エラーにより状態を確認できませんでした" };
  }
}

// 管理者が復旧依頼をbackupIdへ紐付けた後、実際にこの端末のローカルデータへ復元する。
// 【重要】ここだけがクラウド→ローカルの向きにデータを書き込む、唯一の場所。
// 現在アクティブなプレイヤーのバックアップ対象キーを、バックアップの内容で「置き換える」
// （バックアップに含まれないキーには触れない＝復元時点のローカルに元々あった、
// バックアップ対象外のデータ（サウンド設定等）は保持される）。
// 復元後は、以後の自動バックアップが同じbackupIdへ書き込まれるよう、
// このプレイヤーへそのbackupIdを覚えさせ、直ちに1回同期し直す。
export async function restoreFromBackup(backupId) {
  try {
    const { database, authReady, getCurrentUid } = await import("./firebaseClient.js");
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    const uid = getCurrentUid();
    const snap = await get(ref(database, `backups/${backupId}`));
    if (!snap.exists()) return { ok: false, reason: "指定されたバックアップが見つかりませんでした" };

    const record = snap.val();
    if (record.currentUid !== uid) {
      // 管理者がcurrentUidをこの端末のUIDへ書き換える前に呼ばれてしまった場合の保険
      // （通常のUIフローでは起こらないはずだが、念のため復元前に必ず確認する）。
      return { ok: false, reason: "このバックアップはまだこの端末に引き継がれていません（管理者の対応をお待ちください）" };
    }

    const prefix = getPlayerKeyPrefix();
    const entries = record.payload ?? {};
    for (const [firebaseKey, value] of Object.entries(entries)) {
      if (typeof value !== "string") continue;
      const logicalKey = decodeKeyFromFirebase(firebaseKey);
      localStorage.setItem(`${LOCAL_STORAGE_PREFIX}${prefix}${logicalKey}`, value);
    }

    const player = getActivePlayer();
    // このプレイヤーに、復元したbackupIdを覚えさせる（以後の自動バックアップの送り先を固定する）。
    applyRestoredPlayerInfo(player.playerId, { backupId, playerName: record.displayName });

    lastSyncedFingerprint = null; // 復元直後は必ず1回同期し直す
    await syncNow();

    return { ok: true, restoredKeyCount: Object.keys(entries).length, displayName: record.displayName ?? null };
  } catch (error) {
    console.warn("バックアップからの復元に失敗しました", error);
    return { ok: false, reason: "通信エラーにより復元できませんでした。しばらくしてからもう一度お試しください。" };
  }
}
