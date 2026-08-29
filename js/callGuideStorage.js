// ライブコールモードの「コールガイド」で使う、MIX・口上の練習本文（textLines等）を
// IndexedDBに保存・読み込みするファイル。js/callStorage.jsと全く同じ設計パターン
// （1件＝1レコード、keyPathはguideId）を踏襲しつつ、既存のコール（音源タイミング付き）用
// IndexedDBとは完全に別のデータベースとして分離している。
// これにより、コールガイド本文の読み込みが既存の音源・歌詞・コールタイミングに
// 一切影響しない（2026-08-06新設）。
//
// コールガイドの本文（MIX・口上の実際の文言）は著作権保護のため、このファイル自体には
// 一切含まれていない。本人が dev/callGuideEditor.html から直接入力する運用
// （js/callStorage.jsのコール本文と同じ方針）。
//
// このファイルの役割は「データの読み書き」だけで、UI（画面表示・ボタン操作）は持たない。

import { MIX_AND_KOUJOU_GUIDE } from "./data/mixAndKoujouGuide.js";
import { computeSha256Hex } from "./contentHash.js";

const DB_NAME = "equalLoveIntroQuizCallGuide";
const DB_VERSION = 1;
const STORE_NAME = "callGuideData";

const LATEST_SCHEMA_VERSION = 1;

// 全ガイドまとめて書き出す／読み込むバックアップファイルの目印。
// 既存のコールデータ・歌詞データ・音源データとは異なるtypeにすることで、
// 誤って別種類のファイルを選んでも読み込み時にはっきり拒否できるようにする。
const BACKUP_FILE_TYPE = "equal-love-call-guide-data";

const VALID_CATEGORIES = ["mix", "koujou", "song-specific-koujou", "special"];

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "guideId" });
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
export function validateCallGuideData(record) {
  const errors = [];
  const warnings = [];

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["データの形式が正しくありません"], warnings };
  }

  if (typeof record.guideId !== "string" || record.guideId.trim() === "") {
    errors.push("guideIdが指定されていません");
  }
  if (typeof record.name !== "string" || record.name.trim() === "") {
    errors.push("名称が指定されていません");
  }
  if (!VALID_CATEGORIES.includes(record.category)) {
    warnings.push(`分類「${record.category}」が想定外の値です`);
  }
  if (record.songIds !== undefined && record.songIds !== null && !Array.isArray(record.songIds)) {
    errors.push("songIdsが配列ではありません");
  }
  if (!Array.isArray(record.textLines)) {
    errors.push("textLinesが配列ではありません");
  }
  if (!Array.isArray(record.pronunciationLines)) {
    errors.push("pronunciationLinesが配列ではありません");
  }
  if (!MIX_AND_KOUJOU_GUIDE.some((entry) => entry.id === record.guideId)) {
    warnings.push(`guideId「${record.guideId}」はコールガイド一覧（mixAndKoujouGuide.js）に見つかりません`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// コールガイドの「中身」だけを対象にしたSHA-256ハッシュを計算する（2026-08-29追加、
// js/lyricsStorage.jsのcomputeLyricsContentHash()と同じ考え方）。exportAllCallGuideData()と
// 同じ項目・同じ並び順で正規化してから文字列化する（内容比較の対象を一致させるため）。
export async function computeCallGuideContentHash(record) {
  const canonical = {
    guideId: record.guideId,
    name: record.name,
    category: record.category,
    songIds: record.songIds ?? null,
    textLines: record.textLines,
    pronunciationLines: record.pronunciationLines,
    segmentNote: record.segmentNote ?? "",
    usagePosition: record.usagePosition ?? "",
    beginnerNote: record.beginnerNote ?? "",
  };
  return computeSha256Hex(JSON.stringify(canonical));
}

// 検証済みの内部形式データを保存する。
export async function saveCallGuideData(record) {
  const { valid, errors, warnings } = validateCallGuideData(record);
  if (!valid) {
    return { saved: false, errors, warnings };
  }

  const contentHash = record.contentHash ?? (await computeCallGuideContentHash(record));

  const db = await openDatabase();
  await putRecord(db, { ...record, schemaVersion: LATEST_SCHEMA_VERSION, updatedAt: Date.now(), contentHash });
  db.close();

  return { saved: true, errors: [], warnings };
}

// 指定したguideIdのコールガイドデータを取得する。未登録ならnullを返す。
export async function getCallGuideData(guideId) {
  const db = await openDatabase();
  const record = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(guideId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return record;
}

// 登録済みの全コールガイドデータを取得する（画面表示・一覧管理で使用）。
export async function getAllCallGuideData() {
  const db = await openDatabase();
  const records = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return records;
}

// 登録済みの全ガイドについて、guideId→contentHashの対応表を取得する（2026-08-29追加）。
// 追加データパックの読み込み時、「既にあるガイドと中身が同じか違うか」を判定するために使う。
export async function getCallGuideContentHashes() {
  const records = await getAllCallGuideData();
  return new Map(records.map((record) => [record.guideId, record.contentHash ?? null]));
}

// 指定したguideIdのコールガイドデータを削除する（dev/callGuideEditor.htmlの管理機能で使用）。
export async function deleteCallGuideData(guideId) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(guideId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// ===== 全件まとめての書き出し・別端末への読み込み =====

// この端末に保存されている全コールガイドを、他端末へ持ち運べる1つのオブジェクトにまとめる
// （実際にファイルとしてダウンロードする処理はdev/callGuideEditor.js側が行う）。
export async function exportAllCallGuideData() {
  const records = await getAllCallGuideData();
  const guides = records.map((record) => ({
    guideId: record.guideId,
    name: record.name,
    category: record.category,
    songIds: record.songIds ?? null,
    textLines: record.textLines,
    pronunciationLines: record.pronunciationLines,
    segmentNote: record.segmentNote ?? "",
    usagePosition: record.usagePosition ?? "",
    beginnerNote: record.beginnerNote ?? "",
  }));

  return {
    type: BACKUP_FILE_TYPE,
    schemaVersion: LATEST_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    guides,
  };
}

// 読み込んだJSON全体が「コールガイド専用バックアップファイル」として扱ってよい形かどうかを検証する。
// ガイドごとの中身はvalidateCallGuideData()に任せ、ここではファイル全体の骨組みだけを見る。
// DOM・IndexedDBに一切触れない純粋関数のため、tests/callGuideStorage.test.jsで直接テストできる。
export function validateCallGuideBackupFile(data) {
  if (!data || typeof data !== "object") {
    return { valid: false, reason: "JSONとして読み込めませんでした" };
  }
  if (data.type !== BACKUP_FILE_TYPE) {
    return { valid: false, reason: "このファイルはコールガイドデータではありません" };
  }
  if (typeof data.schemaVersion !== "number" || data.schemaVersion > LATEST_SCHEMA_VERSION) {
    return { valid: false, reason: "対応していないバージョンのコールガイドファイルです" };
  }
  if (!Array.isArray(data.guides)) {
    return { valid: false, reason: "guidesが配列ではありません" };
  }
  return { valid: true, reason: null };
}

// 選んだコールガイド専用JSONファイルを解析し、ガイドごとに読み込んでよいかどうかを判定する
// （まだ保存はしない）。ガイド単位の検証には、保存時と全く同じvalidateCallGuideData()を再利用する。
//
// 戻り値: {
//   fileValid: boolean, fileError: string|null,
//   readyGuides: { guideId, name, ..., isUpdate, contentHash, existingContentHash }[],
//   failedGuides: { guideId, errors }[],
// }
// contentHashはこのガイド自体の内容ハッシュ、existingContentHashはこの端末に既にある
// 同じguideIdのデータの内容ハッシュ（未登録ならnull、2026-08-29追加）。
export async function analyzeCallGuideBackupFile(file) {
  let rawData;
  try {
    rawData = JSON.parse(await file.text());
  } catch (error) {
    return { fileValid: false, fileError: "JSONとして読み込めませんでした", readyGuides: [], failedGuides: [] };
  }

  const fileCheck = validateCallGuideBackupFile(rawData);
  if (!fileCheck.valid) {
    return { fileValid: false, fileError: fileCheck.reason, readyGuides: [], failedGuides: [] };
  }

  const readyGuides = [];
  const failedGuides = [];
  const existingHashes = await getCallGuideContentHashes();

  for (const guideEntry of rawData.guides) {
    const { valid, errors } = validateCallGuideData(guideEntry);
    if (!valid) {
      failedGuides.push({ guideId: guideEntry?.guideId ?? "(不明)", errors });
      continue;
    }
    const contentHash = await computeCallGuideContentHash(guideEntry);
    const isUpdate = existingHashes.has(guideEntry.guideId);
    readyGuides.push({
      ...guideEntry,
      isUpdate,
      contentHash,
      existingContentHash: existingHashes.get(guideEntry.guideId) ?? null,
    });
  }

  return { fileValid: true, fileError: null, readyGuides, failedGuides };
}

// analyzeCallGuideBackupFile()が判定した「読み込んでよいガイド」だけを、実際に保存する。
// ガイド単位の上書き（put）のため、ファイルに含まれないguideIdの既存データには一切触れない。
//
// 戻り値: { savedGuideIds: string[], saveFailures: { guideId, reason }[] }
export async function importCallGuideDataEntries(readyGuides) {
  const savedGuideIds = [];
  const saveFailures = [];

  for (const guide of readyGuides) {
    // isUpdate・existingContentHashは解析結果を運ぶための一時的な情報であり、保存する
    // レコード自体には含めない（2026-08-29、contentHash追加に合わせて明示的に選別するよう整理）。
    const { isUpdate, existingContentHash, ...recordToSave } = guide;
    const result = await saveCallGuideData(recordToSave);
    if (result.saved) {
      savedGuideIds.push(guide.guideId);
    } else {
      saveFailures.push({ guideId: guide.guideId, reason: result.errors.join(" / ") });
    }
  }

  return { savedGuideIds, saveFailures };
}
