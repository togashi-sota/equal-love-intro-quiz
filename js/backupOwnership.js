// バックアップ所有権の「自己修復」（2026-09-15新設、本人指示：第2弾）。
//
// 【背景】このアプリの本人識別はFirebase匿名認証のUIDだけで、UIDは端末側の認証情報の消失や
// Firebase側での匿名ユーザー削除（Authenticationの自動クリーンアップ等）によって、本人の操作と
// 無関係に変わることがある（2026-09-13〜14に開発者本人にも発生）。UIDが変わると、
// ①publicProfiles/{新UID}が同じ内容で増えて旧が残る（フレンド一覧に同じ人が2人）
// ②backups/{backupId}のcurrentUidが旧UIDのままで、新UIDからの自動バックアップが静かに失敗し続ける
// ③本人は引き継ぎコードを発行できず、復旧依頼は管理者承認待ちになる
// という問題が起こる。
//
// 【方式：ownerSecret（端末だけが知る秘密）＋ ownerClaim（使い捨ての証明）】
// ・端末は backupId と一緒に、画面には一切出さない長いランダム文字列 ownerSecret を生成して
//   localStorage（players一覧）に保持し、通常の自動バックアップで backups/{backupId}/ownerSecret にも保存する。
// ・UIDが変わったことを検知した端末は「所有権の回復（claim）」の書き込みを行う：
//     ownerClaim/secret … 手元の ownerSecret（＝保存済みの値と完全一致することをRulesが検証）
//     ownerClaim/at     … サーバー時刻（この書き込みで実際に送られた証明であることをRulesが検証。
//                         Realtime Databaseの update() は書かなかったキーを以前の値のまま残すため、
//                         「以前の証明を引きずって通る」ことが無いよう、毎回 now と一致させる）
//     ownerSecret       … 新しい値（回復と同時に必ず作り直す。古い証明が二度と使えなくなる）
//     currentUid        … 自分
// ・Rules側で上の4点をすべて検証して初めて currentUid の書き換えを許可する。
// ・効果：UIDだけが変わった端末は、次の起動の自動同期（js/backupSync.jsのperformSync）で自動的に
//   バックアップの所有権を取り戻す。管理者承認もコード入力も不要で、本人は何も気づかない。
// ・ownerSecret の変更は「claim・引き継ぎコード・管理者」のいずれかの書き込みでしか許可しない
//   （別タブに残った古い値で上書きされない）。
// ・安全性：backupIdだけでは何もできない（backupIdは引き継ぎコードに含まれるため他人が知り得るが、
//   ownerSecretは端末外に出ない）。backups/{backupId}/ownerSecret を読めるのは現在の持ち主と管理者だけ。
//   localStorageごと消えた本当のデータ消失時は、今までどおり引き継ぎコード／復旧依頼を使う
//   （この方式では救えない＝現状と同じ）。
//
// 【旧UIDの記録と整理】所有権を取り戻す書き込みと同時に backups/{backupId}/previousUids/{旧UID} を記録する。
// Rules側で「previousUidsに追加できるのは、その書き込み直前の currentUid（＝本当の前の持ち主）だけ」と
// 検証するため、持ち主が他人のUIDを「自分の旧UID」と偽って登録することはできない。
// その後、書き込み専用の対応表 uidSupersession/{旧UID}: {newUid, backupId, recordedAt} を作り
// （読める人は誰もいない。書けるのは、そのbackupIdの現在の持ち主で、かつpreviousUidsに旧UIDが載っている場合だけ）、
// publicProfiles/{旧UID}・presence/{旧UID}・ランキングの旧UIDエントリの削除を
// 「対応表が自分を後継者と示す場合」に限ってRulesで許可する。
// 削除は自動では行わず、本人がフレンド画面の案内から「引き継いで整理する」を選んだときだけ行う
// （本人指示：自動的に何でも旧UIDデータを削除する設計にはしない）。
//
// このファイルには通信を伴わない純粋関数と、firebase/database.rules.json の該当ルールの「意図」を
// 再現するシミュレーター（テスト用）だけを置く。実際のFirebase読み書きは js/backupSync.js 側。

// ownerSecret の文字集合：既存の引き継ぎコード（js/backupSync.js）と同じ Crockford Base32 相当。
// 256 % 32 === 0 のため、乱数1バイトをそのまま32種類に変換しても偏りが出ない。
export const OWNER_SECRET_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
// 32文字 × 5ビット ＝ 160ビット相当。当てずっぽう・総当たりは事実上不可能。
export const OWNER_SECRET_LENGTH = 32;
export const OWNER_SECRET_MIN_LENGTH = 32;
export const OWNER_SECRET_MAX_LENGTH = 64;

// 暗号学的乱数で ownerSecret を1つ作る。randomBytes は差し替え可能（テストで固定値を使うため）。
export function generateOwnerSecret(randomBytes = defaultRandomBytes) {
  const bytes = randomBytes(OWNER_SECRET_LENGTH);
  return Array.from(bytes, (byte) => OWNER_SECRET_ALPHABET[byte % OWNER_SECRET_ALPHABET.length]).join("");
}

function defaultRandomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// Rules側の .validate と同じ基準（文字列・長さ32〜64）。
export function isValidOwnerSecret(value) {
  return (
    typeof value === "string" &&
    value.length >= OWNER_SECRET_MIN_LENGTH &&
    value.length <= OWNER_SECRET_MAX_LENGTH
  );
}

// 「UIDが変わったか」の判定。lastKnownUid（前回同期に成功したときのUID）が無い＝判定不能、
// 同じ＝変わっていない、違う＝変わった。
export function detectUidChange(lastKnownUid, currentUid) {
  if (typeof currentUid !== "string" || currentUid.length === 0) return { changed: false, previousUid: null };
  if (typeof lastKnownUid !== "string" || lastKnownUid.length === 0) return { changed: false, previousUid: null };
  if (lastKnownUid === currentUid) return { changed: false, previousUid: null };
  return { changed: true, previousUid: lastKnownUid };
}

// ---------------------------------------------------------------------------
// Firebase Rules の意図を再現するシミュレーター（テスト専用）
// firebase/database.rules.json の backups / uidSupersession / 後継者削除の各ルールと
// 1対1で対応させている。本物のRules構文そのものではないが、「どの条件で許可・拒否されるか」の
// 期待値をここで固定し、Rulesファイル側の構造テストと組み合わせて回帰を防ぐ。
// ---------------------------------------------------------------------------

function isAdmin(adminsMap, authUid) {
  return !!adminsMap && typeof authUid === "string" && adminsMap[authUid] === true;
}

// backups/{backupId} への書き込み（update：incoming の各キーで existing を上書きした結果が newData）。
// 戻り値 { allowed, reason }。reason は拒否理由（テストの説明用）。
export function evaluateBackupWrite({ authUid, adminsMap = {}, existing = null, incoming, now = Date.now() }) {
  if (!authUid) return { allowed: false, reason: "unauthenticated" };
  const data = existing ?? {};
  const newData = { ...data, ...incoming };

  // ---- .write（いずれか1つ満たせばよい） ----
  const byAdmin = isAdmin(adminsMap, authUid);
  const byOwner = data.currentUid === authUid;
  const byCreate = existing === null && newData.currentUid === authUid;
  const transfer = data.transfer ?? null;
  const byTransfer =
    !!transfer &&
    typeof transfer.secret === "string" &&
    transfer.usedAt === undefined &&
    typeof transfer.expiresAt === "number" &&
    transfer.expiresAt > now &&
    newData.currentUid === authUid &&
    newData.transfer?.secret === transfer.secret &&
    newData.transfer?.usedAt === now;
  // ownerClaim（使い捨ての証明）：手元の ownerSecret を送り、at は必ず「今」、ownerSecret は必ず新しい値へ。
  const claim = incoming.ownerClaim ?? null;
  const byOwnerClaim =
    typeof data.ownerSecret === "string" &&
    data.ownerSecret.length >= 32 &&
    !!claim &&
    claim.secret === data.ownerSecret &&
    claim.at === now &&
    typeof newData.ownerSecret === "string" &&
    newData.ownerSecret !== data.ownerSecret &&
    newData.currentUid === authUid;

  if (!(byAdmin || byOwner || byCreate || byTransfer || byOwnerClaim)) {
    return { allowed: false, reason: "write-denied" };
  }

  // ---- .validate ----
  for (const required of ["schemaVersion", "currentUid", "updatedAt", "payload"]) {
    if (newData[required] === undefined || newData[required] === null) return { allowed: false, reason: `missing-${required}` };
  }
  if (incoming.ownerSecret !== undefined) {
    if (!isValidOwnerSecret(incoming.ownerSecret)) return { allowed: false, reason: "invalid-ownerSecret" };
    // 保存済みの ownerSecret を変えられるのは claim・引き継ぎコード・管理者の書き込みだけ。
    const changing = typeof data.ownerSecret === "string" && incoming.ownerSecret !== data.ownerSecret;
    const viaClaim = claim?.at === now;
    const viaTransfer = incoming.transfer?.usedAt === now;
    if (changing && !(viaClaim || viaTransfer || byAdmin)) return { allowed: false, reason: "ownerSecret-change-not-allowed" };
  }
  if (claim !== null) {
    if (typeof claim.secret !== "string" || !isValidOwnerSecret(claim.secret) || typeof claim.at !== "number") {
      return { allowed: false, reason: "invalid-ownerClaim" };
    }
  }
  // previousUids/{uid}：追加できるのは「この書き込み直前の currentUid」だけ、かつ自分自身は不可。
  const incomingPrevious = incoming.previousUids ?? {};
  for (const [uid, value] of Object.entries(incomingPrevious)) {
    if (typeof value !== "number") return { allowed: false, reason: "previousUids-not-number" };
    if (uid !== data.currentUid) return { allowed: false, reason: "previousUids-not-previous-owner" };
    if (uid === authUid) return { allowed: false, reason: "previousUids-self" };
  }
  return { allowed: true, reason: null };
}

// backups/{backupId} の読み取り：現在の持ち主か管理者だけ（旧UIDも他人も読めない）。
export function evaluateBackupRead({ authUid, adminsMap = {}, existing }) {
  if (!authUid) return false;
  if (isAdmin(adminsMap, authUid)) return true;
  return !!existing && existing.currentUid === authUid;
}

// uidSupersession/{oldUid} への新規作成。読み取りは誰にも許可しない（常にfalse）。
export function evaluateUidSupersessionWrite({ authUid, oldUid, existing = null, incoming, backupsMap = {} }) {
  if (!authUid) return { allowed: false, reason: "unauthenticated" };
  if (existing !== null) return { allowed: false, reason: "already-exists" };
  if (!incoming || incoming.newUid !== authUid) return { allowed: false, reason: "newUid-mismatch" };
  if (oldUid === authUid) return { allowed: false, reason: "self" };
  const backup = backupsMap[incoming.backupId];
  if (!backup) return { allowed: false, reason: "backup-not-found" };
  if (backup.currentUid !== authUid) return { allowed: false, reason: "not-current-owner" };
  if (!backup.previousUids || backup.previousUids[oldUid] === undefined) return { allowed: false, reason: "not-recorded-previous" };
  if (typeof incoming.recordedAt !== "number") return { allowed: false, reason: "recordedAt-missing" };
  return { allowed: true, reason: null };
}

export function evaluateUidSupersessionRead() {
  return false;
}

// publicProfiles/{uid}・presence/{uid}・timeAttackLeaderboardsV3/…/{uid} の「後継者による削除」。
// 削除（newData 無し）だけを許可し、書き換えは許可しない。
export function evaluateSuccessorDelete({ authUid, targetUid, uidSupersessionMap = {}, isDelete = true }) {
  if (!authUid || !isDelete) return false;
  const record = uidSupersessionMap[targetUid];
  return !!record && record.newUid === authUid;
}

// ---------------------------------------------------------------------------
// ランキングの旧UID→新UID引き継ぎ判定（純粋関数）
// 「旧側にしか無い記録は消さない（新UID名義へ複製してから旧を消す）」「両方にあるなら速い方を残す」
// ---------------------------------------------------------------------------
// 戻り値：
//   "none"            … 旧UIDのエントリが無い（何もしない）
//   "copyThenDeleteOld" … 旧が新より速い、または新が無い → 旧の内容を新UID名義へ複製してから旧を消す
//   "deleteOld"       … 新が同等以上に速い → 旧だけ消す（記録は失われない）
export function planLeaderboardMerge(oldEntry, newEntry) {
  if (!oldEntry || typeof oldEntry.clearTimeMs !== "number") return "none";
  if (!newEntry || typeof newEntry.clearTimeMs !== "number") return "copyThenDeleteOld";
  return oldEntry.clearTimeMs < newEntry.clearTimeMs ? "copyThenDeleteOld" : "deleteOld";
}

// 旧エントリを新UID名義で書くときのpayload（Rulesの.validateが受け付けるキーだけに絞る）。
export function buildCopiedLeaderboardEntry(oldEntry, { displayName, oshiMemberId }) {
  const copied = {
    displayName: typeof displayName === "string" && displayName ? displayName : oldEntry.displayName,
    oshiMemberId: oshiMemberId ?? oldEntry.oshiMemberId ?? null,
    clearTimeMs: oldEntry.clearTimeMs,
    missCount: 0,
    achievedAt: typeof oldEntry.achievedAt === "number" ? oldEntry.achievedAt : Date.now(),
  };
  if (oldEntry.rule !== undefined && oldEntry.rule !== null) copied.rule = oldEntry.rule;
  if (oldEntry.source !== undefined && oldEntry.source !== null) copied.source = oldEntry.source;
  if (typeof oldEntry.actualQuestionCount === "number" && oldEntry.actualQuestionCount > 0) {
    copied.actualQuestionCount = oldEntry.actualQuestionCount;
  }
  return copied;
}
