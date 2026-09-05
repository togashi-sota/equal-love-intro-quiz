// js/viewportMeasurement.js（クイズ画面が開いた最初の瞬間だけ上に寄る不具合の根本対応、
// 2026-09-05新設）のテスト。
//
// 【このテストで検証できること／できないこと】このファイルの目的はiOS Safari特有の
// dvh/safe-area確定タイミングの不具合を回避することだが、その不具合自体（Chromiumベースの
// この環境ではそもそも再現しない）は検証できない。代わりに、「実測してCSSカスタム
// プロパティへ書き込む」というこのファイルの責務そのものが正しく動作することを確認する。
import { remeasureViewportVars } from "../js/viewportMeasurement.js";
import { assertEqual } from "./test-utils.js";

export function runViewportMeasurementTests() {
  // モジュール読み込み時点で既に一度measureAndApplyViewportVars()が実行されているはずだが、
  // タイミングに依存しないよう、ここで明示的にもう一度呼んでから検証する。
  remeasureViewportVars();

  const rootStyle = getComputedStyle(document.documentElement);

  // ---- --measured-viewport-heightが、有効なpx値として書き込まれている ----
  const measuredHeight = rootStyle.getPropertyValue("--measured-viewport-height").trim();
  assertEqual(/^\d+(\.\d+)?px$/.test(measuredHeight), true, "--measured-viewport-heightが数値px形式で設定されている");
  assertEqual(parseFloat(measuredHeight) > 0, true, "--measured-viewport-heightは0より大きい（実際のウィンドウの高さを反映している）");

  // ---- --measured-safe-area-inset-top/bottomが、有効なpx値として書き込まれている ----
  // （デスクトップブラウザ・テスト環境ではsafe-area自体は無いため0pxになるが、
  //   「px単位の数値として設定されていること」自体は環境に依存せず検証できる）。
  const measuredTop = rootStyle.getPropertyValue("--measured-safe-area-inset-top").trim();
  const measuredBottom = rootStyle.getPropertyValue("--measured-safe-area-inset-bottom").trim();
  assertEqual(/^\d+(\.\d+)?px$/.test(measuredTop), true, "--measured-safe-area-inset-topが数値px形式で設定されている");
  assertEqual(/^\d+(\.\d+)?px$/.test(measuredBottom), true, "--measured-safe-area-inset-bottomが数値px形式で設定されている");

  // ---- 複数回呼んでも安全（副作用が蓄積しない、同じ値で上書きされるだけ） ----
  remeasureViewportVars();
  remeasureViewportVars();
  const measuredHeightAfterRepeat = getComputedStyle(document.documentElement)
    .getPropertyValue("--measured-viewport-height")
    .trim();
  assertEqual(
    measuredHeightAfterRepeat,
    measuredHeight,
    "複数回呼んでも、ウィンドウサイズが変わっていなければ同じ値のまま（副作用が蓄積しない）"
  );

  // ---- プローブ用の非表示要素が、画面に見える形では存在しない ----
  const probeCandidates = Array.from(document.body.children).filter(
    (el) => el.style.visibility === "hidden" && el.getAttribute("aria-hidden") === "true"
  );
  assertEqual(probeCandidates.length >= 1, true, "safe-area測定用の非表示プローブ要素がbody直下に存在する");
  probeCandidates.forEach((el) => {
    assertEqual(el.style.pointerEvents, "none", "プローブ要素はpointer-events:noneで操作を一切妨げない");
  });
}
