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

// 【2026-08-14改訂・本人指示】17称号・3カテゴリーへ再編。growthは既存の高難度称号より
// 手前にある最初の成長ステップという位置づけのため、一覧の先頭に置く。
const CATEGORY_ORDER = ["growth", "masterPath", "backChallenge"];
const CATEGORY_LABELS = {
  growth: "🌱 ステップアップ",
  masterPath: "👑 ＝LOVEマスターへの道",
  backChallenge: "💎 裏チャレンジ",
};

// 成長段階系3系統（イントロ／シャッフル／リリック）。系統ごとに独立してカスケードするため、
// ノーミス系と同じ「次の目標」計算をトリオ単位で行う（本人指示・2026-08-13：
// カード単体で見て「次は何をすればよいか」が伝わるようにする）。
const GROWTH_TRIADS = [
  ["intro_beginner", "intro_challenger", "intro_ace"],
  ["shuffle_beginner", "shuffle_challenger", "shuffle_ace"],
  ["lyric_beginner", "lyric_challenger", "lyric_ace"],
];

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
//   ・成長段階系（growth）のみ：系統（トリオ）ごとに、まだ何も取得していなければ先頭の
//     1件に「🔰 まずはここから」、1つ以上取得済みなら次の未取得1件に「→ 次の目標」バッジ。
// 称号名を「…」で省略しないでください（本人指示・2026-08-07）：長い称号名も2行まで
// 折り返して全文を表示し、カードの高さは内容に合わせて可変にする（固定height指定はしない）。
export function buildAchievementCard(entry) {
  const card = document.createElement("div");
  card.classList.add("achievement-card", entry.isUnlocked ? "is-unlocked" : "is-locked");
  // 【2026-08-14改訂】「複合称号かどうか」の判定を、表示カテゴリー名（category）ではなく
  // compositeOfの有無（compositeProgressの有無で判定できる）に切り替えた。categoryは
  // 今回の再編で「どのセクションに表示するか」だけの役割になり、composite専用の見た目
  // （王冠プレビュー等）とは独立させたため（本人指示：masterPath/backChallengeに
  // ＝LOVEマスター・＝LOVE完全制覇も含めつつ、特別な見た目は維持する）。
  const isComposite = entry.compositeProgress !== null;
  if (isComposite) {
    card.classList.add("achievement-card--composite");
  }
  card.dataset.achievementId = entry.id;

  const header = document.createElement("div");
  header.classList.add("achievement-card-header");
  // ＝LOVEマスター・＝LOVE完全制覇だけは、未取得でも王冠・王冠+ダイヤの形をそのまま見せ、
  // 取得済みになったときだけ色と発光が解放されるようにする（本人指示：
  // 「未取得状態でも形や説明は見えるようにし、取得するとカラーと発光が解放される」）。
  // それ以外の称号は、これまでどおり未取得中は汎用の鍵アイコンにする。
  if (isComposite) {
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

  // 「挑戦条件」の詳細箇条書き（本人指示・2026-08-14）。マスター・裏称号の単体称号だけが持つ
  // （成長段階系は条件が単純なためconditionTextのみ、複合称号はcompositeProgressの
  // チェックリストが同じ役割を果たすためnullのまま）。一覧を開いた瞬間に短文と詳細の両方が
  // 見える設計（隠さない）。
  if (entry.challengeConditions) {
    const challengeBlock = document.createElement("div");
    challengeBlock.classList.add("achievement-card-challenge");

    const challengeTitle = document.createElement("p");
    challengeTitle.classList.add("achievement-card-challenge-title");
    challengeTitle.textContent = "挑戦条件";
    challengeBlock.appendChild(challengeTitle);

    const challengeList = document.createElement("ul");
    challengeList.classList.add("achievement-card-challenge-list");
    entry.challengeConditions.forEach((line) => {
      const item = document.createElement("li");
      item.textContent = line;
      challengeList.appendChild(item);
    });
    challengeBlock.appendChild(challengeList);

    card.appendChild(challengeBlock);
  }

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
    guidance.classList.add("achievement-card-guidance", "is-next-step");
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

// 成長段階系（growth）だけが持つ、初心者向けの案内バッジ文言を計算する
// （UI専用の付加情報。achievementProgress.jsの保存データには一切含めない）。
// 【2026-08-14改訂】ブロンズ/シルバー/ゴールド/プラチナの廃止にともない、ノーミスマスター
// 専用の「🎯 最初の目標」バッジは削除した（今は成長段階系が真の最初の目標のため）。
function computeGuidanceBadgeText(entry, snapshot) {
  // 成長段階系（イントロ/シャッフル/リリック）：系統（トリオ）ごとに独立して、
  // まだ誰も取得していないトリオの先頭は「🔰 まずはここから」、1つ以上取得済みなら
  // 未取得の最初の1件だけに「→ 次の目標」を出す（本人指示・2026-08-13：
  // カード単体で見て次にすべきことが一目で分かるように）。
  const triad = GROWTH_TRIADS.find((ids) => ids.includes(entry.id));
  if (triad && !entry.isUnlocked) {
    const triadEntries = triad.map((id) => snapshot.find((e) => e.id === id));
    const nextStepId = triad.find((id, index) => !triadEntries[index]?.isUnlocked);
    if (nextStepId !== entry.id) return null;
    const anyUnlocked = triadEntries.some((e) => e?.isUnlocked);
    return anyUnlocked ? "→ 次の目標" : "🔰 まずはここから";
  }

  return null;
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
