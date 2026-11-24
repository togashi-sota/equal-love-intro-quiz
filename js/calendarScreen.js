// 「＝LOVEカレンダー」の画面（2026-11-24新設）。月のカレンダー（月曜はじまり）＋選んだ日の予定。
// データは js/calendarData.js、決まりは js/calendarModel.js。外から来た文字は textContent でだけ入れる（HTML として入れない）。
// マスには色の点だけ（広い画面では件数も）。予定の名前は、日付を押したときの一覧で読む（css/calendar.css）。
import { CALENDAR_STATE, getCalendarSnapshot, loadCalendarData, onCalendarDataChange } from "./calendarData.js";
import { SCHEDULE_EARLIEST_MONTH, addMonths, parseMonthKey } from "./calendarCore.js";
import {
  CATEGORY_FILTERS,
  buildMonthGrid,
  categoryShort,
  coverageOf,
  describeMembers,
  describeTime,
  eventAppLinks,
  eventBadges,
  eventsOnDate,
  formatDateJa,
  formatMonthJa,
  isMonthCovered,
  japanToday,
  memberOptions,
} from "./calendarModel.js";

const OFFICIAL_SCHEDULE_URL = "https://equal-love.jp/schedule/";
const WEEK_HEAD = ["月", "火", "水", "木", "金", "土", "日"];
const MAX_DOTS = 4;

let elements = null;
let options = {};
let nowProvider = () => new Date();
let unsubscribe = null;
const state = { monthKey: null, selectedDate: null, category: "all", member: "all" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function today() {
  return japanToday(nowProvider());
}

function formatUpdated(iso) {
  const time = Date.parse(iso ?? "");
  if (!Number.isFinite(time)) return null;
  const date = new Date(time + 9 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

// ---- 上の案内（最終更新・収録の範囲・止まっているとき） ----
function renderStatus(snapshot) {
  const box = el("div", "cal-status");
  const lines = [];
  if (snapshot.state === CALENDAR_STATE.LOADING || snapshot.state === CALENDAR_STATE.IDLE) {
    lines.push(["読み込んでいます…", false]);
  } else if (snapshot.state === CALENDAR_STATE.READY || snapshot.state === CALENDAR_STATE.STALE) {
    const updated = formatUpdated(snapshot.fetchedAt);
    const coverage = coverageOf(snapshot.months);
    lines.push([`最終更新：${updated ?? "不明"}${coverage ? `　収録：${formatMonthJa(coverage.from)}〜${formatMonthJa(coverage.to)}` : ""}`, false]);
    if (snapshot.source === "seed") lines.push(["毎日の自動取得のデータがまだ無いため、収録済みの分を出しています。", true]);
    else if (snapshot.lastAttempt && snapshot.lastAttempt.ok === false) lines.push(["最新情報を取得できませんでした。最終更新の時点の情報です。", true]);
    if (snapshot.state === CALENDAR_STATE.STALE) lines.push(["自動の更新が止まっています。最新の予定は公式サイトで確かめてください。", true]);
  } else {
    lines.push(["予定のデータを読み込めませんでした。公式サイトの SCHEDULE を見てください。", true]);
  }
  lines.forEach(([text, warn]) => box.appendChild(el("p", warn ? "cal-status-warn" : "cal-status-line", text)));
  return box;
}

// ---- 月の切り替え（前・年月を選ぶ・次・今日） ----
function renderNav(coverage) {
  const nav = el("div", "cal-nav");
  const prev = el("button", "cal-nav-arrow", "‹");
  prev.type = "button";
  prev.setAttribute("aria-label", "前の月");
  prev.disabled = state.monthKey <= SCHEDULE_EARLIEST_MONTH;
  prev.addEventListener("click", () => moveMonth(-1));

  const picker = el("div", "cal-month-picker");
  const { year, month } = parseMonthKey(state.monthKey);
  const lastYear = Math.max(Number((coverage?.to ?? state.monthKey).slice(0, 4)), Number(today().slice(0, 4)) + 1);
  const yearSelect = el("select", "cal-select cal-year");
  yearSelect.setAttribute("aria-label", "年");
  for (let value = Number(SCHEDULE_EARLIEST_MONTH.slice(0, 4)); value <= lastYear; value += 1) {
    const option = el("option", null, String(value));
    option.value = String(value);
    option.selected = value === year;
    yearSelect.appendChild(option);
  }
  const monthSelect = el("select", "cal-select cal-month");
  monthSelect.setAttribute("aria-label", "月");
  for (let value = 1; value <= 12; value += 1) {
    const option = el("option", null, String(value));
    option.value = String(value);
    option.selected = value === month;
    monthSelect.appendChild(option);
  }
  const jump = () => {
    let key = `${yearSelect.value}-${String(monthSelect.value).padStart(2, "0")}`;
    if (key < SCHEDULE_EARLIEST_MONTH) key = SCHEDULE_EARLIEST_MONTH;
    setMonth(key);
  };
  yearSelect.addEventListener("change", jump);
  monthSelect.addEventListener("change", jump);
  const yearLabel = el("label");
  yearLabel.append(yearSelect, el("span", null, "年"));
  const monthLabel = el("label");
  monthLabel.append(monthSelect, el("span", null, "月"));
  picker.append(yearLabel, monthLabel);

  const next = el("button", "cal-nav-arrow", "›");
  next.type = "button";
  next.setAttribute("aria-label", "次の月");
  next.addEventListener("click", () => moveMonth(1));

  const todayButton = el("button", "cal-today-button", "今日");
  todayButton.type = "button";
  todayButton.addEventListener("click", () => {
    state.monthKey = today().slice(0, 7);
    state.selectedDate = today();
    render();
  });
  nav.append(prev, picker, next, todayButton);
  return nav;
}

// ---- 絞り込み ----
function renderFilters() {
  const box = el("div", "cal-filters");
  const chips = el("div", "cal-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "種類で絞り込む");
  CATEGORY_FILTERS.forEach((filter) => {
    const chip = el("button", "cal-chip", filter.label);
    chip.type = "button";
    chip.dataset.cat = filter.key;
    chip.setAttribute("aria-pressed", String(state.category === filter.key));
    chip.addEventListener("click", () => {
      state.category = filter.key;
      render();
    });
    chips.appendChild(chip);
  });
  const memberSelect = el("select", "cal-select cal-member");
  memberSelect.setAttribute("aria-label", "メンバーで絞り込む");
  memberOptions().forEach((item) => {
    const option = el("option", null, item.label);
    option.value = item.value;
    option.selected = item.value === state.member;
    memberSelect.appendChild(option);
  });
  memberSelect.addEventListener("change", () => {
    state.member = memberSelect.value;
    render();
  });
  box.append(chips, memberSelect);
  return box;
}

// ---- 月のカレンダー ----
function renderGrid(snapshot) {
  const filter = { category: state.category, member: state.member };
  const grid = el("div", "cal-grid");
  const head = el("div", "cal-week cal-week-head");
  WEEK_HEAD.forEach((label, index) => head.appendChild(el("div", `cal-head-cell${index === 5 ? " is-sat" : index === 6 ? " is-sun" : ""}`, label)));
  grid.appendChild(head);
  const todayText = today();
  for (const week of buildMonthGrid(state.monthKey)) {
    const row = el("div", "cal-week");
    week.forEach((cell, index) => {
      if (!cell.date) {
        row.appendChild(el("div", "cal-cell is-blank"));
        return;
      }
      const events = eventsOnDate(snapshot.events, cell.date, filter);
      const button = el("button", "cal-cell");
      button.type = "button";
      button.dataset.date = cell.date;
      if (index === 5) button.classList.add("is-sat");
      if (index === 6) button.classList.add("is-sun");
      if (cell.date === todayText) button.classList.add("is-today");
      if (cell.date < todayText) button.classList.add("is-past");
      if (events.length) button.classList.add("has-events");
      button.setAttribute("aria-pressed", String(cell.date === state.selectedDate));
      button.setAttribute("aria-label", `${formatDateJa(cell.date)}${cell.date === todayText ? "（今日）" : ""} 予定${events.length}件`);
      button.appendChild(el("span", "cal-day-number", String(cell.day)));
      if (events.length) {
        const dots = el("span", "cal-dots");
        dots.setAttribute("aria-hidden", "true");
        events.slice(0, MAX_DOTS).forEach((event) => {
          const dot = el("span", "cal-dot");
          dot.dataset.cat = event.category;
          dots.appendChild(dot);
        });
        if (events.length > MAX_DOTS) dots.appendChild(el("span", "cal-more", `+${events.length - MAX_DOTS}`));
        button.appendChild(dots);
        // 広い画面だけ見える件数（CSS で出し分ける）
        const count = el("span", "cal-count", `${events.length}件`);
        count.setAttribute("aria-hidden", "true");
        button.appendChild(count);
      }
      button.addEventListener("click", () => {
        state.selectedDate = cell.date;
        render({ keepScroll: true });
        elements.container.querySelector(".cal-day")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
      row.appendChild(button);
    });
    grid.appendChild(row);
  }
  return grid;
}

// ---- 選んだ日の予定 ----
function renderEventCard(event, date) {
  const card = el("article", "cal-event");
  card.dataset.cat = event.category;
  const head = el("div", "cal-event-head");
  const cat = el("span", "cal-event-cat", categoryShort(event.category));
  cat.dataset.cat = event.category;
  head.appendChild(cat);
  eventBadges(event, today()).forEach((badge) => {
    const node = el("span", `cal-badge is-${badge.key}`, badge.label);
    head.appendChild(node);
  });
  card.appendChild(head);
  card.appendChild(el("p", "cal-event-title", event.title));

  const rows = [];
  const time = describeTime(event, date);
  if (time) rows.push(["時間", time]);
  if (event.detail?.station) rows.push(["放送・配信", event.detail.station]);
  if (event.detail?.venue) rows.push(["会場", event.detail.venue]);
  if (event.detail?.performers) rows.push(["出演", event.detail.performers]);
  else {
    const members = describeMembers(event);
    if (members) rows.push(["関連メンバー", members]);
  }
  if (event.dates.length > 1) rows.push(["日程", event.dates.map((d) => formatDateJa(d)).join("・")]);
  if (rows.length) {
    const list = el("dl", "cal-event-info");
    rows.forEach(([label, value]) => {
      list.append(el("dt", null, label), el("dd", null, value));
    });
    card.appendChild(list);
  }
  if (event.missing) card.appendChild(el("p", "cal-event-note", "公式の予定表から見えなくなりました（中止とは限りません）。公式サイトで確かめてください。"));
  if (event.pendingReason) card.appendChild(el("p", "cal-event-note", "公式の表示に食い違いがあるため、確認待ちです。日付は公式サイトで確かめてください。"));

  const links = el("div", "cal-event-links");
  const official = el("a", "cal-link-official", "公式サイトで見る");
  official.href = event.url;
  official.target = "_blank";
  official.rel = "noopener noreferrer";
  links.appendChild(official);
  eventAppLinks(event).forEach((link) => {
    const button = el("button", "cal-link-app", link.label);
    button.type = "button";
    button.addEventListener("click", () => options.onOpenTarget?.(link.target));
    links.appendChild(button);
  });
  card.appendChild(links);
  return card;
}

function renderDay(snapshot) {
  const section = el("section", "cal-day");
  section.setAttribute("aria-live", "polite");
  const date = state.selectedDate;
  if (!date || !date.startsWith(state.monthKey)) {
    section.appendChild(el("p", "cal-empty", "日付を押すと、その日の予定が出ます。"));
    return section;
  }
  const heading = el("h3", "cal-day-title", formatDateJa(date, { withYear: true }));
  if (date === today()) heading.appendChild(el("span", "cal-today-tag", "今日"));
  section.appendChild(heading);
  const events = eventsOnDate(snapshot.events, date, { category: state.category, member: state.member });
  if (!isMonthCovered(snapshot.months, state.monthKey)) {
    section.appendChild(el("p", "cal-empty", "この期間の公式情報は、まだ収録できていません（予定が無かったという意味ではありません）。"));
  } else if (!events.length) {
    const filtered = state.category !== "all" || state.member !== "all";
    section.appendChild(el("p", "cal-empty", filtered ? "この条件に合う予定は、収録されている公式の予定にはありません。" : "収録されている公式の予定はありません。"));
  } else {
    section.appendChild(el("p", "cal-day-count", `${events.length}件`));
    events.forEach((event) => section.appendChild(renderEventCard(event, date)));
  }
  return section;
}

function renderFooter() {
  const footer = el("div", "cal-footer");
  footer.appendChild(el("p", null, "出典：＝LOVE 公式サイトの SCHEDULE（日付・種類・タイトル・時間・出演だけを、毎日自動で取得）。詳しい内容は公式サイトで見てください。"));
  const link = el("a", "cal-link-official", "公式サイトの SCHEDULE を開く");
  link.href = OFFICIAL_SCHEDULE_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  footer.appendChild(link);
  return footer;
}

export function renderCalendar({ keepScroll = false } = {}) {
  if (!elements?.container) return;
  const snapshot = getCalendarSnapshot();
  if (!state.monthKey) state.monthKey = today().slice(0, 7);
  const scrollY = keepScroll ? window.scrollY : null;
  const container = elements.container;
  container.textContent = "";
  container.appendChild(renderStatus(snapshot));
  container.appendChild(renderNav(coverageOf(snapshot.months)));
  container.appendChild(renderFilters());
  const usable = snapshot.state === CALENDAR_STATE.READY || snapshot.state === CALENDAR_STATE.STALE;
  const view = usable ? snapshot : { ...snapshot, events: [], months: {} };
  container.appendChild(renderGrid(view));
  if (usable && !isMonthCovered(snapshot.months, state.monthKey)) container.appendChild(el("p", "cal-coverage-note", "この月の公式情報は、まだ収録できていません。"));
  if (usable) container.appendChild(renderDay(view));
  container.appendChild(renderFooter());
  if (scrollY !== null) window.scrollTo(0, scrollY);
}
const render = renderCalendar;

function setMonth(key) {
  state.monthKey = key;
  // 今日の月なら今日、ほかの月は1日を選ぶ
  state.selectedDate = key === today().slice(0, 7) ? today() : `${key}-01`;
  render({ keepScroll: true });
}

function moveMonth(delta) {
  const key = addMonths(state.monthKey, delta);
  if (key < SCHEDULE_EARLIEST_MONTH) return;
  setMonth(key);
}

// 開く。options：{ date: "YYYY-MM-DD"（その日を選ぶ）, memberId, category, returnScreen }
export function openCalendar({ date = null, memberId = null, category = null, returnScreen = null } = {}) {
  const target = date ?? today();
  state.monthKey = target.slice(0, 7);
  state.selectedDate = target;
  if (memberId) state.member = memberId;
  if (category) state.category = category;
  render();
  options.onShow?.({ returnScreen });
  loadCalendarData();
}

export function initCalendarScreen(screenElements, screenOptions = {}) {
  elements = screenElements;
  options = screenOptions;
  nowProvider = screenOptions.now ?? (() => new Date());
  unsubscribe?.();
  unsubscribe = onCalendarDataChange(() => render({ keepScroll: true }));
}

// テスト用：状態を初めに戻す
export function resetCalendarScreenStateForTest() {
  Object.assign(state, { monthKey: null, selectedDate: null, category: "all", member: "all" });
}
