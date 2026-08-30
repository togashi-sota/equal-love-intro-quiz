// 一瞬チャレンジ（曲のランダムな位置から一瞬〈1.5秒/1秒/0.5秒〉だけ再生し、
// 回答候補（4/10/全曲）から曲名を当てる高難度モード）の
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
import { evaluateInstantChallengeAchievements } from "./achievementEvaluation.js";
import { saveEarnedAchievements } from "./achievementProgress.js";
import { renderAchievementUnlockEvents } from "./achievementDisplay.js";
import { renderPlayerSummary } from "./playerScreen.js";

// 【2026-08-30改訂・本人指示】回答候補は4択／10択／全曲検索の3段階のみに変更
// （30択・50択は一瞬チャレンジでは不要と判断し廃止。歌詞クイズ側のANSWER_POOL_SIZE_VALUES
// 〈js/lyricsQuizEngine.js〉は変更しない＝歌詞クイズの30択・50択には影響しない）。
export const INSTANT_CHALLENGE_ANSWER_POOL_SIZE_VALUES = ["4", "10", "all"];
// 再生時間の選択肢（本人指示：1.5/1/0.5秒の3段階のみ。長い時間は入れない）。
export const INSTANT_CHALLENGE_PLAY_DURATION_VALUES = ["1.5", "1", "0.5"];
// 出題数の選択肢（本人指示：3/5/10問の3段階のみに変更。20/50/全曲は廃止）。
export const INSTANT_CHALLENGE_QUESTION_COUNT_VALUES = ["3", "5", "10"];

let elements = null; // 設定画面
let questionElements = null; // 問題画面
let resultElements = null; // 結果画面

let currentSettings = null; // { questionCountValue, categoryFilterValue, playDurationValue, answerPoolSizeValue }
// 苦手曲モード「一瞬」タブから開始した場合の、出題対象の曲ID一覧（それ以外はnull）。
// retryInstantChallengeRun()（「もう一度挑戦する」）でも同じ曲一覧を再利用するために保持する。
let currentExplicitSongIds = null;
let questions = []; // { song, answerPool }[]
let currentIndex = 0;
let answers = []; // { songId, isCorrect, replayCount }[]
let replayCounts = []; // 問題ごとの「もう一度聞く」使用回数（questionsと同じ長さ）
let seed = 0;
let hasAnsweredCurrentQuestion = false;
let questionStartedAt = 0;
// 【2026-08-30追加・本人指示：苦手曲5系統完全分離】苦手曲モード「一瞬」タブから開始した回かどうか。
// 苦手曲モード自身の結果が苦手曲判定・称号・クリア記録へフィードバックされてしまうのを防ぐため
// （js/weakSongsScreen.js・js/main.jsのbeginSpecialQuiz()等、他の苦手曲タブと同じ方針）、
// trueの間はrecordInstantChallengeWeakSongAttempt・称号判定・クリア記録を呼ばない。
// プレイ履歴（js/playHistory.js）には他の苦手曲タブと同じく通常どおり記録する。
let isWeakSongsPractice = false;

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
  isWeakSongsPractice = false;
  currentExplicitSongIds = null;
  await buildAndStartRun(settings);
}

export async function retryInstantChallengeRun() {
  if (!currentSettings) return;
  // isWeakSongsPractice・currentExplicitSongIdsは前回開始時の値のまま維持する
  // （「もう一度挑戦する」で練習/通常の種別・出題対象曲が変わることはないため）。
  await buildAndStartRun(currentSettings, currentExplicitSongIds);
}

// 苦手曲モード「一瞬」タブからの開始（2026-08-30新設、本人指示：苦手曲5系統完全分離）。
// カテゴリー絞り込みではなく、あらかじめ渡された曲IDだけを出題プールにする点だけが
// 通常の開始（handleStartButtonClick）と違う。設定画面のUIはjs/weakSongsScreen.js側の
// 専用fieldset（再生時間・回答方式・出題数）を使うため、このファイルの設定画面
// （#instant-challenge-setup-screen）は経由しない。
export async function startInstantChallengeWeakSongsPractice(songIds, settings) {
  isWeakSongsPractice = true;
  return buildAndStartRun({ ...settings, categoryFilterValue: "weakSongs" }, songIds);
}

// 今表示中の問題・結果が、苦手曲モード「一瞬」タブからの練習かどうか。main.js側で
// 「戻る」「設定へ戻る」「ホームへ戻る」の遷移先を、通常の一瞬チャレンジ設定画面ではなく
// 苦手曲モード画面へ切り替えるために使う。
export function isInstantChallengeWeakSongsPractice() {
  return isWeakSongsPractice;
}

// 音源を読み込み済みの曲だけで出題プールを組み立てる（既存の各モードと同じ絞り込み方針）。
// explicitSongIdsが渡された場合は、カテゴリー絞り込みの代わりにその曲IDだけを対象にする
// （苦手曲モード「一瞬」タブ用）。
async function resolvePlayableSongPool(categoryFilterValue, explicitSongIds) {
  const categoryPool = explicitSongIds
    ? explicitSongIds.map((songId) => SONGS.find((song) => song.id === songId)).filter((song) => song !== undefined)
    : resolveSongPool({ type: QUESTION_SOURCE_TYPE.CATEGORY, categoryFilterValue })
        .map((songId) => SONGS.find((song) => song.id === songId))
        .filter((song) => song !== undefined);
  return filterSongsWithImportedAudio(categoryPool);
}

async function buildAndStartRun(settings, explicitSongIds = null) {
  elements.startError.hidden = true;

  const pool = await resolvePlayableSongPool(settings.categoryFilterValue, explicitSongIds);
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
  currentExplicitSongIds = explicitSongIds;

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
  replayCounts = new Array(questions.length).fill(0);

  elements.onStart();
  return true;
}

// ===== 2. 問題画面 =====

// questionElements: {
//   progress, answerSearchRow, answerSearchInput, answerCount, answerList,
//   replayButton, nextButton,
//   backButton, quitConfirmModal, quitCancelButton, quitRestartButton, quitConfirmButton,
//   onQuit,
// }
export function initInstantChallengeQuestionScreen(newElements) {
  questionElements = newElements;
  questionElements.answerSearchInput.addEventListener("input", () => {
    renderAnswerButtons(questions[currentIndex].answerPool, questionElements.answerSearchInput.value);
  });

  // 【2026-08-30追加・本人指示⑨】「もう一度聞く」：ソロプレイでは回数無制限。
  // 回答後（hasAnsweredCurrentQuestion===true）は正解が確定済みのため押せないようにする。
  questionElements.replayButton.addEventListener("click", () => {
    if (hasAnsweredCurrentQuestion) return;
    replayCounts[currentIndex] += 1;
    playCurrentQuestionAudio();
  });

  // 【2026-08-30追加・本人指示⑧】「次の問題へ」：回答直後の自動送りをやめ、
  // 必ずこのボタンを押すまで次の音源を再生しない（通常イントロクイズ型の進行に統一）。
  questionElements.nextButton.addEventListener("click", () => {
    advanceToNextQuestionOrFinish();
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
  questionElements.answerSearchInput.value = "";
  questions = [];
  currentIndex = 0;
  answers = [];
  replayCounts = [];
  questionElements.onQuit();
}

async function restartRun() {
  stopAudio();
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

// 現在の問題の音源を、決まった再生位置・再生時間で再生する。初回再生・「もう一度聞く」の
// どちらからも同じ位置（questionIndexが同じ＝同じseedから同じ乱数が出る）が再生される。
function playCurrentQuestionAudio() {
  const question = questions[currentIndex];
  const questionIndex = currentIndex;
  const playDurationSec = Number(currentSettings.playDurationValue);
  const computeStartTimeSec = (durationSec) =>
    computeRandomStartTimeSec({ seed, songId: question.song.id, questionIndex, durationSec, playDurationSec });
  playSongFromRandomPosition(question.song, computeStartTimeSec, playDurationSec, showAudioErrorInline, () => {}, () => {});
}

function renderCurrentQuestion() {
  hasAnsweredCurrentQuestion = false;
  questionStartedAt = Date.now();
  questionElements.progress.textContent = `第${currentIndex + 1}問 / ${questions.length}問`;
  renderAnswerArea(questions[currentIndex]);

  questionElements.replayButton.hidden = false;
  questionElements.replayButton.disabled = false;
  questionElements.nextButton.hidden = true;

  playCurrentQuestionAudio();
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

// 【2026-08-30改訂・本人指示⑧】回答直後に自動で次へ進むのをやめ、正解・不正解を
// 表示したまま「次の問題へ」ボタンが押されるまで待つ（通常イントロクイズ型の進行）。
function handleAnswerSelected(selectedSongId, buttonElement) {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = questions[currentIndex];
  const isCorrect = selectedSongId === question.song.id;
  answers.push({ songId: question.song.id, isCorrect, replayCount: replayCounts[currentIndex] });
  if (!isWeakSongsPractice) {
    recordInstantChallengeWeakSongAttempt(question.song.id, isCorrect);
  }

  buttonElement.classList.add(isCorrect ? "is-correct" : "is-wrong");
  if (!isCorrect) {
    const correctButton = questionElements.answerList.querySelector(
      `.lyrics-quiz-answer-button[data-song-id="${question.song.id}"]`
    );
    if (correctButton) correctButton.classList.add("is-correct");
  }

  disableAllAnswerButtons();
  questionElements.replayButton.disabled = true; // 正解が確定した後の聞き直しは不要
  questionElements.nextButton.hidden = false;
  questionElements.nextButton.textContent =
    currentIndex + 1 >= questions.length ? "結果を見る" : "次の問題へ";
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

// resultElements: { correctCount, missCount, clearBadge, breakdownList, achievementList, achievementListLink }
export function initInstantChallengeResultScreen(newElements) {
  resultElements = newElements;
}

export function renderInstantChallengeResult() {
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const missCount = answers.length - correctCount;
  const isCleared = answers.length > 0 && missCount === 0;
  // 「即聞即答」等の裏チャレンジ判定材料：全問を通じて一度も「もう一度聞く」を使わなかったか。
  const noReplayUsed = answers.every((answer) => answer.replayCount === 0);
  const totalReplayCount = answers.reduce((sum, answer) => sum + answer.replayCount, 0);

  resultElements.correctCount.textContent = `${correctCount} / ${answers.length}問`;
  resultElements.missCount.textContent = `${missCount}問`;
  resultElements.clearBadge.hidden = !isCleared;

  // 【2026-08-30改訂・本人指示⑦⑪】クリア条件のキーに「実際に出題された問題数」を使う
  // （出題可能な曲が少なく、設定した問題数より少ない問題数で完走した場合、その実際の問題数を
  // 正直にキーへ反映する。これにより「10問クリア」相当の称号は、本当に10問出題された
  // 場合にしか成立しない）。
  // 【2026-08-30追加・本人指示：苦手曲5系統完全分離】苦手曲モード「一瞬」タブからの練習は、
  // クリア記録・称号判定のどちらにも一切反映しない（他の苦手曲タブと同じ「練習結果を
  // 判定へ書き戻さない」方針。クリアバッジ自体はその場の達成感として表示したままにする）。
  if (isCleared && !isWeakSongsPractice) {
    recordInstantChallengeClear(currentSettings.playDurationValue, currentSettings.answerPoolSizeValue, String(answers.length), {
      noReplayUsed,
    });
  }

  // 【2026-08-30追加・本人指示⑦⑪】一瞬チャレンジ専用の称号判定（一瞬ビギナー〜マスター・
  // 即聞即答）。js/achievementEvaluation.jsのevaluateInstantChallengeAchievements()は
  // 「実際に出題された問題数」を条件キーとして受け取る（クリア記録と同じ理由）。
  const earnedAchievementIds = isWeakSongsPractice
    ? []
    : evaluateInstantChallengeAchievements({
        playDurationValue: currentSettings.playDurationValue,
        answerPoolSizeValue: currentSettings.answerPoolSizeValue,
        questionCountValue: String(answers.length),
        isCleared,
        noReplayUsed,
      });
  const achievementResult = saveEarnedAchievements(earnedAchievementIds);
  renderAchievementUnlockEvents(achievementResult.newlyUnlockedIds, {
    chipContainer: resultElements.achievementList,
    achievementListLinkElement: resultElements.achievementListLink,
  });
  if (achievementResult.newlyUnlockedIds.length > 0) {
    renderPlayerSummary(); // ＝LOVE完全制覇を新規獲得した場合、推しアイコンの装飾を即座に反映する
  }

  savePlayHistoryEntry({
    playedAt: Date.now(),
    modeId: isWeakSongsPractice ? "weakSongsInstant" : "instantChallenge",
    modeLabel: isWeakSongsPractice ? "苦手曲モード（一瞬）" : "一瞬チャレンジ",
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
      noReplayUsed,
      totalReplayCount,
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
    const replaySuffix = answer.replayCount > 0 ? `（聞き直し${answer.replayCount}回）` : "";
    title.textContent = `第${index + 1}問：${question.song.title}${replaySuffix}`;
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
