// js/battleRules/index.js（勝敗ルール登録簿）のテスト。
// 3ルールが正しく登録され、ruleId経由の窓口関数が正しく委譲・null安全に動くかを確認する。

import * as battleRules from "../../js/battleRules/index.js";
import { assertEqual } from "../test-utils.js";

export function runBattleRulesIndexTests() {
  // ===== 登録内容の確認 =====
  {
    const rules = battleRules.listAvailableBattleRules();
    assertEqual(rules.length, 3, "3ルール（正解数バトル・早押しバトル・ポイントバトル）が登録されている");
    assertEqual(
      rules.map((rule) => rule.ruleId).sort(),
      ["classic", "combo", "steal"],
      "登録されているruleIdが期待どおり"
    );
    assertEqual(battleRules.isKnownBattleRule("classic"), true, "classicは既知のルール");
    assertEqual(battleRules.isKnownBattleRule("unknown-rule"), false, "未登録のruleIdはfalse");
  }

  // ===== getBattleRule / null安全性 =====
  {
    assertEqual(battleRules.getBattleRule("unknown-rule"), null, "未登録のruleIdはnullを返す");
    assertEqual(battleRules.createDefaultBattleRuleSettings("unknown-rule"), null, "未登録なら初期設定もnull");
    assertEqual(
      battleRules.validateBattleRule("unknown-rule", {}),
      "対戦ルールが不正です。",
      "未登録のruleIdはエラー文言を返す（例外を投げない）"
    );
    assertEqual(battleRules.resolveQuestionAnswers("unknown-rule", {}), {}, "未登録なら空オブジェクトを返す");
    assertEqual(battleRules.shouldEndQuestion("unknown-rule", {}), false, "未登録ならfalseを返す（安全側）");
    assertEqual(battleRules.aggregateResult("unknown-rule", [], {}), null, "未登録ならnullを返す");
    assertEqual(battleRules.compareBattleRuleResults("unknown-rule", {}, {}, {}), 0, "未登録なら0（同順位扱い）を返す");
    assertEqual(battleRules.getBattleRuleLabel("unknown-rule"), "unknown-rule", "未登録ならruleIdそのものを返す");
    assertEqual(battleRules.getAllowedAnswerPoolSizes("unknown-rule"), [], "未登録なら空配列を返す");
    assertEqual(
      battleRules.getAnswerSubmissionPlan("unknown-rule", {}),
      { submitAnswer: true, submitWinnerClaim: false },
      "未登録のruleIdでも安全側のデフォルト（回答ログのみ）を返す"
    );
    assertEqual(battleRules.getComboMultiplierForCount("unknown-rule", 3), null, "未登録ならnullを返す");
  }

  // ===== 正しいruleIdでの委譲確認 =====
  {
    const settings = battleRules.createDefaultBattleRuleSettings("classic");
    assertEqual(battleRules.validateBattleRule("classic", settings), null, "classicの初期設定は妥当な設定になっている");
    assertEqual(battleRules.getBattleRuleLabel("steal"), "早押しバトル", "getBattleRuleLabelがstealRuleへ正しく委譲される");
    assertEqual(battleRules.getAllowedAnswerPoolSizes("steal"), [4, 10], "早押しバトルの回答方式制限が正しく取り出せる");
  }

  // ===== getAnswerSubmissionPlan / getComboMultiplierForCount（Phase6.5新設） =====
  {
    assertEqual(
      battleRules.getAnswerSubmissionPlan("steal", { selectedSongId: "song-1", correctSongId: "song-1" }),
      { submitAnswer: true, submitWinnerClaim: true },
      "stealへ正しく委譲され、正解ならsubmitWinnerClaim:trueになる"
    );
    assertEqual(
      battleRules.getAnswerSubmissionPlan("classic", { selectedSongId: "song-1", correctSongId: "song-1" }),
      { submitAnswer: true, submitWinnerClaim: false },
      "classicへ正しく委譲され、常にsubmitWinnerClaim:falseになる"
    );
    // 【2026-08-31改訂】ポイントバトル（旧コンボ）からコンボ倍率の概念を撤廃したため、
    // comboRule.getComboMultiplierForCount()は常にnullを返すようになった。
    assertEqual(battleRules.getComboMultiplierForCount("combo", 3), null, "コンボ倍率の概念を撤廃したため、comboへ委譲されても常にnull");
    assertEqual(battleRules.getComboMultiplierForCount("classic", 3), null, "getComboMultiplierForCountを持たないルールはnullを返す");
  }
}
