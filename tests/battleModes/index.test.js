// js/battleModes/index.jsの、resolveSongPoolForSettings()・getAvailabilityKind()・
// resolveAllEligibleSongIdsForMode()のテスト（2026-08-26新設、2026-08-27拡張）。
//
// オンライン対戦の共通曲（intersection）判定〈js/onlineBattleSongAvailability.js〉が、
// 「イントロ対戦・ランダム再生対戦は音源の所持状況で、歌詞クイズ対戦は歌詞データの
// 所持状況で絞り込む」という、モードごとに正しい種類（kind）へ振り分けられているかを
// 確認する（本人指示：重複ロジックを増やさず、既存の絞り込み基盤を種類だけ切り替えて
// 全モードへ統合する）。
//
// 【2026-08-27訂正】以前は「歌詞クイズはresolveSettingsSongPoolを実装しておらず、
// nullが返り絞り込み対象外になる」という設計・テストだったが、本人指示により歌詞クイズ
// 対戦にも共通曲絞り込みを対応させたため、resolveSettingsSongPool・resolveAllEligibleSongIds
// を新設した。それに伴いこのテストの期待値も更新している。

import {
  resolveSongPoolForSettings,
  getAvailabilityKind,
  resolveAllEligibleSongIdsForMode,
  getPlaybackType,
  getModeLabel,
  isKnownGameMode,
  computeFinisherRanks,
} from "../../js/battleModes/index.js";
import { createResult } from "../../js/battleModes/instantBattleMode.js";
import { createResult as createTimeAttackResult } from "../../js/battleModes/timeAttackBattleMode.js";
import { QUESTION_SOURCE_TYPE } from "../../js/questionSource.js";
import { assertEqual } from "../test-utils.js";

export function runBattleModesIndexAvailabilityTests() {
  // ---- タイムアタック：対応している ----
  {
    const pool = resolveSongPoolForSettings("timeAttack", {
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love"] },
    });
    assertEqual(pool, ["love"], "timeAttackはresolveSongPoolForSettings()に対応し、曲プールを返す");
  }

  // ---- ランダム再生クイズ：タイムアタックと同じロジックを再利用して対応している ----
  {
    const pool = resolveSongPoolForSettings("randomPlayback", {
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love"] },
    });
    assertEqual(pool, ["love"], "randomPlaybackもresolveSongPoolForSettings()に対応する");
  }

  // ---- 歌詞クイズ：2026-08-27より対応（歌詞データの共通曲判定のため） ----
  {
    const pool = resolveSongPoolForSettings("lyricsQuiz", {
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love"] },
    });
    assertEqual(pool, ["love"], "lyricsQuizもresolveSongPoolForSettings()に対応し、曲プールを返す");
  }

  // ---- 未登録のgameMode：安全にnullを返す ----
  {
    const pool = resolveSongPoolForSettings("未対応の対戦モード", {});
    assertEqual(pool, null, "未登録のgameModeでも例外を投げず、nullを返す");
  }

  // ---- getAvailabilityKind：モードごとに正しい所持データ種別を返す ----
  assertEqual(getAvailabilityKind("timeAttack"), "audio", "イントロ対戦は音源の所持状況で判定する");
  assertEqual(getAvailabilityKind("randomPlayback"), "audio", "ランダム再生対戦は音源の所持状況で判定する");
  assertEqual(getAvailabilityKind("lyricsQuiz"), "lyrics", "歌詞クイズ対戦は歌詞データの所持状況で判定する");
  assertEqual(getAvailabilityKind("未対応の対戦モード"), "audio", "未登録のgameModeは後方互換のためaudioを既定値にする");

  // ---- resolveAllEligibleSongIdsForMode：モードごとの母集団を返す ----
  {
    const audioPool = resolveAllEligibleSongIdsForMode("timeAttack");
    const lyricsPool = resolveAllEligibleSongIdsForMode("lyricsQuiz");
    assertEqual(audioPool.length > lyricsPool.length, true, "歌詞クイズ対象外の曲(Overture等)がある分、歌詞クイズの母集団は音源モードより少ない");
    assertEqual(lyricsPool.includes("overture"), false, "歌詞クイズの母集団にはOvertureが含まれない");
  }
  assertEqual(resolveAllEligibleSongIdsForMode("未対応の対戦モード"), [], "未登録のgameModeは空配列を返す");

  // ---- 2026-08-30追加（本人指示㉔）：アウトロクイズ対戦の登録確認 ----
  {
    assertEqual(isKnownGameMode("outroQuiz"), true, "outroQuizはREGISTRYに登録済み");
    assertEqual(getModeLabel("outroQuiz"), "アウトロクイズ", "outroQuizの表示名は「アウトロクイズ」");
    assertEqual(
      getPlaybackType("outroQuiz"),
      "outroPosition",
      "outroQuizのplaybackTypeは、ランダム再生（randomPosition）とは別のoutroPositionになる"
    );
    assertEqual(getAvailabilityKind("outroQuiz"), "audio", "アウトロクイズ対戦は音源の所持状況で判定する");
    const pool = resolveSongPoolForSettings("outroQuiz", {
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love"] },
    });
    assertEqual(pool, ["love"], "outroQuizもresolveSongPoolForSettings()に対応する");
  }

  // ---- 2026-08-30追加（本人指示：19-3章「一瞬バトル」）：一瞬バトルの登録確認 ----
  {
    assertEqual(isKnownGameMode("instantBattle"), true, "instantBattleはREGISTRYに登録済み");
    assertEqual(getModeLabel("instantBattle"), "一瞬バトル", "instantBattleの表示名は「一瞬バトル」");
    assertEqual(getAvailabilityKind("instantBattle"), "audio", "一瞬バトルは音源の所持状況で判定する");
    const pool = resolveSongPoolForSettings("instantBattle", {
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love"] },
    });
    assertEqual(pool, ["love"], "instantBattleもresolveSongPoolForSettings()に対応する");
  }

  // ---- 2026-09-01追加（本人指示）：computeFinisherRanks（結果画面の順位計算）----
  // 一瞬バトルだけ、完全同着を同じ順位として扱う（例：1位が2人なら次は3位）。
  // 他の全モードは、同着でも既存どおり連番の順位のまま変更しないことを確認する。
  {
    const makeFinisher = (uid, correctCount, totalReplayCount) => ({
      uid,
      participant: { displayName: uid },
      result: createResult({ correctCount, missCount: 0, totalElapsedMs: 1000, totalReplayCount, completed: true }),
    });

    // A・Bが完全同着（10正解・再視聴0回）、Cは9正解のみ違う → A・Bが同じ1位、Cは3位（2位を飛ばす）。
    {
      const finishers = [makeFinisher("A", 10, 0), makeFinisher("B", 10, 0), makeFinisher("C", 9, 0)];
      const ranks = computeFinisherRanks("instantBattle", finishers, {});
      assertEqual(ranks, [1, 1, 3], "一瞬バトルでA・Bが完全同着なら、本人指定どおり[1位, 1位, 3位]になる");
    }

    // 3人以上が連続で同着する場合も、正しく同じ順位が連鎖することを確認する。
    {
      const finishers = [makeFinisher("A", 10, 0), makeFinisher("B", 10, 0), makeFinisher("C", 10, 0), makeFinisher("D", 5, 0)];
      const ranks = computeFinisherRanks("instantBattle", finishers, {});
      assertEqual(ranks, [1, 1, 1, 4], "一瞬バトルで3人連続同着でも、全員同じ順位になり、次は4位になる（2〜3位を飛ばす）");
    }

    // 同着が無い場合は、一瞬バトルでも通常どおりの連番になることを確認する。
    {
      const finishers = [makeFinisher("A", 10, 0), makeFinisher("B", 8, 0), makeFinisher("C", 5, 0)];
      const ranks = computeFinisherRanks("instantBattle", finishers, {});
      assertEqual(ranks, [1, 2, 3], "一瞬バトルでも同着が無ければ通常どおり[1位, 2位, 3位]になる");
    }

    // 他のオンラインモード（タイムアタック）では、完全同着でも既存どおり連番のまま変更しない
    // （本人指示：既存モードの見た目・保存データを壊さない）。
    {
      const makeTimeAttackFinisher = (uid, correctCount) => ({
        uid,
        participant: { displayName: uid },
        result: createTimeAttackResult({ correctCount, missCount: 0, totalElapsedMs: 1000, completed: true }),
      });
      const finishers = [makeTimeAttackFinisher("A", 10), makeTimeAttackFinisher("B", 10), makeTimeAttackFinisher("C", 9)];
      const ranks = computeFinisherRanks("timeAttack", finishers, { rule: "normal", penaltySeconds: 2 });
      assertEqual(ranks, [1, 2, 3], "一瞬バトル以外（タイムアタック）は完全同着でも既存どおり連番のまま（同順位表示にしない）");
    }
  }
}
