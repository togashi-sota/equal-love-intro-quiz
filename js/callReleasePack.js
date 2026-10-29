// 「完成版コールデータ」（本人が承認したコール表＋本人が付けた時刻）を端末へ読み込むときの判断をまとめたファイル（2026-10-30新設）。
// DOM・IndexedDB に触れない純粋関数だけ。保存は js/callStorage.js（releasedCalls ストア）、画面は js/callReleaseImportUi.js。
//
// 読み込むもの（ZIP の中、または JSON を直接）：
//   1. コール表の成果物  schema "equal-love-call-release"（形と点検は js/callReleaseImport.js）。歌詞本文は入っていない
//   2. 表示用の歌詞（任意） schema "equal-love-call-display-private"
//      { songs: { [songId]: { lineTexts, lyricsFingerprint } } } … 本人が文字モード用に直した歌詞の行（歌詞を含むので非公開）
//
// 【本人の採用方針（2026-10-30 確定）】成果物に入っている曲＝採用（コール表あり）。入っていない曲＝この版ではコール表なし。
//   「コール表なし」は本人の編集上の判断で、実際のライブにコールが無いという意味ではない。
//
// 1曲1レコード：
//   { songId, current: 版 | null, previous: 版 | null, updatedAt }
//   版 = { entry（成果物の1曲分）, display（lineTexts と lyricsFingerprint）| null, contentHash, exportedAt, source, importedAt }
//   previous は1つ前の版（「元に戻す」で current と入れ替える）。current が null ＝ 新しい版で取り下げられた曲（コール表なし）
//
// 守ること：
//   ・中身が同じ曲は書き換えない（同じパックをもう一度読み込んでも何も変わらない）
//   ・古い成果物（exportedAt が前）で新しい版を上書きしない。本人が「古い版に戻す」と確かめたときだけ戻す
//   ・失敗は曲ごと。歌詞・音源・元のコールには触れない
import { hashText } from "./callTextEdits.js";
import { CALL_RELEASE_SCHEMA, validateCallReleaseArtifact, computeLyricsLineFingerprint } from "./callReleaseImport.js";

export const CALL_DISPLAY_PRIVATE_SCHEMA = "equal-love-call-display-private";
export const CALL_DISPLAY_PRIVATE_VERSION = 1;

// 読み込んだ結果の種類（画面の集計と同じ並び）
export const RELEASE_ACTION = {
  ADD: "add", // 新しく入った曲
  UPDATE: "update", // 中身が変わった曲
  UNCHANGED: "unchanged", // 中身が同じ（書き換えない）
  OLDER: "older", // 端末の方が新しい版（書き換えない。本人が確かめたら ROLLBACK）
  ROLLBACK: "rollback", // 本人が確かめて、古い版へ戻す
  WITHDRAW: "withdraw", // 新しい版で採用から外れた（コール表なしにする。前の版は残す）
  INVALID: "invalid", // その曲のデータが壊れている（その曲だけ読み込まない）
  UNKNOWN_SONG: "unknown-song", // アプリに無い曲
};

// JSON の中身が、どちらのファイルか
export function classifyCallReleaseJson(data) {
  if (!data || typeof data !== "object") return null;
  if (data.schema === CALL_RELEASE_SCHEMA) return "artifact";
  if (data.schema === CALL_DISPLAY_PRIVATE_SCHEMA) return "display";
  return null;
}

// キーの順番に左右されない文字列化（中身が同じかを比べるため）
export function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

// 1曲分の中身の指紋（コール表＋表示用の歌詞）。照合用で暗号強度は不要（長さも付けて偶然の一致を減らす）
export function songContentHash(entry, display) {
  const text = stableStringify({ entry: entry ?? null, display: display ?? null });
  return `${hashText(text)}-${text.length}`;
}

// 表示用の歌詞ファイルの点検（全体）。戻り値：エラーの配列
export function validateDisplayPrivate(data) {
  if (!data || data.schema !== CALL_DISPLAY_PRIVATE_SCHEMA) return ["表示用の歌詞ファイルの形式が違います"];
  if (data.version !== CALL_DISPLAY_PRIVATE_VERSION) return [`対応していない版です（${data.version}）`];
  if (!data.songs || typeof data.songs !== "object") return ["曲のデータがありません"];
  return [];
}

// 表示用の歌詞の1曲分が使える形か
function validDisplaySong(song) {
  return Boolean(
    song &&
      song.lineTexts &&
      typeof song.lineTexts === "object" &&
      song.lyricsFingerprint &&
      Number.isInteger(song.lyricsFingerprint.lineCount) &&
      typeof song.lyricsFingerprint.hash === "string",
  );
}

// 成果物の1曲分だけを点検する（1曲の不具合で全体を止めない）
function validateArtifactSong(artifact, songId) {
  return validateCallReleaseArtifact({ schema: artifact.schema, version: artifact.version, songs: { [songId]: artifact.songs[songId] } });
}

const timeOf = (iso) => {
  const value = Date.parse(iso ?? "");
  return Number.isFinite(value) ? value : null;
};

// 読み込みの計画（何も書き換えない）。
// options：
//   artifact … コール表の成果物（必須）
//   display  … 表示用の歌詞ファイル（無くてもよい）
//   existing … Map（songId → この端末のレコード）
//   knownSongIds … アプリにある曲ID（Set）
//   deviceLyricsFingerprints … Map（songId → この端末の歌詞の指紋 {lineCount, hash}。歌詞が無い曲は入れない＝0行として比べる）
//   allowRollback … 本人が「古い版に戻す」と確かめたとき true
// 戻り値：{ ok, errors, exportedAt, source, items: [{ songId, action, reason, lyricsMismatch, hasDisplay, next? }], counts }
export function planCallReleaseImport({ artifact, display = null, existing = new Map(), knownSongIds = null, deviceLyricsFingerprints = new Map(), allowRollback = false }) {
  const errors = [];
  if (!artifact || artifact.schema !== CALL_RELEASE_SCHEMA) return { ok: false, errors: ["完成版コールデータ（コール表）のファイルが見つかりません"], items: [], counts: countActions([]) };
  if (artifact.version !== 1) return { ok: false, errors: [`対応していない版です（${artifact.version}）`], items: [], counts: countActions([]) };
  if (!artifact.songs || typeof artifact.songs !== "object") return { ok: false, errors: ["曲のデータがありません"], items: [], counts: countActions([]) };
  if (artifact.displayLyricsPrivate !== undefined) return { ok: false, errors: ["コール表のファイルに歌詞の文章が入っています（入れない約束です）"], items: [], counts: countActions([]) };
  const exportedAt = artifact.exportedAt ?? null;
  const exportedTime = timeOf(exportedAt);
  if (exportedTime === null) return { ok: false, errors: ["書き出した日時（exportedAt）がありません"], items: [], counts: countActions([]) };
  if (display) errors.push(...validateDisplayPrivate(display).map((message) => `表示用の歌詞：${message}`));
  const displayUsable = display && errors.length === 0;
  const source = artifact.source && typeof artifact.source === "object" ? { editsRevision: artifact.source.editsRevision ?? null, timingRevision: artifact.source.timingRevision ?? null } : { editsRevision: null, timingRevision: null };
  // 表示用の歌詞は、同じ編集の版（editsRevision）から書き出したものだけ使う（別の版の歌詞の直しを混ぜない）
  const displayRevision = displayUsable ? display.source?.editsRevision ?? null : null;
  const displayMatchesRevision = displayUsable && (displayRevision === null || source.editsRevision === null || displayRevision === source.editsRevision);
  if (displayUsable && !displayMatchesRevision) errors.push("表示用の歌詞が、コール表と別の版から書き出されています（表示用の歌詞は使いません）");

  const items = [];
  for (const songId of Object.keys(artifact.songs).sort()) {
    const entry = artifact.songs[songId];
    const record = existing.get(songId) ?? null;
    const current = record?.current ?? null;
    if (knownSongIds && !knownSongIds.has(songId)) {
      items.push({ songId, action: RELEASE_ACTION.UNKNOWN_SONG, reason: "アプリに無い曲です" });
      continue;
    }
    const songErrors = validateArtifactSong(artifact, songId);
    if (songErrors.length) {
      items.push({ songId, action: RELEASE_ACTION.INVALID, reason: songErrors.join(" / ") });
      continue;
    }
    let songDisplay = null;
    let hasDisplay = false;
    if (displayMatchesRevision && display.songs[songId] !== undefined) {
      if (validDisplaySong(display.songs[songId])) {
        songDisplay = { lineTexts: display.songs[songId].lineTexts, lyricsFingerprint: display.songs[songId].lyricsFingerprint };
        hasDisplay = true;
      }
    } else if (!display && current?.display && current.source?.editsRevision !== null && current.source?.editsRevision === source.editsRevision) {
      // パックに表示用の歌詞が無いときは、同じ編集の版で入れた表示用の歌詞を引き継ぐ（コール表だけを入れ直しても消えないように）
      songDisplay = current.display;
      hasDisplay = true;
    }
    const contentHash = songContentHash(entry, songDisplay);
    // 歌詞の無い曲（インスト曲など）は「0行の歌詞」として比べる
    const deviceFp = deviceLyricsFingerprints.get(songId) ?? computeLyricsLineFingerprint([]);
    const lyricsMismatch = deviceFp.lineCount !== entry.lyricsFingerprint.lineCount || deviceFp.hash !== entry.lyricsFingerprint.hash;
    const next = { entry, display: songDisplay, contentHash, exportedAt, source };
    const base = { songId, lyricsMismatch, hasDisplay, next };
    if (!current) {
      // 初めて／取り下げのあと。取り下げた版より古い成果物で、取り下げを取り消さない
      const withdrawnAt = timeOf(record?.withdrawnAt);
      if (withdrawnAt !== null && exportedTime < withdrawnAt && !allowRollback) items.push({ ...base, action: RELEASE_ACTION.OLDER, reason: "新しい版でコール表なしになった曲です" });
      else items.push({ ...base, action: withdrawnAt !== null && exportedTime < withdrawnAt ? RELEASE_ACTION.ROLLBACK : RELEASE_ACTION.ADD });
      continue;
    }
    if (current.contentHash === contentHash) {
      items.push({ ...base, action: RELEASE_ACTION.UNCHANGED });
      continue;
    }
    const currentTime = timeOf(current.exportedAt);
    if (currentTime !== null && exportedTime < currentTime) {
      items.push({ ...base, action: allowRollback ? RELEASE_ACTION.ROLLBACK : RELEASE_ACTION.OLDER, reason: allowRollback ? "本人の確認で古い版へ戻す" : `この端末の方が新しい版です（${current.exportedAt}）` });
      continue;
    }
    items.push({ ...base, action: RELEASE_ACTION.UPDATE });
  }
  // 新しい成果物に入っていない曲＝採用から外れた曲（コール表なしにする）。古い成果物では外さない
  for (const [songId, record] of existing) {
    if (artifact.songs[songId] !== undefined || !record?.current) continue;
    const currentTime = timeOf(record.current.exportedAt);
    if (currentTime !== null && exportedTime > currentTime) items.push({ songId, action: RELEASE_ACTION.WITHDRAW, reason: "この版では採用されていません（コール表なし）", lyricsMismatch: false, hasDisplay: false });
  }
  return { ok: true, errors, exportedAt, source, items, counts: countActions(items) };
}

export function countActions(items) {
  const counts = Object.fromEntries(Object.values(RELEASE_ACTION).map((action) => [action, 0]));
  let lyricsMismatch = 0;
  for (const item of items) {
    counts[item.action] += 1;
    if (item.lyricsMismatch && item.action !== RELEASE_ACTION.INVALID && item.action !== RELEASE_ACTION.UNKNOWN_SONG && item.action !== RELEASE_ACTION.WITHDRAW) lyricsMismatch += 1;
  }
  return { ...counts, lyricsMismatch };
}

// 計画の1曲分を当てはめた新しいレコード（書き換えない曲は null）。元のレコードは書き換えない
export function applyPlanItem(item, record, now) {
  const importedAt = now;
  if (item.action === RELEASE_ACTION.ADD || item.action === RELEASE_ACTION.UPDATE || item.action === RELEASE_ACTION.ROLLBACK) {
    const nextVersion = { ...item.next, importedAt };
    return { songId: item.songId, current: nextVersion, previous: record?.current ?? record?.previous ?? null, updatedAt: now, withdrawnAt: null };
  }
  if (item.action === RELEASE_ACTION.WITHDRAW && record?.current) {
    return { songId: item.songId, current: null, previous: record.current, updatedAt: now, withdrawnAt: now };
  }
  return null;
}

// 「元に戻す」：今の版と1つ前の版を入れ替える（もう一度押すと、また入れ替わる）。戻せないときは null
export function undoReleasedSong(record, now) {
  if (!record?.previous) return null;
  return { songId: record.songId, current: record.previous, previous: record.current ?? null, updatedAt: now, withdrawnAt: record.current ? null : record.withdrawnAt ?? null, undoneAt: now };
}

// データ管理に出す「この端末の完成版コールデータの版」：曲ごとの書き出し日時をまとめる
// 戻り値：{ songCount, latest: { exportedAt, editsRevision, timingRevision } | null, mixed: 別の版の曲があるか }
export function summarizeReleaseVersion(records) {
  const currents = [...(records?.values?.() ?? [])].map((record) => record?.current).filter(Boolean);
  if (!currents.length) return { songCount: 0, latest: null, mixed: false };
  const sorted = [...currents].sort((a, b) => (timeOf(b.exportedAt) ?? 0) - (timeOf(a.exportedAt) ?? 0));
  const latest = sorted[0];
  const mixed = currents.some((version) => version.exportedAt !== latest.exportedAt);
  return { songCount: currents.length, latest: { exportedAt: latest.exportedAt, editsRevision: latest.source?.editsRevision ?? null, timingRevision: latest.source?.timingRevision ?? null }, mixed };
}

// 画面の結果の文章（曲名の引き方は呼び出し側が渡す）
export function describeImportResult(plan, titleOf = (songId) => songId) {
  const c = plan.counts;
  const namesOf = (action) => plan.items.filter((item) => item.action === action).map((item) => titleOf(item.songId));
  const lines = [];
  lines.push(`更新 ${c.add + c.update + c.rollback}曲（新しく ${c.add}・中身が変わった ${c.update}${c.rollback ? `・古い版へ戻した ${c.rollback}` : ""}）／変更なし ${c.unchanged}曲／古いので読み込まなかった ${c.older}曲／歌詞の版が違う ${c.lyricsMismatch}曲`);
  const add = (label, names) => {
    if (names.length) lines.push(`${label}：${names.join("、")}`);
  };
  add("更新した曲", [...namesOf(RELEASE_ACTION.ADD), ...namesOf(RELEASE_ACTION.UPDATE), ...namesOf(RELEASE_ACTION.ROLLBACK)]);
  add("古いので読み込まなかった曲", namesOf(RELEASE_ACTION.OLDER));
  add("コール表なしになった曲", namesOf(RELEASE_ACTION.WITHDRAW));
  add(
    "歌詞の版が違う曲（最新の歌詞パックを読み込むと表示されます）",
    plan.items.filter((item) => item.lyricsMismatch && item.action !== RELEASE_ACTION.INVALID && item.action !== RELEASE_ACTION.UNKNOWN_SONG && item.action !== RELEASE_ACTION.WITHDRAW).map((item) => titleOf(item.songId)),
  );
  add("読み込めなかった曲", [...namesOf(RELEASE_ACTION.INVALID), ...namesOf(RELEASE_ACTION.UNKNOWN_SONG)]);
  return lines;
}
