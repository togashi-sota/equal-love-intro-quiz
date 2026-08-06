// ランダム再生クイズ（曲中のランダムな位置から数秒間だけ再生し、曲名を当てるモード)の
// 設定画面・結果画面を担当するファイル。
//
// 【設計方針】進行ルール（ノーマル/ハード/LOVE連チャン）・タイマー計測・実行中の記録
// （合計タイム・ミス数など）は、タイムアタック（js/timeAttackScreen.js）と完全に同じ仕組みを
// そのまま再利用する（本人の要望：「既存のタイムアタックエンジンをアダプター方式で再利用し、
// 差し替えるのは音源の再生開始位置・再生時間だけにする」）。このファイルが新しく持つのは、
// ①このモード専用の再生開始位置の種（seed）の発行、②自己ベストの保存先（タイムアタックとは
// 別のjs/randomPlaybackScore.js）、③設定・結果、2つの画面の組み立て、の3つだけに絞っている。
import {
  TIME_ATTACK_RULE,
  startTimeAttackRun,
  getCurrentTimeAttackRule,
  getCurrentTimeAttackStats,
  buildAchievementResultInput,
} from "./timeAttackScreen.js";
import {
  getRandomPlaybackBest,
  saveRandomPlaybackBestIfBetter,
  saveRandomPlaybackBestReachIfBetter,
} from "./randomPlaybackScore.js";
import { evaluateAndSaveAchievements } from "./achievementProgress.js";
import { renderAchievementUnlockEvents } from "./achievementDisplay.js";

let elements = null;
let resultElements = null;

// ===== 1. 設定画面 =====

export function initRandomPlaybackScreen(newElements) {
  elements = newElements;
  elements.startButton.addEventListener("click", () => {
    const questionCountValue = document.querySelector('input[name="random-playback-question-count"]:checked').value;
    const categoryFilterValue = document.querySelector('input[name="random-playback-category-filter"]:checked').value;
    const rule = document.querySelector('input[name="random-playback-rule"]:checked').value;
    elements.onStart(questionCountValue, categoryFilterValue, rule);
  });
}

// ===== 再生開始位置の種（seed） =====
// 全端末で同じ計算結果になる必要があるオンライン対戦とは異なり、1人用では「毎回違う位置から
// 再生される」ことだけが目的のため、Math.random()で発行した値をそのまま種として使う
// （js/randomPlaybackEngine.jsのcomputeRandomStartTimeSec()自体は、種が決まれば
// 同じ問題・同じ曲では必ず同じ位置になる、という決定論的な計算をする）。
let currentSeed = 0;

// タイムアタックを開始する直前に呼ぶstartTimeAttackRun()と同じタイミングで、seedの発行も含めて呼ぶ。
// 実行中の記録（合計タイム・ミス数等）自体はstartTimeAttackRun()にそのまま任せる。
export function startRandomPlaybackRun(rule, questionCountValue, categoryFilterValue) {
  currentSeed = Math.floor(Math.random() * 0x100000000) >>> 0;
  startTimeAttackRun(rule, questionCountValue, categoryFilterValue);
}

export function getCurrentRandomPlaybackSeed() {
  return currentSeed;
}

// ===== 2. 結果画面 =====

export function initRandomPlaybackResultScreen(newElements) {
  resultElements = newElements;
}

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

const RULE_LABELS = {
  [TIME_ATTACK_RULE.NORMAL]: "ノーマル",
  [TIME_ATTACK_RULE.HARD]: "ハード",
  [TIME_ATTACK_RULE.LOVE_CHAIN]: "LOVE連チャン",
};

// 結果画面を描画し、自己ベスト・最高到達記録の判定・保存もすべてここで行う。
// タイムアタックのrenderTimeAttackResult()との違いは、①保存先がjs/randomPlaybackScore.js
// （このモード専用）であること、②プレイ履歴（js/timeAttackHistory.js）へは保存しないこと
// の2点のみ（対戦モードのfinishBattlePlay()も同じ理由で履歴には保存していない）。
export function renderRandomPlaybackResult(questionCountValue, categoryFilterValue) {
  const stats = getCurrentTimeAttackStats();
  const rule = getCurrentTimeAttackRule();

  const previousBest = getRandomPlaybackBest(rule, questionCountValue, categoryFilterValue);
  const isNewRecord =
    !stats.runFailed &&
    saveRandomPlaybackBestIfBetter(stats.totalElapsedMs, rule, questionCountValue, categoryFilterValue);

  if (rule === TIME_ATTACK_RULE.LOVE_CHAIN) {
    saveRandomPlaybackBestReachIfBetter(
      stats.perQuestionResults.length,
      stats.totalElapsedMs,
      questionCountValue,
      categoryFilterValue
    );
  }

  resultElements.totalTime.textContent = `${formatSeconds(stats.totalElapsedMs)}秒`;
  resultElements.correctCount.textContent = `${stats.correctCount} / ${stats.perQuestionResults.length}問`;
  resultElements.missCount.textContent = `${stats.missCount}回`;
  resultElements.ruleLabel.textContent = RULE_LABELS[rule] ?? "ノーマル";

  resultElements.newRecordBadge.hidden = !isNewRecord;
  resultElements.failStatus.hidden = !stats.runFailed;
  if (stats.runFailed) {
    resultElements.failStatus.textContent = `${stats.perQuestionResults.length}問目で失敗しました（LOVE連チャンは全問クリアのタイムだけが記録されます）`;
  }

  // 称号（実績）判定（2026-08-07追加、本人指示）。ランダム再生クイズの全曲ノーミスで
  // フルコーラスマスター・メロディアスを取得できる。判定の組み立て方はタイムアタックと
  // 完全に共通（js/timeAttackScreen.jsのbuildAchievementResultInput参照）。
  const achievementResult = evaluateAndSaveAchievements(
    buildAchievementResultInput(stats, "randomPlayback", questionCountValue)
  );
  renderAchievementUnlockEvents(achievementResult.newlyUnlockedIds, {
    chipContainer: resultElements.achievementChipContainer,
    achievementListLinkElement: resultElements.achievementListLink,
  });

  if (previousBest !== null) {
    resultElements.bestTime.hidden = false;
    resultElements.bestTime.textContent = isNewRecord
      ? `自己ベストを更新しました（前回: ${formatSeconds(previousBest)}秒）`
      : `自己ベスト: ${formatSeconds(previousBest)}秒`;
  } else if (!stats.runFailed) {
    resultElements.bestTime.hidden = false;
    resultElements.bestTime.textContent = "はじめての記録です";
  } else {
    resultElements.bestTime.hidden = true;
  }
}
