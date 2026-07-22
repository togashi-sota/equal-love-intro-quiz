// 曲データを管理するファイル。
// ここにはゲームのロジックを書かず、「曲のデータそのもの」だけを置く。
// 曲を追加・変更したいときは、このファイルだけを編集すればよい。

// 曲のカテゴリを表す定数。
// 文字列を直接あちこちに書くと、タイプミスに気づきにくいのでここでまとめて定義する。
export const CATEGORY = {
  TITLE_TRACK: "表題曲",
  COUPLING: "カップリング曲",
};

// 曲データ本体。
// id      : 曲を一意に識別するための文字列（音源ファイル名にも使う）
// title   : クイズの選択肢や正解表示に使う曲名
// category: CATEGORY で定義した値のどれか
//
// 著作権が切れた誰もが知っているメロディを、電子音として自作したものを収録している。
// 実在する楽曲データに差し替える際は、この配列に要素を追加していくだけでよい。
// 今は5曲すべて同じカテゴリ（表題曲）に揃えている。
// カテゴリで絞り込んだときに曲が4未満になる挙動は、後の実装ステップで別途テストする。
export const SONGS = [
  { id: "twinkle-star", title: "きらきら星", category: CATEGORY.TITLE_TRACK },
  { id: "fur-elise", title: "エリーゼのために", category: CATEGORY.TITLE_TRACK },
  { id: "ode-to-joy", title: "歓喜の歌", category: CATEGORY.TITLE_TRACK },
  { id: "frere-jacques", title: "フレール・ジャック", category: CATEGORY.TITLE_TRACK },
  { id: "london-bridge", title: "ロンドン橋", category: CATEGORY.TITLE_TRACK },
];
