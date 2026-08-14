// 結果画面での、称号（実績）獲得演出を担当するファイル。
// js/achievementProgress.jsのevaluateAndSaveAchievements()が返す「今回新しく解放されたid配列」
// を受け取り、「どう見せるか」だけに徹する（js/titleDisplay.js時代と同じ考え方）。
// イントロクイズ・タイムアタック・ランダム再生クイズ・歌詞クイズの4モードすべてから、
// 同じこのファイルを呼び出す（演出をモードごとに複製しない）。
import { getAchievementById } from "./achievementDefinitions.js";
import { buildAchievementIconMedal } from "./achievementIcons.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

// 1件のチップのCSSアニメーションが万が一発火しなかった場合の保険時間（ミリ秒）。
const ANIMATION_FALLBACK_MS = 1500;
// チップの「登場演出」に使うCSSアニメーションの名前（animation-nameと一致させる）。
const ENTRANCE_ANIMATION_NAME = "achievement-event-enter";
// ＝LOVEマスター・＝LOVE完全制覇は、通常より長く見せる（豪華な演出のため）。
const COMPOSITE_ANIMATION_FALLBACK_MS = 2600;

let queue = [];
let currentContainer = null;
let onQueueDrained = null;
let activeChip = null;
let fallbackTimeoutId = null;

function handleChipAnimationEnd(event) {
  if (event.target !== activeChip) return;
  if (event.animationName !== ENTRANCE_ANIMATION_NAME) return;
  advanceQueue();
}

function resetAnimationState() {
  queue = [];
  currentContainer = null;
  onQueueDrained = null;

  if (fallbackTimeoutId !== null) {
    clearTimeout(fallbackTimeoutId);
    fallbackTimeoutId = null;
  }
  if (activeChip !== null) {
    activeChip.removeEventListener("animationend", handleChipAnimationEnd);
    activeChip = null;
  }
}

function buildAchievementChip(achievement) {
  // 【2026-08-14改訂】「複合称号かどうか」の判定を、表示カテゴリー名（category、今回の
  // 17称号再編でmasterPath/backChallengeへ変わった）ではなくcompositeOfの有無に切り替えた
  // （js/achievementList.jsのbuildAchievementCard()と同じ理由・同じ修正）。
  const isComposite = Boolean(achievement.compositeOf);
  const chip = document.createElement("div");
  chip.classList.add("achievement-event", isComposite ? "achievement-event--composite" : "achievement-event--normal");
  chip.dataset.achievementId = achievement.id;

  chip.appendChild(buildAchievementIconMedal(achievement.iconKey));

  const badge = document.createElement("span");
  badge.classList.add("achievement-event-badge");
  badge.textContent = "NEW";
  chip.appendChild(badge);

  const name = document.createElement("span");
  name.classList.add("achievement-event-name");
  name.textContent = achievement.name;
  chip.appendChild(name);

  const caption = document.createElement("span");
  caption.classList.add("achievement-event-caption");
  caption.textContent = "新しい称号を獲得！";
  chip.appendChild(caption);

  const condition = document.createElement("span");
  condition.classList.add("achievement-event-condition");
  condition.textContent = achievement.conditionText;
  chip.appendChild(condition);

  // 複合称号（＝LOVEマスター・＝LOVE完全制覇）だけが持つ、特典・推しアイコン変化の予告
  // （本人指示：「景品があります」「アイコン変わります」を見やすい場所に表示）。
  if (achievement.rewardNote) {
    const reward = document.createElement("span");
    reward.classList.add("achievement-event-reward");
    reward.textContent = achievement.rewardNote;
    chip.appendChild(reward);
  }

  return chip;
}

function advanceQueue() {
  if (fallbackTimeoutId !== null) {
    clearTimeout(fallbackTimeoutId);
    fallbackTimeoutId = null;
  }
  if (activeChip !== null) {
    activeChip.removeEventListener("animationend", handleChipAnimationEnd);
    activeChip = null;
  }

  const nextAchievement = queue.shift();
  if (!nextAchievement) {
    onQueueDrained?.();
    return;
  }

  const chip = buildAchievementChip(nextAchievement);
  currentContainer.appendChild(chip);

  activeChip = chip;
  activeChip.addEventListener("animationend", handleChipAnimationEnd);
  const fallbackMs = nextAchievement.compositeOf ? COMPOSITE_ANIMATION_FALLBACK_MS : ANIMATION_FALLBACK_MS;
  fallbackTimeoutId = setTimeout(advanceQueue, fallbackMs);
}

// 結果画面に、今回新しく解放された称号を演出付きで表示する。
//
// newlyUnlockedIds: js/achievementProgress.jsのevaluateAndSaveAchievements()が返す配列。
// elements: { chipContainer: 称号チップを並べる入れ物,
//             achievementListLinkElement: 「称号一覧を見る」リンク }
//
// 複数同時解放（例：全曲ノーミス達成でブロンズ〜ノーミスマスターが一括解放）にも対応し、
// 配列の順番どおりに1件ずつ演出する。＝LOVEマスター・＝LOVE完全制覇は
// achievement-event--compositeクラスにより、CSS側でより豪華な演出になる。
export function renderAchievementUnlockEvents(newlyUnlockedIds, elements) {
  const { chipContainer, achievementListLinkElement } = elements;

  resetAnimationState();
  chipContainer.innerHTML = "";

  const achievements = newlyUnlockedIds.map((id) => getAchievementById(id)).filter(Boolean);

  if (achievements.length === 0) {
    achievementListLinkElement.hidden = false;
    return;
  }

  achievementListLinkElement.hidden = true;
  // 複数同時解放でも、鳴らすのは1回だけ（本人指示：鳴らしすぎない）。
  playSfx(SFX_EVENTS.ACHIEVEMENT_UNLOCK);

  queue = [...achievements];
  currentContainer = chipContainer;
  onQueueDrained = () => {
    achievementListLinkElement.hidden = false;
  };

  advanceQueue();
}

// 称号を扱わない結果表示（復習モード等）のときに呼ぶ。
export function clearAchievementUnlockEvents({ chipContainer, achievementListLinkElement }) {
  resetAnimationState();
  chipContainer.innerHTML = "";
  achievementListLinkElement.hidden = true;
}
