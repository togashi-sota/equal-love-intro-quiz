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
  getAudioLifecycleDiagnostics,
  playSongIntro,
  getCurrentPlaybackState,
  raceUnlockPromiseWithTimeout,
  startAudioUnlockHeartbeat,
  stopAudioUnlockHeartbeat,
  hasActiveAudioUnlockHeartbeat,
  stopAudio,
} from "../js/audio.js";
import { assertEqual } from "./test-utils.js";

const audioElement = document.getElementById("intro-audio");

// 無音unlock専用データURI（js/audio.js内のSILENT_UNLOCK_DATA_URIと同じ値）。
// js/audio.js側は非公開の定数のためexportされていない。このファイルが実際にsrcの
// 中身まで比較検証する必要があるため、同じ文字列をここにも用意する（値がズレると
// このテスト自体が誤って失敗するので、js/audio.js側を変更したときはここも合わせて直すこと）。
// 【2026-09-24改訂・本人の実機診断ログで確定した根本原因の修正に伴う更新】以前の値は
// WAVのdataチャンクが0バイト（実際のサンプルが1つも無い）という不備があり、iOS実機で
// play()のPromiseが無期限にpendingのまま決着しない事故の直接原因になっていた。
// 8-bit・8000Hz・モノラルで実際に400サンプル（50ミリ秒、値128＝無音）を持つ、
// 正しく機能するWAVへ差し替えた（js/audio.js側の値と完全に一致させること）。
const SILENT_UNLOCK_DATA_URI =
  "data:audio/wav;base64,UklGRrQBAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YZABAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 【2026-09-24新設・本人指示：再発防止】SILENT_UNLOCK_DATA_URIが、今回の根本原因
// （WAVのdataチャンクが0バイト＝実際のサンプルが1つも無い）へ将来また誤って戻って
// しまわないことを保証するための、最小限のWAVパーサー。RIFF/WAVE/fmt/dataという
// 標準的なチャンク構造だけを読み取る（圧縮形式・拡張ヘッダー等には対応しない、
// このプロジェクトが実際に使う単純なPCM WAVだけを想定した割り切った実装）。
function parseWavDataUri(dataUri) {
  const base64 = dataUri.replace(/^data:audio\/wav;base64,/, "");
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i += 1) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const readAscii = (offset, length) =>
    Array.from(bytes.slice(offset, offset + length))
      .map((byte) => String.fromCharCode(byte))
      .join("");

  const riffTag = readAscii(0, 4);
  const waveTag = readAscii(8, 4);
  const fmtTag = readAscii(12, 4);

  // fmtチャンクのサイズ（オフセット16、4バイト、リトルエンディアン）を読み、
  // その直後からdataチャンクが始まる位置を計算する（fmt拡張が無い前提の単純な構造）。
  const fmtChunkSize = view.getUint32(16, true);
  const dataTagOffset = 20 + fmtChunkSize;
  const dataTag = readAscii(dataTagOffset, 4);
  const dataChunkSize = view.getUint32(dataTagOffset + 4, true);
  const actualDataBytes = bytes.length - (dataTagOffset + 8);

  return { riffTag, waveTag, fmtTag, dataTag, dataChunkSize, actualDataBytes, totalBytes: bytes.length };
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

  // ===== 【2026-09-24新設・本人指示：再発防止】SILENT_UNLOCK_DATA_URIが今回の根本原因
  //       （dataチャンクが0バイト）へ将来また誤って戻っていないかの回帰テスト =====
  // 【なぜ重要か】このテストが検証しているのは「iOSで実際に自動再生が許可されるか」では
  // なく、もっと手前の「そもそもこのWAVデータ自体が壊れていないか」という、コードだけで
  // 確実に検証できる部分。今回のバグはこの部分の不備（dataチャンクのサイズが0）が
  // 直接の原因だったため、ここが再発しないことを機械的に保証する。
  {
    const parsed = parseWavDataUri(SILENT_UNLOCK_DATA_URI);
    assertEqual(parsed.riffTag, "RIFF", "unlock用WAVはRIFFヘッダーで始まる（壊れたファイルではない）");
    assertEqual(parsed.waveTag, "WAVE", "unlock用WAVのフォーマットタグはWAVE");
    assertEqual(parsed.fmtTag, "fmt ", "unlock用WAVにfmtチャンクが存在する");
    assertEqual(parsed.dataTag, "data", "unlock用WAVにdataチャンクが存在する");
    assertEqual(
      parsed.dataChunkSize > 0,
      true,
      `【今回の根本原因の直接の再発防止】dataチャンクのサイズは0であってはならない（実際: ${parsed.dataChunkSize}バイト。0だとiOS実機でplay()のPromiseが無期限にpendingし、本番音源の再生が永久にブロックされる）`
    );
    assertEqual(
      parsed.actualDataBytes >= parsed.dataChunkSize,
      true,
      "dataチャンクが宣言しているサイズぶんの実際のバイト列が、ファイルの中に本当に存在する（ヘッダーだけで中身が伴っていない状態を防ぐ）"
    );
    // 50ミリ秒（8000Hz×50ms=400サンプル）以上の、実用に足る長さがあることも確認する
    // （1〜2サンプルだけの極端に短いデータでは、iOS側が「再生を開始した」という進捗を
    // 検知できないリスクが残るという判断のため）。
    assertEqual(
      parsed.dataChunkSize >= 400,
      true,
      `unlock用WAVは十分な長さ（最低400バイト分のサンプル）を持つ（実際: ${parsed.dataChunkSize}バイト）`
    );
  }

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

  // ===== raceUnlockPromiseWithTimeout()：本番再生を無期限にブロックしないための
  //       fail-open設計の中核ロジック（2026-09-24新設・本人の実機診断ログを受けた対策） =====
  // 【背景】実機診断ログにより、unlock用のPromiseが（当時の不備のあるデータURIのせいで）
  // 何秒経っても決着せず、ensureUnlockSettled()が無期限に本番再生をブロックし続ける
  // 事故が実際に確認された。データURI自体は修正したが、「unlockのPromiseが将来また
  // 何らかの理由で決着しなくても、本番再生は必ず一定時間内に進められる」ことを、
  // iOS実機の挙動に依存しない、この関数単体の純粋なPromise/state制御として保証する。
  {
    // ---- 絶対に決着しないPromiseを渡しても、timeoutMs経過後には必ず"timeout"で抜けられる ----
    const neverSettles = new Promise(() => {}); // resolve/rejectを一切呼ばない
    const startedAt = performance.now();
    const result = await raceUnlockPromiseWithTimeout(neverSettles, 50);
    const elapsedMs = performance.now() - startedAt;
    assertEqual(result, "timeout", "絶対に決着しないPromiseを渡すと、timeoutMs経過後に'timeout'を返す（本番再生を無期限にブロックしないための核心）");
    assertEqual(elapsedMs < 200, true, `timeoutMs（50ms）から大きく遅れずに抜けられる（実測${elapsedMs.toFixed(1)}ms）`);
  }
  {
    // ---- すぐに決着するPromiseなら、timeoutMsを待たずに"settled"を返す ----
    const quicklySettles = Promise.resolve();
    const startedAt = performance.now();
    const result = await raceUnlockPromiseWithTimeout(quicklySettles, 5000);
    const elapsedMs = performance.now() - startedAt;
    assertEqual(result, "settled", "即座に決着するPromiseを渡すと、timeoutMsを待たずに'settled'を返す");
    assertEqual(elapsedMs < 100, true, `決着済みのPromiseなら5秒のtimeoutMsを待たされない（実測${elapsedMs.toFixed(1)}ms）`);
  }
  {
    // ---- 複数の待ち合わせが同じ「決着しないPromise」に対して行われても、
    //      それぞれ独立にtimeoutで解放される（1つに積み重なって連鎖的にハングしない） ----
    const neverSettles = new Promise(() => {});
    const startedAt = performance.now();
    const results = await Promise.all([
      raceUnlockPromiseWithTimeout(neverSettles, 40),
      raceUnlockPromiseWithTimeout(neverSettles, 40),
      raceUnlockPromiseWithTimeout(neverSettles, 40),
    ]);
    const elapsedMs = performance.now() - startedAt;
    assertEqual(
      results.every((r) => r === "timeout"),
      true,
      "同じ決着しないPromiseを複数箇所が同時に待っていても、全員がそれぞれ独立してtimeoutで解放される"
    );
    assertEqual(elapsedMs < 200, true, `3件同時でも、timeoutMs（40ms）から大きく遅れずに全員解放される（実測${elapsedMs.toFixed(1)}ms）`);
  }

  // ===== 【2026-11-XX新設・本人指示：一瞬バトル／一瞬協力「もう一度聞く」で実機報告された
  //       race conditionの再発防止】attemptSilentUnlock()が無音データURIへsrcを差し替える
  //       際、直前の本編再生（playSongIntro()/playSongFromRandomPosition()）が設定した
  //       onloadedmetadata/onplaying/onerrorハンドラを確実にクリアすることを検証する。
  //       【実機で起きていた実害】このクリアが無いと、無音データURI（実際の長さ約0.05秒）の
  //       loadedmetadataに対して本編側の古いハンドラが誤って発火し、「音源が他の端末と
  //       異なる」という誤判定・試合無効化につながっていた（docs/HANDOFF.md参照、
  //       一瞬バトル・一瞬協力の両方の実機ログで確認済み）。
  {
    audioElement.pause();
    audioElement.currentTime = 0;
    audioElement.removeAttribute("src");
    audioElement.load();

    // 本編再生（playSongFromRandomPosition()等）が実際に行うのと同じ形で、
    // 「本編用のonloadedmetadataハンドラ」を模したスパイを仕込む。
    let staleHandlerCallCount = 0;
    audioElement.onloadedmetadata = () => {
      staleHandlerCallCount++;
    };
    audioElement.onplaying = () => {};
    audioElement.onerror = () => {};

    attemptSilentUnlock();

    // attemptSilentUnlock()がsrcを無音データURIへ差し替える時点で、
    // 直前に仕込んだ本編用ハンドラは即座にクリアされているべき（同期的に検証できる）。
    assertEqual(
      audioElement.onloadedmetadata,
      null,
      "attemptSilentUnlock()がsrcを無音データURIへ差し替える際、直前の本編再生のonloadedmetadataハンドラをクリアする"
    );
    assertEqual(
      audioElement.onplaying,
      null,
      "attemptSilentUnlock()がsrcを無音データURIへ差し替える際、直前の本編再生のonplayingハンドラをクリアする"
    );
    assertEqual(
      audioElement.onerror,
      null,
      "attemptSilentUnlock()がsrcを無音データURIへ差し替える際、直前の本編再生のonerrorハンドラをクリアする"
    );

    // 無音データURIの読み込みが実際に完了（loadedmetadata発火）するまで待ち、
    // クリアされたはずの古いハンドラが呼ばれていないことを確認する
    // （＝無音データURIの約0.05秒という長さが、本編側のduration比較へ絶対に渡らないことの証明）。
    await waitWithTimeout(ensureUnlockSettled(), 5000, "timeout");
    assertEqual(
      staleHandlerCallCount,
      0,
      "無音データURIの読み込みが完了しても、クリアされた本編用の古いonloadedmetadataハンドラは一切呼ばれない"
    );
  }

  // ---- 【2026-11-XX新設】一瞬バトル／一瞬協力向けの予防的unlock心拍
  //      （startAudioUnlockHeartbeat/stopAudioUnlockHeartbeat）のライフサイクル検証。
  //      実際に発火間隔（10秒）を待つと遅すぎるため、ここでは「二重起動でタイマーが
  //      増えない」「stopで確実に止まる」という、時間を待たずに検証できる契約だけを見る。
  {
    assertEqual(hasActiveAudioUnlockHeartbeat(), false, "心拍：開始前はfalse");
    startAudioUnlockHeartbeat();
    assertEqual(hasActiveAudioUnlockHeartbeat(), true, "心拍：start後はtrue");
    startAudioUnlockHeartbeat(); // 二重に呼んでも安全（内部でstopしてから張り直すだけ）。
    assertEqual(hasActiveAudioUnlockHeartbeat(), true, "心拍：二重にstartしても壊れずtrueのまま");
    stopAudioUnlockHeartbeat();
    assertEqual(hasActiveAudioUnlockHeartbeat(), false, "心拍：stop後はfalse");
    stopAudioUnlockHeartbeat(); // 既に止まっている状態で呼んでも安全。
    assertEqual(hasActiveAudioUnlockHeartbeat(), false, "心拍：既に停止中にstopを呼んでも安全にfalseのまま");
  }

  // ---- 【2026-11-XX新設・本人指示：Bug A継続調査】累計使用状況スナップショット
  //      （getAudioLifecycleDiagnostics()）の形と、stopAudio()呼び出しでの
  //      cumulativeStopAudioCallCount増加だけを検証する（実際のObject URL生成を伴う
  //      再生成功パスはIndexedDBに実音源が無いテスト環境では再現できないため対象外。
  //      値そのものの正しさより「壊れずに数値を返し続けること」「呼べば増えること」を見る）。
  {
    const before = getAudioLifecycleDiagnostics();
    [
      "cumulativeObjectUrlCreatedCount",
      "cumulativeObjectUrlRevokedCount",
      "aliveObjectUrlCount",
      "cumulativeStopAudioCallCount",
      "cumulativeSrcAssignmentCount",
      "cumulativeLoadCallCount",
      "cumulativePlayCallCount",
      "cumulativePlaySuccessCount",
      "cumulativePlayFailureCount",
      "cumulativeNotSupportedErrorCount",
    ].forEach((key) => {
      assertEqual(typeof before[key], "number", `getAudioLifecycleDiagnostics()の${key}は数値`);
    });
    assertEqual(
      before.aliveObjectUrlCount,
      before.cumulativeObjectUrlCreatedCount - before.cumulativeObjectUrlRevokedCount,
      "aliveObjectUrlCountは「作った数−解放した数」と一致する"
    );

    stopAudio();
    const after = getAudioLifecycleDiagnostics();
    assertEqual(
      after.cumulativeStopAudioCallCount,
      before.cumulativeStopAudioCallCount + 1,
      "stopAudio()を呼ぶとcumulativeStopAudioCallCountが1増える"
    );
  }

  // 後片付け：他のテスト・実機確認に影響を残さないよう、audio要素を初期状態に戻す。
  audioElement.pause();
  audioElement.currentTime = 0;
  audioElement.removeAttribute("src");
  audioElement.load();
}
