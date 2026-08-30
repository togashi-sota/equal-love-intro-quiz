// js/battleModes/outroBattleMode.jsのテスト（2026-08-30新設、本人指示㉔：
// アウトロクイズをオンライン対戦へ追加）。
//
// 【確認したいこと】
// ・タイムアタック用アダプターと同じ進行ロジック（defaultSettings/buildQuestions/
//   compareResults等）をそのまま再エクスポートしていること（randomPlaybackBattleMode.jsと
//   同じ設計方針の回帰確認）。
// ・出題対象の全曲がoutroStartSec（js/data/audioMetadata.js）を持っている場合はOK。
// ・1曲でもoutroStartSecを持たない場合は、対戦の開始自体を拒否し、曲名入りのエラー文を返す
//   （公平性のため、実際の音源長へのフォールバックを許さない設計）。

import { validateSettings, resolveSettingsSongPool, playbackType, gameMode, label } from "../../js/battleModes/outroBattleMode.js";
import { QUESTION_SOURCE_TYPE } from "../../js/questionSource.js";
import { AUDIO_METADATA } from "../../js/data/audioMetadata.js";
import { assertEqual } from "../test-utils.js";

export function runOutroBattleModeTests() {
  assertEqual(gameMode, "outroQuiz", "gameModeは'outroQuiz'");
  assertEqual(label, "アウトロクイズ", "表示名は「アウトロクイズ」");
  assertEqual(playbackType, "outroPosition", "playbackTypeはrandomPositionとは別のoutroPosition");

  // ---- resolveSettingsSongPool：タイムアタック用アダプターと同じロジックを再利用している ----
  {
    const pool = resolveSettingsSongPool({
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love", "存在しない曲id"] },
    });
    assertEqual(pool, ["love"], "resolveSettingsSongPoolは実在しない曲idを除いて解決する（timeAttackBattleMode.jsと同じ挙動）");
  }

  const baseSettings = { questionCountValue: "5", rule: "normal", penaltySeconds: 2 };

  const enoughRealSongIds = ["love", "start", "zurui-yo-zurui-ne", "kioku-no-dokoka-de", "bokura-no-seifuku-christmas"];

  // ---- 対象曲が全曲outroStartSecを持つ場合：開始できる ----
  {
    const result = validateSettings({
      ...baseSettings,
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: enoughRealSongIds },
    });
    assertEqual(result, null, "対象曲が全曲outroStartSecを持っていれば、対戦を開始できる（エラーなし）");
  }

  // ---- outroStartSecを持たない曲が1曲でも混ざっていれば、開始できない ----
  // 【なぜAUDIO_METADATAを一時的に書き換えるか】現状の実データは全84曲がoutroStartSecを
  // 持っているため、「実在する曲だがoutroStartSecだけが未生成」という状況（新曲追加直後、
  // dev/generate_audio_metadata.py再実行前の一時的な状態を想定）を、既存データだけでは
  // 再現できない。AUDIO_METADATAはモジュールの生きたオブジェクト参照のため、値を退避・復元
  // する形で一時的に該当曲のoutroStartSecだけを取り除き、境界ケースを安全にシミュレートする
  // （テスト後は必ずtry/finallyで元の値に戻し、他のテストへ影響を残さない）。
  {
    const targetSongId = "love";
    const originalMetadata = AUDIO_METADATA[targetSongId];
    AUDIO_METADATA[targetSongId] = { durationSec: originalMetadata.durationSec };
    try {
      const result = validateSettings({
        ...baseSettings,
        questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: enoughRealSongIds },
      });
      assertEqual(
        typeof result === "string" && result.includes("＝LOVE"),
        true,
        "outroStartSecが無い曲が混ざっていると、その曲名を含むエラー文を返す"
      );
    } finally {
      AUDIO_METADATA[targetSongId] = originalMetadata;
    }
  }
}
