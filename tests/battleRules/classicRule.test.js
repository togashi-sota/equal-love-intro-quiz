// js/battleRules/classicRule.js（歌詞クイズ対戦・正解数バトル。旧名：クラシック）のテスト。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値だけでテストする。
//
// 【2026-08-31改訂・本人指示による3ルール全面見直し】ヒントを手動で開く方式・正解一律1pt・
// 完全同順位（タイブレーク廃止）への変更に合わせて全面的に書き直した。

import * as classicRule from "../../js/battleRules/classicRule.js";
import { assertEqual } from "../test-utils.js";

function buildOutcome(overrides) {
  return { outcome: "correct", hintLevel: 1, responseMs: 1000, pointsAwarded: 1, ...overrides };
}

export function runClassicRuleTests() {
  // ===== resolveQuestionAnswers：正解・不正解・わからない（スキップ）の配点 =====
  // 正解は一律+1pt、不正解・わからないは常に0pt。ヒント段階（hintLevel）は採点に一切影響しない
  // （本人指示：「ヒントの使用状況を正解数バトルの順位には影響させません」）。
  {
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
      p2: { selectedSongId: "song-1", hintLevel: 4, submittedAt: 30000 }, // ヒント4まで開いても正解は同じ1pt
      p3: { selectedSongId: "song-2", hintLevel: 2, submittedAt: 7000 },
      p4: { selectedSongId: "SKIP", hintLevel: 1, submittedAt: 12000 },
    };
    const result = classicRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      questionStartedAt: 0,
    });
    assertEqual(result.p1.outcome, "correct", "正解者のoutcomeはcorrect");
    assertEqual(result.p1.pointsAwarded, 1, "ヒント1正解は1pt");
    assertEqual(result.p2.outcome, "correct", "ヒント4まで開いていても正解ならcorrect");
    assertEqual(result.p2.pointsAwarded, 1, "ヒント4正解でも同じ1pt（ヒント段階は配点に無関係）");
    assertEqual(result.p3.outcome, "wrongAnswer", "不正解者のoutcomeはwrongAnswer");
    assertEqual(result.p3.pointsAwarded, 0, "不正解は0点");
    assertEqual(result.p4.outcome, "skipped", "わからない（SKIP）のoutcomeはskipped");
    assertEqual(result.p4.pointsAwarded, 0, "わからないは0点");
    assertEqual(result.p1.wonQuestion, false, "正解数バトルにwonQuestionの概念は無く常にfalse");
    assertEqual(result.p1.nextComboCount, 0, "正解数バトルにコンボの概念は無く常に0");
  }

  // ===== shouldEndQuestion：全員回答済みなら即終了 =====
  {
    const allPlayerUids = ["p1", "p2"];
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
      p2: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 1000 },
    };
    assertEqual(
      classicRule.shouldEndQuestion({ answersByUid, allPlayerUids }),
      true,
      "全員が回答済みなら終了する"
    );
  }

  // ===== shouldEndQuestion：未回答者がいれば無期限に継続（2026-09-06・本人指示で撤廃） =====
  // 実機で「考えている途中なのに勝手に問題が終了する」問題が起きたため、固定時間の
  // 自動タイムアウトを完全に撤廃した。どれだけ時間が経っても、全員が回答するまで
  // 問題は終了しない（放置対策はホスト救済機能に委ねる。js/battleRules/sharedDefaults.js
  // のIDLE_RESCUE_THRESHOLD_MS参照）。
  {
    const allPlayerUids = ["p1", "p2"];
    const answersByUid = { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 } };
    assertEqual(
      classicRule.shouldEndQuestion({ answersByUid, allPlayerUids }),
      false,
      "未回答者がいれば、経過時間に関わらず継続する"
    );
  }

  // ===== aggregateResult：合計・参考情報の各項目 =====
  {
    const questionOutcomes = [
      buildOutcome({ outcome: "correct", hintLevel: 1, responseMs: 1000, pointsAwarded: 1 }),
      buildOutcome({ outcome: "correct", hintLevel: 2, responseMs: 2000, pointsAwarded: 1 }),
      buildOutcome({ outcome: "wrongAnswer", hintLevel: 4, responseMs: 3000, pointsAwarded: 0 }),
      buildOutcome({ outcome: "skipped", hintLevel: 3, responseMs: 500, pointsAwarded: 0 }),
    ];
    const result = classicRule.aggregateResult(questionOutcomes);
    assertEqual(result.detail.totalPoints, 2, "合計ポイントは正解2問ぶんの1+1=2");
    assertEqual(result.detail.firstHintCorrectCount, 1, "ヒント1正解は1問だけ（参考情報として維持）");
    assertEqual(result.detail.totalHintsUsed, 1 + 2 + 4 + 3, "総使用ヒント数は不正解・わからないの分も含めて合計する（参考情報）");
    assertEqual(result.detail.totalElapsedMs, 1000 + 2000 + 3000 + 500, "総回答時間は全問の合計（参考情報、順位には使わない）");
    assertEqual(result.detail.missCount, 1, "ミス数はwrongAnswerのみカウント（わからないは含まない）");
    assertEqual(result.detail.skippedCount, 1, "わからない回数はskippedのみカウント（ミス数とは別集計）");
    assertEqual(result.detail.correctCount, 2, "正解数は2問");
    assertEqual(result.completed, true, "completedは常にtrue");
  }

  // ===== compareResults：合計ポイントのみで比較。同点は完全に同順位（0） =====
  // 【本人指示】「同点の場合に回答時間などで無理に順位を分けないでください」との明確な指示により、
  // タイブレークを完全に撤廃した。
  {
    const wrap = (totalPoints) => ({ detail: { totalPoints } });

    assertEqual(classicRule.compareResults(wrap(10), wrap(5)) < 0, true, "合計ポイントが多い方が上位");
    assertEqual(classicRule.compareResults(wrap(5), wrap(10)) > 0, true, "合計ポイントが少ない方が下位");
    assertEqual(
      classicRule.compareResults(wrap(7), wrap(7)),
      0,
      "合計ポイントが同じなら、回答時間・使用ヒント数等に関わらず必ず0（完全な同順位）"
    );

    // 【2026-09-06追加・本人指示：正解数バトルの「同数は完全同順位」再確認】totalPoints
    // （＝正解数バトルでは正解数と同値）以外のフィールド（回答時間・使用ヒント数・ミス数・
    // わからない回数）が大きく異なっていても、正解数さえ同じなら必ず同順位になることを、
    // 実際のaggregateResult()の出力形そのもの（totalPointsだけのラップではなく）で確認する。
    const fastFewHints = classicRule.aggregateResult([
      buildOutcome({ outcome: "correct", hintLevel: 1, responseMs: 500, pointsAwarded: 1 }),
      buildOutcome({ outcome: "correct", hintLevel: 1, responseMs: 400, pointsAwarded: 1 }),
      buildOutcome({ outcome: "wrongAnswer", hintLevel: 4, responseMs: 300, pointsAwarded: 0 }),
    ]);
    const slowManyHints = classicRule.aggregateResult([
      buildOutcome({ outcome: "correct", hintLevel: 4, responseMs: 29000, pointsAwarded: 1 }),
      buildOutcome({ outcome: "correct", hintLevel: 3, responseMs: 27000, pointsAwarded: 1 }),
      buildOutcome({ outcome: "skipped", hintLevel: 4, responseMs: 30000, pointsAwarded: 0 }),
    ]);
    assertEqual(fastFewHints.detail.correctCount, 2, "1人目：正解数2問（前提確認）");
    assertEqual(slowManyHints.detail.correctCount, 2, "2人目：正解数も2問（前提確認）");
    assertEqual(
      fastFewHints.detail.totalElapsedMs !== slowManyHints.detail.totalElapsedMs,
      true,
      "回答時間は大きく異なる（前提確認：片方は速答・片方は毎回ヒント4まで見て遅い）"
    );
    assertEqual(
      classicRule.compareResults(fastFewHints, slowManyHints),
      0,
      "正解数が同じ2人は、実際の回答時間・使用ヒント段階が大きく異なっていても必ず同順位になる（回答時間等でタイブレークしない、本人指示の再確認）"
    );
  }

  // ===== ユーザー向け表示に「ポイント」「pt」概念が残っていないことの確認 =====
  // 【2026-09-06追加・本人指示9・15：正解数バトルからポイント概念を完全撤廃】
  {
    assertEqual(/pt|ポイント/.test(classicRule.description), false, "選択カードの説明文（description）にpt/ポイント表記が無い");
    assertEqual(
      /pt|ポイント/.test(classicRule.getRuleDescription()),
      false,
      "ルール説明（getRuleDescription()）にpt/ポイント表記が無い"
    );
    assertEqual(
      classicRule.hudFields.every((field) => !/pt|ポイント/.test(field.label)),
      true,
      "対戦中HUDのラベルにpt/ポイント表記が無い（「現在の正解数」等の表記になっている）"
    );
    assertEqual(
      classicRule.resultColumns.every((column) => !/pt|ポイント/.test(column.label)),
      true,
      "結果カードの列ラベルにpt/ポイント表記が無い"
    );

    // aggregateResult()が組み立てるcorrectCountFraction（結果カード表示用）自体の形式も確認する。
    const result = classicRule.aggregateResult([
      buildOutcome({ outcome: "correct" }),
      buildOutcome({ outcome: "correct" }),
      buildOutcome({ outcome: "wrongAnswer", pointsAwarded: 0 }),
      buildOutcome({ outcome: "skipped", pointsAwarded: 0 }),
      buildOutcome({ outcome: "skipped", pointsAwarded: 0 }),
    ]);
    assertEqual(result.detail.correctCountFraction, "2 / 5問", '5問中2問正解の場合、correctCountFractionは"2 / 5問"になる（「2 / 5問 正解」として結果カードに表示される）');
    assertEqual(/pt|ポイント/.test(result.detail.correctCountFraction), false, "correctCountFraction自体にpt/ポイント表記が無い");
  }

  // ===== validateSettings・defaultSettings =====
  // 【2026-08-31改訂】ヒントを手動で開く方式になり、ルール固有設定（hintIntervalSec）が
  // 無くなったため、settingsは空オブジェクトで常に有効。
  {
    assertEqual(classicRule.validateSettings({}), null, "ルール固有設定が無いため常にnull（エラー無し）");
    assertEqual(
      Object.keys(classicRule.defaultSettings()).length,
      0,
      "defaultSettings()はルール固有設定を持たないため空オブジェクト"
    );
  }

  // ===== 宣言データの確認（UI自動生成の土台） =====
  {
    assertEqual(classicRule.allowedAnswerPoolSizes, [4, 10, 30, 50, "all"], "正解数バトルは全ての回答方式を許可");
    assertEqual(classicRule.settingsFields.length, 0, "ヒント表示時間の設定が無くなったためsettingsFieldsは空配列");
    // 【2026-XX-XX改訂・本人指示9：正解数バトルからポイント概念を撤廃】HUDのキーを
    // totalPoints→correctCountへ変更（値としては同じだが「ポイント」という概念を
    // ユーザーに見せないため）。
    assertEqual(classicRule.hudFields.length, 1, "対戦中HUDは自分の現在の正解数のみ（本人指示：他人との比較を対戦中に見せない）");
    assertEqual(classicRule.hudFields[0].key, "correctCount", "対戦中HUDのキーはcorrectCount");
    // 【2026-XX-XX改訂・本人指示9・10：結果カードは「正解数」の1項目だけにする】
    // 使用ヒント数・回答時間・ミス回数・わからない回数は成績情報として表示しない。
    assertEqual(classicRule.resultColumns.length, 1, "resultColumnsは正解数の1項目だけ");
    assertEqual(classicRule.resultColumns[0].key, "correctCountFraction", "resultColumnsのキーはcorrectCountFraction");
    assertEqual(
      classicRule.resultColumns.some((column) => column.key === "skippedCount"),
      false,
      "resultColumnsにわからない回数（skippedCount）は含まれない（ポイント概念撤廃・成績情報の簡略化）"
    );
  }

  // ===== getAnswerSubmissionPlan（Phase6.5新設） =====
  {
    assertEqual(
      classicRule.getAnswerSubmissionPlan(),
      { submitAnswer: true, submitWinnerClaim: false },
      "正解数バトルには奪い取りclaimの概念が無いため、常に回答ログだけを送る"
    );
  }

  // ===== label・ruleId（表示名変更、内部値は維持） =====
  {
    assertEqual(classicRule.ruleId, "classic", "内部IDは既存のまま維持（本人指示：既存機能への影響を避ける）");
    assertEqual(classicRule.label, "正解数バトル", "表示名は正解数バトルに変更");
  }
}
