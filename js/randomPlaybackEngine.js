// ランダム再生クイズ（曲中のランダムな位置から再生し、曲名を当てるモード）専用の、
// UI・<audio>要素から完全に独立した純粋関数だけを集めたファイル。
//
// 【設計方針】
// - ここに置く関数は、同じ入力なら必ず同じ出力を返す「純粋関数」だけにする。
//   DOM操作・IndexedDBアクセス・Math.random()の直接呼び出しは一切行わない。
// - 実際の音源再生・自動停止処理は js/audio.js の playSongFromRandomPosition() が担当する
//   （エンジン部分〈このファイル〉とルール・計算部分の責務を分離する設計。詳細はHANDOFF.md
//   10-59章・10-61章参照）。
// - オンライン対戦では、全端末が同じ seed・songId・questionIndex から同じ開始位置を
//   計算できる必要があるため、Math.random()ではなく js/seededRandom.js の
//   決定論的な乱数生成器（mulberry32）を使う。
//
// 【MVPの方針（本人合意済み）】最初は「曲全体ランダム」1ルールのみ。既存のタイムアタック
// エンジン（ノーマル/ハード/LOVE連チャン・時間計測・結果生成）をそのままアダプター方式で
// 再利用し、差し替えるのは「音源の再生開始位置・再生時間」だけにする。

import { createSeededRandom } from "./seededRandom.js";

// MVPで使う既定値。
// playDurationSec   : 何秒間再生してから自動停止するか。既存の通常クイズがイントロ数秒で
//                      当てさせる感覚に近い値として5秒を採用（設計書の追記④と同じ判断）。
// leadInExcludeSec  : 曲の先頭から何秒を再生対象から除外するか。MVPでは0秒（曲の頭から
//                      対象にしてよい。本人の依頼どおり「曲全体ランダム」に相当）。
// endMarginSec      : 曲の末尾から何秒を再生対象から除外するか。フェードアウト等で
//                      無音に近い区間だけが再生されてしまう事故を避けるための余白。
export const RANDOM_PLAYBACK_DEFAULTS = {
  playDurationSec: 5,
  leadInExcludeSec: 0,
  endMarginSec: 3,
};

// 文字列を32bit整数のハッシュ値に変換する（FNV-1a、暗号強度は不要。同じ文字列なら
// 必ず同じ値を返すことだけが目的）。
function hashStringToUint32(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// seed・songId・questionIndexから、「この問題専用の0以上1未満の乱数」を1つ作る純粋関数。
// 同じ3つの入力なら必ず同じ値を返す（全端末で再現可能）。questionIndexが異なれば
// 別の値になるため、同じ曲が同じ試合内で複数回出題されても毎回別の位置から再生できる。
// songIdも入力に混ぜているため、万が一questionIndexだけが一致する別の状況が
// あっても、曲が違えば値も変わる（本人の要望どおり、seed・songId・questionIndexの
// 3つすべてを入力に使う設計）。
export function computeQuestionRandomValue(seed, songId, questionIndex) {
  const combinedSeed =
    ((seed >>> 0) ^ hashStringToUint32(songId) ^ Math.imul(questionIndex + 1, 2654435761)) >>> 0;
  const random = createSeededRandom(combinedSeed);
  return random();
}

// 曲の長さ（durationSec）と各種秒数設定から、実際に再生を始める位置（startTimeSec）を
// 1つ計算する純粋関数。境界値でも例外を投げず、常に「0以上durationSec以下」の
// 安全な値を返す。
//
// 【境界値への対応】
// - durationSecが不正な値（NaN・0以下・非有限数、音源の長さが取得できない異常系）：
//   常に0を返す（先頭から再生する、という最も安全なフォールバック。「適当な位置を
//   推測して再生しない」という本人の要望どおり）。
// - 除外範囲を引いた結果、再生できる範囲が無い（曲が極端に短い・playDurationSecが
//   曲の長さに対して長すぎる・leadInExcludeSec+endMarginSecだけで曲の長さを
//   超えてしまう等）：範囲の下限に揃える（実質的に「曲の先頭付近から再生する」
//   という安全な扱いになる。この場合、再生開始後にplayDurationSec秒経つ前に
//   曲が自然終了する可能性があるが、audio.js側のonAutoStopが呼ばれないだけで
//   エラーにはならない）。
export function computeRandomStartTimeSec({
  seed,
  songId,
  questionIndex,
  durationSec,
  playDurationSec = RANDOM_PLAYBACK_DEFAULTS.playDurationSec,
  leadInExcludeSec = RANDOM_PLAYBACK_DEFAULTS.leadInExcludeSec,
  endMarginSec = RANDOM_PLAYBACK_DEFAULTS.endMarginSec,
}) {
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    return 0;
  }

  const lowerBoundSec = Math.min(Math.max(leadInExcludeSec, 0), durationSec);
  const upperBoundSec = Math.max(lowerBoundSec, durationSec - endMarginSec - playDurationSec);

  if (upperBoundSec <= lowerBoundSec) {
    return lowerBoundSec;
  }

  const randomValue = computeQuestionRandomValue(seed, songId, questionIndex);
  return lowerBoundSec + randomValue * (upperBoundSec - lowerBoundSec);
}
