// 「対戦を開始する」を押した瞬間に、どの設定を使うかを決めるだけの純粋関数。
//
// 【切り出した理由・2026-08-06】以前はjs/onlineBattleScreen.jsの中に直接書いていたが、
// 「歌詞クイズなのに既存のタイムアタック用フォームを読もうとして、存在しない要素の参照で
// 例外になり、しかも画面には何も表示されないまま無反応になる」という不具合があった
// （本人からの実機報告で発覚）。原因は、gameModeごとに設定の取得方法が全く違うのに、
// その分岐がクリックハンドラの中に埋もれていたこと。
// 同じ不具合が将来（新しいgameModeを追加したときなど）に戻らないよう、判定ロジックだけを
// DOM・Firebaseに一切触れない純粋関数として独立させ、恒久テストの対象にした
// （tests/onlineBattleStartSettings.test.js参照）。
// js/onlineBattleScreen.jsはFirebase SDKを初期化するjs/onlineBattle.js／js/firebaseClient.js
// を経由して読み込まれるため、テストから直接importすると本番Firebaseへの接続が走ってしまう
// （このプロジェクトのテストは実際のFirebase呼び出しを一切行わない方針）。そのため、この
// ロジックだけを依存の無い別ファイルへ分け、onlineBattleScreen.js側はここから再importする。

export const LYRICS_QUIZ_GAME_MODE = "lyricsQuiz";

// オンライン対戦で選べる、readFormSettings（既存のタイムアタック用フォーム）を使うgameMode。
// randomPlaybackはjs/battleModes/randomPlaybackBattleMode.jsがtimeAttackBattleMode.jsの
// defaultSettingsをそのまま再利用しており、設定の形がtimeAttackと同じため同じ分岐に含める。
const FORM_BASED_GAME_MODES = ["timeAttack", "randomPlayback"];

// gameMode: 今のルームのgameMode
// readFormSettings: 既存のタイムアタック用フォームから設定を読み取る関数（DOM依存、呼び出し側が渡す）
// lyricsQuizRoomSettings: 歌詞クイズの場合に使う、今のroom.settings（各設定項目を触るたびに
//   即座にFirebaseへ書き込まれている値。フォームを読み直す必要が無い）
export function resolveStartSettingsForSubmit({ gameMode, readFormSettings, lyricsQuizRoomSettings }) {
  if (gameMode === LYRICS_QUIZ_GAME_MODE) {
    if (!lyricsQuizRoomSettings) {
      throw new Error("対戦設定をまだ読み込めていません。少し待ってからもう一度お試しください。");
    }
    return lyricsQuizRoomSettings;
  }
  if (FORM_BASED_GAME_MODES.includes(gameMode)) {
    return readFormSettings();
  }
  throw new Error(`未対応の対戦モードです（gameMode: ${gameMode}）`);
}

// 「前回のルームに戻る」を押したあと、joinRoom()の結果を見て何をすべきかを決めるだけの純粋関数。
//
// 【切り出した理由・2026-08-11】退出直後の画面で「前回のルームに戻る」ボタンを押しても
// 無反応になる不具合があった（本人からの指摘）。ルームが本当に存在しない場合（reason:
// "not-found"）は、無効な「前回のルーム」記憶を残したままにせず消す（forgetLastRoom:true）。
// 一方、書き込み失敗など一時的な通信の癖の可能性がある他の失敗では記憶を残し、
// もう一度押せば再試行できるようにする（forgetLastRoom:false）。
// 上のresolveStartSettingsForSubmitと同じ理由で、DOM・Firebaseに一切触れない
// 純粋関数として切り出し、恒久テストの対象にした。
export function resolveLastRoomRejoinOutcome(joinResult) {
  if (joinResult.ok) {
    return { action: "enter-lobby", roomId: joinResult.roomId };
  }
  return { action: "show-error", forgetLastRoom: joinResult.reason === "not-found", reason: joinResult.reason };
}
