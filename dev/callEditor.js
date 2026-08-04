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
  CALL_TYPE,
  DEFAULT_CALL_DURATION_SEC,
} from "../js/callStorage.js";

const PRESET_LABELS_STORAGE_KEY = "equalLoveIntroQuizCallEditor.presetLabels";
// 本人からの要望で5→10枠に増やした（2026-08-06）。既存に保存済みの5枠は、
// loadPresetLabels()側の「足りない分だけ空欄で継ぎ足す」処理でそのまま引き継がれる。
const PRESET_SLOT_COUNT = 10;
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
const savedListTbodyElement = document.getElementById("saved-list-tbody");
const manageStatusElement = document.getElementById("manage-status");

let currentSongId = null;
let currentCalls = []; // { text, start, end, type }（編集中の、まだ保存していない可能性がある内容）
let referenceLines = []; // 参考表示用の歌詞行（読み込み専用）
let currentAudioObjectUrl = null;
let activeRefLineIndex = -1;
let activeCallRowIndex = -1;

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
