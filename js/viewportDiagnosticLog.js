// 「iPhone実機で画面下部に白い帯ができる」バグの原因調査のための、画面サイズ・
// safe-area・game-frameの実測値を1本のタイムラインとして記録する共通モジュール
// （2026-11-XX新設、本人指示：ブラウザのエミュレーションでは再現しないため、実機で
// 原因を特定できる診断ログを追加してほしいとの依頼への対応）。
//
// 【なぜ必要か】このバグはiOS Safari特有のツールバー収縮・100vh/100dvhの誤差・
// visualViewportのタイミングに起因すると疑われるが、開発環境（Chromiumベースの
// エミュレーション）ではSafari特有のこの挙動自体が再現できない。本人がiPhone実機で
// この画面を開くたびに、そのときの実測値を記録として残し、後から「どの画面で・
// どのタイミングで・実際の値がどうズレていたか」を確認できるようにする。
//
// 【設計方針】js/audioDiagnosticLog.jsと全く同じ構造（メモリ上に時系列で記録し、
// js/debugAudioLogScreen.jsの隠し画面からまとめてコピーできるようにする）。
// ユーザー向けの表示・ゲーム進行には一切影響しない、完全に読み取り専用の記録係。

const MAX_ENTRIES = 300; // 画面遷移・リサイズのたびに記録するため、音声ログより上限を抑える
const entries = [];
const logStartTime = performance.now();

// 【safe-area-inset-bottomの実測値の取り方】env()はCSSでしか直接使えないため、
// 一時的に非表示のdiv要素へpadding-bottom: env(safe-area-inset-bottom)を当て、
// getComputedStyle()で計算後の値（px）を読み取る（DOMに一切見た目の影響を与えない）。
let safeAreaProbeElement = null;
function measureSafeAreaInsetBottomPx() {
  try {
    if (!safeAreaProbeElement) {
      safeAreaProbeElement = document.createElement("div");
      safeAreaProbeElement.style.cssText =
        "position:fixed;visibility:hidden;pointer-events:none;height:0;width:0;padding-bottom:env(safe-area-inset-bottom);";
      document.body.appendChild(safeAreaProbeElement);
    }
    return parseFloat(getComputedStyle(safeAreaProbeElement).paddingBottom) || 0;
  } catch {
    return null;
  }
}

// 今この瞬間の画面サイズ・game-frameの実測値をまとめて1件記録する。
// label: "[SCREEN_CHANGE]" 「onlineLyricsBattleQuestion」等、何がきっかけの記録かを表す短い文字列。
export function captureViewportSnapshot(label) {
  try {
    const gameFrame = document.querySelector(".game-frame");
    const gameFrameRect = gameFrame?.getBoundingClientRect();
    const vv = window.visualViewport;

    const snapshot = {
      screen: document.body.dataset.screen ?? null,
      windowInnerWH: `${window.innerWidth}x${window.innerHeight}`,
      docClientHeight: document.documentElement.clientHeight,
      docScrollHeight: document.documentElement.scrollHeight,
      bodyScrollHeight: document.body.scrollHeight,
      bodyClientHeight: document.body.clientHeight,
      visualViewportH: vv ? Math.round(vv.height) : null,
      visualViewportOffsetTop: vv ? Math.round(vv.offsetTop) : null,
      visualViewportScale: vv ? Number(vv.scale.toFixed(2)) : null,
      gameFrameHeight: gameFrameRect ? Math.round(gameFrameRect.height) : null,
      gameFrameBottom: gameFrameRect ? Math.round(gameFrameRect.bottom) : null,
      safeAreaInsetBottomPx: measureSafeAreaInsetBottomPx(),
      isStandalonePwa: window.matchMedia?.("(display-mode: standalone)").matches ?? null,
      devicePixelRatio: window.devicePixelRatio,
      // bodyの下端がgame-frameの下端より下にはみ出している量（＝白い帯の疑い量）。
      // 正の値が大きいほど「bodyのほうが縦に大きい」＝スクロールできてしまう余地がある。
      bodyMinusGameFrameHeight:
        gameFrameRect != null ? Math.round(document.body.scrollHeight - gameFrameRect.height) : null,
    };

    const elapsedMs = Math.round(performance.now() - logStartTime);
    entries.push({ elapsedMs, label, snapshot });
    if (entries.length > MAX_ENTRIES) {
      entries.shift();
    }
  } catch (error) {
    // 診断ログ自体が本編の動作に影響してはならないため、例外は握りつぶす。
  }
}

// 現在の記録全体を、コピー&ペーストしやすい1つのテキストへ整形する。
export function formatViewportDiagnosticLogText() {
  if (entries.length === 0) {
    return "（まだ記録がありません。白い帯が出る画面を開いてから、もう一度この画面を開いてください）";
  }
  const lines = entries.map((entry) => {
    const timeLabel = `+${String(entry.elapsedMs).padStart(7, " ")}ms`;
    let line = `${timeLabel}  ${entry.label}`;
    try {
      line += `  ${JSON.stringify(entry.snapshot)}`;
    } catch {
      line += `  ${String(entry.snapshot)}`;
    }
    return line;
  });
  return lines.join("\n");
}

export function clearViewportDiagnosticLog() {
  entries.length = 0;
}

export function getViewportDiagnosticLogCount() {
  return entries.length;
}
