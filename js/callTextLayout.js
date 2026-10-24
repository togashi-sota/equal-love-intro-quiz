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
// overrides: { [callKey]: { lineNo, position, needsReview?, order? } }（承認済み・または確認用の位置情報。無ければ時刻から推定）
//   order：同じ行・同じ位置に複数のコールがあるときの並び順（小さい順。省略時はコールの開始時刻）
// uncertainLineNos: 歌詞の時刻が不確かな行番号（確認用プレビューだけが渡す。その行に推定で置いたコールは要確認にする）
// 戻り値：{ items, placements, stats }
//   items は表示順の並び：{ kind: "block", position: "intro"|"interlude"|"outro", lineNo, calls } または
//                         { kind: "line", lineNo, text, before: [], inline: [], after: [] }
//   各コールは { callIndex, key, text, type, needsReview, source: "override"|"estimate", reason }
export function buildCallTextLayout(lines, calls, { overrides = null, uncertainLineNos = null } = {}) {
  const sortedLines = [...(lines ?? [])].sort((a, b) => a.line - b.line);
  const sortedCalls = sortCalls(calls);
  const lineNos = new Set(sortedLines.map((l) => l.line));
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
    } else {
      placement = estimateCallPlacement(sortedLines, call);
      if (uncertainLineNos?.has(placement.lineNo)) {
        placement = { ...placement, needsReview: true, reason: `${placement.reason}・この行の歌詞の時刻が不確か` };
      }
      source = "estimate";
    }
    const order = overrideValid && Number.isFinite(override.order) ? override.order : call.start;
    return { callIndex, key, text: call.text, type: call.type, start: call.start, added: Boolean(call.added), order, source, ...placement };
  });

  const items = [];
  const byOrder = (list) => [...list].sort((a, b) => a.order - b.order || a.callIndex - b.callIndex);
  const intro = byOrder(placements.filter((p) => p.position === CALL_POSITION.INTRO || (p.lineNo === null && sortedLines.length === 0)));
  if (intro.length) items.push({ kind: "block", position: CALL_POSITION.INTRO, lineNo: sortedLines[0]?.line ?? null, calls: intro });
  sortedLines.forEach((line, index) => {
    const at = (position) => byOrder(placements.filter((p) => p.lineNo === line.line && p.position === position));
    items.push({ kind: "line", lineNo: line.line, text: line.text, before: at(CALL_POSITION.BEFORE), inline: at(CALL_POSITION.INLINE), after: at(CALL_POSITION.AFTER) });
    const interlude = at(CALL_POSITION.INTERLUDE);
    if (interlude.length) items.push({ kind: "block", position: CALL_POSITION.INTERLUDE, lineNo: line.line, calls: interlude });
    if (index === sortedLines.length - 1) {
      const outro = at(CALL_POSITION.OUTRO);
      if (outro.length) items.push({ kind: "block", position: CALL_POSITION.OUTRO, lineNo: line.line, calls: outro });
    }
  });

  const shown = items.reduce(
    (sum, item) => sum + (item.kind === "block" ? item.calls.length : item.before.length + item.inline.length + item.after.length),
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
    },
  };
}
