// js/presenceSecurityRules.js（presence.$uid.writeルール案のJSシミュレーター）のテスト。
// 2026-09-09、本人がFirebase Rules Playgroundで実機不具合を再現したことを受けて、
// 「本人による削除は常に許可・新規作成/更新は公開プロフィールが必要」という
// 意図した動作を、実際のFirebase接続なしに検証する（A〜Dの4パターン）。
import { canWritePresence } from "../js/presenceSecurityRules.js";
import { assertEqual } from "./test-utils.js";

export function runPresenceSecurityRulesTests() {
  const UID_ON = "TEST_UID_ON"; // 公開プロフィールを持っている本人
  const UID_OFF = "TEST_UID_OFF"; // 公開プロフィールを持っていない本人
  const OTHER_UID = "TEST_UID_OTHER"; // 他人

  // ===== A：公開プロフィールあり＋本人UID → presence作成/更新 = Allowed =====
  assertEqual(
    canWritePresence({ authUid: UID_ON, targetUid: UID_ON, newDataExists: true, publicProfileExists: true }),
    true,
    "A：公開プロフィールがある本人は、presenceの新規作成/更新が許可される"
  );

  // ===== B：公開プロフィールなし＋本人UID → presence作成/更新 = Denied =====
  assertEqual(
    canWritePresence({ authUid: UID_OFF, targetUid: UID_OFF, newDataExists: true, publicProfileExists: false }),
    false,
    "B：公開プロフィールが無い本人は、presenceの新規作成/更新が拒否される（Stage1の目的）"
  );

  // ===== C：本人UID → 自分のpresence削除 = Allowed（公開プロフィールの有無を問わない） =====
  assertEqual(
    canWritePresence({ authUid: UID_OFF, targetUid: UID_OFF, newDataExists: false, publicProfileExists: false }),
    true,
    "C-1：公開プロフィールが既に無い本人でも、自分のpresence削除は許可される" +
      "（今回実機で再現した『詰み』状態の修正確認）"
  );
  assertEqual(
    canWritePresence({ authUid: UID_ON, targetUid: UID_ON, newDataExists: false, publicProfileExists: true }),
    true,
    "C-2：公開プロフィールがまだ残っている本人も、自分のpresence削除は許可される"
  );

  // ===== D：他人UID → 他人のpresence作成/更新/削除 = Denied =====
  assertEqual(
    canWritePresence({ authUid: OTHER_UID, targetUid: UID_ON, newDataExists: true, publicProfileExists: true }),
    false,
    "D-1：他人は、公開プロフィールの有無に関係なく他人のpresenceを新規作成/更新できない"
  );
  assertEqual(
    canWritePresence({ authUid: OTHER_UID, targetUid: UID_ON, newDataExists: false, publicProfileExists: true }),
    false,
    "D-2：他人は、他人のpresenceを削除することもできない（削除の無条件許可は本人限定）"
  );
  assertEqual(
    canWritePresence({ authUid: OTHER_UID, targetUid: UID_OFF, newDataExists: false, publicProfileExists: false }),
    false,
    "D-3：他人は、公開プロフィールが無い他人のpresenceも削除できない"
  );

  // ===== 前提条件：未認証は常に拒否 =====
  assertEqual(
    canWritePresence({ authUid: null, targetUid: UID_ON, newDataExists: false, publicProfileExists: true }),
    false,
    "未認証（authUidが無い）場合は、削除操作であっても拒否される"
  );
}
