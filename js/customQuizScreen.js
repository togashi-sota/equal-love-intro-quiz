// オリジナル問題作成モードの選曲画面を担当するファイル。
// 好きな曲にチェックを入れて、自分専用の問題セットを作れる。
// 曲の一覧・グルーピングは収録曲一覧（songlist.js）の区分ルールをそのまま再利用する。
// 各曲の試聴（再生ボタン＋共通ミニプレイヤー）は、収録曲一覧の試聴処理から切り出した
// audioPreview.jsを再利用し、ここでは「行の再生ボタン⇔ミニプレイヤー」のUIをつなぐだけにする。
//
// この画面は、「＋新しいセットを作る」（新規作成）と「保存済みプリセットを開く」の
// 両方から共用で開く。どちらの場合も、セット名・メモ・ダミー選択肢モード・選択曲を
// 編集できる。新規作成では「保存する」（常に新規追加）、既存プリセットを開いた場合は
// 「上書き保存する」（同じidのまま更新）と「このセットを削除する」を表示する。

import { SONGS } from "./data/songs.js";
import { buildSongGroups, CATEGORY_PILL_INFO, normalizeForSearch, songMatchesSearch } from "./songlist.js";
import { hasAudioSource } from "./data/audioMetadata.js";
import { MIN_SONGS_REQUIRED } from "./quiz.js";
import { attemptSilentUnlock } from "./audio.js";
import {
  PREVIEW_SEEK_SKIP_SECONDS,
  initAudioPreview,
  getPreviewAudioElement,
  playAudioPreview,
  pauseAudioPreview,
  resumeAudioPreview,
  seekAudioPreview,
  stopAudioPreview,
} from "./audioPreview.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { openFullscreenLyrics } from "./lyricsFullscreen.js";
import { CUSTOM_QUIZ_TYPE } from "./customQuizPresets.js";
// この画面内で完結する操作（曲選択・アコーディオン開閉・削除確認モーダル等）に効果音を鳴らすため追加。
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import {
  getLyricsQuizRevealAudioEnabled,
  setLyricsQuizRevealAudioEnabled,
  getInstantChallengeRevealAudioEnabled,
  setInstantChallengeRevealAudioEnabled,
  initRevealAudioToggle,
  syncRevealAudioToggle,
} from "./revealAudioPreference.js";

// この画面が使うDOM要素一式。initCustomQuizScreen()で受け取って保持する。
let elements = null;

// 今チェックが入っている曲IDの集合。
const selectedSongIds = new Set();

// 【2026-08-29追加、本人指示（⑭）】今この画面が編集・作成しているセットの種類。
// customQuizTypeSelectScreen（js/main.js）で選ばれた種類、または既存プリセットを開いた
// ときのpreset.quizTypeが反映される。この値だけで「ダミー選択肢／回答方式のどちらの
// 欄を出すか」「保存・開始時にどちらの項目を含めるか」を判断する。
let currentQuizType = CUSTOM_QUIZ_TYPE.INTRO;

export function setCustomQuizType(quizType) {
  currentQuizType = quizType;
}

export function getCustomQuizType() {
  return currentQuizType;
}

// 直前に「開始する」を押したときの選択内容。結果画面の「もう一度挑戦する」から
// 同じ内容で再開できるよう、main.js側から参照できるようにしておく。
let lastStartedSongIds = [];
let lastStartedDistractorMode = "selected";
let lastStartedAnswerPoolSizeValue = "4";
// 一瞬チャレンジタイプだけが使う再生時間（2026-08-30追加、本人指示：後半②）。
let lastStartedPlayDurationValue = "1.5";

// 今、既存のどのプリセットを開いているか（新規作成中はnull）。
// 上書き保存・削除の対象を特定するために使う。
let currentEditingPresetId = null;

// 曲名検索の検索語と、「選択済みの曲だけ表示」トグルの状態。
// どちらも表示（どの行・シングルを見せるか）だけに関わり、選択状態そのものには影響しない。
let searchQuery = "";
let showSelectedOnly = false;

// 今、試聴の対象になっている（再生中・一時停止中を問わず）行のDOM要素。
// 何も試聴していないときはnull。ミニプレイヤーの表示/非表示・行のアイコン切り替えに使う。
let currentlyPreviewingRowElement = null;

// 秒数を「分:秒」の表示用文字列にする（例: 65秒 → "1:05"）。songlist.jsのformatTime()と同じ考え方。
function formatTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// 選択数・4曲未満の案内・開始/保存ボタンの有効/無効を、今の選択状況に合わせて更新する。
function updateSelectionSummary() {
  const count = selectedSongIds.size;
  elements.selectedCountValue.textContent = count;

  const hasEnoughSongs = count >= MIN_SONGS_REQUIRED;
  elements.minNotice.hidden = hasEnoughSongs;
  elements.startButton.disabled = !hasEnoughSongs;
  elements.saveButton.disabled = !hasEnoughSongs;
}

// シングルごとの見出しに添える「選択数/曲数」表示を、今のチェック状況に合わせて更新する。
function updateGroupSelectionCounts() {
  elements.groupsContainer.querySelectorAll(".single-group").forEach((groupElement) => {
    const checkboxes = [...groupElement.querySelectorAll('input[type="checkbox"]')];
    const selectedCount = checkboxes.filter((checkbox) => checkbox.checked).length;
    groupElement.querySelector(".track-count-chip").textContent = `${selectedCount}/${checkboxes.length}曲選択`;
  });
}

// 曲名検索・「選択済みの曲だけ表示」の条件に合わせて、各曲行・シングル区分の表示/非表示を更新する。
// どちらの条件も満たす行だけを表示し（AND条件）、表示する行が1つもないシングルは区分ごと隠す。
// 絞り込みに一致した区分は、閉じたままだと該当の曲が見えないため自動的に開く
// （一致しなくなったからといって、開いた区分を自動的に閉じることはしない）。
// 曲名・読み仮名の一致判定は、収録曲一覧（songlist.js）のsongMatchesSearch()をそのまま使う。
// 2画面で判定ロジックを別々に持たないことで、将来どちらかだけ仕様が
// ずれることを防いでいる。検索結果が1曲もないときは、案内文
// （#custom-quiz-no-results-notice）を表示する。
// 試聴中の曲の行が絞り込みで非表示になった場合は、行が見えないままミニプレイヤーだけ
// 残ると分かりにくいため、試聴自体を止めてミニプレイヤーも閉じる。
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
    if (hasVisibleRow && hasActiveFilter) {
      groupElement.classList.add("is-open");
    }
    if (hasVisibleRow) hasAnyVisibleRow = true;
  });

  elements.noResultsNotice.hidden = hasAnyVisibleRow;

  if (currentlyPreviewingRowElement && currentlyPreviewingRowElement.hidden) {
    stopPreviewAndResetUI();
  }
}

// 選択状況が変わるすべての操作（チェック・全選択・全解除）の後に呼ぶ共通処理。
// 3つの表示（選択数サマリー・シングルごとの選択数・絞り込み表示）は常に連動して更新する。
function refreshSelectionUI() {
  updateSelectionSummary();
  updateGroupSelectionCounts();
  updateRowVisibility();
}

// ===== 試聴（共通ミニプレイヤー） =====
// 各曲の行には再生ボタンだけを置き、実際の操作（一時停止・再開・シーク・現在位置の確認）は
// 画面上部の共通ミニプレイヤーに集約する。同時に再生される曲は常に1曲だけ
// （audioPreview.jsのplayAudioPreview()が、新しい曲を再生する前に必ず前の曲を止める）。

// 今の再生/一時停止の状態を、試聴中の行とミニプレイヤーの両方に反映する。
// 「再生中かどうか」は常にaudioElement.pausedの実際の値から判定するため、
// クリック直後の一瞬のズレが起きない（play/pauseイベントから呼ぶことで、常に実態と一致させる）。
function syncPlayingVisual() {
  const audio = getPreviewAudioElement();
  const isPlaying = audio ? !audio.paused : false;
  if (currentlyPreviewingRowElement) {
    currentlyPreviewingRowElement.classList.toggle("is-playing", isPlaying);
  }
  elements.previewPlayer.classList.toggle("is-playing", isPlaying);
}

// 試聴対象の行を切り替える。rowを指定した場合は、ミニプレイヤー自体をその行の直後へ
// 移動してから表示する（同じ要素を使い回すため、複数箇所に重複して表示されることはない）。
// rowがnullなら「何も試聴していない」状態にし、ミニプレイヤーを隠す
// （隠すだけで、直前にいた場所からは動かさない。hidden中は位置自体に意味がないため）。
function setPreviewingRow(row) {
  if (currentlyPreviewingRowElement && currentlyPreviewingRowElement !== row) {
    currentlyPreviewingRowElement.classList.remove("is-playing");
  }
  currentlyPreviewingRowElement = row;
  if (row) {
    row.insertAdjacentElement("afterend", elements.previewPlayer);
    elements.previewPlayer.hidden = false;
  } else {
    elements.previewPlayer.hidden = true;
  }
  syncPlayingVisual();
}

// 指定した曲の試聴を新しく始める。すでに別の曲を試聴中でも自動的に切り替わる
// （playAudioPreview内部で必ず前の曲を止めるため）。
async function startPreviewForRow(song, row) {
  setPreviewingRow(null);
  const started = await playAudioPreview(song);
  if (!started) return; // 未読み込みの曲は、収録曲一覧の試聴と同じく静かに何もしない
  elements.previewTitle.textContent = song.title;
  setPreviewingRow(row);

  // 歌詞データがある曲だけ、同期歌詞パネルを表示する（ない曲では静かに何もしない）。
  // 全画面表示ボタンも、実際に歌詞データが見つかった曲だけ表示する
  // （曲IDのハードコードではなく、データの有無で自動判定する。2026-08-03）。
  elements.previewFullscreenButton.hidden = true;
  loadLyricsForSong(song.id, elements.previewAudioElement, elements.previewLyricsPanel).then((lyricsFound) => {
    if (currentlyPreviewingRowElement !== row) return; // 切り替わった後の古い結果は無視する
    elements.previewFullscreenButton.hidden = !lyricsFound;
  });
}

// 曲行の再生ボタンが押されたときの処理。
// 今まさに試聴中の行をもう一度押した場合は一時停止/再開を切り替え、
// 別の行（または何も試聴していない状態）から押した場合はその曲の試聴を新しく始める。
function handlePreviewButtonClick(song, row) {
  playSfx(SFX_EVENTS.UI_CLICK);
  if (currentlyPreviewingRowElement === row) {
    const audio = getPreviewAudioElement();
    if (audio.paused) {
      resumeAudioPreview();
    } else {
      pauseAudioPreview();
    }
    return;
  }
  startPreviewForRow(song, row);
}

// 試聴を完全に停止し、行・ミニプレイヤーの表示も元に戻す。
// 画面を離れるとき（戻る）・クイズを開始するとき・保存するときに呼ぶ。
// 同期歌詞パネル（js/lyricsSync.js）の後片付けも、必ずここで一緒に行う。
function stopPreviewAndResetUI() {
  stopAudioPreview();
  destroyLyricsSync();
  setPreviewingRow(null);
}

// main.js側（選曲画面の「戻る」ボタン）から、画面を離れる際に試聴を止めるために呼ぶ。
export function stopCustomQuizPreview() {
  stopPreviewAndResetUI();
}

// 1曲分のチェック行を作る。
// チェック部分（<label>）と試聴ボタンを兄弟要素として分けている（ボタンをlabelの中に
// 入れると、試聴ボタンを押したときにチェックボックスまで反応してしまうため。
// プリセットカードの複数ボタンと同じ理由）。行のどこをタップしてもチェックできる範囲は
// .song-select-labelの中だけになる。
function createSongSelectRow(song) {
  const row = document.createElement("div");
  row.className = "song-select-row";
  // 曲名検索で読み仮名・別名（愛称）も対象にできるよう、行のdata属性に持たせておく
  // （読み仮名を持たない曲はsong.searchReadingがundefinedなので、空文字列にしておく。
  // 別名は文字列と{ text, reading }オブジェクトが混在する配列のため、JSON文字列として
  // 保持する。songlist.jsの収録曲一覧の行と同じパターン）。
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

  // 試聴ボタン。アイコンは収録曲一覧の再生ボタンと同じSVG・同じクラス名(.play-button)を
  // 再利用し、見た目・is-playing時のアイコン切り替えの仕組みをそのまま流用する。
  // 音源がまだ存在しない曲では、収録曲一覧（songlist.js）と同じ考え方で、押せるように
  // 見えるボタンを出さない（本人指示・2026-08-17。曲名のハードコードではなく
  // hasAudioSource()＝AUDIO_METADATAの有無で判定するため、22nd以降でも自動的に揃う）。
  let previewButton;
  if (hasAudioSource(song)) {
    previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "play-button";
    previewButton.setAttribute("aria-label", `${song.title}を試聴`);
    previewButton.innerHTML = `
      <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>
      <svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
    `;
    previewButton.addEventListener("click", () => handlePreviewButtonClick(song, row));
  } else {
    previewButton = document.createElement("span");
    previewButton.className = "play-button play-button-placeholder";
    previewButton.setAttribute("aria-hidden", "true");
  }

  row.appendChild(label);
  row.appendChild(previewButton);

  return row;
}

// 1つのシングル区分（アコーディオン1つ分）を作る。
// 「開閉」「全選択」「全解除」を別々の操作領域（3つの兄弟ボタン）に分け、
// ボタンの中にボタンを入れる（HTML上できない）ことを避けている。
function createSingleGroupElement(group, isInitiallyOpen) {
  const groupElement = document.createElement("div");
  groupElement.className = "single-group";
  groupElement.classList.toggle("is-open", isInitiallyOpen);

  const rowsContainer = document.createElement("div");
  rowsContainer.className = "single-group-tracks";
  group.songs.forEach((song) => {
    rowsContainer.appendChild(createSongSelectRow(song));
  });

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
    // 試聴中の曲を含む区分を閉じるときは、行が見えなくなるミニプレイヤーだけが残らないよう、
    // 収録曲一覧（songlist.js）の試聴と同じ考え方で必ず試聴を止める。
    const willClose = groupElement.classList.contains("is-open");
    if (willClose && currentlyPreviewingRowElement && groupElement.contains(currentlyPreviewingRowElement)) {
      stopPreviewAndResetUI();
    }
    groupElement.classList.toggle("is-open");
  });

  // 全選択・全解除。すでに全選択済み/全解除済みの状態で押しても、Setへの追加・削除は
  // 何も選ばれていない/すでに選ばれている項目に対しては単に無視されるだけなので、
  // 特別なエラー処理を書かなくても安全に動く。
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

// 曲の一覧を組み立てる。曲データ自体は固定なので、アプリ起動時に一度だけ呼べばよい
// （収録曲一覧のrenderSongList()と同じ考え方）。
function renderGroups() {
  const groups = buildSongGroups(SONGS);
  const newestGroup = groups[0];

  elements.groupsContainer.innerHTML = "";
  groups.forEach((group) => {
    elements.groupsContainer.appendChild(createSingleGroupElement(group, group === newestGroup));
  });
}

// チェック状態を、指定した曲IDの集合に合わせて反映する。
// あわせて、選択中の曲を含むシングル区分だけを開いた状態にする（何を選んだか見えるように）。
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

// 画面全体を対象にした「全曲選択」「全曲解除」。シングルごとの全選択/全解除と同じ考え方で、
// 絞り込み表示（検索・選択済みのみ表示）で今は隠れている曲も含め、全曲を対象にする
// （絞り込み中だけ選択できる曲が変わるのは分かりにくいため）。
function handleSelectAllSongs() {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.groupsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = true;
    selectedSongIds.add(checkbox.value);
  });
  refreshSelectionUI();
}

function handleDeselectAllSongs() {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.groupsContainer.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = false;
    selectedSongIds.delete(checkbox.value);
  });
  refreshSelectionUI();
}

// 今の種類（currentQuizType）に応じて、カテゴリー（ダミー選択肢母集団）／回答方式／
// 一瞬チャレンジ専用設定のどれを見せるかを切り替える（2026-08-29追加・2026-08-30改訂・
// 2026-10-01改訂、本人指示）。
// 【2026-10-01改訂・本人指示：歌詞クイズ・一瞬チャレンジも不正解候補プールバグを修正】
// 以前はdistractorModeFieldset（カテゴリー：表題曲のみ/表題曲＋全員曲/全曲）を歌詞クイズ・
// 一瞬チャレンジタイプでは隠していたが、この2タイプも「選んだ曲だけ」が回答候補の母集団に
// なってしまうバグがあったため、イントロ・ランダム再生・アウトロと同じくすべてのタイプで
// 表示するようにした（js/lyricsQuizScreen.js・js/instantChallengeScreen.js参照）。
function updateQuizTypeFieldsetVisibility() {
  const isLyrics = currentQuizType === CUSTOM_QUIZ_TYPE.LYRICS_QUIZ;
  const isInstant = currentQuizType === CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE;
  elements.distractorModeFieldset.hidden = false;
  elements.answerPoolSizeFieldset.hidden = !isLyrics;
  elements.instantDurationFieldset.hidden = !isInstant;
  elements.instantAnswerPoolSizeFieldset.hidden = !isInstant;
  // 【2026-11-XX新設・本人指示：最優先1】正解発表の音源ON/OFFも、他の出題形式専用欄と
  // 同じ考え方で出し分ける。この画面は開き直すたびにこの関数が呼ばれるため、通常の
  // 設定画面側で値が変わっていた場合でも、ここで毎回チェック状態を保存値へ合わせ直す
  // （本人指示：「歌詞クイズと一瞬チャレンジを1つの共通設定にまとめず」＝同じ形式なら
  // 通常／オリジナル問題作成のどちらで変えても同じ値を指すべき、という要件を満たすため）。
  if (elements.lyricsRevealAudioFieldset) {
    elements.lyricsRevealAudioFieldset.hidden = !isLyrics;
    syncRevealAudioToggle('input[name="custom-quiz-lyrics-reveal-audio"]', getLyricsQuizRevealAudioEnabled);
  }
  if (elements.instantRevealAudioFieldset) {
    elements.instantRevealAudioFieldset.hidden = !isInstant;
    syncRevealAudioToggle('input[name="custom-quiz-instant-reveal-audio"]', getInstantChallengeRevealAudioEnabled);
  }
}

// 「この曲でクイズを始める」が押されたときの処理。今の選択内容を記憶したうえで、
// onStartコールバックに渡す（実際にクイズを組み立てて開始する処理はmain.js側が担当する）。
// クイズを開始する前に、試聴が鳴りっぱなしにならないよう必ず止める。
// 【2026-08-29改訂】歌詞クイズタイプはanswerPoolSizeValueを、それ以外はdistractorModeを
// 第2引数として渡す（main.js側がgetCustomQuizType()を見てどちらの意味か判断する）。
function handleStart() {
  // 【2026-09-15追加・本人指示：アプリ起動後最初の第1問だけ無音になるバグ対策】
  attemptSilentUnlock();
  stopPreviewAndResetUI();
  lastStartedSongIds = [...selectedSongIds];
  // 【2026-10-01追加・本人指示】歌詞クイズ・一瞬チャレンジタイプも、選んだ曲とは別に
  // 「不正解候補を含む選択肢全体の母集団」としてカテゴリーを使うようにしたため、
  // どちらのタイプでもdistractorModeを読み取っておく。
  lastStartedDistractorMode = document.querySelector('input[name="custom-quiz-distractor-mode"]:checked').value;
  if (currentQuizType === CUSTOM_QUIZ_TYPE.LYRICS_QUIZ) {
    lastStartedAnswerPoolSizeValue = document.querySelector('input[name="custom-quiz-answer-pool-size"]:checked').value;
    elements.onStart(lastStartedSongIds, {
      answerPoolSizeValue: lastStartedAnswerPoolSizeValue,
      distractorMode: lastStartedDistractorMode,
    });
    return;
  }
  if (currentQuizType === CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE) {
    lastStartedPlayDurationValue = document.querySelector('input[name="custom-quiz-instant-play-duration"]:checked').value;
    lastStartedAnswerPoolSizeValue = document.querySelector('input[name="custom-quiz-instant-answer-pool-size"]:checked').value;
    elements.onStart(lastStartedSongIds, {
      playDurationValue: lastStartedPlayDurationValue,
      answerPoolSizeValue: lastStartedAnswerPoolSizeValue,
      distractorMode: lastStartedDistractorMode,
    });
    return;
  }
  elements.onStart(lastStartedSongIds, lastStartedDistractorMode);
}

// 「保存する」／「上書き保存する」が押されたときの処理。
// セット名が未入力なら保存せず、案内を表示する。
// 新規作成中（currentEditingPresetIdがnull）はonSave、既存プリセットを開いている場合は
// onUpdateを呼び、呼び出し先（main.js）でcustomQuizPresets.jsへの実際の保存を行う。
// 保存後は一覧画面へ戻るため、ここでも試聴を止めておく。
function handleSave() {
  const name = elements.nameInput.value.trim();
  if (name === "") {
    elements.nameError.hidden = false;
    return;
  }
  elements.nameError.hidden = true;
  stopPreviewAndResetUI();

  const memo = elements.memoInput.value.trim();
  const distractorMode = document.querySelector('input[name="custom-quiz-distractor-mode"]:checked').value;
  const isInstant = currentQuizType === CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE;
  const answerPoolSizeValue = isInstant
    ? document.querySelector('input[name="custom-quiz-instant-answer-pool-size"]:checked').value
    : document.querySelector('input[name="custom-quiz-answer-pool-size"]:checked').value;
  const playDurationValue = isInstant
    ? document.querySelector('input[name="custom-quiz-instant-play-duration"]:checked').value
    : undefined;
  const presetData = {
    name,
    memo,
    songIds: [...selectedSongIds],
    distractorMode,
    quizType: currentQuizType,
    answerPoolSizeValue,
    playDurationValue,
  };

  if (currentEditingPresetId === null) {
    elements.onSave(presetData);
  } else {
    elements.onUpdate(currentEditingPresetId, presetData);
  }
}

// 「このセットを削除する」が押されたときの処理。確認モーダルを経由する。
function handleDeleteButtonClick() {
  playSfx(SFX_EVENTS.UI_CLICK);
  elements.deleteConfirmModal.hidden = false;
}

function closeDeleteConfirmModal() {
  elements.deleteConfirmModal.hidden = true;
}

// 【二重再生防止】削除の実行自体はelements.onDelete（main.js側）が担っており、
// そちらの先頭で既にplaySfx(UI_CLICK)を鳴らしているため、ここでは重ねて鳴らさない。
function handleDeleteConfirmed() {
  closeDeleteConfirmModal();
  elements.onDelete(currentEditingPresetId);
}

// 「複製する」が押されたときの処理（既存プリセットを開いているときだけ表示・利用可能）。
// 複製の実処理（customQuizPresets.jsへの保存）自体はmain.js側が担当する。
function handleDuplicateButtonClick() {
  elements.onDuplicate(currentEditingPresetId);
}

// 結果画面の「もう一度挑戦する」から、直前と同じ選択内容・ダミー選択肢モード（または
// 回答方式）で再開できるようにするための参照用。呼び出し側（main.js）がgetCustomQuizType()と
// あわせて見て、どちらの値を使うか判断する。
export function getLastStartedCustomQuizSelection() {
  return {
    songIds: lastStartedSongIds,
    distractorMode: lastStartedDistractorMode,
    answerPoolSizeValue: lastStartedAnswerPoolSizeValue,
    playDurationValue: lastStartedPlayDurationValue,
  };
}

// プリセット一覧から選曲画面を経由せず直接クイズを始めた場合など、この画面を経由しない
// 開始方法でも「もう一度挑戦する」が正しい内容を再開できるよう、直前の開始内容を
// 外部から更新できるようにしておく。第3引数（answerPoolSizeValue）は歌詞クイズ・一瞬
// チャレンジタイプのときだけ渡す想定、第4引数（playDurationValue）は一瞬チャレンジタイプの
// ときだけ渡す想定（どちらも省略時は直前の値のまま）。
export function setLastStartedCustomQuizSelection(songIds, distractorMode, answerPoolSizeValue, playDurationValue) {
  lastStartedSongIds = songIds;
  lastStartedDistractorMode = distractorMode;
  if (answerPoolSizeValue !== undefined) lastStartedAnswerPoolSizeValue = answerPoolSizeValue;
  if (playDurationValue !== undefined) lastStartedPlayDurationValue = playDurationValue;
}

// 検索語・「選択済みの曲だけ表示」を初期状態（絞り込みなし）に戻す。
// 前回開いたときの絞り込みを持ち越すと、曲が探しにくいままになる/選択済みがないのに
// 絞り込んだままで曲一覧が空に見える、といった分かりにくさにつながるため、
// 画面を開くたびに必ずリセットする。
function resetFilters() {
  searchQuery = "";
  elements.searchInput.value = "";
  elements.searchClearButton.hidden = true;
  showSelectedOnly = false;
  elements.selectedOnlyCheckbox.checked = false;
}

// 「＋新しいセットを作る」から開いたときの初期状態にする（空の選択、名前・メモも空欄）。
// quizType（2026-08-29追加）：直前に選択画面（js/main.jsのcustom-quiz-type-select-screen）で
// 選んだ種類。省略時はcurrentQuizTypeを変えない（保存済みプリセットの複製直後など、
// 既にcurrentQuizTypeが正しく設定されている呼び出し元向けの後方互換）。
export function openCustomQuizScreenForNewPreset(quizType) {
  if (quizType !== undefined) currentQuizType = quizType;
  updateQuizTypeFieldsetVisibility();
  currentEditingPresetId = null;
  stopPreviewAndResetUI(); // 前回この画面を開いたときの試聴が残っていないよう、念のため止めておく
  resetFilters();
  applyCheckedState([]);
  elements.groupsContainer.querySelectorAll(".single-group").forEach((groupElement, index) => {
    groupElement.classList.toggle("is-open", index === 0);
  });
  // 【2026-10-01改訂】distractorModeの選択肢を「選択した曲だけ／全収録曲」から
  // カテゴリー3択（表題曲のみ／表題曲＋全員曲／全曲）へ変更したことに伴い、初期値も
  // 新しい選択肢の1つ（表題曲のみ）に合わせる。
  document.querySelector('input[name="custom-quiz-distractor-mode"][value="title-track"]').checked = true;
  document.querySelector('input[name="custom-quiz-answer-pool-size"][value="4"]').checked = true;
  document.querySelector('input[name="custom-quiz-instant-play-duration"][value="1.5"]').checked = true;
  document.querySelector('input[name="custom-quiz-instant-answer-pool-size"][value="4"]').checked = true;

  elements.nameInput.value = "";
  elements.memoInput.value = "";
  elements.nameError.hidden = true;
  elements.saveButton.textContent = "セットを保存する";
  elements.deleteButton.hidden = true;
  elements.duplicateButton.hidden = true;

  refreshSelectionUI();
}

// 保存済みのプリセットを開いたときの状態にする。その内容（曲・名前・メモ・
// ダミー選択肢モードまたは回答方式）で編集欄を埋め、「上書き保存する」「このセットを削除する」を
// 表示する。quizTypeはプリセット自身が持つ値をそのまま使う（編集画面で種類自体は変更できない）。
export function openCustomQuizScreenForPreset(preset) {
  currentQuizType = preset.quizType;
  updateQuizTypeFieldsetVisibility();
  currentEditingPresetId = preset.id;
  stopPreviewAndResetUI(); // 前回この画面を開いたときの試聴が残っていないよう、念のため止めておく
  resetFilters();
  applyCheckedState(preset.songIds);

  const distractorRadio = document.querySelector(
    `input[name="custom-quiz-distractor-mode"][value="${preset.distractorMode}"]`
  );
  if (distractorRadio) {
    distractorRadio.checked = true;
  }
  const answerPoolSizeRadio = document.querySelector(
    `input[name="custom-quiz-answer-pool-size"][value="${preset.answerPoolSizeValue}"]`
  );
  if (answerPoolSizeRadio) {
    answerPoolSizeRadio.checked = true;
  }
  // 一瞬チャレンジタイプ専用の設定（2026-08-30追加、本人指示：後半②）。answerPoolSizeValueは
  // 歌詞クイズと一瞬チャレンジで同じプロパティ名を共有しているが、一瞬チャレンジ専用の
  // fieldset（選択肢が4/10/全曲のみ）へ反映する。
  const instantAnswerPoolSizeRadio = document.querySelector(
    `input[name="custom-quiz-instant-answer-pool-size"][value="${preset.answerPoolSizeValue}"]`
  );
  if (instantAnswerPoolSizeRadio) {
    instantAnswerPoolSizeRadio.checked = true;
  }
  const instantPlayDurationRadio = document.querySelector(
    `input[name="custom-quiz-instant-play-duration"][value="${preset.playDurationValue}"]`
  );
  if (instantPlayDurationRadio) {
    instantPlayDurationRadio.checked = true;
  }

  elements.nameInput.value = preset.name;
  elements.memoInput.value = preset.memo;
  elements.nameError.hidden = true;
  elements.saveButton.textContent = "上書き保存する";
  elements.deleteButton.hidden = false;
  elements.duplicateButton.hidden = false;

  refreshSelectionUI();
}

// オリジナル問題作成モードの選曲画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   groupsContainer: シングル単位のアコーディオンを並べる入れ物,
//   selectedCountValue: 選択数を表示する要素,
//   minNotice: 4曲未満のときに表示する案内,
//   selectAllButton, deselectAllButton: 画面全体を対象にした全曲選択/全曲解除ボタン,
//   searchInput: 曲名検索の入力欄,
//   searchClearButton: 検索語を消す「×」ボタン（検索語があるときだけ表示）,
//   noResultsNotice: 検索結果が1曲もないときに表示する案内文,
//   selectedOnlyCheckbox: 「選択済みの曲だけ表示」のチェックボックス,
//   previewAudioElement: 試聴専用の<audio>要素,
//   previewPlayer: 共通ミニプレイヤーの入れ物（何か試聴中のときだけ表示）,
//   previewTitle: ミニプレイヤーに表示する曲名,
//   previewToggleButton: ミニプレイヤーの再生/一時停止ボタン,
//   previewSeekBackButton, previewSeekForwardButton: ミニプレイヤーの10秒戻す/送るボタン,
//   previewSeekRange: タップ・ドラッグで再生位置を変更できるシークバー,
//   previewCurrentTime, previewDuration: 現在位置・総時間の表示,
//   distractorModeFieldset: ダミー選択肢の<fieldset>（歌詞クイズ・一瞬チャレンジタイプでは隠す、2026-08-29追加）,
//   answerPoolSizeFieldset: 回答方式の<fieldset>（歌詞クイズタイプでだけ見せる、2026-08-29追加）,
//   instantDurationFieldset: 一瞬チャレンジ専用・再生時間の<fieldset>（2026-08-30追加）,
//   instantAnswerPoolSizeFieldset: 一瞬チャレンジ専用・回答方式（4/10/全曲）の<fieldset>（2026-08-30追加）,
//   lyricsRevealAudioFieldset: 歌詞クイズタイプでだけ見せる、正解発表の音源ON/OFFの<fieldset>（2026-11-XX追加）,
//   instantRevealAudioFieldset: 一瞬チャレンジタイプでだけ見せる、正解発表の音源ON/OFFの<fieldset>（2026-11-XX追加）,
//   nameInput, memoInput: セット名・メモの入力欄,
//   nameError: セット名が未入力のときの案内,
//   saveButton: 「保存する」／「上書き保存する」ボタン（文言はJS側で切り替える）,
//   deleteButton: 「このセットを削除する」ボタン（既存プリセットを開いているときだけ表示）,
//   deleteConfirmModal, deleteCancelButton, deleteConfirmButton: 削除確認モーダル一式,
//   duplicateButton: 「複製する」ボタン（既存プリセットを開いているときだけ表示）,
//   startButton: 「この曲でクイズを始める」ボタン,
//   onStart: 開始ボタンが押されたときに呼ばれるコールバック。(songIds, distractorMode)を受け取る,
//   onSave: 新規保存時に呼ばれるコールバック。({name, memo, songIds, distractorMode})を受け取る,
//   onUpdate: 上書き保存時に呼ばれるコールバック。(id, {name, memo, songIds, distractorMode})を受け取る,
//   onDelete: 削除が確定したときに呼ばれるコールバック。(id)を受け取る,
//   onDuplicate: 複製ボタンが押されたときに呼ばれるコールバック。(id)を受け取る,
// }
export function initCustomQuizScreen(newElements) {
  elements = newElements;
  renderGroups();

  // 【2026-10-01追加・本人指示：実機テストで発覚、出題形式・回答候補数・再生時間の
  // ラジオボタンが無音だった】既存のオンライン対戦側と同じ、変更のたびにUI_CLICK効果音を
  // 鳴らす操作音を追加する。
  document
    .querySelectorAll(
      'input[name="custom-quiz-distractor-mode"], input[name="custom-quiz-answer-pool-size"], input[name="custom-quiz-instant-play-duration"], input[name="custom-quiz-instant-answer-pool-size"]'
    )
    .forEach((radio) => radio.addEventListener("change", () => playSfx(SFX_EVENTS.UI_CLICK)));

  // 【2026-11-XX新設・本人指示：最優先1・正解発表の音源ON/OFF】通常の歌詞クイズ／
  // 一瞬チャレンジ設定画面と同じ設定値を共有する（js/revealAudioPreference.js参照）。
  initRevealAudioToggle(
    'input[name="custom-quiz-lyrics-reveal-audio"]',
    getLyricsQuizRevealAudioEnabled,
    setLyricsQuizRevealAudioEnabled,
    () => playSfx(SFX_EVENTS.UI_CLICK)
  );
  initRevealAudioToggle(
    'input[name="custom-quiz-instant-reveal-audio"]',
    getInstantChallengeRevealAudioEnabled,
    setInstantChallengeRevealAudioEnabled,
    () => playSfx(SFX_EVENTS.UI_CLICK)
  );

  // 試聴の共通再生処理を、この画面専用の<audio>要素で使えるようにする。
  initAudioPreview(elements.previewAudioElement);

  // 再生位置・アイコンの見た目は、audioElementの実際のイベントから更新する
  // （songlist.jsの試聴と同じく、行を増減させても購読先は1箇所のままでよい）。
  elements.previewAudioElement.addEventListener("play", syncPlayingVisual);
  elements.previewAudioElement.addEventListener("pause", syncPlayingVisual);
  // 最後まで再生し終えたら、再開する対象がなくなるため、試聴自体を終了した状態に戻す。
  elements.previewAudioElement.addEventListener("ended", () => {
    setPreviewingRow(null);
  });
  elements.previewAudioElement.addEventListener("loadedmetadata", () => {
    elements.previewSeekRange.max = elements.previewAudioElement.duration;
    elements.previewDuration.textContent = formatTime(elements.previewAudioElement.duration);
  });
  elements.previewAudioElement.addEventListener("timeupdate", () => {
    elements.previewSeekRange.value = elements.previewAudioElement.currentTime;
    elements.previewCurrentTime.textContent = formatTime(elements.previewAudioElement.currentTime);
  });

  // ミニプレイヤーの操作。再生/一時停止は、今の実際の状態（audio.paused）を見て切り替える。
  elements.previewToggleButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    if (currentlyPreviewingRowElement === null) return;
    if (elements.previewAudioElement.paused) {
      resumeAudioPreview();
    } else {
      pauseAudioPreview();
    }
  });
  elements.previewSeekBackButton.addEventListener("click", () => {
    seekAudioPreview(-PREVIEW_SEEK_SKIP_SECONDS);
  });
  elements.previewSeekForwardButton.addEventListener("click", () => {
    seekAudioPreview(PREVIEW_SEEK_SKIP_SECONDS);
  });
  // 全画面表示ボタン。歌詞データがない曲では何も起きない（静かに無視する、既存の方針と同じ）。
  elements.previewFullscreenButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    if (currentlyPreviewingRowElement === null || elements.previewLyricsPanel.hidden) return;
    openFullscreenLyrics(elements.previewTitle.textContent, elements.previewAudioElement, elements.previewLyricsPanel);
  });
  // シークバーのタップ・ドラッグで再生位置を変更する。0秒未満・総時間超えにならないのは、
  // range要素自体のmin/max（loadedmetadataでmaxを曲の長さに設定済み）による制約に任せている。
  // 一時停止中はcurrentTimeを変えるだけで再生は始まらず、再生中はそのまま続けて鳴る
  // （どちらもaudio要素本来の挙動で、特別な分岐は不要）。
  elements.previewSeekRange.addEventListener("input", () => {
    const newTime = elements.previewSeekRange.valueAsNumber;
    elements.previewAudioElement.currentTime = newTime;
    elements.previewCurrentTime.textContent = formatTime(newTime);
  });

  elements.selectAllButton.addEventListener("click", handleSelectAllSongs);
  elements.deselectAllButton.addEventListener("click", handleDeselectAllSongs);
  elements.searchInput.addEventListener("input", () => {
    searchQuery = elements.searchInput.value;
    elements.searchClearButton.hidden = searchQuery === "";
    updateRowVisibility();
  });
  // 検索欄の「×」ボタン：検索語を空にし、一覧を元の状態に戻し、検索欄へフォーカスを戻す
  // （消したあとすぐ別の語を打ち始められるようにするため。songlist.jsの検索欄と同じ挙動）。
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
  // 【二重再生防止】startButton/saveButton/duplicateButtonは、それぞれelements.onStart /
  // elements.onSave・onUpdate / elements.onDuplicate（main.js側）の先頭で既にplaySfx(UI_CLICK)が
  // 鳴っているため、ここでは重ねて鳴らさない（handleStart/handleSave/handleDuplicateButtonClick
  // の定義を確認済み）。
  elements.startButton.addEventListener("click", handleStart);
  elements.saveButton.addEventListener("click", handleSave);
  elements.duplicateButton.addEventListener("click", handleDuplicateButtonClick);
  elements.deleteButton.addEventListener("click", handleDeleteButtonClick);
  elements.deleteCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeDeleteConfirmModal();
  });
  elements.deleteConfirmButton.addEventListener("click", handleDeleteConfirmed);
  elements.deleteConfirmModal.addEventListener("click", (event) => {
    if (event.target === elements.deleteConfirmModal) {
      closeDeleteConfirmModal();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (elements.deleteConfirmModal.hidden) return;
    closeDeleteConfirmModal();
  });
  refreshSelectionUI();
}
