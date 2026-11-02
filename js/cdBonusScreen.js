// 「CD・特典映像図鑑」のページ（一覧 #cd-bonus-screen・詳細 #cd-bonus-detail-screen。2026-11-02新設・本人の依頼 R10-2）。
// ・一覧：［作品から探す］（1st〜21st・アルバムを古い順／新しい順）と［特典映像から探す］（分類・言葉 → 作品 → TYPE → 映像）
// ・詳細：1つの作品。「どの TYPE に、どの映像？」の表と TYPE のタブ（映像・CD の曲・封入特典・品番・公式のリンク）
// ・ジャケットの画像は出さない（権利者の利用の許可が確かめられないため）。TYPE は色の札と文字で見分ける
// データは js/data/cdBonus.js、絞り込みは js/cdBonusModel.js。画面の切り替え（戻る・記録）は main.js が行う。
import {
  CD_BONUS_WORKS,
  CD_BONUS_CATEGORIES,
  CD_BONUS_ORDER,
  CD_BONUS_ALL_BONUS,
  CD_BONUS_ALL,
  CD_BONUS_MATCH_LABELS,
  cdBonusCategoryLabel,
  cdBonusWorkLabel,
  canShowCdBonusJacket,
  cdBonusTypeTone,
  cdBonusMemberNames,
  cdBonusSeriesLabel,
  countCdBonusVideosByCategory,
  describeCdBonusType,
  describeCdBonusVideoHomes,
  filterCdBonusVideos,
  findCdBonusSeriesSiblings,
  findCdBonusVideo,
  findCdBonusWork,
  formatCdBonusDate,
  isBonusVideo,
  sortCdBonusWorks,
  summarizeCdBonusTypeVideos,
  summarizeCdBonusWork,
} from "./cdBonusModel.js";
import { CD_BONUS_CHECKED_AT } from "./data/cdBonus.js";

export const CD_BONUS_TABS = { WORKS: "works", VIDEOS: "videos" };
export const CD_BONUS_IMAGE_NOTE = "ジャケットの画像は載せていません（利用の許可を確かめられないため）。TYPE は色の札と文字で見分けられます。ジャケットは公式サイトのページで見られます";

let listContainer = null;
let detailContainer = null;
let callbacks = {};
let navigator = null;
const listState = { tab: CD_BONUS_TABS.WORKS, order: CD_BONUS_ORDER.OLD, category: CD_BONUS_ALL_BONUS, query: "" };
const detailState = { workId: null, typeId: null, focusVideoId: null };
// 詳細から別の作品の詳細へ移ったときの戻り先（詳細の［戻る］で1つずつ戻る）
const detailHistory = [];
let listBuilt = false;
let listParts = {};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

// 外へ出るリンク（新しいタブ。iPhone のホーム画面のアプリでは Safari で開く）
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
  icon.setAttribute("class", "cdb-external-icon");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5");
  icon.appendChild(path);
  link.appendChild(icon);
  return link;
}

// TYPE の中身の見出しの絵：ジャケットの画像（公式が許す表示の方法があり、データに出典・利用条件がそろっているときだけ）か、色の札
function buildTypeVisual(type) {
  if (!canShowCdBonusJacket(type.jacket)) return buildTypeTag(type, "l");
  const figure = el("figure", "cdb-jacket");
  const image = el("img", "cdb-jacket-image");
  image.src = type.jacket.imageUrl;
  image.alt = `${type.name} のジャケット`;
  image.loading = "lazy";
  image.decoding = "async";
  // 読み込めないときは色の札に戻す
  image.addEventListener("error", () => figure.replaceWith(buildTypeTag(type, "l")), { once: true });
  figure.appendChild(image);
  figure.appendChild(el("figcaption", "cdb-jacket-credit", `出典：公式（${type.jacket.terms}）`));
  return figure;
}

// TYPE の色の札（ジャケットの代わり）。size："s"（一覧・表）／"l"（TYPE の中身の見出し）
function buildTypeTag(type, size = "s") {
  const tag = el("span", `cdb-type-tag tone-${cdBonusTypeTone(type.id)} is-${size}`);
  tag.setAttribute("aria-hidden", "true");
  tag.appendChild(el("span", "cdb-type-tag-letter", type.id));
  if (size === "l") tag.appendChild(el("span", "cdb-type-tag-format", type.format));
  return tag;
}

function buildCategoryChips(video) {
  const row = el("span", "cdb-chips");
  video.categories.forEach((categoryId) => row.appendChild(el("span", `cdb-chip is-${categoryId}`, cdBonusCategoryLabel(categoryId))));
  if (video.artist) row.appendChild(el("span", "cdb-chip is-artist", `${video.artist} の映像`));
  return row;
}

// ===== 一覧 =====

function buildWorkCard(work) {
  const summary = summarizeCdBonusWork(work);
  const li = el("li", "cdb-work-item");
  const card = el("button", "cdb-work-card");
  card.type = "button";
  card.dataset.workId = work.workId;
  const tile = el("span", `cdb-work-tile is-${work.kind}`);
  tile.setAttribute("aria-hidden", "true");
  tile.append(el("span", "cdb-work-tile-number", work.kind === "album" ? "1st" : summary.label.replace("シングル", "")), el("span", "cdb-work-tile-kind", work.kind === "album" ? "ALBUM" : "SINGLE"));
  const body = el("span", "cdb-work-body");
  body.appendChild(el("span", "cdb-work-label", `${summary.label}・${formatCdBonusDate(work.releaseDate)}`));
  body.appendChild(el("span", "cdb-work-title", work.title));
  const meta = el("span", "cdb-work-meta");
  meta.appendChild(el("span", "cdb-work-types", `TYPE ${summary.typeCount}種`));
  const typeTags = el("span", "cdb-work-type-tags");
  work.types.forEach((type) => {
    const tag = buildTypeTag(type);
    if (!type.videos.length) tag.classList.add("is-novideo");
    typeTags.appendChild(tag);
  });
  meta.appendChild(typeTags);
  body.appendChild(meta);
  const bonusText = summary.bonusTypeIds.length
    ? `特典映像：${[...summary.bonusTitles, ...summary.bonusGroups].slice(0, 2).join("／")}${summary.bonusTitles.length + summary.bonusGroups.length > 2 ? " ほか" : ""}`
    : summary.videoTypeIds.length
      ? "映像は MV・メイキング"
      : "映像特典なし";
  body.appendChild(el("span", `cdb-work-bonus${summary.videoTypeIds.length ? "" : " is-none"}`, bonusText));
  card.appendChild(tile);
  card.appendChild(body);
  card.setAttribute(
    "aria-label",
    `${summary.label}「${work.title}」、${formatCdBonusDate(work.releaseDate)}発売、TYPE ${summary.typeCount}種、${summary.videoTypeIds.length ? `映像つきは Type-${summary.videoTypeIds.join("・")}` : "映像特典なし"}。詳しく見る`
  );
  card.addEventListener("click", () => callbacks.onOpenDetail?.({ workId: work.workId }));
  li.appendChild(card);
  return li;
}

function renderWorks() {
  const works = sortCdBonusWorks(CD_BONUS_WORKS, listState.order);
  const list = el("ul", "cdb-work-list");
  works.forEach((work) => list.appendChild(buildWorkCard(work)));
  listParts.results.replaceChildren(list);
  const typeCount = CD_BONUS_WORKS.reduce((sum, work) => sum + work.types.length, 0);
  listParts.count.textContent = `シングル ${CD_BONUS_WORKS.filter((work) => work.kind === "single").length}作・アルバム ${CD_BONUS_WORKS.filter((work) => work.kind === "album").length}作（TYPE ${typeCount}種）`;
}

function buildVideoResult(row) {
  const li = el("li", "cdb-result-item");
  const button = el("button", "cdb-result");
  button.type = "button";
  button.dataset.videoId = row.video.id;
  button.appendChild(buildTypeTag(row.type));
  const body = el("span", "cdb-result-body");
  if (row.video.group) body.appendChild(el("span", "cdb-result-group", row.video.group));
  body.appendChild(el("span", "cdb-result-title", row.video.title));
  body.appendChild(el("span", "cdb-result-where", `${row.type.name}（${describeCdBonusType(row.type)}）に収録`));
  body.appendChild(buildCategoryChips(row.video));
  const others = describeCdBonusVideoHomes(row.video.id).filter((home) => home.match !== "self" && home.match !== "unverified");
  if (others.length) {
    const text = others
      .map((home) => (home.kind === "release" ? `${home.release.title}（${home.edition}）` : (() => {
        const other = findCdBonusVideo(home.videoId);
        return `${cdBonusWorkLabel(other.work)}「${other.work.title}」${other.type.name}`;
      })()))
      .join("・");
    body.appendChild(el("span", "cdb-result-also", `ほかにも収録：${text}`));
  }
  button.appendChild(body);
  button.setAttribute("aria-label", `${row.video.group ? `${row.video.group}より ` : ""}${row.video.title}。${cdBonusWorkLabel(row.work)}「${row.work.title}」${row.type.name}に収録。${row.video.categories.map(cdBonusCategoryLabel).join("・")}。開く`);
  button.addEventListener("click", () => callbacks.onOpenDetail?.({ workId: row.work.workId, typeId: row.type.id, videoId: row.video.id }));
  li.appendChild(button);
  return li;
}

function renderVideos() {
  const groups = filterCdBonusVideos({ category: listState.category, query: listState.query, order: listState.order });
  const total = groups.reduce((sum, group) => sum + group.rows.length, 0);
  const categoryText = listState.category === CD_BONUS_ALL_BONUS ? "MV 以外の映像" : listState.category === CD_BONUS_ALL ? "すべての映像" : cdBonusCategoryLabel(listState.category);
  listParts.count.textContent = listState.query.trim() ? `「${listState.query.trim()}」：${categoryText}から ${total}本` : `${categoryText}：${total}本（${groups.length}作）`;
  listParts.results.replaceChildren();
  if (!total) {
    listParts.results.appendChild(
      el("p", "cdb-empty", "この条件の映像は見つかりませんでした。関連の言葉は、公式の題名に出てくる言葉と同じ形で探します（例：「富士急」は当たり、「富士山」は当たりません）。言葉を変えるか、分類を「MV 以外すべて」に戻してください。")
    );
    return;
  }
  groups.forEach((group) => {
    const section = el("section", "cdb-result-work");
    section.dataset.workId = group.work.workId;
    const heading = el("h3", "cdb-result-work-heading");
    heading.append(el("span", "cdb-result-work-label", `${cdBonusWorkLabel(group.work)}・${formatCdBonusDate(group.work.releaseDate)}`), el("span", "cdb-result-work-title", group.work.title));
    section.appendChild(heading);
    const list = el("ul", "cdb-result-list");
    group.rows.forEach((row) => list.appendChild(buildVideoResult(row)));
    section.appendChild(list);
    listParts.results.appendChild(section);
  });
}

function syncListControls() {
  listParts.tabButtons.forEach((button, id) => {
    const active = id === listState.tab;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  listParts.orderButtons.forEach((button, id) => {
    const active = id === listState.order;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const isVideos = listState.tab === CD_BONUS_TABS.VIDEOS;
  listParts.videoControls.hidden = !isVideos;
  listParts.lead.textContent = isVideos
    ? "分類を選ぶか、企画名・地名で探します。押すと、その映像が入っている作品の TYPE を開きます。"
    : "作品を押すと、TYPE ごとの中身（映像・CD の曲・封入特典・品番）を見られます。";
  listParts.categoryButtons.forEach((button, id) => {
    const active = id === listState.category;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const selected = listParts.categoryButtons.get(listState.category);
  listParts.categoryLead.textContent = listState.category === CD_BONUS_ALL_BONUS ? "MV 以外の映像を全部出します。分類を選ぶと、その分類だけにします" : `${cdBonusCategoryLabel(listState.category)}：${selected?.dataset.lead ?? ""}`;
  if (listParts.searchInput.value !== listState.query) listParts.searchInput.value = listState.query;
  listParts.resetButton.hidden = !(listState.query || listState.category !== CD_BONUS_ALL_BONUS);
}

function updateList() {
  syncListControls();
  if (listState.tab === CD_BONUS_TABS.VIDEOS) renderVideos();
  else renderWorks();
}

function buildListTabs() {
  const tabs = el("div", "cdb-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "探し方");
  const defs = [
    [CD_BONUS_TABS.WORKS, "作品から探す"],
    [CD_BONUS_TABS.VIDEOS, "特典映像から探す"],
  ];
  listParts.tabButtons = new Map();
  defs.forEach(([id, label], index) => {
    const button = el("button", "cdb-tab", label);
    button.type = "button";
    button.id = `cd-bonus-tab-${id}`;
    button.dataset.tab = id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "cd-bonus-results");
    button.addEventListener("click", () => {
      if (listState.tab === id) return;
      listState.tab = id;
      updateList();
    });
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = defs[(index + 1) % defs.length][0];
      listParts.tabButtons.get(next).focus();
      listParts.tabButtons.get(next).click();
    });
    listParts.tabButtons.set(id, button);
    tabs.appendChild(button);
  });
  return tabs;
}

function buildOrderToggle() {
  const row = el("div", "cdb-order");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "並べ方");
  listParts.orderButtons = new Map();
  [
    [CD_BONUS_ORDER.OLD, "古い順（1st から）"],
    [CD_BONUS_ORDER.NEW, "新しい順"],
  ].forEach(([id, label]) => {
    const button = el("button", "cdb-order-button", label);
    button.type = "button";
    button.dataset.order = id;
    button.addEventListener("click", () => {
      listState.order = id;
      updateList();
    });
    listParts.orderButtons.set(id, button);
    row.appendChild(button);
  });
  return row;
}

function buildVideoControls() {
  const box = el("div", "cdb-video-controls");
  const counts = countCdBonusVideosByCategory();
  const chips = el("div", "cdb-category-chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "映像の分類");
  listParts.categoryButtons = new Map();
  [{ id: CD_BONUS_ALL_BONUS, label: "MV 以外すべて" }, ...CD_BONUS_CATEGORIES].forEach((category) => {
    const button = el("button", `cdb-category is-${category.id}`);
    button.type = "button";
    button.dataset.category = category.id;
    button.append(el("span", "cdb-category-label", category.label), el("span", "cdb-category-count", String(counts[category.id] ?? 0)));
    button.setAttribute("aria-label", `${category.label}（${counts[category.id] ?? 0}本）${category.lead ? `：${category.lead}` : ""}`);
    button.dataset.lead = category.lead ?? "";
    button.addEventListener("click", () => {
      listState.category = category.id;
      updateList();
    });
    listParts.categoryButtons.set(category.id, button);
    chips.appendChild(button);
  });
  const input = el("input", "cdb-search");
  input.type = "search";
  input.id = "cd-bonus-search-input";
  input.placeholder = window.innerWidth < 360 ? "企画名・地名で探す" : "企画名・地名で探す（例：人狼・沖縄）";
  input.setAttribute("aria-label", "特典映像を、企画名・地名・映像の題名で探す");
  input.addEventListener("input", () => {
    listState.query = input.value;
    updateList();
  });
  listParts.searchInput = input;
  // 選んでいる分類の短い説明（分類の違いが分かるように）
  listParts.categoryLead = el("p", "cdb-category-lead");
  listParts.categoryLead.setAttribute("aria-live", "polite");
  // 言葉の欄を先に（狭い画面でも結果がすぐ下に見えるように）、分類は1行で横に動かす
  box.append(input, chips, listParts.categoryLead);
  return box;
}

function buildListPage() {
  listParts = {};
  listContainer.replaceChildren();
  listContainer.appendChild(el("p", "cdb-intro", "1st〜21st シングルとアルバムの、TYPE ごとの中身の図鑑です。どの TYPE に、どの特典映像が入っているかが分かります（公式サイトの記載をもとにしています）。"));
  listContainer.appendChild(buildListTabs());
  listParts.lead = el("p", "cdb-lead");
  listContainer.appendChild(listParts.lead);
  listParts.videoControls = buildVideoControls();
  listContainer.appendChild(listParts.videoControls);
  const countRow = el("div", "cdb-count-row");
  listParts.count = el("p", "cdb-count");
  listParts.count.setAttribute("aria-live", "polite");
  listParts.resetButton = el("button", "cdb-reset", "条件を戻す");
  listParts.resetButton.type = "button";
  listParts.resetButton.addEventListener("click", () => {
    listState.query = "";
    listState.category = CD_BONUS_ALL_BONUS;
    updateList();
  });
  countRow.append(listParts.count, listParts.resetButton);
  listContainer.appendChild(buildOrderToggle());
  listContainer.appendChild(countRow);
  listParts.results = el("div", "cdb-results");
  listParts.results.id = "cd-bonus-results";
  listParts.results.setAttribute("role", "tabpanel");
  listContainer.appendChild(listParts.results);
  const note = el("div", "cdb-footnote");
  note.appendChild(el("p", null, `${CD_BONUS_IMAGE_NOTE}。`));
  note.appendChild(el("p", null, `中身は ＝LOVE 公式サイトの DISCOGRAPHY の各 TYPE のページを、ソニーミュージックの商品ページと照らし合わせて写したものです（${formatCdBonusDate(CD_BONUS_CHECKED_AT)}に確認）。映像の分類と関連の言葉は、公式の題名から分かる範囲だけです。`));
  listContainer.appendChild(note);
  listBuilt = true;
}

// options.tab："works"／"videos"。options.category・options.query：特典映像の絞り込み。options.keep：今の条件のまま（戻ったとき）
export function openCdBonusList(options = {}) {
  if (!listContainer) return;
  if (!listBuilt) buildListPage();
  if (!options.keep) {
    if (options.tab && Object.values(CD_BONUS_TABS).includes(options.tab)) listState.tab = options.tab;
    if (options.category) listState.category = options.category;
    if (typeof options.query === "string") {
      listState.query = options.query;
      listState.tab = CD_BONUS_TABS.VIDEOS;
    }
  }
  updateList();
}

// ===== 詳細 =====

function buildMatrix(work) {
  const section = el("section", "cdb-matrix");
  section.setAttribute("aria-labelledby", "cd-bonus-matrix-heading");
  const heading = el("h4", "cdb-section-heading", "どの TYPE に、どの映像？");
  heading.id = "cd-bonus-matrix-heading";
  section.appendChild(heading);
  const list = el("ul", "cdb-matrix-list");
  work.types.forEach((type) => {
    const summary = summarizeCdBonusTypeVideos(type);
    const li = el("li");
    const button = el("button", `cdb-matrix-row${summary.has ? "" : " is-none"}`);
    button.type = "button";
    button.dataset.typeId = type.id;
    button.appendChild(buildTypeTag(type));
    const body = el("span", "cdb-matrix-body");
    body.appendChild(el("span", "cdb-matrix-format", `${type.name}・${describeCdBonusType(type)}`));
    body.appendChild(el("span", "cdb-matrix-videos", summary.text));
    button.appendChild(body);
    button.setAttribute("aria-label", `${type.name}（${describeCdBonusType(type)}）：${summary.text}。この TYPE を開く`);
    button.addEventListener("click", () => {
      selectType(type.id, { focusPanel: true });
    });
    li.appendChild(button);
    list.appendChild(li);
  });
  section.appendChild(list);
  return section;
}

function buildTypeTabs(work) {
  const tabs = el("div", "cdb-type-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "TYPE");
  work.types.forEach((type, index) => {
    const button = el("button", `cdb-type-tab tone-${cdBonusTypeTone(type.id)}`);
    button.type = "button";
    button.id = `cd-bonus-type-tab-${type.id}`;
    button.dataset.typeId = type.id;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", "cd-bonus-type-panel");
    button.append(el("span", "cdb-type-tab-name", type.name), el("span", "cdb-type-tab-sub", type.videos.length ? (type.disc === "Blu-ray" ? "Blu-ray" : "DVD") : "CD のみ"));
    button.addEventListener("click", () => selectType(type.id));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const next = work.types[(index + (event.key === "ArrowRight" ? 1 : work.types.length - 1)) % work.types.length];
      const nextButton = tabs.querySelector(`[data-type-id="${next.id}"]`);
      nextButton.focus();
      nextButton.click();
    });
    tabs.appendChild(button);
  });
  return tabs;
}

function buildHomesList(video) {
  const homes = describeCdBonusVideoHomes(video.id).filter((home) => home.match !== "self");
  if (!homes.length) return null;
  const box = el("div", "cdb-homes");
  box.appendChild(el("p", "cdb-homes-heading", "ほかにも入っている所"));
  const list = el("ul", "cdb-homes-list");
  homes.forEach((home) => {
    const li = el("li", `cdb-home is-${home.match}`);
    if (home.kind === "type") {
      const other = findCdBonusVideo(home.videoId);
      const button = el("button", "cdb-home-link", `${cdBonusWorkLabel(other.work)}「${other.work.title}」${other.type.name}`);
      button.type = "button";
      button.addEventListener("click", () => openOtherDetail({ workId: other.work.workId, typeId: other.type.id, videoId: other.video.id }));
      li.appendChild(button);
    } else {
      const text = `${home.release.title}（${home.edition}）の ${home.place}`;
      li.appendChild(buildExternalLink("cdb-home-external", text, home.release.officialUrl, `${home.release.title} の公式サイトのページを新しいタブで開く`));
    }
    li.appendChild(el("span", "cdb-home-match", CD_BONUS_MATCH_LABELS[home.match] ?? ""));
    list.appendChild(li);
  });
  box.appendChild(list);
  return box;
}

function buildSeriesBox(video, currentWork) {
  const siblings = findCdBonusSeriesSiblings(video.id);
  if (!siblings.length) return null;
  const box = el("div", "cdb-series");
  box.appendChild(el("p", "cdb-series-heading", `続きの映像：${cdBonusSeriesLabel(video.series) ?? ""}`));
  const list = el("ul", "cdb-series-list");
  siblings.forEach((row) => {
    const li = el("li");
    const sameWork = row.work.workId === currentWork.workId;
    const label = sameWork ? `${row.type.name}「${row.video.title}」` : `${cdBonusWorkLabel(row.work)} ${row.type.name}「${row.video.title}」`;
    const button = el("button", "cdb-series-link", label);
    button.type = "button";
    button.addEventListener("click", () => {
      if (sameWork) {
        selectType(row.type.id, { focusVideoId: row.video.id });
      } else {
        openOtherDetail({ workId: row.work.workId, typeId: row.type.id, videoId: row.video.id });
      }
    });
    li.appendChild(button);
    list.appendChild(li);
  });
  box.appendChild(list);
  return box;
}

function buildVideoCard(video, work) {
  const card = el("article", "cdb-video");
  card.id = `cdb-video-${video.id}`;
  card.dataset.videoId = video.id;
  card.tabIndex = -1;
  card.appendChild(el("h5", "cdb-video-title", video.title));
  card.appendChild(buildCategoryChips(video));
  const members = cdBonusMemberNames(video);
  if (members.length) card.appendChild(el("p", "cdb-video-members", `メンバー：${members.join("・")}（${video.membersBasis}）`));
  if (video.note) card.appendChild(el("p", "cdb-video-note", video.note));
  const homes = buildHomesList(video);
  if (homes) card.appendChild(homes);
  const series = buildSeriesBox(video, work);
  if (series) card.appendChild(series);
  return card;
}

function buildVideoSection(type, work) {
  const section = el("section", "cdb-panel-section cdb-videos");
  const heading = el("h4", "cdb-section-heading", type.videos.length ? `${type.disc} の映像（${type.videos.length}本）` : "映像");
  section.appendChild(heading);
  if (!type.videos.length) {
    section.appendChild(el("p", "cdb-novideo", "映像特典なし（CD だけの TYPE です）"));
    return section;
  }
  let currentGroup = null;
  let groupList = null;
  type.videos.forEach((video) => {
    if (video.group && video.group !== currentGroup) {
      currentGroup = video.group;
      const groupBox = el("div", "cdb-video-group");
      groupBox.appendChild(el("p", "cdb-video-group-heading", video.group));
      groupList = el("div", "cdb-video-group-list");
      groupBox.appendChild(groupList);
      section.appendChild(groupBox);
    } else if (!video.group) {
      currentGroup = null;
      groupList = null;
    }
    (groupList ?? section).appendChild(buildVideoCard(video, work));
  });
  return section;
}

function buildTracksSection(type) {
  const section = el("section", "cdb-panel-section cdb-tracks");
  section.appendChild(el("h4", "cdb-section-heading", `CD の曲（${type.tracks.length}曲）`));
  const list = el("ol", "cdb-track-list");
  type.tracks.forEach((track, index) => {
    const li = el("li", `cdb-track${track.instrumental ? " is-instrumental" : ""}`);
    li.appendChild(el("span", "cdb-track-no", String(index + 1)));
    li.appendChild(el("span", "cdb-track-title", track.title));
    if (track.artist) li.appendChild(el("span", "cdb-chip is-artist", track.artist));
    list.appendChild(li);
  });
  section.appendChild(list);
  return section;
}

function buildInsertsSection(type) {
  const section = el("section", "cdb-panel-section cdb-inserts");
  section.appendChild(el("h4", "cdb-section-heading", "封入特典"));
  if (!type.inserts.length) {
    section.appendChild(el("p", "cdb-muted", "公式サイトのページに封入特典の記載はありません。"));
    return section;
  }
  if (type.insertsHeading) section.appendChild(el("p", "cdb-muted", `公式の見出し：${type.insertsHeading}`));
  const list = el("ul", "cdb-insert-list");
  type.inserts.forEach((text) => list.appendChild(el("li", null, text)));
  section.appendChild(list);
  return section;
}

function buildInfoSection(type) {
  const section = el("section", "cdb-panel-section cdb-info");
  const table = el("dl", "cdb-info-table");
  const rows = [
    ["形", type.format],
    ["仕様", type.edition ? `${type.edition}（${type.editionSource === "official" ? "公式サイトの表記" : "ソニーの表記"}）` : "公式・ソニーとも表記なし"],
    ["品番", type.catalog],
    ["確認", type.check === "both" ? "公式サイトとソニーの商品ページで確認" : "公式サイトで確認（ソニーの商品ページには映像の記載なし）"],
  ];
  rows.forEach(([label, value]) => {
    const row = el("div", "cdb-info-row");
    row.append(el("dt", null, label), el("dd", null, value));
    table.appendChild(row);
  });
  section.appendChild(table);
  if (type.notes?.length) {
    const notes = el("ul", "cdb-notes");
    type.notes.forEach((text) => notes.appendChild(el("li", null, text)));
    section.appendChild(notes);
  }
  const links = el("div", "cdb-links");
  links.appendChild(buildExternalLink("cdb-link is-official", "公式サイトで見る（ジャケットも）", type.officialUrl, `${type.name} の ＝LOVE 公式サイトのページを新しいタブで開く`));
  if (type.sonyUrl) links.appendChild(buildExternalLink("cdb-link", "ソニーの商品ページ", type.sonyUrl, `${type.name} のソニーミュージックの商品ページを新しいタブで開く`));
  section.appendChild(links);
  return section;
}

function renderTypePanel(work, type) {
  const panel = detailContainer.querySelector("#cd-bonus-type-panel");
  panel.replaceChildren();
  panel.setAttribute("aria-labelledby", `cd-bonus-type-tab-${type.id}`);
  const head = el("div", "cdb-panel-head");
  head.appendChild(buildTypeVisual(type));
  const headText = el("div", "cdb-panel-head-text");
  headText.appendChild(el("p", "cdb-panel-name", `${work.title} ${type.name}`));
  headText.appendChild(el("p", "cdb-panel-sub", describeCdBonusType(type)));
  head.appendChild(headText);
  panel.appendChild(head);
  panel.appendChild(buildVideoSection(type, work));
  panel.appendChild(buildTracksSection(type));
  panel.appendChild(buildInsertsSection(type));
  panel.appendChild(buildInfoSection(type));
}

function selectType(typeId, { focusVideoId = null, focusPanel = false } = {}) {
  const work = findCdBonusWork(detailState.workId);
  if (!work) return;
  const type = work.types.find((entry) => entry.id === typeId) ?? work.types[0];
  detailState.typeId = type.id;
  detailState.focusVideoId = focusVideoId;
  detailContainer.querySelectorAll(".cdb-type-tab").forEach((button) => {
    const active = button.dataset.typeId === type.id;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  detailContainer.querySelectorAll(".cdb-matrix-row").forEach((button) => button.classList.toggle("is-active", button.dataset.typeId === type.id));
  renderTypePanel(work, type);
  if (focusVideoId) {
    revealVideo(focusVideoId);
  } else if (focusPanel) {
    detailContainer.querySelector(".cdb-type-tabs")?.scrollIntoView({ block: "start" });
    detailContainer.querySelector(`.cdb-type-tab[data-type-id="${type.id}"]`)?.focus({ preventScroll: true });
  }
}

function revealVideo(videoId) {
  const card = detailContainer.querySelector(`.cdb-video[data-video-id="${videoId}"]`);
  if (!card) return;
  card.scrollIntoView({ block: "center" });
  card.focus({ preventScroll: true });
  card.classList.add("is-focus");
  setTimeout(() => card.classList.remove("is-focus"), 2400);
}

// 詳細の中から別の作品の詳細へ（今の作品を戻り先に積む）
function openOtherDetail(target) {
  detailHistory.push({ workId: detailState.workId, typeId: detailState.typeId });
  renderCdBonusDetail(target, { keepHistory: true });
  window.scrollTo(0, 0);
  if (target.videoId) revealVideo(target.videoId);
}

// target: { workId, typeId?, videoId? }。options.keepHistory：戻り先の記録を消さない
export function renderCdBonusDetail(target, options = {}) {
  if (!detailContainer) return false;
  if (!options.keepHistory) detailHistory.length = 0;
  const work = findCdBonusWork(target?.workId);
  detailContainer.replaceChildren();
  if (!work) {
    detailContainer.appendChild(el("p", "cdb-empty", "この作品は見つかりませんでした。"));
    return false;
  }
  const videoRow = target.videoId ? findCdBonusVideo(target.videoId) : null;
  const typeId = videoRow?.work.workId === work.workId ? videoRow.type.id : target.typeId;
  detailState.workId = work.workId;
  detailContainer.dataset.workId = work.workId;

  const head = el("div", "cdb-detail-head");
  head.appendChild(el("span", `cdb-detail-kind is-${work.kind}`, cdBonusWorkLabel(work)));
  const title = el("h3", "cdb-detail-title", work.title);
  title.id = "cd-bonus-detail-title";
  title.tabIndex = -1;
  head.appendChild(title);
  const summary = summarizeCdBonusWork(work);
  head.appendChild(el("p", "cdb-detail-sub", `${formatCdBonusDate(work.releaseDate)}発売・TYPE ${summary.typeCount}種（映像つき ${summary.videoTypeIds.length}種）`));
  detailContainer.appendChild(head);

  detailContainer.appendChild(buildMatrix(work));
  detailContainer.appendChild(buildTypeTabs(work));
  const panel = el("div", "cdb-type-panel");
  panel.id = "cd-bonus-type-panel";
  panel.setAttribute("role", "tabpanel");
  detailContainer.appendChild(panel);
  const note = el("div", "cdb-footnote");
  note.appendChild(el("p", null, `${CD_BONUS_IMAGE_NOTE}。`));
  note.appendChild(el("p", null, `公式サイトの記載をもとにしています（${formatCdBonusDate(CD_BONUS_CHECKED_AT)}に確認）。封入特典は初回生産分などの限りがあることがあります。最新の情報は公式サイトで確かめてください。`));
  detailContainer.appendChild(note);
  selectType(typeId ?? work.types[0].id, { focusVideoId: videoRow?.work.workId === work.workId ? target.videoId : null });
  return true;
}

// 詳細の［戻る］：別の作品から来ていれば、その作品へ戻る（true を返す）。無ければ false（main.js が一覧へ戻す）
export function goBackInCdBonusDetail() {
  const previous = detailHistory.pop();
  if (!previous) return false;
  renderCdBonusDetail({ workId: previous.workId, typeId: previous.typeId }, { keepHistory: true });
  window.scrollTo(0, 0);
  return true;
}

// elements: { listContainer, detailContainer }。options.onOpenDetail(target)：詳細の画面へ移る（main.js が画面を切り替えてから renderCdBonusDetail を呼ぶ）
export function initCdBonusScreen(elements, options = {}) {
  listContainer = elements.listContainer;
  detailContainer = elements.detailContainer;
  callbacks = { onOpenDetail: options.onOpenDetail ?? null };
}

// 画面の移り方（ホーム・全体検索から開くとき）を main.js が渡す
export function setCdBonusNavigator(fn) {
  navigator = fn;
}

// 【入口の関数】CD・特典映像図鑑を開く。
//   openCdBonus()                       … 一覧（作品から探す）
//   openCdBonus({ workId })             … その作品の詳細
//   openCdBonus({ workId, type })       … その作品のその TYPE（type は "A" など）
//   openCdBonus({ videoId })            … その映像が入っている作品・TYPE を開き、映像の所まで動かす
//   options.from：戻る先の画面（省略時は今の画面）
export function openCdBonus(options = {}) {
  const videoRow = options.videoId ? findCdBonusVideo(options.videoId) : null;
  const target = {
    workId: options.workId ?? videoRow?.work.workId ?? null,
    typeId: options.type ?? options.typeId ?? videoRow?.type.id ?? null,
    videoId: videoRow ? options.videoId : null,
  };
  if (!navigator) return false;
  navigator(target, options);
  return true;
}

// テスト用：一覧・詳細の今の状態
export function getCdBonusState() {
  return { list: { ...listState }, detail: { ...detailState }, historyDepth: detailHistory.length };
}

// テスト用：一覧の条件を初めに戻す
export function resetCdBonusListState() {
  Object.assign(listState, { tab: CD_BONUS_TABS.WORKS, order: CD_BONUS_ORDER.OLD, category: CD_BONUS_ALL_BONUS, query: "" });
}

export { isBonusVideo };
