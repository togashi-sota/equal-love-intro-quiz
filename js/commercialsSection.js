// 【2026-10-23新設・本人指示】「CM・広告出演」（個人ページ）と「CM・広告・企業タイアップ」（＝LOVEについて）の表示。
// データは js/data/commercials.js（1作品＝1件、出演者は memberIds／全員出演は isGroup）。
// 個人ページは STAGE／VOICE と同じカード（.activity-card .stage-voice-card）、
// ＝LOVEについてはドラマ・舞台・アニメ主題歌と同じカード（.sister-group-card）で見た目を揃えている。
import { COMMERCIALS } from "./data/commercials.js";
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

// そのメンバーが個人・数人で出演した作品（全員出演は含めない）を新しい順で返す
export function getMemberCommercials(memberId, commercials = COMMERCIALS) {
  return commercials.filter((cm) => !cm.isGroup && (cm.memberIds ?? []).includes(memberId)).sort(byDateDesc);
}

// ＝LOVE全員で出演した作品を新しい順で返す
export function getGroupCommercials(commercials = COMMERCIALS) {
  return commercials.filter((cm) => cm.isGroup === true).sort(byDateDesc);
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
  card.appendChild(buildTag(formatCommercialDate(cm.date, today), "stage-voice-year"));

  const brand = document.createElement("p");
  brand.className = "activity-card-title";
  brand.textContent = cm.brand;
  card.appendChild(brand);

  const title = document.createElement("p");
  title.className = "stage-voice-period commercial-title";
  title.textContent = cm.title;
  card.appendChild(title);

  const coStars = describeCoStars(cm, memberId);
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
  text.textContent = `＝LOVE全員で出演したCM・広告（${groupCount}件）は「＝LOVEについて」にまとめています。`;
  note.appendChild(text);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "stage-voice-more-button commercial-group-note-button";
  button.textContent = "＝LOVE全員のCM・広告を見る";
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
  sub.textContent = "　CM・広告出演";
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
  meta.textContent = `${cm.kind} ／ ${formatCommercialDate(cm.date, today)}`;
  card.appendChild(meta);

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
  sub.textContent = "　CM・広告・企業タイアップ（＝LOVE全員）";
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
