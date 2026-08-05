// js/randomPlaybackEngine.js（ランダム再生クイズの開始位置計算・安全策）のテスト。
//
// 【このテストが必要な理由】computeRandomStartTimeSec()の境界値確認は、これまでブラウザの
// コンソールで直接関数を呼び出して確認するだけで、恒久的なテストファイルとして残していなかった。
// 今後この計算式に手を入れる際に壊れていないことを機械的に確認できるよう、本人の指示で
// 専用のテストファイルとして追加した（HANDOFF.md 10-64章参照）。
//
// 対象はcomputeRandomStartTimeSec()（1人用・オンライン対戦共通の位置計算）、
// clampStartTimeToActualDuration()・isDurationMismatchWithinTolerance()（オンライン対戦専用の
// 安全策、Phase4）の3関数。すべて純粋関数（同じ入力なら必ず同じ出力、DOM操作なし）。

import {
  computeRandomStartTimeSec,
  clampStartTimeToActualDuration,
  isDurationMismatchWithinTolerance,
  MAX_DURATION_MISMATCH_SEC,
  RANDOM_PLAYBACK_DEFAULTS,
} from "../js/randomPlaybackEngine.js";
import { assertEqual } from "./test-utils.js";

export function runRandomPlaybackEngineTests() {
  // ===== computeRandomStartTimeSec() =====

  // 異常値：常に0を返す（適当な位置を推測して再生しない、という方針の確認）。
  assertEqual(
    computeRandomStartTimeSec({ seed: 1, songId: "a", questionIndex: 0, durationSec: NaN }),
    0,
    "durationSecがNaN → 0"
  );
  assertEqual(
    computeRandomStartTimeSec({ seed: 1, songId: "a", questionIndex: 0, durationSec: 0 }),
    0,
    "durationSecが0 → 0"
  );
  assertEqual(
    computeRandomStartTimeSec({ seed: 1, songId: "a", questionIndex: 0, durationSec: -10 }),
    0,
    "durationSecが負数 → 0"
  );
  assertEqual(
    computeRandomStartTimeSec({ seed: 1, songId: "a", questionIndex: 0, durationSec: Infinity }),
    0,
    "durationSecが非有限数(Infinity) → 0"
  );

  // 3. 曲がplayDurationSec以下：常に0（先頭から再生する安全なフォールバック）。
  assertEqual(
    computeRandomStartTimeSec({ seed: 1, songId: "a", questionIndex: 0, durationSec: 3, playDurationSec: 5 }),
    0,
    "durationSec(3秒) < playDurationSec(5秒) → 0（曲の末尾にならない）"
  );
  assertEqual(
    computeRandomStartTimeSec({ seed: 1, songId: "a", questionIndex: 0, durationSec: 5, playDurationSec: 5 }),
    0,
    "durationSec(5秒) === playDurationSec(5秒) → 0"
  );

  // 2. 通常範囲（冒頭除外・終端余白）を確保できないが、曲自体はplayDurationSecより長い：
  //    緩和範囲 [0, durationSec-playDurationSec) に収まる。
  {
    const durationSec = 15; // leadIn10+endMargin5+play5=20 > 15 のため通常範囲は確保不可
    const result = computeRandomStartTimeSec({ seed: 42, songId: "short", questionIndex: 0, durationSec });
    assertEqual(
      result >= 0 && result < durationSec - RANDOM_PLAYBACK_DEFAULTS.playDurationSec + 1e-9,
      true,
      `冒頭/終端を確保できない曲(15秒)は緩和範囲[0, 10)に収まる（実際: ${result}）`
    );
  }

  // 1. 通常範囲を確保できる長い曲：[leadInExcludeSec, durationSec-endMarginSec-playDurationSec] に収まる。
  {
    const durationSec = 60;
    const lower = RANDOM_PLAYBACK_DEFAULTS.leadInExcludeSec;
    const upper = durationSec - RANDOM_PLAYBACK_DEFAULTS.endMarginSec - RANDOM_PLAYBACK_DEFAULTS.playDurationSec;
    let allWithinRange = true;
    for (let seed = 0; seed < 20; seed++) {
      const result = computeRandomStartTimeSec({ seed, songId: "long-song", questionIndex: 0, durationSec });
      if (result < lower - 1e-9 || result > upper + 1e-9) allWithinRange = false;
    }
    assertEqual(allWithinRange, true, `通常範囲を確保できる曲(60秒)は[10, 50]の範囲に収まる（20seed分確認）`);
  }

  // 決定論性：同じ入力は必ず同じ値。
  {
    const input = { seed: 42, songId: "cameo", questionIndex: 0, durationSec: 240 };
    const a = computeRandomStartTimeSec(input);
    const b = computeRandomStartTimeSec(input);
    assertEqual(a, b, "同じ入力（seed・songId・questionIndex・durationSec）は必ず同じ値を返す");
  }

  // seedを変えると値が変わる。
  {
    const base = { songId: "cameo", questionIndex: 0, durationSec: 240 };
    const a = computeRandomStartTimeSec({ ...base, seed: 1 });
    const b = computeRandomStartTimeSec({ ...base, seed: 2 });
    assertEqual(a !== b, true, "seedを変えると開始位置が変わる");
  }

  // 開始位置が負数にならない・durationSecそのものを返さない（幅広い組み合わせで確認）。
  {
    const durations = [0.5, 3, 5, 8, 15, 20, 60, 180, 300];
    let hasNegative = false;
    let equalsDuration = false;
    for (const durationSec of durations) {
      for (let seed = 0; seed < 6; seed++) {
        for (let questionIndex = 0; questionIndex < 5; questionIndex++) {
          const result = computeRandomStartTimeSec({ seed, songId: "song", questionIndex, durationSec });
          if (result < 0) hasNegative = true;
          if (result === durationSec) equalsDuration = true;
        }
      }
    }
    assertEqual(hasNegative, false, "270通りの組み合わせで開始位置が負数になることはない");
    assertEqual(equalsDuration, false, "270通りの組み合わせで開始位置がdurationSecそのものになることはない");
  }

  // startTime + playDurationSec が durationSec を超えない（通常範囲・緩和範囲どちらでも）。
  {
    const durations = [8, 15, 20, 60, 180];
    let anyExceeds = false;
    for (const durationSec of durations) {
      for (let seed = 0; seed < 10; seed++) {
        const result = computeRandomStartTimeSec({ seed, songId: "song", questionIndex: 0, durationSec });
        if (result + RANDOM_PLAYBACK_DEFAULTS.playDurationSec > durationSec + 1e-9) anyExceeds = true;
      }
    }
    assertEqual(anyExceeds, false, "startTime + playDurationSec が durationSec を超えるケースはない");
  }

  // ===== clampStartTimeToActualDuration() =====

  assertEqual(
    clampStartTimeToActualDuration(100, 10),
    9.95,
    "実durationが固定durationより短い場合、実durationの直前（-0.05秒）へクランプされる"
  );
  assertEqual(
    clampStartTimeToActualDuration(50, 200),
    50,
    "実durationが十分に長い場合、クランプされず元の値のまま"
  );
  assertEqual(
    clampStartTimeToActualDuration(50, NaN),
    50,
    "実durationがNaN（取得失敗）の場合、収める先が無いため元の値のまま"
  );
  assertEqual(
    clampStartTimeToActualDuration(50, 0),
    50,
    "実durationが0の場合、元の値のまま"
  );
  assertEqual(
    clampStartTimeToActualDuration(50, -10),
    50,
    "実durationが負数の場合、元の値のまま"
  );

  // ===== isDurationMismatchWithinTolerance() =====

  assertEqual(
    isDurationMismatchWithinTolerance(200, 200),
    true,
    "固定durationと実durationが完全一致 → 許容範囲内"
  );
  assertEqual(
    isDurationMismatchWithinTolerance(200, 200 + MAX_DURATION_MISMATCH_SEC),
    true,
    `差がちょうどMAX_DURATION_MISMATCH_SEC（${MAX_DURATION_MISMATCH_SEC}秒）ぴったり → 許容範囲内（境界含む）`
  );
  assertEqual(
    isDurationMismatchWithinTolerance(200, 200 + MAX_DURATION_MISMATCH_SEC + 0.01),
    false,
    `差がMAX_DURATION_MISMATCH_SEC（${MAX_DURATION_MISMATCH_SEC}秒）をわずかに超える → 許容範囲外`
  );
  assertEqual(
    isDurationMismatchWithinTolerance(200, NaN),
    false,
    "実durationが非有限値(NaN) → 安全側に倒して不一致（許容しない）"
  );
  assertEqual(
    isDurationMismatchWithinTolerance(NaN, 200),
    false,
    "固定durationが非有限値(NaN) → 安全側に倒して不一致（許容しない）"
  );
  assertEqual(
    isDurationMismatchWithinTolerance(200, 0),
    false,
    "実durationが0 → 不一致として扱う"
  );
  assertEqual(
    isDurationMismatchWithinTolerance(-200, 200),
    false,
    "固定durationが負数 → 不一致として扱う"
  );
}
