// 開発用：歌詞タイミング編集ツール本体。
// 本人が歌詞カードと照合して確定させた歌詞本文（songs.jsのidに対応する曲）を対象に、
// 実際に音源を聴きながら各行のstart/end（秒）を微調整し、IndexedDBへ保存する。
//
// 通常のゲーム本編（index.html／js/main.js）からは一切読み込まれない
//（dev/lyricsEditor.htmlを直接開いたときだけ動く）ので、本番のプレイには影響しない。
//
// このツールでは歌詞本文の入力・追加・削除は行わない（タイミングの微調整だけが対象）。
// 歌詞本文そのものを確定させる作業（歌詞カードとの照合）は、このツールの外で行う運用
// （10-15章参照）。

import { SONGS } from "../js/data/songs.js";
import { getAudioBlob } from "../js/audioStorage.js";
import { getLyricsData, saveLyricsData, normalizeLyricsData } from "../js/lyricsStorage.js";
import { findActiveLineIndex } from "../js/lyricsSync.js";

const songSelectElement = document.getElementById("editor-song-select");
const loadButtonElement = document.getElementById("editor-load-button");
const loadStatusElement = document.getElementById("editor-load-status");
const jsonInputElement = document.getElementById("editor-json-input");
const jsonStatusElement = document.getElementById("editor-json-status");
const audioElement = document.getElementById("editor-audio");
const currentTimeElement = document.getElementById("editor-current-time");
const linesTbodyElement = document.getElementById("editor-lines-tbody");
const saveButtonElement = document.getElementById("editor-save-button");
const exportButtonElement = document.getElementById("editor-export-button");
const saveStatusElement = document.getElementById("editor-save-status");

// 微調整ボタンの刻み幅（秒）。10-15章で挙がっていた「±0.1秒／±0.5秒」に対応する。
const NUDGE_AMOUNTS_SEC = [-0.5, -0.1, 0.1, 0.5];

let currentSongId = null;
let currentLines = []; // { line, text, start, end }（編集中の、まだ保存していない可能性がある内容）
let currentAudioObjectUrl = null;
let activeRowIndex = -1;

// 曲選択欄を組み立てる（songs.jsのSONGS配列から、id・titleだけを使う。歌詞本文は使わない）。
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
  if (kind) {
    element.classList.add(kind);
  }
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildTimeAdjustButton(label, className, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

// start/endどちらか一方について、数値入力欄＋微調整ボタン＋「今の位置に」ボタンを1セット作る。
// lineオブジェクト自体を直接書き換えるので、renderLinesTable()を呼び直さなくても
// 保存・書き出し時には常に最新の値が使われる。
function createTimeCell(line, field) {
  const cell = document.createElement("td");

  const input = document.createElement("input");
  input.type = "number";
  input.step = "0.01";
  input.className = "editor-time-input";
  input.value = line[field];
  input.addEventListener("change", () => {
    line[field] = input.valueAsNumber;
  });
  cell.appendChild(input);

  NUDGE_AMOUNTS_SEC.forEach((amountSec) => {
    const label = amountSec > 0 ? `+${amountSec}` : `${amountSec}`;
    cell.appendChild(
      buildTimeAdjustButton(label, "editor-nudge-button", () => {
        const updated = round2(input.valueAsNumber + amountSec);
        input.valueAsNumber = updated;
        line[field] = updated;
      })
    );
  });

  cell.appendChild(
    buildTimeAdjustButton("今の位置に", "editor-set-now-button", () => {
      const updated = round2(audioElement.currentTime);
      input.valueAsNumber = updated;
      line[field] = updated;
    })
  );

  return cell;
}

// 編集中の行一覧をテーブルへ描画し直す。曲を読み込んだとき・外部JSONで差し替えたときだけ呼ぶ
// （1つの行の数値を変えるだけなら、createTimeCell内のイベントがlineオブジェクトを直接更新するため、
// テーブル全体を作り直す必要はない）。
function renderLinesTable() {
  linesTbodyElement.textContent = "";
  activeRowIndex = -1;

  currentLines.forEach((line) => {
    const row = document.createElement("tr");

    const numberCell = document.createElement("td");
    numberCell.textContent = line.line;
    row.appendChild(numberCell);

    const textCell = document.createElement("td");
    textCell.className = "editor-line-text";
    textCell.textContent = line.text;
    row.appendChild(textCell);

    row.appendChild(createTimeCell(line, "start"));
    row.appendChild(createTimeCell(line, "end"));

    linesTbodyElement.appendChild(row);
  });
}

// 再生位置に応じて、現在該当する行の背景を強調する。
// findActiveLineIndex()はStep3で作った同期歌詞表示（js/lyricsSync.js）と同じ純粋関数を再利用しており、
// 本編で実際にどう見えるかを、このツール上でも同じ判定基準で確認できる。
function updateActiveRowHighlight() {
  currentTimeElement.textContent = `現在の再生位置：${audioElement.currentTime.toFixed(2)}秒`;

  if (currentLines.length === 0) return;

  const index = findActiveLineIndex(currentLines, audioElement.currentTime);
  if (index === activeRowIndex) return;
  activeRowIndex = index;

  [...linesTbodyElement.children].forEach((row, i) => {
    row.classList.toggle("is-current-editor-line", i === index);
  });
}

audioElement.addEventListener("timeupdate", updateActiveRowHighlight);
audioElement.addEventListener("seeking", updateActiveRowHighlight);

// 「この曲を読み込む」：音源（IndexedDB）とすでに保存済みの歌詞データ（あれば）を読み込む。
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

  const record = await getLyricsData(songId);
  currentSongId = songId;

  if (record && Array.isArray(record.lines)) {
    currentLines = record.lines.map((line) => ({ ...line }));
    setStatus(loadStatusElement, `${audioStatusText} / 歌詞：${currentLines.length}行を読み込みました`, "is-success");
  } else {
    currentLines = [];
    setStatus(
      loadStatusElement,
      `${audioStatusText} / 歌詞：まだ保存されていません（下の「2. 外部JSONから読み込む」から取り込めます）`,
      null
    );
  }

  renderLinesTable();
}

loadButtonElement.addEventListener("click", handleLoadSong);

// 「外部JSONから読み込む」：解析ツールの出力やこのツールの書き出しファイルを、
// 編集対象の行として取り込む（まだIndexedDBには保存しない。保存は4番のボタンで行う）。
jsonInputElement.addEventListener("change", async () => {
  const file = jsonInputElement.files[0];
  if (!file) return;

  if (!currentSongId) {
    setStatus(jsonStatusElement, "先に「1. 曲を選ぶ」でこの曲を読み込んでください", "is-error");
    jsonInputElement.value = "";
    return;
  }

  let rawData;
  try {
    rawData = JSON.parse(await file.text());
  } catch (error) {
    setStatus(jsonStatusElement, "JSONとして読み込めませんでした", "is-error");
    jsonInputElement.value = "";
    return;
  }

  const normalized = normalizeLyricsData(rawData);
  if (!normalized) {
    setStatus(jsonStatusElement, "songIdが見つからないなど、想定した形式ではありません", "is-error");
    jsonInputElement.value = "";
    return;
  }

  if (normalized.songId !== currentSongId) {
    setStatus(
      jsonStatusElement,
      `songIdが一致しません（選択中：${currentSongId} / ファイル：${normalized.songId}）`,
      "is-error"
    );
    jsonInputElement.value = "";
    return;
  }

  currentLines = normalized.lines.map((line) => ({ ...line }));
  renderLinesTable();
  setStatus(jsonStatusElement, `${currentLines.length}行を読み込みました（まだ保存はしていません）`, "is-success");
  jsonInputElement.value = "";
});

// 「IndexedDBへ保存する」：saveLyricsData()が内部で必ずvalidateLyricsData()を通すため、
// 不正な状態（start/endの逆転、負の時間など）のまま保存されることはない。
saveButtonElement.addEventListener("click", async () => {
  if (!currentSongId) {
    setStatus(saveStatusElement, "先に曲を読み込んでください", "is-error");
    return;
  }
  if (currentLines.length === 0) {
    setStatus(saveStatusElement, "編集対象の行がありません", "is-error");
    return;
  }

  const record = { songId: currentSongId, lines: currentLines, schemaVersion: 1 };
  const result = await saveLyricsData(record);

  if (!result.saved) {
    setStatus(saveStatusElement, `保存できませんでした：\n${result.errors.join("\n")}`, "is-error");
    return;
  }

  const warningText = result.warnings.length > 0 ? `\n警告：\n${result.warnings.join("\n")}` : "";
  setStatus(saveStatusElement, `保存しました（${currentLines.length}行）${warningText}`, "is-success");
});

// 「JSONとして書き出す」：バックアップ・Git管理外での保管・別端末への持ち出し用。
exportButtonElement.addEventListener("click", () => {
  if (!currentSongId) {
    setStatus(saveStatusElement, "先に曲を読み込んでください", "is-error");
    return;
  }
  if (currentLines.length === 0) {
    setStatus(saveStatusElement, "書き出す行がありません", "is-error");
    return;
  }

  const record = { songId: currentSongId, lines: currentLines, schemaVersion: 1, updatedAt: Date.now() };
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${currentSongId}-timing.json`;
  link.click();

  URL.revokeObjectURL(url);
});
