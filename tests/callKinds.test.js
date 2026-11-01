// 【2026-11-02 r9-fx 新設】コールの種類の判定（js/callKinds.js）と、種類ごとの演出（js/callSpectacle.js）の回帰テスト。
// 本物のコール本文は使わない（ダミーと、一般の掛け声・MIX の言葉・名前の表にある呼び名だけ）。
//   K1. 種類ごとの代表が正しく分かれる（A MIX・B 短い掛け声・C 名前・D ふわふわ・E 連続・F 特殊・G そのほか）
//   K2. 表記の揺れ（カタカナ・ひらがな・半角・小さい字）が同じ種類になる
//   K3. 誤分類の例外（名前と歌詞を混同しない・長い文の中のふわふわは口上・1 文字の繰り返しは連続にしない・迷うものはふつう）
//   K4. 本文の不変：区切りをつなげると元の文字列と同じ・判定で文字列を変えない
//   K5. 並びの例外（前後が口上なら口上・短い掛け声が続くときの番号）
//   K6. 演出の維持と終わり：どの種類も始まりから終わりまで文字と会場が出たまま（途中で弱くならない）・終わったら消える
//   K7. 種類ごとの見せ方：MIX は区切りごとに順に・最後で大きく／短い掛け声は 左→右→中央→全体／名前は溜め→名前／連続は回数・左右交互
//   K8. ペンライト：シュッ（速い振り→止め）・強い種類ほど速い・一斉・視差効果を減らすと動かない・時刻だけで決まる
//   K9. 画面全体の光は、どの 1 秒の中でも 3 回まで（全種類を混ぜて）
//   K10. 画面の部品：種類（data-fx）・区切りの文字・名前の溜め・1 文字ずつの部品は本文のまま・一時停止で消える
import { assertEqual } from "./test-utils.js";
import { CALL_KINDS, CALL_KIND_GROUPS, classifyCallKind, classifyCallSequence, splitCallSegments, countCallBeats, normalizeCallText } from "../js/callKinds.js";
import {
  planSpectacle,
  spectacleStateAt,
  penlightPoseAt,
  flickCurve,
  segmentAt,
  nameBlastTime,
  fxCrowdColors,
  createSpectacle,
  SP_FX,
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
  for (const mode of ["shout", "dot"]) {
    assertEqual(samples.every((s) => splitCallSegments(s, mode).join("") === s), true, `K4: 区切り（${mode}）をつなげると元の文字列とまったく同じ`);
  }
  assertEqual(splitCallSegments(MIX_B).length, 7, "K4: 「虎(とら)！」は 1 つの区切り（読みのかっこで切らない）");
  assertEqual(splitCallSegments("タイガー！ファイヤー！").map((s) => s.trim()), ["タイガー！", "ファイヤー！"], "K4: MIX は「！」の後ろで区切る");
  const before = JSON.stringify(samples);
  samples.forEach((s) => classifyCallKind(s));
  classifyCallSequence(samples.map((text, i) => ({ text, start: i, end: i + 0.5 })));
  assertEqual(JSON.stringify(samples), before, "K4: 判定は本文を変えない");
  const calls = [{ key: "a", text: MIX_A, start: 1, end: 12 }];
  const plan = planSpectacle(calls);
  assertEqual([plan[0].text, plan[0].start, plan[0].end, plan[0].segs.join("")], [MIX_A, 1, 12, MIX_A], "K4: 演出の計画でも本文・開始・終了はそのまま（区切りは見せ方だけ）");
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
  console.log("--- r9 K7：種類ごとの見せ方 ---");
  const plan = planSpectacle(DEMO);
  const at = (t, o) => spectacleStateAt(plan, t, o);
  const mix = plan.find((p) => p.key === "mix");
  // MIX：区切りが順に（等分）。最後の区切りは一番大きい
  const segs = [];
  for (let t = mix.start; t < mix.end; t += 0.05) segs.push(at(t).seg);
  assertEqual(segs.every((s, i) => i === 0 || s >= segs[i - 1]) && segs[0] === 0 && segs[segs.length - 1] === mix.segs.length - 1, true, "K7: MIX：区切りは前から順に、最後の区切りまで");
  const sg = segmentAt(mix, mix.start + (mix.end - mix.start) * 0.5);
  assertEqual(Math.abs(sg.len - (mix.end - mix.start) / mix.segs.length) < 1e-9, true, "K7: MIX：区切りの時間は 1 件の開始〜終了の等分（見せ方だけ）");
  const lastStart = mix.start + sg.len * (mix.segs.length - 1);
  const settledFirst = at(mix.start + sg.len * 0.8).word.s;
  const settledLast = at(lastStart + sg.len * 0.8).word.s;
  assertEqual(settledLast > settledFirst, true, "K7: MIX：進むほど大きく、最後の区切りが一番大きい");
  assertEqual(at(lastStart + 0.02).wash > 0, true, "K7: MIX：最後の区切りで画面が光る（最後で大きく）");
  // 短い掛け声：続くと 左 → 右 → 中央 → 全体
  const spots = ["r1", "r2", "r3", "r4"].map((k) => at(plan.find((p) => p.key === k).start + 0.25).word);
  assertEqual([spots[0].x < 0, spots[1].x > 0, spots[2].x === 0, spots[3].x === 0 && spots[3].s > spots[2].s], [true, true, true, true], "K7: 短い掛け声：続くときは 左 → 右 → 中央 → 全体");
  assertEqual(SP_SHOUT_SPOTS.map((s) => s.name), ["left", "right", "center", "all"], "K7: 置き場所の順番");
  const pops = [];
  for (let t = 2; t < 2.3; t += 0.01) pops.push(at(t).word.s);
  assertEqual([Math.min(...pops) <= 0.3, Math.max(...pops) >= 1.3], [true, true], "K7: 短い掛け声：点から一瞬で大きく");
  // 名前：溜め → 名前で一気に
  const name = plan.find((p) => p.key === "name");
  const blast = nameBlastTime(name);
  assertEqual([blast > name.start, blast <= name.start + 0.9 + 1e-9, at(name.start + 0.3).named, at(blast + 0.01).named], [true, true, false, true], "K7: 名前：「超絶かわいい！」で溜めて → 名前で一気に（溜めは 0.9 秒まで）");
  assertEqual(at(blast + 0.08).word.s > at(blast - 0.05).word.s + 0.2, true, "K7: 名前：名前の瞬間に大きく飛び出す");
  assertEqual(nameBlastTime(plan.find((p) => p.key === "or")), 29, "K7: 名前の前の言葉が無ければ、始まりから名前");
  const orColors = fxCrowdColors(plan.find((p) => p.key === "or"), 12);
  assertEqual([new Set(orColors).size, orColors[0] !== orColors[1]], [3, true], "K7: or：ペンライトは候補の全員の色が混ざる（隣が同じ色にならない）");
  const four = fxCrowdColors({ fx: "name", fxColors: ["#1", "#2", "#3", "#4"] }, 8);
  assertEqual(four.slice(0, 4).join() !== "#1,#2,#3,#4" || four.join() !== "#1,#1,#2,#2,#3,#3,#4,#4", true, "K7: 4 人でも左から順の等分の帯にしない");
  // 連続：回数に合わせて跳ねる・左右交互・最後は大きく
  const rep = plan.find((p) => p.key === "repeat");
  const len = (rep.end - rep.start) / rep.beats;
  const xs = [0, 1, 2, 3].map((i) => at(rep.start + len * (i + 0.1)).word.x);
  assertEqual([rep.beats, Math.sign(xs[0]) !== Math.sign(xs[1]), Math.sign(xs[1]) !== Math.sign(xs[2])], [7, true, true], "K7: 連続：回数（7 回）ごとに左右交互に跳ねる");
  assertEqual(at(rep.start + len * (rep.beats - 0.9)).word.x === 0 && at(rep.start + len * (rep.beats - 0.4)).word.s > at(rep.start + len * 1.6).word.s, true, "K7: 連続：最後の 1 回は真ん中で大きく");
  // ふわふわ：弾む（上下）・左右
  const fu = plan.find((p) => p.key === "fuwa");
  const ys = [];
  for (let t = fu.start + 0.05; t < fu.end; t += 0.05) ys.push(at(t).word.y);
  assertEqual(Math.min(...ys) < -0.3 && Math.max(...ys) > -0.1, true, "K7: ふわふわ：弾む");
  // 特殊：暗転 → 爆発
  const sp = plan.find((p) => p.key === "special");
  assertEqual([at(sp.start + 0.05).dark, at(sp.start + 0.05).word.s < 0.1, at(sp.start + 0.4).dark, at(sp.start + 0.3).word.s > 1.1], [1, true, 0, true], "K7: 特殊：一瞬暗くなって、奥から一気に飛び出す");
  assertEqual(Math.abs(at(sp.start + 0.7).word.r) < 1, true, "K7: 特殊：回転は最後に読める向きに戻る");
  // 口上・1文字ずつ：灯る割合が進む
  const kj = plan.find((p) => p.key === "kojo");
  assertEqual([at(kj.start + 0.1).lit < 0.2, at(kj.start + (kj.end - kj.start) * 0.9).lit], [true, 1], "K7: 口上：1 文字ずつ灯り、終わり近くで全部");
  const sl = plan.find((p) => p.key === "spell");
  assertEqual([at(sl.start + 0.1).lit, at(sl.end - 0.05).lit], [0.25, 1], "K7: 1文字ずつ：L・O・V・E が 1 つずつ（等分）");
}

function runPenlightTests() {
  console.log("--- r9 K8：ペンライト（シュッ！シュッ！） ---");
  // 1 回の振り：最初の 30% で振り切り、あとは止める（メリハリ）
  assertEqual([flickCurve(0).pos, flickCurve(0.3).pos > 1, flickCurve(0.6).pos > 0.99, flickCurve(0).vel, flickCurve(0.5).vel], [-1, true, true, 1, 0], "K8: 速く振り切って（少し行き過ぎ）、止める");
  const plan = planSpectacle(DEMO);
  const speed = (key, from = 0, to = 1) => {
    const item = plan.find((p) => p.key === key);
    let max = 0;
    const t0 = item.start + (item.end - item.start) * from;
    const t1 = item.start + (item.end - item.start) * to;
    for (let t = t0; t < t1 - 1 / 120; t += 1 / 120) {
      const a = penlightPoseAt(plan, t, 3, 12).a;
      const b = penlightPoseAt(plan, t + 1 / 120, 3, 12).a;
      max = Math.max(max, Math.abs(b - a) * 120);
    }
    return max;
  };
  const sp = speed("special");
  const sh = speed("shout");
  const mixEnd = speed("mix", 0.92, 1);
  const mixStart = speed("mix", 0, 0.3);
  const nm = speed("name", 0.5, 1);
  const nr = speed("normal");
  const sg = speed("sing");
  assertEqual([sp > 1200, sh > 1000, nr > 600], [true, true, true], "K8: 振る瞬間は速い（1 秒に 600 度以上）");
  assertEqual([sp >= sh * 0.95, mixEnd > mixStart, nm > sg, sh > sg], [true, true, true, true], "K8: 強い種類ほど速い（特殊 ≧ 短い・MIX は進むほど速い・名前＞歌う）");
  // 一斉：短い掛け声・特殊・名前は、始まりで全部が同じ向き（ずらさない）
  const shout = plan.find((p) => p.key === "shout");
  const poses = Array.from({ length: 12 }, (_, i) => penlightPoseAt(plan, shout.start + 0.01, i, 12));
  assertEqual(poses.every((p) => p.d === poses[0].d && p.v > 0.5), true, "K8: コールの始まりで一斉に振る");
  // 視差効果を減らす：動かさない
  const still = [0.1, 0.5, 1.2].map((dt) => penlightPoseAt(plan, plan[5].start + dt, 2, 12, { reduced: true }));
  assertEqual(still.every((p) => p.a === still[0].a && p.v === 0), true, "K8: 視差効果を減らす：ペンライトを振らない");
  // 時刻だけで決まる
  assertEqual(JSON.stringify(penlightPoseAt(plan, 15.37, 4, 12)), JSON.stringify(penlightPoseAt(plan, 15.37, 4, 12)), "K8: 同じ時刻なら同じ向き（シーク・再開でも）");
  // コールの無い間（会場を下ろしていない）は休む
  assertEqual(penlightPoseAt(plan, 0.5, 0, 12).v, 0, "K8: コールの無い間は振らない");
  assertEqual(SP_FX.special.f0 > SP_FX.normal.f0 && SP_FX.shout.f0 > SP_FX.normal.f0 && SP_FX.mix.f1 > SP_FX.mix.f0, true, "K8: 設定：特殊・短い掛け声はふつうより速い・MIX は進むほど速い");
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
  console.log("--- r9 K10：画面の部品 ---");
  if (typeof document === "undefined") return;
  const host = document.body.appendChild(document.createElement("div"));
  const sp = createSpectacle(host, { variant: "karaoke" });
  const plan = planSpectacle(DEMO);
  sp.setPlan(plan);
  const text = () => host.querySelector(".sp-word-text").textContent;
  const fx = () => sp.layer.dataset.fx;
  sp.update(2.1, { playing: true, enabled: true });
  assertEqual([fx(), text()], ["shout", "オイ！"], "K10: 短い掛け声：data-fx と文字");
  const mix = plan.find((p) => p.key === "mix");
  sp.update(mix.start + 0.01, { playing: true, enabled: true });
  assertEqual([fx(), text()], ["mix", mix.segs[0]], "K10: MIX：最初の区切りの文字");
  const len = (mix.end - mix.start) / mix.segs.length;
  sp.update(mix.start + len * 5.5, { playing: true, enabled: true });
  assertEqual(text(), mix.segs[5], "K10: MIX：その時刻の区切りの文字（本人の文字のまま）");
  assertEqual(host.querySelectorAll(".sp-pips i.is-lit").length > 0, true, "K10: MIX：区切りの印が進む");
  sp.update(mix.end - 0.01, { playing: true, enabled: true });
  assertEqual([text(), host.querySelector(".sp-word").classList.contains("is-finale")], [mix.segs[mix.segs.length - 1], true], "K10: MIX：最後の区切りは一番大きな見せ方");
  const name = plan.find((p) => p.key === "name");
  sp.update(name.start + 0.2, { playing: true, enabled: true });
  const word = host.querySelector(".sp-word");
  assertEqual([fx(), text(), word.classList.contains("is-build"), Boolean(host.querySelector(".sp-lead"))], ["name", name.text, true, true], "K10: 名前：溜めの間（本文はそのまま）");
  sp.update(nameBlastTime(name) + 0.05, { playing: true, enabled: true });
  assertEqual([word.classList.contains("is-named"), word.classList.contains("is-build")], [true, false], "K10: 名前：名前で一気に");
  const kj = plan.find((p) => p.key === "kojo");
  sp.update(kj.start + 1, { playing: true, enabled: true });
  const lit = host.querySelectorAll(".sp-ch.is-lit").length;
  assertEqual([text(), lit > 0, lit < host.querySelectorAll(".sp-ch").length], [kj.text, true, true], "K10: 口上：1 文字ずつの部品をつなげると本文と同じ・途中まで灯る");
  const fu = plan.find((p) => p.key === "fuwa");
  sp.update(fu.start + 0.1, { playing: true, enabled: true });
  assertEqual([fx(), text(), host.querySelectorAll(".sp-word-text .sp-wd").length >= 1], ["fuwa", fu.text, true], "K10: ふわふわ：言葉の途中で折り返さない箱");
  sp.update(fu.start + 0.1, { playing: false, enabled: true });
  assertEqual([sp.layer.classList.contains("is-paused"), word.style.opacity], [true, "0"], "K10: 一時停止で消える");
  sp.update(fu.start + 0.1, { playing: true, enabled: false });
  assertEqual(sp.layer.hidden, true, "K10: 演出なし・コール表示 OFF で出さない");
  // ペンライトの部品：持ち手・発光部・光の広がり・残像
  const stick = host.querySelector(".sp-crowd i");
  assertEqual(["sp-grip", "sp-tube", "sp-halo", "sp-trail"].every((c) => stick.querySelector(`.${c}`)), true, "K10: ペンライトは持ち手・発光部・光の広がり・残像の部品");
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
}
