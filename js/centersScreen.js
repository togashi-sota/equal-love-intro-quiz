// 歴代センター一覧画面（2026-10-27新設・本人承認の「案C」：独立ページ＋収録曲一覧からのリンク）。
// 曲を発売順に並べ、センターのメンバーを「メンバーカラーを背景にしたマス」で見せる。
// センターが誰かは js/data/songs.js、根拠の強さは js/data/centerSources.js、
// 判定・並び・文字色の計算は js/centerChart.js、センター表の組み立ては js/centerTable.js（どちらも画面に依存しない関数）に任せ、
// ここは表示だけを担当する。
// 曲・メンバーをタップしたときの画面移動は、呼び出し側（main.js）の onOpenSong / onOpenMember に任せる。
//
// 【2026-10-28 本人指示】
//  ・ふだんの画面では、根拠のラベル（公式／報道／ファン資料のみ…）・根拠の説明・根拠の件数・「公式未確認」の注記・
//    「アプリ内ルール」の印を出さない。曲名・発売日・センターだけをはっきり見せる。
//    根拠のデータ（centerSources.js）と「アプリで採用したセンター／公式発表」の区別（appRule 等）は、データとして残す。
//  ・画面上部の切り替えで［一覧カード］［センター表］を選べる。最後に選んだほうを覚える（localStorage）。
import { SONGS } from "./data/songs.js";
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { DISCOGRAPHY } from "./data/discography.js";
import { buildCenterRows, filterCenterRows, describeCenterState, pickReadableTextColor } from "./centerChart.js";
import { CENTER_TABLE_COLUMNS, buildCenterTableModel, filterCenterTableModel } from "./centerTable.js";
import { normalizeForSearch } from "./songSearch.js";
import { applyScrollLock, releaseScrollLock } from "./scrollLock.js";

const VIEW_MODE_STORAGE_KEY = "equalLoveIntroQuiz.centersViewMode";
const VIEW_MODES = { CARDS: "cards", TABLE: "table" };

let container = null;
let callbacks = { onOpenSong: null, onOpenMember: null };
let listElement = null;
let tablePanel = null;
let tableScroll = null;
let summaryElement = null;
let searchInput = null;
let searchClearButton = null;
let chipRow = null;
let noCenterToggleLabel = null;
let noCenterToggle = null;
let viewTabs = null;
let fullscreenOverlay = null;
let fullscreenScrollY = 0;
let built = false;

// 絞り込みの状態（同じ利用中だけ覚える。保存はしない）
const filterState = { memberName: null, query: "", includeNoCenterSongs: false };
// 表示の切り替え（一覧カード／センター表）。これだけは次に開いたときも覚えておく
let viewMode = loadViewMode();
// センター表の文字の大きさ（s／m／l）。小さくしても 12px より下にはしない（css/centersTable.css）
let tableTextSize = "m";

const allRows = buildCenterRows(SONGS);
const tableModel = buildCenterTableModel(SONGS, { discography: DISCOGRAPHY });
const memberByName = new Map(MEMBERS.map((member) => [member.name, member]));

// localStorage はプライベートモード等で使えない（例外になる）ことがあるため、必ず try/catch で包む
function loadViewMode() {
  try {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return saved === VIEW_MODES.TABLE ? VIEW_MODES.TABLE : VIEW_MODES.CARDS;
  } catch {
    return VIEW_MODES.CARDS;
  }
}

function saveViewMode(mode) {
  try {
    localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
  } catch {
    // 保存できなくても表示の切り替え自体はできるので、何もしない
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(isoDate) {
  return isoDate ? isoDate.replaceAll("-", ".") : "日付未確認";
}

// メンバーカラーのマス。背景の明るさから文字色（黒／白）を選び、足りないときは縁取りを付ける。
function buildMemberCell(name) {
  const member = memberByName.get(name);
  const hex = member?.memberColor?.hex ?? "#eeeeee";
  const readable = pickReadableTextColor(hex);
  const cell = el("button", `center-cell${readable.needsOutline ? " has-outline" : ""}`, name);
  cell.type = "button";
  cell.style.backgroundColor = hex;
  cell.style.color = readable.color;
  cell.dataset.textTone = readable.color === "#ffffff" ? "light" : "dark";
  cell.setAttribute("aria-label", `${name}のページを開く`);
  if (member) {
    cell.addEventListener("click", () => {
      closeTableFullscreen();
      callbacks.onOpenMember?.(member);
    });
  } else {
    cell.disabled = true;
  }
  return cell;
}

// 「全員」は、特定のメンバーの色を使わない共通の表示にする（2026-10-28 本人指示）。
// 以前は現役メンバー全員の色の帯だったが、色の並びで特定の人に見えるおそれがあるため、アプリの基調色だけで表す
function buildAllMembersCell() {
  return el("span", "center-cell is-all", "全員");
}

function buildCenterCells(row) {
  const box = el("div", "center-cells");
  const { center } = row;
  box.appendChild(el("span", "center-cells-label", describeCenterState(center)));
  if (center.state === "single" || center.state === "double") {
    center.centerNames.forEach((name) => box.appendChild(buildMemberCell(name)));
  } else if (center.state === "all") {
    box.appendChild(buildAllMembersCell());
  } else if (center.state === "none" && !center.isConfirmed) {
    // 【2026-10-28】「センターなし」と書かれた資料が見つかっていない曲は、「なし」と断定せず「未確認」と出す
    box.appendChild(el("span", "center-cell is-unconfirmed", "未確認"));
  } else if (center.state === "none") {
    box.appendChild(el("span", "center-cell is-none", "なし"));
  } else if (center.state === "solo" || center.state === "duo") {
    (row.song.members ?? []).forEach((name) => {
      const cell = buildMemberCell(name);
      cell.classList.add("is-singer");
      box.appendChild(cell);
    });
  } else {
    box.appendChild(el("span", "center-cell is-unconfirmed", "未確認"));
  }
  return box;
}

function buildSongTitleButton(song, className) {
  const button = el("button", className, song.title);
  button.type = "button";
  button.setAttribute("aria-label", `${song.title}を収録曲一覧で見る`);
  button.addEventListener("click", () => {
    closeTableFullscreen();
    callbacks.onOpenSong?.(song.id);
  });
  return button;
}

// 一覧カードの1曲ぶん。根拠のラベル・注記はふだんの画面には出さない（2026-10-28 本人指示）。
// 根拠の種類は data 属性にだけ残す（画面には出ない。調べるとき・テストのため）。
function buildRow(row) {
  const card = el("article", `center-row is-${row.center.state}`);
  card.dataset.songId = row.song.id;
  if (row.center.evidenceKind) card.dataset.evidenceKind = row.center.evidenceKind;
  if (row.center.appRule) card.dataset.appRule = row.center.appRule;

  const info = el("div", "center-row-info");
  const tags = el("div", "center-row-tags");
  tags.appendChild(el("span", `center-tag is-work-${row.work.kind}`, row.work.label));
  tags.appendChild(el("span", `center-tag is-role-${row.role.kind}`, row.role.label));
  tags.appendChild(el("span", "center-row-date", formatDate(row.song.releaseDate)));
  info.appendChild(tags);
  info.appendChild(buildSongTitleButton(row.song, "center-row-title"));

  card.append(info, buildCenterCells(row));
  return card;
}

// ---- センター表 ----

// センター欄のマス（表の中）。cell.type ごとに見た目を変える（js/centerTable.js の describeCenterTableCell）
function buildTableCenterCell(entry) {
  const td = el("td", `ct-center is-${entry.cell.type}`);
  if (entry.isDimmed) td.classList.add("is-dimmed");
  const box = el("div", "ct-chips");
  if (entry.cell.type === "members") {
    entry.cell.names.forEach((name) => box.appendChild(buildMemberCell(name)));
    if (entry.cell.names.length >= 2) td.classList.add("is-multi");
  } else if (entry.cell.type === "all") {
    box.appendChild(buildAllMembersCell());
  } else if (entry.cell.type === "singers") {
    // センターの区別が無いユニット曲：センターと見間違えないよう「歌唱」の小さな見出しを付け、マスも小さく控えめにする
    box.appendChild(el("span", "ct-singers-label", "歌唱"));
    entry.cell.names.forEach((name) => {
      const cell = buildMemberCell(name);
      cell.classList.add("is-singer");
      box.appendChild(cell);
    });
  } else if (entry.cell.type === "none") {
    box.appendChild(el("span", "center-cell is-none", "なし"));
  } else {
    box.appendChild(el("span", "center-cell is-unconfirmed", "未確認"));
  }
  td.appendChild(box);
  return td;
}

function buildTableSongCell(entry) {
  const td = el("td", "ct-song");
  td.dataset.songId = entry.song.id;
  if (entry.isDimmed) td.classList.add("is-dimmed");
  td.appendChild(buildSongTitleButton(entry.song, "ct-song-title"));
  return td;
}

// 作品の左端の列（横スクロールしても左に残る）：大きな番号＋小さな種類名・発売日
function buildWorkHeaderCell(group) {
  const th = el("th", "ct-work");
  th.scope = "rowgroup";
  th.rowSpan = Math.max(group.lineCount, 1);
  th.appendChild(el("span", "ct-work-badge", group.badge));
  th.appendChild(el("span", "ct-work-note", group.badgeNote));
  th.appendChild(el("span", "ct-work-date", formatDate(group.releaseDate)));
  th.title = group.workTitle;
  return th;
}

function buildTableGroupBody(group) {
  const tbody = el("tbody", `ct-group is-${group.kind}`);
  tbody.dataset.workId = group.workId;
  const lineCount = Math.max(group.lineCount, 1);
  for (let line = 0; line < lineCount; line += 1) {
    const tr = el("tr", line === 0 ? "ct-line is-first" : "ct-line");
    if (line === 0) tr.appendChild(buildWorkHeaderCell(group));
    CENTER_TABLE_COLUMNS.forEach((column) => {
      const entry = group.columns[column.key][line];
      if (entry) {
        tr.append(buildTableSongCell(entry), buildTableCenterCell(entry));
      } else {
        tr.append(el("td", "ct-song is-empty"), el("td", "ct-center is-empty"));
      }
    });
    tbody.appendChild(tr);
  }
  return tbody;
}

function buildTableHead() {
  const thead = el("thead");
  const tr = el("tr");
  const corner = el("th", "ct-work ct-head", "作品");
  corner.scope = "col";
  tr.appendChild(corner);
  CENTER_TABLE_COLUMNS.forEach((column) => {
    const songHead = el("th", `ct-head ct-head-song is-${column.key}`, column.label);
    songHead.scope = "col";
    const centerHead = el("th", `ct-head ct-head-center is-${column.key}`, "センター");
    centerHead.scope = "col";
    tr.append(songHead, centerHead);
  });
  thead.appendChild(tr);
  return thead;
}

// 区分の見出し行（シングル／アルバム／配信限定シングル／その他）。文字は横スクロールしても左に残す
function buildSectionHeadBody(section) {
  const tbody = el("tbody", "ct-section");
  const tr = el("tr");
  const th = el("th", "ct-section-head");
  th.colSpan = 1 + CENTER_TABLE_COLUMNS.length * 2;
  th.scope = "rowgroup";
  th.appendChild(el("span", "ct-section-label", `${section.label}（${section.groups.length}）`));
  tr.appendChild(th);
  tbody.appendChild(tr);
  return tbody;
}

function renderTable(model) {
  tableScroll.innerHTML = "";
  if (model.groups.length === 0) {
    tableScroll.appendChild(el("p", "empty-state-note", "条件に合う曲が見つかりませんでした"));
    return;
  }
  const table = el("table", "centers-table");
  table.dataset.textSize = tableTextSize;
  table.appendChild(buildTableHead());
  model.sections.forEach((section) => {
    table.appendChild(buildSectionHeadBody(section));
    section.groups.forEach((group) => table.appendChild(buildTableGroupBody(group)));
  });
  tableScroll.appendChild(table);
}

function buildTextSizeButtons() {
  const box = el("div", "ct-text-size");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", "表の文字の大きさ");
  box.appendChild(el("span", "ct-text-size-label", "文字"));
  [
    ["s", "小"],
    ["m", "中"],
    ["l", "大"],
  ].forEach(([size, label]) => {
    const button = el("button", "ct-text-size-button", label);
    button.type = "button";
    button.dataset.size = size;
    button.addEventListener("click", () => {
      tableTextSize = size;
      document.querySelectorAll(".ct-text-size-button").forEach((other) => {
        const isActive = other.dataset.size === tableTextSize;
        other.classList.toggle("is-active", isActive);
        other.setAttribute("aria-pressed", String(isActive));
      });
      const table = tableScroll.querySelector(".centers-table");
      if (table) table.dataset.textSize = tableTextSize;
    });
    const isActive = size === tableTextSize;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
    box.appendChild(button);
  });
  return box;
}

function buildTablePanel() {
  tablePanel = el("div", "centers-table-panel");
  const toolbar = el("div", "centers-table-toolbar");
  toolbar.appendChild(el("p", "centers-table-hint", "表は横にスクロールできます"));
  const fullscreenButton = el("button", "centers-table-fullscreen-button", "全画面で見る");
  fullscreenButton.type = "button";
  fullscreenButton.addEventListener("click", openTableFullscreen);
  toolbar.append(buildTextSizeButtons(), fullscreenButton);
  tableScroll = el("div", "centers-table-scroll");
  tableScroll.tabIndex = 0;
  tableScroll.setAttribute("role", "region");
  tableScroll.setAttribute("aria-label", "歴代センター表");
  tablePanel.append(toolbar, tableScroll);
  return tablePanel;
}

// 「全画面で見る」：表を画面いっぱいの重ね表示へ移す（横向きにすると広く見られる）。
// 同じ表の要素をそのまま移すので、タップの動き・絞り込みの状態は変わらない。閉じると元の場所へ戻す。
function openTableFullscreen() {
  if (fullscreenOverlay) return;
  fullscreenOverlay = el("div", "centers-table-overlay");
  fullscreenOverlay.setAttribute("role", "dialog");
  fullscreenOverlay.setAttribute("aria-modal", "true");
  fullscreenOverlay.setAttribute("aria-label", "歴代センター表（全画面）");
  const header = el("div", "centers-table-overlay-header");
  header.appendChild(el("p", "centers-table-overlay-title", "歴代センター表"));
  const closeButton = el("button", "centers-table-overlay-close", "閉じる");
  closeButton.type = "button";
  closeButton.addEventListener("click", closeTableFullscreen);
  header.append(buildTextSizeButtons(), closeButton);
  fullscreenOverlay.append(header, tableScroll);
  document.body.appendChild(fullscreenOverlay);
  // 背景のページが指の操作で動かないよう固定する（js/scrollLock.js と同じ方法）
  fullscreenScrollY = window.scrollY;
  applyScrollLock(fullscreenScrollY);
  document.addEventListener("keydown", handleFullscreenKeydown);
  window.addEventListener("popstate", closeTableFullscreen);
  closeButton.focus();
}

function closeTableFullscreen() {
  if (!fullscreenOverlay) return;
  tablePanel.appendChild(tableScroll);
  fullscreenOverlay.remove();
  fullscreenOverlay = null;
  releaseScrollLock(fullscreenScrollY);
  document.removeEventListener("keydown", handleFullscreenKeydown);
  window.removeEventListener("popstate", closeTableFullscreen);
}

function handleFullscreenKeydown(event) {
  if (event.key === "Escape") closeTableFullscreen();
}

// ---- 表示の更新 ----

function render() {
  const isTable = viewMode === VIEW_MODES.TABLE;
  listElement.hidden = isTable;
  tablePanel.hidden = !isTable;
  // ソロ・2人の曲の切り替えは一覧カードだけのもの（センター表ではユニット曲の列にいつも出す）
  noCenterToggleLabel.hidden = isTable;
  viewTabs.querySelectorAll(".centers-view-tab").forEach((tab) => {
    const isActive = tab.dataset.view === viewMode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  if (isTable) {
    const model = filterCenterTableModel(tableModel, { ...filterState, normalize: normalizeForSearch });
    renderTable(model);
    const songCount = model.groups.reduce((sum, group) => sum + group.matchCount, 0);
    summaryElement.textContent = `表示中 ${model.groups.length}作品・${songCount}曲`;
  } else {
    const rows = filterCenterRows(allRows, { ...filterState, normalize: normalizeForSearch });
    listElement.innerHTML = "";
    if (rows.length === 0) {
      listElement.appendChild(el("p", "empty-state-note", "条件に合う曲が見つかりませんでした"));
    } else {
      rows.forEach((row) => listElement.appendChild(buildRow(row)));
    }
    summaryElement.textContent = `表示中 ${rows.length}曲`;
  }

  chipRow.querySelectorAll(".center-member-chip").forEach((chip) => {
    const isActive = (chip.dataset.memberName || null) === filterState.memberName;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });
}

function buildViewTabs() {
  viewTabs = el("div", "centers-view-tabs");
  viewTabs.setAttribute("role", "tablist");
  viewTabs.setAttribute("aria-label", "表示の切り替え");
  [
    [VIEW_MODES.CARDS, "一覧カード"],
    [VIEW_MODES.TABLE, "センター表"],
  ].forEach(([mode, label]) => {
    const tab = el("button", "centers-view-tab", label);
    tab.type = "button";
    tab.dataset.view = mode;
    tab.setAttribute("role", "tab");
    tab.addEventListener("click", () => {
      if (viewMode === mode) return;
      viewMode = mode;
      saveViewMode(mode);
      render();
    });
    viewTabs.appendChild(tab);
  });
  return viewTabs;
}

// センター曲を持つメンバーだけをチップにする（現役→卒業の順）
function buildMemberChips() {
  const centerNames = new Set(allRows.flatMap((row) => row.center.centerNames));
  const members = MEMBERS.filter((member) => centerNames.has(member.name)).sort((a, b) => {
    const statusOrder = (member) => (member.status === MEMBER_STATUS.ACTIVE ? 0 : 1);
    return statusOrder(a) - statusOrder(b);
  });
  const row = el("div", "center-member-chips");
  const allChip = el("button", "center-member-chip", "すべて");
  allChip.type = "button";
  allChip.dataset.memberName = "";
  row.appendChild(allChip);
  members.forEach((member) => {
    const chip = el("button", "center-member-chip");
    chip.type = "button";
    chip.dataset.memberName = member.name;
    const dot = el("span", "center-member-chip-dot");
    dot.style.backgroundColor = member.memberColor.hex;
    chip.append(dot, document.createTextNode(member.status === MEMBER_STATUS.ACTIVE ? member.name : `${member.name}（卒業）`));
    row.appendChild(chip);
  });
  row.addEventListener("click", (event) => {
    const chip = event.target.closest(".center-member-chip");
    if (!chip) return;
    filterState.memberName = chip.dataset.memberName || null;
    render();
  });
  return row;
}

function buildControls() {
  const controls = el("div", "centers-controls");

  const searchRow = el("div", "search-field-row");
  searchInput = el("input", "pill-search-input");
  searchInput.type = "text";
  searchInput.placeholder = "曲名で検索";
  searchInput.setAttribute("aria-label", "曲名で検索");
  searchClearButton = el("button", "search-clear-button", "×");
  searchClearButton.type = "button";
  searchClearButton.setAttribute("aria-label", "検索語をクリア");
  searchClearButton.hidden = true;
  searchInput.addEventListener("input", () => {
    filterState.query = searchInput.value;
    searchClearButton.hidden = searchInput.value === "";
    render();
  });
  searchClearButton.addEventListener("click", () => {
    searchInput.value = "";
    filterState.query = "";
    searchClearButton.hidden = true;
    render();
    searchInput.focus();
  });
  searchRow.append(searchInput, searchClearButton);
  controls.appendChild(searchRow);

  chipRow = buildMemberChips();
  controls.appendChild(chipRow);

  noCenterToggleLabel = el("label", "centers-toggle");
  noCenterToggle = el("input");
  noCenterToggle.type = "checkbox";
  noCenterToggle.addEventListener("change", () => {
    filterState.includeNoCenterSongs = noCenterToggle.checked;
    render();
  });
  noCenterToggleLabel.append(noCenterToggle, document.createTextNode("ソロ曲・2人の曲も表示する（センターの区別が無い曲）"));
  controls.appendChild(noCenterToggleLabel);

  summaryElement = el("p", "centers-summary");
  controls.appendChild(summaryElement);
  return controls;
}

function buildIntro() {
  const intro = el("div", "centers-intro");
  intro.appendChild(el("p", "centers-intro-text", "シングル・アルバム・配信曲のセンターを、メンバーカラーで表示しています。曲名をタップすると収録曲一覧、名前をタップするとメンバーのページを開きます。"));
  return intro;
}

function focusSong(songId) {
  if (!songId) return;
  const findTarget = () =>
    viewMode === VIEW_MODES.TABLE
      ? tableScroll.querySelector(`.ct-song[data-song-id="${CSS.escape(songId)}"]`)
      : listElement.querySelector(`[data-song-id="${CSS.escape(songId)}"]`);
  let target = findTarget();
  if (!target) {
    // 絞り込みで隠れている・ソロ曲で非表示の場合は、条件を外してから探す
    filterState.memberName = null;
    filterState.query = "";
    searchInput.value = "";
    searchClearButton.hidden = true;
    const row = allRows.find((candidate) => candidate.song.id === songId);
    if (row && ["solo", "duo"].includes(row.center.state)) {
      filterState.includeNoCenterSongs = true;
      noCenterToggle.checked = true;
    }
    render();
    target = findTarget();
  }
  if (!target) return;
  target.scrollIntoView({ block: "center", inline: "center" });
  target.classList.add("is-search-focus");
  setTimeout(() => target.classList.remove("is-search-focus"), 2400);
}

// 画面を開くたびに呼ぶ。中身は初回だけ組み立て、絞り込みの状態はそのまま残す。
// options.focusSongId：収録曲一覧の「歴代センター一覧へ」から来たとき、その曲の行へスクロールする
export function openCentersScreen(options = {}) {
  if (!container) return;
  if (!built) {
    container.innerHTML = "";
    listElement = el("div", "center-row-list");
    container.append(buildViewTabs(), buildIntro(), buildControls(), listElement, buildTablePanel());
    built = true;
  }
  render();
  focusSong(options.focusSongId);
}

// elements: { container }。
// options.onOpenSong(songId)：曲名をタップしたとき。options.onOpenMember(member)：メンバーのマスをタップしたとき。
export function initCentersScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onOpenSong: options.onOpenSong ?? null, onOpenMember: options.onOpenMember ?? null };
}
