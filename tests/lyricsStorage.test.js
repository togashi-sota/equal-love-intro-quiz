// lyricsStorage.js（歌詞データの正規化・検証）のテスト。
// IndexedDBへの実際の保存・読み込みは行わず、DBに触れない純粋関数
// （normalizeLyricsData・validateLyricsData）だけを対象にする。
//
// 著作権保護のため、実際の＝LOVEの歌詞本文・実際のタイミングJSONはここには一切含めない。
// すべてダミーの短い文章・機械的に生成した時刻データを使う。

import { normalizeLyricsData, validateLyricsData, classifyLyricsAnalysisResults } from "../js/lyricsStorage.js";
import { assertEqual } from "./test-utils.js";

// songs.jsに実在する曲のid（歌詞本文は使わず、idという識別子だけを使う）。
const EXISTING_SONG_ID = "love";

// 指定した行数分の、ダミー歌詞行を機械的に生成する。
// 1行2秒・行間0.5秒の空白を空けるだけの単純な並びにし、時系列の逆転・重なりが起きないようにしてある。
function buildDummyLines(count) {
  return Array.from({ length: count }, (_, index) => ({
    line: index + 1,
    text: `テスト用ダミー歌詞${index + 1}`,
    start: index * 2,
    end: index * 2 + 1.5,
  }));
}

export function runLyricsStorageTests() {
  // ---- normalizeLyricsData：正常系 ----

  // 現在のPoison Girlの実データと同じ形式（song_id・word_countあり）を想定した、ダミーの外部形式データ。
  const externalFormatSample = {
    song_id: EXISTING_SONG_ID,
    source: "forced-alignment-v1",
    lines: [
      { line: 1, text: "テスト用ダミー歌詞1", start: 0, end: 1.5, word_count: 3 },
      { line: 2, text: "テスト用ダミー歌詞2", start: 2, end: 3.5, word_count: 3 },
    ],
  };

  const normalized = normalizeLyricsData(externalFormatSample);

  assertEqual(normalized !== null, true, "現在のPoison Girl形式（song_id・word_countあり）を正規化できる");
  assertEqual(normalized.songId, EXISTING_SONG_ID, "正規化後にsongIdになる（song_id→songId）");
  assertEqual(
    Object.prototype.hasOwnProperty.call(normalized.lines[0], "word_count"),
    false,
    "不要なword_countが保存形式から除外される"
  );
  assertEqual(normalized.lines[0].text, "テスト用ダミー歌詞1", "text自体は変換後も保持される");

  // ---- validateLyricsData：正常系 ----

  const validRecord = {
    songId: EXISTING_SONG_ID,
    lines: buildDummyLines(3),
    schemaVersion: 1,
  };
  assertEqual(validateLyricsData(validRecord).valid, true, "正常なデータ（3行）は検証を通過する");

  // Poison Girl相当（88行）の規模でも問題なく受け付けられることを確認する。
  const largeRecord = {
    songId: EXISTING_SONG_ID,
    lines: buildDummyLines(88),
    schemaVersion: 1,
  };
  assertEqual(validateLyricsData(largeRecord).valid, true, "88行相当の正常データを受け付ける");

  // 同じsongIdのデータをもう一度保存し直す場合（再インポート）も、同じ基準で検証できることを確認する。
  const reImportRecord = {
    songId: EXISTING_SONG_ID,
    lines: buildDummyLines(3),
    schemaVersion: 1,
  };
  assertEqual(validateLyricsData(reImportRecord).valid, true, "同じsongIdの再保存用データも検証できる");

  // ---- validateLyricsData：異常系（保存を拒否すべきケース） ----

  assertEqual(
    validateLyricsData({ songId: "not-a-real-song-id", lines: buildDummyLines(2), schemaVersion: 1 }).valid,
    false,
    "存在しないsongIdは拒否される"
  );

  assertEqual(
    validateLyricsData({ songId: EXISTING_SONG_ID, lines: "not-an-array", schemaVersion: 1 }).valid,
    false,
    "linesが配列でない場合は拒否される"
  );

  assertEqual(
    validateLyricsData({ songId: EXISTING_SONG_ID, lines: [], schemaVersion: 1 }).valid,
    false,
    "linesが空の場合は拒否される"
  );

  {
    const lines = buildDummyLines(2);
    lines[1].text = "   ";
    assertEqual(
      validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 }).valid,
      false,
      "textが空文字（空白のみ含む）の行は拒否される"
    );
  }

  {
    const lines = buildDummyLines(2);
    lines[1].start = "abc";
    assertEqual(
      validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 }).valid,
      false,
      "start/endが数値でない場合は拒否される"
    );
  }

  {
    const lines = buildDummyLines(2);
    lines[0].start = -1;
    assertEqual(
      validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 }).valid,
      false,
      "負の時間が含まれる場合は拒否される"
    );
  }

  {
    const lines = buildDummyLines(2);
    lines[0].end = lines[0].start;
    assertEqual(
      validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 }).valid,
      false,
      "endがstart以下の場合は拒否される"
    );
  }

  {
    // 2行目・3行目のlineがどちらも2（重複）で、本来あるべき3が存在しない状態。
    const lines = buildDummyLines(3);
    lines[2].line = 2;
    assertEqual(
      validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 }).valid,
      false,
      "行番号が重複している場合は拒否される"
    );
  }

  {
    // 1,2,4と続き、3が欠落している状態。
    const lines = buildDummyLines(3);
    lines[2].line = 4;
    assertEqual(
      validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 }).valid,
      false,
      "行番号が欠落している場合は拒否される"
    );
  }

  {
    // 2行目の開始時刻が1行目より早く、時系列が逆転している状態。
    const lines = buildDummyLines(2);
    lines[0].start = 5;
    lines[0].end = 6.5;
    lines[1].start = 1;
    lines[1].end = 2.5;
    assertEqual(
      validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 }).valid,
      false,
      "開始時刻が前の行より早い（時系列の逆転）場合は拒否される"
    );
  }

  // ---- validateLyricsData：警告（保存は可能だが確認してほしいケース） ----

  {
    // 2行目の開始が1行目の終わりより早く、時間的に重なっている状態（ハモリ等を想定）。
    const lines = buildDummyLines(2);
    lines[1].start = lines[0].end - 0.5;
    const result = validateLyricsData({ songId: EXISTING_SONG_ID, lines, schemaVersion: 1 });
    assertEqual(result.valid, true, "行同士が時間的に重なっていても、エラーではなく保存は可能");
    assertEqual(result.warnings.length > 0, true, "行同士が時間的に重なっている場合は警告が出る");
  }

  // ---- classifyLyricsAnalysisResults：複数ファイルの振り分け ----
  // analyzeLyricsFiles()が実際のファイル・IndexedDBから作る中間データを、
  // 手作りのダミーで再現してテストする（この関数自体はIndexedDBに触れない）。

  {
    const perFileResults = [
      {
        fileName: "ok.json",
        status: "ready",
        songId: EXISTING_SONG_ID,
        normalizedData: { songId: EXISTING_SONG_ID, lines: buildDummyLines(2), schemaVersion: 1 },
        warnings: [],
        isUpdate: false,
      },
      {
        fileName: "broken.json",
        status: "failed",
        errors: ["JSONとして読み込めませんでした"],
      },
    ];
    const { readyFiles, warningFiles, failedFiles } = classifyLyricsAnalysisResults(perFileResults);
    assertEqual(readyFiles.length, 1, "問題ないファイルはreadyFilesに振り分けられる");
    assertEqual(warningFiles.length, 0, "警告のないファイルはwarningFilesに入らない");
    assertEqual(failedFiles.length, 1, "失敗したファイルはfailedFilesに振り分けられる");
  }

  {
    const perFileResults = [
      {
        fileName: "with-warning.json",
        status: "warning",
        songId: EXISTING_SONG_ID,
        normalizedData: { songId: EXISTING_SONG_ID, lines: buildDummyLines(2), schemaVersion: 1 },
        warnings: ["2行目が前の行と時間的に重なっています"],
        isUpdate: true,
      },
    ];
    const { readyFiles, warningFiles } = classifyLyricsAnalysisResults(perFileResults);
    assertEqual(readyFiles.length, 0, "警告のあるファイルはreadyFilesに入らない");
    assertEqual(warningFiles.length, 1, "警告のあるファイルはwarningFilesに振り分けられる");
    assertEqual(warningFiles[0].isUpdate, true, "isUpdate（新規/更新の判定）がそのまま引き継がれる");
  }

  {
    // 同じ曲（songId）のファイルが2つ同時に選ばれている状態。
    const perFileResults = [
      {
        fileName: "old-version.json",
        status: "ready",
        songId: EXISTING_SONG_ID,
        normalizedData: { songId: EXISTING_SONG_ID, lines: buildDummyLines(2), schemaVersion: 1 },
        warnings: [],
        isUpdate: false,
      },
      {
        fileName: "new-version.json",
        status: "ready",
        songId: EXISTING_SONG_ID,
        normalizedData: { songId: EXISTING_SONG_ID, lines: buildDummyLines(3), schemaVersion: 1 },
        warnings: [],
        isUpdate: false,
      },
    ];
    const { readyFiles, failedFiles } = classifyLyricsAnalysisResults(perFileResults);
    assertEqual(readyFiles.length, 0, "同じsongIdが重複している場合、どちらもreadyFilesに入らない");
    assertEqual(failedFiles.length, 2, "同じsongIdが重複している場合、両方ともfailedFilesに振り分けられる");
  }

  {
    // 同じsongIdの重複判定は、既に失敗しているファイルの分は数えない
    // （songIdが取得できていない失敗ファイルが、他の正常な曲を巻き込まないことの確認）。
    const perFileResults = [
      {
        fileName: "broken.json",
        status: "failed",
        errors: ["songIdが見つからないなど、想定した形式ではありません"],
      },
      {
        fileName: "ok.json",
        status: "ready",
        songId: EXISTING_SONG_ID,
        normalizedData: { songId: EXISTING_SONG_ID, lines: buildDummyLines(2), schemaVersion: 1 },
        warnings: [],
        isUpdate: false,
      },
    ];
    const { readyFiles, failedFiles } = classifyLyricsAnalysisResults(perFileResults);
    assertEqual(readyFiles.length, 1, "songIdを持たない失敗ファイルは、他の正常なファイルを巻き込まない");
    assertEqual(failedFiles.length, 1, "失敗ファイル自体はfailedFilesに残る");
  }
}
