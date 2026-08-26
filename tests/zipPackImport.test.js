// js/zipPackImport.js（ZIP1個にまとめられた追加データパックの展開）のテスト。
//
// 【テスト用ZIPを自前で組み立てている理由】ディスク上に固定のZIPフィクスチャファイルを
// 置く方法もあるが、著作権データを含まないダミーの中身（"hello world"程度の文字列）しか
// 使わないため、テストのたびにその場でZIPバイト列を組み立てる方式にした。こうすることで、
// 「非圧縮(stored)」「DEFLATE圧縮」の両方の組み合わせを1テストの中で自由に検証できる。
// ZIP圧縮にはブラウザ標準のCompressionStream("deflate-raw")を使う（js/zipPackImport.js側の
// DecompressionStream("deflate-raw")と対になる、標準の圧縮API）。

import { isZipFile, extractZipToFiles } from "../js/zipPackImport.js";
import { assertEqual } from "./test-utils.js";

function uint16LE(n) {
  return [n & 0xff, (n >> 8) & 0xff];
}
function uint32LE(n) {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

async function deflateRaw(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const arrayBuffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// entries: [{ name, content, method: "stored" | "deflate" }]
// js/zipPackImport.jsが読めるフィールド配置に合わせて、ZIPのバイト列を1から組み立てる
// （ローカルファイルヘッダ・中央ディレクトリ・終端レコード、各フィールドの並びはZIP仕様どおり）。
async function buildTestZipFile(entries, fileName = "test-pack.zip") {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const contentBytes = encoder.encode(entry.content);
    const isDeflate = entry.method === "deflate";
    const compressedBytes = isDeflate ? await deflateRaw(contentBytes) : contentBytes;
    const compressionMethod = isDeflate ? 8 : 0;

    const localHeaderOffset = offset;
    const localHeader = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04, // ローカルファイルヘッダの目印
      ...uint16LE(20), // 展開に必要なバージョン
      ...uint16LE(0), // 汎用フラグ
      ...uint16LE(compressionMethod),
      ...uint16LE(0), // 更新時刻（テストでは使わない）
      ...uint16LE(0), // 更新日付
      ...uint32LE(0), // CRC-32（js/zipPackImport.jsは検証しないため0のままでよい）
      ...uint32LE(compressedBytes.length),
      ...uint32LE(contentBytes.length),
      ...uint16LE(nameBytes.length),
      ...uint16LE(0), // 拡張フィールド長
    ]);
    localParts.push(localHeader, nameBytes, compressedBytes);
    offset += localHeader.length + nameBytes.length + compressedBytes.length;

    const centralHeader = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02, // 中央ディレクトリの目印
      ...uint16LE(20), // 作成時バージョン
      ...uint16LE(20), // 展開に必要なバージョン
      ...uint16LE(0), // 汎用フラグ
      ...uint16LE(compressionMethod),
      ...uint16LE(0), // 更新時刻
      ...uint16LE(0), // 更新日付
      ...uint32LE(0), // CRC-32
      ...uint32LE(compressedBytes.length),
      ...uint32LE(contentBytes.length),
      ...uint16LE(nameBytes.length),
      ...uint16LE(0), // 拡張フィールド長
      ...uint16LE(0), // コメント長
      ...uint16LE(0), // 分割先頭ディスク番号
      ...uint16LE(0), // 内部属性
      ...uint32LE(0), // 外部属性
      ...uint32LE(localHeaderOffset),
    ]);
    centralParts.push(centralHeader, nameBytes);
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce((sum, part) => sum + part.length, 0);

  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, // 終端レコードの目印
    ...uint16LE(0), // このディスクの番号
    ...uint16LE(0), // 中央ディレクトリが始まるディスク番号
    ...uint16LE(entries.length), // このディスク上の中央ディレクトリ件数
    ...uint16LE(entries.length), // 中央ディレクトリの総件数
    ...uint32LE(centralDirectorySize),
    ...uint32LE(centralDirectoryOffset),
    ...uint16LE(0), // コメント長
  ]);

  return new File([...localParts, ...centralParts, eocd], fileName);
}

export async function runZipPackImportTests() {
  // ---- isZipFile：拡張子による判定 ----
  assertEqual(isZipFile(new File([], "pack.zip")), true, "拡張子.zipのファイルはZIPと判定される");
  assertEqual(isZipFile(new File([], "PACK.ZIP")), true, "拡張子の大文字小文字を区別しない");
  assertEqual(isZipFile(new File([], "manifest.json")), false, "拡張子.zip以外はZIPと判定されない");

  // ---- extractZipToFiles：非圧縮(stored)・DEFLATE圧縮、両方の方式を展開できる ----
  {
    const zipFile = await buildTestZipFile([
      { name: "manifest.json", content: '{"hello":"world"}', method: "stored" },
      { name: "note.txt", content: "a".repeat(500), method: "deflate" },
    ]);
    const extracted = await extractZipToFiles(zipFile);
    assertEqual(extracted.length, 2, "ZIP内の2ファイルがどちらも展開される");

    const manifestFile = extracted.find((f) => f.name === "manifest.json");
    const noteFile = extracted.find((f) => f.name === "note.txt");
    assertEqual(manifestFile !== undefined, true, "非圧縮(stored)ファイルの名前が保持される");
    assertEqual(noteFile !== undefined, true, "DEFLATE圧縮ファイルの名前が保持される");
    assertEqual(await manifestFile.text(), '{"hello":"world"}', "非圧縮ファイルの中身が正しく取り出せる");
    assertEqual(await noteFile.text(), "a".repeat(500), "DEFLATE圧縮ファイルが正しく解凍される");
  }

  // ---- extractZipToFiles：ディレクトリエントリ・サブフォルダの扱い ----
  {
    const zipFile = await buildTestZipFile([
      { name: "folder/", content: "", method: "stored" },
      { name: "folder/inside.json", content: "{}", method: "stored" },
    ]);
    const extracted = await extractZipToFiles(zipFile);
    assertEqual(extracted.length, 1, "ディレクトリエントリ自体は展開結果に含まれない");
    assertEqual(extracted[0].name, "inside.json", "サブフォルダ内のファイルはベース名だけが使われる（フラット化）");
  }

  // ---- extractZipToFiles：異常系 ----
  {
    const brokenFile = new File([new Uint8Array([1, 2, 3, 4])], "broken.zip");
    let threw = false;
    try {
      await extractZipToFiles(brokenFile);
    } catch {
      threw = true;
    }
    assertEqual(threw, true, "ZIPとして壊れたファイル（終端レコードが無い）はエラーになる");
  }
}
