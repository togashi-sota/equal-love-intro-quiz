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
  GUIDE_SECTIONS.forEach((section) => {
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
    assertEqual(
      typeof section.tagline === "string" && section.tagline.length > 0,
      true,
      `「${section.id}」はtaglineを持つ`
    );
    assertEqual(
      Array.isArray(section.steps) && section.steps.length > 0,
      true,
      `「${section.id}」はstepsを1件以上持つ`
    );
    assertEqual(
      typeof section.point === "string" && section.point.length > 0,
      true,
      `「${section.id}」はpointを持つ`
    );
  });

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
