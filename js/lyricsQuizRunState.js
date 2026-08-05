// 歌詞クイズ1人用MVPの「進行状態」（今何問目か・各解答の記録）だけを扱う純粋関数群。
// DOM操作・localStorage・タイマー等は一切行わない。js/lyricsQuizScreen.js側が
// この状態をモジュール変数として保持し、ユーザー操作のたびにここの関数へ渡して
// 「次の状態」を受け取り、その内容を画面へ描画する。
//
// こう切り出しておく理由：進行状態のバグ（例：リトライ時に前回の回答が混ざる、
// 最終問題の後に結果が2回作られる等）は、実際に画面を操作しなくても
// この状態遷移だけを見れば検知できるため、tests/lyricsQuizRunState.test.jsで
// 画面のDOMを一切使わずに恒久テストできるようにしている。

import { LYRICS_QUIZ_ANSWER_OUTCOME } from "./lyricsQuizEngine.js";

// 新しい回（問題セットが決まった直後）の初期状態を作る。
// 「もう一度挑戦する」のときも必ずこの関数を通すことで、前回の回答・結果が
// 混ざらないようにする（毎回answersを空配列から作り直す）。
export function createLyricsQuizRunState(questions) {
  return {
    questions,
    currentQuestionIndex: 0,
    currentHintCount: 1,
    answers: [],
  };
}

// 今表示すべき問題を返す（全問終わっていればnull）。
export function getCurrentQuestion(state) {
  return state.questions[state.currentQuestionIndex] ?? null;
}

// 全問終わっているか。
export function isRunFinished(state) {
  return state.currentQuestionIndex >= state.questions.length;
}

// ヒントを1段階進めた状態を返す。今の問題が持つヒント段階数を超えて進めることは
// できず、その場合は状態を変えずにそのまま返す（呼び出し側は「これ以上進められない」
// と判断できる）。
export function advanceHint(state) {
  const question = getCurrentQuestion(state);
  if (!question) return state;
  if (state.currentHintCount >= question.hints.length) return state;
  return { ...state, currentHintCount: state.currentHintCount + 1 };
}

// 今の問題に解答を記録し、次の問題へ進めた状態を返す。
// elapsedMsはDate.now()を使う都合上、呼び出し側（画面側）で計算して渡してもらう
// （このファイル自体はDate.now()等の非純粋な処理を持たない設計にするため）。
// 記録と同時にcurrentQuestionIndexを進め、currentHintCountを1へ戻す
// （次の問題はヒント1から始まるため）。
export function recordAnswerAndAdvance(state, outcome, elapsedMs) {
  const question = getCurrentQuestion(state);
  if (!question) return state;

  const answer = {
    songId: question.song.id,
    isCorrect: outcome === LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT,
    outcome,
    hintsUsedCount: state.currentHintCount,
    elapsedMs,
  };

  return {
    ...state,
    answers: [...state.answers, answer],
    currentQuestionIndex: state.currentQuestionIndex + 1,
    currentHintCount: 1,
  };
}
