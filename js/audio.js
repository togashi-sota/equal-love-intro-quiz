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

// 直前に作った再生用URL（Blobを再生できる形にしたもの）。
// 曲を切り替えるたびに、前のURLを解放してからでないとメモリに残り続けてしまうため、
// ここに保持しておいて次回の再生開始時に片付ける。
let currentObjectUrl = null;

function releaseCurrentObjectUrl() {
  if (currentObjectUrl !== null) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
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
  const blob = await getAudioBlob(song.id);
  if (!blob) {
    onError("この曲の音源が読み込まれていません。スタート画面の「音源を読み込む」から追加してください");
    return;
  }

  // クイズの音声を鳴らす直前に、試聴・連続再生など他の音声を止める
  // （playbackCoordinator.js参照、2026-08-04追加）。
  notifyPlaybackStarting("quiz");

  releaseCurrentObjectUrl();
  currentObjectUrl = URL.createObjectURL(blob);

  audioElement.onerror = () => onError("音源を再生できませんでした");
  audioElement.onplaying = () => onPlaybackStart();
  audioElement.onloadedmetadata = () => {
    audioElement.currentTime = song.introLeadInSec || 0;
  };
  audioElement.src = currentObjectUrl;

  audioElement.play().catch(() => {
    onError("音源を再生できませんでした");
  });
}

// 再生を止める（画面遷移時などに呼ぶ）。
export function stopAudio() {
  audioElement.pause();
  audioElement.currentTime = 0;
}

registerPlaybackStopper("quiz", stopAudio);
