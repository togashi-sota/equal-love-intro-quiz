// js/instantBattleMatchProgress.jsのテスト（2026-09-15新設、本人指示：一瞬バトルの
// 同期方式への全面書き換え）。
//
// 【確認したいこと】
// ・全員が回答するまでtick()が進行しないこと。
// ・全員回答したら、各自の正誤を個別に判定して確定すること。
// ・音源再生失敗の報告があれば、投票の集計より先に「無効」として確定すること。
// ・recordAnswer()がwrite-once（2回目の回答を無視する）であること。
// ・advanceToNextQuestion()が、無効な問題は資格数に数えずに次へ進むこと。
// ・summarizePlayerOutcomes()が、本人指示の順位判定に使う値
//   （正解数・正解した問題だけの再視聴合計）を正しく集計すること。
// ・不正解・わからないの問題で使った再視聴回数は、correctOnlyReplaySumに含まれないこと。
// ・3問連続で無効になった場合に対戦を中断すること。

import {
  UNKNOWN_ANSWER,
  MATCH_STATUS_ABORTED_AUDIO_FAILURE,
  createMatchProgress,
  recordAnswer,
  countAnsweredPlayers,
  tick,
  advanceToNextQuestion,
  summarizePlayerOutcomes,
  computeFinalResults,
  compareInstantBattlePlayerResults,
  restoreMatchProgressFromFirebase,
} from "../js/instantBattleMatchProgress.js";
import { assertEqual } from "./test-utils.js";

function buildDummyQuestions(count) {
  return Array.from({ length: count }, (_, index) => ({
    song: { id: `song-${index}` },
    answerPool: [{ id: `song-${index}` }, { id: `distractor-${index}-a` }, { id: `distractor-${index}-b` }],
  }));
}

export function runInstantBattleMatchProgressTests() {
  const allPlayerUids = ["p1", "p2", "p3"];

  // ---- recordAnswer：write-once ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", nowMs: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-0", replayCount: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "distractor-0-a", replayCount: 2 });
    assertEqual(state.currentQuestion.answersByUid.p1.selectedSongId, "song-0", "同じ人の2回目の回答は無視される（write-once）");
  }

  // ---- countAnsweredPlayers ----
  {
    const count = countAnsweredPlayers({ p1: {}, p2: {} }, allPlayerUids);
    assertEqual(count, 2, "回答済みの人数を正しく数える");
  }

  // ---- tick：全員回答するまで何も起きない ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", nowMs: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-0", replayCount: 0 });
    state = recordAnswer(state, "p2", { selectedSongId: "song-0", replayCount: 0 });
    const before = state;
    state = tick(state, 100);
    assertEqual(state, before, "全員が回答していなければtick()は何も変えない");
  }

  // ---- tick：全員回答したら、各自の正誤を個別に確定する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", nowMs: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-0", replayCount: 1 });
    state = recordAnswer(state, "p2", { selectedSongId: "distractor-0-a", replayCount: 0 });
    state = recordAnswer(state, "p3", { selectedSongId: UNKNOWN_ANSWER, replayCount: 3 });
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "resolved", "全員回答したら確定する");
    assertEqual(state.currentQuestion.outcome.isVoid, false, "音源再生失敗の報告が無ければ無効にならない");
    assertEqual(state.currentQuestion.outcome.perPlayerOutcome.p1.isCorrect, true, "正解した人はisCorrect:true");
    assertEqual(state.currentQuestion.outcome.perPlayerOutcome.p2.isCorrect, false, "不正解した人はisCorrect:false");
    assertEqual(state.currentQuestion.outcome.perPlayerOutcome.p3.isUnknown, true, "「わからない」を選んだ人はisUnknown:true");
    assertEqual(state.currentQuestion.outcome.perPlayerOutcome.p3.isCorrect, false, "「わからない」は不正解として扱う");
  }

  // ---- tick：音源再生失敗の報告があれば、投票が揃っていなくても無効として確定する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", nowMs: 0 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-0", replayCount: 0 });
    state = tick(state, 100, true);
    assertEqual(state.currentQuestion.status, "resolved", "音源再生失敗の報告があれば全員揃わなくても確定する");
    assertEqual(state.currentQuestion.outcome.isVoid, true, "音源再生失敗の報告があれば無効になる");
  }

  // ---- advanceToNextQuestion：無効な問題は資格数に数えない ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(2), allPlayerUids, hostUid: "p1", nowMs: 0, targetQuestionCount: 1 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-0", replayCount: 0 });
    state = tick(state, 100, true); // 無効化
    state = advanceToNextQuestion(state, 200);
    assertEqual(state.currentQuestionIndex, 1, "無効な問題でも次のインデックスへ進む");
    assertEqual(state.resolvedQuestionCount, 0, "無効な問題は資格数に数えない");
    assertEqual(state.consecutiveVoidCount, 1, "連続無効カウントが増える");
    assertEqual(state.status, "inProgress", "targetQuestionCountにまだ届いていなければ続行する");
  }

  // ---- advanceToNextQuestion：有効な問題が確定するとresolvedQuestionCountが増え、
  //      targetQuestionCountに届いたらfinishedになる ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", nowMs: 0, targetQuestionCount: 1 });
    state = recordAnswer(state, "p1", { selectedSongId: "song-0", replayCount: 0 });
    state = recordAnswer(state, "p2", { selectedSongId: "song-0", replayCount: 0 });
    state = recordAnswer(state, "p3", { selectedSongId: "song-0", replayCount: 0 });
    state = tick(state, 100);
    state = advanceToNextQuestion(state, 150);
    assertEqual(state.resolvedQuestionCount, 1, "有効な問題が確定したらresolvedQuestionCountが増える");
    assertEqual(state.status, "finished", "targetQuestionCountに届いたらfinishedになる");
  }

  // ---- advanceToNextQuestion：3問連続で無効なら対戦を中断する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(5), allPlayerUids, hostUid: "p1", nowMs: 0, targetQuestionCount: 3 });
    for (let i = 0; i < 3; i++) {
      state = recordAnswer(state, "p1", { selectedSongId: "song-0", replayCount: 0 });
      state = tick(state, 100, true);
      state = advanceToNextQuestion(state, 200);
      state = { ...state, currentQuestion: { ...state.currentQuestion, answersByUid: {} } };
    }
    assertEqual(state.status, MATCH_STATUS_ABORTED_AUDIO_FAILURE, "3問連続で無効なら対戦を中断する");
  }

  // ---- summarizePlayerOutcomes：正解数・正解した問題だけの再視聴合計を正しく集計する ----
  {
    const outcomes = [
      { isCorrect: true, isUnknown: false, replayCount: 0 },
      { isCorrect: true, isUnknown: false, replayCount: 2 },
      { isCorrect: false, isUnknown: false, replayCount: 3 }, // 不正解：順位には使わない再視聴
      { isCorrect: false, isUnknown: true, replayCount: 1 }, // わからない：これも順位には使わない
    ];
    const summary = summarizePlayerOutcomes(outcomes);
    assertEqual(summary.totalQuestions, 4, "全問題数");
    assertEqual(summary.correctCount, 2, "正解数");
    assertEqual(summary.wrongCount, 1, "不正解数（わからないは含めない）");
    assertEqual(summary.dontKnowCount, 1, "わからない数");
    assertEqual(summary.correctOnlyReplaySum, 2, "正解した問題だけの再視聴合計（不正解・わからない分は含めない）");
    assertEqual(summary.totalReplayCount, 6, "参考記録としての全問題を通した再視聴合計");
  }

  // ---- summarizePlayerOutcomes：空配列でも安全に0を返す ----
  {
    const summary = summarizePlayerOutcomes([]);
    assertEqual(summary.correctCount, 0, "問題が無ければ正解数は0");
    assertEqual(summary.correctOnlyReplaySum, 0, "問題が無ければ再視聴合計も0");
  }

  // ---- compareInstantBattlePlayerResults：正解数が多い方が上位（再視聴回数に関わらず） ----
  {
    const better = { correctCount: 3, correctOnlyReplaySum: 5 };
    const worse = { correctCount: 2, correctOnlyReplaySum: 0 };
    assertEqual(compareInstantBattlePlayerResults(better, worse) < 0, true, "正解数が多い方が上位");
  }

  // ---- computeFinalResults：本人指定の具体例（A/B/Cの3人）で最終順位を確認 ----
  // A：8問正解・再視聴5回、B：8問正解・再視聴2回、C：7問正解・再視聴0回
  // → 期待される順位：1位B、2位A、3位C（正解数が同じA・Bは再視聴回数の少ないBが上位。
  //   Cは再視聴0回でもAB両方より正解数が少ないため3位のまま）。
  {
    const makeOutcome = (isCorrect, replayCount) => ({ isCorrect, isUnknown: false, replayCount });
    const questionOutcomesByIndex = {
      0: { isVoid: false, perPlayerOutcome: { A: makeOutcome(true, 1), B: makeOutcome(true, 1), C: makeOutcome(true, 0) } },
      1: { isVoid: false, perPlayerOutcome: { A: makeOutcome(true, 4), B: makeOutcome(true, 1), C: makeOutcome(false, 0) } },
      2: { isVoid: true }, // 無効な問題は集計から除外される
    };
    const results = computeFinalResults({ allPlayerUids: ["A", "B", "C"], questionOutcomesByIndex });
    assertEqual(results.A.correctCount, 2, "Aの正解数");
    assertEqual(results.A.correctOnlyReplaySum, 5, "Aの正解した問題だけの再視聴合計");
    assertEqual(results.B.correctOnlyReplaySum, 2, "Bの正解した問題だけの再視聴合計");
    assertEqual(results.C.correctCount, 1, "Cの正解数");
    assertEqual(results.B.rank, 1, "Bが1位（正解数同数でも再視聴が少ない）");
    assertEqual(results.A.rank, 2, "Aが2位");
    assertEqual(results.C.rank, 3, "Cが3位");
  }

  // ---- computeFinalResults：完全に同じ成績なら同着（同じ順位）になる ----
  {
    const makeOutcome = (isCorrect, replayCount) => ({ isCorrect, isUnknown: false, replayCount });
    const questionOutcomesByIndex = {
      0: { isVoid: false, perPlayerOutcome: { A: makeOutcome(true, 1), B: makeOutcome(true, 1), C: makeOutcome(false, 0) } },
    };
    const results = computeFinalResults({ allPlayerUids: ["A", "B", "C"], questionOutcomesByIndex });
    assertEqual(results.A.rank, 1, "同着なら同じ順位（A）");
    assertEqual(results.B.rank, 1, "同着なら同じ順位（B）");
    assertEqual(results.C.rank, 3, "次の順位は同着の人数分飛ぶ");
  }

  // ---- restoreMatchProgressFromFirebase：ホストのリロード・再接続からの復元 ----
  {
    const questions = buildDummyQuestions(2);
    const match = {
      currentQuestionIndex: 1,
      questionStatus: "active",
      instantQuestionOutcomes: {
        0: { isVoid: false, perPlayerOutcome: { p1: { isCorrect: true, isUnknown: false, selectedSongId: "song-0", replayCount: 0 }, p2: { isCorrect: false, isUnknown: false, selectedSongId: "distractor-0-a", replayCount: 1 } } },
      },
      instantAnswers: { 1: { p1: { selectedSongId: "song-1", replayCount: 0 } } },
    };
    const restored = restoreMatchProgressFromFirebase({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", match, nowMs: 1000, targetQuestionCount: 2 });
    assertEqual(restored.currentQuestionIndex, 1, "現在の問題番号を復元する");
    assertEqual(restored.resolvedQuestionCount, 1, "確定済みの問題数（無効でないもの）を復元する");
    assertEqual(restored.currentQuestion.answersByUid.p1.selectedSongId, "song-1", "今の問題の回答状況も復元する");
    assertEqual(restored.status, "inProgress", "まだ全問終わっていなければinProgress");
  }

  // ---- restoreMatchProgressFromFirebase：無効な問題は復元時もresolvedQuestionCountに数えない ----
  {
    const questions = buildDummyQuestions(2);
    const match = {
      currentQuestionIndex: 1,
      questionStatus: "active",
      instantQuestionOutcomes: { 0: { isVoid: true } },
      instantAnswers: {},
    };
    const restored = restoreMatchProgressFromFirebase({ questions, allPlayerUids: ["p1"], hostUid: "p1", match, nowMs: 1000, targetQuestionCount: 2 });
    assertEqual(restored.resolvedQuestionCount, 0, "無効な問題は復元時もresolvedQuestionCountに数えない");
    assertEqual(restored.consecutiveVoidCount, 1, "連続無効カウントも復元する");
  }
}
