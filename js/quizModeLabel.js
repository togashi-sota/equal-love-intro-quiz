// 共通クイズ画面（#question-progress）の進捗表示に添える、モード名の短い接頭辞を
// 決めるだけの純粋関数（2026-11-XX新設・本人指示：最優先1・モード名表示の完成）。
//
// 【なぜ切り出したか】この画面はイントロ／ランダム再生／アウトロの3種類・
// オフライン（通常・タイムアタック・ローカル対戦）／オンライン対戦、非常に多くの入口を
// 共有しており、js/main.jsのrenderQuestion()内にある実際の音源再生位置の判定
// （gameState.playMode・タイムアタックのvariant・オンライン対戦のgameMode文字列を見て
// 「どの位置から曲を再生するか」を決める、対戦の公平性にも関わる既存のロジック）と
// 完全に同じ条件分岐をこの表示用の判定でも辿る必要がある。js/main.js自体はDOM要素の
// 取得を大量に行うファイルのため自動テストから直接importできない（既存のテスト方針）
// ため、判定ロジックだけをこの独立ファイルへ抜き出し、恒久テスト
// （tests/quizModeLabel.test.js）から直接検証できるようにした。
//
// 【special（苦手曲モード・オリジナル問題作成モード）・review（復習）はこの対象外】
// それぞれSPECIAL_MODES_DISPLAYの絵文字接頭辞・「🔁 復習」という既存表示が既にモードの
// 種類を伝えているため、js/main.js側でこの関数を呼ぶ前に別途処理している。

// 【値はjs/timeAttackScreen.jsのTIME_ATTACK_VARIANTと文字列として完全に一致させること】
// このファイルはDOM操作を持つtimeAttackScreen.jsを意図的にimportしていない（依存を
// 増やさず、テストから完全に独立させるため）。呼び出し側（js/main.js）が実際の
// getCurrentTimeAttackVariant()の戻り値をそのままtimeAttackVariantへ渡す設計のため、
// 値がズレると判定が効かなくなる。値自体（"intro"／"randomPlayback"）は変更されにくい
// 定数のため、実害は小さいと判断したうえでの割り切り。
export const TIME_ATTACK_VARIANT_FOR_LABEL = { INTRO: "intro", RANDOM_PLAYBACK: "randomPlayback" };

// state: {
//   playMode: gameState.playMode（"normal"|"randomPlayback"|"timeAttack"|"onlineBattle"|
//             "localBattle"、その他の値はすべてイントロ扱いにフォールバックする）,
//   timeAttackVariant: playMode==="timeAttack"のときだけ意味を持つ、
//             getCurrentTimeAttackVariant()の戻り値,
//   onlineBattleModeLabel: playMode==="onlineBattle"のときだけ意味を持つ、
//             getModeLabel(onlineBattleGameMode)で求めた表示名（呼び出し側が算出して渡す。
//             このファイル自身はjs/battleModes/index.jsをimportしない＝依存を増やさない）,
// }
export function resolveQuizModeProgressPrefix({ playMode, timeAttackVariant, onlineBattleModeLabel }) {
  if (playMode === "randomPlayback") {
    return "🔀 ランダム再生 ";
  }
  if (playMode === "timeAttack") {
    return timeAttackVariant === TIME_ATTACK_VARIANT_FOR_LABEL.RANDOM_PLAYBACK
      ? "⏱️🔀 タイムアタック（ランダム再生） "
      : "⏱️ タイムアタック ";
  }
  if (playMode === "onlineBattle") {
    return `${onlineBattleModeLabel} `;
  }
  // "normal"・"localBattle"・その他未知の値はすべてイントロ扱い（js/main.jsの
  // renderQuestion()の音源再生位置判定も、同じ条件で最終的にイントロ再生
  // 〈playSongIntro〉へフォールバックしているため、表示と実際の再生が必ず一致する）。
  return "🎧 イントロ ";
}
