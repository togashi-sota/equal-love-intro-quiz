// 結果画面（オンライン対戦4モード共通）で、自分自身が「ルーム設定に戻る」または
// 「もう一度」への対応（対戦の準備をする）を既に押したかどうかを表す、モジュール間で
// 共有する軽量な状態（2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド23-29章）。
//
// 【本人指示の要点】結果画面は各プレイヤーが自分のペースで見てよく、他の参加者の操作
// （ホストの「もう一度」「ルーム設定に戻る」等）で、まだ結果を見ている自分の画面を
// 強制的に切り替えてはいけない。「自分がまだ一度もこの結果画面に対して行動していない」
// という状態を、4つの結果画面すべてが共通の基準として参照できるようにする。
//
// 【なぜ独立ファイルにしたか】js/onlineBattleScreen.js（共有エンジン結果画面）・
// js/onlineLyricsQuizBattleScreen.js・js/onlineInstantBattleScreen.js・
// js/onlineInstantCoopBattleScreen.jsの4つの結果画面すべてが、この状態を読み書きする
// 必要がある。js/onlineLyricsQuizBattleScreen.jsはjs/onlineBattleScreen.jsを一切importしない
// という設計方針（同ファイル冒頭コメント参照）のため、状態そのものをどちらにも属さない
// 中立なファイルへ切り出した（js/onlineParticipantIcon.jsと同じ考え方）。

let hasResponded = false;

// 「ルーム設定に戻る」「もう一度への対応（対戦の準備をする）」ボタンが押された瞬間に呼ぶ。
export function markResultScreenResponded() {
  hasResponded = true;
}

// 新しい結果画面に入るたびに呼び、まだ何も押していない状態から始める。
export function resetResultScreenResponded() {
  hasResponded = false;
}

export function hasRespondedToCurrentResultScreen() {
  return hasResponded;
}

// 結果画面の画面名（elements.navigateTo()に渡す文字列と一致させる）。
// document.body.dataset.screenがこのいずれかの間は「結果画面を見ている最中」とみなし、
// 他の参加者の操作で強制的に画面を切り替えない。
//
// 【重要：ここに含めてよいのは、その結果画面自身が「ルーム設定に戻る」を全参加者
// （ホスト・ゲスト双方）に提供し、resultReturnedを書き込める場合だけ】含めた状態で
// 該当モードの結果画面にゲスト用の個別「ルーム設定に戻る」ボタンが無いと、ゲストは
// 結果画面から抜け出す手段が無いまま待たされ続ける（詰み）。現時点でこの条件を満たすのは
// 共有エンジン（タイムアタック／ランダム再生／アウトロ）の結果画面
// （js/onlineBattleScreen.jsのgoToResultScreen()）だけ。歌詞クイズ・一瞬バトル・一瞬協力の
// 結果画面にも同じ個別操作パネルを実装したら、ここに画面名を追加すること。
export const RESULT_SCREEN_NAMES = new Set(["onlineBattleResult"]);
