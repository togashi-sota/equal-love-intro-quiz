// ライブコールモードの「コールガイド」パネル（メンバーコール／曲指定コール／
// ペンライト指定曲／MIX・口上の4タブ）を組み立てるファイル。
//
// 表示するのは事実情報（色・名前・出典・使用場面の説明）のみ。コールの掛け声本文・
// MIX/口上の掛け声本文は一切扱わない（js/data/songCallCredits.js・
// js/data/mixAndKoujouGuide.jsのコメント参照）。データが無い項目は
// 「情報がありません」を大量表示せず、その項目自体を出さない。

import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { SONG_PENLIGHT_GUIDE } from "./data/songPenlightGuide.js";
import { SONG_CALL_CREDITS } from "./data/songCallCredits.js";
import { MIX_AND_KOUJOU_GUIDE } from "./data/mixAndKoujouGuide.js";
import { getSongById } from "./data/songs.js";

const DIFFICULTY_LABELS = {
  beginner: "初心者向け",
  intermediate: "慣れてきた人向け",
  advanced: "上級者向け",
};

const FREQUENCY_LABELS = {
  common: "よく使う",
  situational: "一部の曲で使う",
  rare: "特殊",
};

const CATEGORY_LABELS = {
  mix: "基本MIX",
  koujou: "ガチ恋口上",
  "song-specific-koujou": "曲専用口上",
  special: "その他",
};

export function formatDifficultyLabel(difficulty) {
  return DIFFICULTY_LABELS[difficulty] || "難易度不明";
}

export function formatFrequencyLabel(frequency) {
  return FREQUENCY_LABELS[frequency] || "使用頻度不明";
}

export function formatCategoryLabel(category) {
  return CATEGORY_LABELS[category] || category;
}

// usedInEqualLoveの3値（true/false/null）を、画面向けの短い一言に変換する。
export function formatUsedInEqualLoveNote(usedInEqualLove) {
  if (usedInEqualLove === true) return null;
  if (usedInEqualLove === false) return "＝LOVEでの使用は確認できませんでした（参考情報）。";
  return "＝LOVEでの使用有無は今回確認できませんでした。";
}

// 曲固有の口上（category:"song-specific-koujou"）のうち、指定曲IDが対象に含まれるものだけを返す。
export function findSongSpecificKoujou(songId) {
  if (!songId) return [];
  return MIX_AND_KOUJOU_GUIDE.filter(
    (entry) => entry.category === "song-specific-koujou" && entry.songIds && entry.songIds.includes(songId)
  );
}

// 「まず覚える3つ」（recommendedPriority:"must-know"）を返す。
export function getMustKnowMixGuide() {
  return MIX_AND_KOUJOU_GUIDE.filter((entry) => entry.recommendedPriority === "must-know");
}

// MIX・口上タブのカテゴリ絞り込み。categoryId が null／"all" の場合は全件返す。
export function filterMixGuideByCategory(categoryId) {
  if (!categoryId || categoryId === "all") return MIX_AND_KOUJOU_GUIDE;
  return MIX_AND_KOUJOU_GUIDE.filter((entry) => entry.category === categoryId);
}

// sourceTypeごとに、情報の確からしさが伝わる短い一言を返す（本人指示どおり全種類で表示する。
// official=公式サイト・公式グループSNS・公式動画、self=メンバー本人のSNS・本人出演動画、
// reliable=音楽メディア等の報道、fan=ファンサイト・ファン動画・現場での定着情報、
// を明確に区別し、fan由来のものを「使用確認済み」のように断定しない）。
export function getSourceTypeNote(sourceType) {
  switch (sourceType) {
    case "official":
      return "公式情報・公式動画で確認";
    case "self":
      return "メンバー本人が発信";
    case "reliable":
      return "信頼できる媒体で確認";
    case "fan":
      return "ファンの間で使われている、またはライブで定着しているとされる情報です";
    default:
      return "出典が確認できていない情報です";
  }
}

// 考案／発信バッジの表示文言を組み立てる（例：「考案：大場花菜」）。
export function formatCreditLabel(credit) {
  return `${credit.creditType}：${credit.creditName}`;
}

export function findSongPenlightGuide(songId) {
  return SONG_PENLIGHT_GUIDE.find((entry) => entry.songId === songId) || null;
}

export function findSongCallCredits(songId) {
  return SONG_CALL_CREDITS.find((entry) => entry.songId === songId) || null;
}

function buildColorChip(colorName, colorCode) {
  const chip = document.createElement("span");
  chip.className = "penlight-color-chip";
  const swatch = document.createElement("span");
  swatch.className = "penlight-color-swatch";
  swatch.style.backgroundColor = colorCode;
  swatch.setAttribute("aria-hidden", "true");
  chip.appendChild(swatch);
  chip.appendChild(document.createTextNode(colorName));
  return chip;
}

function buildCreditBadge(credit) {
  const badge = document.createElement("span");
  badge.className = "call-credit-badge";
  badge.textContent = formatCreditLabel(credit);
  return badge;
}

function buildSourceNote(sourceType) {
  const note = getSourceTypeNote(sourceType);
  if (!note) return null;
  const p = document.createElement("p");
  p.className = "penlight-source-note";
  p.textContent = note;
  return p;
}

// ===== タブ1: メンバーコール =====
function renderMemberCallTab(container) {
  container.innerHTML = "";
  const activeMembers = MEMBERS.filter((member) => member.status === MEMBER_STATUS.ACTIVE);

  const note = document.createElement("p");
  note.className = "penlight-source-note";
  note.textContent =
    "メンバーカラーは、公式商品や本人の発信、ライブでの使用状況などを参考にした色です。公演や楽曲によって異なる場合があります。";
  container.appendChild(note);

  const list = document.createElement("div");
  list.className = "member-call-guide-list";
  activeMembers.forEach((member) => {
    const row = document.createElement("div");
    row.className = "member-call-guide-row";

    const name = document.createElement("span");
    name.className = "member-call-guide-name";
    name.textContent = member.name;
    row.appendChild(name);

    const chips = document.createElement("span");
    chips.className = "member-call-guide-chips";
    member.penlightColors.forEach((color) => {
      chips.appendChild(buildColorChip(color.name, color.hex));
    });
    row.appendChild(chips);

    list.appendChild(row);
  });
  container.appendChild(list);
}

// ===== タブ2: 曲指定コール（考案・発信情報） =====
function renderSongCallTab(container, currentSongId) {
  container.innerHTML = "";

  if (SONG_CALL_CREDITS.length === 0) {
    const empty = document.createElement("p");
    empty.className = "call-guide-empty-state";
    empty.textContent = "確認できている情報がまだありません。";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "song-call-guide-list";
  SONG_CALL_CREDITS.forEach((entry) => {
    const song = getSongById(entry.songId);
    if (!song) return;

    const row = document.createElement("div");
    row.className = "song-call-guide-row";
    row.classList.toggle("is-current-song", entry.songId === currentSongId);

    const title = document.createElement("span");
    title.className = "song-call-guide-title";
    title.textContent = song.title;
    row.appendChild(title);

    const badges = document.createElement("span");
    badges.className = "song-call-guide-badges";
    entry.credits.forEach((credit) => badges.appendChild(buildCreditBadge(credit)));
    row.appendChild(badges);

    // 考案／発信の確からしさ（本人発信／ファン定着など）も、他タブと同じ表現で必ず併記する。
    entry.credits.forEach((credit) => {
      const note = buildSourceNote(credit.sourceType);
      if (note) row.appendChild(note);
    });

    list.appendChild(row);
  });
  container.appendChild(list);
}

// ===== タブ3: ペンライト指定曲 =====
function renderSongColorTab(container, currentSongId) {
  container.innerHTML = "";

  if (SONG_PENLIGHT_GUIDE.length === 0) {
    const empty = document.createElement("p");
    empty.className = "call-guide-empty-state";
    empty.textContent = "確認できている情報がまだありません。";
    container.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "song-penlight-guide-list";
  SONG_PENLIGHT_GUIDE.forEach((entry) => {
    const song = getSongById(entry.songId);
    if (!song) return;

    const card = document.createElement("div");
    card.className = "song-penlight-guide-card";
    card.classList.toggle("is-current-song", entry.songId === currentSongId);

    const title = document.createElement("span");
    title.className = "song-penlight-guide-title";
    title.textContent = song.title;
    card.appendChild(title);

    const chips = document.createElement("span");
    chips.className = "song-penlight-guide-chips";
    entry.colors.forEach((color) => {
      const chip = buildColorChip(color.colorName, color.colorCode);
      if (color.position) {
        chip.appendChild(document.createTextNode(`（${color.position}）`));
      }
      chips.appendChild(chip);
    });
    card.appendChild(chips);

    const note = buildSourceNote(entry.sourceType);
    if (note) card.appendChild(note);

    const relatedCredits = findSongCallCredits(entry.songId);
    if (relatedCredits) {
      const badges = document.createElement("span");
      badges.className = "song-call-guide-badges";
      relatedCredits.credits.forEach((credit) => badges.appendChild(buildCreditBadge(credit)));
      card.appendChild(badges);
    }

    list.appendChild(card);
  });
  container.appendChild(list);
}

// ===== タブ4: MIX・口上 =====

const MIX_CATEGORY_FILTERS = [
  { id: "all", label: "すべて" },
  { id: "mix", label: "基本MIX" },
  { id: "koujou", label: "ガチ恋口上" },
  { id: "song-specific-koujou", label: "曲専用口上" },
  { id: "special", label: "その他" },
];

// このタブ内だけで使う絞り込み状態。モーダルを開き直しても選択を保持する
// （タブを切り替えるたびに毎回「すべて」に戻ると使いにくいため）。
let activeMixCategoryFilter = "all";

function buildMixGuideCard(entry, isSongSpecificHighlight) {
  const card = document.createElement("div");
  card.className = "mix-type-card";
  if (isSongSpecificHighlight) card.classList.add("is-current-song");

  const headerRow = document.createElement("div");
  headerRow.className = "mix-type-header-row";

  const label = document.createElement("span");
  label.className = "mix-type-label";
  label.textContent = entry.name;
  headerRow.appendChild(label);

  if (entry.category === "song-specific-koujou") {
    const songBadge = document.createElement("span");
    songBadge.className = "mix-type-song-specific-badge";
    songBadge.textContent = "この曲だけで使います";
    headerRow.appendChild(songBadge);
  }
  card.appendChild(headerRow);

  const badgeRow = document.createElement("div");
  badgeRow.className = "mix-type-badge-row";
  const difficultyBadge = document.createElement("span");
  difficultyBadge.className = `mix-type-tag mix-type-tag-difficulty-${entry.difficulty}`;
  difficultyBadge.textContent = formatDifficultyLabel(entry.difficulty);
  badgeRow.appendChild(difficultyBadge);
  const frequencyBadge = document.createElement("span");
  frequencyBadge.className = "mix-type-tag";
  frequencyBadge.textContent = formatFrequencyLabel(entry.frequency);
  badgeRow.appendChild(frequencyBadge);
  card.appendChild(badgeRow);

  if (entry.differenceFromStandard) {
    const diff = document.createElement("p");
    diff.className = "mix-type-summary";
    diff.textContent = entry.differenceFromStandard;
    card.appendChild(diff);
  }

  if (entry.usageScene) {
    const scene = document.createElement("p");
    scene.className = "mix-type-summary";
    scene.textContent = `使われる場面：${entry.usageScene}`;
    card.appendChild(scene);
  }

  if (entry.startCue) {
    const cue = document.createElement("p");
    cue.className = "mix-type-summary";
    cue.textContent = `始めるタイミング：${entry.startCue}`;
    card.appendChild(cue);
  }

  const textPlaceholder = document.createElement("p");
  textPlaceholder.className = "call-guide-empty-state";
  textPlaceholder.textContent =
    entry.textLines.length > 0 ? entry.textLines.join(" ") : "掛け声本文は現在準備中です。";
  card.appendChild(textPlaceholder);

  if (entry.creditNote) {
    const credit = document.createElement("p");
    credit.className = "mix-type-summary";
    credit.textContent = entry.creditNote;
    card.appendChild(credit);
  }

  if (entry.usageNote) {
    const note = document.createElement("p");
    note.className = "mix-type-summary";
    note.textContent = entry.usageNote;
    card.appendChild(note);
  }

  const sourceNote = buildSourceNote(entry.sourceType);
  if (sourceNote) card.appendChild(sourceNote);

  const usedNote = formatUsedInEqualLoveNote(entry.usedInEqualLove);
  if (usedNote) {
    const p = document.createElement("p");
    p.className = "penlight-source-note";
    p.textContent = usedNote;
    card.appendChild(p);
  }

  return card;
}

function renderMixTab(container, currentSongId) {
  container.innerHTML = "";

  const venueNote = document.createElement("p");
  venueNote.className = "penlight-source-note";
  venueNote.textContent =
    "多くはファン文化として定着したもので、公式が定めたものではありません。会場や公演によって使用状況が異なる場合があるため、当日の案内や周囲への配慮を優先してください。";
  container.appendChild(venueNote);

  const songSpecificEntries = findSongSpecificKoujou(currentSongId);
  if (songSpecificEntries.length > 0) {
    const banner = document.createElement("p");
    banner.className = "mix-song-specific-banner";
    banner.textContent = "この曲には専用口上があります";
    container.appendChild(banner);
    songSpecificEntries.forEach((entry) => container.appendChild(buildMixGuideCard(entry, true)));
  }

  const mustKnowEntries = getMustKnowMixGuide();
  if (mustKnowEntries.length > 0) {
    const heading = document.createElement("p");
    heading.className = "mix-must-know-heading";
    heading.textContent = "最初に確認したいMIX";
    container.appendChild(heading);
    const heroList = document.createElement("div");
    heroList.className = "mix-type-list";
    mustKnowEntries.forEach((entry) => heroList.appendChild(buildMixGuideCard(entry, false)));
    container.appendChild(heroList);
  }

  const filterRow = document.createElement("div");
  filterRow.className = "mix-category-filter-row";
  MIX_CATEGORY_FILTERS.forEach((filter) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mix-category-filter-button";
    button.classList.toggle("is-active", filter.id === activeMixCategoryFilter);
    button.textContent = filter.label;
    button.addEventListener("click", () => {
      activeMixCategoryFilter = filter.id;
      renderMixTab(container, currentSongId);
    });
    filterRow.appendChild(button);
  });
  container.appendChild(filterRow);

  const filteredEntries = filterMixGuideByCategory(activeMixCategoryFilter);
  const list = document.createElement("div");
  list.className = "mix-type-list";
  filteredEntries.forEach((entry) => {
    list.appendChild(buildMixGuideCard(entry, false));
  });
  container.appendChild(list);
}

const TAB_RENDERERS = {
  member: renderMemberCallTab,
  songCall: renderSongCallTab,
  songColor: renderSongColorTab,
  mix: renderMixTab,
};

// tabPanels: { member, songCall, songColor, mix } の各タブ中身コンテナ。
// currentSongId：ライブコールモード再生画面で今開いている曲（曲一覧から開いた場合はnull）。
// 曲指定コール／ペンライト指定曲タブで、今の曲の行に.is-current-songを付けて目立たせる。
export function renderCallGuideTab(tabId, tabPanels, currentSongId) {
  const renderer = TAB_RENDERERS[tabId];
  const panel = tabPanels[tabId];
  if (!renderer || !panel) return;
  renderer(panel, currentSongId);
}
