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
  TIME_ATTACK_VARIANT,
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
import { getAchievementById } from "./achievementDefinitions.js";
import { savePlayHistoryEntry } from "./playHistory.js";
import { formatResponseSeconds } from "./responseTime.js";
import { describeSpeedProgressForPlay, buildSpeedProgressResultBlock } from "./speedAchievementProgress.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

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

// 【2026-08-29追加、本人指示（⑭）】オリジナル問題作成モードのランダム再生タイプから使う、
// 種（seed）の発行だけを行う版。startRandomPlaybackRun()と違い、タイムアタック側の
// 進行状態（js/timeAttackScreen.jsのstartTimeAttackRun）は一切呼ばない
// （オリジナル問題作成モードはgameState.playMode==="special"で進行するため、
// タイムアタック側の状態を巻き込む必要が無い・巻き込むと無関係な状態が混ざってしまう）。
export function generateNewRandomPlaybackSeed() {
  currentSeed = Math.floor(Math.random() * 0x100000000) >>> 0;
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

  // グローバルランキングへの送信（2026-08-16追加、本人指示）。タイムアタックの
  // onNewRecordコールバック（js/timeAttackScreen.jsのrenderTimeAttackResult参照）と全く同じ
  // 設計。variantは、このモードの実行中に共有モジュール変数currentVariantが
  // "intro"のまま（startRandomPlaybackRunがstartTimeAttackRunへvariant引数を渡していない
  // ため）になっていても正しく送信できるよう、ここで明示的にRANDOM_PLAYBACKを指定する
  // （getCurrentTimeAttackVariant()には頼らない）。
  if (resultElements.leaderboardStatus) {
    resultElements.leaderboardStatus.hidden = true;
  }
  if (isNewRecord) {
    resultElements.onNewRecord?.({
      variant: TIME_ATTACK_VARIANT.RANDOM_PLAYBACK,
      questionCountValue,
      categoryFilterValue,
      rule,
      totalElapsedMs: stats.totalElapsedMs,
      missCount: stats.missCount,
      actualQuestionCount: stats.perQuestionResults.length,
    });
  }

  // 【2026-08-16追加、本人指示】公開設定に関係なく、ランキング条件（ミス0・完走）を
  // 満たした記録は常にローカルへ保存しておく（js/timeAttackScreen.jsのonCleanClearと
  // 同じ理由・同じ設計。isNewRecordだけに頼るとランキング条件を満たした記録を
  // 取りこぼす場合があるため、意図的に別の判定にしている）。
  if (!stats.runFailed && stats.missCount === 0) {
    resultElements.onCleanClear?.({
      variant: TIME_ATTACK_VARIANT.RANDOM_PLAYBACK,
      questionCountValue,
      categoryFilterValue,
      rule,
      totalElapsedMs: stats.totalElapsedMs,
      missCount: stats.missCount,
      actualQuestionCount: stats.perQuestionResults.length,
    });
  }

  // 称号（実績）判定（2026-08-07追加、本人指示）。ランダム再生クイズの全曲ノーミスで
  // フルコーラスマスター・メロディアスを取得できる。判定の組み立て方はタイムアタックと
  // 完全に共通（js/timeAttackScreen.jsのbuildAchievementResultInput参照）。
  const achievementInput = buildAchievementResultInput(stats, "randomPlayback", questionCountValue, categoryFilterValue);
  const achievementResult = evaluateAndSaveAchievements(achievementInput);
  renderAchievementUnlockEvents(achievementResult.newlyUnlockedIds, {
    chipContainer: resultElements.achievementChipContainer,
    achievementListLinkElement: resultElements.achievementListLink,
  });

  // 結果の達成度に応じた効果音（2026-08-10新設）。LOVE連チャン失敗時は鳴らさない。
  // 称号を新規獲得した回はachievementUnlock側の音と重ならないよう、こちらは鳴らさない。
  if (achievementResult.newlyUnlockedIds.length === 0 && !stats.runFailed) {
    const isCleanClearForSound = achievementInput.correctCount > 0 && achievementInput.wrongCount === 0;
    playSfx(isCleanClearForSound ? SFX_EVENTS.RESULT_PERFECT : SFX_EVENTS.RESULT_GOOD);
  }

  // 平均回答時間の表示（2026-08-09新設）。称号判定に渡したのと同じachievementInputの
  // averageResponseMsをそのまま使う（称号判定と画面表示の値が絶対にずれないようにするため）。
  if (resultElements.averageTime) {
    const formattedAverageResponseTime = formatResponseSeconds(achievementInput.averageResponseMs);
    resultElements.averageTime.hidden = formattedAverageResponseTime === null;
    if (formattedAverageResponseTime !== null) {
      resultElements.averageTime.textContent = `平均回答時間 ${formattedAverageResponseTime}`;
    }
  }

  // メロディアスまでの進捗（全曲モードのときだけ）。
  if (resultElements.speedProgressContainer) {
    const isCleanClear =
      achievementInput.correctCount > 0 && achievementInput.wrongCount === 0 && achievementInput.completed;
    const speedProgress = describeSpeedProgressForPlay({
      modeId: "randomPlayback",
      isAllSongsMode: categoryFilterValue === "all",
      isCleanClear,
      averageResponseMs: achievementInput.averageResponseMs,
    });
    resultElements.speedProgressContainer.innerHTML = "";
    const speedProgressBlock = buildSpeedProgressResultBlock(
      speedProgress,
      getAchievementById("melody_ace")?.name ?? "メロディアス"
    );
    if (speedProgressBlock) resultElements.speedProgressContainer.appendChild(speedProgressBlock);
  }

  // 【2026-08-08新設】統一プレイ履歴（js/playHistory.js）への保存。自己ベスト・称号とは
  // 別の保存先のため、この保存に失敗しても上のjs/randomPlaybackScore.jsへの自己ベスト保存・
  // 称号判定には一切影響しない。
  // 【2026-08-09修正】averageResponseMsを称号判定と同じachievementInputの値にした
  // （以前はnull固定で保存されており、プレイ履歴に平均回答時間が一切表示されないバグだった）。
  savePlayHistoryEntry({
    playedAt: Date.now(),
    modeId: "randomPlayback",
    modeLabel: "ランダム再生クイズ",
    questionCount: stats.perQuestionResults.length,
    isAllSongsMode: categoryFilterValue === "all",
    correctCount: stats.correctCount,
    wrongCount: stats.missCount,
    skippedCount: null,
    score: null,
    averageResponseMs: achievementInput.averageResponseMs,
    completed: !stats.runFailed,
    details: {
      rule,
      totalElapsedMs: stats.totalElapsedMs,
      isNewRecord,
    },
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
