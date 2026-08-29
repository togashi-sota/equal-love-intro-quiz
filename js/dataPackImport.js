// 「追加データパック」（新曲の音源・歌詞・コール・コールガイドをまとめて配布するための、
// 1回の読み込みで導入できるファイル群）を解析・取り込みするファイル（2026-08-26新設、
// 2026-08-27にコールガイド対応・packKind〈full/incremental〉対応を追加、
// 2026-08-29に内容ハッシュ比較方式（後述）へ全面刷新）。
//
// 【背景・目的】21枚目以降の新曲は、今までのように「音源だけ」「歌詞だけ」を個別に
// インポート画面から選ぶのではなく、1つのパック（複数ファイルの組み合わせ）を選ぶだけで
// 音源・歌詞・コール・コールガイドがまとめて正しい保存場所へ登録されるようにしたい
// （本人指示：追加データを読み込む→1パック選択→内容検証→自動登録→「○曲追加しました」）。
// 新規ユーザー向けの「全曲パック」も、既存ユーザー向けの「追加パック」も、この同じ
// 解析・保存経路（analyzeDataPack→importAnalyzedDataPack）を1つだけ使う。マニフェストの
// 任意フィールドpackKind（"full"|"incremental"|"correction"）は、UI側の案内文・結果メッセージの
// 言い回しを出し分けるためだけの表示用情報で、読み込み処理自体はpackKindの値で一切分岐しない
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
// 【2026-08-29全面刷新：内容ハッシュ比較方式】以前（2026-08-28〜29）は「この端末に既に
// あるかどうか」（songId等の有無）だけで新規／スキップを判定していた。この方式には、
// 「同じ曲IDだが中身が間違っていて、後から修正版を配布したい」場合（実例：『僕のヒロイン』の
// 歌詞誤登録の修正）を検出できないという弱点があり、一度は「manifestのcorrectionsフィールドで
// 明示的に曲IDを列挙する」方式で対応した。しかし本人から「今後も歌詞・コール等の修正が
// 起こりうるので、その都度手作業で列挙する方式ではなく、自動で検出できる仕組みにしたい」との
// 指示を受け、各データ（音源Blob・歌詞/コール/コールガイドの中身）そのものからSHA-256の
// 内容ハッシュを計算し、「この端末に保存済みのハッシュ」と「パックに入っているデータの
// ハッシュ」を比較する方式へ置き換えた（js/contentHash.js・各ストレージモジュールの
// contentHash関連関数を参照）。これにより、
//   ・不足しているデータ（この端末に無いID）        → 新規追加
//   ・既にあり、中身も完全に同じ（ハッシュ一致）      → スキップ（無駄な書き込みをしない）
//   ・既にあるが、中身が違う（ハッシュ不一致）        → 修正版として自動的に上書き更新
// が、曲ID等を手作業で列挙することなく、データ種類（音源・歌詞・コール・コールガイド）ごとに
// 完全に自動で判定される。マニフェストのcorrectionsフィールドはもう使われない
// （残っていても単に無視される。古い形式のパックとの後方互換のため、フィールド自体が
// あってもvalidateManifest()はエラーにしない）。
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
import { importAudioFiles, getAudioContentHashes } from "./audioStorage.js";
import { analyzeLyricsFiles, saveLyricsData } from "./lyricsStorage.js";
import { analyzeCallDataBackupFile, importCallDataSongs } from "./callStorage.js";
import { analyzeCallGuideBackupFile, importCallGuideDataEntries } from "./callGuideStorage.js";
import { computeSha256Hex } from "./contentHash.js";

// マニフェストJSONの目印。js/callStorage.jsのBACKUP_FILE_TYPEと同じ考え方
// （中身のtypeフィールドで、ファイル名に依存せず判別できるようにする）。
export const DATA_PACK_MANIFEST_TYPE = "equal-love-data-pack";

// 現時点でこの実装が読めるマニフェストの構造バージョン。
// 将来マニフェストの形式を変える場合は、この値を上げ、古いバージョンの読み込みを
// 拒否する（対応していないバージョンです、と案内する）想定。
export const LATEST_MANIFEST_SCHEMA_VERSION = 1;

// パックが対象とする範囲。UI側の案内文・結果メッセージの言い回しを出し分けるためだけに使う
// （読み込み処理そのものは、packKindの値で一切分岐しない。どのpackKindでも同じ内容ハッシュ
// 比較方式で新規／スキップ／更新が判定される）。
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
  // packKindは任意項目（本人指示：新規/既存/修正版で入口の説明を分ける）。省略時はincremental
  // 扱い（＝「追加パック」として案内する）にすることで、packKindを持たない旧形式のマニフェスト・
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

  // correctionsフィールドはもう読み込み判定には使わない（2026-08-29、内容ハッシュ比較方式へ
  // 置き換えたため）。ただし、まだ古い形式のマニフェスト（このフィールドを持つパック）が
  // 手元に残っている可能性があるため、フィールドが存在すること自体はエラーにしない
  // （後方互換：中身は見ずに単に無視する）。

  return { valid: errors.length === 0, errors };
}

// 選ばれた全ファイル（FileList、または同等の配列）を読み取り、種類ごとに仕分けて
// 検証する（まだIndexedDBへは一切書き込まない）。
//
// 戻り値: {
//   ok: boolean,                     … マニフェストが見つかり、検証を通ったか
//   fileError: string|null,          … ok=falseのときの理由（マニフェストが無い／複数ある／不正）
//   manifest: object|null,           … 検証済みマニフェスト（okのときのみ）
//   audio: { readyFiles: File[], savableSongIds: string[], newContentHashes: string[],
//             existingContentHashes: (string|null)[] },
//     … readyFiles[i]・savableSongIds[i]・newContentHashes[i]・existingContentHashes[i]は
//       同じ曲についての情報（拡張子.mp3を除いたファイル名がsongIdとして扱われる。
//       このパック内で.mp3として分類された時点でファイル名は既に確定しているため、
//       「未対応ファイル」は生じない）。newContentHashesはパック内のこのファイルの内容ハッシュ、
//       existingContentHashesはこの端末に既にある同じsongIdの内容ハッシュ（無ければnull）
//   lyrics: { readyFiles, warningFiles, failedFiles },   … js/lyricsStorage.jsのanalyzeLyricsFiles()と同じ形
//                                                            （各エントリにnormalizedData.contentHash・
//                                                            existingContentHashを含む）
//   calls: { readySongs, failedSongs } | null,           … コールデータのJSONが無ければnull
//                                                            （readySongsの各要素にcontentHash・
//                                                            existingContentHashを含む）
//   callGuides: { readyGuides, failedGuides } | null,    … コールガイドのJSONが無ければnull
//                                                            （readyGuidesの各要素にcontentHash・
//                                                            existingContentHashを含む）
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
  // （js/audioStorage.jsのimportAudioFiles()と全く同じ命名規則）。中身のバイト列から
  // その場でSHA-256ハッシュを計算し、この端末に既にある音源のハッシュ（1回だけまとめて
  // 取得）と比較できるようにしておく（2026-08-29追加）。84曲分でも数百ms程度で終わる
  // 軽い処理のため、パック読み込みのたびに毎回計算してよい設計にしている。
  const savableSongIds = audioFiles.map((file) => file.name.replace(/\.mp3$/i, ""));
  // 音源が1件も含まれないパック（歌詞だけ・コールだけ等）では、無駄にIndexedDBを
  // 開かないよう早期に空配列で済ませる。
  const existingAudioHashes = audioFiles.length > 0 ? await getAudioContentHashes() : new Map();
  const newAudioHashes = await Promise.all(audioFiles.map((file) => computeSha256Hex(file)));
  const existingAudioContentHashes = savableSongIds.map((songId) => existingAudioHashes.get(songId) ?? null);

  // 歌詞：既存のanalyzeLyricsFiles()をそのまま再利用する（判定ロジックの二重管理を避ける）。
  // 内容ハッシュの計算・既存データとの比較は、analyzeLyricsFiles()内で行われる。
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
    audio: {
      readyFiles: audioFiles,
      savableSongIds,
      newContentHashes: newAudioHashes,
      existingContentHashes: existingAudioContentHashes,
    },
    lyrics: lyricsResult,
    calls: callsResult,
    callGuides: callGuidesResult,
    manifestSongIdsNotCovered,
  };
}

// 「新規」「同一（スキップ）」「内容が違う（更新）」の3通りを判定する共通ヘルパー。
// existingHashがnull（この端末に無い）なら常に"new"。既存があれば、ハッシュが一致すれば
// "identical"、違えば"changed"として扱う（2026-08-29追加）。IndexedDBに一切触れない
// 純粋関数のため、tests/dataPackImport.test.jsで直接テストできるようexportしている。
export function classifyByHash(existingHash, newHash) {
  if (existingHash === null || existingHash === undefined) return "new";
  return existingHash === newHash ? "identical" : "changed";
}

// analyzeDataPack()が検証済みと判定した内容を、実際にIndexedDBへ保存する。
// 警告あり（lyrics.warningFiles）のファイルも、呼び出し側が続行を選んだ前提でそのまま保存する
// （js/main.jsの既存インポートUIと同じ「警告は保存を止めない、事前確認のためだけにある」という方針）。
//
// 【2026-08-29：内容ハッシュ比較方式】データの種類（音源・歌詞・コール・コールガイド）ごとに
// 独立して、この端末に無いもの（新規）は追加、あるが内容が同じもの（identical）はスキップ、
// あるが内容が違うもの（changed）は正式な修正版として上書き保存する。曲IDを手作業で
// 列挙する必要はなく、内容そのもの（SHA-256ハッシュ）から自動的に判定される
// （ファイル冒頭の設計コメント参照）。
//
// 【安全性について】js/audioStorage.js・js/lyricsStorage.js・js/callStorage.js・
// js/callGuideStorage.jsの保存関数（importAudioFiles等）自体は変更していない
// （「音源を読み込む」等、データパックとは別の単体インポートUIが、既存曲の上書き更新に
// 引き続き使えるようにするため）。スキップ判定はこのファイル側で、保存対象を絞り込む
// 形だけで行っている。
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
// correctedXxxIds は、savedXxxIds のうち「この端末に既存データがあったが、内容が違ったため
// 正式な修正版として上書き保存されたID」だけを抜き出した部分集合（本人指示：
// 2026-08-29、「新規追加」と「修正版への更新」をUI上で区別できるようにするため）。
// savedXxxIdsのサブセットであり、別途足し算する必要はない（savedの中に既に含まれている）。
export async function importAnalyzedDataPack(analyzed) {
  const { audio, lyrics, calls, callGuides } = analyzed;

  // 音源：新規・内容が違う（更新）ものだけを保存対象にする。内容が同じもの（identical）は
  // スキップし、無駄な書き込みをしない。
  const audioFilesToSave = [];
  const skippedAudioSongIds = [];
  const changedAudioSongIds = new Set();
  audio.readyFiles.forEach((file, index) => {
    const songId = audio.savableSongIds[index];
    const action = classifyByHash(audio.existingContentHashes[index], audio.newContentHashes[index]);
    if (action === "identical") {
      skippedAudioSongIds.push(songId);
    } else {
      if (action === "changed") changedAudioSongIds.add(songId);
      audioFilesToSave.push(file);
    }
  });
  const audioResult = await importAudioFiles(audioFilesToSave);
  const correctedAudioSongIds = audioResult.savedSongIds.filter((songId) => changedAudioSongIds.has(songId));

  // 歌詞：analyzeLyricsFiles()（analyzeDataPack()内で既に実行済み）が計算したcontentHash・
  // existingContentHashを使う。lyricsFilesToSaveAsFileList()のような再シリアライズを介さず、
  // saveLyricsData()を直接呼ぶことで、正規化済みデータ（contentHash込み）をそのまま保存する
  // （以前は一度JSON文字列に戻して再度importLyricsFiles()へ渡していたが、内容ハッシュを
  // そのまま引き継げるこの形の方が単純で、無駄な再パースも無い）。
  const lyricsFilesAll = [...lyrics.readyFiles, ...lyrics.warningFiles];
  const savedLyricsSongIds = [];
  const skippedLyricsSongIds = [];
  const changedLyricsSongIds = new Set();
  const lyricsFailures = [];
  for (const file of lyricsFilesAll) {
    const songId = file.normalizedData.songId;
    const action = classifyByHash(file.existingContentHash, file.normalizedData.contentHash);
    if (action === "identical") {
      skippedLyricsSongIds.push(songId);
      continue;
    }
    if (action === "changed") changedLyricsSongIds.add(songId);
    const result = await saveLyricsData(file.normalizedData);
    if (result.saved) {
      savedLyricsSongIds.push(songId);
    } else {
      lyricsFailures.push({ fileName: file.fileName, reason: result.errors.join(" / ") });
    }
  }
  const correctedLyricsSongIds = savedLyricsSongIds.filter((songId) => changedLyricsSongIds.has(songId));

  let savedCallSongIds = [];
  let callFailures = [];
  let skippedCallSongIds = [];
  let correctedCallSongIds = [];
  if (calls) {
    const changedCallSongIds = new Set();
    const callSongsToSave = [];
    for (const song of calls.readySongs) {
      const action = classifyByHash(song.existingContentHash, song.contentHash);
      if (action === "identical") {
        skippedCallSongIds.push(song.songId);
      } else {
        if (action === "changed") changedCallSongIds.add(song.songId);
        callSongsToSave.push(song);
      }
    }
    if (callSongsToSave.length > 0) {
      const callImportResult = await importCallDataSongs(callSongsToSave);
      savedCallSongIds = callImportResult.savedSongIds;
      callFailures = callImportResult.saveFailures;
      correctedCallSongIds = savedCallSongIds.filter((songId) => changedCallSongIds.has(songId));
    }
  }

  let savedCallGuideIds = [];
  let callGuideFailures = [];
  let skippedCallGuideIds = [];
  let correctedCallGuideIds = [];
  if (callGuides) {
    const changedCallGuideIds = new Set();
    const guidesToSave = [];
    for (const guide of callGuides.readyGuides) {
      const action = classifyByHash(guide.existingContentHash, guide.contentHash);
      if (action === "identical") {
        skippedCallGuideIds.push(guide.guideId);
      } else {
        if (action === "changed") changedCallGuideIds.add(guide.guideId);
        guidesToSave.push(guide);
      }
    }
    if (guidesToSave.length > 0) {
      const callGuideImportResult = await importCallGuideDataEntries(guidesToSave);
      savedCallGuideIds = callGuideImportResult.savedGuideIds;
      callGuideFailures = callGuideImportResult.saveFailures;
      correctedCallGuideIds = savedCallGuideIds.filter((guideId) => changedCallGuideIds.has(guideId));
    }
  }

  return {
    savedAudioSongIds: audioResult.savedSongIds,
    skippedAudioSongIds,
    correctedAudioSongIds,
    savedLyricsSongIds,
    skippedLyricsSongIds,
    lyricsFailures,
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
