// CD 売上・チャート記録のデータ（2026-10-31新設。js/cdSalesScreen.js・js/cdSalesModel.js が使う）。
//
// 【元にした調査】owner repo の tools/feature-research/2026-10-31/cd-sales/（singles.json・albums.json・records.json・report.md）。
//   数値は調査の値をそのまま写した（変えていない）。調査で「未確認」のものは null にし、画面では「未確認」と出す（0 と出さない）。
//   参考値（ファンサイトの値・検索の要約だけの値・Billboard の分析記事「深ヨミ」の値）は持ち込まない。
//
// 【持たないもの（二重管理をしない）】作品名・発売日・表題曲・センターは、workId で js/data/songs.js から組み立てる
//   （js/discographyScreen.js の buildWorkSummaries）。21st のセンターの注記は js/data/discography.js の centerNote。
//
// 【数字の種類を混ぜない】
//   billboardFirstWeek … Billboard JAPAN「Top Singles Sales」の発売週の売上（枚。1枚単位）。グラフはこれだけで描く
//   oriconFirstWeek    … オリコン週間シングルランキングの初週売上（記事の「○万枚」の概数。manCopies＝万枚）
//   oriconPeak         … オリコン週間シングルランキングの最高位
//   billboardSalesPeak … Billboard Top Singles Sales の最高位（確かめた作品だけ。null＝発売週の順位 rankInWeek のみ確認）
//   hot100Peak         … Billboard JAPAN Hot 100（総合ソング・チャート。売上だけでなく配信・再生なども合わせた順位）の最高位
//   cumulative         … 累計の売上（kind："billboard_sales"（枚）／"oricon_sales"（万枚））。asOf（いつ時点か）を必ず持つ
//   shipments          … メーカー（レーベル）発表の出荷の枚数（売上ではない）。asOf を必ず持つ
//   otherSales         … 初週・累計以外の売上の記録（オリコンのデイリー＝1日分 など）
//   riajCertifications … 日本レコード協会（RIAJ）のゴールドディスク認定。出荷の枚数が基準（売上とは別）
//   oriconCumulativeOrder … オリコン推定累積売上の、シングルの中での多い順（枚数は公開されていない）。変わる値なので asOf つき
//   形態違い（Type A〜F・初回限定盤など）は分けない。どの数値も1作（形態の合計）として持つ。
//
// 【新しいシングルを足すとき】
//   1. songs.js に曲（workId: "single-22" など）があることを確かめる（作品の枠〈discography.js〉は songs.js の workId から自動で作られる）
//   2. CD_SALES_SINGLES の最後に1件足す。分からない欄は null（配列は []）。分かった値には必ず出典（source.url・publishedAt）を付ける
//   3. 調べた日を checkedAt に入れる。オリコンの順位・累計・認定は後から変わるので、直したら checkedAt も直す
//   tests/cdSales.test.js が、21作より増えても「Billboard 初週が数値か」「出典があるか」などを確かめる。

export const CD_SALES_CHECKED_AT = "2026-10-31";
// RIAJ の認定を確かめた最新の月度（これより後の認定は、まだ載っていない）
export const RIAJ_CHECKED_THROUGH = "2026-09";
// オリコン推定累積売上の並び（oriconCumulativeOrder）の出典（全作共通）
export const ORICON_CUMULATIVE_ORDER_SOURCE = { url: "https://www.oricon.co.jp/prof/705208/rank/single/", asOf: "2026-10-31" };

export const CD_SALES_SINGLES = [
  {
    workId: "single-01",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 22015, rankInWeek: 5, chartDate: "2017-09-18付", period: null, source: { url: "https://www.billboard-japan.com/d_news/detail/55411/2", publishedAt: "2017-09-17" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 8, source: { url: "https://www.oricon.co.jp/prof/705208/products/1246408/1/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: null,
    oriconCumulativeOrder: null,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [],
  },
  {
    workId: "single-02",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 54234, rankInWeek: 3, chartDate: "2017-12-18付", period: null, source: { url: "https://www.billboard-japan.com/charts/detail?a=sales&year=2017&month=12&day=18", publishedAt: "2017-12-13" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 3, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 4, chartPublished: "2017-12-13", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 20,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [],
  },
  {
    workId: "single-03",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 73319, rankInWeek: 3, chartDate: "2018-05-28付", period: null, source: { url: "https://www.billboard-japan.com/charts/detail?a=sales&year=2018&month=05&day=28", publishedAt: "2018-05-23" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 3, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 3, chartPublished: "2018-05-23", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 19,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2018-06", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2018-06" } },
    ],
  },
  {
    workId: "single-04",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 92809, rankInWeek: 2, chartDate: "2018-10-29付", period: null, source: { url: "https://www.billboard-japan.com/charts/detail?a=sales&year=2018&month=10&day=29", publishedAt: "2018-10-24" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 2, chartPublished: "2018-10-24", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 18,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2018-10", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2018-10" } },
    ],
  },
  {
    workId: "single-05",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 113452, rankInWeek: 2, chartDate: null, period: null, source: { url: "https://www.billboard-japan.com/d_news/detail/75291/2", publishedAt: "2019-05-01" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 2, chartPublished: "2019-05-01", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 16,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2019-04", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2019-04" } },
    ],
  },
  {
    workId: "single-06",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 177296, rankInWeek: 1, chartDate: "2019-11-11付", period: "2019-10-28〜2019-11-03", source: { url: "https://www.billboard-japan.com/d_news/detail/81824/2", publishedAt: "2019-11-05" } },
    oriconFirstWeek: { manCopies: 14.3, chartDate: "2019-11-11付", source: { url: "https://www.oricon.co.jp/news/2148002/full/", publishedAt: "2019-11-05" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/81824/2", publishedAt: "2019-11-05" } },
    hot100Peak: { rank: 1, chartPublished: "2019-11-06", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 13,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2019-10", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2019-10" } },
    ],
  },
  {
    workId: "single-07",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 179948, rankInWeek: 2, chartDate: "2020-07-20付", period: "2020-07-06〜2020-07-12", source: { url: "https://www.billboard-japan.com/d_news/detail/90004/2", publishedAt: "2020-07-13" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 3, chartPublished: "2020-07-15", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 12,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2020-07", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2020-07" } },
    ],
  },
  {
    workId: "single-08",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 125003, rankInWeek: 1, chartDate: "2020-12-07付", period: "2020-11-23〜2020-11-29", source: { url: "https://www.billboard-japan.com/d_news/detail/94745/2", publishedAt: "2020-11-30" } },
    oriconFirstWeek: { manCopies: 10.0, chartDate: "2020-12-07付", source: { url: "https://www.oricon.co.jp/news/2178105/full/", publishedAt: "2020-12-01" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/94745/2", publishedAt: "2020-11-30" } },
    hot100Peak: { rank: 5, chartPublished: "2020-12-02", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 14,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2020-11", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2020-11" } },
    ],
  },
  {
    workId: "single-09",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 121508, rankInWeek: 2, chartDate: null, period: "2021-08-23〜2021-08-29", source: { url: "https://www.billboard-japan.com/d_news/detail/103456/2", publishedAt: "2021-08-30" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 2, chartPublished: "2021-09-01", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 17,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2021-08", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2021-08" } },
    ],
  },
  {
    workId: "single-10",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 153521, rankInWeek: 2, chartDate: null, period: "2021-12-13〜2021-12-19", source: { url: "https://www.billboard-japan.com/d_news/detail/107083/2", publishedAt: "2021-12-20" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 4, chartPublished: "2021-12-22", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 15,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2021-12", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2021-12" } },
    ],
  },
  {
    workId: "single-11",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 191447, rankInWeek: 2, chartDate: null, period: "2022-05-23〜2022-05-29", source: { url: "https://www.billboard-japan.com/d_news/detail/112713/2", publishedAt: "2022-05-30" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 4, chartPublished: "2022-06-01", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 10,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2022-05", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2022-05" } },
      { level: "プラチナ", yearMonth: "2022-07", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2022-07" } },
    ],
  },
  {
    workId: "single-12",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 195863, rankInWeek: 1, chartDate: null, period: "2022-09-26〜2022-10-02", source: { url: "https://www.billboard-japan.com/d_news/detail/117264", publishedAt: "2022-10-03" } },
    oriconFirstWeek: { manCopies: 14.4, chartDate: "2022-10-10付", source: { url: "https://www.oricon.co.jp/news/2251653/full/", publishedAt: "2022-10-04" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/117264", publishedAt: "2022-10-03" } },
    hot100Peak: { rank: 2, chartPublished: "2022-10-05", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 11,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2022-09", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2022-09" } },
      { level: "プラチナ", yearMonth: "2022-11", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2022-11" } },
    ],
  },
  {
    workId: "single-13",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 216215, rankInWeek: 2, chartDate: null, period: "2023-02-20〜2023-02-26", source: { url: "https://www.billboard-japan.com/d_news/detail/122370/2", publishedAt: "2023-02-27" } },
    oriconFirstWeek: { manCopies: 16.1, chartDate: "2023-03-06付", source: { url: "https://www.oricon.co.jp/news/2288298/full/", publishedAt: "2023-07-25" } },
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 4, chartPublished: "2023-03-01", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 9,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "ゴールド", yearMonth: "2023-02", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2023-02" } },
      { level: "プラチナ", yearMonth: "2023-03", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2023-03" } },
    ],
  },
  {
    workId: "single-14",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 239196, rankInWeek: 1, chartDate: null, period: "2023-07-17〜2023-07-23", source: { url: "https://www.billboard-japan.com/d_news/detail/128012/2", publishedAt: "2023-07-24" } },
    oriconFirstWeek: { manCopies: 18.0, chartDate: "2023-07-31付", source: { url: "https://www.oricon.co.jp/news/2288298/full/", publishedAt: "2023-07-25" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/128012/2", publishedAt: "2023-07-24" } },
    hot100Peak: { rank: 5, chartPublished: "2023-07-26", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 8,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "プラチナ", yearMonth: "2023-07", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2023-07" } },
    ],
  },
  {
    workId: "single-15",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 256835, rankInWeek: 1, chartDate: null, period: "2023-11-27〜2023-12-03", source: { url: "https://www.billboard-japan.com/d_news/detail/132452/2", publishedAt: "2023-12-04" } },
    oriconFirstWeek: { manCopies: 20.7, chartDate: "2023-12-11付", source: { url: "https://www.oricon.co.jp/news/2305517/full/", publishedAt: "2023-12-07" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/132452/2", publishedAt: "2023-12-04" } },
    hot100Peak: { rank: 3, chartPublished: "2023-12-06", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 6,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "プラチナ", yearMonth: "2023-11", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2023-11" } },
    ],
  },
  {
    workId: "single-16",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 233478, rankInWeek: 3, chartDate: null, period: "2024-03-04〜2024-03-10", source: { url: "https://www.billboard-japan.com/d_news/detail/135541/2", publishedAt: "2024-03-11" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 6, chartPublished: "2024-03-13", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 7,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "プラチナ", yearMonth: "2024-03", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2024-03" } },
    ],
  },
  {
    workId: "single-17",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 260304, rankInWeek: 2, chartDate: null, period: "2024-07-29〜2024-08-04", source: { url: "https://www.billboard-japan.com/d_news/detail/140321/2", publishedAt: "2024-08-05" } },
    oriconFirstWeek: null,
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 3, chartPublished: "2024-08-07", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 5,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "プラチナ", yearMonth: "2024-07", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2024-07" } },
    ],
  },
  {
    workId: "single-18",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 302589, rankInWeek: 2, chartDate: null, period: "2025-02-24〜2025-03-02", source: { url: "https://www.billboard-japan.com/d_news/detail/147052/2", publishedAt: "2025-03-03" } },
    oriconFirstWeek: { manCopies: 24.9, chartDate: "2025-03-10付", source: { url: "https://www.oricon.co.jp/news/2412088/full/", publishedAt: "2025-10-14" } },
    oriconPeak: { rank: 2, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: null,
    hot100Peak: { rank: 4, chartPublished: "2025-03-05", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 4,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "プラチナ", yearMonth: "2025-02", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2025-02" } },
    ],
  },
  {
    workId: "single-19",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 346768, rankInWeek: 1, chartDate: null, period: "2025-10-06〜2025-10-12", source: { url: "https://www.billboard-japan.com/d_news/detail/154558/2", publishedAt: "2025-10-13" } },
    oriconFirstWeek: { manCopies: 33.0, chartDate: "2025-10-20付", source: { url: "https://www.oricon.co.jp/news/2412088/full/", publishedAt: "2025-10-14" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/154558/2", publishedAt: "2025-10-13" } },
    hot100Peak: { rank: 4, chartPublished: "2025-10-15", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 3,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "プラチナ", yearMonth: "2025-10", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2025-10" } },
    ],
  },
  {
    workId: "single-20",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 417068, rankInWeek: 1, chartDate: null, period: "2026-03-30〜2026-04-05", source: { url: "https://www.billboard-japan.com/d_news/detail/160234/2", publishedAt: "2026-04-06" } },
    oriconFirstWeek: { manCopies: 36.0, chartDate: "2026-04-13付", source: { url: "https://www.oricon.co.jp/news/2447458/full/", publishedAt: "2026-04-10" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/160234/2", publishedAt: "2026-04-06" } },
    hot100Peak: { rank: 1, chartPublished: "2026-04-08", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
    oriconCumulativeOrder: 2,
    cumulative: [
      { kind: "billboard_sales", copies: 500264, asOf: "2026-08-30（集計週末）", source: { url: "https://www.billboard-japan.com/d_news/detail/165029/2", publishedAt: "2026-08-31" } },
      { kind: "oricon_sales", manCopies: 41.6, asOf: "2026-09-07付チャートの時点（記事2026-09-01）", source: { url: "https://www.oricon.co.jp/news/2477365/full/", publishedAt: "2026-09-01" }, note: "ソニー・ミュージックの発表（PR TIMES）は41.5万枚で、0.1万枚ちがう" },
    ],
    shipments: [],
    otherSales: [],
    riajCertifications: [
      { level: "プラチナ", yearMonth: "2026-04", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2026-04" } },
      { level: "ダブル・プラチナ", yearMonth: "2026-06", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2026-06" } },
    ],
  },
  {
    workId: "single-21",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 503043, rankInWeek: 1, chartDate: null, period: "2026-08-24〜2026-08-30", source: { url: "https://www.billboard-japan.com/d_news/detail/165029/2", publishedAt: "2026-08-31" } },
    oriconFirstWeek: { manCopies: 51.5, chartDate: "2026-09-07付", source: { url: "https://www.oricon.co.jp/news/2477365/full/", publishedAt: "2026-09-01" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/prof/705208/rank/single/", publishedAt: null } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/165029/2", publishedAt: "2026-08-31" } },
    hot100Peak: { rank: 1, chartPublished: "2026-09-02", source: { url: "https://www.billboard-japan.com/d_news/detail/165081", publishedAt: "2026-09-02" } },
    oriconCumulativeOrder: 1,
    cumulative: [],
    shipments: [
      { kind: "first_day", text: "初日出荷 59万枚越え", asOf: "2026-08-26 発表", source: { url: "https://prtimes.jp/main/html/rd/p/000004982.000013546.html", publishedAt: "2026-08-26" } },
      { kind: "cumulative", text: "累計出荷 60万枚突破", asOf: "2026-09-01 発表（何日時点かの記載なし）", source: { url: "https://prtimes.jp/main/html/rd/p/000004991.000013546.html", publishedAt: "2026-09-01" } },
    ],
    otherSales: [
      { kind: "oricon_daily", text: "オリコン デイリー 推定45.1万枚・1位", asOf: "2026-08-25付（発売初日の1日分）", source: { url: "https://prtimes.jp/main/html/rd/p/000004982.000013546.html", publishedAt: "2026-08-26" } },
    ],
    riajCertifications: [
      { level: "ダブル・プラチナ", yearMonth: "2026-08", source: { url: "https://www.riaj.or.jp/data/gd/search/", publishedAt: "2026-08" } },
    ],
  },
];

// アルバム（シングルとは別の区分。シングルのグラフ・集計に混ぜない）。Billboard は Top Albums Sales、オリコンは週間アルバムランキング
export const CD_SALES_ALBUMS = [
  {
    workId: "album-01",
    checkedAt: "2026-10-31",
    billboardFirstWeek: { copies: 46274, rankInWeek: 1, chartDate: null, period: "2021-05-10〜2021-05-16", source: { url: "https://www.billboard-japan.com/d_news/detail/99996/2", publishedAt: "2021-05-17" } },
    oriconFirstWeek: { manCopies: 4.4, chartDate: "2021-05-24付", source: { url: "https://www.oricon.co.jp/news/2193694/full/", publishedAt: "2021-05-18" } },
    oriconPeak: { rank: 1, source: { url: "https://www.oricon.co.jp/news/2193694/full/", publishedAt: "2021-05-18" } },
    billboardSalesPeak: { rank: 1, source: { url: "https://www.billboard-japan.com/d_news/detail/99996/2", publishedAt: "2021-05-17" } },
    hot100Peak: null,
    oriconCumulativeOrder: null,
    cumulative: [],
    shipments: [],
    otherSales: [],
    riajCertifications: [],
  },
];

// CD 以外の記録（楽曲の記録・認定）。確かめられたものだけ。kind で種類を分け、別々の見出しで出す（数字を混ぜない）
//   chart_streak     … チャートの連続記録など（数字＋単位）
//   hot100_no1       … Billboard JAPAN Hot 100（総合）で1位になった曲（chartPublished＝チャートの公開日）
//   riaj_streaming   … RIAJ のストリーミング認定（再生回数が基準。CD の認定とは別）
//   streaming_total  … オリコンのストリーミング累計の節目（再生回数）
export const SONG_RECORDS = [
  { kind: "riaj_streaming", songId: "tokubechu-shite", title: "とくべチュ、して", level: "ゴールド（旧ランク・5,000万回）", yearMonth: "2025-07", source: { url: "https://www.riaj.or.jp/data/st/", publishedAt: null } },
  { kind: "riaj_streaming", songId: "tokubechu-shite", title: "とくべチュ、して", level: "プラチナ（1億回）", yearMonth: "2026-01", source: { url: "https://www.riaj.or.jp/data/st/", publishedAt: null } },
  { kind: "riaj_streaming", songId: "zettai-idol-yamenaide", title: "絶対アイドル辞めないで", level: "ゴールド（旧ランク・5,000万回）", yearMonth: "2025-11", source: { url: "https://www.riaj.or.jp/data/st/", publishedAt: null } },
  { kind: "streaming_total", songId: "tokubechu-shite", title: "とくべチュ、して", milestone: "1億回（自身初）", plays: 102926207, chart: "オリコン週間ストリーミングランキング 2026-01-12付（集計2025-12-29〜2026-01-04）", source: { url: "https://www.cdjournal.com/news/equal-love/123705", publishedAt: "2026-01-08" } },
  { kind: "streaming_total", songId: "tokubechu-shite", title: "とくべチュ、して", milestone: "2億回（自身初）", plays: 200636722, chart: "オリコン週間ストリーミングランキング 2026-10-26付（集計2026-10-12〜10-18）", source: { url: "https://www.the-miyanichi.co.jp/oricon/1188146.html", publishedAt: "2026-10-21" } },
  { kind: "streaming_total", songId: "zettai-idol-yamenaide", title: "絶対アイドル辞めないで", milestone: "1億回（自身2作目）", plays: 100717240, chart: "オリコン週間ストリーミングランキング 2026-11-02付（集計2026-10-19〜10-25）", source: { url: "https://news.yahoo.co.jp/articles/e305a0595810c23f2eb2f94934ba80288f0d928c", publishedAt: "2026-10-28" } },
  { kind: "hot100_no1", songId: "zurui-yo-zurui-ne", title: "ズルいよ ズルいね", chartPublished: "2019-11-06", source: { url: "https://www.billboard-japan.com/d_news/detail/162024/2", publishedAt: "2026-06-13" } },
  { kind: "hot100_no1", songId: "gekiyaku-chudoku", title: "劇薬中毒", chartPublished: "2026-04-08", source: { url: "https://www.billboard-japan.com/d_news/detail/160283", publishedAt: "2026-04-08" } },
  { kind: "hot100_no1", songId: "koi-hajimemashita", title: "恋、はじめました。", chartPublished: "2026-09-02", source: { url: "https://www.billboard-japan.com/d_news/detail/165081", publishedAt: "2026-09-02" } },
  { kind: "chart_streak", id: "oricon-top10-streak", label: "オリコン週間シングル TOP10 入り", value: 21, unit: "作連続（1st〜21st・デビュー作から）", source: { url: "https://www.oricon.co.jp/news/2477365/full/", publishedAt: "2026-09-01" } },
  { kind: "chart_streak", id: "oricon-no1-count", label: "オリコン週間シングル 1位", value: 8, unit: "作（6th・8th・12th・14th・15th・19th・20th・21st）", source: { url: "https://www.oricon.co.jp/news/2477365/full/", publishedAt: "2026-09-01" } },
  { kind: "chart_streak", id: "billboard-first-week-best-streak", label: "Billboard 初週売上の自己最高を更新", value: 5, unit: "作連続（17th〜21st）", source: { url: "https://www.billboard-japan.com/d_news/detail/165560/2", publishedAt: "2026-09-16" } },
];
