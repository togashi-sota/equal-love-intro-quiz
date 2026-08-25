// js/battleModes/index.jsの、resolveSongPoolForSettings()のテスト（2026-08-26新設）。
//
// オンライン対戦の共通曲（intersection）判定〈js/onlineBattleSongAvailability.js〉が、
// 「音源を使う対戦モード（タイムアタック・ランダム再生）でだけ絞り込みを行い、
// 音源以外のデータで判定すべきモード（歌詞クイズ）には一切手を出さない」という
// 安全な境界線を守れているかを確認する（本人指示H：既存コードを必要以上に
// 全面改修せず、安全に段階導入する）。

import { resolveSongPoolForSettings } from "../../js/battleModes/index.js";
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

  // ---- 歌詞クイズ：音源の所持状況で絞り込むべきではないため、意図的に未対応（null） ----
  {
    const pool = resolveSongPoolForSettings("lyricsQuiz", {
      questionSource: { type: QUESTION_SOURCE_TYPE.ALL_SONGS },
    });
    assertEqual(
      pool,
      null,
      "lyricsQuizはresolveSettingsSongPoolを実装していないため、nullが返り絞り込み対象外になる"
    );
  }

  // ---- 未登録のgameMode：安全にnullを返す ----
  {
    const pool = resolveSongPoolForSettings("未対応の対戦モード", {});
    assertEqual(pool, null, "未登録のgameModeでも例外を投げず、nullを返す");
  }
}
