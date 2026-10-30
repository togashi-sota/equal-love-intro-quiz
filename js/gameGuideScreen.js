// 「ゲームの遊び方・記録」画面（#game-guide-screen）を組み立てるファイル（2026-10-31 新設・本人の依頼 D）。
//
// ホームの「ゲームで遊ぶ」の下の［ゲームの遊び方・記録］で開く（以前の行き先＝昔の「ゲーム」の画面〈#game-hub-screen〉は消していない。
// イントロクイズの出題数・カテゴリのラジオボタン・［スタート］・始められなかったときのエラーの表示に今も使われている）。
//
// 作り：上に［ゲームの遊び方］［プレイ履歴を見る］→ 3つのまとまり（ひとりで挑戦・友達と対戦・つくる・覚える）のカード
//       → カードを押すと、その場で詳しい説明が開く（大事な操作 → 要るデータ → 画像 → 10の項目 → ［このゲームを遊ぶ］）。
//   ・説明のデータは js/data/gameGuideContent.js（全体のガイドと共通）。ここは DOM を作るだけ。
//   ・［このゲームを遊ぶ］［プレイ履歴を見る］などの行き先は main.js の onOpen（全体のガイドと同じ形）に任せる。
//   ・機能を開いて［戻る］で帰ってきたときは、開いていたカード・スクロールの位置をそのまま残す（作り直さない）。
import {
  GAME_GUIDE_GROUPS,
  GAME_GUIDE_ITEMS,
  GAME_GUIDE_MODES,
  GAME_GUIDE_NEEDS_LABELS,
  fillGameGuideCounts,
  getGameGuideModeById,
} from "./data/gameGuideContent.js";
import { GUIDE_VIDEO } from "./data/guideContent.js";
import { buildGuideCounts } from "./guideScreen.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

let elements = null;
let callbacks = { onOpen: () => {} };
let rendered = false;
let returnScreenId = "start";

function el(tag, className = "", text = null) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== null && text !== undefined) element.textContent = text;
  return element;
}

// ホームと同じアイコン（index.html の <symbol id="hi-…">）
function icon(symbolId) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "hi");
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${symbolId}`);
  svg.appendChild(use);
  return svg;
}

function openButton(label, open, className = "gd-open") {
  const button = el("button", className, label);
  button.type = "button";
  button.dataset.guideOpen = JSON.stringify(open);
  button.addEventListener("click", () => callbacks.onOpen(open));
  return button;
}

function buildTop() {
  const top = el("div", "gg-top");
  top.appendChild(el("p", "gg-lead", "全部のゲームのルール・点数・記録の場所をまとめました。カードを押すと詳しい説明が開きます。"));
  const quick = el("div", "gg-quick");
  // ［ゲームの遊び方］＝この下のモードの一覧へ／［プレイ履歴を見る］＝今の記録の画面
  const toList = el("button", "gg-quick-button", "");
  toList.type = "button";
  toList.appendChild(icon("hi-help"));
  toList.appendChild(el("span", "", "ゲームの遊び方"));
  toList.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    scrollWithHeader(document.getElementById("gg-modes"));
  });
  const history = el("button", "gg-quick-button", "");
  history.type = "button";
  history.dataset.guideOpen = JSON.stringify({ home: "history" });
  history.appendChild(icon("hi-history"));
  history.appendChild(el("span", "", "プレイ履歴を見る"));
  history.addEventListener("click", () => callbacks.onOpen({ home: "history" }));
  quick.append(toList, history);
  top.appendChild(quick);

  // 動画（外部・新しいタブ）。画面が今と違う所があることを先に書く
  const video = el("a", "gg-video-link");
  video.href = GUIDE_VIDEO.url;
  video.target = "_blank";
  video.rel = "noopener noreferrer";
  video.appendChild(el("span", "gg-video-title", `🎬 ${GUIDE_VIDEO.title}（${GUIDE_VIDEO.durationLabel}・${GUIDE_VIDEO.externalLabel}）`));
  video.appendChild(el("span", "gg-video-note", GUIDE_VIDEO.note));
  video.addEventListener("click", (event) => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      event.preventDefault();
      video.querySelector(".gg-video-note").textContent = GUIDE_VIDEO.offlineMessage;
    }
  });
  top.appendChild(video);
  return top;
}

function buildModeCard(mode, counts) {
  const details = el("details", `gg-mode gg-tone--${mode.tone}`);
  details.id = `gg-mode-${mode.id}`;
  details.dataset.modeId = mode.id;
  const summary = el("summary", "gg-mode-summary");
  const iconBox = el("span", "gg-mode-icon");
  iconBox.appendChild(icon(mode.icon));
  summary.appendChild(iconBox);
  const text = el("span", "gg-mode-text");
  text.appendChild(el("span", "gg-mode-title", mode.title));
  text.appendChild(el("span", "gg-mode-catch", mode.catch));
  summary.appendChild(text);
  summary.appendChild(el("span", "gd-item-chevron")).setAttribute("aria-hidden", "true");
  details.appendChild(summary);

  const body = el("div", "gg-mode-body");
  // 大事な操作（目立たせる）
  const key = el("div", "gg-key");
  key.appendChild(el("p", "gg-key-title", "大事な操作"));
  const keyList = el("ol", "gg-key-list");
  mode.keyPoints.forEach((point) => keyList.appendChild(el("li", "", point)));
  key.appendChild(keyList);
  body.appendChild(key);

  // 遊ぶのに要るデータ
  const needs = el("p", "gg-needs");
  needs.appendChild(el("b", "", "この端末に要るデータ："));
  needs.appendChild(document.createTextNode(mode.needs.map((need) => GAME_GUIDE_NEEDS_LABELS[need]).join("・")));
  if (mode.needsNote) needs.appendChild(el("span", "gg-needs-note", mode.needsNote));
  body.appendChild(needs);

  // 画像（今の画面の見本。ダミーの文字で撮ったもの）
  if (mode.images.length > 0) {
    const figures = el("div", "gg-images");
    mode.images.forEach((image) => {
      const figure = el("figure", "gg-figure");
      const img = el("img");
      img.src = image.src;
      img.alt = image.alt;
      img.loading = "lazy";
      img.decoding = "async";
      figure.appendChild(img);
      figure.appendChild(el("figcaption", "", image.caption));
      figures.appendChild(figure);
    });
    body.appendChild(figures);
  }

  // 10の項目
  const list = el("dl", "gg-items");
  GAME_GUIDE_ITEMS.forEach((item) => {
    const lines = mode.items[item.key] ?? [];
    if (lines.length === 0) return;
    const row = el("div", `gg-item gg-item--${item.key}`);
    row.appendChild(el("dt", "", item.label));
    const dd = el("dd");
    if (lines.length === 1) {
      dd.textContent = fillGameGuideCounts(lines[0], counts);
    } else {
      const ul = el("ul");
      lines.forEach((line) => ul.appendChild(el("li", "", fillGameGuideCounts(line, counts))));
      dd.appendChild(ul);
    }
    row.appendChild(dd);
    list.appendChild(row);
  });
  body.appendChild(list);

  // ［このゲームを遊ぶ］［プレイ履歴を見る］［？ くわしいルール］
  const actions = el("div", "gd-actions gg-actions");
  const playOpen = mode.play.type === "intro" ? { intro: true } : { mode: mode.play.modeId };
  actions.appendChild(openButton("このゲームを遊ぶ", playOpen, "gd-open is-primary gg-play"));
  actions.appendChild(openButton("プレイ履歴を見る", { home: "history" }));
  if (mode.helpModalId) actions.appendChild(openButton("？ 画面の中のルール説明", { help: mode.helpModalId }));
  body.appendChild(actions);
  details.appendChild(body);

  // 開いたとき、見出しが画面の上に来るように（下の方のカードを開いて中身が見えない、を防ぐ）
  details.addEventListener("toggle", () => {
    if (!details.open) return;
    // 画面を開くときにこちらで開いた分（openGameGuideScreen）は、音もスクロールも呼んだ側が受け持つ
    if (details.dataset.silentOpen) {
      delete details.dataset.silentOpen;
      return;
    }
    playSfx(SFX_EVENTS.UI_CLICK);
    const rect = summary.getBoundingClientRect();
    if (rect.top < 0 || rect.top > window.innerHeight * 0.45) scrollWithHeader(details);
  });
  return details;
}

function render() {
  const counts = buildGuideCounts();
  const content = elements.content;
  content.textContent = "";
  content.appendChild(buildTop());
  const modes = el("div", "gg-groups");
  modes.id = "gg-modes";
  GAME_GUIDE_GROUPS.forEach((group) => {
    const section = el("section", `gg-group gg-group--${group.id}`);
    section.setAttribute("aria-labelledby", `gg-group-${group.id}-title`);
    const title = el("h3", "gg-group-title", group.label);
    title.id = `gg-group-${group.id}-title`;
    section.appendChild(title);
    const grid = el("div", "gg-grid");
    GAME_GUIDE_MODES.filter((mode) => mode.group === group.id).forEach((mode) => grid.appendChild(buildModeCard(mode, counts)));
    section.appendChild(grid);
    modes.appendChild(section);
  });
  content.appendChild(modes);
  content.appendChild(el("p", "gg-foot", `全${GAME_GUIDE_MODES.length}モード。点数・秒数は今のアプリの決まりです。アプリ全体の使い方は「遊び方・機能ガイド」へ。`));
  const toAppGuide = el("div", "gd-actions gg-foot-actions");
  toAppGuide.appendChild(openButton("遊び方・機能ガイド（アプリ全体）", { appGuide: true }));
  content.appendChild(toAppGuide);
  rendered = true;
}

function scrollWithHeader(target) {
  if (!target) return;
  const top = target.getBoundingClientRect().top + window.scrollY - 12;
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: Math.max(0, top), behavior: reduce ? "auto" : "smooth" });
}

// ホームなどから開く。modeId を渡すと、そのモードを開いた状態で、そこまで移る（"" なら一覧の上から）
export function openGameGuideScreen(modeId = "", fromScreenId = "start") {
  returnScreenId = fromScreenId || "start";
  if (!rendered) render();
  elements.content.querySelectorAll("details.gg-mode").forEach((details) => {
    details.open = false;
  });
  if (modeId && getGameGuideModeById(modeId)) {
    const target = document.getElementById(`gg-mode-${modeId}`);
    if (!target.open) target.dataset.silentOpen = "1";
    target.open = true;
    return target;
  }
  return null;
}

export function getGameGuideReturnScreenId() {
  return returnScreenId;
}

// 画面を表示したあとで、開いたモードまで移る（main.js が画面を切り替えたあとに呼ぶ）
export function revealGameGuideMode(modeId) {
  const target = modeId ? document.getElementById(`gg-mode-${modeId}`) : null;
  if (target) requestAnimationFrame(() => scrollWithHeader(target));
}

// elements：{ content }／options：{ onOpen(open) }
export function initGameGuideScreen(newElements, options = {}) {
  elements = newElements;
  callbacks = { ...callbacks, ...options };
  render();
}
