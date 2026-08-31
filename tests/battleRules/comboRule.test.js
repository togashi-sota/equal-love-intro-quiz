// js/battleRules/comboRule.js（歌詞クイズ対戦・ポイントバトル。旧名：コンボ）のテスト。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値だけでテストする。
//
// 【2026-08-31改訂・本人指示による3ルール全面見直し】コンボ（連続正解による倍率）の概念を
// 撤廃し、「開いたヒント段階が早いほど高得点」の固定配点制（4/3/2/1pt）へ変更したことに
// 合わせて全面的に書き直した。

import * as comboRule from "../../js/battleRules/comboRule.js";
import { assertEqual } from "../test-utils.js";

function buildOutcome(overrides) {
  return { outcome: "correct", hintLevel: 1, responseMs: 1000, pointsAwarded: 4, nextComboCount: 0, ...overrides };
}

export function runComboRuleTests() {
  // ===== resolveQuestionAnswers：ヒント段階別の固定配点（4/3/2/1pt） =====
  {
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 }, // ヒント1で正解=4pt
      p2: { selectedSongId: "song-1", hintLevel: 2, submittedAt: 2000 }, // ヒント2で正解=3pt
      p3: { selectedSongId: "song-1", hintLevel: 3, submittedAt: 3000 }, // ヒント3で正解=2pt
      p4: { selectedSongId: "song-1", hintLevel: 4, submittedAt: 4000 }, // ヒント4で正解=1pt
      p5: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 5000 }, // 不正解=0pt
    };
    const result = comboRule.resolveQuestionAnswers({ answersByUid, correctSongId: "song-1", questionStartedAt: 0 });
    assertEqual(result.p1.pointsAwarded, 4, "ヒント1正解は4pt");
    assertEqual(result.p2.pointsAwarded, 3, "ヒント2正解は3pt");
    assertEqual(result.p3.pointsAwarded, 2, "ヒント3正解は2pt");
    assertEqual(result.p4.pointsAwarded, 1, "ヒント4正解は1pt");
    assertEqual(result.p5.pointsAwarded, 0, "不正解は0pt");
    assertEqual(result.p1.nextComboCount, 0, "コンボの概念を撤廃したため常に0");
    assertEqual(result.p1.wonQuestion, false, "ポイントバトルにwonQuestionの概念は無く常にfalse");
  }

  // ===== 不正解・わからないでも、それまでのポイントは減らない（加算のみ） =====
  // resolveQuestionAnswers自体は1問分の結果しか返さないため、「減点しない」ことは
  // aggregateResult側（複数問の合計）で確認する。
  {
    const questionOutcomes = [
      buildOutcome({ hintLevel: 1, pointsAwarded: 4, outcome: "correct" }),
      buildOutcome({ hintLevel: 2, pointsAwarded: 3, outcome: "correct" }),
      buildOutcome({ hintLevel: 4, pointsAwarded: 0, outcome: "wrongAnswer" }), // 不正解でもポイントは減らない
    ];
    const result = comboRule.aggregateResult(questionOutcomes);
    assertEqual(result.detail.totalPoints, 7, "1問目+4・2問目+3・3問目不正解(+0)で合計7pt（減点は発生しない）");
  }

  // ===== shouldEndQuestion：正解数バトルと同じ終了条件（固定タイムアウトは撤廃） =====
  {
    const allPlayerUids = ["p1", "p2"];
    assertEqual(
      comboRule.shouldEndQuestion({
        answersByUid: {
          p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
          p2: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
        },
        allPlayerUids,
      }),
      true,
      "全員回答済みなら終了する"
    );
    assertEqual(
      comboRule.shouldEndQuestion({
        answersByUid: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 } },
        allPlayerUids,
      }),
      false,
      "未回答者がいれば、経過時間に関わらず継続する（2026-09-06・本人指示で固定タイムアウトを撤廃）"
    );
  }

  // ===== aggregateResult：合計・参考情報の各項目（コンボ集計は撤廃） =====
  {
    const questionOutcomes = [
      buildOutcome({ pointsAwarded: 4, hintLevel: 1, responseMs: 500, outcome: "correct" }),
      buildOutcome({ pointsAwarded: 3, hintLevel: 2, responseMs: 600, outcome: "correct" }),
      buildOutcome({ pointsAwarded: 0, hintLevel: 4, responseMs: 800, outcome: "wrongAnswer" }),
      buildOutcome({ pointsAwarded: 0, hintLevel: 4, responseMs: 0, outcome: "skipped" }),
      buildOutcome({ pointsAwarded: 4, hintLevel: 1, responseMs: 900, outcome: "correct" }),
    ];
    const result = comboRule.aggregateResult(questionOutcomes);
    assertEqual(result.detail.totalPoints, 4 + 3 + 0 + 0 + 4, "合計ポイントは全問のpointsAwardedの合計");
    assertEqual(result.detail.firstHintCorrectCount, 2, "ヒント1正解は2問（1問目・5問目）");
    assertEqual(result.detail.totalHintsUsed, 1 + 2 + 4 + 4 + 1, "総使用ヒント数は全問の合計（参考情報）");
    assertEqual(result.detail.missCount, 1, "ミス数はwrongAnswerの問題数のみ");
    assertEqual(result.detail.skippedCount, 1, "わからない回数はskippedのみカウント");
    assertEqual(result.detail.correctCount, 3, "正解数は3問");
    assertEqual("maxCombo" in result.detail, false, "コンボの概念を撤廃したため、maxComboはもう集計しない");
    assertEqual("currentCombo" in result.detail, false, "コンボの概念を撤廃したため、currentComboはもう集計しない");
  }

  // ===== compareResults：合計ポイントのみで比較。同点は完全に同順位（0） =====
  {
    const wrap = (totalPoints) => ({ detail: { totalPoints } });

    assertEqual(comboRule.compareResults(wrap(20), wrap(15)) < 0, true, "合計ポイントが多い方が上位");
    assertEqual(comboRule.compareResults(wrap(15), wrap(20)) > 0, true, "合計ポイントが少ない方が下位");
    assertEqual(
      comboRule.compareResults(wrap(12), wrap(12)),
      0,
      "合計ポイントが同じなら、回答時間等に関わらず必ず0（完全な同順位）"
    );
  }

  // ===== validateSettings・defaultSettings =====
  {
    assertEqual(comboRule.validateSettings({}), null, "ルール固有設定が無いため常にnull（エラー無し）");
    assertEqual(
      Object.keys(comboRule.defaultSettings()).length,
      0,
      "defaultSettings()はルール固有設定を持たないため空オブジェクト"
    );
  }

  // ===== 宣言データの確認 =====
  {
    assertEqual(comboRule.allowedAnswerPoolSizes, [4, 10, 30, 50, "all"], "ポイントバトルは全ての回答方式を許可");
    assertEqual(comboRule.settingsFields.length, 0, "ヒント表示時間の設定が無くなったためsettingsFieldsは空配列");
    assertEqual(comboRule.hudFields.length, 1, "対戦中HUDは自分の現在ポイントのみ（本人指示：他人との比較を対戦中に見せない）");
    assertEqual(comboRule.hudFields[0].key, "totalPoints", "対戦中HUDのキーはtotalPoints");
    assertEqual(
      comboRule.resultColumns.some((column) => column.key === "skippedCount"),
      true,
      "resultColumnsにわからない回数（skippedCount）が含まれる"
    );
    assertEqual(
      comboRule.resultColumns.some((column) => column.key === "maxCombo"),
      false,
      "コンボの概念を撤廃したため、resultColumnsにmaxComboは含まれない"
    );
  }

  // ===== getAnswerSubmissionPlan（Phase6.5新設・変更なし） =====
  {
    assertEqual(
      comboRule.getAnswerSubmissionPlan(),
      { submitAnswer: true, submitWinnerClaim: false },
      "ポイントバトルには奪い取りclaimの概念が無いため、常に回答ログだけを送る"
    );
  }

  // ===== getComboMultiplierForCount：コンボ撤廃により常にnull =====
  {
    assertEqual(comboRule.getComboMultiplierForCount(0), null, "コンボ倍率の概念を撤廃したため常にnull");
    assertEqual(comboRule.getComboMultiplierForCount(5), null, "引数に関わらず常にnull");
  }

  // ===== label・ruleId（表示名変更、内部値は維持） =====
  {
    assertEqual(comboRule.ruleId, "combo", "内部IDは既存のまま維持（本人指示：既存機能への影響を避ける）");
    assertEqual(comboRule.label, "ポイントバトル", "表示名はポイントバトルに変更");
  }
}
