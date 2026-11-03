// 「YouTube 出演図鑑」の出演者の確かさと、要確認の印（2026-11-03新設・本人の依頼 R11-B）。
// 公開のたびに js/youtubeRefreshCore.js が1本ずつ呼び、データに confidence（確かさ）と reviewFlags（要確認の印）を付ける。
// 手元の点検（tools の点検の資料づくり）も同じ決まりを使う。DOM・通信には触れない。
//
// 【確かさ（confidence）の4つ】画面ではこの4つだけを見せる（複雑にしすぎない）
//   confirmed：確認済み……説明欄の公式の出演者の表記がある、または本人が動画で確かめた（全員）
//   partial：一部確認……本人が「この人は出ている」と確かめたが、ほかにも出ているかは分からない
//   estimated：推定……タイトル・説明の文・再生リストから推した（名前が出ていても、出演者の全部とは限らない）
//   unconfirmed：未確認
// 【点検の7つの分類（数えるため）】1〜6 はどれか1つ（主な根拠で決める）。7（要確認の印）は 1〜6 と重なって数える
//   1 全出演者を確認／2 一部だけ確認／3 説明欄から推定／4 タイトルから推定／5 再生リスト・グループ名・説明欄の書き手から推定／6 まったく未確認
//   7 矛盾・取りこぼしの疑い（reviewFlags が1つ以上）
import { MEMBERS, MEMBER_STATUS } from "./data/members.js";
import { APPEARANCE_STATUS, findEqualLoveNamesInText, findGivenNamesInTitle, extractDescriptionBody, extractCastNames, normalizePersonName } from "./youtubeAppearanceClassifier.js";

export const APPEARANCE_CONFIDENCE = Object.freeze({
  CONFIRMED: "confirmed",
  PARTIAL: "partial",
  ESTIMATED: "estimated",
  UNCONFIRMED: "unconfirmed",
});

export const APPEARANCE_CONFIDENCE_LABELS = Object.freeze({
  confirmed: "確認済み",
  partial: "一部確認",
  estimated: "推定",
  unconfirmed: "未確認",
});

// 要確認の印
export const REVIEW_FLAG = Object.freeze({
  WRITER_ONLY: "writer-only", // 説明欄の文を書いた人の名前しか無い
  ONE_NAME_GROUP_WORDS: "one-name-group-words", // 分かっている人が1人なのに「メンバー」「みんな」「○人」などの言葉がある
  NAMES_OUTSIDE_CAST: "names-outside-cast", // 出演者の表記にない＝LOVE のメンバーの名前が、タイトル・本文にある
  SURNAME_HINT: "surname-hint", // 出演者の表記が無く、名字だけの名前（「大場 佐々木」など）がある
  GROUP_ONLY: "group-only", // 再生リスト・グループ名だけで、出演者の名前が1人も分からない
  NAME_LIST_NOT_CAST: "name-list-not-cast", // 説明欄に「名前（ローマ字）」の一覧があるが、出演の見出しの下ではない（メンバー紹介・SNS の一覧など）
});

export const REVIEW_FLAG_LABELS = Object.freeze({
  "writer-only": "説明欄の文を書いた人の名前しか分からない",
  "one-name-group-words": "分かっている出演者は1人だが、複数の人の企画に見える言葉がある",
  "names-outside-cast": "出演者の表記にないメンバーの名前が、タイトルか説明の文にある",
  "surname-hint": "名字だけの名前があり、取りこぼしているかもしれない",
  "group-only": "＝LOVE の動画だが、出演者の名前が1人も分からない",
  "name-list-not-cast": "説明欄にメンバーの名前の一覧があるが、出演者の見出しではない（メンバー紹介・SNS の一覧の可能性）",
});

// 名字（名字だけで書かれたときの手がかり。齋藤樹愛羅・齊藤なぎさは名字では区別できないので、どちらか分からない印にする）
const SURNAMES = Object.freeze({
  "otani-emiri": "大谷",
  "oba-hana": "大場",
  "otoshima-risa": "音嶋",
  "sasaki-maika": "佐々木",
  "takamatsu-hitomi": "高松",
  "takiwaki-shoko": "瀧脇",
  "noguchi-iori": "野口",
  "morohashi-sana": "諸橋",
  "yamamoto-anna": "山本",
  "satake-nonno": "佐竹",
});
const SAITO_SURNAME = "斉藤";

const ROMAJI_NAME_LINE = /[(（][A-Za-z][A-Za-z .]+[)）]$/;
// 複数の人の企画に見える言葉
const GROUP_WORDS_PATTERN = /メンバー|みんな|皆で|皆さんと|全員|大集合|[0-9０-９二三四五六七八九十]+人|ふたり|二人|対決|決定戦|王決定|リレー|バトル|女子会|大会|チーム/;

export function confidenceOf(video) {
  if (video.confidence && Object.hasOwn(APPEARANCE_CONFIDENCE_LABELS, video.confidence)) return video.confidence;
  switch (video.status) {
    case APPEARANCE_STATUS.CAST_LIST:
      return APPEARANCE_CONFIDENCE.CONFIRMED;
    case APPEARANCE_STATUS.MANUAL:
      // 【R12】サムネイルだけで確かめたもの（本編の出演者が分からない）は「一部確認」
      if (video.partial) return APPEARANCE_CONFIDENCE.PARTIAL;
      if (!(video.memberIds ?? []).length && !(video.footageMemberIds ?? []).length && (video.thumbnailMemberIds ?? []).length) return APPEARANCE_CONFIDENCE.PARTIAL;
      return APPEARANCE_CONFIDENCE.CONFIRMED;
    case APPEARANCE_STATUS.UNCONFIRMED:
      return APPEARANCE_CONFIDENCE.UNCONFIRMED;
    default:
      return APPEARANCE_CONFIDENCE.ESTIMATED;
  }
}

// 点検の分類（1〜6）
export function auditCategoryOf(video) {
  const confidence = confidenceOf(video);
  if (confidence === APPEARANCE_CONFIDENCE.CONFIRMED) return 1;
  if (confidence === APPEARANCE_CONFIDENCE.PARTIAL) return 2;
  if (confidence === APPEARANCE_CONFIDENCE.UNCONFIRMED) return 6;
  if (video.status === APPEARANCE_STATUS.DESCRIPTION_NAME) return 3;
  if (video.status === APPEARANCE_STATUS.TITLE_NAME) return 4;
  return 5;
}

export const AUDIT_CATEGORY_LABELS = Object.freeze({
  1: "全出演者を確認できている",
  2: "一部しか確認できていない",
  3: "説明欄から推定",
  4: "タイトルから推定",
  5: "再生リスト・グループ名・説明欄の書き手から推定",
  6: "まったく未確認",
  7: "矛盾・取りこぼしの疑い（1〜6と重なる）",
});

function surnameHints(text) {
  const normalized = normalizePersonName(text);
  const hits = Object.entries(SURNAMES).filter(([, surname]) => normalized.includes(surname)).map(([memberId]) => memberId);
  if (normalized.includes(SAITO_SURNAME)) hits.push("saito-kiara-or-nagisa");
  return hits;
}

// 1本の要確認の印。raw：取得した動画（タイトル・説明）、entry：判定の結果（memberIds・footageMemberIds・writerMemberIds・status）
export function reviewFlagsOf(raw, entry) {
  const flags = [];
  const known = new Set([...(entry.memberIds ?? []), ...(entry.footageMemberIds ?? []), ...(entry.thumbnailMemberIds ?? [])]);
  const title = String(raw.title ?? "");
  const body = extractDescriptionBody(raw.description);
  const hasCastList = Boolean(extractCastNames(raw.description));
  if (entry.status === APPEARANCE_STATUS.MANUAL) return flags; // 本人が確かめたものは印を付けない
  if (known.size === 0 && (entry.writerMemberIds ?? []).length) flags.push(REVIEW_FLAG.WRITER_ONLY);
  else if (known.size === 0 && entry.status === APPEARANCE_STATUS.GROUP_ONLY) flags.push(REVIEW_FLAG.GROUP_ONLY);
  if (known.size === 1 && GROUP_WORDS_PATTERN.test(`${title}\n${body}`)) flags.push(REVIEW_FLAG.ONE_NAME_GROUP_WORDS);
  const named = new Set([...findEqualLoveNamesInText(`${title}\n${body}`), ...findGivenNamesInTitle(title)]);
  if (hasCastList && [...named].some((memberId) => !known.has(memberId))) flags.push(REVIEW_FLAG.NAMES_OUTSIDE_CAST);
  // 「大谷 映美里 (Emiri Otani)」の形の行の名前で、出演者として読んでいない人
  const listedNames = String(raw.description ?? "")
    .split(/\r?\n/)
    .filter((line) => ROMAJI_NAME_LINE.test(line.trim()))
    .flatMap((line) => findEqualLoveNamesInText(line));
  if (listedNames.some((memberId) => !known.has(memberId))) flags.push(REVIEW_FLAG.NAME_LIST_NOT_CAST);
  if (!hasCastList) {
    const hints = surnameHints(`${title}\n${body}`).filter((memberId) => !known.has(memberId) && !(memberId === "saito-kiara-or-nagisa" && (known.has("saito-kiara") || known.has("saito-nagisa"))));
    if (hints.length) flags.push(REVIEW_FLAG.SURNAME_HINT);
  }
  return flags;
}

// 数える（7つの分類と、推定の総数）
export function countAuditCategories(videos) {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  videos.forEach((video) => {
    counts[auditCategoryOf(video)] += 1;
    if ((video.reviewFlags ?? []).length) counts[7] += 1;
  });
  return { ...counts, estimatedTotal: counts[3] + counts[4] + counts[5] };
}

// 【R12】その日に在籍していたメンバー（members.js の加入日・在籍期間から。卒業メンバーを含む）
// 例：2020-05-01 → 12人（佐竹のん乃・齊藤なぎさを含む）。今の10人と混同しないために使う
export function membersActiveOn(date, members = MEMBERS) {
  const day = String(date ?? "").slice(0, 10);
  return members
    .filter((member) => {
      const start = member.activePeriod?.start ?? member.joinDate ?? "0000-00-00";
      const end = member.activePeriod?.end ?? member.graduationDate ?? (member.status === MEMBER_STATUS.GRADUATED ? "0000-00-00" : "9999-12-31");
      return start <= day && day <= end;
    })
    .map((member) => member.id);
}
