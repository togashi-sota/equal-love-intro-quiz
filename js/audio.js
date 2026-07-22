// <audio>要素の再生・停止を担当するファイル。
// 音源ファイルが見つからない/再生に失敗しても、例外を投げっぱなしにせず
// エラーメッセージ表示用のコールバックを呼ぶだけに留め、アプリ全体を止めないようにする。

// 本物のイントロ音源を置くローカル専用フォルダ。
// このフォルダは.gitignoreで除外されているため、GitHubには公開されない。
const AUDIO_BASE_PATH = "assets/audio/local/";

const audioElement = document.getElementById("intro-audio");

// 曲のイントロを再生する。再生できなかった場合は onError を呼ぶ。
export function playSongIntro(song, onError) {
  audioElement.onerror = () => onError("音源を再生できませんでした");
  audioElement.src = `${AUDIO_BASE_PATH}${song.id}.mp3`;
  audioElement.currentTime = 0;

  audioElement.play().catch(() => {
    onError("音源を再生できませんでした");
  });
}

// 再生を止める（画面遷移時などに呼ぶ）。
export function stopAudio() {
  audioElement.pause();
  audioElement.currentTime = 0;
}
