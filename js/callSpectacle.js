// コールの「大きな演出」（2026-11-01 r7-live 新設 → 2026-11-01 r8-fx で作り直し → 2026-11-02 r9-fx で種類ごとの演出・ペンライトの作り直し）。
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
// 【軽さ】部品は画面に1組だけ（コールの数だけ作らない。ペンライトはカラオケ 12 本・ライブコール 8 本〔r9-fx〕）。
//   動かすのは transform・opacity だけで、値が変わったときだけ書く。繰り返しの動き（光線の回転・スポットライト）は CSS で、
//   ペンライトの振りは JS（時刻から決まる角度。r9-fx）で、どちらもコールが出ている間だけ動かす（一時停止中・非表示・コールの無い間は止める）。
//   会場の部品にぼかし（filter）は使わない。
// 【r9-fx：本人の依頼（REQUEST_R9）】
//   「全部のパターンが同じ」「ペンライトが細長すぎる・揺れがゆっくりすぎる（ゆらゆらではなく、シュッ！シュッ！）」→
//   ・コールの種類（js/callKinds.js の A〜G。表示のときだけ判定）ごとに、色・文字の出し方・ペンライトの振り方・照明を変える。
//     MIX：区切り（！）ごとに順に飛び出す・照明の色が区切りごとに切り替わる・進むほど速く大きく・最後で爆発。
//     短い掛け声：一瞬で大きく。続くときは 1 回ごとに 左 → 右 → 中央 → 全体 と位置を変える。
//     名前：「超絶かわいい！」で溜めて → 名前で一気に（メンバーカラーのスポットライトとペンライト。or は複数の色が交差）。
//     ふわふわ・あーふふー：全曲で同じ「弾む・波」。はいはい・連続：回数に合わせて左右交互に跳ねる・最後で大きく。
//     特殊（イェッタイガー 等）：一瞬暗くなって、奥から爆発。口上：1 文字ずつ灯る。手拍子・1文字ずつ・合図・一緒に歌う：それぞれ別の見せ方。
//   ・ペンライト：発光部（先の丸い筒・芯は白・まわりに光の広がり）と持ち手を分けた本物に近い形・太さ。
//     振りは「速い振り（シュッ）→ 止め」のメリハリ。振る瞬間だけ残像が出て光が強くなる。コールの始まりで一斉に。強い種類ほど速い。
//     ペンライトの角度は「いまの時刻」だけから決まる純粋関数（penlightPoseAt）。一時停止・シーク・再開でも、その時刻の振り。
//   ・区切り・回数・1 文字ずつの「見せる時刻」は、本人の 1 件の開始〜終了を等分したもの（見せ方だけ。時刻のデータは作らない）。
//   ・画面全体の光（白い光）は、どの 1 秒の中でも 3 回まで（planSpectacle が全部の光の予定を数えて、超える分は出さない）。
//
import { describeNameCall, nameCallAccent, renderNameCallText, NAME_KINDS } from "./liveCallNames.js";
import { CALL_KINDS, classifyCallSequence, splitCallSegments } from "./callKinds.js";
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
// 【r9-fx】画面全体の光（白い光）：どの 1 秒の中でも 3 回まで。光と光の間は 0.25 秒以上
export const SP_FLASH_MAX_PER_SEC = 3;
export const SP_FLASH_MIN_GAP_SEC = 0.25;
// 【r9-fx】特殊（イェッタイガー 等）：始まりの暗転の長さ（秒）。そのあと奥から爆発
export const SP_SPECIAL_DARK_SEC = 0.14;
// 【r9-fx】名前コールの「溜め」（超絶かわいい！）の長さの上限（秒）と、1 件の長さに対する割合
export const SP_NAME_BUILD_MAX_SEC = 0.9;
export const SP_NAME_BUILD_RATIO = 0.45;
// 【r9-fx】短い掛け声が続くときの置き場所の順番：左 → 右 → 中央 → 全体（x・y は「空いている幅・高さ」に対する割合、r 傾き、s 大きさ）
export const SP_SHOUT_SPOTS = [
  { name: "left", x: -0.85, y: -0.35, r: -9, s: 1 },
  { name: "right", x: 0.85, y: 0.3, r: 8, s: 1 },
  { name: "center", x: 0, y: -0.1, r: -2, s: 1.05 },
  { name: "all", x: 0, y: 0, r: 0, s: 1.3 },
];
// 区切り・回数の印（点）の数の上限（それ以上はまとめて進む）
export const SP_PIPS_MAX = 16;

// 【r9-fx】種類ごとの見せ方（色・ペンライトの振り方）。数は「1 秒に何回振るか」（f0 → f1 へ、進むほど速く）・振れ幅（度）
//   mode：flick＝シュッ！と振って止める／thrust＝回数ごとに突き上げる（左右交互）／wave＝弾む波／charge＝溜め→一気に（名前）／
//         blast＝暗転→爆発（特殊）／hold＝高く掲げて小さく震わせる（口上）／low＝下げる（合図）
//   together：始まりで全部が一斉に（ずらさない）
export const SP_FX = {
  mix: { palette: ["#ff2d95", "#ffd400", "#00e5ff", "#ff6a00", "#b04dff"], mode: "flick", f0: 2.6, f1: 4.2, amp: 24, amp1: 32, together: false },
  shout: { palette: ["#ffffff", "#ffb000", "#ff3b3b", "#ff7a00"], mode: "flick", f0: 4.2, f1: 4.2, amp: 28, together: true },
  name: { palette: null, mode: "charge", f0: 3.2, f1: 3.2, amp: 26, together: true },
  fuwa: { palette: ["#ffb3d9", "#9ff0ff", "#fff1a8", "#c9b5ff"], mode: "wave", f0: 1.5, f1: 1.5, amp: 22, together: false },
  repeat: { palette: ["#c6ff00", "#00e676", "#00b0ff", "#ffffff"], mode: "thrust", f0: 0, f1: 0, amp: 18, together: true },
  special: { palette: ["#ffd700", "#ff4081", "#40c4ff", "#ffffff"], mode: "blast", f0: 4.8, f1: 4.8, amp: 34, together: true },
  kojo: { palette: ["#ff4d6d", "#ff8fa3", "#ffffff", "#ffc2d1"], mode: "hold", f0: 1.1, f1: 1.1, amp: 6, together: false },
  clap: { palette: ["#ffcc80", "#ffffff", "#ffab40", "#ffe0b2"], mode: "thrust", f0: 0, f1: 0, amp: 8, together: true },
  spell: { palette: ["#00f0ff", "#ff00e5", "#ffffff", "#7c4dff"], mode: "thrust", f0: 0, f1: 0, amp: 22, together: true },
  cue: { palette: ["#ffb300", "#ffffff", "#ff6f00", "#ffe082"], mode: "low", f0: 0, f1: 0, amp: 4, together: false },
  sing: { palette: ["#4fc3f7", "#b388ff", "#80deea", "#e1f5fe"], mode: "flick", f0: 1.5, f1: 1.5, amp: 15, together: false },
  normal: { palette: SP_VENUE_COLORS, mode: "flick", f0: 2.3, f1: 2.3, amp: 20, together: false },
};
// 種類ごとの「振りの速さ」の強さの順（強いコールほど速く）：テストで「特殊 ＞ 短い ＞ MIX の最後 ＞ 名前 ＞ ふつう ＞ 歌う」を確かめる

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
const frac = (v) => v - Math.floor(v);

// 1 件の中の「区切り」の見せる時刻（純粋関数）：本人の開始〜終了を区切りの数で等分（推測の時刻をデータとして作らない。見せ方だけ）
// 戻り値：{ i 何番目, n 数, age その区切りが始まってからの秒, len 1 区切りの秒 }
export function segmentAt(item, t) {
  const n = Math.max(1, item?.segs?.length || item?.beats || 1);
  const dur = Math.max(0.001, (item?.end ?? 0) - (item?.start ?? 0));
  const len = dur / n;
  const age = Math.max(0, t - (item?.start ?? 0));
  const i = Math.min(n - 1, Math.floor(age / len));
  return { i, n, age: age - i * len, len };
}

// 名前コールの「名前で一気に」の時刻（純粋関数）：名前の前の言葉（超絶かわいい！）があれば、少し溜めてから。なければ始まりから
export function nameBlastTime(item) {
  if (!item || !(item.lead > 0)) return item?.start ?? 0;
  const dur = item.end - item.start;
  return item.start + Math.min(SP_NAME_BUILD_MAX_SEC, dur * SP_NAME_BUILD_RATIO);
}

// 画面全体の光の予定を決める（純粋関数）。forced（会場が下りてくる始まり）は必ず出す。そのほかは 1 秒に 3 回・0.25 秒以上の間を守れるときだけ
function planFlashes(items) {
  const events = [];
  items.forEach((item, index) => {
    const prev = items[index - 1];
    const bridgedIn = Boolean(prev && item.start - prev.end <= SP_BRIDGE_SEC);
    const dur = item.end - item.start;
    const base = (POP[item.kind] ?? POP[SP_KINDS.NORMAL]).wash;
    if (!bridgedIn) events.push({ index, t: item.start, s: item.fx === CALL_KINDS.SPECIAL ? 0 : base, forced: true });
    if (item.fx === CALL_KINDS.SHOUT && bridgedIn && item.run % SP_SHOUT_SPOTS.length === 3) events.push({ index, t: item.start, s: 0.55 });
    if (item.fx === CALL_KINDS.MIX && item.segs.length > 2) events.push({ index, t: item.start + (dur / item.segs.length) * (item.segs.length - 1), s: 0.6, finale: true });
    if (item.fx === CALL_KINDS.SPECIAL) events.push({ index, t: item.start + Math.min(SP_SPECIAL_DARK_SEC, dur * 0.3), s: 0.85 });
    if (item.fx === CALL_KINDS.NAME && item.lead > 0) events.push({ index, t: nameBlastTime(item), s: 0.5 });
    if ((item.fx === CALL_KINDS.REPEAT || item.fx === CALL_KINDS.SPELL) && item.beats >= 2 && dur / item.beats >= 0.22) {
      events.push({ index, t: item.start + (dur / item.beats) * (item.beats - 1), s: 0.42 });
    }
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
    let segs = [];
    if (fx === CALL_KINDS.MIX) segs = splitCallSegments(call.text, "shout");
    else if (fx === CALL_KINDS.SPELL) segs = splitCallSegments(call.text, "dot");
    const beats = fx === CALL_KINDS.SPELL ? segs.length : Math.max(1, Math.min(64, k.beats || 1));
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
const OWN_MOTION = new Set([CALL_KINDS.MIX, CALL_KINDS.REPEAT, CALL_KINDS.FUWA, CALL_KINDS.CLAP, CALL_KINDS.SPELL]);

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
  seg: -1,
  beat: -1,
  lit: 0,
  named: false,
  hue: 0,
});

// 時刻 t の演出の状態（純粋関数）。plan は planSpectacle の結果（start の昇順）。
// 戻り値：{ key, kind, fx, index,
//   word: { o 濃さ, s 拡大, x 横のずれ, y 縦のずれ（どちらも空いている幅・高さに対する割合 -1〜1）, r 傾き（度） },
//   stage 会場（暗幕・光線・ペンライト）の濃さ, wash 画面全体の光, burst 始まりの爆発（光の輪・光の筋）,
//   heat 長いコールの進み具合（進むほど光線が濃く）, beams 背景の光の柱の強さ,
//   dark 暗転（特殊の始まり）, seg 区切りの番号（MIX）, beat 回数の番号, lit 灯った割合（口上・歌う・1文字ずつ）, named 名前で一気に（名前コール）, hue 照明の色の番号 }
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
  let dark = 0;
  let seg = -1;
  let beat = -1;
  let lit = 0;
  let named = true;
  let hue = 0;
  const inCall = time < item.end;
  if (!reduced) s = popScale(age, fxPop);
  // ---- 種類ごとの動き ----
  if (fx === CALL_KINDS.MIX && item.segs?.length) {
    // 区切りごとに飛び出す。進むほど大きく、最後の区切りは一番大きく爆発
    const sg = segmentAt(item, Math.min(time, item.end - 1e-6));
    seg = sg.i;
    hue = sg.i;
    const p = sg.n > 1 ? sg.i / (sg.n - 1) : 1;
    const last = sg.i === sg.n - 1 && sg.n > 2;
    if (!reduced) {
      const over = last ? 1.3 : 1.12 + 0.1 * p;
      const settle = last ? 1.1 : 1 + 0.06 * p;
      const peakAt = Math.min(0.08, sg.len * 0.3);
      const settleAt = Math.min(0.24, sg.len * 0.7);
      const a = sg.age;
      s = a < peakAt ? 0.42 + (over - 0.42) * easeOutCubic(a / peakAt) : a < settleAt ? over + (settle - over) * ease((a - peakAt) / (settleAt - peakAt)) : settle;
      const side = sg.i % 2 ? 1 : -1;
      x = last ? 0 : side * 0.18 * (1 - 0.5 * p);
      y = last ? 0 : (sg.i % 3 === 0 ? -0.2 : sg.i % 3 === 1 ? 0.15 : 0) * (1 - p);
      r = last ? 0 : side * (3 + 3 * p);
      burst = last ? clamp01(1 - a / 0.5) : clamp01(1 - a / 0.25) * 0.55;
    }
  } else if (fx === CALL_KINDS.SHOUT) {
    // 続くときは 1 回ごとに 左 → 右 → 中央 → 全体（1 回だけのときは中央に大きく）
    const spot = item.runLen > 1 ? SP_SHOUT_SPOTS[item.run % SP_SHOUT_SPOTS.length] : SP_SHOUT_SPOTS[3];
    if (!reduced) {
      x = spot.x;
      y = spot.y;
      r = spot.r;
      s *= spot.s;
    }
  } else if (fx === CALL_KINDS.NAME) {
    // 「超絶かわいい！」で溜めて → 名前で一気に（名前の前の言葉が無ければ始まりから名前）
    const blastAt = nameBlastTime(item);
    named = time >= blastAt;
    if (!reduced) {
      if (!named) {
        // 溜め：少し小さく出て、じわじわ大きく（震え）
        const q = clamp01(age / Math.max(0.05, blastAt - item.start));
        s = popScale(age, { from: 0.6, over: 0.92, peakAt: 0.1, settleAt: 0.2 }) * (0.92 + 0.06 * q);
        if (age > 0.2) s = 0.9 + 0.06 * q;
        x = 0.012 * Math.sin(age * 90);
        burst = 0;
      } else {
        const a = time - blastAt;
        s = popScale(a, { from: 0.9, over: 1.22, peakAt: 0.08, settleAt: 0.3 });
        burst = clamp01(1 - a / 0.5);
      }
    }
  } else if (fx === CALL_KINDS.FUWA) {
    // ふわふわ・あーふふー：左右に弾む（全曲で同じ動き）
    if (!reduced) {
      const ph = age * 1.5; // 1 秒に 1.5 回弾む
      y = -0.55 * Math.abs(Math.sin(Math.PI * ph));
      x = 0.35 * Math.sin(Math.PI * ph * 0.5 + Math.PI / 2) * -1;
      r = 6 * Math.sin(Math.PI * ph * 0.5);
      const land = 1 - Math.abs(Math.sin(Math.PI * ph));
      s *= 1 + 0.06 * (1 - land) - 0.04 * Math.pow(land, 6);
    }
  } else if (fx === CALL_KINDS.REPEAT || fx === CALL_KINDS.CLAP || fx === CALL_KINDS.SPELL) {
    // 回数に合わせて跳ねる（左右交互）。最後の 1 回は大きく
    const bt = segmentAt({ ...item, segs: null }, Math.min(time, item.end - 1e-6));
    beat = bt.i;
    const last = bt.i === bt.n - 1 && bt.n > 1;
    lit = fx === CALL_KINDS.SPELL ? (bt.i + 1) / bt.n : 0;
    if (!reduced) {
      const ph = clamp01(bt.age / bt.len);
      const jump = ph < 0.25 ? easeOutCubic(ph / 0.25) : 1 - ease((ph - 0.25) / 0.75);
      if (fx === CALL_KINDS.REPEAT) {
        const side = bt.i % 2 ? 1 : -1;
        x = last ? 0 : side * 0.5;
        y = -0.4 * jump;
        r = last ? 0 : side * 6;
        s *= (last ? 1.14 : 1) * (1 + 0.08 * jump);
      } else if (fx === CALL_KINDS.CLAP) {
        s *= 1 + 0.09 * jump;
        y = 0.08 * jump;
      } else {
        s *= (last ? 1.2 : 1) * (1 + 0.07 * jump);
        y = -0.12 * jump;
      }
      burst = clamp01(1 - bt.age / 0.3) * (last ? 1 : 0.6);
    }
  } else if (fx === CALL_KINDS.SPECIAL) {
    // 一瞬暗くなって（文字は奥に小さく）→ 奥から一気に飛び出す（大きく回りながら。最後は読める向き）
    const darkEnd = Math.min(SP_SPECIAL_DARK_SEC, duration * 0.3);
    if (!reduced) {
      dark = age < darkEnd ? 1 : clamp01(1 - (age - darkEnd) / 0.18);
      const a = Math.max(0, age - darkEnd);
      s = age < darkEnd ? 0.04 : popScale(a, FX_POP.special);
      r = age < darkEnd ? -200 : -200 * (1 - easeOutCubic(a / 0.34));
      burst = age < darkEnd ? 0 : clamp01(1 - a / 0.55);
      if (age >= darkEnd + 0.46 && inCall) s *= 1 + 0.06 * (0.5 - 0.5 * Math.cos((age - darkEnd - 0.46) * Math.PI * 2 * 1.6));
    }
  } else if (fx === CALL_KINDS.KOJO || fx === CALL_KINDS.SING) {
    // 口上・歌う：1 文字ずつ灯る（1 件の時間の 85% で全部。見せ方だけ）。口上は最後にもう一押し
    lit = clamp01(age / Math.max(0.2, duration * (fx === CALL_KINDS.KOJO ? 0.85 : 0.9)));
    if (!reduced && fx === CALL_KINDS.KOJO) {
      const endPush = clamp01((age - duration * 0.85) / Math.max(0.1, duration * 0.15));
      s *= 1 + 0.08 * Math.sin(Math.PI * endPush);
      burst = Math.max(burst, endPush > 0 && endPush < 1 ? 0.5 * (1 - endPush) : 0);
    }
    if (!reduced && fx === CALL_KINDS.SING) x = 0.05 * Math.sin(age * Math.PI * 1.2);
  } else if (fx === CALL_KINDS.CUE) {
    // 動作の合図：上から札のように下りてきて、そのまま
    if (!reduced) {
      y = -0.6 * (1 - easeOutCubic(age / 0.3));
      burst = 0;
    }
  } else if (kind === SP_KINDS.CHAIN && !reduced) {
    // 【r8-fx から】種類が決まらない続けて来るコール：順番に置き場所を変える
    const [cx, cr] = SP_CHAIN_SPOTS[item.chainIndex % SP_CHAIN_SPOTS.length];
    x = cx * 4;
    r = cr;
  }
  // 終わるまで「今まさに叫んでいる」：ゆっくり脈打つ（大きさだけ。明るさは変えない）
  if (!reduced && SUSTAIN.has(kind) && !OWN_MOTION.has(fx) && fx !== CALL_KINDS.SPECIAL && age >= (fxPop.settleAt ?? pop.settleAt) && inCall) {
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
  return {
    key: item.key,
    kind,
    fx,
    index,
    word: { o: r3(o), s: r3(s), x: r3(x), y: r3(y), r: r3(r) },
    stage: r3(stage),
    wash: r3(wash),
    burst: r3(burst),
    heat: r3(heat),
    beams: r3(Math.min(1, beams)),
    dark: r3(dark),
    seg,
    beat,
    lit: r3(lit),
    named,
    hue,
  };
}

// ===== ペンライトの振り（純粋関数） =====
// 「シュッ！」：1 回の振りの中で、最初の 30% で一気に振り切り（少し行き過ぎて）、残りは止める。u：0〜1
// 戻り値：{ pos −1〜1.1（振り始め〜振り切り）, vel 速さ 0〜1（振り始めが一番速い） }
export function flickCurve(u) {
  const k = 0.3;
  const v = Math.max(0, Math.min(0.999999, u));
  if (v < k) {
    const q = v / k;
    return { pos: -1 + 2.1 * easeOutCubic(q), vel: Math.pow(1 - q, 2) };
  }
  return { pos: 1.1 - 0.1 * ease((v - k) / (1 - k)), vel: 0 };
}

// i 本目（count 本中）のペンライトの向き（純粋関数）。plan・t は spectacleStateAt と同じ。
// 戻り値：{ a 角度（度。持ち手が軸）, y 上下（ペンライトの長さに対する割合。負が上）, v 振りの速さ 0〜1（残像・光の強さ）, d 振る向き（1 右へ・−1 左へ） }
export function penlightPoseAt(plan, t, i, count, { reduced = false, row = i % 2 } = {}) {
  const n = Math.max(1, count);
  const xpos = n > 1 ? i / (n - 1) : 0.5; // 0 左端 〜 1 右端
  const lean = (xpos - 0.5) * 14; // 左の人は左へ、右の人は右へ少し傾ける（客席の広がり）
  const restA = r3(lean + ((i * 7) % 5) - 2);
  const rest = { a: restA, y: 0, v: 0, d: 1 };
  const list = Array.isArray(plan) ? plan : [];
  let index = -1;
  for (let j = 0; j < list.length; j++) {
    if (list[j].start <= t) index = j;
    else break;
  }
  if (index < 0 || reduced) return rest;
  let item = list[index];
  const next = list[index + 1] ?? null;
  // 次のコールまでの間（会場を下ろしたまま）は、小さく振り続ける（止まらない）
  const tailEnd = Math.min(item.end + SP_TAIL_SEC, next ? next.start : Infinity);
  const between = t >= tailEnd;
  if (between && !(next && next.start - item.end <= SP_BRIDGE_SEC)) return rest;
  const fxName = item.fx ?? CALL_KINDS.NORMAL;
  const conf = SP_FX[fxName] ?? SP_FX.normal;
  const dur = Math.max(0.05, item.end - item.start);
  // ずらし：一斉の種類は 0。そのほかは後ろの列を少し遅らせ、1 本ずつほんの少しずらす（自然に見せる）
  const lag = conf.together ? 0 : row * 0.045 + (((i * 5) % 7) / 7) * 0.03;
  const age = Math.max(0, t - item.start - lag);
  if (between) {
    // 間：ふつうの速さで小さく
    const ph = 2 * (t - item.end);
    const f = flickCurve(frac(ph));
    const dir = Math.floor(ph) % 2 ? -1 : 1;
    return { a: r3(lean + 10 * dir * f.pos), y: 0, v: r3(f.vel * 0.4), d: dir };
  }
  // 1 本ずつ振れ幅を少し変える（同じ角度の柵に見せない）。一斉の種類は差を小さく
  const ampMul = conf.together ? 0.94 + ((i * 3) % 3) * 0.04 : 0.84 + ((i * 5) % 4) * 0.08;
  const flick = (phase, amp, liftAmp = 0.05) => {
    const nflick = Math.floor(phase);
    const f = flickCurve(frac(phase));
    const dir = nflick % 2 ? -1 : 1;
    return { a: r3(lean * 0.6 + amp * ampMul * dir * f.pos), y: r3(-liftAmp * f.vel), v: r3(f.vel), d: dir };
  };
  switch (conf.mode) {
    case "flick": {
      // f0 → f1 へ、進むほど速く（振った回数＝速さの積分。どの時刻でも同じ値）
      const f0 = conf.f0;
      const f1 = conf.f1;
      const p = clamp01(age / dur);
      const phase = f0 * age + ((f1 - f0) * Math.min(age, dur) ** 2) / (2 * dur);
      const amp = conf.amp + ((conf.amp1 ?? conf.amp) - conf.amp) * p;
      // MIX の最後の区切りは、全員が一斉に大きく
      if (fxName === CALL_KINDS.MIX && item.segs?.length > 2) {
        const sg = segmentAt(item, Math.min(t, item.end - 1e-6));
        if (sg.i === sg.n - 1) return flick(4.6 * sg.age, 36, 0.12);
      }
      const spotAmp = fxName === CALL_KINDS.SHOUT && item.runLen > 1 && item.run % SP_SHOUT_SPOTS.length === 3 ? 34 : amp;
      return flick(phase, spotAmp, fxName === CALL_KINDS.SHOUT ? 0.1 : 0.05);
    }
    case "charge": {
      // 名前：溜めの間は高く掲げて小刻みに震える → 名前で一斉に速く振る
      const blastAt = nameBlastTime(item);
      if (t < blastAt) {
        const q = clamp01(age / Math.max(0.05, blastAt - item.start));
        return { a: r3(lean * 0.4 + 2.2 * Math.sin(age * 44 + i)), y: r3(-0.1 * ease(q)), v: 0, d: 1 };
      }
      return flick(conf.f0 * (t - blastAt), conf.amp, 0.1);
    }
    case "blast": {
      // 特殊：暗転の間は下げて構える → 爆発で全員が一斉に、いちばん速く
      const darkEnd = item.start + Math.min(SP_SPECIAL_DARK_SEC, dur * 0.3);
      if (t < darkEnd) return { a: r3(lean * 0.3), y: 0.14, v: 0, d: 1 };
      return flick(conf.f0 * (t - darkEnd), conf.amp, 0.14);
    }
    case "wave": {
      // ふわふわ：客席を波が渡る（左から右へ）。弾むように上下
      const ph = conf.f0 * age - xpos * 0.9;
      const sw = Math.sin(Math.PI * 2 * ph);
      return { a: r3(lean * 0.5 + conf.amp * sw), y: r3(-0.12 * Math.abs(Math.sin(Math.PI * 2 * ph))), v: r3(0.45 * Math.abs(Math.cos(Math.PI * 2 * ph))), d: Math.cos(Math.PI * 2 * ph) >= 0 ? 1 : -1 };
    }
    case "thrust": {
      // 回数ごとに突き上げる。連続は左右交互（偶数の回は左半分、奇数の回は右半分）。最後の回は全員
      const bt = segmentAt({ ...item, segs: null, beats: item.beats }, Math.min(t, item.end - 1e-6));
      const ph = clamp01((age - bt.i * bt.len) / bt.len);
      const last = bt.i === bt.n - 1 && bt.n > 1;
      const mine = fxName !== CALL_KINDS.REPEAT || last || (bt.i % 2 === 0 ? xpos <= 0.5 : xpos >= 0.5);
      const up = ph < 0.2 ? easeOutCubic(ph / 0.2) : 1 - ease((ph - 0.2) / 0.8);
      const side = bt.i % 2 ? 1 : -1;
      if (!mine) return { a: r3(lean * 0.6), y: 0.04, v: 0, d: 1 };
      const amp = fxName === CALL_KINDS.CLAP ? 0.08 : last ? 0.2 : 0.15;
      return { a: r3(lean * 0.4 + side * conf.amp * up * (fxName === CALL_KINDS.REPEAT ? 1 : 0.4)), y: r3(-amp * up), v: r3(ph < 0.2 ? 1 - ph / 0.2 : 0), d: side };
    }
    case "hold": {
      // 口上：高く掲げて、小さく震わせる（言葉を聞かせる）。最後にひと振り
      const endAt = dur * 0.85;
      if (age >= endAt) return flick(3.4 * (age - endAt), 28, 0.08);
      return { a: r3(lean * 0.3 + conf.amp * Math.sin(Math.PI * 2 * conf.f0 * age + i)), y: -0.08, v: 0, d: 1 };
    }
    case "low":
    default:
      // 合図：下げて待つ
      return { a: r3(lean * 0.5), y: 0.12, v: 0, d: 1 };
  }
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
// それ以外：種類の色。MIX は区切りごとに色が回る（hue）
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
  // 【r9-fx】ペンライト：持ち手（sp-grip）と発光部（先の丸い筒 sp-tube）・光の広がり（sp-halo）・振る瞬間の残像（sp-trail）
  const sticks = [];
  for (let i = 0; i < crowdCount; i++) {
    // 後ろの列（小さく・暗く）と前の列（大きく）を交互に。位置は番号から決める（毎回同じ）
    const row = i % 2;
    const stick = crowd.appendChild(el("i", row ? "is-front" : "is-back"));
    const slot = (i + 0.5) / crowdCount;
    stick.style.setProperty("--x", `${r3(5 + slot * 90 + (row ? 1.5 : -1.5))}%`);
    const trail = stick.appendChild(el("b", "sp-trail"));
    const halo = stick.appendChild(el("b", "sp-halo"));
    stick.appendChild(el("b", "sp-tube"));
    stick.appendChild(el("b", "sp-grip"));
    sticks.push({ stick, trail, halo, row, last: "" });
  }
  // 【r9-fx】特殊の暗転（会場の上に一瞬だけ黒）
  const darkEl = box.appendChild(el("div", "sp-dark"));
  const word = layer.appendChild(el("div", "sp-word"));
  const burst = word.appendChild(el("span", "sp-burst"));
  const sparks = word.appendChild(el("span", "sp-sparks"));
  const text = word.appendChild(el("span", "sp-word-text"));
  // 【r9-fx】区切り・回数の印（点）。MIX・連続・手拍子で、いま何回目かを見せる
  const pips = word.appendChild(el("span", "sp-pips"));
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
  let chars = []; // 1 文字ずつの部品（口上・歌う・1文字ずつ・ふわふわ）
  let charLit = -1;
  let pipEls = [];
  let pipLit = -1;
  let shownSeg = -1;
  let shownHue = -1;
  let shownNamed = null;
  let free = { x: 0, y: 0 }; // 文字を動かせる余白（px。コールが変わったときに1回だけ測る）

  function setColors(item, hue = 0) {
    const named = Boolean(item?.colors?.length);
    const fxNamed = item?.fx === CALL_KINDS.NAME && item?.fxColors?.length;
    const theme = SP_FX[item?.fx] ?? SP_FX.normal;
    // 名前：その人たちの色。それ以外：種類の色（MIX は区切りごとに回す）
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
    charLit = -1;
  }

  function buildPips(n) {
    pips.textContent = "";
    pipEls = [];
    pipLit = -1;
    const count = Math.min(SP_PIPS_MAX, n);
    pips.hidden = count < 2;
    for (let i = 0; i < count; i++) pipEls.push(pips.appendChild(el("i")));
  }

  function showItem(item) {
    layer.dataset.kind = item?.kind ?? "";
    layer.dataset.fx = item?.fx ?? "";
    layer.dataset.size = item?.size ?? "";
    layer.dataset.names = item?.nameKind ?? "";
    toggle("is-hot", Boolean(item?.hot));
    chars = [];
    charLit = -1;
    shownSeg = -1;
    shownHue = -1;
    shownNamed = null;
    word.classList.remove("is-named", "is-build", "is-oneline", "is-finale");
    if (!item) {
      text.textContent = "";
      buildPips(0);
      return;
    }
    const fx = item.fx;
    // 文字は本人のコールのまま。名前の部分だけ、その人の色の光（js/liveCallNames.js の部品）
    if (item.kind === SP_KINDS.NAME) {
      renderNameCallText(text, item.text);
      // 名前の前の言葉（超絶かわいい！）をまとめる（溜めの間、名前はうっすら → 名前で一気に）
      const firstName = text.querySelector(".cx-name-part");
      if (fx === CALL_KINDS.NAME && item.lead > 0 && firstName) {
        const lead = el("span", "sp-lead");
        while (text.firstChild && text.firstChild !== firstName) lead.appendChild(text.firstChild);
        text.insertBefore(lead, firstName);
      }
    } else if (fx === CALL_KINDS.MIX && item.segs?.length) text.textContent = item.segs[0];
    else if (fx === CALL_KINDS.KOJO || fx === CALL_KINDS.SING || fx === CALL_KINDS.SPELL || fx === CALL_KINDS.FUWA) splitChars(text, item.text);
    else text.textContent = item.text;
    buildPips(fx === CALL_KINDS.MIX ? item.segs.length : fx === CALL_KINDS.REPEAT || fx === CALL_KINDS.CLAP ? item.beats : 0);
    setColors(item);
    placeItem(item);
    // MIX：大きさは一番長い区切りで決めたので、ここから区切りの文字にする
    if (fx === CALL_KINDS.MIX && item.segs?.length) text.textContent = item.segs[0];
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

  // MIX：区切りの文字を順に出すので、どの区切りも収まる大きさ（一番小さくなる区切りに合わせる）にする。
  // 飛び出すときの拡大の分、幅は 88% まで
  // 飛び出すときに大きくなる種類は、その分だけ幅に余裕を持たせる（大きくなった瞬間に端が切れないように）
  const FIT_ROOM = { special: 0.8, shout: 0.84, name: 0.86, repeat: 0.88 };
  function fitFor(item) {
    if (item?.fx !== CALL_KINDS.MIX || !(item.segs?.length > 1)) {
      const room = FIT_ROOM[item?.fx] ?? 1;
      return room === 1 ? fitWord : (maxW, maxH, cap) => fitWord(maxW * room, maxH, cap);
    }
    return (maxW, maxH, cap) => {
      // 区切りは 1 行で見せる（「ジャージャー！」を折り返さない）。
      // 決まった大きさで 1 回ずつ幅を測り、一番幅の広い区切りで大きさを決める（測る回数を少なく）
      word.classList.add("is-oneline");
      layer.style.setProperty("--sp-fs", "100px");
      layer.style.setProperty("--sp-ww", "9999px");
      // 全部の区切りを 1 度に並べて、1 回の計算で全部の幅を読む（区切りの数だけ画面の計算をしない）
      text.textContent = "";
      const probes = item.segs.map((seg) => {
        const probe = text.appendChild(el("span", "sp-probe"));
        probe.textContent = seg;
        return probe;
      });
      let widest = item.segs[0];
      let widestW = -1;
      probes.forEach((probe, k) => {
        const w = probe.offsetWidth;
        if (w > widestW) {
          widestW = w;
          widest = item.segs[k];
        }
      });
      text.textContent = widest;
      fitWord(maxW * 0.88, maxH, cap);
      text.textContent = item.segs[0];
      return word.offsetHeight;
    };
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

  function updateFxParts(item, s) {
    if (!item) return;
    // MIX：区切りが変わったら、その区切りの文字に（大きさは測り直さない）。照明の色も区切りごとに回す
    if (item.fx === CALL_KINDS.MIX && s.seg >= 0 && s.seg !== shownSeg) {
      shownSeg = s.seg;
      text.textContent = item.segs[s.seg];
      word.classList.toggle("is-finale", s.seg === item.segs.length - 1 && item.segs.length > 2);
    }
    if (item.fx === CALL_KINDS.MIX && s.hue !== shownHue && s.hue >= 0) {
      shownHue = s.hue;
      setColors(item, s.hue);
    }
    // 名前：溜め → 名前で一気に
    if (item.fx === CALL_KINDS.NAME && shownNamed !== s.named) {
      shownNamed = s.named;
      word.classList.toggle("is-build", !s.named && item.lead > 0);
      word.classList.toggle("is-named", s.named);
    }
    // 1 文字ずつ灯る（口上・歌う・1文字ずつ）
    if (chars.length && item.fx !== CALL_KINDS.FUWA) {
      let litCount = chars.length;
      if (item.fx === CALL_KINDS.SPELL && item.segs?.length) {
        const segIndex = Math.max(0, Math.round(s.lit * item.segs.length) - 1);
        litCount = [...item.segs.slice(0, segIndex + 1).join("")].length;
      } else litCount = Math.round(s.lit * chars.length);
      if (litCount !== charLit) {
        chars.forEach((span, i) => {
          const on = i < litCount;
          if (span.classList.contains("is-lit") !== on) span.classList.toggle("is-lit", on);
        });
        charLit = litCount;
      }
    }
    // 回数・区切りの印
    if (pipEls.length) {
      const total = item.fx === CALL_KINDS.MIX ? item.segs.length : item.beats;
      const done = item.fx === CALL_KINDS.MIX ? s.seg + 1 : s.beat + 1;
      const litPips = Math.round((Math.max(0, done) / Math.max(1, total)) * pipEls.length);
      if (litPips !== pipLit) {
        pipEls.forEach((p, i) => {
          if (p.classList.contains("is-lit") !== i < litPips) p.classList.toggle("is-lit", i < litPips);
        });
        pipLit = litPips;
      }
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
      const item = s.index >= 0 ? plan[s.index] : null;
      updateFxParts(item, s);
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
      // 【r9-fx】ペンライト：いまの時刻の振り（会場が出ている間だけ書く。止まっている間・出ていない間は書かない）
      if (s.stage > 0 && playing) {
        sticks.forEach((st, i) => {
          const pose = penlightPoseAt(plan, t, i, sticks.length, { reduced, row: st.row });
          const key = `${Math.round(pose.a * 2)}|${Math.round(pose.y * 100)}|${Math.round(pose.v * 20)}|${pose.d}`;
          if (key === st.last) return;
          st.last = key;
          st.stick.style.transform = `translateY(${r3(pose.y * 100)}%) rotate(${r3(pose.a)}deg)`;
          // 残像：振っている向きの後ろに、少し遅れた発光部の影（振る瞬間だけ）。光の広がりも振る瞬間に強く
          st.trail.style.opacity = String(r3(pose.v * 0.85));
          st.trail.style.transform = `rotate(${pose.d >= 0 ? -14 : 14}deg)`;
          st.halo.style.opacity = String(r3(0.55 + 0.45 * pose.v));
        });
      }
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
