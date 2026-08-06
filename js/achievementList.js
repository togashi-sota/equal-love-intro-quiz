// 称号一覧モーダルを担当するファイル（js/titleList.js時代の後継）。
// 開閉ロジック（開く入口・×ボタン・背景クリック・Escキー）はこのファイルにまとめ、
// main.jsは初期化時にinitAchievementListModal()を1回呼ぶだけでよい。
//
// 旧システムと違い、未取得の称号も名前・条件を最初から隠さず表示する（本人指示：
// 「称号は、最初から一覧にすべて表示してください」「説明文も常に読めるようにしてください」）。
// 未取得／取得済みの違いは、CSS側の見た目（グレー・鍵アイコン vs 発光・カラー）だけで表現する。
import { getAchievementListSnapshot } from "./achievementProgress.js";
import { buildAchievementIconMedal, buildLockedAchievementIconMedal } from "./achievementIcons.js";

const CATEGORY_ORDER = ["noMiss", "modeMaster", "backRoute", "composite"];
const CATEGORY_LABELS = {
  noMiss: "ノーミスランク",
  modeMaster: "表マスター",
  backRoute: "裏称号",
  composite: "最終称号",
};

let elements = null;

function isModalOpen() {
  return elements !== null && !elements.overlay.hidden;
}

function open() {
  renderAchievementList();
  elements.modalCard.scrollTop = 0;
  elements.overlay.hidden = false;
}

function close() {
  elements.overlay.hidden = true;
}

function handleKeydown(event) {
  if (event.key !== "Escape") return;
  if (!isModalOpen()) return;
  close();
}

function handleOverlayClick(event) {
  if (event.target !== elements.overlay) return;
  close();
}

// ISO日時文字列を、称号一覧に表示する短い日付表記へ変換する。壊れた値はnullを返す
// （呼び出し側で「取得済み」とだけ表示するフォールバックに使う）。
function formatUnlockedDate(isoString) {
  if (typeof isoString !== "string") return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} 獲得`;
}

// 称号カード1件分を組み立てる。未取得でも名前・条件文は必ず表示する（本人指示）。
function buildAchievementCard(entry) {
  const card = document.createElement("div");
  card.classList.add("achievement-card", entry.isUnlocked ? "is-unlocked" : "is-locked");
  if (entry.category === "composite") {
    card.classList.add("achievement-card--composite");
  }
  card.dataset.achievementId = entry.id;

  const header = document.createElement("div");
  header.classList.add("achievement-card-header");
  header.appendChild(
    entry.isUnlocked ? buildAchievementIconMedal(entry.iconKey) : buildLockedAchievementIconMedal()
  );

  const name = document.createElement("p");
  name.classList.add("achievement-card-name");
  name.textContent = entry.name;
  header.appendChild(name);
  card.appendChild(header);

  const condition = document.createElement("p");
  condition.classList.add("achievement-card-condition");
  condition.textContent = entry.conditionText;
  card.appendChild(condition);

  const status = document.createElement("p");
  status.classList.add("achievement-card-status");
  if (entry.isUnlocked) {
    status.classList.add("is-achieved");
    const dateLabel = formatUnlockedDate(entry.unlockedAt);
    status.textContent = dateLabel ?? "取得済み";
  } else {
    status.textContent = "未取得";
  }
  card.appendChild(status);

  // 複合称号（＝LOVEマスター・＝LOVE完全制覇）だけ、構成要素のうち何個達成したかを
  // 正確に計算できるので表示する（本人指示：推測の進捗は表示しない。これは実データから
  // 正確に出せる数字のため表示してよい）。
  if (entry.compositeProgress && !entry.isUnlocked) {
    const progress = document.createElement("p");
    progress.classList.add("achievement-card-progress");
    progress.textContent = `${entry.compositeProgress.achievedCount} / ${entry.compositeProgress.requiredCount} 達成`;
    card.appendChild(progress);
  }

  // 複合称号だけが持つ、特典・推しアイコン変化の予告。未取得のうちから見せることで、
  // 目指す理由が一目で伝わるようにする（本人指示：見やすい場所に表示）。
  if (entry.rewardNote) {
    const reward = document.createElement("p");
    reward.classList.add("achievement-card-reward");
    reward.textContent = entry.rewardNote;
    card.appendChild(reward);
  }

  return card;
}

function renderAchievementList() {
  const snapshot = getAchievementListSnapshot();
  elements.listContainer.innerHTML = "";

  CATEGORY_ORDER.forEach((category) => {
    const items = snapshot.filter((entry) => entry.category === category);
    if (items.length === 0) return;

    const section = document.createElement("div");
    section.classList.add("achievement-category-section");

    const heading = document.createElement("p");
    heading.classList.add("achievement-category-heading");
    heading.textContent = CATEGORY_LABELS[category];
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.classList.add("achievement-card-grid");
    items.forEach((entry) => grid.appendChild(buildAchievementCard(entry)));
    section.appendChild(grid);

    elements.listContainer.appendChild(section);
  });
}

// 称号一覧モーダルを使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   overlay: モーダルの背景を含む、開閉をhiddenで切り替える要素,
//   modalCard: スクロールする実体（.modal-card）,
//   closeButton: ×ボタン,
//   listContainer: 称号カードを並べる入れ物,
//   openTriggers: クリックすると開く要素の配列,
// }
export function initAchievementListModal(newElements) {
  elements = newElements;

  elements.openTriggers.forEach((trigger) => {
    trigger.addEventListener("click", open);
  });
  elements.closeButton.addEventListener("click", close);
  elements.overlay.addEventListener("click", handleOverlayClick);
  document.addEventListener("keydown", handleKeydown);

  function destroy() {
    elements.openTriggers.forEach((trigger) => {
      trigger.removeEventListener("click", open);
    });
    elements.closeButton.removeEventListener("click", close);
    elements.overlay.removeEventListener("click", handleOverlayClick);
    document.removeEventListener("keydown", handleKeydown);
    elements = null;
  }

  return { open, close, destroy };
}
