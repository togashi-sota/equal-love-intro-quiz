// 「歴代グッズ図鑑」の絞り込み・検索・並べ方・表示の言葉を決める純粋関数（2026-11-01新設・本人の決定「投稿カードの形」）。
// DOM に触れない（tests/goods.test.js で確かめる）。データは js/data/goods.js。
//
// 【画像の扱い（決まっている作り方）】
// 画像はアプリで持たない（ダウンロード・同梱・画像の URL の直接表示・Firebase への保存はしない）。
// 見られるのは、公式 X（@Equal_LOVE_12）の投稿の正式な埋め込みだけ（js/goodsEmbed.js）。
// そのため、ここで扱う URL は「公式 X の投稿」「公式ショップの商品ページ」「公式サイトのお知らせ」の3種類だけ。
import { normalizeSearchText } from "./searchNormalize.js";

// カテゴリ（タブの順）
export const GOODS_CATEGORIES = [
  { id: "photo", label: "生写真", lead: "ランダムの生写真セット（衣装ごと）" },
  { id: "idphoto", label: "証明写真", lead: "ID PHOTO ステッカーセット" },
  { id: "fourcut", label: "4カット", lead: "4カットフォトカード" },
  { id: "acrylic", label: "アクリル・その他", lead: "アクリルスタンドキーホルダー・ミニフォトカード など" },
  { id: "live", label: "ライブ・周年", lead: "ツアー・周年コンサートのグッズ（主なもの）" },
];
export const GOODS_CATEGORY_IDS = GOODS_CATEGORIES.map((category) => category.id);
const CATEGORY_LABELS = Object.fromEntries(GOODS_CATEGORIES.map((category) => [category.id, category.label]));

// 販売の時期の確かさ。official-x：公式 X の告知の投稿（存在を oEmbed で確かめた）の日付、
// official-news：公式サイトのお知らせの日付、estimate：推測（画像のファイル名の日付・商品番号の並び・ファンのまとめ記事など）
export const GOODS_PERIOD_KINDS = {
  "official-x": "公式 X の告知",
  "official-news": "公式サイトのお知らせ",
  estimate: "推測",
};

// 公式 X の投稿・公式ショップの商品ページ・公式サイトのお知らせの URL の形
export const GOODS_X_POST_PATTERN = /^https:\/\/x\.com\/Equal_LOVE_12\/status\/(\d{5,25})$/;
export const GOODS_SHOP_URL_PATTERN = /^https:\/\/store\.plusmember\.jp\/equallove\/products\/detail\.php\?product_id=(\d+)$/;
export const GOODS_NEWS_URL_PATTERN = /^https:\/\/equal-love\.jp\/news\/detail\/(\d+)$/;
// 公式ショップのトップ（商品ページが無い 2017〜2019年の品で使う）
export const GOODS_SHOP_TOP_URL = "https://store.plusmember.jp/equallove/";

export const GOODS_DEFAULT_FILTER = Object.freeze({ category: "photo", year: "all", memberId: "all", query: "" });

export function goodsCategoryLabel(categoryId) {
  return CATEGORY_LABELS[categoryId] ?? "";
}

export function goodsYear(item) {
  return String(item?.period ?? "").slice(0, 4);
}

// 「2026年10月」（月が分からないときは「2026年」）
export function formatGoodsPeriod(item) {
  const [year, month] = String(item?.period ?? "").split("-").map(Number);
  if (!year) return "時期は不明";
  return month ? `${year}年${month}月` : `${year}年`;
}

// 「2026年10月23日」（日まで分かるときだけ。分からなければ月まで）
export function formatGoodsDate(item) {
  const [year, month, day] = String(item?.date ?? "").split("-").map(Number);
  if (year && month && day) return `${year}年${month}月${day}日`;
  return formatGoodsPeriod(item);
}

export function goodsPeriodKindLabel(item) {
  return GOODS_PERIOD_KINDS[item?.periodKind] ?? GOODS_PERIOD_KINDS.estimate;
}

export function isOfficialPeriod(item) {
  return item?.periodKind === "official-x" || item?.periodKind === "official-news";
}

// 公式 X の投稿の URL から投稿の番号を取り出す（形が違えば null。推測で URL を作らない約束なので、ここで作ることもしない）
export function goodsTweetId(url) {
  const match = GOODS_X_POST_PATTERN.exec(String(url ?? ""));
  return match ? match[1] : null;
}

// 種類の数の表示：「30種（10人×3カット）」。分からなければ「未確認」（0 と出さない）
export function formatGoodsKinds(item) {
  if (!Number.isInteger(item?.kinds) || item.kinds <= 0) return "未確認";
  return item.kindsNote ? `${item.kinds}種（${item.kindsNote}）` : `${item.kinds}種`;
}

export function formatGoodsPrice(item) {
  if (!Number.isInteger(item?.price) || item.price <= 0) return "未確認";
  return `${item.price.toLocaleString("ja-JP")}円（税込）`;
}

// 検索に使う文字：名前・衣装名／シリーズ・イベント（かな・カナ・全角・半角の違いは normalizeSearchText で揃える）
export function goodsSearchText(item) {
  return normalizeSearchText(`${item?.name ?? ""} ${item?.series ?? ""} ${item?.event ?? ""}`);
}

function splitQuery(query) {
  return String(query ?? "")
    .split(/[\s　]+/)
    .map((word) => normalizeSearchText(word))
    .filter(Boolean);
}

// 新しい順（時期 → 同じ時期は id の大きい方＝後に出た方を先）
export function sortGoods(items) {
  return [...items].sort((a, b) => String(b.period).localeCompare(String(a.period)) || String(b.date ?? "").localeCompare(String(a.date ?? "")) || (b.order ?? 0) - (a.order ?? 0));
}

// 検索の言葉があるときは、カテゴリをまたいで探す（「劇薬中毒」で生写真もアクスタも出るように）
export function filterGoods(items, filter = GOODS_DEFAULT_FILTER) {
  const words = splitQuery(filter.query);
  return sortGoods(
    items.filter((item) => {
      if (!words.length && filter.category && filter.category !== "all" && item.category !== filter.category) return false;
      if (filter.year && filter.year !== "all" && goodsYear(item) !== filter.year) return false;
      if (filter.memberId && filter.memberId !== "all" && !(item.memberIds ?? []).includes(filter.memberId)) return false;
      if (words.length) {
        const text = goodsSearchText(item);
        if (!words.every((word) => text.includes(word))) return false;
      }
      return true;
    })
  );
}

export function isDefaultGoodsFilter(filter) {
  return filter.year === "all" && filter.memberId === "all" && !String(filter.query ?? "").trim();
}

// そのカテゴリにある年（新しい順）。category が "all" なら全部
export function availableGoodsYears(items, category = "all") {
  const years = new Set(items.filter((item) => category === "all" || item.category === category).map(goodsYear).filter(Boolean));
  return [...years].sort((a, b) => b.localeCompare(a));
}

// メンバーが分かる商品があるメンバーの id（データの順。メンバーの並びは呼ぶ側が members.js の順にする）
export function goodsMemberIds(items) {
  return [...new Set(items.flatMap((item) => item.memberIds ?? []))];
}

export function countGoodsByCategory(items) {
  return Object.fromEntries(GOODS_CATEGORY_IDS.map((id) => [id, items.filter((item) => item.category === id).length]));
}

// 年ごとにまとめる（一覧の見出し用）。items は並べ終わったものを渡す
export function groupGoodsByYear(items) {
  const groups = [];
  items.forEach((item) => {
    const year = goodsYear(item) || "不明";
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.items.push(item);
    else groups.push({ year, items: [item] });
  });
  return groups;
}

// 詳細の情報の表（[見出し, 値] の並び）。値が無い行は出さない
export function buildGoodsInfoRows(item) {
  const rows = [
    ["カテゴリ", goodsCategoryLabel(item.category)],
    ["衣装・シリーズ", item.series || ""],
    ["販売の時期", `${item.date ? formatGoodsDate(item) : formatGoodsPeriod(item)}（${goodsPeriodKindLabel(item)}）`],
    ["販売のイベント", item.event || ""],
    ["入り方", item.packing || ""],
    ["種類の数", formatGoodsKinds(item)],
    ["価格", formatGoodsPrice(item)],
  ];
  return rows.filter(([, value]) => value);
}
