// 「曲を選んで再生」画面（2026-11-01 r8-music・本人の依頼 R8-2）。
// 本人の言葉：「今は再生元が全曲／お気に入り／プレイリストしかなく、84曲全部の再生になってしまう」。
// 聴きたい曲だけをタップで選び、下の帯から
//   ［順番に再生］［シャッフル］… 選んだ曲だけで連続再生のキューを作る（js/continuousPlay.js の startFromPickedSongs）
//   ［プレイリストへ］ … 今あるプレイリストを選ぶ／新しく作って、まとめて追加（もう入っている曲は二重に入れない）
//   ［お気に入りへ］   … まとめて♡を付ける（すぐ「元に戻す」ができる）
// ができる。選んだ順に番号が付き、順番に再生するときはその順。選んだ曲は js/songPickSelection.js が
// 別のキーに保存するので、連続再生の再生元「選んだ曲」からもう一度使える。
//
// 一覧は収録曲一覧・プレイリストへの曲追加と同じ「シングルごとの折りたたみ」（同じ CSS クラス .single-group）。
// 検索（曲名・読み・別名）と絞り込み（すべて／お気に入り／選んだ曲／音源あり）は、選んだ状態を消さずに併用できる。
// 音源の無い曲も選べる（プレイリスト・お気に入りへは追加できる）。再生のときは、ほかの再生元と同じく
// 音源の無い曲を除いて、その数を連続再生の画面に出す。

import { SONGS, getSongById } from "./data/songs.js";
import { buildSongGroups, CATEGORY_PILL_INFO } from "./songGrouping.js";
import { normalizeForSearch, songMatchesSearch } from "./songSearch.js";
import { getFavoriteSongIds, addFavoriteSongs, removeFavoriteSongs } from "./favoriteSongs.js";
import { getPlaylists, createPlaylist, addSongsToPlaylist } from "./playlists.js";
import { getImportedSongIds } from "./audioStorage.js";
import { bindSearchInputKeyboardAvoidance } from "./answerPoolBrowseUi.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import {
  loadPickedSongIds,
  savePickedSongIds,
  togglePickedSong,
  addPickedSongs,
  removePickedSongs,
  resolvePickedSongs,
  countPlayablePicked,
  PICK_FILTERS,
  songMatchesPickFilter,
  splitForBulkAdd,
  describeBulkAddResult,
  describePickedSummary,
} from "./songPickSelection.js";

let elements = null;

let pickedIds = []; // 選んだ曲 id（選んだ順）
let importedIds = new Set(); // 端末に音源がある曲
let favoriteIds = new Set();
let searchQuery = "";
let activeFilter = PICK_FILTERS.ALL;

let toastTimeoutId = null;
const TOAST_DISPLAY_MS = 5000;

const KNOWN_SONG_IDS = new Set(SONGS.map((song) => song.id));

function setPicked(nextIds) {
  pickedIds = nextIds;
  savePickedSongIds(pickedIds);
  refreshSelectionUI();
}

// ---- 一覧の組み立て ----

function createSongRow(song) {
  const row = document.createElement("label");
  row.className = "song-pick-row";
  row.dataset.songId = song.id;
  row.dataset.searchReading = song.searchReading ?? "";
  row.dataset.searchAliases = JSON.stringify(song.searchAliases ?? []);

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "song-pick-check";
  checkbox.value = song.id;
  checkbox.addEventListener("change", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const isPicked = pickedIds.includes(song.id);
    if (checkbox.checked !== isPicked) setPicked(togglePickedSong(pickedIds, song.id));
  });

  // 丸の印：選んでいないときは空の丸、選んだら塗った丸に「選んだ順の番号」
  const mark = document.createElement("span");
  mark.className = "song-pick-mark";
  mark.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "song-pick-text";
  const title = document.createElement("span");
  title.className = "song-pick-title";
  title.textContent = song.title;
  const meta = document.createElement("span");
  meta.className = "song-pick-meta";
  const categoryInfo = CATEGORY_PILL_INFO[song.category];
  const categoryPill = document.createElement("span");
  categoryPill.className = `category-pill ${categoryInfo?.className ?? ""}`;
  categoryPill.textContent = categoryInfo?.text ?? song.category;
  const noAudioPill = document.createElement("span");
  noAudioPill.className = "song-pick-noaudio";
  noAudioPill.textContent = "音源なし";
  const favoriteMark = document.createElement("span");
  favoriteMark.className = "song-pick-fav";
  favoriteMark.textContent = "♡ お気に入り";
  meta.append(categoryPill, noAudioPill, favoriteMark);
  text.append(title, meta);

  row.append(checkbox, mark, text);
  return row;
}

function createGroupElement(group, isInitiallyOpen) {
  const groupElement = document.createElement("div");
  groupElement.className = "single-group song-pick-group";
  groupElement.classList.toggle("is-open", isInitiallyOpen);
  groupElement.dataset.groupKey = group.key;
  groupElement.dataset.songIds = JSON.stringify(group.songs.map((song) => song.id));

  const headerRow = document.createElement("div");
  headerRow.className = "single-group-header-row";

  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = "single-group-header";
  toggleButton.setAttribute("aria-expanded", String(isInitiallyOpen));
  toggleButton.innerHTML = `
    <svg class="chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="single-group-name"></span>
    <span class="track-count-chip"></span>
  `;
  toggleButton.querySelector(".single-group-name").textContent = group.label;
  toggleButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const open = groupElement.classList.toggle("is-open");
    toggleButton.setAttribute("aria-expanded", String(open));
  });

  // 作品ごとに「全部選ぶ／全部外す」（選んでいない曲がある間は「全部選ぶ」）
  const bulkButton = document.createElement("button");
  bulkButton.type = "button";
  bulkButton.className = "single-group-bulk-button song-pick-group-bulk";
  bulkButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const ids = group.songs.map((song) => song.id);
    const allPicked = ids.every((id) => pickedIds.includes(id));
    setPicked(allPicked ? removePickedSongs(pickedIds, ids) : addPickedSongs(pickedIds, ids));
    if (!allPicked) {
      groupElement.classList.add("is-open");
      toggleButton.setAttribute("aria-expanded", "true");
    }
  });
  const bulkActions = document.createElement("div");
  bulkActions.className = "single-group-bulk-actions";
  bulkActions.appendChild(bulkButton);

  headerRow.append(toggleButton, bulkActions);

  const tracks = document.createElement("div");
  tracks.className = "single-group-tracks";
  group.songs.forEach((song) => tracks.appendChild(createSongRow(song)));

  groupElement.append(headerRow, tracks);
  return groupElement;
}

function renderGroups() {
  const groups = buildSongGroups(SONGS);
  const pickedSet = new Set(pickedIds);
  elements.groupsContainer.innerHTML = "";
  groups.forEach((group, index) => {
    // 最初に開いておく作品：いちばん新しい作品と、もう選んだ曲が入っている作品
    const isOpen = index === 0 || group.songs.some((song) => pickedSet.has(song.id));
    elements.groupsContainer.appendChild(createGroupElement(group, isOpen));
  });
}

// ---- 表示の更新 ----

// 各行の印（番号）・チェック・音源なし・お気に入りの表示と、作品ごとの「n/m曲」「全部選ぶ／外す」を合わせる。
function refreshRows() {
  const orderOf = new Map(pickedIds.map((id, index) => [id, index + 1]));
  elements.groupsContainer.querySelectorAll(".song-pick-row").forEach((row) => {
    const id = row.dataset.songId;
    const order = orderOf.get(id);
    const checkbox = row.querySelector(".song-pick-check");
    checkbox.checked = Boolean(order);
    row.classList.toggle("is-picked", Boolean(order));
    row.querySelector(".song-pick-mark").textContent = order ? String(order) : "";
    row.classList.toggle("is-noaudio", !importedIds.has(id));
    row.classList.toggle("is-favorite", favoriteIds.has(id));
    const titleText = row.querySelector(".song-pick-title").textContent;
    checkbox.setAttribute(
      "aria-label",
      `${titleText}${order ? `（${order}曲目に選択中）` : ""}${importedIds.has(id) ? "" : "（音源なし）"}`
    );
  });
  elements.groupsContainer.querySelectorAll(".song-pick-group").forEach((groupElement) => {
    const ids = JSON.parse(groupElement.dataset.songIds);
    const pickedCount = ids.filter((id) => orderOf.has(id)).length;
    groupElement.querySelector(".track-count-chip").textContent = `${pickedCount}/${ids.length}曲`;
    groupElement.classList.toggle("has-picked", pickedCount > 0);
    const bulkButton = groupElement.querySelector(".song-pick-group-bulk");
    const allPicked = pickedCount === ids.length;
    bulkButton.textContent = allPicked ? "全部外す" : "全部選ぶ";
    bulkButton.classList.toggle("is-full", allPicked);
    const label = groupElement.querySelector(".single-group-name").textContent;
    bulkButton.setAttribute("aria-label", allPicked ? `${label}の曲を全部外す` : `${label}の曲を全部選ぶ`);
  });
}

// 検索と絞り込みに合わせて、行・作品の表示／非表示を決める。
function updateVisibility() {
  const normalizedQuery = normalizeForSearch(searchQuery);
  const sets = { pickedIds: new Set(pickedIds), favoriteIds, importedIds };
  const isNarrowed = normalizedQuery !== "" || activeFilter !== PICK_FILTERS.ALL;
  let visibleCount = 0;

  elements.groupsContainer.querySelectorAll(".song-pick-group").forEach((groupElement) => {
    let groupVisible = false;
    groupElement.querySelectorAll(".song-pick-row").forEach((row) => {
      const title = row.querySelector(".song-pick-title").textContent;
      const visible =
        songMatchesSearch(title, row.dataset.searchReading, JSON.parse(row.dataset.searchAliases), normalizedQuery) &&
        songMatchesPickFilter(row.dataset.songId, activeFilter, sets);
      row.hidden = !visible;
      if (visible) {
        groupVisible = true;
        visibleCount += 1;
      }
    });
    groupElement.hidden = !groupVisible;
    // 絞り込んでいる間は、当てはまる曲のある作品を開いて見せる（閉じたままだと「無い」ように見えるため）
    if (groupVisible && isNarrowed) {
      groupElement.classList.add("is-open");
      groupElement.querySelector(".single-group-header").setAttribute("aria-expanded", "true");
    }
  });

  elements.noResultsNotice.hidden = visibleCount > 0;
  elements.noResultsNotice.textContent =
    activeFilter === PICK_FILTERS.PICKED && normalizedQuery === ""
      ? "まだ曲を選んでいません"
      : activeFilter === PICK_FILTERS.FAVORITES && normalizedQuery === ""
        ? "お気に入りの曲がありません"
        : "該当する曲が見つかりませんでした";
  elements.visibleCount.textContent = isNarrowed ? `${visibleCount}曲が当てはまります` : `全${visibleCount}曲`;

  // 「表示中の曲を全部選ぶ」：見えている曲が全部選ばれていたら「表示中の選択を外す」に変える
  const visibleIds = visibleSongIds();
  const allVisiblePicked = visibleIds.length > 0 && visibleIds.every((id) => sets.pickedIds.has(id));
  elements.selectVisibleButton.textContent = allVisiblePicked
    ? "表示中の選択を外す"
    : isNarrowed
      ? `表示中の${visibleIds.length}曲を全部選ぶ`
      : "全曲を選ぶ";
  elements.selectVisibleButton.disabled = visibleIds.length === 0;
  elements.selectVisibleButton.dataset.mode = allVisiblePicked ? "remove" : "add";
}

function visibleSongIds() {
  return [...elements.groupsContainer.querySelectorAll(".song-pick-row")]
    .filter((row) => !row.hidden && !row.closest(".song-pick-group").hidden)
    .map((row) => row.dataset.songId);
}

function updateBar() {
  const counts = countPlayablePicked(pickedIds, importedIds);
  const summary = describePickedSummary(counts);
  elements.barMain.textContent = summary.main;
  elements.barSub.textContent = summary.sub;
  elements.barSub.hidden = summary.sub === "";
  elements.bar.classList.toggle("is-empty", counts.total === 0);
  elements.clearButton.disabled = counts.total === 0;
  elements.playButton.disabled = counts.playable === 0;
  elements.shuffleButton.disabled = counts.playable < 2; // 1曲ではシャッフルの意味が無い
  elements.playlistButton.disabled = counts.total === 0;
  elements.favoriteButton.disabled = counts.total === 0;
  updateBottomSpacer();
}

function refreshSelectionUI() {
  refreshRows();
  updateVisibility();
  updateBar();
}

// 下の帯に最後の曲が隠れないよう、帯の高さだけ一覧の下に余白を取る。
function updateBottomSpacer() {
  if (elements.bar.hidden) return;
  elements.bottomSpacer.style.height = `${Math.ceil(elements.bar.getBoundingClientRect().height) + 24}px`;
}

function setFilter(filter) {
  activeFilter = filter;
  elements.filterButtons.forEach((button) => {
    const active = button.dataset.filter === filter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateVisibility();
}

// ---- 短い案内（帯の上に出す。追加の結果と「元に戻す」「見る」） ----

function showToast(message, action = null) {
  elements.toastText.textContent = message;
  elements.toastAction.hidden = !action;
  elements.toastAction.textContent = action?.label ?? "";
  elements.toastAction.onclick = action
    ? () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        hideToast();
        action.onClick();
      }
    : null;
  elements.toast.hidden = false;
  if (toastTimeoutId !== null) clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(hideToast, action ? TOAST_DISPLAY_MS + 2000 : TOAST_DISPLAY_MS);
  updateBottomSpacer();
}

function hideToast() {
  if (toastTimeoutId !== null) clearTimeout(toastTimeoutId);
  toastTimeoutId = null;
  elements.toast.hidden = true;
  updateBottomSpacer();
}

// ---- お気に入りへ ----

function addPickedToFavorites() {
  const { toAdd, already } = splitForBulkAdd(pickedIds, getFavoriteSongIds());
  if (toAdd.length > 0) addFavoriteSongs(toAdd);
  favoriteIds = new Set(getFavoriteSongIds());
  refreshSelectionUI();
  const message = describeBulkAddResult("お気に入り", toAdd.length, already.length);
  showToast(
    message,
    toAdd.length > 0
      ? {
          label: "元に戻す",
          onClick: () => {
            removeFavoriteSongs(toAdd); // 今回足した曲だけを外す（前から入っていた曲は触らない）
            favoriteIds = new Set(getFavoriteSongIds());
            refreshSelectionUI();
            showToast(`お気に入りへの追加（${toAdd.length}曲）を取り消しました`);
          },
        }
      : null
  );
}

// ---- プレイリストへ ----

function renderPlaylistOptions() {
  const playlists = getPlaylists();
  elements.playlistLead.textContent = `選んだ${pickedIds.length}曲を、どのプレイリストに入れますか？（もう入っている曲は二重に入りません）`;
  elements.playlistOptions.innerHTML = "";
  elements.playlistNone.hidden = playlists.length > 0;
  playlists.forEach((playlist) => {
    const { toAdd, already } = splitForBulkAdd(pickedIds, playlist.songIds);
    const name = playlist.playlistName || "（名前未設定）";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "song-pick-playlist-option";
    button.disabled = toAdd.length === 0;
    const nameElement = document.createElement("b");
    nameElement.textContent = name;
    const detail = document.createElement("small");
    detail.textContent =
      toAdd.length === 0
        ? `${playlist.songIds.length}曲・選んだ曲は全部入っています`
        : already.length > 0
          ? `${playlist.songIds.length}曲・${toAdd.length}曲を追加（${already.length}曲は入っています）`
          : `${playlist.songIds.length}曲・${toAdd.length}曲を追加`;
    button.append(nameElement, detail);
    button.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CONFIRM);
      addPickedToPlaylist(playlist.playlistId, name);
    });
    elements.playlistOptions.appendChild(button);
  });
}

function addPickedToPlaylist(playlistId, name) {
  const playlist = getPlaylists().find((entry) => entry.playlistId === playlistId);
  const { already } = splitForBulkAdd(pickedIds, playlist ? playlist.songIds : []);
  const addedCount = addSongsToPlaylist(playlistId, pickedIds);
  closePlaylistModal();
  showToast(describeBulkAddResult(`「${name}」`, addedCount, already.length), {
    label: "見る",
    onClick: () => elements.onOpenPlaylist(playlistId),
  });
}

function openPlaylistModal() {
  renderPlaylistOptions();
  elements.playlistNewName.value = "";
  elements.playlistCreateButton.disabled = true;
  elements.playlistModal.hidden = false;
  const first = elements.playlistOptions.querySelector("button:not(:disabled)") ?? elements.playlistNewName;
  first.focus();
}

function closePlaylistModal() {
  elements.playlistModal.hidden = true;
  elements.playlistButton.focus();
}

function commitCreatePlaylist() {
  const name = elements.playlistNewName.value.trim();
  if (!name) return;
  playSfx(SFX_EVENTS.UI_CONFIRM);
  const created = createPlaylist(name);
  addPickedToPlaylist(created.playlistId, created.playlistName);
}

// ---- 再生 ----

function play(shuffle) {
  const songs = resolvePickedSongs(pickedIds, getSongById);
  if (songs.length === 0) return;
  playSfx(SFX_EVENTS.UI_CONFIRM);
  elements.onPlay(songs, shuffle);
}

// ---- 公開する関数 ----

// この画面を開くたびに呼ぶ。保存してある「選んだ曲」を読み直し、音源の有無・お気に入りを確かめてから組み立てる。
export async function openSongPickScreen() {
  pickedIds = loadPickedSongIds().filter((id) => KNOWN_SONG_IDS.has(id));
  favoriteIds = new Set(getFavoriteSongIds());
  try {
    importedIds = new Set(await getImportedSongIds());
  } catch {
    importedIds = new Set();
  }
  searchQuery = "";
  elements.searchInput.value = "";
  elements.searchClearButton.hidden = true;
  hideToast();
  renderGroups();
  setFilter(PICK_FILTERS.ALL);
  refreshSelectionUI();
}

// 画面の切り替えのたびに main.js から呼ぶ。この画面のときだけ下の帯を出す。
export function setSongPickBarVisible(visible) {
  elements.bar.hidden = !visible;
  if (!visible) {
    hideToast();
    elements.playlistModal.hidden = true;
  } else {
    updateBottomSpacer();
  }
}

// elements: {
//   groupsContainer, noResultsNotice, visibleCount, selectVisibleButton, bottomSpacer: 一覧,
//   searchInput, searchClearButton: 曲名検索, filterButtons: 絞り込み（配列）,
//   bar, barMain, barSub, clearButton, playButton, shuffleButton, playlistButton, favoriteButton: 下の帯,
//   toast, toastText, toastAction: 帯の上の短い案内,
//   playlistModal, playlistLead, playlistOptions, playlistNone, playlistNewName, playlistCreateButton, playlistCancelButton: プレイリストの選択,
//   onPlay(songs, shuffle): 再生を始めて連続再生の画面へ, onOpenPlaylist(playlistId): プレイリストの詳細を開く,
// }
export function initSongPickScreen(newElements) {
  elements = newElements;

  elements.searchInput.addEventListener("input", () => {
    searchQuery = elements.searchInput.value;
    elements.searchClearButton.hidden = searchQuery === "";
    updateVisibility();
  });
  bindSearchInputKeyboardAvoidance(elements.searchInput, elements.searchInput.closest(".search-field-row"));
  elements.searchClearButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    searchQuery = "";
    elements.searchInput.value = "";
    elements.searchClearButton.hidden = true;
    updateVisibility();
    elements.searchInput.focus();
  });

  elements.filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      setFilter(button.dataset.filter);
    });
  });

  elements.selectVisibleButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const ids = visibleSongIds();
    if (elements.selectVisibleButton.dataset.mode === "remove") {
      setPicked(removePickedSongs(pickedIds, ids));
    } else {
      setPicked(addPickedSongs(pickedIds, ids));
    }
  });

  // 全部解除：うっかり押しても戻せるよう「元に戻す」を出す
  elements.clearButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const before = pickedIds;
    setPicked([]);
    showToast(`選んでいた${before.length}曲を解除しました`, {
      label: "元に戻す",
      onClick: () => setPicked(before),
    });
  });

  elements.playButton.addEventListener("click", () => play(false));
  elements.shuffleButton.addEventListener("click", () => play(true));
  elements.favoriteButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    addPickedToFavorites();
  });
  elements.playlistButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openPlaylistModal();
  });

  elements.playlistNewName.addEventListener("input", () => {
    elements.playlistCreateButton.disabled = elements.playlistNewName.value.trim() === "";
  });
  elements.playlistNewName.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing) commitCreatePlaylist();
  });
  elements.playlistCreateButton.addEventListener("click", commitCreatePlaylist);
  elements.playlistCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closePlaylistModal();
  });
  // 外側（暗い所）を押したら閉じる・Esc でも閉じる
  elements.playlistModal.addEventListener("click", (event) => {
    if (event.target === elements.playlistModal) closePlaylistModal();
  });
  elements.playlistModal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePlaylistModal();
  });

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(updateBottomSpacer).observe(elements.bar);
  }
}
