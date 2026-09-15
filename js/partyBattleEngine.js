// パーティー対戦（2026-09-15新設、本人指示）の「進行エンジン」。
//
// 【役割分担】
//   js/partyBattleState.js …… 純粋な状態遷移（このファイルはそれを呼ぶだけで、ルールを持たない）
//   このファイル …………………… 問題の準備（選曲・4択生成）、モード別の再生、カウントダウン等のタイマー、
//                               音声回答の進行、バックグラウンド時の一時停止、試合の終了と履歴保存
//   js/partyBattlePlayScreen.js … 画面描画（エンジンのonUpdateで渡すスナップショットを描くだけ）
//
// 【既存部品の再利用】問題生成はjs/questionSource.js・js/quiz.js、歌詞はjs/lyricsQuizQuestionBuilder.js、
// 一瞬はjs/instantChallengeQuestionBuilder.js、音源再生はjs/audio.js（playSongIntro／
// playSongFromRandomPosition／pauseAudioForExternalUi／resumeAudioForExternalUi）、ランダム位置は
// js/randomPlaybackEngine.js、アウトロ位置はjs/data/audioMetadata.jsのoutroStartSec、
// 効果音はjs/soundManager.jsをそのまま使う。旧1台対戦の対戦コード層（js/localBattle.js等）は使わない。

import { SONGS } from "./data/songs.js";
import { AUDIO_METADATA } from "./data/audioMetadata.js";
import {
  QUESTION_SOURCE_TYPE,
  resolveSongPool,
  resolveSongObjects,
  buildQuestionsFromPool,
} from "./questionSource.js";
import { resolveQuestionCount, pickQuestionSongs, generateChoices, filterSongsByAvailableAudio } from "./quiz.js";
import { getImportedSongIds } from "./audioStorage.js";
import { createSeededRandom, generateRandomSeed } from "./seededRandom.js";
import {
  loadSongsWithLyrics,
  filterQuizzableSongs,
  buildLyricsQuizQuestions,
  isLyricsQuizEligibleSong,
} from "./lyricsQuizQuestionBuilder.js";
import { buildInstantChallengeQuestion } from "./instantChallengeQuestionBuilder.js";
import {
  playSongIntro,
  playSongFromRandomPosition,
  stopAudio,
  pauseAudioForExternalUi,
  resumeAudioForExternalUi,
} from "./audio.js";
import { RANDOM_PLAYBACK_DEFAULTS, computeRandomStartTimeSec, clampStartTimeToActualDuration } from "./randomPlaybackEngine.js";
import { computeStealHintProgress } from "./lyricsQuizBattleTiming.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { getPlaylistById } from "./playlists.js";
import { notifyPlaybackStarting } from "./playbackCoordinator.js";
import {
  PARTY_PHASE,
  PARTY_QUIZ_TYPE,
  PARTY_ANSWER_METHOD,
  PARTY_WRONG_RESULT_MS,
  buildPartyPlayers,
  createPartyMatch,
  createQuestionRuntime,
  beginCountdown,
  activateQuestion,
  claimAnswer,
  isClaimedChoiceCorrect,
  resolveCorrect,
  resolveWrong,
  finishWrongResult,
  passQuestion,
  voidRevealedCorrect,
  markPlaybackStarted,
  markPlaybackEnded,
  canReplay,
  beginReplay,
  applyQuestionOutcome,
  creditCorrectScore,
  revokeCorrectScore,
  countWrongAttempt,
  resolveAfterPlannedQuestions,
  resolveSuddenDeathOutcome,
  resolveParticipantIds,
  pickSuddenDeathSong,
  isWaitingForNext,
} from "./partyBattleState.js";
import { createClaimArbiter } from "./partyBattleInput.js";
import {
  isVoiceRecognitionAvailable,
  markVoiceRecognitionUnavailable,
  getVoiceUnavailableReason,
  startVoiceRecognitionSession,
  computeVoiceDeadline,
  isVoiceFatalEndReason,
  VOICE_STAGE,
} from "./partyBattleVoice.js";
import { matchSpokenSongName, decideVoiceVerdict } from "./songNameMatcher.js";
import { savePartyBattleHistory, rememberPartyPlayerNames, saveLastPartySettings } from "./partyBattleStorage.js";

// ===== 定数 =====
const COUNTDOWN_STEP_MS = 800; // 3→2→1の各表示時間
const START_LABEL_MS = 700; // 「START!」の表示時間（この間も入力は有効）
const QUESTION_INTRO_MS = 1200; // 「第N問」の表示時間
const OUTRO_PLAY_DURATION_SEC = 5; // 既存アウトロクイズと同じ「曲の最後5秒」
const REVIEW_PLAYBACK_DELAY_MS = 900; // 正解SFXが鳴り終わってから答え合わせ音源を始めるまでの間
const MAX_RESERVE_COUNT = 3; // 音源失敗時の差し替え用に余分に用意する曲数
const VOICE_TICK_MS = 100;
const LYRICS_TICK_MS = 100;

export const PARTY_PREPARE_ERROR = {
  NO_SONGS: "no-songs",
  TOO_FEW_FOR_CHOICES: "too-few-for-choices",
  TOO_FEW_FOR_COUNT: "too-few-for-count",
  NO_LYRICS: "no-lyrics",
  SEATS: "seats",
};

// ===== 問題の準備（開始前チェック画面が呼ぶ） =====

// 設定→js/questionSource.jsの問い合わせ形式へ変換する。
export function buildQuestionSourceFromSettings(settings) {
  switch (settings.songSource) {
    case "manual":
      return { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: settings.manualSongIds };
    case "favorites":
      return { type: QUESTION_SOURCE_TYPE.FAVORITES_SNAPSHOT };
    case "playlist":
      return { type: QUESTION_SOURCE_TYPE.PLAYLIST_SNAPSHOT, playlistId: settings.playlistId };
    case "all":
      return { type: QUESTION_SOURCE_TYPE.ALL_SONGS };
    default:
      return { type: QUESTION_SOURCE_TYPE.CATEGORY, categoryFilterValue: settings.songSource };
  }
}

// 出題に使える曲プールを解決する（音源／歌詞データの有無まで含めた検証つき）。
// 戻り値: { ok, reason, message, poolSongs, distractorSongs, songsWithLyrics, availableCount }
//   ok=falseのとき、messageは設定画面にそのまま出せる日本語の理由。
export async function resolvePartySongPool(settings) {
  const sourceSongIds = resolveSongPool(buildQuestionSourceFromSettings(settings));
  const sourceSongs = resolveSongObjects(sourceSongIds);
  if (sourceSongs.length === 0) {
    return { ok: false, reason: PARTY_PREPARE_ERROR.NO_SONGS, message: "この選曲条件には曲がありません。選曲を変えてください。" };
  }

  let poolSongs;
  let songsWithLyrics = [];
  if (settings.quizType === PARTY_QUIZ_TYPE.LYRICS) {
    const eligibleIds = sourceSongIds.filter((songId) => isLyricsQuizEligibleSong({ id: songId }));
    songsWithLyrics = filterQuizzableSongs(await loadSongsWithLyrics(eligibleIds));
    poolSongs = songsWithLyrics.map((entry) => entry.song);
    if (poolSongs.length === 0) {
      return {
        ok: false,
        reason: PARTY_PREPARE_ERROR.NO_LYRICS,
        message: "歌詞クイズに出題できる曲がありません（歌詞データの読み込み、または選曲の変更が必要です）。",
      };
    }
  } else {
    const importedIds = await getImportedSongIds();
    poolSongs = filterSongsByAvailableAudio(sourceSongs, importedIds);
    if (poolSongs.length === 0) {
      return {
        ok: false,
        reason: PARTY_PREPARE_ERROR.NO_SONGS,
        message: "この選曲条件で音源を読み込み済みの曲がありません。スタート画面の「追加データパックを読み込む」から音源を追加するか、選曲を変えてください。",
      };
    }
  }

  // 4択のダミー候補は「できるだけそのソース内から」（本人確定）。そのため4択では4曲以上必要。
  const distractorSongs = poolSongs;
  if (settings.answerMethod === PARTY_ANSWER_METHOD.FOUR_CHOICE && poolSongs.length < 4) {
    return {
      ok: false,
      reason: PARTY_PREPARE_ERROR.TOO_FEW_FOR_CHOICES,
      message: `4択回答には、出題できる曲が4曲以上必要です（今は${poolSongs.length}曲）。選曲の範囲を広げるか、音声回答にしてください。`,
      poolSongs,
    };
  }
  if (settings.questionCountValue !== "all") {
    const required = Number(settings.questionCountValue);
    if (poolSongs.length < required) {
      return {
        ok: false,
        reason: PARTY_PREPARE_ERROR.TOO_FEW_FOR_COUNT,
        message: `出題できる曲が足りません（${required}問には${required}曲必要ですが、${poolSongs.length}曲しかありません）。問題数を減らすか、選曲の範囲を広げてください。`,
        poolSongs,
      };
    }
  }
  return { ok: true, poolSongs, distractorSongs, songsWithLyrics, availableCount: poolSongs.length };
}

// 1曲ぶんの問題（{ song, choices, hints }）を組み立てる。サドンデス・差し替えでも同じ関数を使う。
function buildQuestionForSong(song, { settings, distractorSongs, songsWithLyrics, random, seed, ordinal }) {
  if (settings.quizType === PARTY_QUIZ_TYPE.LYRICS) {
    const entry = songsWithLyrics.find((candidate) => candidate.song.id === song.id);
    if (!entry) return null;
    const [question] = buildLyricsQuizQuestions({
      songsWithLyrics: [entry],
      songPool: [song.id],
      distractorSongPool: distractorSongs.map((candidate) => candidate.id),
      questionCountValue: "1",
      answerPoolSizeValue: "4",
      seed: (seed + ordinal * 7919) >>> 0,
    });
    if (!question) return null;
    return {
      song,
      choices: question.answerPool,
      hints: question.hints,
      revealStartTimeSec: question.revealStartTimeSec,
      revealStartTimeSecByHintLevel: question.revealStartTimeSecByHintLevel,
    };
  }
  if (settings.quizType === PARTY_QUIZ_TYPE.INSTANT) {
    const question = buildInstantChallengeQuestion(song, distractorSongs, { answerPoolSizeValue: "4" }, distractorSongs);
    return { song, choices: question.answerPool, hints: [] };
  }
  return { song, choices: generateChoices(song, distractorSongs, random), hints: [] };
}

// 予定問題＋予備曲を組み立てる。
function buildInitialQuestions({ settings, poolSongs, distractorSongs, songsWithLyrics, seed }) {
  const plannedCount = resolveQuestionCount(settings.questionCountValue, poolSongs.length);
  const reserveCount = Math.min(MAX_RESERVE_COUNT, Math.max(0, poolSongs.length - plannedCount));
  const random = createSeededRandom(seed);
  let questions;
  if (settings.quizType === PARTY_QUIZ_TYPE.LYRICS) {
    const built = buildLyricsQuizQuestions({
      songsWithLyrics,
      songPool: poolSongs.map((song) => song.id),
      distractorSongPool: distractorSongs.map((song) => song.id),
      questionCountValue: settings.questionCountValue === "all" ? "all" : String(plannedCount + reserveCount),
      answerPoolSizeValue: "4",
      seed,
    });
    questions = built.map((question) => ({
      song: question.song,
      choices: question.answerPool,
      hints: question.hints,
      revealStartTimeSec: question.revealStartTimeSec,
      revealStartTimeSecByHintLevel: question.revealStartTimeSecByHintLevel,
    }));
  } else if (settings.quizType === PARTY_QUIZ_TYPE.INSTANT) {
    const songs = pickQuestionSongs(poolSongs, plannedCount + reserveCount, random);
    questions = songs.map((song) =>
      buildQuestionForSong(song, { settings, distractorSongs, songsWithLyrics, random, seed, ordinal: 0 })
    );
  } else {
    questions = buildQuestionsFromPool({
      seed,
      songPool: poolSongs.map((song) => song.id),
      distractorPool: distractorSongs.map((song) => song.id),
      questionCountValue: settings.questionCountValue,
      reserveCount,
    }).map((question) => ({ song: question.song, choices: question.choices, hints: [] }));
  }
  return { questions, plannedCount: Math.min(plannedCount, questions.length) };
}

// 開始前チェックが通ったあと、試合オブジェクトを作る（まだ開始はしない）。
export async function preparePartyMatch(settings) {
  const built = buildPartyPlayers(settings);
  if (!built) {
    return { ok: false, reason: PARTY_PREPARE_ERROR.SEATS, message: "3人対戦では、空席にする席を1つ選んでください。" };
  }
  const pool = await resolvePartySongPool(settings);
  if (!pool.ok) return pool;
  const seed = generateRandomSeed(32);
  const { questions, plannedCount } = buildInitialQuestions({ settings, seed, ...pool });
  if (plannedCount === 0) {
    return { ok: false, reason: PARTY_PREPARE_ERROR.NO_SONGS, message: "出題できる問題を作れませんでした。選曲を変えてください。" };
  }
  const match = createPartyMatch({
    settings,
    players: built.players,
    layout: built.layout,
    seats: built.seats,
    questions,
    plannedCount,
    seed,
  });
  return { ok: true, match, pool };
}

// ===== 再生位置（出題中・再聴・答え合わせで共有する純粋関数） =====

// その問題の「出題で使う開始位置」を、実際の音源の長さ（durationSec）から求める。
// ランダム再生／一瞬：seed・songId・ordinal から決定論的に1回だけ決まる（再聴・答え合わせでも同じ値）。
// アウトロ：audioMetadata の outroStartSec（無ければ曲末5秒前）。イントロ：曲頭（introLeadInSec は playSongIntro 側）。
export function resolveQuestionStartTimeSec({ quizType, song, seed, ordinal, instantClipSec }, durationSec) {
  if (quizType === PARTY_QUIZ_TYPE.OUTRO) {
    return AUDIO_METADATA[song.id]?.outroStartSec ?? Math.max(0, durationSec - OUTRO_PLAY_DURATION_SEC);
  }
  if (quizType === PARTY_QUIZ_TYPE.INTRO || quizType === PARTY_QUIZ_TYPE.LYRICS) {
    return song.introLeadInSec || 0;
  }
  const playDurationSec = quizType === PARTY_QUIZ_TYPE.INSTANT ? Number(instantClipSec) : RANDOM_PLAYBACK_DEFAULTS.playDurationSec;
  const canonical = computeRandomStartTimeSec({ seed, songId: song.id, questionIndex: ordinal, durationSec, playDurationSec });
  return clampStartTimeToActualDuration(canonical, durationSec);
}

// 出題中の再生プラン：{ computeStartTimeSec(durationSec), playDurationSec }
//   playDurationSec: null＝曲末まで止めない（ランダム再生はランダム位置から曲末まで。本人確定）
//   アウトロ＝曲末の約5秒、一瞬＝設定した長さ（0.5／1／1.5秒）
export function resolveQuestionPlaybackPlan({ quizType, song, seed, ordinal, instantClipSec }) {
  const computeStartTimeSec = (durationSec) => resolveQuestionStartTimeSec({ quizType, song, seed, ordinal, instantClipSec }, durationSec);
  if (quizType === PARTY_QUIZ_TYPE.OUTRO) return { computeStartTimeSec, playDurationSec: OUTRO_PLAY_DURATION_SEC };
  if (quizType === PARTY_QUIZ_TYPE.INSTANT) return { computeStartTimeSec, playDurationSec: Number(instantClipSec) };
  return { computeStartTimeSec, playDurationSec: null };
}

// 【2026-09-15 第3回実機QA修正・本人指示：正解後の答え合わせ再生】正解確定後に「その問題で使った箇所」から
// 音源を流すためのプラン。開始位置はモードごとに次のとおり（本人確定）：
//   イントロ：その問題のイントロ開始位置（＝曲頭）／ランダム再生：その問題の固定ランダム開始位置（新しく作らない）／
//   アウトロ：同じアウトロ区間をもう一度（約5秒、1回だけ）／一瞬：その問題の一瞬区間の開始位置から続きを流す／
//   歌詞：正解確定時点のヒント段階に対応する曲中位置（オンライン歌詞対戦と同じ revealStartTimeSecByHintLevel）。
// 戻り値: { computeStartTimeSec(durationSec), playDurationSec }（null＝曲末まで）
export function resolveReviewPlaybackPlan({ quizType, question, seed, ordinal, instantClipSec, lyricsElapsedMs }) {
  const song = question.song;
  if (quizType === PARTY_QUIZ_TYPE.LYRICS) {
    const hintTexts = (question.hints ?? []).map((hint) => hint.segment?.text ?? "");
    const { currentLevel } = computeStealHintProgress({ elapsedMs: lyricsElapsedMs ?? 0, hintTexts });
    const byLevel = question.revealStartTimeSecByHintLevel ?? {};
    const level = Math.max(1, currentLevel);
    const startTimeSec = byLevel[level] ?? question.revealStartTimeSec ?? 0;
    return {
      computeStartTimeSec: (durationSec) => Math.min(Math.max(startTimeSec, 0), Math.max(durationSec - 0.5, 0)),
      playDurationSec: null,
      hintLevel: level,
    };
  }
  const computeStartTimeSec = (durationSec) => resolveQuestionStartTimeSec({ quizType, song, seed, ordinal, instantClipSec }, durationSec);
  if (quizType === PARTY_QUIZ_TYPE.OUTRO) return { computeStartTimeSec, playDurationSec: OUTRO_PLAY_DURATION_SEC };
  return { computeStartTimeSec, playDurationSec: null };
}

// ===== エンジン本体 =====

// onUpdate(snapshot): 状態が変わるたびに呼ばれる。snapshot = { match, runtime, ui }。
//   ui = { countdownValue, showQuestionIntro, paused, resumeRequired, notice, lyricsElapsedMs,
//          voice, playbackStarted, finished, aborted }
export function createPartyBattleEngine({ onUpdate }) {
  let match = null;
  let pool = null; // { poolSongs, distractorSongs, songsWithLyrics }
  let runtime = null;
  let reserveQueue = [];
  let ordinalCounter = 0; // 問題ごとに一意な番号（ランダム位置・歌詞抽選の種に使う）
  const arbiter = createClaimArbiter();
  const timers = new Set();
  let countdownValue = null;
  let showQuestionIntro = false;
  let paused = false;
  let resumeRequired = false;
  let pausedPhaseSnapshot = null;
  let notice = null;
  let playbackStarted = false;
  let lyricsClock = { elapsedMs: 0, startedAtMs: null, intervalId: null };
  let voiceState = null; // { playerId, claimedAtMs, speechStartedAtMs, deadlineMs, transcripts, status, session, intervalId, verdict }
  let wakeLock = null;
  let finished = false;
  let aborted = false;
  let playlistName = null;

  function now() {
    return performance.now();
  }

  function schedule(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function clearAllTimers() {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  }

  function emit() {
    onUpdate?.({
      match,
      runtime,
      ui: {
        countdownValue,
        showQuestionIntro,
        paused,
        resumeRequired,
        notice,
        lyricsElapsedMs: getLyricsElapsedMs(),
        voice: voiceState
          ? {
              playerId: voiceState.playerId,
              status: voiceState.status,
              transcripts: voiceState.transcripts,
              remainingMs: Math.max(0, voiceState.deadlineMs - now()),
              speechStarted: voiceState.speechStartedAtMs !== null,
              verdict: voiceState.verdict,
              recognitionAvailable: voiceState.recognitionAvailable,
              stage: voiceState.stage,
              stageDetail: voiceState.stageDetail,
              manualReason: voiceState.manualReason,
            }
          : null,
        playbackStarted,
        finished,
        aborted,
        canReplay: runtime && match ? canReplay(runtime, match.settings) : false,
      },
    });
  }

  // ----- Wake Lock（対応端末だけ。失敗しても続行） -----
  async function acquireWakeLock() {
    try {
      if (!navigator.wakeLock || wakeLock) return;
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener?.("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  }
  function releaseWakeLock() {
    try {
      wakeLock?.release?.();
    } catch {
      /* 無視 */
    }
    wakeLock = null;
  }

  // ----- 歌詞の文字送り時計（ACTIVE中だけ進む） -----
  function getLyricsElapsedMs() {
    if (lyricsClock.startedAtMs === null) return lyricsClock.elapsedMs;
    return lyricsClock.elapsedMs + (now() - lyricsClock.startedAtMs);
  }
  function startLyricsClock() {
    if (lyricsClock.startedAtMs !== null) return;
    lyricsClock.startedAtMs = now();
    lyricsClock.intervalId = setInterval(emit, LYRICS_TICK_MS);
  }
  function stopLyricsClock() {
    if (lyricsClock.startedAtMs !== null) {
      lyricsClock.elapsedMs += now() - lyricsClock.startedAtMs;
      lyricsClock.startedAtMs = null;
    }
    if (lyricsClock.intervalId !== null) {
      clearInterval(lyricsClock.intervalId);
      lyricsClock.intervalId = null;
    }
  }
  function resetLyricsClock() {
    stopLyricsClock();
    lyricsClock.elapsedMs = 0;
  }

  // ----- 再生 -----
  function currentPlaybackKey() {
    return {
      quizType: match.settings.quizType,
      song: runtime.question.song,
      seed: match.seed,
      ordinal: runtime.ordinal,
      instantClipSec: match.settings.instantClipSec,
    };
  }

  function handleAudioFailure(message) {
    // 回答中・結果表示中の失敗は無視（既に音は不要）。出題中だけ差し替える。
    if (!runtime) return;
    if (![PARTY_PHASE.ACTIVE, PARTY_PHASE.COUNTDOWN, PARTY_PHASE.QUESTION_INTRO].includes(runtime.phase)) return;
    replaceCurrentQuestion(message);
  }

  function startPlaybackForCurrentQuestion() {
    const { settings } = match;
    playbackStarted = false;
    const onError = (message) => handleAudioFailure(message);
    const onStart = () => {
      playbackStarted = true;
      // 読み込みに時間がかかり、鳴り始めた時点でもう回答権が確定していたら即座に止める
      if (runtime.phase !== PARTY_PHASE.ACTIVE) pauseAudioForExternalUi();
      emit();
    };
    if (settings.quizType === PARTY_QUIZ_TYPE.LYRICS) {
      startLyricsClock();
      return;
    }
    // 曲末到達／区間の自動停止：playbackEnded を立てる（再聴できるタイプでは「🔁 もう一度聴く」が出る）。
    // 別の問題・答え合わせ再生のコールバックが漏れて届かないよう、問題の ordinal を照合する。
    const ordinalAtStart = runtime.ordinal;
    const onEnded = () => {
      if (!runtime || runtime.ordinal !== ordinalAtStart || runtime.solutionRevealed) return;
      runtime = markPlaybackEnded(runtime);
      emit();
    };
    if (settings.quizType === PARTY_QUIZ_TYPE.INTRO) {
      playSongIntro(runtime.question.song, onError, onStart, onEnded);
      return;
    }
    const plan = resolveQuestionPlaybackPlan(currentPlaybackKey());
    playSongFromRandomPosition(runtime.question.song, plan.computeStartTimeSec, plan.playDurationSec, onError, onStart, onEnded, onEnded);
  }

  // 正解後の答え合わせ再生（演出）。失敗しても正解・得点・公開・次へには影響させない。
  function startReviewPlayback() {
    if (!runtime || runtime.phase !== PARTY_PHASE.CORRECT_RESULT) return;
    const ordinalAtStart = runtime.ordinal;
    const plan = resolveReviewPlaybackPlan({
      quizType: match.settings.quizType,
      question: runtime.question,
      seed: match.seed,
      ordinal: runtime.ordinal,
      instantClipSec: match.settings.instantClipSec,
      lyricsElapsedMs: getLyricsElapsedMs(),
    });
    const ignore = () => {};
    const onReviewError = (message) => {
      console.warn("[パーティー対戦] 答え合わせ音源の再生に失敗しました（演出のみのため進行には影響しません）", message);
    };
    const onReviewStart = () => {
      // 答え合わせ中に「次へ」「判定を修正」で結果表示を抜けていたら、鳴り始めた音を止める
      if (!runtime || runtime.ordinal !== ordinalAtStart || runtime.phase !== PARTY_PHASE.CORRECT_RESULT) stopAudio();
    };
    if (match.settings.quizType === PARTY_QUIZ_TYPE.INTRO) {
      playSongIntro(runtime.question.song, onReviewError, onReviewStart, ignore);
      return;
    }
    playSongFromRandomPosition(runtime.question.song, plan.computeStartTimeSec, plan.playDurationSec, onReviewError, onReviewStart, ignore, ignore);
  }

  function pausePlaybackKeepingPosition() {
    pauseAudioForExternalUi();
    stopLyricsClock();
  }

  function resumePlaybackFromPosition() {
    if (match.settings.quizType === PARTY_QUIZ_TYPE.LYRICS) {
      startLyricsClock();
      return;
    }
    resumeAudioForExternalUi();
  }

  // ----- 問題のセットアップと進行 -----
  function nextOrdinal() {
    ordinalCounter += 1;
    return ordinalCounter;
  }

  function setupQuestion(question, { isSuddenDeath }) {
    stopAudio();
    resetLyricsClock();
    clearVoice();
    arbiter.disable();
    const questionNumber = isSuddenDeath
      ? match.plannedCount + match.stats.suddenDeathQuestionCount + 1
      : match.completedQuestionCount + 1;
    runtime = {
      ...createQuestionRuntime({
        question,
        questionNumber,
        totalQuestions: match.plannedCount,
        isSuddenDeath,
        participantIds: resolveParticipantIds(match),
      }),
      ordinal: nextOrdinal(),
    };
    showQuestionIntro = true;
    countdownValue = null;
    emit();
    schedule(() => {
      showQuestionIntro = false;
      startCountdown();
    }, QUESTION_INTRO_MS);
  }

  function startCountdown() {
    // 【公開ルール】正解曲名を公開した問題は二度と出題中へ戻さない（beginCountdown が null を返す）
    const next = beginCountdown(runtime);
    if (!next) {
      emit();
      return;
    }
    runtime = next;
    arbiter.disable();
    countdownValue = 3;
    playSfx(SFX_EVENTS.COUNTDOWN_TICK);
    emit();
    schedule(() => {
      countdownValue = 2;
      playSfx(SFX_EVENTS.COUNTDOWN_TICK);
      emit();
      schedule(() => {
        countdownValue = 1;
        playSfx(SFX_EVENTS.COUNTDOWN_FINAL);
        emit();
        schedule(startActive, COUNTDOWN_STEP_MS);
      }, COUNTDOWN_STEP_MS);
    }, COUNTDOWN_STEP_MS);
  }

  // START：入力を有効化し、再生（または再開）する。
  function startActive() {
    runtime = activateQuestion(runtime);
    countdownValue = "START";
    playSfx(SFX_EVENTS.GAME_START);
    arbiter.enable(now());
    if (runtime.hasStartedPlayback && !runtime.needsFreshPlayback) {
      resumePlaybackFromPosition();
    } else {
      // 最初から鳴らす（初回の出題再生／再聴）：再生回数を1つ進める（一瞬の「再生 N／M回」）
      runtime = markPlaybackStarted({ ...runtime, hasStartedPlayback: true, needsFreshPlayback: false });
      startPlaybackForCurrentQuestion();
    }
    emit();
    schedule(() => {
      if (countdownValue === "START") countdownValue = null;
      emit();
    }, START_LABEL_MS);
  }

  // 音源失敗時の差し替え。予備曲→未出題の曲→（無ければ）安全に中断。
  function replaceCurrentQuestion(message) {
    clearAllTimers();
    stopAudio();
    resetLyricsClock();
    arbiter.disable();
    const failedSongId = runtime.question.song.id;
    match = {
      ...match,
      stats: { ...match.stats, replacedCount: match.stats.replacedCount + 1 },
      usedSongIds: [...match.usedSongIds, failedSongId],
      // 予定配列に残っている同じ曲は二度と出さない
      questions: match.questions.filter((question) => question.song.id !== failedSongId),
    };
    reserveQueue = reserveQueue.filter((question) => question.song.id !== failedSongId);
    pool = { ...pool, poolSongs: pool.poolSongs.filter((song) => song.id !== failedSongId) };
    let replacement = reserveQueue.shift() ?? null;
    if (!replacement) {
      const song = pickSuddenDeathSong(pool.poolSongs, match.usedSongIds, failedSongId, Math.random);
      replacement = song
        ? buildQuestionForSong(song, {
            settings: match.settings,
            distractorSongs: pool.distractorSongs,
            songsWithLyrics: pool.songsWithLyrics,
            random: Math.random,
            seed: match.seed,
            ordinal: nextOrdinal(),
          })
        : null;
    }
    if (!replacement) {
      notice = { text: "音源を再生できる曲が無くなったため、対戦を終了します。", kind: "error" };
      abortMatch();
      return;
    }
    notice = { text: "この問題の音源を再生できません。別の問題に差し替えます。", kind: "warn", detail: message };
    const wasSuddenDeath = runtime.isSuddenDeath;
    emit();
    schedule(() => {
      notice = null;
      setupQuestion(replacement, { isSuddenDeath: wasSuddenDeath });
    }, 1500);
  }

  function pickNextQuestion() {
    // 予定問題（差し替えで消えた場合は予備から補充）
    const remainingPlanned = match.questions.filter((question) => !match.usedSongIds.includes(question.song.id));
    let next = remainingPlanned[0] ?? reserveQueue.shift() ?? null;
    if (!next) {
      const song = pickSuddenDeathSong(pool.poolSongs, match.usedSongIds, runtime?.question.song.id ?? null, Math.random);
      next = song
        ? buildQuestionForSong(song, {
            settings: match.settings,
            distractorSongs: pool.distractorSongs,
            songsWithLyrics: pool.songsWithLyrics,
            random: Math.random,
            seed: match.seed,
            ordinal: nextOrdinal(),
          })
        : null;
    }
    return next;
  }

  function buildSuddenDeathQuestion() {
    const song = pickSuddenDeathSong(pool.poolSongs, match.usedSongIds, runtime?.question.song.id ?? null, Math.random);
    if (!song) return null;
    return buildQuestionForSong(song, {
      settings: match.settings,
      distractorSongs: pool.distractorSongs,
      songsWithLyrics: pool.songsWithLyrics,
      random: Math.random,
      seed: match.seed,
      ordinal: nextOrdinal(),
    });
  }

  function finishMatch(winnerId) {
    clearAllTimers();
    stopAudio();
    resetLyricsClock();
    clearVoice();
    arbiter.disable();
    releaseWakeLock();
    match = { ...match, status: "finished", winnerId, finishedAt: Date.now() };
    finished = true;
    savePartyBattleHistory(match, { playlistName });
    emit();
  }

  function abortMatch() {
    clearAllTimers();
    stopAudio();
    resetLyricsClock();
    clearVoice();
    arbiter.disable();
    releaseWakeLock();
    if (match) match = { ...match, status: "aborted" };
    aborted = true;
    emit();
  }

  // ----- 回答の確定処理（4択・音声共通） -----
  function applyWrong({ judgedBy }) {
    const claimerId = runtime.acceptedClaim?.playerId ?? null;
    const next = resolveWrong(runtime, { otetsuki: match.settings.otetsuki, judgedBy });
    if (!next) return;
    runtime = next;
    // 正解表示中に人間判定で覆された場合、既に入れた1点を戻す
    ({ match, runtime } = revokeCorrectScore(match, runtime, claimerId));
    match = countWrongAttempt(match);
    playSfx(SFX_EVENTS.QUIZ_WRONG);
    emit();
    scheduleWrongResultEnd();
  }

  function scheduleWrongResultEnd() {
    schedule(() => {
      if (runtime.phase !== PARTY_PHASE.WRONG_RESULT) return;
      const next = finishWrongResult(runtime);
      if (!next) return;
      runtime = next;
      startCountdown();
    }, PARTY_WRONG_RESULT_MS);
  }

  function applyCorrect({ judgedBy }) {
    const next = resolveCorrect(runtime, { judgedBy });
    if (!next) return;
    runtime = next;
    ({ match, runtime } = creditCorrectScore(match, runtime));
    stopAudio();
    stopLyricsClock(); // 歌詞のヒント段階（答え合わせの開始位置）はここで止まった値を使う
    playSfx(SFX_EVENTS.QUIZ_CORRECT);
    emit();
    // 正解SFXと重ならないよう少し置いてから、その問題で使った箇所を答え合わせとして流す
    schedule(startReviewPlayback, REVIEW_PLAYBACK_DELAY_MS);
  }

  // ----- 音声回答 -----
  function clearVoice() {
    if (!voiceState) return;
    voiceState.session?.abort?.();
    if (voiceState.intervalId !== null) clearInterval(voiceState.intervalId);
    voiceState = null;
  }

  function beginVoiceAnswer(playerId) {
    const claimedAtMs = now();
    const startTimeoutSec = match.settings.voiceStartTimeoutSec;
    const recognitionAvailable = isVoiceRecognitionAvailable();
    voiceState = {
      playerId,
      claimedAtMs,
      speechStartedAtMs: null,
      deadlineMs: computeVoiceDeadline({ claimedAtMs, speechStartedAtMs: null, startTimeoutSec }),
      transcripts: [],
      status: recognitionAvailable ? "listening" : "manual",
      session: null,
      intervalId: null,
      verdict: null,
      recognitionAvailable,
      stage: recognitionAvailable ? VOICE_STAGE.STARTING : null,
      stageDetail: "",
      // 人間判定へ落ちた理由（画面に「なぜ人間判定なのか」を出すため）
      manualReason: recognitionAvailable ? null : `unavailable:${getVoiceUnavailableReason() ?? "unsupported"}`,
    };
    if (!recognitionAvailable) {
      emit();
      return;
    }
    // 【iOS対策】start() はユーザー操作（回答！を離した pointerup）の同期処理内で呼ぶ（await を挟まない）。
    voiceState.session = startVoiceRecognitionSession({
      onStage: (stage, detail) => {
        if (!voiceState) return;
        voiceState.stage = stage;
        voiceState.stageDetail = detail ?? "";
        emit();
      },
      onSpeechStart: () => {
        if (!voiceState || voiceState.speechStartedAtMs !== null) return;
        voiceState.speechStartedAtMs = now();
        voiceState.deadlineMs = computeVoiceDeadline({
          claimedAtMs: voiceState.claimedAtMs,
          speechStartedAtMs: voiceState.speechStartedAtMs,
          startTimeoutSec,
        });
        emit();
      },
      onTranscripts: (transcripts, isFinal) => {
        if (!voiceState) return;
        voiceState.transcripts = transcripts;
        if (isFinal) judgeVoiceTranscripts(transcripts);
        else emit();
      },
      onEnd: (reason) => {
        if (!voiceState || voiceState.status !== "listening") return;
        // 途中結果しか来ないまま終わった（iOSで多い）：その途中結果で判定する
        if (reason === "no-final" && voiceState.transcripts.length > 0) {
          judgeVoiceTranscripts(voiceState.transcripts);
          return;
        }
        if (isVoiceFatalEndReason(reason)) {
          // 認識APIそのものが使えない：以降の回答はこの試合の間ずっと人間判定で続ける
          // （4択へは自動変更しない。公平性を変えないため）
          markVoiceRecognitionUnavailable(reason);
          voiceState.recognitionAvailable = false;
        }
        if (reason !== "final") fallbackToManualJudgement(reason);
      },
    });
    voiceState.intervalId = setInterval(() => {
      if (!voiceState || voiceState.status !== "listening") return;
      if (now() >= voiceState.deadlineMs) {
        const transcripts = voiceState.transcripts;
        voiceState.session?.abort?.();
        if (transcripts.length > 0) judgeVoiceTranscripts(transcripts);
        else fallbackToManualJudgement("timeout");
        return;
      }
      emit();
    }, VOICE_TICK_MS);
  }

  function stopVoiceListening() {
    if (!voiceState) return;
    voiceState.session?.abort?.();
    voiceState.session = null;
    if (voiceState.intervalId !== null) clearInterval(voiceState.intervalId);
    voiceState.intervalId = null;
  }

  function fallbackToManualJudgement(reason = "unknown") {
    if (!voiceState) return;
    stopVoiceListening();
    voiceState.status = "manual";
    voiceState.manualReason = reason;
    emit();
  }

  function judgeVoiceTranscripts(transcripts) {
    if (!voiceState || voiceState.status !== "listening") return;
    stopVoiceListening();
    const matchResult = matchSpokenSongName(transcripts, SONGS);
    const verdict = decideVoiceVerdict(matchResult, runtime.question.song.id);
    voiceState.verdict = { kind: verdict, matchedTitle: matchResult.song?.title ?? null };
    if (verdict === "correct") {
      voiceState.status = "judged";
      applyCorrect({ judgedBy: "auto" });
    } else if (verdict === "wrong") {
      voiceState.status = "judged";
      applyWrong({ judgedBy: "auto" });
    } else {
      voiceState.status = "manual";
      voiceState.manualReason = `verdict:${verdict}`;
      emit();
    }
  }

  // ----- 公開API -----
  return {
    load(newMatch, newPool) {
      match = newMatch;
      pool = newPool;
      reserveQueue = match.questions.slice(match.plannedCount);
      match = { ...match, questions: match.questions.slice(0, match.plannedCount) };
      const playlist = match.settings.songSource === "playlist" ? getPlaylistById(match.settings.playlistId) : null;
      playlistName = playlist?.playlistName ?? null;
      finished = false;
      aborted = false;
      ordinalCounter = 0;
    },

    start() {
      // 連続再生（ミニプレイヤー）・試聴など、他の音声を止めてから盤面へ入る（歌詞モードは自前の音源を
      // 鳴らさないため、audio.js側の自動停止に頼れない）。
      notifyPlaybackStarting("partyBattle");
      match = { ...match, startedAt: Date.now() };
      rememberPartyPlayerNames(match.players.map((player) => player.name));
      saveLastPartySettings(match.settings);
      acquireWakeLock();
      setupQuestion(pickNextQuestion(), { isSuddenDeath: false });
    },

    getSnapshot() {
      return { match, runtime };
    },

    // 4択：選択肢が押された（pointerdown時刻つき）。
    pressChoice(playerId, choiceId, pointerStartedAtMs) {
      if (paused || !runtime) return;
      if (!arbiter.tryClaim(pointerStartedAtMs)) return;
      const next = claimAnswer(runtime, { playerId, choiceId });
      if (!next) {
        arbiter.enable(now()); // 無効な入力だったので受付を戻す（START時刻は今でよい：START前の指は既に弾いた後）
        return;
      }
      runtime = next;
      pausePlaybackKeepingPosition();
      if (isClaimedChoiceCorrect(runtime)) applyCorrect({ judgedBy: "auto" });
      else applyWrong({ judgedBy: "auto" });
    },

    // 音声：「回答！」が押された。
    pressAnswer(playerId, pointerStartedAtMs) {
      if (paused || !runtime) return;
      if (!arbiter.tryClaim(pointerStartedAtMs)) return;
      const next = claimAnswer(runtime, { playerId, choiceId: null });
      if (!next) {
        arbiter.enable(now());
        return;
      }
      runtime = next;
      pausePlaybackKeepingPosition();
      beginVoiceAnswer(playerId);
      emit();
    },

    // 音声：人間判定（曖昧時・「判定を修正」）。
    humanJudge(isCorrect) {
      if (paused || !runtime || !voiceState) return;
      clearAllTimers(); // 不正解表示→再カウントの予約があれば止める
      voiceState.status = "judged";
      voiceState.verdict = { kind: isCorrect ? "correct" : "wrong", matchedTitle: voiceState.verdict?.matchedTitle ?? null, byHuman: true };
      if (isCorrect) {
        if (runtime.phase === PARTY_PHASE.CORRECT_RESULT) {
          emit();
          return;
        }
        applyCorrect({ judgedBy: "human" });
      } else {
        if (runtime.phase === PARTY_PHASE.WRONG_RESULT) {
          scheduleWrongResultEnd();
          emit();
          return;
        }
        // 【2026-09-15 第2回実機QA修正・公開ルール】正解表示中（正解曲名は公開済み）に「不正解」へ修正した場合、
        // 同じ問題を再開すると全員が答えを知った状態になるため再開しない。+1点を取り消し、0点でこの問題を終了する。
        if (runtime.phase === PARTY_PHASE.CORRECT_RESULT) {
          stopAudio(); // 答え合わせ音源を即停止（clearAllTimers は上で済み）
          const claimerId = runtime.acceptedClaim?.playerId ?? null;
          ({ match, runtime } = revokeCorrectScore(match, runtime, claimerId));
          const voided = voidRevealedCorrect(runtime);
          if (voided) runtime = voided;
          playSfx(SFX_EVENTS.QUIZ_WRONG);
          emit();
          return;
        }
        applyWrong({ judgedBy: "human" });
      }
    },

    // 音声：「判定を修正」→人間判定オーバーレイへ（自動判定の結果表示を止める）。
    requestJudgementOverride() {
      if (paused || !runtime || !voiceState) return;
      if (runtime.phase !== PARTY_PHASE.CORRECT_RESULT && runtime.phase !== PARTY_PHASE.WRONG_RESULT) return;
      clearAllTimers();
      if (runtime.phase === PARTY_PHASE.CORRECT_RESULT) stopAudio(); // 答え合わせ音源を止めて判定に集中する
      voiceState.status = "manual";
      emit();
    },

    // 通常モード：中央「全員PASS｜長押し」成立。
    passAll() {
      if (paused || !runtime) return;
      const next = passQuestion(runtime);
      if (!next) return;
      arbiter.disable();
      runtime = next;
      stopAudio();
      stopLyricsClock();
      playSfx(SFX_EVENTS.UI_BACK);
      emit();
    },

    // 中央「🔁 もう一度聴く」（ランダム再生／アウトロ／一瞬。誰が押してもよい）。
    // 問題は継続したまま、3・2・1 → START で同じ問題の同じ位置を最初から鳴らす。得点・回答権・お手つき・
    // 消去済み候補・問題番号・公開フラグは変えない。カウントダウン中は入力を受理しない（arbiter.disable）。
    replay() {
      if (paused || !runtime) return;
      const next = beginReplay(runtime, match.settings);
      if (!next) return;
      clearAllTimers();
      stopAudio();
      runtime = next;
      playSfx(SFX_EVENTS.UI_CLICK);
      startCountdown();
    },

    // 「次の問題へ」（誰が押してもよい）。
    next() {
      if (paused || !runtime || !isWaitingForNext(runtime)) return;
      // 答え合わせ音源（再生中でも開始予約中でも）を止め、前の問題のタイマーが次へ漏れないようにする
      clearAllTimers();
      stopAudio();
      playSfx(SFX_EVENTS.UI_CONFIRM);
      match = applyQuestionOutcome(match, runtime);
      if (runtime.isSuddenDeath) {
        const outcome = resolveSuddenDeathOutcome(runtime);
        if (outcome.kind === "finished") {
          finishMatch(outcome.winnerId);
          return;
        }
        const question = buildSuddenDeathQuestion();
        if (!question) {
          finishMatch(match.suddenDeath.participantIds[0] ?? null);
          return;
        }
        setupQuestion(question, { isSuddenDeath: true });
        return;
      }
      if (match.completedQuestionCount >= match.plannedCount) {
        const outcome = resolveAfterPlannedQuestions(match);
        if (outcome.kind === "finished") {
          finishMatch(outcome.winnerId);
          return;
        }
        match = { ...match, status: "suddenDeath", suddenDeath: { participantIds: outcome.participantIds, round: 0 } };
        const question = buildSuddenDeathQuestion();
        if (!question) {
          finishMatch(outcome.participantIds[0] ?? null);
          return;
        }
        setupQuestion(question, { isSuddenDeath: true });
        return;
      }
      const question = pickNextQuestion();
      if (!question) {
        // 曲が尽きた（差し替えが重なった等）：ここまでの得点で終了
        const outcome = resolveAfterPlannedQuestions(match);
        finishMatch(outcome.kind === "finished" ? outcome.winnerId : outcome.participantIds[0]);
        return;
      }
      setupQuestion(question, { isSuddenDeath: false });
    },

    // バックグラウンドへ行った：進行を安全に止める。
    pauseForBackground() {
      if (!runtime || paused || finished || aborted) return;
      paused = true;
      resumeRequired = true;
      pausedPhaseSnapshot = runtime.phase;
      clearAllTimers();
      arbiter.disable();
      pausePlaybackKeepingPosition();
      if (voiceState && voiceState.status === "listening") {
        stopVoiceListening();
        voiceState.status = "manual";
      }
      countdownValue = null;
      showQuestionIntro = false;
      emit();
    },

    // 「対戦を再開」タップ：3・2・1から再開（結果表示中は表示に戻るだけ）。
    confirmResume() {
      if (!paused) return;
      paused = false;
      resumeRequired = false;
      const phase = pausedPhaseSnapshot;
      pausedPhaseSnapshot = null;
      if (phase === PARTY_PHASE.QUESTION_INTRO || phase === PARTY_PHASE.COUNTDOWN || phase === PARTY_PHASE.ACTIVE) {
        startCountdown();
        return;
      }
      if (phase === PARTY_PHASE.WRONG_RESULT) {
        const next = finishWrongResult(runtime);
        if (next) {
          runtime = next;
          startCountdown();
          return;
        }
      }
      emit();
    },

    isPaused() {
      return paused;
    },

    // 途中終了（長押し＋確認のあと）。履歴は保存しない。
    abort() {
      abortMatch();
    },

    dispose() {
      clearAllTimers();
      stopLyricsClock();
      clearVoice();
      releaseWakeLock();
    },

    reacquireWakeLock() {
      if (!finished && !aborted && match) acquireWakeLock();
    },
  };
}
