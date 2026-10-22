// 全体検索と歌詞検索で共通の見た目・操作部品（2026-10-23新設）。
// 「最初は10件、もっと見るで10件ずつ」「結果は複数同時に開ける」「一致箇所のハイライト」を
// 両方の画面で同じ操作感にするため、部品をここにまとめている。
// 文字はすべて textContent で入れる（データや歌詞の文字をHTMLとして解釈させないため）。

export const SEARCH_PAGE_SIZE = 10;

// 入力のたびに即検索すると重くなりやすいので、入力が止まってから少しだけ待って実行する
export function debounce(callback, waitMs) {
  let timerId = null;
  const debounced = (...args) => {
    clearTimeout(timerId);
    timerId = setTimeout(() => callback(...args), waitMs);
  };
  debounced.cancel = () => clearTimeout(timerId);
  return debounced;
}

// 同じ利用中だけ覚えておく検索の状態（保存はしない。再読み込みで初期化される）
export function createSearchSessionState(extra = {}) {
  return { query: "", visibleCount: SEARCH_PAGE_SIZE, expandedKeys: new Set(), ...extra };
}

// text のうち ranges（[{start,end}]、元の文字列の位置）をハイライトして parent に入れる
export function appendHighlightedText(parent, text, ranges = []) {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let cursor = 0;
  sorted.forEach(({ start, end }) => {
    if (end <= cursor) return;
    const from = Math.max(start, cursor);
    if (from > cursor) parent.appendChild(document.createTextNode(text.slice(cursor, from)));
    const mark = document.createElement("mark");
    mark.className = "search-highlight";
    mark.textContent = text.slice(from, end);
    parent.appendChild(mark);
    cursor = end;
  });
  if (cursor < text.length) parent.appendChild(document.createTextNode(text.slice(cursor)));
}

// 「もっと見る（残りN件）」ボタン。全部見えているときは何も出さない。
export function buildMoreButton(visibleCount, totalCount, onClick) {
  const remaining = totalCount - visibleCount;
  if (remaining <= 0) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-more-button";
  button.textContent = `もっと見る（残り${remaining}件）`;
  button.addEventListener("click", onClick);
  return button;
}

// 開閉できる結果カード。見出し（buildHeader）は常に表示し、中身（buildBody）は開いたときだけ作る。
// 複数のカードを同時に開ける（本人資料の確定仕様）。開閉状態は呼び出し側の Set（expandedKeys）で持つ。
export function buildExpandableResult({ key, expandedKeys, className = "", buildHeader, buildBody }) {
  const item = document.createElement("li");
  item.className = `search-result-item ${className}`.trim();
  item.dataset.resultKey = key;

  const header = document.createElement("button");
  header.type = "button";
  header.className = "search-result-header";
  buildHeader(header);
  const chevron = document.createElement("span");
  chevron.className = "search-result-chevron";
  chevron.setAttribute("aria-hidden", "true");
  header.appendChild(chevron);
  item.appendChild(header);

  const body = document.createElement("div");
  body.className = "search-result-body";
  item.appendChild(body);

  const apply = () => {
    const expanded = expandedKeys.has(key);
    header.setAttribute("aria-expanded", String(expanded));
    item.classList.toggle("is-expanded", expanded);
    body.hidden = !expanded;
    if (expanded && body.childElementCount === 0) buildBody(body);
  };
  header.addEventListener("click", () => {
    if (expandedKeys.has(key)) expandedKeys.delete(key);
    else expandedKeys.add(key);
    apply();
  });
  apply();
  return item;
}

// 外部の公式リンク（別タブ＋opener遮断で開く。既存のリンクボタンと同じ見た目）
export function buildExternalLinkRow(links) {
  const row = document.createElement("div");
  row.className = "search-result-links";
  (links ?? []).forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "official-link-button search-result-link";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    row.appendChild(anchor);
  });
  return row;
}
