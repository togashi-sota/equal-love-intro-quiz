// 歌詞クイズモード（1人用MVP）の設定画面・問題画面・結果画面を組み立てるファイル。
//
// 【設計方針】区間生成・ヒント進行・回答候補生成・採点はすべてjs/lyricsSegmentEngine.js・
// js/lyricsQuizEngine.js・js/lyricsQuizQuestionBuilder.jsの純粋関数に任せてあるため、
// このファイルの役割は「その結果を画面に表示する」「ボタン操作を受け取って次の状態へ進める」
// ことだけに絞っている。タイムアタック・ランダム再生クイズと同じ3画面構成
// （設定→問題→結果）だが、回答方式が「4択ボタン」ではなく「ヒントを見ながら曲名を探す」
// という別物のため、進行状態はgameStateに乗せず、このファイル内で完結させている
// （js/timeAttackScreen.jsが独自の実行中状態を持つのと同じ考え方）。
//
// 【出題範囲について】依頼にあった「現在のquestionSource基盤」は、MVPでは既存の
// タイムアタック・ランダム再生クイズと同じ「カテゴリ絞り込み」だけを窓口にしている
// （js/questionSource.jsのCATEGORY種別）。プレイリスト・お気に入り等の他の出題範囲は、
// 今後questionSource基盤を通じてそのまま拡張できる（このファイルの変更は不要な設計）。

import { SONGS } from "./data/songs.js";
import { QUESTION_SOURCE_TYPE, resolveSongPool } from "./questionSource.js";
import { normalizeForSearch, songMatchesSearch } from "./songlist.js";
import {
  loadSongsWithLyrics,
  filterQuizzableSongs,
  validateLyricsQuizAvailability,
  buildLyricsQuizQuestions,
} from "./lyricsQuizQuestionBuilder.js";
import {
  createLyricsQuizResult,
  LARGE_ANSWER_POOL_THRESHOLD,
  LYRICS_QUIZ_ANSWER_OUTCOME,
} from "./lyricsQuizEngine.js";
import { getLyricsQuizBest, saveLyricsQuizBestIfBetter } from "./lyricsQuizScore.js";
import {
  createLyricsQuizRunState,
  getCurrentQuestion,
  isRunFinished,
  advanceHint,
  recordAnswerAndAdvance,
} from "./lyricsQuizRunState.js";

// 正解/不正解の演出（既存の.choice-buttonのis-correct/is-wrong）を見せてから次の問題へ進むまでの待ち時間。
const ANSWER_FEEDBACK_DELAY_MS = 900;

let elements = null; // 設定画面
let questionElements = null; // 問題画面
let resultElements = null; // 結果画面

let currentSettings = null; // { questionCountValue, categoryFilterValue, answerPoolSizeValue }
// 「今何問目か」「各解答の記録」はjs/lyricsQuizRunState.jsの純粋関数で管理する
// （画面のDOMを介さずに進行ロジックだけを自動テストできるようにするため）。
let runState = null;
let hasAnsweredCurrentQuestion = false;
let questionStartedAt = 0;
let runStartedAt = 0;
let elapsedTimerId = null;

// ===== 1. 設定画面 =====

// elements: {
//   startButton, startError, bestChip,
//   onStart: 出題が確定し、問題画面へ進める準備ができたときに呼ばれるコールバック（引数なし）,
// }
export function initLyricsQuizSetupScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", handleStartButtonClick);

  document
    .querySelectorAll('input[name="lyrics-quiz-question-count"], input[name="lyrics-quiz-answer-pool-size"]')
    .forEach((input) => input.addEventListener("change", updateBestChip));
}

function getSelectedSettings() {
  return {
    questionCountValue: document.querySelector('input[name="lyrics-quiz-question-count"]:checked').value,
    categoryFilterValue: document.querySelector('input[name="lyrics-quiz-category-filter"]:checked').value,
    answerPoolSizeValue: document.querySelector('input[name="lyrics-quiz-answer-pool-size"]:checked').value,
  };
}

// 選択中の出題数・回答方式に対応する自己ベストを表示する（ラジオボタンを切り替えるたびに呼ばれる）。
export function updateBestChip() {
  if (!elements) return;
  const { questionCountValue, answerPoolSizeValue } = getSelectedSettings();
  const best = getLyricsQuizBest(questionCountValue, answerPoolSizeValue);

  if (!best) {
    elements.bestChip.classList.add("is-empty");
    elements.bestChip.textContent = "自己ベスト：記録なし";
    return;
  }
  elements.bestChip.classList.remove("is-empty");
  elements.bestChip.textContent =
    `自己ベスト：${best.correctCount}/${best.totalQuestions}問正解・平均ヒント${best.averageHintsUsed.toFixed(1)}回`;
}

async function handleStartButtonClick() {
  const settings = getSelectedSettings();
  await buildAndStartRun(settings);
}

// 直前と同じ設定のまま、問題を再抽選して開始する（「もう一度挑戦する」用）。
// 出題数不足等で開始できない事態は、直前に一度成立した設定を再利用するだけなので
// 通常は起こらないが、念のため同じ検証を通してから開始する。
export async function retryLyricsQuizRun() {
  if (!currentSettings) return;
  await buildAndStartRun(currentSettings);
}

// 出題数不足チェック→問題セットの組み立て→実行中状態のリセット、までを行う共通処理。
// 開始できた場合はelements.onStart()を呼ぶ（開始できなければ何も呼ばない）。
async function buildAndStartRun(settings) {
  elements.startError.hidden = true;

  const songPool = resolveSongPool({
    type: QUESTION_SOURCE_TYPE.CATEGORY,
    categoryFilterValue: settings.categoryFilterValue,
  });
  const songsWithLyrics = await loadSongsWithLyrics(songPool);
  const availability = validateLyricsQuizAvailability(songsWithLyrics, settings.questionCountValue);

  if (!availability.ok) {
    elements.startError.hidden = false;
    elements.startError.textContent = availability.reason;
    logInsufficientSongsForDebug(songPool, songsWithLyrics);
    return;
  }

  const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
  currentSettings = settings;
  const questions = buildLyricsQuizQuestions({
    songsWithLyrics,
    songPool,
    questionCountValue: settings.questionCountValue,
    answerPoolSizeValue: settings.answerPoolSizeValue,
    seed,
  });
  runState = createLyricsQuizRunState(questions);
  runStartedAt = Date.now();

  elements.onStart();
}

// 出題可能な曲が足りない場合に、どの曲が原因かを曲名でブラウザのConsoleにだけ出す
// （一般利用者向け画面には出さない。デバッグ時に曲名で確認できるようにという本人の要望への対応）。
// 「歌詞データ自体が無い曲」と「歌詞データはあるが有効な区間が作れない曲」を分けて表示する。
function logInsufficientSongsForDebug(songPool, songsWithLyrics) {
  const titleOf = (songId) => SONGS.find((song) => song.id === songId)?.title ?? songId;

  const withLyricsIds = new Set(songsWithLyrics.map((entry) => entry.song.id));
  const noLyricsData = songPool.filter((songId) => !withLyricsIds.has(songId)).map(titleOf);

  const quizzableIds = new Set(filterQuizzableSongs(songsWithLyrics).map((entry) => entry.song.id));
  const insufficientSegments = songsWithLyrics
    .filter((entry) => !quizzableIds.has(entry.song.id))
    .map((entry) => entry.song.title);

  console.warn("[歌詞クイズ] 出題対象から除外された曲", { 歌詞データが無い: noLyricsData, 有効な区間が作れない: insufficientSegments });
}

// ===== 2. 問題画面 =====

// questionElements: {
//   progress, elapsedTime, hintLevelLabel, hintText, nextHintButton, skipButton,
//   answerSearchRow, answerSearchInput, answerCount, answerList,
// }
export function initLyricsQuizQuestionScreen(newElements) {
  questionElements = newElements;
  questionElements.nextHintButton.addEventListener("click", handleNextHintButtonClick);
  questionElements.skipButton.addEventListener("click", handleSkipButtonClick);
  questionElements.answerSearchInput.addEventListener("input", () => {
    renderAnswerButtons(getCurrentQuestion(runState).answerPool, questionElements.answerSearchInput.value);
  });
}

function formatElapsed(ms) {
  return `${Math.floor(ms / 1000)}秒`;
}

function startElapsedTimer() {
  stopElapsedTimer();
  questionElements.elapsedTime.textContent = formatElapsed(0);
  elapsedTimerId = setInterval(() => {
    questionElements.elapsedTime.textContent = formatElapsed(Date.now() - runStartedAt);
  }, 1000);
}

function stopElapsedTimer() {
  if (elapsedTimerId !== null) {
    clearInterval(elapsedTimerId);
    elapsedTimerId = null;
  }
}

// 問題画面を開くたびに呼ぶ（main.js側でshowScreen()の直後に呼ぶ想定）。
export function startLyricsQuizPlay() {
  startElapsedTimer();
  renderCurrentQuestion();
}

function renderCurrentQuestion() {
  const question = getCurrentQuestion(runState);
  hasAnsweredCurrentQuestion = false;
  questionStartedAt = Date.now();

  questionElements.progress.textContent = `第${runState.currentQuestionIndex + 1}問 / ${runState.questions.length}問`;
  questionElements.skipButton.disabled = false;

  renderHint(question);
  renderAnswerArea(question);
}

function renderHint(question) {
  const hint = question.hints[runState.currentHintCount - 1];
  const segment = question.segments.find((s) => s.id === hint.segmentId);

  questionElements.hintLevelLabel.textContent = `ヒント ${runState.currentHintCount} / ${question.hints.length}`;
  questionElements.hintText.textContent = segment.text;
  questionElements.nextHintButton.disabled =
    hasAnsweredCurrentQuestion || runState.currentHintCount >= question.hints.length;
}

function handleNextHintButtonClick() {
  const question = getCurrentQuestion(runState);
  if (hasAnsweredCurrentQuestion || runState.currentHintCount >= question.hints.length) return;
  runState = advanceHint(runState);
  renderHint(question);
}

function renderAnswerArea(question) {
  const pool = question.answerPool;
  const isLargePool = pool.length >= LARGE_ANSWER_POOL_THRESHOLD;

  questionElements.answerSearchRow.hidden = !isLargePool;
  if (isLargePool) {
    questionElements.answerSearchInput.value = "";
    questionElements.answerCount.textContent = `${pool.length}曲`;
  }

  renderAnswerButtons(pool, "");
}

function renderAnswerButtons(pool, searchQuery) {
  const normalizedQuery = normalizeForSearch(searchQuery);
  const filtered =
    normalizedQuery === ""
      ? pool
      : pool.filter((song) => songMatchesSearch(song.title, song.searchReading, song.searchAliases, normalizedQuery));

  questionElements.answerList.innerHTML = "";
  filtered.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button lyrics-quiz-answer-button";
    button.textContent = song.title;
    button.dataset.songId = song.id;
    button.addEventListener("click", () => handleAnswerSelected(song.id, button));
    questionElements.answerList.appendChild(button);
  });
}

function disableAllAnswerButtons() {
  questionElements.answerList.querySelectorAll(".lyrics-quiz-answer-button").forEach((button) => {
    button.disabled = true;
  });
  questionElements.skipButton.disabled = true;
}

// 解答の記録・進行はjs/lyricsQuizRunState.jsのrecordAnswerAndAdvance()が担う。
// このファイル側はDate.now()で経過時間を計算して渡すだけにしている
// （recordAnswerAndAdvance自体は非純粋な処理を持たない設計にするため）。
// 呼び出し時点ではまだ進行前の問題を対象にするので、questionは呼び出し側で
// 進行前に取得しておいたものを渡してもらう（revealCorrectAnswerButtonが
// 「今表示している問題」の正解ボタンを探すのに使うため）。
function revealCorrectAnswerButton(question) {
  const correctButton = questionElements.answerList.querySelector(
    `.lyrics-quiz-answer-button[data-song-id="${question.song.id}"]`
  );
  if (correctButton) correctButton.classList.add("is-correct");
}

function handleAnswerSelected(selectedSongId, buttonElement) {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = getCurrentQuestion(runState);
  const isCorrect = selectedSongId === question.song.id;
  const elapsedMs = Date.now() - questionStartedAt;
  runState = recordAnswerAndAdvance(
    runState,
    isCorrect ? LYRICS_QUIZ_ANSWER_OUTCOME.CORRECT : LYRICS_QUIZ_ANSWER_OUTCOME.WRONG_ANSWER,
    elapsedMs
  );

  buttonElement.classList.add(isCorrect ? "is-correct" : "is-wrong");
  if (!isCorrect) revealCorrectAnswerButton(question);

  questionElements.nextHintButton.disabled = true;
  disableAllAnswerButtons();

  setTimeout(advanceToNextQuestionOrFinish, ANSWER_FEEDBACK_DELAY_MS);
}

function handleSkipButtonClick() {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = getCurrentQuestion(runState);
  const elapsedMs = Date.now() - questionStartedAt;
  runState = recordAnswerAndAdvance(runState, LYRICS_QUIZ_ANSWER_OUTCOME.SKIPPED, elapsedMs);
  revealCorrectAnswerButton(question);

  questionElements.nextHintButton.disabled = true;
  disableAllAnswerButtons();

  setTimeout(advanceToNextQuestionOrFinish, ANSWER_FEEDBACK_DELAY_MS);
}

function advanceToNextQuestionOrFinish() {
  if (isRunFinished(runState)) {
    stopElapsedTimer();
    elements.onFinish();
    return;
  }
  renderCurrentQuestion();
}

// ===== 3. 結果画面 =====

// resultElements: {
//   correctCount, missCount, totalHintsUsed, averageHintsUsed, firstHintCorrectCount, totalElapsedTime,
//   newRecordBadge, breakdownList,
// }
export function initLyricsQuizResultScreen(newElements) {
  resultElements = newElements;
}

// 結果画面を描画し、自己ベストの判定・保存もここで行う。
// 戻り値：将来オンライン対戦・ランキングへ流用できる集計結果（createLyricsQuizResult()の戻り値）。
export function renderLyricsQuizResult() {
  const result = createLyricsQuizResult(runState.answers);
  const isNewRecord = saveLyricsQuizBestIfBetter(
    result,
    currentSettings.questionCountValue,
    currentSettings.answerPoolSizeValue
  );

  resultElements.correctCount.textContent = `${result.correctCount} / ${result.totalQuestions}問`;
  resultElements.missCount.textContent = `${result.missCount}問`;
  resultElements.totalHintsUsed.textContent = `${result.totalHintsUsed}回`;
  resultElements.averageHintsUsed.textContent = `${result.averageHintsUsed.toFixed(1)}回`;
  resultElements.firstHintCorrectCount.textContent = `${result.firstHintCorrectCount}問`;
  resultElements.totalElapsedTime.textContent = formatElapsed(result.totalElapsedMs);
  resultElements.newRecordBadge.hidden = !isNewRecord;

  renderBreakdown();
  return result;
}

function renderBreakdown() {
  resultElements.breakdownList.innerHTML = "";
  runState.answers.forEach((answer, index) => {
    const question = runState.questions[index];
    const row = document.createElement("li");
    row.className = "lyrics-quiz-breakdown-row";

    const title = document.createElement("span");
    title.className = "lyrics-quiz-breakdown-title";
    title.textContent = `第${index + 1}問：${question.song.title}`;
    row.appendChild(title);

    const status = document.createElement("span");
    status.className = answer.isCorrect
      ? "lyrics-quiz-breakdown-status is-correct"
      : "lyrics-quiz-breakdown-status is-wrong";
    // 画面上の表示は「不正解」「スキップ」を分けて見せるが、集計上はどちらも
    // 不正解として扱う（本人の指示どおり）。色分けはis-wrongで統一し、
    // テキストだけ内訳を分かりやすくしている。
    status.textContent = answer.isCorrect
      ? `ヒント${answer.hintsUsedCount}で正解`
      : answer.outcome === LYRICS_QUIZ_ANSWER_OUTCOME.SKIPPED
        ? "スキップ"
        : "不正解";
    row.appendChild(status);

    resultElements.breakdownList.appendChild(row);
  });
}
