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

function callSpan(call, options) {
  const span = el("span", `call-text-call is-${call.type}${call.needsReview && options.showReview ? " is-review" : ""}`);
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
function appendLyricWithAnchoredCalls(line, item, options) {
  const text = item.text ?? "";
  const groups = item.anchored ?? [];
  if (!groups.length) {
    line.appendChild(el("span", "call-text-lyric", text));
    return;
  }
  let position = 0;
  groups.forEach((group) => {
    if (group.offset > position) line.appendChild(el("span", "call-text-lyric", text.slice(position, group.offset)));
    group.calls.forEach((call) => {
      if (line.childNodes.length && !line.lastChild.classList?.contains("call-text-line-no")) line.appendChild(document.createTextNode(" "));
      line.appendChild(callSpan(call, options));
    });
    line.appendChild(document.createTextNode(" "));
    position = group.offset;
  });
  if (position < text.length) line.appendChild(el("span", "call-text-lyric", text.slice(position)));
}

// container に全文コール表を描く。
// options: { showTypes: MIXの印を出すか, showReview: 配置要確認の印を出すか, showLineNumbers, onCallClick }
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
    appendLyricWithAnchoredCalls(line, item, options);
    item.inline.forEach((call) => {
      line.appendChild(document.createTextNode(" "));
      line.appendChild(callSpan(call, options));
    });
    group.appendChild(line);
    if (item.after.length) group.appendChild(callRow(item.after, "is-after", options));
    list.appendChild(group);
  });
  container.appendChild(list);
  return list;
}
