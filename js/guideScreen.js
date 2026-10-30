// 「遊び方・機能ガイド」画面（アプリ全体の使い方。#guide-screen）を組み立てるファイル（2026-08-15新設）。
//
// 【2026-10-31 全面改訂・本人の依頼 C】1ページの説明書にした：
//   概要 → 目次（押すとその分類へ移る）→ はじめての人の流れ → 分類ごとの項目（押すと開く・閉じる）→ 検索の使い分け → …
//   ・項目の中の［○○を開く］で、その機能の画面を直接開く（開き方は main.js の onOpen に任せる。ホームのボタンと同じ処理）。
//   ・中身はすべて js/data/guideContent.js（ゲームの説明は js/data/gameGuideContent.js と共通）。ここは DOM を作るだけ。
//   ・開いている項目・スクロールの位置は、機能を開いて［戻る］で帰ってきたときもそのまま（画面を作り直さない）。
//     ホームなどから開き直したときだけ、閉じた状態・いちばん上から（openGuideScreen）。
import {
  GUIDE_CATEGORIES,
  GUIDE_FIRST_STEPS,
  GUIDE_OVERVIEW,
  GUIDE_SEARCH_FIELDS,
  GUIDE_VIDEO,
  getGuideSectionById,
} from "./data/guideContent.js";
import { SONGS } from "./data/songs.js";
import { filterSongsByCategory } from "./quiz.js";
import { ACHIEVEMENTS } from "./achievementDefinitions.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null;
let callbacks = { onOpen: () => {} };
let rendered = false;
// 「戻る」で戻る先（ホーム・ガイド画面・全体検索など、開いた画面）
let returnScreenId = "start";

// 文の中の {count:…} を今のデータの数に置き換える（古い数を文に書かないため）
export function buildGuideCounts(songs = SONGS, achievements = ACHIEVEMENTS) {
  return {
    all: songs.length,
    "title-track": filterSongsByCategory(songs, "title-track").length,
    "title-and-group": filterSongsByCategory(songs, "title-and-group").length,
    achievements: achievements.length,
  };
}

export function fillGuideCounts(text, counts) {
  return String(text ?? "").replace(/\{count:([a-z-]+)\}/g, (whole, key) => (Number.isFinite(counts[key]) ? String(counts[key]) : ""));
}

// 要素を作る小さな道具（innerHTML は使わない）
function el(tag, className = "", text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null && text !== undefined) element.textContent = text;
  return element;
}

// 機能を開くボタン。open の形：
//   { home: "<ホームのボタンの名前>" } … ホームの同じボタンと同じ処理（js/homeScreen.js の HOME_ACTIONS）
//   { click: "<要素の id>" }          … その既存のボタンを押したのと同じ
//   { mode: "<モードの id>" }          … ゲームのモードを開く（ゲーム画面のカードと同じ）
//   { gameGuide: "<モードの id>" }     … 「ゲームの遊び方・記録」のそのモード（"" なら一覧）
//   { intro: true }                     … ホームのイントロクイズの箱
//   { guideSection: "<項目の id>" }    … このガイドの中のその項目
//   { help: "<モードの id>" }          … そのモードの「？」の詳しいルール
//   { url: "<ページ>" }               … 別のページ（a 要素で開く）
function buildOpenControl(action, extraClass = "") {
  const className = `gd-open${action.primary ? " is-primary" : ""}${extraClass ? ` ${extraClass}` : ""}`;
  if (action.open?.url) {
    const link = el("a", className, action.label);
    link.href = action.open.url;
    return link;
  }
  const button = el("button", className, action.label);
  button.type = "button";
  button.dataset.guideOpen = JSON.stringify(action.open);
  button.addEventListener("click", () => runGuideOpen(action.open));
  return button;
}

export function runGuideOpen(open) {
  if (!open) return;
  if (open.guideSection) {
    playSfx(SFX_EVENTS.UI_CLICK);
    revealGuideSection(open.guideSection);
    return;
  }
  callbacks.onOpen(open);
}

function buildVideoCardBehavior() {
  const card = elements.videoCard;
  if (!card) return;
  card.href = GUIDE_VIDEO.url;
  elements.videoCardTitle.textContent = GUIDE_VIDEO.title;
  elements.videoCardDesc.textContent = GUIDE_VIDEO.description;
  elements.videoCardNote.textContent = GUIDE_VIDEO.note;
  elements.videoCardCtaLabel.textContent = `${GUIDE_VIDEO.ctaLabel} ▶`;
  elements.videoCardExternal.textContent = GUIDE_VIDEO.externalLabel;
  // オフラインのときはタブを開かず、カードの下に注意を数秒出す（開けない YouTube のエラーページへ飛ばさない）
  let timerId = null;
  card.addEventListener("click", (event) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      event.preventDefault();
      playSfx(SFX_EVENTS.UI_BACK);
      elements.videoOfflineNote.textContent = GUIDE_VIDEO.offlineMessage;
      elements.videoOfflineNote.hidden = false;
      clearTimeout(timerId);
      timerId = setTimeout(() => {
        elements.videoOfflineNote.hidden = true;
      }, 3000);
      return;
    }
    playSfx(SFX_EVENTS.UI_CLICK);
  });
}

function buildOverview(counts) {
  const box = el("section", "gd-overview");
  box.setAttribute("aria-labelledby", "gd-overview-title");
  const title = el("h3", "gd-overview-title", "このアプリでできること");
  title.id = "gd-overview-title";
  box.appendChild(title);
  box.appendChild(el("p", "gd-overview-lead", GUIDE_OVERVIEW.lead));
  const list = el("ul", "gd-overview-list");
  GUIDE_OVERVIEW.points.forEach((point) => {
    const item = el("li", "gd-overview-item");
    item.appendChild(el("span", "gd-overview-icon", point.icon)).setAttribute("aria-hidden", "true");
    const text = el("span", "gd-overview-text");
    text.appendChild(el("b", "", point.title));
    text.appendChild(el("span", "", fillGuideCounts(point.text, counts)));
    item.appendChild(text);
    list.appendChild(item);
  });
  box.appendChild(list);
  box.appendChild(el("p", "gd-storage-note", GUIDE_OVERVIEW.storageNote));
  // よく使う入口（ゲームの説明・プレイ履歴）
  const quick = el("div", "gd-quick");
  quick.appendChild(buildOpenControl({ label: "ゲームの遊び方・記録", open: { gameGuide: "" } }, "gd-quick-button"));
  quick.appendChild(buildOpenControl({ label: "プレイ履歴を見る", open: { home: "history" } }, "gd-quick-button"));
  box.appendChild(quick);
  return box;
}

function buildToc() {
  const nav = el("nav", "gd-toc");
  nav.id = "gd-toc";
  nav.setAttribute("aria-labelledby", "gd-toc-title");
  const head = el("div", "gd-toc-head");
  const title = el("h3", "gd-toc-title", "目次");
  title.id = "gd-toc-title";
  head.appendChild(title);
  // すべて開く／閉じる（印刷のように通して読みたい人向け）
  const toggleAll = el("button", "gd-toc-toggle-all", "すべて開く");
  toggleAll.type = "button";
  toggleAll.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const items = [...elements.content.querySelectorAll("details.gd-item")];
    const open = items.some((item) => !item.open);
    items.forEach((item) => {
      item.open = open;
    });
    toggleAll.textContent = open ? "すべて閉じる" : "すべて開く";
  });
  head.appendChild(toggleAll);
  nav.appendChild(head);
  const list = el("ul", "gd-toc-list");
  const entries = [{ id: "first", icon: "🔰", label: "はじめての人へ" }, ...GUIDE_CATEGORIES];
  entries.forEach((entry) => {
    const item = el("li", "gd-toc-entry");
    const button = el("button", "gd-toc-button");
    button.type = "button";
    button.dataset.guideJump = entry.id;
    button.appendChild(el("span", "gd-toc-icon", entry.icon)).setAttribute("aria-hidden", "true");
    // 目次の名前は、言葉の途中で折り返さない（「|」の所だけで折り返す。css の word-break: keep-all）
    const label = el("span", "gd-toc-label");
    (entry.tocLabel ?? entry.label).split("|").forEach((part, index) => {
      if (index > 0) label.appendChild(document.createElement("wbr"));
      label.appendChild(document.createTextNode(part));
    });
    button.appendChild(label);
    if (entry.sectionIds) button.appendChild(el("span", "gd-toc-count", `${entry.sectionIds.length}`)).setAttribute("aria-label", `${entry.sectionIds.length}項目`);
    button.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      scrollToCategory(entry.id);
    });
    item.appendChild(button);
    list.appendChild(item);
  });
  nav.appendChild(list);
  return nav;
}

function buildBackToToc() {
  const button = el("button", "gd-back-to-toc", "↑ 目次へ戻る");
  button.type = "button";
  button.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    scrollIntoViewWithHeader(document.getElementById("gd-toc"));
  });
  return button;
}

function buildFirstSteps() {
  const section = el("section", "gd-cat gd-cat--first");
  section.id = "guide-cat-first";
  section.setAttribute("aria-labelledby", "guide-cat-first-title");
  const title = el("h3", "gd-cat-title", "はじめての人へ");
  title.id = "guide-cat-first-title";
  title.tabIndex = -1;
  title.prepend(el("span", "gd-cat-icon", "🔰"));
  section.appendChild(title);
  section.appendChild(el("p", "gd-cat-lead", "アプリを開いてから遊ぶまでの流れです。上から順に進めてください。"));
  const list = el("ol", "gd-first-steps");
  GUIDE_FIRST_STEPS.forEach((step, index) => {
    const item = el("li", "gd-first-step");
    item.appendChild(el("span", "gd-first-step-no", String(index + 1))).setAttribute("aria-hidden", "true");
    const body = el("div", "gd-first-step-body");
    body.appendChild(el("b", "gd-first-step-title", step.title));
    body.appendChild(el("p", "gd-first-step-text", step.text));
    const actions = el("div", "gd-actions");
    if (step.open) actions.appendChild(buildOpenControl({ label: step.openLabel, open: step.open }));
    if (step.link) actions.appendChild(buildOpenControl({ label: step.link.label, open: { url: step.link.href } }));
    if (actions.childElementCount > 0) body.appendChild(actions);
    item.appendChild(body);
    list.appendChild(item);
  });
  section.appendChild(list);
  // アプリ紹介動画（HTML にある1枚のカード）は、はじめての人の流れの最後に置く（いちばん上に置くと目次が遠くなるため）
  if (elements.videoCard) {
    const videoBox = el("div", "gd-video-box");
    videoBox.appendChild(el("p", "gd-video-lead", "動画でひと通り見たいとき："));
    videoBox.append(elements.videoCard, elements.videoOfflineNote);
    section.appendChild(videoBox);
  }
  section.appendChild(buildBackToToc());
  return section;
}

function buildSearchTable(search) {
  const table = el("dl", "gd-search-table");
  GUIDE_SEARCH_FIELDS.forEach((field) => {
    if (!search[field.key]) return;
    const row = el("div", "gd-search-row");
    row.appendChild(el("dt", "", field.label));
    row.appendChild(el("dd", "", search[field.key]));
    table.appendChild(row);
  });
  return table;
}

function buildItem(section, counts) {
  const details = el("details", `gd-item gd-item--${section.kind ?? "feature"}`);
  details.id = `guide-item-${section.id}`;
  details.dataset.sectionId = section.id;
  const summary = el("summary", "gd-item-summary");
  summary.appendChild(el("span", "gd-item-icon", section.icon)).setAttribute("aria-hidden", "true");
  const head = el("span", "gd-item-head");
  head.appendChild(el("span", "gd-item-title", fillGuideCounts(section.title, counts)));
  if (section.tagline) head.appendChild(el("span", "gd-item-tagline", fillGuideCounts(section.tagline, counts)));
  summary.appendChild(head);
  summary.appendChild(el("span", "gd-item-chevron")).setAttribute("aria-hidden", "true");
  details.appendChild(summary);

  const body = el("div", "gd-item-body");
  if (section.where) {
    const where = el("p", "gd-where");
    where.appendChild(el("b", "", "どこから："));
    where.appendChild(document.createTextNode(fillGuideCounts(section.where, counts)));
    body.appendChild(where);
  }
  if (section.kind === "search") {
    body.appendChild(buildSearchTable(section.search));
  } else if (section.kind === "faq") {
    section.steps.forEach((step) => body.appendChild(el("p", "gd-answer", fillGuideCounts(step, counts))));
  } else {
    if (section.kind === "game") body.appendChild(el("p", "gd-steps-heading", "大事な操作"));
    const list = el("ul", "gd-steps");
    section.steps.forEach((step) => list.appendChild(el("li", "", fillGuideCounts(step, counts))));
    body.appendChild(list);
  }
  if (section.point) body.appendChild(el("p", "gd-point", fillGuideCounts(section.point, counts)));
  if (section.actions?.length) {
    const actions = el("div", "gd-actions");
    section.actions.forEach((action) => actions.appendChild(buildOpenControl(action)));
    body.appendChild(actions);
  }
  details.appendChild(body);
  return details;
}

function buildCategory(category, counts) {
  const section = el("section", `gd-cat gd-cat--${category.id}`);
  section.id = `guide-cat-${category.id}`;
  section.setAttribute("aria-labelledby", `guide-cat-${category.id}-title`);
  const title = el("h3", "gd-cat-title", category.label);
  title.id = `guide-cat-${category.id}-title`;
  title.tabIndex = -1; // 目次から移ったとき、読み上げをここから始めるため
  title.prepend(el("span", "gd-cat-icon", category.icon));
  section.appendChild(title);
  if (category.lead) section.appendChild(el("p", "gd-cat-lead", category.lead));
  if (category.id === "games") {
    // ゲームは全体のガイドでは短く。詳しくは専用のページへ
    const more = el("div", "gd-actions gd-cat-actions");
    more.appendChild(buildOpenControl({ label: "ゲームの遊び方・記録（全モードのルール）", open: { gameGuide: "" }, primary: true }));
    section.appendChild(more);
  }
  const list = el("div", "gd-items");
  category.sectionIds.forEach((sectionId) => {
    const item = getGuideSectionById(sectionId);
    if (item) list.appendChild(buildItem(item, counts));
  });
  section.appendChild(list);
  section.appendChild(buildBackToToc());
  return section;
}

function render() {
  const counts = buildGuideCounts();
  const content = elements.content;
  content.textContent = "";
  content.appendChild(buildOverview(counts));
  content.appendChild(buildToc());
  content.appendChild(buildFirstSteps());
  GUIDE_CATEGORIES.forEach((category) => content.appendChild(buildCategory(category, counts)));
  rendered = true;
}

// 貼り付いた見出しの下に隠れないように、少し上を空けてスクロールする
function scrollIntoViewWithHeader(target) {
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - 12;
  window.scrollTo({ top: Math.max(0, top), behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function scrollToCategory(categoryId) {
  const target = document.getElementById(`guide-cat-${categoryId}`);
  scrollIntoViewWithHeader(target);
  target?.querySelector(".gd-cat-title")?.focus?.({ preventScroll: true });
}

// 項目を開いて、そこまでスクロールする（目次・全体検索・「保存の仕組みを読む」などから）
export function revealGuideSection(sectionId) {
  if (!rendered) render();
  const item = document.getElementById(`guide-item-${sectionId}`);
  if (!item) return false;
  item.open = true;
  requestAnimationFrame(() => scrollIntoViewWithHeader(item));
  return true;
}

// ホーム・ガイド画面などから開く：毎回、閉じた状態・いちばん上から
// fromScreenId：「戻る」で戻る先
export function openGuideScreen(fromScreenId = "start") {
  returnScreenId = fromScreenId || "start";
  if (!rendered) render();
  elements.content.querySelectorAll("details.gd-item").forEach((item) => {
    item.open = false;
  });
  const toggleAll = elements.content.querySelector(".gd-toc-toggle-all");
  if (toggleAll) toggleAll.textContent = "すべて開く";
}

// 全体検索の「ガイドで詳しく見る」から：その項目を開いた状態で
export function openGuideSection(sectionId, fromScreenId = "start") {
  openGuideScreen(fromScreenId);
  if (!getGuideSectionById(sectionId)) return;
  revealGuideSection(sectionId);
}

export function getGuideReturnScreenId() {
  return returnScreenId;
}

// elements：{ content（中身を作る入れ物）, videoCard ほか動画カードの部品, videoOfflineNote }
// options：{ onOpen(open)：機能を開く（main.js） }
export function initGuideScreen(newElements, options = {}) {
  elements = newElements;
  callbacks = { ...callbacks, ...options };
  buildVideoCardBehavior();
  render();
}
