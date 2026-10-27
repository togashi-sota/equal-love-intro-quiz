// 歌詞クイズで「機械的には他の曲と重複していないが、出題すると答えが1曲に決まらない・
// 紛らわしい」と本人が判断した行を、手作業で除外するための一覧。
// js/lyricsQuestionUniqueness.jsが読み込み、全モード（1人用・オンライン対戦・パーティー）の
// 歌詞クイズのヒント候補から外す。
//
// 【重要・著作権】ここには歌詞本文を絶対に書かない。曲IDと行番号（歌詞データの line の値）だけを書く。
// 理由はコメントで短く（歌詞を引用せずに）書く。
// 候補の洗い出しは tools/feature-research/2026-10-28/lyrics-uniqueness/ の分析スクリプトが出力する
// 「要確認候補」一覧を参考にする。
//
// 【変更したら】js/lyricsQuestionUniqueness.jsのLYRICS_UNIQUENESS_RULES_VERSIONを1つ上げる
// （オンライン対戦で、新旧の一覧を持つ端末が同じ部屋に入ったときに問題がずれるのを防ぐため）。
//
// 形式: { "曲ID": [行番号, 行番号, ...] }
export const LYRICS_UNIQUENESS_MANUAL_EXCLUSIONS = Object.freeze({});
