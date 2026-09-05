// オンラインロビーの「ホストを渡す」「キック」（＋再戦準備フェーズのキック）確認を、
// OS標準のwindow.confirm()からアプリ独自モーダルへ変更した対応（2026-09-05、本人指示）の
// 回帰防止テスト。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineBattleScreen.js・
// js/onlineBattleResultReturnState.jsはDOM要素の大量取得・Firebase連携を含み、
// tests.htmlのようなDOMだけのテスト環境へ安全にimportできない
// （tests/songlist.test.js等と同じ理由）。そのため、実際のファイルの中身を確認する。
import { assertEqual } from "./test-utils.js";

export async function runOnlineBattleLobbyConfirmModalsTests() {
  const htmlResponse = await fetch("index.html");
  const html = await htmlResponse.text();
  assertEqual(html.length > 1000, true, "index.htmlのソースを取得できた（前提条件）");

  // ---- ロビーのホスト移譲・キック用モーダルが、index.htmlに存在する ----
  [
    "online-battle-lobby-transfer-host-confirm-modal",
    "online-battle-lobby-transfer-host-confirm-message",
    "online-battle-lobby-transfer-host-cancel-button",
    "online-battle-lobby-transfer-host-confirm-button",
    "online-battle-lobby-kick-confirm-modal",
    "online-battle-lobby-kick-confirm-message",
    "online-battle-lobby-kick-cancel-button",
    "online-battle-lobby-kick-confirm-button",
    "online-battle-rematch-kick-confirm-modal",
    "online-battle-rematch-kick-confirm-message",
    "online-battle-rematch-kick-cancel-button",
    "online-battle-rematch-kick-confirm-button",
  ].forEach((id) => {
    assertEqual(html.includes(`id="${id}"`), true, `index.htmlに id="${id}" の要素が存在する`);
  });

  // ---- js/onlineBattleScreen.jsが、キック・ホスト移譲でwindow.confirm()を使っていない ----
  const screenResponse = await fetch("js/onlineBattleScreen.js");
  const screenSource = await screenResponse.text();
  assertEqual(screenSource.length > 1000, true, "js/onlineBattleScreen.jsのソースを取得できた（前提条件）");

  const kickBlockStart = screenSource.indexOf('const kickButton = event.target.closest("[data-kick-uid]");');
  assertEqual(kickBlockStart !== -1, true, "キックボタンのクリック判定コードが存在する");
  const kickBlock = screenSource.slice(kickBlockStart, kickBlockStart + 500);
  assertEqual(kickBlock.includes("window.confirm("), false, "キック確認にwindow.confirm()を使っていない");
  assertEqual(kickBlock.includes("lobbyKickConfirmModal.hidden = false"), true, "キック確認は独自モーダルを開く");

  const transferBlockStart = screenSource.indexOf(
    'const transferButton = event.target.closest("[data-transfer-host-uid]");'
  );
  assertEqual(transferBlockStart !== -1, true, "ホスト移譲ボタンのクリック判定コードが存在する");
  const transferBlock = screenSource.slice(transferBlockStart, transferBlockStart + 500);
  assertEqual(transferBlock.includes("window.confirm("), false, "ホスト移譲確認にwindow.confirm()を使っていない");
  assertEqual(
    transferBlock.includes("lobbyTransferHostConfirmModal.hidden = false"),
    true,
    "ホスト移譲確認は独自モーダルを開く"
  );

  // ---- キャンセル時はkickPlayer()/transferHost()を呼ばず、確定ボタンのハンドラ内だけで呼ぶ ----
  assertEqual(
    screenSource.includes("elements.lobbyKickCancelButton.addEventListener"),
    true,
    "キックのキャンセルボタンにリスナーが登録されている"
  );
  assertEqual(
    screenSource.includes("elements.lobbyTransferHostCancelButton.addEventListener"),
    true,
    "ホスト移譲のキャンセルボタンにリスナーが登録されている"
  );

  // ---- 再戦準備フェーズのキックも、window.confirm()を使っていない ----
  const rematchKickResponse = await fetch("js/onlineBattleResultReturnState.js");
  const rematchKickSource = await rematchKickResponse.text();
  assertEqual(rematchKickSource.length > 500, true, "js/onlineBattleResultReturnState.jsのソースを取得できた（前提条件）");
  assertEqual(rematchKickSource.includes("window.confirm("), false, "再戦準備フェーズのキック確認もwindow.confirm()を使っていない");
  assertEqual(
    rematchKickSource.includes("rematchKickModalElement.hidden = false"),
    true,
    "再戦準備フェーズのキック確認は独自モーダルを開く"
  );
}
