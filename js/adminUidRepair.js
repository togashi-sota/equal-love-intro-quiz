// 管理者用「UID移行・重複修復」の Firebase 読み書き（2026-09-22新設・本人指示 第8回）。
// 計画の作成・判定は js/uidRepairPlanner.js（純粋関数）、画面は js/adminUidRepairScreen.js。
//
// 【権限（firebase/database.rules.json を読んだ結果）】管理者ができるのは
//   ・backups/{id} の書き換え（currentUid の付け替え・previousUids の追記・ownerSecret の無効化）
//   ・timeAttackLeaderboardsV3 の他人の記録の「削除」だけ（他人名義で set/update はできない）
//   ・publicProfiles の他人の記録の「削除」だけ
// できないのは presence/{旧UID} の削除（本人＝後継者だけ。付け替え後に本人の端末が次回起動で消す）。
// この範囲を超える操作は実装しない（Rules を広げない）。
//
// 【安全原則】read → compare → dry-run（画面） → confirm（画面） → write/delete → read-back。
// 削除は「新UID側の記録を直前にもう一度読んで確認できた場合」だけ。payload は一切書き換えない。
import {
  LEADERBOARD_QUESTION_COUNT_VALUES,
  LEADERBOARD_CATEGORY_VALUES,
  buildLeaderboardPath,
} from "./timeAttackLeaderboard.js";
import { LEADERBOARD_VARIANT_VALUES } from "./uidSupersession.js";
import { hashPayload, buildBackupRebindWrites, evaluateRebindReadBack, planOldLeaderboardEntry } from "./uidRepairPlanner.js";

async function loadFirebase() {
  const firebaseClient = await import("./firebaseClient.js");
  const rtdb = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
  await firebaseClient.authReady;
  return { database: firebaseClient.database, uid: firebaseClient.getCurrentUid(), ...rtdb };
}

// 修復候補の材料をまとめて読む（読み取りのみ）。backups は管理者だけが全件読める。
// 戻り値: { ok, snapshot: { backups, publicProfiles, leaderboards, presence }, reason }
export async function adminFetchUidRepairSnapshot() {
  try {
    const { database, ref, get } = await loadFirebase();
    const backups = (await get(ref(database, "backups"))).val() ?? {};
    const publicProfiles = (await get(ref(database, "publicProfiles"))).val() ?? {};
    let presence = {};
    try {
      presence = (await get(ref(database, "presence"))).val() ?? {};
    } catch {
      presence = {};
    }
    const leaderboards = {};
    for (const variant of LEADERBOARD_VARIANT_VALUES) {
      for (const questionCountValue of LEADERBOARD_QUESTION_COUNT_VALUES) {
        for (const categoryFilterValue of LEADERBOARD_CATEGORY_VALUES) {
          const division = `${variant}/${questionCountValue}/${categoryFilterValue}`;
          const value = (await get(ref(database, buildLeaderboardPath(variant, questionCountValue, categoryFilterValue)))).val();
          if (value && typeof value === "object") leaderboards[division] = value;
        }
      }
    }
    return { ok: true, snapshot: { backups, publicProfiles, leaderboards, presence } };
  } catch (error) {
    console.warn("UID修復の材料の読み取りに失敗しました（管理者権限が無い可能性があります）", error);
    return { ok: false, reason: "読み取りに失敗しました。管理者としてログインできているかご確認ください。" };
  }
}

// 候補1件を実行する。log(text, level) で進行を画面へ流す。
// 順序：①バックアップ付け替え（atomic update）→ 読み戻し検証 → ②旧ランキング削除（各区分で直前に再確認）
//        → ③旧公開プロフィール削除（新側の存在を直前に再確認）。①が検証に失敗したら②③へ進まない。
// 戻り値: { ok, steps: { rebind, leaderboard: {deleted, skipped}, profile }, errors }
export async function adminExecuteUidRepair(candidate, { log = () => {} } = {}) {
  const errors = [];
  const steps = { rebind: "not-run", leaderboard: { deleted: 0, skipped: 0 }, profile: "not-run" };
  let fb;
  try {
    fb = await loadFirebase();
  } catch {
    return { ok: false, steps, errors: ["通信エラーにより実行できませんでした"] };
  }
  const { database, ref, get, update, remove, serverTimestamp } = fb;
  const { backupId, oldUid, newUid } = candidate;
  const backupRef = ref(database, `backups/${backupId}`);

  // ---- ① バックアップの持ち主を付け替える ----
  try {
    const before = (await get(backupRef)).val();
    if (!before) throw new Error("バックアップが見つかりません");
    if (before.currentUid !== oldUid) {
      throw new Error(`実行前の確認で currentUid が計画と違います（今：${before.currentUid ? `…${before.currentUid.slice(-6)}` : "なし"}）。画面を更新して計画を作り直してください`);
    }
    if (before.currentUid === newUid) {
      steps.rebind = "already";
      log("① バックアップの持ち主は既に新IDです（スキップ）", "info");
    } else {
      const hashBefore = await hashPayload(before.payload);
      log(`① 付け替え前 payload ハッシュ ${hashBefore.slice(0, 12)}…（キー ${Object.keys(before.payload ?? {}).length} 件、updatedAt ${before.updatedAt ?? "なし"}）`, "info");
      await update(ref(database), buildBackupRebindWrites({ backupId, oldUid, newUid, serverTimestampValue: serverTimestamp() }));
      const after = (await get(backupRef)).val();
      const hashAfter = await hashPayload(after?.payload);
      const verdict = evaluateRebindReadBack({ before, after, oldUid, newUid, hashBefore, hashAfter });
      if (!verdict.ok) {
        throw new Error(`付け替え後の読み戻し検証に失敗：${verdict.problems.join("／")}`);
      }
      steps.rebind = "done";
      log(`① 持ち主を …${oldUid.slice(-6)} → …${newUid.slice(-6)} へ付け替え、読み戻しOK（payload ハッシュ一致 ${hashAfter.slice(0, 12)}…、previousUids に旧IDを記録）`, "ok");
    }
  } catch (error) {
    steps.rebind = "failed";
    errors.push(`① 付け替え：${error?.message ?? error?.code ?? "エラー"}`);
    log(`① 付け替えに失敗：${error?.message ?? error?.code ?? "エラー"}。②③は実行しません`, "error");
    return { ok: false, steps, errors };
  }

  // ---- ② 旧UID名義のランキング記録を、新UID側を直前に再確認してから削除 ----
  for (const plan of candidate.leaderboardPlan ?? []) {
    if (plan.action !== "deleteOld") {
      steps.leaderboard.skipped += 1;
      continue;
    }
    const [variant, questionCountValue, categoryFilterValue] = plan.division.split("/");
    const path = buildLeaderboardPath(variant, questionCountValue, categoryFilterValue);
    try {
      const oldNow = (await get(ref(database, `${path}/${oldUid}`))).val();
      const newNow = (await get(ref(database, `${path}/${newUid}`))).val();
      if (!oldNow) {
        log(`② ${plan.division}：旧IDの記録は既にありません（スキップ）`, "info");
        continue;
      }
      const recheck = planOldLeaderboardEntry(oldNow, newNow);
      if (recheck.action !== "deleteOld") {
        steps.leaderboard.skipped += 1;
        log(`② ${plan.division}：直前の再確認で条件を満たさなくなったため削除しません（${recheck.reason}）`, "warn");
        continue;
      }
      await remove(ref(database, `${path}/${oldUid}`));
      const oldAfter = (await get(ref(database, `${path}/${oldUid}`))).val();
      const newAfter = (await get(ref(database, `${path}/${newUid}`))).val();
      if (oldAfter || !newAfter) {
        throw new Error("読み戻しで旧IDが残っている、または新IDの記録が見つかりません");
      }
      steps.leaderboard.deleted += 1;
      log(`② ${plan.division}：旧ID ${(oldNow.clearTimeMs / 1000).toFixed(2)}秒 を削除、新ID ${(newAfter.clearTimeMs / 1000).toFixed(2)}秒 が残っていることを確認`, "ok");
    } catch (error) {
      errors.push(`② ${plan.division}：${error?.message ?? error?.code ?? "エラー"}`);
      log(`② ${plan.division}：失敗（${error?.message ?? error?.code ?? "エラー"}）`, "error");
    }
  }

  // ---- ③ 旧UID名義の公開プロフィールを、新側の存在を直前に再確認してから削除 ----
  if (candidate.profilePlan?.action === "deleteOld") {
    try {
      const oldNow = (await get(ref(database, `publicProfiles/${oldUid}`))).exists();
      const newNow = (await get(ref(database, `publicProfiles/${newUid}`))).exists();
      if (!oldNow) {
        steps.profile = "already";
        log("③ 旧IDの公開プロフィールは既にありません（スキップ）", "info");
      } else if (!newNow) {
        steps.profile = "skipped";
        log("③ 新IDの公開プロフィールが見つからないため削除しません", "warn");
      } else {
        await remove(ref(database, `publicProfiles/${oldUid}`));
        const stillOld = (await get(ref(database, `publicProfiles/${oldUid}`))).exists();
        const stillNew = (await get(ref(database, `publicProfiles/${newUid}`))).exists();
        if (stillOld || !stillNew) throw new Error("読み戻しで旧IDが残っている、または新IDが見つかりません");
        steps.profile = "done";
        log("③ 旧IDの公開プロフィールを削除、新IDが残っていることを確認", "ok");
      }
    } catch (error) {
      steps.profile = "failed";
      errors.push(`③ 公開プロフィール：${error?.message ?? error?.code ?? "エラー"}`);
      log(`③ 公開プロフィールの削除に失敗（${error?.message ?? error?.code ?? "エラー"}）`, "error");
    }
  } else {
    steps.profile = "none";
  }

  if (candidate.presencePlan?.action === "successor") {
    log("④ 旧IDのオンライン状態（presence）は管理者には消せません。本人の端末が次に起動したとき、後継者として自動で消えます", "info");
  }

  return { ok: errors.length === 0, steps, errors };
}
