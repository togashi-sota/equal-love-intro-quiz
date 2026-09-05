// 音源再生中にIndexedDBが例外を投げた場合に、無言のまま失敗せず必ずonError()が
// 呼ばれることの回帰防止テスト（2026-09-06、長時間耐久検証PHASE Gで発見）。
//
// 【発見の経緯】js/audioStorage.jsのgetAudioBlobOnce()・getAudioBlob()は、IndexedDBが
// 開けない・トランザクションが失敗する等の例外を意図的にもみ消さず、呼び出し元へ
// そのまま伝える設計（audioStorage.js自身のコメントに明記）。しかし呼び出し元の
// js/audio.jsのacquireBlobForNewPlayback()にはこの例外を受け止める仕組みが無く、
// さらにその呼び出し元js/main.jsはplaySongIntro()をawaitしない設計だったため、
// 実際にIndexedDBが例外を投げると未処理のPromise rejectionとなり、「エラーメッセージが
// 一切出ないまま曲が鳴らない」という本人に何も伝わらない無言の失敗になっていた
// （3層＝audioStorage.js→audio.js→main.jsのどこにも受け止め先が無いことをソースを
// 実際にたどって確認済み）。
//
// 【修正】js/audio.jsのacquireBlobForNewPlayback()でgetAudioBlob()の例外を捕捉し、
// {indexedDbError: true}を返すようにした。playSongIntro()・playSongFromRandomPosition()の
// 両方が、既存のonError()コールバック（音源未読み込み時と同じ通知経路）へ
// 「音源データの読み込み中にエラーが発生しました」を流し込むようにし、少なくとも
// 「何かが起きて再生できなかった」ことは必ず本人に伝わるようにした。
//
// 【なぜソーステキストの構造チェックなのか】js/audio.jsは実際のIndexedDB例外を
// スクリプトから狙って発生させることが難しく（ブラウザのIndexedDB実装内部のエラーを
// 確実に再現する手段がテスト環境に無い）、tests/audio.test.jsの既存テストも
// 同様の理由でPromiseの状態管理など「play()の成否に関係なく成り立つ部分」だけを
// 検証する方針を取っている（同ファイル冒頭コメント参照）。
import { assertEqual } from "./test-utils.js";

export async function runAudioIndexedDbErrorRegressionTests() {
  const response = await fetch("js/audio.js");
  const source = await response.text();
  assertEqual(source.length > 500, true, "js/audio.jsのソースを取得できた（前提条件）");

  const fnStart = source.indexOf("async function acquireBlobForNewPlayback(song) {");
  assertEqual(fnStart !== -1, true, "acquireBlobForNewPlayback()が存在する（前提条件）");
  const fnBody = source.slice(fnStart, fnStart + 1400);

  assertEqual(
    fnBody.includes("try {") && fnBody.includes("blob = await getAudioBlob(song.id);") && fnBody.includes("} catch (error) {"),
    true,
    "acquireBlobForNewPlayback()がgetAudioBlob()の呼び出しをtry/catchで保護している"
  );
  assertEqual(
    fnBody.includes("indexedDbError: true"),
    true,
    "IndexedDB例外発生時にindexedDbError:trueを返している"
  );

  for (const fnName of ["playSongIntro", "playSongFromRandomPosition"]) {
    const callerStart = source.indexOf(`export async function ${fnName}(`);
    assertEqual(callerStart !== -1, true, `${fnName}()が存在する（前提条件）`);
    const callerBody = source.slice(callerStart, callerStart + 700);
    assertEqual(
      callerBody.includes("indexedDbError") && callerBody.includes("音源データの読み込み中にエラーが発生しました"),
      true,
      `${fnName}()がindexedDbErrorを確認し、onError()でエラーメッセージを表示している`
    );
  }
}
