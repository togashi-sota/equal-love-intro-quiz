// ライブコール「文字モード」の表示（2026-10-24新設）。js/callTextLayout.js が作った並びを、
// 歌詞＝黒文字・コール＝赤文字の「全文コール表」として描く。アプリ本体と確認用プレビュー（tools/live-call-text/）の両方で使う。
// 自動スクロール・時刻によるハイライトはしない（読むための表示）。
import { CALL_POSITION } from "./callTextLayout.js";

const BLOCK_LABELS = {
  [CALL_POSITION.INTRO]: "イントロ",
  [CALL_POSITION.INTERLUDE]: "間奏",
  [CALL_POSITION.OUTRO]: "アウトロ",
};

const TYPE_LABELS = { mix: "MIX", "member-call": "コール", callback: "合いの手", unique: "固有コール" };

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
  if (options.showTypes && call.type === "mix") span.appendChild(el("span", "call-text-type", TYPE_LABELS.mix));
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
    if (index > 0) row.appendChild(document.createTextNode(" "));
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
  const lyricClass = item.displayEdited ? "call-text-lyric is-pre" : "call-text-lyric";
  const parts = []; // 表示順の「歌詞の一部」と「コール」
  let position = 0;
  groups.forEach((group) => {
    if (group.offset > position) parts.push({ kind: "lyric", start: position, end: group.offset });
    group.calls.forEach((call) => parts.push({ kind: "call", call }));
    position = group.offset;
  });
  if (position < text.length || !parts.some((part) => part.kind === "lyric")) parts.push({ kind: "lyric", start: position, end: text.length });
  (item.inline ?? []).forEach((call) => parts.push({ kind: "call", call }));
  const endsWithSpace = (part) => part.kind === "lyric" && /\s$/.test(text.slice(part.start, part.end));
  const startsWithSpace = (part) => part.kind === "lyric" && /^\s/.test(text.slice(part.start, part.end));
  parts.forEach((part, index) => {
    const previous = parts[index - 1];
    const needsGap = previous && (previous.kind === "call" || part.kind === "call") && !endsWithSpace(previous) && !startsWithSpace(part);
    if (needsGap) line.appendChild(document.createTextNode(" "));
    if (part.kind === "call") {
      line.appendChild(callSpan(part.call, options));
      return;
    }
    const span = el("span", lyricClass, text.slice(part.start, part.end));
    if (options.unitHook) options.unitHook(span, { kind: "lyric", lineNo: item.lineNo, start: part.start, end: part.end, text, displayEdited: Boolean(item.displayEdited) });
    line.appendChild(span);
  });
}

// container に全文コール表を描く。
// options: { showTypes: MIXの印を出すか, showReview: 配置要確認の印を出すか, showLineNumbers, onCallClick, unitHook（エディター専用） }
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
    if (options.showLineNumbers) line.appendChild(el("span", "call-text-line-no", String(item.lineNo)));
    appendLineContents(line, item, options);
    group.appendChild(line);
    if (item.after.length) group.appendChild(callRow(item.after, "is-after", options));
    list.appendChild(group);
  });
  container.appendChild(list);
  return list;
}
