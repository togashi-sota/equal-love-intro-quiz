// js/achievementList.jsの恒久テスト。
// 他のファイルの規約（DOM構築はブラウザでの実機確認に任せる）とは異なり、このファイルだけは
// 本人から名指しで依頼された「称号名がDOM上で全文存在する」「必要称号が表示される」等の項目を
// 確認するため、buildAchievementCard()が組み立てる実際のDOMを直接検証する
// （tests.htmlは実ブラウザで動くため、documentが使える）。
import { buildAchievementCard, buildGrowthBadgeCard, buildGrowthSection } from "../js/achievementList.js";
import { ACHIEVEMENTS } from "../js/achievementDefinitions.js";
import { assertEqual } from "./test-utils.js";

// getAchievementListSnapshot()が返す形＋achievementList.js内部で付加される
// guidanceBadgeTextを、テストごとに必要な分だけ指定できるようにするビルダー。
function buildEntry(overrides) {
  return {
    id: "intro_beginner",
    name: "イントロビギナー",
    category: "growth",
    iconKey: "intro_beginner",
    conditionText: "テスト用の条件文",
    challengeConditions: null,
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
  // 【2026-08-14更新】17称号構成にあわせて名前一覧を更新（ブロンズ〜プラチナは廃止済み）。
  const longNames = [
    "イントロビギナー",
    "イントロチャレンジャー",
    "イントロエース",
    "シャッフルビギナー",
    "シャッフルチャレンジャー",
    "シャッフルエース",
    "リリックビギナー",
    "リリックチャレンジャー",
    "リリックエース",
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
      category: "masterPath",
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
      category: "backChallenge",
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
      category: "masterPath",
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

  // ---- 成長段階系トリオの先頭に「まずはここから」バッジ（2026-08-14更新） ----
  const startHereCard = buildAchievementCard(
    buildEntry({
      id: "intro_beginner",
      name: "イントロビギナー",
      isUnlocked: false,
      guidanceBadgeText: "🔰 まずはここから",
    })
  );
  assertEqual(
    startHereCard.querySelector(".achievement-card-guidance").textContent,
    "🔰 まずはここから",
    "未取得の成長段階トリオ先頭に、まずはここからバッジが表示される"
  );

  const unlockedStartHereCard = buildAchievementCard(
    buildEntry({ id: "intro_beginner", name: "イントロビギナー", isUnlocked: true, guidanceBadgeText: null })
  );
  assertEqual(
    unlockedStartHereCard.querySelector(".achievement-card-guidance"),
    null,
    "取得済みの成長段階称号には、もう案内バッジを表示しない"
  );

  // ---- 成長段階トリオの2番目以降に「次の目標」バッジ ----
  const nextStepCard = buildAchievementCard(
    buildEntry({
      id: "intro_challenger",
      name: "イントロチャレンジャー",
      isUnlocked: false,
      guidanceBadgeText: "→ 次の目標",
    })
  );
  assertEqual(
    nextStepCard.querySelector(".achievement-card-guidance").textContent,
    "→ 次の目標",
    "次に狙うべき成長段階に「次の目標」バッジが表示される"
  );

  // ---- 「挑戦条件」の詳細箇条書きが表示される（2026-08-14追加） ----
  const challengeCard = buildAchievementCard(
    buildEntry({
      id: "no_miss_master",
      name: "ノーミスマスター",
      category: "masterPath",
      iconKey: "no_miss_master",
      challengeConditions: ["モード：イントロ系", "出題数：現在出題可能な全曲", "条件：全問正解"],
    })
  );
  assertEqual(
    [...challengeCard.querySelectorAll(".achievement-card-challenge-list li")].map((el) => el.textContent),
    ["モード：イントロ系", "出題数：現在出題可能な全曲", "条件：全問正解"],
    "挑戦条件の箇条書きがカードに表示される"
  );
  assertEqual(
    challengeCard.querySelector(".achievement-card-challenge-title").textContent,
    "挑戦条件",
    "マスター系（category!=='growth'）の見出しは「挑戦条件」になる"
  );
  assertEqual(
    challengeCard.querySelector(".achievement-card-challenge").classList.contains("achievement-card-challenge--compact"),
    false,
    "マスター系はコンパクト版クラスを持たない"
  );

  const noChallengeCard = buildAchievementCard(buildEntry({ challengeConditions: null }));
  assertEqual(
    noChallengeCard.querySelector(".achievement-card-challenge"),
    null,
    "challengeConditionsがnullの称号（複合称号等）には条件ブロックが表示されない"
  );

  // ---- 成長段階系（growth）は「達成条件」の見出し・コンパクト版で表示される（2026-08-15追加） ----
  const growthChallengeCard = buildAchievementCard(
    buildEntry({
      id: "intro_beginner",
      name: "イントロビギナー",
      category: "growth",
      iconKey: "intro_beginner",
      challengeConditions: ["出題数：5問", "カテゴリー：自由", "条件：全問正解"],
    })
  );
  assertEqual(
    growthChallengeCard.querySelector(".achievement-card-challenge-title").textContent,
    "達成条件",
    "成長段階系の見出しは「達成条件」になる（マスター系の「挑戦条件」とは区別する）"
  );
  assertEqual(
    growthChallengeCard.querySelector(".achievement-card-challenge").classList.contains("achievement-card-challenge--compact"),
    true,
    "成長段階系はコンパクト版クラスを持つ"
  );
  assertEqual(
    [...growthChallengeCard.querySelectorAll(".achievement-card-challenge-list li")].map((el) => el.textContent),
    ["出題数：5問", "カテゴリー：自由", "条件：全問正解"],
    "成長段階系の達成条件の箇条書きも正しく表示される"
  );

  // ---- 実データの整合性確認（2026-08-15追加）：js/achievementDefinitions.jsの実際の内容 ----
  const GROWTH_IDS = [
    "intro_beginner", "intro_challenger", "intro_ace",
    "shuffle_beginner", "shuffle_challenger", "shuffle_ace",
    "lyric_beginner", "lyric_challenger", "lyric_ace",
  ];
  GROWTH_IDS.forEach((id) => {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    assertEqual(
      Array.isArray(def.challengeConditions) && def.challengeConditions.length > 0,
      true,
      `実データ：成長段階系「${id}」は達成条件（challengeConditions）を持つ`
    );
  });
  const SINGLE_MASTER_IDS = ["no_miss_master", "full_chorus_master", "song_master", "lightning_fast", "melody_ace", "lyric_master"];
  SINGLE_MASTER_IDS.forEach((id) => {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    assertEqual(
      Array.isArray(def.challengeConditions) && def.challengeConditions.length > 0,
      true,
      `実データ：マスター/裏称号「${id}」は挑戦条件（challengeConditions）を持つ`
    );
  });
  const COMPOSITE_IDS = ["equal_love_master", "equal_love_complete"];
  COMPOSITE_IDS.forEach((id) => {
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    assertEqual(
      def.challengeConditions,
      null,
      `実データ：複合称号「${id}」はchallengeConditionsを持たない（compositeProgressのチェックリストが同じ役割）`
    );
  });
  assertEqual(ACHIEVEMENTS.length, 17, "実データ：ACHIEVEMENTSの総数は17個");

  // ---- 2026-08-17追加：ステップアップ（growth）専用のトロフィー風バッジカード ----
  const lockedGrowthEntry = buildEntry({
    id: "shuffle_challenger",
    name: "シャッフルチャレンジャー",
    iconKey: "shuffle_challenger",
    conditionText: "ランダム再生で10問ノーミス！",
    isUnlocked: false,
  });
  const lockedCard = buildGrowthBadgeCard(lockedGrowthEntry, "10問");
  assertEqual(lockedCard.classList.contains("is-locked"), true, "未取得のバッジカードはis-lockedを持つ");
  assertEqual(
    lockedCard.querySelector(".growth-badge-name")?.textContent,
    "シャッフルチャレンジャー",
    "未取得でもバッジカードに称号名が全文表示される"
  );
  assertEqual(
    lockedCard.querySelector(".growth-badge-tier")?.textContent,
    "10問",
    "バッジカードに段階（出題数）ラベルが表示される"
  );
  assertEqual(
    lockedCard.querySelector(".growth-badge-check"),
    null,
    "未取得のバッジカードにはチェックマークが付かない"
  );
  assertEqual(
    lockedCard.querySelector(".growth-badge-status")?.textContent,
    "未取得",
    "未取得のバッジカードのステータスは「未取得」"
  );
  // ロック中でも、js/achievementIcons.jsのlocked-preview（形はそのまま・配色だけ落とす）を
  // 使っていることを確認する（汎用の鍵アイコンに切り替わっていないこと）。
  assertEqual(
    lockedCard.querySelector(".achievement-icon-medal")?.classList.contains("is-locked-preview"),
    true,
    "未取得のバッジカードはlocked-preview（形はそのまま・配色だけ落とす）を使う"
  );
  assertEqual(
    lockedCard.querySelector(".achievement-icon-medal")?.classList.contains("is-locked"),
    false,
    "未取得のバッジカードは汎用の鍵アイコン（is-locked）には切り替わらない"
  );

  const unlockedGrowthEntry = buildEntry({
    id: "lyric_ace",
    name: "リリックエース",
    iconKey: "lyric_ace",
    conditionText: "歌詞クイズで20問ノーミス！",
    isUnlocked: true,
    unlockedAt: "2026-08-17T00:00:00.000Z",
  });
  const unlockedCard = buildGrowthBadgeCard(unlockedGrowthEntry, "20問");
  assertEqual(unlockedCard.classList.contains("is-unlocked"), true, "取得済みのバッジカードはis-unlockedを持つ");
  assertEqual(
    unlockedCard.querySelector(".growth-badge-check") !== null,
    true,
    "取得済みのバッジカードにはチェックマークが付く"
  );
  assertEqual(
    unlockedCard.querySelector(".growth-badge-status")?.classList.contains("is-achieved"),
    true,
    "取得済みのバッジカードのステータスはis-achieved"
  );

  const guidanceEntry = buildEntry({
    id: "intro_beginner",
    isUnlocked: false,
    guidanceBadgeText: "🔰 まずはここから",
  });
  const guidanceCard = buildGrowthBadgeCard(guidanceEntry, "5問");
  assertEqual(
    guidanceCard.querySelector(".growth-badge-guidance")?.textContent,
    "🔰 まずはここから",
    "guidanceBadgeTextがあるときだけ案内バッジが表示される"
  );

  // ---- 実データ：ステップアップ全9個が3系統×3段階（横並び3枚）で組み立てられる ----
  const growthSnapshotEntries = ACHIEVEMENTS.filter((a) => a.category === "growth").map((a) =>
    buildEntry({ ...a, isUnlocked: false })
  );
  const growthSection = buildGrowthSection(growthSnapshotEntries);
  const seriesBlocks = growthSection.querySelectorAll(".growth-series-block");
  assertEqual(seriesBlocks.length, 3, "ステップアップは3系統（イントロ/シャッフル/リリック）に分かれる");
  seriesBlocks.forEach((block, index) => {
    const cards = block.querySelectorAll(".growth-badge-card");
    assertEqual(cards.length, 3, `系統${index + 1}はビギナー/チャレンジャー/エースの3枚`);
  });
  assertEqual(
    growthSection.querySelectorAll(".growth-badge-card").length,
    9,
    "ステップアップ全9個がすべてバッジカードとして描画される"
  );
}
