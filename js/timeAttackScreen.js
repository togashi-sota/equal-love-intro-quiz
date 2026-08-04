// タイムアタックの設定画面・結果画面を担当するファイル。
// クイズ本編（出題・選択肢生成・音源再生・タイマー）はjs/quiz.js・js/state.js・js/audio.js・
// js/timer.jsをそのまま再利用し、このファイルは「タイムアタックだけの記録（合計タイム・
// ミス数）の管理」と「設定・結果、2つの画面の組み立て」に専念する。
//
// 実行中の記録（合計タイム・ミス数など）は、既存のgameState（js/state.js）には一切持たせず、
// このファイルのモジュール内変数だけで完結させている。既存の得点・自己ベスト・称号・
// プレイ履歴のどの仕組みにも触れない、完全に独立した記録として扱うため
// （本人の要望：「通常クイズの履歴・称号・自己ベストとは混ぜず、タイムアタック専用の
// 記録にする」）。

import { SONGS } from "./data/songs.js";
import { filterSongsByCategory, validatePoolSize, resolveQuestionCount, buildQuizQuestions } from "./quiz.js";
import {
  getTimeAttackBest,
  saveTimeAttackBestIfBetter,
  saveTimeAttackBestReachIfBetter,
} from "./timeAttackScore.js";
import { saveTimeAttackHistoryEntry } from "./timeAttackHistory.js";

// ルール（3種類）。
// normal    ：間違えた選択肢だけ消える消去法。正解したら即次へ。ミス数を記録する。
// hard      ：1回間違えたら、正解を見せずに即次の問題へ進む（消去法なし）。ミス数を記録する。
// loveChain ：ガチ勢向け。1回でも間違えた瞬間にその場でゲーム終了し、即結果画面へ。
//             自己ベストは「全問クリアできたときのタイム」だけを対象にする（2026-08-06追加）。
export const TIME_ATTACK_RULE = { NORMAL: "normal", HARD: "hard", LOVE_CHAIN: "loveChain" };

let elements = null;
let resultElements = null;

// ===== 1. 設定画面 =====

export function initTimeAttackScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", () => {
    const questionCountValue = document.querySelector('input[name="time-attack-question-count"]:checked').value;
    const categoryFilterValue = document.querySelector('input[name="time-attack-category-filter"]:checked').value;
    const rule = document.querySelector('input[name="time-attack-rule"]:checked').value;
    elements.onStart(questionCountValue, categoryFilterValue, rule);
  });
}

// ===== 実行中の記録（gameStateとは別に、このファイルだけで完結させる） =====

let currentRule = TIME_ATTACK_RULE.NORMAL;
let currentQuestionCountValue = null;
let currentCategoryFilterValue = null;
let totalElapsedMs = 0;
let correctCount = 0;
let missCount = 0;
let perQuestionResults = []; // 履歴の詳細画面に必要な情報一式（下のrecordTimeAttackAnswer参照）
let missCountThisQuestion = 0; // 今の問題で、これまでに何回間違えたか（ノーマルルールで加算していく）
let selectedAnswersThisQuestion = []; // 今の問題で、押した順に選択肢の曲名を貯める（履歴の詳細表示用）
let runFailed = false; // LOVE連チャンで、全問クリアできずに終了したかどうか

// タイムアタックを開始する直前に呼ぶ。実行中の記録をすべてリセットする。
export function startTimeAttackRun(rule, questionCountValue, categoryFilterValue) {
  currentRule = rule;
  currentQuestionCountValue = questionCountValue;
  currentCategoryFilterValue = categoryFilterValue;
  totalElapsedMs = 0;
  correctCount = 0;
  missCount = 0;
  perQuestionResults = [];
  missCountThisQuestion = 0;
  selectedAnswersThisQuestion = [];
  runFailed = false;
}

export function getCurrentTimeAttackRule() {
  return currentRule;
}

// 実行中の記録を読み取り専用で取得する（保存は一切行わない）。
// 対戦モード（js/localBattleScreen.js）が、タイムアタックと全く同じ「ノーマル/ハード/
// LOVE連チャンのテンポ良い進行ルール」を再利用するために追加した（2026-08-06）。
// 対戦モードは結果の保存先（自己ベスト・履歴）がタイムアタックとは完全に別なので、
// renderTimeAttackResult()（保存まで行う）は呼ばず、この関数で生の数値だけを受け取る。
export function getCurrentTimeAttackStats() {
  return { totalElapsedMs, correctCount, missCount, perQuestionResults, runFailed };
}

// LOVE連チャンで1回間違えて即終了になったときに呼ぶ。renderTimeAttackResult()側で、
// 自己ベストの保存をスキップし、「失敗しました」の表示に切り替えるために使う。
export function markTimeAttackRunFailed() {
  runFailed = true;
}

// ノーマルルールで不正解の選択肢を選んだときに呼ぶ。今の問題のミス回数を1増やすだけで、
// 問題そのものは終わらせない（呼び出し側で、その選択肢ボタンを無効化する）。
export function registerTimeAttackMiss() {
  missCountThisQuestion += 1;
}

// 選択肢をクリックするたびに呼ぶ（正解・不正解どちらでも）。押した順に曲名を積み上げておき、
// 1問終わったときの履歴に「間違えた曲A→間違えた曲B→正解曲」のような形で残せるようにする。
export function registerTimeAttackSelection(choiceTitle) {
  selectedAnswersThisQuestion.push(choiceTitle);
}

// 1問分の結果を記録する（正解した瞬間、またはhard／LOVE連チャンルールで1回間違えた瞬間に呼ばれる）。
// elapsedMsがnull（音源再生に失敗した等）の場合は、合計タイムには加算しない
// （実測できていない時間を0扱いで加算すると、合計タイムが不当に有利になってしまうため）。
// missCountThisQuestion・selectedAnswersThisQuestionは、ここまでに積み上げた分をそのまま使い、
// 記録し終えたら次の問題のためにリセットする。
// question（js/state.jsのgetCurrentQuestion()の戻り値）から、履歴の詳細表示に必要な
// 「その問題で表示された4択」「正解の曲名」を取り出して一緒に保存する。
export function recordTimeAttackAnswer({ elapsedMs, isCorrect, question }) {
  if (elapsedMs !== null) {
    totalElapsedMs += elapsedMs;
  }
  if (isCorrect) {
    correctCount += 1;
  }
  missCount += missCountThisQuestion;
  perQuestionResults.push({
    questionNumber: perQuestionResults.length + 1,
    songId: question.song.id,
    choices: question.choices.map((choice) => ({ id: choice.id, title: choice.title })),
    correctAnswer: question.song.title,
    selectedAnswers: [...selectedAnswersThisQuestion],
    elapsedMs,
    missCountThisQuestion,
    isCorrect,
  });
  missCountThisQuestion = 0;
  selectedAnswersThisQuestion = [];
}

// ===== 2. 結果画面 =====

export function initTimeAttackResultScreen(newElements) {
  resultElements = newElements;
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

const RULE_LABELS = {
  [TIME_ATTACK_RULE.NORMAL]: "ノーマル",
  [TIME_ATTACK_RULE.HARD]: "ハード",
  [TIME_ATTACK_RULE.LOVE_CHAIN]: "LOVE連チャン",
};

// 結果画面を描画し、自己ベスト・最高到達記録の判定・保存、履歴の保存もすべてここで行う
// （タイムアタックの1回のプレイが「終わった」瞬間に必ず1回だけ通る場所のため）。
// LOVE連チャンで全問クリアできずに終了した場合（runFailed）は、そもそも「記録」として
// 扱わないため、自己ベストの保存はスキップし、代わりに失敗した旨を表示する。
// 「タイトルへ」で中断した場合はこの関数自体が呼ばれないため、履歴にも残らない
// （既存の通常プレイ履歴と同じ考え方）。
export function renderTimeAttackResult() {
  const previousBest = getTimeAttackBest(currentRule, currentQuestionCountValue, currentCategoryFilterValue);
  const isNewRecord =
    !runFailed &&
    saveTimeAttackBestIfBetter(totalElapsedMs, currentRule, currentQuestionCountValue, currentCategoryFilterValue);

  // LOVE連チャンだけ「最高到達記録」も判定・保存する（成功・失敗どちらでも、
  // 到達できた問題数自体は意味のある記録のため）。他の2ルールは全問必ず最後まで進むので対象外。
  if (currentRule === TIME_ATTACK_RULE.LOVE_CHAIN) {
    saveTimeAttackBestReachIfBetter(
      perQuestionResults.length,
      totalElapsedMs,
      currentQuestionCountValue,
      currentCategoryFilterValue
    );
  }

  const failedAtQuestionNumber = runFailed ? perQuestionResults.length : null;
  saveTimeAttackHistoryEntry({
    rule: currentRule,
    questionCountValue: currentQuestionCountValue,
    categoryFilterValue: currentCategoryFilterValue,
    totalElapsedMs,
    correctCount,
    missCount,
    completed: !runFailed,
    failedAtQuestionNumber,
    isNewRecord,
    perQuestionResults,
  });

  resultElements.totalTime.textContent = `${formatSeconds(totalElapsedMs)}秒`;
  resultElements.correctCount.textContent = `${correctCount} / ${perQuestionResults.length}問`;
  resultElements.missCount.textContent = `${missCount}回`;
  resultElements.ruleLabel.textContent = RULE_LABELS[currentRule] ?? "ノーマル";

  resultElements.newRecordBadge.hidden = !isNewRecord;
  resultElements.failStatus.hidden = !runFailed;
  if (runFailed) {
    resultElements.failStatus.textContent = `${perQuestionResults.length}問目で失敗しました（LOVE連チャンは全問クリアのタイムだけが記録されます）`;
  }

  if (previousBest !== null) {
    resultElements.bestTime.hidden = false;
    resultElements.bestTime.textContent = isNewRecord
      ? `自己ベストを更新しました（前回: ${formatSeconds(previousBest)}秒）`
      : `自己ベスト: ${formatSeconds(previousBest)}秒`;
  } else if (!runFailed) {
    resultElements.bestTime.hidden = false;
    resultElements.bestTime.textContent = "はじめての記録です";
  } else {
    resultElements.bestTime.hidden = true;
  }
}

// 「もう一度挑戦する」「同じ条件でもう一度」用に、直前の条件をそのまま返す。
export function getLastTimeAttackSelection() {
  return {
    questionCountValue: currentQuestionCountValue,
    categoryFilterValue: currentCategoryFilterValue,
    rule: currentRule,
  };
}

// タイムアタックの問題セットを組み立てる（曲プールの絞り込み・検証から問題生成まで）。
// main.js側の「開始」処理から呼ぶ共通処理。既存のbeginQuiz()と同じ考え方だが、
// 戻り値としてquestionsを返すだけにとどめ、実際にgameStateへ反映する処理
// （startTimeAttackQuiz呼び出し）はmain.js側が行う（main.js側の既存の書き方に合わせるため）。
// 曲数不足等でクイズを組み立てられない場合はnullを返す。
export function buildTimeAttackQuestions(questionCountValue, categoryFilterValue) {
  const pool = filterSongsByCategory(SONGS, categoryFilterValue);
  const errorMessage = validatePoolSize(pool);
  if (errorMessage) return null;

  const questionCount = resolveQuestionCount(questionCountValue, pool.length);
  return buildQuizQuestions(pool, questionCount);
}
