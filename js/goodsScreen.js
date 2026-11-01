// 「歴代グッズ図鑑」のページ（一覧 #goods-screen・詳細 #goods-detail-screen。2026-11-01新設・本人の決定「投稿カードの形」）。
// ・一覧：カテゴリのタブ（生写真／証明写真／4カット／アクリル・その他／ライブ・周年）・年・メンバー（分かる商品だけ）・
//   検索（商品名・衣装名）。カードは文字だけ（衣装名・年月・種類の数）。画像は出さない
// ・詳細：情報の表・［公式 X の投稿を表示］（押したときだけ X の正式な埋め込みを読み込む）・［公式ショップで見る］・注記
// 画像はアプリで持たない（js/goodsEmbed.js の説明を参照）。文字の情報は js/data/goods.js（事実だけを自分の言葉で）。
import { GOODS_ITEMS, GOODS_CHECKED_DATE } from "./data/goods.js";
import { MEMBERS } from "./data/members.js";
import {
  GOODS_CATEGORIES,
  GOODS_DEFAULT_FILTER,
  GOODS_SHOP_TOP_URL,
  availableGoodsYears,
  buildGoodsInfoRows,
  countGoodsByCategory,
  filterGoods,
  formatGoodsKinds,
  formatGoodsPeriod,
  goodsCategoryLabel,
  goodsMemberIds,
  groupGoodsByYear,
  isDefaultGoodsFilter,
  isOfficialPeriod,
} from "./goodsModel.js";
import { embedGoodsPost, describeGoodsEmbedFailure } from "./goodsEmbed.js";

export const GOODS_RIGHTS_NOTE = "画像は公式 X の投稿を表示しています。権利は各権利者に帰属します";
// 1つの年で最初に出す件数（生写真は1年に30件を超える年があるので、iPhone で長くなりすぎないように）
export const GOODS_YEAR_PAGE_SIZE = 24;

let listContainer = null;
let detailContainer = null;
let callbacks = {};
let resultsElement = null;
let countElement = null;
let resetButton = null;
let yearSelect = null;
let memberSelect = null;
let memberRow = null;
let categoryLead = null;
const tabButtons = new Map();
let searchInput = null;
const state = { ...GOODS_DEFAULT_FILTER };
let shownByYear = new Map();
const itemById = new Map(GOODS_ITEMS.map((item) => [item.id, item]));

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function formatCheckedDate(text) {
  const [year, month, day] = String(text ?? "").split("-").map(Number);
  return year ? `${year}年${month}月${day}日` : "";
}

// 外へ出るリンク（新しいタブ。iPhone のホーム画面のアプリでは Safari で開く）。外へ出ることが分かる印は SVG
function buildExternalLink(className, text, href, ariaLabel) {
  const link = el("a", className);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (ariaLabel) link.setAttribute("aria-label", ariaLabel);
  link.appendChild(el("span", null, text));
  const svgNs = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNs, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("class", "gds-external-icon");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5");
  icon.appendChild(path);
  link.appendChild(icon);
  return link;
}

// ===== 一覧 =====

function buildCard(item) {
  const li = el("li", "gds-item");
  const card = el("button", "gds-card");
  card.type = "button";
  card.dataset.id = item.id;
  card.dataset.category = item.category;
  const title = item.series || item.name;
  // 2行目：衣装名が題名のときは商品の名前。衣装名が無い品（証明写真・ライブグッズなど）は販売のイベント
  const subtitle = item.series ? item.name : item.event || "";
  card.appendChild(el("span", "gds-card-title", title));
  if (subtitle) card.appendChild(el("span", "gds-card-name", subtitle));
  const meta = el("span", "gds-card-meta");
  const period = el("span", "gds-card-period", formatGoodsPeriod(item));
  meta.appendChild(period);
  if (!isOfficialPeriod(item)) meta.appendChild(el("span", "gds-tag is-estimate", "時期は推測"));
  const kinds = formatGoodsKinds(item);
  if (kinds !== "未確認") meta.appendChild(el("span", "gds-card-kinds", kinds));
  if (item.xPostUrl) meta.appendChild(el("span", "gds-tag is-x", "公式 X の投稿あり"));
  if (item.newsUrl && !item.shopUrl) meta.appendChild(el("span", "gds-tag", "公式サイトのお知らせ"));
  card.appendChild(meta);
  // 読み上げ：カテゴリと時期まで1回で伝える
  card.setAttribute(
    "aria-label",
    `${title}${subtitle ? `、${subtitle}` : ""}、${formatGoodsPeriod(item)}${isOfficialPeriod(item) ? "" : "（時期は推測）"}${kinds !== "未確認" ? `、${kinds}` : ""}${item.xPostUrl ? "、公式 X の投稿あり" : ""}。詳しく見る`
  );
  card.addEventListener("click", () => callbacks.onOpenDetail?.(item.id));
  li.appendChild(card);
  return li;
}

function renderResults() {
  const filtered = filterGoods(GOODS_ITEMS, state);
  const searching = Boolean(state.query.trim());
  const totalInCategory = GOODS_ITEMS.filter((item) => item.category === state.category).length;
  countElement.textContent = searching
    ? `全カテゴリから ${filtered.length}件`
    : isDefaultGoodsFilter(state)
      ? `${goodsCategoryLabel(state.category)} 全${totalInCategory}件`
      : `${filtered.length}件（${goodsCategoryLabel(state.category)} 全${totalInCategory}件中）`;
  resetButton.hidden = isDefaultGoodsFilter(state);
  resultsElement.replaceChildren();
  if (!filtered.length) {
    resultsElement.appendChild(el("p", "gds-empty", "この条件のグッズは見つかりませんでした。言葉を短くするか、［条件を戻す］を押してください。"));
    return;
  }
  groupGoodsByYear(filtered).forEach((group) => {
    const section = el("section", "gds-year");
    section.dataset.year = group.year;
    const heading = el("h3", "gds-year-heading");
    heading.append(el("span", "gds-year-label", group.year === "不明" ? "時期不明" : `${group.year}年`), el("span", "gds-year-count", `${group.items.length}件`));
    section.appendChild(heading);
    const list = el("ul", "gds-list");
    const shown = shownByYear.get(group.year) ?? GOODS_YEAR_PAGE_SIZE;
    group.items.slice(0, shown).forEach((item) => list.appendChild(buildCard(item)));
    section.appendChild(list);
    const rest = group.items.length - shown;
    if (rest > 0) {
      const more = el("button", "gds-more", `${group.year}年のあと${rest}件を見る`);
      more.type = "button";
      more.addEventListener("click", () => {
        shownByYear.set(group.year, shown + GOODS_YEAR_PAGE_SIZE);
        const firstNew = group.items[shown]?.id;
        renderResults();
        const next = resultsElement.querySelector(`.gds-card[data-id="${firstNew}"]`);
        next?.focus({ preventScroll: true });
      });
      section.appendChild(more);
    }
    resultsElement.appendChild(section);
  });
}

function fillYearOptions() {
  const years = availableGoodsYears(GOODS_ITEMS, state.query.trim() ? "all" : state.category);
  if (state.year !== "all" && !years.includes(state.year)) state.year = "all";
  yearSelect.replaceChildren();
  [["all", "すべての年"], ...years.map((year) => [year, `${year}年`])].forEach(([value, text]) => {
    const option = el("option", null, text);
    option.value = value;
    yearSelect.appendChild(option);
  });
  yearSelect.value = state.year;
}

// メンバーの絞り込みは、メンバーが分かる商品（生誕記念など）があるカテゴリだけに出す
function fillMemberOptions() {
  const scope = state.query.trim() ? GOODS_ITEMS : GOODS_ITEMS.filter((item) => item.category === state.category);
  const ids = new Set(goodsMemberIds(scope));
  const members = MEMBERS.filter((member) => ids.has(member.id));
  memberRow.hidden = members.length === 0;
  if (!members.some((member) => member.id === state.memberId)) state.memberId = "all";
  memberSelect.replaceChildren();
  [["all", "メンバー：指定なし"], ...members.map((member) => [member.id, member.name])].forEach(([value, text]) => {
    const option = el("option", null, text);
    option.value = value;
    memberSelect.appendChild(option);
  });
  memberSelect.value = state.memberId;
}

function syncControls() {
  searchInput.value = state.query;
  tabButtons.forEach((button, id) => {
    const active = id === state.category;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const category = GOODS_CATEGORIES.find((entry) => entry.id === state.category);
  categoryLead.textContent = state.query.trim() ? "検索中は、すべてのカテゴリから探します" : category?.lead ?? "";
  fillYearOptions();
  fillMemberOptions();
}

function update() {
  shownByYear = new Map();
  syncControls();
  renderResults();
}

function buildTabs() {
  const counts = countGoodsByCategory(GOODS_ITEMS);
  const tabs = el("div", "gds-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "グッズのカテゴリ");
  GOODS_CATEGORIES.forEach((category, index) => {
    const button = el("button", "gds-tab");
    button.type = "button";
    button.id = `goods-tab-${category.id}`;
    button.dataset.category = category.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "goods-results");
    button.append(el("span", "gds-tab-label", category.label), el("span", "gds-tab-count", `${counts[category.id]}`));
    button.setAttribute("aria-label", `${category.label}（${counts[category.id]}件）`);
    button.addEventListener("click", () => {
      state.category = category.id;
      state.query = "";
      state.year = "all";
      update();
    });
    // 左右の矢印キーでタブを移る（タブの一般的な動き）
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = GOODS_CATEGORIES[(index + (event.key === "ArrowRight" ? 1 : GOODS_CATEGORIES.length - 1)) % GOODS_CATEGORIES.length];
      tabButtons.get(next.id).focus();
      tabButtons.get(next.id).click();
    });
    tabButtons.set(category.id, button);
    tabs.appendChild(button);
  });
  return tabs;
}

function buildControls() {
  const box = el("div", "gds-controls");
  searchInput = el("input", "gds-search");
  searchInput.type = "search";
  searchInput.placeholder = window.innerWidth < 360 ? "商品名・衣装名で探す" : "商品名・衣装名で探す（例：劇薬中毒）";
  searchInput.setAttribute("aria-label", "商品名・衣装名で探す");
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    update();
  });
  box.appendChild(searchInput);

  const row = el("div", "gds-select-row");
  yearSelect = el("select", "gds-select");
  yearSelect.setAttribute("aria-label", "年で絞り込む");
  yearSelect.addEventListener("change", () => {
    state.year = yearSelect.value;
    update();
  });
  memberRow = el("div", "gds-member-row");
  memberSelect = el("select", "gds-select");
  memberSelect.setAttribute("aria-label", "メンバーで絞り込む（メンバーが分かる商品だけ）");
  memberSelect.addEventListener("change", () => {
    state.memberId = memberSelect.value;
    update();
  });
  memberRow.appendChild(memberSelect);
  row.append(yearSelect, memberRow);
  box.appendChild(row);

  const countRow = el("div", "gds-count-row");
  countElement = el("p", "gds-count");
  countElement.setAttribute("aria-live", "polite");
  resetButton = el("button", "gds-reset", "条件を戻す");
  resetButton.type = "button";
  resetButton.addEventListener("click", () => {
    state.year = "all";
    state.memberId = "all";
    state.query = "";
    update();
  });
  countRow.append(countElement, resetButton);
  box.appendChild(countRow);
  return box;
}

function buildListPage() {
  listContainer.replaceChildren();
  listContainer.appendChild(el("p", "gds-intro", "＝LOVE の公式グッズを、カテゴリと年で振り返る図鑑です（新しい順）。押すと、公式 X の告知の投稿（画像）と公式ショップのページを開けます。"));
  listContainer.appendChild(buildTabs());
  categoryLead = el("p", "gds-category-lead");
  listContainer.appendChild(categoryLead);
  listContainer.appendChild(buildControls());
  resultsElement = el("div", "gds-results");
  resultsElement.id = "goods-results";
  resultsElement.setAttribute("role", "tabpanel");
  listContainer.appendChild(resultsElement);
  const note = el("div", "gds-footnote");
  note.appendChild(el("p", null, `${GOODS_RIGHTS_NOTE}。`));
  note.appendChild(
    el(
      "p",
      null,
      `一覧の文字は、＝LOVE OFFICIAL SHOP・＝LOVE 公式サイトの記載を見て、事実だけを短くまとめたものです（${formatCheckedDate(GOODS_CHECKED_DATE)}に確認）。会場限定・FC 限定の品など、通販に出ていないものは入っていないことがあります。「時期は推測」は、公式の発売日の記載を確かめていないものです。`
    )
  );
  listContainer.appendChild(note);
}

// options.category：そのカテゴリで開く。options.query：言葉を入れて開く
export function openGoodsScreen(options = {}) {
  if (!listContainer) return;
  if (!resultsElement) buildListPage();
  Object.assign(state, GOODS_DEFAULT_FILTER);
  if (options.category && GOODS_CATEGORIES.some((category) => category.id === options.category)) state.category = options.category;
  if (typeof options.query === "string") state.query = options.query;
  update();
}

// ===== 詳細 =====

function buildEmbedArea(item) {
  const area = el("section", "gds-embed");
  area.setAttribute("aria-label", "公式 X の投稿");
  if (!item.xPostUrl) {
    area.classList.add("is-none");
    const where = item.shopUrl ? "下の［公式ショップで見る］から公式ショップのページで" : "下の［公式サイトのお知らせを見る］から公式サイトで";
    area.appendChild(el("p", "gds-embed-none", `この商品の公式 X の告知の投稿は、まだ見つけていません。画像は${where}見られます。`));
    return area;
  }
  const button = el("button", "gds-embed-button", "公式 X の投稿を表示");
  button.type = "button";
  const hint = el("p", "gds-embed-hint", "押すと X から投稿を読み込みます（通信します）。");
  const box = el("div", "gds-embed-box");
  box.hidden = true;
  const status = el("p", "gds-embed-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const postLink = buildExternalLink("gds-embed-link", "X で投稿を開く", item.xPostUrl, `公式 X の投稿（${item.series || item.name}）を新しいタブで開く`);
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.hidden = true;
    hint.hidden = true;
    box.hidden = false;
    box.replaceChildren();
    area.classList.remove("is-failed");
    status.textContent = "公式 X の投稿を読み込んでいます…";
    const result = await embedGoodsPost(box, item.xPostUrl);
    if (result.ok) {
      status.textContent = "";
      area.classList.add("is-loaded");
      return;
    }
    // 表示できないとき：理由とリンクを残し、もう一度押せるようにする
    box.replaceChildren();
    box.hidden = true;
    area.classList.add("is-failed");
    status.textContent = describeGoodsEmbedFailure(result.reason);
    button.textContent = "もう一度読み込む";
    button.disabled = false;
    button.hidden = false;
  });
  area.append(button, hint, status, box, postLink);
  return area;
}

export function renderGoodsDetail(itemId) {
  if (!detailContainer) return false;
  const item = itemById.get(itemId);
  detailContainer.replaceChildren();
  if (!item) {
    detailContainer.appendChild(el("p", "gds-empty", "このグッズは見つかりませんでした。"));
    return false;
  }
  detailContainer.dataset.id = item.id;
  const head = el("div", "gds-detail-head");
  head.appendChild(el("span", `gds-detail-category is-${item.category}`, goodsCategoryLabel(item.category)));
  const title = el("h3", "gds-detail-title", item.series || item.name);
  title.id = "goods-detail-title";
  title.tabIndex = -1;
  head.appendChild(title);
  if (item.series) head.appendChild(el("p", "gds-detail-name", item.name));
  detailContainer.appendChild(head);

  const table = el("dl", "gds-info");
  buildGoodsInfoRows(item).forEach(([label, value]) => {
    const row = el("div", "gds-info-row");
    row.append(el("dt", null, label), el("dd", null, value));
    table.appendChild(row);
  });
  detailContainer.appendChild(table);
  if (!isOfficialPeriod(item)) {
    detailContainer.appendChild(el("p", "gds-hint", `販売の時期は推測です（${item.periodNote || "公式の発売日の記載を確かめていません"}）。`));
  }

  detailContainer.appendChild(buildEmbedArea(item));

  const links = el("div", "gds-links");
  if (item.shopUrl) links.appendChild(buildExternalLink("gds-shop-link", "公式ショップで見る", item.shopUrl, `公式ショップで「${item.name}」のページを新しいタブで開く`));
  if (item.newsUrl) links.appendChild(buildExternalLink("gds-news-link", "公式サイトのお知らせを見る", item.newsUrl, `＝LOVE 公式サイトのお知らせ（${item.name}）を新しいタブで開く`));
  if (!item.shopUrl) {
    links.appendChild(buildExternalLink("gds-shop-link is-top", "公式ショップで見る（トップ）", GOODS_SHOP_TOP_URL, "＝LOVE OFFICIAL SHOP のトップを新しいタブで開く"));
    links.appendChild(el("p", "gds-hint", "この品は公式ショップに商品のページが残っていないため、ショップのトップを開きます。"));
  }
  detailContainer.appendChild(links);

  const note = el("div", "gds-footnote");
  note.appendChild(el("p", "gds-rights", `${GOODS_RIGHTS_NOTE}。`));
  note.appendChild(el("p", null, `文字の情報は公式ショップ・公式サイトの記載をもとに、事実だけを短くまとめたものです（${formatCheckedDate(GOODS_CHECKED_DATE)}に確認）。価格・在庫は変わることがあります。`));
  detailContainer.appendChild(note);
  return true;
}

// elements: { listContainer, detailContainer }。options.onOpenDetail(id)：詳細の画面へ移る（main.js が画面を切り替えてから renderGoodsDetail を呼ぶ）
export function initGoodsScreen(elements, options = {}) {
  listContainer = elements.listContainer;
  detailContainer = elements.detailContainer;
  callbacks = { onOpenDetail: options.onOpenDetail ?? null };
}

// テスト用：一覧の状態（今の条件）
export function getGoodsFilterState() {
  return { ...state };
}
