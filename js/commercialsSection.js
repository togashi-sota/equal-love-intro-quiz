// 【2026-10-23新設・本人指示】個人ページ「CM・広告・企業コラボ」と、＝LOVEについて「CM・広告・企業コラボ（＝LOVE名義）」の表示。
// データは js/data/commercials.js（1作品＝1件、出演者は memberIds／＝LOVE名義の案件は isGroup＋groupParticipation）。
// 個人ページは STAGE／VOICE と同じカード（.activity-card .stage-voice-card）、
// ＝LOVEについてはドラマ・舞台・アニメ主題歌と同じカード（.sister-group-card）で見た目を揃えている。
import { COMMERCIALS, GROUP_PARTICIPATION } from "./data/commercials.js";
import { MEMBERS } from "./data/members.js";

// 最初に見せる件数（STAGE／VOICE と同じ5件）。超えた分は「もっと見る」で開く。
export const COMMERCIAL_INITIAL_VISIBLE_COUNT = 5;

// 日本時間の今日（YYYY-MM-DD）
export function getTodayInJapanForCommercials(now = new Date()) {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

function byDateDesc(a, b) {
  if (a.date === b.date) return 0;
  return a.date < b.date ? 1 : -1;
}

// グループ案件の中で、そのメンバーが特に担った役割（例：パッケージイラスト）。無ければ null
export function getFeaturedRole(cm, memberId) {
  return (cm.featuredMembers ?? []).find((entry) => entry.memberId === memberId)?.role || null;
}

// そのメンバーが個人・数人で出演した作品と、グループ案件のうち本人が特定の役割を担ったもの
// （featuredMembers）を新しい順で返す。＝LOVE名義の案件そのものは個人ページに複製しない。
export function getMemberCommercials(memberId, commercials = COMMERCIALS) {
  return commercials
    .filter((cm) => (!cm.isGroup && (cm.memberIds ?? []).includes(memberId)) || getFeaturedRole(cm, memberId) !== null)
    .sort(byDateDesc);
}

// ＝LOVE名義のグループ案件を新しい順で返す
export function getGroupCommercials(commercials = COMMERCIALS) {
  return commercials.filter((cm) => cm.isGroup === true).sort(byDateDesc);
}

// 加入日が書かれていない場合の加入日。members.js の結成時メンバーの joinDate と同じ結成発表日。
const GROUP_FORMATION_DATE = "2017-04-29";

// その日に在籍していたメンバーの人数（加入日・卒業日から計算。当時の12人体制を今の10人と取り違えないため）。
// 卒業メンバーは activePeriod（在籍期間）を優先し、卒業公演の当日までは在籍として数える。
export function countMembersOnDate(dateText, members = MEMBERS) {
  return members.filter((member) => {
    const start = member.joinDate ?? member.activePeriod?.start ?? GROUP_FORMATION_DATE;
    const end = member.graduationDate ?? member.activePeriod?.end ?? null;
    return start <= dateText && (!end || end >= dateText);
  }).length;
}

// グループ案件の参加範囲の表示（例：「＝LOVE全員（当時10人）」「＝LOVE名義（当時12人体制）」）。
// 元メンバーの名前やバッジは出さず、当時の人数だけを添える（本人指示）。
export function describeGroupParticipation(cm, members = MEMBERS) {
  const count = countMembersOnDate(cm.date, members);
  if (cm.groupParticipation === GROUP_PARTICIPATION.ALL) return `＝LOVE全員（当時${count}人）`;
  if (cm.groupParticipation === GROUP_PARTICIPATION.UNSPECIFIED) return "＝LOVE名義（出演メンバーは公式発表では特定できず）";
  // 全員参加と確認できていない案件は、参加人数ではなく「当時の体制」として書く（言い過ぎを避けるため）
  return `＝LOVE名義（当時${count}人体制）`;
}

// 期間の表示。終了日が公式に分かっているときだけ「開始日〜終了日」にする
export function formatCommercialPeriod(cm, today = getTodayInJapanForCommercials()) {
  const start = formatCommercialDate(cm.date, today);
  if (typeof cm.endDate !== "string" || cm.endDate === cm.date) return start;
  const [year, month, day] = cm.endDate.split("-").map(Number);
  const sameYear = cm.endDate.slice(0, 4) === cm.date.slice(0, 4);
  return `${start}〜${sameYear ? "" : `${year}年`}${month}月${day}日`;
}

// 「2026年10月27日」形式。今日より先の日付なら「〜開始予定」を付ける（放送・公開前に「出演済み」と見せないため）。
export function formatCommercialDate(dateText, today = getTodayInJapanForCommercials()) {
  if (typeof dateText !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return "";
  const [year, month, day] = dateText.split("-").map(Number);
  const label = `${year}年${month}月${day}日`;
  return dateText > today ? `${label}開始予定` : label;
}

// 共演者の表示（同じ作品に出ている他のメンバー＋メンバー以外の共演者）
export function describeCoStars(cm, currentMemberId) {
  const memberNames = (cm.memberIds ?? [])
    .filter((id) => id !== currentMemberId)
    .map((id) => MEMBERS.find((member) => member.id === id)?.name ?? id);
  return [...memberNames, cm.coStars].filter(Boolean).join("・");
}

function buildTag(text, className) {
  const tag = document.createElement("span");
  tag.className = className;
  tag.textContent = text;
  return tag;
}

function appendExternalLinks(parent, links, linkClassName) {
  (links ?? []).forEach((link) => {
    const anchor = document.createElement("a");
    anchor.className = linkClassName;
    anchor.href = link.url;
    // 外部リンクを押してもアプリ（PWA）の画面が消えないよう、別タブ＋opener遮断で開く
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    anchor.textContent = link.label;
    parent.appendChild(anchor);
  });
}

function buildMoreToggle(hiddenItems, buttonClassName) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = buttonClassName;
  const update = (expanded) => {
    button.setAttribute("aria-expanded", String(expanded));
    button.textContent = expanded ? "たたむ" : `もっと見る（残り${hiddenItems.length}件）`;
    hiddenItems.forEach((item) => {
      item.hidden = !expanded;
    });
  };
  update(false);
  button.addEventListener("click", () => update(button.getAttribute("aria-expanded") !== "true"));
  return button;
}

// ---- 個人ページ ----
export function buildMemberCommercialCard(cm, memberId, today = getTodayInJapanForCommercials()) {
  const card = document.createElement("div");
  card.className = "activity-card stage-voice-card commercial-card";
  card.dataset.commercialId = cm.id;
  card.appendChild(buildTag(cm.kind, "activity-card-type"));
  card.appendChild(buildTag(formatCommercialPeriod(cm, today), "stage-voice-year"));

  const brand = document.createElement("p");
  brand.className = "activity-card-title";
  brand.textContent = cm.brand;
  card.appendChild(brand);

  const title = document.createElement("p");
  title.className = "stage-voice-period commercial-title";
  title.textContent = cm.title;
  card.appendChild(title);

  // ＝LOVE名義の案件で本人が特定の役割を担ったもの（例：パッケージイラスト）は、その役割を添える
  const featuredRole = getFeaturedRole(cm, memberId);
  if (cm.isGroup && featuredRole) {
    const roleLine = document.createElement("p");
    roleLine.className = "stage-voice-role commercial-featured-role";
    roleLine.textContent = `＝LOVE名義の企画で${featuredRole}`;
    card.appendChild(roleLine);
  }

  const coStars = cm.isGroup ? "" : describeCoStars(cm, memberId);
  if (coStars) {
    const coStarLine = document.createElement("p");
    coStarLine.className = "stage-voice-role commercial-costars";
    coStarLine.textContent = `共演：${coStars}`;
    card.appendChild(coStarLine);
  }

  if (cm.description) {
    const description = document.createElement("p");
    description.className = "activity-card-description stage-voice-description";
    description.textContent = cm.description;
    card.appendChild(description);
  }

  if ((cm.links ?? []).length > 0) {
    const row = document.createElement("div");
    row.className = "stage-voice-link-row";
    appendExternalLinks(row, cm.links, "official-link-button activity-card-link");
    card.appendChild(row);
  }
  return card;
}

// 全員出演の作品は個人ページに複製せず、「＝LOVEについて」へ案内する（1か所に集約して更新しやすくするため）
function buildGroupReference(groupCount) {
  const note = document.createElement("div");
  note.className = "commercial-group-note";
  const text = document.createElement("p");
  text.className = "commercial-group-note-text";
  text.textContent = `＝LOVE名義のCM・広告・コラボ（${groupCount}件）は「＝LOVEについて」にまとめています。`;
  note.appendChild(text);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage-voice-more-button commercial-group-note-button";
  button.textContent = "＝LOVEのCM・広告・コラボを見る";
  button.addEventListener("click", () => {
    window.dispatchEvent(new CustomEvent("app-navigate", { detail: { screen: "discography", scrollToId: "group-cm-section" } }));
  });
  note.appendChild(button);
  return note;
}

export function buildMemberCommercialsSection(memberId, commercials = COMMERCIALS, today = getTodayInJapanForCommercials()) {
  const fragment = document.createDocumentFragment();
  const own = getMemberCommercials(memberId, commercials);
  const groupCount = getGroupCommercials(commercials).length;
  if (own.length === 0 && groupCount === 0) return fragment;

  const section = document.createElement("div");
  section.className = "stage-voice-section is-cm";
  section.dataset.section = "cm";

  const heading = document.createElement("p");
  heading.className = "section-heading stage-voice-heading";
  heading.textContent = "CM・AD";
  const sub = document.createElement("span");
  sub.className = "stage-voice-heading-sub";
  // 【2026-10-23】Webモデル・商品共同開発なども載せるようになったため「企業コラボ」を見出しに加えた
  sub.textContent = "　CM・広告・企業コラボ";
  heading.appendChild(sub);
  section.appendChild(heading);

  if (own.length > 0) {
    const list = document.createElement("div");
    list.className = "activity-list stage-voice-list";
    const cards = own.map((cm) => buildMemberCommercialCard(cm, memberId, today));
    cards.forEach((card) => list.appendChild(card));
    section.appendChild(list);
    const hidden = cards.slice(COMMERCIAL_INITIAL_VISIBLE_COUNT);
    if (hidden.length > 0) section.appendChild(buildMoreToggle(hidden, "stage-voice-more-button"));
  }
  if (groupCount > 0) section.appendChild(buildGroupReference(groupCount));
  fragment.appendChild(section);
  return fragment;
}

// ---- ＝LOVEについて ----
export function buildGroupCommercialCard(cm, today = getTodayInJapanForCommercials()) {
  const card = document.createElement("div");
  card.className = "sister-group-card group-commercial-card";
  card.dataset.commercialId = cm.id;

  const brand = document.createElement("p");
  brand.className = "sister-group-name";
  brand.textContent = cm.brand;
  card.appendChild(brand);

  const meta = document.createElement("p");
  meta.className = "sister-group-reading";
  meta.textContent = `${cm.kind} ／ ${formatCommercialPeriod(cm, today)}`;
  card.appendChild(meta);

  // 参加範囲（当時の人数つき）と、特定のメンバーが担った役割
  const participation = document.createElement("p");
  participation.className = "sister-group-reading commercial-participation";
  participation.textContent = `参加：${describeGroupParticipation(cm)}`;
  card.appendChild(participation);
  (cm.featuredMembers ?? []).forEach((entry) => {
    const featured = document.createElement("p");
    featured.className = "sister-group-reading commercial-featured-role";
    featured.textContent = `${MEMBERS.find((member) => member.id === entry.memberId)?.name ?? entry.memberId}：${entry.role}`;
    card.appendChild(featured);
  });

  const title = document.createElement("p");
  title.className = "sister-group-description commercial-title";
  title.textContent = cm.title;
  card.appendChild(title);

  if (cm.description) {
    const description = document.createElement("p");
    description.className = "sister-group-description";
    description.textContent = cm.description;
    card.appendChild(description);
  }

  if ((cm.links ?? []).length > 0) {
    const row = document.createElement("div");
    row.className = "sister-group-links";
    appendExternalLinks(row, cm.links, "official-link-button");
    card.appendChild(row);
  }
  return card;
}

export function buildGroupCommercialsSection(commercials = COMMERCIALS, today = getTodayInJapanForCommercials()) {
  const wrapper = document.createElement("div");
  wrapper.id = "group-cm-section";
  const items = getGroupCommercials(commercials);
  if (items.length === 0) return wrapper;

  const heading = document.createElement("p");
  heading.className = "section-heading";
  heading.textContent = "CM・AD";
  const sub = document.createElement("span");
  sub.className = "stage-voice-heading-sub";
  // 【2026-10-23】全員出演とは限らない（当時の人数・出演者未特定の案件もある）ため「＝LOVE名義」に改めた
  sub.textContent = "　CM・広告・企業コラボ（＝LOVE名義）";
  heading.appendChild(sub);
  wrapper.appendChild(heading);

  const list = document.createElement("div");
  list.className = "sister-group-list";
  const cards = items.map((cm) => buildGroupCommercialCard(cm, today));
  cards.forEach((card) => list.appendChild(card));
  wrapper.appendChild(list);
  const hidden = cards.slice(COMMERCIAL_INITIAL_VISIBLE_COUNT);
  if (hidden.length > 0) wrapper.appendChild(buildMoreToggle(hidden, "stage-voice-more-button"));
  return wrapper;
}
