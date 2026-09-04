// 「みんなのプロフィール」画面のうち、DOM構築・並び替えだけを担当する純粋寄りのファイル。
// Firebase・localStorageには一切触れない（js/fanProfilesScreen.jsが状態管理・イベント配線を担当し、
// このファイルは「データ→DOM要素」の変換だけに専念する）。恒久テストは、Firebase初期化を
// 発生させずにこのファイルだけをimportして直接検証できる
// （js/publicProfilePayloads.jsと同じ、Firebase分離の設計方針）。
import { getMemberById } from "./memberUtils.js";
import { getAchievementById } from "./achievementDefinitions.js";
import { buildAchievementIconMedal } from "./achievementIcons.js";
import { applyOshiBadgeDecorationsFromState } from "./oshiBadge.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { buildPresenceStatusLabel } from "./presencePayloads.js";

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
// 【2026-08-30改訂・本人指示⑤⑥⑪】表示名の変更（ノーミスマスター→イントロマスター等）に
// 合わせてhigherNameを更新し、アウトロ・一瞬チャレンジの2組を追加した。
const REPRESENTATIVE_TIER_PAIRS = [
  { higherId: "no_miss_master", higherName: "イントロマスター", lowerId: "intro_ace", lowerName: "イントロエース" },
  { higherId: "outro_master", higherName: "アウトロマスター", lowerId: "outro_ace", lowerName: "アウトロエース" },
  {
    higherId: "full_chorus_master",
    higherName: "シャッフルマスター",
    lowerId: "shuffle_ace",
    lowerName: "シャッフルエース",
  },
  { higherId: "song_master", higherName: "リリックマスター", lowerId: "lyric_ace", lowerName: "リリックエース" },
  { higherId: "instant_master", higherName: "一瞬マスター", lowerId: "instant_ace", lowerName: "一瞬エース" },
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
  const { isAdmin = false, onAdminDeleteRequest = null, presenceEntry = null } = options;
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

  const nameRow = document.createElement("span");
  nameRow.className = "fan-profile-card-name-row";

  const name = document.createElement("span");
  name.className = "fan-profile-card-name";
  name.textContent = profile.displayName;
  nameRow.appendChild(name);

  // 【2026-11-XX新設・本人指示：フレンドのオンライン状態】presenceEntryが渡された
  // ときだけ表示する（options自体が省略された既存の呼び出し元・既存テストの見た目は
  // 変えない）。
  if (options.presenceEntry !== undefined) {
    const { text, isOnline, isPlaying } = buildPresenceStatusLabel(presenceEntry, Date.now());
    const statusChip = document.createElement("span");
    statusChip.className = "fan-profile-card-presence";
    statusChip.classList.toggle("is-online", isOnline);
    // 【2026-11-XX新設・本人指示：「🎮 プレイ中」表示】オンライン中の特別な一状態として、
    // 絵文字だけを🎮に差し替える（isOnline自体の判定・並び順・色分けはオンラインのまま）。
    const icon = isPlaying ? "🎮" : isOnline ? "🟢" : "⚫";
    statusChip.textContent = `${icon} ${text}`;
    nameRow.appendChild(statusChip);
  }
  body.appendChild(nameRow);

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

  if (onSelect) {
    card.addEventListener("click", () => {
      playSfx(SFX_EVENTS.UI_CLICK);
      onSelect(profile);
    });
  }
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
    playSfx(SFX_EVENTS.UI_CLICK);
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

// ===== クイズ系統（イントロ／アウトロ／ランダム再生／歌詞クイズ／一瞬チャレンジ）の定義 =====
// 称号を5つのクイズ系統に分け、各系統は「ステップアップ（ビギナー→チャレンジャー→
// エース）→マスターへの道→裏チャレンジ」の低→高の順で並ぶ1本のはしごとして扱う
// （本人指示・2026-08-29：「マスター称号は独立ブロックにせず、対応するクイズ系統の
// 通常ルートの最終段階として扱う」「裏チャレンジ称号だけは別の独立ブロックにする」）。
// 系統・称号IDの対応関係は、js/achievementDefinitions.jsの実際の定義（conditionText等）を
// 確認したうえで、名前からの推測ではなくID同士の対応として組んでいる。
// 「すべての称号を見る」（buildAchievedAchievementsList）・代表称号選出
// （getRepresentativeAchievementCandidates）の両方がこの同じ定義を再利用し、
// 称号の対応関係を二重管理しない。
// 【2026-08-30改訂・本人指示④⑥⑦⑬⑯】アウトロ系・一瞬チャレンジ系を追加し、5系統・
// イントロ→アウトロ→シャッフル→リリック→一瞬チャレンジの順に統一。
const ACHIEVEMENT_SERIES = [
  ["intro_beginner", "intro_challenger", "intro_ace", "no_miss_master", "lightning_fast"],
  ["outro_beginner", "outro_challenger", "outro_ace", "outro_master", "complete_finale"],
  ["shuffle_beginner", "shuffle_challenger", "shuffle_ace", "full_chorus_master", "melody_ace"],
  ["lyric_beginner", "lyric_challenger", "lyric_ace", "song_master", "lyric_master"],
  ["instant_beginner", "instant_challenger", "instant_ace", "instant_master", "instant_flash_answer"],
];
// ACHIEVEMENT_SERIESの各行の中身（低→高）の並びを名前で参照するためのインデックス定数。
const [TIER_BEGINNER, TIER_CHALLENGER, TIER_ACE, TIER_MASTER, TIER_BACK_CHALLENGE] = [0, 1, 2, 3, 4];

// クイズ系統の表示名（ACHIEVEMENT_SERIESと同じ順番＝イントロ／アウトロ／ランダム再生／
// 歌詞クイズ／一瞬チャレンジ）。「次のチャレンジ」案内文の組み立てに使う。
const SERIES_QUIZ_NAMES = ["イントロクイズ", "アウトロクイズ", "ランダム再生クイズ", "歌詞クイズ", "一瞬チャレンジ"];

// 「すべての称号を見る」に表示する、通常5系統のブロック構造（2026-08-30改訂・本人指示）。
// 各系統は「ビギナー→チャレンジャー→エース→マスター」の4段階（ACHIEVEMENT_SERIESの
// 先頭4件、TIER_BACK_CHALLENGEの手前まで）。裏チャレンジ（電光石火等）は「イントロを
// 使う称号ではあるが、通常のイントロ系の成長称号とは別物」（本人指示）のため、この5ブロックには
// 含めず、下の独立した裏チャレンジブロックにまとめる。
const NORMAL_SERIES_BLOCKS = [
  { label: "🎧 イントロ系", ids: ACHIEVEMENT_SERIES[0].slice(TIER_BEGINNER, TIER_BACK_CHALLENGE) },
  { label: "🎬 アウトロ系", ids: ACHIEVEMENT_SERIES[1].slice(TIER_BEGINNER, TIER_BACK_CHALLENGE) },
  { label: "🔀 シャッフル系", ids: ACHIEVEMENT_SERIES[2].slice(TIER_BEGINNER, TIER_BACK_CHALLENGE) },
  { label: "🎤 リリック系", ids: ACHIEVEMENT_SERIES[3].slice(TIER_BEGINNER, TIER_BACK_CHALLENGE) },
  { label: "⚡ 一瞬チャレンジ系", ids: ACHIEVEMENT_SERIES[4].slice(TIER_BEGINNER, TIER_BACK_CHALLENGE) },
];

// 裏チャレンジ5種（電光石火／完全終曲／絶対音感／完全記憶／即聞即答）。通常5系統には混ぜず、
// 独立したブロックとして、本人が取得しているものだけをイントロ→アウトロ→ランダム再生→
// 歌詞クイズ→一瞬チャレンジの順で表示する（本人指示）。
const BACK_CHALLENGE_IDS = ACHIEVEMENT_SERIES.map((series) => series[TIER_BACK_CHALLENGE]);

// ＝LOVEマスター・＝LOVE完全制覇に添える1行の説明。既存のconditionTextは長めの一文なので、
// この特別枠専用に、達成した到達点が一目で伝わる短い言い回しにする
// （本人指示：「表攻略の最終到達点」「裏攻略の最終到達点」という違いが伝わるように）。
const SPECIAL_ACHIEVEMENT_TAGLINES = {
  equal_love_master: "表攻略の最終到達点",
  equal_love_complete: "裏攻略の最終到達点",
};

// ＝LOVEマスター／＝LOVE完全制覇専用の特別カードを組み立てる（本人指示：「通常の称号と
// 同じ2列の小さな表示にはせず、明らかに特別な称号と分かる専用デザインに」）。
// 既存の称号一覧モーダル（js/achievementList.jsの.achievement-card--composite）が使う
// ＝LOVEマスター＝ゴールド系の発光、＝LOVE完全制覇＝紫〜水色系の発光と同じ配色・
// アニメーションをCSS側で再利用し、ゲーム全体でこの2称号の見た目に一貫性を持たせる
// （新しい色を作らず、既存デザインとの統一感を優先）。未獲得者には表示しない
// （呼び出し側がunlockedSetを見て判断する）。
function buildSpecialAchievementBlock(achievementId) {
  const definition = getAchievementById(achievementId);
  if (!definition) return null;

  const section = document.createElement("div");
  section.className = "fan-profile-achievement-block";

  const card = document.createElement("div");
  card.className = `fan-profile-special-achievement-card fan-profile-special-achievement-card--${achievementId}`;
  card.appendChild(buildAchievementIconMedal(definition.iconKey));

  const textBlock = document.createElement("div");
  textBlock.className = "fan-profile-special-achievement-text";

  const name = document.createElement("p");
  name.className = "fan-profile-special-achievement-name";
  name.textContent = definition.name;
  textBlock.appendChild(name);

  const tagline = document.createElement("p");
  tagline.className = "fan-profile-special-achievement-tagline";
  tagline.textContent = SPECIAL_ACHIEVEMENT_TAGLINES[achievementId] ?? "";
  textBlock.appendChild(tagline);

  const condition = document.createElement("p");
  condition.className = "fan-profile-special-achievement-condition";
  condition.textContent = definition.conditionText;
  textBlock.appendChild(condition);

  card.appendChild(textBlock);
  section.appendChild(card);
  return section;
}

// 通常の2列グリッドのブロック（イントロ系／シャッフル系／リリック系／裏チャレンジ）を
// 組み立てる共通ヘルパー。該当する取得済みIDが1件も無ければnullを返す。
function buildNormalAchievementBlock(label, idsInBlock) {
  if (idsInBlock.length === 0) return null;

  const section = document.createElement("div");
  section.className = "fan-profile-achievement-block";

  const heading = document.createElement("p");
  heading.className = "fan-profile-achievement-block-heading";
  heading.textContent = label;
  section.appendChild(heading);

  const grid = document.createElement("div");
  grid.className = "fan-profile-achievement-grid";
  idsInBlock.forEach((id) => {
    const card = buildAchievedCard(id);
    if (card) grid.appendChild(card);
  });
  section.appendChild(grid);

  return section;
}

// 取得済み称号を、以下の固定順（2026-08-30改訂・本人指示⑯）に並べたコンテナ要素を
// 組み立てる（他人のプロフィールでは取得済みだけ表示し、未取得称号は出さない）。
//   ①イントロ系→②アウトロ系→③シャッフル系→④リリック系→⑤一瞬チャレンジ系
//     （各ブロックの中はビギナー→チャレンジャー→エース→マスターの順）
//   →⑥＝LOVEマスター（取得者だけの特別枠）
//   →⑦裏チャレンジ（電光石火／完全終曲／絶対音感／完全記憶／即聞即答のうち取得済みのものだけ）
//   →⑧＝LOVE完全制覇（取得者だけの特別枠）
// 1件も無ければ「まだ称号を取得していません。」の案内だけを返す。
// 【2026-08-29再設計・本人指示】このリストの役割は、フレンド詳細モーダルの主表示から
// 「すべての称号を見る」の全件確認用。代表称号とは別の場所・別の目的の表示になったため、
// ここでは代表称号の絞り込みは行わず、取得済みを全件そのまま表示する（上位称号の取得に
// よって代表表示から省略された下位称号も、ここでは変わらず「取得済み」として確認できる。
// 本人指示：「取得データ自体を消したり未取得扱いにしたりしない」）。
// 「称号◯個」の個数バッジ（buildProfileCard・buildAchievementCountText）は、元から
// フィルタしていないunlockedAchievementIds.lengthを使うため、この変更による影響はない。
export function buildAchievedAchievementsList(unlockedAchievementIds) {
  const container = document.createElement("div");

  if (unlockedAchievementIds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "fan-profile-achievement-empty";
    empty.textContent = "まだ称号を取得していません。";
    container.appendChild(empty);
    return container;
  }

  const unlockedSet = new Set(unlockedAchievementIds);

  NORMAL_SERIES_BLOCKS.forEach((block) => {
    const section = buildNormalAchievementBlock(
      block.label,
      block.ids.filter((id) => unlockedSet.has(id))
    );
    if (section) container.appendChild(section);
  });

  if (unlockedSet.has("equal_love_master")) {
    container.appendChild(buildSpecialAchievementBlock("equal_love_master"));
  }

  const unlockedBackChallengeIds = BACK_CHALLENGE_IDS.filter((id) => unlockedSet.has(id));
  const backChallengeSection = buildNormalAchievementBlock("💎 裏チャレンジ", unlockedBackChallengeIds);
  if (backChallengeSection) container.appendChild(backChallengeSection);

  if (unlockedSet.has("equal_love_complete")) {
    container.appendChild(buildSpecialAchievementBlock("equal_love_complete"));
  }

  return container;
}

// マスター系・裏チャレンジ系の称号に添える、シンプルな日本語タグ（本人指示：
// 「変に英語のランク名などを新しく作る必要はない」）。ステップアップ系にはタグを付けない。
const CATEGORY_TAG_LABELS = { masterPath: "マスター称号", backChallenge: "裏チャレンジ称号" };

// フレンドプロフィールの代表称号を、表示順（本人指示・2026-08-29再設計）ですべて返す純粋関数。
// 上限（最大3個等）は設けない：裏チャレンジ・マスターはどちらも難関のため、片方を持って
// いるからもう片方が消えることは絶対にない。取得データ本体（unlockedAchievementIds）は
// 一切変更しない。
//
// 系統（イントロ／アウトロ／ランダム再生／歌詞クイズ／一瞬チャレンジ）ごとに、
// 以下のルールで代表候補を決める：
// ①裏チャレンジ称号を取得済みなら、必ず代表候補に含める。
// ②マスターへの道の称号を取得済みなら、必ず代表候補に含める（①とは独立。両方あれば両方出す）。
// ③裏チャレンジ・マスターのどちらも未取得の場合だけ、取得済みステップアップ称号のうち
//   最も上位のもの1つを代表候補に含める（本人指示：どちらか一方でも取得済みなら、
//   同じ系統のステップアップ称号はもう代表候補に出さない）。
// 表示順は「①裏チャレンジ×5系統→②マスター×5系統→③ステップアップ×5系統（必要な場合のみ）」
// に固定し、各グループ内はイントロ→アウトロ→ランダム再生→歌詞クイズ→一瞬チャレンジの順（本人指示）。
// ＝LOVEマスター・＝LOVE完全制覇（複合称号）は特定の系統に属さない別枠のため、
// この代表称号システムには含めない（最大でも裏チャレンジ5＋マスター5＝10個）。
// 取得済みかどうかは「すべての称号を見る」で確認できる。
export function getRepresentativeAchievementCandidates(unlockedAchievementIds) {
  const unlockedSet = new Set(unlockedAchievementIds);
  const backChallengeItems = [];
  const masterItems = [];
  const growthItems = [];

  ACHIEVEMENT_SERIES.forEach((seriesIdsLowToHigh) => {
    const backChallengeId = seriesIdsLowToHigh[TIER_BACK_CHALLENGE];
    const masterId = seriesIdsLowToHigh[TIER_MASTER];
    const hasBackChallenge = unlockedSet.has(backChallengeId);
    const hasMaster = unlockedSet.has(masterId);

    if (hasBackChallenge) backChallengeItems.push(getAchievementById(backChallengeId));
    if (hasMaster) masterItems.push(getAchievementById(masterId));

    if (!hasBackChallenge && !hasMaster) {
      const growthIdsHighToLow = [
        seriesIdsLowToHigh[TIER_ACE],
        seriesIdsLowToHigh[TIER_CHALLENGER],
        seriesIdsLowToHigh[TIER_BEGINNER],
      ];
      const topGrowthId = growthIdsHighToLow.find((id) => unlockedSet.has(id));
      if (topGrowthId) growthItems.push(getAchievementById(topGrowthId));
    }
  });

  return [...backChallengeItems, ...masterItems, ...growthItems].filter(Boolean);
}

// 各クイズ系統（イントロ／アウトロ／ランダム再生／歌詞クイズ／一瞬チャレンジ）で、
// 称号を1つでも取得しているかどうか。
// 「次のチャレンジ」案内の判定に使う（本人指示：プレイ履歴ではなく取得済み称号の有無で
// 判定する。「やったことがない」とは表示しない）。
function getSeriesHasAnyAchievement(unlockedSet) {
  return ACHIEVEMENT_SERIES.map((seriesIds) => seriesIds.some((id) => unlockedSet.has(id)));
}

// 「次のチャレンジ」案内カード（本人指示・2026-08-29追加）：5系統のうち称号0個の系統が
// 1つでもあれば、その系統名を挙げて挑戦を促す。5系統すべてに1個以上あれば、呼び出し側が
// このカード自体を呼ばない（本人指示：「そこから先はステップアップ・マスター・裏チャレンジを
// 目指す現在の称号表示だけで十分」）。
function buildNextChallengeCard(missingSeriesNames) {
  const card = document.createElement("div");
  card.className = "fan-profile-next-challenge";

  const title = document.createElement("p");
  title.className = "fan-profile-next-challenge-title";
  title.textContent = "🎯 次のチャレンジ";
  card.appendChild(title);

  const text = document.createElement("p");
  text.className = "fan-profile-next-challenge-text";
  text.textContent = `${missingSeriesNames.join("・")}の称号にも挑戦してみよう！`;
  card.appendChild(text);

  return card;
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

// フレンドプロフィール上部の「ランク感」＋代表称号（上限なし）＋「次のチャレンジ」を
// まとめて組み立てる（本人指示・2026-08-29再設計：称号0個／1〜2個／3個以上で見せ方を
// 変える。「1〜2個」「3個以上」は、js/fanProfileCard.jsのbuildAchievementCountTextと同じ
// unlockedAchievementIds.length＝獲得称号の総数を基準にする）。
// ・0個：「これから挑戦！」＋イントロクイズから始める案内（次のチャレンジカードは出さない。
//   このメッセージ自体がその役割を兼ねる）
// ・1〜2個：「CHALLENGER」＋取得済みの代表称号＋（未取得系統があれば）次のチャレンジ
// ・3個以上：「代表称号」＋優先順位に沿った代表称号＋（未取得系統があれば）次のチャレンジ
// 「次のチャレンジ」は、5系統（イントロ／アウトロ／ランダム再生／歌詞クイズ／一瞬チャレンジ）の
// うち称号0個の系統が1つでもあれば表示し、5系統すべてに1個以上あれば表示しない
// （本人指示：CHALLENGER専用の機能にしない。称号3個以上でも未取得系統があれば表示する）。
export function buildFriendAchievementSummary(unlockedAchievementIds) {
  const container = document.createElement("div");
  container.className = "fan-profile-achievement-summary";

  const unlockedSet = new Set(unlockedAchievementIds);

  const rankLabel = document.createElement("p");
  rankLabel.className = "fan-profile-rank-label";
  container.appendChild(rankLabel);

  if (unlockedAchievementIds.length === 0) {
    rankLabel.textContent = "これから挑戦！";
    rankLabel.classList.add("is-empty");
    const hintLine1 = document.createElement("p");
    hintLine1.className = "fan-profile-rank-empty-hint";
    hintLine1.textContent = "まずはイントロクイズから挑戦してみよう！";
    container.appendChild(hintLine1);
    const hintLine2 = document.createElement("p");
    hintLine2.className = "fan-profile-rank-empty-hint";
    hintLine2.textContent = "慣れてきたらランダム再生クイズ・歌詞クイズにも挑戦！";
    container.appendChild(hintLine2);
    return container;
  }

  const isChallenger = unlockedAchievementIds.length <= 2;
  rankLabel.textContent = isChallenger ? "CHALLENGER" : "代表称号";
  rankLabel.classList.add(isChallenger ? "is-challenger" : "is-representative");

  const candidates = getRepresentativeAchievementCandidates(unlockedAchievementIds);
  const list = document.createElement("div");
  list.className = "fan-profile-representative-list";
  candidates.forEach((achievement) => {
    list.appendChild(buildRepresentativeAchievementChip(achievement));
  });
  container.appendChild(list);

  const seriesHasAny = getSeriesHasAnyAchievement(unlockedSet);
  const missingSeriesNames = SERIES_QUIZ_NAMES.filter((_name, index) => !seriesHasAny[index]);
  if (missingSeriesNames.length > 0) {
    container.appendChild(buildNextChallengeCard(missingSeriesNames));
  }

  return container;
}
