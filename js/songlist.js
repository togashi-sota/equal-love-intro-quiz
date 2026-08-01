// 収録曲一覧画面を組み立てるファイル。
// シングル単位のアコーディオンで曲を一覧し、各曲の試聴もできるようにする。
// クイズ本編の再生（audio.js）とは完全に独立した専用の<audio>要素で再生するため、
// ここでの再生開始・停止はgameStateや採点には一切影響しない。

import { CATEGORY } from "./data/songs.js";
import { getAudioBlob } from "./audioStorage.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { openFullscreenLyrics } from "./lyricsFullscreen.js";

// 試聴を10秒戻す/送るときの秒数。
const SEEK_SKIP_SECONDS = 10;

// カテゴリごとの、バッジに表示する文字と色分け用のクラス名。
// オリジナル問題作成モードの選曲画面（customQuizScreen.js）でも同じカテゴリバッジを
// 表示するため、外部公開している。
export const CATEGORY_PILL_INFO = {
  [CATEGORY.TITLE_TRACK]: { text: "表題曲", className: "title-track" },
  [CATEGORY.GROUP_SONG]: { text: "全員曲", className: "group-song" },
  [CATEGORY.UNIT_SONG]: { text: "ユニット曲", className: "unit-song" },
  [CATEGORY.SPECIAL]: { text: CATEGORY.SPECIAL, className: "special" },
};

// 検索用に文字列を正規化する（大文字/小文字・全角/半角数字・カタカナ/ひらがな・空白・
// 検索の邪魔になりやすい記号の違いを吸収する）。オリジナル問題作成モードの選曲画面
// （customQuizScreen.js）でも、曲名検索の判定を完全に同じ仕様にするため、この関数と
// 下のsongMatchesSearch()を外部公開して再利用する（2画面で別々に実装すると、
// 将来どちらかだけ直し忘れて仕様がずれる恐れがあるため、判定ロジックを1箇所に集約する）。
export function normalizeForSearch(text) {
  return text
    .toLowerCase()
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/\s/g, "")
    .replace(/[・！？!?「」『』"'’〜~]/g, "");
}

// 曲名・読み仮名・別名（愛称）が検索語と一致するか判定する。
// 正式な曲名・読み仮名（title・reading）は前方一致、略称・愛称（aliases）は完全一致、
// と一致条件をあえて分けている。略称は読みが短いものが多く、前方一致のままだと
// 「あ」で「青サブ」の読み「あおさぶ」まで拾ってしまうなど、正式名称の検索結果に
// 略称由来の意図しない曲が紛れ込みやすいため（実際にこの不具合が発生し、この仕様に変更した）。
// normalizedQueryは呼び出し側でnormalizeForSearch()済みのものを渡す想定
// （曲ごとに何度も呼ばれるループの中で、検索語側の正規化を毎回やり直さないため）。
// aliasesは省略可（例：「青春"サブリミナル"」に対する「青サブ」のような、ファンの間の呼び方。
// songs.jsのsearchAliasesフィールド参照）。配列の要素は、文字列（カタカナ・ひらがな・
// 英字だけの別名）と、{ text, reading }オブジェクト（漢字を含む別名。readingにひらがな
// 表記を添える）のどちらも混在できる。カタカナ⇔ひらがなの違いはnormalizeForSearch()が
// 吸収するため、完全一致であっても「あおさぶ」で「アオサブ」を探す、といったことは可能。
export function songMatchesSearch(title, reading, aliases, normalizedQuery) {
  if (normalizedQuery === "") return true;

  const officialCandidates = [title, reading ?? ""];
  if (officialCandidates.some((candidate) => normalizeForSearch(candidate).startsWith(normalizedQuery))) {
    return true;
  }

  return (aliases ?? []).some((alias) => {
    if (typeof alias === "string") {
      return normalizeForSearch(alias) === normalizedQuery;
    }
    return (
      normalizeForSearch(alias.text) === normalizedQuery ||
      (alias.reading && normalizeForSearch(alias.reading) === normalizedQuery)
    );
  });
}

const previewAudioElement = document.getElementById("preview-audio");
const groupsContainerElement = document.getElementById("songlist-groups");
const totalCountElement = document.getElementById("songlist-total-count");
const breakdownElement = document.getElementById("songlist-breakdown");
const searchInputElement = document.getElementById("songlist-search-input");
const searchClearButtonElement = document.getElementById("songlist-search-clear-button");
const noResultsElement = document.getElementById("songlist-no-results-notice");

// 今まさに試聴中の行のDOM要素。試聴していないときはnull。
let currentlyPlayingRowElement = null;

// 曲名検索の検索語。表示（どの行・シングルを見せるか）だけに関わる。
let searchQuery = "";

// 試聴用に作った再生用URL。次の曲に切り替える・試聴を止めるたびに解放する
// （audio.jsのcurrentObjectUrlと同じ考え方）。
let currentPreviewObjectUrl = null;

function releaseCurrentPreviewObjectUrl() {
  if (currentPreviewObjectUrl !== null) {
    URL.revokeObjectURL(currentPreviewObjectUrl);
    currentPreviewObjectUrl = null;
  }
}

// 曲データの`single`表記（表示用の補足情報）から、収録曲一覧のアコーディオン区分を判定する。
// 通常のシングル（1st〜20th）は番号ごとに区分し、アルバム・配信限定・特別収録は
// それぞれ1つの区分にまとめる（Overtureは1stアルバムにも収録されているが、
// category が SPECIAL なので「特別収録曲」側に分類する）。
// orderは区分の並び順（新しいシングルが上）に使う。1stアルバムは実際の発売日（2021-05-12）が
// 8th（2020-11-25）と9th（2021-08-25）の間にあるため、8.5という中間の値を割り当てて
// その位置に来るようにしている。配信限定シングル・特別収録曲は、複数の配信日にまたがるため
// 1か所にはうまく収まらず、あえて一覧の後半にまとめて置く方針（本人と合意済み）。
function resolveSongGroup(song) {
  if (song.category === CATEGORY.SPECIAL || song.id === "866") {
    return { key: "special", order: -3, label: "特別収録曲（866／Overture）" };
  }
  if (song.single.startsWith("配信限定シングル")) {
    return { key: "digital", order: -2, label: "配信限定シングル" };
  }
  if (song.single.startsWith("1stアルバム")) {
    return { key: "album", order: 8.5, label: "1stアルバム「全部、内緒。」" };
  }

  // 通常のシングルは「Nthシングル「曲名」...」という表記なので、先頭の番号部分を取り出す
  const numberMatch = song.single.match(/^(\d+)(st|nd|rd|th)/);
  const number = Number(numberMatch[1]);
  return { key: `single-${number}`, order: number, label: `${numberMatch[1]}${numberMatch[2]}` };
}

// 曲データを、アコーディオン区分ごとにまとめる。新しいシングルが先頭にくるよう並び替える。
// オリジナル問題作成モードの選曲画面（customQuizScreen.js）でも、同じ区分ルールを
// 重複させないよう、この関数をそのまま再利用する。
export function buildSongGroups(songs) {
  const groupsByKey = new Map();

  songs.forEach((song) => {
    const group = resolveSongGroup(song);
    if (!groupsByKey.has(group.key)) {
      groupsByKey.set(group.key, { ...group, songs: [] });
    }
    groupsByKey.get(group.key).songs.push(song);
  });

  // 通常のシングル区分だけ、見出しを「Nth + 表題曲名」に組み立て直す。
  // 表題曲が2曲あるダブルA面シングル（18th等）は、最初の表題曲だけを見出しに使う
  // （複数曲名を並べるとスマホ幅で長くなりすぎるため、本人と合意した仕様）。
  // 配信限定シングル・特別収録曲は、区分内を発売日（配信日）順に並べ替える。
  groupsByKey.forEach((group) => {
    if (group.key.startsWith("single-")) {
      const titleTrack = group.songs.find((song) => song.category === CATEGORY.TITLE_TRACK);
      if (titleTrack) {
        group.label = `${group.label} ${titleTrack.title}`;
      }
    }
    if (group.key === "digital" || group.key === "special") {
      group.songs.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    }
  });

  return [...groupsByKey.values()].sort((a, b) => b.order - a.order);
}

// 歌唱メンバー欄の文字列を組み立てる。1人ならソロ表記、2人以上は「・」区切り。
// membersフィールドがない曲（表題曲・全員曲）では呼び出さない。
function formatMembersLine(members) {
  if (members.length === 1) {
    return `歌唱：${members[0]}（ソロ）`;
  }
  return `歌唱：${members.join("・")}`;
}

// センター欄の文字列を組み立てる。単独／Wセンター／センターなし確定の3パターン。
// centerTypeが省略されている曲（未確認、またはソロ・デュオ曲）では呼び出さない。
function formatCenterLine(center, centerType) {
  if (centerType === "none") {
    return "センター：なし";
  }
  if (centerType === "double") {
    return `Wセンター：${center.join("・")}`;
  }
  return `センター：${center[0]}`;
}

// 秒数を「分:秒」の表示用文字列にする（例: 65秒 → "1:05"）。
function formatTime(totalSeconds) {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = Math.floor(safeSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

// 行が「試聴対象として選択されているか」の見た目（背景・シークバーの表示）を切り替える。
// 一時停止中もこの状態は維持したいため、「実際に音が鳴っているか」の判定
// （syncRowAudioPlayingIcon）とはあえて分離している。
// SVG要素はhidden属性・hiddenプロパティの反映がブラウザによって不安定なため、
// より確実なクラスベースの表示切り替えに統一している。
function setRowPlayingState(rowElement, isPlaying) {
  rowElement.classList.toggle("is-playing", isPlaying);
  rowElement.classList.remove("is-audio-paused"); // 選択し直すたびに、アイコンの状態を一旦リセットする
  rowElement.querySelector(".track-seek").hidden = !isPlaying;
}

// 再生/一時停止アイコンの切り替えだけを、audio.pausedの実際の値から行う。
// 「行が選択中か」とは別に管理することで、一時停止してもシークバー・歌詞パネルは
// そのまま維持され、アイコンだけが正しく切り替わる（.track-row.is-playing.is-audio-paused
// というCSSの組み合わせで、選択中かつ一時停止中の見た目を表現する）。
function syncRowAudioPlayingIcon() {
  if (!currentlyPlayingRowElement) return;
  currentlyPlayingRowElement.classList.toggle("is-audio-paused", previewAudioElement.paused);
}

// 行のシークバー・時間表示を初期状態（0秒）に戻す。
function resetRowSeekUI(rowElement) {
  const rangeElement = rowElement.querySelector(".seek-range");
  rangeElement.value = 0;
  rowElement.querySelector(".seek-current").textContent = formatTime(0);
  rowElement.querySelector(".seek-duration").textContent = formatTime(0);
}

// 試聴中の曲を止める。収録曲一覧画面から離れるとき（戻るボタン）・
// 再生中の曲のアコーディオンを閉じたときにも必ず呼ぶ。
// 同期歌詞パネル（js/lyricsSync.js）の後片付けも、必ずここで一緒に行う
// （試聴を止めるすべての場面で、歌詞パネルの表示・イベント購読も確実に消えるようにするため）。
export function stopSongListPreview() {
  previewAudioElement.pause();
  previewAudioElement.currentTime = 0;
  releaseCurrentPreviewObjectUrl();
  destroyLyricsSync();
  if (currentlyPlayingRowElement) {
    setRowPlayingState(currentlyPlayingRowElement, false);
    resetRowSeekUI(currentlyPlayingRowElement);
    currentlyPlayingRowElement = null;
  }
}

// 指定した曲の試聴を開始する。
// クイズ本編と同じ考え方で、introLeadInSecがある曲は無音区間を飛ばして頭出しする。
// 音源はIndexedDB（audioStorage.js）から取得するため非同期処理になる。
// 未読み込みの曲の場合は、試聴が補助機能であることに合わせて、エラー表示は出さず
// 静かに何もしない（再生中の見た目にもしない）。
async function playPreview(song, rowElement) {
  const blob = await getAudioBlob(song.id);
  if (!blob) return;

  releaseCurrentPreviewObjectUrl();
  currentPreviewObjectUrl = URL.createObjectURL(blob);

  previewAudioElement.onloadedmetadata = () => {
    previewAudioElement.currentTime = song.introLeadInSec || 0;
    const rangeElement = rowElement.querySelector(".seek-range");
    rangeElement.max = previewAudioElement.duration;
    rowElement.querySelector(".seek-duration").textContent = formatTime(previewAudioElement.duration);
  };
  previewAudioElement.src = currentPreviewObjectUrl;

  previewAudioElement.play().catch(() => {
    // 試聴は補助機能なので、再生に失敗してもエラー表示は出さず、再生中の見た目だけ元に戻す
    setRowPlayingState(rowElement, false);
    currentlyPlayingRowElement = null;
  });

  currentlyPlayingRowElement = rowElement;
  setRowPlayingState(rowElement, true);

  // 歌詞データがある曲だけ、同期歌詞パネルを表示する（ない曲では静かに何もしない）。
  loadLyricsForSong(song.id, previewAudioElement, rowElement.querySelector(".track-lyrics"));
}

// 再生ボタンを押したときの処理。
// 今まさに試聴中の行をもう一度押した場合は一時停止/再開を切り替え（位置・歌詞パネルは維持）、
// 別の行（または何も試聴していない状態）から押した場合は、前の曲を完全に止めてから新しい曲を再生する。
function handlePlayButtonClick(song, rowElement) {
  const isThisRowPlaying = currentlyPlayingRowElement === rowElement;
  if (isThisRowPlaying) {
    if (previewAudioElement.paused) {
      previewAudioElement.play();
    } else {
      previewAudioElement.pause();
    }
    return;
  }
  stopSongListPreview();
  playPreview(song, rowElement);
}

// 試聴中の再生位置を、今何秒かに合わせてシークバー・時間表示に反映する。
// previewAudioElementのtimeupdateイベントで1回だけ登録し、
// 今再生中の行だけを更新する（81行分のイベントリスナーを作らない）。
previewAudioElement.addEventListener("timeupdate", () => {
  if (!currentlyPlayingRowElement) return;
  currentlyPlayingRowElement.querySelector(".seek-range").value = previewAudioElement.currentTime;
  currentlyPlayingRowElement.querySelector(".seek-current").textContent = formatTime(previewAudioElement.currentTime);
});

// 再生/一時停止アイコンとイコライザー演出を、実際の再生状態に確実に同期させる
// （ボタン操作だけでなく、何らかの理由でブラウザ側から再生/一時停止された場合にも対応するため）。
previewAudioElement.addEventListener("play", syncRowAudioPlayingIcon);
previewAudioElement.addEventListener("pause", syncRowAudioPlayingIcon);

// 1曲分の行（再生ボタン・曲名・歌唱メンバー/センター/説明・再生中表示・シークバー・カテゴリバッジ）を作る。
function createTrackRow(song) {
  const row = document.createElement("div");
  row.className = "track-row";
  // 曲名検索で読み仮名・別名（愛称）も対象にできるよう、行のdata属性に持たせておく
  // （読み仮名を持たない曲はsong.searchReadingがundefinedなので、空文字列にしておく。
  // 別名は文字列と{ text, reading }オブジェクトが混在する配列のため、JSON文字列として
  // 保持する。customQuizScreen.jsの選曲行と同じパターン）。
  row.dataset.searchReading = song.searchReading ?? "";
  row.dataset.searchAliases = JSON.stringify(song.searchAliases ?? []);

  const playButton = document.createElement("button");
  playButton.type = "button";
  playButton.className = "play-button";
  playButton.setAttribute("aria-label", `${song.title}を再生`);
  playButton.innerHTML = `
    <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>
    <svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
  `;
  playButton.addEventListener("click", () => handlePlayButtonClick(song, row));

  const infoBlock = document.createElement("div");
  infoBlock.className = "track-info";

  const titleElement = document.createElement("span");
  titleElement.className = "track-title";
  titleElement.textContent = song.title;
  infoBlock.appendChild(titleElement);

  // 歌唱メンバー：ユニット曲・ソロ曲のみ（表題曲・全員曲はカテゴリバッジで「全員曲」と分かるため省略）
  if (song.members) {
    const membersElement = document.createElement("span");
    membersElement.className = "track-meta-line";
    membersElement.textContent = formatMembersLine(song.members);
    infoBlock.appendChild(membersElement);
  }

  // センター：centerTypeが確認できている曲のみ（ソロ・デュオ曲、Overture、未確認の曲では表示しない）
  if (song.centerType) {
    const centerElement = document.createElement("span");
    centerElement.className = "track-meta-line";
    centerElement.textContent = formatCenterLine(song.center, song.centerType);
    infoBlock.appendChild(centerElement);
  }

  // 補足説明：releaseContext・descriptionのどちらか/両方がある曲のみ、つなげて1〜2文で表示する
  const descriptionText = [song.releaseContext, song.description].filter(Boolean).join("");
  if (descriptionText) {
    const descriptionElement = document.createElement("span");
    descriptionElement.className = "track-meta-line";
    descriptionElement.textContent = descriptionText;
    infoBlock.appendChild(descriptionElement);
  }

  // 再生中だけ表示する、イコライザー演出＋「再生中」の文字
  const nowPlayingTag = document.createElement("span");
  nowPlayingTag.className = "now-playing-tag";
  nowPlayingTag.innerHTML = `
    <span class="now-playing-eq" aria-hidden="true"><span></span><span></span><span></span></span>
    再生中
  `;
  infoBlock.appendChild(nowPlayingTag);

  // 再生中だけ表示する、再生位置バー（10秒戻し/送りボタン付き）
  const seekBlock = document.createElement("div");
  seekBlock.className = "track-seek";
  seekBlock.hidden = true;
  seekBlock.innerHTML = `
    <div class="seek-controls">
      <button type="button" class="seek-skip-button" data-skip="back" aria-label="10秒戻す">−10</button>
      <input type="range" class="seek-range" min="0" value="0" step="0.1">
      <button type="button" class="seek-skip-button" data-skip="forward" aria-label="10秒送る">+10</button>
      <button type="button" class="lyrics-fullscreen-open-button" aria-label="歌詞を全画面表示">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
      </button>
    </div>
    <span class="seek-time"><span class="seek-current">0:00</span> / <span class="seek-duration">0:00</span></span>
  `;
  infoBlock.appendChild(seekBlock);

  // 全画面表示ボタン。歌詞データがない曲では何も起きない（静かに無視する、既存の方針と同じ）。
  seekBlock.querySelector(".lyrics-fullscreen-open-button").addEventListener("click", () => {
    if (currentlyPlayingRowElement === row && !lyricsPanel.hidden) {
      openFullscreenLyrics(song.title, previewAudioElement, lyricsPanel);
    }
  });

  const rangeElement = seekBlock.querySelector(".seek-range");
  rangeElement.addEventListener("input", () => {
    if (currentlyPlayingRowElement === row) {
      previewAudioElement.currentTime = rangeElement.valueAsNumber;
    }
  });
  seekBlock.querySelector('[data-skip="back"]').addEventListener("click", () => {
    if (currentlyPlayingRowElement === row) {
      previewAudioElement.currentTime = Math.max(0, previewAudioElement.currentTime - SEEK_SKIP_SECONDS);
    }
  });
  seekBlock.querySelector('[data-skip="forward"]').addEventListener("click", () => {
    if (currentlyPlayingRowElement === row) {
      const duration = previewAudioElement.duration || previewAudioElement.currentTime;
      previewAudioElement.currentTime = Math.min(duration, previewAudioElement.currentTime + SEEK_SKIP_SECONDS);
    }
  });

  // 同期歌詞パネル（js/lyricsSync.js）。歌詞データがある曲を再生したときだけ、
  // loadLyricsForSong()がここへ行を描画してhiddenを解除する。歌詞データがない曲では
  // 何も描画されず非表示のままなので、収録曲一覧の見た目には一切影響しない。
  const lyricsPanel = document.createElement("div");
  lyricsPanel.className = "track-lyrics synced-lyrics-panel";
  lyricsPanel.hidden = true;
  infoBlock.appendChild(lyricsPanel);

  const categoryInfo = CATEGORY_PILL_INFO[song.category];
  const categoryPill = document.createElement("span");
  categoryPill.className = `category-pill ${categoryInfo.className}`;
  categoryPill.textContent = categoryInfo.text;

  row.appendChild(playButton);
  row.appendChild(infoBlock);
  row.appendChild(categoryPill);

  return row;
}

// 1つのシングル区分（アコーディオン1つ分）を作る。
function createSingleGroupElement(group, isInitiallyOpen) {
  const groupElement = document.createElement("div");
  groupElement.className = "single-group";
  groupElement.classList.toggle("is-open", isInitiallyOpen);

  const headerButton = document.createElement("button");
  headerButton.type = "button";
  headerButton.className = "single-group-header";
  headerButton.innerHTML = `
    <svg class="chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="single-group-name">${group.label}</span>
    <span class="track-count-chip">${group.songs.length}曲</span>
  `;
  headerButton.addEventListener("click", () => {
    // 再生中の曲を含むアコーディオンを閉じるときは、必ず試聴を止める
    const willClose = groupElement.classList.contains("is-open");
    if (willClose && currentlyPlayingRowElement && groupElement.contains(currentlyPlayingRowElement)) {
      stopSongListPreview();
    }
    groupElement.classList.toggle("is-open");
  });

  const tracksContainer = document.createElement("div");
  tracksContainer.className = "single-group-tracks";
  group.songs.forEach((song) => {
    tracksContainer.appendChild(createTrackRow(song));
  });

  groupElement.appendChild(headerButton);
  groupElement.appendChild(tracksContainer);
  return groupElement;
}

// カテゴリ別の内訳チップ（表題曲◯・全員曲◯・ユニット曲◯・特別収録曲◯）を組み立てる。
// 曲数はHTMLに固定で書かず、songsの中身から毎回数え直すので、
// 新曲・アルバム曲・配信限定曲を追加しても自動的に数字が更新される。
function renderCategoryBreakdown(songs) {
  const countsByCategory = {
    [CATEGORY.TITLE_TRACK]: 0,
    [CATEGORY.GROUP_SONG]: 0,
    [CATEGORY.UNIT_SONG]: 0,
    [CATEGORY.SPECIAL]: 0,
  };
  songs.forEach((song) => {
    countsByCategory[song.category] += 1;
  });

  breakdownElement.innerHTML = "";
  Object.entries(countsByCategory).forEach(([categoryName, count]) => {
    const chip = document.createElement("span");
    chip.className = "breakdown-chip";
    chip.innerHTML = `${categoryName}<strong>${count}</strong>`;
    breakdownElement.appendChild(chip);
  });
}

// 収録曲一覧画面の中身を組み立てる。アプリ起動時に一度だけ呼べばよい。
export function renderSongList(songs) {
  totalCountElement.textContent = songs.length;
  renderCategoryBreakdown(songs);

  const groups = buildSongGroups(songs);
  const newestGroup = groups[0]; // orderで並び替え済みなので、先頭＝一番新しいシングル

  groupsContainerElement.innerHTML = "";
  groups.forEach((group) => {
    groupsContainerElement.appendChild(createSingleGroupElement(group, group === newestGroup));
  });
}

// 曲名検索の検索語に合わせて、各曲行・シングル区分の表示/非表示を更新する。
// 一致した区分は、閉じたままだと該当の曲が見えないため自動的に開く
// （一致しなくなったからといって、開いた区分を自動的に閉じることはしない。
// customQuizScreen.jsの絞り込みと同じ考え方）。
// 見出しの「◯曲」チップは、絞り込み中は一致した曲数に、絞り込みがなければ
// その区分の全曲数に、常に描画し直す（検索中に見出しの数字と実際に表示されている
// 曲の数がずれて見えないようにするため）。
// 検索結果が1曲もないときは、案内文（#songlist-no-results-notice）を表示する。
// 試聴中の曲の行が検索で非表示になった場合は、行が見えないままミニプレイヤー相当の
// 表示だけ残ると分かりにくいため、試聴自体を止める。
function updateRowVisibility() {
  const normalizedQuery = normalizeForSearch(searchQuery);
  let hasAnyVisibleRow = false;

  groupsContainerElement.querySelectorAll(".single-group").forEach((groupElement) => {
    let visibleRowCount = 0;

    groupElement.querySelectorAll(".track-row").forEach((row) => {
      const title = row.querySelector(".track-title").textContent;
      const reading = row.dataset.searchReading;
      const aliases = JSON.parse(row.dataset.searchAliases);
      const isVisible = songMatchesSearch(title, reading, aliases, normalizedQuery);
      row.hidden = !isVisible;
      if (isVisible) visibleRowCount += 1;
    });

    const hasVisibleRow = visibleRowCount > 0;
    groupElement.hidden = !hasVisibleRow;
    groupElement.querySelector(".track-count-chip").textContent = `${visibleRowCount}曲`;
    if (hasVisibleRow && normalizedQuery !== "") {
      groupElement.classList.add("is-open");
    }
    if (hasVisibleRow) hasAnyVisibleRow = true;
  });

  noResultsElement.hidden = hasAnyVisibleRow;

  if (currentlyPlayingRowElement && currentlyPlayingRowElement.hidden) {
    stopSongListPreview();
  }
}

// 検索語を初期状態（空）に戻す。画面を開くたびに呼び、前回の検索を持ち越さない
// （customQuizScreen.jsのresetFilters()と同じ考え方）。
function resetSearch() {
  searchQuery = "";
  searchInputElement.value = "";
  searchClearButtonElement.hidden = true;
  updateRowVisibility();
}

searchInputElement.addEventListener("input", () => {
  searchQuery = searchInputElement.value;
  searchClearButtonElement.hidden = searchQuery === "";
  updateRowVisibility();
});

// 検索欄の「×」ボタン：検索語を空にし、一覧を元の状態に戻し、検索欄へフォーカスを戻す
// （消したあとすぐ別の語を打ち始められるようにするため）。
searchClearButtonElement.addEventListener("click", () => {
  resetSearch();
  searchInputElement.focus();
});

// 収録曲一覧画面を開くたびに呼ぶ。最新のシングルだけ展開し、それ以外は畳んだ状態に戻す
// （閲覧中に開閉した状態を次回に持ち越さず、毎回同じ見え方から始められるようにするため）。
// あわせて検索語もリセットする。
export function resetSongListToDefaultView() {
  const groupElements = groupsContainerElement.querySelectorAll(".single-group");
  groupElements.forEach((element, index) => {
    element.classList.toggle("is-open", index === 0);
  });
  resetSearch();
}
