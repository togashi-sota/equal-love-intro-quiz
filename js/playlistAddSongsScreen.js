// プレイリストへの曲追加画面（複数選択→まとめて追加）を組み立てるファイル。
// 収録曲一覧（js/songlist.js）のシングル単位アコーディオン・検索ロジックをそのまま再利用し、
// 各曲の行だけ「再生ボタン」ではなく「チェックボックス」に差し替える
// （オリジナル問題作成モードの選曲画面＝js/customQuizScreen.jsと同じ考え方）。
// UI/UX再設計（プレイリスト作成→曲追加までを迷わずたどり着けるようにする）で新設。

import { SONGS } from "./data/songs.js";
import {
  buildSongGroups,
  CATEGORY_PILL_INFO,
  normalizeForSearch,
  songMatchesSearch,
  resolveGroupWorkId,
} from "./songlist.js";
import { getPlaylistById, addSongsToPlaylist } from "./playlists.js";
// この画面内で完結する操作（曲選択・作品単位の一括選択・アコーディオン開閉）に効果音を鳴らすため追加。
import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null;

// 今の対象プレイリストid。画面を開くたびにrenderPlaylistAddSongsScreen()で設定する。
let targetPlaylistId = null;

// 今チェックが入っている曲id（すでにプレイリストに入っている曲は含めない＝この画面では
// 「新たに追加する曲」だけを管理する。プレイリストからの削除は詳細画面側の役割のため）。
const selectedSongIds = new Set();

let searchQuery = "";

let actionBannerHideTimeoutId = null;
const ACTION_BANNER_DISPLAY_MS = 2600;

// 作品単位の一括選択を行ったときの短い完了案内
// （js/songlist.jsのshowSonglistActionBanner()と同じ考え方。UI/UX再設計で追加）。
function showAddSongsActionBanner(message) {
  elements.actionBanner.textContent = message;
  elements.actionBanner.hidden = false;
  if (actionBannerHideTimeoutId !== null) {
    clearTimeout(actionBannerHideTimeoutId);
  }
  actionBannerHideTimeoutId = setTimeout(() => {
    elements.actionBanner.hidden = true;
    actionBannerHideTimeoutId = null;
  }, ACTION_BANNER_DISPLAY_MS);
}

// 選択数の表示・「追加する」ボタンの有効/無効を、今の選択状況に合わせて更新する。
function updateSelectionSummary() {
  const count = selectedSongIds.size;
  elements.selectedCount.textContent = count;
  elements.submitButton.disabled = count === 0;
}

// シングルごとの見出しに添える「選択数/曲数」表示を更新する。
// すでに追加済みの曲（チェック不可）は分母に含めるが、選択数のカウントには含めない
// （「これから何曲選んでいるか」だけを見せるため）。
// あわせて、作品単位の一括選択ボタンがある区分は、その状態（未選択/一部/全選択）も
// 描き直す（チェックボックスを1つずつ手動で操作したときにも、ボタンの見た目が
// ずれないようにするため。songlist.jsのrefreshAllFavoriteButtonsと同じ考え方）。
function updateGroupSelectionCounts() {
  elements.groupsContainer.querySelectorAll(".single-group").forEach((groupElement) => {
    const checkboxes = [...groupElement.querySelectorAll('input[type="checkbox"]:not(:disabled)')];
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    groupElement.querySelector(".track-count-chip").textContent = `${selectedCount}/${checkboxes.length}曲選択`;

    const selectButton = groupElement.querySelector(".single-group-select-button");
    if (selectButton) refreshWorkSelectButtonState(selectButton);
  });
}

function refreshSelectionUI() {
  updateSelectionSummary();
  updateGroupSelectionCounts();
}

// 曲名検索の検索語に合わせて、各曲行・シングル区分の表示/非表示を更新する
// （収録曲一覧・オリジナル問題作成モードの選曲画面と同じ考え方）。
function updateRowVisibility() {
  const normalizedQuery = normalizeForSearch(searchQuery);
  let hasAnyVisibleRow = false;

  elements.groupsContainer.querySelectorAll(".single-group").forEach((groupElement) => {
    let hasVisibleRow = false;

    groupElement.querySelectorAll(".song-select-row").forEach((row) => {
      const title = row.querySelector(".song-select-title").textContent;
      const reading = row.dataset.searchReading;
      const aliases = JSON.parse(row.dataset.searchAliases);
      const isVisible = songMatchesSearch(title, reading, aliases, normalizedQuery);
      row.hidden = !isVisible;
      if (isVisible) hasVisibleRow = true;
    });

    groupElement.hidden = !hasVisibleRow;
    if (hasVisibleRow && normalizedQuery !== "") {
      groupElement.classList.add("is-open");
    }
    if (hasVisibleRow) hasAnyVisibleRow = true;
  });

  elements.noResultsNotice.hidden = hasAnyVisibleRow;
}

// 1曲分のチェック行を作る。すでにプレイリストに入っている曲は、チェック済み・操作不可で
// 表示する（「もう入っている」ことがひと目で分かるようにするため。YouTube Music等の
// 「プレイリストに追加」画面と同じ考え方）。
function createSongSelectRow(song, isAlreadyInPlaylist) {
  const row = document.createElement("div");
  row.className = "song-select-row";
  row.dataset.searchReading = song.searchReading ?? "";
  row.dataset.searchAliases = JSON.stringify(song.searchAliases ?? []);

  const label = document.createElement("label");
  label.className = "song-select-label";
  label.classList.toggle("is-already-added", isAlreadyInPlaylist);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = song.id;
  checkbox.checked = isAlreadyInPlaylist;
  checkbox.disabled = isAlreadyInPlaylist;
  checkbox.addEventListener("change", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    if (checkbox.checked) {
      selectedSongIds.add(song.id);
    } else {
      selectedSongIds.delete(song.id);
    }
    refreshSelectionUI();
  });

  const title = document.createElement("span");
  title.className = "song-select-title";
  title.textContent = song.title;

  const categoryInfo = CATEGORY_PILL_INFO[song.category];
  const categoryPill = document.createElement("span");
  categoryPill.className = `category-pill ${categoryInfo.className}`;
  categoryPill.textContent = isAlreadyInPlaylist ? "追加済み" : categoryInfo.text;

  label.appendChild(checkbox);
  label.appendChild(title);
  label.appendChild(categoryPill);
  row.appendChild(label);

  return row;
}

// 作品単位の一括選択ボタンの見た目（未選択/一部選択/全選択）を、今のselectedSongIdsに
// 合わせて描き直す。ボタン作成時だけでなく、チェックボックスを1つずつ手動で操作したときにも
// updateGroupSelectionCounts()から呼べるよう、対象曲idと作品名をボタン自身のdata属性に
// 持たせておく（songlist.jsのrefreshWorkFavoriteButtonStateと同じ考え方）。
function refreshWorkSelectButtonState(button) {
  const eligibleSongIds = JSON.parse(button.dataset.eligibleSongIds);
  const groupLabel = button.dataset.groupLabel;
  const allSelected = eligibleSongIds.every((id) => selectedSongIds.has(id));
  const anySelected = eligibleSongIds.some((id) => selectedSongIds.has(id));
  button.classList.toggle("is-full", allSelected);
  button.classList.toggle("is-partial", !allSelected && anySelected);
  button.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5 10 17l9-10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>${allSelected ? "全曲解除" : "全曲選択"}</span>
  `;
  button.setAttribute(
    "aria-label",
    allSelected ? `${groupLabel}の選択をすべて解除する` : `${groupLabel}の追加できる曲をすべて選択する`
  );
}

// 作品単位の一括選択ボタンを作る（未選択/一部選択/全選択の3状態）。
// お気に入りの作品単位一括登録（songlist.jsのbuildWorkFavoriteButton）と同じ考え方だが、
// こちらは「お気に入りに登録する」ではなく「プレイリスト追加のためにチェックする」対象。
// すでにプレイリストに入っている曲（チェック不可）は一括操作の対象から外す
// （eligibleSongIdsに含めない）。検索で一部の曲だけが表示されている場合でも、
// 検索結果に関わらず作品内の追加可能な全曲を対象にする（本人の希望：見出しが
// 表示されている以上、作品全体を選ぶ方が自然という判断）。
function buildWorkSelectButton(group, eligibleSongIds) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "single-group-select-button";
  button.dataset.eligibleSongIds = JSON.stringify(eligibleSongIds);
  button.dataset.groupLabel = group.label;
  refreshWorkSelectButtonState(button);

  button.addEventListener("click", (event) => {
    playSfx(SFX_EVENTS.UI_CLICK);
    event.stopPropagation();
    const groupElement = button.closest(".single-group");
    const allSelected = eligibleSongIds.every((id) => selectedSongIds.has(id));

    if (allSelected) {
      eligibleSongIds.forEach((id) => selectedSongIds.delete(id));
      showAddSongsActionBanner(`${group.label}の選択を解除しました`);
    } else {
      const additionCount = eligibleSongIds.filter((id) => !selectedSongIds.has(id)).length;
      eligibleSongIds.forEach((id) => selectedSongIds.add(id));
      showAddSongsActionBanner(`${group.label}の${additionCount}曲を選択しました`);
    }

    groupElement.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach((checkbox) => {
      checkbox.checked = selectedSongIds.has(checkbox.value);
    });
    refreshWorkSelectButtonState(button);
    refreshSelectionUI();
  });

  return button;
}

// 1つのシングル区分（アコーディオン1つ分）を作る。
function createSingleGroupElement(group, isInitiallyOpen, existingSongIds) {
  const groupElement = document.createElement("div");
  groupElement.className = "single-group";
  groupElement.classList.toggle("is-open", isInitiallyOpen);

  const headerRow = document.createElement("div");
  headerRow.className = "single-group-header-row";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "single-group-header";
  toggleButton.innerHTML = `
    <svg class="chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="single-group-name">${group.label}</span>
    <span class="track-count-chip">0/${group.songs.length}曲選択</span>
  `;
  toggleButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    groupElement.classList.toggle("is-open");
  });
  headerRow.appendChild(toggleButton);

  // この区分がちょうど1つの作品（workId）だけで構成されているときだけ、
  // 作品単位の一括選択ボタンを追加する。追加できる曲（まだプレイリストに入っていない曲）が
  // 1曲もない場合はボタンを出さない（何も操作できることがないため）。
  const workId = resolveGroupWorkId(group.songs);
  if (workId) {
    const eligibleSongIds = group.songs.filter((song) => !existingSongIds.has(song.id)).map((song) => song.id);
    if (eligibleSongIds.length > 0) {
      const bulkActions = document.createElement("div");
      bulkActions.className = "single-group-bulk-actions";
      bulkActions.appendChild(buildWorkSelectButton(group, eligibleSongIds));
      headerRow.appendChild(bulkActions);
    }
  }

  const tracksContainer = document.createElement("div");
  tracksContainer.className = "single-group-tracks";
  group.songs.forEach((song) => {
    tracksContainer.appendChild(createSongSelectRow(song, existingSongIds.has(song.id)));
  });

  groupElement.appendChild(headerRow);
  groupElement.appendChild(tracksContainer);
  return groupElement;
}

function commitAddSongs() {
  if (!targetPlaylistId || selectedSongIds.size === 0) return;
  const addedCount = addSongsToPlaylist(targetPlaylistId, [...selectedSongIds]);
  elements.onSubmit(targetPlaylistId, addedCount);
}

// この画面を開くたびに呼ぶ。対象プレイリストを指定し、選択状態・検索語を初期化してから
// 全曲のアコーディオンを組み立て直す（プレイリストの中身は開くたびに変わりうるため、
// 収録曲一覧のように使い回さず、毎回作り直す）。
export function renderPlaylistAddSongsScreen(playlistId) {
  const playlist = getPlaylistById(playlistId);
  if (!playlist) return;
  targetPlaylistId = playlistId;
  selectedSongIds.clear();
  searchQuery = "";
  elements.searchInput.value = "";
  elements.searchClearButton.hidden = true;
  elements.title.textContent = `「${playlist.playlistName || "（名前未設定）"}」に追加`;

  const existingSongIds = new Set(playlist.songIds);
  const groups = buildSongGroups(SONGS);
  const newestGroup = groups[0];

  elements.groupsContainer.innerHTML = "";
  groups.forEach((group) => {
    elements.groupsContainer.appendChild(
      createSingleGroupElement(group, group === newestGroup, existingSongIds)
    );
  });

  elements.noResultsNotice.hidden = true;
  refreshSelectionUI();
}

// elements: {
//   title: 画面見出し（対象プレイリスト名を表示）,
//   groupsContainer: アコーディオンの入れ物,
//   noResultsNotice: 検索結果が0件のときの案内,
//   searchInput, searchClearButton: 曲名検索欄,
//   selectedCount: 「選択中：◯曲」の数字部分,
//   submitButton: 「選択した曲を追加する」ボタン,
//   actionBanner: 作品単位の一括選択完了時の短い案内（UI/UX再設計で追加）,
//   onSubmit: 追加確定後に呼ばれるコールバック（playlistId, addedCountを受け取る）,
// }
export function initPlaylistAddSongsScreen(newElements) {
  elements = newElements;

  elements.searchInput.addEventListener("input", () => {
    searchQuery = elements.searchInput.value;
    elements.searchClearButton.hidden = searchQuery === "";
    updateRowVisibility();
  });
  elements.searchClearButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    searchQuery = "";
    elements.searchInput.value = "";
    elements.searchClearButton.hidden = true;
    updateRowVisibility();
    elements.searchInput.focus();
  });

  // 【二重再生防止】commitAddSongs()は成功時に必ずelements.onSubmit（main.js側、先頭で
  // playSfx(UI_CLICK)相当のplayClickSound()を鳴らす）を呼ぶため、ここでは重ねて鳴らさない。
  elements.submitButton.addEventListener("click", commitAddSongs);
}
