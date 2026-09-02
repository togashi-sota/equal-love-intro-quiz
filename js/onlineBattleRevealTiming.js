// 歌詞クイズ・一瞬バトル・一瞬協力の「答え表示（reveal）の残り時間」を、サーバー時刻基準で
// 計算する共通の純粋関数（2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド）。
//
// 【なぜサーバー時刻基準にするか】この端末が答え表示を検知した時刻を起点にすると、
// タブがバックグラウンドに回っている間に答え表示が始まり、しばらくしてから
// フォアグラウンドへ復帰した場合、実際にはサーバー上の答え表示時間が既に経過している
// にもかかわらず、この端末だけ「今から丸ごとrevealDelayMs秒」再生・表示し始めてしまい、
// ホストが次の問題へ進んだ後まで演出が残ってしまう。resolvedAt（Firebaseのサーバー
// タイムスタンプ）とserverTimeOffset（この端末の時計とサーバー時計のズレ）から、
// 「本当の残り時間」を求める。
//
// 【3つの画面で共通化した理由】js/onlineLyricsQuizBattleScreen.js・
// js/onlineInstantBattleScreen.js・js/onlineInstantCoopBattleScreen.jsが、全く同じ式を
// それぞれ個別に書いていた（本人指示：4種類の別ロジックを作らない。共通処理は再利用する）。

// nowMsは呼び出し元がDate.now()を渡す想定（テストで固定時刻を渡せるように引数化している）。
export function computeRemainingRevealMs({ revealDelayMs, resolvedAt, serverTimeOffset, nowMs }) {
  if (typeof resolvedAt !== "number") return revealDelayMs;
  const nowServerTimeMs = nowMs + serverTimeOffset;
  return revealDelayMs - (nowServerTimeMs - resolvedAt);
}
