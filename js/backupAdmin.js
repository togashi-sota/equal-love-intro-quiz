// プレイヤーデータの自動バックアップ機能（js/backupSync.js）のうち、管理者専用の操作
// （全ユーザーのバックアップ一覧・復旧依頼一覧の確認、復旧依頼への対応）だけを
// 集めたファイル（2026-08-29新設）。
//
// 【設計方針】js/publicProfileSync.jsのdeletePublicProfileByAdmin()と全く同じ考え方：
// このファイルの関数を呼べること自体は、UI側（js/fanProfilesScreen.js等）が
// 「今ログイン中のUIDがjs/adminConfig.jsのADMIN_UIDと一致するか」を事前に確認した
// うえでだけ呼ぶ想定だが、それはあくまで誤操作防止のための二重チェックに過ぎない。
// 本当の権限チェックはfirebase/database.rules.jsonのbackups・recoveryRequestsの
// ".read"/".write"ルール側で行っており、管理者UID以外のユーザーがこのファイルの関数を
// 呼んでも、Firebase側から権限エラーで拒否される（フロント側の判定だけに頼らない設計）。

// 全プレイヤーのバックアップ一覧を取得する（管理者専用画面の一覧表示用）。
// 戻り値: { ok: true, backups: [{backupId, displayName, oshiMemberId, achievementCount,
//   currentUid, updatedAt}] } または通信・権限エラー時 { ok: false, reason }。
export async function adminFetchAllBackups() {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    const snap = await get(ref(database, "backups"));
    if (!snap.exists()) return { ok: true, backups: [] };

    const value = snap.val();
    const backups = Object.entries(value).map(([backupId, entry]) => ({
      backupId,
      displayName: typeof entry.displayName === "string" ? entry.displayName : null,
      oshiMemberId: typeof entry.oshiMemberId === "string" ? entry.oshiMemberId : null,
      achievementCount: typeof entry.achievementCount === "number" ? entry.achievementCount : 0,
      currentUid: typeof entry.currentUid === "string" ? entry.currentUid : null,
      updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : null,
    }));
    return { ok: true, backups };
  } catch (error) {
    console.warn("バックアップ一覧の取得に失敗しました（管理者権限が無い可能性があります）", error);
    return { ok: false, reason: "取得に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}

// 全復旧依頼の一覧を取得する（pending・resolved問わず）。
export async function adminFetchAllRecoveryRequests() {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    const snap = await get(ref(database, "recoveryRequests"));
    if (!snap.exists()) return { ok: true, requests: [] };

    const value = snap.val();
    const requests = Object.entries(value).map(([code, entry]) => ({
      code,
      newUid: typeof entry.newUid === "string" ? entry.newUid : null,
      status: typeof entry.status === "string" ? entry.status : "pending",
      requestedAt: typeof entry.requestedAt === "number" ? entry.requestedAt : null,
      resolvedBackupId: typeof entry.resolvedBackupId === "string" ? entry.resolvedBackupId : null,
      resolvedAt: typeof entry.resolvedAt === "number" ? entry.resolvedAt : null,
    }));
    return { ok: true, requests };
  } catch (error) {
    console.warn("復旧依頼一覧の取得に失敗しました（管理者権限が無い可能性があります）", error);
    return { ok: false, reason: "取得に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}

// 復旧依頼を、選ばれたbackupIdへ紐付けて解決する。
// 【安全性】backups/{backupId}のcurrentUidを新しいUIDへ書き換える操作と、
// recoveryRequests/{code}をresolved状態にする操作を、1回の多重パス更新（update()）で
// 同時に行う。どちらか一方だけが反映される中途半端な状態を避けるため
// （Realtime Databaseのupdate()は、複数パスの書き込みをまとめて1回のトランザクションとして扱う）。
export async function adminResolveRecoveryRequest(code, backupId) {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, get, update, serverTimestamp } = await import(
      "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js"
    );
    await authReady;

    const requestSnap = await get(ref(database, `recoveryRequests/${code}`));
    if (!requestSnap.exists()) return { ok: false, reason: "指定された復旧依頼が見つかりませんでした" };
    const newUid = requestSnap.val().newUid;
    if (!newUid) return { ok: false, reason: "復旧依頼の内容が不正です（newUidがありません）" };

    const backupSnap = await get(ref(database, `backups/${backupId}`));
    if (!backupSnap.exists()) return { ok: false, reason: "指定されたバックアップが見つかりませんでした" };

    await update(ref(database), {
      [`backups/${backupId}/currentUid`]: newUid,
      [`backups/${backupId}/updatedAt`]: serverTimestamp(),
      [`recoveryRequests/${code}/status`]: "resolved",
      [`recoveryRequests/${code}/resolvedBackupId`]: backupId,
      [`recoveryRequests/${code}/resolvedAt`]: serverTimestamp(),
    });

    return { ok: true };
  } catch (error) {
    console.warn("復旧依頼の解決に失敗しました（管理者権限が無い可能性があります）", error);
    return { ok: false, reason: "処理に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}
