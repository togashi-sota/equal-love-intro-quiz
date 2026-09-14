// 管理者判定の許可リスト方式（admins/{uid}: true）の回帰テスト（2026-09-15新設）。
//
// 【背景】2026-09-13〜14に、開発者本人のFirebase匿名認証UIDが本人の操作なしに変わり、
// コード（js/adminConfig.jsのADMIN_UID）とFirebase Rulesの両方に直書きしていた旧UIDと
// 一致しなくなったため、本人が管理者機能をすべて失った。再発防止として、管理者の判定を
// 「Firebase上の admins/{uid} が厳密に true かどうか」へ変更した。
//
// このテストが守ること：
// 1) 純粋関数（js/adminAccess.js）が「true以外は管理者とみなさない」「不正なuidでは
//    パスを組み立てない」こと。
// 2) Rulesの意図を再現するシミュレーターが「クライアントは admins に一切書けない」
//    「読めるのは自分のフラグだけ」であること。
// 3) firebase/database.rules.json の実ファイルに、旧方式の「UID直書き」が1箇所も残っておらず、
//    管理者用の枝がすべて admins 参照へ置き換わっていること。admins ノードの
//    .write が false のままであること（ここが true や式に変わると「誰でも自分を管理者に
//    できる」穴になるため、最重要の検証）。
// 4) js/adminConfig.js から ADMIN_UID の直書きが消え、画面側（フレンド画面・ランキング画面）が
//    resolveIsAdminUser() を使う配線になっていること（ソース構造検証）。

import {
  isAdminFlagValue,
  buildAdminFlagPath,
  evaluateAdminsNodeAccess,
  isAdminByRules,
} from "../js/adminAccess.js";
import { assertEqual } from "./test-utils.js";

const ADMIN_CLAUSE = "root.child('admins').child(auth.uid).val() === true";

export function runAdminAccessTests() {
  // ---- 1) 純粋関数 ----
  assertEqual(isAdminFlagValue(true), true, "admins/{uid} が true なら管理者");
  assertEqual(isAdminFlagValue("true"), false, "文字列の 'true' は管理者とみなさない");
  assertEqual(isAdminFlagValue(1), false, "数値の 1 は管理者とみなさない");
  assertEqual(isAdminFlagValue({}), false, "オブジェクトは管理者とみなさない");
  assertEqual(isAdminFlagValue(null), false, "未登録（null）は管理者ではない");
  assertEqual(isAdminFlagValue(undefined), false, "undefined は管理者ではない");

  assertEqual(buildAdminFlagPath("sh5vDFnk64Mdp5fCa1jomwRgPWW2"), "admins/sh5vDFnk64Mdp5fCa1jomwRgPWW2", "uidから admins/{uid} のパスを組み立てる");
  assertEqual(buildAdminFlagPath(""), null, "空文字のuidではパスを組み立てない");
  assertEqual(buildAdminFlagPath(null), null, "nullのuidではパスを組み立てない");
  assertEqual(buildAdminFlagPath("a/b"), null, "スラッシュを含むuidではパスを組み立てない（別ノードへ迷い込まない）");

  // ---- 2) Rulesシミュレーター ----
  assertEqual(evaluateAdminsNodeAccess({ authUid: "u1", targetUid: "u1", operation: "write" }), false, "自分の admins フラグでもクライアントからは書けない");
  assertEqual(evaluateAdminsNodeAccess({ authUid: "u1", targetUid: "u2", operation: "write" }), false, "他人の admins フラグはクライアントからは書けない");
  assertEqual(evaluateAdminsNodeAccess({ authUid: "u1", targetUid: "u1", operation: "read" }), true, "自分の admins フラグは読める");
  assertEqual(evaluateAdminsNodeAccess({ authUid: "u1", targetUid: "u2", operation: "read" }), false, "他人の admins フラグは読めない");
  assertEqual(evaluateAdminsNodeAccess({ authUid: null, targetUid: "u1", operation: "read" }), false, "未ログインでは読めない");

  const adminsMap = { adminUid: true, fakeAdmin: "true", numeric: 1 };
  assertEqual(isAdminByRules(adminsMap, "adminUid"), true, "admins に true で登録されたuidは管理者用の枝を通る");
  assertEqual(isAdminByRules(adminsMap, "fakeAdmin"), false, "値が文字列 'true' のuidは管理者用の枝を通らない");
  assertEqual(isAdminByRules(adminsMap, "numeric"), false, "値が 1 のuidは管理者用の枝を通らない");
  assertEqual(isAdminByRules(adminsMap, "unknown"), false, "未登録のuidは管理者用の枝を通らない");
  assertEqual(isAdminByRules(null, "adminUid"), false, "admins ノード自体が無ければ誰も管理者ではない");
  assertEqual(isAdminByRules(adminsMap, ""), false, "空のuidは管理者ではない");
}

export async function runAdminAccessRulesRegressionTests() {
  // ---- 3) firebase/database.rules.json の実ファイル検証 ----
  const rulesText = await (await fetch("firebase/database.rules.json", { cache: "no-store" })).text();
  assertEqual(rulesText.length > 500, true, "database.rules.jsonのソースを取得できた（前提条件）");
  const rules = JSON.parse(rulesText).rules;

  assertEqual(/auth\.uid === '[A-Za-z0-9]{20,}'/.test(rulesText), false, "Rulesに匿名UIDの直書き比較（auth.uid === '…'）が1箇所も残っていない");
  assertEqual(rulesText.includes("1lg2urCowcMqF6r8E7tkc9OOm3r1"), false, "旧管理者UIDがRulesに残っていない");

  const adminClauseCount = rulesText.split(ADMIN_CLAUSE).length - 1;
  // 7箇所＝従来のUID直書きの置き換え、＋1箇所＝2026-09-15追加の backups/ownerSecret の .validate（管理者は無効化できる）
  assertEqual(adminClauseCount, 8, "管理者用の枝（admins参照）が従来のUID直書き7箇所すべて＋ownerSecret検証の1箇所に置き換わっている");

  const admins = rules.admins;
  assertEqual(typeof admins, "object", "admins ノードがRulesに定義されている");
  assertEqual(admins?.[".read"], undefined, "admins ノード全体を一覧読み取りする権限は誰にも無い");
  assertEqual(admins?.[".write"], undefined, "admins ノード全体を書き換える権限は誰にも無い");
  assertEqual(admins?.["$uid"]?.[".write"], false, "admins/{uid} はクライアントから一切書けない（.write: false）");
  assertEqual(admins?.["$uid"]?.[".read"], "auth != null && auth.uid === $uid", "admins/{uid} を読めるのは本人だけ");
  assertEqual(admins?.["$uid"]?.[".validate"], "newData.val() === true", "admins/{uid} の値は true 以外を受け付けない");

  // 管理者用の枝が、以前と同じ7箇所（プロフィール削除・ランキング削除2種・backups読み書き・
  // recoveryRequests読み書き）に存在することを個別に確認する。
  assertEqual(rules.publicProfiles?.["$uid"]?.[".write"]?.includes(ADMIN_CLAUSE), true, "publicProfiles/{uid} の削除枝が admins 参照になっている");
  assertEqual(rules.timeAttackLeaderboardsV2?.["$variant"]?.["$rule"]?.["$questionCount"]?.["$category"]?.["$uid"]?.[".write"]?.includes(ADMIN_CLAUSE), true, "ランキングV2の削除枝が admins 参照になっている");
  assertEqual(rules.timeAttackLeaderboardsV3?.["$variant"]?.["$questionCount"]?.["$category"]?.["$uid"]?.[".write"]?.includes(ADMIN_CLAUSE), true, "ランキングV3の削除枝が admins 参照になっている");
  assertEqual(rules.backups?.[".read"], `auth != null && ${ADMIN_CLAUSE}`, "backups 全件読み取りは管理者だけ");
  assertEqual(rules.backups?.["$backupId"]?.[".write"]?.includes(ADMIN_CLAUSE), true, "backups/{backupId} の管理者書き込み枝が admins 参照になっている");
  assertEqual(rules.recoveryRequests?.[".read"], `auth != null && ${ADMIN_CLAUSE}`, "recoveryRequests 全件読み取りは管理者だけ");
  assertEqual(rules.recoveryRequests?.["$code"]?.[".write"]?.includes(ADMIN_CLAUSE), true, "recoveryRequests/{code} の管理者承認枝が admins 参照になっている");

  // ---- 4) コード側の配線（ソース構造検証） ----
  const adminConfigSource = await (await fetch("js/adminConfig.js", { cache: "no-store" })).text();
  assertEqual(/export const ADMIN_UID/.test(adminConfigSource), false, "js/adminConfig.js から ADMIN_UID の直書きが消えている");
  assertEqual(adminConfigSource.includes("export async function resolveIsAdminUser()"), true, "js/adminConfig.js が resolveIsAdminUser() を提供している");
  assertEqual(adminConfigSource.includes("buildAdminFlagPath(uid)"), true, "resolveIsAdminUser() が admins/{uid} のパスを読みに行く");

  for (const file of ["js/fanProfilesScreen.js", "js/timeAttackLeaderboardScreen.js"]) {
    const source = await (await fetch(file, { cache: "no-store" })).text();
    assertEqual(source.includes('import { resolveIsAdminUser } from "./adminConfig.js";'), true, `${file} が resolveIsAdminUser() をimportしている`);
    assertEqual(source.includes("isAdminUser = uid !== null && (await resolveIsAdminUser());"), true, `${file} の管理者判定が resolveIsAdminUser() の結果を使っている`);
    assertEqual(source.includes("ADMIN_UID !== null"), false, `${file} に旧方式（ADMIN_UID比較）が残っていない`);
  }
}
