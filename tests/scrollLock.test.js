// js/scrollLock.js（モーダル／オーバーレイ表示中の背景スクロール固定）のテスト。
// MutationObserverを使った実際の自動監視（initScrollLock）自体は非同期でタイミング依存が
// 強いため、恒久テストの対象にはしない（本人指示の実機・iPhone相当の確認は別途手動で
// 行っている）。ここでは、DOMの状態から「今ロックすべきか」を判断するhasVisibleOverlay()と、
// 実際にbodyへスタイルを適用/解除するapplyScrollLock()・releaseScrollLock()という、
// 同期的に検証できる純粋寄りの部分だけを対象にする。
import { hasVisibleOverlay, applyScrollLock, releaseScrollLock } from "../js/scrollLock.js";
import { assertEqual } from "./test-utils.js";

// テスト用に、本物の.modal-overlay・.lyrics-fullscreen-overlayを一時的にDOMへ追加する
// ヘルパー。本物のindex.htmlのモーダルには一切触れず、テスト専用の要素だけを使う。
function appendOverlay(className) {
  const element = document.createElement("div");
  element.className = className;
  element.hidden = true;
  document.body.appendChild(element);
  return element;
}

export function runScrollLockTests() {
  // ---- hasVisibleOverlay：対象要素が1つも無ければfalse ----
  assertEqual(hasVisibleOverlay(), false, "対象要素が1つもDOMに無ければ、表示中のオーバーレイは無い");

  // ---- .modal-overlayが表示中（hidden=false）ならtrue ----
  const modalOverlay = appendOverlay("modal-overlay");
  assertEqual(hasVisibleOverlay(), false, "追加直後（hidden属性つき）はまだロック対象ではない");
  modalOverlay.hidden = false;
  assertEqual(hasVisibleOverlay(), true, ".modal-overlayが1つでも表示中（hidden=false）ならtrue");
  modalOverlay.hidden = true;
  assertEqual(hasVisibleOverlay(), false, "再びhiddenにすればfalseへ戻る");

  // ---- .lyrics-fullscreen-overlayも同じく対象になる（歌詞全画面表示、2026-08-29統合） ----
  const lyricsOverlay = appendOverlay("lyrics-fullscreen-overlay");
  lyricsOverlay.hidden = false;
  assertEqual(hasVisibleOverlay(), true, "歌詞の全画面表示（.lyrics-fullscreen-overlay）もロック対象に含まれる");
  lyricsOverlay.hidden = true;

  // ---- 2つ同時に開いていても、片方が閉じればもう片方が残っている限りtrueのまま
  //      （フレンド詳細モーダルの上に称号一覧モーダルを重ねて開いた場合と同じ状況） ----
  modalOverlay.hidden = false;
  lyricsOverlay.hidden = false;
  assertEqual(hasVisibleOverlay(), true, "2つとも表示中ならtrue");
  modalOverlay.hidden = true;
  assertEqual(hasVisibleOverlay(), true, "片方を閉じても、もう片方がまだ表示中ならtrueのまま（ロックを解除しない）");
  lyricsOverlay.hidden = true;
  assertEqual(hasVisibleOverlay(), false, "両方閉じて初めてfalseになる");

  modalOverlay.remove();
  lyricsOverlay.remove();

  // ---- applyScrollLock／releaseScrollLock：bodyへ実際にスタイルを適用・解除する ----
  // window.scrollTo()は、ページ自体に123px以上スクロールできる高さが無いと実際には
  // 反映されない（テストページ自体が短いと0にクランプされてしまう）ため、検証用に
  // 一時的な縦長スペーサーを追加してから確認する。
  const originalScrollY = window.scrollY;
  const scrollSpacer = document.createElement("div");
  scrollSpacer.style.height = "2000px";
  document.body.appendChild(scrollSpacer);
  try {
    applyScrollLock(123);
    assertEqual(document.body.style.position, "fixed", "applyScrollLock()はbodyをposition:fixedにする");
    assertEqual(document.body.style.top, "-123px", "applyScrollLock()は指定したスクロール位置をtopのマイナス値として焼き込む");
    assertEqual(document.body.style.overflow, "hidden", "applyScrollLock()はbodyにoverflow:hiddenも付ける");

    releaseScrollLock(123);
    assertEqual(document.body.style.position, "", "releaseScrollLock()はposition指定を解除する");
    assertEqual(document.body.style.top, "", "releaseScrollLock()はtop指定も解除する");
    assertEqual(document.body.style.overflow, "", "releaseScrollLock()はoverflow指定も解除する");
    // 表示環境のズーム・DPIスケーリングにより、window.scrollYがピクセル未満の端数を
    // 返すことがあるため、四捨五入して比較する（本質的な位置の正しさには影響しない）。
    assertEqual(Math.round(window.scrollY), 123, "releaseScrollLock()は指定したスクロール位置へ戻す");
  } finally {
    // 他のテストに影響しないよう、念のため元のスクロール位置・DOMへ戻しておく
    scrollSpacer.remove();
    window.scrollTo(0, originalScrollY);
  }
}
