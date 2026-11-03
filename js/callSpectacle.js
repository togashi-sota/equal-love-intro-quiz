// コールの「大きな演出」（2026-11-01 r7-live 新設 → 2026-11-01 r8-fx で作り直し → 2026-11-02 r9-fx で種類ごとの演出・ペンライトの作り直し）。
// 新しいライブコール（演出 あり）と新しいカラオケ（コール表示 ON）の共通の部品。
//
// 【r8-fx：本人の依頼（REQUEST_R8 の 1）】
//   「ただ光っているだけ」「最初の2秒だけ光って、あとは戻る」「色がダサい」→
//   ・コールの始まりから終わりまで、ずっと大きな文字が飛び出したまま（長いコール・MIX・名前つきでも途中で弱くしない）。
//   ・カラオケはコール中は全画面（歌詞は隠れてよい）。ライブコールは舞台の上の大きな帯（いま／つぎ・光っている行は隠さない）。
//   ・ライブ会場の見た目：ペンライトの群れ（【r12-calls】固定）・ステージの光線（放射の光・サーチライト）・ネオンの紫／ピンク／青／オレンジ。
//   ・名前コールは、メンバーカラーを「その色のペンライトの群れ」として使う（複数・or はそれぞれの色が混ざった群れ）。
//   ・短いコール（おい！）は勢い：爆発して飛び出し、すぐ消える。長いコールは圧：ゆっくり脈打ち、光線が回り続け、進むほど熱くなる。
//
// 【守る決まり（COMMON）】
//   ・種類はデータだけで決める（AI が言葉の意味で決めつけない）：
//       D 名前コール … js/liveCallNames.js（js/callNameColors.js の確かめた名前の表）で名前があると判定されたもの
//       C 長いコール … 長さ（本人の終了 − 開始）が 4 秒以上
//       B 連続するコール … 前のコールの終わりから 0.8 秒以内に次が始まる、を 3 件以上続けたもの（4 秒未満のものだけ）
//       A 短いコール … 1.2 秒以下（B に入らないもの）
//       ふつう … それ以外（1.2 秒より長く 4 秒未満）
//       E 盛り上がる区間 … 前後 4 秒（計 8 秒）の中にコールの始まりが 5 件以上ある所（コールの時刻の密度）。背景の光を強くするだけ
//   ・時刻は本人の開始〜終了のまま。始まりを早めない。終わりのあと最大 0.35 秒で消える（次のコールが来たらすぐ切り替える）。
//   ・コール1件は1件のまま。文字列は変えない（本人のコールの文字をそのまま出す。名前の部分に色の光を付けるだけ）。
//   ・見た目は「いまの時刻 t」だけから決まる（spectacleStateAt は純粋関数）。一時停止・シーク・曲の切り替え・曲の終わりで残らない。
//   ・画面全体の明るさが急に上がるのは、1 秒に 3 回まで（続けて来るコールの間は会場の暗幕を下ろしたままにして、点滅させない）。
//   ・端末の「視差効果を減らす」：拡大・回転・揺れ・光線の回転を止め、静かな大きな表示にする。
//
// 【軽さ】部品は画面に1組だけ（コールの数だけ作らない。ペンライトはカラオケ 12 本・ライブコール 8 本〔r9-fx〕）。
//   動かすのは transform・opacity だけで、値が変わったときだけ書く。繰り返しの動き（光線の回転・スポットライト）は CSS で、
//   （【r12-calls】ペンライトは動かさない）。繰り返しの動きはコールが出ている間だけ（一時停止中・非表示・コールの無い間は止める）。
//   会場の部品にぼかし（filter）は使わない。
// 【r9-fx：本人の依頼（REQUEST_R9）】コールの種類（js/callKinds.js。表示のときだけ判定）ごとに、色・照明・文字の飛び出し方を変える。
//   ペンライトは発光部（先の丸い筒・芯は白・まわりに光の広がり）と持ち手を分けた本物に近い形。
// 【r12-calls：本人の依頼（REQUEST_R12 の 7・8）】
//   「うりゃ！おい！が多い所などで、勝手に切ってくれているが、タイミングが合っていない。本人が切った所以外は、勝手に切って表示しないでほしい」→
//   ・承認済みの 1 件（本人が区切った単位）を、1 つの塊として、その件の開始〜終了の時刻で出す。
//     r9-fx の「MIX を区切りごとに順に飛び出させる」「回数ごとに跳ねる・回数の印」「1 文字ずつ灯る」「名前の溜め」「特殊の暗転」はやめた
//     （どれも 1 件の中に、本人の時刻ではない時刻を作っていた）。画面に収めるための折り返しは自然に入るが、折り返した行を別の時刻にはしない。
//   「ペンライトは動きが速い。動かさなくていい。ずっと固定で、色だけ変える」→
//   ・ペンライトの位置・角度は固定（振らない・回さない・揺らさない・残像なし）。変わるのは色（種類・メンバーカラー）と、会場の点灯・消灯の明るさだけ。
//     背景の照明（光線・スポットライト）は残す。
//   ・画面全体の光（白い光）は 1 件の始まりだけで、どの 1 秒の中でも 3 回まで。
//
import { describeNameCall, nameCallAccent, renderNameCallText, NAME_KINDS } from "./liveCallNames.js";
import { CALL_KINDS, classifyCallSequence } from "./callKinds.js";
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";

export const SP_KINDS = { SHORT: "short", CHAIN: "chain", LONG: "long", NAME: "name", NORMAL: "normal" };
export const SP_SHORT_MAX_SEC = 1.2;
export const SP_LONG_MIN_SEC = 4;
export const SP_CHAIN_GAP_SEC = 0.8;
export const SP_CHAIN_MIN = 3;
export const SP_HOT_WINDOW_SEC = 8;
export const SP_HOT_MIN_CALLS = 5;
export const SP_TAIL_SEC = 0.35;
// 【r8-fx】次のコールまでの間がこれ以下なら、会場（暗幕・光線・ペンライト）を下ろしたままにする（点滅させない・勢いを切らない）
export const SP_BRIDGE_SEC = 1.0;
export const SP_BRIDGE_LEVEL = 0.6;
// 【r8-fx】長いコールの「脈打ち」：1 秒に 0.8 回、大きさだけ 1 → 1.045 倍（明るさは変えない＝点滅にならない）
export const SP_PULSE_HZ = 0.8;
export const SP_PULSE_AMP = 0.045;
export const SP_BEAM_COUNT = 6;
// 【r8-fx】ライブコール：コールの間、帯の位置を測り直す間隔（秒）
export const SP_FOLLOW_SEC = 0.5;
// 【r9-fx】ペンライトは太く・本物の長さにしたので、本数を減らす（カラオケ 12・ライブコール 8。後ろの列と前の列）
export const SP_CROWD_COUNT = { karaoke: 12, live: 8 };
export const SP_RAY_COUNT = 12;
// 名前でないコールのペンライト・光線の色（ライブ会場の色：ピンク・紫・青・オレンジ）
export const SP_VENUE_COLORS = ["#ff2d95", "#9b5cff", "#2fb8ff", "#ff8a1f"];
// 続けて来るコール（B）の文字の置き場所（横のずれ：画面の幅に対する割合、傾き：度）。順番に変えてテンポを出す（同じ順番なら毎回同じ）
export const SP_CHAIN_SPOTS = [
  [-0.07, -4],
  [0.07, 4],
  [0, -2],
  [-0.05, 3],
  [0.06, -3],
];
// 【r12-calls】本人の時刻で 2 件が重なるとき、両方を出す（後から始まった件が主・先の件は補助）。この長さより短い重なりは出さない
export const SP_OVERLAP_MIN_SEC = 0.2;
// 補助の表示が、その件の終わりのあと消えるまでの秒
export const SP_SUB_TAIL_SEC = 0.25;
// 【r9-fx】画面全体の光（白い光）：どの 1 秒の中でも 3 回まで。光と光の間は 0.25 秒以上
export const SP_FLASH_MAX_PER_SEC = 3;
export const SP_FLASH_MIN_GAP_SEC = 0.25;
// 【r9-fx】短い掛け声が続くときの置き場所の順番：左 → 右 → 中央 → 全体（x・y は「空いている幅・高さ」に対する割合、r 傾き、s 大きさ）
export const SP_SHOUT_SPOTS = [
  { name: "left", x: -0.85, y: -0.35, r: -9, s: 1 },
  { name: "right", x: 0.85, y: 0.3, r: 8, s: 1 },
  { name: "center", x: 0, y: -0.1, r: -2, s: 1.05 },
  { name: "all", x: 0, y: 0, r: 0, s: 1.3 },
];

// 【r9-fx】種類ごとの色（ペンライト・照明・暗幕の色）。【r12-calls】ペンライトは振らないので、色だけを持つ
export const SP_FX = {
  mix: { palette: ["#ff2d95", "#ffd400", "#00e5ff", "#ff6a00", "#b04dff"] },
  shout: { palette: ["#ffffff", "#ffb000", "#ff3b3b", "#ff7a00"] },
  name: { palette: null },
  fuwa: { palette: ["#ffb3d9", "#9ff0ff", "#fff1a8", "#c9b5ff"] },
  repeat: { palette: ["#c6ff00", "#00e676", "#00b0ff", "#ffffff"] },
  special: { palette: ["#ffd700", "#ff4081", "#40c4ff", "#ffffff"] },
  kojo: { palette: ["#ff4d6d", "#ff8fa3", "#ffffff", "#ffc2d1"] },
  clap: { palette: ["#ffcc80", "#ffffff", "#ffab40", "#ffe0b2"] },
  spell: { palette: ["#00f0ff", "#ff00e5", "#ffffff", "#7c4dff"] },
  cue: { palette: ["#ffb300", "#ffffff", "#ff6f00", "#ffe082"] },
  sing: { palette: ["#4fc3f7", "#b388ff", "#80deea", "#e1f5fe"] },
  normal: { palette: SP_VENUE_COLORS },
};

// 「◯◯！」（自分の推しの名前）：現役メンバー全員の確かめた色（members.js のメンバーカラー）
const OSHI_COLORS = MEMBERS.filter((m) => m.status === MEMBER_STATUS.ACTIVE && m.memberColor?.hex).map((m) => m.memberColor.hex);

// 大きな文字の上下の位置（純粋関数）。
// region：文字を出してよい範囲 { top, bottom }（画面の px）。avoid：重ねたくない範囲の一覧 [{ top, bottom }]。wordH：出すものの高さ（px）。
// 候補（範囲の上寄り・真ん中・下寄り）のうち、どれとも重ならないものを選ぶ。重ならないものが複数なら、避けたい範囲から一番遠いもの。
// 全部重なるなら、重なりが一番小さいもの。戻り値：中心の y（px）
export function chooseSpectacleY(region, avoid = [], wordH = 0) {
  const top = Number(region?.top);
  const bottom = Number(region?.bottom);
  if (!Number.isFinite(top) || !Number.isFinite(bottom) || bottom <= top) return null;
  const half = Math.min(Math.max(0, wordH) / 2, (bottom - top) / 2);
  const pad = 8;
  const upper = Math.min(top + half + pad, (top + bottom) / 2);
  const lower = Math.max(bottom - half - pad, (top + bottom) / 2);
  const cands = [(top + bottom) / 2, upper, lower];
  const rects = (avoid ?? []).filter((r) => Number.isFinite(r?.top) && Number.isFinite(r?.bottom) && r.bottom > r.top);
  const overlap = (c) => rects.reduce((sum, r) => sum + Math.max(0, Math.min(c + half, r.bottom) - Math.max(c - half, r.top)), 0);
  const distance = (c) => (rects.length ? Math.min(...rects.map((r) => (c < r.top ? r.top - c : c > r.bottom ? c - r.bottom : 0))) : 0);
  let best = cands[0];
  for (const c of cands) {
    const better = overlap(c) < overlap(best) || (overlap(c) === overlap(best) && distance(c) > distance(best) + 0.5);
    if (better) best = c;
  }
  return Math.round(best);
}

const visibleLength = (text) => [...String(text ?? "").replace(/\s+/g, "")].length;

// 大きな文字の大きさの段階（文字数だけで決める。純粋関数）
export function spectacleSizeClass(text) {
  const n = visibleLength(text);
  if (n <= 4) return "s";
  if (n <= 8) return "m";
  if (n <= 16) return "l";
  if (n <= 32) return "xl";
  return "xxl";
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 0 → 1 へなめらかに
const ease = (x) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};
const easeOutCubic = (x) => 1 - Math.pow(1 - clamp01(x), 3);

// 画面全体の光の予定を決める（純粋関数）。forced（会場が下りてくる始まり）は必ず出す。そのほかは 1 秒に 3 回・0.25 秒以上の間を守れるときだけ
function planFlashes(items) {
  const events = [];
  items.forEach((item, index) => {
    const prev = items[index - 1];
    const bridgedIn = Boolean(prev && item.start - prev.end <= SP_BRIDGE_SEC);
    const base = (POP[item.kind] ?? POP[SP_KINDS.NORMAL]).wash;
    // 【r12-calls】光は 1 件の始まりだけ（1 件の中の区切り・回数・名前の時刻に光を作らない）
    if (!bridgedIn) events.push({ index, t: item.start, s: item.fx === CALL_KINDS.SPECIAL ? 0.85 : base, forced: true });
    else if (item.fx === CALL_KINDS.SPECIAL) events.push({ index, t: item.start, s: 0.85 });
    if (item.fx === CALL_KINDS.SHOUT && bridgedIn && item.run % SP_SHOUT_SPOTS.length === 3) events.push({ index, t: item.start, s: 0.55 });
  });
  events.sort((a, b) => a.t - b.t || (b.forced ? 1 : 0) - (a.forced ? 1 : 0));
  const accepted = [];
  for (const e of events) {
    const recent = accepted.filter((a) => e.t - a.t < 1 && a.s > 0);
    const tooClose = accepted.some((a) => a.s > 0 && Math.abs(e.t - a.t) < SP_FLASH_MIN_GAP_SEC);
    if (e.forced) {
      // 会場が下りてくること（暗幕の明るさの変化）は必ず起きる。白い光は、数が超えるときは出さない
      accepted.push(recent.length >= SP_FLASH_MAX_PER_SEC || tooClose ? { ...e, s: 0 } : e);
      continue;
    }
    // 会場が下りてくる変化（forced）も 1 回と数える
    const changes = accepted.filter((a) => e.t - a.t < 1 && (a.s > 0 || a.forced)).length;
    if (changes < SP_FLASH_MAX_PER_SEC && !tooClose) accepted.push(e);
  }
  const byItem = items.map(() => []);
  for (const e of accepted) if (e.s > 0) byItem[e.index].push({ t: e.t, s: e.s });
  return byItem;
}

// コールの並び（本人の開始・終了・文字）から、演出の種類を決める（純粋関数。同じデータなら同じ結果）。
// calls：[{ key, text, start, end, type? }]。時刻の無いもの・終了が開始より前のものは入れない（光らせないのと同じ）
// 【r9-fx】kind（時間の形：短い・続く・長い・名前・ふつう）に加えて、fx（コールの種類：js/callKinds.js）と、その見せ方の材料を持つ：
//   segs（MIX・1文字ずつの区切り。つなげると本文と同じ）・beats（回数）・run（短い掛け声が続くときの何番目か）・lead（名前の前の言葉の文字数）・
//   fxColors（ペンライト・スポットライトの色）・flashes（画面全体の光の予定）
export function planSpectacle(calls, { describe = describeNameCall } = {}) {
  const list = (Array.isArray(calls) ? calls : [])
    .filter((call) => Number.isFinite(call?.start) && Number.isFinite(call?.end) && call.end > call.start)
    .map((call) => ({ key: call.key, text: String(call.text ?? ""), start: call.start, end: call.end, type: call.type ?? null }))
    .sort((a, b) => a.start - b.start);
  // 続けて来るコール（B）：4 秒未満のコールが、前の終わりから 0.8 秒以内に始まる、を続けた塊
  const runs = [];
  let run = [];
  list.forEach((call, index) => {
    const prev = list[index - 1];
    const linked = prev && call.end - call.start < SP_LONG_MIN_SEC && prev.end - prev.start < SP_LONG_MIN_SEC && call.start - prev.end <= SP_CHAIN_GAP_SEC;
    if (!linked && run.length) {
      runs.push(run);
      run = [];
    }
    run.push(index);
  });
  if (run.length) runs.push(run);
  const chainOf = new Map();
  runs.forEach((indexes) => indexes.forEach((index, position) => chainOf.set(index, { chainIndex: position, chainLen: indexes.length })));
  const starts = list.map((call) => call.start);
  let kinds = [];
  try {
    kinds = classifyCallSequence(list, { describe });
  } catch {
    kinds = [];
  }
  const items = list.map((call, index) => {
    const duration = call.end - call.start;
    let accent = null;
    let nameKind = NAME_KINDS.NONE;
    try {
      const result = describe(call.text);
      accent = nameCallAccent(result);
      nameKind = accent ? result.kind : NAME_KINDS.NONE;
    } catch {
      accent = null;
    }
    const { chainIndex, chainLen } = chainOf.get(index) ?? { chainIndex: 0, chainLen: 1 };
    let kind = SP_KINDS.NORMAL;
    if (accent) kind = SP_KINDS.NAME;
    else if (duration >= SP_LONG_MIN_SEC) kind = SP_KINDS.LONG;
    else if (chainLen >= SP_CHAIN_MIN) kind = SP_KINDS.CHAIN;
    else if (duration <= SP_SHORT_MAX_SEC) kind = SP_KINDS.SHORT;
    const half = SP_HOT_WINDOW_SEC / 2;
    const density = starts.filter((s) => s >= call.start - half && s <= call.start + half).length;
    // 【r9-fx】コールの種類（判定できないときは「ふつう」）
    const k = kinds[index] ?? { kind: CALL_KINDS.NORMAL, beats: 1, run: 0, runLen: 1, lead: 0, oshi: false, names: { colors: [] } };
    const fx = k.kind;
    // 【r12-calls】1 件を表示のために区切らない（segs はいつも空。beats は回数の情報だけで、時刻には使わない）
    const segs = [];
    const beats = Math.max(1, Math.min(64, k.beats || 1));
    const fxColors = fx === CALL_KINDS.NAME ? (k.oshi ? OSHI_COLORS : accent ? accent.colors : k.names?.colors ?? []) : [];
    return {
      ...call,
      kind,
      chainIndex,
      chainLen,
      hot: density >= SP_HOT_MIN_CALLS,
      nameKind,
      colors: accent ? accent.colors : [],
      size: spectacleSizeClass(call.text),
      fx,
      fxReason: k.reason ?? "",
      segs,
      beats,
      run: k.run ?? 0,
      runLen: k.runLen ?? 1,
      lead: fx === CALL_KINDS.NAME ? k.lead ?? 0 : 0,
      oshi: Boolean(k.oshi),
      fxColors,
    };
  });
  const flashes = planFlashes(items);
  return items.map((item, index) => ({ ...item, flashes: flashes[index] }));
}

// 飛び出す拡大（from → over → 1）
function popScale(age, { from, over, peakAt, settleAt }) {
  if (age <= 0) return from;
  if (age < peakAt) return from + (over - from) * ease(age / peakAt);
  if (age < settleAt) return over + (1 - over) * ease((age - peakAt) / (settleAt - peakAt));
  return 1;
}

// 種類ごとの飛び出し方。短い（おい！）は小さな点から一気に爆発、長いものは重く大きく押し出す
const POP = {
  [SP_KINDS.SHORT]: { from: 0.3, over: 1.28, peakAt: 0.09, settleAt: 0.24, wash: 0.5 },
  [SP_KINDS.CHAIN]: { from: 0.6, over: 1.16, peakAt: 0.07, settleAt: 0.2, wash: 0.4 },
  [SP_KINDS.NAME]: { from: 0.45, over: 1.18, peakAt: 0.12, settleAt: 0.34, wash: 0.45 },
  [SP_KINDS.NORMAL]: { from: 0.55, over: 1.14, peakAt: 0.12, settleAt: 0.32, wash: 0.35 },
  [SP_KINDS.LONG]: { from: 0.6, over: 1.1, peakAt: 0.16, settleAt: 0.42, wash: 0.3 },
};
// 【r9-fx】種類ごとの飛び出し方（上の時間の形より優先）。短い掛け声は点から一瞬で、特殊は奥から（暗転のあと）
const FX_POP = {
  shout: { from: 0.18, over: 1.36, peakAt: 0.07, settleAt: 0.2 },
  special: { from: 0.04, over: 1.42, peakAt: 0.2, settleAt: 0.46 },
  cue: { from: 0.94, over: 1.02, peakAt: 0.16, settleAt: 0.3 },
  kojo: { from: 0.86, over: 1.05, peakAt: 0.22, settleAt: 0.5 },
  sing: { from: 0.8, over: 1.06, peakAt: 0.16, settleAt: 0.4 },
};
// 脈打つ（終わりまで「今まさに叫んでいる」を保つ）種類。短い・続けて来るものは脈打つ前に終わる
const SUSTAIN = new Set([SP_KINDS.NAME, SP_KINDS.NORMAL, SP_KINDS.LONG]);
// 自分の動き（区切り・回数・弾み）を持つ種類は、時間の形の脈打ちを重ねない
const OWN_MOTION = new Set([CALL_KINDS.FUWA]);

const IDLE = Object.freeze({
  key: null,
  kind: null,
  fx: null,
  index: -1,
  word: { o: 0, s: 1, x: 0, y: 0, r: 0 },
  stage: 0,
  wash: 0,
  burst: 0,
  heat: 0,
  beams: 0.22,
  dark: 0,
  sub: null,
});

// 時刻 t の演出の状態（純粋関数）。plan は planSpectacle の結果（start の昇順）。
// 戻り値：{ key, kind, fx, index,
//   word: { o 濃さ, s 拡大, x 横のずれ, y 縦のずれ（どちらも空いている幅・高さに対する割合 -1〜1）, r 傾き（度） },
//   stage 会場（暗幕・光線・ペンライト）の濃さ, wash 画面全体の光, burst 始まりの爆発（光の輪・光の筋）,
//   heat 長いコールの進み具合（進むほど光線が濃く）, beams 背景の光の柱の強さ,
//   dark 暗転（【r12-calls】使わない。いつも 0） }
// 【r12-calls】1 件の中を区切り・回数・文字で分けた番号（seg・beat・lit）や、名前の溜め（named）は持たない（1 件はまるごと 1 つの塊）
export function spectacleStateAt(plan, t, { reduced = false } = {}) {
  const list = Array.isArray(plan) ? plan : [];
  const time = Number.isFinite(t) ? t : 0;
  let index = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].start <= time) index = i;
    else break;
  }
  if (index < 0) return IDLE;
  // 【r12-calls】本人の時刻で 2 件が重なるとき：後から始まった件が終わっても、先の件がまだ続くなら、先の件を主に戻す
  if (time >= list[index].end) {
    for (let j = index - 1; j >= 0; j--) {
      if (list[j].start <= time && list[j].end - time >= SP_OVERLAP_MIN_SEC) {
        index = j;
        break;
      }
    }
  }
  const item = list[index];
  // 次のコール：まだ始まっていない最初の件（重なりで主を戻したときも、すでに始まった件を「次」にしない）
  const next = list.slice(index + 1).find((x) => x.start > time) ?? null;
  const prev = list[index - 1] ?? null;
  const bridgedOut = Boolean(next && next.start - item.end <= SP_BRIDGE_SEC);
  const bridgedIn = Boolean(prev && item.start - prev.end <= SP_BRIDGE_SEC);
  const base = item.hot ? 0.42 : 0.26;
  const tailEnd = Math.min(item.end + SP_TAIL_SEC, next ? next.start : Infinity);
  if (time >= tailEnd) {
    // 文字は消えた。次のコールがすぐ来るなら、会場は下ろしたまま（少し暗く）待つ
    if (bridgedOut) return { ...IDLE, key: item.key, kind: item.kind, fx: item.fx ?? null, index, stage: reduced ? 1 : SP_BRIDGE_LEVEL, beams: item.hot ? 0.3 : IDLE.beams };
    return { ...IDLE, beams: item.hot ? 0.3 : IDLE.beams };
  }
  const age = time - item.start;
  const duration = item.end - item.start;
  const kind = item.kind;
  const fx = item.fx ?? CALL_KINDS.NORMAL;
  // 大きな文字：コールの始まりから終わりまで、ずっと出す（途中で戻さない）。終わったら最大 0.35 秒で、広がりながら消える
  const fadeIn = reduced ? 0.16 : 0.05;
  let o = clamp01(age / fadeIn);
  let fadeP = 0;
  if (time >= item.end) {
    fadeP = tailEnd > item.end ? clamp01((time - item.end) / (tailEnd - item.end)) : 1;
    o *= 1 - ease(fadeP);
  }
  const pop = POP[kind] ?? POP[SP_KINDS.NORMAL];
  const fxPop = FX_POP[fx] ?? pop;
  let s = 1;
  let x = 0;
  let y = 0;
  let r = 0;
  let burst = reduced ? 0 : clamp01(1 - age / 0.45);
  const dark = 0;
  const inCall = time < item.end;
  if (!reduced) s = popScale(age, fxPop);
  // ---- 種類ごとの動き ----
  // 【r12-calls】本人の依頼「本人が切った所以外は、勝手に切って表示しないでほしい」：
  //   1 件（本人が区切った単位）は、その件の開始〜終了の間、まるごと 1 つの塊で出す。
  //   1 件の中を区切り・回数・文字で分けて別の時刻に出す見せ方（r9-fx の MIX の区切り・回数の跳ね・1 文字ずつ灯る・名前の溜め・特殊の暗転）はやめた。
  //   動きは「始まりで飛び出す・終わりまで出したまま（脈打つ）・終わりで消える」と、時刻を作らない一定の動き（ふわふわの弾み）だけ
  if (fx === CALL_KINDS.MIX) {
    // MIX：全文を 1 つの塊で。進むほど少しずつ大きく（1 件の進み具合だけ。区切りの時刻は作らない）
    if (!reduced) s *= 1 + 0.06 * clamp01(age / duration);
  } else if (fx === CALL_KINDS.SHOUT) {
    // 続くときは 1 回ごとに 左 → 右 → 中央 → 全体（1 件ずつ、その件の時刻で出す。1 回だけのときは中央に大きく）
    const spot = item.runLen > 1 ? SP_SHOUT_SPOTS[item.run % SP_SHOUT_SPOTS.length] : SP_SHOUT_SPOTS[3];
    if (!reduced) {
      x = spot.x;
      y = spot.y;
      r = spot.r;
      s *= spot.s;
    }
  } else if (fx === CALL_KINDS.FUWA) {
    // ふわふわ・あーふふー：左右に弾む（全曲で同じ動き。時刻を作らない一定の動き）
    if (!reduced) {
      const ph = age * 1.5; // 1 秒に 1.5 回弾む
      y = -0.55 * Math.abs(Math.sin(Math.PI * ph));
      x = 0.35 * Math.sin(Math.PI * ph * 0.5 + Math.PI / 2) * -1;
      r = 6 * Math.sin(Math.PI * ph * 0.5);
      const land = 1 - Math.abs(Math.sin(Math.PI * ph));
      s *= 1 + 0.06 * (1 - land) - 0.04 * Math.pow(land, 6);
    }
  } else if (fx === CALL_KINDS.SPECIAL) {
    // 特殊：始まりで、奥から回りながら一気に飛び出す（最後は読める向き）
    if (!reduced) {
      r = -200 * (1 - easeOutCubic(age / 0.34));
      burst = clamp01(1 - age / 0.55);
    }
  } else if (fx === CALL_KINDS.CUE) {
    // 動作の合図：上から札のように下りてきて、そのまま
    if (!reduced) {
      y = -0.6 * (1 - easeOutCubic(age / 0.3));
      burst = 0;
    }
  } else if (kind === SP_KINDS.CHAIN && !reduced) {
    // 【r8-fx から】種類が決まらない続けて来るコール：1 件ごとに置き場所を変える
    const [cx, cr] = SP_CHAIN_SPOTS[item.chainIndex % SP_CHAIN_SPOTS.length];
    x = cx * 4;
    r = cr;
  }
  // 終わるまで「今まさに叫んでいる」：ゆっくり脈打つ（大きさだけ。明るさは変えない）
  if (!reduced && SUSTAIN.has(kind) && !OWN_MOTION.has(fx) && age >= (fxPop.settleAt ?? pop.settleAt) && inCall) {
    s *= 1 + SP_PULSE_AMP * (0.5 - 0.5 * Math.cos((age - (fxPop.settleAt ?? pop.settleAt)) * Math.PI * 2 * SP_PULSE_HZ));
  }
  if (reduced) {
    s = 1;
    x = 0;
    y = 0;
    r = 0;
  }
  if (!reduced && fadeP > 0) s *= 1 + 0.12 * fadeP; // 消えるときは外へ弾けるように
  // 会場（暗幕・光線・ペンライト）：コールの間ずっと。続けて来るコールの間は下ろしたまま（点滅させない）
  const stageIn = bridgedIn ? 1 : clamp01(age / (reduced ? 0.16 : 0.08));
  let stage = stageIn;
  if (fadeP > 0) stage *= bridgedOut ? 1 - (1 - SP_BRIDGE_LEVEL) * ease(fadeP) : 1 - ease(fadeP);
  if (reduced && bridgedOut) stage = stageIn;
  // 画面全体の光：planSpectacle が決めた予定（1 秒に 3 回まで）だけ
  let wash = 0;
  for (const f of item.flashes ?? []) {
    const a = time - f.t;
    if (a >= 0 && a < 0.6) wash = Math.max(wash, f.s * Math.exp(-a / 0.22));
  }
  if (reduced) wash *= 0.4;
  if (fadeP > 0) wash *= 1 - fadeP;
  // 長めのコール：進むほど光線が濃く、ペンライトが明るく（途中で弱くならない）
  const heat = duration >= 2 ? clamp01(age / duration) : 0;
  let beams = base + (reduced ? 0 : 0.45 * Math.exp(-age / 0.45));
  if (kind === SP_KINDS.LONG) beams = Math.max(beams, base + 0.35 * heat);
  // 【r12-calls】重なり：本人の時刻で、先に始まった件がまだ続いている間は、その件の全文を「補助の表示」（小さめ・上）に出す。
  //   どちらの件も全文のまま・それぞれの開始〜終了のまま（分けない・等分しない）。0.2 秒未満のわずかな重なりは出さない（一瞬の点滅にしない）
  let sub = null;
  for (let j = index - 1; j >= 0; j--) {
    const other = list[j];
    if (!(other.start <= time && other.end + SP_SUB_TAIL_SEC > time)) continue;
    if (Math.min(other.end, item.end) - Math.max(other.start, item.start) < SP_OVERLAP_MIN_SEC) continue;
    // 先の件は、主から補助へ切れ目なく移る（出たままにする。終わりのあと 0.25 秒で消える）
    const so = time < other.end ? 1 : 1 - clamp01((time - other.end) / SP_SUB_TAIL_SEC);
    sub = { key: other.key, index: j, o: r3(so) };
    break;
  }
  // 後から始まった件が先に終わったときは、その件を補助に（先の件が主に戻る）
  if (!sub && index + 1 < list.length) {
    for (let j = index + 1; j < list.length; j++) {
      const other = list[j];
      if (other.start > time) break;
      if (other.end + SP_SUB_TAIL_SEC > time && other.end <= time && Math.min(other.end, item.end) - other.start >= SP_OVERLAP_MIN_SEC) {
        sub = { key: other.key, index: j, o: r3(1 - clamp01((time - other.end) / SP_SUB_TAIL_SEC)) };
      }
    }
  }
  return {
    key: item.key,
    kind,
    fx,
    index,
    sub,
    word: { o: r3(o), s: r3(s), x: r3(x), y: r3(y), r: r3(r) },
    stage: r3(stage),
    wash: r3(wash),
    burst: r3(burst),
    heat: r3(heat),
    beams: r3(Math.min(1, beams)),
    dark: r3(dark),
  };
}

// ===== ペンライト（純粋関数） =====
// 【r12-calls】本人の依頼「ペンライトは動きが速い。動かさなくていい。ずっと固定で、色だけ変える。コール中に動かすと変に見える」：
//   位置・角度は固定（振らない・回さない・揺らさない）。変わるのは色（種類・メンバーカラー）と、会場の点灯・消灯の明るさだけ。
// i 本目（count 本中）のペンライトの向き。どの時刻でも同じ（客席の広がりに合わせて、左の人は少し左・右の人は少し右に傾けたまま）。
// 戻り値：{ a 角度（度。持ち手が軸）, y 上下（いつも 0）, v 振りの速さ（いつも 0） }
export function penlightPoseAt(plan, t, i, count) {
  const n = Math.max(1, count);
  const xpos = n > 1 ? i / (n - 1) : 0.5; // 0 左端 〜 1 右端
  return { a: r3((xpos - 0.5) * 14 + ((i * 7) % 5) - 2), y: 0, v: 0 };
}

// 光線（放射の光）の色の並び（純粋関数）：色を順番に、細い光の筋にして一周に並べる
export function spectacleRays(colors, count = SP_RAY_COUNT) {
  const list = colors?.length ? colors : SP_VENUE_COLORS;
  const step = 360 / count;
  const stops = [];
  for (let i = 0; i < count; i++) {
    const c = list[i % list.length];
    const a = i * step;
    stops.push(`transparent ${r3(a)}deg`, `${c} ${r3(a + step * 0.12)}deg`, `transparent ${r3(a + step * 0.26)}deg`, `transparent ${r3(a + step)}deg`);
  }
  return `conic-gradient(from -4deg at 50% 50%, ${stops.join(", ")})`;
}

// ペンライトの色（純粋関数）：名前コールは、その人たちの色を順番に（1人なら全部その色）。それ以外は会場の4色
export function spectacleCrowdColors(item, count) {
  const list = item?.colors?.length ? item.colors : SP_VENUE_COLORS;
  return Array.from({ length: count }, (_, i) => list[i % list.length]);
}

// 【r9-fx】種類ごとのペンライトの色（純粋関数）。名前：その人たちの色（複数・or は混ぜて並べる。左右で等分の帯にしない）。
// それ以外：種類の色
export function fxCrowdColors(item, count, hue = 0) {
  const named = item?.fx === CALL_KINDS.NAME && item?.fxColors?.length;
  const list = named ? item.fxColors : (SP_FX[item?.fx] ?? SP_FX.normal).palette;
  const n = list.length;
  // 3 ずつ飛ばして並べる（4 色なら 0,3,2,1,… と混ざる。同じ色が隣に並び続けない）
  const step = n % 3 === 0 ? 2 : 3;
  return Array.from({ length: count }, (_, i) => list[(i * step + hue) % n]);
}

// ===== 画面の部品（画面に1組だけ） =====
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// 演出の層を作る。層は2枚：
//   後ろ（back）… 背景の光の柱（コールの無い間も控えめに）。文字（歌詞・コール表）の後ろに置く
//   前（front）… 会場（暗幕・光線・サーチライト・スポットライト・ペンライトの群れ）と大きな文字・画面全体の光。舞台の上に重ねる（押す操作は下へ通す）
//     カラオケ：会場は画面いっぱい（歌詞・カードは隠れる）。ライブコール：会場は舞台の上の帯（place が位置と大きさを返す）
// host：前の層を入れる所。options：{ variant: "live" | "karaoke", palette: [色1, 色2], backHost, backBefore, place }
// place(item, { fit(最大の幅, 最大の高さ, 最大の文字の大きさ) → 文字の高さ, layerTop })：文字の大きさを決め、そのコールを出す位置
//   { y, x?, w?, h?, t? }（画面の px。x・w・h はライブコールの帯、t・h はカラオケの会場の上端と高さ）を返す（無ければ画面の決まった位置・決まった大きさ）
// follow：true なら、コールの間 SP_FOLLOW_SEC ごとに位置だけ測り直す（ライブコール：自動スクロールで光っている行が動いても、帯で隠し続けない。
//   文字の大きさは変えない。帯は CSS でなめらかに移る）
// 戻り値：{ layer, back, setPlan(plan), update(t, { playing, enabled, reduced }), destroy(), state() }
export function createSpectacle(host, { variant = "live", palette = ["#ff6fa8", "#8f7dff"], backHost = null, backBefore = null, place = null, follow = false } = {}) {
  if (!host) return null;
  const layer = el("div", `sp-layer sp-front sp-${variant}`);
  const back = el("div", `sp-layer sp-back sp-${variant}`);
  for (const node of [layer, back]) {
    node.setAttribute("aria-hidden", "true");
    node.hidden = true;
    node.style.setProperty("--sp-p1", palette[0]);
    node.style.setProperty("--sp-p2", palette[1] ?? palette[0]);
  }
  const beams = back.appendChild(el("div", "sp-beams"));
  for (let i = 0; i < SP_BEAM_COUNT; i++) {
    const beam = beams.appendChild(el("i"));
    // 位置・角度・速さは番号から決める（毎回同じ。乱数を使わない）
    beam.style.setProperty("--x", `${8 + i * (84 / (SP_BEAM_COUNT - 1))}%`);
    beam.style.setProperty("--a", `${(i % 2 ? 1 : -1) * (10 + (i % 3) * 5)}deg`);
    beam.style.setProperty("--d", `${(2.2 + (i % 3) * 0.55).toFixed(2)}s`);
    beam.style.setProperty("--delay", `${(-i * 0.37).toFixed(2)}s`);
    beam.style.setProperty("--c", `var(--sp-c${(i % 3) + 1})`);
  }
  const wash = layer.appendChild(el("div", "sp-wash"));
  // 会場（暗幕・光線・サーチライト・スポットライト・ふわふわの光の玉・ペンライトの群れ・暗転）
  const box = layer.appendChild(el("div", "sp-box"));
  box.appendChild(el("div", "sp-veil"));
  const rays = box.appendChild(el("div", "sp-rays"));
  box.appendChild(el("div", "sp-search"));
  // 【r9-fx】スポットライト（名前：その人の色が交差。特殊：金。口上：白い 1 本）。4 本まで
  const spots = box.appendChild(el("div", "sp-spots"));
  const spotEls = Array.from({ length: 4 }, (_, i) => {
    const spot = spots.appendChild(el("b"));
    spot.style.setProperty("--k", String(i));
    return spot;
  });
  // 【r9-fx】ふわふわの光の玉（ふわふわ・あーふふーのときだけ見せる）
  const bubbles = box.appendChild(el("div", "sp-bubbles"));
  for (let i = 0; i < 6; i++) {
    const b = bubbles.appendChild(el("b"));
    b.style.setProperty("--x", `${8 + i * 16 + ((i * 7) % 5)}%`);
    b.style.setProperty("--d", `${(2.6 + (i % 3) * 0.5).toFixed(2)}s`);
    b.style.setProperty("--delay", `${(-i * 0.61).toFixed(2)}s`);
    b.style.setProperty("--s", `${(0.7 + (i % 3) * 0.25).toFixed(2)}`);
  }
  const crowd = box.appendChild(el("div", "sp-crowd"));
  const crowdCount = SP_CROWD_COUNT[variant] ?? SP_CROWD_COUNT.live;
  // 【r9-fx】ペンライト：持ち手（sp-grip）と発光部（先の丸い筒 sp-tube）・光の広がり（sp-halo）。
  // 【r12-calls】向きは作ったときに 1 回だけ決めて、あとは動かさない（振らない・残像なし）。変わるのは色（--c）と会場の明るさだけ
  const sticks = [];
  for (let i = 0; i < crowdCount; i++) {
    // 後ろの列（小さく・暗く）と前の列（大きく）を交互に。位置は番号から決める（毎回同じ）
    const row = i % 2;
    const stick = crowd.appendChild(el("i", row ? "is-front" : "is-back"));
    const slot = (i + 0.5) / crowdCount;
    stick.style.setProperty("--x", `${r3(5 + slot * 90 + (row ? 1.5 : -1.5))}%`);
    stick.appendChild(el("b", "sp-halo"));
    stick.appendChild(el("b", "sp-tube"));
    stick.appendChild(el("b", "sp-grip"));
    stick.style.transform = `rotate(${penlightPoseAt(null, 0, i, crowdCount).a}deg)`;
    sticks.push({ stick, row });
  }
  // 【r9-fx】特殊の暗転（会場の上に一瞬だけ黒）
  const darkEl = box.appendChild(el("div", "sp-dark"));
  const word = layer.appendChild(el("div", "sp-word"));
  const burst = word.appendChild(el("span", "sp-burst"));
  const sparks = word.appendChild(el("span", "sp-sparks"));
  const text = word.appendChild(el("span", "sp-word-text"));
  // 【r12-calls】重なりの補助の表示（先に始まった件の全文。小さめ・会場の上の端）
  const subEl = layer.appendChild(el("div", "sp-sub"));
  const subText = subEl.appendChild(el("span", "sp-sub-text"));
  let shownSub = null;
  host.appendChild(layer);
  const backParent = backHost ?? host;
  if (backBefore && backBefore.parentNode === backParent) backParent.insertBefore(back, backBefore);
  else backParent.insertBefore(back, backParent.firstChild);

  let plan = [];
  let lastKey = undefined;
  const written = new Map();
  const set = (node, prop, value) => {
    const id = node;
    let map = written.get(id);
    if (!map) written.set(id, (map = new Map()));
    if (map.get(prop) === value) return;
    map.set(prop, value);
    node.style[prop] = value;
  };
  const toggle = (name, on) => {
    for (const node of [layer, back]) if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
  };
  const setVar = (name, value) => {
    layer.style.setProperty(name, value);
    back.style.setProperty(name, value);
  };
  let current = IDLE;
  let chars = []; // 1 文字ずつの部品（ふわふわの弾み。文字は本人のまま）
  let free = { x: 0, y: 0 }; // 文字を動かせる余白（px。コールが変わったときに1回だけ測る）

  function setColors(item) {
    const hue = 0;
    const named = Boolean(item?.colors?.length);
    const fxNamed = item?.fx === CALL_KINDS.NAME && item?.fxColors?.length;
    const theme = SP_FX[item?.fx] ?? SP_FX.normal;
    // 名前：その人たちの色。それ以外：種類の色
    const list = fxNamed ? item.fxColors : theme.palette;
    const pick = (k) => list[(k + hue) % list.length];
    const c1 = fxNamed ? list[0] : pick(0);
    const c2 = fxNamed ? list[1] ?? list[0] : pick(1);
    const c3 = fxNamed ? list[2] ?? list[0] : pick(2);
    setVar("--sp-c1", c1);
    setVar("--sp-c2", c2);
    setVar("--sp-c3", c3);
    // 光線：名前コールはその人たちの色と白、それ以外は種類の色
    layer.style.setProperty("--sp-rays", spectacleRays(fxNamed ? (list.length === 1 ? [list[0], "#ffffff"] : list) : [pick(0), pick(1), pick(2), pick(3 % list.length)]));
    // ペンライトの群れ
    fxCrowdColors(item, sticks.length, hue).forEach((c, i) => sticks[i].stick.style.setProperty("--c", c));
    // スポットライト：名前はその人たちの色（1 人なら、その色と白）。そのほかは種類の色
    const spotColors = fxNamed ? (list.length === 1 ? [list[0], "#ffffff", list[0], "#ffffff"] : list) : [pick(0), pick(1), pick(2), pick(3 % list.length)];
    spotEls.forEach((spot, i) => {
      spot.style.setProperty("--c", spotColors[i % spotColors.length]);
      spot.hidden = fxNamed ? i >= Math.max(2, Math.min(4, list.length)) : false;
    });
    // 文字の立体の影の色（名前コールは最初の人の色、それ以外は種類の 1 色目／ふつうは濃いピンク）
    layer.style.setProperty("--sp-ex", named ? item.colors[0] : item?.fx && item.fx !== CALL_KINDS.NORMAL ? (theme.palette[0] === "#ffffff" ? theme.palette[1] : c1) : "#ff2d95");
  }

  // 文字を 1 文字ずつの部品にする（文字は本人のまま。つなげると元の文字列）
  // 言葉（「！」・空白・改行までのまとまり）ごとに、途中で折り返さない箱に入れる（「ふわふ／わ！」にしない）。
  // ただし 9 文字以上の長いまとまり（口上の文など）は、どこでも折り返してよい（文字を小さくしすぎない）
  function splitChars(target, source) {
    target.textContent = "";
    chars = [];
    let group = null;
    const all = [...source];
    // まとまりの長さを先に数える
    const lengths = [];
    let n = 0;
    all.forEach((ch, i) => {
      if (/\s/.test(ch)) {
        if (n) lengths.push(n);
        n = 0;
        return;
      }
      n += 1;
      if (/[!！?？、,]/.test(ch) && !/[!！?？]/.test(all[i + 1] ?? "")) {
        lengths.push(n);
        n = 0;
      }
    });
    if (n) lengths.push(n);
    let gi = 0;
    all.forEach((ch, i) => {
      // 空白・改行はそのまま（折り返しは本人の改行・空白の所で）
      if (/\s/.test(ch)) {
        if (group) gi += 1;
        group = null;
        target.appendChild(document.createTextNode(ch));
        return;
      }
      if (!group) {
        group = target.appendChild(el("span", (lengths[gi] ?? 0) <= 8 ? "sp-wd" : "sp-wd is-long"));
      }
      const span = group.appendChild(el("span", "sp-ch"));
      span.textContent = ch;
      span.style.setProperty("--i", String(i));
      chars.push(span);
      if (/[!！?？、,]/.test(ch) && !/[!！?？]/.test(all[i + 1] ?? "")) {
        group = null;
        gi += 1;
      }
    });
  }

  function showItem(item) {
    layer.dataset.kind = item?.kind ?? "";
    layer.dataset.fx = item?.fx ?? "";
    layer.dataset.size = item?.size ?? "";
    layer.dataset.names = item?.nameKind ?? "";
    toggle("is-hot", Boolean(item?.hot));
    chars = [];
    word.classList.remove("is-named", "is-build", "is-oneline", "is-finale");
    if (!item) {
      text.textContent = "";
      return;
    }
    const fx = item.fx;
    // 文字は本人のコールのまま。名前の部分だけ、その人の色の光（js/liveCallNames.js の部品）
    if (item.kind === SP_KINDS.NAME) {
      renderNameCallText(text, item.text);
      // 名前の前の言葉（超絶かわいい！）をまとめて少し小さく（見た目だけ。名前と同じ時刻に、まるごと出す）
      const firstName = text.querySelector(".cx-name-part");
      if (fx === CALL_KINDS.NAME && item.lead > 0 && firstName) {
        const lead = el("span", "sp-lead");
        while (text.firstChild && text.firstChild !== firstName) lead.appendChild(text.firstChild);
        text.insertBefore(lead, firstName);
      }
      if (fx === CALL_KINDS.NAME) word.classList.add("is-named");
    } else if (fx === CALL_KINDS.FUWA) splitChars(text, item.text);
    else text.textContent = item.text; // 【r12-calls】MIX・連続・口上なども、1 件の全文を 1 つの塊で
    setColors(item);
    placeItem(item);
  }

  // 文字の大きさを、出せる幅・高さに収まる一番大きな値にする（コールが変わったときに1回だけ測る。毎フレームは測らない）。
  // 言葉の途中では折り返さない（空白・改行・「！」の後ろで折り返す）。どうしても入らないときだけ途中でも折り返す（.is-tight）。
  // 戻り値：文字の高さ（px）
  function fitWord(maxW, maxH, cap) {
    const width = Math.max(40, Math.floor(maxW));
    const height = Math.max(30, Math.floor(maxH));
    let size = Math.max(18, Math.floor(cap));
    layer.style.setProperty("--sp-ww", `${width}px`);
    word.classList.remove("is-tight");
    for (;;) {
      layer.style.setProperty("--sp-fs", `${size}px`);
      const sw = text.scrollWidth;
      const oh = word.offsetHeight;
      if ((sw <= width + 1 && oh <= height) || size <= 18) break;
      // 【r9-fx】はみ出した割合の分だけ一気に小さくする（画面の計算の回数を減らす）。そのあとは少しずつ
      const ratio = Math.min(sw > width ? width / sw : 1, oh > height ? height / oh : 1);
      size = Math.max(18, Math.floor(size * Math.min(0.92, Math.max(0.5, ratio))));
    }
    if (text.scrollWidth > width + 1) word.classList.add("is-tight");
    return word.offsetHeight;
  }

  // 飛び出すときに大きくなる種類は、その分だけ幅に余裕を持たせる（大きくなった瞬間に端が切れないように）。
  // 画面に収めるための折り返しは自然に（折り返した行を別の時刻にはしない）
  const FIT_ROOM = { special: 0.8, shout: 0.84, name: 0.86, mix: 0.94 };
  function fitFor(item) {
    const room = FIT_ROOM[item?.fx] ?? 1;
    return room === 1 ? fitWord : (maxW, maxH, cap) => fitWord(maxW * room, maxH, cap);
  }

  // 位置を決める（コールが変わったときに1回。follow のときは、そのあと SP_FOLLOW_SEC ごとに位置だけ。毎フレームは測らない）
  let placedAt = 0;
  function placeItem(item, { again = false } = {}) {
    if (typeof place !== "function") {
      measureFree();
      return;
    }
    placedAt = now();
    // 測り直し（follow）のときだけ、なめらかに移す（新しいコールは、その場所にすぐ出す）
    if (layer.classList.contains("is-follow") !== again) layer.classList.toggle("is-follow", again);
    let spot = null;
    try {
      const { top: layerTop, left: layerLeft } = layer.getBoundingClientRect();
      const keepSize = () => word.offsetHeight; // 測り直しのときは、文字の大きさを変えない
      spot = place(item, { fit: again ? keepSize : fitFor(item), layerTop, layerLeft });
    } catch {
      spot = null;
    }
    if (spot && Number.isFinite(spot.y)) setVar("--sp-y", `${Math.round(spot.y)}px`);
    else {
      layer.style.removeProperty("--sp-y");
      back.style.removeProperty("--sp-y");
    }
    for (const [key, name] of [["x", "--sp-bx"], ["w", "--sp-bw"], ["h", "--sp-bh"], ["t", "--sp-bt"]]) {
      if (spot && Number.isFinite(spot[key])) layer.style.setProperty(name, `${Math.round(spot[key])}px`);
      else layer.style.removeProperty(name);
    }
    if (!again) measureFree();
  }

  // 文字を左右・上下に動かせる余白（会場の大きさ − 文字の大きさ）。コールが変わったときに1回だけ
  function measureFree() {
    try {
      const bw = box.offsetWidth || layer.offsetWidth || 0;
      const bh = box.offsetHeight || layer.offsetHeight || 0;
      const ww = word.offsetWidth || 0;
      const wh = word.offsetHeight || 0;
      free = { x: Math.max(0, (bw - ww) / 2 - 10), y: Math.max(0, Math.min((bh - wh) / 2 - 8, bh * 0.22)) };
    } catch {
      free = { x: 0, y: 0 };
    }
  }

  const api = {
    layer,
    back,
    setPlan(next) {
      plan = Array.isArray(next) ? next : [];
      lastKey = undefined;
    },
    plan: () => plan,
    state: () => current,
    // playing：音が進んでいるか。enabled：演出を出すか（演出なし・コール表示 OFF のときは false）
    update(t, { playing = true, enabled = true, reduced = false } = {}) {
      if (!enabled || !plan.length) {
        layer.hidden = true;
        back.hidden = true;
        current = IDLE;
        return IDLE;
      }
      layer.hidden = false;
      back.hidden = false;
      toggle("is-paused", !playing);
      toggle("is-reduced", reduced);
      // 止まっている間は、大きな文字・会場を出さない（CSS で消す。動きも止める）。再開すると、その時刻の正しい見た目から
      const s = playing ? spectacleStateAt(plan, t, { reduced }) : IDLE;
      current = s;
      if (s.key !== lastKey) {
        showItem(s.index >= 0 ? plan[s.index] : null);
        lastKey = s.key;
      } else if (follow && s.word.o > 0 && s.index >= 0 && now() - placedAt >= SP_FOLLOW_SEC * 1000) {
        placeItem(plan[s.index], { again: true });
      }
      // 会場が出ている間だけ、光線の回転などを動かす（出ていない間は CSS のアニメーションを止める）
      if (layer.classList.contains("is-on") !== s.stage > 0) layer.classList.toggle("is-on", s.stage > 0);
      const { o, s: scale, x, y, r } = s.word;
      set(word, "opacity", String(o));
      set(word, "transform", `translate(-50%, -50%) translate(${Math.round(x * free.x)}px, ${Math.round(y * free.y)}px) rotate(${r}deg) scale(${scale})`);
      set(box, "opacity", String(s.stage));
      set(rays, "opacity", String(r3(0.55 + 0.4 * s.heat)));
      set(crowd, "opacity", String(r3(0.85 + 0.15 * s.heat)));
      set(burst, "opacity", String(s.burst));
      set(burst, "transform", `translate(-50%, -50%) scale(${r3(0.45 + 1.1 * (1 - s.burst))})`);
      set(sparks, "opacity", String(s.burst));
      set(sparks, "transform", `translate(-50%, -50%) scale(${r3(0.5 + 1.1 * (1 - s.burst))})`);
      set(wash, "opacity", String(s.wash));
      set(beams, "opacity", String(s.beams));
      set(darkEl, "opacity", String(s.dark));
      // 【r12-calls】重なりの補助の表示：件が変わったときだけ文字を入れ替える（本人の全文のまま）
      const subKey = s.sub ? s.sub.key : null;
      if (subKey !== shownSub) {
        shownSub = subKey;
        const subItem = s.sub ? plan[s.sub.index] : null;
        if (subItem?.kind === SP_KINDS.NAME) renderNameCallText(subText, subItem.text);
        else subText.textContent = subItem ? subItem.text : "";
        subEl.dataset.fx = subItem?.fx ?? "";
      }
      set(subEl, "opacity", String(s.sub ? s.sub.o : 0));
      // 【r12-calls】ペンライトは動かさない（向きは作ったときのまま。毎フレーム書かない）
      return s;
    },
    destroy() {
      layer.remove();
      back.remove();
      plan = [];
    },
  };
  return api;
}
