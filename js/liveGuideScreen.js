// ＝LOVEライブ初心者ガイド画面（2026-10-24新設・本人指示）。内容は js/data/liveGuideContent.js、
// メンバーカラーは js/data/members.js（アプリの既存データ）から組み立てる。
// 持ち物チェックリストの状態だけをこの端末の localStorage に保存する（外部へは送らない）。
// 既存機能への移動（ライブコールモード・歌詞検索など）は、呼び出し側（main.js）の onOpenAction に任せる。
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import {
  LIVE_GUIDE_LAST_CHECKED,
  LIVE_GUIDE_KIND_LABELS,
  LIVE_GUIDE_SOURCES,
  LIVE_GUIDE_HERO,
  LIVE_GUIDE_CHAPTERS,
  LIVE_GUIDE_CHECKLIST,
  LIVE_GUIDE_FAQ,
  LIVE_GUIDE_LINKS,
  buildArrivalPlan,
} from "./data/liveGuideContent.js";

export const LIVE_GUIDE_CHECKLIST_STORAGE_KEY = "liveGuideChecklist.v1";

let container = null;
let onOpenAction = null;
let rendered = false;

// ---- チェックリストの保存（この端末だけ。保存できない環境でもページは使える） ----
export function readChecklistState(storage = globalThis.localStorage) {
  try {
    const parsed = JSON.parse(storage?.getItem(LIVE_GUIDE_CHECKLIST_STORAGE_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function writeChecklistState(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(LIVE_GUIDE_CHECKLIST_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 保存できなくても、その場のチェックはできる
  }
}

// 現役メンバーと、ペンライトで使われている色（アプリの既存データ）
export function buildMemberColorRows(members = MEMBERS) {
  return members
    .filter((member) => member.status === MEMBER_STATUS.ACTIVE)
    .map((member) => ({
      id: member.id,
      name: member.name,
      colors: (member.penlightColors?.length ? member.penlightColors : [member.memberColor]).filter(Boolean),
    }));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function sourceById(id) {
  return LIVE_GUIDE_SOURCES.find((source) => source.id === id) ?? null;
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function externalLink(source) {
  const link = el("a", "live-guide-source-link", source.title);
  link.href = source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function buildBlock(block) {
  const card = el("div", `live-guide-block${block.kind ? ` is-${block.kind}` : ""}`);
  if (block.kind) card.appendChild(el("span", `live-guide-kind is-${block.kind}`, LIVE_GUIDE_KIND_LABELS[block.kind]));
  if (block.title) card.appendChild(el("p", "live-guide-block-title", block.title));
  if (block.text) card.appendChild(el("p", "live-guide-text", block.text));
  if (block.items) {
    const list = el("ul", "live-guide-list");
    block.items.forEach((item) => list.appendChild(el("li", null, item)));
    card.appendChild(list);
  }
  if (block.sourceIds?.length) {
    const sources = el("p", "live-guide-block-sources");
    sources.appendChild(document.createTextNode("出典："));
    block.sourceIds.map(sourceById).filter(Boolean).forEach((source, index) => {
      if (index > 0) sources.appendChild(document.createTextNode("／"));
      sources.appendChild(externalLink(source));
      if (source.published) sources.appendChild(document.createTextNode(`（${formatDate(source.published)}掲載）`));
    });
    card.appendChild(sources);
  }
  return card;
}

function buildActionButton(link) {
  const button = el("button", "live-guide-action", `${link.label} →`);
  button.type = "button";
  button.addEventListener("click", () => onOpenAction?.(link.action));
  return button;
}

function buildChecklist() {
  const wrap = el("div", "live-guide-checklist");
  const state = readChecklistState();
  const progress = el("p", "live-guide-checklist-progress");
  const total = LIVE_GUIDE_CHECKLIST.reduce((sum, group) => sum + group.items.length, 0);
  const updateProgress = () => {
    const current = readChecklistState();
    const checked = LIVE_GUIDE_CHECKLIST.flatMap((g) => g.items).filter((item) => current[item.id]).length;
    progress.textContent = `チェック済み ${checked} / ${total}`;
  };
  LIVE_GUIDE_CHECKLIST.forEach((group) => {
    const groupCard = el("div", `live-guide-checklist-group is-${group.id}`);
    groupCard.appendChild(el("p", "live-guide-checklist-title", group.title));
    if (group.note) groupCard.appendChild(el("p", "live-guide-checklist-note", group.note));
    group.items.forEach((item) => {
      const label = el("label", "live-guide-check");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(state[item.id]);
      input.dataset.itemId = item.id;
      input.addEventListener("change", () => {
        const next = readChecklistState();
        if (input.checked) next[item.id] = true;
        else delete next[item.id];
        writeChecklistState(next);
        updateProgress();
      });
      label.append(input, el("span", null, item.label));
      groupCard.appendChild(label);
    });
    wrap.appendChild(groupCard);
  });
  const reset = el("button", "live-guide-secondary-button", "チェックをすべて外す");
  reset.type = "button";
  reset.addEventListener("click", () => {
    writeChecklistState({});
    wrap.querySelectorAll("input[type=checkbox]").forEach((input) => {
      input.checked = false;
    });
    updateProgress();
  });
  const footer = el("div", "live-guide-checklist-footer");
  footer.append(progress, reset);
  wrap.appendChild(footer);
  updateProgress();
  return wrap;
}

function buildPlanner() {
  const wrap = el("div", "live-guide-planner");
  wrap.appendChild(el("p", "live-guide-block-title", "開場・開演の時刻から目安を出してみる"));
  const fields = el("div", "live-guide-planner-fields");
  const makeTime = (labelText) => {
    const label = el("label", "live-guide-planner-field");
    label.appendChild(el("span", null, labelText));
    const input = document.createElement("input");
    input.type = "time";
    label.appendChild(input);
    fields.appendChild(label);
    return input;
  };
  const openInput = makeTime("開場時刻");
  const startInput = makeTime("開演時刻");
  wrap.appendChild(fields);
  const options = el("div", "live-guide-planner-options");
  const makeOption = (labelText) => {
    const label = el("label", "live-guide-check");
    const input = document.createElement("input");
    input.type = "checkbox";
    label.append(input, el("span", null, labelText));
    options.appendChild(label);
    return input;
  };
  const goods = makeOption("グッズを買う");
  const photos = makeOption("会場の写真を撮りたい");
  const big = makeOption("初めて行く大きな会場");
  wrap.appendChild(options);
  const result = el("ol", "live-guide-planner-result");
  const message = el("p", "live-guide-planner-message", "開場時刻と開演時刻を入力すると、行動の目安が出ます（制作者の目安です）。");
  const update = () => {
    const plan = buildArrivalPlan({
      openTime: openInput.value,
      startTime: startInput.value,
      buyGoods: goods.checked,
      takePhotos: photos.checked,
      bigVenue: big.checked,
    });
    result.innerHTML = "";
    if (!plan.ok) {
      message.textContent = openInput.value || startInput.value ? plan.reason : "開場時刻と開演時刻を入力すると、行動の目安が出ます（制作者の目安です）。";
      return;
    }
    message.textContent = "あくまで目安です。入場・物販の方法は公演ごとの公式案内を優先してください。";
    plan.steps.forEach((step) => {
      const item = el("li");
      if (step.time) item.appendChild(el("span", "live-guide-planner-time", step.time));
      item.appendChild(el("span", null, step.label));
      result.appendChild(item);
    });
  };
  [openInput, startInput, goods, photos, big].forEach((input) => input.addEventListener("input", update));
  [goods, photos, big].forEach((input) => input.addEventListener("change", update));
  wrap.append(message, result);
  return wrap;
}

function buildMemberColors() {
  const wrap = el("div", "live-guide-block is-fan");
  wrap.appendChild(el("span", "live-guide-kind is-fan", LIVE_GUIDE_KIND_LABELS.fan));
  wrap.appendChild(el("p", "live-guide-block-title", "メンバーカラー（現役10人）"));
  const grid = el("ul", "live-guide-color-grid");
  buildMemberColorRows().forEach((row) => {
    const item = el("li", "live-guide-color-row");
    const swatches = el("span", "live-guide-color-swatches");
    row.colors.forEach((color) => {
      const swatch = el("span", "live-guide-color-swatch");
      swatch.style.background = color.hex;
      swatch.title = color.name;
      swatches.appendChild(swatch);
    });
    item.append(swatches, el("span", "live-guide-color-name", row.name), el("span", "live-guide-color-label", row.colors.map((c) => c.name).join("×")));
    grid.appendChild(item);
  });
  wrap.appendChild(grid);
  wrap.appendChild(
    el(
      "p",
      "live-guide-text is-small",
      "公式サイトでは、メンバー個人ごとのペンライトの色の指定を確認できませんでした。ここに載せているのは、ライブや配信でファンの間で使われている色です（アプリのメンバー紹介と同じデータ）。"
    )
  );
  return wrap;
}

function buildTimeline(steps) {
  const list = el("ol", "live-guide-timeline");
  steps.forEach((step, index) => {
    const item = el("li", "live-guide-timeline-step");
    item.appendChild(el("span", "live-guide-timeline-number", String(index + 1)));
    const body = el("span", "live-guide-timeline-body");
    body.append(el("strong", null, step.title), el("span", null, step.text));
    item.appendChild(body);
    list.appendChild(item);
  });
  return list;
}

function buildFaq() {
  const list = el("div", "live-guide-faq");
  LIVE_GUIDE_FAQ.forEach((entry) => {
    const details = el("details", "live-guide-faq-item");
    details.append(el("summary", null, entry.q), el("p", "live-guide-text", entry.a));
    list.appendChild(details);
  });
  return list;
}

function buildChapter(chapter) {
  const section = el("section", "live-guide-chapter");
  section.id = `live-guide-chapter-${chapter.id}`;
  const heading = el("h3", "live-guide-chapter-title");
  heading.append(el("span", "live-guide-chapter-icon", chapter.icon), document.createTextNode(chapter.title));
  section.appendChild(heading);
  chapter.blocks.forEach((block) => section.appendChild(buildBlock(block)));
  if (chapter.checklist) section.appendChild(buildChecklist());
  if (chapter.planner) section.appendChild(buildPlanner());
  if (chapter.memberColors) section.appendChild(buildMemberColors());
  if (chapter.callPractice) {
    const actions = el("div", "live-guide-actions");
    LIVE_GUIDE_LINKS.filter((link) => link.id === "call-practice" || link.id === "songlist").forEach((link) =>
      actions.appendChild(buildActionButton(link))
    );
    section.appendChild(actions);
  }
  if (chapter.timeline) section.appendChild(buildTimeline(chapter.timeline));
  if (chapter.faq) section.appendChild(buildFaq());
  return section;
}

function buildToc() {
  const nav = el("nav", "live-guide-toc");
  nav.setAttribute("aria-label", "目次");
  nav.appendChild(el("p", "live-guide-toc-title", "目次"));
  const list = el("div", "live-guide-toc-list");
  LIVE_GUIDE_CHAPTERS.forEach((chapter, index) => {
    const button = el("button", "live-guide-toc-item");
    button.type = "button";
    button.append(el("span", "live-guide-toc-number", String(index + 1)), el("span", null, `${chapter.icon} ${chapter.title}`));
    button.addEventListener("click", () => {
      document.getElementById(`live-guide-chapter-${chapter.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    list.appendChild(button);
  });
  nav.appendChild(list);
  return nav;
}

function buildHero() {
  const hero = el("div", "live-guide-hero");
  hero.appendChild(el("p", "live-guide-hero-title", LIVE_GUIDE_HERO.title));
  LIVE_GUIDE_HERO.lead.forEach((text) => hero.appendChild(el("p", "live-guide-text", text)));
  hero.appendChild(el("p", "live-guide-hero-notice", LIVE_GUIDE_HERO.notice));
  return hero;
}

function buildFooter() {
  const footer = el("div", "live-guide-footer");
  footer.appendChild(el("p", "live-guide-block-title", "アプリの関連機能"));
  const actions = el("div", "live-guide-actions");
  LIVE_GUIDE_LINKS.forEach((link) => actions.appendChild(buildActionButton(link)));
  footer.appendChild(actions);
  footer.appendChild(el("p", "live-guide-block-title", "参考にした情報"));
  const list = el("ul", "live-guide-source-list");
  LIVE_GUIDE_SOURCES.forEach((source) => {
    const item = el("li");
    item.appendChild(el("span", `live-guide-kind is-${source.kind}`, source.kind === "official" ? "公式" : "ファン"));
    item.appendChild(externalLink(source));
    if (source.published) item.appendChild(document.createTextNode(`（${formatDate(source.published)}掲載）`));
    list.appendChild(item);
  });
  footer.appendChild(list);
  footer.appendChild(el("p", "live-guide-text is-small", `最終確認日：${formatDate(LIVE_GUIDE_LAST_CHECKED)}。公式の案内は公演ごとに変わるため、参加する公演の最新の案内を必ず確認してください。`));
  footer.appendChild(el("p", "live-guide-text is-small", LIVE_GUIDE_HERO.notice));
  const top = el("button", "live-guide-secondary-button", "ページの先頭へ戻る");
  top.type = "button";
  top.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  footer.appendChild(top);
  return footer;
}

// 画面を開くたびに呼ぶ（内容は初回だけ組み立て、チェックリスト等の入力状態はそのまま残す）
export function openLiveGuideScreen() {
  if (!container || rendered) return;
  container.innerHTML = "";
  container.append(buildHero(), buildToc());
  LIVE_GUIDE_CHAPTERS.forEach((chapter) => container.appendChild(buildChapter(chapter)));
  container.appendChild(buildFooter());
  rendered = true;
}

// elements: { container }。options.onOpenAction(action)：既存機能を開く（main.js の openSearchFeatureAction と同じ形式）
export function initLiveGuideScreen(elements, options = {}) {
  container = elements.container;
  onOpenAction = options.onOpenAction ?? null;
}
