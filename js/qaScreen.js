// 「質問AI」の画面（#qa-screen。2026-11-03新設・R11-C）。全体検索とは別の、独立した画面。
// ・質問を入れて［質問する］（Enter でも。日本語入力の変換中の Enter は無視）→ 答えのカード（短い答え・詳しく・根拠・開く先）
// ・おすすめ質問（カテゴリ別）：押すとその質問で答える。答えられることをテストした質問だけ（js/data/qaSuggestions.js）
// ・質問は外に送らず、保存もしない（履歴を持たない）。画面を離れて戻ったときは、最後の質問と答えをそのまま出す
// 文字はすべて textContent で入れる（HTML として解釈しない）。開く先の移動は main.js（openSearchTarget）が行う。
import { answerQuestion, prepareQaSearch, QA_STATUS, formatQaDate } from "./qaEngine.js";
import { QA_SUGGESTION_CATEGORIES } from "./data/qaSuggestions.js";

export const QA_TITLE = "質問AI";
export const QA_DISCLAIMER = "生成AIではありません。アプリに登録された情報から、決まった形で答えます。質問は外に送らず、保存もしません。";
const STATUS_LABELS = {
  [QA_STATUS.ANSWER]: "答え",
  [QA_STATUS.CANDIDATES]: "候補",
  [QA_STATUS.NOT_FOUND]: "確認できません",
  [QA_STATUS.REFUSE]: "答えられません",
  [QA_STATUS.UNKNOWN]: "読み取れません",
};

let container = null;
let callbacks = {};
let built = false;
const parts = {};
const state = { question: "", answer: null, category: QA_SUGGESTION_CATEGORIES[0].id };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function externalLink(className, text, href) {
  const link = el("a", className, text);
  link.href = href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderAnswer() {
  const area = parts.answer;
  area.replaceChildren();
  const answer = state.answer;
  if (!answer) {
    area.hidden = true;
    return;
  }
  area.hidden = false;
  area.dataset.status = answer.status;
  const card = el("article", `qa-card is-${answer.status}`);
  card.setAttribute("aria-live", "polite");
  const head = el("div", "qa-card-head");
  head.append(el("span", `qa-badge is-${answer.status}`, STATUS_LABELS[answer.status] ?? ""), el("span", "qa-card-question", `Q. ${answer.question}`));
  card.appendChild(head);
  const text = el("p", "qa-card-text", answer.text);
  text.id = "qa-answer-text";
  // 長い答え（「どんな人？」の紹介など）は、太字をやめて読みやすくする
  if (answer.text.length > 80) text.classList.add("is-long");
  text.tabIndex = -1;
  card.appendChild(text);
  if (answer.details.length) {
    const list = el("ul", "qa-details");
    answer.details.forEach((line) => list.appendChild(el("li", null, line)));
    card.appendChild(list);
  }
  if (answer.candidates.length) {
    const list = el("div", "qa-candidates");
    answer.candidates.forEach((candidate) => {
      const button = el("button", "qa-candidate", candidate.label);
      button.type = "button";
      if (candidate.sublabel) button.appendChild(el("span", "qa-candidate-sub", candidate.sublabel));
      button.addEventListener("click", () => {
        if (candidate.question) ask(candidate.question);
        else if (candidate.target) callbacks.onOpenTarget?.(candidate.target);
      });
      list.appendChild(button);
    });
    card.appendChild(list);
  }
  if (answer.links.length) {
    const row = el("div", "qa-links");
    answer.links.forEach((link) => {
      if (link.url) {
        row.appendChild(externalLink("qa-link is-external", link.label, link.url));
        return;
      }
      const button = el("button", "qa-link", `${link.label} →`);
      button.type = "button";
      button.addEventListener("click", () => callbacks.onOpenTarget?.(link.target));
      row.appendChild(button);
    });
    card.appendChild(row);
  }
  if (answer.evidence.length) {
    const box = el("details", "qa-evidence");
    box.appendChild(el("summary", null, "根拠（どの情報から答えたか）"));
    const list = el("ul");
    answer.evidence.forEach((item) => {
      const li = el("li", null, `${item.label}${item.checkedAt ? `（${formatQaDate(item.checkedAt)} 確認）` : ""}`);
      item.urls.forEach((url, index) => {
        li.appendChild(document.createTextNode(" "));
        li.appendChild(externalLink("qa-source", `出典${index + 1}`, url));
      });
      list.appendChild(li);
    });
    box.appendChild(list);
    card.appendChild(box);
  }
  if (answer.note) card.appendChild(el("p", "qa-note", answer.note));
  card.appendChild(el("p", "qa-time", `答えるのにかかった時間：${answer.tookMs}ms（端末の中で計算）`));
  area.appendChild(card);
}

async function ask(question) {
  const text = String(question ?? "").trim();
  state.question = text;
  parts.input.value = text;
  if (!text) {
    state.answer = null;
    renderAnswer();
    parts.input.focus();
    return;
  }
  parts.submit.disabled = true;
  try {
    await prepareQaSearch();
  } catch (error) {
    // 全体検索を読み込めなくても、型に当たる質問には答えられる（候補だけが出なくなる）
  }
  state.answer = answerQuestion(text);
  parts.submit.disabled = false;
  renderAnswer();
  parts.answer.scrollIntoView?.({ block: "nearest" });
  document.getElementById("qa-answer-text")?.focus({ preventScroll: true });
}

function renderSuggestions() {
  parts.tabs.querySelectorAll(".qa-suggest-tab").forEach((button) => {
    const active = button.dataset.category === state.category;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
    button.tabIndex = active ? 0 : -1;
  });
  const category = QA_SUGGESTION_CATEGORIES.find((entry) => entry.id === state.category);
  parts.suggestList.replaceChildren();
  category.questions.forEach((question) => {
    const button = el("button", "qa-suggest", question);
    button.type = "button";
    button.addEventListener("click", () => ask(question));
    parts.suggestList.appendChild(button);
  });
  parts.suggestNote.textContent = category.needs === "youtube"
    ? "YouTube 出演のデータを読み込めたときに答えます。"
    : category.needs === "news"
      ? "最新情報（公式 NEWS）を読み込めたときに答えます。読み込めないときは、そう答えます。"
      : "";
  parts.suggestNote.hidden = !parts.suggestNote.textContent;
}

function build() {
  container.replaceChildren();
  container.appendChild(el("p", "qa-disclaimer", QA_DISCLAIMER));
  const form = el("form", "qa-form");
  form.setAttribute("role", "search");
  form.noValidate = true;
  const input = el("input", "qa-input");
  input.type = "text";
  input.id = "qa-input";
  input.enterKeyHint = "send";
  input.autocomplete = "off";
  input.placeholder = window.innerWidth < 360 ? "例：呪って呪っては何枚目？" : "例：呪って呪っては何枚目のシングル？";
  input.setAttribute("aria-label", "質問を入れる");
  input.maxLength = 120;
  const submit = el("button", "qa-submit", "質問する");
  submit.type = "submit";
  form.append(input, submit);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    ask(input.value);
  });
  // 日本語入力の変換を確定する Enter では送らない
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.stopPropagation();
  });
  container.appendChild(form);
  parts.input = input;
  parts.submit = submit;
  parts.answer = el("section", "qa-answer");
  parts.answer.setAttribute("aria-label", "答え");
  parts.answer.hidden = true;
  container.appendChild(parts.answer);

  const suggest = el("section", "qa-suggestions");
  suggest.appendChild(el("h3", "qa-section-title", "聞けることの例（押すと答えます）"));
  parts.tabs = el("div", "qa-suggest-tabs");
  parts.tabs.setAttribute("role", "tablist");
  parts.tabs.setAttribute("aria-label", "質問のカテゴリ");
  QA_SUGGESTION_CATEGORIES.forEach((category) => {
    const button = el("button", "qa-suggest-tab", category.label);
    button.type = "button";
    button.dataset.category = category.id;
    button.setAttribute("role", "tab");
    button.addEventListener("click", () => {
      state.category = category.id;
      renderSuggestions();
    });
    parts.tabs.appendChild(button);
  });
  suggest.appendChild(parts.tabs);
  parts.suggestList = el("div", "qa-suggest-list");
  parts.suggestList.setAttribute("role", "tabpanel");
  suggest.appendChild(parts.suggestList);
  parts.suggestNote = el("p", "qa-suggest-note");
  suggest.appendChild(parts.suggestNote);
  container.appendChild(suggest);

  const limits = el("section", "qa-limits");
  limits.appendChild(el("h3", "qa-section-title", "できること・できないこと"));
  const list = el("ul");
  [
    "曲・メンバー・CD と特典映像・テレビ・CM・ライブ・YouTube 出演・アプリの機能について、アプリに登録された情報から答えます。",
    "登録に無いこと（作詞・作曲者など）や、推測・好みの質問（次のセンターなど）には答えません。",
    "言い方によっては読み取れないことがあります。そのときは候補を出すので、選ぶか言い方を変えてください。",
    "キーワードで一覧を探すときは、ホームの「検索」が便利です。",
  ].forEach((line) => list.appendChild(el("li", null, line)));
  limits.appendChild(list);
  container.appendChild(limits);
  built = true;
  renderSuggestions();
}

// 画面を開く。options.question：その質問で答える
export function openQaScreen(options = {}) {
  if (!container) return;
  if (!built) build();
  prepareQaSearch().catch(() => {});
  if (typeof options.question === "string") ask(options.question);
  else renderAnswer();
}

// elements: { container }。options.onOpenTarget(target)：答えのボタンで、アプリの中のページを開く（main.js）
export function initQaScreen(elements, options = {}) {
  container = elements.container;
  callbacks = { onOpenTarget: options.onOpenTarget ?? null };
}

export function focusQaInput() {
  parts.input?.focus({ preventScroll: true });
}

// テスト用
export function getQaScreenState() {
  return { question: state.question, status: state.answer?.status ?? null, category: state.category };
}
export async function askQaForTest(question) {
  await ask(question);
}
export function resetQaScreenForTest() {
  state.question = "";
  state.answer = null;
  state.category = QA_SUGGESTION_CATEGORIES[0].id;
  built = false;
}
