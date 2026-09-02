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
import { buildSelectorUidsBySongId } from "./onlineBattleCollaborativeSelectionPayloads.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null;

// 今チェックが入っている曲IDの集合。openOnlineBattleSongPicker()のたびに初期化される。
const selectedSongIds = new Set();

// 「決定」が押されたときに呼ぶコールバック。openOnlineBattleSongPicker()のたびに差し替える。
let onConfirmCallback = null;
// 「戻る」「キャンセル」で呼ぶコールバック（呼び出し元の画面へ戻すためのナビゲーション）。
let onCancelCallback = null;

let searchQuery = "";
let showSelectedOnly = false;

// 【2026-09-14改訂・本人指示：個人の最低選択曲数ノルマの撤廃】この画面は「参加者全員の
// 共有出題曲プール」に自分の分を追加する画面であり、各自が個別に問題数分（旧仕様では
// MIN_SONGS_REQUIRED＝4曲以上）選ぶ必要はない。重要なのはルーム全体の共有プールが
// 出題数を満たしているかだけ（それはロビー側の「対戦を開始する」時点で別途検証される）。
// そのため、この画面では0曲でも「決定」を押して戻れるようにする（本人指示：自分は0曲でも
// 戻れる、1曲だけでもいい）。
function updateSelectionSummary() {
  const count = selectedSongIds.size;
  elements.selectedCountValue.textContent = count;
  elements.confirmButton.disabled = false;
  // 画面下部固定バー側（2026-08-28新設）も、既存の一覧下部ボタンと全く同じ条件で連動させる。
  elements.stickyCountValue.textContent = count;
  elements.stickyConfirmButton.disabled = false;
}

// 「選択中○曲」をタップして開くレビュー用トレイの中身を作り直す。songs.jsの登録順を保つ
// （createSongSelectRow等、他の一覧表示と並び順の考え方を揃える）。
function renderReviewChips() {
  elements.reviewChips.innerHTML = "";
  SONGS.filter((song) => selectedSongIds.has(song.id)).forEach((song) => {
    const chip = document.createElement("span");
    chip.className = "song-picker-review-chip";

    const title = document.createElement("span");
    title.textContent = song.title;
    chip.appendChild(title);

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `${song.title}の選択を解除`);
    removeButton.textContent = "×";
    removeButton.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      selectedSongIds.delete(song.id);
      const checkbox = elements.groupsContainer.querySelector(`input[type="checkbox"][value="${CSS.escape(song.id)}"]`);
      if (checkbox) checkbox.checked = false;
      refreshSelectionUI();
    });
    chip.appendChild(removeButton);

    elements.reviewChips.appendChild(chip);
  });
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
  renderReviewChips();
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
  categoryPill.textContent = categoryInfo.text;

  label.appendChild(checkbox);
  label.appendChild(title);
  label.appendChild(categoryPill);

  // 【2026-09-15新設・本人指示：画面を開いたままリアルタイム同期】他の参加者がこの曲を
  // 選んでいるかを示すバッジ。初期状態は非表示。songIdをdatasetに持たせておき、
  // updateOnlineBattleSongPickerLiveSelections()が検索・チェック状態を一切触らずに
  // このバッジだけを更新できるようにする。
  const othersBadge = document.createElement("span");
  othersBadge.className = "song-select-others-badge";
  othersBadge.hidden = true;
  label.appendChild(othersBadge);

  row.dataset.songId = song.id;
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
  toggleButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    groupElement.classList.toggle("is-open");
  });

  const bulkActions = document.createElement("div");
  bulkActions.className = "single-group-bulk-actions";

  const selectAllButton = document.createElement("button");
  selectAllButton.type = "button";
  selectAllButton.className = "single-group-bulk-button";
  selectAllButton.textContent = "全選択";
  selectAllButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
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
    playSfx(SFX_EVENTS.UI_CLICK);
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

// songs：この画面が一覧に出す曲一覧（呼び出し元がgameMode等に応じて絞り込み済みのものを渡す）。
function renderGroups(songs) {
  const groups = buildSongGroups(songs);
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

// 【2026-09-15新設・本人指示：画面を開いたままリアルタイム同期】ロビー画面と全く同じ
// タイミング（room更新のたび）で呼ばれる想定の、ライブ更新専用の描画関数。
// resetFilters()・renderGroups()・applyCheckedState()等、画面を開いた瞬間にしか
// 呼ばれない他の関数とは違い、この関数は「今画面を開いたままの状態」を一切壊さないことを
// 最優先にする：検索文字列（elements.searchInput.value）・スクロール位置・50音の
// 絞り込み状態・自分のチェック状態のいずれにも触れず、①共有プールの合計数の案内文と、
// ②各曲の横の「〇〇が選択済み」バッジ、の2箇所だけを差分更新する。
//
// players: room.playersそのまま。currentUid: 自分のuid（自分の選択はバッジに含めない）。
// mergedTotalCount・restrictedCount: 呼び出し元（js/onlineBattleScreen.js等）が既に
// 持っている「参加者全員の選択を合わせた数」「このうち今の対戦で使える数」（ロビーの
// 表示と同じ計算式を再利用するため、ここでは計算しない）。
export function updateOnlineBattleSongPickerLiveSelections({ players, currentUid, mergedTotalCount, restrictedCount }) {
  if (!elements) return;

  if (elements.liveSummary) {
    elements.liveSummary.hidden = false;
    elements.liveSummary.textContent =
      mergedTotalCount === 0
        ? "まだ誰も曲を選んでいません。"
        : `参加者全員の選択を合わせて${mergedTotalCount}曲（このうち${restrictedCount}曲がこの対戦で使えます）`;
  }

  const selectorUidsBySongId = buildSelectorUidsBySongId(players);
  elements.groupsContainer.querySelectorAll(".song-select-row").forEach((row) => {
    const songId = row.dataset.songId;
    const badge = row.querySelector(".song-select-others-badge");
    if (!badge) return;
    const otherSelectorUids = (selectorUidsBySongId[songId] ?? []).filter((uid) => uid !== currentUid);
    if (otherSelectorUids.length === 0) {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    const firstDisplayName = players?.[otherSelectorUids[0]]?.displayName ?? players?.[otherSelectorUids[0]]?.name ?? "参加者";
    badge.textContent =
      otherSelectorUids.length === 1 ? `👤 ${firstDisplayName}が選択済み` : `👤 他${otherSelectorUids.length}人が選択済み`;
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
// isSongEligible（省略可）：一覧に出す曲を絞り込みたいモード専用の判定関数(song) => boolean。
//   例：歌詞クイズ対戦はOvertureのように歌詞データが存在しない曲を一覧そのものから除外する
//   （js/onlineLyricsQuizBattleScreen.jsから渡す）。省略時（イントロ対戦・ランダム再生対戦）は
//   全曲を一覧に出す、という今までどおりの動作になる。
export function openOnlineBattleSongPicker(initialSongIds, onConfirm, onCancel, isSongEligible) {
  onConfirmCallback = onConfirm;
  onCancelCallback = onCancel;
  const eligibleSongs = isSongEligible ? SONGS.filter(isSongEligible) : SONGS;
  resetFilters();
  renderGroups(eligibleSongs);
  applyCheckedState(initialSongIds ?? []);
  refreshSelectionUI();
  setStickyBarVisible(true);
  elements.navigateTo("onlineBattleSongPicker");
}

// 画面下部固定バーの表示・非表示（2026-08-28新設）。この画面を離れるときは必ず
// hiddenへ戻す（レビュートレイも閉じておく）ことで、他の画面にバーが残ってしまう
// 事故を防ぐ。
function setStickyBarVisible(visible) {
  elements.stickyBar.hidden = !visible;
  if (!visible) {
    elements.reviewPanel.hidden = true;
    elements.stickyToggle.setAttribute("aria-expanded", "false");
  }
}

export function initOnlineBattleSongPicker(newElements) {
  elements = newElements;
  renderGroups(SONGS);

  elements.backButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    setStickyBarVisible(false);
    onCancelCallback?.();
  });

  elements.stickyToggle.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const isOpen = !elements.reviewPanel.hidden;
    elements.reviewPanel.hidden = isOpen;
    elements.stickyToggle.setAttribute("aria-expanded", String(!isOpen));
  });
  elements.stickyConfirmButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    setStickyBarVisible(false);
    onConfirmCallback?.([...selectedSongIds]);
  });

  elements.selectAllButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.groupsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = true;
      selectedSongIds.add(checkbox.value);
    });
    refreshSelectionUI();
  });
  elements.deselectAllButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.groupsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = false;
      selectedSongIds.delete(checkbox.value);
    });
    refreshSelectionUI();
  });

  // 【本人指示：テキスト入力中には音を付けない】検索欄のinputイベントは対象外。
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
  elements.selectedOnlyCheckbox.addEventListener("change", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    showSelectedOnly = elements.selectedOnlyCheckbox.checked;
    updateRowVisibility();
  });

  elements.confirmButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    setStickyBarVisible(false);
    onConfirmCallback?.([...selectedSongIds]);
  });
}
