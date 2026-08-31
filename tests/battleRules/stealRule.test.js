// js/battleRules/stealRule.js（歌詞クイズ対戦・早押しバトル。旧名：奪い取り）のテスト。
// 歌詞本文は一切扱わず、ダミーの曲ID・数値だけでテストする。
// 特に「winner候補の正誤を必ず検算し直す」という、設計⑧⑨の安全性の核心部分を重点的に確認する
// （2026-08-31改訂後も、この安全性の核心は一切変更していない。削除禁止）。

import * as stealRule from "../../js/battleRules/stealRule.js";
import { SKIP_SELECTION } from "../../js/battleRules/sharedDefaults.js";
import { assertEqual } from "../test-utils.js";

function buildOutcome(overrides) {
  return {
    outcome: "correct",
    hintLevel: 1,
    responseMs: 1000,
    pointsAwarded: 1,
    wonQuestion: true,
    ...overrides,
  };
}

export function runStealRuleTests() {
  // ===== resolveQuestionAnswers：正当な勝者が1pt、他は0pt =====
  // 【2026-08-31改訂】配点はヒント段階に関係なく一律1pt（歌詞が1文字ずつ表示される演出に
  // 変わり、ヒント段階という概念自体が採点上は無意味になったため）。
  {
    const answersByUid = {
      p1: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 7000 }, // 正解、winner
      p2: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 15000 }, // 正解だが後着（winnerではない）
      p3: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 500 }, // 不正解
    };
    const winner = { uid: "p1", submittedAt: 7000 };
    const result = stealRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      winner,
      questionStartedAt: 0,
    });
    assertEqual(result.p1.wonQuestion, true, "claimしたp1が勝者として確定する");
    assertEqual(result.p1.pointsAwarded, 1, "早押しバトルは正解一律1pt");
    assertEqual(result.p2.wonQuestion, false, "p2も正解しているが、先にwinnerが確定しているので0点扱い");
    assertEqual(result.p2.pointsAwarded, 0, "早押しバトルは最初の正解者だけが得点する");
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
      p2: { selectedSongId: "song-1", hintLevel: 1, submittedAt: 15000 }, // 本当は正解だが、claimしていない
    };
    const winner = { uid: "p1", submittedAt: 500 }; // 不正解のp1が（何らかの理由で）winnerとして記録されている
    const result = stealRule.resolveQuestionAnswers({
      answersByUid,
      correctSongId: "song-1",
      winner,
      questionStartedAt: 0,
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
      }),
      true,
      "誰も正解しないまま全員が回答済みになれば、期限前でも終了する"
    );
  }

  // ===== shouldEndQuestion：未回答者が残っていれば、安全網のタイムアウトまで継続 =====
  {
    assertEqual(
      stealRule.shouldEndQuestion({
        answersByUid: { p1: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 500 } },
        winner: null,
        allPlayerUids: ["p1", "p2"],
        questionStartedAt: 0,
        nowMs: 700,
      }),
      false,
      "不正解者が出ても、未回答者が残っていて60秒の安全網タイムアウト前なら継続する"
    );
    assertEqual(
      stealRule.shouldEndQuestion({
        answersByUid: { p1: { selectedSongId: "song-2", hintLevel: 1, submittedAt: 500 } },
        winner: null,
        allPlayerUids: ["p1", "p2"],
        questionStartedAt: 0,
        nowMs: 60000,
      }),
      true,
      "60秒の安全網タイムアウトを過ぎたら、未回答者が残っていても終了する"
    );
  }

  // ===== aggregateResult =====
  {
    const questionOutcomes = [
      buildOutcome({ wonQuestion: true, hintLevel: 1, responseMs: 800, pointsAwarded: 1, outcome: "correct" }),
      buildOutcome({ wonQuestion: false, hintLevel: 1, responseMs: 0, pointsAwarded: 0, outcome: "wrongAnswer" }),
      buildOutcome({ wonQuestion: true, hintLevel: 1, responseMs: 1500, pointsAwarded: 1, outcome: "correct" }),
      buildOutcome({ wonQuestion: false, hintLevel: 1, responseMs: 0, pointsAwarded: 0, outcome: "skipped" }),
    ];
    const result = stealRule.aggregateResult(questionOutcomes);
    assertEqual(result.detail.totalPoints, 2, "合計ポイントは獲得した問題数（2問）ぶん");
    assertEqual(result.detail.questionsWon, 2, "獲得問題数は2問");
    assertEqual(result.detail.wonElapsedMsTotal, 800 + 1500, "獲得時の総回答時間は、獲得した問題の分だけ合計する（参考情報）");
    assertEqual(result.detail.missCount, 1, "ミス数はwrongAnswerの問題数");
    assertEqual(result.detail.skippedCount, 1, "未回答数はskippedのみカウント（ミス数とは別集計）");
    assertEqual("firstHintWinCount" in result.detail, false, "ヒント段階が撤廃されたため、firstHintWinCountはもう集計しない");
  }

  // ===== compareResults：合計ポイントのみで比較。同点は完全に同順位（0） =====
  {
    const wrap = (totalPoints) => ({ detail: { totalPoints } });

    assertEqual(stealRule.compareResults(wrap(3), wrap(1)) < 0, true, "総ポイントが多い方が上位");
    assertEqual(stealRule.compareResults(wrap(1), wrap(3)) > 0, true, "総ポイントが少ない方が下位");
    assertEqual(
      stealRule.compareResults(wrap(2), wrap(2)),
      0,
      "総ポイントが同じなら、獲得時の回答時間等に関わらず必ず0（完全な同順位）"
    );
  }

  // ===== 宣言データの確認 =====
  {
    assertEqual(stealRule.allowedAnswerPoolSizes, [4, 10], "早押しバトルはMVPでは4択・10択のみ許可");
    assertEqual(
      stealRule.resultColumns.some((column) => column.key === "skippedCount"),
      true,
      "resultColumnsに未回答数（skippedCount）が含まれる"
    );
    assertEqual(stealRule.hudFields.length, 1, "対戦中HUDは自分の現在ポイントのみ（本人指示：他人との比較を対戦中に見せない）");
    assertEqual(stealRule.hudFields[0].key, "totalPoints", "対戦中HUDのキーはtotalPoints");
  }

  // ===== getAnswerSubmissionPlan（Phase6.5新設・変更なし） =====
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

  // ===== label・ruleId（表示名変更、内部値は維持） =====
  {
    assertEqual(stealRule.ruleId, "steal", "内部IDは既存のまま維持（本人指示：既存機能への影響を避ける）");
    assertEqual(stealRule.label, "早押しバトル", "表示名は早押しバトルに変更");
  }
}
