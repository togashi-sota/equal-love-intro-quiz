// 称号（実績）の保存・読み込み・イベント生成を担当するファイル。
// localStorageへの読み書きは必ずこのファイルを経由し、他のファイル（結果画面・一覧モーダル）が
// 直接localStorageを触ることはない（js/titleProgress.js時代と同じ方針）。
//
// 保存形式（本人指定のスキーマ）：
//   {
//     schemaVersion: 2,
//     unlockedAchievementIds: ["no_miss_bronze", ...],
//     unlockedAtById: { "no_miss_bronze": "2026-08-07T12:34:56.789Z", ... },
//   }
// 1つのJSON文字列としてlocalStorageに保存する（旧titleProgress.jsのように称号ごとに
// 別々のキーへ分けない）。表示名の変更・条件文の変更がこのファイルの保存内容に
// 一切影響しないよう、保存するのは「id」と「解放日時」だけにしている。
import { ACHIEVEMENTS, getAchievementById } from "./achievementDefinitions.js";
import {
  normalizeQuizClearResult,
  evaluateDirectAchievements,
  evaluateCompositeAchievements,
} from "./achievementEvaluation.js";
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { scheduleBackupSync } from "./backupSync.js";

const SCHEMA_VERSION = 2;

function buildStorageKey() {
  return `equalLoveIntroQuiz.${getPlayerKeyPrefix()}achievements`;
}

function defaultProgress() {
  return { schemaVersion: SCHEMA_VERSION, unlockedAchievementIds: [], unlockedAtById: {} };
}

// 保存データを読み込む。存在しない・壊れている（JSONとして読めない、想定外の形）場合は、
// 安全に初期状態へフォールバックする（本人指示：「壊れた保存データから安全に復旧」）。
function loadProgress() {
  try {
    const raw = localStorage.getItem(buildStorageKey());
    if (!raw) return defaultProgress();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaultProgress();
    return {
      schemaVersion: SCHEMA_VERSION,
      unlockedAchievementIds: Array.isArray(parsed.unlockedAchievementIds)
        ? parsed.unlockedAchievementIds.filter((id) => typeof id === "string")
        : [],
      unlockedAtById:
        parsed.unlockedAtById && typeof parsed.unlockedAtById === "object" && !Array.isArray(parsed.unlockedAtById)
          ? { ...parsed.unlockedAtById }
          : {},
    };
  } catch {
    return defaultProgress();
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(buildStorageKey(), JSON.stringify(progress));
    // 称号の取得状況が変わったので、クラウドバックアップも更新する（2026-08-29追加、
    // js/backupSync.js参照）。数秒デバウンスされるため、ここで毎回呼んでも問題ない。
    scheduleBackupSync();
  } catch {
    // プライベートブラウジング等でlocalStorageが使えない環境でも、アプリ自体は動き続けられるようにする
  }
}

// 達成済みid配列を、新しく達成したidで安全にマージする（純粋関数：progressそのものは書き換えず、
// 新しいオブジェクトを返す）。すでに達成済みのidは二重登録しない・解放日時も上書きしない
// （本人指示：「取得日を最初の1回だけ保存」）。
// nowIsoを引数で受け取れるようにしているのは、恒久テストで時刻を固定できるようにするため。
export function mergeAchievementProgress(storedProgress, earnedIds, nowIso = new Date().toISOString()) {
  const unlockedSet = new Set(storedProgress.unlockedAchievementIds);
  const unlockedAtById = { ...storedProgress.unlockedAtById };
  const newlyUnlockedThisTime = [];

  earnedIds.forEach((id) => {
    if (unlockedSet.has(id)) return;
    unlockedSet.add(id);
    unlockedAtById[id] = nowIso;
    newlyUnlockedThisTime.push(id);
  });

  return {
    progress: {
      schemaVersion: SCHEMA_VERSION,
      unlockedAchievementIds: [...unlockedSet],
      unlockedAtById,
    },
    newlyUnlockedThisTime,
  };
}

// ===== 旧称号（js/titleDefinitions.js時代）からの、読み取り専用の安全な引き継ぎ =====
// 旧システムはすでに削除済みだが、localStorageに残っている旧データ自体は消さない
// （本人指示：「旧称号データを勝手に消さない」）。ここでは旧データの意味を読み解き、
// 対応するノーミス段階称号の根拠として引き継ぐ。書き込みは新しいスキーマ（このファイルの
// buildStorageKey）へ行うだけで、旧データ自体（equalLoveIntroQuiz.titles.*）には一切触れない。
//
// 対応関係（本人確認済み）：
//   旧パーフェクト.{5|10|20|50}   → 対応する新ノーミス段階（カスケードあり）
//   旧＝LOVE皆伝（全曲パーフェクト） → ノーミスマスター（カスケードで下位もすべて）
// 旧イントロマスター・旧電光石火・旧ひらめきは、新体系のどの称号とも条件が正確には
// 一致しないため（イントロマスターは速度基準、電光石火は新版と対象範囲が異なる）、
// 移行の根拠には使わない＝旧データのまま保持するだけにとどめる（無理な対応付けをしない）。
const LEGACY_PERFECT_MODE_TO_TIER = {
  5: "5",
  10: "10",
  20: "20",
  50: "50",
};

function readLegacyFlag(key) {
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

// 旧データから、根拠のある新ノーミス段階称号id一覧を組み立てる（純粋な読み取りのみ）。
export function collectLegacyNoMissEquivalents() {
  const prefix = getPlayerKeyPrefix();
  const legacyBase = `equalLoveIntroQuiz.${prefix}titles`;
  const earnedValues = new Set();

  Object.entries(LEGACY_PERFECT_MODE_TO_TIER).forEach(([mode, tierValue]) => {
    if (readLegacyFlag(`${legacyBase}.perfect.${mode}`)) {
      earnedValues.add(tierValue);
    }
  });
  if (readLegacyFlag(`${legacyBase}.equalLoveKaiden`)) {
    earnedValues.add("all");
  }

  const tierOrder = ["5", "10", "20", "50", "all"];
  const tierIdByValue = {
    5: "no_miss_bronze",
    10: "no_miss_silver",
    20: "no_miss_gold",
    50: "no_miss_platinum",
    all: "no_miss_master",
  };

  // カスケード：達成した中で最も上位の段階までを、下位も含めてすべて対象にする。
  let highestIndex = -1;
  earnedValues.forEach((value) => {
    const index = tierOrder.indexOf(value);
    if (index > highestIndex) highestIndex = index;
  });
  if (highestIndex === -1) return [];
  return tierOrder.slice(0, highestIndex + 1).map((value) => tierIdByValue[value]);
}

// アプリ起動時に1回呼ぶ想定。旧データに根拠がある分だけ、静かに（お祝い演出なしで）
// 新しい保存データへ反映する。すでに反映済みなら何もしない、何度呼んでも安全な設計
// （mergeAchievementProgressが「すでに達成済みのidは二重登録しない」ため）。
export function syncLegacyAchievements() {
  const legacyIds = collectLegacyNoMissEquivalents();
  if (legacyIds.length === 0) return;
  const stored = loadProgress();
  const { progress } = mergeAchievementProgress(stored, legacyIds);
  saveProgress(progress);
}

// ===== プレイ結果からの判定・保存 =====

// 「達成した称号id一覧」を受け取り、保存・複合称号判定までまとめて行う共通処理
// （2026-08-30切り出し・本人指示）。evaluateAndSaveAchievements()（通常の各モード用）と
// 一瞬チャレンジ専用の評価（js/instantChallengeScreen.js、normalizeQuizClearResultの
// 共通形式に乗らない固有の判定のため）の両方から使う。複合称号（＝LOVEマスター・
// ＝LOVE完全制覇）も、保存後の最新の解放済みid集合を使ってこのタイミングであわせて判定する。
export function saveEarnedAchievements(earnedThisPlay) {
  const stored = loadProgress();
  const { progress: afterDirect, newlyUnlockedThisTime: newDirect } = mergeAchievementProgress(
    stored,
    earnedThisPlay
  );

  const compositeIds = evaluateCompositeAchievements(new Set(afterDirect.unlockedAchievementIds), ACHIEVEMENTS);
  const { progress: finalProgress, newlyUnlockedThisTime: newComposite } = mergeAchievementProgress(
    afterDirect,
    compositeIds
  );

  saveProgress(finalProgress);

  return {
    newlyUnlockedIds: [...newDirect, ...newComposite],
    progress: finalProgress,
  };
}

// 1回のプレイ結果（各モードが組み立てた共通形式の引数）を受け取り、
// 達成した称号を保存し、今回新しく解放された称号idの配列を返す（結果画面の演出に使う）。
export function evaluateAndSaveAchievements(rawResult) {
  const result = normalizeQuizClearResult(rawResult);
  const earnedThisPlay = evaluateDirectAchievements(result);
  return saveEarnedAchievements(earnedThisPlay);
}

// 称号一覧モーダル向けに、「今この瞬間の状態」のスナップショットを返す。読み取り専用。
export function getAchievementListSnapshot() {
  const stored = loadProgress();
  const unlockedSet = new Set(stored.unlockedAchievementIds);

  return ACHIEVEMENTS.map((achievement) => {
    const isUnlocked = unlockedSet.has(achievement.id);
    // 複合称号カードに「必要な称号の名前つきチェックリスト」を表示するための内訳。
    // achievedCount/requiredCountは数値サマリー用に残しつつ、items（本人指示・2026-08-07：
    // 「どの称号を集めれば最終称号になるのか」を名前入りで一目で分かるように）を追加した。
    const compositeProgress = achievement.compositeOf
      ? {
          achievedCount: achievement.compositeOf.filter((id) => unlockedSet.has(id)).length,
          requiredCount: achievement.compositeOf.length,
          items: achievement.compositeOf.map((id) => ({
            id,
            name: getAchievementById(id)?.name ?? id,
            isUnlocked: unlockedSet.has(id),
          })),
        }
      : null;

    return {
      id: achievement.id,
      name: achievement.name,
      category: achievement.category,
      iconKey: achievement.iconKey,
      conditionText: achievement.conditionText,
      challengeConditions: achievement.challengeConditions ?? null,
      rewardNote: achievement.rewardNote,
      isUnlocked,
      unlockedAt: isUnlocked ? (stored.unlockedAtById[achievement.id] ?? null) : null,
      compositeProgress,
    };
  });
}

// ノーミスマスター・＝LOVEマスター・＝LOVE完全制覇の取得状況だけを、推しアイコンの装飾判定用に返す。
// js/oshiBadge.jsが呼ぶ想定（このファイル自体はDOMに一切触れない）。
// 【2026-08-15追加】ノーミスマスターにも専用バッジを追加。すでに取得済みのユーザーは
// unlockedAchievementIdsに"no_miss_master"がすでに含まれているため、再取得の必要なく
// この関数を呼んだ瞬間から自動的にtrueになる（移行処理不要）。
export function getOshiBadgeState() {
  const stored = loadProgress();
  const unlockedSet = new Set(stored.unlockedAchievementIds);
  return {
    hasNoMissMaster: unlockedSet.has("no_miss_master"),
    hasEqualLoveMaster: unlockedSet.has("equal_love_master"),
    hasEqualLoveComplete: unlockedSet.has("equal_love_complete"),
  };
}
