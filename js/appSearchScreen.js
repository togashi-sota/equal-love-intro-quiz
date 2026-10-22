// 全体検索（アプリ内検索）画面（2026-10-23新設）。「アプリの案内所」として、メンバー・楽曲・CM・ライブ・
// 出演作品・番組・ガイド・機能・設定を横断して探せる。検索の中身は js/appSearchIndex.js が担当し、
// このファイルは入力・絞り込み・結果の表示と、同じ利用中の状態保持だけを行う。
//
// 状態（検索語・カテゴリ・表示件数・開いている結果）はこのファイルの変数にだけ持ち、保存しない
// （検索履歴を残さない＝本人資料の仕様。再読み込みで初期化される）。スクロール位置は
// js/main.js の navigateWithScrollMemory() が画面ごとに覚えて戻す。
import { APP_SEARCH_CATEGORIES, buildAppSearchEntries, searchAppEntries } from "./appSearchIndex.js";
import {
  SEARCH_PAGE_SIZE,
  createSearchSessionState,
  debounce,
  buildMoreButton,
  buildExpandableResult,
  buildExternalLinkRow,
} from "./searchResultUi.js";

const INPUT_DEBOUNCE_MS = 120;

let elements = null;
let onOpenTarget = null;
let entries = [];
const state = createSearchSessionState({ category: "all" });

function resetForNewQuery() {
  state.visibleCount = SEARCH_PAGE_SIZE;
  state.expandedKeys.clear();
}

function buildCategoryChips(countsByCategory, hasQuery) {
  elements.categoryRow.innerHTML = "";
  APP_SEARCH_CATEGORIES.forEach((category) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "search-category-chip";
    chip.dataset.category = category.id;
    const isActive = state.category === category.id;
    chip.classList.toggle("is-active", isActive);
    chip.setAttribute("aria-pressed", String(isActive));
    const count = countsByCategory[category.id] ?? 0;
    chip.textContent = hasQuery ? `${category.label} ${count}` : category.label;
    // 検索語があるのに0件のカテゴリは薄く見せる（押せなくはしない：選んだ理由が分かるよう案内文を出す）
    chip.classList.toggle("is-empty", hasQuery && count === 0);
    chip.addEventListener("click", () => {
      if (state.category === category.id) return;
      state.category = category.id;
      state.visibleCount = SEARCH_PAGE_SIZE;
      render();
    });
    elements.categoryRow.appendChild(chip);
  });
}

function buildResultHeader(header, entry) {
  const tag = document.createElement("span");
  tag.className = `search-result-category is-${entry.category}`;
  tag.textContent = entry.categoryLabel;
  header.appendChild(tag);
  const textBlock = document.createElement("span");
  textBlock.className = "search-result-heading";
  const title = document.createElement("span");
  title.className = "search-result-title";
  title.textContent = entry.title;
  textBlock.appendChild(title);
  if (entry.subtitle) {
    const subtitle = document.createElement("span");
    subtitle.className = "search-result-subtitle";
    subtitle.textContent = entry.subtitle;
    textBlock.appendChild(subtitle);
  }
  header.appendChild(textBlock);
}

function buildResultBody(body, entry) {
  entry.lines.forEach((line) => {
    const paragraph = document.createElement("p");
    paragraph.className = "search-result-line";
    paragraph.textContent = line;
    body.appendChild(paragraph);
  });
  if (entry.links.length > 0) body.appendChild(buildExternalLinkRow(entry.links));
  if (entry.action) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-result-action";
    button.textContent = `${entry.action.label} →`;
    button.addEventListener("click", () => onOpenTarget?.(entry.action.target));
    body.appendChild(button);
  }
}

function renderSuggestions(suggestions) {
  elements.suggestions.innerHTML = "";
  elements.suggestions.hidden = suggestions.length === 0;
  if (suggestions.length === 0) return;
  const heading = document.createElement("p");
  heading.className = "search-suggestions-title";
  heading.textContent = "もしかして（入力した言葉とは完全には一致していません）";
  elements.suggestions.appendChild(heading);
  suggestions.forEach((entry) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-suggestion-button";
    button.textContent = `${entry.title}（${entry.categoryLabel}）`;
    button.addEventListener("click", () => {
      elements.input.value = entry.title;
      applyQuery(entry.title);
    });
    elements.suggestions.appendChild(button);
  });
}

function render() {
  const hasQuery = state.query.trim() !== "";
  const { results, countsByCategory, suggestions } = searchAppEntries(entries, state.query, state.category);
  elements.clearButton.hidden = state.query === "";
  buildCategoryChips(countsByCategory, hasQuery);
  elements.resultList.innerHTML = "";
  elements.moreRow.innerHTML = "";

  if (!hasQuery) {
    // 空欄のときは全件を出さず、何を入力すればよいかだけ案内する
    elements.status.textContent = "検索したい言葉を入力してください（例：メンバー名・曲名・企業名・会場名・機能名）";
    renderSuggestions([]);
    return;
  }
  if (countsByCategory.all === 0) {
    elements.status.textContent = `「${state.query.trim()}」に一致する項目は見つかりませんでした。`;
    renderSuggestions(suggestions);
    return;
  }
  renderSuggestions([]);
  if (results.length === 0) {
    elements.status.textContent = `このカテゴリには一致する項目がありません（すべて：${countsByCategory.all}件）`;
    return;
  }

  const visible = results.slice(0, state.visibleCount);
  elements.status.textContent = `検索結果 ${visible.length}件 / ${results.length}件`;
  visible.forEach(({ entry }) => {
    elements.resultList.appendChild(
      buildExpandableResult({
        key: entry.key,
        expandedKeys: state.expandedKeys,
        buildHeader: (header) => buildResultHeader(header, entry),
        buildBody: (body) => buildResultBody(body, entry),
      })
    );
  });
  const moreButton = buildMoreButton(visible.length, results.length, () => {
    state.visibleCount += SEARCH_PAGE_SIZE;
    render();
  });
  if (moreButton) elements.moreRow.appendChild(moreButton);
}

function applyQuery(query) {
  if (query === state.query) return;
  state.query = query;
  resetForNewQuery();
  render();
}

// 検索欄の「×」：入力・表示件数・開いている結果・カテゴリをすべて初期状態に戻す
function resetSearch() {
  state.query = "";
  state.category = "all";
  resetForNewQuery();
  elements.input.value = "";
  render();
  elements.input.focus();
}

// 画面を開くたびに呼ぶ。前回の検索状態（同じ利用中のみ）をそのまま描き直す。
// 検索データは毎回既存データから組み立て直す（開催予定→日程終了などの表示を最新の日付で判定するため）。
export function openAppSearchScreen() {
  entries = buildAppSearchEntries();
  elements.input.value = state.query;
  render();
}

// 開いた直後に入力欄へカーソルを置くか（前回の検索が残っているときはキーボードを出さない）
export function shouldFocusAppSearchInput() {
  return state.query === "";
}

export function focusAppSearchInput() {
  elements.input.focus();
}

// elements: { input, clearButton, categoryRow, status, resultList, moreRow, suggestions }
// options.onOpenTarget(target): 「ページで詳しく見る」「この機能を開く」が押されたとき（画面遷移は main.js が行う）
export function initAppSearchScreen(newElements, options = {}) {
  elements = newElements;
  onOpenTarget = options.onOpenTarget ?? null;
  const runSearch = debounce(() => applyQuery(elements.input.value), INPUT_DEBOUNCE_MS);
  elements.input.addEventListener("input", runSearch);
  // Enter（スマホの「検索」キー）ではすぐ検索してキーボードを閉じる。日本語の変換確定中のEnterは対象外。
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      runSearch.cancel();
      applyQuery(elements.input.value);
      elements.input.blur();
    }
  });
  elements.clearButton.addEventListener("click", resetSearch);
  render();
}
