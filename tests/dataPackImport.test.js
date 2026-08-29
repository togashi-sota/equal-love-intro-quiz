// js/dataPackImport.js（追加データパックの解析）のテスト。
//
// 【IndexedDBに触れないテストにしている理由】このアプリの既存テスト（tests/callStorage.test.js・
// tests/lyricsStorage.test.jsを参照）は、実際に保存を行う関数（saveCallData・saveLyricsData等）を
// 自動テストからは呼ばない、という方針を一貫して守っている（tests.htmlは実際のブラウザ上で動作し、
// 本番と同じIndexedDBを使うため、自動テストの実行そのものが本番データを汚してしまうことを
// 避けるため）。このファイルも同じ方針を踏襲し、analyzeDataPack()に「歌詞・コールデータの
// JSONファイルを含まないパック」だけを渡す（音源ファイルの分類・マニフェストの検証は
// IndexedDBに一切触れない。歌詞・コールJSONを1件でも含めると、内部でhasLyricsData・
// getCallData（読み取りのみだが実IndexedDBへのアクセスが発生する）が呼ばれてしまうため）。
// 歌詞・コールデータそのものの検証ロジックは、既存のtests/lyricsStorage.test.js・
// tests/callStorage.test.jsで別途テスト済み（analyzeDataPack()は判定を委譲しているだけで、
// 二重に検証ロジックを持たない設計のため、ここで再テストする必要はない）。
//
// 実際にIndexedDBへ書き込むところまでの動作確認（importAnalyzedDataPack）は、
// ダミーデータを使ってブラウザ上で手動確認する（本人指示：ダミーデータでテストする。
// docs/HANDOFF.md 参照）。

import { validateManifest, analyzeDataPack, DATA_PACK_MANIFEST_TYPE, PACK_KIND } from "../js/dataPackImport.js";
import { assertEqual } from "./test-utils.js";

// songs.jsに実在する曲のid（歌詞本文・音源そのものは一切使わず、idという識別子だけを使う）。
const EXISTING_SONG_ID_1 = "love";
const EXISTING_SONG_ID_2 = "start";

function buildValidManifest(overrides = {}) {
  return {
    type: DATA_PACK_MANIFEST_TYPE,
    schemaVersion: 1,
    packId: "test-pack",
    packLabel: "テスト用パック",
    songIds: [EXISTING_SONG_ID_1, EXISTING_SONG_ID_2],
    createdAt: "2026-08-26T00:00:00.000Z",
    ...overrides,
  };
}

function jsonFile(name, data) {
  return new File([JSON.stringify(data)], name, { type: "application/json" });
}

export async function runDataPackImportTests() {
  // ---- validateManifest：正常系 ----
  {
    const { valid, errors } = validateManifest(buildValidManifest());
    assertEqual(valid, true, "正しい形式のマニフェストは検証を通る");
    assertEqual(errors.length, 0, "正しい形式のマニフェストにはエラーが無い");
  }

  // ---- validateManifest：異常系 ----
  assertEqual(validateManifest(null).valid, false, "nullはマニフェストとして無効");
  assertEqual(validateManifest({ type: "not-a-pack" }).valid, false, "typeが違うオブジェクトは無効");
  assertEqual(
    validateManifest(buildValidManifest({ schemaVersion: 999 })).valid,
    false,
    "対応していないschemaVersionは無効"
  );
  assertEqual(validateManifest(buildValidManifest({ packId: "" })).valid, false, "packIdが空だと無効");
  assertEqual(validateManifest(buildValidManifest({ songIds: [] })).valid, false, "songIdsが空だと無効");
  assertEqual(
    validateManifest(buildValidManifest({ songIds: ["存在しない曲id-xyz"] })).valid,
    false,
    "songs.jsに登録されていない曲idを含むと無効"
  );

  // ---- validateManifest：packKind（本人指示：全曲パック/追加パックを同じ仕組みで扱う） ----
  assertEqual(
    validateManifest(buildValidManifest()).valid,
    true,
    "packKindを省略しても（後方互換のため）マニフェストは有効"
  );
  assertEqual(
    validateManifest(buildValidManifest({ packKind: PACK_KIND.FULL })).valid,
    true,
    "packKind: fullは有効な値"
  );
  assertEqual(
    validateManifest(buildValidManifest({ packKind: PACK_KIND.INCREMENTAL })).valid,
    true,
    "packKind: incrementalは有効な値"
  );
  assertEqual(
    validateManifest(buildValidManifest({ packKind: PACK_KIND.CORRECTION })).valid,
    true,
    "packKind: correction（2026-08-29追加、修正版パック用）は有効な値"
  );
  assertEqual(
    validateManifest(buildValidManifest({ packKind: "partial" })).valid,
    false,
    "full/incremental/correction以外のpackKindは無効"
  );

  // ---- validateManifest：corrections（本人指示：2026-08-29、正式な修正版を安全に配布する仕組み） ----
  assertEqual(
    validateManifest(buildValidManifest()).valid,
    true,
    "correctionsを省略しても（後方互換のため）マニフェストは有効"
  );
  assertEqual(
    validateManifest(buildValidManifest({ corrections: { lyrics: [EXISTING_SONG_ID_1] } })).valid,
    true,
    "corrections.lyricsに実在する曲idの配列を指定すれば有効"
  );
  assertEqual(
    validateManifest(
      buildValidManifest({ corrections: { lyrics: [EXISTING_SONG_ID_1], audio: [], calls: [], callGuides: [] } })
    ).valid,
    true,
    "corrections内の全項目（lyrics/audio/calls/callGuides）を指定しても有効"
  );
  assertEqual(
    validateManifest(buildValidManifest({ corrections: ["not", "an", "object"] })).valid,
    false,
    "correctionsが配列（オブジェクトでない）だと無効"
  );
  assertEqual(
    validateManifest(buildValidManifest({ corrections: { lyrics: "boku-no-heroine" } })).valid,
    false,
    "corrections.lyricsが配列でなく文字列単体だと無効"
  );
  assertEqual(
    validateManifest(buildValidManifest({ corrections: { unknownField: [] } })).valid,
    false,
    "correctionsに未対応の項目名があると無効"
  );

  // ---- analyzeDataPack：マニフェストが無い ----
  {
    const result = await analyzeDataPack([jsonFile("readme.json", { hello: "world" })]);
    assertEqual(result.ok, false, "マニフェストが見つからないパックはok:falseになる");
  }

  // ---- analyzeDataPack：マニフェストが複数ある ----
  {
    const result = await analyzeDataPack([
      jsonFile("manifest.json", buildValidManifest()),
      jsonFile("manifest2.json", buildValidManifest({ packId: "another-pack" })),
    ]);
    assertEqual(result.ok, false, "マニフェストが複数あるパックはok:falseになる");
  }

  // ---- analyzeDataPack：マニフェストの中身が壊れている ----
  {
    const result = await analyzeDataPack([jsonFile("manifest.json", buildValidManifest({ songIds: [] }))]);
    assertEqual(result.ok, false, "検証に失敗するマニフェストはok:falseになる");
  }

  // ---- analyzeDataPack：JSONとして読めないファイルは無視される（クラッシュしない） ----
  {
    const brokenFile = new File(["{ これはJSONではない ,,, }"], "broken.json", { type: "application/json" });
    const result = await analyzeDataPack([brokenFile, jsonFile("manifest.json", buildValidManifest())]);
    assertEqual(result.ok, true, "壊れたJSONが混ざっていても、マニフェストさえ正しければ解析は成功する");
  }

  // ---- analyzeDataPack：manifest.json + 音源ファイルの正常系 ----
  {
    const manifest = buildValidManifest({ songIds: [EXISTING_SONG_ID_1, EXISTING_SONG_ID_2] });
    const audioFile1 = new File(["dummy-audio-bytes"], `${EXISTING_SONG_ID_1}.mp3`, { type: "audio/mpeg" });
    const audioFile2 = new File(["dummy-audio-bytes"], `${EXISTING_SONG_ID_2}.mp3`, { type: "audio/mpeg" });

    const result = await analyzeDataPack([jsonFile("manifest.json", manifest), audioFile1, audioFile2]);

    assertEqual(result.ok, true, "manifest.json＋対応するmp3だけのパックは解析に成功する");
    assertEqual(result.manifest.packLabel, "テスト用パック", "解析結果にマニフェストの内容が含まれる");
    assertEqual(
      [...result.audio.savableSongIds].sort(),
      [EXISTING_SONG_ID_1, EXISTING_SONG_ID_2].sort(),
      "mp3ファイル名（拡張子を除いた部分）がsongIdとして認識される"
    );
    assertEqual(
      result.manifestSongIdsNotCovered,
      [],
      "マニフェストのsongIdsが全てファイルでカバーされていれば、不足なしと判定される"
    );
  }

  // ---- analyzeDataPack：マニフェストが挙げる曲の一部にファイルが無い（警告扱い、エラーにはしない） ----
  {
    const manifest = buildValidManifest({ songIds: [EXISTING_SONG_ID_1, EXISTING_SONG_ID_2] });
    const audioFile1 = new File(["dummy-audio-bytes"], `${EXISTING_SONG_ID_1}.mp3`, { type: "audio/mpeg" });

    const result = await analyzeDataPack([jsonFile("manifest.json", manifest), audioFile1]);

    assertEqual(result.ok, true, "一部の曲のファイルが無くても、解析自体はエラーにしない（安全側・部分導入を許可）");
    assertEqual(
      result.manifestSongIdsNotCovered,
      [EXISTING_SONG_ID_2],
      "ファイルが見つからなかった曲idが、manifestSongIdsNotCoveredに残る"
    );
  }

  // ---- analyzeDataPack：想定外の拡張子のファイルは静かに無視される ----
  {
    const manifest = buildValidManifest();
    const unrelatedFile = new File(["dummy"], "readme.txt", { type: "text/plain" });
    const result = await analyzeDataPack([jsonFile("manifest.json", manifest), unrelatedFile]);
    assertEqual(result.ok, true, ".json/.mp3以外の想定外ファイルが混ざっていても解析は成功する");
  }
}
