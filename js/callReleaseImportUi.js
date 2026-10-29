// データ管理の「完成版コールデータを読み込む」の画面部分（2026-10-30新設・リニューアル第3段階）。
// 判断（同じ／新しい／古い版・取り下げ・元に戻す）は js/callReleasePack.js、保存は js/callStorage.js（releasedCalls ストア）。
// 歌詞・音源・元のコール（callData）・追加データパックの読み込みには触れない（入口も処理も別）。
import { SONGS } from "./data/songs.js";
import { isZipFile, extractZipToFiles } from "./zipPackImport.js";
import { getAllLyricsData } from "./lyricsStorage.js";
import { getAllReleasedCallRecords, saveReleasedCallRecord } from "./callStorage.js";
import { computeLyricsLineFingerprint } from "./callReleaseImport.js";
import { classifyCallReleaseJson, planCallReleaseImport, applyPlanItem, undoReleasedSong, summarizeReleaseVersion, describeImportResult, RELEASE_ACTION } from "./callReleasePack.js";

let elements = null;
let pendingRollback = null; // 古い版に戻すかを本人に確かめている間の材料 { artifact, display }
const changeListeners = new Set();

const titleOf = (songId) => SONGS.find((song) => song.id === songId)?.title ?? songId;

// 完成版コールデータが変わったときに知らせる（ライブコールの画面が曲一覧を作り直すため）
export function onReleasedCallsChanged(listener) {
  changeListeners.add(listener);
}
// 【2026-10-30追加】「最新版データを読み込む」（js/unifiedPackImportUi.js）で完成版コールが変わったときにも知らせる
export function notifyReleasedCallsChanged() {
  notifyChanged();
}
function notifyChanged() {
  changeListeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn("完成版コールデータの変更の知らせで失敗しました", error);
    }
  });
}

// 日時を「2026/10/29 12:35」の形に（端末の時刻で）
export function formatReleaseDate(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso ?? "");
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function describeReleaseVersion(summary) {
  if (!summary.latest) return "完成版コールデータ：まだ読み込んでいません（ライブコールのコール表は、読み込むと表示されます）";
  const rev = [summary.latest.editsRevision !== null ? `コール表 rev ${summary.latest.editsRevision}` : null, summary.latest.timingRevision !== null ? `時刻 rev ${summary.latest.timingRevision}` : null].filter(Boolean).join("・");
  return `完成版コールデータ：${summary.songCount}曲（書き出し ${formatReleaseDate(summary.latest.exportedAt)}${rev ? `・${rev}` : ""}）${summary.mixed ? "。一部の曲は別の版です" : ""}`;
}

// 選んだファイル（JSON 1〜2個、または ZIP 1個）から、コール表と表示用の歌詞を取り出す
async function readPackFiles(fileList) {
  let files = [...fileList];
  if (files.length === 1 && isZipFile(files[0])) files = await extractZipToFiles(files[0]);
  let artifact = null;
  let display = null;
  const ignored = [];
  for (const file of files) {
    if (!/\.json$/i.test(file.name)) {
      ignored.push(file.name);
      continue;
    }
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      ignored.push(file.name);
      continue;
    }
    const kind = classifyCallReleaseJson(data);
    if (kind === "artifact" && !artifact) artifact = data;
    else if (kind === "display" && !display) display = data;
    else ignored.push(file.name);
  }
  return { artifact, display, ignored };
}

async function loadDeviceState() {
  const [records, lyrics] = await Promise.all([getAllReleasedCallRecords(), getAllLyricsData().catch(() => [])]);
  const fingerprints = new Map((lyrics ?? []).filter((record) => Array.isArray(record?.lines)).map((record) => [record.songId, computeLyricsLineFingerprint(record.lines)]));
  return { records, fingerprints };
}

// 計画を当てはめて、曲ごとに保存する（1曲の失敗でほかの曲を止めない）
async function applyPlan(plan, records) {
  const now = new Date().toISOString();
  const failures = [];
  for (const item of plan.items) {
    const next = applyPlanItem(item, records.get(item.songId) ?? null, now);
    if (!next) continue;
    try {
      await saveReleasedCallRecord(next);
    } catch (error) {
      console.warn(`完成版コールデータの保存に失敗しました（ほかの曲は続けます）：${item.songId}`, error);
      failures.push(item.songId);
    }
  }
  return failures;
}

function showResult(lines, { error = false } = {}) {
  const box = elements.result;
  box.textContent = "";
  lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line;
    box.appendChild(p);
  });
  box.classList.toggle("is-error", error);
  box.hidden = lines.length === 0;
}

export async function handleCallReleaseFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  elements.rollbackPanel.hidden = true;
  pendingRollback = null;
  showResult(["読み込んでいます…"]);
  try {
    const { artifact, display, ignored } = await readPackFiles(fileList);
    if (!artifact) {
      showResult(["完成版コールデータ（equal-love-call-release）のファイルが見つかりませんでした。ZIP、またはコール表の JSON を選んでください。"], { error: true });
      return;
    }
    const { records, fingerprints } = await loadDeviceState();
    const plan = planCallReleaseImport({ artifact, display, existing: records, knownSongIds: new Set(SONGS.map((song) => song.id)), deviceLyricsFingerprints: fingerprints });
    if (!plan.ok) {
      showResult(plan.errors, { error: true });
      return;
    }
    const failures = await applyPlan(plan, records);
    const lines = describeImportResult(plan, titleOf);
    if (!display) lines.push("表示用の歌詞のファイルは入っていませんでした（本人が直した歌詞の行は、同じ版で前に読み込んだものがあればそれを使います）。");
    plan.errors.forEach((message) => lines.push(message));
    if (ignored.length) lines.push(`使わなかったファイル：${ignored.join("、")}`);
    if (failures.length) lines.push(`保存できなかった曲（ほかの曲は保存済み）：${failures.map(titleOf).join("、")}`);
    showResult(lines, { error: failures.length > 0 });
    if (plan.counts[RELEASE_ACTION.OLDER] > 0) {
      pendingRollback = { artifact, display };
      elements.rollbackMessage.textContent = `この端末の方が新しい版の曲が ${plan.counts[RELEASE_ACTION.OLDER]}曲あります（${plan.items
        .filter((item) => item.action === RELEASE_ACTION.OLDER)
        .map((item) => titleOf(item.songId))
        .join("、")}）。古い版に戻しますか？ ふつうは戻す必要はありません。`;
      elements.rollbackPanel.hidden = false;
    }
  } catch (error) {
    console.warn("完成版コールデータの読み込みに失敗しました", error);
    showResult(["読み込みに失敗しました。ファイルが壊れていないか確かめてください（この端末のデータは変わっていません）。"], { error: true });
  }
  await refreshCallReleaseStatus();
  notifyChanged();
}

// 本人が「古い版に戻す」を選んだとき：古い版の曲だけを戻す（ほかの曲はもう読み込み済み）
async function confirmRollback() {
  if (!pendingRollback) return;
  const { artifact, display } = pendingRollback;
  pendingRollback = null;
  elements.rollbackPanel.hidden = true;
  const { records, fingerprints } = await loadDeviceState();
  const plan = planCallReleaseImport({ artifact, display, existing: records, knownSongIds: new Set(SONGS.map((song) => song.id)), deviceLyricsFingerprints: fingerprints, allowRollback: true });
  const onlyRollback = { ...plan, items: plan.items.filter((item) => item.action === RELEASE_ACTION.ROLLBACK) };
  const failures = await applyPlan(onlyRollback, records);
  const names = onlyRollback.items.map((item) => titleOf(item.songId));
  showResult([`古い版に戻しました：${names.join("、") || "なし"}（「曲ごとに元に戻す」で、もう一度新しい版に戻せます）`, ...(failures.length ? [`保存できなかった曲：${failures.map(titleOf).join("、")}`] : [])], { error: failures.length > 0 });
  await refreshCallReleaseStatus();
  notifyChanged();
}

function cancelRollback() {
  pendingRollback = null;
  elements.rollbackPanel.hidden = true;
}

async function undoSong(songId) {
  const records = await getAllReleasedCallRecords();
  const next = undoReleasedSong(records.get(songId), new Date().toISOString());
  if (!next) return;
  try {
    await saveReleasedCallRecord(next);
    showResult([`「${titleOf(songId)}」を1つ前の版に戻しました（もう一度押すと、今の版に戻ります）。`]);
  } catch (error) {
    console.warn("元に戻せませんでした", error);
    showResult([`「${titleOf(songId)}」を元に戻せませんでした。`], { error: true });
  }
  await refreshCallReleaseStatus();
  notifyChanged();
}

// データ管理に「今の版」と「曲ごとに元に戻す」を表示し直す
export async function refreshCallReleaseStatus() {
  if (!elements) return;
  let records;
  try {
    records = await getAllReleasedCallRecords();
  } catch (error) {
    console.warn("完成版コールデータを読めませんでした", error);
    elements.version.textContent = "完成版コールデータ：この端末では読み込めませんでした";
    return;
  }
  elements.version.textContent = describeReleaseVersion(summarizeReleaseVersion(records));
  const undoable = [...records.values()].filter((record) => record.previous).sort((a, b) => titleOf(a.songId).localeCompare(titleOf(b.songId), "ja"));
  elements.undoSection.hidden = undoable.length === 0;
  elements.undoList.textContent = "";
  undoable.forEach((record) => {
    const row = document.createElement("div");
    row.className = "call-release-undo-row";
    const label = document.createElement("span");
    const now = record.current ? `今：${formatReleaseDate(record.current.exportedAt)}` : "今：コール表なし";
    const before = record.previous ? `前：${formatReleaseDate(record.previous.exportedAt)}` : "";
    label.textContent = `${titleOf(record.songId)}（${now}／${before}）`;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button call-release-undo-button";
    button.textContent = "元に戻す";
    button.addEventListener("click", () => undoSong(record.songId));
    row.append(label, button);
    elements.undoList.appendChild(row);
  });
}

// elements：{ input, version, result, rollbackPanel, rollbackMessage, rollbackConfirm, rollbackCancel, undoSection, undoList }
export function initCallReleaseImportUi(newElements) {
  elements = newElements;
  if (!elements?.input) return;
  elements.input.addEventListener("change", async () => {
    const files = elements.input.files;
    await handleCallReleaseFiles(files);
    elements.input.value = ""; // 同じファイルをもう一度選べるように
  });
  elements.rollbackConfirm.addEventListener("click", confirmRollback);
  elements.rollbackCancel.addEventListener("click", cancelRollback);
  refreshCallReleaseStatus();
}
