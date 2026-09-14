// パーティー対戦（2026-09-15新設、本人指示）の「設定 → 選曲 → 席 → 開始前チェック → 結果」の各画面を
// 担当するファイル。対戦盤面そのものはjs/partyBattlePlayScreen.js、進行はjs/partyBattleEngine.js。
//
// 【設計メモ】旧1台対戦（js/localBattleScreen.js）と同じく、画面遷移と効果音はmain.jsの
// navigateTo(screenName)コールバックへ委譲する。設定値はlocalStorage（js/partyBattleStorage.js）に
// 残し、「設定を変えて再戦」「次回開いたとき」の初期値にする。

import { SONGS } from "./data/songs.js";
import { CATEGORY_PILL_INFO } from "./songlist.js";
import { normalizeForSearch, songMatchesSearch } from "./songSearch.js";
import { getPlaylists } from "./playlists.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import {
  PARTY_SEAT_IDS,
  PARTY_SEAT_COLORS,
  PARTY_QUIZ_TYPE,
  PARTY_QUIZ_TYPE_LABELS,
  PARTY_ANSWER_METHOD,
  PARTY_ANSWER_METHOD_LABELS,
  PARTY_SONG_SOURCE,
  getPartyQuestionCountValues,
  normalizePartySettings,
  computeStandings,
  buildRevealOrder,
} from "./partyBattleState.js";
import { getLastPartySettings, getRecentPartyPlayerNames, describePartySongSource } from "./partyBattleStorage.js";
import { resolvePartySongPool, preparePartyMatch, createPartyBattleEngine } from "./partyBattleEngine.js";
import { isSpeechRecognitionSupported, runVoiceRecognitionTest, resetVoiceRecognitionAvailability } from "./partyBattleVoice.js";
import { renderPartyPlaySnapshot, setPartyPlayEngine, resetPartyPlayScreen } from "./partyBattlePlayScreen.js";

let elements = null;
let settings = null;
let engine = null;
let lastMatch = null;
let preflightPool = null;
let revealTimers = [];
let visibilityHandlerAttached = false;

const QUESTION_COUNT_LABELS = { "3": "3問", "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全曲" };
const SEAT_ORDER_LABELS = { topLeft: "席1", topRight: "席2", bottomLeft: "席3", bottomRight: "席4" };

function seatLabel(seatId) {
  return `${SEAT_ORDER_LABELS[seatId]}（${PARTY_SEAT_COLORS[seatId].label}）`;
}

// ===== 設定画面 =====

function readRadio(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value ?? null;
}

function setRadio(name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (radio) radio.checked = true;
}

function renderPlayerNameFields() {
  elements.playerNameFields.innerHTML = "";
  for (let index = 0; index < settings.playerCount; index++) {
    const row = document.createElement("label");
    row.className = "party-player-name-row";
    const badge = document.createElement("span");
    badge.className = "party-player-badge";
    badge.textContent = `P${index + 1}`;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "party-player-name-input";
    input.maxLength = 12;
    input.placeholder = `プレイヤー${index + 1}`;
    input.value = settings.playerNames[index] ?? "";
    input.addEventListener("input", () => {
      settings.playerNames[index] = input.value;
    });
    row.append(badge, input);
    elements.playerNameFields.appendChild(row);
  }
}

function renderRecentNames() {
  const names = getRecentPartyPlayerNames();
  elements.recentNames.hidden = names.length === 0;
  elements.recentNamesChips.innerHTML = "";
  names.forEach((name) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "party-recent-name-chip";
    chip.textContent = name;
    chip.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      const inputs = [...elements.playerNameFields.querySelectorAll("input")];
      const target = inputs.find((input) => input.value.trim() === "") ?? inputs[inputs.length - 1];
      if (!target) return;
      target.value = name;
      settings.playerNames[inputs.indexOf(target)] = name;
    });
    elements.recentNamesChips.appendChild(chip);
  });
}

function renderSeatFigure() {
  const isThree = settings.playerCount === 3;
  elements.seatFieldset.hidden = !isThree;
  elements.seatFigure.innerHTML = "";
  if (!isThree) return;
  PARTY_SEAT_IDS.forEach((seatId) => {
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = "party-seat-tile";
    tile.dataset.seatId = seatId;
    tile.dataset.color = PARTY_SEAT_COLORS[seatId].key;
    const isEmpty = settings.emptySeatId === seatId;
    tile.classList.toggle("is-empty", isEmpty);
    tile.setAttribute("aria-pressed", String(isEmpty));
    const title = document.createElement("span");
    title.className = "party-seat-tile-title";
    title.textContent = seatLabel(seatId);
    const desc = document.createElement("span");
    desc.className = "party-seat-tile-desc";
    desc.textContent = isEmpty ? "空席" : "タップして空席にする";
    tile.append(title, desc);
    tile.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      settings.emptySeatId = seatId;
      renderSeatFigure();
    });
    elements.seatFigure.appendChild(tile);
  });
}

function renderQuestionCountOptions() {
  const values = getPartyQuestionCountValues(settings.quizType);
  if (!values.includes(settings.questionCountValue)) settings.questionCountValue = values[0];
  elements.questionCountOptions.innerHTML = "";
  values.forEach((value) => {
    const label = document.createElement("label");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "party-question-count";
    radio.value = value;
    radio.checked = value === settings.questionCountValue;
    radio.addEventListener("change", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      settings.questionCountValue = value;
    });
    label.append(radio, document.createTextNode(` ${QUESTION_COUNT_LABELS[value] ?? value}`));
    elements.questionCountOptions.appendChild(label);
  });
}

function renderPlaylistSelect() {
  const playlists = getPlaylists();
  elements.playlistSelect.innerHTML = "";
  if (playlists.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "プレイリストがありません";
    elements.playlistSelect.appendChild(option);
    settings.playlistId = null;
    return;
  }
  playlists.forEach((playlist) => {
    const option = document.createElement("option");
    option.value = playlist.playlistId;
    option.textContent = `${playlist.playlistName}（${playlist.songIds.length}曲）`;
    elements.playlistSelect.appendChild(option);
  });
  if (!playlists.some((playlist) => playlist.playlistId === settings.playlistId)) {
    settings.playlistId = playlists[0].playlistId;
  }
  elements.playlistSelect.value = settings.playlistId;
}

function renderSongSourceDetails() {
  elements.manualSourceRow.hidden = settings.songSource !== PARTY_SONG_SOURCE.MANUAL;
  elements.playlistSourceRow.hidden = settings.songSource !== PARTY_SONG_SOURCE.PLAYLIST;
  elements.manualSourceSummary.textContent =
    settings.manualSongIds.length > 0 ? `${settings.manualSongIds.length}曲を選択中` : "まだ曲を選んでいません";
  let status = "";
  if (settings.songSource === PARTY_SONG_SOURCE.FAVORITES) {
    status = `お気に入り ${getFavoriteSongIds().length}曲`;
  } else if (settings.songSource === PARTY_SONG_SOURCE.PLAYLIST) {
    renderPlaylistSelect();
  }
  elements.songSourceStatus.textContent = status;
}

function renderConditionalFieldsets() {
  elements.instantFieldset.hidden = settings.quizType !== PARTY_QUIZ_TYPE.INSTANT;
  elements.voiceFieldset.hidden = settings.answerMethod !== PARTY_ANSWER_METHOD.VOICE;
}

function renderSetupFromSettings() {
  setRadio("party-player-count", String(settings.playerCount));
  setRadio("party-quiz-type", settings.quizType);
  setRadio("party-song-source", settings.songSource);
  setRadio("party-answer-method", settings.answerMethod);
  setRadio("party-otetsuki", settings.otetsuki ? "on" : "off");
  setRadio("party-voice-timeout", String(settings.voiceStartTimeoutSec));
  setRadio("party-instant-clip", settings.instantClipSec);
  setRadio("party-instant-max-listens", String(settings.instantMaxListens));
  renderPlayerNameFields();
  renderRecentNames();
  renderSeatFigure();
  renderQuestionCountOptions();
  renderConditionalFieldsets();
  renderSongSourceDetails();
  elements.setupError.hidden = true;
}

function showSetupError(message) {
  elements.setupError.textContent = message;
  elements.setupError.hidden = !message;
}

// 設定画面を開く（ホームのカードから、または「設定を変えて再戦」から）。
export function openPartyBattleSetup({ keepSettings = false } = {}) {
  if (!keepSettings || !settings) settings = getLastPartySettings();
  renderSetupFromSettings();
}

async function handleSetupNext() {
  settings = normalizePartySettings(settings);
  if (settings.playerCount === 3 && !settings.emptySeatId) {
    showSetupError("3人対戦では、空席にする席を1つタップして選んでください。");
    return;
  }
  if (settings.songSource === PARTY_SONG_SOURCE.MANUAL && settings.manualSongIds.length === 0) {
    showSetupError("「曲を選んで出題」では、出題する曲を1曲以上選んでください。");
    return;
  }
  if (settings.songSource === PARTY_SONG_SOURCE.PLAYLIST && !settings.playlistId) {
    showSetupError("プレイリストがありません。「曲を聴く」からプレイリストを作るか、別の選曲にしてください。");
    return;
  }
  elements.setupNextButton.disabled = true;
  try {
    const pool = await resolvePartySongPool(settings);
    if (!pool.ok) {
      showSetupError(pool.message);
      return;
    }
    preflightPool = pool;
    showSetupError("");
    renderPreflight();
    elements.navigateTo("partyBattlePreflight");
  } finally {
    elements.setupNextButton.disabled = false;
  }
}

// ===== 選曲画面（曲を選んで出題） =====

let pickerSelected = new Set();

function renderSongPickerList() {
  const query = normalizeForSearch(elements.pickerSearchInput.value);
  elements.pickerSearchClearButton.hidden = elements.pickerSearchInput.value === "";
  elements.pickerList.innerHTML = "";
  SONGS.forEach((song) => {
    if (!songMatchesSearch(song.title, song.searchReading, song.searchAliases, query)) return;
    const row = document.createElement("div");
    row.className = "song-select-row";
    const label = document.createElement("label");
    label.className = "song-select-label";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = song.id;
    checkbox.checked = pickerSelected.has(song.id);
    checkbox.addEventListener("change", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      if (checkbox.checked) pickerSelected.add(song.id);
      else pickerSelected.delete(song.id);
      elements.pickerCount.textContent = String(pickerSelected.size);
    });
    const title = document.createElement("span");
    title.className = "song-select-title";
    title.textContent = song.title;
    const info = CATEGORY_PILL_INFO[song.category];
    const pill = document.createElement("span");
    pill.className = `category-pill ${info?.className ?? ""}`;
    pill.textContent = info?.text ?? song.category;
    label.append(checkbox, title, pill);
    row.appendChild(label);
    elements.pickerList.appendChild(row);
  });
  elements.pickerCount.textContent = String(pickerSelected.size);
}

function openSongPicker() {
  pickerSelected = new Set(settings.manualSongIds);
  elements.pickerSearchInput.value = "";
  renderSongPickerList();
  elements.navigateTo("partyBattleSongPicker");
}

// ===== 開始前チェック =====

function buildSummaryChips(container, currentSettings) {
  container.innerHTML = "";
  const chips = [
    `${currentSettings.playerCount}人`,
    PARTY_QUIZ_TYPE_LABELS[currentSettings.quizType],
    QUESTION_COUNT_LABELS[currentSettings.questionCountValue] ?? currentSettings.questionCountValue,
    describePartySongSource(currentSettings, {
      playlistName: getPlaylists().find((playlist) => playlist.playlistId === currentSettings.playlistId)?.playlistName ?? null,
    }),
    PARTY_ANSWER_METHOD_LABELS[currentSettings.answerMethod],
    `お手つき${currentSettings.otetsuki ? "あり" : "なし"}`,
  ];
  if (currentSettings.answerMethod === PARTY_ANSWER_METHOD.VOICE) chips.push(`回答${currentSettings.voiceStartTimeoutSec}秒`);
  if (currentSettings.quizType === PARTY_QUIZ_TYPE.INSTANT) {
    chips.push(`${currentSettings.instantClipSec}秒×最大${currentSettings.instantMaxListens}回`);
  }
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    container.appendChild(chip);
  });
}

function renderPreflight() {
  buildSummaryChips(elements.preflightSummary, settings);
  elements.preflightPoolStatus.hidden = false;
  elements.preflightPoolStatus.textContent = `✓ 出題できる曲：${preflightPool.availableCount}曲（${
    settings.quizType === PARTY_QUIZ_TYPE.LYRICS ? "歌詞データあり" : "音源を読み込み済み"
  }）`;
  elements.preflightPoolError.hidden = true;
  elements.preflightError.hidden = true;
  const isVoice = settings.answerMethod === PARTY_ANSWER_METHOD.VOICE;
  elements.voiceBox.hidden = !isVoice;
  if (isVoice) {
    elements.voiceTestResult.hidden = true;
    const supported = isSpeechRecognitionSupported();
    elements.voiceTestButton.disabled = !supported;
    elements.voiceTestDesc.textContent = supported
      ? "「テスト開始」を押してから、曲名を1つ話してください（例：「イコールラブ」「青春サブリミナル」）。"
      : "この端末では音声認識を安定して利用できません。4択回答がおすすめです（このまま開始すると、回答はすべて「正解／不正解」を人が判定する方式になります）。";
  }
}

async function handleVoiceTest() {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.voiceTestButton.disabled = true;
  elements.voiceTestResult.hidden = false;
  elements.voiceTestResult.textContent = "🎤 認識中… 曲名を話してください";
  const result = await runVoiceRecognitionTest();
  elements.voiceTestButton.disabled = false;
  if (result.ok) {
    elements.voiceTestResult.textContent = `✓ 認識できました：「${result.transcripts[0]}」`;
  } else {
    const reason =
      result.reason === "unsupported"
        ? "この端末では音声認識を利用できません"
        : result.reason.startsWith("error:not-allowed") || result.reason.startsWith("error:service-not-allowed")
          ? "マイクの使用が許可されませんでした"
          : result.reason.startsWith("error:network")
            ? "音声認識サービスに接続できませんでした（通信を確認してください）"
            : "音声を認識できませんでした";
    elements.voiceTestResult.textContent = `✕ ${reason}。うまくいかない場合は4択回答がおすすめです。`;
  }
}

async function handleStart() {
  elements.startButton.disabled = true;
  elements.preflightError.hidden = true;
  try {
    const prepared = await preparePartyMatch(settings);
    if (!prepared.ok) {
      elements.preflightError.textContent = prepared.message;
      elements.preflightError.hidden = false;
      return;
    }
    startMatch(prepared.match, prepared.pool);
  } finally {
    elements.startButton.disabled = false;
  }
}

// ===== 試合の開始・監視 =====

function handleVisibilityChange() {
  if (!engine) return;
  if (document.visibilityState === "hidden") {
    engine.pauseForBackground();
  } else {
    engine.reacquireWakeLock();
  }
}

function startMatch(match, pool) {
  engine?.dispose();
  resetVoiceRecognitionAvailability();
  engine = createPartyBattleEngine({
    onUpdate: (snapshot) => {
      if (snapshot.ui.finished) {
        lastMatch = snapshot.match;
        showResult(snapshot.match);
        return;
      }
      if (snapshot.ui.aborted) {
        finishAbort();
        return;
      }
      renderPartyPlaySnapshot(snapshot);
    },
  });
  setPartyPlayEngine(engine);
  engine.load(match, pool);
  if (!visibilityHandlerAttached) {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    visibilityHandlerAttached = true;
  }
  elements.navigateTo("partyBattlePlay");
  engine.start();
}

function finishAbort() {
  engine?.dispose();
  engine = null;
  resetPartyPlayScreen();
  elements.navigateTo("start");
}

// 「終了｜長押し」成立 → 確認モーダル（main.js側）→ 確定でここが呼ばれる。
export function abortPartyBattle() {
  engine?.abort();
}

export function isPartyBattleInProgress() {
  return engine !== null;
}

// ===== 結果画面 =====

function clearRevealTimers() {
  revealTimers.forEach((id) => clearTimeout(id));
  revealTimers = [];
}

function spawnConfetti() {
  elements.confetti.innerHTML = "";
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const count = reduceMotion ? 0 : 36;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement("span");
    piece.className = "party-confetti-piece";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.animationDelay = `${Math.random() * 1.2}s`;
    piece.style.animationDuration = `${2.4 + Math.random() * 1.6}s`;
    piece.style.setProperty("--confetti-hue", `${Math.floor(Math.random() * 360)}`);
    elements.confetti.appendChild(piece);
  }
}

function showResult(match) {
  engine?.dispose();
  engine = null;
  resetPartyPlayScreen();
  clearRevealTimers();
  buildSummaryChipsForResult(match);
  const standings = computeStandings(match);
  const order = buildRevealOrder(standings);
  elements.resultList.innerHTML = "";
  elements.winnerCard.hidden = true;
  elements.resultActions.hidden = true;
  elements.confetti.innerHTML = "";
  elements.resultNote.textContent = match.stats.suddenDeathQuestionCount > 0 ? `サドンデス ${match.stats.suddenDeathQuestionCount}問で決着` : "";
  elements.navigateTo("partyBattleResult");

  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const stepMs = reduceMotion ? 0 : 650;
  const winner = standings.find((row) => row.playerId === match.winnerId) ?? standings[0];
  order.forEach((row, index) => {
    const isWinner = row.playerId === winner.playerId;
    if (isWinner) return;
    revealTimers.push(
      setTimeout(() => {
        const item = document.createElement("li");
        item.className = "party-result-row";
        item.dataset.color = row.color;
        item.innerHTML = "";
        const rank = document.createElement("span");
        rank.className = "party-result-rank";
        rank.textContent = `${row.rank}位`;
        const name = document.createElement("span");
        name.className = "party-result-name";
        name.textContent = row.name;
        const score = document.createElement("span");
        score.className = "party-result-score";
        score.textContent = `${row.score}pt`;
        item.append(rank, name, score);
        elements.resultList.prepend(item);
        playSfx(SFX_EVENTS.UI_CLICK);
      }, stepMs * (index + 1))
    );
  });
  const winnerDelay = stepMs * (order.length + 1);
  revealTimers.push(
    setTimeout(() => {
      elements.winnerCard.hidden = false;
      elements.winnerCard.dataset.color = winner.color;
      elements.winnerName.textContent = winner.name;
      elements.winnerPoints.textContent = `${winner.score} POINTS`;
      playSfx(SFX_EVENTS.BATTLE_WIN);
      spawnConfetti();
      try {
        navigator.vibrate?.([80, 40, 120]);
      } catch {
        /* 非対応は無視 */
      }
      elements.resultActions.hidden = false;
    }, winnerDelay)
  );
}

function buildSummaryChipsForResult(match) {
  buildSummaryChips(elements.resultConfigSummary, match.settings);
}

async function handleRematchSameSettings() {
  if (!lastMatch) return;
  settings = normalizePartySettings(lastMatch.settings);
  elements.rematchButton.disabled = true;
  try {
    const prepared = await preparePartyMatch(settings);
    if (!prepared.ok) {
      elements.resultNote.textContent = prepared.message;
      return;
    }
    clearRevealTimers();
    startMatch(prepared.match, prepared.pool);
  } finally {
    elements.rematchButton.disabled = false;
  }
}

// ===== 初期化 =====
export function initPartyBattleScreens(newElements) {
  elements = newElements;
  settings = getLastPartySettings();

  // ラジオ類：変更のたびに設定へ反映し、関係する欄の表示を切り替える（操作音つき）
  const bindRadioGroup = (name, apply) => {
    document.querySelectorAll(`input[name="${name}"]`).forEach((radio) => {
      radio.addEventListener("change", () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        apply(radio.value);
      });
    });
  };
  bindRadioGroup("party-player-count", (value) => {
    settings.playerCount = Number(value);
    if (settings.playerCount !== 3) settings.emptySeatId = null;
    renderPlayerNameFields();
    renderSeatFigure();
  });
  bindRadioGroup("party-quiz-type", (value) => {
    settings.quizType = value;
    renderQuestionCountOptions();
    renderConditionalFieldsets();
  });
  bindRadioGroup("party-song-source", (value) => {
    settings.songSource = value;
    renderSongSourceDetails();
  });
  bindRadioGroup("party-answer-method", (value) => {
    settings.answerMethod = value;
    renderConditionalFieldsets();
  });
  bindRadioGroup("party-otetsuki", (value) => {
    settings.otetsuki = value === "on";
  });
  bindRadioGroup("party-voice-timeout", (value) => {
    settings.voiceStartTimeoutSec = Number(value);
  });
  bindRadioGroup("party-instant-clip", (value) => {
    settings.instantClipSec = value;
  });
  bindRadioGroup("party-instant-max-listens", (value) => {
    settings.instantMaxListens = Number(value);
  });
  elements.playlistSelect.addEventListener("change", () => {
    settings.playlistId = elements.playlistSelect.value || null;
  });
  elements.manualSourceButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openSongPicker();
  });
  elements.setupBackButton.addEventListener("click", () => elements.navigateTo("start"));
  elements.setupHelpLink.addEventListener("click", () => elements.onShowHelp());
  elements.setupNextButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    handleSetupNext();
  });

  // 選曲画面
  elements.pickerBackButton.addEventListener("click", () => elements.navigateTo("partyBattleSetup"));
  elements.pickerSearchInput.addEventListener("input", renderSongPickerList);
  elements.pickerSearchClearButton.addEventListener("click", () => {
    elements.pickerSearchInput.value = "";
    renderSongPickerList();
  });
  elements.pickerSelectAllButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.pickerList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => pickerSelected.add(checkbox.value));
    renderSongPickerList();
  });
  elements.pickerDeselectAllButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    pickerSelected = new Set();
    renderSongPickerList();
  });
  elements.pickerDoneButton.addEventListener("click", () => {
    settings.manualSongIds = SONGS.filter((song) => pickerSelected.has(song.id)).map((song) => song.id);
    renderSongSourceDetails();
    elements.navigateTo("partyBattleSetup");
  });

  // 開始前チェック
  elements.preflightBackButton.addEventListener("click", () => elements.navigateTo("partyBattleSetup"));
  elements.voiceTestButton.addEventListener("click", handleVoiceTest);
  elements.startButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    handleStart();
  });

  // 結果
  elements.rematchButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    handleRematchSameSettings();
  });
  elements.changeSettingsButton.addEventListener("click", () => {
    clearRevealTimers();
    if (lastMatch) settings = normalizePartySettings(lastMatch.settings);
    renderSetupFromSettings();
    elements.navigateTo("partyBattleSetup");
  });
  elements.resultHomeButton.addEventListener("click", () => {
    clearRevealTimers();
    elements.navigateTo("start");
  });
}
