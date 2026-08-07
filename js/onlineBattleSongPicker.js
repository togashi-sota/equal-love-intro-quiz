// オンライン対戦（イントロ対戦・ランダム再生対戦・歌詞クイズ対戦）共通の、
// 「出題する曲」をホストが選ぶための曲選択画面。
//
// 【設計方針：既存の曲一覧・検索ロジックを再利用】js/songlist.js が公開している
// buildSongGroups・normalizeForSearch・songMatchesSearch・CATEGORY_PILL_INFO を、
// js/customQuizScreen.js（オリジナル問題作成モードの選曲画面）と同じ形でそのまま使う。
// 曲の一覧・グルーピング・検索の判定ロジックを画面ごとに別々に持たない、という
// このプロジェクトの既存方針を踏襲している。試聴機能は持たせない（この画面の役割は
// 「選ぶ」ことだけに絞り、customQuizScreen.jsの試聴まわりの状態管理は複製しない）。
//
// 【3つの対戦モードで共有】この画面はgameModeを一切意識しない。呼び出し側
// （js/onlineBattleScreen.js・js/onlineLyricsQuizBattleScreen.js）が、開くときに
// 「今の選択曲」を渡し、「決定」が押されたときのコールバックを渡すだけの単純な窓口にしている。
import { SONGS } from "./data/songs.js";
import { buildSongGroups, CATEGORY_PILL_INFO, normalizeForSearch, songMatchesSearch } from "./songlist.js";
import { MIN_SONGS_REQUIRED } from "./quiz.js";

let elements = null;

// 今チェックが入っている曲IDの集合。openOnlineBattleSongPicker()のたびに初期化される。
const selectedSongIds = new Set();

// 「決定」が押されたときに呼ぶコールバック。openOnlineBattleSongPicker()のたびに差し替える。
let onConfirmCallback = null;
// 「戻る」「キャンセル」で呼ぶコールバック（呼び出し元の画面へ戻すためのナビゲーション）。
let onCancelCallback = null;

let searchQuery = "";
let showSelectedOnly = false;

function updateSelectionSummary() {
  const count = selectedSongIds.size;
  elements.selectedCountValue.textContent = count;
  const hasEnoughSongs = count >= MIN_SONGS_REQUIRED;
  elements.minNotice.hidden = hasEnoughSongs;
  elements.confirmButton.disabled = !hasEnoughSongs;
}

function updateGroupSelectionCounts() {
  elements.groupsContainer.querySelectorAll(".single-group").forEach((groupElement) => {
    const checkboxes = [...groupElement.querySelectorAll('input[type="checkbox"]')];
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    groupElement.querySelector(".track-count-chip").textContent = `${selectedCount}/${checkboxes.length}曲選択`;
  });
}

// js/customQuizScreen.jsのupdateRowVisibility()と同じ考え方（検索語・選択済みのみ表示の
// 両方を満たす行だけを見せる、絞り込みに一致した区分は自動的に開く）。試聴が無い分だけシンプル。
function updateRowVisibility() {
  const normalizedQuery = normalizeForSearch(searchQuery);
  const hasActiveFilter = normalizedQuery !== "" || showSelectedOnly;
  let hasAnyVisibleRow = false;

  elements.groupsContainer.querySelectorAll(".single-group").forEach((groupElement) => {
    let hasVisibleRow = false;
    groupElement.querySelectorAll(".song-select-row").forEach((row) => {
      const checkbox = row.querySelector('input[type="checkbox"]');
      const title = row.querySelector(".song-select-title").textContent;
      const reading = row.dataset.searchReading;
      const aliases = JSON.parse(row.dataset.searchAliases);
      const matchesSearch = songMatchesSearch(title, reading, aliases, normalizedQuery);
      const matchesSelectedOnly = !showSelectedOnly || checkbox.checked;
      const isVisible = matchesSearch && matchesSelectedOnly;
      row.hidden = !isVisible;
      if (isVisible) hasVisibleRow = true;
    });
    groupElement.hidden = !hasVisibleRow;
    if (hasVisibleRow && hasActiveFilter) groupElement.classList.add("is-open");
    if (hasVisibleRow) hasAnyVisibleRow = true;
  });

  elements.noResultsNotice.hidden = hasAnyVisibleRow;
}

function refreshSelectionUI() {
  updateSelectionSummary();
  updateGroupSelectionCounts();
  updateRowVisibility();
}

function createSongSelectRow(song) {
  const row = document.createElement("div");
  row.className = "song-select-row";
  row.dataset.searchReading = song.searchReading ?? "";
  row.dataset.searchAliases = JSON.stringify(song.searchAliases ?? []);

  const label = document.createElement("label");
  label.className = "song-select-label";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = song.id;
  checkbox.addEventListener("change", () => {
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
  categoryPill.textContent = categoryInfo.text;

  label.appendChild(checkbox);
  label.appendChild(title);
  label.appendChild(categoryPill);
  row.appendChild(label);
  return row;
}

function createSingleGroupElement(group, isInitiallyOpen) {
  const groupElement = document.createElement("div");
  groupElement.className = "single-group";
  groupElement.classList.toggle("is-open", isInitiallyOpen);

  const rowsContainer = document.createElement("div");
  rowsContainer.className = "single-group-tracks";
  group.songs.forEach((song) => rowsContainer.appendChild(createSongSelectRow(song)));

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
  toggleButton.addEventListener("click", () => groupElement.classList.toggle("is-open"));

  const bulkActions = document.createElement("div");
  bulkActions.className = "single-group-bulk-actions";

  const selectAllButton = document.createElement("button");
  selectAllButton.type = "button";
  selectAllButton.className = "single-group-bulk-button";
  selectAllButton.textContent = "全選択";
  selectAllButton.addEventListener("click", () => {
    rowsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = true;
      selectedSongIds.add(checkbox.value);
    });
    refreshSelectionUI();
  });

  const deselectAllButton = document.createElement("button");
  deselectAllButton.type = "button";
  deselectAllButton.className = "single-group-bulk-button";
  deselectAllButton.textContent = "全解除";
  deselectAllButton.addEventListener("click", () => {
    rowsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = false;
      selectedSongIds.delete(checkbox.value);
    });
    refreshSelectionUI();
  });

  bulkActions.appendChild(selectAllButton);
  bulkActions.appendChild(deselectAllButton);
  headerRow.appendChild(toggleButton);
  headerRow.appendChild(bulkActions);
  groupElement.appendChild(headerRow);
  groupElement.appendChild(rowsContainer);
  return groupElement;
}

function renderGroups() {
  const groups = buildSongGroups(SONGS);
  elements.groupsContainer.innerHTML = "";
  groups.forEach((group, index) => {
    elements.groupsContainer.appendChild(createSingleGroupElement(group, index === 0));
  });
}

function applyCheckedState(songIds) {
  selectedSongIds.clear();
  songIds.forEach((songId) => selectedSongIds.add(songId));
  elements.groupsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = selectedSongIds.has(checkbox.value);
  });
  elements.groupsContainer.querySelectorAll(".single-group").forEach((groupElement) => {
    const hasSelectedSong = [...groupElement.querySelectorAll('input[type="checkbox"]')].some(
      (checkbox) => checkbox.checked
    );
    groupElement.classList.toggle("is-open", hasSelectedSong);
  });
}

function resetFilters() {
  searchQuery = "";
  elements.searchInput.value = "";
  elements.searchClearButton.hidden = true;
  showSelectedOnly = false;
  elements.selectedOnlyCheckbox.checked = false;
}

// 呼び出し元（js/onlineBattleScreen.js等）から、今すでに選ばれている曲（ルーム設定の
// questionSource.songIds、無ければ空配列）とコールバックを渡して画面を開く。
// onConfirm：「決定」が押されたとき、選んだ曲id配列(string[])を受け取って呼ばれる。
// onCancel：「戻る」「キャンセル」が押されたときに呼ばれる（呼び出し元が画面遷移を行う）。
export function openOnlineBattleSongPicker(initialSongIds, onConfirm, onCancel) {
  onConfirmCallback = onConfirm;
  onCancelCallback = onCancel;
  resetFilters();
  applyCheckedState(initialSongIds ?? []);
  refreshSelectionUI();
  elements.navigateTo("onlineBattleSongPicker");
}

export function initOnlineBattleSongPicker(newElements) {
  elements = newElements;
  renderGroups();

  elements.backButton.addEventListener("click", () => {
    onCancelCallback?.();
  });

  elements.selectAllButton.addEventListener("click", () => {
    elements.groupsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = true;
      selectedSongIds.add(checkbox.value);
    });
    refreshSelectionUI();
  });
  elements.deselectAllButton.addEventListener("click", () => {
    elements.groupsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = false;
      selectedSongIds.delete(checkbox.value);
    });
    refreshSelectionUI();
  });

  elements.searchInput.addEventListener("input", () => {
    searchQuery = elements.searchInput.value;
    elements.searchClearButton.hidden = searchQuery === "";
    updateRowVisibility();
  });
  elements.searchClearButton.addEventListener("click", () => {
    searchQuery = "";
    elements.searchInput.value = "";
    elements.searchClearButton.hidden = true;
    updateRowVisibility();
    elements.searchInput.focus();
  });
  elements.selectedOnlyCheckbox.addEventListener("change", () => {
    showSelectedOnly = elements.selectedOnlyCheckbox.checked;
    updateRowVisibility();
  });

  elements.confirmButton.addEventListener("click", () => {
    onConfirmCallback?.([...selectedSongIds]);
  });
}
