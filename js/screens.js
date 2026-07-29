// 画面切り替えを担当するファイル。
// 「スタート画面」「クイズ画面」「結果画面」のうち、どれか1つだけに
// is-active クラスを付け、それ以外からは外すことで表示を切り替える。

// 画面名(screenName)と、対応するHTML要素(id)の対応表。
// 新しい画面を増やしたくなったときは、ここに1行足すだけでよい。
const SCREEN_ELEMENTS = {
  start: document.getElementById("start-screen"),
  quiz: document.getElementById("quiz-screen"),
  result: document.getElementById("result-screen"),
  songlist: document.getElementById("songlist-screen"),
  history: document.getElementById("history-screen"),
  historyDetail: document.getElementById("history-detail-screen"),
  specialModes: document.getElementById("special-modes-screen"),
  weakSongs: document.getElementById("weak-songs-screen"),
};

// 指定した画面だけを表示し、それ以外の画面は隠す。
export function showScreen(screenName) {
  for (const [name, element] of Object.entries(SCREEN_ELEMENTS)) {
    element.classList.toggle("is-active", name === screenName);
  }

  // 今表示している画面名をbodyのdata属性にも反映する。
  // CSS側（style.css）が「クイズ画面のときだけ背景演出を控えめにする」といった
  // 画面ごとの見た目の調整をできるようにするためのフック。
  document.body.dataset.screen = screenName;
}
