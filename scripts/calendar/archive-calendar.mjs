// ＝LOVEカレンダー：長く残す記録（git の枝 calendar-data）を、予定に本当の変化があったときだけ書き直す（2026-11-25新設）。
// GitHub Actions の「calendar-archive」の仕事から呼ぶ。git の操作（コミット・push）は workflow 側。ここはファイルを書くかを決めるだけ。
//
// 使い方：node scripts/calendar/archive-calendar.mjs --current <今回のデータ> --archive <記録のファイル>
//   - 今回のデータ・今の記録を比べ、変化があって、記録の予定を1件も減らさないときだけ書く
//   - 結果は GITHUB_OUTPUT に changed=true/false
// 書くのは、事実だけの予定のデータ（日付・種類・タイトル・時間・出演など。scripts/calendar/README.md）。YouTube のデータは入れない。
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

async function readData(file) {
  if (!file || !existsSync(file)) return null;
  try {
    return core.fromStoredCalendarData(JSON.parse(await readFile(file, "utf8")));
  } catch (error) {
    return { invalid: true };
  }
}

async function setOutput(values) {
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}`);
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`, "utf8");
}

const currentFile = argValue("--current");
const archiveFile = argValue("--archive");
if (!currentFile || !archiveFile) throw new Error("--current と --archive を指定する");
const next = await readData(currentFile);
const archive = await readData(archiveFile);
const decision = core.decideArchiveUpdate({ archive: archive?.invalid ? { schema: 0, events: [] } : archive, next });
console.log(`記録：${decision.update ? "書く" : "書かない"}（${decision.reason}）`);
if (decision.update) {
  await mkdir(path.dirname(archiveFile), { recursive: true });
  // 差分が読みやすいように1件1行
  const stored = core.toStoredCalendarData(next);
  const { events, ...head } = stored;
  const text = `${JSON.stringify(head).slice(0, -1)},"events":[\n${events.map((event) => JSON.stringify(event)).join(",\n")}\n]}\n`;
  JSON.parse(text); // 壊れた JSON を書かない
  await writeFile(archiveFile, text, "utf8");
}
await setOutput({ changed: decision.update ? "true" : "false" });
