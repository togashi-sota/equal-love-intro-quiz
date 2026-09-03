// js/achievementIcons.jsの恒久テスト。
//
// 【2026-11-XX新設・本人指示：称号マーク未設定の再発防止】実機で「一瞬マスター・
// アウトロマスターにマークが無い」と報告された不具合の根本原因は、outro_master・
// instant_master・complete_finale・instant_flash_answerの4件がICON_DEFINITIONSに
// 項目自体無く、空のメダル（アイコン無し）として表示されていたことだった。
// css/style.cssの色指定（.is-outro_master等）は既に存在していたため見た目上は
// 「色は付くが中身が空」という気付きにくい状態になっていた。
// 「js/achievementDefinitions.jsに定義された全称号のiconKeyが、必ずICON_DEFINITIONSに
// 存在する」ことを機械的に確認し、今後同じ抜けが起きても自動テストで即座に発覚するようにする。
import { ACHIEVEMENTS } from "../js/achievementDefinitions.js";
import { hasIconDefinition, buildAchievementIconMedal } from "../js/achievementIcons.js";
import { assertEqual } from "./test-utils.js";

export function runAchievementIconsTests() {
  ACHIEVEMENTS.forEach((achievement) => {
    assertEqual(
      hasIconDefinition(achievement.iconKey),
      true,
      `称号「${achievement.name}」（iconKey: ${achievement.iconKey}）にアイコン定義が存在する`
    );
  });

  // 定義が存在するiconKeyは、実際に中身のあるSVGを含むメダルを組み立てられることも確認する
  // （hasIconDefinitionがtrueなのにbuildAchievementIconMedal()が空を返す、という食い違いを防ぐ）。
  ACHIEVEMENTS.forEach((achievement) => {
    const medal = buildAchievementIconMedal(achievement.iconKey);
    assertEqual(
      medal.querySelector("svg") !== null,
      true,
      `称号「${achievement.name}」のメダルには実際にSVGが描画される（空のメダルにならない）`
    );
  });
}
