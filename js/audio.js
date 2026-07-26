// <audio>要素の再生・停止を担当するファイル。
// 音源ファイルが見つからない/再生に失敗しても、例外を投げっぱなしにせず
// エラーメッセージ表示用のコールバックを呼ぶだけに留め、アプリ全体を止めないようにする。

// 本物のイントロ音源を置くローカル専用フォルダ。
// このフォルダは.gitignoreで除外されているため、GitHubには公開されない。
const AUDIO_BASE_PATH = "assets/audio/local/";

const audioElement = document.getElementById("intro-audio");

// 曲のイントロを再生する。再生できなかった場合は onError を呼ぶ。
// onPlaybackStart : 曲が実際に鳴り始めた瞬間（playingイベント）に呼ばれる。
//                    結果画面の回答時間表示など、正確な計測に使う。
//
// song.introLeadInSec が設定されている曲は、その秒数の位置まで頭出ししてから再生する
// （曲の頭に無音区間があるケースで、その無音を聞かせないようにするため）。
// 曲の長さなどのメタデータが読み込まれるまでは0秒以外へのシークが正しく効かないことがあるため、
// loadedmetadataイベントを待ってから頭出しする。
export function playSongIntro(song, onError, onPlaybackStart) {
  audioElement.onerror = () => onError("音源を再生できませんでした");
  audioElement.onplaying = () => onPlaybackStart();
  audioElement.onloadedmetadata = () => {
    audioElement.currentTime = song.introLeadInSec || 0;
  };
  audioElement.src = `${AUDIO_BASE_PATH}${song.id}.mp3`;

  audioElement.play().catch(() => {
    onError("音源を再生できませんでした");
  });
}

// 再生を止める（画面遷移時などに呼ぶ）。
export function stopAudio() {
  audioElement.pause();
  audioElement.currentTime = 0;
}
