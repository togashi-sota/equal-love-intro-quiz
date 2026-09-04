// js/data/guideContent.jsの恒久テスト。
// 目次（GUIDE_CATEGORIES）が参照するIDが必ず実データ（GUIDE_SECTIONS）に存在すること、
// 各ページが表示に必要な項目をすべて持っていることを確認する。
import { GUIDE_CATEGORIES, GUIDE_SECTIONS, getGuideSectionById } from "../js/data/guideContent.js";
import { assertEqual } from "./test-utils.js";

export function runGuideContentTests() {
  // ---- 目次が参照するIDは、すべて実データに存在する ----
  const allSectionIds = new Set(GUIDE_SECTIONS.map((section) => section.id));
  const referencedIds = GUIDE_CATEGORIES.flatMap((category) => category.sectionIds);
  const missingIds = referencedIds.filter((id) => !allSectionIds.has(id));
  assertEqual(missingIds, [], "目次（GUIDE_CATEGORIES）が参照するIDは、すべてGUIDE_SECTIONSに実在する");

  // ---- GUIDE_SECTIONSの全項目が、目次のどこかから最低1回は参照される（迷子のページが無い） ----
  const orphanIds = GUIDE_SECTIONS.map((section) => section.id).filter(
    (id) => !referencedIds.includes(id)
  );
  assertEqual(orphanIds, [], "GUIDE_SECTIONSの全項目が、目次のどこかから参照される（目次から辿れないページが無い）");

  // ---- id重複が無い ----
  assertEqual(
    allSectionIds.size,
    GUIDE_SECTIONS.length,
    "GUIDE_SECTIONSのidに重複が無い"
  );

  // ---- 各ページが、表示に必要な項目をすべて持つ ----
  // 【2026-09-08改訂・本人指示S：FAQ/トラブルの追加】kind:"faq"の項目は、質問(title)と
  // 回答(steps)だけを必須とし、通常項目向けのtagline・pointは任意（無ければ詳細ページ側で
  // 省略表示される、js/guideScreen.js参照）。
  GUIDE_SECTIONS.forEach((section) => {
    const isFaq = section.kind === "faq";
    assertEqual(
      typeof section.icon === "string" && section.icon.length > 0,
      true,
      `「${section.id}」はiconを持つ`
    );
    assertEqual(
      typeof section.title === "string" && section.title.length > 0,
      true,
      `「${section.id}」はtitleを持つ`
    );
    if (!isFaq) {
      assertEqual(
        typeof section.tagline === "string" && section.tagline.length > 0,
        true,
        `「${section.id}」はtaglineを持つ`
      );
    }
    assertEqual(
      Array.isArray(section.steps) && section.steps.length > 0,
      true,
      `「${section.id}」はstepsを1件以上持つ`
    );
    if (!isFaq) {
      assertEqual(
        typeof section.point === "string" && section.point.length > 0,
        true,
        `「${section.id}」はpointを持つ`
      );
    }
  });

  // ---- 【2026-09-06追加・本人指示9・15：正解数バトルからポイント概念を完全撤廃】
  // 「ルール・遊び方」ガイド内の歌詞クイズ対戦説明（onlineBattleModes）で、正解数バトルの
  // 説明部分だけにpt/ポイント表記が残っていないことを確認する（早押しバトル・ポイントバトルは
  // 従来どおりpt表記を維持するため、pointテキスト全体ではなく正解数バトルの節だけを
  // 切り出して検査する）。過去に実際、guideContent.jsのこの節だけ改称漏れで
  // 「正解1問＝1pt」という表記が残っていたことが今回の監査で発覚したための回帰テスト。
  {
    const onlineBattleModesSection = getGuideSectionById("onlineBattleModes");
    const pointText = onlineBattleModesSection?.point ?? "";
    const classicRuleClauseMatch = pointText.match(/正解数バトル：([^。]*(?:。[^早]*)?)早押しバトル/);
    assertEqual(classicRuleClauseMatch !== null, true, "onlineBattleModesのpointに「正解数バトル：〜早押しバトル」という節が見つかる（前提条件）");
    if (classicRuleClauseMatch) {
      assertEqual(
        /pt|ポイント/.test(classicRuleClauseMatch[1]),
        false,
        "「ルール・遊び方」ガイドの正解数バトルの説明にpt/ポイント表記が残っていない"
      );
    }
  }

  // ---- getGuideSectionById()の動作確認 ----
  assertEqual(
    getGuideSectionById("intro")?.title,
    "イントロクイズ",
    "getGuideSectionById()は該当するページを返す"
  );
  assertEqual(
    getGuideSectionById("存在しないID"),
    null,
    "getGuideSectionById()は該当が無ければnullを返す"
  );
}
