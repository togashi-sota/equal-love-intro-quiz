// ライブ・カラオケ向け「コール」データ（本文＋タイミング）を、IndexedDBに保存・読み込みするファイル。
// js/lyricsStorage.jsと全く同じ設計パターン（1曲＝1レコード、keyPathはsongId）を踏襲しつつ、
// 歌詞用のIndexedDBとは完全に別のデータベースとして分離している。
// これにより、コールまわりの不具合が既存の歌詞機能・音源機能（すでに実機確認済み）に
// 一切影響しない（2026-08-06新設、コールモード基盤）。
//
// コールの本文（Oh yeah!／はいはいはいはい！／MIX等の実際の文言）は著作権保護のため、
// このファイル自体には一切含まれていない。本人が dev/callEditor.html から直接入力する運用
// （歌詞本文の扱いと同じ方針）。
//
// このファイルの役割は「データの読み書き」だけで、UI（画面表示・ボタン操作）は持たない。

import { SONGS } from "./data/songs.js";
import { computeSha256Hex } from "./contentHash.js";

const DB_NAME = "equalLoveIntroQuizCalls";
const DB_VERSION = 1;
const STORE_NAME = "callData";

const LATEST_SCHEMA_VERSION = 1;

// 全曲まとめて書き出す／読み込むバックアップファイルの目印（2026-08-06新設）。
// PC（コールを作成した端末）とスマホ等の別端末との間で、コールデータだけを
// 安全に持ち運べるようにするための仕組み。音源・歌詞・他のIndexedDB・localStorageには
// 一切触れない（このファイルが最初から扱っているcallDataストアだけを対象にする）。
const BACKUP_FILE_TYPE = "equal-love-call-data";

// コールの種類。将来のMIX解説ページ・定番コール一覧などで、種類ごとに説明を出し分けるために使う。
export const CALL_TYPE = {
  MIX: "mix", // MIX（曲の間奏部分などに入れる、決まった構成の合いの手）
  MEMBER_CALL: "member-call", // メンバー名を呼ぶコール
  CALLBACK: "callback", // 歌詞の一部を受けて返す、短い合いの手
  UNIQUE: "unique", // その曲だけの固有コール
};

// 1件のコール表示にかける長さ（秒）。開始時刻だけを記録すればよいよう、
// 終了時刻はこの固定長を足して自動的に決める（歌詞のように「歌っている間ずっと」ではなく、
// 一瞬の掛け声のため、始点だけ分かれば十分という判断）。
// dev/callEditor.htmlで記録したあとも、他の歌詞タイミング編集と同じく秒数を手で微調整できる。
export const DEFAULT_CALL_DURATION_SEC = 1.5;

// 歌詞データ（js/lyricsStorage.js）と違い、コールは複数の種類が同時・連続して発生することが
// 普通にある（例：メンバーコールの直後にMIXが始まる、複数人が別々のタイミングでコールする等）ため、
// 「開始時刻が必ず時系列順」という厳格な検証は行わない（歌詞行の検証より緩い基準にしている）。
// 表示側（js/callSync.js）は、読み込んだ配列を毎回start順に並べ替えてから使うため、
// 保存時の並び順そのものは問われない。

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "songId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function putRecord(db, record) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// 内部形式のデータが、保存してよい内容かどうかを検証する。
// errors  : 1件でもあれば保存を拒否する
// warnings: 保存は可能だが、本人に確認してほしい内容
export function validateCallData(record) {
  const errors = [];
  const warnings = [];

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["データの形式が正しくありません"], warnings };
  }

  const songId = record.songId;
  if (typeof songId !== "string" || songId.trim() === "") {
    errors.push("songIdが指定されていません");
  } else if (!SONGS.some((song) => song.id === songId)) {
    errors.push(`songs.jsに登録されていない曲IDです（songId: ${songId}）`);
  }

  if (!Array.isArray(record.calls)) {
    errors.push("callsが配列ではありません");
  } else if (record.calls.length === 0) {
    errors.push("callsが空です");
  } else {
    record.calls.forEach((call, index) => {
      const n = index + 1;
      if (!call || typeof call !== "object") {
        errors.push(`${n}件目のデータ形式が正しくありません`);
        return;
      }
      if (typeof call.text !== "string" || call.text.trim() === "") {
        errors.push(`${n}件目のtextが空です`);
      }
      const startIsNumber = typeof call.start === "number" && Number.isFinite(call.start);
      const endIsNumber = typeof call.end === "number" && Number.isFinite(call.end);
      if (!startIsNumber || !endIsNumber) {
        errors.push(`${n}件目のstart/endが数値ではありません`);
        return;
      }
      if (call.start < 0 || call.end < 0) {
        errors.push(`${n}件目の時間が負の値です`);
      }
      if (call.end <= call.start) {
        errors.push(`${n}件目のendがstart以下です`);
      }
      if (!Object.values(CALL_TYPE).includes(call.type)) {
        warnings.push(`${n}件目のtype「${call.type}」が想定外の値です`);
      }
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// コールデータの「中身」（songId・calls配列そのもの）だけを対象にしたSHA-256ハッシュを計算する
// （2026-08-29追加、js/lyricsStorage.jsのcomputeLyricsContentHash()と同じ考え方）。
// 各コールを{text, start, end, type}の固定順で並べ直してから文字列化する。
export async function computeCallContentHash({ songId, calls }) {
  const canonical = {
    songId,
    calls: (calls ?? []).map((call) => ({ text: call.text, start: call.start, end: call.end, type: call.type })),
  };
  return computeSha256Hex(JSON.stringify(canonical));
}

// 検証済みの内部形式データを保存する。saveLyricsData()と同じく、呼び出し元の検証有無に関わらず
// この関数自身が必ずvalidateCallData()を通してから保存する。
export async function saveCallData(record) {
  const { valid, errors, warnings } = validateCallData(record);
  if (!valid) {
    return { saved: false, errors, warnings };
  }

  const contentHash = record.contentHash ?? (await computeCallContentHash(record));

  const db = await openDatabase();
  await putRecord(db, { ...record, schemaVersion: LATEST_SCHEMA_VERSION, updatedAt: Date.now(), contentHash });
  db.close();

  return { saved: true, errors: [], warnings };
}

// 指定したsongIdのコールデータを取得する。未登録ならnullを返す。
export async function getCallData(songId) {
  const db = await openDatabase();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(songId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

// 登録済みのコールデータを持つsongId一覧を取得する。
// 「コールがある曲だけコール関連ボタンを表示する」といった判定に使う想定。
export async function getSongIdsWithCallData() {
  const db = await openDatabase();
  const ids = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return ids;
}

// 登録済みの全曲について、songId→contentHashの対応表を取得する（2026-08-29追加）。
// 追加データパックの読み込み時、「既にあるコールと中身が同じか違うか」を判定するために使う。
export async function getCallContentHashes() {
  const db = await openDatabase();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return new Map(records.map((record) => [record.songId, record.contentHash ?? null]));
}

// 指定したsongIdのコールデータを削除する（dev/callEditor.htmlの管理機能で使用）。
export async function deleteCallData(songId) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(songId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ===== 全曲まとめての書き出し・別端末への読み込み（2026-08-06新設） =====
// 音源・歌詞と違い、コールはアプリ内に「その場で読み込む」画面が無く、
// dev/callEditor.htmlで作成した端末（主にPC）のIndexedDBにしか存在しない。
// スマホ等の別端末でライブコールモードを使えるようにするための橋渡し役。

// この端末に保存されている全曲分のコールデータを、他端末へ持ち運べる1つの
// オブジェクトにまとめる（実際にファイルとしてダウンロードする処理はdev/callEditor.js側が行う）。
export async function exportAllCallData() {
  const songIds = await getSongIdsWithCallData();
  const songs = [];
  for (const songId of songIds) {
    const record = await getCallData(songId);
    if (record) {
      songs.push({ songId: record.songId, calls: record.calls });
    }
  }

  return {
    type: BACKUP_FILE_TYPE,
    schemaVersion: LATEST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    songs,
  };
}

// 読み込んだJSON全体が「コール専用バックアップファイル」として扱ってよい形かどうかを検証する。
// 曲ごとの中身（calls配列の中身）はvalidateCallData()に任せ、ここではファイル全体の
// 骨組み（type・schemaVersion・songsの有無）だけを見る。
// DOM・IndexedDBに一切触れない純粋関数のため、tests/callStorage.test.jsで直接テストできる。
export function validateCallDataBackupFile(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "JSONとして読み込めませんでした" };
  }
  if (data.type !== BACKUP_FILE_TYPE) {
    return { valid: false, reason: "このファイルはコールデータではありません" };
  }
  if (typeof data.schemaVersion !== "number" || data.schemaVersion > LATEST_SCHEMA_VERSION) {
    return { valid: false, reason: "対応していないバージョンのコールデータファイルです" };
  }
  if (!Array.isArray(data.songs)) {
    return { valid: false, reason: "songsが配列ではありません" };
  }
  return { valid: true, reason: null };
}

// 選んだコール専用JSONファイルを解析し、曲ごとに読み込んでよいかどうかを判定する（まだ保存はしない）。
// 曲単位の検証には、保存時と全く同じvalidateCallData()をそのまま再利用する
// （songs.js未登録のsongId・text空・start/endが数値でない・start>=end等は、
// ここで新しく判定コードを書かなくても既存の検証にそのまま引っかかる）。
//
// 戻り値: {
//   fileValid: boolean, fileError: string|null,
//   readySongs: { songId, calls, isUpdate, contentHash, existingContentHash }[],
//   failedSongs: { songId, errors }[],
// }
// contentHashはこのコールデータ自体の内容ハッシュ、existingContentHashはこの端末に
// 既にある同じsongIdのデータの内容ハッシュ（未登録ならnull、2026-08-29追加）。
export async function analyzeCallDataBackupFile(file) {
  let rawData;
  try {
    rawData = JSON.parse(await file.text());
  } catch (error) {
    return { fileValid: false, fileError: "JSONとして読み込めませんでした", readySongs: [], failedSongs: [] };
  }

  const fileCheck = validateCallDataBackupFile(rawData);
  if (!fileCheck.valid) {
    return { fileValid: false, fileError: fileCheck.reason, readySongs: [], failedSongs: [] };
  }

  const readySongs = [];
  const failedSongs = [];
  const existingHashes = await getCallContentHashes();

  for (const songEntry of rawData.songs) {
    const record = {
      songId: songEntry && typeof songEntry.songId === "string" ? songEntry.songId : null,
      calls: songEntry ? songEntry.calls : null,
    };
    const { valid, errors } = validateCallData(record);
    if (!valid) {
      failedSongs.push({ songId: record.songId ?? "(不明)", errors });
      continue;
    }
    const contentHash = await computeCallContentHash(record);
    const isUpdate = existingHashes.has(record.songId);
    readySongs.push({
      songId: record.songId,
      calls: record.calls,
      isUpdate,
      contentHash,
      existingContentHash: existingHashes.get(record.songId) ?? null,
    });
  }

  return { fileValid: true, fileError: null, readySongs, failedSongs };
}

// analyzeCallDataBackupFile()が判定した「読み込んでよい曲」だけを、実際に保存する。
// 曲単位の上書き（put）のため、ファイルに含まれないsongIdの既存データには一切触れない。
//
// 戻り値: { savedSongIds: string[], saveFailures: { songId, reason }[] }
export async function importCallDataSongs(readySongs) {
  const savedSongIds = [];
  const saveFailures = [];

  for (const song of readySongs) {
    const result = await saveCallData({ songId: song.songId, calls: song.calls, contentHash: song.contentHash });
    if (result.saved) {
      savedSongIds.push(song.songId);
    } else {
      saveFailures.push({ songId: song.songId, reason: result.errors.join(" / ") });
    }
  }

  return { savedSongIds, saveFailures };
}
