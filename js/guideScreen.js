// 「遊び方ガイド」画面（目次⇄各ページ）を組み立てるファイル（2026-08-15新設）。
// 内容（見出し・手順・ポイント）はすべてjs/data/guideContent.jsが持ち、このファイルは
// DOM組み立てと目次⇄詳細ページの切り替えだけを行う。
import { GUIDE_CATEGORIES, GUIDE_VIDEO, getGuideSectionById } from "./data/guideContent.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

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
  button.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    showDetail(section.id);
  });
  return button;
}

// 【2026-09-15新設・本人指示：アプリ紹介動画への導線】目次最上部の動画カードを組み立てる。
// hrefと文言はjs/data/guideContent.jsのGUIDE_VIDEOから入れる（URLを1箇所で管理するため）。
// オフライン時（navigator.onLine === false）はタブを開かず、カード直下に注意文を数秒表示する
// （開けないYouTubeのエラーページへ飛ばしてPWAの見た目を壊さないため）。
// 「オンラインなのにonLineがfalse」という誤判定は稀にあるが、その場合も注意文が出るだけで
// 再タップすれば開ける（判定を信用しすぎず、ページを壊さないことを優先）。
const OFFLINE_NOTE_VISIBLE_MS = 3000;
let offlineNoteTimerId = null;

function renderVideoCard() {
  if (!elements.videoCard) return;
  elements.videoCard.href = GUIDE_VIDEO.url;
  elements.videoCardTitle.textContent = GUIDE_VIDEO.title;
  elements.videoCardDesc.textContent = GUIDE_VIDEO.description;
  elements.videoCardNote.textContent = GUIDE_VIDEO.note;
  elements.videoCardCtaLabel.textContent = `${GUIDE_VIDEO.ctaLabel} ▶`;
  elements.videoCardExternal.textContent = GUIDE_VIDEO.externalLabel;
  elements.videoCard.addEventListener("click", (event) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      event.preventDefault();
      playSfx(SFX_EVENTS.UI_BACK);
      elements.videoOfflineNote.textContent = GUIDE_VIDEO.offlineMessage;
      elements.videoOfflineNote.hidden = false;
      clearTimeout(offlineNoteTimerId);
      offlineNoteTimerId = setTimeout(() => {
        elements.videoOfflineNote.hidden = true;
      }, OFFLINE_NOTE_VISIBLE_MS);
      return;
    }
    playSfx(SFX_EVENTS.UI_CLICK);
  });
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
//   videoCard, videoCardTitle, videoCardDesc, videoCardNote, videoCardCtaLabel, videoCardExternal,
//   videoOfflineNote: 目次最上部の「アプリ紹介動画」カード一式（2026-09-15新設）,
// }
export function initGuideScreen(newElements) {
  elements = newElements;
  renderVideoCard();
  renderToc();
  elements.detailBackButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    showToc();
  });
  elements.detailBackButtonBottom.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    showToc();
  });
}
