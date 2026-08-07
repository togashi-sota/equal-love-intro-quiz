// js/achievementList.jsの恒久テスト。
// 他のファイルの規約（DOM構築はブラウザでの実機確認に任せる）とは異なり、このファイルだけは
// 本人から名指しで依頼された「称号名がDOM上で全文存在する」「必要称号が表示される」等の項目を
// 確認するため、buildAchievementCard()が組み立てる実際のDOMを直接検証する
// （tests.htmlは実ブラウザで動くため、documentが使える）。
import { buildAchievementCard } from "../js/achievementList.js";
import { assertEqual } from "./test-utils.js";

// getAchievementListSnapshot()が返す形＋achievementList.js内部で付加される
// guidanceBadgeTextを、テストごとに必要な分だけ指定できるようにするビルダー。
function buildEntry(overrides) {
  return {
    id: "no_miss_bronze",
    name: "ブロンズ",
    category: "noMiss",
    iconKey: "no_miss_bronze",
    conditionText: "テスト用の条件文",
    rewardNote: null,
    isUnlocked: false,
    unlockedAt: null,
    compositeProgress: null,
    guidanceBadgeText: null,
    ...overrides,
  };
}

export function runAchievementListTests() {
  // ---- 長い称号名がDOM上で全文存在する（「…」に省略されない） ----
  // CSS(text-overflow:ellipsis)は見た目だけを変える指定であり、DOM上のtextContent自体は
  // 元々省略されないため、これは「JS側で意図せず文字列を切り詰めていないか」の回帰チェック。
  const longNames = [
    "ブロンズ",
    "シルバー",
    "ゴールド",
    "プラチナ",
    "ノーミスマスター",
    "フルコーラスマスター",
    "歌マスター",
    "電光石火",
    "メロディアス",
    "リリックマスター",
    "＝LOVEマスター",
    "＝LOVE完全制覇",
  ];
  longNames.forEach((name) => {
    const card = buildAchievementCard(buildEntry({ name }));
    assertEqual(
      card.querySelector(".achievement-card-name").textContent,
      name,
      `称号名「${name}」がカードDOM上に全文存在する`
    );
  });

  // ---- ＝LOVEマスターの必要称号3つが表示される ----
  const masterCard = buildAchievementCard(
    buildEntry({
      id: "equal_love_master",
      name: "＝LOVEマスター",
      category: "composite",
      iconKey: "equal_love_master",
      compositeProgress: {
        achievedCount: 1,
        requiredCount: 3,
        items: [
          { id: "no_miss_master", name: "ノーミスマスター", isUnlocked: true },
          { id: "full_chorus_master", name: "フルコーラスマスター", isUnlocked: false },
          { id: "song_master", name: "歌マスター", isUnlocked: false },
        ],
      },
    })
  );
  const masterRequirementNames = [...masterCard.querySelectorAll(".achievement-requirement-item")].map(
    (el) => el.textContent
  );
  assertEqual(
    masterRequirementNames,
    ["ノーミスマスター", "フルコーラスマスター", "歌マスター"],
    "＝LOVEマスターの必要称号3つが、名前つきでカードに表示される"
  );

  // ---- 取得状態が必要称号表示へ反映される（is-fulfilled / is-pending） ----
  const masterRequirementRows = [...masterCard.querySelectorAll(".achievement-requirement-item")];
  assertEqual(
    masterRequirementRows.map((el) => el.classList.contains("is-fulfilled")),
    [true, false, false],
    "取得済みのノーミスマスターだけis-fulfilledになり、未取得の2つはis-pendingになる"
  );

  // ---- ＝LOVE完全制覇の必要称号3つが表示される ----
  const completeCard = buildAchievementCard(
    buildEntry({
      id: "equal_love_complete",
      name: "＝LOVE完全制覇",
      category: "composite",
      iconKey: "equal_love_complete",
      compositeProgress: {
        achievedCount: 0,
        requiredCount: 3,
        items: [
          { id: "lightning_fast", name: "電光石火", isUnlocked: false },
          { id: "melody_ace", name: "メロディアス", isUnlocked: false },
          { id: "lyric_master", name: "リリックマスター", isUnlocked: false },
        ],
      },
    })
  );
  assertEqual(
    [...completeCard.querySelectorAll(".achievement-requirement-item")].map((el) => el.textContent),
    ["電光石火", "メロディアス", "リリックマスター"],
    "＝LOVE完全制覇の必要称号3つが、名前つきでカードに表示される"
  );

  // ---- 複合称号は、未取得でも汎用の鍵アイコンではなく王冠/ダイヤの形のまま
  //      （本人指示：「未取得状態でも形や説明は見えるようにする」） ----
  const lockedMasterCard = buildAchievementCard(
    buildEntry({
      id: "equal_love_master",
      name: "＝LOVEマスター",
      category: "composite",
      iconKey: "equal_love_master",
      isUnlocked: false,
      compositeProgress: { achievedCount: 0, requiredCount: 3, items: [] },
    })
  );
  const lockedMedal = lockedMasterCard.querySelector(".achievement-icon-medal");
  assertEqual(
    lockedMedal.classList.contains("is-equal_love_master"),
    true,
    "未取得の＝LOVEマスターも、汎用の鍵アイコンではなく王冠の形のクラスを持つ"
  );
  assertEqual(
    lockedMedal.classList.contains("is-locked-preview"),
    true,
    "未取得の＝LOVEマスターは、配色だけロック用（is-locked-preview）になる"
  );

  // ---- ノーミスマスターの初心者向け案内バッジ ----
  const lockedMasterGuideCard = buildAchievementCard(
    buildEntry({
      id: "no_miss_master",
      name: "ノーミスマスター",
      isUnlocked: false,
      guidanceBadgeText: "🎯 最初の目標",
    })
  );
  assertEqual(
    lockedMasterGuideCard.querySelector(".achievement-card-guidance").textContent,
    "🎯 最初の目標",
    "未取得のノーミスマスターに、初心者向けの案内バッジが表示される"
  );

  const unlockedMasterGuideCard = buildAchievementCard(
    buildEntry({ id: "no_miss_master", name: "ノーミスマスター", isUnlocked: true, guidanceBadgeText: null })
  );
  assertEqual(
    unlockedMasterGuideCard.querySelector(".achievement-card-guidance"),
    null,
    "取得済みのノーミスマスターには、もう案内バッジを表示しない"
  );

  // ---- ブロンズ〜プラチナの「次の目標」バッジ ----
  const nextStepCard = buildAchievementCard(
    buildEntry({ id: "no_miss_silver", name: "シルバー", isUnlocked: false, guidanceBadgeText: "→ 次の目標" })
  );
  assertEqual(
    nextStepCard.querySelector(".achievement-card-guidance").textContent,
    "→ 次の目標",
    "次に狙うべきノーミス段階に「次の目標」バッジが表示される"
  );
}
