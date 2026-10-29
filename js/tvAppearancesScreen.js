// 「音楽番組出演・披露曲アーカイブ」ページ（#tv-appearances-screen。2026-10-29新設・本人の要望）。
// 過去に出演した音楽番組と、披露した曲を一覧で見られるようにする。
// ・新しい出演から順に、最初は20件。「もっと見る」で20件ずつ足す（スマホで長くなりすぎないように）
// ・年・番組のシリーズで絞り込み、番組名・曲名・コラボの相手・メモ（出演メンバー等）で検索できる
// ・節目（Mステ初出演など）は特別な印。曲名を押すと収録曲一覧のその曲へ（アプリの84曲にある曲だけ。カバー・コラボは文字だけ）
// ・【2026-10-30】出演が「要確認」の回と、ファンの記録だけの曲は普段は出さない。
//   「要確認の記録も表示」（最初はオフ）を入れたときだけ、印を付けて出す。
import { TV_APPEARANCES, TV_APPEARANCE_RECORDS } from "./data/tvAppearances.js";
import { formatHistoryDate } from "./anniversaryHistoryModel.js";
import {
  COLLAB_KIND_LABELS,
  availableSeries,
  availableYears,
  describeAppearanceKind,
  filterTvAppearances,
  groupTvAppearancesByYear,
} from "./tvAppearanceModel.js";

const PAGE_SIZE = 20;

let container = null;
let callbacks = {};
let listElement = null;
let countElement = null;
let moreButton = null;
let searchInput = null;
let yearSelect = null;
let unverifiedToggle = null;
const state = { series: "all", query: "", year: "all", shown: PAGE_SIZE, showUnverified: false };
const hiddenCount = TV_APPEARANCE_RECORDS.length - TV_APPEARANCES.length;

// いま対象にする記録（普段は公開する記録だけ。「要確認の記録も表示」のときは全部）
function currentRecords() {
  return state.showUnverified ? TV_APPEARANCE_RECORDS : TV_APPEARANCES;
}

function currentFilter() {
  return { ...state, includeUnverified: state.showUnverified };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function buildItem(entry) {
  const kind = describeAppearanceKind(entry);
  const item = el("li", `tv-item${entry.milestone ? " is-milestone" : ""}${entry.publish === false ? " is-unverified" : ""}`);
  item.dataset.date = entry.date;
  if (entry.milestone) item.appendChild(el("p", "tv-milestone", `★ ${entry.milestone}`));
  const head = el("div", "tv-item-head");
  head.appendChild(el("span", "tv-item-date", formatHistoryDate(entry.date)));
  if (entry.station) head.appendChild(el("span", "tv-badge", entry.station));
  head.appendChild(el("span", `tv-badge${kind.songUnknown || kind.isRebroadcast ? " is-unconfirmed" : ""}`, kind.label));
  if (entry.tvPremiere) head.appendChild(el("span", "tv-badge is-first", "テレビ初披露"));
  if (entry.confidence !== "確認済み") head.appendChild(el("span", "tv-badge is-unconfirmed", entry.confidence === "準確認" ? "出典1件" : "要確認"));
  item.appendChild(head);
  item.appendChild(el("p", "tv-item-program", entry.program));
  const songs = el("div", "tv-item-songs");
  if (kind.songUnknown) songs.appendChild(el("span", "tv-song is-plain", "披露曲：未確認"));
  (entry.songs ?? []).forEach((song) => {
    // 曲名の出典が1件だけの曲は、そのことを書き添える
    const label = `${song.title}${song.note ? `（${song.note}）` : ""}${song.confidence === "準確認" ? "［曲名は出典1件］" : ""}`;
    if (song.songId) {
      const button = el("button", "tv-song", `♪ ${label}`);
      button.type = "button";
      button.addEventListener("click", () => callbacks.onOpenSong?.(song.songId));
      songs.appendChild(button);
    } else songs.appendChild(el("span", "tv-song is-plain", `♪ ${label}`));
  });
  (entry.collabs ?? []).forEach((collab) => {
    const kind = COLLAB_KIND_LABELS[collab.kind] ? `${COLLAB_KIND_LABELS[collab.kind]}：` : "";
    const text = `${kind}${collab.title ?? ""}${collab.with ? `（${collab.with}）` : ""}${collab.note ? `・${collab.note}` : ""}${collab.confidence === "準確認" ? "［出典1件］" : ""}`;
    songs.appendChild(el("span", "tv-song is-plain", `🤝 ${text}`));
  });
  // 「要確認の記録も表示」のときだけ：ファンの記録・会場のセットリストだけの曲（リンクは付けない）
  if (state.showUnverified) {
    (entry.unverifiedSongs ?? []).forEach((song) => songs.appendChild(el("span", "tv-song is-plain is-unverified", `♪ ${song.title}（要確認）`)));
    (entry.unverifiedCollabs ?? []).forEach((collab) =>
      songs.appendChild(el("span", "tv-song is-plain is-unverified", `🤝 ${collab.title ?? ""}${collab.with ? `（${collab.with}）` : ""}（要確認）`))
    );
  }
  item.appendChild(songs);
  // メモ・出典は「くわしく」で開く（スマホで1件が長くなりすぎないように）
  if (entry.notes || entry.verificationNote || entry.sources?.length) {
    const details = el("details", "tv-item-details");
    details.appendChild(el("summary", null, "くわしく（メモ・出典）"));
    if (entry.notes) details.appendChild(el("p", "tv-item-notes", entry.notes));
    if (entry.sameContentAs) details.appendChild(el("p", "tv-item-notes", `${formatHistoryDate(entry.sameContentAs)}の放送と同じ内容です。`));
    if (entry.milestoneCandidate) details.appendChild(el("p", "tv-item-notes", `番組初出演について：${entry.milestoneCandidate}`));
    if (entry.verificationNote) details.appendChild(el("p", "tv-item-notes", `再調査（2026年10月30日）：${entry.verificationNote}`));
    if (entry.sources?.length) {
      const sources = el("p", "tv-item-sources");
      sources.appendChild(document.createTextNode("出典："));
      entry.sources.forEach((source, index) => {
        if (index) sources.appendChild(document.createTextNode("・"));
        const link = el("a", null, source.title || source.type);
        link.href = source.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        sources.appendChild(link);
      });
      details.appendChild(sources);
    }
    item.appendChild(details);
  }
  return item;
}

function renderList() {
  const records = currentRecords();
  const filtered = filterTvAppearances(records, currentFilter());
  const hiddenNote = !state.showUnverified && hiddenCount > 0 ? `・要確認の${hiddenCount}件は非表示` : "";
  countElement.textContent = `${filtered.length}件（全${records.length}件${hiddenNote}）${filtered.length > state.shown ? `のうち新しい${state.shown}件を表示` : ""}`;
  listElement.innerHTML = "";
  moreButton.hidden = filtered.length <= state.shown;
  moreButton.textContent = `もっと見る（あと${Math.max(0, filtered.length - state.shown)}件）`;
  if (!filtered.length) {
    listElement.appendChild(el("p", "tv-note", "見つかりませんでした。番組名・曲名・年（例：2021）・メンバー名で探せます。"));
    return;
  }
  groupTvAppearancesByYear(filtered.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, state.shown)).forEach((group) => {
    const total = filtered.filter((entry) => entry.date.startsWith(group.year)).length;
    listElement.appendChild(el("h3", "tv-year-heading", `${group.year}年（${total}件）`));
    const list = el("ol", "tv-list");
    group.entries.forEach((entry) => list.appendChild(buildItem(entry)));
    listElement.appendChild(list);
  });
}

function resetPaging() {
  state.shown = PAGE_SIZE;
}

function buildControls() {
  const controls = el("div", "tv-controls");
  searchInput = el("input", "tv-search");
  searchInput.type = "search";
  searchInput.placeholder = "番組名・曲名・メンバーで探す（例：ウィークエンドシトロン）";
  searchInput.addEventListener("input", () => {
    state.query = searchInput.value;
    resetPaging();
    renderList();
  });
  controls.appendChild(searchInput);
  const row = el("div", "tv-filter-row");
  yearSelect = el("select", "tv-year-select");
  yearSelect.setAttribute("aria-label", "年で絞り込む");
  [["all", "すべての年"], ...availableYears(TV_APPEARANCE_RECORDS).map((year) => [year, `${year}年`])].forEach(([value, label]) => {
    const option = el("option", null, label);
    option.value = value;
    yearSelect.appendChild(option);
  });
  yearSelect.addEventListener("change", () => {
    state.year = yearSelect.value;
    resetPaging();
    renderList();
  });
  row.appendChild(yearSelect);
  controls.appendChild(row);
  const chips = el("div", "tv-chips");
  [{ id: "all", label: "すべての番組" }, ...availableSeries(TV_APPEARANCE_RECORDS)].forEach((series) => {
    const chip = el("button", `tv-chip${series.id === state.series ? " is-active" : ""}`, series.label);
    chip.type = "button";
    chip.dataset.series = series.id;
    chip.addEventListener("click", () => {
      state.series = series.id;
      chips.querySelectorAll(".tv-chip").forEach((c) => c.classList.toggle("is-active", c.dataset.series === series.id));
      resetPaging();
      renderList();
    });
    chips.appendChild(chip);
  });
  controls.appendChild(chips);
  // 要確認の記録（出演が確かめられない回・ファンの記録だけの曲）を出すかどうか。最初はオフ
  const toggleLabel = el("label", "tv-unverified-toggle");
  unverifiedToggle = el("input");
  unverifiedToggle.type = "checkbox";
  unverifiedToggle.checked = state.showUnverified;
  unverifiedToggle.addEventListener("change", () => {
    state.showUnverified = unverifiedToggle.checked;
    resetPaging();
    renderList();
  });
  toggleLabel.append(unverifiedToggle, document.createTextNode("要確認の記録も表示"));
  controls.appendChild(toggleLabel);
  countElement = el("p", "tv-count");
  controls.appendChild(countElement);
  return controls;
}

// options.query：最初に入れておく検索語（曲から開いたとき等）。options.focusDate：その日の出演を目立たせて表示
export function openTvAppearancesScreen(options = {}) {
  if (!container) return;
  if (!listElement) {
    container.innerHTML = "";
    container.appendChild(el("p", "tv-intro", "＝LOVEが出演した音楽番組と、披露した曲の記録です（新しい順）。曲名を押すと収録曲一覧のその曲へ移動します。"));
    container.appendChild(buildControls());
    listElement = el("div", "tv-results");
    container.appendChild(listElement);
    moreButton = el("button", "tv-more-button", "もっと見る");
    moreButton.type = "button";
    moreButton.addEventListener("click", () => {
      state.shown += PAGE_SIZE;
      renderList();
    });
    container.appendChild(moreButton);
    container.appendChild(el("p", "tv-note", "公式サイト・番組サイト・報道で確認できた出演を載せています。「出典1件」は確認が1件だけの記録、「披露曲：未確認」は出演は確かめられたが歌った曲が確かめられない回です（推測では埋めていません）。ファンの記録だけの出演・曲は「要確認の記録も表示」を入れたときだけ出ます。深夜・地方局・CS の番組は漏れがあるかもしれません。"));
  }
  if (typeof options.query === "string" || options.focusDate) {
    state.query = typeof options.query === "string" ? options.query : "";
    state.series = "all";
    state.year = "all";
    searchInput.value = state.query;
    yearSelect.value = "all";
    container.querySelectorAll(".tv-chip").forEach((c) => c.classList.toggle("is-active", c.dataset.series === "all"));
  }
  resetPaging();
  if (options.focusDate && !TV_APPEARANCES.some((entry) => entry.date === options.focusDate) && TV_APPEARANCE_RECORDS.some((entry) => entry.date === options.focusDate)) {
    // 指定された回が要確認の記録にしか無いときは、要確認の記録も出す（リンク先が見つからないことを防ぐ）
    state.showUnverified = true;
    unverifiedToggle.checked = true;
  }
  if (options.focusDate) {
    // 目立たせる回が表示の範囲に入るまで広げる
    const index = filterTvAppearances(currentRecords(), currentFilter()).sort((a, b) => (a.date < b.date ? 1 : -1)).findIndex((entry) => entry.date === options.focusDate);
    if (index >= 0) state.shown = Math.max(PAGE_SIZE, Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE);
  }
  renderList();
  if (options.focusDate) {
    const target = listElement.querySelector(`.tv-item[data-date="${options.focusDate}"]`);
    if (target) {
      target.classList.add("is-focused");
      requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
    }
  }
}

// elements: { container }。options.onOpenSong(songId)
export function initTvAppearancesScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onOpenSong: options.onOpenSong ?? null };
}
