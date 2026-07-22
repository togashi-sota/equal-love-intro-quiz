// 曲データを管理するファイル。
// ここにはゲームのロジックを書かず、「曲のデータそのもの」だけを置く。
// 曲を追加・変更したいときは、このファイルだけを編集すればよい。

// 曲のカテゴリ（表題曲/カップリング曲/アルバム曲）を表す定数。
// 文字列を直接あちこちに書くと、タイプミスに気づきにくいのでここでまとめて定義する。
export const CATEGORY = {
  TITLE_TRACK: "表題曲",
  COUPLING: "カップリング曲",
  ALBUM_TRACK: "アルバム曲",
};

// 曲の難易度を表す定数。
// 今のところ出題ロジックはまだ難易度を見ていないが、
// 将来「難易度別モード」を作るときのために、データだけ先に持たせておく。
export const DIFFICULTY = {
  EASY: "かんたん",
  NORMAL: "ふつう",
  HARD: "むずかしい",
};

// 曲データ本体。90曲規模まで増やすことを想定した項目構成。
// id         : 曲を一意に識別するための文字列（音源ファイル名 `${id}.mp3` にもそのまま使う）
// title      : クイズの選択肢や正解表示に使う曲名
// category   : CATEGORY で定義した値のどれか
// releaseDate: 発売日（"YYYY-MM-DD"形式。日付順の並び替えがしやすいようにハイフン区切りに統一する）
// single     : 収録シングル/アルバム名（表示用の補足情報）
// difficulty : DIFFICULTY で定義した値のどれか
//
// まずは動作確認用として、1st〜5thシングルの表題曲5曲だけを登録している。
// 曲を増やすときは、この配列に要素を追加していくだけでよい。
export const SONGS = [
  {
    id: "love",
    title: "＝LOVE",
    category: CATEGORY.TITLE_TRACK,
    releaseDate: "2017-09-06",
    single: "1stシングル「＝LOVE」",
    difficulty: DIFFICULTY.EASY,
  },
  {
    id: "bokura-no-seifuku-christmas",
    title: "僕らの制服クリスマス",
    category: CATEGORY.TITLE_TRACK,
    releaseDate: "2017-12-06",
    single: "2ndシングル「僕らの制服クリスマス」",
    difficulty: DIFFICULTY.EASY,
  },
  {
    id: "teokure-caution",
    title: "手遅れcaution",
    category: CATEGORY.TITLE_TRACK,
    releaseDate: "2018-05-16",
    single: "3rdシングル「手遅れcaution」",
    difficulty: DIFFICULTY.NORMAL,
  },
  {
    id: "want-you-want-you",
    title: "Want you! Want you!",
    category: CATEGORY.TITLE_TRACK,
    releaseDate: "2018-10-17",
    single: "4thシングル「Want you! Want you!」",
    difficulty: DIFFICULTY.NORMAL,
  },
  {
    id: "sagase-diamond-lily",
    title: "探せ ダイヤモンドリリー",
    category: CATEGORY.TITLE_TRACK,
    releaseDate: "2019-04-24",
    single: "5thシングル「探せ ダイヤモンドリリー」",
    difficulty: DIFFICULTY.NORMAL,
  },
];
