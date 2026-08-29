// callGuideStorage.js（コールガイド本文の保存・全端末間の書き出し／読み込み）のテスト。
// DOM・IndexedDBに一切触れない純粋関数だけを対象にする。
// 著作権保護のため、テストではダミー文言のみを使う。

import {
  validateCallGuideData,
  validateCallGuideBackupFile,
  computeCallGuideContentHash,
} from "../js/callGuideStorage.js";
import { assertEqual } from "./test-utils.js";

export async function runCallGuideStorageTests() {
  // ---- validateCallGuideData ----
  assertEqual(
    validateCallGuideData({
      guideId: "english-mix",
      name: "英語MIX",
      category: "mix",
      songIds: null,
      textLines: ["ダミー1", "ダミー2"],
      pronunciationLines: [],
    }).valid,
    true,
    "既存guideIdの正しい形のレコードは受理される"
  );
  assertEqual(
    validateCallGuideData({
      guideId: "",
      name: "英語MIX",
      category: "mix",
      textLines: [],
      pronunciationLines: [],
    }).valid,
    false,
    "guideIdが空文字なら拒否される"
  );
  assertEqual(
    validateCallGuideData({
      guideId: "english-mix",
      name: "",
      category: "mix",
      textLines: [],
      pronunciationLines: [],
    }).valid,
    false,
    "名称が空文字なら拒否される"
  );
  assertEqual(
    validateCallGuideData({
      guideId: "english-mix",
      name: "英語MIX",
      category: "mix",
      textLines: "not-an-array",
      pronunciationLines: [],
    }).valid,
    false,
    "textLinesが配列でなければ拒否される"
  );
  assertEqual(
    validateCallGuideData({
      guideId: "english-mix",
      name: "英語MIX",
      category: "mix",
      textLines: [],
      pronunciationLines: "not-an-array",
    }).valid,
    false,
    "pronunciationLinesが配列でなければ拒否される"
  );
  assertEqual(
    validateCallGuideData({
      guideId: "english-mix",
      name: "英語MIX",
      category: "mix",
      songIds: "not-an-array",
      textLines: [],
      pronunciationLines: [],
    }).valid,
    false,
    "songIdsが配列でなければ拒否される"
  );
  assertEqual(
    validateCallGuideData({
      guideId: "this-guide-id-does-not-exist",
      name: "存在しないガイド",
      category: "mix",
      textLines: [],
      pronunciationLines: [],
    }).valid,
    true,
    "一覧に無いguideIdでも、構造が正しければ保存自体は許可される（警告のみ）"
  );
  assertEqual(
    validateCallGuideData(null).valid,
    false,
    "nullは拒否される"
  );

  // ---- validateCallGuideBackupFile ----
  assertEqual(
    validateCallGuideBackupFile({
      type: "equal-love-call-guide-data",
      schemaVersion: 1,
      exportedAt: "2026-08-06T00:00:00.000Z",
      guides: [],
    }),
    { valid: true, reason: null },
    "正しい形のバックアップファイルは受理される"
  );
  assertEqual(
    validateCallGuideBackupFile(null),
    { valid: false, reason: "JSONとして読み込めませんでした" },
    "nullは拒否される"
  );
  assertEqual(
    validateCallGuideBackupFile({ type: "equal-love-call-data", schemaVersion: 1, guides: [] }),
    { valid: false, reason: "このファイルはコールガイドデータではありません" },
    "typeが違うファイル（通常のコールデータ等）は拒否される"
  );
  assertEqual(
    validateCallGuideBackupFile({ type: "equal-love-call-guide-data", schemaVersion: 999, guides: [] }),
    { valid: false, reason: "対応していないバージョンのコールガイドファイルです" },
    "対応していない先の版のschemaVersionは拒否される"
  );
  assertEqual(
    validateCallGuideBackupFile({ type: "equal-love-call-guide-data", schemaVersion: 1, guides: "not-an-array" }),
    { valid: false, reason: "guidesが配列ではありません" },
    "guidesが配列でなければ拒否される"
  );

  // ---- computeCallGuideContentHash：内容ハッシュ計算（2026-08-29追加、IndexedDBに触れない） ----
  const dummyGuide = {
    guideId: "english-mix",
    name: "英語MIX",
    category: "mix",
    songIds: null,
    textLines: ["ダミー1", "ダミー2"],
    pronunciationLines: [],
  };

  assertEqual(
    await computeCallGuideContentHash(dummyGuide),
    await computeCallGuideContentHash({ ...dummyGuide }),
    "同じ内容なら同じハッシュ値になる"
  );

  assertEqual(
    (await computeCallGuideContentHash(dummyGuide)) ===
      (await computeCallGuideContentHash({ ...dummyGuide, textLines: ["書き換え後のダミー"] })),
    false,
    "本文（textLines）が違えばハッシュ値も変わる"
  );
}
