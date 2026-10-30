// 作品（シングル/アルバム/配信限定/特別枠）ごとの追加情報だけを持つデータファイル。
// 作品名・発売日・収録曲・センターは songs.js の workId で紐づく曲データから取得するため、
// ここには持たせない（5-1章の「songs.js中心の一元管理」を踏襲し、二重管理を避けるため）。
//
// 掲載方針・情報源のルール（公式リンク優先、ジャケット画像は掲載しない等）は
// docs/HANDOFF.md の2-2章を参照。
//
// 【重要】現時点（Step1）では実データをまだ入力していない。workIdはsongs.js側から機械的に
// 洗い出した26件（2026-10-31に single-21 を足して27件）をすべて用意し、officialLinks・descriptionはnullのままにしてある。
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

// 【2026-10-31追加】21st「恋、はじめました。」の枠（以前は songs.js に曲があるのに、ここに枠が無く、
// 作品一覧・作品詳細・年表・全体検索に21st が出ていなかった）。発売日・センターは songs.js の値のまま。
// centerNote：センターの表示に添える注記（作品詳細・CD売上・チャート記録のページで小さく出す）。
//   21st の「全員」は本人のアプリ内ルール（songs.js・js/data/centerSources.js の appRule: "all"）。公式のセンター発表は
//   2026-10-31 の調査（tools/feature-research/2026-10-31/cd-sales/）でも見つかっていない。
const CENTER_NOTES = {
  "single-21": "「全員」はアプリ内の決まり（固定のセンターがいないと判断）。公式のセンター発表は未確認",
};

export const DISCOGRAPHY = [
  ...Array.from({ length: 21 }, (_, i) => {
    const entry = buildEmptyDiscographyEntry(`single-${String(i + 1).padStart(2, "0")}`, WORK_TYPE.SINGLE);
    return CENTER_NOTES[entry.workId] ? { ...entry, centerNote: CENTER_NOTES[entry.workId] } : entry;
  }),
  buildEmptyDiscographyEntry("album-01", WORK_TYPE.ALBUM),
  ...Array.from({ length: 4 }, (_, i) =>
    buildEmptyDiscographyEntry(`digital-${String(i + 1).padStart(2, "0")}`, WORK_TYPE.DIGITAL)
  ),
  buildEmptyDiscographyEntry("special-866", WORK_TYPE.SPECIAL),
];
