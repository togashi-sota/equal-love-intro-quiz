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
// 【修正・カウンタパターン】runTransaction()（過去の実機不具合＋players全体への
// 書き込み権限が無いため不採用）・newData.numChildren()（Firebase Realtime Database
// Security Rulesには存在しないメソッドであることを本番Consoleへの公開時のエラーで
// 過去に確認済み）のどちらも使わず、rooms/$roomId/playerCountという専用の数値
// フィールドを新設した。参加者エントリの追加/削除と必ず同じupdate()（複数パス
// 同時書き込み）の中でこの値も±1だけ更新し、Firebase Rules側のplayerCountの
// .validateが「新しい値は、サーバーが実際に保持している値からちょうど±1で、かつ
// maxPlayers以下であること」を検証する（js/onlineBattleCapacitySecurityRules.jsの
// canWritePlayerCount()がこのルールの意図を再現・fuzz検査している）。
// js/onlineBattle.jsのjoinRoom()・promoteSpectatorToPlayer()は、事前チェック通過後に
// このルールへ実際に拒否された場合（＝本物の同時参加/昇格レースに負けた場合）を
// PERMISSION_DENIEDとして個別にcatchし、最新状態を読み直して正確な理由（"full"）を
// 返すようにした。leaveRoom()・kickPlayer()も、参加者エントリの削除と同じupdate()で
// playerCountの-1を行うよう修正した。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineBattle.jsはFirebase接続を
// 直接張るため、tests.htmlへ安全にimportできない
// （tests/inviteFullRoomRegression.test.js等と同じ理由）。真の同時実行下での実際の
// capacity invariant自体は、tests/onlineBattleCapacitySecurityRules.test.jsのfuzz検査
// （300トライアル）と、本人がFirebase Consoleへルールを反映した後の実Firebase再テストで
// 別途検証する（docs/HANDOFF.md参照）。
import { assertEqual } from "./test-utils.js";

export async function runOnlineBattleCapacityRaceRegressionTests() {
  // ---- firebase/database.rules.json：playerCountフィールドのcapacity検証 ----
  {
    const response = await fetch("firebase/database.rules.json");
    const rulesText = await response.text();
    assertEqual(rulesText.length > 500, true, "firebase/database.rules.jsonを取得できた（前提条件）");
    const rules = JSON.parse(rulesText);
    const roomRules = rules.rules.rooms.$roomId;

    const playerCountRule = roomRules.playerCount;
    assertEqual(typeof playerCountRule === "object" && playerCountRule !== null, true, "rooms/$roomId/playerCountのルールが定義されている");
    assertEqual(
      typeof playerCountRule[".validate"] === "string" &&
        playerCountRule[".validate"].includes("maxPlayers") &&
        playerCountRule[".validate"].includes("data.val() + 1") &&
        playerCountRule[".validate"].includes("data.val() - 1"),
      true,
      "playerCountの.validateが、±1のcompare-and-swapとmaxPlayers上限の両方を検証している"
    );
    // numChildren()はFirebase Realtime Database Security Rulesに実在しないメソッドの
    // ため、リポジトリ内のどのルールにも使われていないことを確認する（再発防止）。
    assertEqual(rulesText.includes("numChildren"), false, "firebase/database.rules.jsonにnumChildren()（実在しないメソッド）が使われていない");

    // ルーム作成時のバリデーションが、playerCount:1を必須にしている。
    const createValidation = roomRules[".write"];
    assertEqual(
      typeof createValidation === "string" && createValidation.includes("newData.child('playerCount').val() === 1"),
      true,
      "ルーム作成時のバリデーションがplayerCount:1を必須にしている"
    );
  }

  // ---- js/onlineBattle.js：joinRoom()・promoteSpectatorToPlayer()がplayerCountを扱っている ----
  {
    const response = await fetch("js/onlineBattle.js");
    const source = await response.text();
    assertEqual(source.length > 500, true, "js/onlineBattle.jsのソースを取得できた（前提条件）");

    const joinStart = source.indexOf("export async function joinRoom({ roomId, playerName }) {");
    assertEqual(joinStart !== -1, true, "joinRoom()が存在する（前提条件）");
    const joinBody = source.slice(joinStart, joinStart + 3200);
    assertEqual(
      joinBody.includes("currentPlayerCount: room?.playerCount") &&
        joinBody.includes('error?.code === "PERMISSION_DENIED"') &&
        joinBody.includes("checkCapacity(retryRoom, uid)"),
      true,
      "joinRoom()がreservePlayerSlot()へcurrentPlayerCountを渡し、定員超過レースに負けた場合のPERMISSION_DENIEDを検知して再チェックできる"
    );

    const reserveStart = source.indexOf("async function reservePlayerSlot({ roomId, uid, playerName, alreadyJoined, currentPlayerCount }) {");
    assertEqual(reserveStart !== -1, true, "reservePlayerSlot()がcurrentPlayerCountを受け取るようになっている");
    const reserveBody = source.slice(reserveStart, reserveStart + 1600);
    assertEqual(
      reserveBody.includes("[`rooms/${roomId}/playerCount`]: currentPlayerCount + 1"),
      true,
      "reservePlayerSlot()の新規参加時に、players/{uid}の作成と同じupdate()でplayerCountを+1している"
    );

    const promoteStart = source.indexOf("export async function promoteSpectatorToPlayer({ roomId, playerName }) {");
    assertEqual(promoteStart !== -1, true, "promoteSpectatorToPlayer()が存在する（前提条件）");
    const promoteBody = source.slice(promoteStart, promoteStart + 3300);
    assertEqual(
      promoteBody.includes("[`rooms/${roomId}/playerCount`]: room.playerCount + 1") &&
        promoteBody.includes('error?.code === "PERMISSION_DENIED"'),
      true,
      "promoteSpectatorToPlayer()が新規昇格時にplayerCountを+1し、定員超過レースに負けた場合のPERMISSION_DENIEDを検知できる"
    );

    const kickStart = source.indexOf("export async function kickPlayer({ roomId, targetUid }) {");
    assertEqual(kickStart !== -1, true, "kickPlayer()が存在する（前提条件）");
    const kickBody = source.slice(kickStart, kickStart + 2200);
    assertEqual(
      kickBody.includes("[`rooms/${roomId}/playerCount`]: room.playerCount - 1"),
      true,
      "kickPlayer()がキック時にplayerCountを-1している"
    );

    const leaveStart = source.indexOf("export async function leaveRoom({ roomId }) {");
    assertEqual(leaveStart !== -1, true, "leaveRoom()が存在する（前提条件）");
    const leaveBody = source.slice(leaveStart, leaveStart + 4300);
    assertEqual(
      (leaveBody.match(/\[`rooms\/\$\{roomId\}\/playerCount`\]: room\.playerCount - 1/g) || []).length >= 2,
      true,
      "leaveRoom()の複数の退出経路（ホスト移譲・非ホスト退出）がplayerCountを-1している"
    );

    const createStart = source.indexOf("export async function createRoom({ playerName, maxPlayers, gameMode = DEFAULT_GAME_MODE }) {");
    assertEqual(createStart !== -1, true, "createRoom()が存在する（前提条件）");
    const createBody = source.slice(createStart, createStart + 1200);
    assertEqual(createBody.includes("playerCount: 1"), true, "createRoom()がルーム作成時にplayerCount:1を書き込んでいる");
  }
}
