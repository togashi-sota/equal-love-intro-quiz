// タイムアタック対戦モード（ローカル対戦）の「結果コード」を担当するファイル。
// js/localBattle.js（対戦コード：問題を再現するための設定）とは別の、
// 「プレイし終えた1人分の結果」を表す短いコードを扱う。
//
// 【設計方針】結果コードには、プレイヤー名は含めない（名前は文字数が人によってバラバラで、
// 固定長の短いコードに収めにくいため）。結果コードは「タイム・正解数・ミス数・クリア状況」
// だけを表し、プレイヤー名は結果コードを受け取った人がその場で入力する運用にする。
// これにより、コードを常に同じ短い長さに保てる。

// 結果コードの形式自体のバージョン。
const RESULT_CODE_FORMAT_VERSION = 1;

// ===== バイト列 ⇔ 結果データ の変換 =====
//
// 結果コードのデータ構造（10バイト＝80bit）：
//   byte0    : 結果コード形式のバージョン
//   byte1-2  : 対戦フィンガープリント（対戦コードのシードの下位16bit。
//              「違う対戦の結果コードを間違えて入力した」ケースをここで検出する）
//   byte3-5  : 合計タイム（ミリ秒、24bit＝約4.6時間まで対応。タイムアタックとしては十分すぎる余裕）
//   byte6    : 正解数（0〜255）
//   byte7    : ミス数（0〜255）
//   byte8    : 到達問題数（クリアした場合は出題数と同じ値。LOVE連チャンで途中終了した場合だけ意味を持つ）
//              最上位1bitは「クリアしたかどうか」のフラグ（1=クリア、0=途中終了）に使う。
//   byte9    : チェック値（byte0〜8の合計を256で割った余り）
const PAYLOAD_BYTE_LENGTH = 10;

// 対戦コードのシード（32bit）から、結果コードに埋め込む短いフィンガープリント（16bit）を作る。
// 完全な一致検出ではなく「明らかに違う対戦の結果コードを入力した」ことに気づくための簡易チェック。
function computeBattleFingerprint(seed) {
  return seed & 0xffff;
}

function computeChecksum(bytesWithoutChecksum) {
  let sum = 0;
  for (const byte of bytesWithoutChecksum) {
    sum = (sum + byte) % 256;
  }
  return sum;
}

function encodeResultToBytes({ battleSeed, totalElapsedMs, correctCount, missCount, completed, reachedQuestionNumber }) {
  const fingerprint = computeBattleFingerprint(battleSeed);
  const clampedTimeMs = Math.min(Math.round(totalElapsedMs), 0xffffff);

  const bytes = new Uint8Array(PAYLOAD_BYTE_LENGTH);
  bytes[0] = RESULT_CODE_FORMAT_VERSION;
  bytes[1] = (fingerprint >> 8) & 0xff;
  bytes[2] = fingerprint & 0xff;
  bytes[3] = (clampedTimeMs >> 16) & 0xff;
  bytes[4] = (clampedTimeMs >> 8) & 0xff;
  bytes[5] = clampedTimeMs & 0xff;
  bytes[6] = Math.min(correctCount, 255);
  bytes[7] = Math.min(missCount, 255);
  bytes[8] = (completed ? 0x80 : 0) | (Math.min(reachedQuestionNumber, 127) & 0x7f);
  bytes[9] = computeChecksum(bytes.slice(0, 9));
  return bytes;
}

function decodeResultFromBytes(bytes) {
  if (bytes.length !== PAYLOAD_BYTE_LENGTH) return null;

  const expectedChecksum = computeChecksum(bytes.slice(0, 9));
  if (bytes[9] !== expectedChecksum) return null;

  const fingerprint = (bytes[1] << 8) | bytes[2];
  const totalElapsedMs = (bytes[3] << 16) | (bytes[4] << 8) | bytes[5];
  const correctCount = bytes[6];
  const missCount = bytes[7];
  const completed = (bytes[8] & 0x80) !== 0;
  const reachedQuestionNumber = bytes[8] & 0x7f;

  return {
    resultCodeFormatVersion: bytes[0],
    battleFingerprint: fingerprint,
    totalElapsedMs,
    correctCount,
    missCount,
    completed,
    reachedQuestionNumber,
  };
}

// ===== バイト列 ⇔ 短い文字列（Base32） =====
// js/localBattle.jsと全く同じ方式（Crockford's Base32、読み間違えやすい文字を除く）。
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PAYLOAD_BIT_LENGTH = PAYLOAD_BYTE_LENGTH * 8; // 80
const CODE_CHAR_LENGTH = Math.ceil(PAYLOAD_BIT_LENGTH / 5); // 16
const PADDING_BIT_LENGTH = CODE_CHAR_LENGTH * 5 - PAYLOAD_BIT_LENGTH; // 0

function bytesToBase32(bytes) {
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  value <<= BigInt(PADDING_BIT_LENGTH);

  let text = "";
  for (let i = CODE_CHAR_LENGTH - 1; i >= 0; i--) {
    const chunk = Number((value >> BigInt(i * 5)) & 0x1fn);
    text += BASE32_ALPHABET[chunk];
  }
  return text;
}

function base32ToBytes(text) {
  const chars = text.toUpperCase().replace(/[^0-9A-Z]/g, "");
  if (chars.length !== CODE_CHAR_LENGTH) return null;

  let value = 0n;
  for (const char of chars) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) return null;
    value = (value << 5n) | BigInt(index);
  }
  value >>= BigInt(PADDING_BIT_LENGTH);

  const bytes = new Uint8Array(PAYLOAD_BYTE_LENGTH);
  for (let i = PAYLOAD_BYTE_LENGTH - 1; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  return bytes;
}

// 表示・手入力用に、4文字ごとにハイフンを入れる。
export function formatResultCodeForDisplay(code) {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

// ===== 公開API：結果コードの作成・解析 =====

// 自分のプレイ結果から、結果コード（文字列）を作る。
// battleSeed：今回参加している対戦コードのシード（対戦フィンガープリントの元になる）。
export function encodeResultCode({ battleSeed, totalElapsedMs, correctCount, missCount, completed, reachedQuestionNumber }) {
  const bytes = encodeResultToBytes({ battleSeed, totalElapsedMs, correctCount, missCount, completed, reachedQuestionNumber });
  return bytesToBase32(bytes);
}

// 結果コードを解析する。battleSeedを渡すと、フィンガープリントが一致するかも検証する
// （一致しない場合はreason:"wrong-battle"を返し、「違う対戦の結果コードでは」と案内できるようにする）。
// 戻り値：
//   { ok: true, result }
//   { ok: false, reason: "invalid" }
//   { ok: false, reason: "wrong-battle" }
export function decodeResultCode(rawCode, battleSeed) {
  const bytes = base32ToBytes(rawCode);
  if (!bytes) return { ok: false, reason: "invalid" };

  const result = decodeResultFromBytes(bytes);
  if (!result) return { ok: false, reason: "invalid" };

  if (battleSeed !== undefined && result.battleFingerprint !== computeBattleFingerprint(battleSeed)) {
    return { ok: false, reason: "wrong-battle" };
  }

  return { ok: true, result };
}

// ===== 公開API：順位判定 =====
//
// 本人の指定どおりのルール：
//   ノーマル・ハード：①クリアしている人を上位 ②合計タイムが短い人を上位 ③同タイムはミス数が少ない人を上位
//   LOVE連チャン    ：①全問クリアした人を上位 ②未クリアは到達問題数が多い人を上位
//                     ③到達数が同じなら経過時間が短い人を上位 ④それも同じならミス数が少ない人を上位
// 対戦の参加者は全員が同じ対戦コード（＝同じルール）でプレイしているため、
// 1つの対戦の中でルールが混ざることはない。
function compareResults(a, b, rule) {
  if (rule === "loveChain") {
    if (a.completed !== b.completed) return a.completed ? -1 : 1;
    if (!a.completed && a.reachedQuestionNumber !== b.reachedQuestionNumber) {
      return b.reachedQuestionNumber - a.reachedQuestionNumber;
    }
    if (a.totalElapsedMs !== b.totalElapsedMs) return a.totalElapsedMs - b.totalElapsedMs;
    return a.missCount - b.missCount;
  }

  // ノーマル・ハード（既存のタイムアタック本編の仕様上、この2ルールは必ずcompleted:trueになる）
  if (a.completed !== b.completed) return a.completed ? -1 : 1;
  if (a.totalElapsedMs !== b.totalElapsedMs) return a.totalElapsedMs - b.totalElapsedMs;
  return a.missCount - b.missCount;
}

// 参加者一覧（{playerName, result}の配列）を、順位が高い順に並べ替えて返す。
// 戻り値の各要素には rank（1始まりの順位）が追加される。
export function rankBattleParticipants(participants, rule) {
  const sorted = [...participants].sort((a, b) => compareResults(a.result, b.result, rule));
  return sorted.map((participant, index) => ({ ...participant, rank: index + 1 }));
}
