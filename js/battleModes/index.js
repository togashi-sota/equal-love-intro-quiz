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
import * as randomPlaybackBattleMode from "./randomPlaybackBattleMode.js";
import * as lyricsQuizBattleMode from "./lyricsQuizBattleMode.js";
import * as outroBattleMode from "./outroBattleMode.js";
import * as instantBattleMode from "./instantBattleMode.js";

const REGISTRY = {
  [timeAttackBattleMode.gameMode]: timeAttackBattleMode,
  [randomPlaybackBattleMode.gameMode]: randomPlaybackBattleMode,
  [lyricsQuizBattleMode.gameMode]: lyricsQuizBattleMode,
  [outroBattleMode.gameMode]: outroBattleMode,
  [instantBattleMode.gameMode]: instantBattleMode,
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

// settingsが指す「実際に出題対象になりうる曲ID一覧」を解決する。2026-08-26新設：
// オンライン対戦の共通曲（参加者全員の音源所持状況の交差）判定
// （js/onlineBattleSongAvailability.js）が、対戦開始直前に使う。
// 【対応していないモードについて】歌詞クイズ対戦（lyricsQuizBattleMode）等、
// このメソッドを実装していないモードではnullを返す。呼び出し側はnullを
// 「音源の所持状況による絞り込みは行わない（このモードでは対象外）」として扱うこと
// （歌詞クイズは音源ではなく歌詞データの有無で判定すべきもので、既存の
// prepareRuntimeContext/checkRuntimeAvailability側の仕組みに委ねる）。
export function resolveSongPoolForSettings(gameMode, settings) {
  const mode = getBattleMode(gameMode);
  if (!mode?.resolveSettingsSongPool) return null;
  return mode.resolveSettingsSongPool(settings);
}

// 【2026-08-27新設】このgameModeの共通曲判定（js/onlineBattleSongAvailability.js）が
// どの所持データ種別（"audio"｜"lyrics"）で絞り込むべきかを返す。イントロ対戦・
// ランダム再生対戦は音源の所持状況で、歌詞クイズ対戦は歌詞データの所持状況で判定すべき
// もの（音源が無くても歌詞さえあれば歌詞クイズは成立するため）。未登録のモードや
// 明示していないモードは、後方互換のため"audio"を既定値にする。
export function getAvailabilityKind(gameMode) {
  return getBattleMode(gameMode)?.availabilityKind ?? "audio";
}

// 【2026-08-27新設】このgameModeで「そもそも出題対象になりうる全曲ID」を返す
// （今の設定・選択状態とは無関係に、モードの性質だけで決まる母集団）。
// ロビー画面が「今の参加者全員に共通する曲は何曲か」をリアルタイムに見積もったり、
// 曲選択画面に出す一覧を絞り込んだりする際の基準（basePool）として使う。
// 音源を使うモードは全曲、歌詞クイズ対戦は歌詞クイズ対象外の曲（Overture等）を
// 除いた曲、という違いを呼び出し側が意識せずに済むようにする。
export function resolveAllEligibleSongIdsForMode(gameMode) {
  return getBattleMode(gameMode)?.resolveAllEligibleSongIds?.() ?? [];
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

export function getModeDescription(gameMode) {
  return getBattleMode(gameMode)?.description ?? "";
}

// 【2026-08-08新設・Phase4】gameModeの「再生方式の識別子」を取り出す。
// js/main.jsのrenderQuestion()が、gameMode名を直接比較する代わりにこの値を見て
// 再生方法（イントロ再生／ランダム位置再生）を選ぶために使う。
export function getPlaybackType(gameMode) {
  return getBattleMode(gameMode)?.playbackType ?? "intro";
}

// ルーム作成画面のモード選択UIが、選べるgameMode一覧を表示するために使う。
export function listAvailableGameModes() {
  return Object.values(REGISTRY).map((mode) => ({
    gameMode: mode.gameMode,
    label: mode.label,
    description: mode.description,
  }));
}
