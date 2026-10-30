// 名前コールの判定（2026-10-31新設）：コール1件の文字列から、メンバーの名前の所を見つけてメンバーカラーを付ける。
// DOM に触れない純粋な関数だけを置く（ライブコール・カラオケの画面側が、返した値を使って色を付ける）。
//
// 【守ること】
//   ・文字列は1文字も変えない。返す parts の text を順につなげると、元の text とまったく同じになる。
//   ・コール1件は1件のまま。ここでは「どこが名前か」を返すだけで、時刻を分けたり作ったりしない。
//   ・確信できないものは名前にしない。名前は対応表（js/data/callNameDictionary.js）にある書き方だけで、
//     しかも前後が区切り（！・空白・改行・×４・or など）になっている所だけ。長い言葉の一部は名前にしない
//     （例：「楽しみましょこ」の「しょこ」、「いおりのセリフ」の「いおり」）。
//
// kind（コール全体の種類）：
//   "none"   … 名前が無い（わーわー・オイ・Hey・フッフー など）
//   "single" … 1人（同じ人を何回呼んでも1人）
//   "multi"  … 2人以上を、候補ではなく並べて呼ぶ
//   "or"     … 「A or B」「A／B」のように、候補を並べた形（同時に叫ぶのではない。表示の上で候補を分けるだけ）
//     本人の完成版コールの書き方：「みりにゃ！ or ひとみ！」「はなちゃん！×４orしょこちゃん！×４」「はなちゃん!orきあら!orさなつん！」

import { MEMBERS } from "./data/members.js";
import { CALL_NAME_ENTRIES, NOT_NAME_PHRASES, NAME_LEAD_WORDS } from "./data/callNameDictionary.js";

// 区切りとして扱う文字（名前の前後にこれがあれば、名前として切り出してよい）
const DELIMITER_CHARS = new Set([..."！!？?、，,。.．・ 　\n\r\t()（）「」『』[]［］～〜♡…"]);
// 「×４」「×16」のような回数の書き方
const COUNT_PATTERN = /^×[0-9０-９]+/;
// 候補を並べる記号（「or」は前後が英字でないときだけ。「Forever」の「or」を拾わないため）
const OR_SYMBOLS = ["／", "/"];

function hiraganaToKatakana(text) {
  return text.replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

function isAsciiLetter(ch) {
  return typeof ch === "string" && /^[A-Za-z]$/.test(ch);
}

// メンバーID → メンバーカラー（members.js の値をそのまま使う）
const COLOR_BY_MEMBER = new Map(MEMBERS.map((member) => [member.id, member.memberColor?.hex ?? null]));

// 書き方 → メンバーID。ひらがなを含む書き方は、カタカナの書き方も足す。長い書き方から先に試す（最長一致）。
function buildNameForms() {
  const formToMember = new Map();
  for (const entry of CALL_NAME_ENTRIES) {
    if (!COLOR_BY_MEMBER.has(entry.memberId)) continue; // members.js に無い人は扱わない
    for (const form of entry.forms) {
      formToMember.set(form, entry.memberId);
      const katakana = hiraganaToKatakana(form);
      if (!formToMember.has(katakana)) formToMember.set(katakana, entry.memberId);
    }
  }
  return [...formToMember.entries()]
    .map(([form, memberId]) => ({ form, memberId }))
    .sort((a, b) => b.form.length - a.form.length);
}

const NAME_FORMS = buildNameForms();
const EXCEPTIONS = [...NOT_NAME_PHRASES].sort((a, b) => b.length - a.length);
const LEAD_WORDS = [...NAME_LEAD_WORDS].sort((a, b) => b.length - a.length);

// 前の区切りから今までの文字が「名前の前に付いてよい言葉」だけでできているか（「あー」「頑張れ頑張れ」など）
function isOnlyLeadWords(run) {
  let rest = run;
  while (rest.length > 0) {
    const word = LEAD_WORDS.find((w) => rest.startsWith(w));
    if (!word) return false;
    rest = rest.slice(word.length);
  }
  return true;
}

// text の at の位置に「or」の区切りがあるか。あれば長さを返す
function orMarkerLengthAt(text, at) {
  for (const symbol of OR_SYMBOLS) {
    if (text.startsWith(symbol, at)) return symbol.length;
  }
  const two = text.slice(at, at + 2);
  if (two.toLowerCase() === "or" && !isAsciiLetter(text[at - 1]) && !isAsciiLetter(text[at + 2])) return 2;
  return 0;
}

// 名前の直後が区切りになっているか（文字列の終わり・区切り文字・×４・or）
function isRightBoundary(text, at) {
  if (at >= text.length) return true;
  if (DELIMITER_CHARS.has(text[at])) return true;
  if (text[at] === "×") return true;
  return orMarkerLengthAt(text, at) > 0;
}

// at の位置から始まる名前を探す。見つかれば { memberId, length }（後ろの伸ばし「ー」も名前に含める）
function matchNameAt(text, at) {
  for (const { form, memberId } of NAME_FORMS) {
    if (!text.startsWith(form, at)) continue;
    let end = at + form.length;
    while (text[end] === "ー") end += 1; // 「きあらー！」のような伸ばし
    if (isRightBoundary(text, end)) return { memberId, length: end - at };
  }
  return null;
}

// 文字列を、区切り・候補の記号・名前・それ以外に分けながら左から読む
function scanTokens(text) {
  const tokens = []; // { kind: "plain" | "name" | "or", text, memberId? }
  let index = 0;
  let runSinceBoundary = ""; // 直前の区切りから今までの、名前でない文字
  const pushPlain = (piece, isBoundary) => {
    tokens.push({ kind: "plain", text: piece });
    runSinceBoundary = isBoundary ? "" : runSinceBoundary + piece;
  };
  while (index < text.length) {
    // 1) 例外の言葉は丸ごと名前ではない
    const exception = EXCEPTIONS.find((phrase) => text.startsWith(phrase, index));
    if (exception) {
      pushPlain(exception, false);
      index += exception.length;
      continue;
    }
    // 2) 候補の区切り（or ／）
    const orLength = orMarkerLengthAt(text, index);
    if (orLength > 0) {
      tokens.push({ kind: "or", text: text.slice(index, index + orLength) });
      runSinceBoundary = "";
      index += orLength;
      continue;
    }
    // 3) 回数（×４）
    const count = COUNT_PATTERN.exec(text.slice(index));
    if (count) {
      pushPlain(count[0], true);
      index += count[0].length;
      continue;
    }
    // 4) 区切り文字
    if (DELIMITER_CHARS.has(text[index]) || text[index] === "×") {
      pushPlain(text[index], true);
      index += 1;
      continue;
    }
    // 5) 名前（前が区切り、または「あー」「頑張れ」などの言葉だけのとき）
    if (runSinceBoundary === "" || isOnlyLeadWords(runSinceBoundary)) {
      const name = matchNameAt(text, index);
      if (name) {
        tokens.push({ kind: "name", text: text.slice(index, index + name.length), memberId: name.memberId });
        runSinceBoundary = "";
        index += name.length;
        continue;
      }
    }
    // 6) それ以外の1文字（サロゲートペアは2つまとめて進める。文字列は変えない）
    const code = text.charCodeAt(index);
    const step = code >= 0xd800 && code <= 0xdbff && index + 1 < text.length ? 2 : 1;
    pushPlain(text.slice(index, index + step), false);
    index += step;
  }
  return tokens;
}

// コール1件の文字列を判定する。
// 戻り値：{ kind, parts: [{ text, memberId?, color? }], members: [{ memberId, color }] }
export function classifyCallNames(text) {
  const source = typeof text === "string" ? text : "";
  const tokens = scanTokens(source);

  // parts：名前の所だけ memberId・color を持つ。名前でない所は隣同士をまとめる（つなげると元に戻る）
  const parts = [];
  for (const token of tokens) {
    if (token.kind === "name") {
      parts.push({ text: token.text, memberId: token.memberId, color: COLOR_BY_MEMBER.get(token.memberId) });
      continue;
    }
    const last = parts[parts.length - 1];
    if (last && !last.memberId) last.text += token.text;
    else parts.push({ text: token.text });
  }

  // members：出てきた順に1人1回
  const members = [];
  const seen = new Set();
  for (const part of parts) {
    if (!part.memberId || seen.has(part.memberId)) continue;
    seen.add(part.memberId);
    members.push({ memberId: part.memberId, color: part.color });
  }

  // or：名前と名前の間に「or」「／」があるとき（2人以上のとき）
  let hasOrBetweenNames = false;
  let sawName = false;
  let orAfterName = false;
  for (const token of tokens) {
    if (token.kind === "name") {
      if (sawName && orAfterName) hasOrBetweenNames = true;
      sawName = true;
      orAfterName = false;
    } else if (token.kind === "or" && sawName) {
      orAfterName = true;
    }
  }

  let kind = "none";
  if (members.length === 1) kind = "single";
  else if (members.length >= 2) kind = hasOrBetweenNames ? "or" : "multi";

  return { kind, parts, members };
}

// 光の色に使う値：1人ならその色（文字列）、複数（multi・or）なら色の並び（配列）、名前が無ければ null。
export function memberAccentStyle(result) {
  const colors = (result?.members ?? []).map((member) => member.color).filter((color) => typeof color === "string" && color !== "");
  if (colors.length === 0) return null;
  if (colors.length === 1) return colors[0];
  return colors;
}
