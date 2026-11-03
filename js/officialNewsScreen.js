// 「＝LOVE 最新情報」の画面（#official-news-screen。2026-11-03新設・R11 D）。
// データは js/officialNewsData.js が data/official-news.json から読む（公式サイトの NEWS のタイトル・発表日・カテゴリ・URL だけ）。
// 表示：発表日・タイトル・カテゴリ・関連メンバー・公式へのリンク・最終取得の日時。メンバー別・カテゴリ別に絞り込める。
// 0件・読み込みの失敗・古いデータでも壊れない（必ず「いまの状態」と公式の NEWS へのリンクを出す）。
// タイトルは外のサイトの文字なので、innerHTML に入れない（textContent だけ）。リンクは公式サイトの記事の URL だけ（データの検査で確かめ済み）。
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import {
  OFFICIAL_NEWS_CATEGORIES,
  OFFICIAL_NEWS_FLAGS,
  OFFICIAL_NEWS_LIST_URL,
  OFFICIAL_NEWS_STATE,
  OFFICIAL_NEWS_STALE_DAYS,
  getOfficialNewsSnapshot,
  loadOfficialNewsData,
  onOfficialNewsDataChange,
} from "./officialNewsData.js";

export const OFFICIAL_NEWS_PAGE_SIZE = 30;
// 「NEW」の札：発表日が今日から数えてこの日数以内
export const OFFICIAL_NEWS_NEW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MEMBER_BY_ID = new Map(MEMBERS.map((member) => [member.id, member]));

// ---- 文字の組み立て（DOM を使わない。テストから呼ぶ） ----
function japanParts(iso) {
  const time = Date.parse(iso ?? "");
  if (!Number.isFinite(time)) return null;
  const japan = new Date(time + 9 * 60 * 60 * 1000);
  return { year: japan.getUTCFullYear(), month: japan.getUTCMonth() + 1, day: japan.getUTCDate(), hour: japan.getUTCHours(), minute: japan.getUTCMinutes() };
}

// 「2026年11月3日 7:55」（日本時間）
export function formatJapanDateTime(iso) {
  const parts = japanParts(iso);
  return parts ? `${parts.year}年${parts.month}月${parts.day}日 ${parts.hour}:${String(parts.minute).padStart(2, "0")}` : "不明";
}

// 「2026.11.03（火）」
export function formatNewsDate(ymd) {
  const time = Date.parse(`${ymd}T00:00:00Z`);
  if (!Number.isFinite(time)) return String(ymd ?? "");
  return `${String(ymd).replace(/-/g, ".")}（${WEEKDAYS[new Date(time).getUTCDay()]}）`;
}

function japanToday(now) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isRecentNews(item, now = new Date()) {
  const today = Date.parse(`${japanToday(now)}T00:00:00Z`);
  const published = Date.parse(`${item?.publishedOn}T00:00:00Z`);
  return Number.isFinite(published) && today - published <= (OFFICIAL_NEWS_NEW_DAYS - 1) * DAY_MS && today >= published;
}

// いまの状態の案内（見出し・説明・注意の度合い）。tone：info／warn／error
export const OFFICIAL_NEWS_SCOPE_NOTE = "公式サイトの NEWS に載った、最近のお知らせ（自動で取得できた範囲）だけを並べています。X だけの発表や、それより前のお知らせは、公式サイト・公式 X で確かめてください。";

export function describeOfficialNewsStatus(snapshot, now = new Date()) {
  const state = snapshot?.state ?? OFFICIAL_NEWS_STATE.IDLE;
  if (state === OFFICIAL_NEWS_STATE.IDLE || state === OFFICIAL_NEWS_STATE.LOADING) return { tone: "info", title: "読み込んでいます…", lines: [], retry: false };
  if (state === OFFICIAL_NEWS_STATE.MISSING)
    return { tone: "info", title: "まだ公式のお知らせを取得できていません", lines: ["自動の取得が動くと、ここに並びます。いちばん新しい情報は、公式サイトの NEWS で確かめてください。"], retry: false };
  if (state === OFFICIAL_NEWS_STATE.ERROR)
    return { tone: "error", title: "最新情報を読み込めませんでした", lines: ["通信の状態を確かめて、もう一度お試しください。公式サイトの NEWS は下のリンクから開けます。"], retry: true };
  if (state === OFFICIAL_NEWS_STATE.INVALID)
    return { tone: "error", title: "最新情報のデータが正しくないため、表示していません", lines: ["次の自動の取得で直ります。いちばん新しい情報は、公式サイトの NEWS で確かめてください。"], retry: true };
  // 【2026-11-03 R11 最終・本人の依頼】取得の範囲を誤解させない（公式サイトの NEWS の最近の分だけ。X だけの発表・古いお知らせは入らない）
  const lines = [`最終取得：${formatJapanDateTime(snapshot.fetchedAt)}`, OFFICIAL_NEWS_SCOPE_NOTE];
  let tone = "info";
  let title = "公式サイトの NEWS から自動で集めています";
  const attempt = snapshot.lastAttempt;
  if (attempt && attempt.ok === false) {
    tone = "warn";
    lines.push(`直近の取得（${formatJapanDateTime(attempt.at)}）に失敗したため、前に取得できた情報を出しています。`);
  }
  if (state === OFFICIAL_NEWS_STATE.STALE) {
    tone = "warn";
    const days = Math.floor(snapshot.ageDays ?? OFFICIAL_NEWS_STALE_DAYS);
    title = "最新情報の更新が止まっています";
    lines.push(`最後の取得から${days}日たっています。そのあとのお知らせは、ここには出ていません。公式サイトの NEWS で確かめてください。`);
  }
  return { tone, title, lines, retry: false };
}

// 関連メンバーの表示の文字（名前の一覧・グループ全体・不明）
export function describeNewsPeople(item) {
  const names = (item?.memberIds ?? []).map((id) => MEMBER_BY_ID.get(id)?.name).filter(Boolean);
  const others = item?.otherGroups ?? [];
  if (names.length) return { kind: "members", text: names.join("・"), others };
  if (item?.scope === "group") return { kind: "group", text: "＝LOVE（グループ）", others };
  return { kind: "unknown", text: "", others };
}

// 絞り込み。memberId：メンバーの id／"group"（グループ全体）／null（全部）。category：キー／null
export function filterOfficialNews(items, { memberId = null, category = null } = {}) {
  return (items ?? []).filter((item) => {
    if (category && item.category !== category) return false;
    if (memberId === "group") return item.scope === "group";
    if (memberId) return item.memberIds.includes(memberId);
    return true;
  });
}

export function countRecentNews(snapshot, now = new Date()) {
  if (snapshot?.state !== OFFICIAL_NEWS_STATE.READY) return 0;
  return snapshot.items.filter((item) => isRecentNews(item, now)).length;
}

// ---- 画面 ----
let elements = null;
let options = {};
let filter = { memberId: null, category: null };
let shownCount = OFFICIAL_NEWS_PAGE_SIZE;
let nowProvider = () => new Date();

function el(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function officialLink(className, label) {
  const link = el("a", className, label);
  link.href = OFFICIAL_NEWS_LIST_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderStatus(snapshot) {
  const status = describeOfficialNewsStatus(snapshot, nowProvider());
  const box = el("div", `onews-status onews-status--${status.tone}`);
  box.setAttribute("role", status.tone === "info" ? "status" : "alert");
  box.append(el("p", "onews-status-title", status.title));
  status.lines.forEach((line) => box.append(el("p", "onews-status-line", line)));
  const actions = el("div", "onews-status-actions");
  if (status.retry) {
    const retry = el("button", "onews-button", "もう一度読み込む");
    retry.type = "button";
    retry.addEventListener("click", () => loadOfficialNewsData({ force: true }));
    actions.append(retry);
  }
  actions.append(officialLink("onews-official-link", "公式サイトの NEWS を開く"));
  box.append(actions);
  return box;
}

function chip(label, pressed, onClick) {
  const button = el("button", "onews-chip", label);
  button.type = "button";
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  button.addEventListener("click", onClick);
  return button;
}

function renderControls(items) {
  const box = el("div", "onews-controls");
  // カテゴリ（件数があるものだけ）
  box.append(el("p", "onews-label", "カテゴリ"));
  const chips = el("div", "onews-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "カテゴリで絞り込む");
  const byMember = filterOfficialNews(items, { memberId: filter.memberId });
  chips.append(chip(`すべて ${byMember.length}`, !filter.category, () => setFilter({ category: null })));
  OFFICIAL_NEWS_CATEGORIES.forEach((category) => {
    const count = byMember.filter((item) => item.category === category.key).length;
    if (count === 0 && filter.category !== category.key) return;
    chips.append(chip(`${category.label} ${count}`, filter.category === category.key, () => setFilter({ category: category.key })));
  });
  box.append(chips);
  // メンバー（現役の出席番号順。卒業メンバーは記事があるときだけ）
  const label = el("label", "onews-label", "メンバー");
  label.htmlFor = "onews-member-select";
  const select = el("select", "onews-select");
  select.id = "onews-member-select";
  const option = (value, text) => {
    const element = el("option", null, text);
    element.value = value;
    element.selected = (filter.memberId ?? "") === value;
    return element;
  };
  select.append(option("", "全員（絞り込まない）"), option("group", "＝LOVE（グループ全体の発表）"));
  MEMBERS.filter((member) => member.status === MEMBER_STATUS.ACTIVE || items.some((item) => item.memberIds.includes(member.id))).forEach((member) => {
    const count = items.filter((item) => item.memberIds.includes(member.id)).length;
    select.append(option(member.id, `${member.name}（${count}件）`));
  });
  select.addEventListener("change", () => setFilter({ memberId: select.value || null }));
  box.append(label, select);
  return box;
}

function renderItem(item, now) {
  const li = el("li", "onews-item");
  const meta = el("p", "onews-item-meta");
  const time = el("time", "onews-date", formatNewsDate(item.publishedOn));
  time.dateTime = item.publishedOn;
  meta.append(time, el("span", `onews-cat onews-cat--${item.category}`, item.categoryLabel));
  if (isRecentNews(item, now)) meta.append(el("span", "onews-new", "NEW"));
  item.flags.forEach((flag) => meta.append(el("span", "onews-flag", OFFICIAL_NEWS_FLAGS[flag] ?? flag)));
  li.append(meta);
  const link = el("a", "onews-item-title", item.title);
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.append(el("span", "onews-ext", " ↗"));
  link.setAttribute("aria-label", `${item.title}（公式サイトの記事を新しいタブで開く）`);
  li.append(link);
  const people = describeNewsPeople(item);
  if (people.kind !== "unknown" || people.others.length) {
    const line = el("p", "onews-item-people");
    if (people.kind === "members") {
      item.memberIds.forEach((id) => {
        const member = MEMBER_BY_ID.get(id);
        if (!member) return;
        const tag = el("span", "onews-member", member.name);
        tag.style.setProperty("--onews-member-color", member.memberColor?.hex ?? "#ccc");
        line.append(tag);
      });
    } else if (people.kind === "group") line.append(el("span", "onews-group", people.text));
    if (people.others.length) line.append(el("span", "onews-others", `${people.others.join("・")} も`));
    li.append(line);
  }
  if (item.missingFromList) li.append(el("p", "onews-item-note", "公式の一覧で見当たらなくなりました（削除・差し替えの可能性）。リンクが開けないことがあります。"));
  else if (item.titleRevised) li.append(el("p", "onews-item-note", "公式の表示が前と変わったため、今の表示に合わせました。"));
  return li;
}

function renderCandidates(candidates) {
  const details = el("details", "onews-candidates");
  details.append(el("summary", "onews-candidates-summary", `確認待ち：アプリの CD・特典映像図鑑にまだ無い公式の作品（${candidates.length}件）`));
  details.append(el("p", "onews-candidates-note", "公式サイトの DISCOGRAPHY で見つけた作品です。作品名・種類・発売日は公式の表示のまま。図鑑には、収録内容を確かめてから手で足します（自動では足しません）。"));
  const list = el("ul", "onews-candidates-list");
  candidates.forEach((candidate) => {
    const li = el("li", "onews-candidate");
    li.append(el("span", "onews-candidate-date", candidate.releaseOn ? `${formatNewsDate(candidate.releaseOn)} 発売` : "発売日は未確認"));
    if (candidate.workKind) li.append(el("span", "onews-cat", candidate.workKind));
    const link = el("a", "onews-candidate-title", candidate.title);
    link.href = candidate.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    li.append(link);
    list.append(li);
  });
  details.append(list);
  return details;
}

export function renderOfficialNews() {
  if (!elements?.container) return;
  const container = elements.container;
  const snapshot = getOfficialNewsSnapshot();
  const now = nowProvider();
  container.replaceChildren();
  container.append(renderStatus(snapshot));
  const hasItems = (snapshot.state === OFFICIAL_NEWS_STATE.READY || snapshot.state === OFFICIAL_NEWS_STATE.STALE) && snapshot.items.length > 0;
  if (hasItems) {
    container.append(renderControls(snapshot.items));
    const filtered = filterOfficialNews(snapshot.items, filter);
    const count = el("p", "onews-count", filtered.length === snapshot.items.length ? `${filtered.length}件（新しい順）` : `${filtered.length}件（全${snapshot.items.length}件のうち）`);
    count.setAttribute("aria-live", "polite");
    container.append(count);
    if (filtered.length === 0) {
      const empty = el("div", "onews-empty");
      empty.append(el("p", null, "この条件のお知らせはありません。"));
      const reset = el("button", "onews-button", "絞り込みをやめる");
      reset.type = "button";
      reset.addEventListener("click", () => setFilter({ memberId: null, category: null }));
      empty.append(reset);
      container.append(empty);
    } else {
      const list = el("ol", "onews-list");
      filtered.slice(0, shownCount).forEach((item) => list.append(renderItem(item, now)));
      container.append(list);
      if (filtered.length > shownCount) {
        const more = el("button", "onews-button onews-more", `もっと見る（あと${filtered.length - shownCount}件）`);
        more.type = "button";
        more.addEventListener("click", () => {
          shownCount += OFFICIAL_NEWS_PAGE_SIZE;
          renderOfficialNews();
        });
        container.append(more);
      }
    }
  } else if (snapshot.state === OFFICIAL_NEWS_STATE.READY || snapshot.state === OFFICIAL_NEWS_STATE.STALE) {
    container.append(el("p", "onews-empty", "取得できたお知らせは、まだ0件です。"));
  }
  if (hasItems && snapshot.candidates?.length) container.append(renderCandidates(snapshot.candidates));
  const note = el("p", "onews-note");
  note.textContent =
    "タイトル・発表日・カテゴリは、公式サイトの NEWS の一覧の表示のままです（本文・画像はアプリに保存しません）。関連メンバーは、タイトルに名前があるメンバーを自動で選んでいるため、出演者の全員とは限りません。詳しい内容は、必ず公式サイトの記事で確かめてください。";
  container.append(note);
}

function setFilter(next) {
  filter = { ...filter, ...next };
  shownCount = OFFICIAL_NEWS_PAGE_SIZE;
  renderOfficialNews();
}

export function getOfficialNewsFilterState() {
  return { ...filter, shownCount };
}

// 画面を開く。memberId・category で絞り込んだ状態から始められる（質問AI・個人ページから開くとき用）
export function openOfficialNews(openOptions = {}) {
  filter = { memberId: openOptions.memberId ?? null, category: openOptions.category ?? null };
  shownCount = OFFICIAL_NEWS_PAGE_SIZE;
  const snapshot = getOfficialNewsSnapshot();
  if (snapshot.state === OFFICIAL_NEWS_STATE.IDLE || snapshot.state === OFFICIAL_NEWS_STATE.ERROR) loadOfficialNewsData();
  renderOfficialNews();
  options.onShow?.({ returnScreen: openOptions.returnScreen ?? "start" });
}

let unsubscribe = null;
export function initOfficialNewsScreen(screenElements, screenOptions = {}) {
  elements = screenElements;
  options = screenOptions;
  nowProvider = screenOptions.now ?? (() => new Date());
  unsubscribe?.();
  // データが届いたら描き直す（画面を開いていないときも、次に開いたときのために描いておく）
  unsubscribe = onOfficialNewsDataChange(() => renderOfficialNews());
  renderOfficialNews();
}
