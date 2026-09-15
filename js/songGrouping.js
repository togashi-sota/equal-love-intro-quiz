// 曲の区分け（シングルごとのグループ）とカテゴリバッジの定義。DOMに一切触れない純粋な関数・定数だけを置く。
//
// 【2026-09-15移設・本人指示：パーティー対戦の曲選択をオンライン対戦と同じ操作感へ】もともと js/songlist.js にあった
// CATEGORY_PILL_INFO／resolveSongGroup／buildSongGroups をそのまま移した（中身は無変更）。songlist.js は
// モジュール読み込み時に #preview-audio 等の DOM 要素へ直接触れるため tests.html から import できず、
// 共通部品 js/songGroupSelectList.js（パーティー対戦の曲選択）とそのテストが DOM に依存しない置き場所を必要とした。
// songlist.js は互換のためここから再export しているので、既存の呼び出し元は変更不要。
import { CATEGORY } from "./data/songs.js";

// カテゴリごとの、バッジに表示する文字と色分け用のクラス名。
// オリジナル問題作成モードの選曲画面（customQuizScreen.js）でも同じカテゴリバッジを
// 表示するため、外部公開している。
export const CATEGORY_PILL_INFO = {
  [CATEGORY.TITLE_TRACK]: { text: "表題曲", className: "title-track" },
  [CATEGORY.GROUP_SONG]: { text: "全員曲", className: "group-song" },
  [CATEGORY.UNIT_SONG]: { text: "ユニット曲", className: "unit-song" },
  [CATEGORY.SPECIAL]: { text: CATEGORY.SPECIAL, className: "special" },
};

// 曲データの`single`表記（表示用の補足情報）から、収録曲一覧のアコーディオン区分を判定する。
// 通常のシングル（1st〜20th）は番号ごとに区分し、アルバム・配信限定・特別収録は
// それぞれ1つの区分にまとめる（Overtureは1stアルバムにも収録されているが、
// category が SPECIAL なので「特別収録曲」側に分類する）。
// orderは区分の並び順（新しいシングルが上）に使う。1stアルバムは実際の発売日（2021-05-12）が
// 8th（2020-11-25）と9th（2021-08-25）の間にあるため、8.5という中間の値を割り当てて
// その位置に来るようにしている。配信限定シングル・特別収録曲は、複数の配信日にまたがるため
// 1か所にはうまく収まらず、あえて一覧の後半にまとめて置く方針（本人と合意済み）。
function resolveSongGroup(song) {
  if (song.category === CATEGORY.SPECIAL || song.id === "866") {
    return { key: "special", order: -3, label: "特別収録曲（866／Overture）" };
  }
  if (song.single.startsWith("配信限定シングル")) {
    return { key: "digital", order: -2, label: "配信限定シングル" };
  }
  if (song.single.startsWith("1stアルバム")) {
    return { key: "album", order: 8.5, label: "1stアルバム「全部、内緒。」" };
  }

  // 通常のシングルは「Nthシングル「曲名」...」という表記なので、先頭の番号部分を取り出す
  const numberMatch = song.single.match(/^(\d+)(st|nd|rd|th)/);
  const number = Number(numberMatch[1]);
  return { key: `single-${number}`, order: number, label: `${numberMatch[1]}${numberMatch[2]}` };
}

// 曲データを、アコーディオン区分ごとにまとめる。新しいシングルが先頭にくるよう並び替える。
// オリジナル問題作成モードの選曲画面（customQuizScreen.js）でも、同じ区分ルールを
// 重複させないよう、この関数をそのまま再利用する。
export function buildSongGroups(songs) {
  const groupsByKey = new Map();

  songs.forEach((song) => {
    const group = resolveSongGroup(song);
    if (!groupsByKey.has(group.key)) {
      groupsByKey.set(group.key, { ...group, songs: [] });
    }
    groupsByKey.get(group.key).songs.push(song);
  });

  // 通常のシングル区分だけ、見出しを「Nth + 表題曲名」に組み立て直す。
  // 表題曲が2曲あるダブルA面シングル（18th等）は、最初の表題曲だけを見出しに使う
  // （複数曲名を並べるとスマホ幅で長くなりすぎるため、本人と合意した仕様）。
  // 配信限定シングル・特別収録曲は、区分内を発売日（配信日）順に並べ替える。
  groupsByKey.forEach((group) => {
    if (group.key.startsWith("single-")) {
      const titleTrack = group.songs.find((song) => song.category === CATEGORY.TITLE_TRACK);
      if (titleTrack) {
        group.label = `${group.label} ${titleTrack.title}`;
      }
    }
    if (group.key === "digital" || group.key === "special") {
      group.songs.sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
    }
    // カップリング等がまだ出揃っていないシングルだけ、見出しにComing Soon案内を添える
    // （song.comingSoonNote参照。表示専用で出題・採点には無関係、2026-08-17追加）。
    group.comingSoonNote = group.songs.find((song) => song.comingSoonNote)?.comingSoonNote ?? null;
  });

  return [...groupsByKey.values()].sort((a, b) => b.order - a.order);
}
