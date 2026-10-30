// 「CD売上・チャート記録」ページ（#cd-sales-screen。2026-10-31新設・本人の依頼）。
// デビューから今までの成長を、数字と作品で振り返る。入口はホームの「＝LOVEをもっと知る」。
//
// 構成：上の数字 → 区分（シングル／アルバム／楽曲の記録・認定）
//   シングル：Billboard JAPAN の初週 CD 売上の棒グラフ（発売順・21作）→ 節目 → 数字の見方 → 21作の一覧（押すと詳しい記録）
//   アルバム：シングルとは別の集計なので、グラフに混ぜず別の区分にする
//   楽曲の記録・認定：CD 以外（Hot 100 の1位・ストリーミング認定・連続記録）を小さく
// 数値は js/data/cdSales.js、作品名・発売日・センターは songs.js から（js/cdSalesModel.js でまとめる）。
// オリコンの初週は10作しか確かめられていないので、グラフには入れない（一覧・詳しい記録に別に出す）。
import { SONGS } from "./data/songs.js";
import { DISCOGRAPHY } from "./data/discography.js";
import { CD_SALES_SINGLES, CD_SALES_ALBUMS, SONG_RECORDS, CD_SALES_CHECKED_AT, RIAJ_CHECKED_THROUGH, ORICON_CUMULATIVE_ORDER_SOURCE } from "./data/cdSales.js";
import {
  buildCdSalesModel,
  buildFirstWeekChart,
  buildHeadlineStats,
  collectSources,
  describeBillboardSalesRank,
  describeCertifications,
  describeCumulative,
  findFirstWeekMilestones,
  formatChartValue,
  formatCopies,
  formatDotDate,
  formatManCopies,
  formatYearMonth,
  groupSongRecords,
  latestCertificationLevel,
  sourceLabelOf,
} from "./cdSalesModel.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";

const UNCONFIRMED = "未確認";

let container = null;
let callbacks = {};
let model = null;
let built = false;
let tab = "singles";
let selectedWorkId = null;
const parts = {};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function button(className, text, onClick) {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function externalLink(url, text) {
  const link = el("a", "cds-source-link", text);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

export function getCdSalesModel() {
  if (!model) model = buildCdSalesModel({ songs: SONGS, discography: DISCOGRAPHY, singles: CD_SALES_SINGLES, albums: CD_SALES_ALBUMS });
  return model;
}

// ---- 上の数字 ----
function buildHeadline() {
  const stats = buildHeadlineStats(getCdSalesModel().singles);
  const box = el("div", "cds-headline");
  if (!stats) return box;
  const tile = (label, value, sub) => {
    const node = el("div", "cds-headline-tile");
    node.append(el("span", "cds-headline-label", label), el("span", "cds-headline-value", value), el("span", "cds-headline-sub", sub));
    return node;
  };
  box.append(
    tile("デビュー作の初週", stats.first.value, `${stats.first.row.shortLabel}「${stats.first.row.title}」`),
    tile("初週の自己最高", stats.best.value, `${stats.best.row.shortLabel}「${stats.best.row.title}」`)
  );
  return box;
}

// ---- グラフ ----
function buildChart() {
  const rows = getCdSalesModel().singles;
  const chart = buildFirstWeekChart(rows);
  const card = el("section", "cds-card cds-chart-card");
  card.setAttribute("aria-labelledby", "cds-chart-title");
  const title = el("h3", "cds-card-title", "初週の CD 売上の伸び");
  title.id = "cds-chart-title";
  card.appendChild(title);
  card.appendChild(el("p", "cds-card-lead", `Billboard JAPAN「Top Singles Sales」の発売週の売上枚数（${rows.length}作・発売順）。棒を押すと作品名と枚数が出ます。`));

  // 選んだ作品の表示（読み上げにも伝える）
  const readout = el("div", "cds-readout");
  readout.setAttribute("aria-live", "polite");
  parts.readout = readout;
  card.appendChild(readout);

  const frame = el("div", "cds-chart");
  const yAxis = el("div", "cds-yaxis");
  yAxis.setAttribute("aria-hidden", "true");
  chart.gridLines.forEach((line) => {
    const label = el("span", "cds-yaxis-label", line.label);
    label.style.bottom = `${line.ratio * 100}%`;
    yAxis.appendChild(label);
  });
  const scroll = el("div", "cds-plot-scroll");
  scroll.tabIndex = 0;
  scroll.setAttribute("aria-label", "初週の CD 売上のグラフ（横にスクロールできます）");
  const plot = el("div", "cds-plot");
  plot.style.setProperty("--cds-bars", String(chart.bars.length));
  const grid = el("div", "cds-grid");
  grid.setAttribute("aria-hidden", "true");
  chart.gridLines.forEach((line) => {
    const gridLine = el("span", `cds-grid-line${line.value === 500000 ? " is-strong" : ""}`);
    gridLine.style.bottom = `${line.ratio * 100}%`;
    grid.appendChild(gridLine);
  });
  plot.appendChild(grid);
  const bars = el("div", "cds-bars");
  bars.setAttribute("role", "group");
  bars.setAttribute("aria-label", "作品ごとの初週売上");
  chart.bars.forEach((bar) => {
    const node = button(`cds-bar${bar.isBest ? " is-best" : ""}`, null, () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      selectWork(bar.workId);
    });
    node.dataset.workId = bar.workId;
    node.setAttribute("aria-label", `${bar.shortLabel}「${bar.title}」 初週 ${formatCopies(bar.copies) ?? UNCONFIRMED}`);
    node.setAttribute("aria-pressed", "false");
    const column = el("span", "cds-bar-column");
    const value = el("span", "cds-bar-value", Number.isFinite(bar.copies) ? formatChartValue(bar.copies) : "—");
    const fill = el("span", "cds-bar-fill");
    fill.style.height = `${bar.ratio * 100}%`;
    column.append(value, fill);
    node.append(column, el("span", "cds-bar-label", bar.shortLabel));
    bars.appendChild(node);
  });
  plot.appendChild(bars);
  scroll.appendChild(plot);
  frame.append(yAxis, scroll);
  parts.chartScroll = scroll;
  parts.bars = bars;
  card.appendChild(frame);
  // 狭い画面で横にスクロールできることを知らせる（全部の棒が見える幅では隠す。main の requestAnimationFrame 後に判定）
  const hint = el("p", "cds-scroll-hint", "← 横にスクロールして 1st〜最新作を見られます →");
  hint.hidden = true;
  parts.scrollHint = hint;
  card.appendChild(hint);
  const legend = el("p", "cds-chart-legend");
  legend.append(el("span", "cds-legend-unit", "単位：万枚"), el("span", "cds-legend-best", "★ その時点での初週の自己最高"));
  card.appendChild(legend);

  // 節目（データから数える）
  const milestones = findFirstWeekMilestones(rows);
  if (milestones.length) {
    card.appendChild(el("h4", "cds-subtitle", "成長の節目"));
    const list = el("ol", "cds-milestones");
    milestones.forEach((item) => {
      const li = el("li", `cds-milestone${item.kind === "threshold" && item.threshold === 500000 ? " is-top" : ""}`);
      const pick = button("cds-milestone-button", null, () => {
        playSfx(SFX_EVENTS.UI_CLICK);
        selectWork(item.row.workId, { scrollChart: true });
      });
      pick.append(
        el("span", "cds-milestone-label", item.label),
        el("span", "cds-milestone-work", `${item.row.shortLabel}「${item.row.title}」`),
        el("span", "cds-milestone-value", formatCopies(item.row.sales.billboardFirstWeek.copies))
      );
      li.appendChild(pick);
      list.appendChild(li);
    });
    card.appendChild(list);
  }
  return card;
}

function renderReadout() {
  const row = getCdSalesModel().singles.find((item) => item.workId === selectedWorkId);
  parts.readout.replaceChildren();
  if (!row) return;
  const bb = row.sales.billboardFirstWeek;
  const head = el("p", "cds-readout-head");
  head.append(el("span", "cds-readout-number", row.shortLabel), el("span", "cds-readout-title", `「${row.title}」`));
  const value = el("p", "cds-readout-value", formatCopies(bb?.copies) ?? UNCONFIRMED);
  const sub = el("p", "cds-readout-sub");
  sub.append(el("span", null, `発売週${bb?.rankInWeek ?? "—"}位`), el("span", null, `${formatDotDate(row.releaseDate)} 発売`));
  const more = button("cds-readout-more", "この作品の記録を見る ↓", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openListItem(row.workId, { scroll: true });
  });
  parts.readout.append(head, value, sub, more);
}

function selectWork(workId, { scrollChart = false } = {}) {
  selectedWorkId = workId;
  parts.bars?.querySelectorAll(".cds-bar").forEach((bar) => {
    const active = bar.dataset.workId === workId;
    bar.classList.toggle("is-selected", active);
    bar.setAttribute("aria-pressed", active ? "true" : "false");
    if (active && scrollChart) bar.scrollIntoView({ block: "nearest", inline: "center" });
  });
  renderReadout();
}

// ---- 数字の見方 ----
function buildGlossary() {
  const box = el("details", "cds-glossary");
  box.appendChild(el("summary", "cds-glossary-summary", "数字の見方（売上・出荷・認定のちがい）"));
  const list = el("dl", "cds-glossary-list");
  [
    ["初週の売上", "発売した週に、お店などで売れた枚数。Billboard JAPAN とオリコンは集計のしかたが違うので、同じ作品でも数が違います。"],
    ["Billboard JAPAN", "Top Singles Sales（CD の売上チャート）の数。1枚単位で21作すべてそろっているので、グラフはこの数で描いています。"],
    ["オリコン", "週間シングルランキングの数。記事に出る「○万枚」の概数で、確かめられたのは10作だけです。"],
    ["累計", "発売から、ある日までに売れた枚数の合計。いつ時点の数かを必ず添えています。"],
    ["出荷", "メーカーがお店へ送った枚数。売れた枚数（売上）とは別の数です。"],
    ["RIAJ の認定", "日本レコード協会のゴールドディスク認定。出荷の枚数で決まるので、売上とは別の数です。"],
    ["Hot 100", "Billboard JAPAN の総合チャート。CD の売上だけでなく、配信・再生なども合わせた順位です。"],
    ["形態", "Type A〜F・初回限定盤などの形態違いは、分けずに1作として数えています。"],
  ].forEach(([term, text]) => list.append(el("dt", null, term), el("dd", null, text)));
  box.appendChild(list);
  return box;
}

// ---- 一覧と詳しい記録 ----
function factRow(label, value, { note = null, muted = false } = {}) {
  const row = el("div", "cds-fact");
  row.appendChild(el("span", "cds-fact-key", label));
  const valueBox = el("span", `cds-fact-value${muted ? " is-unconfirmed" : ""}`);
  valueBox.appendChild(el("span", null, value));
  if (note) valueBox.appendChild(el("span", "cds-fact-note", note));
  row.appendChild(valueBox);
  return row;
}

function factGroup(title, rows) {
  const group = el("section", "cds-fact-group");
  group.appendChild(el("h5", "cds-fact-title", title));
  rows.forEach((row) => group.appendChild(row));
  return group;
}

function describeCenters(row) {
  return row.titleTracks
    .map((track) => {
      const names = track.center.length ? track.center.join("・") : UNCONFIRMED;
      return row.titleTracks.length > 1 ? `${track.title}：${names}` : names;
    })
    .join(" ／ ");
}

function buildDetail(row, { isAlbum = false } = {}) {
  const sales = row.sales;
  const detail = el("div", "cds-detail");
  const chartName = isAlbum ? "Top Albums Sales" : "Top Singles Sales";
  const oriconName = isAlbum ? "週間アルバム" : "週間シングル";

  const basics = [factRow("発売日", formatDotDate(row.releaseDate))];
  basics.push(factRow(row.titleTracks.length > 1 ? "表題曲（両A面）" : "表題曲", row.titleTracks.map((track) => track.title).join(" ／ ")));
  if (!isAlbum) basics.push(factRow("センター", describeCenters(row), { note: row.centerNote }));
  detail.appendChild(factGroup("作品", basics));

  const bb = sales.billboardFirstWeek;
  const of = sales.oriconFirstWeek;
  detail.appendChild(
    factGroup("初週の売上", [
      factRow("Billboard JAPAN", formatCopies(bb?.copies) ?? UNCONFIRMED, {
        note: bb ? [chartName, Number.isFinite(bb.rankInWeek) ? `週間${bb.rankInWeek}位` : null, bb.period ? `集計 ${bb.period}` : bb.chartDate].filter(Boolean).join("・") : null,
        muted: !bb,
      }),
      factRow("オリコン", of ? formatManCopies(of.manCopies) : UNCONFIRMED, { note: of ? `${oriconName}・${of.chartDate}・記事の概数` : oriconName, muted: !of }),
    ])
  );

  const ranks = [
    factRow("オリコン", sales.oriconPeak ? `最高${sales.oriconPeak.rank}位` : UNCONFIRMED, { note: oriconName, muted: !sales.oriconPeak }),
    factRow("Billboard JAPAN", describeBillboardSalesRank(sales), { note: `${chartName}（CD 売上）`, muted: !sales.billboardSalesPeak && !Number.isFinite(bb?.rankInWeek) }),
  ];
  if (!isAlbum) {
    ranks.push(
      factRow("Billboard Hot 100", sales.hot100Peak ? `最高${sales.hot100Peak.rank}位` : UNCONFIRMED, {
        note: "総合（CD 以外の配信・再生も合わせた順位）",
        muted: !sales.hot100Peak,
      })
    );
  }
  detail.appendChild(factGroup("最高順位", ranks));

  const cumulativeRows = (sales.cumulative ?? []).map((item) => {
    const text = describeCumulative(item);
    return factRow(text.label, text.value ?? UNCONFIRMED, { note: [`${text.asOf}時点`, text.note].filter(Boolean).join("。") });
  });
  if (!cumulativeRows.length) cumulativeRows.push(factRow("累計の枚数", UNCONFIRMED, { muted: true }));
  if (!isAlbum) {
    cumulativeRows.push(
      factRow(
        "オリコン累積売上の多い順",
        Number.isFinite(sales.oriconCumulativeOrder) ? `シングルの中で${sales.oriconCumulativeOrder}番目` : UNCONFIRMED,
        {
          note: Number.isFinite(sales.oriconCumulativeOrder)
            ? `${formatDotDate(ORICON_CUMULATIVE_ORDER_SOURCE.asOf)}時点・枚数は非公開`
            : "オリコンの一覧に出るのは上位20作まで",
          muted: !Number.isFinite(sales.oriconCumulativeOrder),
        }
      )
    );
  }
  detail.appendChild(factGroup("累計", cumulativeRows));

  if (sales.shipments?.length || sales.otherSales?.length) {
    const rows = [
      ...(sales.shipments ?? []).map((item) => factRow("出荷（メーカー発表）", item.text, { note: `${item.asOf}。売上ではなく出荷の数` })),
      ...(sales.otherSales ?? []).map((item) => factRow("そのほかの売上", item.text, { note: item.asOf })),
    ];
    detail.appendChild(factGroup("出荷・そのほか", rows));
  }

  const certText = describeCertifications(sales.riajCertifications);
  detail.appendChild(
    factGroup("RIAJ の認定（出荷が基準）", [
      factRow(isAlbum ? "ゴールドディスク" : "シングル（CD）", certText ?? `認定なし（${formatYearMonth(RIAJ_CHECKED_THROUGH)}度まで）`, { muted: !certText }),
    ])
  );

  // 移動：作品のページ・表題曲（収録曲一覧）
  const nav = el("div", "cds-detail-nav");
  nav.appendChild(button("cds-nav-button", "作品のページへ →", () => callbacks.onOpenWork?.(row.workId)));
  row.titleTracks.forEach((track) => {
    nav.appendChild(button("cds-nav-button is-sub", `「${track.title}」を収録曲一覧で見る →`, () => callbacks.onOpenSong?.(track.songId)));
  });
  detail.appendChild(nav);

  const sources = collectSources(sales, Number.isFinite(sales.oriconCumulativeOrder) ? [{ url: ORICON_CUMULATIVE_ORDER_SOURCE.url, publishedAt: null }] : []);
  if (sources.length) {
    const box = el("div", "cds-sources");
    box.appendChild(el("p", "cds-sources-title", `出典（確かめた日：${formatDotDate(sales.checkedAt)}）`));
    const list = el("ul", "cds-sources-list");
    sources.forEach((source) => {
      const li = el("li");
      li.appendChild(externalLink(source.url, source.label));
      if (source.publishedAt) li.appendChild(el("span", "cds-source-date", `（${source.publishedAt.replaceAll("-", ".")}）`));
      list.appendChild(li);
    });
    box.appendChild(list);
    detail.appendChild(box);
  }
  return detail;
}

function buildListItem(row, { isAlbum = false } = {}) {
  const item = el("li", "cds-item");
  item.dataset.workId = row.workId;
  const head = button("cds-item-head", null, () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    toggleListItem(item);
  });
  head.setAttribute("aria-expanded", "false");
  const main = el("span", "cds-item-main");
  const top = el("span", "cds-item-top");
  top.append(el("span", "cds-item-number", row.shortLabel), el("span", "cds-item-date", formatDotDate(row.releaseDate)));
  const level = latestCertificationLevel(row.sales.riajCertifications);
  if (level) top.appendChild(el("span", "cds-item-cert", level));
  main.append(top, el("span", "cds-item-title", row.title));
  const figures = el("span", "cds-item-figures");
  const bb = row.sales.billboardFirstWeek;
  figures.append(
    el("span", "cds-item-figure", `Billboard 初週 ${formatCopies(bb?.copies) ?? UNCONFIRMED}`),
    el("span", "cds-item-figure is-sub", `オリコン最高${row.sales.oriconPeak?.rank ?? "—"}位`)
  );
  main.appendChild(figures);
  head.append(main, el("span", "cds-item-chevron", "▾"));
  head.lastChild.setAttribute("aria-hidden", "true");
  item.appendChild(head);
  const body = el("div", "cds-item-body");
  body.hidden = true;
  body.dataset.isAlbum = isAlbum ? "1" : "";
  item.appendChild(body);
  return item;
}

function toggleListItem(item, force) {
  const head = item.querySelector(".cds-item-head");
  const body = item.querySelector(".cds-item-body");
  const open = force ?? body.hidden;
  if (open && !body.childElementCount) {
    const list = body.dataset.isAlbum ? getCdSalesModel().albums : getCdSalesModel().singles;
    const row = list.find((candidate) => candidate.workId === item.dataset.workId);
    if (row) body.appendChild(buildDetail(row, { isAlbum: Boolean(body.dataset.isAlbum) }));
  }
  body.hidden = !open;
  head.setAttribute("aria-expanded", open ? "true" : "false");
  item.classList.toggle("is-open", open);
  if (open && !body.dataset.isAlbum) selectWork(item.dataset.workId);
}

function openListItem(workId, { scroll = false } = {}) {
  const item = container.querySelector(`.cds-item[data-work-id="${workId}"]`);
  if (!item) return null;
  toggleListItem(item, true);
  if (scroll) item.scrollIntoView({ block: "start", behavior: "smooth" });
  return item;
}

function buildSinglesPanel() {
  const panel = el("div", "cds-panel");
  panel.dataset.panel = "singles";
  panel.appendChild(buildChart());
  panel.appendChild(buildGlossary());
  const rows = getCdSalesModel().singles;
  panel.appendChild(el("h3", "cds-section-title", `シングル${rows.length}作の記録`));
  panel.appendChild(el("p", "cds-section-lead", "作品を押すと、初週（Billboard・オリコン）・最高順位・累計・認定・出典が出ます。"));
  const list = el("ol", "cds-list");
  rows.forEach((row) => list.appendChild(buildListItem(row)));
  panel.appendChild(list);
  return panel;
}

function buildAlbumsPanel() {
  const panel = el("div", "cds-panel");
  panel.dataset.panel = "albums";
  panel.appendChild(el("p", "cds-section-lead", "アルバムは、シングルとは別のチャート（Billboard Top Albums Sales・オリコン週間アルバム）で数えるので、シングルのグラフには入れていません。"));
  const list = el("ol", "cds-list");
  getCdSalesModel().albums.forEach((row) => list.appendChild(buildListItem(row, { isAlbum: true })));
  panel.appendChild(list);
  return panel;
}

function buildRecordsPanel() {
  const groups = groupSongRecords(SONG_RECORDS);
  const panel = el("div", "cds-panel");
  panel.dataset.panel = "records";
  panel.appendChild(el("p", "cds-section-lead", "CD の売上とは別の記録です。数字の種類（順位・再生回数・認定）を混ぜずに、種類ごとに並べています。"));

  const section = (title, lead, items) => {
    const box = el("section", "cds-card cds-record-card");
    box.appendChild(el("h4", "cds-subtitle", title));
    if (lead) box.appendChild(el("p", "cds-card-lead", lead));
    const list = el("ul", "cds-records");
    items.forEach((item) => list.appendChild(item));
    box.appendChild(list);
    return box;
  };
  const recordItem = (main, sub, source, songId) => {
    const li = el("li", "cds-record");
    li.appendChild(el("span", "cds-record-main", main));
    if (sub) li.appendChild(el("span", "cds-record-sub", sub));
    const foot = el("span", "cds-record-foot");
    if (source?.url) foot.appendChild(externalLink(source.url, `出典：${source.label ?? ""}`.replace(/：$/, "")));
    if (songId) foot.appendChild(button("cds-record-song", "曲を見る →", () => callbacks.onOpenSong?.(songId)));
    li.appendChild(foot);
    return li;
  };
  const label = (source) => (source ? { url: source.url, label: sourceLabelOf(source.url) } : null);

  if (groups.chartStreaks.length) {
    panel.appendChild(
      section(
        "チャートの記録",
        null,
        groups.chartStreaks.map((record) => recordItem(`${record.label}：${record.value}${record.unit}`, null, label(record.source)))
      )
    );
  }
  if (groups.hot100No1.length) {
    panel.appendChild(
      section(
        "Billboard JAPAN Hot 100（総合）で1位",
        "CD の売上だけでなく、配信・再生なども合わせた総合チャート。",
        groups.hot100No1.map((record) => recordItem(record.title, `${formatDotDate(record.chartPublished)} 公開のチャート`, label(record.source), record.songId))
      )
    );
  }
  if (groups.streamingCerts.length) {
    panel.appendChild(
      section(
        "ストリーミングの認定（RIAJ）",
        "再生回数で決まる認定。CD の認定（出荷が基準）とは別です。",
        groups.streamingCerts.map((record) => recordItem(`${record.title}：${record.level}`, `${formatYearMonth(record.yearMonth)}度`, label(record.source), record.songId))
      )
    );
  }
  if (groups.streamingTotals.length) {
    panel.appendChild(
      section(
        "ストリーミング累計の節目（オリコン）",
        "音楽配信サービスでの再生回数の合計。YouTube の MV の回数とは別です。",
        groups.streamingTotals.map((record) =>
          recordItem(`${record.title}：${record.milestone}`, `${record.plays.toLocaleString("ja-JP")}回（${record.chart}）`, label(record.source), record.songId)
        )
      )
    );
  }
  return panel;
}

function setTab(next) {
  tab = next;
  parts.tabs.querySelectorAll(".tv-chip").forEach((chip) => {
    const active = chip.dataset.tab === tab;
    chip.classList.toggle("is-active", active);
    chip.setAttribute("aria-selected", active ? "true" : "false");
  });
  container.querySelectorAll(".cds-panel").forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tab;
  });
}

function build() {
  container.innerHTML = "";
  container.appendChild(el("p", "cds-intro", "デビューから今までの成長を、CD の売上とチャートの記録でたどれます。"));
  container.appendChild(buildHeadline());
  const tabs = el("div", "tv-chips cds-tabs");
  tabs.setAttribute("role", "tablist");
  [
    ["singles", `シングル（${getCdSalesModel().singles.length}作）`],
    ["albums", "アルバム"],
    ["records", "楽曲の記録・認定"],
  ].forEach(([id, text]) => {
    const chip = button(`tv-chip${id === tab ? " is-active" : ""}`, text, () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      setTab(id);
    });
    chip.dataset.tab = id;
    chip.setAttribute("role", "tab");
    tabs.appendChild(chip);
  });
  parts.tabs = tabs;
  container.appendChild(tabs);
  container.append(buildSinglesPanel(), buildAlbumsPanel(), buildRecordsPanel());
  container.appendChild(
    el(
      "p",
      "cds-note",
      `数値は Billboard JAPAN・オリコン・日本レコード協会・メーカーの発表で確かめたものだけです（確かめた日：${formatDotDate(CD_SALES_CHECKED_AT)}）。確かめられなかったものは「未確認」と出しています。順位・累計・認定は、あとから変わることがあります。`
    )
  );
  built = true;
}

// options.workId：その作品を選んで、一覧のその作品を開く。options.tab："singles"｜"albums"｜"records"
// 戻り値：開いた作品の一覧の要素（無ければ null。テスト用）
export function openCdSalesScreen(options = {}) {
  if (!container) return null;
  if (!built) build();
  const albumIds = new Set(getCdSalesModel().albums.map((row) => row.workId));
  const nextTab = options.tab ?? (options.workId && albumIds.has(options.workId) ? "albums" : options.workId ? "singles" : tab);
  setTab(nextTab);
  const singles = getCdSalesModel().singles;
  if (!selectedWorkId && singles.length) selectWork(singles[singles.length - 1].workId);
  // グラフはいちばん新しい作品（右端）が見える位置から
  requestAnimationFrame(() => {
    const scroller = parts.chartScroll;
    if (!scroller) return;
    scroller.scrollLeft = scroller.scrollWidth;
    if (parts.scrollHint) parts.scrollHint.hidden = scroller.scrollWidth <= scroller.clientWidth + 1;
  });
  if (options.workId) {
    if (!albumIds.has(options.workId)) selectWork(options.workId);
    return openListItem(options.workId, { scroll: true });
  }
  return null;
}

// elements：{ container }。options.onOpenWork(workId)・onOpenSong(songId)
export function initCdSalesScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onOpenWork: options.onOpenWork ?? null, onOpenSong: options.onOpenSong ?? null };
  built = false;
  selectedWorkId = null;
  tab = "singles";
}
