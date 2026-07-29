// 試聴（プレビュー）再生の共通処理をまとめたファイル。
// IndexedDBに保存された音源を取得し、再生・一時停止・再開・停止・シークするところまでを担う。
// 「無音区間を飛ばして頭出しする」考え方は、収録曲一覧の試聴（songlist.js）と同じ。
// クイズ本編の再生（audio.js）とは完全に独立している。
//
// 再生中・一時停止中の見た目（アイコン・シークバー・現在時間など）の更新は、
// この処理を使う側（customQuizScreen.js）が、getPreviewAudioElement()で受け取った
// <audio>要素に対して直接play/pause/timeupdate等のイベントを購読して行う
// （songlist.jsが自前のpreviewAudioElementに対して行っているのと同じ考え方）。

import { getAudioBlob } from "./audioStorage.js";

// 試聴を10秒戻す/送るときの秒数。収録曲一覧の試聴（songlist.js）と統一している。
export const PREVIEW_SEEK_SKIP_SECONDS = 10;

let audioElement = null;
let currentSongId = null;
let currentObjectUrl = null;

function releaseCurrentObjectUrl() {
  if (currentObjectUrl !== null) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

// この機能を使う前に一度だけ呼ぶ。再生に使う<audio>要素を渡す。
export function initAudioPreview(sharedAudioElement) {
  audioElement = sharedAudioElement;
}

// 再生に使っている<audio>要素そのもの。play/pause/timeupdate等のイベント購読に使う。
export function getPreviewAudioElement() {
  return audioElement;
}

// 今、試聴中（一時停止中も含む）の曲ID。何も読み込んでいなければnull。
export function getCurrentPreviewSongId() {
  return currentSongId;
}

// 試聴を完全に停止する（再生位置もリセットする）。
// 画面を離れるとき・クイズを開始/保存するとき・別の曲を再生する直前に呼ぶ。
export function stopAudioPreview() {
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }
  releaseCurrentObjectUrl();
  currentSongId = null;
}

// 指定した曲の試聴を開始する。すでに何か再生中/一時停止中なら自動的に止めてから始める。
// 未読み込みの曲の場合は、試聴が補助機能であることに合わせて、エラー表示は出さず静かに何もしない。
// 戻り値：再生を開始できたらtrue、曲が未読み込み/再生に失敗した場合はfalse。
export async function playAudioPreview(song) {
  stopAudioPreview();

  const blob = await getAudioBlob(song.id);
  if (!blob) return false;

  currentObjectUrl = URL.createObjectURL(blob);
  audioElement.src = currentObjectUrl;
  audioElement.onloadedmetadata = () => {
    audioElement.currentTime = song.introLeadInSec || 0;
  };

  try {
    await audioElement.play();
    currentSongId = song.id;
    return true;
  } catch {
    releaseCurrentObjectUrl();
    currentSongId = null;
    return false;
  }
}

// 今の試聴を一時停止する（再生位置は保持する）。
export function pauseAudioPreview() {
  audioElement?.pause();
}

// 一時停止していた試聴を、同じ位置から再開する。
export function resumeAudioPreview() {
  audioElement?.play();
}

// 現在の再生位置を、指定した秒数だけ前後に動かす（マイナスで戻す、プラスで送る）。
export function seekAudioPreview(deltaSeconds) {
  if (!audioElement) return;
  const duration = audioElement.duration || audioElement.currentTime;
  audioElement.currentTime = Math.min(duration, Math.max(0, audioElement.currentTime + deltaSeconds));
}
