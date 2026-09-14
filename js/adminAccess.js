// 管理者判定の純粋関数（2026-09-15新設）。
//
// js/adminConfig.js（Firebaseへ実際に読みに行く側）から切り出した、通信を伴わない判定・
// パス組み立てだけをまとめたファイル。tests.html から Firebase SDK を読み込まずに検証できる
// ようにするための分離（js/presencePayloads.js と js/presenceSync.js の関係と同じ考え方）。
//
// あわせて、firebase/database.rules.json の管理者関連ルールの「意図」を再現する
// シミュレーター（evaluateAdminsNodeAccess / isAdminByRules）も置く。本物のRules構文そのものでは
// ないが、「クライアントは admins に一切書けない」「読めるのは自分のフラグだけ」「管理者判定は
// admins/{uid} が厳密に true のときだけ」という3点が、将来の変更で崩れていないことを
// 恒久テストで確認するためのもの（js/onlineBattleCapacitySecurityRules.js と同じパターン）。

// admins/{uid} の値が「管理者である」とみなせるかどうか（純粋関数、テスト対象）。
// Firebase Rules側の .validate（newData.val() === true）と完全に同じ基準にそろえている。
// 文字列の "true"・1・オブジェクト等は管理者とみなさない。
export function isAdminFlagValue(value) {
  return value === true;
}

// admins/{uid} のFirebaseパスを組み立てる（純粋関数、テスト対象）。
// uidが空・不正な場合はnullを返し、呼び出し側で「読みに行かない」判断に使う。
export function buildAdminFlagPath(uid) {
  if (typeof uid !== "string" || uid.length === 0 || uid.includes("/")) return null;
  return `admins/${uid}`;
}

// ---- Firebase Rules の意図を再現するシミュレーター（テスト用） ----

// admins/{targetUid} への読み書きが許可されるか。
// 本物のRules（firebase/database.rules.json の "admins" ノード）：
//   ".read":  "auth != null && auth.uid === $uid"  … 自分のフラグだけ読める
//   ".write": false                                … クライアントからは誰も書けない（Consoleのみ）
export function evaluateAdminsNodeAccess({ authUid, targetUid, operation }) {
  if (operation === "write") return false;
  if (operation === "read") {
    return typeof authUid === "string" && authUid.length > 0 && authUid === targetUid;
  }
  return false;
}

// 各パスの管理者用の枝（root.child('admins').child(auth.uid).val() === true）の再現。
// adminsMap は { [uid]: 値 } 形式（Firebase上の admins ノードの中身に相当）。
export function isAdminByRules(adminsMap, authUid) {
  if (typeof authUid !== "string" || authUid.length === 0) return false;
  if (!adminsMap || typeof adminsMap !== "object") return false;
  return isAdminFlagValue(adminsMap[authUid]);
}
