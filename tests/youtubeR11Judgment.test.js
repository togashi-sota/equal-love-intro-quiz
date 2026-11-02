// 【2026-11-03新設・本人の依頼 R11-B】YouTube 出演図鑑の出演者の判定の直しの回帰テスト。
// 説明欄の文を書いた人（署名・概要欄の表記）を出演者にしない／自己紹介・本文・目次の時刻の名前の扱い／
// 出演の見出しの下の「●MC」「●名前」の並びを最後まで読む／メンバー紹介の一覧を出演の根拠にしない／
// 確かさの4つ（確認済み・一部確認・推定・未確認）と点検の7つの分類／画面の表示（普段は簡潔に、くわしくは開いて見る）を確かめる。
// 文はすべてダミー（本物のタイトル・説明は使わない）。名前は members.js のメンバーの名前だけを使う。
import { APPEARANCE_STATUS, analyzeDescriptionNames, classifyYoutubeVideo, extractCastNames } from "../js/youtubeAppearanceClassifier.js";
import { APPEARANCE_CONFIDENCE, REVIEW_FLAG, auditCategoryOf, confidenceOf, countAuditCategories, reviewFlagsOf } from "../js/youtubeAppearanceAudit.js";
import { buildYoutubePublishedData } from "../js/youtubeRefreshCore.js";
import { validateYoutubePublishedData } from "../js/youtubeAppearanceData.js";
import { filterYoutubeVideos, describeYoutubeStatusMark } from "../js/youtubeAppearancesModel.js";
import { initYoutubeAppearancesScreen, openYoutubeAppearances } from "../js/youtubeAppearancesScreen.js";
import { buildAppSearchEntries } from "../js/appSearchIndex.js";
import { assertEqual } from "./test-utils.js";

const TEMPLATE = ["", "▼是非チャンネル登録お願いします！", "https://example.invalid/sub", ""].join("\n");
const ROSTER = ["▼＝LOVEメンバーの紹介（ダミー）", "大谷 映美里 (Emiri Otani)", "大場 花菜 (Hana Oba)", "山本 杏奈 (Anna Yamamoto)", ""].join("\n");

function runNameRoleTests() {
  // 署名（本文の最後に名前だけの行）＝書いた人
  const signed = ["ダミーの説明の1行目です！", "みんなで企画を考えました。", "", "山本杏奈", TEMPLATE].join("\n");
  assertEqual(analyzeDescriptionNames(signed), { writers: ["yamamoto-anna"], selfIntroduced: [], performers: [] }, "役わけ：最後の名前だけの行は、説明欄を書いた人");
  assertEqual(analyzeDescriptionNames(["ダミーの説明です。", "(概要欄：野口衣織)", TEMPLATE].join("\n")).writers, ["noguchi-iori"], "役わけ：「(概要欄：○○)」は書いた人");
  assertEqual(analyzeDescriptionNames(["＝LOVE の 瀧脇笙古 です！（ダミー）", "ダミーのゲームをしました！", TEMPLATE].join("\n")), { writers: [], selfIntroduced: ["takiwaki-shoko"], performers: ["takiwaki-shoko"] }, "役わけ：「＝LOVE の○○です」と名乗る人は出演（推定）");
  assertEqual(analyzeDescriptionNames(["野口衣織と諸橋沙夏がダミーに挑戦します！", TEMPLATE].join("\n")).performers, ["noguchi-iori", "morohashi-sana"], "役わけ：文の中の名前は出演（推定）");
  assertEqual(analyzeDescriptionNames(["ダミーの生配信です", "#ダミー", "・0:10:00：諸橋沙夏", "・0:20:00：髙松瞳"].join("\n")).performers, ["morohashi-sana", "takamatsu-hitomi"], "役わけ：目次の時刻の行の名前は出演（推定）。決まった文の後ろにあっても読む");

  // 出演の見出しの下の「●MC」「●名前」
  const withMc = ["▼出演メンバー", "●MC", "ダミー様", "https://example.invalid/a", "", "♥=LOVE", "大谷 映美里 (Emiri Otani)", "https://example.invalid/b", "大場 花菜 (Hana Oba)", "", "", "▼人気の動画"].join("\n");
  assertEqual(extractCastNames(withMc), ["MC", "ダミー様", "♥=LOVE", "大谷 映美里", "大場 花菜"], "出演の見出し：「●MC」の小見出しで止まらず、最後まで読む");
  const bullets = ["▼出演メンバー", "●大谷 映美里 (Emiri Otani)", "https://example.invalid/a", "●山本 杏奈 (Anna Yamamoto)", ""].join("\n");
  assertEqual(extractCastNames(bullets), ["大谷 映美里", "山本 杏奈"], "出演の見出し：行頭の「●」を外して読む");

  // 判定
  const signedVideo = classifyYoutubeVideo({ id: "r11Video001", title: "【ダミー】チャンネル始動", description: `${signed}\n${ROSTER}`, playlistTitles: ["=LOVE💓"] });
  assertEqual([signedVideo.status, signedVideo.memberIds, signedVideo.writerMemberIds], [APPEARANCE_STATUS.GROUP_ONLY, [], ["yamamoto-anna"]], "判定：書いた人だけ・メンバー紹介の一覧だけなら、出演者を決めない（＝LOVE の動画・出演者は未確認）");
  assertEqual(signedVideo.evidence.map((item) => item.type).includes("description-writer"), true, "判定：書いた人は根拠の種類として別に記録");
  const selfVideo = classifyYoutubeVideo({ id: "r11Video002", title: "【ダミー】ゲーム", description: ["＝LOVE の 瀧脇笙古 です！（ダミー）", TEMPLATE].join("\n") });
  assertEqual([selfVideo.status, selfVideo.memberIds], [APPEARANCE_STATUS.DESCRIPTION_NAME, ["takiwaki-shoko"]], "判定：自己紹介の人は説明欄からの推定");
}

function rawVideo(id, title, description, publishedAt = "2020-05-01T11:00:00Z") {
  return { id, title, description, publishedAt, duration: "PT10M", privacyStatus: "public", liveStreaming: null };
}

function runConfidenceTests() {
  const videos = [
    rawVideo("r11Video001", "【ダミー】皆で企画会議【=LOVE】", ["ダミーの説明です！", "", "山本杏奈", TEMPLATE, ROSTER].join("\n")),
    rawVideo("r11Video002", "【ダミー】料理", ["ダミー", TEMPLATE, "▼出演メンバー", "野口 衣織 (Iori Noguchi)", "大場 花菜 (Hana Oba)", ""].join("\n")),
    rawVideo("r11Video003", "【ダミー】メンバーで対決", ["＝LOVE の 瀧脇笙古 です！", TEMPLATE].join("\n")),
    rawVideo("r11Video004", "野口衣織のダミー", "本文だけ"),
    rawVideo("r11Video005", "【ダミー】お知らせ", "本文だけ"),
    rawVideo("r11Video006", "【ダミー】確認した回", "本文だけ"),
  ];
  const verified = [{ videoId: "r11Video006", decision: "include", memberIds: ["sasaki-maika"], footageMemberIds: [], partial: true, verifiedBy: "owner", verifiedOn: "2026-11-03", note: "ダミー" }];
  const { data } = buildYoutubePublishedData({ fetched: { meta: { fetchedAt: "2026-11-03T00:00:00.000Z", channelVideoCount: videos.length }, videos, shortsIds: [], liveIds: [], playlists: [{ title: "=LOVE💓", videoIds: ["r11Video001"] }] }, verifiedJudgments: verified, now: new Date("2026-11-03T01:00:00Z") });
  const byId = Object.fromEntries(data.videos.map((video) => [video.id, video]));
  assertEqual(
    ["r11Video001", "r11Video002", "r11Video003", "r11Video004", "r11Video005", "r11Video006"].map((id) => byId[id]?.confidence),
    ["estimated", "confirmed", "estimated", "estimated", "unconfirmed", "partial"],
    "確かさ：書いた人だけ＝推定／出演の見出し＝確認済み／自己紹介・タイトル＝推定／何も無い＝未確認／本人の一部確認＝一部確認"
  );
  assertEqual([byId.r11Video001.memberIds, byId.r11Video001.writerMemberIds], [[], ["yamamoto-anna"]], "データ：書いた人は writerMemberIds に分けて、出演者に入れない");
  assertEqual(byId.r11Video001.reviewFlags.includes(REVIEW_FLAG.WRITER_ONLY) && byId.r11Video001.reviewFlags.includes(REVIEW_FLAG.NAME_LIST_NOT_CAST), true, "要確認：書いた人だけ・メンバー紹介の一覧");
  assertEqual(byId.r11Video003.reviewFlags.includes(REVIEW_FLAG.ONE_NAME_GROUP_WORDS), true, "要確認：1人しか分からないのに「メンバーで対決」");
  assertEqual(byId.r11Video002.reviewFlags, [], "要確認：出演の見出しどおりなら印なし");
  assertEqual(
    ["r11Video001", "r11Video002", "r11Video003", "r11Video004", "r11Video005", "r11Video006"].map((id) => auditCategoryOf(byId[id])),
    [5, 1, 3, 4, 6, 2],
    "点検の分類：5 書き手・再生リスト／1 全員確認／3 説明欄／4 タイトル／6 未確認／2 一部確認"
  );
  assertEqual(data.counts.audit, { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 2, estimatedTotal: 3 }, "点検の分類：数（7 は 1〜6 と重なって数える・推定の総数）");
  assertEqual(data.counts.byConfidence, { confirmed: 1, partial: 1, estimated: 3, unconfirmed: 1 }, "確かさごとの数");
  assertEqual(validateYoutubePublishedData(data).ok, true, "検査：新しい欄があっても通る");
  assertEqual(validateYoutubePublishedData({ ...data, videos: [{ ...data.videos[0], confidence: "maybe" }] }).ok, false, "検査：知らない確かさは通さない");
  // 古いデータ（confidence の欄が無い）も読める
  assertEqual([confidenceOf({ status: "cast-list" }), confidenceOf({ status: "description-name" }), confidenceOf({ status: "group-only" }), confidenceOf({ status: "unconfirmed" })], ["confirmed", "estimated", "estimated", "unconfirmed"], "確かさ：古いデータは status から決める");
  // 絞り込み：書いた人では当たらない
  assertEqual(filterYoutubeVideos(data.videos, { memberIds: ["yamamoto-anna"] }).map((video) => video.id), [], "絞り込み：説明欄を書いた人は、出演者として当たらない");
  assertEqual(describeYoutubeStatusMark(byId.r11Video006), "一部確認", "印：一部確認");
  assertEqual(countAuditCategories([]).estimatedTotal, 0, "数：空でも動く");
  const entries = buildAppSearchEntries({ youtubeVideos: data.videos }).filter((entry) => entry.key === "youtube:r11Video003");
  assertEqual(entries[0]?.lines[0], "出演（推定）：瀧脇笙古", "全体検索：推定の人は「出演（推定）」と書く");
  return data;
}

async function runScreenTests(data) {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:390px";
  document.body.appendChild(container);
  try {
    initYoutubeAppearancesScreen({ container }, { videos: data.videos, data, thumbnailUrl: () => "data:," });
    openYoutubeAppearances({ returnScreen: "start" });
    const card = (id) => container.querySelector(`.yta-card[data-id="${id}"]`);
    const first = card("r11Video001");
    assertEqual(first.querySelector(".yta-people .yta-badge.is-group")?.textContent, "＝LOVE（出演者は未確認）", "画面：書いた人だけの動画は、出演者を1人に見せない");
    assertEqual(first.querySelectorAll(".yta-people .yta-member").length, 0, "画面：書いた人の名前を出演者の札にしない");
    assertEqual(first.querySelector(".yta-badge.is-estimated")?.textContent, "推定", "画面：推定の印");
    assertEqual(first.querySelector(".yta-why-summary")?.textContent, "くわしく（出演の根拠）", "画面：根拠はたたんで、開いて見る");
    const details = first.querySelector(".yta-why-list").textContent;
    assertEqual(details.includes("説明欄の文を書いた人：山本杏奈（書いた人で、出演者の全部ではありません）"), true, "画面：開くと「説明欄の文を書いた人」と分かる");
    assertEqual(details.includes("出演者：推定（＝LOVE の動画ですが、出演者の名前は分かっていません）"), true, "画面：確かさとその理由を普通の言葉で");
    assertEqual(card("r11Video003").querySelector(".yta-uncertain-note")?.textContent, "ほかの出演者は分かっていません", "画面：推定で名前が出ているときは「ほかの出演者は分かっていません」");
    assertEqual(Boolean(card("r11Video002").querySelector(".yta-badge.is-estimated, .yta-badge.is-partial, .yta-badge.is-unconfirmed, .yta-uncertain-note")), false, "画面：確認済みは印を出さない（普段は簡潔に）");
    assertEqual(card("r11Video006").querySelector(".yta-badge.is-partial")?.textContent, "一部確認", "画面：一部確認の印");
    assertEqual(container.textContent.includes("確認済み 1本・一部確認 1本・推定 3本・未確認 1本"), true, "画面：確かさごとの数を下に書く");
  } finally {
    container.remove();
    initYoutubeAppearancesScreen({ container: null }, {});
  }
}

export async function runYoutubeR11JudgmentTests() {
  console.log("--- YouTube 出演図鑑：出演者の判定の直し（R11-B） ---");
  runNameRoleTests();
  const data = runConfidenceTests();
  await runScreenTests(data);
}
