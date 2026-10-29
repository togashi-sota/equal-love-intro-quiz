// 「この端末のデータの状態」を確かめる（2026-10-29新設・本人の希望）。
// 全部入りのパックを読み込んだあとに、音源・歌詞・コールがちゃんと入ったかを、曲の数と足りない曲の名前で見せる。
// 読むだけ（何も書き換えない）。数え方：
//   音源：IndexedDB の音源の保存場所に入っている曲（js/audioStorage.js）／全84曲
//   歌詞：歌詞の保存場所に入っている曲／歌詞のある曲（Overture は歌詞の無い曲なので数えない）
//         古い版の歌詞（js/data/lyricsSupersededVersions.js の一覧にある中身）は「古い版のまま」として別に数える
//   コール表：完成版コールデータが入っている曲。そのうち、端末の歌詞と版が合っていて実際に使える曲も数える
import { SONGS } from "./data/songs.js";
import { getImportedSongIds } from "./audioStorage.js";
import { getAllLyricsData, computeLyricsContentHash } from "./lyricsStorage.js";
import { getAllReleasedCallRecords } from "./callStorage.js";
import { summarizeReleaseVersion } from "./callReleasePack.js";
import { computeLyricsLineFingerprint } from "./callReleaseImport.js";
import { LYRICS_SUPERSEDED_CONTENT_HASHES } from "./data/lyricsSupersededVersions.js";

// 歌詞の無い曲（歌詞の数から外す）
export const SONGS_WITHOUT_LYRICS = new Set(["overture"]);

// iPhone で1回目の読み取りが失敗することがあるので、少し待って読み直す（だめなら null＝確かめられない）
async function readWithRetry(read) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await read();
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  return null;
}

// 端末の状態を集める（読むだけ）
export async function collectDeviceDataStatus() {
  const [audioIds, lyricsRecords, releasedRecords] = await Promise.all([
    readWithRetry(() => getImportedSongIds()),
    readWithRetry(() => getAllLyricsData()),
    readWithRetry(() => getAllReleasedCallRecords()),
  ]);
  const lyricsHashes = new Map();
  const lyricsFingerprints = new Map();
  for (const record of lyricsRecords ?? []) {
    if (!record || typeof record.songId !== "string" || !Array.isArray(record.lines)) continue;
    lyricsHashes.set(record.songId, record.contentHash ?? (await computeLyricsContentHash(record)));
    lyricsFingerprints.set(record.songId, computeLyricsLineFingerprint(record.lines));
  }
  return { audioIds, lyricsHashes: lyricsRecords ? lyricsHashes : null, lyricsFingerprints, releasedRecords };
}

// 数と足りない曲をまとめる（純粋関数：テストしやすくするため、読み取りと分ける）
export function summarizeDeviceDataStatus({ audioIds, lyricsHashes, lyricsFingerprints, releasedRecords }, songs = SONGS, superseded = LYRICS_SUPERSEDED_CONTENT_HASHES) {
  const title = (id) => songs.find((song) => song.id === id)?.title ?? id;
  const lyricSongs = songs.filter((song) => !SONGS_WITHOUT_LYRICS.has(song.id));
  const audio =
    audioIds === null
      ? null
      : { have: songs.filter((song) => audioIds.includes(song.id)).length, total: songs.length, missing: songs.filter((song) => !audioIds.includes(song.id)).map((song) => song.title) };
  const lyrics =
    lyricsHashes === null
      ? null
      : {
          have: lyricSongs.filter((song) => lyricsHashes.has(song.id)).length,
          total: lyricSongs.length,
          missing: lyricSongs.filter((song) => !lyricsHashes.has(song.id)).map((song) => song.title),
          old: lyricSongs.filter((song) => lyricsHashes.has(song.id) && (superseded[song.id] ?? []).includes(lyricsHashes.get(song.id))).map((song) => song.title),
        };
  let calls = null;
  if (releasedRecords) {
    const currents = [...releasedRecords.values()].filter((record) => record?.current);
    const usable = currents.filter((record) => {
      const fp = record.current.entry?.lyricsFingerprint;
      if (!fp) return false;
      if (fp.lineCount === 0) return true; // 歌詞の無い曲（Overture）
      const device = lyricsFingerprints.get(record.songId);
      return Boolean(device && device.lineCount === fp.lineCount && device.hash === fp.hash);
    });
    const version = summarizeReleaseVersion(releasedRecords);
    calls = {
      have: currents.length,
      usable: usable.length,
      notUsable: currents.filter((record) => !usable.includes(record)).map((record) => title(record.songId)),
      version: version.latest,
    };
  }
  return { audio, lyrics, calls };
}

// 画面に出す文（「最新版です」とは言わない。数えられた事実だけ）
export function describeDeviceDataStatus(summary) {
  const lines = [];
  const list = (names) => (names.length > 12 ? `${names.slice(0, 12).join("、")} …ほか${names.length - 12}曲` : names.join("、"));
  const mark = (ok) => (ok ? "✅" : "⚠️");
  if (!summary.audio) lines.push("⚠️ 音源：この端末で数えられませんでした（音源はそのまま残っています）");
  else {
    lines.push(`${mark(summary.audio.have === summary.audio.total)} 音源：${summary.audio.have}／${summary.audio.total}曲`);
    if (summary.audio.missing.length) lines.push(`　入っていない曲：${list(summary.audio.missing)}`);
  }
  if (!summary.lyrics) lines.push("⚠️ 歌詞：この端末で数えられませんでした");
  else {
    lines.push(`${mark(summary.lyrics.have === summary.lyrics.total && !summary.lyrics.old.length)} 歌詞：${summary.lyrics.have}／${summary.lyrics.total}曲（歌詞の無い Overture を除く）`);
    if (summary.lyrics.missing.length) lines.push(`　入っていない曲：${list(summary.lyrics.missing)}`);
    if (summary.lyrics.old.length) lines.push(`　古い版の歌詞のままの曲：${list(summary.lyrics.old)}（最新版データを読み込むと直ります）`);
  }
  if (!summary.calls) lines.push("⚠️ コール表：この端末で数えられませんでした");
  else if (summary.calls.have === 0) lines.push("⚠️ コール表（新しいライブコール）：まだ入っていません（最新版データ・全部入りを読み込むと入ります）");
  else {
    const v = summary.calls.version;
    const versionText = v ? `（書き出し ${new Date(v.exportedAt).toLocaleString("ja-JP")}・コール表 rev ${v.editsRevision ?? "?"}・時刻 rev ${v.timingRevision ?? "?"}）` : "";
    lines.push(`${mark(summary.calls.notUsable.length === 0)} コール表（新しいライブコール）：${summary.calls.have}曲入っています・そのうち使える曲 ${summary.calls.usable}曲${versionText}`);
    if (summary.calls.notUsable.length) lines.push(`　歌詞の版が合わず、今は使えない曲：${list(summary.calls.notUsable)}（最新版データを読み込むと直ります）`);
  }
  return lines;
}
