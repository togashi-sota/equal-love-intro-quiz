// アプリの起点となるファイル。
// 各モジュール（state.js, screens.js など）を import してつなぎ合わせていく。

import { SONGS } from "./data/songs.js";
import { showScreen } from "./screens.js";
import {
  gameState,
  resetGameState,
  startQuiz,
  getCurrentQuestion,
  recordAnswer,
  advanceToNextQuestion,
} from "./state.js";
import {
  filterSongsByCategory,
  resolveQuestionCount,
  validatePoolSize,
  buildQuizQuestions,
} from "./quiz.js";
import { playSongIntro, stopAudio } from "./audio.js";
import { startTimer, stopTimer } from "./timer.js";
import { calculateScore, calculateRank } from "./score.js";
import { getHighScore, saveHighScoreIfBetter } from "./highscore.js";
import { playClickSound, playCorrectSound, playWrongSound, playCountUpSound } from "./sfx.js";

const startScreenElement = document.getElementById("start-screen");
const quizScreenElement = document.getElementById("quiz-screen");
const startErrorElement = document.getElementById("start-error");
const questionProgressElement = document.getElementById("question-progress");
const progressDotsElement = document.getElementById("progress-dots");
const choiceButtonElements = document.querySelectorAll(".choice-button");
const feedbackElement = document.getElementById("feedback");
const nextButtonElement = document.getElementById("next-button");
const audioErrorElement = document.getElementById("audio-error");
const timerDisplayElement = document.getElementById("timer-display");
const totalScoreElement = document.getElementById("total-score-display");
const rankElement = document.getElementById("rank-display");
const highScoreElement = document.getElementById("high-score-display");
const newRecordElement = document.getElementById("new-record-badge");
const answerLogListElement = document.getElementById("answer-log-list");

// 音源の再生に失敗したときの表示処理。
// タイマーや得点処理は止めず、エラーメッセージを出すだけに留める。
function showAudioError(message) {
  audioErrorElement.textContent = message;
  audioErrorElement.hidden = false;
}

// 残り秒数がこの値以下になったら、緊迫感を出す演出に切り替える。
const URGENT_THRESHOLD_SEC = 3;

// 得点カウントアップ演出にかける時間。
const SCORE_COUNT_UP_DURATION_MS = 800;

// 合計得点を0から実際の点数まで、アニメーションしながらカウントアップ表示する。
// 「モーションを減らす」設定が有効な環境では、演出をせず即座に最終的な点数を表示する。
function animateScoreCountUp(finalScore) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    totalScoreElement.textContent = `合計得点: ${finalScore}点`;
    return;
  }

  playCountUpSound();
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / SCORE_COUNT_UP_DURATION_MS);
    const currentScore = Math.floor(finalScore * progress);
    totalScoreElement.textContent = `合計得点: ${currentScore}点`;

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// タイマーの残り秒数表示を更新する。残りわずかになったら赤く拍動させる。
function updateTimerDisplay(remainingSec) {
  timerDisplayElement.textContent = `残り: ${remainingSec}秒`;
  timerDisplayElement.classList.toggle("is-urgent", remainingSec <= URGENT_THRESHOLD_SEC);
}

// 正解の選択肢に「is-correct」（キラキラ演出）、選んでしまった不正解の選択肢に
// 「is-wrong」（シェイク演出）のクラスを付ける。selectedChoiceIdがnullなら
// （＝時間切れで何も選んでいない）正解の表示だけを行う。
function markChoiceButtons(selectedChoiceId) {
  const question = getCurrentQuestion();
  choiceButtonElements.forEach((button, index) => {
    const choice = question.choices[index];
    if (choice.id === question.song.id) {
      button.classList.add("is-correct");
    } else if (choice.id === selectedChoiceId) {
      button.classList.add("is-wrong");
    }
  });
}

// 次の問題を表示する前に、前の問題の演出クラスを消しておく。
function clearChoiceButtonStates() {
  choiceButtonElements.forEach((button) => {
    button.classList.remove("is-correct", "is-wrong");
  });
}

// 制限時間切れになったときの処理。
// 「回答なし＝不正解・0点」として記録し、正解を表示して次へ進めるようにする。
function handleTimeout() {
  // クリックとタイムアウトがほぼ同時に起きても二重に処理しないためのガード。
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;

  const question = getCurrentQuestion();
  recordAnswer(false, 0);
  markChoiceButtons(null);
  playWrongSound();
  feedbackElement.textContent = `時間切れ… 不正解（正解は「${question.song.title}」）`;
  feedbackElement.hidden = false;
  nextButtonElement.hidden = false;
}

// 選択肢ボタンをクリックしたときの処理。
// 正解なら残り秒数に応じたスピードボーナス、不正解なら0点として記録する。
function handleChoiceClick(selectedChoice) {
  // タイムアウトとクリックがほぼ同時に起きても二重に処理しないためのガード。
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  stopTimer();

  const question = getCurrentQuestion();
  const isCorrect = selectedChoice.id === question.song.id;
  const points = isCorrect ? calculateScore(gameState.remainingSec) : 0;
  recordAnswer(isCorrect, points);
  markChoiceButtons(selectedChoice.id);
  if (isCorrect) {
    playCorrectSound();
  } else {
    playWrongSound();
  }

  feedbackElement.textContent = isCorrect
    ? `正解！ +${points}点`
    : `不正解…（正解は「${question.song.title}」）`;
  feedbackElement.hidden = false;
  nextButtonElement.hidden = false;
}

// 出題の進み具合を示すドットを表示する。
// 答え終えた問題は塗りつぶし、今の問題は少し大きく強調し、まだの問題は白抜きにする。
function renderProgressDots() {
  progressDotsElement.innerHTML = "";
  gameState.questions.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.classList.add("dot");
    if (index < gameState.currentIndex) {
      dot.classList.add("is-done");
    } else if (index === gameState.currentIndex) {
      dot.classList.add("is-current");
    }
    progressDotsElement.appendChild(dot);
  });
}

// 今の問題の内容（進捗・4択の曲名）をクイズ画面に反映し、イントロ音源とタイマーを開始する。
function renderQuestion() {
  const question = getCurrentQuestion();
  questionProgressElement.textContent = `第${gameState.currentIndex + 1}問 / ${gameState.questions.length}問`;
  renderProgressDots();

  choiceButtonElements.forEach((button, index) => {
    button.textContent = question.choices[index].title;
  });

  feedbackElement.hidden = true;
  nextButtonElement.hidden = true;
  audioErrorElement.hidden = true;
  clearChoiceButtonStates();

  playSongIntro(question.song, showAudioError);
  startTimer(updateTimerDisplay, handleTimeout);
}

// 結果画面に、合計得点・自己ベスト・1問ごとの内訳を反映する。
function renderResult() {
  animateScoreCountUp(gameState.score);
  const rank = calculateRank(gameState.score, gameState.questions.length);
  rankElement.textContent = `ランク: ${rank}`;
  rankElement.classList.toggle("is-rank-s", rank === "S");

  const isNewRecord = saveHighScoreIfBetter(gameState.score);
  highScoreElement.textContent = `自己ベスト: ${getHighScore()}点`;
  newRecordElement.hidden = !isNewRecord;

  answerLogListElement.innerHTML = "";
  gameState.answerLog.forEach((entry, index) => {
    const item = document.createElement("li");
    item.classList.add(entry.isCorrect ? "is-correct-row" : "is-wrong-row");
    const resultLabel = entry.isCorrect ? "正解" : "不正解";
    item.textContent = `第${index + 1}問「${entry.song.title}」: ${resultLabel}（${entry.pointsEarned}点）`;
    answerLogListElement.appendChild(item);
  });
}

// 4つの選択肢ボタンに、それぞれクリック時の処理を割り当てる。
// ボタンの並び自体は固定なので、クリック時に「今の問題」の該当インデックスの選択肢を参照する。
choiceButtonElements.forEach((button, index) => {
  button.addEventListener("click", () => {
    const question = getCurrentQuestion();
    handleChoiceClick(question.choices[index]);
  });
});

// スタートボタンを押したときの処理。
// 出題数・カテゴリの選択を読み取り、出題可能な曲プールを絞り込んで検証してから、
// 問題一式を生成してクイズを開始する。
document.getElementById("start-button").addEventListener("click", () => {
  playClickSound();
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;

  const pool = filterSongsByCategory(SONGS, categoryFilterValue);
  const errorMessage = validatePoolSize(pool);

  if (errorMessage) {
    startErrorElement.textContent = errorMessage;
    startErrorElement.hidden = false;
    return;
  }

  startErrorElement.hidden = true;
  const questionCount = resolveQuestionCount(questionCountValue, pool.length);
  const questions = buildQuizQuestions(pool, questionCount);
  startQuiz(questions);
  renderQuestion();

  showScreen("quiz");
});

document.getElementById("next-button").addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();

  const hasMoreQuestions = advanceToNextQuestion();
  if (hasMoreQuestions) {
    renderQuestion();
    return;
  }

  renderResult();
  showScreen("result");
});

document.getElementById("retry-button").addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  resetGameState();
  showScreen("start");
});

// キーボード操作対応。マウス・タップ操作は今まで通り使えるようにしたうえで、
// 今表示されている画面に応じてキー入力を割り当てる。
document.addEventListener("keydown", (event) => {
  // スタート画面：Enterキーでスタート
  if (startScreenElement.classList.contains("is-active") && event.key === "Enter") {
    document.getElementById("start-button").click();
    return;
  }

  if (quizScreenElement.classList.contains("is-active")) {
    // クイズ画面：1〜4キーで、対応する選択肢を選ぶ
    const choiceIndex = Number(event.key) - 1;
    if (choiceIndex >= 0 && choiceIndex < choiceButtonElements.length) {
      choiceButtonElements[choiceIndex].click();
      return;
    }

    // クイズ画面：回答後（次へボタンが表示されているとき）にEnterキーで次の問題へ
    if (event.key === "Enter" && !nextButtonElement.hidden) {
      nextButtonElement.click();
    }
  }
});
