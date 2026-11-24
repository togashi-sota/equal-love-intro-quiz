// ＝LOVEカレンダー：公式サイト（equal-love.jp）の SCHEDULE から予定のデータを作る（2026-11-24新設）。
// YouTube 出演図鑑・＝LOVE 最新情報の自動更新とは別の手順。どれが失敗しても、ほかは止めない。
//
// 使い方：
//   node scripts/calendar/refresh-calendar.mjs --trigger schedule
//       … 定期の取得：今月の1か月前〜4か月先の月のページ（6回）＋近い予定の詳細（最大25回）。3秒ずつ空ける
//         前のデータ = 土台（data/calendar/official-schedule-seed.json）＋公開中のデータ（--previous-url）。消さずに足す
//         書き出すのは data/official-schedule.json だけ（git に入れない）
//   node scripts/calendar/refresh-calendar.mjs --backfill 2017-09:2026-10
//       … 手元で1回だけ：過去の月を読んで、土台のファイルに足す（詳細のページは読まない）
//   node scripts/calendar/refresh-calendar.mjs --seed-details
//       … 手元で：土台のうち近い予定の詳細を読んで、土台に足す
//   node scripts/calendar/refresh-calendar.mjs --seed-only
//       … 公式サイトを読まずに、土台から data/official-schedule.json を作る（手元の確認用）
//   --from-html <フォルダ>：保存した HTML（month-2026-11.html・detail-11688.html）から作る（ネットを使わない。テスト用）
//
// 外の障害（公式サイトが落ちている・形が変わった）では失敗にしない（終わりのコードは 0）。結果は GITHUB_OUTPUT に書く：
//   fresh（取り直せたか）・wrote（データを書いたか）・alert（本人に知らせるか）・action（何をしたか）
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const core = await import(pathToFileURL(path.join(REPO, "js/calendarCore.js")).href);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

const trigger = argValue("--trigger") ?? "push";
const fromHtml = argValue("--from-html");
const previousUrl = argValue("--previous-url");
const reportFile = argValue("--report");
const backfill = argValue("--backfill");
const seedDetails = hasFlag("--seed-details");
const seedOnly = hasFlag("--seed-only");
const outFile = path.join(REPO, core.CALENDAR_DATA_PATH);
const seedFile = path.join(REPO, core.CALENDAR_SEED_PATH);

// 公式サイトへの負荷を小さくする：1回ずつ3秒空ける・20秒で打ち切る・5xx のときだけ1回やり直す（10秒後）
const WAIT_MS = 3000;
const TIMEOUT_MS = 20000;
const MAX_REQUESTS = backfill ? 200 : 40;
const USER_AGENT = "EqualLoveIntroQuiz-CalendarCheck/1.0 (personal fan app; https://togashi-sota.github.io/equal-love-intro-quiz/)";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let requestCount = 0;

async function getHtml(url) {
  // 取りに行くのは公式サイトの SCHEDULE だけ
  if (!/^https:\/\/equal-love\.jp\/schedule\/(calender\/\d{4}\/\d{1,2}\/|detail\/\d{1,9})$/.test(url)) throw new Error(`決めた場所以外の URL：${url}`);
  if (requestCount >= MAX_REQUESTS) throw new Error("1回のアクセスの上限に達した");
  const where = new URL(url).pathname;
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (requestCount > 0) await sleep(attempt === 1 ? WAIT_MS : 10000);
    requestCount += 1;
    let response;
    try {
      response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      lastError = new Error(`${where} に繋がらない（${error?.name ?? "通信の失敗"}）`);
      continue;
    }
    if (response.ok) return response.text();
    lastError = new Error(`${where} が HTTP ${response.status}`);
    if (response.status < 500) break;
  }
  throw lastError;
}

async function readSaved(name) {
  const file = path.join(fromHtml, name);
  if (!existsSync(file)) throw new Error(`保存した HTML が無い：${name}`);
  return readFile(file, "utf8");
}

const monthHtml = (key) => (fromHtml ? readSaved(`month-${key}.html`) : getHtml(core.scheduleMonthUrl(key)));
const detailHtml = (id) => (fromHtml ? readSaved(`detail-${id}.html`) : getHtml(core.scheduleDetailUrl(id)));

async function setOutput(values) {
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}

async function readJson(file) {
  try {
    return existsSync(file) ? core.fromStoredCalendarData(JSON.parse(await readFile(file, "utf8"))) : null;
  } catch (error) {
    console.log(`${path.basename(file)} が読めない（${error?.name}）`);
    return null;
  }
}

async function loadPreviousLive() {
  if (!previousUrl) return null;
  try {
    const response = await fetch(previousUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (response.ok) return core.fromStoredCalendarData(await response.json());
    console.log(`公開中のデータは無い（HTTP ${response.status}）`);
  } catch (error) {
    console.log(`公開中のデータは読めませんでした（${error?.name ?? "エラー"}）`);
  }
  return null;
}

const valid = (data) => (data && core.validateCalendarData(data).ok ? data : null);

async function readMonths(keys) {
  const fetched = [];
  for (const key of keys) {
    try {
      fetched.push(core.parseScheduleMonthHtml(await monthHtml(key), key));
    } catch (error) {
      fetched.push({ ok: false, monthKey: key, items: [], problems: [], error: String(error?.message ?? error).slice(0, 200) });
    }
    const last = fetched.at(-1);
    console.log(`${key}：${last.ok ? `${last.items.length} 件` : `読めない（${last.error}）`}`);
  }
  return fetched;
}

async function readDetails(ids) {
  const details = new Map();
  const warnings = [];
  for (const id of ids) {
    try {
      const parsed = core.parseScheduleDetailHtml(await detailHtml(id));
      if (parsed.ok) details.set(id, parsed);
      else warnings.push(`詳細 ${id} が読めない（${parsed.error}）`);
    } catch (error) {
      warnings.push(`詳細 ${id} が読めない（${String(error?.message ?? error).slice(0, 120)}）`);
    }
  }
  return { details, warnings };
}

async function writeData(file, fullData) {
  await mkdir(path.dirname(file), { recursive: true });
  const data = core.toStoredCalendarData(fullData);
  // 土台は差分が読みやすいように1件1行、公開用は詰める
  const text = file === seedFile ? `{"schema":${data.schema},"compact":1,"source":${JSON.stringify(data.source)},"fetchedAt":${JSON.stringify(data.fetchedAt)},"lastAttempt":${JSON.stringify(data.lastAttempt)},"coverage":${JSON.stringify(data.coverage)},"months":${JSON.stringify(data.months)},"events":[\n${data.events.map((event) => JSON.stringify(event)).join(",\n")}\n]}\n` : JSON.stringify(data);
  await writeFile(file, text, "utf8");
}

const now = new Date();
const seed = valid(await readJson(seedFile));

// ---- 手元：過去の月を土台に足す ----
if (backfill) {
  const [from, to] = backfill.split(":");
  if (!core.parseMonthKey(from) || !core.parseMonthKey(to) || from < core.SCHEDULE_EARLIEST_MONTH) throw new Error("--backfill は 2017-09:2026-10 の形で");
  const fetchedMonths = await readMonths(core.monthRange(from, to));
  const { data, report } = core.buildCalendarData({ previous: seed, fetchedMonths, now });
  const failed = fetchedMonths.filter((month) => !month.ok);
  await writeData(seedFile, data);
  console.log(`土台に書いた：${data.events.length} 件（新しく ${report.added.length}・読めない月 ${failed.length}：${failed.map((month) => month.monthKey).join(", ")}）アクセス ${requestCount} 回`);
  process.exit(0);
}

// ---- 手元：土台の近い予定の詳細を読む ----
if (seedDetails) {
  if (!seed) throw new Error("土台が無い");
  const ids = core.eventsNeedingDetail(seed.events, now);
  const { details, warnings } = await readDetails(ids);
  const monthsOfIds = [...new Set(seed.events.filter((event) => details.has(event.sourceId)).flatMap((event) => event.dates.map((date) => date.slice(0, 7))))];
  // 詳細だけを入れる：その月を前のデータから作り直す（月のページは読まない）
  const fetchedMonths = monthsOfIds.map((key) => ({ ok: true, monthKey: key, items: seed.events.filter((event) => !event.missing && event.dates.some((date) => date.startsWith(key))).flatMap((event) => event.dates.filter((date) => date.startsWith(key)).map((date) => ({ sourceId: event.sourceId, date, siteCategory: event.siteCategory, title: event.title }))) }));
  const { data } = core.buildCalendarData({ previous: seed, fetchedMonths, details, now, lastAttempt: seed.lastAttempt });
  data.months = seed.months;
  data.fetchedAt = seed.fetchedAt;
  await writeData(seedFile, data);
  console.log(`詳細 ${details.size} / ${ids.length} 件を土台に入れた。注意：${warnings.join("／") || "なし"}`);
  process.exit(0);
}

// ---- 手元：土台だけから公開用のファイルを作る ----
if (seedOnly) {
  if (!seed) throw new Error("土台が無い");
  await writeData(outFile, seed);
  console.log(`書き出し：${core.CALENDAR_DATA_PATH}（土台から ${seed.events.length} 件）`);
  process.exit(0);
}

// ---- 定期の取得 ----
const live = valid(await loadPreviousLive());
const merged = core.mergePreviousSources(seed, live);
const previous = merged.events.length ? { schema: core.CALENDAR_SCHEMA, source: core.CALENDAR_SOURCE_LABEL, fetchedAt: live?.fetchedAt ?? seed?.fetchedAt ?? null, lastAttempt: live?.lastAttempt ?? null, coverage: null, months: merged.months, events: merged.events } : null;
const previousValid = valid(previous);
let fresh;
let check = null;
let report = null;
const warnings = [];
try {
  const fetchedMonths = await readMonths(core.monthsToRefresh(now));
  fetchedMonths.filter((month) => month.ok).forEach((month) => {
    month.items.filter((item) => item.unknownCategory !== null).forEach((item) => warnings.push(`知らないカテゴリ「${item.unknownCategory}」（予定 ${item.sourceId}）→「その他」にした`));
    month.problems.forEach((problem) => warnings.push(`予定 ${problem.sourceId}（${problem.date}）：${problem.reason}`));
  });
  // 詳細：月のページで見つけた予定（新しいもの含む）から、近い順に
  const first = core.buildCalendarData({ previous: previousValid, fetchedMonths, now });
  const detailIds = core.eventsNeedingDetail(first.data.events, now);
  const detailResult = await readDetails(detailIds);
  warnings.push(...detailResult.warnings);
  const built = core.buildCalendarData({ previous: previousValid, fetchedMonths, details: detailResult.details, now });
  report = built.report;
  if (report.suspiciousMonths.length) warnings.push(`前は予定があったのに0件になった月（形が変わった可能性。前のまま）：${report.suspiciousMonths.join(", ")}`);
  check = core.checkCalendarPublication({ data: built.data, fetchedMonths, previous: previousValid, now });
  warnings.push(...check.warnings);
  fresh = check.ok ? { ok: true, data: built.data } : { ok: false, error: `検査に通らない：${check.errors.join("／")}` };
  console.log(`アクセス ${requestCount} 回・予定 ${built.data.events.length} 件（新しく ${report.added.length}・変わった ${report.changed.length}・見当たらない ${report.missing.length}）・詳細 ${detailResult.details.size}/${detailIds.length}`);
} catch (error) {
  fresh = { ok: false, error: String(error?.message ?? error) };
}

const decision = core.decideCalendarPublication({ fresh, previous: previousValid, now });
console.log(`判断：${decision.action}（${decision.reason}）`);
if (decision.data) {
  if (!core.validateCalendarData(decision.data).ok) throw new Error("公開するデータの形が正しくない");
  await writeData(outFile, decision.data);
  console.log(`書き出し：${core.CALENDAR_DATA_PATH}（${decision.data.events.length} 件）`);
}
// 知らせるのは「失敗・形の変化の注意・見当たらなくなった予定」のときだけ（日時の変更は Issue の本文に書くが、それだけでは知らせない。毎日の Issue を増やさない）
const alert = decision.alert || warnings.length > 0 || Boolean(report?.missing?.length);
if (alert && reportFile) await writeFile(reportFile, core.describeCalendarRefreshForIssue({ decision, check, report, warnings, trigger, runUrl: process.env.RUN_URL ?? "" }), "utf8");
await setOutput({ action: decision.action, fresh: decision.action === "write-fresh" ? "true" : "false", wrote: decision.data ? "true" : "false", alert: alert ? "true" : "false" });
