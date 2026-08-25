// 「追加データパック」（新曲の音源・歌詞・コールデータをまとめて配布するための、
// 1回の読み込みで導入できるファイル群）を解析・取り込みするファイル（2026-08-26新設）。
//
// 【背景・目的】21枚目以降の新曲は、今までのように「音源だけ」「歌詞だけ」を個別に
// インポート画面から選ぶのではなく、1つのパック（複数ファイルの組み合わせ）を選ぶだけで
// 音源・歌詞・コールデータがまとめて正しい保存場所へ登録されるようにしたい
// （本人指示：追加データを読み込む→1パック選択→内容検証→自動登録→「○曲追加しました」）。
//
// 【形式の選び方について】新しいファイル形式・圧縮フォーマットを自作するのではなく、
// 「複数ファイルをまとめて選択する」という、このアプリが既に持っているUI（
// js/audioStorage.jsのimportAudioFiles・js/lyricsStorage.jsのanalyzeLyricsFiles、
// どちらも<input type="file" multiple>のFileListをそのまま受け取る設計）にあわせた。
// 具体的には、以下のファイル群を一度に選んでもらう：
//   ・manifest.json     … このパックの中身を説明するマニフェスト（本ファイルが定義）
//   ・<songId>.mp3      … 音源（js/audioStorage.jsと全く同じ命名規則、そのまま流用）
//   ・歌詞JSON（任意のファイル名）… 中身にsongId/song_idを持つ、js/lyricsStorage.jsと同じ形式
//   ・コールデータのバックアップJSON（任意のファイル名）… js/callStorage.jsの
//     exportAllCallData()と全く同じ形式（type: "equal-love-call-data"）
// マニフェスト・コールバックアップ・歌詞JSONは、ファイル名ではなく中身のtype/フィールドで
// 判別する（本人がAirDrop等でファイルを受け取った際、OS側で自動的にファイル名へ
// 「(1)」等が付与されるケースがあっても、判別に影響しないようにするため）。
//
// 【安全設計：既存データを壊さない】このファイルは新しいIndexedDBストアを一切作らず、
// 既存の3つのストレージモジュール（audioStorage.js・lyricsStorage.js・callStorage.js）が
// 既に持っている、検証済みの保存関数（putRecord系）をそのまま呼び出すだけ。
// 1曲＝1レコードのkeyPath設計はそのままなので、パックに含まれない曲・パック内で
// 検証に失敗した曲のレコードには一切触れない（＝上書き事故や巻き添え削除が起こりえない）。
//
// 【ロールバックについて、本人指示との対応】「不正なパックを読み込んでも既存データが
// 壊れない」「読み込み途中で失敗したら安全に終了する」という要求に対して、このファイルは
// 「まず全ファイルを読み取り・検証だけ行い（analyzeDataPack、IndexedDBへは書き込まない）、
// 検証を通ったものだけを後段で保存する（importAnalyzedDataPack）」という2段階構成にした。
// IndexedDBのトランザクションをまたいだ一括ロールバックは実装していないが、
// 検証を通っていないレコードはそもそも保存処理に渡さないため、「保存に失敗した」という
// 事態そのものが起こりにくい。既存のjs/lyricsStorage.js（analyzeLyricsFiles→保存）・
// js/callStorage.js（analyzeCallDataBackupFile→importCallDataSongs）と同じ、
// 「部分成功を許容し、失敗したものだけ個別に報告する」という既存パターンを踏襲している
// （本人指示：既存コードを必要以上に全面改修せず、安全に段階導入する）。

import { SONGS } from "./data/songs.js";
import { importAudioFiles } from "./audioStorage.js";
import { analyzeLyricsFiles, importLyricsFiles } from "./lyricsStorage.js";
import { analyzeCallDataBackupFile, importCallDataSongs } from "./callStorage.js";

// マニフェストJSONの目印。js/callStorage.jsのBACKUP_FILE_TYPEと同じ考え方
// （中身のtypeフィールドで、ファイル名に依存せず判別できるようにする）。
export const DATA_PACK_MANIFEST_TYPE = "equal-love-data-pack";

// 現時点でこの実装が読めるマニフェストの構造バージョン。
// 将来マニフェストの形式を変える場合は、この値を上げ、古いバージョンの読み込みを
// 拒否する（対応していないバージョンです、と案内する）想定。
export const LATEST_MANIFEST_SCHEMA_VERSION = 1;

// パック内のJSONファイルを、中身から3種類に判別する。
// 戻り値: "manifest" | "callBackup" | "lyrics" | "unknown"
function classifyJsonContent(rawData) {
  if (!rawData || typeof rawData !== "object") return "unknown";
  if (rawData.type === DATA_PACK_MANIFEST_TYPE) return "manifest";
  if (rawData.type === "equal-love-call-data") return "callBackup";
  if (typeof rawData.songId === "string" || typeof rawData.song_id === "string") return "lyrics";
  return "unknown";
}

// マニフェストの中身が、読み込んでよい形かどうかを検証する。
// DOM・IndexedDBに一切触れない純粋関数のため、テストしやすい。
export function validateManifest(rawData) {
  const errors = [];

  if (!rawData || typeof rawData !== "object" || rawData.type !== DATA_PACK_MANIFEST_TYPE) {
    return { valid: false, errors: ["マニフェストの形式が正しくありません"] };
  }
  if (typeof rawData.schemaVersion !== "number" || rawData.schemaVersion > LATEST_MANIFEST_SCHEMA_VERSION) {
    errors.push("対応していないバージョンのデータパックです。アプリを更新してください");
  }
  if (typeof rawData.packId !== "string" || rawData.packId.trim() === "") {
    errors.push("packIdが指定されていません");
  }
  if (typeof rawData.packLabel !== "string" || rawData.packLabel.trim() === "") {
    errors.push("packLabelが指定されていません");
  }
  if (!Array.isArray(rawData.songIds) || rawData.songIds.length === 0) {
    errors.push("songIdsが空です");
  } else {
    const unknownSongIds = rawData.songIds.filter((songId) => !SONGS.some((song) => song.id === songId));
    if (unknownSongIds.length > 0) {
      errors.push(`songs.jsに登録されていない曲IDが含まれています（${unknownSongIds.join("、")}）`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// 選ばれた全ファイル（FileList、または同等の配列）を読み取り、種類ごとに仕分けて
// 検証する（まだIndexedDBへは一切書き込まない）。
//
// 戻り値: {
//   ok: boolean,                     … マニフェストが見つかり、検証を通ったか
//   fileError: string|null,          … ok=falseのときの理由（マニフェストが無い／複数ある／不正）
//   manifest: object|null,           … 検証済みマニフェスト（okのときのみ）
//   audio: { readyFiles: File[], savableSongIds: string[] },  … readyFiles[i]から
//                                                                 savableSongIds[i]が導出される
//                                                                 （拡張子.mp3を除いたファイル名。
//                                                                 このパック内で.mp3として
//                                                                 分類された時点でファイル名は
//                                                                 既に確定しているため、
//                                                                 「未対応ファイル」は生じない）
//   lyrics: { readyFiles, warningFiles, failedFiles },   … js/lyricsStorage.jsのanalyzeLyricsFiles()と同じ形
//   calls: { readySongs, failedSongs } | null,           … コールデータのJSONが無ければnull
//   manifestSongIdsNotCovered: string[],  … マニフェストが挙げているが、
//                                            音源・歌詞・コールのいずれにも該当ファイルが
//                                            見つからなかった曲ID（警告表示用。エラーにはしない
//                                            ＝コール等、曲によっては用意しないデータ種類が
//                                            あってもよいため）
// }
export async function analyzeDataPack(fileList) {
  const files = Array.from(fileList);

  const manifestCandidates = [];
  const callBackupCandidates = [];
  const lyricsFiles = [];
  const audioFiles = [];

  for (const file of files) {
    if (/\.mp3$/i.test(file.name)) {
      audioFiles.push(file);
      continue;
    }
    if (!/\.json$/i.test(file.name)) {
      continue; // マニフェスト・歌詞・コール以外の想定外ファイルは、単に無視する（安全側）
    }

    let rawData;
    try {
      rawData = JSON.parse(await file.text());
    } catch {
      continue; // JSONとして読めないファイルも無視する（audio/lyrics同様、ここでは致命的にしない）
    }

    const kind = classifyJsonContent(rawData);
    if (kind === "manifest") manifestCandidates.push({ file, rawData });
    else if (kind === "callBackup") callBackupCandidates.push({ file, rawData });
    else if (kind === "lyrics") lyricsFiles.push(file);
  }

  if (manifestCandidates.length === 0) {
    return { ok: false, fileError: "マニフェスト（manifest.json）が見つかりませんでした", manifest: null };
  }
  if (manifestCandidates.length > 1) {
    return { ok: false, fileError: "マニフェストが複数見つかりました。パックの中身をご確認ください", manifest: null };
  }

  const { valid, errors } = validateManifest(manifestCandidates[0].rawData);
  if (!valid) {
    return { ok: false, fileError: errors.join(" / "), manifest: null };
  }
  const manifest = manifestCandidates[0].rawData;

  // 音源：ファイル名（拡張子を除いた部分）がsongIdとして扱われる
  // （js/audioStorage.jsのimportAudioFiles()と全く同じ命名規則）。
  const savableSongIds = audioFiles.map((file) => file.name.replace(/\.mp3$/i, ""));

  // 歌詞：既存のanalyzeLyricsFiles()をそのまま再利用する（判定ロジックの二重管理を避ける）。
  const lyricsResult = await analyzeLyricsFiles(lyricsFiles);

  // コール：0件なら「このパックにはコールデータが含まれていない」として扱う
  // （音源・歌詞のみのパックも許可する。全種類を必須にはしない）。
  let callsResult = null;
  if (callBackupCandidates.length > 1) {
    return { ok: false, fileError: "コールデータのバックアップファイルが複数見つかりました", manifest: null };
  }
  if (callBackupCandidates.length === 1) {
    callsResult = await analyzeCallDataBackupFile(callBackupCandidates[0].file);
    if (!callsResult.fileValid) {
      return { ok: false, fileError: `コールデータの読み込みに失敗しました: ${callsResult.fileError}`, manifest: null };
    }
  }

  const coveredSongIds = new Set([
    ...savableSongIds,
    ...lyricsResult.readyFiles.map((f) => f.normalizedData.songId),
    ...lyricsResult.warningFiles.map((f) => f.normalizedData.songId),
    ...(callsResult?.readySongs.map((s) => s.songId) ?? []),
  ]);
  const manifestSongIdsNotCovered = manifest.songIds.filter((songId) => !coveredSongIds.has(songId));

  return {
    ok: true,
    fileError: null,
    manifest,
    audio: { readyFiles: audioFiles, savableSongIds },
    lyrics: lyricsResult,
    calls: callsResult,
    manifestSongIdsNotCovered,
  };
}

// analyzeDataPack()が検証済みと判定した内容を、実際にIndexedDBへ保存する。
// 警告あり（lyrics.warningFiles）のファイルも、呼び出し側が続行を選んだ前提でそのまま保存する
// （js/main.jsの既存インポートUIと同じ「警告は保存を止めない、事前確認のためだけにある」という方針）。
//
// 戻り値: {
//   savedAudioSongIds: string[],
//   savedLyricsSongIds: string[], lyricsFailures: { fileName, reason }[],
//   savedCallSongIds: string[], callFailures: { songId, reason }[],
// }
export async function importAnalyzedDataPack(analyzed) {
  const { audio, lyrics, calls } = analyzed;

  const audioResult = await importAudioFiles(audio.readyFiles);

  const lyricsFilesToSave = [...lyrics.readyFiles, ...lyrics.warningFiles];
  const lyricsImportResult = await importLyricsFiles(lyricsFilesToSaveAsFileList(lyricsFilesToSave));

  let savedCallSongIds = [];
  let callFailures = [];
  if (calls && calls.readySongs.length > 0) {
    const callImportResult = await importCallDataSongs(calls.readySongs);
    savedCallSongIds = callImportResult.savedSongIds;
    callFailures = callImportResult.saveFailures;
  }

  return {
    savedAudioSongIds: audioResult.savedSongIds,
    savedLyricsSongIds: lyricsImportResult.savedSongIds,
    lyricsFailures: lyricsImportResult.failedFiles,
    savedCallSongIds,
    callFailures,
  };
}

// importLyricsFiles()はFileList（.textを持つFileオブジェクトの並び）を受け取り、
// 内部でanalyzeLyricsFiles()・saveLyricsData()を呼ぶ設計になっている。analyzeDataPack()で
// 正規化済みのデータをもう一度JSON文字列に戻し、同じ内容のFileオブジェクトとして包み直す
// ことで、この関数側では保存ロジックを一切複製せず、既存のimportLyricsFiles()をそのまま
// 再利用する（analyzeDataPack()時点の解析結果と保存直前の再解析で二重に検証は走るが、
// 内容は既に正規化済みで変わらないため、結果が食い違うことはない。処理の重複より、
// 保存ロジックの二重管理を避けることを優先した）。
function lyricsFilesToSaveAsFileList(analyzedLyricsFiles) {
  return analyzedLyricsFiles.map(
    (entry) => new File([JSON.stringify(entry.normalizedData)], entry.fileName, { type: "application/json" })
  );
}
