// 「追加データパック」（新曲の音源・歌詞・コール・コールガイドをまとめて配布するための、
// 1回の読み込みで導入できるファイル群）を解析・取り込みするファイル（2026-08-26新設、
// 2026-08-27にコールガイド対応・packKind〈full/incremental〉対応を追加）。
//
// 【背景・目的】21枚目以降の新曲は、今までのように「音源だけ」「歌詞だけ」を個別に
// インポート画面から選ぶのではなく、1つのパック（複数ファイルの組み合わせ）を選ぶだけで
// 音源・歌詞・コール・コールガイドがまとめて正しい保存場所へ登録されるようにしたい
// （本人指示：追加データを読み込む→1パック選択→内容検証→自動登録→「○曲追加しました」）。
// 新規ユーザー向けの「全曲パック」も、既存ユーザー向けの「追加パック」も、この同じ
// 解析・保存経路（analyzeDataPack→importAnalyzedDataPack）を1つだけ使う。マニフェストの
// 任意フィールドpackKind（"full"|"incremental"）は、UI側の案内文・結果メッセージの言い回しを
// 出し分けるためだけの表示用情報で、読み込み処理自体はfull/incrementalで一切分岐しない
// （本人指示：同じパーサー・同じmanifest仕様に統一する）。
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
//   ・コールガイドのバックアップJSON（任意のファイル名）… js/callGuideStorage.jsの
//     exportAllCallGuideData()と全く同じ形式（type: "equal-love-call-guide-data"）
// これらすべて任意（無くてもパックとして成立する。音源だけのパック等も許可する）。
// マニフェスト・コールバックアップ・コールガイドバックアップ・歌詞JSONは、ファイル名ではなく
// 中身のtype/フィールドで判別する（本人がAirDrop等でファイルを受け取った際、OS側で自動的に
// ファイル名へ「(1)」等が付与されるケースがあっても、判別に影響しないようにするため）。
//
// 【安全設計：既存データを壊さない】このファイルは新しいIndexedDBストアを一切作らず、
// 既存の4つのストレージモジュール（audioStorage.js・lyricsStorage.js・callStorage.js・
// callGuideStorage.js）が既に持っている、検証済みの保存関数（putRecord系）をそのまま
// 呼び出すだけ。1曲・1件＝1レコードのkeyPath設計はそのままなので、パックに含まれない曲・
// パック内で検証に失敗した曲のレコードには一切触れない（＝上書き事故や巻き添え削除が
// 起こりえない）。
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
import { importAudioFiles, getImportedSongIds } from "./audioStorage.js";
import { analyzeLyricsFiles, importLyricsFiles } from "./lyricsStorage.js";
import { analyzeCallDataBackupFile, importCallDataSongs } from "./callStorage.js";
import { analyzeCallGuideBackupFile, importCallGuideDataEntries } from "./callGuideStorage.js";

// マニフェストJSONの目印。js/callStorage.jsのBACKUP_FILE_TYPEと同じ考え方
// （中身のtypeフィールドで、ファイル名に依存せず判別できるようにする）。
export const DATA_PACK_MANIFEST_TYPE = "equal-love-data-pack";

// 現時点でこの実装が読めるマニフェストの構造バージョン。
// 将来マニフェストの形式を変える場合は、この値を上げ、古いバージョンの読み込みを
// 拒否する（対応していないバージョンです、と案内する）想定。
export const LATEST_MANIFEST_SCHEMA_VERSION = 1;

// パックが対象とする範囲。UI側の案内文・結果メッセージの言い回しを出し分けるためだけに使う
// （読み込み処理そのものは、full/incremental/correctionで一切分岐しない。どれも同じ解析・
// 保存経路を通る。correctionsによる上書き判定自体は、packKindの値ではなくマニフェストの
// correctionsフィールドの有無だけで決まる）。
export const PACK_KIND = {
  FULL: "full", // 新規ユーザー向け：これまでの全曲を含む
  INCREMENTAL: "incremental", // 既存ユーザー向け：新しいシングル分だけの追加
  CORRECTION: "correction", // 2026-08-29追加：既存データの正式な修正版だけを含む小さいパック
};

// パック内のJSONファイルを、中身から4種類に判別する。
// 戻り値: "manifest" | "callBackup" | "callGuideBackup" | "lyrics" | "unknown"
function classifyJsonContent(rawData) {
  if (!rawData || typeof rawData !== "object") return "unknown";
  if (rawData.type === DATA_PACK_MANIFEST_TYPE) return "manifest";
  if (rawData.type === "equal-love-call-data") return "callBackup";
  // js/callGuideStorage.jsのBACKUP_FILE_TYPEと同じ値（非公開定数のため、既存のcallBackup判定と
  // 同じくtype文字列を直接比較する。値自体はコールデータのバックアップ形式と同じ命名規則）。
  if (rawData.type === "equal-love-call-guide-data") return "callGuideBackup";
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
  // packKindは任意項目（本人指示：新規/既存で入口の説明を分ける）。省略時はincremental扱い
  // （＝「追加パック」として案内する）にすることで、packKindを持たない旧形式のマニフェスト・
  // 既存のテスト用フィクスチャとの後方互換を保つ。指定されている場合だけ値の妥当性を見る。
  if (
    rawData.packKind !== undefined &&
    rawData.packKind !== PACK_KIND.FULL &&
    rawData.packKind !== PACK_KIND.INCREMENTAL &&
    rawData.packKind !== PACK_KIND.CORRECTION
  ) {
    errors.push(`packKindの値が不正です（${rawData.packKind}）`);
  }
  if (!Array.isArray(rawData.songIds) || rawData.songIds.length === 0) {
    errors.push("songIdsが空です");
  } else {
    const unknownSongIds = rawData.songIds.filter((songId) => !SONGS.some((song) => song.id === songId));
    if (unknownSongIds.length > 0) {
      errors.push(`songs.jsに登録されていない曲IDが含まれています（${unknownSongIds.join("、")}）`);
    }
  }

  // correctionsは任意項目（本人指示：2026-08-29、「僕のヒロイン」歌詞誤登録事故を受けて追加）。
  // 「この端末に既に保存済みでも、正式な修正版として上書きしてよい」曲IDを、データ種類ごとに
  // 明示的に列挙するための項目。省略時は今まで通り「既存データは一切上書きしない」という
  // 安全側の既定動作のまま変わらない（後方互換：この項目を持たない旧マニフェスト・
  // 新曲追加のみの通常パックには一切影響しない）。
  if (rawData.corrections !== undefined) {
    if (typeof rawData.corrections !== "object" || rawData.corrections === null || Array.isArray(rawData.corrections)) {
      errors.push("correctionsの形式が正しくありません");
    } else {
      const knownKeys = ["lyrics", "audio", "calls", "callGuides"];
      for (const [key, value] of Object.entries(rawData.corrections)) {
        if (!knownKeys.includes(key)) {
          errors.push(`correctionsに未対応の項目があります（${key}）`);
        } else if (!Array.isArray(value) || value.some((id) => typeof id !== "string")) {
          errors.push(`corrections.${key}は文字列の配列である必要があります`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

// マニフェストのcorrections（省略時は空扱い）から、指定データ種類の「上書きしてよい曲ID」の
// Setを作る。マニフェストにcorrections自体が無い場合や、そのデータ種類の指定が無い場合は
// 空のSet（＝今まで通り、既存データは一切上書きしない）を返す。
function correctionIdSet(manifest, key) {
  const ids = manifest?.corrections?.[key];
  return new Set(Array.isArray(ids) ? ids : []);
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
//   callGuides: { readyGuides, failedGuides } | null,    … コールガイドのJSONが無ければnull
//   manifestSongIdsNotCovered: string[],  … マニフェストが挙げているが、
//                                            音源・歌詞・コールのいずれにも該当ファイルが
//                                            見つからなかった曲ID（警告表示用。エラーにはしない
//                                            ＝コール等、曲によっては用意しないデータ種類が
//                                            あってもよいため。コールガイドはguideId単位で
//                                            songIdに1:1で紐づかないため、この判定には含めない）
// }
export async function analyzeDataPack(fileList) {
  const files = Array.from(fileList);

  const manifestCandidates = [];
  const callBackupCandidates = [];
  const callGuideBackupCandidates = [];
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
    else if (kind === "callGuideBackup") callGuideBackupCandidates.push({ file, rawData });
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

  // コールガイド：コールデータと同じ扱い（0件ならこのパックには含まれていない）。
  let callGuidesResult = null;
  if (callGuideBackupCandidates.length > 1) {
    return { ok: false, fileError: "コールガイドのバックアップファイルが複数見つかりました", manifest: null };
  }
  if (callGuideBackupCandidates.length === 1) {
    callGuidesResult = await analyzeCallGuideBackupFile(callGuideBackupCandidates[0].file);
    if (!callGuidesResult.fileValid) {
      return {
        ok: false,
        fileError: `コールガイドデータの読み込みに失敗しました: ${callGuidesResult.fileError}`,
        manifest: null,
      };
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
    callGuides: callGuidesResult,
    manifestSongIdsNotCovered,
  };
}

// analyzeDataPack()が検証済みと判定した内容を、実際にIndexedDBへ保存する。
// 警告あり（lyrics.warningFiles）のファイルも、呼び出し側が続行を選んだ前提でそのまま保存する
// （js/main.jsの既存インポートUIと同じ「警告は保存を止めない、事前確認のためだけにある」という方針）。
//
// 【2026-08-28変更：不足分だけ自動補完する差分インポート】以前はパックに含まれる内容を
// 「既に持っているかどうか」に関わらず毎回無条件で上書き保存していた。本人指示により、
// データの種類（音源・歌詞・コール・コールガイド）ごとに「この端末に既にあるか」を判定し、
// 既にあるものは保存し直さずスキップ、無いものだけ新規保存するようにした。
// 判定は曲単位ではなくデータ種類単位で独立して行う（例：音源はあるが歌詞は無い曲は、
// 音源だけスキップして歌詞だけ追加する）。
//
// 【2026-08-29追加：正式な修正版だけを安全に上書きする仕組み】上のスキップ機構により、
// 「新曲を追加パックで導入する」場合は既存データを壊さず安全になった一方、「以前配布した
// データに間違いがあり、後から修正版を配布する」場合（実例：『僕のヒロイン』に『ヒロインズ』
// の歌詞が誤登録されていた事故の修正）には、修正版パックを読み込んでも「もう持っている」と
// 判定されて何も更新されない問題が残っていた。この問題に対して、マニフェストのcorrections
// フィールド（省略可）で「この曲IDは正式な修正版なので、既に持っていても上書きしてよい」と
// 明示的に宣言できるようにした。宣言が無い曲・宣言が無いマニフェスト（今まで配布した
// パックすべてを含む）は、今まで通り一切上書きしない。
//
// 【安全性について】js/audioStorage.js・js/lyricsStorage.js・js/callStorage.js・
// js/callGuideStorage.jsの保存関数（importAudioFiles等）自体は変更していない
// （「音源を読み込む」等、データパックとは別の単体インポートUIが、既存曲の上書き更新に
// 引き続き使えるようにするため）。スキップ判定はこのファイル側で、保存対象を絞り込む
// 形だけで行っている。歌詞・コール・コールガイドは、analyzeDataPack()の時点で各ストレージ
// モジュールが既に計算しているisUpdate（既存データの有無）をそのまま使う。音源だけは
// 分析時にisUpdateを持たないため、ここで改めてgetImportedSongIds()を1回だけ呼んで判定する。
//
// 戻り値: {
//   savedAudioSongIds: string[], skippedAudioSongIds: string[], correctedAudioSongIds: string[],
//   savedLyricsSongIds: string[], skippedLyricsSongIds: string[], lyricsFailures: { fileName, reason }[],
//   correctedLyricsSongIds: string[],
//   savedCallSongIds: string[], skippedCallSongIds: string[], callFailures: { songId, reason }[],
//   correctedCallSongIds: string[],
//   savedCallGuideIds: string[], skippedCallGuideIds: string[], callGuideFailures: { guideId, reason }[],
//   correctedCallGuideIds: string[],
// }
// correctedXxxIds は、savedXxxIds のうち「この端末に既存データがあったが、correctionsの
// 指定により正式な修正版として上書き保存されたID」だけを抜き出した部分集合（本人指示：
// 2026-08-29、「新規追加」と「修正版への更新」をUI上で区別できるようにするため）。
// savedXxxIdsのサブセットであり、別途足し算する必要はない（savedの中に既に含まれている）。
export async function importAnalyzedDataPack(analyzed) {
  const { manifest, audio, lyrics, calls, callGuides } = analyzed;

  const audioCorrections = correctionIdSet(manifest, "audio");
  const lyricsCorrections = correctionIdSet(manifest, "lyrics");
  const callCorrections = correctionIdSet(manifest, "calls");
  const callGuideCorrections = correctionIdSet(manifest, "callGuides");

  // 音源：既にこの端末に読み込み済みのsongIdは、correctionsで明示されていない限りスキップする。
  const existingAudioSongIds = new Set(await getImportedSongIds());
  const audioFilesToSave = [];
  const skippedAudioSongIds = [];
  audio.readyFiles.forEach((file, index) => {
    const songId = audio.savableSongIds[index];
    if (existingAudioSongIds.has(songId) && !audioCorrections.has(songId)) {
      skippedAudioSongIds.push(songId);
    } else {
      audioFilesToSave.push(file);
    }
  });
  const audioResult = await importAudioFiles(audioFilesToSave);
  const correctedAudioSongIds = audioResult.savedSongIds.filter(
    (songId) => existingAudioSongIds.has(songId) && audioCorrections.has(songId)
  );

  // 歌詞：analyzeLyricsFiles()（analyzeDataPack()内で既に実行済み）が算出したisUpdateを使う。
  // isUpdateであっても、correctionsで明示された曲IDは「正式な修正版」として保存対象に含める。
  const lyricsFilesAll = [...lyrics.readyFiles, ...lyrics.warningFiles];
  const lyricsFilesToSave = lyricsFilesAll.filter(
    (file) => !file.isUpdate || lyricsCorrections.has(file.normalizedData.songId)
  );
  const skippedLyricsSongIds = lyricsFilesAll
    .filter((file) => file.isUpdate && !lyricsCorrections.has(file.normalizedData.songId))
    .map((file) => file.normalizedData.songId);
  const lyricsImportResult = await importLyricsFiles(lyricsFilesToSaveAsFileList(lyricsFilesToSave));
  const lyricsUpdateSongIds = new Set(
    lyricsFilesAll.filter((file) => file.isUpdate).map((file) => file.normalizedData.songId)
  );
  const correctedLyricsSongIds = lyricsImportResult.savedSongIds.filter(
    (songId) => lyricsUpdateSongIds.has(songId) && lyricsCorrections.has(songId)
  );

  let savedCallSongIds = [];
  let callFailures = [];
  let skippedCallSongIds = [];
  let correctedCallSongIds = [];
  if (calls) {
    const callSongsToSave = calls.readySongs.filter(
      (song) => !song.isUpdate || callCorrections.has(song.songId)
    );
    skippedCallSongIds = calls.readySongs
      .filter((song) => song.isUpdate && !callCorrections.has(song.songId))
      .map((song) => song.songId);
    if (callSongsToSave.length > 0) {
      const callImportResult = await importCallDataSongs(callSongsToSave);
      savedCallSongIds = callImportResult.savedSongIds;
      callFailures = callImportResult.saveFailures;
      const callUpdateSongIds = new Set(
        calls.readySongs.filter((song) => song.isUpdate).map((song) => song.songId)
      );
      correctedCallSongIds = savedCallSongIds.filter(
        (songId) => callUpdateSongIds.has(songId) && callCorrections.has(songId)
      );
    }
  }

  let savedCallGuideIds = [];
  let callGuideFailures = [];
  let skippedCallGuideIds = [];
  let correctedCallGuideIds = [];
  if (callGuides) {
    const guidesToSave = callGuides.readyGuides.filter(
      (guide) => !guide.isUpdate || callGuideCorrections.has(guide.guideId)
    );
    skippedCallGuideIds = callGuides.readyGuides
      .filter((guide) => guide.isUpdate && !callGuideCorrections.has(guide.guideId))
      .map((guide) => guide.guideId);
    if (guidesToSave.length > 0) {
      const callGuideImportResult = await importCallGuideDataEntries(guidesToSave);
      savedCallGuideIds = callGuideImportResult.savedGuideIds;
      callGuideFailures = callGuideImportResult.saveFailures;
      const callGuideUpdateIds = new Set(
        callGuides.readyGuides.filter((guide) => guide.isUpdate).map((guide) => guide.guideId)
      );
      correctedCallGuideIds = savedCallGuideIds.filter(
        (guideId) => callGuideUpdateIds.has(guideId) && callGuideCorrections.has(guideId)
      );
    }
  }

  return {
    savedAudioSongIds: audioResult.savedSongIds,
    skippedAudioSongIds,
    correctedAudioSongIds,
    savedLyricsSongIds: lyricsImportResult.savedSongIds,
    skippedLyricsSongIds,
    lyricsFailures: lyricsImportResult.failedFiles,
    correctedLyricsSongIds,
    savedCallSongIds,
    skippedCallSongIds,
    callFailures,
    correctedCallSongIds,
    savedCallGuideIds,
    skippedCallGuideIds,
    callGuideFailures,
    correctedCallGuideIds,
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
