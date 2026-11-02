// ＝LOVE 最新情報：公開のたびに、公式サイト（equal-love.jp）の NEWS の一覧からデータを作る（2026-11-03新設・R11 D）。
// YouTube 出演図鑑の自動更新（scripts/youtube/refresh.mjs）とは別の手順。どちらが失敗しても、もう一方は止めない。
//
// 使い方：
//   node scripts/news/refresh-news.mjs --trigger schedule                    … 公式サイトを読む（NEWS 1〜5ページ＋DISCOGRAPHY 1ページ。3秒ずつ空ける）
//   node scripts/news/refresh-news.mjs --trigger push --from-html <フォルダ>  … 保存した HTML（news-page1.html…・discography.html）から作る（ネットを使わない）
//   追加の指定：--previous-url <公開中のデータの URL> または --previous-file <ファイル>（前に公開したデータ。無ければ無しで作る）
//              --report <ファイル>（Issue の本文を書く所）
//
// 書き出すのは data/official-news.json だけ（git に入れない。.gitignore 済み）。ほかのファイルには一切触れない。
// 外の障害（公式サイトが落ちている・形が変わった）では失敗にしない（終わりのコードは 0）。結果は GITHUB_OUTPUT に書く：
//   fresh（取り直せたか）・wrote（データを書いたか）・alert（本人に知らせるか）・action（何をしたか）
// 取れなかったときに成功したふりをしない：前のデータを使うときは lastAttempt.ok=false を書き、アプリが「直近の取得に失敗」と出す。
import { readFile, writeFile, mkdir, rm, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const load = (relative) => import(pathToFileURL(path.join(REPO, relative)).href);

const core = await load("js/officialNewsCore.js");
const { OFFICIAL_NEWS_DATA_PATH, OFFICIAL_NEWS_LIST_URL, validateOfficialNewsData } = await load("js/officialNewsData.js");
const { MEMBERS } = await load("js/data/members.js");
const cdBonus = await load("js/data/cdBonus.js");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const trigger = argValue("--trigger") ?? "push";
const fromHtml = argValue("--from-html");
const previousUrl = argValue("--previous-url");
const previousFile = argValue("--previous-file");
const reportFile = argValue("--report");
const outRelative = OFFICIAL_NEWS_DATA_PATH;
if (!core.isAllowedNewsOutput(outRelative)) throw new Error("書き出し先が決まりと違う");
const outFile = path.join(REPO, outRelative);
const memberIds = new Set(MEMBERS.map((member) => member.id));

// 公式サイトへの負荷を小さくする：1回ずつ3秒空ける・20秒で打ち切る・失敗は1回だけやり直す（10秒後）
const WAIT_MS = 3000;
const TIMEOUT_MS = 20000;
const USER_AGENT = "EqualLoveIntroQuiz-NewsCheck/1.0 (personal fan app; https://togashi-sota.github.io/equal-love-intro-quiz/)";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let requestCount = 0;

async function getHtml(url) {
  const where = new URL(url).pathname;
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (requestCount > 0) await sleep(attempt === 1 ? WAIT_MS : 10000);
    requestCount += 1;
    let response;
    try {
      response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (error) {
      lastError = new Error(`${where} に繋がらない（${error?.name ?? "通信の失敗"}）`);
      continue;
    }
    if (response.ok) return response.text();
    lastError = new Error(`${where} が HTTP ${response.status}`);
    if (response.status < 500) break; // 4xx はやり直しても同じ
  }
  throw lastError;
}

async function readSaved(name) {
  const file = path.join(fromHtml, name);
  if (!existsSync(file)) throw new Error(`保存した HTML が無い：${name}`);
  return readFile(file, "utf8");
}

const newsPageUrl = (pageNumber) => (pageNumber === 1 ? OFFICIAL_NEWS_LIST_URL : `${OFFICIAL_NEWS_LIST_URL}?page=${pageNumber}`);
const newsPageHtml = (pageNumber) => (fromHtml ? readSaved(`news-page${pageNumber}.html`) : getHtml(newsPageUrl(pageNumber)));
const discographyHtml = () => (fromHtml ? readSaved("discography.html") : getHtml("https://equal-love.jp/discography/"));

async function setOutput(values) {
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}

// 前に公開したデータ（公開中のサイトから、またはファイルから）。読めなければ null
async function loadPrevious() {
  try {
    if (previousFile && existsSync(previousFile)) return JSON.parse(await readFile(previousFile, "utf8"));
    if (previousUrl) {
      const response = await fetch(previousUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (response.ok) return await response.json();
      console.log(`前に公開したデータは無い（HTTP ${response.status}）`);
    }
  } catch (error) {
    console.log(`前に公開したデータは読めませんでした（${error?.name ?? "エラー"}）`);
  }
  return null;
}

const now = new Date();
const previous = await loadPrevious();
const previousIsValid = previous && validateOfficialNewsData(previous, { now, memberIds }).ok;
const knownIds = new Set(previousIsValid ? previous.items.map((item) => item.id) : []);
let fresh;
let check = null;
let report = null;
const warnings = [];
try {
  // NEWS：1ページ目は必ず。2ページ目からは、新しい記事がある間だけ（上限5ページ）
  const fetchedRaw = [];
  const problems = [];
  let firstPageCount = 0;
  let pagesRead = 0;
  let partialError = null;
  for (let pageNumber = 1; pageNumber <= core.NEWS_MAX_PAGES; pageNumber += 1) {
    let html;
    try {
      html = await newsPageHtml(pageNumber);
    } catch (error) {
      if (pageNumber === 1) throw error;
      partialError = `${pageNumber}ページ目が読めない（${error.message}）。それより古い新着を見落としている可能性`;
      warnings.push(partialError);
      break;
    }
    const page = core.parseNewsListHtml(html);
    pagesRead = pageNumber;
    if (pageNumber === 1) firstPageCount = page.items.length;
    fetchedRaw.push(...page.items);
    problems.push(...page.problems);
    page.items.filter((item) => item.unknownCategory !== null).forEach((item) => warnings.push(`知らないカテゴリ「${item.unknownCategory}」（記事 ${item.sourceId}）→「その他」にした`));
    if (!core.shouldReadNextPage({ pageItems: page.items, hasNext: page.hasNext, pageNumber, knownIds })) break;
  }
  // 上限のページまで読んでも、まだ前のデータに無い記事が続いていた → それより古い新着を見落としている可能性（初回は除く）
  if (previousIsValid && pagesRead === core.NEWS_MAX_PAGES && core.hasUnreadNewItems({ fetchedRaw, knownIds, pagesRead })) {
    warnings.push(`${core.NEWS_MAX_PAGES}ページ目まで新着が続いた。それより古い新着を見落としている可能性`);
  }
  // DISCOGRAPHY（確認待ちの候補だけ。失敗しても NEWS は止めない）
  let discographyItems = null;
  let discographyError = null;
  try {
    const parsed = core.parseDiscographyListHtml(await discographyHtml());
    if (!parsed.items.length) throw new Error("作品が1件も読めない（形が変わった可能性）");
    discographyItems = parsed.items;
  } catch (error) {
    discographyError = String(error?.message ?? error).slice(0, 200);
    warnings.push(`DISCOGRAPHY が読めない（${discographyError}）。確認待ちの候補は前のまま`);
  }
  const built = core.buildOfficialNewsData({
    fetchedRaw,
    previous: previousIsValid ? previous : null,
    discographyItems,
    knownDiscographyIds: core.knownDiscographyIdsFrom(cdBonus),
    discographyError,
    now,
    pagesRead,
    partialError,
  });
  report = built.report;
  check = core.checkNewsPublication({ data: built.data, firstPageCount, problems, previous: previousIsValid ? previous : null, now, memberIds });
  warnings.push(...check.warnings);
  fresh = check.ok ? { ok: true, data: built.data } : { ok: false, error: `検査に通らない：${check.errors.join("／")}` };
  console.log(`読んだページ：NEWS ${pagesRead}・アクセス ${requestCount} 回・記事 ${built.data.items.length} 件（新着 ${report.added.length}・掘り起こし ${report.backfilled.length}・表示の変化 ${report.revised.length}・見当たらない ${report.missing.length}）・確認待ちの候補 ${built.data.candidates.length} 件`);
} catch (error) {
  fresh = { ok: false, error: String(error?.message ?? error) };
}

const decision = core.decideNewsPublication({ fresh, previous: previousIsValid ? previous : null, now, memberIds });
console.log(`判断：${decision.action}（${decision.reason}）`);
if (decision.data) {
  if (!validateOfficialNewsData(decision.data, { now, memberIds }).ok) throw new Error("公開するデータの形が正しくない");
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(decision.data), "utf8");
  console.log(`書き出し：${outRelative}（${decision.data.items.length} 件・最後に取得できた日時 ${decision.data.fetchedAt}）`);
} else {
  await rm(outFile, { force: true });
}
// 知らせる：失敗したとき・形の変化の注意・見当たらない記事・新しい確認待ちの候補
const alert = decision.alert || warnings.length > 0 || Boolean(report?.missing?.length) || Boolean(report?.newCandidates?.length);
if (alert && reportFile) {
  await writeFile(reportFile, core.describeNewsRefreshForIssue({ decision, check, report, trigger, runUrl: process.env.RUN_URL ?? "", warnings }), "utf8");
}
await setOutput({ action: decision.action, fresh: decision.action === "write-fresh" ? "true" : "false", wrote: decision.data ? "true" : "false", alert: alert ? "true" : "false" });
