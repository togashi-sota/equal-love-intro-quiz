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

// カードに添える「代表称号」ラベル。複合称号を持っていればそれを最優先にし、
// 無ければ取得数だけを見せる（本人指示：「カードには代表称号・取得称号数だけ表示」）。
// 【2026-08-15追加】ノーミスマスターを最下位の代表称号として追加（＝LOVEマスター・
// 完全制覇より下の扱い。上位2つを持つ場合はそちらが優先され、ノーミスマスターは出さない）。
export function buildRepresentativeLabel(profile) {
  if (profile.hasEqualLoveComplete) return "＝LOVE完全制覇";
  if (profile.hasEqualLoveMaster) return "＝LOVEマスター";
  if (profile.hasNoMissMaster) return "ノーミスマスター";
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
