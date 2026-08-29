// lyricsStorage.js（歌詞データの正規化・検証）のテスト。
// IndexedDBへの実際の保存・読み込みは行わず、DBに触れない純粋関数
// （normalizeLyricsData・validateLyricsData）だけを対象にする。
//
// 著作権保護のため、実際の＝LOVEの歌詞本文・実際のタイミングJSONはここには一切含めない。
// すべてダミーの短い文章・機械的に生成した時刻データを使う。

import {
  normalizeLyricsData,
  validateLyricsData,
  classifyLyricsAnalysisResults,
  parseAndNormalizeLyricsFile,
  computeLyricsContentHash,
} from "../js/lyricsStorage.js";
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

export async function runLyricsStorageTests() {
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

  // ---- parseAndNormalizeLyricsFile：Step2のインポートUIとdev/lyricsEditor.htmlが
  // 共通で使う、1ファイル分の読み取り窓口のテスト。実際のFile APIを使うため非同期。

  {
    const validJson = JSON.stringify({
      song_id: EXISTING_SONG_ID,
      lines: [{ line: 1, text: "テスト用ダミー歌詞1", start: 0, end: 1.5 }],
    });
    const file = new File([validJson], "sample.json", { type: "application/json" });
    const result = await parseAndNormalizeLyricsFile(file);
    assertEqual(result.normalized !== null, true, "正常なJSONファイルは正規化される");
    assertEqual(result.normalized.songId, EXISTING_SONG_ID, "正規化後にsongIdになる（song_id→songId）");
    assertEqual(result.reason, null, "正常なファイルではreasonがnullになる");
  }

  {
    const file = new File(["{ this is not valid json,,, }"], "broken.json", { type: "application/json" });
    const result = await parseAndNormalizeLyricsFile(file);
    assertEqual(result.normalized, null, "壊れたJSONは正規化されずnullになる");
    assertEqual(result.reason, "JSONとして読み込めませんでした", "壊れたJSONの理由が正しく返る");
  }

  {
    const invalidShapeJson = JSON.stringify({ foo: "bar" }); // songId/song_idのどちらも持たない
    const file = new File([invalidShapeJson], "no-song-id.json", { type: "application/json" });
    const result = await parseAndNormalizeLyricsFile(file);
    assertEqual(result.normalized, null, "songIdを持たないJSONは正規化されずnullになる");
  }

  {
    // 5MBの上限を超えるダミーファイル（中身はJSONとして無効な文字列でよい。
    // サイズ超過チェックはJSON.parseより先に行われるため、内容の正しさは関係ない）。
    const oversizedContent = "a".repeat(6 * 1024 * 1024);
    const file = new File([oversizedContent], "too-big.json", { type: "application/json" });
    const result = await parseAndNormalizeLyricsFile(file);
    assertEqual(result.normalized, null, "5MBを超えるファイルは正規化されずnullになる");
    assertEqual(
      result.reason.includes("ファイルサイズ"),
      true,
      "サイズ超過の理由が含まれる"
    );
  }

  // ---- computeLyricsContentHash：内容ハッシュ計算（2026-08-29追加、IndexedDBに触れない） ----

  {
    const recordA = { songId: EXISTING_SONG_ID, lines: buildDummyLines(3) };
    const recordB = { songId: EXISTING_SONG_ID, lines: buildDummyLines(3) };
    assertEqual(
      await computeLyricsContentHash(recordA),
      await computeLyricsContentHash(recordB),
      "同じ内容（songId・lines）なら同じハッシュ値になる"
    );
  }

  {
    const original = { songId: EXISTING_SONG_ID, lines: buildDummyLines(3) };
    const oneLineChanged = { songId: EXISTING_SONG_ID, lines: buildDummyLines(3) };
    oneLineChanged.lines[1].text = "テスト用ダミー歌詞（書き換え後）";
    assertEqual(
      (await computeLyricsContentHash(original)) === (await computeLyricsContentHash(oneLineChanged)),
      false,
      "1行だけ内容を書き換えても、ハッシュ値は変わる（『僕のヒロイン』事故のような部分的な誤りも検出できることの確認）"
    );
  }

  {
    // updatedAt・schemaVersion・contentHash自身のような「内容そのものではない」項目は、
    // ハッシュ計算の対象に含まれないことの確認（保存し直しただけで別内容扱いにならないように）。
    const withoutMeta = { songId: EXISTING_SONG_ID, lines: buildDummyLines(2) };
    const withMeta = {
      songId: EXISTING_SONG_ID,
      lines: buildDummyLines(2),
      schemaVersion: 1,
      updatedAt: 1234567890,
      contentHash: "dummy-should-be-ignored",
    };
    assertEqual(
      await computeLyricsContentHash(withoutMeta),
      await computeLyricsContentHash(withMeta),
      "schemaVersion・updatedAt・contentHash自身はハッシュ計算の対象外（songId・linesの内容だけを見る）"
    );
  }

  {
    // JSON整形の違い（オブジェクトのキーの並び順を変えて渡す等）に影響されないことの確認。
    const lines = [{ text: "テスト用ダミー歌詞1", line: 1, end: 1.5, start: 0 }]; // わざとキー順を変える
    const canonicalOrderLines = [{ line: 1, text: "テスト用ダミー歌詞1", start: 0, end: 1.5 }];
    assertEqual(
      await computeLyricsContentHash({ songId: EXISTING_SONG_ID, lines }),
      await computeLyricsContentHash({ songId: EXISTING_SONG_ID, lines: canonicalOrderLines }),
      "各行のキーの並び順が違っても、内容が同じなら同じハッシュ値になる（固定順に正規化してから計算するため）"
    );
  }
}
