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

// MVPで使う既定値（2026-08-08、本人レビューを受けて調整）。
// playDurationSec   : 何秒間再生してから自動停止するか。既存の通常クイズがイントロ数秒で
//                      当てさせる感覚に近い値として5秒を採用（設計書の追記④と同じ判断）。
// leadInExcludeSec  : 曲の先頭から何秒を再生対象から除外するか。当初0秒（曲全体ランダム）
//                      だったが、「問題によってはほぼイントロから流れてしまい、ランダム再生
//                      クイズとしての意味が薄れる」という本人指摘を受け10秒へ変更。
// endMarginSec      : 曲の末尾から何秒を再生対象から除外するか。フェードアウト等で
//                      無音に近い区間だけが再生されてしまう事故を避けるための余白。
//                      当初3秒だったが、leadInExcludeSecの変更に合わせて5秒へ調整。
//
// 【将来の拡張について】playDurationSecを3秒／5秒／10秒から選べるようにする要望が
// 出た場合も、この定数オブジェクトの値を差し替えるか、呼び出し側（computeRandomStartTimeSec・
// js/main.js）が独自の値を上書きで渡すだけで対応できる構造を維持している
// （関数のデフォルト引数として定義されているため、呼び出し側からいつでも上書き可能）。
export const RANDOM_PLAYBACK_DEFAULTS = {
  playDurationSec: 5,
  leadInExcludeSec: 10,
  endMarginSec: 5,
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
// 1つ計算する純粋関数。境界値でも例外を投げず、常に「0以上durationSec未満」の
// 安全な値を返す。
//
// 【2026-08-08再設計：3段階のフォールバック（本人レビューを受けて修正）】
// 当初は「除外範囲を引いた結果、再生できる範囲が無ければ範囲の下限に揃える」という
// 1段階のフォールバックだったが、これだと例えば「durationSec:3秒・playDurationSec:5秒」の
// ケースでstartTimeSecが3秒（＝曲の末尾）になり、実際にはほとんど音が流れない不自然な
// 結果になっていた（本人の指摘）。「durationSec内に収まっている」だけでは「再生位置として
// 安全」とは言えない、という指摘を受け、優先順位を3段階に分けた。
//
// 1. 通常範囲を確保できる場合：
//    leadInExcludeSec 〜 (durationSec - endMarginSec - playDurationSec) の間で決定
//    （今までどおり、冒頭・終端を除外した「本来の」ランダム範囲）。
// 2. 通常範囲は確保できないが、曲自体はplayDurationSec以上ある場合：
//    冒頭除外・終端余白を緩和し、0 〜 (durationSec - playDurationSec) の範囲で決定
//    （最低限「最後まで再生してもdurationSecを超えない」ことだけは保証する）。
// 3. 曲自体がplayDurationSecより短い場合：
//    startTimeSecは常に0（曲の先頭から、再生できるところまで流す。これ以上短くしようが
//    ずらそうが「最後まで聞こえない」事故は避けられないため、最も自然な先頭再生にする）。
//
// durationSecが不正な値（NaN・0以下・非有限数、音源の長さが取得できない異常系）の場合は、
// 上記のどの段階にも進まず常に0を返す（「適当な位置を推測して再生しない」という
// 本人の要望どおり）。
//
// 【保証する範囲】常に次を満たす：
//   0 <= startTimeSec < durationSec
//   startTimeSec <= max(0, durationSec - min(playDurationSec, durationSec))
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

  // 3. 曲自体がplayDurationSec以下（＝最後まで再生してもplayDurationSecに満たない）場合は、
  //    どこから始めても「最後まで聞こえない」ことは避けられないため、素直に先頭から流す。
  if (durationSec <= playDurationSec) {
    return 0;
  }

  const randomValue = computeQuestionRandomValue(seed, songId, questionIndex);

  // 1. 冒頭除外・終端余白を確保したうえで再生できる、本来のランダム範囲があるか確認する。
  const normalLowerBoundSec = Math.min(Math.max(leadInExcludeSec, 0), durationSec);
  const normalUpperBoundSec = durationSec - endMarginSec - playDurationSec;
  if (normalUpperBoundSec >= normalLowerBoundSec) {
    return normalLowerBoundSec + randomValue * (normalUpperBoundSec - normalLowerBoundSec);
  }

  // 2. 通常範囲は確保できないが、曲はplayDurationSec超の長さがある
  //    （durationSec > playDurationSecはこの時点で確定している）ため、冒頭除外・終端余白を
  //    いったん緩和し、「最後まで再生してもdurationSecを超えない」ことだけを保証する
  //    0 〜 (durationSec - playDurationSec) の範囲で決める。
  const relaxedUpperBoundSec = durationSec - playDurationSec;
  return randomValue * relaxedUpperBoundSec;
}

// 【2026-08-08新設・Phase4（ランダム再生クイズのオンライン対戦統合）用】
// computeRandomStartTimeSec()の結果（canonicalStartTimeSec）は、js/data/audioMetadata.jsに
// 記録した固定のdurationSecから計算する（端末ごとにブレるaudioElement.durationは
// 乱数計算そのものには一切混ぜない、という本人の方針。HANDOFF.md参照）。
//
// ただし、固定durationSecと、実際にブラウザが読み込んだ音源の長さ（actualDurationSec）が
// 万が一わずかにズレていた場合の保険として、実際に再生を試みる直前にこの関数を通し、
// 「実際の音源の長さを超える位置へシークしてしまい無音になる」事故だけは必ず防ぐ。
// CLAMP_SAFETY_MARGIN_SECは、actualDurationSecちょうどの位置へシークして即座に
// 再生終了してしまうのを避けるための、ごく小さな安全余白。
const CLAMP_SAFETY_MARGIN_SEC = 0.05;

export function clampStartTimeToActualDuration(canonicalStartTimeSec, actualDurationSec) {
  if (!Number.isFinite(actualDurationSec) || actualDurationSec <= 0) {
    // 実際の長さが取得できていない異常系では、収める先が無いためそのまま返す
    // （呼び出し側のaudio.jsが、この後の再生失敗を別途ハンドリングする）。
    return canonicalStartTimeSec;
  }
  const safeUpperBoundSec = Math.max(0, actualDurationSec - CLAMP_SAFETY_MARGIN_SEC);
  return Math.min(canonicalStartTimeSec, safeUpperBoundSec);
}

// 【2026-08-08新設・Phase4追加安全策】固定durationSec（canonicalDurationSec、
// js/data/audioMetadata.js由来）と、実際にブラウザが読み込んだ音源の長さ
// （actualDurationSec）の差が、MP3デコーダーの実装差として許容できる範囲かどうかを判定する。
//
// 【0.75秒という値について、本人の指示（0.5〜1.0秒の範囲で妥当な値を提案）を受けて設定】
// 実際に観測されるブラウザ間のMP3 duration差は、VBR（可変ビットレート）ヘッダーの
// 解釈違い等が原因でも通常0.5秒未満に収まることが多い。0.75秒は、その正常な誤差を
// 十分に許容しつつ、「端末に別の音源ファイルが入っている」「取り込みミスで違う曲が
// 入っている」といった実質的な違いは確実に検出できるよう、余裕を持たせつつも
// 検出力を落とし過ぎない中間値として選んだ。
//
// この判定がfalseを返す場合、呼び出し側（オンライン対戦のみ。1人用は対象外）は
// 無言でクランプして続行せず、再生を中止してエラー案内を出す（本人の指示どおり、
// 対戦の公平性を優先する）。
//
// 【2026-08-08追記・本人の指示】この0.75秒は「実機検証前の仮の安全値」であり、
// 永久確定仕様ではない。PC Chrome・iPhone Safari・Android Chrome等、実際の複数機種へ
// 同じ音源を入れて許容差を超える誤検出（本来同じ音源なのに拒否される）が出ないかは
// まだ確認できていない。実機検証で「同じ音源なのに拒否された」というケースが見つかった
// 場合は、この定数の値だけを1.0や1.5に変更すればよい（呼び出し側のロジックは変更不要）。
// 実機検証が済むまでは、この値を「確定」として扱わないこと（詳細はHANDOFF.md参照）。
export const MAX_DURATION_MISMATCH_SEC = 0.75;

export function isDurationMismatchWithinTolerance(canonicalDurationSec, actualDurationSec) {
  if (!Number.isFinite(actualDurationSec) || actualDurationSec <= 0) return false;
  if (!Number.isFinite(canonicalDurationSec) || canonicalDurationSec <= 0) return false;
  return Math.abs(actualDurationSec - canonicalDurationSec) <= MAX_DURATION_MISMATCH_SEC;
}
