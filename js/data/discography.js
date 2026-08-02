// 作品（シングル/アルバム/配信限定/特別枠）ごとの追加情報だけを持つデータファイル。
// 作品名・発売日・収録曲・センターは songs.js の workId で紐づく曲データから取得するため、
// ここには持たせない（5-1章の「songs.js中心の一元管理」を踏襲し、二重管理を避けるため）。
//
// 掲載方針・情報源のルール（公式リンク優先、ジャケット画像は掲載しない等）は
// docs/HANDOFF.md の2-2章を参照。
//
// 【重要】現時点（Step1）では実データをまだ入力していない。workIdはsongs.js側から機械的に
// 洗い出した26件をすべて用意し、officialLinks・descriptionはnullのままにしてある。
// Step6で公式サイト・ストア・MV・配信サービスのリンクを確認しながら埋めていく。

export const WORK_TYPE = {
  SINGLE: "single",
  ALBUM: "album",
  DIGITAL: "digital",
  SPECIAL: "special",
};

// officialLinksの型：
//   official  : 公式サイト（作品ページ）
//   store     : 公式ストア
//   mv        : 公式MV / 公式YouTube
//   streaming : 配信サービス（公式が案内しているもの）
// いずれも未確認のうちはnullのままにし、推測で埋めない。
function buildEmptyDiscographyEntry(workId, type) {
  return {
    workId,
    type,
    officialLinks: { official: null, store: null, mv: null, streaming: null },
    description: null,
  };
}

export const DISCOGRAPHY = [
  ...Array.from({ length: 20 }, (_, i) =>
    buildEmptyDiscographyEntry(`single-${String(i + 1).padStart(2, "0")}`, WORK_TYPE.SINGLE)
  ),
  buildEmptyDiscographyEntry("album-01", WORK_TYPE.ALBUM),
  ...Array.from({ length: 4 }, (_, i) =>
    buildEmptyDiscographyEntry(`digital-${String(i + 1).padStart(2, "0")}`, WORK_TYPE.DIGITAL)
  ),
  buildEmptyDiscographyEntry("special-866", WORK_TYPE.SPECIAL),
];
