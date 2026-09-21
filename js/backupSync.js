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
  getOrCreateOwnerSecret,
  rotateOwnerSecret,
  getLastKnownUid,
  setLastKnownUid,
  setPendingUidMerge,
} from "./playerProfile.js";
import { generateOwnerSecret, detectUidChange, isValidOwnerSecret } from "./backupOwnership.js";

const SCHEMA_VERSION = 1;
const LOCAL_STORAGE_PREFIX = "equalLoveIntroQuiz.";
const DEBOUNCE_MS = 4000; // 短時間の連続更新をまとめる待ち時間

// 「機種変更・データ引き継ぎ」コード（2026-08-29新設）に使う文字集合。
// 数字の0/1と紛らわしいO/I/L等を除いたCrockford Base32相当（32種類）を使うことで、
// 256を32で割り切れる（256 % 32 === 0）ため、crypto.getRandomValues()の1バイトを
// そのまま「32種類のどれか」に変換しても偏りが出ない。
const TRANSFER_SECRET_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TRANSFER_SECRET_LENGTH = 20; // 32^20 通り（約100ビット相当）で、当てずっぽうは事実上不可能
const TRANSFER_CODE_VALID_MS = 24 * 60 * 60 * 1000; // 有効期限24時間（本人指示）

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
  "weakSongStats", // 苦手曲判定用データ（イントロ専用、js/weakSongStats.js。2026-08-30改訂：シャッフル分をshuffleWeakSongStatsへ分離）
  "shuffleWeakSongStats", // 苦手曲判定用データ（シャッフル〈ランダム再生〉専用、js/shuffleWeakSongStats.js。2026-08-30新設）
  "outroWeakSongStats", // 苦手曲判定用データ（アウトロ専用、js/outroWeakSongStats.js。2026-08-30新設）
  "lyricsQuizWeakSongStats", // 苦手曲判定用データ（歌詞クイズ専用、js/lyricsQuizWeakSongStats.js）
  "instantChallengeWeakSongStats", // 苦手曲判定用データ（一瞬チャレンジ専用、js/instantChallengeWeakSongStats.js。2026-08-30追加）
  "instantChallengeClears", // 一瞬チャレンジのクリア済み条件（js/instantChallengeClearStore.js。2026-08-30追加）
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
  "outroQuizTimeBest.", // アウトロクイズ（通常導線）の合計思考タイム自己ベスト（js/outroQuizTimeScore.js。2026-08-30新設）
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
// 【2026-09-15追加：Firebase Rules 未公開時のための互換フォールバック】
// ownerSecret・previousUids（js/backupOwnership.js参照）は、firebase/database.rules.json の
// 対応ルールが本番へ公開されて初めて受け付けられる。万一「コードは新しいがRulesは古い」状態で
// 動いた場合、新しいフィールドを含む書き込みは PERMISSION_DENIED になるため、
// その場合は従来どおりのフィールドだけで書き直す（バックアップ自体は止めない）。
// 一度検知したら、このセッション中は最初から従来形式で書く（無駄な失敗を繰り返さない）。
let legacyRulesDetected = false;

function isPermissionDenied(error) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return /PERMISSION_DENIED|permission_denied|permission-denied/i.test(`${code} ${message}`);
}

// UIDが変わっていた場合に「前の持ち主のUID」を求める。
// ①前回同期成功時のUID（lastKnownUid）と今のUIDが違えば、それが旧UID。
// ②lastKnownUid がまだ無い（この機能の導入前から使っている端末の初回同期）場合だけ、
//   クラウド側の currentUid を1回読んで比べる。読めるのは「現在の持ち主」か「管理者」だけ
//   （Rules）なので、持ち主なら同じUIDが返り（＝変化なし）、管理者は自分のUID変更後に
//   管理者権限を復旧したケースで旧UIDを知ることができる。一般ユーザーで既にUIDが変わって
//   いる場合は読めない（PERMISSION_DENIED）ため null＝旧UID不明として扱う。
async function resolvePreviousUid(playerId, uid, backupId, { database, ref, get }) {
  const lastKnownUid = getLastKnownUid(playerId);
  const detection = detectUidChange(lastKnownUid, uid);
  if (detection.changed) return detection.previousUid;
  if (lastKnownUid !== null) return null;
  try {
    const snapshot = await get(ref(database, `backups/${backupId}/currentUid`));
    const cloudUid = snapshot.val();
    if (typeof cloudUid === "string" && cloudUid && cloudUid !== uid) return cloudUid;
  } catch {
    // 読めない＝自分が持ち主ではない（または未作成）。旧UIDは不明のまま進める。
  }
  return null;
}

// 【2026-09-22改訂：同期結果を返す】js/identityBootstrap.js（起動時の「本人確認の関門」）が、
// この同期の結果で「クラウドへ自己ベスト等を再送信してよいか」を決めるため、結果を返すようにした。
//   { status: "synced" | "claimed" | "denied" | "no-change" | "no-auth" | "error", previousUid }
//   synced   … 持ち主として書けた（UID変更なし、または新規作成）
//   claimed  … ownerSecret による所有権の回復に成功した（UIDが変わっていた）
//   denied   … 持ち主でも claim でも書けなかった（＝このバックアップの持ち主確認が取れていない。
//              旧UIDが Firebase 側で消えた pre-v329 端末など）
//   no-change… 前回と内容が同じで書かなかった（前回の結果を引き継ぐ）
//   error    … 通信エラー等（次回再試行）
// 既存の呼び出し側（scheduleBackupSync／syncNow）は戻り値を使わなくても動作が変わらない。
let lastSyncResult = { status: "no-change", previousUid: null };

async function performSync() {
  const player = getActivePlayer();
  const payload = buildBackupPayload();
  const fingerprint = fingerprintPayload(payload);
  if (fingerprint === lastSyncedFingerprint && !pendingResyncNeeded) return lastSyncResult;

  try {
    const { database, authReady, getCurrentUid } = await import("./firebaseClient.js");
    const { ref, get, update, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
    );
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return { status: "no-auth", previousUid: null };

    const backupId = getOrCreateBackupId(player.playerId);
    if (!backupId) return { status: "error", previousUid: null };
    const lastKnownUidBeforeSync = getLastKnownUid(player.playerId);

    const firebaseSafeEntries = {};
    for (const [logicalKey, value] of Object.entries(payload.entries)) {
      firebaseSafeEntries[encodeKeyForFirebase(logicalKey)] = value;
    }

    // 従来どおりのフィールド（このアプリの「ローカルが正本」の設計は変えない）。
    // 【2026-09-15改訂】set()（ノード全体の置き換え）から update()（列挙したキーだけの上書き）へ変更。
    // 理由：ownerSecret・previousUids・transfer（引き継ぎコード）を、通常の同期で消してしまわないため
    // （以前は同期のたびに transfer が消え、発行直後の引き継ぎコードがデータ変更で無効になり得た）。
    const baseRecord = {
      schemaVersion: payload.schemaVersion,
      currentUid: uid,
      updatedAt: serverTimestamp(),
      displayName: payload.displayName,
      oshiMemberId: payload.oshiMemberId,
      achievementCount: payload.achievementCount,
      payload: firebaseSafeEntries,
    };

    // 【2026-09-15追加：所有権の自己修復】ownerSecret を毎回一緒に送る。
    // ・UIDが変わっていなければ：ただ保存されるだけ（既存ユーザーには次回起動時に自動で付与される。
    //   値は端末に1つだけ持ち、何度起動しても同じ値を送る＝冪等）。
    // ・UIDが変わっていれば：Rulesの「ownerSecretが一致すれば currentUid を自分へ書き換えてよい」枝を
    //   通り、この通常同期そのものが所有権の回復になる。合わせて旧UIDを previousUids に記録する。
    const ownerSecret = legacyRulesDetected ? null : getOrCreateOwnerSecret(player.playerId, generateOwnerSecret);
    const previousUid = legacyRulesDetected ? null : await resolvePreviousUid(player.playerId, uid, backupId, { database, ref, get });
    // UIDの変化を「前回同期時のUID」から検知した場合だけ、所有権の回復（claim）を試みる。
    // lastKnownUid が無くクラウドの currentUid を読めた（＝管理者）場合は、管理者の枝で書けるので claim は不要。
    const detectedByLastKnownUid = detectUidChange(getLastKnownUid(player.playerId), uid).changed;
    const needsClaim = !legacyRulesDetected && previousUid !== null && detectedByLastKnownUid && isValidOwnerSecret(ownerSecret);
    const rotatedOwnerSecret = needsClaim ? generateOwnerSecret() : null;

    // 試す順番：①claim（旧UIDの記録つき）→②claim（記録なし）→③通常（既に持ち主の場合）→④従来形式
    const buildWrites = ({ claim, withPreviousUid, withOwnerSecret, legacy }) => {
      const writes = { ...baseRecord };
      if (claim) {
        writes.ownerClaim = { secret: ownerSecret, at: serverTimestamp() };
        writes.ownerSecret = rotatedOwnerSecret;
      } else {
        if (withOwnerSecret && ownerSecret) writes.ownerSecret = ownerSecret;
        // 使い終わった証明（ownerClaim）が残っていれば消す（持ち主の通常同期で削除できる。
        // 無ければ何も起きない。旧Rules向けの従来形式では触らない）。
        if (!legacy) writes.ownerClaim = null;
      }
      if (withPreviousUid && previousUid) writes[`previousUids/${previousUid}`] = serverTimestamp();
      return writes;
    };
    const attempts = [];
    if (needsClaim) {
      attempts.push({ claim: true, withPreviousUid: true, withOwnerSecret: false });
      attempts.push({ claim: true, withPreviousUid: false, withOwnerSecret: false });
    } else if (previousUid) {
      attempts.push({ claim: false, withPreviousUid: true, withOwnerSecret: true });
    }
    attempts.push({ claim: false, withPreviousUid: false, withOwnerSecret: true });
    attempts.push({ claim: false, withPreviousUid: false, withOwnerSecret: false, legacy: true });
    // 【2026-09-22追加】lastKnownUid が無い（旧UIDが分からない）端末でも、持ち主としての書き込みが
    // 全て拒否されたら、最後に ownerSecret による claim（旧UIDの記録なし）を試す。
    // クラウド側に同じ ownerSecret が保存されていれば所有権を取り戻せる。無ければ拒否＝denied。
    const canClaimWithoutPreviousUid = !needsClaim && !legacyRulesDetected && isValidOwnerSecret(ownerSecret);
    const fallbackRotatedOwnerSecret = canClaimWithoutPreviousUid ? generateOwnerSecret() : null;
    if (canClaimWithoutPreviousUid) attempts.push({ claim: true, withPreviousUid: false, withOwnerSecret: false, fallbackClaim: true });

    let applied = null;
    let lastError = null;
    for (const attempt of attempts) {
      try {
        const writes = buildWrites(attempt);
        if (attempt.fallbackClaim) writes.ownerSecret = fallbackRotatedOwnerSecret;
        await update(ref(database, `backups/${backupId}`), writes);
        applied = attempt;
        break;
      } catch (error) {
        lastError = error;
        if (!isPermissionDenied(error)) throw error;
      }
    }
    if (!applied) {
      // 全ての書き込みが権限で拒否された＝このバックアップの持ち主確認が取れていない。
      // （旧UIDが消えて lastKnownUid も ownerSecret のクラウド保存も無い pre-v329 端末が典型）
      // 例外にはせず「denied」として返す。ローカルのプレイには影響しない。
      pendingResyncNeeded = true;
      console.warn("バックアップの持ち主確認が取れませんでした（UIDが変わった可能性があります。管理者による付け替えが必要です）", lastError);
      lastSyncResult = { status: "denied", previousUid: null };
      return lastSyncResult;
    }
    if (applied.legacy && (ownerSecret || previousUid)) legacyRulesDetected = true;
    if (applied.claim) {
      // 回復に成功した書き込みで ownerSecret を作り直したので、端末側も同じ値へ更新する。
      rotateOwnerSecret(player.playerId, () => (applied.fallbackClaim ? fallbackRotatedOwnerSecret : rotatedOwnerSecret));
      // 使い終わった証明をすぐ消す（もう持ち主なので通常の書き込みで削除できる）。
      // 失敗しても次回の通常同期で消えるため、ここでは失敗を無視する。
      try {
        await update(ref(database, `backups/${backupId}`), { ownerClaim: null });
      } catch {
        // 次回同期で削除される
      }
    }
    let recordedPreviousUid = applied.withPreviousUid ? previousUid : null;

    lastSyncedFingerprint = fingerprint;
    pendingResyncNeeded = false;
    setLastKnownUid(player.playerId, uid);

    // 【2026-09-22追加：クラウド側に残された旧UIDの発見】このUIDでの初回同期（lastKnownUid が無かった）で
    // 持ち主として書けた場合、backups/{id}/previousUids（管理者の付け替え・過去の claim が残した旧UID）を
    // 1回だけ読み、未整理の旧UIDがあれば引き継ぎ対象にする。管理者が「友達の端末を触らずに」
    // currentUid を新UIDへ付け替えた後、本人の端末が次に起動したときに旧UIDの残骸
    // （presence 等、管理者には消せないもの）を本人が後継者として整理できるようにするため。
    if (!recordedPreviousUid && lastKnownUidBeforeSync === null && !applied.legacy) {
      try {
        const previousUidsSnap = await get(ref(database, `backups/${backupId}/previousUids`));
        const previousUids = previousUidsSnap.val();
        if (previousUids && typeof previousUids === "object") {
          const { getCompletedUidMerges } = await import("./playerProfile.js");
          const completed = getCompletedUidMerges(player.playerId);
          const candidates = Object.entries(previousUids)
            .filter(([oldUid, at]) => oldUid !== uid && typeof at === "number" && !completed.includes(oldUid))
            .sort((a, b) => b[1] - a[1]);
          if (candidates.length > 0) recordedPreviousUid = candidates[0][0];
        }
      } catch {
        // 読めない（旧Rules等）場合は何もしない
      }
    }

    if (recordedPreviousUid) {
      // 旧UIDのデータ（ランキング・公開プロフィール・presence）の整理は js/identityBootstrap.js →
      // js/uidSupersession.js の runUidMigration が自動で行う（記録を失わない統合のみ）。
      // 自動で片付かなかった分だけ、フレンド画面の案内（js/fanProfilesScreen.js）から本人が実行する。
      setPendingUidMerge(player.playerId, { oldUid: recordedPreviousUid, backupId });
      const { recordUidSupersession } = await import("./uidSupersession.js");
      await recordUidSupersession(recordedPreviousUid, backupId);
    }
    lastSyncResult = { status: applied.claim ? "claimed" : "synced", previousUid: recordedPreviousUid };
    return lastSyncResult;
  } catch (error) {
    // 本人指示：通信に失敗してもローカルのプレイ自体には一切影響させない。
    // 次にscheduleBackupSync()が呼ばれたタイミングで自然に再試行される。
    pendingResyncNeeded = true;
    console.warn("プレイヤーデータのバックアップに失敗しました（ローカルのデータには影響ありません）", error);
    return { status: "error", previousUid: null };
  }
}

// 【2026-09-22追加】起動時の「本人確認の関門」（js/identityBootstrap.js）用：今すぐ同期し、結果を返す。
// syncNow() と同じだが、戻り値の status で「持ち主として書けたか／拒否されたか」を伝える。
export async function syncBackupOwnership() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  return performSync();
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
  // 【QAで発見・修正：2026-09-07】直前のローカル操作（設定変更・称号解除等）によって
  // scheduleBackupSync()のデバウンスタイマーが既に予約されている状態で復元を始めると、
  // このFirebase読み取り（get）の完了を待っている間にそのタイマーが先に発火し、
  // 「これから上書きされる古いローカルの内容」を復元対象のバックアップへ書き込んで
  // しまう競合があった（本人が意図して復元しようとしたバックアップの中身が、
  // 復元処理の最中に壊れる）。復元処理の一番最初でこのタイマーを確実に止めておく
  // （関数末尾のsyncNow()も同じ後始末を行うが、そこまで待つと手遅れになるため、
  // ここでも先んじて止める）。
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
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
    // 【2026-09-15追加】このバックアップは今この端末のものになった。ownerSecret を作り直して
    // 直後の同期で保存し、以前の端末が持っていた ownerSecret を無効化する（js/backupOwnership.js参照）。
    // lastKnownUid も今のUIDにそろえる（復元＝UID変更の検知対象ではない）。
    rotateOwnerSecret(player.playerId, generateOwnerSecret);
    setLastKnownUid(player.playerId, uid);

    lastSyncedFingerprint = null; // 復元直後は必ず1回同期し直す
    await syncNow();
    // 【2026-09-22追加】本人の前提（backupId）が変わったので、本人確認の関門を次回判定し直させる
    try {
      const { resetIdentityBootstrap } = await import("./identityBootstrap.js");
      resetIdentityBootstrap();
    } catch {
      // 関門モジュールが無い環境（テスト等）では無視
    }

    return { ok: true, restoredKeyCount: Object.keys(entries).length, displayName: record.displayName ?? null };
  } catch (error) {
    console.warn("バックアップからの復元に失敗しました", error);
    return { ok: false, reason: "通信エラーにより復元できませんでした。しばらくしてからもう一度お試しください。" };
  }
}

// ---------------------------------------------------------------------------
// 機種変更・データ引き継ぎ（2026-08-29新設）。管理者の承認を挟まず、
// 「今この端末を操作している本人」だけで完結する自己完結型の引き継ぎ。
// 【recoveryRequestsとの違い】管理者による「復旧を依頼する」（6桁コード→LINE等で
// 管理者へ連絡→管理者が承認）とは別の仕組み。旧端末をまだ本人が操作できる場合の
// 「ふつうの機種変更」用に、本人だけでその場で完結させる。旧端末が使えない・
// サイトデータを先に消してしまった等の「事故」の場合は、今まで通り管理者経由の
// 復旧を使う（js/backupSync.jsのcreateRecoveryRequest等、削除・変更していない）。
//
// 【安全設計】backups/{backupId}に、期限付き・1回限りの「合言葉」(secret)を1つだけ
// 持たせる（firebase/database.rules.json参照）。
// ・secretは長い（20文字・約100ビット相当）ランダム文字列で、backupId・UIDのどちらからも
//   推測できない。第三者が知る手段は、コードそのものを見る以外に無い。
// ・コード＝「backupId＋'.'＋secret」。新端末は、このコードをそのままコピー＆貼り付けで
//   使う想定（backupIdやUIDという言葉自体はUI上には出さない）。
// ・Firebase Rules側で「secretが保存済みの値と完全一致する場合だけ」currentUidの
//   書き換えを許可し、書き換えと同時にusedAtを必ず記録する（以後、同じコードは
//   二度と使えなくなる。Rules側の検証のためRules機能にハッシュ関数が無く、
//   平文の完全一致で「正しいコードを知っていること」を確認する設計にしている）。
// ・新しいコードを発行すると、古いsecretは上書きされて消えるため、常に「最後に発行した
//   1つだけ」が有効になる。
// ・新端末が引き継いだ瞬間、backups/{backupId}のcurrentUidが新端末のUIDに変わるため、
//   旧端末は（追加のルールを足さなくても）既存の「currentUidが自分と一致する場合だけ
//   書き込める」というルールにより、以後このバックアップへ書き込めなくなる
//   （新旧端末のデータ競合を構造的に防ぐ）。

// crypto.getRandomValues()を使い、TRANSFER_SECRET_LENGTH文字のランダムな合言葉を作る。
function generateTransferSecret() {
  const bytes = new Uint8Array(TRANSFER_SECRET_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => TRANSFER_SECRET_ALPHABET[byte % TRANSFER_SECRET_ALPHABET.length]).join("");
}

// 旧端末側：引き継ぎコードを新しく発行する。戻り値のcodeを、本人が新端末へ
// コピー＆貼り付け等で伝える想定（この関数自体はLINE等の送信手段を持たない）。
// 発行する前に必ず1回同期し直し、今のローカルの内容が確実にクラウドへ反映された
// 状態でコードを発行する（発行直前の変更が引き継ぎに漏れないようにするため）。
export async function createTransferCode() {
  let database, ref, update, serverTimestamp, uid;
  try {
    const firebaseClient = await import("./firebaseClient.js");
    const rtdb = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    database = firebaseClient.database;
    ref = rtdb.ref;
    update = rtdb.update;
    serverTimestamp = rtdb.serverTimestamp;
    await firebaseClient.authReady;
    uid = firebaseClient.getCurrentUid();
  } catch (error) {
    console.warn("引き継ぎコードの準備に失敗しました", error);
    return { ok: false, reason: "通信エラーにより引き継ぎコードを発行できませんでした。しばらくしてからもう一度お試しください。" };
  }
  if (!uid) return { ok: false, reason: "ログイン状態を確認できませんでした。通信環境をご確認のうえ、もう一度お試しください。" };

  await syncNow();

  const player = getActivePlayer();
  const backupId = getOrCreateBackupId(player.playerId);
  if (!backupId) return { ok: false, reason: "プレイヤー情報を取得できませんでした" };

  const secret = generateTransferSecret();
  const expiresAt = Date.now() + TRANSFER_CODE_VALID_MS;

  try {
    await update(ref(database, `backups/${backupId}/transfer`), {
      secret,
      createdAt: serverTimestamp(),
      expiresAt,
    });
    return { ok: true, code: `${backupId}.${secret}`, expiresAt };
  } catch (error) {
    console.warn("引き継ぎコードの発行に失敗しました", error);
    return { ok: false, reason: "通信エラーにより引き継ぎコードを発行できませんでした。しばらくしてからもう一度お試しください。" };
  }
}

// 新端末側：引き継ぎコードを使って、このコードを発行した旧端末のバックアップを
// この端末のものにし、そのままローカルへ復元する。
// 【成功の仕組み】secretが一致する書き込みだけがFirebase Rules側で許可されるため、
// この関数はまず「currentUidを自分に、secretを検証用にそのまま送り返す」書き込みを試み、
// 通ればそのbackupIdは正式にこの端末のものになる。そのうえで既存のrestoreFromBackup()を
// そのまま呼び出し、ローカルへの反映・以後の自動同期の継続までまとめて行う
// （管理者経由の復旧と全く同じ最終処理を再利用する）。
// 【途中で通信が切れた場合の救済】所有権の書き換え自体は成功したがローカルへの反映だけ
// 失敗した場合、同じコードを再送信すると（既に使用済みのため）必ず失敗する。
// そのため、書き込みに失敗した場合も念のためrestoreFromBackup()を試す。
// 既にこの端末が持ち主になっていれば、そのまま復元に成功する。
export async function claimTransferCode(rawCode) {
  const trimmed = (rawCode ?? "").trim();
  const dotIndex = trimmed.indexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { ok: false, reason: "コードの形式が正しくありません。コピーした内容をそのまま貼り付けてください。" };
  }
  const backupId = trimmed.slice(0, dotIndex);
  const secret = trimmed.slice(dotIndex + 1);

  let database, ref, update, serverTimestamp, uid;
  try {
    const firebaseClient = await import("./firebaseClient.js");
    const rtdb = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    database = firebaseClient.database;
    ref = rtdb.ref;
    update = rtdb.update;
    serverTimestamp = rtdb.serverTimestamp;
    await firebaseClient.authReady;
    uid = firebaseClient.getCurrentUid();
  } catch (error) {
    console.warn("引き継ぎコードの確認に失敗しました", error);
    return { ok: false, reason: "通信エラーによりデータを引き継げませんでした。しばらくしてからもう一度お試しください。" };
  }
  if (!uid) return { ok: false, reason: "ログイン状態を確認できませんでした。通信環境をご確認のうえ、もう一度お試しください。" };

  // 【2026-09-15追加】所有権の書き換えと同時に ownerSecret も新しい値へ差し替える
  // （旧端末が持つ ownerSecret でこのバックアップを取り返せないようにする）。
  // Rulesが未公開で ownerSecret を受け付けない場合に備え、従来どおりの3項目だけでも再試行する。
  const claimedOwnerSecret = generateOwnerSecret();
  const baseClaim = {
    [`backups/${backupId}/currentUid`]: uid,
    [`backups/${backupId}/transfer/secret`]: secret,
    [`backups/${backupId}/transfer/usedAt`]: serverTimestamp(),
  };
  let claimed = false;
  try {
    await update(ref(database), { ...baseClaim, [`backups/${backupId}/ownerSecret`]: claimedOwnerSecret });
    claimed = true;
  } catch (error) {
    try {
      await update(ref(database), baseClaim);
      claimed = true;
    } catch (retryError) {
      console.warn("引き継ぎコードでの認証に失敗しました（無効・期限切れ・使用済みの可能性があります）", retryError);
    }
  }
  if (claimed) {
    // restoreFromBackup() 内で改めて作り直されるため、ここで保存した値が最終値になるわけではないが、
    // 直後の同期までの間に旧端末側の値へ戻らないよう、端末側も先に更新しておく。
    rotateOwnerSecret(getActivePlayer().playerId, () => claimedOwnerSecret);
  }

  const result = await restoreFromBackup(backupId);
  if (!result.ok) {
    return {
      ok: false,
      reason: "このコードは無効か、有効期限切れ、またはすでに使用されています。旧端末で新しいコードを発行し直してください。",
    };
  }
  return result;
}
