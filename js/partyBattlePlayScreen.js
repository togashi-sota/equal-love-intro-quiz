// パーティー対戦（2026-09-15新設）の「対戦盤面」の描画を担当するファイル。
//
// 【役割】js/partyBattleEngine.jsが状態を変えるたびに渡してくるスナップショット
// （{ match, runtime, ui }）を、そのまま画面に描くだけ。ルール判定は一切持たない。
// 逆に、席の選択肢・「回答！」・PASS・次へ・人間判定などのタップは、時刻（pointerdownの
// timeStamp）を添えてエンジンへ渡す（フライング判定はエンジン側のarbiterが行う）。
//
// 【レイアウト】盤面（#party-play-root）はviewport高さに固定した全画面のグリッド。
//   4人（3人）: 「席 / 中央 / 席」の3列×3行。四隅が席、中央のセルに共通情報（問題番号・カウント・
//               全員PASS・歌詞）。席と中央が重ならないよう、中央は独立したグリッドセルにする。
//   2人      : 縦向きは上下2席（上の席は180度回転）、横向きは左右2席（90度／-90度回転）。
// 各席の中身は席コンテナ単位で回転させ（本人確定）、候補順は全席同じ。

import {
  PARTY_PHASE,
  PARTY_QUIZ_TYPE,
  PARTY_ANSWER_METHOD,
  PARTY_PASS_LONG_PRESS_MS,
  PARTY_QUIT_LONG_PRESS_MS,
  canPlayerAnswer,
  canTapChoice,
  canRevealSolution,
  resolveSeatRotation,
} from "./partyBattleState.js";
import { attachPressHandler, attachLongPressHandler } from "./partyBattleInput.js";
import { computeStealHintProgress } from "./lyricsQuizBattleTiming.js";

let elements = null;
let engine = null;
let seatElements = new Map(); // seatId -> { root, inner, scoreEl, choiceButtons: Map<choiceId, button>, answerButton, passButton, lockOverlay, lockLabel }
let renderedQuestionOrdinal = null;
let renderedMatchToken = null;
let resizeObserver = null;
let lastSnapshot = null;

function isLandscape() {
  return window.innerWidth > window.innerHeight;
}

// ----- 席の組み立て（試合開始時に1回） -----
function buildSeat(match, seat, player) {
  const root = document.createElement("div");
  root.className = "party-seat";
  root.dataset.seatId = seat.seatId;
  root.dataset.color = seat.color;
  if (!player) {
    root.classList.add("is-empty");
    return { root, inner: null, choiceButtons: new Map() };
  }
  root.dataset.playerId = player.id;
  const inner = document.createElement("div");
  inner.className = "party-seat-inner";

  const header = document.createElement("div");
  header.className = "party-seat-header";
  const badge = document.createElement("span");
  badge.className = "party-seat-badge";
  badge.textContent = `P${player.index + 1}`;
  const name = document.createElement("span");
  name.className = "party-seat-name";
  name.textContent = player.name;
  const score = document.createElement("span");
  score.className = "party-seat-score";
  score.textContent = "0pt";
  header.append(badge, name, score);
  inner.appendChild(header);

  const body = document.createElement("div");
  body.className = "party-seat-body";
  inner.appendChild(body);

  const lockOverlay = document.createElement("div");
  lockOverlay.className = "party-seat-lock";
  const lockLabel = document.createElement("span");
  lockLabel.className = "party-seat-lock-label";
  lockOverlay.appendChild(lockLabel);
  lockOverlay.hidden = true;
  inner.appendChild(lockOverlay);

  root.appendChild(inner);
  return { root, inner, body, scoreEl: score, choiceButtons: new Map(), answerButton: null, passButton: null, lockOverlay, lockLabel, playerId: player.id };
}

function buildSeats(match) {
  elements.seats.innerHTML = "";
  seatElements = new Map();
  elements.root.dataset.layout = match.layout;
  elements.root.dataset.answerMethod = match.settings.answerMethod;
  elements.root.dataset.quizType = match.settings.quizType;
  match.seats.forEach((seat) => {
    const player = seat.playerIndex === null ? null : match.players.find((candidate) => candidate.index === seat.playerIndex);
    const built = buildSeat(match, seat, player);
    elements.seats.appendChild(built.root);
    seatElements.set(seat.seatId, built);
  });
  applySeatRotations(match);
}

function applySeatRotations(match) {
  const landscape = isLandscape();
  elements.root.dataset.orientation = landscape ? "landscape" : "portrait";
  seatElements.forEach((seat, seatId) => {
    const rotation = resolveSeatRotation(seatId, { layout: match.layout, isLandscape: landscape });
    seat.root.dataset.rotation = String(rotation);
    if (seat.inner) {
      const { clientWidth, clientHeight } = seat.root;
      // 90度回転する席は、回転後に枠へ収まるよう幅と高さを入れ替えて指定する。
      if (Math.abs(rotation) === 90) {
        seat.inner.style.width = `${clientHeight}px`;
        seat.inner.style.height = `${clientWidth}px`;
      } else {
        seat.inner.style.width = "";
        seat.inner.style.height = "";
      }
    }
  });
}

// ----- 席の中身（問題が変わるたび） -----
function buildSeatBodyForQuestion(match, runtime) {
  const { answerMethod, quizType } = match.settings;
  seatElements.forEach((seat) => {
    if (!seat.body) return;
    seat.body.innerHTML = "";
    seat.choiceButtons = new Map();
    seat.answerButton = null;
    seat.passButton = null;
    const playerId = seat.playerId;

    if (answerMethod === PARTY_ANSWER_METHOD.FOUR_CHOICE) {
      const grid = document.createElement("div");
      grid.className = "party-choice-grid";
      runtime.question.choices.forEach((choice, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "party-choice-button";
        button.dataset.choiceId = choice.id;
        const letter = document.createElement("span");
        letter.className = "party-choice-letter";
        letter.textContent = "ABCD"[index] ?? "";
        const title = document.createElement("span");
        title.className = "party-choice-title";
        title.textContent = choice.title;
        button.append(letter, title);
        attachPressHandler(button, (pointerStartedAtMs) => engine.pressChoice(playerId, choice.id, pointerStartedAtMs));
        grid.appendChild(button);
        seat.choiceButtons.set(choice.id, button);
      });
      seat.body.appendChild(grid);
    } else {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "party-answer-button";
      button.textContent = "回答！";
      attachPressHandler(button, (pointerStartedAtMs) => engine.pressAnswer(playerId, pointerStartedAtMs));
      seat.body.appendChild(button);
      seat.answerButton = button;
    }

    if (quizType === PARTY_QUIZ_TYPE.INSTANT) {
      const pass = document.createElement("button");
      pass.type = "button";
      pass.className = "party-instant-pass-button";
      pass.textContent = "PASS";
      attachPressHandler(pass, () => engine.pressInstantPass(playerId));
      seat.body.appendChild(pass);
      seat.passButton = pass;
    }
  });
}

// ----- 席の状態（毎回） -----
function updateSeats(match, runtime) {
  const active = runtime.phase === PARTY_PHASE.ACTIVE;
  seatElements.forEach((seat) => {
    if (!seat.playerId) return;
    const playerId = seat.playerId;
    seat.scoreEl.textContent = `${match.scores[playerId] ?? 0}pt`;
    const isParticipant = runtime.participantIds.includes(playerId);
    const isLocked = runtime.lockedPlayerIds.includes(playerId);
    const hasPassed = runtime.instantPassedPlayerIds.includes(playerId);
    const isClaimer = runtime.acceptedClaim?.playerId === playerId;
    const answerable = canPlayerAnswer(runtime, playerId);

    seat.root.classList.toggle("is-claimer", isClaimer);
    seat.root.classList.toggle("is-answerable", answerable);
    seat.root.classList.toggle("is-spectator", !isParticipant);

    seat.choiceButtons.forEach((button, choiceId) => {
      const eliminated = runtime.eliminatedChoiceIds.includes(choiceId);
      button.classList.toggle("is-eliminated", eliminated);
      button.disabled = !canTapChoice(runtime, playerId, choiceId);
    });
    if (seat.answerButton) seat.answerButton.disabled = !answerable;
    if (seat.passButton) seat.passButton.disabled = !answerable;

    let lockText = null;
    if (!isParticipant) lockText = "観戦中";
    else if (isLocked) lockText = "お手つき";
    else if (hasPassed && active) lockText = "PASS済み";
    seat.lockOverlay.hidden = lockText === null;
    seat.lockLabel.textContent = lockText ?? "";
  });
}

// ----- 中央・オーバーレイ -----
function playerById(match, playerId) {
  return match.players.find((player) => player.id === playerId) ?? null;
}

function updateCenter(match, runtime, ui) {
  const { settings } = match;
  elements.questionLabel.textContent = runtime.isSuddenDeath
    ? "サドンデス"
    : `第${runtime.questionNumber}問 / 全${runtime.totalQuestions}問`;

  // 歌詞：ACTIVE中に進む時計から、今見せる文字数を毎回計算する（既存の早押し歌詞と同じ関数）
  if (settings.quizType === PARTY_QUIZ_TYPE.LYRICS) {
    elements.lyrics.hidden = false;
    const hintTexts = (runtime.question.hints ?? []).map((hint) => hint.segment?.text ?? "");
    const { levels } = computeStealHintProgress({ elapsedMs: ui.lyricsElapsedMs, hintTexts });
    elements.lyrics.innerHTML = "";
    levels.forEach((level) => {
      const line = document.createElement("p");
      line.className = "party-lyric-line";
      line.textContent = level.revealedText;
      elements.lyrics.appendChild(line);
    });
    if (levels.length === 0) {
      const line = document.createElement("p");
      line.className = "party-lyric-line is-placeholder";
      line.textContent = "…";
      elements.lyrics.appendChild(line);
    }
  } else {
    elements.lyrics.hidden = true;
  }

  let status = "";
  if (ui.countdownValue !== null) {
    status = ui.countdownValue === "START" ? "START!" : String(ui.countdownValue);
  } else if (runtime.phase === PARTY_PHASE.ACTIVE) {
    status = settings.quizType === PARTY_QUIZ_TYPE.INSTANT
      ? `試聴 ${runtime.instantListenIndex} / ${settings.instantMaxListens}回目`
      : settings.answerMethod === PARTY_ANSWER_METHOD.VOICE
        ? "分かったら「回答！」"
        : "分かったら選択肢をタップ";
  } else if (runtime.phase === PARTY_PHASE.CLAIMED) {
    const player = playerById(match, runtime.acceptedClaim?.playerId);
    status = `${player?.name ?? ""} が回答中`;
  }
  elements.status.textContent = status;
  elements.status.classList.toggle("is-countdown", ui.countdownValue !== null);
  elements.status.classList.toggle("is-start", ui.countdownValue === "START");

  const showPass = runtime.phase === PARTY_PHASE.ACTIVE && settings.quizType !== PARTY_QUIZ_TYPE.INSTANT && !ui.paused;
  elements.passButton.hidden = !showPass;
}

function updateIntroOverlay(match, runtime, ui) {
  elements.introOverlay.hidden = !ui.showQuestionIntro;
  if (ui.showQuestionIntro) {
    elements.introText.textContent = runtime.isSuddenDeath
      ? "サドンデス"
      : `第${runtime.questionNumber}問 / 全${runtime.totalQuestions}問`;
  }
}

function updateResultOverlay(match, runtime, ui) {
  const phase = runtime.phase;
  const isResult = phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.WRONG_RESULT || phase === PARTY_PHASE.PASS_RESULT;
  const manualOverride = ui.voice?.status === "manual" && isResult;
  elements.resultOverlay.hidden = !isResult || manualOverride || ui.paused;
  if (!isResult) return;
  const result = runtime.lastResult;
  const player = playerById(match, result?.playerId);
  // 【公開ルール（2026-09-15 第2回実機QA修正）】正解曲名は canRevealSolution（問題終了が確定）のときだけ描く。
  // 不正解（問題継続）では曲名を一切出さず、音声回答なら認識した文字列だけを添える。
  const revealedTitle = canRevealSolution(runtime) ? runtime.question.song.title : "";
  const heard = ui.voice?.transcripts?.[0] ? `認識：「${ui.voice.transcripts[0]}」` : "";
  elements.resultOverlay.dataset.kind = result?.type ?? "";
  if (result?.type === "correct") {
    elements.resultHeadline.textContent = "⭕ 正解！";
    elements.resultSong.textContent = revealedTitle;
    elements.resultDetail.textContent = `${player?.name ?? ""} +1pt${result.judgedBy === "human" ? "（人間判定）" : ""}`;
  } else if (result?.type === "wrong") {
    elements.resultHeadline.textContent = "❌ 不正解…";
    elements.resultSong.textContent = "";
    const resumeText = runtime.revivedAll
      ? `${player?.name ?? ""}　全員復活！ もう一度3・2・1から`
      : `${player?.name ?? ""}${match.settings.otetsuki ? "はこの問題では回答できません" : ""}　3・2・1から再開`;
    elements.resultDetail.textContent = heard ? `${heard}　${resumeText}` : resumeText;
  } else if (result?.type === "voided") {
    elements.resultHeadline.textContent = "❌ 判定を不正解に修正";
    elements.resultSong.textContent = revealedTitle;
    elements.resultDetail.textContent = `${player?.name ?? ""} の+1点を取り消しました。正解は公開済みのため、この問題は0点で終了します`;
  } else {
    elements.resultHeadline.textContent = "全員PASS";
    elements.resultSong.textContent = revealedTitle;
    elements.resultDetail.textContent = "正解は上の曲でした（0点）";
  }
  const showNext = phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.PASS_RESULT;
  elements.resultNextButton.hidden = !showNext;
  // サドンデスで正解が出た＝決着。それ以外は（最終問題でも首位同点ならサドンデスへ進むため）「次へ」で統一。
  elements.resultNextButton.textContent = runtime.isSuddenDeath && result?.type === "correct" ? "結果発表へ" : "次へ";
  const canOverride = Boolean(ui.voice) && (phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.WRONG_RESULT);
  elements.overrideButton.hidden = !canOverride;
  elements.overrideButton.textContent = phase === PARTY_PHASE.CORRECT_RESULT ? "判定を修正（不正解にして0点で終了）" : "判定を修正";
}

// 人間判定へ落ちた理由を、ユーザーに分かる短い文へ（本人指示：「音声回答を選んだのに何も起きない」を禁止）。
function describeManualReason(reason, recognitionAvailable) {
  if (!reason) return recognitionAvailable ? "自動判定できませんでした" : "人間判定モード";
  if (reason.startsWith("unavailable:")) {
    const inner = reason.slice("unavailable:".length);
    if (inner === "unsupported") return "この端末では音声認識APIが利用できません → 人間判定へ";
    return `音声認識が使えなくなったため人間判定へ（${inner}）`;
  }
  if (reason === "unsupported") return "この端末では音声認識APIが利用できません → 人間判定へ";
  if (reason === "start-timeout" || reason === "no-start") return "音声認識が起動しませんでした → 人間判定へ";
  if (reason === "error:not-allowed" || reason === "error:service-not-allowed") return "マイクの使用が許可されていません → 人間判定へ";
  if (reason === "error:network") return "音声認識サービスに接続できません → 人間判定へ";
  if (reason === "error:audio-capture") return "マイクから音を取得できません → 人間判定へ";
  if (reason.startsWith("error:")) return `音声認識エラー（${reason.slice(6)}）→ 人間判定へ`;
  if (reason === "no-speech") return "音声を検出できませんでした → 人間判定へ";
  if (reason === "timeout") return "制限時間内に認識できませんでした → 人間判定へ";
  if (reason === "aborted") return "認識が中断されました → 人間判定へ";
  if (reason.startsWith("verdict:")) return "曲名を自動判定できませんでした（曖昧）→ 人間判定へ";
  return "自動判定できませんでした → 人間判定へ";
}

function describeVoiceStage(voice) {
  switch (voice.stage) {
    case "starting":
      return "音声認識を起動中…";
    case "listening":
      return "聞き取り中（話してください）";
    case "hearing":
      return "認識中…";
    case "result":
      return "認識中…";
    default:
      return "音声認識を準備中…";
  }
}

function updateVoiceOverlay(match, runtime, ui) {
  const voice = ui.voice;
  const show = Boolean(voice) && !ui.paused && (runtime.phase === PARTY_PHASE.CLAIMED || voice.status === "manual");
  elements.voiceOverlay.hidden = !show;
  if (!show) return;
  const player = playerById(match, voice.playerId);
  elements.voicePlayer.textContent = `${player?.name ?? ""} が回答権を獲得`;
  if (voice.status === "listening") {
    const seconds = (voice.remainingMs / 1000).toFixed(1);
    elements.voiceTimer.textContent = voice.speechStarted ? `認識中… 残り ${seconds}秒` : `残り ${seconds}秒（話し始めてください）`;
    elements.voiceTranscript.textContent = voice.transcripts.length > 0 ? `認識：「${voice.transcripts[0]}」` : describeVoiceStage(voice);
    elements.voiceHint.textContent = "曲名をはっきり言ってください";
    elements.judgeRow.hidden = true;
  } else {
    elements.voiceTimer.textContent = "人間判定";
    const reasonText = describeManualReason(voice.manualReason, voice.recognitionAvailable);
    elements.voiceTranscript.textContent = voice.transcripts.length > 0 ? `認識：「${voice.transcripts[0]}」／${reasonText}` : reasonText;
    // 【公開ルール】人間が⭕／❌を確定するまで正解曲名は出さない（❌なら同じ問題が続くため）。
    // 正解表示中からの「判定を修正」（曲名は公開済み）では、❌にすると0点で終了することを伝える。
    elements.voiceHint.textContent =
      runtime.phase === PARTY_PHASE.CORRECT_RESULT
        ? "今の回答を正解のままにしますか？（❌にすると+1点を取り消し、この問題は0点で終了します）"
        : "今の回答を正解にしますか？（その場で聞いた回答で判定してください）";
    elements.judgeRow.hidden = false;
  }
}

function updatePauseOverlay(ui) {
  elements.pauseOverlay.hidden = !ui.resumeRequired;
}

function updateNotice(ui) {
  elements.notice.hidden = !ui.notice;
  if (ui.notice) {
    elements.notice.textContent = ui.notice.text;
    elements.notice.dataset.kind = ui.notice.kind ?? "info";
  }
}

// ----- スナップショット描画 -----
export function renderPartyPlaySnapshot(snapshot) {
  lastSnapshot = snapshot;
  const { match, runtime, ui } = snapshot;
  if (!match || !runtime) return;
  const matchToken = match.startedAt;
  if (renderedMatchToken !== matchToken) {
    renderedMatchToken = matchToken;
    renderedQuestionOrdinal = null;
    buildSeats(match);
  }
  if (renderedQuestionOrdinal !== runtime.ordinal) {
    renderedQuestionOrdinal = runtime.ordinal;
    buildSeatBodyForQuestion(match, runtime);
  }
  elements.root.dataset.phase = runtime.phase;
  updateSeats(match, runtime);
  updateCenter(match, runtime, ui);
  updateIntroOverlay(match, runtime, ui);
  updateResultOverlay(match, runtime, ui);
  updateVoiceOverlay(match, runtime, ui);
  updatePauseOverlay(ui);
  updateNotice(ui);
}

export function setPartyPlayEngine(newEngine) {
  engine = newEngine;
  renderedMatchToken = null;
  renderedQuestionOrdinal = null;
}

export function resetPartyPlayScreen() {
  engine = null;
  lastSnapshot = null;
  renderedMatchToken = null;
  renderedQuestionOrdinal = null;
  elements.seats.innerHTML = "";
  seatElements = new Map();
  [elements.resultOverlay, elements.voiceOverlay, elements.pauseOverlay, elements.notice, elements.introOverlay].forEach((el) => {
    el.hidden = true;
  });
}

// elements: {
//   root, seats, questionLabel, lyrics, status, passButton, passProgress,
//   quitButton, quitProgress, introOverlay, introText,
//   resultOverlay, resultHeadline, resultSong, resultDetail, overrideButton, resultNextButton,
//   voiceOverlay, voicePlayer, voiceTimer, voiceTranscript, voiceHint, judgeRow, judgeCorrectButton, judgeWrongButton,
//   notice, pauseOverlay, resumeButton,
//   onQuitRequested(): 「終了｜長押し」成立時（確認モーダルはmain.js側）
// }
export function initPartyPlayScreen(newElements) {
  elements = newElements;

  attachLongPressHandler(elements.passButton, {
    durationMs: PARTY_PASS_LONG_PRESS_MS,
    onProgress: (progress) => {
      elements.passProgress.style.transform = `scaleX(${progress})`;
    },
    onComplete: () => {
      elements.passProgress.style.transform = "scaleX(0)";
      engine?.passAll();
    },
    onCancel: () => {
      elements.passProgress.style.transform = "scaleX(0)";
    },
  });

  attachLongPressHandler(elements.quitButton, {
    durationMs: PARTY_QUIT_LONG_PRESS_MS,
    onProgress: (progress) => {
      elements.quitProgress.style.transform = `scaleX(${progress})`;
    },
    onComplete: () => {
      elements.quitProgress.style.transform = "scaleX(0)";
      elements.onQuitRequested?.();
    },
    onCancel: () => {
      elements.quitProgress.style.transform = "scaleX(0)";
    },
  });

  elements.resultNextButton.addEventListener("click", () => engine?.next());
  elements.overrideButton.addEventListener("click", () => engine?.requestJudgementOverride());
  elements.judgeCorrectButton.addEventListener("click", () => engine?.humanJudge(true));
  elements.judgeWrongButton.addEventListener("click", () => engine?.humanJudge(false));
  elements.resumeButton.addEventListener("click", () => engine?.confirmResume());

  // 盤面内のタッチ事故対策（partyの盤面だけに限定。アプリ全体には影響させない）
  elements.root.addEventListener("contextmenu", (event) => event.preventDefault());
  elements.root.addEventListener("dblclick", (event) => event.preventDefault());
  elements.root.addEventListener("touchmove", (event) => {
    // 中央の歌詞欄だけは内部スクロールを許す
    if (event.target.closest?.(".party-center-lyrics")) return;
    event.preventDefault();
  }, { passive: false });
  elements.root.addEventListener("gesturestart", (event) => event.preventDefault());

  // 向き・サイズが変わったら席の回転寸法を取り直す
  const relayout = () => {
    if (lastSnapshot?.match) applySeatRotations(lastSnapshot.match);
  };
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", relayout);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(relayout);
    resizeObserver.observe(elements.seats);
  }
}
