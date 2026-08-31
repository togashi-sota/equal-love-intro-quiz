// <audio>要素の再生・停止を担当するファイル。
// 音源ファイルが見つからない/再生に失敗しても、例外を投げっぱなしにせず
// エラーメッセージ表示用のコールバックを呼ぶだけに留め、アプリ全体を止めないようにする。
//
// PWA化に伴い、音源はサーバーの静的なパスからではなく、IndexedDB（audioStorage.js）に
// 保存されたファイルから取得する方式にしている。取得自体が非同期処理になるため、
// このファイルの関数もそれに合わせて非同期（async）にしてある。

import { getAudioBlob } from "./audioStorage.js";
import { registerPlaybackStopper, notifyPlaybackStarting } from "./playbackCoordinator.js";

const audioElement = document.getElementById("intro-audio");

// 今「現在の曲」として再生中・再生準備中のObject URL（Blobを再生できる形にしたもの）。
// 曲を切り替えるたびに、前のURLを解放してからでないとメモリに残り続けてしまうため、
// ここに保持しておいて次回の再生開始時に片付ける。
let currentObjectUrl = null;

// playSongIntro()・playSongFromRandomPosition()が呼ばれるたびに1つ増える「世代番号」。
// 【この番号が必要な理由】これらの関数はIndexedDBからの読み込み・再生開始が非同期のため、
// 「次の問題へ進む→また呼ばれる」が速いと、前の呼び出しの処理がまだ裏で残ったまま、
// 後から追いついてくることがある。追いついてきた古い処理が今の曲を勝手に上書き・エラー扱い
// にしてしまわないよう、各呼び出しは「自分が発行された時点の番号」を覚えておき、
// 実際にaudio要素を操作する直前に「今の最新番号と一致しているか」を確認する。
// 一致していなければ、自分はもう用済み（追い越された）と判断して何もしない。
//
// 【2026-08-08追記】ランダム再生モード（js/randomPlaybackEngine.js）追加にあたり、
// この世代番号・Object URL管理の仕組みは一切変更せず、そのまま共有している
// （別のaudio要素や独自の競合対策を新設しない、という本人の明確な要望どおり）。
let currentPlaybackToken = 0;

function releaseCurrentObjectUrl() {
  if (currentObjectUrl !== null) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

// 世代番号を発行し、音源データを取得する。取得完了時点で既に追い越されていたら
// stale:trueを返す（呼び出し側は何もせず終わってよい）。
// playSongIntro()・playSongFromRandomPosition()の共通の前半処理。
async function acquireBlobForNewPlayback(song) {
  const myToken = ++currentPlaybackToken;
  const blob = await getAudioBlob(song.id);
  if (myToken !== currentPlaybackToken) {
    return { myToken, blob: null, stale: true };
  }
  return { myToken, blob, stale: false };
}

// 取得したblobを「現在再生中」として確定させる。それまでの再生中URLを解放し、
// 自分のURLを新しい「現在再生中」として登録してから、再生用のURLを返す。
// playSongIntro()・playSongFromRandomPosition()の共通処理。
function claimAsCurrentPlayback(blob) {
  // クイズの音声を鳴らす直前に、試聴・連続再生など他の音声を止める
  // （playbackCoordinator.js参照、2026-08-04追加）。
  notifyPlaybackStarting("quiz");
  releaseCurrentObjectUrl();
  const myObjectUrl = URL.createObjectURL(blob);
  currentObjectUrl = myObjectUrl;
  return myObjectUrl;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 【2026-09-03新設・本人指摘：オンライン対戦で実機の約5回に1回、1問目でplay()自体が
// 失敗する（「音源を再生できませんでした」）ことが報告された。音源データ自体は
// 取得できていた（getAudioBlob()側の再試行強化だけでは直らなかった）ため、原因は
// IndexedDBの取得タイミングとは別に、play()呼び出し自体が一時的に失敗する
// （iOS Safariの自動再生ポリシー関連の一時的な拒否等が疑われるが、コードレビューだけでは
// 断定できない）ケースがあると判断した。srcを変えずにplay()だけを間隔を空けて
// 数回まで再試行することで、こうした一時的な失敗から自動的に回復できるようにする。
const PLAY_RETRY_WAIT_MS_LIST = [300, 600];

// audioElement.play()を試み、成功/失敗のどちらでも「追い越された場合の後始末」まで行う。
// 戻り値：trueなら再生が実際に始まった（かつ自分がまだ最新）、falseなら失敗または追い越された。
// playSongIntro()・playSongFromRandomPosition()の共通の後半処理。
async function attemptPlay(myToken, myObjectUrl, onError) {
  let lastError = null;
  for (let attempt = 0; attempt <= PLAY_RETRY_WAIT_MS_LIST.length; attempt++) {
    if (attempt > 0) {
      await sleep(PLAY_RETRY_WAIT_MS_LIST[attempt - 1]);
      // 再試行までの待ち時間の間に、追い越されている／再生が別の理由で既に始まっている
      // 可能性があるため、その場合は再試行そのものを行わない。
      if (myToken !== currentPlaybackToken) return false;
      if (!audioElement.paused) return true;
    }
    try {
      await audioElement.play();
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    // 再生開始前後にsrcが差し替えられた場合、ブラウザはこのplay()を失敗させる
    // （AbortError等）。それが「追い越されたことによる失敗」なら、エラー表示は不要。
    if (myToken !== currentPlaybackToken) return false;
    onError("音源を再生できませんでした");
    return false;
  }

  // 通常はsrcの差し替えでplay()自体が上のcatchに落ちるが、タイミング次第では
  // 追い越された後でもplay()が成功扱いになることがあるため、念のためここでも確認する。
  // 【URLの後片付けについて】自分（古い呼び出し）が最新だった間は必ずcurrentObjectUrlに
  // 自分のURLを登録しているため、既に追い越されているこの時点では、自分を追い越した
  // 呼び出し側のreleaseCurrentObjectUrl()が自分のURLを片付け終えている（「現在再生中の
  // URLはstopAudio()または次の有効な再生処理だけが破棄する」という役割分担のとおり）。
  // そのため、ここで自分から改めてrevokeする必要はない。
  if (myToken !== currentPlaybackToken) {
    // audio要素が既に自分以外の（もっと新しい）曲のURLに切り替わっている場合、
    // ここでpause()すると新しい曲の再生を誤って止めてしまうため、
    // 「今のsrcがまだ自分のURLのままか」を確認してからにする。
    if (audioElement.src === myObjectUrl) {
      audioElement.pause();
    }
    return false;
  }
  return true;
}

// 曲のイントロを再生する。再生できなかった場合や、音源が未読み込みの場合は onError を呼ぶ。
// onPlaybackStart : 曲が実際に鳴り始めた瞬間（playingイベント）に呼ばれる。
//                    結果画面の回答時間表示など、正確な計測に使う。
//
// song.introLeadInSec が設定されている曲は、その秒数の位置まで頭出ししてから再生する
// （曲の頭に無音区間があるケースで、その無音を聞かせないようにするため）。
// 曲の長さなどのメタデータが読み込まれるまでは0秒以外へのシークが正しく効かないことがあるため、
// loadedmetadataイベントを待ってから頭出しする。
//
// この関数はasyncだが、呼び出し側（main.js）はawaitせずに呼びっぱなしにしている。
// markPlaybackStarted()・startTimer()は元々この関数の完了を待たずに動く設計のため、
// 呼び出し側を変更する必要はない。
export async function playSongIntro(song, onError, onPlaybackStart) {
  const { myToken, blob, stale } = await acquireBlobForNewPlayback(song);
  if (stale) return;

  if (!blob) {
    onError("この曲の音源が読み込まれていません。スタート画面の「音源を読み込む」から追加してください");
    return;
  }

  const myObjectUrl = claimAsCurrentPlayback(blob);

  audioElement.onerror = () => {
    // 自分より新しい呼び出しに既に追い越されている場合、このエラーはもう
    // 今の問題とは関係ない曲のものなので、画面には出さず無視する。
    if (myToken !== currentPlaybackToken) return;
    onError("音源を再生できませんでした");
  };
  audioElement.onplaying = () => {
    if (myToken !== currentPlaybackToken) return;
    onPlaybackStart();
  };
  audioElement.onloadedmetadata = () => {
    if (myToken !== currentPlaybackToken) return;
    audioElement.currentTime = song.introLeadInSec || 0;
  };
  audioElement.src = myObjectUrl;

  await attemptPlay(myToken, myObjectUrl, onError);
}

// 【2026-08-08新設・ランダム再生モード用】曲の任意の位置から再生し、指定秒数後に
// 自動的に一時停止する。playSongIntro()と全く同じ世代番号・Object URL管理を共有する
// （別のaudio要素や独自の競合対策を新設しない）。
//
// computeStartTimeSec(durationSec) : 曲の長さ（秒、audioElement.durationから取得）を受け取り、
//   実際に再生を始める位置（秒）を返す関数。呼び出し側（js/randomPlaybackEngine.js）が
//   seed・songId・questionIndex等から純粋関数として計算したものを渡す想定で、
//   このファイル自身は「どこから再生するか」の計算には一切関与しない
//   （エンジン部分〈このファイル〉とルール・計算部分〈呼び出し側〉の責務を分離するため）。
// playDurationSec : この秒数だけ再生したら自動的に一時停止する。
// onPlaybackStart : 実際に鳴り始めた瞬間に呼ばれる（playSongIntro()と同じ役割）。
// onAutoStop      : 指定秒数が経過し、自動的に一時停止した瞬間に呼ばれる（新規）。
//                    曲が短くて再生秒数に達する前に自然終了した場合は呼ばれない
//                    （その場合はonerror/onplaying以外のイベントが発生しないため、
//                    呼び出し側でタイムアウト等の別の後始末をする必要はない。
//                    自然終了時に鳴りっぱなしになることもない＝audio要素自体が止まるため）。
export async function playSongFromRandomPosition(song, computeStartTimeSec, playDurationSec, onError, onPlaybackStart, onAutoStop) {
  const { myToken, blob, stale } = await acquireBlobForNewPlayback(song);
  if (stale) return;

  if (!blob) {
    onError("この曲の音源が読み込まれていません。スタート画面の「音源を読み込む」から追加してください");
    return;
  }

  const myObjectUrl = claimAsCurrentPlayback(blob);
  let autoStopTimeoutId = null;

  audioElement.onerror = () => {
    if (myToken !== currentPlaybackToken) return;
    onError("音源を再生できませんでした");
  };
  audioElement.onplaying = () => {
    if (myToken !== currentPlaybackToken) return;
    onPlaybackStart();
    // 指定秒数だけ鳴らしたら自動的に一時停止する。
    // タイマー発火時に既に追い越されていた場合は何もしない（stopAudio()や次の
    // playSongIntro()/playSongFromRandomPosition()が世代番号を進めているはずなので、
    // ここで誤って別の曲を止めてしまうことはない）。
    if (autoStopTimeoutId !== null) {
      clearTimeout(autoStopTimeoutId);
    }
    autoStopTimeoutId = setTimeout(() => {
      if (myToken !== currentPlaybackToken) return;
      audioElement.pause();
      onAutoStop();
    }, playDurationSec * 1000);
  };
  audioElement.onloadedmetadata = () => {
    if (myToken !== currentPlaybackToken) return;
    audioElement.currentTime = computeStartTimeSec(audioElement.duration);
  };
  audioElement.src = myObjectUrl;

  await attemptPlay(myToken, myObjectUrl, onError);
}

// 再生を止める（画面遷移時などに呼ぶ）。
export function stopAudio() {
  // 世代番号を進めることで、この時点で裏に残っている古いplaySongIntro()/
  // playSongFromRandomPosition()の処理（自動停止タイマーを含む）をすべて「無効」にする
  // （stopAudio()の後に遅れて鳴り出す事故を防ぐ）。
  currentPlaybackToken++;
  audioElement.pause();
  audioElement.currentTime = 0;
  releaseCurrentObjectUrl();
}

registerPlaybackStopper("quiz", stopAudio);
