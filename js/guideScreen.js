// 「遊び方ガイド」画面（目次⇄各ページ）を組み立てるファイル（2026-08-15新設）。
// 内容（見出し・手順・ポイント）はすべてjs/data/guideContent.jsが持ち、このファイルは
// DOM組み立てと目次⇄詳細ページの切り替えだけを行う。
import { GUIDE_CATEGORIES, getGuideSectionById } from "./data/guideContent.js";

let elements = null;

// 【2026-09-09新設・本人指示：ロビー専用の詳細説明書からのリンク】以前はガイドを開く入口が
// ホーム画面の1箇所だけだったため、「戻る」は常にホームへ固定でよかった。オンライン対戦
// ロビーの説明書からもガイドへ移動できるようにしたため、「どの画面から開かれたか」を覚えて
// おき、戻るボタンで元の画面へ正しく戻れるようにする。
let returnScreenId = "start";

function showToc() {
  elements.tocView.hidden = false;
  elements.detailView.hidden = true;
}

function showDetail(sectionId) {
  const section = getGuideSectionById(sectionId);
  if (!section) return;

  elements.detailIcon.textContent = section.icon;
  elements.detailTitle.textContent = section.title;
  elements.detailTagline.textContent = section.tagline ?? "";
  // 【2026-09-08新設・本人指示S：FAQ/トラブルの追加】質問と回答をまとめたFAQ項目は
  // 「遊び方」という手順見出しが不自然なため、section.kind==="faq"のときだけ
  // 見出しを「回答」に差し替える（通常の遊び方セクションは今までどおり）。
  elements.detailStepsHeading.textContent = section.kind === "faq" ? "回答" : "遊び方";

  elements.detailSteps.innerHTML = "";
  (section.steps ?? []).forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    elements.detailSteps.appendChild(item);
  });

  // pointは補足のコツ・注意点のための任意項目。無い項目（FAQ等）では欄自体を隠す。
  if (section.point) {
    elements.detailPoint.textContent = `💡 ${section.point}`;
    elements.detailPoint.hidden = false;
  } else {
    elements.detailPoint.textContent = "";
    elements.detailPoint.hidden = true;
  }

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
// returnScreenId：「戻る」ボタンで戻る先の画面id（省略時は従来どおりホーム）。
export function openGuideScreen(fromScreenId = "start") {
  returnScreenId = fromScreenId;
  showToc();
}

export function getGuideReturnScreenId() {
  return returnScreenId;
}

// elements: {
//   tocView, detailView: 目次／詳細の2つの表示切り替え対象,
//   tocGroups: 目次のカテゴリ・項目を組み立てる入れ物,
//   detailBackButton: 詳細ページの「目次へ戻る」ボタン,
//   detailIcon, detailTitle, detailTagline, detailStepsHeading, detailSteps, detailPoint:
//     詳細ページの各部品,
// }
export function initGuideScreen(newElements) {
  elements = newElements;
  renderToc();
  elements.detailBackButton.addEventListener("click", showToc);
  elements.detailBackButtonBottom.addEventListener("click", showToc);
}
