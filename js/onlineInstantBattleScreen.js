// オンライン対戦「一瞬バトル」専用の画面コントローラ
// （2026-08-30新設→2026-09-15全面書き換え、本人指示：19-3章、および実機テストを経た
// 大規模フィードバックでの「重要仕様変更・最大の変更」）。
//
// 【なぜ書き換えたか】以前は「各自が自分のペースで問題を解き進める」独立進行モデル
// （タイムアタック等と同じ）だったが、本人指示により歌詞クイズ対戦・一瞬協力と同じ
// 「全員が同じ問題を同時に見る」ホスト主導の同期進行へ全面的に作り替えた。全員が回答
// するまでは他人の回答内容が一切見えず（「回答済み／未回答」の状態だけが見える）、
// 全員そろったら5秒間だけ全員の回答・正誤・その問題で使った「もう一度聞く」回数を
// 同時に公開する。
//
// 【アーキテクチャの再利用について】進行ロジックそのものはjs/instantBattleMatchProgress.js
// （Firebase不使用、恒久テスト済みの純粋関数）に切り出し、js/instantBattleFirebase.jsが
// それをFirebaseへ保存・同期する薄い層に徹する。この画面コントローラは、
// js/onlineInstantCoopBattleScreen.js（ホストの進行ミラー・tickタイマー・3分無操作救済・
// 切断時の自動救済の全パターン）と全く同じ設計をなぞっている。
//
// 【一瞬協力との根本的な違い】一瞬協力は「全員の投票を1つのチーム回答へ集約する」ため
// 個人の勝敗が無いが、一瞬バトルは「各自が自分の回答を出し、正解数＋再視聴回数で個人の
// 順位を競う」対戦のため、結果画面もチーム成績ではなく個人の順位表になる
// （js/instantBattleMatchProgress.jsのcomputeFinalResults()が順位まで一括で計算する）。

import { getCurrentUid } from "./firebaseClient.js";
import { scrollToTop } from "./screens.js";
import {
  ROOM_STATUS,
  subscribeServerTimeOffset,
  returnRoomToLobby,
  beginRematchReadyCheck,
  setRematchReady,
  cancelRematchReadyCheck,
  finishRematchReadyCheck,
  kickPlayer,
  markResultReturned,
} from "./onlineBattle.js";
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】結果画面の「ルーム設定に
// 戻る」個別化・「もう一度」への非強制対応を、共有エンジン・歌詞クイズと全く同じ仕組みで
// 実現する。
import {
  markResultScreenResponded,
  resetResultScreenResponded,
  hasRespondedToCurrentResultScreen,
  renderResultReturnStatusList,
  renderRematchReadinessList,
  createRematchKickHandler,
} from "./onlineBattleResultReturnState.js";
import {
  computeAllPlayersRematchReady,
  resolveRematchToggleButtonLabel,
  filterPlayersForRematchParticipants,
} from "./onlineBattleMatchConfirmationPayloads.js";
import { computeRemainingRevealMs } from "./onlineBattleRevealTiming.js";
import { promptReturnToLobby } from "./onlineBattleLobbyReturnPrompt.js";
import { promptLeaveMatch } from "./onlineBattleLeaveMatchPrompt.js";
import { promptResultLeaveRoom } from "./onlineBattleResultLeavePrompt.js";
import { promptResultGoHome } from "./onlineBattleResultHomePrompt.js";
import { promptAnswerConfirm } from "./answerConfirmPrompt.js";
import * as instantBattleMode from "./battleModes/instantBattleMode.js";
import {
  UNKNOWN_ANSWER,
  MATCH_STATUS_ABORTED_AUDIO_FAILURE,
  createMatchProgress,
  recordAnswer,
  countAnsweredPlayers,
  tick,
  advanceToNextQuestion,
  summarizePlayerOutcomes,
  computeFinalResults,
  restoreMatchProgressFromFirebase,
} from "./instantBattleMatchProgress.js";
import {
  QUESTION_STATUS,
  startInstantBattleQuestion,
  submitInstantAnswer,
  resolveInstantBattleQuestion,
  advanceInstantBattleQuestion,
  reportInstantBattleAudioFailure,
  abortInstantBattleMatchDueToAudioFailure,
  finalizeInstantBattleMatch,
} from "./instantBattleFirebase.js";
// 【3分無操作の放置救済・一瞬バトルにも適用】forcedSkips・questionActivityのFirebaseパスは
// gameMode非依存の汎用フィールドのため、歌詞クイズ対戦・一瞬協力と全く同じ関数を再利用する。
import { reportQuestionActivity, forceSkipIdlePlayer } from "./lyricsQuizBattleFirebase.js";
// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】進行判定はFirebase不使用の
// 純粋関数（js/audioTroubleRecovery.js）に切り出し、一瞬協力（js/onlineInstantCoopBattleScreen.js）
// と全く同じロジック・全く同じFirebaseパス（js/audioTroubleRecoveryFirebase.js）を共有する。
import {
  computeRecoveryReplayWindowMs,
  computeNextReportAttemptSlot,
  isAudioTroubleRecoveryLocking,
  computeAudioTroubleRecoveryAction,
} from "./audioTroubleRecovery.js";
import {
  reportAudioTroubleRecovery,
  startAudioTroubleRecoveryReplay,
  finishAudioTroubleRecoveryReplay,
  markAudioTroubleRecoverySwapped,
} from "./audioTroubleRecoveryFirebase.js";
import { IDLE_RESCUE_THRESHOLD_MS } from "./battleRules/sharedDefaults.js";
import { AUDIO_METADATA } from "./data/audioMetadata.js";
import {
  computeRandomStartTimeSec,
  clampStartTimeToActualDuration,
  isDurationMismatchWithinTolerance,
} from "./randomPlaybackEngine.js";
import {
  playSongFromRandomPosition,
  stopAudio,
  attemptSilentUnlock,
  reportPlaybackTrouble,
  startAudioUnlockHeartbeat,
  stopAudioUnlockHeartbeat,
} from "./audio.js";
// 【2026-09-26新設・本人指示：オンライン対戦総合改修19-18章】一瞬バトルで「正常な
// 音源でもaudio troubleとして誤検知される」問題の調査用に、js/audio.js・
// js/debugAudioLogScreen.js（管理者用ログ画面）が使っているのと同じ診断ログ基盤を
// 再利用する（新しいログの仕組みは作らない）。
import { recordAudioDiagnostic } from "./audioDiagnosticLog.js";
import { LARGE_ANSWER_POOL_THRESHOLD } from "./lyricsQuizEngine.js";
import {
  createAnswerPoolBrowseState,
  resetAnswerPoolBrowseState,
  filterAnswerPool,
  renderAnswerJumpBar,
} from "./answerPoolBrowseUi.js";
import { runLocalReplayCountdownForQuestion, cancelLocalReplayCountdown, SCREEN_ENTER_ANIMATION_MS } from "./localReplayCountdown.js";
import { getMemberById } from "./memberUtils.js";
// 【2026-09-26新設・本人指示：オンライン対戦総合改修19-8/19-10章】共通の参加者アイコン
// （推し色＋代表称号バッジ）と、参加者プロフィールモーダルを結果画面・答え合わせ画面から
// 再利用する。
import { buildParticipantIcon } from "./onlineParticipantIcon.js";
import { MEMBERS } from "./data/members.js";
import { savePlayHistoryEntryIfNew } from "./playHistory.js";
import { QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { buildInstantBattleQuestionBreakdown, capQuestionBreakdownForStorage } from "./battleQuestionBreakdown.js";
import { renderQuestionBreakdownAccordion } from "./battleQuestionBreakdownUi.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { MAX_REPLAY_COUNT_PER_QUESTION } from "./battleModes/instantBattleMode.js";

// ホストが結果を見せてから、次の問題／最終結果へ進むまでの待ち時間。
// 【本人指示11：5秒間の答え合わせ】歌詞クイズ・一瞬協力の4秒より長い、一瞬バトル専用の値
// （全員分の回答・正誤・再視聴回数を1度に読む必要があり、情報量が多いため）。
// 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド19章】答え合わせ中に
// 「問題の続き」の楽曲を鳴らす演出（playRevealContinuationAudio参照）と合わせ、
// 他モードと同じ7秒（7000ms）へ統一する。
const REVEAL_DELAY_MS = 7000;
// ホストの進行判定を更新する間隔（他の同期モードと同じ値・同じ理由）。
const HOST_TICK_INTERVAL_MS = 400;
// 【音源再生失敗時の公平性対策】js/onlineInstantCoopBattleScreen.jsと同じ考え方・同じ値。
const AUDIO_FAILURE_RESERVE_SIZE = 3;
const DISCONNECT_AUTO_SKIP_MS = 20000;
const ACTIVITY_REPORT_THROTTLE_MS = 15000;

// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド11章】音源誤判定の
// 実機ログからの切り分けを進めやすくするため、診断ログへ「誰の・どの端末での記録か」を
// 常に添える。断定できない原因を追加調査するための情報であり、判定ロジック自体には
// 一切使わない（ログにしか使わない値のため、簡易的なUser-Agent由来の推定で十分と判断）。
function describeInstantDiagnosticContext() {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const platform = /iPhone|iPad|iPod/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : "other";
  const myUid = getCurrentUid();
  return {
    platform,
    uid: myUid,
    role: latestRoom && myUid === latestRoom.host ? "host" : "guest",
  };
}

let elements = null;

let latestRoom = null;
let currentMatchId = null;
let currentQuestions = [];
let targetQuestionCount = 0;

let hostState = null;
let hostTickInFlight = false;
let resolvedAtLocalMs = null;
let tickTimerId = null;
let offsetUnsubscribe = null;
let serverTimeOffset = 0;

// 自分（この端末）の、今の問題に対する回答状況。
let myAnsweredQuestionIndex = -1;
let myReplayCountForCurrentQuestion = 0;
// 直近に描画した問題（変わった瞬間だけ音源を再生し直す・ローカル状態をリセットするために使う）。
let lastPlayedQuestionIndex = -1;
// 【2026-09-26追加・本人指示：サウンドシステム全面整備7章】答え合わせSFXを1問につき1回だけ
// 鳴らすためのガード（renderCurrentQuestionState()はtickのたびに何度も呼ばれるため）。
let lastRevealSfxPlayedForQIndex = -1;
// 【本人指示3：第1問の二重カウントダウン解消】対戦開始の3→2→1（js/onlineBattleScreen.js）と
// この問題ごとの3→2→1が、第1問の出題直後だけ連続して二重に表示されていた。
// このモードに入場した直後の最初の1問だけ、この問題ごとのカウントダウンを省略する。
let isFirstQuestionOfMatch = true;
let isCountdownActive = false;
// 【2026-11-XX新設・実機バグ調査：仕様総監査で発見】最初の1問だけの画面遷移アニメーション
// 待ち（下のplayCurrentQuestionAudioWithCountdown()参照）は、stopAllLocalTimers()の
// 管理対象外だったため、対戦を離脱した直後などにこの待機中（最大480ms）だと打ち切れず、
// 古い問題向けの再生が遅れて発火しうる狭い窓があった。追跡してキャンセル対象にする。
let firstQuestionDelayTimerId = null;

// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】直近にローカル再生を
// 反応させたリカバリー再生を覚えておく（"questionIndex:attemptCount"の組み合わせは
// 試合を通して一度しか使われないため、単純な文字列比較で「新しいリカバリー再生を
// 検知したか」を判定できる。renderCurrentQuestionState()参照）。
let lastAppliedAudioTroubleRecoveryKey = null;

let lastActivityReportedAtMs = 0;
let lastActivityReportedQIndex = -1;
const disconnectedSinceMsByUid = new Map();

const answerBrowseState = createAnswerPoolBrowseState();

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function resolveOshiColor(oshiMemberId) {
  const member = oshiMemberId ? getMemberById(MEMBERS, oshiMemberId) : null;
  return member?.memberColor?.hex ?? null;
}

// ===== 初期化 =====

export function initOnlineInstantBattleScreens(newElements) {
  elements = newElements;

  elements.answerSearchInput.addEventListener("input", () => {
    if (!latestRoom || !currentMatchId) return;
    const match = latestRoom.matches?.[currentMatchId];
    const qIndex = match?.currentQuestionIndex;
    if (typeof qIndex !== "number") return;
    const question = currentQuestions[qIndex];
    if (!question) return;
    reportMyQuestionActivity();
    answerBrowseState.searchQuery = elements.answerSearchInput.value;
    answerBrowseState.jumpRowKey = null;
    renderAnswerButtons(question.answerPool);
  });
  elements.answerList?.addEventListener("scroll", () => {
    reportMyQuestionActivity();
  });

  // 【本人指示14：「わからない」ボタンの追加】不正解として扱う。確認ダイアログ
  // （js/answerConfirmPrompt.js共用。「わからない」で回答しますか？の文言になる）を
  // 必ず挟んでから確定する。
  elements.unknownButton.addEventListener("click", () => {
    // 確認モーダルを開くだけの軽い操作音（モーダル内の確定・キャンセルは
    // js/answerConfirmPrompt.js側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    reportMyQuestionActivity();
    const matchAtClick = latestRoom?.matches?.[currentMatchId];
    const expectedQIndex = matchAtClick?.currentQuestionIndex;
    promptAnswerConfirm("わからない", () => {
      const matchAtConfirm = latestRoom?.matches?.[currentMatchId];
      if (matchAtConfirm?.currentQuestionIndex !== expectedQIndex) return;
      handleAnswerConfirmed(UNKNOWN_ANSWER);
    });
  });

  elements.replayButton.addEventListener("click", () => {
    if (myAnsweredQuestionIndex === (latestRoom?.matches?.[currentMatchId]?.currentQuestionIndex ?? -1)) return;
    if (isCountdownActive) return;
    if (myReplayCountForCurrentQuestion >= MAX_REPLAY_COUNT_PER_QUESTION) return;
    // 「もう一度聞く」操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    reportMyQuestionActivity();
    // 【2026-09-13追加・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】「もう一度聞く」は
    // 対戦中に得られる貴重な、本物のユーザー操作の直後（カウントダウン前）。ここでunlockを
    // 試みておくのが最も成功しやすいタイミングのため、真っ先に呼ぶ。
    attemptSilentUnlock();
    myReplayCountForCurrentQuestion += 1;
    updateReplayButtonLabel();
    const match = latestRoom?.matches?.[currentMatchId];
    const qIndex = match?.currentQuestionIndex;
    const question = currentQuestions[qIndex];
    if (question) playCurrentQuestionAudioWithCountdown(question, qIndex);
  });

  // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】1人が押すと、参加者
  // 全員に対して今の問題の音源を頭から同じタイミングで再生し直す（個人だけの操作では
  // なく、試合全体に影響する処理）。既存のjs/answerConfirmPrompt.jsは「回答確定」専用の
  // 固定文言のため流用せず、js/onlineBattleScreen.js等の運用操作（退出させる等）と同じく
  // window.confirm()のパターンを使う。
  elements.audioTroubleButton?.addEventListener("click", () => {
    handleAudioTroubleButtonClick();
  });

  elements.quitButton.addEventListener("click", () => {
    // 対戦をやめる確認モーダルを開く操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.quitConfirmModal.hidden = false;
  });
  elements.quitCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    elements.quitConfirmModal.hidden = true;
  });
  elements.quitConfirmButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    elements.quitConfirmModal.hidden = true;
    stopAllLocalTimers();
    stopAudio();
    elements.onQuitDuringBattle();
    elements.navigateTo("onlineBattleEntry");
  });

  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  elements.backToLobbyButton?.addEventListener("click", () => {
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleLobbyReturnPrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptReturnToLobby(latestRoom?.roomId);
  });

  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】
  elements.leaveMatchButton?.addEventListener("click", () => {
    const roomId = latestRoom?.roomId;
    const matchId = currentMatchId;
    if (!roomId || !matchId) return;
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleLeaveMatchPrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptLeaveMatch(roomId, matchId, () => {
      saveVoluntaryLeaveHistoryEntry();
      resetOnlineInstantBattleState();
      elements.navigateTo("onlineBattleLobby");
    });
  });

  // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第3ラウンド】誤操作で結果画面を
  // 離れてしまわないよう、確認モーダルを挟んでから実行する。
  elements.resultHomeLink.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    promptResultGoHome(() => {
      stopAllLocalTimers();
      elements.onLeaveResultToHome();
      elements.navigateTo("start");
    });
  });
  elements.resultLeaveButton?.addEventListener("click", () => {
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleResultLeavePrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptResultLeaveRoom(async () => {
      stopAllLocalTimers();
      elements.resultLeaveButton.disabled = true;
      await elements.onLeaveRoomCompletely();
      elements.resultLeaveButton.disabled = false;
      elements.navigateTo("start");
    });
  });
  // 【2026-09-30新設→2026-10-01全面改訂・本人指示：結果画面/再戦フロー全面設計】
  // 「もう一度」はホスト専用のまま。押した瞬間、beginRematchReadyCheck()で
  // confirmingRematchを立てる（このときホスト自身は既に準備OK扱いになる）。以前は
  // 別画面へ遷移していたが、今は結果画面から離れず、下のインラインパネル
  // （renderInstantBattleResultReturnPanel()参照）でそのまま完結する。
  elements.resultRematchButton.addEventListener("click", async () => {
    if (!latestRoom) return;
    attemptSilentUnlock();
    playSfx(SFX_EVENTS.UI_CONFIRM);
    elements.resultRematchButton.disabled = true;
    const result = await beginRematchReadyCheck({ roomId: latestRoom.roomId });
    elements.resultRematchButton.disabled = false;
    if (result.ok) markResultScreenResponded();
  });
  // 【2026-10-01新設・本人指示】インライン再戦準備パネルの「準備OK」トグル。
  // 【2026-11-XX修正・実機バグ調査：再戦フロー】js/onlineBattleScreen.jsの通常モードでは
  // 既に対応済みだった「ホストが押した場合は再戦提案そのものを取り消す」分岐が、
  // このファイルには移植されておらず欠落していた。
  elements.resultRematchToggleButton?.addEventListener("click", async () => {
    if (!latestRoom) return;
    if (latestRoom.host === getCurrentUid()) {
      playSfx(SFX_EVENTS.UI_BACK);
      elements.resultRematchToggleButton.disabled = true;
      await cancelRematchReadyCheck({ roomId: latestRoom.roomId });
      elements.resultRematchToggleButton.disabled = false;
      return;
    }
    const myUid = getCurrentUid();
    const myReady = latestRoom.players?.[myUid]?.rematchReady === true;
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.resultRematchToggleButton.disabled = true;
    await setRematchReady({ roomId: latestRoom.roomId, confirmed: !myReady });
    elements.resultRematchToggleButton.disabled = false;
  });
  // 【2026-10-01新設・本人指示】再戦準備中のキック（ホストのみ表示されるボタン）。
  elements.resultRematchPlayerList?.addEventListener("click", handleInstantBattleRematchKickClick);
  // 【2026-09-30改訂→2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計】「ルーム設定に
  // 戻る」は、ホスト・ゲストどちらも押せる個別操作。再戦提案中であれば先に
  // cancelRematchReadyCheck()でキャンセルしてから、自分の分だけmarkResultReturned()で記録する。
  elements.resultReturnButton?.addEventListener("click", async () => {
    if (!latestRoom) return;
    playSfx(SFX_EVENTS.UI_BACK);
    elements.resultReturnButton.disabled = true;
    markResultScreenResponded();
    if (latestRoom.confirmingRematch === true) {
      await cancelRematchReadyCheck({ roomId: latestRoom.roomId });
    }
    await markResultReturned({ roomId: latestRoom.roomId });
    elements.resultReturnButton.disabled = false;
    resetOnlineInstantBattleState();
    elements.navigateTo("onlineBattleLobby");
  });
}

function stopAllLocalTimers() {
  stopTickTimer();
  stopServerTimeOffsetTracking();
  cancelLocalReplayCountdown();
  if (firstQuestionDelayTimerId !== null) {
    clearTimeout(firstQuestionDelayTimerId);
    firstQuestionDelayTimerId = null;
  }
  // 【2026-11-XX新設】js/audio.jsの予防的unlock心拍（音源無効化の頻発対策）。
  stopAudioUnlockHeartbeat();
}

// 【本人指示：プレイ履歴へ「途中退出」を保存する】js/onlineInstantCoopBattleScreen.jsの
// saveVoluntaryLeaveInstantCoopHistoryEntry()と同じ考え方。match.instantQuestionOutcomesから
// 自分のuid分だけを集めてsummarizePlayerOutcomes()に渡す（新しいFirebase書き込みは発生しない）。
function saveVoluntaryLeaveHistoryEntry() {
  if (!currentMatchId || !latestRoom) return;
  const match = latestRoom.matches?.[currentMatchId];
  const myUid = getCurrentUid();
  const outcomes = Object.values(match?.instantQuestionOutcomes ?? {})
    .filter((outcome) => outcome && outcome.isVoid !== true)
    .map((outcome) => outcome.perPlayerOutcome?.[myUid])
    .filter(Boolean);
  const summary = summarizePlayerOutcomes(outcomes);
  const participants = match?.participants ?? {};

  savePlayHistoryEntryIfNew({
    id: `online:${currentMatchId}`,
    playedAt: Date.now(),
    modeId: "onlineInstantBattle",
    modeLabel: "オンライン対戦（一瞬バトル）",
    questionCount: targetQuestionCount,
    isAllSongsMode: !latestRoom.settings.questionSource || latestRoom.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS,
    correctCount: summary.correctCount,
    wrongCount: summary.wrongCount,
    skippedCount: summary.dontKnowCount,
    score: null,
    averageResponseMs: null,
    completed: false,
    details: {
      isVoluntaryLeave: true,
      isDnf: false,
      myRank: null,
      participantCount: Object.keys(participants).length,
    },
  });
}

export function resetOnlineInstantBattleState() {
  stopAllLocalTimers();
  stopAudio();
  latestRoom = null;
  currentMatchId = null;
  currentQuestions = [];
  targetQuestionCount = 0;
  hostState = null;
  hostTickInFlight = false;
  resolvedAtLocalMs = null;
  myAnsweredQuestionIndex = -1;
  myReplayCountForCurrentQuestion = 0;
  lastPlayedQuestionIndex = -1;
  lastRevealSfxPlayedForQIndex = -1;
  isFirstQuestionOfMatch = true;
  isCountdownActive = false;
  // 【2026-11-XX追加・実機バグ調査：push直前の最終二重レビューで発見】
  // js/onlineInstantCoopBattleScreen.jsのresetInstantCoopBattleState()には既にあった
  // リセットが、こちらだけ欠けていた。実害は無い（次のplayCurrentQuestionAudioWithCountdown()
  // 呼び出しで必ず上書きされる）が、将来の変更に対する耐性のため揃えておく。
  hasAttemptedLocalRecoveryThisAttempt = false;
  lastAppliedAudioTroubleRecoveryKey = null;
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;
  disconnectedSinceMsByUid.clear();
}

// js/onlineBattleScreen.jsのrenderLobby()から、gameMode==="instantBattle"のときに呼ばれる
// 入口（js/onlineInstantCoopBattleScreen.jsのenterInstantCoopBattlePlay()と同じ役割）。
export function getTargetQuestionCount() {
  return targetQuestionCount;
}

export async function enterOnlineInstantBattlePlay(room) {
  // 【js/onlineInstantCoopBattleScreen.jsの同じ修正と同じ理由】goToCountdownScreen()の
  // クロージャは古いstatus:"countdown"を持ったままのことがあるため、ここで明示的に
  // "playing"へ正規化する。
  const normalizedRoom = { ...room, status: ROOM_STATUS.PLAYING };
  latestRoom = normalizedRoom;
  currentMatchId = normalizedRoom.activeMatchId;
  hostState = null;
  hostTickInFlight = false;
  resolvedAtLocalMs = null;
  myAnsweredQuestionIndex = -1;
  myReplayCountForCurrentQuestion = 0;
  lastPlayedQuestionIndex = -1;
  lastRevealSfxPlayedForQIndex = -1;
  isFirstQuestionOfMatch = true;
  isCountdownActive = false;
  lastAppliedAudioTroubleRecoveryKey = null;
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;
  disconnectedSinceMsByUid.clear();
  hasAttemptedLocalRecoveryThisAttempt = false;

  elements.error.hidden = true;

  // 【2026-09-26新設・本人指示：オンライン対戦総合改修19-17章】以前はここで前試合の
  // 答え合わせカード（正解曲名・正誤メッセージ・無効問題表示・回答一覧）や回答候補一覧を
  // 一切クリアしないままnavigateTo()で画面を表示していたため、ホストがFirebase側に
  // 最初の問題（currentQuestionIndex）を書き込み終える（非同期・ネットワーク往復あり）までの
  // 間、前試合の最後の問題の内容がそのまま画面に残って見えてしまっていた
  // （js/onlineLyricsQuizBattleScreen.jsのenterLyricsQuizBattlePlay()には同種の対策が
  // 2026-09-08から入っていたが、2026-09-15の全面書き換え時にこの画面へは移植されて
  // いなかった）。画面を表示する前に、前試合固有のDOM内容を明示的に空にしておく。
  if (elements.revealSection) elements.revealSection.hidden = true;
  if (elements.revealCorrectSong) elements.revealCorrectSong.textContent = "";
  if (elements.revealOutcomeBadge) {
    elements.revealOutcomeBadge.textContent = "";
    elements.revealOutcomeBadge.classList.remove("is-correct-answer-reveal-status");
  }
  if (elements.revealAudioFailureNotice) elements.revealAudioFailureNotice.hidden = true;
  if (elements.revealPlayerList) clearElement(elements.revealPlayerList);
  if (elements.answerSection) elements.answerSection.hidden = true;
  if (elements.answerList) clearElement(elements.answerList);
  if (elements.answerStatusList) clearElement(elements.answerStatusList);
  if (elements.waitingSection) elements.waitingSection.hidden = true;
  if (elements.idleNotice) elements.idleNotice.hidden = true;

  const myUid = getCurrentUid();
  const isHostAtEntry = room.host === myUid;
  if (elements.backToLobbyButton) elements.backToLobbyButton.hidden = !isHostAtEntry;
  if (elements.leaveMatchButton) elements.leaveMatchButton.hidden = isHostAtEntry;
  elements.navigateTo("onlineInstantBattleQuestion");
  startServerTimeOffsetTracking();

  currentQuestions = instantBattleMode.buildQuestions({
    seed: room.seed,
    settings: room.settings,
    reserveCount: AUDIO_FAILURE_RESERVE_SIZE,
  });
  targetQuestionCount = currentQuestions.filter((question) => !question.isReserve).length;

  if (room.host === myUid) {
    const match = room.matches?.[currentMatchId] ?? {};
    const isReconnect = typeof match.currentQuestionIndex === "number";
    const participantUids = Object.keys(match.participants ?? {});
    hostState = isReconnect
      ? restoreMatchProgressFromFirebase({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: myUid,
          match,
          nowMs: Date.now(),
          targetQuestionCount,
        })
      : createMatchProgress({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: myUid,
          nowMs: Date.now(),
          targetQuestionCount,
        });
    if (hostState.currentQuestion.status === "resolved") resolvedAtLocalMs = Date.now();
  }

  startTickTimer();
  // 【2026-11-XX新設・本人指示：一瞬バトル「音源は無効です」頻発の再調査】対戦中は
  // 予防的にunlockを再試行し続ける（js/audio.jsのstartAudioUnlockHeartbeat()参照）。
  startAudioUnlockHeartbeat();
  renderCurrentQuestionState();
}

function startServerTimeOffsetTracking() {
  stopServerTimeOffsetTracking();
  offsetUnsubscribe = subscribeServerTimeOffset((offset) => {
    serverTimeOffset = offset;
  });
}
function stopServerTimeOffsetTracking() {
  if (offsetUnsubscribe) {
    offsetUnsubscribe();
    offsetUnsubscribe = null;
  }
}
function startTickTimer() {
  stopTickTimer();
  tickTimerId = setInterval(runTick, HOST_TICK_INTERVAL_MS);
}
function stopTickTimer() {
  if (tickTimerId) {
    clearInterval(tickTimerId);
    tickTimerId = null;
  }
}
function runTick() {
  if (!latestRoom || latestRoom.status !== ROOM_STATUS.PLAYING) return;
  if (getCurrentUid() === latestRoom.host) runHostProgressionTick();
  renderCurrentQuestionState();
}

// js/onlineBattleScreen.jsのrenderLobby()が、room更新のたび（画面を問わず）呼ぶフック。
export function handleInstantBattleRoomUpdate(room) {
  latestRoom = room;
  syncInstantBattleResultReturnPanel(room);
  if (getCurrentUid() === room.host && room.status === ROOM_STATUS.PLAYING) {
    // 【js/onlineInstantCoopBattleScreen.jsの同じ修正と同じ理由：ホスト切断・自動移譲後の
    // 進行再開】非ホストとして入場した端末が後からホストに昇格した場合、hostStateを
    // Firebase上の実際の進行状況から組み立て直す。
    if (!hostState && currentMatchId && currentQuestions.length > 0) {
      const match = room.matches?.[currentMatchId];
      if (match && typeof match.currentQuestionIndex === "number") {
        const participantUids = Object.keys(match.participants ?? {});
        hostState = restoreMatchProgressFromFirebase({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: getCurrentUid(),
          match,
          nowMs: Date.now(),
          targetQuestionCount,
        });
        if (hostState.currentQuestion.status === "resolved") resolvedAtLocalMs = Date.now();
      }
    }
    runHostProgressionTick();
  }
  const isHostNow = room.host === getCurrentUid();
  if (elements?.backToLobbyButton) elements.backToLobbyButton.hidden = !isHostNow;
  if (elements?.leaveMatchButton) elements.leaveMatchButton.hidden = isHostNow;
  if (document.body.dataset.screen === "onlineInstantBattleQuestion") renderCurrentQuestionState();
}

// ===== ホスト専用：進行ミラーの駆動 =====

async function runHostProgressionTick() {
  if (!currentMatchId || !latestRoom || hostTickInFlight) return;
  const match = latestRoom.matches?.[currentMatchId];
  if (!match) return;

  if (typeof match.currentQuestionIndex !== "number") {
    hostTickInFlight = true;
    try {
      const result = await startInstantBattleQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: 0 });
      if (!result.ok) console.error("一瞬バトル：最初の問題の開始に失敗しました", result.reason);
    } catch (error) {
      console.error("一瞬バトル：進行タイマーで想定外のエラーが発生しました（最初の問題の開始）", error);
    } finally {
      hostTickInFlight = false;
    }
    return;
  }

  if (!hostState) return;
  if (hostState.currentQuestionIndex !== match.currentQuestionIndex) return; // Firebase側の反映待ち

  if (hostState.currentQuestion.status === "collecting") {
    const qIndex = hostState.currentQuestionIndex;

    // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】音源トラブル復旧の
    // 処理を、通常の回答集計・進行判定より優先する。復旧が必要な間（新しい申告の検知～
    // リカバリー再生の待機中）は、回答集計・次の問題への進行判定を一切行わない
    // （本人指示：「他の全員の回答操作を一時的にロックし...進行を一時停止する」）。
    const recoveryAction = computeAudioTroubleRecoveryAction({
      recovery: match.audioTroubleRecovery,
      reports: match.audioTroubleRecovery?.reports,
      questionIndex: qIndex,
      nowMs: Date.now(),
      replayWindowMs: computeRecoveryReplayWindowMs({
        playDurationSec: Number(latestRoom.settings.playDurationValue),
        includesCountdown: true, // 一瞬バトルは各問題の前に3→2→1のローカルカウントダウンを挟む
      }),
    });
    if (recoveryAction.type === "wait") return;
    if (recoveryAction.type !== "none") {
      hostTickInFlight = true;
      try {
        await applyAudioTroubleRecoveryAction(recoveryAction, qIndex);
      } catch (error) {
        console.error("一瞬バトル：音源トラブル復旧の処理で想定外のエラーが発生しました", error);
      } finally {
        hostTickInFlight = false;
      }
      return;
    }

    const firebaseAnswers = match.instantAnswers?.[qIndex] ?? {};
    let nextHostState = hostState;
    for (const [uid, answer] of Object.entries(firebaseAnswers)) {
      if (!(uid in nextHostState.currentQuestion.answersByUid)) {
        nextHostState = recordAnswer(nextHostState, uid, { selectedSongId: answer.selectedSongId, replayCount: answer.replayCount ?? 0 });
      }
    }
    // 【3分無操作の放置救済】forcedSkipsは、本人がわからないを回答した場合と全く同じ経路
    // （recordAnswer()へUNKNOWN_ANSWERを渡す）で進行ミラーへ取り込む。
    const firebaseForcedSkips = match.forcedSkips?.[qIndex] ?? {};
    for (const uid of Object.keys(firebaseForcedSkips)) {
      if (!(uid in nextHostState.currentQuestion.answersByUid)) {
        nextHostState = recordAnswer(nextHostState, uid, { selectedSongId: UNKNOWN_ANSWER, replayCount: 0 });
      }
    }
    // 【2026-09-15追加・本人指示：途中退出者を待ち続けない】leftDuringMatch（「この試合だけ
    // 抜ける」）は参加者本人のフラグを立てるだけで、進行判定が見る回答済み人数には
    // 一切影響しない設計だった（js/onlineBattleLeaveMatchPrompt.jsのコメント参照：
    // 「room.status・他の参加者には一切影響しない」）。そのため、離脱した人がまだこの
    // 問題へ回答していないと、3分無操作救済がホストの手動操作で発動するまで進行が
    // 止まってしまっていた（離脱者は既にcurrentMatchTotalQuestions等から除外されず
    // 接続状態もconnected:trueのままなので、切断救済（20秒）も発動しない）。
    // 離脱済みの人は、この問題も含めて以後わからない扱いにして進行を止めない
    // （最終結果画面ではleftDuringMatchで既に除外されるため、この仮の回答が順位へ
    // 影響することは無い）。
    for (const uid of nextHostState.allPlayerUids) {
      if (uid in nextHostState.currentQuestion.answersByUid) continue;
      if (match.participants?.[uid]?.leftDuringMatch === true) {
        nextHostState = recordAnswer(nextHostState, uid, { selectedSongId: UNKNOWN_ANSWER, replayCount: 0 });
      }
    }

    // 【切断時の自動復帰待ち→離脱処理】js/onlineInstantCoopBattleScreen.jsと同じ設計。
    for (const uid of nextHostState.allPlayerUids) {
      if (uid in nextHostState.currentQuestion.answersByUid) {
        disconnectedSinceMsByUid.delete(uid);
        continue;
      }
      const isConnected = latestRoom.players?.[uid]?.connected !== false;
      if (isConnected) {
        disconnectedSinceMsByUid.delete(uid);
        continue;
      }
      if (!disconnectedSinceMsByUid.has(uid)) {
        disconnectedSinceMsByUid.set(uid, Date.now());
        continue;
      }
      const disconnectedForMs = Date.now() - disconnectedSinceMsByUid.get(uid);
      if (disconnectedForMs >= DISCONNECT_AUTO_SKIP_MS && !firebaseForcedSkips[uid]) {
        forceSkipIdlePlayer({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, targetUid: uid }).catch(() => {});
      }
    }

    // 【音源再生失敗時の公平性対策】誰か1人でもこの問題で音源再生に失敗したと報告していれば、
    // 回答の集計より優先してこの問題を無効にする。
    const audioFailureUids = Object.keys(match.audioFailures?.[qIndex] ?? {});
    const hasAudioFailureReport = audioFailureUids.length > 0;
    // 【2026-09-26新設・本人指示：オンライン対戦総合改修19-18章】ホストの端末から見て
    // 「誰の報告によってこの問題が無効になったか」を残す（同じ問題について2回目以降は
    // 毎tickログが増え続けないよう、まだ無効化されていない状態からこのtickで初めて
    // 検知した瞬間だけ記録する）。
    if (hasAudioFailureReport && nextHostState.currentQuestion.status !== "resolved") {
      recordAudioDiagnostic("[ONLINE_INSTANT] ホスト：audioFailure報告を検知しこの問題を無効化", {
        ...describeInstantDiagnosticContext(),
        matchId: currentMatchId,
        questionIndex: qIndex,
        reportedByUids: audioFailureUids,
      });
    }
    const beforeTick = nextHostState;
    nextHostState = tick(nextHostState, Date.now(), hasAudioFailureReport);
    hostState = nextHostState;

    if (nextHostState !== beforeTick && nextHostState.currentQuestion.status === "resolved") {
      resolvedAtLocalMs = Date.now();
      hostTickInFlight = true;
      try {
        const result = await resolveInstantBattleQuestion({
          roomId: latestRoom.roomId,
          matchId: currentMatchId,
          questionIndex: qIndex,
          outcome: nextHostState.currentQuestion.outcome,
        });
        if (!result.ok) console.error("一瞬バトル：問題の確定に失敗しました", result.reason);
      } catch (error) {
        console.error("一瞬バトル：進行タイマーで想定外のエラーが発生しました（問題の確定）", error);
      } finally {
        hostTickInFlight = false;
      }
    }
    return;
  }

  if (hostState.currentQuestion.status === "resolved" && resolvedAtLocalMs !== null && Date.now() - resolvedAtLocalMs >= REVEAL_DELAY_MS) {
    hostTickInFlight = true;
    try {
      const nextState = advanceToNextQuestion(hostState, Date.now());
      hostState = nextState;
      disconnectedSinceMsByUid.clear();
      if (nextState.status === "inProgress") {
        resolvedAtLocalMs = null;
        const result = await advanceInstantBattleQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, nextQuestionIndex: nextState.currentQuestionIndex });
        if (!result.ok) console.error("一瞬バトル：次の問題の開始に失敗しました", result.reason);
      } else if (nextState.status === MATCH_STATUS_ABORTED_AUDIO_FAILURE) {
        const result = await abortInstantBattleMatchDueToAudioFailure({ roomId: latestRoom.roomId, matchId: currentMatchId });
        if (!result.ok) console.error("一瞬バトル：音源再生失敗による対戦中断の確定に失敗しました", result.reason);
      } else {
        // 【本人指示16：最終順位の計算】全問題の確定結果（Firebase上に既に揃っている）から、
        // 全員分の順位を1回だけ計算し、まとめて書く（js/instantCoopBattleFirebase.jsの
        // finalizeCoopMatch()と同じ「host-finalizes-once」パターン）。
        const latestMatch = latestRoom.matches?.[currentMatchId] ?? {};
        const resultsByUid = computeFinalResults({
          allPlayerUids: nextState.allPlayerUids,
          questionOutcomesByIndex: latestMatch.instantQuestionOutcomes,
        });
        const result = await finalizeInstantBattleMatch({ roomId: latestRoom.roomId, matchId: currentMatchId, resultsByUid });
        if (!result.ok) console.error("一瞬バトル：最終結果の確定に失敗しました", result.reason);
      }
    } catch (error) {
      console.error("一瞬バトル：進行タイマーで想定外のエラーが発生しました（次の問題／最終結果）", error);
    } finally {
      hostTickInFlight = false;
    }
  }
}

// ===== 対戦中：全クライアント共通の描画 =====

function showAudioErrorInline(message) {
  elements.error.textContent = message;
  elements.error.hidden = false;
}

// 【2026-09-26新設・本人指示：オンライン対戦総合改修19-16章】一瞬バトルで、正常な
// 音源を持つ端末でも「音源を再生できませんでした」→即・問題無効が頻発する不具合の調査結果、
// 「参加者の誰か1人でもaudioFailureを報告すれば全員に即座に波及する」設計（下の
// handlePlaybackFailure内、reportInstantBattleAudioFailure呼び出し）自体は、本当に
// 再生できない参加者がいた場合の安全機構として必要なため維持する（本人指示：削除しない）。
// 一方で、js/audio.jsの422行目付近のコメントにある通り、「オンライン対戦でplay()自体が
// 一時的に失敗する」ケースは以前から確認されており、その対策としてattemptPlay()内に
// 既に2回の自動再試行（300ms/600ms）が入っている。それでも一瞬系だけで無効化が頻発する
// ことから、iOSの自動再生許可が「相手の回答を待つ」長い無操作区間中に再ロックされ、
// 通常の再試行だけでは回復しきれない可能性が最有力の仮説として残っている
// （詳細はdocs/HANDOFF.md参照）。この仮説を検証しつつ誤検知を減らすため、サーバーへ
// 報告する前に、1回だけ「明示的な再unlock→再生」のローカル回復を試みる。
// 1回だけに制限しているのは、これ以上増やすと「本当に再生できない」場合の無効化が
// 遅れすぎる（対戦のテンポを損なう）ため。
// 【2026-11-XX修正・実機バグ調査：「もう一度聞く」を使うと問題無効になりやすい不具合】
// 以前はquestionIndexだけをキーにしたSetで管理していたため、初回再生が（正常に）1回
// ローカル再試行で回復しただけで、その問題の復旧予算を使い切ったことになり、その後
// プレイヤーが「もう一度聞く」を使って再生に失敗した場合、本来なら1回は与えられる
// はずのローカル再試行が一切無いまま、いきなりサーバーへ報告＝問題無効化に直行していた
// （本人からの実機報告の直接原因）。「もう一度聞く」自体は正常な機能であり、使っただけで
// 復旧の機会を失うのはおかしいため、「今まさに行っている1回の再生の試み」ごとに
// 予算をリセットする（playCurrentQuestionAudioWithCountdown()が新しい再生を開始する
// たびにfalseへ戻す。js/onlineInstantCoopBattleScreen.jsと同じ修正）。
let hasAttemptedLocalRecoveryThisAttempt = false;

function handlePlaybackFailure(questionIndex, message) {
  const visibilityState = typeof document !== "undefined" ? document.visibilityState : "unknown";
  // 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド・音源誤判定の再監査】
  // このコールバックが呼ばれた瞬間のmatchIdを覚えておく。onError等の非同期コールバックは
  // 発火が遅れることがあり、その間に試合が終了・次の試合が始まっている可能性がある
  // （調査エージェントが指摘した副次的な不具合：ローカル再試行にmatchIdの陳腐化
  // チェックが無かった）。
  const requestMatchId = currentMatchId;
  recordAudioDiagnostic("[ONLINE_INSTANT] 再生失敗を検知", {
    ...describeInstantDiagnosticContext(),
    matchId: requestMatchId,
    questionIndex,
    message,
    visibilityState,
    alreadyAttemptedLocalRecovery: hasAttemptedLocalRecoveryThisAttempt,
  });

  if (!hasAttemptedLocalRecoveryThisAttempt) {
    hasAttemptedLocalRecoveryThisAttempt = true;
    // 【2026-09-30新設】再試行を実際に行う直前に、この失敗がまだ「今の試合・今の問題」に
    // 関するものかを再確認する。陳腐化していれば、無駄な再生・診断ログの汚れを避けて
    // 何もしない（本人指示：明確な追加バグが見つかったので修正する）。
    const isStillCurrent =
      requestMatchId === currentMatchId && latestRoom?.matches?.[requestMatchId]?.currentQuestionIndex === questionIndex;
    const question = currentQuestions[questionIndex];
    const settings = latestRoom?.settings;
    if (isStillCurrent && question && settings) {
      recordAudioDiagnostic("[ONLINE_INSTANT] サーバーへ報告する前にローカルで再unlock→再生を1回だけ試みる", {
        ...describeInstantDiagnosticContext(),
        matchId: requestMatchId,
        questionIndex,
      });
      attemptSilentUnlock();
      playQuestionAudio(question, questionIndex, settings);
      return;
    }
    if (!isStillCurrent) {
      recordAudioDiagnostic("[ONLINE_INSTANT] ローカル再試行を見送り（既に別の試合／問題へ進んでいた）", {
        ...describeInstantDiagnosticContext(),
        requestMatchId,
        currentMatchId,
        questionIndex,
      });
      return;
    }
  }

  showAudioErrorInline(message);
  if (!latestRoom || !currentMatchId) return;
  recordAudioDiagnostic("[ONLINE_INSTANT] 音声トラブルをサーバーへ報告（この問題は無効になります）", {
    ...describeInstantDiagnosticContext(),
    matchId: currentMatchId,
    questionIndex,
    message,
  });
  reportInstantBattleAudioFailure({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex }).catch(() => {});
}

function playQuestionAudio(question, questionIndex, settings) {
  recordAudioDiagnostic("[ONLINE_INSTANT] 再生要求", {
    ...describeInstantDiagnosticContext(),
    matchId: currentMatchId,
    questionIndex,
    songId: question.song.id,
    visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
  });
  const playDurationSec = Number(settings.playDurationValue);
  const fixedDurationSec = AUDIO_METADATA[question.song.id]?.durationSec ?? null;
  if (fixedDurationSec === null) {
    handlePlaybackFailure(questionIndex, "この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    return;
  }
  const computeStartTimeSec = (actualDurationSec) => {
    // 【2026-11-XX追加・実機バグ調査：「この問題は無効です」頻発】duration不一致の実測値を
    // 必ず記録する（成功時も含む）。実機での閾値0.75秒（MAX_DURATION_MISMATCH_SEC、
    // js/randomPlaybackEngine.js）が妥当かどうかは実測データが無いと判断できないため
    // （本人指示：「原因不明のまま数字だけ調整する修正はしない」）、まずはこの計測を
    // 実機ログへ残すことを優先する。
    const diffSec = Math.abs(fixedDurationSec - actualDurationSec);
    const withinTolerance = isDurationMismatchWithinTolerance(fixedDurationSec, actualDurationSec);
    recordAudioDiagnostic("[ONLINE_INSTANT] duration比較", {
      ...describeInstantDiagnosticContext(),
      questionIndex,
      songId: question.song.id,
      fixedDurationSec,
      actualDurationSec,
      diffSec: Math.round(diffSec * 1000) / 1000,
      withinTolerance,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
    });
    if (!withinTolerance) {
      stopAudio();
      handlePlaybackFailure(questionIndex, "この曲の音源が他の端末と異なる可能性があります。音源を入れ直してください。");
      return 0;
    }
    const canonicalStartTimeSec = computeRandomStartTimeSec({
      seed: latestRoom.seed,
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
    () =>
      recordAudioDiagnostic("[ONLINE_INSTANT] 再生開始を確認（正常）", {
        ...describeInstantDiagnosticContext(),
        matchId: currentMatchId,
        questionIndex,
      }),
    () => {}
  );
}

// 【本人指示3：第1問の二重カウントダウン解消】対戦開始時の3→2→1（js/onlineBattleScreen.js）
// が既に表示された直後なので、この対戦の最初の問題の初回出題だけはこの問題ごとの
// カウントダウンを省略し、画面遷移アニメーション分だけ短く待ってから直接再生する。
// 第2問以降の初回出題・すべての「もう一度聞く」は、通常どおり3→2→1を表示する。
function playCurrentQuestionAudioWithCountdown(question, questionIndex) {
  const settings = latestRoom.settings;
  // 【2026-11-XX追加・実機バグ調査：「もう一度聞く」を使うと問題無効になりやすい不具合】
  // 新しい1回の再生の試みが始まるたびに、ローカル回復の予算を必ずリセットする
  // （handlePlaybackFailure()のコメント参照）。
  hasAttemptedLocalRecoveryThisAttempt = false;
  if (isFirstQuestionOfMatch) {
    isFirstQuestionOfMatch = false;
    isCountdownActive = true;
    firstQuestionDelayTimerId = setTimeout(() => {
      firstQuestionDelayTimerId = null;
      isCountdownActive = false;
      playQuestionAudio(question, questionIndex, settings);
    }, SCREEN_ENTER_ANIMATION_MS);
    return;
  }
  isCountdownActive = true;
  runLocalReplayCountdownForQuestion({ containerElement: elements.countdown, numberElement: elements.countdownNumber, isFirstQuestion: false }, () => {
    isCountdownActive = false;
    playQuestionAudio(question, questionIndex, settings);
  });
}

// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】押した瞬間、連打防止の
// ため即座に自分のボタンを無効化する（他クライアントへの反映はホストのtick経由のため
// 最大で約400ms遅れるが、その間の連打・複数人のほぼ同時押しはFirebase側のwrite-once
// （reports/{questionIndex}/{attemptSlot}）が防ぐ）。古い問題番号・古い試合に対する
// 申告にならないよう、押した瞬間のqIndexをそのまま使う（他モードの
// promptAnswerConfirm呼び出しと同じ「クリック時点の状態を確認してから確定する」設計）。
function handleAudioTroubleButtonClick() {
  if (!elements.audioTroubleButton || elements.audioTroubleButton.disabled) return;
  if (!latestRoom || !currentMatchId) return;
  const match = latestRoom.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  if (typeof qIndex !== "number" || match.questionStatus !== QUESTION_STATUS.ACTIVE) return;
  const recovery = match.audioTroubleRecovery;
  if (isAudioTroubleRecoveryLocking({ recovery, questionIndex: qIndex })) return;

  const confirmed = window.confirm(
    "音が出ませんでしたか？\n\n「OK」を選ぶと、参加者全員に対してこの問題の音源を最初から再生し直します。少しの間、全員の回答操作が一時的にできなくなります。"
  );
  if (!confirmed) return;
  playSfx(SFX_EVENTS.UI_CONFIRM);

  elements.audioTroubleButton.disabled = true;
  // js/audio.js（第1段階でも使った共通基盤）へも申告を記録しておく（診断ログ用。
  // 挙動そのものはこの先すべてFirebase経由のaudioTroubleRecoveryで完結する）。
  reportPlaybackTrouble();
  const attemptSlot = computeNextReportAttemptSlot({ recovery, questionIndex: qIndex });
  reportAudioTroubleRecovery({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, attemptSlot }).catch(() => {});
}

// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】ホストが、音源トラブル
// 復旧の判定結果（js/audioTroubleRecovery.jsのcomputeAudioTroubleRecoveryAction()）に
// 従って実際にFirebaseへ書き込む。runHostProgressionTick()から呼ぶ。
async function applyAudioTroubleRecoveryAction(action, qIndex) {
  const roomId = latestRoom.roomId;
  const matchId = currentMatchId;
  if (action.type === "start-replay") {
    const result = await startAudioTroubleRecoveryReplay({
      roomId,
      matchId,
      questionIndex: qIndex,
      attemptCount: action.nextAttemptCount,
      reportedByUid: action.reportedByUid,
    });
    if (!result.ok) console.error("一瞬バトル：音源トラブル復旧（再生開始）に失敗しました", result.reason);
    return;
  }
  if (action.type === "finish-replay") {
    const result = await finishAudioTroubleRecoveryReplay({ roomId, matchId });
    if (!result.ok) console.error("一瞬バトル：音源トラブル復旧（再開）に失敗しました", result.reason);
    return;
  }
  if (action.type === "swap-reserve") {
    // 【本人指示：安全な回数を試みても改善しない場合】エラーメッセージを出さず、静かに
    // 予備の曲へ差し替える。既存の「音源再生失敗時の予備曲差し替え」機能
    // （js/instantBattleMatchProgress.jsのtick()・advanceToNextQuestion()、無効化＋
    // 予備曲への進行）をそのまま再利用する（新しい差し替えロジックを増やさない）。
    const failureResult = await reportInstantBattleAudioFailure({ roomId, matchId, questionIndex: qIndex });
    if (!failureResult.ok) console.error("一瞬バトル：音源トラブル復旧（予備曲差し替え申告）に失敗しました", failureResult.reason);
    const markResult = await markAudioTroubleRecoverySwapped({ roomId, matchId, swapCount: action.swapCount + 1 });
    if (!markResult.ok) console.error("一瞬バトル：音源トラブル復旧（差し替え記録）に失敗しました", markResult.reason);
    return;
  }
  if (action.type === "return-to-lobby") {
    // 【本人指示：予備曲への差し替えも失敗する場合】試合を安全に終了し、設定・参加者・
    // 曲選択を保持したまま全員をロビーへ戻す（既存のreturnRoomToLobby()を再利用。
    // 再戦準備フェーズ〈confirmingRematch/beginRematchReadyCheck()〉とは別の、
    // 単純な「ロビーへ戻す」処理）。この試合は勝敗・記録に一切残さない。
    const result = await returnRoomToLobby({ roomId });
    if (!result.ok) console.error("一瞬バトル：音源トラブル復旧（ロビーへ戻す）に失敗しました", result.reason);
  }
}

function reportMyQuestionActivity() {
  const match = latestRoom?.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  if (typeof qIndex !== "number" || !latestRoom) return;
  const now = Date.now();
  if (qIndex === lastActivityReportedQIndex && now - lastActivityReportedAtMs < ACTIVITY_REPORT_THROTTLE_MS) return;
  lastActivityReportedQIndex = qIndex;
  lastActivityReportedAtMs = now;
  reportQuestionActivity({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex });
}

function updateReplayButtonLabel() {
  const remaining = MAX_REPLAY_COUNT_PER_QUESTION - myReplayCountForCurrentQuestion;
  elements.replayButton.textContent = `🔁 もう一度聞く（残り${Math.max(0, remaining)}回）`;
  elements.replayButton.disabled = remaining <= 0;
}

function renderAnswerButtons(pool) {
  const filtered = filterAnswerPool(pool, answerBrowseState);
  elements.answerList.innerHTML = "";
  filtered.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button lyrics-quiz-answer-button";
    button.textContent = song.title;
    button.addEventListener("click", () => {
      // 確認モーダルを開くだけの軽い操作音（モーダル内の確定・キャンセルは
      // js/answerConfirmPrompt.js側で既に対応済みのため、ここでは重ねない）。
      playSfx(SFX_EVENTS.UI_CLICK);
      reportMyQuestionActivity();
      const matchAtClick = latestRoom?.matches?.[currentMatchId];
      const expectedQIndex = matchAtClick?.currentQuestionIndex;
      promptAnswerConfirm(song.title, () => {
        const matchAtConfirm = latestRoom?.matches?.[currentMatchId];
        if (matchAtConfirm?.currentQuestionIndex !== expectedQIndex) return;
        handleAnswerConfirmed(song.id);
      });
    });
    elements.answerList.appendChild(button);
  });
}

// 【本人指示13：回答確定後の完全ロック】確認を経て回答が確定した瞬間、選択の変更・検索・
// 50音ジャンプ・もう一度聞く・わからないの変更のすべてを不可能にする
// （renderCurrentQuestionState()側でmyAnsweredQuestionIndexを見て選択肢UI自体を隠すため、
// ここでは「二重送信の防止」と「送信」だけを担当する）。
async function handleAnswerConfirmed(selectedSongId) {
  attemptSilentUnlock();
  if (!latestRoom || !currentMatchId) return;
  const match = latestRoom.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  if (typeof qIndex !== "number") return;
  if (myAnsweredQuestionIndex === qIndex) return;

  const replayCount = myReplayCountForCurrentQuestion;
  // 【本人指示：前問／前試合フラッシュの全モード横断監査】この後のawaitの間に次の問題／
  // 次の試合へ進んでいた場合、送信失敗時のエラーメッセージが新しい画面に混ざらないよう、
  // 送信開始時点のmatchIdを覚えておく（js/onlineLyricsQuizBattleScreen.jsの
  // handleAnswerChoiceClick()・js/onlineInstantCoopBattleScreen.jsのhandleVoteClick()と
  // 同じ考え方）。
  const submittedMatchId = currentMatchId;
  myAnsweredQuestionIndex = qIndex;
  renderCurrentQuestionState();

  const result = await submitInstantAnswer({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, selectedSongId, replayCount });
  const isStaleQuestion =
    submittedMatchId !== currentMatchId ||
    latestRoom?.matches?.[currentMatchId]?.currentQuestionIndex !== qIndex;
  if (!result.ok && result.reason !== "already-answered" && !isStaleQuestion) {
    myAnsweredQuestionIndex = -1;
    elements.error.textContent = "回答の送信に失敗しました。もう一度お試しください。";
    elements.error.hidden = false;
    renderCurrentQuestionState();
  }
}

// 【本人指示12：回答内容は秘密のまま、状態だけを見せる】ルーム参加順（Object.keys()の
// 挿入順）で、名前と「回答済み／未回答」バッジだけを並べる。
function renderAnswerStatusList(match, qIndex) {
  if (!elements.answerStatusList) return;
  clearElement(elements.answerStatusList);
  const participants = match.participants ?? {};
  const answeredUids = new Set(Object.keys(match.instantAnswers?.[qIndex] ?? {}));
  const myUid = getCurrentUid();

  Object.entries(participants).forEach(([uid, participant]) => {
    const row = document.createElement("li");
    row.className = "online-instant-battle-answer-status-row";

    // 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-8/19-11章】以前は
    // .online-lobby-oshi-dot（CSS未定義＝実機では見えていなかった）で色ドットを
    // 描画していた。共通の参加者アイコンへ差し替える。ここは回答受付中に表示される
    // 一覧のため、タップでのプロフィール表示は付けない（対戦の公平性に影響する
    // 時間帯ではプロフィールを開けないようにする、という本人指示のため）。
    row.appendChild(buildParticipantIcon(participant.oshiMemberId, uid));
    const name = document.createElement("span");
    name.className = "online-instant-battle-answer-status-name";
    name.textContent = participant.displayName + (uid === myUid ? "（あなた）" : "");
    row.appendChild(name);

    const badge = document.createElement("span");
    const answered = answeredUids.has(uid);
    badge.className = `online-instant-battle-answer-status-badge${answered ? " is-answered" : ""}`;
    badge.textContent = answered ? "回答済み" : "未回答";
    row.appendChild(badge);

    elements.answerStatusList.appendChild(row);
  });
}

// 【本人指示18・19：5秒間の答え合わせ画面】参加者ごとに、回答・正誤・その問題で使った
// 再視聴回数を1行でコンパクトに見せる。同時に「running correct-count・running rank」
// （本人指示11）も、ここまでに確定した問題だけを使ってcomputeFinalResults()で再計算する
// （最終確定用のFirebase書き込みは行わない、表示専用の計算）。
function renderRevealPlayerList(match, qIndex, outcome) {
  if (!elements.revealPlayerList) return;
  clearElement(elements.revealPlayerList);
  const participants = match.participants ?? {};
  const myUid = getCurrentUid();
  const allPlayerUids = Object.keys(participants);
  const runningResults = computeFinalResults({ allPlayerUids, questionOutcomesByIndex: match.instantQuestionOutcomes });

  Object.entries(participants).forEach(([uid, participant]) => {
    const playerOutcome = outcome.perPlayerOutcome?.[uid];
    const row = document.createElement("li");
    row.className = "online-instant-battle-reveal-player-row";
    if (playerOutcome?.isCorrect) row.classList.add("is-correct");

    // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド3章】以前は答え合わせ
    // 画面でも名前タップでプロフィールを開けたが、「プロフィールはロビーでだけ開けるように
    // してほしい」との指示により開けなくする。共通の参加者アイコンは引き続き表示する。
    row.appendChild(buildParticipantIcon(participant.oshiMemberId, uid));
    const name = document.createElement("span");
    name.className = "online-instant-battle-reveal-player-name";
    name.textContent = participant.displayName + (uid === myUid ? "（あなた）" : "");
    row.appendChild(name);

    const answerText = document.createElement("span");
    answerText.className = "online-instant-battle-reveal-player-answer";
    if (!playerOutcome) {
      answerText.textContent = "－";
    } else if (playerOutcome.isUnknown) {
      answerText.textContent = "🤷 わからない";
    } else {
      const answeredSong = currentQuestions[qIndex]?.answerPool.find((song) => song.id === playerOutcome.selectedSongId);
      const mark = playerOutcome.isCorrect ? "🎉" : "✗";
      answerText.textContent = `${mark} ${answeredSong?.title ?? playerOutcome.selectedSongId}`;
    }
    row.appendChild(answerText);

    const metaText = document.createElement("span");
    metaText.className = "online-instant-battle-reveal-player-meta";
    const replayCount = playerOutcome?.replayCount ?? 0;
    const running = runningResults[uid];
    metaText.textContent = `再視聴${replayCount}回・通算${running?.correctCount ?? 0}問正解・${running ? `${running.rank}位` : "－"}`;
    row.appendChild(metaText);

    elements.revealPlayerList.appendChild(row);
  });
}

function renderCurrentQuestionState() {
  if (!latestRoom || currentQuestions.length === 0) return;
  const match = latestRoom.matches?.[currentMatchId];
  if (!match || typeof match.currentQuestionIndex !== "number") return;

  const qIndex = match.currentQuestionIndex;
  const question = currentQuestions[qIndex];
  if (!question) return;

  const myUid = getCurrentUid();
  const myForcedSkip = match.forcedSkips?.[qIndex]?.[myUid] === true;
  if (myForcedSkip && myAnsweredQuestionIndex !== qIndex) {
    myAnsweredQuestionIndex = qIndex;
  }

  // 【2026-11-XX追加・本人指示：最優先3・今遊んでいるモードが分かるように】新しいDOM要素を
  // 増やさず、既存の進捗表示にモード名を添えるだけの最小変更にする（本人指示：「巨大な
  // ヘッダーを増やして回答領域を狭めないでください」）。
  elements.progress.textContent = `一瞬バトル・第${qIndex + 1}問 / ${targetQuestionCount}問`;

  // 新しい問題を検知したら、音源を再生し直し、ローカルな回答状態をリセットする。
  if (qIndex !== lastPlayedQuestionIndex) {
    lastPlayedQuestionIndex = qIndex;
    myReplayCountForCurrentQuestion = 0;
    elements.error.hidden = true;
    // 【2026-09-26追加・本人指示：前問題フラッシュ対策の保険】この下のisResolved再計算
    // （975行目付近）は、この関数の後半でしか行われない。新しい問題を検知した瞬間にも
    // 前問の答え合わせカードを同期的に隠しておく（js/onlineLyricsQuizBattleScreen.jsの
    // renderCurrentQuestionState()の同種の保険と同じ考え方）。
    elements.revealSection.hidden = true;
    // 【2026-09-30追加・本人指示：オンライン対戦総合改修 第2ラウンド16章】新しい問題に
    // 切り替わったら、前問の「続き」楽曲が鳴り続けないよう必ず止める（通常は
    // remainingMsSec経過後の自動停止で既に止まっているはずだが、js/onlineLyricsQuizBattleScreen.js
    // のstopRevealMusic()呼び出しと同じ考え方の保険）。
    stopAudio();
    playCurrentQuestionAudioWithCountdown(question, qIndex);
    updateReplayButtonLabel();
    resetAnswerPoolBrowseState(answerBrowseState);
    if (elements.answerSearchInput) elements.answerSearchInput.value = "";
    if (elements.answerList) elements.answerList.scrollTop = 0;
  }

  const isResolved = match.questionStatus === QUESTION_STATUS.RESOLVED;
  const hasAnsweredThisQuestion = myAnsweredQuestionIndex === qIndex;

  // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】音源トラブル復旧
  // （リカバリー再生）が進行中の間は、回答収集中と同じ扱いで全員の回答操作をロックする。
  const recovery = match.audioTroubleRecovery;
  const isRecoveryLocking = isAudioTroubleRecoveryLocking({ recovery, questionIndex: qIndex });
  if (isRecoveryLocking) {
    // 新しいリカバリー再生（questionIndex・attemptCountの組み合わせ）を検知したら、
    // 全クライアントで同じタイミングで曲を頭から再生し直す。既存の「もう一度聞く」の
    // カウンター（myReplayCountForCurrentQuestion）には一切数えない（別の呼び出し経路）。
    const recoveryKey = `${qIndex}:${recovery.attemptCount}`;
    if (recoveryKey !== lastAppliedAudioTroubleRecoveryKey) {
      lastAppliedAudioTroubleRecoveryKey = recoveryKey;
      playCurrentQuestionAudioWithCountdown(question, qIndex);
    }
  }

  elements.answerSection.hidden = isResolved || hasAnsweredThisQuestion || isRecoveryLocking;
  const waitingSectionElement = elements.waitingSection;
  if (waitingSectionElement) waitingSectionElement.hidden = isResolved || !hasAnsweredThisQuestion || isRecoveryLocking;
  elements.revealSection.hidden = !isResolved;
  // 【2026-09-15修正・本人指示：ChatGPTと確定済みの仕様に合わせる】「もう一度聞く」は
  // 残り0回になっても、回答確定後も、ボタン自体は消さずdisabledのまま表示し続ける
  // （本人指示：突然ボタンが消えるより「残り0回」の表示のまま押せなくすることで、
  // 3回使い切ったことが分かりやすいため）。以前はhidden=trueにしてボタンごと消していたが、
  // 表示したままdisabledにするよう修正した。
  elements.replayButton.hidden = false;
  elements.replayButton.disabled =
    isResolved || hasAnsweredThisQuestion || isRecoveryLocking || myReplayCountForCurrentQuestion >= MAX_REPLAY_COUNT_PER_QUESTION;
  if (elements.rankHint) elements.rankHint.hidden = isResolved || hasAnsweredThisQuestion;

  // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】表示条件：回答収集中
  // だけ表示（カウントダウン中・答え合わせ中・結果画面・ロビーでは非表示）。誰かが処理を
  // 開始した瞬間、全クライアントでボタンを無効化する。
  if (elements.audioTroubleButton) {
    elements.audioTroubleButton.hidden = isResolved || isCountdownActive;
    elements.audioTroubleButton.disabled = isRecoveryLocking;
  }
  if (elements.audioTroubleNotice) {
    elements.audioTroubleNotice.hidden = !isRecoveryLocking;
  }

  if (!isResolved) {
    const isLargePool = question.answerPool.length >= LARGE_ANSWER_POOL_THRESHOLD;
    elements.answerSearchRow.hidden = !isLargePool;
    if (isLargePool) elements.answerCount.textContent = `${question.answerPool.length}曲`;
    if (elements.answerJumpBar) {
      elements.answerJumpBar.hidden = !isLargePool || hasAnsweredThisQuestion;
      if (isLargePool && !hasAnsweredThisQuestion) renderAnswerJumpBar(elements.answerJumpBar, answerBrowseState, () => renderAnswerButtons(question.answerPool));
    }
    if (!hasAnsweredThisQuestion) renderAnswerButtons(question.answerPool);
    elements.unknownButton.disabled = hasAnsweredThisQuestion || isRecoveryLocking;
    renderAnswerStatusList(match, qIndex);
  } else {
    const outcome = match.instantQuestionOutcomes?.[qIndex];
    if (outcome) {
      if (outcome.isVoid) {
        elements.revealCorrectSong.textContent = "";
        elements.revealOutcomeBadge.textContent = "🔇 この問題は無効です";
        elements.revealOutcomeBadge.classList.remove("is-correct-answer-reveal-status");
        if (elements.revealAudioFailureNotice) elements.revealAudioFailureNotice.hidden = false;
        clearElement(elements.revealPlayerList);
      } else {
        elements.revealCorrectSong.textContent = question.song.title;
        const myOutcome = outcome.perPlayerOutcome?.[myUid];
        elements.revealOutcomeBadge.textContent = myOutcome?.isCorrect ? "🎉 正解！" : "残念、不正解";
        elements.revealOutcomeBadge.classList.toggle("is-correct-answer-reveal-status", !!myOutcome?.isCorrect);
        if (elements.revealAudioFailureNotice) elements.revealAudioFailureNotice.hidden = true;
        renderRevealPlayerList(match, qIndex, outcome);
        // 【2026-09-26追加・本人指示：サウンドシステム全面整備7章】一瞬バトルは毎問の
        // 正解/不正解が完全に無音だった（本人指示の監査で発覚）。他モードと同じ
        // QUIZ_CORRECT/QUIZ_WRONGで統一する（1問につき1回だけ）。
        if (lastRevealSfxPlayedForQIndex !== qIndex) {
          lastRevealSfxPlayedForQIndex = qIndex;
          playSfx(myOutcome?.isCorrect ? SFX_EVENTS.QUIZ_CORRECT : SFX_EVENTS.QUIZ_WRONG);
          // 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド16章】
          // SFXと同じ「この問題では1回だけ」の瞬間に、問題の続きの楽曲を鳴らし始める
          // （本人指示18：全員の回答が揃うまでは絶対に鳴らさない＝isResolvedになった
          // このタイミングでしか呼ばない）。サーバー時刻基準のresolvedAtから残り時間を
          // 計算する（バックグラウンド復帰等で検知が遅れても正しく追従するため、
          // js/onlineLyricsQuizBattleScreen.jsの同種の対応と同じ考え方）。
          const remainingMsSec = computeRemainingRevealMs({
            revealDelayMs: REVEAL_DELAY_MS,
            resolvedAt: match.resolvedAt,
            serverTimeOffset,
            nowMs: Date.now(),
          });
          playRevealContinuationAudio(question, qIndex, latestRoom.settings, remainingMsSec);
        }
      }
    }
  }

  const nowServerTimeMs = Date.now() + serverTimeOffset;
  renderIdleNotice(match, qIndex, nowServerTimeMs);
}

// ===== 答え合わせ楽曲（続き再生）（2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド16-18章） =====
//
// 【仕様】答え表示が始まったら、問題で流れたのと同じ曲・同じ抽選結果（seed・songId・
// questionIndexから決まる開始位置）の「続き」から再生する。問題再生時間＋続きの再生時間＝
// 7秒（REVEAL_DELAY_MS）になるようにする（本人指示16）。曲の残りが足りない場合はループ・
// ジャンプせず、曲の実際の終わりで自然に鳴りやむ（本人指示17。js/audio.jsの
// playSongFromRandomPosition()は、指定秒数に達する前に曲が自然終了した場合はそのまま
// 止まるだけで、ループ・巻き戻しは一切行わない設計のため、この関数側で特別な処理は不要）。
//
// 【Q1無音バグの教訓を踏まえた安全設計】この楽曲はあくまで演出。再生に失敗しても
// 問題無効・対戦中止等、ゲーム進行には一切影響させない（onErrorはconsole.warnのみ）。
function playRevealContinuationAudio(question, questionIndex, settings, remainingMsSec) {
  if (remainingMsSec <= 0) return; // 復帰があまりに遅く、既に答え表示が終わっている場合は鳴らさない
  const playDurationSec = Number(settings.playDurationValue);
  const fixedDurationSec = AUDIO_METADATA[question.song.id]?.durationSec ?? null;
  if (fixedDurationSec === null) return;
  const computeContinuationStartTimeSec = (actualDurationSec) => {
    const canonicalQuestionStartSec = computeRandomStartTimeSec({
      seed: latestRoom.seed,
      songId: question.song.id,
      questionIndex,
      durationSec: fixedDurationSec,
      playDurationSec,
    });
    const clampedQuestionStartSec = clampStartTimeToActualDuration(canonicalQuestionStartSec, actualDurationSec);
    // revealContinuationStart = songStartSec + questionPlaybackDuration（本人指示16の式そのもの）。
    return clampedQuestionStartSec + playDurationSec;
  };
  playSongFromRandomPosition(
    question.song,
    computeContinuationStartTimeSec,
    remainingMsSec / 1000,
    (message) =>
      console.warn("[一瞬バトル] 答え合わせ楽曲（続き）の再生に失敗しました（演出のみのため対戦の進行には影響しません）", message),
    () => {},
    () => {}
  );
}

// 【3分無操作の放置救済】js/onlineInstantCoopBattleScreen.jsのrenderIdleNotice()と同じ設計。
function renderIdleNotice(match, qIndex, nowServerTimeMs) {
  const isHost = latestRoom && getCurrentUid() === latestRoom.host;
  if (!elements.idleNotice) return;
  if (!isHost) {
    elements.idleNotice.hidden = true;
    return;
  }
  const participantUids = Object.keys(match.participants ?? {});
  const answeredUids = new Set(Object.keys(match.instantAnswers?.[qIndex] ?? {}));
  const forcedSkipUids = new Set(Object.keys(match.forcedSkips?.[qIndex] ?? {}));
  const idleUids = participantUids.filter((uid) => {
    if (answeredUids.has(uid) || forcedSkipUids.has(uid)) return false;
    const lastActivity = match.questionActivity?.[qIndex]?.[uid] ?? match.currentQuestionStartedAt ?? nowServerTimeMs;
    return nowServerTimeMs - lastActivity >= IDLE_RESCUE_THRESHOLD_MS;
  });

  clearElement(elements.idleNotice);
  elements.idleNotice.hidden = idleUids.length === 0;
  idleUids.forEach((uid) => {
    const displayName = match.participants?.[uid]?.displayName ?? uid;
    const row = document.createElement("div");
    row.className = "online-lyrics-battle-idle-notice-row";
    const text = document.createElement("span");
    text.className = "online-lyrics-battle-idle-notice-text";
    text.textContent = `${displayName}さんが3分間操作していません`;
    row.appendChild(text);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button online-lyrics-battle-idle-notice-button";
    button.textContent = "わからない扱いにする";
    button.addEventListener("click", () => {
      // 3分無操作の参加者を「わからない」扱いにする操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      button.disabled = true;
      forceSkipIdlePlayer({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, targetUid: uid });
    });
    row.appendChild(button);
    elements.idleNotice.appendChild(row);
  });
}

// ===== 結果画面（個人の順位） =====

// 【本人指示19・実機フィードバック項25-26】1行の長文だった各プレイヤーの成績を、
// 短いラベル＋太字の数字の「チップ」を並べたカード形式に組み替える。
// 【本人指示19：順位に使う値と、それ以外の参考記録をはっきり区別する】
// 「正解数」「正解した問題での再視聴合計」の2つだけが順位判定の基準
// （js/instantBattleMatchProgress.jsのcompareInstantBattlePlayerResults()参照）。
// この2つは大きめ・太字で強調し、参考記録（総再視聴・不正解・わからない）はそれより
// 控えめなサイズで区別する（数値である以上、薄すぎる文字にはせず「濃い色」は保つ）。
function buildResultStatChip(className, icon, value, label) {
  const chip = document.createElement("div");
  chip.className = `online-instant-battle-result-stat-chip ${className}`;
  const iconSpan = document.createElement("span");
  iconSpan.className = "online-instant-battle-result-stat-icon";
  iconSpan.textContent = icon;
  chip.appendChild(iconSpan);
  const valueSpan = document.createElement("span");
  valueSpan.className = "online-instant-battle-result-stat-value";
  valueSpan.textContent = String(value);
  chip.appendChild(valueSpan);
  const labelSpan = document.createElement("span");
  labelSpan.className = "online-instant-battle-result-stat-label";
  labelSpan.textContent = label;
  chip.appendChild(labelSpan);
  return chip;
}

function buildResultStatCard(result) {
  const card = document.createElement("div");
  card.className = "online-instant-battle-result-stat-card";

  const primaryRow = document.createElement("div");
  primaryRow.className = "online-instant-battle-result-stat-row is-primary";
  primaryRow.appendChild(buildResultStatChip("is-correct-count", "⭕", result.correctCount, "正解"));
  primaryRow.appendChild(buildResultStatChip("is-replay-count", "🔁", result.correctOnlyReplaySum, "正解時の再視聴"));
  card.appendChild(primaryRow);

  const referenceRow = document.createElement("div");
  referenceRow.className = "online-instant-battle-result-stat-row is-reference";
  referenceRow.appendChild(buildResultStatChip("is-wrong-count", "❌", result.wrongCount, "不正解"));
  referenceRow.appendChild(buildResultStatChip("is-dontknow-count", "❓", result.dontKnowCount, "わからない"));
  card.appendChild(referenceRow);

  const footnote = document.createElement("p");
  footnote.className = "online-instant-battle-result-stat-footnote";
  footnote.textContent = `参考：総再視聴${result.totalReplayCount}回`;
  card.appendChild(footnote);

  return card;
}

export function syncInstantBattleResultHostGuestButtons(room) {
  if (document.body.dataset.screen !== "onlineInstantBattleResult") return;
  const isHostOnResultScreen = room.host === getCurrentUid();
  // 【2026-11-XX修正】js/onlineBattleScreen.jsのsyncResultScreenHostGuestButtons()と
  // 同じ修正・同じ理由（再戦提案中も最初のボタンが残り続けて二重表示になっていた）。
  elements.resultHostActions.hidden = !isHostOnResultScreen || room.confirmingRematch === true;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
}

// 【2026-10-01新設・本人指示：結果画面/再戦フロー全面設計】全員準備OK後、2秒待ってから
// 実際に再戦を開始する処理。js/onlineBattleScreen.jsのdriveRematchReadyAutoStart()と
// 全く同じ考え方だが、タイマー変数はこのファイル専用。
let instantBattleRematchAutoStartTimerId = null;
const REMATCH_AUTO_START_DELAY_MS = 2000;
function driveInstantBattleRematchReadyAutoStart(room) {
  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const players = room.players || {};
  const allReady = computeAllPlayersRematchReady(players, room.rematchParticipantUids);

  if (isHost && allReady && instantBattleRematchAutoStartTimerId === null) {
    const roomId = room.roomId;
    instantBattleRematchAutoStartTimerId = setTimeout(async () => {
      instantBattleRematchAutoStartTimerId = null;
      const latest = latestRoom;
      if (!latest || latest.roomId !== roomId || latest.confirmingRematch !== true) return;
      if (!computeAllPlayersRematchReady(latest.players, latest.rematchParticipantUids)) return;
      attemptSilentUnlock();
      await finishRematchReadyCheck({ roomId });
    }, REMATCH_AUTO_START_DELAY_MS);
  } else if (!allReady && instantBattleRematchAutoStartTimerId !== null) {
    clearTimeout(instantBattleRematchAutoStartTimerId);
    instantBattleRematchAutoStartTimerId = null;
  }
}

const handleInstantBattleRematchKickClick = createRematchKickHandler({
  getRoomId: () => latestRoom?.roomId ?? null,
  kickPlayerFn: kickPlayer,
  playConfirmSfx: () => playSfx(SFX_EVENTS.UI_CONFIRM),
});

// 【2026-09-30新設→2026-10-01全面改訂・本人指示：結果画面/再戦フロー全面設計】
// js/onlineBattleScreen.jsのrenderResultReturnPanel()と全く同じ考え方。
function renderInstantBattleResultReturnPanel(room) {
  const match = room.matches?.[room.activeMatchId] ?? {};
  const participants = match.participants || {};
  const players = room.players || {};
  const myUid = getCurrentUid();
  const isHostOnResultScreen = room.host === myUid;

  renderResultReturnStatusList(elements.resultReturnStatusList, participants, players, myUid);

  const isConfirmingRematch = room.confirmingRematch === true;
  if (elements.resultRematchPanel) {
    elements.resultRematchPanel.hidden = !isConfirmingRematch;
  }
  if (isConfirmingRematch) {
    if (elements.resultRematchPanelLead) {
      elements.resultRematchPanelLead.textContent = isHostOnResultScreen
        ? "再戦を準備中です。全員の準備が揃うと自動的に始まります。"
        : "ホストが「もう一度」を選びました。準備ができたら「準備OK」を押してください。";
    }
    // 【2026-11-XX追加・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
    // 「結果確認の状況」一覧には、この再戦の対象者だけを出す（新規参加者は出さない）。
    const rematchPlayers = filterPlayersForRematchParticipants(players, room.rematchParticipantUids);
    renderRematchReadinessList(elements.resultRematchPlayerList, rematchPlayers, myUid, isHostOnResultScreen);
    const allReady = computeAllPlayersRematchReady(players, room.rematchParticipantUids);
    const myReady = players[myUid]?.rematchReady === true;
    // 【2026-11-XX修正・実機バグ調査：再戦フロー】js/onlineBattleScreen.jsの通常モードでは
    // 既に対応済みだったホスト分岐が、このファイルには移植されておらず欠落していた。
    // resolveRematchToggleButtonLabel()（js/onlineBattleMatchConfirmationPayloads.js）へ
    // 共通化し、4画面が再び食い違うことを構造的に防ぐ。
    if (elements.resultRematchToggleButton) {
      const label = resolveRematchToggleButtonLabel({ isHost: isHostOnResultScreen, myReady });
      elements.resultRematchToggleButton.textContent = label.text;
      elements.resultRematchToggleButton.classList.toggle("is-confirmed", label.isConfirmed);
    }
    if (elements.resultRematchAllDoneNotice) {
      elements.resultRematchAllDoneNotice.hidden = !allReady;
    }
    driveInstantBattleRematchReadyAutoStart(room);
  }
}

function syncInstantBattleResultReturnPanel(room) {
  if (document.body.dataset.screen !== "onlineInstantBattleResult") return;
  renderInstantBattleResultReturnPanel(room);
}

export function enterInstantBattleResult(room) {
  // 【2026-11-XX追加・実機バグ調査：結果画面のスクロール位置】js/onlineBattleScreen.jsの
  // goToResultScreen()と同じ理由。結果画面へ入るたび必ず一番上から見せる。
  scrollToTop();
  latestRoom = room;
  stopAllLocalTimers();
  // 【2026-11-XX追加・実機バグ調査：push直前の最終二重レビューで発見】答え合わせ中に
  // 鳴らす「続きの楽曲」の読み込み・再生開始が遅れた場合、REVEAL_DELAY_MS経過での
  // 自動停止タイマーが実際の再生開始より先に空回りしてしまい、結果画面へ遷移した後も
  // 前の問題の音源が鳴り続けることがあった。stopAllLocalTimers()はタイマーしか止めない
  // ため、audio要素自体も確実に止める。
  stopAudio();
  // 【2026-09-30新設・本人指示】新しい結果画面に入るたび、まだ何も意思表示していない
  // 状態から始める。
  resetResultScreenResponded();
  elements.navigateTo("onlineInstantBattleResult");

  const match = room.matches?.[room.activeMatchId] ?? {};
  const participants = match.participants || {};
  const myUid = getCurrentUid();

  const isAudioFailureAborted = match.instantBattleAudioFailureAborted === true;
  if (elements.resultAudioFailureNotice) elements.resultAudioFailureNotice.hidden = !isAudioFailureAborted;
  if (elements.resultNormalContainer) elements.resultNormalContainer.hidden = isAudioFailureAborted;

  const isHostOnResultScreen = room.host === myUid;
  // 【2026-11-XX修正】js/onlineBattleScreen.jsのgoToResultScreen()と同じ理由の保険。
  elements.resultHostActions.hidden = !isHostOnResultScreen || room.confirmingRematch === true;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
  // 【2026-09-30新設】音源トラブルで中断した場合も、各自「ルーム設定に戻る」で個別に
  // 抜けられるようにする（下のisAudioFailureAborted早期returnより前に描画する）。
  renderInstantBattleResultReturnPanel(room);
  elements.resultRuleNote.textContent = instantBattleMode.getRuleDescription();

  if (isAudioFailureAborted) return;

  const resultsByUid = match.instantBattleResults ?? {};
  // 【2026-09-14追加・本人指示：対戦中のゲストが自分だけ途中離脱する】leftDuringMatchが
  // 立っている参加者は、途中まで得点していても正式な順位には含めない（js/onlineBattleScreen.js
  // のgoToResultScreen()と同じ考え方）。
  const rankedEntries = Object.entries(participants)
    .map(([uid, participant]) => ({
      uid,
      participant,
      result: resultsByUid[uid],
      isDnf: !resultsByUid[uid] || participant.leftDuringMatch === true,
    }))
    .sort((entryA, entryB) => {
      if (entryA.isDnf !== entryB.isDnf) return entryA.isDnf ? 1 : -1;
      if (entryA.isDnf) return 0;
      return entryA.result.rank - entryB.result.rank;
    });

  const medalByRank = { 1: "🥇", 2: "🥈", 3: "🥉" };
  clearElement(elements.resultList);
  rankedEntries.forEach((entry) => {
    const row = document.createElement("li");
    const rank = entry.isDnf ? null : entry.result.rank;
    const rankClass = rank === 1 ? " is-rank-1" : rank === 2 ? " is-rank-2" : rank === 3 ? " is-rank-3" : "";
    row.className = `battle-rank-row${rankClass}`;

    const medal = document.createElement("div");
    medal.className = "battle-rank-medal";
    medal.textContent = entry.isDnf ? "－" : (medalByRank[rank] ?? `${rank}位`);
    row.appendChild(medal);

    const info = document.createElement("div");
    info.className = "battle-rank-info";
    const nameRow = document.createElement("p");
    nameRow.className = "battle-rank-name";
    // 【2026-09-26改訂】以前は.online-lobby-oshi-dot（CSS未定義＝実機では見えていなかった）
    // で色ドットを描画していた。共通の参加者アイコン（推し色＋代表称号バッジ）へ差し替えた。
    // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド3章】結果画面の名前
    // タップでのプロフィール表示は、「ロビーでだけ開けるようにしてほしい」との指示により廃止する。
    nameRow.appendChild(buildParticipantIcon(entry.participant.oshiMemberId, entry.uid));
    const nameText = document.createElement("span");
    nameText.className = "battle-rank-name-text";
    nameText.textContent = entry.participant.displayName;
    nameRow.appendChild(nameText);
    if (entry.uid === myUid) {
      const meBadge = document.createElement("span");
      meBadge.className = "battle-rank-me-badge";
      meBadge.textContent = "あなた";
      nameRow.appendChild(meBadge);
    }
    info.appendChild(nameRow);

    if (entry.isDnf) {
      const meta = document.createElement("p");
      meta.className = "battle-rank-meta";
      meta.textContent = "途中離脱・記録なし";
      info.appendChild(meta);
    } else {
      // 【2026-09-16改訂・本人指示：実機フィードバック項25-26「結果画面の成績が
      // 1行の長い文章・細い文字で読みづらい」の修正】以前は
      // 「正解1問／正解した問題での再視聴0回（参考：総再視聴0回・不正解2・わからない0）」
      // のような1行の長文を薄い文字で表示していたが、短いラベル＋太字の数字を使った
      // カード形式（チップ）に作り替えた。ランキング計算のロジック（result.correctCount等の
      // 数値そのもの、js/instantBattleMatchProgress.jsのcomputeFinalResults()）は一切
      // 変更せず、表示だけを組み替えている。
      info.appendChild(buildResultStatCard(entry.result));
    }
    row.appendChild(info);

    elements.resultList.appendChild(row);
  });

  const myEntry = rankedEntries.find((entry) => entry.uid === myUid);
  if (myEntry && !myEntry.isDnf) {
    playSfx(myEntry.result.rank === 1 ? SFX_EVENTS.BATTLE_WIN : SFX_EVENTS.BATTLE_LOSE);
  }

  const questionBreakdown = buildInstantBattleQuestionBreakdown({
    questions: currentQuestions,
    instantQuestionOutcomes: match.instantQuestionOutcomes,
    participants,
    myUid,
  });
  if (elements.resultQuestionBreakdownSection) {
    elements.resultQuestionBreakdownSection.hidden = questionBreakdown.length === 0;
  }
  renderQuestionBreakdownAccordion(elements.resultQuestionBreakdown, questionBreakdown);

  if (myEntry && !myEntry.isDnf) {
    savePlayHistoryEntryIfNew({
      id: `online:${room.activeMatchId}`,
      playedAt: Date.now(),
      modeId: "onlineInstantBattle",
      modeLabel: "オンライン対戦（一瞬バトル）",
      questionCount: myEntry.result.totalQuestions,
      isAllSongsMode: !room.settings.questionSource || room.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS,
      correctCount: myEntry.result.correctCount,
      wrongCount: myEntry.result.wrongCount,
      skippedCount: myEntry.result.dontKnowCount,
      score: null,
      averageResponseMs: null,
      completed: true,
      details: {
        isDnf: false,
        myRank: myEntry.result.rank,
        correctOnlyReplaySum: myEntry.result.correctOnlyReplaySum,
        totalReplayCount: myEntry.result.totalReplayCount,
        participantCount: Object.keys(participants).length,
        questionBreakdown: capQuestionBreakdownForStorage(questionBreakdown),
      },
    });
  }
}
