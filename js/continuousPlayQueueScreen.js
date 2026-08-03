// 再生キュー画面を組み立てるファイル。
// js/continuousPlay.jsが持つキュー配列をそのまま参照して一覧表示し、再生中の曲を強調、
// タップでその曲へ移動、ドラッグハンドル・↑↓ボタンで曲順を並び替えられるようにする。
// UI/UX再設計（連続再生画面だけでは「この後何が流れるか」が分かりにくいという指摘への対応で新設、
// その後のレビューでドラッグ並び替えを追加）。

import { getPlaybackState, onPlaybackStateChange, jumpToIndex, reorderQueue } from "./continuousPlay.js";

let elements = null;

// ドラッグ中は、再生状態の変化によるrenderQueueList()の再描画で
// 途中のDOM並び替えを上書きしてしまわないようにするためのフラグ。
let isDragging = false;

let actionBannerHideTimeoutId = null;
const ACTION_BANNER_DISPLAY_MS = 2600;

// 並び替え完了時の短い案内（js/songlist.jsのshowSonglistActionBanner()と同じ考え方）。
function showQueueActionBanner(message) {
  elements.actionBanner.textContent = message;
  elements.actionBanner.hidden = false;
  if (actionBannerHideTimeoutId !== null) {
    clearTimeout(actionBannerHideTimeoutId);
  }
  actionBannerHideTimeoutId = setTimeout(() => {
    elements.actionBanner.hidden = true;
    actionBannerHideTimeoutId = null;
  }, ACTION_BANNER_DISPLAY_MS);
}

// ドラッグハンドルをつかんでの並び替え。行全体ではなく専用ハンドルだけを対象にすることで、
// スクロール操作との誤操作を減らす（本人希望）。ハンドルにtouch-action:noneを指定しているため
// （style.css参照）、スマホでもドラッグ中にページが一緒にスクロールしてしまうことはない。
// Pointer Events標準機能のみで実装しており、外部ライブラリは使っていない。
function wireDragHandle(handle, row, getFromIndex) {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const fromIndex = getFromIndex();
    if (fromIndex === -1) return;

    isDragging = true;
    row.classList.add("is-dragging");
    handle.setPointerCapture(event.pointerId);

    // ポインターの今の位置から、置くべき場所を毎回そのまま計算し直してDOMを並び替える
    // （実際のキュー配列への反映は、指を離したときに一度だけ行う）。
    // 以前は「隣の行と1つだけ入れ替える」処理だったため、指を素早く大きく動かすと
    // 移動が追いつかないことがあった（本人から「一気に動かせない」と報告）。
    // 動かしていない行それぞれの中心位置と比べて「ポインターより下にある一番上の行」の
    // 直前に差し込む、という計算に変えたことで、1回のドラッグでどれだけ離れた位置へでも
    // 正しく一気に移動できるようにした（2026-08-06修正）。
    function handleMove(moveEvent) {
      const others = [...elements.list.children].filter((sibling) => sibling !== row);
      const target = others.find((sibling) => {
        const rect = sibling.getBoundingClientRect();
        return moveEvent.clientY < rect.top + rect.height / 2;
      });
      elements.list.insertBefore(row, target ?? null);
    }

    // ドラッグの終了処理。「finished」フラグで、複数のイベントから二重に呼ばれても
    // 1回しか実行されないようにする。
    // pointerup（指を離した）だけに頼ると、スマホでドラッグの途中にOS側のジェスチャー
    // （画面端からのスワイプ操作など）に途中で奪われてpointerupが発火しないことがあり、
    // その場合isDraggingがtrueのまま固まって以降ずっとキュー画面が再描画されなくなる
    // 不具合があった（本人からの「再生キューが重くなる」報告で発覚）。
    // pointercancel・lostpointercapture（何らかの理由でポインター操作が中断／
    // ポインターの捕捉が外れた場合に、原因を問わず必ず発火するイベント）でも
    // 同じ終了処理を呼ぶことで、どんな中断のされ方でも必ずisDraggingが元に戻るようにした
    // （2026-08-06修正）。
    let finished = false;
    function finishDrag() {
      if (finished) return;
      finished = true;
      handle.removeEventListener("pointermove", handleMove);
      handle.removeEventListener("pointerup", finishDrag);
      handle.removeEventListener("pointercancel", finishDrag);
      handle.removeEventListener("lostpointercapture", finishDrag);
      row.classList.remove("is-dragging");
      isDragging = false;

      const finalIndex = [...elements.list.children].indexOf(row);
      if (finalIndex !== fromIndex && finalIndex !== -1) {
        const songTitle = row.querySelector(".queue-row-title").textContent;
        reorderQueue(fromIndex, finalIndex);
        showQueueActionBanner(`「${songTitle}」を${finalIndex + 1}番目に移動しました`);
      } else {
        // 並びが変わらなかった場合も、DOM操作の途中状態が残らないよう描き直す。
        renderQueueList();
      }
    }

    handle.addEventListener("pointermove", handleMove);
    handle.addEventListener("pointerup", finishDrag);
    handle.addEventListener("pointercancel", finishDrag);
    handle.addEventListener("lostpointercapture", finishDrag);
  });
}

// 1行分を作る。<button>の中に<button>を入れられないため（HTMLの仕様上の制約）、
// 行全体は<div>にし、「タップでその曲へ移動する」部分（.queue-row-main）と
// 「並び替え操作」部分（.queue-row-reorder-controls）を兄弟要素として分ける
// （customQuizScreen.jsの選曲行と同じ考え方）。
function buildQueueRow(song, index, isCurrent, isNext, queueLength) {
  const row = document.createElement("div");
  row.className = "queue-row";
  row.classList.toggle("is-current", isCurrent);
  row.classList.toggle("is-next", isNext);

  const mainButton = document.createElement("button");
  mainButton.type = "button";
  mainButton.className = "queue-row-main";
  mainButton.disabled = isCurrent;

  const indexSpan = document.createElement("span");
  indexSpan.className = "queue-row-index";
  indexSpan.textContent = index + 1;
  mainButton.appendChild(indexSpan);

  const titleSpan = document.createElement("span");
  titleSpan.className = "queue-row-title";
  titleSpan.textContent = song.title;
  mainButton.appendChild(titleSpan);

  if (isCurrent) {
    const badge = document.createElement("span");
    badge.className = "queue-row-now-badge";
    badge.textContent = "再生中";
    mainButton.appendChild(badge);
  } else {
    if (isNext) {
      const badge = document.createElement("span");
      badge.className = "queue-row-next-badge";
      badge.textContent = "次";
      mainButton.appendChild(badge);
    }
    mainButton.addEventListener("click", () => jumpToIndex(index));
  }

  row.appendChild(mainButton);

  // 並び替え操作：↑↓ボタン（ドラッグが苦手な方・キーボード操作向けの代替手段として残す）と
  // ドラッグハンドル。ボタンの中にボタンを置けないため、.queue-row-mainとは兄弟にする。
  const controls = document.createElement("div");
  controls.className = "queue-row-reorder-controls";

  const upButton = document.createElement("button");
  upButton.type = "button";
  upButton.className = "queue-row-move-button";
  upButton.textContent = "↑";
  upButton.setAttribute("aria-label", "1つ上へ移動する");
  upButton.disabled = index === 0;
  upButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (index > 0) {
      reorderQueue(index, index - 1);
      showQueueActionBanner(`「${song.title}」を${index}番目に移動しました`);
    }
  });
  controls.appendChild(upButton);

  const downButton = document.createElement("button");
  downButton.type = "button";
  downButton.className = "queue-row-move-button";
  downButton.textContent = "↓";
  downButton.setAttribute("aria-label", "1つ下へ移動する");
  downButton.disabled = index === queueLength - 1;
  downButton.addEventListener("click", (event) => {
    event.stopPropagation();
    if (index < queueLength - 1) {
      reorderQueue(index, index + 1);
      showQueueActionBanner(`「${song.title}」を${index + 2}番目に移動しました`);
    }
  });
  controls.appendChild(downButton);

  const dragHandle = document.createElement("button");
  dragHandle.type = "button";
  dragHandle.className = "queue-row-drag-handle";
  dragHandle.setAttribute("aria-label", "ドラッグして並び替える");
  dragHandle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  wireDragHandle(dragHandle, row, () => [...elements.list.children].indexOf(row));
  controls.appendChild(dragHandle);

  row.appendChild(controls);

  return row;
}

// キューの中身を描き直す。再生状態が変わるたびに呼ぶため、この画面を見ていないときにも
// 裏側で呼ばれるが、非表示のscreenの中身を更新しているだけなので害はない
// （js/continuousPlayScreen.jsのrenderState()と同じ考え方）。ドラッグ中は呼んでも何もしない
// （ドラッグ中のDOM並び替えを再描画で上書きしないようにするため）。
// 「次に流れる曲」も薄く強調する（UI/UX再設計：現在再生中だけでなく次も一目で
// 分かるようにしてほしいという指摘への対応）。1曲リピート中は次＝現在と同じ位置になるため、
// 二重に強調しないようnextIndexがcurrentIndexと異なるときだけ適用する。
function renderQueueList() {
  if (isDragging) return;
  const state = getPlaybackState();
  elements.sourceChip.textContent =
    state.queueLength > 0 ? `${state.sourceLabel}・全${state.queueLength}曲` : "";
  elements.list.innerHTML = "";
  state.queue.forEach((song, index) => {
    const isNext = state.nextIndex === index && state.nextIndex !== state.currentIndex;
    elements.list.appendChild(
      buildQueueRow(song, index, index === state.currentIndex, isNext, state.queueLength)
    );
  });
}

// この画面を開くたびに呼ぶ。中身を最新の状態で組み立て直したうえで、再生中の曲が
// 画面外にあっても迷わないよう、その行までスクロールする。
// 画面を開き直す時点では、ドラッグ操作が実際に進行中ということはあり得ないため、
// isDraggingを必ずfalseへ戻しておく（万一何らかの理由でtrueのまま固まっていても、
// この画面を開き直せば必ず復帰できるようにするための保険。2026-08-06追加）。
export function renderQueueScreen() {
  isDragging = false;
  renderQueueList();
  const currentRow = elements.list.querySelector(".queue-row.is-current");
  if (currentRow) {
    currentRow.scrollIntoView({ block: "center" });
  }
}

// elements: {
//   sourceChip: 再生元・曲数の表示,
//   list: キューの行を並べる場所,
//   actionBanner: 並び替え完了時の短い案内（UI/UX再設計で追加）,
// }
export function initContinuousPlayQueueScreen(newElements) {
  elements = newElements;
  onPlaybackStateChange(renderQueueList);
}
