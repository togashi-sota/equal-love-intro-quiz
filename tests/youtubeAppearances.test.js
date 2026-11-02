// 【2026-11-02新設】「YouTube 出演図鑑」の回帰テスト（本人の依頼 R10-1）。
// 出演者の判定（説明欄の公式の出演者の表記・全員の表記を証拠にしない・≠ME／≒JOY だけは除外・タイトルの名前・グループ名・未確認・手で確定）、
// 絞り込み（メンバー1人／複数のいずれか・全員、年、キーワード、種類、古い順／新しい順、未確認を含むか）、
// データの形（作ったデータがアプリの約束を守っているか。まだ集めていない空のデータでも通る）、
// 画面（カード・サムネイルの代わりの表示・もっと見る・条件を保つ・メンバーで絞って開く）、
// 行き先（ホームの仮の入口・メンバーのページ・全体検索・浮く戻る）、Service Worker（ytimg を素通し）を確かめる。
// YouTube には繋がない（サムネイルの URL を差し替える。動画はテストの中で作ったダミー）。
import { YOUTUBE_CHANNEL } from "../js/data/youtubeAppearances.js";
import { MEMBERS } from "../js/data/members.js";
import {
  APPEARANCE_STATUS,
  EVIDENCE_TYPE,
  EXCLUDE_REASON,
  ROSTER_TEMPLATE_MIN_NAMES,
  castSignature,
  SUMMARY_MAX_LENGTH,
  classifyYoutubeVideo,
  detectGroupsInText,
  extractCastNames,
  extractDescriptionBody,
  findEqualLoveNamesInText,
  findGivenNamesInTitle,
  normalizePersonName,
  summarizeDescription,
} from "../js/youtubeAppearanceClassifier.js";
import {
  YOUTUBE_DEFAULT_FILTER,
  YOUTUBE_KIND,
  availableYoutubeKinds,
  availableYoutubeYears,
  countYoutubeByMember,
  countYoutubeByStatus,
  describeYoutubeStatusMark,
  filterYoutubeVideos,
  formatYoutubeDate,
  isDefaultYoutubeFilter,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
} from "../js/youtubeAppearancesModel.js";
import { initYoutubeAppearancesScreen, openYoutubeAppearances, getYoutubeFilterState, YOUTUBE_PAGE_SIZE, YOUTUBE_RIGHTS_NOTE, YOUTUBE_DATA_NOTICE_LINES } from "../js/youtubeAppearancesScreen.js";
import { buildAppSearchEntries, searchAppEntries, APP_SEARCH_CATEGORIES } from "../js/appSearchIndex.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { isFloatingBackScreen } from "../js/floatingBack.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const memberIds = new Set(MEMBERS.map((member) => member.id));

// 公式の説明欄の書き方をまねたダミー（名前は＝LOVE のメンバーと、ほかのグループの人の代わりの「ダミー」）
function description(lead, castLines) {
  return [
    lead,
    "",
    "▼是非チャンネル登録お願いします！",
    "https://www.youtube.com/channel/UCxxxx?sub_confirmation=1",
    "",
    "▼お問い合わせはこちらまで！",
    "https://forms.gle/xxxx",
    "",
    ...(castLines ? ["▼出演メンバー", ...castLines, ""] : []),
    "★いこのいじょいch公式X",
    "https://twitter.com/xxxx",
    "",
    "素材音源：OtoLogic",
  ].join("\n");
}

function runClassifierTests() {
  // 名前の比べ方
  assertEqual(normalizePersonName("髙松 瞳 (Hitomi Takamatsu)"), normalizePersonName("高松瞳"), "判定：空白・ローマ字・髙／高の違いを吸収");
  assertEqual(normalizePersonName("齋藤 樹愛羅") === normalizePersonName("斎藤樹愛羅") && normalizePersonName("齋藤樹愛羅") !== normalizePersonName("齊藤なぎさ"), true, "判定：齋・斎をそろえても、齋藤樹愛羅と齊藤なぎさは別の人");
  assertEqual(findEqualLoveNamesInText("【野口衣織】の部屋"), ["noguchi-iori"], "判定：タイトルのフルネーム");
  assertEqual(findEqualLoveNamesInText("いおりとひとみの部屋"), [], "判定：愛称・名前だけ（いおり・ひとみ）では判定しない（≠ME の鈴木瞳美などと区別できないため）");

  // 出演者の表記の読み取り
  const cast = extractCastNames(description("料理対決をしました", ["大谷 映美里 (Emiri Otani)", "佐々木 舞香 (Maika Sasaki)"]));
  assertEqual(cast, ["大谷 映美里", "佐々木 舞香"], "判定：「▼出演メンバー」の下の名前を読む（空行・★で終わる）");
  assertEqual(extractCastNames("出演：大谷映美里、野口衣織\n\n本文"), ["大谷映美里", "野口衣織"], "判定：昔の書き方「出演：A、B」も読む");
  assertEqual(extractCastNames("今日は出演してくれたみんなに感謝！"), null, "判定：本文の「出演」は見出しとして読まない");
  assertEqual(extractCastNames(description("本文", null)), null, "判定：出演者の表記が無ければ null");
  assertEqual(extractCastNames("▼プレゼント内容\n出演メンバーのサイン入りグッズを10名様に\n※締切 8月11日"), null, "判定：「出演メンバーのサイン入り…」の文は見出しにしない");
  assertEqual(extractCastNames("♥出演\n大谷 映美里 (Emiri Otani)\n野口 衣織 (Iori Noguchi)"), ["大谷 映美里", "野口 衣織"], "判定：「♥出演」のような印つきの見出しも読む");
  assertEqual(
    extractCastNames("▼出演メンバー（ロケパート）\n💓=LOVE\n瀧脇 笙古 (Shoko Takiwaki)\n💎≠ME\nダミー 一子\n\n▼出演メンバー（発表パート）\nダミー 二葉\n"),
    ["💓=LOVE", "瀧脇 笙古", "💎≠ME", "ダミー 一子", "ダミー 二葉"],
    "判定：出演者の表記が複数あれば全部を合わせる"
  );
  assertEqual(extractCastNames("▼出演メンバー\nダミー 一子\n※野口衣織は不参加になります。\n"), ["ダミー 一子"], "判定：「※…不参加」の注記の行は名前にしない");
  const oldStyle = [
    "▼出演",
    "・ダミー様",
    "https://example.invalid/a",
    "",
    "・=LOVE",
    "大谷 映美里 (Emiri Otani)",
    "https://example.invalid/b",
    "野口 衣織 (Iori Noguchi)",
    "https://example.invalid/c",
    "",
    "・≠ME",
    "ダミー 一子",
    "",
    "",
    "",
    "▼人気バラエティ動画5選",
    "①ダミーの動画",
  ].join("\n");
  assertEqual(extractCastNames(oldStyle), ["ダミー様", "=LOVE", "大谷 映美里", "野口 衣織", "≠ME", "ダミー 一子"], "判定：2020年ごろの書き方（名前の下の URL・グループごとの空行）も最後まで読む（2026-11-03 直し）");
  const manualHold = classifyYoutubeVideo({ id: "t16", title: "【イコラブ】潜入", description: "" }, { manual: { unconfirmed: true, note: "確かめられないので保留" } });
  assertEqual([manualHold.included, manualHold.status, manualHold.evidence[0].type], [true, APPEARANCE_STATUS.UNCONFIRMED, EVIDENCE_TYPE.MANUAL], "判定：手で「未確認として保留」にできる");
  assertEqual(findGivenNamesInTitle("樹愛羅、人生初の舟券購入でまさかの的中"), ["saito-kiara"], "判定：タイトルの、重ならない下の名前");
  assertEqual(findGivenNamesInTitle("瞳がなぎさで遊ぶ"), [], "判定：「瞳」「なぎさ」は下の名前として使わない（ほかの人・普通の言葉と重なる）");
  const otherTitle = classifyYoutubeVideo({ id: "t14", title: "怪物 Covered by ダミー一子", description: "" }, { otherGroupNames: ["ダミー一子"] });
  assertEqual([otherTitle.included, otherTitle.excludedReason], [false, EXCLUDE_REASON.TITLE_OTHER_GROUPS_ONLY], "判定：タイトルに ≠ME・≒JOY の人の名前だけ → 除外");
  const playlistBacked = classifyYoutubeVideo({ id: "t15", title: "Covered by 野口衣織", description: "", playlistTitles: ["=LOVE💓"] });
  assertEqual(playlistBacked.evidence.map((item) => item.type), [EVIDENCE_TYPE.TITLE_NAME, EVIDENCE_TYPE.PLAYLIST_GROUP], "判定：公式の再生リスト「=LOVE💓」も根拠として記録する");

  // 説明の本文と要約
  assertEqual(extractDescriptionBody(description("本文の1行目\n本文の2行目", ["大谷 映美里"])), "本文の1行目\n本文の2行目", "判定：本文は決まった文（チャンネル登録・出演者の表記など）の前まで");
  assertEqual(summarizeDescription("プロモーション 株式会社ダミー\n\n新商品が完成しました✨！\nhttps://example.invalid/"), "新商品が完成しました✨！", "要約：「プロモーション」の表記・URL を除いた最初の1行");
  const longLine = "あ".repeat(80);
  assertEqual([...summarizeDescription(longLine)].length, SUMMARY_MAX_LENGTH + 1, "要約：長い説明は写さない（40文字＋…）");
  assertEqual(summarizeDescription(description("", ["大谷 映美里"])), "", "要約：本文が無ければ空");

  // グループ名
  assertEqual(detectGroupsInText("【イコラブ】たこ焼きパーティ"), { equalLove: true, notEqualMe: false, nearlyEqualJoy: false, joint: false }, "判定：イコラブ");
  assertEqual(detectGroupsInText("イコノイジョイ 2023 の裏側").equalLove, false, "判定：「イコノイジョイ」（3グループ合同の名前）は＝LOVE の根拠にしない");

  // 1本ずつの判定
  const confirmed = classifyYoutubeVideo({ id: "t1", title: "【乾杯】完成！", description: description("完成しました", ["大谷 映美里 (Emiri Otani)", "野口 衣織 (Iori Noguchi)", "ダミー 一子"]) });
  assertEqual([confirmed.included, confirmed.status, confirmed.memberIds], [true, APPEARANCE_STATUS.CAST_LIST, ["otani-emiri", "noguchi-iori"]], "判定：公式の出演者の表記に＝LOVE の人がいれば確定（合同企画も収録）");
  assertEqual(confirmed.evidence[0].type, EVIDENCE_TYPE.CAST_LIST, "判定：根拠の種類を記録する");
  assertEqual(confirmed.otherCastNames, ["ダミー 一子"], "判定：ほかのグループの人の名前も記録する");

  const otherOnly = classifyYoutubeVideo({ id: "t2", title: "【ノイミー】料理", description: description("料理", ["ダミー 一子", "ダミー 二葉"]) });
  assertEqual([otherOnly.included, otherOnly.excludedReason], [false, EXCLUDE_REASON.CAST_LIST_OTHER_GROUPS_ONLY], "判定：表記が ≠ME・≒JOY の人だけなら除外（理由を記録）");

  const roster = Array.from({ length: ROSTER_TEMPLATE_MIN_NAMES }, (_, index) => (index < 10 ? MEMBERS[index].name : `ダミー ${index}`));
  const rosterTemplateKeys = new Set([castSignature(roster)]);
  const template = classifyYoutubeVideo({ id: "t3", title: "チャンネルのお知らせ", description: description("お知らせ", roster) }, { rosterTemplateKeys });
  assertEqual([template.included, template.status, template.memberIds], [true, APPEARANCE_STATUS.UNCONFIRMED, []], "判定：何度も繰り返される全員の表記（テンプレート）は、全員の出演の証拠にしない（未確認）");
  const jointEvent = classifyYoutubeVideo({ id: "t3c", title: "3グループ合同の大運動会", description: description("お知らせ", roster) });
  assertEqual([jointEvent.status, jointEvent.memberIds.length], [APPEARANCE_STATUS.CAST_LIST, 10], "判定：大人数でも、その回だけの表記（合同企画）は出演の根拠にする（2026-11-03 改め）");
  const templateWithTag = classifyYoutubeVideo({ id: "t3b", title: "【イコラブ】お知らせ", description: description("お知らせ", roster) }, { rosterTemplateKeys });
  assertEqual([templateWithTag.status, templateWithTag.memberIds.length], [APPEARANCE_STATUS.GROUP_ONLY, 0], "判定：全員の表記＋タイトルのイコラブ → ＝LOVE 出演・メンバー未確認");

  const titleName = classifyYoutubeVideo({ id: "t4", title: "野口 衣織の部屋", description: "本文だけ" });
  assertEqual([titleName.status, titleName.memberIds], [APPEARANCE_STATUS.TITLE_NAME, ["noguchi-iori"]], "判定：表記が無くタイトルにフルネーム → 推定");
  const bodyName = classifyYoutubeVideo({ id: "t5", title: "部屋", description: description("今回は諸橋沙夏が登場！", null) });
  assertEqual([bodyName.status, bodyName.memberIds], [APPEARANCE_STATUS.DESCRIPTION_NAME, ["morohashi-sana"]], "判定：本文のフルネーム → 推定");
  const footerOnly = classifyYoutubeVideo({ id: "t5b", title: "部屋", description: "本文\n\n★大谷映美里の個人チャンネルはこちら" });
  assertEqual(footerOnly.status, APPEARANCE_STATUS.UNCONFIRMED, "判定：決まった文（★の行より後）の名前は根拠にしない");
  const groupOnly = classifyYoutubeVideo({ id: "t6", title: "【爆食】イコラブ超自由たこ焼き", description: description("たこ焼き", null) });
  assertEqual([groupOnly.included, groupOnly.status], [true, APPEARANCE_STATUS.GROUP_ONLY], "判定：タイトルのイコラブ → ＝LOVE 出演・メンバー未確認");
  const playlistGroup = classifyYoutubeVideo({ id: "t7", title: "北海道に来た", description: "", playlistTitles: ["イコラブ北海道旅🐄"] });
  assertEqual([playlistGroup.status, playlistGroup.evidence[0].type], [APPEARANCE_STATUS.GROUP_ONLY, EVIDENCE_TYPE.PLAYLIST_GROUP], "判定：公式の再生リストの名前のイコラブも根拠にする");
  const titleOther = classifyYoutubeVideo({ id: "t8", title: "【ニアジョイ仲良し】ショッピング", description: "" });
  assertEqual([titleOther.included, titleOther.excludedReason], [false, EXCLUDE_REASON.TITLE_OTHER_GROUPS_ONLY], "判定：タイトルがニアジョイだけ（表記なし）→ 除外（弱い根拠として理由を記録）");
  const joint = classifyYoutubeVideo({ id: "t9", title: "イコノイジョイ ノイミー ニアジョイ合同", description: "" });
  assertEqual(joint.status, APPEARANCE_STATUS.UNCONFIRMED, "判定：3グループ合同の名前があるときは除外せず未確認");
  const unknown = classifyYoutubeVideo({ id: "t10", title: "年末のごあいさつ", description: "" });
  assertEqual([unknown.included, unknown.status], [true, APPEARANCE_STATUS.UNCONFIRMED], "判定：どれにも当たらなければ「出演者未確認」");
  const manual = classifyYoutubeVideo({ id: "t11", title: "年末のごあいさつ", description: "" }, { manual: { memberIds: ["sasaki-maika", "not-a-member"], note: "動画で確認" } });
  assertEqual([manual.status, manual.memberIds, manual.evidence[0].type], [APPEARANCE_STATUS.MANUAL, ["sasaki-maika"], EVIDENCE_TYPE.MANUAL], "判定：手で確定したものがいちばん強い（知らない ID は捨てる）");
  const manualExclude = classifyYoutubeVideo({ id: "t12", title: "【イコラブ】", description: "" }, { manual: { exclude: true, note: "≒JOY だけだった" } });
  assertEqual([manualExclude.included, manualExclude.excludedReason], [false, EXCLUDE_REASON.MANUAL], "判定：手で除外できる");
  const privateVideo = classifyYoutubeVideo({ id: "t13", title: "野口衣織", description: "", privacyStatus: "private" });
  assertEqual([privateVideo.included, privateVideo.excludedReason], [false, EXCLUDE_REASON.NOT_PUBLIC], "判定：公開されていない動画は入れない");
}

// テスト用のダミーの動画（アプリのデータの形）
function makeVideo(index, overrides = {}) {
  return {
    id: `testVid${String(index).padStart(4, "0")}`,
    title: `ダミー動画 ${index}`,
    publishedAt: `${2020 + (index % 6)}-0${1 + (index % 9)}-1${index % 10}`,
    publishedAtTime: "18:00",
    kind: "video",
    status: APPEARANCE_STATUS.CAST_LIST,
    memberIds: ["otani-emiri"],
    evidence: [{ type: EVIDENCE_TYPE.CAST_LIST, detail: "1人の表記" }],
    summary: "",
    series: [],
    privacy: "public",
    ...overrides,
  };
}

const SAMPLE_VIDEOS = [
  makeVideo(1, { title: "料理対決", publishedAt: "2020-05-01", memberIds: ["noguchi-iori", "sasaki-maika"], series: ["ダミーの料理企画"] }),
  makeVideo(2, { title: "クレーンゲーム", publishedAt: "2021-02-03", memberIds: ["noguchi-iori"], kind: YOUTUBE_KIND.SHORT }),
  makeVideo(3, { title: "旅行ロケ", publishedAt: "2024-07-07", memberIds: ["sasaki-maika", "yamamoto-anna"], summary: "温泉に行きました" }),
  makeVideo(4, { title: "たこ焼き", publishedAt: "2023-09-05", memberIds: [], status: APPEARANCE_STATUS.GROUP_ONLY, evidence: [{ type: EVIDENCE_TYPE.TITLE_GROUP_TAG, detail: "イコラブ／＝LOVE" }] }),
  makeVideo(5, { title: "お知らせ", publishedAt: "2022-01-01", memberIds: [], status: APPEARANCE_STATUS.UNCONFIRMED, evidence: [] }),
  makeVideo(6, { title: "生配信", publishedAt: "2022-06-06", memberIds: ["noguchi-iori", "saito-nagisa"], kind: YOUTUBE_KIND.LIVE, status: APPEARANCE_STATUS.TITLE_NAME, evidence: [{ type: EVIDENCE_TYPE.TITLE_NAME, detail: "" }] }),
  makeVideo(7, { title: "ライブ潜入", publishedAt: "2020-09-13", memberIds: [], footageMemberIds: ["satake-nonno"], status: APPEARANCE_STATUS.MANUAL, evidence: [{ type: EVIDENCE_TYPE.MANUAL, detail: "本人が動画で確認" }], verified: { by: "owner", on: "2026-11-03" } }),
];

function runModelTests() {
  const ids = (list) => list.map((video) => video.id);
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, YOUTUBE_DEFAULT_FILTER)), ["testVid0001", "testVid0007", "testVid0002", "testVid0006", "testVid0004", "testVid0003"], "絞り込み：初めは古い順・出演者未確認は出さない");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { sort: "desc" }))[0], "testVid0003", "絞り込み：新しい順");
  assertEqual(filterYoutubeVideos(SAMPLE_VIDEOS, { includeUnconfirmed: true }).length, 7, "絞り込み：未確認も出す");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { memberIds: ["noguchi-iori"] })), ["testVid0001", "testVid0002", "testVid0006"], "絞り込み：メンバー1人");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { memberIds: ["noguchi-iori", "yamamoto-anna"] })), ["testVid0001", "testVid0002", "testVid0006", "testVid0003"], "絞り込み：複数のいずれか");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { memberIds: ["noguchi-iori", "sasaki-maika"], memberMode: "all" })), ["testVid0001"], "絞り込み：複数の全員がそろって出ている");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { memberIds: ["saito-nagisa"] })), ["testVid0006"], "絞り込み：元メンバー");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { year: "2021" })), ["testVid0002"], "絞り込み：公開年");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { kind: "short" })), ["testVid0002"], "絞り込み：Shorts");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { kind: "video" })).includes("testVid0002"), false, "絞り込み：通常の動画に Shorts は入らない");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { query: "料理" })), ["testVid0001"], "検索：タイトル");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { query: "料理企画" })), ["testVid0001"], "検索：企画（再生リストの名前）");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { query: "温泉" })), ["testVid0003"], "検索：説明の要約");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { query: "のぐちいおり" })), ["testVid0001", "testVid0002", "testVid0006"], "検索：メンバーの読み");
  assertEqual(ids(filterYoutubeVideos(SAMPLE_VIDEOS, { query: "野口衣織 ロケ" })), [], "検索：空白で区切った言葉はすべてに当たるものだけ");
  assertEqual(isDefaultYoutubeFilter({}) && !isDefaultYoutubeFilter({ sort: "desc" }) && !isDefaultYoutubeFilter({ memberIds: ["oba-hana"] }), true, "絞り込み：初めの条件か");
  assertEqual(availableYoutubeYears(SAMPLE_VIDEOS), ["2020", "2021", "2022", "2023", "2024"], "絞り込み：ある年だけ");
  assertEqual(availableYoutubeKinds(SAMPLE_VIDEOS), ["video", "short", "live"], "絞り込み：ある種類だけ");
  assertEqual(countYoutubeByMember(SAMPLE_VIDEOS, "noguchi-iori"), 3, "数：メンバー別");
  assertEqual(countYoutubeByStatus(SAMPLE_VIDEOS)[APPEARANCE_STATUS.UNCONFIRMED], 1, "数：確認の状態別");
  assertEqual(youtubeThumbnailUrl("abcDEF12345"), "https://i.ytimg.com/vi/abcDEF12345/mqdefault.jpg", "画像：YouTube が提供するサムネイルの URL");
  assertEqual(youtubeWatchUrl(SAMPLE_VIDEOS[0]), "https://www.youtube.com/watch?v=testVid0001", "リンク：通常の動画");
  assertEqual(youtubeWatchUrl(SAMPLE_VIDEOS[1]), "https://www.youtube.com/shorts/testVid0002", "リンク：Shorts");
  assertEqual(formatYoutubeDate(SAMPLE_VIDEOS[0]), "2020年5月1日", "表示：公開日");
  assertEqual(
    [describeYoutubeStatusMark(SAMPLE_VIDEOS[0]), describeYoutubeStatusMark(SAMPLE_VIDEOS[5]), describeYoutubeStatusMark(SAMPLE_VIDEOS[3]), describeYoutubeStatusMark(SAMPLE_VIDEOS[4])],
    ["", "出演者は推定", "メンバー未確認", "出演者未確認"],
    "表示：確定は印なし・推定・メンバー未確認・出演者未確認"
  );
}

// 【2026-11-03】git に入るファイルには、YouTube API のデータ（タイトル・公開日・説明など）を入れない（30日ルール）
async function runDataTests() {
  const [channelFile, verifiedFile, gitignore] = await Promise.all(["./js/data/youtubeAppearances.js", "./js/data/youtubeVerifiedJudgments.js", "./.gitignore"].map(fetchText));
  const channelModule = await import("../js/data/youtubeAppearances.js");
  assertEqual(YOUTUBE_CHANNEL.id, "UCWHh6SdvJWrPuf1oJrHbX3A", "データ：対象は「イコラブ ノイミー ニアジョイ チャンネル」だけ");
  assertEqual(["YOUTUBE_VIDEOS", "YOUTUBE_APPEARANCES_META"].some((name) => name in channelModule), false, "データ：git に入るファイルに動画の一覧（API のデータ）を持たない");
  assertEqual(/"title"\s*:|publishedAt|"summary"|description/.test(channelFile.replace(/^\s*\/\/.*$/gm, "")), false, "データ：設定のファイルにタイトル・公開日・説明が無い");
  const { YOUTUBE_VERIFIED_JUDGMENTS } = await import("../js/data/youtubeVerifiedJudgments.js");
  assertEqual(YOUTUBE_VERIFIED_JUDGMENTS.every((judgment) => /^[A-Za-z0-9_-]{11}$/.test(judgment.videoId) && ["include", "exclude", "hold"].includes(judgment.decision)), true, "本人の確認：動画 ID と判断（収録・除外・保留）");
  assertEqual(YOUTUBE_VERIFIED_JUDGMENTS.every((judgment) => [...(judgment.memberIds ?? []), ...(judgment.footageMemberIds ?? [])].every((memberId) => memberIds.has(memberId))), true, "本人の確認：メンバーは members.js の人だけ");
  assertEqual(YOUTUBE_VERIFIED_JUDGMENTS.every((judgment) => !("title" in judgment) && !("publishedAt" in judgment) && !("description" in judgment) && judgment.verifiedBy === "owner"), true, "本人の確認：API のデータの欄を持たない・本人が確かめたものだけ");
  const front = YOUTUBE_VERIFIED_JUDGMENTS.find((judgment) => judgment.videoId === "tzrxr9c2sRI");
  assertEqual([front?.decision, front?.memberIds.length, front?.footageMemberIds.length], ["include", 0, 12], "本人の確認：3周年潜入の前編は収録・当時の12人が「映像で登場」");
  assertEqual(/^data\/youtube-appearances\.json$/m.test(gitignore), true, "git：公開のたびに作るデータ（data/youtube-appearances.json）は git に入れない");
  assertEqual(verifiedFile.includes("説明欄を写さない"), true, "本人の確認：書き方の決まりをファイルに書いた");
}

function makeContainer() {
  const container = document.createElement("div");
  container.style.cssText = "position:absolute;left:-9999px;top:0;width:390px";
  document.body.appendChild(container);
  return container;
}

async function runScreenTests() {
  const container = makeContainer();
  const shows = [];
  const manyVideos = [...SAMPLE_VIDEOS, ...Array.from({ length: YOUTUBE_PAGE_SIZE + 5 }, (_, index) => makeVideo(100 + index, { memberIds: ["oba-hana"] }))];
  try {
    // まだ集めていない（空のデータ）
    initYoutubeAppearancesScreen({ container }, { dataState: "missing", onShow: (info) => shows.push(info), thumbnailUrl: () => "data:," });
    openYoutubeAppearances({ returnScreen: "start" });
    assertEqual(container.querySelector(".yta-empty")?.textContent.includes("準備中"), true, "画面：まだ集めていないときは「準備中」と公式チャンネルへのリンク");
    assertEqual(container.querySelector(".yta-empty a.yta-channel-link")?.getAttribute("href"), "https://www.youtube.com/@ikonoijoy", "画面：公式チャンネルへのリンク");
    assertEqual(shows.at(-1)?.returnScreen, "start", "画面：開くと画面の切り替えを頼む（戻る先つき）");

    // ダミーのデータ（画像の URL は YouTube に繋がないもの）
    // 期限切れ：動画の情報を出さず「更新が止まっています」
    initYoutubeAppearancesScreen({ container }, { dataState: "expired", data: { fetchedAt: "2026-09-01T00:00:00Z" }, thumbnailUrl: () => "data:," });
    openYoutubeAppearances({ returnScreen: "start" });
    assertEqual(container.querySelector(".yta-empty")?.textContent.includes("更新が止まっています（最後の更新：2026年9月1日）"), true, "画面：30日を過ぎたら「更新が止まっています」");
    assertEqual(container.querySelectorAll(".yta-card").length, 0, "画面：期限切れのときは動画を1本も出さない");
    // ダミーのデータ（画像の URL は YouTube に繋がないもの）
    const data = { fetchedAt: "2026-11-02T00:00:00Z", counts: { checked: 40, included: 34, unconfirmed: 1, ended: 2 } };
    initYoutubeAppearancesScreen({ container }, { videos: manyVideos, data, onShow: (info) => shows.push(info), thumbnailUrl: (id) => `data:image/png;base64,broken-${id}` });
    openYoutubeAppearances({ returnScreen: "memberDetail", memberIds: ["noguchi-iori"] });
    const cards = () => [...container.querySelectorAll(".yta-card")];
    assertEqual(cards().map((card) => card.dataset.id), ["testVid0001", "testVid0002", "testVid0006"], "画面：メンバーで絞って開く（古い順）");
    assertEqual(getYoutubeFilterState().memberIds, ["noguchi-iori"], "画面：絞り込みの状態");
    assertEqual(container.querySelector('.yta-chip[data-value="noguchi-iori"]').getAttribute("aria-pressed"), "true", "画面：選んだメンバーの札が押された状態");
    assertEqual(container.querySelector(".yta-mode-row").hidden, true, "画面：1人のときは「いずれか／全員」を出さない");
    assertEqual(container.querySelector(".yta-count").textContent, "3本（全35本中）", "画面：本数");
    const card = cards()[0];
    assertEqual(card.querySelector(".yta-title").textContent, "料理対決", "カード：タイトル");
    assertEqual(card.querySelector(".yta-date").textContent, "2020年5月1日", "カード：公開日");
    assertEqual([...card.querySelectorAll(".yta-member")].map((tag) => tag.textContent), ["野口衣織", "佐々木舞香"], "カード：出演メンバー");
    const watch = card.querySelector("a.yta-watch");
    assertEqual([watch.textContent, watch.getAttribute("href"), watch.target, watch.rel], ["YouTube で見る", "https://www.youtube.com/watch?v=testVid0001", "_blank", "noopener noreferrer"], "カード：［YouTube で見る］は新しいタブ");
    assertEqual(cards()[1].querySelector(".yta-kind")?.textContent, "Shorts", "カード：Shorts の印");
    assertEqual(cards()[1].querySelector("a.yta-watch").getAttribute("href").includes("/shorts/"), true, "カード：Shorts は Shorts の画面で開く");
    assertEqual(cards()[2].querySelector(".yta-badge.is-estimate")?.textContent, "出演者は推定", "カード：推定の印");
    assertEqual(cards()[2].querySelector(".yta-member-former")?.textContent, "元", "カード：元メンバーの印");
    assertEqual(card.querySelector(".yta-why-list").textContent.includes("説明欄の公式の出演者の表記"), true, "カード：出演の根拠を見られる");
    // サムネイルの代わりの表示
    const image = card.querySelector("img.yta-thumb-image");
    assertEqual([image.alt, image.loading, image.getAttribute("referrerpolicy")], ["", "lazy", "no-referrer"], "画像：飾り（alt 空）・遅れて読む・参照元を送らない");
    image.dispatchEvent(new Event("error"));
    assertEqual(card.querySelector(".yta-thumb").classList.contains("is-broken"), true, "画像：読めないときは代わりの表示にする");
    assertEqual(card.querySelector(".yta-thumb-fallback").textContent.includes("画像を表示できません"), true, "画像：代わりの表示の文字");
    assertEqual(card.querySelector(".yta-thumb").getAttribute("aria-hidden"), "true", "画像：読み上げでは飛ばす（同じ行き先の［YouTube で見る］がある）");

    // 2人を選ぶ → いずれか／全員
    container.querySelector('.yta-chip[data-value="sasaki-maika"]').click();
    assertEqual(container.querySelector(".yta-mode-row").hidden, false, "画面：2人以上で「いずれか／全員」を出す");
    assertEqual(cards().length, 4, "画面：いずれか（野口・佐々木）");
    container.querySelector('.yta-chips--mode .yta-chip[data-value="all"]').click();
    assertEqual(cards().map((item) => item.dataset.id), ["testVid0001"], "画面：全員がそろって出ている");
    container.querySelector('.yta-chip[data-value="all"]').click();
    assertEqual(getYoutubeFilterState().memberIds, [], "画面：「指定なし」で全員に戻す");
    // もっと見る
    assertEqual(cards().length, YOUTUBE_PAGE_SIZE, "画面：初めは決まった本数だけ");
    container.querySelector(".yta-more").click();
    assertEqual(cards().length, manyVideos.length - 1, "画面：［もっと見る］で続き");
    // 並び・種類・年・検索
    container.querySelector('.yta-chips--sort .yta-chip[data-value="desc"]').click();
    const dates = cards().map((item) => manyVideos.find((video) => video.id === item.dataset.id).publishedAt);
    assertEqual(JSON.stringify(dates), JSON.stringify([...dates].sort().reverse()), "画面：新しい順");
    const years = [...container.querySelectorAll(".yta-year")].map((heading) => heading.textContent);
    assertEqual(new Set(years).size, years.length, "画面：年の見出しは年ごとに1つ");
    const search = container.querySelector(".yta-search");
    search.value = "ロケ";
    search.dispatchEvent(new Event("input"));
    assertEqual(cards().map((item) => item.dataset.id), ["testVid0003"], "画面：キーワード");
    search.value = "存在しない言葉ああああ";
    search.dispatchEvent(new Event("input"));
    assertEqual(Boolean(container.querySelector(".yta-empty")), true, "画面：見つからないときの案内");
    // 条件を保つ（画面を離れて戻っても、open を呼ばなければ状態はそのまま）
    const before = getYoutubeFilterState();
    assertEqual(before.query === "存在しない言葉ああああ" && before.sort === "desc", true, "画面：条件は画面の側が保つ（戻ったとき元のまま）");
    container.querySelector(".yta-reset").click();
    assertEqual(isDefaultYoutubeFilter(getYoutubeFilterState()), true, "画面：［条件を戻す］");
    // 未確認を出す
    const toggle = container.querySelector(".yta-toggle input");
    toggle.click();
    assertEqual(cards().some((item) => item.dataset.id === "testVid0005"), true, "画面：「出演者未確認」も出せる");
    assertEqual(cards().find((item) => item.dataset.id === "testVid0005").querySelector(".yta-badge.is-unconfirmed")?.textContent, "出演者未確認", "カード：未確認の印");
    // 年・並びを指定して開く（開き直すと、ほかの条件は初めに戻る）
    openYoutubeAppearances({ year: 2021, sort: "desc" });
    assertEqual(
      [getYoutubeFilterState().year, getYoutubeFilterState().sort, getYoutubeFilterState().includeUnconfirmed, getYoutubeFilterState().memberIds],
      ["2021", "desc", false, []],
      "画面：openYoutubeAppearances({ year, sort })"
    );
    assertEqual(container.textContent.includes(YOUTUBE_RIGHTS_NOTE), true, "画面：画像の権利の注記");
    assertEqual(container.textContent.includes("動画を見て確かめたものではありません"), true, "画面：動画を見て確かめていないことを書く");
    assertEqual(container.querySelectorAll('img[src^="https://i.ytimg.com"]').length, 0, "テスト：YouTube の画像には繋いでいない（URL を差し替えた）");
    assertEqual(container.textContent.includes("公開が終わった動画（削除・非公開など）2本は表示していません"), true, "画面：削除・非公開になった動画は数だけ案内");
    // 映像で登場（企画の出演者と分けて表示。メンバーで絞ると当たる）
    openYoutubeAppearances({ memberIds: ["satake-nonno"] });
    const footageCard = cards().find((item) => item.dataset.id === "testVid0007");
    assertEqual(Boolean(footageCard), true, "映像で登場：その人で絞ると当たる");
    assertEqual(footageCard.querySelector(".yta-people--footage .yta-footage-label")?.textContent, "映像で登場", "映像で登場：別の行にラベルつきで出す（企画の出演者と誤認させない）");
    assertEqual([...footageCard.querySelectorAll(".yta-people:not(.yta-people--footage) .yta-member")].length, 0, "映像で登場：企画の出演者の行には出さない");
    assertEqual(footageCard.querySelector(".yta-badge.is-verified")?.textContent, "本人が確認", "本人が確認した動画の印");
    // YouTube のデータについて（規約の表示）
    const notice = container.querySelector(".yta-data-notice");
    assertEqual(notice?.querySelector("summary")?.textContent, "YouTube のデータについて", "規約：「YouTube のデータについて」");
    assertEqual([...notice.querySelectorAll("a")].map((link) => link.getAttribute("href")), ["https://www.youtube.com/t/terms", "https://policies.google.com/privacy"], "規約：YouTube 利用規約・Google プライバシーポリシーへのリンク");
    assertEqual(YOUTUBE_DATA_NOTICE_LINES.some((line) => line.includes("YouTube の利用規約に同意")), true, "規約：YouTube の利用規約への同意を示す（III.A.1）");
    assertEqual(YOUTUBE_DATA_NOTICE_LINES.some((line) => line.includes("非公式")) && YOUTUBE_DATA_NOTICE_LINES.some((line) => line.includes("API を呼ぶことはありません")) && YOUTUBE_DATA_NOTICE_LINES.some((line) => line.includes("IP アドレス")), true, "規約：非公式であること・端末から API を呼ばないこと・サムネイルで IP が届くことを書く");
  } finally {
    container.remove();
    // ほかのテストに影響しないよう、本物のデータに戻す
    initYoutubeAppearancesScreen({ container: null }, {});
  }
}

function runSearchTests() {
  assertEqual(APP_SEARCH_CATEGORIES.find((category) => category.id === "youtube")?.label, "YouTube 出演", "全体検索：カテゴリ「YouTube 出演」");
  const entries = buildAppSearchEntries({ youtubeVideos: SAMPLE_VIDEOS });
  const youtubeEntries = entries.filter((entry) => entry.category === "youtube");
  assertEqual(youtubeEntries.some((entry) => entry.key === "youtube:testVid0005"), false, "全体検索：出演者未確認の動画は入れない");
  assertEqual(youtubeEntries.filter((entry) => entry.key.startsWith("youtube:")).length, 6, "全体検索：動画1本＝1件");
  const memberEntry = youtubeEntries.find((entry) => entry.key === "youtubeMember:noguchi-iori");
  assertEqual([memberEntry?.title, memberEntry?.action.target], ["野口衣織の YouTube 出演", { kind: "youtubeAppearances", memberIds: ["noguchi-iori"] }], "全体検索：メンバーごとの入口（そのメンバーで絞って開く）");
  const results = searchAppEntries(entries, "野口衣織", "youtube").results.map(({ entry }) => entry.key);
  assertEqual(results[0], "youtubeMember:noguchi-iori", "全体検索：名前で、その人の YouTube 出演が先頭");
  assertEqual(results.includes("youtube:testVid0001"), true, "全体検索：出演メンバーの名前で動画が見つかる");
  assertEqual(searchAppEntries(entries, "料理企画", "youtube").results[0]?.entry.key, "youtube:testVid0001", "全体検索：企画（再生リスト）の名前で見つかる");
  const videoEntry = youtubeEntries.find((entry) => entry.key === "youtube:testVid0001");
  assertEqual(videoEntry.action.target, { kind: "youtubeAppearances", query: "料理対決" }, "全体検索：結果から一覧のその動画へ（タイトルで探した一覧）");
  assertEqual(videoEntry.links[0].url, "https://www.youtube.com/watch?v=testVid0001", "全体検索：YouTube で見るリンク");
  assertEqual(searchAppEntries(entries, "佐々木", "all").results[0]?.entry.title, "佐々木舞香", "全体検索：メンバー本人はいままでどおり先頭");
  const feature = APP_SEARCH_FEATURES.find((item) => item.id === "feature-youtube-appearances");
  assertEqual([feature?.title, feature?.action.selector], ["YouTube 出演", "#youtube-appearances-home-link"], "全体検索：機能「YouTube 出演」");
}

async function runMarkupTests() {
  const [html, main, screens, sw, members, testsHtml] = await Promise.all(["./index.html", "./js/main.js", "./js/screens.js", "./sw.js", "./js/membersScreen.js", "./tests.html"].map(fetchText));
  const doc = new DOMParser().parseFromString(html, "text/html");
  const homeLink = doc.querySelector("#youtube-appearances-home-link");
  assertEqual(homeLink?.closest(".home-know-grid") !== null && homeLink.textContent.includes("YouTube 出演") && homeLink.textContent.includes("推しメン別に探す"), true, "入口：ホーム「＝LOVE をもっと知る」に「YouTube 出演」（公式企画動画を推しメン別に探す）");
  assertEqual(Boolean(doc.querySelector("#youtube-appearances-screen .back-link#youtube-appearances-back-button")), true, "画面：［戻る］がある（浮く戻るボタンも出る）");
  assertEqual(isFloatingBackScreen("youtubeAppearances"), true, "浮く戻る：対象の画面");
  assertEqual(Boolean(doc.querySelector('link[href="css/youtubeAppearances.css"]')), true, "画面：CSS を読み込む");
  assertEqual(screens.includes('youtubeAppearances: document.getElementById("youtube-appearances-screen")'), true, "画面の一覧に登録");
  assertEqual(main.includes("openYoutubeAppearances({ memberIds: [memberId], returnScreen: \"memberDetail\" })"), true, "行き先：メンバーのページ → そのメンバーで絞った一覧（戻るとメンバーのページ）");
  assertEqual(main.includes('target.kind === "youtubeAppearances"'), true, "行き先：全体検索の結果から");
  assertEqual(main.includes('navigateWithScrollMemory("youtubeAppearances")') && main.includes("navigateWithScrollMemory(youtubeAppearancesReturnScreen)"), true, "行き先：スクロールの位置を保つ切り替え");
  assertEqual(members.includes("YouTube 出演動画を見る"), true, "メンバーのページ：「YouTube 出演動画を見る」");
  assertEqual(["./css/youtubeAppearances.css", "./js/youtubeAppearancesScreen.js", "./js/youtubeAppearancesModel.js", "./js/youtubeAppearanceClassifier.js", "./js/data/youtubeAppearances.js"].every((file) => sw.includes(`"${file}"`)), true, "オフライン：新しいファイルを APP_SHELL に入れた");
  assertEqual(Number(/const CACHE_VERSION = "v(\d+)";/.exec(sw)?.[1]) >= 412, true, "CACHE_VERSION は v412 以上（YouTube 出演図鑑の統合で上げた）");
  const patternSource = /const SW_PASS_THROUGH_HOST_PATTERN = (\/.+\/);/.exec(sw)?.[1];
  const functionStart = sw.indexOf("function shouldPassThroughRequest(url)");
  const functionBody = sw.slice(functionStart, sw.indexOf("\n}\n", functionStart) + 2);
  // eslint-disable-next-line no-new-func
  const shouldPassThrough = new Function(`const SW_PASS_THROUGH_HOST_PATTERN = ${patternSource}; ${functionBody}; return shouldPassThroughRequest;`)();
  assertEqual(
    ["https://i.ytimg.com/vi/abcDEF12345/mqdefault.jpg", "https://i9.ytimg.com/vi/x/mqdefault.jpg", "https://pbs.twimg.com/media/abc.jpg", "http://127.0.0.1:8889/index.html", "https://www.youtube.com/watch?v=x", "https://notytimg.com/a.jpg"].map(shouldPassThrough),
    [true, true, true, false, false, false],
    "Service Worker：YouTube のサムネイル（ytimg.com）は素通し（キャッシュしない）。ほかは今までどおり"
  );
  // API キー・API の呼び出しをアプリに入れない
  const appFiles = await Promise.all(["./js/youtubeAppearancesScreen.js", "./js/youtubeAppearancesModel.js", "./js/youtubeAppearanceClassifier.js", "./js/data/youtubeAppearances.js"].map(fetchText));
  assertEqual(appFiles.every((text) => !/AIza[0-9A-Za-z_-]{20,}/.test(text) && !text.includes("googleapis.com/youtube")), true, "安全：アプリに API キー・API の呼び出しが無い（利用者に何も要らない）");
  assertEqual(testsHtml.includes("runYoutubeAppearancesTests"), true, "テストを登録した");
}

export async function runYoutubeAppearancesTests() {
  console.log("--- YouTube 出演図鑑（2026-11-02） ---");
  runClassifierTests();
  runModelTests();
  await runDataTests();
  await runScreenTests();
  runSearchTests();
  await runMarkupTests();
}
