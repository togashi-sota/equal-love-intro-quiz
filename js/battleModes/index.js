// オンライン対戦の「対戦モード（gameMode）」登録簿。
//
// 【設計方針：アダプターパターン】各対戦モード（タイムアタック・将来のランダム再生クイズ・
// 歌詞クイズ等）は、それぞれ独立したファイル（例：timeAttackBattleMode.js）に
// 「そのモードならではの処理」を全部持たせ、ここに登録する。
// js/onlineBattle.js・js/onlineBattleScreen.jsは、gameModeの中身を意識せず、
// このファイルが公開する共通関数（createDefaultSettings・validateRoomSettings等）
// だけを呼べばよい。
//
// 【新しいモードを追加する手順】
//   1. js/battleModes/新しいモード名BattleMode.js を作り、下記と同じ形の関数を実装する
//      （gameMode・label・defaultSettings・validateSettings・buildQuestions・
//        createResult・compareResults・getRuleDescription）。
//   2. 下のimportとREGISTRYに1行ずつ追加する。
//   3. js/onlineBattleScreen.jsのロビー画面に、そのモードを選ぶUIを追加する
//      （Step2時点ではモードがtimeAttackしか無いため、選択UI自体はまだ無い）。
//   これだけで、onlineBattle.js・onlineBattleScreen.js本体の大きな改修は不要な設計にしている。

import * as timeAttackBattleMode from "./timeAttackBattleMode.js";

const REGISTRY = {
  [timeAttackBattleMode.gameMode]: timeAttackBattleMode,
};

// gameMode名からアダプターを取り出す。未登録のgameMode（対応していないモード・
// 古い/新しいアプリバージョンにしかない将来のモード等）の場合はnullを返す。
// 呼び出し側は必ずnullチェックし、「対応していない対戦モードです」等を安全に表示すること。
export function getBattleMode(gameMode) {
  return REGISTRY[gameMode] ?? null;
}

export function isKnownGameMode(gameMode) {
  return Object.prototype.hasOwnProperty.call(REGISTRY, gameMode);
}

export function createDefaultSettings(gameMode) {
  return getBattleMode(gameMode)?.defaultSettings() ?? null;
}

// 設定が実際に出題できる内容か検証する。問題なければnull、問題があればエラー文言を返す。
// gameMode自体が未登録の場合もエラー文言を返す。
export function validateRoomSettings(gameMode, settings) {
  const mode = getBattleMode(gameMode);
  if (!mode) return "対応していない対戦モードです。アプリを更新してください。";
  return mode.validateSettings(settings);
}

export function buildQuestionsForMode(gameMode, settings, seed) {
  const mode = getBattleMode(gameMode);
  if (!mode) return [];
  return mode.buildQuestions({ seed, settings });
}

// 【Step3で使用予定】Step2ではまだ呼び出されない。
export function calculateBattleResult(gameMode, answers) {
  return getBattleMode(gameMode)?.createResult(answers) ?? null;
}

// 【Step3で使用予定】Step2ではまだ呼び出されない。
export function compareBattleResults(gameMode, resultA, resultB, settings) {
  return getBattleMode(gameMode)?.compareResults(resultA, resultB, settings) ?? 0;
}

export function getRuleDescription(gameMode, settings) {
  return getBattleMode(gameMode)?.getRuleDescription(settings) ?? "";
}

export function getModeLabel(gameMode) {
  return getBattleMode(gameMode)?.label ?? gameMode;
}
