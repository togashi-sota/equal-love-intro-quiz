// 歌詞クイズ オンライン対戦（Phase6）：画面表示用の「経過時間→ヒント段階」変換だけを行う、
// 独立した純粋関数のファイル。
//
// 【なぜ採点ロジック（js/battleRules/）と分けるか】採点（何点入るか）は、各自が回答を
// 送信した"瞬間"に自己申告したhintLevel（answers/{questionIndex}/{uid}.hintLevel）を
// js/battleRules/各ルールのresolveQuestionAnswers()がそのまま使う（詳しくは
// js/lyricsQuizBattleSecurityRules.jsのisHintLevelConsistentWithElapsedTime参照）。
// この関数はそれとは別に、「画面に今どのヒントまで見せるか」を経過時間から機械的に
// 計算するためだけのもので、採点には一切関与しない。
// battleRules/を直接importするのはjs/battleModes/lyricsQuizBattleMode.jsだけ、という
// 既存の設計方針を守るため、maxHintLevel・hintIntervalSecは呼び出し元
// （js/onlineLyricsQuizBattleScreen.js）がlyricsQuizBattleMode経由で受け取って渡す。

// 経過時間（ミリ秒）から、今表示すべきヒント段階（1〜maxHintLevel）を求める。
// 0〜interval秒未満はヒント1、interval〜2*interval秒未満はヒント2、…という区切り。
export function deriveHintLevelFromElapsedMs({ elapsedMs, hintIntervalSec, maxHintLevel }) {
  if (!(elapsedMs > 0)) return 1;
  const intervalMs = hintIntervalSec * 1000;
  const level = Math.floor(elapsedMs / intervalMs) + 1;
  return Math.min(Math.max(level, 1), maxHintLevel);
}

// 「サーバー時刻ベースの現在時刻」と「問題が始まったサーバー時刻」の差から経過時間を求める。
// questionStartedAtがまだFirebaseから読めていない場合（初回描画の一瞬等）は0を返す。
export function computeElapsedMs({ questionStartedAt, nowServerTimeMs }) {
  if (typeof questionStartedAt !== "number") return 0;
  return Math.max(0, nowServerTimeMs - questionStartedAt);
}
