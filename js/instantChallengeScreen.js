// 一瞬チャレンジ（曲のランダムな位置から一瞬〈1.5秒/1秒/0.5秒〉だけ再生し、
// 回答候補（4/10/30/50/全曲）から曲名を当てる高難度モード）の
// 設定画面・問題画面・結果画面を担当するファイル（2026-08-30新設）。
//
// 【設計方針】回答候補の生成・検証・大きい候補数のときの検索UIは、歌詞クイズ
// （js/lyricsQuizEngine.js・js/lyricsQuizScreen.js）の仕組みをそのまま再利用する
// （本人指示：「歌詞クイズで既に似た回答UI・選択肢生成ロジックがあるなら、可能な限り
// 共通化してください」）。歌詞クイズと違い「ヒントを段階的に増やす」進行が無く、
// 1回再生して1回答えたらすぐ次の問題へ進む、より単純な流れのため、進行状態
// （runState相当）はこのファイル内のモジュール変数だけで完結させている
// （js/timeAttackScreen.jsが独自の実行中状態を持つのと同じ考え方）。
//
// 【出題対象曲の決め方】js/questionSource.jsのresolveSongPool()（CATEGORY種別）を使い、
// 既存モードと同じカテゴリー絞り込みをそのまま利用する。回答候補プール自体は
// 「出題対象曲と同じプール」から作る（歌詞クイズと同じ考え方）。
//
// 【再生位置】js/randomPlaybackEngine.jsのcomputeRandomStartTimeSec()をそのまま再利用する
// （曲頭10秒・曲末5秒を避けるヒューリスティックは、一瞬チャレンジでも「0.5秒でも
// 確実に音が聞こえる位置を選ぶ」という本人の要望に合致するため、変更せず流用する）。
//
// 【クリアの考え方】タイムランキング競争ではなく、「全問正解で完走した」ことを
// その条件（再生時間×回答候補数）のクリアとして js/instantChallengeClearStore.js へ記録する。
// 称号・特殊ランキングの具体的な条件は今回決めない（本人指示）。
import { resolveSongPool, QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { MIN_SONGS_REQUIRED } from "./quiz.js";
import { filterSongsWithImportedAudio } from "./audioStorage.js";
import { SONGS } from "./data/songs.js";
import {
  ANSWER_POOL_SIZE_VALUES,
  LARGE_ANSWER_POOL_THRESHOLD,
  generateAnswerPool,
  validateLyricsQuizQuestionAnswerPool,
  buildFallbackAnswerPool,
} from "./lyricsQuizEngine.js";
import { computeRandomStartTimeSec } from "./randomPlaybackEngine.js";
import { normalizeForSearch, songMatchesSearch } from "./songlist.js";
import { playSongFromRandomPosition, stopAudio } from "./audio.js";
import { recordInstantChallengeWeakSongAttempt } from "./instantChallengeWeakSongStats.js";
import { recordInstantChallengeClear } from "./instantChallengeClearStore.js";
import { savePlayHistoryEntry } from "./playHistory.js";

export { ANSWER_POOL_SIZE_VALUES as INSTANT_CHALLENGE_ANSWER_POOL_SIZE_VALUES };
// 再生時間の選択肢（本人指示：1.5/1/0.5秒の3段階のみ。長い時間は入れない）。
export const INSTANT_CHALLENGE_PLAY_DURATION_VALUES = ["1.5", "1", "0.5"];

const ANSWER_FEEDBACK_DELAY_MS = 900;

let elements = null; // 設定画面
let questionElements = null; // 問題画面
let resultElements = null; // 結果画面

let currentSettings = null; // { questionCountValue, categoryFilterValue, playDurationValue, answerPoolSizeValue }
let questions = []; // { song, answerPool }[]
let currentIndex = 0;
let answers = []; // { songId, isCorrect }[]
let seed = 0;
let hasAnsweredCurrentQuestion = false;
let questionStartedAt = 0;
let pendingAnswerFeedbackTimeoutId = null;

// ===== 1. 設定画面 =====

// elements: { startButton, startError, onStart }
export function initInstantChallengeSetupScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", handleStartButtonClick);
}

function getSelectedSettings() {
  return {
    questionCountValue: document.querySelector('input[name="instant-challenge-question-count"]:checked').value,
    categoryFilterValue: document.querySelector('input[name="instant-challenge-category-filter"]:checked').value,
    playDurationValue: document.querySelector('input[name="instant-challenge-play-duration"]:checked').value,
    answerPoolSizeValue: document.querySelector('input[name="instant-challenge-answer-pool-size"]:checked').value,
  };
}

async function handleStartButtonClick() {
  const settings = getSelectedSettings();
  await buildAndStartRun(settings);
}

export async function retryInstantChallengeRun() {
  if (!currentSettings) return;
  await buildAndStartRun(currentSettings);
}

// 音源を読み込み済みの曲だけで出題プールを組み立てる（既存の各モードと同じ絞り込み方針）。
async function resolvePlayableSongPool(categoryFilterValue) {
  const categoryPool = resolveSongPool({ type: QUESTION_SOURCE_TYPE.CATEGORY, categoryFilterValue })
    .map((songId) => SONGS.find((song) => song.id === songId))
    .filter((song) => song !== undefined);
  return filterSongsWithImportedAudio(categoryPool);
}

async function buildAndStartRun(settings) {
  elements.startError.hidden = true;

  const pool = await resolvePlayableSongPool(settings.categoryFilterValue);
  if (pool.length < MIN_SONGS_REQUIRED) {
    elements.startError.hidden = false;
    elements.startError.textContent =
      "音源を読み込んだ曲が足りません。スタート画面の「音源を読み込む」から追加するか、カテゴリの範囲を広げてください。";
    return false;
  }

  const requestedCount = settings.questionCountValue === "all" ? pool.length : Number(settings.questionCountValue);
  const questionCount = Math.min(requestedCount, pool.length);

  seed = Math.floor(Math.random() * 0x100000000) >>> 0;
  currentSettings = settings;

  const shuffled = [...pool];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const questionSongs = shuffled.slice(0, questionCount);

  questions = questionSongs.map((song) => {
    let answerPool = generateAnswerPool(pool, song.id, settings.answerPoolSizeValue);
    const validation = validateLyricsQuizQuestionAnswerPool({ song, answerPool });
    if (!validation.ok) {
      answerPool = buildFallbackAnswerPool(pool, song.id, settings.answerPoolSizeValue) ?? [];
    }
    return { song, answerPool };
  });
  currentIndex = 0;
  answers = [];

  elements.onStart();
  return true;
}

// ===== 2. 問題画面 =====

// questionElements: {
//   progress, answerSearchRow, answerSearchInput, answerCount, answerList,
//   backButton, quitConfirmModal, quitCancelButton, quitRestartButton, quitConfirmButton,
//   onQuit,
// }
export function initInstantChallengeQuestionScreen(newElements) {
  questionElements = newElements;
  questionElements.answerSearchInput.addEventListener("input", () => {
    renderAnswerButtons(questions[currentIndex].answerPool, questionElements.answerSearchInput.value);
  });

  questionElements.backButton.addEventListener("click", openQuitConfirmModal);
  questionElements.quitCancelButton.addEventListener("click", closeQuitConfirmModal);
  if (questionElements.quitRestartButton) {
    questionElements.quitRestartButton.addEventListener("click", () => {
      closeQuitConfirmModal();
      restartRun();
    });
  }
  questionElements.quitConfirmButton.addEventListener("click", () => {
    closeQuitConfirmModal();
    quitRun();
  });
  questionElements.quitConfirmModal.addEventListener("click", (event) => {
    if (event.target === questionElements.quitConfirmModal) closeQuitConfirmModal();
  });
  document.addEventListener("keydown", (event) => {
    if (questionElements.quitConfirmModal.hidden) return;
    if (event.key === "Escape") closeQuitConfirmModal();
  });
}

function openQuitConfirmModal() {
  questionElements.quitConfirmModal.hidden = false;
  questionElements.quitCancelButton.focus();
}
function closeQuitConfirmModal() {
  questionElements.quitConfirmModal.hidden = true;
}

function quitRun() {
  stopAudio();
  clearPendingAnswerFeedbackTimeout();
  questionElements.answerSearchInput.value = "";
  questions = [];
  currentIndex = 0;
  answers = [];
  questionElements.onQuit();
}

async function restartRun() {
  stopAudio();
  clearPendingAnswerFeedbackTimeout();
  questionElements.answerSearchInput.value = "";
  await retryInstantChallengeRun();
}

// 問題画面を開くたびに呼ぶ（main.js側でshowScreen()の直後に呼ぶ想定）。
export function startInstantChallengePlay() {
  renderCurrentQuestion();
}

function showAudioErrorInline(message) {
  console.warn("[一瞬チャレンジ]", message);
}

function renderCurrentQuestion() {
  hasAnsweredCurrentQuestion = false;
  questionStartedAt = Date.now();
  questionElements.progress.textContent = `第${currentIndex + 1}問 / ${questions.length}問`;
  renderAnswerArea(questions[currentIndex]);

  // 再生位置は既存のランダム再生クイズと全く同じ関数（js/randomPlaybackEngine.js）を使う
  // （本人指示：「既存のランダム再生クイズの再生位置決定ロジックをまず確認し、
  // 使える部分があれば共通化してください」）。再生時間だけ、選ばれたplayDurationValue
  // （1.5/1/0.5秒）に差し替える。
  const question = questions[currentIndex];
  const questionIndex = currentIndex;
  const playDurationSec = Number(currentSettings.playDurationValue);
  const computeStartTimeSec = (durationSec) =>
    computeRandomStartTimeSec({ seed, songId: question.song.id, questionIndex, durationSec, playDurationSec });
  playSongFromRandomPosition(question.song, computeStartTimeSec, playDurationSec, showAudioErrorInline, () => {}, () => {});
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
}

function handleAnswerSelected(selectedSongId, buttonElement) {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = questions[currentIndex];
  const isCorrect = selectedSongId === question.song.id;
  answers.push({ songId: question.song.id, isCorrect });
  recordInstantChallengeWeakSongAttempt(question.song.id, isCorrect);

  buttonElement.classList.add(isCorrect ? "is-correct" : "is-wrong");
  if (!isCorrect) {
    const correctButton = questionElements.answerList.querySelector(
      `.lyrics-quiz-answer-button[data-song-id="${question.song.id}"]`
    );
    if (correctButton) correctButton.classList.add("is-correct");
  }

  disableAllAnswerButtons();
  scheduleAnswerFeedbackAdvance();
}

function scheduleAnswerFeedbackAdvance() {
  clearPendingAnswerFeedbackTimeout();
  pendingAnswerFeedbackTimeoutId = setTimeout(() => {
    pendingAnswerFeedbackTimeoutId = null;
    advanceToNextQuestionOrFinish();
  }, ANSWER_FEEDBACK_DELAY_MS);
}

function clearPendingAnswerFeedbackTimeout() {
  if (pendingAnswerFeedbackTimeoutId === null) return;
  clearTimeout(pendingAnswerFeedbackTimeoutId);
  pendingAnswerFeedbackTimeoutId = null;
}

function advanceToNextQuestionOrFinish() {
  currentIndex += 1;
  if (currentIndex >= questions.length) {
    elements.onFinish?.();
    questionElements.onFinish?.();
    return;
  }
  renderCurrentQuestion();
}

// ===== 3. 結果画面 =====

// resultElements: { correctCount, missCount, clearBadge, breakdownList }
export function initInstantChallengeResultScreen(newElements) {
  resultElements = newElements;
}

export function renderInstantChallengeResult() {
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const missCount = answers.length - correctCount;
  const isCleared = answers.length > 0 && missCount === 0;

  resultElements.correctCount.textContent = `${correctCount} / ${answers.length}問`;
  resultElements.missCount.textContent = `${missCount}問`;
  resultElements.clearBadge.hidden = !isCleared;

  if (isCleared) {
    recordInstantChallengeClear(currentSettings.playDurationValue, currentSettings.answerPoolSizeValue);
  }

  savePlayHistoryEntry({
    playedAt: Date.now(),
    modeId: "instantChallenge",
    modeLabel: "一瞬チャレンジ",
    questionCount: answers.length,
    isAllSongsMode: currentSettings.categoryFilterValue === "all",
    correctCount,
    wrongCount: missCount,
    skippedCount: null,
    score: null,
    averageResponseMs: null,
    completed: true,
    details: {
      playDurationValue: currentSettings.playDurationValue,
      answerPoolSizeValue: currentSettings.answerPoolSizeValue,
      categoryFilterValue: currentSettings.categoryFilterValue,
      isCleared,
    },
  });

  renderBreakdown();
}

function renderBreakdown() {
  resultElements.breakdownList.innerHTML = "";
  answers.forEach((answer, index) => {
    const question = questions[index];
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
    status.textContent = answer.isCorrect ? "正解" : "不正解";
    row.appendChild(status);

    resultElements.breakdownList.appendChild(row);
  });
}
