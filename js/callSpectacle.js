// コールの「大きな演出」（2026-11-01 r7-live 新設 → 2026-11-01 r8-fx で作り直し）。
// 新しいライブコール（演出 あり）と新しいカラオケ（コール表示 ON）の共通の部品。
//
// 【r8-fx：本人の依頼（REQUEST_R8 の 1）】
//   「ただ光っているだけ」「最初の2秒だけ光って、あとは戻る」「色がダサい」→
//   ・コールの始まりから終わりまで、ずっと大きな文字が飛び出したまま（長いコール・MIX・名前つきでも途中で弱くしない）。
//   ・カラオケはコール中は全画面（歌詞は隠れてよい）。ライブコールは舞台の上の大きな帯（いま／つぎ・光っている行は隠さない）。
//   ・ライブ会場の見た目：ペンライトの群れ（振れ続ける）・ステージの光線（放射の光・サーチライト）・ネオンの紫／ピンク／青／オレンジ。
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
// 【軽さ】部品は画面に1組だけ（コールの数だけ作らない。ペンライトはカラオケ 14 本・ライブコール 10 本）。
//   動かすのは transform・opacity だけで、値が変わったときだけ書く。繰り返しの動き（ペンライトの振り・光線の回転）は CSS で、
//   コールが出ている間だけ動かす（一時停止中・非表示・コールの無い間は止める）。ぼかし（filter）は使わない。
import { describeNameCall, nameCallAccent, renderNameCallText, NAME_KINDS } from "./liveCallNames.js";

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
export const SP_CROWD_COUNT = { karaoke: 14, live: 10 };
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

// コールの並び（本人の開始・終了・文字）から、演出の種類を決める（純粋関数。同じデータなら同じ結果）。
// calls：[{ key, text, start, end }]。時刻の無いもの・終了が開始より前のものは入れない（光らせないのと同じ）
export function planSpectacle(calls, { describe = describeNameCall } = {}) {
  const list = (Array.isArray(calls) ? calls : [])
    .filter((call) => Number.isFinite(call?.start) && Number.isFinite(call?.end) && call.end > call.start)
    .map((call) => ({ key: call.key, text: String(call.text ?? ""), start: call.start, end: call.end }))
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
  return list.map((call, index) => {
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
    return {
      ...call,
      kind,
      chainIndex,
      chainLen,
      hot: density >= SP_HOT_MIN_CALLS,
      nameKind,
      colors: accent ? accent.colors : [],
      size: spectacleSizeClass(call.text),
    };
  });
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
// 0 → 1 へなめらかに
const ease = (x) => {
  const v = clamp01(x);
  return v * v * (3 - 2 * v);
};
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
// 脈打つ（終わりまで「今まさに叫んでいる」を保つ）種類。短い・続けて来るものは脈打つ前に終わる
const SUSTAIN = new Set([SP_KINDS.NAME, SP_KINDS.NORMAL, SP_KINDS.LONG]);

const IDLE = Object.freeze({ key: null, kind: null, index: -1, word: { o: 0, s: 1, x: 0, r: 0 }, stage: 0, wash: 0, burst: 0, heat: 0, beams: 0.22 });

// 時刻 t の演出の状態（純粋関数）。plan は planSpectacle の結果（start の昇順）。
// 戻り値：{ key, kind, index,
//   word: { o 濃さ, s 拡大, x 横のずれ（画面の幅の割合）, r 傾き（度） },
//   stage 会場（暗幕・光線・ペンライト）の濃さ, wash 始まりの画面全体の光, burst 始まりの爆発（光の輪・光の筋）,
//   heat 長いコールの進み具合（進むほど光線が濃く）, beams 背景の光の柱の強さ }
export function spectacleStateAt(plan, t, { reduced = false } = {}) {
  const list = Array.isArray(plan) ? plan : [];
  const time = Number.isFinite(t) ? t : 0;
  let index = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].start <= time) index = i;
    else break;
  }
  if (index < 0) return IDLE;
  const item = list[index];
  const next = list[index + 1] ?? null;
  const prev = list[index - 1] ?? null;
  const bridgedOut = Boolean(next && next.start - item.end <= SP_BRIDGE_SEC);
  const bridgedIn = Boolean(prev && item.start - prev.end <= SP_BRIDGE_SEC);
  const base = item.hot ? 0.42 : 0.26;
  const tailEnd = Math.min(item.end + SP_TAIL_SEC, next ? next.start : Infinity);
  if (time >= tailEnd) {
    // 文字は消えた。次のコールがすぐ来るなら、会場は下ろしたまま（少し暗く）待つ
    if (bridgedOut) return { ...IDLE, key: item.key, kind: item.kind, index, stage: reduced ? 1 : SP_BRIDGE_LEVEL, beams: item.hot ? 0.3 : IDLE.beams };
    return { ...IDLE, beams: item.hot ? 0.3 : IDLE.beams };
  }
  const age = time - item.start;
  const duration = item.end - item.start;
  const kind = item.kind;
  // 大きな文字：コールの始まりから終わりまで、ずっと出す（途中で戻さない）。終わったら最大 0.35 秒で、広がりながら消える
  const fadeIn = reduced ? 0.16 : 0.05;
  let o = clamp01(age / fadeIn);
  let fadeP = 0;
  if (time >= item.end) {
    fadeP = tailEnd > item.end ? clamp01((time - item.end) / (tailEnd - item.end)) : 1;
    o *= 1 - ease(fadeP);
  }
  const pop = POP[kind] ?? POP[SP_KINDS.NORMAL];
  let s = reduced ? 1 : popScale(age, pop);
  // 終わるまで「今まさに叫んでいる」：ゆっくり脈打つ（大きさだけ。明るさは変えない）
  if (!reduced && SUSTAIN.has(kind) && age >= pop.settleAt && time < item.end) {
    s *= 1 + SP_PULSE_AMP * (0.5 - 0.5 * Math.cos((age - pop.settleAt) * Math.PI * 2 * SP_PULSE_HZ));
  }
  if (!reduced && fadeP > 0) s *= 1 + 0.12 * fadeP; // 消えるときは外へ弾けるように
  const [x, r] = kind === SP_KINDS.CHAIN && !reduced ? SP_CHAIN_SPOTS[item.chainIndex % SP_CHAIN_SPOTS.length] : [0, 0];
  // 会場（暗幕・光線・ペンライト）：コールの間ずっと。続けて来るコールの間は下ろしたまま（点滅させない）
  const stageIn = bridgedIn ? 1 : clamp01(age / (reduced ? 0.16 : 0.08));
  let stage = stageIn;
  if (fadeP > 0) stage *= bridgedOut ? 1 - (1 - SP_BRIDGE_LEVEL) * ease(fadeP) : 1 - ease(fadeP);
  if (reduced && bridgedOut) stage = stageIn;
  // 画面全体の光：会場が下りてくる始まりだけ（続けて来るコールの 2 件目以降は出さない＝点滅にしない）
  let wash = bridgedIn ? 0 : pop.wash * Math.exp(-age / 0.28);
  if (reduced) wash *= 0.4;
  if (fadeP > 0) wash *= 1 - fadeP;
  // 始まりの爆発（光の輪が外へ・光の筋が飛び散る）：0.45 秒で消える
  const burst = reduced ? 0 : clamp01(1 - age / 0.45);
  // 長めのコール：進むほど光線が濃く、ペンライトが明るく（途中で弱くならない）
  const heat = duration >= 2 ? clamp01(age / duration) : 0;
  let beams = base + (reduced ? 0 : 0.45 * Math.exp(-age / 0.45));
  if (kind === SP_KINDS.LONG) beams = Math.max(beams, base + 0.35 * heat);
  return {
    key: item.key,
    kind,
    index,
    word: { o: r3(o), s: r3(s), x, r },
    stage: r3(stage),
    wash: r3(wash),
    burst: r3(burst),
    heat: r3(heat),
    beams: r3(Math.min(1, beams)),
  };
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

// ===== 画面の部品（画面に1組だけ） =====
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// 演出の層を作る。層は2枚：
//   後ろ（back）… 背景の光の柱（コールの無い間も控えめに）。文字（歌詞・コール表）の後ろに置く
//   前（front）… 会場（暗幕・光線・サーチライト・ペンライトの群れ）と大きな文字・画面全体の光。舞台の上に重ねる（押す操作は下へ通す）
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
  // 会場（暗幕・光線・サーチライト・ペンライトの群れ）
  const box = layer.appendChild(el("div", "sp-box"));
  box.appendChild(el("div", "sp-veil"));
  const rays = box.appendChild(el("div", "sp-rays"));
  box.appendChild(el("div", "sp-search"));
  const crowd = box.appendChild(el("div", "sp-crowd"));
  const crowdCount = SP_CROWD_COUNT[variant] ?? SP_CROWD_COUNT.live;
  const sticks = [];
  for (let i = 0; i < crowdCount; i++) {
    // 後ろの列（小さく・暗く）と前の列（大きく）を交互に。位置・振りのずれは番号から決める（毎回同じ）
    const row = i % 2;
    const stick = crowd.appendChild(el("i", row ? "is-front" : "is-back"));
    const slot = (i + 0.5) / crowdCount;
    stick.style.setProperty("--x", `${r3(4 + slot * 92 + (row ? 1.5 : -1.5))}%`);
    stick.style.setProperty("--delay", `${r3(-((i * 7) % 5) * 0.06)}s`);
    stick.style.setProperty("--tilt", `${(i % 3) - 1}deg`);
    sticks.push(stick);
  }
  const word = layer.appendChild(el("div", "sp-word"));
  const burst = word.appendChild(el("span", "sp-burst"));
  const sparks = word.appendChild(el("span", "sp-sparks"));
  const text = word.appendChild(el("span", "sp-word-text"));
  host.appendChild(layer);
  const backParent = backHost ?? host;
  if (backBefore && backBefore.parentNode === backParent) backParent.insertBefore(back, backBefore);
  else backParent.insertBefore(back, backParent.firstChild);

  let plan = [];
  let lastKey = undefined;
  const written = new Map();
  const set = (node, prop, value) => {
    const id = `${node.className}|${prop}`;
    if (written.get(id) === value) return;
    written.set(id, value);
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

  function setColors(item) {
    const named = Boolean(item?.colors?.length);
    const colors = named ? item.colors : [palette[0], palette[1] ?? palette[0]];
    setVar("--sp-c1", colors[0]);
    setVar("--sp-c2", colors[1] ?? (named ? colors[0] : palette[1]));
    setVar("--sp-c3", colors[2] ?? colors[0]);
    // 光線：名前コールはその人たちの色と白、それ以外は会場の4色
    layer.style.setProperty("--sp-rays", spectacleRays(named ? (colors.length === 1 ? [colors[0], "#ffffff"] : colors) : SP_VENUE_COLORS));
    // ペンライトの群れ：名前コールはその色のペンライト（複数・or はそれぞれの色）
    spectacleCrowdColors(item, sticks.length).forEach((c, i) => sticks[i].style.setProperty("--c", c));
    // 文字の立体の影の色（名前コールは最初の人の色、それ以外は濃いピンク）
    layer.style.setProperty("--sp-ex", named ? colors[0] : "#ff2d95");
  }

  function showItem(item) {
    layer.dataset.kind = item?.kind ?? "";
    layer.dataset.size = item?.size ?? "";
    layer.dataset.names = item?.nameKind ?? "";
    toggle("is-hot", Boolean(item?.hot));
    if (!item) {
      text.textContent = "";
      return;
    }
    // 文字は本人のコールのまま。名前の部分だけ、その人の色の光（js/liveCallNames.js の部品）
    if (item.kind === SP_KINDS.NAME) renderNameCallText(text, item.text);
    else text.textContent = item.text;
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
      if ((text.scrollWidth <= width + 1 && word.offsetHeight <= height) || size <= 18) break;
      size = Math.max(18, Math.floor(size * 0.88));
    }
    if (text.scrollWidth > width + 1) word.classList.add("is-tight");
    return word.offsetHeight;
  }

  // 位置を決める（コールが変わったときに1回。follow のときは、そのあと SP_FOLLOW_SEC ごとに位置だけ。毎フレームは測らない）
  let placedAt = 0;
  function placeItem(item, { again = false } = {}) {
    if (typeof place !== "function") return;
    placedAt = now();
    // 測り直し（follow）のときだけ、なめらかに移す（新しいコールは、その場所にすぐ出す）
    if (layer.classList.contains("is-follow") !== again) layer.classList.toggle("is-follow", again);
    let spot = null;
    try {
      const { top: layerTop, left: layerLeft } = layer.getBoundingClientRect();
      const keepSize = () => word.offsetHeight; // 測り直しのときは、文字の大きさを変えない
      spot = place(item, { fit: again ? keepSize : fitWord, layerTop, layerLeft });
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
      // 会場が出ている間だけ、ペンライトの振り・光線の回転を動かす（出ていない間は CSS のアニメーションを止める）
      if (layer.classList.contains("is-on") !== s.stage > 0) layer.classList.toggle("is-on", s.stage > 0);
      const { o, s: scale, x, r } = s.word;
      set(word, "opacity", String(o));
      set(word, "transform", `translate(-50%, -50%) translateX(${r3(x * 100)}vw) rotate(${r}deg) scale(${scale})`);
      set(box, "opacity", String(s.stage));
      set(rays, "opacity", String(r3(0.55 + 0.4 * s.heat)));
      set(crowd, "opacity", String(r3(0.8 + 0.2 * s.heat)));
      set(burst, "opacity", String(s.burst));
      set(burst, "transform", `translate(-50%, -50%) scale(${r3(0.45 + 1.1 * (1 - s.burst))})`);
      set(sparks, "opacity", String(s.burst));
      set(sparks, "transform", `translate(-50%, -50%) scale(${r3(0.5 + 1.1 * (1 - s.burst))})`);
      set(wash, "opacity", String(s.wash));
      set(beams, "opacity", String(s.beams));
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
