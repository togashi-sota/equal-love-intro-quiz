// オンライン対戦の「一瞬協力」モード用アダプター（2026-08-31新設、本人指示：19-3章）。
//
// 【設計方針】曲の選定・回答候補の生成（buildQuestions）・設定の既定値・検証ロジックは、
// 一瞬バトル（js/battleModes/instantBattleMode.js）と完全に同じ（同じ「曲を一瞬だけ再生し、
// 回答候補から当てる」出題方式のため）。outroBattleMode.jsがtimeAttackBattleMode.jsを
// そのまま再利用しているのと同じ考え方で、そちらをそのまま再エクスポートする。
//
// 【一瞬バトルとの違い】一瞬協力は個人成績・順位を持たない（チーム全体で1つの成績）ため、
// createResult・compareResultsはこのアダプターの責務外（js/battleModes/index.jsの
// calculateBattleResult/compareBattleResultsは呼ばれない設計）。チーム成績の集計は
// js/instantCoopMatchProgress.jsのfinalizeMatch()が担う。

import * as instantBattleMode from "./instantBattleMode.js";

export const gameMode = "instantCoop";
export const label = "一瞬協力";
export const description = "曲を一瞬だけ聴いて、みんなで力を合わせて当てます";
export const playbackType = "instant";
export const availabilityKind = "audio";

export const defaultSettings = instantBattleMode.defaultSettings;
export const validateSettings = instantBattleMode.validateSettings;
export const buildQuestions = instantBattleMode.buildQuestions;
export const resolveSettingsSongPool = instantBattleMode.resolveSettingsSongPool;
export const resolveAllEligibleSongIds = instantBattleMode.resolveAllEligibleSongIds;

// 【本人指示どおり、勝敗ではなくチーム成績】js/battleModes/index.jsのcompareBattleResults等は
// 個人結果の比較を前提にしており、一瞬協力では使わない（js/onlineInstantCoopBattleScreen.jsが
// js/instantCoopMatchProgress.jsのfinalizeMatch()の戻り値を直接描画する）。
// 【2026-09-15修正・本人指示：全オンラインモードの順位説明を再監査】以前の文言は
// 「同数のときは、もう一度聞いてから再投票します（最大2回）」という、2026-09-05に
// 本人指示で撤廃済みの共有再視聴→再投票の仕組みを説明したままだった（js/
// instantCoopMatchProgress.jsのtick()を確認すると、現在は同数タイなら即座に
// 決定論的なランダムでどちらかへ決まる設計で、再視聴・再投票のラウンドは存在しない）。
// 実際のtick()の判定と一致するよう修正した。
export function getRuleDescription() {
  return "全員の回答の多数決でチームの答えを決めます。全員一致なら即決定、同数タイの場合は同率トップの中から公平なランダムで1つに決まります（再投票はありません）。全員が「わからない」を選んだ場合はチームの不正解として扱います。";
}
