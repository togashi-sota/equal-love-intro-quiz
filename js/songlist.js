// 収録曲一覧画面を組み立てるファイル。
// シングル単位のアコーディオンで曲を一覧し、各曲の試聴もできるようにする。
// クイズ本編の再生（audio.js）とは完全に独立した専用の<audio>要素で再生するため、
// ここでの再生開始・停止はgameStateや採点には一切影響しない。

import { CATEGORY } from "./data/songs.js";
import { hasAudioSource } from "./data/audioMetadata.js";
import { getAudioBlob } from "./audioStorage.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { openFullscreenLyrics } from "./lyricsFullscreen.js";
import { isLyricsQuizEligibleSong } from "./lyricsQuizQuestionBuilder.js";
import { buildMvThumbnailElement } from "./youtubeThumbnail.js";
import {
  isFavoriteSong,
  toggleFavoriteSong,
  areAllFavoriteSongs,
  isAnyFavoriteSong,
  addFavoriteSongs,
  removeFavoriteSongs,
} from "./favoriteSongs.js";
import { getPlaylists, createPlaylist, addSongToPlaylist } from "./playlists.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
// この画面内で完結する操作（試聴・お気に入り・プレイリスト追加・タブ切替等）に効果音を鳴らすため追加。
import { SFX_EVENTS, playSfx } from "./soundManager.js";

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

// 【2026-08-31新設・オンライン対戦「歌詞クイズ」全曲プール用】50音の行ごとに曲を
// ジャンプできる索引バーのための行分け定義。小さい文字（ぁぃぅ等）・濁音・半濁音は、
// 見出しとしては清音と同じ行にまとめる（辞書・五十音表の一般的な並びに合わせた）。
// 「わ行」には「ん」も含める（「ん」だけの専用行を作ると1文字のためのタブになり
// 煩雑なため、実用上は「わ」行の続きとして扱う）。
export const GOJUON_ROWS = [
  { key: "a", label: "あ", chars: "あいうえおぁぃぅぇぉ" },
  { key: "ka", label: "か", chars: "かきくけこがぎぐげご" },
  { key: "sa", label: "さ", chars: "さしすせそざじずぜぞ" },
  { key: "ta", label: "た", chars: "たちつてとだぢづでどっ" },
  { key: "na", label: "な", chars: "なにぬねの" },
  { key: "ha", label: "は", chars: "はひふへほばびぶべぼぱぴぷぺぽ" },
  { key: "ma", label: "ま", chars: "まみむめも" },
  { key: "ya", label: "や", chars: "やゆよゃゅょ" },
  { key: "ra", label: "ら", chars: "らりるれろ" },
  { key: "wa", label: "わ", chars: "わをんゎ" },
];

// 曲名（またはsearchReading）の先頭文字から、GOJUON_ROWSのどの行に属するかを求める。
// normalizeForSearch()でカタカナ→ひらがな変換済みの文字列を見るため、読み仮名が
// カタカナで書かれていても正しく行分けできる。数字・英字など、どの行にも属さない
// 先頭文字の場合はnullを返す（「すべて」タブでのみ見つかる曲として扱う）。
export function deriveGojuonRowKey(text) {
  const normalized = normalizeForSearch(text ?? "");
  const firstChar = normalized[0];
  if (!firstChar) return null;
  return GOJUON_ROWS.find((row) => row.chars.includes(firstChar))?.key ?? null;
}

// 【2026-09-15新設・本人指示：50音ジャンプ後は表示順も五十音順にする】日本語の
// 五十音順に文字列を比較できるCollator（Intl.Collator、"ja"ロケール）を使い回す。
// 生成コストがあるため、呼び出しのたびに new せず1つだけ保持する。
const gojuonCollator = new Intl.Collator("ja");

// 曲データ（{ searchReading?, title }を持つオブジェクト）の配列を、読み仮名
// （無ければ曲名）を基準にした自然な五十音順へ並び替えた「新しい配列」を返す
// （元の配列は書き換えない）。通常表示（既存のランダム順・シャッフル順）には使わず、
// 「50音ジャンプで絞り込んだグループの中だけ見やすくする」用途に限定する
// （本人指示：正解位置のランダム性は出題プール全体の並びで担保されており、
// グループ内の表示順を並び替えても公平性には影響しない）。
export function sortSongsByReading(songs) {
  return [...songs].sort((a, b) => {
    const readingA = normalizeForSearch(a.searchReading ?? a.title);
    const readingB = normalizeForSearch(b.searchReading ?? b.title);
    return gojuonCollator.compare(readingA, readingB);
  });
}

const previewAudioElement = document.getElementById("preview-audio");
const groupsContainerElement = document.getElementById("songlist-groups");
const totalCountElement = document.getElementById("songlist-total-count");
const breakdownElement = document.getElementById("songlist-breakdown");
const searchInputElement = document.getElementById("songlist-search-input");
const searchClearButtonElement = document.getElementById("songlist-search-clear-button");
const searchFieldRowElement = document.querySelector(".search-field-row");
const noResultsElement = document.getElementById("songlist-no-results-notice");
const totalCountChipElement = document.querySelector("#songlist-screen .total-count-chip");

// 作品単位のお気に入り一括登録/解除を行ったときの、短時間だけ表示する完了案内。
// js/customQuizPresetsScreen.jsのshowPresetActionBanner()と同じ考え方（2026-08-04追加）。
const actionBannerElement = document.getElementById("songlist-action-banner");
let actionBannerHideTimeoutId = null;
const ACTION_BANNER_DISPLAY_MS = 3000;

function showSonglistActionBanner(message) {
  actionBannerElement.textContent = message;
  actionBannerElement.hidden = false;
  if (actionBannerHideTimeoutId !== null) {
    clearTimeout(actionBannerHideTimeoutId);
  }
  actionBannerHideTimeoutId = setTimeout(() => {
    actionBannerElement.hidden = true;
    actionBannerHideTimeoutId = null;
  }, ACTION_BANNER_DISPLAY_MS);
}

// お気に入りタブ関連のDOM要素（2026-08-04追加）。
const tabAllButtonElement = document.getElementById("songlist-tab-all");
const tabFavoritesButtonElement = document.getElementById("songlist-tab-favorites");
const favoritesContainerElement = document.getElementById("songlist-favorites-container");
const favoritesCountElement = document.getElementById("songlist-favorites-count");
const favoritesListElement = document.getElementById("songlist-favorites-list");
const favoritesEmptyNoticeElement = document.getElementById("songlist-favorites-empty-notice");

// プレイリスト追加モーダル関連のDOM要素（2026-08-04追加）。
const addToPlaylistModalElement = document.getElementById("add-to-playlist-modal");
const addToPlaylistModalCloseButtonElement = document.getElementById("add-to-playlist-modal-close-button");
const addToPlaylistSongNameElement = document.getElementById("add-to-playlist-song-name");
const addToPlaylistListElement = document.getElementById("add-to-playlist-list");
const addToPlaylistEmptyNoticeElement = document.getElementById("add-to-playlist-empty-notice");
const addToPlaylistNewNameInputElement = document.getElementById("add-to-playlist-new-name-input");
const addToPlaylistNewButtonElement = document.getElementById("add-to-playlist-new-button");

// 今まさに試聴中の行のDOM要素。試聴していないときはnull。
let currentlyPlayingRowElement = null;

// 「歌詞を見る」で歌詞パネルだけを開いている行のDOM要素（音源が未読み込みで試聴はできない
// 状態）。試聴中の行はcurrentlyPlayingRowElementで管理するため、この2つは同時に同じ行を
// 指すことはない（2026-08-25追加、詳細は17-12章）。
let currentLyricsOnlyRowElement = null;

// 曲名検索の検索語。表示（どの行・シングルを見せるか）だけに関わる。
let searchQuery = "";

// 「すべての曲」「お気に入り」タブの現在の選択状態。
let activeTab = "all";

// 連続再生画面への入口（「連続再生で聴く」リンク）が、今どちらのタブを再生元にすべきか
// 判断するために参照する（2026-08-04追加）。
export function getActiveSonglistTab() {
  return activeTab;
}

// renderSongList()に渡された曲データ一式。タブ切替・お気に入り一覧の再描画に使い回す。
let allSongsRef = [];

// 「＋プレイリストに追加」モーダルを開いたときの対象曲。閉じたらnullに戻す。
let pendingAddToPlaylistSong = null;

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
    // カップリング等がまだ出揃っていないシングルだけ、見出しにComing Soon案内を添える
    // （song.comingSoonNote参照。表示専用で出題・採点には無関係、2026-08-17追加）。
    group.comingSoonNote = group.songs.find((song) => song.comingSoonNote)?.comingSoonNote ?? null;
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
  // 全画面表示ボタンは、歌詞データが実際に見つかったときだけplayPreview()側で表示する
  // （曲を選び直すたびに、まず非表示へリセットしておく。Overture等、歌詞が無い曲では
  // ボタン自体を出さないための対応。2026-08-03）。
  rowElement.querySelector(".lyrics-fullscreen-open-button").hidden = true;
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
//
// destroyLyricsSync()は、currentlyPlayingRowElementがある（＝実際にこの収録曲一覧が
// 歌詞パネルを表示していた）ときだけ呼ぶ。lyricsSync.jsは呼び出し元を問わない単一の
// 状態を持つ設計のため、ここを無条件に呼ぶと、他の画面（ライブコールモード等）が
// notifyPlaybackStarting()経由でこの関数を呼んだだけで、収録曲一覧では何も再生していないのに
// 他の画面の歌詞パネルまで巻き込んで消してしまう不具合があった（2026-08-06発見・修正）。
export function stopSongListPreview() {
  previewAudioElement.pause();
  previewAudioElement.currentTime = 0;
  releaseCurrentPreviewObjectUrl();
  // 【2026-08-25追記・重要】releaseCurrentPreviewObjectUrl()はcreateObjectURL()で発行した
  // URLを無効化するだけで、<audio>要素自身のsrc属性はそれまでのblob URLを指したまま残る。
  // 多くのブラウザは一度読み込んだメディアデータを内部に保持しているため、revokeObjectURL()
  // した後でも、そのまま.play()すると前の曲がそのまま鳴ってしまうことがある。
  // 「歌詞を見る」機能の追加で、playPreview()を経由せず.play()が呼ばれうる経路
  // （歌詞全画面の再生ボタン）ができたことでこの問題が表面化した（詳細は17-12章）。
  // srcを確実に空にしてload()し、次にplayPreview()が新しいsrcを設定するまで
  // 何も再生できない状態に完全リセットする。
  previewAudioElement.removeAttribute("src");
  previewAudioElement.load();
  if (currentlyPlayingRowElement) {
    destroyLyricsSync();
    setRowPlayingState(currentlyPlayingRowElement, false);
    resetRowSeekUI(currentlyPlayingRowElement);
    currentlyPlayingRowElement = null;
  }
  // 「歌詞を見る」で音源無しのまま開いていた行があれば、それも一緒に閉じる
  // （2026-08-25追加。試聴の開始・切り替えのたびに必ずこの関数を通るため、ここで一括して
  // 片付けることで、他の行を開いたときに前の行の歌詞パネルが開いたまま残ってしまう
  // 不具合を防ぐ。詳細は17-12章）。
  if (currentLyricsOnlyRowElement) {
    closeLyricsViewPanel(currentLyricsOnlyRowElement);
    currentLyricsOnlyRowElement = null;
  }
}

// 「歌詞を見る」で開いた歌詞パネル（音源無しの閲覧のみの状態）を閉じる。
// 「歌詞データがありません」の案内表示だけの場合はlyricsSync.js側は何も繋がっていないが、
// 歌詞が見つかって表示中の場合はlyricsSync.jsの購読・状態が残っているため、
// destroyLyricsSync()は常に呼ぶ（何も繋がっていなければ安全に無視される設計）。
function closeLyricsViewPanel(rowElement) {
  destroyLyricsSync();
  const lyricsPanel = rowElement.querySelector(".track-lyrics");
  const fullscreenButton = rowElement.querySelector(".lyrics-fullscreen-open-button");
  lyricsPanel.hidden = true;
  lyricsPanel.textContent = "";
  delete lyricsPanel.dataset.emptyState;
  fullscreenButton.hidden = true;
}

registerPlaybackStopper("preview", stopSongListPreview);

// 指定した曲の試聴を開始する。
// クイズ本編と同じ考え方で、introLeadInSecがある曲は無音区間を飛ばして頭出しする。
// 音源はIndexedDB（audioStorage.js）から取得するため非同期処理になる。
// 未読み込みの曲の場合は、試聴が補助機能であることに合わせて、エラー表示は出さず
// 静かに何もしない（再生中の見た目にもしない）。
async function playPreview(song, rowElement) {
  const blob = await getAudioBlob(song.id);
  if (!blob) return;

  // 試聴の音声を鳴らす直前に、クイズ・連続再生など他の音声を止める
  // （playbackCoordinator.js参照、2026-08-04追加）。
  notifyPlaybackStarting("preview");

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
  // 全画面表示ボタンも、実際に歌詞データが見つかった曲だけ表示する
  // （曲IDのハードコードではなく、データの有無で自動判定する。2026-08-03）。
  loadLyricsForSong(song.id, previewAudioElement, rowElement.querySelector(".track-lyrics")).then(
    (lyricsFound) => {
      if (currentlyPlayingRowElement !== rowElement) return; // 切り替わった後の古い結果は無視する
      rowElement.querySelector(".lyrics-fullscreen-open-button").hidden = !lyricsFound;
    }
  );
}

// 再生ボタンを押したときの処理。
// 今まさに試聴中の行をもう一度押した場合は一時停止/再開を切り替え（位置・歌詞パネルは維持）、
// 別の行（または何も試聴していない状態）から押した場合は、前の曲を完全に止めてから新しい曲を再生する。
function handlePlayButtonClick(song, rowElement) {
  playSfx(SFX_EVENTS.UI_CLICK);
  const isThisRowPlaying = currentlyPlayingRowElement === rowElement;
  if (isThisRowPlaying) {
    if (previewAudioElement.paused) {
      // 【2026-08-25追記】「歌詞を見る」から音源を読み込み済み・一時停止中の行を、
      // そのままこの再生ボタンで再開するケースも通るため、srcが無い場合でも
      // 未処理rejectionでコンソールを汚さないよう安全策を追加（lyricsFullscreen.jsと同じ対応）。
      previewAudioElement.play().catch(() => {});
    } else {
      previewAudioElement.pause();
    }
    return;
  }
  stopSongListPreview();
  playPreview(song, rowElement);
}

// 「歌詞を見る」ボタンの処理：試聴を開始しなくても、その曲の歌詞だけを確認できるようにする
// （2026-08-25追加、本人指示）。
//
// 【2026-08-25改訂・重要】当初は音源(src)を一切読み込まずlyricsSync.jsだけを繋ぐ設計だったが、
// それだと歌詞全画面の再生ボタンを押しても何も起こらない（音源未読み込みのため）か、
// 最悪の場合previewAudioElementに残っていた「前に試聴した別の曲」がそのまま再生されてしまう
// 不具合があった（stopSongListPreview()がsrcをクリアしていなかったことが根本原因。
// 詳細は17-12章、stopSongListPreview()側も併せて修正済み）。
// 今回から、歌詞が見つかった曲は音源も一時停止の状態で読み込んでおき、この行を正式に
// 「現在の行」（currentlyPlayingRowElement）にする。こうすることで、歌詞全画面・通常の
// 再生ボタンのどちらからも、試聴時と全く同じ仕組み（同じsrc・同じ状態管理）でその場から
// 再生を始められる。音源が未読み込みの端末では、従来どおり歌詞の閲覧だけができる状態のまま
// 静かに何もしない（エラーにはしない、既存の一貫した方針）。
async function handleLyricsViewButtonClick(song, rowElement) {
  playSfx(SFX_EVENTS.UI_CLICK);
  const lyricsPanel = rowElement.querySelector(".track-lyrics");
  const fullscreenButton = rowElement.querySelector(".lyrics-fullscreen-open-button");

  // すでにこの行が開いている（試聴中＝currentlyPlayingRowElement、または音源無しで
  // 歌詞だけ閲覧中＝currentLyricsOnlyRowElement）なら、もう一度押すと完全に閉じる（トグル）。
  if (currentlyPlayingRowElement === rowElement || currentLyricsOnlyRowElement === rowElement) {
    stopSongListPreview();
    return;
  }

  // 他に開いている行（試聴中／歌詞のみ閲覧中のどちらでも）があれば、まずしっかり閉じる。
  // 【2026-08-25修正・重要】以前はcurrentlyPlayingRowElementしか見ていなかったため、
  // 「歌詞データがありません」の行を開いたまま別の行の歌詞を見ると、前の行の案内表示が
  // 残ってしまう不具合があった。stopSongListPreview()側でcurrentLyricsOnlyRowElementも
  // まとめて片付けるよう修正済みなので、常にこれを呼べば両方のケースが正しく閉じる
  // （詳細は17-12章）。
  stopSongListPreview();

  const lyricsFound = await loadLyricsForSong(song.id, previewAudioElement, lyricsPanel);
  if (!lyricsFound) {
    // 歌詞データが端末に入っていない曲では、押せなかったことが分かる案内だけ出す
    // （エラー表示にはしない、既存の一貫した方針）。
    lyricsPanel.hidden = false;
    lyricsPanel.textContent = "歌詞データがありません";
    lyricsPanel.dataset.emptyState = "true";
    currentLyricsOnlyRowElement = rowElement;
    return;
  }
  fullscreenButton.hidden = false;

  // 【2026-08-29変更】本人指示：「歌詞を見る」は行内の簡易表示だけで止めず、既存の全画面歌詞
  // 表示（js/lyricsFullscreen.js、行の「全画面表示」ボタンと同じ仕組み）へ直接進む。
  // openFullscreenLyrics()はaudio要素にまだsrc（再生対象）が無くても安全に動く設計
  // （同ファイルのコメント参照）なので、この直後に始まる音源の非同期読み込みを待たずに
  // 呼んでよい。歌詞パネル自体はこの後も更新され続けるが、全画面側は同じlyricsPanel要素を
  // 参照しているだけなので、closeFullscreenLyrics()で元の位置へ戻る際も辻褄が合う。
  openFullscreenLyrics(song.title, previewAudioElement, lyricsPanel);

  // ここから、音源があれば一時停止の状態で読み込む（自動再生はしない）。
  // この行を正式に「現在の行」にすることで、通常の再生ボタン・シークバー・他の行へ
  // 切り替えたときの後片付けも、試聴時と完全に同じ仕組みで安全に処理される。
  const blob = await getAudioBlob(song.id);
  if (lyricsPanel.hidden) return; // 読み込み中に閉じられていたら何もしない（安全策）
  if (!blob) {
    // 音源未読み込みの端末では、歌詞の閲覧だけができる状態のまま
    // （this行を「歌詞のみ閲覧中」として記録し、他の行を開いたときに正しく片付けられるようにする）。
    currentLyricsOnlyRowElement = rowElement;
    return;
  }

  currentlyPlayingRowElement = rowElement;
  releaseCurrentPreviewObjectUrl();
  currentPreviewObjectUrl = URL.createObjectURL(blob);
  previewAudioElement.onloadedmetadata = () => {
    previewAudioElement.currentTime = song.introLeadInSec || 0;
    const rangeElement = rowElement.querySelector(".seek-range");
    rangeElement.max = previewAudioElement.duration;
    rowElement.querySelector(".seek-duration").textContent = formatTime(previewAudioElement.duration);
  };
  previewAudioElement.src = currentPreviewObjectUrl;
  setRowPlayingState(rowElement, true);
  fullscreenButton.hidden = false; // setRowPlayingState()が一旦hiddenへ戻すため、再度表示する
  rowElement.classList.add("is-audio-paused"); // まだ再生していない（一時停止扱い）ことを見た目にも反映
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
// options.playlistControls を渡すと、プレイリスト詳細画面用の「上へ/下へ/削除」ボタンを追加する
// （js/playlistScreen.jsから再利用するため。渡さなければ収録曲一覧と同じ見た目になる。2026-08-04）。
export function createTrackRow(song, options = {}) {
  const { playlistControls } = options;
  const row = document.createElement("div");
  row.className = "track-row";
  // お気に入りボタンの状態を、収録曲一覧・お気に入り一覧・プレイリスト画面など
  // 複数箇所に同じ曲の行が同時に存在していても一括で同期できるよう、曲idを持たせておく
  // （syncFavoriteButtons参照。2026-08-04）。
  row.dataset.songId = song.id;
  // 曲名検索で読み仮名・別名（愛称）も対象にできるよう、行のdata属性に持たせておく
  // （読み仮名を持たない曲はsong.searchReadingがundefinedなので、空文字列にしておく。
  // 別名は文字列と{ text, reading }オブジェクトが混在する配列のため、JSON文字列として
  // 保持する。customQuizScreen.jsの選曲行と同じパターン）。
  row.dataset.searchReading = song.searchReading ?? "";
  row.dataset.searchAliases = JSON.stringify(song.searchAliases ?? []);

  // 音源がまだ存在しない曲（hasAudioSource参照）では、再生できるように見えるボタンを
  // 出さない（本人指示・2026-08-17：「押せる・再生できると勘違いしない表示にする」）。
  // 同じ32px円形の場所に、押せないことが見た目でも分かる非活性プレースホルダーを置き、
  // 他の行と左端の位置が揃うようにする（.play-button-placeholder、CSS側でopacityを下げる）。
  const audioAvailable = hasAudioSource(song);
  let playButton;
  if (audioAvailable) {
    playButton = document.createElement("button");
    playButton.type = "button";
    playButton.className = "play-button";
    playButton.setAttribute("aria-label", `${song.title}を再生`);
    playButton.innerHTML = `
      <svg class="icon-play" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>
      <svg class="icon-pause" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
    `;
    playButton.addEventListener("click", () => handlePlayButtonClick(song, row));
  } else {
    playButton = document.createElement("span");
    playButton.className = "play-button play-button-placeholder";
    playButton.setAttribute("aria-hidden", "true");
  }

  const infoBlock = document.createElement("div");
  infoBlock.className = "track-info";

  const titleElement = document.createElement("span");
  titleElement.className = "track-title";
  titleElement.textContent = song.title;
  infoBlock.appendChild(titleElement);

  // 音源が無い曲は、試聴・同期歌詞のどちらも（歌詞パネルは試聴中にしか出せない構造のため）
  // 実質的に利用できないので、1つの案内文にまとめて表示する
  // （本人指示：「音源・歌詞Coming Soon」のようにまとめてもよい）。
  if (!audioAvailable) {
    const audioStatusElement = document.createElement("span");
    audioStatusElement.className = "track-meta-line track-audio-status-note";
    audioStatusElement.textContent = "音源・歌詞 Coming Soon";
    infoBlock.appendChild(audioStatusElement);
  }

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

  // 特別クレジット：作詞・作曲・MV監督などが通常（作詞：指原莉乃 等）と異なる曲だけ、
  // 曲名のすぐ下に小さく表示する（本人指示：全曲に付けると見づらくなるため、例外の曲のみ）。
  // urlが設定されているクレジット（監督本人のメイキング動画など）は、行内の小さなリンクにする
  // （official-link-buttonのような大きなボタンにはせず、あくまで補足情報として控えめに）。
  if (song.specialCredits?.length > 0) {
    song.specialCredits.forEach((credit) => {
      const creditElement = document.createElement("span");
      creditElement.className = "track-meta-line track-credit-line";
      creditElement.textContent = credit.text;
      if (credit.url) {
        creditElement.appendChild(document.createTextNode(" "));
        const creditLink = document.createElement("a");
        creditLink.className = "track-credit-link";
        creditLink.href = credit.url;
        creditLink.target = "_blank";
        creditLink.rel = "noopener noreferrer";
        creditLink.textContent = credit.linkLabel ?? "▶ 関連動画を見る";
        creditElement.appendChild(creditLink);
      } else if (credit.navigateTo) {
        // 外部リンクではなく、アプリ内の別画面（例：＝LOVEについてのドラマ紹介）へ移動する
        // クレジットの場合は、window宛カスタムイベント経由でjs/main.jsに画面遷移を任せる
        // （js/main.js参照。2026-08-23追加）。
        creditElement.appendChild(document.createTextNode(" "));
        const creditNavButton = document.createElement("button");
        creditNavButton.type = "button";
        creditNavButton.className = "track-credit-link track-credit-nav-button";
        creditNavButton.textContent = credit.linkLabel ?? "▶ 詳しく見る";
        // 【二重再生防止】"app-navigate"イベントのリスナー（main.js側）の先頭で既に
        // playSfx(UI_CLICK)相当のplayClickSound()が鳴っているため、ここでは重ねて鳴らさない。
        creditNavButton.addEventListener("click", () => {
          window.dispatchEvent(new CustomEvent("app-navigate", { detail: { screen: credit.navigateTo } }));
        });
        creditElement.appendChild(creditNavButton);
      }
      infoBlock.appendChild(creditElement);
    });
  }

  // MVサムネイル（2026-08-24追加、本人指示。3曲での確認を経て全曲へ展開）：曲名・センター等の
  // 情報のすぐ下、「MVを見る」ボタンの上に表示する。公式YouTubeのサムネイル画像URLをそのまま
  // 参照するだけで、アプリ側には一切保存しない（YouTubeサムネイルの標準的な扱い方、
  // img.youtube.com/vi/{videoId}/…）。サムネイル自体をタップしても「MVを見る」ボタンと
  // 同じ公式MVへ移動する。問題画面・クイズ画面など収録曲一覧以外の画面には影響しない
  // （createTrackRowは収録曲一覧・お気に入り一覧・プレイリスト画面でのみ使われる）。
  if (song.youtubeUrl) {
    const thumbLink = buildMvThumbnailElement(song.youtubeUrl, {
      ariaLabel: `${song.title}のMVを見る`,
      onBeforeNavigate: stopSongListPreview,
    });
    if (thumbLink) {
      infoBlock.appendChild(thumbLink);
    }
  }

  // 「MVを見る」「歌詞を見る」ボタンの並び。どちらか一方しか無い曲でも、
  // 常に同じ右寄せの並びになるよう共通の入れ物（.track-action-buttons）にまとめる
  // （本人指示：MVを見るボタンの横の空きへ歌詞を見るボタンを追加。2026-08-25）。
  const actionButtonsRow = document.createElement("div");
  actionButtonsRow.className = "track-action-buttons";

  // MVを見るボタン：youtubeUrlがある曲だけ、再生前の通常表示から常に見える位置に置く
  // （以前は試聴中だけ見えるシーク欄の中にあったが、MVだけ見たい人も一度試聴しないと
  // ボタンが出ないのは分かりにくいという本人フィードバックを受けて移動。2026-08-05）。
  // 公式YouTubeへ別タブで移動する（target="_blank"）。試聴中の音とMVの音が重ならないよう、
  // タブが開くのと同時に試聴は止めておく。
  if (song.youtubeUrl) {
    const mvLinkButton = document.createElement("a");
    mvLinkButton.className = "mv-link-button";
    mvLinkButton.href = song.youtubeUrl;
    mvLinkButton.target = "_blank";
    mvLinkButton.rel = "noopener noreferrer";
    mvLinkButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7Z"/></svg>
      MVを見る
    `;
    mvLinkButton.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      stopSongListPreview();
    });
    actionButtonsRow.appendChild(mvLinkButton);
  }

  // 歌詞を見るボタン：試聴していない状態でも、その曲の歌詞だけを確認できる入口
  // （2026-08-25追加、本人指示）。既存の同期歌詞パネル（lyricsSync.js）をそのまま流用し、
  // 音源を読み込まない試聴用<audio>要素（previewAudioElement、src未設定）に紐付けることで
  // 「音は鳴らさず歌詞だけ表示する」を実現する（lyricsSync.js側は音源の有無を意識しない
  // 設計のため、src未設定のまま渡しても安全に動作する。歌詞行タップ時のシークも
  // currentTimeへの代入が何も起きないだけで実害はない）。他の曲を試聴中に押した場合は
  // 先に試聴を止めてから表示する（MV導線と同じく音の重複を避けるため）。
  // Overture等、歌詞データがそもそも存在しない曲（isLyricsQuizEligibleSongで判定。
  // 歌詞クイズ専用に見える名前だが、実態は「歌詞データを持ちうる曲か」の判定であり、
  // 歌詞クイズ以外のこのボタンでも同じ意味で使い回せる）ではボタン自体を出さない。
  // 単に「まだこの端末にインポートしていないだけ」の曲とは違い、構造的に歌詞が
  // 存在しないため、押しても必ず「歌詞データがありません」しか出ず紛らわしいため
  // （2026-08-29追加、本人指示）。
  if (isLyricsQuizEligibleSong(song)) {
    const lyricsViewButton = document.createElement("button");
    lyricsViewButton.type = "button";
    lyricsViewButton.className = "lyrics-view-button";
    lyricsViewButton.innerHTML = `
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 5h16v2H4V5zm0 6h16v2H4v-2zm0 6h10v2H4v-2z"/></svg>
      歌詞を見る
    `;
    lyricsViewButton.addEventListener("click", () => handleLyricsViewButtonClick(song, row));
    actionButtonsRow.appendChild(lyricsViewButton);
  }

  // 歌詞の全画面表示を開くボタン。以前は再生中だけ見える`.track-seek`内に置いていたが、
  // 「歌詞を見る」（試聴なしの閲覧）でも全画面表示を使えるようにするため、再生状態と
  // 無関係な.track-action-buttons側へ移した（2026-08-25）。歌詞データが実際に見つかった
  // ときだけplayPreview()／handleLyricsViewButtonClick()側で表示する（Overture等、
  // 歌詞が無い曲ではボタン自体を出さない。2026-08-03からの既存方針を踏襲）。
  const lyricsFullscreenButton = document.createElement("button");
  lyricsFullscreenButton.type = "button";
  lyricsFullscreenButton.className = "lyrics-fullscreen-open-button";
  lyricsFullscreenButton.setAttribute("aria-label", "歌詞を全画面表示");
  lyricsFullscreenButton.hidden = true;
  lyricsFullscreenButton.innerHTML = `
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>
  `;
  // 再生中・「歌詞を見る」表示中のどちらでも、パネルが表示されていれば全画面表示を開ける
  // （以前は再生中限定の条件だったが、試聴なしの閲覧でも使えるよう条件を緩和した）。
  lyricsFullscreenButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    if (!lyricsPanel.hidden) {
      openFullscreenLyrics(song.title, previewAudioElement, lyricsPanel);
    }
  });
  actionButtonsRow.appendChild(lyricsFullscreenButton);

  infoBlock.appendChild(actionButtonsRow);

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
      <button type="button" class="playlist-add-open-button" aria-label="プレイリストに追加">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 6h12M4 12h12M4 18h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M18 14v6M15 17h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
    <span class="seek-time"><span class="seek-current">0:00</span> / <span class="seek-duration">0:00</span></span>
  `;
  infoBlock.appendChild(seekBlock);

  // プレイリストに追加ボタン：再生中かどうかに関わらず押せてよいが、シーク欄自体が
  // 再生中の行にしか表示されないため、実質「再生中の曲をプレイリストに追加する」導線になる
  // （2026-08-04追加。一覧の見た目を圧迫しないよう、常時表示のボタンにはしていない）。
  seekBlock.querySelector(".playlist-add-open-button").addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openAddToPlaylistModal(song);
  });

  // シークバー・10秒戻す/送るボタンは再生位置の微調整用の操作のため、他の画面のシーク系
  // 操作と同じ考え方で効果音は付けない（連打・ドラッグでも音が鳴り続けて煩わしくなるため）。
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

  const actionColumn = document.createElement("div");
  actionColumn.className = "track-action-column";
  actionColumn.appendChild(buildFavoriteButton(song));
  actionColumn.appendChild(categoryPill);

  row.appendChild(playButton);
  row.appendChild(infoBlock);
  row.appendChild(actionColumn);

  // プレイリスト詳細画面だけで使う「上へ/下へ/削除」ボタン（js/playlistScreen.jsから
  // options.playlistControlsを渡されたときだけ追加する。収録曲一覧・お気に入り一覧には出さない）。
  if (playlistControls) {
    row.appendChild(buildPlaylistControlButtons(playlistControls));
  }

  return row;
}

// 曲のお気に入りハートボタンを作る。メンバー一覧の「推し」ハートと見た目の形は揃えつつ、
// 混同しないよう色をコーラルオレンジ系（.track-favorite-button）にしている（2026-08-04）。
const SONG_HEART_ICON_PATH =
  "M12 20.5 4.6 13.2C2 10.6 2.3 6.4 5.3 4.4c2.3-1.5 5.2-1 6.7 1 1.5-2 4.4-2.5 6.7-1 3 2 3.3 6.2.7 8.8L12 20.5Z";

function buildFavoriteButton(song) {
  const button = document.createElement("button");
  button.type = "button";
  const isFavorite = isFavoriteSong(song.id);
  button.className = "track-favorite-button";
  button.classList.toggle("is-favorite", isFavorite);
  button.dataset.songId = song.id;
  button.setAttribute("aria-label", isFavorite ? "お気に入りを解除する" : "お気に入りに登録する");
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SONG_HEART_ICON_PATH}"/></svg>`;
  button.addEventListener("click", (event) => {
    playSfx(SFX_EVENTS.UI_CLICK);
    event.stopPropagation();
    toggleFavoriteSong(song.id);
    syncFavoriteButtons(song.id);
    // お気に入りタブを見ているときに解除すると、その場で一覧から消えるようにする。
    if (activeTab === "favorites") {
      renderFavoritesList();
    }
  });
  return button;
}

// 同じ曲のハートボタンが複数箇所（収録曲一覧・お気に入り一覧・プレイリスト画面）に
// 同時に存在していても、登録状態の見た目をまとめて正しく揃える（2026-08-04）。
function syncFavoriteButtons(songId) {
  const isFavorite = isFavoriteSong(songId);
  document.querySelectorAll(`.track-favorite-button[data-song-id="${songId}"]`).forEach((button) => {
    button.classList.toggle("is-favorite", isFavorite);
    button.setAttribute("aria-label", isFavorite ? "お気に入りを解除する" : "お気に入りに登録する");
  });
}

// 「すべての曲」タブのアコーディオンは、アプリ起動時に一度だけ作られてそのまま使い回される
// （resetSongListToDefaultView()は開閉状態のリセットのみで、行そのものは作り直さない）ため、
// プレイヤーを切り替えたときは、それまで表示していたハートの状態が前のプレイヤーのまま
// 残ってしまう。main.js側のonPlayerChangedから呼び、画面上の全ハートボタンを今の
// プレイヤーの状態に合わせて一括で描き直す（2026-08-04追加）。
export function refreshAllFavoriteButtons() {
  document.querySelectorAll(".track-favorite-button[data-song-id]").forEach((button) => {
    const isFavorite = isFavoriteSong(button.dataset.songId);
    button.classList.toggle("is-favorite", isFavorite);
    button.setAttribute("aria-label", isFavorite ? "お気に入りを解除する" : "お気に入りに登録する");
  });
  // 作品単位の一括登録ボタン（未登録／一部登録済み／全登録済み）も同様に描き直す。
  document.querySelectorAll(".single-group-favorite-button").forEach(refreshWorkFavoriteButtonState);
}

// プレイリスト詳細画面用の「上へ/下へ/削除」ボタン列を作る。
function buildPlaylistControlButtons({ onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }) {
  const column = document.createElement("div");
  column.className = "track-playlist-controls";

  const upButton = document.createElement("button");
  upButton.type = "button";
  upButton.className = "track-playlist-control-button";
  upButton.setAttribute("aria-label", "1つ上へ移動する");
  upButton.textContent = "↑";
  upButton.disabled = !canMoveUp;
  upButton.addEventListener("click", (event) => {
    playSfx(SFX_EVENTS.UI_CLICK);
    event.stopPropagation();
    onMoveUp();
  });

  const downButton = document.createElement("button");
  downButton.type = "button";
  downButton.className = "track-playlist-control-button";
  downButton.setAttribute("aria-label", "1つ下へ移動する");
  downButton.textContent = "↓";
  downButton.disabled = !canMoveDown;
  downButton.addEventListener("click", (event) => {
    playSfx(SFX_EVENTS.UI_CLICK);
    event.stopPropagation();
    onMoveDown();
  });

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "track-playlist-control-button is-remove";
  removeButton.setAttribute("aria-label", "プレイリストから削除する");
  removeButton.textContent = "×";
  // このボタンは確認モーダルを経由せず即座に削除を実行するため、「決定・確定」寄りの
  // UI_CONFIRMを使う（本人指示：削除等の危険操作の確定音の考え方に合わせる）。
  removeButton.addEventListener("click", (event) => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    event.stopPropagation();
    onRemove();
  });

  column.appendChild(upButton);
  column.appendChild(downButton);
  column.appendChild(removeButton);
  return column;
}

// このアコーディオン区分が「単一の作品（workId）」を表しているかを判定する。
// 「配信限定シングル」区分のように、複数の異なる作品を1つの見出しにまとめている場合や、
// 866のようにworkIdを持たない曲だけの場合は、作品単位の一括登録ボタンを出さない
// （どの作品を操作しているのか本人に伝わらなくなるため。2026-08-04追加）。
// プレイリストへの曲追加画面（playlistAddSongsScreen.js）の作品単位一括選択でも
// 同じ判定ロジックを再利用するため、外部公開している（UI/UX再設計で追加）。
export function resolveGroupWorkId(groupSongs) {
  const workIds = new Set(groupSongs.map((song) => song.workId));
  if (workIds.size !== 1) return null;
  const [workId] = workIds;
  return workId ?? null;
}

// 作品単位のお気に入りボタンの見た目（未登録／一部登録済み／全登録済み）を、
// 現在のお気に入り状態に合わせて描き直す。ボタン作成時だけでなく、プレイヤー切替時
// （refreshAllFavoriteButtons参照）にも外から呼べるよう、対象曲idと作品名をボタン自身の
// data属性に持たせておく（2026-08-04追加）。
function refreshWorkFavoriteButtonState(button) {
  const groupSongIds = JSON.parse(button.dataset.groupSongIds);
  const groupLabel = button.dataset.groupLabel;
  const allFavorited = areAllFavoriteSongs(groupSongIds);
  const anyFavorited = isAnyFavoriteSong(groupSongIds);
  button.classList.toggle("is-full", allFavorited);
  button.classList.toggle("is-partial", !allFavorited && anyFavorited);
  button.setAttribute(
    "aria-label",
    allFavorited ? `${groupLabel}の全曲をお気に入りから解除する` : `${groupLabel}の全曲をお気に入りに登録する`
  );
}

// 作品単位のお気に入り一括登録/解除ボタンを作る。
// 「未登録／一部登録済み／全登録済み」の3状態を見た目で区別する
// （一部登録済みのときに押すと、残りの未登録曲だけを追加登録する）。
function buildWorkFavoriteButton(groupLabel, groupSongIds, onChanged) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "single-group-favorite-button";
  button.dataset.groupSongIds = JSON.stringify(groupSongIds);
  button.dataset.groupLabel = groupLabel;
  refreshWorkFavoriteButtonState(button);

  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${SONG_HEART_ICON_PATH}"/></svg>
    <span>全曲</span>
  `;
  button.addEventListener("click", (event) => {
    playSfx(SFX_EVENTS.UI_CLICK);
    event.stopPropagation();
    const allFavorited = areAllFavoriteSongs(groupSongIds);
    if (allFavorited) {
      removeFavoriteSongs(groupSongIds);
      showSonglistActionBanner(`${groupLabel}の${groupSongIds.length}曲をお気に入りから解除しました`);
    } else {
      const additionCount = groupSongIds.filter((songId) => !isFavoriteSong(songId)).length;
      addFavoriteSongs(groupSongIds);
      showSonglistActionBanner(`${groupLabel}の${additionCount}曲をお気に入りに追加しました`);
    }
    refreshWorkFavoriteButtonState(button);
    groupSongIds.forEach((songId) => syncFavoriteButtons(songId));
    onChanged();
  });

  return button;
}

// 1つのシングル区分（アコーディオン1つ分）を作る。
// 「開閉」（.single-group-header）と「作品ごとのお気に入り登録」（.single-group-favorite-button）を
// 別々のボタンに分けている（ボタンの中にボタンは入れられないため。オリジナル問題作成モードの
// 選曲画面の「全選択・全解除」と同じ考え方、2026-08-04追加）。
function createSingleGroupElement(group, isInitiallyOpen) {
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
    <span class="track-count-chip">${group.songs.length}曲</span>
  `;
  toggleButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    // 再生中の曲を含むアコーディオンを閉じるときは、必ず試聴を止める
    const willClose = groupElement.classList.contains("is-open");
    if (willClose && currentlyPlayingRowElement && groupElement.contains(currentlyPlayingRowElement)) {
      stopSongListPreview();
    }
    groupElement.classList.toggle("is-open");
  });
  headerRow.appendChild(toggleButton);

  // この区分がちょうど1つの作品（workId）だけで構成されているときだけ、
  // 作品単位の一括お気に入りボタンを追加する。
  const workId = resolveGroupWorkId(group.songs);
  if (workId) {
    const groupSongIds = group.songs.map((song) => song.id);
    const bulkActions = document.createElement("div");
    bulkActions.className = "single-group-bulk-actions";
    bulkActions.appendChild(
      buildWorkFavoriteButton(group.label, groupSongIds, () => {
        if (activeTab === "favorites") {
          renderFavoritesList();
        }
      })
    );
    headerRow.appendChild(bulkActions);
  }

  const tracksContainer = document.createElement("div");
  tracksContainer.className = "single-group-tracks";
  group.songs.forEach((song) => {
    tracksContainer.appendChild(createTrackRow(song));
  });

  groupElement.appendChild(headerRow);

  // カップリング等がまだ出揃っていない案内は、見出し行と横幅を取り合わないよう
  // 独立した行にする（375px幅で長い曲名が潰れてしまう不具合を2026-08-17に修正）。
  if (group.comingSoonNote) {
    const comingSoonRow = document.createElement("p");
    comingSoonRow.className = "coming-soon-note";
    comingSoonRow.textContent = group.comingSoonNote;
    groupElement.appendChild(comingSoonRow);
  }

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
  allSongsRef = songs;
  totalCountElement.textContent = songs.length;
  renderCategoryBreakdown(songs);

  const groups = buildSongGroups(songs);
  const newestGroup = groups[0]; // orderで並び替え済みなので、先頭＝一番新しいシングル

  groupsContainerElement.innerHTML = "";
  groups.forEach((group) => {
    groupsContainerElement.appendChild(createSingleGroupElement(group, group === newestGroup));
  });
}

// 「お気に入り」タブの中身を組み立てる（シングル区分なし、曲データの並び順そのままの
// フラットな一覧）。お気に入りの登録/解除のたびに呼び直して最新の状態に保つ（2026-08-04）。
function renderFavoritesList() {
  const favoriteSongs = allSongsRef.filter((song) => isFavoriteSong(song.id));
  favoritesCountElement.textContent = `お気に入り ${favoriteSongs.length}曲`;
  favoritesListElement.innerHTML = "";
  favoriteSongs.forEach((song) => {
    favoritesListElement.appendChild(createTrackRow(song));
  });
  favoritesEmptyNoticeElement.hidden = favoriteSongs.length > 0;
}

// 「すべての曲」「お気に入り」タブを切り替える。切替時は試聴中の曲を必ず止める
// （別タブに移ると再生中の行が画面から消え、操作できないミニプレイヤーだけが
// 残ってしまうのを防ぐため。single-groupの開閉時と同じ考え方）。
function switchSonglistTab(tab) {
  if (activeTab === tab) return;
  stopSongListPreview();
  activeTab = tab;

  tabAllButtonElement.classList.toggle("is-active", tab === "all");
  tabFavoritesButtonElement.classList.toggle("is-active", tab === "favorites");

  const isFavoritesTab = tab === "favorites";
  groupsContainerElement.hidden = isFavoritesTab;
  totalCountChipElement.hidden = isFavoritesTab;
  breakdownElement.hidden = isFavoritesTab;
  searchFieldRowElement.hidden = isFavoritesTab;
  noResultsElement.hidden = true; // タブを切り替えたら、前のタブの検索結果なし表示は必ず消す
  favoritesContainerElement.hidden = !isFavoritesTab;

  if (isFavoritesTab) {
    renderFavoritesList();
  }
}

tabAllButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_CLICK);
  switchSonglistTab("all");
});
tabFavoritesButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_CLICK);
  switchSonglistTab("favorites");
});

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
  playSfx(SFX_EVENTS.UI_CLICK);
  resetSearch();
  searchInputElement.focus();
});

// 収録曲一覧画面を開くたびに呼ぶ。最新のシングルだけ展開し、それ以外は畳んだ状態に戻す
// （閲覧中に開閉した状態を次回に持ち越さず、毎回同じ見え方から始められるようにするため）。
// あわせて検索語・タブ選択もリセットする。
// initialTabに"favorites"を渡すと、開いた直後から「お気に入り」タブを表示する
// （スタート画面の「お気に入り」タイルから直接開くための入口。UI/UX再設計で追加）。
export function resetSongListToDefaultView(initialTab = "all") {
  const groupElements = groupsContainerElement.querySelectorAll(".single-group");
  groupElements.forEach((element, index) => {
    element.classList.toggle("is-open", index === 0);
  });
  resetSearch();
  activeTab = "all";
  tabAllButtonElement.classList.add("is-active");
  tabFavoritesButtonElement.classList.remove("is-active");
  groupsContainerElement.hidden = false;
  totalCountChipElement.hidden = false;
  breakdownElement.hidden = false;
  searchFieldRowElement.hidden = false;
  favoritesContainerElement.hidden = true;

  if (initialTab === "favorites") {
    switchSonglistTab("favorites");
  }
}

// ---- 「＋プレイリストに追加」モーダル ----

// モーダルを開き、対象曲名・登録済みプレイリスト一覧を表示する。
function openAddToPlaylistModal(song) {
  pendingAddToPlaylistSong = song;
  addToPlaylistSongNameElement.textContent = song.title;
  addToPlaylistNewNameInputElement.value = "";
  renderAddToPlaylistList();
  addToPlaylistModalElement.hidden = false;
}

function closeAddToPlaylistModal() {
  addToPlaylistModalElement.hidden = true;
  pendingAddToPlaylistSong = null;
}

// プレイリスト一覧を、それぞれ「追加する/追加済み」ボタンとして描画する。
// 追加済みのプレイリストも一覧には出したままにする（何に入っているか確認・見返せるように）。
function renderAddToPlaylistList() {
  const playlists = getPlaylists();
  addToPlaylistListElement.innerHTML = "";
  addToPlaylistEmptyNoticeElement.hidden = playlists.length > 0;

  playlists.forEach((playlist) => {
    const isAdded = playlist.songIds.includes(pendingAddToPlaylistSong.id);

    const row = document.createElement("div");
    row.className = "add-to-playlist-row";

    const nameSpan = document.createElement("span");
    nameSpan.className = "add-to-playlist-row-name";
    nameSpan.textContent = playlist.playlistName || "（名前未設定）";
    row.appendChild(nameSpan);

    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "add-to-playlist-row-button";
    actionButton.classList.toggle("is-added", isAdded);
    actionButton.textContent = isAdded ? "追加済み" : "＋ 追加する";
    actionButton.disabled = isAdded;
    actionButton.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      addSongToPlaylist(playlist.playlistId, pendingAddToPlaylistSong.id);
      renderAddToPlaylistList();
    });
    row.appendChild(actionButton);

    addToPlaylistListElement.appendChild(row);
  });
}

// モーダル内から直接、新しいプレイリストを作ってその場で曲を追加する
// （「プレイリスト画面で先に作ってから、また曲一覧に戻って追加する」という
// 手戻りのある動線を避けるため。2026-08-04）。
function commitCreatePlaylistAndAddSong() {
  const name = addToPlaylistNewNameInputElement.value.trim();
  if (!name || !pendingAddToPlaylistSong) return;
  // ボタンクリック・Enterキーのどちらから呼ばれても、新規作成の確定は1回だけ鳴ればよいため、
  // ボタン側ではなくこの共通関数の中で鳴らす（入力欄が空のときは何も起きないため鳴らさない）。
  playSfx(SFX_EVENTS.UI_CONFIRM);
  const newPlaylist = createPlaylist(name);
  addSongToPlaylist(newPlaylist.playlistId, pendingAddToPlaylistSong.id);
  addToPlaylistNewNameInputElement.value = "";
  renderAddToPlaylistList();
}

addToPlaylistModalCloseButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  closeAddToPlaylistModal();
});
addToPlaylistModalElement.addEventListener("click", (event) => {
  // 新規プレイリスト名の入力中に外側を誤タップして、入力中の文字が消えたりモーダルが
  // 閉じたりしないようにする（プレイヤー名変更モーダルで発生した不具合と同じ対策）。
  if (document.activeElement === addToPlaylistNewNameInputElement) return;
  if (event.target === addToPlaylistModalElement) closeAddToPlaylistModal();
});
addToPlaylistNewButtonElement.addEventListener("click", commitCreatePlaylistAndAddSong);
// Enterキーでも作成できるようにする。stopPropagation()で、document側のキー操作
// リスナー（main.js）まで伝わって別のショートカットが誤発火しないようにする
// （プレイヤー名変更モーダルで発生した不具合と同じ対策。2026-08-04）。
addToPlaylistNewNameInputElement.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.isComposing) {
    event.preventDefault();
    event.stopPropagation();
    commitCreatePlaylistAndAddSong();
  }
});
