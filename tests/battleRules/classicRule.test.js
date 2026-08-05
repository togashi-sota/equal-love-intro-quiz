// js/battleRules/classicRule.js（歌詞クイズ対戦・クラシックルール）のテスト。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値だけでテストする。

import * as classicRule from "../../js/battleRules/classicRule.js";
import { assertEqual } from "../test-utils.js";

// 設計⑪②の方針どおり、配点テーブルはsettingsに含めない（ルール内部の定数を直接使う）。
const SETTINGS = { hintIntervalSec: 6 };

function buildOutcome(overrides) {
  return { outcome: "correct", hintLevel: 1, responseMs: 1000, pointsAwarded: 50, ...overrides };
}

export function runClassicRuleTests() {
  // ===== resolveQuestionAnswers：正解・不正解・スキップの配点 =====
  {
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
      p2: { selectedSongId: "song-2", hintLevel: 2, submittedAt: 7000 },
      p3: { selectedSongId: "SKIP", hintLevel: 3, submittedAt: 12000 },
    };
    const result = classicRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      questionStartedAt: 0,
      settings: SETTINGS,
    });
    assertEqual(result.p1.outcome, "correct", "正解者のoutcomeはcorrect");
    assertEqual(result.p1.pointsAwarded, 50, "ヒント1正解は50点");
    assertEqual(result.p2.outcome, "wrongAnswer", "不正解者のoutcomeはwrongAnswer");
    assertEqual(result.p2.pointsAwarded, 0, "不正解は0点");
    assertEqual(result.p3.outcome, "skipped", "スキップ者のoutcomeはskipped");
    assertEqual(result.p3.pointsAwarded, 0, "スキップは0点");
    assertEqual(result.p1.wonQuestion, false, "クラシックにwonQuestionの概念は無く常にfalse");
    assertEqual(result.p1.nextComboCount, 0, "クラシックにコンボの概念は無く常に0");
  }

  // ===== shouldEndQuestion：全員回答済みなら即終了 =====
  {
    const allPlayerUids = ["p1", "p2"];
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
      p2: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 1000 },
    };
    assertEqual(
      classicRule.shouldEndQuestion({
        answersByUid,
        allPlayerUids,
        questionStartedAt: 0,
        nowMs: 2000,
        settings: SETTINGS,
      }),
      true,
      "全員が回答済みなら、制限時間前でも終了する"
    );
  }

  // ===== shouldEndQuestion：未回答者がいれば期限まで継続 =====
  {
    const allPlayerUids = ["p1", "p2"];
    const answersByUid = { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 } };
    assertEqual(
      classicRule.shouldEndQuestion({
        answersByUid,
        allPlayerUids,
        questionStartedAt: 0,
        nowMs: 2000,
        settings: SETTINGS,
      }),
      false,
      "未回答者がいて、まだヒント4の期限（4×6秒=24000ms）前なら継続"
    );
    assertEqual(
      classicRule.shouldEndQuestion({
        answersByUid,
        allPlayerUids,
        questionStartedAt: 0,
        nowMs: 24000,
        settings: SETTINGS,
      }),
      true,
      "未回答者がいても、ヒント4の期限を過ぎたら終了する"
    );
  }

  // ===== aggregateResult：合計・タイブレーク用の各項目 =====
  {
    const questionOutcomes = [
      buildOutcome({ outcome: "correct", hintLevel: 1, responseMs: 1000, pointsAwarded: 50 }),
      buildOutcome({ outcome: "correct", hintLevel: 2, responseMs: 2000, pointsAwarded: 40 }),
      buildOutcome({ outcome: "wrongAnswer", hintLevel: 4, responseMs: 3000, pointsAwarded: 0 }),
      buildOutcome({ outcome: "skipped", hintLevel: 3, responseMs: 500, pointsAwarded: 0 }),
    ];
    const result = classicRule.aggregateResult(questionOutcomes);
    assertEqual(result.detail.totalPoints, 90, "合計ポイントは50+40=90");
    assertEqual(result.detail.firstHintCorrectCount, 1, "ヒント1正解は1問だけ");
    assertEqual(result.detail.totalHintsUsed, 1 + 2 + 4 + 3, "総使用ヒント数は不正解・スキップの分も含めて合計する");
    assertEqual(result.detail.totalElapsedMs, 1000 + 2000 + 3000 + 500, "総回答時間は全問の合計");
    assertEqual(result.detail.missCount, 1, "ミス数はwrongAnswerのみカウント（スキップは含まない）");
    assertEqual(result.detail.skippedCount, 1, "未回答数はskippedのみカウント（ミス数とは別集計）");
    assertEqual(result.detail.correctCount, 2, "正解数は2問");
    assertEqual(result.completed, true, "completedは常にtrue");
  }

  // ===== compareResults：5段階タイブレーク =====
  {
    const base = {
      totalPoints: 100,
      firstHintCorrectCount: 3,
      totalHintsUsed: 10,
      totalElapsedMs: 5000,
      missCount: 1,
    };
    const wrap = (detail) => ({ detail });

    // ①合計ポイント
    assertEqual(
      classicRule.compareResults(wrap({ ...base, totalPoints: 150 }), wrap(base)) < 0,
      true,
      "①合計ポイントが多い方が上位"
    );

    // ②ヒント1正解数（①が同じ場合）
    assertEqual(
      classicRule.compareResults(wrap({ ...base, firstHintCorrectCount: 5 }), wrap(base)) < 0,
      true,
      "①が同じなら②ヒント1正解数が多い方が上位"
    );

    // ③総使用ヒント数（①②が同じ場合）
    assertEqual(
      classicRule.compareResults(wrap({ ...base, totalHintsUsed: 8 }), wrap(base)) < 0,
      true,
      "①②が同じなら③総使用ヒント数が少ない方が上位"
    );

    // ④総回答時間（①②③が同じ場合）
    assertEqual(
      classicRule.compareResults(wrap({ ...base, totalElapsedMs: 3000 }), wrap(base)) < 0,
      true,
      "①②③が同じなら④総回答時間が短い方が上位"
    );

    // ⑤ミス数（①②③④が同じ場合）
    assertEqual(
      classicRule.compareResults(wrap({ ...base, missCount: 0 }), wrap(base)) < 0,
      true,
      "①②③④が同じなら⑤ミス数が少ない方が上位"
    );

    // 完全に同じなら0
    assertEqual(classicRule.compareResults(wrap(base), wrap(base)), 0, "全項目が同じなら0（同順位）");
  }

  // ===== validateSettings =====
  {
    assertEqual(classicRule.validateSettings(SETTINGS), null, "正しい設定はnull（エラー無し）");
    assertEqual(
      classicRule.validateSettings({ hintIntervalSec: 0 }),
      "ヒント表示時間が不正です。",
      "ヒント表示時間が0だとエラー"
    );
    assertEqual(
      "pointTable" in classicRule.defaultSettings(),
      false,
      "defaultSettings()の戻り値に配点テーブルが含まれない（設計⑪②：Firebaseへ自由入力させない）"
    );
  }

  // ===== 宣言データの確認（UI自動生成の土台） =====
  {
    assertEqual(classicRule.allowedAnswerPoolSizes, [4, 10, 30, 50, "all"], "クラシックは全ての回答方式を許可");
    assertEqual(classicRule.settingsFields.length > 0, true, "settingsFieldsが宣言されている");
    assertEqual(classicRule.hudFields.length > 0, true, "hudFieldsが宣言されている");
    assertEqual(classicRule.resultColumns.length > 0, true, "resultColumnsが宣言されている");
    assertEqual(
      classicRule.resultColumns.some((column) => column.key === "skippedCount"),
      true,
      "resultColumnsに未回答数（skippedCount）が含まれる（本人の指示・2026-08-06：結果画面で未回答数を見えるようにする）"
    );
  }

  // ===== getAnswerSubmissionPlan（Phase6.5新設） =====
  {
    assertEqual(
      classicRule.getAnswerSubmissionPlan(),
      { submitAnswer: true, submitWinnerClaim: false },
      "クラシックには奪い取りclaimの概念が無いため、常に回答ログだけを送る"
    );
  }
}
