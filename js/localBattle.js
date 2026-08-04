// タイムアタック対戦モード（ローカル対戦）の中核ロジックを担当するファイル。
// 「対戦コード」の作成・解析と、そこから同じ問題セットを再現する処理をここに集約する。
//
// 【設計の要点】対戦コードには、問題の並び順や選択肢そのものは含めていない。
// 代わりに「乱数のシード（種）」だけを含め、全端末が同じシード・同じアルゴリズムで
// 独自に同じ問題を再現する（js/seededRandom.js参照）。これにより、対戦コードを
// 短い文字列に収められる。
//
// 詳しい設計方針はdocs/battle-mode-design.mdを参照。
//
// 【2026-08-07・コード短縮】各項目を1バイト単位ではなく、必要なビット数だけで詰め込む方式に
// 作り直した（js/bitCode.js参照）。本人の「多少の余裕・誤入力検出精度より、コードの短さを
// 優先したい」という判断による。旧バージョン（15文字・1バイト単位）とは互換性がない。
//
// 【2026-08-07・ミスペナルティ選択の追加】ノーマルルールのミスペナルティ（秒/1ミス）を
// 選択式にするにあたり、対戦コードに3bitのpenaltyEnumを追加した。曲データバージョンを
// 6bit→5bitへ縮小して確保したビットと合わせることで、文字数（10文字）は変えていない。
// CODE_FORMAT_VERSIONを3に更新済み。文字数・ビット構成が変わるたびに版数を上げているため、
// 古いコードは文字数またはチェック値の時点で自然に「invalid」と判定される。

import { SONGS, SONGS_DATA_VERSION } from "./data/songs.js";
import { filterSongsByCategory, validatePoolSize, resolveQuestionCount, buildQuizQuestions } from "./quiz.js";
import { createSeededRandom, generateRandomSeed, RNG_VERSION } from "./seededRandom.js";
import { packFieldsToBase32, unpackBase32ToFields, computeChecksum, formatCodeForDisplay } from "./bitCode.js";

// 対戦コードの形式自体のバージョン（フィールド構成を変えたときは必ず上げる）。
const CODE_FORMAT_VERSION = 3;

// 出題数・カテゴリ・ルールは、対戦コード上では小さい整数（enum）で表す。
// 配列のインデックスがそのままenum値になる。順序を変えると既存の対戦コードと
// 対応がずれるため、要素を増やすときは必ず末尾に追加すること。
const QUESTION_COUNT_VALUES = ["5", "10", "20", "50", "all"];
const CATEGORY_FILTER_VALUES = ["title-track", "title-and-group", "all"];
const RULE_VALUES = ["normal", "hard", "loveChain"];

// ノーマルルールのミスペナルティ（秒/1ミス）の選択肢。配列のインデックスがそのまま
// 対戦コード上のenum値になる（要素を増やすときは末尾に追加すること）。
// ハード・LOVE連チャンではこの値は使わないが、対戦コードのビット配置は
// ルールに関わらず常に同じ構成のため、フィールド自体は常に含まれる。
export const PENALTY_SECONDS_VALUES = [0, 1, 2, 3, 5, 10];

// ===== 対戦コードのビット構成（合計50bit→Base32 10文字、余りなくちょうど収まる）=====
//   codeFormatVersion : 3bit（0〜7）
//   songsDataVersion  : 5bit（0〜31。2026-08-07、ミスペナルティ選択の追加にあたり
//                        6bit→5bitへ縮小した。実際にはこれまで1回しか使っていないため
//                        32回分の余裕でも実用上十分と判断）
//   rngVersion        : 2bit（0〜3）
//   seed              : 24bit（0〜約1677万。対戦の公平性に暗号強度は不要なため、
//                        短さを優先してここまで削っている）
//   questionCountEnum : 3bit（0〜7、現在5種類使用）
//   categoryEnum      : 2bit（0〜3、現在3種類使用）
//   ruleEnum          : 2bit（0〜3、現在3種類使用）
//   penaltyEnum       : 3bit（0〜7、PENALTY_SECONDS_VALUESの6種類。ノーマル以外では未使用だが
//                        常にこの位置に含まれる）
//   checksum          : 6bit（入力ミス・改ざんの簡易検出用）
const CODE_FORMAT_VERSION_BITS = 3;
const SONGS_DATA_VERSION_BITS = 5;
const RNG_VERSION_BITS = 2;
const SEED_BITS = 24;
const QUESTION_COUNT_ENUM_BITS = 3;
const CATEGORY_ENUM_BITS = 2;
const RULE_ENUM_BITS = 2;
const PENALTY_ENUM_BITS = 3;
const CHECKSUM_BITS = 6;

function buildFieldList({ seed, questionCountValue, categoryFilterValue, rule, penaltySeconds }) {
  const questionCountEnum = QUESTION_COUNT_VALUES.indexOf(questionCountValue);
  const categoryEnum = CATEGORY_FILTER_VALUES.indexOf(categoryFilterValue);
  const ruleEnum = RULE_VALUES.indexOf(rule);
  const penaltyEnum = PENALTY_SECONDS_VALUES.indexOf(penaltySeconds);
  return [
    { value: CODE_FORMAT_VERSION, bits: CODE_FORMAT_VERSION_BITS },
    { value: SONGS_DATA_VERSION, bits: SONGS_DATA_VERSION_BITS },
    { value: RNG_VERSION, bits: RNG_VERSION_BITS },
    { value: seed, bits: SEED_BITS },
    { value: questionCountEnum, bits: QUESTION_COUNT_ENUM_BITS },
    { value: categoryEnum, bits: CATEGORY_ENUM_BITS },
    { value: ruleEnum, bits: RULE_ENUM_BITS },
    { value: penaltyEnum, bits: PENALTY_ENUM_BITS },
  ];
}

const FIELD_BITS_WITHOUT_CHECKSUM = [
  CODE_FORMAT_VERSION_BITS,
  SONGS_DATA_VERSION_BITS,
  RNG_VERSION_BITS,
  SEED_BITS,
  QUESTION_COUNT_ENUM_BITS,
  CATEGORY_ENUM_BITS,
  RULE_ENUM_BITS,
  PENALTY_ENUM_BITS,
];

// ===== 公開API =====

// 新しい対戦設定を作る（対戦を作成する側が呼ぶ）。シードはここで新しく決める。
// penaltySecondsはノーマルルールのミスペナルティ（秒/1ミス）。ハード・LOVE連チャンでは
// 使われないが、常に何らかの値を持たせておく（未指定時は「公式」の2秒）。
export function createBattleConfig({ questionCountValue, categoryFilterValue, rule, penaltySeconds = 2 }) {
  return {
    seed: generateRandomSeed(SEED_BITS),
    questionCountValue,
    categoryFilterValue,
    rule,
    penaltySeconds,
  };
}

// 対戦設定から、対戦コード（文字列）を作る。
export function encodeBattleCode(config) {
  const fields = buildFieldList(config);
  const checksum = computeChecksum(
    fields.map((field) => field.value),
    CHECKSUM_BITS
  );
  return packFieldsToBase32([...fields, { value: checksum, bits: CHECKSUM_BITS }]);
}

// 対戦コードを解析する。戻り値は次のいずれか：
//   { ok: true, config }                                     … 正常に読み取れた
//   { ok: false, reason: "invalid" }                          … 文字数・チェック値が不正（入力ミスの可能性）
//   { ok: false, reason: "version-mismatch", config }         … 読み取れたが、曲データのバージョンが違う
export function decodeBattleCode(rawCode) {
  const values = unpackBase32ToFields(rawCode, [...FIELD_BITS_WITHOUT_CHECKSUM, CHECKSUM_BITS]);
  if (!values) return { ok: false, reason: "invalid" };

  const [
    codeFormatVersion,
    songsDataVersion,
    rngVersion,
    seed,
    questionCountEnum,
    categoryEnum,
    ruleEnum,
    penaltyEnum,
    checksum,
  ] = values;

  const expectedChecksum = computeChecksum(
    [codeFormatVersion, songsDataVersion, rngVersion, seed, questionCountEnum, categoryEnum, ruleEnum, penaltyEnum],
    CHECKSUM_BITS
  );
  if (checksum !== expectedChecksum) return { ok: false, reason: "invalid" };
  if (codeFormatVersion !== CODE_FORMAT_VERSION) return { ok: false, reason: "invalid" };

  const questionCountValue = QUESTION_COUNT_VALUES[questionCountEnum];
  const categoryFilterValue = CATEGORY_FILTER_VALUES[categoryEnum];
  const rule = RULE_VALUES[ruleEnum];
  const penaltySeconds = PENALTY_SECONDS_VALUES[penaltyEnum];
  if (!questionCountValue || !categoryFilterValue || !rule || penaltySeconds === undefined) {
    return { ok: false, reason: "invalid" };
  }

  const config = { seed, questionCountValue, categoryFilterValue, rule, penaltySeconds };

  if (songsDataVersion !== SONGS_DATA_VERSION || rngVersion !== RNG_VERSION) {
    return { ok: false, reason: "version-mismatch", config };
  }

  return { ok: true, config };
}

// 表示・手入力用に、4文字ごとにハイフンを入れる。
export function formatBattleCodeForDisplay(code) {
  return formatCodeForDisplay(code);
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
