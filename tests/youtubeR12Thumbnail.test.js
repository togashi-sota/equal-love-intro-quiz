// 【2026-11-03新設・本人の依頼 R12-2・3】YouTube 出演図鑑の「サムネイルに登場」と、本人の確認の答えの取り込みの回帰テスト。
// - 最初の動画（チャンネル始動の回）は、本人の確認として「サムネイルに登場」の11人（2020年5月の12人から、この時期 YouTube に出ていない髙松瞳を除く）
// - サムネイルに登場は、本編の出演（memberIds）・映像で登場（footageMemberIds）と分けて持ち、絞り込み・検索では見つかる
// - 毎週の自動更新で作り直しても消えない（前のデータが無い・期限切れ・説明欄が変わった、のどれでも）
// - 確認の資料の答え（JSON）を、決まりどおりの登録の形にする（サムネイルで判断したものを本編の出演にしない）
// 文はダミー（動画 ID だけ本物の鍵を使う。タイトル・説明は本物を使わない）。
import { MEMBERS } from "../js/data/members.js";
import { YOUTUBE_VERIFIED_JUDGMENTS } from "../js/data/youtubeVerifiedJudgments.js";
import { YOUTUBE_INFERRED_JUDGMENTS } from "../js/data/youtubeInferredJudgments.js";
import { membersActiveOn, confidenceOf } from "../js/youtubeAppearanceAudit.js";
import { buildYoutubePublishedData } from "../js/youtubeRefreshCore.js";
import { validateYoutubePublishedData } from "../js/youtubeAppearanceData.js";
import { filterYoutubeVideos, countYoutubeByMember } from "../js/youtubeAppearancesModel.js";
import { initYoutubeAppearancesScreen, openYoutubeAppearances } from "../js/youtubeAppearancesScreen.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { normalizeAnswerItem } from "../scripts/youtube/verified-answer.mjs";
import { assertEqual } from "./test-utils.js";

const FIRST_VIDEO_ID = "RJtnZdUOIL8";
const memberIds = new Set(MEMBERS.map((member) => member.id));

function runJudgmentTests() {
  const atStart = membersActiveOn("2020-05-01");
  assertEqual(atStart.length, 12, "当時の在籍：2020年5月は12人（members.js の在籍期間から）");
  assertEqual(atStart.includes("satake-nonno") && atStart.includes("saito-nagisa"), true, "当時の在籍：卒業メンバーの佐竹のん乃・齊藤なぎさを含む");
  assertEqual(membersActiveOn("2026-11-03").length, 10, "当時の在籍：今は10人（混同しない）");
  // 【R12 最終】本人はまだ一人ずつ確かめていないので、本人の確認ではなく「推定」（本人が採用した推定）として持つ
  assertEqual(YOUTUBE_VERIFIED_JUDGMENTS.some((judgment) => judgment.videoId === FIRST_VIDEO_ID), false, "最初の動画：本人の確認の一覧には入れない（まだ一人ずつ確かめていない）");
  const first = YOUTUBE_INFERRED_JUDGMENTS.find((judgment) => judgment.videoId === FIRST_VIDEO_ID);
  assertEqual([first?.source, first?.basis, first?.approvedBy, "verifiedBy" in first, first?.memberIds, first?.footageMemberIds], ["inference", "thumbnail-count-and-official-text", "owner", false, [], []], "最初の動画：推定（人数と公式の説明から）・本人が採用・本編の出演と映像で登場は空");
  assertEqual(first.thumbnailMemberIds.length, 11, "最初の動画：サムネイルに登場は11人（サムネイルに写っている人数）");
  assertEqual(first.thumbnailMemberIds.every((memberId) => atStart.includes(memberId)), true, "最初の動画：全員が当時の在籍メンバー");
  assertEqual(atStart.filter((memberId) => !first.thumbnailMemberIds.includes(memberId)), ["takamatsu-hitomi"], "最初の動画：当時の12人のうち入っていないのは髙松瞳だけ（この時期 YouTube に出ていない）");
}

function fetchedWith(description, { fetchedAt = "2026-11-10T00:00:00.000Z" } = {}) {
  return {
    meta: { fetchedAt, channelVideoCount: 2 },
    videos: [
      { id: FIRST_VIDEO_ID, title: "【ダミー】始動の回【=LOVE】", description, publishedAt: "2020-05-01T11:00:00Z", duration: "PT20M", privacyStatus: "public", liveStreaming: null },
      { id: "r12Video002", title: "【ダミー】料理", description: "ダミー\n\n▼出演メンバー\n野口 衣織 (Iori Noguchi)\n", publishedAt: "2021-01-01T11:00:00Z", duration: "PT20M", privacyStatus: "public", liveStreaming: null },
    ],
    shortsIds: [],
    liveIds: [],
    playlists: [],
  };
}

function runAutoUpdateTests() {
  const now = new Date("2026-11-10T01:00:00Z");
  const first = buildYoutubePublishedData({ fetched: fetchedWith("ダミーの説明\n\n山本杏奈\n"), verifiedJudgments: YOUTUBE_VERIFIED_JUDGMENTS, previous: null, now }).data;
  const video = first.videos.find((item) => item.id === FIRST_VIDEO_ID);
  assertEqual([video.memberIds, video.footageMemberIds, video.thumbnailMemberIds.length, video.confidence, Boolean(video.verified), video.inferred?.basis], [[], [], 11, "estimated", false, "thumbnail-count-and-official-text"], "自動更新：推定の「サムネイルに登場」11人・本編は空・確かさは推定・本人の確認の印なし");
  assertEqual(video.evidence.map((item) => item.type), ["inferred"], "自動更新：根拠の種類は「推定（本人が採用）」");
  assertEqual(validateYoutubePublishedData(first, { now, memberIds }).ok, true, "自動更新：検査に通る");
  // 次の週：前のデータあり・説明欄が変わった
  const second = buildYoutubePublishedData({ fetched: fetchedWith("説明が書き換わった", { fetchedAt: "2026-11-17T00:00:00.000Z" }), verifiedJudgments: YOUTUBE_VERIFIED_JUDGMENTS, previous: first, now: new Date("2026-11-17T01:00:00Z") }).data;
  assertEqual(second.videos.find((item) => item.id === FIRST_VIDEO_ID).thumbnailMemberIds.length, 11, "自動更新：説明欄が変わっても消えない");
  // 前のデータが期限切れ
  const expiredPrevious = { ...first, fetchedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z" };
  assertEqual(buildYoutubePublishedData({ fetched: fetchedWith(""), verifiedJudgments: YOUTUBE_VERIFIED_JUDGMENTS, previous: expiredPrevious, now }).data.videos.find((item) => item.id === FIRST_VIDEO_ID).thumbnailMemberIds.length, 11, "自動更新：前のデータが期限切れでも消えない（git の本人の確認から毎回作る）");
  // 絞り込み・数・検索で見つかる
  assertEqual(filterYoutubeVideos(first.videos, { memberIds: ["satake-nonno"] }).map((item) => item.id), [FIRST_VIDEO_ID], "絞り込み：サムネイルに登場した人で絞ると見つかる");
  assertEqual(filterYoutubeVideos(first.videos, { memberIds: ["takamatsu-hitomi"] }).length, 0, "絞り込み：サムネイルにいない人では出ない");
  assertEqual(countYoutubeByMember(first.videos, "yamamoto-anna"), 1, "数：サムネイルに登場も、その人の本数に入る");
  const entries = buildAppSearchEntries({ youtubeVideos: first.videos });
  const entry = entries.find((item) => item.key === `youtube:${FIRST_VIDEO_ID}`);
  assertEqual(entry.lines.some((line) => line.startsWith("サムネイルに登場（推定）：")) && !entry.lines.some((line) => line.startsWith("出演")), true, "全体検索：「サムネイルに登場（推定）」と書き、本編の出演とは書かない");
  assertEqual(searchAppEntries(entries, "佐竹のん乃", "youtube").results.some(({ entry: item }) => item.key === `youtube:${FIRST_VIDEO_ID}`), true, "全体検索：サムネイルに登場した人の名前で見つかる");
  assertEqual(confidenceOf({ status: "manual", memberIds: [], footageMemberIds: [], thumbnailMemberIds: ["oba-hana"] }), "partial", "確かさ：本人がサムネイルだけで確かめたものは「一部確認」（本編の出演者は分からない）");
  // 本人があとで確かめたら、本人の確認が推定より優先される（推定の1行が残っていても）
  const ownerAnswer = { videoId: FIRST_VIDEO_ID, decision: "include", memberIds: [], footageMemberIds: [], thumbnailMemberIds: ["oba-hana", "noguchi-iori"], basis: "thumbnail", verifiedBy: "owner", verifiedOn: "2026-12-01", note: "ダミー" };
  const afterOwner = buildYoutubePublishedData({ fetched: fetchedWith(""), verifiedJudgments: [...YOUTUBE_VERIFIED_JUDGMENTS, ownerAnswer], previous: first, now }).data.videos.find((item) => item.id === FIRST_VIDEO_ID);
  assertEqual([afterOwner.thumbnailMemberIds, Boolean(afterOwner.inferred), afterOwner.verifiedBasis, afterOwner.confidence], [["oba-hana", "noguchi-iori"], false, "thumbnail", "partial"], "本人の確認に変える：本人の答えを登録すると、推定より優先して「本人がサムネイルで確認」になる");
  return first;
}

async function runScreenTests(data) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:390px";
  document.body.appendChild(container);
  try {
    initYoutubeAppearancesScreen({ container }, { videos: data.videos, data, thumbnailUrl: () => "data:," });
    openYoutubeAppearances({ returnScreen: "start" });
    const card = container.querySelector(`.yta-card[data-id="${FIRST_VIDEO_ID}"]`);
    assertEqual(card.querySelector(".yta-people--thumbnail .yta-footage-label")?.textContent, "サムネイルに登場（推定）", "画面：「サムネイルに登場（推定）」の行（本編の出演とは別の行）");
    assertEqual(card.querySelectorAll(".yta-people--thumbnail .yta-member").length, 11, "画面：サムネイルの11人");
    assertEqual([...card.querySelectorAll(".yta-people:not(.yta-people--footage) .yta-member")].length, 0, "画面：本編の出演の行には誰も出さない");
    assertEqual(card.querySelector(".yta-people .yta-badge.is-group")?.textContent, "本編の出演者は未確認", "画面：本編の出演者は未確認と書く");
    assertEqual(Boolean(card.querySelector(".yta-badge.is-verified")), false, "画面：「本人が確認」「本人がサムネイルで確認」とは出さない");
    assertEqual(card.querySelector(".yta-people .yta-badge.is-estimated")?.textContent, "推定", "画面：推定の印");
    assertEqual(card.querySelector(".yta-why-list").textContent.includes("表紙の画像の人数と公式の説明から推定した人です（一人ずつの確認はまだ。本編に出ているかも確かめていません）"), true, "画面：くわしくを開くと、推定の意味が分かる");
    assertEqual(/本人が(サムネイルで)?確認|本人の確認/.test(card.textContent), false, "画面：このカードに「本人が確認」「本人がサムネイルで確認」の言葉が無い");
  } finally {
    container.remove();
    initYoutubeAppearancesScreen({ container: null }, {});
  }
}

function runAnswerTests() {
  const base = { videoId: "abcDEF12345", decision: "include", verifiedBy: "owner", verifiedOn: "2026-11-04", note: "ダミー" };
  const thumbnailAnswer = normalizeAnswerItem({ ...base, basis: "thumbnail", memberIds: ["oba-hana"], thumbnailMemberIds: ["otani-emiri"] }, memberIds);
  assertEqual([thumbnailAnswer.entry.memberIds, thumbnailAnswer.entry.thumbnailMemberIds, thumbnailAnswer.warnings.length], [[], ["otani-emiri", "oba-hana"], 1], "答えの取り込み：サムネイルで判断なら、本編を選んだ人もサムネイルに登場にする（注意を出す）");
  const fullAnswer = normalizeAnswerItem({ ...base, basis: "full-video", memberIds: ["oba-hana"], footageMemberIds: ["oba-hana", "satake-nonno"] }, memberIds);
  assertEqual([fullAnswer.entry.memberIds, fullAnswer.entry.footageMemberIds], [["oba-hana"], ["satake-nonno"]], "答えの取り込み：本編まで見たら本編の出演。重なりは本編を優先");
  const errors = [
    () => normalizeAnswerItem({ ...base, videoId: "bad" }, memberIds),
    () => normalizeAnswerItem({ ...base, decision: "maybe", basis: "thumbnail" }, memberIds),
    () => normalizeAnswerItem({ ...base, basis: "thumbnail", memberIds: ["someone"] }, memberIds),
    () => normalizeAnswerItem({ ...base, basis: null, memberIds: ["oba-hana"] }, memberIds),
  ].map((run) => {
    try {
      run();
      return false;
    } catch (error) {
      return true;
    }
  });
  assertEqual(errors, [true, true, true, true], "答えの取り込み：ID の形・判断・知らないメンバー・判断のしかたが無い、は登録しない");
  assertEqual(normalizeAnswerItem({ ...base, decision: "exclude", basis: null }, memberIds).entry.decision, "exclude", "答えの取り込み：除外は判断のしかたが無くてもよい");
  assertEqual(normalizeAnswerItem({ ...base, basis: "thumbnail", note: "あ".repeat(500) }, memberIds).entry.note.length, 200, "答えの取り込み：メモは短く（説明欄を写さない）");
}

export async function runYoutubeR12ThumbnailTests() {
  console.log("--- YouTube 出演図鑑：サムネイルに登場・本人の確認の取り込み（R12） ---");
  runJudgmentTests();
  const data = runAutoUpdateTests();
  await runScreenTests(data);
  runAnswerTests();
}
