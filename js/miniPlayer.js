// 連続再生のミニプレイヤーを組み立てるファイル。
// 他の画面（メンバー紹介・＝LOVEについて・プレイ履歴など）を見ている間も「今なにが
// 流れているか」がひと目で分かるよう、曲名・状態・再生/一時停止・停止ボタンだけの
// 小さいバーを画面下部に常時表示する（UI/UX再設計：本人フィードバックで新設）。
//
// 表示/非表示の判断材料は2つ：
// ① 連続再生に今キューがあるか（js/continuousPlay.jsのonPlaybackStateChange）
// ② 今どの画面を見ているか（js/screens.jsのonScreenChange）
// 連続再生画面・再生キュー画面を見ているときは、同じ情報が本画面にすでに出ているため
// ミニプレイヤーは隠す。

import { getPlaybackState, onPlaybackStateChange, togglePlayPause, stopPlayback } from "./continuousPlay.js";
import { onScreenChange } from "./screens.js";

let elements = null;

// ミニプレイヤーを出さない画面（連続再生本体・再生キュー画面）。
const HIDDEN_ON_SCREENS = new Set(["continuousPlay", "continuousPlayQueue"]);

let currentScreenName = "start";

const STATUS_TEXT = {
  playing: "再生中",
  paused: "一時停止中",
  finished: "最後まで再生しました",
};

function render() {
  const state = getPlaybackState();
  const hasQueue = state.status === "playing" || state.status === "paused" || state.status === "finished";
  const shouldShow = hasQueue && !HIDDEN_ON_SCREENS.has(currentScreenName);

  elements.root.hidden = !shouldShow;
  document.body.classList.toggle("has-mini-player", shouldShow);

  if (!shouldShow) return;

  elements.title.textContent = state.currentSong ? state.currentSong.title : "";
  elements.status.textContent = STATUS_TEXT[state.status] ?? "";
  elements.toggleButton.classList.toggle("is-playing", state.status === "playing");
  elements.toggleButton.disabled = state.status === "finished";
  elements.toggleButton.setAttribute("aria-label", state.status === "playing" ? "一時停止する" : "再生する");
}

// elements: {
//   root: ミニプレイヤー全体の入れ物,
//   main: タップすると連続再生画面を開く部分（曲名・状態を含む）,
//   title, status: 曲名・状態のテキスト,
//   toggleButton, stopButton: 再生/一時停止・停止ボタン,
//   onOpen: mainがタップされたときに呼ばれるコールバック（連続再生画面を開く処理は
//     main.js側で行う。戻り先の画面を覚える仕組みと連動させるため）,
// }
export function initMiniPlayer(newElements) {
  elements = newElements;

  elements.main.addEventListener("click", () => elements.onOpen());

  elements.toggleButton.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePlayPause();
  });

  elements.stopButton.addEventListener("click", (event) => {
    event.stopPropagation();
    stopPlayback();
  });

  onPlaybackStateChange(render);
  onScreenChange((screenName) => {
    currentScreenName = screenName;
    render();
  });
}
