// 「シングルごとのグループ（1枚目／2枚目…）に折りたたんで曲を選ぶ」一覧の共通部品
// （2026-09-15 第4回実機QA修正・本人指示：パーティー対戦「曲を選んで出題」をオンライン対戦の曲選択と同じ操作感へ）。
//
// 【何をするか】js/onlineBattleSongPicker.js（オンライン対戦の曲選択画面）と同じ DOM 構造・同じ CSS クラス
// （.single-group／.single-group-header-row／.single-group-bulk-actions／.song-select-row／.category-pill）で、
//   ・シングルごとの折りたたみグループ（見出し＝「Nthシングル 表題曲名」、「n/m曲選択」チップ）
//   ・グループ単位の「全選択」「全解除」
//   ・曲名・読み・別名での検索（js/songlist.js の normalizeForSearch／songMatchesSearch を再利用）
//   ・「選択中の曲だけ表示」
// を提供する。選択状態は呼び出し側が渡す Set（selectedSongIds）1つに集約し、検索・グループの開閉・表示切替で
// 失われない（画面に見えていない曲のチェックも Set に残る）。
//
// 【なぜ別モジュールか】オンライン対戦側（onlineBattleSongPicker.js）は他の参加者のリアルタイム同期バッジなど
// オンライン専用の責務を持つため、その画面をそのままパーティー対戦へ流用すると挙動を変えてしまう恐れがある
// （本人指示：オンライン側の現在の挙動は変えない）。曲一覧の組み立て・検索の判定は既存の共通関数
// （js/songGrouping.js の buildSongGroups／CATEGORY_PILL_INFO、js/songSearch.js の songMatchesSearch）に寄せ、DOM の組み立てだけをここで共通化した。
import { buildSongGroups, CATEGORY_PILL_INFO } from "./songGrouping.js";
import { normalizeForSearch, songMatchesSearch } from "./songSearch.js";

// container: グループを描く要素／songs: 一覧に出す曲（呼び出し側で絞り込み済み）／selectedSongIds: 選択状態（Set。共有）
// onSelectionChange(): チェックが変わるたびに呼ぶ（合計数の表示などは呼び出し側）／noResultsNotice: 検索結果0件の案内（任意）
// playClick(): タップ効果音（任意）
export function createSongGroupSelectList({ container, songs, selectedSongIds, onSelectionChange, noResultsNotice = null, playClick = null }) {
  let searchQuery = "";
  let showSelectedOnly = false;

  const click = () => playClick?.();

  function createSongSelectRow(song) {
    const row = document.createElement("div");
    row.className = "song-select-row";
    row.dataset.songId = song.id;
    row.dataset.searchReading = song.searchReading ?? "";
    row.dataset.searchAliases = JSON.stringify(song.searchAliases ?? []);

    const label = document.createElement("label");
    label.className = "song-select-label";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = song.id;
    checkbox.checked = selectedSongIds.has(song.id);
    checkbox.addEventListener("change", () => {
      click();
      if (checkbox.checked) selectedSongIds.add(song.id);
      else selectedSongIds.delete(song.id);
      refresh();
    });

    const title = document.createElement("span");
    title.className = "song-select-title";
    title.textContent = song.title;

    // 曲属性（表題曲／全員曲／ユニット曲…）のラベルは曲データから毎回引くので、グループ分けや検索で曲が
    // 並び替わっても別の曲へ付くことはない
    const categoryInfo = CATEGORY_PILL_INFO[song.category];
    const categoryPill = document.createElement("span");
    categoryPill.className = `category-pill ${categoryInfo?.className ?? ""}`;
    categoryPill.textContent = categoryInfo?.text ?? song.category;

    label.append(checkbox, title, categoryPill);
    row.appendChild(label);
    return row;
  }

  function createSingleGroupElement(group, isInitiallyOpen) {
    const groupElement = document.createElement("div");
    groupElement.className = "single-group";
    groupElement.classList.toggle("is-open", isInitiallyOpen);
    groupElement.dataset.groupKey = group.key;

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
      <span class="single-group-name"></span>
      <span class="track-count-chip">0/${group.songs.length}曲選択</span>
    `;
    toggleButton.querySelector(".single-group-name").textContent = group.label;
    toggleButton.addEventListener("click", () => {
      click();
      groupElement.classList.toggle("is-open");
    });

    const bulkActions = document.createElement("div");
    bulkActions.className = "single-group-bulk-actions";
    const selectAllButton = document.createElement("button");
    selectAllButton.type = "button";
    selectAllButton.className = "single-group-bulk-button";
    selectAllButton.textContent = "全選択";
    selectAllButton.addEventListener("click", () => {
      click();
      setGroupChecked(rowsContainer, true);
    });
    const deselectAllButton = document.createElement("button");
    deselectAllButton.type = "button";
    deselectAllButton.className = "single-group-bulk-button";
    deselectAllButton.textContent = "全解除";
    deselectAllButton.addEventListener("click", () => {
      click();
      setGroupChecked(rowsContainer, false);
    });
    bulkActions.append(selectAllButton, deselectAllButton);

    headerRow.append(toggleButton, bulkActions);
    groupElement.append(headerRow, rowsContainer);
    return groupElement;
  }

  // グループ単位の全選択／全解除は「そのグループの曲」だけを対象にする（他のグループの選択は触らない）
  function setGroupChecked(rowsContainer, checked) {
    rowsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = checked;
      if (checked) selectedSongIds.add(checkbox.value);
      else selectedSongIds.delete(checkbox.value);
    });
    refresh();
  }

  function updateGroupSelectionCounts() {
    container.querySelectorAll(".single-group").forEach((groupElement) => {
      const checkboxes = [...groupElement.querySelectorAll('input[type="checkbox"]')];
      const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
      const chip = groupElement.querySelector(".track-count-chip");
      if (chip) chip.textContent = `${selectedCount}/${checkboxes.length}曲選択`;
    });
  }

  // 検索・「選択中だけ」で行の表示／非表示を切り替える（チェック状態＝selectedSongIds は変えない）
  function updateRowVisibility() {
    const normalizedQuery = normalizeForSearch(searchQuery);
    const hasActiveFilter = normalizedQuery !== "" || showSelectedOnly;
    let hasAnyVisibleRow = false;
    container.querySelectorAll(".single-group").forEach((groupElement) => {
      let hasVisibleRow = false;
      groupElement.querySelectorAll(".song-select-row").forEach((row) => {
        const checkbox = row.querySelector('input[type="checkbox"]');
        const title = row.querySelector(".song-select-title").textContent;
        const matchesSearch = songMatchesSearch(title, row.dataset.searchReading, JSON.parse(row.dataset.searchAliases), normalizedQuery);
        const matchesSelectedOnly = !showSelectedOnly || checkbox.checked;
        const isVisible = matchesSearch && matchesSelectedOnly;
        row.hidden = !isVisible;
        if (isVisible) hasVisibleRow = true;
      });
      groupElement.hidden = !hasVisibleRow;
      if (hasVisibleRow && hasActiveFilter) groupElement.classList.add("is-open");
      if (hasVisibleRow) hasAnyVisibleRow = true;
    });
    if (noResultsNotice) noResultsNotice.hidden = hasAnyVisibleRow;
  }

  function refresh() {
    updateGroupSelectionCounts();
    updateRowVisibility();
    onSelectionChange?.();
  }

  // 一覧を組み立て直す（開くたびに呼ぶ）。選択済みの曲があるグループは開いた状態にする（オンライン側と同じ）
  function render() {
    const groups = buildSongGroups(songs);
    container.innerHTML = "";
    groups.forEach((group, index) => {
      const hasSelected = group.songs.some((song) => selectedSongIds.has(song.id));
      container.appendChild(createSingleGroupElement(group, index === 0 || hasSelected));
    });
    refresh();
  }

  // DOM のチェック状態を selectedSongIds に合わせ直す（全曲選択／全曲解除など Set を外から変えたあとに呼ぶ）
  function syncCheckboxes() {
    container.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = selectedSongIds.has(checkbox.value);
    });
    refresh();
  }

  return {
    render,
    syncCheckboxes,
    setSearchQuery(query) {
      searchQuery = query ?? "";
      updateRowVisibility();
    },
    setShowSelectedOnly(value) {
      showSelectedOnly = Boolean(value);
      updateRowVisibility();
    },
    // 一覧に出ている全曲（検索で隠れている曲も含む）を選択／解除。ページ（グループ）単位の操作とは別
    selectAll() {
      songs.forEach((song) => selectedSongIds.add(song.id));
      syncCheckboxes();
    },
    deselectAll() {
      songs.forEach((song) => selectedSongIds.delete(song.id));
      syncCheckboxes();
    },
    // テスト・診断用：グループ数
    getGroupCount() {
      return container.querySelectorAll(".single-group").length;
    },
  };
}
