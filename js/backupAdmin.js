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

// 【2026-09-05新設、本人指示：「非公開の人が何人いるか知りたい」への対応】publicProfiles
// （フレンド一覧の公開設定がONの人）のUID一覧だけを取得する。バックアップ一覧の各人の
// currentUidと突き合わせることで、「バックアップはある＝アプリを使っている実在の人だが、
// フレンド一覧には公開していない人」の人数を、管理者画面側で計算できるようにするための材料。
// 【できないこと】これはあくまで「バックアップが1件以上ある人」の中での非公開判定であり、
// 一度もバックアップされたことが無い非公開の人（＝Firebase上に一切痕跡が無い人）までは
// 検出できない（js/backupAdmin.jsのadminFindPlayersWithoutBackup()と同じ構造的な限界）。
export async function adminFetchPublicProfileUids() {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    const snap = await get(ref(database, "publicProfiles"));
    if (!snap.exists()) return { ok: true, uids: [] };
    return { ok: true, uids: Object.keys(snap.val()) };
  } catch (error) {
    console.warn("公開プロフィールUID一覧の取得に失敗しました", error);
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

// 復旧依頼（recoveryRequests/{code}）を1件だけ削除する（2026-08-29追加、本人指示）。
// 【最重要：バックアップ本体とは完全に別物】この関数はrecoveryRequestsだけを対象とし、
// backups側には一切触れない。テスト用・間違えて作られた・古くなった依頼を管理画面から
// 整理するための機能であり、ユーザーの記録そのもの（backups/{backupId}）を削除する機能は
// 意図的に用意していない（本人指示：「復旧依頼を削除する」と「バックアップ本体を削除する」は
// 完全に別物として扱う）。
export async function adminDeleteRecoveryRequest(code) {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, remove } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    await remove(ref(database, `recoveryRequests/${code}`));
    return { ok: true };
  } catch (error) {
    console.warn("復旧依頼の削除に失敗しました（管理者権限が無い可能性があります）", error);
    return { ok: false, reason: "削除に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}

// 表示名でpublicProfiles（フレンド一覧用の公開データ）を検索する（緊急対応用に2026-09-04新設）。
// 【背景】backups（自動バックアップ）は本人の端末でこの機能が使われた実績が無いと
// 存在しないが、publicProfiles（フレンド一覧の公開設定）はより早くから・別の条件で
// 同期されているため、backupsには無くてもpublicProfilesにだけ称号記録が残っている
// ケースがある。称号の取得状況・推しメンだけは、この記録から復元できる
// （プレイ履歴・自己ベスト等、publicProfilesに含まれない情報までは復元できない）。
export async function adminSearchPublicProfilesByName(query) {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    const snap = await get(ref(database, "publicProfiles"));
    if (!snap.exists()) return { ok: true, matches: [] };
    const normalizedQuery = query.trim().toLowerCase();
    const matches = Object.entries(snap.val())
      .filter(([, entry]) => (entry.displayName ?? "").toLowerCase().includes(normalizedQuery))
      .map(([uid, entry]) => ({
        uid,
        displayName: entry.displayName ?? "（名前未設定）",
        oshiMemberId: entry.oshiMemberId ?? null,
        unlockedAchievementIds: Array.isArray(entry.unlockedAchievementIds) ? entry.unlockedAchievementIds : [],
      }));
    return { ok: true, matches };
  } catch (error) {
    console.warn("公開プロフィールの検索に失敗しました", error);
    return { ok: false, reason: "検索に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}

// 【2026-09-04新設、本人指示：いくみさんの件を受けた予防対応】publicProfiles（フレンド
// 一覧の公開設定）には載っているのに、その人の「今のUID」に対応するbackupsが1件も無い
// ＝「もし今この瞬間に端末のデータが消えたら、称号すら復元できない」人を洗い出す。
// currentUidが一致するbackupsが存在するかどうかで判定する（表示名の一致では判定しない。
// 同じ名前の人が複数いる可能性があるため、より確実なuidベースの突き合わせにしている）。
export async function adminFindPlayersWithoutBackup() {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, get } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;
    const [profilesSnap, backupsSnap] = await Promise.all([
      get(ref(database, "publicProfiles")),
      get(ref(database, "backups")),
    ]);
    if (!profilesSnap.exists()) return { ok: true, atRiskPlayers: [] };

    const backupCurrentUids = new Set();
    if (backupsSnap.exists()) {
      Object.values(backupsSnap.val()).forEach((backup) => {
        if (typeof backup.currentUid === "string") backupCurrentUids.add(backup.currentUid);
      });
    }

    const atRiskPlayers = Object.entries(profilesSnap.val())
      .filter(([uid]) => !backupCurrentUids.has(uid))
      .map(([uid, entry]) => ({
        uid,
        displayName: entry.displayName ?? "（名前未設定）",
        oshiMemberId: entry.oshiMemberId ?? null,
        unlockedAchievementIds: Array.isArray(entry.unlockedAchievementIds) ? entry.unlockedAchievementIds : [],
      }));
    return { ok: true, atRiskPlayers };
  } catch (error) {
    console.warn("バックアップ未作成プレイヤーの確認に失敗しました", error);
    return { ok: false, reason: "確認に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}

// 【2026-09-04新設、本人指示：予防対応】adminFindPlayersWithoutBackup()で見つかった
// 「まだ一度もバックアップが無い」人に対して、その人がまだ端末のデータを失っていない
// うちに、publicProfilesの称号・推しメンの記録だけを使って予防的にbackupsを1件作る
// （＝いくみさんのケースで最後に困った状態を、事前に防ぐための保険）。
// 【adminRestoreAchievementsFromPublicProfile()との違い】あちらは「既に復旧依頼が来ている
// 人」向けで、newUid（依頼した端末の新しいUID）へ紐付ける。こちらは「まだ困っていない人」
// 向けで、その人自身の今のUID（publicProfiles上のuidそのもの）へ紐付ける点が異なる。
export async function adminCreatePreventiveBackup({ uid, displayName, oshiMemberId, unlockedAchievementIds }) {
  try {
    const { database, authReady } = await import("./firebaseClient.js");
    const { ref, set, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");
    await authReady;

    const achievementsJson = JSON.stringify({
      schemaVersion: 1,
      unlockedAchievementIds,
      unlockedAtById: {},
    });
    const oshiMembersJson = JSON.stringify({
      favoriteMemberIds: oshiMemberId ? [oshiMemberId] : [],
      mostOshiMemberId: oshiMemberId,
    });

    const newBackupId = crypto.randomUUID();
    await set(ref(database, `backups/${newBackupId}`), {
      schemaVersion: 1,
      currentUid: uid,
      updatedAt: serverTimestamp(),
      displayName: displayName ?? null,
      oshiMemberId,
      achievementCount: unlockedAchievementIds.length,
      payload: {
        achievements: achievementsJson,
        oshiMembers: oshiMembersJson,
      },
    });
    return { ok: true };
  } catch (error) {
    console.warn("予防的バックアップの作成に失敗しました（管理者権限が無い可能性があります）", error);
    return { ok: false, reason: "処理に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}

// 【緊急対応用に2026-09-04新設、本人指示】backupsが存在しない場合の最後の手段として、
// publicProfilesに残っている称号・推しメンの記録だけから、新しいバックアップを作って
// 復旧依頼に紐付ける。プレイ履歴・自己ベスト・お気に入り・プレイリスト等、
// publicProfilesに元々含まれていない情報は復元できない（称号と推しメンだけの復元）。
// 【安全性】既存のadminResolveRecoveryRequest()と同じく、新しいbackups/{backupId}の作成と
// recoveryRequests/{code}の解決を1回のupdate()にまとめ、中途半端な状態を避ける。
export async function adminRestoreAchievementsFromPublicProfile({ code, publicProfileUid }) {
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

    const profileSnap = await get(ref(database, `publicProfiles/${publicProfileUid}`));
    if (!profileSnap.exists()) return { ok: false, reason: "指定された公開プロフィールが見つかりませんでした" };
    const profile = profileSnap.val();
    const unlockedAchievementIds = Array.isArray(profile.unlockedAchievementIds) ? profile.unlockedAchievementIds : [];
    const oshiMemberId = typeof profile.oshiMemberId === "string" ? profile.oshiMemberId : null;

    // js/achievementProgress.js・js/oshiMembers.jsが実際に読み込む形とそろえる
    // （js/backupSync.jsのbuildBackupPayload()・restoreFromBackup()参照）。
    const achievementsJson = JSON.stringify({
      schemaVersion: 1,
      unlockedAchievementIds,
      unlockedAtById: {}, // 正確な取得日時はpublicProfilesに残っていないため空にする
    });
    const oshiMembersJson = JSON.stringify({
      favoriteMemberIds: oshiMemberId ? [oshiMemberId] : [],
      mostOshiMemberId: oshiMemberId,
    });

    const newBackupId = crypto.randomUUID();
    await update(ref(database), {
      [`backups/${newBackupId}`]: {
        schemaVersion: 1,
        currentUid: newUid,
        updatedAt: serverTimestamp(),
        displayName: profile.displayName ?? null,
        oshiMemberId,
        achievementCount: unlockedAchievementIds.length,
        payload: {
          achievements: achievementsJson,
          oshiMembers: oshiMembersJson,
        },
      },
      [`recoveryRequests/${code}/status`]: "resolved",
      [`recoveryRequests/${code}/resolvedBackupId`]: newBackupId,
      [`recoveryRequests/${code}/resolvedAt`]: serverTimestamp(),
    });

    return { ok: true, restoredAchievementCount: unlockedAchievementIds.length };
  } catch (error) {
    console.warn("公開プロフィールからの復元に失敗しました（管理者権限が無い可能性があります）", error);
    return { ok: false, reason: "処理に失敗しました。管理者としてログインできているかご確認ください。" };
  }
}
