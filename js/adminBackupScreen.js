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
  adminFetchPublicProfileUids,
  adminResolveRecoveryRequest,
  adminDeleteRecoveryRequest,
  adminSearchPublicProfilesByName,
  adminRestoreAchievementsFromPublicProfile,
  adminFindPlayersWithoutBackup,
  adminCreatePreventiveBackup,
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

  row.appendChild(buildPublicProfileFallbackSection(request));

  const { deleteButton, deleteResultText } = buildDeleteRequestButton(request);
  row.appendChild(deleteButton);
  row.appendChild(deleteResultText);

  return row;
}

// 【緊急対応用に2026-09-04新設、本人指示】backupsに該当が無い場合の最後の手段。
// フレンド一覧用の公開プロフィール（publicProfiles）に残っている称号・推しメンの記録だけを
// 使って、新しいバックアップを作って紐付ける。プレイ履歴・自己ベスト等、publicProfilesに
// 元々含まれない情報までは復元できないため、その旨を必ず案内文で明示する。
function buildPublicProfileFallbackSection(request) {
  const wrapper = document.createElement("div");
  wrapper.className = "admin-backup-fallback-section";

  const caption = document.createElement("p");
  caption.className = "admin-backup-row-detail";
  caption.textContent =
    "↑で見つからない場合：フレンド一覧用の公開プロフィールに称号・推しメンの記録だけ残っていることがあります（プレイ履歴・自己ベスト等は復元できません）。";
  wrapper.appendChild(caption);

  const searchRow = document.createElement("div");
  searchRow.className = "admin-backup-fallback-search-row";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "battle-player-name-input";
  searchInput.placeholder = "表示名で検索（例：いくみ）";
  const searchButton = document.createElement("button");
  searchButton.type = "button";
  searchButton.className = "secondary-button";
  searchButton.textContent = "検索";
  searchRow.appendChild(searchInput);
  searchRow.appendChild(searchButton);
  wrapper.appendChild(searchRow);

  const resultsContainer = document.createElement("div");
  wrapper.appendChild(resultsContainer);

  searchButton.addEventListener("click", async () => {
    const query = searchInput.value.trim();
    resultsContainer.innerHTML = "";
    if (!query) return;
    searchButton.disabled = true;
    const loading = document.createElement("p");
    loading.className = "admin-backup-row-detail";
    loading.textContent = "検索中…";
    resultsContainer.appendChild(loading);

    const searchResult = await adminSearchPublicProfilesByName(query);
    resultsContainer.innerHTML = "";
    searchButton.disabled = false;

    if (!searchResult.ok) {
      const errorText = document.createElement("p");
      errorText.className = "admin-backup-row-detail";
      errorText.textContent = searchResult.reason ?? "検索に失敗しました";
      resultsContainer.appendChild(errorText);
      return;
    }
    if (searchResult.matches.length === 0) {
      const emptyText = document.createElement("p");
      emptyText.className = "admin-backup-row-detail";
      emptyText.textContent = "一致する公開プロフィールは見つかりませんでした";
      resultsContainer.appendChild(emptyText);
      return;
    }

    searchResult.matches.forEach((match) => {
      const oshiMember = match.oshiMemberId ? getMemberById(members, match.oshiMemberId) : null;
      const matchRow = document.createElement("div");
      matchRow.className = "admin-backup-fallback-match-row";

      const matchDetail = document.createElement("p");
      matchDetail.className = "admin-backup-row-detail";
      matchDetail.textContent = `${match.displayName}（推し：${oshiMember ? oshiMember.name : "未設定"}／称号${match.unlockedAchievementIds.length}個）`;
      matchRow.appendChild(matchDetail);

      const restoreButton = document.createElement("button");
      restoreButton.type = "button";
      restoreButton.className = "secondary-button";
      restoreButton.textContent = "この人の称号・推しメンだけ復元する";
      const restoreResultText = document.createElement("p");
      restoreResultText.className = "admin-backup-row-detail admin-backup-resolve-result";
      restoreResultText.hidden = true;

      restoreButton.addEventListener("click", async () => {
        const confirmed = window.confirm(
          `「${match.displayName}」の称号${match.unlockedAchievementIds.length}個・推しメンだけを、この復旧依頼（番号：${request.code}）へ復元します。プレイ履歴・自己ベスト等は復元されません。よろしいですか？`
        );
        if (!confirmed) return;
        restoreButton.disabled = true;
        restoreResultText.hidden = false;
        restoreResultText.textContent = "処理しています…";
        const result = await adminRestoreAchievementsFromPublicProfile({ code: request.code, publicProfileUid: match.uid });
        restoreButton.disabled = false;
        if (result.ok) {
          restoreResultText.textContent = `承認しました（称号${result.restoredAchievementCount}個）。ユーザー側で「確認する」を押すとデータが復元されます。`;
          await renderAdminBackupScreen();
        } else {
          restoreResultText.textContent = result.reason ?? "処理に失敗しました";
        }
      });

      matchRow.appendChild(restoreButton);
      matchRow.appendChild(restoreResultText);
      resultsContainer.appendChild(matchRow);
    });
  });

  return wrapper;
}

// 画面を開くたびに呼ぶ想定（js/main.js側からshowScreen("adminBackup")と合わせて呼ぶ）。
export async function renderAdminBackupScreen() {
  elements.statusText.textContent = "読み込み中…";
  elements.recoveryRequestsList.innerHTML = "";
  elements.backupsList.innerHTML = "";

  const [backupsResult, requestsResult, publicUidsResult] = await Promise.all([
    adminFetchAllBackups(),
    adminFetchAllRecoveryRequests(),
    adminFetchPublicProfileUids(),
  ]);

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

  // 「バックアップはある（＝実際にアプリを使っている）のに、フレンド一覧には公開していない人」の
  // 人数。取得に失敗した場合（publicUidsResult.ok === false）は0人として扱い、既存の表示を壊さない
  // （本人指示：「非公開の人が何人いるか知りたい」への対応。一度もバックアップされたことが無い
  // 非公開の人までは、Firebase上に痕跡が無いため数えられない＝この数字に含まれない）。
  const publicUidSet = new Set(publicUidsResult.ok ? publicUidsResult.uids : []);
  const nonPublicBackedUpCount = latestBackups.filter((b) => b.currentUid && !publicUidSet.has(b.currentUid)).length;

  elements.statusText.textContent =
    `バックアップ${latestBackups.length}件（うちフレンド一覧非公開：${nonPublicBackedUpCount}人）／対応待ちの復旧依頼${pendingRequests.length}件`;

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

  renderFilteredBackupsList();
}

// 【2026-09-04新設】表示名の検索欄の値でバックアップ一覧を絞り込んで描画し直す。
// 大文字小文字・全角半角を気にせず引っかかるよう、簡易的な正規化をしてから比較する
// （本人の緊急対応：大量のダミーデータの中から特定の1人を探す必要が生じたため）。
function normalizeForBackupSearch(text) {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFKC"); // 全角英数字・半角カナ等を比較しやすい形へ統一する
}

function renderFilteredBackupsList() {
  const query = normalizeForBackupSearch(elements.backupsSearchInput?.value ?? "");
  const filtered = query
    ? latestBackups.filter((backup) => normalizeForBackupSearch(backup.displayName).includes(query))
    : latestBackups;

  elements.backupsList.innerHTML = "";
  if (latestBackups.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty-state";
    empty.textContent = "バックアップはまだありません";
    elements.backupsList.appendChild(empty);
    return;
  }
  if (filtered.length === 0) {
    const empty = document.createElement("p");
    empty.className = "history-empty-state";
    empty.textContent = `「${elements.backupsSearchInput.value}」に一致するバックアップは見つかりませんでした（全${latestBackups.length}件中）`;
    elements.backupsList.appendChild(empty);
    return;
  }
  filtered.forEach((backup) => elements.backupsList.appendChild(buildBackupRow(backup)));
}

// 【2026-09-04新設、本人指示：予防対応】「バックアップが1件も無い＝いくみさんと同じ
// 危険がある」プレイヤーを一覧表示し、その場で予防的にbackupsを1件作れるようにする。
async function handleCheckAtRiskPlayers() {
  elements.atRiskStatusText.hidden = false;
  elements.atRiskStatusText.textContent = "確認中…";
  elements.atRiskList.innerHTML = "";

  const result = await adminFindPlayersWithoutBackup();
  if (!result.ok) {
    elements.atRiskStatusText.textContent = result.reason ?? "確認に失敗しました";
    return;
  }

  if (result.atRiskPlayers.length === 0) {
    elements.atRiskStatusText.textContent = "危険な人は見つかりませんでした（全員、今のUIDに紐づくバックアップがあります）";
    return;
  }

  elements.atRiskStatusText.textContent = `${result.atRiskPlayers.length}人、バックアップが1件も無い状態です（フレンド一覧公開設定がONの人のみ確認できます）。`;
  result.atRiskPlayers.forEach((player) => {
    const oshiMember = player.oshiMemberId ? getMemberById(members, player.oshiMemberId) : null;
    const row = document.createElement("div");
    row.className = "admin-backup-fallback-match-row";

    const detail = document.createElement("p");
    detail.className = "admin-backup-row-detail";
    detail.textContent = `${player.displayName}（推し：${oshiMember ? oshiMember.name : "未設定"}／称号${player.unlockedAchievementIds.length}個）`;
    row.appendChild(detail);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = "今のうちに予防的にバックアップを作る";
    const resultText = document.createElement("p");
    resultText.className = "admin-backup-row-detail admin-backup-resolve-result";
    resultText.hidden = true;

    button.addEventListener("click", async () => {
      button.disabled = true;
      resultText.hidden = false;
      resultText.textContent = "処理しています…";
      const createResult = await adminCreatePreventiveBackup(player);
      button.disabled = false;
      if (createResult.ok) {
        resultText.textContent = "バックアップを作成しました。これで、この人の端末データが消えても称号・推しメンだけは復元できます。";
        row.style.opacity = "0.6";
        button.hidden = true;
      } else {
        resultText.textContent = createResult.reason ?? "処理に失敗しました";
      }
    });

    row.appendChild(button);
    row.appendChild(resultText);
    elements.atRiskList.appendChild(row);
  });
}

// elements: { statusText, refreshButton, recoveryRequestsList, backupsList, backupsSearchInput,
//   checkAtRiskButton, atRiskStatusText, atRiskList }
export function initAdminBackupScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;
  elements.refreshButton.addEventListener("click", renderAdminBackupScreen);
  elements.backupsSearchInput?.addEventListener("input", renderFilteredBackupsList);
  elements.checkAtRiskButton?.addEventListener("click", handleCheckAtRiskPlayers);
}
