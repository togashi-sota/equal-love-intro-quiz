// ホーム（案F・2026-10-30 本人が正式採用）の部品を担当するファイル。
// （2026-10-30 リニューアル第2段階で案Bとして新設 → 同日、案Fへ作り替え）
//
// 担当すること：
// ・上部バーの「ランク」「称号の数」・推しの色の点（名前・推しの名前・推しの色は今までどおり js/playerScreen.js）
// ・目次（ゲーム／ライブ／楽曲／＝LOVE／マイ・データ）：押すとそのカードへスクロール、手でスクロールすると今の分類を強調
// ・ゲームのカードの「イントロクイズ」：出題数・カテゴリ・自己ベスト・案内・［この設定でスタート］
//   選んだ値はゲーム画面（#game-hub-screen）のラジオボタン question-count／category-filter に書き込み、
//   ［この設定でスタート］はゲーム画面の［スタート］（#start-button）を押したのと同じ処理を呼ぶ（新しい開始処理は作らない）
// ・各カードの入口ボタン（data-home-action）を、既存の画面を開く処理へつなぐ
// ・マイページ・データの箱：音源の数・バックアップの状態・必要なときだけ出す案内（検索の下）
//
// 画面の切り替えそのもの（navigateWithScrollMemory）や各モードの準備処理は main.js が持っているので、
// ここでは呼び出し口（コールバック）を受け取って呼ぶだけにする（処理を二重に書かない）。

import { getAchievementListSnapshot } from "./achievementProgress.js";
import { buildRepresentativeLabel } from "./fanProfileCard.js";
import { filterSongsByCategory, filterSongsByAvailableAudio, MIN_SONGS_REQUIRED } from "./quiz.js";
import { getImportedSongIds } from "./audioStorage.js";
import { getBackupStatusForDisplay, onBackupStatusChange } from "./backupSync.js";

const QUICK_PLAY_STORAGE_KEY = "equalLoveIntroQuiz.homeQuickPlaySelection";

// 出題数・カテゴリの選択肢（値はゲーム画面のラジオボタンと同じ）。
// 出題数の "all" は、表示だけ「全問」にする（カテゴリの「全曲」と区別するため。自己ベストの表記と同じ）。
export const QUESTION_COUNT_OPTIONS = [
  ["5", "5問"],
  ["10", "10問"],
  ["20", "20問"],
  ["50", "50問"],
  ["all", "全問"],
];
export const CATEGORY_OPTIONS = [
  ["title-track", "表題曲のみ"],
  ["title-and-group", "表題曲＋全員曲"],
  ["all", "全曲"],
];
// 初めての人の設定（ゲーム画面のラジオボタンの初期値と同じ）
export const DEFAULT_INTRO_SELECTION = { questionCount: "5", category: "title-track" };

// 自己ベストの条件の短い表記（以前 main.js の updateModeBestScoreDisplay にあったものをここへ移し、ゲーム画面とホームで共通に使う）
const BEST_COUNT_LABELS = { 5: "5問", 10: "10問", 20: "20問", 50: "50問", all: "全問" };
const BEST_CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };
// 「表題曲 23曲のうち…」の案内で使うカテゴリの呼び方
const CATEGORY_POOL_LABELS = { "title-track": "表題曲", "title-and-group": "表題曲＋全員曲", all: "全曲" };

// ---- ランク・称号の数（純粋関数：テストしやすくするため DOM を使わない） ----

// unlockedIds：獲得した称号の id の配列。totalCount：称号の総数。
// 戻り値：{ rankLabel, titlesText }
// ランクは、フレンドのプロフィールと同じ考え方（js/fanProfileCard.js の buildRepresentativeLabel：
// ＝LOVE完全制覇 → ＝LOVEマスター → 各系統の上位の称号 → 下位の称号）。称号が無ければ「これから挑戦！」。
export function buildHomePlayerStats(unlockedIds, totalCount) {
  const unlocked = Array.isArray(unlockedIds) ? unlockedIds : [];
  const unlockedSet = new Set(unlocked);
  const representative = buildRepresentativeLabel({
    unlockedAchievementIds: unlocked,
    hasEqualLoveComplete: unlockedSet.has("equal_love_complete"),
    hasEqualLoveMaster: unlockedSet.has("equal_love_master"),
  });
  let rankLabel = representative;
  if (!rankLabel) rankLabel = unlocked.length === 0 ? "これから挑戦！" : "CHALLENGER";
  return { rankLabel, titlesText: `称号 ${unlocked.length}/${totalCount}` };
}

// ---- イントロクイズの出題数・カテゴリ（純粋関数） ----

// 保存されている値が、今のアプリに実在する選択肢かどうかを確かめてから返す（古い値・壊れた値は使わない）
export function parseQuickPlaySelection(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const questionCount = String(value.questionCount);
    const category = String(value.category);
    if (!QUESTION_COUNT_OPTIONS.some(([v]) => v === questionCount) || !CATEGORY_OPTIONS.some(([v]) => v === category)) return null;
    return { questionCount, category };
  } catch {
    return null;
  }
}

// 自己ベストの表示文（ゲーム画面の自己ベストのチップと同じ文。best は getHighScore の値）
export function formatIntroBest(questionCountValue, categoryFilterValue, best) {
  return {
    condition: `${BEST_COUNT_LABELS[questionCountValue]}・${BEST_CATEGORY_LABELS[categoryFilterValue]}`,
    value: best > 0 ? `ベスト ${best}点` : "ベスト 記録なし",
    empty: !(best > 0),
  };
}

// 出題数の案内（ゲーム画面の #question-count-notice と同じ文。main.js の updateQuestionCountNotice と同じ条件）
export function buildQuestionCountNotice(questionCountValue, playableCount) {
  if (questionCountValue === "all") return "";
  return Number(questionCountValue) > playableCount ? `対象曲数が${questionCountValue}曲未満のため、全${playableCount}問を出題します` : "";
}

// この設定で遊べるか・出す案内（純粋関数）
//   categoryCount：カテゴリの曲数（音源に関係なく）／playableCount：そのうちこの端末に音源がある曲数／importedCount：音源がある曲の総数
//   戻り値：{ state: "ok" | "noAudio" | "tooFew", notices: [文] }
export function describeIntroPool({ questionCount, category, categoryCount, playableCount, importedCount }) {
  if (importedCount === 0) {
    return { state: "noAudio", notices: ["この端末に音源がありません。「音源を取り込む」から取り込むと遊べます。"] };
  }
  if (playableCount < MIN_SONGS_REQUIRED) {
    return {
      state: "tooFew",
      notices: [`この端末で音源がある${CATEGORY_POOL_LABELS[category]}は${playableCount}曲です（${MIN_SONGS_REQUIRED}曲以上必要）。カテゴリの範囲を広げるか、音源を取り込んでください。`],
    };
  }
  const notices = [];
  const countNotice = buildQuestionCountNotice(questionCount, playableCount);
  if (countNotice) notices.push(countNotice);
  else if (questionCount === "all") notices.push(`全問＝出題できる${playableCount}曲をすべて出題します`);
  if (playableCount < categoryCount) {
    notices.push(`${CATEGORY_POOL_LABELS[category]} ${categoryCount}曲のうち、この端末に音源がある${playableCount}曲から出題します`);
  }
  return { state: "ok", notices };
}

// ---- バックアップの状態の表示（純粋関数。backup-status-spec.md） ----
// 確かめられたことだけを書く。「いつでも」「完全に」とは書かない。
//   status：getBackupStatusForDisplay() の戻り値 { result, lastSuccessAt }
//   戻り値：{ kind: "ok" | "unknown" | "error", text }
export function formatBackupTime(at, now = Date.now()) {
  const date = new Date(at);
  const today = new Date(now);
  const hhmm = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const sameDay = date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
  return sameDay ? hhmm : `${date.getMonth() + 1}/${date.getDate()} ${hhmm}`;
}

export function describeBackupStatus(status, now = Date.now()) {
  const result = status?.result ?? null;
  const lastSuccessAt = status?.lastSuccessAt ?? null;
  // 持ち主の確認が取れない（denied）・通信などの失敗（error）：最後に試した書き込みはできていない
  if (result === "denied" || result === "error") {
    return { kind: "error", text: "記録をバックアップに書き込めていません" };
  }
  // この端末で本当に書き込めた時刻があるときだけ「できました」と書く
  if (typeof lastSuccessAt === "number" && Number.isFinite(lastSuccessAt)) {
    return { kind: "ok", text: `記録・称号などは ${formatBackupTime(lastSuccessAt, now)} にバックアップできました` };
  }
  return { kind: "unknown", text: "バックアップはまだ確認していません" };
}

// 検索の下の「必要なときだけの案内」（純粋関数）。問題なく遊べるときは null（何も出さない。「最新版です」とは言わない）
export function buildHomeDataAlert({ importedCount, backupKind }) {
  if (importedCount === 0) {
    return { kind: "start", title: "まず音源・歌詞を取り込もう", sub: "取り込むとイントロクイズで遊べます" };
  }
  if (backupKind === "error") {
    return { kind: "warn", title: "記録をバックアップに書き込めていません", sub: "通信できる所で開き直すと、もう一度試します" };
  }
  return null;
}

// ---- 目次（純粋関数） ----
// target：押したときにスクロールする先。マイ・データはカードの見出しではなく、データの箱（2つの入口）へ。
export const HOME_NAV_SECTIONS = [
  { id: "game", label: "ゲーム", card: "home-card-game", target: "home-card-game" },
  { id: "live", label: "ライブ", card: "home-card-live", target: "home-card-live" },
  { id: "music", label: "楽曲", card: "home-card-music", target: "home-card-music" },
  { id: "know", label: "＝LOVE", card: "home-card-know", target: "home-card-know" },
  { id: "my", label: "マイ・データ", card: "home-card-my", target: "home-data-box" },
];

// 今いる分類：目次のすぐ下（line）を通り過ぎた最後のカード。ページの一番下まで来たら最後のカード
export function pickCurrentNavIndex(cardTops, line, atBottom) {
  if (atBottom) return cardTops.length - 1;
  let index = 0;
  cardTops.forEach((top, i) => {
    if (typeof top === "number" && top <= line) index = i;
  });
  return index;
}

// ---- 入口ボタンの行き先（data-home-action の値 → 何をするか） ----
// type：
//   mode     … ゲーム画面のモードのカードを押したのと同じ（main.js の openSpecialModeById）
//   navigate … 画面を開く（navigateWithScrollMemory）
//   click    … 既存のボタン（id）を押したのと同じ（移した先の画面の入口。戻り先・準備処理はそのボタンの処理のまま）
//   live     … 新しいライブコールの曲一覧を、その遊び方を選んだ状態で開く
//   callback … main.js から受け取った処理を呼ぶ（ownSound：その処理が自分で効果音を鳴らすので、ここでは鳴らさない）
// ここに無い入口（フレンド・ランキング・実績・プロフィール・検索・ライブ履歴・周年ヒストリー・音楽番組・メンバー）は、
// 以前と同じ id のボタンを置き、main.js の今までの処理がそのまま動く。
export const HOME_ACTIONS = {
  "outro-quiz": { type: "mode", value: "outroQuiz" },
  "lyrics-quiz": { type: "mode", value: "lyricsQuiz" },
  "online-battle": { type: "mode", value: "onlineBattle" },
  "party-battle": { type: "mode", value: "partyBattle" },
  "weak-songs": { type: "mode", value: "weakSongs" },
  "all-games": { type: "navigate", value: "gameHub" },
  // 【2026-10-29 本人の判断】ライブコールは前の版（ゲーム画面の「ライブコールモード」と同じ曲一覧）。新しい3モードは別の入口
  "live-call-classic": { type: "mode", value: "liveCallMode" },
  "live-call-new": { type: "live", value: null },
  "live-guide": { type: "click", value: "live-guide-link" },
  songlist: { type: "click", value: "songlist-link" },
  "lyrics-search": { type: "click", value: "lyrics-search-link" },
  "continuous-play": { type: "click", value: "continuous-play-link" },
  playlists: { type: "click", value: "playlist-link" },
  favorites: { type: "click", value: "songlist-favorites-link" },
  works: { type: "callback", value: "openDiscographyWorks", ownSound: true },
  centers: { type: "callback", value: "openCenters" },
  commercials: { type: "callback", value: "openGroupCommercials", ownSound: true },
  "data-update": { type: "callback", value: "openDataManagement" },
  "data-transfer": { type: "callback", value: "openTransferRecovery" },
  history: { type: "click", value: "history-link" },
  guides: { type: "navigate", value: "guideHub" },
  settings: { type: "navigate", value: "settings" },
};

// ---- 保存（この端末だけ・localStorage） ----

function readSavedSelection() {
  try {
    return parseQuickPlaySelection(localStorage.getItem(QUICK_PLAY_STORAGE_KEY));
  } catch {
    return null;
  }
}

function saveQuickPlaySelection(selection) {
  try {
    localStorage.setItem(QUICK_PLAY_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // 保存できなくても、次回は初期値（5問・表題曲のみ）で遊べるだけで困らない
  }
}

// ゲーム画面のラジオボタンの今の選択（ホームとゲーム画面の「正」はこのラジオボタン）
function readCheckedSelection() {
  const questionCount = document.querySelector('input[name="question-count"]:checked')?.value ?? DEFAULT_INTRO_SELECTION.questionCount;
  const category = document.querySelector('input[name="category-filter"]:checked')?.value ?? DEFAULT_INTRO_SELECTION.category;
  return { questionCount, category };
}

// ラジオボタンを選び、変わったときだけ change を送る（ゲーム画面の自己ベスト・案内・保存の処理がそのまま動く）
function checkRadio(name, value) {
  const radio = document.querySelector(`input[name="${name}"][value="${value}"]`);
  if (!radio || radio.checked) return false;
  radio.checked = true;
  radio.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

// ---- 画面の部品 ----

let root = null;
let callbacks = null;
let importedSongIds = null; // この端末に音源がある曲の id（読み込めるまで null）
let starting = false; // ［この設定でスタート］を2回続けて押しても、ゲームを2つ始めない
let navButtons = [];
let scrollTicking = false;
// 目次を押した直後は、押した分類を強調したままにする（最後の方のカードはページの終わりで止まり、
// 「目次のすぐ下」まで来られないため）。本人が自分でスクロールし始めたら、位置から決める方へ戻す
let navPinnedIndex = null;

// ライブコールの入口で呼ぶ処理（main.js が setLiveCallEntryHandler で入れる。第3〜5段階の新しいライブコール）
let liveCallEntryHandler = null;

export function setLiveCallEntryHandler(handler) {
  liveCallEntryHandler = handler;
}

// mode：最初から選んでおく遊び方（"sheet" | "live" | "karaoke"。無ければ選ばない）
export function openLiveCallEntry(mode = null) {
  liveCallEntryHandler?.(mode);
}

const $ = (selector) => root?.querySelector(selector) ?? null;

export function renderHomePlayerStats() {
  if (!root) return;
  const snapshot = getAchievementListSnapshot();
  const unlockedIds = snapshot.filter((entry) => entry.isUnlocked).map((entry) => entry.id);
  const { rankLabel, titlesText } = buildHomePlayerStats(unlockedIds, snapshot.length);
  const rank = $("#home-player-rank");
  const titles = $("#home-player-titles");
  if (rank) rank.textContent = rankLabel;
  if (titles) titles.textContent = titlesText;
  const titleButton = $("#title-list-link");
  if (titleButton) titleButton.setAttribute("aria-label", `実績（称号一覧）を開く。${titlesText}`);
}

// 推しの名前の前の色の点：プレイヤーの丸（js/playerScreen.js が推しの色を塗る）と同じ色にする
function syncOshiDot() {
  const swatch = $("#player-hero-swatch");
  const dot = $("#home-oshi-dot");
  if (!swatch || !dot) return;
  const color = swatch.style.background;
  dot.style.background = color || "";
  dot.classList.toggle("is-empty", !color);
}

// イントロクイズの板を、今の選択（ゲーム画面のラジオボタン）に合わせて描き直す
export function renderHomeIntroPanel() {
  if (!root || !callbacks) return;
  const selection = readCheckedSelection();
  root.querySelectorAll("[data-home-count]").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.homeCount === selection.questionCount));
  });
  root.querySelectorAll("[data-home-category]").forEach((button) => {
    button.setAttribute("aria-checked", String(button.dataset.homeCategory === selection.category));
  });

  const best = formatIntroBest(selection.questionCount, selection.category, callbacks.getHighScore(selection.questionCount, selection.category));
  const bestBox = $("#home-intro-best");
  if (bestBox) bestBox.classList.toggle("is-empty", best.empty);
  const condition = $("#home-intro-best-condition");
  const value = $("#home-intro-best-value");
  if (condition) condition.textContent = best.condition;
  if (value) value.textContent = best.value;

  const startButton = $("#home-intro-start-button");
  const startLabel = $("#home-intro-start-label");
  const notices = $("#home-intro-notices");
  if (!startButton || !notices) return;
  if (importedSongIds === null) {
    // 音源の数を確かめている間は、ふつうの［この設定でスタート］（押せばゲーム画面の［スタート］と同じ処理で確かめる）
    startButton.dataset.state = "ok";
    startButton.disabled = false;
    if (startLabel) startLabel.textContent = "この設定でスタート";
    notices.textContent = "";
    return;
  }
  const categoryPool = filterSongsByCategory(callbacks.songs, selection.category);
  const playable = filterSongsByAvailableAudio(categoryPool, importedSongIds);
  const pool = describeIntroPool({
    questionCount: selection.questionCount,
    category: selection.category,
    categoryCount: categoryPool.length,
    playableCount: playable.length,
    importedCount: importedSongIds.length,
  });
  startButton.dataset.state = pool.state;
  startButton.disabled = pool.state === "tooFew";
  if (startLabel) {
    startLabel.textContent = pool.state === "noAudio" ? "音源を取り込む" : pool.state === "tooFew" ? "この設定では遊べません" : "この設定でスタート";
  }
  notices.textContent = "";
  pool.notices.forEach((text) => {
    const p = document.createElement("p");
    p.className = "home-intro-notice";
    p.textContent = text;
    notices.appendChild(p);
  });
}

// カテゴリのボタンに曲数を添える（SONGS から毎回数える。固定値にしない）
function renderCategoryCounts() {
  root.querySelectorAll("[data-home-category-count]").forEach((element) => {
    element.textContent = `${filterSongsByCategory(callbacks.songs, element.dataset.homeCategoryCount).length}曲`;
  });
}

// 音源の数・バックアップの状態・必要なときだけの案内
function renderDataState() {
  if (!root || !callbacks) return;
  const total = callbacks.songs.length;
  const count = importedSongIds === null ? null : importedSongIds.length;
  const deviceText = $("#home-data-audio-count");
  if (deviceText) {
    deviceText.textContent = count === null ? "音源の数を確認中…" : count === 0 ? "音源 0／" + total + "曲（まだありません）" : `音源 ${count}／${total}曲`;
  }
  const backup = describeBackupStatus(getBackupStatusForDisplay());
  const line = $("#home-backup-status");
  const lineText = $("#home-backup-status-text");
  if (line) line.dataset.kind = backup.kind;
  if (lineText) lineText.textContent = backup.text;

  const alertBox = $("#home-data-alert");
  if (!alertBox) return;
  const alert = count === null ? (backup.kind === "error" ? buildHomeDataAlert({ importedCount: 1, backupKind: "error" }) : null) : buildHomeDataAlert({ importedCount: count, backupKind: backup.kind });
  alertBox.hidden = !alert;
  if (!alert) return;
  alertBox.dataset.kind = alert.kind;
  $("#home-data-alert-icon").textContent = alert.kind === "start" ? "🎵" : "⚠️";
  $("#home-data-alert-title").textContent = alert.title;
  $("#home-data-alert-sub").textContent = alert.sub;
}

// この端末の音源の数を読み直す（ホームに戻るたび・起動時）
export async function refreshHomeDeviceData() {
  try {
    importedSongIds = await getImportedSongIds();
  } catch {
    importedSongIds = null;
  }
  renderHomeIntroPanel();
  renderDataState();
}

// ---- 目次 ----

function stickyTopOf(element) {
  const top = parseFloat(getComputedStyle(element).top);
  return Number.isFinite(top) ? top : 0;
}

function scrollToHomeSection(targetId) {
  const nav = $("#home-category-nav");
  const target = document.getElementById(targetId);
  if (!nav || !target) return;
  const offset = stickyTopOf(nav) + nav.offsetHeight + 8;
  const top = Math.max(0, target.getBoundingClientRect().top + window.scrollY - offset);
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
}

export function markCurrentHomeSection() {
  if (!root || document.body.dataset.screen !== "start") return;
  const nav = $("#home-category-nav");
  if (!nav || navButtons.length === 0) return;
  const line = stickyTopOf(nav) + nav.offsetHeight + 24;
  const tops = HOME_NAV_SECTIONS.map((section) => document.getElementById(section.card)?.getBoundingClientRect().top ?? null);
  const atBottom = Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 2;
  const index = navPinnedIndex ?? pickCurrentNavIndex(tops, line, atBottom && window.scrollY > 0);
  navButtons.forEach((button, i) => {
    if (i === index) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
  });
  // 目次が横にはみ出す幅でも、今の分類が目次の中に見えるようにする
  const current = navButtons[index];
  if (current && (current.offsetLeft < nav.scrollLeft || current.offsetLeft + current.offsetWidth > nav.scrollLeft + nav.clientWidth)) {
    nav.scrollLeft = Math.max(0, current.offsetLeft - 16);
  }
}

function initCategoryNav() {
  const nav = $("#home-category-nav");
  if (!nav) return;
  navButtons = HOME_NAV_SECTIONS.map((section) => nav.querySelector(`[data-home-jump="${section.target}"]`));
  navButtons.forEach((button, i) => {
    button?.addEventListener("click", () => {
      callbacks.playClickSound();
      navPinnedIndex = i;
      scrollToHomeSection(button.dataset.homeJump);
      markCurrentHomeSection();
    });
  });
  // 自分でスクロールし始めた（指・ホイール・キー）ら、押した分類の固定をやめる
  const unpin = () => {
    navPinnedIndex = null;
  };
  ["touchstart", "wheel", "keydown"].forEach((type) => window.addEventListener(type, unpin, { passive: true }));
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTicking) return;
      scrollTicking = true;
      requestAnimationFrame(() => {
        scrollTicking = false;
        markCurrentHomeSection();
      });
    },
    { passive: true },
  );
}

// ---- 入口ボタン ----

function runHomeAction(name) {
  const action = HOME_ACTIONS[name];
  if (!action) return;
  if (action.type === "click") {
    // 既存のボタンの処理が効果音も鳴らす
    document.getElementById(action.value)?.click();
    return;
  }
  if (action.type === "mode") {
    callbacks.openGameMode(action.value); // ゲーム画面のカードと同じ処理（効果音もそちらで鳴る）
    return;
  }
  if (!action.ownSound) callbacks.playClickSound();
  if (action.type === "navigate") callbacks.navigate(action.value);
  else if (action.type === "live") openLiveCallEntry(action.value);
  else if (action.type === "callback") callbacks[action.value]?.();
}

// ［この設定でスタート］：ゲーム画面の［スタート］（#start-button）を押したのと同じ。
// 音源が無いときは「音源を取り込む」＝データ管理を開く。
function handleIntroStart() {
  const button = $("#home-intro-start-button");
  if (!button || starting) return;
  if (button.dataset.state === "noAudio") {
    callbacks.playClickSound();
    callbacks.openDataManagement();
    return;
  }
  if (button.dataset.state === "tooFew") return;
  starting = true;
  button.setAttribute("aria-disabled", "true");
  button.classList.add("is-starting");
  callbacks.startButton.click();
  // 始められなかった（音源が足りないなど）ときは、エラーがゲーム画面の［スタート］の上に出るので、
  // ゲーム画面へ移って見える位置で止める（スタートの処理は非同期のため、少し待ってから確かめる）
  const startedAt = Date.now();
  const check = () => {
    if (document.body.dataset.screen !== "start") return releaseStartLock();
    const error = document.getElementById("start-error");
    if (error && !error.hidden) {
      releaseStartLock();
      callbacks.navigate("gameHub");
      error.scrollIntoView({ block: "center" });
      return;
    }
    if (Date.now() - startedAt < 4000) setTimeout(check, 100);
    else releaseStartLock();
  };
  setTimeout(check, 100);
}

function releaseStartLock() {
  starting = false;
  const button = $("#home-intro-start-button");
  if (!button) return;
  button.removeAttribute("aria-disabled");
  button.classList.remove("is-starting");
}

// homeRoot：#start-screen
// callbacksArg：{ songs, getHighScore(count, category), startButton(#start-button), navigate(screenName), playClickSound(),
//   openGameMode(modeId), openDiscographyWorks(), openCenters(), openGroupCommercials(), openDataManagement(), openTransferRecovery(),
//   onScreenChange(listener) }
export function initHomeScreen(homeRoot, callbacksArg) {
  root = homeRoot;
  callbacks = callbacksArg;

  // 前回の出題数・カテゴリを、ゲーム画面のラジオボタンへ戻す（起動時に1回）。初めては 5問・表題曲のみ（ラジオの初期値）
  const saved = readSavedSelection();
  if (saved) {
    const countRadio = document.querySelector(`input[name="question-count"][value="${saved.questionCount}"]`);
    const categoryRadio = document.querySelector(`input[name="category-filter"][value="${saved.category}"]`);
    if (countRadio) countRadio.checked = true;
    if (categoryRadio) categoryRadio.checked = true;
  }

  // ホームの出題数・カテゴリ → ゲーム画面のラジオボタン（change が送られ、ゲーム画面の表示・保存も同じ処理で更新される）
  root.querySelectorAll("[data-home-count]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!checkRadio("question-count", button.dataset.homeCount)) renderHomeIntroPanel();
    });
  });
  root.querySelectorAll("[data-home-category]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!checkRadio("category-filter", button.dataset.homeCategory)) renderHomeIntroPanel();
    });
  });
  // どちらの画面で変えても：保存し、ホームの板を描き直す（ホームとゲーム画面はいつも同じ選択）
  document.querySelectorAll('input[name="question-count"], input[name="category-filter"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      saveQuickPlaySelection(readCheckedSelection());
      renderHomeIntroPanel();
    });
  });
  // ゲーム画面の［スタート］を押したときも、そのときの選択を保存する（第2段階と同じ）
  callbacks.startButton.addEventListener("click", () => saveQuickPlaySelection(readCheckedSelection()));

  $("#home-intro-start-button")?.addEventListener("click", handleIntroStart);
  root.querySelectorAll("[data-home-action]").forEach((button) => {
    button.addEventListener("click", () => runHomeAction(button.dataset.homeAction));
  });
  // 必要なときだけの案内：マイページ・データの箱へスクロール
  $("#home-data-alert")?.addEventListener("click", () => {
    callbacks.playClickSound();
    scrollToHomeSection("home-data-box");
  });

  initCategoryNav();
  renderCategoryCounts();

  // 推しの色の点：プレイヤーの丸の色が変わったら合わせる
  const swatch = $("#player-hero-swatch");
  if (swatch && typeof MutationObserver === "function") {
    new MutationObserver(syncOshiDot).observe(swatch, { attributes: true, attributeFilter: ["style", "class"] });
  }
  syncOshiDot();

  onBackupStatusChange(renderDataState);
  callbacks.onScreenChange((screenName) => {
    if (screenName !== "start") {
      releaseStartLock();
      navPinnedIndex = null;
      return;
    }
    renderHomePlayerStats();
    renderHomeIntroPanel();
    refreshHomeDeviceData();
    syncOshiDot();
    // 戻ってきてスクロール位置が戻ったあとに、目次の強調を合わせる
    requestAnimationFrame(markCurrentHomeSection);
  });

  renderHomePlayerStats();
  renderHomeIntroPanel();
  renderDataState();
  refreshHomeDeviceData();
  requestAnimationFrame(markCurrentHomeSection);
}
