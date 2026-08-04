// タイムアタック対戦モード（ローカル対戦）の「結果コード」を担当するファイル。
// js/localBattle.js（対戦コード：問題を再現するための設定）とは別の、
// 「プレイし終えた1人分の結果」を表す短いコードを扱う。
//
// 【設計方針】結果コードには、プレイヤー名は含めない（名前は文字数が人によってバラバラで、
// 固定長の短いコードに収めにくいため）。結果コードは「タイム・正解数・ミス数・クリア状況」
// だけを表し、プレイヤー名は結果コードを受け取った人がその場で入力する運用にする。
// これにより、コードを常に同じ短い長さに保てる。
//
// 【2026-08-07・コード短縮】js/localBattle.jsと同じく、各項目を1バイト単位ではなく
// 必要なビット数だけで詰め込む方式に作り直した（js/bitCode.js参照）。
// 旧バージョン（16文字・1バイト単位）とは互換性がない（文字数が変わるため、
// 古いコードは文字数チェックの時点で自然に「invalid」と判定される）。

import { packFieldsToBase32, unpackBase32ToFields, computeChecksum, formatCodeForDisplay } from "./bitCode.js";

// 結果コードの形式自体のバージョン。
const RESULT_CODE_FORMAT_VERSION = 2;

// ===== 結果コードのビット構成（合計57bit→Base32 12文字）=====
//   resultCodeFormatVersion : 3bit
//   battleFingerprint       : 8bit（対戦コードのシード下位8bit。「違う対戦の結果コードを
//                              間違えて入力した」ケースをここで検出する。簡易チェックのため
//                              完全な一致検出ではない）
//   totalElapsedCentiSec    : 18bit（1/100秒＝センチ秒単位。結果画面の表示自体が
//                              小数点以下2桁（センチ秒）までのため、精度を一切落とさずに
//                              ミリ秒単位より少ないビット数で収められる。最大約43分まで対応）
//   correctCount            : 7bit（0〜127。現状の最大出題数を大きく上回る余裕）
//   missCount               : 7bit（0〜127。上限を超える極端なケースは127に切り詰める）
//   completed               : 1bit（クリアしたかどうか）
//   reachedQuestionNumber   : 7bit（LOVE連チャンで途中終了した場合の到達問題数）
//   checksum                : 6bit（入力ミスの簡易検出用）
const RESULT_CODE_FORMAT_VERSION_BITS = 3;
const BATTLE_FINGERPRINT_BITS = 8;
const ELAPSED_CENTISEC_BITS = 18;
const CORRECT_COUNT_BITS = 7;
const MISS_COUNT_BITS = 7;
const COMPLETED_BITS = 1;
const REACHED_QUESTION_NUMBER_BITS = 7;
const CHECKSUM_BITS = 6;

const MAX_CORRECT_COUNT = 2 ** CORRECT_COUNT_BITS - 1;
const MAX_MISS_COUNT = 2 ** MISS_COUNT_BITS - 1;
const MAX_ELAPSED_CENTISEC = 2 ** ELAPSED_CENTISEC_BITS - 1;
const MAX_REACHED_QUESTION_NUMBER = 2 ** REACHED_QUESTION_NUMBER_BITS - 1;

// 対戦コードのシード（24bit）から、結果コードに埋め込む短いフィンガープリントを作る。
function computeBattleFingerprint(seed) {
  return seed & (2 ** BATTLE_FINGERPRINT_BITS - 1);
}

const FIELD_BITS_WITHOUT_CHECKSUM = [
  RESULT_CODE_FORMAT_VERSION_BITS,
  BATTLE_FINGERPRINT_BITS,
  ELAPSED_CENTISEC_BITS,
  CORRECT_COUNT_BITS,
  MISS_COUNT_BITS,
  COMPLETED_BITS,
  REACHED_QUESTION_NUMBER_BITS,
];

function buildFieldList({ battleSeed, totalElapsedMs, correctCount, missCount, completed, reachedQuestionNumber }) {
  const fingerprint = computeBattleFingerprint(battleSeed);
  const elapsedCentiSec = Math.min(Math.round(totalElapsedMs / 10), MAX_ELAPSED_CENTISEC);
  return [
    { value: RESULT_CODE_FORMAT_VERSION, bits: RESULT_CODE_FORMAT_VERSION_BITS },
    { value: fingerprint, bits: BATTLE_FINGERPRINT_BITS },
    { value: elapsedCentiSec, bits: ELAPSED_CENTISEC_BITS },
    { value: Math.min(correctCount, MAX_CORRECT_COUNT), bits: CORRECT_COUNT_BITS },
    { value: Math.min(missCount, MAX_MISS_COUNT), bits: MISS_COUNT_BITS },
    { value: completed ? 1 : 0, bits: COMPLETED_BITS },
    { value: Math.min(reachedQuestionNumber, MAX_REACHED_QUESTION_NUMBER), bits: REACHED_QUESTION_NUMBER_BITS },
  ];
}

// ===== 公開API：結果コードの作成・解析 =====

// 自分のプレイ結果から、結果コード（文字列）を作る。
// battleSeed：今回参加している対戦コードのシード（対戦フィンガープリントの元になる）。
export function encodeResultCode({ battleSeed, totalElapsedMs, correctCount, missCount, completed, reachedQuestionNumber }) {
  const fields = buildFieldList({ battleSeed, totalElapsedMs, correctCount, missCount, completed, reachedQuestionNumber });
  const checksum = computeChecksum(
    fields.map((field) => field.value),
    CHECKSUM_BITS
  );
  return packFieldsToBase32([...fields, { value: checksum, bits: CHECKSUM_BITS }]);
}

// 結果コードを解析する。battleSeedを渡すと、フィンガープリントが一致するかも検証する
// （一致しない場合はreason:"wrong-battle"を返し、「違う対戦の結果コードでは」と案内できるようにする）。
// 戻り値：
//   { ok: true, result }
//   { ok: false, reason: "invalid" }
//   { ok: false, reason: "wrong-battle" }
export function decodeResultCode(rawCode, battleSeed) {
  const values = unpackBase32ToFields(rawCode, [...FIELD_BITS_WITHOUT_CHECKSUM, CHECKSUM_BITS]);
  if (!values) return { ok: false, reason: "invalid" };

  const [
    resultCodeFormatVersion,
    fingerprint,
    elapsedCentiSec,
    correctCount,
    missCount,
    completedFlag,
    reachedQuestionNumber,
    checksum,
  ] = values;

  const expectedChecksum = computeChecksum(
    [resultCodeFormatVersion, fingerprint, elapsedCentiSec, correctCount, missCount, completedFlag, reachedQuestionNumber],
    CHECKSUM_BITS
  );
  if (checksum !== expectedChecksum) return { ok: false, reason: "invalid" };
  if (resultCodeFormatVersion !== RESULT_CODE_FORMAT_VERSION) return { ok: false, reason: "invalid" };

  const result = {
    resultCodeFormatVersion,
    battleFingerprint: fingerprint,
    totalElapsedMs: elapsedCentiSec * 10,
    correctCount,
    missCount,
    completed: completedFlag === 1,
    reachedQuestionNumber,
  };

  if (battleSeed !== undefined && fingerprint !== computeBattleFingerprint(battleSeed)) {
    return { ok: false, reason: "wrong-battle" };
  }

  return { ok: true, result };
}

// 表示・手入力用に、4文字ごとにハイフンを入れる。
export function formatResultCodeForDisplay(code) {
  return formatCodeForDisplay(code);
}

// ===== 公開API：ノーマルルールの「最終記録」（ペナルティ込み）=====
//
// ノーマルは間違えても即座に何度でも選び直せるため、実測タイムだけで競うと
// 「深く考えず選択肢を連打する」戦法が有利になってしまう。これを防ぐため、
// ミス1回につき指定秒数のペナルティを実測タイムに加算した「最終記録」で競う
// （本人からの指摘・2026-08-07。ゲームデザイナー視点での検討はHANDOFF.md 10-45章参照）。
//
// 【2026-08-07・秒数を選択式に変更】当初は2.00秒固定だったが、初心者〜上級者まで
// 幅広く遊べるよう、対戦を作る側がペナルティ秒数（0/1/2/3/5/10秒）を選べるようにした
// （js/localBattle.jsのPENALTY_SECONDS_VALUES参照）。この値は対戦全体で共通の設定
// （対戦コード側が持つ）であり、結果コード側は変更していない（12文字のまま）。
export function computeNormalFinalRecordMs(result, penaltySecondsPerMiss) {
  return result.totalElapsedMs + result.missCount * penaltySecondsPerMiss * 1000;
}

// ===== 公開API：順位判定 =====
//
// 本人の指定どおりのルール：
//   ノーマル    ：①ペナルティ込みの最終記録（実測タイム＋ミス1回につき選択した秒数）が短い人を上位
//                 ②最終記録が同じならミス数が少ない人を上位
//   ハード      ：①正解数が多い人を上位（1問1回勝負のため、連打で速く終わらせても正解数が
//                 少なければ勝てない）②正解数が同じなら合計タイムが短い人を上位
//                 ③それも同じならミス数が少ない人を上位（ただしハードは「出題数＝正解数＋ミス数」
//                 が常に成り立つため、②で決着しない場合に③まで到達することは実質ない）
//   LOVE連チャン：①全問クリアした人を上位 ②未クリアは到達問題数が多い人を上位
//                 ③到達数が同じなら経過時間が短い人を上位 ④それも同じならミス数が少ない人を上位
// 対戦の参加者は全員が同じ対戦コード（＝同じルール・同じペナルティ秒数）でプレイしているため、
// 1つの対戦の中でルールやペナルティ設定が混ざることはない。
function compareResults(a, b, rule, penaltySecondsPerMiss) {
  if (rule === "loveChain") {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    if (!a.completed && a.reachedQuestionNumber !== b.reachedQuestionNumber) {
      return b.reachedQuestionNumber - a.reachedQuestionNumber;
    }
    if (a.totalElapsedMs !== b.totalElapsedMs) return a.totalElapsedMs - b.totalElapsedMs;
    return a.missCount - b.missCount;
  }

  if (rule === "hard") {
    if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
    if (a.totalElapsedMs !== b.totalElapsedMs) return a.totalElapsedMs - b.totalElapsedMs;
    return a.missCount - b.missCount;
  }

  // ノーマル
  const finalA = computeNormalFinalRecordMs(a, penaltySecondsPerMiss);
  const finalB = computeNormalFinalRecordMs(b, penaltySecondsPerMiss);
  if (finalA !== finalB) return finalA - finalB;
  return a.missCount - b.missCount;
}

// 参加者一覧（{playerName, result}の配列）を、順位が高い順に並べ替えて返す。
// 戻り値の各要素には rank（1始まりの順位）が追加される。
// penaltySecondsPerMissはノーマルルールのときだけ使う（対戦全体で共通の設定）。
export function rankBattleParticipants(participants, rule, penaltySecondsPerMiss) {
  const sorted = [...participants].sort((a, b) => compareResults(a.result, b.result, rule, penaltySecondsPerMiss));
  return sorted.map((participant, index) => ({ ...participant, rank: index + 1 }));
}
