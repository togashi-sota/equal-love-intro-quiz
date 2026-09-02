// js/onlineBattleRulesContent.js（オンライン対戦「📖 ルール・遊び方」画面の詳細説明）の
// 再発防止テスト（2026-11-XX新設・本人指示：優先度3）。
//
// 【目的】新しい対戦モード・新しい歌詞クイズルールが追加されたときに、この説明ファイルの
// 更新を忘れて「実装には存在するのに説明が無いモード／ルール」が生まれることを防ぐ。
// 本文の日本語の正しさそのものはテストできないため、あくまで構造（キーの対応・
// 空文字列が無いか）だけを機械的に確認する。

import { ONLINE_BATTLE_MODE_GUIDES } from "../js/onlineBattleRulesContent.js";
import { listAvailableGameModes } from "../js/battleModes/index.js";
import { RULE_REGISTRY } from "../js/battleRules/index.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleRulesContentTests() {
  const availableGameModes = listAvailableGameModes().map((mode) => mode.gameMode).sort();
  const guideGameModes = Object.keys(ONLINE_BATTLE_MODE_GUIDES).sort();

  assertEqual(
    guideGameModes,
    availableGameModes,
    "ONLINE_BATTLE_MODE_GUIDESのキーは、実際に登録されている対戦モード一覧と完全に一致する（説明が無いモード・存在しないモードの説明が無いことを保証する）"
  );

  Object.entries(ONLINE_BATTLE_MODE_GUIDES).forEach(([gameMode, guide]) => {
    assertEqual(Array.isArray(guide.sections) && guide.sections.length > 0, true, `${gameMode}：sectionsが1件以上ある`);
    guide.sections.forEach((section, index) => {
      assertEqual(
        typeof section.heading === "string" && section.heading.trim().length > 0,
        true,
        `${gameMode}のsections[${index}]：headingが空でない`
      );
      assertEqual(
        typeof section.body === "string" && section.body.trim().length > 0,
        true,
        `${gameMode}のsections[${index}]：bodyが空でない`
      );
    });
  });

  // 歌詞クイズ対戦だけ、実際に登録されている3ルール（正解数/早押し/ポイントバトル）分の
  // ruleSectionsを、過不足なく持っていることを確認する。
  const lyricsQuizGuide = ONLINE_BATTLE_MODE_GUIDES.lyricsQuiz;
  assertEqual(Array.isArray(lyricsQuizGuide.ruleSections), true, "歌詞クイズ対戦：ruleSectionsを持つ");

  const registeredRuleIds = Object.keys(RULE_REGISTRY).sort();
  const guideRuleIds = lyricsQuizGuide.ruleSections.map((rule) => rule.ruleId).sort();
  assertEqual(
    guideRuleIds,
    registeredRuleIds,
    "歌詞クイズ対戦のruleSectionsは、実際に登録されている3ルールと完全に一致する"
  );

  lyricsQuizGuide.ruleSections.forEach((rule) => {
    assertEqual(
      typeof rule.label === "string" && rule.label.trim().length > 0,
      true,
      `ruleSections[${rule.ruleId}]：labelが空でない`
    );
    assertEqual(Array.isArray(rule.sections) && rule.sections.length > 0, true, `ruleSections[${rule.ruleId}]：sectionsが1件以上ある`);
  });

  // 他の5モードはruleSectionsを持たない（歌詞クイズ対戦だけの特別な構造であることを明示する）。
  Object.entries(ONLINE_BATTLE_MODE_GUIDES).forEach(([gameMode, guide]) => {
    if (gameMode === "lyricsQuiz") return;
    assertEqual(guide.ruleSections, undefined, `${gameMode}：ruleSectionsを持たない（歌詞クイズ対戦専用の構造のため）`);
  });
}
