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
} from "./playerProfile.js";
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

// 戻り値: { attempted: boolean, copied, deletedOld, errors: string[], completed: boolean }
//   completed は「旧UIDのランキング記録がもう残っていない」＝既に完了済みの場合も true。
export async function autoMergeSupersededLeaderboardEntries({ identityKey = null, now = Date.now() } = {}) {
  const result = { attempted: false, copied: 0, deletedOld: 0, errors: [], completed: false };
  const player = getActivePlayer();
  const pending = getPendingUidMerge(player.playerId);
  if (!pending) return result;
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

  // 旧UIDの記録を消す権限（Rules：uidSupersession/{旧UID}/newUid が自分）に必要な対応表を確実に用意する
  // （既に記録済みなら Rules で拒否されるが、それは正常）。
  await recordUidSupersession(pending.oldUid, pending.backupId);

  const displayName = player.playerName;
  const oshiMemberId = getMostOshiMemberId();
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
          result.errors.push(`${label}: ${error?.code ?? "エラー"}（旧IDの記録は残しました）`);
        }
      }
    }
  }

  if (result.errors.length === 0) {
    markPendingUidMergeLeaderboardMerged(player.playerId, now);
    result.completed = true;
  }
  return result;
}

// ---------------------------------------------------------------------------
// 【2026-09-22追加：UID変更後の自動引き継ぎ（本人確認の関門から呼ばれる）】
// 端末に「旧UID→新UID」の確認待ち（pendingUidMerge）があるとき、本人の操作を待たずに
//   ①旧UIDのランキング記録を新UID名義へ引き継ぐ（速い方を1件残す。記録は失わない）
//   ②旧UIDの公開プロフィールを消す（フレンド一覧の重複を解消。新UIDの公開プロフィールは通常同期で再作成される）
//   ③旧UIDの presence を消す
// を順に行う。①が終わるまで js/identityBootstrap.js は READY にならない（＝ランキング再送信を止める）。
// ②③は「できなければ次回」で、READY を妨げない（実害が「フレンド一覧に旧名義が残る」程度のため）。
// 何回実行しても結果は同じ（冪等）：既に消えているものは「無い」として成功扱い、途中で閉じても次回続きから。
// 戻り値: { status: "none" | "leaderboard-incomplete" | "completed" | "partial", leaderboard, profileDeleted, presenceDeleted, errors }
// ---------------------------------------------------------------------------
export async function runPendingUidMigration({ identityKey = null, now = Date.now() } = {}) {
  const player = getActivePlayer();
  const pending = getPendingUidMerge(player.playerId);
  if (!pending) return { status: "none", errors: [] };

  const leaderboard = await autoMergeSupersededLeaderboardEntries({ identityKey, now });
  if (!leaderboard.completed) {
    return { status: "leaderboard-incomplete", leaderboard, profileDeleted: false, presenceDeleted: false, errors: leaderboard.errors };
  }

  const result = { status: "completed", leaderboard, profileDeleted: false, presenceDeleted: false, errors: [] };
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
      result.errors.push(`${label}を整理できませんでした（${error?.code ?? "エラー"}）`);
    }
  }

  if (result.errors.length === 0) {
    clearPendingUidMerge(player.playerId); // 完了：completedUidMerges に旧UIDを残し、確認待ちを消す
    return result;
  }
  return { ...result, status: "partial" };
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
    clearPendingUidMerge(player.playerId);
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

// backupId を持たない・まだ何も同期していないプレイヤーでは案内を出さない（呼び出し側の補助）。
export function hasPendingUidMerge() {
  const player = getActivePlayer();
  return !!getBackupId(player.playerId) && getPendingUidMerge(player.playerId) !== null;
}
