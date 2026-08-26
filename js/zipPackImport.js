// 「追加データパック」を1個のZIPファイルとして配布・読み込みできるようにするための
// ZIP展開処理（2026-08-27新設）。
//
// 【背景・目的】従来の「追加データパックを読み込む」は、manifest.json＋音源mp3＋歌詞JSON…を
// 毎回まとめて選択してもらう方式だった。実際にiPhoneで試すと、ファイル選択画面で保存先まで
// 移動して複数ファイルを選ぶ操作が分かりにくいとの指摘を受けた（本人フィードバック）。
// そこで、あらかじめPC側でZIP1個にまとめておき、利用者はそのZIP1個を選ぶだけで
// 済むようにする（ZIPを展開した中身を、既存のjs/dataPackImport.jsのanalyzeDataPack()へ
// そのまま渡せる形＝File[]へ変換するのがこのファイルの役目）。
//
// 【設計方針：既存の仕組みを一切変更しない】analyzeDataPack()・importAnalyzedDataPack()は
// 「FileList、または同等の配列」を受け取る設計になっており、ファイルの出どころ
// （input[type=file]で選ばれたのかZIPを展開したのか）を関知しない。そのため、この
// ファイルは「ZIPファイル1個 → File[]（配列）」への変換だけを担当し、パックの検証・
// 保存ロジックは一切複製しない。呼び出し側（js/main.js）は、選ばれたファイルが
// ZIP1個だった場合だけこの変換を挟み、それ以外（従来どおりの複数ファイル選択）は
// 今までと全く同じ経路をそのまま通す。
//
// 【外部ライブラリを使わない理由】このプロジェクトは素のJS優先の方針（CLAUDE.md）。
// ZIPの展開自体は、ブラウザ標準のDecompressionStream("deflate-raw")でDEFLATE圧縮分だけ
// 解凍できるため、ZIPのファイル構造（中央ディレクトリ・ローカルファイルヘッダ）だけを
// 自前でパースすれば、外部ライブラリなしで実現できる。
//
// 【対応範囲】このプロジェクトのパックはmanifest.json＋mp3＋歌詞/コールJSONのみを
// フラット（サブフォルダなし）に含む小規模な構成のため、以下のみ対応する。
//   ・圧縮方式：非圧縮（stored, method 0）／DEFLATE（method 8）
//   ・ZIP64（4GB超・65535エントリ超）は非対応（このプロジェクトの用途では発生しない規模）
//   ・暗号化ZIPは非対応
// 上記の範囲外のZIPを渡された場合は、分かりやすいエラーメッセージを投げる。

// ZIPファイルの各種シグネチャ（リトルエンディアン4バイト）。
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

const COMPRESSION_METHOD_STORED = 0;
const COMPRESSION_METHOD_DEFLATE = 8;

// 選ばれたファイルが「ZIPとして扱ってよいか」を、ファイル名の拡張子だけで判定する
// 簡易判定（本人がAirDrop等で受け取った際の細かいMIMEタイプの差異に影響されないよう、
// 拡張子だけを見る。中身が本当にZIPかどうかは、この後の展開処理で確かめる）。
export function isZipFile(file) {
  return /\.zip$/i.test(file.name);
}

// ZIPファイル（1個のFile）を展開し、中に入っていたファイルをFile[]として返す。
// 既存のanalyzeDataPack()にそのまま渡せる形にするのが目的なので、ディレクトリ構造は捨て、
// ベースファイル名だけを使う（このプロジェクトのパックはフラット構成のため）。
export async function extractZipToFiles(zipFile) {
  const buffer = await zipFile.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  const eocd = findEndOfCentralDirectory(view);
  const entries = readCentralDirectoryEntries(view, eocd);

  const files = [];
  for (const entry of entries) {
    // ディレクトリエントリ（末尾が"/"）や、macOS特有の付随ファイルは中身として扱わない。
    if (entry.fileName.endsWith("/")) continue;
    const baseName = entry.fileName.split(/[/\\]/).pop();
    if (!baseName || baseName === ".DS_Store" || entry.fileName.startsWith("__MACOSX/")) continue;

    const rawBytes = await readEntryData(view, bytes, entry);
    files.push(new File([rawBytes], baseName));
  }

  if (files.length === 0) {
    throw new Error("ZIP内にファイルが見つかりませんでした");
  }
  return files;
}

// End Of Central Directory（EOCD）レコードを、ファイル末尾から探す。
// コメント欄（可変長・最大65535バイト）があるため、末尾から一定範囲を逆方向に走査する。
function findEndOfCentralDirectory(view) {
  const maxCommentLength = 65535;
  const minSearchOffset = Math.max(0, view.byteLength - 22 - maxCommentLength);
  for (let offset = view.byteLength - 22; offset >= minSearchOffset; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return {
        entryCount: view.getUint16(offset + 10, true),
        centralDirectorySize: view.getUint32(offset + 12, true),
        centralDirectoryOffset: view.getUint32(offset + 16, true),
      };
    }
  }
  throw new Error("ZIPとして正しく認識できませんでした（終端レコードが見つかりません）");
}

// 中央ディレクトリの各エントリ（ファイルごとの情報）を読み取る。
function readCentralDirectoryEntries(view, eocd) {
  const entries = [];
  let offset = eocd.centralDirectoryOffset;

  for (let i = 0; i < eocd.entryCount; i += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw new Error("ZIPの中央ディレクトリが壊れています");
    }
    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const fileNameBytes = new Uint8Array(view.buffer, offset + 46, fileNameLength);
    const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

    entries.push({ fileName, compressionMethod, compressedSize, localHeaderOffset });

    offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
  }
  return entries;
}

// 1エントリ分の実データを取り出し、必要なら解凍する。
// 圧縮後サイズは中央ディレクトリの値を正として使う（ローカルヘッダ側の値は、
// 一部のZIP実装ではデータディスクリプタ使用時に0のままのことがあるため信用しない）。
async function readEntryData(view, bytes, entry) {
  if (view.getUint32(entry.localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error(`ZIPのローカルファイルヘッダが壊れています（${entry.fileName}）`);
  }
  const localFileNameLength = view.getUint16(entry.localHeaderOffset + 26, true);
  const localExtraFieldLength = view.getUint16(entry.localHeaderOffset + 28, true);
  const dataOffset = entry.localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
  const compressedBytes = bytes.slice(dataOffset, dataOffset + entry.compressedSize);

  if (entry.compressionMethod === COMPRESSION_METHOD_STORED) {
    return compressedBytes;
  }
  if (entry.compressionMethod === COMPRESSION_METHOD_DEFLATE) {
    return await inflateRawDeflate(compressedBytes);
  }
  throw new Error(`対応していない圧縮方式です（${entry.fileName}）。ZIP作成時は圧縮なしかDEFLATEを使ってください`);
}

// DEFLATE圧縮されたバイト列を、ブラウザ標準のDecompressionStreamで解凍する。
async function inflateRawDeflate(compressedBytes) {
  const stream = new Blob([compressedBytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
}
