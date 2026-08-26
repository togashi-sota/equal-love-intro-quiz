// 【一時的な実機診断コード・17-17章】お祝いポップアップ下部の白い領域の正体を、
// 推測ではなくiPhone実機上で直接判定するための、使い捨ての診断ツール。
//
// これまで3回（17-12・17-13・17-15章）・4回目（17-16章）とheightまわりの修正を重ねても
// 実機で直らなかったため、本人の指示により「白い領域が実際には何なのか」を目視・数値の
// 両方で切り分けられるようにする：
//   ①html・body・オーバーレイの背景を、はっきり違う色（緑・青・赤）に一時的に変更する。
//     白い領域が赤くなればオーバーレイは届いている、青くなればbodyが露出している、
//     緑になればhtmlが露出している、それでも白いままならdocument外（PWAのビューポート・
//     WebKit側の領域）の可能性が高い、という切り分けができる。
//   ②画面上部に、原因調査に必要な数値（window.innerHeight・visualViewport各種・
//     オーバーレイ/bodyのgetBoundingClientRect()等）を表示するパネルを出す。
//     Mac・Safari Web Inspectorが無くても、iPhone実機のスクリーンショットだけで
//     読み取れるようにするため。
//
// 【重要・本番へ絶対に残さないこと】本番の見た目を一時的に破壊する診断専用コードのため、
// 原因が判明し次第、このファイル自体と、js/centerCelebration.js側の
// import文・initDiagnosticOverlay()の呼び出し2箇所を完全に削除すること。
// 恒久テストの対象にもしない（診断用の使い捨てコードのため）。

const PANEL_ID = "celebration-diagnostic-panel";

function formatNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "null";
  return value.toFixed(1);
}

function collectDiagnosticLines(overlayElement) {
  const vv = window.visualViewport;
  const overlayRect = overlayElement.getBoundingClientRect();
  const bodyRect = document.body.getBoundingClientRect();
  const htmlStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  const overlayStyle = getComputedStyle(overlayElement);

  return [
    `innerH/W: ${window.innerHeight} / ${window.innerWidth}`,
    `html clientH/scrollH: ${document.documentElement.clientHeight} / ${document.documentElement.scrollHeight}`,
    `body clientH/scrollH: ${document.body.clientHeight} / ${document.body.scrollHeight}`,
    `vv h/w: ${formatNumber(vv?.height)} / ${formatNumber(vv?.width)}`,
    `vv offsetTop/Left: ${formatNumber(vv?.offsetTop)} / ${formatNumber(vv?.offsetLeft)}`,
    `overlay rect top/bottom: ${formatNumber(overlayRect.top)} / ${formatNumber(overlayRect.bottom)}`,
    `overlay rect height: ${formatNumber(overlayRect.height)}`,
    `body rect top/bottom: ${formatNumber(bodyRect.top)} / ${formatNumber(bodyRect.bottom)}`,
    `html bg: ${htmlStyle.backgroundColor}`,
    `body bg: ${bodyStyle.backgroundColor}`,
    `overlay position: ${overlayStyle.position}`,
    `overlay top/bottom: ${overlayStyle.top} / ${overlayStyle.bottom}`,
    `overlay height: ${overlayStyle.height}`,
    `overlay inset: ${overlayStyle.inset || "(inset未対応ブラウザ)"}`,
  ];
}

function renderPanel(overlayElement) {
  let panel = document.getElementById(PANEL_ID);
  if (!panel) {
    panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText = [
      "position:fixed",
      "top:0",
      "left:0",
      "right:0",
      "z-index:999999",
      "background:rgba(0,0,0,0.85)",
      "color:#33ff66",
      "font-family:monospace",
      "font-size:10px",
      "line-height:1.4",
      "padding:6px 8px",
      "white-space:pre-wrap",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(panel);
  }
  panel.textContent = `[診断パネル・17-17章]\n${collectDiagnosticLines(overlayElement).join("\n")}`;
}

// html・body・オーバーレイの背景を、はっきり違う色へ一時的に変更する。
// 「白い領域がどの要素の外側か」を目視で判別するための処置（本人指示）。
function applyDiagnosticColors(overlayElement) {
  document.documentElement.style.setProperty("background", "#2ecc71", "important"); // html＝緑
  document.body.style.setProperty("background", "#3498db", "important"); // body＝青
  overlayElement.style.setProperty("background", "rgba(255, 0, 0, 0.55)", "important"); // overlay＝半透明の赤
}

let listenersAttached = false;

// お祝いが表示されるたびに呼ぶ（大場花菜→夢の続きの連続表示でも、そのたびに色・パネルを
// 最新の状態へ反映し直す）。
export function initDiagnosticOverlay(overlayElement) {
  applyDiagnosticColors(overlayElement);
  renderPanel(overlayElement);

  if (!listenersAttached) {
    listenersAttached = true;
    const refresh = () => renderPanel(overlayElement);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", refresh);
      window.visualViewport.addEventListener("scroll", refresh);
    }
  }
}
