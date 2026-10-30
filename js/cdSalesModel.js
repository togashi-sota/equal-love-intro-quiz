// 「CD売上・チャート記録」ページ（js/cdSalesScreen.js）の中身を組み立てる純粋関数（2026-10-31新設）。DOM に触れない
// （tests/cdSales.test.js で確かめる）。
//
// 作品名・発売日・表題曲・センターは songs.js から（buildWorkSummaries）、売上・順位・認定は js/data/cdSales.js から取り、
// workId で1つにまとめる。同じ情報を2か所に持たない。
import { CATEGORY } from "./data/songs.js";
import { buildWorkSummaries, buildWorkTypeLabel } from "./discographyScreen.js";

// グラフの目盛りの幅（枚）。いちばん高い棒の上の目盛りまで描く
export const CHART_GRID_STEP = 100000;
// 「初めて超えた」を知らせる節目（Billboard 初週・枚）
export const FIRST_WEEK_MILESTONES = [100000, 200000, 300000, 400000, 500000];

// 22015 → "22,015枚"。数でないもの（未確認）は null（呼ぶ側で「未確認」と出す。0 と出さないため）
export function formatCopies(copies) {
  if (!Number.isFinite(copies)) return null;
  return `${copies.toLocaleString("ja-JP")}枚`;
}

// オリコン記事の概数：36 → "36.0万枚"
export function formatManCopies(manCopies) {
  if (!Number.isFinite(manCopies)) return null;
  return `${manCopies.toFixed(1)}万枚`;
}

// グラフの棒の上の短い数（万枚・小数1けた）：503043 → "50.3"
export function formatChartValue(copies) {
  return (Math.round(copies / 1000) / 10).toFixed(1);
}

// "2026-08" → "2026年8月"
export function formatYearMonth(yearMonth) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(yearMonth ?? ""));
  return match ? `${match[1]}年${Number(match[2])}月` : "";
}

// "2026-08-26" → "2026.08.26"
export function formatDotDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? "")) ? date.replaceAll("-", ".") : "日付未確認";
}

// 出典の URL から、画面に出す名前を決める（データに名前を手で書かない）
export function sourceLabelOf(url) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host.endsWith("billboard-japan.com")) return /\/charts\//.test(url) ? "Billboard JAPAN チャート" : "Billboard JAPAN";
  if (host.endsWith("oricon.co.jp")) return /\/news\//.test(url) ? "ORICON NEWS" : "オリコン（作品・ランキング）";
  if (host.endsWith("riaj.or.jp")) return "日本レコード協会（RIAJ）";
  if (host.endsWith("prtimes.jp")) return "PR TIMES（ソニー・ミュージック発表）";
  if (host.endsWith("cdjournal.com")) return "CDJournal（オリコン発表）";
  if (host.endsWith("the-miyanichi.co.jp")) return "ORICON NEWS（宮崎日日新聞サイト）";
  if (host.endsWith("news.yahoo.co.jp")) return "Yahoo!ニュース（ORICON NEWS）";
  return host || "出典";
}

// 1作の数値に付いている出典を、重なりなく並べる（{ url, label, publishedAt }）
export function collectSources(sales, extraSources = []) {
  const list = [];
  const push = (source) => {
    if (!source?.url || list.some((item) => item.url === source.url)) return;
    list.push({ url: source.url, label: sourceLabelOf(source.url), publishedAt: source.publishedAt ?? null });
  };
  [sales.billboardFirstWeek, sales.oriconFirstWeek, sales.oriconPeak, sales.billboardSalesPeak, sales.hot100Peak].forEach((item) => push(item?.source));
  [...(sales.cumulative ?? []), ...(sales.shipments ?? []), ...(sales.otherSales ?? []), ...(sales.riajCertifications ?? [])].forEach((item) => push(item.source));
  extraSources.forEach(push);
  return list;
}

// 1作を画面用にまとめる（songs.js の作品の情報 ＋ cdSales.js の数値）
function buildRow(work, sales) {
  const titleSongs = work.songs.filter((song) => song.category === CATEGORY.TITLE_TRACK);
  // 作品の名前は、表題曲の single（"1stアルバム「全部、内緒。」"・"18thシングル「とくべチュ、して／恋人以上、好き未満」"）の「」の中から。
  // 無ければ表題曲の名前（buildWorkSummaries の title）
  const workName = /「(.+)」/.exec((titleSongs[0] ?? work.songs[0])?.single ?? "")?.[1] ?? work.title;
  const number = Number(/-(\d+)$/.exec(work.workId)?.[1] ?? 0);
  const typeLabel = buildWorkTypeLabel(work.workId, work.type);
  return {
    workId: work.workId,
    type: work.type,
    number,
    // "21stシングル" → "21st"（グラフの下の短い名前）
    shortLabel: typeLabel.replace(/(シングル|アルバム)$/, ""),
    typeLabel,
    title: workName,
    releaseDate: work.releaseDate,
    titleTracks: (titleSongs.length ? titleSongs : work.songs.slice(0, 1)).map((song) => ({
      songId: song.id,
      title: song.title,
      center: Array.isArray(song.center) ? song.center : [],
      centerType: song.centerType ?? null,
    })),
    centerNote: work.centerNote ?? null,
    sales,
  };
}

// 戻り値：{ singles: [行…（発売順）], albums: [行…], missing: [workId…（songs.js に曲が無い作品）] }
export function buildCdSalesModel({ songs, discography, singles, albums }) {
  const works = new Map(buildWorkSummaries(songs, discography).map((work) => [work.workId, work]));
  const missing = [];
  const toRows = (list) =>
    list
      .map((sales) => {
        const work = works.get(sales.workId);
        if (!work || work.songs.length === 0) {
          missing.push(sales.workId);
          return null;
        }
        return buildRow(work, sales);
      })
      .filter(Boolean)
      .sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? "") || a.number - b.number);
  return { singles: toRows(singles), albums: toRows(albums), missing };
}

// グラフ：発売順の棒。ratio＝棒の高さ（0〜1、目盛りの上限に対して）。isBest＝その時点での初週の自己最高
export function buildFirstWeekChart(rows, gridStep = CHART_GRID_STEP) {
  const values = rows.map((row) => row.sales.billboardFirstWeek?.copies).filter(Number.isFinite);
  const max = values.length ? Math.max(...values) : 0;
  const axisMax = Math.max(gridStep, Math.ceil(max / gridStep) * gridStep);
  let best = -Infinity;
  const bars = rows.map((row) => {
    const copies = row.sales.billboardFirstWeek?.copies;
    const isBest = Number.isFinite(copies) && copies > best;
    if (isBest) best = copies;
    return { workId: row.workId, shortLabel: row.shortLabel, title: row.title, copies, ratio: Number.isFinite(copies) ? copies / axisMax : 0, isBest };
  });
  const gridLines = [];
  for (let value = gridStep; value <= axisMax; value += gridStep) gridLines.push({ value, ratio: value / axisMax, label: `${value / 10000}万` });
  return { axisMax, gridLines, bars };
}

// 節目：初週が「初めて N万枚を超えた」作品と、初めて Billboard 週間1位になった作品（データから数える。手で書かない）
export function findFirstWeekMilestones(rows, thresholds = FIRST_WEEK_MILESTONES) {
  const milestones = [];
  const firstNo1 = rows.find((row) => row.sales.billboardFirstWeek?.rankInWeek === 1);
  thresholds.forEach((threshold) => {
    const row = rows.find((candidate) => candidate.sales.billboardFirstWeek?.copies >= threshold);
    if (row) milestones.push({ kind: "threshold", threshold, label: `初週${threshold / 10000}万枚を初めて超えた`, row });
  });
  if (firstNo1) {
    const at = milestones.findIndex((item) => item.row.number > firstNo1.number);
    const item = { kind: "first-no1", label: "初めての週間1位（Billboard）", row: firstNo1 };
    if (at === -1) milestones.push(item);
    else milestones.splice(at, 0, item);
  }
  return milestones;
}

// 最高順位の文：Billboard は最高位を確かめた作品だけ「最高○位」、ほかは「発売週○位（最高位は未確認）」
export function describeBillboardSalesRank(sales) {
  const rankInWeek = sales.billboardFirstWeek?.rankInWeek;
  if (sales.billboardSalesPeak) return `最高${sales.billboardSalesPeak.rank}位`;
  if (Number.isFinite(rankInWeek)) return `発売週${rankInWeek}位（最高位は未確認）`;
  return "未確認";
}

// 累計の文（必ず「何の数字か」と基準日つき）
export function describeCumulative(item) {
  if (item.kind === "billboard_sales") return { label: "Billboard 累計売上", value: formatCopies(item.copies), asOf: item.asOf, note: item.note ?? null };
  if (item.kind === "oricon_sales") return { label: "オリコン 累積売上", value: formatManCopies(item.manCopies), asOf: item.asOf, note: item.note ?? null };
  return { label: "累計", value: null, asOf: item.asOf ?? null, note: null };
}

// RIAJ の認定（同じ作品で上がった順）："ゴールド（2022年5月）→ プラチナ（2022年7月）"
export function describeCertifications(certifications) {
  if (!certifications?.length) return null;
  return [...certifications]
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))
    .map((cert) => `${cert.level}（${formatYearMonth(cert.yearMonth)}）`)
    .join(" → ");
}

// いちばん新しい（高い）認定の名前（一覧の札に使う）
export function latestCertificationLevel(certifications) {
  if (!certifications?.length) return null;
  return [...certifications].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)).at(-1).level;
}

// ページの上の数字（データから数える）
export function buildHeadlineStats(rows) {
  const withCopies = rows.filter((row) => Number.isFinite(row.sales.billboardFirstWeek?.copies));
  if (!withCopies.length) return null;
  const best = withCopies.reduce((a, b) => (b.sales.billboardFirstWeek.copies > a.sales.billboardFirstWeek.copies ? b : a));
  const first = withCopies[0];
  return {
    best: { row: best, value: formatCopies(best.sales.billboardFirstWeek.copies) },
    first: { row: first, value: formatCopies(first.sales.billboardFirstWeek.copies) },
    count: rows.length,
    no1Count: rows.filter((row) => row.sales.billboardFirstWeek?.rankInWeek === 1).length,
  };
}

// 楽曲の記録・認定（CD 以外）を種類ごとに分ける
export function groupSongRecords(records) {
  const pick = (kind) => (records ?? []).filter((record) => record.kind === kind);
  return {
    chartStreaks: pick("chart_streak"),
    hot100No1: pick("hot100_no1").sort((a, b) => a.chartPublished.localeCompare(b.chartPublished)),
    streamingCerts: pick("riaj_streaming").sort((a, b) => a.yearMonth.localeCompare(b.yearMonth)),
    streamingTotals: pick("streaming_total"),
  };
}
