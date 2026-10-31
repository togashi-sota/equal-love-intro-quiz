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
import { MEMBER_PROFILES } from "./data/memberProfiles.js";
import { CALL_EFFECTS } from "./data/callEffects.js";
import { getAudioBlob, getImportedSongIds } from "./audioStorage.js";
import { getCallData, getAllReleasedCallRecords, getReleasedCallRecord } from "./callStorage.js";
import { getLyricsData, getImportedLyricsSongIds } from "./lyricsStorage.js";
import { renderCallTextView } from "./callTextView.js";
import { hashText } from "./callTextEdits.js";
import { buildReleasedCallSheet, computeModeAvailability, activeCallKeysAt, buildFollowSong, classifyReleasedCalls, SHEET_STATE } from "./liveCallData.js";
import { createRunner, panelState } from "./callFollow.js";
import { prepareVisual, visualStateAt, ambientAt, buildMemberNameIndex, memberIdForCallText } from "./callEffects.js";
import { describeNameCall, nameCallAccent, renderNameCallText, nameCallAurora } from "./liveCallNames.js";
import { buildModeTabs, LIVE_CALL_MODE_TABS } from "./liveCallModeTabs.js";
import { decorateCallSpan, applyVisualState } from "./callEffectsRenderer.js";
import { loadLyricsForSong, destroyLyricsSync } from "./lyricsSync.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";
import { normalizeForSearch, songMatchesSearch } from "./songSearch.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { bindTapSeek, callTapSeekTime, lyricTapSeekTime } from "./callTapSeek.js";
import { createSpectacle, planSpectacle, chooseSpectacleY } from "./callSpectacle.js";
import { mountModePreview } from "./liveCallPreviewMotion.js";

// ===== はじめに（注意事項）の版 =====
// 中身を変えたら数字を上げる（上げると、次に開いたときにもう一度表示される）
// 2：演出の切り替えを「あり／なし」の2つにした（2026-10-31 live-unify）
export const LIVE_CALL_NOTICE_VERSION = 2;
const NOTICE_KEY = "equalLoveIntroQuiz.liveCallNoticeSeenVersion";
const PREFS_KEY = "equalLoveIntroQuiz.liveCallPrefs";
const FONT_SCALES = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
const SEEK_SKIP_SECONDS = 5; // −5秒・＋5秒（前の版の「10秒戻る」より細かく。ライブコールのコールは短いので）
// コールをタップしたときの「少し前」は js/callTapSeek.js の CALL_TAP_PRE_ROLL_SEC（1秒。カラオケと共通）

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
// effects：ライブコールの演出（"on"＝あり／"off"＝なし）。【2026-10-31 live-unify】以前の intensity（標準・控えめ・オフ）から引き継ぐ：
//   オフ → なし、標準・控えめ → あり（控えめは「あり」にまとめた）。intensity は前の版の値を消さないよう、そのまま残す
export function resolveLiveEffectsPref(raw) {
  if (raw && (raw.effects === "on" || raw.effects === "off")) return raw.effects;
  return raw?.intensity === "off" ? "off" : "on";
}
function loadPrefs() {
  const defaults = { fontIndex: 1, intensity: "std", effects: "on", panel: true, sort: "gojuon", filter: "all" };
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null");
    if (!raw || typeof raw !== "object") return defaults;
    return {
      fontIndex: Number.isInteger(raw.fontIndex) && raw.fontIndex >= 0 && raw.fontIndex < FONT_SCALES.length ? raw.fontIndex : defaults.fontIndex,
      intensity: ["std", "low", "off"].includes(raw.intensity) ? raw.intensity : defaults.intensity,
      effects: resolveLiveEffectsPref(raw),
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
// 名前コールのメンバーカラー：コールの文字列がメンバーのデータの名前・愛称と、まるごと1人に一致するときだけ（js/callEffects.js）。
// 【2026-10-31 live-unify】画面は js/liveCallNames.js（1人・複数・or・なし）を使う。この関数は前からのテストのために残す
let memberNameIndex = null;
export function memberColorForCallText(text) {
  memberNameIndex ??= buildMemberNameIndex(MEMBERS, MEMBER_PROFILES);
  const memberId = memberIdForCallText(text, memberNameIndex);
  return memberId ? { memberId, color: memberColorOf(memberId) } : null;
}

// 名前コールの飾りを、コールの部品（.cx-call。文字は .cx-text）に付ける。文字は変えない（名前の部分を色の付いた span で包むだけ）。
// 戻り値：見え方（js/liveCallNames.js の describeNameCall）。名前が無ければ何もしない
export function applyNameCallDecoration(span, text) {
  const result = describeNameCall(text);
  const accent = nameCallAccent(result);
  if (!accent) return result;
  const textEl = span.querySelector(".cx-text") ?? span;
  renderNameCallText(textEl, text, result);
  span.classList.add("cx-member", `cx-names-${result.kind}`);
  span.dataset.memberId = result.members.join(" ");
  span.style.setProperty("--cx-member", accent.primary);
  span.style.setProperty("--cx-member-grad", accent.gradient);
  span.style.setProperty("--cx-member-aurora", nameCallAurora(accent)); // 【2026-11-01 r7-live】複数・or の光の輪（全員の色）
  return result;
}

// 次のコールまでの残り時間（いま／つぎ のパネル）。控えめに、1秒単位。1秒を切ったら「まもなく」（純粋関数）
export const NEXT_SOON_SEC = 3;
export function formatNextWait(wait) {
  if (!Number.isFinite(wait) || wait < 0) return "";
  if (wait < 1) return "まもなく";
  return `あと${Math.ceil(wait)}秒`;
}

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

// 曲のページのカードの見本（動く見本の見張り）。画面を作り直すときに必ず片付ける
let modePreviews = [];
function destroyModePreviews() {
  modePreviews.forEach((preview) => preview.destroy());
  modePreviews = [];
}

function show(next) {
  if (view === "list" && root) listScrollTop = window.scrollY;
  destroyModePreviews();
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
// 【2026-10-30 fix-live】ホームの3つの入口（押したカードの名前）から開いたときの、曲の一覧の見出しと、そのモードが何かの1行。
// 見出しは押したカードの名前に合わせる（以前はどれも「ライブコール」で、何を選んだのか分からなかった）。名前は index.html のホームのカードと同じ
export const LIVE_CALL_ENTRY_TITLES = { sheet: "コール表を読む", live: "ライブ中に見る", karaoke: "カラオケで歌う" };
export const LIVE_CALL_ENTRY_LEADS = {
  sheet: "歌詞（黒）とコール（赤）を1枚の表で、自分のペースで読みます。予習に。",
  live: "この端末の音源に合わせて、今言うコールが光ります。ライブ中・練習中に。",
  karaoke: "歌詞と次に言うコールを大きく表示。コールの瞬間に派手に光ります。",
};
// 一覧（とはじめに）の見出し（純粋関数）。遊び方を選んでいなければ「コールを覚える」
export function liveCallListHeading(mode) {
  // 【2026-10-31 live-unify】入口の名前（ホーム・ゲーム画面の「コールを覚える」）と同じ見出し
  return LIVE_CALL_ENTRY_TITLES[mode] ?? "コールを覚える";
}

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
  setHeading(liveCallListHeading(preferredMode));
  const box = el("section", "lc-notice");
  box.appendChild(el("h3", "lc-notice-title", "はじめにお読みください"));
  const list = el("ul", "lc-notice-list");
  [
    "コール表は、このアプリの作者が確認して「完成」にした曲だけ表示します。まだの曲は「この曲のコール表はまだありません」と表示します（その曲のライブにコールが無いという意味ではありません）。",
    "実際のライブでは、会場・運営の案内とマナーを優先してください。周りの人の迷惑になる大きな声・動きはやめましょう。",
    "ライブコールの光るタイミングは、この端末の音源に合わせたものです。歌詞の行の強調は目安です。",
    "歌詞・音源・コールのデータは、この端末の中だけで使います（インターネットへ送りません）。",
    "ライブコールの画面の上の［演出 あり／なし］で、光り方・動きを切り替えられます（なしは、言うコールを枠で強調するだけ）。端末の「視差効果を減らす」がオンのときは動きを止めます。",
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
  setHeading(liveCallListHeading(preferredMode));
  const wrap = el("section", "lc-list");
  // そのモードが何かを1行で（ホームの3つの入口から来たときだけ）
  if (preferredMode) wrap.appendChild(el("p", "lc-mode-lead", LIVE_CALL_ENTRY_LEADS[preferredMode]));
  const top = el("div", "lc-list-top");
  top.appendChild(
    button("lc-link-button", "はじめに（注意事項）を読む", () => {
      noticeReturn = "list";
      show("notice");
      window.scrollTo(0, 0);
    }),
  );
  // 【2026-10-31 live-unify】前の版のコールガイド（メンバーコール・曲指定コール・MIX など）を、新しい方からも開けるように
  if (callbacks?.openCallGuide) {
    top.appendChild(
      button("lc-link-button", "コールガイド（MIX・メンバーコール）", () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        callbacks.openCallGuide(null);
      }),
    );
  }
  wrap.appendChild(top);
  if (preferredMode) {
    const modeNote = el("div", "lc-preferred-mode");
    modeNote.appendChild(el("p", "lc-preferred-mode-text", `曲を選ぶと「${LIVE_CALL_ENTRY_TITLES[preferredMode]}」をすぐ開きます。使えない曲は、曲のページで理由を表示します。`));
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
  // 【2026-10-31 live-unify】前の版（同期モード・カラオケ同期）は、新しい3つで代わりが務まると確かめられるまで残す。
  // ホーム・曲のページには出さず、一覧のいちばん下に小さく1つだけ（入口を二重にしない）
  if (callbacks?.openClassic) {
    const classic = el("div", "lc-classic");
    classic.appendChild(el("p", "lc-classic-note", "前の版の画面（同期モード・カラオケ同期・追加データパックのコール）も、しばらく残しています。"));
    classic.appendChild(
      button("lc-link-button", "今までの版を開く", () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        callbacks.openClassic();
      }),
    );
    wrap.appendChild(classic);
  }
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
  const [record, lyricsRecord, callRecord, blob, allRecords] = await Promise.all([
    getReleasedCallRecord(songId).catch(() => null),
    getLyricsData(songId).catch(() => null),
    getCallData(songId).catch(() => null),
    getAudioBlob(songId).catch(() => null),
    getAllReleasedCallRecords().catch(() => null),
  ]);
  // 【2026-10-31 live-polish】この端末に完成版のコールが1曲分も入っていないか（新しい端末・データを入れる前）。
  // 読めなかったとき（null）は「入っている」扱い（今までの文言のまま。迷ったら言い過ぎない）
  const releasedCount = allRecords instanceof Map ? [...allRecords.values()].filter((r) => r?.current).length : null;
  const sheet = buildReleasedCallSheet({ record: record ? { ...record, songId } : null, lyricsRecord, deviceCalls: Array.isArray(callRecord?.calls) ? callRecord.calls : [] });
  const hasAudio = Boolean(blob);
  const avail = computeModeAvailability({ sheet, hasAudio, lyricsRecord });
  return { song, record, lyricsRecord, sheet, avail, hasAudio, blob, releasedCount };
}

// 【2026-10-31 live-polish】曲のページの案内（純粋関数）。
// noReleasedData：この端末に完成版のコールが0曲（新しい端末）。このときの「コール表がまだありません」は、曲にコールが無いのではなく、
//   データが入っていないだけなので、取り込めば使えると案内する（本当にコールが無い曲＝未採用の曲は、今までの文言のまま）。
// 戻り値：{ message（上の1行。無ければ ""）, cardReason（カードの理由の短い言い方。無ければ null）, showDataButton（［データを追加・更新］を出すか） }
export const NO_RELEASED_DATA_MESSAGE = "この端末にコール表が入っていません（最新版データを取り込むと使えます）。";
export function songPageGuidance({ sheetOk, sheetState, sheetMessage, releasedCount, hasAudio, lineCount }) {
  const noReleasedData = !sheetOk && sheetState === SHEET_STATE.NO_SHEET && releasedCount === 0;
  const message = sheetOk ? "" : noReleasedData ? NO_RELEASED_DATA_MESSAGE : sheetMessage;
  const cardReason = sheetOk ? null : noReleasedData ? "この端末にコール表が入っていません。" : sheetState === SHEET_STATE.NO_SHEET ? "この曲のコール表はまだありません。" : "上の案内のとおり、今は使えません。";
  // 【2026-11-01 nx-live】歌詞の無い曲（Overture：コール表が歌詞0行で作られている）は、歌詞が無いのが正しい。歌詞を入れる案内はしない
  const lyricsMissing = !(lineCount > 0) && !sheetOk;
  return { noReleasedData, message, cardReason, showDataButton: noReleasedData || !hasAudio || lyricsMissing };
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

function modeCard({ id, title, description, availability, onOpen }) {
  const card = el("div", `lc-mode-card is-${id}${availability.ok ? "" : " is-unavailable"}`);
  const previewBox = el("div", `lc-mode-preview is-${id}`);
  const preview = LIVE_CALL_MODE_PREVIEWS[id];
  // 【2026-11-01 nx-live】ライブコール・カラオケは、静止画の上に数秒の無音ループ（見えている間だけ。js/liveCallPreviewMotion.js）
  // 使えないモードのカードは動かさない（静止画だけ。薄く表示）
  if (preview) modePreviews.push(mountModePreview(previewBox, availability.ok ? preview : { ...preview, video: null }, PREVIEW_IMAGE_SIZE));
  card.appendChild(previewBox);
  const body = el("div", "lc-mode-body");
  body.appendChild(el("h3", "lc-mode-title", title));
  body.appendChild(el("p", "lc-mode-description", description));
  if (!availability.ok) body.appendChild(el("p", "lc-mode-reason", availability.reason));
  else if (availability.note) body.appendChild(el("p", "lc-mode-note", availability.note));
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

// カードの見本の画像（2026-10-30 第2版）。本物のアプリの画面（コール表・ライブコール・カラオケの部品と CSS）を、
// ダミーの文字（「〜〜歌詞〜〜〜」「Hey！」「○○ちゃーん！」など。本物の歌詞・コールではない）で描いて撮ったもの。
// 作り直し：renewal-notes/livecall-visuals/capture_previews.py（Git に入れない）。表示は 140×112（画像は2倍の 280×224）
// 【2026-10-30 夜】ライブコール（つぎ の残り時間）・カラオケ（新しい演出）を、同じダミーの文字で撮り直した（renewal-notes/night-live/capture_dummy.py）
// 【2026-11-01 nx-live】3:2・600×400 に作り直した（下）
export const PREVIEW_IMAGE_SIZE = { width: 600, height: 400 };
// 【2026-10-31 live-unify】3つとも、今の画面（モードの切り替え・名前コールの色・カラオケの赤いコール）をダミーの文字で撮り直した
//   （renewal-notes/live-unify/capture_dummy.py。名前はメンバーの呼び名だけ。歌詞・コール本文は入れていない）
// 【2026-11-01 nx-live 本人の依頼】静止画1枚では「どう表示されるか・どこが光るか・どう進むか」が伝わらない → 作り直し。
//   ・カードは見本を上に大きく（3:2）。縮小しても文字・光が見分けられるよう、画面の大事な所だけを 2倍で撮った
//   ・コール表：静止画（黒い歌詞と赤いコールが1枚で読める所）
//   ・ライブコール・カラオケ：約5秒の無音ループ（video）＋同じ場面の静止画（src。最初・動かせないとき・視差効果を減らす設定のとき）
//     ライブコール：今のコールが光る・中央に大きな文字・「つぎ」と残り秒数が進む／カラオケ：歌詞の行が進む・赤いコールが光る・カードの 3・2・1 →「コール中！」
//   作り方：renewal-notes/nx-live/make_previews.py（Git に入れない）。ダミーの文字（歌詞は「〜〜歌詞〜〜」、コールは Hey！・オイ！・メンバーの呼び名だけ）
export const LIVE_CALL_MODE_PREVIEWS = {
  sheet: { src: "./assets/images/live-call-previews/sheet.webp", alt: "コール表の見本：黒い歌詞の行と、その間の赤いコールが1枚に並ぶ（文字はダミー）" },
  live: {
    src: "./assets/images/live-call-previews/live.webp",
    video: "./assets/images/live-call-previews/live.mp4",
    alt: "ライブコールの見本：言うコールが光り、中央に大きな文字が出る。上の「いま／つぎ」に次のコールと残り秒数（文字はダミー）",
  },
  karaoke: {
    src: "./assets/images/live-call-previews/karaoke.webp",
    video: "./assets/images/live-call-previews/karaoke.mp4",
    alt: "カラオケの見本：暗い舞台に歌詞の行と赤いコール。下のカードに次のコールと 3・2・1、コールの瞬間に「コール中！」と大きく光る（文字はダミー）",
  },
};

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
    // 【2026-10-30 fix-live】「カラオケで歌う」から来たとき：曲のページのカラオケのカードと同じ、本人の完成版のコール付きの新しいカラオケを開く
    // （以前はここだけ、この画面の中の歌詞だけのカラオケを開いていて、コールも演出も出なかった）。［戻る］で曲の一覧へ戻る
    if (direct === "karaoke" && callbacks?.openKaraokeWithCalls) {
      show("list");
      openKaraokeForCurrentSong();
      return;
    }
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
  const { sheet, avail, hasAudio, lyricsRecord, releasedCount } = songData;
  // 状態：コール表（本人の採用）と、端末に入っているデータ（音源・歌詞）を分けて出す
  const status = el("dl", "lc-status");
  const addStatus = (label, value, ok) => {
    status.appendChild(el("dt", "", label));
    status.appendChild(el("dd", ok ? "is-ok" : "is-ng", value));
  };
  const sheetLabel = sheet.ok
    ? `あり（${sheet.calls.length}件）`
    : sheet.state === SHEET_STATE.NO_SHEET
      ? releasedCount === 0
        ? "この端末に入っていません"
        : "まだありません"
      : "この端末のデータでは表示できません";
  addStatus("コール表", sheetLabel, sheet.ok);
  addStatus("音源", hasAudio ? "この端末にあります" : "この端末にありません", hasAudio);
  const lineCount = Array.isArray(lyricsRecord?.lines) ? lyricsRecord.lines.length : 0;
  // 【2026-11-01 nx-live】歌詞の無い曲（Overture）は「この曲には歌詞がありません」（不足ではないので、赤くしない）
  const noLyricsSong = sheet.ok && lineCount === 0;
  addStatus("歌詞", lineCount ? "この端末にあります" : noLyricsSong ? "この曲には歌詞がありません" : "この端末にありません", lineCount > 0 || noLyricsSong);
  page.appendChild(status);
  const guide = songPageGuidance({ sheetOk: sheet.ok, sheetState: sheet.state, sheetMessage: sheet.message, releasedCount, hasAudio, lineCount });
  if (guide.message) page.appendChild(el("p", `lc-status-message${sheet.state === SHEET_STATE.NO_SHEET && !guide.noReleasedData ? "" : " is-warning"}`, guide.message));
  // 【2026-10-31 live-polish】データが足りないとき（新しい端末・音源や歌詞が無い）：行き止まりにしないよう、データを入れる場所へのボタン
  if (guide.showDataButton && callbacks?.openDataUpdate) {
    const dataBox = el("div", "lc-data-guide");
    dataBox.appendChild(el("p", "lc-data-guide-text", "コール表・歌詞・音源は、設定の「データ管理」で、配られた最新版データを読み込むと入ります。"));
    dataBox.appendChild(
      button("lc-primary-button lc-data-guide-button", "データを追加・更新", () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        callbacks.openDataUpdate();
      }),
    );
    page.appendChild(dataBox);
  }
  // 同じ長い案内をカードごとに繰り返さない（コール表が出せない理由は上に1回だけ）
  const short = (availability) => (!sheet.ok && availability.reason === sheet.message ? { ok: false, reason: guide.cardReason } : availability);
  const cards = el("div", "lc-mode-cards");
  cards.appendChild(
    modeCard({
      id: "sheet",
      title: "コール表",
      description: "歌詞（黒）とコール（赤）を1枚の表で読む。自分のペースでスクロール。",
      availability: short(avail.sheet),
      onOpen: () => show("sheet"),
    }),
  );
  cards.appendChild(
    modeCard({
      id: "live",
      title: "ライブコール",
      description: "音源に合わせて、言うタイミングのコールが光る。画面はコールを中心に自動で進む。",
      availability: short(avail.live),
      onOpen: () => show("live"),
    }),
  );
  cards.appendChild(
    modeCard({
      id: "karaoke",
      title: "カラオケ",
      // 【2026-11-01 nx-live】歌詞の無い曲（Overture）は、コールだけのカラオケ（注意の欄に「歌詞なし・コールのみ」）
      description: avail.karaoke.callsOnly
        ? "コールを大きく表示して、一緒に叫ぶ。「次のコール」と残り秒数も出て、コールの瞬間に光ります。"
        : sheet.ok
          ? "歌詞を大きく表示して歌う。赤いコールと「次のコール」も一緒に出せます（コール表示の ON／OFF）。コールの瞬間に光ります。"
          : lineCount > 0
            ? "歌詞を大きく表示して歌う。コール表が無いので、歌詞だけのカラオケになります。"
            : "歌詞を大きく表示して歌う（コール表が無い曲でも、歌詞があれば歌詞だけで使えます）。",
      availability: avail.karaoke,
      // 【2026-10-29 本人の希望】前の「カラオケ同期」と同じ画面（NEXT CALL・あと○秒・タイミング調整）を、本人の完成版のコールで開く
      onOpen: () => openKaraokeForCurrentSong(),
    }),
  );
  page.appendChild(cards);
  if (callbacks?.openCallGuide) {
    page.appendChild(
      button("lc-link-button lc-song-guide", "コールガイド（MIX・メンバーコール）を見る", () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        callbacks.openCallGuide(songId);
      }),
    );
  }
}

// 新しいカラオケ（js/karaokeSyncScreen.js）を、この曲の完成版のコール・並び（コール表が無い曲は空）で開く
function openKaraokeForCurrentSong() {
  if (!callbacks?.openKaraokeWithCalls) return show("karaoke");
  const sheet = songData?.sheet;
  callbacks.openKaraokeWithCalls(currentSongId, sheet?.ok ? sheet.calls : [], {
    layout: sheet?.ok ? sheet.layout : null,
    hasAudio: Boolean(songData?.hasAudio),
    availability: songData?.avail ?? null,
  });
}

// ===== 3つのモードの切り替え（2026-10-31 live-unify。部品は js/liveCallModeTabs.js。カラオケの画面と共通） =====
function switchMode(mode) {
  playSfx(SFX_EVENTS.UI_CLICK);
  if (mode === "karaoke") return openKaraokeForCurrentSong();
  show(mode);
  window.scrollTo(0, 0);
}

// カラオケ（別の画面）のモードの切り替えから戻ってくるとき：その曲の、そのモードを開く（曲のデータが無ければ読み込む）
export async function openLiveCallSongMode(songId, mode) {
  if (!LIVE_CALL_MODE_LABELS[mode] || !getSongById(songId)) return false;
  const keepFromList = openedModeFromList;
  currentSongId = songId;
  if (!songData || songData.song?.id !== songId) {
    try {
      songData = await loadSongData(songId);
    } catch {
      songData = null;
    }
  }
  if (!songData?.avail?.[mode]?.ok) {
    show("song");
    return false;
  }
  if (mode === "karaoke") {
    openKaraokeForCurrentSong();
    return true;
  }
  openedModeFromList = keepFromList;
  show(mode);
  window.scrollTo(0, 0);
  return true;
}
export { LIVE_CALL_MODE_TABS };
export function getLiveCallCurrentSongAvailability() {
  return songData?.avail ?? null;
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

// 【2026-11-01 r7-live】コール表とライブコールは、同じ組版の処理で描く：
//   どちらも js/callTextView.js の renderCallTextView（同じ DOM の作り方）＋ css/callText.css と .lc-stage の文字の大きさ（同じ CSS のクラス）。
//   ライブコールは、描いたあとに光らせるための部品（.cx-*）を「箱の大きさを変えない形」で足すだけ（css/liveCall.css の「組版の約束」）。
//   だから、コール表の並び・文字の組み方を直せば、ライブコールにも同じに反映される。改行の位置が同じことは tests/liveCallTypeset.test.js で確かめる
function buildStage(layout, options = {}) {
  const stage = el("div", "lc-stage");
  stage.style.setProperty("--lc-font", String(fontScale()));
  const body = el("div", "lc-stage-body");
  stage.appendChild(body);
  renderCallTextView(body, layout, { showReview: false, ...options });
  return { stage, body };
}

// コール表の舞台（テストからも使う）
export function buildSheetStage(layout) {
  const { stage } = buildStage(layout);
  stage.classList.add("is-sheet");
  return stage;
}

// ライブコールの舞台（テストからも使う）。コール表と同じ部品を描いてから、光らせる部品・タップで移動を足す。
// calls：本人の完成版のコール（key・text・start・end）。lines：歌詞の行（{ line, start, end }。タップの移動先に使う）
// onSeek(time, { kind, key, node })：タップで移動するとき（時刻がある所だけ呼ぶ）
export function buildLiveStage(layout, calls, { lines = [], onSeek = null } = {}) {
  const callSpans = new Map();
  const lineEls = new Map();
  const lyricPieces = [];
  const { stage, body } = buildStage(layout, {
    // 表示の部品はコール表と同じ。光らせる・測るために、どの部品がどのコール・行かを覚えておくだけ（見た目は変えない）
    unitHook: (node, unit) => {
      if (unit.kind === "call") {
        node.dataset.callKey = unit.call.key;
        callSpans.set(unit.call.key, node);
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
  const callByKey = new Map((calls ?? []).map((call) => [call.key, call]));
  const followSong = buildFollowSong({ layout, calls, lines, duration: null });
  // 演出の下ごしらえ（読み込んだときに1回だけ）。分類の優先順位は js/liveCallData.js の classifyReleasedCalls
  // 【2026-10-29 本人の指示】コールは全部「ふつう」の同じ光り方にする（MIX の目安の区切り・掛け声のポップなどの自動の分類はしない）。
  // 本人が決めた開始〜終了の間、そのコール全体が光る。区切りは本人がタイミングで分けた所だけ
  const preps = classifyReleasedCalls((calls ?? []).map((call) => call), Object.fromEntries((calls ?? []).map((call) => [call.key, { type: "normal" }])), hashText);
  // 【2026-10-30 第2版】見た目の味付けだけ、短い／長い／ふつうに分ける（js/callEffects.js の classifyVisualKind）。
  // 区切り・1語ずつの光り方はしない。時刻（開始〜終了）はそのまま
  const fx = preps
    .map((prep) => {
      const span = callSpans.get(prep.key);
      if (!span) return null;
      prep.vis = prepareVisual(callByKey.get(prep.key) ?? prep, { hasBreak: span.classList.contains("has-break") });
      const decorated = decorateCallSpan(span, prep, { memberColorOf });
      // 名前コール（js/liveCallNames.js）：1人＝名前の部分をその人の色の下線・光の輪郭もその色。複数＝名前ごとにそれぞれの色、枠は色をつないだ帯。
      // 「or」＝候補ごとに色、あいだの「or」は控えめに（同時に叫ぶとは扱わない）。名前ではない言葉は通常の見た目。
      // どれも文字の装飾だけ（コール1件のまま。区切って光らせない・順番に光らせない）
      applyNameCallDecoration(span, callByKey.get(prep.key)?.text ?? prep.text);
      return decorated;
    })
    .filter(Boolean);
  // 【2026-11-01 r7-live】タップで移動（カラオケと共通の js/callTapSeek.js）。時刻がある所だけ押せる
  //   コール：本人の開始の1秒前から。歌詞の行：その表示行が元の歌詞の行の頭から始まり、その行に開始の時刻があるときだけ、その時刻へ
  //   （表示のために分けた行の続き・時刻の無い行は押せない＝推測で移動しない）
  const unbind = [];
  for (const [key, span] of callSpans) {
    const time = callTapSeekTime(callByKey.get(key));
    if (time === null) continue;
    span.classList.add("is-seekable");
    unbind.push(bindTapSeek(span, () => onSeek?.(time, { kind: "call", key }), { scroller: stage }));
  }
  for (const [lineId, line] of lineEls) {
    const lyric = followSong.lyrics[`lyric:${lineId}`];
    const time = lyricTapSeekTime(lyric?.ai ?? null);
    if (time === null) continue;
    line.classList.add("is-seekable");
    line.dataset.seekTime = String(time);
    unbind.push(
      bindTapSeek(
        line,
        (event) => {
          if (event.target?.closest?.(".call-text-call")) return; // 行の中のコールを押したときは、コールの方だけ
          onSeek?.(time, { kind: "lyric", key: lineId, node: line });
        },
        { scroller: stage },
      ),
    );
  }
  return { stage, body, callSpans, lineEls, followSong, fx, unbind: () => unbind.forEach((off) => off()) };
}

function renderSheetMode() {
  const { sheet } = songData ?? {};
  if (!sheet?.ok) return show("song");
  setHeading(titleOf(currentSongId));
  const toolbar = el("div", "lc-toolbar");
  toolbar.appendChild(buildModeTabs("sheet", songData.avail, switchMode));
  const note = el("p", "lc-toolbar-note", "歌詞は黒、コールは赤。自分のペースでスクロールして読めます。");
  toolbar.appendChild(note);
  const stage = buildSheetStage(sheet.layout);
  toolbar.appendChild(buildFontControls(() => stage.style.setProperty("--lc-font", String(fontScale()))));
  root.append(toolbar, stage);
}

// ===== ライブコールモード =====
function effectOptions() {
  return { design: "c", intensity: prefs.effects === "off" ? "off" : "std", reduced: reducedMotion.matches, shoutStyle: "combo", shoutFx: true };
}

function renderLiveMode() {
  const { sheet, blob } = songData ?? {};
  if (!sheet?.ok || !blob) return show("song");
  setHeading(titleOf(currentSongId));
  const built = buildLiveStage(sheet.layout, sheet.calls, { lines: songData.lyricsRecord?.lines ?? [], onSeek: seekLiveTo });
  const { stage, body, callSpans, lineEls, followSong } = built;
  stage.classList.add("is-paused"); // 再生を始めるまでは止まっている扱い（onPlayState が付け外しする）

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
  // 【2026-10-30 夜】次のコールまでの残り時間は、コールの文字と分けて右に小さく（3秒を切ったら少し目立たせる）
  const nextWait = el("span", "lc-next-wait", "");
  nextRow.appendChild(nextWait);
  panel.append(nowRow, nextRow);
  panel.hidden = !prefs.panel;

  // 設定（文字・演出の強さ・パネル）
  // 【2026-10-30 fix-live】上の部分（説明・文字の大きさ・演出・いま／つぎ）は約320px を取っていたので、再生を始めたら折りたたむ
  //   （［表示の設定］で開け閉めできる）。折りたたんだ分、コール表の箱を画面の下まで広げる（fitLiveStage）
  const toolbar = el("div", "lc-toolbar is-live");
  // 【2026-10-31 live-unify】1行目：3つのモードの切り替え。2行目：［演出 あり／なし］（いつでも押せる。保存して次も使う）と［表示の設定］
  toolbar.appendChild(buildModeTabs("live", songData.avail, switchMode));
  const toolbarHead = el("div", "lc-toolbar-head");
  const effectsSwitch = button("lc-effects-switch", "", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    setLiveEffects(prefs.effects === "off" ? "on" : "off");
  });
  effectsSwitch.setAttribute("role", "switch");
  toolbarHead.appendChild(effectsSwitch);
  const settingsToggle = button("lc-settings-toggle", "表示の設定", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    setLiveToolbarCollapsed(!live.toolbarCollapsed);
  });
  settingsToggle.setAttribute("aria-expanded", "true");
  toolbarHead.appendChild(settingsToggle);
  toolbar.appendChild(toolbarHead);
  const controls = el("div", "lc-toolbar-controls");
  controls.id = "lc-live-toolbar-controls";
  settingsToggle.setAttribute("aria-controls", controls.id);
  const modeNote = el("p", "lc-toolbar-note", "光っているコールを、光っている間に言います。コールをタップするとその少し前から、歌詞の行をタップするとその行から再生します。演出は上の［演出 あり／なし］で切り替えます。");
  controls.appendChild(modeNote);
  toolbar.appendChild(controls);
  controls.appendChild(buildFontControls(() => {
    stage.style.setProperty("--lc-font", String(fontScale()));
    remeasure();
  }));
  const panelToggle = button(`lc-chip${prefs.panel ? " is-selected" : ""}`, "いま／つぎ", () => {
    prefs.panel = !prefs.panel;
    savePrefs();
    panel.hidden = !prefs.panel;
    panelToggle.classList.toggle("is-selected", prefs.panel);
    panelToggle.setAttribute("aria-pressed", String(prefs.panel));
    fitLiveStage();
    remeasure();
  });
  panelToggle.setAttribute("aria-pressed", String(prefs.panel));
  controls.appendChild(panelToggle);
  if (reducedMotion.matches) controls.appendChild(el("p", "lc-toolbar-note", "端末の「視差効果を減らす」がオンのため、動きを止めています（光り方だけ）。"));

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
  // 【2026-10-31 live-unify】前の版の全画面表示にあった「先へ送る」を取り込む（同じ秒数）
  const forward = button("lc-icon-button", `＋${SEEK_SKIP_SECONDS}秒`, () => {
    const max = Number.isFinite(audio.duration) ? audio.duration : Infinity;
    audio.currentTime = Math.min(max, audio.currentTime + SEEK_SKIP_SECONDS);
  });
  forward.setAttribute("aria-label", `${SEEK_SKIP_SECONDS}秒進む`);
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
  player.append(back, play, forward, seek, time);

  // 舞台の背景の光（ふちだけ、ピンクでうっすら。文字の上には色を重ねない）。舞台はスクロールするので、外側の枠に重ねる
  const stageFrame = el("div", "lc-stage-frame");
  const ambient = el("span", "lc-stage-ambient");
  ambient.setAttribute("aria-hidden", "true");
  stageFrame.append(stage, ambient);

  root.append(toolbar, panel, stageFrame, resume, player, playError);

  const { fx } = built;
  // 時刻の無いコール（今の完成版には無い）は光らせない（followSong は buildLiveStage が作ったもの）
  // 【2026-11-01 r7-live】大きな演出（演出 ありのときだけ。js/callSpectacle.js。画面に1組だけ）
  //   後ろの層（ペンライト）は舞台の後ろ（root の最初）、前の層（大きな文字・光）は舞台の上・再生の操作の下
  //   【2026-11-01 r7-live-fix】大きな文字は、光っているコール（とその行のまとまり＝上の歌詞）・「いま／つぎ」の札を避けた位置に出す
  //   （コールが始まったときに1回だけ測る。光っている行が下にあれば上側、上にあれば下側）
  const spectacle = createSpectacle(root, {
    variant: "live",
    place: (item, { wordH, layerTop }) => {
      const stageRect = stage.getBoundingClientRect();
      const playerTop = player.getBoundingClientRect().top;
      const region = { top: Math.max(stageRect.top, 0) - layerTop, bottom: Math.min(stageRect.bottom, playerTop, window.innerHeight) - layerTop };
      const avoid = [];
      const span = callSpans.get(item.key);
      const group = span?.closest(".call-text-group, .call-text-block") ?? span;
      for (const node of [group, panel.hidden ? null : panel]) {
        if (!node) continue;
        const r = node.getBoundingClientRect();
        avoid.push({ top: r.top - layerTop - 6, bottom: r.bottom - layerTop + 6 });
      }
      const y = chooseSpectacleY(region, avoid, wordH);
      return y === null ? null : { y };
    },
  });
  spectacle?.setPlan(planSpectacle(sheet.calls));

  live = {
    stage,
    body,
    toolbar,
    effectsSwitch,
    settingsToggle,
    toolbarCollapsed: false,
    autoCollapsed: false,
    player,
    callSpans,
    lineEls,
    fx,
    ambient,
    ambientLast: -1,
    followSong,
    spectacle,
    unbindTaps: built.unbind,
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
    nextWait,
    nextRow,
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
  listen(window, "resize", () => {
    fitLiveStage();
    remeasure();
  });
  listen(reducedMotion, "change", () => renderFrame({ force: true }));

  setLiveEffects(prefs.effects, { save: false });
  objectUrl = URL.createObjectURL(blob);
  audio.src = objectUrl;
  requestAnimationFrame(() => {
    fitLiveStage();
    remeasure();
    renderFrame({ force: true });
  });
}

// 【2026-10-31 live-unify】演出 あり／なし。なし：コール全体を板で強調するだけ（光・動き・知らせ・背景の光なし。長いコールの進み具合のバーは情報なので残す）。
// 再生中でも切り替えられる（見た目は時刻 t だけから決まるので、次のフレームからその時刻の正しい見た目になる）。この端末に保存して次も使う
export const LIVE_EFFECTS_LABELS = { on: "演出 あり", off: "演出 なし" };
function setLiveEffects(value, { save = true } = {}) {
  prefs.effects = value === "off" ? "off" : "on";
  if (save) savePrefs();
  if (!live) return;
  const on = prefs.effects === "on";
  live.stage.classList.toggle("intensity-off", !on);
  live.effectsSwitch.textContent = LIVE_EFFECTS_LABELS[prefs.effects];
  live.effectsSwitch.setAttribute("aria-checked", String(on));
  live.effectsSwitch.setAttribute("aria-label", on ? "演出：あり（押すと、なしにします）" : "演出：なし（押すと、ありにします）");
  live.effectsSwitch.classList.toggle("is-on", on);
  renderFrame({ force: true });
}

// 【2026-10-30 fix-live】上の部分（説明・設定）を折りたたむ／開く。折りたたんだら、コール表の箱を再生の操作のすぐ上まで広げる
function setLiveToolbarCollapsed(collapsed) {
  if (!live) return;
  live.toolbarCollapsed = Boolean(collapsed);
  live.toolbar.classList.toggle("is-collapsed", live.toolbarCollapsed);
  live.settingsToggle.setAttribute("aria-expanded", String(!live.toolbarCollapsed));
  fitLiveStage();
  remeasure();
}

// 折りたたんでいる間だけ、コール表の箱の高さを「画面の下の再生の操作の上まで」にする（開いているときは CSS の高さのまま）
export const LIVE_STAGE_MIN_PX = 280;
export function computeLiveStageHeight({ viewportH, stageTop, playerH, gap = 8, min = LIVE_STAGE_MIN_PX }) {
  if (![viewportH, stageTop, playerH].every(Number.isFinite)) return null;
  return Math.max(min, Math.round(viewportH - stageTop - playerH - gap));
}
// 【2026-10-31 live-unify】開いているときも、画面の下の再生の操作に隠れない高さにする（以前は開いている間 CSS の 62dvh のままで、
//   箱の下の部分が再生の操作の後ろに隠れ、そこで光っているコールが見えないことがあった）。開いているときは少し低くてもよい（最小 200px）
export const LIVE_STAGE_MIN_OPEN_PX = 200;
function fitLiveStage() {
  if (!live) return;
  const { stage } = live;
  // 画面の一番上から見たときの位置で測る（ページを少しスクロールしていても、同じ高さになるように）
  const stageTop = stage.getBoundingClientRect().top + window.scrollY;
  const height = computeLiveStageHeight({
    viewportH: window.innerHeight,
    stageTop,
    playerH: live.player.getBoundingClientRect().height,
    min: live.toolbarCollapsed ? LIVE_STAGE_MIN_PX : LIVE_STAGE_MIN_OPEN_PX,
  });
  if (height !== null) stage.style.height = `${height}px`;
}

// 部品の位置を測り直して、スクロールの計算を作り直す（文字の大きさ・画面の幅・パネルの出し入れのあと）
function remeasure() {
  if (!live) return;
  const { stage, followSong } = live;
  // 光っているコールの拡大・浮き（transform）を外してから測る（測った位置が 1〜2px ずれないように）
  stage.classList.add("is-measuring");
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
  stage.classList.remove("is-measuring");
  live.geom = { items, contentH: stage.scrollHeight };
  live.viewH = stage.clientHeight;
  live.runner = createRunner("callFirst", song, live.geom, live.viewH, { variant: "combo", mobile: true });
  live.seekedPending = true;
  renderFrame({ force: true });
}

function onPlayState() {
  if (!live) return;
  live.play.classList.toggle("is-playing", !audio.paused);
  // 止まっている間は、CSS の動き（名前コールの脈打ち・オーロラ）も止める
  live.stage.classList.toggle("is-paused", audio.paused);
  live.play.textContent = audio.paused ? "再生" : "一時停止";
  live.play.setAttribute("aria-label", audio.paused ? "再生" : "一時停止");
  // 【2026-10-30 fix-live】再生を始めたら、上の部分を1回だけ自動で折りたたむ（あとは［表示の設定］で自由に開け閉め。止めても勝手に開かない＝画面が跳ねない）
  if (!audio.paused && !live.autoCollapsed) {
    live.autoCollapsed = true;
    if (!live.toolbarCollapsed) setLiveToolbarCollapsed(true);
  }
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

// コール・歌詞の行をタップ：その時刻へ（コールは1秒前から。時刻は js/callTapSeek.js で決めたもの）。再生の状態は変えない。
// 自動スクロールを手で止めていたら再開し、押した行を一瞬だけ光らせて「ここから」が分かるようにする
function seekLiveTo(time, { kind, node } = {}) {
  if (!audio?.src || !Number.isFinite(time)) return;
  const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : Infinity;
  audio.currentTime = Math.min(max, Math.max(0, time));
  if (!live) return;
  live.followPaused = false;
  live.resume.hidden = true;
  live.seekedPending = true;
  if (kind === "lyric" && node) {
    node.classList.remove("is-tapped");
    void node.offsetWidth; // 付け直しで、CSS の光を最初から
    node.classList.add("is-tapped");
  }
  renderFrame({ force: true });
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
  // 演出（見た目はすべて t だけから計算。js/callEffects.js の visualStateAt）
  const opts = effectOptions();
  const states = [];
  for (const c of live.fx) {
    const v = visualStateAt(c.prep.vis, t, opts);
    applyVisualState(c, v, t);
    if (v.phase === "active" || v.phase === "post") states.push(v);
  }
  // 大きな演出：演出 ありのときだけ。止まっている間は出さない（js/callSpectacle.js）
  live.spectacle?.update(t, { playing: !audio.paused && !audio.ended, enabled: prefs.effects !== "off", reduced: Boolean(opts.reduced) });
  // 舞台の背景の光：値が変わったときだけ書く
  const ambientValue = ambientAt(states, opts.reduced ? "low" : opts.intensity);
  if (ambientValue !== live.ambientLast) {
    live.ambient.style.opacity = String(ambientValue);
    live.ambientLast = ambientValue;
  }
  // スクロール（案D）。手で止めている間は動かさない（光る・パネルは続ける）
  if (live.runner) {
    const seeked = live.seekedPending;
    live.seekedPending = false;
    const result = live.runner.step(t, seeked ? 0 : dt, { seeked });
    if (!live.followPaused) {
      // 【2026-10-29 本人の指摘「上から始まらない」】曲の始めは、少しのスクロールなら一番上（題名・前奏の見出し）を見せたままにする。
      // 少ない量ほど小さく、ある量（画面の高さの2割の2倍）を超えたら、元の計算どおりに進む（つなぎ目はなめらか）
      const T = live.stage.clientHeight * 0.2;
      const raw = Math.max(0, result.scrollTop);
      const target = Math.round(raw < 2 * T ? (raw * raw) / (4 * T) : raw - T);
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
  const nextLabel = state.next ? state.next.text.replace(/\s+/g, " ") : "—";
  const waitLabel = state.next ? formatNextWait(state.next.wait) : "";
  const soon = Boolean(state.next) && state.next.wait < NEXT_SOON_SEC;
  const key = `${nowLabel}|${nextLabel}|${waitLabel}|${soon}`;
  if (key !== live.panelKey) {
    live.nowText.textContent = nowLabel || "—";
    live.nextText.textContent = nextLabel;
    live.nextWait.textContent = waitLabel;
    live.nextRow.classList.toggle("is-soon", soon);
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
  live.unbindTaps?.();
  live.spectacle?.destroy();
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
