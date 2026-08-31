// オンライン対戦「一瞬バトル」専用の画面コントローラ（2026-08-30新設、本人指示：19-3章）。
//
// 【なぜjs/onlineBattleScreen.jsと分けたか】js/onlineLyricsQuizBattleScreen.jsと同じ理由。
// 既存のオンライン対戦（タイムアタック等）は既存の共有クイズ画面（#quiz-screen、js/main.jsの
// 描画・採点ロジック）をそのまま使うが、一瞬バトルは「もう一度聞く」がプレイヤーごとに
// 独立して最大3回まで（本人指示）という、既存の共有クイズ画面には無い挙動が必要になる。
// 既存の何千行もあるクイズエンジンへ無理に手を加えて他モードへ影響が及ぶ危険を避けるため、
// 1人用の一瞬チャレンジ（js/instantChallengeScreen.js）と同じUI・ロジックを土台に、
// 専用の画面として分離した。
//
// 【進行モデルについて、歌詞クイズ対戦との違い】歌詞クイズ対戦は「全員が同じ問題を同時に見る」
// ホスト主導の同期進行のため、js/onlineBattleScreen.jsを一切importしない設計になっている。
// 一瞬バトルは逆に「各自が同じ問題セットを自分のペースで解き進める」独立進行（タイムアタック等と
// 全く同じモデル）のため、js/onlineBattleScreen.jsが既に持つ待機画面・結果画面・進捗報告の
// 仕組み（finishOnlineBattleMatch・reportOnlineBattleProgress）をそのまま使うのが最も安全で
// 重複が無い。ただし相互importの循環（onlineBattleScreen.js⇄このファイル）を避けるため、
// それらの関数はimportで直接持たず、js/main.js側からコールバックとしてinit時に受け取る
// （js/onlineLyricsQuizBattleScreen.jsのonQuitDuringBattle等と同じ配線パターン）。
//
// 【決定論性について】buildQuestions()（js/battleModes/instantBattleMode.js）がseedから
// 全端末で完全に同じ問題セット（曲順・回答候補の並び順）を作る。再生開始位置は、
// js/battleModes/randomPlaybackBattleMode.jsと全く同じ理由で、実機の音源長ではなく
// js/data/audioMetadata.jsの固定durationSecを使う（対戦開始前のvalidateSettingsが、
// このデータを持たない曲を既に弾いているため、ここでの欠落は基本的に起こらない想定）。

import { AUDIO_METADATA } from "./data/audioMetadata.js";
import {
  computeRandomStartTimeSec,
  clampStartTimeToActualDuration,
  isDurationMismatchWithinTolerance,
} from "./randomPlaybackEngine.js";
import { playSongFromRandomPosition, stopAudio } from "./audio.js";
import { LARGE_ANSWER_POOL_THRESHOLD } from "./lyricsQuizEngine.js";
import { normalizeForSearch, songMatchesSearch } from "./songlist.js";
import { buildQuestions, createResult, MAX_REPLAY_COUNT_PER_QUESTION } from "./battleModes/instantBattleMode.js";
import { runLocalReplayCountdown, cancelLocalReplayCountdown } from "./localReplayCountdown.js";

let elements = null;

// 今の対戦の状態（ルームを離れる・再入場のたびにresetOnlineInstantBattleState()で初期化する）。
let currentRoomId = null;
let currentMatchId = null;
let currentSettings = null;
let currentSeed = 0;
let questions = [];
let currentIndex = 0;
let answers = []; // { songId, isCorrect, replayCount }[]
let replayCounts = [];
let hasAnsweredCurrentQuestion = false;
let matchStartedAtMs = 0;
let isCountdownActive = false; // 【2026-09-05新設】カウントダウン中の連打・二重再生を防ぐ

// elements: {
//   progress, quitButton, quitConfirmModal, quitCancelButton, quitConfirmButton,
//   error, countdown, countdownNumber, replayButton, answerSearchRow, answerSearchInput,
//   answerCount, answerList, nextButton,
//   navigateTo, onQuitDuringBattle, onFinishMatch, onReportProgress,
// }
export function initOnlineInstantBattleScreens(newElements) {
  elements = newElements;

  elements.quitButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = false;
  });
  elements.quitCancelButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = true;
  });
  elements.quitConfirmButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = true;
    stopAudio();
    resetOnlineInstantBattleState();
    elements.onQuitDuringBattle();
    elements.navigateTo("onlineBattleEntry");
  });

  elements.replayButton.addEventListener("click", () => {
    if (hasAnsweredCurrentQuestion) return;
    if (isCountdownActive) return; // 【2026-09-05新設】カウントダウン中の連打を無視する
    if (replayCounts[currentIndex] >= MAX_REPLAY_COUNT_PER_QUESTION) return;
    replayCounts[currentIndex] += 1;
    updateReplayButtonLabel();
    playCurrentQuestionAudioWithCountdown();
  });

  elements.answerSearchInput.addEventListener("input", () => {
    renderAnswerButtons(questions[currentIndex].answerPool, elements.answerSearchInput.value);
  });

  elements.nextButton.addEventListener("click", () => {
    advanceToNextQuestionOrFinish();
  });
}

// ルームを離れる・別のルームへ入り直す際に呼ぶ、状態の完全リセット。
export function resetOnlineInstantBattleState() {
  stopAudio();
  cancelLocalReplayCountdown();
  isCountdownActive = false;
  currentRoomId = null;
  currentMatchId = null;
  currentSettings = null;
  currentSeed = 0;
  questions = [];
  currentIndex = 0;
  answers = [];
  replayCounts = [];
  hasAnsweredCurrentQuestion = false;
  matchStartedAtMs = 0;
}

// js/onlineBattleScreen.jsのenterOnlineBattlePlay()から、gameMode==="instantBattle"のときに
// 呼ばれる入口（js/onlineLyricsQuizBattleScreen.jsのenterLyricsQuizBattlePlay()と同じ役割）。
export function enterOnlineInstantBattlePlay(room) {
  currentRoomId = room.roomId;
  currentMatchId = room.activeMatchId;
  currentSettings = room.settings;
  currentSeed = room.seed;
  questions = buildQuestions({ seed: room.seed, settings: room.settings });
  currentIndex = 0;
  answers = [];
  replayCounts = new Array(questions.length).fill(0);
  hasAnsweredCurrentQuestion = false;
  matchStartedAtMs = Date.now();

  elements.error.hidden = true;
  elements.navigateTo("onlineInstantBattleQuestion");
  renderCurrentQuestion();
}

function showAudioErrorInline(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

function updateReplayButtonLabel() {
  const remaining = MAX_REPLAY_COUNT_PER_QUESTION - replayCounts[currentIndex];
  elements.replayButton.textContent = `🔁 もう一度聞く（残り${Math.max(0, remaining)}回）`;
  elements.replayButton.disabled = remaining <= 0;
}

// js/main.jsのgameState.playMode === "onlineBattle" && playbackType === "randomPosition"の
// 分岐（オンライン対戦・ランダム再生クイズ）と全く同じ考え方・同じ安全策
// （固定durationSec・許容差チェック・クランプ）を、一瞬バトル向けに再現したもの。
function playCurrentQuestionAudio() {
  const question = questions[currentIndex];
  const questionIndex = currentIndex;
  const playDurationSec = Number(currentSettings.playDurationValue);
  const fixedDurationSec = AUDIO_METADATA[question.song.id]?.durationSec ?? null;

  if (fixedDurationSec === null) {
    // 本来はinstantBattleMode.jsのvalidateSettings()が対戦開始自体を拒否しているはずで、
    // 通常はここに到達しない。その防御が万一漏れた場合の保険（randomPlaybackBattleMode.jsと同じ方針）。
    showAudioErrorInline("この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    return;
  }

  const computeStartTimeSec = (actualDurationSec) => {
    if (!isDurationMismatchWithinTolerance(fixedDurationSec, actualDurationSec)) {
      // 全端末で同じ開始位置になることが公平性の前提のため、差が大きすぎる場合は
      // 無言でクランプして続行せず、再生を中止する（randomPlaybackBattleMode.jsの
      // main.js側実装と同じ安全策）。
      stopAudio();
      showAudioErrorInline("この曲の音源が他の端末と異なる可能性があります。音源を入れ直してください。");
      return 0;
    }
    const canonicalStartTimeSec = computeRandomStartTimeSec({
      seed: currentSeed,
      songId: question.song.id,
      questionIndex,
      durationSec: fixedDurationSec,
      playDurationSec,
    });
    return clampStartTimeToActualDuration(canonicalStartTimeSec, actualDurationSec);
  };

  playSongFromRandomPosition(question.song, computeStartTimeSec, playDurationSec, showAudioErrorInline, () => {}, () => {});
}

// 【2026-09-05新設】音源再生の直前に3→2→1を表示してから再生する。初回出題・再視聴の
// どちらもこれ経由で呼ぶ（本人指示：一瞬バトルは両方にカウントダウンを付ける）。
function playCurrentQuestionAudioWithCountdown() {
  isCountdownActive = true;
  runLocalReplayCountdown(
    { containerElement: elements.countdown, numberElement: elements.countdownNumber },
    () => {
      isCountdownActive = false;
      playCurrentQuestionAudio();
    }
  );
}

function renderCurrentQuestion() {
  hasAnsweredCurrentQuestion = false;
  elements.progress.textContent = `第${currentIndex + 1}問 / ${questions.length}問`;
  renderAnswerArea(questions[currentIndex]);

  elements.replayButton.hidden = false;
  updateReplayButtonLabel();
  elements.nextButton.hidden = true;

  playCurrentQuestionAudioWithCountdown();
}

function renderAnswerArea(question) {
  const pool = question.answerPool;
  const isLargePool = pool.length >= LARGE_ANSWER_POOL_THRESHOLD;
  elements.answerSearchRow.hidden = !isLargePool;
  if (isLargePool) {
    elements.answerSearchInput.value = "";
    elements.answerCount.textContent = `${pool.length}曲`;
  }
  renderAnswerButtons(pool, "");
}

function renderAnswerButtons(pool, searchQuery) {
  const normalizedQuery = normalizeForSearch(searchQuery);
  const filtered =
    normalizedQuery === ""
      ? pool
      : pool.filter((song) => songMatchesSearch(song.title, song.searchReading, song.searchAliases, normalizedQuery));

  elements.answerList.innerHTML = "";
  filtered.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button lyrics-quiz-answer-button";
    button.textContent = song.title;
    button.dataset.songId = song.id;
    button.addEventListener("click", () => handleAnswerSelected(song.id, button));
    elements.answerList.appendChild(button);
  });
}

function disableAllAnswerButtons() {
  elements.answerList.querySelectorAll(".lyrics-quiz-answer-button").forEach((button) => {
    button.disabled = true;
  });
}

function handleAnswerSelected(selectedSongId, buttonElement) {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = questions[currentIndex];
  const isCorrect = selectedSongId === question.song.id;
  answers.push({ songId: question.song.id, isCorrect, replayCount: replayCounts[currentIndex] });

  buttonElement.classList.add(isCorrect ? "is-correct" : "is-wrong");
  if (!isCorrect) {
    const correctButton = elements.answerList.querySelector(`.lyrics-quiz-answer-button[data-song-id="${question.song.id}"]`);
    if (correctButton) correctButton.classList.add("is-correct");
  }

  disableAllAnswerButtons();
  elements.replayButton.disabled = true; // 正解が確定した後の聞き直しは不要
  elements.nextButton.hidden = false;
  elements.nextButton.textContent = currentIndex + 1 >= questions.length ? "結果を送信する" : "次の問題へ";

  // 他プレイヤーの待機画面に進捗を反映する（fire-and-forget。js/onlineBattle.jsの
  // submitAnswerProgress参照：内部で全て握りつぶし、rejectしない）。
  elements.onReportProgress(answers.length);
}

function advanceToNextQuestionOrFinish() {
  currentIndex += 1;
  if (currentIndex >= questions.length) {
    finishMatch();
    return;
  }
  renderCurrentQuestion();
}

function finishMatch() {
  const correctCount = answers.filter((answer) => answer.isCorrect).length;
  const missCount = answers.length - correctCount;
  const totalReplayCount = answers.reduce((sum, answer) => sum + answer.replayCount, 0);
  const totalElapsedMs = Date.now() - matchStartedAtMs;

  const result = createResult({
    correctCount,
    missCount,
    totalElapsedMs,
    totalReplayCount,
    completed: true,
  });
  elements.onFinishMatch(result, answers.length);
}
