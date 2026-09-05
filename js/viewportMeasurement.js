// 【2026-09-05新設・本人指示：クイズ画面が開いた最初の瞬間だけ上に寄る不具合の根本対応】
//
// 【背景】.game-frameをviewport高さへ固定している画面（クイズ回答画面・歌詞クイズ対戦・
// オンライン歌詞クイズ対戦・一瞬チャレンジ）で、画面を開いた直後だけ「タイトルへ」等の
// ヘッダーがiPhoneの上端（Dynamic Island付近）に詰まって表示され、効果音設定モーダルを
// 一度開いて閉じると正しい位置（余裕のある位置）に直る、という実機不具合があった。
//
// 【以前の対策とその限界】js/screens.jsのforceViewportHeightRecalcForGameFrame()が、
// モーダル開閉時に偶然発生していた「bodyのposition:fixed切り替え」を画面表示直後に
// 意図的に1回起こすことで、ブラウザ側のdvh/safe-area再計算を誘発しようとしていた。
// しかし実機ではまだ症状が残っており、「position:fixedを一瞬切り替えるだけ」では
// 確実な再計算のトリガーになっていなかったと判断する。
//
// 【根本原因（推定）】iOS Safariでは、`100dvh`という単位・`env(safe-area-inset-top)`という
// 値のどちらも、ページを開いた直後の最初の一定期間だけ、ブラウザのツールバー収縮状態が
// 確定する前の暫定値のまま描画に使われてしまうことがある（実機報告の「モーダルを操作すると
// 直る」は、モーダル操作それ自体に意味があるのではなく、単に「時間が経つ・何らかの
// レイアウト変化が起きる」ことがきっかけでブラウザが値を確定させていた、と考えられる）。
//
// 【今回の対策】CSS側のenv()/dvhの解決をブラウザに任せきりにするのではなく、実際に
// 見えている値をJSで直接測定し、CSSカスタムプロパティとして焼き込む。ブラウザの内部的な
// 確定タイミングに依存せず、常に「今実際に見えている状態」を使えるようにする。
// 測定は、読み込み直後・複数フレーム後・少し時間を置いた後・resize/orientationchange時の
// 複数回行う（1回だけでは、まさに今回のバグと同じ「まだ確定していない値」を掴んでしまう
// 可能性があるため）。
//
// 【安全性】このファイルはCSSカスタムプロパティを書き込むだけで、DOM構造・他の状態management・
// 音声・Firebase等には一切触れない。測定に失敗しても（visualViewport非対応環境等）、
// CSS側のenv()/dvhへ自然にフォールバックするため、実害は無い。

// safe-area-inset-top/bottomの実際の解決値を読み取るための、非表示のプローブ要素。
// 画面には一切表示されない（position:fixed + visibility:hidden + サイズ0）。
const probeElement = document.createElement("div");
probeElement.setAttribute("aria-hidden", "true");
probeElement.style.cssText =
  "position:fixed;top:0;left:0;width:0;height:0;visibility:hidden;pointer-events:none;" +
  "padding-top:env(safe-area-inset-top, 0px);padding-bottom:env(safe-area-inset-bottom, 0px);";
document.body.appendChild(probeElement);

function measureAndApplyViewportVars() {
  const root = document.documentElement;
  const computed = getComputedStyle(probeElement);

  const safeAreaTop = parseFloat(computed.paddingTop) || 0;
  const safeAreaBottom = parseFloat(computed.paddingBottom) || 0;
  // visualViewportの方がwindow.innerHeightより、ソフトウェアキーボード表示中等の
  // 「今実際に見えている高さ」をより正確に反映するため優先する（無ければinnerHeightへ）。
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

  root.style.setProperty("--measured-safe-area-inset-top", `${safeAreaTop}px`);
  root.style.setProperty("--measured-safe-area-inset-bottom", `${safeAreaBottom}px`);
  root.style.setProperty("--measured-viewport-height", `${viewportHeight}px`);
}

// 読み込み直後に1回測定する（多くの環境ではこれで正しい値が取れる）。
measureAndApplyViewportVars();

// 【iOS Safari特有の遅延確定対策】読み込み直後の最初の測定値が、ブラウザ内部でまだ
// 確定していない暫定値である可能性があるため、複数フレーム後・少し時間を置いた後にも
// 再測定して上書きする。何度呼んでも安全な純粋な測定処理のため、正しい値が既に取れていた
// 場合は同じ値で上書きされるだけで実害は無い。
requestAnimationFrame(() => {
  requestAnimationFrame(measureAndApplyViewportVars);
});
setTimeout(measureAndApplyViewportVars, 300);
setTimeout(measureAndApplyViewportVars, 1000);

// 実際に画面サイズ・visualViewportが変化したとき（画面回転・ソフトウェアキーボードの
// 開閉・iOS Safariのツールバー収縮等）にも測り直す。
window.addEventListener("resize", measureAndApplyViewportVars);
window.addEventListener("orientationchange", measureAndApplyViewportVars);
window.visualViewport?.addEventListener("resize", measureAndApplyViewportVars);

// 画面（screenName）が切り替わるたびにも測り直せるよう、呼び出し用にexportしておく
// （js/screens.jsのshowScreen()から、クイズ系画面へ入る瞬間に追加で呼ぶ。既存の
// forceViewportHeightRecalcForGameFrame()と併用し、どちらかが効けば直る、という
// 二重の安全策にする）。
export function remeasureViewportVars() {
  measureAndApplyViewportVars();
}
