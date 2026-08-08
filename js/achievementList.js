// 称号一覧モーダルを担当するファイル（js/titleList.js時代の後継）。
// 開閉ロジック（開く入口・×ボタン・背景クリック・Escキー）はこのファイルにまとめ、
// main.jsは初期化時にinitAchievementListModal()を1回呼ぶだけでよい。
//
// 旧システムと違い、未取得の称号も名前・条件を最初から隠さず表示する（本人指示：
// 「称号は、最初から一覧にすべて表示してください」「説明文も常に読めるようにしてください」）。
// 未取得／取得済みの違いは、CSS側の見た目（グレー・鍵アイコン vs 発光・カラー）だけで表現する。
import { getAchievementListSnapshot } from "./achievementProgress.js";
import { buildAchievementIconMedal, buildLockedAchievementIconMedal } from "./achievementIcons.js";
import { computeBestSpeedProgress, buildSpeedProgressBestBlock } from "./speedAchievementProgress.js";

// 速度称号（電光石火・メロディアス）だけ、カードにベスト平均タイム・残り秒数を追加表示する。
const SPEED_ACHIEVEMENT_IDS = new Set(["lightning_fast", "melody_ace"]);

const CATEGORY_ORDER = ["noMiss", "modeMaster", "backRoute", "composite"];
const CATEGORY_LABELS = {
  noMiss: "ノーミスランク",
  modeMaster: "表マスター",
  backRoute: "裏称号",
  composite: "最終称号",
};

// ノーミス系5段階のうち、ブロンズ〜プラチナの4つ（本人指示・2026-08-07：
// 「5問→ブロンズ…全曲→ノーミスマスター、と自然につながって見えるように」）。
// ノーミスマスターは「最初の大きな目標」という別の案内文を持つため、この配列には含めない。
const NO_MISS_STEP_IDS = ["no_miss_bronze", "no_miss_silver", "no_miss_gold", "no_miss_platinum"];

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
//
// entry.guidanceBadgeText（renderAchievementListが計算して詰める、UI専用の付加情報。
// 保存データにもachievementProgress.jsにも一切含めない）：
//   ・no_miss_master：未取得の間だけ「まず最初に目指す称号」であることを案内するバッジ。
//   ・no_miss_bronze〜platinum：ノーミス段階のうち、次に狙うべき1件にだけ「次の目標」バッジ。
// 称号名を「…」で省略しないでください（本人指示・2026-08-07）：長い称号名も2行まで
// 折り返して全文を表示し、カードの高さは内容に合わせて可変にする（固定height指定はしない）。
export function buildAchievementCard(entry) {
  const card = document.createElement("div");
  card.classList.add("achievement-card", entry.isUnlocked ? "is-unlocked" : "is-locked");
  if (entry.category === "composite") {
    card.classList.add("achievement-card--composite");
  }
  card.dataset.achievementId = entry.id;

  const header = document.createElement("div");
  header.classList.add("achievement-card-header");
  // ＝LOVEマスター・＝LOVE完全制覇だけは、未取得でも王冠・王冠+ダイヤの形をそのまま見せ、
  // 取得済みになったときだけ色と発光が解放されるようにする（本人指示：
  // 「未取得状態でも形や説明は見えるようにし、取得するとカラーと発光が解放される」）。
  // それ以外の称号は、これまでどおり未取得中は汎用の鍵アイコンにする。
  if (entry.category === "composite") {
    header.appendChild(buildAchievementIconMedal(entry.iconKey, { locked: !entry.isUnlocked }));
  } else {
    header.appendChild(
      entry.isUnlocked ? buildAchievementIconMedal(entry.iconKey) : buildLockedAchievementIconMedal()
    );
  }

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

  // 速度称号（電光石火・メロディアス）だけ、これまでのベスト平均タイム・称号までの
  // 残り秒数を追加表示する（本人指示・2026-08-09：「自分が今どのくらいの速さなのか」
  // 「称号まであと何秒縮めればよいのか」が分かるように）。
  if (SPEED_ACHIEVEMENT_IDS.has(entry.id)) {
    const bestProgress = computeBestSpeedProgress(entry.id);
    card.appendChild(buildSpeedProgressBestBlock(bestProgress, entry.isUnlocked));
  }

  // 初心者向けの案内バッジ（本人指示・2026-08-07）。「まずはここを目指そう」という
  // 位置づけが一目で伝わるよう、称号名・条件文の下、達成チェックリストより前に置く。
  if (entry.guidanceBadgeText) {
    const guidance = document.createElement("p");
    guidance.classList.add(
      "achievement-card-guidance",
      entry.id === "no_miss_master" ? "is-primary-goal" : "is-next-step"
    );
    guidance.textContent = entry.guidanceBadgeText;
    card.appendChild(guidance);
  }

  // 複合称号（＝LOVEマスター・＝LOVE完全制覇）は、どの3つを集めれば取得できるのかを
  // 名前つきで一覧表示する（本人指示・2026-08-07：「どの称号を集めれば最終称号になるのか
  // が一目で分かる」）。数字だけの「2 / 3達成」より分かりやすいため、名前入りチェックリストに
  // 置き換えている。未取得はグレーの○、取得済みはピンクの✓で進捗が一目で分かるようにする。
  if (entry.compositeProgress) {
    const requirements = document.createElement("div");
    requirements.classList.add("achievement-card-requirements");

    const title = document.createElement("p");
    title.classList.add("achievement-card-requirements-title");
    title.textContent = "獲得条件";
    requirements.appendChild(title);

    entry.compositeProgress.items.forEach((item) => {
      const row = document.createElement("p");
      row.classList.add("achievement-requirement-item", item.isUnlocked ? "is-fulfilled" : "is-pending");
      row.textContent = item.name;
      requirements.appendChild(row);
    });

    card.appendChild(requirements);
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

// no_miss_master／ノーミス段階4件だけが持つ、初心者向けの案内バッジ文言を計算する
// （UI専用の付加情報。achievementProgress.jsの保存データには一切含めない）。
function computeGuidanceBadgeText(entry, snapshot) {
  if (entry.id === "no_miss_master") {
    return entry.isUnlocked ? null : "🎯 最初の目標";
  }
  if (!NO_MISS_STEP_IDS.includes(entry.id) || entry.isUnlocked) return null;

  const nextStepId = NO_MISS_STEP_IDS.find((id) => !snapshot.find((e) => e.id === id)?.isUnlocked);
  return nextStepId === entry.id ? "→ 次の目標" : null;
}

function renderAchievementList() {
  const rawSnapshot = getAchievementListSnapshot();
  const snapshot = rawSnapshot.map((entry) => ({
    ...entry,
    guidanceBadgeText: computeGuidanceBadgeText(entry, rawSnapshot),
  }));
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
