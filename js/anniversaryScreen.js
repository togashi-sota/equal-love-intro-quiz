// 「＝LOVEの歩み・周年ヒストリー」ページ（#anniversary-screen。2026-10-29新設・本人の要望）。
// 9周年ライブで1年ずつ振り返ったように、周年ごとの大きな出来事を見られるようにする。
// 上に周年のカード（見出しの出来事つき）を横に並べ、押した周年の出来事を下に日付順で出す。
// 出来事から、ライブ履歴・収録曲・作品・メンバー・音楽番組出演へ飛べる（存在するページだけ）。
import { ANNIVERSARY_PERIODS, ANNIVERSARY_EVENTS } from "./data/anniversaryHistory.js";
import { LIVE_EVENTS } from "./data/liveHistory.js";
import { SONGS } from "./data/songs.js";
import { DISCOGRAPHY } from "./data/discography.js";
import { MEMBERS } from "./data/members.js";
import {
  ANNIVERSARY_CATEGORY_LABELS,
  buildAnniversaryModel,
  groupEventsByCalendarYear,
  isAnniversaryConcert,
  splitPeriodEvents,
  defaultAnniversaryPeriod,
  formatHistoryDate,
  formatPeriodRange,
  relatedTargets,
} from "./anniversaryHistoryModel.js";

const model = buildAnniversaryModel(ANNIVERSARY_PERIODS, ANNIVERSARY_EVENTS);
const knownIds = {
  liveIds: new Set(LIVE_EVENTS.map((live) => live.id)),
  songIds: new Set(SONGS.map((song) => song.id)),
  workIds: new Set(DISCOGRAPHY.map((work) => work.workId ?? work.id)),
  memberIds: new Set(MEMBERS.map((member) => member.id)),
};

let container = null;
let callbacks = {};
let selectedPeriod = defaultAnniversaryPeriod(model);
let cardsElement = null;
let detailElement = null;
let timelineElement = null;
let viewTabs = null;
let view = "period"; // "period"（周年で見る）／"timeline"（年表で見る）
const periodLabelOf = new Map(model.map((entry) => [entry.period, entry.label]));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function buildCards() {
  const list = el("div", "anniv-cards");
  list.setAttribute("role", "tablist");
  model.forEach((entry) => {
    const card = el("button", "anniv-card");
    card.type = "button";
    card.dataset.period = String(entry.period);
    card.setAttribute("role", "tab");
    card.appendChild(el("span", "anniv-card-label", entry.label));
    card.appendChild(el("span", "anniv-card-range", formatPeriodRange(entry)));
    const heads = el("span", "anniv-card-heads");
    entry.headlines.forEach((event) => heads.appendChild(el("span", "anniv-card-head", event.title)));
    card.appendChild(heads);
    card.addEventListener("click", () => select(entry.period, { scroll: true }));
    list.appendChild(card);
  });
  return list;
}

function buildEvent(event, { showPeriod = false } = {}) {
  const item = el("li", `anniv-event is-${event.category}${event.highlight ? " is-highlight" : ""}${isAnniversaryConcert(event) ? " is-anniversary-concert" : ""}`);
  const head = el("div", "anniv-event-head");
  head.appendChild(el("span", "anniv-event-date", formatHistoryDate(event.date)));
  if (showPeriod && periodLabelOf.has(event.period)) head.appendChild(el("span", "anniv-event-period", periodLabelOf.get(event.period)));
  head.appendChild(el("span", "anniv-event-category", ANNIVERSARY_CATEGORY_LABELS[event.category] ?? ""));
  if (event.status === "announced") head.appendChild(el("span", "anniv-event-status", "開催予定"));
  item.appendChild(head);
  item.appendChild(el("p", "anniv-event-title", event.title));
  if (event.description) item.appendChild(el("p", "anniv-event-description", event.description));
  const links = relatedTargets(event, knownIds);
  if (links.length) {
    const row = el("div", "anniv-event-links");
    links.forEach((target) => {
      const button = el("button", "anniv-event-link", `${target.label}へ →`);
      button.type = "button";
      button.addEventListener("click", () => callbacks.onOpenTarget?.(target));
      row.appendChild(button);
    });
    item.appendChild(row);
  }
  if (event.sources?.length) {
    const sources = el("p", "anniv-event-sources");
    sources.appendChild(document.createTextNode(event.confidence === "準確認" ? "出典（報道1件）：" : "出典："));
    event.sources.forEach((source, index) => {
      if (index) sources.appendChild(document.createTextNode("・"));
      const link = el("a", null, source.label || source.type);
      link.href = source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      sources.appendChild(link);
    });
    item.appendChild(sources);
  }
  return item;
}

function renderDetail() {
  detailElement.innerHTML = "";
  const entry = model.find((item) => item.period === selectedPeriod);
  if (!entry) return;
  const title = el("h3", "anniv-detail-title", entry.label);
  detailElement.appendChild(title);
  const range = formatPeriodRange(entry);
  const venue = entry.anniversaryVenue ? `（周年記念公演：${entry.anniversaryVenue}）` : "";
  if (range || venue) detailElement.appendChild(el("p", "anniv-detail-range", `${range}${venue}`));
  const { concerts, highlights, others } = splitPeriodEvents(entry);
  // ① 周年記念公演（その周年の締めくくり）と、② その1年に起きた出来事を分けて見せる
  if (concerts.length) {
    const box = el("section", "anniv-concert-box");
    box.appendChild(el("h4", "anniv-section-title", entry.period === 10 ? "🎉 これからの公演" : `🎉 ${entry.label}の記念公演`));
    const list = el("ol", "anniv-event-list");
    concerts.forEach((event) => list.appendChild(buildEvent(event)));
    box.appendChild(list);
    detailElement.appendChild(box);
  }
  if (highlights.length || others.length) {
    detailElement.appendChild(el("h4", "anniv-section-title", entry.period === 0 ? "おもな出来事" : "この1年のおもな出来事"));
    const first = highlights.length ? highlights : others.slice(0, 2);
    const rest = highlights.length ? others : others.slice(2);
    const list = el("ol", "anniv-event-list");
    first.forEach((event) => list.appendChild(buildEvent(event)));
    detailElement.appendChild(list);
    if (rest.length) {
      const more = el("button", "anniv-more-button", `もっと見る（あと${rest.length}件）`);
      more.type = "button";
      const restList = el("ol", "anniv-event-list anniv-rest-list");
      restList.hidden = true;
      rest.forEach((event) => restList.appendChild(buildEvent(event)));
      more.addEventListener("click", () => {
        restList.hidden = !restList.hidden;
        more.textContent = restList.hidden ? `もっと見る（あと${rest.length}件）` : "閉じる";
      });
      detailElement.append(more, restList);
    }
  }
}

// 年表で見る：暦の年ごとに、全部の出来事を古い順に（どの周年の出来事かの札つき）
function renderTimeline() {
  timelineElement.innerHTML = "";
  groupEventsByCalendarYear(model.flatMap((entry) => entry.events)).forEach((group) => {
    timelineElement.appendChild(el("h3", "tv-year-heading", `${group.year}年`));
    const list = el("ol", "anniv-event-list");
    group.events.forEach((event) => list.appendChild(buildEvent(event, { showPeriod: true })));
    timelineElement.appendChild(list);
  });
}

function setView(next) {
  view = next;
  viewTabs.querySelectorAll(".tv-chip").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
  cardsElement.hidden = view !== "period";
  detailElement.hidden = view !== "period";
  timelineElement.hidden = view !== "timeline";
  if (view === "timeline" && !timelineElement.childElementCount) renderTimeline();
}

function select(period, { scroll = false } = {}) {
  selectedPeriod = period;
  cardsElement.querySelectorAll(".anniv-card").forEach((card) => {
    const active = card.dataset.period === String(period);
    card.classList.toggle("is-active", active);
    card.setAttribute("aria-selected", active ? "true" : "false");
    if (active) card.scrollIntoView({ block: "nearest", inline: "center" });
  });
  renderDetail();
  if (scroll) detailElement.scrollIntoView({ block: "start", behavior: "smooth" });
}

// options.period：最初に開く周年（省略すると、いちばん新しい周年）
export function openAnniversaryScreen(options = {}) {
  if (!container) return;
  if (!cardsElement) {
    container.innerHTML = "";
    container.appendChild(el("p", "anniv-intro", "デビューから今までを、周年ごとに振り返れます。周年を選ぶと、その1年の大きな出来事が出ます（「N周年」＝前の周年記念公演の翌日から、N周年記念公演まで）。"));
    viewTabs = el("div", "tv-chips anniv-view-tabs");
    [["period", "周年で見る"], ["timeline", "年表で見る"]].forEach(([id, label]) => {
      const tab = el("button", `tv-chip${id === view ? " is-active" : ""}`, label);
      tab.type = "button";
      tab.dataset.view = id;
      tab.addEventListener("click", () => setView(id));
      viewTabs.appendChild(tab);
    });
    cardsElement = buildCards();
    detailElement = el("div", "anniv-detail");
    timelineElement = el("div", "anniv-timeline");
    timelineElement.hidden = true;
    container.append(viewTabs, cardsElement, detailElement, timelineElement);
    container.appendChild(el("p", "anniv-note", "公式サイト・放送局・報道で確認できた出来事だけを載せています。"));
  }
  if (Number.isInteger(options.period)) setView("period");
  select(Number.isInteger(options.period) ? options.period : selectedPeriod);
}

// elements: { container }。options.onOpenTarget(target)：{ kind: "live"|"song"|"work"|"member"|"tv", ... }
export function initAnniversaryScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onOpenTarget: options.onOpenTarget ?? null };
}
