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
];
