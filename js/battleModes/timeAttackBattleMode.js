// オンライン対戦の「タイムアタック」モード用アダプター。
// 既存のオフライン対戦（js/localBattle.js・js/localBattleResult.js）のロジックを
// そのまま再利用し、js/battleModes/index.jsが定義する共通インターフェースに合わせて
// 薄くラップしているだけ。実際の出題・順位判定ロジックはここでは持たない。
//
// 【設計方針】このファイルが「タイムアタックモードならではの部分」を全部持つことで、
// js/onlineBattleScreen.js側はgameMode名を意識せず、js/battleModes/index.js経由の
// 共通関数だけを呼べばよい状態にしている（将来ランダム再生・歌詞クイズを追加するときも、
// 同じ形のファイルを1つ増やし、index.jsの登録簿に加えるだけで済む）。

import { buildBattleQuestions, validateBattleConfig, PENALTY_SECONDS_VALUES } from "../localBattle.js";
import { computeNormalFinalRecordMs } from "../localBattleResult.js";
import { resolveSongPool, buildQuestionsFromPool, validateSongPoolForQuestionCount, sanitizeSongIds } from "../questionSource.js";
import { MIN_SONGS_REQUIRED, filterSongsByCategory } from "../quiz.js";
import { SONGS } from "../data/songs.js";

export const gameMode = "timeAttack";
export const label = "タイムアタック";
export const description = "曲の冒頭を聴いて当てます";
// 【2026-08-08追加・Phase4】js/main.jsのrenderQuestion()が、gameMode名を直接比較するのではなく
// この値を見て再生方法を選べるようにするための識別子（"intro"＝曲の冒頭から再生）。
// 詳細はjs/battleModes/randomPlaybackBattleMode.jsのコメント・HANDOFF.md参照。
export const playbackType = "intro";
// 【2026-08-27新設】オンライン対戦の共通曲判定（js/onlineBattleSongAvailability.js）が、
// このモードを「音源の所持状況」で絞り込むべきと判断するための識別子。
export const availabilityKind = "audio";

// ロビー画面のホスト用設定フォームが最初に表示する既定値。
export function defaultSettings() {
  return { questionCountValue: "5", categoryFilterValue: "title-track", rule: "normal", penaltySeconds: 2 };
}

// 設定が実際に出題できる内容か検証する。問題なければnull、問題があればエラー文言を返す。
//
// 【questionSourceについて、2026-08-08追加】settings.questionSourceが指定されている場合
// （全員で選んだ曲・お気に入り・プレイリスト等から出題する場合）は、そちらを解決して
// 曲数を検証する。指定が無い場合（既存のカテゴリ絞り込みのみの設定）は、今までと完全に
// 同じcategoryFilterValueベースの検証を行う（後方互換。既存のオンライン対戦ルームの
// settingsにはquestionSourceが存在しないため、この関数は今までと寸分違わず同じ結果を返す）。
export function validateSettings(settings) {
  if (settings.questionSource) {
    const songPool = resolveQuestionSourceSongPool(settings.questionSource);
    if (songPool.length < MIN_SONGS_REQUIRED) {
      return "曲数が足りません。出題範囲を広げてください。";
    }
    const sizeCheck = validateSongPoolForQuestionCount(songPool, settings.questionCountValue);
    if (!sizeCheck.ok) {
      return `選択した曲は${sizeCheck.currentCount}曲です。${sizeCheck.requiredCount}問を出題するには${sizeCheck.requiredCount}曲以上必要です。`;
    }
    return null;
  }
  return validateBattleConfig({ categoryFilterValue: settings.categoryFilterValue });
}

// settings.questionSourceからsongPool（string[]）を取り出す。
// collaborativeSelection（オンライン共同選曲）は、確定済みのsongIdsをFirebase上に
// 直接保存している想定のため、questionSource.js側のresolveSongPoolを経由せず、
// settings.questionSource.songIdsをそのまま使う（他のtype同様、この呼び出し元では
// sanitizeはしない＝Firebase書き込み時点で既にサニタイズ済みという前提。詳細はPhase2の
// Firebaseルール案・onlineBattle.js側の実装を参照）。
function resolveQuestionSourceSongPool(questionSource) {
  if (questionSource.type === "collaborativeSelection") {
    return questionSource.songIds ?? [];
  }
  return resolveSongPool(questionSource);
}

// settingsから「実際に出題対象になりうる曲ID一覧」を解決する（questionSourceの有無を問わず、
// 常に配列を返す）。2026-08-26新設：オンライン対戦の共通曲（intersection）判定
// （js/onlineBattleSongAvailability.js）が、対戦開始直前に「絞り込む前の出題対象」を
// 知るために必要になったため、既存のvalidateSettings/buildQuestions内部でだけ使っていた
// 解決ロジックを、外部から呼べる形として切り出した（ロジック自体は変更していない）。
export function resolveSettingsSongPool(settings) {
  if (settings.questionSource) {
    return resolveQuestionSourceSongPool(settings.questionSource);
  }
  return filterSongsByCategory(SONGS, settings.categoryFilterValue).map((song) => song.id);
}

// 【2026-08-27新設】このモードで「そもそも出題対象になりうる全曲ID」を返す
// （今の設定・カテゴリ絞り込みとは無関係に、全曲が対象になりうる）。
// オンライン対戦のロビー画面が「今の参加者全員に共通する曲は何曲か」を見積もる際の
// 基準（basePool）として使う（js/battleModes/index.jsのresolveAllEligibleSongIdsForMode参照）。
export function resolveAllEligibleSongIds() {
  return sanitizeSongIds(SONGS.map((song) => song.id));
}

// seed・settingsから、全端末で完全に一致する問題セットを組み立てる。
//
// 【questionSourceについて、2026-08-08追加】settings.questionSourceが指定されていれば、
// そこから解決したsongPoolだけを出題対象にする（全員で選んだ曲・お気に入り・
// プレイリストからのオンライン対戦、js/questionSource.js参照）。指定が無い場合は
// 今までと完全に同じ、categoryFilterValueベースのbuildBattleQuestions()を呼ぶ
// （既存のオンライン対戦ルームの動作に一切影響しない）。
export function buildQuestions({ seed, settings }) {
  if (settings.questionSource) {
    const songPool = resolveQuestionSourceSongPool(settings.questionSource);
    return buildQuestionsFromPool({ seed, songPool, questionCountValue: settings.questionCountValue });
  }
  return buildBattleQuestions({
    seed,
    questionCountValue: settings.questionCountValue,
    categoryFilterValue: settings.categoryFilterValue,
  });
}

// 1人分のプレイ結果を、共通部分（elapsedMs・correctCount・missCount）と
// モード固有部分（reachedQuestionNumber：LOVE連チャンの途中終了時の到達問題数）に分けて格納する。
// 【Step3で使用予定】Step2では出題・回答画面を実装していないため、まだ呼び出されない。
export function createResult({ correctCount, missCount, totalElapsedMs, completed, reachedQuestionNumber }) {
  return {
    completed,
    common: { elapsedMs: totalElapsedMs, correctCount, missCount },
    detail: { reachedQuestionNumber: reachedQuestionNumber ?? null },
  };
}

// 2人分の結果を比較する（js/localBattleResult.jsの非公開compareResults()と同じ判定基準）。
// 戻り値がマイナスならresultAが上位。settingsのrule・penaltySecondsを見て判定を切り替える。
// 【Step3で使用予定】Step2ではまだ呼び出されない。
export function compareResults(resultA, resultB, settings) {
  const a = resultA.common;
  const b = resultB.common;

  if (settings.rule === "loveChain") {
    if (resultA.completed !== resultB.completed) return resultA.completed ? -1 : 1;
    const reachedA = resultA.detail.reachedQuestionNumber ?? 0;
    const reachedB = resultB.detail.reachedQuestionNumber ?? 0;
    if (!resultA.completed && reachedA !== reachedB) return reachedB - reachedA;
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
    return a.missCount - b.missCount;
  }

  if (settings.rule === "hard") {
    if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
    if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs - b.elapsedMs;
    return a.missCount - b.missCount;
  }

  // ノーマル：ミスペナルティ込みの最終記録で比較する。
  const finalA = computeNormalFinalRecordMs({ totalElapsedMs: a.elapsedMs, missCount: a.missCount }, settings.penaltySeconds);
  const finalB = computeNormalFinalRecordMs({ totalElapsedMs: b.elapsedMs, missCount: b.missCount }, settings.penaltySeconds);
  if (finalA !== finalB) return finalA - finalB;
  return a.missCount - b.missCount;
}

// ロビー画面・ルール確認等で表示する、勝敗条件の短い案内文。
const RULE_WIN_CONDITION_HINTS = {
  hard: "正解数が多い人が上位。同点の場合はタイムで決まります",
  loveChain: "全問クリアを目指します。失敗時は到達問題数で競います",
};

export function getRuleDescription(settings) {
  if (settings.rule === "normal") {
    return `ミス1回につき+${settings.penaltySeconds}秒。ペナルティ込みの記録で競います`;
  }
  return RULE_WIN_CONDITION_HINTS[settings.rule] ?? "";
}

export { PENALTY_SECONDS_VALUES };
