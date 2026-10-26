// ライブコール「文字モード」の並べ方を決めるファイル（2026-10-24新設・本人指示）。
// 歌詞全文（黒）の適切な位置に、既存のコール（赤）を差し込んだ「全文コール表」の並びを作る。
// 歌詞やコールの中身は持たない（各端末の IndexedDB にあるデータを受け取って並べるだけ）。DOM に触れない純粋関数。
//
// 【なぜ時刻だけで決めないか】同期モード（js/callSync.js）は「コールの開始時刻以降で最初に始まる歌詞行の直前」に
// 差し込むため、歌詞の時刻とコールの時刻のわずかなずれで、コールが本来の歌詞の1〜2行前後に出ることがある。
// 文字モードでは、各コールを「どの行の 前／同時／後／間奏」に置くかという位置情報で並べ、
// 承認済みの位置情報（overrides）があればそれを優先する。無い場合だけ時刻から推定し、行の境目で
// 判断しにくいものには needsReview（配置要確認）を付ける。
// どの場合も、既存のコールは1件ずつ必ず1回だけ表示する（増やさない・減らさない・本文を変えない）。
//
// 【2026-10-25追加：文字位置】「横（同時）」のコールは、行の途中の文字位置（offset）にも置ける
// （例：「叫べ！」の後に「おい！」）。offset は歌詞本文の先頭からの位置（JavaScript の文字列の位置）で、
// エディターが文字の区切り（絵文字や結合文字の途中ではない所）だけを選ぶ。歌詞本文は書き換えない。
// 位置を決めたときの歌詞の行の指紋（lineTextHash）と端末の歌詞が違う場合は、文字位置を使わず行の横に出す
// （誤った文字位置に差し込まない）。offset の無いコールは、これまでどおり行の横（行末）に並ぶ。
import { hashText } from "./callTextEdits.js";

export const CALL_POSITION = {
  INTRO: "intro", // 1行目より前
  BEFORE: "before", // その行の直前
  INLINE: "inline", // その行と同時（横に表示）
  AFTER: "after", // その行の直後
  INTERLUDE: "interlude", // その行の後の間奏（独立した塊）
  OUTRO: "outro", // 最後の行の後
};

const BOUNDARY_SEC = 0.35; // 行の境目からこの範囲のコールは、どの行のものか判断しにくい
const INTERLUDE_GAP_SEC = 4; // 行と行の間がこれ以上空いていれば間奏として扱う
const OUTRO_AFTER_SEC = 2; // 最後の行の終わりからこれ以上後はアウトロ

// コールを特定するための安定したキー（種類＋開始時刻）。本文は含めない（位置情報を公開しても本文が出ないように）。
// 本人が文字モード用に追加したコール（js/callTextEdits.js）は、自分のキー（key）を持つのでそれを使う。
export function callKey(call) {
  if (typeof call.key === "string" && call.key) return call.key;
  return `${call.type}@${Number(call.start).toFixed(2)}`;
}

const OFFSET_POSITIONS = new Set([CALL_POSITION.INLINE, CALL_POSITION.BEFORE, CALL_POSITION.AFTER, CALL_POSITION.INTERLUDE]);

// 表示行を分ける位置（splits）のうち使えるもの：行の途中（端ではない）・昇順・重複なし・絵文字の途中でない
export function validSplits(line) {
  const text = String(line?.text ?? "");
  if (!Array.isArray(line?.splits)) return [];
  return [...new Set(line.splits)]
    .filter((s) => Number.isInteger(s) && s > 0 && s < text.length && !(text.charCodeAt(s) >= 0xdc00 && text.charCodeAt(s) <= 0xdfff))
    .sort((a, b) => a - b);
}

// 文字位置が使えるか：歌詞が位置を決めたときと同じで、位置が本文の範囲内・サロゲートペアの途中でないこと
export function isValidLineOffset(line, offset, lineTextHash) {
  if (!line || !Number.isInteger(offset) || typeof lineTextHash !== "string") return false;
  const text = String(line.text ?? "");
  if (offset < 0 || offset > text.length || hashText(text) !== lineTextHash) return false;
  const code = text.charCodeAt(offset);
  return !(code >= 0xdc00 && code <= 0xdfff); // 下位サロゲート＝絵文字などの途中
}

export function sortCalls(calls) {
  return [...(calls ?? [])].sort((a, b) => a.start - b.start);
}

// 時刻から1件のコールの位置を推定する。lines は行番号順・開始時刻順。
export function estimateCallPlacement(lines, call) {
  const t = call.start;
  if (!lines.length) return { lineNo: null, position: CALL_POSITION.INTRO, needsReview: false, reason: "歌詞なし" };
  if (t < lines[0].start - BOUNDARY_SEC) {
    return { lineNo: lines[0].line, position: CALL_POSITION.INTRO, needsReview: false, reason: "1行目より前" };
  }
  let index = 0;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].start <= t + 0.05) index = i;
    else break;
  }
  const current = lines[index];
  const next = lines[index + 1] ?? null;
  const last = lines[lines.length - 1];
  if (!next && t > last.end + OUTRO_AFTER_SEC) {
    return { lineNo: last.line, position: CALL_POSITION.OUTRO, needsReview: false, reason: "最後の行の後" };
  }
  if (next && next.start - t <= BOUNDARY_SEC && next.start - t >= 0) {
    return { lineNo: next.line, position: CALL_POSITION.BEFORE, needsReview: true, reason: "次の行の直前（行の境目）" };
  }
  const nearLineStart = Math.abs(t - current.start) < BOUNDARY_SEC && index > 0;
  if (t <= current.end - 0.1) {
    return { lineNo: current.line, position: CALL_POSITION.INLINE, needsReview: nearLineStart, reason: nearLineStart ? "行の始まりと重なる（前の行の後かもしれない）" : "行と同時" };
  }
  const gap = (next ? next.start : Infinity) - current.end;
  if (gap >= INTERLUDE_GAP_SEC) {
    return { lineNo: current.line, position: CALL_POSITION.INTERLUDE, needsReview: false, reason: "行の後の長い間（間奏）" };
  }
  return { lineNo: current.line, position: CALL_POSITION.AFTER, needsReview: false, reason: "行の直後" };
}

// lines: [{ line, text, start, end }]（端末内の歌詞データ）、calls: [{ text, start, end, type }]（端末内のコールデータ）
// overrides: { [callKey]: { lineNo, position, needsReview?, order?, offset?, lineTextHash? } }（承認済み・または確認用の位置情報。無ければ時刻から推定）
//   order：同じ行・同じ位置に複数のコールがあるときの並び順（小さい順。省略時はコールの開始時刻）
//   offset・lineTextHash：position が inline のときだけ。行の途中の文字位置（上の説明）
// uncertainLineNos: 歌詞の時刻が不確かな行番号（確認用プレビューだけが渡す。その行に推定で置いたコールは要確認にする）
// 戻り値：{ items, placements, stats }
//   items は表示順の並び：{ kind: "block", position: "intro"|"interlude"|"outro", lineNo, calls } または
//                         { kind: "line", lineNo, text, before: [], inline: [], after: [], anchored: [{ offset, calls }] }
//   anchored は文字位置に置いたコール（offset の小さい順）。inline は行の横（行末）のコール
//   各コールは { callIndex, key, text, type, needsReview, source: "override"|"estimate", reason }
export function buildCallTextLayout(lines, calls, { overrides = null, uncertainLineNos = null } = {}) {
  const sortedLines = [...(lines ?? [])].sort((a, b) => a.line - b.line);
  const sortedCalls = sortCalls(calls);
  const lineNos = new Set(sortedLines.map((l) => l.line));
  const lineByNo = new Map(sortedLines.map((l) => [l.line, l]));
  const placements = sortedCalls.map((call, callIndex) => {
    const key = callKey(call);
    const override = overrides?.[key];
    let placement;
    let source;
    const overrideValid =
      override &&
      Object.values(CALL_POSITION).includes(override.position) &&
      (override.lineNo === null ? sortedLines.length === 0 : lineNos.has(override.lineNo));
    if (overrideValid) {
      placement = { lineNo: override.lineNo, position: override.position, needsReview: Boolean(override.needsReview), reason: override.reason ?? "位置情報あり" };
      source = "override";
      // 文字位置：横（同時）はその文字の所、前・後・間奏は表示行の区切り（Enter で分けた所）を指すときに使う
      if (OFFSET_POSITIONS.has(override.position) && override.offset !== undefined && override.offset !== null) {
        if (isValidLineOffset(lineByNo.get(override.lineNo), override.offset, override.lineTextHash)) placement.offset = override.offset;
        else placement.anchorFallback = true; // 歌詞が違う：文字位置は使わず、行の横・前・後に出す
      }
    } else {
      placement = estimateCallPlacement(sortedLines, call);
      if (uncertainLineNos?.has(placement.lineNo)) {
        placement = { ...placement, needsReview: true, reason: `${placement.reason}・この行の歌詞の時刻が不確か` };
      }
      source = "estimate";
    }
    const order = overrideValid && Number.isFinite(override.order) ? override.order : call.start;
    return { callIndex, key, text: call.text, type: call.type, start: call.start, added: Boolean(call.added), edited: Boolean(call.edited), order, source, ...placement };
  });

  // ---- 表示行（2026-10-26追加） ----
  // 歌詞の行（元のデータの行番号）を、文字モードで見せる「表示行」に組み立てる。
  //   splits：その行の表示用の歌詞の、どの文字位置で表示行を分けるか（Enter で分けた所）
  //   joinNext：その行の最後と次の行の最初を1つの表示行につなげる（値はつなぎ目に入れる文字。"" も可）
  // どちらも無ければ、これまでどおり歌詞の1行＝表示行1つ（見た目も並びも以前と同じ）。
  // コールの位置は、元の歌詞の行番号＋その行の中の文字位置のまま持ち、表示行への割り当てはここで毎回決める
  // （表示行の番号は、つないだり分けたりするたびに上から数え直すだけで、コールの位置そのものは変わらない）。
  const displayLines = [];
  sortedLines.forEach((line, index) => {
    const text = line.text ?? "";
    const cuts = validSplits(line);
    const bounds = [0, ...cuts, text.length];
    const previous = sortedLines[index - 1];
    const joined = previous && typeof previous.joinNext === "string" && displayLines.length > 0;
    for (let i = 0; i < bounds.length - 1; i += 1) {
      const segment = { lineNo: line.line, start: bounds[i], end: bounds[i + 1], displayEdited: Boolean(line.displayEdited) };
      if (i === 0 && joined) {
        const current = displayLines[displayLines.length - 1];
        current.parts.push({ kind: "joiner", lineNo: previous.line, text: previous.joinNext });
        current.parts.push({ kind: "segment", ...segment, text: text.slice(segment.start, segment.end) });
      } else {
        displayLines.push({ parts: [{ kind: "segment", ...segment, text: text.slice(segment.start, segment.end) }] });
      }
    }
  });
  // 表示行の文章と、各部分の表示行の中での位置
  displayLines.forEach((display, index) => {
    let cursor = 0;
    display.parts.forEach((part) => {
      part.textStart = cursor;
      cursor += part.text.length;
      part.textEnd = cursor;
    });
    display.text = display.parts.map((part) => part.text).join("");
    display.segments = display.parts.filter((part) => part.kind === "segment");
    display.index = index;
  });
  // 元の行の文字位置 → 表示行とその中の位置。分けた所ちょうどの位置は、preferUpper なら上の表示行の最後、そうでなければ下の表示行の最初
  const locate = (lineNo, offset, preferUpper) => {
    let found = null;
    if (!lineByNo.has(lineNo)) return null;
    for (const display of displayLines) {
      for (const segment of display.segments) {
        if (segment.lineNo !== lineNo || offset < segment.start || offset > segment.end) continue;
        const at = { display, at: segment.textStart + (offset - segment.start) };
        if (offset === segment.end && preferUpper) return at;
        if (offset === segment.start && !preferUpper) return at;
        found = found ?? at;
      }
    }
    // 見つからない（壊れた位置情報）ときは、その行の最初の表示行の先頭
    return found ?? (offset !== 0 ? locate(lineNo, 0, false) : null);
  };
  const lineLength = (lineNo) => (lineByNo.get(lineNo)?.text ?? "").length;
  const slots = displayLines.map(() => ({ before: [], inline: [], after: [], anchored: new Map(), interlude: [] }));
  const outro = [];
  const intro = [];
  placements.forEach((p) => {
    if (p.position === CALL_POSITION.INTRO || (p.lineNo === null && sortedLines.length === 0)) return intro.push(p);
    if (p.position === CALL_POSITION.OUTRO) return outro.push(p);
    const length = lineLength(p.lineNo);
    const anchor = (loc) => {
      const slot = slots[loc.display.index];
      if (!slot.anchored.has(loc.at)) slot.anchored.set(loc.at, []);
      slot.anchored.get(loc.at).push(p);
    };
    if (p.position === CALL_POSITION.BEFORE) {
      const loc = locate(p.lineNo, p.offset ?? 0, false);
      return loc.at === 0 ? slots[loc.display.index].before.push(p) : anchor(loc);
    }
    if (p.position === CALL_POSITION.AFTER) {
      const loc = locate(p.lineNo, p.offset ?? length, true);
      return loc.at === loc.display.text.length ? slots[loc.display.index].after.push(p) : anchor(loc);
    }
    if (p.position === CALL_POSITION.INTERLUDE) {
      const loc = locate(p.lineNo, p.offset ?? length, true);
      return slots[loc.display.index].interlude.push(p);
    }
    // 横（同時）：文字位置があればその位置、無ければその行の最後（表示行の最後なら行末の横、つないだ途中ならその位置）
    if (p.offset !== undefined) return anchor(locate(p.lineNo, p.offset, true));
    const loc = locate(p.lineNo, length, true);
    return loc.at === loc.display.text.length ? slots[loc.display.index].inline.push(p) : anchor(loc);
  });

  const items = [];
  const byOrder = (list) => [...list].sort((a, b) => a.order - b.order || a.callIndex - b.callIndex);
  if (intro.length) items.push({ kind: "block", position: CALL_POSITION.INTRO, lineNo: sortedLines[0]?.line ?? null, calls: byOrder(intro) });
  displayLines.forEach((display, index) => {
    const slot = slots[index];
    const first = display.segments[0];
    const last = display.segments[display.segments.length - 1];
    items.push({
      kind: "line",
      lineNo: first.lineNo, // この表示行が始まる元の歌詞の行番号
      displayNo: index + 1, // 画面に出す行番号（上から数え直す）
      id: `${first.lineNo}:${first.start}`, // 表示行の目印（元の行番号:その行の中の開始位置）
      text: display.text,
      displayEdited: display.segments.some((segment) => segment.displayEdited), // 表示用の歌詞（空白・改行をそのまま見せる）
      parts: display.parts.map(({ kind, lineNo, start, end, text, textStart, textEnd, displayEdited }) => ({
        kind,
        lineNo,
        start,
        end,
        text,
        textStart,
        textEnd,
        displayEdited: Boolean(displayEdited),
        lineLength: kind === "segment" ? lineLength(lineNo) : undefined, // 元の行（表示用の歌詞）の長さ
      })),
      before: byOrder(slot.before),
      inline: byOrder(slot.inline),
      after: byOrder(slot.after),
      anchored: [...slot.anchored.keys()].sort((a, b) => a - b).map((offset) => ({ offset, calls: byOrder(slot.anchored.get(offset)) })),
    });
    if (slot.interlude.length) items.push({ kind: "block", position: CALL_POSITION.INTERLUDE, lineNo: last.lineNo, calls: byOrder(slot.interlude) });
  });
  if (outro.length) items.push({ kind: "block", position: CALL_POSITION.OUTRO, lineNo: sortedLines[sortedLines.length - 1]?.line ?? null, calls: byOrder(outro) });

  const shown = items.reduce(
    (sum, item) =>
      sum +
      (item.kind === "block"
        ? item.calls.length
        : item.before.length + item.inline.length + item.after.length + item.anchored.reduce((n, group) => n + group.calls.length, 0)),
    0
  );
  return {
    items,
    placements,
    stats: {
      lines: sortedLines.length,
      calls: sortedCalls.length,
      shownCalls: shown,
      reviewCalls: placements.filter((p) => p.needsReview).length,
      overrideCalls: placements.filter((p) => p.source === "override").length,
      anchorFallbacks: placements.filter((p) => p.anchorFallback).length,
    },
  };
}
