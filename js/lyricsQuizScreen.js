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
import { filterSongsByCategory } from "./quiz.js";
import { computeRevealedHintLines } from "./lyricsSegmentEngine.js";
// 【2026-09-26追加・本人指示：サウンドシステム全面整備7章】正解・不正解は他のクイズ
// モードと同じ効果音（SFX_EVENTS.QUIZ_CORRECT/QUIZ_WRONG）で統一する。以前はこのモードだけ
// SFXの呼び出しが1件もなく、完全に無音だった（本人指示の監査で発覚）。
import { playCorrectSound, playWrongSound } from "./sfx.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { recordLyricsQuizWeakSongAttempt } from "./lyricsQuizWeakSongStats.js";
// 【2026-11-XX改訂・本人指示：大きい候補プールから曲名を選ぶUIでは五十音フィルターを使う】
// 以前はこのファイル自身がnormalizeForSearch/songMatchesSearchを直接呼んで検索だけを
// 行っていたが、一瞬チャレンジ・オンライン対戦と同じ50音ジャンプ付きの検索UI
// （js/answerPoolBrowseUi.js、js/onlineLyricsQuizBattleScreen.jsが最初に持っていた
// 実装を共通化したもの）へ統一した。検索・50音の判定ロジック自体は変えていない
// （js/answerPoolBrowseUi.js内部でsonglist.jsの同じ関数を使っている）。
import {
  createAnswerPoolBrowseState,
  resetAnswerPoolBrowseState,
  filterAnswerPool,
  renderAnswerJumpBar,
} from "./answerPoolBrowseUi.js";
import {
  loadSongsWithLyrics,
  filterQuizzableSongs,
  validateLyricsQuizAvailability,
  buildLyricsQuizQuestions,
  resolveLyricsQuizSongPool,
  isLyricsQuizEligibleSong,
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
import { renderAchievementUnlockEvents, clearAchievementUnlockEvents } from "./achievementDisplay.js";
import { savePlayHistoryEntry } from "./playHistory.js";
import {
  getLyricsQuizRevealAudioEnabled,
  setLyricsQuizRevealAudioEnabled,
  initRevealAudioToggle,
} from "./revealAudioPreference.js";
import { playSongFromRandomPosition, stopAudio } from "./audio.js";

// 正解/不正解の演出（既存の.choice-buttonのis-correct/is-wrong）を見せてから次の問題へ進むまでの待ち時間。
const ANSWER_FEEDBACK_DELAY_MS = 900;

let elements = null; // 設定画面
let questionElements = null; // 問題画面
// 【2026-11-XX新設】検索文字列・50音ジャンプの選択行（answerPoolBrowseUi.js参照）。
const answerBrowseState = createAnswerPoolBrowseState();
let resultElements = null; // 結果画面

let currentSettings = null; // { questionCountValue, categoryFilterValue, answerPoolSizeValue }
// 【2026-08-29追加、本人指示】この回が「通常の入り口（カテゴリー絞り込み）から始まった
// 歌詞クイズ」("normal")なのか、曲IDを直接指定して始まった回（"weakSongPractice"＝苦手曲
// モードB、"customQuiz"＝オリジナル問題作成モードの歌詞クイズタイプ）なのかを区別するフラグ。
// "normal"のときだけ、①js/lyricsQuizWeakSongStats.jsへ曲ごとの正誤を記録する
// ②自己ベスト・称号を更新する。それ以外（"normal"でない値すべて）は、既存の苦手曲モード
// （イントロ側）・オリジナル問題作成モード（イントロ側）と同じ考え方
// （js/main.jsのgameState.playMode==="special"の扱い）で、判定に使う統計への書き戻しを
// しない（自己強化ループ・練習結果の混入を避ける）・自己ベストや称号も更新しない
// （プレイ履歴にだけ、それぞれ専用のmodeIdで記録する）。
let currentRunSource = "normal";
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

// 【2026-11-XX新設・本人指示：最優先1・正解発表の音源ON/OFF】答え合わせ楽曲を止める
// setTimeoutの予約ID・「次へ」ボタンを解禁するsetTimeoutの予約ID。js/onlineLyricsQuizBattleScreen.js
// のstartRevealMusic()と同じ「setTimeoutで止める・stopAudio()で確実に止める」の二重構造。
let revealAudioStopTimeoutId = null;
let revealAudioNextEnableTimeoutId = null;
// 答え合わせで曲を鳴らす場合の再生秒数・「次へ」ボタンを解禁するまでの誤タップ防止時間。
const REVEAL_AUDIO_DURATION_SEC = 7;
const REVEAL_AUDIO_NEXT_BUTTON_DELAY_MS = 500;

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

  // 【2026-10-01追加・本人指示：実機テストで発覚、出題数・カテゴリ・回答候補数の
  // ラジオボタンが無音だった】既存のオンライン対戦側と同じ、変更のたびにUI_CLICK効果音を
  // 鳴らす操作音を追加する（カテゴリは元々change時の処理自体が無かったため、リスナーごと追加）。
  document
    .querySelectorAll(
      'input[name="lyrics-quiz-question-count"], input[name="lyrics-quiz-category-filter"], input[name="lyrics-quiz-answer-pool-size"]'
    )
    .forEach((input) => input.addEventListener("change", () => playSfx(SFX_EVENTS.UI_CLICK)));

  initRevealAudioToggle(
    'input[name="lyrics-quiz-reveal-audio"]',
    getLyricsQuizRevealAudioEnabled,
    setLyricsQuizRevealAudioEnabled,
    () => playSfx(SFX_EVENTS.UI_CLICK)
  );
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
  currentRunSource = "normal";
  await buildAndStartRun(settings);
}

// 直前と同じ設定のまま、問題を再抽選して開始する（「もう一度挑戦する」用）。
// 出題数不足等で開始できない事態は、直前に一度成立した設定を再利用するだけなので
// 現在（直近に開始した）回が、「通常の入り口」以外（苦手曲モードBの練習・オリジナル問題
// 作成モードの歌詞クイズタイプ）から始まったかどうか。js/main.js側が「戻る」ボタンの
// 文言・戻り先画面をどちらにするか判断するために使う（2026-08-29追加・改訂）。
export function isLyricsQuizPracticeRun() {
  return currentRunSource !== "normal";
}

// 【2026-10-01追加・本人指示：実機で発覚、オリジナル問題作成モードから歌詞クイズを
// 始めたのに「苦手曲モードへ戻る」と表示され実際に苦手曲モードへ遷移するバグの修正】
// isLyricsQuizPracticeRun()は"weakSongPractice"と"customQuiz"を区別せず1つにまとめて
// いたため、js/main.js側の戻るボタン・戻り先判定が常に苦手曲モード扱いになっていた。
// js/instantChallengeScreen.jsのisInstantChallengeWeakSongsPractice()・
// isInstantChallengeFromCustomPreset()と同じパターンで、起点ごとに個別の判定関数を
// 用意する（既存のcurrentRunSource自体は変更しない、読み取り方だけを増やす）。
export function isLyricsQuizWeakSongsPractice() {
  return currentRunSource === "weakSongPractice";
}

export function isLyricsQuizFromCustomPreset() {
  return currentRunSource === "customQuiz";
}

// 直前と同じ設定のまま、問題を再抽選して開始する（「もう一度挑戦する」用）。
// 出題数不足等で開始できない事態は、直前に一度成立した設定を再利用するだけなので
// 通常は起こらないが、念のため同じ検証を通してから開始する。
// 【2026-08-29改訂】currentRunSourceは直前の回のままにする（通常プレイのリトライは
// 通常のまま、苦手曲モードBの練習・オリジナル問題作成モードのリトライもそれぞれ同じ種類のまま）。
export async function retryLyricsQuizRun() {
  if (!currentSettings) return;
  await buildAndStartRun(currentSettings);
}

// 【2026-08-29新設、2026-08-29改訂・本人指示】苦手曲モードB（歌詞クイズ版）・オリジナル問題
// 作成モードの歌詞クイズタイプから、カテゴリー絞り込みではなく「曲IDを直接指定して」出題を
// 開始する。曲プールの決め方以外（問題の組み立て・進行・結果画面）は通常の歌詞クイズと
// 完全に同じ仕組みをそのまま再利用する（本人指示：「既存の歌詞クイズの出題・進行エンジンを
// できる限り再利用してください」）。
// questionCountValueは常に"all"（渡された曲IDすべて）にする。呼び出し側
// （js/weakSongsScreen.js・オリジナル問題作成モードの選曲画面）で「実際に出題する曲」を
// すでに絞り込み済みのため、ここでさらに絞り込む必要はない。
// sourceは"weakSongPractice"（苦手曲モードB）または"customQuiz"（オリジナル問題作成モード）。
// 戻り値：実際に開始できたかどうか（呼び出し側が、開始できなかった場合に案内を出せる
// ようにするため。この画面自身のstartErrorはここでは表示されない別画面からの呼び出しのため）。
// distractorMode（2026-10-01追加・本人指示：正解プールと不正解候補プールの分離）：
// 省略時（苦手曲モードBの練習）は今までどおり曲IDそのものが回答候補の母集団にもなる。
// オリジナル問題作成モードの歌詞クイズタイプから渡された場合は、選んだ曲（正解の出題対象）
// とは別に、このカテゴリー全体（表題曲のみ/表題曲＋全員曲/全曲）を回答候補の母集団にする
// （js/main.jsのbeginCustomQuiz()等、他のオリジナル問題作成タイプと同じ設計）。
export async function startManualSelectionLyricsQuizRun(songIds, answerPoolSizeValue, source, distractorMode = null) {
  currentRunSource = source;
  return buildAndStartRun({
    questionCountValue: "all",
    categoryFilterValue: "all",
    answerPoolSizeValue,
    manualSongIds: songIds,
    distractorMode,
  });
}

// 出題数不足チェック→問題セットの組み立て→実行中状態のリセット、までを行う共通処理。
// 開始できた場合はelements.onStart()を呼ぶ（開始できなければ何も呼ばない）。戻り値は
// 実際に開始できたかどうか。
// settings.manualSongIdsがあれば（苦手曲モードBの練習）曲IDを直接プールにし、無ければ
// （通常の入り口）今までどおりカテゴリー絞り込みでプールを決める。
async function buildAndStartRun(settings) {
  elements.startError.hidden = true;

  // 【2026-08-08修正】resolveSongPool()ではなく、歌詞クイズ対象外の曲
  // （Overture等、ボーカルの無い曲）を除いたresolveLyricsQuizSongPool()を使う。
  const songPool = resolveLyricsQuizSongPool(
    settings.manualSongIds
      ? { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: settings.manualSongIds }
      : { type: QUESTION_SOURCE_TYPE.CATEGORY, categoryFilterValue: settings.categoryFilterValue }
  );
  const songsWithLyrics = await loadSongsWithLyrics(songPool);
  const availability = validateLyricsQuizAvailability(songsWithLyrics, settings.questionCountValue);

  if (!availability.ok) {
    elements.startError.hidden = false;
    elements.startError.textContent = availability.reason;
    logInsufficientSongsForDebug(songPool, songsWithLyrics);
    return false;
  }

  // 【2026-10-01新設・本人指示：正解プールと不正解候補プールの分離】オリジナル問題作成
  // モードの歌詞クイズタイプ（settings.distractorModeが渡された場合）だけ、回答候補
  // （ダミー選択肢）の母集団を「選んだ曲だけ」ではなく「指定カテゴリー全体」にする
  // （js/main.jsのbeginCustomQuiz()等、他のオリジナル問題作成タイプと同じ設計）。
  // 苦手曲モードBの練習・通常の入り口（distractorModeを渡さない）は今までどおり
  // songPool自身が回答候補の母集団になる。
  const distractorSongPool = settings.distractorMode
    ? filterSongsByCategory(SONGS, settings.distractorMode)
        .filter(isLyricsQuizEligibleSong)
        .map((song) => song.id)
    : songPool;

  const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
  currentSettings = settings;
  const questions = buildLyricsQuizQuestions({
    songsWithLyrics,
    songPool,
    distractorSongPool,
    questionCountValue: settings.questionCountValue,
    answerPoolSizeValue: settings.answerPoolSizeValue,
    seed,
  });
  runState = createLyricsQuizRunState(questions);
  runStartedAt = Date.now();

  elements.onStart();
  return true;
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
//   backButton, quitConfirmModal, quitCancelButton, quitRestartButton, quitConfirmButton,
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
    // 検索を始めたら50音ジャンプの選択行はいったん解除する（js/onlineLyricsQuizBattleScreen.js・
    // js/instantChallengeScreen.jsと同じ、検索を優先する既存の設計）。
    answerBrowseState.searchQuery = questionElements.answerSearchInput.value;
    answerBrowseState.jumpRowKey = null;
    renderAnswerButtons(getCurrentQuestion(runState).answerPool);
  });

  questionElements.backButton.addEventListener("click", openLyricsQuizQuitConfirmModal);
  questionElements.quitCancelButton.addEventListener("click", closeLyricsQuizQuitConfirmModal);
  // 【2026-08-29追加、本人指示（追加5）】「やり直す」：今回と同じ設定（currentSettings、
  // 苦手曲モードBの練習中ならcurrentRunSourceも維持）のまま、最初から再抽選して始め直す。
  if (questionElements.quitRestartButton) {
    questionElements.quitRestartButton.addEventListener("click", () => {
      closeLyricsQuizQuitConfirmModal();
      restartLyricsQuizRun();
    });
  }
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

// 「やり直す」（2026-08-29追加、本人指示の追加5）：quitLyricsQuizRun()と全く同じ後片付け
// （タイマー停止・保留中のタイムアウト解除・検索欄クリア・正解確認カードを隠す）を行うが、
// onQuit()で画面を離れる代わりに、同じ設定（currentSettings）でretryLyricsQuizRun()を呼び、
// その場で新しい問題セットを開始する。currentRunSourceは変えないため、苦手曲モードBの
// 練習中に「やり直す」を押しても、通常プレイ用の統計へ誤って書き戻されることはない。
async function restartLyricsQuizRun() {
  stopElapsedTimer();
  clearPendingAnswerFeedbackTimeout();
  questionElements.answerSearchInput.value = "";
  hideAnswerReveal();
  viewingHintLevel = 1;
  hasAnsweredCurrentQuestion = false;

  await retryLyricsQuizRun();
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
// 【2026-10-01改訂】新方式ではhints[i]自体が既に独立した1行のため、「そのレベルで
// 新しく増えた行」は常にそのレベル自身のstartLineになる（差分計算が不要になった）。
function computeAddedLineForLevel(hints, hintLevel) {
  return hints[hintLevel - 1].startLine;
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

// 新しく表示された行が画面外にある場合、そこまで自動スクロールする。
// prefers-reduced-motionが有効な環境ではアニメーションさせない。
function scrollHintElementIntoView(element) {
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  element.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion ? "auto" : "smooth" });
}

// これまでに公開したヒントの行を、歌詞の登場順（上から下）に、それぞれ
// 「ヒント1」「ヒント2」のようなラベル付きで表示する。過去に表示した行は消さない
// （本人からの指摘：以前は段階が進むと別の区間へ切り替わり、前のヒントが消えて
// 「情報が減った」ように見えることがあったため、常に積み上げ表示にする）。
// viewingHintLevelまでの行を表示する（到達済みの段階なら、過去の段階へ戻って
// その時点までの表示に戻すこともできる。詳しくはhandleHintLevelNavClick()参照）。
//
// newlyRevealedLevel: 「次のヒントを見る」で今まさに新しく開放した段階（本人指示：
// 新しく追加されたヒントだけ軽くフェードインさせる）。段階ボタンで過去を振り返っている
// だけのとき（handleHintLevelNavClick経由）はnullを渡し、フェードインさせない。
function renderHintList(question, newlyRevealedLevel = null) {
  const revealed = computeRevealedHintLines(question.hints, viewingHintLevel);
  questionElements.hintList.innerHTML = "";

  let currentElement = null;
  let newlyRevealedElement = null;
  revealed.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "lyrics-quiz-hint-line";

    const badge = document.createElement("span");
    badge.className = "lyrics-quiz-hint-line-badge";
    badge.textContent = `ヒント${entry.level}`;
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
    if (entry.level === newlyRevealedLevel) {
      item.classList.add("is-newly-revealed");
      newlyRevealedElement = item;
    }
  });

  // 新しく開放したヒントがあれば、そのヒントが見える位置まで自動スクロールする
  // （ヒント領域内だけ。回答候補一覧のスクロール位置は触らない）。無ければ今見ている
  // 段階（currentElement）を優先する。
  const scrollTarget = newlyRevealedElement ?? currentElement;
  if (scrollTarget) scrollHintElementIntoView(scrollTarget);
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

function renderHint(question, newlyRevealedLevel = null) {
  const viewedHint = question.hints[viewingHintLevel - 1];
  logHintDebugInfo(question, viewedHint);

  questionElements.hintLevelLabel.textContent = `ヒント ${viewingHintLevel} / ${question.hints.length}`;
  renderHintList(question, newlyRevealedLevel);
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
  renderHint(question, runState.currentHintCount);
}

function renderAnswerArea(question) {
  const pool = question.answerPool;
  const isLargePool = pool.length >= LARGE_ANSWER_POOL_THRESHOLD;

  // 【2026-11-XX新設・本人指示：問題ごとに検索・50音ジャンプ状態を完全リセット】
  // js/instantChallengeScreen.jsのrenderAnswerArea()と同じ理由。
  resetAnswerPoolBrowseState(answerBrowseState);
  questionElements.answerSearchRow.hidden = !isLargePool;
  if (isLargePool) {
    questionElements.answerSearchInput.value = "";
    questionElements.answerCount.textContent = `${pool.length}曲`;
  }
  if (questionElements.answerJumpBar) {
    questionElements.answerJumpBar.hidden = !isLargePool;
    if (isLargePool) renderAnswerJumpBar(questionElements.answerJumpBar, answerBrowseState, () => renderAnswerButtons(pool));
  }

  renderAnswerButtons(pool);
}

function renderAnswerButtons(pool) {
  const filtered = filterAnswerPool(pool, answerBrowseState);

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
// isCorrect（2026-11-XX追加）：正解発表の音源ONのときは、正解時もこのカードを使うため、
// 赤（不正解）／控えめ（わからない）／ピンク（正解）を出し分けられるようにした。
function showAnswerReveal(question, statusText, isCorrect = false) {
  questionElements.answerSection.hidden = true;
  questionElements.skipButton.hidden = true;

  questionElements.answerRevealStatus.textContent = statusText;
  questionElements.answerRevealStatus.classList.toggle("is-correct-answer-reveal-status", isCorrect);
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
  questionElements.answerRevealStatus.classList.remove("is-correct-answer-reveal-status");
  stopAnswerRevealAudio();
}

// 【2026-11-XX新設・本人指示：最優先1・正解発表の音源ON/OFF】答え合わせ楽曲の再生・
// 後片付けをまとめて行う。js/onlineLyricsQuizBattleScreen.jsのstartRevealMusic()と同じ
// 「setTimeoutで止める・stopAudio()で確実に止める」の二重構造を踏襲している。
function stopAnswerRevealAudio() {
  if (revealAudioStopTimeoutId !== null) {
    clearTimeout(revealAudioStopTimeoutId);
    revealAudioStopTimeoutId = null;
  }
  if (revealAudioNextEnableTimeoutId !== null) {
    clearTimeout(revealAudioNextEnableTimeoutId);
    revealAudioNextEnableTimeoutId = null;
  }
  stopAudio();
}

// 回答確定時点で最後に見ていたヒント段階（viewingHintLevel）の歌詞開始位置から
// REVEAL_AUDIO_DURATION_SEC秒だけ答え合わせ楽曲を再生する（本人指示：「回答時点の最後に
// 開いたヒント位置から7秒」。オンライン対戦のstartRevealMusic()と同じ考え方）。
// 曲の残りがREVEAL_AUDIO_DURATION_SEC秒に満たない場合は、playSongFromRandomPosition()
// 自身の自然終了（音源が尽きて止まる）に任せる＝「残り時間だけ再生」を追加のロジック無しで
// 実現できる（js/onlineLyricsQuizBattleScreen.jsのplaySongIntroFromOffset()と同じ設計）。
function playAnswerRevealAudio(question) {
  const byLevel = question.revealStartTimeSecByHintLevel ?? {};
  const startTimeSec = byLevel[viewingHintLevel] ?? question.revealStartTimeSec ?? 0;
  playSongFromRandomPosition(
    question.song,
    (actualDurationSec) => Math.min(Math.max(startTimeSec, 0), Math.max(actualDurationSec - 0.5, 0)),
    REVEAL_AUDIO_DURATION_SEC,
    (message) =>
      console.warn(
        "[歌詞クイズ] 答え合わせ楽曲の再生に失敗しました（演出のみのため進行には影響しません）",
        message
      ),
    () => {},
    () => {}
  );
  revealAudioStopTimeoutId = setTimeout(() => {
    revealAudioStopTimeoutId = null;
    stopAudio();
  }, REVEAL_AUDIO_DURATION_SEC * 1000);
}

// 正解確認カードを表示したうえで、答え合わせ楽曲を再生し、「次へ」ボタンを短い誤タップ防止
// 時間（REVEAL_AUDIO_NEXT_BUTTON_DELAY_MS）だけ待ってから解禁する。7秒経つ前でも「次へ」を
// 押せば即座に次の問題へ進める（本人指示：「7秒を待たず次問へ進めるようにしてください」）。
// 7秒経っても押されなければ自動的に次へ進む（放置しても止まらない）。
function showAnswerRevealWithAudio(question, statusText, isCorrect) {
  showAnswerReveal(question, statusText, isCorrect);
  questionElements.answerRevealNextButton.disabled = true;
  playAnswerRevealAudio(question);

  revealAudioNextEnableTimeoutId = setTimeout(() => {
    revealAudioNextEnableTimeoutId = null;
    questionElements.answerRevealNextButton.disabled = false;
  }, REVEAL_AUDIO_NEXT_BUTTON_DELAY_MS);

  clearPendingAnswerFeedbackTimeout();
  pendingAnswerFeedbackTimeoutId = setTimeout(() => {
    pendingAnswerFeedbackTimeoutId = null;
    if (questionElements.answerRevealNextButton.disabled) return; // 誤タップ防止時間中なら少し待つ
    handleAnswerRevealNextButtonClick();
  }, REVEAL_AUDIO_DURATION_SEC * 1000);
}

// 1問分の回答が確定した直後に必ず呼ぶ、進行方法の振り分け（本人指示・2026-11-XX新設：
// 正解発表の音源設定に応じて、答え合わせカードを出すかどうか・自動進行までの待ち時間が
// 変わる）。
// ・音源ON：正解／不正解／わからないの区別なく、必ず答え合わせカードを出し、答え合わせ
//   楽曲を再生する（本人指示：「回答前には絶対に鳴らさない」＝答えが確定したこの時点で
//   初めて再生を始める）。
// ・音源OFF：これまでどおりの挙動を一切変えない（本人指示：「今までどおり余計な待ち時間を
//   入れずに進行」）。4択の正解／不正解は自動進行のまま、それ以外（正解が画面外になりうる
//   回答方式での不正解・わからない）だけ答え合わせカードを出す。
function presentAnswerOutcome(question, statusText, isCorrect, showsCardWhenAudioOff) {
  if (getLyricsQuizRevealAudioEnabled()) {
    showAnswerRevealWithAudio(question, statusText, isCorrect);
    return;
  }
  if (showsCardWhenAudioOff) {
    showAnswerReveal(question, statusText, isCorrect);
    return;
  }
  scheduleAnswerFeedbackAdvance();
}

// 正解確認カードの「次の問題へ」ボタン。本人指示：「何度押しても次の問題が
// 二重に開始されないようにする」ため、クリック直後に即座に無効化する。
function handleAnswerRevealNextButtonClick() {
  if (questionElements.answerRevealNextButton.disabled) return;
  questionElements.answerRevealNextButton.disabled = true;
  clearPendingAnswerFeedbackTimeout();
  stopAnswerRevealAudio();
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
  // 【2026-08-29追加】通常の入り口から始まった回だけ、歌詞クイズ版の苦手曲統計へ記録する
  // （苦手曲モードBの練習中はcurrentRunSourceが"weakSongPractice"になり記録しない。
  // js/weakSongStats.jsが既存4モードの「苦手曲モード自身は対象外」としているのと同じ考え方）。
  if (currentRunSource === "normal") {
    recordLyricsQuizWeakSongAttempt(question.song.id, isCorrect);
  }

  buttonElement.classList.add(isCorrect ? "is-correct" : "is-wrong");
  if (isCorrect) {
    playCorrectSound();
  } else {
    playWrongSound();
    revealCorrectAnswerButton(question);
  }

  questionElements.nextHintButton.disabled = true;
  disableAllAnswerButtons();

  // 正解発表の音源がONなら、正解／不正解を問わず必ず答え合わせカード＋楽曲再生を経由する
  // （presentAnswerOutcome参照）。OFFなら今までどおりの挙動（正解時は今までどおり自動で
  // 次へ進む。不正解時は、4択だけ自動進行のまま、それ以外は正解確認カードで自動進行を止める）。
  presentAnswerOutcome(question, isCorrect ? "正解！" : "不正解", isCorrect, !isCorrect && isWideAnswerMode());
}

function handleSkipButtonClick() {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = getCurrentQuestion(runState);
  const elapsedMs = Date.now() - questionStartedAt;
  runState = recordAnswerAndAdvance(runState, LYRICS_QUIZ_ANSWER_OUTCOME.SKIPPED, elapsedMs);
  // 【2026-08-29追加】スキップも「間違えた」扱いでattemptsだけ積む（js/state.jsのrecordAnswer()が
  // resultType==="skip"を不正解扱いにしているのと同じ考え方）。対象・除外の条件は
  // handleAnswerSelected()と同じ。
  if (currentRunSource === "normal") {
    recordLyricsQuizWeakSongAttempt(question.song.id, false);
  }
  revealCorrectAnswerButton(question);

  questionElements.nextHintButton.disabled = true;
  disableAllAnswerButtons();

  presentAnswerOutcome(question, "スキップ", false, isWideAnswerMode());
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
// プレイ履歴に記録するmodeId・modeLabelを、currentRunSourceの種類ごとに対応づける表。
// "normal"はこの表を使わず、常に既存の"lyricsQuiz"のまま（js/playHistory.jsのHISTORY_MODE_DISPLAY
// に既にある値。変更しない）。
const PRACTICE_LIKE_PLAY_HISTORY_MODE = {
  weakSongPractice: { modeId: "weakSongsLyrics", modeLabel: "苦手曲モード（歌詞）" },
  customQuiz: { modeId: "customQuizLyrics", modeLabel: "オリジナル問題（歌詞）" },
};

// 【2026-08-29改訂、本人指示】苦手曲モードB（歌詞クイズ版）・オリジナル問題作成モードの
// 歌詞クイズタイプの練習・プレイは、既存の苦手曲モード・オリジナル問題作成モード
// （どちらもイントロ側、js/main.jsのgameState.playMode==="special"の扱い）と同じく、
// 自己ベスト・称号には反映せず、プレイ履歴にだけ記録する（判定に使う統計への書き戻しは
// 呼び出し元のhandleAnswerSelected/handleSkipButtonClickがcurrentRunSourceで既に制御済み）。
export function renderLyricsQuizResult() {
  const isPractice = currentRunSource !== "normal";
  const result = createLyricsQuizResult(runState.answers);
  const isNewRecord = isPractice
    ? false
    : saveLyricsQuizBestIfBetter(result, currentSettings.questionCountValue, currentSettings.answerPoolSizeValue);

  resultElements.correctCount.textContent = `${result.correctCount} / ${result.totalQuestions}問`;
  resultElements.missCount.textContent = `${result.missCount}問`;
  resultElements.totalHintsUsed.textContent = `${result.totalHintsUsed}回`;
  resultElements.averageHintsUsed.textContent = `${result.averageHintsUsed.toFixed(1)}回`;
  resultElements.firstHintCorrectCount.textContent = `${result.firstHintCorrectCount}問`;
  resultElements.totalElapsedTime.textContent = formatElapsed(result.totalElapsedMs);
  resultElements.newRecordBadge.hidden = !isNewRecord;

  const wrongCount = runState.answers.filter(
    (answer) => answer.outcome === LYRICS_QUIZ_ANSWER_OUTCOME.WRONG_ANSWER
  ).length;
  const skippedCount = runState.answers.filter(
    (answer) => answer.outcome === LYRICS_QUIZ_ANSWER_OUTCOME.SKIPPED
  ).length;

  if (isPractice) {
    // 苦手曲モードBの練習中は称号判定を行わない（既存の苦手曲モードAと同じ方針）。
    clearAchievementUnlockEvents({
      chipContainer: resultElements.achievementChipContainer,
      achievementListLinkElement: resultElements.achievementListLink,
    });
  } else {
    // 称号（実績）判定（2026-08-07追加、本人指示）。歌マスター・リリックマスターの条件には
    // 時間もヒント合計も関係しないため、averageResponseMsは渡さない（null＝判定に使われない）。
    // maxHintLevelByQuestionは、各問題のhintsUsedCount（＝到達した最大ヒント段階、
    // js/lyricsQuizRunState.js参照）をそのまま使う。
    const achievementResult = evaluateAndSaveAchievements({
      modeId: "lyricsQuiz",
      questionCountValue: currentSettings.questionCountValue,
      categoryFilterValue: currentSettings.categoryFilterValue,
      correctCount: result.correctCount,
      wrongCount,
      skippedCount,
      completed: true,
      averageResponseMs: null,
      maxHintLevelByQuestion: runState.answers.map((answer) => answer.hintsUsedCount),
      answerPoolSizeValue: currentSettings.answerPoolSizeValue,
    });
    renderAchievementUnlockEvents(achievementResult.newlyUnlockedIds, {
      chipContainer: resultElements.achievementChipContainer,
      achievementListLinkElement: resultElements.achievementListLink,
    });
  }

  // 【2026-08-08新設】統一プレイ履歴（js/playHistory.js）への保存。自己ベスト・称号とは
  // 別の保存先のため、この保存に失敗しても上の自己ベスト保存・称号判定には一切影響しない。
  // 【2026-08-29改訂】練習・オリジナル問題作成モードは、既存のweakSongs・customQuiz
  // （どちらもイントロ側）と同じ考え方で専用のmodeIdで記録し、通常の歌詞クイズの記録とは
  // 見分けられるようにする。
  const practiceLikeMode = PRACTICE_LIKE_PLAY_HISTORY_MODE[currentRunSource];
  savePlayHistoryEntry({
    playedAt: Date.now(),
    modeId: isPractice ? (practiceLikeMode?.modeId ?? currentRunSource) : "lyricsQuiz",
    modeLabel: isPractice ? (practiceLikeMode?.modeLabel ?? "歌詞クイズ（その他）") : "歌詞クイズ",
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
