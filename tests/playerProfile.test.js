// js/playerProfile.js のテスト（2026-08-29新設、backupId関連の機能追加にあわせて作成）。
// 複数プレイヤーの基本的な一覧管理は今まで専用テストが無かったため、
// クラウドバックアップ機能に関わる部分（backupId・復元時のプレイヤー情報更新）を中心に、
// 併せて基本的な入出力も確認する。

import {
  getPlayers,
  getActivePlayerId,
  setActivePlayerId,
  addPlayer,
  deletePlayer,
  DEFAULT_PLAYER_ID,
  getOrCreateBackupId,
  getBackupId,
  applyRestoredPlayerInfo,
} from "../js/playerProfile.js";
import { assertEqual } from "./test-utils.js";

export function runPlayerProfileTests() {
  setActivePlayerId(DEFAULT_PLAYER_ID);

  // ---- getOrCreateBackupId：初回は新しく発行し、以後は同じ値を返す ----
  const firstCall = getOrCreateBackupId(DEFAULT_PLAYER_ID);
  assertEqual(typeof firstCall, "string", "backupIdが文字列として発行される");
  assertEqual(firstCall.length > 0, true, "発行されたbackupIdは空文字列ではない");

  const secondCall = getOrCreateBackupId(DEFAULT_PLAYER_ID);
  assertEqual(secondCall, firstCall, "2回目の呼び出しでは、新しく発行し直さず同じbackupIdを返す");

  assertEqual(getBackupId(DEFAULT_PLAYER_ID), firstCall, "getBackupId()でも同じ値が確認できる");

  // ---- getOrCreateBackupId：存在しないplayerIdにはnullを返す（発行しない） ----
  assertEqual(getOrCreateBackupId("this-player-id-does-not-exist"), null, "存在しないplayerIdにはnullを返す");
  assertEqual(getBackupId("this-player-id-does-not-exist"), null, "getBackupId()も同様にnullを返す");

  // ---- 2人目のプレイヤーは、1人目とは別のbackupIdを持つ ----
  const secondPlayer = addPlayer("テスト用2人目");
  const secondPlayerBackupId = getOrCreateBackupId(secondPlayer.playerId);
  assertEqual(secondPlayerBackupId !== firstCall, true, "2人目のプレイヤーのbackupIdは1人目と異なる");

  // ---- applyRestoredPlayerInfo：backupId・表示名を更新できる ----
  applyRestoredPlayerInfo(secondPlayer.playerId, { backupId: "restored-backup-id-123", playerName: "復元後の名前" });
  const afterRestore = getPlayers().find((p) => p.playerId === secondPlayer.playerId);
  assertEqual(afterRestore.backupId, "restored-backup-id-123", "backupIdが指定した値に上書きされる");
  assertEqual(afterRestore.playerName, "復元後の名前", "表示名も指定した値に上書きされる");

  // ---- applyRestoredPlayerInfo：playerNameを渡さない場合は既存の名前を維持する ----
  applyRestoredPlayerInfo(secondPlayer.playerId, { backupId: "another-backup-id" });
  const afterSecondRestore = getPlayers().find((p) => p.playerId === secondPlayer.playerId);
  assertEqual(afterSecondRestore.playerName, "復元後の名前", "playerNameを省略した場合、既存の名前は変わらない");
  assertEqual(afterSecondRestore.backupId, "another-backup-id", "backupIdだけが更新される");

  // ---- 後片付け ----
  deletePlayer(secondPlayer.playerId);
  assertEqual(
    getPlayers().some((p) => p.playerId === secondPlayer.playerId),
    false,
    "テスト用に追加したプレイヤーを削除できる（後片付け）"
  );
  setActivePlayerId(DEFAULT_PLAYER_ID);
}
