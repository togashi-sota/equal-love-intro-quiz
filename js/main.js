// アプリの起点となるファイル。
// 各モジュール（state.js, screens.js など）を import してつなぎ合わせていく。

import { SONGS } from "./data/songs.js";
import { showScreen } from "./screens.js";
import {
  gameState,
  resetGameState,
  startQuiz,
  startReviewQuiz,
  getCurrentQuestion,
  recordAnswer,
  advanceToNextQuestion,
  markPlaybackStarted,
  getElapsedMsSincePlaybackStart,
  getMissedSongs,
  setReviewSongs,
} from "./state.js";
import {
  filterSongsByCategory,
  resolveQuestionCount,
  validatePoolSize,
  buildQuizQuestions,
  buildReviewQuizQuestions,
} from "./quiz.js";
import { playSongIntro, stopAudio } from "./audio.js";
import { startTimer, stopTimer } from "./timer.js";
import { calculateScore, calculateRank } from "./score.js";
import { getHighScore, saveHighScoreIfBetter } from "./highscore.js";
import { playClickSound, playCorrectSound, playWrongSound, playCountUpSound } from "./sfx.js";
import { renderBackgroundSparkles } from "./decorations.js";
import { renderSongList, resetSongListToDefaultView, stopSongListPreview } from "./songlist.js";
import { buildPlayResult, evaluateAndSaveTitles } from "./titleProgress.js";
import { renderResultTitleEvents, clearResultTitleEvents } from "./titleDisplay.js";
import { initTitleListModal } from "./titleList.js";
import { saveHistoryEntry } from "./history.js";
import { initHistoryScreen, renderHistoryScreen } from "./historyScreen.js";
import { importAudioFiles, getImportedSongIds } from "./audioStorage.js";

// 背景のキラキラ演出は、ゲームの状態と関係なく最初に1回だけ生成すればよい。
renderBackgroundSparkles();

// 収録曲一覧画面の中身も、ゲームの状態と関係なく最初に1回だけ組み立てればよい。
renderSongList(SONGS);

const startScreenElement = document.getElementById("start-screen");
const quizScreenElement = document.getElementById("quiz-screen");
const startErrorElement = document.getElementById("start-error");
const questionCountNoticeElement = document.getElementById("question-count-notice");
const questionProgressElement = document.getElementById("question-progress");
const progressDotsElement = document.getElementById("progress-dots");
const choiceButtonElements = document.querySelectorAll(".choice-button");
const feedbackElement = document.getElementById("feedback");
const nextButtonElement = document.getElementById("next-button");
const skipButtonElement = document.getElementById("skip-button");
const revealButtonElement = document.getElementById("reveal-button");
const audioErrorElement = document.getElementById("audio-error");
const timerDisplayElement = document.getElementById("timer-display");
const totalScoreElement = document.getElementById("total-score-display");
const rankElement = document.getElementById("rank-display");
const rankLetterElement = document.getElementById("rank-letter");
const highScoreElement = document.getElementById("high-score-display");
const newRecordElement = document.getElementById("new-record-badge");
const answerLogListElement = document.getElementById("answer-log-list");
const resultEyebrowLabelElement = document.getElementById("result-eyebrow-label");
const missedSongsSectionElement = document.getElementById("missed-songs-section");
const missedSongsChipRowElement = document.getElementById("missed-songs-chip-row");
const reviewMissedSongsButtonElement = document.getElementById("review-missed-songs-button");
const returnToNormalButtonElement = document.getElementById("return-to-normal-button");
const retryButtonElement = document.getElementById("retry-button");
const modeBestChipElement = document.getElementById("mode-best-chip");
const modeBestConditionElement = document.getElementById("mode-best-condition");
const modeBestValueElement = document.getElementById("mode-best-value");
const rulesLinkElement = document.getElementById("rules-link");
const rulesModalElement = document.getElementById("rules-modal");
const rulesModalCloseButtonElement = document.getElementById("rules-modal-close");
const songlistLinkElement = document.getElementById("songlist-link");
const songlistBackButtonElement = document.getElementById("songlist-back-button");
const titleEventListElement = document.getElementById("title-event-list");
const titleListLinkFromResultElement = document.getElementById("title-list-link-from-result");
const titleListLinkElement = document.getElementById("title-list-link");
const titleListModalElement = document.getElementById("title-list-modal");
const titleListModalCardElement = titleListModalElement.querySelector(".modal-card");
const titleListModalCloseButtonElement = document.getElementById("title-list-modal-close");
const titleListContainerElement = document.getElementById("title-list-container");
const historyLinkElement = document.getElementById("history-link");
const historyBackButtonElement = document.getElementById("history-back-button");
const historyClearConfirmModalElement = document.getElementById("history-clear-confirm-modal");
const quizBackButtonElement = document.getElementById("quiz-back-button");
const quizQuitConfirmModalElement = document.getElementById("quiz-quit-confirm-modal");
const quizQuitCancelButtonElement = document.getElementById("quiz-quit-cancel-button");
const quizQuitConfirmButtonElement = document.getElementById("quiz-quit-confirm-button");
const audioImportStatusElement = document.getElementById("audio-import-status");
const audioImportInputElement = document.getElementById("audio-import-input");
const audioImportResultElement = document.getElementById("audio-import-result");
const updateAvailableBannerElement = document.getElementById("update-available-banner");
const updateReloadButtonElement = document.getElementById("update-reload-button");

// 称号一覧モーダルの開閉ロジックはtitleList.jsに閉じ込めてあるので、
// ここでは必要なDOM要素を渡して初期化するだけでよい。
initTitleListModal({
  overlay: titleListModalElement,
  modalCard: titleListModalCardElement,
  closeButton: titleListModalCloseButtonElement,
  listContainer: titleListContainerElement,
  openTriggers: [titleListLinkElement, titleListLinkFromResultElement],
});

// プレイ履歴画面のサマリー・一覧の描画、削除確認モーダルの開閉ロジックはhistoryScreen.jsに
// 閉じ込めてあるので、ここでは必要なDOM要素を渡して初期化するだけでよい。
initHistoryScreen({
  summaryPlayCount: document.getElementById("history-summary-play-count"),
  summaryAnswerCount: document.getElementById("history-summary-answer-count"),
  summaryAccuracy: document.getElementById("history-summary-accuracy"),
  listContainer: document.getElementById("history-list"),
  emptyState: document.getElementById("history-empty-state"),
  clearButton: document.getElementById("history-clear-button"),
  confirmModalOverlay: historyClearConfirmModalElement,
  confirmCancelButton: document.getElementById("history-clear-cancel-button"),
  confirmDeleteButton: document.getElementById("history-clear-delete-button"),
});

// 音源の再生に失敗したときの表示処理。
// タイマーや得点処理は止めず、エラーメッセージを出すだけに留める。
function showAudioError(message) {
  audioErrorElement.textContent = message;
  audioErrorElement.hidden = false;
}

// 自己ベストのチップに表示する、出題数・カテゴリの短縮ラベル。
// 出題数の「全曲」（5問/10問/20問/50問/全曲）とカテゴリの「全曲」が
// どちらも同じ表記だと紛らわしいため、出題数側だけ「全問」と表記して区別する。
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };

// スタート画面で選択中の出題数・カテゴリに対応する自己ベストを表示する。
// ラジオボタンが切り替わるたびと、スタート画面に戻るたびに呼び出す。
function updateModeBestScoreDisplay() {
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;
  const best = getHighScore(questionCountValue, categoryFilterValue);

  modeBestConditionElement.textContent =
    `${QUESTION_COUNT_LABELS[questionCountValue]}・${CATEGORY_LABELS[categoryFilterValue]}`;
  modeBestValueElement.textContent = best > 0 ? `ベスト ${best}点` : "ベスト 記録なし";
  modeBestChipElement.classList.toggle("is-empty", best === 0);
}

// カテゴリの選択肢に、現在の対象曲数を添える。SONGSから毎回数え直すので、
// 新曲・アルバム曲・配信限定曲を追加しても自動的に数字が更新される。起動時に1回だけ呼べばよい。
function updateCategoryCountHints() {
  document.querySelectorAll(".count-hint[data-category-count]").forEach((hintElement) => {
    const categoryFilterValue = hintElement.dataset.categoryCount;
    const count = filterSongsByCategory(SONGS, categoryFilterValue).length;
    hintElement.textContent = `${count}曲`;
  });
}

// 選んだ出題数が、選んだカテゴリの対象曲数を上回っているときだけ、
// 「実際は何問になるか」を事前に案内する。ラジオボタンが切り替わるたびに呼び出す。
// resolveQuestionCount自体（quiz.js）はすでに曲数に収まるよう切り詰める作りなので、
// ここでは同じ考え方でその結果を先に見せているだけで、出題ロジックには手を加えていない。
function updateQuestionCountNotice() {
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;

  if (questionCountValue === "all") {
    questionCountNoticeElement.hidden = true;
    return;
  }

  const poolSize = filterSongsByCategory(SONGS, categoryFilterValue).length;
  const requestedCount = Number(questionCountValue);
  if (requestedCount > poolSize) {
    questionCountNoticeElement.textContent = `対象曲数が${questionCountValue}曲未満のため、全${poolSize}問を出題します`;
    questionCountNoticeElement.hidden = false;
  } else {
    questionCountNoticeElement.hidden = true;
  }
}

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

// タイマーの経過秒数表示を更新する。
function updateTimerDisplay(elapsedSec) {
  timerDisplayElement.textContent = `経過: ${elapsedSec}秒`;
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

// 次の問題があればそれを表示し、なければ結果画面を表示する共通処理。
// 「次へ」ボタン・スキップの両方から呼ばれる。
function goToNextQuestionOrResult() {
  const hasMoreQuestions = advanceToNextQuestion();
  if (hasMoreQuestions) {
    renderQuestion();
    return;
  }

  renderResult();
  showScreen("result");
}

// 回答済みになったときに、スキップ・答えを見るボタンを隠す共通処理。
// （選択肢クリック・スキップ・答えを見る、どのルートで回答済みになっても呼ぶ）
function hideSkipAndRevealButtons() {
  skipButtonElement.hidden = true;
  revealButtonElement.hidden = true;
}

// 選択肢ボタンをクリックしたときの処理。
// 正解なら経過秒数に応じた段階式のボーナス、不正解なら0点として記録する。
function handleChoiceClick(selectedChoice) {
  // 他の操作とほぼ同時に起きても二重に処理しないためのガード。
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  stopTimer();
  hideSkipAndRevealButtons();

  const question = getCurrentQuestion();
  const isCorrect = selectedChoice.id === question.song.id;
  // 無音の頭出しはaudio.js側で再生位置をずらして対応済みなので、
  // ここではもう曲ごとの無音秒数を差し引かない（elapsedSecがそのまま実際の聴取時間になる）。
  const points = isCorrect ? calculateScore(gameState.elapsedSec) : 0;
  recordAnswer(isCorrect ? "correct" : "wrong", points, getElapsedMsSincePlaybackStart());
  markChoiceButtons(selectedChoice.id);
  if (isCorrect) {
    playCorrectSound();
  } else {
    playWrongSound();
  }

  feedbackElement.textContent = isCorrect
    ? `正解！ +${points}点`
    : `不正解…（正解は「${question.song.title}」）`;
  // 正解/不正解を文字色でも一目で分かるようにするための、見た目だけのクラス切り替え
  feedbackElement.classList.toggle("is-correct", isCorrect);
  feedbackElement.classList.toggle("is-wrong", !isCorrect);
  feedbackElement.hidden = false;
  nextButtonElement.hidden = false;
}

// 「スキップ」ボタンを押したときの処理。
// 0点として記録し、正解は見せずにそのまま次の問題（または結果画面）へ進める。
function handleSkip() {
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  stopTimer();
  stopAudio();
  playClickSound();

  recordAnswer("skip", 0, getElapsedMsSincePlaybackStart());
  goToNextQuestionOrResult();
}

// 「答えを見る」ボタンを押したときの処理。
// 0点として記録し、正解の曲名を表示してから「次へ」ボタンで進めるようにする。
function handleReveal() {
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  stopTimer();
  stopAudio();
  hideSkipAndRevealButtons();

  const question = getCurrentQuestion();
  recordAnswer("reveal", 0, getElapsedMsSincePlaybackStart());
  markChoiceButtons(null);
  playWrongSound();
  feedbackElement.textContent = `正解は「${question.song.title}」でした`;
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
  const progressLabel = `第${gameState.currentIndex + 1}問 / ${gameState.questions.length}問`;
  // 復習中は進捗表示に「🔁 復習」を添えて、通常プレイと見分けられるようにする。
  questionProgressElement.textContent =
    gameState.playMode === "review" ? `🔁 復習 ${progressLabel}` : progressLabel;
  renderProgressDots();

  choiceButtonElements.forEach((button, index) => {
    button.textContent = question.choices[index].title;
  });

  feedbackElement.hidden = true;
  feedbackElement.classList.remove("is-correct", "is-wrong");
  nextButtonElement.hidden = true;
  skipButtonElement.hidden = false;
  revealButtonElement.hidden = false;
  audioErrorElement.hidden = true;
  clearChoiceButtonStates();

  // 再生を試みる直前の時刻をいったん暫定の計測起点にしておく。
  // 曲が実際に鳴り始めたら（onPlaybackStart）、より正確な値に上書きされる。
  markPlaybackStarted();
  playSongIntro(question.song, showAudioError, markPlaybackStarted);
  startTimer(updateTimerDisplay);
}

// 「今回間違えた曲」セクションを描画する。通常プレイ・復習プレイどちらの結果でも呼ばれる、
// 共通の処理。間違いが1曲もなければセクションごと隠す
// （復習ですべて正解した場合に再復習ボタンが消えるのも、この分岐だけで自然に実現される）。
function renderMissedSongsSection(missedSongs) {
  const hasMissedSongs = missedSongs.length > 0;
  missedSongsSectionElement.hidden = !hasMissedSongs;

  missedSongsChipRowElement.innerHTML = "";
  missedSongs.forEach((song) => {
    const chip = document.createElement("span");
    chip.classList.add("missed-song-chip");
    chip.textContent = song.title;
    missedSongsChipRowElement.appendChild(chip);
  });
}

// 結果画面に、合計得点・自己ベスト・1問ごとの内訳を反映する。
// 通常プレイと復習プレイの両方から呼ばれ、gameState.playModeに応じて表示・保存内容を出し分ける。
function renderResult() {
  animateScoreCountUp(gameState.score);
  const rank = calculateRank(gameState.score, gameState.questions.length);
  rankLetterElement.textContent = rank;
  // ランクごとにメダルの色・縁取り・光・飾りを切り替える見た目用のクラス
  rankElement.classList.remove("rank-s", "rank-a", "rank-b", "rank-c");
  rankElement.classList.add(`rank-${rank.toLowerCase()}`);

  const isReview = gameState.playMode === "review";
  resultEyebrowLabelElement.textContent = isReview ? "REVIEW" : "RESULT";

  if (isReview) {
    // 復習プレイは自己ベスト・称号・プレイ履歴のいずれにも反映しない。
    // 保存処理そのものを呼ばないことに加え、前回（通常プレイ）の結果表示が
    // 残ってしまわないよう、自己ベスト欄・称号欄を明示的に隠す／空にする。
    highScoreElement.hidden = true;
    newRecordElement.hidden = true;
    clearResultTitleEvents({
      chipContainer: titleEventListElement,
      titleListLinkElement: titleListLinkFromResultElement,
    });
  } else {
    const { questionCountValue, categoryFilterValue } = gameState;
    const isNewRecord = saveHighScoreIfBetter(gameState.score, questionCountValue, categoryFilterValue);
    highScoreElement.hidden = false;
    highScoreElement.textContent = `このモードの自己ベスト: ${getHighScore(questionCountValue, categoryFilterValue)}点`;
    newRecordElement.hidden = !isNewRecord;

    const playResult = buildPlayResult(gameState);
    const titleEvents = evaluateAndSaveTitles(playResult);
    renderResultTitleEvents(titleEvents, {
      chipContainer: titleEventListElement,
      titleListLinkElement: titleListLinkFromResultElement,
    });
    saveHistoryEntry(gameState, playResult, { rank, isNewRecord, titleEvents });
  }

  answerLogListElement.innerHTML = "";
  gameState.answerLog.forEach((entry, index) => {
    const item = document.createElement("li");
    const isCorrect = entry.resultType === "correct";
    item.classList.add(isCorrect ? "is-correct-row" : "is-wrong-row");

    const resultLabel = isCorrect ? "正解" : "不正解";
    const textElement = document.createElement("span");
    textElement.classList.add("answer-log-text");
    textElement.textContent = `第${index + 1}問「${entry.song.title}」: ${resultLabel}（${entry.pointsEarned}点）`;
    item.appendChild(textElement);

    // 回答時間は、音源の再生に失敗した等の理由で計測できていない場合があるので、
    // データがあるときだけバッジを表示する。
    if (entry.elapsedMs !== null) {
      const timeBadge = document.createElement("span");
      timeBadge.classList.add("answer-time-badge");
      timeBadge.textContent = `${(entry.elapsedMs / 1000).toFixed(1)}秒`;
      item.appendChild(timeBadge);
    }

    answerLogListElement.appendChild(item);
  });

  // 間違えた曲の抽出・表示・復習ボタンの出し分け。通常プレイ・復習プレイどちらの結果でも
  // 同じ処理を行う（「まだ間違えた曲」を再抽出することで、復習の連続実行に対応する）。
  const missedSongs = getMissedSongs(gameState.answerLog);
  setReviewSongs(missedSongs, gameState.categoryFilterValue);
  renderMissedSongsSection(missedSongs);

  // ボタン列の出し分け：「もう一度挑戦する」（通常プレイの結果）と
  // 「通常プレイを始める」（復習の結果）は互いに排他。「タイトルに戻る」は常に表示のまま。
  retryButtonElement.hidden = isReview;
  returnToNormalButtonElement.hidden = !isReview;
}

// 4つの選択肢ボタンに、それぞれクリック時の処理を割り当てる。
// ボタンの並び自体は固定なので、クリック時に「今の問題」の該当インデックスの選択肢を参照する。
choiceButtonElements.forEach((button, index) => {
  button.addEventListener("click", () => {
    const question = getCurrentQuestion();
    handleChoiceClick(question.choices[index]);
  });
});

// 指定した出題数・カテゴリで、曲プールの絞り込み・検証から問題生成までを行い、
// クイズ画面を開始する共通処理。スタートボタンと、結果画面の「もう一度挑戦する」の
// 両方から呼ばれる（後者は毎回この関数を通すことで、曲順・4択が必ず再抽選される）。
function beginQuiz(questionCountValue, categoryFilterValue) {
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
  startQuiz(questions, questionCountValue, categoryFilterValue);
  renderQuestion();

  showScreen("quiz");
}

// スタートボタンを押したときの処理。今選ばれている出題数・カテゴリを読み取って開始する。
document.getElementById("start-button").addEventListener("click", () => {
  playClickSound();
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;
  beginQuiz(questionCountValue, categoryFilterValue);
});

document.getElementById("next-button").addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  goToNextQuestionOrResult();
});

skipButtonElement.addEventListener("click", handleSkip);
revealButtonElement.addEventListener("click", handleReveal);

// 「もう一度挑戦する」：スタート画面を経由せず、直前と同じ出題数・カテゴリのまま
// クイズを再抽選して開始する。
retryButtonElement.addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  beginQuiz(gameState.questionCountValue, gameState.categoryFilterValue);
});

// 「通常プレイを始める」（復習の結果画面にだけ表示）：復習に入る前と同じ出題数・カテゴリで、
// 新しい通常クイズを始める。処理内容は「もう一度挑戦する」と全く同じ
// （beginQuiz→startQuizが必ずplayModeを"normal"に戻すため、ここで個別に戻す必要はない）。
returnToNormalButtonElement.addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  beginQuiz(gameState.questionCountValue, gameState.categoryFilterValue);
});

// 「間違えた曲だけ復習する」：直前のrenderResult()でgameState.reviewSongs/
// reviewCategoryFilterValueに保持しておいた内容をもとに、復習クイズを組み立てて開始する。
// 通常プレイ後・復習プレイ後のどちらの結果画面から呼ばれても、同じ処理でそのまま動く。
function beginReviewQuiz() {
  stopTimer();
  stopAudio();
  const distractorPool = filterSongsByCategory(SONGS, gameState.reviewCategoryFilterValue);
  const questions = buildReviewQuizQuestions(gameState.reviewSongs, distractorPool);
  startReviewQuiz(questions);
  renderQuestion();
  showScreen("quiz");
}

reviewMissedSongsButtonElement.addEventListener("click", () => {
  playClickSound();
  beginReviewQuiz();
});

// 「タイトルに戻る」：出題数・カテゴリの選択も含めて初期状態に戻し、スタート画面へ。
document.getElementById("back-to-title-button").addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  resetGameState();
  showScreen("start");
  updateModeBestScoreDisplay(); // 直前のプレイで自己ベストが更新されている可能性があるので表示し直す
});

// クイズ画面の「タイトルへ」：いきなり戻らず、必ず確認モーダルを挟む。
function openQuizQuitConfirmModal() {
  playClickSound();
  quizQuitConfirmModalElement.hidden = false;
}

function closeQuizQuitConfirmModal() {
  quizQuitConfirmModalElement.hidden = true;
}

quizBackButtonElement.addEventListener("click", openQuizQuitConfirmModal);

quizQuitCancelButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
});

// オーバーレイの背景部分をクリックしたときも閉じる（他のモーダルと同じ考え方）。
quizQuitConfirmModalElement.addEventListener("click", (event) => {
  if (event.target === quizQuitConfirmModalElement) {
    closeQuizQuitConfirmModal();
  }
});

// 確認モーダルの「タイトルに戻る」：結果画面の「タイトルに戻る」ボタンと全く同じ処理を行う。
// renderResult()を経由しないため、自己ベスト・称号・プレイ履歴のいずれにも一切反映されない
// （この3つはすべてrenderResult()の中でのみ保存処理が呼ばれる設計になっているため）。
quizQuitConfirmButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
  stopTimer();
  stopAudio();
  resetGameState();
  showScreen("start");
  updateModeBestScoreDisplay();
});

// ルール説明モーダルの開閉。start/quiz/resultの画面切り替え（showScreen）とは無関係な、
// 単純な表示/非表示の切り替えのみで済ませている（出題数・カテゴリの選択状態には一切触れない）。
function openRulesModal() {
  playClickSound();
  rulesModalElement.hidden = false;
}

function closeRulesModal() {
  rulesModalElement.hidden = true;
}

rulesLinkElement.addEventListener("click", openRulesModal);
rulesModalCloseButtonElement.addEventListener("click", closeRulesModal);

// オーバーレイ部分（背景）をクリックしたときも閉じる。
// モーダルカード自体のクリックはバブリングで拾ってしまうと誤って閉じるため、
// クリックされた要素がオーバーレイそのものだったときだけ閉じるようにする。
rulesModalElement.addEventListener("click", (event) => {
  if (event.target === rulesModalElement) {
    closeRulesModal();
  }
});

// 「収録曲一覧」リンク：開くたびに、最新のシングルだけ展開した状態から始める。
songlistLinkElement.addEventListener("click", () => {
  playClickSound();
  resetSongListToDefaultView();
  showScreen("songlist");
});

// 収録曲一覧画面の「戻る」：試聴中の曲を必ず止めてからスタート画面へ戻る。
songlistBackButtonElement.addEventListener("click", () => {
  playClickSound();
  stopSongListPreview();
  showScreen("start");
});

// 「プレイ履歴」リンク：開くたびに最新の記録で描画し直す
// （直前のプレイがあれば、その分もすぐ反映されるようにするため）。
historyLinkElement.addEventListener("click", () => {
  playClickSound();
  renderHistoryScreen();
  showScreen("history");
});

// プレイ履歴画面の「戻る」：スタート画面へ戻る。
historyBackButtonElement.addEventListener("click", () => {
  playClickSound();
  showScreen("start");
});

// 出題数・カテゴリのラジオボタンが切り替わるたびに、自己ベスト表示・出題数の案内を更新する。
// ページを開いた直後（初期選択の状態）の分も、ここで一度呼んでおく。
document
  .querySelectorAll('input[name="question-count"], input[name="category-filter"]')
  .forEach((radio) => {
    radio.addEventListener("change", updateModeBestScoreDisplay);
    radio.addEventListener("change", updateQuestionCountNotice);
  });
updateModeBestScoreDisplay();
updateQuestionCountNotice();

// カテゴリの選択肢に添える対象曲数は、ゲームの状態と関係なく最初に1回だけ計算すればよい。
updateCategoryCountHints();

// 音源の読み込み状況（IndexedDBに何曲保存済みか）を表示に反映する。
// SONGSの曲数と突き合わせ、未読み込みの曲があれば件数を案内する。
async function updateAudioImportStatus() {
  const importedSongIds = await getImportedSongIds();
  const importedSet = new Set(importedSongIds);
  const missingCount = SONGS.filter((song) => !importedSet.has(song.id)).length;

  audioImportStatusElement.textContent =
    missingCount === 0
      ? `音源：全${SONGS.length}曲 読み込み済み`
      : `音源：${SONGS.length - missingCount}/${SONGS.length}曲 読み込み済み（${missingCount}曲未読み込み）`;
}

// 「音源を読み込む」ボタン（実体は隠したinput[type=file]）でファイルが選ばれたときの処理。
// 選んだファイルのうちファイル名がsongsのidと一致するものだけをIndexedDBに保存する。
// 一部の曲だけを選んでも、選んだ分だけが追加・上書きされる（差分インポート。js/audioStorage.js参照）。
audioImportInputElement.addEventListener("change", async () => {
  const files = [...audioImportInputElement.files];
  if (files.length === 0) return;

  const { savedSongIds, unmatchedFileNames } = await importAudioFiles(files);

  audioImportResultElement.hidden = false;
  audioImportResultElement.textContent =
    unmatchedFileNames.length > 0
      ? `${savedSongIds.length}曲を読み込みました（${unmatchedFileNames.length}件はファイル名が曲データと一致しませんでした）`
      : `${savedSongIds.length}曲を読み込みました`;

  // 同じファイルをもう一度選んでも change イベントが発火するように、選択状態をリセットする
  audioImportInputElement.value = "";
  await updateAudioImportStatus();
});

updateAudioImportStatus();

// PWA対応：Service Workerを登録し、新しいバージョンが使えるようになったらバナーで知らせる。
// 黙って新しいコードに切り替えると、プレイ中に予期しない動作をする可能性があるため、
// 必ず本人が「更新する」を押してから切り替える設計にしている。
let pendingUpdateRegistration = null;

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // controllerがある（＝すでに動いているService Workerがいる）状態での
          // installedは「新しいバージョンが準備できた」を意味する。
          // controllerがまだない初回登録時のinstalledはただの初回セットアップなので無視する。
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            pendingUpdateRegistration = registration;
            updateAvailableBannerElement.hidden = false;
          }
        });
      });
    })
    .catch(() => {
      // Service Workerが使えない環境（非対応ブラウザ等）でも、アプリ自体は問題なく動き続けられるようにする
    });

  // 新しいService Workerが有効化されたら、最新のコードを反映するために1回だけ再読み込みする。
  let hasReloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });
}

updateReloadButtonElement.addEventListener("click", () => {
  pendingUpdateRegistration?.waiting?.postMessage("skipWaiting");
});

initServiceWorker();

// キーボード操作対応。マウス・タップ操作は今まで通り使えるようにしたうえで、
// 今表示されている画面に応じてキー入力を割り当てる。
document.addEventListener("keydown", (event) => {
  // ルール説明モーダルが開いているときは、Escキーで閉じる。
  // それ以外のキー（スタート画面のEnterなど）は、モーダルを読んでいる間に
  // 誤って反応してしまわないよう、ここで処理を止めて下の分岐に進ませない。
  if (!rulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeRulesModal();
    }
    return;
  }

  // 称号一覧モーダルが開いているときも、他画面のショートカットを妨げないよう先に止める。
  // 開閉（Escキーを含む）自体はtitleList.js側のリスナーがすでに処理しているので、
  // ここでは何もせずreturnするだけでよい。
  if (!titleListModalElement.hidden) {
    return;
  }

  // プレイ履歴の削除確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はhistoryScreen.js側のリスナーがすでに処理している。
  if (!historyClearConfirmModalElement.hidden) {
    return;
  }

  // クイズ中断・確認モーダルが開いているときは、Escキーで閉じる（＝中断をキャンセル）。
  // このモーダルの開閉ロジックはこのファイルで直接管理しているため、rulesModalと同じ書き方にする。
  if (!quizQuitConfirmModalElement.hidden) {
    if (event.key === "Escape") {
      closeQuizQuitConfirmModal();
    }
    return;
  }

  // スタート画面：Enterキーでスタート
  if (startScreenElement.classList.contains("is-active") && event.key === "Enter") {
    document.getElementById("start-button").click();
    return;
  }

  if (quizScreenElement.classList.contains("is-active")) {
    // クイズ画面：Escキーで、クイズ中断の確認モーダルを開く。
    // ここに到達している時点で（上のガードにより）他のモーダルは開いていないと分かっているため、
    // 「開いていなければ開く」の判定を別途書く必要はない。Escだけで即座にタイトルへ戻ることはなく、
    // 必ずこの確認モーダルを経由する。
    if (event.key === "Escape") {
      openQuizQuitConfirmModal();
      return;
    }

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
