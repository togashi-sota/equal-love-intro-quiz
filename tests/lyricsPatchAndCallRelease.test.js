// 【2026-10-29新設】1曲だけの歌詞修正（データパックの updateExistingOnly・上書き前の控え）と、
// 完成したコール表（配置＋時刻）を受け取るときの約束（js/callReleaseImport.js）のテスト。
// 歌詞本文は使わない（ダミーの文字列だけ）。IndexedDB には触れない（純粋関数だけを確かめる）。

import { validateManifest, planLyricsImportActions, DATA_PACK_MANIFEST_TYPE } from "../js/dataPackImport.js";
import { pruneBackupKeys, pickLatestBackup, prepareRestoreRecord, MAX_BACKUPS_PER_SONG } from "../js/lyricsBackupStorage.js";
import { resolveIndexedAmbiguousLines } from "../js/lyricsQuestionUniqueness.js";
import { computeLyricsContentHash } from "../js/lyricsSegmentEngine.js";
import { computeCallsFingerprint } from "../js/callTextEdits.js";
import {
  CALL_RELEASE_SCHEMA,
  CALL_RELEASE_VERSION,
  computeLyricsLineFingerprint,
  validateCallReleaseArtifact,
  resolveReleasedCallSong,
} from "../js/callReleaseImport.js";
import { assertEqual } from "./test-utils.js";

const fileOf = (songId, contentHash, existingContentHash) => ({ fileName: `${songId}.json`, normalizedData: { songId, contentHash }, existingContentHash });

export function runLyricsPatchAndCallReleaseTests() {
  console.log("--- 1曲だけの歌詞修正・コール表の受け取り（2026-10-29） ---");

  // ===== データパック：updateExistingOnly =====
  const manifest = { type: DATA_PACK_MANIFEST_TYPE, schemaVersion: 1, packId: "p", packLabel: "修正", packKind: "correction", songIds: ["love"] };
  assertEqual(validateManifest({ ...manifest, updateExistingOnly: true }).valid, true, "updateExistingOnly: true のマニフェストは有効");
  assertEqual(validateManifest(manifest).valid, true, "updateExistingOnly が無い古いマニフェストもそのまま有効");
  assertEqual(validateManifest({ ...manifest, updateExistingOnly: "yes" }).valid, false, "updateExistingOnly が真偽値でなければエラー");

  const files = [fileOf("a", "h1", "h1"), fileOf("b", "h2", "old"), fileOf("c", "h3", null)];
  assertEqual(
    planLyricsImportActions(files).map((p) => p.action),
    ["skip-identical", "backup-and-update", "save-new"],
    "通常のパック：同じ→飛ばす／違う→控えてから上書き／無い→新しく保存（今までどおり）"
  );
  assertEqual(
    planLyricsImportActions(files, { updateExistingOnly: true }).map((p) => p.action),
    ["skip-identical", "backup-and-update", "skip-not-installed"],
    "修正だけのパック：この端末に無い曲は作らない"
  );
  assertEqual(planLyricsImportActions([]).length, 0, "歌詞が無いパックでは何もしない");

  // ===== 上書き前の控え（純粋関数の部分） =====
  const backups = [1, 5, 3, 4, 2].map((t) => ({ id: `s@${t}`, songId: "s", backedUpAt: t }));
  assertEqual(pruneBackupKeys(backups), ["s@2", "s@1"], `控えは新しい順に${MAX_BACKUPS_PER_SONG}件だけ残す（古い控えだけ消す）`);
  assertEqual(pickLatestBackup(backups).id, "s@5", "戻すときは一番新しい控え");
  assertEqual(pickLatestBackup([]), null, "控えが無ければ null");
  const restored = prepareRestoreRecord({ record: { songId: "s", lines: [{ line: 1, text: "x", start: 1, end: 2, extra: 1 }], schemaVersion: 1, updatedAt: 9, contentHash: "old" } });
  assertEqual(restored, { songId: "s", lines: [{ line: 1, text: "x", start: 1, end: 2 }], schemaVersion: 1 }, "控えから戻す形：更新日時・内容ハッシュは外す（保存時に計算し直す）");
  assertEqual(prepareRestoreRecord(null), null, "壊れた控えは戻さない");

  // ===== 歌詞クイズの事前計算一覧：歌詞が変わったら一覧を使わない（安全側に戻る） =====
  const oldLines = [{ line: 1, text: "ダミーの一行目です", start: 1, end: 2 }, { line: 2, text: "ダミーの二行目です", start: 3, end: 4 }];
  const newLines = [oldLines[0], { line: 2, text: "ダミーの一行目です", start: 2.5, end: 2.9 }, { ...oldLines[1], line: 3 }];
  const index = { songs: { s: { contentHash: computeLyricsContentHash(oldLines), lineCount: 2, ambiguousLines: [2] } } };
  assertEqual(resolveIndexedAmbiguousLines("s", oldLines, index), { verified: true, lineNumbers: [2] }, "歌詞が同じなら一覧の除外行を使う");
  assertEqual(resolveIndexedAmbiguousLines("s", newLines, index), { verified: false, lineNumbers: [] }, "行を足した歌詞では一覧を使わない（ずれた行番号を除外しない。端末内の比較だけになる）");

  // ===== コール表の受け取り =====
  const lines = [{ line: 1, text: "ダミーA", start: 1, end: 2 }, { line: 2, text: "ダミーB", start: 3, end: 4 }];
  const deviceCalls = [{ type: "mix", start: 5, end: 7, text: "ダミーのコール" }];
  const song = {
    textApprovedAt: "2026-10-29T00:00:00.000Z",
    timingCompletedAt: "2026-10-29T00:00:00.000Z",
    baseFingerprint: computeCallsFingerprint(deviceCalls),
    lyricsFingerprint: computeLyricsLineFingerprint(lines),
    calls: { "mix@5.00": { lineNo: 2, position: "after", originalTextHash: undefined } },
    added: [{ key: "added-x", text: "ダミー追加", type: "unique", lineNo: 1, position: "inline", order: 1.1 }],
    timing: { offsetSec: 0.2, calls: { "mix@5.00": { start: 5.1, end: 6.3 }, "added-x": { start: 1.2, end: 1.8 }, "added-gone": { start: 9, end: 10 } } },
  };
  delete song.calls["mix@5.00"].originalTextHash;
  const artifact = { schema: CALL_RELEASE_SCHEMA, version: CALL_RELEASE_VERSION, exportedAt: "2026-10-29", songs: { s: song } };
  assertEqual(validateCallReleaseArtifact(artifact), [], "正しい成果物は点検を通る");
  assertEqual(validateCallReleaseArtifact({ ...artifact, displayLyricsPrivate: {} }).length > 0, true, "歌詞の文章（displayLyricsPrivate）が入っていたら受け取らない");
  assertEqual(validateCallReleaseArtifact({ ...artifact, songs: { s: { ...song, lineTexts: {} } } }).length > 0, true, "曲の中に歌詞の文章があれば受け取らない");
  assertEqual(validateCallReleaseArtifact({ ...artifact, songs: { s: { ...song, timing: { offsetSec: 0, calls: { k: { start: 2, end: 2.05 } } } } } }).length > 0, true, "短すぎる光り方は受け取らない");

  const ok = resolveReleasedCallSong(song, { deviceLines: lines, deviceCalls });
  assertEqual([ok.ok, ok.overrides["mix@5.00"].lineNo, ok.overrides["added-x"].lineNo], [true, 2, 1], "歌詞・コールが同じ端末には配置を当てはめる");
  assertEqual(ok.callTimes, { "mix@5.00": { start: 5.3, end: 6.5 }, "added-x": { start: 1.4, end: 2 } }, "時刻は全体オフセットを足す。端末に無いコールの時刻は使わない");
  const lyricsChanged = resolveReleasedCallSong(song, { deviceLines: [...lines, { line: 3, text: "ダミーC", start: 5, end: 6 }], deviceCalls });
  assertEqual([lyricsChanged.ok, lyricsChanged.reason, lyricsChanged.overrides], [false, "lyrics-mismatch", null], "歌詞の行が違う端末（行を足す前後など）には当てはめない");
  const callsChanged = resolveReleasedCallSong(song, { deviceLines: lines, deviceCalls: [{ ...deviceCalls[0], text: "別の版" }] });
  assertEqual([callsChanged.ok, callsChanged.reason], [false, "calls-mismatch"], "コールが違う端末には当てはめない");
  assertEqual(resolveReleasedCallSong(null, { deviceLines: lines, deviceCalls }).reason, "no-entry", "成果物に無い曲は何もしない");
}
