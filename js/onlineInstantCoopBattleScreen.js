// オンライン対戦「一瞬協力」専用の画面コントローラ（2026-08-31新設、本人指示：19-3章）。
//
// 【なぜjs/onlineBattleScreen.jsと分けたか】js/onlineLyricsQuizBattleScreen.jsと同じ理由。
// 一瞬協力は「全員が同じ音源を同時に聞き、多数決でチームの回答を決める」という、ホスト主導の
// 同期進行が必要（各自が自分のペースで進む一瞬バトル・タイムアタック等とは根本的に違う）。
// 進行ロジック自体はjs/instantCoopMatchProgress.js（Firebase不使用、恒久テスト済み）に
// 完全に切り出してあり、このファイルはそれをFirebase・画面へ結びつけるだけに専念する
// （js/onlineLyricsQuizBattleScreen.jsとjs/lyricsQuizMatchProgress.jsの関係と同じ設計）。
//
// 【依存の向き】このファイルはjs/onlineBattleScreen.jsを一切importしない（一方向の依存に
// 保つため）。「対戦をやめる」「ホームへ戻る」等の後片付けは、呼び出し元（js/main.js）が
// コールバックとして渡す。
//
// 【ホストが進行を主導する仕組み】ホストの端末だけが、js/instantCoopMatchProgress.jsを
// ローカルの「進行ミラー」として保持し、Firebaseから読んだ投票を取り込みながらtick()を回す。
// 終了条件（全員投票済み）を満たしたら、多数決→タイなら再視聴ラウンドへ、確定したら
// resolveCoopQuestion()を呼び、結果を少し見せてからadvanceCoopQuestion()（次の問題）か
// finalizeCoopMatch()（最終結果）を呼ぶ。参加者側の端末は、Firebaseから読んだ
// currentQuestionIndex・questionStatus・coopRoundNumberを見て自分の画面を描画するだけで、
// 進行の決定権は一切持たない（歌詞クイズ対戦と同じ役割分担）。
//
// 【既知の制約】ホストのリロード・再接続時は、js/instantCoopMatchProgress.jsの
// restoreMatchProgressFromFirebase()で進行ミラーを再構築する（歌詞クイズ対戦のPhase6.5と
// 同じ考え方）。ただしホストが完全に切断したまま誰も引き継がない間は、進行が一時的に
// 止まる（既存のホスト自動移譲〈js/onlineBattleScreen.js〉が新ホストを立てれば、
// 新ホストの端末がこのファイルへ再入場した時点で自動的に進行が再開する）。

import { getCurrentUid } from "./firebaseClient.js";
import {
  ROOM_STATUS,
  updateRoomSettings,
  subscribeServerTimeOffset,
  returnRoomToLobby,
  beginRematchReadyCheck,
} from "./onlineBattle.js";
import { promptReturnToLobby } from "./onlineBattleLobbyReturnPrompt.js";
import { promptLeaveMatch } from "./onlineBattleLeaveMatchPrompt.js";
import { promptResultLeaveRoom } from "./onlineBattleResultLeavePrompt.js";
import { promptAnswerConfirm } from "./answerConfirmPrompt.js";
import { validateRoomSettings } from "./battleModes/index.js";
import * as instantCoopBattleMode from "./battleModes/instantCoopBattleMode.js";
import {
  UNKNOWN_VOTE,
  MATCH_STATUS_ABORTED_AUDIO_FAILURE,
  createMatchProgress,
  recordVote,
  countVotedPlayers,
  tick,
  advanceToNextQuestion,
  finalizeMatch,
  restoreMatchProgressFromFirebase,
  describeCoopDecisionReason,
} from "./instantCoopMatchProgress.js";
import {
  QUESTION_STATUS,
  startCoopQuestion,
  submitCoopVote,
  resolveCoopQuestion,
  advanceCoopQuestion,
  finalizeCoopMatch,
  reportAudioFailure,
  abortCoopMatchDueToAudioFailure,
} from "./instantCoopBattleFirebase.js";
// 【2026-09-06新設・本人指示：3分無操作の放置救済を一瞬協力にも適用】forcedSkips・
// questionActivityのFirebaseパスはgameMode非依存の汎用フィールド（rooms/{roomId}/
// matches/{matchId}配下）として設計済みのため、歌詞クイズ対戦と全く同じ関数をそのまま
// 再利用する（新しいFirebase Rules・新しい書き込み関数は不要）。
import { reportQuestionActivity, forceSkipIdlePlayer } from "./lyricsQuizBattleFirebase.js";
// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】進行判定はFirebase不使用の
// 純粋関数（js/audioTroubleRecovery.js）に切り出し、一瞬バトル
// （js/onlineInstantBattleScreen.js）と全く同じロジック・全く同じFirebaseパス
// （js/audioTroubleRecoveryFirebase.js）を共有する。
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
import { playSongFromRandomPosition, stopAudio, attemptSilentUnlock, reportPlaybackTrouble } from "./audio.js";
// 【2026-09-26新設・本人指示：オンライン対戦総合改修19-18章】js/onlineInstantBattleScreen.js
// と同じ理由で、既存の診断ログ基盤を再利用する。
import { recordAudioDiagnostic } from "./audioDiagnosticLog.js";
import { LARGE_ANSWER_POOL_THRESHOLD } from "./lyricsQuizEngine.js";
import {
  createAnswerPoolBrowseState,
  resetAnswerPoolBrowseState,
  filterAnswerPool,
  renderAnswerJumpBar,
} from "./answerPoolBrowseUi.js";
import { QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { CATEGORY_LABELS, QUESTION_COUNT_LABELS } from "./localBattleScreen.js";
import { getMemberById } from "./memberUtils.js";
// 【2026-09-26新設・本人指示：オンライン対戦総合改修19-8/19-10章】共通の参加者アイコン
// （推し色＋代表称号バッジ）と、ロビーの参加者プロフィールモーダル（js/onlineBattleScreen.js）を
// 結果画面・回答状況一覧から再利用する。
import { buildParticipantIcon } from "./onlineParticipantIcon.js";
import { openLobbyParticipantProfile } from "./onlineBattleScreen.js";
import { MEMBERS } from "./data/members.js";
import { savePlayHistoryEntryIfNew } from "./playHistory.js";
import { buildInstantCoopQuestionBreakdown, capQuestionBreakdownForStorage } from "./battleQuestionBreakdown.js";
import { renderQuestionBreakdownAccordion } from "./battleQuestionBreakdownUi.js";

// ホストが結果を見せてから、次の問題／最終結果へ進むまでの待ち時間。
// 【2026-09-07改訂・本人指示：答え合わせ表示を4秒へ統一】js/onlineLyricsQuizBattleScreen.jsと
// 同じ理由（同票表示等、読む情報が増えたため）。
const REVEAL_DELAY_MS = 4000;
// ホストの進行判定を更新する間隔（js/onlineLyricsQuizBattleScreen.jsと同じ値・同じ理由）。
const HOST_TICK_INTERVAL_MS = 400;
// 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】このモードはホスト主導の
// 同期進行のため、js/instantChallengeScreen.js・js/onlineInstantBattleScreen.jsの
// 「自分の問題スロットだけ差し替える」個人進行型の設計は使えない（全員が同じ問題を
// 同時に見ているため）。誰か1人でも再生失敗を報告したら、その問題を全員一律で無効にし、
// 予備曲へ進む（js/instantCoopMatchProgress.jsのtick/advanceToNextQuestionが実処理を担う）。
const AUDIO_FAILURE_RESERVE_SIZE = 3;

let elements = null;

let latestRoom = null;
let currentMatchId = null;
let currentQuestions = [];
let currentSettings = null;
let targetQuestionCount = 0;

let hostState = null;
let hostTickInFlight = false;
let resolvedAtLocalMs = null;
let tickTimerId = null;
let offsetUnsubscribe = null;
// 【2026-09-06新設・3分無操作の放置救済】ホストが「3分間操作していない」かどうかを
// 判定する際、サーバー時刻との差分を考慮する（js/onlineLyricsQuizBattleScreen.jsと同じ設計）。
let serverTimeOffset = 0;

// 自分（この端末）が、今の問題・今のラウンドで既に投票したかどうか。
let myVotedQuestionIndex = -1;
let myVotedRoundNumber = -1;
// 直近に描画した問題・ラウンド（変わった瞬間だけ音源を再生し直すために使う）。
let lastPlayedQuestionIndex = -1;
let lastPlayedRoundNumber = -1;

// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】直近にローカル再生を
// 反応させたリカバリー再生を覚えておく（js/onlineInstantBattleScreen.jsと同じ設計）。
let lastAppliedAudioTroubleRecoveryKey = null;

// 【2026-09-06新設・3分無操作の放置救済】自分の活動報告（reportQuestionActivity()）を
// 直近いつ送ったか（js/onlineLyricsQuizBattleScreen.jsと同じ間引き設計）。
let lastActivityReportedAtMs = 0;
let lastActivityReportedQIndex = -1;

// 【2026-09-09新設・本人指示4：通信切断時の自動復帰待ち→離脱処理】
// js/onlineLyricsQuizBattleScreen.jsの同じ仕組みと同じ設計・同じ値。
const disconnectedSinceMsByUid = new Map();
const DISCONNECT_AUTO_SKIP_MS = 20000;
const ACTIVITY_REPORT_THROTTLE_MS = 15000;

// 【2026-09-07新設・本人指示：50音UIの共通展開】
const answerBrowseState = createAnswerPoolBrowseState();

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function resolveOshiColor(oshiMemberId) {
  const member = oshiMemberId ? getMemberById(MEMBERS, oshiMemberId) : null;
  return member?.memberColor?.hex ?? null;
}

// ===== 初期化 =====

export function initOnlineInstantCoopBattleScreens(newElements) {
  elements = newElements;

  document.querySelectorAll('input[name="online-instant-coop-settings-question-count"]').forEach((radio) => {
    radio.addEventListener("change", () => applySettingsChangeFromForm());
  });
  document.querySelectorAll('input[name="online-instant-coop-settings-play-duration"]').forEach((radio) => {
    radio.addEventListener("change", () => applySettingsChangeFromForm());
  });
  document.querySelectorAll('input[name="online-instant-coop-settings-answer-pool-size"]').forEach((radio) => {
    radio.addEventListener("change", () => applySettingsChangeFromForm());
  });
  document.querySelectorAll('input[name="online-instant-coop-settings-category"]').forEach((radio) => {
    radio.addEventListener("change", () => applySettingsChangeFromForm());
  });

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

  // 【2026-09-06新設・3分無操作の放置救済】検索結果一覧をスクロールする操作も、
  // 「考えている最中」の意味ある操作の一つとして扱う（js/onlineLyricsQuizBattleScreen.jsと
  // 同じ考え方）。
  elements.answerList?.addEventListener("scroll", () => {
    reportMyQuestionActivity();
  });

  // 【2026-09-15追加・本人指示：「わからない」確認ダイアログを全対象モードへ展開】
  // 一瞬バトルの新規わからないボタンと同じく、誤タップ防止のため確認を必ず挟む。
  // 曲の回答ボタンと全く同じ「確認画面を開いた時点のquestionIndex・roundNumberが、
  // 確定を押した時点でも一致しているか」の再確認ガードも揃える。
  elements.unknownButton.addEventListener("click", () => {
    reportMyQuestionActivity();
    const matchAtClick = latestRoom?.matches?.[currentMatchId];
    const expectedQIndex = matchAtClick?.currentQuestionIndex;
    const expectedRoundNumber = matchAtClick?.coopRoundNumber ?? 0;
    promptAnswerConfirm("わからない", () => {
      const matchAtConfirm = latestRoom?.matches?.[currentMatchId];
      const currentQIndex = matchAtConfirm?.currentQuestionIndex;
      const currentRoundNumber = matchAtConfirm?.coopRoundNumber ?? 0;
      if (currentQIndex !== expectedQIndex || currentRoundNumber !== expectedRoundNumber) return;
      handleVoteClick(UNKNOWN_VOTE);
    });
  });

  // 【2026-09-05新設、本人指示】共有再視聴（最大2回）方式を廃止し、各自が個別に
  // 無制限で再視聴できるボタンへ変更した。Firebaseへは一切同期しない、完全に
  // ローカルな再生のやり直し（disabledの制御はrenderCurrentQuestionState()側で行う）。
  elements.replayButton?.addEventListener("click", () => {
    if (!latestRoom || !currentMatchId) return;
    const match = latestRoom.matches?.[currentMatchId];
    if (!match || typeof match.currentQuestionIndex !== "number") return;
    const qIndex = match.currentQuestionIndex;
    const question = currentQuestions[qIndex];
    reportMyQuestionActivity();
    if (!question) return;
    playQuestionAudio(question, qIndex);
  });

  // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】1人が押すと、参加者
  // 全員に対して今の問題の音源を頭から同じタイミングで再生し直す（js/onlineInstantBattleScreen.js
  // と全く同じ考え方・全く同じFirebaseパスを共有する）。
  elements.audioTroubleButton?.addEventListener("click", () => {
    handleAudioTroubleButtonClick();
  });

  elements.quitButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = false;
  });
  elements.quitCancelButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = true;
  });
  elements.quitConfirmButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = true;
    stopAllLocalTimers();
    stopAudio();
    elements.onQuitDuringBattle();
    elements.navigateTo("onlineBattleEntry");
  });

  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  elements.backToLobbyButton?.addEventListener("click", () => {
    promptReturnToLobby(latestRoom?.roomId);
  });

  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】
  elements.leaveMatchButton?.addEventListener("click", () => {
    const roomId = latestRoom?.roomId;
    const matchId = currentMatchId;
    if (!roomId || !matchId) return;
    promptLeaveMatch(roomId, matchId, () => {
      saveVoluntaryLeaveInstantCoopHistoryEntry();
      resetInstantCoopBattleState();
      elements.navigateTo("onlineBattleLobby");
    });
  });

  elements.resultHomeLink.addEventListener("click", () => {
    stopAllLocalTimers();
    elements.onLeaveResultToHome();
    elements.navigateTo("start");
  });
  // 【2026-09-07新設・本人指示：ルームから退出＝完全離脱】js/onlineBattleScreen.jsの
  // 同じボタンと同じ考え方。実処理はonLeaveRoomCompletely()経由で
  // leaveOnlineBattleRoomCompletely()（あちらに集約）を呼ぶ。
  // 【2026-09-15改訂・本人指示：ゲスト側の退出操作にも必ず確認ダイアログ】
  elements.resultLeaveButton?.addEventListener("click", () => {
    promptResultLeaveRoom(async () => {
      stopAllLocalTimers();
      elements.resultLeaveButton.disabled = true;
      await elements.onLeaveRoomCompletely();
      elements.resultLeaveButton.disabled = false;
      elements.navigateTo("start");
    });
  });
  // 【2026-09-05改訂、本人指示】試合後の選択肢を「もう一度」「ルーム設定に戻る」の
  // 2つ（ホスト専用）へ統一。
  // 【再戦準備フェーズ新設・本人指示】以前は「もう一度」を確認モーダルを挟まず即座に
  // 実行していたが、今はbeginRematchReadyCheck()を呼び、全員が「準備OK」を押すのを待つ
  // 準備フェーズへ進む（js/onlineBattleScreen.jsのrenderRematchReadyScreen()参照）。
  elements.resultRematchButton.addEventListener("click", async () => {
    if (!latestRoom) return;
    // 【2026-09-09新設・本人指示：音源再生失敗の本対策】このモードは音源再生を伴い、
    // かつ全員同期で自動再生されるため、開始直前の確実なユーザージェスチャーの中で
    // 改めてunlockしておく価値が特に高い。
    attemptSilentUnlock();
    elements.resultRematchButton.disabled = true;
    await beginRematchReadyCheck({ roomId: latestRoom.roomId });
    elements.resultRematchButton.disabled = false;
  });
  elements.resultBackToLobbyButton.addEventListener("click", async () => {
    if (!latestRoom) return;
    elements.resultBackToLobbyButton.disabled = true;
    await returnRoomToLobby({ roomId: latestRoom.roomId });
    elements.resultBackToLobbyButton.disabled = false;
  });
}

function stopAllLocalTimers() {
  stopTickTimer();
  stopServerTimeOffsetTracking();
}

// 【2026-09-15新設・本人指示：プレイ履歴へ「途中退出」を保存する】途中離脱ボタンが
// 確定した瞬間（resetInstantCoopBattleState()でlatestRoom等が消える前）に呼ぶ。
// このモードはチーム制のため個人の貢献は分からないが、match.coopQuestionOutcomes
// （ホストが各問題の正誤をFirebaseへ確定させたもの）から「チームとしてここまで何問中
// 何問正解したか」は復元できる（isVoid＝音源再生失敗等で無効になった問題は除外する、
// 既存の完走時保存と同じ考え方）。
function saveVoluntaryLeaveInstantCoopHistoryEntry() {
  if (!currentMatchId || !latestRoom) return;
  const match = latestRoom.matches?.[currentMatchId];
  const outcomes = Object.values(match?.coopQuestionOutcomes ?? {}).filter((outcome) => !outcome.isVoid);
  const correctCount = outcomes.filter((outcome) => outcome.isCorrect).length;
  const participants = match?.participants ?? {};

  savePlayHistoryEntryIfNew({
    id: `online-coop:${currentMatchId}`,
    playedAt: Date.now(),
    modeId: "onlineInstantCoop",
    modeLabel: "オンライン対戦（一瞬協力）",
    questionCount: outcomes.length,
    isAllSongsMode:
      !latestRoom.settings.questionSource || latestRoom.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS,
    correctCount,
    wrongCount: outcomes.length - correctCount,
    skippedCount: null,
    score: null,
    averageResponseMs: null,
    completed: false,
    details: {
      isVoluntaryLeave: true,
      isDnf: false,
      myRank: null,
      memberCount: Object.keys(participants).length,
    },
  });
}

export function resetInstantCoopBattleState() {
  stopAllLocalTimers();
  stopAudio();
  latestRoom = null;
  currentMatchId = null;
  currentQuestions = [];
  currentSettings = null;
  hostState = null;
  hostTickInFlight = false;
  resolvedAtLocalMs = null;
  myVotedQuestionIndex = -1;
  myVotedRoundNumber = -1;
  lastPlayedQuestionIndex = -1;
  lastPlayedRoundNumber = -1;
  lastAppliedAudioTroubleRecoveryKey = null;
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;
  disconnectedSinceMsByUid.clear();
}

// js/onlineBattleScreen.jsのrenderLobby()が、room更新のたび（画面を問わず）呼ぶフック。
export function handleInstantCoopRoomUpdate(room) {
  latestRoom = room;
  // 【2026-09-15追加・本人指示：前試合の答え合わせが次試合の開始演出に一瞬表示される
  // バグの全モード横断監査で発見】js/onlineLyricsQuizBattleScreen.jsのhandleLyricsQuizRoomUpdate()
  // で見つかったのと全く同じ設計の抜け（「もう一度」で新しい試合(room.activeMatchId)が
  // 始まっても、この端末のローカルなcurrentMatchId・hostStateは、goToCountdownScreen()側の
  // setTimeout待ちが終わってenterInstantCoopBattlePlay()が呼ばれるまで、まだ前の試合の値の
  // まま残る）が、一瞬協力にも同じ設計のため同じ形で存在していた。room.activeMatchIdと
  // currentMatchIdが一致しない間は、前試合のmatches/{currentMatchId}に対する進行判定・
  // Firebase書き込みを行ってしまわないよう、ここで確実に素通りさせる。
  if (currentMatchId && room.activeMatchId !== currentMatchId) return;
  if (getCurrentUid() === room.host && room.status === ROOM_STATUS.PLAYING) {
    // 【2026-09-12追加・本人指示9「ホスト切断・引き継ぎも最終確認」で発見し修正】
    // 対戦の途中でホストが切断→自動移譲され、自分が新しくホストになった場合、
    // enterInstantCoopBattlePlay()を非ホストとして通過した際はhostStateを一度も
    // 初期化していないため、このままrunHostProgressionTick()を呼んでもhostStateが
    // nullのまま何もせず戻り、対戦の進行が永久に止まってしまう（コード調査で発見した
    // 実在するバグ。実機検証は別途必要）。再接続時と全く同じrestoreMatchProgressFromFirebase()
    // で、Firebase上の実際の進行状況からhostStateを組み立て直す。currentQuestions・
    // currentMatchId・targetQuestionCountは、非ホストとして入場した時点で既に設定済みのため
    // 新規に用意する必要はない。
    if (!hostState && currentMatchId && currentQuestions.length > 0) {
      const match = room.matches?.[currentMatchId];
      if (match && typeof match.currentQuestionIndex === "number") {
        const participantUids = Object.keys(match.participants ?? {});
        hostState = restoreMatchProgressFromFirebase({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: getCurrentUid(),
          seed: room.seed,
          match,
          nowMs: Date.now(),
          targetQuestionCount,
        });
        if (hostState.currentQuestion.status === "resolved") {
          resolvedAtLocalMs = Date.now();
        }
      }
    }
    runHostProgressionTick();
  }
  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  // このモードは継続的にroom更新を受け取るため、ホスト交代が起きても正しく追随する。
  const isHostNowCoop = room.host === getCurrentUid();
  if (elements?.backToLobbyButton) {
    elements.backToLobbyButton.hidden = !isHostNowCoop;
  }
  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】
  if (elements?.leaveMatchButton) {
    elements.leaveMatchButton.hidden = isHostNowCoop;
  }
  if (document.body.dataset.screen === "onlineInstantCoopBattleQuestion") {
    renderCurrentQuestionState();
  }
}

// ===== ロビー：対戦設定 =====

// 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-3章】js/onlineBattleScreen.jsの
// applyHostSettingsChangeFromForm()と同じ理由で、検証エラー時もFirebaseへの書き込み自体は
// 必ず行う（曲数不足等で「開始できない」ことと「設定として保存できない」ことを区別する。
// 開始条件はstartBattle()側が別途守る）。
async function applySettingsChangeFromForm() {
  if (!latestRoom) return;
  const settings = readSettingsFromHostForm();
  const errorMessage = validateRoomSettings(latestRoom.gameMode, settings);
  elements.settingsError.textContent = errorMessage ?? "";
  elements.settingsError.hidden = !errorMessage;
  await updateRoomSettings({ roomId: latestRoom.roomId, settings });
}

function setChecked(name, value) {
  const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (input) input.checked = true;
}

function readSettingsFromHostForm() {
  return {
    questionCountValue: document.querySelector('input[name="online-instant-coop-settings-question-count"]:checked').value,
    playDurationValue: document.querySelector('input[name="online-instant-coop-settings-play-duration"]:checked').value,
    answerPoolSizeValue: document.querySelector('input[name="online-instant-coop-settings-answer-pool-size"]:checked').value,
    categoryFilterValue: document.querySelector('input[name="online-instant-coop-settings-category"]:checked').value,
  };
}

function applySettingsToHostForm(settings) {
  setChecked("online-instant-coop-settings-question-count", settings.questionCountValue);
  setChecked("online-instant-coop-settings-play-duration", settings.playDurationValue);
  setChecked("online-instant-coop-settings-answer-pool-size", settings.answerPoolSizeValue);
  setChecked("online-instant-coop-settings-category", settings.categoryFilterValue);
}

// 【再戦準備フェーズ新設・本人指示】チップ文字列の組み立てだけを行う純粋関数として
// 切り出した（DOM操作を含まない）。renderParticipantSettingsChips()（ロビーの参加者向け
// 設定サマリー）に加え、js/onlineBattleScreen.jsの再戦準備フェーズ画面
// （renderRematchSummaryChips()）でも「今回の設定の簡単な要約」として再利用する。
export function buildInstantCoopSettingsSummaryChips(settings) {
  return [
    "一瞬協力",
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? `${settings.questionCountValue}問`,
    CATEGORY_LABELS[settings.categoryFilterValue] ?? settings.categoryFilterValue,
    `再生${settings.playDurationValue}秒`,
    settings.answerPoolSizeValue === "all" ? "全曲検索" : `${settings.answerPoolSizeValue}択`,
  ];
}

function renderParticipantSettingsChips(settings) {
  clearElement(elements.settingsSummaryContainer);
  buildInstantCoopSettingsSummaryChips(settings).forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    elements.settingsSummaryContainer.appendChild(chip);
  });
}

// js/onlineBattleScreen.jsのrenderLobby()から、ホスト/参加者どちらの視点かとともに呼ばれる。
export function renderInstantCoopLobbySettings(room, isHost) {
  latestRoom = room;
  currentSettings = room.settings;
  elements.lobbySettingsHost.hidden = !isHost;
  elements.lobbySettingsParticipant.hidden = isHost;
  if (isHost) {
    applySettingsToHostForm(room.settings);
  } else {
    renderParticipantSettingsChips(room.settings);
  }
}

// ===== 対戦中：入場 =====

export async function enterInstantCoopBattlePlay(room) {
  // 【本人指示に基づく回帰調査で発見・修正】js/onlineBattleScreen.jsのgoToCountdownScreen()は、
  // カウントダウン開始時点のroomオブジェクトをクロージャに閉じ込め、ローカルの3-2-1タイマーが
  // 0になった500ms後に setTimeout(() => enterOnlineBattlePlay(room), 500) を呼ぶ。この
  // roomは「カウントダウン開始時点のスナップショット」のままで、status は依然 "countdown" の
  // ことがある（Firebase側は既にfinishCountdown()でstatus:"playing"へ進んでいても、この
  // クロージャ変数自体は更新されない）。一瞬協力はホストの進行ミラー（tick()）を
  // latestRoom.status === "playing" のときだけ回す設計のため、この古いstatusをそのまま
  // 保持してしまうと、以後Firebaseから新しい更新が来るまで進行が永久に止まる
  // （実機のような数十〜数百msのネットワーク遅延がある環境では、Firebaseの
  // status:"playing"更新のほうが500msのローカル待機より先に届くことが多く問題が
  // 表面化しにくいが、同一端末内の2タブ通信のような低遅延環境では高確率で再現する）。
  // この関数は「今まさに対戦を開始する」タイミングでしか呼ばれないため、statusは
  // 呼び出し元のroomの値を信用せず、ここで明示的に"playing"へ正規化する。
  const normalizedRoom = { ...room, status: ROOM_STATUS.PLAYING };
  latestRoom = normalizedRoom;
  currentMatchId = normalizedRoom.activeMatchId;
  currentSettings = room.settings;
  hostState = null;
  hostTickInFlight = false;
  resolvedAtLocalMs = null;
  myVotedQuestionIndex = -1;
  myVotedRoundNumber = -1;
  lastPlayedQuestionIndex = -1;
  lastPlayedRoundNumber = -1;
  lastAppliedAudioTroubleRecoveryKey = null;
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;
  disconnectedSinceMsByUid.clear();
  localAudioRecoveryAttemptedForQIndex.clear();

  elements.error.hidden = true;

  // 【2026-09-26新設・本人指示：オンライン対戦総合改修19-17章】js/onlineInstantBattleScreen.js
  // のenterOnlineInstantBattlePlay()と同じ理由・同じ対策。navigateTo()で画面を表示する前に、
  // 前試合固有のDOM内容（答え合わせカード・回答候補・回答状況一覧）を明示的に空にしておく。
  if (elements.revealSection) elements.revealSection.hidden = true;
  if (elements.revealCorrectSong) elements.revealCorrectSong.textContent = "";
  if (elements.revealTeamAnswer) elements.revealTeamAnswer.textContent = "";
  if (elements.revealOutcomeBadge) {
    elements.revealOutcomeBadge.textContent = "";
    elements.revealOutcomeBadge.classList.remove("is-correct-answer-reveal-status", "is-neutral-answer-reveal-status");
  }
  if (elements.revealTieBreakNotice) elements.revealTieBreakNotice.hidden = true;
  if (elements.revealDecisionReason) elements.revealDecisionReason.textContent = "";
  if (elements.revealVoteList) clearElement(elements.revealVoteList);
  if (elements.answerSection) elements.answerSection.hidden = true;
  if (elements.answerList) elements.answerList.innerHTML = "";
  if (elements.answerStatusList) clearElement(elements.answerStatusList);
  if (elements.waitingNotice) elements.waitingNotice.hidden = true;
  if (elements.idleNotice) elements.idleNotice.hidden = true;

  elements.navigateTo("onlineInstantCoopBattleQuestion");
  startServerTimeOffsetTracking();

  currentQuestions = instantCoopBattleMode.buildQuestions({
    seed: room.seed,
    settings: room.settings,
    reserveCount: AUDIO_FAILURE_RESERVE_SIZE,
  });
  targetQuestionCount = currentQuestions.filter((question) => !question.isReserve).length;

  const myUid = getCurrentUid();
  if (room.host === myUid) {
    const match = room.matches?.[currentMatchId] ?? {};
    const isReconnect = typeof match.currentQuestionIndex === "number";
    const participantUids = Object.keys(match.participants ?? {});
    hostState = isReconnect
      ? restoreMatchProgressFromFirebase({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: myUid,
          seed: room.seed,
          match,
          nowMs: Date.now(),
          targetQuestionCount,
        })
      : createMatchProgress({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: myUid,
          seed: room.seed,
          nowMs: Date.now(),
          targetQuestionCount,
        });

    if (hostState.currentQuestion.status === "resolved") {
      resolvedAtLocalMs = Date.now();
    }
  }

  startTickTimer();
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
  if (getCurrentUid() === latestRoom.host) {
    runHostProgressionTick();
  }
  renderCurrentQuestionState();
}

// ===== ホスト専用：進行ミラーの駆動 =====

async function runHostProgressionTick() {
  if (!currentMatchId || !latestRoom || hostTickInFlight) return;
  // 【2026-09-15追加】runTick()はsetIntervalで独立に動いており、
  // handleInstantCoopRoomUpdate()側のガードを経由しないため、ここでも同じ
  // 「currentMatchIdが今のroom.activeMatchIdと一致しているか」を確認する
  // （js/onlineLyricsQuizBattleScreen.jsの同じ修正と同じ理由）。
  if (latestRoom.activeMatchId !== currentMatchId) return;
  const match = latestRoom.matches?.[currentMatchId];
  if (!match) return;

  if (typeof match.currentQuestionIndex !== "number") {
    hostTickInFlight = true;
    try {
      const result = await startCoopQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: 0 });
      if (!result.ok) console.error("一瞬協力：最初の問題の開始に失敗しました", result.reason);
    } catch (error) {
      console.error("一瞬協力：進行タイマーで想定外のエラーが発生しました（最初の問題の開始）", error);
    } finally {
      hostTickInFlight = false;
    }
    return;
  }

  if (!hostState) return;
  if (hostState.currentQuestionIndex !== match.currentQuestionIndex) return; // Firebase側の反映待ち
  if (hostState.currentQuestion.status !== "collecting") {
    // 既に確定済み（resolved）。次へ進めるかどうかの判定は下のブロックで行う。
  } else {
    const qIndex = hostState.currentQuestionIndex;

    // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】音源トラブル復旧の
    // 処理を、通常の投票集計・進行判定より優先する。復旧が必要な間（新しい申告の検知～
    // リカバリー再生の待機中）は、投票集計・次の問題への進行判定を一切行わない
    // （本人指示：「他の全員の回答操作を一時的にロックし...進行を一時停止する」）。
    const recoveryAction = computeAudioTroubleRecoveryAction({
      recovery: match.audioTroubleRecovery,
      reports: match.audioTroubleRecovery?.reports,
      questionIndex: qIndex,
      nowMs: Date.now(),
      replayWindowMs: computeRecoveryReplayWindowMs({
        playDurationSec: Number(currentSettings.playDurationValue),
        includesCountdown: false, // 一瞬協力は問題ごとのローカルカウントダウンを持たない
      }),
    });
    if (recoveryAction.type === "wait") return;
    if (recoveryAction.type !== "none") {
      hostTickInFlight = true;
      try {
        await applyAudioTroubleRecoveryAction(recoveryAction, qIndex);
      } catch (error) {
        console.error("一瞬協力：音源トラブル復旧の処理で想定外のエラーが発生しました", error);
      } finally {
        hostTickInFlight = false;
      }
      return;
    }

    const roundNumber = hostState.currentQuestion.sharedReplayCount;
    const firebaseVotes = match.coopVotes?.[qIndex]?.[roundNumber] ?? {};
    let nextHostState = hostState;
    for (const [uid, vote] of Object.entries(firebaseVotes)) {
      if (!(uid in nextHostState.currentQuestion.votesByUid)) {
        nextHostState = recordVote(nextHostState, uid, vote.selectedSongId);
      }
    }
    // 【2026-09-06新設・3分無操作の放置救済】ホストがforceSkipIdlePlayer()で書き込んだ
    // forcedSkipsは、「本人がわからないを投票した場合」と全く同じ経路
    // （recordVote()へUNKNOWN_VOTEを渡す）で進行ミラーへ取り込む。新しい集計ロジックは
    // 増やさない（js/onlineLyricsQuizBattleScreen.jsの同じ仕組みと同じ設計思想）。
    const firebaseForcedSkips = match.forcedSkips?.[qIndex] ?? {};
    for (const uid of Object.keys(firebaseForcedSkips)) {
      if (!(uid in nextHostState.currentQuestion.votesByUid)) {
        nextHostState = recordVote(nextHostState, uid, UNKNOWN_VOTE);
      }
    }
    // 【2026-09-15追加・本人指示：途中退出者を待ち続けない】leftDuringMatchは参加者本人の
    // フラグを立てるだけで、投票済み人数には影響しない設計だったため、離脱した人がまだ
    // 投票していないと3分無操作救済がホストの手動操作で発動するまで進行が止まっていた
    // （離脱者はconnected:trueのままのことが多く、切断救済も発動しない）。離脱済みの人は
    // 以後わからない扱いにして進行を止めない（チーム成績への影響は多数決の一票が
    // 増えるだけで、離脱者自身の個人成績は元々存在しないため実害は無い）。
    for (const uid of nextHostState.allPlayerUids) {
      if (uid in nextHostState.currentQuestion.votesByUid) continue;
      if (match.participants?.[uid]?.leftDuringMatch === true) {
        nextHostState = recordVote(nextHostState, uid, UNKNOWN_VOTE);
      }
    }

    // 【2026-09-09新設・本人指示4：通信切断時の自動復帰待ち→離脱処理】まだ投票していない
    // 参加者のうち、実際に接続が切れている（connected:false）人だけの切断継続時間を計測し、
    // DISCONNECT_AUTO_SKIP_MS以上続いたら既存の放置救済（forceSkipIdlePlayer）を自動的に
    // 呼ぶ（js/onlineLyricsQuizBattleScreen.jsの同じ仕組みと同じ設計）。
    for (const uid of nextHostState.allPlayerUids) {
      if (uid in nextHostState.currentQuestion.votesByUid) {
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
    // 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】誰か1人でもこの問題で
    // 音源再生に失敗したと報告していれば（js/instantCoopBattleFirebase.jsの
    // reportAudioFailure()が書き込む）、投票の集計より優先してこの問題を無効にする。
    const audioFailureUids = Object.keys(match.audioFailures?.[qIndex] ?? {});
    const hasAudioFailureReport = audioFailureUids.length > 0;
    // 【2026-09-26新設・本人指示：オンライン対戦総合改修19-18章】
    // js/onlineInstantBattleScreen.jsと同じ理由。
    if (hasAudioFailureReport && nextHostState.currentQuestion.status !== "resolved") {
      recordAudioDiagnostic("[ONLINE_INSTANT_COOP] ホスト：audioFailure報告を検知しこの問題を無効化", {
        matchId: currentMatchId,
        questionIndex: qIndex,
        reportedByUids: audioFailureUids,
      });
    }
    const beforeTick = nextHostState;
    nextHostState = tick(nextHostState, Date.now(), hasAudioFailureReport);
    hostState = nextHostState;

    if (nextHostState !== beforeTick) {
      if (nextHostState.currentQuestion.status === "resolved") {
        resolvedAtLocalMs = Date.now();
        hostTickInFlight = true;
        try {
          const result = await resolveCoopQuestion({
            roomId: latestRoom.roomId,
            matchId: currentMatchId,
            questionIndex: qIndex,
            outcome: nextHostState.currentQuestion.outcome,
          });
          if (!result.ok) console.error("一瞬協力：問題の確定に失敗しました", result.reason);
        } catch (error) {
          console.error("一瞬協力：進行タイマーで想定外のエラーが発生しました（問題の確定）", error);
        } finally {
          hostTickInFlight = false;
        }
      }
      // 【2026-09-05改訂】以前はここで「タイ→再視聴ラウンドへ進んだ」場合の分岐
      // （startNextCoopVotingRound呼び出し）があったが、共有再視聴の仕組み自体を
      // 廃止した（js/instantCoopMatchProgress.js参照）ため削除した。tick()はタイでも
      // 必ずresolvedになるため、この分岐は不要になった。
    }
    return;
  }

  if (hostState.currentQuestion.status === "resolved" && resolvedAtLocalMs !== null && Date.now() - resolvedAtLocalMs >= REVEAL_DELAY_MS) {
    hostTickInFlight = true;
    try {
      const nextState = advanceToNextQuestion(hostState, Date.now());
      hostState = nextState;
      // 【2026-09-09新設・本人指示4】新しい問題へ移るタイミングで切断計測をリセットする。
      disconnectedSinceMsByUid.clear();
      if (nextState.status === "inProgress") {
        resolvedAtLocalMs = null;
        const result = await advanceCoopQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, nextQuestionIndex: nextState.currentQuestionIndex });
        if (!result.ok) console.error("一瞬協力：次の問題の開始に失敗しました", result.reason);
      } else if (nextState.status === MATCH_STATUS_ABORTED_AUDIO_FAILURE) {
        // 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】3問連続で無効になった、
        // または差し替えられる予備曲が尽きた場合。通常の勝敗としては一切記録せず、
        // 専用の中断案内へ全員を進める（js/instantCoopBattleFirebase.js参照）。
        const result = await abortCoopMatchDueToAudioFailure({ roomId: latestRoom.roomId, matchId: currentMatchId });
        if (!result.ok) console.error("一瞬協力：音源再生失敗による対戦中断の確定に失敗しました", result.reason);
      } else {
        const teamResult = finalizeMatch(nextState);
        if (teamResult) {
          const result = await finalizeCoopMatch({ roomId: latestRoom.roomId, matchId: currentMatchId, teamResult });
          if (!result.ok) console.error("一瞬協力：最終結果の確定に失敗しました", result.reason);
        }
      }
    } catch (error) {
      console.error("一瞬協力：進行タイマーで想定外のエラーが発生しました（次の問題／最終結果）", error);
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

// 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】このモードは全員が同じ問題を
// 同時に見るホスト同期型のため、個人進行型（一瞬チャレンジ・一瞬バトル）のように
// 自分の端末だけで曲を差し替えることはできない。代わりに、再生失敗をFirebaseへ報告し、
// ホストの進行ミラー（js/instantCoopMatchProgress.js）に「誰か1人でも失敗した問題」として
// 検知させ、全員一律で無効化・予備曲への差し替えを行わせる（本人指示1-4）。
// 【2026-09-26新設・本人指示：オンライン対戦総合改修19-16章】js/onlineInstantBattleScreen.js
// のhandlePlaybackFailure()と全く同じ考え方・同じ理由。安全機構（誰か1人の報告で
// 全員に無効化が波及する設計）自体は維持しつつ、サーバーへ報告する前に1回だけ
// ローカルで再unlock→再生を試みることで、iOSの自動再生許可が長い無操作区間中に
// 再ロックされるケースなど、正常な端末が誤って失敗報告してしまう事態を減らす。
const localAudioRecoveryAttemptedForQIndex = new Set();

function handleCoopPlaybackFailure(questionIndex, message) {
  const visibilityState = typeof document !== "undefined" ? document.visibilityState : "unknown";
  recordAudioDiagnostic("[ONLINE_INSTANT_COOP] 再生失敗を検知", {
    matchId: currentMatchId,
    questionIndex,
    message,
    visibilityState,
    alreadyAttemptedLocalRecovery: localAudioRecoveryAttemptedForQIndex.has(questionIndex),
  });

  if (!localAudioRecoveryAttemptedForQIndex.has(questionIndex)) {
    localAudioRecoveryAttemptedForQIndex.add(questionIndex);
    const question = currentQuestions[questionIndex];
    if (question && currentSettings) {
      recordAudioDiagnostic("[ONLINE_INSTANT_COOP] サーバーへ報告する前にローカルで再unlock→再生を1回だけ試みる", {
        matchId: currentMatchId,
        questionIndex,
      });
      attemptSilentUnlock();
      playQuestionAudio(question, questionIndex);
      return;
    }
  }

  showAudioErrorInline(message);
  if (!latestRoom || !currentMatchId) return;
  recordAudioDiagnostic("[ONLINE_INSTANT_COOP] 音声トラブルをサーバーへ報告（この問題は無効になります）", {
    matchId: currentMatchId,
    questionIndex,
    message,
  });
  reportAudioFailure({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex }).catch(() => {});
}

function playQuestionAudio(question, questionIndex) {
  recordAudioDiagnostic("[ONLINE_INSTANT_COOP] 再生要求", {
    matchId: currentMatchId,
    questionIndex,
    songId: question.song.id,
    visibilityState: typeof document !== "undefined" ? document.visibilityState : "unknown",
  });
  const playDurationSec = Number(currentSettings.playDurationValue);
  const fixedDurationSec = AUDIO_METADATA[question.song.id]?.durationSec ?? null;
  if (fixedDurationSec === null) {
    handleCoopPlaybackFailure(questionIndex, "この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    return;
  }
  const computeStartTimeSec = (actualDurationSec) => {
    if (!isDurationMismatchWithinTolerance(fixedDurationSec, actualDurationSec)) {
      stopAudio();
      handleCoopPlaybackFailure(questionIndex, "この曲の音源が他の端末と異なる可能性があります。音源を入れ直してください。");
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
    (message) => handleCoopPlaybackFailure(questionIndex, message),
    () => recordAudioDiagnostic("[ONLINE_INSTANT_COOP] 再生開始を確認（正常）", { matchId: currentMatchId, questionIndex }),
    () => {}
  );
}

// 【2026-09-06新設・3分無操作の放置救済】本人がこの問題の中で意味のある操作をした
// 瞬間に呼ぶ。ホスト側の「3分間操作していません」判定に使われる
// （js/onlineLyricsQuizBattleScreen.jsのreportMyQuestionActivity()と全く同じ設計。
// 詳しい理由はそちらのコメント参照）。同じ問題の中では既定で15秒に1回までしか
// 実際には送信しない。
// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】
// js/onlineInstantBattleScreen.jsのhandleAudioTroubleButtonClick()と全く同じ設計。
function handleAudioTroubleButtonClick() {
  if (!elements.audioTroubleButton || elements.audioTroubleButton.disabled) return;
  if (!latestRoom || !currentMatchId) return;
  const match = latestRoom.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  if (typeof qIndex !== "number" || match.questionStatus !== QUESTION_STATUS.ACTIVE) return;
  const recovery = match.audioTroubleRecovery;
  if (isAudioTroubleRecoveryLocking({ recovery, questionIndex: qIndex })) return;

  const confirmed = window.confirm(
    "音が出ませんでしたか？\n\n「OK」を選ぶと、参加者全員に対してこの問題の音源を最初から再生し直します。少しの間、全員の投票操作が一時的にできなくなります。"
  );
  if (!confirmed) return;

  elements.audioTroubleButton.disabled = true;
  reportPlaybackTrouble();
  const attemptSlot = computeNextReportAttemptSlot({ recovery, questionIndex: qIndex });
  reportAudioTroubleRecovery({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, attemptSlot }).catch(() => {});
}

// 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】
// js/onlineInstantBattleScreen.jsのapplyAudioTroubleRecoveryAction()と全く同じ設計。
// 「予備曲への差し替え」だけ、このモード専用のreportAudioFailure()を使う点が異なる。
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
    if (!result.ok) console.error("一瞬協力：音源トラブル復旧（再生開始）に失敗しました", result.reason);
    return;
  }
  if (action.type === "finish-replay") {
    const result = await finishAudioTroubleRecoveryReplay({ roomId, matchId });
    if (!result.ok) console.error("一瞬協力：音源トラブル復旧（再開）に失敗しました", result.reason);
    return;
  }
  if (action.type === "swap-reserve") {
    // 【本人指示：安全な回数を試みても改善しない場合】既存の「音源再生失敗時の予備曲差し替え」
    // 機能（js/instantCoopMatchProgress.jsのtick()・advanceToNextQuestion()）をそのまま
    // 再利用する（新しい差し替えロジックを増やさない）。
    const failureResult = await reportAudioFailure({ roomId, matchId, questionIndex: qIndex });
    if (!failureResult.ok) console.error("一瞬協力：音源トラブル復旧（予備曲差し替え申告）に失敗しました", failureResult.reason);
    const markResult = await markAudioTroubleRecoverySwapped({ roomId, matchId, swapCount: action.swapCount + 1 });
    if (!markResult.ok) console.error("一瞬協力：音源トラブル復旧（差し替え記録）に失敗しました", markResult.reason);
    return;
  }
  if (action.type === "return-to-lobby") {
    // 【本人指示：予備曲への差し替えも失敗する場合】既存のreturnRoomToLobby()を再利用し、
    // 設定・参加者・曲選択を保持したまま全員をロビーへ戻す。この試合は記録に残さない。
    const result = await returnRoomToLobby({ roomId });
    if (!result.ok) console.error("一瞬協力：音源トラブル復旧（ロビーへ戻す）に失敗しました", result.reason);
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

function renderAnswerButtons(pool) {
  const filtered = filterAnswerPool(pool, answerBrowseState);

  elements.answerList.innerHTML = "";
  filtered.forEach((song) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-button lyrics-quiz-answer-button";
    button.textContent = song.title;
    // 【2026-09-06新設、本人指示：実機フィードバック②④】一瞬協力は多数決＋タイ時は
    // 決定論的な乱数タイブレークで正誤を決めており、投票の速さは結果に影響しない
    // （js/instantCoopMatchProgress.js参照）ため確認対象。ただしこのモードは全員が
    // 揃わなくても多数決で問題が進むことがあり得るため、確認画面を開いた時点の問題番号・
    // ラウンド番号を覚えておき、「回答する」を押した時点で今の状態と一致するかを
    // 再確認する（一致していなければ、前の問題への誤投票を防ぐため静かに何もしない。
    // 本人指示：「確認画面を開いた時点のquestionIndex等と現在状態が一致しているか
    // 確認する」）。
    button.addEventListener("click", () => {
      reportMyQuestionActivity();
      const matchAtClick = latestRoom?.matches?.[currentMatchId];
      const expectedQIndex = matchAtClick?.currentQuestionIndex;
      const expectedRoundNumber = matchAtClick?.coopRoundNumber ?? 0;
      promptAnswerConfirm(song.title, () => {
        const matchAtConfirm = latestRoom?.matches?.[currentMatchId];
        const currentQIndex = matchAtConfirm?.currentQuestionIndex;
        const currentRoundNumber = matchAtConfirm?.coopRoundNumber ?? 0;
        if (currentQIndex !== expectedQIndex || currentRoundNumber !== expectedRoundNumber) return;
        handleVoteClick(song.id);
      });
    });
    elements.answerList.appendChild(button);
  });
}

async function handleVoteClick(vote) {
  // 【2026-09-13追加・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】このモードも
  // 音源再生は3→2→1カウントダウンを経由したタイマーからしか呼ばれない（js/main.js・
  // js/onlineInstantBattleScreen.jsと同じ設計）。投票タップは対戦中に毎問必ず起きる
  // 本物のユーザー操作のため、ここでunlockを試みておく（js/onlineInstantBattleScreen.jsの
  // handleAnswerSelected()と同じ理由）。
  attemptSilentUnlock();
  if (!latestRoom || !currentMatchId) return;
  const match = latestRoom.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  const roundNumber = match?.coopRoundNumber ?? 0;
  if (typeof qIndex !== "number") return;
  if (myVotedQuestionIndex === qIndex && myVotedRoundNumber === roundNumber) return;
  // 【2026-09-15追加・本人指示：前問／前試合フラッシュの全モード横断監査】この後のawaitの間に
  // 次の問題／次の試合へ進んでいた場合、送信失敗時のエラーメッセージが新しい画面に
  // 混ざらないよう、送信開始時点のmatchIdを覚えておく（js/onlineLyricsQuizBattleScreen.jsの
  // handleAnswerChoiceClick()と同じ考え方）。
  const submittedMatchId = currentMatchId;

  myVotedQuestionIndex = qIndex;
  myVotedRoundNumber = roundNumber;
  renderCurrentQuestionState();

  const result = await submitCoopVote({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, roundNumber, vote });
  const isStaleQuestion =
    submittedMatchId !== currentMatchId ||
    latestRoom?.matches?.[currentMatchId]?.currentQuestionIndex !== qIndex;
  if (!result.ok && result.reason !== "already-voted" && !isStaleQuestion) {
    // 送信に失敗した場合、投票済みフラグを戻して再挑戦できるようにする。
    myVotedQuestionIndex = -1;
    myVotedRoundNumber = -1;
    elements.error.textContent = "投票の送信に失敗しました。もう一度お試しください。";
    elements.error.hidden = false;
    renderCurrentQuestionState();
  }
}

// 【2026-09-06新設・本人指示：3分無操作の放置救済（一瞬協力にも適用）】
// js/onlineLyricsQuizBattleScreen.jsのrenderIdleNotice()と全く同じ設計。ホストにだけ
// 見える、3分間投票していないプレイヤーへの通知（まだ投票済み・強制棄権済みでない
// 参加者のうち、最後に活動報告した時刻からIDLE_RESCUE_THRESHOLD_MS以上経っている人）。
function renderIdleNotice(match, qIndex, roundNumber, nowServerTimeMs) {
  const isHost = latestRoom && getCurrentUid() === latestRoom.host;
  if (!elements.idleNotice) return;
  if (!isHost) {
    elements.idleNotice.hidden = true;
    return;
  }

  const participantUids = Object.keys(match.participants ?? {});
  const votedUids = new Set(Object.keys(match.coopVotes?.[qIndex]?.[roundNumber] ?? {}));
  const forcedSkipUids = new Set(Object.keys(match.forcedSkips?.[qIndex] ?? {}));
  const idleUids = participantUids.filter((uid) => {
    if (votedUids.has(uid) || forcedSkipUids.has(uid)) return false;
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
      button.disabled = true;
      forceSkipIdlePlayer({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, targetUid: uid });
    });
    row.appendChild(button);

    elements.idleNotice.appendChild(row);
  });
}

// 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】音源再生失敗で無効になった
// 問題は、内部的には配列上の次のインデックス（予備曲）へ進むが、利用者からは「同じ
// 問題番号のまま曲だけ差し替わった」ように見せたい（本人指示：問題数を消費しない）。
// そのため画面に出す「第◯問」は生のqIndexではなく、「これまでに実際に成立した
// （無効でなかった）問題の数＋1」で数え直す。coopQuestionOutcomesは全クライアントに
// 同期されるFirebaseデータのため、ホスト・参加者のどちらでも同じ計算ができる。
function computeDisplayedQuestionNumber(match, qIndex) {
  const outcomes = match.coopQuestionOutcomes ?? {};
  let completedCount = 0;
  for (let i = 0; i < qIndex; i += 1) {
    if (outcomes[i] && !outcomes[i].isVoid) completedCount += 1;
  }
  return completedCount + 1;
}

// 【2026-09-15新設・本人指示5：投票内容は秘密のまま、状態だけを見せる】ルーム参加順で
// 「回答済み／未回答」のバッジだけを並べる。js/onlineInstantBattleScreen.jsの
// renderAnswerStatusList()と同じ設計・同じCSSクラスを再利用する（見た目の統一）。
// forcedSkips（3分無操作救済）はcoopVotesには書き込まれないため、両方を確認する。
function renderVoteStatusList(match, qIndex, roundNumber) {
  if (!elements.answerStatusList) return;
  clearElement(elements.answerStatusList);
  const participants = match.participants ?? {};
  const votedUids = new Set(Object.keys(match.coopVotes?.[qIndex]?.[roundNumber] ?? {}));
  const forcedSkipUids = new Set(Object.keys(match.forcedSkips?.[qIndex] ?? {}));
  const myUid = getCurrentUid();

  Object.entries(participants).forEach(([uid, participant]) => {
    const row = document.createElement("li");
    row.className = "online-instant-battle-answer-status-row";

    // 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-8/19-11章】以前は
    // .online-lobby-oshi-dot（CSS未定義）で色ドットを描画していた。共通の参加者
    // アイコンへ差し替える。投票受付中の一覧のため、タップでのプロフィール表示は
    // 付けない（対戦の公平性に影響する時間帯のため）。
    row.appendChild(buildParticipantIcon(participant.oshiMemberId, uid));
    const name = document.createElement("span");
    name.className = "online-instant-battle-answer-status-name";
    name.textContent = participant.displayName + (uid === myUid ? "（あなた）" : "");
    row.appendChild(name);

    const badge = document.createElement("span");
    const answered = votedUids.has(uid) || forcedSkipUids.has(uid);
    badge.className = `online-instant-battle-answer-status-badge${answered ? " is-answered" : ""}`;
    badge.textContent = answered ? "回答済み" : "未回答";
    row.appendChild(badge);

    elements.answerStatusList.appendChild(row);
  });
}

// 【2026-09-15新設・本人指示5：全員確定後、誰が何に投票したかを一斉公開する】ルーム参加順で
// 各参加者の実際の投票内容を表示する。投票中は一切呼ばれず（isResolvedのときだけ呼ばれる）、
// 秘密が保たれる。正解曲に投票していた行は軽くハイライトする（本人指示のスコアには
// 一切影響しない、振り返り用の表示だけ）。
function renderRevealVoteList(match, qIndex, roundNumber) {
  if (!elements.revealVoteList) return;
  clearElement(elements.revealVoteList);
  const participants = match.participants ?? {};
  const roundVotes = match.coopVotes?.[qIndex]?.[roundNumber] ?? {};
  const forcedSkipUids = new Set(Object.keys(match.forcedSkips?.[qIndex] ?? {}));
  const question = currentQuestions[qIndex];
  const myUid = getCurrentUid();

  Object.entries(participants).forEach(([uid, participant]) => {
    const vote = roundVotes[uid];
    const isForcedSkip = forcedSkipUids.has(uid) && !vote;
    const row = document.createElement("li");
    row.className = "online-instant-battle-reveal-player-row";
    if (vote?.selectedSongId === question?.song.id) row.classList.add("is-correct");

    // 【2026-09-26新設・本人指示：オンライン対戦総合改修19-8/19-11章】この一覧は
    // 投票が確定した後（答え合わせ画面）にだけ表示されるため、対戦の公平性には
    // 影響しない。共通の参加者アイコンを添え、名前タップでプロフィールも開けるようにする。
    row.appendChild(buildParticipantIcon(participant.oshiMemberId, uid));
    const name = document.createElement("button");
    name.type = "button";
    name.className = "online-instant-battle-reveal-player-name online-instant-battle-reveal-player-name-button";
    name.textContent = participant.displayName + (uid === myUid ? "（あなた）" : "");
    name.addEventListener("click", () =>
      openLobbyParticipantProfile({ uid, name: participant.displayName, oshiMemberId: participant.oshiMemberId })
    );
    row.appendChild(name);

    const answerText = document.createElement("span");
    answerText.className = "online-instant-battle-reveal-player-answer";
    if (isForcedSkip) {
      answerText.textContent = "🤷 わからない（無操作救済）";
    } else if (!vote || vote.selectedSongId === UNKNOWN_VOTE) {
      answerText.textContent = "🤷 わからない";
    } else {
      const votedSong = question?.answerPool.find((song) => song.id === vote.selectedSongId);
      answerText.textContent = votedSong?.title ?? vote.selectedSongId;
    }
    row.appendChild(answerText);

    elements.revealVoteList.appendChild(row);
  });
}

function renderCurrentQuestionState() {
  if (!latestRoom || currentQuestions.length === 0) return;
  const match = latestRoom.matches?.[currentMatchId];
  if (!match || typeof match.currentQuestionIndex !== "number") return;

  const qIndex = match.currentQuestionIndex;
  const roundNumber = match.coopRoundNumber ?? 0;
  const question = currentQuestions[qIndex];
  if (!question) return;

  // 【2026-09-06新設・3分無操作の放置救済】ホストにより「わからない」扱いにされた場合、
  // 自分の端末では本人が投票した場合と同じ状態（投票済み・UNKNOWN_VOTE扱い）にする
  // （js/onlineLyricsQuizBattleScreen.jsのmyForcedSkipと全く同じ考え方）。
  const myUid = getCurrentUid();
  const myForcedSkip = match.forcedSkips?.[qIndex]?.[myUid] === true;
  if (myForcedSkip && !(myVotedQuestionIndex === qIndex && myVotedRoundNumber === roundNumber)) {
    myVotedQuestionIndex = qIndex;
    myVotedRoundNumber = roundNumber;
  }

  elements.progress.textContent = `第${computeDisplayedQuestionNumber(match, qIndex)}問 / ${targetQuestionCount}問`;

  // 新しい問題を検知したら、音源を再生し直す（2026-09-05改訂：共有再視聴ラウンドの
  // 仕組みを廃止したため、roundNumberは常に0のまま変化しない＝実質的にqIndexの
  // 変化だけを見ていることになるが、既存の判定条件はそのまま残しても無害なので触れない）。
  if (qIndex !== lastPlayedQuestionIndex || roundNumber !== lastPlayedRoundNumber) {
    lastPlayedQuestionIndex = qIndex;
    lastPlayedRoundNumber = roundNumber;
    elements.error.hidden = true;
    // 【2026-09-26追加・本人指示：前問題フラッシュ対策の保険】isResolvedの再計算は
    // この関数の後半でしか行われないため、新しい問題を検知した瞬間にも前問の
    // 答え合わせカードを同期的に隠しておく。
    if (elements.revealSection) elements.revealSection.hidden = true;
    playQuestionAudio(question, qIndex);
    // 【2026-09-07改訂・本人指示：検索状態を毎問題完全リセット／50音UIの共通展開】
    // 検索文字列・50音ジャンプの選択行・選択肢一覧のスクロール位置を、新しい問題ごとに
    // 先頭状態へ戻す（js/answerPoolBrowseUi.js参照）。
    resetAnswerPoolBrowseState(answerBrowseState);
    if (elements.answerSearchInput) elements.answerSearchInput.value = "";
    if (elements.answerList) elements.answerList.scrollTop = 0;
  }

  const isResolved = match.questionStatus === QUESTION_STATUS.RESOLVED;
  const hasVotedThisRound = myVotedQuestionIndex === qIndex && myVotedRoundNumber === roundNumber;

  // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】音源トラブル復旧
  // （リカバリー再生）が進行中の間は、投票収集中と同じ扱いで全員の投票操作をロックする。
  const recovery = match.audioTroubleRecovery;
  const isRecoveryLocking = isAudioTroubleRecoveryLocking({ recovery, questionIndex: qIndex });
  if (isRecoveryLocking) {
    // 新しいリカバリー再生を検知したら、全クライアントで同じタイミングで曲を頭から
    // 再生し直す。既存の個別再視聴（js/onlineInstantCoopBattleScreen.jsのreplayButton）
    // とは別の呼び出し経路で、Firebaseへは一切同期しない再視聴カウンターも存在しないため、
    // 何かを二重にカウントしてしまう心配はない。
    const recoveryKey = `${qIndex}:${recovery.attemptCount}`;
    if (recoveryKey !== lastAppliedAudioTroubleRecoveryKey) {
      lastAppliedAudioTroubleRecoveryKey = recoveryKey;
      playQuestionAudio(question, qIndex);
    }
  }

  // 【2026-09-14修正・実機回帰バグ】以前はisResolvedだけを見ており、投票確定後・
  // 他プレイヤー待ち中はanswerSection（選択肢一覧・検索欄・わからないボタン）が
  // 表示されたままだった。投票確定後にrenderAnswerButtons()が呼ばれなくなるだけで
  // DOM自体は残るため、投票前の古いボタンがクリック可能なまま残り、タップすると
  // 確認モーダルが再度開いてしまっていた（実際の投票上書きはhandleVoteClick側の
  // ガードで防がれていたが、UI上「回答を変更できる」ように見えていた）。
  // hasVotedThisRoundでも隠すことで、歌詞クイズ対戦と同じ「確定後は選択肢UIごと
  // 隠して待機表示に切り替える」挙動に統一する。
  elements.answerSection.hidden = isResolved || hasVotedThisRound || isRecoveryLocking;
  elements.waitingNotice.hidden = isResolved || !hasVotedThisRound || isRecoveryLocking;
  // 【2026-09-15新設・本人指示5：投票内容は秘密のまま、状態だけを見せる】
  // 一瞬バトルの回答状況一覧と同じ考え方・同じ表示タイミング（自分が投票した後だけ見せる）。
  if (elements.answerStatusList) elements.answerStatusList.hidden = isResolved || !hasVotedThisRound || isRecoveryLocking;
  elements.revealSection.hidden = !isResolved;
  // 【2026-09-05新設、本人指示】各自が個別に無制限で再視聴できるボタン。投票済み・
  // 正解確定後は押せないようにする（Firebaseへは一切同期しない、完全にローカルな操作）。
  if (elements.replayButton) {
    elements.replayButton.disabled = isResolved || hasVotedThisRound || isRecoveryLocking;
  }

  // 【2026-09-17新設・本人指示：「音が出ない」救済ボタン第2段階】表示条件：投票収集中
  // だけ表示（答え合わせ中・結果画面・ロビーでは非表示）。誰かが処理を開始した瞬間、
  // 全クライアントでボタンを無効化する。
  if (elements.audioTroubleButton) {
    elements.audioTroubleButton.hidden = isResolved;
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
      elements.answerJumpBar.hidden = !isLargePool || hasVotedThisRound;
      if (isLargePool && !hasVotedThisRound) {
        renderAnswerJumpBar(elements.answerJumpBar, answerBrowseState, () => renderAnswerButtons(question.answerPool));
      }
    }
    if (!hasVotedThisRound) {
      renderAnswerButtons(question.answerPool);
    }
    elements.unknownButton.disabled = hasVotedThisRound || isRecoveryLocking;
    const players = latestRoom.players || {};
    const activeUids = Object.keys(match.participants ?? {});
    const votedCount = countVotedPlayers(
      Object.fromEntries(Object.entries(match.coopVotes?.[qIndex]?.[roundNumber] ?? {}).map(([uid, v]) => [uid, v.selectedSongId])),
      activeUids
    );
    elements.waitingNotice.textContent = myForcedSkip
      ? "ホストにより、この問題は「わからない」扱いになりました。他の参加者の回答を待っています…"
      : `投票しました。他の参加者の回答を待っています（${votedCount}/${activeUids.length}人）`;
    renderVoteStatusList(match, qIndex, roundNumber);
    void players;
  } else {
    const outcome = match.coopQuestionOutcomes?.[qIndex];
    if (outcome) {
      // 【2026-09-06改訂、本人指示：実機フィードバック第3弾⑤】以前は正誤・正解曲名・
      // チームの回答をただの文字の羅列で見せていたが、歌詞クイズ対戦の答え合わせカードと
      // 同じ構造・同じ質感の専用カードへ作り替えた（index.htmlのコメント参照）。
      // 「全員わからない」は正解でも不正解でもないニュートラルな特殊ケースとして、
      // 色分けも専用の中間トーンにする（本人指示：「不正解と一緒くたにしない」）。
      const correctSong = question.song;

      // 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】音源再生失敗により
      // 無効になった問題は、正解曲名も「全員わからない」でもない専用の案内にする
      // （本人指示：「音源を正常に再生できない参加者がいたため、この問題は無効です」等を表示）。
      if (outcome.isVoid) {
        elements.revealCorrectSong.textContent = "";
        elements.revealTeamAnswer.textContent = "音源を正常に再生できない参加者がいたため、この問題は無効です。別の曲に差し替えます。";
        elements.revealOutcomeBadge.textContent = "🔇 この問題は無効です";
        elements.revealOutcomeBadge.classList.remove("is-correct-answer-reveal-status");
        elements.revealOutcomeBadge.classList.add("is-neutral-answer-reveal-status");
        elements.revealTieBreakNotice.hidden = true;
        if (elements.revealDecisionReason) elements.revealDecisionReason.textContent = "";
        if (elements.revealVoteList) clearElement(elements.revealVoteList);
      } else {
        elements.revealCorrectSong.textContent = correctSong.title;

        // 【2026-08-31発見・修正】Firebase Realtime Databaseは、書き込んだ値がnullの
        // フィールドをそのまま保存せず、キーごと削除する仕様のため（teamAnswer:nullで
        // 書き込んでも、読み出す側にはteamAnswer自体が存在しない＝undefinedになる）。
        // 「全員わからない・全員タイムアウト」の場合の判定は、===nullではなく==null
        // （nullとundefinedの両方を含む）で行う必要がある（実機同等のライブテストで発覚）。
        const isAllUnknown = outcome.teamAnswer == null;
        const teamAnswerSong = question.answerPool.find((song) => song.id === outcome.teamAnswer);
        elements.revealTeamAnswer.textContent = isAllUnknown
          ? "チームの回答：わからない（全員）"
          : `チームの回答：${teamAnswerSong?.title ?? outcome.teamAnswer}`;

        elements.revealOutcomeBadge.textContent = isAllUnknown ? "🤷 全員「わからない」でした" : outcome.isCorrect ? "🎉 正解！" : "残念、不正解";
        elements.revealOutcomeBadge.classList.toggle("is-correct-answer-reveal-status", !isAllUnknown && outcome.isCorrect);
        elements.revealOutcomeBadge.classList.toggle("is-neutral-answer-reveal-status", isAllUnknown);
        elements.revealTieBreakNotice.hidden = !outcome.usedTieBreakRandom;

        // 【2026-09-15新設・本人指示6：チーム回答の決定理由を分かりやすく表示】
        const activeUids = Object.keys(match.participants ?? {});
        const roundVotes = match.coopVotes?.[qIndex]?.[roundNumber] ?? {};
        if (elements.revealDecisionReason) {
          elements.revealDecisionReason.textContent = describeCoopDecisionReason({
            outcome,
            teamAnswerTitle: teamAnswerSong?.title ?? outcome.teamAnswer,
            roundVotes,
            activeUids,
          });
        }
        // 【2026-09-15新設・本人指示5：全員確定後、誰が何に投票したかを一斉公開する】
        renderRevealVoteList(match, qIndex, roundNumber);
      }
    }
  }

  const nowServerTimeMs = Date.now() + serverTimeOffset;
  renderIdleNotice(match, qIndex, roundNumber, nowServerTimeMs);
}

// ===== 結果画面（チーム成績） =====

// 【2026-09-15新設・本人指示：ゲスト結果画面の再監査（ホスト移譲との関係）】
// js/onlineLyricsQuizBattleScreen.jsのsyncLyricsResultHostGuestButtons()と全く同じ考え方。
export function syncInstantCoopResultHostGuestButtons(room) {
  if (document.body.dataset.screen !== "onlineInstantCoopBattleResult") return;
  const isHostOnResultScreen = room.host === getCurrentUid();
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
}

export function enterInstantCoopResult(room) {
  latestRoom = room;
  stopAllLocalTimers();
  elements.navigateTo("onlineInstantCoopBattleResult");

  const match = room.matches?.[room.activeMatchId] ?? {};
  const teamResult = match.coopTeamResult ?? { totalQuestions: 0, correctCount: 0, totalSharedReplayCount: 0 };
  const myUid = getCurrentUid();

  // 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】音源再生失敗の続発で
  // 対戦を中断した場合は、通常の成績表示を一切出さず、専用の案内だけを見せる。
  // プレイ履歴（下のsavePlayHistoryEntryIfNew）への保存もこの場合はスキップする
  // （本人指示：中断結果を通常の記録として保存しない）。
  const isAudioFailureAborted = teamResult.audioFailureAborted === true;
  if (elements.resultAudioFailureNotice) elements.resultAudioFailureNotice.hidden = !isAudioFailureAborted;
  if (elements.resultNormalContainer) elements.resultNormalContainer.hidden = isAudioFailureAborted;

  // 【2026-09-05改訂、本人指示】試合後の選択肢「もう一度」「ルーム設定に戻る」は
  // ホスト専用。非ホストには代わりに「⌂ホームへ戻る」だけを見せる。
  const isHostOnResultScreen = room.host === myUid;
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  // 【2026-09-07新設・本人指示:ゲスト結果画面】ホスト専用ボタンの代わりに、待機案内＋
  // 「ルームから退出」を見せる（js/onlineBattleScreen.jsの同じ変更と揃えている）。
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
  if (!isAudioFailureAborted) {
    elements.resultCorrectCount.textContent = `${teamResult.correctCount} / ${teamResult.totalQuestions}問`;
    // 【2026-09-05改訂】共有再視聴の仕組みを廃止したため、「合計共有再視聴回数」の表示は
    // 削除した（HTML側のelements.resultReplayCount自体も削除済み）。

    const participants = match.participants || {};
    clearElement(elements.resultMemberList);
    Object.entries(participants).forEach(([uid, participant]) => {
      const li = document.createElement("li");
      li.className = "online-lobby-player-row";
      // 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-8/19-15章】以前は
      // .online-lobby-oshi-dotという、実際にはCSSが1つも定義されていない（＝実機では
      // 見えていなかった）クラスで色ドットを描画していた。共通の参加者アイコン
      // （推し色＋代表称号バッジ、js/onlineParticipantIcon.js）へ差し替える。
      li.appendChild(buildParticipantIcon(participant.oshiMemberId, uid));

      const name = document.createElement("button");
      name.type = "button";
      name.className = "online-lobby-player-name online-lobby-player-name-button";
      name.textContent = participant.displayName + (participant.isHost ? "（ホスト）" : "");
      // 結果画面は対戦の進行に一切影響しないため、常にプロフィールを開ける。
      name.addEventListener("click", () =>
        openLobbyParticipantProfile({ uid, name: participant.displayName, oshiMemberId: participant.oshiMemberId })
      );
      li.appendChild(name);
      elements.resultMemberList.appendChild(li);
    });

    // 【2026-09-12新設・本人指示：結果画面の問題別結果アコーディオンを完成させる】
    // 音源再生失敗で無効になった問題を除いた、実際に成立した問題だけの問題別結果を
    // 既に同期済みのcoopVotes・coopQuestionOutcomesから組み立てる（新しいFirebase書き込みは
    // 発生しない。js/battleQuestionBreakdown.jsのbuildInstantCoopQuestionBreakdown参照）。
    const questionBreakdown = buildInstantCoopQuestionBreakdown({
      questions: currentQuestions,
      coopVotes: match.coopVotes,
      coopQuestionOutcomes: match.coopQuestionOutcomes,
      participants,
      myUid,
    });
    if (elements.resultQuestionBreakdownSection) {
      elements.resultQuestionBreakdownSection.hidden = questionBreakdown.length === 0;
    }
    renderQuestionBreakdownAccordion(elements.resultQuestionBreakdown, questionBreakdown);

    savePlayHistoryEntryIfNew({
      id: `online-coop:${room.activeMatchId}`,
      playedAt: Date.now(),
      modeId: "onlineInstantCoop",
      modeLabel: "オンライン対戦（一瞬協力）",
      questionCount: teamResult.totalQuestions,
      isAllSongsMode: !room.settings.questionSource || room.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS,
      correctCount: teamResult.correctCount,
      wrongCount: teamResult.totalQuestions - teamResult.correctCount,
      skippedCount: null,
      score: null,
      averageResponseMs: null,
      completed: true,
      details: {
        totalSharedReplayCount: teamResult.totalSharedReplayCount,
        memberCount: Object.keys(participants).length,
        // 結果画面と同じデータをそのまま保存し、履歴詳細でも同じ描画関数を使えるようにする
        // （js/onlineBattleScreen.jsのsaveOnlineBattleHistoryEntry()と同じ設計）。
        questionBreakdown: capQuestionBreakdownForStorage(questionBreakdown),
      },
    });
  }
}
