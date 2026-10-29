// ライブコール演出の「中身」（画面に触れない純粋な計算だけ）。
// 【いちばん大事な考え方】演出の見た目は、すべて「いまの再生位置（秒）」だけから計算する。
//   ・タイマー（setTimeout）や CSS の無限アニメーションを使わないので、
//     シーク・一時停止・再生速度の変更・再開をしても、その時刻の正しい見た目になる。
//   ・同じ時刻を渡せば、何回呼んでも必ず同じ結果になる（テストしやすい）。
// 画面への反映（DOM の書き換え）は js/callEffectsRenderer.js が1つの requestAnimationFrame の中で行う。
// 【2026-10-30 アプリへ移した】元：tools/call-effects-demo-2026-10-30/effects.js（計算はデモと同じ。アプリはデザイン C だけを使う）

import { classifyShoutText, shoutTokens } from "./shoutWords.js";

export const LONG_SEC = 4.0; // これ以上光るコールは「長いコール」として進み具合を見せる（実データの分布から決めた区切り）
export const MIN_STEP_SEC = 0.34; // 点滅・弾み・区切りの切り替えは、これより短い間隔にしない（1秒に約3回未満）
export const PRE_SEC = 0.6; // 始まる前の「予告」の長さ（超絶かわいい・MIX だけ）
export const POST_SEC = 0.45; // 終わった後に静かに消えるまでの長さ
// 短い掛け声：光る時間（開始〜終了）はデータのまま。見た目の「ポン」だけ、終了後も最大この秒数まで残す
export const SHOUT_TAIL_SEC = 0.45;
export const CONSEC_SEC = 1.0; // 前の短い掛け声から この秒数以内に始まったら「連続」（小さなビートにする）
export const SHORT_NAME_SEC = 1.0; // これより短い名前コールにも「ポン」の強さ（単発／連続／間引き）を当てる

export const EFFECT_TYPES = {
  MIX: "mix", // A：MIX
  CHANT: "chant", // B：あーフッフー／ふわふわ 型
  NAME: "name", // C：名前コール
  CUTE: "cute", // D：超絶かわいい＋名前
  LONG: "long", // E：長いコール（時間で決まる）
  SHOUT: "shout", // 短い掛け声（Hey！・Yeah！・はい！など。言葉で決める）
  NORMAL: "normal", // F：ふつうの短いコール
  OTHER: "other", // G：手拍子・動作の説明など（ふつうと同じ控えめな光り方）
};

export const TYPE_LABELS = {
  mix: "MIX",
  chant: "フッフー／ふわふわ型",
  name: "名前コール",
  cute: "超絶かわいい",
  long: "長いコール",
  shout: "短い掛け声",
  normal: "ふつうの短いコール",
  other: "その他（手拍子など）",
};

// デザインの3案＋比較用の「現行」。数値は「どれだけ動かすか」の上限。
export const DESIGNS = {
  a: { id: "a", shoutAmp: 0.5, label: "A 実用・最小", pop: 0.03, namePop: 0.06, ring: "none", hearts: 0, bounce: 0, wave: false, nameChip: "underline", preCue: false },
  b: { id: "b", shoutAmp: 1.3, label: "B 華やか", pop: 0.14, namePop: 0.26, ring: "all", hearts: 5, bounce: 6, wave: true, nameChip: "fill", preCue: true },
  c: { id: "c", shoutAmp: 1, label: "C バランス", pop: 0.08, namePop: 0.14, ring: "name", hearts: 3, bounce: 4, wave: true, nameChip: "fill", preCue: true },
  now: { id: "now", shoutAmp: 0, label: "現行（比較用）", legacy: true, pop: 0, namePop: 0, ring: "none", hearts: 0, bounce: 0, wave: false, nameChip: "none", preCue: false },
};

// 短い掛け声の演出の候補（デモで切り替えて比べる）
export const SHOUT_STYLES = {
  combo: { id: "combo", label: "おすすめ（インパクト＋集中線）" },
  impact: { id: "impact", label: "A インパクト" },
  ring: { id: "ring", label: "B リング" },
  beat: { id: "beat", label: "C ビート（下線＋小さく跳ねる）" },
  burst: { id: "burst", label: "D 集中線" },
};
// 集中線（D）：コールの上側（文字に重ならない、行間のすき間）から外へ向かう短い線3本。角度（度）
// 左右には出さない（となりのコール・歌詞にぶつからないように）
export const TICK_ANGLES = [-90, -45, -135];

// 強さ：標準／控えめ／演出オフ。motion は「動き（拡大・上下）」の倍率。
export const INTENSITIES = {
  std: { id: "std", label: "標準", motion: 1, extras: true },
  low: { id: "low", label: "控えめ", motion: 0.4, extras: false },
  off: { id: "off", label: "演出オフ", motion: 0, extras: false },
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a, b, x) => {
  const u = clamp((x - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

// 「ポン」と1回だけ膨らむ形（0→1→0）。x：始まってからの秒、dur：膨らむ長さ。範囲外は 0。
// 立ち上がりを速く（全体の 30%）、戻りをゆっくりにする。
export function popCurve(x, dur) {
  if (!(x >= 0) || x > dur || dur <= 0) return 0;
  const u = x / dur;
  if (u < 0.3) return Math.sin((u / 0.3) * (Math.PI / 2));
  const v = (u - 0.3) / 0.7;
  return Math.cos(v * (Math.PI / 2)) ** 2;
}

// ===== 文面の分け方（MIX の「1つずつの掛け声」・超絶かわいいの「名前の部分」） =====

// 「！」の後ろ・空白・改行で区切る。区切った部分をつなげると、必ず元の文面に戻る（文字を足したり消したりしない）。
export function splitShouts(text) {
  const tokens = String(text ?? "").match(/[^！!\s]+[！!]*\s*|[！!]+\s*|\s+/g) ?? [];
  const segs = [];
  for (const tok of tokens) {
    if (!tok.trim() && segs.length) segs[segs.length - 1].text += tok;
    else segs.push({ text: tok });
  }
  segs.forEach((s) => (s.weight = Math.max(1, [...s.text.replace(/\s/g, "")].length)));
  return segs;
}

// 「×４」のような繰り返しの数を読む（無ければ 1）
export function repeatCount(text) {
  const m = String(text ?? "").match(/[×x]\s*([0-9０-９]+)/);
  if (!m) return 1;
  const n = Number(m[1].replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 16) : 1;
}

// 決まった形だけを見る「安全なパターン判定」。当たらなければ normal（ふつう）に倒す。
// 実際の採用では、本人が見直した対応表（明示の effectType）がこれより優先される（spec.md の優先順位）。
export function guessEffectType(text, durationSec) {
  const flat = String(text ?? "").replace(/\s+/g, " ");
  const hira = flat.replace(/[ァ-ヶ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  if (/超絶(かわいい|可愛い)/.test(flat)) return EFFECT_TYPES.CUTE;
  if (/(タイガー|ファイヤー|サイバー|ファイバー|ジャージャー|うりゃ！?おい)/.test(flat)) return EFFECT_TYPES.MIX;
  if (/(ふっふ|ふわふわ|ふうふう)/.test(hira)) return EFFECT_TYPES.CHANT;
  // 短い掛け声は「言葉」で決める（長さでは決めない）。近い書き方（要確認）は自動では当てない
  if (classifyShoutText(flat).status === "sure") return EFFECT_TYPES.SHOUT;
  // 長さは補助だけ：どの言葉にも当たらず、4秒以上光るものを「長いコール」にする
  if (Number.isFinite(durationSec) && durationSec >= LONG_SEC) return EFFECT_TYPES.LONG;
  return EFFECT_TYPES.NORMAL;
}

// 区切りが短すぎるとき（1秒に3回以上切り替わる）は、となりとまとめて1つの「段」にする
function groupSegments(segs) {
  const groups = [];
  let cur = null;
  segs.forEach((s, i) => {
    if (!cur) cur = { from: i, to: i, start: s.start, end: s.end };
    else {
      cur.to = i;
      cur.end = s.end;
    }
    if (cur.end - cur.start >= MIN_STEP_SEC) {
      groups.push(cur);
      cur = null;
    }
  });
  if (cur) {
    if (groups.length) {
      const last = groups[groups.length - 1];
      last.to = cur.to;
      last.end = cur.end;
    } else groups.push(cur);
  }
  segs.forEach((s, i) => (s.group = groups.findIndex((g) => g.from <= i && i <= g.to)));
  return groups;
}

// ===== 1つのコールの下ごしらえ（読み込んだときに1回だけ） =====
// call：{ key, text, start, end }（時刻データそのもの。ここでは書き換えない）
// effect：演出データ（別ファイルの callKey → { type, segmentOffsets?, memberIds?, nameFrom?, nameAt?, repeat? }）。無くてもよい
export function prepareCall(call, effect = null) {
  const d = Math.max(0.2, Number(call.end) - Number(call.start));
  const type = effect?.type ?? guessEffectType(call.text, d);
  const prep = {
    key: call.key,
    text: String(call.text ?? ""),
    start: Number(call.start),
    end: Number(call.start) + d,
    d,
    type,
    basis: effect?.type ? "explicit" : "pattern",
    isLong: d >= LONG_SEC,
    memberIds: effect?.memberIds ?? [],
  };
  if (type === EFFECT_TYPES.MIX) {
    const segs = splitShouts(prep.text);
    const offsets = Array.isArray(effect?.segmentOffsets) && effect.segmentOffsets.length === segs.length ? effect.segmentOffsets : null;
    const total = segs.reduce((a, s) => a + s.weight, 0);
    let acc = 0;
    segs.forEach((s, i) => {
      // 詳しい版：本人が付けた区切りの時刻（開始からの秒）。基本版：文字数の割合で開始〜終わりを按分した目安
      s.start = offsets ? clamp(offsets[i], 0, d) : (acc / total) * d;
      acc += s.weight;
    });
    segs.forEach((s, i) => (s.end = i + 1 < segs.length ? segs[i + 1].start : d));
    prep.segments = segs;
    prep.groups = groupSegments(segs);
    prep.exact = Boolean(offsets);
  }
  if (type === EFFECT_TYPES.CUTE) {
    // 名前の部分：明示（nameFrom＝文字位置）が無ければ「最後の掛け声」を名前とみなす
    const segs = splitShouts(prep.text);
    let from = Number.isInteger(effect?.nameFrom) ? effect.nameFrom : null;
    if (from === null) from = segs.length > 1 ? prep.text.length - segs[segs.length - 1].text.length : 0;
    prep.prefix = prep.text.slice(0, from);
    prep.name = prep.text.slice(from);
    prep.nameAt = clamp(Number.isFinite(effect?.nameAt) ? effect.nameAt : d * 0.5, 0.2, Math.max(0.2, d - 0.25));
  }
  if (type === EFFECT_TYPES.NAME) {
    const n = effect?.repeat ?? repeatCount(prep.text);
    // 1秒に3回以上は弾ませない
    prep.repeat = Math.max(1, Math.min(n, Math.floor(d / MIN_STEP_SEC) || 1));
  }
  if (type === EFFECT_TYPES.SHOUT || (type === EFFECT_TYPES.NAME && d < SHORT_NAME_SEC)) {
    // 1つのコールの中の掛け声の数（「Hey Hey！」なら 2、「はい！×４」なら 4）。間隔は 0.34 秒以上にする
    if (type === EFFECT_TYPES.SHOUT) {
      const n = Math.max(1, shoutTokens(prep.text).length) * repeatCount(prep.text);
      prep.beats = Math.max(1, Math.min(n, Math.floor(d / MIN_STEP_SEC) || 1));
    }
    prep.popLevel = "strong"; // 単発。assignPopLevels() が「連続」「間引き」に直す
    prep.visualEnd = prep.end;
  }
  if (type === EFFECT_TYPES.CHANT) {
    let n = clamp(Math.round(d / 0.4), 1, 4);
    while (n > 1 && d / n < MIN_STEP_SEC) n -= 1;
    prep.bounces = n;
  }
  return prep;
}

// ===== 短い掛け声の「単発／連続／間引き」を、曲全体の時刻から先に決めておく（読み込んだときに1回だけ） =====
// 時刻のデータだけから決めるので、シーク・一時停止・速度変更をしても結果は変わらない。
//   strong：単発（前の短い掛け声から 1.0 秒より後）→ 強い「ポン」
//   beat  ：連続（1.0 秒以内に前の短い掛け声がある）→ 小さなビート
//   none  ：間引き（前の「ポン」から 0.34 秒未満。1秒に3回以上にしない）→ 動かさず、板だけ光る
// visualEnd：見た目の「ポン」を残してよい最後の時刻。次の短い掛け声が始まる所で必ず打ち切る（次のコールの邪魔をしない）
export function assignPopLevels(preps) {
  const list = preps
    .filter((p) => p.type === EFFECT_TYPES.SHOUT || (p.type === EFFECT_TYPES.NAME && p.d < SHORT_NAME_SEC))
    .sort((a, b) => a.start - b.start);
  let lastPop = -Infinity;
  list.forEach((p, i) => {
    const prev = list[i - 1];
    const next = list[i + 1];
    if (p.start - lastPop < MIN_STEP_SEC) p.popLevel = "none";
    else {
      p.popLevel = prev && p.start - prev.start <= CONSEC_SEC ? "beat" : "strong";
      lastPop = p.start;
    }
    const tail = p.start + Math.max(p.d, SHOUT_TAIL_SEC);
    p.visualEnd = Math.max(p.end, Math.min(tail, next ? next.start : Infinity));
  });
  return preps;
}

const IDLE = Object.freeze({ phase: "idle" });

// ===== いまの時刻 t（秒）での見た目を計算する =====
// opts：{ design: "a"|"b"|"c"|"now", intensity: "std"|"low"|"off", reduced: 端末の「視差効果を減らす」 }
export function stateAt(prep, t, opts) {
  const D = DESIGNS[opts.design] ?? DESIGNS.c;
  const I = INTENSITIES[opts.intensity] ?? INTENSITIES.std;
  const reduced = Boolean(opts.reduced);
  const k = reduced ? 0 : I.motion; // 動き（拡大・上下移動）の倍率。視差効果を減らす設定なら 0
  const extras = I.extras && !reduced; // リング・ハート・波の光など、飾りの演出
  const off = I.id === "off";
  const { start, end, d } = prep;
  const shoutFx = opts.shoutFx !== false && !D.legacy && prep.popLevel !== undefined;
  const style = opts.shoutStyle ?? "combo";
  const preLen = D.preCue && !off && (prep.type === EFFECT_TYPES.CUTE || prep.type === EFFECT_TYPES.MIX) ? PRE_SEC : 0;
  // 短い掛け声：見た目は visualEnd まで（次の短い掛け声が始まったら打ち切り）。光る時間（開始〜終了）はデータのまま
  const tailEnd = shoutFx ? (off ? end : prep.visualEnd) : end + (off ? 0 : POST_SEC);
  if (t < start - preLen || t >= tailEnd) return IDLE;

  const s = {
    phase: "active", p: 0, tau: t - start,
    plateO: 0, plateS: 1, textS: 1, textY: 0, ringO: 0, ringS: 1,
    barO: 0, barP: 0, barS: 1, waveO: 0, build: 0,
    group: -1, groupPop: 1,
    prefixFill: 0, prefixS: 1, nameO: 1, nameS: 1, namePlateO: 0, hearts: [],
    legacyGlowO: 0,
    sweep: 0, ticks: [], beatIndex: -1, popLevel: shoutFx ? prep.popLevel : null,
  };
  const tau = s.tau;
  if (t < start) {
    // 予告（始まる前）：うっすら板を出して「次はここ」と知らせる
    s.phase = "pre";
    const q = (t - (start - preLen)) / preLen;
    s.plateO = 0.22 * q;
    if (prep.type === EFFECT_TYPES.CUTE) s.nameO = 0.6;
    if (prep.type === EFFECT_TYPES.MIX) s.group = -1;
    return s;
  }
  if (t >= end) {
    // 終わり：静かにフェードアウト（揺らさない）
    s.phase = "post";
    const q = shoutFx ? clamp((t - end) / Math.max(0.001, tailEnd - end), 0, 1) : clamp((t - end) / POST_SEC, 0, 1);
    s.p = 1;
    s.plateO = 1 - smoothstep(0, 1, q);
    s.plateS = 1 - 0.02 * k * q;
    const showsBar = prep.type === EFFECT_TYPES.MIX || prep.isLong;
    s.barO = showsBar && !off ? 1 - q : 0;
    s.barP = 1;
    s.group = prep.groups ? prep.groups.length : -1;
    if (prep.type === EFFECT_TYPES.CUTE) s.namePlateO = 1 - q;
    if (prep.type === EFFECT_TYPES.NAME) s.namePlateO = 1 - q;
    if (D.legacy) s.legacyGlowO = 0;
    // 短い掛け声の「ポン」は、光る時間が終わっても visualEnd まで続きを見せる（動きの途中で止めない）
    if (shoutFx && prep.type === EFFECT_TYPES.SHOUT) shoutMotion(prep, t, s, D, k, extras, style, reduced);
    if (shoutFx && prep.type === EFFECT_TYPES.NAME) nameMotion(prep, t - start, s, D, k, extras, style);
    return s;
  }

  // ===== 光っている間 =====
  s.p = clamp(tau / d, 0, 1);
  s.plateO = off ? 1 : clamp(tau / 0.08, 0, 1);

  if (D.legacy) {
    // 現行の再現（比較用）：最初に大きく弾み、その後は終わりまで同じ周期で光が呼吸し続ける
    const x = tau / 0.48;
    if (x < 1 && k > 0) {
      const keys = [[0, 0.7], [0.3, 1.45], [0.5, 0.92], [0.7, 1.12], [0.85, 0.97], [1, 1]];
      let i = 0;
      while (i < keys.length - 2 && x > keys[i + 1][0]) i += 1;
      const [x0, v0] = keys[i];
      const [x1, v1] = keys[i + 1];
      s.textS = v0 + (v1 - v0) * ((x - x0) / (x1 - x0));
    }
    s.legacyGlowO = tau > 0.48 && !reduced ? 0.5 - 0.5 * Math.cos((2 * Math.PI * (tau - 0.48)) / 1.1) : 0;
    return s;
  }

  // 始まりの「ポン」（どの種類も共通の土台。強さはデザインと種類で変える）
  const startPop = popCurve(tau, 0.22);
  s.plateS = 1 + D.pop * 0.6 * k * startPop;

  // 長いコール（4秒以上）：進み具合のバー＋波の光＋終わりに向けた盛り上がり
  if (prep.isLong || prep.type === EFFECT_TYPES.MIX || prep.type === EFFECT_TYPES.LONG) {
    if (!off) {
      s.barO = 1;
      s.barP = s.p;
      s.build = prep.isLong ? smoothstep(0.75, 1, s.p) : 0;
      s.barS = 1 + 0.6 * s.build * (k > 0 ? 1 : 0);
      s.waveO = D.wave && extras ? 0.9 : 0;
      s.plateS += 0.025 * k * s.build;
    }
    if ((D.ring === "all" || D.ring === "name") && extras && prep.isLong) {
      const x = tau / 0.45;
      if (x < 1) {
        // 長いコールは横幅が広いので、輪はほとんど広げない（画面の端からはみ出さないように。改善2回目）
        s.ringO = 0.55 * (1 - x);
        s.ringS = 1 + 0.04 * x;
      }
    }
  }

  switch (prep.type) {
    case EFFECT_TYPES.MIX: {
      // 掛け声を1つずつ（まとめた段ごとに）進める
      const g = prep.groups.findIndex((gr) => tau >= gr.start && tau < gr.end);
      s.group = g === -1 ? prep.groups.length - 1 : g;
      const gr = prep.groups[s.group];
      s.groupPop = 1 + D.pop * 1.4 * k * popCurve(tau - gr.start, Math.min(0.2, (gr.end - gr.start) * 0.6));
      break;
    }
    case EFFECT_TYPES.CHANT: {
      // 軽く弾む（回数は長さから決める。1秒に3回未満）
      const period = d / prep.bounces;
      const n = Math.floor(tau / period);
      const frac = (tau - n * period) / period;
      const amp = D.bounce * k * (I.id === "low" ? 0.5 : 1);
      s.textY = n < prep.bounces && (I.id !== "low" || n === 0) ? -amp * Math.sin(Math.PI * frac) : 0;
      s.textS = 1 + D.pop * 0.5 * k * startPop;
      if (D.ring === "all" && extras) {
        const x = tau / 0.4;
        if (x < 1) {
          s.ringO = 0.45 * (1 - x);
          s.ringS = 1 + 0.4 * x;
        }
      }
      break;
    }
    case EFFECT_TYPES.SHOUT: {
      if (!shoutFx) {
        s.textS = 1 + D.pop * 0.8 * k * startPop; // 比べる用：ふつうと同じ光り方
        break;
      }
      s.plateO = off ? 1 : clamp(tau / 0.04, 0, 1);
      shoutMotion(prep, t, s, D, k, extras, style, reduced);
      break;
    }
    case EFFECT_TYPES.NAME: {
      // メンバーカラーで「ポン」。×４ のような繰り返しは、その回数だけ小さく弾む
      // 短い名前コール（1秒未満）：色の札はそのまま、弾みの強さだけ「単発／連続／間引き」に合わせる
      s.namePlateO = off ? 1 : clamp(tau / 0.06, 0, 1);
      if (shoutFx) {
        nameMotion(prep, tau, s, D, k, extras, style);
        if (D.ring !== "none" && extras && prep.popLevel === "strong" && style !== "combo" && style !== "burst") {
          const x = tau / 0.45;
          if (x < 1) {
            s.ringO = 0.6 * (1 - x);
            s.ringS = 1 + 0.45 * x;
          }
        }
        break;
      }
      const per = d / prep.repeat;
      const n = Math.min(prep.repeat - 1, Math.floor(tau / per));
      const amp = n === 0 ? D.namePop : D.namePop * 0.55;
      s.nameS = 1 + amp * k * popCurve(tau - n * per, Math.min(0.26, per * 0.7));
      if (D.ring !== "none" && extras) {
        const x = tau / 0.45;
        if (x < 1) {
          s.ringO = 0.6 * (1 - x);
          s.ringS = 1 + 0.45 * x;
        }
      }
      break;
    }
    case EFFECT_TYPES.CUTE: {
      // 前半（超絶かわいい！）：ためる。後半（名前）：メンバーカラーで強調＋小さなハート（文字には重ねない）
      const at = prep.nameAt;
      if (tau < at) {
        s.prefixFill = off ? 1 : smoothstep(0, 1, tau / at);
        s.prefixS = 1 + 0.04 * k * (tau / at);
        s.nameO = off ? 1 : 0.6;
      } else {
        const x = tau - at;
        s.prefixFill = 1;
        s.nameO = 1;
        s.namePlateO = off ? 1 : clamp(x / 0.06, 0, 1);
        s.nameS = 1 + D.namePop * k * popCurve(x, 0.28);
        if (D.ring !== "none" && extras) {
          const r = x / 0.45;
          if (r < 1) {
            s.ringO = 0.6 * (1 - r);
            s.ringS = 1 + 0.45 * r;
          }
        }
        if (extras) {
          for (let i = 0; i < D.hearts; i += 1) {
            const h = (x - i * 0.12) / 0.9;
            s.hearts.push(h > 0 && h < 1 ? { o: Math.sin(Math.PI * h), y: -9 * h, s: 0.8 + 0.3 * h } : { o: 0, y: 0, s: 1 });
          }
        }
      }
      break;
    }
    default: {
      // ふつう・その他・長いコール：始まりに小さく「ポン」、あとは落ち着いて光るだけ（点滅させない）
      s.textS = 1 + D.pop * (prep.isLong ? 1 : 0.8) * k * startPop;
      if (D.ring === "all" && extras && !prep.isLong) {
        const x = tau / 0.4;
        if (x < 1) {
          s.ringO = 0.45 * (1 - x);
          s.ringS = 1 + 0.4 * x;
        }
      }
    }
  }
  return s;
}

// 集中線（D）の見た目：0.35 秒で外へ動きながら消える
function ticksAt(x, D) {
  const u = x / 0.35;
  if (!(u > 0 && u < 1)) return TICK_ANGLES.map(() => ({ o: 0, r: 0 }));
  return TICK_ANGLES.map(() => ({ o: 0.9 * Math.sin(Math.PI * u), r: (1 + 4 * u) * (D.shoutAmp >= 1.2 ? 1.25 : 1) }));
}

// 短い名前コール：メンバーカラーの札はそのまま、弾みの強さを「単発／連続／間引き」に合わせる
function nameMotion(prep, tau, s, D, k, extras, style) {
  const levelAmp = { strong: 1, beat: 0.4, none: 0 }[prep.popLevel] ?? 1;
  const per = prep.d / prep.repeat;
  const n = Math.min(prep.repeat - 1, Math.floor(tau / per));
  const amp = (n === 0 ? D.namePop : D.namePop * 0.55) * levelAmp;
  s.nameS = 1 + amp * k * popCurve(tau - n * per, Math.min(0.3, Math.max(0.26, per * 0.7)));
  if (prep.popLevel === "strong" && extras && D.ring !== "none" && (style === "combo" || style === "burst")) s.ticks = ticksAt(tau, D);
}

// 短い掛け声の「ポン」の動き（光っている間と、そのあと visualEnd まで）
// 1つのコールの中に掛け声が複数あるとき（Hey Hey！・はい！×４）は、等間隔のビート。最初の1回だけ popLevel の強さ
function shoutMotion(prep, t, s, D, k, extras, style, reduced) {
  const tau = t - prep.start;
  const beats = prep.beats ?? 1;
  const per = prep.d / beats;
  const i = Math.max(0, Math.min(beats - 1, Math.floor(tau / per)));
  const x = tau - i * per;
  s.beatIndex = i;
  const level = prep.popLevel === "none" ? "none" : i === 0 ? prep.popLevel : "beat";
  const amp = D.shoutAmp ?? 1;
  // 下線：拍ごとに左から右へ引く（視差効果を減らす設定では、動かさずに最初から全部見せる）
  const sweepDur = Math.min(0.22, per * 0.8);
  if (style === "beat" || level === "beat") s.sweep = reduced ? 1 : smoothstep(0, 1, x / sweepDur);
  if (level === "none" || k === 0) return;
  if (level === "beat") {
    s.textY = -3 * k * amp * Math.sin(Math.PI * clamp(x / 0.2, 0, 1));
    s.textS = 1 + 0.05 * k * amp * popCurve(x, 0.2);
    return;
  }
  // 単発（strong）
  if (style === "impact" || style === "combo") s.textS = 1 + (style === "combo" ? 0.16 : 0.22) * k * amp * popCurve(x, 0.3);
  if (style === "ring") {
    s.textS = 1 + 0.06 * k * amp * popCurve(x, 0.25);
    const u = x / 0.42;
    if (extras && D.ring !== "none" && u < 1) {
      s.ringO = 0.75 * (1 - u);
      s.ringS = 1 + 0.25 * u * amp;
    }
  }
  if (style === "beat") {
    s.textY = -5 * k * amp * Math.sin(Math.PI * clamp(x / 0.24, 0, 1));
    s.textS = 1 + 0.06 * k * amp * popCurve(x, 0.24);
  }
  if (style === "burst") s.textS = 1 + 0.1 * k * amp * popCurve(x, 0.28);
  if ((style === "burst" || style === "combo") && extras && D.ring !== "none") s.ticks = ticksAt(x, D);
}

// 同じ時刻なら必ず同じ結果になることを確かめるための、見た目の要約（テスト用）
export function summarizeState(s) {
  if (s.phase === "idle") return "idle";
  const r = (v) => Math.round(v * 1000) / 1000;
  return [s.phase, r(s.p), r(s.plateO), r(s.plateS), r(s.textS), r(s.textY), r(s.barP), s.group, r(s.groupPop), r(s.nameS), r(s.prefixFill), s.hearts.map((h) => r(h.o)).join("/"), s.popLevel, s.beatIndex, r(s.sweep), s.ticks.map((x) => r(x.o)).join("/")].join("|");
}

// ===== 新しいライブコールの「見た目の種類」（2026-10-30 第2版。見た目だけに使う） =====
// 【本人の決まり（2026-10-29）】コールは本人の開始〜終了の間、コール全体が光る。時刻は変えない・自動で区切らない・
//   1語ずつ光らせない・「MIX・進み方は目安」の札は出さない。ここで決めるのは「光り方の味付け」だけ。
// 分け方は控えめ（迷ったら normal）：
//   long  ：4秒以上光る、または改行のある長いコール（has-break）→ 全体が光り、下に細い進み具合のバーを1本
//   short ：1.2秒以下、または確定の短い掛け声（js/shoutWords.js）で 2.5秒以下 → 始まりに小さく「ポン」
//   normal：それ以外 → やわらかい光・少し浮く・時刻から計算するゆっくりした呼吸
// long を先に見る：改行のある塊を 1.15 倍に膨らませると、まわりの行に大きくかぶるため
export const VISUAL_KINDS = { SHORT: "short", LONG: "long", NORMAL: "normal" };
export const VIS_SHORT_MAX_SEC = 1.2;
export const VIS_SHORT_WORD_MAX_SEC = 2.5;
export const VIS_LONG_MIN_SEC = 4.0;
export const VIS_POP_SEC = 0.28; // 短いコールの「ポン」（1.15 倍 → 1.0 倍）の長さ
export const VIS_POP_SCALE = 0.15;
export const VIS_FADE_SEC = 0.45; // 終わったあと静かに消える長さ（時刻は変えない。見た目の余韻だけ）
export const VIS_PULSE_SEC = 1.6; // ふつうのコールの呼吸の周期（1秒に1回より遅い）
export const ANTICIPATE_SEC = 1.5; // 始まる前に「次はここ」とうっすら知らせる長さ
export const ANTICIPATE_MAX = 0.4; // 知らせの濃さの上限（控えめ）

export function classifyVisualKind({ text, start, end, hasBreak = false } = {}) {
  const d = Number(end) - Number(start);
  if (!Number.isFinite(d)) return VISUAL_KINDS.NORMAL;
  if (d >= VIS_LONG_MIN_SEC || hasBreak) return VISUAL_KINDS.LONG;
  if (d <= VIS_SHORT_MAX_SEC) return VISUAL_KINDS.SHORT;
  if (d <= VIS_SHORT_WORD_MAX_SEC && classifyShoutText(String(text ?? "")).status === "sure") return VISUAL_KINDS.SHORT;
  return VISUAL_KINDS.NORMAL;
}

// 1つのコールの見た目の下ごしらえ（読み込んだときに1回だけ）。start・end は本人の時刻そのもの（書き換えない）
export function prepareVisual(call, { hasBreak = false } = {}) {
  const start = Number(call.start);
  const end = Number(call.end);
  return { key: call.key, start, end, d: Math.max(0, end - start), kind: classifyVisualKind({ text: call.text, start, end, hasBreak }) };
}

const VIS_IDLE = Object.freeze({ phase: "idle", p: 0, plateO: 0, glowO: 0, cueO: 0, scale: 1, liftY: 0, barO: 0, barP: 0, ambient: 0 });
const easeOut = (u) => 1 - (1 - u) * (1 - u);

// いまの時刻 t（秒）での見た目。同じ t なら必ず同じ結果（一時停止・シーク・ループに強い）。
// opts：{ intensity: "std"|"low"|"off", reduced: 端末の「視差効果を減らす」 }
// 戻り値：phase（idle／pre＝始まる前の知らせ／active＝光っている間／post＝消えていく余韻）と、
//   plateO（今ここの板）・glowO（外側の光）・cueO（次の知らせの枠）・scale・liftY（px）・barO・barP（長いコールの進み具合）・ambient（舞台の背景の光）
export function visualStateAt(vis, t, opts = {}) {
  const I = INTENSITIES[opts.intensity] ?? INTENSITIES.std;
  const off = I.id === "off";
  const reduced = Boolean(opts.reduced);
  const k = reduced ? 0 : I.motion; // 動き（拡大・浮き）の倍率
  const pulseAmp = off || reduced ? 0 : I.id === "low" ? 0.08 : 0.18; // 呼吸の幅（光の濃さだけ。視差効果を減らす設定では止める）
  const { start, end, d, kind } = vis;
  if (!Number.isFinite(t) || !Number.isFinite(start) || !Number.isFinite(end)) return VIS_IDLE;
  const cueLen = off ? 0 : ANTICIPATE_SEC;
  const fade = off ? 0 : VIS_FADE_SEC;
  if (t < start - cueLen || t >= end + fade) return VIS_IDLE;
  if (t < start) {
    // 始まる前：うっすら枠を出す（0 → 最大 0.4）。動かさない
    const q = smoothstep(start - cueLen, start, t);
    const cueMax = I.id === "low" ? ANTICIPATE_MAX * 0.7 : ANTICIPATE_MAX;
    return { ...VIS_IDLE, phase: "pre", cueO: Math.round(cueMax * q * 1000) / 1000 };
  }
  const tau = t - start;
  const s = { ...VIS_IDLE, phase: "active", p: d > 0 ? clamp(tau / d, 0, 1) : 1 };
  if (t < end) {
    s.plateO = 1;
    if (kind === VISUAL_KINDS.SHORT) {
      // 「ポン」：1.15 倍から 1.0 倍へ素早く戻る＋光がぱっと強くなってから落ち着く
      const u = clamp(tau / VIS_POP_SEC, 0, 1);
      s.scale = 1 + VIS_POP_SCALE * k * (1 - easeOut(u));
      s.glowO = off ? 0 : 0.7 + 0.3 * (1 - u);
      s.ambient = off ? 0 : 0.55 + 0.25 * (1 - u) * (reduced ? 0 : 1);
    } else if (kind === VISUAL_KINDS.LONG) {
      // 全体が光る＋進み具合のバー（バーは演出オフでも出す：どこまで進んだかの情報なので）。大きな塊は膨らませない
      const rise = clamp(tau / 0.15, 0, 1);
      const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * tau) / VIS_PULSE_SEC);
      s.liftY = -1 * k * rise;
      s.glowO = off ? 0 : 0.8 - pulseAmp * 0.5 + pulseAmp * 0.5 * breath;
      s.barO = 1;
      s.barP = s.p;
      s.ambient = off ? 0 : 0.5 + (pulseAmp * breath) / 2;
    } else {
      // ふつう：やわらかい光・少し浮く・ゆっくり呼吸（すべて tau から計算）
      const rise = clamp(tau / 0.15, 0, 1);
      const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * tau) / VIS_PULSE_SEC);
      s.liftY = -1.5 * k * rise;
      s.scale = 1 + 0.03 * k * rise;
      s.glowO = off ? 0 : 0.75 - pulseAmp * 0.5 + pulseAmp * breath;
      s.ambient = off ? 0 : 0.45 + (pulseAmp * breath) / 2;
    }
  } else {
    // 余韻：静かに消える（揺らさない）
    s.phase = "post";
    s.p = 1;
    const q = 1 - smoothstep(0, 1, (t - end) / fade);
    s.plateO = q;
    s.glowO = off ? 0 : 0.6 * q;
    s.liftY = (kind === VISUAL_KINDS.NORMAL ? -1.5 : kind === VISUAL_KINDS.LONG ? -1 : 0) * k * q;
    s.scale = kind === VISUAL_KINDS.NORMAL ? 1 + 0.03 * k * q : 1;
    s.barO = kind === VISUAL_KINDS.LONG ? q : 0;
    s.barP = 1;
    s.ambient = off ? 0 : 0.4 * q;
  }
  const r = (v) => Math.round(v * 1000) / 1000;
  for (const key of ["p", "plateO", "glowO", "scale", "liftY", "barP", "barO", "ambient"]) s[key] = r(s[key]);
  return s;
}

// 舞台の背景の光：光っているコールのうち一番強いもの（無ければ 0）。演出オフ・控えめでは弱く（オフは 0）
export function ambientAt(states, intensity = "std") {
  if (intensity === "off") return 0;
  const max = Math.max(0, ...states.map((s) => s.ambient ?? 0));
  return Math.round(max * (intensity === "low" ? 0.5 : 1) * 1000) / 1000;
}

// 見た目の要約（テスト用：同じ時刻なら同じ文字列）
export function summarizeVisual(s) {
  return [s.phase, s.p, s.plateO, s.glowO, s.cueO, s.scale, s.liftY, s.barO, s.barP, s.ambient].join("|");
}
