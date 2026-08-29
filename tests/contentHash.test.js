// js/contentHash.js（内容ハッシュ計算の共通ユーティリティ）のテスト。
// SubtleCrypto APIを使う純粋関数だが、DOM・IndexedDBには一切触れない。

import { computeSha256Hex } from "../js/contentHash.js";
import { assertEqual } from "./test-utils.js";

export async function runContentHashTests() {
  // ---- 同じ内容（文字列）なら、常に同じハッシュ値になる ----
  const hashA1 = await computeSha256Hex("テスト用ダミー内容A");
  const hashA2 = await computeSha256Hex("テスト用ダミー内容A");
  assertEqual(hashA1, hashA2, "同じ文字列からは毎回同じハッシュ値が計算される");

  // ---- 内容が1文字でも違えば、ハッシュ値も変わる ----
  const hashB = await computeSha256Hex("テスト用ダミー内容B");
  assertEqual(hashA1 === hashB, false, "内容が違えばハッシュ値も変わる");

  // ---- 戻り値の形式：SHA-256は32バイト＝16進数64文字の文字列になる ----
  assertEqual(hashA1.length, 64, "SHA-256ハッシュは16進数64文字の文字列になる");
  assertEqual(/^[0-9a-f]{64}$/.test(hashA1), true, "ハッシュ値は小文字の16進数だけで構成される");

  // ---- Blob/Fileからも計算できる（音源ファイルのバイト列比較に使うため） ----
  const blobHash1 = await computeSha256Hex(new Blob(["同じ中身のダミーファイル"]));
  const blobHash2 = await computeSha256Hex(new Blob(["同じ中身のダミーファイル"]));
  assertEqual(blobHash1, blobHash2, "同じ中身のBlobからは毎回同じハッシュ値が計算される");
  assertEqual(
    blobHash1,
    await computeSha256Hex("同じ中身のダミーファイル"),
    "文字列として渡した場合と、同じ中身のBlobとして渡した場合で、同じハッシュ値になる"
  );

  const differentBlobHash = await computeSha256Hex(new Blob(["違う中身のダミーファイル"]));
  assertEqual(blobHash1 === differentBlobHash, false, "Blobの中身が違えばハッシュ値も変わる");

  // ---- 既知の入力に対する既知の出力（SHA-256の標準的なテストベクタ）で、実装自体の正しさを確認 ----
  // 空文字列のSHA-256は、どの実装・言語でも必ずこの値になる（Python/Node.js等でも同一）。
  assertEqual(
    await computeSha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "空文字列のSHA-256ハッシュは既知の標準値と一致する（実装の正しさの確認）"
  );
}
