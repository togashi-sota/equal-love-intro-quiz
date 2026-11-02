// YouTube 出演図鑑：公開のたびに YouTube のデータを作る（2026-11-03新設）。GitHub Actions でも手元でも同じものを動かす。
//
// 使い方：
//   node scripts/youtube/refresh.mjs --trigger schedule                       … API で取り直す（約85ユニット）
//   node scripts/youtube/refresh.mjs --trigger push --from-raw <フォルダ>      … 前に取った結果（videos.json・playlists.json）から作る（API を呼ばない）
//   追加の指定：--previous-url <公開中のデータの URL> または --previous-file <ファイル>（前に公開したデータ。無ければ無しで作る）
//              --report <ファイル>（Issue の本文を書く所。GitHub Actions の一時フォルダ）
//
// 書き出すのは data/youtube-appearances.json だけ（git に入れない。.gitignore 済み）。ほかのファイルには一切触れない。
// GitHub Actions では、結果を GITHUB_OUTPUT に書く：deploy（公開するか）・alert（本人に知らせるか）・action（何をしたか）。
// API キーは表示しない。エラーの表示にも URL・キーを入れない。
import { readFile, writeFile, mkdir, rm, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const load = (relative) => import(pathToFileURL(path.join(REPO, relative)).href);

const { buildYoutubePublishedData, checkYoutubePublication, decideYoutubePublication, describeYoutubeRefreshForIssue, isAllowedRefreshOutput } = await load("js/youtubeRefreshCore.js");
const { YOUTUBE_DATA_PATH, validateYoutubePublishedData } = await load("js/youtubeAppearanceData.js");
const { YOUTUBE_VERIFIED_JUDGMENTS } = await load("js/data/youtubeVerifiedJudgments.js");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

const trigger = argValue("--trigger") ?? "push";
const fromRaw = argValue("--from-raw");
const previousUrl = argValue("--previous-url");
const previousFile = argValue("--previous-file");
const reportFile = argValue("--report");
const outRelative = YOUTUBE_DATA_PATH;
if (!isAllowedRefreshOutput(outRelative)) throw new Error("書き出し先が決まりと違う");
const outFile = path.join(REPO, outRelative);

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
      const response = await fetch(previousUrl, { headers: { Accept: "application/json" } });
      if (response.ok) return await response.json();
    }
  } catch (error) {
    console.log(`前に公開したデータは読めませんでした（${error?.name ?? "エラー"}）`);
  }
  return null;
}

async function getFetched() {
  if (fromRaw) {
    const raw = JSON.parse(await readFile(path.join(fromRaw, "videos.json"), "utf8"));
    const playlists = existsSync(path.join(fromRaw, "playlists.json")) ? JSON.parse(await readFile(path.join(fromRaw, "playlists.json"), "utf8")) : {};
    return { meta: raw.meta, videos: raw.videos, shortsIds: playlists.shortsIds ?? null, liveIds: playlists.liveIds ?? null, playlists: playlists.playlists ?? [] };
  }
  const { loadYoutubeApiKey, fetchYoutubeChannel } = await import(pathToFileURL(path.join(HERE, "fetch-youtube.mjs")).href);
  const { key } = await loadYoutubeApiKey();
  if (!key) throw new Error("API キーが設定されていない（Secrets の YOUTUBE_API_KEY）");
  const fetched = await fetchYoutubeChannel(key);
  console.log(`取得：${fetched.videos.length}本・使ったユニット ${fetched.meta.usedUnits}`);
  return fetched;
}

const now = new Date();
const previous = await loadPrevious();
let fresh;
let check = null;
let report = null;
try {
  const fetched = await getFetched();
  const built = buildYoutubePublishedData({ fetched, verifiedJudgments: YOUTUBE_VERIFIED_JUDGMENTS, previous, now });
  report = built.report;
  check = checkYoutubePublication(built.data, { previous, now });
  fresh = check.ok ? { ok: true, data: built.data } : { ok: false, error: `検査に通らない：${check.errors.join("／")}` };
} catch (error) {
  fresh = { ok: false, error: String(error?.message ?? error) };
}

const decision = decideYoutubePublication({ trigger, fresh, previous, now });
console.log(`判断：${decision.action}（${decision.reason}）`);
if (decision.action === "publish-fresh" || decision.action === "publish-previous") {
  const data = decision.action === "publish-fresh" ? fresh.data : previous;
  if (!validateYoutubePublishedData(data, { now }).ok) throw new Error("公開するデータの形が正しくない");
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(data), "utf8");
  console.log(`書き出し：${outRelative}（${data.videos.length}本・取得 ${data.fetchedAt}）`);
} else if (decision.action === "publish-without-data") {
  await rm(outFile, { force: true });
  console.log(`書き出し：${outRelative} を外した`);
}
// 説明欄の出演者の表記が前と変わった動画があれば、公開できても本人に知らせる
const needsReview = Boolean(report?.review?.some((item) => item.kind === "downgrade"));
const alert = decision.alert || needsReview;
if (alert && reportFile) {
  await writeFile(reportFile, describeYoutubeRefreshForIssue({ decision, check, report, trigger, runUrl: process.env.RUN_URL ?? "" }), "utf8");
}
if (report?.review?.length) {
  const counts = {};
  report.review.forEach((item) => (counts[item.kind] = (counts[item.kind] ?? 0) + 1));
  console.log(`確認の候補：${JSON.stringify(counts)}`);
}
await setOutput({ action: decision.action, deploy: decision.action === "keep-live" ? "false" : "true", alert: alert ? "true" : "false" });
