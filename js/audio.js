// <audio>要素の再生・停止を担当するファイル。
// 音源ファイルが見つからない/再生に失敗しても、例外を投げっぱなしにせず
// エラーメッセージ表示用のコールバックを呼ぶだけに留め、アプリ全体を止めないようにする。

// 公開版で使うダミー音源のフォルダ。
// 本物のイントロ音源をローカルで試したいときは、この値を "assets/audio/local/" に書き換える。
// ローカル用フォルダは.gitignoreで除外されているため、公開・コミットには含まれない。
const AUDIO_BASE_PATH = "assets/audio/dummy/";

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
