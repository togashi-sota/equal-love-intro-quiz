// 管理者用「UID移行・重複修復」画面（2026-09-22新設・本人指示 第8回）。バックアップ管理画面の1セクション。
//
// 流れ（1クリックでいきなり削除は絶対にしない）：
//   「候補を調べる（dry-run）」→ Firebase を読み取りだけして候補と証拠・計画を表示
//   → 候補ごとに「旧ID末尾／新ID末尾／backupId末尾／消す記録・残る記録／payload は変更しない」を明示
//   → 実行可能な候補だけ、確認語（実行）を入力するとボタンが押せる → 実行 → 各ステップの結果と読み戻しをログ表示
// 特定の人向けの固定処理ではなく、同じ状況（匿名UIDの差し替え）が将来起きたときにも使える汎用ツール。
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { getMemberById } from "./memberUtils.js";
import { adminFetchUidRepairSnapshot, adminExecuteUidRepair } from "./adminUidRepair.js";
import { buildUidRepairCandidates, buildUidRepairInvestigationReport, hashPayload, shortUid } from "./uidRepairPlanner.js";
import { describeLeaderboardDivision } from "./uidSupersession.js";

const CONFIRM_WORD = "実行";

let elements = null;
let members = [];
let isScanning = false;
let runningCandidateKey = null;

function formatTimestamp(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return "不明";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatSeconds(ms) {
  return typeof ms === "number" ? `${(ms / 1000).toFixed(2)}秒` : "—";
}

function setStatus(text) {
  if (!elements?.statusText) return;
  elements.statusText.textContent = text ?? "";
  elements.statusText.hidden = !text;
}

function appendLine(container, text, className = "admin-backup-row-detail") {
  const p = document.createElement("p");
  p.className = className;
  p.textContent = text;
  container.appendChild(p);
  return p;
}

function buildCandidateCard(candidate) {
  const card = document.createElement("div");
  card.className = "admin-uid-repair-card";
  card.classList.toggle("is-blocked", !candidate.executable);
  const key = `${candidate.backupId}:${candidate.oldUid}:${candidate.newUid}`;

  const title = document.createElement("p");
  title.className = "admin-backup-row-name";
  const oshi = candidate.newProfile?.oshiMemberId ? getMemberById(members, candidate.newProfile.oshiMemberId) : null;
  title.textContent = `${candidate.backup.displayName ?? "（名前なし）"}${oshi ? `（新IDの推し：${oshi.name}）` : ""} ${candidate.executable ? "✅ 実行可能" : "⛔ 実行不可（要個別対応）"}`;
  card.appendChild(title);

  appendLine(card, `旧ID ${shortUid(candidate.oldUid)} → 新ID ${shortUid(candidate.newUid)} ／ backupId ${shortUid(candidate.backupId)}`);
  appendLine(
    card,
    `バックアップ：${candidate.backup.originLabel}／最終更新 ${formatTimestamp(candidate.backup.updatedAt)}／称号 ${candidate.backup.achievementCount ?? "?"}個／payload キー ${candidate.backup.payloadKeyCount} 件／schemaVersion ${candidate.backup.schemaVersion ?? "?"}／ownerSecret ${candidate.backup.hasOwnerSecret ? "あり" : "なし"}／previousUids ${candidate.backup.previousUids.length ? candidate.backup.previousUids.map(shortUid).join("、") : "なし"}`
  );
  appendLine(card, `旧IDの最終活動 ${formatTimestamp(candidate.oldLastActivityAt)} → 新IDの最初の活動 ${formatTimestamp(candidate.newFirstActivityAt)}`);
  const hashLine = appendLine(card, "payload ハッシュ：計算中…");
  hashPayload(candidate.payloadForHash ?? null).then((hash) => {
    hashLine.textContent = `payload ハッシュ：${hash.slice(0, 16)}…（実行後に同じ値であることを確認します。payload は変更しません）`;
  });

  const evidenceTitle = appendLine(card, "同一人物の根拠：", "admin-backup-row-detail admin-uid-repair-subtitle");
  evidenceTitle.hidden = false;
  candidate.evidence.forEach((line) => appendLine(card, `✔ ${line}`, "admin-backup-row-detail admin-uid-repair-evidence"));
  candidate.blockers.forEach((line) => appendLine(card, `✖ ${line}`, "admin-backup-row-detail admin-uid-repair-risk"));

  appendLine(card, "計画：", "admin-backup-row-detail admin-uid-repair-subtitle");
  if (candidate.rebindPlan.action === "rebind") {
    appendLine(card, `① backups/${shortUid(candidate.backupId)} の currentUid を ${shortUid(candidate.oldUid)} → ${shortUid(candidate.newUid)} へ（previousUids に旧IDを記録、ownerSecret は本人端末が次回同期で登録し直せるよう削除。payload・updatedAt は変更しない）`);
  } else {
    appendLine(card, `① backups の付け替え：しない（${candidate.rebindPlan.reason}）`);
  }
  if (candidate.leaderboardPlan.length === 0) {
    appendLine(card, "② 旧IDのランキング記録：なし");
  } else {
    candidate.leaderboardPlan.forEach((plan) => {
      const label = describeLeaderboardDivision(...plan.division.split("/"));
      const text =
        plan.action === "deleteOld"
          ? `② ${label}：旧 ${formatSeconds(plan.oldEntry?.clearTimeMs)} を削除 → 新 ${formatSeconds(plan.newEntry?.clearTimeMs)} が残る（${plan.reason}）`
          : `② ${label}：保留 — 旧 ${formatSeconds(plan.oldEntry?.clearTimeMs)}／新 ${formatSeconds(plan.newEntry?.clearTimeMs)}（${plan.reason}）`;
      appendLine(card, text, plan.action === "deleteOld" ? "admin-backup-row-detail" : "admin-backup-row-detail admin-uid-repair-risk");
    });
  }
  appendLine(card, `③ 旧IDの公開プロフィール：${candidate.profilePlan.action === "deleteOld" ? "削除（新ID側が存在）" : candidate.profilePlan.reason}`);
  appendLine(card, `④ 旧IDのオンライン状態：${candidate.presencePlan.reason}`);

  const logBox = document.createElement("div");
  logBox.className = "admin-uid-repair-log";
  logBox.hidden = true;

  if (candidate.executable) {
    const confirmRow = document.createElement("div");
    confirmRow.className = "admin-uid-repair-confirm-row";
    const input = document.createElement("input");
    input.type = "text";
    input.className = "battle-player-name-input";
    input.placeholder = `「${CONFIRM_WORD}」と入力すると実行できます`;
    input.autocomplete = "off";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger-button admin-backup-delete-request-button";
    button.textContent = "この候補を修復する（付け替え → 旧記録削除 → 読み戻し）";
    button.disabled = true;
    input.addEventListener("input", () => {
      button.disabled = input.value.trim() !== CONFIRM_WORD || runningCandidateKey !== null;
    });
    button.addEventListener("click", async () => {
      if (runningCandidateKey !== null || input.value.trim() !== CONFIRM_WORD) return;
      playSfx(SFX_EVENTS.UI_CONFIRM);
      runningCandidateKey = key;
      button.disabled = true;
      input.disabled = true;
      logBox.hidden = false;
      logBox.innerHTML = "";
      const log = (text, level) => appendLine(logBox, text, `admin-backup-row-detail admin-uid-repair-log-${level ?? "info"}`);
      log("実行を開始します（途中で失敗した場合、そこまでの結果はログに残ります）", "info");
      try {
        const result = await adminExecuteUidRepair(candidate, { log });
        if (result.ok) {
          log(`完了：付け替え ${result.steps.rebind}／ランキング削除 ${result.steps.leaderboard.deleted}件（保留 ${result.steps.leaderboard.skipped}件）／公開プロフィール ${result.steps.profile}`, "ok");
          card.classList.add("is-done");
        } else {
          log(`一部失敗：${result.errors.join("／")}。「候補を調べる」で状態を確認し直してください`, "error");
        }
      } catch (error) {
        log(`予期しないエラー：${error?.message ?? error}`, "error");
      } finally {
        runningCandidateKey = null;
      }
    });
    confirmRow.appendChild(input);
    confirmRow.appendChild(button);
    card.appendChild(confirmRow);
  } else {
    appendLine(card, "⛔ 上の理由が解消されるまで、この候補は実行できません（名前が同じだけでは統合しません）", "admin-backup-row-detail admin-uid-repair-risk");
  }
  card.appendChild(logBox);
  return card;
}

async function handleScanClick() {
  if (isScanning) return;
  playSfx(SFX_EVENTS.UI_CLICK);
  isScanning = true;
  elements.scanButton.disabled = true;
  elements.list.innerHTML = "";
  setStatus("Firebase を読み取り中（書き込みは行いません）…");
  try {
    const result = await adminFetchUidRepairSnapshot();
    if (!result.ok) {
      setStatus(result.reason);
      return;
    }
    const { snapshot } = result;
    const candidates = buildUidRepairCandidates(snapshot).map((candidate) => ({
      ...candidate,
      payloadForHash: snapshot.backups?.[candidate.backupId]?.payload ?? null,
    }));
    const backupCount = Object.keys(snapshot.backups ?? {}).length;
    const profileCount = Object.keys(snapshot.publicProfiles ?? {}).length;
    if (candidates.length === 0) {
      setStatus(`修復候補はありません（バックアップ ${backupCount} 件・公開プロフィール ${profileCount} 件を確認。dry-run のみ、何も変更していません）`);
      appendReportBox(snapshot, candidates);
      return;
    }
    const executableCount = candidates.filter((c) => c.executable).length;
    setStatus(`候補 ${candidates.length} 件（実行可能 ${executableCount} 件・要個別対応 ${candidates.length - executableCount} 件）。dry-run のみ、まだ何も変更していません。`);
    candidates.forEach((candidate) => elements.list.appendChild(buildCandidateCard(candidate)));
    appendReportBox(snapshot, candidates);
  } finally {
    isScanning = false;
    elements.scanButton.disabled = false;
  }
}

// 【第9回】調査レポート（IDは末尾6文字のみ）を折りたたみで表示し、全選択してコピーできるようにする
// （候補にならなかった弱い一致・逆引き表・全 backups の出自など、実行判断の材料を1つの文章にまとめる）。
function appendReportBox(snapshot, candidates) {
  const details = document.createElement("details");
  details.className = "admin-uid-repair-report";
  const summary = document.createElement("summary");
  summary.textContent = "調査レポートを表示（コピー用・IDは末尾6文字のみ）";
  details.appendChild(summary);
  const textarea = document.createElement("textarea");
  textarea.className = "admin-uid-repair-report-text";
  textarea.readOnly = true;
  textarea.rows = 18;
  textarea.value = buildUidRepairInvestigationReport(snapshot, candidates);
  textarea.addEventListener("focus", () => textarea.select());
  details.appendChild(textarea);
  elements.list.appendChild(details);
}

// elements: { section, scanButton, statusText, list }
export function initAdminUidRepairScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;
  elements.scanButton?.addEventListener("click", handleScanClick);
}

// バックアップ管理画面を開き直したときに、前回の候補表示を消す（古い計画で実行しないため）。
export function resetAdminUidRepairScreen() {
  if (!elements) return;
  elements.list.innerHTML = "";
  setStatus("");
}
