// 「みんなのプロフィール」機能のうち、Firebaseに一切触れない純粋関数だけをまとめたファイル。
// js/lyricsQuizBattleFirebasePayloads.js（Phase4）と同じ設計方針：このプロジェクトには
// Firebaseエミュレーター環境が無く、実際のSDK呼び出しを伴う関数は自動テストの対象にできない
// （実機・ブラウザでの検証は手動で行う）ため、Firebase SDKの初期化が走る
// js/publicProfileSync.js／js/firebaseClient.jsとは意図的にファイルを分け、恒久テストは
// このファイルだけをimportする（Firebase初期化・匿名ログインを一切発生させないため）。

import { scheduleBackupSync } from "./backupSync.js";
import { selectStaleOwnConnectionIds } from "./presencePayloads.js";

const SCHEMA_VERSION = 1;
const ENABLED_FLAG_STORAGE_KEY_SUFFIX = "publicProfile.enabled";

// PWAとして（ホーム画面に追加されたアプリとして）起動しているかどうかの判定。
// ブラウザによって挙動が異なり100%確実ではないため（本人指示・本人も承知の上）、
// 機能の可否を分けるハードゲートには使わず、あくまで表示用の補助情報として使う想定。
// 既存コードに同種の判定が無かったため、ここで新規に用意し、他ファイルからはこの関数だけを使う
// （重複実装を避けるため）。
export function isRunningAsInstalledPwa() {
  if (typeof window === "undefined") return false;
  if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
  if (window.navigator && window.navigator.standalone === true) return true;
  return false;
}

function buildEnabledFlagKey(playerKeyPrefix) {
  return `equalLoveIntroQuiz.${playerKeyPrefix}${ENABLED_FLAG_STORAGE_KEY_SUFFIX}`;
}

// 「みんなのプロフィールに表示する」設定のON/OFF。playerProfile.jsのgetPlayerKeyPrefix()と
// 同じ考え方でプレイヤーごとに保存する（推し・称号もプレイヤーごとに別管理のため、
// 公開設定だけ端末共通にすると「Aさんは公開OFFのつもりが、Bさんが公開ONにしたら
// Aさんのデータも一緒に公開される」という事故になりうるため）。
export function isPublicProfileSharingEnabled(playerKeyPrefix) {
  try {
    return localStorage.getItem(buildEnabledFlagKey(playerKeyPrefix)) === "true";
  } catch {
    return false;
  }
}

export function writeEnabledFlag(playerKeyPrefix, enabled) {
  try {
    localStorage.setItem(buildEnabledFlagKey(playerKeyPrefix), enabled ? "true" : "false");
    // クラウドバックアップも更新する（2026-08-29追加、js/backupSync.js参照）。
    // scheduleBackupSync()自体はここではFirebase SDKを読み込まない（実際のFirebase呼び出しは
    // 全てbackupSync.js内部の動的importに閉じているため、このファイル冒頭の設計方針
    // 「Firebase初期化を一切発生させない」は変わらず保たれる）。
    scheduleBackupSync();
  } catch {
    // 保存に失敗しても（プライベートブラウズ等）アプリ自体は動き続けられるようにする。
  }
}

// 現在のローカルプロフィールから、Firebaseへ送ってよい最小限の情報だけを組み立てる純粋関数。
// Firebase・DOM・localStorageへは一切触れない（テストしやすくするため、本人指示のパターンを踏襲）。
// 呼び出し側がplayerName／oshiMemberId／achievementsSnapshot／oshiBadgeStateを渡す。
//
// 【送らないもの】音源Blob・歌詞本文・コール本文・自己ベスト詳細・Firebase UID・メールアドレス・
// IP・端末情報などは一切payloadに含めない。称号もIDだけを送り、名前・説明文・アイコンは
// 常にjs/achievementDefinitions.js側の定義から表示する（説明文の二重管理をしない）。
// 【2026-09-22 第11回追加】identityKey（backupId の SHA-256＝UIDに依存しない本人キー。ランキングと同じ値）を
// 渡すと payload に含める。Firebase Rules は「publicProfiles/{uid} の新規作成には identityKey 必須」になっており、
// 匿名UIDが差し替わった古いクライアントが新UID名義の公開プロフィールを作ることを Firebase 側で拒否する。
// backupId そのもの（引き継ぎコードの一部）は公開しない。
export function buildPublicProfilePayload({ playerName, oshiMemberId, achievementsSnapshot, oshiBadgeState, identityKey = null }) {
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    displayName: (playerName || "").trim() || "名無しのファン",
    oshiMemberId: oshiMemberId ?? null,
    unlockedAchievementIds: achievementsSnapshot
      .filter((entry) => entry.isUnlocked)
      .map((entry) => entry.id),
    hasNoMissMaster: oshiBadgeState.hasNoMissMaster,
    hasEqualLoveMaster: oshiBadgeState.hasEqualLoveMaster,
    hasEqualLoveComplete: oshiBadgeState.hasEqualLoveComplete,
  };
  if (typeof identityKey === "string" && identityKey.length >= 16 && identityKey.length <= 64) payload.identityKey = identityKey;
  return payload;
}

// publicProfiles/{uid}から読んだ生データ（Firebaseから返る形はどんな壊れ方をしているか
// 分からないため、必ずこの関数を通して安全な形へ正規化する）。壊れたschemaVersion・
// 欠けたフィールド・想定外の型でも、画面が壊れない安全なデフォルト値にフォールバックする。
export function normalizePublicProfileEntry(uid, entry) {
  if (!entry || typeof entry !== "object") return null;
  return {
    uid,
    schemaVersion: typeof entry.schemaVersion === "number" ? entry.schemaVersion : 1,
    displayName: typeof entry.displayName === "string" && entry.displayName ? entry.displayName : "名無しのファン",
    oshiMemberId: typeof entry.oshiMemberId === "string" ? entry.oshiMemberId : null,
    unlockedAchievementIds: Array.isArray(entry.unlockedAchievementIds)
      ? entry.unlockedAchievementIds.filter((id) => typeof id === "string")
      : [],
    hasNoMissMaster: entry.hasNoMissMaster === true,
    hasEqualLoveMaster: entry.hasEqualLoveMaster === true,
    hasEqualLoveComplete: entry.hasEqualLoveComplete === true,
    updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : null,
    // 2026-09-22追加：本人キー（無い旧プロフィールは null）
    identityKey: typeof entry.identityKey === "string" && entry.identityKey.length >= 16 && entry.identityKey.length <= 64 ? entry.identityKey : null,
  };
}

// ---------------------------------------------------------------------------
// 【2026-10-28追加：公開OFFの端末の起動時の「在席の後片付け」を、同じUIDの別の保存領域に配慮した形へ】
// 以前は、公開OFFの端末が起動するたびに presence/{uid} を丸ごと消していた（過去のセッションで削除に失敗した
// 残骸の自己修復のため。2026-09-09）。これは「1つのUID＝1つの保存領域」の間は安全だったが、メールで保護した
// （匿名でない）UIDは、Safari とホーム画面アプリのように**2つの保存領域で同じUIDを使える**。公開設定は
// 保存領域（端末・プレイヤー）ごとの値なので、Safari 側が OFF でもホーム画面アプリ側は ON のことがあり、
// 丸ごと消すとホーム画面アプリの生きている接続ノードまで消えて「オフライン」に見えていた
// （tools/feature-research/2026-10-28/presence-auth-verification-report.md の 4-5・P14 で再現）。
//
// 【決めた動き】（自分の接続を止める＝stopFriendPresenceTracking() は呼び出し側で先に行う）
//   ・匿名のログイン（または状態が分からない）→ 従来どおり presence/{uid} を丸ごと消す。
//     匿名のUIDはその保存領域だけのものなので、他の保存領域の接続は存在しない。プライバシーの意図
//     （公開OFFなら在席を何も見せない）も、残骸の自己修復もそのまま。
//   ・匿名でない（保護済み）ログイン → presence/{uid} を読み、
//       ① 生きているかもしれない接続ノード（＝残骸の基準に当たらないもの）が1つも無い → 見えているもの
//          （残骸の接続ノード・lastSeen・isPlaying）を消す。結果は従来の丸ごと削除と同じで、在席は何も見えない。
//          ただし「読んだ後に別の保存領域が新しく作った接続ノード」は消さない（丸ごと消さず、読んだ子だけを消すため）。
//       ② 他の保存領域の生きている接続がある → その接続・lastSeen・isPlaying には触れない。残骸の基準に当たる
//          接続ノードだけ消す。その保存領域は公開ONで遊んでいる（公開プロフィールもその保存領域が作っている）ので、
//          この端末が OFF でも、このUIDのオンライン表示は元々その保存領域の設定どおりに見えるべきもの。
//          この端末の接続は呼び出し側が既に止めて消しているので、この端末の在席は増えない。
//       ③ 読めなかった（通信エラー等）→ 何もしない（他の保存領域の接続を消す危険を取らない。次の起動で再試行）。
//   ・明示的に公開を OFF にした操作（setPublicProfileSharingEnabled(…, false)）は対象外：公開プロフィール
//     （UIDごとに1つ）も消す操作なので、在席も従来どおり丸ごと消す（アカウント単位で非公開にする本人の操作）。
// 「残骸の基準」は自分の古い接続の掃除（js/presenceSync.js）と同じ selectStaleOwnConnectionIds()
// （作成から24時間以上の true／時刻つきで1時間以上止まったもの）。
// 残るリスク：今の本番 Rules（接続ノードが true）では、この保存領域が以前に消し損ねた24時間未満の true の
// 接続ノードは、他の保存領域の生きている接続と見分けられないので②として残る（最大24時間。従来は消えていた）。
export const PRESENCE_OFF_CLEANUP = Object.freeze({
  DELETE_ALL: "delete-all",
  CLEAR_SEEN: "clear-seen",
  REMOVE_STALE_ONLY: "remove-stale-only",
  NONE: "none",
});

// 純粋関数：公開OFFの端末の起動時に、presence/{uid} の何を消すかを決める。
//   isAnonymous: true／false／null（分からない＝匿名と同じ扱い）
//   presenceEntry: presence/{uid} の値（無ければ null）
//   戻り値：{ action, updates }（updates は presence/{uid} からの相対パス → null。update() にそのまま渡せる）
export function planPresenceCleanupWhileSharingOff({ isAnonymous, presenceEntry, nowMs, serverNowMs = nowMs }) {
  if (isAnonymous !== false) return { action: PRESENCE_OFF_CLEANUP.DELETE_ALL, updates: null, liveConnectionCount: 0 };
  if (!presenceEntry || typeof presenceEntry !== "object") return { action: PRESENCE_OFF_CLEANUP.NONE, updates: {}, liveConnectionCount: 0 };
  const connections = presenceEntry.connections && typeof presenceEntry.connections === "object" ? presenceEntry.connections : {};
  const staleIds = selectStaleOwnConnectionIds(connections, null, nowMs, undefined, { serverNowMs });
  const liveIds = Object.keys(connections).filter((id) => !staleIds.includes(id));
  const updates = {};
  staleIds.forEach((id) => {
    updates[`connections/${id}`] = null;
  });
  if (liveIds.length > 0) {
    return { action: Object.keys(updates).length ? PRESENCE_OFF_CLEANUP.REMOVE_STALE_ONLY : PRESENCE_OFF_CLEANUP.NONE, updates, liveConnectionCount: liveIds.length };
  }
  if ("lastSeen" in presenceEntry) updates.lastSeen = null;
  if ("isPlaying" in presenceEntry) updates.isPlaying = null;
  return { action: Object.keys(updates).length ? PRESENCE_OFF_CLEANUP.CLEAR_SEEN : PRESENCE_OFF_CLEANUP.NONE, updates, liveConnectionCount: 0 };
}

// 依存を受け取って実行する（js/publicProfileSync.js が本物の Firebase を、tests/presenceSharingOffCleanup.test.js が偽物を渡す）。
//   getUid(): Promise<string|null>   isAnonymous(): true/false/null
//   deleteAll(): presence/{uid} を丸ごと消す（js/presenceSync.js の deleteFriendPresence）
//   readPresence(uid): Promise<presence/{uid} の値>   applyUpdates(uid, updates): Promise（presence/{uid} への update）
//   nowMs()・serverNowMs(): 端末時刻・サーバー時刻の推定値
// 失敗しても例外は投げない（起動を止めない）。戻り値は何をしたか（テスト・診断用）。
export async function cleanupPresenceWhileSharingOff(deps) {
  try {
    const uid = await deps.getUid();
    if (!uid) return { action: PRESENCE_OFF_CLEANUP.NONE, reason: "no-uid" };
    const isAnonymous = deps.isAnonymous();
    if (isAnonymous !== false) {
      await deps.deleteAll();
      return { action: PRESENCE_OFF_CLEANUP.DELETE_ALL };
    }
    let presenceEntry = null;
    try {
      presenceEntry = await deps.readPresence(uid);
    } catch {
      return { action: PRESENCE_OFF_CLEANUP.NONE, reason: "read-failed" };
    }
    const plan = planPresenceCleanupWhileSharingOff({ isAnonymous, presenceEntry, nowMs: deps.nowMs(), serverNowMs: deps.serverNowMs() });
    if (plan.updates && Object.keys(plan.updates).length > 0) await deps.applyUpdates(uid, plan.updates);
    return { action: plan.action, liveConnectionCount: plan.liveConnectionCount };
  } catch (error) {
    console.warn("公開OFFの在席の後片付けに失敗しました（次の起動で再試行します）", error);
    return { action: PRESENCE_OFF_CLEANUP.NONE, reason: "error" };
  }
}
