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
// id            : 曲を一意に識別するための文字列（音源ファイル名 `${id}.mp3` にもそのまま使う）
// title         : クイズの選択肢や正解表示に使う曲名
// category      : CATEGORY で定義した値のどれか
// releaseDate   : 発売日（"YYYY-MM-DD"形式。日付順の並び替えがしやすいようにハイフン区切りに統一する）
// single        : 収録シングル/アルバム名（表示用の補足情報）
// difficulty    : DIFFICULTY で定義した値のどれか
// introLeadInSec: 曲の頭にある無音・前奏の長さ（秒）。CDからそのまま取り込んだ音源は
//                 曲によって鳴り始めるまでの時間がバラバラなので、採点時にこの秒数を差し引いて
//                 曲ごとの不公平をなくす。無音がほぼない曲は0のままでよい。
//
// まずは動作確認用として、CDの差し替えを最小限にするために
// 「1stシングルに収録されている3曲」+「6thシングルの表題曲」の4曲を登録している。
// 曲を増やすときは、この配列に要素を追加していくだけでよい。
export const SONGS = [
  {
    id: "love",
    title: "＝LOVE",
    category: CATEGORY.TITLE_TRACK,
    releaseDate: "2017-09-06",
    single: "1stシングル「＝LOVE」",
    difficulty: DIFFICULTY.EASY,
    introLeadInSec: 0,
  },
  {
    id: "kioku-no-dokoka-de",
    title: "記憶のどこかで",
    category: CATEGORY.COUPLING,
    releaseDate: "2017-09-06",
    single: "1stシングル「＝LOVE」カップリング曲",
    difficulty: DIFFICULTY.NORMAL,
    introLeadInSec: 0,
  },
  {
    id: "start",
    title: "スタート!",
    category: CATEGORY.COUPLING,
    releaseDate: "2017-09-06",
    single: "1stシングル「＝LOVE」カップリング曲",
    difficulty: DIFFICULTY.NORMAL,
    introLeadInSec: 0,
  },
  {
    id: "zurui-yo-zurui-ne",
    title: "ズルいよ ズルいね",
    category: CATEGORY.TITLE_TRACK,
    releaseDate: "2019-10-30",
    single: "6thシングル「ズルいよ ズルいね」",
    difficulty: DIFFICULTY.NORMAL,
    introLeadInSec: 0,
  },
];
