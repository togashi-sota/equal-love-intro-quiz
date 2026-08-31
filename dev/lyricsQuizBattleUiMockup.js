// 開発用：歌詞クイズ対戦のUI自動生成（Phase5）を、合成データで確認するためのツール。
// 実際のFirebase・本編アプリからは一切読み込まれない、確認専用のファイル
// （dev/callEditor.js等と同じ方針）。歌詞本文・実在の曲名は一切使用しない。

import {
  describeRuleOptions,
  describeAnswerPoolSizeOptions,
  describeSettingsForm,
  describeHudItems,
  describeResultTable,
  describeLyricsReadiness,
  describeOwnMissingLyricsTitles,
  renderRuleOptions,
  renderAnswerPoolSizeOptions,
  renderSettingsForm,
  renderHud,
  renderResultCards,
  renderLyricsReadinessStatus,
  renderOwnMissingLyricsTitles,
} from "../js/lyricsQuizBattleUi.js";

// ===== 合成データ（ダミーの曲・プレイヤー。実データは一切使わない） =====

const state = {
  ruleId: "combo",
  poolSize: 10,
  settings: { hintIntervalSec: 6 },
  currentView: "host", // "host" | "participant"
};

const lyricsCoverageByUid = {
  "player-1": { availableCount: 20, requiredCount: 20, complete: true, poolHash: "hash-a" },
  "player-2": { availableCount: 15, requiredCount: 20, complete: false, poolHash: "hash-a" },
  "player-3": { availableCount: 20, requiredCount: 20, complete: true, poolHash: "hash-a" },
};
const displayNameByUid = { "player-1": "たろう（ホスト）", "player-2": "はなこ", "player-3": "じろう（あなた）" };
const ownMissingSongTitles = ["ダミー曲タイトルA", "ダミー曲タイトルB"];

const hudStatsByRule = {
  classic: { correctCount: 3, firstHintCorrectCount: 2, totalHintsUsed: 7, totalElapsedMs: 4200 },
  steal: { totalPoints: 90, questionsWon: 2, lastWinnerName: "じろう", currentQuestionPoints: 40 },
  combo: { totalPoints: 168, currentCombo: 3, maxCombo: 5, currentMultiplier: 1.2 },
};

function buildRankedEntries(ruleId) {
  const base = [
    { uid: "player-1", displayName: "たろう", isHost: true, isYou: false, oshiColor: "#ff69b4", isDnf: false },
    { uid: "player-3", displayName: "じろう", isHost: false, isYou: true, oshiColor: "#4ecdc4", isDnf: false },
    { uid: "player-2", displayName: "はなこ", isHost: false, isYou: false, oshiColor: "#ffd93d", isDnf: true },
  ];
  const detailByRule = {
    classic: [
      { totalPoints: 130, firstHintCorrectCount: 3, totalHintsUsed: 6, totalElapsedMs: 4100, missCount: 0 },
      { totalPoints: 90, firstHintCorrectCount: 1, totalHintsUsed: 9, totalElapsedMs: 5200, missCount: 1 },
    ],
    steal: [
      { totalPoints: 100, questionsWon: 2, wonElapsedMsTotal: 1800 },
      { totalPoints: 50, questionsWon: 1, wonElapsedMsTotal: 900 },
    ],
    combo: [
      { totalPoints: 210, maxCombo: 6, totalHintsUsed: 6 },
      { totalPoints: 150, maxCombo: 4, totalHintsUsed: 8 },
    ],
  };
  const details = detailByRule[ruleId];
  return [
    { ...base[0], result: { detail: details[0] } },
    { ...base[1], result: { detail: details[1] } },
    { ...base[2], result: null },
  ];
}

// ===== 画面①：ルーム設定画面 ===== //

function renderSetupScreen() {
  const ruleOptions = describeRuleOptions(state.ruleId);
  renderRuleOptions(document.getElementById("rule-options"), ruleOptions, (ruleId) => {
    state.ruleId = ruleId;
    const poolOptions = describeAnswerPoolSizeOptions(ruleId, state.poolSize);
    if (!poolOptions.some((option) => option.selected)) {
      state.poolSize = poolOptions[0]?.size ?? state.poolSize;
    }
    renderSetupScreen();
  });

  const poolSizeOptions = describeAnswerPoolSizeOptions(state.ruleId, state.poolSize);
  renderAnswerPoolSizeOptions(document.getElementById("pool-size-options"), poolSizeOptions, (size) => {
    state.poolSize = size;
    renderSetupScreen();
  });

  const settingsFields = describeSettingsForm(state.ruleId, state.settings);
  renderSettingsForm(document.getElementById("settings-form"), settingsFields, (key, value) => {
    state.settings[key] = value;
    renderSetupScreen();
  });
}

// ===== 画面②：歌詞データ不足の表示 ===== //

function renderCoverageScreen() {
  const readiness = describeLyricsReadiness(lyricsCoverageByUid, "hash-a", displayNameByUid);
  renderLyricsReadinessStatus(document.getElementById("readiness-status"), readiness, {
    isHostView: state.currentView === "host",
  });

  const ownMissingContainer = document.getElementById("own-missing");
  if (state.currentView === "participant") {
    const ownMissing = describeOwnMissingLyricsTitles(ownMissingSongTitles);
    renderOwnMissingLyricsTitles(ownMissingContainer, ownMissing);
  } else {
    ownMissingContainer.innerHTML = "";
  }
}

// ===== 画面③：対戦中HUD ===== //

function renderBattleScreen() {
  const stats = hudStatsByRule[state.ruleId];
  const hudItems = describeHudItems(state.ruleId, stats);
  renderHud(document.getElementById("hud"), hudItems);
}

// ===== 画面④：結果画面 ===== //

function renderResultScreen() {
  const rankedEntries = buildRankedEntries(state.ruleId);
  const table = describeResultTable(state.ruleId, rankedEntries);
  renderResultCards(document.getElementById("result-table"), table);
}

function renderAllScreens() {
  renderSetupScreen();
  renderCoverageScreen();
  renderBattleScreen();
  renderResultScreen();
}

// ===== モックアップ操作用のナビゲーション ===== //

document.querySelectorAll("#mockup-nav button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("#mockup-nav button").forEach((b) => b.classList.remove("is-active"));
    button.classList.add("is-active");
    document.querySelectorAll(".mockup-screen").forEach((screen) => screen.classList.remove("is-active"));
    document.getElementById(`screen-${button.dataset.screen}`).classList.add("is-active");
  });
});

document.querySelectorAll("#mockup-view-toggle button").forEach((button) => {
  button.addEventListener("click", () => {
    state.currentView = button.dataset.view;
    document.querySelectorAll("#mockup-view-toggle button").forEach((b) => b.classList.remove("is-active"));
    button.classList.add("is-active");
    renderCoverageScreen();
  });
});

renderAllScreens();
