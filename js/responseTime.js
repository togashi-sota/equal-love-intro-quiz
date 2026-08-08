// 「平均回答時間」（問題が表示され回答可能になってから、回答を確定するまでのミリ秒）に
// 関する、モード共通の計算・表示整形をまとめたファイル。DOM・localStorageには一切触れない
// 純粋関数群（js/achievementEvaluation.jsと同じ方針）。
//
// 【なぜ共通化するか】通常イントロクイズ・タイムアタック・ランダム再生クイズが、
// それぞれ独自に平均を計算すると、「結果画面では1.69秒なのに称号判定では1.71秒」のような
// ズレが起きうる（本人指示で最も注意された点）。計算そのものはこのファイルの
// calculateAverageResponseMs()だけを経由させ、各モードは「正解した問題のうち、
// elapsedMsが記録されている値の配列」を組み立てて渡すだけにする。
//
// 結果画面を見ている時間・「次の問題へ」待機・演出・ロード・通信待ち・不正解後に正解を
// 見る時間は、そもそも各モードのelapsedMs計測に含まれていない前提（既存の計測方法は
// このファイルでは変更しない）。

// 回答時間（ミリ秒）の配列から、平均回答時間を計算する。
// 0件のときはnullを返す（0除算でNaNになるのを避け、呼び出し側が「記録なし」として
// 扱えるようにする）。
export function calculateAverageResponseMs(elapsedMsList) {
  if (!Array.isArray(elapsedMsList) || elapsedMsList.length === 0) return null;
  const sum = elapsedMsList.reduce((total, ms) => total + ms, 0);
  return sum / elapsedMsList.length;
}

// ミリ秒を「1.83秒」のような表示用文字列にする。小数点以下は常に2桁（四捨五入）。
// 1.666→1.67秒、1.700→1.70秒、0.954→0.95秒、のように末尾の0も省略しない。
// nullやundefinedのときはnullを返す（呼び出し側で項目ごと非表示にできるようにするため）。
export function formatResponseSeconds(ms) {
  if (ms === null || ms === undefined) return null;
  return `${(ms / 1000).toFixed(2)}秒`;
}

// 「称号まであと○秒」の差分（秒、正なら未達・0以下なら達成）を計算する。
// 表示用に丸めるのは呼び出し側ではなくこの関数の責務にし、㎳の生値との対応をここで一元化する。
export function formatSecondsUntilThreshold(averageResponseMs, thresholdMs) {
  if (averageResponseMs === null || averageResponseMs === undefined) return null;
  const diffMs = averageResponseMs - thresholdMs;
  return (diffMs / 1000).toFixed(2);
}
