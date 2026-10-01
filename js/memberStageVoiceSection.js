// メンバー個人ページの「STAGE（舞台・朗読劇）」「VOICE（声優・ボイス出演）」セクションを組み立てる。
// データは js/data/memberStageVoice.js（作品ごとに1件・出演メンバーはcasts配列）にあり、
// ここでは「このメンバーが出演している作品だけを抜き出して、新しい順のカードにする」役目を持つ。
// membersScreen.js から呼ばれる想定で、membersScreen.js 側は import するだけにして
// 画面全体のコードが膨らまないようにしている（循環importを避けるため、このファイルは
// membersScreen.js を import しない）。
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { STAGE_PRODUCTIONS, VOICE_APPEARANCES } from "./data/memberStageVoice.js";

// VOICEは出演数がメンバーで大きく違う（野口衣織は20件超、2〜3件のメンバーもいる）。
// 最初に見せる件数。これを超えた分だけ「もっと見る」で折りたたむ（少ないメンバーでは折りたたみ自体を出さない）。
export const VOICE_INITIAL_VISIBLE_COUNT = 5;
export const STAGE_INITIAL_VISIBLE_COUNT = 5;
const OFFICIAL_LABEL = "公式サイト";

// 作品配列から「このメンバーが出演する作品」だけを、sortKeyの新しい順で返す。
// 各要素は { work, cast } で、castはそのメンバー本人の配役。
export function pickMemberWorks(works, memberId) {
  return works
    .map((work) => ({ work, cast: work.casts.find((entry) => entry.memberId === memberId) ?? null }))
    .filter((entry) => entry.cast !== null)
    .sort((a, b) => (a.work.sortKey < b.work.sortKey ? 1 : a.work.sortKey > b.work.sortKey ? -1 : 0));
}

// 配役の表示文字列。役名があれば「〇〇 役」、無ければcredit（「ゲスト出演」等）、どちらも無ければ「出演」。
export function formatCastRole(cast) {
  if (cast.role) {
    return `${cast.role} 役${cast.credit ?? ""}`;
  }
  return cast.credit ?? "出演";
}

function getMemberName(memberId) {
  const member = MEMBERS.find((entry) => entry.id === memberId);
  return { name: member?.name ?? memberId, isFormer: member?.status === MEMBER_STATUS.GRADUATED };
}

function buildTag(text, className) {
  const tag = document.createElement("span");
  tag.className = className;
  tag.textContent = text;
  return tag;
}

function buildLinkButtons(links) {
  const row = document.createElement("div");
  row.className = "stage-voice-link-row";
  (links ?? []).forEach((link) => {
    const button = document.createElement("a");
    button.className = "official-link-button activity-card-link";
    button.href = link.url;
    // 外部リンクを押してもアプリ（PWA）の画面が消えないよう、別タブ＋opener遮断で開く。
    button.target = "_blank";
    button.rel = "noopener noreferrer";
    button.textContent = link.label;
    row.appendChild(button);
  });
  return row;
}

// 全員出演作品の「配役を見る」展開部分。現役・元メンバーを分けず、dataのcasts順（本人指定の順）に
// 1つの一覧で並べる。元メンバーだけ名前の横に小さく「（元メンバー）」を添える。
function buildFullCastDetails(work, currentMemberId) {
  const details = document.createElement("details");
  details.className = "stage-voice-cast-details";

  const summary = document.createElement("summary");
  summary.className = "stage-voice-cast-summary";
  summary.textContent = `全キャスト・配役を見る（${work.casts.length}人）`;
  details.appendChild(summary);

  const list = document.createElement("ul");
  list.className = "stage-voice-cast-list";
  work.casts.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "stage-voice-cast-item";
    if (entry.memberId === currentMemberId) {
      item.classList.add("is-self");
    }
    const { name, isFormer } = getMemberName(entry.memberId);
    const nameSpan = document.createElement("span");
    nameSpan.className = "stage-voice-cast-name";
    nameSpan.textContent = name;
    item.appendChild(nameSpan);
    if (isFormer) {
      item.appendChild(buildTag("（元メンバー）", "stage-voice-former-note"));
    }
    const roleSpan = document.createElement("span");
    roleSpan.className = "stage-voice-cast-role";
    roleSpan.textContent = formatCastRole(entry);
    item.appendChild(roleSpan);
    list.appendChild(item);
  });
  details.appendChild(list);
  return details;
}

// 作品カード1枚。既存の個人活動カード（.activity-card）と同じ見た目の土台に、
// 配役行・日程・展開部分を足した構成にして、ページ全体の雰囲気を揃えている。
export function buildStageVoiceCard({ work, cast }, memberId, kind) {
  const card = document.createElement("div");
  card.className = "activity-card stage-voice-card";
  card.dataset.workId = work.id;

  const category = work.categoryOverrides?.[memberId] ?? work.category;
  card.appendChild(buildTag(category, "activity-card-type"));
  card.appendChild(buildTag(work.yearLabel, "stage-voice-year"));

  const title = document.createElement("p");
  title.className = "activity-card-title";
  title.textContent = work.title;
  card.appendChild(title);

  if (work.period) {
    const period = document.createElement("p");
    period.className = "stage-voice-period";
    period.textContent = work.period;
    card.appendChild(period);
  }

  // 「野口衣織 ／ オーロックス 役」のように本人の役を目立たせる行
  const { name } = getMemberName(memberId);
  const role = document.createElement("p");
  role.className = "stage-voice-role";
  role.textContent = `${name} ／ ${formatCastRole(cast)}`;
  card.appendChild(role);

  if (work.description) {
    const description = document.createElement("p");
    description.className = "activity-card-description stage-voice-description";
    description.textContent = work.description;
    card.appendChild(description);
  }

  if (kind === "stage" && work.showFullCast) {
    card.appendChild(buildFullCastDetails(work, memberId));
  }

  if ((work.links ?? []).length > 0) {
    card.appendChild(buildLinkButtons(work.links));
  }
  return card;
}

function buildHeading(label, sub) {
  const heading = document.createElement("p");
  heading.className = "section-heading stage-voice-heading";
  heading.textContent = label;
  const subText = document.createElement("span");
  subText.className = "stage-voice-heading-sub";
  subText.textContent = sub;
  heading.appendChild(subText);
  return heading;
}

// 件数が多いときの「もっと見る」ボタン。押すと隠していたカードを出し、もう一度押すと畳む。
function buildMoreToggle(hiddenCards) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage-voice-more-button";
  button.setAttribute("aria-expanded", "false");
  const update = (expanded) => {
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "たたむ" : `もっと見る（残り${hiddenCards.length}件）`;
    hiddenCards.forEach((card) => {
      card.hidden = !expanded;
    });
  };
  update(false);
  button.addEventListener("click", () => update(button.getAttribute("aria-expanded") !== "true"));
  return button;
}

function buildSection(entries, memberId, kind, label, sub, initialVisibleCount) {
  const fragment = document.createDocumentFragment();
  const section = document.createElement("div");
  section.className = `stage-voice-section is-${kind}`;
  section.dataset.section = kind;
  section.appendChild(buildHeading(label, sub));

  const list = document.createElement("div");
  list.className = "activity-list stage-voice-list";
  const cards = entries.map((entry) => buildStageVoiceCard(entry, memberId, kind));
  cards.forEach((card) => list.appendChild(card));
  section.appendChild(list);

  const hiddenCards = cards.slice(initialVisibleCount);
  if (hiddenCards.length > 0) {
    section.appendChild(buildMoreToggle(hiddenCards));
  }
  fragment.appendChild(section);
  return fragment;
}

// STAGE／VOICEの2セクションをまとめたDocumentFragmentを返す。どちらも該当が0件なら空のfragment
// （＝セクションごと非表示）になるので、呼び出し側は無条件にappendしてよい。
export function buildMemberStageVoiceSections(memberId) {
  const fragment = document.createDocumentFragment();
  const stageEntries = pickMemberWorks(STAGE_PRODUCTIONS, memberId);
  if (stageEntries.length > 0) {
    fragment.appendChild(buildSection(stageEntries, memberId, "stage", "STAGE", "　舞台・ミュージカル・朗読劇", STAGE_INITIAL_VISIBLE_COUNT));
  }
  const voiceEntries = pickMemberWorks(VOICE_APPEARANCES, memberId);
  if (voiceEntries.length > 0) {
    fragment.appendChild(buildSection(voiceEntries, memberId, "voice", "VOICE", "　声優・ボイス出演", VOICE_INITIAL_VISIBLE_COUNT));
  }
  return fragment;
}

// ---- 「＝LOVEについて」画面（グループ全体）の舞台セクション ----
// groupStage を持つ作品（全員出演の舞台）だけを、「ドラマ・映像作品」と同じ見た目（.sister-group-card）の
// カードにする。出演者・リンクは個人ページと同じデータ（casts / links）を使うので、修正は1か所で済む。
export function pickGroupStageWorks() {
  return STAGE_PRODUCTIONS.filter((work) => work.groupStage).sort((a, b) => (a.sortKey < b.sortKey ? -1 : 1));
}

function buildGroupStageCard(work) {
  const card = document.createElement("div");
  card.className = "sister-group-card group-stage-card";
  card.dataset.workId = work.id;

  const title = document.createElement("p");
  title.className = "sister-group-name";
  title.textContent = work.title;
  card.appendChild(title);

  const period = document.createElement("p");
  period.className = "sister-group-reading";
  period.textContent = `${work.yearLabel} ／ ${work.groupStage.dateText}`;
  card.appendChild(period);

  const venue = document.createElement("p");
  venue.className = "sister-group-reading";
  venue.textContent = `会場：${work.groupStage.venue}`;
  card.appendChild(venue);

  [work.groupStage.summary, work.groupStage.credit].filter(Boolean).forEach((text) => {
    const paragraph = document.createElement("p");
    paragraph.className = "sister-group-description";
    paragraph.textContent = text;
    card.appendChild(paragraph);
  });

  card.appendChild(buildFullCastDetails(work, null));

  const linkRow = document.createElement("div");
  linkRow.className = "sister-group-links";
  work.links.forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = "official-link-button";
    anchor.href = link.url;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label === OFFICIAL_LABEL ? "舞台公式サイト" : link.label;
    linkRow.appendChild(anchor);
  });
  card.appendChild(linkRow);
  return card;
}

// 該当作品が無ければ空のdivを返す（呼び出し側は無条件にappendしてよい）。
export function buildGroupStageSection() {
  const wrapper = document.createElement("div");
  const works = pickGroupStageWorks();
  if (works.length === 0) return wrapper;
  wrapper.appendChild(buildHeading("STAGE", "　舞台・ステージ作品"));
  const list = document.createElement("div");
  list.className = "sister-group-list";
  works.forEach((work) => list.appendChild(buildGroupStageCard(work)));
  wrapper.appendChild(list);
  return wrapper;
}
