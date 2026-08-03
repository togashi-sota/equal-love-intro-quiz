// 称号（実績）の判定・保存・結果画面向けイベント生成を担当するファイル。
// highscore.jsが「ハイスコアという1種類の記録」だけを扱うのに対し、こちらは
// 「5つの称号の進捗」をまとめて扱う。localStorageへの読み書きは必ずこのファイルを経由し、
// 他のファイル（結果画面の描画・称号一覧モーダル）が直接localStorageを触ることはない。
//
// 判定の流れは、次の4段階にはっきり分けている。
//   ①全称号の達成判定 → ②解放状態の判定 → ③保存データ更新 → ④イベント生成
//
// ②の解放状態の判定は、「プレイ開始前の保存データ」と「①で判明した、今回のプレイで
// 達成された称号の集合」の両方を組み合わせて行う。片方だけでは足りない。
// 例えば初めてのプレイで、パーフェクト・イントロマスターの条件を同時に満たした場合、
// 開始前の保存データだけを見ると「パーフェクトはまだ一度も達成されていない」ため、
// イントロマスターは解放されない、と誤って判定してしまう。実際には今回のプレイの中で
// パーフェクトも同時に達成しているので、イントロマスターも同じ結果画面の中で
// 「解放＆獲得」として見せたい。そのため、解放元の称号が「開始前にすでに達成済みだったか」
// 「今回のプレイで新たに達成されたか」のどちらかを満たせば解放とみなす、という判定にする。

import { TITLES } from "./titleDefinitions.js";
// 【2026-08-03追加】複数プレイヤー対応（HANDOFF 10-29章）：getPlayerKeyPrefix()が、
// デフォルトプレイヤーのときは空文字列を返すため、既存のキー名は変わらない。
// 2人目以降のプレイヤーのときだけプレイヤーごとに別々の称号進捗として保存される。
import { getPlayerKeyPrefix } from "./playerProfile.js";

function buildTitleKeyPrefix() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}titles`;
}

// perMode称号（出題数ごとに進捗を持つ称号）が対象にする、出題数の値の一覧。
// index.htmlのラジオボタンの値・highscore.jsのキーと同じ文字列を使う。
const QUESTION_COUNT_VALUES = ["5", "10", "20", "50", "all"];

function buildPerModeKey(titleId, mode) {
  return `${buildTitleKeyPrefix()}.${titleId}.${mode}`;
}

function buildSingleKey(titleId) {
  return `${buildTitleKeyPrefix()}.${titleId}`;
}

// 保存済みの称号進捗を、判定処理で扱いやすい形（称号IDをキーにしたオブジェクト）に整理して読み込む。
// 例: { perMode: { perfect: { "5": true, "10": false, ... }, ... }, single: { inspiration: false, ... } }
// この関数が返すオブジェクトは、以降どこでも書き換えない「プレイ開始前のスナップショット」として扱う。
function loadStoredProgress() {
  const perMode = {};
  const single = {};

  TITLES.forEach((title) => {
    if (title.storageScope === "perMode") {
      perMode[title.id] = {};
      QUESTION_COUNT_VALUES.forEach((mode) => {
        perMode[title.id][mode] = localStorage.getItem(buildPerModeKey(title.id, mode)) === "true";
      });
    } else {
      single[title.id] = localStorage.getItem(buildSingleKey(title.id)) === "true";
    }
  });

  return { perMode, single };
}

// 称号1件が、渡されたprogress状態で「一度でも達成されているか」を返す。
// perMode称号は、いずれかの出題数で達成済みならtrue。
function isEverAchieved(title, progress) {
  if (title.storageScope === "single") {
    return progress.single[title.id] === true;
  }
  return Object.values(progress.perMode[title.id]).some(Boolean);
}

// 称号1件が、渡されたprogress状態の時点で解放済みかどうかを返す。
// evaluateAndSaveTitles内では「プレイ開始前の状態」を渡して使うが、
// 中身は「特定時点のprogressで解放されているか」を判定するだけの汎用処理なので、
// getTitleListSnapshot（称号一覧モーダル向け、プレイとは無関係に「今の状態」を知りたいとき）
// でも同じ関数をそのまま使い回している。
function wasUnlockedBeforePlay(title, storedProgress) {
  if (title.unlockedBy === "always") return true;
  if (title.unlockedBy === "self") return isEverAchieved(title, storedProgress);

  const prerequisite = TITLES.find((t) => t.id === title.unlockedBy);
  return isEverAchieved(prerequisite, storedProgress);
}

// 称号1件が、今回のプレイ結果まで踏まえたうえで解放されているかを返す。
// 解放元（unlockedByが指す称号、またはself＝自分自身）が、
// 「プレイ開始前にすでに達成済みだったか」「今回のプレイで新たに達成されたか」の
// どちらかを満たせば解放とみなす。earnedTitleIdsは①で判定済みの、今回達成した称号id集合。
function isUnlockedAfterPlay(title, storedProgress, earnedTitleIds) {
  if (title.unlockedBy === "always") return true;
  if (title.unlockedBy === "self") {
    return isEverAchieved(title, storedProgress) || earnedTitleIds.has(title.id);
  }

  const prerequisite = TITLES.find((t) => t.id === title.unlockedBy);
  return isEverAchieved(prerequisite, storedProgress) || earnedTitleIds.has(prerequisite.id);
}

// gameStateから、称号の判定に必要な情報だけを取り出した「playResult」を組み立てる。
// answerLogの中で参照するのは resultType と elapsedMs のみ（song・pointsEarnedは使わない）。
export function buildPlayResult(gameState) {
  const totalQuestions = gameState.questions.length;
  const correctEntries = gameState.answerLog.filter((entry) => entry.resultType === "correct");
  const correctCount = correctEntries.length;

  // elapsedMsは、音源の再生に失敗した等の理由でnullになることがある（state.js参照）。
  // 平均回答時間・ひらめき判定は、実際に時間を計測できた正解だけを対象にする。
  const timedCorrectEntries = correctEntries.filter((entry) => entry.elapsedMs !== null);
  const averageCorrectElapsedMs =
    timedCorrectEntries.length > 0
      ? timedCorrectEntries.reduce((sum, entry) => sum + entry.elapsedMs, 0) / timedCorrectEntries.length
      : null;
  const hasSubSecondCorrectAnswer = timedCorrectEntries.some((entry) => entry.elapsedMs < 1000);

  return {
    mode: gameState.questionCountValue,
    totalQuestions,
    correctCount,
    averageCorrectElapsedMs,
    hasSubSecondCorrectAnswer,
  };
}

// ①全称号の達成判定：今回のplayResultで条件を満たした称号だけを抜き出す。
function judgeAllTitles(playResult) {
  return TITLES.filter((title) => title.judge(playResult));
}

// ②解放状態の判定：達成した称号それぞれについて、判定に必要な状態をすべて計算して保持する。
//   wasUnlocked              : プレイ開始前に解放済みだったか
//   isUnlockedAfterPlay      : 今回のプレイ結果まで踏まえたうえで解放されているか
//   wasAchievedForCurrentMode: 今回の出題数（またはsingle）が、プレイ開始前にすでに達成済みだったか
//   isAchievedThisPlay       : 今回のプレイで達成したか（earnedTitlesの時点で常にtrueだが、明示的に持たせる）
//   isNewProgress            : 今回、このモード/フラグが初めて埋まったか（!wasAchievedForCurrentMode）
//   isUnlockedThisPlay       : 今回のプレイで新たに解放されたか（isUnlockedAfterPlay && !wasUnlocked）
function buildTitleStatuses(earnedTitles, storedProgress, mode) {
  const earnedTitleIds = new Set(earnedTitles.map((title) => title.id));

  return earnedTitles.map((title) => {
    const wasUnlocked = wasUnlockedBeforePlay(title, storedProgress);
    const unlockedAfterPlay = isUnlockedAfterPlay(title, storedProgress, earnedTitleIds);
    const wasAchievedForCurrentMode =
      title.storageScope === "single"
        ? storedProgress.single[title.id] === true
        : storedProgress.perMode[title.id][mode] === true;

    return {
      title,
      wasUnlocked,
      isUnlockedAfterPlay: unlockedAfterPlay,
      wasAchievedForCurrentMode,
      isAchievedThisPlay: true,
      isNewProgress: !wasAchievedForCurrentMode,
      isUnlockedThisPlay: unlockedAfterPlay && !wasUnlocked,
    };
  });
}

// ③保存データ更新：達成した称号を保存する（すでに達成済みでも同じ値を書き直すだけなので害はない）。
function saveTitleStatuses(statuses, mode) {
  statuses.forEach(({ title }) => {
    if (title.storageScope === "single") {
      localStorage.setItem(buildSingleKey(title.id), "true");
    } else {
      localStorage.setItem(buildPerModeKey(title.id, mode), "true");
    }
  });
}

// ④イベント生成：titleDisplay.jsがそのまま演出に使える形に変換する。
// axis・priorityによる間引きはここでは行わない。同じ軸の称号が同時に成立した場合でも、
// 達成した称号はすべてイベントとして返し、結果画面ではその全部を順番に演出する。
//
// titleDisplay.jsが状態を自分で判断しなくて済むよう、②で計算した6つの状態
// （wasUnlocked／isUnlockedAfterPlay／wasAchievedForCurrentMode／isAchievedThisPlay／
// isNewProgress／isUnlockedThisPlay）はすべてそのまま持たせる。typeはその6つの状態から
// 導ける要約値（どの演出パターンを使うか）として、判断の手間を減らすために添えている。
function buildEvents(statuses, mode) {
  return statuses.map((status) => {
    const type = status.wasAchievedForCurrentMode
      ? "repeat"
      : status.isUnlockedThisPlay
        ? "unlock-and-new"
        : "new";

    return {
      id: status.title.id,
      name: status.title.name,
      type, // "unlock-and-new" | "new" | "repeat"
      mode: status.title.storageScope === "perMode" ? mode : null,
      wasUnlocked: status.wasUnlocked,
      isUnlockedAfterPlay: status.isUnlockedAfterPlay,
      wasAchievedForCurrentMode: status.wasAchievedForCurrentMode,
      isAchievedThisPlay: status.isAchievedThisPlay,
      isNewProgress: status.isNewProgress,
      isUnlockedThisPlay: status.isUnlockedThisPlay,
    };
  });
}

// 今回のプレイ結果を5つの称号すべてに判定し、達成した分は保存を更新したうえで、
// 結果画面に表示すべき称号イベントの一覧を返す。
export function evaluateAndSaveTitles(playResult) {
  const storedProgress = loadStoredProgress(); // ここで読み込んだ後、書き換えない
  const earnedTitles = judgeAllTitles(playResult); // ①
  const statuses = buildTitleStatuses(earnedTitles, storedProgress, playResult.mode); // ②
  saveTitleStatuses(statuses, playResult.mode); // ③
  return buildEvents(statuses, playResult.mode); // ④
}

// 称号一覧モーダル向けに、「今この瞬間の状態」のスナップショットを返す。
// evaluateAndSaveTitlesとは違い、新しいプレイ結果を必要とせず、保存内容を書き換えることもない
// 読み取り専用の関数。titleList.jsはこの戻り値をそのまま描画に使えばよく、
// 称号定義（titleDefinitions.js）や保存の仕組み（このファイルの内部関数）を直接見に行く必要はない。
//
// 戻り値は称号ごとに次の形の配列。
//   {
//     id, name,                 // 表示に使う識別子・名前
//     isUnlocked: boolean,      // 称号一覧で名前・条件を公開してよいか
//     lockedHint: string|null,  // ロック中に表示するヒント文(unlockedByが"always"の称号はnull)
//     conditionText: string,    // 解放後に表示する獲得条件の説明文
//     storageScope: "perMode" | "single",
//     achievedModes: { "5": boolean, ... } | null, // perMode称号のみ。ロック中はnull
//     isAchieved: boolean | null,                  // single称号のみ。ロック中はnull
//   }
export function getTitleListSnapshot() {
  const storedProgress = loadStoredProgress();

  return TITLES.map((title) => {
    const isTitleUnlocked = wasUnlockedBeforePlay(title, storedProgress);

    return {
      id: title.id,
      name: title.name,
      isUnlocked: isTitleUnlocked,
      lockedHint: title.lockedHint,
      conditionText: title.conditionText,
      storageScope: title.storageScope,
      achievedModes:
        isTitleUnlocked && title.storageScope === "perMode"
          ? { ...storedProgress.perMode[title.id] }
          : null,
      isAchieved:
        isTitleUnlocked && title.storageScope === "single"
          ? storedProgress.single[title.id]
          : null,
    };
  });
}
