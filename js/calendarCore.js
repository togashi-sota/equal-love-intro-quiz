// 「＝LOVEカレンダー」の中心（2026-11-24新設）。公式サイトの SCHEDULE の HTML を読み、予定のデータを作り、検査し、公開のしかたを決める。
// GitHub Actions（scripts/calendar/refresh-calendar.mjs）・アプリ（js/calendarData.js）・テスト（tests/calendar.test.js）から使う。
// DOM・ネットには触れない。
//
// 【調べたこと（2026-11-24）】
// - 公式の月のカレンダー：https://equal-love.jp/schedule/calender/{年}/{月}/（"calender" は公式の綴りのまま）。
//   2017年9月から読める。HTML の中に、日付のマス（<div class="cell"><span class="date">N</span>）と、
//   その日の予定（<a href="/schedule/detail/{ID}"><span class="cat">カテゴリ</span><span class="tit">タイトル</span>）がある
// - 詳細のページ：https://equal-love.jp/schedule/detail/{ID}。本文に【時　間】【出　演】【放送局】のような見出しがある
// - 公開の API・RSS は無い（ページの中の send() は、上の URL へ移るだけ）。robots.txt は禁止の場所なし。利用規約のページは見つからない
//
// 【決まり】
// - 持つのは事実だけ：予定の ID・日付・カテゴリ・タイトル（公式の表示のまま）・時間・放送局・出演・会場（詳細の見出しの値だけ）・公式の URL。
//   本文・画像・外のサイトへのリンクは持たない
// - 載せる日付は、公式のカレンダーで予定が置かれている日（＝開催日・放送日・発売日）。発表日（NEWS の日付）は使わない
// - 深夜の番組（24:45〜25:15 など）：日付は公式の放送日のまま。計算が要るときだけ actualStartOf() で翌日の 0:45 にする
// - 時間が書いていない予定に、00:00 などの時刻を付けない
// - 同じ予定は公式の ID で1件にする。タイトルが同じでも ID が違えば別の予定（昼・夜公演、別の会場、再放送、別の TYPE）
// - 「見えなくなった」だけで中止にしない（missing の印だけ）。中止・延期は、公式のタイトルに書いてあるときだけ
// - 前のデータは消さない（過去の予定は残す）。形がおかしい月は、前のデータのまま
import { MEMBERS } from "./data/members.js";
import { decodeHtml, detectNewsMembers, detectOtherGroups } from "./officialNewsCore.js";

export const CALENDAR_SCHEMA = 1;
export const CALENDAR_DATA_PATH = "data/official-schedule.json"; // 公開のたびに作る（git に入れない）
export const CALENDAR_SEED_PATH = "data/calendar/official-schedule-seed.json"; // 過去の分の土台（git に入れる・事実だけ）
export const CALENDAR_SOURCE_LABEL = "equal-love.jp SCHEDULE";
export const OFFICIAL_ORIGIN = "https://equal-love.jp";
export const SCHEDULE_EARLIEST_MONTH = "2017-09"; // 公式の SCHEDULE が読める最初の月（2026-11-24 確認）
export const CALENDAR_STALE_DAYS = 8;
// 定期の取得で読む月：今月の1か月前〜4か月先
export const REFRESH_MONTHS_BEFORE = 1;
export const REFRESH_MONTHS_AFTER = 4;
// 詳細のページを読む予定：今日の前日〜60日先、1回に最大25件
export const DETAIL_WINDOW_DAYS = 60;
export const DETAIL_MAX_PER_RUN = 25;
export const DETAIL_REFRESH_DAYS = 7;
// 前に予定が5件以上あった月が0件になったら、形が変わったとみなして前のままにする
export const MONTH_SUDDEN_EMPTY_MIN = 5;

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_TITLE = 200;
const MAX_FIELD = 120;

// ---- 公式のカテゴリ（2026-11-24 のページ：cat11〜cat16）と、アプリの分類 ----
export const SITE_CATEGORIES = Object.freeze([
  { key: "meet", siteClass: "cat11", siteLabel: "握手会" },
  { key: "live-event", siteClass: "cat12", siteLabel: "ライブ/イベント" },
  { key: "media", siteClass: "cat13", siteLabel: "メディア" },
  { key: "release", siteClass: "cat14", siteLabel: "リリース" },
  { key: "birthday", siteClass: "cat15", siteLabel: "誕生日" },
  { key: "other", siteClass: "cat16", siteLabel: "その他" },
]);

// アプリの分類（絞り込みと色の印）。公式の「メディア」は、タイトルの局の名前でテレビ・ラジオ・そのほかに分ける
export const CALENDAR_CATEGORIES = Object.freeze([
  { key: "live", label: "ライブ・イベント", short: "ライブ" },
  { key: "meet", label: "お話し会・握手会", short: "お話し会" },
  { key: "tv", label: "テレビ・配信番組", short: "テレビ" },
  { key: "radio", label: "ラジオ", short: "ラジオ" },
  { key: "media", label: "雑誌・Web・そのほかのメディア", short: "メディア" },
  { key: "release", label: "リリース", short: "リリース" },
  { key: "birthday", label: "誕生日", short: "誕生日" },
  { key: "anniversary", label: "＝LOVE の記念日", short: "記念日" }, // 【2026-11-26】結成・デビューの記念日（アプリのデータから作る。公式 SCHEDULE には無い）
  { key: "other", label: "その他", short: "その他" },
]);
const CATEGORY_KEYS = new Set(CALENDAR_CATEGORIES.map((category) => category.key));

// 状態。「開催済み」は保存しない（表示のときに今日と比べて決める）
export const EVENT_STATUS = Object.freeze({
  SCHEDULED: "scheduled",
  CHANGED: "changed", // 日時の変更を見つけた（公式の予定表で日付・時間が変わった）／タイトルに「変更」
  POSTPONED: "postponed", // タイトルに「延期」
  CANCELLED: "cancelled", // タイトルに「中止」「見合わせ」
  PENDING: "pending", // 確認待ち（詳細のページの日付と、カレンダーの日付が食い違う など）
});
const STATUS_VALUES = new Set(Object.values(EVENT_STATUS));

// ラジオ → テレビの順に見る（「NHK-FM」「TBSラジオ」をラジオにするため）
const RADIO_PATTERN = /ラジオ|ﾗｼﾞｵ|FM|AM放送|文化放送|ニッポン放送|bayfm|NACK5|J-WAVE|InterFM|radiko|超!A&G|A&G\+|ポッドキャスト|Podcast|Voicy/i;
const TV_PATTERN = /テレビ|TV|NHK|日テレ|フジ|TBS|テレ朝|テレ東|BS|CS|MX|ABEMA|地上波|FOD|Hulu|Lemino|U-NEXT|Prime\s*Video|Netflix|TVer|系[「『]|放送局/i;

// ---- 小さな道具（日付） ----
export function isIsoDate(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(text ?? ""))) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text;
}

export function toIsoDate(year, month, day) {
  const text = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return isIsoDate(text) ? text : null;
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthKeyOf(year, month) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key ?? ""));
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? { year: Number(match[1]), month } : null;
}

export function addMonths(key, delta) {
  const parsed = parseMonthKey(key);
  const index = parsed.year * 12 + (parsed.month - 1) + delta;
  return monthKeyOf(Math.floor(index / 12), (index % 12) + 1);
}

export function monthRange(fromKey, toKey) {
  const list = [];
  for (let key = fromKey; key <= toKey; key = addMonths(key, 1)) list.push(key);
  return list;
}

export function addDays(dateText, days) {
  return new Date(Date.parse(`${dateText}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// 日本時間の今日（YYYY-MM-DD）
export function japanToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// 曜日（0=日〜6=土）
export function weekdayOf(dateText) {
  return new Date(Date.parse(`${dateText}T00:00:00Z`)).getUTCDay();
}

export function scheduleMonthUrl(key) {
  const { year, month } = parseMonthKey(key);
  return `${OFFICIAL_ORIGIN}/schedule/calender/${year}/${month}/`;
}

export function scheduleDetailUrl(sourceId) {
  return `${OFFICIAL_ORIGIN}/schedule/detail/${Number(sourceId)}`;
}

// ---- HTML から文字だけを取り出す ----
function textOf(html) {
  return decodeHtml(String(html ?? "").replace(/<[^>]*>/g, " ")).replace(/[\s　]+/g, " ").trim();
}

function clip(text, max) {
  const value = String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function siteCategoryOf(classText, labelText) {
  const byClass = SITE_CATEGORIES.find((category) => new RegExp(`(^|\\s)${category.siteClass}(\\s|$)`).test(classText ?? ""));
  const label = String(labelText ?? "").trim();
  const byLabel = SITE_CATEGORIES.find((category) => category.siteLabel === label);
  if (byClass && (!label || byLabel === byClass)) return { key: byClass.key, unknown: false };
  if (byLabel && !byClass) return { key: byLabel.key, unknown: false };
  return { key: "other", unknown: true, siteLabel: label || classText || "" };
}

// ---- 月のカレンダーのページ ----
// 戻り値：{ ok, monthKey, items: [{ sourceId, date, siteCategory, unknownCategory, title }], problems, error }
// ok=false（形が変わった）：年月の見出しが違う・日付のマスが 1〜末日 そろっていない・カレンダーの場所が無い
export function parseScheduleMonthHtml(html, monthKey) {
  const expected = parseMonthKey(monthKey);
  const fail = (error) => ({ ok: false, monthKey, items: [], problems: [], error });
  const source = String(html ?? "");
  if (!expected) return fail("年月の指定が正しくない");
  const year = Number(/<span class="year">\s*(\d{4})\s*<\/span>/i.exec(source)?.[1]);
  const month = Number(/<span class="month">\s*(\d{1,2})\s*<\/span>/i.exec(source)?.[1]);
  if (year !== expected.year || month !== expected.month) return fail(`見出しの年月が違う（${year || "?"}年${month || "?"}月）`);
  const bodyStart = source.indexOf('class="calendarBody"');
  if (bodyStart < 0) return fail("カレンダーの場所（calendarBody）が見つからない");
  const body = source.slice(bodyStart);
  // 日付のマスごとに分ける
  const cells = body.split(/<div class="cell">/i).slice(1);
  if (cells.length < 28) return fail(`日付のマスが少なすぎる（${cells.length}）`);
  const items = [];
  const problems = [];
  const seenDays = [];
  for (const cell of cells) {
    const dayText = /<span class="date">\s*(\d{0,2})\s*<\/span>/i.exec(cell)?.[1];
    if (dayText === undefined) return fail("日付のマスに日付の場所が無い");
    if (dayText === "") continue; // 前後の月の空きマス
    const day = Number(dayText);
    seenDays.push(day);
    const date = toIsoDate(expected.year, expected.month, day);
    if (!date) return fail(`ありえない日付（${day}日）`);
    const entry = /<div class="([^"]*)">\s*<a\s[^>]*href="(?:https:\/\/equal-love\.jp)?\/schedule\/detail\/(\d{1,9})"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = entry.exec(cell))) {
      const sourceId = Number(match[2]);
      const inner = match[3];
      const catHtml = /<span class="cat">([\s\S]*?)<\/span>/i.exec(inner)?.[1];
      const titHtml = /<span class="tit">([\s\S]*?)<\/span>/i.exec(inner)?.[1];
      if (titHtml === undefined) {
        problems.push({ sourceId, date, reason: "タイトルの場所が見つからない" });
        continue;
      }
      const title = clip(textOf(titHtml), MAX_TITLE);
      if (!title) {
        problems.push({ sourceId, date, reason: "タイトルが空" });
        continue;
      }
      const category = siteCategoryOf(match[1], textOf(catHtml ?? ""));
      items.push({ sourceId, date, siteCategory: category.key, unknownCategory: category.unknown ? category.siteLabel : null, title });
    }
  }
  const lastDay = daysInMonth(expected.year, expected.month);
  const complete = seenDays.length === lastDay && seenDays.every((day, index) => day === index + 1);
  if (!complete) return fail(`日付のマスが1〜${lastDay}日そろっていない（${seenDays.length}マス）`);
  return { ok: true, monthKey, items, problems, error: null };
}

// ---- 詳細のページ ----
// 見出し（【時　間】など）の値のうち、決めたものだけを取る。本文の文章は取らない
const DETAIL_FIELD_RULES = [
  { field: "time", pattern: /^(時間|放送時間|配信時間|放送日時|時刻|開演|開演時間|公演時間|開催時間)$/ },
  { field: "station", pattern: /^(放送局|放送|放送媒体|チャンネル|配信|配信先|媒体|局)$/ },
  { field: "performers", pattern: /^(出演|出演者|出演メンバー|参加メンバー|参加者)$/ },
  { field: "venue", pattern: /^(会場|場所|開催場所|開催会場)$/ },
  { field: "dateLabel", pattern: /^(放送日|日程|開催日|日時|配信日|発売日|公開日|開催日時|公演日)$/ },
];

// 戻り値：{ ok, sourceId?, date, title, siteCategory, fields: { time, station, performers, venue, dateLabel }, error }
export function parseScheduleDetailHtml(html) {
  const source = String(html ?? "");
  const start = source.indexOf('class="infoDetail"');
  if (start < 0) return { ok: false, error: "詳細の場所（infoDetail）が見つからない" };
  const detail = source.slice(start);
  const md = /<span class="md">\s*(\d{1,2})\.(\d{1,2})\s*<\/span>/i.exec(detail);
  const yearMatch = /<span class="year">[^<]*?(\d{4})\s*<\/span>/i.exec(detail);
  const date = md && yearMatch ? toIsoDate(yearMatch[1], md[1], md[2]) : null;
  const titleHtml = /<p class="tit">([\s\S]*?)<\/p>/i.exec(detail)?.[1];
  const catMatch = /<span class="(cat\d+)">([^<]*)<\/span>/i.exec(detail);
  const fields = {};
  // 本文の段落（<p>…</p>）のうち「【見出し】値」の形のものだけ
  const paragraph = /<p>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = paragraph.exec(detail))) {
    const text = textOf(match[1]).normalize("NFKC");
    const heading = /^【([^】]{1,12})】\s*(.*)$/.exec(text);
    if (!heading) continue;
    const key = heading[1].replace(/[\s　]/g, "");
    const rule = DETAIL_FIELD_RULES.find((candidate) => candidate.pattern.test(key));
    if (!rule || fields[rule.field]) continue;
    const value = clip(heading[2], MAX_FIELD);
    if (value) fields[rule.field] = value;
  }
  return {
    ok: Boolean(date && titleHtml !== undefined),
    date,
    title: clip(textOf(titleHtml ?? ""), MAX_TITLE),
    siteCategory: catMatch ? siteCategoryOf(catMatch[1], textOf(catMatch[2])).key : null,
    fields,
    error: date ? null : "詳細の日付が読めない",
  };
}

// ---- 時間 ----
// 「24:45〜25:15」「18:00〜」「開場17:00／開演18:00」→ { label, start, end }。読み取れない形は label だけ（時刻を作らない）
export function parseTimeLabel(label) {
  const text = clip(String(label ?? "").normalize("NFKC"), 60);
  if (!text) return null;
  const hhmm = (h, m) => (Number(h) <= 29 && Number(m) <= 59 ? `${String(Number(h)).padStart(2, "0")}:${m}` : null);
  const open = /開演\s*(\d{1,2}):(\d{2})/.exec(text);
  if (open) return { label: text, start: hhmm(open[1], open[2]), end: null };
  const range = /^(?:\D{0,6}?)\s*(\d{1,2}):(\d{2})\s*[〜~～\-－ー]\s*(?:(\d{1,2}):(\d{2}))?\s*(?:頃|ごろ|予定)?$/.exec(text);
  if (range) return { label: text, start: hhmm(range[1], range[2]), end: range[3] ? hhmm(range[3], range[4]) : null };
  const single = /^(?:\D{0,6}?)\s*(\d{1,2}):(\d{2})\s*(?:頃|ごろ|予定|〜|~|～)?$/.exec(text);
  if (single) return { label: text, start: hhmm(single[1], single[2]), end: null };
  // 「05:50~09:00 ※08:00台生出演予定」：先頭の放送時間だけを並べ替えに使う（表示は label のまま全部）
  const leading = /^(\d{1,2}):(\d{2})\s*[〜~～]\s*(?:(\d{1,2}):(\d{2}))?(?=\s|※|$)/.exec(text);
  if (leading) return { label: text, start: hhmm(leading[1], leading[2]), end: leading[3] ? hhmm(leading[3], leading[4]) : null };
  return { label: text, start: null, end: null };
}

// 深夜の番組：公式の放送日（date）と「24:45」→ 実際の日時 { date: 翌日, time: "00:45" }。時刻が無ければ null
export function actualStartOf(date, start) {
  if (!isIsoDate(date) || !/^\d{2}:\d{2}$/.test(String(start ?? ""))) return null;
  const [hours, minutes] = start.split(":").map(Number);
  if (hours < 24) return { date, time: start };
  return { date: addDays(date, 1), time: `${String(hours - 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}` };
}

// ---- 分類・メンバー・状態 ----
export function classifyEvent(siteCategory, title, station = "") {
  if (siteCategory === "meet") return "meet";
  if (siteCategory === "live-event") return "live";
  if (siteCategory === "release") return "release";
  if (siteCategory === "birthday") return "birthday";
  if (siteCategory === "media") {
    const text = `${title} ${station}`.normalize("NFKC");
    if (RADIO_PATTERN.test(text)) return "radio";
    if (TV_PATTERN.test(text)) return "tv";
    return "media";
  }
  return "other";
}

// タイトル（※の後ろ）と、詳細の【出演】から ＝LOVE のメンバーを探す。≠ME・≒JOY のメンバーは名前の一覧に無いので数えない
export function detectEventMembers(title, performers = "") {
  return [...new Set([...detectNewsMembers(title), ...detectNewsMembers(performers)])];
}

// group：※＝LOVE ／【出演】が ＝LOVE だけ／members：メンバーの名前がある／unknown：分からない（勝手に名前を付けない）
export function detectEventScope(title, performers = "", memberIds = []) {
  if (memberIds.length) return "members";
  const titleText = String(title ?? "").normalize("NFKC");
  const performerText = String(performers ?? "").normalize("NFKC").replace(/\s/g, "");
  if (/※\s*=LOVE(?![A-Za-z])/.test(titleText) || /^=LOVE$/.test(performerText)) return "group";
  return "unknown";
}

export function statusFromTitle(title) {
  const text = String(title ?? "");
  if (/中止|開催見合わせ|公演見合わせ|放送見合わせ/.test(text)) return EVENT_STATUS.CANCELLED;
  if (/延期/.test(text)) return EVENT_STATUS.POSTPONED;
  if (/変更/.test(text)) return EVENT_STATUS.CHANGED;
  return null;
}

// ---- データを作る ----
// 1件の予定（保存する形）
function eventFromParts({ sourceId, dates, title, siteCategory, detail, previous, nowIso }) {
  const fields = detail?.fields ?? previous?.detail ?? {};
  const performers = fields.performers ?? "";
  const station = fields.station ?? "";
  const memberIds = detectEventMembers(title, performers);
  const time = fields.time ? parseTimeLabel(fields.time) : null;
  const event = {
    id: `els-${sourceId}`,
    sourceId,
    dates,
    title,
    siteCategory,
    category: classifyEvent(siteCategory, title, station),
    memberIds,
    scope: detectEventScope(title, performers, memberIds),
    otherGroups: detectOtherGroups(`${title} ${performers}`),
    time,
    detail: Object.keys(fields).length ? { ...fields } : null,
    status: EVENT_STATUS.SCHEDULED,
    missing: false,
    history: previous?.history ? [...previous.history] : [],
    url: scheduleDetailUrl(sourceId),
    firstSeenAt: previous?.firstSeenAt ?? nowIso,
    updatedAt: previous?.updatedAt ?? nowIso,
    detailFetchedAt: detail ? nowIso : previous?.detailFetchedAt ?? null,
  };
  // 詳細のページの日付が、カレンダーの日付のどれとも違う → 確認待ち
  const detailDate = detail?.date ?? null;
  event.pendingReason = detailDate && !dates.includes(detailDate) ? `詳細のページの日付（${detailDate}）とカレンダーの日付が違う` : previous && !detail ? previous.pendingReason ?? null : null;
  return event;
}

function sameList(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function decideStatus(event) {
  const fromTitle = statusFromTitle(event.title);
  if (fromTitle === EVENT_STATUS.CANCELLED || fromTitle === EVENT_STATUS.POSTPONED) return fromTitle;
  if (event.pendingReason) return EVENT_STATUS.PENDING;
  if (fromTitle === EVENT_STATUS.CHANGED || event.history.some((entry) => entry.field === "dates" || entry.field === "time")) return EVENT_STATUS.CHANGED;
  return EVENT_STATUS.SCHEDULED;
}

// 前のデータ（土台と公開中のデータ）を1つにする。同じ ID は更新日時の新しい方
export function mergePreviousSources(...sources) {
  const byId = new Map();
  const months = {};
  for (const data of sources) {
    if (!data || !Array.isArray(data.events)) continue;
    for (const event of data.events) {
      const current = byId.get(event.id);
      if (!current || String(event.updatedAt ?? "") > String(current.updatedAt ?? "")) byId.set(event.id, event);
    }
    for (const [key, at] of Object.entries(data.months ?? {})) if (!months[key] || at > months[key]) months[key] = at;
  }
  return { events: [...byId.values()], months };
}

// fetchedMonths：[{ monthKey, ok, items }]（ok=false の月は前のまま）／details：Map<sourceId, 詳細の読み取り結果>
// 戻り値：{ data, report: { added, changed, missing, keptMonths, suspiciousMonths } }
export function buildCalendarData({ previous = null, fetchedMonths = [], details = new Map(), now = new Date(), lastAttempt = null }) {
  const nowIso = now.toISOString();
  const base = previous ?? { events: [], months: {} };
  const previousById = new Map(base.events.map((event) => [event.id, event]));
  const months = { ...(base.months ?? {}) };
  const report = { added: [], changed: [], missing: [], restored: [], keptMonths: [], suspiciousMonths: [] };

  // 前のデータで、その月に何件あったか（急に0件になった月を見つける）
  const previousCountInMonth = (monthKey) => base.events.filter((event) => !event.missing && event.dates.some((date) => date.startsWith(monthKey))).length;
  const acceptedMonths = new Set();
  for (const month of fetchedMonths) {
    if (!month.ok) {
      report.keptMonths.push({ monthKey: month.monthKey, reason: month.error ?? "読めない" });
      continue;
    }
    if (month.items.length === 0 && previousCountInMonth(month.monthKey) >= MONTH_SUDDEN_EMPTY_MIN) {
      report.suspiciousMonths.push(month.monthKey);
      continue;
    }
    acceptedMonths.add(month.monthKey);
    months[month.monthKey] = nowIso;
  }
  const inAccepted = (date) => acceptedMonths.has(date.slice(0, 7));

  // 今回読めた月の中での、ID ごとの日付とタイトル
  const fresh = new Map();
  for (const month of fetchedMonths) {
    if (!acceptedMonths.has(month.monthKey)) continue;
    for (const item of month.items) {
      const entry = fresh.get(item.sourceId) ?? { dates: new Set(), title: item.title, siteCategory: item.siteCategory };
      entry.dates.add(item.date);
      fresh.set(item.sourceId, entry);
    }
  }

  const events = [];
  const handled = new Set();
  for (const [sourceId, entry] of fresh) {
    const id = `els-${sourceId}`;
    handled.add(id);
    const old = previousById.get(id) ?? null;
    // 今回読んでいない月にある日付（月をまたぐ予定）は、前のまま残す
    const keptDates = old ? old.dates.filter((date) => !inAccepted(date)) : [];
    const dates = [...new Set([...entry.dates, ...keptDates])].sort();
    const event = eventFromParts({ sourceId, dates, title: entry.title, siteCategory: entry.siteCategory, detail: details.get(sourceId) ?? null, previous: old, nowIso });
    if (!old) {
      report.added.push(id);
      event.updatedAt = nowIso;
    } else {
      const changes = [];
      if (!sameList(old.dates, dates)) changes.push({ field: "dates", from: old.dates.join(","), to: dates.join(",") });
      if (old.title !== event.title) changes.push({ field: "title", from: old.title, to: event.title });
      if ((old.time?.label ?? null) !== (event.time?.label ?? null) && old.time?.label && event.time?.label) changes.push({ field: "time", from: old.time.label, to: event.time.label });
      if (old.missing) report.restored.push(id);
      if (changes.length) {
        event.history.push(...changes.map((change) => ({ at: nowIso, ...change })));
        event.history = event.history.slice(-10);
        report.changed.push({ id, changes });
      }
      const detailChanged = JSON.stringify(old.detail ?? null) !== JSON.stringify(event.detail ?? null);
      if (changes.length || old.missing || detailChanged || old.category !== event.category || old.siteCategory !== event.siteCategory) event.updatedAt = nowIso;
    }
    event.status = decideStatus(event);
    events.push(event);
  }

  // 今回は見つからなかった前の予定：消さない。読んだ月の中だけにあった予定なら「見えなくなった」の印（中止とは決めない）
  for (const old of base.events) {
    if (handled.has(old.id)) continue;
    const allInAccepted = old.dates.length > 0 && old.dates.every(inAccepted);
    if (allInAccepted && !old.missing) {
      report.missing.push(old.id);
      events.push({ ...old, missing: true, updatedAt: nowIso, history: [...(old.history ?? []), { at: nowIso, field: "missing", from: "", to: "公式の予定表に見当たらない" }].slice(-10) });
    } else {
      events.push(old);
    }
  }

  events.sort((a, b) => (a.dates[0] === b.dates[0] ? a.sourceId - b.sourceId : a.dates[0] < b.dates[0] ? -1 : 1));
  const monthKeys = Object.keys(months).sort();
  const data = {
    schema: CALENDAR_SCHEMA,
    source: CALENDAR_SOURCE_LABEL,
    fetchedAt: acceptedMonths.size ? nowIso : previous?.fetchedAt ?? null,
    lastAttempt: lastAttempt ?? { at: nowIso, ok: acceptedMonths.size > 0, error: acceptedMonths.size ? null : "読めた月が無い" },
    coverage: { from: monthKeys[0] ?? null, to: monthKeys.at(-1) ?? null },
    months,
    events,
  };
  return { data, report };
}

// 定期の取得で読む月（今月の前後）
export function monthsToRefresh(now = new Date()) {
  const current = japanToday(now).slice(0, 7);
  return monthRange(addMonths(current, -REFRESH_MONTHS_BEFORE), addMonths(current, REFRESH_MONTHS_AFTER));
}

// 詳細のページを読む予定（近い順に最大 DETAIL_MAX_PER_RUN 件）
export function eventsNeedingDetail(events, now = new Date()) {
  const today = japanToday(now);
  const last = addDays(today, DETAIL_WINDOW_DAYS);
  const staleBefore = new Date(now.getTime() - DETAIL_REFRESH_DAYS * DAY_MS).toISOString();
  return events
    .filter((event) => !event.missing && event.dates.some((date) => date >= addDays(today, -1) && date <= last))
    .filter((event) => !event.detailFetchedAt || event.detailFetchedAt < staleBefore)
    .sort((a, b) => (a.dates[0] < b.dates[0] ? -1 : a.dates[0] > b.dates[0] ? 1 : a.sourceId - b.sourceId))
    .slice(0, DETAIL_MAX_PER_RUN)
    .map((event) => event.sourceId);
}

// ---- 検査 ----
const MEMBER_IDS = new Set(MEMBERS.map((member) => member.id));
const URL_PATTERN = /^https:\/\/equal-love\.jp\/schedule\/detail\/\d{1,9}$/;

export function validateCalendarData(data) {
  const errors = [];
  if (!data || typeof data !== "object") return { ok: false, errors: ["データが無い"] };
  if (data.schema !== CALENDAR_SCHEMA) errors.push("schema が違う");
  if (!Array.isArray(data.events)) return { ok: false, errors: [...errors, "events が無い"] };
  const ids = new Set();
  for (const event of data.events) {
    const where = event?.id ?? "?";
    if (!/^els-\d{1,9}$/.test(String(event?.id))) errors.push(`${where}：id の形`);
    if (ids.has(event.id)) errors.push(`${where}：id が重なっている`);
    ids.add(event.id);
    if (!Array.isArray(event.dates) || !event.dates.length || !event.dates.every(isIsoDate)) errors.push(`${where}：日付`);
    if (typeof event.title !== "string" || !event.title || event.title.length > MAX_TITLE) errors.push(`${where}：タイトル`);
    if (!CATEGORY_KEYS.has(event.category)) errors.push(`${where}：分類`);
    if (!STATUS_VALUES.has(event.status)) errors.push(`${where}：状態`);
    if (!URL_PATTERN.test(String(event.url))) errors.push(`${where}：URL`);
    if (!Array.isArray(event.memberIds) || event.memberIds.some((id) => !MEMBER_IDS.has(id))) errors.push(`${where}：メンバー`);
    if (errors.length > 20) break;
  }
  return { ok: errors.length === 0, errors };
}

// 公開してよいか：形が正しい・今月が読めた・前より予定が減っていない
export function checkCalendarPublication({ data, fetchedMonths, previous, now = new Date() }) {
  const errors = [];
  const warnings = [];
  const validation = validateCalendarData(data);
  if (!validation.ok) errors.push(...validation.errors.slice(0, 5));
  const currentKey = japanToday(now).slice(0, 7);
  const current = fetchedMonths.find((month) => month.monthKey === currentKey);
  if (!current || !current.ok) errors.push(`今月（${currentKey}）の予定表が読めない${current?.error ? `：${current.error}` : ""}`);
  fetchedMonths.filter((month) => !month.ok && month.monthKey !== currentKey).forEach((month) => warnings.push(`${month.monthKey} が読めない（${month.error}）。前のまま`));
  if (previous && data.events.length < previous.events.length) errors.push(`予定の数が減った（${previous.events.length} → ${data.events.length}）`);
  return { ok: errors.length === 0, errors, warnings };
}

// どのデータを公開するか（news と同じ考え方）
export function decideCalendarPublication({ fresh, previous, now = new Date() }) {
  const nowIso = now.toISOString();
  if (fresh?.ok) return { action: "write-fresh", data: fresh.data, alert: false, reason: "新しく取得できた" };
  const error = String(fresh?.error ?? "取得できない").slice(0, 200);
  if (previous && validateCalendarData(previous).ok) {
    return { action: "write-previous", data: { ...previous, lastAttempt: { at: nowIso, ok: false, error } }, alert: true, reason: `前のデータのまま（${error}）` };
  }
  return { action: "skip", data: null, alert: true, reason: `公開できるデータが無い（${error}）` };
}

// ---- 長く残す記録（git の専用の枝 calendar-data。2026-11-25 追加） ----
// 毎日のデータ（Pages）だけだと、公開の作り直し・取得の失敗の日に「土台のあとに増えた予定」を失うことがある。
// そこで、予定に本当の変化があった日だけ、専用の枝の1つのファイルに書く（日々変わる取得日時だけの違いでは書かない）。
export const CALENDAR_ARCHIVE_BRANCH = "calendar-data";
export const CALENDAR_ARCHIVE_FILE = "calendar/official-schedule-archive.json";
export const CALENDAR_ARCHIVE_URL = `https://raw.githubusercontent.com/togashi-sota/equal-love-intro-quiz/${CALENDAR_ARCHIVE_BRANCH}/${CALENDAR_ARCHIVE_FILE}`;

// 中身の比べ方：予定（保存の形）と、収録した月の名前だけ（最後に読んだ日時は比べない）
export function archiveSignature(data) {
  return JSON.stringify({ events: (data?.events ?? []).map(compactEvent), months: Object.keys(data?.months ?? {}).sort() });
}

// 記録を書き直すか。archive：今の記録（無ければ null）／next：今回のデータ（中で使う形）
export function decideArchiveUpdate({ archive, next }) {
  if (!next || !validateCalendarData(next).ok) return { update: false, reason: "今回のデータの形が正しくない" };
  if (!archive) return { update: true, reason: "記録がまだ無い（初めて作る）" };
  if (!validateCalendarData(archive).ok) return { update: false, reason: "今の記録の形が正しくない（上書きしない。確かめが必要）" };
  const nextIds = new Set(next.events.map((event) => event.id));
  const lost = archive.events.filter((event) => !nextIds.has(event.id)).map((event) => event.id);
  if (lost.length) return { update: false, reason: `記録にある予定が今回のデータに無い（${lost.length}件。消さないために書かない）`, lost };
  if (archiveSignature(archive) === archiveSignature(next)) return { update: false, reason: "変化なし" };
  return { update: true, reason: `変化あり（${archive.events.length} → ${next.events.length} 件）` };
}

// 短い印（FNV-1a）
export function noticeKey(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

// ---- 保存の形（ファイルを小さくする：決まった値・空の項目は書かない。読むときに戻す） ----
// 短い名前：s=公式の ID, d=日付, t=タイトル, c=公式のカテゴリ, k=アプリの分類, m=メンバー, g=範囲（group/members。unknown は書かない）,
// o=ほかのグループ, tm=時間, dt=詳細の見出しの値, st=状態（scheduled は書かない）, x=見当たらない, h=変更の記録,
// f=最初に見つけた日時（u と同じなら書かない）, u=更新日時, df=詳細を読んだ日時, p=確認待ちの理由
export function compactEvent(event) {
  const out = { s: event.sourceId, d: event.dates, t: event.title, c: event.siteCategory, k: event.category, u: event.updatedAt };
  if (event.memberIds?.length) out.m = event.memberIds;
  if (event.scope && event.scope !== "unknown") out.g = event.scope;
  if (event.otherGroups?.length) out.o = event.otherGroups;
  if (event.time) out.tm = event.time;
  if (event.detail) out.dt = event.detail;
  if (event.status && event.status !== EVENT_STATUS.SCHEDULED) out.st = event.status;
  if (event.missing) out.x = 1;
  if (event.history?.length) out.h = event.history;
  if (event.firstSeenAt && event.firstSeenAt !== event.updatedAt) out.f = event.firstSeenAt;
  if (event.detailFetchedAt) out.df = event.detailFetchedAt;
  if (event.pendingReason) out.p = event.pendingReason;
  return out;
}

export function expandEvent(raw) {
  const sourceId = Number(raw?.s);
  return {
    id: `els-${sourceId}`,
    sourceId,
    dates: Array.isArray(raw?.d) ? raw.d : [],
    title: raw?.t,
    siteCategory: raw?.c ?? "other",
    category: raw?.k,
    memberIds: Array.isArray(raw?.m) ? raw.m : [],
    scope: raw?.g ?? "unknown",
    otherGroups: Array.isArray(raw?.o) ? raw.o : [],
    time: raw?.tm ?? null,
    detail: raw?.dt ?? null,
    status: raw?.st ?? EVENT_STATUS.SCHEDULED,
    missing: Boolean(raw?.x),
    history: Array.isArray(raw?.h) ? raw.h : [],
    url: scheduleDetailUrl(sourceId),
    firstSeenAt: raw?.f ?? raw?.u ?? null,
    updatedAt: raw?.u ?? null,
    detailFetchedAt: raw?.df ?? null,
    pendingReason: raw?.p ?? null,
  };
}

// ファイルの形（compact: 1）⇔ 中で使う形。古い形（events に id がある）もそのまま読める
export function toStoredCalendarData(data) {
  return { ...data, compact: 1, events: data.events.map(compactEvent) };
}

export function fromStoredCalendarData(json) {
  if (!json || typeof json !== "object" || !Array.isArray(json.events)) return json;
  if (json.compact !== 1) return json;
  const { compact, ...rest } = json;
  return { ...rest, events: json.events.map(expandEvent) };
}

// Issue に書く文（同じ題の Issue があればコメントを足すのは workflow 側）
export function describeCalendarRefreshForIssue({ decision, check, report, warnings = [], trigger, runUrl }) {
  const lines = ["## ＝LOVEカレンダーの自動取得", "", `- きっかけ：${trigger}`, `- 判断：${decision.action}（${decision.reason}）`];
  if (runUrl) lines.push(`- 実行の記録：${runUrl}`);
  if (check?.errors?.length) lines.push("", "### 公開しなかった理由", ...check.errors.map((error) => `- ${error}`));
  if (warnings.length) lines.push("", "### 注意", ...warnings.slice(0, 20).map((warning) => `- ${warning}`));
  if (report?.missing?.length) lines.push("", "### 公式の予定表に見当たらなくなった予定（中止とは限らない。アプリでは消さずに印を付けている）", ...report.missing.slice(0, 20).map((id) => `- ${scheduleDetailUrl(id.replace("els-", ""))}`));
  if (report?.changed?.length) lines.push("", "### 日付・時間・タイトルが変わった予定", ...report.changed.slice(0, 20).map((entry) => `- ${scheduleDetailUrl(entry.id.replace("els-", ""))}：${entry.changes.map((change) => `${change.field} ${change.from} → ${change.to}`).join("／")}`));
  lines.push("", "公式サイトの形が変わったときは、Claude に「scripts/calendar の読み方を直して」と頼んでください。");
  // 同じ中身の知らせを毎日重ねないための印（workflow が、前の知らせと同じ印なら書かない）
  const key = noticeKey([decision.action, ...(check?.errors ?? []), ...warnings, ...(report?.missing ?? [])].join("|"));
  lines.push("", `<!-- calendar-key:${key} -->`);
  return lines.join("\n");
}
