// ライブコール文字モードの「完成したコール表（配置＋時刻）」を、アプリが受け取るときの約束（形式）と点検をまとめたファイル（2026-10-29新設）。
// 【まだ画面にはつないでいない】形式と点検だけを先に決め、テストで守る。実際のデータはまだどこにも入れない。
//
// 何を受け取るか（ローカルの更新準備ツール tools/release-prep/ が書き出す「コールだけの成果物」）：
// {
//   schema: "equal-love-call-release", version: 1, exportedAt,
//   songs: {
//     [songId]: {
//       textApprovedAt, timingCompletedAt,
//       baseFingerprint,            … 元のコール一式の指紋（js/callTextEdits.js の computeCallsFingerprint。js/data/callTextPlacements.js と同じ）
//       lyricsFingerprint: { lineCount, hash }, … 配置を決めたときの歌詞の「行ごとの指紋」をまとめた値（歌詞本文は含まない）
//       calls: { [callKey]: { lineNo, position, order?, offset?, lineTextHash?, hidden?, split?, editedText?, originalTextHash } },
//       added: [ { key, text, type, lineNo, position, order, offset?, lineTextHash? } ],
//       timing: { offsetSec, calls: { [表示単位のキー]: { start, end } } }   … 赤文字の光り始め・終わり（秒）
//     }
//   }
// }
// 【歌詞本文は入れない】黒文字（歌詞）の文章・表示用の歌詞（displayLyricsPrivate）は入れない。歌詞は各端末の IndexedDB のものを使う。
// 【コール本文について】editedText・added の text はファンのコール（掛け声）の文章。公開ファイルに入れてよいかは本人が決める
// （ここでは「入っていてもよい形式」を決めるだけ。権利の判断はしない）。
//
// 【安全の約束】端末の歌詞・コールが、成果物を作ったときと1つでも違えば、その曲には当てはめない（誤った行・時刻を出さない）。
//   ・歌詞：行の数と「行ごとの指紋」が同じ（lyricsFingerprint）
//   ・コール：resolveApprovedCallText（js/callTextEdits.js）の照合をそのまま使う
//   ・時刻：開始 < 終了、長さ 0.1〜30 秒、0 以上
import { hashText, resolveApprovedCallText } from "./callTextEdits.js";

export const CALL_RELEASE_SCHEMA = "equal-love-call-release";
export const CALL_RELEASE_VERSION = 1;
const MIN_CALL_SEC = 0.1;
const MAX_CALL_SEC = 30;

// 歌詞の行ごとの指紋をまとめた値（歌詞本文は含まない）。tools/live-call-text/lyricsRemap.js の lyricsFingerprint と同じ計算。
export function computeLyricsLineFingerprint(lines) {
  const lineHashes = [...(lines ?? [])].sort((a, b) => a.line - b.line).map((l) => hashText(String(l.text ?? "")));
  return { lineCount: lineHashes.length, hash: hashText(lineHashes.join(",")) };
}

// 成果物全体の形の点検。戻り値：エラーの配列（空なら正常）。歌詞本文らしき項目が入っていたらエラー（入れない約束を守る）
export function validateCallReleaseArtifact(artifact) {
  const errors = [];
  if (!artifact || artifact.schema !== CALL_RELEASE_SCHEMA) return ["コール表の形式が違います"];
  if (artifact.version !== CALL_RELEASE_VERSION) errors.push(`対応していない版です（${artifact.version}）`);
  if (artifact.displayLyricsPrivate !== undefined) errors.push("歌詞の文章（displayLyricsPrivate）が入っています。コール表には入れません");
  if (!artifact.songs || typeof artifact.songs !== "object") return [...errors, "曲のデータがありません"];
  for (const [songId, song] of Object.entries(artifact.songs)) {
    if (song.lineTexts !== undefined || song.lyrics !== undefined) errors.push(`${songId}：歌詞の文章が入っています`);
    if (!song.lyricsFingerprint || !Number.isInteger(song.lyricsFingerprint.lineCount) || typeof song.lyricsFingerprint.hash !== "string") errors.push(`${songId}：歌詞の指紋がありません`);
    if (typeof song.baseFingerprint !== "string") errors.push(`${songId}：コールの指紋がありません`);
    if (!song.calls || typeof song.calls !== "object") errors.push(`${songId}：コールの配置がありません`);
    if (!Array.isArray(song.added ?? [])) errors.push(`${songId}：追加コールの形が不正`);
    for (const [key, t] of Object.entries(song.timing?.calls ?? {})) {
      if (!(Number.isFinite(t?.start) && Number.isFinite(t?.end) && t.start >= 0)) errors.push(`${songId} ${key}：時刻が不正`);
      else if (t.end - t.start < MIN_CALL_SEC - 1e-9 || t.end - t.start > MAX_CALL_SEC + 1e-9) errors.push(`${songId} ${key}：光る長さが不正`);
    }
    if (song.timing !== undefined && !Number.isFinite(song.timing?.offsetSec ?? 0)) errors.push(`${songId}：全体オフセットが不正`);
  }
  return errors;
}

// 1曲分を、この端末の歌詞・コールに当てはめる。
// 戻り値：{ ok, reason, calls, overrides, callTimes }
//   ok=false のときは何も当てはめない（呼び出し側は今までどおり「未確認」の表示にする）
//   callTimes：{ [表示単位のキー]: { start, end } }（全体オフセットを足した、音源の再生位置で比べられる時刻）
export function resolveReleasedCallSong(song, { deviceLines, deviceCalls }) {
  const empty = { calls: deviceCalls ?? [], overrides: null, callTimes: null };
  if (!song) return { ok: false, reason: "no-entry", ...empty };
  const fp = computeLyricsLineFingerprint(deviceLines ?? []);
  if (!song.lyricsFingerprint || fp.lineCount !== song.lyricsFingerprint.lineCount || fp.hash !== song.lyricsFingerprint.hash) {
    return { ok: false, reason: "lyrics-mismatch", ...empty }; // 歌詞の版が違う（行の追加・修正の前後など）
  }
  const resolved = resolveApprovedCallText(deviceCalls ?? [], { baseFingerprint: song.baseFingerprint, calls: song.calls, added: song.added ?? [] });
  if (!resolved.approved) return { ok: false, reason: "calls-mismatch", ...empty };
  const offset = Number.isFinite(song.timing?.offsetSec) ? song.timing.offsetSec : 0;
  const shownKeys = new Set(resolved.calls.map((c) => (typeof c.key === "string" && c.key ? c.key : `${c.type}@${Number(c.start).toFixed(2)}`)));
  const callTimes = {};
  for (const [key, t] of Object.entries(song.timing?.calls ?? {})) {
    if (!shownKeys.has(key)) continue; // 端末に無いコールの時刻は使わない
    callTimes[key] = { start: Math.round((t.start + offset) * 100) / 100, end: Math.round((t.end + offset) * 100) / 100 };
  }
  return { ok: true, reason: null, calls: resolved.calls, overrides: resolved.overrides, callTimes };
}
