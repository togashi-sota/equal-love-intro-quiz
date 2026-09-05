// js/audioStorage.js（音源BlobのIndexedDB保存・取得）のテスト。
//
// 【今回追加した理由・2026-09-05】ID3タグ無し音源（mora購入・VLC変換で入手した曲）が
// 一部の環境でNotSupportedErrorになる問題への対応として、取得したBlobを常に
// 「audio/mpeg」というMIMEタイプで返すよう正規化する処理（toPlayableAudioBlob()）を追加した。
// この処理を今後うっかり削除・弱体化させてしまわないよう、恒久的な回帰テストとして残す。
//
// 【純粋関数の部分】toPlayableAudioBlob()自体はDOM・IndexedDBに一切触れない純粋関数のため、
// そこだけを直接テストする（js/dataPackImport.jsのvalidateManifest()等と同じ考え方）。
// 【実際のIndexedDBを使う部分】importAudioFiles()・getAudioBlob()の実際の組み合わせでも
// 正規化が効いていることを確認するため、本物の音源（著作権保護のため使えない）の代わりに、
// 中身は無関係なダミーバイト列を使い、実際のIndexedDB（このテストページのオリジンにしか
// 存在しない、本番とは別のストレージ）へ書き込み・読み出しまで行う。
import { importAudioFiles, getAudioBlob, toPlayableAudioBlob } from "../js/audioStorage.js";
import { computeSha256Hex } from "../js/contentHash.js";
import { assertEqual } from "./test-utils.js";

// 実在の曲IDと衝突しないよう、テスト専用であることが明確なIDを使う
// （tests/audio.test.jsの"test-nonexistent-song-B"等と同じ命名の考え方）。
const TEST_SONG_ID = "test-audio-storage-mime-normalization-song";

export async function runAudioStorageTests() {
  // ==== toPlayableAudioBlob()単体のテスト（純粋関数） ====

  // ---- blob.typeが空文字の場合、audio/mpegへ正規化される ----
  {
    const originalBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "" });
    const normalized = toPlayableAudioBlob(originalBlob);
    assertEqual(normalized.type, "audio/mpeg", "type=空文字のBlobはaudio/mpegへ正規化される");
    assertEqual(
      normalized.originalTypeBeforeNormalization,
      "",
      "正規化前の元のtype（空文字）が診断用プロパティに残る"
    );
  }

  // ---- blob.typeが不適切な値（application/octet-stream等）の場合も正規化される ----
  {
    const originalBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "application/octet-stream" });
    const normalized = toPlayableAudioBlob(originalBlob);
    assertEqual(
      normalized.type,
      "audio/mpeg",
      "type=application/octet-streamのBlobもaudio/mpegへ正規化される"
    );
    assertEqual(
      normalized.originalTypeBeforeNormalization,
      "application/octet-stream",
      "正規化前の元のtypeが診断用プロパティに残る"
    );
  }

  // ---- 既にtype="audio/mpeg"のBlobも、そのまま正しく扱われる（既存動作を壊さない） ----
  {
    const originalBlob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/mpeg" });
    const normalized = toPlayableAudioBlob(originalBlob);
    assertEqual(normalized.type, "audio/mpeg", "既にaudio/mpegのBlobも、そのままaudio/mpegとして扱われる");
  }

  // ---- 中身のバイト列は一切変化しない（SHA-256ハッシュで確認） ----
  {
    // 実際の音源ファイルのような、それなりのサイズ・ランダムな中身のバイト列を用意する
    // （小さすぎる・単調なバイト列だと、たまたま偶然一致してしまうテストになりかねないため）。
    const randomBytes = new Uint8Array(2048);
    crypto.getRandomValues(randomBytes);
    const originalBlob = new Blob([randomBytes], { type: "" });

    const originalHash = await computeSha256Hex(originalBlob);
    const normalized = toPlayableAudioBlob(originalBlob);
    const normalizedHash = await computeSha256Hex(normalized);

    assertEqual(
      normalizedHash,
      originalHash,
      "new Blob([blob], {type})でラップしても、中身のバイト列（SHA-256ハッシュ）は一切変化しない"
    );
    assertEqual(normalized.size, originalBlob.size, "正規化後もBlobのサイズ（バイト数）は変化しない");
  }

  // ---- nullを渡した場合はそのままnullを返す（未読み込みの曲の扱いを壊さない） ----
  assertEqual(toPlayableAudioBlob(null), null, "nullを渡した場合はnullのまま返す（未読み込み曲の扱いに影響しない）");

  // ==== 実際のIndexedDBを経由した統合テスト ====
  // importAudioFiles()で保存 → getAudioBlob()で取得、という実際の経路を通しても
  // 正規化が効いていることを確認する（中身は著作権に関係の無いダミーバイト列を使う）。
  {
    const dummyBytes = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55]);
    // ブラウザによってはinput[type=file]経由で選ばれた.mp3にtypeが付かないことがある実態を
    // 再現するため、あえてtypeを空文字にしたFileを使う。
    const dummyFile = new File([dummyBytes], `${TEST_SONG_ID}.mp3`, { type: "" });

    const { savedSongIds } = await importAudioFiles([dummyFile]);
    assertEqual(savedSongIds, [TEST_SONG_ID], "importAudioFiles()がテスト用のダミー曲を保存できる");

    const retrievedBlob = await getAudioBlob(TEST_SONG_ID);
    assertEqual(
      retrievedBlob?.type,
      "audio/mpeg",
      "IndexedDBに保存→getAudioBlob()で取得、という実際の経路でも、返るBlobのtypeはaudio/mpegに正規化されている"
    );

    const retrievedHash = await computeSha256Hex(retrievedBlob);
    const originalHash = await computeSha256Hex(dummyFile);
    assertEqual(
      retrievedHash,
      originalHash,
      "IndexedDBへの保存・取得・正規化を経ても、中身のバイト列（SHA-256ハッシュ）は元のファイルと完全に一致する"
    );
  }

  // ---- 未読み込みの曲（存在しないsongId）は、正規化の影響を受けずnullのまま ----
  {
    const notImportedBlob = await getAudioBlob("test-audio-storage-song-that-was-never-imported");
    assertEqual(notImportedBlob, null, "未読み込みの曲はnullのまま返る（正規化処理がnullを別の値に変えたりしない）");
  }
}
