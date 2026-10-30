// 新しいライブコールの「3つのモードの切り替え」の部品（2026-10-31 live-unify）。
// コール表・ライブコール（js/liveCallScreen.js）とカラオケ（js/karaokeSyncScreen.js）の上に同じ形で出し、
// 曲のページへ戻らずにモードの間を移れるようにする。
// ・今のモードは押せない（aria-current="page"）。
// ・使えないモード（音源が無い・コール表が無い等）は押せない（disabled）。理由は title に入れる。
// ・移ると、今のモードの再生は止まる（各モードの片付けで）。再生中の誤操作を増やさないよう、押せる所は上の小さな列だけ。
export const LIVE_CALL_MODE_TABS = [
  { id: "sheet", label: "コール表" },
  { id: "live", label: "ライブコール" },
  { id: "karaoke", label: "カラオケ" },
];

// current：今のモード。avail：js/liveCallData.js の computeModeAvailability の戻り値（無ければ全部使えない扱い）。
// onSelect(mode)：ほかのモードが押されたとき
export function buildModeTabs(current, avail, onSelect) {
  const nav = document.createElement("nav");
  nav.className = "lc-mode-tabs";
  nav.setAttribute("aria-label", "遊び方を切り替える");
  for (const tab of LIVE_CALL_MODE_TABS) {
    const isCurrent = tab.id === current;
    const ok = isCurrent || Boolean(avail?.[tab.id]?.ok);
    const item = document.createElement("button");
    item.type = "button";
    item.className = `lc-mode-tab is-${tab.id}${isCurrent ? " is-current" : ""}`;
    item.textContent = tab.label;
    if (isCurrent) item.setAttribute("aria-current", "page");
    if (!ok) {
      item.disabled = true;
      item.title = avail?.[tab.id]?.reason ?? "";
    }
    item.addEventListener("click", () => {
      if (isCurrent || !ok) return;
      onSelect(tab.id);
    });
    nav.appendChild(item);
  }
  return nav;
}
