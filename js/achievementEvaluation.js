// 称号（実績）の判定ロジックを担当する、DOM・localStorageに一切触れない純粋関数群。
// 各モード（イントロクイズ・タイムアタック・ランダム再生クイズ・歌詞クイズ）は、
// プレイ終了時に共通形式の結果（normalizeQuizClearResult()の引数）を渡すだけでよく、
// 称号ごとの条件をモード側に直接書く必要はない（js/achievementProgress.jsが
// このファイルの関数を呼び出し、保存・イベント生成までを担当する）。
//
// 「回答に要した時間」の定義：画面遷移・結果画面の滞在時間・音源読み込み待ちを含まない、
// 純粋に「問題が表示されてから回答を確定するまで」の時間（各モードの既存のelapsedMs計測を
// そのまま使う。このファイルはミリ秒の値を受け取るだけで、計測方法自体は変更しない）。

const SPEED_THRESHOLD_MS = 1700; // 電光石火・メロディアスの、平均回答時間のしきい値

// ノーミス段階称号の並び（数字が大きいほど上位）。上位を達成したら、この配列の
// 手前側（下位）もすべて同時に取得する（本人指示のカスケード仕様）。
const NO_MISS_TIER_ORDER = ["5", "10", "20", "50", "all"];
const NO_MISS_TIER_ID_BY_VALUE = {
  5: "no_miss_bronze",
  10: "no_miss_silver",
  20: "no_miss_gold",
  50: "no_miss_platinum",
  all: "no_miss_master",
};

// モードごとにバラバラな結果の形を、称号判定に必要な項目だけを持つ共通形式へ変換する。
// isAllSongsMode：questionCountValueが"all"かどうかだけで判定する（既存の各モードの
// 「全曲」の意味＝その時点のカテゴリ絞り込み後の曲プール全体、と統一するため。
// 固定の曲数をハードコードしない、という指示に沿う）。
export function normalizeQuizClearResult({
  modeId,
  questionCountValue,
  correctCount,
  wrongCount,
  skippedCount,
  completed = true,
  averageResponseMs = null,
  maxHintLevelByQuestion = null,
}) {
  const totalQuestions = correctCount + wrongCount + skippedCount;
  return {
    modeId,
    questionCountValue,
    isAllSongsMode: questionCountValue === "all",
    totalQuestions,
    correctCount,
    wrongCount,
    skippedCount,
    completed,
    averageResponseMs,
    maxHintLevelByQuestion: Array.isArray(maxHintLevelByQuestion) ? maxHintLevelByQuestion : null,
  };
}

// 「全問正解・誤答なし・未回答（スキップ）なし」の、称号判定で繰り返し使う共通条件。
// completed（LOVE連チャン等、途中で終了していないか）もあわせて確認する。
export function isCleanClear(result) {
  return (
    result.completed !== false &&
    result.totalQuestions > 0 &&
    result.correctCount === result.totalQuestions &&
    result.wrongCount === 0 &&
    result.skippedCount === 0
  );
}

function isFastEnough(result) {
  return result.averageResponseMs !== null && result.averageResponseMs <= SPEED_THRESHOLD_MS;
}

// ノーミス段階称号（ブロンズ〜ノーミスマスター）。イントロクイズ・タイムアタックのみが対象。
// 5/10/20/50/all以外の出題数は対象外（判定なし）。
export function evaluateNoMissTierAchievements(result) {
  if (result.modeId !== "intro" && result.modeId !== "timeAttack") return [];
  if (!isCleanClear(result)) return [];

  const tierIndex = NO_MISS_TIER_ORDER.indexOf(result.questionCountValue);
  if (tierIndex === -1) return [];

  // 達成した段階以下（下位）を、配列の並び順（ブロンズ→…→ノーミスマスター）ですべて返す。
  return NO_MISS_TIER_ORDER.slice(0, tierIndex + 1).map((value) => NO_MISS_TIER_ID_BY_VALUE[value]);
}

// 表マスター2種：フルコーラスマスター（ランダム再生クイズ）・歌マスター（歌詞クイズ）。
// どちらも全曲モード・ノーミスのみが条件で、時間・ヒント数は問わない。
export function evaluateModeMasterAchievements(result) {
  if (!isCleanClear(result) || !result.isAllSongsMode) return [];
  if (result.modeId === "randomPlayback") return ["full_chorus_master"];
  if (result.modeId === "lyricsQuiz") return ["song_master"];
  return [];
}

// 裏称号のうち、平均回答時間が条件に入る2種：電光石火（イントロ/タイムアタック）・
// メロディアス（ランダム再生クイズ）。どちらも全曲モード・ノーミス・1.7秒以内が条件。
export function evaluateSpeedAchievements(result) {
  if (!isCleanClear(result) || !result.isAllSongsMode || !isFastEnough(result)) return [];

  if (result.modeId === "intro" || result.modeId === "timeAttack") return ["lightning_fast"];
  if (result.modeId === "randomPlayback") return ["melody_ace"];
  return [];
}

// 裏称号のうち、ヒント使用状況が条件に入る1種：リリックマスター（歌詞クイズ）。
// 全曲モード・ノーミスに加えて、全問「その問題で到達した最大ヒント段階」が1であることが条件。
// （表示中のヒントをヒント1へ戻しても、到達済みの最大段階は変わらないため誤魔化せない。
//   js/lyricsQuizRunState.js・js/lyricsQuizScreen.jsのhintsUsedCount＝到達最大段階の仕様に準拠）
export function evaluateHintAchievements(result) {
  if (result.modeId !== "lyricsQuiz") return [];
  if (!isCleanClear(result) || !result.isAllSongsMode) return [];
  if (!Array.isArray(result.maxHintLevelByQuestion) || result.maxHintLevelByQuestion.length === 0) return [];

  const allFirstHintOnly = result.maxHintLevelByQuestion.every((level) => level === 1);
  return allFirstHintOnly ? ["lyric_master"] : [];
}

// 複合称号（＝LOVEマスター・＝LOVE完全制覇）。単発のプレイ結果だけでは判定できず、
// 「これまでに解放済みの称号id集合」を横断して判定する。
// js/achievementDefinitions.jsのcompositeOfをそのまま使い、称号ごとの必要idをここに
// ベタ書きしない（将来、複合称号が増えても定義ファイル側の追記だけで対応できるようにするため）。
export function evaluateCompositeAchievements(unlockedIdSet, achievementDefinitions) {
  const earned = [];
  achievementDefinitions.forEach((achievement) => {
    if (!achievement.compositeOf) return;
    if (unlockedIdSet.has(achievement.id)) return; // すでに達成済みなら再判定不要
    const allRequirementsMet = achievement.compositeOf.every((requiredId) => unlockedIdSet.has(requiredId));
    if (allRequirementsMet) earned.push(achievement.id);
  });
  return earned;
}

// 1回のプレイ結果から、達成した（新規・既存を問わない）称号idを全部まとめて返す。
// 複合称号はここでは判定しない（js/achievementProgress.js側で、保存後の最新の
// 解放済みid集合を使って別途判定する）。
export function evaluateDirectAchievements(result) {
  return [
    ...evaluateNoMissTierAchievements(result),
    ...evaluateModeMasterAchievements(result),
    ...evaluateSpeedAchievements(result),
    ...evaluateHintAchievements(result),
  ];
}
