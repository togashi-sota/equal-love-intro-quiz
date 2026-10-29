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
import { MEMBER_PROFILES } from "./data/memberProfiles.js";
import { buildMemberNameIndex, memberIdForCallText } from "./callEffects.js";

export const KX_BURST_WINDOW_SEC = 0.4; // コールの始まりからこの時間の内に描いたときだけ「発光と弾み」を出す（途中へシークしたときは出さない）
export const KX_COUNTDOWN_SEC = 3; // 次のコールまでの残りを、バーで見せる長さ（「もうすぐ！」の 3・2・1 と同じ）
export const KX_LONG_CALL_SEC = 4; // これ以上のコールは、カードの下に進み具合のバーを出す（ライブコールの「長い」と同じ）
export const KX_PARTICLE_COUNT = 10;
export const KX_SPARK_COUNT = 8;
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

// ===== 画面の部品 =====
let stage = null; // 使っている間だけ { screen, hudCard, ... }
let memberNameIndex = null;

function el(tag, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

function memberColorForText(text) {
  memberNameIndex ??= buildMemberNameIndex(MEMBERS, MEMBER_PROFILES);
  const id = memberIdForCallText(text, memberNameIndex);
  return id ? MEMBERS.find((m) => m.id === id)?.memberColor?.hex ?? null : null;
}

function toggle(node, className, on) {
  if (node.classList.contains(className) !== on) node.classList.toggle(className, on);
}

// 新しいカラオケの演出を始める（部品を作る）。elements：{ screen, hudCard, lyricsPanel }。
// song：js/data/songs.js の曲、calls：本人の完成版のコール（start 昇順）、lines：歌詞の行（無ければ []）
export function enableKaraokeStage(elements, { song, calls, lines = [] } = {}) {
  disableKaraokeStage();
  const { screen, hudCard, lyricsPanel } = elements ?? {};
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
  const hudFx = el("span", "kx-hud-fx");
  hudFx.setAttribute("aria-hidden", "true");
  hudFx.append(el("span", "kx-ring"), el("span", "kx-ring kx-ring-2"));
  const sparks = hudFx.appendChild(el("span", "kx-sparks"));
  for (let i = 0; i < KX_SPARK_COUNT; i++) sparks.appendChild(el("i")).style.setProperty("--a", `${(360 / KX_SPARK_COUNT) * i}deg`);
  const progress = el("span", "kx-progress");
  progress.setAttribute("aria-hidden", "true");
  const progressFill = progress.appendChild(el("span", "kx-progress-fill"));
  const countdown = el("span", "kx-countdown");
  countdown.setAttribute("aria-hidden", "true");
  const countdownFill = countdown.appendChild(el("span", "kx-countdown-fill"));
  hudCard.insertBefore(hudFx, hudCard.firstChild);
  hudCard.append(progress, countdown);
  hudCard.classList.add("kx-hud");

  stage = {
    screen,
    hudCard,
    lyricsPanel: lyricsPanel ?? null,
    calls: Array.isArray(calls) ? calls : [],
    lines: Array.isArray(lines) ? lines : [],
    parts: [fx, hudFx, progress, countdown],
    progressFill,
    countdownFill,
    lastActive: -2,
    lastProgress: null,
    lastCountdown: null,
    lastNextLine: null,
    lastMemberColor: null,
    palette,
  };
  return stage;
}

// 使っていないときは何もしない（前の「カラオケ同期」で開いたとき・画面を閉じたとき）
export function disableKaraokeStage() {
  if (!stage) return;
  const { screen, hudCard } = stage;
  stage.parts.forEach((node) => node.remove());
  stage.lastNextLine?.classList.remove("kx-next-line");
  screen.classList.remove("kx-on", "kx-call-now", "kx-long", "kx-soon", "kx-paused", "kx-finale", "kx-done");
  delete screen.dataset.kxBasis;
  screen.style.removeProperty("--kx-c1");
  screen.style.removeProperty("--kx-c2");
  hudCard.classList.remove("kx-hud", "kx-burst", "kx-member");
  hudCard.style.removeProperty("--kx-call");
  stage = null;
}

export function isKaraokeStageEnabled() {
  return stage !== null;
}

// 曲を最初からやり直すとき：演出の状態だけ元に戻す（部品はそのまま）
export function resetKaraokeStage() {
  if (!stage) return;
  stage.screen.classList.remove("kx-call-now", "kx-long", "kx-soon", "kx-paused", "kx-finale", "kx-done");
  stage.hudCard.classList.remove("kx-burst", "kx-member");
  stage.hudCard.style.removeProperty("--kx-call");
  stage.lastNextLine?.classList.remove("kx-next-line");
  Object.assign(stage, { lastActive: -2, lastProgress: null, lastCountdown: null, lastNextLine: null, lastMemberColor: null });
}

export function setKaraokeStagePaused(paused) {
  if (stage) toggle(stage.screen, "kx-paused", Boolean(paused));
}

// 曲の終わり（端末の音源が最後まで鳴った）：紙吹雪と光を1回だけ
export function showKaraokeStageFinale() {
  if (stage) stage.screen.classList.add("kx-finale");
}

// 1回分を描く。t：いまの位置（秒）。ended：端末の音源が最後まで鳴り終わっているか
export function updateKaraokeStage(t, { ended = false } = {}) {
  if (!stage) return null;
  const s = karaokeStageStateAt(stage.calls, t, stage.lines);
  const { screen, hudCard } = stage;
  toggle(screen, "kx-call-now", Boolean(s.active));
  toggle(screen, "kx-long", s.long);
  toggle(screen, "kx-soon", s.countdown > 0);
  toggle(screen, "kx-done", s.allCallsDone);
  if (!ended) toggle(screen, "kx-finale", false);

  if (s.activeIndex !== stage.lastActive) {
    // コールが変わった：名前コールならメンバーカラー（確かに一致したときだけ）。始まった直後なら発光と弾みを1回
    const color = s.active ? memberColorForText(s.active.text) : null;
    if (color !== stage.lastMemberColor) {
      toggle(hudCard, "kx-member", Boolean(color));
      if (color) hudCard.style.setProperty("--kx-call", color);
      else hudCard.style.removeProperty("--kx-call");
      stage.lastMemberColor = color;
    }
    hudCard.classList.remove("kx-burst");
    if (s.active && s.justStarted) {
      void hudCard.offsetWidth; // 付け直しで、CSS のアニメーションを最初から（続けて来るコールでも毎回）
      hudCard.classList.add("kx-burst");
    }
    stage.lastActive = s.activeIndex;
  }
  // 進み具合のバー（長いコールの間だけ）と、次のコールまでのバー：値が変わったときだけ書く
  const progress = s.long ? s.progress : 0;
  if (progress !== stage.lastProgress) {
    stage.progressFill.style.transform = `scaleX(${progress})`;
    stage.lastProgress = progress;
  }
  if (s.countdown !== stage.lastCountdown) {
    stage.countdownFill.style.transform = `scaleX(${s.countdown})`;
    stage.lastCountdown = s.countdown;
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
