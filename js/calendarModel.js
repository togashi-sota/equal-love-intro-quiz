// 「＝LOVEカレンダー」の表示と検索の決まり（2026-11-24新設）。DOM に触れない（画面 js/calendarScreen.js・質問AI・テストから使う）。
// 日付はすべて日本時間の「YYYY-MM-DD」の文字で扱う（端末の時間帯に左右されないように、Date は UTC の 0 時として使う）。
import { MEMBERS } from "./data/members.js";
import { LIVE_EVENTS } from "./data/liveHistory.js";
import { CD_BONUS_WORKS } from "./data/cdBonus.js";
import { HISTORY_EVENTS } from "./data/historyEvents.js";
import {
  CALENDAR_CATEGORIES,
  EVENT_STATUS,
  actualStartOf,
  addDays,
  addMonths,
  daysInMonth,
  japanToday,
  monthKeyOf,
  parseMonthKey,
  weekdayOf,
} from "./calendarCore.js";

export { japanToday };

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const MEMBER_BY_ID = new Map(MEMBERS.map((member) => [member.id, member]));
const CATEGORY_BY_KEY = new Map(CALENDAR_CATEGORIES.map((category) => [category.key, category]));

// 絞り込み：カテゴリ（"all"・分類のキー・"solo"＝メンバーの名前がある予定）／メンバー（"all"・"group"・メンバーの id）
export const CATEGORY_FILTERS = Object.freeze([
  { key: "all", label: "すべて" },
  { key: "live", label: "ライブ・イベント" },
  { key: "meet", label: "お話し会" },
  { key: "tv", label: "テレビ" },
  { key: "radio", label: "ラジオ" },
  { key: "release", label: "リリース" },
  { key: "media", label: "メディア" },
  { key: "solo", label: "個人活動" },
  { key: "birthday", label: "誕生日" },
  { key: "anniversary", label: "記念日" },
  { key: "other", label: "その他" },
]);

export function categoryLabel(key) {
  return CATEGORY_BY_KEY.get(key)?.label ?? "その他";
}

export function categoryShort(key) {
  return CATEGORY_BY_KEY.get(key)?.short ?? "その他";
}

export function memberOptions() {
  // 今のメンバー → 卒業メンバー（過去の予定を当時の出演者で探せるように）
  const active = MEMBERS.filter((member) => member.status !== "graduated");
  const graduated = MEMBERS.filter((member) => member.status === "graduated");
  return [
    { value: "all", label: "メンバー：すべて" },
    { value: "group", label: "グループ全体（※＝LOVE）" },
    ...active.map((member) => ({ value: member.id, label: member.name })),
    ...graduated.map((member) => ({ value: member.id, label: `${member.name}（卒業）` })),
  ];
}

export function matchesFilter(event, { category = "all", member = "all" } = {}) {
  if (category === "solo") {
    // 個人活動：メンバーの名前がある予定（誕生日は活動ではないので入れない）
    if (event.scope !== "members" || event.category === "birthday") return false;
  } else if (category !== "all" && event.category !== category) return false;
  if (member === "group") return event.scope === "group";
  if (member !== "all") return event.memberIds.includes(member);
  return true;
}

// ---- 日付 ----
export function formatDateJa(date, { withYear = false } = {}) {
  const [year, month, day] = String(date).split("-").map(Number);
  return `${withYear ? `${year}年` : ""}${month}月${day}日（${WEEKDAYS[weekdayOf(date)]}）`;
}

export function formatMonthJa(monthKey) {
  const parsed = parseMonthKey(monthKey);
  return parsed ? `${parsed.year}年${parsed.month}月` : "";
}

// 月曜はじまりの週の並び（前後の月のマスは date: null）
export function buildMonthGrid(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  const first = monthKeyOf(year, month) + "-01";
  const offset = (weekdayOf(first) + 6) % 7; // 月=0 … 日=6
  const total = daysInMonth(year, month);
  const cells = [];
  for (let index = 0; index < offset; index += 1) cells.push({ date: null, day: null });
  for (let day = 1; day <= total; day += 1) cells.push({ date: `${first.slice(0, 8)}${String(day).padStart(2, "0")}`, day });
  while (cells.length % 7) cells.push({ date: null, day: null });
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return weeks;
}

// 予定を日付ごとに引けるようにする（同じ配列なら作り直さない）
const indexCache = new WeakMap();
export function indexEventsByDate(events) {
  if (indexCache.has(events)) return indexCache.get(events);
  const map = new Map();
  for (const event of events) {
    for (const date of event.dates) {
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(event);
    }
  }
  for (const list of map.values()) list.sort(compareEventsInDay);
  indexCache.set(events, map);
  return map;
}

const CATEGORY_ORDER = new Map(CALENDAR_CATEGORIES.map((category, index) => [category.key, index]));
function compareEventsInDay(a, b) {
  const timeA = a.time?.start ?? "99:99";
  const timeB = b.time?.start ?? "99:99";
  if (timeA !== timeB) return timeA < timeB ? -1 : 1;
  const order = (CATEGORY_ORDER.get(a.category) ?? 99) - (CATEGORY_ORDER.get(b.category) ?? 99);
  return order || a.sourceId - b.sourceId;
}

export function eventsOnDate(events, date, filter = {}) {
  return (indexEventsByDate(events).get(date) ?? []).filter((event) => matchesFilter(event, filter));
}

// その月を収録できているか（公式の予定表を一度でも読めた月）
export function isMonthCovered(months, monthKey) {
  return Boolean(months && months[monthKey]);
}

export function coverageOf(months) {
  const keys = Object.keys(months ?? {}).sort();
  return keys.length ? { from: keys[0], to: keys.at(-1), count: keys.length } : null;
}

// ---- 予定の見せ方 ----
// 状態の札：中止・延期・確認待ち・日時変更・見当たらない・開催済み（すべての日が過ぎた）。予定どおりの未来の予定は札なし
export function eventBadges(event, today) {
  const badges = [];
  if (event.status === EVENT_STATUS.CANCELLED) badges.push({ key: "cancelled", label: "中止" });
  else if (event.status === EVENT_STATUS.POSTPONED) badges.push({ key: "postponed", label: "延期" });
  else if (event.status === EVENT_STATUS.PENDING) badges.push({ key: "pending", label: "確認待ち" });
  else if (event.status === EVENT_STATUS.CHANGED) badges.push({ key: "changed", label: "日時変更あり" });
  if (event.missing) badges.push({ key: "missing", label: "公式の予定表に見当たらない" });
  const called = event.status === EVENT_STATUS.CANCELLED || event.status === EVENT_STATUS.POSTPONED;
  // 誕生日は「終了」を付けない（毎年の記念日のため）
  if (today && !called && event.category !== "birthday" && event.category !== "anniversary" && event.dates.at(-1) < today) badges.push({ key: "done", label: "終了" });
  return badges;
}

// 時間の行。深夜（24時以降）は、実際の日時も添える。時間が無ければ null（00:00 を作らない）
export function describeTime(event, date) {
  const time = event.time;
  if (!time?.label) return null;
  if (time.start && Number(time.start.slice(0, 2)) >= 24) {
    const actual = actualStartOf(date, time.start);
    const [, month, day] = actual.date.split("-").map(Number);
    return `${time.label}（実際は${month}月${day}日 ${Number(actual.time.slice(0, 2))}:${actual.time.slice(3)}〜）`;
  }
  return time.label;
}

export function describeMembers(event) {
  if (event.scope === "group") return "＝LOVE";
  if (event.memberIds.length) return event.memberIds.map((id) => MEMBER_BY_ID.get(id)?.name ?? id).join("、");
  return null;
}

// アプリの中の開く先（main.js の openSearchTarget と同じ形）。対応するページが無ければ作らない
export function eventAppLinks(event) {
  const links = [...(event.appLinks ?? [])];
  if (event.category === "live") {
    const live = LIVE_EVENTS.find((entry) => (entry.venues ?? []).some((venue) => event.dates.includes(venue.date)) || event.dates.includes(entry.startDate));
    if (live) links.push({ label: "ライブの記録を見る", target: { kind: "liveHub", view: "history", liveId: live.id } });
  }
  if (event.category === "release" || event.category === "meet") {
    const work = CD_BONUS_WORKS.find((entry) => event.category === "release" && event.dates.includes(entry.releaseDate));
    if (work) links.push({ label: "CD・特典映像図鑑で見る", target: { kind: "cdBonus", workId: work.workId } });
  }
  for (const memberId of event.memberIds.slice(0, 3)) {
    const member = MEMBER_BY_ID.get(memberId);
    if (member) links.push({ label: `${member.name}のページ`, target: { kind: "member", memberId } });
  }
  return links;
}

// ---- 期間と検索（質問AI・画面の「これからの予定」） ----
function mondayOf(date) {
  return addDays(date, -((weekdayOf(date) + 6) % 7));
}

function monthBounds(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  return { from: `${monthKey}-01`, to: `${monthKey}-${String(daysInMonth(year, month)).padStart(2, "0")}` };
}

// 質問の言葉から期間を決める（日本時間の today を基準）。見つからなければ null
// 対応：今日・明日・明後日・昨日・今週・来週・先週・今月・来月・先月・今年・去年・来年・YYYY年M月・YYYY年・M月（今年）
export function resolveDateRange(text, today) {
  const t = String(text ?? "").normalize("NFKC");
  const monthKey = today.slice(0, 7);
  const year = Number(today.slice(0, 4));
  const ym = /(\d{4})年\s*(\d{1,2})月/.exec(t);
  if (ym && Number(ym[2]) >= 1 && Number(ym[2]) <= 12) {
    const key = monthKeyOf(Number(ym[1]), Number(ym[2]));
    return { ...monthBounds(key), label: formatMonthJa(key) };
  }
  if (/明後日|あさって/.test(t)) return { from: addDays(today, 2), to: addDays(today, 2), label: "明後日" };
  if (/明日|あした/.test(t)) return { from: addDays(today, 1), to: addDays(today, 1), label: "明日" };
  if (/昨日|きのう/.test(t)) return { from: addDays(today, -1), to: addDays(today, -1), label: "昨日" };
  if (/今日|きょう|本日/.test(t)) return { from: today, to: today, label: "今日" };
  if (/再来週/.test(t)) return { from: addDays(mondayOf(today), 14), to: addDays(mondayOf(today), 20), label: "再来週" };
  if (/来週/.test(t)) return { from: addDays(mondayOf(today), 7), to: addDays(mondayOf(today), 13), label: "来週" };
  if (/先週/.test(t)) return { from: addDays(mondayOf(today), -7), to: addDays(mondayOf(today), -1), label: "先週" };
  if (/今週/.test(t)) return { from: mondayOf(today), to: addDays(mondayOf(today), 6), label: "今週" };
  if (/来月/.test(t)) return { ...monthBounds(addMonths(monthKey, 1)), label: "来月" };
  if (/先月/.test(t)) return { ...monthBounds(addMonths(monthKey, -1)), label: "先月" };
  if (/今月/.test(t)) return { ...monthBounds(monthKey), label: "今月" };
  if (/去年|昨年/.test(t)) return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31`, label: `${year - 1}年` };
  if (/来年/.test(t)) return { from: `${year + 1}-01-01`, to: `${year + 1}-12-31`, label: `${year + 1}年` };
  if (/今年/.test(t)) return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}年` };
  const yearOnly = /(20\d{2})年/.exec(t);
  if (yearOnly) return { from: `${yearOnly[1]}-01-01`, to: `${yearOnly[1]}-12-31`, label: `${yearOnly[1]}年` };
  const monthOnly = /(?<!\d)(\d{1,2})月/.exec(t);
  if (monthOnly && Number(monthOnly[1]) >= 1 && Number(monthOnly[1]) <= 12) {
    const key = monthKeyOf(year, Number(monthOnly[1]));
    return { ...monthBounds(key), label: formatMonthJa(key) };
  }
  return null;
}

// 期間の中の予定（日付の早い順。同じ予定は1回だけ）。from/to が無ければ全部
export function findEvents(events, { from = null, to = null, filter = {}, includeMissing = false, includeCancelled = true } = {}) {
  return events
    .filter((event) => (includeMissing || !event.missing) && (includeCancelled || event.status !== EVENT_STATUS.CANCELLED))
    .filter((event) => event.dates.some((date) => (!from || date >= from) && (!to || date <= to)))
    .filter((event) => matchesFilter(event, filter))
    .map((event) => ({ event, date: event.dates.find((date) => (!from || date >= from) && (!to || date <= to)) }))
    .sort((a, b) => (a.date === b.date ? compareEventsInDay(a.event, b.event) : a.date < b.date ? -1 : 1));
}

// 期間がその収録の範囲に入っているか（入っていない月の名前を返す）
export function uncoveredMonths(months, from, to) {
  const list = [];
  for (let key = from.slice(0, 7); key <= to.slice(0, 7); key = addMonths(key, 1)) {
    if (!isMonthCovered(months, key)) list.push(key);
    if (list.length > 24) break;
  }
  return list;
}

// ---- メンバーの誕生日（2026-11-26追加・本人の依頼） ----
// 公式 SCHEDULE には誕生日が2021年の分しか載っていないため、アプリのメンバー情報の生年月日（公式プロフィール。js/data/members.js）から、
// 毎年の誕生日をカレンダーに出す。保存はしない（表示のたびに作る）。
// - 生年月日のデータがあるメンバーだけ（無いメンバーに推測で付けない）
// - ＝LOVE に在籍していた期間の日だけ（加入日〜卒業日）
// - 公式 SCHEDULE に同じ日・同じメンバーの誕生日の予定があれば、そちらだけ出す（二重にしない）
export const BIRTHDAY_FIRST_YEAR = 2017;

export function memberBirthdayEvents({ toYear }) {
  const list = [];
  for (const member of MEMBERS) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(member.birthday ?? "")) continue;
    const [birthYear, month, day] = member.birthday.split("-").map(Number);
    const profileUrl = member.profileSource?.urls?.find((url) => url.startsWith("https://equal-love.jp/")) ?? null;
    for (let year = BIRTHDAY_FIRST_YEAR; year <= toYear; year += 1) {
      // 2月29日生まれの人は、うるう年でない年は2月28日に出す
      const safeDay = month === 2 && day === 29 && daysInMonth(year, 2) === 28 ? 28 : day;
      const date = `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
      if (member.joinDate && date < member.joinDate) continue;
      if (member.graduationDate && date > member.graduationDate) continue;
      list.push({
        id: `birthday-${member.id}-${year}`,
        sourceId: -1,
        dates: [date],
        title: `${member.name}の誕生日（${year - birthYear}歳）`,
        siteCategory: "birthday",
        category: "birthday",
        memberIds: [member.id],
        scope: "members",
        otherGroups: [],
        time: null,
        detail: null,
        status: EVENT_STATUS.SCHEDULED,
        missing: false,
        history: [],
        url: profileUrl,
        derived: "member-profile",
        note: "メンバーのプロフィール（公式サイト）の生年月日から出しています。",
        linkLabel: "公式プロフィールを見る",
      });
    }
  }
  return list;
}

// ---- ＝LOVE の記念日（2026-11-26追加・本人の依頼） ----
// アプリのデータ（年表 js/data/historyEvents.js・CD 図鑑の1stシングルの発売日）から作る。日付を推測で作らない。
// - 2017年の始まりの出来事：オーディションの開催発表・結成（グループ名の発表）・初ステージ（年表にあり、出典のあるものだけ）
// - 毎年：結成記念日（結成の日）・デビュー記念日（1stシングルの発売日）。2018年から、周年の数を付ける
const ABOUT_URL = "https://equal-love.jp/feature/about";
const ANNIVERSARY_NOTE = "アプリの＝LOVE の年表（公式サイトの ABOUT など）から出しています。";

function historyEvent(predicate) {
  return HISTORY_EVENTS.find((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.date ?? "") && predicate(event)) ?? null;
}

function anniversaryEvent({ id, date, title, url, linkLabel = "公式サイトで見る" }) {
  return {
    id,
    sourceId: -2,
    dates: [date],
    title,
    siteCategory: "other",
    category: "anniversary",
    memberIds: [],
    scope: "group",
    otherGroups: [],
    time: null,
    detail: null,
    status: EVENT_STATUS.SCHEDULED,
    missing: false,
    history: [],
    url,
    derived: "group-history",
    note: ANNIVERSARY_NOTE,
    linkLabel,
    appLinks: [{ label: "周年ヒストリーを見る", target: { kind: "anniversary" } }],
  };
}

export function groupAnniversaryEvents({ toYear }) {
  const list = [];
  const audition = historyEvent((event) => event.title.includes("オーディションの開催を発表") && (event.sourceUrls ?? []).length);
  const formation = historyEvent((event) => event.title.includes("グループ名") && (event.sourceUrls ?? []).length);
  const firstStage = historyEvent((event) => event.title.includes("初ステージ") && (event.sourceUrls ?? []).length);
  const debutDate = CD_BONUS_WORKS.find((work) => work.workId === "single-01")?.releaseDate ?? null;
  if (audition) list.push(anniversaryEvent({ id: "anniv-audition", date: audition.date, title: "声優アイドルオーディションの開催を発表（＝LOVE のはじまり）", url: ABOUT_URL }));
  if (formation) list.push(anniversaryEvent({ id: "anniv-formation", date: formation.date, title: "＝LOVE 結成（最終審査でメンバー決定・グループ名「＝LOVE」を発表）", url: ABOUT_URL }));
  if (firstStage) list.push(anniversaryEvent({ id: "anniv-first-stage", date: firstStage.date, title: firstStage.title, url: firstStage.sourceUrls[0], linkLabel: "出典の記事を見る" }));
  const startYear = Number((formation?.date ?? "2017").slice(0, 4));
  for (let year = startYear + 1; year <= toYear; year += 1) {
    const count = year - startYear;
    if (formation) list.push(anniversaryEvent({ id: `anniv-formation-${year}`, date: `${year}${formation.date.slice(4)}`, title: `＝LOVE 結成記念日（結成${count}周年）`, url: ABOUT_URL }));
    if (debutDate) list.push(anniversaryEvent({ id: `anniv-debut-${year}`, date: `${year}${debutDate.slice(4)}`, title: `＝LOVE デビュー記念日（デビュー${count}周年）`, url: ABOUT_URL }));
  }
  return list;
}

// 公式の予定＋メンバーの誕生日＋＝LOVE の記念日（同じ配列からは同じ結果を返す。日付ごとの引き方の速さを保つため）
const generatedCache = new WeakMap();
export function withGeneratedEvents(events, today) {
  const toYear = Number(String(today).slice(0, 4)) + 1;
  const cached = generatedCache.get(events);
  if (cached && cached.toYear === toYear) return cached.list;
  const official = new Set(events.filter((event) => event.category === "birthday").flatMap((event) => event.dates.flatMap((date) => event.memberIds.map((id) => `${id}|${date}`))));
  const birthdays = memberBirthdayEvents({ toYear }).filter((event) => !official.has(`${event.memberIds[0]}|${event.dates[0]}`));
  const list = [...events, ...birthdays, ...groupAnniversaryEvents({ toYear })];
  generatedCache.set(events, { toYear, list });
  return list;
}

export function memberName(memberId) {
  return MEMBER_BY_ID.get(memberId)?.name ?? null;
}
