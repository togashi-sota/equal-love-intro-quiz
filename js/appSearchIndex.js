// 全体検索（アプリ内検索）の「検索用データの組み立て」と「検索・並べ替え」を担当するファイル（2026-10-23新設）。
// DOMに一切触れない（tests.html から直接テストできるようにするため）。
//
// 【設計方針（本人資料「検索機能 実装資料」より）】
// ・検索用の文章を別に持たず、既存のデータファイル（曲・メンバー・CM・ライブ・出演作品・活動・ガイド）から
//   毎回組み立てる。新しいCMや曲をデータに足せば、検索側を触らなくても自動で検索対象になる。
// ・公開情報だけを対象にする。プレイ履歴・苦手曲・フレンド・管理者情報・内部ID・歌詞本文は含めない。
// ・表記揺れ（ひらがな／カタカナ・全角／半角・空白・記号）は js/searchNormalize.js で吸収し、
//   愛称・略称は既存の searchAliases（曲）・nicknames（メンバー）をそのまま使う。
import { SONGS } from "./data/songs.js";
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { MEMBER_PROFILES } from "./data/memberProfiles.js";
import { MEMBER_ACTIVITIES, ACTIVITY_TYPE } from "./data/memberActivities.js";
import { GROUP_ACTIVITIES } from "./data/groupActivities.js";
import { STAGE_PRODUCTIONS, VOICE_APPEARANCES } from "./data/memberStageVoice.js";
import { COMMERCIALS } from "./data/commercials.js";
import { LIVE_EVENTS, LIVE_STATUS } from "./data/liveHistory.js";
// 【2026-10-27追加】公演カードのセットリスト（曲名でも公演が見つかるようにする）
import { SETLIST_PERFORMANCES } from "./data/setlists.js";
import { DISCOGRAPHY } from "./data/discography.js";
import { GUIDE_SECTIONS } from "./data/guideContent.js";
import { APP_SEARCH_FEATURES } from "./data/appSearchFeatures.js";
import { SPECIAL_MODES } from "./specialModesScreen.js";
import { ACTIVITY_TYPE_LABELS, getTodayInJapan } from "./membersScreen.js";
import { buildWorkSummaries, buildWorkTypeLabel } from "./discographyScreen.js";
import { formatCastRole } from "./memberStageVoiceSection.js";
import { describeGroupParticipation, formatCommercialPeriod, getMemberCommercials } from "./commercialsSection.js";
import { COMMERCIAL_KIND } from "./data/commercials.js";
import { normalizeSearchText, editDistanceWithin, allowedTypoCount } from "./searchNormalize.js";

// 絞り込みのカテゴリ（表示順もこの順）。一般のファンが分かる言葉にしている。
export const APP_SEARCH_CATEGORIES = [
  { id: "all", label: "すべて" },
  { id: "member", label: "メンバー" },
  { id: "song", label: "楽曲" },
  { id: "cm", label: "CM・広告" },
  { id: "live", label: "ライブ" },
  { id: "work", label: "出演作品" },
  { id: "program", label: "番組・活動" },
  { id: "guide", label: "ガイド" },
  { id: "feature", label: "機能" },
  { id: "setting", label: "設定" },
];

const CATEGORY_LABELS = Object.fromEntries(APP_SEARCH_CATEGORIES.map((category) => [category.id, category.label]));
const CATEGORY_ORDER = Object.fromEntries(APP_SEARCH_CATEGORIES.map((category, index) => [category.id, index]));

// 一致の強さ。名前・曲名などの「見出しの言葉（primary）」に一致したものを、説明文の中の一致より上に出す。
const SCORE = {
  PRIMARY_EXACT: 100,
  PRIMARY_PREFIX: 80,
  PRIMARY_INCLUDES: 60,
  ALIAS_EXACT: 95,
  ALIAS_PREFIX: 50,
  SECONDARY_EXACT: 55,
  SECONDARY_PREFIX: 45,
  SECONDARY_INCLUDES: 35,
  BODY_INCLUDES: 15,
};

// 誤字の候補（「もしかして」）は最大この件数まで（不自然な候補を乱発しないため）
export const APP_SEARCH_SUGGESTION_LIMIT = 5;

function formatJapaneseDate(dateText) {
  if (typeof dateText !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const [year, month, day] = dateText.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatDateRange(startDate, endDate) {
  const start = formatJapaneseDate(startDate);
  const end = formatJapaneseDate(endDate);
  if (!start) return null;
  if (!end || endDate === startDate) return start;
  return `${start}〜${end}`;
}

function aliasTexts(aliases) {
  return (aliases ?? []).flatMap((alias) => (typeof alias === "string" ? [alias] : [alias.text, alias.reading].filter(Boolean)));
}

// 検索語との照合用に、各欄を正規化して持っておく（入力のたびに正規化し直さないため）
function buildTerms({ primary = [], aliases = [], secondary = [], body = [] }) {
  const normalize = (list) => list.filter((text) => typeof text === "string" && text !== "").map(normalizeSearchText).filter(Boolean);
  return { primary: normalize(primary), aliases: normalize(aliases), secondary: normalize(secondary), body: normalize(body) };
}

function createEntry({ key, category, title, subtitle = "", lines = [], links = [], action = null, terms }) {
  return {
    key,
    category,
    categoryLabel: CATEGORY_LABELS[category],
    title,
    subtitle,
    lines: lines.filter(Boolean),
    links: (links ?? []).filter((link) => link && link.url),
    action,
    terms: buildTerms(terms),
  };
}

// 検索結果から開く先のメンバーページ。現役メンバーを優先し、卒業メンバーしかいない場合は
// メンバー紹介の卒業メンバー欄へ（卒業メンバーは個人ページを持たない仕様のため。レビュー指摘）
function memberPageTarget(members, memberIds, focusSelector) {
  const isActive = (memberId) => members.find((member) => member.id === memberId)?.status !== MEMBER_STATUS.GRADUATED;
  const activeId = memberIds.find(isActive);
  if (activeId) return { kind: "member", memberId: activeId, focusSelector };
  return { kind: "membersList", memberId: memberIds[0] };
}

function memberNameById(members) {
  const map = new Map(members.map((member) => [member.id, member.name]));
  return (memberId) => map.get(memberId) ?? null;
}

// 出演者の名前を読み仮名でも探せるようにする（「ささき」で佐々木舞香のCM・活動も見つかるように）
function memberReadingsByIds(members, memberIds) {
  return memberIds.map((memberId) => members.find((member) => member.id === memberId)?.reading).filter(Boolean);
}

function memberReadingsByNames(members, names) {
  return names.map((name) => members.find((member) => member.name === name)?.reading).filter(Boolean);
}

function describeTargetLabel(target, nameOf) {
  return target.kind === "member" ? `${nameOf(target.memberId)}のページで詳しく見る` : "メンバー紹介で見る";
}

// ---- メンバー ----
function buildMemberEntries({ members, profiles, memberActivities, commercials, stageProductions, voiceAppearances }) {
  return members.map((member) => {
    const profile = profiles.find((entry) => entry.memberId === member.id) ?? null;
    const nicknames = (profile?.nicknames ?? []).map((nickname) => nickname.text);
    const isGraduated = member.status === MEMBER_STATUS.GRADUATED;
    const activityCount = memberActivities.filter((activity) => activity.memberId === member.id).length;
    // 個人ページの「CM・広告・企業コラボ」欄と同じ数え方（グループ案件で本人が担当したものも含む）
    const cmCount = getMemberCommercials(member.id, commercials).length;
    const stageVoiceCount = [...stageProductions, ...voiceAppearances].filter((work) => work.casts.some((cast) => cast.memberId === member.id)).length;
    const highlights = [
      activityCount > 0 ? `個人活動 ${activityCount}件` : null,
      stageVoiceCount > 0 ? `舞台・声優 ${stageVoiceCount}件` : null,
      cmCount > 0 ? `CM・広告・コラボ ${cmCount}件` : null,
    ].filter(Boolean);
    return createEntry({
      key: `member:${member.id}`,
      category: "member",
      title: member.name,
      subtitle: isGraduated ? "卒業メンバー" : nicknames.length > 0 ? `愛称：${nicknames.join("・")}` : "メンバー",
      lines: [
        profile?.introduction?.text ?? null,
        member.memberColor?.name ? `メンバーカラー：${member.memberColor.name}` : null,
        (member.penlightColors ?? []).length > 0 ? `ペンライトカラー：${member.penlightColors.map((color) => color.name ?? color).join("・")}` : null,
        highlights.length > 0 ? highlights.join("／") : null,
      ],
      links: member.officialLinks?.profile ? [{ label: "公式プロフィール", url: member.officialLinks.profile }] : [],
      action: isGraduated
        ? { label: "メンバー紹介で見る", target: { kind: "membersList", memberId: member.id } }
        : { label: "メンバーページで詳しく見る", target: { kind: "member", memberId: member.id } },
      terms: {
        primary: [member.name],
        aliases: [member.reading, ...nicknames, profile?.fanName?.text],
        secondary: [member.memberColor?.name],
        body: [profile?.introduction?.text],
      },
    });
  });
}

// ---- 楽曲・作品 ----
function buildSongEntries({ songs, members }) {
  return songs.map((song) =>
    createEntry({
      key: `song:${song.id}`,
      category: "song",
      title: song.title,
      subtitle: song.single ?? "",
      lines: [
        song.single ? `収録：${song.single}` : null,
        formatJapaneseDate(song.releaseDate) ? `発売日：${formatJapaneseDate(song.releaseDate)}` : null,
        song.category ? `種類：${song.category}` : null,
        (song.center ?? []).length > 0 ? `センター：${song.center.join("・")}` : null,
      ],
      links: song.youtubeUrl ? [{ label: "MV・動画を見る（YouTube）", url: song.youtubeUrl }] : [],
      action: { label: "収録曲一覧で見る", target: { kind: "song", songId: song.id } },
      terms: {
        primary: [song.title],
        aliases: [song.searchReading, ...aliasTexts(song.searchAliases)],
        secondary: [song.single, ...(song.center ?? []), ...memberReadingsByNames(members, song.center ?? [])],
        body: [song.description],
      },
    })
  );
}

function buildWorkEntries({ songs, discographyEntries }) {
  return buildWorkSummaries(songs, discographyEntries)
    .filter((work) => work.songs.length > 0)
    .map((work) => {
      const typeLabel = buildWorkTypeLabel(work.workId, work.type);
      return createEntry({
        key: `work:${work.workId}`,
        category: "song",
        title: `${typeLabel}「${work.title}」`,
        subtitle: "作品（シングル・アルバム等）",
        lines: [
          formatJapaneseDate(work.releaseDate) ? `発売日：${formatJapaneseDate(work.releaseDate)}` : null,
          `収録曲：${work.songs.map((song) => song.title).join("、")}`,
        ],
        links: [],
        action: { label: "作品ページで詳しく見る", target: { kind: "work", workId: work.workId } },
        terms: { primary: [work.title, typeLabel], secondary: work.songs.map((song) => song.title), body: [work.description] },
      });
    });
}

// ---- CM・広告 ----
const COLLAB_KINDS = new Set([
  COMMERCIAL_KIND.COLLAB,
  COMMERCIAL_KIND.COLLAB_PRODUCT,
  COMMERCIAL_KIND.COLLAB_CAMPAIGN,
  COMMERCIAL_KIND.PRODUCT_DEVELOPMENT,
  COMMERCIAL_KIND.TIE_UP,
]);
function buildCommercialEntries({ commercials, members, today }) {
  const nameOf = memberNameById(members);
  return commercials.map((cm) => {
    // グループ案件は「＝LOVE全員（当時10人）」「＝LOVE名義（当時12人体制）」のように参加範囲を出し、今の10人全員とは扱わない
    const featuredIds = (cm.featuredMembers ?? []).map((entry) => entry.memberId);
    const performerNames = (cm.isGroup ? featuredIds : cm.memberIds ?? []).map(nameOf).filter(Boolean);
    const performerLabel = cm.isGroup ? describeGroupParticipation(cm, members) : performerNames.join("・");
    const focusSelector = `[data-commercial-id="${cm.id}"]`;
    const target = cm.isGroup ? { kind: "discography", tab: "about", focusSelector } : memberPageTarget(members, cm.memberIds, focusSelector);
    return createEntry({
      key: `cm:${cm.id}`,
      category: "cm",
      title: cm.brand,
      subtitle: `${cm.kind}／${performerLabel}`,
      lines: [
        cm.title,
        `${cm.isGroup ? "参加" : "出演"}：${performerLabel}${cm.coStars ? `（共演：${cm.coStars}）` : ""}`,
        ...(cm.featuredMembers ?? []).map((entry) => `${nameOf(entry.memberId)}：${entry.role}`),
        `時期：${formatCommercialPeriod(cm, today)}`,
        cm.description,
      ],
      links: cm.links,
      action: { label: cm.isGroup ? "＝LOVEについてで詳しく見る" : describeTargetLabel(target, nameOf), target },
      terms: {
        primary: [cm.brand, cm.title],
        secondary: [
          cm.kind,
          ...performerNames,
          ...memberReadingsByIds(members, cm.isGroup ? featuredIds : cm.memberIds ?? []),
          cm.coStars,
          cm.isGroup ? "＝LOVE" : null,
          // 「CM」「コラボ」で探したときに、CMでないもの・コラボでないものが混ざらないよう種別に応じて付ける
          cm.kind.includes("CM") ? "CM" : null,
          COLLAB_KINDS.has(cm.kind) ? "コラボ" : null,
          "広告",
        ],
        body: [cm.description],
      },
    });
  });
}

// ---- ライブ・映像商品 ----
export function describeLiveStatus(event, today) {
  if (event.status === LIVE_STATUS.HELD) return "開催済み";
  const lastDay = event.endDate ?? event.startDate;
  return typeof lastDay === "string" && lastDay < today ? "日程終了" : "開催予定";
}

export function describeLiveVideo(event, today) {
  if (event.blurayReleased) return "映像作品あり（Blu-ray／DVD）";
  if (typeof event.videoReleaseDate === "string") {
    const date = formatJapaneseDate(event.videoReleaseDate);
    return event.videoReleaseDate > today ? `映像化決定（${date}発売予定）` : `映像化決定（発売日：${date}）`;
  }
  return null;
}

function buildLiveEntries({ liveEvents, today, setlistPerformances = SETLIST_PERFORMANCES, songs = [] }) {
  const songTitleById = new Map(songs.map((song) => [song.id, song.title]));
  return liveEvents.map((event) => {
    const venues = (event.venues ?? []).filter((venue) => venue.name || venue.city);
    const year = (event.startDate ?? "").slice(0, 4);
    const setlists = setlistPerformances.filter((performance) => performance.liveId === event.id);
    const setlistSongTitles = [
      ...new Set(setlists.flatMap((performance) => performance.items.map((item) => songTitleById.get(item.songId) ?? item.title))),
    ];
    return createEntry({
      key: `live:${event.id}`,
      category: "live",
      title: event.title,
      subtitle: `${describeLiveStatus(event, today)}${year ? `／${year}年` : ""}`,
      lines: [
        formatDateRange(event.startDate, event.endDate) ? `日程：${formatDateRange(event.startDate, event.endDate)}` : null,
        venues.length > 0 ? `会場：${venues.map((venue) => [venue.name, venue.city ? `（${venue.city}）` : ""].join("")).join("、")}` : null,
        `状態：${describeLiveStatus(event, today)}`,
        describeLiveVideo(event, today),
        event.episodeNote,
        setlists.length > 0 ? `セットリスト：${setlists.length}公演分を掲載（公式・報道で確認できたもの）` : null,
      ],
      links: event.productLinks,
      action: { label: "ライブ履歴で詳しく見る", target: { kind: "discography", tab: "live", focusSelector: `[data-live-id="${event.id}"]` } },
      terms: {
        primary: [event.title],
        secondary: [
          ...venues.map((venue) => venue.name),
          ...venues.map((venue) => venue.city),
          year ? `${year}年` : null,
          year,
          "ライブ",
          "公演",
          ...(setlists.length > 0 ? ["セットリスト", "セトリ"] : []),
        ],
        body: [event.episodeNote, describeLiveVideo(event, today), ...setlistSongTitles],
      },
    });
  });
}

// ---- 出演作品（舞台・声優）----
function buildStageVoiceEntries({ stageProductions, voiceAppearances, members }) {
  const nameOf = memberNameById(members);
  return [...stageProductions, ...voiceAppearances].map((work) => {
    const castLines = work.casts.map((cast) => `${nameOf(cast.memberId) ?? cast.memberId}（${formatCastRole(cast)}）`);
    const focusSelector = `[data-work-id="${work.id}"]`;
    const castIds = work.casts.map((cast) => cast.memberId);
    const target = work.groupStage || castIds.length === 0 ? { kind: "discography", tab: "about", focusSelector } : memberPageTarget(members, castIds, focusSelector);
    return createEntry({
      key: `stagevoice:${work.id}`,
      category: "work",
      title: work.title,
      subtitle: `${work.category}／${work.yearLabel ?? ""}`,
      lines: [work.period, castLines.length > 0 ? `出演：${castLines.join("、")}` : null, work.description],
      links: work.links,
      action: { label: target.kind === "discography" ? "＝LOVEについてで詳しく見る" : describeTargetLabel(target, nameOf), target },
      terms: {
        primary: [work.title],
        secondary: [
          work.category,
          work.yearLabel,
          ...work.casts.map((cast) => nameOf(cast.memberId)),
          ...memberReadingsByIds(members, work.casts.map((cast) => cast.memberId)),
          ...work.casts.map((cast) => cast.role),
        ],
        body: [work.description, work.period],
      },
    });
  });
}

// ---- 番組・活動（個人活動・グループの番組）----
const WORK_ACTIVITY_TYPES = new Set([ACTIVITY_TYPE.STAGE, ACTIVITY_TYPE.VOICE]);

function buildActivityEntries({ memberActivities, groupActivities, members }) {
  const nameOf = memberNameById(members);
  const memberEntries = memberActivities.map((activity) => {
    const memberNames = [activity.memberId, ...(activity.relatedMemberIds ?? [])].map(nameOf).filter(Boolean);
    const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] ?? "活動";
    return createEntry({
      key: `activity:${activity.id}`,
      category: WORK_ACTIVITY_TYPES.has(activity.type) ? "work" : "program",
      title: activity.title,
      subtitle: `${typeLabel}／${memberNames.join("・")}`,
      lines: [
        `出演：${memberNames.join("・")}`,
        formatDateRange(activity.startDate, activity.endDate) ? `時期：${formatDateRange(activity.startDate, activity.endDate)}` : null,
        activity.description,
      ],
      links: activity.url ? [{ label: "公式ページ", url: activity.url }] : [],
      action: (() => {
        // 活動カードは本人（memberId）のページにだけあるため、本人のページ（卒業メンバーなら卒業メンバー欄）へ
        const target = memberPageTarget(members, [activity.memberId], `[data-activity-id="${activity.id}"]`);
        return { label: describeTargetLabel(target, nameOf), target };
      })(),
      terms: {
        primary: [activity.title],
        secondary: [typeLabel, ...memberNames, ...memberReadingsByIds(members, [activity.memberId, ...(activity.relatedMemberIds ?? [])])],
        body: [activity.description],
      },
    });
  });
  const groupEntries = groupActivities.map((activity) => {
    const typeLabel = ACTIVITY_TYPE_LABELS[activity.type] ?? "活動";
    return createEntry({
      key: `groupactivity:${activity.id}`,
      category: WORK_ACTIVITY_TYPES.has(activity.type) ? "work" : "program",
      title: activity.title,
      subtitle: `${typeLabel}／＝LOVE`,
      lines: [
        formatDateRange(activity.startDate, activity.endDate) ? `時期：${formatDateRange(activity.startDate, activity.endDate)}` : null,
        activity.description,
      ],
      links: activity.url ? [{ label: "公式ページ", url: activity.url }] : [],
      action: {
        label: "＝LOVEについてで詳しく見る",
        target: { kind: "discography", tab: "about", focusSelector: `[data-activity-id="${activity.id}"]` },
      },
      terms: { primary: [activity.title], secondary: [typeLabel, "＝LOVE"], body: [activity.description] },
    });
  });
  return [...memberEntries, ...groupEntries];
}

// ---- ガイド・機能・設定 ----
function buildGuideEntries({ guideSections }) {
  return guideSections.map((section) =>
    createEntry({
      key: `guide:${section.id}`,
      category: "guide",
      title: section.title,
      subtitle: section.tagline ?? "",
      lines: [...(section.steps ?? []).slice(0, 3), section.point ?? null],
      action: { label: "ガイドで詳しく見る", target: { kind: "guide", sectionId: section.id } },
      terms: { primary: [section.title], secondary: [section.tagline], body: [...(section.steps ?? []), section.point] },
    })
  );
}

function buildFeatureEntries({ specialModes, features }) {
  const modeEntries = specialModes
    .filter((mode) => mode.available)
    .map((mode) =>
      createEntry({
        key: `mode:${mode.id}`,
        category: "feature",
        title: mode.title,
        subtitle: "特別モード",
        lines: [mode.description],
        action: { label: "この機能を開く", target: { kind: "feature", action: { type: "specialMode", modeId: mode.id } } },
        terms: { primary: [mode.title], secondary: ["特別モード"], body: [mode.description] },
      })
    );
  const featureEntries = features.map((feature) =>
    createEntry({
      key: `feature:${feature.id}`,
      category: feature.category,
      title: feature.title,
      subtitle: feature.category === "setting" ? "設定" : "アプリの機能",
      lines: [feature.description],
      action: { label: feature.category === "setting" ? "設定を開く" : "この機能を開く", target: { kind: "feature", action: feature.action } },
      terms: { primary: [feature.title], aliases: feature.aliases, body: [feature.description] },
    })
  );
  return [...modeEntries, ...featureEntries];
}

// 検索対象の全項目を組み立てる。sources を省略すると、アプリの既存データをそのまま使う。
export function buildAppSearchEntries(sources = {}) {
  const resolved = {
    songs: SONGS,
    members: MEMBERS,
    profiles: MEMBER_PROFILES,
    memberActivities: MEMBER_ACTIVITIES,
    groupActivities: GROUP_ACTIVITIES,
    stageProductions: STAGE_PRODUCTIONS,
    voiceAppearances: VOICE_APPEARANCES,
    commercials: COMMERCIALS,
    liveEvents: LIVE_EVENTS,
    discographyEntries: DISCOGRAPHY,
    guideSections: GUIDE_SECTIONS,
    specialModes: SPECIAL_MODES,
    features: APP_SEARCH_FEATURES,
    today: getTodayInJapan(),
    ...sources,
  };
  return [
    ...buildMemberEntries(resolved),
    ...buildSongEntries(resolved),
    ...buildWorkEntries(resolved),
    ...buildCommercialEntries(resolved),
    ...buildLiveEntries(resolved),
    ...buildStageVoiceEntries(resolved),
    ...buildActivityEntries(resolved),
    ...buildGuideEntries(resolved),
    ...buildFeatureEntries(resolved),
  ];
}

// 入力文字列を、空白で区切った検索語（正規化済み）の配列にする。「佐々木 マック」のような絞り込みに使う。
export function tokenizeAppSearchQuery(rawQuery) {
  return String(rawQuery ?? "")
    .split(/[\s　]+/)
    .map(normalizeSearchText)
    .filter((token) => token !== "");
}

function scoreToken(terms, token) {
  let best = 0;
  terms.primary.forEach((term) => {
    if (term === token) best = Math.max(best, SCORE.PRIMARY_EXACT);
    else if (term.startsWith(token)) best = Math.max(best, SCORE.PRIMARY_PREFIX);
    else if (term.includes(token)) best = Math.max(best, SCORE.PRIMARY_INCLUDES);
  });
  terms.aliases.forEach((term) => {
    if (term === token) best = Math.max(best, SCORE.ALIAS_EXACT);
    // 1文字の検索語で読み仮名・略称の先頭一致を拾うと、ほぼ全件が引っかかるため2文字以上に限る
    else if (token.length >= 2 && term.startsWith(token)) best = Math.max(best, SCORE.ALIAS_PREFIX);
  });
  terms.secondary.forEach((term) => {
    if (term === token) best = Math.max(best, SCORE.SECONDARY_EXACT);
    else if (term.startsWith(token)) best = Math.max(best, SCORE.SECONDARY_PREFIX);
    else if (term.includes(token)) best = Math.max(best, SCORE.SECONDARY_INCLUDES);
  });
  if (best === 0 && terms.body.some((term) => term.includes(token))) best = SCORE.BODY_INCLUDES;
  return best;
}

function compareResults(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (CATEGORY_ORDER[a.entry.category] !== CATEGORY_ORDER[b.entry.category]) {
    return CATEGORY_ORDER[a.entry.category] - CATEGORY_ORDER[b.entry.category];
  }
  return a.entry.title.localeCompare(b.entry.title, "ja");
}

// 検索する。戻り値：
//   results     … 選んだカテゴリの一致項目（関連度の高い順）
//   countsByCategory … カテゴリごとの一致件数（絞り込みボタンの件数表示用。"all" は合計）
//   suggestions … 1件も一致しなかったときだけ、軽微な誤字として近い候補（最大5件、一致とは別扱い）
export function searchAppEntries(entries, rawQuery, categoryId = "all") {
  const tokens = tokenizeAppSearchQuery(rawQuery);
  const countsByCategory = Object.fromEntries(APP_SEARCH_CATEGORIES.map((category) => [category.id, 0]));
  if (tokens.length === 0) return { tokens, results: [], countsByCategory, suggestions: [] };

  const matched = [];
  entries.forEach((entry) => {
    let total = 0;
    for (const token of tokens) {
      const score = scoreToken(entry.terms, token);
      if (score === 0) return;
      total += score;
    }
    matched.push({ entry, score: total });
  });
  matched.forEach(({ entry }) => {
    countsByCategory[entry.category] += 1;
    countsByCategory.all += 1;
  });
  const results = matched.filter(({ entry }) => categoryId === "all" || entry.category === categoryId).sort(compareResults);

  const suggestions = matched.length === 0 ? suggestSimilarEntries(entries, tokens.join("")) : [];
  return { tokens, results, countsByCategory, suggestions };
}

// 1件も一致しなかったときの「もしかして」候補。見出しの言葉（名前・曲名など）と、
// 全体または先頭部分が軽微な誤字（1〜2文字違い）で一致するものだけを出す。
function suggestTwoCharTypos(entries, normalizedQuery) {
  const isKanji = (char) => /\p{Script=Han}/u.test(char);
  if (![...normalizedQuery].every(isKanji)) return [];
  return entries
    .filter((entry) =>
      [...entry.terms.primary, ...entry.terms.aliases].some(
        (term) => term.length === 2 && term[0] === normalizedQuery[0] && term[1] !== normalizedQuery[1] && isKanji(term[1])
      )
    )
    .slice(0, APP_SEARCH_SUGGESTION_LIMIT);
}

export function suggestSimilarEntries(entries, normalizedQuery) {
  const maxDistance = allowedTypoCount(normalizedQuery.length);
  // 2文字の語は通常は誤字扱いしないが、「国家」→「国歌」のような漢字1文字違いの2文字の見出し語・愛称だけは拾う
  // （1文字目が同じで2文字目だけ違う漢字2文字の語に限る。一致が0件のときだけ呼ばれる。2026-10-23追加）
  if (maxDistance === 0) return normalizedQuery.length === 2 ? suggestTwoCharTypos(entries, normalizedQuery) : [];
  const candidates = [];
  entries.forEach((entry) => {
    let best = null;
    [...entry.terms.primary, ...entry.terms.aliases].forEach((term) => {
      const whole = editDistanceWithin(normalizedQuery, term, maxDistance);
      const head = term.length > normalizedQuery.length ? editDistanceWithin(normalizedQuery, term.slice(0, normalizedQuery.length), maxDistance) : null;
      [whole, head].forEach((distance) => {
        if (distance !== null && (best === null || distance < best)) best = distance;
      });
    });
    if (best !== null) candidates.push({ entry, distance: best });
  });
  return candidates
    .sort((a, b) => a.distance - b.distance || CATEGORY_ORDER[a.entry.category] - CATEGORY_ORDER[b.entry.category] || a.entry.title.localeCompare(b.entry.title, "ja"))
    .slice(0, APP_SEARCH_SUGGESTION_LIMIT)
    .map(({ entry }) => entry);
}
