// 全体検索（js/appSearchIndex.js）と歌詞検索（js/lyricsSearch.js）が共通で使う、
// 検索用の文字の正規化・誤字の近さの判定（2026-10-23新設）。DOMに一切触れない。
//
// 曲名検索の normalizeForSearch()（js/songSearch.js）をそのまま土台にして、
// 「全角英字・半角カナ（NFKC）」「残った記号・絵文字」の揺れだけを追加で吸収する。
// 曲名検索の仕様そのもの（songSearch.js）は変えない（収録曲一覧などの既存の検索結果を変えないため）。
import { normalizeForSearch } from "./songSearch.js";

// 文字・数字・長音（ー）以外（記号・空白・絵文字など）は検索では無視する
const IGNORED_CHAR_PATTERN = /[^\p{L}\p{N}ー]/u;

// 濁点・半濁点（半角の ﾞ ﾟ と、結合用の濁点・半濁点）。直前の文字と一緒に正規化しないと「ｶﾞ」が「か」になってしまう
const VOICED_MARK_CODES = new Set([0xff9e, 0xff9f, 0x3099, 0x309a]);

// 文字（1〜2コードポイント）を正規化した結果（0文字以上）を返す
function normalizeChars(chars) {
  // NFKC：全角英字→半角、半角カナ→全角、＝→= など。1文字が複数文字になることもある（例：㈱）
  return [...normalizeForSearch(chars.normalize("NFKC"))].filter((piece) => !IGNORED_CHAR_PATTERN.test(piece)).join("");
}

// よく出る文字（ひらがな・カタカナ・漢字・半角英数字）は、上の normalizeChars() と同じ結果をすばやく返す
// （歌詞検索で全曲の歌詞を1文字ずつ正規化するため。結果が変わらない文字だけを近道にしている）
function normalizeCommonChar(code, char) {
  if ((code >= 0x3041 && code <= 0x3096) || code === 0x30fc) return char; // ひらがな・長音
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCharCode(code - 0x60); // カタカナ→ひらがな
  if (code >= 0x4e00 && code <= 0x9fff) return char; // 漢字（よく使う範囲）
  if ((code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39)) return char; // 半角英小文字・数字
  if (code >= 0x41 && code <= 0x5a) return String.fromCharCode(code + 0x20); // 半角英大文字→小文字
  return null;
}

// 文字列を検索用に正規化し、正規化後の各文字（UTF-16の1単位ずつ）が「元の文字列の何文字目（UTF-16の位置）」
// から来たかも返す。歌詞検索で、正規化した文字列で見つけた一致箇所を、元の歌詞のどこにハイライトするかへ戻すために使う。
export function normalizeWithIndexMap(text) {
  const source = String(text ?? "");
  let normalized = "";
  const map = [];
  const mapEnd = [];
  let offset = 0;
  while (offset < source.length) {
    const code = source.codePointAt(offset);
    let length = code > 0xffff ? 2 : 1;
    const nextCode = source.codePointAt(offset + length);
    let piece;
    if (nextCode !== undefined && VOICED_MARK_CODES.has(nextCode)) {
      // 「ｶ」＋「ﾞ」→「ガ」のように、濁点と前の文字をまとめて1文字として扱う
      length += 1;
      piece = normalizeChars(source.slice(offset, offset + length));
    } else {
      const char = source.slice(offset, offset + length);
      piece = normalizeCommonChar(code, char) ?? normalizeChars(char);
    }
    normalized += piece;
    // サロゲートペアの文字（𠮷など）は2単位になるため、単位ごとに元の位置を記録する（ハイライト位置のずれ防止）
    // mapEnd は元の文字の終わり（濁点をまとめた「ｶﾞ」なら2文字分）。ハイライトを濁点まで含めるために使う
    for (let unitIndex = 0; unitIndex < piece.length; unitIndex += 1) {
      map.push(offset);
      mapEnd.push(offset + length);
    }
    offset += length;
  }
  return { normalized, map, mapEnd, sourceLength: source.length };
}

export function normalizeSearchText(text) {
  return normalizeWithIndexMap(text).normalized;
}

// 2つの文字列の編集距離（1文字の追加・削除・置き換えの回数）が maxDistance 以内ならその距離を、
// 超えるなら null を返す（軽微な誤字の候補探し用。maxDistance を超えた時点で計算を打ち切る）。
export function editDistanceWithin(a, b, maxDistance) {
  if (Math.abs(a.length - b.length) > maxDistance) return null;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + cost);
      rowMin = Math.min(rowMin, current[j]);
    }
    if (rowMin > maxDistance) return null;
    previous = current;
  }
  const distance = previous[b.length];
  return distance <= maxDistance ? distance : null;
}

// 誤字として許す回数。短い語ほど厳しくする（2文字以下は誤字扱いしない＝不自然な候補を出さないため）
export function allowedTypoCount(normalizedLength) {
  if (normalizedLength <= 2) return 0;
  if (normalizedLength <= 6) return 1;
  return 2;
}

// 長い文章（歌詞）の中に、検索語と編集距離 maxDistance 以内で一致する部分があるかを探す
// （近似部分一致。Sellersのアルゴリズム）。見つかれば最も近い部分の { distance, end }（end は一致部分の
// 最後の文字の次の位置）を返し、無ければ null。
export function findApproximateSubstring(text, pattern, maxDistance) {
  if (pattern.length === 0) return null;
  let previous = Array.from({ length: pattern.length + 1 }, (_, index) => index);
  let best = null;
  for (let j = 1; j <= text.length; j += 1) {
    const current = [0];
    for (let i = 1; i <= pattern.length; i += 1) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1;
      current[i] = Math.min(previous[i] + 1, current[i - 1] + 1, previous[i - 1] + cost);
    }
    const distance = current[pattern.length];
    if (distance <= maxDistance && (best === null || distance < best.distance)) {
      best = { distance, end: j };
      if (distance === 0) break;
    }
    previous = current;
  }
  return best;
}
