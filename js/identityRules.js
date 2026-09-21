// 【2026-09-22 第11回・本人指示】「古いクライアントでも UID差し替えによる二重登録を作れない」ための
// Firebase Rules 側の不変条件（サーバー側防波堤）を、テストで検証できる形に写した純粋関数群。
// firebase/database.rules.json の timeAttackLeaderboardsV3 / publicProfiles の .validate と 1対1 で対応させる。
// 本物の Rules 構文ではないが、「どの書き込みが許可／拒否されるか」の期待値をここで固定し、
// Rules ファイル側の構造テスト（tests/identityRulesInvariant.test.js）と組み合わせて回帰を防ぐ。
//
// 【不変条件】
//   ・新規レコード（data が無い）の作成には identityKey（16〜64文字の文字列）が必須
//   ・既存レコード（旧形式・identityKey 無し）は更新・後追い付与できる（legacy を壊さない）
//   ・既に identityKey を持つレコードから identityKey を消す書き込みは拒否（古いクライアントの set() で失われない）
//   ・削除（newData 無し）は .validate の対象外（管理者削除・後継者削除は従来どおり）
// これにより、v346 以前の古いクライアントが「新UID名義で identityKey 無しの記録」を作ろうとしても
// PERMISSION_DENIED になり、Firebase 側で「同じ人が2人」が作られない（第三の防御）。

function isValidIdentityKeyValue(value) {
  return typeof value === "string" && value.length >= 16 && value.length <= 64;
}

// レコード単位の .validate（identityKey に関する部分）。existing＝data、incoming＝newData（set なら全体、
// update なら既存に上書きした結果）。戻り値 { allowed, reason }。
export function evaluateIdentityKeyInvariant({ existing = null, incoming }) {
  if (incoming === null || incoming === undefined) return { allowed: true, reason: null }; // 削除は対象外
  const hasIncomingKey = incoming.identityKey !== undefined && incoming.identityKey !== null;
  if (hasIncomingKey && !isValidIdentityKeyValue(incoming.identityKey)) {
    return { allowed: false, reason: "identityKey-invalid" };
  }
  if (!existing) {
    return hasIncomingKey ? { allowed: true, reason: null } : { allowed: false, reason: "identityKey-required-on-create" };
  }
  const existingHasKey = existing.identityKey !== undefined && existing.identityKey !== null;
  if (existingHasKey && !hasIncomingKey) return { allowed: false, reason: "identityKey-removal-forbidden" };
  return { allowed: true, reason: null };
}

// update() の結果（newData）を作る：既存に上書き、null は削除。
export function applyUpdate(existing, fields) {
  const next = { ...(existing ?? {}) };
  Object.entries(fields ?? {}).forEach(([key, value]) => {
    if (value === null) delete next[key];
    else next[key] = value;
  });
  return next;
}

// timeAttackLeaderboardsV3/{v}/{n}/{c}/{uid} への書き込み全体（.write と .validate）のシミュレーター。
//   authUid：書き込む人、targetUid：$uid、adminsMap、supersessionMap：{旧UID: {newUid}}、
//   existing：data、incoming：newData（null＝削除）
export function evaluateLeaderboardV3Write({ authUid, targetUid, adminsMap = {}, supersessionMap = {}, existing = null, incoming }) {
  if (!authUid) return { allowed: false, reason: "unauthenticated" };
  const isDelete = incoming === null || incoming === undefined;
  const isAdmin = adminsMap[authUid] === true;
  const isSuccessor = supersessionMap[targetUid]?.newUid === authUid;
  const writeAllowed = authUid === targetUid || (isAdmin && isDelete) || (isSuccessor && isDelete);
  if (!writeAllowed) return { allowed: false, reason: "write-denied" };
  if (isDelete) return { allowed: true, reason: null };
  for (const key of ["displayName", "clearTimeMs", "missCount", "achievedAt"]) {
    if (incoming[key] === undefined || incoming[key] === null) return { allowed: false, reason: `missing-${key}` };
  }
  if (incoming.missCount !== 0) return { allowed: false, reason: "missCount-not-zero" };
  return evaluateIdentityKeyInvariant({ existing, incoming });
}

// publicProfiles/{uid} への書き込み全体のシミュレーター。
export function evaluatePublicProfileWrite({ authUid, targetUid, adminsMap = {}, supersessionMap = {}, existing = null, incoming }) {
  if (!authUid) return { allowed: false, reason: "unauthenticated" };
  const isDelete = incoming === null || incoming === undefined;
  const isAdmin = adminsMap[authUid] === true;
  const isSuccessor = supersessionMap[targetUid]?.newUid === authUid;
  const writeAllowed = authUid === targetUid || (isAdmin && isDelete) || (isSuccessor && isDelete);
  if (!writeAllowed) return { allowed: false, reason: "write-denied" };
  if (isDelete) return { allowed: true, reason: null };
  return evaluateIdentityKeyInvariant({ existing, incoming });
}

// 読み取り：どちらも auth != null なら読める（legacy も含めて）。
export function evaluateIdentityNodeRead({ authUid }) {
  return { allowed: Boolean(authUid), reason: authUid ? null : "unauthenticated" };
}
