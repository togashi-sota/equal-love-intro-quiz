// コールの「大きな演出」（2026-11-01 r7-live 新設）。新しいライブコール（演出 あり）と新しいカラオケ（コール表示 ON）の共通の部品。
// コールの始まりに、画面の中央へ大きな文字が現れ、画面全体の光・ペンライトの光（背景）がコールに合わせて強くなる。
//
// 【本人の決まり（REQUEST 3・COMMON）】
//   ・種類はデータだけで決める（AI が言葉の意味で決めつけない）：
//       D 名前コール … js/liveCallNames.js（js/callNameColors.js の確かめた名前の表）で名前があると判定されたもの
//       C 長いコール … 長さ（本人の終了 − 開始）が 4 秒以上（ライブコールの「長い」・カラオケの長いコールと同じ）
//       B 連続するコール … 前のコールの終わりから 0.8 秒以内に次が始まる、を 3 件以上続けたもの（4 秒未満のものだけ）
//       A 短いコール … 1.2 秒以下（B に入らないもの）
//       ふつう … それ以外（1.2 秒より長く 4 秒未満）
//       E 盛り上がる区間 … 前後 4 秒（計 8 秒）の中にコールの始まりが 5 件以上ある所（コールの時刻の密度。データで確かめられる）。
//         背景のペンライトを強くするだけ（サビなどの「意味」は付けない）
//   ・時刻は本人の開始〜終了のまま。始まりを早めない。大きな文字は終わりのあと最大 0.35 秒でなめらかに消える（次のコールが来たらすぐ切り替える）。
//     大きな文字は最長 1.1 秒で消す（歌詞を隠し続けない）。長いコールは背景の光がゆっくり広がり続ける。
//   ・コール1件は1件のまま。文字列は変えない（大きな文字は、本人のコールの文字をそのまま出す。名前の部分に色の光を付けるだけ）。
//   ・見た目は「いまの時刻 t」だけから決まる（spectacleStateAt は純粋関数）。一時停止・シーク・曲の切り替え・曲の終わりで残らない・暴走しない。
//   ・画面全体の光は、続けて来るコール（B）では最初の1件だけ（激しい点滅にしない。1秒に3回を超えない）。
//   ・端末の「視差効果を減らす」：拡大・移動・ペンライトの揺れを止め、光の強さも下げる（文字はふわっと出て消えるだけ）。
//
// 【軽さ】部品は画面に1組だけ（コールの数だけ作らない）。動かすのは transform・opacity だけで、値が変わったときだけ書く。
//   ペンライトの揺れは CSS のアニメーション（一時停止中・非表示のときは止める）。
import { describeNameCall, nameCallAccent, renderNameCallText, NAME_KINDS } from "./liveCallNames.js";

export const SP_KINDS = { SHORT: "short", CHAIN: "chain", LONG: "long", NAME: "name", NORMAL: "normal" };
export const SP_SHORT_MAX_SEC = 1.2;
export const SP_LONG_MIN_SEC = 4;
export const SP_CHAIN_GAP_SEC = 0.8;
export const SP_CHAIN_MIN = 3;
export const SP_HOT_WINDOW_SEC = 8;
export const SP_HOT_MIN_CALLS = 5;
export const SP_TAIL_SEC = 0.35;
export const SP_WORD_HOLD_SEC = 1.1; // 【2026-11-01 r7-live-fix】1.4 → 1.1 秒（隠す時間を短く。始まりの飛び出しの迫力はそのまま）
export const SP_FADE_SEC = 0.45;
export const SP_BEAM_COUNT = 6;
// 続けて来るコール（B）の文字の置き場所（画面の幅・高さに対する割合）。順番に変えてテンポを出す（同じ順番なら毎回同じ）
// 【2026-11-01 r7-live-fix】上下には大きく動かさない（上下の位置は chooseSpectacleY で、光っているコールを避けて決めるため）
export const SP_CHAIN_SPOTS = [
  [-0.18, -0.015],
  [0.18, 0.015],
  [0, -0.02],
  [-0.13, 0.02],
  [0.14, 0],
];

// 【2026-11-01 r7-live-fix】大きな文字の上下の位置（純粋関数）。独立レビュー「演出中の読みやすさ」：
//   中央に固定すると、光っているコール・その上の歌詞・「いま／つぎ」の札に重なっていた。
// region：文字を出してよい範囲 { top, bottom }（画面の px）。avoid：重ねたくない範囲の一覧 [{ top, bottom }]。wordH：文字の高さ（px）。
// 候補（範囲の上寄り・真ん中・下寄り）のうち、どれとも重ならないものを選ぶ。重ならないものが複数なら、避けたい範囲から一番遠いもの。
// 全部重なるなら、重なりが一番小さいもの。戻り値：文字の中心の y（px）
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
  return "xl";
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
// 飛び出す拡大（from → over → 1）。duration 秒で落ち着く
function popScale(age, { from, over, peakAt, settleAt }) {
  if (age <= 0) return from;
  if (age < peakAt) return from + (over - from) * ease(age / peakAt);
  if (age < settleAt) return over + (1 - over) * ease((age - peakAt) / (settleAt - peakAt));
  return 1;
}

const POP = {
  [SP_KINDS.SHORT]: { from: 0.5, over: 1.2, peakAt: 0.1, settleAt: 0.3, wash: 0.55 },
  [SP_KINDS.CHAIN]: { from: 0.72, over: 1.1, peakAt: 0.08, settleAt: 0.22, wash: 0.4 },
  [SP_KINDS.NAME]: { from: 0.55, over: 1.14, peakAt: 0.12, settleAt: 0.36, wash: 0.5 },
  [SP_KINDS.NORMAL]: { from: 0.68, over: 1.1, peakAt: 0.12, settleAt: 0.32, wash: 0.32 },
  [SP_KINDS.LONG]: { from: 0.86, over: 1.0, peakAt: 0.5, settleAt: 0.6, wash: 0.3 },
};

const IDLE = Object.freeze({ key: null, kind: null, index: -1, word: { o: 0, s: 1, x: 0, y: 0 }, wash: 0, burst: 0, bloom: { o: 0, s: 0.6 }, aurora: 0, beams: 0.22 });

// 時刻 t の演出の状態（純粋関数）。plan は planSpectacle の結果（start の昇順）。
// 戻り値：{ key, kind, index, word: { o 濃さ, s 拡大, x・y 置き場所（割合） }, wash 画面全体の光, burst 文字のまわりの光の輪, bloom 長いコールの背景の光, aurora 名前の色の光, beams ペンライトの強さ }
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
  const tailEnd = Math.min(item.end + SP_TAIL_SEC, next ? next.start : Infinity);
  if (time >= tailEnd) return { ...IDLE, beams: item.hot ? 0.3 : IDLE.beams };
  const age = time - item.start;
  const duration = item.end - item.start;
  const kind = item.kind;
  // 大きな文字：コールの終わりまで。ただし最長 1.1 秒（長いコール・長い名前コールでも、歌詞を隠し続けない。終わりより後には延ばさない）
  const holdEnd = Math.min(item.end, item.start + SP_WORD_HOLD_SEC);
  const fadeEnd = Math.min(holdEnd + SP_FADE_SEC, Math.max(holdEnd, tailEnd));
  const fadeIn = reduced ? 0.16 : 0.05;
  let o = clamp01(age / fadeIn);
  let fadeP = 0;
  if (time >= holdEnd) {
    fadeP = fadeEnd > holdEnd ? clamp01((time - holdEnd) / (fadeEnd - holdEnd)) : 1;
    o *= 1 - ease(fadeP);
  }
  const pop = POP[kind] ?? POP[SP_KINDS.NORMAL];
  let s = reduced ? 1 : popScale(age, pop);
  if (!reduced && kind === SP_KINDS.NAME && age >= pop.settleAt) s = 1 + 0.03 * Math.sin((age - pop.settleAt) * Math.PI * 2 * 1.4) ** 2; // 名前：コールの間、少し脈打つ
  if (!reduced && fadeP > 0) s *= 1 + 0.08 * fadeP; // 消えるときは少し広がりながら
  const [x, y] = kind === SP_KINDS.CHAIN ? SP_CHAIN_SPOTS[item.chainIndex % SP_CHAIN_SPOTS.length] : [0, 0];
  // 画面全体の光：始まりで一番強く、すぐ弱まる。続けて来るコールは最初の1件だけ（点滅にしない）
  let washPeak = pop.wash;
  if (kind === SP_KINDS.CHAIN && item.chainIndex > 0) washPeak = 0;
  if (reduced) washPeak *= 0.4;
  let wash = kind === SP_KINDS.LONG ? washPeak * ease(age / 1.2) : washPeak * Math.exp(-age / 0.28);
  if (time >= item.end) wash *= 1 - clamp01((time - item.end) / SP_TAIL_SEC);
  const burst = reduced || kind === SP_KINDS.LONG ? 0 : clamp01(1 - age / 0.5);
  // 長いコール：背景の光がゆっくり広がる（コールの長さをかけて）
  const progress = clamp01(age / duration);
  const bloomO = kind === SP_KINDS.LONG ? 0.75 * ease(age / 1.2) * (time >= item.end ? 1 - clamp01((time - item.end) / SP_TAIL_SEC) : 1) : 0;
  const bloom = { o: bloomO, s: reduced ? 1 : 0.6 + 0.8 * progress };
  // 名前の色の光（オーロラ）：文字と一緒に出て、終わりで自然に消える
  const aurora = kind === SP_KINDS.NAME ? o : 0;
  // ペンライト：ふだんは控えめ。コールの始まりで強くなり、盛り上がる区間（E）は強め。長いコールは進むほど強く
  const base = item.hot ? 0.42 : 0.26;
  let beams = base + (reduced ? 0 : 0.45 * Math.exp(-age / 0.45));
  if (kind === SP_KINDS.LONG) beams = Math.max(beams, base + 0.35 * progress);
  return {
    key: item.key,
    kind,
    index,
    word: { o: r3(o), s: r3(s), x, y },
    wash: r3(wash),
    burst: r3(burst),
    bloom: { o: r3(bloom.o), s: r3(bloom.s) },
    aurora: r3(aurora),
    beams: r3(Math.min(1, beams)),
  };
}

// ===== 画面の部品（画面に1組だけ） =====
function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

// 【2026-11-01 r7-live-fix】place(item, { wordH })：そのコールの大きな文字を出す位置を返す（無ければ画面の中央の決まった位置）。
//   戻り値 { y, w?, h? }（画面の px。w・h はカラオケで光の輪をカードの大きさにするとき）
// 演出の層を作る。層は2枚：
//   後ろ（back）… ペンライト・長いコールの背景の光。文字（歌詞・コール表）の後ろに置く（読みやすさを保つ）
//   前（front）… 大きな文字・画面全体の光・名前の色のオーロラ。舞台の上に重ねる（押す操作は下へ通す）
// host：前の層を入れる所。options：{ variant: "live" | "karaoke", palette: [色1, 色2], backHost, backBefore（後ろの層を入れる所と、その前の部品） }
// 戻り値：{ layer, back, setPlan(plan), update(t, { playing, enabled, reduced }), destroy(), state() }
export function createSpectacle(host, { variant = "live", palette = ["#ff6fa8", "#8f7dff"], backHost = null, backBefore = null, place = null } = {}) {
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
  const bloom = back.appendChild(el("div", "sp-bloom"));
  const wash = layer.appendChild(el("div", "sp-wash"));
  // カラオケ：名前の色のオーロラはカードの後ろ（後ろの層）。カードの文字に色を重ねない
  const aurora = (variant === "karaoke" ? back : layer).appendChild(el("div", "sp-aurora"));
  const word = layer.appendChild(el("div", "sp-word"));
  const burst = word.appendChild(el("span", "sp-burst"));
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
    const colors = item?.colors?.length ? item.colors : [palette[0], palette[1] ?? palette[0]];
    const c1 = colors[0];
    const c2 = colors[1] ?? (item?.colors?.length ? colors[0] : palette[1]);
    const c3 = colors[2] ?? c1;
    setVar("--sp-c1", c1);
    setVar("--sp-c2", c2);
    setVar("--sp-c3", c3);
    // オーロラ：2人は2色をなめらかに混ぜる、3人以上は全員の色を外周に並べて回す（等分の帯にはしない）
    const ring = colors.length >= 3 ? [...colors, colors[0]] : colors.length === 2 ? [colors[0], colors[1], colors[0]] : [c1, palette[0], c1];
    setVar("--sp-aurora", `conic-gradient(from 0deg, ${ring.join(", ")})`);
  }

  function showItem(item) {
    layer.dataset.kind = item?.kind ?? "";
    layer.dataset.size = item?.size ?? "";
    layer.dataset.names = item?.nameKind ?? "";
    toggle("is-hot", Boolean(item?.hot));
    if (!item) {
      text.textContent = "";
      setColors(null);
      return;
    }
    // 文字は本人のコールのまま。名前の部分だけ、その人の色の光（js/liveCallNames.js の部品）
    if (item.kind === SP_KINDS.NAME) renderNameCallText(text, item.text);
    else text.textContent = item.text;
    setColors(item);
    placeItem(item);
  }

  // 位置を決める（コールが変わったときに1回だけ。毎フレームは測らない）
  function placeItem(item) {
    if (typeof place !== "function") return;
    let spot = null;
    try {
      const layerTop = layer.getBoundingClientRect().top;
      spot = place(item, { wordH: word.offsetHeight, layerTop });
    } catch {
      spot = null;
    }
    if (spot && Number.isFinite(spot.y)) setVar("--sp-y", `${Math.round(spot.y)}px`);
    else {
      layer.style.removeProperty("--sp-y");
      back.style.removeProperty("--sp-y");
    }
    if (spot && Number.isFinite(spot.w) && Number.isFinite(spot.h)) {
      layer.style.setProperty("--sp-ww", `${Math.round(spot.w)}px`);
      layer.style.setProperty("--sp-wh", `${Math.round(spot.h)}px`);
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
      // 止まっている間は、大きな文字・光を出さない（CSS で消す。動きも止める）。再開すると、その時刻の正しい見た目から
      const s = playing ? spectacleStateAt(plan, t, { reduced }) : IDLE;
      current = s;
      if (s.key !== lastKey) {
        showItem(s.index >= 0 ? plan[s.index] : null);
        lastKey = s.key;
      }
      const { o, s: scale, x, y } = s.word;
      set(word, "opacity", String(o));
      set(word, "transform", `translate(-50%, -50%) translate(${r3(x * 100)}vw, ${r3(y * 100)}vh) scale(${scale})`);
      set(burst, "opacity", String(s.burst));
      set(burst, "transform", `translate(-50%, -50%) scale(${r3(1 + 0.35 * (1 - s.burst))})`); // 文字（カラオケはカード）のすぐ外から外へ広がる（内側の文字には重ならない）
      set(wash, "opacity", String(s.wash));
      set(bloom, "opacity", String(s.bloom.o));
      set(bloom, "transform", `translate(-50%, -50%) scale(${s.bloom.s})`);
      set(aurora, "opacity", String(s.aurora));
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
