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
import {
  createAnswerPoolBrowseState,
  resetAnswerPoolBrowseState,
  filterAnswerPool,
  renderAnswerJumpBar,
} from "./answerPoolBrowseUi.js";
import { playSongFromRandomPosition, stopAudio } from "./audio.js";
import { recordInstantChallengeWeakSongAttempt } from "./instantChallengeWeakSongStats.js";
import { recordInstantChallengeClear } from "./instantChallengeClearStore.js";
import { savePlayHistoryEntry } from "./playHistory.js";
import { evaluateInstantChallengeAchievements } from "./achievementEvaluation.js";
import { saveEarnedAchievements } from "./achievementProgress.js";
import { renderAchievementUnlockEvents } from "./achievementDisplay.js";
import { renderPlayerSummary } from "./playerScreen.js";
import { runLocalReplayCountdownForQuestion, cancelLocalReplayCountdown } from "./localReplayCountdown.js";
import { promptAnswerConfirm } from "./answerConfirmPrompt.js";

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
// 【2026-09-07新設・本人指示：50音UIの共通展開】全曲検索プールのときの検索文字列・
// 50音ジャンプの状態（js/answerPoolBrowseUi.js参照）。新しい問題に切り替わるたび
// resetAnswerPoolBrowseState()でリセットする。
const answerBrowseState = createAnswerPoolBrowseState();
// 【2026-09-07新設・本人指示：カウントダウン速度の統一】画面遷移直後（#screenEnterの
// 480msアニメーション中）に1問目のカウントダウンを重ねて始めると、アニメーションと
// 競合して1問目だけ遅く・カクついて見える（2問目以降は既にアクティブな画面内で
// カウントダウンだけが動くため、この競合が起きない）。1問目の開始だけ、画面遷移の
// アニメーションが終わるのを待ってからカウントダウンを始めることで体感速度を揃える。
let isFirstQuestionOfRun = true;
// 【2026-08-30追加・本人指示：苦手曲5系統完全分離／オリジナル問題作成モード一瞬対応】
// 通常の（カテゴリー絞り込みからの）一瞬チャレンジ以外の入り口から開始した回かどうか。
//   null                 : 通常の一瞬チャレンジ（#instant-challenge-setup-screen経由）
//   "weakSongsInstant"   : 苦手曲モード「一瞬」タブから開始
//   "customQuizInstant"  : オリジナル問題作成モード・一瞬チャレンジタイプから開始
// 苦手曲モード・オリジナル問題作成モードどちらも「練習結果を判定へ書き戻さない」方針
// （js/weakSongsScreen.js・他のオリジナル問題作成タイプと同じ）のため、null以外の間は
// recordInstantChallengeWeakSongAttempt・称号判定・クリア記録を呼ばない。
// プレイ履歴（js/playHistory.js）には他モードと同じく通常どおり記録する
// （modeId・modeLabelをこの値に応じて出し分ける）。
let practiceModeId = null;

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
  practiceModeId = null;
  currentExplicitSongIds = null;
  await buildAndStartRun(settings);
}

export async function retryInstantChallengeRun() {
  if (!currentSettings) return;
  // practiceModeId・currentExplicitSongIdsは前回開始時の値のまま維持する
  // （「もう一度挑戦する」で練習/通常の種別・出題対象曲が変わることはないため）。
  await buildAndStartRun(currentSettings, currentExplicitSongIds);
}

// 苦手曲モード「一瞬」タブからの開始（2026-08-30新設、本人指示：苦手曲5系統完全分離）。
// カテゴリー絞り込みではなく、あらかじめ渡された曲IDだけを出題プールにする点だけが
// 通常の開始（handleStartButtonClick）と違う。設定画面のUIはjs/weakSongsScreen.js側の
// 専用fieldset（再生時間・回答方式・出題数）を使うため、このファイルの設定画面
// （#instant-challenge-setup-screen）は経由しない。
export async function startInstantChallengeWeakSongsPractice(songIds, settings) {
  practiceModeId = "weakSongsInstant";
  return buildAndStartRun({ ...settings, categoryFilterValue: "weakSongs" }, songIds);
}

// オリジナル問題作成モード・一瞬チャレンジタイプからの開始（2026-08-30新設、本人指示：後半②）。
// 上のstartInstantChallengeWeakSongsPractice()と同じ理由・同じ仕組みで、あらかじめ選んだ曲
// （songIds）だけを出題プールにする。出題数は他のオリジナル問題作成タイプと同じく
// 「選んだ曲すべて」にするため、questionCountValueは常に"all"を使う。
export async function startInstantChallengeFromCustomPreset(songIds, settings) {
  practiceModeId = "customQuizInstant";
  return buildAndStartRun({ ...settings, questionCountValue: "all", categoryFilterValue: "customQuiz" }, songIds);
}

// 今表示中の問題・結果が、苦手曲モード「一瞬」タブからの練習かどうか。main.js側で
// 「戻る」「設定へ戻る」「ホームへ戻る」の遷移先を、通常の一瞬チャレンジ設定画面ではなく
// 苦手曲モード画面へ切り替えるために使う。
export function isInstantChallengeWeakSongsPractice() {
  return practiceModeId === "weakSongsInstant";
}

// 今表示中の問題・結果が、オリジナル問題作成モードからの開始かどうか。main.js側で
// 「戻る」「設定へ戻る」「ホームへ戻る」の遷移先をプリセット一覧画面へ切り替えるために使う。
export function isInstantChallengeFromCustomPreset() {
  return practiceModeId === "customQuizInstant";
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
  isFirstQuestionOfRun = true;

  elements.onStart();
  return true;
}

// ===== 2. 問題画面 =====

// questionElements: {
//   progress, answerSearchRow, answerSearchInput, answerCount, answerList,
//   countdown, countdownNumber, audioError, replayButton, nextButton,
//   backButton, quitConfirmModal, quitCancelButton, quitRestartButton, quitConfirmButton,
//   onQuit,
// }
export function initInstantChallengeQuestionScreen(newElements) {
  questionElements = newElements;
  questionElements.answerSearchInput.addEventListener("input", () => {
    // 検索を始めたら50音ジャンプの選択行はいったん解除する（検索語のほうを優先して見せる。
    // js/onlineLyricsQuizBattleScreen.jsの既存の考え方と同じ）。
    answerBrowseState.searchQuery = questionElements.answerSearchInput.value;
    answerBrowseState.jumpRowKey = null;
    renderAnswerButtons(questions[currentIndex].answerPool);
  });

  // 【2026-08-30追加・本人指示⑨】「もう一度聞く」：ソロプレイでは回数無制限。
  // 回答後（hasAnsweredCurrentQuestion===true）は正解が確定済みのため押せないようにする。
  questionElements.replayButton.addEventListener("click", () => {
    if (hasAnsweredCurrentQuestion) return;
    replayCounts[currentIndex] += 1;
    playCurrentQuestionAudio();
  });

  // 【2026-09-07改訂・本人指示：答え合わせ4秒後に自動遷移が正式仕様】このボタンは
  // 「4秒待たずに今すぐ進みたい」ときのショートカット。押した時点で保留中の自動遷移
  // タイマーを止めてから即座に進める（タイマーを消し忘れると、既に次の問題・結果画面に
  // 進んだ後で古いタイマーがもう一度advanceToNextQuestionOrFinish()を呼んでしまい、
  // 最終問ではrenderInstantChallengeResult()の記録処理が二重に走る事故になるため）。
  questionElements.nextButton.addEventListener("click", () => {
    clearTimeout(autoAdvanceTimerId);
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
  cancelLocalReplayCountdown();
  clearTimeout(autoAdvanceTimerId);
  questionElements.answerSearchInput.value = "";
  questions = [];
  currentIndex = 0;
  answers = [];
  replayCounts = [];
  questionElements.onQuit();
}

async function restartRun() {
  stopAudio();
  cancelLocalReplayCountdown();
  clearTimeout(autoAdvanceTimerId);
  questionElements.answerSearchInput.value = "";
  await retryInstantChallengeRun();
}

// 問題画面を開くたびに呼ぶ（main.js側でshowScreen()の直後に呼ぶ想定）。
export function startInstantChallengePlay() {
  renderCurrentQuestion();
}

// 【2026-09-06修正・本人指摘：実機フィードバック】以前はconsole.warn()のみで、実際に
// 音源再生が失敗しても画面には何も表示されなかった（一度しか再現しなくても見逃さない
// ようにするため、他のクイズ画面と同じ#audio-error相当の表示パターンに揃えた）。
function showAudioErrorInline(message) {
  console.warn("[一瞬チャレンジ]", message);
  if (!questionElements.audioError) return;
  questionElements.audioError.textContent = message;
  questionElements.audioError.hidden = false;
}

function hideAudioErrorInline() {
  if (!questionElements.audioError) return;
  questionElements.audioError.hidden = true;
}

// 現在の問題の音源を、決まった再生位置・再生時間で再生する。初回再生・「もう一度聞く」の
// どちらからも同じ位置（questionIndexが同じ＝同じseedから同じ乱数が出る）が再生される。
function playCurrentQuestionAudio() {
  hideAudioErrorInline();
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
  if (questionElements.answerReveal) questionElements.answerReveal.hidden = true;
  clearTimeout(autoAdvanceTimerId);
  renderAnswerArea(questions[currentIndex]);

  questionElements.replayButton.hidden = false;
  questionElements.replayButton.disabled = false;
  questionElements.nextButton.hidden = true;

  // 【2026-09-05新設、本人指示】初回出題の直前だけ3→2→1を表示する。聞き直し
  // （questionElements.replayButtonのクリック）は無制限で気軽に使えるままにしたいため、
  // そちらにはカウントダウンを挟まない（playCurrentQuestionAudio()を直接呼ぶ）。
  // 【2026-09-08改訂・本人指示：カウントダウン速度の完全統一】この問題セットの最初の問題だけ
  // 画面遷移アニメーションと重ならないよう待つロジックは、js/onlineInstantBattleScreen.jsと
  // 完全に共有するjs/localReplayCountdown.jsのrunLocalReplayCountdownForQuestion()へ
  // 一本化した（値・ロジックの複製をやめる）。
  if (questionElements.countdown && questionElements.countdownNumber) {
    runLocalReplayCountdownForQuestion(
      { containerElement: questionElements.countdown, numberElement: questionElements.countdownNumber, isFirstQuestion: isFirstQuestionOfRun },
      playCurrentQuestionAudio
    );
    isFirstQuestionOfRun = false;
  } else {
    playCurrentQuestionAudio();
  }
}

function renderAnswerArea(question) {
  const pool = question.answerPool;
  const isLargePool = pool.length >= LARGE_ANSWER_POOL_THRESHOLD;
  // 【2026-09-07新設・本人指示：検索状態を毎問題完全リセット】検索文字列・50音ジャンプの
  // 選択行を、新しい問題に切り替わるたび必ず初期状態へ戻す。
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
  // 選択肢一覧のスクロール位置も、新しい問題ごとに先頭へ戻す。
  questionElements.answerList.scrollTop = 0;
  questionElements.answerList.hidden = false;
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
    // 【2026-09-06新設、本人指示：実機フィードバック②】回答速度が勝敗に関係しないモード
    // のため、タップ即確定ではなく1回の確認を挟む（誤タップ対策）。
    // handleAnswerSelected()自身がhasAnsweredCurrentQuestionで二重回答を防いでいるため、
    // 確認画面が開いている間に既に別の回答が確定していても、ここで安全に弾かれる。
    button.addEventListener("click", () => {
      if (hasAnsweredCurrentQuestion) return;
      promptAnswerConfirm(song.title, () => handleAnswerSelected(song.id, button));
    });
    questionElements.answerList.appendChild(button);
  });
}


// 答え合わせカードを約4秒表示してから、自動的に次の問題（最終問なら結果画面）へ進む
// までの待ち時間。
// 【2026-09-07再改訂・本人指示：ChatGPTと確定した最新仕様】前回は「次の問題へ」ボタンを
// 手動で押す仕様（2026-08-30・本人指示⑧）との整合を優先し、カードを4秒間読んでから
// ボタンを押せるようにする形にしていたが、今回「4秒後に自動で次へ進む」ことを正式仕様として
// 確定する指示を受けたため、以前の「必ずボタンを押す」仕様をこの部分に限り上書きする
// （試合終了後の「もう一度」「ルーム設定に戻る」等は今までどおり自動選択しない）。
const AUTO_ADVANCE_DELAY_MS = 4000;
let autoAdvanceTimerId = null;

// 【2026-09-07改訂・本人指示：答え合わせUIの統一】色（is-correct/is-wrong）だけに頼らず、
// 選択肢一覧そのものを答え合わせカードへ切り替える（歌詞クイズ対戦と同じ設計）。
function handleAnswerSelected(selectedSongId, buttonElement) {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;

  const question = questions[currentIndex];
  const isCorrect = selectedSongId === question.song.id;
  answers.push({ songId: question.song.id, isCorrect, replayCount: replayCounts[currentIndex] });
  if (practiceModeId === null) {
    recordInstantChallengeWeakSongAttempt(question.song.id, isCorrect);
  }

  renderAnswerReveal({ isCorrect, correctTitle: question.song.title, mySelectedSongId: selectedSongId, pool: question.answerPool });

  questionElements.replayButton.disabled = true; // 正解が確定した後の聞き直しは不要
  // 【2026-09-07改訂】4秒経てば自動的に進むが、早く読み終えた人向けに、ボタンを押せば
  // 待たずに進めるようにしておく（本人指示の「4秒後に自動遷移」を基本にしつつ、
  // 待たされている感覚を減らすための補助。ゲームルール・結果には影響しない）。
  questionElements.nextButton.hidden = false;
  questionElements.nextButton.textContent = currentIndex + 1 >= questions.length ? "結果を見る" : "次の問題へ";
  clearTimeout(autoAdvanceTimerId);
  autoAdvanceTimerId = setTimeout(() => {
    advanceToNextQuestionOrFinish();
  }, AUTO_ADVANCE_DELAY_MS);
}

// 選択肢一覧を隠し、答え合わせカードへ切り替える（js/onlineLyricsQuizBattleScreen.jsの
// renderAnswerChoices()のisResolved分岐と同じ考え方）。このモードには「わからない」や
// 獲得ポイントの概念が無いため、正解／不正解の2パターンだけを扱う。
function renderAnswerReveal({ isCorrect, correctTitle, mySelectedSongId, pool }) {
  questionElements.answerList.hidden = true;
  if (questionElements.answerSearchRow) questionElements.answerSearchRow.hidden = true;
  if (!questionElements.answerReveal) return;

  questionElements.answerReveal.hidden = false;
  questionElements.answerRevealStatus.textContent = isCorrect ? "🎉 正解！" : "残念、不正解";
  questionElements.answerRevealStatus.classList.toggle("is-correct-answer-reveal-status", isCorrect);
  questionElements.answerRevealTitle.textContent = correctTitle;

  const mySong = pool.find((song) => song.id === mySelectedSongId);
  if (questionElements.answerRevealMyAnswer) {
    questionElements.answerRevealMyAnswer.hidden = !mySong;
    questionElements.answerRevealMyAnswer.textContent = mySong ? `あなたの回答：${mySong.title}` : "";
  }
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
  if (isCleared && practiceModeId === null) {
    recordInstantChallengeClear(currentSettings.playDurationValue, currentSettings.answerPoolSizeValue, String(answers.length), {
      noReplayUsed,
    });
  }

  // 【2026-08-30追加・本人指示⑦⑪】一瞬チャレンジ専用の称号判定（一瞬ビギナー〜マスター・
  // 即聞即答）。js/achievementEvaluation.jsのevaluateInstantChallengeAchievements()は
  // 「実際に出題された問題数」を条件キーとして受け取る（クリア記録と同じ理由）。
  const earnedAchievementIds = practiceModeId !== null
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
    modeId: practiceModeId ?? "instantChallenge",
    modeLabel:
      practiceModeId === "weakSongsInstant"
        ? "苦手曲モード（一瞬）"
        : practiceModeId === "customQuizInstant"
          ? "オリジナル問題（一瞬）"
          : "一瞬チャレンジ",
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
