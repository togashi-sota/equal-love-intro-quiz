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
  resolveRemainingReplays,
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
  const { answerMethod } = match.settings;
  seatElements.forEach((seat) => {
    if (!seat.body) return;
    seat.body.innerHTML = "";
    seat.choiceButtons = new Map();
    seat.answerButton = null;
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
    // 【2026-09-15 第3回実機QA修正】以前ここにあった一瞬モードの「席ごとのPASS」は撤去した。
    // 再聴は中央の「🔁 もう一度聴く」、諦めは中央の「全員PASS｜長押し」に統一（本人確定）。
  });
}

// ----- 席の状態（毎回） -----
function updateSeats(match, runtime) {
  seatElements.forEach((seat) => {
    if (!seat.playerId) return;
    const playerId = seat.playerId;
    seat.scoreEl.textContent = `${match.scores[playerId] ?? 0}pt`;
    const isParticipant = runtime.participantIds.includes(playerId);
    const isLocked = runtime.lockedPlayerIds.includes(playerId);
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

    let lockText = null;
    if (!isParticipant) lockText = "観戦中";
    else if (isLocked) lockText = "お手つき";
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

  // 歌詞：ACTIVE中に進む時計から、今見せる文字数を毎回計算する（既存の早押し歌詞と同じ関数）。
  // 【2026-09-15 第3回実機QA修正・本人指示】2人対戦は向かい合うため、同じ歌詞進行（1つの state）を
  // 2つのビュー（相手側は180度／横向きは±90度回転）へ同時に描く。3人／4人は従来どおり中央に1つ。
  if (settings.quizType === PARTY_QUIZ_TYPE.LYRICS) {
    elements.lyrics.hidden = false;
    const hintTexts = (runtime.question.hints ?? []).map((hint) => hint.segment?.text ?? "");
    const { levels } = computeStealHintProgress({ elapsedMs: ui.lyricsElapsedMs, hintTexts });
    const isTwoPlayers = match.layout === "two";
    elements.lyrics.classList.toggle("is-dual", isTwoPlayers);
    const views = isTwoPlayers ? ["mirror", "normal"] : ["normal"];
    if (elements.lyrics.childElementCount !== views.length || elements.lyrics.dataset.views !== views.join(",")) {
      elements.lyrics.innerHTML = "";
      elements.lyrics.dataset.views = views.join(",");
      views.forEach((view) => {
        const container = document.createElement("div");
        container.className = `party-lyric-view is-${view}`;
        container.dataset.view = view;
        elements.lyrics.appendChild(container);
      });
    }
    // 【2026-09-15 第4回実機QA修正・本人指示】「ヒントN　歌詞」を同じ1行（row）に置き、最新のヒントを一番上に積む
    // （オンライン早押し歌詞対戦の .online-lyrics-battle-hint-summary-item と同じ「バッジ＋本文」構造）。
    // 表示順を逆にするだけで、進行（computeStealHintProgress）・段階（level）・答え合わせ位置は一切変えない。
    // 2人対戦の2ビューは同じDOM順で描き、相手側はビューごと回転させる（DOM順の反転はしない）ので、
    // どちらの向きから見ても「最新→過去」の順になる。
    const rowsNewestFirst = [...levels].reverse();
    [...elements.lyrics.children].forEach((container) => {
      container.innerHTML = "";
      rowsNewestFirst.forEach((level, index) => {
        const row = document.createElement("p");
        row.className = `party-lyric-row${index === 0 ? " is-latest" : ""}`;
        row.dataset.level = String(level.level);
        const badge = document.createElement("span");
        badge.className = "party-lyric-level";
        badge.textContent = `ヒント${level.level}`;
        const text = document.createElement("span");
        text.className = "party-lyric-text";
        text.textContent = level.revealedText;
        row.append(badge, text);
        container.appendChild(row);
      });
      if (levels.length === 0) {
        const row = document.createElement("p");
        row.className = "party-lyric-row is-placeholder";
        row.textContent = "…";
        container.appendChild(row);
      }
    });
    applyLyricViewRotations(match);
  } else {
    elements.lyrics.hidden = true;
  }

  let status = "";
  const remaining = resolveRemainingReplays(runtime, settings);
  const playCountText =
    settings.quizType === PARTY_QUIZ_TYPE.INSTANT && runtime.playCount > 0
      ? `再生 ${Math.min(runtime.playCount, settings.instantMaxListens)} / ${settings.instantMaxListens}回`
      : "";
  if (ui.countdownValue !== null) {
    status = ui.countdownValue === "START" ? "START!" : String(ui.countdownValue);
  } else if (runtime.phase === PARTY_PHASE.ACTIVE) {
    const base = settings.answerMethod === PARTY_ANSWER_METHOD.VOICE ? "分かったら「回答！」" : "分かったら選択肢をタップ";
    if (settings.quizType === PARTY_QUIZ_TYPE.INSTANT) {
      status = `${playCountText}${runtime.playbackEnded && remaining === 0 ? "（再生は上限まで使いました）" : ""}　${base}`;
    } else if (runtime.playbackEnded && settings.quizType !== PARTY_QUIZ_TYPE.LYRICS) {
      status = `${settings.quizType === PARTY_QUIZ_TYPE.INTRO ? "曲が終わりました" : "再生が終わりました"}　${base}`;
    } else {
      status = base;
    }
  } else if (runtime.phase === PARTY_PHASE.CLAIMED) {
    const player = playerById(match, runtime.acceptedClaim?.playerId);
    status = `${player?.name ?? ""} が回答中`;
  }
  elements.status.textContent = status;
  elements.status.classList.toggle("is-countdown", ui.countdownValue !== null);
  elements.status.classList.toggle("is-start", ui.countdownValue === "START");

  // 「🔁 もう一度聴く」：ランダム再生／アウトロ／一瞬で、再生が終わったあとだけ（一瞬は上限まで）。
  // 「全員PASS｜長押し」：5出題タイプ共通で、出題中はいつでも。両方出るときも同時に押せる配置（CSS側）。
  const showReplay = Boolean(ui.canReplay) && !ui.paused;
  elements.replayButton.hidden = !showReplay;
  if (showReplay) {
    elements.replayButton.textContent = remaining === null ? "🔁 もう一度聴く" : `🔁 もう一度聴く（あと${remaining}回）`;
  }
  const showPass = runtime.phase === PARTY_PHASE.ACTIVE && !ui.paused;
  elements.passButton.hidden = !showPass;
}

// 2人対戦の歌詞ビュー：相手側（mirror）は席と同じ向きへ回転する。縦向き＝180度、横向き＝左が90度／右が-90度
// （横向きでは自分側（normal）も-90度＝右席の向き）。90度系は席と同じく幅と高さを入れ替えて収める。
function applyLyricViewRotations(match) {
  if (!elements.lyrics || match.layout !== "two") return;
  const landscape = isLandscape();
  elements.lyrics.dataset.orientation = landscape ? "landscape" : "portrait";
  [...elements.lyrics.children].forEach((container) => {
    const view = container.dataset.view;
    const rotation = landscape ? (view === "mirror" ? 90 : -90) : view === "mirror" ? 180 : 0;
    container.dataset.rotation = String(rotation);
    const inner = container; // 回転はコンテナ自身（CSS側で transform）
    if (Math.abs(rotation) === 90) {
      const slot = container.parentElement.getBoundingClientRect();
      const slotWidth = slot.width / 2;
      inner.style.width = `${Math.max(0, slot.height)}px`;
      inner.style.height = `${Math.max(0, slotWidth)}px`;
    } else {
      inner.style.width = "";
      inner.style.height = "";
    }
  });
}

function updateIntroOverlay(match, runtime, ui) {
  elements.introOverlay.hidden = !ui.showQuestionIntro;
  if (ui.showQuestionIntro) {
    elements.introText.textContent = runtime.isSuddenDeath
      ? "サドンデス"
      : `第${runtime.questionNumber}問 / 全${runtime.totalQuestions}問`;
  }
}

// 直前に演出（pop／shake・バイブ）を出した結果の識別子。同じ結果を再描画（100ms ごとの snapshot 更新）しても
// 演出とバイブを繰り返さないためのメモ。問題（ordinal）・結果の種類・回答者で区別する。
let lastResultEffectKey = null;

// 結果カードの登場演出（CSS アニメーションのやり直し）と、対応端末での短いバイブ。
// prefers-reduced-motion のときは CSS 側でアニメーションを止め、バイブも省く。
function playResultEffect(kind) {
  const overlay = elements.resultOverlay;
  overlay.classList.remove("is-entering");
  void overlay.offsetWidth; // reflow を挟んでアニメーションを最初から再生させる
  overlay.classList.add("is-entering");
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;
  try {
    if (kind === "correct" || kind === "rescued") navigator.vibrate?.([30, 40, 60]);
    else if (kind === "wrong" || kind === "voided") navigator.vibrate?.([120]);
  } catch {
    /* 非対応は無視 */
  }
}

// 全員の現在得点（結果カードの下の小さなスコアボード）。得点が動いた人（scoredPlayerId）を強調する。
function renderResultScores(match, scoredPlayerId, delta) {
  const container = elements.resultScores;
  if (!container) return;
  container.innerHTML = "";
  match.players.forEach((player) => {
    const chip = document.createElement("span");
    chip.className = "party-result-score-chip";
    chip.dataset.color = player.color;
    if (player.id === scoredPlayerId) chip.classList.add("is-scored");
    const name = document.createElement("span");
    name.className = "party-result-score-name";
    name.textContent = player.name;
    const score = document.createElement("span");
    score.className = "party-result-score-value";
    score.textContent = `${match.scores[player.id] ?? 0}pt`;
    chip.append(name, score);
    if (player.id === scoredPlayerId && delta) {
      const badge = document.createElement("span");
      badge.className = "party-result-score-delta";
      badge.textContent = delta;
      chip.appendChild(badge);
    }
    container.appendChild(chip);
  });
}

// 【2026-09-16 第5回実機QA修正・本人指示：結果表示を「みんなで遊ぶクイズ番組」らしく】
// 結果カード＝ 大きなアイコン（⭕／❌／PASS）→ 見出し → 回答者チップ（席の色） → 得点（+1pt／0pt）
// → 正解曲名（公開できるときだけ。「正解」ラベル付きで大きく） → 補足 → 救済候補 → 全員の得点 → ボタン。
// 曲名の公開ルール（canRevealSolution）・「次へ」「判定を修正」・救済UIは従来どおり。
function updateResultOverlay(match, runtime, ui) {
  const phase = runtime.phase;
  const isResult = phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.WRONG_RESULT || phase === PARTY_PHASE.PASS_RESULT;
  const manualOverride = ui.voice?.status === "manual" && isResult;
  elements.resultOverlay.hidden = !isResult || manualOverride || ui.paused;
  if (!isResult) {
    lastResultEffectKey = null;
    return;
  }
  const result = runtime.lastResult;
  const player = playerById(match, result?.playerId);
  // 【公開ルール（2026-09-15 第2回実機QA修正）】正解曲名は canRevealSolution（問題終了が確定）のときだけ描く。
  // 不正解（問題継続）では曲名を一切出さず、音声回答なら認識した文字列だけを添える。
  const revealedTitle = canRevealSolution(runtime) ? runtime.question.song.title : "";
  const heard = ui.voice?.transcripts?.[0] ? `認識：「${ui.voice.transcripts[0]}」` : "";
  const kind = result?.type ?? "";
  elements.resultOverlay.dataset.kind = kind;
  const setPlayer = (text) => {
    elements.resultPlayer.hidden = !text;
    elements.resultPlayer.textContent = text ?? "";
    if (player) elements.resultPlayer.dataset.color = player.color;
    else delete elements.resultPlayer.dataset.color;
  };
  const setPoints = (text) => {
    elements.resultPoints.hidden = !text;
    elements.resultPoints.textContent = text ?? "";
  };
  const setSong = (title) => {
    elements.resultSong.textContent = title;
    elements.resultSongLabel.hidden = !title;
    elements.resultSong.hidden = !title;
  };
  let scoredPlayerId = null;
  let delta = "";
  if (kind === "correct") {
    elements.resultIcon.textContent = "⭕";
    elements.resultHeadline.textContent = "正解！";
    setPlayer(player?.name ?? "");
    setPoints("+1pt");
    setSong(revealedTitle);
    elements.resultDetail.textContent = result.judgedBy === "human" ? "人間判定で正解" : "";
    scoredPlayerId = player?.id ?? null;
    delta = "+1";
  } else if (kind === "wrong") {
    elements.resultIcon.textContent = "❌";
    elements.resultHeadline.textContent = "不正解！";
    setPlayer(player?.name ?? "");
    setPoints("");
    setSong(""); // 問題は続くので正解曲名は絶対に出さない
    const lockText = runtime.revivedAll
      ? "全員が回答できなくなったので全員復活！"
      : match.settings.otetsuki
        ? `${player?.name ?? ""} はこの問題では回答できません`
        : "";
    const parts = [heard, lockText, "3・2・1から再開"].filter(Boolean);
    elements.resultDetail.textContent = parts.join("　");
  } else if (kind === "voided") {
    elements.resultIcon.textContent = "❌";
    elements.resultHeadline.textContent = "判定を不正解に修正";
    setPlayer(player?.name ?? "");
    setPoints("0pt");
    setSong(revealedTitle);
    elements.resultDetail.textContent = `${player?.name ?? ""} の+1点を取り消しました。正解は公開済みのため、この問題は0点で終了します`;
    scoredPlayerId = player?.id ?? null;
    delta = "-1";
  } else if (kind === "rescued") {
    // 【第4回実機QA修正】正解公開後に、過去の音声回答を人間が「本当は正解だった」と救済した
    const previous = playerById(match, result.previousPlayerId);
    elements.resultIcon.textContent = "⭕";
    elements.resultHeadline.textContent = "判定を修正しました";
    setPlayer(player?.name ?? "");
    setPoints("+1pt");
    setSong(revealedTitle);
    elements.resultDetail.textContent = previous
      ? `先に正解していた回答として救済。${previous.name} の+1点は取り消し`
      : "正解だった回答として救済";
    scoredPlayerId = player?.id ?? null;
    delta = "+1";
  } else {
    elements.resultIcon.textContent = "PASS";
    elements.resultHeadline.textContent = "全員PASS";
    setPlayer("");
    setPoints("0pt");
    setSong(revealedTitle);
    elements.resultDetail.textContent = "この問題は誰も得点なし";
  }
  renderResultScores(match, scoredPlayerId, delta);
  const showNext = phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.PASS_RESULT;
  elements.resultNextButton.hidden = !showNext;
  // サドンデスで正解が出た＝決着。それ以外は（最終問題でも首位同点ならサドンデスへ進むため）「次へ」で統一。
  elements.resultNextButton.textContent = runtime.isSuddenDeath && (kind === "correct" || kind === "rescued") ? "結果発表へ" : "次へ";
  // 既存の「判定を修正」（正解→不正解にして0点で終了）。救済で確定した結果（rescued）には出さない（別機能なので混同しない）
  const canOverride = Boolean(ui.voice) && kind !== "rescued" && (phase === PARTY_PHASE.CORRECT_RESULT || phase === PARTY_PHASE.WRONG_RESULT);
  elements.overrideButton.hidden = !canOverride;
  elements.overrideButton.textContent = phase === PARTY_PHASE.CORRECT_RESULT ? "判定を修正（不正解にして0点で終了）" : "判定を修正";
  updateRescueBox(match, runtime, ui);
  // 登場演出・バイブは「新しい結果」のときだけ（同じ結果の再描画では繰り返さない）
  const effectKey = `${runtime.ordinal}:${kind}:${result?.playerId ?? ""}:${result?.previousPlayerId ?? ""}`;
  if (!elements.resultOverlay.hidden && effectKey !== lastResultEffectKey) {
    lastResultEffectKey = effectKey;
    playResultEffect(kind);
  }
}

// 【2026-09-15 第4回実機QA修正・本人指示：音声回答の誤判定を正解公開後に救済】
// 正解曲名が公開された結果表示（正解／全員PASS）で、この問題中に「不正解」として処理された音声回答があれば、
// 回答順に「誰が・何と認識され・どう判定されたか」を並べ、その場の人間が「この回答を正解に修正」できる。
// 候補が無ければ何も出さない（通常のテンポは変えない）。候補は engine の snapshot（ui.rescuableVoiceAttempts）から。
function updateRescueBox(match, runtime, ui) {
  const box = elements.rescueBox;
  if (!box) return;
  const candidates = ui.rescuableVoiceAttempts ?? [];
  const show = candidates.length > 0 && canRevealSolution(runtime) && !ui.paused;
  box.hidden = !show;
  box.innerHTML = "";
  if (!show) return;
  const title = document.createElement("p");
  title.className = "party-rescue-title";
  title.textContent = runtime.lastResult?.type === "rescued" ? "他に見直す回答があります" : "判定を見直す回答があります";
  box.appendChild(title);
  candidates.forEach((attempt) => {
    const player = playerById(match, attempt.playerId);
    const row = document.createElement("div");
    row.className = "party-rescue-row";
    row.dataset.order = String(attempt.order);
    const info = document.createElement("p");
    info.className = "party-rescue-info";
    const heard = attempt.transcripts?.[0] ? `認識：「${attempt.transcripts[0]}」` : "認識：（音声を取得できず）";
    const judged = attempt.outcome === "overtaken" ? "正解扱い → 先の回答を救済したため取り消し" : `${attempt.judgedBy === "human" ? "人間判定" : "自動判定"}：不正解`;
    info.textContent = `${attempt.order}番目　${player?.name ?? ""}　${heard}　${judged}`;
    row.appendChild(info);
    // これより前に別の候補があるなら注意書き（早押しなので、本当に正解だった中で最も早い人を正解者にする運用）
    const earlier = candidates.filter((other) => other.order < attempt.order);
    if (earlier.length > 0) {
      const note = document.createElement("p");
      note.className = "party-rescue-note";
      note.textContent = `※これより前に ${earlier.map((other) => playerById(match, other.playerId)?.name ?? "").join("・")} の回答があります`;
      row.appendChild(note);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "party-rescue-button";
    button.textContent = "この回答を正解に修正";
    button.addEventListener("click", () => engine?.rescueVoiceAttempt(attempt.order));
    row.appendChild(button);
    box.appendChild(row);
  });
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
  [elements.resultOverlay, elements.voiceOverlay, elements.pauseOverlay, elements.notice, elements.introOverlay, elements.replayButton, elements.rescueBox].forEach((el) => {
    if (el) el.hidden = true;
  });
  lastResultEffectKey = null;
  elements.resultOverlay.classList.remove("is-entering");
  elements.lyrics.innerHTML = "";
  delete elements.lyrics.dataset.views;
}

// elements: {
//   root, seats, questionLabel, lyrics, status, passButton, passProgress, replayButton,
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
  // 「🔁 もう一度聴く」は通常のタップ（長押し不要）。問題は継続したまま同じ位置を最初から鳴らす
  elements.replayButton.addEventListener("click", () => engine?.replay());
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
    if (lastSnapshot?.match) {
      applySeatRotations(lastSnapshot.match);
      applyLyricViewRotations(lastSnapshot.match);
    }
  };
  window.addEventListener("resize", relayout);
  window.addEventListener("orientationchange", relayout);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(relayout);
    resizeObserver.observe(elements.seats);
  }
}
