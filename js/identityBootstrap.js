// 起動時の「本人確認の関門」（Identity Bootstrap Barrier、2026-09-22新設・本人指示 第8回）。
//
// 【背景】このアプリの Firebase 匿名UIDは差し替わることがある（Firebase側の匿名アカウント自動削除など）。
// 端末内のデータ（自己ベスト・称号・backupId）は残るため、以前は起動直後に
//   js/rankingCandidateAutoSync.js → syncRankingCandidatesToFirebase()
// が「新UID名義」で過去の自己ベストを一括再送信し、旧UID名義の記録と並んで「同じ人が2人」になった
// （2026-09-22 再発：じゅ・サブ・Olkya）。バックアップの所有権確認（js/backupSync.js）は
// デバウンス4秒後に動くため、順序が「ランキング再送信 → 本人確認」と逆だった。
//
// 【この関門の役割】クラウドへ「自分名義」で何かを書く処理（ランキング再送信・公開プロフィール・presence）を、
// 次の順序が終わるまで待たせる：
//   AUTH_READY（匿名認証確定）
//   → LOCAL_IDENTITY_LOADED（端末の backupId／ownerSecret／lastKnownUid を読む）
//   → BACKUP_OWNERSHIP_CHECK（バックアップを持ち主として書けるか。書けなければ ownerSecret で claim）
//   → UID_MIGRATION（旧UIDが分かっていれば、旧UID名義のランキング記録を新UID名義へ引き継いで旧を消す）
//   → IDENTITY_READY（ここで初めてランキング再送信などを解禁）
//
// 【状態】
//   pending    … まだ判定していない／通信できず保留（オフライン等）。クラウド書き込みは待機。
//   migrating  … 所有権確認・引き継ぎの途中。待機。
//   ready      … 本人確認済み。クラウド同期してよい。
//   unresolved … backupId はあるのにバックアップの持ち主確認が取れない（旧UIDが消えた pre-v329 端末など）。
//                通常のオフラインクイズは遊べるが、「過去の自己ベストを別UID名義で一括送信する」処理は止める。
//                管理者が backups/{id}/currentUid を付け替える（js/adminUidRepair.js）と、次回起動で ready になる。
//
// 【設計】判定の本体 createIdentityBootstrapRunner() は Firebase を知らず、依存（同期・引き継ぎ・端末情報）を
// 引数で受け取る純粋なオーケストレーター（テストで偽の依存を差し込める）。実アプリ向けの配線は
// ensureIdentityBootstrap() が動的 import で組み立てる（循環 import を避けるため）。
// 何度呼ばれても、進行中なら同じ Promise を返し、ready になった後は即座に返す（冪等）。

export const IDENTITY_STATE = {
  PENDING: "pending",
  MIGRATING: "migrating",
  READY: "ready",
  UNRESOLVED: "unresolved",
};

// 状態ごとに「クラウドへ自分名義で自動送信してよいか」。ready のときだけ true。
export function canAutoSyncToCloud(state) {
  return state === IDENTITY_STATE.READY;
}

// deps:
//   getCurrentUid(): string|null … 認証済みUID（authReady 後に呼ぶ）
//   waitAuthReady(): Promise
//   isOffline(): boolean
//   getBackupId(): string|null … 端末に保存済みの backupId（新規発行はしない）
//   syncBackupOwnership(): Promise<{ status: "synced"|"claimed"|"denied"|"no-change"|"no-auth"|"error", previousUid }>
//   hasPendingMigration(): boolean … 端末に旧UIDの確認待ちがあるか
//   runMigration(): Promise<{ status: "none"|"leaderboard-incomplete"|"completed"|"partial" }>
//   onStateChange(state, detail)?: 状態が変わるたびに呼ばれる（ログ・画面用）
export function createIdentityBootstrapRunner(deps) {
  let state = IDENTITY_STATE.PENDING;
  let detail = null;
  let inFlight = null;
  const listeners = new Set();

  function setState(next, nextDetail = null) {
    state = next;
    detail = nextDetail;
    deps.onStateChange?.(state, detail);
    listeners.forEach((listener) => {
      try {
        listener(state, detail);
      } catch {
        // 通知先の例外で関門自体を止めない
      }
    });
  }

  async function runOnce() {
    await deps.waitAuthReady();
    const uid = deps.getCurrentUid();
    if (!uid) {
      setState(IDENTITY_STATE.PENDING, { reason: "no-auth" });
      return state;
    }
    if (deps.isOffline()) {
      setState(IDENTITY_STATE.PENDING, { reason: "offline" });
      return state;
    }

    // LOCAL_IDENTITY_LOADED：backupId が無い＝まだ一度もクラウドへ何も置いていない新規プレイヤー。
    // 旧UID名義の記録がクラウドに存在し得ないため、そのまま ready。
    const backupId = deps.getBackupId();
    if (!backupId) {
      setState(IDENTITY_STATE.READY, { reason: "no-backup-id" });
      return state;
    }

    // BACKUP_OWNERSHIP_CHECK：持ち主として書ける（または claim で取り戻せる）か。
    setState(IDENTITY_STATE.MIGRATING, { step: "backup-ownership" });
    const sync = await deps.syncBackupOwnership();
    if (sync.status === "denied") {
      // backupId はあるのに持ち主確認が取れない → 旧UIDの可能性が高い。ランキング等の自動送信は止める。
      setState(IDENTITY_STATE.UNRESOLVED, { reason: "backup-ownership-denied" });
      return state;
    }
    if (sync.status === "error" || sync.status === "no-auth") {
      setState(IDENTITY_STATE.PENDING, { reason: sync.status });
      return state;
    }

    // UID_MIGRATION：旧UIDが分かっていれば、旧UID名義のランキング記録を先に片付ける。
    if (deps.hasPendingMigration()) {
      setState(IDENTITY_STATE.MIGRATING, { step: "uid-migration", previousUid: sync.previousUid ?? null });
      const migration = await deps.runMigration();
      if (migration.status === "leaderboard-incomplete") {
        // 旧UIDの記録がまだ残っている＝今送ると重複を作る。ready にしない（次の機会に再試行）。
        setState(IDENTITY_STATE.MIGRATING, { step: "uid-migration-retry", errors: migration.errors ?? [] });
        return state;
      }
    }

    setState(IDENTITY_STATE.READY, { reason: sync.status });
    return state;
  }

  return {
    getState: () => state,
    getDetail: () => detail,
    isReady: () => state === IDENTITY_STATE.READY,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    // ready なら即返す。進行中なら同じ Promise。pending／unresolved／migrating なら判定をやり直す。
    ensure() {
      if (state === IDENTITY_STATE.READY) return Promise.resolve(state);
      if (inFlight) return inFlight;
      inFlight = runOnce()
        .catch((error) => {
          console.warn("本人確認の関門で予期しないエラー（次の機会に再試行します）", error);
          setState(IDENTITY_STATE.PENDING, { reason: "exception" });
          return state;
        })
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    // テスト・復元直後などで状態を初期化する
    reset() {
      state = IDENTITY_STATE.PENDING;
      detail = null;
    },
  };
}

// ---------------------------------------------------------------------------
// 実アプリ向けの配線（シングルトン）
// ---------------------------------------------------------------------------
let appRunner = null;

function isOffline() {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function getAppRunner() {
  if (appRunner) return appRunner;
  appRunner = createIdentityBootstrapRunner({
    waitAuthReady: async () => {
      const { authReady } = await import("./firebaseClient.js");
      await authReady;
    },
    getCurrentUid: () => {
      // firebaseClient は waitAuthReady で読み込み済み。同期的に UID を返すため、モジュールをキャッシュから取る。
      return cachedFirebaseClient?.getCurrentUid?.() ?? null;
    },
    isOffline,
    getBackupId: () => {
      const player = playerProfileModule.getActivePlayer();
      return playerProfileModule.getBackupId(player.playerId);
    },
    syncBackupOwnership: async () => {
      const { syncBackupOwnership } = await import("./backupSync.js");
      return syncBackupOwnership();
    },
    hasPendingMigration: () => {
      const player = playerProfileModule.getActivePlayer();
      return playerProfileModule.getPendingUidMerge(player.playerId) !== null;
    },
    runMigration: async () => {
      const { runPendingUidMigration } = await import("./uidSupersession.js");
      const { computeLeaderboardIdentityKey } = await import("./timeAttackLeaderboard.js");
      const player = playerProfileModule.getActivePlayer();
      const identityKey = await computeLeaderboardIdentityKey(playerProfileModule.getBackupId(player.playerId));
      return runPendingUidMigration({ identityKey });
    },
    onStateChange: (state, detail) => {
      console.info(`[identity] ${state}`, detail ?? "");
    },
  });
  return appRunner;
}

let cachedFirebaseClient = null;
let playerProfileModule = null;

// 起動時・オンライン復帰時・クラウド書き込みの直前に呼ぶ。戻り値は判定後の状態。
export async function ensureIdentityBootstrap() {
  if (!playerProfileModule) playerProfileModule = await import("./playerProfile.js");
  if (!cachedFirebaseClient) cachedFirebaseClient = await import("./firebaseClient.js");
  return getAppRunner().ensure();
}

export function getIdentityState() {
  return appRunner ? appRunner.getState() : IDENTITY_STATE.PENDING;
}

export function isIdentityReady() {
  return getIdentityState() === IDENTITY_STATE.READY;
}

export function subscribeIdentityState(listener) {
  return getAppRunner().subscribe(listener);
}

// 復元・引き継ぎコード・プレイヤー切り替えなど「本人の前提が変わった」直後に、次の関門を判定し直させる。
export function resetIdentityBootstrap() {
  appRunner?.reset();
}
