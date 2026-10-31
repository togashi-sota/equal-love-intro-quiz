// 新しいカラオケ（新しいライブコールの［カラオケ］から、本人の完成版のコールを渡して開いたとき）だけの演出（2026-10-30 夜新設）。
// js/karaokeSyncScreen.js が options.calls 付きで開いたときだけ enableKaraokeStage を呼ぶ。
// options.calls なしで開く前の「カラオケ同期」では、このファイルの部品は1つも作られず、クラスも付かない（見た目・動きは今までどおり）。
//
// 【本人の決まり】
// ・時刻の基準は音源の再生位置（js/karaokeSyncScreen.js の currentPositionSec。タイミング調整を足したもの）。
//   見た目は「いまの時刻 t」だけから決める（一時停止・シーク・曲の終わり・別の曲でも、その時刻の正しい見た目になる）。
// ・コールの区切り・時刻・文字列は変えない。1語ずつの演出・推定の区切りは作らない。演出は1つのコール全体に対して行う。
// ・歌詞は行単位の時刻のまま（行の中を補間しない）。
// ・サビの区間のデータは無い（歌詞・コール表のどちらにも無い）ので、サビの盛り上げはしない（推定で「サビ」と見せない）。
//
// 【軽さ】動きは CSS（transform・opacity）。JS は「状態が変わったときだけ」クラスを付け外しし、
//   進み具合のバー（長いコール・次のコールまで）だけ毎フレーム、値が変わったときに書く。
//   一時停止中は .kx-paused で CSS のアニメーションも止め、端末の「視差効果を減らす」では動き（粒・輪・弾み）を出さない（css/karaokeStage.css）。
import { MEMBERS } from "./data/members.js";
import { shortCallTier } from "./callEffects.js";
import { getCallDisplayTier } from "./callSync.js";
import { describeNameCall, nameCallAccent, renderNameCallText, nameCallAurora } from "./liveCallNames.js";
import { bindTapSeek } from "./callTapSeek.js";
import { createSpectacle, planSpectacle } from "./callSpectacle.js";

export const KX_BURST_WINDOW_SEC = 0.4; // コールの始まりからこの時間の内に描いたときだけ「発光と弾み」を出す（途中へシークしたときは出さない）
export const KX_COUNTDOWN_SEC = 3; // 次のコールまでの残りを、バーで見せる長さ（「もうすぐ！」の 3・2・1 と同じ）
export const KX_LONG_CALL_SEC = 4; // これ以上のコールは、カードの下に進み具合のバーを出す（ライブコールの「長い」と同じ）
export const KX_PARTICLE_COUNT = 10;
export const KX_SPARK_COUNT = 8;
// 火花の出る場所（カードの縁の上の点。x・y は %）と、外へ飛ぶ向き（px）。中央・文字の上からは出さない
export const KX_SPARK_POINTS = [
  [0, 0, -16, -14],
  [50, 0, 0, -20],
  [100, 0, 16, -14],
  [100, 50, 22, 0],
  [100, 100, 16, 14],
  [50, 100, 0, 20],
  [0, 100, -16, 14],
  [0, 50, -22, 0],
];
export const KX_FINALE_PIECE_COUNT = 14;

// センターがいない・全員の曲に使う色の組（曲の id から1つ選ぶ。同じ曲はいつも同じ色）
export const KX_SONG_PALETTES = [
  ["#ff6fa8", "#8f7dff"],
  ["#ff8fc0", "#5bc6ff"],
  ["#ff9f6b", "#ff5ca8"],
  ["#6fe0c4", "#ff7fb6"],
  ["#ffcf5c", "#ff6f9f"],
  ["#b88cff", "#64d2ff"],
];
const BRAND_PINK = "#ff6fa8";

// 文字列から決まった数を作る（同じ文字列ならいつも同じ。並べ替えに強い簡単なハッシュ）
export function stableHash(text) {
  let h = 2166136261;
  for (const ch of String(text ?? "")) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

// 背景のグラデーションの色（純粋関数）。根拠：
//   1. その曲のセンター（js/data/songs.js の center）のメンバーカラー。2人なら2色、1人ならその色とグループのピンク
//   2. センターがいない・「全員」・名前がメンバーのデータに無い曲は、曲の id から決めた色の組
// 戻り値：{ basis: "center" | "song", colors: [色1, 色2], memberIds }
export function karaokePaletteForSong(song, members = MEMBERS) {
  const centers = Array.isArray(song?.center) ? song.center : [];
  const found = [];
  for (const name of centers) {
    const member = members.find((m) => m.name === name);
    const hex = member?.memberColor?.hex;
    if (hex && !found.some((f) => f.id === member.id)) found.push({ id: member.id, hex });
  }
  if (found.length >= 2) return { basis: "center", colors: [found[0].hex, found[1].hex], memberIds: found.slice(0, 2).map((f) => f.id) };
  if (found.length === 1) return { basis: "center", colors: [found[0].hex, BRAND_PINK], memberIds: [found[0].id] };
  const pair = KX_SONG_PALETTES[stableHash(song?.id ?? "") % KX_SONG_PALETTES.length];
  return { basis: "song", colors: [...pair], memberIds: [] };
}

// 時刻 t での演出の状態（純粋関数。同じ t なら必ず同じ結果）。calls は start 昇順（本人の開始〜終了そのまま）。
// lines：歌詞の行（{ start, end }。行単位の時刻のまま）。次の行を控えめに見せるのに使う
export function karaokeStageStateAt(calls, t, lines = []) {
  const list = Array.isArray(calls) ? calls : [];
  const time = Number.isFinite(t) ? t : 0;
  // 光っているコール：start <= t < end のうち、最後に始まったもの（js/karaokeSync.js の findActiveCallIndex と同じ決まり）
  let activeIndex = -1;
  for (let i = 0; i < list.length; i++) {
    if (time >= list[i].start && time < list[i].end) activeIndex = i;
  }
  const active = activeIndex === -1 ? null : list[activeIndex];
  const nextIndex = list.findIndex((call) => call.start > time);
  const next = nextIndex === -1 ? null : list[nextIndex];
  const nextIn = next ? next.start - time : null;
  const duration = active ? active.end - active.start : 0;
  const round = (v) => Math.round(v * 1000) / 1000;
  // 次のコールまでのバー：光っているコールが無く、残り KX_COUNTDOWN_SEC 秒の内だけ（0 → 1 へ満ちる）
  const countdown = !active && next && nextIn <= KX_COUNTDOWN_SEC ? round(1 - nextIn / KX_COUNTDOWN_SEC) : 0;
  let nextLineIndex = -1;
  if (Array.isArray(lines)) nextLineIndex = lines.findIndex((line) => Number.isFinite(line?.start) && line.start > time);
  const last = list.length ? list[list.length - 1] : null;
  return {
    activeIndex,
    active,
    justStarted: Boolean(active) && time - active.start < KX_BURST_WINDOW_SEC,
    long: Boolean(active) && duration >= KX_LONG_CALL_SEC,
    progress: active && duration > 0 ? round(Math.min(1, Math.max(0, (time - active.start) / duration))) : 0,
    next,
    nextIn: nextIn === null ? null : round(nextIn),
    countdown,
    nextLineIndex,
    allCallsDone: Boolean(last) && time >= Math.max(...list.map((call) => call.end)),
  };
}

// 「そのあと」の予告に出す文字（新しいカラオケだけ。純粋関数）。
// 前のカラオケ同期（js/karaokeSync.js の getCallPreviewLabel）は、長いコールを種類の名前（「固有コール」「MIX」など）にしているが、
// 「固有コール」は初めての人に分からない言葉なので、新しい方では本人のコールの文字の始めの部分を出す（文字は変えない。省くだけ）。
// 短い・ふつうのコールは今までどおり、そのままの文字
export const KX_PREVIEW_MAX_CHARS = 10;
export function karaokePreviewLabel(call) {
  const text = String(call?.text ?? "");
  if (getCallDisplayTier(text) !== "long") return text;
  const head = text.replace(/\s+/g, " ").trim();
  const chars = [...head];
  return chars.length > KX_PREVIEW_MAX_CHARS ? `${chars.slice(0, KX_PREVIEW_MAX_CHARS).join("")}…` : head;
}

// ===== 【2026-10-31 live-unify】コール表示 ON：赤いコールを、歌詞の行の間に「コール表に近い並び」で置く =====
// 並びは本人のコール表（js/callTextLayout.js の layout）のまま：行の前のコールはその行の前に、行の横・後ろのコールはその行の後ろに、
// 前奏・間奏・後奏のコールは、その位置（前の行の後ろ。前奏は最初の行の前）に1行。
// 歌詞の行は、カラオケが描く元の歌詞の行（lines。行番号 line）に対応させる（表示用に分けた行は、始まりの元の行・終わりの元の行で決める）。
// 戻り値：[{ anchor: 元の歌詞の行の番号（配列の位置。-1 は最初の行より前）, place: "before" | "after", block: 前奏・間奏・後奏か, keys: [コールのキー] }]（上から順）
// 決まり：時刻のあるコール（calls）は、必ずちょうど1回だけ入る（並びに無いものは、時刻で一番近い行の後ろへ）。コールの文字・時刻はここでは扱わない
export function buildKaraokeCallPlacement(layout, calls, lines) {
  const timed = new Map((Array.isArray(calls) ? calls : []).map((call) => [call.key, call]));
  const lineList = Array.isArray(lines) ? lines : [];
  const indexOfLineNo = new Map(lineList.map((line, index) => [line?.line, index]));
  const placed = new Set();
  const rows = [];
  const push = (anchor, place, list, block = false) => {
    const keys = [];
    for (const call of list ?? []) {
      if (!timed.has(call.key) || placed.has(call.key)) continue;
      placed.add(call.key);
      keys.push(call.key);
    }
    if (!keys.length) return;
    // 同じ場所に続けて来たものは1行にまとめる（コールは1件ずつ別の部品のまま）
    const prev = rows[rows.length - 1];
    if (prev && prev.anchor === anchor && prev.place === place && prev.block === block) prev.keys.push(...keys);
    else rows.push({ anchor, place, block, keys });
  };
  let lastAnchor = -1;
  for (const item of layout?.items ?? []) {
    if (item.kind === "block") {
      const at = indexOfLineNo.has(item.lineNo) ? indexOfLineNo.get(item.lineNo) : lastAnchor;
      // 前奏は最初の行の前。間奏・後奏はその行の後ろ
      if (item.position === "intro") push(at, "before", item.calls, true);
      else push(at, "after", item.calls, true);
      continue;
    }
    if (item.kind !== "line") continue;
    // 表示行を作っている元の歌詞の行（並びの parts のうち歌詞の部分）。最初と最後の元の行で、置く場所を決める
    const pieces = (item.parts ?? []).filter((part) => part.kind === "segment");
    const firstNo = pieces[0]?.lineNo ?? item.lineNo;
    const lastNo = pieces[pieces.length - 1]?.lineNo ?? item.lineNo;
    const first = indexOfLineNo.has(firstNo) ? indexOfLineNo.get(firstNo) : lastAnchor;
    const last = indexOfLineNo.has(lastNo) ? indexOfLineNo.get(lastNo) : first;
    push(first, "before", item.before);
    push(last, "after", [...(item.anchored ?? []).flatMap((group) => group.calls), ...(item.inline ?? []), ...(item.after ?? [])]);
    lastAnchor = last;
  }
  // 並び（layout）に無い・並びが無い曲：時刻で、そのコールより前に始まった最後の行の後ろへ（無ければ最初の行の前）
  const rest = [...timed.values()].filter((call) => !placed.has(call.key)).sort((a, b) => a.start - b.start);
  for (const call of rest) {
    let anchor = -1;
    lineList.forEach((line, index) => {
      if (Number.isFinite(line?.start) && line.start <= call.start) anchor = index;
    });
    const place = anchor === -1 ? "before" : "after";
    const target = rows.find((row) => row.anchor === Math.max(anchor, 0) && row.place === place && !row.block);
    placed.add(call.key);
    if (target) target.keys.push(call.key);
    else rows.push({ anchor: Math.max(anchor, 0), place, block: false, keys: [call.key] });
  }
  // 上から順（行の位置 → 前／後ろ）に並べ直す。同じ場所の中の順番は、並び（layout）の順のまま
  const order = (row) => row.anchor * 2 + (row.place === "after" ? 1 : 0);
  return rows.map((row, index) => ({ row, index })).sort((a, b) => order(a.row) - order(b.row) || a.index - b.index).map(({ row }) => row);
}

// いま光っているコールのキー（開始 ≦ t ＜ 終了。本人の時刻だけ）と、次に始まるコールのキー（純粋関数）
export function karaokeCallRowStateAt(calls, t) {
  const lit = new Set();
  let next = null;
  for (const call of calls ?? []) {
    if (call.start <= t && t < call.end) lit.add(call.key);
    else if (call.start > t && (!next || call.start < next.start)) next = call;
  }
  return { lit, nextKey: next?.key ?? null };
}

// コール表示の ON／OFF（この端末に保存。前のカラオケ同期では使わない）
export const KX_CALLS_VISIBLE_KEY = "equalLoveIntroQuiz.karaokeCallsVisible";
export function loadKaraokeCallsVisible() {
  try {
    return localStorage.getItem(KX_CALLS_VISIBLE_KEY) !== "false";
  } catch {
    return true;
  }
}
export function saveKaraokeCallsVisible(visible) {
  try {
    localStorage.setItem(KX_CALLS_VISIBLE_KEY, String(Boolean(visible)));
  } catch {
    // 保存できない環境では、今回だけの設定として使う
  }
}

// タイミング調整が「ありえない大きさ」か（±10秒を超える）。値は消さずに、注意を出すだけ
export const KX_OFFSET_WARN_MS = 10000;
export function isKaraokeOffsetSuspicious(offsetMs) {
  return Number.isFinite(offsetMs) && Math.abs(offsetMs) > KX_OFFSET_WARN_MS;
}

// ===== 画面の部品 =====
let stage = null; // 使っている間だけ { screen, hudCard, ... }

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function toggle(node, className, on) {
  if (node.classList.contains(className) !== on) node.classList.toggle(className, on);
}

// 新しいカラオケの演出を始める（部品を作る）。elements：{ screen, hudCard, lyricsPanel, hudText }。
// song：js/data/songs.js の曲、calls：本人の完成版のコール（start 昇順）、lines：歌詞の行（{ line, start, end }。無ければ []）
// layout：コール表の並び（コール表示 ON で赤いコールを歌詞の間に置くのに使う。無ければ時刻で置く）
// callsVisible：コール表示 ON か（コールが無い曲は、いつも OFF と同じ動き）
export function enableKaraokeStage(elements, { song, calls, lines = [], layout = null, callsVisible = true } = {}) {
  disableKaraokeStage();
  const { screen, hudCard, lyricsPanel, hudText } = elements ?? {};
  if (!screen || !hudCard) return null;
  const palette = karaokePaletteForSong(song);
  screen.classList.add("kx-on");
  screen.dataset.kxBasis = palette.basis;
  screen.style.setProperty("--kx-c1", palette.colors[0]);
  screen.style.setProperty("--kx-c2", palette.colors[1]);

  // 背景（歌詞の後ろ）：色の光2つ・コールのときに明るくなる光・ゆっくり上る粒・曲の終わりの紙吹雪
  const fx = el("div", "kx-fx");
  fx.setAttribute("aria-hidden", "true");
  fx.append(el("span", "kx-glow kx-glow-a"), el("span", "kx-glow kx-glow-b"), el("span", "kx-spot"));
  const particles = fx.appendChild(el("span", "kx-particles"));
  for (let i = 0; i < KX_PARTICLE_COUNT; i++) {
    const dot = particles.appendChild(el("i"));
    // 位置・大きさ・速さは番号から決める（毎回同じ。乱数を使わない）
    dot.style.setProperty("--x", `${(i * 37 + 11) % 100}%`);
    dot.style.setProperty("--d", `${11 + ((i * 7) % 8)}s`);
    dot.style.setProperty("--delay", `${-((i * 1.9) % 12).toFixed(1)}s`);
    dot.style.setProperty("--s", `${3 + (i % 3)}px`);
  }
  const finale = fx.appendChild(el("span", "kx-finale-layer"));
  for (let i = 0; i < KX_FINALE_PIECE_COUNT; i++) {
    const piece = finale.appendChild(el("i"));
    piece.style.setProperty("--x", `${(i * 53 + 7) % 100}%`);
    piece.style.setProperty("--r", `${(i * 47) % 360}deg`);
    piece.style.setProperty("--delay", `${((i * 0.13) % 0.9).toFixed(2)}s`);
    piece.style.setProperty("--c", i % 2 ? "var(--kx-c1)" : "var(--kx-c2)");
  }
  screen.insertBefore(fx, screen.firstChild);

  // コールのカード：始まりの光の輪・火花、長いコールの進み具合、次のコールまでのバー
  // 【2026-10-30 fix-live】光の輪・火花は、カードの縁から外側へだけ広がる（文字の後ろ・外側だけ）。
  //   以前はカードの中央から輪が広がり、中央に小さな赤い円が残って、短いコール（フッフー！など）の文字の上を横切っていた
  const hudFx = el("span", "kx-hud-fx");
  hudFx.setAttribute("aria-hidden", "true");
  hudFx.append(el("span", "kx-ring"), el("span", "kx-ring kx-ring-2"));
  const sparks = hudFx.appendChild(el("span", "kx-sparks"));
  KX_SPARK_POINTS.forEach(([x, y, dx, dy]) => {
    const spark = sparks.appendChild(el("i"));
    spark.style.setProperty("--x", `${x}%`);
    spark.style.setProperty("--y", `${y}%`);
    spark.style.setProperty("--dx", `${dx}px`);
    spark.style.setProperty("--dy", `${dy}px`);
  });
  const progress = el("span", "kx-progress");
  progress.setAttribute("aria-hidden", "true");
  const progressFill = progress.appendChild(el("span", "kx-progress-fill"));
  const countdown = el("span", "kx-countdown");
  countdown.setAttribute("aria-hidden", "true");
  const countdownFill = countdown.appendChild(el("span", "kx-countdown-fill"));
  hudCard.insertBefore(hudFx, hudCard.firstChild);
  hudCard.append(progress, countdown);
  hudCard.classList.add("kx-hud");
  // 【2026-11-01 r7-live】大きな演出（画面の中央の大きな文字・ペンライト・画面全体の光。js/callSpectacle.js。ライブコールと共通）
  // 後ろの層（ペンライト）は背景（.kx-fx）のすぐ後ろ＝歌詞・カードの後ろ。前の層（大きな文字）は画面の最後＝歌詞・カードの上、上下の操作の帯の下
  // 【2026-11-01 r7-live-fix】カラオケは、大きな文字を別に出さない（下のカードと同じ文字が2回出て、今の歌詞の行にかぶっていたため）。
  //   光の輪・画面の光・名前の色のオーロラを、カード（コールの大きな文字）の位置に合わせて出す。カードの文字そのものが主役
  const spectacle = createSpectacle(screen, {
    variant: "karaoke",
    palette: palette.colors,
    backHost: screen,
    backBefore: fx.nextSibling,
    place: (item, { layerTop }) => {
      const r = hudCard.getBoundingClientRect();
      return r.height ? { y: (r.top + r.bottom) / 2 - layerTop, w: r.width, h: r.height } : null;
    },
  });
  spectacle?.setPlan(planSpectacle(Array.isArray(calls) ? calls : []));

  const callList = Array.isArray(calls) ? calls : [];
  stage = {
    screen,
    hudCard,
    hudText: hudText ?? null,
    lyricsPanel: lyricsPanel ?? null,
    calls: callList,
    lines: Array.isArray(lines) ? lines : [],
    layout,
    hasCalls: callList.length > 0,
    callsVisible: true,
    callRows: [], // 歌詞の間に置いた赤いコールの行（コール表示 ON のとき見える）
    callEls: new Map(), // コールのキー → 部品
    rowFlags: new Map(), // コールのキー → 前に書いた状態（"lit" | "next" | "done" | ""）
    parts: [fx, hudFx, progress, countdown],
    spectacle,
    tapUnbind: [],
    progressFill,
    countdownFill,
    lastActive: -2,
    lastProgress: null,
    lastCountdown: null,
    lastNextLine: null,
    lastMemberColor: null,
    palette,
  };
  setKaraokeCallsVisible(callsVisible);
  return stage;
}

// コール表示 ON／OFF（コールが無い曲は、いつも OFF と同じ）。再生の位置には触れない（見た目のクラスだけ）
export function setKaraokeCallsVisible(visible) {
  if (!stage) return false;
  const on = Boolean(visible) && stage.hasCalls;
  stage.callsVisible = on;
  toggle(stage.screen, "kx-calls-off", !on);
  toggle(stage.screen, "kx-no-calls", !stage.hasCalls);
  if (!on) {
    // OFF にした瞬間に、コールの光・弾み・次のコールのバーを外す（残っていると「今言う」ように見えるため）
    stage.screen.classList.remove("kx-call-now", "kx-long", "kx-soon");
    stage.hudCard.classList.remove("kx-burst", "kx-member", "kx-names-single", "kx-names-multi", "kx-names-or");
    stage.hudCard.style.removeProperty("--kx-call");
    stage.hudCard.style.removeProperty("--kx-call-aurora");
    stage.lastActive = -2;
    stage.lastMemberColor = null;
    stage.spectacle?.update(0, { enabled: false });
  }
  return on;
}
export function areKaraokeCallsVisible() {
  return Boolean(stage?.callsVisible);
}
export function karaokeStageHasCalls() {
  return Boolean(stage?.hasCalls);
}

// 歌詞の行（js/lyricsSync.js が描いた .synced-lyrics-line）の間に、赤いコールの行を置く（歌詞を描いたあとに1回だけ呼ぶ）。
// onCallTap(call)：コールを押したとき（その少し前から再生するなど）。戻り値：置いたコールの数（＝時刻のあるコールの数）
export function mountKaraokeCallRows({ onCallTap } = {}) {
  if (!stage || !stage.lyricsPanel) return 0;
  stage.callRows.forEach((row) => row.remove());
  stage.callRows = [];
  stage.tapUnbind.forEach((off) => off());
  stage.tapUnbind = [];
  stage.callEls.clear();
  stage.rowFlags.clear();
  if (!stage.hasCalls) return 0;
  const panel = stage.lyricsPanel;
  const lineNodes = [...panel.getElementsByClassName("synced-lyrics-line")];
  if (!lineNodes.length || lineNodes.length !== stage.lines.length) return 0;
  const byKey = new Map(stage.calls.map((call) => [call.key, call]));
  const placement = buildKaraokeCallPlacement(stage.layout, stage.calls, stage.lines);
  for (const row of placement) {
    const node = el("p", `kx-call-row${row.block ? " is-block" : ""}`);
    row.keys.forEach((key, index) => {
      const call = byKey.get(key);
      if (index > 0) node.appendChild(document.createTextNode(" "));
      const span = el("span", `kx-call kx-t-${karaokeCallTier(call)}`);
      span.dataset.callKey = key;
      if (String(call.text).includes("\n")) span.classList.add("is-pre");
      const result = describeNameCall(call.text);
      renderNameCallText(span, call.text, result);
      const accent = nameCallAccent(result);
      if (accent) {
        span.classList.add("kx-member", `kx-names-${result.kind}`);
        span.style.setProperty("--kx-call", accent.primary);
        span.style.setProperty("--kx-call-grad", accent.gradient);
        span.style.setProperty("--kx-call-aurora", nameCallAurora(accent));
      }
      // 【2026-11-01 r7-live】タップの決まりはライブコールと共通（js/callTapSeek.js：スクロールの指の動きはタップにしない）
      if (typeof onCallTap === "function") stage.tapUnbind.push(bindTapSeek(span, () => onCallTap(call), { scroller: stage.lyricsPanel }));
      node.appendChild(span);
      stage.callEls.set(key, span);
    });
    const target = row.anchor >= 0 ? lineNodes[row.anchor] : lineNodes[0];
    if (row.place === "before" || row.anchor < 0) target.before(node);
    else {
      // 同じ行の後ろに、すでに置いたコールの行があれば、その後ろへ（並びの順を保つ）
      let after = target;
      while (after.nextElementSibling?.classList.contains("kx-call-row")) after = after.nextElementSibling;
      after.after(node);
    }
    stage.callRows.push(node);
  }
  return stage.callEls.size;
}

// コールの見た目の段階（短いコールの3段階・長いコール）。光る時間は本人の開始〜終了のまま
export function karaokeCallTier(call) {
  const d = Number(call?.end) - Number(call?.start);
  if (Number.isFinite(d) && d >= KX_LONG_CALL_SEC) return "long";
  return shortCallTier(d);
}

// カードの文字（js/karaokeSyncScreen.js が textContent で書く）に、名前コールの色を付ける。文字は変えない。
// 書き直されたとき（子の部品が無い＝ただの文字）だけ付け直す
function decorateHudText() {
  const node = stage?.hudText;
  if (!node || node.childElementCount > 0) return;
  const text = node.textContent;
  if (!text) return;
  const result = describeNameCall(text);
  if (nameCallAccent(result)) renderNameCallText(node, text, result);
}

// 使っていないときは何もしない（前の「カラオケ同期」で開いたとき・画面を閉じたとき）
export function disableKaraokeStage() {
  if (!stage) return;
  const { screen, hudCard } = stage;
  stage.parts.forEach((node) => node.remove());
  stage.spectacle?.destroy();
  stage.tapUnbind.forEach((off) => off());
  stage.callRows.forEach((row) => row.remove());
  stage.lastNextLine?.classList.remove("kx-next-line");
  screen.classList.remove("kx-on", "kx-call-now", "kx-long", "kx-soon", "kx-paused", "kx-finale", "kx-done", "kx-offset-set", "kx-calls-off", "kx-no-calls", "kx-offset-warn", "kx-has-audio");
  delete screen.dataset.kxBasis;
  screen.style.removeProperty("--kx-c1");
  screen.style.removeProperty("--kx-c2");
  hudCard.classList.remove("kx-hud", "kx-burst", "kx-member", "kx-names-single", "kx-names-multi", "kx-names-or");
  hudCard.style.removeProperty("--kx-call");
  hudCard.style.removeProperty("--kx-call-aurora");
  stage = null;
}

export function isKaraokeStageEnabled() {
  return stage !== null;
}

// 曲を最初からやり直すとき：演出の状態だけ元に戻す（部品はそのまま）
export function resetKaraokeStage() {
  if (!stage) return;
  stage.screen.classList.remove("kx-call-now", "kx-long", "kx-soon", "kx-paused", "kx-finale", "kx-done");
  stage.rowFlags.forEach((flag, key) => stage.callEls.get(key)?.classList.remove("is-lit", "is-next", "is-done"));
  stage.rowFlags.clear();
  stage.hudCard.classList.remove("kx-burst", "kx-member", "kx-names-single", "kx-names-multi", "kx-names-or");
  stage.hudCard.style.removeProperty("--kx-call");
  stage.hudCard.style.removeProperty("--kx-call-aurora");
  stage.lastNextLine?.classList.remove("kx-next-line");
  Object.assign(stage, { lastActive: -2, lastProgress: null, lastCountdown: null, lastNextLine: null, lastMemberColor: null });
}

export function setKaraokeStagePaused(paused) {
  if (stage) toggle(stage.screen, "kx-paused", Boolean(paused));
}

// タイミング調整をしているか（0 以外）。「0に戻す」を、調整していないときは普通の見た目にするための印（css/karaokeStage.css）
export function setKaraokeStageOffset(offsetMs) {
  if (!stage) return;
  toggle(stage.screen, "kx-offset-set", Number(offsetMs) !== 0);
  toggle(stage.screen, "kx-offset-warn", isKaraokeOffsetSuspicious(Number(offsetMs)));
}

// 曲の終わり（端末の音源が最後まで鳴った）：紙吹雪と光を1回だけ
export function showKaraokeStageFinale() {
  if (stage) stage.screen.classList.add("kx-finale");
}

const reducedMotionQuery = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };

// 1回分を描く。t：いまの位置（秒）。ended：端末の音源が最後まで鳴り終わっているか。playing：音が進んでいるか（大きな演出は進んでいる間だけ）
export function updateKaraokeStage(t, { ended = false, playing = true } = {}) {
  if (!stage) return null;
  const s = karaokeStageStateAt(stage.calls, t, stage.lines);
  const { screen, hudCard } = stage;
  const callsOn = stage.callsVisible;
  toggle(screen, "kx-call-now", callsOn && Boolean(s.active));
  toggle(screen, "kx-long", callsOn && s.long);
  toggle(screen, "kx-soon", callsOn && s.countdown > 0);
  toggle(screen, "kx-done", s.allCallsDone);
  if (!ended) toggle(screen, "kx-finale", false);
  updateCallRows(t);
  // 大きな演出：コール表示 ON・この画面が見えている・音が進んでいる間だけ（OFF・一時停止・曲の終わりでは残さない）
  stage.spectacle?.update(t, {
    playing: playing && !ended && !screen.classList.contains("kx-paused"),
    enabled: callsOn && screen.classList.contains("is-active"),
    reduced: Boolean(reducedMotionQuery.matches),
  });

  if (callsOn && s.activeIndex !== stage.lastActive) {
    // コールが変わった：名前コールならメンバーカラー（確かに一致したときだけ）。始まった直後なら発光と弾みを1回
    // 【2026-10-31 live-unify】名前コールの判定は js/liveCallNames.js（1人・複数・or）。光は最初の名前の色
    const accent = s.active ? nameCallAccent(describeNameCall(s.active.text)) : null;
    const color = accent?.primary ?? null;
    const memberKey = accent ? `${accent.kind}|${accent.colors.join(",")}` : null;
    if (memberKey !== stage.lastMemberColor) {
      toggle(hudCard, "kx-member", Boolean(color));
      // 【2026-11-01 r7-live】1人・複数・or で光り方を変える（複数・or は全員の色のオーロラ）
      ["single", "multi", "or"].forEach((kind) => toggle(hudCard, `kx-names-${kind}`, accent?.kind === kind));
      if (color) {
        hudCard.style.setProperty("--kx-call", color);
        hudCard.style.setProperty("--kx-call-aurora", nameCallAurora(accent));
      } else {
        hudCard.style.removeProperty("--kx-call");
        hudCard.style.removeProperty("--kx-call-aurora");
      }
      stage.lastMemberColor = memberKey;
    }
    hudCard.classList.remove("kx-burst");
    if (s.active && s.justStarted) {
      void hudCard.offsetWidth; // 付け直しで、CSS のアニメーションを最初から（続けて来るコールでも毎回）
      hudCard.classList.add("kx-burst");
    }
    stage.lastActive = s.activeIndex;
  }
  if (callsOn) decorateHudText();
  // 進み具合のバー（長いコールの間だけ）と、次のコールまでのバー：値が変わったときだけ書く
  const progress = callsOn && s.long ? s.progress : 0;
  if (progress !== stage.lastProgress) {
    stage.progressFill.style.transform = `scaleX(${progress})`;
    stage.lastProgress = progress;
  }
  const countdown = callsOn ? s.countdown : 0;
  if (countdown !== stage.lastCountdown) {
    stage.countdownFill.style.transform = `scaleX(${countdown})`;
    stage.lastCountdown = countdown;
  }
  // 次の歌詞の行を控えめに見せる（行単位の時刻で「次に始まる行」。行の中は補間しない）
  const lineNodes = stage.lyricsPanel ? stage.lyricsPanel.getElementsByClassName("synced-lyrics-line") : [];
  const nextLine = lineNodes.length === stage.lines.length && s.nextLineIndex >= 0 ? lineNodes[s.nextLineIndex] : null;
  if (nextLine !== stage.lastNextLine) {
    stage.lastNextLine?.classList.remove("kx-next-line");
    nextLine?.classList.add("kx-next-line");
    stage.lastNextLine = nextLine ?? null;
  }
  return s;
}

// 歌詞の間の赤いコール：光っている（本人の開始〜終了）・次・終わった、を付け替える（変わったコールだけ書く）
function updateCallRows(t) {
  if (!stage.callEls.size) return;
  const { lit, nextKey } = karaokeCallRowStateAt(stage.calls, t);
  for (const call of stage.calls) {
    const flag = lit.has(call.key) ? "lit" : call.key === nextKey ? "next" : t >= call.end ? "done" : "";
    if (stage.rowFlags.get(call.key) === flag) continue;
    const node = stage.callEls.get(call.key);
    if (!node) continue;
    node.classList.toggle("is-lit", flag === "lit");
    node.classList.toggle("is-next", flag === "next");
    node.classList.toggle("is-done", flag === "done");
    stage.rowFlags.set(call.key, flag);
  }
}
