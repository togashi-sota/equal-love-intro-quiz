// js/battleRules/comboRule.js（歌詞クイズ対戦・コンボルール）のテスト。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値だけでテストする。
//
// 設計⑪②の方針どおり、配点・コンボ倍率テーブルはsettingsに含めない
// （ルール内部の定数DEFAULT_HINT_POINT_TABLE/DEFAULT_COMBO_MULTIPLIER_TABLEを直接使う）。
// そのためテスト側もsettingsへ独自の配点・倍率を注入することはできない
// （＝settingsを介した不正な配点変更ができないことの裏付けでもある）。

import * as comboRule from "../../js/battleRules/comboRule.js";
import { assertEqual } from "../test-utils.js";

const SETTINGS = { hintIntervalSec: 6 };

function buildOutcome(overrides) {
  return { outcome: "correct", hintLevel: 1, responseMs: 1000, pointsAwarded: 50, nextComboCount: 1, ...overrides };
}

export function runComboRuleTests() {
  // ===== resolveQuestionAnswers：コンボの増加とリセット、他人からの独立性 =====
  {
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 }, // 正解、コンボ3→4
      p2: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 1000 }, // 不正解、コンボ5→0
    };
    const comboCountByUid = { p1: 3, p2: 5 };
    const result = comboRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      comboCountByUid,
      questionStartedAt: 0,
      settings: SETTINGS,
    });
    assertEqual(result.p1.nextComboCount, 4, "正解すればコンボが1増える（3→4）");
    assertEqual(result.p2.nextComboCount, 0, "不正解ならコンボは0にリセットされる（5→0）");
    assertEqual(
      result.p1.pointsAwarded,
      Math.round(50 * 1.2),
      "p1はコンボ4（しきい値3の倍率1.2、ルール内部の固定テーブル由来）× ヒント1の50点"
    );
    assertEqual(result.p2.pointsAwarded, 0, "不正解は0点");
  }

  // ===== コンボは他プレイヤーの回答に影響されない =====
  {
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
      p2: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
    };
    const comboCountByUid = { p1: 0, p2: 10 };
    const result = comboRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      comboCountByUid,
      questionStartedAt: 0,
      settings: SETTINGS,
    });
    assertEqual(result.p1.nextComboCount, 1, "p1は自分のコンボ0から1へ増える");
    assertEqual(result.p2.nextComboCount, 11, "p2は自分のコンボ10から11へ増える（p1の状態とは無関係）");
  }

  // ===== 丸め方法：倍率適用後に四捨五入する =====
  {
    // 固定の配点表（50/40/30/20）×倍率表（1.0/1.2/1.5/2.0）は、実際には割り切れる
    // 組み合わせしか生まれないため、ここではMath.round自体の丸め挙動
    // （四捨五入であること）を、ルールが使うのと同じ計算式で確認する
    // （設計⑦1-c章に記載のとおり、将来テーブルを調整したときの安全策）。
    assertEqual(Math.round(45 * 1.1), 50, "45×1.1=49.5はMath.roundで50（四捨五入）になる");

    const answersByUid = { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 } };
    const result = comboRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      comboCountByUid: { p1: 0 },
      questionStartedAt: 0,
      settings: SETTINGS,
    });
    // 現在の固定テーブルでは端数が出ないため、そのまま50×1.0=50になることを確認する。
    assertEqual(result.p1.pointsAwarded, 50, "コンボ1（倍率1.0）× ヒント1の50点は、そのまま50点");
  }

  // ===== shouldEndQuestion：クラシックと同じ終了条件 =====
  {
    const allPlayerUids = ["p1", "p2"];
    assertEqual(
      comboRule.shouldEndQuestion({
        answersByUid: {
          p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
          p2: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 },
        },
        allPlayerUids,
        questionStartedAt: 0,
        nowMs: 2000,
        settings: SETTINGS,
      }),
      true,
      "全員回答済みなら制限時間前でも終了する"
    );
    assertEqual(
      comboRule.shouldEndQuestion({
        answersByUid: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 1000 } },
        allPlayerUids,
        questionStartedAt: 0,
        nowMs: 2000,
        settings: SETTINGS,
      }),
      false,
      "未回答者がいて期限前なら継続する"
    );
  }

  // ===== aggregateResult：最大コンボ・現在コンボの推移 =====
  {
    const questionOutcomes = [
      buildOutcome({ nextComboCount: 1, pointsAwarded: 50, hintLevel: 1, responseMs: 500 }),
      buildOutcome({ nextComboCount: 2, pointsAwarded: 40, hintLevel: 2, responseMs: 600 }),
      buildOutcome({ nextComboCount: 3, pointsAwarded: 60, hintLevel: 1, responseMs: 700 }),
      buildOutcome({ nextComboCount: 0, pointsAwarded: 0, hintLevel: 4, responseMs: 800, outcome: "wrongAnswer" }),
      buildOutcome({ nextComboCount: 0, pointsAwarded: 0, hintLevel: 4, responseMs: 0, outcome: "skipped" }),
      buildOutcome({ nextComboCount: 1, pointsAwarded: 50, hintLevel: 1, responseMs: 900 }),
    ];
    const result = comboRule.aggregateResult(questionOutcomes);
    assertEqual(result.detail.totalPoints, 50 + 40 + 60 + 0 + 0 + 50, "合計ポイントは全問のpointsAwardedの合計");
    assertEqual(result.detail.maxCombo, 3, "最大コンボは、リセットを挟んでも一番高かった値（3）");
    assertEqual(result.detail.currentCombo, 1, "現在コンボは最後の問題の値（リセット後にまた1まで戻った）");
    assertEqual(result.detail.totalHintsUsed, 1 + 2 + 1 + 4 + 4 + 1, "総使用ヒント数は全問の合計（スキップの分も含む）");
    assertEqual(result.detail.missCount, 1, "ミス数はwrongAnswerの問題数のみ（スキップは含まない）");
    assertEqual(result.detail.skippedCount, 1, "未回答数はskippedのみカウント（classicRuleと同じ設計。ミス数とは別集計）");
    assertEqual(result.detail.correctCount, 4, "正解数は4問");
  }

  // ===== compareResults：5段階タイブレーク（①ポイント②最大コンボ③ミス数④使用ヒント数⑤回答時間） =====
  {
    const base = { totalPoints: 100, maxCombo: 4, missCount: 1, totalHintsUsed: 10, totalElapsedMs: 5000 };
    const wrap = (detail) => ({ detail });

    assertEqual(
      comboRule.compareResults(wrap({ ...base, totalPoints: 150 }), wrap(base)) < 0,
      true,
      "①合計ポイントが多い方が上位"
    );
    assertEqual(
      comboRule.compareResults(wrap({ ...base, maxCombo: 7 }), wrap(base)) < 0,
      true,
      "①が同じなら②最大コンボが多い方が上位"
    );
    assertEqual(
      comboRule.compareResults(wrap({ ...base, missCount: 0 }), wrap(base)) < 0,
      true,
      "①②が同じなら③ミス数が少ない方が上位（本人の指示どおり、使用ヒント数より先に評価する）"
    );
    assertEqual(
      comboRule.compareResults(wrap({ ...base, totalHintsUsed: 8 }), wrap(base)) < 0,
      true,
      "①②③が同じなら④総使用ヒント数が少ない方が上位"
    );
    assertEqual(
      comboRule.compareResults(wrap({ ...base, totalElapsedMs: 3000 }), wrap(base)) < 0,
      true,
      "①②③④が同じなら⑤総回答時間が短い方が上位（通信遅延の影響もあるため最後の判定）"
    );
  }

  // ===== validateSettings =====
  {
    assertEqual(comboRule.validateSettings(SETTINGS), null, "正しい設定はnull（エラー無し）");
    assertEqual(
      comboRule.validateSettings({ hintIntervalSec: 0 }),
      "ヒント表示時間が不正です。",
      "ヒント表示時間が0だとエラー"
    );
    assertEqual(
      "pointTable" in comboRule.defaultSettings(),
      false,
      "defaultSettings()の戻り値に配点テーブルが含まれない（設計⑪②）"
    );
    assertEqual(
      "comboMultiplierTable" in comboRule.defaultSettings(),
      false,
      "defaultSettings()の戻り値にコンボ倍率テーブルが含まれない（設計⑪②）"
    );
  }

  // ===== 宣言データの確認 =====
  {
    assertEqual(comboRule.allowedAnswerPoolSizes, [4, 10, 30, 50, "all"], "コンボは全ての回答方式を許可");
    assertEqual(
      comboRule.resultColumns.some((column) => column.key === "skippedCount"),
      true,
      "resultColumnsに未回答数（skippedCount）が含まれる（本人の指示・2026-08-06：クラシック・奪い取りと表示を揃える）"
    );
  }

  // ===== getAnswerSubmissionPlan（Phase6.5新設） =====
  {
    assertEqual(
      comboRule.getAnswerSubmissionPlan(),
      { submitAnswer: true, submitWinnerClaim: false },
      "コンボには奪い取りclaimの概念が無いため、常に回答ログだけを送る"
    );
  }

  // ===== getComboMultiplierForCount（Phase6.5新設・HUDの「現在倍率」表示用） =====
  {
    assertEqual(comboRule.getComboMultiplierForCount(0), 1.0, "コンボ0のときの倍率は1.0倍");
    assertEqual(comboRule.getComboMultiplierForCount(3), 1.2, "コンボ3のときの倍率は1.2倍（DEFAULT_COMBO_MULTIPLIER_TABLEと一致）");
    assertEqual(comboRule.getComboMultiplierForCount(7), 2.0, "コンボ7以上のときの倍率は2.0倍");
    assertEqual(comboRule.getComboMultiplierForCount(100), 2.0, "テーブルの最大しきい値を超えても、最大倍率のまま頭打ちになる");
  }
}
