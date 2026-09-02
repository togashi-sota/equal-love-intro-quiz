// js/onlineBattleRevealTiming.js（歌詞クイズ・一瞬バトル・一瞬協力の答え表示残り時間計算）の
// テスト（2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド）。

import { computeRemainingRevealMs } from "../js/onlineBattleRevealTiming.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleRevealTimingTests() {
  // ---- resolvedAtが無い（まだ確定していない）場合は、revealDelayMsをそのまま返す ----
  {
    assertEqual(
      computeRemainingRevealMs({ revealDelayMs: 7000, resolvedAt: null, serverTimeOffset: 0, nowMs: 1000 }),
      7000,
      "resolvedAtがnullなら、常にrevealDelayMsそのものを返す（answer choicesが答え表示検知直後に呼ぶ通常経路）"
    );
    assertEqual(
      computeRemainingRevealMs({ revealDelayMs: 7000, resolvedAt: undefined, serverTimeOffset: 0, nowMs: 1000 }),
      7000,
      "resolvedAtがundefinedでも同様にrevealDelayMsをそのまま返す"
    );
  }

  // ---- サーバー時刻基準の残り時間計算（本人指示：歌詞7秒計算・一瞬系7秒計算） ----
  {
    // serverTimeOffset=0（端末の時計とサーバーが完全に一致）、resolvedAtからちょうど2秒経過。
    assertEqual(
      computeRemainingRevealMs({ revealDelayMs: 7000, resolvedAt: 100000, serverTimeOffset: 0, nowMs: 102000 }),
      5000,
      "resolvedAtから2秒経過していれば、7秒から2秒引いた5秒（5000ms）が残り時間になる"
    );
    // 経過0秒（答え表示が確定した、まさにその瞬間）。
    assertEqual(
      computeRemainingRevealMs({ revealDelayMs: 7000, resolvedAt: 100000, serverTimeOffset: 0, nowMs: 100000 }),
      7000,
      "確定した瞬間（経過0秒）なら、残り時間はrevealDelayMsそのまま"
    );
  }

  // ---- serverTimeOffsetを考慮すること（端末の時計がサーバーとずれている場合） ----
  {
    // 端末の時計がサーバーより2秒遅れている（serverTimeOffset=+2000、
    // つまりサーバー時刻 = 端末時刻 + 2000）。
    // 端末時刻nowMs=101000は、サーバー時刻では103000（resolvedAtから3秒経過）。
    assertEqual(
      computeRemainingRevealMs({ revealDelayMs: 7000, resolvedAt: 100000, serverTimeOffset: 2000, nowMs: 101000 }),
      4000,
      "端末の時計がサーバーより2秒遅れていても、serverTimeOffsetで補正した本当の経過時間（3秒）で計算する"
    );
  }

  // ---- バックグラウンド復帰等で検知が遅れ、既に答え表示時間を過ぎている場合 ----
  {
    const remaining = computeRemainingRevealMs({ revealDelayMs: 7000, resolvedAt: 100000, serverTimeOffset: 0, nowMs: 200000 });
    assertEqual(
      remaining < 0,
      true,
      "既に答え表示時間を大幅に過ぎていれば、負の値を返す（呼び出し側がremainingMsSec<=0で演出を鳴らさない判定に使う）"
    );
  }

  // ---- 各モードの実際のREVEAL_DELAY_MS（7000ms）での往復確認 ----
  {
    // 歌詞クイズ・一瞬バトル・一瞬協力は、いずれも本人指示によりREVEAL_DELAY_MS=7000へ
    // 統一されている（js/onlineLyricsQuizBattleScreen.js・js/onlineInstantBattleScreen.js・
    // js/onlineInstantCoopBattleScreen.js参照）。
    const REVEAL_DELAY_MS = 7000;
    assertEqual(
      computeRemainingRevealMs({ revealDelayMs: REVEAL_DELAY_MS, resolvedAt: 5000, serverTimeOffset: 0, nowMs: 5000 }) === REVEAL_DELAY_MS,
      true,
      "3モード共通のREVEAL_DELAY_MS=7000で、確定直後は満額の7秒が返る"
    );
  }
}
