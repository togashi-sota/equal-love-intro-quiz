// 歌詞クイズ オンライン対戦「勝敗ルール（battleRules）」登録簿。
//
// js/battleModes/index.js（出題方法＝gameModeの軸）とは別の、もう1本の軸。
// クラシック・奪い取り・コンボはそれぞれ独立したファイルに「そのルールならではの
// 採点・終了条件・結果生成」を全部持たせ、ここに登録するだけにする（設計⑥0章）。
//
// 呼び出し側（今後実装するjs/battleModes/lyricsQuizBattleMode.js・オンライン対戦画面）は、
// このファイルが公開する関数だけを呼べばよく、ruleId（"classic"/"steal"/"combo"等）の
// 文字列比較を一切書かない。将来ルールを追加するときにここへ1行足すだけで済み、
// 呼び出し側の本体コードは無改造のまま、というのが今回の設計の狙い。
//
// 【新しいルールを追加する手順】
//   1. js/battleRules/新しいルール名Rule.js を作り、下記と同じ形の関数・宣言を実装する
//      （ruleId・label・description・allowedAnswerPoolSizes・defaultSettings・
//        validateSettings・resolveQuestionAnswers・shouldEndQuestion・aggregateResult・
//        compareResults・getRuleDescription・settingsFields・hudFields・resultColumns）。
//   2. 下のimportとRULE_REGISTRYに1行ずつ追加する。
//   これだけで、オンライン対戦エンジン本体の改修は不要な設計にしている。

import * as classicRule from "./classicRule.js";
import * as stealRule from "./stealRule.js";
import * as comboRule from "./comboRule.js";

export const RULE_REGISTRY = {
  [classicRule.ruleId]: classicRule,
  [stealRule.ruleId]: stealRule,
  [comboRule.ruleId]: comboRule,
};

// ruleIdからルールモジュールを取り出す。未登録のruleId（対応していない/将来のルール）
// の場合はnullを返す。呼び出し側は必ずnullチェックすること。
export function getBattleRule(ruleId) {
  return RULE_REGISTRY[ruleId] ?? null;
}

export function isKnownBattleRule(ruleId) {
  return Object.prototype.hasOwnProperty.call(RULE_REGISTRY, ruleId);
}

export function createDefaultBattleRuleSettings(ruleId) {
  return getBattleRule(ruleId)?.defaultSettings() ?? null;
}

// ruleId自体の妥当性とルール固有設定の両方を検証する。問題なければnull、
// 問題があればエラー文言を返す。
export function validateBattleRule(ruleId, settings) {
  const rule = getBattleRule(ruleId);
  if (!rule) return "対戦ルールが不正です。";
  return rule.validateSettings(settings);
}

export function resolveQuestionAnswers(ruleId, context) {
  return getBattleRule(ruleId)?.resolveQuestionAnswers(context) ?? {};
}

export function shouldEndQuestion(ruleId, context) {
  return getBattleRule(ruleId)?.shouldEndQuestion(context) ?? false;
}

export function aggregateResult(ruleId, questionOutcomes, settings) {
  return getBattleRule(ruleId)?.aggregateResult(questionOutcomes, settings) ?? null;
}

export function compareBattleRuleResults(ruleId, resultA, resultB, settings) {
  return getBattleRule(ruleId)?.compareResults(resultA, resultB, settings) ?? 0;
}

export function getBattleRuleDescription(ruleId, settings) {
  return getBattleRule(ruleId)?.getRuleDescription(settings) ?? "";
}

export function getBattleRuleLabel(ruleId) {
  return getBattleRule(ruleId)?.label ?? ruleId;
}

// 【設計⑩③・ルールバージョン】配点やコンボ倍率を将来変更したとき、古い結果と
// 新しい結果が混ざらないようにするための版数。各ルールモジュールが持つ
// ruleVersion（整数、変更のたびに+1する運用）をそのまま取り出すだけの窓口。
export function getBattleRuleVersion(ruleId) {
  return getBattleRule(ruleId)?.ruleVersion ?? null;
}

// 「今このアプリが知っているバージョンと一致しているか」を確認する。
// 例えば、ルームのsettings.battleRuleVersionと、自分の端末のgetBattleRuleVersion()を
// 比較することで、配点を変更した新しいアプリと、更新前の古いアプリが混在した対戦を
// 未然に防げる（本人指示どおり「未知のバージョンでは開始を拒否できる」設計）。
export function isSupportedBattleRuleVersion(ruleId, version) {
  return getBattleRuleVersion(ruleId) === version;
}

export function getAllowedAnswerPoolSizes(ruleId) {
  return getBattleRule(ruleId)?.allowedAnswerPoolSizes ?? [];
}

// 【Phase6.5新設】画面層が回答を送信するとき、「回答ログだけでよいか、勝者claimも
// 一緒に送るべきか」をruleIdの文字列分岐なしで決められるようにする窓口。
// 各ルールがgetAnswerSubmissionPlan()を持たない場合は、最も一般的な「回答ログのみ」を
// 安全側のデフォルトとして返す。
export function getAnswerSubmissionPlan(ruleId, context) {
  return getBattleRule(ruleId)?.getAnswerSubmissionPlan?.(context) ?? { submitAnswer: true, submitWinnerClaim: false };
}

// 【Phase6.5新設】対戦中HUDの「現在倍率」等、ルールごとの追加ライブ計算をruleIdの
// 文字列分岐なしで呼べるようにする窓口。対応するメソッドを持たないルールはnullを返す
// （呼び出し側はnullを「このルールには無い項目」として扱う）。
export function getComboMultiplierForCount(ruleId, comboCount) {
  return getBattleRule(ruleId)?.getComboMultiplierForCount?.(comboCount) ?? null;
}

// ルーム設定画面の「ルール選択」一覧が、この配列を描画するだけで済むようにするための窓口
// （設計⑥1.5章）。クラシック・奪い取り・コンボという名前をUI側が知る必要はない。
export function listAvailableBattleRules() {
  return Object.values(RULE_REGISTRY).map((rule) => ({
    ruleId: rule.ruleId,
    label: rule.label,
    description: rule.description,
    allowedAnswerPoolSizes: rule.allowedAnswerPoolSizes,
    settingsFields: rule.settingsFields,
    hudFields: rule.hudFields,
    resultColumns: rule.resultColumns,
  }));
}
