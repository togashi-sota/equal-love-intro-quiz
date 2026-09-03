// js/achievementDisplay.js（結果画面の称号獲得演出）の恒久テスト。
//
// 【2026-11-XX新設・本人指示27】推しアイコンに特別バッジが付く3称号
// （イントロマスター・＝LOVEマスター・＝LOVE完全制覇）の獲得演出を、豪華さの順
// （イントロマスター＜＝LOVEマスター＜＜＝LOVE完全制覇）に3段階へ拡張した。
// 実際に組み立てられるチップのCSSクラスが、称号ごとに正しい格（tier）になっているかを
// 確認する（renderAchievementUnlockEvents()はDOMへチップを1件ずつ追加するだけの
// 副作用のため、呼び出し直後のchipContainerの中身を直接見て検証できる）。
import { renderAchievementUnlockEvents, clearAchievementUnlockEvents } from "../js/achievementDisplay.js";
import { assertEqual } from "./test-utils.js";

function buildFakeElements() {
  const chipContainer = document.createElement("div");
  const achievementListLinkElement = document.createElement("a");
  achievementListLinkElement.hidden = true;
  return { chipContainer, achievementListLinkElement };
}

export function runAchievementDisplayTests() {
  const expectedTierClassById = {
    intro_beginner: "achievement-event--normal",
    no_miss_master: "achievement-event--special",
    equal_love_master: "achievement-event--composite",
    equal_love_complete: "achievement-event--supreme",
  };

  Object.entries(expectedTierClassById).forEach(([id, expectedClass]) => {
    const elements = buildFakeElements();
    renderAchievementUnlockEvents([id], elements);
    const chip = elements.chipContainer.querySelector(`[data-achievement-id="${id}"]`);
    assertEqual(chip !== null, true, `称号「${id}」の獲得演出チップが実際に組み立てられる`);
    assertEqual(
      chip?.classList.contains(expectedClass),
      true,
      `称号「${id}」の獲得演出は${expectedClass}（豪華さの段階）を持つ`
    );
    // 後片付け：次のテストへ演出キュー・タイマーの状態を持ち越さない。
    clearAchievementUnlockEvents(elements);
  });

  // ---- 複数同時解放でも、それぞれ正しい格のチップが1件ずつキューされる ----
  {
    const elements = buildFakeElements();
    renderAchievementUnlockEvents(["no_miss_master", "equal_love_complete"], elements);
    // advanceQueue()は1件目だけを即座にDOMへ追加し、2件目はanimationend（またはフォール
    // バックタイマー）を待つ設計のため、この時点で見えるのは1件目（no_miss_master）だけ。
    const firstChip = elements.chipContainer.querySelector('[data-achievement-id="no_miss_master"]');
    assertEqual(
      firstChip?.classList.contains("achievement-event--special"),
      true,
      "複数同時解放でも、先頭（イントロマスター）はachievement-event--specialとして描画される"
    );
    clearAchievementUnlockEvents(elements);
  }

  // ---- rewardNoteを持つ称号は演出チップにも特典メッセージが表示される ----
  {
    const elements = buildFakeElements();
    renderAchievementUnlockEvents(["no_miss_master"], elements);
    const chip = elements.chipContainer.querySelector('[data-achievement-id="no_miss_master"]');
    assertEqual(
      chip?.querySelector(".achievement-event-reward")?.textContent,
      "🎁 特典があります。推しアイコンに専用バッジが付きます。",
      "イントロマスターの獲得演出チップにも「特典があります」メッセージが表示される"
    );
    clearAchievementUnlockEvents(elements);
  }
}
