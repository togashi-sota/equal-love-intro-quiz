// 曲ごとのコール「考案者・発信者」情報のデータファイル。
//
// 【著作権方針（絶対条件）】ここに持たせるのは「誰が考えた／発信したか」という事実情報のみ。
// 実際のコールの掛け声本文は一切含めない（js/callStorage.jsと同じ方針。コール本文は
// 著作権保護のため端末ローカルのみで扱い、Git・公開サーバーには置かない）。
//
// 【掲載方針】公式サイト・公式グループSNS・公式動画で確認できたものはsourceType:"official"、
// 公式ではないが信頼できる媒体で確認できたものは"reliable"、メンバー本人のSNS・
// 本人出演動画で確認できたものは"self"、ファンの間で広く定着しているが本人発信を
// 確認できないものは"fan"とする。情報源が弱い・人物名を断定できない曲は掲載しない
// （2026-08-06、コールガイド機能の設計方針に基づく。詳細はdocs/HANDOFF.md参照）。
//
// 【注意】js/data/配下の他ファイル（memberProfiles.js等）とは異なり、このファイルの
// "self"は「本人＝メンバー自身の発信」を指す（本人指示、songPenlightGuide.js参照）。
export const SONG_CALL_CREDITS = [
  {
    songId: "umi-to-lemon-tea",
    credits: [
      {
        creditType: "考案",
        creditName: "大場花菜",
        sourceType: "self",
        sourceUrls: ["https://x.com/hana_oba/status/1828444068747321601"],
        lastVerifiedDate: "2026-08-06",
      },
    ],
  },
  {
    songId: "drive-date-tonai",
    credits: [
      {
        creditType: "発信",
        creditName: "髙松瞳",
        sourceType: "self",
        sourceUrls: ["https://www.youtube.com/watch?v=XD0kfWMTvdQ"],
        lastVerifiedDate: "2026-08-06",
      },
    ],
  },
  {
    songId: "nakanaori-shu-cream",
    credits: [
      {
        creditType: "発信",
        creditName: "髙松瞳",
        sourceType: "self",
        sourceUrls: ["https://www.tiktok.com/@t__khrn__h/video/7413031087686962450"],
        lastVerifiedDate: "2026-08-06",
      },
    ],
  },
  {
    songId: "naisho-banashi",
    credits: [
      {
        creditType: "考案",
        creditName: "大谷映美里",
        sourceType: "fan",
        sourceUrls: ["https://ameblo.jp/equal-love-345/entry-12922038152.html"],
        lastVerifiedDate: "2026-08-06",
      },
    ],
  },
  {
    songId: "kimi-no-dai-3-button",
    credits: [
      {
        creditType: "考案",
        creditName: "齋藤樹愛羅",
        sourceType: "fan",
        sourceUrls: ["https://ikorabucall.com/kimi-no-daisan-button-call/"],
        lastVerifiedDate: "2026-08-06",
      },
    ],
  },
];
