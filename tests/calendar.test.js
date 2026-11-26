// 【2026-11-24新設】「＝LOVEカレンダー」（公式サイトの SCHEDULE の自動取得・カレンダーの画面・質問AI）のテスト。
// 公式サイトには繋がない。2026-11-24 の公式のページを切り出した写し（tests/fixtures/calendar/）と、テストの中で作ったダミーの HTML・データを使う。
// 期待する値は、写しの HTML とカレンダーを人が読んで書いたもの（判定のロジックから作らない）。
import {
  actualStartOf,
  buildCalendarData,
  checkCalendarPublication,
  classifyEvent,
  compactEvent,
  decideArchiveUpdate,
  mergePreviousSources,
  daysInMonth,
  decideCalendarPublication,
  detectEventMembers,
  detectEventScope,
  eventsNeedingDetail,
  expandEvent,
  fromStoredCalendarData,
  japanToday,
  monthsToRefresh,
  noticeKey,
  parseScheduleDetailHtml,
  parseScheduleMonthHtml,
  parseTimeLabel,
  statusFromTitle,
  toStoredCalendarData,
  validateCalendarData,
} from "../js/calendarCore.js";
import { buildMonthGrid, describeTime, eventAppLinks, eventBadges, eventsOnDate, findEvents, matchesFilter, resolveDateRange, uncoveredMonths, withGeneratedEvents } from "../js/calendarModel.js";
import { CALENDAR_STATE, getCalendarSnapshot, interpretCalendarData, loadCalendarData, setCalendarSnapshotForTest } from "../js/calendarData.js";
import { answerQuestion } from "../js/qaEngine.js";
import { initCalendarScreen, openCalendar, resetCalendarScreenStateForTest } from "../js/calendarScreen.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const NOW = new Date("2026-11-24T03:00:00.000Z"); // 日本時間 2026-11-24 12:00

// ダミーの月のページ（公式と同じ形）。entries：{ 日: [[ID, "cat13", "メディア", "タイトル"], ...] }
function monthPage(year, month, entries = {}) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const offset = (first + 6) % 7;
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push('<div class="cell"><span class="date"></span></div>');
  for (let day = 1; day <= daysInMonth(year, month); day += 1) {
    const items = (entries[day] ?? [])
      .map(([id, cat, label, title]) => `<div class="live04 ${cat}"><a href="/schedule/detail/${id}"><div><span class="cat"> ${label}</span><br><span class="tit">${title}</span></div></a></div>`)
      .join("");
    cells.push(`<div class="cell"><span class="date">${day}</span>${items}</div>`);
  }
  return `<ul class="calendarHeader"><li><span class="year">${year}</span><span class="month">${String(month).padStart(2, "0")}</span></li></ul><div class="calendar"><div class="calendarBody"><div class="week">${cells.join("")}</div></div></div>`;
}

const parsed = (year, month, entries) => parseScheduleMonthHtml(monthPage(year, month, entries), `${year}-${String(month).padStart(2, "0")}`);

// ---- 1. 公式の写しを読む ----
async function runFixtureTests() {
  const nov = parseScheduleMonthHtml(await fetchText("./tests/fixtures/calendar/month-2026-11.html"), "2026-11");
  assertEqual([nov.ok, nov.items.length, nov.problems.length], [true, 58, 0], "写し 2026年11月：予定58件を全部読む（HTML のリンクの数と同じ）");
  const day24 = nov.items.filter((item) => item.date === "2026-11-24").map((item) => [item.sourceId, item.siteCategory, item.title]);
  assertEqual(
    day24,
    [
      [12485, "media", "フジテレビ系「めざましテレビ」※髙松瞳、諸橋沙夏"],
      [11688, "media", "フジテレビ・FODプレミアム「キミはもっと＝LOVEを愛せるか!!!」※＝LOVE"],
      [12290, "meet", '＝LOVE映像商品 『＝LOVE STADIUM LIVE「Beyond "KYUN"♡」』 発売記念オンライン個別サイン会'],
    ],
    "写し 11月24日：3件・公式のカテゴリ・タイトル（&quot; は文字に戻す）"
  );
  const jan = parseScheduleMonthHtml(await fetchText("./tests/fixtures/calendar/month-2027-01.html"), "2027-01");
  assertEqual(
    jan.items.map((item) => [item.sourceId, item.date, item.siteCategory]),
    [
      [12390, "2027-01-10", "live-event"],
      [11617, "2027-01-19", "live-event"],
      [11618, "2027-01-20", "live-event"],
    ],
    "写し 2027年1月：未来の月も読める（東京ドーム2日間は別の ID）"
  );
  const sep = parseScheduleMonthHtml(await fetchText("./tests/fixtures/calendar/month-2017-09.html"), "2017-09");
  assertEqual([sep.ok, sep.items.length, sep.items.find((item) => item.sourceId === 35)?.date], [true, 29, "2017-09-06"], "写し 2017年9月：過去の月も読める（デビューシングルの発売日 9月6日）");
  assertEqual(parseScheduleMonthHtml(await fetchText("./tests/fixtures/calendar/month-2026-11.html"), "2026-10").ok, false, "見出しの年月が違うページ（月の指定と違う）は読まない");

  const detail = parseScheduleDetailHtml(await fetchText("./tests/fixtures/calendar/detail-11688.html"));
  assertEqual(
    [detail.ok, detail.date, detail.siteCategory, detail.fields.time, detail.fields.station, detail.fields.performers],
    [true, "2026-11-24", "media", "24:45〜25:15", "フジテレビ(関東ローカル)", "=LOVE"],
    "写し 詳細 11688：放送日・時間・放送局・出演を見出しから読む"
  );
  assertEqual(Object.keys(detail.fields).sort(), ["dateLabel", "performers", "station", "time"], "詳細：決めた見出しだけ。本文の文章・番組の外のリンクは持たない");
}

// ---- 2. 形が変わったとき・おかしな HTML ----
function runStructureTests() {
  assertEqual(parseScheduleMonthHtml("<html><body>メンテナンス中</body></html>", "2026-11").ok, false, "形の変化：カレンダーが無いページは読まない");
  const html = monthPage(2026, 11, { 3: [[1, "cat13", "メディア", "番組"]] }).replace('<div class="cell"><span class="date">15</span></div>', "");
  assertEqual(parseScheduleMonthHtml(html, "2026-11").ok, false, "形の変化：日付のマスが1つ欠けたら読まない（黙って一部だけ使わない）");
  const unknown = parsed(2026, 11, { 5: [[2, "cat99", "新しい種類", "ダミー"]] });
  assertEqual([unknown.items[0].siteCategory, unknown.items[0].unknownCategory], ["other", "新しい種類"], "知らないカテゴリ：「その他」にして、知らせる印を付ける");
  const xss = parsed(2026, 11, { 6: [[3, "cat13", "メディア", '&lt;img src=x onerror=alert(1)&gt;<b>太字</b>番組']] });
  assertEqual(xss.items[0].title, "<img src=x onerror=alert(1)> 太字 番組", "外の文字：タグは取り除き、文字の < > は文字のまま（画面では textContent で入れる）");
  assertEqual(parsed(2026, 11, {}).items.length, 0, "予定の無い月：0件（エラーにしない）");
  assertEqual(parseScheduleDetailHtml("<p>見つかりません</p>").ok, false, "詳細のページが無い・形が違う：読まない");
}

// ---- 3. 日付と時刻 ----
function runDateTests() {
  assertEqual(parseTimeLabel("24:45〜25:15"), { label: "24:45〜25:15", start: "24:45", end: "25:15" }, "深夜：24:45〜25:15 は書いてあるまま");
  assertEqual(actualStartOf("2026-11-24", "24:45"), { date: "2026-11-25", time: "00:45" }, "深夜：実際の日時は翌日の 0:45");
  assertEqual(actualStartOf("2026-12-31", "25:00"), { date: "2027-01-01", time: "01:00" }, "深夜：大みそかの 25:00 は翌年の元日 1:00");
  assertEqual([actualStartOf("2028-02-28", "24:30").date, actualStartOf("2027-02-28", "24:30").date], ["2028-02-29", "2027-03-01"], "深夜：うるう年（2028年）と平年の2月末");
  assertEqual(actualStartOf("2026-11-24", "19:00"), { date: "2026-11-24", time: "19:00" }, "24時前はその日のまま");
  assertEqual(parseTimeLabel("開場17:00／開演18:00").start, "18:00", "時間：開場と開演があれば開演");
  assertEqual(parseTimeLabel("05:50~09:00 ※08:00台生出演予定"), { label: "05:50~09:00 ※08:00台生出演予定", start: "05:50", end: "09:00" }, "時間：後ろの注意書きは表示に残し、並べ替えは放送時間で");
  assertEqual(parseTimeLabel("※全日程共通").start, null, "時間：読み取れない書き方に時刻を作らない");
  assertEqual(describeTime({ time: null }, "2026-11-24"), null, "時間が無い予定：00:00 などを出さない");
  assertEqual(describeTime({ time: parseTimeLabel("24:45〜25:15") }, "2026-11-24"), "24:45〜25:15（実際は11月25日 0:45〜）", "画面：深夜は公式の書き方＋実際の日時");
  assertEqual([daysInMonth(2028, 2), daysInMonth(2027, 2), daysInMonth(2026, 12), daysInMonth(2026, 11)], [29, 28, 31, 30], "月末：うるう年・平年・12月・11月");
  const nov = buildMonthGrid("2026-11");
  assertEqual([nov.length, nov[0].findIndex((cell) => cell.day === 1), nov[0][6].date, nov.at(-1)[0].date], [6, 6, "2026-11-01", "2026-11-30"], "月曜はじまり：2026年11月1日は日曜（7列目）・30日は月曜");
  const feb = buildMonthGrid("2027-02");
  assertEqual([feb.length, feb[0][0].date], [4, "2027-02-01"], "月曜はじまり：2027年2月は1日が月曜でちょうど4週");
  assertEqual([japanToday(new Date("2026-11-24T14:59:00Z")), japanToday(new Date("2026-11-24T15:00:00Z")), japanToday(new Date("2026-12-31T15:00:00Z"))], ["2026-11-24", "2026-11-25", "2027-01-01"], "日本時間：0時をまたぐ・年をまたぐ");
  assertEqual(monthsToRefresh(NOW), ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"], "定期の取得で読む月：前の月〜4か月先（年をまたぐ）");
}

function runRangeTests() {
  const r = (text, today) => {
    const range = resolveDateRange(text, today);
    return range ? [range.from, range.to] : null;
  };
  assertEqual(r("今週の予定", "2026-11-29"), ["2026-11-23", "2026-11-29"], "今週：日曜に聞いても月曜〜日曜");
  assertEqual(r("来週の予定", "2026-11-28"), ["2026-11-30", "2026-12-06"], "来週：月をまたぐ");
  assertEqual(r("来週", "2026-12-30"), ["2027-01-04", "2027-01-10"], "来週：年をまたぐ");
  assertEqual(r("来月のライブ", "2026-12-15"), ["2027-01-01", "2027-01-31"], "来月：年をまたぐ");
  assertEqual(r("先月", "2027-01-10"), ["2026-12-01", "2026-12-31"], "先月：年をまたいで前の年の12月");
  assertEqual(r("昨日", "2027-01-01"), ["2026-12-31", "2026-12-31"], "昨日：元日に聞くと大みそか");
  assertEqual(r("2028年2月に何があった", "2026-11-24"), ["2028-02-01", "2028-02-29"], "年月：うるう年の2月は29日まで");
  assertEqual(r("明日の予定", "2026-11-30"), ["2026-12-01", "2026-12-01"], "明日：月末の次の日");
  assertEqual(r("おすすめの曲は", "2026-11-24"), null, "期間の言葉が無い質問：期間を作らない");
}

// ---- 4. 種類・メンバー・グループ ----
function runClassifyTests() {
  assertEqual(
    [
      classifyEvent("media", "FM NACK5『＝LOVE大場花菜の「はなまる！」』※大場花菜"),
      classifyEvent("media", "フジテレビ系「めざましテレビ」※髙松瞳"),
      classifyEvent("media", "宝島社「sweet 12月号」※大谷映美里"),
      classifyEvent("media", "NHK-FM「ダミー」"),
      classifyEvent("media", "TBSラジオ「ダミー」"),
      classifyEvent("live-event", "ダミー公演"),
      classifyEvent("meet", "個別お話し会"),
    ],
    ["radio", "tv", "media", "radio", "radio", "live", "meet"],
    "種類：公式の「メディア」を局の名前でテレビ・ラジオ・そのほかに分ける（NHK-FM・TBSラジオはラジオ）"
  );
  assertEqual(detectEventMembers("FM FUJI『A DAWNING REVOLUTION 2020』　※音嶋 莉沙、佐竹 のん乃、瀧脇 笙古").sort(), ["otoshima-risa", "satake-nonno", "takiwaki-shoko"], "メンバー：名前の間の空白があっても読む・卒業メンバー（佐竹のん乃）も当時の出演者として");
  assertEqual(detectEventMembers("文化放送「＝LOVE 齋藤樹愛羅・≠ME 櫻井ももの ♡べり〜ぴ〜ち♡さんで〜♡」※齋藤樹愛羅"), ["saito-kiara"], "姉妹グループ：≠ME のメンバーは ＝LOVE のメンバーにしない");
  assertEqual([detectEventMembers("ダミー※齊藤なぎさ"), detectEventMembers("ダミー※齋藤樹愛羅")], [["saito-nagisa"], ["saito-kiara"]], "メンバー：齊藤なぎさと齋藤樹愛羅を取り違えない");
  assertEqual([detectEventScope("「GIFT」※＝LOVE", "", []), detectEventScope("ニッポン放送「＝LOVEのイコラフ」", "", []), detectEventScope("ダミー", "=LOVE", [])], ["group", "unknown", "group"], "グループ全体：※＝LOVE か【出演】＝LOVE のときだけ（番組名に＝LOVE があるだけでは決めない）");
  assertEqual([statusFromTitle("【中止】ダミー公演"), statusFromTitle("【発売延期】7thシングル"), statusFromTitle("ダミー番組"), statusFromTitle("【会場変更】ダミー")], ["cancelled", "postponed", null, "changed"], "状態：中止・延期・変更はタイトルに書いてあるときだけ");
}

// ---- 5. データを作る（重複・変更・見えなくなった・前のデータを守る） ----
function runBuildTests() {
  const t0 = new Date("2026-11-01T00:00:00Z");
  const first = buildCalendarData({ fetchedMonths: [parsed(2026, 12, { 20: [[100, "cat12", "ライブ/イベント", "ダミー公演"]], 21: [[101, "cat12", "ライブ/イベント", "ダミー公演"]] }), parsed(2027, 1, { 5: [[200, "cat13", "メディア", "テレビ東京「ダミー」"]] })], now: t0 }).data;
  assertEqual(first.events.map((event) => [event.id, event.dates]), [["els-100", ["2026-12-20"]], ["els-101", ["2026-12-21"]], ["els-200", ["2027-01-05"]]], "同じタイトルでも ID が違う予定（別の日の公演）は1件にまとめない");
  const twice = buildCalendarData({ previous: first, fetchedMonths: [parsed(2026, 12, { 20: [[100, "cat12", "ライブ/イベント", "ダミー公演"]], 21: [[101, "cat12", "ライブ/イベント", "ダミー公演"]] })], now: NOW });
  assertEqual([twice.data.events.length, twice.report.added.length, twice.report.changed.length], [3, 0, 0], "同じ予定を2回読んでも二重にしない");
  const moved = buildCalendarData({ previous: first, fetchedMonths: [parsed(2026, 12, { 27: [[100, "cat12", "ライブ/イベント", "ダミー公演"]], 21: [[101, "cat12", "ライブ/イベント", "ダミー公演"]] })], now: NOW });
  const e100 = moved.data.events.find((event) => event.id === "els-100");
  assertEqual([e100.dates, e100.status, e100.history.at(-1).field, e100.history.at(-1).from, e100.history.at(-1).to], [["2026-12-27"], "changed", "dates", "2026-12-20", "2026-12-27"], "日付の変更：新しい日に移し、変更の記録を残して「日時変更」");
  const gone = buildCalendarData({ previous: first, fetchedMonths: [parsed(2026, 12, { 21: [[101, "cat12", "ライブ/イベント", "ダミー公演"]] })], now: NOW });
  const g100 = gone.data.events.find((event) => event.id === "els-100");
  assertEqual([Boolean(g100), g100.missing, g100.status, gone.report.missing], [true, true, "scheduled", ["els-100"]], "見えなくなった予定：消さない・中止にしない（見当たらない印だけ）");
  const back = buildCalendarData({ previous: gone.data, fetchedMonths: [parsed(2026, 12, { 20: [[100, "cat12", "ライブ/イベント", "ダミー公演"]], 21: [[101, "cat12", "ライブ/イベント", "ダミー公演"]] })], now: NOW });
  assertEqual([back.data.events.find((event) => event.id === "els-100").missing, back.report.restored], [false, ["els-100"]], "また見えるようになった予定：印を外す");
  assertEqual(gone.data.events.find((event) => event.id === "els-200").missing, false, "今回読んでいない月（2027年1月）の予定はそのまま");
  const cancelled = buildCalendarData({ previous: first, fetchedMonths: [parsed(2026, 12, { 20: [[100, "cat12", "ライブ/イベント", "【中止】ダミー公演"]], 21: [[101, "cat12", "ライブ/イベント", "【延期】ダミー公演"]] })], now: NOW });
  assertEqual(cancelled.data.events.slice(0, 2).map((event) => event.status), ["cancelled", "postponed"], "公式のタイトルに【中止】【延期】→ 中止・延期");
  const failed = buildCalendarData({ previous: first, fetchedMonths: [{ ok: false, monthKey: "2026-12", items: [], problems: [], error: "HTTP 503" }], now: NOW });
  assertEqual([failed.data.events.length, failed.data.events.every((event) => !event.missing), failed.report.keptMonths.length], [3, true, 1], "読めなかった月：前のデータのまま（消さない・印も付けない）");
  const manyPrev = buildCalendarData({ fetchedMonths: [parsed(2026, 12, Object.fromEntries([1, 2, 3, 4, 5, 6].map((day) => [day, [[300 + day, "cat13", "メディア", `番組${day}`]]])))], now: t0 }).data;
  const empty = buildCalendarData({ previous: manyPrev, fetchedMonths: [parsed(2026, 12, {})], now: NOW });
  assertEqual([empty.report.suspiciousMonths, empty.data.events.filter((event) => event.missing).length], [["2026-12"], 0], "前は6件あった月が急に0件：形の変化とみなして前のまま");
  const pending = buildCalendarData({ previous: first, fetchedMonths: [parsed(2026, 12, { 20: [[100, "cat12", "ライブ/イベント", "ダミー公演"]], 21: [[101, "cat12", "ライブ/イベント", "ダミー公演"]] })], details: new Map([[100, { date: "2026-12-22", fields: { time: "18:00〜" } }]]), now: NOW });
  const p100 = pending.data.events.find((event) => event.id === "els-100");
  assertEqual([p100.status, p100.time.start], ["pending", "18:00"], "詳細のページの日付とカレンダーの日付が違う：確認待ち（どちらかに決めない）");
  assertEqual(validateCalendarData(first).ok, true, "作ったデータは検査に通る");
}

function runPublicationTests() {
  const ok = buildCalendarData({ fetchedMonths: [parsed(2026, 11, { 3: [[1, "cat13", "メディア", "番組"]] })], now: NOW }).data;
  const missingCurrent = checkCalendarPublication({ data: ok, fetchedMonths: [{ ok: false, monthKey: "2026-11", error: "HTTP 500" }], previous: null, now: NOW });
  assertEqual(missingCurrent.ok, false, "公開の検査：今月のページが読めなければ新しいデータを公開しない");
  assertEqual(checkCalendarPublication({ data: ok, fetchedMonths: [{ ok: true, monthKey: "2026-11", items: [] }], previous: null, now: NOW }).ok, true, "公開の検査：今月が読めて形が正しければ公開する");
  const prev = decideCalendarPublication({ fresh: { ok: false, error: "公式サイトに繋がらない" }, previous: ok, now: NOW });
  assertEqual([prev.action, prev.data.lastAttempt.ok, prev.data.events.length, prev.alert], ["write-previous", false, 1, true], "取得に失敗：前のデータを公開し直し「取得できなかった」と書く（上書きで消さない）");
  assertEqual(decideCalendarPublication({ fresh: { ok: false, error: "x" }, previous: null, now: NOW }).action, "skip", "前のデータも無いとき：何も公開しない");
  const broken = { ...ok, events: [{ ...ok.events[0], url: "https://example.com/x" }] };
  assertEqual(validateCalendarData(broken).ok, false, "検査：公式サイト以外の URL は通さない");
  assertEqual(validateCalendarData({ ...ok, events: [{ ...ok.events[0], memberIds: ["someone"] }] }).ok, false, "検査：知らないメンバーの id は通さない");
  const stored = toStoredCalendarData(ok);
  assertEqual(JSON.stringify(fromStoredCalendarData(JSON.parse(JSON.stringify(stored))).events), JSON.stringify(ok.events), "保存の形：詰めて保存しても、読み直すと元と同じ");
  assertEqual(expandEvent(compactEvent(ok.events[0])).url, "https://equal-love.jp/schedule/detail/1", "保存の形：公式の URL は ID から作り直す");
  assertEqual([noticeKey("a|b") === noticeKey("a|b"), noticeKey("a|b") === noticeKey("a|c")], [true, false], "知らせの印：同じ中身は同じ印（毎日同じ Issue のコメントを重ねない）");
  const many = buildCalendarData({ fetchedMonths: [parsed(2026, 11, Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, [[500 + i, "cat13", "メディア", `番組${i}`]]])))], now: NOW }).data;
  const ids = eventsNeedingDetail(many.events, NOW);
  assertEqual([ids.length, ids[0]], [8, 522], "詳細を読む予定：前の日〜60日先だけ・近い順（11月23日の予定から）");
}

// ---- 6. 画面の決まり（絞り込み・札・アプリの中のリンク） ----
function runModelTests() {
  const base = { id: "els-1", sourceId: 1, dates: ["2026-11-24"], title: "t", category: "tv", memberIds: ["noguchi-iori"], scope: "members", status: "scheduled", missing: false };
  assertEqual(
    [matchesFilter(base, { category: "tv" }), matchesFilter(base, { category: "radio" }), matchesFilter(base, { category: "solo" }), matchesFilter(base, { member: "noguchi-iori" }), matchesFilter(base, { member: "oba-hana" }), matchesFilter(base, { member: "group" })],
    [true, false, true, true, false, false],
    "絞り込み：種類・個人活動・メンバー・グループ全体"
  );
  assertEqual(matchesFilter({ ...base, memberIds: [], scope: "unknown" }, { member: "noguchi-iori" }), false, "出演者が分からない予定に、メンバーの名前を付けない（メンバーで絞ると出ない）");
  assertEqual(eventBadges({ ...base, status: "cancelled" }, "2026-12-01").map((badge) => badge.key), ["cancelled"], "札：中止の過去の予定に「終了」を付けない");
  assertEqual(eventBadges(base, "2026-12-01").map((badge) => badge.key), ["done"], "札：過ぎた予定は「終了」");
  assertEqual(eventBadges({ ...base, missing: true }, "2026-11-01").map((badge) => badge.key), ["missing"], "札：見当たらない予定");
  const debut = eventAppLinks({ ...base, category: "release", dates: ["2017-09-06"], memberIds: [] });
  assertEqual(debut.map((link) => link.target.kind), ["cdBonus"], "リンク：発売日が CD 図鑑の作品と同じ → CD・特典映像図鑑");
  const dome = eventAppLinks({ ...base, category: "live", dates: ["2027-02-24"], memberIds: [] });
  assertEqual(dome.map((link) => link.target.kind), ["liveHub"], "リンク：ライブの記録に同じ日の公演がある → ライブページ");
  assertEqual(eventAppLinks({ ...base, category: "live", dates: ["2026-11-03"], memberIds: [] }), [], "リンク：対応するページが無ければ作らない（公式へのリンクだけ）");
  assertEqual(uncoveredMonths({ "2026-11": "x" }, "2026-10-01", "2026-12-31"), ["2026-10", "2026-12"], "収録していない月を見つける");
}

// ---- 7. 読み込み（端末） ----
async function runLoaderTests() {
  const respond = (map) => async (url) => {
    const value = map[url];
    if (value === undefined) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => (typeof value === "function" ? value() : value) };
  };
  const data = toStoredCalendarData(buildCalendarData({ fetchedMonths: [parsed(2026, 11, { 3: [[1, "cat13", "メディア", "番組"]] })], now: NOW }).data);
  setCalendarSnapshotForTest(null);
  await loadCalendarData({ fetchImpl: respond({ "data/calendar/official-schedule-seed.json": data }), now: () => NOW });
  assertEqual([getCalendarSnapshot().state, getCalendarSnapshot().source, getCalendarSnapshot().events.length], ["ready", "seed", 1], "毎日のデータが無いとき：土台を読んで出す（そのことを画面に出す）");
  setCalendarSnapshotForTest(null);
  await loadCalendarData({ fetchImpl: respond({}), now: () => NOW });
  assertEqual(getCalendarSnapshot().state, "missing", "どちらも無いとき：無いと分かる状態");
  setCalendarSnapshotForTest(null);
  await loadCalendarData({ fetchImpl: respond({ "data/official-schedule.json": { schema: 1, events: [{ bad: 1 }] }, "data/calendar/official-schedule-seed.json": data }), now: () => NOW });
  assertEqual(getCalendarSnapshot().source, "seed", "毎日のデータが壊れているとき：中身は出さず、土台を使う");
  assertEqual(interpretCalendarData(data, { now: new Date("2026-12-10T00:00:00Z") }).state, CALENDAR_STATE.STALE, "最後の取得から8日以上：「更新が止まっています」の状態");
}

// ---- 8. 質問AI ----
function qaSnapshot() {
  const t0 = new Date("2026-11-23T00:00:00Z");
  const months = [
    parsed(2026, 11, {
      23: [[1, "cat13", "メディア", "ニッポン放送「ダミー」"]],
      24: [[2, "cat13", "メディア", "フジテレビ系「ダミー」※野口衣織"]],
      27: [[3, "cat12", "ライブ/イベント", "ダミーフェス※＝LOVE"]],
      30: [[4, "cat12", "ライブ/イベント", "【中止】ダミー公演"]],
    }),
    parsed(2026, 12, { 5: [[5, "cat12", "ライブ/イベント", "ダミーツアー 東京公演"]], 7: [[6, "cat13", "メディア", "日本テレビ「ダミー」※大場花菜"]] }),
  ];
  const data = buildCalendarData({ fetchedMonths: months, now: t0 }).data;
  setCalendarSnapshotForTest(interpretCalendarData(toStoredCalendarData(data), { now: NOW }));
}

function runQaTests() {
  qaSnapshot();
  const ask = (text) => answerQuestion(text, { today: "2026-11-24" });
  const week = ask("今週のイコラブの予定は？");
  assertEqual([week.intent, week.status, week.details.length], ["calendar", "answer", 4], "質問AI：今週の予定（11月23日〜29日の3件＋26日の齋藤樹愛羅の誕生日。30日は来週）");
  const nextWeek = ask("来週のライブは？");
  assertEqual([nextWeek.status, nextWeek.details.length], ["answer", 2], "質問AI：来週のライブ（月をまたいで11月30日〜12月6日。中止の予定も【中止】と付けて出す）");
  assertEqual(nextWeek.details[0].includes("【中止】"), true, "質問AI：中止の予定は【中止】と分かるように");
  const tv = ask("今月のテレビ出演は？");
  assertEqual([tv.status, tv.details.length, /フジテレビ/.test(tv.details[0])], ["answer", 1, true], "質問AI：今月のテレビ（ラジオは数えない）");
  const noguchi = ask("野口衣織の今後の予定は？");
  assertEqual([noguchi.intent, noguchi.status, noguchi.details.length], ["calendar", "answer", 2], "質問AI：メンバーの今後の予定（11月24日の番組＋2027年4月26日の誕生日。ほかのメンバーの予定を混ぜない）");
  const nextLive = ask("次のライブはいつ？");
  assertEqual([nextLive.status, nextLive.text.includes("2026年11月27日")], ["answer", true], "質問AI：次のライブ（中止の予定は飛ばす）");
  const past = ask("2026年11月に何があった？");
  assertEqual([past.status, past.text.includes("6件")], ["answer", true], "質問AI：過去の年月に何があったか（予定4件＋誕生日2件：26日 齋藤樹愛羅・30日 山本杏奈）");
  const none = ask("明日の予定は？");
  assertEqual([none.status, none.text.startsWith("現在収録されている公式予定では")], ["notFound", true], "質問AI：予定が無い日：推測せず「収録されている公式予定では確認できません」");
  const old = ask("2016年5月に何があった？");
  assertEqual([old.status, old.details.some((line) => line.includes("まだ収録できていません"))], ["notFound", true], "質問AI：収録していない期間は、そう言う（予定が無かったとは言わない）");
  assertEqual(ask("呪って呪っては何枚目のシングル？").intent === "calendar", false, "質問AI：今までの質問（何枚目のシングル）は今までどおり");
  assertEqual(ask("野口衣織の誕生日は？").intent === "calendar", false, "質問AI：メンバーの誕生日の質問は今までどおり");
  assertEqual(ask("最新情報は？").intent === "calendar", false, "質問AI：「最新情報」は NEWS のまま");
  assertEqual([ask("大谷映美里は今何をしている？").intent === "calendar", ask("野口衣織の加入前は何をしていた？").intent === "calendar", ask("野口衣織のテレビ出演は？").intent === "calendar"], [false, false, false], "質問AI：「今何をしている」「加入前」「○○のテレビ出演」は今までの答え（個人ページ・テレビ出演）のまま");
  assertEqual(ask("2026年11月は何をしていた？").intent, "calendar", "質問AI：「2026年11月は何をしていた？」（年月がある）はカレンダーで答える");
  setCalendarSnapshotForTest({ state: "missing", events: [], months: {} });
  const missing = ask("今週の予定は？");
  assertEqual([missing.status, missing.text.includes("読み込めていない")], ["notFound", true], "質問AI：カレンダーのデータが無いときは、そう言う");
}

// ---- 9. 画面（DOM） ----
async function runScreenTests() {
  qaSnapshot();
  const container = document.createElement("div");
  document.body.appendChild(container);
  initCalendarScreen({ container }, { now: () => NOW });
  resetCalendarScreenStateForTest();
  openCalendar({ date: "2026-11-24" });
  const rows = [...container.querySelectorAll(".cal-week:not(.cal-week-head)")];
  assertEqual([rows.length, rows.every((row) => row.children.length === 7)], [6, true], "画面：2026年11月は6週・どの週も7列");
  assertEqual([container.querySelector(".cal-cell.is-today")?.dataset.date, container.querySelector('.cal-cell[aria-pressed="true"]')?.dataset.date], ["2026-11-24", "2026-11-24"], "画面：今日の印と、選んだ日");
  assertEqual(container.querySelectorAll(".cal-event").length, 1, "画面：選んだ日の予定が下に出る");
  const link = container.querySelector(".cal-event .cal-link-official");
  assertEqual([link.href, link.rel, link.target], ["https://equal-love.jp/schedule/detail/2", "noopener noreferrer", "_blank"], "画面：公式サイトへのリンク（新しいタブ・noopener）");
  container.querySelector('.cal-cell[data-date="2026-11-25"]').click();
  assertEqual(container.querySelector(".cal-empty")?.textContent, "収録されている公式の予定はありません。", "画面：予定の無い日");
  container.querySelector('.cal-nav-arrow[aria-label="次の月"]').click();
  container.querySelector('.cal-nav-arrow[aria-label="次の月"]').click();
  assertEqual(container.querySelector(".cal-coverage-note")?.textContent, "この月の公式情報は、まだ収録できていません。", "画面：収録していない月は、そう出す");
  container.querySelector(".cal-today-button").click();
  assertEqual(container.querySelector('.cal-cell[aria-pressed="true"]')?.dataset.date, "2026-11-24", "画面：今日へ戻る");
  container.querySelector('.cal-chip[data-cat="radio"]').click();
  assertEqual([...container.querySelectorAll(".cal-cell.has-events")].map((cell) => cell.dataset.date), ["2026-11-23"], "画面：種類で絞り込む（ラジオだけ）");
  // 外の文字を HTML として入れない
  const data = buildCalendarData({ fetchedMonths: [parsed(2026, 11, { 24: [[9, "cat13", "メディア", "&lt;img src=x onerror=alert(1)&gt;"]] })], now: NOW }).data;
  setCalendarSnapshotForTest(interpretCalendarData(toStoredCalendarData(data), { now: NOW }));
  resetCalendarScreenStateForTest();
  openCalendar({ date: "2026-11-24" });
  assertEqual([container.querySelector(".cal-event-title")?.textContent, container.querySelector(".cal-event img")], ["<img src=x onerror=alert(1)>", null], "画面：タイトルの < > は文字として出す（タグにしない）");
  container.remove();
  setCalendarSnapshotForTest(null);
}

// ---- 10. 取得済みの予定を長く失わない（2026-11-25 本人の確認の依頼） ----
// 前のデータ＝土台（git）＋公開中のデータ（Pages）＋長く残す記録（git の枝 calendar-data）。どれかが欠けても、ほかから引き継ぐ
function previousFrom(...sources) {
  const merged = mergePreviousSources(...sources);
  return merged.events.length ? { schema: 1, source: "test", fetchedAt: null, lastAttempt: null, coverage: null, months: merged.months, events: merged.events } : null;
}

function runPersistenceTests() {
  const t0 = new Date("2026-11-24T00:00:00Z");
  // 土台（git）：2026年11月までの予定
  const seed = buildCalendarData({ fetchedMonths: [parsed(2026, 11, { 3: [[1, "cat13", "メディア", "番組A"]] })], now: t0 }).data;
  // 2027年4月に100件が新しく発表された日の取得（毎日の手順）
  const april = Object.fromEntries(Array.from({ length: 25 }, (_, i) => [i + 1, Array.from({ length: 4 }, (_, k) => [10000 + i * 4 + k, "cat13", "メディア", `新しい番組${i}-${k}`])]));
  const t1 = new Date("2027-03-20T00:00:00Z");
  const day1 = buildCalendarData({ previous: previousFrom(seed), fetchedMonths: [parsed(2027, 4, april)], now: t1 }).data;
  assertEqual(day1.events.length, 101, "長く残す：2027年4月に100件が追加された（土台の1件＋100件）");
  // その日の記録（calendar-data）を書く
  const archiveUpdate = decideArchiveUpdate({ archive: seed, next: day1 });
  assertEqual(archiveUpdate.update, true, "長く残す：予定が増えた日は、記録の枝に書く");
  const archive = day1;
  // 新しい版を公開 → Pages が作り直され、公開中のデータが一時的に無い・壊れている
  const t2 = new Date("2027-05-10T00:00:00Z");
  const afterRedeploy = buildCalendarData({ previous: previousFrom(seed, null, archive), fetchedMonths: [parsed(2027, 5, {})], now: t2 }).data;
  assertEqual(afterRedeploy.events.filter((event) => event.sourceId >= 10000).length, 100, "長く残す：Pages のデータが無くなっても、記録から100件を引き継ぐ");
  // 公式サイトに繋がらない日（取得の失敗）：前のデータのまま
  const failDay = decideCalendarPublication({ fresh: { ok: false, error: "通信の失敗" }, previous: previousFrom(seed, afterRedeploy, archive), now: t2 });
  assertEqual(failDay.data.events.length, 101, "長く残す：取得に失敗した日も、取得済みの予定は全部残る");
  // 前の版へ戻した（カレンダーの無い版を公開して、Pages からデータが消えた）→ また戻したとき、記録から全部戻る
  const restored = buildCalendarData({ previous: previousFrom(seed, null, archive), fetchedMonths: [parsed(2027, 6, {})], now: new Date("2027-06-01T00:00:00Z") }).data;
  assertEqual(restored.events.length, 101, "長く残す：前の版に戻して Pages のデータが消えても、記録から全部戻る");
  // 何か月も更新が止まっても、記録・公開中のデータは消さない（古いと出すだけ）
  assertEqual(interpretCalendarData(toStoredCalendarData(archive), { now: new Date("2027-12-01T00:00:00Z") }).events.length, 101, "長く残す：何か月も更新が止まっても、出す予定は減らない（「更新が止まっています」と出す）");
  // 記録の書き方：取得日時だけが違う日は書かない／記録より予定が減るデータでは書かない／壊れたデータでは書かない
  const sameAgain = buildCalendarData({ previous: day1, fetchedMonths: [parsed(2027, 4, april)], now: new Date("2027-03-21T00:00:00Z") }).data;
  assertEqual(decideArchiveUpdate({ archive: day1, next: sameAgain }).update, false, "記録：中身が同じ日（取得日時だけが違う）は書かない（無意味なコミットを作らない）");
  assertEqual(decideArchiveUpdate({ archive: day1, next: seed }).update, false, "記録：記録より予定が少ないデータでは書かない（消さない）");
  assertEqual(decideArchiveUpdate({ archive: day1, next: { schema: 1, events: [{ id: "bad" }] } }).update, false, "記録：形の壊れたデータでは書かない");
  assertEqual(decideArchiveUpdate({ archive: null, next: seed }).update, true, "記録：まだ記録が無いときは作る");
}

async function runWorkflowTests() {
  const deploy = await fetchText("./.github/workflows/deploy-pages.yml");
  const archive = await fetchText("./.github/workflows/calendar-archive.yml");
  assertEqual(/contents:\s*write/.test(deploy) || /git (push|commit)/.test(deploy), false, "ワークフロー：公開のワークフローは読むだけのまま（git に書かない）");
  assertEqual(deploy.includes("--archive-url \"https://raw.githubusercontent.com/togashi-sota/equal-love-intro-quiz/calendar-data/calendar/official-schedule-archive.json\""), true, "ワークフロー：毎日の取得は、長く残す記録も前のデータとして読む");
  assertEqual(deploy.includes("＝LOVEカレンダーのデータが無いときは、前のデータを入れ直す"), true, "ワークフロー：データが作れなかった日も、前のデータを入れ直して公開から消さない");
  const pushes = archive.match(/git push[^\n]*/g) ?? [];
  assertEqual(pushes, ["git push origin calendar-data"], "記録のワークフロー：送る先は calendar-data の枝だけ（master には書かない）");
  assertEqual(archive.includes('test "$(git diff --cached --name-only)" = "calendar/official-schedule-archive.json"'), true, "記録のワークフロー：コミットするのは記録の1ファイルだけ（ほかのファイルが混ざったら止まる）");
  assertEqual(/youtube/i.test(archive.replace(/YouTube のデータは入れない/g, "")), false, "記録のワークフロー：YouTube のデータ・キーに触れない");
  assertEqual(archive.includes("workflows: [\"Deploy to GitHub Pages\"]") && archive.includes("ref: master"), true, "記録のワークフロー：公開のあとに、master のスクリプトで動く");
}

// ---- 11. メンバーの誕生日・＝LOVE の記念日（2026-11-26 本人の依頼） ----
// 期待値は、公式プロフィール（js/data/members.js の生年月日）・公式 ABOUT（結成 2017-04-29）・1stシングルの発売日（2017-09-06）から人が書いた
function runGeneratedEventsTests() {
  const t0 = new Date("2026-11-20T00:00:00Z");
  // 公式 SCHEDULE の 2021年の誕生日（齋藤樹愛羅）が入っているデータ
  const data = buildCalendarData({ fetchedMonths: [parsed(2021, 11, { 26: [[7001, "cat15", "誕生日", "齋藤 樹愛羅 Birthday"]] }), parsed(2026, 11, { 26: [[7002, "cat13", "メディア", "ダミー番組"]] })], now: t0 }).data;
  const all = withGeneratedEvents(data.events, "2026-11-26");
  const titles = (date, filter = {}) => eventsOnDate(all, date, filter).map((event) => event.title);
  assertEqual(titles("2026-11-26").includes("齋藤樹愛羅の誕生日（22歳）"), true, "誕生日：2026年11月26日は齋藤樹愛羅の誕生日（2004年生まれ・22歳）");
  assertEqual(titles("2021-11-26"), ["齋藤 樹愛羅 Birthday"], "誕生日：公式 SCHEDULE に同じ日の誕生日があれば、そちらだけ（二重にしない）");
  assertEqual([titles("2017-02-04"), titles("2018-02-04")], [[], ["大場花菜の誕生日（18歳）"]], "誕生日：加入（2017年4月29日）より前の日には出さない");
  assertEqual(all.some((event) => event.category === "birthday" && event.memberIds.includes("satake-nonno")), false, "誕生日：生年月日のデータが無いメンバー（佐竹のん乃）には推測で付けない");
  assertEqual(titles("2026-11-30", { member: "yamamoto-anna" }), ["山本杏奈の誕生日（29歳）"], "誕生日：メンバーで絞り込める");
  assertEqual(titles("2026-11-26", { category: "solo" }).some((title) => title.includes("誕生日")), false, "誕生日は「個人活動」の絞り込みには入れない");
  assertEqual(titles("2026-11-26", { category: "birthday" }), ["齋藤樹愛羅の誕生日（22歳）"], "誕生日：種類「誕生日」で絞り込める");
  assertEqual(titles("2017-04-29", { category: "anniversary" }), ["＝LOVE 結成（最終審査でメンバー決定・グループ名「＝LOVE」を発表）"], "記念日：2017年4月29日は結成の日");
  assertEqual([titles("2026-04-29", { category: "anniversary" }), titles("2026-09-06", { category: "anniversary" }), titles("2027-09-06", { category: "anniversary" })], [["＝LOVE 結成記念日（結成9周年）"], ["＝LOVE デビュー記念日（デビュー9周年）"], ["＝LOVE デビュー記念日（デビュー10周年）"]], "記念日：毎年の結成記念日・デビュー記念日（周年の数）");
  assertEqual(titles("2017-09-06", { category: "anniversary" }), [], "記念日：デビューの日（2017年9月6日）そのものは、公式の発売日の予定と重ねない（記念日は2018年から）");
  assertEqual([titles("2017-01-28", { category: "anniversary" }).length, titles("2017-08-05", { category: "anniversary" })[0]], [1, "TOKYO IDOL FESTIVAL 2017でお披露目（メンバー初ステージ）"], "記念日：オーディションの開催発表・初ステージ（年表にあるもの）");
  const formation = eventsOnDate(all, "2026-04-29", { category: "anniversary" })[0];
  assertEqual([formation.url, eventAppLinks(formation).map((link) => link.target.kind), eventBadges(formation, "2026-11-26")], ["https://equal-love.jp/feature/about", ["anniversary"], []], "記念日：公式 ABOUT へのリンク・周年ヒストリーへのリンク・「終了」を付けない");
  assertEqual(withGeneratedEvents(data.events, "2026-11-26") === all, true, "同じデータからは作り直さない（速さ）");
  assertEqual(validateCalendarData(data).ok && data.events.every((event) => !event.derived), true, "誕生日・記念日は保存するデータ（公式 SCHEDULE）には混ぜない");
  // 質問AI
  setCalendarSnapshotForTest(interpretCalendarData(toStoredCalendarData(data), { now: new Date("2026-11-26T00:00:00Z") }));
  const today = answerQuestion("今日の予定は？", { today: "2026-11-26" });
  assertEqual(today.details.some((line) => line.includes("齋藤樹愛羅の誕生日")), true, "質問AI：今日の予定に誕生日も入る");
  const nextAnniv = answerQuestion("次の記念日は？", { today: "2026-11-26" });
  assertEqual(nextAnniv.text.includes("2027年4月29日"), true, "質問AI：次の記念日（2027年4月29日の結成記念日）");
  setCalendarSnapshotForTest(null);
}

export async function runCalendarTests() {
  console.log("\n=== ＝LOVEカレンダー ===");
  await runFixtureTests();
  runStructureTests();
  runDateTests();
  runRangeTests();
  runClassifyTests();
  runBuildTests();
  runPublicationTests();
  runModelTests();
  await runLoaderTests();
  runQaTests();
  await runScreenTests();
  runPersistenceTests();
  await runWorkflowTests();
  runGeneratedEventsTests();
}
