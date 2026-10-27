// ライブコール「文字モード」の表示（2026-10-24新設）。js/callTextLayout.js が作った並びを、
// 歌詞＝黒文字・コール＝赤文字の「全文コール表」として描く。アプリ本体と確認用プレビュー（tools/live-call-text/）の両方で使う。
// 自動スクロール・時刻によるハイライトはしない（読むための表示）。
import { CALL_POSITION } from "./callTextLayout.js";

const BLOCK_LABELS = {
  [CALL_POSITION.INTRO]: "イントロ",
  [CALL_POSITION.INTERLUDE]: "間奏",
  [CALL_POSITION.OUTRO]: "アウトロ",
};


function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// 本人が直した文章・追加したコールは、入れた空白・改行をそのまま見せる（is-pre）。
// 元のままのコールは、これまでどおり（連続した空白は1つにまとまる）表示にして見た目を変えない。
function callSpan(call, options) {
  const pre = call.edited || call.added ? " is-pre" : "";
  // 本人が改行を入れたコールは、ひとかたまりにせず普通の文章と同じように流す（1行目が歌詞の上に浮かないように）
  const hasBreak = pre && String(call.text).includes("\n") ? " has-break" : "";
  const span = el("span", `call-text-call is-${call.type}${call.needsReview && options.showReview ? " is-review" : ""}${pre}${hasBreak}`);
  // 【2026-10-25 本人指示】種類（MIX・合いの手など）の印は出さない。見せるのは「その場所で言うコールの文面」だけ
  span.appendChild(document.createTextNode(call.text));
  if (call.needsReview && options.showReview) {
    const mark = el("span", "call-text-review-mark", "配置要確認");
    if (call.reason) mark.title = call.reason;
    span.appendChild(mark);
  }
  if (options.onCallClick) {
    span.tabIndex = 0;
    span.addEventListener("click", () => options.onCallClick(call));
  }
  // コール表エディターの「スマホ直接編集」が、表示部品はそのままに編集用の仕掛けを付けるための入口（アプリでは使わない）
  if (options.unitHook) options.unitHook(span, { kind: "call", call });
  return span;
}

function callRow(calls, className, options) {
  const row = el("p", `call-text-calls ${className}`);
  calls.forEach((call, index) => {
    // 前のコールが改行で終わる・次のコールが改行で始まるときは、あいだに空白を入れない（行頭に余計な空白が出ないように。2026-10-28）
    const touchesBreak = index > 0 && (String(calls[index - 1].text ?? "").endsWith("\n") || String(call.text ?? "").startsWith("\n"));
    if (index > 0 && !touchesBreak) row.appendChild(document.createTextNode(" "));
    row.appendChild(callSpan(call, options));
  });
  return row;
}

// 歌詞本文を、文字位置に置いたコール（item.anchored）の所で区切って、黒と赤が交互になるように並べる。
// 歌詞本文は区切るだけで、文字を足したり消したりしない（区切った部分をつなげると元の行になる）。
// 行末（横）のコールも続けて並べる。
// 【2026-10-25 スマホ幅の改善】歌詞とコールの間の区切りの空白は、隣の歌詞がすでに空白で終わる／始まるときは入れない
// （全角空白＋区切りの空白で間が空きすぎるのを防ぐ）。
function appendLineContents(line, item, options) {
  const text = item.text ?? "";
  const groups = item.anchored ?? [];
  // 表示行の部分（元の歌詞の行ごとの部分・つなぎ目）。古い形の並び（parts なし）は、行全体を1つの部分とみなす
  const lineParts = item.parts ?? [{ kind: "segment", lineNo: item.lineNo, start: 0, end: text.length, textStart: 0, textEnd: text.length, displayEdited: Boolean(item.displayEdited) }];
  const cuts = new Set([0, text.length, ...groups.map((g) => g.offset), ...lineParts.map((p) => p.textStart)]);
  const sortedCuts = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
  const groupAt = new Map(groups.map((g) => [g.offset, g.calls]));
  const parts = []; // 表示順の「歌詞の一部」と「コール」
  sortedCuts.forEach((cut, index) => {
    (groupAt.get(cut) ?? []).forEach((call) => parts.push({ kind: "call", call }));
    const next = sortedCuts[index + 1];
    if (next === undefined || next === cut) return;
    const owner = lineParts.find((p) => p.textStart <= cut && cut < p.textEnd);
    if (owner) parts.push({ kind: "lyric", start: cut, end: next, owner });
  });
  if (!parts.some((part) => part.kind === "lyric")) parts.push({ kind: "lyric", start: text.length, end: text.length, owner: lineParts[0] }); // 歌詞が空の行（以前と同じ並び）
  (item.inline ?? []).forEach((call) => parts.push({ kind: "call", call }));
  const pieceText = (part) => text.slice(part.start, part.end);
  const endsWithSpace = (part) => part.kind === "lyric" && /\s$/.test(pieceText(part));
  const startsWithSpace = (part) => part.kind === "lyric" && /^\s/.test(pieceText(part));
  const firstLyric = parts.findIndex((part) => part.kind === "lyric");
  parts.forEach((part, index) => {
    const previous = parts[index - 1];
    const needsGap = previous && (previous.kind === "call" || part.kind === "call") && !endsWithSpace(previous) && !startsWithSpace(part);
    if (needsGap) line.appendChild(document.createTextNode(" "));
    if (part.kind === "call") {
      line.appendChild(callSpan(part.call, options));
      return;
    }
    const owner = part.owner;
    const pre = owner.kind === "joiner" || owner.displayEdited;
    const span = el("span", pre ? "call-text-lyric is-pre" : "call-text-lyric", pieceText(part));
    if (options.unitHook) {
      const unit =
        owner.kind === "joiner"
          ? { kind: "joiner", lineNo: owner.lineNo, text: owner.text }
          : { kind: "lyric", lineNo: owner.lineNo, start: owner.start + (part.start - owner.textStart), end: owner.start + (part.end - owner.textStart), pieceText: pieceText(part), displayEdited: Boolean(owner.displayEdited) };
      unit.lineStart = index === firstLyric && index === 0 && part.start === 0; // 表示行の先頭（前にコールが無い）
      unit.lineEnd = index === parts.length - 1 && part.end === text.length; // 表示行の最後（後ろにコールが無い）
      unit.lineId = item.id ?? `${item.lineNo}:0`;
      options.unitHook(span, unit);
    }
    line.appendChild(span);
  });
}

// container に全文コール表を描く。
// options: { showReview: 配置要確認の印を出すか, showLineNumbers, onCallClick, unitHook（エディター専用） }
// （以前の showTypes ＝ MIX の印は、2026-10-25 本人指示で廃止。渡されても使わない）
export function renderCallTextView(container, layout, options = {}) {
  container.textContent = "";
  const list = el("div", "call-text-view");
  layout.items.forEach((item) => {
    if (item.kind === "block") {
      const block = el("div", `call-text-block is-${item.position}`);
      block.appendChild(el("p", "call-text-block-label", `【${BLOCK_LABELS[item.position] ?? ""}】`));
      block.appendChild(callRow(item.calls, "is-block", options));
      list.appendChild(block);
      return;
    }
    const group = el("div", "call-text-group");
    group.dataset.lineNo = String(item.lineNo);
    if (item.before.length) group.appendChild(callRow(item.before, "is-before", options));
    const line = el("p", "call-text-line");
    if (options.showLineNumbers) line.appendChild(el("span", "call-text-line-no", String(item.displayNo ?? item.lineNo)));
    appendLineContents(line, item, options);
    group.appendChild(line);
    if (item.after.length) group.appendChild(callRow(item.after, "is-after", options));
    list.appendChild(group);
  });
  container.appendChild(list);
  return list;
}
