// 「テレビ出演（バラエティ・情報番組）」のページ（#tv-variety-screen。2026-11-01新設・本人の依頼）。
// 単発・少数回のテレビ出演を、新しい順・年ごとに見られるようにする（歌の披露は「音楽番組」のページ）。
// ・初めは、いちばん新しい年だけを開き、ほかの年はたたむ（iPhone で長くなりすぎないように）
// ・絞り込み：出演の形・メンバー（members.js の表記と色）・年・放送局。番組名の検索。コメント出演・配信番組を含むかの切り替え
// ・1件ごとに［公式の告知］（＝LOVE 公式サイトの詳細ページ）へのリンク
// ・レギュラー番組は一覧に入れず、下に「レギュラー番組（別枠）」として番組名と期間だけを、たたんで出す
// 告知から機械的に作った短文は、番組の中身の要約に見えるので出さない（データにも入れていない）。
import { TV_VARIETY_RECORDS, TV_VARIETY_REGULARS, TV_VARIETY_STATION_FILTERS, TV_VARIETY_CHECKED_DATE } from "./data/tvVariety.js";
import { MEMBERS } from "./data/members.js";
import {
  TV_VARIETY_DEFAULT_FILTER,
  TV_VARIETY_FORMS,
  TV_VARIETY_FORM_LABELS,
  availableTvVarietyStations,
  availableTvVarietyYears,
  filterTvVariety,
  filterTvVarietyRegulars,
  formatRegularPeriod,
  formatTvVarietyDate,
  groupTvVarietyByYear,
  isDefaultTvVarietyFilter,
} from "./tvVarietyModel.js";

// 1つの年で最初に出す件数（年によっては70件を超えるので、iPhone で長くなりすぎないように）。続きは［この年のあと○件］で
export const TV_VARIETY_YEAR_PAGE_SIZE = 20;

let container = null;
let callbacks = {};
let resultsElement = null;
let countElement = null;
let resetButton = null;
let memberNote = null;
let regularsElement = null;
const controls = {};
const state = { ...TV_VARIETY_DEFAULT_FILTER };
const memberById = new Map(MEMBERS.map((member) => [member.id, member]));
// 年ごとに今出している件数（条件を変えたら初めに戻す）
let shownByYear = new Map();
// 開いている年（null＝まだ決めていない。条件を変えたら、いちばん新しい年だけ／検索中は全部、に戻す）
let openYears = null;

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

// メンバーの名前（メンバーカラーの点つき）
function buildMemberTag(memberId) {
  const member = memberById.get(memberId);
  const tag = el("span", "tvv-member");
  const dot = el("i", "tvv-member-dot");
  dot.setAttribute("aria-hidden", "true");
  if (member?.memberColor?.hex) dot.style.background = member.memberColor.hex;
  tag.append(dot, document.createTextNode(member?.name ?? memberId));
  return tag;
}

function buildItem(record) {
  const item = el("li", "tvv-item");
  item.dataset.id = record.id;
  const head = el("p", "tvv-item-head");
  head.appendChild(el("span", "tvv-item-date", formatTvVarietyDate(record)));
  if (record.time) head.appendChild(el("span", "tvv-item-time", record.time));
  item.appendChild(head);
  item.appendChild(el("p", "tvv-item-program", record.program));
  // 放送局と［公式の告知］を1行に（1件の高さを抑える）
  const meta = el("div", "tvv-item-meta");
  meta.appendChild(el("span", "tvv-item-station", record.station || "放送局は告知に記載なし"));
  meta.appendChild(buildSourceLink(record));
  item.appendChild(meta);
  // 出演者（メンバーカラーの点つき）と、告知から読み取れた出演の形・印を1つの行に
  const people = el("div", "tvv-item-people");
  if (record.form === "group") people.appendChild(el("span", "tvv-badge is-group", "＝LOVE 名義"));
  else record.memberIds.forEach((memberId) => people.appendChild(buildMemberTag(memberId)));
  const marks = [...(record.roles ?? [])];
  if (record.streaming) marks.push("配信番組");
  marks.forEach((mark) => people.appendChild(el("span", `tvv-badge${mark === "コメント出演" ? " is-comment" : ""}`, mark)));
  item.appendChild(people);
  if (record.rebroadcast) item.appendChild(el("p", "tvv-item-note", `再放送：${record.rebroadcast}（同じ回なので数えていません）`));
  if (record.merged) item.appendChild(el("p", "tvv-item-note", "続けての告知を1件にまとめています"));
  return item;
}

// ［公式の告知］（＝LOVE 公式サイトの詳細ページ。新しいタブ）。外へ出ることが分かる印は SVG（文字の ↗ は字体によって／に見えるため）
function buildSourceLink(record) {
  const link = el("a", "tvv-source-link", "公式の告知");
  link.href = record.officialUrls[0];
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `公式の告知（${record.program}・${formatTvVarietyDate(record)}）を新しいタブで開く`);
  const svgNs = "http://www.w3.org/2000/svg";
  const icon = document.createElementNS(svgNs, "svg");
  icon.setAttribute("viewBox", "0 0 16 16");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("class", "tvv-external-icon");
  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("d", "M9 2.5h4.5V7M13.5 2.5 7 9M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5");
  icon.appendChild(path);
  link.appendChild(icon);
  return link;
}

function currentFilter() {
  return { ...state };
}

function renderResults() {
  const filtered = filterTvVariety(TV_VARIETY_RECORDS, currentFilter());
  countElement.textContent = isDefaultTvVarietyFilter(state) ? `全${TV_VARIETY_RECORDS.length}件` : `${filtered.length}件（全${TV_VARIETY_RECORDS.length}件中）`;
  resetButton.hidden = isDefaultTvVarietyFilter(state);
  memberNote.hidden = state.memberId === "all";
  resultsElement.replaceChildren();
  if (!filtered.length) {
    resultsElement.appendChild(el("p", "tvv-empty", "この条件の出演は見つかりませんでした。条件を減らすか、［条件を戻す］を押してください。"));
  } else {
    const groups = groupTvVarietyByYear(filtered);
    // 検索の言葉があるときは結果が少ないので全部の年を開く。それ以外は、いちばん新しい年だけを開く
    if (!openYears) openYears = new Set(state.query.trim() ? groups.map((group) => group.year) : groups.slice(0, 1).map((group) => group.year));
    groups.forEach((group) => {
      const details = el("details", "tvv-year");
      details.dataset.year = group.year;
      details.open = openYears.has(group.year);
      details.addEventListener("toggle", () => {
        if (details.open) openYears.add(group.year);
        else openYears.delete(group.year);
      });
      const summary = el("summary", "tvv-year-heading");
      summary.append(el("span", "tvv-year-label", `${group.year}年`), el("span", "tvv-year-count", `${group.records.length}件`));
      details.appendChild(summary);
      const list = el("ol", "tvv-list");
      const shown = shownByYear.get(group.year) ?? TV_VARIETY_YEAR_PAGE_SIZE;
      group.records.slice(0, shown).forEach((record) => list.appendChild(buildItem(record)));
      details.appendChild(list);
      const rest = group.records.length - shown;
      if (rest > 0) {
        const more = el("button", "tvv-more", `${group.year}年のあと${rest}件を見る`);
        more.type = "button";
        more.addEventListener("click", () => {
          shownByYear.set(group.year, shown + TV_VARIETY_YEAR_PAGE_SIZE);
          const firstNew = group.records[shown]?.id;
          renderResults();
          // 足した最初の1件へ、読み上げ・キーボードの位置を移す
          resultsElement.querySelector(`.tvv-item[data-id="${firstNew}"]`)?.setAttribute("tabindex", "-1");
          resultsElement.querySelector(`.tvv-item[data-id="${firstNew}"]`)?.focus({ preventScroll: true });
        });
        details.appendChild(more);
      }
      resultsElement.appendChild(details);
    });
  }
  renderRegulars();
}

function renderRegulars() {
  const regulars = filterTvVarietyRegulars(TV_VARIETY_REGULARS, currentFilter());
  const wasOpen = regularsElement.open;
  regularsElement.replaceChildren();
  const summary = el("summary", "tvv-regulars-heading");
  summary.append(el("span", null, "レギュラー番組（別枠）"), el("span", "tvv-year-count", `${regulars.length}番組`));
  regularsElement.appendChild(summary);
  regularsElement.appendChild(el("p", "tvv-note", "冠番組や、毎週・毎月出ていた番組は上の一覧に入れず、ここに番組名と期間だけを載せています。期間は公式サイトに告知があった期間です。"));
  if (!regulars.length) regularsElement.appendChild(el("p", "tvv-empty", "この条件のレギュラー番組はありません。"));
  const list = el("ul", "tvv-regular-list");
  regulars.forEach((regular) => {
    const item = el("li", "tvv-regular");
    item.appendChild(el("p", "tvv-regular-program", regular.program));
    // 誰の番組か（同じ番組名のシーズンレギュラーを見分けるため）は名前だけを短く。3人以上は「ほか」
    const names = regular.memberIds.map((memberId) => memberById.get(memberId)?.name).filter(Boolean);
    const who = names.length ? `・${names.slice(0, 2).join("・")}${names.length > 2 ? ` ほか${names.length - 2}人` : ""}` : "";
    item.appendChild(el("p", "tvv-regular-meta", `${regular.kind}・${formatRegularPeriod(regular)}${who}`));
    list.appendChild(item);
  });
  regularsElement.appendChild(list);
  regularsElement.open = wasOpen;
}

// 条件が変わったとき：年ごとの「続き」を初めに戻して描き直す
function update() {
  shownByYear = new Map();
  openYears = null;
  renderResults();
}

function buildSelect(className, label, options, onChange) {
  const select = el("select", className);
  select.setAttribute("aria-label", label);
  options.forEach(([value, text]) => {
    const option = el("option", null, text);
    option.value = value;
    select.appendChild(option);
  });
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function buildChipGroup(className, label, items, getActive, onSelect) {
  const group = el("div", className);
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", label);
  items.forEach((item) => {
    const chip = el("button", "tvv-chip");
    chip.type = "button";
    chip.dataset.value = item.id;
    if (item.dotColor) {
      const dot = el("i", "tvv-member-dot");
      dot.setAttribute("aria-hidden", "true");
      dot.style.background = item.dotColor;
      chip.appendChild(dot);
    }
    chip.appendChild(document.createTextNode(item.label));
    chip.addEventListener("click", () => {
      onSelect(item.id);
      syncControls();
      update();
    });
    group.appendChild(chip);
  });
  group.sync = () => {
    group.querySelectorAll(".tvv-chip").forEach((chip) => {
      const active = chip.dataset.value === getActive();
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
  };
  return group;
}

function buildToggle(label, key) {
  const wrapper = el("label", "tvv-toggle");
  const input = el("input");
  input.type = "checkbox";
  input.addEventListener("change", () => {
    state[key] = input.checked;
    update();
  });
  wrapper.append(input, document.createTextNode(label));
  controls[key] = input;
  return wrapper;
}

// 画面の部品を今の条件に合わせる
function syncControls() {
  controls.search.value = state.query;
  controls.year.value = state.year;
  controls.station.value = state.station;
  controls.includeComment.checked = state.includeComment;
  controls.includeStreaming.checked = state.includeStreaming;
  controls.forms.sync();
  controls.members.sync();
}

function buildControls() {
  const box = el("div", "tvv-controls");
  controls.search = el("input", "tvv-search");
  controls.search.type = "search";
  controls.search.placeholder = "番組名で探す（例：ヒルナンデス）";
  // 狭い画面（320px）では例が切れるので短くする（幅は CSS では選べないので、開くときの画面の幅で決める）
  if (window.innerWidth < 360) controls.search.placeholder = "番組名で探す";
  controls.search.setAttribute("aria-label", "番組名で探す");
  controls.search.addEventListener("input", () => {
    state.query = controls.search.value;
    update();
  });
  box.appendChild(controls.search);

  box.appendChild(el("p", "tvv-label", "出演の形"));
  controls.forms = buildChipGroup("tvv-chips tvv-chips--forms", "出演の形", TV_VARIETY_FORMS, () => state.form, (value) => {
    state.form = value;
  });
  box.appendChild(controls.forms);
  box.appendChild(el("p", "tvv-hint", "＝LOVE 名義＝告知に個人名が無い出演（全員とは限りません）"));

  box.appendChild(el("p", "tvv-label", "メンバー"));
  const memberItems = [
    { id: "all", label: "指定なし" },
    ...MEMBERS.map((member) => ({ id: member.id, label: member.name, dotColor: member.memberColor?.hex ?? null })),
  ];
  controls.members = buildChipGroup("tvv-chips tvv-chips--members", "メンバー", memberItems, () => state.memberId, (value) => {
    state.memberId = value;
  });
  box.appendChild(controls.members);
  memberNote = el("p", "tvv-hint", "メンバーで絞ると、個人名の無い「＝LOVE 名義」の出演は出ません。");
  memberNote.hidden = true;
  box.appendChild(memberNote);

  const selects = el("div", "tvv-select-row");
  controls.year = buildSelect("tvv-select", "年で絞り込む", [["all", "すべての年"], ...availableTvVarietyYears(TV_VARIETY_RECORDS).map((year) => [year, `${year}年`])], (value) => {
    state.year = value;
    update();
  });
  controls.station = buildSelect(
    "tvv-select",
    "放送局で絞り込む",
    [["all", "すべての放送局"], ...availableTvVarietyStations(TV_VARIETY_RECORDS, TV_VARIETY_STATION_FILTERS).map((station) => [station.id, station.label])],
    (value) => {
      state.station = value;
      update();
    }
  );
  selects.append(controls.year, controls.station);
  box.appendChild(selects);

  const toggles = el("div", "tvv-toggle-row");
  toggles.append(buildToggle("コメント出演を含む", "includeComment"), buildToggle("配信番組を含む", "includeStreaming"));
  box.appendChild(toggles);

  const countRow = el("div", "tvv-count-row");
  countElement = el("p", "tvv-count");
  countElement.setAttribute("aria-live", "polite");
  resetButton = el("button", "tvv-reset", "条件を戻す");
  resetButton.type = "button";
  resetButton.addEventListener("click", () => {
    Object.assign(state, TV_VARIETY_DEFAULT_FILTER);
    syncControls();
    update();
  });
  countRow.append(countElement, resetButton);
  box.appendChild(countRow);
  return box;
}

function buildPage() {
  container.replaceChildren();
  // 音楽番組のページとの住み分け：歌の披露はあちら
  const musicLink = el("button", "tvv-music-link");
  musicLink.type = "button";
  musicLink.append(el("span", "tvv-music-link-text", "歌の披露は［音楽番組］へ"), el("span", "tvv-music-link-arrow", "→"));
  musicLink.addEventListener("click", () => callbacks.onOpenMusicShows?.());
  container.appendChild(musicLink);
  container.appendChild(el("p", "tvv-intro", "バラエティ・情報番組などへの単発の出演です（新しい順）。"));
  container.appendChild(buildControls());
  resultsElement = el("div", "tvv-results");
  container.appendChild(resultsElement);
  regularsElement = el("details", "tvv-regulars");
  container.appendChild(regularsElement);
  container.appendChild(
    el(
      "p",
      "tvv-note",
      `＝LOVE 公式サイトのスケジュールで出演の告知を確かめたものだけを載せています（2017年7月から。${formatCheckedDate(TV_VARIETY_CHECKED_DATE)}に確認）。公式 X やメンバーの SNS だけで告知された出演は、まだ入っていないことがあります。再放送は数えていません。深夜の番組の日付は、公式の告知の日付のままです。`
    )
  );
}

// options.memberId：そのメンバーで絞った一覧を開く。options.query：番組名を入れて開く（全体検索から）
export function openTvVarietyScreen(options = {}) {
  if (!container) return;
  if (!resultsElement) buildPage();
  // 開くたびに条件を初めに戻す（前にメンバーで絞ったまま、ホームから開いて件数が少なく見えないように）。
  // ［戻る］でこのページへ帰ってきたときは、この関数を通らないので条件はそのまま
  Object.assign(state, TV_VARIETY_DEFAULT_FILTER);
  if (options.memberId && memberById.has(options.memberId)) state.memberId = options.memberId;
  if (typeof options.query === "string") state.query = options.query;
  syncControls();
  update();
  // メンバーで絞って開いたとき：横に並んだメンバーの札を、選んだ人が見える所まで送る
  const activeChip = controls.members.querySelector(".tvv-chip.is-active");
  if (activeChip) controls.members.scrollLeft = Math.max(0, activeChip.offsetLeft - controls.members.clientWidth / 2 + activeChip.offsetWidth / 2);
}

// elements: { container }。options.onOpenMusicShows()：音楽番組のページを開く
export function initTvVarietyScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onOpenMusicShows: options.onOpenMusicShows ?? null };
}
