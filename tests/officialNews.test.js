// 【2026-11-03新設・R11 D】「＝LOVE 最新情報」（公式サイトの NEWS の自動取得）の品質テスト。
// 公式サイトには繋がない。2026-11-03 の公式の一覧のページを短く切った写し（tests/fixtures/officialNews/：タイトル・日付・カテゴリだけ）と、
// テストの中で作ったダミーの HTML を使う。期待する値は、写しの HTML を人が読んで書いたもの（判定のロジックから作らない）。
//
// 確かめること（REQUEST_R11.md の D の品質テスト）：重複・過去のニュースの誤検出・見落とし・日付の取り違え・出演者の誤判定・
// グループ名の混同（＝LOVE・≠ME・≒JOY）・サイトの構造の変更・訂正・延期・中止・終了・リンク切れ・取得できない・外部の障害・
// 失敗しても前の情報を壊さない・YouTube の自動更新とは独立していること・画面（0件・失敗・古い）
import { MEMBERS } from "../js/data/members.js";
import * as cdBonus from "../js/data/cdBonus.js";
import {
  NEWS_MAX_PAGES,
  buildNewsItem,
  buildOfficialNewsData,
  buildReleaseCandidates,
  checkNewsPublication,
  decideNewsPublication,
  decodeHtml,
  describeNewsRefreshForIssue,
  detectNewsFlags,
  detectNewsMembers,
  detectOtherGroups,
  hasUnreadNewItems,
  isAllowedNewsOutput,
  knownDiscographyIdsFrom,
  mergeNewsItems,
  parseDiscographyListHtml,
  parseNewsListHtml,
  shouldReadNextPage,
} from "../js/officialNewsCore.js";
import {
  OFFICIAL_NEWS_DATA_PATH,
  OFFICIAL_NEWS_STATE,
  getOfficialNewsSnapshot,
  interpretOfficialNewsData,
  loadOfficialNewsData,
  setOfficialNewsSnapshotForTest,
  validateOfficialNewsData,
} from "../js/officialNewsData.js";
import {
  countRecentNews,
  describeNewsPeople,
  describeOfficialNewsStatus,
  filterOfficialNews,
  formatJapanDateTime,
  formatNewsDate,
  initOfficialNewsScreen,
  isRecentNews,
  openOfficialNews,
} from "../js/officialNewsScreen.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-03T00:00:00.000Z"); // 日本時間 2026-11-03 9:00
const memberIds = new Set(MEMBERS.map((member) => member.id));

// ダミーの一覧のページ（公式の形と同じ）。items：[ID, "YYYY.MM.DD", "cat7", "メディア", "タイトル"]
function newsPage(items, { next = true } = {}) {
  const lis = items
    .map(
      ([id, date, catClass, catLabel, title]) =>
        `<li><a href="/news/detail/${id}" class="clearfix"><div class="text"><p class="date"><span class="${catClass}">${catLabel}</span>${date}<span class="new">NEW</span></p><p class="tit">${title}</p></div></a></li>`
    )
    .join("\n");
  return `<ul class="infoList">${lis}${next ? '<div id="next"><a href="/news/?page=2"></a></div>' : ""}</ul>`;
}

function tenItems(startId, date = "2026.11.03", titlePrefix = "【出演情報】ダミー番組") {
  return Array.from({ length: 10 }, (_, index) => [startId - index, date, "cat7", "メディア", `${titlePrefix}${index + 1}`]);
}

function buildFrom(htmlPages, { previous = null, now = NOW } = {}) {
  const raw = htmlPages.flatMap((html) => parseNewsListHtml(html).items);
  const built = buildOfficialNewsData({ fetchedRaw: raw, previous, now, pagesRead: htmlPages.length });
  const check = checkNewsPublication({ data: built.data, firstPageCount: parseNewsListHtml(htmlPages[0]).items.length, problems: [], previous, now, memberIds });
  return { ...built, check };
}

// ---- 1. 公式の一覧のページの写し（2026-11-03）を読む ----
async function runFixtureParseTests() {
  const html = await fetchText("./tests/fixtures/officialNews/news-page1-2026-11-03.html");
  const page = parseNewsListHtml(html);
  assertEqual(page.items.length, 10, "公式の写し：1ページ目の10件を全部読む");
  assertEqual(page.problems, [], "公式の写し：読めない記事は無い");
  assertEqual(page.hasNext, true, "公式の写し：次のページがあると分かる");
  assertEqual(
    page.items.map((item) => [item.sourceId, item.publishedOn, item.category]),
    [
      [12385, "2026-11-03", "media"],
      [12380, "2026-11-02", "media"],
      [12378, "2026-11-01", "goods"],
      [12379, "2026-10-31", "goods"],
      [12375, "2026-10-31", "media"],
      [12364, "2026-10-30", "live-event"],
      [12370, "2026-10-29", "media"],
      [12366, "2026-10-29", "live-event"],
      [12374, "2026-10-29", "notice"],
      [12373, "2026-10-28", "notice"],
    ],
    "公式の写し：記事の ID・発表日（YYYY.MM.DD → YYYY-MM-DD）・カテゴリ。並びは公式のまま（同じ日の中は ID の順ではない）"
  );
  const first = page.items[0];
  assertEqual([first.title, first.url], ["【出演情報】フジテレビ系列「2026 FNS歌謡祭 第1夜」※＝LOVE", "https://equal-love.jp/news/detail/12385"], "公式の写し：タイトルは表示のまま・URL は公式の記事");
  assertEqual(page.items.some((item) => /NEW/.test(item.title) || /NEW/.test(item.publishedOn)), false, "公式の写し：「NEW」の札をタイトル・日付に混ぜない");
  const built = page.items.map((item) => buildNewsItem(item, { fetchedAt: NOW.toISOString() }));
  const byId = (id) => built.find((item) => item.id === `equal-love-news-${id}`);
  assertEqual([byId(12385).scope, byId(12385).memberIds], ["group", []], "関連メンバー：「※＝LOVE」はグループ全体（メンバーを推定しない）");
  assertEqual(byId(12380).memberIds, ["takamatsu-hitomi"], "関連メンバー：「…を髙松瞳が務め…」→ 髙松瞳");
  assertEqual(byId(12375).memberIds, ["oba-hana"], "関連メンバー：「※大場花菜」→ 大場花菜");
  assertEqual([byId(12379).memberIds, byId(12364).memberIds], [["morohashi-sana"], ["morohashi-sana"]], "関連メンバー：全角「＝LOVE」・半角「=LOVE」のどちらの書き方でも諸橋沙夏");
  assertEqual([byId(12366).otherGroups, byId(12366).scope], [[], "unknown"], "グループ名：ゲームの名前「IKONOIJOY Puzzle」を ≠ME・≒JOY との合同と取り違えない");
  assertEqual([byId(12374).scope, byId(12374).memberIds, byId(12374).flags], ["unknown", [], []], "「メール配信サービス再開」：メンバー・印は付けない（分からないものは分からないまま）");
  assertEqual(built.every((item) => !("body" in item) && !("image" in item) && !("description" in item)), true, "本文・画像は持たない");

  const discographyHtml = await fetchText("./tests/fixtures/officialNews/discography-page1-2026-11-03.html");
  const discography = parseDiscographyListHtml(discographyHtml);
  assertEqual(discography.items.length, 8, "DISCOGRAPHY の写し：8件を読む");
  assertEqual([discography.items[0].sourceId, discography.items[0].kind, discography.items[0].releaseOn], [152, "DVD/BD", "2026-10-14"], "DISCOGRAPHY の写し：ID・種類・発売日（RELEASE&nbsp;&nbsp;2026.10.14）");
  const known = knownDiscographyIdsFrom(cdBonus);
  assertEqual([known.has(149), known.has(145), known.has(152)], [true, true, false], "アプリの CD・特典映像図鑑が持つ公式の作品の ID（149・145 はある。152 は無い）");
  const candidates = buildReleaseCandidates({ discographyItems: discography.items, knownIds: known, now: NOW });
  assertEqual(candidates.map((candidate) => candidate.sourceId), [152, 151, 150], "確認待ちの候補：図鑑に無い作品だけ（8周年ツアー FINAL の Blu-ray/DVD の3つの TYPE）");
  assertEqual(candidates[0].confirmed, ["作品名", "種類", "発売日"], "確認待ちの候補：確かな項目（公式の表示）と、確認待ちの説明を分ける");
  assertEqual(typeof candidates[0].needsReview === "string" && candidates[0].needsReview.includes("特典映像"), true, "確認待ちの候補：収録内容・特典映像は確認待ち");
}

// ---- 2. タイトルからの判断（メンバー・グループ・印） ----
function runTitleRuleTests() {
  assertEqual(detectNewsMembers("文化放送「＝LOVE 齋藤樹愛羅・≠ME 櫻井ももの ♡べり〜ぴ〜ち♡さんで〜♡」※齋藤樹愛羅"), ["saito-kiara"], "出演者：≠ME のメンバー（櫻井もも）は ＝LOVE のメンバーに数えない");
  assertEqual(detectOtherGroups("文化放送「＝LOVE 齋藤樹愛羅・≠ME 櫻井ももの…」"), ["≠ME"], "グループ名：≠ME と一緒の番組は印を付ける");
  assertEqual(detectOtherGroups("≒JOY 2nd シングル発売決定"), ["≒JOY"], "グループ名：≒JOY");
  assertEqual(detectNewsMembers("≠ME 冨田菜々風 写真集発売"), [], "グループ名：≠ME だけの記事に ＝LOVE のメンバーを付けない");
  assertEqual(detectNewsMembers("斎藤樹愛羅 出演決定"), ["saito-kiara"], "表記揺れ：斎藤 → 齋藤樹愛羅");
  assertEqual(detectNewsMembers("高松瞳 出演決定"), ["takamatsu-hitomi"], "表記揺れ：高松 → 髙松瞳");
  assertEqual(detectNewsMembers("髙松 瞳・野口 衣織 出演"), ["takamatsu-hitomi", "noguchi-iori"], "表記揺れ：姓と名の間の空白。2人とも（出席番号順）");
  assertEqual(detectNewsMembers("齊藤なぎさ 出演決定"), ["saito-nagisa"], "似た名前：齊藤なぎさ（卒業メンバー）を齋藤樹愛羅と取り違えない");
  assertEqual(detectNewsMembers("樹愛羅のラジオ"), [], "名前だけ（姓が無い）では決めない（ほかの人の可能性）");
  assertEqual(detectNewsMembers("＝LOVE 全員で出演"), [], "「全員」と書いてあっても、名前の無いメンバーを推定で足さない");
  assertEqual(detectNewsFlags("【訂正】ライブの開演時間について"), ["correction"], "印：訂正");
  assertEqual(detectNewsFlags("イベント延期のお知らせ"), ["postponed"], "印：延期");
  assertEqual(detectNewsFlags("公演中止のお知らせ"), ["cancelled"], "印：中止");
  assertEqual(detectNewsFlags("【重要】開催日程変更のお知らせ"), ["changed"], "印：変更");
  assertEqual(detectNewsFlags("レギュラー番組 放送終了のお知らせ"), ["ended"], "印：番組の終了");
  assertEqual(detectNewsFlags("FC先行 受付終了のお知らせ"), [], "印：チケットの「受付終了」は番組・活動の終了にしない");
  assertEqual(detectNewsFlags("【お詫びと訂正】グッズの価格について"), ["correction"], "印：お詫びと訂正は1つの印");
  assertEqual(decodeHtml("A&amp;B &lt;C&gt; &#12354; &#x3044; &nbsp;"), "A&B <C> あ い  ", "HTML の文字の参照を戻す");
}

// ---- 3. 構造の変更・日付の取り違え ----
function runStructureAndDateTests() {
  assertEqual(parseNewsListHtml("<html><body><div class='newsBox'>形が変わった</div></body></html>").items.length, 0, "構造の変更：記事の形が無いページは0件（推測で拾わない）");
  const changed = buildFrom(["<html><body>メンテナンス中</body></html>"]);
  assertEqual(changed.check.ok, false, "構造の変更：1ページ目が0件なら検査に通さない（公開しない）");
  assertEqual(changed.check.errors.some((error) => error.includes("形が変わった")), true, "構造の変更：理由を知らせる");
  const brokenDate = parseNewsListHtml(newsPage([[1, "2026.13.40", "cat7", "メディア", "日付が壊れた"], [2, "2026/11/03", "cat7", "メディア", "日付の書き方が違う"], [3, "2026.11.03", "cat7", "メディア", "正しい"]]));
  assertEqual([brokenDate.items.map((item) => item.sourceId), brokenDate.problems.map((problem) => problem.sourceId)], [[3], [1, 2]], "日付：ありえない日付・違う書き方は捨てずに「読めない記事」として数える");
  const noTitle = parseNewsListHtml(newsPage([[4, "2026.11.03", "cat7", "メディア", "   "]]));
  assertEqual([noTitle.items.length, noTitle.problems[0]?.reason], [0, "タイトルが空"], "タイトルが空の記事は入れない");
  const unknownCategory = parseNewsListHtml(newsPage([[5, "2026.11.03", "cat11", "新しいカテゴリ", "カテゴリが増えた"]])).items[0];
  assertEqual([unknownCategory.category, unknownCategory.unknownCategory], ["other", "新しいカテゴリ"], "カテゴリが増えた：その他にして、知らせる");
  const mismatch = parseNewsListHtml(newsPage([[6, "2026.11.03", "cat7", "グッズ", "札と文字が食い違う"]])).items[0];
  assertEqual([mismatch.category, mismatch.unknownCategory], ["other", "グッズ"], "カテゴリの札の番号と文字が食い違う：決めつけずに知らせる");
  const future = validateOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [{ ...sampleItem(1), publishedOn: "2026-12-25" }] }, { now: NOW });
  assertEqual(future.ok, false, "日付：未来の発表日（取り違え）は形の検査で止める");
  const ancient = validateOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [{ ...sampleItem(1), publishedOn: "2016-05-01" }] }, { now: NOW });
  assertEqual(ancient.ok, false, "日付：結成（2017年）より前の発表日は止める");
  const sameDayJapan = validateOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [{ ...sampleItem(1), publishedOn: "2026-11-03" }] }, { now: new Date("2026-11-02T16:00:00Z") });
  assertEqual(sameDayJapan.ok, true, "日付：日本時間の今日（UTC ではまだ前日）の発表は正しい");
  const wrongUrl = validateOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [{ ...sampleItem(1), url: "https://example.com/news/detail/1" }] }, { now: NOW });
  assertEqual(wrongUrl.ok, false, "リンク：公式サイトの記事以外の URL は止める");
  const scriptUrl = validateOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [{ ...sampleItem(1), url: "javascript:alert(1)" }] }, { now: NOW });
  assertEqual(scriptUrl.ok, false, "リンク：javascript: の URL は止める");
  const withBody = validateOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [{ ...sampleItem(1), body: "本文" }] }, { now: NOW });
  assertEqual(withBody.ok, false, "本文を持ったデータは止める（持たない約束）");
  const unknownMember = validateOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [{ ...sampleItem(1), memberIds: ["sakurai-momo"] }] }, { now: NOW, memberIds });
  assertEqual(unknownMember.ok, false, "出演者：＝LOVE のメンバーでない id は止める");
}

function sampleItem(id, overrides = {}) {
  return {
    id: `equal-love-news-${id}`,
    title: `ダミーのお知らせ ${id}`,
    publishedOn: "2026-11-01",
    category: "notice",
    memberIds: [],
    scope: "unknown",
    otherGroups: [],
    flags: [],
    url: `https://equal-love.jp/news/detail/${id}`,
    source: "equal-love.jp NEWS",
    fetchedAt: "2026-11-01T00:00:00.000Z",
    lastSeenAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---- 4. 重複・引き継ぎ・新着の数え方・見落とし・リンク切れ ----
function runMergeTests() {
  // 初回：全部を取り込むが「新着」とは数えない
  const first = buildFrom([newsPage(tenItems(100, "2026.10.30"))]);
  assertEqual([first.data.items.length, first.report.added.length, first.check.ok], [10, 0, true], "初回：10件を取り込む。前のデータが無いので新着とは数えない");
  // 2回目：同じ10件＋新しい2件。ページの境目で1件が2回出ても1件
  const second = buildFrom(
    [newsPage([[102, "2026.11.02", "cat8", "リリース", "22ndシングル発売決定"], [101, "2026.11.02", "cat7", "メディア", "出演情報"], ...tenItems(100, "2026.10.30").slice(0, 8)]), newsPage([...tenItems(100, "2026.10.30").slice(7)], { next: false })],
    { previous: first.data, now: new Date(NOW.getTime() + DAY) }
  );
  assertEqual(second.data.items.length, 12, "重複：同じ記事（ページの境目で2回出た 93）は1件。前の10件＋新しい2件");
  assertEqual(second.report.added.sort(), ["equal-love-news-101", "equal-love-news-102"], "新着：前のデータに無い ID だけ");
  assertEqual(second.data.items.filter((item) => item.id === "equal-love-news-100").length, 1, "重複：記事の ID で1件");
  const kept = second.data.items.find((item) => item.id === "equal-love-news-95");
  assertEqual([kept.fetchedAt, kept.lastSeenAt], [first.data.fetchedAt, new Date(NOW.getTime() + DAY).toISOString()], "引き継ぎ：初めて取得した日時は残し、最後に見た日時を新しくする");
  // 3回目：1ページ目だけ読む（新しい記事が無い）→ 前の記事は消さない
  const third = buildFrom([newsPage([[102, "2026.11.02", "cat8", "リリース", "22ndシングル発売決定"], [101, "2026.11.02", "cat7", "メディア", "出演情報"], ...tenItems(100, "2026.10.30").slice(0, 8)])], { previous: second.data, now: new Date(NOW.getTime() + 2 * DAY) });
  assertEqual([third.data.items.length, third.report.added.length, third.check.ok], [12, 0, true], "引き継ぎ：1ページ目に出なくなった古い記事も残す（過去の分は前のデータから）");
  // 過去のニュースの誤検出：古い記事が一覧に出てきても新着にしない
  const old = buildFrom([newsPage([[50, "2025.04.01", "cat4", "お知らせ", "古い記事の再掲"], ...tenItems(102, "2026.11.02").slice(0, 9)])], { previous: third.data, now: new Date(NOW.getTime() + 3 * DAY) });
  assertEqual([old.report.added.includes("equal-love-news-50"), old.report.backfilled], [false, ["equal-love-news-50"]], "過去の誤検出：前の取得より7日以上前の発表日の記事は「新着」に数えない（掘り起こし）");
  // タイトルの訂正（同じ ID で表示が変わった）
  const revised = buildFrom([newsPage([[102, "2026.11.02", "cat8", "リリース", "【訂正】22ndシングル発売日変更"], [101, "2026.11.02", "cat7", "メディア", "出演情報"], ...tenItems(100, "2026.10.30").slice(0, 8)])], { previous: third.data, now: new Date(NOW.getTime() + 3 * DAY) });
  const item102 = revised.data.items.find((item) => item.id === "equal-love-news-102");
  assertEqual([item102.title, item102.titleRevised, item102.flags, revised.report.revised], ["【訂正】22ndシングル発売日変更", true, ["correction", "changed"], ["equal-love-news-102"]], "訂正：同じ記事の表示が変わったら今の公式の表示に合わせ、印を付ける（2件に増やさない）");
  // リンク切れ：読んだ範囲の日付なのに一覧から消えた → 消さずに印
  const removed = buildFrom([newsPage([[102, "2026.11.02", "cat8", "リリース", "22ndシングル発売決定"], ...tenItems(100, "2026.10.30").slice(0, 9)])], { previous: third.data, now: new Date(NOW.getTime() + 3 * DAY) });
  const item101 = removed.data.items.find((item) => item.id === "equal-love-news-101");
  assertEqual([item101?.missingFromList, removed.report.missing], [true, ["equal-love-news-101"]], "リンク切れ：公式の一覧から消えた記事は消さずに「見当たらない」の印（知らせる）");
  const back = buildFrom([newsPage([[102, "2026.11.02", "cat8", "リリース", "22ndシングル発売決定"], [101, "2026.11.02", "cat7", "メディア", "出演情報"], ...tenItems(100, "2026.10.30").slice(0, 8)])], { previous: removed.data, now: new Date(NOW.getTime() + 4 * DAY) });
  assertEqual(Boolean(back.data.items.find((item) => item.id === "equal-love-news-101")?.missingFromList), false, "リンク切れ：また一覧に出たら印を外す");
  // 見落とし：次のページを読むか・上限まで新着が続いたか
  const knownIds = new Set(third.data.items.map((item) => item.id));
  assertEqual(shouldReadNextPage({ pageItems: parseNewsListHtml(newsPage(tenItems(100, "2026.10.30"))).items, hasNext: true, pageNumber: 1, knownIds }), false, "見落とし：1ページ目が全部知っている記事なら、次のページは読まない（アクセスを減らす）");
  assertEqual(shouldReadNextPage({ pageItems: parseNewsListHtml(newsPage(tenItems(300))).items, hasNext: true, pageNumber: 1, knownIds }), true, "見落とし：新しい記事があれば次のページも読む");
  assertEqual(shouldReadNextPage({ pageItems: parseNewsListHtml(newsPage(tenItems(300))).items, hasNext: true, pageNumber: NEWS_MAX_PAGES, knownIds }), false, `見落とし：読むのは ${NEWS_MAX_PAGES} ページまで（負荷の上限）`);
  const raw = [300, 250, 200, 150, 120].flatMap((start) => parseNewsListHtml(newsPage(tenItems(start))).items);
  assertEqual(hasUnreadNewItems({ fetchedRaw: raw, knownIds, pagesRead: NEWS_MAX_PAGES }), true, "見落とし：上限のページまで新着が続いたら「見落としの恐れ」と分かる");
}

// ---- 5. 検査・公開のしかた（失敗しても前のデータを壊さない・成功したふりをしない） ----
function runCheckAndDecideTests() {
  const base = buildFrom([newsPage(tenItems(100, "2026.10.30"))]).data;
  const fifty = { ...base, items: Array.from({ length: 50 }, (_, index) => sampleItem(500 - index)) };
  const drop = checkNewsPublication({ data: { ...fifty, items: fifty.items.slice(0, 20) }, firstPageCount: 10, previous: fifty, now: NOW, memberIds });
  assertEqual([drop.ok, drop.errors.some((error) => error.includes("急減"))], [false, true], "件数の急減：前の50件 → 20件は公開しない");
  const older = checkNewsPublication({ data: { ...base, items: [sampleItem(1, { publishedOn: "2026-10-01" })] }, firstPageCount: 10, previous: { ...base, items: [sampleItem(2, { publishedOn: "2026-10-30" })] }, now: NOW, memberIds });
  assertEqual(older.errors.some((error) => error.includes("前より古い")), true, "日付：いちばん新しい発表日が前より古くなったら止める（取り違え・古いページ）");
  const manyProblems = checkNewsPublication({ data: base, firstPageCount: 10, problems: [1, 2, 3, 4].map((sourceId) => ({ sourceId, reason: "日付が読めない" })), previous: null, now: NOW, memberIds });
  assertEqual(manyProblems.ok, false, "構造の変更：読めない記事が多い（4件／10件）なら止める");
  const fewProblems = checkNewsPublication({ data: base, firstPageCount: 10, problems: [{ sourceId: 9, reason: "日付が読めない" }], previous: null, now: NOW, memberIds });
  assertEqual([fewProblems.ok, fewProblems.warnings.length], [true, 1], "読めない記事が1件：公開するが、知らせる");

  const okDecision = decideNewsPublication({ fresh: { ok: true, data: base }, previous: null, now: NOW });
  assertEqual([okDecision.action, okDecision.alert, okDecision.data === base], ["write-fresh", false, true], "公開：取り直せたら新しいデータ");
  const failed = decideNewsPublication({ fresh: { ok: false, error: "/news/ に繋がらない（TimeoutError）" }, previous: base, now: new Date(NOW.getTime() + DAY) });
  assertEqual([failed.action, failed.alert, failed.data.items, failed.data.fetchedAt], ["write-previous", true, base.items, base.fetchedAt], "外部の障害：前のデータの記事・最後に取得できた日時はそのまま（壊さない・新しく見せない）");
  assertEqual([failed.data.lastAttempt.ok, failed.data.lastAttempt.consecutiveFailures, failed.data.lastAttempt.error.includes("TimeoutError")], [false, 1, true], "成功したふりをしない：直近の取得は失敗と書く");
  const failedTwice = decideNewsPublication({ fresh: { ok: false, error: "HTTP 503" }, previous: failed.data, now: new Date(NOW.getTime() + 2 * DAY) });
  assertEqual(failedTwice.data.lastAttempt.consecutiveFailures, 2, "続けて失敗した回数を数える");
  const nothing = decideNewsPublication({ fresh: { ok: false, error: "HTTP 404" }, previous: null, now: NOW });
  assertEqual([nothing.action, nothing.data], ["write-nothing", null], "取得できない＋前のデータも無い：何も書かない（アプリは「まだ取得できていません」）");
  const brokenPrevious = decideNewsPublication({ fresh: { ok: false, error: "HTTP 500" }, previous: { schema: 1, items: "壊れた" }, now: NOW });
  assertEqual(brokenPrevious.action, "write-nothing", "前のデータが壊れていたら使わない");
  const issue = describeNewsRefreshForIssue({ decision: failed, check: null, report: { missing: ["equal-love-news-101"], newCandidates: [152] }, trigger: "dispatch", runUrl: "https://example.invalid/run", warnings: ["DISCOGRAPHY が読めない"] });
  assertEqual(issue.includes("取得に失敗") && issue.includes("equal-love-news-101") && issue.includes("152") && issue.includes("YouTube 出演図鑑の自動更新とは別"), true, "Issue の本文：結果・見当たらない記事・確認待ちの候補・YouTube とは別の知らせ");
  assertEqual(isAllowedNewsOutput("data/official-news.json") && !isAllowedNewsOutput("data/youtube-appearances.json") && !isAllowedNewsOutput("js/data/members.js"), true, "書き出し先：data/official-news.json だけ（YouTube のデータ・アプリのデータに触れない）");
}

// ---- 6. アプリでの読み込み（質問AIへ渡す形） ----
async function runLoaderTests() {
  const data = buildFrom([await fetchText("./tests/fixtures/officialNews/news-page1-2026-11-03.html")]).data;
  const ready = interpretOfficialNewsData(data, { now: new Date(NOW.getTime() + DAY), memberIds });
  assertEqual(ready.state, OFFICIAL_NEWS_STATE.READY, "読み込み：新しいデータは READY");
  const keys = Object.keys(ready.items[0]);
  assertEqual(["id", "title", "publishedOn", "category", "memberIds", "url", "source", "fetchedAt"].every((key) => keys.includes(key)), true, "質問AIへ渡す形：各項目に id・title・publishedOn・category・memberIds・url・source・fetchedAt");
  assertEqual(["state", "items", "fetchedAt", "error"].every((key) => key in ready), true, "質問AIへ渡す形：state・items・fetchedAt・error");
  assertEqual(ready.items.map((item) => item.publishedOn), [...ready.items.map((item) => item.publishedOn)].sort().reverse(), "読み込み：新しい順");
  const stale = interpretOfficialNewsData(data, { now: new Date(NOW.getTime() + 9 * DAY), memberIds });
  assertEqual([stale.state, stale.items.length, Math.floor(stale.ageDays)], [OFFICIAL_NEWS_STATE.STALE, 10, 9], "古いデータ：8日を過ぎたら STALE（中身は出すが、止まっていると分かる）");
  const invalid = interpretOfficialNewsData({ schema: 99, items: [] }, { now: NOW });
  assertEqual([invalid.state, invalid.items], [OFFICIAL_NEWS_STATE.INVALID, []], "壊れたデータ：中身を出さない");
  const empty = interpretOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [] }, { now: NOW });
  assertEqual([empty.state, empty.items.length], [OFFICIAL_NEWS_STATE.READY, 0], "0件のデータも壊れない");
  try {
    let requested = null;
    setOfficialNewsSnapshotForTest(null);
    await loadOfficialNewsData({ fetchImpl: async (url, init) => ((requested = [url, init?.cache]), { ok: false, status: 404 }), force: true });
    assertEqual([getOfficialNewsSnapshot().state, requested], [OFFICIAL_NEWS_STATE.MISSING, [OFFICIAL_NEWS_DATA_PATH, "no-cache"]], "読み込み：ファイルが無い（404）→ MISSING。同じサイトの data/official-news.json を読む");
    await loadOfficialNewsData({ fetchImpl: async () => ({ ok: false, status: 500 }), force: true });
    assertEqual(getOfficialNewsSnapshot().state, OFFICIAL_NEWS_STATE.ERROR, "読み込み：サーバーの失敗 → ERROR");
    await loadOfficialNewsData({ fetchImpl: async () => { throw new TypeError("Failed to fetch"); }, force: true });
    assertEqual([getOfficialNewsSnapshot().state, getOfficialNewsSnapshot().items], [OFFICIAL_NEWS_STATE.ERROR, []], "読み込み：オフライン → ERROR（items は空）");
    await loadOfficialNewsData({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } }), force: true });
    assertEqual(getOfficialNewsSnapshot().state, OFFICIAL_NEWS_STATE.INVALID, "読み込み：JSON が壊れている → INVALID");
    await loadOfficialNewsData({ fetchImpl: async () => ({ ok: true, status: 200, json: async () => data }), now: () => new Date(NOW.getTime() + DAY), memberIds, force: true });
    assertEqual([getOfficialNewsSnapshot().state, getOfficialNewsSnapshot().items.length], [OFFICIAL_NEWS_STATE.READY, 10], "読み込み：正しいデータ → READY");
  } finally {
    setOfficialNewsSnapshotForTest(null);
  }
  assertEqual(getOfficialNewsSnapshot().state, OFFICIAL_NEWS_STATE.IDLE, "テストのあと、状態を初めに戻した");
}

// ---- 7. 画面（0件・失敗・古い・絞り込み・外の文字を HTML にしない） ----
async function runScreenTests() {
  assertEqual(formatNewsDate("2026-11-03"), "2026.11.03（火）", "表示：発表日と曜日");
  assertEqual(formatJapanDateTime("2026-11-02T22:55:18.391Z"), "2026年11月3日 7:55", "表示：最終取得の日時は日本時間");
  assertEqual([isRecentNews({ publishedOn: "2026-10-28" }, NOW), isRecentNews({ publishedOn: "2026-10-27" }, NOW)], [true, false], "NEW の札：今日を入れて7日以内");
  assertEqual(describeNewsPeople({ memberIds: ["noguchi-iori", "oba-hana"], scope: "members", otherGroups: [] }).text, "野口衣織・大場花菜", "表示：関連メンバーの名前");
  assertEqual(describeNewsPeople({ memberIds: [], scope: "group", otherGroups: [] }).text, "＝LOVE（グループ）", "表示：グループ全体");
  const items = [sampleItem(3, { memberIds: ["oba-hana"], scope: "members", category: "media" }), sampleItem(2, { scope: "group", category: "release" }), sampleItem(1, { category: "notice" })];
  assertEqual(filterOfficialNews(items, { memberId: "oba-hana" }).map((item) => item.id), ["equal-love-news-3"], "絞り込み：メンバー");
  assertEqual(filterOfficialNews(items, { memberId: "group" }).map((item) => item.id), ["equal-love-news-2"], "絞り込み：グループ全体");
  assertEqual(filterOfficialNews(items, { category: "notice" }).map((item) => item.id), ["equal-love-news-1"], "絞り込み：カテゴリ");
  assertEqual(filterOfficialNews(items, { memberId: "oba-hana", category: "release" }), [], "絞り込み：メンバー×カテゴリで0件");
  const statusOf = (state, extra = {}) => describeOfficialNewsStatus({ state, items: [], fetchedAt: "2026-11-02T22:55:18.391Z", lastAttempt: null, ageDays: 1, ...extra }, NOW);
  assertEqual([statusOf("missing").title, statusOf("error").retry, statusOf("invalid").tone], ["まだ公式のお知らせを取得できていません", true, "error"], "状態の案内：まだ無い・読めない（もう一度）・壊れた");
  assertEqual([statusOf("ready").title, statusOf("ready").lines[0]], ["公式サイトの NEWS から自動で集めています", "最終取得：2026年11月3日 7:55"], "状態の案内：自動で集めていること・最終取得の日時");
  assertEqual(statusOf("stale", { ageDays: 12.3 }).lines.some((line) => line.includes("12日")) && statusOf("stale", { ageDays: 12.3 }).title === "最新情報の更新が止まっています", true, "状態の案内：止まっていること・何日たったか");
  assertEqual(statusOf("ready", { lastAttempt: { ok: false, at: "2026-11-09T18:20:00Z" } }).lines.some((line) => line.includes("失敗")), true, "状態の案内：直近の取得が失敗したこと");
  assertEqual(countRecentNews({ state: "ready", items: [{ publishedOn: "2026-11-03" }, { publishedOn: "2026-10-01" }] }, NOW), 1, "ホームの札：直近7日の数");
  assertEqual(countRecentNews({ state: "stale", items: [{ publishedOn: "2026-11-03" }] }, NOW), 0, "ホームの札：止まっているときは「新着」と言わない");

  // 本物の DOM で描く（タイトルに HTML が入っていても、文字として出す）
  const container = document.createElement("div");
  let shown = 0;
  initOfficialNewsScreen({ container }, { onShow: () => (shown += 1), now: () => NOW });
  try {
    setOfficialNewsSnapshotForTest({ state: OFFICIAL_NEWS_STATE.MISSING, items: [], candidates: [], fetchedAt: null, lastAttempt: null, ageDays: null, error: null });
    assertEqual([container.querySelector(".onews-status-title")?.textContent, Boolean(container.querySelector(".onews-official-link[href='https://equal-love.jp/news/']")), container.querySelectorAll(".onews-item").length], ["まだ公式のお知らせを取得できていません", true, 0], "画面：まだ無いとき（壊れない・公式の NEWS へのリンク）");
    setOfficialNewsSnapshotForTest({ state: OFFICIAL_NEWS_STATE.ERROR, items: [], candidates: [], fetchedAt: null, lastAttempt: null, ageDays: null, error: "Failed to fetch" });
    assertEqual([container.querySelector(".onews-status--error") !== null, container.querySelector(".onews-status .onews-button")?.textContent], [true, "もう一度読み込む"], "画面：読み込みの失敗（もう一度読み込む）");
    setOfficialNewsSnapshotForTest({ state: OFFICIAL_NEWS_STATE.READY, items: [], candidates: [], fetchedAt: NOW.toISOString(), lastAttempt: { ok: true }, ageDays: 0, error: null });
    assertEqual(container.querySelector(".onews-empty")?.textContent, "取得できたお知らせは、まだ0件です。", "画面：0件");
    const evil = { ...interpretOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: [sampleItem(9, { title: '<img src=x onerror="window.__onewsXss=1">危ない', publishedOn: "2026-11-03", memberIds: ["oba-hana"], scope: "members", flags: ["postponed"] })] }, { now: NOW }) };
    setOfficialNewsSnapshotForTest(evil);
    assertEqual([container.querySelectorAll(".onews-item").length, container.querySelector(".onews-item img"), container.querySelector(".onews-item-title")?.textContent.startsWith("<img")], [1, null, true], "画面：外の文字（タイトル）は HTML にしない（textContent）");
    assertEqual([container.querySelector(".onews-item-title")?.getAttribute("target"), container.querySelector(".onews-item-title")?.getAttribute("rel"), container.querySelector(".onews-flag")?.textContent, container.querySelector(".onews-new")?.textContent, container.querySelector(".onews-member")?.textContent], ["_blank", "noopener noreferrer", "延期", "NEW", "大場花菜"], "画面：公式の記事は新しいタブ・延期の印・NEW・関連メンバー");
    const staleSnapshot = interpretOfficialNewsData({ schema: 1, fetchedAt: new Date(NOW.getTime() - 20 * DAY).toISOString(), items: [sampleItem(9)], candidates: [{ kind: "discography", sourceId: 152, title: "候補の作品", workKind: "DVD/BD", releaseOn: "2026-10-14", url: "https://equal-love.jp/discography/detail/152/" }] }, { now: NOW });
    setOfficialNewsSnapshotForTest(staleSnapshot);
    assertEqual([container.querySelector(".onews-status--warn .onews-status-title")?.textContent, container.querySelectorAll(".onews-item").length, container.querySelector(".onews-candidates-summary")?.textContent.includes("確認待ち")], ["最新情報の更新が止まっています", 1, true], "画面：古いデータ（止まっていると出したうえで、前の情報と確認待ちの候補を出す）");
    const many = interpretOfficialNewsData({ schema: 1, fetchedAt: NOW.toISOString(), items: Array.from({ length: 45 }, (_, index) => sampleItem(1000 - index, index % 3 === 0 ? { memberIds: ["noguchi-iori"], scope: "members" } : {})) }, { now: NOW });
    setOfficialNewsSnapshotForTest(many);
    assertEqual([container.querySelectorAll(".onews-item").length, container.querySelector(".onews-more")?.textContent], [30, "もっと見る（あと15件）"], "画面：30件ずつ（もっと見る）");
    openOfficialNews({ memberId: "noguchi-iori" });
    assertEqual([shown, container.querySelectorAll(".onews-item").length, container.querySelector("#onews-member-select")?.value], [1, 15, "noguchi-iori"], "画面：メンバーで絞って開ける（質問AI・個人ページから）");
    openOfficialNews({ memberId: "noguchi-iori", category: "release" });
    assertEqual([container.querySelectorAll(".onews-item").length, container.querySelector(".onews-empty .onews-button")?.textContent], [0, "絞り込みをやめる"], "画面：絞り込みで0件（やめるボタン）");
    container.querySelector(".onews-empty .onews-button").click();
    assertEqual(container.querySelectorAll(".onews-item").length, 30, "画面：絞り込みをやめると元に戻る");
    assertEqual(window.__onewsXss, undefined, "画面：外の文字のスクリプトは動かない");
  } finally {
    setOfficialNewsSnapshotForTest(null);
  }
}

// ---- 8. 公開の仕組み：YouTube の自動更新と独立・YouTube を壊さない ----
async function runPipelineTests() {
  const [workflow, refreshNews, keepPrevious, youtubeRefresh, sw, main, html, gitignore, readme, screens] = await Promise.all(
    [
      "./.github/workflows/deploy-pages.yml",
      "./scripts/news/refresh-news.mjs",
      "./scripts/youtube/keep-previous.mjs",
      "./scripts/youtube/refresh.mjs",
      "./sw.js",
      "./js/main.js",
      "./index.html",
      "./.gitignore",
      "./scripts/news/README.md",
      "./js/screens.js",
    ].map(fetchText)
  );
  const step = (name) => {
    const start = workflow.indexOf(`- name: ${name}`);
    const next = workflow.indexOf("\n      - name:", start + 1);
    return start === -1 ? "" : workflow.slice(start, next === -1 ? undefined : next);
  };
  const newsStep = step("＝LOVE 最新情報のデータを作る");
  assertEqual(newsStep.includes("id: news") && newsStep.includes("continue-on-error: true") && newsStep.includes("scripts/news/refresh-news.mjs"), true, "公開の仕組み：ニュースは別の手順（id: news）。失敗しても続ける（continue-on-error）");
  assertEqual(newsStep.includes("secrets.") || newsStep.includes("YOUTUBE_API_KEY"), false, "公開の仕組み：ニュースの手順はキーを使わない・YouTube のキーを渡さない");
  assertEqual(newsStep.includes('--previous-url "https://togashi-sota.github.io/equal-love-intro-quiz/data/official-news.json"'), true, "公開の仕組み：過去の分は公開中のデータから引き継ぐ");
  assertEqual(workflow.indexOf("id: youtube") < workflow.indexOf("id: news"), true, "公開の仕組み：YouTube の手順が先（ニュースの手順は YouTube の手順の結果を変えない）");
  const youtubeStep = step("YouTube のデータを作る");
  assertEqual(youtubeStep.includes("scripts/youtube/refresh.mjs") && youtubeStep.includes("YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}") && !youtubeStep.includes("continue-on-error"), true, "YouTube を壊さない：YouTube の手順は前のまま");
  const keep = step("＝LOVE 最新情報だけ新しいときは、YouTube のデータを前のまま入れ直す");
  assertEqual(keep.includes("steps.youtube.outputs.action == 'keep-live' && steps.news.outputs.fresh == 'true'") && keep.includes("scripts/youtube/keep-previous.mjs"), true, "独立：YouTube の取得の失敗でもニュースが新しければ、YouTube は前のデータのままで公開する");
  const publish = step("公開するかを決める");
  assertEqual(publish.includes('"${{ steps.youtube.outputs.deploy }}" = "true"') && publish.includes("steps.youtube_keep.outputs.ok") && publish.includes("deploy=false"), true, "公開するか：YouTube が公開すると決めたとき／YouTube を前のまま入れ直せてニュースが新しいとき。それ以外は公開しない");
  assertEqual(workflow.includes("deploy: ${{ steps.publish.outputs.deploy }}") && !/if: steps\.youtube\.outputs\.deploy == 'true'/.test(workflow), true, "公開するか：成果物の準備はすべて「公開するかを決める」の結果で");
  assertEqual(workflow.includes("grep -v '^!! data/youtube-appearances.json$' | grep -v '^!! data/official-news.json$'"), true, "確かめる：自動の更新で増えてよいのは YouTube のデータとニュースのデータだけ");
  const newsIssue = step("知らせる（Issue・＝LOVE 最新情報）");
  assertEqual(newsIssue.includes('TITLE="＝LOVE 最新情報の自動取得：確認が必要です"') && newsIssue.includes("continue-on-error: true") && newsIssue.includes("steps.news.outcome == 'failure'"), true, "知らせる：ニュースの Issue は題を分ける。ニュースの手順そのものが落ちても知らせる");
  assertEqual(step("知らせる（Issue）").includes('TITLE="YouTube 出演図鑑の自動更新：確認が必要です"'), true, "知らせる：YouTube の Issue の題は前のまま");
  assertEqual(/git (push|commit|add)\b/.test(workflow) || /contents:\s*write/.test(workflow), false, "自動の push をしない（contents: read のまま）");
  // スクリプト
  assertEqual((refreshNews.match(/writeFile\(/g) ?? []).length, 2, "ニュースのスクリプト：書き出しは2か所だけ（データと Issue の本文）");
  assertEqual(refreshNews.includes("core.isAllowedNewsOutput(outRelative)") && refreshNews.includes("const outRelative = OFFICIAL_NEWS_DATA_PATH;"), true, "ニュースのスクリプト：書き出し先を決まりで確かめる");
  assertEqual(/process\.exit\(\s*[1-9]/.test(refreshNews), false, "ニュースのスクリプト：外の障害で失敗の終わり方をしない（ほかの手順を止めない）");
  assertEqual(refreshNews.includes("WAIT_MS = 3000") && refreshNews.includes("NEWS_MAX_PAGES") && refreshNews.includes("User-Agent"), true, "ニュースのスクリプト：3秒空ける・上限のページ・名乗る（負荷を小さく）");
  assertEqual(/youtube/i.test(refreshNews.replace(/^\/\/.*$/gm, "")), false, "ニュースのスクリプト：YouTube のファイル・データに触れない");
  assertEqual((keepPrevious.match(/writeFile\(/g) ?? []).length === 1 && keepPrevious.includes("isYoutubeDataExpired(previous, now)") && keepPrevious.includes("validateYoutubePublishedData(previous"), true, "YouTube を前のまま入れ直す：30日の期限と形を確かめてから、YouTube のデータだけを書く");
  assertEqual(/googleapis|YOUTUBE_API_KEY|fetchYoutubeChannel/.test(keepPrevious.replace(/^\/\/.*$/gm, "")), false, "YouTube を前のまま入れ直す：YouTube の API を呼ばない");
  assertEqual(/news|official/i.test(youtubeRefresh.replace(/^\/\/.*$/gm, "")), false, "YouTube のスクリプト（refresh.mjs）は変えていない（ニュースのことを知らない）");
  // アプリ・Service Worker・git
  const shell = sw.slice(sw.indexOf("const APP_SHELL_FILES = ["), sw.indexOf("];", sw.indexOf("const APP_SHELL_FILES = [")));
  assertEqual(/"[^"]*official-news\.json"/.test(shell), false, "Service Worker：ニュースのデータは APP_SHELL に入れない");
  assertEqual(["./css/officialNews.css", "./js/officialNewsData.js", "./js/officialNewsScreen.js"].every((file) => shell.includes(`"${file}"`)), true, "Service Worker：画面の部品は APP_SHELL に入れる");
  const fetchHandler = sw.slice(sw.indexOf('self.addEventListener("fetch"'));
  assertEqual(fetchHandler.includes("isOfficialNewsDataRequest") && fetchHandler.indexOf("isOfficialNewsDataRequest") < fetchHandler.indexOf("caches.match(event.request)"), true, "Service Worker：ニュースのデータは network-first");
  assertEqual(sw.includes("key !== YOUTUBE_DATA_CACHE_NAME && key !== OFFICIAL_NEWS_DATA_CACHE_NAME"), true, "Service Worker：版の更新でデータの箱を消さない");
  assertEqual(gitignore.includes("\ndata/official-news.json"), true, "git：ニュースのデータは入れない");
  assertEqual(main.includes("loadOfficialNewsData(") && main.includes('navigateWithScrollMemory("officialNews")') && main.includes("navigateWithScrollMemory(officialNewsReturnScreen)"), true, "アプリ：起動のあとでデータを読む・画面の切り替え・［戻る］");
  assertEqual(screens.includes('officialNews: document.getElementById("official-news-screen")'), true, "画面の一覧に登録");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const home = doc.getElementById("start-screen");
  const row = home.querySelector("#home-quick-row");
  assertEqual([row?.previousElementSibling?.id, row?.querySelectorAll(".home-quick").length, row?.querySelector("#official-news-home-link b")?.textContent], ["app-search-link", 1, "＝LOVE 最新情報"], "ホーム：検索の下の小さな行に［＝LOVE 最新情報］（大きなカードを増やさない。質問AIの入口を2つ目に足せる）");
  assertEqual(row?.closest(".home-card"), null, "ホーム：カードの枚数・中身は変えない");
  assertEqual(Boolean(doc.querySelector('link[href="css/officialNews.css"]')) && Boolean(doc.getElementById("official-news-screen")) && Boolean(doc.getElementById("official-news-back-button")), true, "画面：CSS・画面・［戻る］");
  assertEqual(readme.includes("困ったとき") && readme.includes("robots.txt") && readme.includes("X"), true, "手順書：困ったとき・規約・X の扱い");
}

export async function runOfficialNewsTests() {
  console.log("--- ＝LOVE 最新情報（公式サイトの NEWS の自動取得・2026-11-03 R11 D） ---");
  await runFixtureParseTests();
  runTitleRuleTests();
  runStructureAndDateTests();
  runMergeTests();
  runCheckAndDecideTests();
  await runLoaderTests();
  await runScreenTests();
  await runPipelineTests();
}
