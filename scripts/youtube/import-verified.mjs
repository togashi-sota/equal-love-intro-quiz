// YouTube 出演図鑑：本人の確認の答え（確認の資料の HTML の［答えを JSON にする］で作った JSON）を、
// js/data/youtubeVerifiedJudgments.js に1本1つずつ足す（2026-11-03 R12）。API は呼ばない。
//
//   node scripts/youtube/import-verified.mjs <答えの JSON のファイル> [--dry-run] [--replace]
//     --dry-run：書き込まずに、足す内容だけを表示する
//     --replace：同じ動画がもう登録されていたら、新しい答えで置き換える（無いと、その動画は飛ばす）
// 答えの JSON にタイトルなどの YouTube のデータは入らない（動画 ID・メンバー・判断・メモだけ）ので、git に入れてよい内容だけを書く。
// 足したら：node scripts/youtube/refresh.mjs --trigger push --from-raw tools/youtube-appearances/work/raw で確かめ、テストを流してからコミットする。
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const TARGET = path.join(REPO, "js", "data", "youtubeVerifiedJudgments.js");
const { MEMBERS } = await import(pathToFileURL(path.join(REPO, "js", "data", "members.js")).href);
const { YOUTUBE_VERIFIED_JUDGMENTS } = await import(pathToFileURL(TARGET).href);
// 答えの1件を確かめて、登録の形にする（ブラウザのテストからも使うので、別のファイルに分けた）
const { normalizeAnswerItem } = await import(pathToFileURL(path.join(HERE, "verified-answer.mjs")).href);

function formatEntry(entry) {
  const list = (ids) => `[${ids.map((id) => JSON.stringify(id)).join(", ")}]`;
  return [
    "  {",
    `    videoId: ${JSON.stringify(entry.videoId)},`,
    `    decision: ${JSON.stringify(entry.decision)},`,
    `    memberIds: ${list(entry.memberIds)},`,
    `    footageMemberIds: ${list(entry.footageMemberIds)},`,
    `    thumbnailMemberIds: ${list(entry.thumbnailMemberIds)},`,
    ...(entry.notAppearingMemberIds.length ? [`    notAppearingMemberIds: ${list(entry.notAppearingMemberIds)},`] : []),
    `    basis: ${JSON.stringify(entry.basis)},`,
    `    verifiedBy: "owner",`,
    `    verifiedOn: ${JSON.stringify(entry.verifiedOn)},`,
    `    note: ${JSON.stringify(entry.note || "本人の確認（確認の資料から）")},`,
    "  },",
  ].join("\n");
}

async function main() {
  const file = process.argv[2];
  const dryRun = process.argv.includes("--dry-run");
  const replace = process.argv.includes("--replace");
  if (!file) {
    console.error("使い方：node scripts/youtube/import-verified.mjs <答えの JSON のファイル> [--dry-run] [--replace]");
    process.exitCode = 2;
    return;
  }
  const answer = JSON.parse((await readFile(file, "utf8")).replace(/^﻿/, ""));
  if (answer?.kind !== "youtube-verified-judgments" || !Array.isArray(answer.items)) throw new Error("確認の資料で作った答えの JSON ではありません");
  const memberIds = new Set(MEMBERS.map((member) => member.id));
  const existing = new Set(YOUTUBE_VERIFIED_JUDGMENTS.map((judgment) => judgment.videoId));
  let source = await readFile(TARGET, "utf8");
  const added = [];
  const skipped = [];
  for (const item of answer.items) {
    const { entry, warnings } = normalizeAnswerItem(item, memberIds);
    warnings.forEach((warning) => console.log(`注意：${warning}`));
    if (existing.has(entry.videoId)) {
      if (!replace) {
        skipped.push(entry.videoId);
        continue;
      }
      // 前の登録（その動画の { … } のまとまり）を外す
      const pattern = new RegExp(`\\n  \\{\\n    videoId: "${entry.videoId}",[\\s\\S]*?\\n  \\},`);
      source = source.replace(pattern, "");
    }
    const end = source.indexOf("\n]);", source.indexOf("export const YOUTUBE_VERIFIED_JUDGMENTS"));
    if (end < 0) throw new Error("youtubeVerifiedJudgments.js の配列の終わりが見つからない");
    source = `${source.slice(0, end)}\n${formatEntry(entry)}${source.slice(end)}`;
    added.push(entry.videoId);
    existing.add(entry.videoId);
  }
  console.log(JSON.stringify({ added, skipped, dryRun }));
  if (!dryRun && added.length) await writeFile(TARGET, source, "utf8");
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(`登録できませんでした：${error.message}`);
    process.exitCode = 1;
  });
}
