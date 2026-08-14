// タイムアタックのグローバルランキング（TOP10）画面を担当するファイル。
// データの取得・比較・並び替えはjs/timeAttackLeaderboardSync.js・js/timeAttackLeaderboard.jsに
// 任せ、このファイルは「取得した結果をどう画面に組み立てるか」だけに専念する。
//
// 【UI統一方針、本人指示】推しアイコン・王冠/ダイヤ装飾は、js/fanProfileCard.jsの
// buildOshiSwatch()をそのまま再利用する（みんなのプロフィール一覧・メンバーカードと
// 同じ見た目・同じ関数にすることで、3種類バラバラの実装にしない）。
import { buildOshiSwatch } from "./fanProfileCard.js";
import { getMemberById } from "./memberUtils.js";
import {
  fetchTimeAttackLeaderboardTop10,
  fetchMyTimeAttackLeaderboardEntry,
} from "./timeAttackLeaderboardSync.js";
import { fetchPublicProfileBadgeState } from "./publicProfileSync.js";
import { TIME_ATTACK_VARIANT, TIME_ATTACK_RULE } from "./timeAttackScreen.js";

const VARIANT_LABELS = { [TIME_ATTACK_VARIANT.INTRO]: "🎧イントロ", [TIME_ATTACK_VARIANT.RANDOM_PLAYBACK]: "🔀ランダム再生" };
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全曲" };
const QUESTION_COUNT_ORDER = ["5", "10", "20", "50", "all"];

// 【2026-08-16追加】ルール・カテゴリー別のタブ。ラベルはjs/main.jsのRULE_LABELS・
// CATEGORY_LABELSと表記を揃える（同じ概念に別の呼び方をしない）。
const RULE_LABELS = {
  [TIME_ATTACK_RULE.NORMAL]: "ノーマル",
  [TIME_ATTACK_RULE.HARD]: "ハード",
  [TIME_ATTACK_RULE.LOVE_CHAIN]: "LOVE連チャン",
};
const RULE_ORDER = [TIME_ATTACK_RULE.NORMAL, TIME_ATTACK_RULE.HARD, TIME_ATTACK_RULE.LOVE_CHAIN];

const CATEGORY_LABELS = { "title-track": "表題のみ", "title-and-group": "表題＋全員", all: "全曲" };
const CATEGORY_ORDER = ["title-track", "title-and-group", "all"];

let elements = null;
let members = [];
let currentVariant = TIME_ATTACK_VARIANT.INTRO;
let currentRule = TIME_ATTACK_RULE.LOVE_CHAIN;
let currentQuestionCountValue = "5";
let currentCategoryFilterValue = "all";
// 連打・タブ切り替え中の描画競合を防ぐための世代番号（js/audio.jsのcurrentPlaybackTokenと
// 同じ考え方）。古い非同期取得が後から戻ってきても、世代が古ければ描画結果を捨てる。
let renderToken = 0;

function formatSeconds(ms) {
  return (ms / 1000).toFixed(2);
}

function buildRankBadge(rank) {
  const badge = document.createElement("span");
  badge.className = "leaderboard-rank-badge";
  if (rank === 1) badge.classList.add("is-gold");
  else if (rank === 2) badge.classList.add("is-silver");
  else if (rank === 3) badge.classList.add("is-bronze");
  badge.textContent = String(rank);
  return badge;
}

function buildLeaderboardRow(entry, rank, badgeState, isOwnRow) {
  const row = document.createElement("div");
  row.className = "leaderboard-row";
  row.classList.toggle("is-own-row", isOwnRow);

  row.appendChild(buildRankBadge(rank));
  row.appendChild(buildOshiSwatch(members, entry.oshiMemberId, badgeState));

  const body = document.createElement("div");
  body.className = "leaderboard-row-body";

  const name = document.createElement("p");
  name.className = "leaderboard-row-name";
  name.textContent = entry.displayName;
  body.appendChild(name);

  const oshiMember = entry.oshiMemberId ? getMemberById(members, entry.oshiMemberId) : null;
  const oshi = document.createElement("p");
  oshi.className = "leaderboard-row-oshi";
  oshi.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  body.appendChild(oshi);

  row.appendChild(body);

  const time = document.createElement("p");
  time.className = "leaderboard-row-time";
  time.textContent = `${formatSeconds(entry.clearTimeMs)}秒`;
  row.appendChild(time);

  return row;
}

function buildTabButton(label, isActive, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "leaderboard-tab-button";
  button.classList.toggle("is-active", isActive);
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderTabs() {
  elements.variantTabs.innerHTML = "";
  Object.values(TIME_ATTACK_VARIANT).forEach((variant) => {
    elements.variantTabs.appendChild(
      buildTabButton(VARIANT_LABELS[variant], variant === currentVariant, () => {
        currentVariant = variant;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  // 【2026-08-16追加】ルールタブ。
  elements.ruleTabs.innerHTML = "";
  RULE_ORDER.forEach((rule) => {
    elements.ruleTabs.appendChild(
      buildTabButton(RULE_LABELS[rule], rule === currentRule, () => {
        currentRule = rule;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  elements.questionCountTabs.innerHTML = "";
  QUESTION_COUNT_ORDER.forEach((questionCountValue) => {
    elements.questionCountTabs.appendChild(
      buildTabButton(QUESTION_COUNT_LABELS[questionCountValue], questionCountValue === currentQuestionCountValue, () => {
        currentQuestionCountValue = questionCountValue;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });

  // 【2026-08-16追加】カテゴリータブ。
  elements.categoryTabs.innerHTML = "";
  CATEGORY_ORDER.forEach((categoryFilterValue) => {
    elements.categoryTabs.appendChild(
      buildTabButton(CATEGORY_LABELS[categoryFilterValue], categoryFilterValue === currentCategoryFilterValue, () => {
        currentCategoryFilterValue = categoryFilterValue;
        renderTabs();
        loadAndRenderLeaderboard();
      })
    );
  });
}

function setStateVisibility({ loading, offline, empty, list }) {
  elements.loadingState.hidden = !loading;
  elements.offlineState.hidden = !offline;
  elements.emptyState.hidden = !empty;
  elements.listContainer.hidden = !list;
}

// TOP10各行の王冠・ダイヤ装飾を、みんなのプロフィールと同じ見た目で添える（可能なら、の対応）。
// 本人指示「全ユーザー件数を毎回取得しないこと」を守るため、今回表示する最大10人分だけを
// 並行して個別取得する（全件ダウンロードにはしない）。1件でも失敗しても他の行の表示は続ける。
async function fetchBadgeStatesForEntries(entries) {
  const results = await Promise.all(
    entries.map((entry) =>
      fetchPublicProfileBadgeState(entry.uid).catch(() => ({
        hasNoMissMaster: false,
        hasEqualLoveMaster: false,
        hasEqualLoveComplete: false,
      }))
    )
  );
  const badgeStateByUid = new Map();
  entries.forEach((entry, index) => badgeStateByUid.set(entry.uid, results[index]));
  return badgeStateByUid;
}

async function loadAndRenderLeaderboard() {
  const myRenderToken = ++renderToken;
  setStateVisibility({ loading: true, offline: false, empty: false, list: false });
  elements.myRecordSection.hidden = true;

  const result = await fetchTimeAttackLeaderboardTop10(
    currentVariant,
    currentRule,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  if (myRenderToken !== renderToken) return; // タブが切り替わった後に古い結果が戻ってきた場合は捨てる

  if (!result.ok) {
    setStateVisibility({ loading: false, offline: true, empty: false, list: false });
    return;
  }

  if (result.entries.length === 0) {
    setStateVisibility({ loading: false, offline: false, empty: true, list: false });
    renderMyRecordIfNeeded(myRenderToken, []);
    return;
  }

  const badgeStateByUid = await fetchBadgeStatesForEntries(result.entries);
  if (myRenderToken !== renderToken) return;

  elements.listContainer.innerHTML = "";
  result.entries.forEach((entry, index) => {
    const rank = index + 1;
    const isOwnRow = elements.currentUid && entry.uid === elements.currentUid;
    elements.listContainer.appendChild(
      buildLeaderboardRow(entry, rank, badgeStateByUid.get(entry.uid), isOwnRow)
    );
  });
  setStateVisibility({ loading: false, offline: false, empty: false, list: true });

  renderMyRecordIfNeeded(myRenderToken, result.entries);
}

// 「あなたの記録」：TOP10にすでに含まれていれば重ねて表示しない。含まれていなければ、
// 自分のuidの記録だけを軽量に取得して「あなたのベスト ○○秒」の形で表示する
// （本人指示：「順位計算が重い場合は、あなたのベストだけでも可」）。
async function renderMyRecordIfNeeded(myRenderToken, top10Entries) {
  const alreadyInTop10 = elements.currentUid && top10Entries.some((entry) => entry.uid === elements.currentUid);
  if (alreadyInTop10) {
    elements.myRecordSection.hidden = true;
    return;
  }

  const myResult = await fetchMyTimeAttackLeaderboardEntry(
    currentVariant,
    currentRule,
    currentQuestionCountValue,
    currentCategoryFilterValue
  );
  if (myRenderToken !== renderToken) return;
  elements.currentUid = myResult.uid ?? elements.currentUid;

  if (!myResult.ok || !myResult.entry) {
    elements.myRecordSection.hidden = true;
    return;
  }

  elements.myRecordText.textContent = `あなたのベスト：${formatSeconds(myResult.entry.clearTimeMs)}秒`;
  elements.myRecordSection.hidden = false;
}

// タイムアタック設定画面・結果画面から呼ぶ入口。直前にプレイした条件を最初に表示する
// （本人指示：「直前にプレイした条件のランキングを最初に表示」）。
// 【2026-08-16追加】rule・categoryFilterValueにも対応。未指定・不正な値は安全な既定値
// （LOVE連チャン・全曲）にフォールバックする。
export function showTimeAttackLeaderboard(variant, rule, questionCountValue, categoryFilterValue) {
  currentVariant = variant ?? TIME_ATTACK_VARIANT.INTRO;
  currentRule = RULE_ORDER.includes(rule) ? rule : TIME_ATTACK_RULE.LOVE_CHAIN;
  currentQuestionCountValue = QUESTION_COUNT_ORDER.includes(questionCountValue) ? questionCountValue : "5";
  currentCategoryFilterValue = CATEGORY_ORDER.includes(categoryFilterValue) ? categoryFilterValue : "all";
  renderTabs();
  loadAndRenderLeaderboard();
}

// elements: {
//   variantTabs, ruleTabs, questionCountTabs, categoryTabs: タブボタンを並べるコンテナ,
//   loadingState, offlineState, emptyState: 状態ごとの案内文,
//   listContainer: TOP10の行を並べる場所,
//   myRecordSection, myRecordText: 「あなたの記録」欄,
//   backButton, onBack,
// }
export function initTimeAttackLeaderboardScreen(newElements, membersList) {
  elements = { ...newElements, currentUid: null };
  members = membersList;
  elements.backButton.addEventListener("click", () => elements.onBack?.());
}
