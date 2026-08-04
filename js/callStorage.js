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

const DB_NAME = "equalLoveIntroQuizCalls";
const DB_VERSION = 1;
const STORE_NAME = "callData";

const LATEST_SCHEMA_VERSION = 1;

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

// 検証済みの内部形式データを保存する。saveLyricsData()と同じく、呼び出し元の検証有無に関わらず
// この関数自身が必ずvalidateCallData()を通してから保存する。
export async function saveCallData(record) {
  const { valid, errors, warnings } = validateCallData(record);
  if (!valid) {
    return { saved: false, errors, warnings };
  }

  const db = await openDatabase();
  await putRecord(db, { ...record, schemaVersion: LATEST_SCHEMA_VERSION, updatedAt: Date.now() });
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
