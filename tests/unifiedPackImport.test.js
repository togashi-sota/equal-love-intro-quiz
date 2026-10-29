// 「最新版データを読み込む」（js/unifiedPackImport.js）のテスト（2026-10-30）。
// 本物の歌詞・コール・音源は使わない（ダミーの短い文と小さなデータだけ）。端末は偽物（メモリの中）で、
// プレイヤーの記録・音源・ほかの曲が変わらないこと、元に戻せること、巻き戻らないこと、重ならないことを毎回確かめる。
//   A 空の端末／B ほぼ全部ある端末／C 古い歌詞タイミングだけ／D コールなしのパック／E 一部の曲だけのパック／
//   F 同じパックを2回／G 新しいパックの後に古いパック／H 途中で失敗／I 容量不足／J 歌詞とコールの指紋の不一致／
//   K 公開版 v383 で読める形か（マニフェスト・コールのファイルを v383 の見分け方で見る）／ほか：つなぎ込み
import { assertEqual } from "./test-utils.js";
import { computeLyricsContentHash, validateLyricsData } from "../js/lyricsStorage.js";
import { computeLyricsLineFingerprint } from "../js/callReleaseImport.js";
import { planCallReleaseImport, applyPlanItem } from "../js/callReleasePack.js";
import { validateManifest } from "../js/dataPackImport.js";
import {
  readUnifiedPackFiles,
  planUnifiedImport,
  applyUnifiedPlan,
  undoUnifiedSong,
  listUndoableSongs,
  describeUnifiedPlan,
  describeUnifiedResult,
  mergeSupersededHashes,
  isQuotaError,
  shortList,
  PART_ACTION,
} from "../js/unifiedPackImport.js";

const S1 = "24-7";
const S2 = "866";
const S3 = "cameo";
const OTHER = "love"; // パックに入れない曲（変わらないことを見る）
const KNOWN = new Set([S1, S2, S3, OTHER, "overture"]);

// ---- ダミーの歌詞（本物の歌詞ではない） ----
const lines = (tag) => [
  { line: 1, text: `ダミー一行目${tag}`, start: 10, end: 12 },
  { line: 2, text: `ダミー二行目${tag}`, start: 12.5, end: 15 },
  { line: 3, text: "ダミー三行目", start: 15.5, end: 18 },
];
const L_OLD = lines("（旧）");
const L_NEW = lines("（新）");
const L_OTHER = lines("（別の曲）");

function callEntry(lyricsLines, tag = "") {
  return {
    textApprovedAt: "2026-10-29T00:00:00.000Z",
    timingCompletedAt: null,
    baseFingerprint: "dummy-base",
    lyricsFingerprint: computeLyricsLineFingerprint(lyricsLines),
    calls: {},
    added: [{ key: "a1", text: `ダミーのコール${tag}`, type: "unique", lineNo: 1, position: "after", order: 1 }],
    timing: { offsetSec: 0, calls: { a1: { start: 10.5, end: 11.5 } } },
  };
}
const artifact = (exportedAt, songs, editsRevision = 10) => ({ schema: "equal-love-call-release", version: 1, exportedAt, source: { editsRevision, timingRevision: 20 }, songs });
const NEW_TIME = "2026-10-29T03:00:00.000Z";
const OLD_TIME = "2026-10-20T03:00:00.000Z";

// 端末にすでにある完成版コールのレコード（今までの読み込みと同じ作り方）
function callRecord(songId, entry, exportedAt) {
  const plan = planCallReleaseImport({ artifact: artifact(exportedAt, { [songId]: entry }), existing: new Map(), knownSongIds: KNOWN, deviceLyricsFingerprints: new Map() });
  return applyPlanItem(plan.items[0], null, exportedAt);
}

// ---- 偽の端末 ----
async function lyricsRecord(songId, lyricsLines) {
  const record = { songId, lines: lyricsLines.map((l) => ({ ...l })), schemaVersion: 1 };
  record.contentHash = await computeLyricsContentHash(record);
  return record;
}
async function makeDevice({ lyrics = {}, calls = {}, audio = {}, provenance = {} } = {}) {
  const device = { lyrics: new Map(), calls: new Map(Object.entries(calls)), audio: new Map(Object.entries(audio)), backups: [], provenance: { ...provenance }, undo: {}, writes: 0, fail: {} };
  for (const [songId, l] of Object.entries(lyrics)) device.lyrics.set(songId, await lyricsRecord(songId, l));
  // プレイヤーの記録（読み込みでは決して変わらない）
  device.player = { profile: { name: "テスト" }, history: [{ score: 10 }], titles: ["ダミー称号"] };
  return device;
}
async function stateOf(device) {
  const lyricsHashes = new Map();
  const lyricsFingerprints = new Map();
  for (const [songId, record] of device.lyrics) {
    lyricsHashes.set(songId, record.contentHash);
    lyricsFingerprints.set(songId, computeLyricsLineFingerprint(record.lines));
  }
  return { lyricsHashes, lyricsFingerprints, lyricsProvenance: { ...device.provenance }, audioSongIds: new Set(device.audio.keys()), audioHashes: new Map([...device.audio].map(([k, v]) => [k, v.hash])), releasedCalls: new Map(device.calls) };
}
function quotaError() {
  try {
    return new DOMException("The quota has been exceeded.", "QuotaExceededError");
  } catch {
    const error = new Error("quota exceeded");
    error.name = "QuotaExceededError";
    return error;
  }
}
function ioOf(device) {
  const maybeFail = (kind, songId) => {
    const failure = device.fail[kind]?.[songId];
    if (failure) throw failure === "quota" ? quotaError() : new Error(`テスト用の失敗：${kind}`);
  };
  return {
    getLyrics: async (songId) => device.lyrics.get(songId) ?? null,
    backupLyrics: async (songId, reason) => {
      const record = device.lyrics.get(songId);
      if (!record) return { backedUp: false, id: null };
      const id = `${songId}@${device.backups.length}`;
      device.backups.push({ id, songId, reason, record: JSON.parse(JSON.stringify(record)) });
      return { backedUp: true, id };
    },
    saveLyrics: async (record) => {
      maybeFail("saveLyrics", record.songId);
      const { valid, errors } = validateLyricsData(record);
      if (!valid) return { saved: false, errors };
      device.writes += 1;
      device.lyrics.set(record.songId, { ...record, contentHash: await computeLyricsContentHash(record) });
      return { saved: true, errors: [] };
    },
    deleteLyrics: async (songId) => {
      device.writes += 1;
      device.lyrics.delete(songId);
    },
    restoreLyricsBackup: async (songId, backupId) => {
      const backup = device.backups.find((b) => b.id === backupId);
      if (!backup) return { restored: false, reason: "控えがありません" };
      device.writes += 1;
      device.lyrics.set(songId, JSON.parse(JSON.stringify(backup.record)));
      return { restored: true };
    },
    saveAudio: async (file) => {
      device.writes += 1;
      device.audio.set(file.name.replace(/\.mp3$/i, ""), { hash: "new-audio", name: file.name });
    },
    getReleasedCall: async (songId) => device.calls.get(songId) ?? null,
    saveReleasedCall: async (record) => {
      maybeFail("saveReleasedCall", record.songId);
      device.writes += 1;
      device.calls.set(record.songId, JSON.parse(JSON.stringify(record)));
    },
    readProvenance: () => ({ ...device.provenance }),
    writeProvenance: (value) => {
      device.provenance = { ...value };
    },
    readUndo: () => JSON.parse(JSON.stringify(device.undo)),
    writeUndo: (value) => {
      device.undo = JSON.parse(JSON.stringify(value));
    },
    now: () => "2026-10-30T00:00:00.000Z",
  };
}

// ---- パック（ZIP を展開した後と同じ File[]） ----
function jsonFile(name, data) {
  return new File([JSON.stringify(data)], name, { type: "application/json" });
}
async function makePack({ createdAt = NEW_TIME, lyrics = {}, calls = null, display = null, audio = [], manifest = true, superseded = undefined } = {}) {
  const files = [];
  const lyricsHashes = {};
  for (const [songId, l] of Object.entries(lyrics)) {
    files.push(jsonFile(`${songId}-timing.json`, { song_id: songId, lines: l }));
    lyricsHashes[songId] = { contentHash: await computeLyricsContentHash({ songId, lines: l }) };
  }
  if (calls) files.push(jsonFile("calls-release.json", calls));
  if (display) files.push(jsonFile("calls-display-private.json", display));
  audio.forEach((songId) => files.push(new File([new Uint8Array([1, 2, 3, songId.length])], `${songId}.mp3`)));
  const songIds = [...new Set([...Object.keys(lyrics), ...Object.keys(calls?.songs ?? {}), ...audio])];
  if (manifest) {
    files.push(
      jsonFile("manifest.json", {
        type: "equal-love-data-pack",
        schemaVersion: 1,
        packKind: "incremental",
        packId: `test-${createdAt}`,
        packLabel: "テスト用の最新版データ",
        createdAt,
        distribution: "private",
        songIds: songIds.length ? songIds : [S1],
        unified: { formatVersion: 1, createdAt, distribution: "private", lyrics: lyricsHashes, ...(superseded ? { lyricsSuperseded: superseded } : {}) },
      }),
    );
  }
  return files;
}

async function run(files, device, { io = ioOf(device) } = {}) {
  const parsed = await readUnifiedPackFiles(files);
  const plan = planUnifiedImport(parsed, await stateOf(device), { knownSongIds: KNOWN, appSupersededHashes: {} });
  const result = await applyUnifiedPlan(plan, io);
  return { parsed, plan, result };
}
async function planOnly(files, device, options = {}) {
  const parsed = await readUnifiedPackFiles(files);
  return planUnifiedImport(parsed, await stateOf(device), { knownSongIds: KNOWN, appSupersededHashes: {}, ...options });
}
const actionOf = (plan, songId, part) => plan.songs.find((song) => song.songId === songId)?.[part]?.action ?? null;
const callFpOf = (device, songId) => device.calls.get(songId)?.current?.entry?.lyricsFingerprint ?? null;
const lyricsFpOf = (device, songId) => (device.lyrics.has(songId) ? computeLyricsLineFingerprint(device.lyrics.get(songId).lines) : null);
const callsWork = (device, songId) => {
  const a = callFpOf(device, songId);
  const b = lyricsFpOf(device, songId);
  return Boolean(a && b && a.lineCount === b.lineCount && a.hash === b.hash);
};

// 毎回確かめること：音源・プレイヤーの記録・ほかの曲が変わらない／重ならない
function snapshotUntouched(device) {
  return JSON.stringify({ player: device.player, audio: [...device.audio], other: device.lyrics.get(OTHER) ?? null, otherCalls: device.calls.get(OTHER) ?? null });
}
function assertInvariants(device, before, label, { audioChanged = false } = {}) {
  const now = JSON.parse(snapshotUntouched(device));
  const was = JSON.parse(before);
  assertEqual(now.player, was.player, `${label}：プレイヤーの記録（プロフィール・履歴・称号）は変わらない`);
  if (!audioChanged) assertEqual(now.audio, was.audio, `${label}：音源は変わらない`);
  assertEqual([now.other, now.otherCalls], [was.other, was.otherCalls], `${label}：パックに無い曲は変わらない`);
  const ids = [...device.lyrics.keys()];
  assertEqual(ids.length, new Set(ids).size, `${label}：歌詞が重ならない（1曲1つ）`);
}

// ---------------- A：空の端末 ----------------
async function testA() {
  const device = await makeDevice();
  const before = snapshotUntouched(device);
  const pack = await makePack({ lyrics: { [S1]: L_NEW, [S2]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW), [S2]: callEntry(L_NEW) }) });
  const { plan, result } = await run(pack, device);
  assertEqual([plan.ok, plan.counts.newSongs, plan.counts.lyricsUpdates, plan.counts.callUpdates, plan.counts.unchanged], [true, 2, 0, 0, 0], "A：空の端末では2曲とも新規追加");
  assertEqual(plan.counts.audioMissing, 2, "A：音源が無い曲を数える（音源は別のパックで）");
  assertEqual(describeUnifiedPlan(plan).some((line) => line.startsWith("この端末に音源が無い曲：2曲（このパックに音源は入っていません。音源は別のパックで")), true, "A：確認画面に「この端末に音源が無い曲：2曲（このパックに音源は入っていません。音源は別のパックで…）」（v400 の文言）");
  assertEqual([result.newSongs.length, result.errors.length], [2, 0], "A：結果は新規追加2曲・エラー0件");
  assertEqual([callsWork(device, S1), callsWork(device, S2)], [true, true], "A：歌詞とコールの組が合っている");
  assertEqual(describeUnifiedResult(result)[0], "新規追加 2曲／歌詞更新 0曲／コール更新 0曲／変更なし 0曲／エラー 0件", "A：結果の1行目");
  assertInvariants(device, before, "A");
  // 元に戻す：入れる前（何も無い）に戻る
  assertEqual(listUndoableSongs(device.undo).map((s) => s.songId).sort(), [S1, S2].sort(), "A：2曲とも元に戻せる一覧に出る");
  const undone = await undoUnifiedSong(S1, ioOf(device));
  assertEqual([undone.ok, device.lyrics.has(S1), device.calls.get(S1)?.current ?? null], [true, false, null], "A：元に戻すと、その曲の歌詞とコール表が無い状態に戻る");
  assertEqual([device.lyrics.has(S2), callsWork(device, S2)], [true, true], "A：元に戻したのは1曲だけ（ほかの曲はそのまま）");
  const again = await planOnly(pack, device);
  assertEqual([actionOf(again, S1, "lyrics"), actionOf(again, S1, "calls"), actionOf(again, S2, "lyrics")], [PART_ACTION.NEW, PART_ACTION.NEW, PART_ACTION.SAME], "A：元に戻した後にもう一度読むと、その曲だけ入れ直す");
  assertInvariants(device, before, "A（元に戻した後）");
}

// ---------------- B：ほぼ全部ある端末 ----------------
async function testB() {
  const device = await makeDevice({
    lyrics: { [S1]: L_NEW, [S2]: L_OLD, [OTHER]: L_OTHER },
    calls: { [S1]: callRecord(S1, callEntry(L_NEW), NEW_TIME), [S2]: callRecord(S2, callEntry(L_OLD, "旧"), OLD_TIME), [OTHER]: callRecord(OTHER, callEntry(L_OTHER), NEW_TIME) },
    audio: { [S1]: { hash: "a1" }, [S2]: { hash: "a2" }, [OTHER]: { hash: "a3" } },
  });
  const before = snapshotUntouched(device);
  const pack = await makePack({ lyrics: { [S1]: L_NEW, [S2]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW), [S2]: callEntry(L_NEW, "新") }) });
  const { plan, result } = await run(pack, device);
  assertEqual([actionOf(plan, S1, "lyrics"), actionOf(plan, S1, "calls"), actionOf(plan, S2, "lyrics"), actionOf(plan, S2, "calls")], [PART_ACTION.SAME, PART_ACTION.SAME, PART_ACTION.UPDATE, PART_ACTION.UPDATE], "B：同じ曲は変更なし、古い曲は歌詞もコールも更新");
  assertEqual([plan.counts.audioMissing, result.lyricsUpdated, result.callsUpdated, result.unchanged], [0, [S2], [S2], [S1]], "B：音源はある・歌詞更新1曲・コール更新1曲・変更なしは S1");
  assertEqual(callsWork(device, S2), true, "B：更新後、S2 の歌詞とコールが合っている");
  assertEqual(device.backups.filter((b) => b.songId === S2).length, 1, "B：上書きの前に S2 の歌詞を控えた");
  assertInvariants(device, before, "B");
  const undone = await undoUnifiedSong(S2, ioOf(device));
  assertEqual([undone.ok, device.lyrics.get(S2).lines[0].text, callsWork(device, S2)], [true, L_OLD[0].text, true], "B：元に戻すと、S2 は前の歌詞と前のコールの組に戻る（合っている）");
  assertInvariants(device, before, "B（元に戻した後）");
}

// ---------------- C：古い歌詞タイミングだけの端末 ----------------
async function testC() {
  const device = await makeDevice({ lyrics: { [S1]: L_OLD, [OTHER]: L_OTHER }, audio: { [S1]: { hash: "a1" } } });
  const before = snapshotUntouched(device);
  const pack = await makePack({ lyrics: { [S1]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW) }) });
  const { plan, result } = await run(pack, device);
  assertEqual([actionOf(plan, S1, "lyrics"), actionOf(plan, S1, "calls")], [PART_ACTION.UPDATE, PART_ACTION.NEW], "C：古い歌詞は更新、コールは新しく入る（読み込んだ後の歌詞で照合）");
  assertEqual([result.errors.length, callsWork(device, S1)], [0, true], "C：歌詞とコールの組が合う");
  assertInvariants(device, before, "C");
}

// ---------------- D：コールなしのパック ----------------
async function testD() {
  const device = await makeDevice({
    lyrics: { [S1]: L_OLD, [S2]: L_OLD },
    calls: { [S2]: callRecord(S2, callEntry(L_OLD), OLD_TIME) }, // S2 は今コール表が出ている
  });
  const before = snapshotUntouched(device);
  const pack = await makePack({ lyrics: { [S1]: L_NEW, [S2]: L_NEW } });
  const { plan } = await run(pack, device);
  assertEqual(actionOf(plan, S1, "lyrics"), PART_ACTION.UPDATE, "D：コール表の無い曲の歌詞は更新する");
  assertEqual(actionOf(plan, S2, "lyrics"), PART_ACTION.HELD, "D：今コール表が出ている曲は、合うコールが届くまで歌詞の更新を待つ（コール表が消えないように）");
  assertEqual([device.lyrics.get(S2).lines[1].text, callsWork(device, S2)], [L_OLD[1].text, true], "D：S2 の歌詞とコールの組はそのまま（壊さない）");
  assertEqual(describeUnifiedPlan(plan).some((line) => line.includes("歌詞の更新を待ちます")), true, "D：待つ理由を確認画面に出す");
  assertInvariants(device, before, "D");
  // あとでコールつきのパックが来たら、両方そろって入る
  const pack2 = await makePack({ lyrics: { [S2]: L_NEW }, calls: artifact(NEW_TIME, { [S2]: callEntry(L_NEW) }) });
  const second = await run(pack2, device);
  assertEqual([actionOf(second.plan, S2, "lyrics"), actionOf(second.plan, S2, "calls"), callsWork(device, S2)], [PART_ACTION.UPDATE, PART_ACTION.UPDATE, true], "D：合うコールが来たら、歌詞とコールを一緒に更新");
}

// ---------------- E：一部の曲だけのパック ----------------
async function testE() {
  const device = await makeDevice({
    lyrics: { [S1]: L_OLD, [S2]: L_OLD, [OTHER]: L_OTHER },
    calls: { [S2]: callRecord(S2, callEntry(L_OLD), NEW_TIME), [OTHER]: callRecord(OTHER, callEntry(L_OTHER), NEW_TIME) },
  });
  const before = snapshotUntouched(device);
  const s2Before = JSON.stringify([device.lyrics.get(S2), device.calls.get(S2)]);
  const pack = await makePack({ lyrics: { [S1]: L_NEW } });
  const { plan, result } = await run(pack, device);
  assertEqual([plan.songs.map((s) => s.songId), result.lyricsUpdated], [[S1], [S1]], "E：パックの曲（S1）だけを判断・更新");
  assertEqual(JSON.stringify([device.lyrics.get(S2), device.calls.get(S2)]), s2Before, "E：パックに無い曲（S2）は歌詞もコールも変わらない");
  assertInvariants(device, before, "E");
  // 完成版コールが一部の曲だけ（同じ書き出し日時）でも、ほかの曲のコールを外さない
  const pack2 = await makePack({ calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW) }) });
  const second = await run(pack2, device);
  assertEqual([actionOf(second.plan, S2, "calls"), device.calls.get(S2)?.current !== null], [null, true], "E：同じ版の一部だけの完成版では、ほかの曲を取り下げない");
}

// ---------------- F：同じパックを2回 ----------------
async function testF() {
  const device = await makeDevice({ lyrics: { [OTHER]: L_OTHER } });
  const before = snapshotUntouched(device);
  const pack = await makePack({ lyrics: { [S1]: L_NEW, [S2]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW) }), display: { schema: "equal-love-call-display-private", version: 1, source: { editsRevision: 10 }, songs: { [S1]: { lineTexts: { 1: "ダミー表示" }, lyricsFingerprint: computeLyricsLineFingerprint(L_NEW) } } } });
  await run(pack, device);
  const writes = device.writes;
  const state = JSON.stringify([[...device.lyrics], [...device.calls], device.provenance, device.backups.length]);
  const { plan, result } = await run(pack, device);
  assertEqual([plan.counts.newSongs, plan.counts.lyricsUpdates, plan.counts.callUpdates, plan.counts.unchanged], [0, 0, 0, 2], "F：2回目は全部「変更なし」");
  assertEqual([device.writes - writes, JSON.stringify([[...device.lyrics], [...device.calls], device.provenance, device.backups.length]) === state], [0, true], "F：2回目は1つも書き込まない（控えも増えない）");
  assertEqual(result.unchanged.length, 2, "F：結果は変更なし2曲");
  assertEqual(describeUnifiedPlan(plan).some((line) => line.includes("すでに最新")), true, "F：確認画面で「すでに最新」と出る");
  assertInvariants(device, before, "F");
}

// ---------------- G：新しいパックの後に古いパック ----------------
async function testG() {
  const device = await makeDevice({ lyrics: { [OTHER]: L_OTHER } });
  const before = snapshotUntouched(device);
  await run(await makePack({ createdAt: NEW_TIME, lyrics: { [S1]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW) }) }), device);
  const state = JSON.stringify([[...device.lyrics], [...device.calls]]);
  const old = await makePack({ createdAt: OLD_TIME, lyrics: { [S1]: L_OLD }, calls: artifact(OLD_TIME, { [S1]: callEntry(L_OLD) }) });
  const { plan } = await run(old, device);
  assertEqual([actionOf(plan, S1, "lyrics"), actionOf(plan, S1, "calls")], [PART_ACTION.OLDER, PART_ACTION.OLDER], "G：古いパックの歌詞（どのパックで入れたかの記録で判断）とコール（書き出し日時）は入れない");
  assertEqual(JSON.stringify([[...device.lyrics], [...device.calls]]), state, "G：巻き戻らない（1つも変わらない）");
  // 記録が無い端末でも、古い版の一覧（マニフェストの lyricsSuperseded）で防ぐ
  const device2 = await makeDevice({ lyrics: { [S1]: L_NEW } });
  const oldHash = await computeLyricsContentHash({ songId: S1, lines: L_OLD });
  const plan2 = await planOnly(await makePack({ createdAt: OLD_TIME, lyrics: { [S1]: L_OLD } }), device2, { appSupersededHashes: { [S1]: [oldHash] } });
  assertEqual(actionOf(plan2, S1, "lyrics"), PART_ACTION.OLDER, "G：記録が無くても、古い版の一覧にある歌詞では上書きしない");
  const plan3 = await planOnly(await makePack({ createdAt: NEW_TIME, lyrics: { [S1]: L_OLD }, superseded: { [S1]: [oldHash] } }), device2);
  assertEqual(actionOf(plan3, S1, "lyrics"), PART_ACTION.OLDER, "G：マニフェストに書いた古い版の一覧でも防ぐ");
  assertEqual(mergeSupersededHashes({ a: ["x"] }, { a: ["x", "y"], b: ["z"] }), { a: ["x", "y"], b: ["z"] }, "G：古い版の一覧はアプリとマニフェストを合わせる（重ならない）");
  assertInvariants(device, before, "G");
}

// ---------------- H：途中で失敗 ----------------
async function testH() {
  const device = await makeDevice({
    lyrics: { [S1]: L_OLD, [S2]: L_OLD, [S3]: L_OLD, [OTHER]: L_OTHER },
    calls: { [S2]: callRecord(S2, callEntry(L_OLD), OLD_TIME) },
  });
  const before = snapshotUntouched(device);
  const pack = await makePack({ lyrics: { [S1]: L_NEW, [S2]: L_NEW, [S3]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW), [S2]: callEntry(L_NEW), [S3]: callEntry(L_NEW) }) });
  device.fail = { saveReleasedCall: { [S2]: "error" } };
  const { result } = await run(pack, device);
  assertEqual([result.errors.length, result.errors[0]?.songId, result.restoredLyrics], [1, S2, [S2]], "H：S2 のコールの保存に失敗 → エラー1件、S2 の歌詞を元に戻した");
  assertEqual([callsWork(device, S1), callsWork(device, S2), callsWork(device, S3)], [true, true, true], "H：失敗の後も、どの曲も歌詞とコールの組が合っている（S2 は前の組のまま）");
  assertEqual(device.lyrics.get(S2).lines[1].text, L_OLD[1].text, "H：S2 は前の歌詞");
  assertInvariants(device, before, "H");
  // もう一度（失敗しない端末で）：済んだ曲は飛ばし、S2 だけ入る
  device.fail = {};
  const retry = await run(pack, device);
  assertEqual([retry.plan.counts.unchanged, retry.result.lyricsUpdated, retry.result.callsUpdated, callsWork(device, S2)], [2, [S2], [S2], true], "H：もう一度読むと S2 だけ更新（ほかは変更なし）");
  assertInvariants(device, before, "H（もう一度）");
}

// ---------------- I：容量不足 ----------------
async function testI() {
  const device = await makeDevice({ lyrics: { [OTHER]: L_OTHER } });
  const before = snapshotUntouched(device);
  device.fail = { saveLyrics: { [S2]: "quota" } };
  const pack = await makePack({ lyrics: { [S1]: L_NEW, [S2]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW), [S2]: callEntry(L_NEW) }) });
  const { result } = await run(pack, device);
  assertEqual(isQuotaError(quotaError()), true, "I：容量不足のエラーを見分ける");
  const s2Errors = result.errors.filter((e) => e.songId === S2);
  assertEqual([s2Errors.length, s2Errors[0]?.quota, s2Errors[0]?.message.includes("空き容量")], [2, true, true], "I：S2 だけ「空き容量が足りません」（歌詞）＋コールは入れない（2件）");
  assertEqual([device.lyrics.has(S2), device.calls.get(S2)?.current ?? null, callsWork(device, S1)], [false, null, true], "I：S2 は歌詞もコールも入らない（違う行に赤文字を出さない）。S1 は入る");
  assertEqual(describeUnifiedResult(result).some((line) => line.includes("空き容量")), true, "I：結果に曲ごとの容量不足を出す");
  assertInvariants(device, before, "I");
}

// ---------------- J：歌詞とコールの指紋の不一致 ----------------
async function testJ() {
  const device = await makeDevice({ lyrics: { [S1]: L_NEW, [OTHER]: L_OTHER } });
  const before = snapshotUntouched(device);
  // パックのコールは古い歌詞用（パックに歌詞は無い）→ 入れない
  const { plan, result } = await run(await makePack({ calls: artifact(NEW_TIME, { [S1]: callEntry(L_OLD), [S3]: callEntry(L_NEW) }) }), device);
  assertEqual([actionOf(plan, S1, "calls"), actionOf(plan, S3, "calls")], [PART_ACTION.HELD, PART_ACTION.HELD], "J：歌詞の版が合わないコール・歌詞の無い曲のコールは入れない");
  assertEqual([device.calls.has(S1), device.calls.has(S3), result.errors.length], [false, false, 0], "J：書き込まない（エラーではなく保留）");
  const reasons = plan.songs.map((s) => s.calls?.reason ?? "");
  assertEqual([reasons.some((r) => r.includes("歌詞の版がコールデータと合いません")), reasons.some((r) => r.includes("歌詞がありません"))], [true, true], "J：理由を分けて出す");
  // 端末の歌詞の方が新しい（古い版の一覧）とき：古い歌詞とそのコールは入れない
  const oldHash = await computeLyricsContentHash({ songId: S1, lines: L_OLD });
  const plan2 = await planOnly(await makePack({ lyrics: { [S1]: L_OLD }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_OLD) }) }), device, { appSupersededHashes: { [S1]: [oldHash] } });
  assertEqual([actionOf(plan2, S1, "lyrics"), actionOf(plan2, S1, "calls")], [PART_ACTION.OLDER, PART_ACTION.HELD], "J：歌詞が入らない（古い）曲には、その歌詞用のコールも入れない");
  assertEqual(plan2.songs[0].calls.reason.includes("この端末の歌詞の方が新しい版"), true, "J：理由は「この端末の歌詞の方が新しい版」");
  // 歌詞の無い曲（0行）は、歌詞が無くてもコールが入る
  const plan3 = await planOnly(await makePack({ calls: artifact(NEW_TIME, { overture: callEntry([]) }) }), device);
  assertEqual(actionOf(plan3, "overture", "calls"), PART_ACTION.NEW, "J：歌詞の無い曲（0行）のコールは入る");
  assertInvariants(device, before, "J");
}

// ---------------- K：公開版 v383 で読める形か ----------------
async function testK() {
  const pack = await makePack({ lyrics: { [S1]: L_NEW }, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW) }), display: { schema: "equal-love-call-display-private", version: 1, songs: {} } });
  const parsed = await Promise.all(pack.map(async (file) => ({ name: file.name, data: JSON.parse(await file.text()) })));
  const manifest = parsed.find((f) => f.name === "manifest.json").data;
  assertEqual(validateManifest(manifest), { valid: true, errors: [] }, "K：マニフェストは追加データパックの点検（v383 と同じ項目）を通る");
  assertEqual([manifest.schemaVersion <= 1, ["full", "incremental", "correction"].includes(manifest.packKind), manifest.songIds.length > 0], [true, true, true], "K：v383 が見る項目（schemaVersion≦1・packKind・songIds）");
  // v383 の見分け方（type、または songId／song_id があれば歌詞）：コールのファイルはどちらでもない → 無視される
  const v383Kind = (data) => (data.type === "equal-love-data-pack" ? "manifest" : data.type === "equal-love-call-data" ? "callBackup" : data.type === "equal-love-call-guide-data" ? "callGuideBackup" : typeof data.songId === "string" || typeof data.song_id === "string" ? "lyrics" : "unknown");
  assertEqual(parsed.map((f) => [f.name, v383Kind(f.data)]).sort(), [["24-7-timing.json", "lyrics"], ["calls-display-private.json", "unknown"], ["calls-release.json", "unknown"], ["manifest.json", "manifest"]], "K：v383 では歌詞とマニフェストだけを読み、コールの2ファイルは無視する");
  assertEqual(pack.every((file) => /^[\x20-\x7e]+$/.test(file.name) && !file.name.includes("/")), true, "K：ZIP の中のファイル名は英数字だけ・フォルダなし（v383 の ZIP 展開でも同じ名前）");
  // マニフェストが無いパック（コールだけ等）も新しいアプリでは読める
  const device = await makeDevice({ lyrics: { [S1]: L_NEW } });
  const plan = await planOnly(await makePack({ manifest: false, calls: artifact(NEW_TIME, { [S1]: callEntry(L_NEW) }) }), device);
  assertEqual([plan.ok, actionOf(plan, S1, "calls")], [true, PART_ACTION.NEW], "K：マニフェストの無いパックも読める（コールだけ）");
  const bad = await planOnly([jsonFile("x.json", { hello: 1 })], device);
  assertEqual([bad.ok, bad.errors.some((e) => e.includes("どれも入っていません"))], [false, true], "K：中身の無いファイルは読み込まない");
  const many = Array.from({ length: 25 }, (_, i) => `曲${i + 1}`);
  assertEqual([shortList(many).endsWith("…ほか5曲"), shortList(many.slice(0, 3))], [true, "曲1、曲2、曲3"], "確認画面：長い曲名の並びは途中まで（数は全部）");
}

// ---------------- 音源：違う音源があるときだけ入れ替える ----------------
async function testAudio() {
  const device = await makeDevice({ lyrics: { [S1]: L_NEW }, audio: { [S1]: { hash: "same-not-matching" } } });
  const plan = await planOnly(await makePack({ lyrics: { [S1]: L_NEW } }), device);
  assertEqual([actionOf(plan, S1, "audio"), plan.counts.audioMissing], [null, 0], "音源：パックに音源が無ければ音源には触れない");
  const parsed = await readUnifiedPackFiles(await makePack({ audio: [S2] }));
  const plan2 = planUnifiedImport(parsed, await stateOf(device), { knownSongIds: KNOWN, appSupersededHashes: {} });
  assertEqual(actionOf(plan2, S2, "audio"), PART_ACTION.NEW, "音源：パックに入っている、端末に無い音源だけを入れる");
  const sameHash = parsed.audio[0].contentHash;
  device.audio.set(S2, { hash: sameHash });
  const plan3 = planUnifiedImport(parsed, await stateOf(device), { knownSongIds: KNOWN, appSupersededHashes: {} });
  assertEqual(actionOf(plan3, S2, "audio"), PART_ACTION.SAME, "音源：同じ音源は入れ直さない");
}

// ---------------- つなぎ込み ----------------
async function testWiring() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
  const [html, main, sw] = await Promise.all([fetchText("./index.html"), fetchText("./js/main.js"), fetchText("./sw.js")]);
  const ids = ["unified-pack-import-input", "unified-pack-import-summary", "unified-pack-import-actions", "unified-pack-import-apply-button", "unified-pack-import-cancel-button", "unified-pack-import-result", "unified-pack-undo-section", "unified-pack-undo-list"];
  assertEqual(ids.filter((id) => !html.includes(`id="${id}"`)), [], "つなぎ込み：index.html に「最新版データを読み込む」の部品がある");
  assertEqual(["data-pack-import-input", "call-release-import-input"].every((id) => html.includes(`id="${id}"`)), true, "つなぎ込み：今の「追加データパック」「完成版コールデータ」の入口は残っている");
  const settingsStart = html.indexOf('id="settings-screen"');
  const unifiedAt = html.indexOf('id="unified-pack-import-section"');
  assertEqual(settingsStart > 0 && unifiedAt > settingsStart, true, "つなぎ込み：入口は設定・データ管理の画面の中（ホームではない）");
  assertEqual(main.includes("initUnifiedPackImportUi("), true, "つなぎ込み：main.js が画面をつなぐ");
  assertEqual(["./js/unifiedPackImport.js", "./js/unifiedPackImportUi.js"].every((file) => sw.includes(`"${file}"`)), true, "つなぎ込み：APP_SHELL に2ファイル");
  const version = Number((sw.match(/CACHE_VERSION = "v(\d+)"/) ?? [])[1]);
  assertEqual(version >= 392, true, "つなぎ込み：CACHE_VERSION を上げた（v392 以上）");
}

export async function runUnifiedPackImportTests() {
  for (const test of [testA, testB, testC, testD, testE, testF, testG, testH, testI, testJ, testK, testAudio, testWiring]) {
    try {
      await test();
    } catch (error) {
      assertEqual(String(error?.stack ?? error), "", `最新版データのテスト ${test.name} が途中で止まった`);
    }
  }
}
