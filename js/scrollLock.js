// モーダル／オーバーレイ表示中、背景ページが指の操作で動いてしまう問題への対策
// （2026-08-29新設、本人指示：「モーダル／オーバーレイが開いている間は、背景ページは
// 完全に固定する」をアプリ全体で統一する）。
//
// 【技術的背景】iOS Safariでは、bodyにoverflow:hiddenを付けるだけでは、モーダルの
// 背景（.modal-overlayの外側や、モーダルが乗っている画面そのもの）を指でスワイプしたときに
// 背後のページがラバーバンド（バウンス）スクロールしてしまう問題が残ることがある。
// 確実に止めるため、モーダルが開いている間はbody自体をposition:fixedにしてその場に
// 固定し、開く直前のスクロール位置をtopのマイナス値として焼き込む。閉じるときにこれを
// 解除し、window.scrollTo()で元の位置へ正確に戻す。
// この定番の対策は、以前js/lyricsFullscreen.js（歌詞の全画面表示）が個別に実装していたが、
// モーダル全般（.modal-overlay、40件以上）にも同じ問題があったため、共通処理としてこの
// ファイルへ切り出し、両方から使う一本化した仕組みにした（本人指示：「可能であれば共通の
// スクロールロック処理に統一してください」）。
//
// 【対象】.modal-overlayクラスを持つすべての要素と、歌詞の全画面表示
// （.lyrics-fullscreen-overlay）。個別のモーダルのopen/close処理を書き換える必要はなく、
// 既存の「hidden属性で表示/非表示を切り替える」という統一されたパターンをMutationObserverで
// 監視するだけなので、今後追加される新しいモーダルにも自動的に適用される（本人指示：
// 「今後新しいモーダルを追加した場合にも同じ問題が起こりにくい設計にしてほしい」）。
// 新しいモーダルも、既存のとおりindex.htmlに直接class="modal-overlay"で書き、hidden属性で
// 開閉すれば、このファイルには一切手を加える必要がない。
//
// 【壊さないもの】.modal-card自体のoverflow-y:autoによる内部スクロールは、bodyとは
// 別の要素なのでそのまま動作する。ロックはbody（画面全体）の動きだけを止める。
const OVERLAY_SELECTOR = ".modal-overlay, .lyrics-fullscreen-overlay";

// 現在DOM上にある対象要素のうち、1つでも表示中（hidden属性が付いていない）かどうかを
// 判定する。DOMは読むだけで書き換えない。
export function hasVisibleOverlay(root = document) {
  return Array.from(root.querySelectorAll(OVERLAY_SELECTOR)).some((element) => !element.hidden);
}

// 指定したスクロール位置でbodyを固定する。
export function applyScrollLock(scrollY) {
  document.body.style.position = "fixed";
  document.body.style.top = `-${scrollY}px`;
  document.body.style.left = "0";
  document.body.style.right = "0";
  document.body.style.overflow = "hidden";
}

// bodyの固定を解除し、指定したスクロール位置へ戻す。
export function releaseScrollLock(scrollY) {
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.left = "";
  document.body.style.right = "";
  document.body.style.overflow = "";
  window.scrollTo(0, scrollY);
}

let isLocked = false;
let lockedScrollY = 0;

// 対象要素のhidden属性が変わるたびに呼ばれ、「今ロックすべきか」を毎回DOM状態から
// 数え直して判断する（個別に開閉カウントを増減させる方式だと、想定外の呼び出し順で
// カウントがずれる恐れがあるため、常に実際のDOM状態を正として同期する設計にしている。
// これにより、フレンド詳細モーダルの上に称号一覧モーダルを重ねて開いたまま片方だけ
// 閉じるような場合でも、もう片方が開いている間はロックが正しく維持される）。
function syncScrollLockState() {
  const shouldLock = hasVisibleOverlay();
  if (shouldLock && !isLocked) {
    isLocked = true;
    lockedScrollY = window.scrollY;
    applyScrollLock(lockedScrollY);
  } else if (!shouldLock && isLocked) {
    isLocked = false;
    releaseScrollLock(lockedScrollY);
  }
}

// アプリ起動時に1回だけ呼ぶ想定（js/main.js参照）。
export function initScrollLock() {
  syncScrollLockState(); // 起動時点ですでに表示中の対象があれば反映する

  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some(
      (mutation) => mutation.attributeName === "hidden" && mutation.target.matches?.(OVERLAY_SELECTOR)
    );
    if (relevant) syncScrollLockState();
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["hidden"], subtree: true });

  return observer;
}
