// 【2026-11-01新設】「歴代グッズ図鑑」の回帰テスト。
// データの整合（重複なし・URL の形・カテゴリ・画像の URL を持たない・推測の印）、絞り込み・検索・並び、
// 画面（文字のカード・タブ・年・メンバー・検索・詳細の表・注記・公式ショップへのリンク）、
// 埋め込み（押すまで読み込まない・成功・消えた投稿・読み込めない・オフラインの表示。X には繋がない：部品を差し替える）、
// 行き先（ホーム・全体検索・ガイド・浮く戻る）、Service Worker（X を素通しにしてキャッシュしない）を確かめる。
import { GOODS_ITEMS, GOODS_CHECKED_DATE } from "../js/data/goods.js";
import { MEMBERS } from "../js/data/members.js";
import {
  GOODS_CATEGORIES,
  GOODS_CATEGORY_IDS,
  GOODS_PERIOD_KINDS,
  GOODS_X_POST_PATTERN,
  GOODS_SHOP_URL_PATTERN,
  GOODS_NEWS_URL_PATTERN,
  availableGoodsYears,
  buildGoodsInfoRows,
  countGoodsByCategory,
  filterGoods,
  formatGoodsKinds,
  formatGoodsPeriod,
  formatGoodsPrice,
  goodsMemberIds,
  goodsTweetId,
  goodsYear,
  groupGoodsByYear,
  sortGoods,
} from "../js/goodsModel.js";
import { initGoodsScreen, openGoodsScreen, renderGoodsDetail, getGoodsFilterState, GOODS_RIGHTS_NOTE, GOODS_YEAR_PAGE_SIZE } from "../js/goodsScreen.js";
import { embedGoodsPost, setGoodsTwitterLoader, describeGoodsEmbedFailure } from "../js/goodsEmbed.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { GUIDE_SECTIONS, GUIDE_CATEGORIES } from "../js/data/guideContent.js";
import { GUIDE_RETURN_HUBS_OF_SCREEN } from "../js/appNavigationStack.js";
import { isFloatingBackScreen } from "../js/floatingBack.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const memberIds = new Set(MEMBERS.map((member) => member.id));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runDataTests() {
  const items = GOODS_ITEMS;
  assertEqual(items.length >= 200, true, `データ：主なグッズを集めた（${items.length}件）`);
  assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(GOODS_CHECKED_DATE), true, "データ：集めた日がある");
  assertEqual(new Set(items.map((item) => item.id)).size, items.length, "データ：id が重ならない");
  assertEqual(items.every((item) => GOODS_CATEGORY_IDS.includes(item.category)), true, "データ：カテゴリは5つのどれか");
  const counts = countGoodsByCategory(items);
  assertEqual(GOODS_CATEGORY_IDS.every((id) => counts[id] > 0), true, `データ：5つのカテゴリすべてに商品がある（${JSON.stringify(counts)}）`);
  assertEqual(items.every((item) => typeof item.name === "string" && item.name.trim().length > 0), true, "データ：名前がある");
  assertEqual(items.every((item) => /^\d{4}-\d{2}$/.test(item.period)), true, "データ：販売の時期は「年-月」");
  assertEqual(items.every((item) => !item.date || (item.date.startsWith(item.period) && /^\d{4}-\d{2}-\d{2}$/.test(item.date))), true, "データ：日まで分かるときは時期と食い違わない");
  assertEqual(items.every((item) => Object.hasOwn(GOODS_PERIOD_KINDS, item.periodKind)), true, "データ：時期の確かさの印（公式 X／公式サイト／推測）が全部にある");
  assertEqual(items.filter((item) => item.periodKind === "estimate").every((item) => typeof item.periodNote === "string" && item.periodNote.length > 0), true, "データ：推測の時期には、何から推測したかの説明がある");
  assertEqual(items.filter((item) => item.periodKind === "official-x").every((item) => Boolean(item.xPostUrl)), true, "データ：「公式 X の告知」の時期は、その投稿の URL がある商品だけ");
  assertEqual(items.filter((item) => item.periodKind === "official-news").every((item) => Boolean(item.newsUrl)), true, "データ：「公式サイトのお知らせ」の時期は、お知らせの URL がある商品だけ");
  // URL の形
  assertEqual(items.every((item) => !item.shopUrl || GOODS_SHOP_URL_PATTERN.test(item.shopUrl)), true, "データ：公式ショップの URL は商品ページの形");
  assertEqual(items.every((item) => !item.xPostUrl || GOODS_X_POST_PATTERN.test(item.xPostUrl)), true, "データ：X の URL は公式 X（@Equal_LOVE_12）の投稿の形だけ");
  assertEqual(items.every((item) => !item.newsUrl || GOODS_NEWS_URL_PATTERN.test(item.newsUrl)), true, "データ：公式サイトのお知らせの URL の形");
  assertEqual(items.every((item) => Boolean(item.shopUrl) || Boolean(item.newsUrl)), true, "データ：どの商品にも公式のページ（ショップかお知らせ）がある");
  const shopUrls = items.map((item) => item.shopUrl).filter(Boolean);
  assertEqual(new Set(shopUrls).size, shopUrls.length, "データ：同じ商品ページが2件に入っていない（重複なし）");
  const sameName = new Set(items.map((item) => `${item.category}|${item.name}|${item.series}|${item.period}`));
  assertEqual(sameName.size, items.length, "データ：同じカテゴリ・名前・衣装・時期の重複がない");
  // 画像を持たない約束
  const allText = JSON.stringify(items);
  assertEqual(/\.(jpe?g|png|webp|gif)\b/i.test(allText), false, "データ：画像のファイル名・URL を持たない");
  assertEqual(/storage-store|save_image|twimg|pbs\.|image\.emtg/i.test(allText), false, "データ：ショップ・X の画像のホストを持たない");
  assertEqual(items.every((item) => !Object.hasOwn(item, "image") && !Object.hasOwn(item, "imageUrl") && !Object.hasOwn(item, "thumbnail")), true, "データ：画像の欄が無い");
  // 2017〜2019年は公式サイトのお知らせのリンクだけ
  const old = items.filter((item) => Number(goodsYear(item)) <= 2019);
  assertEqual(old.length > 0 && old.every((item) => item.newsUrl && !item.shopUrl && !item.xPostUrl), true, `データ：2017〜2019年は公式サイトのお知らせのリンクだけ（${old.length}件）`);
  // 数・価格（未確認は null。0 にしない）
  assertEqual(items.every((item) => item.kinds == null || (Number.isInteger(item.kinds) && item.kinds > 0)), true, "データ：種類の数は正の整数か null（未確認）");
  assertEqual(items.every((item) => item.price == null || (Number.isInteger(item.price) && item.price > 0)), true, "データ：価格は正の整数か null");
  assertEqual(items.every((item) => (item.memberIds ?? []).every((id) => memberIds.has(id))), true, "データ：メンバーの id は members.js のもの");
  // 2023〜2026年の生写真を中心に
  const photo2326 = items.filter((item) => item.category === "photo" && Number(goodsYear(item)) >= 2023);
  assertEqual(photo2326.length >= 80, true, `データ：2023〜2026年の生写真（${photo2326.length}件）`);
  assertEqual(photo2326.filter((item) => item.kinds).length >= photo2326.length * 0.8, true, "データ：2023〜2026年の生写真は、ほとんど種類の数がある（商品ページで確認）");
  // 代表の1件（2026年10月の「恋、はじめました。」MV衣装）
  const koi = items.find((item) => item.shopUrl === "https://store.plusmember.jp/equallove/products/detail.php?product_id=114826");
  assertEqual(koi?.category, "photo", "データ：「恋、はじめました。」MV衣装の生写真セットがある");
  assertEqual(koi?.kinds, 30, "データ：その種類の数は30種（10人×3カット）");
  assertEqual(koi?.price, 1200, "データ：価格は1,200円");
  // 説明文を丸写ししていない（ショップの注意書きの決まり文句を持ち込まない）
  assertEqual(/転売|ネコポス|お一人様|発送予定/.test(allText), false, "データ：ショップの説明文・注意書きを写していない");
}

function runModelTests() {
  const sample = [
    { id: "a", category: "photo", name: "生写真セット", series: "「劇薬中毒」MV衣装", period: "2026-05", periodKind: "estimate", order: 3, memberIds: [] },
    { id: "b", category: "photo", name: "生写真セット", series: "「劇薬中毒」ジャケット衣装", period: "2026-03", periodKind: "official-x", order: 2, memberIds: [] },
    { id: "c", category: "acrylic", name: "アクリルスタンドキーホルダー", series: "「劇薬中毒」衣装", period: "2026-05", periodKind: "estimate", order: 4, memberIds: [] },
    { id: "d", category: "photo", name: "大場花菜生誕記念生写真セット", series: "生誕記念", period: "2021-10", periodKind: "estimate", order: 1, memberIds: ["oba-hana"] },
  ];
  assertEqual(sortGoods(sample).map((item) => item.id), ["c", "a", "b", "d"], "並び：新しい順（同じ月は後に出た方が先）");
  assertEqual(filterGoods(sample, { category: "photo", year: "all", memberId: "all", query: "" }).map((item) => item.id), ["a", "b", "d"], "絞り込み：カテゴリ");
  assertEqual(filterGoods(sample, { category: "photo", year: "2026", memberId: "all", query: "" }).map((item) => item.id), ["a", "b"], "絞り込み：年");
  assertEqual(filterGoods(sample, { category: "photo", year: "all", memberId: "oba-hana", query: "" }).map((item) => item.id), ["d"], "絞り込み：メンバー（分かる商品だけ）");
  assertEqual(filterGoods(sample, { category: "photo", year: "all", memberId: "all", query: "劇薬中毒" }).map((item) => item.id), ["c", "a", "b"], "検索：カテゴリをまたいで探す（生写真もアクスタも）");
  assertEqual(filterGoods(sample, { category: "photo", year: "all", memberId: "all", query: "じゃけっと" }).map((item) => item.id), ["b"], "検索：カタカナの衣装名をひらがなでも");
  assertEqual(filterGoods(sample, { category: "photo", year: "all", memberId: "all", query: "劇薬中毒 ジャケット" }).map((item) => item.id), ["b"], "検索：言葉を2つ並べると両方を含むもの");
  assertEqual(filterGoods(sample, { category: "photo", year: "all", memberId: "all", query: "ＭＶ" }).map((item) => item.id), ["a"], "検索：全角の英字でも");
  assertEqual(availableGoodsYears(sample, "photo"), ["2026", "2021"], "年の選択肢：そのカテゴリにある年だけ（新しい順）");
  assertEqual(goodsMemberIds(sample), ["oba-hana"], "メンバーの選択肢：データで分かるメンバーだけ");
  assertEqual(groupGoodsByYear(sortGoods(sample)).map((group) => [group.year, group.items.length]), [["2026", 3], ["2021", 1]], "年ごとにまとめる");
  assertEqual(formatGoodsPeriod({ period: "2026-03" }), "2026年3月", "表示：年月");
  assertEqual(formatGoodsKinds({ kinds: 30, kindsNote: "10人×3カット" }), "30種（10人×3カット）", "表示：種類の数");
  assertEqual(formatGoodsKinds({ kinds: null }), "未確認", "表示：種類の数が分からなければ「未確認」（0 と出さない）");
  assertEqual(formatGoodsPrice({ price: 1200 }), "1,200円（税込）", "表示：価格");
  assertEqual(formatGoodsPrice({ price: null }), "未確認", "表示：価格が分からなければ「未確認」");
  assertEqual(goodsTweetId("https://x.com/Equal_LOVE_12/status/2033483423898091658"), "2033483423898091658", "X：公式の投稿の番号を取り出す");
  assertEqual(goodsTweetId("https://x.com/someone/status/2033483423898091658"), null, "X：公式以外のアカウントは受け付けない");
  assertEqual(goodsTweetId("https://x.com/Equal_LOVE_12/status/abc"), null, "X：形の違う URL は受け付けない");
  const rows = buildGoodsInfoRows({ ...sample[1], event: "", kinds: null, price: 1200 });
  assertEqual(rows.map(([label]) => label), ["カテゴリ", "衣装・シリーズ", "販売の時期", "種類の数", "価格"], "詳細の表：空の行（イベント）は出さない");
  assertEqual(rows.find(([label]) => label === "販売の時期")[1], "2026年3月（公式 X の告知）", "詳細の表：時期に確かさの印");
  assertEqual(buildGoodsInfoRows(sample[0]).find(([label]) => label === "販売の時期")[1], "2026年5月（推測）", "詳細の表：推測は「推測」と出す");
}

function makeContainers() {
  const list = document.createElement("div");
  const detail = document.createElement("div");
  list.style.position = "absolute";
  list.style.left = "-9999px";
  detail.style.position = "absolute";
  detail.style.left = "-9999px";
  document.body.append(list, detail);
  return { list, detail };
}

function runScreenTests() {
  const { list, detail } = makeContainers();
  const opened = [];
  try {
    initGoodsScreen({ listContainer: list, detailContainer: detail }, { onOpenDetail: (id) => opened.push(id) });
    openGoodsScreen();
    const tabs = [...list.querySelectorAll(".gds-tab")];
    assertEqual(tabs.map((tab) => tab.querySelector(".gds-tab-label").textContent), ["生写真", "証明写真", "4カット", "アクリル・その他", "ライブ・周年"], "画面：カテゴリのタブ5つ");
    assertEqual(list.querySelector('.gds-tab[aria-selected="true"]')?.dataset.category, "photo", "画面：初めは生写真");
    assertEqual(list.querySelectorAll("img, iframe, video, picture").length, 0, "画面：一覧に画像・埋め込みを出さない（文字のカードだけ）");
    const photoCount = GOODS_ITEMS.filter((item) => item.category === "photo").length;
    assertEqual(list.querySelector(".gds-count").textContent, `生写真 全${photoCount}件`, "画面：件数");
    const firstYear = list.querySelector(".gds-year");
    assertEqual(firstYear?.querySelectorAll(".gds-card").length <= GOODS_YEAR_PAGE_SIZE, true, "画面：1つの年は最初は決まった数まで（長くなりすぎない）");
    const firstCard = list.querySelector(".gds-card");
    assertEqual(Boolean(firstCard.querySelector(".gds-card-title")) && Boolean(firstCard.querySelector(".gds-card-period")), true, "画面：カードに衣装名と年月");
    assertEqual(firstCard.getAttribute("aria-label").includes("詳しく見る"), true, "画面：カードの読み上げ");
    // 新しい順：最初の年がいちばん新しい
    const years = [...list.querySelectorAll(".gds-year")].map((section) => section.dataset.year);
    assertEqual(JSON.stringify(years), JSON.stringify([...years].sort((a, b) => b.localeCompare(a))), "画面：年は新しい順");
    // タブを切り替える
    list.querySelector('.gds-tab[data-category="idphoto"]').click();
    assertEqual(getGoodsFilterState().category, "idphoto", "画面：タブで証明写真へ");
    assertEqual([...list.querySelectorAll(".gds-card")].every((card) => card.dataset.category === "idphoto"), true, "画面：証明写真だけが出る");
    assertEqual(list.querySelector(".gds-member-row").hidden, true, "画面：メンバーが分からないカテゴリでは、メンバーの絞り込みを出さない");
    // 年
    const yearSelect = list.querySelector('select[aria-label="年で絞り込む"]');
    const targetYear = [...yearSelect.options].map((option) => option.value).find((value) => value !== "all");
    yearSelect.value = targetYear;
    yearSelect.dispatchEvent(new Event("change"));
    assertEqual([...list.querySelectorAll(".gds-year")].map((section) => section.dataset.year), [targetYear], "画面：年で絞り込む");
    assertEqual(list.querySelector(".gds-reset").hidden, false, "画面：絞り込み中は［条件を戻す］");
    list.querySelector(".gds-reset").click();
    assertEqual(getGoodsFilterState().year, "all", "画面：［条件を戻す］");
    // 検索（カテゴリをまたぐ）
    const search = list.querySelector(".gds-search");
    search.value = "劇薬中毒";
    search.dispatchEvent(new Event("input"));
    const categories = new Set([...list.querySelectorAll(".gds-card")].map((card) => card.dataset.category));
    assertEqual(categories.has("photo") && categories.has("acrylic"), true, "画面：検索はすべてのカテゴリから（生写真もアクスタも）");
    assertEqual(list.querySelector(".gds-count").textContent.startsWith("全カテゴリから"), true, "画面：検索中は「全カテゴリから」と出す");
    search.value = "存在しない衣装ああああ";
    search.dispatchEvent(new Event("input"));
    assertEqual(Boolean(list.querySelector(".gds-empty")), true, "画面：見つからないときの案内");
    // メンバー（生写真の生誕記念）
    list.querySelector('.gds-tab[data-category="photo"]').click();
    const memberSelect = list.querySelector('.gds-member-row select');
    assertEqual(list.querySelector(".gds-member-row").hidden, false, "画面：生写真ではメンバーの絞り込みを出す（生誕記念はメンバーが分かる）");
    memberSelect.value = "oba-hana";
    memberSelect.dispatchEvent(new Event("change"));
    const memberCards = [...list.querySelectorAll(".gds-card")];
    assertEqual(memberCards.length > 0 && memberCards.every((card) => (GOODS_ITEMS.find((item) => item.id === card.dataset.id).memberIds ?? []).includes("oba-hana")), true, "画面：メンバーで絞り込む");
    // カードを押すと詳細へ
    memberCards[0].click();
    assertEqual(opened[opened.length - 1], memberCards[0].dataset.id, "画面：カードを押すと、その商品の詳細を開く");
    // 開き直すと初めに戻る
    openGoodsScreen({ category: "live" });
    assertEqual(getGoodsFilterState(), { category: "live", year: "all", memberId: "all", query: "" }, "画面：カテゴリを指定して開ける（条件は初めに戻る）");
  } finally {
    list.remove();
    detail.remove();
  }
}

async function runDetailAndEmbedTests() {
  const { list, detail } = makeContainers();
  const withPost = GOODS_ITEMS.find((item) => item.xPostUrl && item.shopUrl);
  const withoutPost = GOODS_ITEMS.find((item) => !item.xPostUrl && item.shopUrl);
  const newsItem = GOODS_ITEMS.find((item) => item.newsUrl && !item.shopUrl);
  let loaderCalls = 0;
  try {
    initGoodsScreen({ listContainer: list, detailContainer: detail }, {});
    // 投稿のある商品
    assertEqual(Boolean(withPost), true, "前提：公式 X の投稿が見つかった商品がある");
    setGoodsTwitterLoader(() => {
      loaderCalls += 1;
      return Promise.resolve({
        createTweet: (id, container) => {
          const frame = document.createElement("div");
          frame.className = "mock-tweet";
          frame.dataset.tweetId = id;
          container.appendChild(frame);
          return Promise.resolve(frame);
        },
      });
    });
    renderGoodsDetail(withPost.id);
    assertEqual(detail.querySelector(".gds-detail-title").textContent, withPost.series || withPost.name, "詳細：題名");
    assertEqual(detail.querySelectorAll(".gds-info-row").length >= 4, true, "詳細：情報の表");
    assertEqual(detail.querySelector(".gds-rights").textContent, `${GOODS_RIGHTS_NOTE}。`, "詳細：注記「画像は公式 X の投稿を表示しています。権利は各権利者に帰属します」");
    const shop = detail.querySelector("a.gds-shop-link");
    assertEqual([shop?.textContent, shop?.getAttribute("href"), shop?.target, shop?.rel], ["公式ショップで見る", withPost.shopUrl, "_blank", "noopener noreferrer"], "詳細：［公式ショップで見る］は商品ページを新しいタブで");
    assertEqual(detail.querySelector(".gds-embed-button")?.textContent, "公式 X の投稿を表示", "詳細：［公式 X の投稿を表示］");
    assertEqual(loaderCalls, 0, "埋め込み：押すまで X の部品を読み込まない");
    assertEqual(detail.querySelectorAll("iframe, img, .mock-tweet").length, 0, "埋め込み：押す前は何も出さない");
    assertEqual(document.querySelectorAll('script[src*="platform.twitter.com"]').length, 0, "埋め込み：押す前は widgets.js の script を足さない");
    assertEqual(detail.querySelector("a.gds-embed-link")?.getAttribute("href"), withPost.xPostUrl, "埋め込み：投稿へのリンクは最初からある");
    detail.querySelector(".gds-embed-button").click();
    await wait(20);
    assertEqual(loaderCalls, 1, "埋め込み：押したら1回だけ読み込む");
    assertEqual(detail.querySelector(".mock-tweet")?.dataset.tweetId, goodsTweetId(withPost.xPostUrl), "埋め込み：その商品の投稿を出す");
    assertEqual(detail.querySelector(".gds-embed").classList.contains("is-loaded"), true, "埋め込み：表示できた");
    // 消えた投稿（createTweet が何も返さない）
    setGoodsTwitterLoader(() => Promise.resolve({ createTweet: () => Promise.resolve(undefined) }));
    renderGoodsDetail(withPost.id);
    detail.querySelector(".gds-embed-button").click();
    await wait(20);
    assertEqual(detail.querySelector(".gds-embed-status").textContent.includes("表示できません"), true, "埋め込み：消えた投稿は「表示できません」");
    assertEqual(detail.querySelector("a.gds-embed-link")?.getAttribute("href"), withPost.xPostUrl, "埋め込み：表示できないときもリンクを残す");
    assertEqual(detail.querySelector(".gds-embed-button").hidden, false, "埋め込み：もう一度押せる");
    assertEqual(detail.querySelector(".gds-embed-button").textContent, "もう一度読み込む", "埋め込み：ボタンの名前が「もう一度読み込む」に");
    // 読み込めない（script のエラー）
    setGoodsTwitterLoader(() => Promise.reject(new Error("script-error")));
    renderGoodsDetail(withPost.id);
    detail.querySelector(".gds-embed-button").click();
    await wait(20);
    assertEqual(detail.querySelector(".gds-embed-status").textContent, describeGoodsEmbedFailure("script-error"), "埋め込み：X の部品が読めないときの表示");
    // オフライン（読み込みの部品を呼ばない）
    let offlineCalls = 0;
    setGoodsTwitterLoader(() => {
      offlineCalls += 1;
      return Promise.resolve({ createTweet: () => Promise.resolve(document.createElement("div")) });
    }, () => false);
    renderGoodsDetail(withPost.id);
    detail.querySelector(".gds-embed-button").click();
    await wait(20);
    assertEqual([offlineCalls, detail.querySelector(".gds-embed-status").textContent.includes("オフライン")], [0, true], "埋め込み：オフラインは X に繋がず「表示できません」");
    // 時間切れ
    setGoodsTwitterLoader(() => new Promise(() => {}));
    const timeout = await embedGoodsPost(document.createElement("div"), withPost.xPostUrl, { timeoutMs: 30 });
    assertEqual(timeout, { ok: false, reason: "timeout" }, "埋め込み：時間切れ");
    assertEqual(await embedGoodsPost(document.createElement("div"), "https://x.com/other/status/1"), { ok: false, reason: "invalid" }, "埋め込み：公式以外の URL は読み込まない");
    // 投稿の無い商品
    renderGoodsDetail(withoutPost.id);
    assertEqual([Boolean(detail.querySelector(".gds-embed-button")), Boolean(detail.querySelector(".gds-embed-none"))], [false, true], "詳細：投稿が見つからない商品は、ボタンを出さず案内とショップのリンク");
    assertEqual(detail.querySelector("a.gds-shop-link")?.getAttribute("href"), withoutPost.shopUrl, "詳細：投稿が無くても［公式ショップで見る］");
    // 2017〜2019年（お知らせだけ）
    renderGoodsDetail(newsItem.id);
    assertEqual(detail.querySelector("a.gds-news-link")?.getAttribute("href"), newsItem.newsUrl, "詳細：2017〜2019年は公式サイトのお知らせへ");
    assertEqual(detail.querySelector("a.gds-shop-link")?.getAttribute("href"), "https://store.plusmember.jp/equallove/", "詳細：商品ページが無い品は、公式ショップのトップ");
    // 推測の時期の説明
    const estimate = GOODS_ITEMS.find((item) => item.periodKind === "estimate" && item.shopUrl);
    renderGoodsDetail(estimate.id);
    assertEqual(detail.textContent.includes("販売の時期は推測です"), true, "詳細：推測の時期は、推測だと書く");
    assertEqual(renderGoodsDetail("no-such-id"), false, "詳細：無い id は案内だけ");
  } finally {
    setGoodsTwitterLoader(null);
    list.remove();
    detail.remove();
  }
}

function runLinkTests() {
  const guide = GUIDE_SECTIONS.find((section) => section.id === "goods");
  assertEqual(guide?.actions?.[0]?.open, { click: "goods-home-link" }, "ガイド：歴代グッズ図鑑の項目から開ける");
  assertEqual(GUIDE_CATEGORIES.find((category) => category.id === "info").sectionIds.includes("goods"), true, "ガイド：＝LOVE情報の目次にある");
  assertEqual(GUIDE_RETURN_HUBS_OF_SCREEN.goods, ["guide"], "ガイドから開いたら、戻るでガイドへ");
  const entries = buildAppSearchEntries();
  assertEqual(searchAppEntries(entries, "グッズ図鑑").results[0]?.entry.key, "feature:feature-goods", "検索：「グッズ図鑑」で歴代グッズ図鑑が先頭");
  assertEqual(searchAppEntries(entries, "生写真").results.some((result) => result.entry.key === "feature:feature-goods"), true, "検索：「生写真」でも出る");
  assertEqual(searchAppEntries(entries, "アクスタ").results.some((result) => result.entry.key === "feature:feature-goods"), true, "検索：「アクスタ」でも出る");
  assertEqual(APP_SEARCH_FEATURES.find((feature) => feature.id === "feature-goods")?.action, { type: "click", selector: "#goods-home-link" }, "検索：機能の入口はホームのボタン");
  assertEqual([isFloatingBackScreen("goods"), isFloatingBackScreen("goodsDetail")], [true, true], "浮く戻る：一覧・詳細の両方で出る");
}

async function runMarkupTests() {
  const [html, sw, main, screens] = await Promise.all([fetchText("index.html"), fetchText("sw.js"), fetchText("js/main.js"), fetchText("js/screens.js")]);
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(doc.querySelector("#home-card-know #goods-home-link b")?.textContent, "歴代グッズ図鑑", "入口：ホームの「＝LOVEをもっと知る」に［歴代グッズ図鑑］");
  assertEqual(Boolean(doc.querySelector("#goods-home-link use[href='#hi-goods']")) && Boolean(doc.querySelector("symbol#hi-goods")), true, "入口：SVG のアイコン");
  assertEqual(Boolean(doc.querySelector("#goods-screen #goods-back-button.back-link")) && Boolean(doc.querySelector("#goods-content")), true, "画面：一覧に戻るボタンと入れ物");
  assertEqual(Boolean(doc.querySelector("#goods-detail-screen #goods-detail-back-button.back-link")) && Boolean(doc.querySelector("#goods-detail-content")), true, "画面：詳細に戻るボタンと入れ物（浮く戻るは .back-link を押す）");
  assertEqual(doc.querySelector("#goods-screen h2")?.textContent, "歴代グッズ図鑑", "画面：題名");
  assertEqual(Boolean(doc.querySelector('link[href="css/goods.css"]')), true, "画面：CSS を読み込む");
  assertEqual(doc.querySelectorAll('script[src*="twitter"], script[src*="x.com"]').length, 0, "埋め込み：index.html に X の script を置かない（押したときだけ足す）");
  assertEqual(/storage-store\.plusmember|pbs\.twimg/.test(html), false, "画像：ショップ・X の画像を直接表示しない");
  assertEqual(screens.includes('goods: document.getElementById("goods-screen")') && screens.includes('goodsDetail: document.getElementById("goods-detail-screen")'), true, "画面の一覧に2つの画面");
  assertEqual(main.includes('openGoodsFrom("start")') && main.includes('navigateWithScrollMemory("goodsDetail")') && main.includes('navigateWithScrollMemory("goods")'), true, "行き先：ホーム → 一覧 → 詳細 →［一覧へ］");
  // Service Worker
  assertEqual(["./css/goods.css", "./js/goodsScreen.js", "./js/goodsModel.js", "./js/goodsEmbed.js", "./js/data/goods.js"].every((file) => sw.includes(`"${file}"`)), true, "オフライン：新しいファイルを APP_SHELL に入れた");
  assertEqual(/const CACHE_VERSION = "v409";/.test(sw), true, "CACHE_VERSION は変えていない（v409）");
  const patternSource = /const SW_PASS_THROUGH_HOST_PATTERN = (\/.+\/);/.exec(sw)?.[1];
  const functionStart = sw.indexOf("function shouldPassThroughRequest(url)");
  const functionBody = sw.slice(functionStart, sw.indexOf("\n}\n", functionStart) + 2);
  // eslint-disable-next-line no-new-func
  const shouldPassThrough = new Function(`const SW_PASS_THROUGH_HOST_PATTERN = ${patternSource}; ${functionBody}; return shouldPassThroughRequest;`)();
  assertEqual(
    [
      "https://platform.twitter.com/widgets.js",
      "https://platform.twitter.com/embed/Tweet.html?id=1",
      "https://syndication.twitter.com/srv/timeline-profile",
      "https://cdn.syndication.twimg.com/tweet-result?id=1",
      "https://pbs.twimg.com/media/abc.jpg",
      "https://x.com/Equal_LOVE_12/status/1",
      "https://t.co/abc",
    ].map(shouldPassThrough),
    [true, true, true, true, true, true, true],
    "Service Worker：X の script・iframe・画像は素通し（キャッシュしない）"
  );
  assertEqual(
    ["http://127.0.0.1:8887/index.html", "https://store.plusmember.jp/equallove/", "https://notx.com/a.js", "https://www.gstatic.com/firebasejs/x.js", "not a url"].map(shouldPassThrough),
    [false, false, false, false, false],
    "Service Worker：アプリ自身・ほかのホストは今までどおり"
  );
  const fetchHandler = sw.slice(sw.indexOf('self.addEventListener("fetch"'));
  assertEqual(fetchHandler.indexOf("shouldPassThroughRequest(event.request.url)) return;") !== -1 && fetchHandler.indexOf("shouldPassThroughRequest") < fetchHandler.indexOf("event.respondWith"), true, "Service Worker：素通しの判定は respondWith より前（横取りしない）");
  assertEqual(/cache\.put|caches\.open\([^)]*\)\.then\([^)]*put/.test(fetchHandler), false, "Service Worker：fetch で何もキャッシュに足さない");
}

export async function runGoodsTests() {
  console.log("--- 歴代グッズ図鑑（2026-11-01） ---");
  runDataTests();
  runModelTests();
  runScreenTests();
  await runDetailAndEmbedTests();
  runLinkTests();
  await runMarkupTests();
}
