// 作品（シングル/アルバム/配信限定/特別枠）ごとの追加情報だけを持つデータファイル。
// 作品名・発売日・収録曲・センターは songs.js の workId で紐づく曲データから取得するため、
// ここには持たせない（5-1章の「songs.js中心の一元管理」を踏襲し、二重管理を避けるため）。
//
// 掲載方針・情報源のルール（公式リンク優先、ジャケット画像は掲載しない等）は
// docs/HANDOFF.md の2-2章を参照。
//
// 【重要】現時点（Step1）では実データをまだ入力していない。workIdはsongs.js側から機械的に
// 洗い出した26件（2026-10-31に single-21 を足して27件。2026-11-01 から songs.js の workId で自動）をすべて用意し、officialLinks・descriptionはnullのままにしてある。
// Step6で公式サイト・ストア・MV・配信サービスのリンクを確認しながら埋めていく。

import { SONGS } from "./songs.js";

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

// 【2026-11-01 nx-nav・本人の追加依頼 2-1】アルバムの収録順（公式の DISCOGRAPHY の曲順）。
// 作品詳細の「収録曲」をこの順に並べ、番号を添える（以前は songs.js の並び順のままで、1曲目の Overture が最後に出ていた）。
// アプリでは、シングルの曲はそれぞれのシングルの作品に入れているので、ここに載るのはアルバムの作品（workId）の曲だけ
// （番号が飛ぶ所には、シングルの曲が入っている）。番号は CD 16曲の Type-A・Type-B のもの。
//   出典（2026-11-01 確認）：＝LOVE 公式サイト DISCOGRAPHY
//     https://equal-love.jp/discography/detail/31/ （Type-A VVCL-1856〜1857：10曲目「現役アイドルちゅ～」）
//     https://equal-love.jp/discography/detail/32/ （Type-B VVCL-1858〜1859：10曲目「拝啓 貴方様」）
//     https://equal-love.jp/discography/detail/33/ （Type-C VVCL-1860：15曲。10曲目の曲が無く、11曲目以降が1つずつ前へ）
//   edition：その版だけに入っている曲（曲名の下に添える）。曲そのものの短い説明は songs.js の shortNote
export const ALBUM_TRACK_LISTS = {
  "album-01": {
    trackCount: 16,
    numberingNote: "曲順の番号は CD（Type-A・Type-B）のもの。番号の飛んでいる所はシングルの曲です",
    tracks: [
      { no: 1, songId: "overture" },
      { no: 2, songId: "sakura-no-saku-oto-ga-shita" },
      { no: 4, songId: "oh-darling" },
      { no: 6, songId: "senobi-in-love" },
      { no: 10, songId: "genneki-idol-chu", edition: "Type-A のみ" },
      { no: 10, songId: "haikei-anata-sama", edition: "Type-B のみ" },
      { no: 11, songId: "24-7" },
      { no: 12, songId: "oneesan-ja-dame-desuka" },
      { no: 14, songId: "cinema" },
    ],
  },
};

// 作品の曲（songs）を収録順に並べる。収録順のデータが無い作品・載っていない曲は、今までどおり songs.js の並び順のまま
// （載っていない曲は後ろへ）。並べ替えた新しい配列を返す（元の配列は変えない）
export function sortSongsByTrackList(songs, trackList) {
  if (!trackList?.tracks?.length) return songs.slice();
  const position = new Map(trackList.tracks.map((track, index) => [track.songId, index]));
  return songs
    .map((song, index) => ({ song, index }))
    .sort((a, b) => (position.get(a.song.id) ?? Infinity) - (position.get(b.song.id) ?? Infinity) || a.index - b.index)
    .map(({ song }) => song);
}

// 収録順のデータの中の、その曲の行（番号・版・説明）。無ければ null
export function findTrackEntry(trackList, songId) {
  return trackList?.tracks?.find((track) => track.songId === songId) ?? null;
}

// 【2026-11-01 r7-home】作品の枠は songs.js の workId から自動で作る（以前は「シングル21作」の数を
// ここに手で書いていたため、21st の曲を songs.js に足しても作品一覧・ホームの「シングル○枚」に出なかった）。
// 22nd を出すときは、songs.js に workId: "single-22" の曲を足すだけで、作品一覧・作品詳細・年表・全体検索・
// 周年ヒストリーの作品リンク・ホームの「シングル○枚」が自動で増える（tests/discographyAuto.test.js で確かめる）。
// 並び順：シングル（番号順）→ アルバム → 配信限定 → 特別枠（それぞれ番号順）。画面の発売日順は各画面で並べ替える。
const TYPE_ORDER = [WORK_TYPE.SINGLE, WORK_TYPE.ALBUM, WORK_TYPE.DIGITAL, WORK_TYPE.SPECIAL];

// workId の頭（"single-21" の "single"）から作品の種類を決める。知らない頭は null（枠を作らない）
export function resolveWorkType(workId) {
  const head = String(workId ?? "").split("-")[0];
  return TYPE_ORDER.includes(head) ? head : null;
}

// songs（SONGS 配列）に出てくる workId から、作品の枠（DISCOGRAPHY）を作る。重複は1つにまとめる
export function buildDiscographyEntries(songs) {
  const workIds = [...new Set(songs.map((song) => song.workId).filter((workId) => resolveWorkType(workId)))];
  const numberOf = (workId) => Number(String(workId).split("-")[1]) || 0;
  workIds.sort((a, b) => TYPE_ORDER.indexOf(resolveWorkType(a)) - TYPE_ORDER.indexOf(resolveWorkType(b)) || numberOf(a) - numberOf(b) || a.localeCompare(b));
  return workIds.map((workId) => {
    let entry = buildEmptyDiscographyEntry(workId, resolveWorkType(workId));
    if (CENTER_NOTES[workId]) entry = { ...entry, centerNote: CENTER_NOTES[workId] };
    if (ALBUM_TRACK_LISTS[workId]) entry = { ...entry, trackList: ALBUM_TRACK_LISTS[workId] };
    return entry;
  });
}

export const DISCOGRAPHY = buildDiscographyEntries(SONGS);
