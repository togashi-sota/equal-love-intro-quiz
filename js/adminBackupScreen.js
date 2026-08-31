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
  adminDeleteBackup,
} from "./backupAdmin.js";
import { getMemberById } from "./memberUtils.js";

let elements = null;
let members = null;
let latestBackups = [];
// 【2026-09-05新設】バックアップ一覧で「選択して、まとめて削除」するための選択状態。
// backupIdの集合。一覧の再描画（検索・フィルタ切り替え）をまたいでも選択状態を保つため、
// buildBackupRow()の外側（モジュールスコープ）に置く。バックアップ本体の再取得
//（renderAdminBackupScreen()の最新化）時だけリセットする。
let selectedBackupIds = new Set();

function formatTimestamp(ms) {
  if (typeof ms !== "number") return "不明";
  return new Date(ms).toLocaleString("ja-JP");
}

function shortId(id) {
  if (typeof id !== "string") return "不明";
  return id.length > 12 ? `${id.slice(0, 12)}…` : id;
}

// バックアップ1件が「テストデータの可能性が高い」かどうかの目安。表示名を一度も
// 設定していない場合だけ該当とする（あくまで目安であり断定ではない。名前設定前に
// 離脱した実在の人の可能性もゼロではないため、削除は必ず内容を見た本人の判断に委ねる）。
function looksLikeTestBackup(backup) {
  return !backup.displayName;
}

function buildBackupRow(backup) {
  const row = document.createElement("div");
  row.className = "admin-backup-row";

  const oshiMember = backup.oshiMemberId ? getMemberById(members, backup.oshiMemberId) : null;
  const suspiciousNote = looksLikeTestBackup(backup)
    ? '<p class="admin-backup-row-detail admin-backup-suspicious-note">⚠️ 名前未設定（テストデータの可能性）</p>'
    : "";

  // 【2026-09-05新設】まとめて削除するための選択チェックボックス。
  const selectLabel = document.createElement("label");
  selectLabel.className = "custom-quiz-selected-only-toggle admin-backup-row-select-toggle";
  const selectCheckbox = document.createElement("input");
  selectCheckbox.type = "checkbox";
  selectCheckbox.checked = selectedBackupIds.has(backup.backupId);
  selectCheckbox.addEventListener("change", () => {
    if (selectCheckbox.checked) selectedBackupIds.add(backup.backupId);
    else selectedBackupIds.delete(backup.backupId);
    updateSelectionUi();
  });
  selectLabel.appendChild(selectCheckbox);
  selectLabel.appendChild(document.createTextNode("選択する"));
  row.appendChild(selectLabel);

  const content = document.createElement("div");
  content.innerHTML = `
    <p class="admin-backup-row-title">${backup.displayName ?? "（名前未設定）"}</p>
    <p class="admin-backup-row-detail">推し：${oshiMember ? oshiMember.name : "未設定"}／称号数：${backup.achievementCount}</p>
    <p class="admin-backup-row-detail">バックアップID：<code>${backup.backupId}</code></p>
    <p class="admin-backup-row-detail">現在のUID：<code>${shortId(backup.currentUid)}</code></p>
    <p class="admin-backup-row-detail">最終バックアップ：${formatTimestamp(backup.updatedAt)}</p>
    ${suspiciousNote}
  `;
  row.appendChild(content);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger-button admin-backup-delete-request-button";
  deleteButton.textContent = "このバックアップを削除する";
  const deleteResultText = document.createElement("p");
  deleteResultText.className = "admin-backup-row-detail admin-backup-resolve-result";
  deleteResultText.hidden = true;

  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm(
      `以下のバックアップを完全に削除します。この操作は元に戻せません。\n\n` +
        `表示名：${backup.displayName ?? "（名前未設定）"}\n` +
        `称号数：${backup.achievementCount}\n` +
        `バックアップID：${backup.backupId}\n` +
        `最終バックアップ：${formatTimestamp(backup.updatedAt)}\n\n` +
        `本当に削除しますか？`
    );
    if (!confirmed) return;

    deleteButton.disabled = true;
    deleteResultText.hidden = false;
    deleteResultText.textContent = "削除しています…";
    const result = await adminDeleteBackup(backup.backupId);
    if (result.ok) {
      await renderAdminBackupScreen();
    } else {
      deleteButton.disabled = false;
      deleteResultText.textContent = result.reason ?? "削除に失敗しました";
    }
  });

  row.appendChild(deleteButton);
  row.appendChild(deleteResultText);

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

// 検索欄・「名前未設定だけ表示」チェックボックスの現在値で絞り込んだ一覧を返す。
// renderFilteredBackupsList()（描画用）と「表示中を全て選択」ボタンの両方から使う、
// 単一の絞り込みロジック（本人指示：一覧に見えている内容と選択対象を必ず一致させるため）。
function getFilteredBackups() {
  const query = normalizeForBackupSearch(elements.backupsSearchInput?.value ?? "");
  const unnamedOnly = elements.backupsUnnamedOnlyCheckbox?.checked ?? false;

  let filtered = query
    ? latestBackups.filter((backup) => normalizeForBackupSearch(backup.displayName).includes(query))
    : latestBackups;
  if (unnamedOnly) {
    filtered = filtered.filter((backup) => looksLikeTestBackup(backup));
  }
  return filtered;
}

// 選択件数の表示・「選択したN件を削除する」ボタンの表示/非表示を更新する。
function updateSelectionUi() {
  const count = selectedBackupIds.size;
  if (elements.selectionStatusText) {
    elements.selectionStatusText.textContent = count > 0 ? `選択中：${count}件` : "";
  }
  if (elements.bulkDeleteButton) {
    elements.bulkDeleteButton.hidden = count === 0;
    elements.bulkDeleteButton.textContent = `選択した${count}件を削除する`;
  }
}

function renderFilteredBackupsList() {
  const query = normalizeForBackupSearch(elements.backupsSearchInput?.value ?? "");
  const filtered = getFilteredBackups();

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
    empty.textContent = query
      ? `「${elements.backupsSearchInput.value}」に一致するバックアップは見つかりませんでした（全${latestBackups.length}件中）`
      : `条件に一致するバックアップは見つかりませんでした（全${latestBackups.length}件中）`;
    elements.backupsList.appendChild(empty);
    return;
  }
  filtered.forEach((backup) => elements.backupsList.appendChild(buildBackupRow(backup)));
  updateSelectionUi();
}

// 【2026-09-05新設】今表示されている（検索・「名前未設定だけ表示」で絞り込んだ後の）
// バックアップを全て選択する。全プレイヤー63件を無条件に全選択できてしまうと、
// フィルターを掛け忘れたまま「まとめて削除」を押す事故に直結するため、必ず今画面に
// 見えている範囲だけを選択する（絞り込まずに押した場合は後述のhandleBulkDeleteAction()側の
// 警告で気付けるようにしている＝二重の安全策）。
function handleSelectAllVisible() {
  getFilteredBackups().forEach((backup) => selectedBackupIds.add(backup.backupId));
  renderFilteredBackupsList();
}

function handleClearSelection() {
  selectedBackupIds.clear();
  renderFilteredBackupsList();
}

// 【2026-09-05新設、本人指示：「選択して一気に削除」対応】選択済みのバックアップを
// まとめて削除する。1件ずつのdeleteButton（buildBackupRow内）と同じ
// adminDeleteBackup()を、選択された全IDに対して順に呼ぶだけで、Firebase側の
// 権限チェック・削除内容自体は完全に同じ（安全性の根拠は削除操作そのものではなく、
// 「どれを消すかを選ぶ」チェックボックス操作を必ず本人が行っている点にある）。
// 【追加の安全策】選択の中に表示名が設定されている（＝本物の可能性が高い）ものが
// 混ざっていたら、確認ダイアログで件数を明示して強く警告する。
async function handleBulkDeleteAction() {
  const targets = latestBackups.filter((backup) => selectedBackupIds.has(backup.backupId));
  if (targets.length === 0) return;

  const namedTargets = targets.filter((backup) => backup.displayName);
  let confirmMessage = `選択した${targets.length}件のバックアップを完全に削除します。この操作は元に戻せません。\n\n`;
  if (namedTargets.length > 0) {
    confirmMessage +=
      `⚠️ このうち${namedTargets.length}件は表示名が設定されています（本物のプレイヤーの可能性が高いです）：\n` +
      namedTargets.map((b) => `・${b.displayName}（称号${b.achievementCount}）`).join("\n") +
      `\n\n`;
  }
  confirmMessage += `本当に削除しますか？`;

  const confirmed = window.confirm(confirmMessage);
  if (!confirmed) return;

  elements.bulkDeleteButton.disabled = true;
  if (elements.bulkDeleteResultText) {
    elements.bulkDeleteResultText.hidden = false;
    elements.bulkDeleteResultText.textContent = `削除しています…（0/${targets.length}）`;
  }

  let successCount = 0;
  const failedNames = [];
  for (const backup of targets) {
    const result = await adminDeleteBackup(backup.backupId);
    if (result.ok) {
      successCount += 1;
      selectedBackupIds.delete(backup.backupId);
    } else {
      failedNames.push(backup.displayName ?? "（名前未設定）");
    }
    if (elements.bulkDeleteResultText) {
      elements.bulkDeleteResultText.textContent = `削除しています…（${successCount + failedNames.length}/${targets.length}）`;
    }
  }

  if (elements.bulkDeleteResultText) {
    elements.bulkDeleteResultText.textContent =
      failedNames.length === 0
        ? `${successCount}件削除しました。`
        : `${successCount}件削除しました（${failedNames.length}件は失敗：${failedNames.join("、")}）`;
  }
  elements.bulkDeleteButton.disabled = false;
  await renderAdminBackupScreen();
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
//   backupsUnnamedOnlyCheckbox, selectAllButton, clearSelectionButton, selectionStatusText,
//   bulkDeleteButton, bulkDeleteResultText, checkAtRiskButton, atRiskStatusText, atRiskList }
export function initAdminBackupScreen(newElements, allMembers) {
  elements = newElements;
  members = allMembers;
  elements.refreshButton.addEventListener("click", renderAdminBackupScreen);
  elements.backupsSearchInput?.addEventListener("input", renderFilteredBackupsList);
  elements.backupsUnnamedOnlyCheckbox?.addEventListener("change", renderFilteredBackupsList);
  elements.selectAllButton?.addEventListener("click", handleSelectAllVisible);
  elements.clearSelectionButton?.addEventListener("click", handleClearSelection);
  elements.bulkDeleteButton?.addEventListener("click", handleBulkDeleteAction);
  elements.checkAtRiskButton?.addEventListener("click", handleCheckAtRiskPlayers);
}
