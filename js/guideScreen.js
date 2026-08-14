// 「遊び方ガイド」画面（目次⇄各ページ）を組み立てるファイル（2026-08-15新設）。
// 内容（見出し・手順・ポイント）はすべてjs/data/guideContent.jsが持ち、このファイルは
// DOM組み立てと目次⇄詳細ページの切り替えだけを行う。
import { GUIDE_CATEGORIES, getGuideSectionById } from "./data/guideContent.js";

let elements = null;

function showToc() {
  elements.tocView.hidden = false;
  elements.detailView.hidden = true;
}

function showDetail(sectionId) {
  const section = getGuideSectionById(sectionId);
  if (!section) return;

  elements.detailIcon.textContent = section.icon;
  elements.detailTitle.textContent = section.title;
  elements.detailTagline.textContent = section.tagline;

  elements.detailSteps.innerHTML = "";
  section.steps.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    elements.detailSteps.appendChild(item);
  });

  elements.detailPoint.textContent = `💡 ${section.point}`;

  elements.tocView.hidden = true;
  elements.detailView.hidden = false;
}

function buildTocEntryButton(section) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "guide-toc-entry";

  const icon = document.createElement("span");
  icon.className = "guide-toc-entry-icon";
  icon.textContent = section.icon;

  const label = document.createElement("span");
  label.className = "guide-toc-entry-label";
  label.textContent = section.title;

  button.append(icon, label);
  button.addEventListener("click", () => showDetail(section.id));
  return button;
}

function renderToc() {
  elements.tocGroups.innerHTML = "";
  GUIDE_CATEGORIES.forEach((category) => {
    const group = document.createElement("div");
    group.className = "guide-toc-group";

    const heading = document.createElement("p");
    heading.className = "guide-toc-group-heading";
    heading.textContent = category.label;
    group.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "guide-toc-grid";
    category.sectionIds.forEach((sectionId) => {
      const section = getGuideSectionById(sectionId);
      if (section) grid.appendChild(buildTocEntryButton(section));
    });
    group.appendChild(grid);

    elements.tocGroups.appendChild(group);
  });
}

// ガイド画面を開くたびに、必ず目次から表示する（前回どのページを見ていたかは覚えない、
// 攻略本を開き直すたびに目次から、という素直な挙動にする）。
export function openGuideScreen() {
  showToc();
}

// elements: {
//   tocView, detailView: 目次／詳細の2つの表示切り替え対象,
//   tocGroups: 目次のカテゴリ・項目を組み立てる入れ物,
//   detailBackButton: 詳細ページの「目次へ戻る」ボタン,
//   detailIcon, detailTitle, detailTagline, detailSteps, detailPoint: 詳細ページの各部品,
// }
export function initGuideScreen(newElements) {
  elements = newElements;
  renderToc();
  elements.detailBackButton.addEventListener("click", showToc);
  elements.detailBackButtonBottom.addEventListener("click", showToc);
}
