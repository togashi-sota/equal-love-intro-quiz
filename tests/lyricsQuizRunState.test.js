// js/lyricsQuizRunState.js（歌詞クイズ1人用MVPの進行状態）のテスト。
// 画面のDOMは一切使わず、状態遷移だけを確認する。歌詞本文は扱わないファイルのため、
// テストデータも曲名・曲idのダミー値のみ。

import {
  createLyricsQuizRunState,
  getCurrentQuestion,
  isRunFinished,
  advanceHint,
  recordAnswerAndAdvance,
} from "../js/lyricsQuizRunState.js";
import { LYRICS_QUIZ_ANSWER_OUTCOME } from "../js/lyricsQuizEngine.js";
import { assertEqual } from "./test-utils.js";

function buildDummyQuestions(count, hintCountPerQuestion = 3) {
  return Array.from({ length: count }, (_, i) => ({
    song: { id: `song-${i}`, title: `曲${i}` },
    segments: [],
    hints: Array.from({ length: hintCountPerQuestion }, (_, h) => ({ segmentId: `seg-${i}-${h}` })),
    answerPool: [{ id: `song-${i}`, title: `曲${i}` }],
  }));
}

export function runLyricsQuizRunStateTests() {
  // ===== 新規実行時、currentQuestionIndexは0から始まる =====

  {
    const questions = buildDummyQuestions(3);
    const state = createLyricsQuizRunState(questions);
    assertEqual(state.currentQuestionIndex, 0, "新規作成した状態はcurrentQuestionIndex=0から始まる");
    assertEqual(state.currentHintCount, 1, "新規作成した状態はヒント1段階目から始まる");
    assertEqual(state.answers, [], "新規作成した状態はanswersが空配列");
    assertEqual(getCurrentQuestion(state), questions[0], "getCurrentQuestion()は最初の問題を返す");
    assertEqual(isRunFinished(state), false, "問題が残っていればisRunFinished()はfalse");
  }

  // ===== リトライ時、0にリセットされる（前回の回答・結果が混ざらない） =====

  {
    const questionsA = buildDummyQuestions(2);
    let stateA = createLyricsQuizRunState(questionsA);
    stateA = recordAnswerAndAdvance(stateA, LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT, 1000);
    stateA = recordAnswerAndAdvance(stateA, LYRICS_QUIZ_ANSWER_OUTCOME.WRONG_ANSWER, 2000);
    assertEqual(stateA.answers.length, 2, "前提: 1回目の実行では2件の回答が記録されている");

    // 「もう一度挑戦する」は毎回createLyricsQuizRunState()を呼び直すだけなので、
    // 別の問題セットで作り直しても前回の状態から一切引き継がれないことを確認する。
    const questionsB = buildDummyQuestions(2);
    const stateB = createLyricsQuizRunState(questionsB);
    assertEqual(stateB.currentQuestionIndex, 0, "リトライ後はcurrentQuestionIndexが0に戻る");
    assertEqual(stateB.answers, [], "リトライ後はanswersが空配列に戻り、前回の回答が混ざらない");
    assertEqual(stateA.answers.length, 2, "リトライ後も1回目の状態オブジェクト自体は書き換えられていない（参照共有していない）");
  }

  // ===== 正解後にcurrentQuestionIndexが進む =====

  {
    const questions = buildDummyQuestions(3);
    let state = createLyricsQuizRunState(questions);
    state = recordAnswerAndAdvance(state, LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT, 1500);
    assertEqual(state.currentQuestionIndex, 1, "正解を記録するとcurrentQuestionIndexが1つ進む");
    assertEqual(state.currentHintCount, 1, "次の問題はヒント1段階目から始まる（前の問題のヒント段階を引き継がない）");
  }

  // ===== 不正解・スキップを正しく記録する =====

  {
    const questions = buildDummyQuestions(2);
    let state = createLyricsQuizRunState(questions);
    state = recordAnswerAndAdvance(state, LYRICS_QUIZ_ANSWER_OUTCOME.WRONG_ANSWER, 1000);
    assertEqual(state.answers[0].isCorrect, false, "不正解はisCorrect:falseで記録される");
    assertEqual(state.answers[0].outcome, LYRICS_QUIZ_ANSWER_OUTCOME.WRONG_ANSWER, "不正解はoutcome:wrongAnswerで記録される");

    state = recordAnswerAndAdvance(state, LYRICS_QUIZ_ANSWER_OUTCOME.SKIPPED, 500);
    assertEqual(state.answers[1].isCorrect, false, "スキップもisCorrect:falseとして集計対象になる（本人の指示どおり）");
    assertEqual(state.answers[1].outcome, LYRICS_QUIZ_ANSWER_OUTCOME.SKIPPED, "スキップは内部的にoutcome:skippedとして不正解と区別される");
  }

  // ===== ヒント段階が上限を超えない =====

  {
    const questions = buildDummyQuestions(1, 3);
    let state = createLyricsQuizRunState(questions);
    state = advanceHint(state);
    state = advanceHint(state);
    assertEqual(state.currentHintCount, 3, "ヒントは最大段階数（3）まで進む");
    state = advanceHint(state);
    assertEqual(state.currentHintCount, 3, "最大段階数を超えて進めようとしても変化しない");
  }

  // ===== 最終問題の後にisRunFinished()がちょうど1回だけtrueへ切り替わる =====

  {
    const questions = buildDummyQuestions(3);
    let state = createLyricsQuizRunState(questions);
    const finishedFlags = [];

    finishedFlags.push(isRunFinished(state));
    state = recordAnswerAndAdvance(state, LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT, 100);
    finishedFlags.push(isRunFinished(state));
    state = recordAnswerAndAdvance(state, LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT, 100);
    finishedFlags.push(isRunFinished(state));
    state = recordAnswerAndAdvance(state, LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT, 100);
    finishedFlags.push(isRunFinished(state));

    assertEqual(finishedFlags, [false, false, false, true], "isRunFinished()は最後の問題に解答した直後だけtrueになる");
    assertEqual(state.answers.length, questions.length, "全問終了時、記録された解答数は問題数と一致する（重複記録なし）");

    // 全問終了後にさらに解答を記録しようとしても、範囲外なので何も起きない
    // （画面側がisRunFinished()を見てonFinish()を呼んだ後、誤って呼び出しても壊れない）。
    const stateAfterFinish = recordAnswerAndAdvance(state, LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT, 100);
    assertEqual(stateAfterFinish.answers.length, questions.length, "全問終了後に記録を試みても解答数は増えない");
    assertEqual(getCurrentQuestion(state), null, "全問終了後、getCurrentQuestion()はnullを返す");
  }
}
