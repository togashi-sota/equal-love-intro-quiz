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

// 成長段階系5系統（イントロ／アウトロ／シャッフル／リリック／一瞬チャレンジ）。
// 【2026-08-30改訂・本人指示④⑯】各系統を「ビギナー→チャレンジャー→エース→マスター」の
// 4段階に統一。マスター段階（no_miss_master等）はcategoryとしては従来どおり"masterPath"の
// ままだが（fanProfileCard.jsの代表称号タグ表示等、他の場所がcategory:"masterPath"を
// 前提にしているため、既存データ・既存ロジックへの影響を避けてcategory自体は変更しない）、
// この一覧表示だけは「系統ごとの4段階トロフィー」としてまとめて見せたいため、
// GROWTH_SERIESのtierIds（idそのもの）を唯一の情報源として判定する
// （category値ではなく、常にこの配列を正として一覧に表示する称号を決める）。
export const GROWTH_SERIES = [
  {
    label: "🎧 イントロ系",
    tierIds: ["intro_beginner", "intro_challenger", "intro_ace", "no_miss_master"],
    tierLabels: ["5問", "10問", "20問", "全曲"],
  },
  {
    label: "🎬 アウトロ系",
    tierIds: ["outro_beginner", "outro_challenger", "outro_ace", "outro_master"],
    tierLabels: ["5問", "10問", "20問", "全曲"],
  },
  {
    label: "🔀 シャッフル系",
    tierIds: ["shuffle_beginner", "shuffle_challenger", "shuffle_ace", "full_chorus_master"],
    tierLabels: ["5問", "10問", "20問", "全曲"],
  },
  {
    label: "🎤 リリック系",
    tierIds: ["lyric_beginner", "lyric_challenger", "lyric_ace", "song_master"],
    tierLabels: ["5問", "10問", "20問", "全曲"],
  },
  {
    label: "⚡ 一瞬チャレンジ系",
    tierIds: ["instant_beginner", "instant_challenger", "instant_ace", "instant_master"],
    tierLabels: ["1.5秒・4択・3問", "1秒・4択・5問", "1秒・10択・10問", "0.5秒・10択・10問"],
  },
];
// 上記5系統×4段階、計20個のidの集合。masterPath カテゴリーの通常グリッド（renderAchievementList）
// から、この集合に含まれるid（＝すでにこのトロフィー表示で見せている4段階目）を除外するために使う
// （二重表示防止。GROWTH_TRIAD時代はcategory:"growth"だけで判定できたが、マスター段階は
// category:"masterPath"のままのため、idベースの判定に切り替えた）。
const GROWTH_TIER_ID_SET = new Set(GROWTH_SERIES.flatMap((series) => series.tierIds));

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

  // 「挑戦条件」／「達成条件」の詳細箇条書き（本人指示・2026-08-14〜2026-08-15）。
  // マスター・裏称号の単体称号は「挑戦条件」の通常サイズ、成長段階系（growth）は
  // 「達成条件」というコンパクトな見出し・小さめのフォントで表示する（本人指示：
  // 「ステップアップ系はマスター系ほど大きくなくてよいが、情報は削りすぎない」）。
  // 複合称号（compositeOfあり）はcompositeProgressのチェックリストが同じ役割を果たすため、
  // challengeConditions自体を持たない（achievementDefinitions.js側でnullのまま）。
  if (entry.challengeConditions) {
    const isCompact = entry.category === "growth";
    const challengeBlock = document.createElement("div");
    challengeBlock.classList.add("achievement-card-challenge");
    if (isCompact) challengeBlock.classList.add("achievement-card-challenge--compact");

    const challengeTitle = document.createElement("p");
    challengeTitle.classList.add("achievement-card-challenge-title");
    challengeTitle.textContent = isCompact ? "達成条件" : "挑戦条件";
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

// 成長段階系（ステップアップ）専用の、トロフィー風バッジカード（2026-08-17再設計）。
// 本人フィードバック「説明カードっぽい・格好良くない」を受け、称号・アイコンを主役にし、
// 条件文は補助情報にする（バッジ→問題数→称号名→条件、の順で視線が流れる構成）。
// masterPath・backChallengeのbuildAchievementCard()とは完全に別関数にすることで、
// 既存の複合称号・裏称号カードには一切影響を与えない。
export function buildGrowthBadgeCard(entry, tierLabel) {
  const card = document.createElement("div");
  card.classList.add("growth-badge-card", entry.isUnlocked ? "is-unlocked" : "is-locked");
  card.dataset.achievementId = entry.id;

  const medalWrap = document.createElement("div");
  medalWrap.classList.add("growth-badge-medal-wrap");

  // locked:trueのときは、js/achievementIcons.jsの「形はそのまま・配色だけ落とす」
  // locked-previewの仕組みをここにも適用する（本人指示：「未獲得はシルエット・彩度を抑える」。
  // 既存の＝LOVEマスター・完全制覇と同じ考え方を、ステップアップにも広げた）。
  const medal = buildAchievementIconMedal(entry.iconKey, { locked: !entry.isUnlocked });
  medal.classList.add("growth-badge-medal");
  medalWrap.appendChild(medal);

  // 獲得済みバッジにだけ、小さなチェックマークを重ねて「集めた」満足感を出す
  // （本人指示：「獲得したときの満足感を強くしてください」。ただし発光やアニメーションは
  // 使わず、＝LOVEマスター・完全制覇より必ず控えめに留める）。
  if (entry.isUnlocked) {
    const check = document.createElement("span");
    check.classList.add("growth-badge-check");
    check.setAttribute("aria-hidden", "true");
    check.textContent = "✓";
    medalWrap.appendChild(check);
  }
  card.appendChild(medalWrap);

  const tier = document.createElement("p");
  tier.classList.add("growth-badge-tier");
  tier.textContent = tierLabel;
  card.appendChild(tier);

  const name = document.createElement("p");
  name.classList.add("growth-badge-name");
  name.textContent = entry.name;
  card.appendChild(name);

  if (entry.guidanceBadgeText) {
    const guidance = document.createElement("p");
    guidance.classList.add("growth-badge-guidance");
    guidance.textContent = entry.guidanceBadgeText;
    card.appendChild(guidance);
  }

  const condition = document.createElement("p");
  condition.classList.add("growth-badge-condition");
  condition.textContent = entry.conditionText;
  card.appendChild(condition);

  const status = document.createElement("p");
  status.classList.add("growth-badge-status");
  if (entry.isUnlocked) {
    status.classList.add("is-achieved");
    status.textContent = formatUnlockedDate(entry.unlockedAt) ?? "取得済み";
  } else {
    status.textContent = "未取得";
  }
  card.appendChild(status);

  return card;
}

// ステップアップ全体（3系統×3段階）を、系統ごとの横並び3枚のトロフィー行として組み立てる。
// 系統をひとかたまりで見せることで「揃えたい」「あと1つ」という収集欲求が伝わるようにする
// （本人指示のUI/UXデザイナー視点レビューを踏まえた構成）。
export function buildGrowthSection(items) {
  const section = document.createElement("div");
  section.classList.add("achievement-category-section");

  const heading = document.createElement("p");
  heading.classList.add("achievement-category-heading");
  heading.textContent = CATEGORY_LABELS.growth;
  section.appendChild(heading);

  GROWTH_SERIES.forEach((series) => {
    const seriesBlock = document.createElement("div");
    seriesBlock.classList.add("growth-series-block");

    const seriesLabel = document.createElement("p");
    seriesLabel.classList.add("growth-series-label");
    seriesLabel.textContent = series.label;
    seriesBlock.appendChild(seriesLabel);

    const row = document.createElement("div");
    row.classList.add("growth-series-row");
    series.tierIds.forEach((id, tierIndex) => {
      const entry = items.find((item) => item.id === id);
      if (!entry) return; // 未知のid（将来の仕様差分等）でも画面を壊さず静かに読み飛ばす
      row.appendChild(buildGrowthBadgeCard(entry, series.tierLabels[tierIndex]));
    });
    seriesBlock.appendChild(row);

    section.appendChild(seriesBlock);
  });

  return section;
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
  const series = GROWTH_SERIES.find((s) => s.tierIds.includes(entry.id));
  if (series && !entry.isUnlocked) {
    const tierEntries = series.tierIds.map((id) => snapshot.find((e) => e.id === id));
    const nextStepId = series.tierIds.find((id, index) => !tierEntries[index]?.isUnlocked);
    if (nextStepId !== entry.id) return null;
    const anyUnlocked = tierEntries.some((e) => e?.isUnlocked);
    return anyUnlocked ? "→ 次の目標" : "🔰 まずはここから";
  }

  return null;
}

// 【2026-08-30改訂・本人指示⑯】表示順を①イントロ系②アウトロ系③シャッフル系④リリック系
// ⑤一瞬チャレンジ系（まとめてトロフィー表示）⑥＝LOVEマスター⑦裏チャレンジ⑧＝LOVE完全制覇に
// 統一。⑥⑦⑧はCATEGORY_ORDER（masterPath→backChallenge）の並びのまま、GROWTH_TIER_ID_SETに
// 含まれるid（各系統のマスター段階、すでに①〜⑤で表示済み）だけを除外して二重表示を防ぐ。
function renderAchievementList() {
  const rawSnapshot = getAchievementListSnapshot();
  const snapshot = rawSnapshot.map((entry) => ({
    ...entry,
    guidanceBadgeText: computeGuidanceBadgeText(entry, rawSnapshot),
  }));
  elements.listContainer.innerHTML = "";

  const growthItems = snapshot.filter((entry) => GROWTH_TIER_ID_SET.has(entry.id));
  elements.listContainer.appendChild(buildGrowthSection(growthItems));

  CATEGORY_ORDER.forEach((category) => {
    if (category === "growth") return; // 上のgrowthItemsで表示済み（GROWTH_TIER_ID_SET基準）
    const items = snapshot.filter((entry) => entry.category === category && !GROWTH_TIER_ID_SET.has(entry.id));
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
