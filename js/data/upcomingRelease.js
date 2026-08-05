// 発売前に公式発表された、次の作品の情報を持つデータファイル。
//
// 【使う理由】songs.js／discography.jsは「実際に曲データ（音源・歌詞込み）が揃っている作品」を
// 前提にした一元管理の仕組みで、クイズの出題対象にもそのまま使われる。発売前で曲データが
// 存在しない作品をこの仕組みに混ぜると、クイズに出題されてしまったり、作品一覧に
// 「（曲情報なし）」という壊れた表示が出てしまう。そのため、発売前の期間だけ使う
// 完全に別枠のデータとして持たせる（2026-08-06新設）。
//
// 【運用】発売後は、通常通りsongs.js・discography.jsに曲データを追加したうえで、
// このファイルのUPCOMING_RELEASEはnullに戻す（過去の「発売予定」情報を残し続けない）。
// 確認できていない情報（ジャケット写真・収録曲・センター等）は、確認できるまで一切含めない。
export const UPCOMING_RELEASE = {
  workType: "single",
  singleNumber: 21,
  title: "恋、はじめました。",
  releaseDate: "2026-08-26",
  officialLinks: {
    official: "https://equal-love.jp/news/detail/11815",
  },
  sourceType: "official",
  sourceUrls: ["https://equal-love.jp/news/detail/11588", "https://equal-love.jp/news/detail/11815"],
  lastVerifiedDate: "2026-08-06",
};
