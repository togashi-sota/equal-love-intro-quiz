// js/lyricsQuizBattleTiming.js（経過時間→ヒント段階の画面表示計算）のテスト。

import { deriveHintLevelFromElapsedMs, computeElapsedMs } from "../js/lyricsQuizBattleTiming.js";
import { assertEqual } from "./test-utils.js";

export function runLyricsQuizBattleTimingTests() {
  // ===== deriveHintLevelFromElapsedMs =====
  {
    const base = { hintIntervalSec: 6, maxHintLevel: 4 };
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 0 }), 1, "経過0msはヒント1");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: -100 }), 1, "経過時間が負（時計のズレ等）でもヒント1に留まる");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 5999 }), 1, "6秒未満はまだヒント1");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 6000 }), 2, "6秒ちょうどでヒント2に切り替わる");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 11999 }), 2, "12秒未満はヒント2のまま");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 12000 }), 3, "12秒でヒント3");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 18000 }), 4, "18秒でヒント4");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 999999 }), 4, "上限を超えてもmaxHintLevel(4)でクランプされる");
  }
  {
    // hintIntervalSecが変わっても同じ考え方で計算されることを確認（4秒間隔の設定）。
    const base = { hintIntervalSec: 4, maxHintLevel: 4 };
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 3999 }), 1, "4秒間隔設定：4秒未満はヒント1");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 4000 }), 2, "4秒間隔設定：4秒でヒント2");
    assertEqual(deriveHintLevelFromElapsedMs({ ...base, elapsedMs: 12000 }), 4, "4秒間隔設定：12秒でヒント4（上限）");
  }

  // ===== computeElapsedMs =====
  {
    assertEqual(
      computeElapsedMs({ questionStartedAt: 1000, nowServerTimeMs: 4000 }),
      3000,
      "questionStartedAtからnowServerTimeMsまでの経過時間を返す"
    );
    assertEqual(
      computeElapsedMs({ questionStartedAt: 4000, nowServerTimeMs: 1000 }),
      0,
      "何らかの理由でnowがquestionStartedAtより前でも、0未満にはクランプされる"
    );
    assertEqual(
      computeElapsedMs({ questionStartedAt: null, nowServerTimeMs: 5000 }),
      0,
      "questionStartedAtがまだ読めていない（null）場合は安全に0を返す"
    );
    assertEqual(
      computeElapsedMs({ questionStartedAt: undefined, nowServerTimeMs: 5000 }),
      0,
      "questionStartedAtがundefinedの場合も同様に0を返す"
    );
  }
}
