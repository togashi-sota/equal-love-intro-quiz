// 「YouTube 出演図鑑」の絞り込み・並べ替え・表示の言葉（2026-11-02新設・本人の依頼 R10-1）。
// DOM に触れない（tests.html から直接テストできるようにするため）。
// データは data/youtube-appearances.json（公開のたびに scripts/youtube/refresh.mjs が作る。js/youtubeAppearanceData.js が読む）。
// 【2026-11-03】出演の形：memberIds＝企画に出演、footageMemberIds＝ライブ映像・過去の映像・回想などで映像に登場。
//   メンバーで絞る・数えるときは両方に当たる（映像で登場した人でも探せる）。画面では分けて表示する。
import { MEMBERS } from "./data/members.js";
import { normalizeSearchText } from "./searchNormalize.js";
import { APPEARANCE_STATUS, APPEARANCE_STATUS_LABELS, EVIDENCE_TYPE_LABELS } from "./youtubeAppearanceClassifier.js";

export { APPEARANCE_STATUS, APPEARANCE_STATUS_LABELS, EVIDENCE_TYPE_LABELS };

// 動画の種類
export const YOUTUBE_KIND = Object.freeze({ VIDEO: "video", SHORT: "short", LIVE: "live" });
export const YOUTUBE_KIND_LABELS = Object.freeze({
  [YOUTUBE_KIND.VIDEO]: "通常の動画",
  [YOUTUBE_KIND.SHORT]: "Shorts",
  [YOUTUBE_KIND.LIVE]: "ライブ配信",
});

// 絞り込みの初めの値。並びは「古い順（初期の動画から）」が初め（本人の依頼）
export const YOUTUBE_DEFAULT_FILTER = Object.freeze({
  query: "",
  memberIds: Object.freeze([]),
  memberMode: "any", // any＝選んだ人のいずれかが出ている／all＝選んだ人が全員出ている
  year: "all",
  kind: "all", // all / video / short / live
  sort: "asc", // asc＝古い順／desc＝新しい順
  includeUnconfirmed: false, // 「出演者未確認」の動画も出すか
});

// 「出演が分かっている」動画（未確認を除く）
export function isConfirmedAppearance(video) {
  return video.status !== APPEARANCE_STATUS.UNCONFIRMED;
}

// 出演した人と、映像で登場した人を合わせたもの
export function allAppearingMemberIds(video) {
  return [...new Set([...(video.memberIds ?? []), ...(video.footageMemberIds ?? [])])];
}

// メンバーの名前で確定・推定しているか（＝LOVE 名義だけ・未確認でない）
export function hasNamedMembers(video) {
  return allAppearingMemberIds(video).length > 0;
}

// サムネイル：YouTube が提供する画像の URL をそのまま img で表示する（アプリに保存・再配布しない）
export function youtubeThumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

// 動画を開く URL（Shorts は Shorts の画面で開く）
export function youtubeWatchUrl(video) {
  const id = encodeURIComponent(video.id);
  return video.kind === YOUTUBE_KIND.SHORT ? `https://www.youtube.com/shorts/${id}` : `https://www.youtube.com/watch?v=${id}`;
}

export function youtubeVideoYear(video) {
  return String(video.publishedAt ?? "").slice(0, 4);
}

export function formatYoutubeDate(video) {
  const [year, month, day] = String(video.publishedAt ?? "").split("-").map(Number);
  return year && month && day ? `${year}年${month}月${day}日` : "公開日不明";
}

// 検索の対象：タイトル・説明の要約・再生リスト（企画）の名前・出演メンバーの名前と読み
const memberById = new Map(MEMBERS.map((member) => [member.id, member]));
const searchTextCache = new WeakMap();
function searchTextOf(video) {
  if (searchTextCache.has(video)) return searchTextCache.get(video);
  const memberWords = allAppearingMemberIds(video).flatMap((memberId) => {
    const member = memberById.get(memberId);
    return member ? [member.name, member.reading] : [];
  });
  const text = normalizeSearchText([video.title, video.summary, ...(video.series ?? []), ...memberWords].filter(Boolean).join(" "));
  searchTextCache.set(video, text);
  return text;
}

export function tokenizeYoutubeQuery(query) {
  return String(query ?? "")
    .split(/[\s　]+/)
    .map(normalizeSearchText)
    .filter(Boolean);
}

export function matchesYoutubeQuery(video, query) {
  const tokens = tokenizeYoutubeQuery(query);
  if (!tokens.length) return true;
  const text = searchTextOf(video);
  return tokens.every((token) => text.includes(token));
}

export function matchesYoutubeMembers(video, memberIds, memberMode = "any") {
  if (!memberIds || memberIds.length === 0) return true;
  const own = new Set(allAppearingMemberIds(video));
  return memberMode === "all" ? memberIds.every((memberId) => own.has(memberId)) : memberIds.some((memberId) => own.has(memberId));
}

export function sortYoutubeVideos(videos, sort = "asc") {
  const direction = sort === "desc" ? -1 : 1;
  // 同じ日の動画は ID で並べて、毎回同じ順にする
  return [...videos].sort((a, b) => direction * (String(a.publishedAt).localeCompare(String(b.publishedAt)) || String(a.publishedAtTime ?? "").localeCompare(String(b.publishedAtTime ?? "")) || a.id.localeCompare(b.id)));
}

export function filterYoutubeVideos(videos, filter = YOUTUBE_DEFAULT_FILTER) {
  const resolved = { ...YOUTUBE_DEFAULT_FILTER, ...filter };
  const filtered = videos.filter(
    (video) =>
      (resolved.includeUnconfirmed || isConfirmedAppearance(video)) &&
      (resolved.year === "all" || youtubeVideoYear(video) === String(resolved.year)) &&
      (resolved.kind === "all" || video.kind === resolved.kind) &&
      matchesYoutubeMembers(video, resolved.memberIds, resolved.memberMode) &&
      matchesYoutubeQuery(video, resolved.query)
  );
  return sortYoutubeVideos(filtered, resolved.sort);
}

export function isDefaultYoutubeFilter(filter) {
  const resolved = { ...YOUTUBE_DEFAULT_FILTER, ...filter };
  return (
    resolved.query.trim() === "" &&
    resolved.memberIds.length === 0 &&
    resolved.year === "all" &&
    resolved.kind === "all" &&
    resolved.sort === YOUTUBE_DEFAULT_FILTER.sort &&
    resolved.includeUnconfirmed === YOUTUBE_DEFAULT_FILTER.includeUnconfirmed
  );
}

export function availableYoutubeYears(videos) {
  return [...new Set(videos.map(youtubeVideoYear).filter((year) => /^\d{4}$/.test(year)))].sort();
}

export function availableYoutubeKinds(videos) {
  const kinds = new Set(videos.map((video) => video.kind));
  return Object.values(YOUTUBE_KIND).filter((kind) => kinds.has(kind));
}

// メンバー別の本数（名前で確定・推定した動画と、映像で登場した動画。＝LOVE 名義だけ・未確認は数えない）
export function countYoutubeByMember(videos, memberId) {
  return videos.filter((video) => allAppearingMemberIds(video).includes(memberId)).length;
}

// 状態の数（収録・未確認）
export function countYoutubeByStatus(videos) {
  const counts = Object.fromEntries(Object.values(APPEARANCE_STATUS).map((status) => [status, 0]));
  videos.forEach((video) => {
    if (Object.hasOwn(counts, video.status)) counts[video.status] += 1;
  });
  return counts;
}

// 確認の状態の短い言葉（カードの印）。確定は印を出さない（推定・未確認だけ目立たせる）
export function describeYoutubeStatusMark(video) {
  switch (video.status) {
    case APPEARANCE_STATUS.TITLE_NAME:
    case APPEARANCE_STATUS.DESCRIPTION_NAME:
      return "出演者は推定";
    case APPEARANCE_STATUS.GROUP_ONLY:
      return "メンバー未確認";
    case APPEARANCE_STATUS.UNCONFIRMED:
      return "出演者未確認";
    default:
      return "";
  }
}

// 根拠の行（詳しく見るの中）
export function describeYoutubeEvidence(video) {
  return (video.evidence ?? []).map((item) => {
    const label = EVIDENCE_TYPE_LABELS[item.type] ?? item.type;
    return item.detail ? `${label}（${item.detail}）` : label;
  });
}
