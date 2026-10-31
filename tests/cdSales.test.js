// 【2026-10-31新設】「CD売上・チャート記録」の回帰テスト。
// データの整合（21作・Billboard は全部数値・未確認の表示・基準日・形態違いの重複なし・調査の値のまま）、
// グラフの描画、作品の詳しい記録、ページの行き先（ホーム・作品詳細・収録曲一覧・周年ヒストリー・ガイド・全体検索）を確かめる。
import { SONGS, CATEGORY } from "../js/data/songs.js";
import { DISCOGRAPHY } from "../js/data/discography.js";
import { ANNIVERSARY_EVENTS } from "../js/data/anniversaryHistory.js";
import { CD_SALES_SINGLES, CD_SALES_ALBUMS, SONG_RECORDS, RIAJ_CHECKED_THROUGH } from "../js/data/cdSales.js";
import {
  buildCdSalesModel,
  buildFirstWeekChart,
  buildHeadlineStats,
  collectSources,
  describeBillboardSalesRank,
  describeCertifications,
  findFirstWeekMilestones,
  formatChartValue,
  formatCopies,
  formatManCopies,
  groupSongRecords,
  sourceLabelOf,
} from "../js/cdSalesModel.js";
import { initCdSalesScreen, openCdSalesScreen } from "../js/cdSalesScreen.js";
import { findCdSalesEntry } from "../js/discographyScreen.js";
import { relatedTargets } from "../js/anniversaryHistoryModel.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { GUIDE_SECTIONS, GUIDE_CATEGORIES } from "../js/data/guideContent.js";
import { GUIDE_RETURN_HUBS_OF_SCREEN } from "../js/appNavigationStack.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const model = buildCdSalesModel({ songs: SONGS, discography: DISCOGRAPHY, singles: CD_SALES_SINGLES, albums: CD_SALES_ALBUMS });
const singleNumber = (entry) => Number(entry.workId.slice(-2));

// 調査（tools/feature-research/2026-10-31/cd-sales/report.md の②）の Billboard 初週。1st〜21st の順
const RESEARCH_BILLBOARD = [22015, 54234, 73319, 92809, 113452, 177296, 179948, 125003, 121508, 153521, 191447, 195863, 216215, 239196, 256835, 233478, 260304, 302589, 346768, 417068, 503043];
const RESEARCH_BILLBOARD_RANK = [5, 3, 3, 2, 2, 1, 2, 1, 2, 2, 2, 1, 2, 1, 1, 3, 2, 2, 1, 1, 1];
// 調査のオリコン初週（万枚）。確かめられたのは10作だけ
const RESEARCH_ORICON = { 6: 14.3, 8: 10.0, 12: 14.4, 13: 16.1, 14: 18.0, 15: 20.7, 18: 24.9, 19: 33.0, 20: 36.0, 21: 51.5 };

function runDataTests() {
  // 21作・形態違いの重複なし
  assertEqual(CD_SALES_SINGLES.length, 21, "データ：シングルは21作");
  assertEqual(CD_SALES_SINGLES.map((entry) => entry.workId), Array.from({ length: 21 }, (_, i) => `single-${String(i + 1).padStart(2, "0")}`), "データ：1st〜21st が発売順に1作ずつ");
  assertEqual(new Set(CD_SALES_SINGLES.map((entry) => entry.workId)).size, CD_SALES_SINGLES.length, "データ：同じ作品が2回出てこない（形態違いを別の作品として数えない）");
  assertEqual(new Set(model.singles.map((row) => row.title)).size, 21, "データ：作品名も重ならない（Type A〜F などを分けていない）");
  assertEqual(JSON.stringify(CD_SALES_SINGLES).match(/Type ?[A-F]|初回限定|通常盤/g), null, "データ：形態ごとの数を持っていない");

  // Billboard は全部数値・調査の値のまま
  assertEqual(CD_SALES_SINGLES.every((entry) => Number.isInteger(entry.billboardFirstWeek?.copies) && entry.billboardFirstWeek.copies > 0), true, "Billboard 初週：21作とも1枚単位の数値");
  assertEqual(CD_SALES_SINGLES.map((entry) => entry.billboardFirstWeek.copies), RESEARCH_BILLBOARD, "Billboard 初週：調査の値と一致（変えていない）");
  assertEqual(CD_SALES_SINGLES.map((entry) => entry.billboardFirstWeek.rankInWeek), RESEARCH_BILLBOARD_RANK, "Billboard 初週：発売週の順位が調査と一致");
  assertEqual(CD_SALES_SINGLES.every((entry) => /^https:\/\/www\.billboard-japan\.com\//.test(entry.billboardFirstWeek.source?.url ?? "")), true, "Billboard 初週：全部に Billboard JAPAN の出典");

  // オリコン初週は10作だけ。ほかは null（＝画面では「未確認」）。参考値は持ち込まない
  const oricon = Object.fromEntries(CD_SALES_SINGLES.filter((entry) => entry.oriconFirstWeek).map((entry) => [singleNumber(entry), entry.oriconFirstWeek.manCopies]));
  assertEqual(oricon, RESEARCH_ORICON, "オリコン初週：確かめた10作だけ・調査の値のまま");
  assertEqual(CD_SALES_SINGLES.filter((entry) => entry.oriconFirstWeek === null).length, 11, "オリコン初週：未確認の11作は null（0 にしない）");
  const text = JSON.stringify([CD_SALES_SINGLES, CD_SALES_ALBUMS, SONG_RECORDS]);
  assertEqual(/hintValue|altValue|Fukayomi/.test(text), false, "参考値（hintValue・深ヨミの値）を持ち込んでいない");
  assertEqual([14.8, 20.6, 417070, 503045, 496369, 275853].filter((value) => text.includes(String(value))), [], "参考値（ファンサイトの値・深ヨミの値・検索要約の値）がデータに無い");

  // 最高順位
  assertEqual(CD_SALES_SINGLES.every((entry) => Number.isInteger(entry.oriconPeak?.rank)), true, "オリコン最高位：21作とも数値");
  assertEqual(CD_SALES_SINGLES.filter((entry) => entry.billboardSalesPeak).map(singleNumber), [6, 8, 12, 14, 15, 19, 20, 21], "Billboard 売上の最高位：確かめた8作（1位の作品）だけ");
  assertEqual(CD_SALES_SINGLES.filter((entry) => entry.oriconPeak.rank === 1).map(singleNumber), [6, 8, 12, 14, 15, 19, 20, 21], "オリコン1位：8作");
  assertEqual(CD_SALES_SINGLES.find((entry) => entry.workId === "single-01").hot100Peak, null, "Hot 100：1st は未確認（null）");

  // 累計・出荷には基準日。種類を混ぜない
  const cumulative = CD_SALES_SINGLES.flatMap((entry) => entry.cumulative);
  assertEqual(cumulative.length, 2, "累計：確かめられたのは 20th の2件だけ");
  assertEqual(cumulative.every((item) => typeof item.asOf === "string" && item.asOf.length >= 10 && item.source?.url), true, "累計：全部に基準日と出典");
  assertEqual(cumulative.map((item) => item.kind).sort(), ["billboard_sales", "oricon_sales"], "累計：Billboard とオリコンを別の項目で持つ");
  assertEqual([cumulative.find((item) => item.kind === "billboard_sales").copies, cumulative.find((item) => item.kind === "oricon_sales").manCopies], [500264, 41.6], "累計：20th の値は調査のまま");
  const shipments = CD_SALES_SINGLES.flatMap((entry) => entry.shipments);
  assertEqual(shipments.length, 2, "出荷：21st の2件（初日・累計）");
  assertEqual(shipments.every((item) => /\d{4}-\d{2}-\d{2}/.test(item.asOf) && item.source?.url), true, "出荷：全部に基準日（発表日）と出典");
  assertEqual(shipments.some((item) => "copies" in item || "manCopies" in item), false, "出荷：売上の数の欄（copies 等）を持たない（売上と混ぜない）");
  assertEqual(CD_SALES_SINGLES.find((entry) => entry.workId === "single-21").cumulative, [], "21st：出荷の発表はあるが、累計売上は未確認のまま");

  // RIAJ
  assertEqual(CD_SALES_SINGLES.filter((entry) => entry.riajCertifications.length > 0).length, 19, "RIAJ：認定のある作品は19作");
  assertEqual(CD_SALES_SINGLES.filter((entry) => entry.riajCertifications.length === 0).map(singleNumber), [1, 2], "RIAJ：1st・2nd は認定なし");
  assertEqual(CD_SALES_SINGLES.find((entry) => entry.workId === "single-21").riajCertifications.map((cert) => [cert.level, cert.yearMonth]), [["ダブル・プラチナ", "2026-08"]], "RIAJ：21st はダブル・プラチナ（2026年8月）");
  assertEqual(RIAJ_CHECKED_THROUGH, "2026-09", "RIAJ：2026年9月度まで確かめた");

  // 出典
  const allSourced = [...CD_SALES_SINGLES, ...CD_SALES_ALBUMS].every((entry) =>
    [entry.billboardFirstWeek, entry.oriconFirstWeek, entry.oriconPeak, entry.billboardSalesPeak, entry.hot100Peak, ...entry.cumulative, ...entry.shipments, ...entry.otherSales, ...entry.riajCertifications]
      .filter(Boolean)
      .every((item) => /^https:\/\//.test(item.source?.url ?? ""))
  );
  assertEqual(allSourced, true, "出典：数値の全部に https の出典 URL");
  assertEqual([...CD_SALES_SINGLES, ...CD_SALES_ALBUMS].every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.checkedAt)), true, "参照日：全作に確かめた日（checkedAt）");

  // 既存のデータとつながる（同じ情報を別々に持たない）
  const discographyIds = new Set(DISCOGRAPHY.map((entry) => entry.workId));
  assertEqual([...CD_SALES_SINGLES, ...CD_SALES_ALBUMS].every((entry) => discographyIds.has(entry.workId)), true, "discography.js に全作品の枠がある（single-21 を足した）");
  assertEqual(DISCOGRAPHY.filter((entry) => entry.type === "single").length, 21, "discography.js：シングルは21作");
  assertEqual(model.missing, [], "songs.js に全作品の曲がある");
  assertEqual(CD_SALES_SINGLES.some((entry) => "title" in entry || "releaseDate" in entry || "center" in entry), false, "作品名・発売日・センターは cdSales.js に持たない（songs.js から）");
  const single21 = DISCOGRAPHY.find((entry) => entry.workId === "single-21");
  assertEqual(/未確認/.test(single21.centerNote ?? ""), true, "single-21：センター「全員」に公式未確認の注記がある");
  assertEqual(SONGS.find((song) => song.id === "koi-hajimemashita").center, ["全員"], "single-21：センターは「全員」のまま");
  assertEqual(model.singles.find((row) => row.workId === "single-21").releaseDate, "2026-08-26", "single-21：発売日は songs.js の値");
  assertEqual(model.singles.find((row) => row.workId === "single-18").titleTracks.map((track) => track.title), ["とくべチュ、して", "恋人以上、好き未満"], "18th：両A面の表題曲を2曲とも出す");

  // アルバムは別
  assertEqual(CD_SALES_ALBUMS.map((entry) => entry.workId), ["album-01"], "アルバム：1作（全部、内緒。）");
  assertEqual(CD_SALES_ALBUMS[0].billboardFirstWeek.copies, 46274, "アルバム：Billboard Top Albums Sales 初週は調査のまま");
  assertEqual(CD_SALES_SINGLES.some((entry) => entry.workId.startsWith("album")), false, "アルバムをシングルに混ぜない");

  // 楽曲の記録（CD 以外）
  const songIds = new Set(SONGS.map((song) => song.id));
  assertEqual(SONG_RECORDS.filter((record) => record.songId).every((record) => songIds.has(record.songId)), true, "楽曲の記録：曲の ID がすべて存在する");
  const groups = groupSongRecords(SONG_RECORDS);
  assertEqual(groups.hot100No1.map((record) => record.title), ["ズルいよ ズルいね", "劇薬中毒", "恋、はじめました。"], "楽曲の記録：Hot 100 の1位は3曲（古い順）");
  assertEqual(groups.chartStreaks.find((record) => record.id === "oricon-top10-streak").value, 21, "楽曲の記録：オリコン TOP10 は21作連続");
  assertEqual(SONG_RECORDS.some((record) => /tiktok|mv_views|award/i.test(record.kind)), false, "楽曲の記録：未確認の MV・TikTok・作詞者の賞は入れない");
}

function runModelTests() {
  assertEqual([formatCopies(503043), formatCopies(null), formatCopies(undefined)], ["503,043枚", null, null], "表示：枚数（数が無ければ null。0枚にしない）");
  assertEqual([formatManCopies(36), formatManCopies(51.5), formatManCopies(null)], ["36.0万枚", "51.5万枚", null], "表示：オリコンの概数");
  assertEqual([formatChartValue(22015), formatChartValue(503043)], ["2.2", "50.3"], "表示：グラフの数（万枚）");
  assertEqual([sourceLabelOf("https://www.billboard-japan.com/d_news/detail/1"), sourceLabelOf("https://www.oricon.co.jp/news/1/full/"), sourceLabelOf("https://www.riaj.or.jp/data/gd/search/")], ["Billboard JAPAN", "ORICON NEWS", "日本レコード協会（RIAJ）"], "出典の名前は URL から");

  assertEqual(model.singles.length, 21, "モデル：シングル21作");
  assertEqual(model.singles.map((row) => row.number), Array.from({ length: 21 }, (_, i) => i + 1), "モデル：発売順");
  assertEqual(model.albums.map((row) => row.title), ["全部、内緒。"], "モデル：アルバムは別の区分");

  const chart = buildFirstWeekChart(model.singles);
  assertEqual(chart.bars.length, 21, "グラフ：21本");
  assertEqual(chart.bars.map((bar) => bar.copies), RESEARCH_BILLBOARD, "グラフ：Billboard 初週だけで描く（オリコンを混ぜない）");
  assertEqual(chart.axisMax, 600000, "グラフ：目盛りの上限は60万枚");
  assertEqual(chart.gridLines.map((line) => line.label), ["10万", "20万", "30万", "40万", "50万", "60万"], "グラフ：目盛り");
  assertEqual(chart.bars.every((bar) => bar.ratio > 0 && bar.ratio <= 1), true, "グラフ：棒の高さは 0〜1");
  assertEqual(chart.bars.filter((bar) => bar.isBest).map((bar) => Number(bar.workId.slice(-2))), [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 17, 18, 19, 20, 21], "グラフ：その時点の自己最高（★）");
  assertEqual(chart.bars.slice(-5).every((bar) => bar.isBest), true, "グラフ：17th〜21st は5作連続で自己最高（調査の記録と同じ）");

  const milestones = findFirstWeekMilestones(model.singles);
  assertEqual(milestones.map((item) => [item.label, item.row.number]), [
    ["初週10万枚を初めて超えた", 5],
    ["初めての週間1位（Billboard）", 6],
    ["初週20万枚を初めて超えた", 13],
    ["初週30万枚を初めて超えた", 18],
    ["初週40万枚を初めて超えた", 20],
    ["初週50万枚を初めて超えた", 21],
  ], "節目：データから数える（21st で初週50万枚超え）");

  const stats = buildHeadlineStats(model.singles);
  assertEqual([stats.first.value, stats.best.value, stats.best.row.workId], ["22,015枚", "503,043枚", "single-21"], "上の数字：デビュー作と自己最高");

  const row = (n) => model.singles[n - 1];
  assertEqual(describeBillboardSalesRank(row(1).sales), "発売週5位（最高位は未確認）", "最高順位：確かめていない Billboard の最高位は「未確認」と書く");
  assertEqual(describeBillboardSalesRank(row(21).sales), "最高1位", "最高順位：確かめた作品は「最高○位」");
  assertEqual(describeCertifications(row(11).sales.riajCertifications), "ゴールド（2022年5月） → プラチナ（2022年7月）", "認定：上がった順に");
  assertEqual(describeCertifications(row(1).sales.riajCertifications), null, "認定：無い作品は null（画面では「認定なし」）");
  assertEqual(collectSources(row(20).sales).every((source) => source.label && source.url), true, "出典：名前と URL");
}

function runScreenTests() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const opened = [];
  initCdSalesScreen({ container }, { onOpenWork: (workId) => opened.push(["work", workId]), onOpenSong: (songId) => opened.push(["song", songId]) });
  openCdSalesScreen();
  const singlesPanel = container.querySelector('.cds-panel[data-panel="singles"]');
  assertEqual(container.querySelectorAll(".cds-bar").length, 21, "画面：グラフの棒が21本");
  assertEqual(container.querySelectorAll(".cds-bar-fill").length, 21, "画面：棒が描かれる");
  assertEqual(singlesPanel.querySelectorAll(".cds-item").length, 21, "画面：一覧が21作");
  assertEqual(container.querySelector('.cds-panel[data-panel="albums"]').hidden, true, "画面：アルバムは別の区分（最初は隠れている）");
  assertEqual(container.querySelector(".cds-bar.is-selected")?.dataset.workId, "single-21", "画面：最初はいちばん新しい作品を選ぶ");
  assertEqual(container.querySelector(".cds-readout").textContent.includes("503,043枚"), true, "画面：選んだ作品の枚数が出る");

  container.querySelector('.cds-bar[data-work-id="single-06"]').click();
  const readout = container.querySelector(".cds-readout").textContent;
  assertEqual(readout.includes("ズルいよ ズルいね") && readout.includes("177,296枚"), true, "画面：棒を押すとタイトルと枚数が出る");
  assertEqual(container.querySelector('.cds-bar[data-work-id="single-06"]').getAttribute("aria-pressed"), "true", "画面：選んだ棒は aria-pressed");
  assertEqual(container.querySelector('.cds-bar[data-work-id="single-01"]').getAttribute("aria-label"), "1st「＝LOVE」 初週 22,015枚", "画面：棒の読み上げ");

  // 作品の詳しい記録（未確認の表示・0 と出さない）
  const first = container.querySelector('.cds-item[data-work-id="single-01"]');
  first.querySelector(".cds-item-head").click();
  const firstText = first.querySelector(".cds-item-body").textContent;
  assertEqual(first.querySelector(".cds-item-head").getAttribute("aria-expanded"), "true", "詳しい記録：押すと開く");
  assertEqual(firstText.includes("未確認"), true, "詳しい記録：未確認は「未確認」と出す");
  assertEqual(/(^|[^0-9,])0枚|0\.0万枚/.test(firstText), false, "詳しい記録：未確認を 0 と出さない");
  assertEqual(firstText.includes("認定なし（2026年9月度まで）"), true, "詳しい記録：認定が無い作品");
  assertEqual(firstText.includes("発売週5位（最高位は未確認）"), true, "詳しい記録：Billboard の最高位");

  const last = openCdSalesScreen({ workId: "single-21" });
  const lastText = last.querySelector(".cds-item-body").textContent;
  assertEqual(lastText.includes("51.5万枚") && lastText.includes("503,043枚"), true, "詳しい記録：初週を Billboard・オリコン別々に");
  assertEqual(lastText.includes("初日出荷 59万枚越え") && lastText.includes("2026-08-26 発表") && lastText.includes("売上ではなく出荷の数"), true, "詳しい記録：出荷は基準日つき・売上と分ける");
  assertEqual(lastText.includes("公式のセンター発表は未確認"), true, "詳しい記録：21st のセンターの注記");
  assertEqual(lastText.includes("ダブル・プラチナ（2026年8月）"), true, "詳しい記録：RIAJ の認定");
  assertEqual(last.querySelectorAll(".cds-source-link").length >= 4, true, "詳しい記録：出典のリンク");
  const twentieth = openCdSalesScreen({ workId: "single-20" }).querySelector(".cds-item-body").textContent;
  assertEqual(twentieth.includes("500,264枚") && twentieth.includes("2026-08-30（集計週末）時点") && twentieth.includes("41.6万枚"), true, "詳しい記録：累計は基準日つき");
  last.querySelector(".cds-nav-button").click();
  last.querySelector(".cds-nav-button.is-sub").click();
  assertEqual(opened, [["work", "single-21"], ["song", "koi-hajimemashita"]], "詳しい記録：作品のページ・収録曲一覧へ移れる");

  const album = openCdSalesScreen({ workId: "album-01" });
  assertEqual(container.querySelector('.cds-panel[data-panel="albums"]').hidden, false, "アルバム：アルバムの区分が開く");
  assertEqual(album.querySelector(".cds-item-body").textContent.includes("46,274枚"), true, "アルバム：初週の枚数");
  assertEqual(container.querySelector('.cds-panel[data-panel="albums"] .cds-bar'), null, "アルバム：シングルのグラフに混ぜない");
  openCdSalesScreen({ tab: "records" });
  assertEqual(container.querySelector('.cds-panel[data-panel="records"]').textContent.includes("Hot 100"), true, "楽曲の記録・認定の区分");
  container.remove();
}

function runLinkTests() {
  // 作品詳細・収録曲一覧
  assertEqual([Boolean(findCdSalesEntry("single-21")), Boolean(findCdSalesEntry("album-01")), findCdSalesEntry("digital-01")], [true, true, null], "作品詳細：数値のある作品だけ「売上・チャート」欄");
  // 周年ヒストリー
  const event21 = ANNIVERSARY_EVENTS.find((event) => event.related?.workId === "single-21");
  const targets = relatedTargets(event21, { workIds: new Set(DISCOGRAPHY.map((e) => e.workId)), salesWorkIds: new Set(CD_SALES_SINGLES.map((e) => e.workId)) });
  assertEqual(targets.map((target) => target.kind), ["work", "cdSales"], "周年ヒストリー：21st の出来事から作品と売上・チャート記録へ");
  // ガイド
  const guide = GUIDE_SECTIONS.find((section) => section.id === "cdSales");
  assertEqual(guide?.actions?.[0]?.open, { click: "cd-sales-home-link" }, "ガイド：CD売上・チャート記録の項目から開ける");
  assertEqual(GUIDE_CATEGORIES.find((category) => category.id === "info").sectionIds.includes("cdSales"), true, "ガイド：＝LOVE情報の目次にある");
  assertEqual(GUIDE_RETURN_HUBS_OF_SCREEN.cdSales, ["guide"], "ガイドから開いたら、戻るでガイドへ");
  // 全体検索
  const entries = buildAppSearchEntries();
  const gekiyaku = searchAppEntries(entries, "劇薬中毒").results.map((result) => result.entry.key);
  assertEqual(gekiyaku.slice(0, 2).sort(), ["song:gekiyaku-chudoku", "work:single-20"], "検索：「劇薬中毒」は今までどおり曲と作品が上");
  assertEqual(gekiyaku.includes("cdSales:single-20"), true, "検索：「劇薬中毒」で売上の情報も出る");
  const salesEntry = entries.find((entry) => entry.key === "cdSales:single-20");
  assertEqual(salesEntry.action.target, { kind: "cdSales", workId: "single-20" }, "検索：売上の結果から CD売上・チャート記録のその作品へ");
  assertEqual(salesEntry.lines.some((line) => line.includes("417,068枚")), true, "検索：結果に初週の枚数");
  assertEqual(searchAppEntries(entries, "劇薬中毒 売上").results[0]?.entry.key, "cdSales:single-20", "検索：「劇薬中毒 売上」は売上の結果が先頭");
  assertEqual(searchAppEntries(entries, "初週").results[0]?.entry.key, "feature:feature-cd-sales", "検索：「初週」で CD売上・チャート記録の機能が先頭");
  assertEqual(APP_SEARCH_FEATURES.find((feature) => feature.id === "feature-cd-sales")?.action, { type: "click", selector: "#cd-sales-home-link" }, "検索：機能の入口はホームのボタン");
  assertEqual(searchAppEntries(entries, "恋、はじめました").results.some((result) => result.entry.key === "work:single-21"), true, "検索：21st の作品も見つかる（single-21 の枠を足した）");
}

async function runMarkupTests() {
  const [html, sw, main] = await Promise.all([fetchText("index.html"), fetchText("sw.js"), fetchText("js/main.js")]);
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(Boolean(doc.querySelector("#home-card-know #cd-sales-home-link")), true, "入口：ホームの「＝LOVEをもっと知る」にある");
  assertEqual(doc.querySelector("#cd-sales-home-link b")?.textContent, "CD売上・チャート", "入口：名前");
  assertEqual(Boolean(doc.querySelector("#cd-sales-screen #cd-sales-back-button.back-link")) && Boolean(doc.querySelector("#cd-sales-content")), true, "画面：戻るボタンと中身の入れ物");
  assertEqual(Boolean(doc.querySelector('link[href="css/cdSales.css"]')), true, "画面：CSS を読み込む");
  assertEqual(["./css/cdSales.css", "./js/cdSalesScreen.js", "./js/cdSalesModel.js", "./js/data/cdSales.js"].every((file) => sw.includes(`"${file}"`)), true, "オフライン：新しいファイルを APP_SHELL に入れた");
  // 【2026-11-01 r7-live-fix】統合版（cce0eb1）で親が v407 に上げたため、「v406 のまま」ではなく「v406 以上」を確かめる（担当の作業では変えない）
  assertEqual(Number(/const CACHE_VERSION = "v(\d+)";/.exec(sw)?.[1]) >= 406, true, "CACHE_VERSION は v406 以上（担当の作業では変えない）");
  assertEqual(main.includes('target.kind === "cdSales"') && main.includes('screen === "cdSales"') && main.includes('openCdSalesFrom("start")'), true, "行き先：検索・作品詳細・ホームから開く処理がある");
}

export async function runCdSalesTests() {
  console.log("--- CD売上・チャート記録（2026-10-31） ---");
  runDataTests();
  runModelTests();
  runScreenTests();
  runLinkTests();
  await runMarkupTests();
}
