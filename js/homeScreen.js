// ホーム（案B）の部品を担当するファイル（2026-10-30新設・リニューアル第2段階）。
//
// 担当すること：
// ・プレイヤーのバーの「ランク」「称号の数」の表示（名前・推しの色と名前は今までどおり js/playerScreen.js）
// ・［ゲームスタート］［すぐ遊ぶ］［ライブコール］と、7つの入口のボタンを、既存の画面へつなぐ
// ・［すぐ遊ぶ］で使う「前回のイントロクイズの出題数・カテゴリ」の保存と復元（この端末だけ・localStorage）
//
// 画面の切り替えそのもの（navigateWithScrollMemory）や、各モードの準備処理は main.js が持っているので、
// ここでは呼び出し口（コールバック）を受け取って呼ぶだけにする（処理を二重に書かない）。

import { getAchievementListSnapshot } from "./achievementProgress.js";
import { buildRepresentativeLabel } from "./fanProfileCard.js";

const QUICK_PLAY_STORAGE_KEY = "equalLoveIntroQuiz.homeQuickPlaySelection";

const QUESTION_COUNT_LABELS = { 5: "5問", 10: "10問", 20: "20問", 50: "50問", all: "全曲" };
const CATEGORY_LABELS = { "title-track": "表題曲のみ", "title-and-group": "表題曲＋全員曲", all: "全曲" };

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

// ---- ［すぐ遊ぶ］の出題数・カテゴリ ----

// 保存されている値が、今のアプリに実在する選択肢かどうかを確かめてから返す（古い値・壊れた値は使わない）
export function parseQuickPlaySelection(raw) {
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!value || typeof value !== "object") return null;
    const questionCount = String(value.questionCount);
    const category = String(value.category);
    if (!(questionCount in QUESTION_COUNT_LABELS) || !(category in CATEGORY_LABELS)) return null;
    return { questionCount, category };
  } catch {
    return null;
  }
}

export function describeQuickPlaySelection(selection) {
  const questionCount = QUESTION_COUNT_LABELS[selection?.questionCount] ?? "5問";
  const category = CATEGORY_LABELS[selection?.category] ?? "表題曲のみ";
  return `イントロクイズ ${questionCount}・${category}`;
}

function readCheckedSelection() {
  const questionCount = document.querySelector('input[name="question-count"]:checked')?.value ?? "5";
  const category = document.querySelector('input[name="category-filter"]:checked')?.value ?? "title-track";
  return { questionCount, category };
}

function saveQuickPlaySelection(selection) {
  try {
    localStorage.setItem(QUICK_PLAY_STORAGE_KEY, JSON.stringify(selection));
  } catch {
    // 保存できなくても、次回は初期値（5問・表題曲のみ）で遊べるだけで困らない
  }
}

// 前回のイントロクイズの出題数・カテゴリを、ゲーム画面のラジオボタンへ戻す（起動時に1回）
function restoreQuickPlaySelection() {
  let saved = null;
  try {
    saved = parseQuickPlaySelection(localStorage.getItem(QUICK_PLAY_STORAGE_KEY));
  } catch {
    saved = null;
  }
  if (!saved) return;
  const countRadio = document.querySelector(`input[name="question-count"][value="${saved.questionCount}"]`);
  const categoryRadio = document.querySelector(`input[name="category-filter"][value="${saved.category}"]`);
  if (countRadio) countRadio.checked = true;
  if (categoryRadio) categoryRadio.checked = true;
}

// ---- 画面の部品 ----

let elements = null;
let callbacks = null;

// ライブコールの入口で呼ぶ処理。第2段階では今のライブコールモード（曲一覧）を開く。
// 第3段階で新しい流れ（注意事項 → 曲一覧 → 曲ページ）に差し替えるときは、setLiveCallEntryHandler で入れ替える。
let liveCallEntryHandler = null;

export function setLiveCallEntryHandler(handler) {
  liveCallEntryHandler = handler;
}

export function openLiveCallEntry() {
  if (liveCallEntryHandler) {
    liveCallEntryHandler();
    return;
  }
  callbacks?.openDefaultLiveCall?.();
}

export function renderHomePlayerStats() {
  if (!elements) return;
  const snapshot = getAchievementListSnapshot();
  const unlockedIds = snapshot.filter((entry) => entry.isUnlocked).map((entry) => entry.id);
  const { rankLabel, titlesText } = buildHomePlayerStats(unlockedIds, snapshot.length);
  elements.rank.textContent = rankLabel;
  elements.titles.textContent = titlesText;
}

export function renderQuickPlaySummary() {
  if (!elements) return;
  elements.quickPlaySummary.textContent = describeQuickPlaySelection(readCheckedSelection());
}

// elements：{ gameStartButton, quickPlayButton, quickPlaySummary, liveCallButton, rank, titles,
//            musicEntry, guidesEntry, settingsEntry, accountProtectionLink, startButton }
// callbacksArg：{ navigate(screenName), playClickSound(), openDefaultLiveCall(), openAccountProtection() }
export function initHomeScreen(newElements, callbacksArg) {
  elements = newElements;
  callbacks = callbacksArg;
  restoreQuickPlaySelection();

  elements.gameStartButton.addEventListener("click", () => {
    callbacks.playClickSound();
    callbacks.navigate("gameHub");
  });

  // ［すぐ遊ぶ］：ゲーム画面の［スタート］を押したのと同じ。音源が足りないときなどのエラーは
  // ゲーム画面の［スタート］の上に出るので、先にゲーム画面へ移ってから押す（エラーが見える位置で止まる）。
  elements.quickPlayButton.addEventListener("click", () => {
    callbacks.navigate("gameHub");
    elements.startButton.click();
    if (document.body.dataset.screen === "gameHub") {
      const error = document.getElementById("start-error");
      if (error && !error.hidden) error.scrollIntoView({ block: "center" });
    }
  });

  // ゲーム画面の［スタート］を押したら、そのときの出題数・カテゴリを「前回」として覚える
  elements.startButton.addEventListener("click", () => {
    saveQuickPlaySelection(readCheckedSelection());
    renderQuickPlaySummary();
  });
  document.querySelectorAll('input[name="question-count"], input[name="category-filter"]').forEach((radio) => {
    radio.addEventListener("change", renderQuickPlaySummary);
  });

  elements.liveCallButton.addEventListener("click", () => openLiveCallEntry());

  elements.musicEntry.addEventListener("click", () => {
    callbacks.playClickSound();
    callbacks.navigate("musicHub");
  });
  elements.guidesEntry.addEventListener("click", () => {
    callbacks.playClickSound();
    callbacks.navigate("guideHub");
  });
  elements.settingsEntry.addEventListener("click", () => {
    callbacks.playClickSound();
    callbacks.navigate("settings");
  });
  elements.accountProtectionLink.addEventListener("click", () => {
    callbacks.playClickSound();
    callbacks.openAccountProtection();
  });

  renderQuickPlaySummary();
}
