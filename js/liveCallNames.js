// 新しいライブコール・新しいカラオケの「名前コール」の見た目（2026-10-31 live-unify）。
// 名前の判定そのものは、ここでは作らない。判定は次のどちらかを使い、このファイルは「どう見せるか」だけを受け持つ：
//   ・js/callNameColors.js の classifyCallNames（別の担当が作った、公式に確かめた名前・愛称の表）… 2026-10-31 に取り込んだ。ふだんはこちら
//   ・それが例外を出したときだけ、今までの判定（js/callEffects.js の memberIdForCallText：文字列がまるごと1人の名前・愛称と一致したときだけ）
// 【本人の決まり】
//   ・コール1件は最後まで1件。名前の部分に色を付けるのは「文字の装飾」だけ（区切って別々に光らせない・順番に光らせない）。
//   ・parts をつなげると、必ず元の文字列に戻る（文字を足したり消したりしない）。戻らないときは、色を付けずに元の文字列のまま出す。
//   ・「A or B」は同時に叫ぶとは扱わない（表示の上だけで候補を分けて見せる）。
//   ・名前ではない言葉（わーわー・オイ・Hey など）は通常の見た目。
import { MEMBERS } from "./data/members.js";
import { MEMBER_PROFILES } from "./data/memberProfiles.js";
import { buildMemberNameIndex, memberIdForCallText } from "./callEffects.js";
// 【2026-10-31】ブランチ call-names（タグ call-names-ready）を取り込んだ：公式に確かめた名前・愛称の表での判定を使う
import { classifyCallNames as classifyFromNameTable } from "./callNameColors.js";

export const NAME_KINDS = { NONE: "none", SINGLE: "single", MULTI: "multi", OR: "or" };

let fallbackIndex = null;
const memberColor = (id) => MEMBERS.find((member) => member.id === id)?.memberColor?.hex ?? null;

// 今までの判定（まるごと1人に一致したときだけ「1人」。それ以外は「なし」）
export function describeNameCallFallback(text) {
  const source = String(text ?? "");
  fallbackIndex ??= buildMemberNameIndex(MEMBERS, MEMBER_PROFILES);
  const memberId = memberIdForCallText(source, fallbackIndex);
  const color = memberId ? memberColor(memberId) : null;
  if (!memberId || !color) return { kind: NAME_KINDS.NONE, parts: [{ text: source }], members: [] };
  return { kind: NAME_KINDS.SINGLE, parts: [{ text: source, memberId, color }], members: [memberId] };
}

// 判定の結果が安全に使えるかを確かめて、そろえた形で返す（純粋関数）。
// 使えない（parts をつなげても元に戻らない・種類が分からない・色の無い名前）ときは「なし」に倒す
export function normalizeNameCallResult(text, result) {
  const source = String(text ?? "");
  const none = { kind: NAME_KINDS.NONE, parts: [{ text: source }], members: [] };
  if (!result || typeof result !== "object" || !Array.isArray(result.parts)) return none;
  const kind = Object.values(NAME_KINDS).includes(result.kind) ? result.kind : null;
  if (!kind) return none;
  if (result.parts.map((part) => String(part?.text ?? "")).join("") !== source) return none;
  if (kind === NAME_KINDS.NONE) return none;
  const parts = result.parts.map((part) => {
    const out = { text: String(part.text ?? "") };
    const color = part.color || (part.memberId ? memberColor(part.memberId) : null);
    if (part.memberId && color) {
      out.memberId = part.memberId;
      out.color = color;
    }
    return out;
  });
  const named = parts.filter((part) => part.memberId);
  if (!named.length) return none;
  const members = [...new Set(named.map((part) => part.memberId))];
  return { kind, parts, members };
}

// どちらの判定を使っているか（報告・テスト用）
export const NAME_CALL_SOURCE = typeof classifyFromNameTable === "function" ? "callNameColors" : "fallback";

// コールの文字列の名前コールの見え方（純粋関数。同じ文字列なら同じ結果）
const cache = new Map();
export function describeNameCall(text) {
  const source = String(text ?? "");
  if (cache.has(source)) return cache.get(source);
  let result;
  try {
    result = NAME_CALL_SOURCE === "callNameColors" ? normalizeNameCallResult(source, classifyFromNameTable(source)) : describeNameCallFallback(source);
  } catch {
    result = describeNameCallFallback(source);
  }
  if (cache.size > 2000) cache.clear();
  cache.set(source, result);
  return result;
}

// 光・枠に使う色（純粋関数）。1人：その色。複数：名前の順に並べた色（同じ人は1回）。「or」：最初の候補の色を光に、全員の色を枠に。なし：null
export function nameCallAccent(result) {
  if (!result || result.kind === NAME_KINDS.NONE) return null;
  const colors = [];
  for (const part of result.parts) if (part.color && !colors.includes(part.color)) colors.push(part.color);
  if (!colors.length) return null;
  // 枠・下線の色の組み合わせ（複数の色を自然につなぐ横のグラデーション。順番に光らせるのではなく、同時に全部見せる）
  const gradient = colors.length === 1 ? colors[0] : `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${Math.round((i / colors.length) * 100)}% ${Math.round(((i + 1) / colors.length) * 100)}%`).join(", ")})`;
  return { primary: colors[0], colors, gradient, kind: result.kind };
}

const OR_MARK = /(?<![A-Za-z])(?:or|OR|Or|／|\/)(?![A-Za-z])/g;
function appendWithOrMarks(target, text) {
  let last = 0;
  for (const match of text.matchAll(OR_MARK)) {
    if (match.index > last) target.appendChild(document.createTextNode(text.slice(last, match.index)));
    const sep = document.createElement("span");
    sep.className = "cx-name-sep";
    sep.textContent = match[0];
    target.appendChild(sep);
    last = match.index + match[0].length;
  }
  if (last < text.length) target.appendChild(document.createTextNode(text.slice(last)));
}

// target の中身を、名前の部分だけ色の付いた span にして描く（文字はそのまま。つなげると元の文字列）。
// 名前ではない部分は文字のまま。「or」のときは、名前ではない部分（「 or 」など）に印（cx-name-sep）を付けて控えめに見せる
export function renderNameCallText(target, text, result = describeNameCall(text)) {
  const source = String(text ?? "");
  target.textContent = "";
  if (!result || result.kind === NAME_KINDS.NONE) {
    target.textContent = source;
    return 0;
  }
  let named = 0;
  for (const part of result.parts) {
    if (part.color) {
      const span = document.createElement("span");
      span.className = "cx-name-part";
      span.dataset.memberId = part.memberId;
      span.style.setProperty("--name-color", part.color);
      span.textContent = part.text;
      target.appendChild(span);
      named += 1;
    } else if (result.kind === NAME_KINDS.OR) {
      // 「or」「／」の所だけに印（控えめに見せる）。「！」などほかの文字はそのまま
      appendWithOrMarks(target, part.text);
    } else {
      target.appendChild(document.createTextNode(part.text));
    }
  }
  return named;
}
