// 「質問AI」の文字の処理（2026-11-03新設・R11-C）。DOM に触れない。
// ・全体検索と同じ正規化（js/searchNormalize.js：ひらがな／カタカナ・全角／半角・大文字小文字・記号）を土台にする
// ・質問だけに要る処理を足す：異体字（髙→高・齋齊斉→斎・瀧→滝）、漢数字（十六枚目→16枚目）、序数（16th・第16弾）
// ・正規化は2通り：strict（異体字をそのまま）と loose（異体字をそろえる）。「齋藤」と「齊藤」を区別したいときは strict を使う
import { normalizeSearchText } from "./searchNormalize.js";

// 異体字（よく使う字にそろえる。名前の取り違えに注意：齋藤樹愛羅と齊藤なぎさは loose では同じになる）
const VARIANT_CHARS = [
  [/[髙]/g, "高"],
  [/[齋齊斉]/g, "斎"],
  [/[瀧]/g, "滝"],
  [/[﨑]/g, "崎"],
  [/[邊邉]/g, "辺"],
  [/[嶋]/g, "島"],
];

const KANJI_DIGITS = { 〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

// 漢数字（〜99）を数字に。「十六」→16、「二十一」→21、「三」→3
export function kanjiNumberToInt(text) {
  if (!/^[〇零一二三四五六七八九十]+$/.test(text)) return null;
  if (!text.includes("十")) return text.length === 1 ? KANJI_DIGITS[text] : Number([...text].map((char) => KANJI_DIGITS[char]).join(""));
  const [tens, ones] = text.split("十");
  const tensValue = tens === "" ? 1 : KANJI_DIGITS[tens];
  const onesValue = ones === "" ? 0 : KANJI_DIGITS[ones];
  if (tensValue === undefined || onesValue === undefined) return null;
  return tensValue * 10 + onesValue;
}

// 数を数える言葉の前の漢数字だけを数字にする（「一瞬」「十分」などの普通の言葉は変えない）
const COUNTER_PATTERN = /([〇零一二三四五六七八九十]{1,3})(枚目|番目|作目|弾|周年|曲目|年目|人)/g;
function convertKanjiCounters(text) {
  return text.replace(COUNTER_PATTERN, (whole, number, counter) => {
    const value = kanjiNumberToInt(number);
    return value === null ? whole : `${value}${counter}`;
  });
}

// 「＝LOVE」「イコラブ」などのグループ名（グループの名前として聞いているだけで、曲の「＝LOVE」ではない）
const GROUP_NAME_PATTERN = /[=＝][ 　]*(?:love|ｌｏｖｅ)|イコール[・･ 　]*ラブ|いこーる[・･ 　]*らぶ|イコラブ|いこらぶ/giu;

// 質問を正規化する。groupName：グループ名を消すか（既定は消す。曲名の判定では消さない）
export function normalizeQuestion(text, { loose = true, removeGroupName = true } = {}) {
  let value = String(text ?? "").normalize("NFKC");
  value = convertKanjiCounters(value);
  // 「第16弾」「第16回」→「16弾」
  value = value.replace(/第\s*(\d+)/g, "$1");
  if (removeGroupName) value = value.replace(GROUP_NAME_PATTERN, " ");
  if (loose) VARIANT_CHARS.forEach(([pattern, replacement]) => (value = value.replace(pattern, replacement)));
  return normalizeSearchText(value);
}

// 用語（辞書の言葉）を、質問と同じ形にする
export function normalizeTerm(text, { loose = true } = {}) {
  return normalizeQuestion(text, { loose, removeGroupName: false });
}

// 言葉の一覧（自然な書き方）を、質問と同じ形にそろえた一覧にする
export function normalizePhrases(list) {
  return [...new Set(list.map((text) => normalizeTerm(text)).filter(Boolean))];
}

export function includesAny(normalizedText, normalizedPhrases) {
  return normalizedPhrases.some((phrase) => normalizedText.includes(phrase));
}

// 「16枚目」「16番目」「16作目」「16th」「16thシングル」→ 16（作品の番号）
export function extractWorkNumber(normalizedText) {
  const match = /(\d{1,2})(?:枚目|番目|作目|弾|th|st|nd|rd)/.exec(normalizedText);
  return match ? Number(match[1]) : null;
}

// 「2024年」→ 2024（2017〜2039 年だけ。「24/7」などの曲名と取り違えない）
export function extractYear(normalizedText) {
  const match = /(20[1-3]\d)年?/.exec(normalizedText);
  return match ? Number(match[1]) : null;
}

// 「Type-B」「TypeB」「タイプB」「B タイプ」→ "B"
export function extractTypeLetter(normalizedText) {
  const match = /(?:type|たいぷ)([a-f])(?![a-z])|([a-f])(?:type|たいぷ)/.exec(normalizedText);
  return match ? (match[1] ?? match[2]).toUpperCase() : null;
}

// 質問から、見つけた言葉（start〜end）を取り除いた残り
export function removeSpans(text, spans) {
  const sorted = spans.slice().sort((a, b) => b.start - a.start);
  let result = text;
  sorted.forEach((span) => {
    result = `${result.slice(0, span.start)} ${result.slice(span.end)}`;
  });
  return result;
}
