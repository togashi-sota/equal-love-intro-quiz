// 開発用：ライブコール入力ツール本体。
// 実際のコール本文はここで初めて入力される（著作権保護のため、本編のコードには一切書かない、
// dev/lyricsEditor.jsと同じ方針）。
//
// 「再生しながらボタンを押すだけで記録できる」ライブ入力方式を中心に設計している：
// あらかじめよく使う言葉（例：曲を問わず使う定番コール）をプリセット欄に入力しておけば、
// 曲を変えても入力し直さずに済むよう、プリセットのラベルはlocalStorageに保存して引き継ぐ
// （実際のコール本文＝著作物はIndexedDBのみに保存され、Gitには含まれない。
// プリセットのラベルテキストも本人のブラウザのlocalStorageに残るだけで、リポジトリには入らない）。
//
// 通常のゲーム本編（index.html／js/main.js）からは一切読み込まれない
//（dev/callEditor.htmlを直接開いたときだけ動く）ので、本番のプレイには影響しない。

import { SONGS } from "../js/data/songs.js";
import { getAudioBlob } from "../js/audioStorage.js";
import { getLyricsData } from "../js/lyricsStorage.js";
import { findActiveLineIndex } from "../js/lyricsSync.js";
import {
  getCallData,
  saveCallData,
  getSongIdsWithCallData,
  deleteCallData,
  exportAllCallData,
  CALL_TYPE,
  DEFAULT_CALL_DURATION_SEC,
} from "../js/callStorage.js";

const PRESET_LABELS_STORAGE_KEY = "equalLoveIntroQuizCallEditor.presetLabels";
// 本人からの要望で5→10→20枠に増やした（2026-08-05）。既存に保存済みの枠は、
// loadPresetLabels()側の「足りない分だけ空欄で継ぎ足す」処理でそのまま引き継がれる。
const PRESET_SLOT_COUNT = 20;
const SEEK_SKIP_AMOUNTS_SEC = [-10, -5, 5, 10];

const CALL_TYPE_OPTIONS = [
  { value: CALL_TYPE.MIX, label: "MIX" },
  { value: CALL_TYPE.MEMBER_CALL, label: "メンバーコール" },
  { value: CALL_TYPE.CALLBACK, label: "合いの手" },
  { value: CALL_TYPE.UNIQUE, label: "固有コール" },
];

const songSelectElement = document.getElementById("editor-song-select");
const loadButtonElement = document.getElementById("editor-load-button");
const loadStatusElement = document.getElementById("editor-load-status");
const referenceLyricsPanelElement = document.getElementById("reference-lyrics-panel");
const audioElement = document.getElementById("editor-audio");
const currentTimeElement = document.getElementById("editor-current-time");
const quickCallRowsElement = document.getElementById("quick-call-rows");
const uniqueCallTypeSelectElement = document.getElementById("unique-call-type-select");
const uniqueCallTextInputElement = document.getElementById("unique-call-text-input");
const uniqueCallAddButtonElement = document.getElementById("unique-call-add-button");
const callsTbodyElement = document.getElementById("calls-tbody");
const callsCountStatusElement = document.getElementById("calls-count-status");
const saveButtonElement = document.getElementById("editor-save-button");
const exportButtonElement = document.getElementById("editor-export-button");
const saveStatusElement = document.getElementById("editor-save-status");
const refreshListButtonElement = document.getElementById("refresh-list-button");
const exportAllButtonElement = document.getElementById("export-all-button");
const exportAllStatusElement = document.getElementById("export-all-status");
const savedListTbodyElement = document.getElementById("saved-list-tbody");
const manageStatusElement = document.getElementById("manage-status");
const recordHoldButtonElement = document.getElementById("record-hold-button");
const recordRangeDisplayElement = document.getElementById("record-range-display");
const recordRangeStatusElement = document.getElementById("record-range-status");

let currentSongId = null;
let currentCalls = []; // { text, start, end, type }（編集中の、まだ保存していない可能性がある内容）
let referenceLines = []; // 参考表示用の歌詞行（読み込み専用）
let currentAudioObjectUrl = null;
let activeRefLineIndex = -1;
let activeCallRowIndex = -1;

// ===== 長押し記録（本人からの要望で2026-08-05追加、2026-08-06に自動追加方式へ変更） =====
// 「押している間を記録」ボタンで決めたstart/endは、離した瞬間にそのまま一覧へ追加する
// （本文が空でも追加できる＝「＋今の位置に空欄で追加」と同じ考え方。本人からの要望で、
// いったん仮欄で確認してから追加する方式をやめ、「今の位置に空欄で追加」ボタンと同じ
// 即時追加の手触りに揃えた）。内部値は丸めず高精度のまま保持し、round2()は一覧へ
// 追加する瞬間だけ適用する。
let isRecordingRange = false;
let recordPointerId = null;
let recordStartSec = null;
let lastAddedCall = null; // 直前に長押し記録で追加した1件（Z/X/C/Vでの開始時刻調整対象）

function findSongTitle(songId) {
  const song = SONGS.find((item) => item.id === songId);
  return song ? song.title : songId;
}

SONGS.forEach((song) => {
  const option = document.createElement("option");
  option.value = song.id;
  option.textContent = `${song.title}（${song.id}）`;
  songSelectElement.appendChild(option);
});

function releaseCurrentAudioObjectUrl() {
  if (currentAudioObjectUrl !== null) {
    URL.revokeObjectURL(currentAudioObjectUrl);
    currentAudioObjectUrl = null;
  }
}

function setStatus(element, text, kind) {
  element.textContent = text;
  element.classList.remove("is-error", "is-success");
  if (kind) element.classList.add(kind);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

// ===== プリセットのラベル（localStorageで曲をまたいで引き継ぐ） =====

function loadPresetLabels() {
  try {
    const stored = localStorage.getItem(PRESET_LABELS_STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePresetLabels(presets) {
  try {
    localStorage.setItem(PRESET_LABELS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // 保存できなくても、その場での入力・記録自体は継続できるようにする
  }
}

function defaultPresets() {
  return Array.from({ length: PRESET_SLOT_COUNT }, () => ({ type: CALL_TYPE.MIX, text: "" }));
}

let presets = loadPresetLabels() ?? defaultPresets();
if (presets.length < PRESET_SLOT_COUNT) {
  presets = [...presets, ...defaultPresets().slice(presets.length)];
}

// 今の再生位置を起点に、1件のコールをcurrentCallsへ追加して一覧を描き直す共通処理。
function pushCallAtCurrentTime(text, type) {
  const start = round2(audioElement.currentTime);
  const end = round2(start + DEFAULT_CALL_DURATION_SEC);
  currentCalls.push({ text, start, end, type });
  currentCalls.sort((a, b) => a.start - b.start);
  renderCallsTable();
}

function addCallFromCurrentTime(text, type) {
  if (!currentSongId) {
    setStatus(loadStatusElement, "先に曲を読み込んでください", "is-error");
    return;
  }
  const trimmed = text.trim();
  if (trimmed === "") return;
  pushCallAtCurrentTime(trimmed, type);
}

// 「＋ 今の位置に空欄で追加」：本文を空のまま、今の再生位置だけを記録する。
// 本文はあとで「4. 記録済みのコール一覧」の欄に直接入力する想定
// （本人からの要望：一覧の下の方まで見ている状態から、プリセット欄まで戻らずに
// その場で追加したい。2026-08-06追加）。空のままだと保存時にエラーになるため、
// 保存前に必ず本文を埋める必要がある（callStorage.jsのvalidateCallData()参照）。
function addBlankCallFromCurrentTime() {
  if (!currentSongId) {
    setStatus(loadStatusElement, "先に曲を読み込んでください", "is-error");
    return;
  }
  pushCallAtCurrentTime("", CALL_TYPE.UNIQUE);
}

document.getElementById("add-blank-call-button").addEventListener("click", addBlankCallFromCurrentTime);

function renderQuickCallRows() {
  quickCallRowsElement.textContent = "";
  presets.forEach((preset, index) => {
    const row = document.createElement("div");
    row.className = "quick-call-row";

    const typeSelect = document.createElement("select");
    typeSelect.className = "quick-call-type-select";
    CALL_TYPE_OPTIONS.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      el.selected = option.value === preset.type;
      typeSelect.appendChild(el);
    });
    typeSelect.addEventListener("change", () => {
      presets[index].type = typeSelect.value;
      savePresetLabels(presets);
    });
    row.appendChild(typeSelect);

    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "quick-call-label-input";
    textInput.placeholder = `プリセット${index + 1}（例：定番コールの言葉）`;
    textInput.value = preset.text;
    textInput.addEventListener("change", () => {
      presets[index].text = textInput.value;
      savePresetLabels(presets);
    });
    row.appendChild(textInput);

    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "quick-call-add-button";
    addButton.textContent = "今の位置に追加";
    addButton.addEventListener("click", () => {
      addCallFromCurrentTime(textInput.value, typeSelect.value);
    });
    row.appendChild(addButton);

    quickCallRowsElement.appendChild(row);
  });
}

uniqueCallAddButtonElement.addEventListener("click", () => {
  addCallFromCurrentTime(uniqueCallTextInputElement.value, uniqueCallTypeSelectElement.value);
  uniqueCallTextInputElement.value = "";
});

// ===== 記録済みコール一覧 =====

function buildTimeAdjustButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

const NUDGE_AMOUNTS_SEC = [-0.5, -0.1, 0.1, 0.5];

function createTimeCell(call, field) {
  const cell = document.createElement("td");
  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.01";
  input.className = "editor-time-input";
  input.value = call[field];
  input.addEventListener("change", () => {
    call[field] = input.valueAsNumber;
  });
  cell.appendChild(input);

  NUDGE_AMOUNTS_SEC.forEach((amountSec) => {
    const label = amountSec > 0 ? `+${amountSec}` : `${amountSec}`;
    cell.appendChild(
      buildTimeAdjustButton(label, "editor-nudge-button", () => {
        const updated = round2(input.valueAsNumber + amountSec);
        input.valueAsNumber = updated;
        call[field] = updated;
      })
    );
  });

  cell.appendChild(
    buildTimeAdjustButton("今の位置に", "editor-set-now-button", () => {
      const updated = round2(audioElement.currentTime);
      input.valueAsNumber = updated;
      call[field] = updated;
    })
  );

  return cell;
}

function renderCallsTable() {
  callsTbodyElement.textContent = "";
  activeCallRowIndex = -1;

  currentCalls.forEach((call) => {
    const row = document.createElement("tr");

    // 「ここへ移動」ボタン：押すとこの行のstart秒へ再生位置がジャンプする
    // （本人からの要望：一覧を見ながら該当の位置へすぐ戻って聴き直したい。2026-08-06追加）。
    const jumpCell = document.createElement("td");
    const jumpButton = document.createElement("button");
    jumpButton.type = "button";
    jumpButton.className = "jump-to-row-button";
    jumpButton.textContent = "▶";
    jumpButton.setAttribute("aria-label", "この位置へ移動する");
    jumpButton.addEventListener("click", () => {
      audioElement.currentTime = call.start;
      updatePlaybackUI();
    });
    jumpCell.appendChild(jumpButton);
    row.appendChild(jumpCell);

    const typeCell = document.createElement("td");
    const typeSelect = document.createElement("select");
    CALL_TYPE_OPTIONS.forEach((option) => {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      el.selected = option.value === call.type;
      typeSelect.appendChild(el);
    });
    typeSelect.addEventListener("change", () => {
      call.type = typeSelect.value;
    });
    typeCell.appendChild(typeSelect);
    row.appendChild(typeCell);

    const textCell = document.createElement("td");
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.className = "call-text-input";
    textInput.value = call.text;
    textInput.addEventListener("change", () => {
      call.text = textInput.value;
    });
    textCell.appendChild(textInput);
    row.appendChild(textCell);

    row.appendChild(createTimeCell(call, "start"));
    row.appendChild(createTimeCell(call, "end"));

    const actionCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "editor-delete-row-button";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => {
      const index = currentCalls.indexOf(call);
      if (index !== -1) currentCalls.splice(index, 1);
      renderCallsTable();
    });
    actionCell.appendChild(deleteButton);
    row.appendChild(actionCell);

    callsTbodyElement.appendChild(row);
  });

  callsCountStatusElement.textContent = `${currentCalls.length}件`;
}

// ===== 参考歌詞・再生位置の表示 =====

function renderReferenceLyrics() {
  referenceLyricsPanelElement.textContent = "";
  activeRefLineIndex = -1;

  if (referenceLines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "ref-empty";
    empty.textContent = "この曲にはまだ歌詞データが登録されていません";
    referenceLyricsPanelElement.appendChild(empty);
    return;
  }

  referenceLines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line.text;
    referenceLyricsPanelElement.appendChild(p);
  });
}

function updatePlaybackUI() {
  currentTimeElement.textContent = `現在の再生位置：${audioElement.currentTime.toFixed(2)}秒`;

  if (referenceLines.length > 0) {
    const index = findActiveLineIndex(referenceLines, audioElement.currentTime);
    if (index !== activeRefLineIndex) {
      activeRefLineIndex = index;
      [...referenceLyricsPanelElement.children].forEach((el, i) => {
        el.classList.toggle("is-current-ref-line", i === index);
      });
    }
  }

  if (currentCalls.length > 0) {
    const index = findActiveLineIndex(currentCalls, audioElement.currentTime);
    if (index !== activeCallRowIndex) {
      activeCallRowIndex = index;
      [...callsTbodyElement.children].forEach((row, i) => {
        row.classList.toggle("is-current-editor-call", i === index);
      });
    }
  }
}

audioElement.addEventListener("timeupdate", updatePlaybackUI);
audioElement.addEventListener("seeking", updatePlaybackUI);

// ===== 秒数移動ボタン（−10／−5／+5／+10秒）=====
// 本人からの要望：音楽バーに秒数移動ボタンを付けてほしい（2026-08-06追加）。
function wireSkipButton(buttonId, amountSec) {
  document.getElementById(buttonId).addEventListener("click", () => {
    const duration = audioElement.duration || audioElement.currentTime;
    audioElement.currentTime = Math.min(duration, Math.max(0, audioElement.currentTime + amountSec));
  });
}
wireSkipButton("skip-back-10-button", -10);
wireSkipButton("skip-back-5-button", -5);
wireSkipButton("skip-forward-5-button", 5);
wireSkipButton("skip-forward-10-button", 10);

// ===== キーボードショートカット（Q/W/E/R＝曲全体のシーク、Z/X/C/V＝仮の開始時刻の微調整） =====
// 本人からの要望：何時間も使う前提のツールなので、マウスを使わずキーボードだけで
// 速く・疲れにくく操作できるようにしたい（2026-08-05追加）。
// 入力欄（本文・プリセット名等）にフォーカスがある間は、通常の文字入力を優先するため
// ショートカットは発動させない。

const GLOBAL_SEEK_KEY_AMOUNTS_SEC = { q: -10, w: -5, e: 5, r: 10 };
const PENDING_START_NUDGE_KEY_AMOUNTS_SEC = { z: -0.5, x: -0.1, c: 0.1, v: 0.5 };

// 【本人からの報告で2026-08-06修正】以前はINPUT/SELECT/TEXTAREA全部をショートカット無効の
// 対象にしていたが、クリック中心で操作していると数値欄（開始・終了時刻）やプルダウン（種類）に
// カーソルが残ったままになりやすく、その状態だとキーボードがずっと反応しなくなっていた。
// 実際に文字（q/w/e/r/z/x/c/v）を打ち込める欄（テキスト入力・テキストエリア）だけを対象にし、
// 数値欄（文字キーはそもそも入力できない）やプルダウンは対象から外す。
function isFocusInsideFormField() {
  const el = document.activeElement;
  if (!el) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName === "INPUT") return el.type !== "number";
  return false;
}

function seekAudioBy(amountSec) {
  const duration = audioElement.duration || audioElement.currentTime;
  // 0秒未満・曲の長さ超えのどちらにもならないようclamp。play/pauseの状態には触れない
  // （setするだけで再生中はそのまま流れ続け、停止中はそのまま止まったままになる仕様のため）。
  audioElement.currentTime = Math.min(duration, Math.max(0, audioElement.currentTime + amountSec));
  updatePlaybackUI();
}

document.addEventListener("keydown", (event) => {
  if (isFocusInsideFormField()) return;
  if (event.ctrlKey || event.altKey || event.metaKey) return; // 修飾キー同時押しは対象外（誤爆防止）

  // Spaceキーで再生⇔一時停止（本人からの要望：YouTubeのような感覚で使いたい。2026-08-05追加）。
  // event.preventDefault()により、フォーカスがボタン上にある場合の「Spaceでボタンを押す」
  // というブラウザ標準動作や、audio要素自体の標準のSpace割り当てとの二重発火も防いでいる。
  if (event.code === "Space") {
    event.preventDefault();
    if (audioElement.paused) {
      audioElement.play().catch(() => {});
    } else {
      audioElement.pause();
    }
    return;
  }

  const key = event.key.toLowerCase();

  if (key in GLOBAL_SEEK_KEY_AMOUNTS_SEC) {
    event.preventDefault();
    seekAudioBy(GLOBAL_SEEK_KEY_AMOUNTS_SEC[key]);
    return;
  }

  if (key in PENDING_START_NUDGE_KEY_AMOUNTS_SEC) {
    event.preventDefault();
    nudgeLastAddedCallStart(PENDING_START_NUDGE_KEY_AMOUNTS_SEC[key]);
  }
});

// ===== 長押しで範囲を記録（本人からの要望：「押している実時間＝範囲」にしたい。2026-08-05追加。
// 2026-08-06、押しっぱなし→離した瞬間にそのまま一覧へ追加する方式へ変更） =====

function renderRecordedRangeDisplay() {
  if (!lastAddedCall) {
    recordRangeDisplayElement.textContent = "開始：--　終了：--　長さ：--";
    return;
  }
  const { start, end } = lastAddedCall;
  recordRangeDisplayElement.textContent = `開始：${start.toFixed(2)}秒　終了：${end.toFixed(2)}秒　長さ：${(end - start).toFixed(2)}秒`;
}

// 直前に長押し記録で追加した行の開始時刻だけをキーボードで微調整する
// （終了時刻は既存の各行のボタン・次の記録タイミングで調整する方針のため対象外）。
function nudgeLastAddedCallStart(deltaSec) {
  if (!lastAddedCall) return; // まだ何も追加していなければ何もしない
  const updated = round2(Math.min(lastAddedCall.end, Math.max(0, lastAddedCall.start + deltaSec)));
  lastAddedCall.start = updated;
  renderCallsTable();
  renderRecordedRangeDisplay();
  // 「変更後の範囲をすぐ試聴できる」ようにするため、再生位置も新しい開始時刻へ合わせておく
  // （自動再生はしない。手元の再生ボタン・スペースキー等で確認できる状態にするだけ）。
  audioElement.currentTime = updated;
  updatePlaybackUI();
}

function setRecordButtonVisualState(recording) {
  recordHoldButtonElement.classList.toggle("is-recording", recording);
  recordHoldButtonElement.textContent = recording ? "● 記録中　離すと終了" : "押している間を記録（離すと空欄でも追加）";
}

const MIN_RECORDED_RANGE_SEC = 0.05;

function startRecordingRange(pointerId) {
  console.debug("[record] startRecordingRange 呼び出し", { pointerId, isRecordingRange, currentSongId });
  if (isRecordingRange) return; // 二重開始防止
  if (!currentSongId) {
    setStatus(recordRangeStatusElement, "先に曲を読み込んでください", "is-error");
    return;
  }
  isRecordingRange = true;
  recordPointerId = pointerId;
  recordStartSec = audioElement.currentTime; // setTimeoutを挟まず、その場でcurrentTimeを直接取得
  console.debug("[record] 記録開始", { recordStartSec });
  setStatus(recordRangeStatusElement, "", null);
  setRecordButtonVisualState(true);
  audioElement.play().catch((error) => {
    console.debug("[record] audio.play()が失敗しました（記録状態は継続します）", error);
  });
}

// commit=trueなら「離した瞬間」として仮の開始・終了へ反映、falseなら中断として何も反映しない
// （pointercancel・ウィンドウのblur・タブの非表示化など、正常に離せなかった場合の安全策）。
function stopRecordingRange({ commit, reason }) {
  console.debug("[record] stopRecordingRange 呼び出し", { commit, reason, isRecordingRange });
  if (!isRecordingRange) return;
  const endSec = audioElement.currentTime; // こちらもその場で直接取得（追加の遅延を入れない）
  isRecordingRange = false;
  recordPointerId = null;
  // 【本人からの要望で2026-08-06変更】離した瞬間に一時停止していたが、続けて次のコールを
  // 記録するときに毎回また再生し直す手間が面倒とのことで、離しても曲は止めず流れ続けるようにした。
  setRecordButtonVisualState(false);

  if (!commit) {
    console.debug("[record] 中断として扱いました（一覧へは追加していません）", { reason, recordStartSec, endSec });
    setStatus(recordRangeStatusElement, "記録を中断しました（追加していません）", null);
    return;
  }

  const start = recordStartSec;
  const end = Math.max(endSec, recordStartSec); // 終了は必ず開始以上にする
  // 本文が空でも追加する（本人からの要望：「＋今の位置に空欄で追加」と同じ手触りにしたい。
  // 本文は「4. 記録済みのコール一覧」の欄にあとから直接入力できる）。
  const text = uniqueCallTextInputElement.value;
  const newCall = { text, start: round2(start), end: round2(end), type: uniqueCallTypeSelectElement.value };
  currentCalls.push(newCall);
  currentCalls.sort((a, b) => a.start - b.start);
  renderCallsTable();
  uniqueCallTextInputElement.value = ""; // 既存の「今の位置に追加」ボタンと同じく、追加後は本文欄を空に戻す

  lastAddedCall = newCall;
  renderRecordedRangeDisplay();
  console.debug("[record] 記録終了・一覧へ追加しました", newCall);

  if (end - start < MIN_RECORDED_RANGE_SEC) {
    setStatus(recordRangeStatusElement, "非常に短い区間で追加しました。内容を確認してください", "is-error");
  } else {
    setStatus(recordRangeStatusElement, "一覧へ追加しました", "is-success");
  }
}

recordHoldButtonElement.addEventListener("pointerdown", (event) => {
  console.debug("[record] pointerdown発生", { pointerId: event.pointerId, pointerType: event.pointerType, button: event.button });
  if (event.pointerType === "mouse" && event.button !== 0) return; // 左クリック以外は対象外
  // 【本人からの実機報告を受けて2026-08-05修正】以前はここでevent.preventDefault()を呼んでいたが、
  // 実機で長押しがpointerupまで届かない不具合が報告されたため、原因切り分けのため一旦外した
  // （preventDefault自体がpointerupを妨げるとは考えにくいが、安全側に倒す）。
  recordHoldButtonElement.setPointerCapture(event.pointerId);
  startRecordingRange(event.pointerId);
});

recordHoldButtonElement.addEventListener("pointerup", (event) => {
  console.debug("[record] pointerup発生", { pointerId: event.pointerId, recordPointerId });
  if (event.pointerId !== recordPointerId) return;
  stopRecordingRange({ commit: true, reason: "pointerup" });
});

recordHoldButtonElement.addEventListener("pointercancel", (event) => {
  console.debug("[record] pointercancel発生（ブラウザが長押しを中断とみなしました）", { pointerId: event.pointerId, recordPointerId });
  if (event.pointerId !== recordPointerId) return;
  stopRecordingRange({ commit: false, reason: "pointercancel" });
});

// ボタン外へ出ても記録は継続する仕様（setPointerCaptureで既に保証されている）が、
// ウィンドウ自体が非アクティブになる／タブが隠れるケースは安全に停止させる。
window.addEventListener("blur", () => {
  if (isRecordingRange) stopRecordingRange({ commit: false, reason: "window blur" });
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && isRecordingRange) stopRecordingRange({ commit: false, reason: "visibilitychange" });
});

// 長押し中に右クリックメニュー等が誤って割り込むのを防ぐ（本人からの報告を受けた念のための対策）。
recordHoldButtonElement.addEventListener("contextmenu", (event) => event.preventDefault());

// setPointerCaptureがブラウザ側の都合で暗黙的に外れた場合の診断用（本来はpointerup/pointercancelと
// セットで発生するはずだが、単独で発生した場合は原因調査の手がかりになる）。
recordHoldButtonElement.addEventListener("lostpointercapture", (event) => {
  console.debug("[record] lostpointercapture発生", { pointerId: event.pointerId, isRecordingRange });
  if (isRecordingRange && event.pointerId === recordPointerId) {
    stopRecordingRange({ commit: false, reason: "lostpointercapture" });
  }
});

// ===== 1. 曲を選ぶ =====

async function handleLoadSong() {
  const songId = songSelectElement.value;
  setStatus(loadStatusElement, "読み込み中…", null);

  releaseCurrentAudioObjectUrl();
  audioElement.pause();
  audioElement.removeAttribute("src");

  const blob = await getAudioBlob(songId);
  let audioStatusText;
  if (blob) {
    currentAudioObjectUrl = URL.createObjectURL(blob);
    audioElement.src = currentAudioObjectUrl;
    audioStatusText = "音源：読み込み済み";
  } else {
    audioStatusText = "音源：未読み込み（スタート画面の「音源を読み込む」から先に取り込んでください）";
  }

  const lyricsRecord = await getLyricsData(songId);
  referenceLines = lyricsRecord && Array.isArray(lyricsRecord.lines) ? lyricsRecord.lines : [];
  renderReferenceLyrics();

  const callRecord = await getCallData(songId);
  currentSongId = songId;
  currentCalls = callRecord && Array.isArray(callRecord.calls) ? callRecord.calls.map((c) => ({ ...c })) : [];
  renderCallsTable();

  const callsStatusText =
    currentCalls.length > 0 ? `コール：${currentCalls.length}件を読み込みました` : "コール：まだ登録されていません";
  setStatus(loadStatusElement, `${audioStatusText} / ${callsStatusText}`, "is-success");
}

loadButtonElement.addEventListener("click", handleLoadSong);

// ===== 5. 保存・書き出し =====

saveButtonElement.addEventListener("click", async () => {
  if (!currentSongId) {
    setStatus(saveStatusElement, "先に曲を読み込んでください", "is-error");
    return;
  }
  if (currentCalls.length === 0) {
    setStatus(saveStatusElement, "記録したコールがありません", "is-error");
    return;
  }

  const record = { songId: currentSongId, calls: currentCalls, schemaVersion: 1 };
  const result = await saveCallData(record);

  if (!result.saved) {
    setStatus(saveStatusElement, `保存できませんでした：\n${result.errors.join("\n")}`, "is-error");
    return;
  }

  const warningText = result.warnings.length > 0 ? `\n警告：\n${result.warnings.join("\n")}` : "";
  setStatus(saveStatusElement, `保存しました（${currentCalls.length}件）${warningText}`, "is-success");
  renderSavedList();
});

exportButtonElement.addEventListener("click", () => {
  if (!currentSongId) {
    setStatus(saveStatusElement, "先に曲を読み込んでください", "is-error");
    return;
  }
  if (currentCalls.length === 0) {
    setStatus(saveStatusElement, "書き出すコールがありません", "is-error");
    return;
  }

  const record = { songId: currentSongId, calls: currentCalls, schemaVersion: 1, updatedAt: Date.now() };
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentSongId}-calls.json`;
  link.click();
  URL.revokeObjectURL(url);
});

// ===== 6. 保存済みの管理 =====

// 「全コールデータを書き出す」：この端末に保存されている全曲分をまとめて1つのJSONにする。
// 別端末（スマホ等）の「データ管理」画面にある「コールJSONを読み込む」で取り込める形式
// （js/callStorage.jsのexportAllCallData()／validateCallDataBackupFile()参照）。
// 書き出すだけで、この端末のIndexedDBの内容は一切変更しない。
exportAllButtonElement.addEventListener("click", async () => {
  const backup = await exportAllCallData();

  if (backup.songs.length === 0) {
    setStatus(exportAllStatusElement, "書き出せるコールデータがありません（まだ何も保存されていません）", "is-error");
    return;
  }

  const totalCallCount = backup.songs.reduce((sum, song) => sum + song.calls.length, 0);
  const dateLabel = backup.exportedAt.slice(0, 10); // "YYYY-MM-DD"部分だけをファイル名に使う
  const fileName = `equal-love-calls-${dateLabel}.json`;

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  setStatus(
    exportAllStatusElement,
    `${backup.songs.length}曲・${totalCallCount}件のコールを書き出しました（ファイル名：${fileName}）`,
    "is-success"
  );
});

function formatUpdatedAt(timestampMs) {
  if (typeof timestampMs !== "number") return "-";
  return new Date(timestampMs).toLocaleString("ja-JP");
}

async function renderSavedList() {
  const songIds = await getSongIdsWithCallData();
  const records = await Promise.all(songIds.map((songId) => getCallData(songId)));
  savedListTbodyElement.textContent = "";

  songIds.forEach((songId, index) => {
    const record = records[index];
    const row = document.createElement("tr");

    const titleCell = document.createElement("td");
    titleCell.textContent = `${findSongTitle(songId)}（${songId}）`;
    row.appendChild(titleCell);

    const countCell = document.createElement("td");
    countCell.textContent = record ? record.calls.length : "-";
    row.appendChild(countCell);

    const updatedAtCell = document.createElement("td");
    updatedAtCell.textContent = record ? formatUpdatedAt(record.updatedAt) : "-";
    row.appendChild(updatedAtCell);

    const actionCell = document.createElement("td");
    const deleteRowButton = document.createElement("button");
    deleteRowButton.type = "button";
    deleteRowButton.className = "editor-delete-row-button";
    deleteRowButton.textContent = "削除する";
    deleteRowButton.addEventListener("click", async () => {
      if (!confirm(`「${findSongTitle(songId)}」のコールデータを削除します。よろしいですか？`)) return;
      await deleteCallData(songId);
      if (songId === currentSongId) {
        currentCalls = [];
        renderCallsTable();
      }
      setStatus(manageStatusElement, `「${findSongTitle(songId)}」のコールデータを削除しました`, "is-success");
      renderSavedList();
    });
    actionCell.appendChild(deleteRowButton);
    row.appendChild(actionCell);

    savedListTbodyElement.appendChild(row);
  });

  setStatus(manageStatusElement, `保存済み：${songIds.length}曲`, null);
}

refreshListButtonElement.addEventListener("click", renderSavedList);

renderQuickCallRows();
renderSavedList();
