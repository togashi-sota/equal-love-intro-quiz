// ルーム参加・観戦者昇格の定員超過レースの回帰防止テスト（2026-09-06、長時間耐久検証中の
// 「真の同時実行」テストで発見・本人指示による最優先修正）。
//
// 【発見された不具合】js/onlineBattle.jsのjoinRoom()・promoteSpectatorToPlayer()は
// 「読む→現在の人数を確認→自分の枠だけ書く」というトランザクション無しの方式で、
// 定員チェックをクライアント側のJavaScriptだけで行っていた。複数のclientが真に
// 同時に参加・昇格を試みると、全員が同じ「まだ空きがある」という古い読み取り結果を
// 見てしまい、定員を超えて全員参加できてしまうことを実機（独立したFirebase匿名
// クライアント・Promise.all()による本物の同時書き込み）で確認した：
//   ・2人部屋の残り1枠に2人が真に同時参加 → 4/4回とも3人になる
//   ・5人部屋の残り4枠に8人が真に同時参加 → 最終9人になる
//   ・5人部屋（残り1枠）に観戦者4人が真に同時昇格 → 最終5人になる
//
// 【修正】firebase/database.rules.jsonのrooms/$roomId/players/$uidの.validateへ、
// 「新規追加のときだけ、書き込み後の人数がmaxPlayersを超えないこと」という
// root参照ベースの原子的な検証を追加した（js/onlineBattleCapacitySecurityRules.jsの
// canWritePlayerSlot()がこのルールの意図を再現・fuzz検査している）。
// js/onlineBattle.jsのjoinRoom()・promoteSpectatorToPlayer()は、事前チェック通過後に
// このルールへ実際に拒否された場合（＝本物の同時参加/昇格レースに負けた場合）を
// PERMISSION_DENIEDとして個別にcatchし、最新状態を読み直して正確な理由（"full"）を
// 返すようにした。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineBattle.jsはFirebase接続を
// 直接張るため、tests.htmlへ安全にimportできない
// （tests/inviteFullRoomRegression.test.js等と同じ理由）。真の同時実行下での実際の
// capacity invariant自体は、tests/onlineBattleCapacitySecurityRules.test.jsのfuzz検査
// （300トライアル）と、本セッション中に実施した実Firebaseでの再テストで別途検証済み
// （docs/HANDOFF.md参照）。
import { assertEqual } from "./test-utils.js";

export async function runOnlineBattleCapacityRaceRegressionTests() {
  // ---- firebase/database.rules.json：players/$uidのcapacity検証 ----
  {
    const response = await fetch("firebase/database.rules.json");
    const rulesText = await response.text();
    assertEqual(rulesText.length > 500, true, "firebase/database.rules.jsonを取得できた（前提条件）");
    const rules = JSON.parse(rulesText);
    const playerUidValidate = rules.rules.rooms.$roomId.players.$uid[".validate"];
    assertEqual(
      typeof playerUidValidate === "string" && playerUidValidate.includes("numChildren()") && playerUidValidate.includes("maxPlayers"),
      true,
      "rooms/$roomId/players/$uidの.validateに、人数(numChildren)とmaxPlayersを比較する定員検証が含まれている"
    );
  }

  // ---- js/onlineBattle.js：joinRoom()がPERMISSION_DENIEDを個別にcatchしている ----
  {
    const response = await fetch("js/onlineBattle.js");
    const source = await response.text();
    assertEqual(source.length > 500, true, "js/onlineBattle.jsのソースを取得できた（前提条件）");

    const joinStart = source.indexOf("export async function joinRoom({ roomId, playerName }) {");
    assertEqual(joinStart !== -1, true, "joinRoom()が存在する（前提条件）");
    const joinBody = source.slice(joinStart, joinStart + 3000);
    assertEqual(
      joinBody.includes('error?.code === "PERMISSION_DENIED"') &&
        joinBody.includes("checkCapacity(retryRoom, uid)") &&
        joinBody.includes("retryCapacity.reason"),
      true,
      "joinRoom()が、定員超過レースに負けた場合のPERMISSION_DENIEDを検知し、最新状態を読み直して正確な理由（reason:\"full\"を含む）を返せる"
    );

    const promoteStart = source.indexOf("export async function promoteSpectatorToPlayer({ roomId, playerName }) {");
    assertEqual(promoteStart !== -1, true, "promoteSpectatorToPlayer()が存在する（前提条件）");
    const promoteBody = source.slice(promoteStart, promoteStart + 2600);
    assertEqual(
      promoteBody.includes('error?.code === "PERMISSION_DENIED"') && promoteBody.includes('reason: "full"'),
      true,
      "promoteSpectatorToPlayer()が、定員超過レースに負けた場合のPERMISSION_DENIEDを検知し、再チェックしてreason:\"full\"を返せる"
    );
  }
}
