// 旧UIDの「整理待ちの列」（2026-10-28新設・本人の実機報告「IDが2回以上変わった」への恒久対策）。
// Firebase・DOM・localStorage には一切触れない純粋関数だけを置く（tests/accountPermanentFix.test.js で直接検証する）。
//
// 【背景】以前は端末が覚えられる「確認待ちの旧UID」（players[].pendingUidMerge）が1件だけだった。
// 整理が終わる前にUIDがもう一度変わると、前の旧UIDが上書きされて忘れられ、そのUID名義の
// 公開プロフィール・ランキング・在席記録が整理されないまま残り続けていた（js/playerProfile.js の旧 setPendingUidMerge）。
//
// 【新しい形】players[].uidMergeQueue に、旧UIDごとに1件の記録を持つ。
//   { oldUid, backupId, state, recordedAt, updatedAt, attempts, leaderboardMergedAt, lastError, nextRetryAt }
//   state:
//     pending … まだ整理していない（自動の引き継ぎ・フレンド画面の案内の対象）
//     merging … 整理の途中（途中でアプリが閉じられた場合は、次回起動時に pending と同じ扱いで続きから）
//     failed  … 通信エラーなどで途中まで（記録は消さない。間隔を空けて再試行）
//     blocked … 権限で拒否された（例：その旧UIDの対応表が、さらに前のUIDを後継者として指している）。
//               端末からは片付けられないので、起動時の関門を止めない。24時間おきに再確認（Rules 更新後に自動で片付く）
//     merged  … 整理済み（フレンド一覧の表示整理にも使うため、最新20件まで残す）
// 【守ること】
//   ・列に入った旧UIDは、整理済みになるまで消さない（上限を超えても、整理待ちは消さず整理済みの古い記録から捨てる）
//   ・1件ずつ順番に処理する（selectActiveUidMerge は「記録が古い順で最初の1件」だけを返す）
//   ・何度呼んでも結果は同じ（冪等）：同じ旧UIDは2件にならない、整理済みは作り直さない
//   ・旧形式（pendingUidMerge 1件・completedUidMerges 配列）は読むときに列へ移す（書き換えは呼び出し側の保存時）

export const UID_MERGE_STATE = Object.freeze({
  PENDING: "pending",
  MERGING: "merging",
  FAILED: "failed",
  BLOCKED: "blocked",
  MERGED: "merged",
});

const ACTIVE_STATES = new Set([UID_MERGE_STATE.PENDING, UID_MERGE_STATE.MERGING, UID_MERGE_STATE.FAILED, UID_MERGE_STATE.BLOCKED]);
const ALL_STATES = new Set(Object.values(UID_MERGE_STATE));

// 整理済みとして残す件数（従来の completedUidMerges と同じ20件）
export const UID_MERGE_MERGED_HISTORY_MAX = 20;
// 整理待ちとして持てる件数の安全弁。実際にはUIDが50回も変わることは無い想定。超えた場合も「整理待ち」は捨てず、
// 呼び出し側へ overflow として知らせる（画面の詳細情報に出す）。
export const UID_MERGE_ACTIVE_SOFT_MAX = 50;
// 権限で拒否された旧UIDを再確認する間隔（Rules が更新されたら自然に片付くように）
export const UID_MERGE_BLOCKED_RETRY_MS = 24 * 60 * 60 * 1000;

function isUid(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128;
}

function toNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeEntry(raw) {
  if (!raw || typeof raw !== "object" || !isUid(raw.oldUid)) return null;
  const state = ALL_STATES.has(raw.state) ? raw.state : UID_MERGE_STATE.PENDING;
  return {
    oldUid: raw.oldUid,
    backupId: typeof raw.backupId === "string" && raw.backupId ? raw.backupId : null,
    state,
    recordedAt: toNumberOrNull(raw.recordedAt),
    updatedAt: toNumberOrNull(raw.updatedAt),
    attempts: Number.isInteger(raw.attempts) && raw.attempts >= 0 ? raw.attempts : 0,
    leaderboardMergedAt: toNumberOrNull(raw.leaderboardMergedAt),
    lastError: typeof raw.lastError === "string" ? raw.lastError.slice(0, 200) : null,
    nextRetryAt: toNumberOrNull(raw.nextRetryAt),
    // 【2026-10-31追加】起動時の自動処理（ランキングの引き継ぎ）もせず、本人がフレンド画面で確認して実行するまで待つ印。
    // 端末が後から（クラウドのバックアップの previousUids を読み直して）見つけた旧UIDに付ける。
    // （付いていない記録には項目自体を作らない＝今までの記録の形は変えない）
    ...(raw.requiresApproval === true ? { requiresApproval: true } : {}),
  };
}

// プレイヤー1人分の保存値（players[] の1要素）から、列を組み立てる（旧形式からの移行を含む）。
// 戻り値は新しい配列（元のオブジェクトは変更しない）。
export function normalizeUidMergeQueue(player) {
  const source = player && typeof player === "object" ? player : {};
  const queue = [];
  const seen = new Set();
  const push = (entry) => {
    if (!entry || seen.has(entry.oldUid)) return;
    seen.add(entry.oldUid);
    queue.push(entry);
  };
  if (Array.isArray(source.uidMergeQueue)) source.uidMergeQueue.forEach((raw) => push(normalizeEntry(raw)));
  // 旧形式①：確認待ち1件（pendingUidMerge）。列に無ければ「整理待ち」として加える
  const legacy = source.pendingUidMerge;
  if (legacy && typeof legacy === "object" && isUid(legacy.oldUid) && !seen.has(legacy.oldUid)) {
    const completed = Array.isArray(source.completedUidMerges) ? source.completedUidMerges : [];
    if (!completed.includes(legacy.oldUid)) {
      push(
        normalizeEntry({
          oldUid: legacy.oldUid,
          backupId: legacy.backupId,
          state: UID_MERGE_STATE.PENDING,
          recordedAt: legacy.recordedAt,
          leaderboardMergedAt: legacy.leaderboardMergedAt,
        })
      );
    }
  }
  // 旧形式②：完了済みの配列（completedUidMerges）。列に無ければ「整理済み」として加える
  if (Array.isArray(source.completedUidMerges)) {
    source.completedUidMerges.forEach((uid) => {
      if (isUid(uid) && !seen.has(uid)) push(normalizeEntry({ oldUid: uid, state: UID_MERGE_STATE.MERGED }));
    });
  }
  return queue;
}

function sortByRecorded(queue) {
  // 記録が古い順（同じ時刻・時刻不明は入っていた順のまま）。Array.prototype.sort は安定ソート。
  return [...queue].sort((a, b) => (a.recordedAt ?? 0) - (b.recordedAt ?? 0));
}

// 上限の整理：整理済みは最新 UID_MERGE_MERGED_HISTORY_MAX 件だけ残す。整理待ちは絶対に捨てない。
export function pruneUidMergeQueue(queue) {
  const list = Array.isArray(queue) ? queue : [];
  const active = list.filter((e) => ACTIVE_STATES.has(e.state));
  const merged = list.filter((e) => e.state === UID_MERGE_STATE.MERGED);
  const keptMerged = merged
    .map((e, index) => ({ e, index }))
    .sort((a, b) => (b.e.updatedAt ?? b.e.recordedAt ?? 0) - (a.e.updatedAt ?? a.e.recordedAt ?? 0) || b.index - a.index)
    .slice(0, UID_MERGE_MERGED_HISTORY_MAX)
    .map((x) => x.e);
  const keep = new Set([...active, ...keptMerged]);
  return { queue: list.filter((e) => keep.has(e)), overflow: active.length > UID_MERGE_ACTIVE_SOFT_MAX };
}

// 旧UIDを列へ加える（純粋関数）。
//   currentUid … 今のUID（同じなら加えない）
// 戻り値：{ queue, added: boolean, reason: "added"|"already-queued"|"already-merged"|"invalid"|"same-as-current" }
export function enqueueUidMerge(queue, { oldUid, backupId = null, currentUid = null, nowMs = Date.now(), requiresApproval = false }) {
  const list = Array.isArray(queue) ? queue.map((e) => ({ ...e })) : [];
  if (!isUid(oldUid)) return { queue: list, added: false, reason: "invalid" };
  if (currentUid && oldUid === currentUid) return { queue: list, added: false, reason: "same-as-current" };
  const existing = list.find((e) => e.oldUid === oldUid);
  if (existing) {
    // backupId が分からなかった記録に後から分かった値を補う（他は変えない＝進行中の印を消さない）
    if (!existing.backupId && typeof backupId === "string" && backupId) existing.backupId = backupId;
    return { queue: list, added: false, reason: existing.state === UID_MERGE_STATE.MERGED ? "already-merged" : "already-queued" };
  }
  list.push(
    normalizeEntry({ oldUid, backupId, state: UID_MERGE_STATE.PENDING, recordedAt: nowMs, updatedAt: nowMs, attempts: 0, requiresApproval })
  );
  return { queue: pruneUidMergeQueue(list).queue, added: true, reason: "added" };
}

// 今処理すべき1件を返す（純粋関数）。無ければ null。
//   ・記録が古い順に、pending／merging／failed を返す（merging は「前回の途中で閉じられた」ものとして続きから）
//   ・blocked は nextRetryAt を過ぎたものだけ（includeBlocked=true なら常に）
//   ・今のUIDと同じ旧UID（IDが元に戻った）は対象外
export function selectActiveUidMerge(queue, { nowMs = Date.now(), currentUid = null, includeBlocked = false } = {}) {
  const list = sortByRecorded(Array.isArray(queue) ? queue : []);
  for (const entry of list) {
    if (currentUid && entry.oldUid === currentUid) continue;
    if (entry.state === UID_MERGE_STATE.MERGED) continue;
    if (entry.state === UID_MERGE_STATE.BLOCKED) {
      if (includeBlocked || entry.nextRetryAt === null || entry.nextRetryAt <= nowMs) return entry;
      continue;
    }
    return entry;
  }
  return null;
}

// 【2026-10-31追加】起動時の自動処理（ランキングの引き継ぎだけ）の対象を、記録が古い順に返す（純粋関数）。
//   ・整理済み（merged）と、ランキングの引き継ぎが済んだもの（leaderboardMergedAt あり＝あとは本人の確認待ち）は含めない
//   ・権限で止まっている（blocked）ものは、再確認の時刻を過ぎたものだけ
//   ・今のUIDと同じ旧UIDも返す（呼び出し側が「IDが元に戻った」として片付ける）
// 公開プロフィール・オンライン記録の整理は自動では行わない（本人がフレンド画面の案内から確認して実行する）。
export function listAutoMigrationTargets(queue, { nowMs = Date.now() } = {}) {
  return sortByRecorded(Array.isArray(queue) ? queue : []).filter((entry) => {
    if (entry.state === UID_MERGE_STATE.MERGED) return false;
    if (entry.leaderboardMergedAt !== null && entry.leaderboardMergedAt !== undefined) return false;
    if (entry.requiresApproval === true) return false; // 本人の確認待ち（自動では何もしない）
    if (entry.state === UID_MERGE_STATE.BLOCKED) return entry.nextRetryAt === null || entry.nextRetryAt <= nowMs;
    return true;
  });
}

// 1件の状態を変える（純粋関数）。存在しない旧UIDなら何もしない。
//   patch: { state?, error?, leaderboardMergedAt?, countAttempt?: boolean }
export function updateUidMergeEntry(queue, oldUid, patch = {}, nowMs = Date.now()) {
  const list = Array.isArray(queue) ? queue.map((e) => ({ ...e })) : [];
  const entry = list.find((e) => e.oldUid === oldUid);
  if (!entry) return { queue: list, updated: false };
  if (patch.state && ALL_STATES.has(patch.state)) entry.state = patch.state;
  if (patch.error !== undefined) entry.lastError = typeof patch.error === "string" ? patch.error.slice(0, 200) : null;
  if (typeof patch.leaderboardMergedAt === "number") entry.leaderboardMergedAt = patch.leaderboardMergedAt;
  if (patch.countAttempt) entry.attempts += 1;
  entry.nextRetryAt = entry.state === UID_MERGE_STATE.BLOCKED ? nowMs + UID_MERGE_BLOCKED_RETRY_MS : null;
  if (entry.state === UID_MERGE_STATE.MERGED) entry.lastError = null;
  entry.updatedAt = nowMs;
  return { queue: pruneUidMergeQueue(list).queue, updated: true };
}

// 旧形式の「確認待ち1件」（pendingUidMerge）として保存しておく値。古い版のアプリ（別タブ等）が読んでも壊れないよう、
// 列の先頭（今処理すべき1件）をそのまま写す。無ければ null。
export function buildLegacyPendingMirror(queue, options = {}) {
  const head = selectActiveUidMerge(queue, { ...options, includeBlocked: true });
  if (!head || !head.backupId) return null;
  const mirror = { oldUid: head.oldUid, backupId: head.backupId, recordedAt: head.recordedAt };
  if (head.leaderboardMergedAt !== null) mirror.leaderboardMergedAt = head.leaderboardMergedAt;
  return mirror;
}

// 旧形式の完了済み配列（completedUidMerges）として保存しておく値（整理済みの旧UID、最大20件、古い順）。
export function buildLegacyCompletedList(queue, previousCompleted = []) {
  const merged = (Array.isArray(queue) ? queue : []).filter((e) => e.state === UID_MERGE_STATE.MERGED).map((e) => e.oldUid);
  const list = [];
  [...(Array.isArray(previousCompleted) ? previousCompleted : []), ...merged].forEach((uid) => {
    if (isUid(uid) && !list.includes(uid)) list.push(uid);
  });
  return list.slice(-UID_MERGE_MERGED_HISTORY_MAX);
}

// 端末が知っている「自分の旧UID」全部（整理待ち・整理済みの両方）。フレンド一覧の表示整理に使う。
export function listKnownOldUids(queue, { currentUid = null } = {}) {
  return (Array.isArray(queue) ? queue : []).map((e) => e.oldUid).filter((uid) => uid !== currentUid);
}

// 画面表示用の要約（純粋関数）。
export function summarizeUidMergeQueue(queue, { nowMs = Date.now(), currentUid = null } = {}) {
  const list = Array.isArray(queue) ? queue : [];
  const count = (state) => list.filter((e) => e.state === state && e.oldUid !== currentUid).length;
  const head = selectActiveUidMerge(list, { nowMs, currentUid });
  return {
    pending: count(UID_MERGE_STATE.PENDING) + count(UID_MERGE_STATE.MERGING),
    failed: count(UID_MERGE_STATE.FAILED),
    blocked: count(UID_MERGE_STATE.BLOCKED),
    merged: count(UID_MERGE_STATE.MERGED),
    headOldUid: head?.oldUid ?? null,
    overflow: pruneUidMergeQueue(list).overflow,
  };
}

// 整理の結果（js/uidSupersession.js の runPendingUidMigration の1件分）から、次の状態を決める（純粋関数）。
//   errors: 失敗理由の配列、permissionDenied: 失敗がすべて権限による拒否だったか
export function decideUidMergeOutcome({ completed, errors = [], permissionDeniedOnly = false }) {
  if (completed) return UID_MERGE_STATE.MERGED;
  if (errors.length > 0 && permissionDeniedOnly) return UID_MERGE_STATE.BLOCKED;
  return UID_MERGE_STATE.FAILED;
}
