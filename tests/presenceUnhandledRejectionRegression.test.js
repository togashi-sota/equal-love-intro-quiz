// プレゼンス（接続状態）管理の書き込みに.catch()が付いているかの回帰防止テスト
// （2026-09-06、長時間耐久検証PHASE Lの防御的ソース監査で発見）。
//
// 【発見された不具合】js/onlineBattle.jsのstartPresenceTracking()内の
// onDisconnect(...).set(false)・set(entityConnectedRef, true)、および
// handlePresenceVisibilityChange()内のset(entityConnectedRef, ...)の3箇所が、
// .catch()の無いfire-and-forgetな書き込みになっていた。書き込みが失敗すると
// 未処理のPromise rejectionとなり、接続状態（connected）フラグが直らないまま
// エラーにも気付けない状態だった。この関数のヘッダーコメント自体が「スマホを
// バックグラウンドに回して戻ってくると『切断中』の表示が直らない」不具合の調査記録を
// 残しているのに、その修正時にこの3箇所だけ.catch()が付け忘れられていた
// （joinRoom等、ファイル内の他のFirebase書き込みは全て.catch()で保護されている）。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineBattle.jsはFirebase接続を
// 直接張るため、tests.htmlへ安全にimportできない
// （tests/inviteFullRoomRegression.test.js等と同じ理由）。
import { assertEqual } from "./test-utils.js";

export async function runPresenceUnhandledRejectionRegressionTests() {
  const response = await fetch("js/onlineBattle.js");
  const source = await response.text();
  assertEqual(source.length > 500, true, "js/onlineBattle.jsのソースを取得できた（前提条件）");

  // ---- startPresenceTracking()：onDisconnect().set(false) と set(...,true) ----
  {
    const fnStart = source.indexOf("function startPresenceTracking(roomId, uid, kind = \"players\") {");
    assertEqual(fnStart !== -1, true, "startPresenceTracking()が存在する（前提条件）");
    const fnBody = source.slice(fnStart, fnStart + 900);

    assertEqual(
      fnBody.includes("onDisconnect(entityConnectedRef)") && fnBody.includes(".set(false)") && fnBody.includes(".catch("),
      true,
      "onDisconnect(entityConnectedRef).set(false)に.catch()が付いている（未処理のPromise rejection防止）"
    );
    assertEqual(
      /set\(entityConnectedRef,\s*true\)\s*\.catch\(/.test(fnBody),
      true,
      "set(entityConnectedRef, true)に.catch()が付いている（未処理のPromise rejection防止）"
    );
  }

  // ---- handlePresenceVisibilityChange()：set(..., document.visibilityState...) ----
  {
    const fnStart = source.indexOf("function handlePresenceVisibilityChange() {");
    assertEqual(fnStart !== -1, true, "handlePresenceVisibilityChange()が存在する（前提条件）");
    const fnBody = source.slice(fnStart, fnStart + 500);

    assertEqual(
      /set\(entityConnectedRef,\s*document\.visibilityState[^)]*\)\s*\.catch\(/.test(fnBody),
      true,
      "set(entityConnectedRef, document.visibilityState === \"visible\")に.catch()が付いている（未処理のPromise rejection防止）"
    );
  }
}
