// 「最新版データを読み込む」：1つの ZIP（歌詞・完成版コール・表示用の歌詞・音源〈任意〉・マニフェスト〈任意〉）から、
// この端末に足りないもの・新しくなったものだけを入れる（2026-10-30新設・リニューアル）。
//
// 【新しく書いたのは「組み合わせ」だけ】判断の部品は今あるものを使う：
//   ・歌詞の正規化・点検・内容ハッシュ … js/lyricsStorage.js（parseAndNormalizeLyricsFile・validateLyricsData・computeLyricsContentHash）
//   ・歌詞の「同じ／新しい／古い版」 … js/dataPackImport.js の planLyricsImportActions（js/data/lyricsSupersededVersions.js の古い版の一覧）
//   ・マニフェストの点検 … js/dataPackImport.js の validateManifest（公開版 v383 と同じ点検を通る形にする）
//   ・完成版コールの「同じ／新しい／古い版・取り下げ」 … js/callReleasePack.js の planCallReleaseImport・applyPlanItem・undoReleasedSong
//   ・歌詞の指紋 … js/callReleaseImport.js の computeLyricsLineFingerprint
//   ・音源の「同じ／違う」 … js/dataPackImport.js の classifyByHash（今までの音源の決まりのまま）
//
// 【このファイルで決めること】
//   1. 曲ごとに「歌詞 → コール」の順で判断する。コールは「この読み込みの後に端末にある歌詞」の指紋で照合する
//      （歌詞が古い版で入らなかった曲に、新しい歌詞用のコールを入れない。違う行に赤文字を出さない）。
//   2. 片方だけ更新して、もう片方を壊さない：
//      今コール表が出ている曲で、パックの歌詞だけが新しく、それに合うコールがパックに無いときは、歌詞の更新を待つ（保留）。
//   3. 新旧は内容ハッシュだけで決めない：歌詞は古い版の一覧（アプリの一覧＋マニフェストの一覧）と、
//      「どのパック（作った日時）で入れた歌詞か」の記録、コールは書き出し日時（exportedAt）で決める。
//   4. 書き込みは本人が確認してから。曲ごとに 音源 → 歌詞 → コール。1曲の失敗でほかの曲を止めない。
//      歌詞を入れた後にコールの保存に失敗したら、その曲の歌詞を元に戻す（壊れた組を残さない）。容量不足は曲ごとに知らせる。
//   5. 上書きの前に1つ前の版を残す（歌詞：js/lyricsBackupStorage.js の控え、コール：releasedCalls の previous）。
//      曲ごとの「元に戻す」に使う記録（どの控えに戻すか。歌詞本文は含まない）は localStorage に置く。
//   6. プレイヤーの記録（プロフィール・履歴・称号）には一切触れない。音源は、パックに「違う音源」があるときだけ入れ替える。
//
// DOM には触れない。端末への読み書きは io（下の createDeviceIo、テストでは偽物）を通す。
import { SONGS } from "./data/songs.js";
import { parseAndNormalizeLyricsFile, validateLyricsData, computeLyricsContentHash, getAllLyricsData, getLyricsData, saveLyricsData, deleteLyricsData } from "./lyricsStorage.js";
import { DATA_PACK_MANIFEST_TYPE, validateManifest, planLyricsImportActions, classifyByHash } from "./dataPackImport.js";
import { LYRICS_SUPERSEDED_CONTENT_HASHES } from "./data/lyricsSupersededVersions.js";
import { computeSha256Hex } from "./contentHash.js";
import { computeLyricsLineFingerprint } from "./callReleaseImport.js";
import { classifyCallReleaseJson, planCallReleaseImport, applyPlanItem, undoReleasedSong, RELEASE_ACTION } from "./callReleasePack.js";
import { importAudioFiles, getImportedSongIds, getAudioContentHashes } from "./audioStorage.js";
import { getAllReleasedCallRecords, getReleasedCallRecord, saveReleasedCallRecord } from "./callStorage.js";
import { backupCurrentLyrics, restoreLyricsBackupById, prepareRestoreRecord } from "./lyricsBackupStorage.js";

// マニフェストの中の「最新版データ」用の項目（manifest.unified）の版
export const UNIFIED_PACK_FORMAT_VERSION = 1;
// 「どのパックで入れた歌詞か」の記録（曲ID → { packId, createdAt, contentHash }。歌詞本文は含まない）
export const LYRICS_PROVENANCE_STORAGE_KEY = "equalLoveIntroQuiz.lyricsPackProvenance";
// 曲ごとの「元に戻す」の記録（曲ID → { packId, at, lyrics, calls, audio }。歌詞本文は含まない）
export const UNIFIED_UNDO_STORAGE_KEY = "equalLoveIntroQuiz.unifiedPackUndo";

// 曲ごとの判断（画面の集計にも使う）
export const PART_ACTION = {
  NEW: "new", // この端末に無かった
  UPDATE: "update", // 新しい版に入れ替える
  SAME: "same", // 中身が同じ（書かない）
  OLDER: "older", // この端末の方が新しい（書かない）
  HELD: "held", // 組み合わせの都合で今回は入れない（理由つき）
  INVALID: "invalid", // パックのデータが使えない（その曲のその種類だけ）
  WITHDRAW: "withdraw", // 新しい完成版で採用から外れた（コール表なしにする。前の版は残す）
};

const titleOf = (songId) => SONGS.find((song) => song.id === songId)?.title ?? songId;
const timeOf = (iso) => {
  const value = Date.parse(iso ?? "");
  return Number.isFinite(value) ? value : null;
};
const sameFingerprint = (a, b) => Boolean(a && b && a.lineCount === b.lineCount && a.hash === b.hash);

// 容量不足（端末の空きが足りない）のエラーか
export function isQuotaError(error) {
  if (!error) return false;
  const name = error.name ?? error.error?.name ?? "";
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED" || error.code === 22 || /quota/i.test(String(error.message ?? ""));
}
export function describeSaveError(error) {
  return isQuotaError(error) ? "端末の空き容量が足りません（いらない音源・写真などを消してから、もう一度読み込んでください）" : "保存できませんでした（もう一度読み込むと、済んだ曲は飛ばして続きから入ります）";
}

// ===== 1. パックの中身を読む（端末には書かない） =====

// 選んだファイル（ZIP を展開した後の File[]）を種類ごとに分ける。
// 戻り値：{ manifest, manifestErrors, lyrics: [...], audio: [...], artifact, display, ignored: [{ fileName, reason }], fatalErrors }
export async function readUnifiedPackFiles(files) {
  const manifests = [];
  const artifacts = [];
  const displays = [];
  const lyricsFiles = [];
  const audio = [];
  const ignored = [];
  for (const file of files) {
    if (/\.mp3$/i.test(file.name)) {
      audio.push({ fileName: file.name, songId: file.name.replace(/\.mp3$/i, ""), file });
      continue;
    }
    if (!/\.json$/i.test(file.name)) {
      ignored.push({ fileName: file.name, reason: "使わない種類のファイル" });
      continue;
    }
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      ignored.push({ fileName: file.name, reason: "JSON として読めません" });
      continue;
    }
    if (data && data.type === DATA_PACK_MANIFEST_TYPE) manifests.push(data);
    else if (classifyCallReleaseJson(data) === "artifact") artifacts.push(data);
    else if (classifyCallReleaseJson(data) === "display") displays.push(data);
    else if (data && (typeof data.songId === "string" || typeof data.song_id === "string")) lyricsFiles.push(file);
    else if (data && (data.type === "equal-love-call-data" || data.type === "equal-love-call-guide-data")) ignored.push({ fileName: file.name, reason: "以前の形式のコール・コールガイド（「追加データパック」で読み込めます）" });
    else ignored.push({ fileName: file.name, reason: "知らない形式の JSON" });
  }
  const fatalErrors = [];
  if (manifests.length > 1) fatalErrors.push("マニフェストが複数入っています");
  if (artifacts.length > 1) fatalErrors.push("完成版コールデータ（コール表）が複数入っています");
  if (displays.length > 1) fatalErrors.push("表示用の歌詞のファイルが複数入っています");
  const manifest = manifests[0] ?? null;
  const manifestErrors = manifest ? validateManifest(manifest).errors : [];
  if (manifest?.unified !== undefined && manifest.unified?.formatVersion > UNIFIED_PACK_FORMAT_VERSION) manifestErrors.push("新しい形式の最新版データです。アプリを更新してください");

  // 歌詞：今までと同じ正規化・点検・内容ハッシュ（同じ曲のファイルが2つあれば、どちらも使わない）
  const lyrics = [];
  for (const file of lyricsFiles) {
    const { normalized, reason } = await parseAndNormalizeLyricsFile(file);
    if (!normalized) {
      ignored.push({ fileName: file.name, reason: reason ?? "歌詞として読めません" });
      continue;
    }
    const { valid, errors, warnings } = validateLyricsData(normalized);
    if (valid) normalized.contentHash = await computeLyricsContentHash(normalized);
    lyrics.push({ fileName: file.name, songId: normalized.songId, normalized: valid ? normalized : null, errors: valid ? [] : errors, warnings });
  }
  const counts = new Map();
  lyrics.forEach((entry) => entry.songId && counts.set(entry.songId, (counts.get(entry.songId) ?? 0) + 1));
  lyrics.forEach((entry) => {
    if (entry.songId && counts.get(entry.songId) > 1) {
      entry.errors = [...entry.errors, "同じ曲の歌詞が2つ以上入っています"];
      entry.normalized = null;
    }
  });
  for (const entry of audio) entry.contentHash = await computeSha256Hex(entry.file);
  return { manifest, manifestErrors, lyrics, audio, artifact: artifacts[0] ?? null, display: displays[0] ?? null, ignored, fatalErrors };
}

// ===== 2. 端末の今の様子（読むだけ） =====

function readJsonFromLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? JSON.parse(raw) : {};
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}
function writeJsonToLocalStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value)); // 失敗（容量・プライベートモード）は呼び出し側で扱う
}

// 戻り値：{ lyricsHashes, lyricsFingerprints, lyricsProvenance, audioSongIds, audioHashes, releasedCalls }
export async function loadUnifiedDeviceState({ needAudioHashes = false } = {}) {
  const [lyricsRecords, audioIds, releasedCalls] = await Promise.all([getAllLyricsData().catch(() => []), getImportedSongIds().catch(() => []), getAllReleasedCallRecords().catch(() => new Map())]);
  const lyricsHashes = new Map();
  const lyricsFingerprints = new Map();
  for (const record of lyricsRecords ?? []) {
    if (!record || typeof record.songId !== "string" || !Array.isArray(record.lines)) continue;
    // 古い端末では contentHash が無いレコードがある：その場で計算する（「無い」と見なして上書きしないように）
    lyricsHashes.set(record.songId, record.contentHash ?? (await computeLyricsContentHash(record)));
    lyricsFingerprints.set(record.songId, computeLyricsLineFingerprint(record.lines));
  }
  const audioHashes = needAudioHashes ? await getAudioContentHashes().catch(() => new Map()) : new Map();
  return { lyricsHashes, lyricsFingerprints, lyricsProvenance: readJsonFromLocalStorage(LYRICS_PROVENANCE_STORAGE_KEY), audioSongIds: new Set(audioIds ?? []), audioHashes, releasedCalls };
}

// ===== 3. 計画（純粋関数。何も書き換えない） =====

// パックの情報（マニフェストが無いパックでも動く）
export function describePackInfo(parsed) {
  const manifest = parsed.manifest;
  const unified = manifest?.unified ?? {};
  return {
    packId: manifest?.packId ?? (parsed.artifact ? `call-release-${parsed.artifact.exportedAt ?? ""}` : "no-manifest"),
    packLabel: manifest?.packLabel ?? "最新版データ",
    createdAt: unified.createdAt ?? manifest?.createdAt ?? parsed.artifact?.exportedAt ?? null,
    distribution: unified.distribution ?? null,
  };
}

// 古い版の歌詞の一覧：アプリの一覧に、マニフェストの一覧（manifest.unified.lyricsSuperseded）を足す
export function mergeSupersededHashes(appList, manifestList) {
  const merged = {};
  for (const source of [appList ?? {}, manifestList ?? {}]) {
    for (const [songId, hashes] of Object.entries(source)) {
      if (!Array.isArray(hashes)) continue;
      merged[songId] = [...new Set([...(merged[songId] ?? []), ...hashes.filter((hash) => typeof hash === "string")])];
    }
  }
  return merged;
}

// 歌詞の1曲分の判断
function decideLyrics(entry, device, { supersededHashes, packCreatedAt, manifestHashes }) {
  const songId = entry.songId;
  if (!entry.normalized) return { action: PART_ACTION.INVALID, reason: `歌詞のファイルが使えません（${(entry.errors ?? []).slice(0, 2).join(" / ")}）` };
  const expected = manifestHashes?.[songId]?.contentHash;
  if (typeof expected === "string" && expected !== entry.normalized.contentHash) return { action: PART_ACTION.INVALID, reason: "歌詞のファイルがマニフェストの記録と違います（壊れているか、書き換えられています）" };
  const existingHash = device.lyricsHashes.get(songId) ?? null;
  const [planned] = planLyricsImportActions([{ normalizedData: entry.normalized, existingContentHash: existingHash }], { supersededHashes });
  if (planned.action === "skip-identical") return { action: PART_ACTION.SAME };
  if (planned.action === "save-new") return { action: PART_ACTION.NEW };
  if (planned.action === "skip-older") return { action: PART_ACTION.OLDER, reason: "この端末の歌詞の方が新しい版です（古い版には戻しません）" };
  // 中身が違う：どのパックで入れた歌詞かの記録があり、そのパックの方が新しければ上書きしない
  const provenance = device.lyricsProvenance?.[songId];
  const provenanceTime = provenance && provenance.contentHash === existingHash ? timeOf(provenance.createdAt) : null;
  const packTime = timeOf(packCreatedAt);
  if (provenanceTime !== null && packTime !== null && provenanceTime > packTime) {
    return { action: PART_ACTION.OLDER, reason: `この端末の歌詞は、もっと新しいパック（${provenance.createdAt}）で入れたものです` };
  }
  return { action: PART_ACTION.UPDATE };
}

// コールが入らない理由（歌詞の様子から）
function heldCallReason(lyricsDecision, deviceHasLyrics) {
  if (lyricsDecision?.action === PART_ACTION.OLDER) return "この端末の歌詞の方が新しい版です。このコールは古い歌詞に合わせたものなので入れません（違う行に赤文字を出さないため）";
  if (lyricsDecision?.action === PART_ACTION.HELD) return "歌詞の更新を待っているため、コールも入れません";
  if (lyricsDecision?.action === PART_ACTION.INVALID) return "パックの歌詞が使えなかったため、コールも入れません";
  if (!deviceHasLyrics && !lyricsDecision) return "この端末にこの曲の歌詞がありません。歌詞を入れてから、もう一度読み込んでください";
  return "歌詞の版がコールデータと合いません。コールは入れません（違う行に赤文字を出さないため）";
}

// 読み込みの計画。
// parsed：readUnifiedPackFiles の戻り値／device：loadUnifiedDeviceState の戻り値
// 戻り値：{ ok, errors, warnings, pack, songs: [曲ごと], counts, ignored }
//   曲ごと：{ songId, title, audio, lyrics, calls, audioMissing }
//     audio  = { action, entry } | null
//     lyrics = { action, reason?, entry, nextFingerprint } | null
//     calls  = { action, reason?, planItem, needsNewLyrics, breaksIfLyricsOnly } | null
export function planUnifiedImport(parsed, device, { knownSongIds = new Set(SONGS.map((song) => song.id)), appSupersededHashes = LYRICS_SUPERSEDED_CONTENT_HASHES } = {}) {
  const errors = [...(parsed.fatalErrors ?? [])];
  if (parsed.manifestErrors?.length) errors.push(...parsed.manifestErrors.map((message) => `マニフェスト：${message}`));
  const hasContent = parsed.lyrics.length > 0 || parsed.audio.length > 0 || parsed.artifact;
  if (!hasContent) errors.push("このファイルには、歌詞・コール・音源のどれも入っていません");
  const pack = describePackInfo(parsed);
  if (errors.length) return { ok: false, errors, warnings: [], pack, songs: [], counts: countUnified([]), ignored: parsed.ignored ?? [] };

  const supersededHashes = mergeSupersededHashes(appSupersededHashes, parsed.manifest?.unified?.lyricsSuperseded);
  const manifestHashes = parsed.manifest?.unified?.lyrics ?? null;
  const songs = new Map();
  const songOf = (songId) => {
    if (!songs.has(songId)) {
      // callsWorkNow：今この端末でコール表が出ている（完成版コールの歌詞の指紋が、端末の歌詞と同じ）
      const currentFp = device.releasedCalls.get(songId)?.current?.entry?.lyricsFingerprint;
      songs.set(songId, { songId, title: titleOf(songId), audio: null, lyrics: null, calls: null, audioMissing: false, callsWorkNow: sameFingerprint(currentFp, device.lyricsFingerprints.get(songId)) });
    }
    return songs.get(songId);
  };

  // 音源：今までの決まりのまま（中身が同じなら飛ばす、違えば入れ替える）
  for (const entry of parsed.audio) {
    const song = songOf(entry.songId);
    if (!knownSongIds.has(entry.songId)) {
      song.audio = { action: PART_ACTION.INVALID, reason: "アプリに無い曲の音源です", entry };
      continue;
    }
    const existing = device.audioSongIds.has(entry.songId) ? device.audioHashes.get(entry.songId) ?? "（印なし）" : null;
    const byHash = classifyByHash(existing, entry.contentHash);
    song.audio = { action: byHash === "identical" ? PART_ACTION.SAME : byHash === "new" ? PART_ACTION.NEW : PART_ACTION.UPDATE, entry };
  }

  // 歌詞（1回目）
  for (const entry of parsed.lyrics) {
    const song = songOf(entry.songId);
    const decision = decideLyrics(entry, device, { supersededHashes, packCreatedAt: pack.createdAt, manifestHashes });
    song.lyrics = { ...decision, entry, nextFingerprint: entry.normalized ? computeLyricsLineFingerprint(entry.normalized.lines) : null };
  }

  // 読み込み後の歌詞の指紋（歌詞を入れる曲はパックの歌詞、それ以外は端末の歌詞）
  const projectedFingerprints = () => {
    const map = new Map(device.lyricsFingerprints);
    for (const song of songs.values()) {
      if (song.lyrics && (song.lyrics.action === PART_ACTION.NEW || song.lyrics.action === PART_ACTION.UPDATE)) map.set(song.songId, song.lyrics.nextFingerprint);
    }
    return map;
  };
  const planCalls = () =>
    parsed.artifact ? planCallReleaseImport({ artifact: parsed.artifact, display: parsed.display, existing: device.releasedCalls, knownSongIds, deviceLyricsFingerprints: projectedFingerprints() }) : null;

  let callPlan = planCalls();
  if (callPlan && !callPlan.ok) return { ok: false, errors: callPlan.errors, warnings: [], pack, songs: [], counts: countUnified([]), ignored: parsed.ignored };

  // 片方だけ更新して、もう片方を壊さない：今コール表が出ている曲の歌詞だけが変わり、合うコールが入らないなら、歌詞を待つ
  const callItemOf = (plan, songId) => plan?.items.find((item) => item.songId === songId) ?? null;
  let heldAny = false;
  for (const song of songs.values()) {
    if (song.lyrics?.action !== PART_ACTION.UPDATE) continue;
    if (!song.callsWorkNow) continue;
    const currentFp = device.releasedCalls.get(song.songId)?.current?.entry?.lyricsFingerprint;
    const item = callItemOf(callPlan, song.songId);
    const comingFp = item && (item.action === RELEASE_ACTION.ADD || item.action === RELEASE_ACTION.UPDATE) ? item.next.entry.lyricsFingerprint : item?.action === RELEASE_ACTION.WITHDRAW ? null : currentFp;
    if (comingFp && !sameFingerprint(comingFp, song.lyrics.nextFingerprint)) {
      song.lyrics = { ...song.lyrics, action: PART_ACTION.HELD, reason: "この曲のコール表は今の歌詞に合わせてあります。新しい歌詞に合うコールデータが届くまで、歌詞の更新を待ちます（コール表が消えないように）" };
      heldAny = true;
    }
  }
  if (heldAny) callPlan = planCalls(); // 待つ歌詞を外して、コールを判断し直す

  const warnings = [...(callPlan?.errors ?? [])];
  if (callPlan) {
    for (const item of callPlan.items) {
      const song = songOf(item.songId);
      const lyricsDecision = song.lyrics;
      if (item.action === RELEASE_ACTION.ADD || item.action === RELEASE_ACTION.UPDATE) {
        if (item.lyricsMismatch) {
          song.calls = { action: PART_ACTION.HELD, reason: heldCallReason(lyricsDecision, device.lyricsFingerprints.has(item.songId)), planItem: item };
        } else {
          const needsNewLyrics = Boolean(lyricsDecision && (lyricsDecision.action === PART_ACTION.NEW || lyricsDecision.action === PART_ACTION.UPDATE));
          song.calls = { action: item.action === RELEASE_ACTION.ADD ? PART_ACTION.NEW : PART_ACTION.UPDATE, planItem: item, needsNewLyrics };
        }
      } else if (item.action === RELEASE_ACTION.UNCHANGED) song.calls = { action: PART_ACTION.SAME, planItem: item };
      else if (item.action === RELEASE_ACTION.OLDER) song.calls = { action: PART_ACTION.OLDER, reason: item.reason, planItem: item };
      else if (item.action === RELEASE_ACTION.WITHDRAW) song.calls = { action: PART_ACTION.WITHDRAW, reason: item.reason, planItem: item };
      else song.calls = { action: PART_ACTION.INVALID, reason: item.reason, planItem: item };
    }
  }

  // 音源が無い曲（この端末にも、パックにも無い）。歌詞・コールは音源が無くても入る
  for (const song of songs.values()) {
    song.audioMissing = Boolean(song.audio === null && !device.audioSongIds.has(song.songId) && knownSongIds.has(song.songId) && (song.lyrics || song.calls));
  }
  const list = [...songs.values()].sort((a, b) => a.title.localeCompare(b.title, "ja"));
  return { ok: true, errors: [], warnings, pack, songs: list, counts: countUnified(list), ignored: parsed.ignored ?? [] };
}

const changes = (part) => part && (part.action === PART_ACTION.NEW || part.action === PART_ACTION.UPDATE || part.action === PART_ACTION.WITHDRAW);

// 確認画面・結果の集計（曲の数）。1曲が「歌詞更新」と「コール更新」の両方に入ることがある
export function countUnified(songs) {
  const counts = { newSongs: 0, lyricsUpdates: 0, callUpdates: 0, audioUpdates: 0, unchanged: 0, audioMissing: 0, incompatible: 0, held: 0, older: 0, total: songs.length };
  for (const song of songs) {
    const parts = [song.audio, song.lyrics, song.calls].filter(Boolean);
    if (parts.some((part) => part.action === PART_ACTION.NEW)) counts.newSongs += 1;
    if (song.lyrics?.action === PART_ACTION.UPDATE) counts.lyricsUpdates += 1;
    if (song.calls?.action === PART_ACTION.UPDATE || song.calls?.action === PART_ACTION.WITHDRAW) counts.callUpdates += 1;
    if (song.audio?.action === PART_ACTION.UPDATE) counts.audioUpdates += 1;
    if (parts.length && parts.every((part) => part.action === PART_ACTION.SAME)) counts.unchanged += 1;
    if (song.audioMissing) counts.audioMissing += 1;
    if (parts.some((part) => part.action === PART_ACTION.INVALID)) counts.incompatible += 1;
    if (parts.some((part) => part.action === PART_ACTION.HELD)) counts.held += 1;
    if (parts.some((part) => part.action === PART_ACTION.OLDER)) counts.older += 1;
  }
  return counts;
}

// 曲名の並び（長いときは途中まで。数は必ず全部を出す）
const NAME_LIMIT = 20;
export function shortList(names, limit = NAME_LIMIT) {
  return names.length > limit ? `${names.slice(0, limit).join("、")} …ほか${names.length - limit}曲` : names.join("、");
}

// 確認画面の文章（曲名つき。保留・使えないデータ・古いものは全部の曲名を出す）
export function describeUnifiedPlan(plan) {
  if (!plan.ok) return plan.errors;
  const c = plan.counts;
  const names = (predicate) => plan.songs.filter(predicate).map((song) => song.title);
  const lines = [`「${plan.pack.packLabel}」の中身を確かめました（まだ何も変えていません）。`];
  lines.push(`新規追加 ${c.newSongs}曲／歌詞更新 ${c.lyricsUpdates}曲／コール更新 ${c.callUpdates}曲／変更なし ${c.unchanged}曲`);
  const add = (label, list) => list.length && lines.push(`${label}（${list.length}曲）：${shortList(list)}`);
  add("新しく入る曲", names((song) => [song.audio, song.lyrics, song.calls].some((part) => part?.action === PART_ACTION.NEW)));
  add("歌詞が新しくなる曲", names((song) => song.lyrics?.action === PART_ACTION.UPDATE));
  add("コールが新しくなる曲", names((song) => song.calls?.action === PART_ACTION.UPDATE));
  add("コール表なしになる曲（新しい完成版で採用されていない）", names((song) => song.calls?.action === PART_ACTION.WITHDRAW));
  add("音源が入れ替わる曲", names((song) => song.audio?.action === PART_ACTION.UPDATE));
  if (c.audioMissing) lines.push(`音源が無い曲：${c.audioMissing}曲（音源は別のパックで。歌詞・コールはこのまま入ります）：${shortList(names((song) => song.audioMissing))}`);
  const older = names((song) => [song.lyrics, song.calls].some((part) => part?.action === PART_ACTION.OLDER));
  if (older.length) lines.push(`この端末の方が新しいので入れない（${older.length}曲）：${older.join("、")}`);
  const held = plan.songs.flatMap((song) => [song.lyrics, song.calls].filter((part) => part?.action === PART_ACTION.HELD).map((part) => `${song.title}：${part.reason}`));
  if (held.length) lines.push(`今回は入れないもの（${held.length}件）：${held.join(" ／ ")}`);
  const invalid = plan.songs.flatMap((song) => [song.audio, song.lyrics, song.calls].filter((part) => part?.action === PART_ACTION.INVALID).map((part) => `${song.title}：${part.reason}`));
  if (invalid.length) lines.push(`使えないデータ（${invalid.length}件）：${invalid.join(" ／ ")}`);
  plan.warnings.forEach((message) => lines.push(message));
  if (plan.ignored.length) lines.push(`使わないファイル：${plan.ignored.map((item) => `${item.fileName}（${item.reason}）`).join("、")}`);
  if (c.newSongs + c.lyricsUpdates + c.callUpdates + c.audioUpdates === 0) lines.push("この端末に入れるものはありません（すでに最新です）。");
  return lines;
}

// ===== 4. 書き込み（本人が確認したあと） =====

// 端末への読み書き（本物）。テストでは同じ形の偽物を渡す
export function createDeviceIo() {
  return {
    getLyrics: (songId) => getLyricsData(songId),
    backupLyrics: (songId, reason) => backupCurrentLyrics(songId, reason),
    saveLyrics: (record) => saveLyricsData(record),
    deleteLyrics: (songId) => deleteLyricsData(songId),
    restoreLyricsBackup: (songId, backupId) => restoreLyricsBackupById(songId, backupId),
    saveAudio: async (file) => {
      const result = await importAudioFiles([file]);
      if (!result.savedSongIds.length) throw new Error("音源を保存できませんでした");
    },
    getReleasedCall: (songId) => getReleasedCallRecord(songId),
    saveReleasedCall: (record) => saveReleasedCallRecord(record),
    readProvenance: () => readJsonFromLocalStorage(LYRICS_PROVENANCE_STORAGE_KEY),
    writeProvenance: (value) => writeJsonToLocalStorage(LYRICS_PROVENANCE_STORAGE_KEY, value),
    readUndo: () => readJsonFromLocalStorage(UNIFIED_UNDO_STORAGE_KEY),
    writeUndo: (value) => writeJsonToLocalStorage(UNIFIED_UNDO_STORAGE_KEY, value),
    now: () => new Date().toISOString(),
  };
}

// 保存したレコードから、保存し直せる形へ（控えの戻し方と同じ）
const restorableRecord = (record) => prepareRestoreRecord({ record });
const BACKUP_FAILED = "元の歌詞を控えられなかったため、上書きしませんでした";

// 計画を当てはめる。曲ごとに 音源 → 歌詞 → コール。
// 戻り値：{ newSongs, lyricsUpdated, callsUpdated, audioUpdated, unchanged, errors: [{ songId, title, part, message }], restoredLyrics }
export async function applyUnifiedPlan(plan, io) {
  const result = { newSongs: [], lyricsUpdated: [], callsUpdated: [], audioUpdated: [], unchanged: [], errors: [], restoredLyrics: [] };
  if (!plan?.ok) return result;
  let provenance = io.readProvenance();
  let undo = io.readUndo();
  let provenanceDirty = false;
  const fail = (song, part, error) => result.errors.push({ songId: song.songId, title: song.title, part, message: typeof error === "string" ? error : describeSaveError(error), quota: isQuotaError(error) });

  for (const song of plan.songs) {
    const done = { audio: null, lyrics: null, calls: false };
    let isNew = false;
    // 音源（パックに違う音源があるときだけ）
    if (song.audio && (song.audio.action === PART_ACTION.NEW || song.audio.action === PART_ACTION.UPDATE)) {
      try {
        await io.saveAudio(song.audio.entry.file);
        done.audio = song.audio.action;
        if (song.audio.action === PART_ACTION.NEW) isNew = true;
        else result.audioUpdated.push(song.songId);
      } catch (error) {
        fail(song, "音源", error); // 歌詞・コールは音源が無くても入れられるので、続ける
      }
    }
    // 歌詞
    let lyricsOk = true;
    let previousLyrics = null;
    if (song.lyrics && (song.lyrics.action === PART_ACTION.NEW || song.lyrics.action === PART_ACTION.UPDATE)) {
      try {
        let backupId = null;
        if (song.lyrics.action === PART_ACTION.UPDATE) {
          previousLyrics = await io.getLyrics(song.songId);
          const backup = await io.backupLyrics(song.songId, `unified-pack:${plan.pack.packId}`);
          backupId = backup?.id ?? null;
          if (!backup?.backedUp) throw new Error(BACKUP_FAILED);
        }
        const saved = await io.saveLyrics(song.lyrics.entry.normalized);
        if (!saved?.saved) throw new Error((saved?.errors ?? []).join(" / ") || "歌詞を保存できませんでした");
        done.lyrics = { action: song.lyrics.action, backupId };
        if (song.lyrics.action === PART_ACTION.NEW) isNew = true;
        provenance = { ...provenance, [song.songId]: { packId: plan.pack.packId, createdAt: plan.pack.createdAt, contentHash: song.lyrics.entry.normalized.contentHash } };
        provenanceDirty = true;
      } catch (error) {
        lyricsOk = false;
        fail(song, "歌詞", error?.message === BACKUP_FAILED ? BACKUP_FAILED : error);
      }
    } else if (song.lyrics?.action === PART_ACTION.SAME && plan.pack.createdAt && !provenance[song.songId]) {
      // 中身が同じ歌詞も「どのパックの版か」を覚える（後から古いパックを読んでも戻らないように）
      provenance = { ...provenance, [song.songId]: { packId: plan.pack.packId, createdAt: plan.pack.createdAt, contentHash: song.lyrics.entry.normalized.contentHash } };
      provenanceDirty = true;
    }
    // コール
    if (song.calls && (song.calls.action === PART_ACTION.NEW || song.calls.action === PART_ACTION.UPDATE || song.calls.action === PART_ACTION.WITHDRAW)) {
      if (song.calls.needsNewLyrics && !lyricsOk) {
        fail(song, "コール", "歌詞を入れられなかったので、その歌詞用のコールも入れませんでした");
      } else {
        try {
          const record = await io.getReleasedCall(song.songId);
          const next = applyPlanItem(song.calls.planItem, record, io.now());
          if (next) await io.saveReleasedCall(next);
          done.calls = true;
          if (song.calls.action === PART_ACTION.NEW) isNew = true;
        } catch (error) {
          fail(song, "コール", error);
          // 歌詞だけ新しくなってコール表が合わなくなるのを防ぐ：この曲の歌詞を元に戻す
          if (done.lyrics?.action === PART_ACTION.UPDATE && song.calls.needsNewLyrics && song.callsWorkNow) {
            try {
              const back = await io.saveLyrics(restorableRecord(previousLyrics));
              if (!back?.saved) throw new Error("歌詞を保存できませんでした");
              result.restoredLyrics.push(song.songId);
              const { [song.songId]: _removed, ...rest } = provenance; // eslint-disable-line no-unused-vars
              provenance = rest;
              done.lyrics = null;
            } catch (restoreError) {
              fail(song, "歌詞", `コールを入れられなかったので歌詞を元に戻そうとしましたが、戻せませんでした（${describeSaveError(restoreError)}）`);
            }
          }
        }
      }
    }
    // 結果と「元に戻す」の記録
    const changed = Boolean(done.audio || done.lyrics || done.calls);
    if (isNew) result.newSongs.push(song.songId);
    if (done.lyrics?.action === PART_ACTION.UPDATE) result.lyricsUpdated.push(song.songId);
    if (done.calls && song.calls.action !== PART_ACTION.NEW) result.callsUpdated.push(song.songId);
    if (!changed && [song.audio, song.lyrics, song.calls].filter(Boolean).every((part) => part.action === PART_ACTION.SAME)) result.unchanged.push(song.songId);
    if (provenanceDirty) {
      try {
        io.writeProvenance(provenance);
      } catch {
        // 記録を残せない端末では、次からは古い版の一覧とハッシュだけで判断する
      }
      provenanceDirty = false;
    }
    if (done.lyrics || done.calls) {
      undo = { ...undo, [song.songId]: { packId: plan.pack.packId, at: io.now(), lyrics: done.lyrics ? { action: done.lyrics.action, backupId: done.lyrics.backupId } : null, calls: done.calls, audio: done.audio } };
      try {
        io.writeUndo(undo);
      } catch {
        // 記録を残せなくても、読み込み自体は済んでいる（歌詞の控え・コールの1つ前の版は残っている）
      }
    }
  }
  return result;
}

// 結果の文章
export function describeUnifiedResult(result) {
  const name = (ids) => shortList(ids.map(titleOf));
  const lines = [`新規追加 ${result.newSongs.length}曲／歌詞更新 ${result.lyricsUpdated.length}曲／コール更新 ${result.callsUpdated.length}曲／変更なし ${result.unchanged.length}曲／エラー ${result.errors.length}件`];
  if (result.newSongs.length) lines.push(`新しく入った曲：${name(result.newSongs)}`);
  if (result.lyricsUpdated.length) lines.push(`歌詞を新しくした曲：${name(result.lyricsUpdated)}（前の歌詞は端末に控えてあります）`);
  if (result.callsUpdated.length) lines.push(`コールを新しくした曲：${name(result.callsUpdated)}（前の版は残してあります）`);
  if (result.audioUpdated.length) lines.push(`音源を入れ替えた曲：${name(result.audioUpdated)}`);
  if (result.restoredLyrics.length) lines.push(`コールを入れられなかったので歌詞を元に戻した曲：${name(result.restoredLyrics)}`);
  result.errors.forEach((error) => lines.push(`エラー：${error.title}（${error.part}）：${error.message}`));
  if (result.errors.length) lines.push("もう一度同じファイルを読み込むと、済んだ曲は飛ばして、残りだけを入れます。");
  lines.push("音源とプレイヤーの記録（プロフィール・履歴・称号）は変えていません（音源はパックに違う音源が入っていた曲だけ）。");
  return lines;
}

// ===== 5. 曲ごとの「元に戻す」 =====

// 元に戻せる曲（新しい順）
export function listUndoableSongs(undo) {
  return Object.entries(undo ?? {})
    .filter(([, entry]) => entry && (entry.lyrics || entry.calls))
    .map(([songId, entry]) => ({ songId, title: titleOf(songId), ...entry }))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// 1曲を、この読み込みの前に戻す（歌詞 → コールの順）。戻り値：{ ok, message }
export async function undoUnifiedSong(songId, io) {
  const undo = io.readUndo();
  const entry = undo[songId];
  if (!entry) return { ok: false, message: "元に戻す記録がありません" };
  let remaining = { ...entry };
  const save = () => {
    try {
      const next = { ...io.readUndo() };
      if (remaining.lyrics || remaining.calls) next[songId] = remaining;
      else delete next[songId];
      io.writeUndo(next);
    } catch {
      // 記録を書けなくても、戻した結果は端末に残っている
    }
  };
  try {
    if (entry.lyrics) {
      if (entry.lyrics.action === PART_ACTION.UPDATE) {
        const restored = await io.restoreLyricsBackup(songId, entry.lyrics.backupId);
        if (!restored?.restored) return { ok: false, message: `歌詞を戻せませんでした（${restored?.reason ?? "控えが見つかりません"}）` };
      } else {
        await io.backupLyrics(songId, "unified-undo-new"); // 消す前にも控える（もう一度入れ直せるように）
        await io.deleteLyrics(songId);
      }
      remaining = { ...remaining, lyrics: null };
      try {
        const provenance = io.readProvenance();
        delete provenance[songId];
        io.writeProvenance(provenance);
      } catch {
        // 記録が残っていても、内容ハッシュが違えば使われない
      }
    }
    if (entry.calls) {
      const record = await io.getReleasedCall(songId);
      const now = io.now();
      const next = record?.previous ? undoReleasedSong(record, now) : record?.current ? { songId, current: null, previous: record.current, updatedAt: now, withdrawnAt: null, undoneAt: now } : null;
      if (next) await io.saveReleasedCall(next);
      remaining = { ...remaining, calls: false };
    }
    save();
    const parts = [entry.lyrics ? "歌詞" : null, entry.calls ? "コール" : null].filter(Boolean).join("・");
    return { ok: true, message: `「${titleOf(songId)}」の${parts}を、この読み込みの前に戻しました。音源は変えていません。` };
  } catch (error) {
    save();
    return { ok: false, message: `「${titleOf(songId)}」を戻せませんでした（${describeSaveError(error)}）。もう一度押してください。` };
  }
}
