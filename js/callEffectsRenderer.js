// ライブコールの演出（デザイン C）を、コール表の赤文字の部品に反映するファイル（2026-10-30新設・リニューアル第4段階）。
// 元：tools/call-effects-demo-2026-10-30/demo.js の buildCall・applyCall（デザイン C だけ）。
// 見た目は js/callEffects.js の stateAt（いまの再生位置だけから計算）の結果を、transform・opacity に入れるだけ。
// CSS の無限アニメーション・タイマーは使わない（シーク・一時停止・再開しても、その時刻の正しい見た目になる）。
// 値が前と同じなら書き込まない（毎フレームの書き換えを減らす）。
import { TICK_ANGLES } from "./callEffects.js";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// コール表の赤文字の部品（js/callTextView.js が作った span）に、演出用の部品を足す。
// 文章はそのまま（区切って並べ直すだけで、つなげると元の文章に戻る）。
// memberColorOf：メンバーID → 色（名前コールの明示データがあるときだけ使う）
export function decorateCallSpan(span, prep, { memberColorOf = () => "#ffb3d1" } = {}) {
  const root = span;
  root.classList.add("cx-call", `cx-t-${prep.type}`);
  if (prep.isLong) root.classList.add("is-long");
  root.dataset.effectType = prep.type;
  root.textContent = "";
  const parts = {};
  parts.plate = root.appendChild(el("span", "cx-plate"));
  parts.plate.setAttribute("aria-hidden", "true");
  if (prep.type === "mix") parts.badge = root.appendChild(el("span", "cx-badge", prep.exact ? "MIX" : "MIX・進み方は目安"));
  const text = root.appendChild(el("span", "cx-text"));
  parts.text = text;
  if (prep.memberIds.length) {
    const colors = prep.memberIds.map(memberColorOf);
    const bg = colors.length === 1 ? colors[0] : `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(", ")})`;
    root.style.setProperty("--member-bg", bg);
    root.style.setProperty("--member", colors[0]);
  }
  if (prep.type === "mix") {
    // 掛け声の後ろの空白・改行は、掛け声の外に置く（掛け声だけを拡大しても行の折り返しが変わらないように）
    parts.segs = prep.segments.map((s) => {
      const body = s.text.replace(/\s+$/, "");
      const seg = text.appendChild(el("span", "cx-seg is-next", body));
      const tail = s.text.slice(body.length);
      if (tail) text.appendChild(document.createTextNode(tail));
      return seg;
    });
  } else if (prep.type === "cute") {
    const prefix = text.appendChild(el("span", "cx-prefix"));
    parts.prefixFill = prefix.appendChild(el("span", "cx-prefix-fill"));
    prefix.appendChild(document.createTextNode(prep.prefix));
    parts.prefix = prefix;
    const name = text.appendChild(el("span", "cx-name"));
    parts.namePlate = name.appendChild(el("span", "cx-name-plate"));
    parts.ring = name.appendChild(el("span", "cx-ring"));
    name.appendChild(el("span", "cx-name-text", prep.name));
    parts.name = name;
    const hearts = root.appendChild(el("span", "cx-hearts"));
    hearts.setAttribute("aria-hidden", "true");
    parts.hearts = Array.from({ length: 3 }, () => hearts.appendChild(el("i", "", "♥")));
  } else if (prep.type === "name") {
    const name = text.appendChild(el("span", "cx-name"));
    parts.namePlate = name.appendChild(el("span", "cx-name-plate"));
    parts.ring = name.appendChild(el("span", "cx-ring"));
    name.appendChild(el("span", "cx-name-text", prep.text));
    parts.name = name;
  } else {
    text.textContent = prep.text;
  }
  if (!parts.ring) parts.ring = root.insertBefore(el("span", "cx-ring"), text);
  parts.ring.setAttribute("aria-hidden", "true");
  if (prep.popLevel !== undefined) {
    if (prep.type === "shout") parts.sweep = root.appendChild(el("span", "cx-sweep"));
    const ticks = root.appendChild(el("span", "cx-ticks"));
    ticks.setAttribute("aria-hidden", "true");
    parts.ticks = TICK_ANGLES.map(() => ticks.appendChild(el("i")));
  }
  if (prep.isLong) {
    parts.build = root.insertBefore(el("span", "cx-build"), parts.text);
    parts.build.setAttribute("aria-hidden", "true");
  }
  // 新しいライブコールの見た目（prep.vis。js/callEffects.js の prepareVisual）：外側の光・次の知らせの枠を足す
  if (prep.vis) {
    root.classList.add(`cx-v-${prep.vis.kind}`);
    parts.glow = root.insertBefore(el("span", "cx-glow"), parts.plate);
    parts.glow.setAttribute("aria-hidden", "true");
    parts.cue = root.insertBefore(el("span", "cx-cue"), parts.plate);
    parts.cue.setAttribute("aria-hidden", "true");
  }
  if (prep.type === "mix" || prep.isLong || prep.vis?.kind === "long") {
    const bar = root.appendChild(el("span", "cx-bar"));
    bar.setAttribute("aria-hidden", "true");
    parts.bar = bar;
    parts.barFill = bar.appendChild(el("span", "cx-bar-fill"));
    parts.wave = bar.appendChild(el("span", "cx-wave"));
  }
  return { prep, el: root, parts, last: { phase: "idle", group: null }, cache: new Map() };
}

function setStyle(c, node, prop, value) {
  if (!node) return;
  let memo = c.cache.get(node);
  if (!memo) c.cache.set(node, (memo = {}));
  if (memo[prop] === value) return;
  memo[prop] = value;
  node.style[prop] = value;
}
const r3 = (v) => Math.round(v * 1000) / 1000;
const scale = (v) => (v === 1 ? "none" : `scale(${r3(v)})`);

// stateAt の結果（s）を部品に反映する。t：いまの再生位置（終わったコールを少し薄くするのに使う）
export function applyCallState(c, s, t) {
  const { parts, el: root, last } = c;
  if (s.phase !== last.phase) {
    root.classList.toggle("is-pre", s.phase === "pre");
    root.classList.toggle("is-active", s.phase === "active");
    root.classList.toggle("is-post", s.phase === "post");
    root.classList.toggle("is-on", s.phase === "active" || s.phase === "post");
    if (s.phase !== "idle") root.classList.remove("is-done");
    last.phase = s.phase;
  }
  if (s.phase === "idle") {
    const done = t >= c.prep.end;
    if (!last.reset || last.done !== done) {
      root.classList.toggle("is-done", done);
      last.done = done;
      [parts.plate, parts.ring, parts.bar, parts.wave, parts.namePlate, parts.build, parts.sweep, ...(parts.ticks ?? [])].forEach((n) => setStyle(c, n, "opacity", "0"));
      [parts.plate, parts.text, parts.ring, parts.name, parts.prefix].forEach((n) => setStyle(c, n, "transform", "none"));
      setStyle(c, parts.prefixFill, "transform", "scaleX(0)");
      setStyle(c, parts.barFill, "transform", "scaleX(0)");
      setStyle(c, parts.sweep, "transform", "scaleX(0)");
      setStyle(c, parts.name, "opacity", "");
      (parts.hearts ?? []).forEach((h) => setStyle(c, h, "opacity", "0"));
      if (parts.segs) {
        parts.segs.forEach((seg) => {
          seg.className = `cx-seg ${done ? "is-past" : "is-next"}`;
          setStyle(c, seg, "transform", "none");
        });
        last.group = null;
      }
      last.reset = true;
    }
    return;
  }
  last.reset = false;
  setStyle(c, parts.plate, "opacity", String(r3(s.plateO)));
  setStyle(c, parts.plate, "transform", scale(s.plateS));
  setStyle(c, parts.build, "opacity", String(r3(s.build * s.plateO)));
  setStyle(c, parts.build, "transform", scale(s.plateS));
  setStyle(c, parts.text, "transform", s.textY || s.textS !== 1 ? `translateY(${r3(s.textY)}px) scale(${r3(s.textS)})` : "none");
  setStyle(c, parts.ring, "opacity", String(r3(s.ringO)));
  setStyle(c, parts.ring, "transform", scale(s.ringS));
  if (parts.bar) {
    setStyle(c, parts.bar, "opacity", String(r3(s.barO)));
    setStyle(c, parts.barFill, "transform", s.barS === 1 ? `scaleX(${r3(s.barP)})` : `scaleX(${r3(s.barP)}) scaleY(${r3(s.barS)})`);
    setStyle(c, parts.wave, "transform", `translateX(${r3(s.barP * 100)}%)`);
    setStyle(c, parts.wave, "opacity", String(r3(s.waveO)));
  }
  if (parts.segs) {
    const groups = c.prep.segments.map((seg) => seg.group);
    if (s.group !== last.group) {
      parts.segs.forEach((seg, i) => {
        const g = groups[i];
        seg.className = `cx-seg ${s.group < 0 ? "is-next" : g < s.group ? "is-past" : g === s.group ? "is-now" : "is-next"}`;
        if (g !== s.group) setStyle(c, seg, "transform", "none");
      });
      last.group = s.group;
    }
    parts.segs.forEach((seg, i) => {
      if (groups[i] === s.group) setStyle(c, seg, "transform", scale(s.groupPop));
    });
  }
  if (parts.prefix) {
    setStyle(c, parts.prefixFill, "transform", `scaleX(${r3(s.prefixFill)})`);
    setStyle(c, parts.prefix, "transform", scale(s.prefixS));
  }
  if (parts.name) {
    setStyle(c, parts.name, "opacity", String(r3(s.nameO)));
    setStyle(c, parts.name, "transform", scale(s.nameS));
    setStyle(c, parts.namePlate, "opacity", String(r3(s.namePlateO)));
  }
  if (parts.sweep) {
    setStyle(c, parts.sweep, "opacity", s.sweep > 0 ? String(r3(Math.min(1, s.plateO + 0.2))) : "0");
    setStyle(c, parts.sweep, "transform", `scaleX(${r3(s.sweep)})`);
  }
  if (parts.ticks) {
    parts.ticks.forEach((tk, i) => {
      const ts = s.ticks[i];
      setStyle(c, tk, "opacity", ts ? String(r3(ts.o)) : "0");
      setStyle(c, tk, "transform", ts && ts.o > 0 ? `rotate(${TICK_ANGLES[i]}deg) translateX(${r3(ts.r)}px)` : `rotate(${TICK_ANGLES[i]}deg)`);
    });
  }
  if (parts.hearts) {
    parts.hearts.forEach((h, i) => {
      const hs = s.hearts[i];
      setStyle(c, h, "opacity", hs ? String(r3(hs.o)) : "0");
      setStyle(c, h, "transform", hs && hs.o > 0 ? `translateY(${r3(hs.y)}px) scale(${r3(hs.s)})` : "none");
    });
  }
}

// 新しいライブコールの見た目（js/callEffects.js の visualStateAt の結果 v）を部品に反映する（2026-10-30 第2版）。
// 動かすのは transform・opacity だけ（文字の位置・行の折り返しが変わらない＝レイアウトがずれない）。
// 値が前と同じなら書き込まない。t：いまの再生位置（終わったコールを少し薄くするのに使う）
export function applyVisualState(c, v, t) {
  const { parts, el: root, last } = c;
  if (v.phase !== last.phase) {
    root.classList.toggle("is-cue", v.phase === "pre"); // 「is-pre」は使わない（コール表の「改行をそのまま見せる」の印と同じ名前のため）
    root.classList.toggle("is-active", v.phase === "active");
    root.classList.toggle("is-post", v.phase === "post");
    root.classList.toggle("is-on", v.phase === "active" || v.phase === "post");
    last.phase = v.phase;
  }
  const done = v.phase === "idle" && t >= c.prep.end;
  if (last.done !== done) {
    root.classList.toggle("is-done", done);
    last.done = done;
  }
  setStyle(c, root, "transform", v.liftY || v.scale !== 1 ? `translateY(${r3(v.liftY)}px) scale(${r3(v.scale)})` : "");
  setStyle(c, parts.plate, "opacity", String(r3(v.plateO)));
  setStyle(c, parts.glow, "opacity", String(r3(v.glowO)));
  setStyle(c, parts.cue, "opacity", String(r3(v.cueO)));
  if (parts.bar) {
    setStyle(c, parts.bar, "opacity", String(r3(v.barO)));
    setStyle(c, parts.barFill, "transform", `scaleX(${r3(v.barP)})`);
  }
}
