// 歌詞検索画面（2026-10-23新設）。歌詞の一部から曲を探す（曲名が分からないとき・歌詞クイズの予習用）。
// 歌詞は端末内に読み込み済みの歌詞データ（js/lyricsStorage.js）を読み取るだけで、新しいデータは作らない。
// 歌詞本文・検索語はどこにも送らず、保存もしない（本人資料の仕様）。
//
// 操作感は全体検索（js/appSearchScreen.js）と揃えている：即時検索・最初は10件＋もっと見る・
// 複数の曲の全文を同時に開ける・同じ利用中は状態を保持（保存はしない）。
import { SONGS } from "./data/songs.js";
import { getAllLyricsData } from "./lyricsStorage.js";
import { getAvailableSongIds, AVAILABLE_DATA_KIND } from "./availableSongs.js";
import { buildLyricsSearchIndex, searchLyrics, LYRICS_SEARCH_MIN_QUERY_LENGTH } from "./lyricsSearch.js";
import { SEARCH_PAGE_SIZE, createSearchSessionState, debounce, appendHighlightedText, buildMoreButton } from "./searchResultUi.js";

const INPUT_DEBOUNCE_MS = 150;

let elements = null;
let callbacks = {};
let index = [];
let indexSignature = null; // 索引を作ったときの歌詞データの目印（曲ID・内容のハッシュ・更新時刻）
let audioSongIds = new Set();
let loadState = "idle"; // idle / loaded / error
const state = createSearchSessionState();

function buildLine(text, ranges, className) {
  const line = document.createElement("p");
  line.className = className;
  appendHighlightedText(line, text, ranges);
  return line;
}

function buildListenButton(songId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "search-result-action is-secondary";
  button.textContent = "曲を聴く →";
  button.addEventListener("click", () => callbacks.onOpenSong?.(songId));
  return button;
}

function buildAudioNote(songId) {
  if (audioSongIds.has(songId)) return null;
  const note = document.createElement("p");
  note.className = "lyrics-search-audio-note";
  note.textContent = "この曲の音源はまだ読み込まれていません（「曲を聴く」では曲の情報だけ確認できます）。";
  return note;
}

function buildFullLyrics(result) {
  const container = document.createElement("div");
  container.className = "lyrics-search-full";
  result.lines.forEach((text, lineIndex) => {
    container.appendChild(buildLine(text, result.highlightsByLine?.get(lineIndex) ?? [], "lyrics-search-full-line"));
  });
  return container;
}

// 1曲分の結果カード。一致箇所（最初の3か所）は常に見せ、全文は「歌詞全文を表示」で開く（複数曲同時に開ける）
function buildResultCard(result) {
  const item = document.createElement("li");
  item.className = "search-result-item lyrics-search-result";
  item.dataset.songId = result.songId;

  const heading = document.createElement("div");
  heading.className = "lyrics-search-result-heading";
  const title = document.createElement("span");
  title.className = "search-result-title";
  title.textContent = result.title;
  heading.appendChild(title);
  const count = document.createElement("span");
  count.className = "lyrics-search-match-count";
  count.textContent = `一致 ${result.matchCount}か所`;
  heading.appendChild(count);
  item.appendChild(heading);

  const snippetList = document.createElement("ul");
  snippetList.className = "lyrics-search-snippets";
  result.snippets.forEach((snippet) => {
    const snippetItem = document.createElement("li");
    snippetItem.className = "lyrics-search-snippet";
    snippet.forEach((line) => snippetItem.appendChild(buildLine(line.text, line.ranges, "lyrics-search-snippet-line")));
    snippetList.appendChild(snippetItem);
  });
  item.appendChild(snippetList);
  if (result.matchCount > result.snippets.length) {
    const rest = document.createElement("p");
    rest.className = "lyrics-search-more-note";
    rest.textContent = `ほか${result.matchCount - result.snippets.length}か所（全文表示ですべて確認できます）`;
    item.appendChild(rest);
  }

  const actions = document.createElement("div");
  actions.className = "lyrics-search-actions";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "search-result-action";
  actions.appendChild(toggle);
  actions.appendChild(buildListenButton(result.songId));
  item.appendChild(actions);

  const audioNote = buildAudioNote(result.songId);
  if (audioNote) item.appendChild(audioNote);

  const full = document.createElement("div");
  full.className = "lyrics-search-full-wrapper";
  item.appendChild(full);

  const apply = () => {
    const expanded = state.expandedKeys.has(result.songId);
    toggle.textContent = expanded ? "歌詞全文を閉じる" : "歌詞全文を表示";
    toggle.setAttribute("aria-expanded", String(expanded));
    full.hidden = !expanded;
    // 全文は開いたときだけ作る（たくさんの曲が一致しても重くならないように）
    if (expanded && full.childElementCount === 0) full.appendChild(buildFullLyrics(result));
  };
  toggle.addEventListener("click", () => {
    if (state.expandedKeys.has(result.songId)) state.expandedKeys.delete(result.songId);
    else state.expandedKeys.add(result.songId);
    apply();
  });
  apply();
  return item;
}

function renderSimilar(similar) {
  elements.similar.innerHTML = "";
  elements.similar.hidden = similar.length === 0;
  if (similar.length === 0) return;
  const heading = document.createElement("p");
  heading.className = "search-suggestions-title";
  heading.textContent = "似ている歌詞の候補（入力した言葉とは完全には一致していません）";
  elements.similar.appendChild(heading);
  const list = document.createElement("ul");
  list.className = "search-result-list";
  similar.forEach((candidate) => {
    const item = document.createElement("li");
    item.className = "search-result-item lyrics-search-similar";
    const title = document.createElement("p");
    title.className = "search-result-title";
    title.textContent = candidate.title;
    item.appendChild(title);
    const line = document.createElement("p");
    line.className = "lyrics-search-snippet-line is-similar";
    line.textContent = candidate.lineText;
    item.appendChild(line);
    const actions = document.createElement("div");
    actions.className = "lyrics-search-actions";
    actions.appendChild(buildListenButton(candidate.songId));
    item.appendChild(actions);
    list.appendChild(item);
  });
  elements.similar.appendChild(list);
}

function render() {
  elements.clearButton.hidden = state.query === "";
  elements.resultList.innerHTML = "";
  elements.moreRow.innerHTML = "";
  renderSimilar([]);

  // 歌詞データが1曲も無い場合は、読み込み方を案内する（再生用の音源は無くても検索できる）
  const hasLyrics = index.length > 0;
  elements.notInstalled.hidden = hasLyrics || loadState !== "loaded";
  elements.input.disabled = !hasLyrics;
  if (loadState === "error") {
    elements.status.textContent = "歌詞データを読み込めませんでした。アプリを開き直してからもう一度お試しください。";
    return;
  }
  if (!hasLyrics) {
    elements.status.textContent = "";
    return;
  }

  const { status, results, similar } = searchLyrics(index, state.query);
  const scope = index.length < SONGS.length ? `歌詞データがある${index.length}曲から探します。` : `全${index.length}曲の歌詞から探します。`;
  if (status === "empty") {
    elements.status.textContent = `歌詞の一部を入力してください。${scope}`;
    return;
  }
  if (status === "tooShort") {
    elements.status.textContent = `${LYRICS_SEARCH_MIN_QUERY_LENGTH}文字以上入力してください。`;
    return;
  }
  if (results.length === 0) {
    elements.status.textContent = `「${state.query.trim()}」を含む歌詞は見つかりませんでした。`;
    renderSimilar(similar);
    return;
  }

  const visible = results.slice(0, state.visibleCount);
  elements.status.textContent = `一致した曲 ${visible.length}曲 / ${results.length}曲`;
  visible.forEach((result) => elements.resultList.appendChild(buildResultCard(result)));
  const moreButton = buildMoreButton(visible.length, results.length, () => {
    state.visibleCount += SEARCH_PAGE_SIZE;
    render();
  });
  if (moreButton) elements.moreRow.appendChild(moreButton);
}

function applyQuery(query) {
  if (query === state.query) return;
  state.query = query;
  state.visibleCount = SEARCH_PAGE_SIZE;
  state.expandedKeys.clear();
  render();
}

function resetSearch() {
  state.query = "";
  state.visibleCount = SEARCH_PAGE_SIZE;
  state.expandedKeys.clear();
  elements.input.value = "";
  render();
  elements.input.focus();
}

// 画面を開くたびに呼ぶ。端末内の歌詞データを読み直す（データ管理で歌詞を追加した直後でも反映されるように）。
// 歌詞データはここで読み取るだけで、変更・保存はしない。
export async function openLyricsSearchScreen() {
  if (loadState !== "loaded") {
    elements.input.value = state.query;
    elements.status.textContent = "歌詞データを読み込んでいます…";
  }
  try {
    const [records, audioIds] = await Promise.all([getAllLyricsData(), getAvailableSongIds(AVAILABLE_DATA_KIND.AUDIO)]);
    // 索引づくり（全曲の歌詞を1文字ずつ正規化）は重いので、歌詞データが前回と同じなら作り直さない（レビュー指摘）
    const signature = records.map((record) => `${record.songId}:${record.contentHash ?? ""}:${record.updatedAt ?? ""}`).sort().join("|");
    if (signature !== indexSignature || loadState !== "loaded") {
      index = buildLyricsSearchIndex(records, SONGS);
      indexSignature = signature;
    }
    audioSongIds = new Set(audioIds);
    loadState = "loaded";
  } catch (error) {
    console.warn("歌詞検索：歌詞データの読み込みに失敗しました", error);
    index = [];
    indexSignature = null;
    loadState = "error";
  }
  elements.input.value = state.query;
  render();
}

export function shouldFocusLyricsSearchInput() {
  return state.query === "" && index.length > 0;
}

export function focusLyricsSearchInput() {
  elements.input.focus();
}

// elements: { input, clearButton, status, notInstalled, openDataButton, resultList, moreRow, similar }
// options.onOpenSong(songId): 「曲を聴く」→ 収録曲一覧の該当曲へ（自動再生はしない）
// options.onOpenDataManagement(): 歌詞データ未導入時の「データ管理を開く」
export function initLyricsSearchScreen(newElements, options = {}) {
  elements = newElements;
  callbacks = options;
  const runSearch = debounce(() => applyQuery(elements.input.value), INPUT_DEBOUNCE_MS);
  elements.input.addEventListener("input", runSearch);
  elements.input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      runSearch.cancel();
      applyQuery(elements.input.value);
      elements.input.blur();
    }
  });
  elements.clearButton.addEventListener("click", resetSearch);
  elements.openDataButton.addEventListener("click", () => callbacks.onOpenDataManagement?.());
}
