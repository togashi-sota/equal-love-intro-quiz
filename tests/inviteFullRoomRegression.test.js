// 満員のルームへ招待から参加しようとした場合の不具合の回帰防止テスト（2026-09-06、
// 本人の実機報告：3人でのオンライン対戦テスト中に発見）。
//
// 【症状】最大2人のルームが既に2/2人で満員の状態で3人目へ招待を送ると、3人目は
// 通常どおり招待を受け取り「参加する」を押せてしまうが、実際には参加できない
// （js/onlineBattle.jsのjoinRoom()がreason:"full"を返す）。この失敗が本人へ一切
// 伝わらないまま、招待だけが消費済み扱いになって消えてしまい、「参加するを押したのに
// 何も起きない」というバグにしか見えない状態だった。
//
// 【原因・修正】
// ・js/roomInviteUi.js（既存ルームへの招待）：joinRoomFromInvite()の戻り値は確認して
//   いたが、成否によらず無条件に招待を削除しており、失敗理由も一律の文言だった。
//   reason:"full"のときだけ招待を削除せず残す（5分の有効期限内は再挑戦できる）よう修正し、
//   「ルームが満員です」と分かる専用の文言を追加した。
// ・js/playInviteUi.js（「一緒に遊ぶ」の1対1招待）：joinRoomFromInvite()の戻り値を
//   一切確認せず、成功・失敗どちらでも無条件に招待を削除し、失敗時は何も表示していなかった
//   （実質的に完全にサイレントな失敗）。roomInviteUi.jsと同じ方針（reason:"full"は
//   残す・専用文言を出す）に揃えた。
//
// 【なぜソーステキストの構造チェックなのか】js/roomInviteUi.js・js/playInviteUi.jsは
// Firebase接続・DOM要素の大量取得を伴い、tests.htmlのようなテスト環境へ安全にimport
// できない（tests/questionSourceModeLeakage.test.js等と同じ理由）。
import { assertEqual } from "./test-utils.js";

export async function runInviteFullRoomRegressionTests() {
  // ---- js/roomInviteUi.js：満員のときは招待を消費せず、専用文言を出す ----
  {
    const response = await fetch("js/roomInviteUi.js");
    const source = await response.text();
    assertEqual(source.length > 500, true, "js/roomInviteUi.jsのソースを取得できた（前提条件）");

    const fnStart = source.indexOf("async function handleAcceptClick() {");
    assertEqual(fnStart !== -1, true, "handleAcceptClick()が存在する（前提条件）");
    const fnBody = source.slice(fnStart, fnStart + 1600);

    assertEqual(
      fnBody.includes('result.reason === "full"'),
      true,
      "handleAcceptClick()が参加失敗の理由が「full」（満員）かどうかを判定している"
    );
    assertEqual(
      fnBody.includes("ルームが満員です"),
      true,
      "満員だった場合、「ルームが満員です」と分かる専用の案内文を表示する"
    );

    // 「reason === "full"」の分岐の中でだけremoveMyInvite()を呼んでいない
    // （＝満員以外の失敗・成功時は今までどおり削除する）ことを、
    // 分岐ブロックの範囲だけを切り出して確認する。
    const fullBranchStart = fnBody.indexOf('result.reason === "full"');
    const fullBranchOpenBrace = fnBody.indexOf("{", fullBranchStart);
    const fullBranchCloseBrace = fnBody.indexOf("}", fullBranchOpenBrace);
    const fullBranchBody = fnBody.slice(fullBranchOpenBrace, fullBranchCloseBrace);
    assertEqual(
      fullBranchBody.includes("removeMyInvite"),
      false,
      "満員（reason:\"full\"）のときは招待を削除しない（5分の有効期限内なら再挑戦できるようにするため）"
    );
  }

  // ---- js/playInviteUi.js：join結果を確認し、満員時は消費せず専用文言を出す ----
  {
    const response = await fetch("js/playInviteUi.js");
    const source = await response.text();
    assertEqual(source.length > 500, true, "js/playInviteUi.jsのソースを取得できた（前提条件）");

    const fnStart = source.indexOf("async function handleIncomingInvitesUpdate(rawValue) {");
    assertEqual(fnStart !== -1, true, "handleIncomingInvitesUpdate()が存在する（前提条件）");
    const fnBody = source.slice(fnStart, fnStart + 2200);

    assertEqual(
      fnBody.includes("const result = await joinRoomFromInvite({ roomId, playerName });"),
      true,
      "handleIncomingInvitesUpdate()がjoinRoomFromInvite()の戻り値を変数として受け取っている（以前は戻り値を一切確認していなかった）"
    );
    assertEqual(
      fnBody.includes('result.reason === "full"') && fnBody.includes("ルームが満員です"),
      true,
      "満員だった場合、招待を残したまま「ルームが満員です」と分かる専用の案内文を表示する"
    );
    assertEqual(
      fnBody.includes("if (result.ok) {"),
      true,
      "参加が成功した場合だけ招待を削除する分岐が存在する（成否によらず無条件に削除していた以前の実装からの変更）"
    );
  }
}
