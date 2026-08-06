// callStorage.js（コールデータの保存・全端末間の書き出し／読み込み）のテスト。
// DOM・IndexedDBに一切触れない純粋関数だけを対象にする。
// 著作権保護のため、コール本文はダミー文言のみを使う。

import { validateCallDataBackupFile } from "../js/callStorage.js";
import { assertEqual } from "./test-utils.js";

export function runCallStorageTests() {
  // ---- 正常系 ----
  assertEqual(
    validateCallDataBackupFile({
      type: "equal-love-call-data",
      schemaVersion: 1,
      exportedAt: "2026-08-06T00:00:00.000Z",
      songs: [{ songId: "dummy-song", calls: [{ type: "mix", text: "ダミー", start: 1, end: 2 }] }],
    }),
    { valid: true, reason: null },
    "正しい形のバックアップファイルは受理される"
  );

  // songsが空配列でも、ファイル自体の形としては受理する（曲単位の判定は別関数の役割）
  assertEqual(
    validateCallDataBackupFile({ type: "equal-love-call-data", schemaVersion: 1, songs: [] }),
    { valid: true, reason: null },
    "songsが空配列でもファイルの形としては受理される"
  );

  // ---- 異常系：ファイルの形そのものが不正 ----
  assertEqual(
    validateCallDataBackupFile(null),
    { valid: false, reason: "JSONとして読み込めませんでした" },
    "nullは拒否される"
  );
  assertEqual(
    validateCallDataBackupFile("文字列"),
    { valid: false, reason: "JSONとして読み込めませんでした" },
    "オブジェクトでない値は拒否される"
  );
  assertEqual(
    validateCallDataBackupFile({}),
    { valid: false, reason: "このファイルはコールデータではありません" },
    "typeが無いファイルは拒否される（歌詞JSON等の誤選択を想定）"
  );
  assertEqual(
    validateCallDataBackupFile({ type: "equal-love-lyrics-data", schemaVersion: 1, songs: [] }),
    { valid: false, reason: "このファイルはコールデータではありません" },
    "typeが違うファイルは拒否される"
  );
  assertEqual(
    validateCallDataBackupFile({ type: "equal-love-call-data", schemaVersion: 999, songs: [] }),
    { valid: false, reason: "対応していないバージョンのコールデータファイルです" },
    "対応していない先の版のschemaVersionは拒否される"
  );
  assertEqual(
    validateCallDataBackupFile({ type: "equal-love-call-data", schemaVersion: "1", songs: [] }),
    { valid: false, reason: "対応していないバージョンのコールデータファイルです" },
    "schemaVersionが数値でなければ拒否される"
  );
  assertEqual(
    validateCallDataBackupFile({ type: "equal-love-call-data", schemaVersion: 1, songs: "songs" }),
    { valid: false, reason: "songsが配列ではありません" },
    "songsが配列でなければ拒否される"
  );
  assertEqual(
    validateCallDataBackupFile({ type: "equal-love-call-data", schemaVersion: 1 }),
    { valid: false, reason: "songsが配列ではありません" },
    "songsが無ければ拒否される"
  );
}
