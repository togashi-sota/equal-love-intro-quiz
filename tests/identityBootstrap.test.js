// 【2026-09-22新設・本人指示 第8回】起動時の「本人確認の関門」（js/identityBootstrap.js）の回帰テスト。
//
// 固定したい再発経路（2026-09-22 に じゅ・サブ・Olkya で起きたもの）：
//   匿名UIDが変わる → ローカルデータは残る → 新UIDで自己ベストを先に再送信 → 旧UIDと新UIDの両方がランキングに存在
// この関門は「認証 → バックアップの持ち主確認（必要なら ownerSecret で claim）→ 旧UID名義の引き継ぎ → ready」が
// 終わるまで、ランキング再送信・公開プロフィール・presence を待たせる。
// 依存（同期・引き継ぎ・端末情報）は引数で差し込めるため、Firebase 無しで A〜G・S の各経路を再現できる。
import { createIdentityBootstrapRunner, IDENTITY_STATE, canAutoSyncToCloud } from "../js/identityBootstrap.js";
import { assertEqual } from "./test-utils.js";

// 偽の依存一式。calls に呼び出し順を記録する（「ランキング再送信が本人確認より先に走らない」ことの検査用）。
function createFakeDeps(overrides = {}) {
  const calls = [];
  const deps = {
    waitAuthReady: async () => {
      calls.push("auth");
    },
    getCurrentUid: () => "uid-new",
    isOffline: () => false,
    getBackupId: () => "backup-1",
    syncBackupOwnership: async () => {
      calls.push("backup-sync");
      return { status: "synced", previousUid: null };
    },
    hasPendingMigration: () => false,
    runMigration: async () => {
      calls.push("migration");
      return { status: "none" };
    },
    onStateChange: (state) => {
      calls.push(`state:${state}`);
    },
    ...overrides,
  };
  return { deps, calls };
}

// 「ランキング自動同期」を模した関数：関門が ready のときだけ送信する（js/timeAttackLeaderboardSync.js と同じ判断）。
async function fakeRankingAutoSync(runner, calls) {
  const state = await runner.ensure();
  if (canAutoSyncToCloud(state)) {
    calls.push("ranking-resend");
    return true;
  }
  calls.push(`ranking-skip:${state}`);
  return false;
}

export async function runIdentityBootstrapTests() {
  // ---- 状態と送信可否 ----
  assertEqual(canAutoSyncToCloud(IDENTITY_STATE.READY), true, "ready のときだけクラウド自動送信が許可される");
  assertEqual(canAutoSyncToCloud(IDENTITY_STATE.MIGRATING), false, "migrating では送信しない");
  assertEqual(canAutoSyncToCloud(IDENTITY_STATE.UNRESOLVED), false, "unresolved では送信しない");
  assertEqual(canAutoSyncToCloud(IDENTITY_STATE.PENDING), false, "pending では送信しない");

  // ---- A. 通常起動（UID変更なし）→ 今までどおり ready、ランキング送信は本人確認の後 ----
  {
    const { deps, calls } = createFakeDeps();
    const runner = createIdentityBootstrapRunner(deps);
    assertEqual(runner.getState(), IDENTITY_STATE.PENDING, "A: 初期状態は pending");
    const sent = await fakeRankingAutoSync(runner, calls);
    assertEqual(sent, true, "A: UID変更なしなら送信される");
    assertEqual(calls, ["auth", "state:migrating", "backup-sync", "state:ready", "ranking-resend"], "A: 認証 → 持ち主確認 → ready → 送信 の順");
    assertEqual(runner.isReady(), true, "A: ready");
  }

  // ---- 新規プレイヤー（backupId 無し）は即 ready（旧UID名義の記録がクラウドに存在し得ない） ----
  {
    const { deps, calls } = createFakeDeps({ getBackupId: () => null });
    const runner = createIdentityBootstrapRunner(deps);
    await runner.ensure();
    assertEqual(runner.getState(), IDENTITY_STATE.READY, "backupId が無い新規プレイヤーは ready");
    assertEqual(calls.includes("backup-sync"), false, "新規プレイヤーはバックアップ同期を待たない");
  }

  // ---- B. UID変更あり・lastKnownUid あり → 引き継ぎが終わるまでランキング再送信が走らない ----
  {
    let migrated = false;
    const { deps, calls } = createFakeDeps({
      syncBackupOwnership: async () => {
        calls.push("backup-sync");
        return { status: "claimed", previousUid: "uid-old" };
      },
      hasPendingMigration: () => !migrated,
      runMigration: async () => {
        calls.push("migration");
        migrated = true;
        return { status: "completed" };
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    const sent = await fakeRankingAutoSync(runner, calls);
    assertEqual(sent, true, "B: 引き継ぎ完了後には送信される");
    assertEqual(calls.indexOf("migration") < calls.indexOf("ranking-resend"), true, "B: 旧UID名義の引き継ぎ（migration）がランキング再送信より前");
    assertEqual(calls.indexOf("backup-sync") < calls.indexOf("migration"), true, "B: 持ち主確認（claim）が引き継ぎより前");
    assertEqual(calls.filter((c) => c === "ranking-resend").length, 1, "B: 送信は引き継ぎ後の1回だけ");
  }

  // ---- C. UID変更あり・lastKnownUid なし・backupId/ownerSecret あり・書き込み PERMISSION_DENIED → unresolved、送信しない ----
  {
    const { deps, calls } = createFakeDeps({
      syncBackupOwnership: async () => {
        calls.push("backup-sync"); // 内部で ownerSecret claim も試し、それでも拒否された＝denied
        return { status: "denied", previousUid: null };
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    const sent = await fakeRankingAutoSync(runner, calls);
    assertEqual(sent, false, "C: 持ち主確認が取れない端末はランキングを再送信しない");
    assertEqual(runner.getState(), IDENTITY_STATE.UNRESOLVED, "C: 状態は unresolved");
    assertEqual(calls.includes("ranking-resend"), false, "C: 一度も送信していない");
    assertEqual(calls.includes("migration"), false, "C: 旧UIDが分からないので引き継ぎも走らない");
    // 再度トリガー（オンライン復帰・画面復帰）されても、持ち主確認が取れるまでは送信しない（再判定はする）
    const sentAgain = await fakeRankingAutoSync(runner, calls);
    assertEqual(sentAgain, false, "C: 再トリガーでも送信しない");
    assertEqual(calls.filter((c) => c === "backup-sync").length, 2, "C: 再トリガーのたびに持ち主確認をやり直す（管理者の付け替え後に自然に ready になる）");
  }

  // ---- D. owner claim 成功 → previousUid 保持 → migration → ready → その後 autoSync ----
  {
    let pending = true;
    const { deps, calls } = createFakeDeps({
      syncBackupOwnership: async () => {
        calls.push("backup-sync");
        return { status: "claimed", previousUid: "uid-old" };
      },
      hasPendingMigration: () => pending,
      runMigration: async () => {
        calls.push("migration");
        pending = false;
        return { status: "completed" };
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    const state = await runner.ensure();
    assertEqual(state, IDENTITY_STATE.READY, "D: claim 成功 → 引き継ぎ → ready");
    assertEqual(runner.getDetail(), { reason: "claimed" }, "D: ready の理由は claimed");
    assertEqual(calls, ["auth", "state:migrating", "backup-sync", "state:migrating", "migration", "state:ready"], "D: 順序");
    const sent = await fakeRankingAutoSync(runner, calls);
    assertEqual(sent, true, "D: ready 後は送信できる");
    assertEqual(calls.filter((c) => c === "backup-sync").length, 1, "D: ready 後の ensure は再判定しない（即返す）");
  }

  // ---- E. owner claim 失敗 → unresolved。通常クイズは遊べる（関門は例外を投げない）、過去ランキング再送信なし ----
  {
    const { deps, calls } = createFakeDeps({
      syncBackupOwnership: async () => {
        calls.push("backup-sync");
        return { status: "denied", previousUid: null };
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    let threw = false;
    try {
      await runner.ensure();
    } catch {
      threw = true;
    }
    assertEqual(threw, false, "E: 関門は例外を投げない（ゲーム自体は遊べる）");
    assertEqual(runner.getState(), IDENTITY_STATE.UNRESOLVED, "E: unresolved");
    assertEqual(await fakeRankingAutoSync(runner, calls), false, "E: 過去ランキングの再送信なし");
  }

  // ---- F. migration の途中でアプリ終了 → 次回起動で安全に再開（leaderboard-incomplete は ready にしない） ----
  {
    let attempts = 0;
    let completed = false;
    let networkDown = true; // 1回目の起動中に回線が切れて途中終了した想定
    const { deps, calls } = createFakeDeps({
      syncBackupOwnership: async () => ({ status: "synced", previousUid: "uid-old" }),
      hasPendingMigration: () => !completed, // 端末の pendingUidMerge は完了するまで残る
      runMigration: async () => {
        attempts += 1;
        calls.push(`migration#${attempts}`);
        if (networkDown) return { status: "leaderboard-incomplete", errors: ["network"] };
        completed = true;
        return { status: "completed" };
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    const first = await runner.ensure();
    assertEqual(first, IDENTITY_STATE.MIGRATING, "F: 途中で失敗（途中終了相当）は migrating のまま");
    assertEqual(canAutoSyncToCloud(runner.getState()), false, "F: 途中のままではランキングを送信しない");
    // 「次回起動」＝新しい runner（メモリ状態は消える。pendingUidMerge は端末に残っている想定）
    networkDown = false;
    const runner2 = createIdentityBootstrapRunner(deps);
    const second = await runner2.ensure();
    assertEqual(second, IDENTITY_STATE.READY, "F: 次回起動で続きから完了して ready");
    assertEqual(calls.filter((c) => c.startsWith("migration#")), ["migration#1", "migration#2"], "F: 完了するまで同じ引き継ぎを繰り返す（冪等）");
  }

  // ---- G. migration 二重実行 → 同時に呼んでも1回だけ走る（同じ Promise を返す） ----
  {
    let migrationRuns = 0;
    let pending = true;
    const { deps } = createFakeDeps({
      syncBackupOwnership: async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { status: "claimed", previousUid: "uid-old" };
      },
      hasPendingMigration: () => pending,
      runMigration: async () => {
        migrationRuns += 1;
        await new Promise((r) => setTimeout(r, 5));
        pending = false;
        return { status: "completed" };
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    const results = await Promise.all([runner.ensure(), runner.ensure(), runner.ensure()]);
    assertEqual(results, [IDENTITY_STATE.READY, IDENTITY_STATE.READY, IDENTITY_STATE.READY], "G: 同時に3回呼んでも全員 ready を受け取る");
    assertEqual(migrationRuns, 1, "G: 引き継ぎは1回しか走らない");
  }

  // ---- S. Firebase エラー／オフライン → pending のまま（破損なし）、後で再試行できる ----
  {
    let offline = true;
    let fail = true;
    const { deps, calls } = createFakeDeps({
      isOffline: () => offline,
      syncBackupOwnership: async () => {
        calls.push("backup-sync");
        if (fail) return { status: "error", previousUid: null };
        return { status: "synced", previousUid: null };
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    assertEqual(await runner.ensure(), IDENTITY_STATE.PENDING, "S: オフラインでは pending（送信しない・失敗扱いにもしない）");
    assertEqual(calls.includes("backup-sync"), false, "S: オフラインでは同期を試みない");
    offline = false;
    assertEqual(await runner.ensure(), IDENTITY_STATE.PENDING, "S: 通信エラーでも pending（unresolved にはしない）");
    fail = false;
    assertEqual(await runner.ensure(), IDENTITY_STATE.READY, "S: 回線が戻れば次の ensure で ready");
    assertEqual(await fakeRankingAutoSync(runner, calls), true, "S: その後は送信できる");
  }

  // ---- 認証未確定（uid なし）→ pending ----
  {
    const { deps } = createFakeDeps({ getCurrentUid: () => null });
    const runner = createIdentityBootstrapRunner(deps);
    assertEqual(await runner.ensure(), IDENTITY_STATE.PENDING, "認証が無ければ pending");
  }

  // ---- 依存が例外を投げても関門は壊れない ----
  {
    const { deps } = createFakeDeps({
      syncBackupOwnership: async () => {
        throw new Error("boom");
      },
    });
    const runner = createIdentityBootstrapRunner(deps);
    assertEqual(await runner.ensure(), IDENTITY_STATE.PENDING, "例外は pending として吸収する");
  }

  // ---- reset：本人の前提が変わったら判定し直す ----
  {
    const { deps, calls } = createFakeDeps();
    const runner = createIdentityBootstrapRunner(deps);
    await runner.ensure();
    runner.reset();
    assertEqual(runner.getState(), IDENTITY_STATE.PENDING, "reset で pending へ戻る");
    await runner.ensure();
    assertEqual(calls.filter((c) => c === "backup-sync").length, 2, "reset 後の ensure は持ち主確認をやり直す");
  }
}

// 配線・構造テスト（実ファイルを読む）：関門が「ランキング再送信・公開プロフィール・バックフィル」の前に
// 必ず入っていること、backupSync が結果を返し、拒否時に claim を試し、クラウドの previousUids を読むこと。
export async function runIdentityBootstrapWiringTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

  const sync = await fetchText("js/timeAttackLeaderboardSync.js");
  assertEqual(sync.includes('import { ensureIdentityBootstrap, canAutoSyncToCloud } from "./identityBootstrap.js";'), true, "sync: 関門を import している");
  const submitBody = sync.slice(sync.indexOf("export async function submitTimeAttackScoreIfBetter("), sync.indexOf("export async function fetchTimeAttackLeaderboardTop10("));
  assertEqual(submitBody.includes("if (!(await isIdentityReadyForCloudWrite())) {") && submitBody.indexOf("isIdentityReadyForCloudWrite") < submitBody.indexOf("await set(ref(database, entryPath), payload);"), true, "sync: 新記録の送信は関門の後でだけ書く");
  const candidateBody = sync.slice(sync.indexOf("export async function syncRankingCandidatesToFirebase("));
  assertEqual(candidateBody.indexOf("isIdentityReadyForCloudWrite") < candidateBody.indexOf("getAllRankingCandidateBests()"), true, "sync: 自己ベストの一括再送信は関門が ready になってから候補を読む");
  assertEqual(candidateBody.includes('reason: "identity-not-ready"'), true, "sync: ready でなければ何も送らず理由を返す");
  assertEqual(candidateBody.includes('reason: "migration-incomplete"'), true, "sync: 送信直前の引き継ぎが未完了なら送らない");
  const backfillBody = sync.slice(sync.indexOf("export async function backfillTimeAttackLeaderboardIfNeeded("), sync.indexOf("export async function syncRankingCandidatesToFirebase("));
  assertEqual(backfillBody.includes("if (!(await isIdentityReadyForCloudWrite())) return;") && backfillBody.indexOf("isIdentityReadyForCloudWrite") < backfillBody.indexOf("localStorage.setItem(flagKey"), true, "sync: 既存自己ベストのバックフィルも関門の後（フラグも立てない）");

  const profileSync = await fetchText("js/publicProfileSync.js");
  const profileBody = profileSync.slice(profileSync.indexOf("export async function syncPublicProfileIfEnabled("), profileSync.indexOf("export async function deletePublicProfile("));
  assertEqual(profileBody.includes("if (!canAutoSyncToCloud(await ensureIdentityBootstrap())) return false;") && profileBody.indexOf("ensureIdentityBootstrap") < profileBody.indexOf("await set(ref(database, `publicProfiles/${uid}`)"), true, "publicProfileSync: 公開プロフィールも関門の後でだけ書く（presence 開始はその成功が条件）");

  const backupSync = await fetchText("js/backupSync.js");
  assertEqual(backupSync.includes('lastSyncResult = { status: "denied", previousUid: null };'), true, "backupSync: 持ち主確認が取れなければ denied を返す（例外にしない）");
  assertEqual(backupSync.includes("const canClaimWithoutPreviousUid = !needsClaim && !legacyRulesDetected && isValidOwnerSecret(ownerSecret);"), true, "backupSync: lastKnownUid が無くても拒否時に ownerSecret claim を試す");
  assertEqual(backupSync.includes("await get(ref(database, `backups/${backupId}/previousUids`));"), true, "backupSync: 初回同期でクラウドの previousUids（管理者の付け替え）から旧UIDを発見する");
  assertEqual(backupSync.includes("export async function syncBackupOwnership()"), true, "backupSync: 関門用に結果を返す同期関数がある");
  assertEqual(backupSync.includes('lastSyncResult = { status: applied.claim ? "claimed" : "synced", previousUid: recordedPreviousUid };'), true, "backupSync: 成功時は synced／claimed を返す");

  const bootstrap = await fetchText("js/identityBootstrap.js");
  assertEqual(bootstrap.includes("export function createIdentityBootstrapRunner(deps)"), true, "identityBootstrap: 依存注入のオーケストレーターがある");
  assertEqual(bootstrap.includes('if (sync.status === "denied") {') && bootstrap.includes("setState(IDENTITY_STATE.UNRESOLVED"), true, "identityBootstrap: denied → unresolved");
  assertEqual(bootstrap.includes('if (migration.status === "leaderboard-incomplete") {'), true, "identityBootstrap: 旧UIDの記録が残る間は ready にしない");

  const main = await fetchText("js/main.js");
  assertEqual(main.indexOf("ensureIdentityBootstrap();") < main.indexOf("initRankingCandidateAutoSync({"), true, "main: 関門の判定開始はランキング自動同期の初期化より前");
  assertEqual(main.includes("resetIdentityBootstrap();"), true, "main: プレイヤー切替で関門を判定し直す");

  const supersession = await fetchText("js/uidSupersession.js");
  assertEqual(supersession.includes("export async function runPendingUidMigration("), true, "uidSupersession: 自動引き継ぎ（ランキング→公開プロフィール→presence）がある");
  assertEqual(supersession.includes('return { status: "leaderboard-incomplete", leaderboard'), true, "uidSupersession: ランキングの引き継ぎが未完了なら明示的に返す");
  assertEqual(supersession.includes("clearPendingUidMerge(player.playerId); // 完了"), true, "uidSupersession: 全て片付いたら確認待ちを消す（completedUidMerges に記録）");

  const profile = await fetchText("js/playerProfile.js");
  assertEqual(profile.includes("export function getCompletedUidMerges(playerId)"), true, "playerProfile: 完了済み旧UIDの記録がある");
  assertEqual(profile.includes("if (getCompletedUidMerges(playerId).includes(oldUid)) return false;"), true, "playerProfile: 完了済みの旧UIDは確認待ちを作り直さない（冪等）");

  const rules = JSON.parse(await fetchText("firebase/database.rules.json")).rules;
  // 現在の Rules で管理者にできること／できないこと（js/adminUidRepair.js の前提）
  assertEqual(rules.backups?.["$backupId"]?.[".write"]?.includes("root.child('admins').child(auth.uid).val() === true"), true, "Rules: 管理者は backups を書ける（currentUid 付け替え）");
  assertEqual(rules.backups?.["$backupId"]?.previousUids?.["$previousUid"]?.[".validate"], "newData.isNumber() && $previousUid === root.child('backups').child($backupId).child('currentUid').val() && $previousUid !== auth.uid", "Rules: previousUids は書き込み直前の currentUid（＝旧UID）だけ記録でき、管理者の同一 update 内で成立する");
  assertEqual(rules.timeAttackLeaderboardsV3?.["$variant"]?.["$questionCount"]?.["$category"]?.["$uid"]?.[".write"]?.includes("(root.child('admins').child(auth.uid).val() === true && !newData.exists())"), true, "Rules: 管理者はランキングの他人の記録を『削除だけ』できる（set/update 不可）");
  assertEqual(rules.publicProfiles?.["$uid"]?.[".write"]?.includes("(root.child('admins').child(auth.uid).val() === true && !newData.exists())"), true, "Rules: 管理者は公開プロフィールを『削除だけ』できる");
  assertEqual(rules.presence?.["$uid"]?.[".write"]?.includes("admins"), false, "Rules: presence は管理者でも消せない（後継者＝本人だけ）→ 付け替え後に本人端末が消す設計");
  assertEqual(rules.presence?.["$uid"]?.[".write"]?.includes("root.child('uidSupersession').child($uid).child('newUid').val() === auth.uid"), true, "Rules: presence は後継者が消せる");
}
