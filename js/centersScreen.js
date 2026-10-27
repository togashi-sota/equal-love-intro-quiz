// 歴代センター一覧画面（2026-10-27新設・本人承認の「案C」：独立ページ＋収録曲一覧からのリンク）。
// 曲を発売順に並べ、センターのメンバーを「メンバーカラーを背景にしたマス」で見せる。
// センターが誰かは js/data/songs.js、根拠の強さは js/data/centerSources.js、
// 判定・並び・文字色の計算は js/centerChart.js（画面に依存しない関数）に任せ、ここは表示だけを担当する。
// 曲・メンバーをタップしたときの画面移動は、呼び出し側（main.js）の onOpenSong / onOpenMember に任せる。
import { SONGS } from "./data/songs.js";
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { CENTER_SOURCES_RESEARCHED_AT } from "./data/centerSources.js";
import {
  CENTER_EVIDENCE_LABELS,
  CENTER_EVIDENCE_DESCRIPTIONS,
  buildCenterRows,
  filterCenterRows,
  countEvidenceKinds,
  describeCenterState,
  pickReadableTextColor,
} from "./centerChart.js";
import { normalizeForSearch } from "./songSearch.js";

let container = null;
let callbacks = { onOpenSong: null, onOpenMember: null };
let listElement = null;
let summaryElement = null;
let searchInput = null;
let searchClearButton = null;
let chipRow = null;
let noCenterToggle = null;
let built = false;

// 絞り込みの状態（同じ利用中だけ覚える。保存はしない）
const filterState = { memberName: null, query: "", includeNoCenterSongs: false };

const allRows = buildCenterRows(SONGS);
const memberByName = new Map(MEMBERS.map((member) => [member.name, member]));

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
    cell.addEventListener("click", () => callbacks.onOpenMember?.(member));
  } else {
    cell.disabled = true;
  }
  return cell;
}

// 「全員」のマス：現役メンバーのカラーを横に並べた背景にする（特定の1人の色にしない）
function buildAllMembersCell() {
  const colors = MEMBERS.filter((member) => member.status === MEMBER_STATUS.ACTIVE).map((member) => member.memberColor.hex);
  const stops = colors.map((color, index) => `${color} ${(index / colors.length) * 100}% ${((index + 1) / colors.length) * 100}%`);
  const cell = el("span", "center-cell is-all has-outline", "全員");
  cell.style.background = `linear-gradient(90deg, ${stops.join(", ")})`;
  return cell;
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

function buildEvidenceBadge(center) {
  const label = `根拠：${center.evidenceLabel}`;
  if (center.sourceUrl) {
    const link = el("a", `center-evidence-badge is-${center.evidenceKind}`, `${label} ↗`);
    link.href = center.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.title = center.sourceNote ?? "";
    return link;
  }
  const badge = el("span", `center-evidence-badge is-${center.evidenceKind}`, label);
  badge.title = center.sourceNote ?? "";
  return badge;
}

function buildRow(row) {
  const card = el("article", `center-row is-${row.center.state}`);
  card.dataset.songId = row.song.id;

  const info = el("div", "center-row-info");
  const tags = el("div", "center-row-tags");
  tags.appendChild(el("span", `center-tag is-work-${row.work.kind}`, row.work.label));
  tags.appendChild(el("span", `center-tag is-role-${row.role.kind}`, row.role.label));
  tags.appendChild(el("span", "center-row-date", formatDate(row.song.releaseDate)));
  info.appendChild(tags);

  const titleButton = el("button", "center-row-title", row.song.title);
  titleButton.type = "button";
  titleButton.setAttribute("aria-label", `${row.song.title}を収録曲一覧で見る`);
  titleButton.addEventListener("click", () => callbacks.onOpenSong?.(row.song.id));
  info.appendChild(titleButton);

  if (row.center.evidenceKind) {
    info.appendChild(buildEvidenceBadge(row.center));
    // 確認済みでない（ファン資料のみ・アプリ内設定・根拠未確認）ものは、理由を一行で必ず見せる
    if (!row.center.isConfirmed && row.center.sourceNote) {
      info.appendChild(el("p", "center-row-note", row.center.sourceNote));
    }
  }

  card.append(info, buildCenterCells(row));
  return card;
}

function renderList() {
  const rows = filterCenterRows(allRows, { ...filterState, normalize: normalizeForSearch });
  listElement.innerHTML = "";
  if (rows.length === 0) {
    listElement.appendChild(el("p", "empty-state-note", "条件に合う曲が見つかりませんでした"));
  } else {
    rows.forEach((row) => listElement.appendChild(buildRow(row)));
  }
  const counts = countEvidenceKinds(rows);
  const parts = Object.keys(CENTER_EVIDENCE_LABELS)
    .filter((kind) => counts[kind])
    .map((kind) => `${CENTER_EVIDENCE_LABELS[kind]} ${counts[kind]}`);
  summaryElement.textContent = `表示中 ${rows.length}曲${parts.length ? `（根拠：${parts.join("・")}）` : ""}`;
  chipRow.querySelectorAll(".center-member-chip").forEach((chip) => {
    const isActive = (chip.dataset.memberName || null) === filterState.memberName;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
  });
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
    renderList();
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
    renderList();
  });
  searchClearButton.addEventListener("click", () => {
    searchInput.value = "";
    filterState.query = "";
    searchClearButton.hidden = true;
    renderList();
    searchInput.focus();
  });
  searchRow.append(searchInput, searchClearButton);
  controls.appendChild(searchRow);

  chipRow = buildMemberChips();
  controls.appendChild(chipRow);

  const toggleLabel = el("label", "centers-toggle");
  noCenterToggle = el("input");
  noCenterToggle.type = "checkbox";
  noCenterToggle.addEventListener("change", () => {
    filterState.includeNoCenterSongs = noCenterToggle.checked;
    renderList();
  });
  toggleLabel.append(noCenterToggle, document.createTextNode("ソロ曲・2人の曲も表示する（センターの区別が無い曲）"));
  controls.appendChild(toggleLabel);

  summaryElement = el("p", "centers-summary");
  controls.appendChild(summaryElement);
  return controls;
}

function buildLegend() {
  const legend = el("details", "centers-legend");
  legend.appendChild(el("summary", null, "根拠ラベルについて"));
  const list = el("ul", "centers-legend-list");
  Object.keys(CENTER_EVIDENCE_LABELS).forEach((kind) => {
    const item = el("li");
    item.appendChild(el("span", `center-evidence-badge is-${kind}`, CENTER_EVIDENCE_LABELS[kind]));
    item.appendChild(el("span", "centers-legend-text", CENTER_EVIDENCE_DESCRIPTIONS[kind]));
    list.appendChild(item);
  });
  legend.appendChild(list);
  legend.appendChild(
    el(
      "p",
      "centers-legend-text",
      `「ファン資料のみ」「アプリ内設定・公式未確認」「根拠未確認」の曲は、公式に確認できた情報ではありません。「アプリ内設定・公式未確認」は、このアプリの作成者が設定したもので、メンバー本人や公式が指定したものではありません。調査日：${formatDate(CENTER_SOURCES_RESEARCHED_AT)}。`
    )
  );
  return legend;
}

function buildIntro() {
  const intro = el("div", "centers-intro");
  intro.appendChild(el("p", "centers-intro-text", "シングル・アルバム・配信曲を発売順に並べ、センターのメンバーをメンバーカラーで表示しています。曲名をタップすると収録曲一覧、名前をタップするとメンバーのページを開きます。"));
  intro.appendChild(buildLegend());
  return intro;
}

function focusSong(songId) {
  if (!songId) return;
  let target = listElement.querySelector(`[data-song-id="${CSS.escape(songId)}"]`);
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
    renderList();
    target = listElement.querySelector(`[data-song-id="${CSS.escape(songId)}"]`);
  }
  if (!target) return;
  target.scrollIntoView({ block: "center" });
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
    container.append(buildIntro(), buildControls(), listElement);
    built = true;
  }
  renderList();
  focusSong(options.focusSongId);
}

// elements: { container }。
// options.onOpenSong(songId)：曲名をタップしたとき。options.onOpenMember(member)：メンバーのマスをタップしたとき。
export function initCentersScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onOpenSong: options.onOpenSong ?? null, onOpenMember: options.onOpenMember ?? null };
}
