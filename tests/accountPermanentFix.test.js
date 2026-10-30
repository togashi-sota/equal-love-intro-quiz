// 【2026-10-28新設】ID・アカウントの恒久対策の回帰テスト。
//   Q. 旧UIDの整理待ちの列（UIDが2〜4回変わる・途中終了・復元・2台の端末・上限・旧形式からの移行）
//   P. playerProfile.js への組み込み（従来の関数名のまま列として動く）
//   F. フレンド一覧の重複整理（identityKey の書き写しでは誰も隠れない／改ざんできない対応表だけでまとめる）
//   L. ランキングの重複統合（本人キー＋表示名が同じときだけ）
//   C. 以前のあなた／現在のあなたの比較と統合計画
//   M. 統合の実行役（本人の証明・試算・確認・控え・巻き戻し）
//   A. 管理者の復旧手順・アカウントの保護（偽の Firebase 認証）
//   S. 在席の接続ごとの時刻（後方互換・書き込み量）
//   R. Rules の提案ファイル（一般ユーザーが管理者になれない・他人のデータを書けない）
//   W. 配線の構造チェック
// Firebase には一切接続しない。localStorage を使うテストは、元の値を退避して最後に戻す。
import {
  UID_MERGE_STATE,
  normalizeUidMergeQueue,
  enqueueUidMerge,
  selectActiveUidMerge,
  updateUidMergeEntry,
  pruneUidMergeQueue,
  buildLegacyPendingMirror,
  buildLegacyCompletedList,
  listKnownOldUids,
  summarizeUidMergeQueue,
  decideUidMergeOutcome,
  UID_MERGE_MERGED_HISTORY_MAX,
  UID_MERGE_BLOCKED_RETRY_MS,
} from "../js/uidMergeQueue.js";
import {
  getPlayers,
  getActivePlayer,
  getPendingUidMerge,
  setPendingUidMerge,
  clearPendingUidMerge,
  getCompletedUidMerges,
  getUidMergeQueue,
  markUidMergeAttempt,
  markPendingUidMergeLeaderboardMerged,
  getKnownOldUidsForPlayer,
} from "../js/playerProfile.js";
import { collapseSamePlayerProfiles, buildProfileIdentityNote, selectSupersessionLookupCandidates, resolveSupersessionTarget, describeAdminDeleteTarget } from "../js/fanProfilesIdentity.js";
import { dedupeLeaderboardEntriesByIdentity, sortLeaderboardEntries, normalizeLeaderboardEntry } from "../js/timeAttackLeaderboard.js";
import {
  classifyBackupKey,
  planBackupMerge,
  applyBackupMergeWrites,
  describeBackupMergePlan,
  comparePublicIdentity,
  describePublicIdentityComparison,
  HISTORY_LIMITS,
} from "../js/identityDataComparison.js";
import { createIdentityMergeRunner, MERGE_SNAPSHOT_MAX } from "../js/identityMergeRunner.js";
import {
  isAccountProtectionEnabled,
  resolveAccountProtectionFlagUpdate,
  createAccountProtection,
  describeAuthErrorJa,
  describeProtectionStatus,
  validateEmailPasswordInput,
  maskEmail,
  buildAdminRecoverySteps,
} from "../js/accountRecovery.js";
import {
  classifyPresenceEntry,
  shouldTryConnectionTimestamp,
  buildPresenceHeartbeatWrites,
  estimatePresenceWriteBudget,
  PRESENCE_CONNECTION_TIMESTAMP_RETRY_MS,
  PRESENCE_STALE_CONNECTION_MS,
} from "../js/presencePayloads.js";
import { evaluateBackupWrite, evaluateSuccessorDelete } from "../js/backupOwnership.js";
import { assertEqual } from "./test-utils.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = 1_800_000_000_000;
const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

// ---------------------------------------------------------------------------
// Q. 列（純粋関数）
// ---------------------------------------------------------------------------
// 偽の端末1台：UIDが変わるたびに「前回のUID」を列へ足す（js/backupSync.js の claim 後と同じ）。
function simulateUidChanges(uids, { mergeEachBeforeNext = false } = {}) {
  let queue = [];
  for (let i = 1; i < uids.length; i += 1) {
    queue = enqueueUidMerge(queue, { oldUid: uids[i - 1], backupId: "b1", currentUid: uids[i], nowMs: NOW + i * MIN }).queue;
    if (mergeEachBeforeNext) {
      const head = selectActiveUidMerge(queue, { nowMs: NOW + i * MIN, currentUid: uids[i] });
      queue = updateUidMergeEntry(queue, head.oldUid, { state: UID_MERGE_STATE.MERGED }, NOW + i * MIN).queue;
    }
  }
  return queue;
}

// 【2026-10-29】管理者の削除確認：名前だけで相手を決めない・今の自分は消せない
function runAdminDeleteTargetTests() {
  const me = describeAdminDeleteTarget({ uid: "ME01", displayName: "がしお" }, { myUid: "ME01" });
  assertEqual([me.allowed, me.kind], [false, "me"], "D1: 今の自分自身の公開プロフィールは、管理者の削除確認でも消せない");
  const other = describeAdminDeleteTarget({ uid: "OTHER123", displayName: "ゆき", unlockedAchievementIds: ["a"] }, { myUid: "ME01", sameNameCount: 2, oshiName: "齋藤樹愛羅" });
  assertEqual(other.allowed, true, "D2: ほかのプレイヤーは削除できる（権限は Rules が決める）");
  assertEqual(other.lines[0], "ID：OTHER123", "D3: 削除確認には ID 全体を出す（名前だけで決めない）");
  assertEqual(other.lines[1].includes("同じ名前のカードが 2件"), true, "D4: 同じ名前のカードがあれば、IDで確かめるよう明記");
  assertEqual(describeAdminDeleteTarget({ uid: "OLD1" }, { myUid: "ME01", myKnownOldUids: ["OLD1"] }).kind, "my-old", "D5: 所有を確認済みの自分の以前のIDは「以前のID」と表示");
  assertEqual(describeAdminDeleteTarget({ uid: "OLD2", duplicateOfUid: "ME01" }, { myUid: "ME01" }).kind, "my-old", "D6: まとめ表示で残した以前のIDも「以前のID」");
  assertEqual(describeAdminDeleteTarget(null).allowed, false, "D7: 相手を特定できなければ削除できない");
  assertEqual(describeAdminDeleteTarget({ uid: "X", displayName: "がしお" }, { myUid: "Y", sameNameCount: 1 }).kind, "other", "D8: 名前が自分と同じでも、IDが違えば自分扱いしない");
}

function runQueueTests() {
  // Q1. UIDが2・3・4回変わっても、整理前の旧UIDを1件も忘れない（以前は上書きで忘れていた）
  [2, 3, 4].forEach((changes) => {
    const uids = Array.from({ length: changes + 1 }, (_, i) => `uid-${i}`);
    const queue = simulateUidChanges(uids);
    const current = uids[uids.length - 1];
    assertEqual(listKnownOldUids(queue, { currentUid: current }), uids.slice(0, -1), `Q1: UIDが${changes}回変わっても旧UID${changes}件を全部覚えている`);
    assertEqual(selectActiveUidMerge(queue, { nowMs: NOW + DAY, currentUid: current }).oldUid, "uid-0", `Q1: ${changes}回：古い順に1件ずつ（先頭は最初の旧UID）`);
    // 1件ずつ整理していくと、最後に整理待ちが0件になる
    let q = queue;
    const order = [];
    for (let i = 0; i < changes + 2; i += 1) {
      const head = selectActiveUidMerge(q, { nowMs: NOW + DAY, currentUid: current });
      if (!head) break;
      order.push(head.oldUid);
      q = updateUidMergeEntry(q, head.oldUid, { state: UID_MERGE_STATE.MERGED }, NOW + DAY + i).queue;
    }
    assertEqual(order, uids.slice(0, -1), `Q1: ${changes}回：1件ずつ順番に整理される（同時に2件は扱わない）`);
    assertEqual(summarizeUidMergeQueue(q, { currentUid: current }).merged, changes, `Q1: ${changes}回：全部「整理済み」として残る（表示の整理に使う）`);
  });

  // Q2. 冪等：同じ旧UIDは2件にならない・整理済みは作り直さない
  {
    let q = enqueueUidMerge([], { oldUid: "x", backupId: "b1", nowMs: NOW }).queue;
    const again = enqueueUidMerge(q, { oldUid: "x", backupId: "b1", nowMs: NOW + 1 });
    assertEqual([again.added, again.reason, again.queue.length], [false, "already-queued", 1], "Q2: 同じ旧UIDをもう一度足しても1件のまま");
    q = updateUidMergeEntry(q, "x", { state: UID_MERGE_STATE.MERGED }, NOW + 2).queue;
    assertEqual(enqueueUidMerge(q, { oldUid: "x", backupId: "b1" }).reason, "already-merged", "Q2: 整理済みの旧UIDは作り直さない");
    assertEqual(enqueueUidMerge(q, { oldUid: "me", currentUid: "me" }).reason, "same-as-current", "Q2: 今のUIDは旧UIDとして足さない");
    assertEqual(enqueueUidMerge(q, { oldUid: "" }).reason, "invalid", "Q2: 壊れた値は足さない");
    const filled = enqueueUidMerge(enqueueUidMerge([], { oldUid: "y", backupId: null, nowMs: NOW }).queue, { oldUid: "y", backupId: "b9" });
    assertEqual(filled.queue[0].backupId, "b9", "Q2: 後から分かった backupId だけは補う（進行中の印は変えない）");
  }

  // Q3. 途中でアプリが閉じた（merging のまま）→ 次回起動で同じ旧UIDから続き
  {
    let q = simulateUidChanges(["u0", "u1", "u2"]);
    q = updateUidMergeEntry(q, "u0", { state: UID_MERGE_STATE.MERGING, countAttempt: true }, NOW + 5 * MIN).queue;
    const restored = normalizeUidMergeQueue({ uidMergeQueue: JSON.parse(JSON.stringify(q)) }); // 保存→読み直し＝再起動
    const head = selectActiveUidMerge(restored, { nowMs: NOW + 6 * MIN, currentUid: "u2" });
    assertEqual([head.oldUid, head.state, head.attempts], ["u0", "merging", 1], "Q3: 途中終了しても同じ旧UIDから続ける（試行回数も残る）");
    q = updateUidMergeEntry(restored, "u0", { state: UID_MERGE_STATE.FAILED, error: "network" }, NOW + 7 * MIN).queue;
    assertEqual(selectActiveUidMerge(q, { nowMs: NOW + 8 * MIN, currentUid: "u2" }).oldUid, "u0", "Q3: 通信エラー（failed）は消さずに先頭のまま再試行");
    assertEqual(decideUidMergeOutcome({ completed: false, errors: ["x"], permissionDeniedOnly: false }), "failed", "Q3: 通信エラーは failed");
  }

  // Q4. 権限で拒否（blocked）は関門を止めず、次の旧UIDへ進む。24時間後に再確認
  {
    let q = simulateUidChanges(["u0", "u1", "u2"]);
    q = updateUidMergeEntry(q, "u0", { state: UID_MERGE_STATE.BLOCKED, error: "PERMISSION_DENIED" }, NOW).queue;
    assertEqual(selectActiveUidMerge(q, { nowMs: NOW + HOUR, currentUid: "u2" }).oldUid, "u1", "Q4: 権限で止まった旧UIDは飛ばして次へ");
    assertEqual(selectActiveUidMerge(q, { nowMs: NOW + UID_MERGE_BLOCKED_RETRY_MS + 1, currentUid: "u2" }).oldUid, "u0", "Q4: 24時間たつと再確認する（Rules 更新後に自動で片付く）");
    assertEqual(decideUidMergeOutcome({ completed: false, errors: ["a", "b"], permissionDeniedOnly: true }), "blocked", "Q4: 全部が権限の拒否なら blocked");
    assertEqual(decideUidMergeOutcome({ completed: true }), "merged", "Q4: 完了は merged");
    assertEqual(summarizeUidMergeQueue(q, { nowMs: NOW, currentUid: "u2" }).blocked, 1, "Q4: 画面用の要約に件数が出る");
  }

  // Q5. IDが元のIDに戻った（uid-returned）→ その旧UIDは対象外
  {
    const q = simulateUidChanges(["A", "B"]);
    assertEqual(selectActiveUidMerge(q, { currentUid: "A" }), null, "Q5: 今のUIDと同じ旧UIDは整理しない");
  }

  // Q6. 上限：整理済みは最新20件、整理待ちは絶対に捨てない
  {
    let q = [];
    for (let i = 0; i < 30; i += 1) {
      q = enqueueUidMerge(q, { oldUid: `m${i}`, backupId: "b", nowMs: NOW + i }).queue;
      q = updateUidMergeEntry(q, `m${i}`, { state: UID_MERGE_STATE.MERGED }, NOW + i).queue;
    }
    for (let i = 0; i < 25; i += 1) q = enqueueUidMerge(q, { oldUid: `p${i}`, backupId: "b", nowMs: NOW + 100 + i }).queue;
    const s = summarizeUidMergeQueue(q, { nowMs: NOW + 1000 });
    assertEqual([s.merged, s.pending], [UID_MERGE_MERGED_HISTORY_MAX, 25], "Q6: 整理済みは20件まで・整理待ち25件は全部残る");
    assertEqual(q.some((e) => e.oldUid === "m29") && !q.some((e) => e.oldUid === "m0"), true, "Q6: 捨てるのは古い整理済みから");
    assertEqual(pruneUidMergeQueue(Array.from({ length: 60 }, (_, i) => ({ oldUid: `z${i}`, state: "pending", recordedAt: i }))).overflow, true, "Q6: 整理待ちが50件を超えたら知らせる（それでも捨てない）");
  }

  // Q7. 旧形式（pendingUidMerge 1件・completedUidMerges）からの移行
  {
    const legacy = { pendingUidMerge: { oldUid: "L1", backupId: "b1", recordedAt: 5, leaderboardMergedAt: 7 }, completedUidMerges: ["C1", "C2"] };
    const q = normalizeUidMergeQueue(legacy);
    assertEqual(q.map((e) => [e.oldUid, e.state]), [["L1", "pending"], ["C1", "merged"], ["C2", "merged"]], "Q7: 旧形式を読むと列へ移る");
    assertEqual(q[0].leaderboardMergedAt, 7, "Q7: ランキング引き継ぎ済みの印も引き継ぐ");
    assertEqual(buildLegacyPendingMirror(q), { oldUid: "L1", backupId: "b1", recordedAt: 5, leaderboardMergedAt: 7 }, "Q7: 古い版のアプリ用に先頭を旧形式でも保存する");
    assertEqual(buildLegacyCompletedList(q, ["C0"]), ["C0", "C1", "C2"], "Q7: 完了済みの旧形式も保つ");
    assertEqual(normalizeUidMergeQueue({ pendingUidMerge: { oldUid: "C1", backupId: "b" }, completedUidMerges: ["C1"] }).map((e) => e.state), ["merged"], "Q7: 完了済みと同じ旧UIDの確認待ち（古い版の残り）は整理済みとして扱う");
    assertEqual(normalizeUidMergeQueue({ uidMergeQueue: [null, { oldUid: 3 }, { oldUid: "ok", state: "???" }] }).map((e) => [e.oldUid, e.state]), [["ok", "pending"]], "Q7: 壊れた要素は無視、知らない状態は pending");
    assertEqual(normalizeUidMergeQueue(null), [], "Q7: null でも落ちない");
  }

  // Q8. 2台の端末：同じバックアップの previousUids を両方が見つけても、それぞれの列は1件ずつ・整理は Rules が現在の持ち主だけに許す
  {
    const cloudPrevious = { u0: NOW, u1: NOW + 1 };
    const deviceA = Object.keys(cloudPrevious).reduce((q, uid) => enqueueUidMerge(q, { oldUid: uid, backupId: "b1", nowMs: NOW }).queue, []);
    const deviceB = Object.keys(cloudPrevious).reduce((q, uid) => enqueueUidMerge(enqueueUidMerge(q, { oldUid: uid, backupId: "b1" }).queue, { oldUid: uid, backupId: "b1" }).queue, []);
    assertEqual([deviceA.length, deviceB.length], [2, 2], "Q8: 2台とも同じ旧UIDを重複なく覚える");
    // 旧UIDの記録を消せるのは対応表が指す後継者だけ（2台目が別UIDなら消せない＝他人・別端末の巻き込みなし）
    const map = { u0: { newUid: "deviceA-uid" } };
    assertEqual(evaluateSuccessorDelete({ authUid: "deviceA-uid", targetUid: "u0", uidSupersessionMap: map }), true, "Q8: 後継者（現在の持ち主）は旧UIDを整理できる");
    assertEqual(evaluateSuccessorDelete({ authUid: "deviceB-uid", targetUid: "u0", uidSupersessionMap: map }), false, "Q8: もう1台（持ち主でない）は消せない → blocked として待つだけ");
  }

  // Q9. バックアップからの復元：別の端末で復元しても、クラウドの previousUids から全部の旧UIDを列へ戻せる
  {
    const previousUids = { old1: NOW - 3 * DAY, old2: NOW - 2 * DAY, old3: NOW - DAY };
    const completed = ["old1"];
    const candidates = Object.entries(previousUids).filter(([uid]) => !completed.includes(uid)).sort((a, b) => a[1] - b[1]).map(([uid]) => uid);
    const q = candidates.reduce((acc, uid) => enqueueUidMerge(acc, { oldUid: uid, backupId: "b1" }).queue, normalizeUidMergeQueue({ completedUidMerges: completed }));
    assertEqual(listKnownOldUids(q), ["old1", "old2", "old3"], "Q9: 復元後もクラウドの記録から旧UIDを全部（整理済みは整理済みのまま）復元できる");
    assertEqual(selectActiveUidMerge(q, { nowMs: NOW }).oldUid, "old2", "Q9: 整理済み（old1）は飛ばし、まだの古い方から");
  }
}

// ---------------------------------------------------------------------------
// P. playerProfile.js への組み込み（localStorage を使う。元に戻す）
// ---------------------------------------------------------------------------
function runPlayerProfileQueueTests() {
  const PLAYERS_KEY = "equalLoveIntroQuiz.players";
  const saved = localStorage.getItem(PLAYERS_KEY);
  try {
    const player = getActivePlayer();
    const strip = () =>
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(getPlayers().map(({ pendingUidMerge, completedUidMerges, uidMergeQueue, ...rest }) => rest)));
    strip();
    getPlayers(); // キャッシュを読み直させる（playerProfile は書き込み時に読み直す）
    assertEqual(setPendingUidMerge(player.playerId, { oldUid: "P-old1", backupId: "b1" }), true, "P1: 1件目の旧UIDを足せる");
    assertEqual(setPendingUidMerge(player.playerId, { oldUid: "P-old2", backupId: "b1" }), true, "P1: 【修正】整理前に別の旧UIDが来ても上書きせず足す");
    assertEqual(setPendingUidMerge(player.playerId, { oldUid: "P-old2", backupId: "b1" }), false, "P1: 同じ旧UIDは足さない（冪等）");
    assertEqual(getPendingUidMerge(player.playerId)?.oldUid, "P-old1", "P2: 先頭は古い方");
    assertEqual(getPendingUidMerge(player.playerId)?.queuedCount, 2, "P2: 残りの件数が分かる");
    const stored = JSON.parse(localStorage.getItem(PLAYERS_KEY)).find((p) => p.playerId === player.playerId);
    assertEqual(stored.pendingUidMerge?.oldUid, "P-old1", "P2: 古い版のアプリ向けの pendingUidMerge にも先頭を写す");
    markPendingUidMergeLeaderboardMerged(player.playerId, NOW, "P-old1");
    assertEqual(getPendingUidMerge(player.playerId)?.leaderboardMergedAt, NOW, "P3: ランキング引き継ぎ済みの印は対象の旧UIDに付く");
    markUidMergeAttempt(player.playerId, "P-old1", UID_MERGE_STATE.MERGING, { countAttempt: true });
    clearPendingUidMerge(player.playerId, "P-old1");
    assertEqual(getPendingUidMerge(player.playerId)?.oldUid, "P-old2", "P4: 整理済みにすると次の旧UIDが先頭になる");
    assertEqual(getCompletedUidMerges(player.playerId).includes("P-old1"), true, "P4: 整理済みは completedUidMerges にも残る（従来の表示・判定がそのまま使える）");
    assertEqual(setPendingUidMerge(player.playerId, { oldUid: "P-old1", backupId: "b1" }), false, "P4: 整理済みは作り直さない");
    clearPendingUidMerge(player.playerId);
    assertEqual(getPendingUidMerge(player.playerId), null, "P5: 全部整理すると確認待ちは無い");
    assertEqual(getKnownOldUidsForPlayer(player.playerId).sort(), ["P-old1", "P-old2"], "P5: 端末が知る旧UID（表示の整理用）");
    assertEqual(getUidMergeQueue(player.playerId).every((e) => e.state === "merged"), true, "P5: 列の状態はすべて整理済み");
    // 旧形式だけが保存されている端末（古い版から更新した直後）
    localStorage.setItem(
      PLAYERS_KEY,
      JSON.stringify(getPlayers().map((p) => (p.playerId === player.playerId ? { ...p, uidMergeQueue: undefined, pendingUidMerge: { oldUid: "LEG", backupId: "b2", recordedAt: 1 }, completedUidMerges: [] } : p)))
    );
    assertEqual(getPendingUidMerge(player.playerId)?.oldUid, "LEG", "P6: 旧形式だけの端末でも、確認待ちをそのまま読める");
    strip();
  } finally {
    if (saved === null) localStorage.removeItem(PLAYERS_KEY);
    else localStorage.setItem(PLAYERS_KEY, saved);
    getPlayers();
  }
}

// ---------------------------------------------------------------------------
// F. フレンド一覧（identityKey の評価）
// ---------------------------------------------------------------------------
function profile(uid, displayName, extra = {}) {
  return { uid, displayName, identityKey: null, updatedAt: null, unlockedAchievementIds: [], ...extra };
}

function runFriendTests() {
  // F1. 書き写し攻撃：他人の identityKey と名前を写しても、誰の画面でも本物は隠れない
  {
    const list = [profile("victim", "がしお", { identityKey: KEY_A, updatedAt: 1 }), profile("copycat", "がしお", { identityKey: KEY_A, updatedAt: 9 })];
    const view = collapseSamePlayerProfiles(list, { myUid: "third", presenceRankByUid: { copycat: { online: true, lastSeen: 9 } } });
    assertEqual(view.profiles.map((p) => p.uid), ["victim", "copycat"], "F1: 書き写し（キー＋名前）でも2枚とも表示（隠さない）");
    assertEqual(view.hidden, [], "F1: 隠したカードは無い");
    assertEqual(buildProfileIdentityNote(view.profiles[0]), "#ctim・#ycat の以前のIDかもしれません（未確認）", "F1: 「未確認」と補足するだけ（判断は本人に任せる）");
  }
  // F2. 改ざんできない対応表（uidSupersession）だけでまとめる。書き写した人が対応表を作ることはできない（Rules）
  {
    const list = [profile("old", "がしお", { identityKey: KEY_A }), profile("new", "がしお", { identityKey: KEY_A }), profile("copycat", "がしお", { identityKey: KEY_A })];
    const view = collapseSamePlayerProfiles(list, { myUid: "third", supersessionLinks: { old: "new" } });
    assertEqual(view.profiles.map((p) => p.uid), ["new", "copycat"], "F2: 対応表がある旧IDだけ隠し、書き写した人は残す");
    assertEqual(view.hidden[0], { uid: "old", primaryUid: "new", reason: "superseded" }, "F2: 理由は対応表");
  }
  // F3. UIDが3回変わった人：対応表をたどって最新のカードへまとめる（途中のカードが無くても）
  {
    const links = { u0: "u1", u1: "u2", u2: "u3" };
    const list = [profile("u0", "A"), profile("u2", "A"), profile("u3", "A")];
    const view = collapseSamePlayerProfiles(list, { myUid: "x", supersessionLinks: links });
    assertEqual(view.profiles.map((p) => p.uid), ["u3"], "F3: 旧IDが複数あっても1枚（最新）にまとまる");
    assertEqual(view.profiles[0].mergedUids.sort(), ["u0", "u2"], "F3: まとめた旧IDを記録");
    assertEqual(resolveSupersessionTarget("a", { a: "b", b: "a" }, new Set(["a", "b"])), "b", "F3: 対応が輪になっていても止まる");
  }
  // F4. 自分の端末は、整理待ちの列の旧UID全部を自分としてまとめる
  {
    const list = [profile("me-old1", "がしお"), profile("me-old2", "がしお"), profile("me", "がしお"), profile("friend", "ゆき")];
    const view = collapseSamePlayerProfiles(list, { myUid: "me", myKnownOldUids: ["me-old1", "me-old2"] });
    assertEqual(view.profiles.map((p) => p.uid), ["me", "friend"], "F4: 旧UIDが2つあっても自分は1枚");
  }
  // F5. 読み取り候補は「同じ本人キーのカードが他にもある」ものだけ（読み取りを最小に）
  {
    const list = [profile("a", "x", { identityKey: KEY_A }), profile("b", "x", { identityKey: KEY_A }), profile("c", "y", { identityKey: KEY_B }), profile("me", "z", { identityKey: KEY_A })];
    assertEqual(selectSupersessionLookupCandidates(list, { myUid: "me" }), ["a", "b"], "F5: 自分以外で本人キーが重なるカードだけ");
    assertEqual(selectSupersessionLookupCandidates(null), [], "F5: 壊れた入力");
  }
}

// ---------------------------------------------------------------------------
// L. ランキングの重複統合（2026-10-28再改訂：検証済みのつながりだけ）
// ---------------------------------------------------------------------------
function runLeaderboardTests() {
  const entry = (uid, identityKey, clearTimeMs, displayName) =>
    normalizeLeaderboardEntry(uid, { displayName, clearTimeMs, missCount: 0, achievedAt: 1, identityKey });
  const copycat = [entry("victim", KEY_A, 9000, "ゆき"), entry("copycat", KEY_A, 5000, "悪い人")];
  assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(copycat)).map((e) => e.uid), ["copycat", "victim"], "L1: 本人キーを書き写しても本物の記録は隠れない");
  // 【2026-10-28再改訂】名前まで書き写しても隠れない（identityKey＋名前での統合はやめた）
  const fullCopy = [entry("victim", KEY_A, 9000, "ゆき"), entry("copycat", KEY_A, 5000, "ゆき")];
  assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(fullCopy)).map((e) => e.uid), ["copycat", "victim"], "L1: 本人キーと名前の両方を書き写しても、本物の記録は隠れない");
  const sameMe = [entry("old", KEY_A, 9000, "がしお"), entry("new", KEY_A, 8000, "がしお")];
  assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(sameMe)).map((e) => e.uid), ["new", "old"], "L2: 証拠（対応表・自分の旧UID）が無ければ、同じキー・同じ名前でもまとめない");
  assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(sameMe), { supersessionLinks: { old: "new" } }).map((e) => e.uid), ["new"], "L2: 対応表（uidSupersession）があれば速い方の1件");
  assertEqual(dedupeLeaderboardEntriesByIdentity(sortLeaderboardEntries(sameMe), { ownPreviousUids: ["old"], selfUid: "new" }).map((e) => e.uid), ["new"], "L2: 本人の端末では自分の旧UIDとして1件");
}

// ---------------------------------------------------------------------------
// C. 以前のあなた／現在のあなた（比較と統合計画）
// ---------------------------------------------------------------------------
function runComparisonTests() {
  assertEqual(
    ["achievements", "playHistory", "highScore.5.all", "timeAttackBestReach.5.all", "timeAttackBest.normal.5.all", "lyricsQuizBest.5.4", "rankingCandidateBest", "weakSongStats", "instantChallengeClears", "oshiMembers", "playlists", "favoriteSongs"].map(classifyBackupKey),
    ["achievements", "history", "best-higher", "best-reach", "best-lower", "best-custom", "ranking-candidates", "counters", "clears", "oshi", "creations", "setting"],
    "C0: データの種類分け（到達記録はタイムの自己ベストと混同しない）"
  );

  const previous = {
    achievements: JSON.stringify({ schemaVersion: 1, unlockedAchievementIds: ["a1", "a2", "old-only"], unlockedAtById: { a1: "2026-01-01T00:00:00.000Z", a2: "2026-05-01T00:00:00.000Z", "old-only": "2026-02-01T00:00:00.000Z" } }),
    playHistory: JSON.stringify({ schemaVersion: 1, entries: [{ id: "h2", playedAt: 200 }, { id: "h1", playedAt: 100 }] }),
    "highScore.5.all": "40",
    "timeAttackBest.normal.5.all": "8000",
    "timeAttackBestReach.10.all": JSON.stringify({ questionsReached: 7, elapsedMs: 9000 }),
    rankingCandidateBest: JSON.stringify({ schemaVersion: 1, bestsByCombo: { "intro.5.all": { clearTimeMs: 7000 }, "outro.5.all": { clearTimeMs: 9000 } } }),
    weakSongStats: JSON.stringify({ schemaVersion: 1, songs: { s1: { attempts: 10, correct: 4 }, s2: { attempts: 2, correct: 2 } } }),
    oshiMembers: JSON.stringify({ favoriteMemberIds: ["m1"], mostOshiMemberId: "m1" }),
    playlists: JSON.stringify([{ id: "pl-old", name: "旧" }, { id: "pl-both", name: "旧版" }]),
    favoriteSongs: JSON.stringify(["x"]),
    "publicProfile.enabled": "true",
  };
  const current = {
    achievements: JSON.stringify({ schemaVersion: 1, unlockedAchievementIds: ["a1", "a2", "new-only"], unlockedAtById: { a1: "2026-03-01T00:00:00.000Z", a2: "2026-04-01T00:00:00.000Z", "new-only": "2026-06-01T00:00:00.000Z" } }),
    playHistory: JSON.stringify({ schemaVersion: 1, entries: [{ id: "h3", playedAt: 300 }, { id: "h1", playedAt: 100 }] }),
    "highScore.5.all": "30",
    "timeAttackBest.normal.5.all": "9000",
    "timeAttackBestReach.10.all": JSON.stringify({ questionsReached: 7, elapsedMs: 8000 }),
    rankingCandidateBest: JSON.stringify({ schemaVersion: 1, bestsByCombo: { "intro.5.all": { clearTimeMs: 7500 } } }),
    weakSongStats: JSON.stringify({ schemaVersion: 1, songs: { s1: { attempts: 3, correct: 1 } } }),
    oshiMembers: JSON.stringify({ favoriteMemberIds: ["m2"], mostOshiMemberId: "m2" }),
    playlists: JSON.stringify([{ id: "pl-both", name: "新版" }]),
    favoriteSongs: JSON.stringify(["y"]),
  };
  const plan = planBackupMerge(previous, current);
  const merged = applyBackupMergeWrites(current, plan.writes);
  const ach = JSON.parse(merged.achievements);
  assertEqual(ach.unlockedAchievementIds.sort(), ["a1", "a2", "new-only", "old-only"], "C1: 称号は和集合");
  assertEqual([ach.unlockedAtById.a1, ach.unlockedAtById.a2], ["2026-01-01T00:00:00.000Z", "2026-04-01T00:00:00.000Z"], "C1: 取得日は早い方");
  assertEqual(JSON.parse(merged.playHistory).entries.map((e) => e.id), ["h3", "h2", "h1"], "C2: 履歴は和集合（同じ id は1件）・新しい順");
  assertEqual(merged["highScore.5.all"], "40", "C3: 得点の自己ベストは高い方（合計しない）");
  assertEqual(merged["timeAttackBest.normal.5.all"], "8000", "C3: タイムの自己ベストは速い方（8000ms）");
  assertEqual(JSON.parse(merged["timeAttackBestReach.10.all"]).elapsedMs, 8000, "C3: 到達記録は同じ到達数なら速い方（現在を残す）");
  const rc = JSON.parse(merged.rankingCandidateBest).bestsByCombo;
  assertEqual([rc["intro.5.all"].clearTimeMs, rc["outro.5.all"].clearTimeMs], [7000, 9000], "C4: ランキング候補は区分ごとに速い方・以前だけの区分は加える");
  const ws = JSON.parse(merged.weakSongStats).songs;
  assertEqual([ws.s1, ws.s2], [{ attempts: 3, correct: 1 }, undefined], "C5: 【2026-10-28】累積の回数は自動では統合しない（足さない・多い方も選ばない）＝端末の値はそのまま");
  const heldWs = plan.held.find((h) => h.key === "weakSongStats");
  assertEqual([heldWs?.reason, heldWs?.previous, heldWs?.current], ["not-mergeable", previous.weakSongStats, current.weakSongStats], "C5: 以前と現在の両方の値を「保留」として計画に残す");
  assertEqual([plan.summary.heldKeyCount, "weakSongStats" in plan.writes], [1, false], "C5: 保留は1項目・書き込みには含めない");
  assertEqual(plan.held.filter((h) => h.reason === "current-kept").map((h) => h.key).sort(), ["favoriteSongs", "oshiMembers"], "C5: 今の値を残す食い違い（推し・お気に入り）も、以前の値を保留の控えに残す");
  assertEqual(classifyBackupKey("identityMergeHold"), "hold", "C5: 保留の控えは専用の種類（id ごとの和集合）");
  const holdA = JSON.stringify({ schemaVersion: 1, holds: [{ id: "h1", items: [] }] });
  const holdB = JSON.stringify({ schemaVersion: 1, holds: [{ id: "h2", items: [] }] });
  assertEqual(JSON.parse(planBackupMerge({ identityMergeHold: holdA }, { identityMergeHold: holdB }).writes.identityMergeHold).holds.map((h) => h.id), ["h2", "h1"], "C5: 保留の控えは和集合（どちらにしか無い控えも失わない）");
  assertEqual(JSON.parse(merged.oshiMembers).mostOshiMemberId, "m2", "C6: 推しメンは今の選択を優先");
  assertEqual(plan.keys.find((k) => k.key === "oshiMembers").conflicts[0].previous, "m1", "C6: 以前の推しは計画に残る（控えにも入る）");
  assertEqual(JSON.parse(merged.playlists).map((p) => [p.id, p.name]), [["pl-both", "新版"], ["pl-old", "旧"]], "C7: 自作のものは id ごとの和集合（同じ id は今の内容）");
  assertEqual(merged.favoriteSongs, current.favoriteSongs, "C8: 設定（お気に入り）は今を優先");
  assertEqual(merged["publicProfile.enabled"], "true", "C8: 今に無い設定だけ以前の値を入れる");
  assertEqual(Object.keys(planBackupMerge(previous, merged).writes), [], "C9: 統合後にもう一度計画しても何も変わらない（冪等）");
  assertEqual(planBackupMerge({}, current).summary.changedKeyCount, 0, "C9: 以前が空なら何も変えない");
  const broken = planBackupMerge({ achievements: previous.achievements }, { achievements: "{壊れた" });
  assertEqual([broken.summary.changedKeyCount, broken.summary.unreadableKeys], [0, ["achievements"]], "C10: 今の値が壊れていたら触らない");
  // 履歴の上限
  const many = (n, base) => JSON.stringify({ schemaVersion: 1, entries: Array.from({ length: n }, (_, i) => ({ id: `${base}${i}`, playedAt: i })) });
  const capped = applyBackupMergeWrites({ playHistory: many(80, "n") }, planBackupMerge({ playHistory: many(80, "o") }, { playHistory: many(80, "n") }).writes);
  assertEqual(JSON.parse(capped.playHistory).entries.length, HISTORY_LIMITS.playHistory, "C11: 履歴は既存の上限（100件）を超えない");
  // 歌詞クイズ（比較関数を差し込む）
  const lq = planBackupMerge({ "lyricsQuizBest.5.4": JSON.stringify({ score: 9 }) }, { "lyricsQuizBest.5.4": JSON.stringify({ score: 5 }) }, { compareLyricsQuizResults: (a, b) => b.score - a.score });
  assertEqual(JSON.parse(lq.writes["lyricsQuizBest.5.4"]).score, 9, "C12: 歌詞クイズは専用の比較関数で良い方");
  const lqNoCmp = planBackupMerge({ "lyricsQuizBest.5.4": JSON.stringify({ score: 9 }) }, { "lyricsQuizBest.5.4": JSON.stringify({ score: 5 }) });
  assertEqual(Object.keys(lqNoCmp.writes), [], "C12: 比較関数が無ければ今を残す（推測で入れ替えない）");
  const lines = describeBackupMergePlan(plan);
  assertEqual(lines.some((l) => l.startsWith("称号：以前だけ 1・現在だけ 1")) && lines.some((l) => l.includes("足し算せず")) && lines.some((l) => l.startsWith("苦手曲の集計（累積の回数）：") && l.includes("保留（自動では統合しません）")), true, "C13: 日本語の説明（称号の件数・累積は保留）");
  // 公開データ（UIDごと）
  const cmp = comparePublicIdentity({
    oldUid: "o",
    newUid: "n",
    oldProfile: { displayName: "がしお", unlockedAchievementIds: ["a", "b"], oshiMemberId: "m1" },
    newProfile: { displayName: "がしお", unlockedAchievementIds: ["a"], oshiMemberId: "m2" },
    leaderboardDivisions: [{ bestOldCandidate: { clearTimeMs: 5 }, newEntry: { clearTimeMs: 6 } }, { bestOldCandidate: { clearTimeMs: 5 }, newEntry: null }, { bestOldCandidate: null, newEntry: { clearTimeMs: 1 } }],
    oldPresence: { lastSeen: 1 },
    adminOld: true,
    adminNew: false,
  });
  assertEqual([cmp.leaderboard.onlyOld, cmp.leaderboard.onlyNew, cmp.leaderboard.both, cmp.leaderboard.oldFaster], [1, 1, 1, 1], "C14: ランキングの区分ごとの比較");
  const pubLines = describePublicIdentityComparison(cmp);
  assertEqual(pubLines.some((l) => l.includes("合計はしません")) && pubLines.some((l) => l.startsWith("管理者：以前のIDでは管理者")), true, "C14: 公開データの説明（ランキングは合計しない・管理者）");
  assertEqual(describePublicIdentityComparison(comparePublicIdentity({})), ["以前のIDに残っている公開データはありません"], "C14: 何も無いとき");
}

// ---------------------------------------------------------------------------
// M. 統合の実行役（偽の依存）
// ---------------------------------------------------------------------------
class MemoryStorage {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial));
    this.failSetFor = null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    if (this.failSetFor && k === this.failSetFor) return; // 書いたつもりで書けない（容量不足などの再現）
    this.map.set(k, String(v));
  }
  removeItem(k) {
    this.map.delete(k);
  }
}

function createFakeMergeEnv({ backup, local, uid = "me", ownerSecret = true, backupId = "b1" }) {
  const prefix = "equalLoveIntroQuiz.";
  const storage = new MemoryStorage(Object.fromEntries(Object.entries(local).map(([k, v]) => [`${prefix}${k}`, v])));
  const calls = { reads: 0, syncs: 0 };
  const env = {
    storage,
    calls,
    backup,
    deps: {
      storage,
      getStoragePrefix: () => prefix,
      getPlayerId: () => "default",
      getCurrentUid: () => uid,
      getBackupId: () => backupId,
      hasOwnerSecret: () => ownerSecret,
      readBackup: async () => {
        calls.reads += 1;
        return env.backup;
      },
      collectLocalEntries: () => {
        const out = {};
        storage.map.forEach((v, k) => {
          if (k.startsWith(prefix) && !k.startsWith(`${prefix}identityMerge`)) out[k.slice(prefix.length)] = v;
        });
        return out;
      },
      syncNow: async () => {
        calls.syncs += 1;
      },
      now: () => NOW,
    },
  };
  return env;
}

async function runMergeRunnerTests() {
  const prevAch = JSON.stringify({ unlockedAchievementIds: ["old"], unlockedAtById: { old: "2026-01-01T00:00:00.000Z" } });
  const curAch = JSON.stringify({ unlockedAchievementIds: ["new"], unlockedAtById: { new: "2026-02-01T00:00:00.000Z" } });

  // M1. 試算は何も書かない／確認なしでは実行しない
  {
    const env = createFakeMergeEnv({ backup: { ok: true, currentUid: "me", entries: { achievements: prevAch } }, local: { achievements: curAch } });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    const before = JSON.stringify([...env.storage.map]);
    const dry = runner.dryRun(cmp);
    assertEqual([dry.ok, dry.canExecute, JSON.stringify([...env.storage.map]) === before], [true, true, true], "M1: 試算は表示だけ（端末の記録は1文字も変わらない）");
    assertEqual((await runner.execute(cmp)).ok, false, "M1: 「本当に整理する」の確認が無ければ実行しない");
    assertEqual(env.calls.syncs, 0, "M1: 同期も呼ばない");
  }
  // M2. 本人の証明が無いと実行できない（他人のバックアップを管理者が読めても混ぜない）
  {
    const env = createFakeMergeEnv({ backup: { ok: true, currentUid: "someone-else", entries: { achievements: prevAch } }, local: { achievements: curAch } });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    assertEqual([cmp.proof.ok, runner.dryRun(cmp).canExecute], [false, false], "M2: 持ち主が今のIDでなければ実行ボタンは押せない（試算だけ）");
    const r = await runner.execute(cmp, { confirmed: true });
    assertEqual([r.ok, env.storage.getItem("equalLoveIntroQuiz.achievements") === curAch], [false, true], "M2: 実行しても拒否され、何も変わらない");
    const env2 = createFakeMergeEnv({ backup: { ok: true, currentUid: "me", entries: {} }, local: {}, ownerSecret: false });
    assertEqual((await createIdentityMergeRunner(env2.deps).compare()).proof.ok, false, "M2: ownerSecret が無い端末は証明なし");
    const env3 = createFakeMergeEnv({ backup: { ok: false, reason: "PERMISSION_DENIED" }, local: {} });
    const c3 = await createIdentityMergeRunner(env3.deps).compare();
    assertEqual([c3.ok, c3.proof.ok], [false, false], "M2: バックアップを読めない（持ち主でない）なら比較もしない");
  }
  // M3. 実行：控え → 書き込み → 読み戻し → 同期。もう一度比べると違いは無い
  {
    const env = createFakeMergeEnv({ backup: { ok: true, currentUid: "me", entries: { achievements: prevAch } }, local: { achievements: curAch } });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    const r = await runner.execute(cmp, { confirmed: true });
    assertEqual([r.ok, r.changedKeyCount, env.calls.syncs], [true, 1, 1], "M3: 整理できた（1種類・同期1回）");
    assertEqual(JSON.parse(env.storage.getItem("equalLoveIntroQuiz.achievements")).unlockedAchievementIds.sort(), ["new", "old"], "M3: 称号がまとまった");
    assertEqual(runner.hasUndo(), true, "M3: 元に戻せる控えがある");
    assertEqual((await runner.compare()).plan.summary.changedKeyCount, 0, "M3: もう一度比べると違いは無い（冪等）");
    // M4. 元に戻す
    const u = await runner.undoLast();
    assertEqual([u.ok, env.storage.getItem("equalLoveIntroQuiz.achievements")], [true, curAch], "M4: 整理前の値に戻る（自分が書いた値のままの項目）");
    assertEqual(runner.hasUndo(), false, "M4: 使った控えは消える");
  }
  // M5. 試算の後に別のタブ・端末でデータが変わった → 中止（試算し直し）
  {
    const env = createFakeMergeEnv({ backup: { ok: true, currentUid: "me", entries: { achievements: prevAch } }, local: { achievements: curAch } });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    env.backup = { ok: true, currentUid: "me", entries: { achievements: prevAch, "highScore.5.all": "50" } };
    const r = await runner.execute(cmp, { confirmed: true });
    assertEqual([r.ok, r.stale, env.storage.getItem("equalLoveIntroQuiz.achievements") === curAch], [false, true, true], "M5: 内容が変わっていたら何も書かずに中止");
    env.backup = { ok: true, currentUid: "other", entries: { achievements: prevAch } };
    assertEqual((await runner.execute(cmp, { confirmed: true })).ok, false, "M5: 途中で持ち主が変わっていたら中止");
  }
  // M6. 書けなかった（読み戻しで違う）→ 控えから全部戻す
  {
    const env = createFakeMergeEnv({
      backup: { ok: true, currentUid: "me", entries: { achievements: prevAch, "highScore.5.all": "50" } },
      local: { achievements: curAch, "highScore.5.all": "10" },
    });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    env.storage.failSetFor = "equalLoveIntroQuiz.highScore.5.all";
    const r = await runner.execute(cmp, { confirmed: true });
    assertEqual([r.ok, env.storage.getItem("equalLoveIntroQuiz.achievements"), env.calls.syncs], [false, curAch, 0], "M6: 1つでも確かめられなければ、書いた分も元に戻し同期もしない");
  }
  // M7. 控えは最新3件まで
  {
    const env = createFakeMergeEnv({ backup: { ok: true, currentUid: "me", entries: {} }, local: {} });
    let t = NOW;
    env.deps.now = () => (t += 1);
    const runner = createIdentityMergeRunner(env.deps);
    for (let i = 0; i < 5; i += 1) {
      env.backup = { ok: true, currentUid: "me", entries: { [`highScore.${i}.all`]: "5" } };
      await runner.execute(await runner.compare(), { confirmed: true });
    }
    const snapshotKeys = [...env.storage.map.keys()].filter((k) => k.startsWith("equalLoveIntroQuiz.identityMergeSnapshot."));
    assertEqual(snapshotKeys.length, MERGE_SNAPSHOT_MAX, "M7: 控えは最新3件まで（端末の容量を使いすぎない）");
    assertEqual(runner.listHolds().length, 5, "M7: 保留の控え（以前の値）は件数で捨てない（本人が確認するまで残す）");
  }
  // M8. 【2026-10-28】整理の途中で別のタブが書いた記録は上書きしない（項目ごとに比べてから書く）
  {
    const env = createFakeMergeEnv({
      backup: { ok: true, currentUid: "me", entries: { achievements: prevAch, "highScore.5.all": "50" } },
      local: { achievements: curAch, "highScore.5.all": "10" },
    });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    env.deps.beforeEachWrite = (key) => {
      if (key === "highScore.5.all") env.storage.setItem("equalLoveIntroQuiz.highScore.5.all", "70"); // 別のタブが新記録
    };
    const r = await runner.execute(cmp, { confirmed: true });
    assertEqual([r.ok, r.conflicts.map((c) => c.key)], [true, ["highScore.5.all"]], "M8: 途中で変わった項目は衝突として報告し、書かない");
    assertEqual(env.storage.getItem("equalLoveIntroQuiz.highScore.5.all"), "70", "M8: 別のタブが書いた新しい記録（70）はそのまま");
    assertEqual(JSON.parse(env.storage.getItem("equalLoveIntroQuiz.achievements")).unlockedAchievementIds.sort(), ["new", "old"], "M8: 衝突していない項目は整理される");
  }
  // M9. 失敗したとき、自分が書いた値だけ・まだ自分が書いたままのときだけ戻す
  {
    const env = createFakeMergeEnv({
      backup: { ok: true, currentUid: "me", entries: { achievements: prevAch, "highScore.5.all": "50", "timeAttackBest.normal.5.all": "7000" } },
      local: { achievements: curAch, "highScore.5.all": "10", "timeAttackBest.normal.5.all": "9000" },
    });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    env.deps.beforeEachWrite = (key) => {
      if (key === "highScore.5.all") env.storage.setItem("equalLoveIntroQuiz.achievements", "別のタブの新しい称号"); // 書き終えた項目を別のタブが更新
      if (key === "timeAttackBest.normal.5.all") throw new Error("injected-failure"); // 3つ目で失敗
    };
    const r = await runner.execute(cmp, { confirmed: true });
    assertEqual(r.ok, false, "M9: 途中で失敗したら失敗を返す");
    assertEqual(env.storage.getItem("equalLoveIntroQuiz.achievements"), "別のタブの新しい称号", "M9: 自分が書いた後に別のタブが書き換えた値は、戻さない（新しい記録を消さない）");
    assertEqual(env.storage.getItem("equalLoveIntroQuiz.highScore.5.all"), "10", "M9: 自分が書いたままの値だけ元に戻す");
    assertEqual([r.rollback.restored, r.rollback.keptBecauseChanged], [["端末:highScore.5.all"], ["端末:achievements"]], "M9: 何を戻し・何を残したかを報告する");
    assertEqual(env.storage.getItem("equalLoveIntroQuiz.timeAttackBest.normal.5.all"), "9000", "M9: 失敗した項目は書いていない");
    assertEqual(runner.listHolds().length, 1, "M9: 保留の控え（以前の値）は失敗しても残る");
  }
  // M10. 再実行（冪等）：同じ整理をもう一度しても結果は同じ
  {
    const env = createFakeMergeEnv({ backup: { ok: true, currentUid: "me", entries: { achievements: prevAch } }, local: { achievements: curAch } });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    await runner.execute(cmp, { confirmed: true });
    const after = env.storage.getItem("equalLoveIntroQuiz.achievements");
    const again = await runner.execute(cmp, { confirmed: true });
    assertEqual([again.ok, again.stale, env.storage.getItem("equalLoveIntroQuiz.achievements") === after], [false, true, true], "M10: 古い試算での再実行は中止（何も変えない）");
    const cmp2 = await runner.compare();
    assertEqual([cmp2.plan.summary.changedKeyCount, (await runner.execute(cmp2, { confirmed: true })).changedKeyCount], [0, 0], "M10: 試算し直すと違いは無く、何も書かない");
  }
  // M11. 累積の回数は保留：端末の値は変えず、両方の値を控える。確認済みにするには confirmed が必要
  {
    const prevWs = JSON.stringify({ schemaVersion: 1, songs: { s1: { attempts: 10, correct: 4 } } });
    const curWs = JSON.stringify({ schemaVersion: 1, songs: { s1: { attempts: 3, correct: 1 } } });
    const env = createFakeMergeEnv({ backup: { ok: true, currentUid: "me", entries: { weakSongStats: prevWs } }, local: { weakSongStats: curWs } });
    const runner = createIdentityMergeRunner(env.deps);
    const cmp = await runner.compare();
    const dry = runner.dryRun(cmp);
    assertEqual([dry.changedKeyCount, dry.heldKeyCount, dry.lines.some((l) => l.includes("保留（自動では統合しません）"))], [0, 1, true], "M11: 試算に「保留（自動では統合しません）」と出る");
    const r = await runner.execute(cmp, { confirmed: true });
    assertEqual([r.ok, r.changedKeyCount, env.storage.getItem("equalLoveIntroQuiz.weakSongStats")], [true, 0, curWs], "M11: 端末の回数は変えない");
    const hold = runner.listHolds()[0];
    assertEqual([hold.items[0].key, hold.items[0].previous, hold.items[0].current], ["weakSongStats", prevWs, curWs], "M11: 以前と現在の両方の値を控えた");
    assertEqual(runner.confirmHold(hold.id).ok, false, "M11: 確認なしでは控えを消さない");
    assertEqual([runner.confirmHold(hold.id, { confirmed: true }).ok, runner.listHolds().length], [true, 0], "M11: 本人が確認済みにしたときだけ消える");
  }
  // M12. 元に戻す：自分が書いた値のままの項目だけ戻す（後から別のタブが書いた値は残す）
  {
    const env = createFakeMergeEnv({
      backup: { ok: true, currentUid: "me", entries: { achievements: prevAch, "highScore.5.all": "50" } },
      local: { achievements: curAch, "highScore.5.all": "10" },
    });
    const runner = createIdentityMergeRunner(env.deps);
    await runner.execute(await runner.compare(), { confirmed: true });
    env.storage.setItem("equalLoveIntroQuiz.highScore.5.all", "80"); // 整理の後に新記録
    const u = await runner.undoLast();
    assertEqual([u.ok, env.storage.getItem("equalLoveIntroQuiz.achievements"), env.storage.getItem("equalLoveIntroQuiz.highScore.5.all")], [true, curAch, "80"], "M12: 称号は元に戻り、整理の後の新記録（80）は残る");
    assertEqual(u.keptBecauseChanged, ["端末:highScore.5.all"], "M12: 戻さなかった項目を報告する");
  }
}

// ---------------------------------------------------------------------------
// A. 管理者の復旧・アカウントの保護（偽の Firebase 認証）
// ---------------------------------------------------------------------------
function createFakeAuth({ users = {}, current }) {
  // users: { email: { uid, password } }（メールで保護済みのアカウント）
  const state = { users: { ...users }, current, linkCalls: 0, signInCalls: 0, enabled: true };
  const deps = {
    getCurrentUser: () => state.current,
    makeEmailCredential: (email, password) => ({ email, password }),
    linkWithCredential: async (user, credential) => {
      state.linkCalls += 1;
      if (!state.enabled) throw { code: "auth/operation-not-allowed" };
      if (state.users[credential.email]) throw { code: "auth/credential-already-in-use" };
      state.users[credential.email] = { uid: user.uid, password: credential.password };
      state.current = { ...user, isAnonymous: false, providerData: [{ providerId: "password", email: credential.email }] };
      return { user: state.current };
    },
    signInWithEmailAndPassword: async (email, password) => {
      state.signInCalls += 1;
      const u = state.users[email];
      if (!u || u.password !== password) throw { code: "auth/invalid-credential" };
      state.current = { uid: u.uid, isAnonymous: false, providerData: [{ providerId: "password", email }] };
      return { user: state.current };
    },
  };
  return { state, deps };
}

async function runAccountTests() {
  // A1. 機能フラグ（既定 OFF）
  assertEqual(isAccountProtectionEnabled({}), false, "A1: 一般ユーザーには既定で出さない");
  assertEqual(isAccountProtectionEnabled({ isAdmin: true }), true, "A1: 今のIDが管理者なら出す");
  assertEqual(isAccountProtectionEnabled({ rememberedAdminUids: ["old"] }), true, "A1: 以前のIDで管理者だった端末なら出す");
  assertEqual(isAccountProtectionEnabled({ storedFlag: "on" }), true, "A1: 端末で ON にしたら出す");
  assertEqual(isAccountProtectionEnabled({ urlParam: "off", isAdmin: true }), false, "A1: ?accountprotect=off で隠せる");
  assertEqual([resolveAccountProtectionFlagUpdate("on"), resolveAccountProtectionFlagUpdate("x")], ["on", null], "A1: URL の指定だけを保存する");

  // A2. 保護（link）：UIDは変わらない
  {
    const { state, deps } = createFakeAuth({ current: { uid: "anon-1", isAnonymous: true, providerData: [] } });
    const api = createAccountProtection(deps);
    assertEqual((await api.protectWithEmail({ email: "a@b.jp", password: "password1" })).ok, false, "A2: 確認が無ければ何もしない");
    assertEqual(state.linkCalls, 0, "A2: 確認前は Firebase を呼ばない");
    const r = await api.protectWithEmail({ email: " a@b.jp ", password: "password1", passwordConfirm: "password1", confirmed: true });
    assertEqual([r.ok, r.uid, r.switched], [true, "anon-1", false], "A2: 結び付けてもUIDはそのまま（別アカウントを作らない）");
    assertEqual(api.getStatus().protected, true, "A2: 保護済みと表示される");
    assertEqual((await api.protectWithEmail({ email: "a@b.jp", password: "password1", confirmed: true })).code, "auth/provider-already-linked", "A2: 二重には保護しない");
  }
  // A3. そのメールは別のアカウントで使用中 → 今のアカウントを切り替えない
  {
    const { state, deps } = createFakeAuth({ users: { "a@b.jp": { uid: "protected-uid", password: "password1" } }, current: { uid: "anon-2", isAnonymous: true, providerData: [] } });
    const r = await createAccountProtection(deps).protectWithEmail({ email: "a@b.jp", password: "password9", confirmed: true });
    assertEqual([r.ok, r.code, r.switched, state.current.uid], [false, "auth/credential-already-in-use", false, "anon-2"], "A3: 黙って切り替えない（今のIDのまま）");
    assertEqual(r.reason.includes("切り替えていません"), true, "A3: 理由を説明する");
  }
  // A4. 保存領域が消えて新しい匿名IDになった → メールでログインし直すと、以前保護した同じUIDに戻る
  {
    const { state, deps } = createFakeAuth({ users: { "owner@x.jp": { uid: "ADMIN-UID", password: "longpassword" } }, current: { uid: "anon-new", isAnonymous: true, providerData: [] } });
    const api = createAccountProtection(deps);
    assertEqual((await api.reloginWithEmail({ email: "owner@x.jp", password: "wrong", confirmed: true })).ok, false, "A4: パスワード違いは失敗（何も変えない）");
    assertEqual(state.current.uid, "anon-new", "A4: 失敗しても今のIDのまま");
    const r = await api.reloginWithEmail({ email: "owner@x.jp", password: "longpassword", confirmed: true });
    assertEqual([r.ok, r.afterUid, r.switched, r.needsReload], [true, "ADMIN-UID", true, true], "A4: 同じUIDに戻れる（管理者 admins/{uid} もそのまま有効）→ 画面を読み込み直す");
    assertEqual((await api.reloginWithEmail({ email: "owner@x.jp", password: "longpassword", confirmed: true })).ok, false, "A4: 既に保護済みのアカウントでは不要");
  }
  // A5. Console でメール/パスワードが無効 → 分かりやすい説明
  {
    const { state, deps } = createFakeAuth({ current: { uid: "anon", isAnonymous: true, providerData: [] } });
    state.enabled = false;
    const r = await createAccountProtection(deps).protectWithEmail({ email: "a@b.jp", password: "password1", confirmed: true });
    assertEqual([r.ok, r.reason.includes("Console")], [false, true], "A5: 「メール/パスワード」を有効にする必要がある、と表示");
  }
  // A6. 入力チェック・表示
  assertEqual(validateEmailPasswordInput("x", "short", "other").errors.length, 3, "A6: メールの形・8文字・確認の一致");
  assertEqual(maskEmail("gashio@icloud.com"), "ga****@icloud.com", "A6: メールは一部を隠して表示");
  assertEqual(describeAuthErrorJa("auth/network-request-failed").includes("何も変更していません"), true, "A6: 通信エラーの説明");
  assertEqual(describeProtectionStatus(null).signedIn, false, "A6: 未ログイン");
  // A7. 管理者の復旧手順（表示だけ。権限は与えない）
  const steps = buildAdminRecoverySteps("XwpK1Ca6CTVh8h6ewjm0BMh7Gr72");
  assertEqual(steps[0].includes("XwpK1Ca6CTVh8h6ewjm0BMh7Gr72") && steps.some((s) => s.includes("型＝boolean")), true, "A7: 今のIDと Console での追加手順（boolean）");
  assertEqual(steps.some((s) => s.includes("アプリから自分を管理者にする方法はありません")), true, "A7: アプリからは管理者になれないことを明記");
}

// ---------------------------------------------------------------------------
// S. 在席：接続ごとの時刻（後方互換）
// ---------------------------------------------------------------------------
function runPresenceTests() {
  assertEqual(shouldTryConnectionTimestamp({ unsupportedAtMs: null, nowMs: NOW }), true, "S1: 初めてなら時刻方式を試す");
  assertEqual(shouldTryConnectionTimestamp({ unsupportedAtMs: NOW - HOUR, nowMs: NOW }), false, "S1: 今の Rules で拒否されたら24時間は試さない（無駄な失敗をしない）");
  assertEqual(shouldTryConnectionTimestamp({ unsupportedAtMs: NOW - PRESENCE_CONNECTION_TIMESTAMP_RETRY_MS, nowMs: NOW }), true, "S1: 24時間たったら再確認（Rules 公開後に自動で切り替わる）");
  const TS = { ".sv": "timestamp" };
  assertEqual(buildPresenceHeartbeatWrites({ timestampMode: "supported", connectionKey: "-K1", connected: true, serverTimestampValue: TS }), { lastSeen: TS, "connections/-K1": TS }, "S2: 使えるときは lastSeen と接続ノードを1回でまとめて更新");
  assertEqual(buildPresenceHeartbeatWrites({ timestampMode: "unsupported", connectionKey: "-K1", connected: true, serverTimestampValue: TS }), { lastSeen: TS }, "S2: 今の Rules では従来どおり lastSeen だけ");
  assertEqual(buildPresenceHeartbeatWrites({ timestampMode: "supported", connectionKey: "-K1", connected: false, serverTimestampValue: TS }), { lastSeen: TS }, "S2: 切断中は接続ノードを書かない（消えた接続を書き戻して残骸にしない）");
  // S3. 複数端末・古いアプリの混在：iPhone（新：時刻つき・ロック中で止まった）＋PC（古い：true・lastSeen 新しい）
  const mixed = { connections: { "-iphone": NOW - 40 * MIN, "-pc-old": true }, lastSeen: NOW - MIN };
  assertEqual(classifyPresenceEntry(mixed, NOW).state, "online", "S3: 古いアプリの接続（true）は共有の lastSeen で生存判定＝オンライン");
  assertEqual(classifyPresenceEntry(mixed, NOW).freshConnectionCount, 1, "S3: 生きている接続は1つ（止まった iPhone は数えない）");
  // S4. 複数タブ：新しいアプリ2タブ、片方だけ生きている
  assertEqual(classifyPresenceEntry({ connections: { "-t1": NOW - MIN, "-t2": NOW - 3 * HOUR }, lastSeen: NOW - MIN }, NOW).state, "online", "S4: 1つでも新しい接続があればオンライン");
  // S5. 全部止まった（ロック・バックグラウンドで iOS が通信を切ったが onDisconnect が届かなかった）
  assertEqual(classifyPresenceEntry({ connections: { "-t1": NOW - 20 * MIN }, lastSeen: NOW - 20 * MIN }, NOW).state, "unknown", "S5: 15分〜1時間止まった接続は「通信不明」");
  assertEqual(classifyPresenceEntry({ connections: { "-t1": NOW - 3 * HOUR }, lastSeen: NOW - 3 * HOUR }, NOW).state, "offline", "S5: 1時間を超えた残骸はオフライン（最終接続）");
  // S6. 時計のずれ：判定はサーバー時刻基準（見る側の端末が20分ずれていても、サーバー時刻の推定で正しい）
  assertEqual(classifyPresenceEntry({ connections: { "-a": NOW - MIN }, lastSeen: NOW - MIN }, NOW).state, "online", "S6: サーバー時刻で判定すればずれの影響を受けない");
  assertEqual(PRESENCE_STALE_CONNECTION_MS, 15 * MIN, "S6: 生存の基準（15分）は変えていない");
  // S7. 書き込み量の見積もり
  const budgetNew = estimatePresenceWriteBudget({ timestampMode: "supported" });
  const budgetOld = estimatePresenceWriteBudget({ timestampMode: "unsupported" });
  assertEqual([budgetNew.writesPerHour, budgetOld.writesPerHour], [30, 30], "S7: 書き込み回数は増えない（1時間30回のまま。1回にまとめるため）");
  assertEqual(budgetNew.approxBytesPerHour - budgetOld.approxBytesPerHour, 1500, "S7: 増えるのは1時間あたり約1.5KB（1人・1接続）");
}

// ---------------------------------------------------------------------------
// R. Rules（今の本番 Rules は変えていない・提案ファイルの安全性）
// ---------------------------------------------------------------------------
async function readSource(path) {
  if (typeof window !== "undefined" && typeof fetch === "function") {
    return (await fetch(path, { cache: "no-store" })).text();
  }
  const fs = await import("node:fs");
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

// 提案ルール（2026-10-28 統合版）の uidSupersession 書き込みを写したシミュレーター（テスト内だけ）。
// 本物の Rules での確認は tools/rules-emulator（エミュレーター）で行う。ここは意図の固定。
//   ・取り消し：旧UID本人だけ（生きている旧UIDが「まだ使っている」と言える）
//   ・作成・付け替え：今の持ち主・previousUids に旧UID・新しい持ち主自身は旧UIDになっていない（循環禁止）・
//     既存があれば「同じ後継者」か「同じバックアップで前の後継者も旧UIDになった」場合だけ
function evaluateProposedSupersessionWrite({ authUid, oldUid, existing, incoming, backupsMap, supersessionAfter = {} }) {
  if (!authUid) return false;
  if (!incoming) return oldUid === authUid;
  if (oldUid === authUid || incoming.newUid !== authUid) return false;
  const backup = backupsMap[incoming.backupId];
  if (!backup || backup.currentUid !== authUid || !backup.previousUids?.[oldUid] || typeof incoming.recordedAt !== "number") return false;
  if (supersessionAfter[authUid]) return false;
  if (!existing || existing.newUid === authUid) return true;
  return existing.backupId === incoming.backupId && !!backupsMap[existing.backupId]?.previousUids?.[existing.newUid];
}

async function runRulesTests() {
  const current = JSON.parse(await readSource("firebase/database.rules.json"));
  const proposedText = await readSource("firebase/database.rules.proposed.json");
  const proposed = JSON.parse(proposedText);
  assertEqual(current.rules.admins.$uid[".write"], false, "R1: 今の Rules：admins はアプリから誰も書けない");
  assertEqual(proposed.rules.admins.$uid[".write"], false, "R1: 提案 Rules でも admins はアプリから誰も書けない（自己昇格不可）");
  assertEqual(JSON.stringify(proposed.rules.admins), JSON.stringify(current.rules.admins), "R1: 提案で admins は1文字も変えていない");
  assertEqual(current.rules.presence.$uid.connections.$connectionId[".validate"], "newData.val() === true", "R2: 今の本番 Rules（接続ノードは true だけ）は変更していない");
  assertEqual(proposed.rules.presence.$uid.connections.$connectionId[".validate"].startsWith("newData.val() === true || "), true, "R2: 提案は true も引き続き許す（古いアプリが動く＝後方互換）");
  assertEqual(proposed.rules.presence.$uid.connections.$connectionId[".validate"], "newData.val() === true || (newData.isNumber() && newData.val() === now && data.exists())", "R2: 【2026-10-28 在席担当の確認済みの形】数値は「既にある接続ノードをサーバー時刻ちょうどに」だけ（消えた接続の書き戻しを防ぐ）");
  // 【2026-10-29 v2.1】後継者の削除だけ「対応表の backupId が正しい形」の条件を足した（S18c：本番で作られたかもしれない偽の対応表を無効にする）
  const SUCCESSOR_BACKUP_ID_CHECK = " && root.child('uidSupersession').child($uid).child('backupId').val().matches(/^[A-Za-z0-9_-]{1,128}$/)";
  const SUCCESSOR_NEW_UID = "root.child('uidSupersession').child($uid).child('newUid').val() === auth.uid";
  assertEqual(proposed.rules.presence.$uid[".write"], current.rules.presence.$uid[".write"].replace(SUCCESSOR_NEW_UID, SUCCESSOR_NEW_UID + SUCCESSOR_BACKUP_ID_CHECK), "R2: 在席を書ける人（本人・後継者の削除）は変えていない（v2.1：後継者の削除に backupId の形の確認を足しただけ）");
  const changedTop = Object.keys(current.rules).filter((k) => JSON.stringify(current.rules[k]) !== JSON.stringify(proposed.rules[k]));
  assertEqual(changedTop.sort(), ["backups", "playInvites", "presence", "publicProfiles", "recoveryRequests", "rooms", "timeAttackLeaderboardsV3", "uidSupersession"], "R3: 【2026-10-29 v2.2】提案で変えたのは backups・presence・rooms（歌詞クイズ対戦の案A）・uidSupersession、後継者の削除の条件（publicProfiles・timeAttackLeaderboardsV3）、v2.2 の横断監査で直した playInvites（招待の roomId の形）・recoveryRequests（6桁の依頼番号）だけ");
  assertEqual(Object.keys(proposed.rules).filter((k) => !(k in current.rules)), ["backupSecrets"], "R3: 【2026-10-29 v2.1】新しく足した場所は backupSecrets（秘密の新しい置き場所）だけ");
  assertEqual(proposed.rules.backupSecrets.$backupId[".read"], undefined, "R3: backupSecrets には .read が無い（管理者も含めて誰も読めない）");
  assertEqual(proposed.rules[".read"] === undefined && proposed.rules[".write"] === undefined, true, "R3: ルートに .read・.write は無い（上の階層からの読み取り・書き込みの許可が backupSecrets に及ばない）");
  assertEqual(proposed.rules.uidSupersession.$oldUid.backupId[".validate"].includes(".matches(/^[A-Za-z0-9_-]{1,128}$/)"), true, "R3: 対応表の backupId は英数字・-・_ だけ（\"/\" で別の場所を指せない＝S18）");
  assertEqual(JSON.stringify(proposed.rules.publicProfiles.$uid[".write"]), JSON.stringify(current.rules.publicProfiles.$uid[".write"].replace(SUCCESSOR_NEW_UID, SUCCESSOR_NEW_UID + SUCCESSOR_BACKUP_ID_CHECK)), "R3: publicProfiles の変更は後継者の削除の条件だけ");
  assertEqual(proposed.rules.backups.$backupId[".write"].includes("(data.child('currentUid').val() === auth.uid && (!newData.exists() || newData.child('currentUid').val() === auth.uid))"), true, "R3: 持ち主の通常の書き込みでは currentUid を他人に書き換えられない（手渡しの穴を塞ぐ）");
  assertEqual(proposed.rules.backups.$backupId.previousUids.$previousUid[".validate"].includes("newData.parent().parent().child('ownerClaim').child('at').val() === now && root.child('backups').child($backupId).child('ownerSecret').isString()"), true, "R3: previousUids は所有権の証明（ownerClaim の秘密が保存済みの秘密と一致）か管理者のときだけ増やせる（v2.1：でたらめな ownerClaim では増やせない＝H3d）");
  assertEqual(JSON.stringify(proposed.rules.rooms.$roomId.players.$uid[".write"]), JSON.stringify(current.rules.rooms.$roomId.players.$uid[".write"]), "R3: 対戦の players を書ける人は変えていない（歌詞クイズの検証を足しただけ）");
  assertEqual(proposed.rules.uidSupersession.$oldUid.newUid[".read"], "auth != null", "R4: 対応表は newUid だけ読める（backupId は読めない）");
  assertEqual(proposed.rules.uidSupersession.$oldUid[".read"], undefined, "R4: 対応表全体（backupId を含む）は読めないまま");
  // R5. 提案の re-point：同じバックアップの現在の持ち主だけが、UIDが2回以上変わったときに後継者を付け替えられる
  const backups = { b1: { currentUid: "uid3", previousUids: { uid1: 1, uid2: 2 } }, evil: { currentUid: "attacker", previousUids: { attackerOld: 1 } } };
  const existing = { newUid: "uid2", backupId: "b1", recordedAt: 1 };
  assertEqual(evaluateProposedSupersessionWrite({ authUid: "uid3", oldUid: "uid1", existing, incoming: { newUid: "uid3", backupId: "b1", recordedAt: 3 }, backupsMap: backups }), true, "R5: 今の持ち主（uid3）は uid1 の後継者を自分に付け替えられる");
  assertEqual(evaluateProposedSupersessionWrite({ authUid: "attacker", oldUid: "uid1", existing, incoming: { newUid: "attacker", backupId: "evil", recordedAt: 3 }, backupsMap: backups }), false, "R5: 他人は別のバックアップを使っても付け替えられない");
  assertEqual(evaluateProposedSupersessionWrite({ authUid: "attacker", oldUid: "victim", existing: null, incoming: { newUid: "attacker", backupId: "evil", recordedAt: 3 }, backupsMap: backups }), false, "R5: 自分のバックアップの旧UIDでない人（他人）の対応表は作れない");
  assertEqual(evaluateProposedSupersessionWrite({ authUid: "uid3", oldUid: "uid1", existing, incoming: null, backupsMap: backups }), false, "R5: 後継者・他人は対応表を消せない");
  assertEqual(evaluateProposedSupersessionWrite({ authUid: "uid1", oldUid: "uid1", existing, incoming: null, backupsMap: backups }), true, "R5: 旧UID本人（生きていた）は自分の対応表を取り消せる");
  const family = { x2: { currentUid: "sib", previousUids: { z: 1 } } };
  assertEqual(evaluateProposedSupersessionWrite({ authUid: "sib", oldUid: "z", existing: { newUid: "a", backupId: "x2" }, incoming: { newUid: "sib", backupId: "x2", recordedAt: 3 }, backupsMap: family }), false, "R5: 引き継ぎコードの受け取り側は、前の後継者が旧UIDになっていない対応表を付け替えられない");
  assertEqual(evaluateProposedSupersessionWrite({ authUid: "uid3", oldUid: "uid2", existing: null, incoming: { newUid: "uid3", backupId: "b1", recordedAt: 3 }, backupsMap: backups, supersessionAfter: { uid3: { newUid: "uid2" } } }), false, "R5: 自分が旧UIDのままでは対応表を作れない（循環を作らない）");
  // R6. 一般ユーザーは他人のバックアップを書けない（既存の検証の再確認）
  assertEqual(evaluateBackupWrite({ authUid: "attacker", existing: { schemaVersion: 1, currentUid: "victim", updatedAt: 1, payload: {} }, incoming: { currentUid: "attacker" }, now: NOW }).allowed, false, "R6: 他人のバックアップは乗っ取れない");
}

// ---------------------------------------------------------------------------
// W. 配線の構造チェック
// ---------------------------------------------------------------------------
async function runWiringTests() {
  const sync = await readSource("js/backupSync.js");
  // 【2026-10-29】ownerSecret の新しい置き場所（backupSecrets）：先に試し、v2.1 が未公開なら従来の書き込みへ（機能の有無の判定）
  assertEqual(sync.includes("applied = await tryVaultOwnershipAttempts(player.playerId, vaultAttempts, { database, ref, update });") && sync.includes("if (!applied) for (const attempt of attempts) {"), true, "W0: 同期は新しい置き場所の形を先に試し、通らなければ従来の形（v383 と同じ）へ");
  assertEqual(sync.includes("vaultRulesUnavailable = true;"), true, "W0: 新しい置き場所が使えない Rules だと分かったら、そのセッションは試さない");
  assertEqual(sync.includes("if (applied.claim && !applied.vault) {"), true, "W0: 新しい形の claim は端末の秘密を確定済み（従来の作り直し・ownerClaim の後始末はしない）");
  assertEqual(sync.includes('["vault", buildVaultTransferClaimWrites(') && sync.includes('["legacy", { ...baseClaim,') && sync.includes('["minimal", baseClaim]'), true, "W0: 引き継ぎコードは 新しい形 → v383 の形 → 3項目 の順");
  assertEqual(sync.includes('restoreFromBackup(backupId, { keepOwnerSecret, ownerSecretInVault: claimedForm === "vault" })'), true, "W0: 引き継ぎで書いた秘密を復元で作り直さない（端末とクラウドの秘密をそろえる）");
  const adminSrc = await readSource("js/backupAdmin.js");
  assertEqual(adminSrc.includes("await update(ref(database), { ...writes, [`backupSecrets/${backupId}`]: null });") && adminSrc.includes("await update(ref(database), writes);"), true, "W0: 管理者の復旧承認は backupSecrets も消し、未公開なら従来の形でやり直す");
  const repairSrc = await readSource("js/adminUidRepair.js");
  assertEqual(repairSrc.includes("includeSecretVault: true"), true, "W0: 管理者のUID付け替えも backupSecrets を消す形を先に試す");
  assertEqual(sync.includes("for (const [oldUid] of candidates) {") && sync.includes("setPendingUidMerge(player.playerId, { oldUid, backupId, requiresApproval: isSessionRecheck });"), true, "W1: クラウドの旧UIDを全部（1件だけでなく）列へ足す");
  assertEqual(sync.includes("(lastKnownUidBeforeSync === null || applied.claim)"), true, "W1: claim 直後にもクラウドの旧UIDを確認する");
  const sup = await readSource("js/uidSupersession.js");
  // 【2026-10-31改訂】公開データの整理は本人の確認待ちで残るため、先頭だけでなく「ランキングの引き継ぎがまだの旧UID」を古い順にたどる
  assertEqual(sup.includes("listAutoMigrationTargets(getUidMergeQueue(player.playerId), { nowMs: now }).slice(0, maxItems)") && sup.includes("for (const target of targets) {"), true, "W2: 旧UIDを1件ずつ順番に処理する（記録が古い順・最大 maxItems 件）");
  assertEqual(sup.includes("UID_MERGE_STATE.BLOCKED") && sup.includes("UID_MERGE_STATE.MERGING"), true, "W2: 途中・権限拒否の状態を記録する");
  assertEqual(sup.includes('if (one.status === "leaderboard-incomplete") {'), true, "W2: ランキングが途中なら関門を止める（重複を作らない）");
  // 【2026-10-28】UIDが元に戻ったとき（循環になる）は「自分の対応表の取り消し＋新しい対応表」を1回の更新で
  const { buildSupersessionWrites } = await import("../js/uidSupersession.js");
  assertEqual(
    buildSupersessionWrites({ oldUid: "B", newUid: "A", backupId: "x", recordedAt: 1, revokeOwn: true }),
    { "uidSupersession/B": { newUid: "A", backupId: "x", recordedAt: 1 }, "uidSupersession/A": null },
    "W2: 循環の解消は「自分の対応表の取り消し」と同じ1回の更新で行う（途中の状態を作らない）"
  );
  assertEqual(Object.keys(buildSupersessionWrites({ oldUid: "B", newUid: "A", backupId: "x", recordedAt: 1 })), ["uidSupersession/B"], "W2: 通常は対応表1件だけを書く");
  assertEqual(sup.includes("if (!isPermissionDeniedError(error)) throw error;") && sup.includes("revokeOwn: true"), true, "W2: 取り消し付きの書き直しは、拒否されたときだけ（通信エラーでは行わない）");
  const presence = await readSource("js/presenceSync.js");
  assertEqual(presence.includes("return set(connectionRef, true);") && presence.includes("rememberConnectionTimestampUnsupported();"), true, "W3: 時刻の書き込みが拒否されたら true で書き直す（今の本番 Rules で動く）");
  assertEqual(presence.includes("PRESENCE_LASTSEEN_HEARTBEAT_INTERVAL_MS = 120000"), true, "W3: ハートビート間隔（2分）は変えていない");
  const screen = await readSource("js/fanProfilesScreen.js");
  assertEqual(screen.includes("mountAccountRecoveryPanel(elements.details, {") && screen.includes("supersessionLinks,"), true, "W4: 詳細情報のパネルと対応表を使う");
  const panel = await readSource("js/accountRecoveryPanel.js");
  assertEqual(panel.includes("runner.execute(lastComparison, { confirmed: true })") && panel.includes("本当に整理する"), true, "W5: 実行は確認ボタンの後だけ");
  assertEqual(/\b(set|update|push|remove)\(ref\(/.test(panel), false, "W5: パネル自体は Firebase に書かない（読み取りと通常の同期だけ）");
  const recovery = await readSource("js/accountRecovery.js");
  assertEqual(/admins/.test(recovery.replace(/\/\/.*$/gm, "").replace(/`[^`]*`|"[^"]*"/g, "")), false, "W6: アカウント保護のコードは admins に一切触れない");
  const adminConfig = await readSource("js/adminConfig.js");
  assertEqual(/\b(set|update|push)\(ref\(database/.test(adminConfig), false, "W6: 管理者判定は書き込みをしない（従来どおり）");
}

export async function runAccountPermanentFixTests() {
  runQueueTests();
  runPlayerProfileQueueTests();
  runFriendTests();
  runLeaderboardTests();
  runAdminDeleteTargetTests();
  runComparisonTests();
  await runMergeRunnerTests();
  await runAccountTests();
  runPresenceTests();
  await runRulesTests();
  await runWiringTests();
}
