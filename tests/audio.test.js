// js/audio.js（クイズ本編の音源再生・iOS自動再生ブロック回避のunlock処理）のテスト。
//
// 【このテストで検証できること／できないこと】
// iOS Safari固有の「自動再生が実際に許可されるかどうか」そのものは、この環境
// （デスクトップブラウザ上のtests.html）では再現できない。また、このページでのplay()
// 呼び出しはユーザー操作（クリック等）を伴わないスクリプト実行のため、ブラウザの
// 自動再生ポリシーにより、無音データURIのplay()自体がここでは失敗する（NotAllowedError等）
// 可能性が高い。
// そのため、このテストは「play()が成功したか失敗したか」そのものは一切assertしない。
// 代わりに、attemptSilentUnlock()・ensureUnlockSettled()が守るべき「Promiseの状態管理・
// 待ち合わせの順序・世代番号（token）の扱い」という、play()の成否に関係なく常に成り立つ
// べき部分（=このファイル内で完結する純粋なPromise/state制御ロジック）だけを検証する。
//
// 【DOM要素について】js/audio.jsはモジュール読み込み時に一度だけ
// document.getElementById("intro-audio")を取得する。tests.htmlには本編（index.html）と
// 同じid="intro-audio"の<audio>要素を追加してあるので、audioElementがnullにならず、
// 実際のHTMLMediaElementとしてテストできる。
import {
  attemptSilentUnlock,
  ensureUnlockSettled,
  getAudioUnlockDiagnostics,
  playSongIntro,
  getCurrentPlaybackState,
} from "../js/audio.js";
import { assertEqual } from "./test-utils.js";

const audioElement = document.getElementById("intro-audio");

// 無音unlock専用データURI（js/audio.js内のSILENT_UNLOCK_DATA_URIと同じ値）。
// js/audio.js側は非公開の定数のためexportされていない。このファイルが実際にsrcの
// 中身まで比較検証する必要があるため、同じ文字列をここにも用意する（値がズレると
// このテスト自体が誤って失敗するので、js/audio.js側を変更したときはここも合わせて直すこと）。
const SILENT_UNLOCK_DATA_URI = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ensureUnlockSettled()がいつまでも先に進まない（ハングする）事故が無いことを保証するため、
// タイムアウト付きで待つ。iOS実機と違い、ここでのplay()は自動再生ポリシーで拒否される
// 可能性が高いが、attemptSilentUnlock()側は失敗もcatchしてresolveする設計のはずなので、
// 本来は数十ms～数百ms程度で解決するはず。5秒経っても解決しなければ設計上の異常とみなす。
async function waitWithTimeout(promise, timeoutMs, timeoutLabel) {
  let timeoutId;
  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(timeoutLabel), timeoutMs);
  });
  const result = await Promise.race([promise.then(() => "resolved"), timeoutPromise]);
  clearTimeout(timeoutId);
  return result;
}

export async function runAudioTests() {
  if (!audioElement) {
    // tests.htmlの構成が変わり#intro-audio要素が見つからない場合、以降のテストは
        // 意味を成さないため、その旨だけ記録して打ち切る（他のテストへは影響させない）。
    assertEqual(true, false, "tests.htmlに#intro-audio要素が見つからない（テスト前提が崩れている）");
    return;
  }

  // 各テストの前提を揃えるため、audio要素を明示的に一時停止・先頭に戻しておく。
  audioElement.pause();
  audioElement.currentTime = 0;

  // ===== unlockが1件も進行していない状態のensureUnlockSettled() =====
  {
    const before = getAudioUnlockDiagnostics();
    assertEqual(before.hasPendingUnlock, false, "unlock未実行の初期状態ではhasPendingUnlockはfalse");

    const startedAt = performance.now();
    await ensureUnlockSettled();
    const elapsedMs = performance.now() - startedAt;
    // 待つべきPromiseが無い場合は即座に返るはず。IndexedDBや通信を伴わないため、
    // 実行環境が多少遅くても50msを超えることは無いはずという想定でチェックする
    // （2問目以降、余計な待機が発生しないことの確認に相当する）。
    assertEqual(elapsedMs < 50, true, `pendingUnlockPromiseが無ければensureUnlockSettled()は即座に返る（実測${elapsedMs.toFixed(1)}ms）`);
  }

  // ===== 再監査で発見・修正したバグの回帰テスト =====
  // 【バグの内容】以前は「audioElement.srcに何か入っているか（真偽値）」だけでhadSrcを
  // 判定していたため、本編の曲のURL（stopAudio()後に解放済みで無効になったものを含む）が
  // 残っている状態でattemptSilentUnlock()が呼ばれると、それをそのままplay()しようとして
  // いた（＝無音のはずのunlockで本編の曲が一瞬鳴る、または解放済みURLの再生失敗でunlock自体
  // が機能しない、という実害があった）。修正後は、「今のsrcが無音unlock専用URIそのもの」
  // でない限り、必ず無音URIに差し替えてからplay()する。
  {
    // 本編の曲のURL、または解放済みで無効になったURLを模した「無音URI以外の何か」を
    // 事前にsrcへセットしておく（実在するBlobである必要は無い。attemptSilentUnlock()が
    // これをそのまま再利用してしまわないかを確認したいだけなので）。
    const FAKE_LEFTOVER_SRC = "data:audio/wav;base64,AAAA";
    audioElement.pause();
    audioElement.src = FAKE_LEFTOVER_SRC;
    assertEqual(audioElement.paused, true, "テスト前提：src設定直後もaudio要素は再生中ではない（一時停止のまま）");

    attemptSilentUnlock();
    // attemptSilentUnlock()内のsrc差し替えはplay()呼び出し前の同期処理なので、
    // play()の成否（非同期）を待たなくても、この時点で既にsrcが書き換わっているはず。
    assertEqual(
      audioElement.src,
      SILENT_UNLOCK_DATA_URI,
      "本編の曲のURL・解放済みURLが残っていても、attemptSilentUnlock()は必ず無音URIに差し替えてからplay()する（回帰テスト）"
    );

    // このunlock呼び出しの後始末（成功・失敗どちらでも）を待ってから次のテストへ進む。
    // 待たずに次のattemptSilentUnlock()を呼ぶと、audioElement.pausedがまだfalseのままで
    // 「既に再生中」ガードに引っかかり、次のテストが何も検証しないまま終わってしまうため。
    const settleResult = await waitWithTimeout(ensureUnlockSettled(), 5000, "timeout");
    assertEqual(settleResult, "resolved", "1件目のunlockはタイムアウトせずに決着する");
  }

  // ===== unlock進行中はpendingUnlockPromiseに相当する状態が立つこと =====
  {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.removeAttribute("src");
    audioElement.load();
    assertEqual(audioElement.paused, true, "テスト前提：unlock開始前は一時停止状態");

    attemptSilentUnlock();
    const during = getAudioUnlockDiagnostics();
    // play()がPromiseを返す環境である前提（現代のブラウザでは通常そう）。
    // その場合、attemptSilentUnlock()はplay()呼び出し直後・同期的にpendingUnlockPromiseを
    // セットしているはずなので、awaitする前のこの時点で既にhasPendingUnlockはtrueになる。
    assertEqual(during.hasPendingUnlock, true, "attemptSilentUnlock()呼び出し直後、pendingUnlockPromiseに相当する状態が立つ");

    // ===== ensureUnlockSettled()が実際に決着まで待つこと・ハングしないこと =====
    const settleResult = await waitWithTimeout(ensureUnlockSettled(), 5000, "timeout");
    assertEqual(settleResult, "resolved", "unlockが失敗（play()拒否等）した場合でも、ensureUnlockSettled()はハングせず先に進む");

    const after = getAudioUnlockDiagnostics();
    assertEqual(after.hasPendingUnlock, false, "ensureUnlockSettled()完了後、pendingUnlockPromiseは片付けられている");
    assertEqual(
      after.audioUnlockState === "succeeded" || after.audioUnlockState === "failed",
      true,
      `unlock決着後、audioUnlockStateは"succeeded"か"failed"のどちらかになる（実際: ${after.audioUnlockState}）`
    );
  }

  // ===== 決着後、余計な待機が発生しないこと（2問目以降の体感速度への影響が無いことの確認） =====
  {
    const startedAt = performance.now();
    await ensureUnlockSettled();
    const elapsedMs = performance.now() - startedAt;
    assertEqual(elapsedMs < 50, true, `unlock決着後に呼んだensureUnlockSettled()も即座に返る（実測${elapsedMs.toFixed(1)}ms）`);
  }

  // ===== 世代番号（token）：連続した再生要求のうち、追い越された古い方は無視されること =====
  // 実在しない曲IDを使うことで、IndexedDBに問い合わせた結果は必ずnull（未読み込み）になる。
  // getAudioBlob()はnullの場合に間隔を空けて複数回再試行する仕様（js/audioStorage.js）のため、
  // このテストは完了までに1秒強かかる。
  {
    const errorMessages = [];
    const onErrorA = (message) => errorMessages.push({ who: "A", message });
    const onErrorB = (message) => errorMessages.push({ who: "B", message });
    let playbackStartedA = false;
    let playbackStartedB = false;

    // awaitせずに連続で呼ぶことで、「2問連続で速く呼ばれた」状況を模す
    // （通常のゲーム進行では起きないはずだが、二重タップ等の異常系を想定）。
    const callA = playSongIntro(
      { id: "test-nonexistent-song-A" },
      onErrorA,
      () => { playbackStartedA = true; }
    );
    const callB = playSongIntro(
      { id: "test-nonexistent-song-B" },
      onErrorB,
      () => { playbackStartedB = true; }
    );
    await Promise.all([callA, callB]);

    assertEqual(playbackStartedA, false, "曲Aは音源が存在しないため再生は始まらない");
    assertEqual(playbackStartedB, false, "曲Bは音源が存在しないため再生は始まらない");
    assertEqual(
      errorMessages.length,
      1,
      `追い越された古い呼び出し（曲A）はonErrorを呼ばず、最新の呼び出し（曲B）だけが呼ぶ（実際の呼び出し回数: ${errorMessages.length}）`
    );
    if (errorMessages.length === 1) {
      assertEqual(errorMessages[0].who, "B", "onErrorが呼ばれるのは、追い越されていない最新の呼び出し（曲B）だけ");
    }
    assertEqual(getCurrentPlaybackState().songId, "test-nonexistent-song-B", "getCurrentPlaybackState()のsongIdは最新の呼び出し（曲B）を指す");
  }

  // 後片付け：他のテスト・実機確認に影響を残さないよう、audio要素を初期状態に戻す。
  audioElement.pause();
  audioElement.currentTime = 0;
  audioElement.removeAttribute("src");
  audioElement.load();
}
