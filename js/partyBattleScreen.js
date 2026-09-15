// パーティー対戦（2026-09-15新設、本人指示）の「設定 → 選曲 → 席 → 開始前チェック → 結果」の各画面を
// 担当するファイル。対戦盤面そのものはjs/partyBattlePlayScreen.js、進行はjs/partyBattleEngine.js。
//
// 【設計メモ】旧1台対戦（js/localBattleScreen.js）と同じく、画面遷移と効果音はmain.jsの
// navigateTo(screenName)コールバックへ委譲する。設定値はlocalStorage（js/partyBattleStorage.js）に
// 残し、「設定を変えて再戦」「次回開いたとき」の初期値にする。

import { SONGS } from "./data/songs.js";
import { createSongGroupSelectList } from "./songGroupSelectList.js";
import { bindSearchInputKeyboardAvoidance } from "./answerPoolBrowseUi.js";
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
import {
  isSpeechRecognitionSupported,
  runVoiceRecognitionTest,
  resetVoiceRecognitionAvailability,
  requestMicrophonePermission,
  describeVoiceEnvironment,
  getVoiceDiagnostics,
  clearVoiceDiagnostics,
} from "./partyBattleVoice.js";
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
//
// 【2026-09-15 第4回実機QA修正・本人指示】以前は全84曲を1本の長い縦リストにしていたが、iPhone実機で目的の曲を
// 探しにくかった。オンライン対戦の曲選択画面（js/onlineBattleSongPicker.js）と同じ操作感＝「シングルごと
// （1枚目／2枚目…）の折りたたみグループ・グループ単位の全選択／全解除・検索・選択中だけ表示・画面下の固定バー」
// へ揃えた。DOM の組み立ては共通部品 js/songGroupSelectList.js（オンライン側と同じ CSS クラス）を使う。
// 選択状態は pickerSelected（Set）1つに集約し、グループの開閉・検索・表示切替・ページ（グループ）移動で失わない。

let pickerSelected = new Set();
let pickerList = null;

// 「選択中：N曲」は全グループを通した合計（= pickerSelected.size）。4択回答は異なる4曲以上が開始条件
// （js/partyBattleEngine.js resolvePartySongPool と同じ基準。今表示中のグループの曲数では判定しない）。
function updatePickerSummary() {
  const count = pickerSelected.size;
  elements.pickerCount.textContent = String(count);
  if (elements.pickerStickyCount) elements.pickerStickyCount.textContent = String(count);
  const needsFour = settings.answerMethod === PARTY_ANSWER_METHOD.FOUR_CHOICE && count < 4;
  elements.pickerMinNotice.hidden = !needsFour;
  if (needsFour) elements.pickerMinNotice.textContent = `4択回答は異なる4曲以上必要です（あと${4 - count}曲）`;
  renderPickerReviewChips();
}

// 「選択中 N曲 ▾」を開いたときの、選択曲のチップ一覧（×で解除できる）。songs.js の登録順
function renderPickerReviewChips() {
  const chipsContainer = elements.pickerReviewChips;
  if (!chipsContainer) return;
  chipsContainer.innerHTML = "";
  SONGS.filter((song) => pickerSelected.has(song.id)).forEach((song) => {
    const chip = document.createElement("span");
    chip.className = "song-picker-review-chip";
    const title = document.createElement("span");
    title.textContent = song.title;
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `${song.title}の選択を解除`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      pickerSelected.delete(song.id);
      pickerList?.syncCheckboxes();
    });
    chip.append(title, removeButton);
    chipsContainer.appendChild(chip);
  });
}

function setPickerStickyBarVisible(visible) {
  if (!elements.pickerStickyBar) return;
  elements.pickerStickyBar.hidden = !visible;
  if (!visible && elements.pickerReviewPanel) {
    elements.pickerReviewPanel.hidden = true;
    elements.pickerStickyToggle?.setAttribute("aria-expanded", "false");
  }
}

function openSongPicker() {
  pickerSelected = new Set(settings.manualSongIds);
  elements.pickerSearchInput.value = "";
  elements.pickerSearchClearButton.hidden = true;
  elements.pickerSelectedOnlyCheckbox.checked = false;
  pickerList = createSongGroupSelectList({
    container: elements.pickerList,
    songs: SONGS,
    selectedSongIds: pickerSelected,
    onSelectionChange: updatePickerSummary,
    noResultsNotice: elements.pickerNoResultsNotice,
    playClick: () => playSfx(SFX_EVENTS.UI_CLICK),
  });
  pickerList.render();
  setPickerStickyBarVisible(true);
  elements.navigateTo("partyBattleSongPicker");
}

// 「この曲で決定」／「戻る」：どちらも固定バーを隠してから設定画面へ
function closeSongPicker({ confirm }) {
  if (confirm) {
    settings.manualSongIds = SONGS.filter((song) => pickerSelected.has(song.id)).map((song) => song.id);
    renderSongSourceDetails();
  }
  setPickerStickyBarVisible(false);
  elements.navigateTo("partyBattleSetup");
}

// テスト用：選曲画面の内部状態（選択集合・グループ数）を読む
export function getPartySongPickerStateForTest() {
  return { selectedSongIds: [...pickerSelected], groupCount: pickerList?.getGroupCount() ?? 0 };
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
  if (isVoice) renderVoiceTestInitial();
}

// ===== 開始前のマイク／音声認識テスト（2026-09-15 第1回実機QA修正で段階化） =====
// 段階：①マイクAPI／権限（getUserMedia、明確なボタン操作から権限プロンプトを出す）
//       ②SpeechRecognition の有無 → ③start() が受理されマイクが開く → ④音・発話の検出 → ⑤文字起こし
// iOS では start() をユーザー操作の同期処理内で呼ぶ必要があり、getUserMedia（await あり）の後では
// 操作扱いにならない可能性がある。そのため1つのボタンを2段階に分け、1回目のタップでマイク権限、
// 2回目のタップで認識テスト（同期的に start()）を行う。マイクAPIが無い環境では1回目から認識テストへ進む。
let voiceTestPhase = "mic"; // "mic" | "recognition"

function renderVoiceTestInitial() {
  elements.voiceTestResult.hidden = true;
  elements.voiceDiagnostics.hidden = true;
  elements.voiceDiagnosticsToggle.hidden = true;
  const env = describeVoiceEnvironment();
  voiceTestPhase = env.hasMicrophoneApi ? "mic" : "recognition";
  elements.voiceTestButton.disabled = false;
  elements.voiceTestButton.textContent = voiceTestPhase === "mic" ? "① マイクの許可を確認" : "音声認識テスト開始";
  if (!env.hasSpeechRecognition) {
    elements.voiceTestDesc.textContent =
      "この端末・ブラウザには音声認識API（SpeechRecognition）がありません。このまま開始すると、回答はすべて「正解／不正解」を人が判定する方式になります。4択回答がおすすめです。";
    elements.voiceTestButton.textContent = env.hasMicrophoneApi ? "① マイクの許可を確認（参考）" : "音声認識テスト開始";
    elements.voiceTestButton.disabled = !env.hasMicrophoneApi;
    return;
  }
  elements.voiceTestDesc.textContent =
    voiceTestPhase === "mic"
      ? "まず「① マイクの許可を確認」を押してマイクの使用を許可してください。次に「② 音声認識テスト」を押してから曲名を1つ話します（例：「イコールラブ」「青春サブリミナル」）。"
      : "「音声認識テスト開始」を押してから、曲名を1つ話してください（例：「イコールラブ」「青春サブリミナル」）。";
  if (env.isStandalone && env.isIos) {
    elements.voiceTestDesc.textContent +=
      " ※iPhone／iPadのホーム画面版では音声認識が起動しないことがあります。その場合は自動的に人間判定へ切り替わります。";
  }
}

function renderVoiceDiagnostics() {
  const env = describeVoiceEnvironment();
  const lines = [
    `環境: SpeechRecognition=${env.hasSpeechRecognition ? (env.usesWebkitPrefix ? "webkit" : "yes") : "no"} / getUserMedia=${env.hasMicrophoneApi ? "yes" : "no"} / secure=${env.isSecureContext} / standalone=${env.isStandalone} / iOS=${env.isIos}`,
    ...getVoiceDiagnostics().map((entry) => `${entry.atMs}ms ${entry.stage}${entry.detail ? ` ${entry.detail}` : ""}`),
  ];
  elements.voiceDiagnostics.textContent = lines.join("\n");
  elements.voiceDiagnosticsToggle.hidden = false;
}

function describeVoiceTestFailure(result) {
  const { stage, reason } = result;
  if (stage === "mic") {
    if (reason === "not-allowed") return "マイクの使用が許可されませんでした（端末の設定でこのアプリのマイクを許可してください）";
    if (reason === "not-found") return "マイクが見つかりませんでした";
    return `マイクを使えませんでした（${reason}）`;
  }
  if (stage === "api" || reason === "unsupported") return "この端末では音声認識API（SpeechRecognition）を利用できません";
  if (reason === "start-timeout" || reason === "no-start") return "音声認識が起動しませんでした（ホーム画面版のiPhone／iPadで起こる既知の制約。マイクは使えても認識APIが動かない状態です）";
  if (reason === "error:not-allowed" || reason === "error:service-not-allowed") return "音声認識サービスの利用が許可されませんでした（マイク権限は取得済み。認識API側で拒否）";
  if (reason === "error:network") return "音声認識サービスに接続できませんでした（通信を確認してください）";
  if (reason === "error:audio-capture") return "マイクから音を取得できませんでした";
  if (reason === "no-speech") return `マイクは開きましたが、音声を検出できませんでした（到達段階：${stage}）`;
  if (reason === "timeout") return `時間内に認識できませんでした（到達段階：${stage}）`;
  if (typeof reason === "string" && reason.startsWith("error:")) return `音声認識エラー（${reason.slice(6)}、到達段階：${stage}）`;
  return `音声を認識できませんでした（${reason}、到達段階：${stage}）`;
}

async function handleVoiceTest() {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.voiceTestButton.disabled = true;
  elements.voiceTestResult.hidden = false;
  if (voiceTestPhase === "mic") {
    elements.voiceTestResult.textContent = "🎤 マイクの許可を確認しています…";
    const mic = await requestMicrophonePermission();
    renderVoiceDiagnostics();
    if (mic.ok) {
      if (!isSpeechRecognitionSupported()) {
        elements.voiceTestResult.textContent = "✓ マイクは使えます。ただし音声認識API（SpeechRecognition）が無いため、回答は人間判定になります。4択回答がおすすめです。";
        elements.voiceTestButton.disabled = true;
        return;
      }
      voiceTestPhase = "recognition";
      elements.voiceTestResult.textContent = "✓ マイクを使えます。次に「② 音声認識テスト」を押してから曲名を話してください。";
      elements.voiceTestButton.textContent = "② 音声認識テスト";
      elements.voiceTestButton.disabled = false;
      return;
    }
    if (mic.reason === "unsupported" && isSpeechRecognitionSupported()) {
      voiceTestPhase = "recognition";
      elements.voiceTestResult.textContent = "マイクAPI（getUserMedia）は無いため、音声認識APIで直接試します。「② 音声認識テスト」を押してください。";
      elements.voiceTestButton.textContent = "② 音声認識テスト";
      elements.voiceTestButton.disabled = false;
      return;
    }
    elements.voiceTestResult.textContent = `✕ ${describeVoiceTestFailure({ stage: "mic", reason: mic.reason })}。うまくいかない場合は4択回答がおすすめです。`;
    elements.voiceTestButton.disabled = false;
    return;
  }
  // 認識テスト：start() はこの click の同期処理内で呼ばれる（runVoiceRecognitionTest は skipMicRequest で await を挟まない）
  elements.voiceTestResult.textContent = "🎤 認識中… 曲名を話してください（数秒で自動終了します）";
  const result = await runVoiceRecognitionTest({ skipMicRequest: true });
  renderVoiceDiagnostics();
  elements.voiceTestButton.disabled = false;
  elements.voiceTestButton.textContent = "もう一度テスト";
  if (result.ok) {
    elements.voiceTestResult.textContent = `✓ 認識できました：「${result.transcripts[0]}」（到達段階：${result.stage}）`;
  } else {
    elements.voiceTestResult.textContent = `✕ ${describeVoiceTestFailure(result)}。うまくいかない場合は4択回答がおすすめです（このまま開始しても、認識できない回答は人間判定で続行します）。`;
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
  clearVoiceDiagnostics();
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

// 【2026-09-15 第4回実機QA修正・本人指示：終了後の戻り先】試合を途中終了したら、ホーム最上部ではなく
// 「パーティー対戦カードを押した直後の設定画面（設定トップ）」へ戻す。設定はその試合の内容のまま
// （もう一度遊ぶときに再入力が要らない）。設定画面は先頭までスクロールを戻す。
function returnToPartySetupTop() {
  if (settings) renderSetupFromSettings();
  elements.navigateTo("partyBattleSetup");
  elements.scrollToTop?.();
}

function finishAbort() {
  engine?.dispose();
  engine = null;
  resetPartyPlayScreen();
  returnToPartySetupTop();
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
  // 【第4回実機QA修正】設定トップの「戻る」はホームの「パーティー対戦」カードが見える位置へ（main.js 側が実装。
  // 無ければ従来どおりスクロール記憶付きでホームへ）
  elements.setupBackButton.addEventListener("click", () => {
    if (elements.navigateHomeToPartyCard) elements.navigateHomeToPartyCard();
    else elements.navigateTo("start");
  });
  elements.setupHelpLink.addEventListener("click", () => elements.onShowHelp());
  elements.setupNextButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    handleSetupNext();
  });

  // 選曲画面（オンライン対戦の曲選択と同じ操作感。js/songGroupSelectList.js 参照）
  elements.pickerBackButton.addEventListener("click", () => closeSongPicker({ confirm: false }));
  // 【本人指示：テキスト入力中には音を付けない】検索欄の input は効果音なし
  elements.pickerSearchInput.addEventListener("input", () => {
    elements.pickerSearchClearButton.hidden = elements.pickerSearchInput.value === "";
    pickerList?.setSearchQuery(elements.pickerSearchInput.value);
  });
  bindSearchInputKeyboardAvoidance(elements.pickerSearchInput, elements.pickerSearchInput.closest(".search-field-row"));
  elements.pickerSearchClearButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.pickerSearchInput.value = "";
    elements.pickerSearchClearButton.hidden = true;
    pickerList?.setSearchQuery("");
    elements.pickerSearchInput.focus();
  });
  elements.pickerSelectedOnlyCheckbox.addEventListener("change", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    pickerList?.setShowSelectedOnly(elements.pickerSelectedOnlyCheckbox.checked);
  });
  // 全曲選択／全曲解除（グループ単位の全選択／全解除とは別。検索で隠れている曲も含む全曲が対象）
  elements.pickerSelectAllButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    pickerList?.selectAll();
  });
  elements.pickerDeselectAllButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    pickerList?.deselectAll();
  });
  elements.pickerDoneButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    closeSongPicker({ confirm: true });
  });
  elements.pickerStickyConfirmButton?.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    closeSongPicker({ confirm: true });
  });
  elements.pickerStickyToggle?.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const isOpen = !elements.pickerReviewPanel.hidden;
    elements.pickerReviewPanel.hidden = isOpen;
    elements.pickerStickyToggle.setAttribute("aria-expanded", String(!isOpen));
  });

  // 開始前チェック
  elements.preflightBackButton.addEventListener("click", () => elements.navigateTo("partyBattleSetup"));
  elements.voiceTestButton.addEventListener("click", handleVoiceTest);
  elements.voiceDiagnosticsToggle.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.voiceDiagnostics.hidden = !elements.voiceDiagnostics.hidden;
  });
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
  // 【第4回実機QA修正】結果画面の「終了」も設定トップへ（「同じ設定でもう一戦」＝即再戦、「設定を変えて再戦」＝
  // 設定画面へ、「終了」＝設定トップへ戻って一区切り。ホームへはそこから「戻る」でカード付近へ）
  elements.resultHomeButton.addEventListener("click", () => {
    clearRevealTimers();
    if (lastMatch) settings = normalizePartySettings(lastMatch.settings);
    returnToPartySetupTop();
  });
}
