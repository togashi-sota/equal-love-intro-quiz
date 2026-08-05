// js/battleRules/stealRule.js（歌詞クイズ対戦・奪い取りルール）のテスト。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値だけでテストする。
// 特に「winner候補の正誤を必ず検算し直す」という、設計⑧⑨の安全性の核心部分を重点的に確認する。

import * as stealRule from "../../js/battleRules/stealRule.js";
import { SKIP_SELECTION } from "../../js/battleRules/sharedDefaults.js";
import { assertEqual } from "../test-utils.js";

// 設計⑪②の方針どおり、配点テーブルはsettingsに含めない（ルール内部の定数を直接使う）。
const SETTINGS = { hintIntervalSec: 6 };

function buildOutcome(overrides) {
  return {
    outcome: "correct",
    hintLevel: 1,
    responseMs: 1000,
    pointsAwarded: 50,
    wonQuestion: true,
    ...overrides,
  };
}

export function runStealRuleTests() {
  // ===== resolveQuestionAnswers：正当な勝者が得点し、他は0点 =====
  {
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 2, submittedAt: 7000 }, // 正解、winner
      p2: { selectedSongId: "song-1", hintLevel: 3, submittedAt: 15000 }, // 正解だが後着（winnerではない）
      p3: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 500 }, // 不正解
    };
    const winner = { uid: "p1", submittedAt: 7000 };
    const result = stealRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      winner,
      questionStartedAt: 0,
      settings: SETTINGS,
    });
    assertEqual(result.p1.wonQuestion, true, "claimしたp1が勝者として確定する");
    assertEqual(result.p1.pointsAwarded, 40, "p1はヒント2で正解したので40点");
    assertEqual(result.p2.wonQuestion, false, "p2も正解しているが、先にwinnerが確定しているので0点扱い");
    assertEqual(result.p2.pointsAwarded, 0, "奪い取りは最初の正解者だけが得点する");
    assertEqual(result.p3.outcome, "wrongAnswer", "p3は不正解");
    assertEqual(result.p3.pointsAwarded, 0, "不正解者は0点");
  }

  // ===== 【安全性の核心】winner候補の回答が実は不正解だった場合、誰にも得点を与えない =====
  {
    // セキュリティルールでは「本当に正解したか」を検証できないため（設計⑧⑨①）、
    // 万一不正な/誤ったclaimが記録されていても、この純粋関数側で必ず再検算し、
    // 実際には不正解だったなら得点を無効化することを確認する。
    const answersByUid = {
      p1: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 500 }, // 実は不正解
      p2: { selectedSongId: "song-1", hintLevel: 3, submittedAt: 15000 }, // 本当は正解だが、claimしていない
    };
    const winner = { uid: "p1", submittedAt: 500 }; // 不正解のp1が（何らかの理由で）winnerとして記録されている
    const result = stealRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      winner,
      questionStartedAt: 0,
      settings: SETTINGS,
    });
    assertEqual(result.p1.wonQuestion, false, "claimされていても、実際の回答が不正解なら勝者として認めない");
    assertEqual(result.p1.pointsAwarded, 0, "不正なclaimでは得点が発生しない");
    assertEqual(result.p2.wonQuestion, false, "claimしていないp2が代わりに勝者になることもない（write-onceのため）");
    assertEqual(result.p2.pointsAwarded, 0, "結果としてこの問題は誰も得点しない");
  }

  // ===== winnerがまだ確定していない（null）場合 =====
  {
    const answersByUid = { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 } };
    const result = stealRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      winner: null,
      questionStartedAt: 0,
      settings: SETTINGS,
    });
    assertEqual(result.p1.outcome, "correct", "outcome自体は自分の回答から独立して判定される");
    assertEqual(result.p1.wonQuestion, false, "winnerがまだ確定していなければ、正解していても得点はまだ発生しない");
    assertEqual(result.p1.pointsAwarded, 0, "同上");
  }

  // ===== shouldEndQuestion：winner確定で即終了 =====
  {
    assertEqual(
      stealRule.shouldEndQuestion({
        answersByUid: { p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 500 } },
        winner: { uid: "p1", submittedAt: 500 },
        allPlayerUids: ["p1", "p2", "p3"],
        questionStartedAt: 0,
        nowMs: 600,
        settings: SETTINGS,
      }),
      true,
      "winnerが確定した瞬間、他に未回答者がいても即終了する"
    );
  }

  // ===== shouldEndQuestion：winner未確定でも全員回答済みなら終了 =====
  {
    assertEqual(
      stealRule.shouldEndQuestion({
        answersByUid: {
          p1: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 500 },
          p2: { selectedSongId: "song-3", hintLevel: 1, submittedAt: 600 },
        },
        winner: null,
        allPlayerUids: ["p1", "p2"],
        questionStartedAt: 0,
        nowMs: 700,
        settings: SETTINGS,
      }),
      true,
      "誰も正解しないまま全員が回答済みになれば、期限前でも終了する"
    );
  }

  // ===== shouldEndQuestion：未回答者が残っていれば継続 =====
  {
    assertEqual(
      stealRule.shouldEndQuestion({
        answersByUid: { p1: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 500 } },
        winner: null,
        allPlayerUids: ["p1", "p2"],
        questionStartedAt: 0,
        nowMs: 700,
        settings: SETTINGS,
      }),
      false,
      "不正解者が出ても、未回答者が残っていて期限前なら継続する"
    );
  }

  // ===== aggregateResult =====
  {
    const questionOutcomes = [
      buildOutcome({ wonQuestion: true, hintLevel: 1, responseMs: 800, pointsAwarded: 50, outcome: "correct" }),
      buildOutcome({ wonQuestion: false, hintLevel: 2, responseMs: 0, pointsAwarded: 0, outcome: "wrongAnswer" }),
      buildOutcome({ wonQuestion: true, hintLevel: 3, responseMs: 1500, pointsAwarded: 30, outcome: "correct" }),
      buildOutcome({ wonQuestion: false, hintLevel: 4, responseMs: 0, pointsAwarded: 0, outcome: "skipped" }),
    ];
    const result = stealRule.aggregateResult(questionOutcomes);
    assertEqual(result.detail.totalPoints, 80, "合計ポイントは獲得した問題の分だけ（50+30）");
    assertEqual(result.detail.questionsWon, 2, "獲得問題数は2問");
    assertEqual(result.detail.firstHintWinCount, 1, "ヒント1での獲得は1問だけ");
    assertEqual(result.detail.wonElapsedMsTotal, 800 + 1500, "獲得時の総回答時間は、獲得した問題の分だけ合計する");
    assertEqual(result.detail.missCount, 1, "ミス数はwrongAnswerの問題数");
    assertEqual(result.detail.skippedCount, 1, "未回答数はskippedのみカウント（classicRuleと同じ設計。ミス数とは別集計）");
  }

  // ===== compareResults：5段階タイブレーク =====
  {
    const base = { totalPoints: 100, questionsWon: 3, firstHintWinCount: 1, wonElapsedMsTotal: 5000, missCount: 1 };
    const wrap = (detail) => ({ detail });

    assertEqual(
      stealRule.compareResults(wrap({ ...base, totalPoints: 150 }), wrap(base)) < 0,
      true,
      "①総ポイントが多い方が上位"
    );
    assertEqual(
      stealRule.compareResults(wrap({ ...base, questionsWon: 5 }), wrap(base)) < 0,
      true,
      "①が同じなら②獲得問題数が多い方が上位"
    );
    assertEqual(
      stealRule.compareResults(wrap({ ...base, firstHintWinCount: 3 }), wrap(base)) < 0,
      true,
      "①②が同じなら③ヒント1での獲得数が多い方が上位"
    );
    assertEqual(
      stealRule.compareResults(wrap({ ...base, wonElapsedMsTotal: 2000 }), wrap(base)) < 0,
      true,
      "①②③が同じなら④獲得時の総回答時間が短い方が上位"
    );
    assertEqual(
      stealRule.compareResults(wrap({ ...base, missCount: 0 }), wrap(base)) < 0,
      true,
      "①②③④が同じなら⑤ミス数が少ない方が上位"
    );
  }

  // ===== 宣言データの確認 =====
  {
    assertEqual(stealRule.allowedAnswerPoolSizes, [4, 10], "奪い取りはMVPでは4択・10択のみ許可");
    assertEqual(
      stealRule.resultColumns.some((column) => column.key === "skippedCount"),
      true,
      "resultColumnsに未回答数（skippedCount）が含まれる（本人の指示・2026-08-06：クラシックと表示を揃える）"
    );
    assertEqual(
      stealRule.hudFields.some((field) => field.key === "currentQuestionPoints"),
      false,
      "Phase6.5：計算方法が曖昧だったcurrentQuestionPointsはhudFieldsから削除済み"
    );
    assertEqual(
      stealRule.hudFields.some((field) => field.key === "lastWinnerName"),
      true,
      "lastWinnerNameは画面層で実値を計算できるため宣言を維持している"
    );
  }

  // ===== getAnswerSubmissionPlan（Phase6.5新設） =====
  {
    assertEqual(
      stealRule.getAnswerSubmissionPlan({ selectedSongId: "song-1", correctSongId: "song-1" }),
      { submitAnswer: true, submitWinnerClaim: true },
      "正解を選んだ場合は勝者claimも一緒に送る"
    );
    assertEqual(
      stealRule.getAnswerSubmissionPlan({ selectedSongId: "song-2", correctSongId: "song-1" }),
      { submitAnswer: true, submitWinnerClaim: false },
      "不正解の場合は回答ログだけを送る（claimは送らない）"
    );
    assertEqual(
      stealRule.getAnswerSubmissionPlan({ selectedSongId: SKIP_SELECTION, correctSongId: "song-1" }),
      { submitAnswer: true, submitWinnerClaim: false },
      "スキップの場合も回答ログだけを送る"
    );
  }
}
