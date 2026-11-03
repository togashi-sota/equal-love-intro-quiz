// 「＝LOVE 最新情報」のデータの読み込みと検査（2026-11-03新設・R11 D）。
//
// 【しくみ】
// - 公式サイト（equal-love.jp）の NEWS の一覧から、タイトル・発表日・カテゴリ・URL だけを集めたファイル
//   data/official-news.json を読む。このファイルは git に入れない（scripts/news/refresh-news.mjs が公開のたびに作り、Pages にだけ載せる）
// - 本文・画像は持たない（公式へのリンクだけ）。利用者の端末から公式サイトへは取りに行かない
// - 取得が止まっていても、前に取れた情報は出す。ただし「最後に取れた日時」と「止まっていること」を必ず一緒に出す
// - Service Worker はこのファイルを network-first で扱う（sw.js）
// DOM には触れない（テスト・質問AIから直接呼べるように）。
//
// 【ほかの機能へ渡す形】getOfficialNewsSnapshot() が返す値（質問AIの担当がこの形を前提にしている）
//   { state, items: [{ id, title, publishedOn, category, memberIds, url, source, fetchedAt, ...追加の項目 }], fetchedAt, error, ...追加の項目 }
//   - state：下の OFFICIAL_NEWS_STATE。items が入っているのは READY と STALE（古いが表示はしてよい）のときだけ
//   - category：カテゴリのキー（OFFICIAL_NEWS_CATEGORIES の key。例 "media"）。表示名は categoryLabel
//   - memberIds：タイトルに名前がある ＝LOVE のメンバーの id（js/data/members.js）。グループ全体・不明は空の配列（scope で区別）
//   - fetchedAt（各項目）：その記事を初めて取得した日時。全体の fetchedAt：最後に取得に成功した日時
export const OFFICIAL_NEWS_DATA_PATH = "data/official-news.json";
export const OFFICIAL_NEWS_SCHEMA = 1;
// 最後の取得の成功からこの日数を過ぎたら「更新が止まっています」（自動の取得は週2回＝最大4日ほど空く）
export const OFFICIAL_NEWS_STALE_DAYS = 8;
export const OFFICIAL_SITE_ORIGIN = "https://equal-love.jp";
export const OFFICIAL_NEWS_LIST_URL = "https://equal-love.jp/news/";
const DAY_MS = 24 * 60 * 60 * 1000;

export const OFFICIAL_NEWS_STATE = Object.freeze({
  IDLE: "idle", // まだ読んでいない
  LOADING: "loading",
  READY: "ready", // 読めて、新しい
  STALE: "stale", // 読めたが、最後の取得から日が経っている（表示はする。止まっていることを出す）
  MISSING: "missing", // ファイルが無い（まだ一度も取得できていない）
  INVALID: "invalid", // 形が壊れている（中身は出さない）
  ERROR: "error", // 通信できない（オフラインで前のファイルも無い）
});

// 公式サイトの NEWS のカテゴリ（2026-11-03 の一覧のページ：cat4〜cat10）。key はアプリの中の名前（変えない）
export const OFFICIAL_NEWS_CATEGORIES = Object.freeze([
  { key: "notice", label: "お知らせ", siteClass: "cat4" },
  { key: "meet", label: "握手会・お話し会", siteLabel: "握手会", siteClass: "cat5" },
  { key: "live-event", label: "ライブ・イベント", siteLabel: "ライブ/イベント", siteClass: "cat6" },
  { key: "media", label: "メディア", siteClass: "cat7" },
  { key: "release", label: "リリース", siteClass: "cat8" },
  { key: "goods", label: "グッズ", siteClass: "cat9" },
  { key: "other", label: "その他", siteClass: "cat10" },
]);
const CATEGORY_KEYS = new Set(OFFICIAL_NEWS_CATEGORIES.map((category) => category.key));

// タイトルから付ける印（分かる範囲だけ。本文は読まない）
export const OFFICIAL_NEWS_FLAGS = Object.freeze({
  correction: "訂正",
  postponed: "延期",
  cancelled: "中止",
  changed: "変更",
  ended: "終了",
});
const FLAG_KEYS = new Set(Object.keys(OFFICIAL_NEWS_FLAGS));
// scope：group＝＝LOVE 全体（※＝LOVE など）／members＝メンバーの名前がある／unknown＝タイトルからは分からない
const SCOPES = new Set(["group", "members", "unknown"]);
const ID_PATTERN = /^equal-love-news-\d{1,9}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NEWS_URL_PATTERN = /^https:\/\/equal-love\.jp\/news\/detail\/\d{1,9}$/;
const DISCOGRAPHY_URL_PATTERN = /^https:\/\/equal-love\.jp\/discography\/detail\/\d{1,9}\/$/;
export const OFFICIAL_NEWS_EARLIEST_DATE = "2017-01-01"; // ＝LOVE の結成より前の日付は取り違え

export function categoryLabelOf(key) {
  return OFFICIAL_NEWS_CATEGORIES.find((category) => category.key === key)?.label ?? "その他";
}

// 日本時間の「今日」（YYYY-MM-DD）
export function japanDateOf(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isRealDate(text) {
  if (!DATE_PATTERN.test(String(text))) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text;
}

// 形の検査。アプリの表示の前と、公開の前（scripts/news/refresh-news.mjs）の両方で使う
export function validateOfficialNewsData(data, { now = new Date(), memberIds = null } = {}) {
  const errors = [];
  if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false, errors: ["データが JSON のオブジェクトではない"] };
  if (data.schema !== OFFICIAL_NEWS_SCHEMA) errors.push(`schema が ${OFFICIAL_NEWS_SCHEMA} ではない`);
  const fetched = Date.parse(data.fetchedAt ?? "");
  if (!Number.isFinite(fetched)) errors.push("fetchedAt（最後に取得できた日時）が無い");
  else if (fetched > now.getTime() + DAY_MS) errors.push("fetchedAt が未来の日時");
  if (!Array.isArray(data.items)) {
    errors.push("items が配列ではない");
    return { ok: false, errors };
  }
  const latestAllowed = japanDateOf(new Date(now.getTime() + DAY_MS));
  const seen = new Set();
  data.items.forEach((item, index) => {
    const where = `items[${index}]`;
    if (!item || typeof item !== "object") return errors.push(`${where} がオブジェクトではない`);
    if (!ID_PATTERN.test(String(item.id))) errors.push(`${where}.id の形`);
    if (seen.has(item.id)) errors.push(`${where}.id が重なる`);
    seen.add(item.id);
    if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 300) errors.push(`${where}.title`);
    if (!isRealDate(item.publishedOn)) errors.push(`${where}.publishedOn の形`);
    else if (item.publishedOn < OFFICIAL_NEWS_EARLIEST_DATE || item.publishedOn > latestAllowed) errors.push(`${where}.publishedOn がありえない日付`);
    if (!CATEGORY_KEYS.has(item.category)) errors.push(`${where}.category`);
    if (!NEWS_URL_PATTERN.test(String(item.url))) errors.push(`${where}.url が公式の記事ではない`);
    if (!Array.isArray(item.memberIds)) errors.push(`${where}.memberIds が配列ではない`);
    else if (memberIds && item.memberIds.some((memberId) => !memberIds.has(memberId))) errors.push(`${where} に知らないメンバー`);
    if (!SCOPES.has(item.scope)) errors.push(`${where}.scope`);
    if (!Array.isArray(item.flags) || item.flags.some((flag) => !FLAG_KEYS.has(flag))) errors.push(`${where}.flags`);
    if (!Number.isFinite(Date.parse(item.fetchedAt ?? ""))) errors.push(`${where}.fetchedAt`);
    if ("body" in item || "description" in item || "image" in item) errors.push(`${where} に本文・画像がある（持たない約束）`);
  });
  if (data.candidates !== undefined) {
    if (!Array.isArray(data.candidates)) errors.push("candidates が配列ではない");
    else
      data.candidates.forEach((candidate, index) => {
        if (!candidate || typeof candidate !== "object" || typeof candidate.title !== "string" || !DISCOGRAPHY_URL_PATTERN.test(String(candidate.url ?? ""))) errors.push(`candidates[${index}] の形`);
        else if (candidate.releaseOn !== null && !isRealDate(candidate.releaseOn)) errors.push(`candidates[${index}].releaseOn の形`);
      });
  }
  return { ok: errors.length === 0, errors: errors.slice(0, 20) };
}

// 取得が止まっているか（最後の成功からの日数）
export function officialNewsAgeDays(data, now = new Date()) {
  const fetched = Date.parse(data?.fetchedAt ?? "");
  return Number.isFinite(fetched) ? (now.getTime() - fetched) / DAY_MS : null;
}

// 画面・質問AIへ渡す項目の形（ファイルの項目から、決まった項目だけを写す）
function toSnapshotItem(item) {
  return {
    id: item.id,
    title: item.title,
    publishedOn: item.publishedOn,
    category: item.category,
    categoryLabel: categoryLabelOf(item.category),
    memberIds: [...item.memberIds],
    scope: item.scope,
    otherGroups: Array.isArray(item.otherGroups) ? [...item.otherGroups] : [],
    flags: [...item.flags],
    url: item.url,
    source: item.source ?? "equal-love.jp NEWS",
    fetchedAt: item.fetchedAt,
    lastSeenAt: item.lastSeenAt ?? item.fetchedAt,
    titleRevised: Boolean(item.titleRevised),
    missingFromList: Boolean(item.missingFromList),
  };
}

const EMPTY = Object.freeze({ items: [], candidates: [], fetchedAt: null, lastAttempt: null, ageDays: null });

// 読み込んだ JSON から、画面に出してよい形を作る（壊れたものは items を空にする）
export function interpretOfficialNewsData(data, { now = new Date(), memberIds = null } = {}) {
  const check = validateOfficialNewsData(data, { now, memberIds });
  if (!check.ok) return { ...EMPTY, state: OFFICIAL_NEWS_STATE.INVALID, error: check.errors.join("／") };
  const ageDays = officialNewsAgeDays(data, now);
  const items = data.items.map(toSnapshotItem).sort((a, b) => (a.publishedOn === b.publishedOn ? b.id.localeCompare(a.id, "en", { numeric: true }) : a.publishedOn < b.publishedOn ? 1 : -1));
  return {
    state: ageDays >= OFFICIAL_NEWS_STALE_DAYS ? OFFICIAL_NEWS_STATE.STALE : OFFICIAL_NEWS_STATE.READY,
    items,
    candidates: Array.isArray(data.candidates) ? data.candidates.map((candidate) => ({ ...candidate })) : [],
    fetchedAt: data.fetchedAt,
    lastAttempt: data.lastAttempt && typeof data.lastAttempt === "object" ? { ...data.lastAttempt } : null,
    ageDays,
    error: null,
  };
}

// ---- 読み込み（アプリ） ----
let snapshot = { ...EMPTY, state: OFFICIAL_NEWS_STATE.IDLE, error: null };
let loading = null;
const listeners = new Set();

export function getOfficialNewsSnapshot() {
  return snapshot;
}

export function onOfficialNewsDataChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setSnapshot(next) {
  snapshot = next;
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error(error);
    }
  });
}

// options.fetchImpl：テストで差し替える。options.force：読み直す
export function loadOfficialNewsData({ fetchImpl = (url, init) => fetch(url, init), now = () => new Date(), memberIds = null, force = false } = {}) {
  if (loading && !force) return loading;
  if (!force && snapshot.state !== OFFICIAL_NEWS_STATE.IDLE && snapshot.state !== OFFICIAL_NEWS_STATE.ERROR) return Promise.resolve(snapshot);
  setSnapshot({ ...snapshot, state: OFFICIAL_NEWS_STATE.LOADING });
  loading = (async () => {
    try {
      const response = await fetchImpl(OFFICIAL_NEWS_DATA_PATH, { cache: "no-cache" });
      if (response.status === 404) {
        setSnapshot({ ...EMPTY, state: OFFICIAL_NEWS_STATE.MISSING, error: null });
      } else if (!response.ok) {
        setSnapshot({ ...EMPTY, state: OFFICIAL_NEWS_STATE.ERROR, error: `HTTP ${response.status}` });
      } else {
        let json;
        try {
          json = await response.json();
        } catch (error) {
          json = undefined;
        }
        setSnapshot(json === undefined ? { ...EMPTY, state: OFFICIAL_NEWS_STATE.INVALID, error: "JSON を読めない" } : interpretOfficialNewsData(json, { now: now(), memberIds }));
      }
    } catch (error) {
      setSnapshot({ ...EMPTY, state: OFFICIAL_NEWS_STATE.ERROR, error: String(error?.message ?? error) });
    } finally {
      loading = null;
    }
    return snapshot;
  })();
  return loading;
}

// テスト用：状態を直接入れる・初めに戻す
export function setOfficialNewsSnapshotForTest(next) {
  loading = null;
  setSnapshot(next ?? { ...EMPTY, state: OFFICIAL_NEWS_STATE.IDLE, error: null });
}
