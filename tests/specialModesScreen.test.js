// specialModesScreen.js（特別モード一覧・ホーム画面8カード）のテスト。
// DOM操作（カード生成）はブラウザでの実機確認に任せ、ここではデータの整合性だけを
// 純粋にチェックする。HOME_SPECIAL_MODES_ORDER（ホーム画面の並び順）が、
// SPECIAL_MODES（唯一の情報源）と食い違っていないことを保証する回帰テスト。

import { SPECIAL_MODES, HOME_SPECIAL_MODES_ORDER } from "../js/specialModesScreen.js";
import { assertEqual } from "./test-utils.js";

export function runSpecialModesScreenTests() {
  const specialModeIds = SPECIAL_MODES.map((mode) => mode.id);

  // ---- ホーム画面には必ず8件並べる（2列×4段の指定を満たすため） ----
  assertEqual(HOME_SPECIAL_MODES_ORDER.length, 8, "ホーム画面の特別モードはちょうど8件");

  // ---- 重複がないこと（同じモードが2度表示されるのを防ぐ） ----
  const uniqueIds = new Set(HOME_SPECIAL_MODES_ORDER);
  assertEqual(uniqueIds.size, HOME_SPECIAL_MODES_ORDER.length, "ホーム画面の並び順に重複がない");

  // ---- HOME_SPECIAL_MODES_ORDERの各idが、SPECIAL_MODESに実在すること
  //      （タイプミス等で存在しないidを指定していないかの回帰チェック） ----
  HOME_SPECIAL_MODES_ORDER.forEach((modeId) => {
    assertEqual(specialModeIds.includes(modeId), true, `HOME_SPECIAL_MODES_ORDERの"${modeId}"はSPECIAL_MODESに存在する`);
  });

  // ---- 本人指定の並び順どおりであること ----
  assertEqual(
    HOME_SPECIAL_MODES_ORDER.join(","),
    ["randomPlayback", "lyricsQuiz", "timeAttack", "onlineBattle", "originalQuiz", "liveCallMode", "weakSongs", "localBattle"].join(","),
    "ホーム画面の並び順が指定通り（1段目:ランダム再生クイズ/歌詞クイズ、2段目:タイムアタック/オンライン対戦、3段目:オリジナル問題作成モード/ライブコールモード、4段目:苦手曲モード/対戦モード）"
  );
}
