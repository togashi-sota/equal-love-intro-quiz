// 管理者判定の設定ファイル（2026-08-16新設、2026-09-15全面改訂）。
//
// 【2026-09-15の改訂理由】以前はこのファイルに管理者本人のFirebase匿名認証UIDを1つだけ
// 直書き（ADMIN_UID = "…"）し、Firebase Rules側にも同じUIDを直書きしていた。しかし匿名認証の
// UIDは「端末側の認証情報が失われる」「Firebase側でユーザーが削除される」等で本人の意思と
// 無関係に変わることがあり（2026-09-13〜14に実際に発生）、その瞬間に開発者本人が管理者機能を
// すべて失う設計だった。復旧にもコードの修正・デプロイとRulesの再公開が必要で、手間と事故の
// リスクが大きい。
//
// 【新しい方式：Firebase上の許可リスト admins/{uid}: true】
// ・「誰が管理者か」はコードではなく、Realtime Databaseの admins/{uid} というノードで管理する。
// ・admins/{uid} は Firebase Rules で「本人だけが自分のフラグを読める」「クライアントからは
//   一切書き込めない（.write: false）」に固定している。書き込めるのはFirebase Console
//   （＝プロジェクトのオーナー本人がGoogleアカウントでログインして操作する画面）だけ。
//   したがって「クライアントを改造して自分を管理者にする」ことは構造的に不可能。
// ・本当の権限チェックは、今までどおりFirebase Rules側で行う（各パスの管理者用の枝が
//   root.child('admins').child(auth.uid).val() === true を見る）。このファイルの判定は
//   「管理者用のボタンを出すかどうか」というUI上の出し分けに過ぎず、UI側だけを突破しても
//   Rulesで拒否される（従来と同じ二重チェックの設計）。
// ・UIDが変わっても、Consoleで admins/{新しいUID}: true を1行追加するだけで復旧できる。
//   コードの修正・デプロイ・Rulesの再公開はいずれも不要。複数の端末（メイン機とサブ機など）を
//   同時に管理者として登録しておけば、1台のUIDが変わっても締め出されない。
//
// 【Consoleでの登録手順（初心者向け）】Firebase Console → Realtime Database → データ タブ →
// ルート直下に「admins」というキーを作り、その下に「<自分のUID>」というキーで値 true
// （型：boolean）を追加する。自分のUIDはアプリのフレンド画面「🆔 あなたのID」で確認できる。

import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { isAdminFlagValue, buildAdminFlagPath } from "./adminAccess.js";

// 直近に確認したUIDと結果を覚えておき、同じUIDのまま何度も画面を開いたときに
// Firebaseへ毎回読みに行かないようにする。
// ・管理者だった（true）場合だけ記憶する。管理者でなかった（false）場合は記憶しない。
//   理由：本人がConsoleで admins に自分のUIDを追加した直後、アプリを再読み込みしなくても
//   次に画面を開いたときに管理者UIが出るようにするため（読み取りは1回数十バイトで、
//   コストは無視できる）。
let confirmedAdminUid = null;

// 今ログイン中のユーザーが管理者かどうかを返す（非同期）。
// 通信失敗・未ログイン・パス不正のときは必ずfalse（＝管理者UIを出さない安全側）。
export async function resolveIsAdminUser() {
  await authReady;
  const uid = getCurrentUid();
  if (uid === null) return false;
  if (confirmedAdminUid === uid) return true;

  const path = buildAdminFlagPath(uid);
  if (path === null) return false;

  try {
    const snapshot = await get(ref(database, path));
    const isAdmin = isAdminFlagValue(snapshot.val());
    if (isAdmin) confirmedAdminUid = uid;
    return isAdmin;
  } catch (error) {
    // Rules上「自分のフラグ」は必ず読めるため、ここに来るのは通信断など環境側の失敗。
    // 管理者UIを出さないだけで画面自体は壊さない。
    console.warn("管理者判定の読み取りに失敗しました（管理者用UIは表示しません）", error);
    return false;
  }
}

// テスト用：記憶した判定結果を捨てる。
export function resetAdminStateForTests() {
  confirmedAdminUid = null;
}
