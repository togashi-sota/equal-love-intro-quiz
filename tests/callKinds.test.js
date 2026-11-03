// 【2026-11-02 r9-fx 新設】コールの種類の判定（js/callKinds.js）と、種類ごとの演出（js/callSpectacle.js）の回帰テスト。
// 本物のコール本文は使わない（ダミーと、一般の掛け声・MIX の言葉・名前の表にある呼び名だけ）。
//   K1. 種類ごとの代表が正しく分かれる（A MIX・B 短い掛け声・C 名前・D ふわふわ・E 連続・F 特殊・G そのほか）
//   K2. 表記の揺れ（カタカナ・ひらがな・半角・小さい字）が同じ種類になる
//   K3. 誤分類の例外（名前と歌詞を混同しない・長い文の中のふわふわは口上・1 文字の繰り返しは連続にしない・迷うものはふつう）
//   K4. 本文の不変：判定・計画で本文・開始・終了を変えない
//   K5. 並びの例外（前後が口上なら口上・短い掛け声が続くときの番号）
//   K6. 演出の維持と終わり：どの種類も始まりから終わりまで文字と会場が出たまま（途中で弱くならない）・終わったら消える
//   K7. 種類ごとの見せ方：MIX は全文を 1 つの塊で／短い掛け声は 1 件ごとに 左→右→中央→全体／名前は始まりから全部／ふわふわは弾む
//   K8. 【2026-11-03 R12】ペンライトは固定（どの時刻でも向き・位置が同じ）。変わるのは色だけ
//   R12. 【2026-11-03 R12】本人が区切った 1 件を、1 つの塊として、その件の開始〜終了で出す（MIX・連続の「うりゃ！おい！」で、
//        画面に出る塊の数と時刻が承認済みの件と 1 対 1。1 件の途中で文字が変わらない・1 件の途中の時刻に光を作らない）。
//        本人の時刻で 2 件が重なるときは、重なっている間だけ両方を全文で（後の件が主・先の件が補助。0.2 秒未満の重なりは 1 件のまま）
//   K9. 画面全体の光は、どの 1 秒の中でも 3 回まで（全種類を混ぜて）
//   K10. 画面の部品：種類（data-fx）・1 件の全文・ペンライトの向きは作ったときのまま・一時停止で消える
import { assertEqual } from "./test-utils.js";
import { CALL_KINDS, CALL_KIND_GROUPS, classifyCallKind, classifyCallSequence, countCallBeats, normalizeCallText } from "../js/callKinds.js";
import {
  planSpectacle,
  spectacleStateAt,
  penlightPoseAt,
  fxCrowdColors,
  createSpectacle,
  SP_SHOUT_SPOTS,
  SP_TAIL_SEC,
  SP_FLASH_MAX_PER_SEC,
} from "../js/callSpectacle.js";

const kindOf = (text, opts) => classifyCallKind(text, opts).kind;
const MIX_A = "ダミー！オイ！ダミー！オイ！ 👏 👏👏 👏\nしゃ～いくぞ！ タイガー！ファイヤー！サイバー！ファイバー！ ダイバー！バイバー！ジャージャー！";
const MIX_B = "虎(とら)！火(ひ)！人造(じんぞう)！繊維(せんい)！ 海女(あま)！振動(しんどう)！化繊(かせん)！";
const MIX_C = "ミョーホントゥスケ！ 化繊飛除去！ ジャージャー！ ファイボー！ ワイパー！";

function runRepresentativeTests() {
  console.log("--- r9 K1：種類ごとの代表 ---");
  // A MIX
  assertEqual([kindOf(MIX_A), kindOf(MIX_B), kindOf(MIX_C)], ["mix", "mix", "mix"], "K1: A MIX（タイガー！… ／虎！火！… ／ミョーホントゥスケ！化繊飛除去！…）");
  assertEqual(kindOf("ﾀｲｶﾞｰﾌｧｲﾔｰｻｲﾊﾞｰﾌｧｲﾊﾞｰ ﾀﾞｲﾊﾞｰﾊﾞｲﾊﾞｰｼﾞｬｰｼﾞｬｰ イエッタイガー"), "mix", "K1: A 半角カナの MIX（最後にイエッタイガーがあっても MIX）");
  assertEqual(kindOf("⏎うりゃ!おい! ×4👏　👏👏　👏 ⏎しゃー!いくぞー!".replace(/⏎/g, "\n")), "mix", "K1: A 「うりゃ！おい！」と「いくぞ！」の両方（MIX の言葉が少なくても）");
  // B 短い掛け声
  assertEqual(["オイ！", "おい！", "Hey！", "はい！", "Yeah！", "JUMP！", "ダミー！"].map((t) => kindOf(t)), Array(7).fill("shout"), "K1: B 短い掛け声");
  assertEqual(kindOf("ダミー！ダメ！"), "shout", "K1: B 2 つでも短ければ短い掛け声");
  // C 名前
  assertEqual(["はなちゃん！", "超絶かわいい！はなちゃん！", "きあら！ or しょこちゃん！ or さなつん！", "ひーとみ！×４", "あーさなつん！"].map((t) => kindOf(t)), Array(5).fill("name"), "K1: C 名前（1人・超絶かわいい！・or・×４・あー）");
  assertEqual(classifyCallKind("◯◯！").kind === "name" && classifyCallKind("◯◯！").oshi, true, "K1: C 「◯◯！」は自分の推しの名前（色は全員）");
  assertEqual(classifyCallKind("超絶かわいい！はなちゃん！").lead > 0 && classifyCallKind("はなちゃん！").lead === 0, true, "K1: C 名前の前の言葉（超絶かわいい！）の長さを持つ");
  // D ふわふわ・あーふふー
  assertEqual(["ふわふわ！", "あーフッフー！", "おーふっふー！", "フッフー", "フゥフゥ", "あ～ふふっふー！"].map((t) => kindOf(t)), Array(6).fill("fuwa"), "K1: D ふわふわ・あーふふー");
  // E 連続
  assertEqual(["はいせーの！　はーいはい！　はい！×４", "ハイ！ハイ！ハイハイハイ！", "おい！×８", "おい！おい！おい！おい！", "Go！Go！", "うりゃ！おい！×１６"].map((t) => kindOf(t)), Array(6).fill("repeat"), "K1: E はいはい・連続・×回数");
  // F 特殊
  assertEqual(["イェッタイガー！", "イエッタイガー！", "ファイボワイパー", "イェッタイガーファイボワイパー！", "スーパーいおりターイム！！！"].map((t) => kindOf(t)), Array(5).fill("special"), "K1: F 特殊（イェッタイガー・ファイボワイパー・曲固有の決め）");
  // G そのほか
  assertEqual(kindOf("ダミーのことばがあるんだよ！"), "kojo", "K1: G 口上（8 文字以上の文）");
  assertEqual(kindOf("👏  👏   　👏👏👏"), "clap", "K1: G 手拍子（👏 だけ）");
  assertEqual([kindOf("L・O・V・E"), kindOf("ア・イ・シ・テ・ル！"), kindOf("3 2 1 Go！"), kindOf("１.２.３.４！")], ["spell", "spell", "spell", "spell"], "K1: G 1 文字ずつ・カウント");
  assertEqual([kindOf("ダミーを振り回す！"), kindOf("ダミーのセリフからの　あ～")], ["cue", "cue"], "K1: G 動作の合図");
  assertEqual([kindOf("Miss you"), kindOf("wow wow wow"), kindOf("La-la,la-la")], ["sing", "sing", "sing"], "K1: G 一緒に歌う（「！」の無い英語のフレーズ）");
  assertEqual(kindOf("ダミーの体操だ！いっくよー！"), "normal", "K1: G どれにも当てはまらないものは「ふつう」");
  assertEqual(classifyCallKind("ダミーの体操だ！いっくよー！").uncertain, true, "K1: ふつうは「迷うもの」として印が付く");
  const groups = Object.fromEntries(Object.values(CALL_KINDS).map((k) => [k, CALL_KIND_GROUPS[k]]));
  assertEqual([groups.mix, groups.shout, groups.name, groups.fuwa, groups.repeat, groups.special, groups.kojo], ["A", "B", "C", "D", "E", "F", "G"], "K1: 依頼の A〜G に対応");
}

function runVariantAndExceptionTests() {
  console.log("--- r9 K2・K3：表記の揺れ・誤分類の例外 ---");
  assertEqual([kindOf("あーフっフー"), kindOf("あーふっふー！"), kindOf("アーフッフー！"), kindOf("ﾌﾜﾌﾜ!")], ["fuwa", "fuwa", "fuwa", "fuwa"], "K2: カタカナ・ひらがな・小さい字・半角の揺れも同じ系統");
  assertEqual(normalizeCallText("ﾌｧｲﾔｰ！"), "ふぁいやー!", "K2: そろえ方（半角カナ→ひらがな・！→!）");
  assertEqual(kindOf("ファイヤー！"), "shout", "K3: MIX の言葉が 1 つだけなら MIX にしない（短い掛け声）");
  assertEqual(kindOf("楽しみましょこ！"), "shout", "K3: 名前の一部に見える言葉（しょこ）を名前にしない");
  assertEqual(kindOf("ダミーのセリフからの　あ～"), "cue", "K3: 「〜のセリフからの」は名前でも口上でもなく合図");
  assertEqual(kindOf("ダミーのことばがあるんだよ！\nあーフフッフー！"), "kojo", "K3: 長い文の中の「あーフフッフー」は口上のまま");
  assertEqual(kindOf("ちょっとで、いい！"), "shout", "K3: 「いい」のような 1 文字の繰り返しは連続にしない");
  assertEqual(kindOf("はいせーの　はーいはい　はい×４"), "repeat", "K3: 「！」が無くても ×回数 があれば連続（口上にしない）");
  assertEqual(kindOf("Let's go Together！"), "shout", "K3: 英語の掛け声は文（口上）にしない");
  assertEqual(kindOf("はい！×４", { type: "mix", duration: 9 }), "repeat", "K3: データの種類（type）だけで MIX にしない");
  assertEqual(kindOf(""), "normal", "K3: 空はふつう");
  // 回数
  assertEqual([countCallBeats("はいせーの！　はーいはい！　はい！×４"), countCallBeats("おい！×８"), countCallBeats("ハイ！ハイ！ハイハイハイ！"), countCallBeats("👏 👏👏 👏"), countCallBeats("👏×１４"), countCallBeats("うりゃ！おい！×１６")], [7, 8, 5, 4, 14, 32], "K3: 回数（×N はその前のまとまりを N 回・はいはいはい＝3・はーいはい＝2）");
  assertEqual(countCallBeats("ひーとみ！×４ or まーいか！×４"), 4, "K3: or の候補の回数は足さない（一番多いもの）");
}

function runInvariantTests() {
  console.log("--- r9 K4：本文の不変 ---");
  const samples = [MIX_A, MIX_B, MIX_C, "L・O・V・E", "3 2 1 Go！", "はいせーの！　はーいはい！　はい！×４", "\nオイ！\n", "  ", "", "ダミー", "👏 👏👏 👏\nしゃ～いくぞ！"];
  const before = JSON.stringify(samples);
  samples.forEach((s) => classifyCallKind(s));
  classifyCallSequence(samples.map((text, i) => ({ text, start: i, end: i + 0.5 })));
  assertEqual(JSON.stringify(samples), before, "K4: 判定は本文を変えない");
  const calls = [{ key: "a", text: MIX_A, start: 1, end: 12 }];
  const plan = planSpectacle(calls);
  assertEqual([plan[0].text, plan[0].start, plan[0].end], [MIX_A, 1, 12], "K4: 演出の計画でも本文・開始・終了はそのまま");
  assertEqual(JSON.stringify(calls), JSON.stringify([{ key: "a", text: MIX_A, start: 1, end: 12 }]), "K4: 渡したコールの配列を書き換えない");
}

function runSequenceTests() {
  console.log("--- r9 K5：並びの例外 ---");
  const seq = classifyCallSequence([
    { text: "ダミーのことばがあるんだよ！", start: 1, end: 3.4 },
    { text: "ダミーの体操だ！いっくよー！", start: 3.5, end: 5.9 },
    { text: "ダミーにであうためなんだよ！", start: 6, end: 8.4 },
  ]);
  assertEqual(seq.map((k) => k.kind), ["kojo", "kojo", "kojo"], "K5: 前後が口上なら、間の「ふつう」も口上");
  const lone = classifyCallSequence([{ text: "ダミーの体操だ！いっくよー！", start: 3.5, end: 5.9 }]);
  assertEqual(lone[0].kind, "normal", "K5: 前後が口上でなければ、ふつうのまま");
  const run = classifyCallSequence(["オイ！", "オイ！", "オイ！", "オイ！", "オイ！"].map((text, i) => ({ text, start: i * 0.6, end: i * 0.6 + 0.3 })));
  assertEqual([run.map((k) => k.run), run[0].runLen], [[0, 1, 2, 3, 4], 5], "K5: 短い掛け声が続くときは何番目かを持つ");
  const apart = classifyCallSequence([{ text: "オイ！", start: 0, end: 0.3 }, { text: "オイ！", start: 10, end: 10.3 }]);
  assertEqual(apart.map((k) => k.runLen), [1, 1], "K5: 離れた掛け声は続きにしない");
}

// ---- R12：本人の依頼「本人が切った所以外は、勝手に切って表示しないでほしい」 ----
// 架空の短いデータ（本物の歌詞・コールではない）。本人が区切った単位＝この配列の 1 件
const R12_CALLS = [
  { key: "u1", text: "うりゃ！おい！うりゃ！おい！ うりゃ！おい！うりゃ！おい！", start: 10, end: 14.2 }, // 連続の「うりゃ！おい！」を 1 件にしたもの
  { key: "u2", text: "うりゃ！おい！", start: 14.4, end: 15.1 }, // 本人が別に区切った 1 件
  { key: "u3", text: "うりゃ！おい！", start: 15.3, end: 16 },
  { key: "m1", text: MIX_A, start: 18, end: 29.5, type: "mix" }, // MIX の 1 件（中に「！」がたくさんある）
  { key: "m2", text: MIX_B, start: 30.2, end: 33 },
  { key: "r1", text: "はいせーの！　はーいはい！　はい！×４", start: 35, end: 38.9 },
  { key: "s1", text: "L・O・V・E", start: 40, end: 42.5 },
  { key: "k1", text: "ダミーのことばがあるんだよ！", start: 44, end: 46.4 },
  { key: "n1", text: "超絶かわいい！はなちゃん！", start: 48, end: 50.6 },
];

// 時刻 t に出ている塊（key と、出ている文字）を 1/60 秒ごとに集め、つながった区間にまとめる
function shownBlocks(plan, from, to) {
  const blocks = [];
  for (let t = from; t < to; t += 1 / 60) {
    const v = spectacleStateAt(plan, t);
    const on = v.key !== null && v.word.o >= 0.99;
    const last = blocks[blocks.length - 1];
    if (on && last && last.key === v.key && last.open) last.end = t;
    else if (on) blocks.push({ key: v.key, start: t, end: t, open: true });
    else if (last) last.open = false;
  }
  return blocks.map(({ key, start, end }) => ({ key, start: Math.round(start * 100) / 100, end: Math.round(end * 100) / 100 }));
}

function runNoSplitTests() {
  console.log("--- R12：1 件は 1 つの塊・本人の開始〜終了のまま（勝手に区切らない） ---");
  const plan = planSpectacle(R12_CALLS);
  assertEqual(plan.map((p) => p.key), R12_CALLS.map((c) => c.key), "R12: 計画の件数と順番は、承認済みの件と同じ（足さない・減らさない）");
  assertEqual(plan.every((p) => p.segs.length === 0), true, "R12: どの件も表示のための区切りを持たない（MIX・連続・1文字ずつでも）");
  const blocks = shownBlocks(plan, 9, 52);
  assertEqual(blocks.map((b) => b.key), R12_CALLS.map((c) => c.key), "R12: 画面に出る塊の数と順番は、承認済みの件と 1 対 1");
  const offs = blocks.map((b, i) => [Math.abs(b.start - R12_CALLS[i].start) <= 0.1, Math.abs(b.end - R12_CALLS[i].end) <= 0.04]);
  assertEqual(offs.every(([s, e]) => s && e), true, "R12: 塊は、その件の開始（0.1 秒以内に出る）〜終了まで出る（表示の都合で時刻を作り直さない）");
  // 1 件の中で、状態が「区切り」を持たない（seg・beat・lit が無い。どの時刻でも同じ件・同じ全文）
  const mix = plan.find((p) => p.key === "m1");
  const keys = new Set();
  let hasSub = false;
  for (let t = mix.start + 0.1; t < mix.end; t += 0.05) {
    const v = spectacleStateAt(plan, t);
    keys.add(v.key);
    if ("seg" in v || "beat" in v || "lit" in v) hasSub = true;
  }
  assertEqual([[...keys], hasSub], [["m1"], false], "R12: MIX の 1 件は、始まりから終わりまで同じ 1 件（区切りの番号を持たない）");
  // 画面全体の光：1 件の始まり以外の時刻に光を作らない
  const inner = plan.flatMap((p) => (p.flashes ?? []).filter((f) => Math.abs(f.t - p.start) > 1e-9).map((f) => `${p.key}@${f.t}`));
  assertEqual(inner, [], "R12: 1 件の途中の時刻（区切り・回数・名前の溜め）に光を作らない");
  // 「うりゃ！おい！」を続けた 3 件：塊は 3 つ・それぞれ本人の時刻
  const u = blocks.filter((b) => b.key.startsWith("u"));
  assertEqual([u.length, u.map((b) => b.key)], [3, ["u1", "u2", "u3"]], "R12: 連続の「うりゃ！おい！」は、本人が区切った 3 件のまま（1 件の中を「！」で分けない）");
}

function runNoSplitDomTests() {
  console.log("--- R12：画面の文字は 1 件の全文のまま ---");
  if (typeof document === "undefined") return;
  const host = document.body.appendChild(document.createElement("div"));
  const sp = createSpectacle(host, { variant: "karaoke" });
  const plan = planSpectacle(R12_CALLS);
  sp.setPlan(plan);
  const text = () => host.querySelector(".sp-word-text").textContent;
  const seen = [];
  for (const call of R12_CALLS) {
    const texts = new Set();
    for (let t = call.start + 0.05; t < call.end; t += 0.1) {
      sp.update(t, { playing: true, enabled: true });
      texts.add(text());
    }
    seen.push([call.key, [...texts]]);
  }
  assertEqual(seen.every(([key, texts], i) => texts.length === 1 && texts[0] === R12_CALLS[i].text), true, "R12: どの件も、始まりから終わりまで、本人の全文がそのまま 1 つの塊で出る（途中で文字が変わらない）");
  assertEqual(host.querySelectorAll(".sp-pips, .sp-probe, .sp-ch.is-lit").length, 0, "R12: 回数の印・区切りの測り・1 文字ずつ灯る部品は無い");
  sp.destroy();
  host.remove();
}


// ---- R12（追加）：本人の時刻で 2 件が重なるときは、重なっている間、両方を全文で出す ----
// 架空のデータ（本物の時刻の形だけをまねる：短いコールの途中で長い MIX が始まる／長いコールの終わり近くで短いコールが始まって先に終わる）
const OVERLAP_CALLS = [
  { key: "o1", text: "ダミー！", start: 5.58, end: 7.16 },
  { key: "o2", text: MIX_A, start: 5.63, end: 16.22, type: "mix" },
  { key: "o3", text: "ダミーの長いコールです！ダミー！", start: 52.54, end: 55.5 },
  { key: "o4", text: "オイ！オイ！", start: 54.53, end: 55.48 },
  { key: "o5", text: "ダミー！", start: 60, end: 61 }, // 重ならない
  { key: "o6", text: "ダミー！", start: 63, end: 65.01 }, // 0.04 秒だけ重なる（出さない）
  { key: "o7", text: "オイ！", start: 64.97, end: 66 },
];

function runOverlapTests() {
  console.log("--- R12：重なる 2 件は、重なっている間、両方を全文で ---");
  const plan = planSpectacle(OVERLAP_CALLS);
  const shownAt = (t) => {
    const v = spectacleStateAt(plan, t);
    const keys = [];
    if (v.key !== null && v.word.o >= 0.99) keys.push(v.key);
    if (v.sub && v.sub.o >= 0.99) keys.push(v.sub.key);
    return keys;
  };
  // どの件も、その件の開始（＋0.15 秒）〜終了の間、主か補助のどちらかで、ずっと出ている
  const missing = [];
  // （0.2 秒未満のわずかな重なりは、今までどおり後の件に替わるので、その件は後の件の始まりまで）
  for (const c of OVERLAP_CALLS) {
    const tiny = OVERLAP_CALLS.find((o) => o.start > c.start && o.start < c.end && c.end - o.start < 0.2);
    const until = tiny ? tiny.start : c.end;
    for (let t = c.start + 0.15; t < until - 0.01; t += 1 / 60) if (!shownAt(t).includes(c.key)) missing.push(`${c.key}@${t.toFixed(2)}`);
  }
  assertEqual(missing.slice(0, 5), [], "R12: 重なる件も、それぞれの開始〜終了の間ずっと出る（時刻を変えない・分けない）");
  // 重なっている間は 2 件・重ならない所は 1 件
  assertEqual([shownAt(6.5).sort(), shownAt(10), shownAt(55).sort(), shownAt(60.5)], [["o1", "o2"], ["o2"], ["o3", "o4"], ["o5"]], "R12: 重なっている間だけ 2 件、ほかは 1 件");
  assertEqual([spectacleStateAt(plan, 6.5).key, spectacleStateAt(plan, 6.5).sub?.key], ["o2", "o1"], "R12: 後から始まった件が主・先の件が補助");
  // わずかな重なり（0.2 秒未満）は補助に出さない（一瞬の点滅にしない）
  assertEqual([spectacleStateAt(plan, 64.99).sub, spectacleStateAt(plan, 63.5).sub], [null, null], "R12: 0.2 秒未満の重なりは、今までどおり 1 件");
  // 補助は、その件の終わりのあとすぐ消える（延ばし続けない）
  assertEqual([spectacleStateAt(plan, 7.16 + 0.3).sub, spectacleStateAt(plan, 55.5 + 0.3).key === "o4" || spectacleStateAt(plan, 55.8).sub === null], [null, true], "R12: 補助は終わりのあとすぐ消える");
  // 時刻だけで決まる（シーク・一時停止・調整のあとでも同じ）
  assertEqual(JSON.stringify(spectacleStateAt(plan, 6.33)), JSON.stringify(spectacleStateAt(plan, 6.33)), "R12: 重なりの見た目も時刻だけで決まる");
  // 本文・時刻を変えない
  assertEqual(plan.map((p) => [p.key, p.text, p.start, p.end]), OVERLAP_CALLS.map((c) => [c.key, c.text, c.start, c.end]), "R12: 重なりがあっても本文・開始・終了はそのまま");
  if (typeof document === "undefined") return;
  const host = document.body.appendChild(document.createElement("div"));
  const sp = createSpectacle(host, { variant: "karaoke" });
  sp.setPlan(plan);
  sp.update(6.5, { playing: true, enabled: true });
  const main = host.querySelector(".sp-word-text").textContent;
  const sub = host.querySelector(".sp-sub-text").textContent;
  assertEqual([main, sub, host.querySelector(".sp-sub").style.opacity], [MIX_A, "ダミー！", "1"], "R12: 画面でも、主（後の件）と補助（先の件）がどちらも全文");
  sp.update(10, { playing: true, enabled: true });
  assertEqual(host.querySelector(".sp-sub").style.opacity, "0", "R12: 重ならない所では補助を出さない");
  sp.update(6.5, { playing: false, enabled: true });
  assertEqual(sp.layer.classList.contains("is-paused"), true, "R12: 一時停止では、補助も主も残さない（層ごと消える）");
  sp.destroy();
  host.remove();
}

const DEMO = [
  { key: "shout", text: "オイ！", start: 2, end: 2.3 },
  { key: "r1", text: "オイ！", start: 5, end: 5.3 },
  { key: "r2", text: "オイ！", start: 5.6, end: 5.9 },
  { key: "r3", text: "オイ！", start: 6.2, end: 6.5 },
  { key: "r4", text: "オイ！", start: 6.8, end: 7.1 },
  { key: "mix", text: MIX_A, start: 10, end: 21, type: "mix" },
  { key: "name", text: "超絶かわいい！はなちゃん！", start: 24, end: 26.6 },
  { key: "or", text: "きあら！ or しょこちゃん！ or さなつん！", start: 29, end: 31 },
  { key: "fuwa", text: "ふわふわ！", start: 34, end: 34.8 },
  { key: "repeat", text: "はいせーの！　はーいはい！　はい！×４", start: 38, end: 41.9 },
  { key: "special", text: "イェッタイガー！", start: 45, end: 46.1 },
  { key: "kojo", text: "ダミーのことばがあるんだよ！", start: 49, end: 51.4 },
  { key: "clap", text: "👏  👏   　👏👏👏", start: 54, end: 55.4 },
  { key: "spell", text: "L・O・V・E", start: 58, end: 60.5 },
  { key: "sing", text: "Miss you", start: 63, end: 64 },
  { key: "cue", text: "ダミーを振り回す！", start: 67, end: 69 },
  { key: "normal", text: "ダミーの体操だ！いっくよー！", start: 72, end: 73.5 },
];

function runSustainTests() {
  console.log("--- r9 K6：演出の維持と終わり（どの種類も） ---");
  const plan = planSpectacle(DEMO);
  assertEqual(plan.map((p) => p.fx), ["shout", "shout", "shout", "shout", "shout", "mix", "name", "name", "fuwa", "repeat", "special", "kojo", "clap", "spell", "sing", "cue", "normal"], "K6: ダミーの並びの種類");
  const weak = [];
  const left = [];
  for (const item of plan) {
    const lead = item.fx === "special" ? 0.2 : 0.1; // 特殊は暗転の間、文字が奥に小さい（濃さは 1）
    for (let t = item.start + lead; t < item.end; t += 1 / 30) {
      const v = spectacleStateAt(plan, t);
      if (v.key !== item.key || v.word.o !== 1 || v.stage !== 1) weak.push(`${item.key}@${t.toFixed(2)}`);
    }
    const next = plan[plan.indexOf(item) + 1];
    const after = spectacleStateAt(plan, item.end + SP_TAIL_SEC + 0.001);
    if (!next || next.start > item.end + SP_TAIL_SEC + 0.01) if (after.word.o !== 0) left.push(item.key);
  }
  assertEqual(weak.slice(0, 5), [], "K6: どの種類も、始まりから終わりまで文字と会場が出たまま（長い MIX でも 2 秒で弱くならない）");
  assertEqual(left, [], "K6: どの種類も、終わり＋0.35 秒で文字が消える");
  const early = plan.filter((p) => spectacleStateAt(plan, p.start - 0.001).key === p.key).map((p) => p.key);
  assertEqual(early, [], "K6: どのコールも、本人の開始より前には出ない");
}

function runFxShapeTests() {
  console.log("--- r9 K7：種類ごとの見せ方（R12：1 件の中は分けない） ---");
  const plan = planSpectacle(DEMO);
  const at = (t, o) => spectacleStateAt(plan, t, o);
  const mix = plan.find((p) => p.key === "mix");
  // MIX：全文を 1 つの塊で。進むほど少しずつ大きく（1 件の進み具合だけ）
  assertEqual(at(mix.end - 0.3).word.s >= at(mix.start + 1.2).word.s - 0.05, true, "K7: MIX：終わりまで弱くならない（進むほど少し大きく）");
  // 短い掛け声：続くと 1 件ごとに 左 → 右 → 中央 → 全体
  const spots = ["r1", "r2", "r3", "r4"].map((k) => at(plan.find((p) => p.key === k).start + 0.25).word);
  assertEqual([spots[0].x < 0, spots[1].x > 0, spots[2].x === 0, spots[3].x === 0 && spots[3].s > spots[2].s], [true, true, true, true], "K7: 短い掛け声：続くときは 1 件ごとに 左 → 右 → 中央 → 全体");
  assertEqual(SP_SHOUT_SPOTS.map((s) => s.name), ["left", "right", "center", "all"], "K7: 置き場所の順番");
  const pops = [];
  for (let t = 2; t < 2.3; t += 0.01) pops.push(at(t).word.s);
  assertEqual([Math.min(...pops) <= 0.3, Math.max(...pops) >= 1.3], [true, true], "K7: 短い掛け声：点から一瞬で大きく");
  // 名前：始まりから名前まで全部（溜めない）
  const name = plan.find((p) => p.key === "name");
  const ns = [];
  for (let t = name.start; t < name.start + 0.4; t += 0.01) ns.push(at(t).word.s);
  assertEqual([Math.max(...ns) > 1.1, at(name.start + 0.1).word.o], [true, 1], "K7: 名前：始まりで名前まで全部が飛び出す（溜めて遅らせない）");
  const orColors = fxCrowdColors(plan.find((p) => p.key === "or"), 12);
  assertEqual([new Set(orColors).size, orColors[0] !== orColors[1]], [3, true], "K7: or：ペンライトは候補の全員の色が混ざる（隣が同じ色にならない）");
  const four = fxCrowdColors({ fx: "name", fxColors: ["#1", "#2", "#3", "#4"] }, 8);
  assertEqual(four.join() !== "#1,#1,#2,#2,#3,#3,#4,#4", true, "K7: 4 人でも左から順の等分の帯にしない");
  // ふわふわ：弾む（時刻を作らない一定の動き）
  const fu = plan.find((p) => p.key === "fuwa");
  const ys = [];
  for (let t = fu.start + 0.05; t < fu.end; t += 0.05) ys.push(at(t).word.y);
  assertEqual(Math.min(...ys) < -0.3 && Math.max(...ys) > -0.1, true, "K7: ふわふわ：弾む");
  // 特殊：始まりで奥から回りながら飛び出す（暗転で遅らせない）
  const sp = plan.find((p) => p.key === "special");
  assertEqual([at(sp.start + 0.05).dark, at(sp.start + 0.2).word.s > 1, at(sp.start + 0.02).wash > 0.3], [0, true, true], "K7: 特殊：始まりで一気に飛び出し、光る");
  assertEqual(Math.abs(at(sp.start + 0.7).word.r) < 1, true, "K7: 特殊：回転は最後に読める向きに戻る");
}

function runPenlightTests() {
  console.log("--- R12 K8：ペンライトは固定（色だけ変わる） ---");
  const plan = planSpectacle(DEMO);
  // どの時刻でも、どの種類でも、向き・位置は同じ（振らない・回さない・揺らさない）
  let moved = [];
  for (let i = 0; i < 12; i++) {
    const a0 = penlightPoseAt(plan, 0, i, 12);
    for (let t = 0; t < 75; t += 0.05) {
      const p = penlightPoseAt(plan, t, i, 12);
      if (p.a !== a0.a || p.y !== 0 || p.v !== 0) moved.push(`${i}@${t.toFixed(2)}`);
    }
  }
  assertEqual(moved.slice(0, 3), [], "K8: ペンライトの向き・位置は、どの時刻でも同じ（振らない・揺らさない）");
  // 色は種類・メンバーで変わる
  const shoutColors = fxCrowdColors(plan.find((p) => p.key === "shout"), 4);
  const nameColors = fxCrowdColors(plan.find((p) => p.key === "name"), 4);
  assertEqual(shoutColors.join() !== nameColors.join(), true, "K8: 変わるのは色（種類・メンバーカラー）");
}

function runFlashTests() {
  console.log("--- r9 K9：画面全体の光は 1 秒に 3 回まで ---");
  // いろいろな種類を、間を詰めて並べる
  const texts = ["オイ！", "イェッタイガー！", "超絶かわいい！はなちゃん！", "はい！×４", "オイ！", MIX_B, "L・O・V・E"];
  const dense = [];
  let t0 = 1;
  for (let i = 0; i < 90; i++) {
    const dur = [0.3, 1.1, 2.4, 1.6, 0.25, 3.0, 1.5][i % 7];
    dense.push({ key: `z${i}`, text: texts[i % 7], start: t0, end: t0 + dur });
    t0 += dur + [0.1, 0.6, 1.2, 0.2, 0.05, 1.5, 0.3][i % 5];
  }
  const plan = planSpectacle(dense);
  const rises = [];
  let prevStage = 0;
  let prevWash = 0;
  for (let t = 0; t < t0 + 1; t += 1 / 60) {
    const v = spectacleStateAt(plan, t);
    if ((v.stage > 0.5 && prevStage <= 0.5) || (v.wash > 0.2 && prevWash <= 0.2)) rises.push(t);
    prevStage = v.stage;
    prevWash = v.wash;
  }
  const tooMany = rises.some((t, i) => i >= SP_FLASH_MAX_PER_SEC && t - rises[i - SP_FLASH_MAX_PER_SEC] < 1);
  assertEqual([tooMany, rises.length > 20], [false, true], "K9: 種類を混ぜても、画面全体が明るくなるのは 1 秒に 3 回まで");
}

function runFxDomTests() {
  console.log("--- K10：画面の部品 ---");
  if (typeof document === "undefined") return;
  const host = document.body.appendChild(document.createElement("div"));
  const sp = createSpectacle(host, { variant: "karaoke" });
  const plan = planSpectacle(DEMO);
  sp.setPlan(plan);
  const text = () => host.querySelector(".sp-word-text").textContent;
  const fx = () => sp.layer.dataset.fx;
  const sticks = () => [...host.querySelectorAll(".sp-crowd i")].map((i) => i.style.transform);
  const firstSticks = sticks();
  sp.update(2.1, { playing: true, enabled: true });
  assertEqual([fx(), text()], ["shout", "オイ！"], "K10: 短い掛け声：data-fx と文字");
  const mix = plan.find((p) => p.key === "mix");
  for (const t of [mix.start + 0.01, mix.start + 5, mix.end - 0.01]) {
    sp.update(t, { playing: true, enabled: true });
    assertEqual([fx(), text()], ["mix", mix.text], `K10: MIX：+${(t - mix.start).toFixed(2)} 秒でも 1 件の全文`);
  }
  const name = plan.find((p) => p.key === "name");
  sp.update(name.start + 0.05, { playing: true, enabled: true });
  const word = host.querySelector(".sp-word");
  assertEqual([fx(), text(), word.classList.contains("is-named"), word.classList.contains("is-build")], ["name", name.text, true, false], "K10: 名前：始まりから全文・名前の光");
  const kj = plan.find((p) => p.key === "kojo");
  sp.update(kj.start + 1, { playing: true, enabled: true });
  assertEqual([text(), host.querySelectorAll(".sp-ch").length], [kj.text, 0], "K10: 口上：1 文字ずつの部品にしない（全文そのまま）");
  const fu = plan.find((p) => p.key === "fuwa");
  sp.update(fu.start + 0.1, { playing: true, enabled: true });
  assertEqual([fx(), text(), host.querySelectorAll(".sp-word-text .sp-wd").length >= 1], ["fuwa", fu.text, true], "K10: ふわふわ：言葉の途中で折り返さない箱（文字は本人のまま）");
  assertEqual(sticks(), firstSticks, "K10: 再生しても、ペンライトの向き（transform）は作ったときのまま");
  sp.update(fu.start + 0.1, { playing: false, enabled: true });
  assertEqual([sp.layer.classList.contains("is-paused"), word.style.opacity], [true, "0"], "K10: 一時停止で消える");
  sp.update(fu.start + 0.1, { playing: true, enabled: false });
  assertEqual(sp.layer.hidden, true, "K10: 演出なし・コール表示 OFF で出さない");
  const stick = host.querySelector(".sp-crowd i");
  assertEqual([["sp-grip", "sp-tube", "sp-halo"].every((c) => stick.querySelector(`.${c}`)), Boolean(stick.querySelector(".sp-trail"))], [true, false], "K10: ペンライトは持ち手・発光部・光の広がり（振らないので残像は無い）");
  sp.destroy();
  host.remove();
}

export function runCallKindsTests() {
  runRepresentativeTests();
  runVariantAndExceptionTests();
  runInvariantTests();
  runSequenceTests();
  runSustainTests();
  runFxShapeTests();
  runPenlightTests();
  runFlashTests();
  runFxDomTests();
  runNoSplitTests();
  runNoSplitDomTests();
  runOverlapTests();
}
