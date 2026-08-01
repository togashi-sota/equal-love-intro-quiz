// 試聴中の曲に合わせて、歌詞を再生位置に同期表示するための共通モジュール。
// 収録曲一覧（songlist.js）とオリジナル問題作成モードの選曲画面（customQuizScreen.js）は
// それぞれ別々の<audio>要素・別々のミニプレイヤーUIを持っているため、
// このモジュールはどちらの<audio>要素・どちらのパネル要素に対しても同じ関数で使えるように、
// 「今どの要素を対象にしているか」を呼び出し時の引数として受け取る設計にしている
// （audioPreview.jsのように内部で1つの<audio>要素だけを覚える設計にはしていない）。
//
// 歌詞データがない曲では、パネル自体を表示しない（音源が未読み込みの曲でエラー表示を
// 出さないのと同じ、このプロジェクトの一貫した方針）。

import { getLyricsData } from "./lyricsStorage.js";

// ユーザーが手動でパネルをスクロールしてから、自動追従を再開するまでの猶予（ミリ秒）。
const MANUAL_SCROLL_SUPPRESS_MS = 4000;

let audioElement = null;
let panelElement = null;
let renderedLines = []; // { element, start, end }
let activeIndex = -1;
let autoScrollEnabled = true;
let suppressAutoScrollUntil = 0;
let isProgrammaticScroll = false;
let programmaticScrollResetTimerId = null;

function handleTimeUpdate() {
  updateActiveLyricsLine(audioElement.currentTime);
}

// シークバー操作・10秒送り/戻しはaudio.currentTimeを直接書き換えるため、
// 標準のseekingイベントが必ず発火する。timeupdateを待たず即座に追従させる。
function handleSeeking() {
  updateActiveLyricsLine(audioElement.currentTime, { immediate: true });
}

// 曲が最後まで再生し終えたら、ハイライトを解除する（行の表示自体は残す）。
function handleEnded() {
  applyActiveIndex(-1);
}

function handlePanelScroll() {
  if (isProgrammaticScroll) return;
  suppressAutoScrollUntil = Date.now() + MANUAL_SCROLL_SUPPRESS_MS;
}

// 現在時刻から該当行のインデックスを求める純粋関数（DOM・音源に一切触れない）。
// start <= currentTime < end を満たす行を「現在行」とする。
// 複数行が同時に該当する場合（ハモリ・掛け合い等でwarnings付きのまま保存されたデータ）は、
// 最後に開始した行（＝最も遅くstartする行）を採用する。linesはstartが時系列順であることが
// Step1のvalidateLyricsData()で保証されているため、先頭から順に見て最後に見つかったものが
// 必ず最も遅く開始した行になる。該当する行が1つもない場合（曲の先頭より前、最後の行より後、
// 行と行の間の空白区間、linesが空）は-1を返す。
export function findActiveLineIndex(lines, currentTime) {
  let result = -1;
  for (let i = 0; i < lines.length; i++) {
    if (currentTime >= lines[i].start && currentTime < lines[i].end) {
      result = i;
    }
  }
  return result;
}

// 行のハイライト（クラスの付け替え）だけを行う。実際に変わったかどうかを返す。
function applyActiveIndex(index) {
  if (index === activeIndex) return false;
  activeIndex = index;
  renderedLines.forEach((line, i) => {
    line.element.classList.toggle("is-current-lyrics-line", i === index);
  });
  return true;
}

function scrollToLine(index, { immediate }) {
  const target = renderedLines[index];
  if (!target || !panelElement) return;

  isProgrammaticScroll = true;
  target.element.scrollIntoView({ block: "center", behavior: immediate ? "auto" : "smooth" });

  // scrollイベントが実際に収まるまでの猶予。厳密な完了検知ではなく、
  // 「このタイミングでのスクロールは自分自身が起こしたもの」と判定できれば十分なため、
  // 一定時間後にフラグを戻すだけの単純な実装にしている。
  if (programmaticScrollResetTimerId !== null) {
    clearTimeout(programmaticScrollResetTimerId);
  }
  programmaticScrollResetTimerId = setTimeout(() => {
    isProgrammaticScroll = false;
    programmaticScrollResetTimerId = null;
  }, 500);
}

// 現在の再生位置を渡し、該当する行のハイライト・自動スクロールを更新する。
// options.immediate: true の場合、自動追従の一時停止中でも即座に（スクロールは瞬間移動で）追従する
// （シーク直後・曲の読み込み直後に使う）。
export function updateActiveLyricsLine(currentTime, options = {}) {
  if (renderedLines.length === 0) return;

  const index = findActiveLineIndex(renderedLines, currentTime);
  const changed = applyActiveIndex(index);

  if (index === -1) return;
  if (!changed && !options.immediate) return; // 同じ行のままなら、通常のtimeupdateでは何もしない

  if (options.immediate) {
    scrollToLine(index, { immediate: true });
    return;
  }

  const shouldAutoScroll = autoScrollEnabled && Date.now() >= suppressAutoScrollUntil;
  if (shouldAutoScroll) {
    scrollToLine(index, { immediate: false });
  }
}

// パネルの中身・購読しているイベントをすべて片付ける。
// 曲を停止する・別の曲へ切り替える・画面を離れるときに必ず呼ぶ。
export function destroyLyricsSync() {
  if (audioElement) {
    audioElement.removeEventListener("timeupdate", handleTimeUpdate);
    audioElement.removeEventListener("seeking", handleSeeking);
    audioElement.removeEventListener("ended", handleEnded);
  }
  if (panelElement) {
    panelElement.removeEventListener("scroll", handlePanelScroll);
    panelElement.textContent = "";
    panelElement.hidden = true;
  }
  if (programmaticScrollResetTimerId !== null) {
    clearTimeout(programmaticScrollResetTimerId);
    programmaticScrollResetTimerId = null;
  }

  audioElement = null;
  panelElement = null;
  renderedLines = [];
  activeIndex = -1;
  suppressAutoScrollUntil = 0;
  isProgrammaticScroll = false;
}

// 指定した曲の歌詞データを取得し、パネルへ描画し、再生位置に合わせた同期表示を開始する。
// 歌詞データがない曲では、パネル自体を表示しないまま何もしない
// （試聴機能自体は今まで通り使える。エラー表示も出さない）。
//
// audioElement/panelElementは、収録曲一覧・オリジナル問題作成モードそれぞれが持つ
// 実際の<audio>要素・歌詞パネル用の要素を毎回渡す想定
// （このモジュール自体はどちらの画面の要素かを知らない）。
export async function loadLyricsForSong(songId, targetAudioElement, targetPanelElement) {
  // 前の曲の表示・イベント購読を必ず先に片付けてから始める
  // （曲を切り替えたときに前の歌詞が残ってしまうことを構造的に防ぐ）。
  destroyLyricsSync();

  const record = await getLyricsData(songId);
  if (!record || !Array.isArray(record.lines) || record.lines.length === 0) {
    return;
  }

  audioElement = targetAudioElement;
  panelElement = targetPanelElement;

  audioElement.addEventListener("timeupdate", handleTimeUpdate);
  audioElement.addEventListener("seeking", handleSeeking);
  audioElement.addEventListener("ended", handleEnded);
  panelElement.addEventListener("scroll", handlePanelScroll);

  panelElement.textContent = "";
  panelElement.hidden = false;

  renderedLines = record.lines.map((line) => {
    const lineElement = document.createElement("p");
    lineElement.className = "synced-lyrics-line";
    lineElement.textContent = line.text;
    panelElement.appendChild(lineElement);
    return { element: lineElement, start: line.start, end: line.end };
  });
  activeIndex = -1;

  updateActiveLyricsLine(audioElement.currentTime, { immediate: true });
}

// 自動スクロールのON/OFFを切り替える。Step3時点ではUIボタンは用意しないが、
// 将来「自動スクロールを止めたい」という要望が出たときにそのまま使える形にしておく。
export function setAutoScrollEnabled(enabled) {
  autoScrollEnabled = enabled;
}
