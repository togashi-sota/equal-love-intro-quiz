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
import { QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { normalizeForSearch, songMatchesSearch } from "./songlist.js";
import {
  loadSongsWithLyrics,
  filterQuizzableSongs,
  validateLyricsQuizAvailability,
  buildLyricsQuizQuestions,
  resolveLyricsQuizSongPool,
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
import { evaluateAndSaveAchievements } from "./achievementProgress.js";
import { renderAchievementUnlockEvents } from "./achievementDisplay.js";
import { savePlayHistoryEntry } from "./playHistory.js";

// 正解/不正解の演出（既存の.choice-buttonのis-correct/is-wrong）を見せてから次の問題へ進むまでの待ち時間。
const ANSWER_FEEDBACK_DELAY_MS = 900;

let elements = null; // 設定画面
let questionElements = null; // 問題画面
let resultElements = null; // 結果画面

let currentSettings = null; // { questionCountValue, categoryFilterValue, answerPoolSizeValue }
// 「今何問目か」「各解答の記録」はjs/lyricsQuizRunState.jsの純粋関数で管理する
// （画面のDOMを介さずに進行ロジックだけを自動テストできるようにするため）。
let runState = null;
// 「今どのヒント段階を画面に表示しているか」。採点に使う「到達した最大ヒント段階」
// （runState.currentHintCount）とは別に持つ。ヒント一覧のボタンで過去のヒントへ
// 戻って見返しても、runState.currentHintCountは変わらない＝使用ヒント数は減らない
// （本人の指示どおり）。1〜runState.currentHintCountの範囲だけを取りうる。
let viewingHintLevel = 1;
let hasAnsweredCurrentQuestion = false;
let questionStartedAt = 0;
let runStartedAt = 0;
let elapsedTimerId = null;
// 正解/不正解演出のあと、自動で次の問題へ進むsetTimeoutの予約ID。
// 途中でクイズをやめたときにこれを解除し忘れると、離脱後に古いタイマーが発火して
// 勝手に次の問題や結果画面へ進んでしまう（quitLyricsQuizRun()参照）。
let pendingAnswerFeedbackTimeoutId = null;

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

  // 【2026-08-08修正】resolveSongPool()ではなく、歌詞クイズ対象外の曲
  // （Overture等、ボーカルの無い曲）を除いたresolveLyricsQuizSongPool()を使う。
  const songPool = resolveLyricsQuizSongPool({
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
//   progress, elapsedTime, hintLevelLabel, hintLevelNav, hintList, nextHintButton, skipButton,
//   answerSection, answerSearchRow, answerSearchInput, answerCount, answerList,
//   answerReveal, answerRevealStatus, answerRevealTitle, answerRevealMeta, answerRevealNextButton,
//   backButton, quitConfirmModal, quitCancelButton, quitConfirmButton,
//   onQuit: 「今回の挑戦をやめる」が確定したときに呼ばれるコールバック（引数なし）。
//     画面遷移はmain.js側だけで行うというプロジェクトの決まりに合わせ、実際の
//     showScreen()呼び出しはこのコールバック側（main.js）に任せる。このファイル自身は
//     呼ぶ前に進行状態の後片付けをすべて終わらせておく（quitLyricsQuizRun()参照）。
// }
export function initLyricsQuizQuestionScreen(newElements) {
  questionElements = newElements;
  questionElements.nextHintButton.addEventListener("click", handleNextHintButtonClick);
  questionElements.skipButton.addEventListener("click", handleSkipButtonClick);
  questionElements.answerRevealNextButton.addEventListener("click", handleAnswerRevealNextButtonClick);
  questionElements.answerSearchInput.addEventListener("input", () => {
    renderAnswerButtons(getCurrentQuestion(runState).answerPool, questionElements.answerSearchInput.value);
  });

  questionElements.backButton.addEventListener("click", openLyricsQuizQuitConfirmModal);
  questionElements.quitCancelButton.addEventListener("click", closeLyricsQuizQuitConfirmModal);
  questionElements.quitConfirmButton.addEventListener("click", () => {
    closeLyricsQuizQuitConfirmModal();
    quitLyricsQuizRun();
  });
  // オーバーレイの背景部分をクリックしたときも閉じる（誤って終了しない。既存の
  // #quiz-quit-confirm-modalと同じ考え方。event.targetがオーバーレイ自身のときだけ、
  // つまりモーダルカードの外側をクリックしたときだけ閉じる）。
  questionElements.quitConfirmModal.addEventListener("click", (event) => {
    if (event.target === questionElements.quitConfirmModal) {
      closeLyricsQuizQuitConfirmModal();
    }
  });
  // Escキーは「クイズを続ける」と同じ扱いにする（誤って終了させないため、Escでは
  // 閉じるだけで終了はしない）。このモーダルが開いているときだけ反応する。
  document.addEventListener("keydown", (event) => {
    if (questionElements.quitConfirmModal.hidden) return;
    if (event.key === "Escape") closeLyricsQuizQuitConfirmModal();
  });
}

function openLyricsQuizQuitConfirmModal() {
  questionElements.quitConfirmModal.hidden = false;
  // 誤ってEnterキー等で「今回の挑戦をやめる」を押してしまわないよう、
  // 表示時は安全な方の「クイズを続ける」ボタンへフォーカスを合わせる。
  questionElements.quitCancelButton.focus();
}

function closeLyricsQuizQuitConfirmModal() {
  questionElements.quitConfirmModal.hidden = true;
}

// 途中で歌詞クイズをやめるときの後片付けをまとめて行う。画面をただ切り替えるだけでなく、
// 実行中の状態を必ず明示的に破棄する（本人の要望：以前オンライン対戦で、Firebase側の
// 状態を変えないまま画面だけ移動してしまい不整合が起きた反省から、今回はそれを避けたい）。
// ・経過時間タイマーを止める
// ・正解/不正解演出のあとに自動で次の問題へ進む予約（setTimeout）を解除する
//   （解除しないと、離脱後にタイマーが発火し、もう表示されていない問題の続きが
//   　勝手に進行してしまう）
// ・検索欄をクリアする
// ・runStateをnullにする（今の問題配列・currentQuestionIndex・currentHintCount・
//   　回答履歴は、すべてrunStateの中にまとまっているため、これで一括して破棄される。
//   　次回開始時は必ずcreateLyricsQuizRunState()から作り直すので、古い内容が
//   　引き継がれることはない）
// ・viewingHintLevelを1に戻す
// 結果は一切作成せず（createLyricsQuizResult()を呼ばない）、自己ベストも更新しない。
function quitLyricsQuizRun() {
  stopElapsedTimer();
  clearPendingAnswerFeedbackTimeout();
  questionElements.answerSearchInput.value = "";
  hideAnswerReveal(); // 正解確認カードを表示したまま離脱した場合に備え、必ず隠しておく

  runState = null;
  viewingHintLevel = 1;
  hasAnsweredCurrentQuestion = false;

  questionElements.onQuit();
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
  viewingHintLevel = 1;

  questionElements.progress.textContent = `第${runState.currentQuestionIndex + 1}問 / ${runState.questions.length}問`;
  questionElements.skipButton.disabled = false;
  hideAnswerReveal(); // 前の問題の正解確認カードが残っていないよう、必ず隠してから始める

  renderHint(question);
  renderAnswerArea(question);
}

// デバッグ用ログ（区間の選ばれ方・ヒントが止まった理由の確認用）を出すかどうか。
// 通常のプレイでは表示しない。js/main.jsのisRandomPlaybackDebugLoggingEnabled()と
// 同じ考え方で、ブラウザのコンソールで以下を実行してから再読み込みすると有効になる：
//   localStorage.setItem("equalLoveIntroQuiz.debugLyricsQuiz", "1")
// 【重要】歌詞本文（segment.text）は絶対にログへ出さない。曲名・区間の位置情報・
// 品質スコアなど、歌詞本文を含まない情報だけを出す。
function isLyricsQuizDebugLoggingEnabled() {
  try {
    return localStorage.getItem("equalLoveIntroQuiz.debugLyricsQuiz") === "1";
  } catch {
    return false;
  }
}

// DEBUGログに出す「今どのDOM形式（見た目の版）で動いているか」の目印。
// 見た目を大きく変えるたびに文字列を変える。本人が実機で「今のは新しい版か」を
// 判断したいときに、この値だけで判断できるようにするための簡易な目印
// （キャッシュが古いままだと、そもそもこのログ自体が出ない・別の値になる）。
const LYRICS_QUIZ_HINT_UI_VERSION = "hint-nav-v1（積み上げ表示＋段階ボタンで行き来可能）";

// hintLevel段階目で新しく追加された行の行番号を返す（1段階目は基準行そのもの）。
function computeAddedLineForLevel(hints, hintLevel) {
  if (hintLevel === 1) return hints[0].startLine;
  const previous = hints[hintLevel - 2];
  const current = hints[hintLevel - 1];
  return current.startLine < previous.startLine ? current.startLine : current.endLine;
}

function logHintDebugInfo(question, viewedHint) {
  if (!isLyricsQuizDebugLoggingEnabled()) return;
  const segment = viewedHint.segment;
  const lastHint = question.hints[question.hints.length - 1];
  console.log("[歌詞クイズ] ヒント表示", {
    domVersion: LYRICS_QUIZ_HINT_UI_VERSION,
    songTitle: question.song.title,
    segmentId: segment.id,
    hintLevel: viewedHint.hintLevel,
    maxHintLevelReached: runState.currentHintCount,
    lineCount: segment.endLine - segment.startLine + 1,
    startLine: segment.startLine,
    endLine: segment.endLine,
    addedLine: computeAddedLineForLevel(question.hints, viewedHint.hintLevel),
    quality: segment.quality,
    isRepeat: segment.isRepeat,
    containsTitle: segment.containsTitle,
    // 途中で打ち切られた場合だけ値が入る（js/lyricsSegmentEngine.jsのbuildHintSequence()参照）。
    growthStoppedReason: lastHint.stopReason ?? null,
  });
}

// question.hints（各要素が { hintLevel, startLine, endLine, segment } を持つ、レベルごとに
// 1行ずつ増える区間の列）から、「今表示すべきレベルまでで、実際に増えた行1行ずつ」を
// 歌詞の登場順（行番号の昇順）に並べたリストを作る。
// ヒントは前方向・後方向どちらにも増えうるため（js/lyricsSegmentEngine.jsのbuildHintSequence()
// 参照）、隣り合うレベルのsegmentのstartLine/endLineを比較して「今回どちら側に1行増えたか」を
// 判定し、その1行だけを取り出す。
function computeRevealedHintLines(hints, uptoLevel) {
  const first = hints[0];
  const revealed = [{ lineNumber: first.startLine, text: first.segment.text, level: first.hintLevel }];

  for (let i = 1; i < uptoLevel; i += 1) {
    const previous = hints[i - 1].segment;
    const current = hints[i].segment;
    const lines = current.text.split("\n");
    if (current.startLine < previous.startLine) {
      revealed.push({ lineNumber: current.startLine, text: lines[0], level: hints[i].hintLevel });
    } else if (current.endLine > previous.endLine) {
      revealed.push({ lineNumber: current.endLine, text: lines[lines.length - 1], level: hints[i].hintLevel });
    }
  }

  return revealed.sort((a, b) => a.lineNumber - b.lineNumber);
}

// 新しく表示された行が画面外にある場合、そこまで自動スクロールする。
// prefers-reduced-motionが有効な環境ではアニメーションさせない。
function scrollHintElementIntoView(element) {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
}

// これまでに公開したヒントの行を、歌詞の登場順（上から下）に、それぞれ
// 「ヒント1」「ヒント2で追加」のようなラベル付きで表示する。過去に表示した行は消さない
// （本人からの指摘：以前は段階が進むと別の区間へ切り替わり、前のヒントが消えて
// 「情報が減った」ように見えることがあったため、常に積み上げ表示にする）。
// viewingHintLevelまでの行を表示する（到達済みの段階なら、過去の段階へ戻って
// その時点までの表示に戻すこともできる。詳しくはhandleHintLevelNavClick()参照）。
function renderHintList(question) {
  const revealed = computeRevealedHintLines(question.hints, viewingHintLevel);
  questionElements.hintList.innerHTML = "";

  let currentElement = null;
  revealed.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "lyrics-quiz-hint-line";

    const badge = document.createElement("span");
    badge.className = "lyrics-quiz-hint-line-badge";
    badge.textContent = entry.level === 1 ? "ヒント1" : `ヒント${entry.level}で追加`;
    item.appendChild(badge);

    const text = document.createElement("p");
    text.className = "lyrics-quiz-hint-line-text";
    text.textContent = entry.text;
    item.appendChild(text);

    questionElements.hintList.appendChild(item);
    if (entry.level === viewingHintLevel) {
      item.classList.add("is-current");
      currentElement = item;
    }
  });

  if (currentElement) scrollHintElementIntoView(currentElement);
}

// これまでに開放した段階（1〜runState.currentHintCount）へ、いつでも自由に
// 表示を切り替えられるボタン列を作る。未開放の段階はdisabledにする
// （本人の指示：戻って見返せるが、まだ見ていない段階を先に覗くことはできない）。
function renderHintLevelNav(question) {
  questionElements.hintLevelNav.innerHTML = "";
  question.hints.forEach((hint) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "lyrics-quiz-hint-level-button";
    button.textContent = `ヒント${hint.hintLevel}`;
    button.disabled = hint.hintLevel > runState.currentHintCount;
    if (hint.hintLevel === viewingHintLevel) button.classList.add("is-active");
    button.addEventListener("click", () => handleHintLevelNavClick(hint.hintLevel, question));
    questionElements.hintLevelNav.appendChild(button);
  });
}

// 開放済みのヒント段階ボタンが押されたときの処理。表示だけを切り替え、
// runState.currentHintCount（＝採点に使う「到達した最大ヒント段階」）は変更しない
// （戻って見返しても使用ヒント数が減らないようにするため）。
function handleHintLevelNavClick(level, question) {
  if (level > runState.currentHintCount) return;
  viewingHintLevel = level;
  renderHint(question);
}

function renderHint(question) {
  const viewedHint = question.hints[viewingHintLevel - 1];
  logHintDebugInfo(question, viewedHint);

  questionElements.hintLevelLabel.textContent = `ヒント ${viewingHintLevel} / ${question.hints.length}`;
  renderHintList(question);
  renderHintLevelNav(question);
  questionElements.nextHintButton.disabled =
    hasAnsweredCurrentQuestion || runState.currentHintCount >= question.hints.length;
}

function handleNextHintButtonClick() {
  const question = getCurrentQuestion(runState);
  if (hasAnsweredCurrentQuestion || runState.currentHintCount >= question.hints.length) return;
  runState = advanceHint(runState);
  // 新しく開放した段階へ表示も進める（過去の段階を見ていた状態から押しても、
  // 常に「新しく見えるようになった段階」へジャンプする、という自然な挙動にする）。
  viewingHintLevel = runState.currentHintCount;
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

// 4択（answerPoolSizeValue==="4"）は、正解の選択肢が常に画面内に見えているため、
// 従来どおりの自動進行のままにする（本人指示：「4択については、現在の正解表示を
// 維持して構いません」）。それ以外（10/30/50/全曲検索）は、正解が検索結果の外・
// スクロール先など画面外になりうるため、正解確認カードで自動進行を止める。
function isWideAnswerMode() {
  return currentSettings?.answerPoolSizeValue !== "4";
}

// 「第X問・ヒントYまで使用」のような、正解確認カードに添える簡潔な内訳を組み立てる。
// 歌詞本文には一切触れない（曲名・問題番号・ヒント段階だけ）。
function buildAnswerRevealMetaText(question) {
  const questionNumber = runState.currentQuestionIndex + 1;
  const hintLevelUsed = runState.currentHintCount;
  return `第${questionNumber}問・ヒント${hintLevelUsed}まで使用`;
}

// 正解確認カードを表示し、選択肢・スキップボタンを隠す（本人指示：不正解／スキップ後は
// 自動で次へ進まず、「次の問題へ」を押すまでこのカードにとどまる）。
function showAnswerReveal(question, statusText) {
  questionElements.answerSection.hidden = true;
  questionElements.skipButton.hidden = true;

  questionElements.answerRevealStatus.textContent = statusText;
  questionElements.answerRevealTitle.textContent = question.song.title;
  questionElements.answerRevealMeta.textContent = buildAnswerRevealMetaText(question);
  questionElements.answerReveal.hidden = false;
  questionElements.answerRevealNextButton.disabled = false;
}

// 正解確認カードを隠し、選択肢・スキップボタンを元通り表示する。
// 次の問題の描画（renderAnswerArea）が、隠した選択肢エリアを改めて組み立て直す。
function hideAnswerReveal() {
  questionElements.answerReveal.hidden = true;
  questionElements.answerSection.hidden = false;
  questionElements.skipButton.hidden = false;
}

// 正解確認カードの「次の問題へ」ボタン。本人指示：「何度押しても次の問題が
// 二重に開始されないようにする」ため、クリック直後に即座に無効化する。
function handleAnswerRevealNextButtonClick() {
  if (questionElements.answerRevealNextButton.disabled) return;
  questionElements.answerRevealNextButton.disabled = true;
  advanceToNextQuestionOrFinish();
}

function handleAnswerSelected(selectedSongId, buttonElement) {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = getCurrentQuestion(runState);
  const isCorrect = selectedSongId === question.song.id;
  // 回答時間は、この時点（回答を確定した瞬間）で必ず確定させる。この後に表示する
  // 正解確認カードをどれだけ長く見ていても、平均回答時間・称号判定・自己ベストには
  // 一切影響しない（本人指示）。
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

  // 正解時は今までどおり自動で次へ進む。不正解時は、4択だけ自動進行のまま、
  // それ以外（正解が画面外になりうる回答方式）は正解確認カードで自動進行を止める。
  if (!isCorrect && isWideAnswerMode()) {
    showAnswerReveal(question, "不正解");
    return;
  }
  scheduleAnswerFeedbackAdvance();
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

  if (isWideAnswerMode()) {
    showAnswerReveal(question, "スキップ");
    return;
  }
  scheduleAnswerFeedbackAdvance();
}

// 正解/不正解演出のあと、少し待ってから次の問題（または結果画面）へ自動で進める予約を入れる。
// 途中でクイズをやめた場合は、この予約をquitLyricsQuizRun()側で必ず解除する。
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
//   newRecordBadge, breakdownList, achievementChipContainer, achievementListLink,
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

  // 称号（実績）判定（2026-08-07追加、本人指示）。歌マスター・リリックマスターの条件には
  // 時間もヒント合計も関係しないため、averageResponseMsは渡さない（null＝判定に使われない）。
  // maxHintLevelByQuestionは、各問題のhintsUsedCount（＝到達した最大ヒント段階、
  // js/lyricsQuizRunState.js参照）をそのまま使う。
  const wrongCount = runState.answers.filter(
    (answer) => answer.outcome === LYRICS_QUIZ_ANSWER_OUTCOME.WRONG_ANSWER
  ).length;
  const skippedCount = runState.answers.filter(
    (answer) => answer.outcome === LYRICS_QUIZ_ANSWER_OUTCOME.SKIPPED
  ).length;
  const achievementResult = evaluateAndSaveAchievements({
    modeId: "lyricsQuiz",
    questionCountValue: currentSettings.questionCountValue,
    correctCount: result.correctCount,
    wrongCount,
    skippedCount,
    completed: true,
    averageResponseMs: null,
    maxHintLevelByQuestion: runState.answers.map((answer) => answer.hintsUsedCount),
  });
  renderAchievementUnlockEvents(achievementResult.newlyUnlockedIds, {
    chipContainer: resultElements.achievementChipContainer,
    achievementListLinkElement: resultElements.achievementListLink,
  });

  // 【2026-08-08新設】統一プレイ履歴（js/playHistory.js）への保存。自己ベスト・称号とは
  // 別の保存先のため、この保存に失敗しても上の自己ベスト保存・称号判定には一切影響しない。
  savePlayHistoryEntry({
    playedAt: Date.now(),
    modeId: "lyricsQuiz",
    modeLabel: "歌詞クイズ",
    questionCount: result.totalQuestions,
    isAllSongsMode: currentSettings.categoryFilterValue === "all",
    correctCount: result.correctCount,
    wrongCount,
    skippedCount,
    score: null,
    averageResponseMs: null,
    completed: true,
    details: {
      totalHintsUsed: result.totalHintsUsed,
      averageHintsUsed: result.averageHintsUsed,
      firstHintCorrectCount: result.firstHintCorrectCount,
      totalElapsedMs: result.totalElapsedMs,
      answerPoolSizeValue: currentSettings.answerPoolSizeValue,
      isNewRecord,
    },
  });

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
