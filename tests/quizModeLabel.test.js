// js/quizModeLabel.jsの恒久テスト。
//
// 【2026-11-XX新設・本人指示：最優先1・モード名表示の完成】共通クイズ画面
// （#question-progress）は非常に多くの入口を共有しており、「今どの種類を遊んでいるか」の
// 判定を1箇所（この関数）に集約した。js/main.jsのrenderQuestion()内にある実際の音源
// 再生位置の判定（対戦の公平性にも関わる既存ロジック）と分岐条件が完全に一致していることを
// 保証するため、想定される全playMode・全variantの組み合わせを網羅的に確認する。
import { resolveQuizModeProgressPrefix, TIME_ATTACK_VARIANT_FOR_LABEL } from "../js/quizModeLabel.js";
import { assertEqual } from "./test-utils.js";

export function runQuizModeLabelTests() {
  // ---- 通常プレイ（イントロ）：本人指示どおり🎧イントロの接頭辞 ----
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "normal" }),
    "🎧 イントロ ",
    "playMode:normal（通常のイントロクイズ）は「🎧 イントロ」の接頭辞になる"
  );

  // ---- ローカル対戦（本人指示・実データ確認：常にイントロとして開始される） ----
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "localBattle" }),
    "🎧 イントロ ",
    "playMode:localBattle（ローカル対戦、常にイントロ）は「🎧 イントロ」の接頭辞になる"
  );

  // ---- スタンドアロンのランダム再生クイズ ----
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "randomPlayback" }),
    "🔀 ランダム再生 ",
    "playMode:randomPlaybackは「🔀 ランダム再生」の接頭辞になる"
  );

  // ---- タイムアタック：イントロvariant（既定） ----
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "timeAttack", timeAttackVariant: TIME_ATTACK_VARIANT_FOR_LABEL.INTRO }),
    "⏱️ タイムアタック ",
    "タイムアタック・イントロvariantは「⏱️ タイムアタック」の接頭辞になる"
  );

  // ---- タイムアタック：ランダム再生variant ----
  assertEqual(
    resolveQuizModeProgressPrefix({
      playMode: "timeAttack",
      timeAttackVariant: TIME_ATTACK_VARIANT_FOR_LABEL.RANDOM_PLAYBACK,
    }),
    "⏱️🔀 タイムアタック（ランダム再生） ",
    "タイムアタック・ランダム再生variantは区別できる接頭辞になる"
  );

  // ---- オンライン対戦：gameMode文字列から求めたラベルをそのまま使う
  //      （新しい表示名を作らず、js/battleModes/*.jsの既存labelと二重管理しない） ----
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "onlineBattle", onlineBattleModeLabel: "イントロ対戦" }),
    "イントロ対戦 ",
    "オンライン対戦・イントロ対戦は、渡されたラベルをそのまま接頭辞にする"
  );
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "onlineBattle", onlineBattleModeLabel: "ランダム再生対戦" }),
    "ランダム再生対戦 ",
    "オンライン対戦・ランダム再生対戦も同様"
  );
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "onlineBattle", onlineBattleModeLabel: "アウトロ対戦" }),
    "アウトロ対戦 ",
    "オンライン対戦・アウトロ対戦も同様"
  );

  // ---- 未知のplayMode（将来の拡張・想定外の値）でも、安全にイントロへフォールバックする
  //      （js/main.jsの音源再生位置判定も、同じ条件で最終的にplaySongIntro()へ
  //      フォールバックするため、表示と実際の再生が常に一致する） ----
  assertEqual(
    resolveQuizModeProgressPrefix({ playMode: "未知の値" }),
    "🎧 イントロ ",
    "未知のplayModeは安全にイントロ扱いへフォールバックする"
  );
  assertEqual(
    resolveQuizModeProgressPrefix({}),
    "🎧 イントロ ",
    "playMode自体が無くても安全にイントロ扱いへフォールバックする"
  );
}
