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
  rematchAndStartNow,
} from "./onlineBattle.js";
import { promptReturnToLobby } from "./onlineBattleLobbyReturnPrompt.js";
import { promptAnswerConfirm } from "./answerConfirmPrompt.js";
import { validateRoomSettings } from "./battleModes/index.js";
import * as instantCoopBattleMode from "./battleModes/instantCoopBattleMode.js";
import {
  UNKNOWN_VOTE,
  createMatchProgress,
  recordVote,
  countVotedPlayers,
  tick,
  advanceToNextQuestion,
  finalizeMatch,
  restoreMatchProgressFromFirebase,
} from "./instantCoopMatchProgress.js";
import {
  QUESTION_STATUS,
  startCoopQuestion,
  submitCoopVote,
  resolveCoopQuestion,
  advanceCoopQuestion,
  finalizeCoopMatch,
} from "./instantCoopBattleFirebase.js";
// 【2026-09-06新設・本人指示：3分無操作の放置救済を一瞬協力にも適用】forcedSkips・
// questionActivityのFirebaseパスはgameMode非依存の汎用フィールド（rooms/{roomId}/
// matches/{matchId}配下）として設計済みのため、歌詞クイズ対戦と全く同じ関数をそのまま
// 再利用する（新しいFirebase Rules・新しい書き込み関数は不要）。
import { reportQuestionActivity, forceSkipIdlePlayer } from "./lyricsQuizBattleFirebase.js";
import { IDLE_RESCUE_THRESHOLD_MS } from "./battleRules/sharedDefaults.js";
import { AUDIO_METADATA } from "./data/audioMetadata.js";
import {
  computeRandomStartTimeSec,
  clampStartTimeToActualDuration,
  isDurationMismatchWithinTolerance,
} from "./randomPlaybackEngine.js";
import { playSongFromRandomPosition, stopAudio } from "./audio.js";
import { LARGE_ANSWER_POOL_THRESHOLD } from "./lyricsQuizEngine.js";
import { normalizeForSearch, songMatchesSearch } from "./songlist.js";
import { QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { CATEGORY_LABELS, QUESTION_COUNT_LABELS } from "./localBattleScreen.js";
import { getMemberById } from "./memberUtils.js";
import { MEMBERS } from "./data/members.js";
import { savePlayHistoryEntryIfNew } from "./playHistory.js";

// ホストが結果を見せてから、次の問題／最終結果へ進むまでの待ち時間。
const REVEAL_DELAY_MS = 3000;
// ホストの進行判定を更新する間隔（js/onlineLyricsQuizBattleScreen.jsと同じ値・同じ理由）。
const HOST_TICK_INTERVAL_MS = 400;

let elements = null;

let latestRoom = null;
let currentMatchId = null;
let currentQuestions = [];
let currentSettings = null;

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

// 【2026-09-06新設・3分無操作の放置救済】自分の活動報告（reportQuestionActivity()）を
// 直近いつ送ったか（js/onlineLyricsQuizBattleScreen.jsと同じ間引き設計）。
let lastActivityReportedAtMs = 0;
let lastActivityReportedQIndex = -1;
const ACTIVITY_REPORT_THROTTLE_MS = 15000;

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
    renderAnswerButtons(question.answerPool, elements.answerSearchInput.value, false);
  });

  // 【2026-09-06新設・3分無操作の放置救済】検索結果一覧をスクロールする操作も、
  // 「考えている最中」の意味ある操作の一つとして扱う（js/onlineLyricsQuizBattleScreen.jsと
  // 同じ考え方）。
  elements.answerList?.addEventListener("scroll", () => {
    reportMyQuestionActivity();
  });

  elements.unknownButton.addEventListener("click", () => {
    handleVoteClick(UNKNOWN_VOTE);
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

  elements.resultHomeLink.addEventListener("click", () => {
    stopAllLocalTimers();
    elements.onLeaveResultToHome();
    elements.navigateTo("start");
  });
  // 【2026-09-05改訂、本人指示】試合後の選択肢を「もう一度」「ルーム設定に戻る」の
  // 2つ（ホスト専用）へ統一。「もう一度」は確認モーダルを挟まず即座に実行する
  // （js/onlineBattleScreen.jsの同じ変更と揃えている。詳細はそちらのコメント参照）。
  elements.resultRematchButton.addEventListener("click", async () => {
    if (!latestRoom) return;
    elements.resultRematchButton.disabled = true;
    await rematchAndStartNow({ roomId: latestRoom.roomId });
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
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;
}

// js/onlineBattleScreen.jsのrenderLobby()が、room更新のたび（画面を問わず）呼ぶフック。
export function handleInstantCoopRoomUpdate(room) {
  latestRoom = room;
  if (getCurrentUid() === room.host && room.status === ROOM_STATUS.PLAYING) {
    runHostProgressionTick();
  }
  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  // このモードは継続的にroom更新を受け取るため、ホスト交代が起きても正しく追随する。
  if (elements?.backToLobbyButton) {
    elements.backToLobbyButton.hidden = room.host !== getCurrentUid();
  }
  if (document.body.dataset.screen === "onlineInstantCoopBattleQuestion") {
    renderCurrentQuestionState();
  }
}

// ===== ロビー：対戦設定 =====

async function applySettingsChangeFromForm() {
  if (!latestRoom) return;
  const settings = readSettingsFromHostForm();
  const errorMessage = validateRoomSettings(latestRoom.gameMode, settings);
  if (errorMessage) {
    elements.settingsError.textContent = errorMessage;
    elements.settingsError.hidden = false;
    return;
  }
  elements.settingsError.hidden = true;
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

function renderParticipantSettingsChips(settings) {
  clearElement(elements.settingsSummaryContainer);
  const chips = [
    "一瞬協力",
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? `${settings.questionCountValue}問`,
    CATEGORY_LABELS[settings.categoryFilterValue] ?? settings.categoryFilterValue,
    `再生${settings.playDurationValue}秒`,
    settings.answerPoolSizeValue === "all" ? "全曲検索" : `${settings.answerPoolSizeValue}択`,
  ];
  chips.forEach((text) => {
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
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;

  elements.error.hidden = true;
  elements.navigateTo("onlineInstantCoopBattleQuestion");
  startServerTimeOffsetTracking();

  currentQuestions = instantCoopBattleMode.buildQuestions({ seed: room.seed, settings: room.settings });

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
        })
      : createMatchProgress({ questions: currentQuestions, allPlayerUids: participantUids, hostUid: myUid, seed: room.seed, nowMs: Date.now() });

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
    const beforeTick = nextHostState;
    nextHostState = tick(nextHostState, Date.now());
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
      if (nextState.status === "inProgress") {
        resolvedAtLocalMs = null;
        const result = await advanceCoopQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, nextQuestionIndex: nextState.currentQuestionIndex });
        if (!result.ok) console.error("一瞬協力：次の問題の開始に失敗しました", result.reason);
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

function playQuestionAudio(question, questionIndex) {
  const playDurationSec = Number(currentSettings.playDurationValue);
  const fixedDurationSec = AUDIO_METADATA[question.song.id]?.durationSec ?? null;
  if (fixedDurationSec === null) {
    showAudioErrorInline("この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    return;
  }
  const computeStartTimeSec = (actualDurationSec) => {
    if (!isDurationMismatchWithinTolerance(fixedDurationSec, actualDurationSec)) {
      stopAudio();
      showAudioErrorInline("この曲の音源が他の端末と異なる可能性があります。音源を入れ直してください。");
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
  playSongFromRandomPosition(question.song, computeStartTimeSec, playDurationSec, showAudioErrorInline, () => {}, () => {});
}

// 【2026-09-06新設・3分無操作の放置救済】本人がこの問題の中で意味のある操作をした
// 瞬間に呼ぶ。ホスト側の「3分間操作していません」判定に使われる
// （js/onlineLyricsQuizBattleScreen.jsのreportMyQuestionActivity()と全く同じ設計。
// 詳しい理由はそちらのコメント参照）。同じ問題の中では既定で15秒に1回までしか
// 実際には送信しない。
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

function renderAnswerButtons(pool, searchQuery, disabled) {
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
    button.disabled = disabled;
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
  if (!latestRoom || !currentMatchId) return;
  const match = latestRoom.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  const roundNumber = match?.coopRoundNumber ?? 0;
  if (typeof qIndex !== "number") return;
  if (myVotedQuestionIndex === qIndex && myVotedRoundNumber === roundNumber) return;

  myVotedQuestionIndex = qIndex;
  myVotedRoundNumber = roundNumber;
  renderCurrentQuestionState();

  const result = await submitCoopVote({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, roundNumber, vote });
  if (!result.ok && result.reason !== "already-voted") {
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

  elements.progress.textContent = `第${qIndex + 1}問 / ${currentQuestions.length}問`;

  // 新しい問題を検知したら、音源を再生し直す（2026-09-05改訂：共有再視聴ラウンドの
  // 仕組みを廃止したため、roundNumberは常に0のまま変化しない＝実質的にqIndexの
  // 変化だけを見ていることになるが、既存の判定条件はそのまま残しても無害なので触れない）。
  if (qIndex !== lastPlayedQuestionIndex || roundNumber !== lastPlayedRoundNumber) {
    lastPlayedQuestionIndex = qIndex;
    lastPlayedRoundNumber = roundNumber;
    elements.error.hidden = true;
    playQuestionAudio(question, qIndex);
  }

  const isResolved = match.questionStatus === QUESTION_STATUS.RESOLVED;
  const hasVotedThisRound = myVotedQuestionIndex === qIndex && myVotedRoundNumber === roundNumber;

  elements.answerSection.hidden = isResolved;
  elements.waitingNotice.hidden = isResolved || !hasVotedThisRound;
  elements.revealSection.hidden = !isResolved;
  // 【2026-09-05新設、本人指示】各自が個別に無制限で再視聴できるボタン。投票済み・
  // 正解確定後は押せないようにする（Firebaseへは一切同期しない、完全にローカルな操作）。
  if (elements.replayButton) {
    elements.replayButton.disabled = isResolved || hasVotedThisRound;
  }

  if (!isResolved) {
    const isLargePool = question.answerPool.length >= LARGE_ANSWER_POOL_THRESHOLD;
    elements.answerSearchRow.hidden = !isLargePool;
    if (isLargePool) elements.answerCount.textContent = `${question.answerPool.length}曲`;
    if (!hasVotedThisRound) {
      renderAnswerButtons(question.answerPool, elements.answerSearchInput.value, false);
    }
    elements.unknownButton.disabled = hasVotedThisRound;
    const players = latestRoom.players || {};
    const activeUids = Object.keys(match.participants ?? {});
    const votedCount = countVotedPlayers(
      Object.fromEntries(Object.entries(match.coopVotes?.[qIndex]?.[roundNumber] ?? {}).map(([uid, v]) => [uid, v.selectedSongId])),
      activeUids
    );
    elements.waitingNotice.textContent = myForcedSkip
      ? "ホストにより、この問題は「わからない」扱いになりました。他の参加者の回答を待っています…"
      : `投票しました。他の参加者の回答を待っています（${votedCount}/${activeUids.length}人）`;
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
    }
  }

  const nowServerTimeMs = Date.now() + serverTimeOffset;
  renderIdleNotice(match, qIndex, roundNumber, nowServerTimeMs);
}

// ===== 結果画面（チーム成績） =====

export function enterInstantCoopResult(room) {
  latestRoom = room;
  stopAllLocalTimers();
  elements.navigateTo("onlineInstantCoopBattleResult");

  const match = room.matches?.[room.activeMatchId] ?? {};
  const teamResult = match.coopTeamResult ?? { totalQuestions: 0, correctCount: 0, totalSharedReplayCount: 0 };
  const myUid = getCurrentUid();

  // 【2026-09-05改訂、本人指示】試合後の選択肢「もう一度」「ルーム設定に戻る」は
  // ホスト専用。非ホストには代わりに「⌂ホームへ戻る」だけを見せる。
  const isHostOnResultScreen = room.host === myUid;
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  elements.resultCorrectCount.textContent = `${teamResult.correctCount} / ${teamResult.totalQuestions}問`;
  // 【2026-09-05改訂】共有再視聴の仕組みを廃止したため、「合計共有再視聴回数」の表示は
  // 削除した（HTML側のelements.resultReplayCount自体も削除済み）。

  const participants = match.participants || {};
  clearElement(elements.resultMemberList);
  Object.values(participants).forEach((participant) => {
    const li = document.createElement("li");
    li.className = "online-lobby-player-row";
    const oshiColor = resolveOshiColor(participant.oshiMemberId);
    if (oshiColor) {
      const dot = document.createElement("span");
      dot.className = "online-lobby-oshi-dot";
      dot.style.backgroundColor = oshiColor;
      li.appendChild(dot);
    }
    const name = document.createElement("span");
    name.textContent = participant.displayName + (participant.isHost ? "（ホスト）" : "");
    li.appendChild(name);
    elements.resultMemberList.appendChild(li);
  });

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
    details: { totalSharedReplayCount: teamResult.totalSharedReplayCount, memberCount: Object.keys(participants).length },
  });
}
