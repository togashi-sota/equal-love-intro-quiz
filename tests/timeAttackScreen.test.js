// js/timeAttackScreen.js のテスト。
// 2026-08-07追加：ランダム再生variant（出題タイプ）の追加に対する回帰防止テスト。
// 最重要の確認事項は「新設のランダム再生タイムアタックが、既存の『ノーミスマスター』
// 『電光石火』（イントロ／イントロ形式タイムアタックだけが対象）を勝手に満たしてしまわないこと」
// （本人指示）。
import {
  TIME_ATTACK_VARIANT,
  startTimeAttackRun,
  getCurrentTimeAttackVariant,
  getCurrentTimeAttackSeed,
  recordTimeAttackAnswer,
  initTimeAttackResultScreen,
  renderTimeAttackResult,
  getLastTimeAttackSelection,
} from "../js/timeAttackScreen.js";
import { getAchievementListSnapshot } from "../js/achievementProgress.js";
import { assertEqual } from "./test-utils.js";

const ACHIEVEMENTS_KEY = "equalLoveIntroQuiz.achievements";
const TIME_ATTACK_BEST_KEYS = [
  "equalLoveIntroQuiz.timeAttackBest.normal.5.all",
  "equalLoveIntroQuiz.timeAttackBest.randomPlayback.normal.5.all",
];
const TIME_ATTACK_HISTORY_KEY = "equalLoveIntroQuiz.timeAttackHistory";

function buildFakeQuestion(songId) {
  return {
    song: { id: songId, title: `テスト曲${songId}` },
    choices: [
      { id: "c1", title: "A" },
      { id: "c2", title: "B" },
      { id: "c3", title: "C" },
      { id: "c4", title: "D" },
    ],
  };
}

function buildFakeResultElements() {
  return {
    newRecordBadge: document.createElement("p"),
    failStatus: document.createElement("p"),
    totalTime: document.createElement("p"),
    correctCount: document.createElement("p"),
    missCount: document.createElement("p"),
    ruleLabel: document.createElement("p"),
    bestTime: document.createElement("p"),
    achievementChipContainer: document.createElement("div"),
    achievementListLink: document.createElement("button"),
  };
}

function cleanup() {
  localStorage.removeItem(ACHIEVEMENTS_KEY);
  localStorage.removeItem(TIME_ATTACK_HISTORY_KEY);
  TIME_ATTACK_BEST_KEYS.forEach((key) => localStorage.removeItem(key));
}

// 5問すべてノーミス正解のタイムアタックを実行し、結果画面まで描画する（本番の
// beginTimeAttackQuiz→…→renderTimeAttackResult()の流れを、DOM要素だけ差し替えて再現する）。
function playCleanFiveQuestionRun(variant) {
  initTimeAttackResultScreen(buildFakeResultElements());
  startTimeAttackRun("normal", "5", "all", variant);
  for (let i = 0; i < 5; i++) {
    recordTimeAttackAnswer({ elapsedMs: 1000, isCorrect: true, question: buildFakeQuestion(`song-${i}`) });
  }
  renderTimeAttackResult();
}

export function runTimeAttackScreenTests() {
  cleanup();

  // ---- variant省略時はintroになる（既存呼び出し元との後方互換） ----
  startTimeAttackRun("normal", "5", "all");
  assertEqual(getCurrentTimeAttackVariant(), TIME_ATTACK_VARIANT.INTRO, "variant省略時はintro扱いになる");
  assertEqual(getCurrentTimeAttackSeed(), 0, "introではseedを使わないため0のまま");

  // ---- ランダム再生variantを開始すると、種(seed)が発行される ----
  startTimeAttackRun("normal", "5", "all", TIME_ATTACK_VARIANT.RANDOM_PLAYBACK);
  assertEqual(
    getCurrentTimeAttackVariant(),
    TIME_ATTACK_VARIANT.RANDOM_PLAYBACK,
    "指定したvariantがそのまま保持される"
  );
  assertEqual(typeof getCurrentTimeAttackSeed(), "number", "ランダム再生variantでは数値の種が発行される");

  // ---- getLastTimeAttackSelection()にvariantが含まれる ----
  assertEqual(
    getLastTimeAttackSelection().variant,
    TIME_ATTACK_VARIANT.RANDOM_PLAYBACK,
    "getLastTimeAttackSelectionが直前のvariantを返す（もう一度挑戦する、で使われる）"
  );
  cleanup();

  // ---- 【本人指示の核心】イントロ形式タイムアタックの全問ノーミスクリアは、
  //      従来どおり「ノーミスマスター」相当（5問ならブロンズ）を解放する ----
  playCleanFiveQuestionRun(TIME_ATTACK_VARIANT.INTRO);
  const afterIntro = getAchievementListSnapshot();
  const bronzeAfterIntro = afterIntro.find((a) => a.id === "no_miss_bronze");
  assertEqual(
    bronzeAfterIntro.isUnlocked,
    true,
    "イントロ形式タイムアタックの5問ノーミスクリアは、従来どおりノーミス称号(ブロンズ)を解放する"
  );
  cleanup();

  // ---- 【本人指示の核心】ランダム再生タイムアタックの全問ノーミスクリアは、
  //      既存のノーミス称号を勝手に解放しない（別のmodeIdで判定されるため） ----
  playCleanFiveQuestionRun(TIME_ATTACK_VARIANT.RANDOM_PLAYBACK);
  const afterRandomPlayback = getAchievementListSnapshot();
  const bronzeAfterRandomPlayback = afterRandomPlayback.find((a) => a.id === "no_miss_bronze");
  assertEqual(
    bronzeAfterRandomPlayback.isUnlocked,
    false,
    "ランダム再生タイムアタックの5問ノーミスクリアは、既存のノーミス称号(ブロンズ)を勝手に解放しない"
  );

  cleanup();
}
