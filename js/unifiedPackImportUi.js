// データ管理の「最新版データを読み込む」の画面部分（2026-10-30新設）。
// 判断と書き込みは js/unifiedPackImport.js。ここは「選ぶ → 中身を確かめて見せる → 本人が押したら入れる → 結果」と、
// 曲ごとの「元に戻す」の一覧だけ。今の「追加データパック」「完成版コールデータを読み込む」はそのまま残す。
import { isZipFile, extractZipToFiles } from "./zipPackImport.js";
import {
  readUnifiedPackFiles,
  loadUnifiedDeviceState,
  planUnifiedImport,
  describeUnifiedPlan,
  applyUnifiedPlan,
  describeUnifiedResult,
  createDeviceIo,
  listUndoableSongs,
  undoUnifiedSong,
} from "./unifiedPackImport.js";

let elements = null;
let pending = null; // 確認待ちのパック（読み取った中身）
let busy = false;
let afterChange = async () => {};

function showLines(box, lines, { error = false } = {}) {
  box.textContent = "";
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    box.appendChild(p);
  });
  box.classList.toggle("is-error", error);
  box.hidden = lines.length === 0;
}

function hasChanges(plan) {
  const c = plan.counts;
  return plan.ok && c.newSongs + c.lyricsUpdates + c.callUpdates + c.audioUpdates > 0;
}

async function analyse(parsed) {
  const device = await loadUnifiedDeviceState({ needAudioHashes: parsed.audio.length > 0 });
  return planUnifiedImport(parsed, device);
}

async function handleFiles(fileList) {
  if (!fileList || fileList.length === 0 || busy) return;
  busy = true;
  pending = null;
  elements.actions.hidden = true;
  elements.result.hidden = true;
  showLines(elements.summary, ["中身を確かめています…（まだ何も変えていません）"]);
  try {
    let files = [...fileList];
    if (files.length === 1 && isZipFile(files[0])) files = await extractZipToFiles(files[0]);
    const parsed = await readUnifiedPackFiles(files);
    const plan = await analyse(parsed);
    showLines(elements.summary, describeUnifiedPlan(plan), { error: !plan.ok });
    if (hasChanges(plan)) {
      pending = parsed;
      elements.actions.hidden = false;
    }
  } catch (error) {
    console.warn("最新版データの確認に失敗しました", error);
    showLines(elements.summary, [`ファイルを読めませんでした（${error?.message ?? "不明なエラー"}）。この端末のデータは変わっていません。`], { error: true });
  } finally {
    busy = false;
  }
}

async function applyPending() {
  if (!pending || busy) return;
  busy = true;
  const parsed = pending;
  pending = null;
  elements.actions.hidden = true;
  showLines(elements.result, ["読み込んでいます…（途中で閉じても、もう一度読み込めば続きから入ります）"]);
  try {
    // 確認のあとに端末が変わっていても正しく入れるよう、入れる直前にもう一度判断する
    const plan = await analyse(parsed);
    if (!plan.ok) {
      showLines(elements.result, plan.errors, { error: true });
      return;
    }
    const result = await applyUnifiedPlan(plan, createDeviceIo());
    showLines(elements.result, describeUnifiedResult(result), { error: result.errors.length > 0 });
  } catch (error) {
    console.warn("最新版データの読み込みに失敗しました", error);
    showLines(elements.result, ["読み込みの途中で止まりました。もう一度同じファイルを読み込むと、済んだ曲は飛ばして続きから入ります。"], { error: true });
  } finally {
    busy = false;
  }
  await afterChange();
  refreshUndoList();
}

function cancelPending() {
  pending = null;
  elements.actions.hidden = true;
  showLines(elements.summary, ["やめました。この端末のデータは変わっていません。"]);
}

async function undoSong(songId) {
  if (busy) return;
  busy = true;
  let outcome;
  try {
    outcome = await undoUnifiedSong(songId, createDeviceIo());
  } finally {
    busy = false;
  }
  showLines(elements.result, [outcome.message], { error: !outcome.ok });
  await afterChange();
  refreshUndoList();
}

// 曲ごとの「元に戻す」の一覧を作り直す
export function refreshUndoList() {
  if (!elements) return;
  const songs = listUndoableSongs(createDeviceIo().readUndo());
  elements.undoSection.hidden = songs.length === 0;
  elements.undoList.textContent = "";
  songs.forEach((song) => {
    const row = document.createElement("div");
    row.className = "call-release-undo-row";
    const label = document.createElement("span");
    const parts = [song.lyrics ? "歌詞" : null, song.calls ? "コール" : null].filter(Boolean).join("・");
    label.textContent = `${song.title}（${parts}）`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button call-release-undo-button";
    button.textContent = "元に戻す";
    button.addEventListener("click", () => undoSong(song.songId));
    row.append(label, button);
    elements.undoList.appendChild(row);
  });
}

// elements：{ input, summary, actions, applyButton, cancelButton, result, undoSection, undoList }
// onChanged：読み込み・元に戻すのあとに呼ぶ（ライブコールの一覧・完成版コールの版の表示・歌詞クイズのロビーを作り直す）
export function initUnifiedPackImportUi(newElements, { onChanged } = {}) {
  elements = newElements;
  if (!elements?.input) return;
  if (typeof onChanged === "function") {
    afterChange = async () => {
      try {
        await onChanged();
      } catch (error) {
        console.warn("読み込み後の表示の更新に失敗しました", error);
      }
    };
  }
  elements.input.addEventListener("change", async () => {
    await handleFiles(elements.input.files);
    elements.input.value = ""; // 同じファイルをもう一度選べるように
  });
  elements.applyButton.addEventListener("click", applyPending);
  elements.cancelButton.addEventListener("click", cancelPending);
  refreshUndoList();
}
