// 特別称号（実績）の定義を管理するファイル。
// songs.jsとは違い、称号ごとに「条件を満たしたかどうかを判定する処理（judge関数）」も
// あわせて持たせている。称号は曲データのような受け身の情報だけでなく、
// 判定という振る舞いも一緒に扱ったほうが1件あたりの内容が完結して読みやすいため、
// data/songs.jsとは別に、js直下にこのファイルを置いている。
//
// judge関数が受け取る「playResult」（1回のプレイ結果の要約）は、次の形を想定している。
// 実際にこの形を組み立てるのはtitleProgress.js側の役割で、このファイルはplayResultの
// 中身がどう作られるかを一切知らなくてよい（渡された値だけを見て判定する）。
//
//   {
//     mode: "5" | "10" | "20" | "50" | "all",
//       出題数の値。index.htmlのラジオボタンの値・highscore.jsのキーと同じ文字列をそのまま使う。
//
//     totalQuestions: number,
//       実際に出題された問題数。
//
//     correctCount: number,
//       正解した問題数（スキップ・答えを見る、は不正解として扱う）。
//
//     averageCorrectElapsedMs: number | null,
//       正解した問題だけを対象にした、平均回答時間（ミリ秒）。
//       1問も正解していない場合はnullになる（0で割ることを避けるため）。
//
//     hasSubSecondCorrectAnswer: boolean,
//       1000ミリ秒（1秒）未満で正解した問題が、1問でもあったかどうか。
//   }
//
// 「全問正解したか」はplayResultの正式な項目にはしていない（correctCountとtotalQuestionsから
// 常に計算しなおせる派生値なので、別の項目としても持たせると将来どちらかだけ更新し忘れて
// 食い違う事故につながりやすいため）。代わりに、下のisPerfectResult()という内部専用の
// 補助関数を使って、必要なjudge関数がその場で計算する。

// 全問正解したかどうかを判定する、このファイル専用の補助関数。
// パーフェクト・イントロマスター・電光石火・＝LOVE皆伝の4つが共通で使う。
// totalQuestionsが0の異常な状態のとき、0問中0問正解で「全問正解」と誤判定しないよう、
// totalQuestions > 0 も必ず確認する。
function isPerfectResult(playResult) {
  return playResult.totalQuestions > 0 && playResult.correctCount === playResult.totalQuestions;
}

// 称号定義1件が持つ項目の意味
// id            : 保存キーや称号どうしの参照に使う、一意な識別子
// name          : 結果画面・称号一覧に表示する名前
// axis          : 称号の分類（"accuracy"=正確性 / "speed"=速さ / "rare"=レア実績 / "bonus"=おまけ）。
//                 同じaxisの称号が複数同時に条件を満たしたときは、priorityが一番高いものだけを
//                 結果画面の演出対象にする（例: 電光石火とイントロマスターが同時成立→電光石火のみ演出）。
// priority      : 同じaxis内での格付け（数字が大きいほど上位）。
// storageScope  : 進捗の保存の仕方。"perMode"=出題数ごとに個別のドットを持つ／"single"=称号1つにつき1つのフラグ。
// unlockedBy    : 称号一覧で名前・条件を公開する条件。
//                 "always"=最初から公開／他の称号のid=そのidの称号を1回でも達成すると公開／
//                 "self"=自分自身を達成した瞬間に公開。
// lockedHint    : 称号一覧でロック中に表示する短いヒント文（unlockedByが"always"の称号ではnull）。
// conditionText : 称号一覧で、解放後に表示する獲得条件の説明文。
// judge         : playResultを受け取り、その称号の条件を満たしたかどうかをtrue/falseで返す関数。
export const TITLES = [
  {
    id: "perfect",
    name: "パーフェクト",
    axis: "accuracy",
    priority: 1,
    storageScope: "perMode",
    unlockedBy: "always",
    lockedHint: null,
    conditionText: "全問正解する",
    judge: (playResult) => isPerfectResult(playResult),
  },
  {
    id: "introMaster",
    name: "イントロマスター",
    axis: "speed",
    priority: 1,
    storageScope: "perMode",
    unlockedBy: "perfect",
    lockedHint: "全問正解の先に、新たな道がある…",
    conditionText: "全問正解し、平均回答時間2.0秒以内で答える",
    judge: (playResult) =>
      isPerfectResult(playResult) &&
      playResult.averageCorrectElapsedMs !== null &&
      playResult.averageCorrectElapsedMs <= 2000,
  },
  {
    id: "lightningFast",
    name: "電光石火",
    axis: "speed",
    priority: 2,
    storageScope: "perMode",
    unlockedBy: "introMaster",
    lockedHint: "さらなる速さの先に、称号が眠っている",
    conditionText: "全問正解し、平均回答時間1.5秒以内で答える",
    judge: (playResult) =>
      isPerfectResult(playResult) &&
      playResult.averageCorrectElapsedMs !== null &&
      playResult.averageCorrectElapsedMs <= 1500,
  },
  {
    id: "equalLoveKaiden",
    name: "＝LOVE皆伝",
    axis: "rare",
    priority: 1,
    storageScope: "single",
    unlockedBy: "self",
    lockedHint: "全曲モードには、特別な秘密がある…",
    conditionText: "「全曲」モードで全問正解する",
    judge: (playResult) =>
      isPerfectResult(playResult) && playResult.mode === "all",
  },
  {
    id: "inspiration",
    name: "ひらめき",
    axis: "bonus",
    priority: 1,
    storageScope: "single",
    unlockedBy: "always",
    lockedHint: null,
    conditionText: "1問でも1秒未満で正解する",
    judge: (playResult) => playResult.hasSubSecondCorrectAnswer,
  },
];
