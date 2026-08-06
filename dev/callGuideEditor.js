// 【開発用】コールガイド（MIX・口上の練習本文）入力ツールの動作を組み立てるファイル。
// dev/callEditor.jsと同じ設計方針：本編（js/main.js）とは完全に独立しており、
// ここで扱うデータはjs/callGuideStorage.js経由でequalLoveIntroQuizCallGuideという
// 専用IndexedDBにのみ保存する（本編の音源・歌詞・タイミング付きコールには一切触れない）。

import { MIX_AND_KOUJOU_GUIDE } from "../js/data/mixAndKoujouGuide.js";
import {
  getCallGuideData,
  getAllCallGuideData,
  saveCallGuideData,
  deleteCallGuideData,
  exportAllCallGuideData,
  analyzeCallGuideBackupFile,
  importCallGuideDataEntries,
} from "../js/callGuideStorage.js";

const candidateImportInputElement = document.getElementById("candidate-import-input");
const candidateImportStatusElement = document.getElementById("candidate-import-status");

const guideIdSelectElement = document.getElementById("guide-id-select");
const guideNameInputElement = document.getElementById("guide-name-input");
const guideCategorySelectElement = document.getElementById("guide-category-select");
const guideSongIdsInputElement = document.getElementById("guide-song-ids-input");
const guideTextLinesTextareaElement = document.getElementById("guide-text-lines-textarea");
const guidePronunciationTextareaElement = document.getElementById("guide-pronunciation-textarea");
const guideSegmentNoteInputElement = document.getElementById("guide-segment-note-input");
const guideUsagePositionInputElement = document.getElementById("guide-usage-position-input");
const guideBeginnerNoteInputElement = document.getElementById("guide-beginner-note-input");
const guideSaveButtonElement = document.getElementById("guide-save-button");
const guideDeleteButtonElement = document.getElementById("guide-delete-button");
const guidePreviewButtonElement = document.getElementById("guide-preview-button");
const guideSaveStatusElement = document.getElementById("guide-save-status");
const guidePreviewElement = document.getElementById("guide-preview");

const refreshListButtonElement = document.getElementById("refresh-list-button");
const exportAllButtonElement = document.getElementById("export-all-button");
const exportAllStatusElement = document.getElementById("export-all-status");
const savedListTbodyElement = document.getElementById("saved-list-tbody");
const manageStatusElement = document.getElementById("manage-status");

function setStatus(element, text, kind) {
  element.textContent = text;
  element.classList.remove("is-error", "is-success");
  if (kind) element.classList.add(kind);
}

// テキストエリアの中身を「1行＝配列の1要素」に変換する。空行・前後の空白は取り除く。
function textareaToLines(textarea) {
  return textarea.value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function linesToTextarea(lines) {
  return Array.isArray(lines) ? lines.join("\n") : "";
}

// 「songId1, songId2」形式の入力を配列へ変換する。空欄ならnull（対象曲なし）を返す。
function songIdsInputToArray(value) {
  const ids = value
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : null;
}

function songIdsArrayToInput(songIds) {
  return Array.isArray(songIds) ? songIds.join(", ") : "";
}

// ガイド一覧の選択肢を、js/data/mixAndKoujouGuide.js（本編の一覧）から自動生成する。
MIX_AND_KOUJOU_GUIDE.forEach((entry) => {
  const option = document.createElement("option");
  option.value = entry.id;
  option.textContent = `${entry.name}（${entry.id}）`;
  guideIdSelectElement.appendChild(option);
});

// 選ばれたガイドIDの内容をフォームへ反映する。IndexedDBに保存済みならその内容、
// 未保存ならjs/data/mixAndKoujouGuide.jsの名称・分類・対象曲だけを初期値として表示する
// （本文欄は空のまま＝まだ本文が入力されていないことがひと目で分かるようにする）。
async function loadGuideIntoForm(guideId) {
  const definition = MIX_AND_KOUJOU_GUIDE.find((entry) => entry.id === guideId);
  const saved = await getCallGuideData(guideId);

  guideNameInputElement.value = saved?.name ?? definition?.name ?? "";
  guideCategorySelectElement.value = saved?.category ?? definition?.category ?? "mix";
  guideSongIdsInputElement.value = songIdsArrayToInput(saved?.songIds ?? definition?.songIds ?? null);
  guideTextLinesTextareaElement.value = linesToTextarea(saved?.textLines ?? []);
  guidePronunciationTextareaElement.value = linesToTextarea(saved?.pronunciationLines ?? []);
  guideSegmentNoteInputElement.value = saved?.segmentNote ?? "";
  guideUsagePositionInputElement.value = saved?.usagePosition ?? "";
  guideBeginnerNoteInputElement.value = saved?.beginnerNote ?? "";
  guidePreviewElement.hidden = true;
  setStatus(guideSaveStatusElement, saved ? "この端末に保存済みのガイドです。" : "まだこの端末には保存されていません。");
}

guideIdSelectElement.addEventListener("change", () => {
  loadGuideIntoForm(guideIdSelectElement.value);
});

function buildRecordFromForm() {
  return {
    guideId: guideIdSelectElement.value,
    name: guideNameInputElement.value.trim(),
    category: guideCategorySelectElement.value,
    songIds: songIdsInputToArray(guideSongIdsInputElement.value),
    textLines: textareaToLines(guideTextLinesTextareaElement),
    pronunciationLines: textareaToLines(guidePronunciationTextareaElement),
    segmentNote: guideSegmentNoteInputElement.value.trim(),
    usagePosition: guideUsagePositionInputElement.value.trim(),
    beginnerNote: guideBeginnerNoteInputElement.value.trim(),
  };
}

guideSaveButtonElement.addEventListener("click", async () => {
  const record = buildRecordFromForm();
  const result = await saveCallGuideData(record);
  if (!result.saved) {
    setStatus(guideSaveStatusElement, `保存できませんでした：\n${result.errors.join("\n")}`, "is-error");
    return;
  }
  const warningText = result.warnings.length > 0 ? `\n（注意：${result.warnings.join(" / ")}）` : "";
  setStatus(guideSaveStatusElement, `保存しました。${warningText}`, "is-success");
  refreshSavedList();
});

guideDeleteButtonElement.addEventListener("click", async () => {
  await deleteCallGuideData(guideIdSelectElement.value);
  setStatus(guideSaveStatusElement, "このガイドを削除しました。");
  guideTextLinesTextareaElement.value = "";
  guidePronunciationTextareaElement.value = "";
  refreshSavedList();
});

guidePreviewButtonElement.addEventListener("click", () => {
  const record = buildRecordFromForm();
  const lines = [];
  lines.push(`【${record.name}】`);
  if (record.usagePosition) lines.push(`使用位置：${record.usagePosition}`);
  lines.push("");
  if (record.textLines.length === 0) {
    lines.push("（本文が未入力です）");
  } else {
    record.textLines.forEach((line, index) => {
      const reading = record.pronunciationLines[index] ? `（${record.pronunciationLines[index]}）` : "";
      lines.push(`${index + 1}. ${line}${reading}`);
    });
  }
  if (record.segmentNote) lines.push(`\n区切り：${record.segmentNote}`);
  if (record.beginnerNote) lines.push(`初心者向けメモ：${record.beginnerNote}`);
  guidePreviewElement.textContent = lines.join("\n");
  guidePreviewElement.hidden = false;
});

// ===== 候補JSONの読み込み（1. のセクション） =====
// dev/call-guide-candidates.json（Git管理外）等、Claudeが用意した候補ファイルを取り込む。
// 本編の「コールガイドJSONを読み込む」と全く同じ検証・保存ロジック（js/callGuideStorage.js）を
// 再利用するため、ファイルの形式チェックは二重管理にならない。
candidateImportInputElement.addEventListener("change", async () => {
  const files = candidateImportInputElement.files;
  if (!files || files.length === 0) return;

  const { fileValid, fileError, readyGuides, failedGuides } = await analyzeCallGuideBackupFile(files[0]);
  candidateImportInputElement.value = "";

  if (!fileValid) {
    setStatus(candidateImportStatusElement, fileError, "is-error");
    return;
  }
  if (readyGuides.length === 0) {
    setStatus(candidateImportStatusElement, "読み込めるガイドがありませんでした。", "is-error");
    return;
  }

  const { savedGuideIds, saveFailures } = await importCallGuideDataEntries(readyGuides);
  const failedNote = failedGuides.length > 0 ? `\n読み込めなかったもの：${failedGuides.length}件` : "";
  const saveFailedNote = saveFailures.length > 0 ? `\n保存に失敗：${saveFailures.length}件` : "";
  setStatus(
    candidateImportStatusElement,
    `${savedGuideIds.length}件のガイドを取り込みました。内容を確認・修正してください。${failedNote}${saveFailedNote}`,
    "is-success"
  );
  refreshSavedList();
  loadGuideIntoForm(guideIdSelectElement.value);
});

// ===== 3. 保存済み一覧・全件書き出し =====

async function refreshSavedList() {
  const records = await getAllCallGuideData();
  savedListTbodyElement.innerHTML = "";

  records
    .sort((a, b) => a.guideId.localeCompare(b.guideId))
    .forEach((record) => {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = `${record.name}（${record.guideId}）`;
      row.appendChild(nameCell);

      const categoryCell = document.createElement("td");
      categoryCell.textContent = record.category;
      row.appendChild(categoryCell);

      const countCell = document.createElement("td");
      countCell.textContent = `${record.textLines.length}行`;
      row.appendChild(countCell);

      const actionCell = document.createElement("td");
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "editor-edit-row-button";
      editButton.textContent = "編集";
      editButton.addEventListener("click", () => {
        guideIdSelectElement.value = record.guideId;
        loadGuideIntoForm(record.guideId);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      actionCell.appendChild(editButton);
      row.appendChild(actionCell);

      savedListTbodyElement.appendChild(row);
    });

  setStatus(manageStatusElement, `${records.length}件のガイドが保存されています。`);
}

refreshListButtonElement.addEventListener("click", refreshSavedList);

exportAllButtonElement.addEventListener("click", async () => {
  const backup = await exportAllCallGuideData();
  if (backup.guides.length === 0) {
    setStatus(exportAllStatusElement, "書き出せるコールガイドがまだありません。", "is-error");
    return;
  }

  const dateLabel = backup.exportedAt.slice(0, 10);
  const fileName = `equal-love-call-guide-${dateLabel}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);

  setStatus(
    exportAllStatusElement,
    `${backup.guides.length}項目のコールガイドを書き出しました（ファイル名：${fileName}）`,
    "is-success"
  );
});

// 初期表示：一覧の先頭ガイドを読み込んでおく。
loadGuideIntoForm(guideIdSelectElement.value);
refreshSavedList();
