// 旧UID → 新UID の「引き継ぎと整理」（2026-09-15新設、本人指示：第2弾）。
//
// js/backupSync.js が ownerSecret でバックアップの所有権を取り戻した（＝UIDが変わったことを検知した）
// 直後に、旧UIDと新UIDの対応を Firebase の uidSupersession/{旧UID} へ記録する（recordUidSupersession）。
// 旧UIDに残った公開プロフィール・ランキング記録・presence の整理は自動では行わず、
// フレンド画面の案内から本人が「内容を確認 → 実行」したときだけ行う（planUidMerge → executeUidMerge）。
//
// 【データ保全の原則（本人指示）】
// ・旧UIDにしか無い有効なランキング記録は消さない → 新UID名義へ複製してから旧を消す
// ・旧・新の両方にある → 速い方を新UID名義で1件だけ残す（旧の方が速ければ旧の内容を複製）
// ・新UIDにしか無い記録 → そのまま
// ・実行前に「旧UID側の全記録」を端末（localStorage）へスナップショットとして保存し、
//   万一の巻き戻しに使えるようにする
// ・複製は必ず読み戻して確認してから旧を削除する（確認できなければ旧は消さない）
//
// 【権限】旧UIDのデータを消せるのは、firebase/database.rules.json の
// 「uidSupersession/{旧UID}/newUid が自分」という条件を満たす後継者だけ（他人のデータは消せない）。
// uidSupersession/{旧UID} 自体は、そのbackupIdの現在の持ち主で、かつ backups/{backupId}/previousUids に
// 旧UIDが（Rulesの検証つきで）記録されている場合にしか作れない。

import {
  getActivePlayer,
  getBackupId,
  getPendingUidMerge,
  clearPendingUidMerge,
  markPendingUidMergeLeaderboardMerged,
  markUidMergeAttempt,
} from "./playerProfile.js";
import { UID_MERGE_STATE, decideUidMergeOutcome } from "./uidMergeQueue.js";
import { getMostOshiMemberId } from "./oshiMembers.js";
import {
  LEADERBOARD_QUESTION_COUNT_VALUES,
  LEADERBOARD_CATEGORY_VALUES,
  LEADERBOARD_RULE_VALUES,
  buildLeaderboardPath,
  isValidLeaderboardIdentityKey,
  computeLeaderboardIdentityKey,
} from "./timeAttackLeaderboard.js";
import { planLeaderboardMerge, buildCopiedLeaderboardEntry } from "./backupOwnership.js";

// ランキングの出題タイプ（js/timeAttackScreen.jsのTIME_ATTACK_VARIANTと同じ3種。DOM依存の
// timeAttackScreen.js を import しないため、ここに列挙する）。
export const LEADERBOARD_VARIANT_VALUES = ["intro", "randomPlayback", "outro"];

const SNAPSHOT_KEY_PREFIX = "equalLoveIntroQuiz.uidMergeSnapshot.";

async function loadFirebase() {
  const firebaseClient = await import("./firebaseClient.js");
  const rtdb = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
  await firebaseClient.authReady;
  return { database: firebaseClient.database, uid: firebaseClient.getCurrentUid(), ...rtdb };
}

// 対応表 uidSupersession/{旧UID} を作る。既に存在する（＝過去に記録済み）場合はRulesで拒否されるが、
// それは正常なので失敗扱いにしない。通信失敗も呼び出し側のプレイを止めない（console.warnのみ）。
export async function recordUidSupersession(oldUid, backupId) {
  try {
    const { database, uid, ref, set, serverTimestamp } = await loadFirebase();
    if (!uid || !oldUid || oldUid === uid) return false;
    await set(ref(database, `uidSupersession/${oldUid}`), { newUid: uid, backupId, recordedAt: serverTimestamp() });
    return true;
  } catch (error) {
    console.warn("旧UIDと新UIDの対応の記録に失敗しました（既に記録済みの場合も含む）", error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 【2026-09-22追加：ランキング記録の自動引き継ぎ（重複を作らない第一線）】
// 旧UIDが端末で分かっている（pendingUidMerge がある）のに本人の手動実行を待つ間、
// ランキング候補の自動再送信（js/rankingCandidateAutoSync.js）が新UID名義の記録を先に作り、
// 旧UID名義の記録と並んで「同じ人が2人」に見えていた（2026-09-22の再発調査で判明）。
// ランキング記録の統合は「速い方を新UID名義で1件残す」だけで何も失わないため、本人の確認を
// 待たずに自動で行う。公開プロフィール・presence の整理（本人が見て判断する項目）は従来どおり
// フレンド画面の案内から手動で行う（planUidMerge／executeUidMerge は無変更）。
// 【失敗時】1区分でも失敗（通信・権限）したら「完了」にはせず、次の機会に同じ処理をやり直す。
// 同じ旧UIDについて短時間に何度も45区分を読みに行かないよう、試行間隔を空ける。
// ---------------------------------------------------------------------------
// 【2026-09-22改訂】6時間→10分。起動時の「本人確認の関門」（js/identityBootstrap.js）はこの統合が終わるまで
// ランキング再送信を止めるため、失敗時の再試行を長く待たせない。
const AUTO_MERGE_RETRY_INTERVAL_MS = 10 * 60 * 1000;
const AUTO_MERGE_TRIED_AT_KEY_PREFIX = "equalLoveIntroQuiz.uidMergeLeaderboardTriedAt.";

function readAutoMergeTriedAt(oldUid) {
  try {
    const raw = localStorage.getItem(`${AUTO_MERGE_TRIED_AT_KEY_PREFIX}${oldUid}`);
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeAutoMergeTriedAt(oldUid, at) {
  try {
    localStorage.setItem(`${AUTO_MERGE_TRIED_AT_KEY_PREFIX}${oldUid}`, String(at));
  } catch {
    // 保存できなくても処理自体は続ける（次回また試すだけ）
  }
}

// 【2026-10-28追加】権限で拒否されたか（Firebase の PERMISSION_DENIED）。js/backupSync.js と同じ判定。
export function isPermissionDeniedError(error) {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  return /PERMISSION_DENIED|permission_denied|permission-denied/i.test(`${code} ${message}`);
}

// 戻り値: { attempted: boolean, copied, deletedOld, errors: string[], completed: boolean, blocked: boolean, oldUid }
//   completed は「旧UIDのランキング記録がもう残っていない」＝既に完了済みの場合も true。
//   blocked は「失敗がすべて権限による拒否だった」（端末からは片付けられない。js/uidMergeQueue.js の blocked）。
// 【2026-10-28改訂】旧UIDの整理待ちが列になったため、target（列の1件）を受け取れるようにした。省略時は列の先頭。
export async function autoMergeSupersededLeaderboardEntries({ identityKey = null, now = Date.now(), target = null } = {}) {
  const result = { attempted: false, copied: 0, deletedOld: 0, errors: [], completed: false, blocked: false, oldUid: null };
  const player = getActivePlayer();
  const pending = target ?? getPendingUidMerge(player.playerId, { nowMs: now });
  if (!pending) return result;
  result.oldUid = pending.oldUid;
  if (pending.leaderboardMergedAt) return { ...result, completed: true };
  if (now - readAutoMergeTriedAt(pending.oldUid) < AUTO_MERGE_RETRY_INTERVAL_MS) return result;

  let fb;
  try {
    fb = await loadFirebase();
  } catch {
    return result;
  }
  const { database, uid, ref, get, set, remove } = fb;
  if (!uid || pending.oldUid === uid) return result;
  result.attempted = true;
  writeAutoMergeTriedAt(pending.oldUid, now);
  // 途中でアプリが閉じられても、次回起動時にこの旧UIDから続きを行う（列の中の印）
  markUidMergeAttempt(player.playerId, pending.oldUid, UID_MERGE_STATE.MERGING, { countAttempt: true, nowMs: now });

  // 旧UIDの記録を消す権限（Rules：uidSupersession/{旧UID}/newUid が自分）に必要な対応表を確実に用意する
  // （既に記録済みなら Rules で拒否されるが、それは正常）。
  await recordUidSupersession(pending.oldUid, pending.backupId);

  const displayName = player.playerName;
  const oshiMemberId = getMostOshiMemberId();
  let deniedCount = 0;
  for (const variant of LEADERBOARD_VARIANT_VALUES) {
    for (const questionCountValue of LEADERBOARD_QUESTION_COUNT_VALUES) {
      for (const categoryFilterValue of LEADERBOARD_CATEGORY_VALUES) {
        const path = buildLeaderboardPath(variant, questionCountValue, categoryFilterValue);
        const label = `${variant}/${questionCountValue}/${categoryFilterValue}`;
        try {
          const division = (await get(ref(database, path))).val() ?? {};
          const oldEntry = division[pending.oldUid] ?? null;
          const newEntry = division[uid] ?? null;
          const action = planLeaderboardMerge(oldEntry, newEntry);
          if (action === "none") continue;
          if (action === "copyThenDeleteOld") {
            // 【第11回】複製には identityKey（同一人物の印）が必須（Rules で新規記録は identityKey 必須）。
            // キーが無ければ複製せず旧記録を残す（記録を失わない側に倒す）。
            if (!isValidLeaderboardIdentityKey(identityKey)) {
              result.errors.push(`${label}: 本人キーを作れないため新IDへ複製できません（旧IDの記録は残しました）`);
              continue;
            }
            const copied = { ...buildCopiedLeaderboardEntry(oldEntry, { displayName, oshiMemberId }), identityKey };
            await set(ref(database, `${path}/${uid}`), copied);
            const readBack = (await get(ref(database, `${path}/${uid}`))).val();
            if (!readBack || readBack.clearTimeMs !== copied.clearTimeMs) {
              result.errors.push(`${label}: 新IDへの複製を確認できなかったため、旧IDの記録は残しました`);
              continue;
            }
            result.copied += 1;
          }
          await remove(ref(database, `${path}/${pending.oldUid}`));
          result.deletedOld += 1;
        } catch (error) {
          console.warn(`[uidMerge:auto] ${label} の処理に失敗`, error);
          if (isPermissionDeniedError(error)) deniedCount += 1;
          result.errors.push(`${label}: ${error?.code ?? "エラー"}（旧IDの記録は残しました）`);
        }
      }
    }
  }

  if (result.errors.length === 0) {
    markPendingUidMergeLeaderboardMerged(player.playerId, now, pending.oldUid);
    result.completed = true;
  } else {
    result.blocked = deniedCount === result.errors.length;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 【2026-09-22追加：UID変更後の自動引き継ぎ（本人確認の関門から呼ばれる）】
// 端末に「旧UID→新UID」の確認待ちがあるとき、本人の操作を待たずに
//   ①旧UIDのランキング記録を新UID名義へ引き継ぐ（速い方を1件残す。記録は失わない）
//   ②旧UIDの公開プロフィールを消す（フレンド一覧の重複を解消。新UIDの公開プロフィールは通常同期で再作成される）
//   ③旧UIDの presence を消す
// を順に行う。①が終わるまで js/identityBootstrap.js は READY にならない（＝ランキング再送信を止める）。
// ②③は「できなければ次回」で、READY を妨げない（実害が「フレンド一覧に旧名義が残る」程度のため）。
// 何回実行しても結果は同じ（冪等）：既に消えているものは「無い」として成功扱い、途中で閉じても次回続きから。
// 【2026-10-28改訂：旧UIDが複数あっても1件ずつ順番に】列（js/uidMergeQueue.js）の先頭から1件ずつ処理する。
//   ・完了 → 整理済みにして次の旧UIDへ
//   ・権限で拒否（例：その旧UIDの対応表がさらに前のUIDを後継者として指していて、今のUIDからは消せない）
//     → blocked にして次の旧UIDへ（関門は止めない。24時間おきに再確認）
//   ・通信エラーなど → failed にしてそこで止める（ランキング段階なら "leaderboard-incomplete"＝関門は待つ）
// 戻り値: { status: "none" | "leaderboard-incomplete" | "completed" | "partial" | "blocked", leaderboard, profileDeleted, presenceDeleted, errors, items }
// ---------------------------------------------------------------------------
export const UID_MIGRATION_MAX_ITEMS_PER_RUN = 5;

async function runSingleUidMigration(player, pending, { identityKey, now }) {
  const leaderboard = await autoMergeSupersededLeaderboardEntries({ identityKey, now, target: pending });
  if (!leaderboard.completed) {
    if (leaderboard.attempted && leaderboard.blocked) {
      markUidMergeAttempt(player.playerId, pending.oldUid, UID_MERGE_STATE.BLOCKED, { error: leaderboard.errors[0] ?? "permission-denied", nowMs: now });
      return { oldUid: pending.oldUid, status: "blocked", leaderboard, profileDeleted: false, presenceDeleted: false, errors: leaderboard.errors };
    }
    if (leaderboard.attempted) {
      markUidMergeAttempt(player.playerId, pending.oldUid, UID_MERGE_STATE.FAILED, { error: leaderboard.errors[0] ?? "error", nowMs: now });
    }
    return { oldUid: pending.oldUid, status: "leaderboard-incomplete", leaderboard, profileDeleted: false, presenceDeleted: false, errors: leaderboard.errors };
  }

  const result = { oldUid: pending.oldUid, status: "completed", leaderboard, profileDeleted: false, presenceDeleted: false, errors: [] };
  let fb;
  try {
    fb = await loadFirebase();
  } catch {
    return { ...result, status: "partial", errors: ["通信エラーにより公開プロフィール・presence の整理を保留しました"] };
  }
  const { database, uid, ref, get, remove } = fb;
  if (!uid || pending.oldUid === uid) return { ...result, status: "partial", errors: ["ログインIDを確認できませんでした"] };
  // 旧UIDのノードを消す権限（後継者）に必要な対応表を確実に用意する（既にあれば Rules で拒否＝正常）
  await recordUidSupersession(pending.oldUid, pending.backupId);

  let deniedCount = 0;
  for (const [node, label] of [
    ["publicProfiles", "旧IDの公開プロフィール"],
    ["presence", "旧IDのオンライン状態"],
  ]) {
    const path = `${node}/${pending.oldUid}`;
    try {
      const exists = (await get(ref(database, path))).exists();
      if (exists) await remove(ref(database, path));
      if (node === "publicProfiles") result.profileDeleted = true;
      else result.presenceDeleted = true;
    } catch (error) {
      console.warn(`[uidMerge:auto] ${label} の整理に失敗`, error);
      if (isPermissionDeniedError(error)) deniedCount += 1;
      result.errors.push(`${label}を整理できませんでした（${error?.code ?? "エラー"}）`);
    }
  }

  if (result.errors.length === 0) {
    clearPendingUidMerge(player.playerId, pending.oldUid); // 完了：整理済みにして（completedUidMerges にも残る）次の旧UIDへ
    return result;
  }
  const state = decideUidMergeOutcome({ completed: false, errors: result.errors, permissionDeniedOnly: deniedCount === result.errors.length });
  markUidMergeAttempt(player.playerId, pending.oldUid, state, { error: result.errors[0], nowMs: now });
  return { ...result, status: state === UID_MERGE_STATE.BLOCKED ? "blocked" : "partial" };
}

export async function runPendingUidMigration({ identityKey = null, now = Date.now(), maxItems = UID_MIGRATION_MAX_ITEMS_PER_RUN } = {}) {
  const player = getActivePlayer();
  const items = [];
  for (let i = 0; i < maxItems; i += 1) {
    const pending = getPendingUidMerge(player.playerId, { nowMs: now });
    if (!pending) break;
    if (items.some((item) => item.oldUid === pending.oldUid)) break; // 同じ回で同じ旧UIDを二度扱わない（無限ループ防止）
    // 旧UIDが今のUIDと同じ（＝IDが元に戻った）なら整理するものは無い
    let currentUid = null;
    try {
      currentUid = (await loadFirebase()).uid;
    } catch {
      currentUid = null;
    }
    if (currentUid && pending.oldUid === currentUid) {
      clearPendingUidMerge(player.playerId, pending.oldUid);
      items.push({ oldUid: pending.oldUid, status: "completed", errors: [] });
      continue;
    }
    const one = await runSingleUidMigration(player, pending, { identityKey, now });
    items.push(one);
    if (one.status === "leaderboard-incomplete") {
      return { status: "leaderboard-incomplete", leaderboard: one.leaderboard, profileDeleted: false, presenceDeleted: false, errors: one.errors, items };
    }
    if (one.status === "partial") break; // 通信エラー：続きは次の機会に（ランキングは済んでいるので関門は止めない）
  }
  if (items.length === 0) return { status: "none", errors: [], items };
  const last = items[items.length - 1];
  const anyPartial = items.some((item) => item.status === "partial");
  const anyBlocked = items.some((item) => item.status === "blocked");
  return {
    status: anyPartial ? "partial" : anyBlocked ? "blocked" : "completed",
    leaderboard: last.leaderboard ?? null,
    profileDeleted: last.profileDeleted ?? false,
    presenceDeleted: last.presenceDeleted ?? false,
    errors: items.flatMap((item) => item.errors ?? []),
    items,
  };
}

// 引き継ぎ・整理の「計画」だけを作る（Firebaseは読み取りのみ。何も書かない）。
// 戻り値：
//   { ok: true, oldUid, newUid, divisions: [...], profile: { oldExists, newExists }, presence: { oldExists },
//     summary: { copyCount, deleteOnlyCount, untouchedNewCount, legacyOnlyCount } }
//   divisions[i] = { variant, questionCountValue, categoryFilterValue, oldEntry, newEntry, legacyEntries,
//                    bestOldCandidate, action: "none"|"copyThenDeleteOld"|"deleteOld", finalClearTimeMs }
export async function planUidMerge() {
  const player = getActivePlayer();
  const pending = getPendingUidMerge(player.playerId);
  if (!pending) return { ok: false, reason: "引き継ぎが必要な旧IDの記録はありません" };

  let fb;
  try {
    fb = await loadFirebase();
  } catch (error) {
    return { ok: false, reason: "通信エラーにより確認できませんでした。しばらくしてからもう一度お試しください。" };
  }
  const { database, uid, ref, get } = fb;
  if (!uid) return { ok: false, reason: "ログイン状態を確認できませんでした" };
  const oldUid = pending.oldUid;
  if (oldUid === uid) return { ok: false, reason: "旧IDと現在のIDが同じです" };

  const divisions = [];
  for (const variant of LEADERBOARD_VARIANT_VALUES) {
    for (const questionCountValue of LEADERBOARD_QUESTION_COUNT_VALUES) {
      for (const categoryFilterValue of LEADERBOARD_CATEGORY_VALUES) {
        const path = buildLeaderboardPath(variant, questionCountValue, categoryFilterValue);
        let division = {};
        try {
          division = (await get(ref(database, path))).val() ?? {};
        } catch (error) {
          return { ok: false, reason: "ランキングの読み取りに失敗しました。しばらくしてからもう一度お試しください。" };
        }
        const oldEntry = division[oldUid] ?? null;
        const newEntry = division[uid] ?? null;

        // 旧世代ランキング（timeAttackLeaderboardsV2：variant/rule/出題数/カテゴリ）に残っている
        // 旧UIDの記録も候補に含める（現行の画面には表示されないが、本人の有効な記録のため）。
        const legacyEntries = [];
        for (const rule of LEADERBOARD_RULE_VALUES) {
          try {
            const legacySnap = await get(
              ref(database, `timeAttackLeaderboardsV2/${variant}/${rule}/${questionCountValue}/${categoryFilterValue}/${oldUid}`)
            );
            const legacy = legacySnap.val();
            if (legacy && typeof legacy.clearTimeMs === "number" && legacy.missCount === 0) {
              legacyEntries.push({ ...legacy, rule, legacyNode: "timeAttackLeaderboardsV2" });
            }
          } catch {
            // 旧世代ノードは無い・読めない場合があるが、統合計画自体は続行できる
          }
        }

        const candidates = [oldEntry, ...legacyEntries].filter((e) => e && typeof e.clearTimeMs === "number");
        const bestOldCandidate = candidates.length
          ? candidates.reduce((best, e) => (e.clearTimeMs < best.clearTimeMs ? e : best))
          : null;
        const action = planLeaderboardMerge(bestOldCandidate, newEntry);
        if (oldEntry === null && legacyEntries.length === 0 && newEntry === null) continue;

        divisions.push({
          variant,
          questionCountValue,
          categoryFilterValue,
          oldEntry,
          newEntry,
          legacyEntries,
          bestOldCandidate,
          action: bestOldCandidate ? action : "none",
          finalClearTimeMs:
            action === "copyThenDeleteOld" ? bestOldCandidate.clearTimeMs : (newEntry?.clearTimeMs ?? null),
        });
      }
    }
  }

  let profile = { oldExists: false, newExists: false };
  let presence = { oldExists: false };
  try {
    profile = {
      oldExists: (await get(ref(database, `publicProfiles/${oldUid}`))).exists(),
      newExists: (await get(ref(database, `publicProfiles/${uid}`))).exists(),
    };
    presence = { oldExists: (await get(ref(database, `presence/${oldUid}`))).exists() };
  } catch {
    // 読めなくても計画自体は返す（実行時に改めて扱う）
  }

  const summary = {
    copyCount: divisions.filter((d) => d.action === "copyThenDeleteOld").length,
    deleteOnlyCount: divisions.filter((d) => d.action === "deleteOld").length,
    untouchedNewCount: divisions.filter((d) => d.action === "none" && d.newEntry).length,
    legacyOnlyCount: divisions.filter((d) => d.oldEntry === null && d.legacyEntries.length > 0).length,
  };
  return { ok: true, oldUid, newUid: uid, backupId: pending.backupId, divisions, profile, presence, summary };
}

// 実行前に旧UID側の全記録を端末へ保存する（巻き戻し用）。
function saveMergeSnapshot(plan) {
  try {
    const snapshot = {
      savedAt: new Date().toISOString(),
      oldUid: plan.oldUid,
      newUid: plan.newUid,
      divisions: plan.divisions.map((d) => ({
        variant: d.variant,
        questionCountValue: d.questionCountValue,
        categoryFilterValue: d.categoryFilterValue,
        oldEntry: d.oldEntry,
        newEntry: d.newEntry,
        legacyEntries: d.legacyEntries,
      })),
    };
    localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${plan.oldUid}`, JSON.stringify(snapshot));
  } catch {
    // 保存できない環境でも実行自体は続ける（console にも同じ内容を出す）
  }
  // console にも残す（backupId は出さない：引き継ぎコードの一部になる値のため）
  console.info("[uidMerge] 実行前スナップショット", { oldUid: plan.oldUid, newUid: plan.newUid, divisions: plan.divisions });
}

export function getMergeSnapshot(oldUid) {
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${oldUid}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// 計画を実行する。順序：①スナップショット保存 → ②ランキング（複製→読み戻し確認→旧削除）
// → ③publicProfiles/{旧} 削除 → ④presence/{旧} 削除 → ⑤端末の「確認待ち」を解除。
// 途中で失敗した区分は旧を消さずに残し、errors に理由を積む（次回また実行できる）。
export async function executeUidMerge(plan) {
  if (!plan?.ok) return { ok: false, reason: "実行できる計画がありません" };
  let fb;
  try {
    fb = await loadFirebase();
  } catch {
    return { ok: false, reason: "通信エラーにより実行できませんでした" };
  }
  const { database, uid, ref, get, set, remove } = fb;
  if (uid !== plan.newUid) return { ok: false, reason: "計画を作ったときとログインIDが違います。画面を開き直してください。" };

  saveMergeSnapshot(plan);
  const player = getActivePlayer();
  const result = { ok: true, copied: 0, deletedOld: 0, profileDeleted: false, presenceDeleted: false, errors: [] };

  for (const d of plan.divisions) {
    if (d.action === "none") continue;
    const path = buildLeaderboardPath(d.variant, d.questionCountValue, d.categoryFilterValue);
    const label = `${d.variant}/${d.questionCountValue}/${d.categoryFilterValue}`;
    try {
      if (d.action === "copyThenDeleteOld") {
        // 【第11回】新規記録は identityKey 必須（Rules）。本人キーを付けて複製する
        const identityKey = await computeLeaderboardIdentityKey(getBackupId(player.playerId));
        if (!isValidLeaderboardIdentityKey(identityKey)) {
          result.errors.push(`${label}: 本人キーを作れないため新IDへ複製できませんでした（旧IDの記録は残しました）`);
          continue;
        }
        const copied = {
          ...buildCopiedLeaderboardEntry(d.bestOldCandidate, {
            displayName: player.playerName,
            oshiMemberId: getMostOshiMemberId(),
          }),
          identityKey,
        };
        await set(ref(database, `${path}/${uid}`), copied);
        const readBack = (await get(ref(database, `${path}/${uid}`))).val();
        if (!readBack || readBack.clearTimeMs !== copied.clearTimeMs) {
          result.errors.push(`${label}: 新IDへの複製を確認できなかったため、旧IDの記録は残しました`);
          continue;
        }
        result.copied += 1;
      }
      if (d.oldEntry) {
        await remove(ref(database, `${path}/${plan.oldUid}`));
        result.deletedOld += 1;
      }
    } catch (error) {
      console.warn(`[uidMerge] ${label} の処理に失敗`, error);
      result.errors.push(`${label}: ${error?.code ?? "エラー"}（旧IDの記録は残しました）`);
    }
  }

  if (plan.profile.oldExists) {
    try {
      await remove(ref(database, `publicProfiles/${plan.oldUid}`));
      result.profileDeleted = true;
    } catch (error) {
      result.errors.push(`旧IDの公開プロフィールを削除できませんでした（${error?.code ?? "エラー"}）`);
    }
  }
  if (plan.presence.oldExists) {
    try {
      await remove(ref(database, `presence/${plan.oldUid}`));
      result.presenceDeleted = true;
    } catch (error) {
      result.errors.push(`旧IDのオンライン状態を削除できませんでした（${error?.code ?? "エラー"}）`);
    }
  }

  if (result.errors.length === 0) {
    clearPendingUidMerge(player.playerId, plan.oldUid);
  }
  result.ok = result.errors.length === 0;
  return result;
}

// 画面表示用の日本語ラベル（ランキング画面 js/timeAttackLeaderboardScreen.js と同じ表記）。
const VARIANT_LABELS = { intro: "🎧イントロ", randomPlayback: "🔀ランダム再生", outro: "🎬アウトロ" };
const QUESTION_COUNT_LABELS = { 5: "5問", 10: "10問", 20: "20問", 50: "50問", all: "全曲" };
const CATEGORY_LABELS = { "title-track": "表題曲のみ", "title-and-group": "表題曲＋全員曲", all: "全曲" };

export function describeLeaderboardDivision(variant, questionCountValue, categoryFilterValue) {
  return `${VARIANT_LABELS[variant] ?? variant}・${QUESTION_COUNT_LABELS[questionCountValue] ?? questionCountValue}・${CATEGORY_LABELS[categoryFilterValue] ?? categoryFilterValue}`;
}

// 画面表示用：計画を人が読める行に変換する（純粋関数）。
export function describeUidMergePlan(plan) {
  if (!plan?.ok) return [];
  const sec = (ms) => `${(ms / 1000).toFixed(2)}秒`;
  const lines = [];
  for (const d of plan.divisions) {
    const label = describeLeaderboardDivision(d.variant, d.questionCountValue, d.categoryFilterValue);
    if (d.action === "copyThenDeleteOld") {
      const from = d.oldEntry && d.bestOldCandidate === d.oldEntry ? "旧ID" : "旧ID（旧世代ランキング）";
      lines.push(`${label}：${from}の ${sec(d.bestOldCandidate.clearTimeMs)} を新IDへ引き継ぐ${d.newEntry ? `（新IDの ${sec(d.newEntry.clearTimeMs)} より速いため）` : "（新IDに記録なし）"}`);
    } else if (d.action === "deleteOld") {
      lines.push(`${label}：新IDの ${sec(d.newEntry.clearTimeMs)} を残し、旧IDの ${sec(d.bestOldCandidate.clearTimeMs)} を整理`);
    }
  }
  if (plan.profile.oldExists) lines.push("旧IDの公開プロフィール（フレンド一覧の重複）を整理");
  if (plan.presence.oldExists) lines.push("旧IDのオンライン状態を整理");
  return lines;
}

// ---------------------------------------------------------------------------
// 【2026-10-28追加】フレンド一覧の重複整理に使う「改ざんできない対応」の読み取り。
// uidSupersession/{旧UID}/newUid は、今の本番 Rules ではアプリから読めない（読み取り規則が無い）。
// firebase/database.rules.proposed.json を公開すると newUid だけ読めるようになる（backupId は読めないまま）。
// 読めない（PERMISSION_DENIED）と分かったら、このセッション中は二度と読みに行かない（無駄な読み取りをしない）。
// 読む対象は「同じ本人キーのカードが他にもあるUID」だけ（最大20件・1回の画面表示につき1回まで。結果は覚えておく）。
// ---------------------------------------------------------------------------
let supersessionReadSupported = null; // null＝未確認、true＝読める、false＝今の Rules では読めない
const supersessionLinkCache = new Map(); // 旧UID → 新UID（null＝対応なし）

export function getSupersessionReadSupport() {
  return supersessionReadSupported;
}

export async function fetchSupersessionLinks(oldUids) {
  const links = {};
  const targets = [...new Set((Array.isArray(oldUids) ? oldUids : []).filter((uid) => typeof uid === "string" && uid))].slice(0, 20);
  targets.forEach((uid) => {
    const cached = supersessionLinkCache.get(uid);
    if (typeof cached === "string") links[uid] = cached;
  });
  if (supersessionReadSupported === false) return links;
  const toRead = targets.filter((uid) => !supersessionLinkCache.has(uid));
  if (toRead.length === 0) return links;
  let fb;
  try {
    fb = await loadFirebase();
  } catch {
    return links;
  }
  const { database, ref, get } = fb;
  for (const uid of toRead) {
    try {
      const value = (await get(ref(database, `uidSupersession/${uid}/newUid`))).val();
      supersessionReadSupported = true;
      supersessionLinkCache.set(uid, typeof value === "string" && value ? value : null);
      if (typeof value === "string" && value) links[uid] = value;
    } catch (error) {
      if (isPermissionDeniedError(error)) {
        supersessionReadSupported = false; // 今の本番 Rules：読めない → 表示では使わない（安全側：隠さない）
        break;
      }
      // 通信エラー：次の表示でまた試す（覚えない）
    }
  }
  return links;
}

// backupId を持たない・まだ何も同期していないプレイヤーでは案内を出さない（呼び出し側の補助）。
export function hasPendingUidMerge() {
  const player = getActivePlayer();
  return !!getBackupId(player.playerId) && getPendingUidMerge(player.playerId) !== null;
}
