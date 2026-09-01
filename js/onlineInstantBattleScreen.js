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
import { playSongFromRandomPosition, stopAudio, attemptSilentUnlock } from "./audio.js";
import { LARGE_ANSWER_POOL_THRESHOLD } from "./lyricsQuizEngine.js";
import {
  createAnswerPoolBrowseState,
  resetAnswerPoolBrowseState,
  filterAnswerPool,
  renderAnswerJumpBar,
} from "./answerPoolBrowseUi.js";
import { buildQuestions, createResult, MAX_REPLAY_COUNT_PER_QUESTION } from "./battleModes/instantBattleMode.js";
import { runLocalReplayCountdownForQuestion, cancelLocalReplayCountdown } from "./localReplayCountdown.js";
import { promptReturnToLobby } from "./onlineBattleLobbyReturnPrompt.js";
import { promptLeaveMatch } from "./onlineBattleLeaveMatchPrompt.js";
import { promptAnswerConfirm } from "./answerConfirmPrompt.js";
import { getCurrentUid } from "./firebaseClient.js";

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
// 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】このモードは各自が独立して
// 進行するため（他プレイヤーとの同期が不要）、js/instantChallengeScreen.jsと全く同じ
// 「その問題スロットの曲を、まだ使っていない予備曲へ安全に差し替える」設計をそのまま
// 適用する。questions配列自体はbuildQuestions({reserveCount})が出題数＋予備曲をまとめて
// 返す（isReserve:trueの末尾部分が予備）。targetQuestionCountだけが実際の「出題数」で、
// currentIndexは常にその範囲内（0〜targetQuestionCount-1）だけを動く
// （予備曲は既存のスロットへ差し替えるだけで、新しいインデックスとしては増えない）。
const AUDIO_FAILURE_RESERVE_SIZE = 3;
const MAX_SLOT_PLAYBACK_ATTEMPTS = 3;
let targetQuestionCount = 0;
let nextReserveIndex = 0;
let currentSlotFailureCount = 0;
// 【2026-09-07新設・本人指示：50音UIの共通展開】
const answerBrowseState = createAnswerPoolBrowseState();
let isCountdownActive = false; // 【2026-09-05新設】カウントダウン中の連打・二重再生を防ぐ
// 【2026-09-08改訂・本人指示：カウントダウン速度の完全統一】js/instantChallengeScreen.jsの
// isFirstQuestionOfRunと同じ理由・同じ仕組み。待ち時間の値・ロジック自体は
// js/localReplayCountdown.jsのrunLocalReplayCountdownForQuestion()へ一本化した。
let isFirstQuestionOfMatch = true;

// elements: {
//   progress, quitButton, quitConfirmModal, quitCancelButton, quitConfirmButton,
//   backToLobbyButton,
//   error, countdown, countdownNumber, replayButton, answerSearchRow, answerSearchInput,
//   answerCount, answerList,
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

  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  elements.backToLobbyButton?.addEventListener("click", () => {
    promptReturnToLobby(currentRoomId);
  });

  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】「対戦をやめる」
  // （quitConfirmButton・quitOnlineBattleDuringQuiz）と違い、ルームそのものからは
  // 離脱しない（leaveRoom()は呼ばない）。ローカルの再生・タイマー状態だけを
  // resetOnlineInstantBattleState()で片付け、ロビー画面へ戻す。
  elements.leaveMatchButton?.addEventListener("click", () => {
    const roomId = currentRoomId;
    const matchId = currentMatchId;
    if (!roomId || !matchId) return;
    promptLeaveMatch(roomId, matchId, () => {
      stopAudio();
      resetOnlineInstantBattleState();
      elements.navigateTo("onlineBattleLobby");
    });
  });

  elements.replayButton.addEventListener("click", () => {
    if (hasAnsweredCurrentQuestion) return;
    if (isCountdownActive) return; // 【2026-09-05新設】カウントダウン中の連打を無視する
    if (replayCounts[currentIndex] >= MAX_REPLAY_COUNT_PER_QUESTION) return;
    // 【2026-09-13追加・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】
    // 「もう一度聞く」は対戦中に得られる貴重な、本物のユーザー操作の直後（カウントダウン
    // 前）。ここでunlockを試みておくのが最も成功しやすいタイミングのため、真っ先に呼ぶ。
    attemptSilentUnlock();
    replayCounts[currentIndex] += 1;
    updateReplayButtonLabel();
    playCurrentQuestionAudioWithCountdown();
  });

  elements.answerSearchInput.addEventListener("input", () => {
    answerBrowseState.searchQuery = elements.answerSearchInput.value;
    answerBrowseState.jumpRowKey = null;
    renderAnswerButtons(questions[currentIndex].answerPool);
  });

}

// ルームを離れる・別のルームへ入り直す際に呼ぶ、状態の完全リセット。
export function resetOnlineInstantBattleState() {
  stopAudio();
  cancelLocalReplayCountdown();
  clearTimeout(autoAdvanceTimerId);
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
  isFirstQuestionOfMatch = true;
}

// js/onlineBattleScreen.jsのenterOnlineBattlePlay()から、gameMode==="instantBattle"のときに
// 呼ばれる入口（js/onlineLyricsQuizBattleScreen.jsのenterLyricsQuizBattlePlay()と同じ役割）。
// 【2026-09-09新設・本人指示：プレイ履歴の完成】js/onlineBattleScreen.jsが履歴保存時の
// questionCountとして使う。このモードは予備曲を含むquestions配列を内部に持つため、
// 実際の出題数（targetQuestionCount）を外から取得する手段が必要だった
// （js/onlineBattleScreen.jsのcurrentMatchTotalQuestionsは、このモードの入場処理では
// 一切更新されず、以前はプレイ履歴のquestionCountが不正確なまま保存されていた）。
export function getTargetQuestionCount() {
  return targetQuestionCount;
}

export function enterOnlineInstantBattlePlay(room) {
  currentRoomId = room.roomId;
  currentMatchId = room.activeMatchId;
  currentSettings = room.settings;
  currentSeed = room.seed;
  questions = buildQuestions({ seed: room.seed, settings: room.settings, reserveCount: AUDIO_FAILURE_RESERVE_SIZE });
  targetQuestionCount = questions.filter((question) => !question.isReserve).length;
  nextReserveIndex = targetQuestionCount;
  currentSlotFailureCount = 0;
  currentIndex = 0;
  answers = [];
  replayCounts = new Array(targetQuestionCount).fill(0);
  hasAnsweredCurrentQuestion = false;
  matchStartedAtMs = Date.now();
  isFirstQuestionOfMatch = true;

  elements.error.hidden = true;
  // 【2026-09-05新設、本人指示】このモードは各自が独立して進行するため、対戦中は
  // room更新を継続的に監視していない。ホスト判定は入場時点のroomでのみ行う
  // （対戦中にホストが交代する稀なケースでは反映されないが、許容する）。
  const isHostAtEntry = room.host === getCurrentUid();
  if (elements.backToLobbyButton) {
    elements.backToLobbyButton.hidden = !isHostAtEntry;
  }
  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】
  if (elements.leaveMatchButton) {
    elements.leaveMatchButton.hidden = isHostAtEntry;
  }
  elements.navigateTo("onlineInstantBattleQuestion");
  renderCurrentQuestion();
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
    // 【2026-09-09改訂・本人指示：音源再生失敗時の公平性対策】この曲固有のデータ不備の
    // 可能性があるため、他の再生失敗と同じ「安全に差し替える」経路へ合流させる。
    handlePlaybackFailure(questionIndex, "この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    return;
  }

  const computeStartTimeSec = (actualDurationSec) => {
    if (!isDurationMismatchWithinTolerance(fixedDurationSec, actualDurationSec)) {
      // 全端末で同じ開始位置になることが公平性の前提のため、差が大きすぎる場合は
      // 無言でクランプして続行せず、再生を中止する（randomPlaybackBattleMode.jsの
      // main.js側実装と同じ安全策）。この場合も「自分の端末のこの曲のファイルが
      // 他と違う」という再生失敗の一種として扱い、差し替え経路へ合流させる。
      stopAudio();
      handlePlaybackFailure(questionIndex, "この曲の音源が他の端末と異なる可能性があります。音源を入れ直してください。");
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

  playSongFromRandomPosition(
    question.song,
    computeStartTimeSec,
    playDurationSec,
    (message) => handlePlaybackFailure(questionIndex, message),
    hideAudioErrorInline,
    () => {}
  );
}

// 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】js/instantChallengeScreen.jsの
// handlePlaybackFailure()と同じ設計（このモードも各自が独立して進行するため、他プレイヤーと
// 同期する必要が無い）。「その問題を不正解にしない・ペナルティを与えない・問題数を
// 消費しない」を守るため、得点処理には一切触れず、この問題スロットの曲を安全に差し替えるか、
// それでも無理なら対戦を中断する。questionIndexは呼ばれた時点のcurrentIndexを固定で
// 受け取り、既に別の問題へ進んでいた場合の誤適用を防ぐ。
function handlePlaybackFailure(questionIndex, message) {
  if (questionIndex !== currentIndex) return;
  if (hasAnsweredCurrentQuestion) return;

  currentSlotFailureCount += 1;
  console.warn(`[一瞬バトル] 音源再生に失敗しました（${currentSlotFailureCount}回目）`, message);

  // 【2026-09-13修正・本人指示：初回問題消失バグの調査で判明した別件の修正】「全曲」設定等、
  // 曲プール全体を出題数として使っている場合、予備曲を1曲も確保できない
  // （questions.length === targetQuestionCount）。この場合は「予備切れ」の判定自体が
  // 成立しない（最初から無かっただけ）ため、中断の判断からは除外し、同じ曲のまま
  // MAX_SLOT_PLAYBACK_ATTEMPTS回まで再試行する（js/main.jsのhandleOnlineBattleAudioFailure()と
  // 同じ考え方）。
  const reserveWasEverAvailable = questions.length > targetQuestionCount;
  const reserveExhausted = reserveWasEverAvailable && nextReserveIndex >= questions.length;
  if (currentSlotFailureCount >= MAX_SLOT_PLAYBACK_ATTEMPTS || reserveExhausted) {
    abortMatchDueToAudioFailure();
    return;
  }

  // 【2026-09-13修正・本人指示3：音源差し替え成功時のユーザー向けメッセージを消す】
  // 差し替えが成功して問題を続行できるなら、プレイヤーには何も表示しない
  // （対戦を安全に継続できない場合＝上のabort分岐に到達した場合だけ案内を表示する）。
  if (nextReserveIndex < questions.length) {
    questions[currentIndex] = questions[nextReserveIndex];
    nextReserveIndex += 1;
    renderAnswerArea(questions[currentIndex]);
  }
  // 予備が無い場合（全曲設定等）は、questionsを差し替えずに同じ曲のまま再試行する。
  playCurrentQuestionAudioWithCountdown();
}

// 同じ問題スロットで規定回数（元の曲＋差し替え）すべて再生に失敗した、または差し替えられる
// 予備曲が無くなった場合に呼ぶ。この試合の結果はfinishMatch()を経由せず、勝敗・記録の
// いずれにも一切残さない（本人指示：中断結果を通常の記録として保存しない）。
function abortMatchDueToAudioFailure() {
  stopAudio();
  cancelLocalReplayCountdown();
  clearTimeout(autoAdvanceTimerId);
  elements.onAudioFailureAbort?.(
    "音源を正常に再生できない状態が続いているため、この対戦を中断しました。データパックの導入状況や通信環境をご確認のうえ、もう一度お試しください。"
  );
}

// 【2026-09-05新設】音源再生の直前に3→2→1を表示してから再生する。初回出題・再視聴の
// どちらもこれ経由で呼ぶ（本人指示：一瞬バトルは両方にカウントダウンを付ける）。
function playCurrentQuestionAudioWithCountdown() {
  // 【2026-09-08改訂・本人指示：カウントダウン速度の完全統一】js/instantChallengeScreen.jsと
  // 同じ理由（この対戦の最初の問題だけ画面遷移アニメーションと重ならないよう少し待つ）。
  // 待ち時間の値・ロジック自体はjs/localReplayCountdown.jsへ一本化した。
  runLocalReplayCountdownForQuestion(
    { containerElement: elements.countdown, numberElement: elements.countdownNumber, isFirstQuestion: isFirstQuestionOfMatch },
    () => {
      isCountdownActive = false;
      playCurrentQuestionAudio();
    }
  );
  isCountdownActive = true;
  isFirstQuestionOfMatch = false;
}

function renderCurrentQuestion() {
  hasAnsweredCurrentQuestion = false;
  elements.progress.textContent = `第${currentIndex + 1}問 / ${targetQuestionCount}問`;
  if (elements.answerReveal) elements.answerReveal.hidden = true;
  clearTimeout(autoAdvanceTimerId);
  renderAnswerArea(questions[currentIndex]);

  elements.replayButton.hidden = false;
  updateReplayButtonLabel();

  playCurrentQuestionAudioWithCountdown();
}

function renderAnswerArea(question) {
  const pool = question.answerPool;
  const isLargePool = pool.length >= LARGE_ANSWER_POOL_THRESHOLD;
  // 【2026-09-07新設・本人指示：検索状態を毎問題完全リセット】
  resetAnswerPoolBrowseState(answerBrowseState);
  elements.answerSearchRow.hidden = !isLargePool;
  if (isLargePool) {
    elements.answerSearchInput.value = "";
    elements.answerCount.textContent = `${pool.length}曲`;
  }
  if (elements.answerJumpBar) {
    elements.answerJumpBar.hidden = !isLargePool;
    if (isLargePool) renderAnswerJumpBar(elements.answerJumpBar, answerBrowseState, () => renderAnswerButtons(pool));
  }
  renderAnswerButtons(pool);
  // 選択肢一覧のスクロール位置も、新しい問題ごとに先頭へ戻す。
  elements.answerList.scrollTop = 0;
  elements.answerList.hidden = false;
}

function renderAnswerButtons(pool) {
  const filtered = filterAnswerPool(pool, answerBrowseState);

  elements.answerList.innerHTML = "";
  filtered.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button lyrics-quiz-answer-button";
    button.textContent = song.title;
    button.dataset.songId = song.id;
    // 【2026-09-06新設、本人指示：実機フィードバック②】一瞬バトルは正解数（＋同数時は
    // 再視聴回数）で順位を決めており、回答速度は順位に一切使わない
    // （js/battleModes/instantBattleMode.jsのcompareResults()参照）ため、確認対象。
    // handleAnswerSelected()自身がhasAnsweredCurrentQuestionで二重回答を防いでいる。
    button.addEventListener("click", () => {
      if (hasAnsweredCurrentQuestion) return;
      promptAnswerConfirm(song.title, () => handleAnswerSelected(song.id, button));
    });
    elements.answerList.appendChild(button);
  });
}

// 答え合わせカードを約4秒表示してから自動的に次の問題（最終問なら結果送信）へ進む
// までの待ち時間（js/instantChallengeScreen.jsのAUTO_ADVANCE_DELAY_MSと同じ理由・同じ値。
// 2026-09-07再改訂・本人指示：ChatGPTと確定した最新仕様で「手動ボタン必須」から
// 「4秒後に自動遷移」へ変更した）。
const AUTO_ADVANCE_DELAY_MS = 4000;
let autoAdvanceTimerId = null;

// 【2026-09-07改訂・本人指示：答え合わせUIの統一】色（is-correct/is-wrong）だけに頼らず、
// 選択肢一覧そのものを答え合わせカードへ切り替える（js/instantChallengeScreen.jsと同じ設計）。
function handleAnswerSelected(selectedSongId, buttonElement) {
  if (hasAnsweredCurrentQuestion) return;
  hasAnsweredCurrentQuestion = true;
  // 【2026-09-13追加・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】このモードの
  // 音源再生は、すべて3→2→1カウントダウン・4秒答え合わせを経由したsetTimeoutからしか
  // 呼ばれず、ユーザー操作から数秒離れたタイミングで行われる。iOS Safari/PWAでは
  // このような呼び出しは再生を拒否されることがあり、一度unlockが再ロックされると
  // 復帰する手立てが無いまま対戦全体が無音になりうる（詳細はdocs/HANDOFF.md参照）。
  // 回答を選ぶタップは対戦中に毎問必ず起きる、正真正銘のユーザー操作のため、ここで
  // unlockを試みておくことで、次の問題の再生（約5秒後）に間に合わせる（何度呼んでも
  // 安全。audioElementが再生中でない場合だけ実際に試す。js/audio.js参照）。
  attemptSilentUnlock();

  const question = questions[currentIndex];
  const isCorrect = selectedSongId === question.song.id;
  // 【2026-09-12追加・本人指示：結果画面の問題別結果アコーディオンを完成させる】
  // 正解曲・選んだ曲のタイトルをこの時点で一緒に控えておく（finishMatch()でperQuestionSnapshot
  // として提出する。question.answerPoolに選択肢の曲オブジェクトが既にあるため、
  // ここでは新しいデータ取得を増やさずにタイトルへ変換できる）。
  const selectedSongTitle = question.answerPool.find((song) => song.id === selectedSongId)?.title ?? selectedSongId;
  answers.push({
    songId: question.song.id,
    correctSongTitle: question.song.title,
    selectedSongTitle,
    isCorrect,
    replayCount: replayCounts[currentIndex],
  });

  renderAnswerReveal({ isCorrect, correctTitle: question.song.title, mySelectedSongId: selectedSongId, pool: question.answerPool });

  elements.replayButton.disabled = true; // 正解が確定した後の聞き直しは不要
  // 【2026-09-08改訂・本人指示：オンライン対戦での早送り禁止】以前は「次の問題へ」ボタンで
  // 個人だけ4秒を待たずに先へ進めるようにしていたが、オンライン対戦では1人だけ早く
  // 進めても意味が無く、同期ズレの原因にもなり得るという指摘を受け、早送り手段を廃止した。
  // 答え合わせは全員例外なく4秒固定で表示し、そのあと自動的に次へ進む
  // （試合終了後の「もう一度」「ルーム設定に戻る」「退出」は引き続き自動化しない）。
  clearTimeout(autoAdvanceTimerId);
  autoAdvanceTimerId = setTimeout(() => {
    advanceToNextQuestionOrFinish();
  }, AUTO_ADVANCE_DELAY_MS);

  // 他プレイヤーの待機画面に進捗を反映する（fire-and-forget。js/onlineBattle.jsの
  // submitAnswerProgress参照：内部で全て握りつぶし、rejectしない）。
  elements.onReportProgress(answers.length);
}

function renderAnswerReveal({ isCorrect, correctTitle, mySelectedSongId, pool }) {
  elements.answerList.hidden = true;
  if (elements.answerSearchRow) elements.answerSearchRow.hidden = true;
  // 【2026-09-13追加・本人指示：一瞬バトルの答え合わせが下に追いやられる不具合の修正】
  // 50音ジャンプバーを隠し忘れており（css/style.cssの[hidden]上書き漏れと合わせて二重の
  // 原因だった）、大きな曲プールでは検索欄・ジャンプバー・選択肢一覧が答え合わせカードの
  // 上にすべて残ったまま表示され続け、カードがスクロールしないと見えない位置まで
  // 追いやられていた（本人の実機報告で発覚）。
  if (elements.answerJumpBar) elements.answerJumpBar.hidden = true;
  if (!elements.answerReveal) return;

  elements.answerReveal.hidden = false;
  elements.answerRevealStatus.textContent = isCorrect ? "🎉 正解！" : "残念、不正解";
  elements.answerRevealStatus.classList.toggle("is-correct-answer-reveal-status", isCorrect);
  elements.answerRevealTitle.textContent = correctTitle;

  const mySong = pool.find((song) => song.id === mySelectedSongId);
  if (elements.answerRevealMyAnswer) {
    elements.answerRevealMyAnswer.hidden = !mySong;
    elements.answerRevealMyAnswer.textContent = mySong ? `あなたの回答：${mySong.title}` : "";
  }
}

function advanceToNextQuestionOrFinish() {
  currentIndex += 1;
  currentSlotFailureCount = 0; // 新しい問題スロットへ移るので、再生失敗のカウントもリセットする
  if (currentIndex >= targetQuestionCount) {
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
  // 【2026-09-12追加・本人指示：結果画面の問題別結果アコーディオンを完成させる】
  // js/main.jsのfinishOnlineBattlePlay()と同じ形（correctSongTitle・selectedAnswers・
  // isCorrect）に揃えることで、js/battleQuestionBreakdown.jsの共通の組み立て関数を
  // このモードでもそのまま使えるようにする。missCountは、このモードには
  // 「1問の中で複数回答え直す」概念が無いためundefinedのまま（表示側で自然に省略される）。
  const perQuestionSnapshot = answers.map((answer) => ({
    correctSongTitle: answer.correctSongTitle,
    selectedAnswers: [answer.selectedSongTitle],
    isCorrect: answer.isCorrect,
  }));

  const result = createResult({
    correctCount,
    missCount,
    totalElapsedMs,
    totalReplayCount,
    completed: true,
    perQuestionSnapshot,
  });
  elements.onFinishMatch(result, answers.length);
}
