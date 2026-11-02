// CD・特典映像図鑑の「データの組み立て・絞り込み」を担当するファイル（2026-11-02新設）。
// DOM に触れない（tests.html から直接テストできるように）。データは js/data/cdBonus.js。
//
// 【探し方の約束（本人の依頼 R10-2）】
// ・映像の題名・見出し（group）は「言葉が含まれていれば当たる」。
// ・関連の言葉（keywords）は「言葉ぴったり」だけで当たる（「富士山」で「富士急」の映像を出さない。前方一致・誤字の候補にもしない）。
// ・正規化（ひらがな／カタカナ・全角／半角・記号）は全体検索と同じ js/searchNormalize.js を使う。
import { CD_BONUS_WORKS, CD_BONUS_CATEGORIES, CD_BONUS_SERIES, CD_BONUS_OTHER_RELEASES } from "./data/cdBonus.js";
import { MEMBERS } from "./data/members.js";
import { normalizeSearchText } from "./searchNormalize.js";

export const CD_BONUS_ORDER = { OLD: "old", NEW: "new" };
// 「特典映像から探す」で、最初に選ばれている分類（MV 以外のすべて）
export const CD_BONUS_ALL_BONUS = "bonus";
export const CD_BONUS_ALL = "all";

const CATEGORY_LABELS = Object.fromEntries(CD_BONUS_CATEGORIES.map((category) => [category.id, category.label]));

export function cdBonusCategoryLabel(categoryId) {
  return CATEGORY_LABELS[categoryId] ?? categoryId;
}

// 分類の名前と、その中の1語ずつ（「ロケ・旅行」→「ロケ・旅行」「ロケ」「旅行」）。検索で「ぴったり」当てる言葉に使う
export function cdBonusCategoryWords(categoryId) {
  const label = cdBonusCategoryLabel(categoryId);
  return [...new Set([label, ...label.split("・")])];
}

// ジャケットの画像を出してよいか（2026-11-03 本人の決定：今は全部 null＝出さない）。
// 将来、公式が許す表示の方法が見つかったときだけ、画像の URL・出典・利用条件（要約と URL）がそろったものを出す
export function canShowCdBonusJacket(jacket) {
  return Boolean(jacket && jacket.imageUrl && jacket.sourceUrl && jacket.terms && jacket.termsUrl);
}

// 「1st」「2nd」「3rd」「21st」…
export function ordinal(number) {
  const n = Number(number);
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${{ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th"}`;
}

// 「9thシングル」「1stアルバム」
export function cdBonusWorkLabel(work) {
  return `${ordinal(work.number)}${work.kind === "album" ? "アルバム" : "シングル"}`;
}

export function formatCdBonusDate(dateText) {
  const [year, month, day] = String(dateText ?? "").split("-").map(Number);
  return year ? `${year}年${month}月${day}日` : "";
}

// TYPE の札の色（A〜F。ジャケットの画像の代わりに、TYPE を色と文字で見分ける）
const TYPE_TONES = { A: "a", B: "b", C: "c", D: "d", E: "e", F: "f" };
export function cdBonusTypeTone(typeId) {
  return TYPE_TONES[typeId] ?? "x";
}

// TYPE の短い説明（「CD+DVD・初回仕様限定盤」）
export function describeCdBonusType(type) {
  return [type.format, type.edition].filter(Boolean).join("・");
}

// MV 以外の映像（＝いわゆる特典映像）か
export function isBonusVideo(video) {
  return !video.categories.includes("mv");
}

// 作品の一覧の1行分の要約
export function summarizeCdBonusWork(work) {
  const videoTypes = work.types.filter((type) => type.videos.length > 0);
  const bonusTypes = work.types.filter((type) => type.videos.some(isBonusVideo));
  const videos = work.types.flatMap((type) => type.videos);
  return {
    work,
    label: cdBonusWorkLabel(work),
    typeCount: work.types.length,
    videoTypeIds: videoTypes.map((type) => type.id),
    bonusTypeIds: bonusTypes.map((type) => type.id),
    videoCount: videos.length,
    bonusVideoCount: videos.filter(isBonusVideo).length,
    // 一覧で見せる、MV 以外の映像の題名（短く。前編・後編は1つにまとめない＝別の映像なので）
    //   企画の映像を先に、メイキングを後に（カードで「何の映像か」が先に分かるように）
    bonusTitles: [
      ...new Set(
        videos
          .filter((video) => isBonusVideo(video) && !video.group)
          .sort((a, b) => Number(a.categories.includes("making")) - Number(b.categories.includes("making")))
          .map((video) => video.title)
      ),
    ],
    bonusGroups: [...new Set(videos.filter((video) => isBonusVideo(video) && video.group).map((video) => video.group))],
  };
}

export function sortCdBonusWorks(works, order = CD_BONUS_ORDER.OLD) {
  const sorted = works.slice().sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || a.number - b.number);
  return order === CD_BONUS_ORDER.NEW ? sorted.reverse() : sorted;
}

// 映像を1本ずつ、作品・TYPE と一緒に並べた索引
export function buildCdBonusVideoIndex(works = CD_BONUS_WORKS) {
  return works.flatMap((work) => work.types.flatMap((type) => type.videos.map((video) => ({ video, type, work }))));
}

const VIDEO_INDEX = buildCdBonusVideoIndex();
const VIDEO_BY_ID = new Map(VIDEO_INDEX.map((row) => [row.video.id, row]));

export function findCdBonusVideo(videoId) {
  return VIDEO_BY_ID.get(videoId) ?? null;
}

export function findCdBonusWork(workId, works = CD_BONUS_WORKS) {
  return works.find((work) => work.workId === workId) ?? null;
}

// 分類ごとの映像の数（「特典映像から探す」の札の数）
export function countCdBonusVideosByCategory(index = VIDEO_INDEX) {
  const counts = Object.fromEntries(CD_BONUS_CATEGORIES.map((category) => [category.id, 0]));
  counts[CD_BONUS_ALL_BONUS] = 0;
  counts[CD_BONUS_ALL] = index.length;
  index.forEach(({ video }) => {
    video.categories.forEach((categoryId) => {
      counts[categoryId] = (counts[categoryId] ?? 0) + 1;
    });
    if (isBonusVideo(video)) counts[CD_BONUS_ALL_BONUS] += 1;
  });
  return counts;
}

const MEMBER_NAME = new Map(MEMBERS.map((member) => [member.id, member.name]));
export function cdBonusMemberNames(video) {
  return (video.memberIds ?? []).map((memberId) => MEMBER_NAME.get(memberId)).filter(Boolean);
}

// 検索語（空白で区切った言葉）を正規化して配列にする
export function tokenizeCdBonusQuery(rawQuery) {
  return String(rawQuery ?? "")
    .split(/[\s　]+/)
    .map(normalizeSearchText)
    .filter(Boolean);
}

// 1本の映像の、検索用の言葉（正規化済み）
function buildVideoTerms({ video, work }) {
  const normalize = (list) => list.filter(Boolean).map(normalizeSearchText).filter(Boolean);
  return {
    // 含まれていれば当たる：映像の題名・見出し・作品名
    contains: normalize([video.title, video.group, work.title]),
    // ぴったりだけ当たる：関連の言葉・分類の名前・題名に名前が出てくるメンバー
    exact: normalize([...(video.keywords ?? []), ...video.categories.flatMap(cdBonusCategoryWords), ...cdBonusMemberNames(video)]),
  };
}
const TERMS_BY_ID = new Map(VIDEO_INDEX.map((row) => [row.video.id, buildVideoTerms(row)]));

export function videoMatchesCdBonusQuery(row, tokens) {
  if (tokens.length === 0) return true;
  const terms = TERMS_BY_ID.get(row.video.id) ?? buildVideoTerms(row);
  return tokens.every((token) => terms.exact.includes(token) || terms.contains.some((text) => text.includes(token)));
}

// 「特典映像から探す」の絞り込み。category："bonus"（MV 以外のすべて）／"all"／分類の id。query：言葉
export function filterCdBonusVideos({ category = CD_BONUS_ALL_BONUS, query = "", order = CD_BONUS_ORDER.OLD } = {}, index = VIDEO_INDEX) {
  const tokens = tokenizeCdBonusQuery(query);
  const rows = index.filter((row) => {
    if (category === CD_BONUS_ALL_BONUS && !isBonusVideo(row.video)) return false;
    if (category !== CD_BONUS_ALL && category !== CD_BONUS_ALL_BONUS && !row.video.categories.includes(category)) return false;
    return videoMatchesCdBonusQuery(row, tokens);
  });
  const workOrder = sortCdBonusWorks([...new Set(rows.map((row) => row.work))], order);
  return workOrder.map((work) => ({ work, rows: rows.filter((row) => row.work === work) }));
}

// 「この映像が入っている所」：その TYPE と、公式で確かめられる再収録・同じ題名の別の入れ物
//   kind："type"（この図鑑の TYPE）／"release"（図鑑の外の作品。MV 集など）
export function describeCdBonusVideoHomes(videoId) {
  const row = findCdBonusVideo(videoId);
  if (!row) return [];
  const homes = [{ kind: "type", workId: row.work.workId, typeId: row.type.id, videoId, match: "self" }];
  (row.video.alsoOn ?? []).forEach((entry) => {
    if (entry.videoId) {
      const other = findCdBonusVideo(entry.videoId);
      if (other) homes.push({ kind: "type", workId: other.work.workId, typeId: other.type.id, videoId: entry.videoId, match: entry.match });
    } else if (entry.release && CD_BONUS_OTHER_RELEASES[entry.release]) {
      homes.push({ kind: "release", release: CD_BONUS_OTHER_RELEASES[entry.release], releaseId: entry.release, edition: entry.edition, place: entry.place, match: entry.match, officialTitle: entry.officialTitle ?? null });
    }
  });
  return homes;
}

export const CD_BONUS_MATCH_LABELS = {
  stated: "公式に再収録と書いてある",
  sameTitle: "公式の題名が同じ",
  unverified: "同じ曲の MV メイキング（同じ映像かは公式に書いていない）",
};

// 同じまとまり（前編・後編など）の、ほかの TYPE の映像
export function findCdBonusSeriesSiblings(videoId) {
  const row = findCdBonusVideo(videoId);
  if (!row?.video.series) return [];
  return VIDEO_INDEX.filter((other) => other.video.series === row.video.series && other.video.id !== videoId && (other.video.group ?? null) === null);
}

export function cdBonusSeriesLabel(seriesId) {
  return CD_BONUS_SERIES[seriesId] ?? null;
}

// 1つの TYPE の映像の要約（タブ・TYPE の一覧で「この TYPE に何が入っているか」を一目で）
export function summarizeCdBonusTypeVideos(type) {
  if (!type.videos.length) return { has: false, text: "映像特典なし" };
  const grouped = new Map();
  type.videos.forEach((video) => {
    const key = video.group ?? video.title;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(video);
  });
  const parts = [...grouped.entries()].map(([key, videos]) => (videos.length > 1 && videos[0].group ? `${key}（${videos.length}本）` : key));
  return { has: true, text: parts.join("／") };
}

export { CD_BONUS_WORKS, CD_BONUS_CATEGORIES, CD_BONUS_OTHER_RELEASES };
