// js/songlist.jsの「収録曲一覧で、読み込み済みなのに再生に失敗した曲をタップしても
// 何も起きたように見えない」問題（2026-09-05修正：ID3タグ無し音源のNotSupportedError対応と
// 合わせて追加した、小さな案内文表示）の回帰防止テスト。
//
// 【なぜ通常の関数呼び出しテストではなく、ソーステキストの構造チェックなのか】
// js/songlist.jsはモジュール読み込み時に#preview-audio等のDOM要素へ直接触れるため、
// tests.htmlのようなDOMを持たないテスト環境から安全にimportできない
// （tests/songlist.test.js冒頭のコメント参照）。この画面全体をテスト環境へ安全に
// importできるようにするための大掛かりな変更は今回の目的ではないため、既存の
// tests/onlineBattleRoomStateRestoreRegression.test.jsと同じ「ソースコードのテキスト構造を
// 直接検査する」方式を踏襲する。
//
// このテストが守りたい不変条件：
//   1. 「音源が未読み込み」（blobがnull）の場合は、案内文を出さず従来どおり静かに何もしない
//      （試聴は補助機能、というエラー表示方針そのものは変えていない）。
//   2. 「音源は読み込み済みなのに再生に失敗した」場合だけ、案内文（.track-playback-error-note）を
//      表示する。
//   3. 行のテンプレート自体に、案内文用の要素が必ず用意されている。
import { assertEqual } from "./test-utils.js";

export async function runSonglistPlaybackErrorNoteTests() {
  const response = await fetch("js/songlist.js");
  const sourceText = await response.text();

  assertEqual(sourceText.length > 1000, true, "js/songlist.jsのソースを取得できた（テストの前提条件）");

  // ---- 行のテンプレートに、案内文用の要素が用意されている ----
  assertEqual(
    sourceText.includes("track-playback-error-note"),
    true,
    "行のテンプレートに.track-playback-error-note要素が存在する"
  );

  // ---- playPreview()内：「未読み込み」の早期returnが、案内文の表示より前にある ----
  {
    const functionStart = sourceText.indexOf("async function playPreview(song, rowElement) {");
    assertEqual(functionStart !== -1, true, "playPreview()関数が存在する（前提条件）");

    // 関数全体を安全に切り出すため、固定長のウィンドウを使う（過去に動的な終端検索で
    // 誤った範囲を切り出してしまった実例があるため、tests/onlineBattleRoomStateRestoreRegression
    // 等と同じく、余裕を持った固定長で切り出す方式を採用する）。
    const functionBody = sourceText.slice(functionStart, functionStart + 2000);

    const blobNullReturnIndex = functionBody.indexOf("if (!blob) return;");
    const noteShowIndex = functionBody.indexOf("setPlaybackErrorNoteVisible(rowElement, true)");

    assertEqual(blobNullReturnIndex !== -1, true, "playPreview()内に「未読み込みなら早期return」の分岐が存在する");
    assertEqual(noteShowIndex !== -1, true, "playPreview()内に案内文を表示する呼び出しが存在する");
    assertEqual(
      blobNullReturnIndex < noteShowIndex,
      true,
      "「未読み込みなら早期return」は、案内文を表示する処理より前に実行される" +
        "（＝未読み込みの曲では案内文が表示されないことの保証）"
    );
  }

  // ---- handlePlayButtonClick()の再開（一時停止からの再生）分岐でも、失敗時に案内文を出す ----
  {
    const functionStart = sourceText.indexOf("function handlePlayButtonClick(song, rowElement) {");
    assertEqual(functionStart !== -1, true, "handlePlayButtonClick()関数が存在する（前提条件）");

    const functionBody = sourceText.slice(functionStart, functionStart + 1500);
    assertEqual(
      functionBody.includes("setPlaybackErrorNoteVisible(rowElement, true)"),
      true,
      "一時停止からの再開に失敗した場合も、案内文を表示する処理が呼ばれる"
    );
  }
}
