// 特別モード一覧画面を担当するファイル。
// 通常プレイ（スタート画面）とは別の遊び方（苦手曲モード等）を、まとめて選べる入口画面。
// モードが増えるときは、下のSPECIAL_MODESに1件追加するだけで一覧に反映される。

// 各モードの定義。availableがfalseのものは「近日追加予定」の見た目にし、タップできないようにする。
// ホーム画面の8カード（下のHOME_SPECIAL_MODES_ORDER）と、この後の一覧画面（#special-modes-screen）
// は、どちらもこの配列だけを情報源にする（タイトル・説明・利用可否の二重管理を避けるため）。
export const SPECIAL_MODES = [
  {
    id: "weakSongs",
    title: "苦手曲モード",
    description: "正答率が低い曲を中心に練習できます",
    available: true,
  },
  {
    id: "originalQuiz",
    title: "オリジナル問題作成モード",
    description: "好きな曲だけの問題セットを作れます",
    available: true,
  },
  {
    id: "timeAttack",
    title: "タイムアタック",
    description: "クリアタイムを記録できます",
    available: true,
  },
  {
    id: "randomPlayback",
    title: "ランダム再生クイズ",
    description: "曲の途中のランダムな位置から出題されます",
    available: true,
  },
  {
    id: "liveCallMode",
    title: "ライブコールモード",
    description: "歌詞と一緒にコールのタイミングを確認できます",
    available: true,
  },
  {
    id: "lyricsQuiz",
    title: "歌詞クイズ",
    description: "歌詞の一部分をヒントに曲名を当てます",
    available: true,
  },
  {
    id: "localBattle",
    title: "対戦モード",
    description: "友達と同じ問題でタイムアタックを競えます",
    available: true,
  },
  {
    id: "onlineBattle",
    title: "オンライン対戦",
    description: "ルームを作って、離れた場所の友達と対戦できます",
    available: true,
  },
];

// この画面が使うDOM要素一式。initSpecialModesScreen()で受け取って保持する。
let elements = null;

// 利用可能なモードのカード。タップするとonSelectModeコールバックを呼ぶ。
// カード全体を<button>にすると、右上の「？」ヘルプボタン（<button>の中には
// <button>を入れられない）を置けないため、外側は<div>にし、選択用のタップ領域だけを
// 内側の<button>（special-mode-card-tap-target）に分けている（js/membersScreen.jsの
// member-card/member-card-tap-targetと同じ構造パターン）。
function buildAvailableCard(mode) {
  const card = document.createElement("div");
  card.className = "special-mode-card";

  const tapTarget = document.createElement("button");
  tapTarget.type = "button";
  tapTarget.className = "special-mode-card-tap-target";
  tapTarget.addEventListener("click", () => elements.onSelectMode(mode.id));

  const content = document.createElement("div");
  content.className = "special-mode-card-content";

  const title = document.createElement("p");
  title.className = "special-mode-card-title";
  title.textContent = mode.title;
  content.appendChild(title);

  const description = document.createElement("p");
  description.className = "special-mode-card-description";
  description.textContent = mode.description;
  content.appendChild(description);

  tapTarget.appendChild(content);

  // プレイ履歴カードと同じ、「タップで進める」ことを示すシェブロン。
  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "special-mode-card-chevron");
  chevron.setAttribute("viewBox", "0 0 24 24");
  chevron.setAttribute("fill", "none");
  chevron.setAttribute("aria-hidden", "true");
  const chevronPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
  chevronPath.setAttribute("d", "M9 5 16 12 9 19");
  chevronPath.setAttribute("stroke", "currentColor");
  chevronPath.setAttribute("stroke-width", "2.4");
  chevronPath.setAttribute("stroke-linecap", "round");
  chevronPath.setAttribute("stroke-linejoin", "round");
  chevron.appendChild(chevronPath);
  tapTarget.appendChild(chevron);

  card.appendChild(tapTarget);

  // このモードについての詳しい説明を開く「？」ボタン。tapTargetの外の兄弟要素にすることで、
  // タップしてもカード選択（onSelectMode）が同時に発火しないようにしている。
  const helpButton = document.createElement("button");
  helpButton.type = "button";
  helpButton.className = "special-mode-card-help-button";
  helpButton.setAttribute("aria-label", `${mode.title}について見る`);
  helpButton.textContent = "？";
  helpButton.addEventListener("click", (event) => {
    event.stopPropagation();
    elements.onShowHelp(mode.id);
  });
  card.appendChild(helpButton);

  return card;
}

// まだ実装されていないモードのカード。タップできない見た目にし、「近日追加予定」を添える。
function buildComingSoonCard(mode) {
  const card = document.createElement("div");
  card.className = "special-mode-card is-coming-soon";

  const content = document.createElement("div");
  content.className = "special-mode-card-content";

  const title = document.createElement("p");
  title.className = "special-mode-card-title";
  title.textContent = mode.title;
  content.appendChild(title);

  const description = document.createElement("p");
  description.className = "special-mode-card-description";
  description.textContent = mode.description;
  content.appendChild(description);

  card.appendChild(content);

  const badge = document.createElement("span");
  badge.className = "special-mode-card-badge";
  badge.textContent = "近日追加予定";
  card.appendChild(badge);

  return card;
}

function renderSpecialModesList() {
  elements.listContainer.innerHTML = "";
  SPECIAL_MODES.forEach((mode) => {
    const card = mode.available ? buildAvailableCard(mode) : buildComingSoonCard(mode);
    elements.listContainer.appendChild(card);
  });
}

// ホーム画面に8モードを2列×4段で直接表示するための並び順（2026-08-07、本人指定）。
// タイトル・説明・利用可否などの中身は一切ここに書かず、SPECIAL_MODESから探して使う
// （並び順だけがホーム専用で、内容は一覧画面と共通の1つの情報源から自動生成される）。
export const HOME_SPECIAL_MODES_ORDER = [
  "randomPlayback",
  "lyricsQuiz",
  "timeAttack",
  "onlineBattle",
  "originalQuiz",
  "liveCallMode",
  "weakSongs",
  "localBattle",
];

function renderHomeSpecialModesGrid() {
  if (!elements.homeGridContainer) return;
  elements.homeGridContainer.innerHTML = "";
  HOME_SPECIAL_MODES_ORDER.forEach((modeId) => {
    const mode = SPECIAL_MODES.find((entry) => entry.id === modeId);
    if (!mode) return; // 定義漏れがあっても画面が壊れないようにする（本来起きない想定）
    const card = mode.available ? buildAvailableCard(mode) : buildComingSoonCard(mode);
    elements.homeGridContainer.appendChild(card);
  });
}

// 特別モード一覧画面・ホーム画面の8カードを使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
// 内容（SPECIAL_MODES）は固定なので、履歴画面などと違い、開くたびに描画し直す必要はない。
//
// elements: {
//   listContainer: 従来の一覧画面（#special-modes-screen）でモードカードを並べる入れ物,
//   homeGridContainer: ホーム画面で8モードを2列×4段に並べる入れ物,
//   onSelectMode: 利用可能なモードのカードがタップされたときに呼ばれるコールバック（modeIdを受け取る）,
//   onShowHelp: モードカードの「？」ボタンがタップされたときに呼ばれるコールバック（modeIdを受け取る）,
// }
export function initSpecialModesScreen(newElements) {
  elements = newElements;
  renderSpecialModesList();
  renderHomeSpecialModesGrid();
}
