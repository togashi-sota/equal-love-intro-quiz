// js/lyricsQuizBattleTiming.js（経過時間→ヒント段階の画面表示計算）のテスト。

import {
  deriveHintLevelFromElapsedMs,
  computeElapsedMs,
  deriveRevealedCharCount,
  revealTextByCharCount,
  countCharacters,
  computeStealHintProgress,
} from "../js/lyricsQuizBattleTiming.js";
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

  // ===== deriveRevealedCharCount（2026-08-31新設・早押しバトルの1文字/秒表示） =====
  {
    assertEqual(deriveRevealedCharCount({ elapsedMs: 0, totalCharCount: 8 }), 1, "経過0msでも1文字目は見えている");
    assertEqual(deriveRevealedCharCount({ elapsedMs: -100, totalCharCount: 8 }), 1, "経過時間が負でも1文字目のまま");
    assertEqual(deriveRevealedCharCount({ elapsedMs: 999, totalCharCount: 8 }), 1, "1秒未満はまだ1文字目のまま");
    assertEqual(deriveRevealedCharCount({ elapsedMs: 1000, totalCharCount: 8 }), 2, "1秒ちょうどで2文字目が見える");
    assertEqual(deriveRevealedCharCount({ elapsedMs: 7000, totalCharCount: 8 }), 8, "7秒で全8文字が見える");
    assertEqual(deriveRevealedCharCount({ elapsedMs: 999999, totalCharCount: 8 }), 8, "上限を超えても文字数（8）でクランプされる");
    assertEqual(deriveRevealedCharCount({ elapsedMs: 1000, totalCharCount: 0 }), 0, "歌詞テキストが空なら常に0");
    assertEqual(
      deriveRevealedCharCount({ elapsedMs: 500, totalCharCount: 8, msPerChar: 500 }),
      2,
      "msPerCharを変えれば、そのペースで表示が進む"
    );
  }

  // ===== revealTextByCharCount（絵文字・サロゲートペア対応） =====
  {
    assertEqual(revealTextByCharCount("とくべつして", 1), "と", "先頭1文字を取り出す");
    assertEqual(revealTextByCharCount("とくべつして", 3), "とくべ", "先頭3文字を取り出す");
    assertEqual(revealTextByCharCount("とくべつして", 100), "とくべつして", "文字数が全体を超えても全体まで");
    assertEqual(revealTextByCharCount("とくべつして", 0), "", "0文字なら空文字");
    // サロゲートペア（絵文字1文字が2つのUTF-16コード単位からなる）を分断しないことを確認する。
    // "😀" は2コード単位・"あ😀い" は3つの見た目の文字（あ・😀・い）から成る。
    assertEqual(revealTextByCharCount("あ😀い", 2), "あ😀", "絵文字を含んでいても、見た目の1文字単位で正しく2文字取り出せる（サロゲートペアを分断しない）");
  }

  // ===== countCharacters（サロゲートペア対応の文字数カウント） =====
  {
    assertEqual(countCharacters("とくべつして"), 6, "通常の文字列は見た目どおりの文字数");
    assertEqual(countCharacters("あ😀い"), 3, "絵文字1つを1文字として数える（.lengthのように2として数えない）");
    assertEqual(countCharacters(""), 0, "空文字は0");
  }

  // ===== computeStealHintProgress（2026-09-14新設：早押しバトルのヒント1〜4段階的表示） =====
  {
    const hintTexts = ["ab", "cd", "ef", "gh"];

    let progress = computeStealHintProgress({ elapsedMs: 0, hintTexts });
    assertEqual(progress.currentLevel, 1, "elapsedMs=0：ヒント1だけが始まっている");
    assertEqual(progress.levels.length, 1, "elapsedMs=0：levelsは1件だけ");
    assertEqual(progress.levels[0].revealedText, "a", "elapsedMs=0：ヒント1の1文字目だけ見える");
    assertEqual(progress.levels[0].isFullyRevealed, false, "elapsedMs=0：ヒント1はまだ全文表示ではない");

    progress = computeStealHintProgress({ elapsedMs: 999, hintTexts });
    assertEqual(progress.levels[0].revealedText, "a", "elapsedMs=999：1秒未満はまだ1文字目のまま");

    progress = computeStealHintProgress({ elapsedMs: 1000, hintTexts });
    assertEqual(progress.currentLevel, 1, "elapsedMs=1000：ヒント1が全文表示された直後、ヒント2はまだ始まらない");
    assertEqual(progress.levels[0].revealedText, "ab", "elapsedMs=1000：ヒント1が全文表示される");
    assertEqual(progress.levels[0].isFullyRevealed, true, "elapsedMs=1000：ヒント1は全文表示済み");

    progress = computeStealHintProgress({ elapsedMs: 2999, hintTexts });
    assertEqual(progress.currentLevel, 1, "elapsedMs=2999：2秒待機がまだ終わっていないのでヒント2は始まらない");

    progress = computeStealHintProgress({ elapsedMs: 3000, hintTexts });
    assertEqual(progress.currentLevel, 2, "elapsedMs=3000：2秒待機が終わり、ヒント2が始まる");
    assertEqual(progress.levels[0].revealedText, "ab", "elapsedMs=3000：ヒント1は表示されたまま消えない（積み上げ表示）");
    assertEqual(progress.levels[1].revealedText, "c", "elapsedMs=3000：ヒント2の1文字目が見える");
    assertEqual(progress.levels[1].isFullyRevealed, false, "elapsedMs=3000：ヒント2はまだ全文表示ではない");

    progress = computeStealHintProgress({ elapsedMs: 4000, hintTexts });
    assertEqual(progress.currentLevel, 2, "elapsedMs=4000：ヒント2が全文表示された直後、ヒント3はまだ始まらない");
    assertEqual(progress.levels[1].revealedText, "cd", "elapsedMs=4000：ヒント2が全文表示される");

    progress = computeStealHintProgress({ elapsedMs: 9000, hintTexts });
    assertEqual(progress.currentLevel, 4, "elapsedMs=9000：ヒント1〜3が全文表示済み、ヒント4が始まっている");
    assertEqual(progress.levels[0].revealedText, "ab", "elapsedMs=9000：ヒント1は表示されたまま");
    assertEqual(progress.levels[1].revealedText, "cd", "elapsedMs=9000：ヒント2は表示されたまま");
    assertEqual(progress.levels[2].revealedText, "ef", "elapsedMs=9000：ヒント3は表示されたまま");
    assertEqual(progress.levels[3].revealedText, "g", "elapsedMs=9000：ヒント4の1文字目が見える");
    assertEqual(progress.levels[3].isFullyRevealed, false, "elapsedMs=9000：ヒント4はまだ全文表示ではない");

    progress = computeStealHintProgress({ elapsedMs: 10000, hintTexts });
    assertEqual(progress.currentLevel, 4, "elapsedMs=10000：ヒント4も全文表示される");
    assertEqual(progress.levels[3].revealedText, "gh", "elapsedMs=10000：ヒント4が全文表示される");
    assertEqual(progress.levels[3].isFullyRevealed, true, "elapsedMs=10000：ヒント4は全文表示済み");

    progress = computeStealHintProgress({ elapsedMs: 999999, hintTexts });
    assertEqual(progress.currentLevel, 4, "十分に時間が経過しても、ヒント4より先には進まない（誰かが正解するまで待機）");
    assertEqual(progress.levels[3].revealedText, "gh", "時間が経過しすぎてもヒント4の内容は変わらない");

    progress = computeStealHintProgress({ elapsedMs: Number.POSITIVE_INFINITY, hintTexts });
    assertEqual(progress.currentLevel, 4, "elapsedMs=Infinity（本人が回答済みの場合の呼び出し）でも全4段階が破綻なく返る");
    assertEqual(progress.levels[3].revealedText, "gh", "elapsedMs=Infinityでもヒント4は全文表示される");

    progress = computeStealHintProgress({ elapsedMs: 0, hintTexts: [] });
    assertEqual(progress.currentLevel, 0, "hintTextsが空配列なら何も表示しない");
    assertEqual(progress.levels.length, 0, "hintTextsが空配列ならlevelsも空");

    // 1文字だけのヒント（revealDurationMsが0になる境界）でも破綻しないことを確認する。
    const shortHints = ["a", "b"];
    progress = computeStealHintProgress({ elapsedMs: 0, hintTexts: shortHints });
    assertEqual(progress.currentLevel, 1, "1文字ヒント：elapsedMs=0で即座に全文表示される");
    assertEqual(progress.levels[0].isFullyRevealed, true, "1文字ヒント：1文字しかないので即座に全文表示扱い");
    progress = computeStealHintProgress({ elapsedMs: 2000, hintTexts: shortHints });
    assertEqual(progress.currentLevel, 2, "1文字ヒント：2秒待機後に次のヒントへ進む");
    assertEqual(progress.levels[1].revealedText, "b", "1文字ヒント：ヒント2も即座に全文表示される");
  }
}
