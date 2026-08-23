// ＝LOVEの年表のうち、「リリース」以外の出来事（結成の経緯・ライブ・周年等）を保持する
// データファイル（2026-08-02新設）。
//
// リリースイベントはsongs.js/discography.jsから、卒業イベントはmembers.jsのgraduationDateから
// それぞれ自動生成する（js/discographyScreen.js参照）。ここに持たせるのは、それら以外の
// 手作業でしか拾えないイベントだけにする（二重管理を避けるため）。
//
// 【2026-08-02時点の注意】まず結成〜デビューまでの基本的な出来事だけを入力している。
// ライブ・周年イベント等は、後から少しずつ追加していく想定（配列に1件追加するだけでよい設計）。

export const HISTORY_EVENT_TYPE = {
  MILESTONE: "milestone",
  LIVE: "live",
  ANNIVERSARY: "anniversary",
};

export const HISTORY_EVENTS = [
  {
    date: "2017-01-28",
    type: HISTORY_EVENT_TYPE.MILESTONE,
    title: "声優アイドルオーディションの開催を発表",
    description: null,
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/feature/about"],
    lastVerifiedDate: "2026-08-02",
  },
  {
    date: "2017-01-30",
    type: HISTORY_EVENT_TYPE.MILESTONE,
    title: "エントリー受付開始",
    description: null,
    sourceType: "reliable",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-02",
  },
  {
    date: "2017-04-29",
    type: HISTORY_EVENT_TYPE.MILESTONE,
    title: "最終審査でメンバー決定、グループ名「＝LOVE」を発表",
    description: "12人体制でスタート。",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/feature/about"],
    lastVerifiedDate: "2026-08-02",
  },
  {
    date: "2022-04-29",
    type: HISTORY_EVENT_TYPE.MILESTONE,
    title: "髙松瞳、センター交代を発表",
    description: "本人がビデオメッセージで、11thシングルからのセンター交代を自ら発表した。",
    sourceType: "reliable",
    sourceUrls: ["https://www.oricon.co.jp/news/2233370/", "https://natalie.mu/music/pp/equallove13"],
    lastVerifiedDate: "2026-08-03",
  },
  // 【2026-08-23追加】映像商品化の有無に関わらず、＝LOVEの成長が分かる年表へ拡張する
  // （本人指示）。ライブ単体の詳細（会場・映像商品リンク等）は引き続きliveHistory.js/
  // ライブタブ側で管理し、ここには「日付・タイトル・意味」だけを軽量に持たせる
  // （二重管理を避けつつ、年表上でも節目として拾えるようにする）。
  {
    date: "2017-08-05",
    type: HISTORY_EVENT_TYPE.LIVE,
    title: "TOKYO IDOL FESTIVAL 2017でお披露目（メンバー初ステージ）",
    description: "グループ名発表から約3ヶ月後、お台場で開催されたTOKYO IDOL FESTIVAL 2017で、メンバーとして初めて観客の前に立った。",
    sourceType: "reliable",
    sourceUrls: ["https://natalie.mu/music/news/241232", "https://barks.jp/news/796321/"],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2018-09-06",
    type: HISTORY_EVENT_TYPE.ANNIVERSARY,
    title: "1周年記念プレミアムイベント",
    description: "Zepp DiverCity（TOKYO）で、デビュー1周年を記念したイベントを開催した。",
    sourceType: "reliable",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2019-02-16",
    type: HISTORY_EVENT_TYPE.LIVE,
    title: "初の単独コンサート「初めまして、＝LOVEです。」",
    description: "昭和女子大学人見記念講堂で、公式に「1stコンサート」と銘打った初めての単独公演を開催（昼夜計4,000人動員）。続く4月には初の全国ツアーも実施した。",
    sourceType: "official",
    sourceUrls: ["https://equal-love.jp/news/detail/1262", "https://mdpr.jp/music/detail/1822314"],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2020-09-06",
    type: HISTORY_EVENT_TYPE.ANNIVERSARY,
    title: "3周年記念コンサート",
    description: "パシフィコ横浜 国立大ホールで「3rd ANNIVERSARY PREMIUM CONCERT」を開催（新型コロナウイルスの影響で、有観客と配信のハイブリッド開催）。",
    sourceType: "official",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2021-01-17",
    type: HISTORY_EVENT_TYPE.LIVE,
    title: "初の日本武道館公演",
    description: "冬ツアーのファイナル公演として、初めて日本武道館のステージに立った。",
    sourceType: "reliable",
    sourceUrls: ["https://natalie.mu/music/news/402059", "https://natalie.mu/music/news/412879"],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2022-09-25",
    type: HISTORY_EVENT_TYPE.ANNIVERSARY,
    title: "5周年記念コンサート",
    description: "国立代々木競技場 第一体育館で「5th ANNIVERSARY PREMIUM CONCERT」を開催した。",
    sourceType: "official",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2024-09-07",
    type: HISTORY_EVENT_TYPE.ANNIVERSARY,
    title: "7周年記念コンサート、初のアリーナツアーファイナル",
    description: "Kアリーナ横浜で「7th ANNIVERSARY PREMIUM CONCERT」を開催。自身初のアリーナツアー「＝LOVEアリーナツアー2024」のファイナル公演でもあり、当時のグループ史上最大規模となる約36,000人を動員した。",
    sourceType: "official",
    sourceUrls: [
      "https://prtimes.jp/main/html/rd/p/000004314.000013546.html",
      "https://natalie.mu/music/news/569362",
    ],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2025-09-06",
    type: HISTORY_EVENT_TYPE.ANNIVERSARY,
    title: "8周年記念ツアースタート",
    description: "広島サンプラザホールを皮切りに、全国ツアー「8th ANNIVERSARY PREMIUM TOUR」がスタート。ツアーは2026年4月の横浜スタジアムFINALまで続いた。",
    sourceType: "reliable",
    sourceUrls: [],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2026-06-20",
    type: HISTORY_EVENT_TYPE.MILESTONE,
    title: "国立競技場公演でグループ史上最大動員を記録",
    description: "MUFGスタジアム（国立競技場）で2日間の単独公演「＝LOVE STADIUM LIVE『Beyond \"KYUN\"♡』」を開催し、約132,000人を動員（グループ史上最大規模）。この公演中に、初の東京ドーム公演の開催が発表された。",
    sourceType: "official",
    sourceUrls: ["https://prtimes.jp/main/html/rd/p/000004904.000013546.html"],
    lastVerifiedDate: "2026-08-23",
  },
  {
    date: "2027-01-19",
    type: HISTORY_EVENT_TYPE.MILESTONE,
    title: "初の東京ドーム公演（開催予定）",
    description: "＝LOVEにとって初となる東京ドーム公演の開催が発表された（2027年1月19日・20日）。",
    sourceType: "reliable",
    sourceUrls: ["https://mdpr.jp/news/detail/4802393"],
    lastVerifiedDate: "2026-08-23",
  },
];
