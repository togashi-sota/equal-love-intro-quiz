// 曲ごとに指定・推奨されているペンライトカラーのデータファイル。
//
// 【メンバー個人の色とは別物】メンバーごとの基本ペンライトカラーはjs/data/members.jsの
// penlightColorsにすでに存在する（このファイルでは重複して持たない）。ここに置くのは、
// 「この曲のときはこの色」という曲単位の指定・慣習だけ。
//
// 【掲載方針（絶対条件）】公式サイト・公式グループSNS・公式動画で確認できたものはsourceType:"official"、
// 公式ではないが信頼できる媒体（実在の報道機関・音楽メディア等）で確認できたものは"reliable"、
// メンバー本人のSNS・本人出演動画で確認できたものは"self"、
// ファンの間で広く定着しているが本人・公式発信を確認できないものは"fan"とする。
// 情報源が弱い・断定できない曲は、無理に掲載せずこの配列に含めない
// （2026-08-06、コールガイド機能の設計方針に基づく。詳細はdocs/HANDOFF.md参照）。
//
// 【注意】js/data/配下の他ファイル（memberProfiles.js等）では"self"を「本人＝アプリ利用者が
// 確認したもの」の意味で使っているが、このファイルおよびsongCallCredits.js・
// mixAndKoujouGuide.jsでは本人指示により「本人＝メンバー自身の発信」の意味で使う
// （2026-08-06、混同しないよう明記）。
export const SONG_PENLIGHT_GUIDE = [
  {
    songId: "boku-no-heroine",
    colors: [{ colorName: "青", colorCode: "#5b9bd9", position: null }],
    sourceType: "self",
    sourceUrls: ["https://x.com/takamatsuhitomi/status/1553930058603331586"],
    lastVerifiedDate: "2026-08-06",
    note: "歌唱メンバー本人（髙松瞳）が、この曲のときは青いペンライトで、とXで発信している。",
  },
  {
    songId: "moratorium",
    colors: [{ colorName: "緑", colorCode: "#4caf50", position: null }],
    sourceType: "reliable",
    sourceUrls: [
      "https://news.yahoo.co.jp/articles/25e327bce1dd25f3b22c7e59d8e9b33cad188056",
      "https://news.yahoo.co.jp/articles/051fc0df0fc715a294a236d616ee970c5fe46ab5",
    ],
    lastVerifiedDate: "2026-08-06",
    note: "公式指定の告知ではなく、8周年記念横浜スタジアム公演での披露時の様子として複数の音楽メディアが報じた内容。",
  },
];
