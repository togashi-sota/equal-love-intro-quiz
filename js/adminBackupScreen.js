// 管理者専用「バックアップ管理」画面を担当するファイル（2026-08-29新設）。
// js/fanProfilesScreen.jsと同じ役割分担：Firebaseとのやり取りはjs/backupAdmin.jsに任せ、
// このファイルは画面の組み立て・イベント配線だけを行う。
//
// 【安全性について】この画面自体（ボタンが見えること）は、js/fanProfilesScreen.jsが
// ADMIN_UIDと一致する場合だけ入口を表示することで守られているが、それはあくまで
// 誤操作防止のための見た目上の配慮に過ぎない。実際にここのデータが読み書きできるかどうかは
// firebase/database.rules.jsonのbackups・recoveryRequestsルールで判定されており、
// 管理者以外がこの画面を無理に開いても、js/backupAdmin.jsの各関数がすべて
// { ok: false } を返すだけでデータは一切見えない。

import {
  adminFetchAllBackups,
  adminFetchAllRecoveryRequests,
  adminResolveRecoveryRequest,
  adminDeleteRecoveryRequest,
} from "./backupAdmin.js";
import { getMemberById } from "./memberUtils.js";

let elements = null;
let members = null;
let latestBackups = [];

function formatTimestamp(ms) {
  if (typeof ms !== "number") return "不明";
  return new Date(ms).toLocaleString("ja-JP");
}

function shortId(id) {
  if (typeof id !== "string") return "不明";
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

function buildBackupRow(backup) {
  const row = document.createElement("div");
  row.className = "admin-backup-row";

  const oshiMember = backup.oshiMemberId ? getMemberById(members, backup.oshiMemberId) : null;

  row.innerHTML = `
    <p class="admin-backup-row-title">${backup.displayName ?? "（名前未設定）"}</p>
    <p class="admin-backup-row-detail">推し：${oshiMember ? oshiMember.name : "未設定"}／称号数：${backup.achievementCount}</p>
    <p class="admin-backup-row-detail">バックアップID：<code>${backup.backupId}</code></p>
    <p class="admin-backup-row-detail">現在のUID：<code>${shortId(backup.currentUid)}</code></p>
    <p class="admin-backup-row-detail">最終バックアップ：${formatTimestamp(backup.updatedAt)}</p>
  `;
  return row;
}

// 復旧依頼1件を削除する「削除する」ボタン＋確認テキストを組み立てる。
// 【重要】ここで削除するのはrecoveryRequests側だけで、backups側（本人の実際の記録）には
// 一切触れない（js/backupAdmin.jsのadminDeleteRecoveryRequest参照）。
// 誤操作防止のため、押すたびに毎回確認ダイアログ（window.confirm）を挟む
// （本人指示：復旧依頼の削除とバックアップ本体の削除は完全に別物として扱うが、
// 復旧依頼の削除自体も取り消せない操作のため、簡易的な確認は必ず入れる）。
function buildDeleteRequestButton(request) {
  const deleteResultText = document.createElement("p");
  deleteResultText.className = "admin-backup-row-detail admin-backup-resolve-result";
  deleteResultText.hidden = true;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button admin-backup-delete-request-button";
  deleteButton.textContent = "この依頼を削除する";
  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      `復旧依頼「${request.code}」を削除します。この操作は取り消せません（本人の記録＝バックアップ本体は削除されません）。よろしいですか？`
    );
    if (!confirmed) return;

    deleteButton.disabled = true;
    deleteResultText.hidden = false;
    deleteResultText.textContent = "削除しています…";
    const result = await adminDeleteRecoveryRequest(request.code);
    if (result.ok) {
      await renderAdminBackupScreen();
    } else {
      deleteButton.disabled = false;
      deleteResultText.textContent = result.reason ?? "削除に失敗しました";
    }
  });

  return { deleteButton, deleteResultText };
}

function buildRecoveryRequestRow(request) {
  const row = document.createElement("div");
  row.className = "admin-backup-row";

  const header = document.createElement("p");
  header.className = "admin-backup-row-title";
  header.textContent = `依頼番号：${request.code}（${request.status === "resolved" ? "対応済み" : "対応待ち"}）`;
  row.appendChild(header);

  const detail = document.createElement("p");
  detail.className = "admin-backup-row-detail";
  detail.textContent = `新しいUID：${shortId(request.newUid)}／依頼日時：${formatTimestamp(request.requestedAt)}`;
  row.appendChild(detail);

  if (request.status === "resolved") {
    const resolvedDetail = document.createElement("p");
    resolvedDetail.className = "admin-backup-row-detail";
    resolvedDetail.textContent = `対応済み：バックアップID ${shortId(request.resolvedBackupId)} へ引き継ぎ済み（${formatTimestamp(request.resolvedAt)}）`;
    row.appendChild(resolvedDetail);

    const { deleteButton, deleteResultText } = buildDeleteRequestButton(request);
    row.appendChild(deleteButton);
    row.appendChild(deleteResultText);
    return row;
  }

  const select = document.createElement("select");
  select.className = "admin-backup-select";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = "紐付けるバックアップを選ぶ…";
  select.appendChild(placeholderOption);
  latestBackups.forEach((backup) => {
    const option = document.createElement("option");
    option.value = backup.backupId;
    const oshiMember = backup.oshiMemberId ? getMemberById(members, backup.oshiMemberId) : null;
    option.textContent = `${backup.displayName ?? "（名前未設定）"}（推し：${oshiMember ? oshiMember.name : "未設定"}／称号${backup.achievementCount}個／${shortId(backup.backupId)}）`;
    select.appendChild(option);
  });
  row.appendChild(select);

  const resultText = document.createElement("p");
  resultText.className = "admin-backup-row-detail admin-backup-resolve-result";
  resultText.hidden = true;

  const resolveButton = document.createElement("button");
  resolveButton.type = "button";
  resolveButton.className = "secondary-button";
  resolveButton.textContent = "このバックアップへ復旧を承認する";
  resolveButton.addEventListener("click", async () => {
    const chosenBackupId = select.value;
    if (!chosenBackupId) {
      resultText.hidden = false;
      resultText.textContent = "先にバックアップを選んでください";
      return;
    }
    resolveButton.disabled = true;
    resultText.hidden = false;
    resultText.textContent = "処理しています…";
    const result = await adminResolveRecoveryRequest(request.code, chosenBackupId);
    resolveButton.disabled = false;
    if (result.ok) {
      resultText.textContent = "承認しました。ユーザー側で「確認する」を押すとデータが復元されます。";
      await renderAdminBackupScreen();
    } else {
      resultText.textContent = result.reason ?? "処理に失敗しました";
    }
  });
  row.appendChild(resolveButton);
  row.appendChild(resultText);

  const { deleteButton, deleteResultText } = buildDeleteRequestButton(request);
  row.appendChild(deleteButton);
  row.appendChild(deleteResultText);

  return row;
}

// 画面を開くたびに呼ぶ想定（js/main.js側からshowScreen("adminBackup")と合わせて呼ぶ）。
export async function renderAdminBackupScreen() {
  elements.statusText.textContent = "読み込み中…";
  elements.recoveryRequestsList.innerHTML = "";
  elements.backupsList.innerHTML = "";

  const [backupsResult, requestsResult] = await Promise.all([adminFetchAllBackups(), adminFetchAllRecoveryRequests()]);

  if (!backupsResult.ok || !requestsResult.ok) {
    elements.statusText.textContent =
      backupsResult.reason ?? requestsResult.reason ?? "取得に失敗しました。管理者としてログインできているかご確認ください。";
    return;
  }

  latestBackups = [...backupsResult.backups].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const pendingRequests = requestsResult.requests
    .filter((r) => r.status !== "resolved")
    .sort((a, b) => (b.requestedAt ?? 0) - (a.requestedAt ?? 0));
  const resolvedRequests = requestsResult.requests
    .filter((r) => r.status === "resolved")
    .sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));

  elements.statusText.textContent = `バックアップ${latestBackups.length}件／対応待ちの復旧依頼${pendingRequests.length}件`;

  if (pendingRequests.length === 0 && resolvedRequests.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty-state";
    empty.textContent = "復旧依頼はありません";
    elements.recoveryRequestsList.appendChild(empty);
  } else {
    [...pendingRequests, ...resolvedRequests].forEach((request) =>
      elements.recoveryRequestsList.appendChild(buildRecoveryRequestRow(request))
    );
  }

  if (latestBackups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty-state";
    empty.textContent = "バックアップはまだありません";
    elements.backupsList.appendChild(empty);
  } else {
    latestBackups.forEach((backup) => elements.backupsList.appendChild(buildBackupRow(backup)));
  }
}

// elements: { statusText, refreshButton, recoveryRequestsList, backupsList }
export function initAdminBackupScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;
  elements.refreshButton.addEventListener("click", renderAdminBackupScreen);
}
