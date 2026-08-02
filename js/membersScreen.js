// メンバー一覧画面・メンバー詳細画面を担当するファイル。
// センター曲・参加ユニットはmembers.jsに持たせず、js/memberUtils.jsがsongs.jsから
// 都度算出したものをそのまま描画する（5-1章の「songs.js中心の一元管理」を踏襲）。
//
// members.js（基本プロフィール）・memberProfiles.js（紹介文・趣味・特技・愛称・ファンネーム・
// 加入前の活動・志望動機）・memberActivities.js（個人活動・レギュラー企画）の3ファイルを
// 突き合わせてメンバー詳細画面を組み立てる（2026-08-02、ファイル分割方針）。
// 各項目は、公式情報で確認できなかったものをnull/空のままにする方針（HANDOFF 2-2章参照）。
// そのため、このファイルは値がnull/空のときに「未確認」と表示するか、
// セクションごと非表示にする分岐を必ず用意している。

import {
  getActiveMembers,
  getGraduatedMembers,
  getMemberCenterSongs,
  getMemberUnitSongs,
  getMemberFirstCenterSong,
  getMemberProfile,
  getMemberActivities,
} from "./memberUtils.js";

// この画面が使うDOM要素一式。initMembersScreen()で受け取って保持する。
let elements = null;

// メンバー一覧で最後に開いた（＝現在詳細を表示している）メンバーのid。
// 一覧に戻ったときに、そのメンバーのカードへアクセントを付けるために保持する。
let lastViewedMemberId = null;

// メンバーカラーが未確認のときの、控えめな代替背景。
const UNCONFIRMED_SWATCH_BACKGROUND = "linear-gradient(145deg, #e8dde3, #d8c8d2)";

// memberColor（{ name, hex } | null）から、丸バッジ・色見本に使うCSSの背景指定を組み立てる。
// name（色名テキスト）とhex（実際の描画色）は別物として持たせているため、必ずhexの方を使う。
function buildSwatchStyle(color) {
  return color?.hex ? `background: ${color.hex};` : `background: ${UNCONFIRMED_SWATCH_BACKGROUND};`;
}

// 公式・本人発信以外の情報（fan等）にだけ、小さな注記チップを添える。
// official/selfは表示過多を避けるため何も出さない（本人希望：「毎回大きく表示する必要はない」）。
const SOURCE_TYPE_LABELS = { reliable: "メディア報道", fan: "ファンの間で定着" };

function buildSourceBadge(sourceType) {
  const label = SOURCE_TYPE_LABELS[sourceType];
  if (!label) return null;
  const badge = document.createElement("span");
  badge.className = "source-badge";
  badge.textContent = label;
  return badge;
}

// 1〜20の数字を丸数字（①②③…）に変換する。出席番号は10人程度を想定しているため、
// 範囲外の場合は素の数字にフォールバックする。
function toCircledNumber(number) {
  const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
  if (number >= 1 && number <= circled.length) {
    return circled[number - 1];
  }
  return `${number}.`;
}

// ---- 現役メンバー一覧 ----

function buildActiveMemberCard(member) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "member-card";
  if (member.id === lastViewedMemberId) {
    card.classList.add("is-selected");
  }
  card.addEventListener("click", () => elements.onSelectMember(member.id));

  const swatch = document.createElement("span");
  swatch.className = "member-card-swatch";
  swatch.style.cssText = buildSwatchStyle(member.memberColor);
  card.appendChild(swatch);

  const name = document.createElement("p");
  name.className = "member-card-name";
  name.textContent = `${toCircledNumber(member.attendanceNumber)}${member.name}`;
  card.appendChild(name);

  if (member.roles && member.roles.length > 0) {
    const roleTag = document.createElement("span");
    roleTag.className = "member-card-role-tag";
    roleTag.textContent = member.roles[0];
    card.appendChild(roleTag);
  }

  return card;
}

function renderActiveMembers(members) {
  const activeMembers = getActiveMembers(members);
  elements.activeCount.textContent = `出席番号順・${activeMembers.length}人`;
  elements.activeGrid.innerHTML = "";
  activeMembers.forEach((member) => {
    elements.activeGrid.appendChild(buildActiveMemberCard(member));
  });
}

// ---- 卒業メンバー（簡易紹介） ----

function buildGraduatedCard(songs, members, profiles, member) {
  const card = document.createElement("div");
  card.className = "graduated-card";

  const swatch = document.createElement("span");
  swatch.className = "graduated-card-swatch";
  swatch.style.cssText = buildSwatchStyle(member.memberColor);
  card.appendChild(swatch);

  const info = document.createElement("div");
  info.className = "graduated-card-info";

  const name = document.createElement("p");
  name.className = "graduated-card-name";
  name.textContent = member.name;
  info.appendChild(name);

  const period = document.createElement("p");
  period.className = "graduated-card-period";
  const start = member.activePeriod?.start ?? "未確認";
  const end = member.activePeriod?.end ?? member.graduationDate ?? "未確認";
  period.textContent = `在籍：${start} 〜 ${end}`;
  info.appendChild(period);

  const centerSongs = getMemberCenterSongs(songs, members, member.id);
  if (centerSongs.length > 0) {
    const center = document.createElement("p");
    center.className = "graduated-card-center";
    center.textContent = `センター曲：${centerSongs.map((song) => song.title).join("・")}`;
    info.appendChild(center);
  }

  const profile = getMemberProfile(profiles, member.id);
  if (profile?.preDebutActivity) {
    const preDebut = document.createElement("p");
    preDebut.className = "graduated-card-predebut";
    preDebut.textContent = profile.preDebutActivity.text;
    info.appendChild(preDebut);
  }

  // 齊藤なぎさのように卒業後も芸能活動を続けているメンバーだけ、現在の所属・リンクを追加表示する
  // （13章の方針：全出演歴の網羅はしない、簡潔な現状紹介のみ）。
  if (member.currentAffiliation) {
    const current = document.createElement("p");
    current.className = "graduated-card-current";
    current.textContent = `＝LOVE卒業後も芸能活動中（現在の所属：${member.currentAffiliation}）`;
    info.appendChild(current);

    const currentLinks = document.createElement("div");
    currentLinks.className = "graduated-card-links";
    const linkDefs = [
      { key: "profile", label: "現在の公式プロフィール" },
      { key: "x", label: "現在の公式X" },
      { key: "instagram", label: "現在の公式Instagram" },
      { key: "tiktok", label: "現在の公式TikTok" },
    ];
    linkDefs.forEach(({ key, label }) => {
      const url = member.officialLinks?.[key];
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = label;
      currentLinks.appendChild(a);
    });
    info.appendChild(currentLinks);
  } else {
    // 現在の活動を追跡していないメンバー（佐竹のん乃）は、従来通り関連リンクを1件だけ表示する。
    const link = member.officialLinks?.others?.[0];
    if (link) {
      const linkElement = document.createElement("a");
      linkElement.className = "graduated-card-link";
      linkElement.href = link.url;
      linkElement.target = "_blank";
      linkElement.rel = "noopener noreferrer";
      linkElement.textContent = link.label ?? "関連リンク";
      info.appendChild(linkElement);
    }
  }

  card.appendChild(info);

  const tag = document.createElement("span");
  tag.className = "graduated-card-tag";
  tag.textContent = "卒業";
  card.appendChild(tag);

  return card;
}

function renderGraduatedMembers(songs, members, profiles) {
  const graduatedMembers = getGraduatedMembers(members);
  elements.graduatedList.innerHTML = "";
  graduatedMembers.forEach((member) => {
    elements.graduatedList.appendChild(buildGraduatedCard(songs, members, profiles, member));
  });
}

// ---- メンバー詳細：共通パーツ ----

function buildFactRow(label, value) {
  const row = document.createElement("div");
  row.className = "fact-row";
  const k = document.createElement("span");
  k.className = "fact-row-key";
  k.textContent = label;
  row.appendChild(k);
  const v = document.createElement("span");
  v.className = "fact-row-value";
  if (value === null || value === undefined || value === "") {
    v.classList.add("is-unconfirmed");
    v.textContent = "未確認";
  } else {
    v.textContent = value;
  }
  row.appendChild(v);
  return row;
}

// メンバーカラー／ペンライトカラー専用の行。色名のテキストに加えて、小さな色見本（丸）を
// 1色ずつ添える。colorsは { name, hex } の配列を受け取る（1色でも配列にして渡す）。
function buildColorFactRow(label, colors) {
  const row = document.createElement("div");
  row.className = "fact-row";

  const k = document.createElement("span");
  k.className = "fact-row-key";
  k.textContent = label;
  row.appendChild(k);

  const v = document.createElement("span");
  v.className = "fact-row-value color-fact-value";

  if (!colors || colors.length === 0) {
    v.classList.add("is-unconfirmed");
    v.textContent = "未確認";
  } else {
    colors.forEach((color, index) => {
      if (index > 0) {
        // 色が3つ以上あるときは、2つごとに改行して見やすくする（文字サイズは縮めない方針。
        // 2026-08-03、瀧脇笙古の3色表示で行間が詰まって見づらかったことへの対応）。
        const startsNewLine = colors.length >= 3 && index % 2 === 0;
        if (startsNewLine) {
          // color-fact-valueはdisplay:flexのため、<br>では改行できない。
          // flex-basis:100%の空要素を挟むことで、flexboxの中でも強制的に折り返す。
          const lineBreak = document.createElement("span");
          lineBreak.className = "color-fact-linebreak";
          v.appendChild(lineBreak);
        } else {
          v.appendChild(document.createTextNode(" × "));
        }
      }
      // 丸と色名を1つのまとまり（改行時に離れない）にする。
      const swatch = document.createElement("span");
      swatch.className = "color-swatch-pair";
      const dot = document.createElement("span");
      dot.className = "color-swatch-dot";
      dot.style.cssText = buildSwatchStyle(color);
      swatch.appendChild(dot);
      swatch.appendChild(document.createTextNode(color.name));
      v.appendChild(swatch);
    });
  }

  row.appendChild(v);
  return row;
}

function buildSectionHeading(label) {
  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = label;
  return heading;
}

// 「短い紹介文」「加入前の活動」「志望動機」など、1件のテキスト＋情報源バッジで構成する
// カード。dataがnullのときはカード自体を作らない（呼び出し側でappendしない想定）。
function buildTextCard(data) {
  const card = document.createElement("div");
  card.className = "text-card";

  const text = document.createElement("p");
  text.className = "text-card-body";
  text.textContent = data.text;
  card.appendChild(text);

  const badge = buildSourceBadge(data.sourceType);
  if (badge) {
    card.appendChild(badge);
  }

  return card;
}

function buildItemListCard(items) {
  const card = document.createElement("div");
  card.className = "text-card";
  const list = document.createElement("p");
  list.className = "text-card-body";
  list.textContent = items.join("、");
  card.appendChild(list);
  return card;
}

function buildSongChipRow(songs, emptyMessage) {
  const wrapper = document.createElement("div");

  if (songs.length === 0) {
    const notice = document.createElement("p");
    notice.className = "empty-state-note";
    notice.textContent = emptyMessage;
    wrapper.appendChild(notice);
    return wrapper;
  }

  const chipRow = document.createElement("div");
  chipRow.className = "chip-row";
  songs.forEach((song) => {
    const chip = document.createElement("span");
    chip.className = "song-chip";
    chip.textContent = song.title;
    chipRow.appendChild(chip);
  });
  wrapper.appendChild(chipRow);
  return wrapper;
}

const OFFICIAL_LINK_LABELS = { profile: "公式プロフィール", x: "公式X", instagram: "公式Instagram", tiktok: "公式TikTok" };

function buildOfficialLinksSection(officialLinks) {
  const wrapper = document.createElement("div");
  const fixedLinks = Object.entries(OFFICIAL_LINK_LABELS)
    .map(([key, label]) => ({ label, url: officialLinks?.[key] }))
    .filter((link) => link.url);
  const otherLinks = (officialLinks?.others ?? []).filter((link) => link.url);
  const allLinks = [...fixedLinks, ...otherLinks];

  if (allLinks.length === 0) {
    const notice = document.createElement("p");
    notice.className = "empty-state-note";
    notice.textContent = "公式リンクは準備中です";
    wrapper.appendChild(notice);
    return wrapper;
  }

  allLinks.forEach((link) => {
    const a = document.createElement("a");
    a.className = "official-link-button";
    a.href = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = link.label;
    wrapper.appendChild(a);
  });

  return wrapper;
}

const ACTIVITY_TYPE_LABELS = {
  youtube: "YouTube",
  radio: "ラジオ",
  showroom: "SHOWROOM",
  tv: "テレビ",
  model: "モデル",
  stage: "舞台",
  voice: "声優",
  sports: "スポーツ",
  other: "活動",
};

// activity.status（ACTIVITY_STATUS）ごとの表示ラベルと見た目のクラス。
// unknownはタグ自体を出さない（現況が確認できないものをあえて強調しないため）。
export const ACTIVITY_STATUS_LABELS = {
  ongoing: { text: "継続中", className: "is-ongoing" },
  annual: { text: "年次開催", className: "is-annual" },
  irregular: { text: "不定期", className: "is-irregular" },
  ended: { text: "終了", className: "is-ended" },
  past: { text: "過去の活動", className: "is-past" },
};

// カード一覧の並び順（現在も動きがある活動ほど代表的、という考え方で優先度を決める）。
export const ACTIVITY_STATUS_ORDER = ["ongoing", "annual", "irregular", "ended", "past", "unknown"];

// 活動一覧を並べ替える。priorityを持つ活動（大谷映美里のブランドカード等、表示順を固定したい
// もの）を数値の小さい順に最優先で並べ、priorityを持たない活動同士は従来通りstatusの
// 代表性順で並べる（2026-08-03、本人希望の表示順固定に対応するため追加）。
export function sortActivitiesByStatus(activities) {
  return [...activities].sort((a, b) => {
    const aPriority = a.priority ?? null;
    const bPriority = b.priority ?? null;
    if (aPriority !== null && bPriority !== null) return aPriority - bPriority;
    if (aPriority !== null) return -1;
    if (bPriority !== null) return 1;
    return ACTIVITY_STATUS_ORDER.indexOf(a.status) - ACTIVITY_STATUS_ORDER.indexOf(b.status);
  });
}

export function buildActivityCard(activity) {
  const card = document.createElement("div");
  card.className = "activity-card";

  const typeTag = document.createElement("span");
  typeTag.className = "activity-card-type";
  typeTag.textContent = ACTIVITY_TYPE_LABELS[activity.type] ?? activity.type;
  card.appendChild(typeTag);

  const statusInfo = ACTIVITY_STATUS_LABELS[activity.status];
  if (statusInfo) {
    const statusTag = document.createElement("span");
    statusTag.className = `activity-card-status ${statusInfo.className}`;
    statusTag.textContent = statusInfo.text;
    card.appendChild(statusTag);
  }

  const title = document.createElement("p");
  title.className = "activity-card-title";
  title.textContent = activity.title;
  card.appendChild(title);

  if (activity.description) {
    const description = document.createElement("p");
    description.className = "activity-card-description";
    description.textContent = activity.description;
    card.appendChild(description);
  }

  // linksが指定されていればそれを使い、無ければurlから「公式ページ」ボタンを1つ自動生成する
  // （既存のurl一本のデータを壊さず、複数リンクにも対応できるようにするため）。
  const links = activity.links ?? (activity.url ? [{ label: "公式ページ", url: activity.url }] : []);
  links.forEach((link) => {
    const linkButton = document.createElement("a");
    linkButton.className = "official-link-button activity-card-link";
    linkButton.href = link.url;
    linkButton.target = "_blank";
    linkButton.rel = "noopener noreferrer";
    linkButton.textContent = link.label;
    card.appendChild(linkButton);
  });

  return card;
}

// ---- メンバー詳細：画面全体の組み立て ----

function renderMemberDetail(songs, members, profiles, activities, member) {
  const profile = getMemberProfile(profiles, member.id);
  const memberActivities = getMemberActivities(activities, member.id);

  elements.memberDetailName.textContent = member.name;
  elements.memberDetailContent.innerHTML = "";

  // 1. ヒーロー（名前・読み方・出席番号・役割・代表カラー）
  const hero = document.createElement("div");
  hero.className = "detail-hero";

  const swatch = document.createElement("span");
  swatch.className = "member-detail-swatch";
  swatch.style.cssText = buildSwatchStyle(member.memberColor);
  hero.appendChild(swatch);

  const name = document.createElement("p");
  name.className = "member-detail-name";
  name.textContent = member.name;
  hero.appendChild(name);

  const reading = document.createElement("p");
  reading.className = "member-detail-reading";
  reading.textContent = member.reading ?? "読み方：未確認";
  hero.appendChild(reading);

  const badgeRow = document.createElement("div");
  badgeRow.className = "member-detail-badge-row";
  const attendance = document.createElement("span");
  attendance.className = "member-detail-attendance";
  attendance.textContent = `出席番号 ${member.attendanceNumber}番`;
  badgeRow.appendChild(attendance);
  (member.roles ?? []).forEach((role) => {
    const roleBadge = document.createElement("span");
    roleBadge.className = "member-detail-role-badge";
    roleBadge.textContent = role;
    badgeRow.appendChild(roleBadge);
  });
  hero.appendChild(badgeRow);

  const colorFacts = document.createElement("div");
  colorFacts.className = "fact-list";
  colorFacts.appendChild(buildColorFactRow("メンバーカラー", member.memberColor ? [member.memberColor] : null));
  colorFacts.appendChild(buildColorFactRow("ペンライトカラー", member.penlightColors));
  hero.appendChild(colorFacts);

  elements.memberDetailContent.appendChild(hero);

  // 2. 短い紹介文
  if (profile?.introduction) {
    elements.memberDetailContent.appendChild(buildSectionHeading("紹介"));
    elements.memberDetailContent.appendChild(buildTextCard(profile.introduction));
  }

  // 3. 基本プロフィール
  elements.memberDetailContent.appendChild(buildSectionHeading("プロフィール"));
  const profileFacts = document.createElement("div");
  profileFacts.className = "fact-list";
  profileFacts.appendChild(buildFactRow("生年月日", member.birthday));
  profileFacts.appendChild(buildFactRow("出身地", member.birthplace));
  profileFacts.appendChild(buildFactRow("身長", member.heightCm ? `${member.heightCm}cm` : null));
  profileFacts.appendChild(buildFactRow("血液型", member.bloodType));
  profileFacts.appendChild(buildFactRow("星座", member.zodiacSign));
  profileFacts.appendChild(buildFactRow("加入日", member.joinDate));
  elements.memberDetailContent.appendChild(profileFacts);

  // 4. 趣味・特技・好きなもの（1件でもあればセクションを出す）
  const hasHobbies = profile?.hobbies?.items?.length > 0;
  const hasSkills = profile?.skills?.items?.length > 0;
  const hasFavorites = profile?.favoriteThings?.items?.length > 0;
  if (hasHobbies || hasSkills || hasFavorites) {
    elements.memberDetailContent.appendChild(buildSectionHeading("趣味・特技・好きなもの"));
    const trivia = document.createElement("div");
    trivia.className = "fact-list";
    if (hasHobbies) trivia.appendChild(buildFactRow("趣味", profile.hobbies.items.join("、")));
    if (hasSkills) trivia.appendChild(buildFactRow("特技", profile.skills.items.join("、")));
    if (hasFavorites) trivia.appendChild(buildFactRow("好きなもの", profile.favoriteThings.items.join("、")));
    elements.memberDetailContent.appendChild(trivia);
  }

  // 5. ＝LOVE加入前の活動（「前世」という表現は使わない）
  if (profile?.preDebutActivity) {
    elements.memberDetailContent.appendChild(buildSectionHeading("＝LOVE加入前の活動"));
    elements.memberDetailContent.appendChild(buildTextCard(profile.preDebutActivity));
  }

  // 6. ＝LOVEを目指したきっかけ
  if (profile?.auditionMotivation) {
    elements.memberDetailContent.appendChild(buildSectionHeading("＝LOVEを目指したきっかけ"));
    elements.memberDetailContent.appendChild(buildTextCard(profile.auditionMotivation));
  }

  // 6.5. エピソード・転機（活動休止・センター交代など、紹介文に入れると長くなる出来事。
  // 現時点では髙松瞳のみ登録。データがあるメンバーだけ表示する）
  if (profile?.episodeNote) {
    elements.memberDetailContent.appendChild(buildSectionHeading("エピソード・転機"));
    elements.memberDetailContent.appendChild(buildTextCard(profile.episodeNote));
  }

  // 7. ＝LOVEでの役割・活動データ
  const centerSongs = getMemberCenterSongs(songs, members, member.id);
  const unitSongs = getMemberUnitSongs(songs, members, member.id);
  const firstCenterSong = getMemberFirstCenterSong(songs, members, member.id);
  elements.memberDetailContent.appendChild(buildSectionHeading("＝LOVEでの活動"));
  const activityFacts = document.createElement("div");
  activityFacts.className = "fact-list";
  if (member.roles && member.roles.length > 0) {
    activityFacts.appendChild(buildFactRow("役割", member.roles.join("・")));
  }
  activityFacts.appendChild(buildFactRow("センター曲数", `${centerSongs.length}曲`));
  activityFacts.appendChild(buildFactRow("参加ユニット数", `${unitSongs.length}曲`));
  activityFacts.appendChild(buildFactRow("初センター曲", firstCenterSong?.title ?? null));
  elements.memberDetailContent.appendChild(activityFacts);

  // 8. センター曲一覧
  elements.memberDetailContent.appendChild(buildSectionHeading("センター曲"));
  elements.memberDetailContent.appendChild(
    buildSongChipRow(centerSongs, "センターを務めた曲はまだ確認できていません")
  );

  // 9. 参加ユニット一覧
  elements.memberDetailContent.appendChild(buildSectionHeading("参加ユニット"));
  elements.memberDetailContent.appendChild(
    buildSongChipRow(unitSongs, "参加しているユニット曲はまだ確認できていません")
  );

  // 10. 個人活動・レギュラー企画（無ければセクションごと非表示）
  if (memberActivities.length > 0) {
    elements.memberDetailContent.appendChild(buildSectionHeading("個人活動・レギュラー企画"));
    const activityList = document.createElement("div");
    activityList.className = "activity-list";
    sortActivitiesByStatus(memberActivities).forEach((activity) => activityList.appendChild(buildActivityCard(activity)));
    elements.memberDetailContent.appendChild(activityList);
  }

  // 11. ファンの愛称・ニックネーム（無ければセクションごと非表示）
  const nicknames = profile?.nicknames ?? [];
  const fanName = profile?.fanName ?? null;
  if (nicknames.length > 0 || fanName) {
    elements.memberDetailContent.appendChild(buildSectionHeading("愛称・ファンネーム"));
    const chipRow = document.createElement("div");
    chipRow.className = "chip-row";
    nicknames.forEach((nickname) => {
      const chip = document.createElement("span");
      chip.className = "nickname-chip";
      chip.textContent = nickname.text;
      const badge = buildSourceBadge(nickname.sourceType);
      if (badge) chip.appendChild(badge);
      chipRow.appendChild(chip);
    });
    if (fanName) {
      const chip = document.createElement("span");
      chip.className = "nickname-chip is-fanname";
      chip.textContent = `ファンの愛称：${fanName.text}`;
      const badge = buildSourceBadge(fanName.sourceType);
      if (badge) chip.appendChild(badge);
      chipRow.appendChild(chip);
    }
    elements.memberDetailContent.appendChild(chipRow);
  }

  // 12. 公式リンク
  elements.memberDetailContent.appendChild(buildSectionHeading("公式リンク"));
  elements.memberDetailContent.appendChild(buildOfficialLinksSection(member.officialLinks));
}

// メンバー一覧画面全体（現役グリッド＋卒業メンバー）を描画する。
export function renderMembersScreen(songs, members, profiles) {
  renderActiveMembers(members);
  renderGraduatedMembers(songs, members, profiles);
}

// メンバーカードがタップされたときに、メンバー詳細画面へ渡すデータを組み立てる。
export function openMemberDetail(songs, members, profiles, activities, memberId) {
  const member = members.find((candidate) => candidate.id === memberId);
  if (!member) return;
  lastViewedMemberId = memberId;
  renderMemberDetail(songs, members, profiles, activities, member);
}

// メンバー一覧・詳細画面を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
//
// elements: {
//   activeGrid, activeCount: 現役メンバーグリッドとその人数表示,
//   graduatedList: 卒業メンバーの簡易カードを並べる場所,
//   memberDetailName, memberDetailContent: メンバー詳細画面の中身,
//   onSelectMember: 現役メンバーのカードがタップされたときに呼ばれるコールバック（memberIdを受け取る）,
// }
export function initMembersScreen(newElements) {
  elements = newElements;
}
