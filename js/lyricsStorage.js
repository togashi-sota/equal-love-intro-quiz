// 歌詞データ（本文＋タイミング）をIndexedDB（ブラウザ内の保存領域）に保存・読み込みするファイル。
// 音源のaudioStorage.jsと同じ設計パターン（1曲＝1レコード、keyPathはsongId）を踏襲しつつ、
// 音源用のIndexedDBとは完全に別のデータベースとして分離している。
// これにより、歌詞まわりの不具合が既存の音源機能（すでに実機確認済み）に一切影響しない。
//
// このファイルの役割は「データの読み書き」だけで、UI（画面表示・ボタン操作）は持たない。
// 本編（収録曲一覧の同期歌詞表示）とdev/lyricsEditor.html（歌詞タイミングの編集ツール）の
// どちらからも、この同じ関数群を通してデータをやり取りする想定。

import { SONGS } from "./data/songs.js";
import { computeSha256Hex } from "./contentHash.js";

const DB_NAME = "equalLoveIntroQuizLyrics";
const DB_VERSION = 1;
const STORE_NAME = "lyricsData";

// アプリ内部で保存するデータ形式のバージョン。
// 将来、保存する項目を増やす・変更するなどの理由でデータ構造を変えたくなった場合、
// この値を上げ、getLyricsData()側で古いバージョンのデータを新形式へ変換する処理を追加する想定。
const LATEST_SCHEMA_VERSION = 1;

// 各行の時間について、「保存を拒否するほどではないが確認してほしい」内容を判定するための目安値。
// 音源の実際の長さと照合する仕組みはまだ無い（Step1の範囲外）ため、
// あくまで常識的な範囲から外れていないかどうかの目安として使う。今後調整があってもよい値。
const SHORT_LINE_WARNING_SEC = 0.2; // これより短い行は「極端に短い」として警告
const LONG_LINE_WARNING_SEC = 20; // これより長い行は「極端に長い」として警告
const LONG_GAP_WARNING_SEC = 30; // 前の行のendから次の行のstartまでの間隔がこれを超えたら警告
const MAX_REASONABLE_SONG_LENGTH_SEC = 600; // 10分。この値を超える時刻があれば「曲の想定時間を超えている可能性」として警告

// 歌詞JSONは本来数十KB程度のはずなので、誤って無関係の大きなファイルを選んでも
// 固まらないよう、1ファイルあたりの読み込み上限を設ける。
const MAX_LYRICS_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

// IndexedDBのデータベースを開く（なければ作る）。
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // songIdをキーにした保存領域。1曲＝1レコードにすることで、
        // ある曲の歌詞データを保存し直しても、他の曲のデータには一切触れない。
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

// 1ファイル分のJSONを読み込み、正規化するところまでを行う共通の窓口。
// ファイルサイズの上限チェック・JSON.parseの失敗・normalizeLyricsData()の失敗を
// すべてここでまとめて扱うことで、Step2のインポートUI（analyzeLyricsFiles経由）と
// dev/lyricsEditor.htmlの外部JSON読み込みの両方が、同じ安全対策（サイズ上限含む）を
// 確実に適用できるようにしている（片方だけ対策が漏れる、という事態を構造的に防ぐ）。
//
// 戻り値: { normalized: object|null, reason: string|null }
//   normalized: 正規化に成功した内部形式データ（失敗時はnull）
//   reason    : 失敗した理由（成功時はnull）
export async function parseAndNormalizeLyricsFile(file) {
  if (file.size > MAX_LYRICS_FILE_SIZE_BYTES) {
    return {
      normalized: null,
      reason: `ファイルサイズが大きすぎます（上限${MAX_LYRICS_FILE_SIZE_BYTES / (1024 * 1024)}MB）`,
    };
  }

  let rawData;
  try {
    rawData = JSON.parse(await file.text());
  } catch (error) {
    return { normalized: null, reason: "JSONとして読み込めませんでした" };
  }

  const normalized = normalizeLyricsData(rawData);
  if (!normalized) {
    return { normalized: null, reason: "songIdが見つからないなど、想定した形式ではありません" };
  }

  return { normalized, reason: null };
}

// 解析ツール（tools/lyrics-pipeline）が出力する外部形式のJSONを、
// アプリ内部で保存する形式（songId・lines・schemaVersion）へ変換する。
//
// 外部形式は今後ツール側の都合で変わる可能性がある（例：song_id → songId、
// word_countのような解析用の付随情報が増える等）。この関数が変換の窓口を一本化することで、
// 内部形式・保存処理・表示処理は外部形式の変化から切り離される。
//
// 変換できない場合（オブジェクトでない、songId/song_idのどちらも見つからない等）はnullを返す。
// 個々の値（text・start・end等）が正しいかどうかはここでは判定しない（validateLyricsData()の役割）。
export function normalizeLyricsData(rawData) {
  if (!rawData || typeof rawData !== "object") {
    return null;
  }

  const songId =
    typeof rawData.songId === "string"
      ? rawData.songId
      : typeof rawData.song_id === "string"
        ? rawData.song_id
        : null;

  if (songId === null) {
    return null;
  }

  const rawLines = Array.isArray(rawData.lines) ? rawData.lines : [];
  const lines = rawLines.map((rawLine) => {
    const source = rawLine && typeof rawLine === "object" ? rawLine : {};
    // word_count等、解析ツール固有の項目はここで自然に取り除かれる
    // （sourceから必要な4項目だけを拾い、新しいオブジェクトを組み立てるため）。
    return {
      line: source.line,
      text: source.text,
      start: source.start,
      end: source.end,
    };
  });

  return {
    songId,
    lines,
    schemaVersion: LATEST_SCHEMA_VERSION,
  };
}

// 歌詞データの「中身」（songId・行の内容そのもの）だけを対象にしたSHA-256ハッシュを計算する
// （2026-08-29追加）。updatedAt・schemaVersion・contentHash自身は対象に含めない
// （保存し直しただけで値が変わってしまうと、内容比較の意味がなくなるため）。
// 各行を{line, text, start, end}の固定順で並べ直してから文字列化することで、
// 同じ内容ならJSONの整形（改行・キーの並び順等）が違っても同じハッシュ値になるようにしている
// （追加データパックの読み込み時、「内容が本当に同じか」を正しく判定するため）。
export async function computeLyricsContentHash({ songId, lines }) {
  const canonical = {
    songId,
    lines: (lines ?? []).map((line) => ({ line: line.line, text: line.text, start: line.start, end: line.end })),
  };
  return computeSha256Hex(JSON.stringify(canonical));
}

// 内部形式のデータが、保存してよい内容かどうかを検証する。
// normalizeLyricsData()を経由したデータだけでなく、dev/lyricsEditor.htmlなど
// 別の経路から直接渡された内部形式データに対しても、同じ基準でチェックできるようにしてある
// （saveLyricsData()が呼び出し元によらず必ずこの関数を通すため、外部からの呼び出し時に
// 事前にこの関数を使うかどうかは呼び出し側の自由）。
//
// errors  : 1件でもあれば保存を拒否する（データとして明らかにおかしい内容）
// warnings: 保存は可能だが、本人に確認してほしい内容（ハモリ等で正常な場合もあるため）
export function validateLyricsData(record) {
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

  if (!Array.isArray(record.lines)) {
    errors.push("linesが配列ではありません");
  } else if (record.lines.length === 0) {
    errors.push("linesが空です");
  } else {
    let previousStart = null;
    let previousEnd = null;

    record.lines.forEach((line, index) => {
      const expectedLineNumber = index + 1;

      if (!line || typeof line !== "object") {
        errors.push(`${expectedLineNumber}行目のデータ形式が正しくありません`);
        return;
      }

      // 行番号：正の整数であり、かつ配列の並び順と1〜連番で完全に一致することを確認する。
      // この1つの比較だけで「重複」「欠落」「並び順のズレ」のすべてを検出できる
      // （どれか1つでも起きていれば、どこかの行でline !== 配列上の位置+1になるため）。
      if (!Number.isInteger(line.line) || line.line !== expectedLineNumber) {
        errors.push(
          `${expectedLineNumber}行目のlineの値が想定と異なります（line: ${line.line}）。行番号の重複・欠落・並び順のズレの可能性があります`
        );
      }

      // 歌詞本文が空の行は、入力漏れ・解析ミス・欠落を正常データとして
      // 保存してしまうリスクがあるため、現時点では許可しない（本人の方針）。
      // 将来、間奏などを明示したい場合は歌詞行とは別の形式（type: "instrumental"等）で
      // 表現する想定。
      if (typeof line.text !== "string" || line.text.trim() === "") {
        errors.push(`${expectedLineNumber}行目のtextが空です`);
      }

      const { start, end } = line;
      const startIsNumber = typeof start === "number" && Number.isFinite(start);
      const endIsNumber = typeof end === "number" && Number.isFinite(end);

      if (!startIsNumber || !endIsNumber) {
        errors.push(`${expectedLineNumber}行目のstart/endが数値ではありません`);
        return; // 数値でない場合、以降の時刻の比較チェックは意味がないためここで打ち切る
      }

      if (start < 0 || end < 0) {
        errors.push(`${expectedLineNumber}行目の時間が負の値です`);
      }

      if (end <= start) {
        errors.push(`${expectedLineNumber}行目のendがstart以下です`);
      }

      // 開始時刻が時系列順であることは必須（前の行より早く始まる＝データが壊れている可能性が高い）。
      if (previousStart !== null && start < previousStart) {
        errors.push(`${expectedLineNumber}行目の開始時刻が前の行より早く、時系列が逆転しています`);
      }

      // ここから先は「保存はできるが確認してほしい」警告。
      // 前の行のendより後ろのstartになっていない＝時間的に重なっている状態だが、
      // ハモリ・掛け合いなど正常なケースもあり得るため、エラーにはせず警告にとどめる。
      if (previousEnd !== null && start < previousEnd) {
        warnings.push(`${expectedLineNumber}行目が前の行と時間的に重なっています（ハモリ・掛け合いの可能性）`);
      }

      const duration = end - start;
      if (duration < SHORT_LINE_WARNING_SEC) {
        warnings.push(`${expectedLineNumber}行目が極端に短い行です（${duration.toFixed(2)}秒）`);
      }
      if (duration > LONG_LINE_WARNING_SEC) {
        warnings.push(`${expectedLineNumber}行目が極端に長い行です（${duration.toFixed(1)}秒）`);
      }

      if (previousEnd !== null) {
        const gap = start - previousEnd;
        if (gap > LONG_GAP_WARNING_SEC) {
          warnings.push(`${expectedLineNumber}行目の前に、${gap.toFixed(1)}秒の長い空白区間があります`);
        }
      }

      if (end > MAX_REASONABLE_SONG_LENGTH_SEC) {
        warnings.push(
          `${expectedLineNumber}行目の時刻が${MAX_REASONABLE_SONG_LENGTH_SEC}秒を超えており、曲の想定時間を超えている可能性があります`
        );
      }

      previousStart = start;
      previousEnd = end;
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}

// 検証済みの内部形式データを保存する。
//
// 【重要】呼び出し元がすでにvalidateLyricsData()でチェック済みかどうかに関わらず、
// この関数自身が必ずvalidateLyricsData()を通してから保存する。これにより、
// ・外部JSONのインポート（Step2のインポートUI、analyzeLyricsFiles経由）
// ・dev/lyricsEditor.htmlからの直接保存
// ・その他将来追加される保存経路
// のどこから呼ばれても、不正なデータが保存される心配がない
//（呼び出し側の検証漏れが、そのままデータ破損につながらないようにするための設計）。
//
// 戻り値: { saved: boolean, errors: string[], warnings: string[] }
//   saved   : 保存できたかどうか
//   errors  : 保存を拒否した理由（savedがfalseのときのみ内容がある）
//   warnings: 保存はできたが確認してほしい内容（savedがtrueでも空とは限らない）
// 【2026-08-29追加：contentHash】呼び出し側がすでにcomputeLyricsContentHash()の結果を
// record.contentHashへ入れて渡していればそれをそのまま使い（analyzeLyricsFiles()経由の
// 保存はこちら）、入っていなければここで計算する（dev/lyricsEditor.htmlからの直接保存等、
// 事前計算を経由しない呼び出し元向けのフォールバック）。
export async function saveLyricsData(record) {
  const { valid, errors, warnings } = validateLyricsData(record);
  if (!valid) {
    return { saved: false, errors, warnings };
  }

  const contentHash = record.contentHash ?? (await computeLyricsContentHash(record));

  const db = await openDatabase();
  await putRecord(db, { ...record, updatedAt: Date.now(), contentHash });
  db.close();

  return { saved: true, errors: [], warnings };
}

// 指定したsongIdの歌詞データを取得する。未読み込みならnullを返す。
export async function getLyricsData(songId) {
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

// 指定したsongIdの歌詞データが読み込み済みかどうかを返す。
export async function hasLyricsData(songId) {
  const record = await getLyricsData(songId);
  return record !== null;
}

// 読み込み済みの歌詞データを持つsongId一覧を取得する。
// 「歌詞データがある曲だけ同期歌詞パネルを表示する」といった判定に使う想定。
export async function getImportedLyricsSongIds() {
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

// 読み込み済みの全曲について、songId→contentHashの対応表を取得する（2026-08-29追加）。
// 追加データパックの読み込み時、「既にある歌詞と中身が同じか違うか」を判定するために使う。
export async function getLyricsContentHashes() {
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

// 指定したsongIdの歌詞データを削除する（Step5の管理機能で使用予定）。
export async function deleteLyricsData(songId) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(songId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

// analyzeLyricsFiles()が1ファイルずつ集めた「まだ保存していない」解析結果を、
// 最終的な3つのグループ（保存してよい／警告あり／保存できない）へ振り分ける。
//
// IndexedDBに一切触れない純粋関数のため、実際のファイル・DBを用意しなくてもテストできる。
// ここで行う判断は「同じ選択内に同じsongIdが複数あった場合の重複除外」だけで、
// 個々のファイルの内容そのものの正しさはvalidateLyricsData()側の役割（analyzeLyricsFiles()内で判定済み）。
//
// perFileResults の要素（analyzeLyricsFiles()が作る中間データ）:
//   失敗    : { fileName, status: "failed", errors }
//   保存可  : { fileName, status: "ready"|"warning", songId, normalizedData, warnings, isUpdate,
//               existingContentHash }
//   （normalizedData.contentHashに、この歌詞データ自体の内容ハッシュが入っている）
export function classifyLyricsAnalysisResults(perFileResults) {
  const readyFiles = [];
  const warningFiles = [];
  const failedFiles = [];

  // 曲ID（songId）ごとに、失敗していないファイルがいくつ選ばれているかを数える。
  const songIdCounts = new Map();
  for (const result of perFileResults) {
    if (result.status === "failed") continue;
    songIdCounts.set(result.songId, (songIdCounts.get(result.songId) || 0) + 1);
  }

  for (const result of perFileResults) {
    if (result.status === "failed") {
      failedFiles.push({ fileName: result.fileName, errors: result.errors });
      continue;
    }

    // 同じ曲の歌詞データが同時に複数選択されている場合、どちらを優先すべきか自動では
    // 判断できないため、分かりやすさを優先してどちらも保存対象から除外する（本人の方針）。
    if (songIdCounts.get(result.songId) > 1) {
      failedFiles.push({
        fileName: result.fileName,
        errors: [`同じ曲（songId: ${result.songId}）の歌詞データが同時に複数選択されています`],
      });
      continue;
    }

    const fileEntry = {
      fileName: result.fileName,
      normalizedData: result.normalizedData,
      isUpdate: result.isUpdate,
      existingContentHash: result.existingContentHash,
    };

    if (result.status === "warning") {
      warningFiles.push({ ...fileEntry, warnings: result.warnings });
    } else {
      readyFiles.push(fileEntry);
    }
  }

  return { readyFiles, warningFiles, failedFiles };
}

// 選んだ複数の歌詞JSONファイルを読み取り、正規化・検証・重複songIdの確認・
// 既存データの有無（新規／更新）の判定までを行う（＝まだ保存はしない）。
//
// UI側（js/main.js）は、この結果を受け取って
// 「警告のないファイルは自動保存」「警告のあるファイルはまとめて確認してから保存」
// といった画面表示・保存タイミングの判断だけを行う。ファイルの読み取り・JSON.parse・
// 正規化・検証といったデータ処理は、UIを持たないこのファイル側に集約している。
//
// 戻り値: {
//   readyFiles:   { fileName, normalizedData, isUpdate, existingContentHash }[]  … 問題なし、そのまま保存してよい
//   warningFiles: { fileName, normalizedData, isUpdate, existingContentHash, warnings }[]  … 保存前に本人の確認が必要
//   failedFiles:  { fileName, errors }[]  … 保存できない（JSON壊れ・検証エラー・songId重複等）
// }
// normalizedData.contentHashに、この歌詞データ自体の内容ハッシュが入る（2026-08-29追加）。
// existingContentHashは、この端末に既にある同じsongIdのデータの内容ハッシュ
// （未読み込みならnull）。呼び出し側（js/dataPackImport.js）は
// normalizedData.contentHash !== existingContentHash で「内容が違う＝更新が必要」を判定できる。
export async function analyzeLyricsFiles(fileList) {
  const perFileResults = [];
  // 1件ずつgetLyricsData()を呼ぶ代わりに、既存データのハッシュを1回のIndexedDBアクセスで
  // まとめて取得しておく（ファイル数が多いパック読み込み時の無駄なDBアクセスを避けるため）。
  const existingHashes = await getLyricsContentHashes();

  for (const file of fileList) {
    const { normalized, reason } = await parseAndNormalizeLyricsFile(file);
    if (!normalized) {
      perFileResults.push({ fileName: file.name, status: "failed", errors: [reason] });
      continue;
    }

    const { valid, errors, warnings } = validateLyricsData(normalized);
    if (!valid) {
      perFileResults.push({ fileName: file.name, status: "failed", errors });
      continue;
    }

    normalized.contentHash = await computeLyricsContentHash(normalized);
    const isUpdate = existingHashes.has(normalized.songId);
    perFileResults.push({
      fileName: file.name,
      status: warnings.length > 0 ? "warning" : "ready",
      songId: normalized.songId,
      normalizedData: normalized,
      warnings,
      isUpdate,
      existingContentHash: existingHashes.get(normalized.songId) ?? null,
    });
  }

  return classifyLyricsAnalysisResults(perFileResults);
}

// 選んだ複数の歌詞JSONファイルを、警告の有無に関わらずまとめて保存する簡易版。
// 本編の歌詞インポートUI（js/main.js）は警告確認を挟むためこの関数を直接使わないが、
// 将来「確認なしでまとめて取り込みたい」場面（開発中の一括投入など）のために残してある。
// analyzeLyricsFiles()と同じ解析処理を再利用しており、判定ロジックの二重管理を避けている。
//
// 戻り値: { savedSongIds: string[], failedFiles: { fileName: string, reason: string }[] }
export async function importLyricsFiles(fileList) {
  const { readyFiles, warningFiles, failedFiles } = await analyzeLyricsFiles(fileList);
  const savedSongIds = [];
  const saveFailures = [];

  for (const file of [...readyFiles, ...warningFiles]) {
    const result = await saveLyricsData(file.normalizedData);
    if (result.saved) {
      savedSongIds.push(file.normalizedData.songId);
    } else {
      saveFailures.push({ fileName: file.fileName, reason: result.errors.join(" / ") });
    }
  }

  return {
    savedSongIds,
    failedFiles: [
      ...failedFiles.map((f) => ({ fileName: f.fileName, reason: f.errors.join(" / ") })),
      ...saveFailures,
    ],
  };
}
