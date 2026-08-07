// 「みんなのプロフィール」機能のうち、Firebaseに一切触れない純粋関数だけをまとめたファイル。
// js/lyricsQuizBattleFirebasePayloads.js（Phase4）と同じ設計方針：このプロジェクトには
// Firebaseエミュレーター環境が無く、実際のSDK呼び出しを伴う関数は自動テストの対象にできない
// （実機・ブラウザでの検証は手動で行う）ため、Firebase SDKの初期化が走る
// js/publicProfileSync.js／js/firebaseClient.jsとは意図的にファイルを分け、恒久テストは
// このファイルだけをimportする（Firebase初期化・匿名ログインを一切発生させないため）。

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
export function buildPublicProfilePayload({ playerName, oshiMemberId, achievementsSnapshot, oshiBadgeState }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    displayName: (playerName || "").trim() || "名無しのファン",
    oshiMemberId: oshiMemberId ?? null,
    unlockedAchievementIds: achievementsSnapshot
      .filter((entry) => entry.isUnlocked)
      .map((entry) => entry.id),
    hasEqualLoveMaster: oshiBadgeState.hasEqualLoveMaster,
    hasEqualLoveComplete: oshiBadgeState.hasEqualLoveComplete,
  };
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
    hasEqualLoveMaster: entry.hasEqualLoveMaster === true,
    hasEqualLoveComplete: entry.hasEqualLoveComplete === true,
    updatedAt: typeof entry.updatedAt === "number" ? entry.updatedAt : null,
  };
}
