// 「みんなのプロフィール」画面のうち、DOM構築・並び替えだけを担当する純粋寄りのファイル。
// Firebase・localStorageには一切触れない（js/fanProfilesScreen.jsが状態管理・イベント配線を担当し、
// このファイルは「データ→DOM要素」の変換だけに専念する）。恒久テストは、Firebase初期化を
// 発生させずにこのファイルだけをimportして直接検証できる
// （js/publicProfilePayloads.jsと同じ、Firebase分離の設計方針）。
import { getMemberById } from "./memberUtils.js";
import { ACHIEVEMENTS, getAchievementById } from "./achievementDefinitions.js";
import { buildAchievementIconMedal } from "./achievementIcons.js";
import { applyOshiBadgeDecorationsFromState } from "./oshiBadge.js";

// 称号カテゴリの表示順（js/achievementList.jsと同じ順番。詳細モーダルでも一覧と同じ並びに揃える）。
// 【2026-08-14更新】17称号・3カテゴリー再編（growth/masterPath/backChallenge）にあわせて更新。
export const ACHIEVEMENT_CATEGORY_ORDER = ["growth", "masterPath", "backChallenge"];

export function buildOshiSwatch(members, oshiMemberId, badgeState) {
  const swatch = document.createElement("span");
  swatch.className = "fan-profile-swatch";
  const member = oshiMemberId ? getMemberById(members, oshiMemberId) : null;
  const hex = member?.memberColor?.hex;
  swatch.style.background = hex ?? "";
  swatch.classList.toggle("is-placeholder", !hex);
  applyOshiBadgeDecorationsFromState(swatch, badgeState);
  return swatch;
}

// 【2026-08-29追加、本人指示】成長段階系（エース）と＝LOVEマスターへの道（マスター）で、
// 同じ系統の上位・下位にあたる3組。上位（マスター側）を持っていれば、代表称号としては
// 下位（エース側）を出さない（＝二段構えの代表称号候補として使う）。
// 取得済み称号データ自体（unlockedAchievementIds）は一切書き換えない。あくまで
// 「一覧でどれを代表として見せるか」という表示側の絞り込みだけを行う。
const REPRESENTATIVE_TIER_PAIRS = [
  { higherId: "no_miss_master", higherName: "ノーミスマスター", lowerId: "intro_ace", lowerName: "イントロエース" },
  {
    higherId: "full_chorus_master",
    higherName: "フルコーラスマスター",
    lowerId: "shuffle_ace",
    lowerName: "シャッフルエース",
  },
  { higherId: "song_master", higherName: "歌マスター", lowerId: "lyric_ace", lowerName: "リリックエース" },
];

// カードに添える「代表称号」ラベル。複合称号を持っていればそれを最優先にし、
// 無ければ取得数だけを見せる（本人指示：「カードには代表称号・取得称号数だけ表示」）。
// 【2026-08-15追加】ノーミスマスターを最下位の代表称号として追加（＝LOVEマスター・
// 完全制覇より下の扱い。上位2つを持つ場合はそちらが優先され、ノーミスマスターは出さない）。
// 【2026-08-29更新、本人指示】上記3組の上位（マスター系）を、複合称号2つに次ぐ代表候補として
// 追加。その系統の上位を持っていなければ、代わりに下位（エース系）を代表候補として見せる
// （フルコーラスマスター・歌マスターは今回追加するまで代表称号として一切表示されていなかった
// ため、これも合わせて拾えるようにする）。
// 【後方互換】unlockedAchievementIdsが同期される前の古いプロフィールデータ
// （hasNoMissMasterの3レガシーフラグだけを持つ）でも、ノーミスマスターだけは正しく
// 代表ラベルに出せるよう、hasNoMissMasterフラグもあわせて見る（js/publicProfilePayloads.js
// 参照：新しいプロフィールは常に両方が一致した状態で同期されるため、通常は同じ結果になる）。
export function buildRepresentativeLabel(profile) {
  if (profile.hasEqualLoveComplete) return "＝LOVE完全制覇";
  if (profile.hasEqualLoveMaster) return "＝LOVEマスター";

  const unlockedSet = new Set(profile.unlockedAchievementIds ?? []);
  if (profile.hasNoMissMaster) unlockedSet.add("no_miss_master");

  for (const pair of REPRESENTATIVE_TIER_PAIRS) {
    if (unlockedSet.has(pair.higherId)) return pair.higherName;
  }
  for (const pair of REPRESENTATIVE_TIER_PAIRS) {
    if (unlockedSet.has(pair.lowerId)) return pair.lowerName;
  }
  return null;
}

// プロフィール一覧カード1件分を組み立てる。未知のmemberId（getMemberByIdがnullを返す）でも、
// 「推し：未設定」表示にフォールバックするだけで画面は壊れない。
// onSelectは、カードがタップされたときにprofileを引数として呼ばれるコールバック。
//
// options.isAdmin（2026-08-16追加）がtrueのときだけ、管理者専用の削除ボタンをカードの
// 隣に追加する（一般ユーザーには絶対に見えない導線）。button要素の中にbutton要素は
// 置けない（HTML仕様違反・タップ判定が壊れる）ため、削除ボタンありのときだけ
// カード本体を横並びのdivでラップして返す。isAdminを渡さない・falseの場合は今までどおり
// カードのbutton要素をそのまま返すため、既存の呼び出し側・テストの挙動は変わらない。
export function buildProfileCard(profile, members, onSelect, options = {}) {
  const { isAdmin = false, onAdminDeleteRequest = null } = options;
  const card = document.createElement("button");
  card.type = "button";
  card.className = "fan-profile-card";
  card.dataset.uid = profile.uid;

  const badgeState = {
    hasNoMissMaster: profile.hasNoMissMaster,
    hasEqualLoveMaster: profile.hasEqualLoveMaster,
    hasEqualLoveComplete: profile.hasEqualLoveComplete,
  };
  card.appendChild(buildOshiSwatch(members, profile.oshiMemberId, badgeState));

  const body = document.createElement("span");
  body.className = "fan-profile-card-body";

  const name = document.createElement("span");
  name.className = "fan-profile-card-name";
  name.textContent = profile.displayName;
  body.appendChild(name);

  const oshiMember = profile.oshiMemberId ? getMemberById(members, profile.oshiMemberId) : null;
  const oshiLine = document.createElement("span");
  oshiLine.className = "fan-profile-card-oshi";
  oshiLine.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  body.appendChild(oshiLine);

  const metaLine = document.createElement("span");
  metaLine.className = "fan-profile-card-meta";
  const countText = `称号 ${profile.unlockedAchievementIds.length}個`;
  const representative = buildRepresentativeLabel(profile);
  metaLine.textContent = representative ? `${countText}・${representative}` : countText;
  body.appendChild(metaLine);

  card.appendChild(body);

  const chevron = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  chevron.setAttribute("class", "fan-profile-card-chevron");
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
  card.appendChild(chevron);

  if (onSelect) card.addEventListener("click", () => onSelect(profile));
  if (!isAdmin) return card;

  // 管理者だけに見える削除導線。カード本体とは独立したボタンにし、クリックが
  // カード本体のonSelectへ伝わらないようstopPropagation()する。
  const row = document.createElement("div");
  row.className = "fan-profile-card-row";
  row.appendChild(card);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "fan-profile-admin-delete-button";
  deleteButton.setAttribute("aria-label", `${profile.displayName}さんの公開プロフィールを削除（管理者用）`);
  deleteButton.textContent = "🗑️";
  deleteButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (onAdminDeleteRequest) onAdminDeleteRequest(profile);
  });
  row.appendChild(deleteButton);

  return row;
}

// 表示名順（ロケールを考慮した並び替え）。本人指示：「取得称号数によるランキングにはしない」
// 「毎回並びが大きく変わるのが使いにくければ表示名順でもOK」を踏まえ、最も安定した順番として採用。
// 元の配列は変更しない（呼び出し側がFirebaseから受け取った配列をそのまま渡せるように）。
export function sortProfiles(profiles) {
  return [...profiles].sort((a, b) => a.displayName.localeCompare(b.displayName, "ja"));
}

// 取得済み称号1件分の、小さなカードを組み立てる。未知のachievementId（getAchievementByIdが
// nullを返す＝将来バージョン差等）はnullを返し、呼び出し側で静かに読み飛ばす。
export function buildAchievedCard(achievementId) {
  const definition = getAchievementById(achievementId);
  if (!definition) return null;

  const card = document.createElement("div");
  card.className = "fan-profile-achievement-card";

  card.appendChild(buildAchievementIconMedal(definition.iconKey));

  const name = document.createElement("span");
  name.className = "fan-profile-achievement-name";
  name.textContent = definition.name;
  card.appendChild(name);

  return card;
}

// 取得済み称号を、カテゴリ順・カテゴリごとのグリッドに分けて並べたコンテナ要素を組み立てる
// （本人指示：他人のプロフィールでは取得済みだけ表示し、未取得称号は出さない）。
// 1件も無ければ「まだ称号を取得していません。」の案内だけを返す。
// 【2026-08-29再設計・本人指示】このリストの役割を、フレンド詳細モーダルの主表示から
// 「すべての称号を見る」の全件確認用に変更した。代表称号（最大3個）とは別の場所・別の
// 目的の表示になったため、ここでは段階制称号の絞り込みは行わず、取得済みを全件そのまま
// 表示する（上位称号の取得によって代表表示から省略された下位称号も、ここでは変わらず
// 「取得済み」として確認できる。本人指示：「取得データ自体を消したり未取得扱いにしたり
// しない」）。「称号◯個」の個数バッジ（buildProfileCard・buildAchievementCountText）は、
// 元からフィルタしていないunlockedAchievementIds.lengthを使うため、この変更による影響はない。
export function buildAchievedAchievementsList(unlockedAchievementIds) {
  const container = document.createElement("div");
  const unlockedSet = new Set(unlockedAchievementIds);
  const hasAny = ACHIEVEMENT_CATEGORY_ORDER.some((category) =>
    ACHIEVEMENTS.some((a) => a.category === category && unlockedSet.has(a.id))
  );

  if (!hasAny) {
    const empty = document.createElement("p");
    empty.className = "fan-profile-achievement-empty";
    empty.textContent = "まだ称号を取得していません。";
    container.appendChild(empty);
    return container;
  }

  ACHIEVEMENT_CATEGORY_ORDER.forEach((category) => {
    const idsInCategory = ACHIEVEMENTS.filter((a) => a.category === category && unlockedSet.has(a.id)).map(
      (a) => a.id
    );
    if (idsInCategory.length === 0) return;
    const grid = document.createElement("div");
    grid.className = "fan-profile-achievement-grid";
    idsInCategory.forEach((id) => {
      const card = buildAchievedCard(id);
      if (card) grid.appendChild(card);
    });
    container.appendChild(grid);
  });

  return container;
}

// ===== フレンドプロフィールの「代表称号」（2026-08-29新設・本人指示の再設計） =====
// ランキング順位などは一切使わず、称号だけでその人の実力感が伝わるようにする。
// 「同じ系統は取得済みの中で最上位1個だけを代表候補にする」考え方は維持しつつ、対象を
// ステップアップ（ビギナー→チャレンジャー→エース）だけでなく、対応するマスターへの道
// （ノーミスマスター等）・裏チャレンジ（電光石火等）まで、1本の系統として拡張した。
// 系統は、js/achievementDefinitions.jsの各モード（イントロ／ランダム再生／歌詞クイズ）に
// 対応する形で、低→高の順に並べる。
const ACHIEVEMENT_SERIES = [
  ["intro_beginner", "intro_challenger", "intro_ace", "no_miss_master", "lightning_fast"],
  ["shuffle_beginner", "shuffle_challenger", "shuffle_ace", "full_chorus_master", "melody_ace"],
  ["lyric_beginner", "lyric_challenger", "lyric_ace", "song_master", "lyric_master"],
];

// 系統内での難易度の目安（0＝ビギナー…4＝裏チャレンジ）。複合称号（＝LOVEマスター・
// ＝LOVE完全制覇）はどの系統にも属さないが、単体の裏チャレンジ・マスター称号より
// さらに上とみなし、系統の最大値より1つ上のCOMPOSITE_TIERを割り当てる。
const SERIES_TIER_BY_ACHIEVEMENT_ID = new Map();
ACHIEVEMENT_SERIES.forEach((seriesIdsLowToHigh) => {
  seriesIdsLowToHigh.forEach((id, tierIndex) => SERIES_TIER_BY_ACHIEVEMENT_ID.set(id, tierIndex));
});
const COMPOSITE_TIER = ACHIEVEMENT_SERIES[0].length;

// カテゴリーごとの優先順位（本人指示：「裏チャレンジ系 ＞ マスター系 ＞ ステップアップ系」）。
// 数字が大きいほど価値が高く、代表称号の選出で優先される。
const CATEGORY_PRIORITY = { backChallenge: 3, masterPath: 2, growth: 1 };

// フレンドプロフィール上部に表示する、代表称号の最大件数（本人指示）。
export const MAX_REPRESENTATIVE_ACHIEVEMENT_COUNT = 3;

// マスター系・裏チャレンジ系の称号に添える、シンプルな日本語タグ（本人指示：
// 「変に英語のランク名などを新しく作る必要はない」）。ステップアップ系にはタグを付けない。
const CATEGORY_TAG_LABELS = { masterPath: "マスター称号", backChallenge: "裏チャレンジ称号" };

// フレンドプロフィールの代表称号候補を、価値の高い順（すべて）に並べて返す純粋関数。
// 取得データ本体（unlockedAchievementIds）は一切変更しない。呼び出し側が最大3個に絞る。
//
// ①系統内は、取得済みの中で最上位1個以外を代表候補から除外する（例：イントロエース＋
//   ノーミスマスター取得済みなら、ノーミスマスターだけが候補に残る）。
// ②複合称号（＝LOVEマスター／＝LOVE完全制覇）を取得済みなら、その材料になった単体称号
//   （compositeOf）も代表候補から除外する（例：＝LOVEマスター取得済みなら、単体の
//   ノーミスマスター等は候補から外れ、＝LOVEマスターだけが残る）。
// どちらも「代表表示からの除外」であり、unlockedAchievementIds自体は書き換えない
// （本人指示：「イントロエースを未取得扱いにする・取得データを削除するという意味では
// ない」）。
export function getRepresentativeAchievementCandidates(unlockedAchievementIds) {
  const unlockedSet = new Set(unlockedAchievementIds);
  const suppressedIds = new Set();

  ACHIEVEMENT_SERIES.forEach((seriesIdsLowToHigh) => {
    const unlockedInSeries = seriesIdsLowToHigh.filter((id) => unlockedSet.has(id));
    unlockedInSeries.slice(0, -1).forEach((id) => suppressedIds.add(id));
  });

  ACHIEVEMENTS.forEach((achievement) => {
    if (!achievement.compositeOf || !unlockedSet.has(achievement.id)) return;
    achievement.compositeOf.forEach((id) => suppressedIds.add(id));
  });

  return [...unlockedSet]
    .filter((id) => !suppressedIds.has(id))
    .map((id) => getAchievementById(id))
    .filter(Boolean)
    .sort((a, b) => {
      const categoryDiff = (CATEGORY_PRIORITY[b.category] ?? 0) - (CATEGORY_PRIORITY[a.category] ?? 0);
      if (categoryDiff !== 0) return categoryDiff;
      const tierA = SERIES_TIER_BY_ACHIEVEMENT_ID.get(a.id) ?? COMPOSITE_TIER;
      const tierB = SERIES_TIER_BY_ACHIEVEMENT_ID.get(b.id) ?? COMPOSITE_TIER;
      return tierB - tierA;
    });
}

// 獲得称号の総数テキスト（本人指示：「代表表示から除外された下位称号も、取得済みである
// こと自体は変わらないので総数には含める」）。unlockedAchievementIdsをそのままlengthで
// 数えるだけなので、代表称号選出（getRepresentativeAchievementCandidates）の絞り込みとは
// 完全に独立している。
export function buildAchievementCountText(unlockedAchievementIds) {
  return `🏅 獲得称号 ${unlockedAchievementIds.length}個`;
}

// 代表称号1件分のチップ（アイコン＋称号名＋1行の獲得条件＋カテゴリータグ）を組み立てる。
// 獲得条件はachievementDefinitions.jsのconditionText（一覧モーダルと同じ、既存の短文）を
// そのまま再利用し、新しい説明文は作らない（本人指示：「既存の称号判定ロジックを再利用」）。
export function buildRepresentativeAchievementChip(achievement) {
  const chip = document.createElement("div");
  chip.className = "fan-profile-representative-chip";

  const tagLabel = CATEGORY_TAG_LABELS[achievement.category];
  if (tagLabel) {
    const tag = document.createElement("span");
    tag.className = `fan-profile-representative-tag fan-profile-representative-tag--${achievement.category}`;
    tag.textContent = tagLabel;
    chip.appendChild(tag);
  }

  const row = document.createElement("div");
  row.className = "fan-profile-representative-row";
  row.appendChild(buildAchievementIconMedal(achievement.iconKey));

  const textBlock = document.createElement("div");
  textBlock.className = "fan-profile-representative-text";

  const name = document.createElement("p");
  name.className = "fan-profile-representative-name";
  name.textContent = achievement.name;
  textBlock.appendChild(name);

  const condition = document.createElement("p");
  condition.className = "fan-profile-representative-condition";
  condition.textContent = achievement.conditionText;
  textBlock.appendChild(condition);

  row.appendChild(textBlock);
  chip.appendChild(row);

  return chip;
}

// フレンドプロフィール上部の「ランク感」＋代表称号（最大3個）をまとめて組み立てる
// （本人指示：称号0個／1〜2個／3個以上で見せ方を変える）。
// ・0個：「これから挑戦！」＋案内文（未獲得称号は並べない）
// ・1〜2個：「CHALLENGER」＋取得済みをそのまま表示（無理に3個まで埋めない）
// ・3個以上：「代表称号」＋優先順位の高い3個を表示
export function buildFriendAchievementSummary(unlockedAchievementIds) {
  const container = document.createElement("div");
  container.className = "fan-profile-achievement-summary";

  const candidates = getRepresentativeAchievementCandidates(unlockedAchievementIds);

  const rankLabel = document.createElement("p");
  rankLabel.className = "fan-profile-rank-label";
  container.appendChild(rankLabel);

  if (candidates.length === 0) {
    rankLabel.textContent = "これから挑戦！";
    rankLabel.classList.add("is-empty");
    const hint = document.createElement("p");
    hint.className = "fan-profile-rank-empty-hint";
    hint.textContent = "クイズに挑戦して最初の称号を獲得しよう！";
    container.appendChild(hint);
    return container;
  }

  const isChallenger = candidates.length < MAX_REPRESENTATIVE_ACHIEVEMENT_COUNT;
  rankLabel.textContent = isChallenger ? "CHALLENGER" : "代表称号";
  rankLabel.classList.add(isChallenger ? "is-challenger" : "is-representative");

  const list = document.createElement("div");
  list.className = "fan-profile-representative-list";
  candidates.slice(0, MAX_REPRESENTATIVE_ACHIEVEMENT_COUNT).forEach((achievement) => {
    list.appendChild(buildRepresentativeAchievementChip(achievement));
  });
  container.appendChild(list);

  return container;
}
