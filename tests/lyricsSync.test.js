// lyricsSync.js（同期歌詞表示）のテスト。
// DOM・音源・IndexedDBに一切触れない純粋関数findActiveLineIndex()だけを対象にする。
// 著作権保護のため、ここでもダミーの短い文章だけを使う（実際の歌詞本文は一切含めない）。

import { findActiveLineIndex } from "../js/lyricsSync.js";
import { assertEqual } from "./test-utils.js";

// 1行2秒・行間0.5秒の空白を空けた、重なりのないダミー行を機械的に生成する。
function buildDummyLines(count) {
  return Array.from({ length: count }, (_, index) => ({
    start: index * 2,
    end: index * 2 + 1.5,
  }));
}

export function runLyricsSyncTests() {
  const lines = buildDummyLines(3); // [0,1.5) [2,3.5) [4,5.5)

  // ---- 正常系：1行だけが該当するケース ----
  assertEqual(findActiveLineIndex(lines, 0), 0, "曲の先頭（1行目の開始時刻）は1行目が該当する");
  assertEqual(findActiveLineIndex(lines, 1.0), 0, "1行目の途中は1行目が該当する");
  assertEqual(findActiveLineIndex(lines, 2.0), 1, "2行目の開始時刻ちょうどは2行目が該当する");
  assertEqual(findActiveLineIndex(lines, 5.0), 2, "3行目の途中は3行目が該当する");

  // ---- 行間（空白区間）では該当なし ----
  assertEqual(findActiveLineIndex(lines, 1.5), -1, "1行目のend（境界）は該当なし（endは含まない）");
  assertEqual(findActiveLineIndex(lines, 1.8), -1, "1行目と2行目の間の空白区間は該当なし");
  assertEqual(findActiveLineIndex(lines, 3.6), -1, "2行目と3行目の間の空白区間は該当なし");

  // ---- 開始前・終了後 ----
  assertEqual(findActiveLineIndex(lines, -1), -1, "曲の先頭より前（負の時刻）は該当なし");
  assertEqual(findActiveLineIndex(lines, 100), -1, "最後の行のendより後は該当なし");

  // ---- 行が空の場合 ----
  assertEqual(findActiveLineIndex([], 5), -1, "linesが空の場合は該当なし");

  // ---- 行同士が重なっている場合：最後に開始した行を採用する ----
  {
    const overlappingLines = [
      { start: 0, end: 3 },
      { start: 1.5, end: 4 },
    ];
    assertEqual(
      findActiveLineIndex(overlappingLines, 2.0),
      1,
      "2行が重なっている区間では、最後に開始した行（後ろのインデックス）が採用される"
    );
    assertEqual(
      findActiveLineIndex(overlappingLines, 0.5),
      0,
      "重なる前の区間では、開始している1行目だけが該当する"
    );
  }

  {
    // 3行が同時に重なっている、より極端なケース。
    const tripleOverlap = [
      { start: 0, end: 5 },
      { start: 1, end: 5 },
      { start: 2, end: 5 },
    ];
    assertEqual(
      findActiveLineIndex(tripleOverlap, 3),
      2,
      "3行が重なっている場合も、最後に開始した行（インデックス2）が採用される"
    );
  }
}
