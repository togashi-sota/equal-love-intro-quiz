// 称号（実績）の判定ロジックを担当する、DOM・localStorageに一切触れない純粋関数群。
// 各モード（イントロクイズ・タイムアタック・ランダム再生クイズ・歌詞クイズ）は、
// プレイ終了時に共通形式の結果（normalizeQuizClearResult()の引数）を渡すだけでよく、
// 称号ごとの条件をモード側に直接書く必要はない（js/achievementProgress.jsが
// このファイルの関数を呼び出し、保存・イベント生成までを担当する）。
//
// 「回答に要した時間」の定義：画面遷移・結果画面の滞在時間・音源読み込み待ちを含まない、
// 純粋に「問題が表示されてから回答を確定するまで」の時間（各モードの既存のelapsedMs計測を
// そのまま使う。このファイルはミリ秒の値を受け取るだけで、計測方法自体は変更しない）。

// 電光石火・メロディアスの、平均回答時間のしきい値。
// 【2026-08-08追加】UI側（結果画面・プレイ履歴・称号一覧の「あと○秒」表示）も
// 必ずこの値をimportして使うこと。UI側に1700/1.7をベタ書きすると、将来この値を
// 変更したときに表示と判定がずれてしまう（本人指示）。
export const SPEED_THRESHOLD_MS = 1700;

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
  answerPoolSizeValue = null,
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
    // 歌詞クイズだけが持つ「回答候補の難易度」軸（4/10/30/50/all）。他モードはnullのまま。
    // 【2026-08-13追加・本人指示】歌マスター・リリックマスターは、全曲モードに加えて
    // 「回答候補も最も難しいall（全曲から探す）」設定であることを必須条件にするため保持する。
    answerPoolSizeValue,
  };
}

// 歌詞クイズの回答候補設定のうち、称号（歌マスター・リリックマスター）が要求する
// 「最も難しい設定」。ANSWER_POOL_SIZE_VALUES（js/lyricsQuizEngine.js）の最終値と同じ文字列を
// あえて複製している（この判定ファイルが歌詞クイズ専用ファイルに依存しない設計を保つため）。
const LYRICS_QUIZ_HARDEST_ANSWER_POOL_SIZE_VALUE = "all";

function isHardestLyricsQuizAnswerPool(result) {
  return result.answerPoolSizeValue === LYRICS_QUIZ_HARDEST_ANSWER_POOL_SIZE_VALUE;
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

// 成長段階系（イントロ/シャッフル/リリックの3系統×ビギナー(5)/チャレンジャー(10)/エース(20)）。
// 【2026-08-13追加・本人指示】既存の最上位称号とは別に、初心者〜中級者向けの自然な
// 成長ステップとして用意する。カテゴリー・回答方式は問わない（isCleanClear()が
// questionCountValue・correctCount・wrongCount・skippedCount・completedしか見ないため）。
// イントロ系・シャッフル系は、それぞれ「単体クイズ」と「タイムアタックのその出題タイプ」の
// 両方のmodeIdを対象にする（js/timeAttackScreen.js・js/randomPlaybackScreen.jsの実際のmodeId
// 文字列に合わせている。イントロクイズ側のmodeMasterに相当する概念が無いのは、フルコーラス
// マスター・歌マスターと違って「単体全曲モード」の称号ではなく5/10/20の段階制のため）。
const GROWTH_TIER_ORDER = ["5", "10", "20"];
const GROWTH_MODE_GROUP_BY_MODE_ID = {
  intro: "intro",
  timeAttack: "intro",
  randomPlayback: "shuffle",
  timeAttackRandomPlayback: "shuffle",
  lyricsQuiz: "lyric",
};
const GROWTH_TIER_IDS_BY_GROUP = {
  intro: { 5: "intro_beginner", 10: "intro_challenger", 20: "intro_ace" },
  shuffle: { 5: "shuffle_beginner", 10: "shuffle_challenger", 20: "shuffle_ace" },
  lyric: { 5: "lyric_beginner", 10: "lyric_challenger", 20: "lyric_ace" },
};

export function evaluateGrowthTierAchievements(result) {
  const group = GROWTH_MODE_GROUP_BY_MODE_ID[result.modeId];
  if (!group) return [];
  if (!isCleanClear(result)) return [];

  const tierIndex = GROWTH_TIER_ORDER.indexOf(result.questionCountValue);
  if (tierIndex === -1) return [];

  // ノーミス段階称号と同じカスケード仕様：達成した段階以下もまとめて返す
  // （20問ノーミスなら、その系統のビギナー・チャレンジャー・エースを同時に獲得する）。
  return GROWTH_TIER_ORDER.slice(0, tierIndex + 1).map((value) => GROWTH_TIER_IDS_BY_GROUP[group][value]);
}

// 表マスター2種：フルコーラスマスター（ランダム再生クイズ）・歌マスター（歌詞クイズ）。
// フルコーラスマスターは全曲モード・ノーミスのみが条件（時間は問わない）。
// 歌マスターは全曲モード・ノーミスに加えて、回答候補も最も難しいall（全曲から探す）設定を
// 使っていることが条件（本人指示・2026-08-13：回答方式に難易度軸があるなら最難関を必須にする）。
export function evaluateModeMasterAchievements(result) {
  if (!isCleanClear(result) || !result.isAllSongsMode) return [];
  if (result.modeId === "randomPlayback") return ["full_chorus_master"];
  if (result.modeId === "lyricsQuiz" && isHardestLyricsQuizAnswerPool(result)) return ["song_master"];
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
  // 【2026-08-13追加・本人指示】表マスター（歌マスター）と同じ理由で、回答候補も
  // 最も難しいall（全曲から探す）設定であることを必須にする。
  if (!isHardestLyricsQuizAnswerPool(result)) return [];
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
    ...evaluateGrowthTierAchievements(result),
    ...evaluateNoMissTierAchievements(result),
    ...evaluateModeMasterAchievements(result),
    ...evaluateSpeedAchievements(result),
    ...evaluateHintAchievements(result),
  ];
}
