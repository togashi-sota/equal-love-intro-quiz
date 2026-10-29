// 新しいライブコールの画面（2026-10-30新設・リニューアル第3〜5段階）。
// 流れ：はじめに（注意事項。版が上がったらもう一度出す）→ 曲一覧 → 曲のページ（3つのモードのカード）→ モード
//   ・コール表   ：本人がコール表エディターの「完成プレビュー」で見ている並びと同じ（js/callTextView.js をそのまま使う）。文字の大きさ・手でスクロール
//   ・ライブコール：同じコール表を、本人の時刻（開始〜終了）どおりに光らせる（演出デザイン C）。スクロールは案D（コール優先）
//   ・カラオケ   ：歌詞（AI の歌詞時刻）を行ごとに強調する今までの表示（js/lyricsSync.js）。コールは出さない
// 画面は1つ（#live-call-screen）で、中の表示の行き来はこのファイルが受け持つ（［戻る］で1つ前の表示へ。端末の「戻る」も同じ）。
// データの組み立ては js/liveCallData.js（純粋関数）。この画面は「読む・描く・音を鳴らす」だけで、保存データを書き換えない
// （書くのは文字の大きさ・演出の強さなどの表示の好みだけ。localStorage）。
import { SONGS, getSongById } from "./data/songs.js";
import { MEMBERS } from "./data/members.js";
import { CALL_EFFECTS } from "./data/callEffects.js";
import { getAudioBlob, getImportedSongIds } from "./audioStorage.js";
import { getCallData, getAllReleasedCallRecords, getReleasedCallRecord } from "./callStorage.js";
import { getLyricsData, getImportedLyricsSongIds } from "./lyricsStorage.js";
import { renderCallTextView } from "./callTextView.js";
import { hashText } from "./callTextEdits.js";
import { buildReleasedCallSheet, computeModeAvailability, activeCallKeysAt, buildFollowSong, classifyReleasedCalls, SHEET_STATE } from "./liveCallData.js";
import { createRunner, panelState } from "./callFollow.js";
import { stateAt } from "./callEffects.js";
import { decorateCallSpan, applyCallState } from "./callEffectsRenderer.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { normalizeForSearch, songMatchesSearch } from "./songSearch.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

// ===== はじめに（注意事項）の版 =====
// 中身を変えたら数字を上げる（上げると、次に開いたときにもう一度表示される）
export const LIVE_CALL_NOTICE_VERSION = 1;
const NOTICE_KEY = "equalLoveIntroQuiz.liveCallNoticeSeenVersion";
const PREFS_KEY = "equalLoveIntroQuiz.liveCallPrefs";
const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
const SEEK_SKIP_SECONDS = 5;
const PRE_ROLL_SECONDS = 1; // コールをタップしたとき、その少し前から再生する

export function shouldShowLiveCallNotice(seenVersion, currentVersion = LIVE_CALL_NOTICE_VERSION) {
  const seen = Number(seenVersion);
  return !(Number.isFinite(seen) && seen >= currentVersion);
}

// ===== 曲一覧の並べ方・絞り込み（純粋関数。テストで使う） =====
const collator = new Intl.Collator("ja");
export const LIST_SORTS = {
  gojuon: "五十音順",
  release: "発売順",
  newest: "新しい順",
};
export const LIST_FILTERS = {
  all: "すべて",
  sheet: "コール表あり",
  audio: "音源あり",
};

export function sortLiveCallSongs(songs, sort) {
  const list = [...songs];
  if (sort === "release") return list.sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)) || collator.compare(a.title, b.title));
  if (sort === "newest") return list.sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)) || collator.compare(a.title, b.title));
  return list.sort((a, b) => collator.compare(normalizeForSearch(a.searchReading ?? a.title), normalizeForSearch(b.searchReading ?? b.title)));
}

// query：検索欄の文字（ひらがな・カタカナ・全角半角・空白の違いはそろえる）。曲名・読みのどこかに含まれるか、別名と一致
export function filterLiveCallSongs(songs, { query = "", filter = "all", sheetIds = new Set(), audioIds = new Set() } = {}) {
  // 半角カナ・全角英数も同じにそろえてから（NFKC）、アプリの検索と同じそろえ方をする
  const norm = (text) => normalizeForSearch(String(text ?? "").normalize("NFKC"));
  const q = norm(query);
  return songs.filter((song) => {
    if (filter === "sheet" && !sheetIds.has(song.id)) return false;
    if (filter === "audio" && !audioIds.has(song.id)) return false;
    if (!q) return true;
    if ([song.title, song.searchReading ?? ""].some((text) => norm(text).includes(q))) return true;
    return songMatchesSearch(song.title, song.searchReading, song.searchAliases, q);
  });
}

// ===== 表示の好み（この端末だけ） =====
function loadPrefs() {
  const defaults = { fontIndex: 1, intensity: "std", panel: true, sort: "gojuon", filter: "all" };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return defaults;
    return {
      fontIndex: Number.isInteger(raw.fontIndex) && raw.fontIndex >= 0 && raw.fontIndex < FONT_SCALES.length ? raw.fontIndex : defaults.fontIndex,
      intensity: ["std", "low", "off"].includes(raw.intensity) ? raw.intensity : defaults.intensity,
      panel: typeof raw.panel === "boolean" ? raw.panel : defaults.panel,
      sort: Object.hasOwn(LIST_SORTS, raw.sort) ? raw.sort : defaults.sort,
      filter: Object.hasOwn(LIST_FILTERS, raw.filter) ? raw.filter : defaults.filter,
    };
  } catch {
    return defaults;
  }
}
function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 保存できない環境（プライベートブラウズ等）では、今回だけの設定として使う
  }
}
function readNoticeVersion() {
  try {
    return localStorage.getItem(NOTICE_KEY);
  } catch {
    return null;
  }
}
function writeNoticeVersion() {
  try {
    localStorage.setItem(NOTICE_KEY, String(LIVE_CALL_NOTICE_VERSION));
  } catch {
    // 保存できなくても先へ進める
  }
}

// ===== 状態 =====
let root = null;
let audio = null;
let callbacks = null;
let prefs = loadPrefs();
let view = null; // "notice" | "list" | "song" | "sheet" | "live" | "karaoke"
let noticeReturn = null; // はじめにを読み直したときに戻る表示
let listQuery = "";
let listScrollTop = 0;
let currentSongId = null;
let songData = null; // { song, record, lyricsRecord, sheet, avail, hasAudio }
let objectUrl = null;
let live = null; // ライブコールの表示中の状態
let karaokeCleanup = null; // カラオケの音源イベントの購読を外す関数
// 【2026-10-30追加・ホーム案F】ホームの「コール表／ライブコール／カラオケ」から開いたときに選んでおく遊び方（無ければ null）。
// 選んであれば、一覧で曲を押したとき、その遊び方が使える曲はそのモードを直接開く（使えない曲は今までどおり曲のページで理由を出す）。
let preferredMode = null;
let openedModeFromList = false; // 一覧から直接モードを開いた（［戻る］で一覧へ戻す）
const reducedMotion = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener() {} };

const titleOf = (songId) => getSongById(songId)?.title ?? songId;
const memberColorOf = (id) => MEMBERS.find((member) => member.id === id)?.memberColor?.hex ?? "#ffb3d1";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(className, text, onClick) {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}
function formatTime(totalSeconds) {
  const s = Number.isFinite(totalSeconds) ? Math.max(0, totalSeconds) : 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

// ほかの音（クイズ・試聴・連続再生）が始まったら止める
registerPlaybackStopper("liveCallRenewal", () => audio?.pause());

// ===== 表示の切り替え =====
function setHeading(text) {
  if (callbacks?.heading) callbacks.heading.textContent = text;
}

function teardownPlayback() {
  stopLive();
  karaokeCleanup?.();
  karaokeCleanup = null;
  destroyLyricsSync();
  if (audio) {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  }
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function show(next) {
  if (view === "list" && root) listScrollTop = window.scrollY;
  // モードを出るときは、音・毎フレームの描画・イベントの購読を必ず片付ける
  if (view === "live" || view === "karaoke" || view === "sheet") teardownPlayback();
  view = next;
  root.textContent = "";
  root.dataset.view = next;
  if (next === "notice") renderNotice();
  else if (next === "list") renderList();
  else if (next === "song") renderSongPage();
  else if (next === "sheet") renderSheetMode();
  else if (next === "live") renderLiveMode();
  else if (next === "karaoke") renderKaraokeMode();
}

// 遊び方の名前（一覧の案内に出す）
export const LIVE_CALL_MODE_LABELS = { sheet: "コール表", live: "ライブコール", karaoke: "カラオケ" };

// 一覧で曲を押したとき、選んである遊び方を直接開くか（純粋関数）。avail は computeModeAvailability の戻り値
export function resolvePreferredModeOpen(mode, avail) {
  if (!mode || !LIVE_CALL_MODE_LABELS[mode]) return null;
  return avail?.[mode]?.ok ? mode : null;
}

// 入口（ホームのライブコール・ゲームのライブコールモード）から開く。はじめに を見ていなければ先に出す
// options.mode：最初から選んでおく遊び方（"sheet" | "live" | "karaoke"。ホーム案Fから）。無ければ選ばない
export function openLiveCallScreen(options = {}) {
  currentSongId = null;
  songData = null;
  preferredMode = LIVE_CALL_MODE_LABELS[options?.mode] ? options.mode : null;
  openedModeFromList = false;
  if (shouldShowLiveCallNotice(readNoticeVersion())) {
    noticeReturn = null;
    show("notice");
  } else show("list");
  window.scrollTo(0, 0);
}

// ［戻る］（端末の「戻る」も同じ）：中の1つ前の表示へ。曲一覧（または最初のはじめに）なら false（画面を出る）
export function goBackInLiveCall() {
  if ((view === "sheet" || view === "live" || view === "karaoke") && openedModeFromList) {
    // 一覧から直接開いたモード：一覧の同じ位置へ戻す
    openedModeFromList = false;
    show("list");
    window.scrollTo(0, listScrollTop);
    return true;
  }
  if (view === "sheet" || view === "live" || view === "karaoke") {
    show("song");
    window.scrollTo(0, 0);
    return true;
  }
  if (view === "song") {
    show("list");
    window.scrollTo(0, listScrollTop);
    return true;
  }
  if (view === "notice" && noticeReturn) {
    const back = noticeReturn;
    noticeReturn = null;
    show(back);
    return true;
  }
  teardownPlayback();
  view = null;
  return false;
}

export function closeLiveCallScreen() {
  teardownPlayback();
  view = null;
}

// ===== はじめに =====
function renderNotice() {
  setHeading("ライブコール");
  const box = el("section", "lc-notice");
  box.appendChild(el("h3", "lc-notice-title", "はじめにお読みください"));
  const list = el("ul", "lc-notice-list");
  [
    "コール表は、このアプリの作者が確認して「完成」にした曲だけ表示します。まだの曲は「この曲のコール表はまだありません」と表示します（その曲のライブにコールが無いという意味ではありません）。",
    "実際のライブでは、会場・運営の案内とマナーを優先してください。周りの人の迷惑になる大きな声・動きはやめましょう。",
    "ライブコールの光るタイミングは、この端末の音源に合わせたものです。歌詞の行の強調は目安です。",
    "歌詞・音源・コールのデータは、この端末の中だけで使います（インターネットへ送りません）。",
    "演出（光り方・動き）の強さは、ライブコールの画面で「標準・控えめ・オフ」から選べます。端末の「視差効果を減らす」がオンのときは動きを止めます。",
  ].forEach((text) => list.appendChild(el("li", "", text)));
  box.appendChild(list);
  box.appendChild(el("p", "lc-notice-version", `注意事項の版：${LIVE_CALL_NOTICE_VERSION}（内容が変わったときは、もう一度表示します）`));
  box.appendChild(
    button("lc-primary-button", "わかりました", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      writeNoticeVersion();
      const back = noticeReturn ?? "list";
      noticeReturn = null;
      show(back);
      window.scrollTo(0, 0);
    }),
  );
  root.appendChild(box);
}

// ===== 曲一覧 =====
async function renderList() {
  setHeading("ライブコール");
  const wrap = el("section", "lc-list");
  const top = el("div", "lc-list-top");
  top.appendChild(
    button("lc-link-button", "はじめに（注意事項）を読む", () => {
      noticeReturn = "list";
      show("notice");
      window.scrollTo(0, 0);
    }),
  );
  wrap.appendChild(top);
  if (preferredMode) {
    const modeNote = el("div", "lc-preferred-mode");
    modeNote.appendChild(el("p", "lc-preferred-mode-text", `「${LIVE_CALL_MODE_LABELS[preferredMode]}」で開きます。使えない曲は、曲のページで理由を表示します。`));
    modeNote.appendChild(
      button("lc-link-button", "遊び方を選ばずに探す", () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        preferredMode = null;
        show("list");
      }),
    );
    wrap.appendChild(modeNote);
  }

  const search = el("input", "lc-search");
  search.type = "search";
  search.placeholder = "曲名・よみで探す";
  search.setAttribute("aria-label", "曲名・よみで探す");
  search.value = listQuery;
  wrap.appendChild(search);

  const controls = el("div", "lc-list-controls");
  const sortLabel = el("label", "lc-select-label", "並び ");
  const sortSelect = el("select", "lc-select");
  Object.entries(LIST_SORTS).forEach(([value, label]) => {
    const option = el("option", "", label);
    option.value = value;
    sortSelect.appendChild(option);
  });
  sortSelect.value = prefs.sort;
  sortLabel.appendChild(sortSelect);
  controls.appendChild(sortLabel);
  const filterGroup = el("div", "lc-chips");
  filterGroup.setAttribute("role", "group");
  filterGroup.setAttribute("aria-label", "絞り込み");
  controls.appendChild(filterGroup);
  wrap.appendChild(controls);

  const count = el("p", "lc-count", "読み込み中…");
  count.setAttribute("aria-live", "polite");
  wrap.appendChild(count);
  const listBox = el("ul", "lc-song-list");
  wrap.appendChild(listBox);
  root.appendChild(wrap);

  let records = new Map();
  let audioIds = new Set();
  let lyricsIds = new Set();
  try {
    [records, audioIds, lyricsIds] = await Promise.all([
      getAllReleasedCallRecords().catch(() => new Map()),
      getImportedSongIds().then((ids) => new Set(ids)).catch(() => new Set()),
      getImportedLyricsSongIds().then((ids) => new Set(ids)).catch(() => new Set()),
    ]);
  } catch (error) {
    console.warn("ライブコール：一覧の材料を読めませんでした", error);
  }
  if (view !== "list") return;
  const sheetIds = new Set([...records.values()].filter((record) => record?.current).map((record) => record.songId));

  const draw = () => {
    filterGroup.textContent = "";
    Object.entries(LIST_FILTERS).forEach(([value, label]) => {
      const chip = button(`lc-chip${prefs.filter === value ? " is-selected" : ""}`, label, () => {
        prefs.filter = value;
        savePrefs();
        draw();
      });
      chip.setAttribute("aria-pressed", String(prefs.filter === value));
      filterGroup.appendChild(chip);
    });
    const songs = sortLiveCallSongs(filterLiveCallSongs(SONGS, { query: listQuery, filter: prefs.filter, sheetIds, audioIds }), prefs.sort);
    count.textContent = `${songs.length}曲（コール表あり ${sheetIds.size}曲／全${SONGS.length}曲）`;
    listBox.textContent = "";
    songs.forEach((song) => {
      const item = el("li", "lc-song-item");
      const row = button("lc-song-row", "", () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        openSong(song.id);
      });
      row.appendChild(el("span", "lc-song-title", song.title));
      const badges = el("span", "lc-song-badges");
      badges.appendChild(el("span", `lc-badge ${sheetIds.has(song.id) ? "is-sheet" : "is-nosheet"}`, sheetIds.has(song.id) ? "コール表あり" : "コール表なし"));
      if (!audioIds.has(song.id)) badges.appendChild(el("span", "lc-badge is-missing", "音源なし"));
      if (!lyricsIds.has(song.id) && song.id !== "overture") badges.appendChild(el("span", "lc-badge is-missing", "歌詞なし"));
      row.appendChild(badges);
      item.appendChild(row);
      listBox.appendChild(item);
    });
    if (!songs.length) listBox.appendChild(el("li", "lc-empty", "見つかりませんでした。検索の文字・絞り込みを変えてください。"));
  };
  search.addEventListener("input", () => {
    listQuery = search.value;
    draw();
  });
  sortSelect.addEventListener("change", () => {
    prefs.sort = sortSelect.value;
    savePrefs();
    draw();
  });
  draw();
}

// ===== 曲のページ =====
async function loadSongData(songId) {
  const song = getSongById(songId);
  const [record, lyricsRecord, callRecord, blob] = await Promise.all([
    getReleasedCallRecord(songId).catch(() => null),
    getLyricsData(songId).catch(() => null),
    getCallData(songId).catch(() => null),
    getAudioBlob(songId).catch(() => null),
  ]);
  const sheet = buildReleasedCallSheet({ record: record ? { ...record, songId } : null, lyricsRecord, deviceCalls: Array.isArray(callRecord?.calls) ? callRecord.calls : [] });
  const hasAudio = Boolean(blob);
  const avail = computeModeAvailability({ sheet, hasAudio, lyricsRecord });
  return { song, record, lyricsRecord, sheet, avail, hasAudio, blob };
}

async function openSong(songId) {
  currentSongId = songId;
  songData = null;
  openedModeFromList = false;
  pendingPreferredOpen = Boolean(preferredMode);
  show("song");
  window.scrollTo(0, 0);
}
let pendingPreferredOpen = false; // 一覧から押した直後だけ、選んである遊び方を直接開く

function modeCard({ id, title, description, availability, onOpen, preview }) {
  const card = el("div", `lc-mode-card is-${id}${availability.ok ? "" : " is-unavailable"}`);
  const previewBox = el("div", `lc-mode-preview is-${id}`);
  previewBox.setAttribute("aria-hidden", "true");
  preview(previewBox);
  card.appendChild(previewBox);
  const body = el("div", "lc-mode-body");
  body.appendChild(el("h3", "lc-mode-title", title));
  body.appendChild(el("p", "lc-mode-description", description));
  if (!availability.ok) body.appendChild(el("p", "lc-mode-reason", availability.reason));
  const open = button("lc-mode-open", availability.ok ? `${title}を開く` : "使えません", () => {
    if (!availability.ok) return;
    playSfx(SFX_EVENTS.UI_CLICK);
    onOpen();
  });
  open.disabled = !availability.ok;
  body.appendChild(open);
  card.appendChild(body);
  return card;
}

// カードの小さな見本（CSS だけ。本物の歌詞・コールは使わない）
function previewLines(box, rows) {
  rows.forEach(([kind, width]) => {
    const bar = el("span", `lc-preview-bar is-${kind}`);
    bar.style.width = `${width}%`;
    box.appendChild(bar);
  });
}

async function renderSongPage() {
  const songId = currentSongId;
  setHeading(titleOf(songId));
  const page = el("section", "lc-song-page");
  page.appendChild(el("p", "lc-loading", "読み込み中…"));
  root.appendChild(page);
  if (!songData || songData.song?.id !== songId) {
    try {
      songData = await loadSongData(songId);
    } catch (error) {
      console.warn("ライブコール：曲のデータを読めませんでした", error);
      songData = null;
    }
  }
  if (view !== "song" || currentSongId !== songId) return;
  // ホームで遊び方を選んで来たとき：その遊び方が使える曲なら、曲のページを飛ばしてモードを開く
  if (pendingPreferredOpen) {
    pendingPreferredOpen = false;
    const direct = songData ? resolvePreferredModeOpen(preferredMode, songData.avail) : null;
    if (direct) {
      openedModeFromList = true;
      show(direct);
      window.scrollTo(0, 0);
      return;
    }
  }
  page.textContent = "";
  if (!songData) {
    page.appendChild(el("p", "lc-status-message", "この曲のデータを読み込めませんでした。もう一度開き直してください。"));
    return;
  }
  const { sheet, avail, hasAudio, lyricsRecord } = songData;
  // 状態：コール表（本人の採用）と、端末に入っているデータ（音源・歌詞）を分けて出す
  const status = el("dl", "lc-status");
  const addStatus = (label, value, ok) => {
    status.appendChild(el("dt", "", label));
    status.appendChild(el("dd", ok ? "is-ok" : "is-ng", value));
  };
  const sheetLabel = sheet.ok ? `あり（${sheet.calls.length}件）` : sheet.state === SHEET_STATE.NO_SHEET ? "まだありません" : "この端末のデータでは表示できません";
  addStatus("コール表", sheetLabel, sheet.ok);
  addStatus("音源", hasAudio ? "この端末にあります" : "この端末にありません", hasAudio);
  const lineCount = Array.isArray(lyricsRecord?.lines) ? lyricsRecord.lines.length : 0;
  addStatus("歌詞", lineCount ? "この端末にあります" : "この端末にありません", lineCount > 0);
  page.appendChild(status);
  if (!sheet.ok) page.appendChild(el("p", `lc-status-message${sheet.state === SHEET_STATE.NO_SHEET ? "" : " is-warning"}`, sheet.message));
  // 同じ長い案内をカードごとに繰り返さない（コール表が出せない理由は上に1回だけ）
  const short = (availability) => (!sheet.ok && availability.reason === sheet.message ? { ok: false, reason: sheet.state === SHEET_STATE.NO_SHEET ? "この曲のコール表はまだありません。" : "上の案内のとおり、今は使えません。" } : availability);
  const cards = el("div", "lc-mode-cards");
  cards.appendChild(
    modeCard({
      id: "sheet",
      title: "コール表",
      description: "歌詞（黒）とコール（赤）を1枚の表で読む。自分のペースでスクロール。",
      availability: short(avail.sheet),
      onOpen: () => show("sheet"),
      preview: (box) => previewLines(box, [["call", 34], ["lyric", 86], ["lyric", 70], ["call", 52], ["lyric", 78]]),
    }),
  );
  cards.appendChild(
    modeCard({
      id: "live",
      title: "ライブコール",
      description: "音源に合わせて、言うタイミングのコールが光る。画面はコールを中心に自動で進む。",
      availability: short(avail.live),
      onOpen: () => show("live"),
      preview: (box) => previewLines(box, [["lyric", 80], ["call-lit", 46], ["lyric", 72], ["call", 30]]),
    }),
  );
  cards.appendChild(
    modeCard({
      id: "karaoke",
      title: "カラオケ",
      description: "歌詞だけを音源に合わせて行ごとに強調。コールは出しません。",
      availability: avail.karaoke,
      onOpen: () => show("karaoke"),
      preview: (box) => previewLines(box, [["lyric", 76], ["lyric-lit", 88], ["lyric", 64], ["lyric", 80]]),
    }),
  );
  page.appendChild(cards);
}

// ===== コール表モード・ライブコールモードの共通部品 =====
function fontScale() {
  return FONT_SCALES[prefs.fontIndex] ?? 1;
}

function buildFontControls(onChange) {
  const box = el("div", "lc-font-controls");
  box.appendChild(el("span", "lc-font-label", "文字"));
  const minus = button("lc-icon-button", "A−", () => step(-1));
  minus.setAttribute("aria-label", "文字を小さくする");
  const plus = button("lc-icon-button", "A＋", () => step(1));
  plus.setAttribute("aria-label", "文字を大きくする");
  const update = () => {
    minus.disabled = prefs.fontIndex <= 0;
    plus.disabled = prefs.fontIndex >= FONT_SCALES.length - 1;
  };
  function step(delta) {
    const next = Math.max(0, Math.min(FONT_SCALES.length - 1, prefs.fontIndex + delta));
    if (next === prefs.fontIndex) return;
    prefs.fontIndex = next;
    savePrefs();
    update();
    onChange();
  }
  update();
  box.append(minus, plus);
  return box;
}

function buildStage(layout, options = {}) {
  const stage = el("div", "lc-stage");
  stage.style.setProperty("--lc-font", String(fontScale()));
  const body = el("div", "lc-stage-body");
  stage.appendChild(body);
  renderCallTextView(body, layout, { showReview: false, ...options });
  return { stage, body };
}

function renderSheetMode() {
  const { sheet } = songData ?? {};
  if (!sheet?.ok) return show("song");
  setHeading(titleOf(currentSongId));
  const toolbar = el("div", "lc-toolbar");
  const note = el("p", "lc-toolbar-note");
  note.append(el("span", "lc-mode-chip", "コール表"), "歌詞は黒、コールは赤。");
  toolbar.appendChild(note);
  const { stage } = buildStage(sheet.layout);
  stage.classList.add("is-sheet");
  toolbar.appendChild(buildFontControls(() => stage.style.setProperty("--lc-font", String(fontScale()))));
  root.append(toolbar, stage);
}

// ===== ライブコールモード =====
function effectOptions() {
  return { design: "c", intensity: prefs.intensity, reduced: reducedMotion.matches, shoutStyle: "combo", shoutFx: true };
}

function renderLiveMode() {
  const { sheet, blob } = songData ?? {};
  if (!sheet?.ok || !blob) return show("song");
  setHeading(titleOf(currentSongId));
  const callSpans = new Map();
  const lineEls = new Map();
  const lyricPieces = [];
  const { stage, body } = buildStage(sheet.layout, {
    // 表示の部品はコール表と同じ。光らせる・測るために、どの部品がどのコール・行かを覚えておくだけ（見た目は変えない）
    unitHook: (node, unit) => {
      if (unit.kind === "call") {
        node.dataset.callKey = unit.call.key;
        callSpans.set(unit.call.key, node);
        node.addEventListener("click", () => seekToCall(unit.call.key));
      } else if ((unit.kind === "lyric" || unit.kind === "joiner") && unit.lineId) {
        // この時点では、部品はまだ行（.call-text-line）に入っていない。描き終わってから行を探す
        lyricPieces.push([node, unit.lineId]);
      }
    },
  });
  lyricPieces.forEach(([node, lineId]) => {
    const line = node.closest(".call-text-line");
    if (line && !lineEls.has(lineId)) {
      line.dataset.lineId = lineId;
      lineEls.set(lineId, line);
    }
  });
  stage.classList.add("is-live");
  stage.tabIndex = 0;

  // いま／つぎ のパネル（小さく固定。切り替えられる）
  const panel = el("div", "lc-now-panel");
  panel.setAttribute("aria-live", "off");
  const nowRow = el("p", "lc-now-row");
  nowRow.appendChild(el("span", "lc-now-label", "いま"));
  const nowText = el("span", "lc-now-text", "");
  nowRow.appendChild(nowText);
  const nowBar = el("span", "lc-now-bar");
  const nowBarFill = el("span", "lc-now-bar-fill");
  nowBar.appendChild(nowBarFill);
  nowRow.appendChild(nowBar);
  const nextRow = el("p", "lc-next-row");
  nextRow.appendChild(el("span", "lc-now-label", "つぎ"));
  const nextText = el("span", "lc-next-text", "");
  nextRow.appendChild(nextText);
  panel.append(nowRow, nextRow);
  panel.hidden = !prefs.panel;

  // 設定（文字・演出の強さ・パネル）
  const toolbar = el("div", "lc-toolbar is-live");
  const modeNote = el("p", "lc-toolbar-note");
  modeNote.append(el("span", "lc-mode-chip", "ライブコール"), "光っているコールを、光っている間に言います。コールをタップすると、その少し前から再生します。");
  toolbar.appendChild(modeNote);
  toolbar.appendChild(buildFontControls(() => {
    stage.style.setProperty("--lc-font", String(fontScale()));
    remeasure();
  }));
  const intensityLabel = el("label", "lc-select-label", "演出 ");
  const intensity = el("select", "lc-select");
  [["std", "標準"], ["low", "控えめ"], ["off", "オフ"]].forEach(([value, label]) => {
    const option = el("option", "", label);
    option.value = value;
    intensity.appendChild(option);
  });
  intensity.value = prefs.intensity;
  intensity.addEventListener("change", () => {
    prefs.intensity = intensity.value;
    savePrefs();
    stage.classList.toggle("intensity-off", prefs.intensity === "off");
    renderFrame({ force: true });
  });
  intensityLabel.appendChild(intensity);
  toolbar.appendChild(intensityLabel);
  const panelToggle = button(`lc-chip${prefs.panel ? " is-selected" : ""}`, "いま／つぎ", () => {
    prefs.panel = !prefs.panel;
    savePrefs();
    panel.hidden = !prefs.panel;
    panelToggle.classList.toggle("is-selected", prefs.panel);
    panelToggle.setAttribute("aria-pressed", String(prefs.panel));
    remeasure();
  });
  panelToggle.setAttribute("aria-pressed", String(prefs.panel));
  toolbar.appendChild(panelToggle);
  if (reducedMotion.matches) toolbar.appendChild(el("p", "lc-toolbar-note", "端末の「視差効果を減らす」がオンのため、動きを止めています（光り方だけ）。"));
  stage.classList.toggle("intensity-off", prefs.intensity === "off");

  // 自動スクロールを手で止めたときに出す「いまの場所へ戻る」
  const resume = button("lc-resume-button", "いまの場所へ戻る", () => {
    live.followPaused = false;
    live.seekedPending = true;
    resume.hidden = true;
    renderFrame({ force: true });
  });
  resume.hidden = true;

  // 再生の操作
  const player = el("div", "lc-player");
  const back = button("lc-icon-button", `−${SEEK_SKIP_SECONDS}秒`, () => {
    audio.currentTime = Math.max(0, audio.currentTime - SEEK_SKIP_SECONDS);
  });
  back.setAttribute("aria-label", `${SEEK_SKIP_SECONDS}秒戻る`);
  const play = button("lc-play-button", "再生", togglePlay);
  play.setAttribute("aria-label", "再生");
  const seek = el("input", "lc-seek");
  seek.type = "range";
  seek.min = "0";
  seek.step = "0.01";
  seek.value = "0";
  seek.setAttribute("aria-label", "再生位置");
  seek.addEventListener("input", () => {
    audio.currentTime = seek.valueAsNumber;
  });
  const time = el("span", "lc-time", "0:00 / 0:00");
  const playError = el("p", "lc-status-message is-warning", "再生できませんでした。もう一度［再生］を押してください。");
  playError.hidden = true;
  player.append(back, play, seek, time);

  root.append(toolbar, panel, stage, resume, player, playError);

  // 演出の下ごしらえ（読み込んだときに1回だけ）。分類の優先順位は js/liveCallData.js の classifyReleasedCalls
  // 【2026-10-29 本人の指示】コールは全部「ふつう」の同じ光り方にする（MIX の目安の区切り・掛け声のポップなどの自動の分類はしない）。
  // 本人が決めた開始〜終了の間、そのコール全体が光る。区切りは本人がタイミングで分けた所だけ
  const preps = classifyReleasedCalls(sheet.calls.map((call) => call), Object.fromEntries((sheet.calls ?? []).map((call) => [call.key, { type: "normal" }])), hashText);
  const fx = preps.map((prep) => (callSpans.get(prep.key) ? decorateCallSpan(callSpans.get(prep.key), prep, { memberColorOf }) : null)).filter(Boolean);
  // 時刻の無いコール（今の完成版には無い）は光らせない
  const followSong = buildFollowSong({ layout: sheet.layout, calls: sheet.calls, lines: songData.lyricsRecord?.lines ?? [], duration: null });

  live = {
    stage,
    body,
    callSpans,
    lineEls,
    fx,
    followSong,
    runner: null,
    geom: null,
    rafId: null,
    lastWall: null,
    seekedPending: true,
    followPaused: false,
    programmaticScroll: false,
    litKeys: new Set(),
    litLine: null,
    panelKey: "",
    play,
    seek,
    time,
    playError,
    nowText,
    nowBarFill,
    nextText,
    resume,
    listeners: [],
  };

  // 手でスクロールしたら、自動スクロールを止める（いまの場所へ戻るボタンで再開）
  const manual = () => {
    if (!live || live.followPaused) return;
    live.followPaused = true;
    resume.hidden = false;
  };
  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    live.listeners.push(() => target.removeEventListener(type, handler, options));
  };
  listen(stage, "wheel", manual, { passive: true });
  listen(stage, "touchmove", manual, { passive: true });
  listen(stage, "keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) manual();
  });
  listen(audio, "play", onPlayState);
  listen(audio, "pause", onPlayState);
  listen(audio, "ended", onPlayState);
  listen(audio, "seeking", () => {
    if (live) live.seekedPending = true;
    renderFrame({ force: true });
  });
  listen(audio, "seeked", () => renderFrame({ force: true }));
  listen(audio, "timeupdate", () => {
    if (audio.paused) renderFrame({ force: true });
  });
  listen(audio, "loadedmetadata", () => {
    seek.max = String(audio.duration || 0);
    live.followSong.duration = audio.duration || live.followSong.duration;
    remeasure();
  });
  listen(window, "resize", remeasure);
  listen(reducedMotion, "change", () => renderFrame({ force: true }));

  objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  requestAnimationFrame(() => {
    remeasure();
    renderFrame({ force: true });
  });
}

// 部品の位置を測り直して、スクロールの計算を作り直す（文字の大きさ・画面の幅・パネルの出し入れのあと）
function remeasure() {
  if (!live) return;
  const { stage, followSong } = live;
  const stageRect = stage.getBoundingClientRect();
  const items = {};
  const put = (id, node) => {
    if (!node) return;
    const rect = node.getBoundingClientRect();
    items[id] = { top: rect.top - stageRect.top + stage.scrollTop, bottom: rect.bottom - stageRect.top + stage.scrollTop };
  };
  for (const id of Object.keys(followSong.calls)) put(id, live.callSpans.get(id.slice("call:".length)));
  for (const id of Object.keys(followSong.lyrics)) put(id, live.lineEls.get(id.slice("lyric:".length)));
  const blocks = [...stage.querySelectorAll(".call-text-block")];
  followSong.sheet.filter((row) => row.kind === "block").forEach((row, index) => put(row.id, blocks[index]));
  // 測れなかった部品（表示されていないもの）は、スクロールの計算から外す
  const song = {
    ...followSong,
    sheet: followSong.sheet
      .filter((row) => row.kind === "block" || items[row.id])
      .map((row) => (row.kind === "block" ? { ...row, calls: row.calls.filter((id) => items[id]) } : { ...row, before: row.before.filter((id) => items[id]), inlineStart: row.inlineStart.filter((id) => items[id]), inline: row.inline.filter((id) => items[id]), after: row.after.filter((id) => items[id]) })),
  };
  live.geom = { items, contentH: stage.scrollHeight };
  live.viewH = stage.clientHeight;
  live.runner = createRunner("callFirst", song, live.geom, live.viewH, { variant: "combo", mobile: true });
  live.seekedPending = true;
  renderFrame({ force: true });
}

function onPlayState() {
  if (!live) return;
  live.play.classList.toggle("is-playing", !audio.paused);
  live.play.textContent = audio.paused ? "再生" : "一時停止";
  live.play.setAttribute("aria-label", audio.paused ? "再生" : "一時停止");
  if (!audio.paused && live.rafId === null) {
    live.lastWall = null;
    const loop = (wallMs) => {
      if (!live) return;
      const dt = live.lastWall === null ? 1 / 60 : Math.min(0.1, Math.max(0, (wallMs - live.lastWall) / 1000));
      live.lastWall = wallMs;
      renderFrame({ dt });
      live.rafId = audio.paused ? null : requestAnimationFrame(loop);
    };
    live.rafId = requestAnimationFrame(loop);
  }
  renderFrame({ force: true });
}

function togglePlay() {
  if (!audio.src) return;
  if (audio.paused) {
    notifyPlaybackStarting("liveCallRenewal");
    live.playError.hidden = true;
    audio.play().catch(() => {
      if (live) live.playError.hidden = false;
      onPlayState();
    });
  } else audio.pause();
}

// コールをタップ：そのコールの少し前から（再生状態は変えない）
function seekToCall(key) {
  const call = songData?.sheet?.calls.find((c) => c.key === key);
  if (!call || !audio?.src) return;
  audio.currentTime = Math.max(0, call.start - PRE_ROLL_SECONDS);
  if (live) {
    live.followPaused = false;
    live.resume.hidden = true;
  }
}

// 1フレーム分を描く。見た目はすべて「いまの再生位置 t」だけから決める（前のフレームの結果は、スクロールの動き以外に使わない）
function renderFrame({ dt = 0, force = false } = {}) {
  if (!live || !audio) return;
  const t = audio.currentTime || 0;
  const calls = songData.sheet.calls;
  // 光るコール：本人の開始〜終了だけ（歌詞の時刻は使わない）
  const lit = new Set(activeCallKeysAt(calls, t));
  for (const key of live.litKeys) if (!lit.has(key)) live.callSpans.get(key)?.classList.remove("is-lit");
  for (const key of lit) if (!live.litKeys.has(key)) live.callSpans.get(key)?.classList.add("is-lit");
  live.litKeys = lit;
  // 演出
  const opts = effectOptions();
  for (const c of live.fx) applyCallState(c, stateAt(c.prep, t, opts), t);
  // スクロール（案D）。手で止めている間は動かさない（光る・パネルは続ける）
  if (live.runner) {
    const seeked = live.seekedPending;
    live.seekedPending = false;
    const result = live.runner.step(t, seeked ? 0 : dt, { seeked });
    if (!live.followPaused) {
      const target = Math.round(result.scrollTop);
      if (Math.abs(live.stage.scrollTop - target) >= 1) live.stage.scrollTop = target;
    }
    const lineId = result.litLyric ? result.litLyric.slice("lyric:".length) : null;
    if (lineId !== live.litLine) {
      if (live.litLine) live.lineEls.get(live.litLine)?.classList.remove("is-now");
      if (lineId) live.lineEls.get(lineId)?.classList.add("is-now");
      live.litLine = lineId;
    }
  }
  // いま／つぎ
  const state = panelState(live.followSong, t);
  const nowLabel = state.now.map((n) => n.text.replace(/\s+/g, " ")).join("　／　") + (state.more ? `　ほか${state.more}` : "");
  const nextLabel = state.next ? `${state.next.text.replace(/\s+/g, " ")}（${Math.ceil(state.next.wait)}秒後）` : "—";
  const key = `${nowLabel}|${nextLabel}`;
  if (key !== live.panelKey) {
    live.nowText.textContent = nowLabel || "—";
    live.nextText.textContent = nextLabel;
    live.panelKey = key;
  }
  const longNow = state.now.find((n) => n.long);
  live.nowBarFill.style.transform = `scaleX(${longNow ? Math.round(longNow.progress * 1000) / 1000 : 0})`;
  live.nowBarFill.parentElement.hidden = !longNow;
  // 再生位置
  if (force || dt) {
    const duration = audio.duration || 0;
    live.seek.max = String(duration);
    if (document.activeElement !== live.seek) live.seek.value = String(t);
    live.time.textContent = `${formatTime(t)} / ${formatTime(duration)}`;
  }
}

function stopLive() {
  if (!live) return;
  if (live.rafId !== null) cancelAnimationFrame(live.rafId);
  live.listeners.forEach((off) => off());
  live = null;
}

// ===== カラオケモード（歌詞だけ。今までの同期歌詞の表示をそのまま使う） =====
async function renderKaraokeMode() {
  const { blob } = songData ?? {};
  if (!blob) return show("song");
  setHeading(titleOf(currentSongId));
  const note = el("p", "lc-toolbar-note");
  note.append(el("span", "lc-mode-chip", "カラオケ"), "歌詞の行の時刻は自動で付けた目安です（ずれることがあります）。行をタップすると、その位置から再生します。");
  const panel = el("div", "synced-lyrics-panel lc-karaoke-panel");
  const player = el("div", "lc-player");
  const play = button("lc-play-button", "再生", () => {
    if (audio.paused) {
      notifyPlaybackStarting("liveCallRenewal");
      audio.play().catch(() => {});
    } else audio.pause();
  });
  const seek = el("input", "lc-seek");
  seek.type = "range";
  seek.min = "0";
  seek.step = "0.01";
  seek.value = "0";
  seek.setAttribute("aria-label", "再生位置");
  seek.addEventListener("input", () => {
    audio.currentTime = seek.valueAsNumber;
  });
  const time = el("span", "lc-time", "0:00 / 0:00");
  player.append(play, seek, time);
  root.append(note, panel, player);
  objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  const update = () => {
    const duration = audio.duration || 0;
    seek.max = String(duration);
    if (document.activeElement !== seek) seek.value = String(audio.currentTime);
    time.textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
    play.textContent = audio.paused ? "再生" : "一時停止";
    play.classList.toggle("is-playing", !audio.paused);
  };
  const handlers = ["timeupdate", "play", "pause", "loadedmetadata", "seeked"];
  handlers.forEach((type) => audio.addEventListener(type, update));
  karaokeCleanup = () => handlers.forEach((type) => audio.removeEventListener(type, update));
  const found = await loadLyricsForSong(currentSongId, audio, panel);
  if (!found && view === "karaoke") panel.replaceWith(el("p", "lc-status-message", "この曲の歌詞データがこの端末にありません。"));
}

// elements：{ root, audio, heading }
// callbacksArg：{ onDataChanged? }
export function initLiveCallScreen(elements, callbacksArg = {}) {
  root = elements.root;
  audio = elements.audio;
  callbacks = { heading: elements.heading, ...callbacksArg };
}

// 完成版コールデータを読み込み直したとき：曲のページを開いていれば作り直す（一覧は次に開いたときに作られる）
export function refreshLiveCallAfterDataChange() {
  songData = null;
  if (view === "list" || view === "song") show(view);
}

// テストから使う：カラオケの後片付け（音源のイベントの購読を外す）
export function cleanupKaraokeForTest() {
  karaokeCleanup?.();
  karaokeCleanup = null;
}
