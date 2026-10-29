// 新しいライブコール（2026-10-30・リニューアル第3〜5段階）の「データの組み立て」だけをまとめたファイル。
// DOM・IndexedDB に触れない純粋関数。画面は js/liveCallScreen.js。
//
// 【4つの層を混ぜない】
//   層1 コール表の並び・置き場所 … 本人のコール表（完成版コールデータ）。ここでは読むだけ
//   層2 コールの開始・終了       … 本人の時刻（完成版コールデータの timing）。ここでは読むだけ（計算し直さない・丸め直さない）
//   層3 AI の歌詞時刻             … 端末の歌詞データ。スクロールの目安とカラオケだけに使い、コールの光り方には使わない
//   層4 画面のスクロール          … js/callFollow.js が毎回計算する（保存しない）
//
// 【本人の採用方針】完成版コールデータに入っている曲だけコール表あり。それ以外の曲は、端末に元のコールや
// 調査候補・AI の提案があっても、コールを1件も出さない（「この曲のコール表はまだありません」）。
import { resolveReleasedCallSong, computeLyricsLineFingerprint } from "./callReleaseImport.js";
import { applyDisplayLyrics } from "./callTextEdits.js";
import { buildCallTextLayout } from "./callTextLayout.js";
import { LYRICS_SUPERSEDED_CONTENT_HASHES } from "./data/lyricsSupersededVersions.js";
import { prepareCall, assignPopLevels, EFFECT_TYPES, LONG_SEC } from "./callEffects.js";
import { classifyShoutText } from "./shoutWords.js";

// コール表の状態（曲ごと）
export const SHEET_STATE = {
  READY: "ready", // 表示できる
  NO_SHEET: "no-sheet", // この版ではコール表なし（本人の採用方針）
  LYRICS_MISSING: "lyrics-missing", // 歌詞データがこの端末に無い
  LYRICS_OLD: "lyrics-old", // この端末の歌詞データが古い版
  LYRICS_DIFFERENT: "lyrics-different", // 歌詞データの版が、コール表を作ったときと違う（新しい版の可能性）
  CALLS_MISMATCH: "calls-mismatch", // この端末の元のコールデータが、コール表を作ったときと違う
};

export const SHEET_STATE_MESSAGES = {
  [SHEET_STATE.NO_SHEET]: "この曲のコール表はまだありません。",
  [SHEET_STATE.LYRICS_MISSING]: "この曲の歌詞データがこの端末にありません。歌詞パック（データパック）を読み込むと、コール表を表示できます。",
  [SHEET_STATE.LYRICS_OLD]: "この端末の歌詞データが古い版です。最新の歌詞パックを読み込んでください（コールは歌詞の行に合わせて置いているため、古い歌詞のままでは表示しません）。音源はそのまま使えます。",
  [SHEET_STATE.LYRICS_DIFFERENT]:
    "この端末の歌詞データが、コール表を作ったときの版と違います（歌詞データの方が新しい版か、別の版です）。最新の歌詞パックと完成版コールデータを読み込んでください。違う行にコールを出さないよう、今は表示しません。音源はそのまま使えます。",
  [SHEET_STATE.CALLS_MISMATCH]: "この端末の元のコールデータが、コール表を作ったときと違います。最新のデータパックを読み込んでください。音源・歌詞はそのまま使えます。",
};

// 1曲分のコール表を組み立てる。
// record：完成版コールデータのレコード（js/callReleasePack.js）。無い・取り下げ済みなら「コール表なし」
// lyricsRecord：端末の歌詞データ（{ lines, contentHash }）。deviceCalls：端末の元のコール（callData の calls）
// 戻り値：{ state, ok, message, layout, calls, callTimes, displayApplied, lines }
//   calls：時刻のある表示単位（コール表の並び順）。{ key, text, type, start, end }。start・end は本人の時刻そのもの（＋全体オフセット）
export function buildReleasedCallSheet({ record, lyricsRecord, deviceCalls }) {
  const lines = Array.isArray(lyricsRecord?.lines) ? lyricsRecord.lines : [];
  const entry = record?.current?.entry ?? null;
  const fail = (state) => ({ state, ok: false, message: SHEET_STATE_MESSAGES[state], layout: null, calls: [], callTimes: {}, displayApplied: false, lines });
  if (!entry) return fail(SHEET_STATE.NO_SHEET);
  const resolved = resolveReleasedCallSong(entry, { deviceLines: lines, deviceCalls: deviceCalls ?? [] });
  if (!resolved.ok) {
    if (resolved.reason === "lyrics-mismatch") {
      if (lines.length === 0 && entry.lyricsFingerprint?.lineCount > 0) return fail(SHEET_STATE.LYRICS_MISSING);
      const superseded = LYRICS_SUPERSEDED_CONTENT_HASHES[record.songId ?? ""] ?? [];
      if (lyricsRecord?.contentHash && superseded.includes(lyricsRecord.contentHash)) return fail(SHEET_STATE.LYRICS_OLD);
      return fail(SHEET_STATE.LYRICS_DIFFERENT);
    }
    return fail(SHEET_STATE.CALLS_MISMATCH);
  }
  // 本人が直した表示用の歌詞：歌詞の版（行ごとの指紋）が書き出したときと同じときだけ。行ごとの照合は applyDisplayLyrics
  const display = record.current.display;
  const fp = computeLyricsLineFingerprint(lines);
  const displayApplied = Boolean(display?.lineTexts && display.lyricsFingerprint && display.lyricsFingerprint.lineCount === fp.lineCount && display.lyricsFingerprint.hash === fp.hash);
  const shownLines = displayApplied ? applyDisplayLyrics(lines, display.lineTexts) : lines;
  // 並べ方はコール表エディターの完成プレビューと同じ部品（js/callTextLayout.js）。ここで並び順を作り直さない
  const layout = buildCallTextLayout(shownLines, resolved.calls, { overrides: resolved.overrides });
  const calls = [];
  for (const call of layoutCallsInOrder(layout)) {
    const time = resolved.callTimes[call.key];
    if (!time) continue;
    calls.push({ key: call.key, text: call.text, type: call.type, start: time.start, end: time.end });
  }
  return { state: SHEET_STATE.READY, ok: true, message: "", layout, calls, callTimes: resolved.callTimes, displayApplied, lines };
}

// 並び（layout）の中のコールを、上から表示される順に返す（js/callTextView.js が描く順と同じ）
export function layoutCallsInOrder(layout) {
  const out = [];
  for (const item of layout?.items ?? []) {
    if (item.kind === "block") {
      out.push(...item.calls);
      continue;
    }
    if (item.kind !== "line") continue;
    out.push(...item.before);
    out.push(...(item.anchored ?? []).flatMap((group) => group.calls));
    out.push(...item.inline);
    out.push(...item.after);
  }
  return out;
}

// モードごとに使えるか（曲はいつでも選べる。使えないモードは理由を出す）
//   コール表：コール表がある（state READY）
//   ライブコール：コール表＋時刻＋音源
//   カラオケ：歌詞（時刻つき）＋音源。コールは要らない
export function computeModeAvailability({ sheet, hasAudio, lyricsRecord }) {
  const lines = Array.isArray(lyricsRecord?.lines) ? lyricsRecord.lines : [];
  const timedLines = lines.filter((line) => Number.isFinite(line.start)).length;
  const sheetOk = Boolean(sheet?.ok);
  const timed = sheetOk && sheet.calls.length > 0;
  const audioReason = "この曲の音源がこの端末にありません。ホームの「データを追加・更新」から読み込んでください。";
  const sheetMode = sheetOk ? { ok: true, reason: "" } : { ok: false, reason: sheet?.message ?? SHEET_STATE_MESSAGES[SHEET_STATE.NO_SHEET] };
  let live;
  if (!sheetOk) live = { ok: false, reason: sheetMode.reason };
  else if (!timed) live = { ok: false, reason: "この曲のコールの時刻がまだありません。" };
  else if (!hasAudio) live = { ok: false, reason: audioReason };
  else live = { ok: true, reason: "" };
  let karaoke;
  if (lines.length === 0) karaoke = { ok: false, reason: "この曲の歌詞データがこの端末にありません。" };
  else if (timedLines === 0) karaoke = { ok: false, reason: "この曲の歌詞に時刻がありません。" };
  else if (!hasAudio) karaoke = { ok: false, reason: audioReason };
  else karaoke = { ok: true, reason: "" };
  return { sheet: sheetMode, live, karaoke };
}

// いま光っているコール（開始 ≦ t ＜ 終了）。本人の時刻だけで決める（歌詞の時刻は見ない）
export function activeCallKeysAt(calls, t) {
  const keys = [];
  for (const call of calls ?? []) if (call.start <= t && t < call.end) keys.push(call.key);
  return keys;
}

// コール優先スクロール（js/callFollow.js）が読む形の「曲」を、コール表の並びから作る。
// 歌詞行の時刻（層3）は、表示行の最初の部分の元の行の時刻だけを使う（分けた表示行の2つ目以降は時刻なし＝信頼しない）。
// geometryId：DOM の部品と対応させる目印（"call:キー"・"lyric:表示行の目印"・"block:番号"）
export function buildFollowSong({ layout, calls, lines, duration }) {
  const callByKey = new Map((calls ?? []).map((call) => [call.key, call]));
  const lineByNo = new Map((lines ?? []).map((line) => [line.line, line]));
  const song = { id: "song", duration: Number.isFinite(duration) ? duration : 0, sheet: [], calls: {}, lyrics: {}, markers: [], sectionMarkers: [] };
  for (const call of calls ?? []) song.calls[`call:${call.key}`] = { id: `call:${call.key}`, type: call.type, text: call.text, start: call.start, end: call.end };
  const ids = (list) => list.filter((call) => callByKey.has(call.key)).map((call) => `call:${call.key}`);
  let order = 0;
  let blockIndex = 0;
  for (const item of layout?.items ?? []) {
    if (item.kind === "block") {
      song.sheet.push({ kind: "block", id: `block:${blockIndex}`, position: item.position, calls: ids(item.calls) });
      blockIndex += 1;
      continue;
    }
    if (item.kind !== "line") continue;
    order += 1;
    const id = `lyric:${item.id}`;
    const segments = (item.parts ?? []).filter((part) => part.kind === "segment");
    const first = segments[0];
    const last = segments[segments.length - 1];
    const startsLine = first && first.start === 0;
    const firstLine = first ? lineByNo.get(first.lineNo) : null;
    const lastLine = last ? lineByNo.get(last.lineNo) : null;
    const ai = startsLine && Number.isFinite(firstLine?.start) ? { start: firstLine.start, end: Number.isFinite(lastLine?.end) ? lastLine.end : firstLine.start } : null;
    song.lyrics[id] = { id, order, text: item.text, ai, owner: null, ownerEnd: null, suspect: false };
    const anchoredStart = (item.anchored ?? []).filter((group) => group.offset === 0).flatMap((group) => group.calls);
    const anchoredRest = (item.anchored ?? []).filter((group) => group.offset !== 0).flatMap((group) => group.calls);
    song.sheet.push({ kind: "line", id, before: ids(item.before), inlineStart: ids(anchoredStart), inline: ids([...anchoredRest, ...item.inline]), after: ids(item.after) });
  }
  if (!song.duration) song.duration = Math.max(0, ...(calls ?? []).map((call) => call.end), ...(lines ?? []).map((line) => (Number.isFinite(line.end) ? line.end : 0)));
  return song;
}

// ===== 演出の種類（分類） =====
// 優先順位（ブリーフの決まり）：1 本人の明示（js/data/callEffects.js）→ 2 決まった種類（超絶かわいい・MIX・フッフー／ふわふわ）
//   → 3 短い掛け声（言葉で決める。長さでは決めない）→ 4 長さ（4秒以上）→ 5 ふつう。名前の色は本人の明示があるときだけ。
// textHash が合わない明示は使わない（文章が変わったときに、別のコールへ誤って当てないため）
export function classifyReleasedCalls(calls, explicitEffects = {}, hashText = null) {
  const preps = (calls ?? []).map((call) => {
    let effect = explicitEffects?.[call.key] ?? null;
    if (effect && effect.textHash && hashText && effect.textHash !== hashText(call.text)) effect = null;
    return prepareCall(call, effect);
  });
  return assignPopLevels(preps);
}

// 本人に見てもらう「分類の見直し一覧」（ローカルの確認スクリプトだけが使う。アプリの画面には出さない）。
// あいまいなもの：近い書き方の掛け声（要確認）／長さだけで「長いコール」にしたもの／名前らしい言葉を含むが明示の無いもの
export function buildClassificationReview(preps, { nameWords = [] } = {}) {
  const review = [];
  for (const prep of preps ?? []) {
    const reasons = [];
    if (prep.basis !== "explicit") {
      const shout = classifyShoutText(prep.text);
      if (shout.status === "near") reasons.push("近い書き方の掛け声（自動では短い掛け声にしていない）");
      if (prep.type === EFFECT_TYPES.LONG) reasons.push(`言葉に当たらず、長さ（${LONG_SEC}秒以上）だけで長いコールにした`);
      if (prep.type === EFFECT_TYPES.NORMAL && prep.d >= LONG_SEC) reasons.push("長いがふつうの扱い");
      if (nameWords.some((word) => word && prep.text.includes(word)) && prep.type !== EFFECT_TYPES.CUTE) reasons.push("名前らしい言葉を含む（名前の色は本人の明示があるときだけ）");
    }
    if (reasons.length) review.push({ key: prep.key, type: prep.type, start: prep.start, end: prep.end, reasons });
  }
  return review;
}
