// 「＝LOVE 最新情報」の自動取得の中身（2026-11-03新設・R11 D）。公式サイトの HTML を読み、データを作り、検査し、公開のしかたを決める。
// GitHub Actions（scripts/news/refresh-news.mjs）とテスト（tests/officialNews.test.js）の両方から使う。DOM・ネットには触れない。
//
// 【決まり】
// - 取るもの：記事の ID・タイトル・発表日・カテゴリ・URL（公式の一覧のページに出ているものだけ）。本文・画像は取らない
// - 関連メンバー：タイトルに ＝LOVE のメンバーの名前（姓名）があるときだけ。≠ME・≒JOY のメンバーは数えない（名前の一覧に無い）
// - 重複：記事の ID で1件にする。前に公開したデータ（previous）から過去の分を引き継ぐ
// - 新着かどうかは ID の大小では決めない（公式の一覧は同じ日の中で ID の順に並ばない）。前のデータに無い ID ＝ 新しく見つけた記事
// - 既存の図鑑・個人ページのデータは書き換えない。「確認待ちの候補」の一覧を作るだけ
import { MEMBERS } from "./data/members.js";
import {
  OFFICIAL_NEWS_CATEGORIES,
  OFFICIAL_NEWS_DATA_PATH,
  OFFICIAL_NEWS_EARLIEST_DATE,
  OFFICIAL_NEWS_SCHEMA,
  OFFICIAL_SITE_ORIGIN,
  japanDateOf,
  validateOfficialNewsData,
} from "./officialNewsData.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const NEWS_SOURCE_LABEL = "equal-love.jp NEWS";
// 1回の取得で読む一覧のページの上限（1ページ10件）。新しい記事が無いページに来たら、そこで止める
export const NEWS_MAX_PAGES = 5;
// 1ページ目の件数がこれより少ないときは、一覧の形が変わったとみなして公開しない（いつもは10件）
export const NEWS_MIN_ITEMS_ON_FIRST_PAGE = 5;
// 件数の急減：引き継いだ件数が前の件数のこの割合を下回ったら公開しない
export const NEWS_SUDDEN_DROP_RATIO = 0.9;
// 残しておく期間・件数（古い記事から外す）
export const NEWS_KEEP_DAYS = 3 * 366;
export const NEWS_KEEP_MAX_ITEMS = 1000;
// 「前のデータに無い ID」でも、発表日が前の取得より7日以上前なら、新着として数えない（古い記事の掘り起こし・誤検出を避ける）
export const NEWS_BACKFILL_GRACE_DAYS = 7;

export function isAllowedNewsOutput(relativePath) {
  return String(relativePath ?? "").replace(/\\/g, "/").replace(/^\.\//, "") === OFFICIAL_NEWS_DATA_PATH;
}

// ---- HTML の読み取り（公式サイトの一覧のページ） ----
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };
export function decodeHtml(text) {
  return String(text ?? "").replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (whole, name) => {
    const lower = name.toLowerCase();
    if (lower.startsWith("#x")) return String.fromCodePoint(parseInt(lower.slice(2), 16));
    if (lower.startsWith("#")) return String.fromCodePoint(Number(lower.slice(1)));
    return ENTITIES[lower] ?? whole;
  });
}

function textOf(html) {
  return decodeHtml(String(html ?? "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function toIsoDate(year, month, day) {
  const text = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text ? text : null;
}

function categoryFromSite(siteClass, siteText) {
  const byClass = OFFICIAL_NEWS_CATEGORIES.find((category) => category.siteClass === siteClass);
  const text = String(siteText ?? "").trim();
  const byText = OFFICIAL_NEWS_CATEGORIES.find((category) => (category.siteLabel ?? category.label) === text);
  // 札の番号と文字が食い違う・どちらも知らない → 「その他」にして、知らせる（unknownCategory）
  if (byClass && (!text || byText === byClass)) return { key: byClass.key, unknown: false };
  if (byText && !siteClass) return { key: byText.key, unknown: false };
  return { key: "other", unknown: true, siteLabel: text || siteClass || "" };
}

// NEWS の一覧のページ → 記事の一覧。読めなかった記事は problems に入れる（黙って捨てない）
export function parseNewsListHtml(html) {
  const items = [];
  const problems = [];
  const anchor = /<a\s[^>]*href="(?:https:\/\/equal-love\.jp)?\/news\/detail\/(\d{1,9})"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(String(html ?? "")))) {
    const sourceId = Number(match[1]);
    const inner = match[2];
    const dateHtml = /<p class="date">([\s\S]*?)<\/p>/i.exec(inner)?.[1];
    const titleHtml = /<p class="tit">([\s\S]*?)<\/p>/i.exec(inner)?.[1];
    if (dateHtml === undefined || titleHtml === undefined) {
      problems.push({ sourceId, reason: "日付・タイトルの場所が見つからない" });
      continue;
    }
    const cat = /<span class="(cat\d+)">([^<]*)<\/span>/i.exec(dateHtml);
    const dateText = textOf(dateHtml.replace(/<span[^>]*>[\s\S]*?<\/span>/gi, " "));
    const ymd = /(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(dateText);
    const publishedOn = ymd ? toIsoDate(ymd[1], ymd[2], ymd[3]) : null;
    const title = textOf(titleHtml);
    if (!publishedOn) problems.push({ sourceId, reason: `日付が読めない（${dateText.slice(0, 20)}）` });
    else if (!title) problems.push({ sourceId, reason: "タイトルが空" });
    else {
      const category = categoryFromSite(cat?.[1] ?? "", cat?.[2] ?? "");
      items.push({ sourceId, title, publishedOn, category: category.key, unknownCategory: category.unknown ? category.siteLabel : null, url: `${OFFICIAL_SITE_ORIGIN}/news/detail/${sourceId}` });
    }
  }
  const hasNext = /<div id="next">\s*<a href="[^"]*page=\d+/i.test(String(html ?? ""));
  return { items, problems, hasNext };
}

// DISCOGRAPHY の一覧のページ → 作品の一覧（作品名・種類・発売日・URL）
export function parseDiscographyListHtml(html) {
  const items = [];
  const problems = [];
  const anchor = /<a\s[^>]*href="(?:https:\/\/equal-love\.jp)?\/discography\/detail\/(\d{1,9})\/?"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchor.exec(String(html ?? "")))) {
    const sourceId = Number(match[1]);
    const inner = match[2];
    const dateHtml = /<p class="date">([\s\S]*?)<\/p>/i.exec(inner)?.[1];
    const titleHtml = /<p class="tit">([\s\S]*?)<\/p>/i.exec(inner)?.[1];
    if (dateHtml === undefined || titleHtml === undefined) {
      problems.push({ sourceId, reason: "発売日・作品名の場所が見つからない" });
      continue;
    }
    const kind = textOf(/<span class="cat\d+">([^<]*)<\/span>/i.exec(dateHtml)?.[1] ?? "");
    const ymd = /(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(textOf(dateHtml));
    const title = textOf(titleHtml);
    if (!title) problems.push({ sourceId, reason: "作品名が空" });
    else items.push({ sourceId, title, kind: kind || null, releaseOn: ymd ? toIsoDate(ymd[1], ymd[2], ymd[3]) : null, url: `${OFFICIAL_SITE_ORIGIN}/discography/detail/${sourceId}/` });
  }
  return { items, problems };
}

// ---- タイトルからの判断（関連メンバー・グループ・印） ----
// 表記の揺れをそろえる：全角・半角（NFKC）、髙→高、齋・齊・斎→斉、空白を消す
export function normalizeForMatch(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/髙/g, "高")
    .replace(/[齋齊斎]/g, "斉")
    .replace(/[\s　・･]/g, "");
}

const MEMBER_MATCHERS = MEMBERS.map((member) => ({ id: member.id, key: normalizeForMatch(member.name) }));

export function detectNewsMembers(title) {
  const text = normalizeForMatch(title);
  return MEMBER_MATCHERS.filter((matcher) => text.includes(matcher.key)).map((matcher) => matcher.id);
}

// ＝LOVE 以外のグループの名前（合同の企画の印。メンバーには数えない）
const OTHER_GROUPS = [
  { label: "≠ME", pattern: /≠ME|ノイミー/i },
  { label: "≒JOY", pattern: /≒JOY|ニアジョイ/i },
];
export function detectOtherGroups(title) {
  const text = String(title ?? "").normalize("NFKC");
  // 「IKONOIJOY Puzzle」（ゲームの名前）・「イコノイジョイ チャンネル」のように、3組の名前を合わせた言葉は合同の出演とは限らないので数えない
  return OTHER_GROUPS.filter((group) => group.pattern.test(text)).map((group) => group.label);
}

// 「※＝LOVE」「出演：＝LOVE」のように、グループ全体の出演・発表と分かるか
function mentionsWholeGroup(title) {
  const text = String(title ?? "").normalize("NFKC");
  return /※\s*=LOVE(?![A-Za-z])/.test(text) || /^=LOVE\s/.test(text) || /=LOVE\s*(?:\d+(?:st|nd|rd|th)|ニュー|NEW)/i.test(text) || /イコラブ/.test(text);
}

// 印：訂正・延期・中止・変更・終了（タイトルに書いてあるときだけ）
const FLAG_RULES = [
  { flag: "correction", pattern: /訂正|お詫び|おわび/ },
  { flag: "postponed", pattern: /延期/ },
  { flag: "cancelled", pattern: /中止|開催見合わせ|公演見合わせ/ },
  { flag: "changed", pattern: /変更/ },
  // 「受付終了」「販売終了」はチケット・グッズのお知らせで、番組・活動の終了ではないので数えない
  { flag: "ended", pattern: /番組終了|放送終了|最終回|連載終了|活動終了|配信終了/ },
];
export function detectNewsFlags(title) {
  const text = String(title ?? "");
  return FLAG_RULES.filter((rule) => rule.pattern.test(text)).map((rule) => rule.flag);
}

export function newsItemId(sourceId) {
  return `equal-love-news-${sourceId}`;
}

// 一覧から読んだ1件 → データの1件
export function buildNewsItem(raw, { fetchedAt }) {
  const memberIds = detectNewsMembers(raw.title);
  return {
    id: newsItemId(raw.sourceId),
    title: raw.title,
    publishedOn: raw.publishedOn,
    category: raw.category,
    memberIds,
    scope: memberIds.length ? "members" : mentionsWholeGroup(raw.title) ? "group" : "unknown",
    otherGroups: detectOtherGroups(raw.title),
    flags: detectNewsFlags(raw.title),
    url: raw.url,
    source: NEWS_SOURCE_LABEL,
    fetchedAt,
    lastSeenAt: fetchedAt,
  };
}

// ---- 前のデータとの引き継ぎ ----
// fetchedPages：今回読めたページの記事（読んだ順）。coverageComplete：最後に読んだページまでの範囲は全部読めたか
export function mergeNewsItems({ previousItems = [], fetchedRaw = [], now = new Date(), previousFetchedAt = null }) {
  const nowIso = now.toISOString();
  const byId = new Map(previousItems.map((item) => [item.id, { ...item, missingFromList: false }]));
  const seenIds = new Set();
  const added = [];
  const backfilled = [];
  const revised = [];
  const previousTime = Date.parse(previousFetchedAt ?? "");
  const backfillLimit = Number.isFinite(previousTime) ? japanDateOf(new Date(previousTime - NEWS_BACKFILL_GRACE_DAYS * DAY_MS)) : null;
  fetchedRaw.forEach((raw) => {
    const id = newsItemId(raw.sourceId);
    if (seenIds.has(id)) return; // 同じ取得の中で2回出た（ページの境目で記事がずれた）→ 1件にする
    seenIds.add(id);
    const fresh = buildNewsItem(raw, { fetchedAt: nowIso });
    const old = byId.get(id);
    if (!old) {
      byId.set(id, fresh);
      if (!previousItems.length) return; // 初回：全部が「新しく見つけた」になるので、新着としては数えない
      if (backfillLimit && fresh.publishedOn < backfillLimit) backfilled.push(id);
      else added.push(id);
      return;
    }
    // 同じ記事：タイトル・カテゴリ・日付が変わっていたら、公式の今の表示に合わせる（訂正の可能性の印を付ける）
    const changed = old.title !== fresh.title || old.publishedOn !== fresh.publishedOn || old.category !== fresh.category;
    byId.set(id, {
      ...fresh,
      fetchedAt: old.fetchedAt, // 初めて取得した日時は残す
      lastSeenAt: nowIso,
      ...(changed ? { titleRevised: true, revisedAt: nowIso } : old.titleRevised ? { titleRevised: true, revisedAt: old.revisedAt } : {}),
    });
    if (changed) revised.push(id);
  });
  // 今回読んだ範囲（いちばん古い日付より新しい日）にあるはずの前の記事が見当たらない → 削除・差し替えの可能性（消さずに印）
  const fetchedDates = fetchedRaw.map((raw) => raw.publishedOn).sort();
  const oldestRead = fetchedDates[0] ?? null;
  const missing = [];
  if (oldestRead) {
    byId.forEach((item, id) => {
      if (!seenIds.has(id) && item.publishedOn > oldestRead) {
        byId.set(id, { ...item, missingFromList: true });
        missing.push(id);
      }
    });
  }
  // 古い記事を外す（期間・件数）
  const keepFrom = japanDateOf(new Date(now.getTime() - NEWS_KEEP_DAYS * DAY_MS));
  const items = [...byId.values()]
    .filter((item) => item.publishedOn >= keepFrom)
    .sort((a, b) => (a.publishedOn === b.publishedOn ? newsSourceNumber(b.id) - newsSourceNumber(a.id) : a.publishedOn < b.publishedOn ? 1 : -1))
    .slice(0, NEWS_KEEP_MAX_ITEMS);
  const keptOut = byId.size - items.length;
  return { items, report: { added, backfilled, revised, missing, keptOut } };
}

function newsSourceNumber(id) {
  return Number(String(id).replace(/^equal-love-news-/, "")) || 0;
}

// ---- 確認待ちの候補（既存の図鑑は書き換えない） ----
// 公式の DISCOGRAPHY にあって、アプリの CD・特典映像図鑑（js/data/cdBonus.js の officialUrl）に無い作品
export function knownDiscographyIdsFrom(cdBonusModule) {
  const text = JSON.stringify(cdBonusModule ?? {});
  return new Set([...text.matchAll(/equal-love\.jp\/discography\/detail\/(\d+)/g)].map((match) => Number(match[1])));
}

export function buildReleaseCandidates({ discographyItems = [], knownIds = new Set(), previousCandidates = [], now = new Date() }) {
  const nowIso = now.toISOString();
  const previousById = new Map(previousCandidates.map((candidate) => [candidate.sourceId, candidate]));
  return discographyItems
    .filter((item) => !knownIds.has(item.sourceId))
    .map((item) => ({
      kind: "discography",
      sourceId: item.sourceId,
      title: item.title,
      workKind: item.kind,
      releaseOn: item.releaseOn,
      url: item.url,
      // 何が確かか：公式の DISCOGRAPHY の作品名・種類・発売日。何が確認待ちか：収録内容・特典映像・TYPE ごとの中身
      confirmed: ["作品名", "種類", "発売日"].filter((label, index) => [item.title, item.kind, item.releaseOn][index]),
      needsReview: "収録曲・特典映像・TYPE ごとの中身は、公式の作品のページで確かめてから図鑑に足す",
      firstSeenAt: previousById.get(item.sourceId)?.firstSeenAt ?? nowIso,
    }));
}

// ---- 検査（公開してよいか） ----
export function checkNewsPublication({ data, firstPageCount, problems = [], previous = null, now = new Date(), memberIds = null }) {
  const errors = [];
  const warnings = [];
  const shape = validateOfficialNewsData(data, { now, memberIds });
  if (!shape.ok) errors.push(...shape.errors);
  if (firstPageCount < NEWS_MIN_ITEMS_ON_FIRST_PAGE) errors.push(`1ページ目の記事が ${firstPageCount} 件（いつもは10件）。公式サイトの形が変わった可能性`);
  if (problems.length > Math.max(2, firstPageCount * 0.3)) errors.push(`読めない記事が ${problems.length} 件`);
  else if (problems.length) warnings.push(`読めない記事が ${problems.length} 件（${problems.slice(0, 3).map((problem) => `${problem.sourceId}：${problem.reason}`).join("／")}）`);
  const previousCount = Array.isArray(previous?.items) ? previous.items.length : 0;
  const items = Array.isArray(data?.items) ? data.items : [];
  if (previousCount >= 10 && items.length < previousCount * NEWS_SUDDEN_DROP_RATIO) errors.push(`件数の急減（前 ${previousCount} 件 → ${items.length} 件）`);
  const newestNow = items.map((item) => item.publishedOn).sort().at(-1) ?? null;
  const newestBefore = (previous?.items ?? []).map((item) => item.publishedOn).sort().at(-1) ?? null;
  if (newestNow && newestBefore && newestNow < newestBefore) errors.push(`いちばん新しい発表日が前より古い（${newestBefore} → ${newestNow}）`);
  if (items.some((item) => item.publishedOn < OFFICIAL_NEWS_EARLIEST_DATE)) errors.push("結成より前の日付がある");
  return { ok: errors.length === 0, errors, warnings };
}

// 公開のしかたを決める
// - fresh.ok：取り直したデータを書く
// - 失敗して前のデータ（形が正しい）がある：前のデータに「直近の取得は失敗」の印を付けて書く（前の記事は壊さない・消さない）
// - 失敗して前のデータも無い：何も書かない（アプリは「まだ取得できていません」）
export function decideNewsPublication({ fresh, previous = null, now = new Date(), memberIds = null }) {
  const attemptAt = now.toISOString();
  if (fresh?.ok) return { action: "write-fresh", alert: false, reason: "取り直したデータで公開", data: fresh.data };
  const error = String(fresh?.error ?? "不明な失敗").slice(0, 300);
  const previousUsable = previous && validateOfficialNewsData(previous, { now, memberIds }).ok;
  if (previousUsable) {
    const failures = Number(previous.lastAttempt?.ok === false ? previous.lastAttempt.consecutiveFailures ?? 1 : 0) + 1;
    return {
      action: "write-previous",
      alert: true,
      reason: `取得に失敗（${error}）。前のデータ（${previous.fetchedAt} に取得）のまま公開`,
      data: { ...previous, lastAttempt: { at: attemptAt, ok: false, error, consecutiveFailures: failures } },
    };
  }
  return { action: "write-nothing", alert: true, reason: `取得に失敗（${error}）し、前のデータも無い。データなしで公開`, data: null };
}

// 取り直したデータを組み立てる
export function buildOfficialNewsData({ fetchedRaw, previous = null, discographyItems = null, knownDiscographyIds = new Set(), discographyError = null, now = new Date(), pagesRead = 0, partialError = null }) {
  const previousItems = Array.isArray(previous?.items) ? previous.items : [];
  const { items, report } = mergeNewsItems({ previousItems, fetchedRaw, now, previousFetchedAt: previous?.fetchedAt ?? null });
  const candidates = discographyItems
    ? buildReleaseCandidates({ discographyItems, knownIds: knownDiscographyIds, previousCandidates: previous?.candidates ?? [], now })
    : Array.isArray(previous?.candidates)
      ? previous.candidates
      : [];
  const nowIso = now.toISOString();
  const data = {
    schema: OFFICIAL_NEWS_SCHEMA,
    source: { name: "＝LOVE 公式サイト NEWS", url: `${OFFICIAL_SITE_ORIGIN}/news/`, discographyUrl: `${OFFICIAL_SITE_ORIGIN}/discography/` },
    fetchedAt: nowIso,
    lastAttempt: { at: nowIso, ok: true, error: null, consecutiveFailures: 0, pagesRead, partialError, discographyError },
    items,
    candidates,
  };
  const newCandidates = candidates.filter((candidate) => !(previous?.candidates ?? []).some((old) => old.sourceId === candidate.sourceId));
  return { data, report: { ...report, newCandidates: newCandidates.map((candidate) => candidate.sourceId) } };
}

// 次のページを読むか：新しい記事があり、次のページがあり、上限より前
export function shouldReadNextPage({ pageItems, hasNext, pageNumber, knownIds }) {
  if (!hasNext || pageNumber >= NEWS_MAX_PAGES) return false;
  return pageItems.some((item) => !knownIds.has(newsItemId(item.sourceId)));
}

// 最後に読んだページ（10件）の中に、前のデータに無い記事が残っていたか
export function hasUnreadNewItems({ fetchedRaw, knownIds, pagesRead }) {
  const lastPage = fetchedRaw.slice(Math.max(0, (pagesRead - 1) * 10));
  return lastPage.some((item) => !knownIds.has(newsItemId(item.sourceId)));
}

// Issue の本文（本文・キーは入れない）
export function describeNewsRefreshForIssue({ decision, check, report, trigger, runUrl, warnings = [] }) {
  const lines = [`＝LOVE 最新情報（公式サイトの NEWS）の自動取得で、確認が必要なことがありました（${trigger}）。`, "", `- 結果：${decision.reason}`];
  if (check && !check.ok) lines.push(`- 検査で見つかったこと：${check.errors.join("／")}`);
  warnings.forEach((warning) => lines.push(`- 注意：${warning}`));
  if (report?.missing?.length) lines.push(`- 公式の一覧から見当たらなくなった記事（削除・差し替えの可能性）：${report.missing.join(", ")}`);
  if (report?.newCandidates?.length) lines.push(`- アプリの CD・特典映像図鑑にまだ無い公式の作品（確認待ち）：DISCOGRAPHY ${report.newCandidates.join(", ")}`);
  if (runUrl) lines.push(`- 実行の記録：${runUrl}`);
  lines.push("", "YouTube 出演図鑑の自動更新とは別の知らせです。対処のしかたは scripts/news/README.md の「困ったとき」を見てください。");
  return lines.join("\n");
}
