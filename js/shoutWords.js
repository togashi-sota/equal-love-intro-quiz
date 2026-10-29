// 「短い掛け声」（Hey！・Yeah！・はい！など）を、長さではなく「言葉」で見分けるための部品。
// デモ（ブラウザ）と集計スクリプト（node）の両方で使う。画面には触れない。
// 【2026-10-30 アプリへ移した】元：tools/call-effects-demo-2026-10-30/shoutWords.js（中身は同じ。後読みの正規表現だけ書き換え）
//
// 【そろえ方（正規化）】次の違いは同じ言葉として扱う
//   ・ひらがな／カタカナ（はい／ハイ）   ・全角／半角（ＨＥＹ／HEY、ﾊｲ／ハイ）   ・大文字／小文字（Hey／hey）
//   ・！／! などの記号                  ・のばす記号（ー／～／〜／~）         ・繰り返しの数（×4／×４／x4）
//   ・空白・改行
// 【近い書き方（同じ音らしいもの）】例：フゥフー と フッフー。自動では同じにしない（「要確認」に回す）。

// 確定の短い掛け声（グループ＝同じ言葉とみなす書き方の集まり）。forms は「そろえた後」の形。
// 実データ（2026-10-28 時点）で見つかった掛け声のうち、歌詞の一部ではない「間投詞・合図」だけを入れている。
// 入れていない言葉（ねえ・もう・やだ・沼 など、歌詞を返す合いの手）は、本人の確認待ち（classification.md）。
export const SHORT_SHOUT_GROUPS = [
  { id: "hey", label: "Hey／ヘイ", forms: ["hey", "へい", "へいへい", "heyhey"] },
  { id: "yeah", label: "Yeah／イェイ", forms: ["yeah", "いぇい", "いえい", "ohyeah"] },
  { id: "oh", label: "Oh", forms: ["oh"] },
  { id: "hai", label: "はい", forms: ["はい", "はいはい", "おはい"] },
  { id: "oi", label: "おい", forms: ["おい", "おいおい"] },
  { id: "fu", label: "フー", forms: ["ふ", "ふう"] },
  { id: "seeno", label: "せーの（合図）", forms: ["せの", "はいせの"] },
  { id: "yes", label: "Yes", forms: ["yes"] },
  { id: "go", label: "Go／Let's go", forms: ["go", "gogo", "letsgo"] },
  { id: "jump", label: "Jump", forms: ["jump"] },
];

const FORM_TO_GROUP = new Map(SHORT_SHOUT_GROUPS.flatMap((g) => g.forms.map((f) => [f, g.id])));

// カタカナ → ひらがな
export function toHiragana(text) {
  return String(text ?? "").replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

// 繰り返しの数（×4・x４ など）を取り除く。英単語の中の x は消さないよう、「×」か、記号・空白・行頭の直後の x だけ
// 【アプリへ移したときの変更（2026-10-30）】デモの後読み（(?<=…)）は古い iPhone（iOS 16.3 以前）の Safari で
// 読み込みエラーになるため、前の1文字も一緒に拾って残す書き方にした（当たる所はデモと同じ）。
const REPEAT_RE = /(×|(^|[!?\s])x)\s*[0-9]+/g;
const dropRepeat = (text, filler) => text.replace(REPEAT_RE, (match, head, before) => `${before ?? ""}${filler}`);

// 1つの言葉をそろえる（記号・空白・のばす記号・繰り返しの数を取り除き、ひらがな・小文字にする）
export function normalizeWord(text) {
  let s = String(text ?? "").normalize("NFKC").toLowerCase();
  s = dropRepeat(s, "");
  s = toHiragana(s);
  s = s.replace(/[ー～〜~\-‐－]/g, "");
  s = s.replace(/[!?！？.,、。・'"“”‘’()（）「」『』\s]/g, "");
  return s;
}

// コールの文面を「掛け声」の単位に分ける（！・空白・改行・読点で区切る）。それぞれをそろえた形で返す。
// 「Oh yeah！」のような2語の決まり文句は、つなげた形も試す（ohyeah）。
export function shoutTokens(text) {
  const nfkc = String(text ?? "").normalize("NFKC");
  const withoutRepeat = dropRepeat(nfkc, " ");
  return withoutRepeat
    .split(/[!?！？、。\s]+/)
    .map(normalizeWord)
    .filter(Boolean);
}

// 小さい字・「っ」の違いだけをならした「読みのキー」（近い書き方を探すため。自動では同じにしない）
const SMALL_TO_LARGE = { ぁ: "あ", ぃ: "い", ぅ: "う", ぇ: "え", ぉ: "お", ゃ: "や", ゅ: "ゆ", ょ: "よ", ゎ: "わ" };
export function readingKey(normalized) {
  return String(normalized ?? "")
    .replace(/っ/g, "")
    .replace(/[ぁぃぅぇぉゃゅょゎ]/g, (c) => SMALL_TO_LARGE[c]);
}

// 2つの文字列の編集距離（1文字の追加・削除・置き換えの回数）
export function editDistance(a, b) {
  const x = [...a];
  const y = [...b];
  const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]);
  for (let j = 1; j <= y.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= x.length; i += 1) {
    for (let j = 1; j <= y.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
  }
  return d[x.length][y.length];
}

// 掛け声1つを判定する：確定のグループ／近い書き方（要確認）／どれでもない
export function matchShoutToken(token) {
  const exact = FORM_TO_GROUP.get(token);
  if (exact) return { status: "sure", group: exact };
  // 「おいおいおい」「はいはいはい」のように、確定の形を2回以上くり返しただけのもの
  for (const [form, group] of FORM_TO_GROUP) {
    if (form.length >= 2 && token.length > form.length && token.length % form.length === 0 && token === form.repeat(token.length / form.length)) return { status: "sure", group };
  }
  const key = readingKey(token);
  for (const [form, group] of FORM_TO_GROUP) {
    const fk = readingKey(form);
    if (fk === key || (Math.min(fk.length, key.length) >= 2 && editDistance(fk, key) === 1)) return { status: "near", group, form };
  }
  return { status: "none" };
}

// コール全体の判定：全部の掛け声が確定の短い掛け声なら "sure"。1つでも近い書き方があれば "near"（要確認）
// ・「Oh yeah」のように2語で1つの決まり文句は、2語をつなげた形でも試す
export function classifyShoutText(text) {
  const tokens = shoutTokens(text);
  if (!tokens.length) return { status: "none", tokens };
  const joined = tokens.join("");
  const whole = matchShoutToken(joined);
  if (whole.status === "sure") return { status: "sure", groups: [whole.group], tokens };
  const results = tokens.map(matchShoutToken);
  if (results.every((r) => r.status === "sure")) return { status: "sure", groups: [...new Set(results.map((r) => r.group))], tokens };
  if (results.every((r) => r.status !== "none")) return { status: "near", groups: [...new Set(results.map((r) => r.group))], tokens, near: results.filter((r) => r.status === "near").map((r) => r.form) };
  return { status: "none", tokens };
}
