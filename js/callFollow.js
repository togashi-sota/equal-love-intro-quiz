// コール優先スクロールの「計算だけ」の部品（DOM に触れない純粋な関数）。
// 【2026-10-30 アプリへ移した】元：tools/callfirst-scroll-demo-2026-10-30/core.js（計算は同じ。アプリは案D＝callFirst の combo だけを使う。
//   appSync・sheetLyric・simulate は、デモと同じ計測（renewal-notes の確認スクリプト）で比べられるように残している）
// デモのページ（demo.js）・テスト（verify/test_core.mjs）・実データの見積もり（analysis/realsim.mjs）から使う。
//
// 【4つの層を分ける（2026-10-30 本人の訂正を反映）】
//   層1 表示の並び・置き場所 … 本人のコール表（edits.json）。正本。この部品は読むだけ
//   層2 コールの開始・終了   … 本人のタイミング（timing-work.json）。正本。この部品は読むだけ
//   層3 AI の歌詞時刻         … 参考。信頼度（lyricConfidence）を付けて、信頼できる所だけ使う
//   層4 画面の追いかけ方      … この部品が毎回計算する（スクロール位置・光らせる物）。層1・2を書き換えない
// コールと歌詞行の時間の重なりは「多対多」（1つのコールの間に何行も歌う／1行の間に何個もコール）。
// 並び（層1）と時間（層2・3）は別々に持ち、時間の重なりは callLyricOverlaps() で計算するだけ（並びには反映しない）。
//
// 比べる方式
//   appSync     … 今のアプリの同期モード（js/lyricsSync.js ＋ js/callSync.js のまね）
//                 ・コールは「開始時刻以降で最初に始まる歌詞行の直前」に差し込む（callSync.js:361-368）＝並びが時刻で変わる
//                 ・スクロールは「今の歌詞行（AI の時刻）が変わったとき、その行を真ん中へ」（lyricsSync.js:188-241）
//                 ・光るコールは1つだけ（後から始まったもの。callSync.js:237-241 → lyricsSync.js:147-176）
//   sheetLyric  … コール表の順に並べ、AI の歌詞時刻で追いかける（タイミングエディターの追従 timingEditor.js:1340-1404 のまね）
//   callFirst   … 改善案。variant で中身を切り替える
//                 "panel"   案A：小さな固定パネル＋歌詞時刻のスクロール（スクロールは sheetLyric と同じ）
//                 "fit"     案B：今のコールと今歌っている行の両方が入るように動かす（パネルなし）
//                 "markers" 案C：区間ごとの目印（本人が置く）の所でだけ動かす
//                 "combo"   案D：B＋小さな固定パネル＋必要な所だけ目印（おすすめ）
//
// 位置（px）は「スクロールする箱の中身の上端から何 px か」。geom.items[id] = { top, bottom }。時刻はすべて秒。

export const PARAMS = {
  focusRatio: 0.38, // 「今読んでいる所」を画面の上から 38% に置く
  lead: 1.2, // コールが始まる何秒前に、そのコールの所へ着いているか
  marginPx: 10, // 「見えている」とみなす余白
  band: 0.08, // 目標がこれ（画面の高さの割合）以上ずれたら動かす（小さな揺れでは動かさない）
  tau: 0.22, // なめらかに動かすときの速さ（秒。小さいほど速い）
  maxSpeed: 900, // 改善案の最大の速さ（px/秒）。シーク以外で「急に飛ぶ」動きをしない
  lookahead: 2.5, // 次のコールがこの秒数以内なら、それも画面に入れる
  holdRamp: 1.5, // 「止める」目印のあと、次の道しるべへ動き始めるのは何秒前から
  lyricLead: 0.3, // 信頼できる歌詞行の何秒前にその行へ着くか
  callGapHold: 0.15, // 今のアプリと同じ（callSync.js:36）
  lyricGapHold: 1.0, // 今のアプリと同じ（lyricsSync.js:21）
  panelCalls: 2, // 固定パネルに出す「いま」のコールの数
  conf: { bracketTol: 1.0, inlineTol: 0.5, minSpacingRatio: 0.3, maxSpacingRatio: 3 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- 層1：コール表を、上から順に「コール」「歌詞」に並べる ----
// row.inlineStart：行の頭（文字位置 0）に置いたコール、row.inline：行の横（行末）に置いたコール
export function flattenSheet(song) {
  const out = [];
  for (const row of song.sheet) {
    if (row.kind === "block") {
      row.calls.forEach((id) => out.push({ kind: "call", id, row: row.id, where: row.position }));
      continue;
    }
    (row.before ?? []).forEach((id) => out.push({ kind: "call", id, row: row.id, where: "before" }));
    // 行の頭に置いたコール（inlineStart）も、その行と同じ表示行の中なので、並びの上では「その行の一部」として行の後に数える
    out.push({ kind: "lyric", id: row.id });
    (row.inlineStart ?? []).forEach((id) => out.push({ kind: "call", id, row: row.id, where: "inlineStart" }));
    (row.inline ?? []).forEach((id) => out.push({ kind: "call", id, row: row.id, where: "inline" }));
    (row.after ?? []).forEach((id) => out.push({ kind: "call", id, row: row.id, where: "after" }));
  }
  return out;
}

// 歌詞行の時刻として使う値：本人が確かめた時刻があればそれ、無ければ AI の時刻（層3）
export function lyricTime(lyric) {
  if (Number.isFinite(lyric.owner)) return lyric.owner;
  return lyric.ai && Number.isFinite(lyric.ai.start) ? lyric.ai.start : null;
}
function lyricEnd(lyric) {
  if (Number.isFinite(lyric.owner)) return Number.isFinite(lyric.ownerEnd) ? lyric.ownerEnd : lyric.owner + 3;
  return lyric.ai && Number.isFinite(lyric.ai.end) ? lyric.ai.end : null;
}

function median(values) {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

// ---- 層3の信頼度 ----
// confirmed：本人が時刻を確かめた行
// high：AI の時刻だが、次の5つを全部満たす
//   1. 前後の歌詞行と時刻の順番が合っている（逆転していない）
//   2. コール表で前にあるコールの「開始」より後・後ろにあるコールの「開始」より前（±1秒）
//      ※コールの「終わり」は使わない（コールの間にも歌詞は進むため。終わりと歌詞の関係は決めつけない）
//   3. その行の横（同時）に置いたコールの開始が、その行の時間の中（±0.5秒）
//   4. 次の行までが曲の中央値の 0.3 倍以上（詰め込みがない）、行の長さが中央値の 3 倍以下（間延びがない）
//   5. 歌詞の点検（tools/lyrics-audit）で「中・高」の疑いが付いていない
// low：それ以外（スクロールの道しるべにも、タップの移動先にも使わない）
export function lyricConfidence(song, params = PARAMS) {
  const flat = flattenSheet(song);
  const result = new Map();
  const lyricIds = flat.filter((f) => f.kind === "lyric").map((f) => f.id);
  const starts = lyricIds.map((id) => song.lyrics[id]?.ai?.start ?? null);
  const spacing = starts.map((s, i) => (s !== null && starts[i + 1] !== null && starts[i + 1] !== undefined ? starts[i + 1] - s : null));
  const med = median(spacing.filter((d) => d !== null && d > 0)) ?? 3;
  const prevCall = new Map();
  const nextCall = new Map();
  let running = null;
  for (const f of flat) {
    if (f.kind === "call") running = running === null ? song.calls[f.id].start : Math.max(running, song.calls[f.id].start);
    else prevCall.set(f.id, running);
  }
  running = null;
  for (const f of [...flat].reverse()) {
    if (f.kind === "call") running = running === null ? song.calls[f.id].start : Math.min(running, song.calls[f.id].start);
    else nextCall.set(f.id, running);
  }
  const inlineOf = new Map();
  for (const f of flat) if (f.kind === "call" && (f.where === "inline" || f.where === "inlineStart")) inlineOf.set(f.row, [...(inlineOf.get(f.row) ?? []), f.id]);
  const c = params.conf;
  lyricIds.forEach((id, i) => {
    const lyric = song.lyrics[id];
    if (Number.isFinite(lyric.owner)) return result.set(id, "confirmed");
    const s = starts[i];
    if (s === null) return result.set(id, "low");
    const e = Number.isFinite(lyric.ai.end) ? lyric.ai.end : s;
    const prev = starts[i - 1];
    const next = starts[i + 1];
    const mono = (prev === null || prev === undefined || prev <= s + 0.05) && (next === null || next === undefined || s <= next + 0.05);
    const pc = prevCall.get(id);
    const nc = nextCall.get(id);
    const bracket = (pc === null || s >= pc - c.bracketTol) && (nc === null || s <= nc + c.bracketTol);
    const own = (inlineOf.get(id) ?? []).every((cid) => song.calls[cid].start >= s - c.inlineTol && song.calls[cid].start <= e + c.inlineTol);
    const sp = spacing[i];
    // 詰め込み：次の行までが短すぎる／間延び：その行自体が長すぎる（次の行まで長く空くのは間奏などで普通なので見ない）
    const spacingOk = (sp === null || sp >= med * c.minSpacingRatio) && e - s <= med * c.maxSpacingRatio;
    result.set(id, mono && bracket && own && spacingOk && !lyric.suspect ? "high" : "low");
  });
  return result;
}

// ---- 時間の重なり（多対多）：コール1つ × 歌詞行いくつ ----
// 並び（層1）には一切使わない。表示の補助（「この間に歌う行」）と点検だけに使う。
// 戻り値：[{ callId, lyricId, overlapSec, source: "confirmed" | "high" | "low" }]
export function callLyricOverlaps(song, conf) {
  const out = [];
  for (const call of Object.values(song.calls)) {
    for (const lyric of Object.values(song.lyrics)) {
      const s = lyricTime(lyric);
      const e = lyricEnd(lyric);
      if (s === null || e === null) continue;
      const ov = Math.min(call.end, e) - Math.max(call.start, s);
      if (ov > 0.05) out.push({ callId: call.id, lyricId: lyric.id, overlapSec: Math.round(ov * 100) / 100, source: conf.get(lyric.id) ?? "low" });
    }
  }
  return out;
}

// ---- 層2：今光っているコール ----
// callFirst・sheetLyric：開始〜終了の間のコールを全部（重なりも全部光らせる）
export function activeCalls(song, t) {
  return Object.values(song.calls).filter((c) => c.start <= t && t < c.end);
}

// appSync：今のアプリと同じ「1つだけ」（後から始まったもの）＋隙間 0.15 秒は前のコールのまま
export function findActiveLineIndex(lines, t) {
  let r = -1;
  for (let i = 0; i < lines.length; i += 1) if (t >= lines[i].start && t < lines[i].end) r = i;
  return r;
}
export function findDisplayLineIndex(lines, t, hold) {
  const a = findActiveLineIndex(lines, t);
  if (a !== -1) return a;
  let prev = -1;
  let nextStart = Infinity;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].end <= t && (prev === -1 || lines[i].end >= lines[prev].end)) prev = i;
    if (lines[i].start > t && lines[i].start < nextStart) nextStart = lines[i].start;
  }
  if (prev === -1 || nextStart === Infinity) return -1;
  return nextStart - lines[prev].end <= hold ? prev : -1;
}

// ---- 今のアプリの並び（時刻で差し込む）を作る（appSync のまね） ----
export function buildAppSyncRows(song) {
  const lines = Object.values(song.lyrics)
    .filter((l) => l.ai)
    .sort((a, b) => a.order - b.order);
  const calls = Object.values(song.calls).sort((a, b) => a.start - b.start);
  const rows = lines.map((l) => ({ kind: "lyric", id: l.id }));
  for (const call of calls) {
    const target = lines.findIndex((l) => l.ai.start >= call.start);
    const row = { kind: "callrow", id: call.id };
    if (target === -1) rows.push(row);
    else rows.splice(rows.findIndex((r) => r.kind === "lyric" && r.id === lines[target].id), 0, row);
  }
  return rows;
}

// ---- 層4：「今読んでいる所」の目安（道しるべ） ----
// 道しるべ＝{ t, y }：時刻 t には、中身の y の所を「見る位置」に置きたい
// ・コール：本人がコールを置いた所＝「コールが始まるときに目を置いてほしい所」（層1＋層2の意図）。始まる少し前に着く
//   ※「コールの前の行がコールの開始に当たる」「コールの後の行はコールの後に歌う」とは決めつけない。
//     コールの道しるべは開始の1点だけ。終わりの時刻は道しるべに使わない（コールの間も歌詞は進む）
// ・信頼できる歌詞行（層3の high・confirmed）：その行の時刻にその行へ
// ・目印（本人が置く、別ファイル）：show＝その時刻にそこを見せる／hold＝そこで止める／follow＝自動に戻す
export function buildAnchors(song, geom, conf, viewH, params = PARAMS, { useLyrics = true, useMarkers = true, markers = null } = {}) {
  const P = params;
  const center = (id) => (geom.items[id].top + geom.items[id].bottom) / 2;
  const callAnchors = [];
  for (const f of flattenSheet(song)) {
    if (f.kind !== "call") continue;
    const c = song.calls[f.id];
    const g = geom.items[f.id];
    if (!g) continue;
    // 背の高いコール（長い MIX の塊）は、上の方（1行目あたり）を目安にする
    const y = g.bottom - g.top > viewH * 0.5 ? g.top + viewH * 0.2 : center(f.id);
    callAnchors.push({ t: c.start - P.lead, y, kind: "call", id: c.id });
    callAnchors.push({ t: c.start, y, kind: "call", id: c.id });
  }
  callAnchors.sort((a, b) => a.t - b.t);
  const anchors = [...callAnchors];
  if (useLyrics) {
    for (const f of flattenSheet(song)) {
      if (f.kind !== "lyric") continue;
      const level = conf.get(f.id);
      if (level !== "high" && level !== "confirmed") continue;
      const t = lyricTime(song.lyrics[f.id]) - P.lyricLead;
      const y = center(f.id);
      // コールの道しるべの間に、時刻でも位置でも収まるものだけ使う（食い違うものは捨てる）
      const before = callAnchors.filter((a) => a.y <= y);
      const after = callAnchors.filter((a) => a.y > y);
      const tMin = before.length ? Math.max(...before.map((a) => a.t)) : -Infinity;
      const tMax = after.length ? Math.min(...after.map((a) => a.t)) : Infinity;
      if (t > tMin && t < tMax) anchors.push({ t, y, kind: "lyric", id: f.id });
    }
  }
  const list = useMarkers ? markers ?? song.markers ?? [] : [];
  for (const m of list) {
    if (m.mode === "follow") anchors.push({ t: m.time, kind: "follow" });
    else if (geom.items[m.targetId]) anchors.push({ t: m.time, y: center(m.targetId), kind: "marker", hold: m.mode === "hold", id: m.targetId });
  }
  anchors.sort((a, b) => a.t - b.t);
  anchors.forEach((a, i) => {
    if (!a.hold) return;
    let end = Infinity;
    for (let j = i + 1; j < anchors.length; j += 1) {
      if (anchors[j].kind === "follow") {
        end = anchors[j].t;
        break;
      }
      if (anchors[j].y !== undefined) {
        end = anchors[j].t - P.holdRamp;
        break;
      }
    }
    a.holdEnd = Math.max(a.t, end);
  });
  const usable = anchors.filter((a) => a.kind !== "follow");
  // 下にしか進まない（コール表は上から下へ時刻順に読む前提。戻らない）
  let maxY = -Infinity;
  for (const a of usable) {
    a.y = Math.max(a.y, maxY);
    maxY = a.y;
  }
  return usable;
}

// 道しるべの間を、時刻でなめらかにつなぐ（純粋関数：同じ t なら必ず同じ値）
export function baseFocus(anchors, t) {
  if (!anchors.length) return 0;
  if (t <= anchors[0].t) return anchors[0].y;
  for (let i = 0; i < anchors.length - 1; i += 1) {
    const a = anchors[i];
    const b = anchors[i + 1];
    if (t >= b.t) continue;
    if (a.hold) {
      if (t < a.holdEnd) return a.y;
      const span = b.t - a.holdEnd;
      return span <= 0 ? b.y : a.y + (b.y - a.y) * ((t - a.holdEnd) / span);
    }
    const span = b.t - a.t;
    return span <= 0 ? b.y : a.y + (b.y - a.y) * ((t - a.t) / span);
  }
  return anchors[anchors.length - 1].y;
}

// 「今読んでいる歌詞行」と「次の行」（層4の目安。層3が信頼できればその行、無ければ道しるべの位置に一番近い行）
export function readingLines(song, geom, conf, yRead, t) {
  const lyricIds = flattenSheet(song).filter((f) => f.kind === "lyric").map((f) => f.id).filter((id) => geom.items[id]);
  if (!lyricIds.length) return { current: null, next: null, source: "none" };
  let current = null;
  let source = "estimate";
  for (const id of lyricIds) {
    const level = conf.get(id);
    if (level !== "high" && level !== "confirmed") continue;
    const s = lyricTime(song.lyrics[id]);
    const e = lyricEnd(song.lyrics[id]);
    if (s <= t && t < e) {
      current = id;
      source = level;
    }
  }
  if (!current) {
    let best = Infinity;
    for (const id of lyricIds) {
      const g = geom.items[id];
      const d = Math.abs((g.top + g.bottom) / 2 - yRead);
      if (d < best) {
        best = d;
        current = id;
      }
    }
  }
  const i = lyricIds.indexOf(current);
  return { current, next: lyricIds[i + 1] ?? null, source };
}

// 要素1つ（または上下の範囲）を画面に入れるための scrollTop の範囲
function windowForRange(top, bottom, viewH, m) {
  if (bottom - top <= viewH - 2 * m) return { lo: bottom + m - viewH, hi: top - m };
  return { lo: top - 0.5 * viewH, hi: bottom - 0.5 * viewH }; // 背の高い物：画面の半分以上を占めていればよい
}

// ---- 改善案：時刻 t のスクロール目標（純粋関数） ----
// 優先順位（上から順に、両立できる限り全部入れる）
//   パネルなし（案B）：1 いちばん新しく始まったコール → 2 今歌っている行 → 3 ほかの光っているコール → 4 次の行 → 5 次のコール
//   パネルあり（案D）：1 今歌っている行 → 2 いちばん新しく始まったコール → 3 ほかの光っているコール → 4 次の行 → 5 次のコール
//     （コールはパネルに必ず出ているので、画面が狭いときは歌詞を優先する。ただしコールもできるだけ画面に残す）
export function callFirstTarget(song, geom, prep, t, viewH, params = PARAMS, { panel = false } = {}) {
  const P = params;
  const yRead = baseFocus(prep.anchors, t);
  const reading = readingLines(song, geom, prep.conf, yRead, t);
  const active = activeCalls(song, t).sort((a, b) => b.start - a.start);
  const next = Object.values(song.calls)
    .filter((c) => c.start > t && c.start - t <= P.lookahead)
    .sort((a, b) => a.start - b.start)[0];
  const ranges = [];
  const callRange = (c) => (geom.items[c.id] ? { top: geom.items[c.id].top, bottom: geom.items[c.id].bottom } : null);
  const lyricRange = (id) => (id && geom.items[id] ? { top: geom.items[id].top, bottom: geom.items[id].bottom } : null);
  if (panel) {
    ranges.push(lyricRange(reading.current));
    if (active[0]) ranges.push(callRange(active[0]));
  } else {
    if (active[0]) ranges.push(callRange(active[0]));
    ranges.push(lyricRange(reading.current));
  }
  active.slice(1).forEach((c) => ranges.push(callRange(c)));
  ranges.push(lyricRange(reading.next));
  if (next) ranges.push(callRange(next));
  let lo = -Infinity;
  let hi = Infinity;
  for (const r of ranges) {
    if (!r) continue;
    const w = windowForRange(r.top, r.bottom, viewH, P.marginPx);
    const nlo = Math.max(lo, w.lo);
    const nhi = Math.min(hi, w.hi);
    if (nlo <= nhi) {
      lo = nlo;
      hi = nhi;
    }
  }
  const ideal = yRead - P.focusRatio * viewH;
  const maxScroll = Math.max(0, geom.contentH - viewH);
  return { scrollTop: clamp(clamp(ideal, lo, hi), 0, maxScroll), active, next: next ?? null, reading, yRead };
}

// 案C「目印だけ」：最後に過ぎた目印の所で止まっているだけ（目印の間は動かない）
export function markersOnlyTarget(song, geom, t, viewH, markers, params = PARAMS) {
  const maxScroll = Math.max(0, geom.contentH - viewH);
  let target = 0;
  for (const m of markers) {
    if (m.time > t) break;
    const g = geom.items[m.targetId];
    if (g) target = clamp((g.top + g.bottom) / 2 - params.focusRatio * viewH, 0, maxScroll);
  }
  return target;
}

export function prepareCallFirst(song, geom, viewH, params = PARAMS, options = {}) {
  const conf = lyricConfidence(song, params);
  return { conf, anchors: buildAnchors(song, geom, conf, viewH, params, options), overlaps: callLyricOverlaps(song, conf) };
}

// 改善案で光らせる歌詞行：信頼できる行だけ（信頼できない行は光らせない＝間違った行を光らせない）
export function callFirstLitLyric(song, conf, t) {
  let lit = null;
  for (const f of flattenSheet(song)) {
    if (f.kind !== "lyric") continue;
    const level = conf.get(f.id);
    if (level !== "high" && level !== "confirmed") continue;
    const s = lyricTime(song.lyrics[f.id]);
    const e = lyricEnd(song.lyrics[f.id]);
    if (s <= t && t < e) lit = f.id;
  }
  return lit;
}

// ---- 歌詞をタップしたときの移動先（改善案） ----
// confirmed：その時刻へ。high：AI の時刻へ（「推定」と表示）。low：その行以降で最初のコールの1秒前へ（行の時刻は使わない）
export function lyricTapTarget(song, conf, lyricId, preRoll = 1.0) {
  const level = conf.get(lyricId);
  const lyric = song.lyrics[lyricId];
  if (level === "confirmed") return { time: lyric.owner, label: "確認済みの時刻へ移動", level };
  if (level === "high") return { time: lyric.ai.start, label: "推定の時刻へ移動（AI の歌詞時刻）", level };
  const flat = flattenSheet(song);
  const idx = flat.findIndex((f) => f.kind === "lyric" && f.id === lyricId);
  const nextCall = flat.slice(idx).find((f) => f.kind === "call");
  if (nextCall) return { time: Math.max(0, song.calls[nextCall.id].start - preRoll), label: "歌詞の時刻が不確かなので、次のコールの1秒前へ移動", level };
  const prevCall = flat.slice(0, idx).reverse().find((f) => f.kind === "call");
  if (prevCall) return { time: song.calls[prevCall.id].start, label: "歌詞の時刻が不確かなので、直前のコールの始まりへ移動", level };
  return { time: lyric.ai?.start ?? 0, label: "推定の時刻へ移動（不確か）", level };
}

// 固定パネルの中身（純粋関数）：いま（最大2つ、新しい順）とつぎ
export function panelState(song, t, params = PARAMS) {
  const active = activeCalls(song, t).sort((a, b) => b.start - a.start);
  const next = Object.values(song.calls)
    .filter((c) => c.start > t)
    .sort((a, b) => a.start - b.start)[0] ?? null;
  return {
    now: active.slice(0, params.panelCalls).map((c) => ({ id: c.id, text: c.text, progress: clamp((t - c.start) / (c.end - c.start), 0, 1), long: c.end - c.start >= 4 })),
    more: Math.max(0, active.length - params.panelCalls),
    next: next ? { id: next.id, text: next.text, wait: Math.max(0, next.start - t) } : null,
  };
}

// ---- 走らせる部品（スクロールの動きだけ状態を持つ。目標は上の純粋関数） ----
// method："appSync" | "sheetLyric" | "callFirst"、variant（callFirst のとき）："panel" | "fit" | "markers" | "combo"
export function createRunner(method, song, geom, viewH, { params = PARAMS, mobile = true, variant = "combo", options = {} } = {}) {
  const P = params;
  const maxScroll = Math.max(0, geom.contentH - viewH);
  const lyricOrder = Object.values(song.lyrics).filter((l) => l.ai).sort((a, b) => a.order - b.order);
  const aiLines = lyricOrder.map((l) => ({ id: l.id, start: l.ai.start, end: l.ai.end }));
  const callsByStart = Object.values(song.calls).sort((a, b) => a.start - b.start);
  const lyricScroll = method === "sheetLyric" || (method === "callFirst" && variant === "panel");
  const markerList = variant === "markers" ? song.sectionMarkers ?? [] : variant === "combo" ? song.markers ?? [] : [];
  const prepared = method === "callFirst" ? prepareCallFirst(song, geom, viewH, P, { ...options, useMarkers: variant === "combo", markers: markerList }) : null;
  const conf = prepared ? prepared.conf : lyricConfidence(song, P);
  let y = 0;
  let moveTarget = null;
  let lastKey;
  let lastScrollWall = -Infinity;
  let wall = 0;
  let moving = false;

  const approach = (target, dtWall, speedLimit = Infinity) => {
    const k = 1 - Math.exp(-dtWall / P.tau);
    let d = (target - y) * k;
    const lim = speedLimit * dtWall;
    if (Math.abs(d) > lim) d = Math.sign(d) * lim;
    y += d;
    if (Math.abs(target - y) < 0.5) {
      y = target;
      return true;
    }
    return false;
  };
  const centerTop = (id) => clamp((geom.items[id].top + geom.items[id].bottom) / 2 - viewH / 2, 0, maxScroll);

  function lit(t) {
    if (method === "appSync") {
      const i = findDisplayLineIndex(callsByStart, t, P.callGapHold);
      const li = findDisplayLineIndex(aiLines, t, P.lyricGapHold);
      return { calls: new Set(i === -1 ? [] : [callsByStart[i].id]), lyric: li === -1 ? null : aiLines[li].id };
    }
    if (method === "sheetLyric") {
      let cur = null;
      for (const l of aiLines) if (l.start <= t) cur = l.id;
      return { calls: new Set(activeCalls(song, t).map((c) => c.id)), lyric: cur };
    }
    return { calls: new Set(activeCalls(song, t).map((c) => c.id)), lyric: callFirstLitLyric(song, conf, t) };
  }

  function visibleComfortably(id) {
    const g = geom.items[id];
    if (!g) return true;
    const h = g.bottom - g.top;
    if (h > viewH - 2 * P.marginPx) return g.top - y < viewH * 0.5 && g.bottom - y > viewH * 0.5;
    return g.top >= y + P.marginPx && g.bottom <= y + viewH - P.marginPx;
  }

  function step(t, dtWall, { seeked = false } = {}) {
    wall += dtWall;
    const state = lit(t);
    let extra = null;
    if (method === "appSync") {
      const li = findDisplayLineIndex(aiLines, t, P.lyricGapHold);
      if (seeked || lastKey === undefined) {
        if (li !== -1) {
          y = centerTop(aiLines[li].id);
          moveTarget = null;
        }
        lastScrollWall = wall;
      } else if (li !== lastKey && li !== -1) {
        const line = aiLines[li];
        const instant = line.end - line.start < 1.2 || wall - lastScrollWall < 0.7;
        const target = centerTop(line.id);
        if (instant) {
          y = target;
          moveTarget = null;
        } else moveTarget = target;
        lastScrollWall = wall;
      }
      lastKey = li;
      if (moveTarget !== null && approach(moveTarget, dtWall)) moveTarget = null;
    } else if (lyricScroll) {
      let key = null;
      for (const l of aiLines) if (l.start <= t) key = l.id;
      if ((seeked || key !== lastKey) && key && geom.items[key]) {
        const g = geom.items[key];
        const top = g.top - y;
        const bottom = g.bottom - y;
        const out = mobile ? top < viewH * 0.12 || bottom > viewH * 0.7 : top < 40 || bottom > viewH - 60;
        if (out || seeked) {
          const target = clamp(g.top - (mobile ? 0.3 : 0.25) * viewH, 0, maxScroll);
          if (seeked) {
            y = target;
            moveTarget = null;
          } else moveTarget = target;
        }
      }
      lastKey = key;
      if (moveTarget !== null && approach(moveTarget, dtWall)) moveTarget = null;
    } else if (variant === "markers") {
      const target = markersOnlyTarget(song, geom, t, viewH, markerList, P);
      if (seeked || lastKey === undefined) y = target;
      else approach(target, dtWall, P.maxSpeed);
      lastKey = 1;
    } else {
      const res = callFirstTarget(song, geom, prepared, t, viewH, P, { panel: variant === "combo" });
      extra = res;
      if (seeked || lastKey === undefined) {
        y = res.scrollTop;
        moving = false;
      } else {
        // ヒステリシス（行き来しない工夫）：上へ戻るのは「今光っているコール」か「今歌っている行」が見えなくなるときだけ。
        // 次のコールの先読みが外れた・読む位置の目安が少し戻った、くらいでは上へ戻らない
        let target = res.scrollTop;
        if (target < y) {
          const mustSee = [...res.active.map((c) => c.id), ...(res.reading.current ? [res.reading.current] : [])];
          if (mustSee.every((id) => visibleComfortably(id))) target = y;
        }
        const needs = Math.abs(target - y) > P.band * viewH || res.active.some((c) => !visibleComfortably(c.id));
        if (needs) moving = true;
        if (moving && approach(target, dtWall, P.maxSpeed)) moving = false;
      }
      lastKey = 1;
    }
    return { scrollTop: y, litCalls: state.calls, litLyric: state.lyric, reading: extra?.reading ?? null };
  }

  return { step, conf, prep: prepared, get scrollTop() { return y; } };
}

// ---- 計測（同じ曲・同じ位置情報で、方式ごとに再生をまねて数える） ----
// seeks：[{ at, to }]（書いた順に1回ずつ。再生位置が at を過ぎたら to へ飛ぶ。ケース H）
// pauses：[{ at, wallSec }]（at で wallSec 秒止める。止めている間も画面の状態が変わらないか）
// panel：固定パネルあり（パネルに出ているコールは「見えている」に数える。ただし画面の中の可視時間も別に数える）
export function simulate(method, song, geom, viewH, { params = PARAMS, mobile = true, speed = 1, fps = 30, from = 0, to = null, seeks = [], pauses = [], variant = "combo", panel = false, options = {} } = {}) {
  const runner = createRunner(method, song, geom, viewH, { params, mobile, variant, options });
  const end = to ?? song.duration;
  const dtWall = 1 / fps;
  const pendingSeeks = [...seeks];
  const pendingPauses = [...pauses];
  let pauseLeft = 0;
  let t = from;
  let first = true;
  let prevY = null;
  let prevDir = 0;
  const m = { reversals: 0, upwardPx: 0, travelPx: 0, maxSpeed: 0, activeTime: 0, litOk: 0, falseLit: 0, offscreen: 0, primaryOff: 0, missing: 0, sungTime: 0, sungOff: 0, nextLineTime: 0, nextLineOff: 0, bothTime: 0, bothOff: 0, pauseChanges: 0, seeks: 0, readErr: 0 };
  const recover = [];
  let recoverClock = null;
  const visible = (id, yy) => {
    const g = geom.items[id];
    if (!g) return false;
    const h = g.bottom - g.top;
    const inside = Math.min(g.bottom, yy + viewH) - Math.max(g.top, yy);
    if (h > viewH * 0.9) return inside >= viewH * 0.45;
    return inside >= h * 0.6;
  };
  const sheetLyricIds = flattenSheet(song).filter((f) => f.kind === "lyric").map((f) => f.id);
  let guard = 0;
  let pauseSnapshot = null;
  while (t < end && guard < 400000) {
    guard += 1;
    let seeked = first;
    if (pauseLeft <= 0 && pendingSeeks[0] && t >= pendingSeeks[0].at) {
      t = pendingSeeks.shift().to;
      seeked = true;
      recoverClock = 0;
      m.seeks += 1;
    }
    if (pauseLeft <= 0 && pendingPauses[0] && t >= pendingPauses[0].at) pauseLeft = pendingPauses.shift().wallSec;
    first = false;
    const paused = pauseLeft > 0;
    const out = runner.step(t, dtWall, { seeked });
    const yy = out.scrollTop;
    if (paused) {
      const snap = `${Math.round(yy)}|${[...out.litCalls].sort().join(",")}`;
      if (pauseSnapshot !== null && snap !== pauseSnapshot) m.pauseChanges += 1;
      pauseSnapshot = snap;
      pauseLeft -= dtWall;
      prevY = yy;
      continue;
    }
    pauseSnapshot = null;
    if (prevY !== null && !seeked) {
      const d = yy - prevY;
      if (Math.abs(d) > 0.5) {
        const dir = Math.sign(d);
        if (prevDir !== 0 && dir !== prevDir) m.reversals += 1;
        prevDir = dir;
        m.travelPx += Math.abs(d);
        if (d < 0) m.upwardPx += -d;
        m.maxSpeed = Math.max(m.maxSpeed, Math.abs(d) / dtWall);
      }
    } else if (seeked) prevDir = 0;
    prevY = yy;
    const dtSong = dtWall * speed;
    const active = activeCalls(song, t);
    if (active.length) {
      m.activeTime += dtSong;
      if (active.every((c) => out.litCalls.has(c.id))) m.litOk += dtSong;
      const allVisible = active.every((c) => visible(c.id, yy));
      if (!allVisible) m.offscreen += dtSong;
      const sorted = [...active].sort((a, b) => b.start - a.start);
      if (!visible(sorted[0].id, yy)) m.primaryOff += dtSong;
      // パネルに出ている（新しい順に panelCalls 件）か、画面の中にあれば「見えている」
      const inPanel = new Set(panel ? sorted.slice(0, params.panelCalls).map((c) => c.id) : []);
      if (!active.every((c) => inPanel.has(c.id) || visible(c.id, yy))) m.missing += dtSong;
      if (recoverClock !== null) {
        if (allVisible) {
          recover.push(recoverClock);
          recoverClock = null;
        } else recoverClock += dtWall;
      }
    } else if (recoverClock !== null) {
      recover.push(recoverClock);
      recoverClock = null;
    }
    for (const id of out.litCalls) {
      const c = song.calls[id];
      if (!(c.start <= t && t < c.end)) m.falseLit += dtSong;
    }
    // 本当に歌っている行（ダミーデータの「正解」truth）と、その次の行が見えているか
    const sung = sheetLyricIds.filter((id) => song.lyrics[id]?.truth && song.lyrics[id].truth.start <= t && t < song.lyrics[id].truth.end);
    if (sung.length) {
      m.sungTime += dtSong;
      const sungVisible = sung.every((id) => visible(id, yy));
      // 「見る位置」（画面の上から focusRatio）と、本当に歌っている行の距離（px）。小さいほど、目線の所に今の行がある
      const gs = geom.items[sung[sung.length - 1]];
      // 方式ごとの「見る位置」：今のアプリ＝真ん中（scrollIntoView center）、歌詞時刻で追う方式＝上から 30%、改善案＝focusRatio
      const focusR = method === "appSync" ? 0.5 : method === "sheetLyric" || variant === "panel" ? 0.3 : params.focusRatio;
      if (gs) m.readErr += Math.abs((gs.top + gs.bottom) / 2 - (yy + focusR * viewH)) * dtSong;
      if (!sungVisible) m.sungOff += dtSong;
      const last = sung[sung.length - 1];
      const nextId = sheetLyricIds[sheetLyricIds.indexOf(last) + 1];
      if (nextId) {
        m.nextLineTime += dtSong;
        if (!visible(nextId, yy)) m.nextLineOff += dtSong;
      }
      if (active.length) {
        m.bothTime += dtSong;
        if (!(sungVisible && active.every((c) => visible(c.id, yy)))) m.bothOff += dtSong;
      }
    }
    t += dtSong;
  }
  const r1 = (v) => Math.round(v * 10) / 10;
  const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  return {
    method: method === "callFirst" ? `callFirst:${variant}` : method,
    reversals: m.reversals,
    upwardPx: Math.round(m.upwardPx),
    travelPx: Math.round(m.travelPx),
    maxSpeed: Math.round(m.maxSpeed),
    callLitSec: r1(m.activeTime),
    litCorrectPct: m.activeTime ? pct(m.litOk, m.activeTime) : 100,
    falseLitSec: r1(m.falseLit),
    offscreenSec: r1(m.offscreen),
    offscreenPct: pct(m.offscreen, m.activeTime),
    primaryOffscreenSec: r1(m.primaryOff),
    callMissingSec: r1(m.missing),
    sungOffscreenSec: r1(m.sungOff),
    sungOffscreenPct: pct(m.sungOff, m.sungTime),
    nextLineHiddenPct: pct(m.nextLineOff, m.nextLineTime),
    bothHiddenPct: pct(m.bothOff, m.bothTime),
    readErrPx: m.sungTime ? Math.round(m.readErr / m.sungTime) : 0,
    pauseChanges: m.pauseChanges,
    seeks: m.seeks,
    maxRecoverSec: recover.length ? r1(Math.max(...recover)) : 0,
  };
}

// 画面の並び（geom）が、コール表と同じ順か（geom.order：画面に出ている順の id。コールと歌詞の両方）
export function orderCheck(song, geom) {
  const sheet = flattenSheet(song).map((f) => f.id);
  const shown = (geom.order ?? []).filter((id) => sheet.includes(id));
  let moved = 0;
  // コール表と同じ相対順か：コールごとに「直前の歌詞行」が同じかで数える
  const prevLyric = (list) => {
    const map = new Map();
    let last = null;
    for (const id of list) {
      if (id.startsWith("lyric:")) last = id;
      else map.set(id, last);
    }
    return map;
  };
  const a = prevLyric(sheet);
  const b = prevLyric(shown);
  for (const [id, lyric] of a) if (b.has(id) && b.get(id) !== lyric) moved += 1;
  return { same: moved === 0, moved };
}
