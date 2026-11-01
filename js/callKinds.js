// コールの「種類」の判定（2026-11-02 r9-fx 新設）。演出（js/callSpectacle.js）を種類ごとに変えるために、表示のときだけ使う。
// DOM に触れない純粋な関数だけを置く。同じ文字・同じ長さなら、いつも同じ結果。
//
// 【本人の依頼 REQUEST_R9】「全部のパターンが同じになっている。種類ごとに分ける」
//   A MIX（タイガー！ファイヤー！…・虎！火！…・ミョーホントゥスケ！化繊飛除去！…など、とても長いもの）
//   B 短い掛け声（おい！・Hey！・はい！）
//   C 名前コール（10人の名前・「超絶かわいい！○○！」・or）
//   D ふわふわ・あーふふー（カタカナ・ひらがな・小さい字の揺れも同じ系統）
//   E はいはい・連続の掛け声（「はい！はい！はいはいはい」「おい！×８」など、回数のあるもの）
//   F 特殊（イェッタイガー・ファイボワイパー）
//   G そのほか（全曲のコールを調べて足した種類）：口上（長いセリフ）・手拍子・1文字ずつ（L・O・V・E／カウント）・
//     動作の合図（タオル・ペンライトを上げる 等）・一緒に歌う（英語のフレーズ・ハミング）・ふつう（どれにも当てはまらない）
//
// 【守ること】
//   ・コールの文字・時刻・区切りは変えない。ここは「どう見せるか」を決めるだけ。
//     splitCallSegments が返す区切りは、つなげると元の文字列とまったく同じ（テストで保証）。
//   ・キーワードだけで決めない：MIX は「MIX の言葉が 3 種類以上」、連続は「同じ短い言葉の繰り返し・×回数」、
//     名前は確かめた名前の表（js/callNameColors.js）、口上は「8 文字以上の文」、手拍子は「👏 だけ」のように、
//     文字の並び（データの構造）と長さで決める。
//   ・迷うものは「ふつう」にする（理由 reason を返す。一覧は renewal-notes/r9-fx/kinds.md）。
//   ・名前と歌詞を混同しない：名前は callNameColors.js の判定（前後が区切りの所だけ）をそのまま使う。
//
// 【優先順位】（上から順に。複数の種類を含むものは、上の種類にして、下の種類の特徴は「beats」などの値で持つ）
//   1 手拍子（👏 と回数だけ）
//   2 MIX（MIX の言葉が 3 種類以上。または「うりゃ！おい！」と「いくぞ！」の両方）… イェッタイガーを含む長い MIX も MIX（最後で大きく）
//   3 特殊（イェッタイガー・ファイボワイパー。MIX の言葉が 3 種類未満のとき）
//   4 動作の合図（〜のセリフからの・振り回す・上げる・振りコピ・叫ぶ）… 叫ぶ言葉ではなく「すること」なので先に分ける
//   5 名前（確かめた名前の表で名前がある・または「◯◯！」だけ＝自分の推しの名前）
//   6 ふわふわ・あーふふー（ふわふわ・ふっふ・ふふっふ・ふうふう。長い文の中のものは口上のまま）
//   7 1文字ずつ（「・」で区切った 1〜2 文字が 3 つ以上・数のカウント）
//   8 連続（×2 以上・同じ短い言葉が 2 回以上・「はいはいはい」のような繰り返し。「！」で叫ぶもの）
//   9 口上（日本語 8 文字以上の文がある）
//  10 短い掛け声（8 文字ぶん以下〔英単語は 1 語 2 文字ぶん〕・「！」で叫ぶ。または「！」なしの日本語 4 文字以下の合いの手）
//  11 一緒に歌う（英字・ハングルの「！」の無いフレーズ）
//  12 ふつう（そのほか）
//  並びでの例外（classifyCallSequence）：前後のコール（1 秒以内）が両方とも口上なら、間の「ふつう」も口上（口上の途中の短い行）。
import { describeNameCall, NAME_KINDS } from "./liveCallNames.js";

export const CALL_KINDS = Object.freeze({
  MIX: "mix",
  SHOUT: "shout",
  NAME: "name",
  FUWA: "fuwa",
  REPEAT: "repeat",
  SPECIAL: "special",
  KOJO: "kojo",
  CLAP: "clap",
  SPELL: "spell",
  CUE: "cue",
  SING: "sing",
  NORMAL: "normal",
});

// 本人の依頼の A〜G との対応
export const CALL_KIND_GROUPS = Object.freeze({
  mix: "A",
  shout: "B",
  name: "C",
  fuwa: "D",
  repeat: "E",
  special: "F",
  kojo: "G",
  clap: "G",
  spell: "G",
  cue: "G",
  sing: "G",
  normal: "G",
});

export const CALL_KIND_LABELS = Object.freeze({
  mix: "MIX",
  shout: "短い掛け声",
  name: "名前コール",
  fuwa: "ふわふわ・あーふふー",
  repeat: "はいはい・連続",
  special: "特殊（イェッタイガー 等）",
  kojo: "口上・長いセリフ",
  clap: "手拍子",
  spell: "1文字ずつ・カウント",
  cue: "動作の合図",
  sing: "一緒に歌う",
  normal: "ふつう",
});

// ===== 文字のそろえ方（比べるためだけ。表示する文字は変えない） =====
const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
// 全角・半角・カタカナ・ひらがな・大文字小文字・波線の揺れをそろえる（NFKC：半角カナ→全角、全角英数→半角、！→!）
export function normalizeCallText(text) {
  const s = String(text ?? "").normalize("NFKC");
  return toHiragana(s).toLowerCase().replace(/[〜～]/g, "~");
}
// 空白・改行・記号を除いた「見える文字」
const PUNCT = /[\s!?！？、。,.・…♡()（）「」『』\[\]【】~ー\-=＝'’"]/g;
const visibleChars = (norm) => [...norm.replace(PUNCT, "")];

// MIX の言葉（そろえた文字で比べる）。種類の数を数える（同じ言葉の繰り返しは1種類）
const MIX_WORDS = [
  "たいがー", "ふぁいやー", "さいばー", "ふぁいばー", "だいばー", "ばいばー", "じゃーじゃー",
  "虎", "人造", "繊維", "海女", "振動", "化繊",
  "みょーほんとぅすけ", "化繊飛除去", "ふぁいぼー", "わいぱー",
];
// 「スーパーいおりターイム」は曲固有の決めのコール（名前を呼ぶコールではない：callNameDictionary.js の例外）。ド派手な特殊にまとめる
const SPECIAL_PATTERNS = [/(いぇ|いえ)ったいがー/g, /ふぁいぼわいぱー/g, /すーぱーいおりたー?いむ/g];
const UryaOi = /うりゃ!?\s*おい/;
const Ikuzo = /しゃ[~ー]*!?\s*いくぞ/;
const CUE_PATTERN = /(せりふからの|振り回す|振りまわす|上げる|振りこぴ|思いっきり叫ぶ)/;
const FUWA_PATTERN = /(ふわふわ|ふっふ|ふふっふ|ふうふう|ふぅふぅ)/;
const PLACEHOLDER = /[◯○〇]{2}/;
const CLAP = "👏";
const COUNT_WORDS = /^(?:[0-9]+|いち|にー|さん|し|un|deux|trois|uno|dos|tres|go)$/;

function countMixWords(norm) {
  let rest = norm;
  for (const re of SPECIAL_PATTERNS) rest = rest.replace(re, " ");
  return MIX_WORDS.filter((w) => rest.includes(w)).length;
}

// ===== 区切り（表示の区切り。つなげると元の文字列と同じ） =====
// mode "shout"：「！」「!」「？」の後ろ・改行・空白の並びで区切る（「虎(とら)！」は1つ）。区切りの空白・改行は前の区切りに付ける。
// mode "dot"：「・」と空白で区切る（L・O・V・E → L・／O・／V・／E）
export function splitCallSegments(text, mode = "shout") {
  const source = String(text ?? "");
  const chars = [...source];
  const segments = [];
  let current = "";
  const isEnd = mode === "dot" ? (ch) => ch === "・" || /\s/.test(ch) : (ch) => /[!！?？\n]/.test(ch) || /\s/.test(ch);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    current += ch;
    if (!isEnd(ch)) continue;
    // 続く記号・空白・回数（×４）は同じ区切りに含める
    while (i + 1 < chars.length && (/[!！?？\s・]/.test(chars[i + 1]) || chars[i + 1] === "×")) {
      if (chars[i + 1] === "×") {
        current += chars[++i];
        while (i + 1 < chars.length && /[0-9０-９]/.test(chars[i + 1])) current += chars[++i];
        continue;
      }
      current += chars[++i];
    }
    if (current.trim() === "" && segments.length) segments[segments.length - 1] += current;
    else segments.push(current);
    current = "";
  }
  if (current) {
    if (current.trim() === "" && segments.length) segments[segments.length - 1] += current;
    else segments.push(current);
  }
  // 見える文字の無い区切り（空白だけ）は前に付ける
  const out = [];
  for (const seg of segments) {
    if (out.length && visibleChars(normalizeCallText(seg)).length === 0) out[out.length - 1] += seg;
    else out.push(seg);
  }
  return out.length ? out : [source];
}

// ===== 回数（連続・手拍子） =====
// ×N：直前の大きな区切り（空白・改行）からのまとまりを N 回。同じ音の繰り返し（はいはいはい）は繰り返しの数。
const COUNT_SUFFIX = /×\s*([0-9]+)/;
function unitRepeats(unit) {
  // 「はいはいはい」＝「はい」×3（ちょうど割り切れる繰り返しのときだけ）
  const chars = [...unit];
  for (let p = 2; p <= chars.length / 2; p++) {
    if (chars.length % p) continue;
    const head = chars.slice(0, p).join("");
    if (head.repeat(chars.length / p) === unit) return { base: head, k: chars.length / p };
  }
  return { base: unit, k: 1 };
}

// 1つの「まとまり」（or で分けた候補の1つ）の回数と、単位の並び
function beatsOfGroup(norm) {
  const groups = norm.split(/[\s\n]+/).filter(Boolean);
  let beats = 0;
  const bases = [];
  let maxRepeat = 1;
  for (const g of groups) {
    const m = COUNT_SUFFIX.exec(g);
    const n = m ? Number(m[1]) : 1;
    const body = m ? g.slice(0, m.index) : g;
    const units = body.split(/[!?,、]+/).map((u) => u.replace(PUNCT, "")).filter(Boolean);
    if (!units.length) {
      if (m) beats += n;
      continue;
    }
    let inGroup = 0;
    for (const u of units) {
      const { base, k } = unitRepeats(u);
      inGroup += k;
      for (let i = 0; i < k * n; i++) bases.push(base);
      if (k > 1) maxRepeat = Math.max(maxRepeat, k);
    }
    beats += inGroup * n;
    if (n > 1) maxRepeat = Math.max(maxRepeat, n);
  }
  return { beats, bases, maxRepeat };
}

// 回数（純粋関数）：「はいせーの！　はーいはい！　はい！×４」→ 6。「おい！×８」→ 8。「👏 👏👏 👏」→ 4。or の候補は一番多いもの。
export function countCallBeats(text) {
  const norm = normalizeCallText(text);
  if (norm.includes(CLAP)) {
    const claps = [...norm].filter((ch) => ch === "👏").length;
    const m = COUNT_SUFFIX.exec(norm);
    return Math.max(1, claps * (m ? Number(m[1]) : 1));
  }
  const alternatives = norm.split(/\bor\b|\s+or|or\s+|／|\//).filter((s) => s.trim());
  return Math.max(1, ...alternatives.map((alt) => beatsOfGroup(alt).beats));
}

// ===== 判定 =====
// text：本人のコールの文字。options：{ type（データの種類：mix・member-call・callback・unique。参考だけ）, duration（本人の終了−開始。秒）, describe（名前の判定。テスト用に差し替えられる） }
// 戻り値：{ kind, group, reason, uncertain, beats, names: { kind, colors }, lead（名前の前の言葉の文字数）, oshi（◯◯＝自分の推し） }
export function classifyCallKind(text, { type = null, duration = null, describe = describeNameCall } = {}) {
  const source = String(text ?? "");
  const norm = normalizeCallText(source);
  const flat = norm.replace(/\s+/g, "");
  const vis = visibleChars(norm);
  const dur = Number.isFinite(duration) ? duration : null;
  const result = (kind, reason, extra = {}) => ({
    kind,
    group: CALL_KIND_GROUPS[kind],
    reason,
    uncertain: Boolean(extra.uncertain),
    beats: extra.beats ?? countCallBeats(source),
    names: extra.names ?? { kind: NAME_KINDS.NONE, colors: [] },
    lead: extra.lead ?? 0,
    oshi: Boolean(extra.oshi),
  });
  if (!vis.length && !norm.includes(CLAP)) return result(CALL_KINDS.NORMAL, "見える文字が無い", { uncertain: true });

  // 1 手拍子
  if (norm.includes(CLAP) && norm.replace(/👏|×\s*[0-9]+|\s/g, "") === "") return result(CALL_KINDS.CLAP, "👏 と回数だけ");

  // 2 MIX
  const mixCount = countMixWords(flat);
  if (mixCount >= 3) return result(CALL_KINDS.MIX, `MIX の言葉が ${mixCount} 種類`);
  if (UryaOi.test(flat) && Ikuzo.test(flat)) return result(CALL_KINDS.MIX, "「うりゃ！おい！」と「いくぞ！」");

  // 3 特殊
  if (SPECIAL_PATTERNS.some((re) => new RegExp(re.source).test(flat))) return result(CALL_KINDS.SPECIAL, "イェッタイガー・ファイボワイパー");

  // 4 動作の合図
  if (CUE_PATTERN.test(flat)) return result(CALL_KINDS.CUE, "することの説明（セリフからの・振り回す・上げる・振りコピ・叫ぶ）");

  // 5 名前
  let names = { kind: NAME_KINDS.NONE, colors: [] };
  let lead = 0;
  try {
    const described = describe(source);
    if (described && described.kind && described.kind !== NAME_KINDS.NONE) {
      const colors = [];
      for (const part of described.parts ?? []) if (part.color && !colors.includes(part.color)) colors.push(part.color);
      if (colors.length) {
        names = { kind: described.kind, colors };
        const first = (described.parts ?? []).findIndex((part) => part.color);
        lead = first > 0 ? visibleChars(normalizeCallText(described.parts.slice(0, first).map((p) => p.text).join(""))).length : 0;
      }
    }
  } catch {
    names = { kind: NAME_KINDS.NONE, colors: [] };
  }
  const sentences = norm.split(/[!?、,。\n]+/).map((s) => visibleChars(s).length);
  const longestSentence = Math.max(0, ...sentences);
  if (names.colors.length) {
    // 名前の前の言葉が長い文（口上）なら、口上の中の名前（名前が主役ではない）
    if (lead >= 9) return result(CALL_KINDS.KOJO, "名前の前に長い文（口上の中の名前）", { names, lead, uncertain: true });
    return result(CALL_KINDS.NAME, `名前（${names.kind}）`, { names, lead, beats: countCallBeats(source) });
  }
  if (PLACEHOLDER.test(norm) && vis.filter((ch) => !/[◯○〇]/.test(ch)).length === 0) {
    return result(CALL_KINDS.NAME, "「◯◯！」＝自分の推しの名前", { oshi: true });
  }

  // 文の長さ（英字は数えない：「Let's go Together」は文ではなく掛け声）。空白・改行・「！」「、」で区切った1つの文の、日本語の文字の数
  const longestJp = Math.max(0, ...norm.split(/[!?、,。\s]+/).map((s) => visibleChars(s).filter((ch) => /[ぁ-んァ-ヶ一-龠々◯○〇]/.test(ch)).length));

  // 6 ふわふわ・あーふふー（長い文の中の「あーフフッフー」は口上のまま）
  if (FUWA_PATTERN.test(flat) && longestJp < 8) return result(CALL_KINDS.FUWA, "ふわふわ・ふっふ・ふふっふ・ふうふう");

  // 7 1文字ずつ・カウント
  const dotUnits = norm.split(/[・\s]+/).map((u) => u.replace(PUNCT, "")).filter(Boolean);
  const dotted = norm.includes("・") && dotUnits.filter((u) => [...u].length <= 2).length >= 3;
  const countUnits = norm.split(/[\s!.、,]+/).map((u) => u.replace(PUNCT, "")).filter(Boolean);
  const counting = countUnits.length >= 3 && countUnits.filter((u) => COUNT_WORDS.test(u)).length >= 3;
  if (dotted) return result(CALL_KINDS.SPELL, "「・」で区切った1文字ずつ", { beats: dotUnits.filter((u) => [...u].length <= 2).length });
  if (counting) return result(CALL_KINDS.SPELL, "数のカウント", { beats: countUnits.filter((u) => COUNT_WORDS.test(u)).length });

  // 8 連続（叫ぶもの：「！」・×回数。同じ短い言葉が 2 回以上・「はいはいはい」のような繰り返し）
  const shouty = /[!?]/.test(norm) || COUNT_SUFFIX.test(norm);
  const { beats, bases, maxRepeat } = beatsOfGroup(norm);
  const baseCounts = new Map();
  for (const b of bases) baseCounts.set(b, (baseCounts.get(b) ?? 0) + 1);
  const repeated = [...baseCounts.entries()].some(([b, n]) => n >= 2 && [...b].length <= 6);
  if (shouty && (maxRepeat >= 2 || repeated) && beats >= 2) return result(CALL_KINDS.REPEAT, `同じ言葉の繰り返し・回数（${beats} 回）`, { beats });

  // 9 口上（8 文字以上の文）
  if (longestJp >= 8) return result(CALL_KINDS.KOJO, `${longestJp} 文字の文`);

  // 10 短い掛け声（長く伸ばすもの「＝LOVE！」3 秒 なども、言葉が短ければ短い掛け声：一瞬で飛び出し、終わりまで保つ）
  const latinWords = (norm.match(/[a-z][a-z']*/g) ?? []).length;
  const jpChars = vis.filter((ch) => !/[a-z0-9]/.test(ch)).length;
  const size = jpChars + latinWords * 2;
  if (shouty && size <= 8) return result(CALL_KINDS.SHOUT, `短い叫び（${size}）`);
  if (!shouty && latinWords === 0 && jpChars > 0 && jpChars <= 4 && (dur === null || dur <= 2.5)) return result(CALL_KINDS.SHOUT, "短い合いの手（「！」なし）");

  // 11 一緒に歌う（英字・ハングルの「！」の無いフレーズ）
  if (!shouty && (latinWords > 0 || /[가-힣]/.test(norm))) return result(CALL_KINDS.SING, "「！」の無い英語などのフレーズ");

  // type が mix で長いのに、MIX の言葉が見つからないもの（念のため。今の完成版には無い）
  if (type === "mix" && dur !== null && dur >= 4) return result(CALL_KINDS.MIX, "データの種類が mix・4 秒以上", { uncertain: true });

  // 12 ふつう
  return result(CALL_KINDS.NORMAL, shouty ? `長めの叫び（${size}）` : "どれにも当てはまらない", { uncertain: true });
}

// 並び（1曲のコールの列）で判定する（純粋関数）。calls：[{ text, type, start, end }]（start の昇順）。
// 1件ずつの判定に、並びの例外を足す：
//   ・前後のコール（間が 1 秒以内）が両方とも口上なら、間の「ふつう」も口上（口上の途中の短い行）
//   ・短い掛け声が続く（前の終わりから 2.5 秒以内）とき、何番目か（run）を持つ。1回ごとに位置を変えるため
// 戻り値：calls と同じ順の判定の配列（classifyCallKind の結果に run・runLen を足したもの）
export const SHOUT_RUN_GAP_SEC = 2.5;
export function classifyCallSequence(calls, options = {}) {
  const list = Array.isArray(calls) ? calls : [];
  const out = list.map((call) => ({ ...classifyCallKind(call?.text, { ...options, type: call?.type ?? null, duration: Number.isFinite(call?.end - call?.start) ? call.end - call.start : null }), run: 0, runLen: 1 }));
  const near = (a, b) => Number.isFinite(a?.end) && Number.isFinite(b?.start) && b.start - a.end <= 1;
  for (let i = 1; i < out.length - 1; i++) {
    if (out[i].kind !== CALL_KINDS.NORMAL) continue;
    if (out[i - 1].kind === CALL_KINDS.KOJO && out[i + 1].kind === CALL_KINDS.KOJO && near(list[i - 1], list[i]) && near(list[i], list[i + 1])) {
      out[i] = { ...out[i], kind: CALL_KINDS.KOJO, group: CALL_KIND_GROUPS.kojo, reason: "前後が口上（口上の途中の行）", uncertain: false };
    }
  }
  let runStart = 0;
  for (let i = 0; i <= out.length; i++) {
    const linked = i < out.length && i > 0 && out[i].kind === CALL_KINDS.SHOUT && out[i - 1].kind === CALL_KINDS.SHOUT && list[i].start - list[i - 1].end <= SHOUT_RUN_GAP_SEC;
    if (linked) continue;
    for (let j = runStart; j < i; j++) {
      out[j].run = j - runStart;
      out[j].runLen = i - runStart;
    }
    runStart = i;
  }
  return out;
}
