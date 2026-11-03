// YouTube 出演図鑑：前に公開したデータ（30日以内）を、そのまま今回の公開に入れ直す（2026-11-03新設・R11 D）。
//
// いつ使うか：定期の更新（合図・schedule）で YouTube の取得に失敗し、refresh.mjs が「公開しない（keep-live）」と決めたが、
// ＝LOVE 最新情報（scripts/news/refresh-news.mjs）は新しく取れたので、サイトを公開し直したいとき。
// サイトを公開し直すと、成果物に無いファイルは消えるので、YouTube のデータを前のまま入れ直す（YouTube の API は呼ばない）。
// 決まりは refresh.mjs の「push で失敗したとき（publish-previous）」と同じ：
//   - 前のデータの形が正しく、期限（取得から30日）の前のときだけ入れる。期限・取得日時は前のまま（延ばさない）
//   - 入れられないときは何も書かず、ok=false を返す（公開しない＝サイトは前のまま。YouTube の判断を上書きしない）
//
// 使い方：node scripts/youtube/keep-previous.mjs --previous-url <公開中のデータの URL> または --previous-file <ファイル>
// 書き出すのは data/youtube-appearances.json だけ。GITHUB_OUTPUT に ok（入れたか）を書く。
import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const load = (relative) => import(pathToFileURL(path.join(REPO, relative)).href);
const { isAllowedRefreshOutput } = await load("js/youtubeRefreshCore.js");
const { YOUTUBE_DATA_PATH, isYoutubeDataExpired, validateYoutubePublishedData } = await load("js/youtubeAppearanceData.js");

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}
const previousUrl = argValue("--previous-url");
const previousFile = argValue("--previous-file");
if (!isAllowedRefreshOutput(YOUTUBE_DATA_PATH)) throw new Error("書き出し先が決まりと違う");
const outFile = path.join(REPO, YOUTUBE_DATA_PATH);

async function setOutput(values) {
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}

let previous = null;
try {
  if (previousFile && existsSync(previousFile)) previous = JSON.parse(await readFile(previousFile, "utf8"));
  else if (previousUrl) {
    const response = await fetch(previousUrl, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(20000) });
    if (response.ok) previous = await response.json();
  }
} catch (error) {
  console.log(`前に公開したデータは読めませんでした（${error?.name ?? "エラー"}）`);
}

const now = new Date();
const usable = previous && !isYoutubeDataExpired(previous, now) && validateYoutubePublishedData(previous, { now }).ok;
if (usable) {
  await mkdir(path.dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(previous), "utf8");
  console.log(`書き出し：${YOUTUBE_DATA_PATH}（前のデータ ${previous.videos.length}本・取得 ${previous.fetchedAt}）`);
} else {
  console.log("前の YouTube のデータが無い・期限切れ・形が正しくない → 入れない（公開しない）");
}
await setOutput({ ok: usable ? "true" : "false" });
