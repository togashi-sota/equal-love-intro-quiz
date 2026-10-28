// 歌詞データを「修正版」で上書きする前に、元の歌詞データを端末の中に控えておくファイル（2026-10-29新設）。
//
// 【何のためか】歌詞の修正パック（例：1曲だけ歌詞の行が足りなかった曲の修正版）を読み込むと、
// js/dataPackImport.js が、その曲の歌詞データ（js/lyricsStorage.js の IndexedDB）を上書きする。
// 修正版に問題があったとき「前の歌詞に戻す」ことができるよう、上書きの直前の歌詞データを、
// ここ（歌詞データとは別のデータベース）に1曲ずつ控える。
//
// 【既存データを守る設計】
//   ・歌詞データのデータベース（equalLoveIntroQuizLyrics）の版（DB_VERSION）は変えない。
//     控えは別のデータベース（equalLoveIntroQuizLyricsBackup）に置く（既存の歌詞データの構造に一切触れない）。
//   ・控えは曲ごとに新しい順で最大 MAX_BACKUPS_PER_SONG 件。古いものから消す（控えだけ。歌詞データは消さない）。
//   ・控えは端末の中だけ。Firebase・サーバーには送らない（歌詞本文を含むため）。
//
// 純粋関数（pruneBackupKeys・pickLatestBackup・prepareRestoreRecord）はテストしやすいように export する。

import { getLyricsData, saveLyricsData } from "./lyricsStorage.js";

const DB_NAME = "equalLoveIntroQuizLyricsBackup";
const DB_VERSION = 1;
const STORE_NAME = "lyricsBackups";
export const MAX_BACKUPS_PER_SONG = 3;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // id＝「曲ID@控えた時刻」。1曲に複数の控えを持てる
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("songId", "songId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 控えの一覧（新しい順）から、消すべき控えのidを返す（MAX件を超えた古いもの）。純粋関数。
export function pruneBackupKeys(backups, max = MAX_BACKUPS_PER_SONG) {
  const sorted = [...(backups ?? [])].sort((a, b) => b.backedUpAt - a.backedUpAt);
  return sorted.slice(max).map((b) => b.id);
}

// 一番新しい控えを返す（無ければnull）。純粋関数。
export function pickLatestBackup(backups) {
  const sorted = [...(backups ?? [])].sort((a, b) => b.backedUpAt - a.backedUpAt);
  return sorted[0] ?? null;
}

// 控えから、歌詞データとして保存し直す形を作る（控え用の項目を外す。contentHash は保存時に計算し直す）。純粋関数。
export function prepareRestoreRecord(backup) {
  if (!backup?.record || typeof backup.record.songId !== "string") return null;
  const { updatedAt, contentHash, ...rest } = backup.record; // eslint-disable-line no-unused-vars
  return { ...rest, lines: (rest.lines ?? []).map((l) => ({ line: l.line, text: l.text, start: l.start, end: l.end })) };
}

// 曲の控えの一覧（新しい順）
export async function listLyricsBackups(songId) {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE_NAME, "readonly");
    const all = await requestToPromise(tx.objectStore(STORE_NAME).index("songId").getAll(songId));
    return all.sort((a, b) => b.backedUpAt - a.backedUpAt);
  } finally {
    db.close();
  }
}

// 今の歌詞データを控える。歌詞データが無い曲は何もしない（{ backedUp: false }）。
// reason：控えた理由（例 "data-pack:<packId>"）。表示・調査用で、歌詞本文は含めない
export async function backupCurrentLyrics(songId, reason = "") {
  const record = await getLyricsData(songId);
  if (!record) return { backedUp: false, id: null };
  const backedUpAt = Date.now();
  const backup = { id: `${songId}@${backedUpAt}`, songId, backedUpAt, reason: String(reason).slice(0, 200), contentHash: record.contentHash ?? null, record };
  const db = await openDatabase();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.put(backup);
      const indexRequest = store.index("songId").getAll(songId);
      indexRequest.onsuccess = () => {
        for (const id of pruneBackupKeys(indexRequest.result)) store.delete(id);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
  return { backedUp: true, id: backup.id };
}

// 一番新しい控えに戻す（「前の歌詞に戻す」）。戻した控え自体は残す（何度でも戻せる）。
// 戻す直前の歌詞データも控える（戻したことを、さらに取り消せるように）。
// 戻り値：{ restored: boolean, reason?: string, errors?: string[] }
export async function restoreLatestLyricsBackup(songId) {
  const latest = pickLatestBackup(await listLyricsBackups(songId));
  const record = prepareRestoreRecord(latest);
  if (!record) return { restored: false, reason: "控えがありません" };
  await backupCurrentLyrics(songId, "before-restore");
  const result = await saveLyricsData(record);
  return result.saved ? { restored: true, backupId: latest.id } : { restored: false, reason: "保存できませんでした", errors: result.errors };
}
