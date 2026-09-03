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
// 【2026-11-XX改訂・本人指示27：推しアイコンに特別バッジが付く3称号の獲得演出を、
// イントロマスター＜＝LOVEマスター＜＜＝LOVE完全制覇の順で段階的に豪華にする】
// 以前は「複合称号（＝LOVEマスター・＝LOVE完全制覇）かどうか」の2段階だけだったが、
// イントロマスターも特別バッジ対象になったため3段階へ拡張した。長すぎてテンポを
// 壊さないよう、最上位の＝LOVE完全制覇でも3.2秒程度に留めている（本人指示）。
const SPECIAL_ANIMATION_FALLBACK_MS = 2000; // イントロマスター
const COMPOSITE_ANIMATION_FALLBACK_MS = 2600; // ＝LOVEマスター
const SUPREME_ANIMATION_FALLBACK_MS = 3200; // ＝LOVE完全制覇

// 称号1件の演出の「格」を判定する（対象の3称号idはjs/achievementList.jsの
// SPECIAL_BADGE_ACHIEVEMENT_IDSと同じだが、このファイルはachievementList.jsを
// importしない設計〈結果画面の演出とタイトル一覧モーダルは独立させている〉ため、
// idを直接比較している）（本人指示の豪華さの順を、そのままCSSクラス・
// 表示時間の段階に対応させる）。
function resolveEventTier(achievement) {
  if (achievement.id === "equal_love_complete") return "supreme";
  if (achievement.id === "equal_love_master") return "composite";
  if (achievement.id === "no_miss_master") return "special";
  return "normal";
}

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
  // 【2026-08-14改訂→2026-11-XX拡張・本人指示27】以前は「複合称号かどうか」の2段階だけ
  // だったが、推しアイコンに特別バッジが付く3称号（イントロマスター・＝LOVEマスター・
  // ＝LOVE完全制覇）の獲得演出を、豪華さの順に3段階へ拡張した（resolveEventTier参照）。
  const tier = resolveEventTier(achievement);
  const chip = document.createElement("div");
  chip.classList.add("achievement-event", `achievement-event--${tier}`);
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
  const tier = resolveEventTier(nextAchievement);
  const fallbackMsByTier = {
    normal: ANIMATION_FALLBACK_MS,
    special: SPECIAL_ANIMATION_FALLBACK_MS,
    composite: COMPOSITE_ANIMATION_FALLBACK_MS,
    supreme: SUPREME_ANIMATION_FALLBACK_MS,
  };
  fallbackTimeoutId = setTimeout(advanceQueue, fallbackMsByTier[tier]);
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
