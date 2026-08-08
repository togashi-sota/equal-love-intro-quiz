// 速度系の裏称号（電光石火・メロディアス）について、「今どのくらい条件に近いか」を
// 計算・表示するファイル。
//
// 【対象を厳密に絞る理由】称号の正式条件（js/achievementEvaluation.js）は、
// 電光石火＝イントロクイズ/タイムアタック（イントロ形式のみ）の全曲ノーミス、
// メロディアス＝ランダム再生クイズの全曲ノーミス、のみ。オンライン対戦・ローカル対戦・
// タイムアタックのランダム再生variantは、この称号の対象に一切含めない（本人指示）。
//
// 【しきい値は必ずjs/achievementEvaluation.jsから】1.7秒という数値をこのファイルや
// UI側へベタ書きしない。SPEED_THRESHOLD_MSを唯一の参照元とすることで、将来しきい値が
// 変わっても表示側が自動的に追従する。
import { SPEED_THRESHOLD_MS } from "./achievementEvaluation.js";
import { getHistoryEntries } from "./history.js";
import { getTimeAttackHistoryEntries } from "./timeAttackHistory.js";
import { getNativePlayHistoryEntries } from "./playHistory.js";
import { calculateAverageResponseMs, formatResponseSeconds, formatSecondsUntilThreshold } from "./responseTime.js";

const SPEED_ACHIEVEMENT_BY_MODE = {
  intro: "lightning_fast",
  timeAttack: "lightning_fast",
  randomPlayback: "melody_ace",
};

// ===== 過去履歴からの「ベスト平均回答時間」算出（称号一覧用） =====

// 通常イントロクイズの1件（js/history.jsの生データ）が、電光石火の対象になりうる
// 「全曲・誤答/未回答なし」かどうかを判定し、対象なら平均回答時間（正解のみ）を返す。
// 対象外・判定不能ならnull。
function evaluateIntroEntryForSpeed(entry) {
  if (entry.categoryFilterValue !== "all") return null;
  if (!Array.isArray(entry.answers) || entry.answers.length === 0) return null;
  const isClean = entry.answers.every((answer) => answer.result === "correct");
  if (!isClean) return null;
  const elapsedList = entry.answers
    .filter((answer) => answer.elapsedMs !== null && answer.elapsedMs !== undefined)
    .map((answer) => answer.elapsedMs);
  return calculateAverageResponseMs(elapsedList);
}

// タイムアタック（イントロ形式のみ。ランダム再生variantは電光石火の対象外）の1件
// （js/timeAttackHistory.jsの生データ）について、同様に判定する。
// 「ノーミス」は、js/timeAttackScreen.jsのbuildAchievementResultInput()と同じ基準
// （その問題で一度でも間違えたらmistakeCount>0）で判定する。
function evaluateTimeAttackEntryForSpeed(entry) {
  if ((entry.variant ?? "intro") !== "intro") return null;
  if (entry.categoryFilterValue !== "all") return null;
  if (!entry.completed) return null;
  if (!Array.isArray(entry.questions) || entry.questions.length === 0) return null;
  const isClean = entry.questions.every((question) => question.isCorrect && question.mistakeCount === 0);
  if (!isClean) return null;
  const elapsedList = entry.questions
    .filter((question) => question.isCorrect && question.elapsedMs !== null && question.elapsedMs !== undefined)
    .map((question) => question.elapsedMs);
  return calculateAverageResponseMs(elapsedList);
}

// ランダム再生クイズの1件（js/playHistory.jsのネイティブ保存分）について、同様に判定する。
// ランダム再生は問題ごとの内訳を保存していないため、保存時点で称号判定と同じ計算式から
// 求めたentry.averageResponseMsをそのまま信頼する（js/randomPlaybackScreen.js参照）。
function evaluateRandomPlaybackEntryForSpeed(entry) {
  if (entry.modeId !== "randomPlayback") return null;
  if (!entry.isAllSongsMode) return null;
  if (!entry.completed) return null;
  if (entry.wrongCount !== 0) return null;
  if (entry.averageResponseMs === null || entry.averageResponseMs === undefined) return null;
  return entry.averageResponseMs;
}

// 指定した速度称号（"lightning_fast" | "melody_ace"）について、これまでの
// 「全曲＋ノーミス」プレイの中で最速だった平均回答時間を返す（本人指示：
// 「ベスト平均タイム＝全曲＋ノーミスを満たしたプレイの中で最速」）。
// 該当プレイが1件も無ければ hasQualifyingPlay:false を返す（0秒等の推測値は出さない）。
export function computeBestSpeedProgress(achievementId) {
  const candidates = [];

  if (achievementId === "lightning_fast") {
    getHistoryEntries().forEach((entry) => {
      const value = evaluateIntroEntryForSpeed(entry);
      if (value !== null) candidates.push(value);
    });
    getTimeAttackHistoryEntries().forEach((entry) => {
      const value = evaluateTimeAttackEntryForSpeed(entry);
      if (value !== null) candidates.push(value);
    });
  } else if (achievementId === "melody_ace") {
    getNativePlayHistoryEntries().forEach((entry) => {
      const value = evaluateRandomPlaybackEntryForSpeed(entry);
      if (value !== null) candidates.push(value);
    });
  }

  if (candidates.length === 0) {
    return { hasQualifyingPlay: false, bestAverageResponseMs: null, thresholdMs: SPEED_THRESHOLD_MS };
  }
  return { hasQualifyingPlay: true, bestAverageResponseMs: Math.min(...candidates), thresholdMs: SPEED_THRESHOLD_MS };
}

// ===== 1回のプレイ結果からの進捗説明（結果画面用） =====

// modeId："intro" | "timeAttack" | "randomPlayback"（速度称号の対象外のmodeIdはnullを返す）。
// isAllSongsMode/isCleanClear/averageResponseMsは、呼び出し側（各結果画面）がすでに
// 持っている値をそのまま渡す（このファイルでは何も再計算しない＝称号判定と同じ入力を使う）。
export function describeSpeedProgressForPlay({ modeId, isAllSongsMode, isCleanClear, averageResponseMs }) {
  const achievementId = SPEED_ACHIEVEMENT_BY_MODE[modeId];
  if (!achievementId) return null;

  // 5/10/20/50問モードでは称号への距離を出さない（本人指示：全曲以外で出すと誤解を招くため）。
  if (!isAllSongsMode) return { achievementId, status: "not-applicable" };
  if (averageResponseMs === null || averageResponseMs === undefined) {
    return { achievementId, status: "no-data" };
  }

  if (!isCleanClear) {
    return {
      achievementId,
      status: "needs-clean-clear",
      averageResponseMs,
      thresholdMs: SPEED_THRESHOLD_MS,
      speedConditionMet: averageResponseMs <= SPEED_THRESHOLD_MS,
    };
  }

  if (averageResponseMs <= SPEED_THRESHOLD_MS) {
    return { achievementId, status: "achieved", averageResponseMs, thresholdMs: SPEED_THRESHOLD_MS };
  }

  return {
    achievementId,
    status: "progress",
    averageResponseMs,
    thresholdMs: SPEED_THRESHOLD_MS,
    secondsRemaining: formatSecondsUntilThreshold(averageResponseMs, SPEED_THRESHOLD_MS),
  };
}

// ===== DOM組み立て（結果画面・称号一覧カードの両方から呼ばれる） =====

// 結果画面用：今回のプレイ1回分の進捗ブロックを組み立てる。
// descriptorがnull、またはstatusが"not-applicable"/"no-data"のときは何も表示しない
// （呼び出し側はnullを受け取ったらappendしないこと）。
export function buildSpeedProgressResultBlock(descriptor, achievementName) {
  if (!descriptor) return null;
  if (descriptor.status === "not-applicable" || descriptor.status === "no-data") return null;

  const wrapper = document.createElement("div");
  wrapper.className = "speed-progress-block";

  if (descriptor.status === "achieved") {
    wrapper.classList.add("is-achieved");
    const line = document.createElement("p");
    line.className = "speed-progress-line";
    line.textContent = `⚡ ${achievementName} 条件達成！`;
    wrapper.appendChild(line);
    return wrapper;
  }

  if (descriptor.status === "needs-clean-clear") {
    wrapper.classList.add("is-blocked");
    if (descriptor.speedConditionMet) {
      const speedLine = document.createElement("p");
      speedLine.className = "speed-progress-line";
      speedLine.textContent = "⚡ 速度条件クリア";
      wrapper.appendChild(speedLine);
    }
    const sub = document.createElement("p");
    sub.className = "speed-progress-sub";
    sub.textContent = "ノーミスクリアが必要です";
    wrapper.appendChild(sub);
    return wrapper;
  }

  // status === "progress"
  wrapper.classList.add("is-progress");
  const line = document.createElement("p");
  line.className = "speed-progress-line";
  line.textContent = `⚡ ${achievementName}まで`;
  wrapper.appendChild(line);
  const sub = document.createElement("p");
  sub.className = "speed-progress-sub";
  sub.textContent = `あと${descriptor.secondsRemaining}秒`;
  wrapper.appendChild(sub);
  return wrapper;
}

// 称号一覧カード用：これまでの最速記録をもとにした進捗ブロックを組み立てる。
export function buildSpeedProgressBestBlock(bestProgress, isUnlocked) {
  const wrapper = document.createElement("div");
  wrapper.className = "speed-progress-block speed-progress-block--best";
  if (isUnlocked) wrapper.classList.add("is-achieved");

  if (!bestProgress.hasQualifyingPlay) {
    const sub = document.createElement("p");
    sub.className = "speed-progress-sub";
    sub.textContent = isUnlocked ? "✓ 獲得済み" : "まずは全曲ノーミスを達成しよう";
    wrapper.appendChild(sub);
    return wrapper;
  }

  const label = document.createElement("p");
  label.className = "speed-progress-label";
  label.textContent = "ベスト平均タイム";
  wrapper.appendChild(label);

  const value = document.createElement("p");
  value.className = "speed-progress-line";
  value.textContent = formatResponseSeconds(bestProgress.bestAverageResponseMs);
  wrapper.appendChild(value);

  const sub = document.createElement("p");
  sub.className = "speed-progress-sub";
  if (isUnlocked) {
    sub.textContent = "✓ 獲得済み";
  } else if (bestProgress.bestAverageResponseMs <= bestProgress.thresholdMs) {
    sub.textContent = "条件達成！";
  } else {
    sub.textContent = `あと${formatSecondsUntilThreshold(bestProgress.bestAverageResponseMs, bestProgress.thresholdMs)}秒`;
  }
  wrapper.appendChild(sub);

  return wrapper;
}
