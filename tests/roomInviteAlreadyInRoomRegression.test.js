// 「既に別のルームに参加中でも、ルーム招待バナーの『参加する』を押せてしまう」不具合の
// 回帰防止テスト（2026-09-06、長時間耐久検証中の「真の同時実行」テストで発見）。
//
// 【発見の経緯】js/presencePayloads.jsのcanShowInviteNotification()は「出題・回答中の
// 画面でなければ表示してよい」という基準のため、既に別ルームのロビーで待機中でも
// ルーム招待バナーは表示され得る。この状態でjs/roomInviteUi.jsのhandleAcceptClick()には
// 「今どこかのルームに参加中か」という確認が無く、そのまま新しいルームへ参加できてしまう。
// joinRoomFromInvite()は新しいルームへは正しく参加させる一方、元居たルームからは何も
// 退出処理を行わないため、元のルームには「本人はもう居ないのにconnected:trueのまま」の
// 幽霊プレイヤーが永続的に残ってしまうことを、実Firebase（生SDKで2つのルームを直接操作）で
// 実際に再現・確認した。
//
// 【修正】js/playInviteUi.js（「一緒に遊ぶ」招待）には既に全く同じ状況を防ぐ確認
// （getCurrentOnlineRoomId() !== nullなら「現在ルームに参加中です。先にルームから
// 退出してください。」と表示して中断する）が実装済みだったため、js/roomInviteUi.jsの
// handleAcceptClick()の先頭にも同じ確認・同じ文言を追加して揃えた。
//
// 【なぜソーステキストの構造チェックなのか】js/roomInviteUi.jsはFirebase接続・DOM要素の
// 大量取得を伴い、tests.htmlのようなテスト環境へ安全にimportできない
// （tests/inviteFullRoomRegression.test.js等と同じ理由）。
import { assertEqual } from "./test-utils.js";

export async function runRoomInviteAlreadyInRoomRegressionTests() {
  const response = await fetch("js/roomInviteUi.js");
  const source = await response.text();
  assertEqual(source.length > 500, true, "js/roomInviteUi.jsのソースを取得できた（前提条件）");

  assertEqual(
    source.includes('import { joinRoomFromInvite, getCurrentOnlineRoomPlayerUids, getCurrentOnlineRoomId } from "./onlineBattleScreen.js";'),
    true,
    "getCurrentOnlineRoomId()をjs/onlineBattleScreen.jsからimportしている"
  );

  const fnStart = source.indexOf("async function handleAcceptClick() {");
  assertEqual(fnStart !== -1, true, "handleAcceptClick()が存在する（前提条件）");
  const fnBody = source.slice(fnStart, fnStart + 900);

  assertEqual(
    fnBody.includes("getCurrentOnlineRoomId() !== null"),
    true,
    "handleAcceptClick()が「既にどこかのルームに参加中か」を確認している"
  );
  assertEqual(
    fnBody.includes("現在ルームに参加中です。先にルームから退出してください。"),
    true,
    "既に参加中の場合、js/playInviteUi.jsと同じ文言で案内している"
  );

  // 「既にルーム参加中」の分岐の中でだけjoinRoomFromInvite()を呼んでいない
  // （＝ガードで早期returnし、実際の参加処理へは進まない）ことを確認する。
  // 【波括弧の対応を正しく数える】ガード内部にelements.bannerErrorのif文が入れ子に
  // なっているため、最初に現れる"}"だけを終端とみなす単純な実装では内側のif文で
  // 止まってしまう（実際にこれで誤検知した）。深さを数えて、外側のif文に対応する
  // "}"まで正しく辿る。
  const guardStart = fnBody.indexOf("getCurrentOnlineRoomId() !== null");
  const guardOpenBrace = fnBody.indexOf("{", guardStart);
  let depth = 0;
  let guardCloseBrace = -1;
  for (let i = guardOpenBrace; i < fnBody.length; i++) {
    if (fnBody[i] === "{") depth++;
    if (fnBody[i] === "}") {
      depth--;
      if (depth === 0) { guardCloseBrace = i; break; }
    }
  }
  const guardBody = fnBody.slice(guardOpenBrace, guardCloseBrace);
  assertEqual(
    guardBody.includes("return"),
    true,
    "既にルーム参加中の場合はガード内でreturnし、参加処理まで進まない"
  );
  assertEqual(
    guardBody.includes("joinRoomFromInvite"),
    false,
    "既にルーム参加中の場合はjoinRoomFromInvite()を呼ばない"
  );
}
