// タイムアタック対戦モード（ローカル対戦）の中核ロジックを担当するファイル。
// 「対戦コード」の作成・解析と、そこから同じ問題セットを再現する処理をここに集約する。
//
// 【設計の要点】対戦コードには、問題の並び順や選択肢そのものは含めていない。
// 代わりに「乱数のシード（種）」だけを含め、全端末が同じシード・同じアルゴリズムで
// 独自に同じ問題を再現する（js/seededRandom.js参照）。これにより、対戦コードを
// 短い文字列に収められる。
//
// 詳しい設計方針はdocs/battle-mode-design.mdを参照。

import { SONGS, SONGS_DATA_VERSION } from "./data/songs.js";
import { filterSongsByCategory, validatePoolSize, resolveQuestionCount, buildQuizQuestions } from "./quiz.js";
import { createSeededRandom, generateRandomSeed, RNG_VERSION } from "./seededRandom.js";

// 対戦コードの形式自体のバージョン（フィールド構成を変えたときは必ず上げる）。
const CODE_FORMAT_VERSION = 1;

// 出題数・カテゴリ・ルールは、対戦コード上では小さい整数（enum）で表す。
// 配列のインデックスがそのままenum値になる。順序を変えると既存の対戦コードと
// 対応がずれるため、要素を増やすときは必ず末尾に追加すること。
const QUESTION_COUNT_VALUES = ["5", "10", "20", "50", "all"];
const CATEGORY_FILTER_VALUES = ["title-track", "title-and-group", "all"];
const RULE_VALUES = ["normal", "hard", "loveChain"];

// ===== バイト列 ⇔ 対戦設定 の変換 =====
//
// 対戦コードのデータ構造（9バイト＝72bit）：
//   byte0    : 対戦コード形式のバージョン
//   byte1    : 曲データのバージョン
//   byte2    : 乱数アルゴリズムのバージョン
//   byte3-6  : シード（32bit）
//   byte7    : 出題数・カテゴリ・ルールをまとめたフラグ
//              (questionCountEnum<<5) | (categoryEnum<<3) | (ruleEnum<<1)
//   byte8    : チェック値（入力ミス・改ざんの簡易検出用。byte0〜7の合計を256で割った余り）
const PAYLOAD_BYTE_LENGTH = 9;

function computeChecksum(payloadBytesWithoutChecksum) {
  let sum = 0;
  for (const byte of payloadBytesWithoutChecksum) {
    sum = (sum + byte) % 256;
  }
  return sum;
}

// 対戦設定（{questionCountValue, categoryFilterValue, rule, seed}）を9バイトの配列に変換する。
function encodeBattleConfigToBytes({ questionCountValue, categoryFilterValue, rule, seed }) {
  const questionCountEnum = QUESTION_COUNT_VALUES.indexOf(questionCountValue);
  const categoryEnum = CATEGORY_FILTER_VALUES.indexOf(categoryFilterValue);
  const ruleEnum = RULE_VALUES.indexOf(rule);
  const flags = ((questionCountEnum & 0x7) << 5) | ((categoryEnum & 0x3) << 3) | ((ruleEnum & 0x3) << 1);

  const bytes = new Uint8Array(PAYLOAD_BYTE_LENGTH);
  bytes[0] = CODE_FORMAT_VERSION;
  bytes[1] = SONGS_DATA_VERSION;
  bytes[2] = RNG_VERSION;
  bytes[3] = (seed >>> 24) & 0xff;
  bytes[4] = (seed >>> 16) & 0xff;
  bytes[5] = (seed >>> 8) & 0xff;
  bytes[6] = seed & 0xff;
  bytes[7] = flags;
  bytes[8] = computeChecksum(bytes.slice(0, 8));
  return bytes;
}

// 9バイトの配列を対戦設定に戻す。チェック値が合わなければnullを返す
// （入力ミス・コードの一部欠落などを検出するため）。
function decodeBattleConfigFromBytes(bytes) {
  if (bytes.length !== PAYLOAD_BYTE_LENGTH) return null;

  const expectedChecksum = computeChecksum(bytes.slice(0, 8));
  if (bytes[8] !== expectedChecksum) return null;

  const flags = bytes[7];
  const questionCountEnum = (flags >> 5) & 0x7;
  const categoryEnum = (flags >> 3) & 0x3;
  const ruleEnum = (flags >> 1) & 0x3;

  const questionCountValue = QUESTION_COUNT_VALUES[questionCountEnum];
  const categoryFilterValue = CATEGORY_FILTER_VALUES[categoryEnum];
  const rule = RULE_VALUES[ruleEnum];
  if (!questionCountValue || !categoryFilterValue || !rule) return null;

  const seed = (bytes[3] << 24) | (bytes[4] << 16) | (bytes[5] << 8) | bytes[6];

  return {
    codeFormatVersion: bytes[0],
    songsDataVersion: bytes[1],
    rngVersion: bytes[2],
    seed: seed >>> 0, // 符号なし32bitに揃える
    questionCountValue,
    categoryFilterValue,
    rule,
  };
}

// ===== バイト列 ⇔ 短い文字列（Base32） =====
// 数字とA〜Zのうち、見間違えやすい I・L・O・U を除いた32文字だけを使う
// （Crockford's Base32と同じ考え方。手入力での読み間違いを減らすため）。
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const PAYLOAD_BIT_LENGTH = PAYLOAD_BYTE_LENGTH * 8; // 72
const CODE_CHAR_LENGTH = Math.ceil(PAYLOAD_BIT_LENGTH / 5); // 15
const PADDING_BIT_LENGTH = CODE_CHAR_LENGTH * 5 - PAYLOAD_BIT_LENGTH; // 3

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

// Base32文字列をバイト列に戻す。使えない文字が含まれる場合はnullを返す。
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

// 表示・手入力用に、4文字ごとにハイフンを入れる（例："K7F9XQ3M8LP2ABC" → "K7F9-XQ3M-8LP2-ABC"）。
export function formatBattleCodeForDisplay(code) {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

// ===== 公開API =====

// 新しい対戦設定を作る（対戦を作成する側が呼ぶ）。シードはここで新しく決める。
export function createBattleConfig({ questionCountValue, categoryFilterValue, rule }) {
  return {
    seed: generateRandomSeed(),
    questionCountValue,
    categoryFilterValue,
    rule,
  };
}

// 対戦設定から、対戦コード（文字列）を作る。
export function encodeBattleCode(config) {
  const bytes = encodeBattleConfigToBytes(config);
  return bytesToBase32(bytes);
}

// 対戦コードを解析する。戻り値は次のいずれか：
//   { ok: true, config }                                     … 正常に読み取れた
//   { ok: false, reason: "invalid" }                          … 文字数・チェック値が不正（入力ミスの可能性）
//   { ok: false, reason: "version-mismatch", config }         … 読み取れたが、曲データのバージョンが違う
export function decodeBattleCode(rawCode) {
  const bytes = base32ToBytes(rawCode);
  if (!bytes) return { ok: false, reason: "invalid" };

  const config = decodeBattleConfigFromBytes(bytes);
  if (!config) return { ok: false, reason: "invalid" };

  if (config.songsDataVersion !== SONGS_DATA_VERSION || config.rngVersion !== RNG_VERSION) {
    return { ok: false, reason: "version-mismatch", config };
  }

  return { ok: true, config };
}

// 対戦設定から、出題プールの検証エラーメッセージを返す（問題なければnull）。
// 画面側が「開始する」前にプール不足を案内するために使う。
export function validateBattleConfig({ categoryFilterValue }) {
  const pool = filterSongsByCategory(SONGS, categoryFilterValue);
  return validatePoolSize(pool);
}

// 対戦設定から、全端末で完全に同じ問題セット（{song, choices}の配列）を組み立てる。
// js/quiz.jsの既存ロジック（フィルタ・出題数決定・4択生成）を、シードから作った
// 決定論的な乱数関数と一緒にそのまま再利用しているだけで、出題ロジック自体は変更していない。
export function buildBattleQuestions({ seed, questionCountValue, categoryFilterValue }) {
  const pool = filterSongsByCategory(SONGS, categoryFilterValue);
  const questionCount = resolveQuestionCount(questionCountValue, pool.length);
  const random = createSeededRandom(seed);
  return buildQuizQuestions(pool, questionCount, random);
}
