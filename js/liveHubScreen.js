// 【ライブ】ページ（#live-hub-screen。2026-10-28新設・本人指示）。
// これまで「＝LOVEについて→ライブ」タブ・収録曲一覧の各曲・ライブ初心者ガイドに分かれていた
// ライブの情報を、目的別の入口（タイル）から調べられる1つのページにまとめる。
//
//   トップ（タイル）─┬ 過去のライブを調べる（ライブ履歴）─→ セットリスト／ライブ映像
//                   ├ セットリストを見る（公演を選ぶ）──→ セットリスト ─→ 曲（収録曲一覧）
//                   ├ 曲からライブを探す ─────────→ セットリスト／ライブ映像
//                   ├ ライブ映像を探す（曲名で絞り込み・発売順の一覧）
//                   ├ ライブ初心者ガイド（既存の画面へ）
//                   └ コールを調べる（既存のライブコールモードへ）
//
// 画面（showScreen の単位）は "liveHub" の1つだけで、中の表示（view）をこのファイルが切り替える
// （遊び方ガイドの「目次⇄各ページ」と同じ考え方）。どこから来たかを stack に積み、ヘッダーの「戻る」で
// 1つ前の表示（とそのスクロール位置）へ戻る。積んだ表示が1つだけのときは画面を出る（main.js の onExit）。
// 入力した曲名・開いた「詳細」・各表示のスクロール位置は、同じ利用中だけ覚える（保存はしない）。
//
// データ：js/data/liveHistory.js（公演カード）、js/data/setlists.js（セットリスト・映像商品）。
// 計算と文の組み立て：js/liveSetlistStats.js。セットリストの行・映像カードの部品：js/setlistView.js。
import { SONGS } from "./data/songs.js";
import { LIVE_EVENTS, LIVE_STATUS } from "./data/liveHistory.js";
import { SETLIST_PERFORMANCES, SETLIST_SECTION_LABELS, SETLIST_FORM_LABELS, UNVERIFIED_SETLIST_PERFORMANCES, LIVE_VIDEO_PRODUCTS } from "./data/setlists.js";
import {
  formatJapaneseDate,
  summarizeSongLive,
  buildLiveSummarySentences,
  findVideosForSong,
  findVideosBySongQuery,
  findPerformancesForLive,
  groupPerformancesByYear,
  findVideosForPerformance,
  findVideosForLive,
  sortVideosByRelease,
  findNextAnnouncedLive,
  setlistButtonLabel,
} from "./liveSetlistStats.js";
import { buildVideoCard } from "./setlistView.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

export const LIVE_HUB_VIEWS = ["home", "history", "setlists", "setlistDetail", "songLive", "videos"];

// トップのタイル。action は「この画面の中の表示」か「既存の別画面」（main.js の openSearchFeatureAction と同じ形式）
export const LIVE_HUB_TILES = [
  { id: "history", label: "過去のライブを調べる", description: "日程・会場・公演ごとの記録", view: "history", tone: "pink" },
  { id: "setlists", label: "セットリストを見る", description: "公演を選んで曲順を見る", view: "setlists", tone: "lavender" },
  { id: "songLive", label: "曲からライブを探す", description: "その曲を歌った公演", view: "songLive", tone: "blue" },
  { id: "videos", label: "ライブ映像を探す", description: "Blu-ray・DVD・公式配信", view: "videos", tone: "green" },
  { id: "guide", label: "ライブ初心者ガイド", description: "準備・持ち物・マナー", action: { type: "click", selector: "#live-guide-link" }, tone: "yellow" },
  { id: "call", label: "コールを調べる", description: "コールの確認・練習", action: { type: "specialMode", modeId: "liveCallMode" }, tone: "orange" },
];

// タイルのアイコン（固定の SVG 文字列。外部の入力は入らない）
const TILE_ICONS = {
  history: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" stroke-width="2"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="15" r="1.8" fill="currentColor"/></svg>',
  setlists: '<svg viewBox="0 0 24 24" fill="none"><path d="M10 6h10M10 12h10M10 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M4 5.5 5.5 4.5V8M4 11.5c.4-.6 2.5-.8 2 .6L4 14h2.5M4 17h2.2l-1 1.2c1 .1 1.2 1.5 0 1.8-.5.1-1 0-1.2-.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  songLive: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 17V5.5l9-2v11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6.5" cy="17" r="2.5" stroke="currentColor" stroke-width="2"/><circle cx="15.5" cy="14.5" r="2.5" stroke="currentColor" stroke-width="2"/></svg>',
  videos: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" stroke-width="2"/><path d="m10 9 5 3-5 3V9Z" fill="currentColor"/></svg>',
  guide: '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="3" width="6" height="10" rx="3" stroke="currentColor" stroke-width="2"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  call: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10v4h3l6 4V6L7 10H4Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const VIEW_TITLES = {
  history: "過去のライブ",
  setlists: "セットリスト",
  setlistDetail: "セットリスト",
  songLive: "曲からライブを探す",
  videos: "ライブ映像を探す",
};

const LIVE_TYPE_LABELS = { tour: "ツアー", festival: "フェス出演", solo: "単独公演" };
const VERIFICATION_LABELS = { official: "公式で確認", press: "報道で確認" };
const SONG_RESULT_LIMIT = 5;

const songById = new Map(SONGS.map((song) => [song.id, song]));
const performanceById = new Map(SETLIST_PERFORMANCES.map((performance) => [performance.id, performance]));

let container = null;
let callbacks = {};
const viewElements = new Map();
// 表示の積み重ね。{ view, scrollY, performanceId? }。先頭がこの訪問の入口
let stack = [{ view: "home", scrollY: 0 }];
const state = { songLiveQuery: "", videoQuery: "", videoOrder: "desc" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function externalLink(className, text, url) {
  const link = el("a", className, text);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function todayInJapan() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return "日付未確認";
  if (!endDate || endDate === startDate) return formatJapaneseDate(startDate);
  return `${formatJapaneseDate(startDate)}〜${formatJapaneseDate(endDate)}`;
}

// 公演の短い呼び名（曲から探す・映像の行で使う）
function shortPerformanceLabel(performance) {
  return `${formatJapaneseDate(performance.date)}${performance.dayLabel ? `（${performance.dayLabel}）` : ""}`;
}

// ---- 表示の切り替え ----

function currentEntry() {
  return stack[stack.length - 1];
}

function activate(entry) {
  LIVE_HUB_VIEWS.forEach((view) => {
    const node = viewElements.get(view);
    if (node) node.hidden = view !== entry.view;
  });
  renderView(entry);
  container.dataset.activeView = entry.view; // 今の表示（各表示の data-view と区別するため別の名前）
}

// 画面の中で別の表示へ進む（前の表示のスクロール位置を覚えておく）
function pushView(view, params = {}) {
  playSfx(SFX_EVENTS.UI_CLICK);
  currentEntry().scrollY = window.scrollY;
  const entry = { view, scrollY: 0, ...params };
  stack.push(entry);
  activate(entry);
  window.scrollTo(0, 0);
  applyEntryExtras(entry);
}

// ヘッダーの「戻る」。画面の中で戻れたら true、この画面を出るべきなら false
export function goBackInLiveHub() {
  if (stack.length <= 1) return false;
  stack.pop();
  const entry = currentEntry();
  activate(entry);
  window.scrollTo(0, entry.scrollY ?? 0);
  return true;
}

// 「ライブのトップ」：どこからでもタイルの一覧へ（積み重ねは捨てる）
function goHome() {
  playSfx(SFX_EVENTS.UI_CLICK);
  stack = [{ view: "home", scrollY: 0 }];
  activate(stack[0]);
  window.scrollTo(0, 0);
}

function renderView(entry) {
  const node = viewElements.get(entry.view);
  if (entry.view === "setlistDetail") {
    renderSetlistDetail(node, entry.performanceId);
    return;
  }
  if (node.dataset.rendered) return;
  node.dataset.rendered = "1";
  if (entry.view === "home") renderHome(node);
  else if (entry.view === "history") renderHistory(node);
  else if (entry.view === "setlists") renderSetlistIndex(node);
  else if (entry.view === "songLive") renderSongLive(node);
  else if (entry.view === "videos") renderVideos(node);
}

// 各表示の上部：「ライブ › 表示名」と、トップへ戻るボタン
function buildViewHeader(view, lead) {
  const header = el("div", "live-hub-view-header");
  const crumbs = el("div", "live-hub-crumbs");
  crumbs.appendChild(button("live-hub-crumb", "ライブ トップ", goHome));
  crumbs.appendChild(el("span", "live-hub-crumb-sep", "›"));
  crumbs.appendChild(el("span", "live-hub-crumb-current", VIEW_TITLES[view]));
  header.appendChild(crumbs);
  header.appendChild(el("h3", "live-hub-view-title", VIEW_TITLES[view]));
  if (lead) header.appendChild(el("p", "live-hub-view-lead", lead));
  return header;
}

// ---- トップ（タイル） ----

function renderHome(node) {
  node.appendChild(el("p", "live-hub-intro", "過去の公演・セットリスト・ライブ映像・コールを、目的から調べられます。"));

  const next = findNextAnnouncedLive(LIVE_EVENTS, todayInJapan());
  if (next) {
    const card = button("live-hub-next-card", "", () => pushView("history", { focusLiveId: next.id }));
    card.appendChild(el("span", "live-hub-next-label", "次のライブ"));
    card.appendChild(el("span", "live-hub-next-title", next.title));
    card.appendChild(el("span", "live-hub-next-date", formatDateRange(next.startDate, next.endDate)));
    card.appendChild(el("span", "live-hub-next-arrow", "›"));
    node.appendChild(card);
  }

  const grid = el("div", "live-hub-tile-grid");
  LIVE_HUB_TILES.forEach((tile) => {
    const tileButton = button(`live-hub-tile is-${tile.tone}`, "", () => {
      if (tile.view) pushView(tile.view);
      else callbacks.onOpenAction?.(tile.action);
    });
    tileButton.dataset.tileId = tile.id;
    const icon = el("span", "live-hub-tile-icon");
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = TILE_ICONS[tile.id] ?? "";
    tileButton.appendChild(icon);
    tileButton.appendChild(el("span", "live-hub-tile-label", tile.label));
    tileButton.appendChild(el("span", "live-hub-tile-description", tile.description));
    if (tile.action) tileButton.appendChild(el("span", "live-hub-tile-external", "別のページ"));
    grid.appendChild(tileButton);
  });
  node.appendChild(grid);

  node.appendChild(
    el(
      "p",
      "live-hub-note",
      `掲載しているのは、公式・報道で確認できた範囲です（セットリスト ${SETLIST_PERFORMANCES.length}公演・ライブ映像 ${LIVE_VIDEO_PRODUCTS.length}作品）。調べていない公演・イベントもあります。`
    )
  );
}

// ---- 過去のライブ（ライブ履歴） ----

function buildLiveTags(event, today) {
  const tags = el("div", "live-event-tag-row");
  tags.appendChild(el("span", "live-event-tag", LIVE_TYPE_LABELS[event.type] ?? event.type));
  if (event.isAnniversary) tags.appendChild(el("span", "live-event-tag is-anniversary", "周年記念"));
  if (event.isGraduation) tags.appendChild(el("span", "live-event-tag is-graduation", "卒業公演"));
  if (event.status === LIVE_STATUS.ANNOUNCED) {
    const lastDay = event.endDate ?? event.startDate;
    const passed = typeof lastDay === "string" && lastDay < today;
    tags.appendChild(el("span", `live-event-tag ${passed ? "is-date-passed" : "is-announced"}`, passed ? "日程終了" : "開催予定"));
  }
  if (event.blurayReleased) tags.appendChild(el("span", "live-event-tag is-video-available", "映像作品あり"));
  else if (typeof event.videoReleaseDate === "string") {
    tags.appendChild(el("span", "live-event-tag is-video-upcoming", event.videoReleaseDate > today ? "映像化決定（発売予定）" : "映像化決定"));
  }
  return tags;
}

function buildLiveCard(event, today) {
  const card = el("article", "live-hub-live-card");
  card.dataset.liveId = event.id;
  card.appendChild(buildLiveTags(event, today));
  card.appendChild(el("p", "live-event-title", event.title));
  card.appendChild(el("p", "live-event-date", formatDateRange(event.startDate, event.endDate)));
  const venues = event.venues ?? [];
  if (venues.length > 0) {
    const first = venues[0];
    const firstText = first.name ? `${first.name}${first.city ? `（${first.city}）` : ""}` : "会場未確認";
    card.appendChild(el("p", "live-event-venue", venues.length > 1 ? `${firstText} ほか${venues.length - 1}会場` : firstText));
  }

  // DAY1／DAY2 などのセットリストと、ライブ映像への移動
  const performances = findPerformancesForLive(event.id);
  const videos = findVideosForLive(event.id);
  if (performances.length > 0 || videos.length > 0) {
    const actions = el("div", "live-hub-chip-row");
    performances.forEach((performance) => {
      actions.appendChild(button("live-hub-chip is-setlist", setlistButtonLabel(performance), () => pushView("setlistDetail", { performanceId: performance.id })));
    });
    videos.forEach((video) => {
      actions.appendChild(
        button("live-hub-chip is-video", videos.length > 1 ? `ライブ映像（${formatJapaneseDate(video.releaseDate)}発売）` : "ライブ映像", () =>
          pushView("videos", { focusVideoId: video.id, clearQuery: true })
        )
      );
    });
    card.appendChild(actions);
  }

  // 詳しく（会場の一覧・補足・公式の商品ページ）。最初は閉じておく
  const extraVenues = venues.length > 1 || event.episodeNote || (event.productLinks ?? []).length > 0;
  if (extraVenues) {
    const details = el("details", "live-hub-more");
    details.appendChild(el("summary", "live-hub-more-summary", "詳しく見る"));
    const body = el("div", "live-hub-more-body");
    if (venues.length > 1) {
      const list = el("ul", "live-hub-venue-list");
      venues.forEach((venue) => {
        const name = venue.name ? `${venue.name}${venue.city ? `（${venue.city}）` : ""}` : "会場未確認";
        list.appendChild(el("li", null, venue.date ? `${formatJapaneseDate(venue.date)}　${name}` : name));
      });
      body.appendChild(list);
    }
    if (event.episodeNote) body.appendChild(el("p", "live-event-note", event.episodeNote));
    const productLinks = event.productLinks ?? [];
    if (productLinks.length > 0) {
      const row = el("div", "live-video-detail-links");
      // 公式の商品紹介ページ（購入ページとは確認していないので「購入」とは書かない）
      productLinks.forEach((link) => row.appendChild(externalLink("live-video-link-button", `公式商品ページ（${link.label.replace(/を見る/, "")}）↗`, link.url)));
      body.appendChild(row);
    }
    details.appendChild(body);
    card.appendChild(details);
  }
  return card;
}

function renderHistory(node) {
  node.appendChild(buildViewHeader("history", "公式情報を確認できた主な単独公演・周年公演・ツアーです（お渡し会・サイン会等は対象外）。新しい順に並べています。"));
  const today = todayInJapan();
  const announced = LIVE_EVENTS.filter((event) => event.status === LIVE_STATUS.ANNOUNCED).sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""));
  if (announced.length > 0) {
    node.appendChild(el("p", "live-hub-group-heading", "開催予定"));
    const list = el("div", "live-hub-card-list");
    announced.forEach((event) => list.appendChild(buildLiveCard(event, today)));
    node.appendChild(list);
  }
  const held = LIVE_EVENTS.filter((event) => event.status === LIVE_STATUS.HELD).sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  let currentYear = null;
  let list = null;
  held.forEach((event) => {
    const year = (event.startDate ?? "").slice(0, 4) || "日付未確認";
    if (year !== currentYear) {
      currentYear = year;
      node.appendChild(el("p", "live-hub-group-heading", `${year}年`));
      list = el("div", "live-hub-card-list");
      node.appendChild(list);
    }
    list.appendChild(buildLiveCard(event, today));
  });
  node.appendChild(el("p", "live-hub-note", "フェス出演など、この一覧に無い公演のセットリストは「セットリストを見る」から探せます。"));
}

// ---- セットリスト一覧（公演を選ぶ） ----

function renderSetlistIndex(node) {
  node.appendChild(buildViewHeader("setlists", "公演を選ぶと、その日の曲順を表示します。曲順を公式・報道で確認できた公演だけを載せています。"));
  groupPerformancesByYear().forEach(({ year, performances }) => {
    node.appendChild(el("p", "live-hub-group-heading", `${year}年`));
    const list = el("div", "live-hub-row-list");
    performances.forEach((performance) => {
      const row = button("live-hub-row", "", () => pushView("setlistDetail", { performanceId: performance.id }));
      row.dataset.performanceId = performance.id;
      const text = el("span", "live-hub-row-text");
      text.appendChild(el("span", "live-hub-row-title", performance.title));
      const meta = [shortPerformanceLabel(performance), performance.kind === "festival" ? "フェス出演" : null].filter(Boolean).join("・");
      text.appendChild(el("span", "live-hub-row-meta", meta));
      row.appendChild(text);
      const count = performance.items.filter((item) => item.order > 0).length;
      row.appendChild(el("span", `live-hub-row-badge ${performance.completeness === "full" ? "is-full" : "is-partial"}`, performance.completeness === "full" ? `${count}曲` : "一部"));
      row.appendChild(el("span", "live-hub-row-arrow", "›"));
      list.appendChild(row);
    });
    node.appendChild(list);
  });
  node.appendChild(
    el(
      "p",
      "live-hub-note",
      `曲順を確定できなかった公演（ファンのまとめにしか無い公演など${UNVERIFIED_SETLIST_PERFORMANCES.length}公演）は載せていません。「一部」は、披露を確認できた曲だけの公演です。`
    )
  );
}

// ---- 1公演のセットリスト ----

function buildSetlistRow(item) {
  const row = el("li", `setlist-item is-${item.section}${item.referenceOnly ? " is-reference" : ""}`);
  row.appendChild(el("span", "setlist-item-order", item.order === 0 ? "—" : String(item.order)));
  const body = el("div", "setlist-item-body");
  const song = item.songId && item.songId !== "overture" ? songById.get(item.songId) : null;
  if (song && callbacks.onOpenSong) body.appendChild(button("setlist-item-title is-link", song.title, () => callbacks.onOpenSong(song.id)));
  else body.appendChild(el("span", "setlist-item-title", item.songId === "overture" ? "Overture" : item.title));
  const tags = [];
  if (item.section !== "main" && SETLIST_SECTION_LABELS[item.section]) tags.push(SETLIST_SECTION_LABELS[item.section]);
  if (SETLIST_FORM_LABELS[item.form]) tags.push(SETLIST_FORM_LABELS[item.form]);
  if (item.referenceOnly) tags.push("参考（ファン資料のみ）");
  tags.forEach((tag) => body.appendChild(el("span", "setlist-item-tag", tag)));
  if (item.note) body.appendChild(el("span", "setlist-item-note", item.note));
  row.appendChild(body);
  return row;
}

function renderSetlistDetail(node, performanceId) {
  if (node.dataset.performanceId === performanceId) return; // 同じ公演なら描き直さない（開いた状態を残す）
  node.innerHTML = "";
  node.dataset.performanceId = performanceId ?? "";
  node.appendChild(buildViewHeader("setlistDetail"));
  const performance = performanceById.get(performanceId);
  if (!performance) {
    node.appendChild(el("p", "live-hub-note", "この公演のセットリストは見つかりませんでした。"));
    return;
  }
  const head = el("div", "live-hub-setlist-head");
  head.appendChild(el("p", "live-hub-setlist-title", performance.title));
  head.appendChild(el("p", "live-hub-setlist-date", shortPerformanceLabel(performance)));
  const meta = [performance.venue, VERIFICATION_LABELS[performance.verification], performance.completeness === "full" ? "全曲判明" : "一部の曲だけ判明"].filter(Boolean).join("／");
  head.appendChild(el("p", "live-hub-setlist-meta", meta));
  if (performance.dayNote) head.appendChild(el("p", "live-hub-setlist-meta", performance.dayNote));
  if (performance.membersNote) head.appendChild(el("p", "live-hub-setlist-meta", `出演：${performance.membersNote}`));
  node.appendChild(head);

  const list = el("ol", "setlist-items live-hub-setlist-items");
  performance.items.forEach((item) => list.appendChild(buildSetlistRow(item)));
  node.appendChild(list);
  node.appendChild(el("p", "live-hub-note", "曲名をタップすると、収録曲一覧のその曲へ移動します（「戻る」でこのセットリストへ戻ります）。"));

  // この公演の映像・ライブ履歴への移動
  const actions = el("div", "live-hub-chip-row");
  findVideosForPerformance(performance.id).forEach((video) => {
    actions.appendChild(button("live-hub-chip is-video", "この公演のライブ映像", () => pushView("videos", { focusVideoId: video.id, clearQuery: true })));
  });
  if (performance.liveId) actions.appendChild(button("live-hub-chip", "ライブ履歴でこの公演を見る", () => pushView("history", { focusLiveId: performance.liveId })));
  if (actions.childNodes.length > 0) node.appendChild(actions);

  if (performance.sources.length > 0) {
    const sources = el("p", "live-setlist-sources");
    sources.appendChild(document.createTextNode("出典："));
    performance.sources.forEach((source, index) => {
      if (index > 0) sources.appendChild(document.createTextNode("／"));
      const link = externalLink("live-setlist-source-link", source.kind === "official" ? "公式" : "報道", source.url);
      link.title = source.title;
      sources.appendChild(link);
    });
    node.appendChild(sources);
  }
}

// ---- 曲名の入力欄（曲から探す・映像を探す で共通） ----

function buildSongInput(id, placeholder, value, onInput) {
  const field = el("div", "search-screen-field live-hub-search-field");
  const input = el("input", "search-screen-input");
  input.id = id;
  input.type = "search";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.setAttribute("enterkeyhint", "search");
  input.setAttribute("aria-label", placeholder);
  input.value = value;
  const listId = `${id}-songs`;
  input.setAttribute("list", listId);
  const datalist = el("datalist");
  datalist.id = listId;
  SONGS.filter((song) => song.id !== "overture").forEach((song) => {
    const option = el("option");
    option.value = song.title;
    datalist.appendChild(option);
  });
  const clear = button("search-screen-clear", "×", () => {
    input.value = "";
    onInput("");
    input.focus();
  });
  clear.setAttribute("aria-label", "入力を消す");
  clear.hidden = value === "";
  input.addEventListener("input", () => {
    clear.hidden = input.value === "";
    onInput(input.value);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      input.blur();
    }
  });
  field.append(input, clear, datalist);
  return { field, input, clear };
}

// ---- 曲からライブを探す ----

let songLiveResults = null;
let songLiveInput = null;

function renderSongLiveResults() {
  songLiveResults.innerHTML = "";
  const query = state.songLiveQuery.trim();
  if (!query) {
    songLiveResults.appendChild(el("p", "live-hub-empty", "曲名を入れると、その曲を披露したことが確認できた公演を表示します。"));
    return;
  }
  const matches = findVideosBySongQuery(query, SONGS);
  if (matches.length === 0) {
    songLiveResults.appendChild(el("p", "live-hub-empty", `「${query}」に一致する曲が見つかりませんでした。`));
    return;
  }
  const today = todayInJapan();
  matches.slice(0, SONG_RESULT_LIMIT).forEach(({ song }) => {
    const block = el("section", "live-hub-song-block");
    block.dataset.songId = song.id;
    block.appendChild(button("live-hub-song-title", song.title, () => callbacks.onOpenSong?.(song.id)));
    const summary = summarizeSongLive(song.id, { today });
    buildLiveSummarySentences(summary).forEach((sentence) => block.appendChild(el("p", "song-live-sentence", sentence)));
    if (summary.count > 0) {
      const list = el("div", "live-hub-row-list");
      [...summary.confirmed].reverse().forEach(({ performance, items }) => {
        const row = button("live-hub-row is-compact", "", () => pushView("setlistDetail", { performanceId: performance.id }));
        const text = el("span", "live-hub-row-text");
        text.appendChild(el("span", "live-hub-row-title", performance.title));
        const positions = items.map((item) => (item.order === 0 ? "オープニング" : `${item.section === "main" ? "" : `${SETLIST_SECTION_LABELS[item.section] ?? ""} `}M${item.order}`));
        text.appendChild(el("span", "live-hub-row-meta", `${shortPerformanceLabel(performance)}・${positions.join("・")}`));
        row.appendChild(text);
        row.appendChild(el("span", "live-hub-row-arrow", "›"));
        list.appendChild(row);
      });
      block.appendChild(list);
    }
    // 披露と映像は別の事実なので、映像は件数と移動ボタンだけを分けて出す
    const videos = findVideosForSong(song.id);
    const videoText =
      videos.included.length > 0
        ? `この曲の収録を確認できたライブ映像：${videos.included.length}作品`
        : videos.undisclosed.length > 0
          ? "収録曲が未発表のライブ映像があります"
          : "公式の収録内容で確認できたライブ映像はありません";
    block.appendChild(el("p", "song-live-caption", videoText));
    if (videos.included.length > 0 || videos.undisclosed.length > 0) {
      block.appendChild(
        button("live-hub-inline-link", "この曲のライブ映像を見る →", () => {
          state.videoQuery = song.title;
          pushView("videos", { syncVideoQuery: true });
        })
      );
    }
    songLiveResults.appendChild(block);
  });
  if (matches.length > SONG_RESULT_LIMIT) songLiveResults.appendChild(el("p", "live-hub-note", `ほかに${matches.length - SONG_RESULT_LIMIT}曲が一致しました。曲名をもう少し入れてください。`));
  songLiveResults.appendChild(el("p", "song-live-caption", "確認できた公演の範囲での記録です。記録が無いことは「披露していない」という意味ではありません。"));
}

function renderSongLive(node) {
  node.appendChild(buildViewHeader("songLive", "その曲を披露したことを、公式・報道で確認できた公演を新しい順に表示します。"));
  const { field, input } = buildSongInput("live-hub-song-input", "曲名を入力（例：ラブロケ）", state.songLiveQuery, (value) => {
    state.songLiveQuery = value;
    renderSongLiveResults();
  });
  songLiveInput = input;
  node.appendChild(field);
  songLiveResults = el("div", "live-hub-results");
  songLiveResults.setAttribute("aria-live", "polite");
  node.appendChild(songLiveResults);
  renderSongLiveResults();
}

// ---- ライブ映像を探す（曲名で絞り込み・発売順の一覧） ----

let videoResults = null;
let videoInput = null;
let videoInputClear = null;

function cardOptions(songId) {
  return {
    songId,
    onOpenSong: (id) => callbacks.onOpenSong?.(id),
    onOpenPerformance: (performanceId) => pushView("setlistDetail", { performanceId }),
  };
}

function renderVideoResults() {
  videoResults.innerHTML = "";
  const query = state.videoQuery.trim();
  if (!query) {
    const orderRow = el("div", "live-hub-order-row");
    orderRow.appendChild(el("span", "live-hub-order-label", `ライブ映像作品 ${LIVE_VIDEO_PRODUCTS.length}作品`));
    [
      ["desc", "新しい順"],
      ["asc", "古い順"],
    ].forEach(([order, label]) => {
      const chip = button(`live-hub-order-chip${state.videoOrder === order ? " is-active" : ""}`, label, () => {
        if (state.videoOrder === order) return;
        state.videoOrder = order;
        renderVideoResults();
      });
      chip.setAttribute("aria-pressed", String(state.videoOrder === order));
      orderRow.appendChild(chip);
    });
    videoResults.appendChild(orderRow);
    const list = el("div", "live-hub-card-list");
    sortVideosByRelease(LIVE_VIDEO_PRODUCTS, state.videoOrder).forEach((video) => list.appendChild(buildVideoCard(video, cardOptions(null))));
    videoResults.appendChild(list);
    return;
  }
  const matches = findVideosBySongQuery(query, SONGS);
  if (matches.length === 0) {
    videoResults.appendChild(el("p", "live-hub-empty", `「${query}」に一致する曲が見つかりませんでした。`));
    return;
  }
  matches.slice(0, SONG_RESULT_LIMIT).forEach(({ song, included, undisclosed }) => {
    const block = el("section", "live-hub-song-block");
    block.dataset.songId = song.id;
    block.appendChild(button("live-hub-song-title", song.title, () => callbacks.onOpenSong?.(song.id)));
    if (included.length === 0 && undisclosed.length === 0) {
      block.appendChild(el("p", "song-live-sentence", "公式の収録内容で確認できたライブ映像はありません（調べていない映像商品に入っている可能性があります）。"));
    } else {
      const list = el("div", "live-hub-card-list");
      [...included, ...undisclosed].forEach(({ video }) => list.appendChild(buildVideoCard(video, cardOptions(song.id))));
      block.appendChild(list);
    }
    videoResults.appendChild(block);
  });
  if (matches.length > SONG_RESULT_LIMIT) videoResults.appendChild(el("p", "live-hub-note", `ほかに${matches.length - SONG_RESULT_LIMIT}曲が一致しました。曲名をもう少し入れてください。`));
}

function renderVideos(node) {
  node.appendChild(buildViewHeader("videos", "ライブ映像（Blu-ray／DVD）を、発売順の一覧か、曲名から探せます。カードの「詳細を見る」で品番・収録曲・公式商品ページを表示します。"));
  const { field, input, clear } = buildSongInput("live-hub-video-input", "曲名で絞り込む（例：アイカツハッピーエンド）", state.videoQuery, (value) => {
    state.videoQuery = value;
    renderVideoResults();
  });
  videoInput = input;
  videoInputClear = clear;
  node.appendChild(field);
  videoResults = el("div", "live-hub-results");
  videoResults.setAttribute("aria-live", "polite");
  node.appendChild(videoResults);
  renderVideoResults();
}

// 外から入力欄の値を変えたとき（「この曲のライブ映像を見る」・検索から映像カードへ）に、欄と結果を合わせる
function syncVideoQuery() {
  if (!videoInput) return;
  if (videoInput.value === state.videoQuery) return;
  videoInput.value = state.videoQuery;
  videoInputClear.hidden = state.videoQuery === "";
  renderVideoResults();
}

// ---- 外から使う関数 ----

// 開く表示を決める。options:
//   {}（ホームのタイル）            → トップ
//   { view: "history", liveId }    → 過去のライブの該当公演
//   { view: "videos", videoId }    → ライブ映像の該当カード（絞り込みは解除）
//   { view: "setlistDetail", performanceId }
//   { view: "songLive", songQuery } → 曲から探す（入力済み）
// 戻り値：{ focusSelector }（main.js が画面を切り替えたあと、その要素へスクロールして目立たせる）
export function openLiveHubScreen(options = {}) {
  const view = LIVE_HUB_VIEWS.includes(options.view) ? options.view : "home";
  if (typeof options.songQuery === "string") {
    state.songLiveQuery = options.songQuery;
    if (songLiveInput) {
      songLiveInput.value = options.songQuery;
      renderSongLiveResults();
    }
  }
  if (options.videoId) {
    state.videoQuery = "";
    syncVideoQuery();
  }
  stack = [{ view, scrollY: 0, performanceId: options.performanceId }];
  activate(stack[0]);
  let focusSelector = null;
  if (view === "history" && options.liveId) focusSelector = `[data-live-id="${options.liveId}"]`;
  if (view === "videos" && options.videoId) focusSelector = `[data-video-id="${options.videoId}"]`;
  return { focusSelector };
}

// pushView に渡した追加の指定（focusLiveId 等）を、表示を作ったあとに反映する
// どれも一度きりの指定（「戻る」で戻ってきたときは、その後に入力した曲名や覚えておいたスクロール位置を優先する）
function applyEntryExtras(entry) {
  if (entry.clearQuery && state.videoQuery !== "") {
    state.videoQuery = "";
    syncVideoQuery();
  }
  if (entry.syncVideoQuery) syncVideoQuery();
  const selector = entry.focusLiveId ? `[data-live-id="${entry.focusLiveId}"]` : entry.focusVideoId ? `[data-video-id="${entry.focusVideoId}"]` : null;
  delete entry.clearQuery;
  delete entry.syncVideoQuery;
  delete entry.focusLiveId;
  delete entry.focusVideoId;
  if (selector) callbacks.onRevealTarget?.(selector);
}

// elements: { container }
// options: {
//   onOpenSong(songId)      : 曲名をタップしたとき（収録曲一覧のその曲へ。main.js の openSearchTarget）
//   onOpenAction(action)    : 既存の別画面（ライブ初心者ガイド・ライブコールモード）を開く
//   onRevealTarget(selector): 該当カードへスクロールして目立たせる（main.js の revealSearchFocusTarget）
// }
export function initLiveHubScreen(elements, options = {}) {
  container = elements.container;
  callbacks = options;
  container.innerHTML = "";
  viewElements.clear();
  LIVE_HUB_VIEWS.forEach((view) => {
    const node = el("div", "live-hub-view");
    node.dataset.view = view;
    node.hidden = view !== "home";
    viewElements.set(view, node);
    container.appendChild(node);
  });
}
