// js/audioTroubleClassification.js（「🔇 音が出ない」救済ボタンの
// タイムシビア／非タイムシビア判定）のテスト。

import { isAudioTroubleTimeSevere } from "../js/audioTroubleClassification.js";
import { assertEqual } from "./test-utils.js";

export function runAudioTroubleClassificationTests() {
  // タイムシビア：回答時間が自己ベスト・グローバルランキングに直接影響するモード。
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "timeAttack" }),
    true,
    "タイムアタック（イントロvariant）はタイムシビア"
  );
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "timeAttack", specialModeId: null }),
    true,
    "タイムアタック（ランダム再生variantでも、判定はplayModeだけで決まる）はタイムシビア"
  );
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "randomPlayback" }),
    true,
    "ランダム再生クイズ（スタンドアロン版）はタイムシビア（js/timeAttackScreen.jsの記録エンジンをそのまま再利用するため）"
  );
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "normal" }),
    true,
    "通常イントロクイズは、calculateScore(elapsedSec)・合計タイム自己ベスト・グローバルランキングの" +
      "3つに回答時間が反映されるためタイムシビア（モード名からの直感に反する、コードで確認した結論）"
  );
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "special", specialModeId: "outroQuiz" }),
    true,
    "アウトロクイズ（通常導線、specialModeId:outroQuiz）は通常イントロクイズと同じ理由でタイムシビア"
  );

  // 非タイムシビア：正誤だけが記録（統一プレイ履歴）に残り、自己ベスト・ランキングには一切影響しないモード。
  assertEqual(isAudioTroubleTimeSevere({ playMode: "review" }), false, "復習プレイは非タイムシビア");
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "special", specialModeId: "weakSongs" }),
    false,
    "苦手曲モードA（イントロ）は非タイムシビア"
  );
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "special", specialModeId: "weakSongsShuffle" }),
    false,
    "苦手曲モード（シャッフル、ランダム再生を使う特別モード）も非タイムシビア（playModeが timeAttack/randomPlayback ではなく special のため）"
  );
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "special", specialModeId: "customQuiz" }),
    false,
    "オリジナル問題作成モードは非タイムシビア"
  );
  assertEqual(
    isAudioTroubleTimeSevere({ playMode: "special", specialModeId: "customQuizOutro" }),
    false,
    "オリジナル問題作成モード・アウトロタイプ（customQuizOutro）は、通常導線のoutroQuizとは違い" +
      "自己ベスト・ランキングの対象外のため非タイムシビア（specialModeIdの完全一致で区別する）"
  );

  // 対戦モード（localBattle・onlineBattle）は今回のタスク範囲外（別ファイルは触らない）。
  // ボタン自体をjs/main.js側で表示対象から外すため、この関数の分類結果は使われないが、
  // 念のためfalse（＝誤ってタイムシビア扱いされない）になることも確認しておく。
  assertEqual(isAudioTroubleTimeSevere({ playMode: "localBattle" }), false, "ローカル対戦は今回の対象外（表示自体をボタン側で除外する）");
  assertEqual(isAudioTroubleTimeSevere({ playMode: "onlineBattle" }), false, "オンライン対戦は今回の対象外（表示自体をボタン側で除外する）");
}
