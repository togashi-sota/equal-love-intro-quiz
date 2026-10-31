// 歴代センターの「1枚表」の画面部品（2026-11-01 R8・本人の依頼 3 で新設）。
// データの組み立て・倍率の計算は js/centerSheet.js（画面に依存しない関数）に任せ、ここは描画と操作だけを担当する。
//
// 見せ方：
//  ・表全体を、スクロールせずに画面へ収まる大きさへ縮小して見せる（CSS の transform: scale。表そのものは 12px の文字で組む）
//  ・画面が横に広いとき（PC・横向き）は、行を左右2段に分けたほうが大きく見えるなら2段にする（pickSheetLayout）
//  ・縮小して文字が小さくなるとき（スマホなど）は、表を押すと「拡大ビューア」を開く。
//    ビューアでは押した場所の付近を等倍で出し、ドラッグで移動、2本の指（ピンチ）・［＋］［－］・Ctrl＋ホイールで拡大縮小できる
//  ・曲名を押すと、その曲のページへ（onOpenSong）。凡例のメンバーを押すと、その人のマスだけを目立たせる
import { CENTER_TABLE_COLUMNS } from "./centerTable.js";
import { CENTER_SHEET_SIZE, fitSheetFontSize, splitSheetRows, pickSheetLayout, fitSheetScale } from "./centerSheet.js";
import { applyScrollLock, releaseScrollLock } from "./scrollLock.js";

// 縮小した表で、これより小さい倍率なら、マスを直接押させず「押すと拡大」にする（12px × 0.75 ＝ 9px）
const DIRECT_TAP_MIN_SCALE = 0.75;
const VIEWER_MAX_ZOOM = 2.5;

// ビューアの拡大には CSS の zoom を使う（transform と違い、レイアウトごと大きくなるので、
// 列の見出し・左端の「1st」の列を position: sticky で画面の端に残せる）。zoom を知らないブラウザだけ transform にする
function supportsCssZoom() {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("zoom", "2");
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---- 表（拡大・縮小する前の1枚） ----

function buildSongCell(entry, rowSpan) {
  const td = el("td", "cs-song");
  td.dataset.songId = entry.song.id;
  if (rowSpan > 1) td.rowSpan = rowSpan;
  const button = el("button", "cs-song-button");
  button.type = "button";
  button.dataset.songId = entry.song.id;
  button.setAttribute("aria-label", `${entry.song.title}のページを開く`);
  const tagWidth = entry.tag ? 26 : 0;
  const title = el("span", "cs-song-title", entry.song.title);
  title.style.fontSize = `${fitSheetFontSize(entry.song.title, CENTER_SHEET_SIZE.songWidth - 10 - tagWidth)}px`;
  button.appendChild(title);
  if (entry.tag) button.appendChild(el("span", "cs-tag", entry.tag));
  td.appendChild(button);
  return td;
}

function buildCenterCell(entry, rowSpan) {
  const { cell } = entry;
  const td = el("td", `cs-center is-${cell.tone}`);
  if (rowSpan > 1) td.rowSpan = rowSpan;
  td.dataset.names = cell.names.join(",");
  if (cell.swatches.length >= 2) td.classList.add("is-multi");
  const box = el("div", "cs-swatches");
  if (cell.swatches.length > 0) {
    cell.swatches.forEach((swatch) => {
      const span = el("span", "cs-swatch", swatch.name);
      span.style.backgroundColor = swatch.hex;
      span.style.color = swatch.textColor;
      span.dataset.name = swatch.name;
      box.appendChild(span);
    });
  } else {
    const text = { all: "全員", none: "なし" }[cell.tone] ?? "未確認";
    box.appendChild(el("span", "cs-swatch is-plain", text));
  }
  td.appendChild(box);
  return td;
}

// 1つの列（表題曲など）の中の曲を、行（line）ごとのマスにする。
// 曲の数が行の数より少ないときは、最後の曲のマスを下まで伸ばす（参考画像と同じ。空いた所に線を引かない）
function columnCellsByLine(entries, lineCount) {
  const cells = Array.from({ length: lineCount }, () => null);
  if (entries.length === 0) {
    cells[0] = { entry: null, rowSpan: lineCount };
    return cells;
  }
  entries.forEach((entry, index) => {
    const isLast = index === entries.length - 1;
    cells[index] = { entry, rowSpan: isLast ? lineCount - index : 1 };
  });
  return cells;
}

function buildRowBody(row) {
  const tbody = el("tbody", `cs-row is-${row.kind}`);
  tbody.dataset.rowKey = row.key;
  const perColumn = CENTER_TABLE_COLUMNS.map(({ key }) => columnCellsByLine(row.columns[key], row.lineCount));
  for (let line = 0; line < row.lineCount; line += 1) {
    const tr = el("tr", "cs-line");
    if (line === 0) {
      const th = el("th", "cs-label");
      th.scope = "rowgroup";
      th.rowSpan = row.lineCount;
      th.appendChild(el("span", "cs-label-main", row.label));
      if (row.subLabel) th.appendChild(el("span", "cs-label-sub", row.subLabel));
      th.title = row.releaseDate ? `${row.workTitle}（${row.releaseDate.replaceAll("-", ".")}）` : row.workTitle;
      tr.appendChild(th);
    }
    perColumn.forEach((cells) => {
      const slot = cells[line];
      if (!slot) return; // 上のマスが伸びている
      if (slot.entry) {
        tr.append(buildSongCell(slot.entry, slot.rowSpan), buildCenterCell(slot.entry, slot.rowSpan));
      } else {
        const songTd = el("td", "cs-song is-empty");
        const centerTd = el("td", "cs-center is-empty");
        songTd.rowSpan = slot.rowSpan;
        centerTd.rowSpan = slot.rowSpan;
        tr.append(songTd, centerTd);
      }
    });
    tbody.appendChild(tr);
  }
  return tbody;
}

function buildTable(rows) {
  const table = el("table", "cs-table");
  const colgroup = el("colgroup");
  const addCol = (className, width) => {
    const col = el("col", className);
    col.style.width = `${width}px`;
    colgroup.appendChild(col);
  };
  addCol("cs-col-label", CENTER_SHEET_SIZE.labelWidth);
  CENTER_TABLE_COLUMNS.forEach(() => {
    addCol("cs-col-song", CENTER_SHEET_SIZE.songWidth);
    addCol("cs-col-center", CENTER_SHEET_SIZE.centerWidth);
  });
  table.appendChild(colgroup);
  const thead = el("thead");
  const tr = el("tr");
  const corner = el("th", "cs-head cs-corner", "");
  corner.scope = "col";
  tr.appendChild(corner);
  CENTER_TABLE_COLUMNS.forEach((column) => {
    const th = el("th", `cs-head is-${column.key}`, column.label);
    th.scope = "colgroup";
    th.colSpan = 2;
    tr.appendChild(th);
  });
  thead.appendChild(tr);
  table.appendChild(thead);
  rows.forEach((row) => table.appendChild(buildRowBody(row)));
  return table;
}

function buildLegend(model) {
  const legend = el("div", "cs-legend");
  legend.appendChild(el("span", "cs-legend-title", "凡例"));
  model.legend.forEach((item) => {
    const button = el("button", "cs-legend-member");
    button.type = "button";
    button.dataset.name = item.name;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${item.name}のマスを目立たせる`);
    const swatch = el("span", "cs-legend-swatch");
    swatch.style.backgroundColor = item.hex;
    button.append(swatch, document.createTextNode(item.isGraduated ? `${item.name}（卒業）` : item.name));
    legend.appendChild(button);
  });
  const note = (className, sample, text) => {
    const span = el("span", `cs-legend-note ${className}`);
    span.append(sample, document.createTextNode(text));
    legend.appendChild(span);
  };
  const multi = el("span", "cs-legend-sample is-multi");
  multi.append(el("i"), el("i"));
  note("is-multi-note", multi, "2色＝2人センター");
  note("is-singer-note", el("span", "cs-legend-sample is-singer"), "斜線＝センターの区別が無い曲（歌うメンバー）");
  note("is-all-note", el("span", "cs-legend-sample is-all", "全員"), "＝全員がセンター");
  return legend;
}

// 表1枚ぶんの要素を作る。layout："single"（1段）／"double"（左右2段）
export function renderCenterSheet(model, { layout = "single" } = {}) {
  const sheet = el("div", "cs-sheet");
  sheet.dataset.layout = layout;
  const lastSingle = [...model.rows].reverse().find((row) => row.kind === "single");
  const caption = el("p", "cs-caption");
  caption.append(el("b", "", "＝LOVE 歴代センター 1枚表"), el("span", "", `1st〜${lastSingle?.label ?? ""}・アルバム・他（配信限定・特別曲）`));
  sheet.appendChild(caption);
  const tables = el("div", "cs-tables");
  const groups = layout === "double" ? splitSheetRows(model.rows) : [model.rows];
  groups.filter((rows) => rows.length > 0).forEach((rows) => tables.appendChild(buildTable(rows)));
  sheet.append(tables, buildLegend(model));
  return sheet;
}

// ---- 画面の部品（縮小した1枚＋拡大ビューア） ----

// options.onOpenSong(songId)：曲名を押したとき
// 戻り値：{ element, fit(), focusSong(songId), openViewer(), closeViewer(), getState() }
export function createCenterSheetPanel(model, { onOpenSong = null } = {}) {
  const panel = el("div", "cs-panel");
  const toolbar = el("div", "cs-toolbar");
  const hint = el("p", "cs-hint", "");
  const zoomButton = el("button", "cs-open-viewer", "拡大して見る");
  zoomButton.type = "button";
  toolbar.append(hint, zoomButton);
  const frame = el("div", "cs-frame");
  frame.setAttribute("role", "region");
  frame.setAttribute("aria-label", "歴代センターの1枚表");
  const inner = el("div", "cs-frame-inner");
  const cover = el("button", "cs-frame-cover");
  cover.type = "button";
  cover.setAttribute("aria-label", "1枚表を拡大して見る");
  frame.append(inner, cover);
  panel.append(toolbar, frame);

  const state = { layout: null, scale: 1, natural: { width: 0, height: 0 }, highlight: null, viewer: null };
  let sheet = null;

  function applyHighlight(root) {
    if (!root) return;
    root.classList.toggle("has-highlight", Boolean(state.highlight));
    root.querySelectorAll(".cs-center").forEach((td) => {
      const names = td.dataset.names ? td.dataset.names.split(",") : [];
      td.classList.toggle("is-hit", Boolean(state.highlight) && names.includes(state.highlight));
    });
    root.querySelectorAll(".cs-legend-member").forEach((button) => {
      const isActive = button.dataset.name === state.highlight;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  // 表の中のクリック（曲名・凡例）。縮小表とビューアの両方で使う
  function handleSheetClick(event) {
    const legendButton = event.target.closest(".cs-legend-member");
    if (legendButton) {
      state.highlight = state.highlight === legendButton.dataset.name ? null : legendButton.dataset.name;
      applyHighlight(sheet);
      applyHighlight(state.viewer?.sheet);
      return;
    }
    const songButton = event.target.closest(".cs-song-button");
    if (songButton) {
      closeViewer();
      onOpenSong?.(songButton.dataset.songId);
    }
  }

  function renderInto(layout) {
    sheet = renderCenterSheet(model, { layout });
    sheet.addEventListener("click", handleSheetClick);
    inner.replaceChildren(sheet);
    applyHighlight(sheet);
    state.layout = layout;
  }

  // 画面の幅・高さに合わせて、1段／2段と倍率を決め直す（開いたとき・画面の向きや大きさが変わったとき）
  function fit() {
    const availableWidth = frame.clientWidth;
    if (!availableWidth) {
      if (!sheet) renderInto("single");
      return;
    }
    const frameTop = frame.getBoundingClientRect().top + window.scrollY;
    const availableHeight = Math.max(220, window.innerHeight - frameTop - 12);
    const picked = pickSheetLayout(model, { width: availableWidth, height: availableHeight });
    if (picked.layout !== state.layout || !sheet) renderInto(picked.layout);
    state.natural = { width: sheet.offsetWidth, height: sheet.offsetHeight };
    state.scale = fitSheetScale(state.natural, { width: availableWidth, height: availableHeight });
    inner.style.transform = `scale(${state.scale})`;
    inner.style.width = `${state.natural.width}px`;
    inner.style.marginLeft = `${Math.max(0, (availableWidth - state.natural.width * state.scale) / 2)}px`;
    frame.style.height = `${Math.ceil(state.natural.height * state.scale)}px`;
    const canTapDirectly = state.scale >= DIRECT_TAP_MIN_SCALE;
    cover.hidden = canTapDirectly;
    frame.classList.toggle("is-small", !canTapDirectly);
    hint.textContent = canTapDirectly
      ? "曲名を押すと、その曲のページへ。凡例の名前を押すと、その人のマスが目立ちます"
      : "表を押すと拡大します（押した所の近くを大きく表示）";
  }

  // 縮小表の上で押した位置を、表そのもの（拡大・縮小する前）の位置に直す
  function pointOnSheet(event) {
    const rect = inner.getBoundingClientRect();
    if (!rect.width) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * state.natural.width,
      y: ((event.clientY - rect.top) / rect.height) * state.natural.height,
    };
  }

  cover.addEventListener("click", (event) => openViewer(pointOnSheet(event)));
  zoomButton.addEventListener("click", () => openViewer(null));

  // ---- 拡大ビューア ----
  function openViewer(point) {
    if (state.viewer) return;
    const overlay = el("div", "cs-viewer");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "歴代センターの1枚表（拡大）");
    const header = el("div", "cs-viewer-header");
    header.appendChild(el("p", "cs-viewer-title", "センター1枚表"));
    const controls = el("div", "cs-viewer-controls");
    const makeButton = (className, text, label) => {
      const button = el("button", className, text);
      button.type = "button";
      button.setAttribute("aria-label", label);
      controls.appendChild(button);
      return button;
    };
    const zoomOut = makeButton("cs-viewer-zoom-out", "－", "縮小");
    const zoomLabel = el("span", "cs-viewer-zoom-label", "");
    controls.appendChild(zoomLabel);
    const zoomIn = makeButton("cs-viewer-zoom-in", "＋", "拡大");
    const fitAll = makeButton("cs-viewer-fit", "全体", "全体を表示");
    const close = makeButton("cs-viewer-close", "閉じる", "拡大表示を閉じる");
    header.appendChild(controls);
    const scroller = el("div", "cs-viewer-scroll");
    const canvas = el("div", "cs-viewer-canvas");
    const viewerSheet = renderCenterSheet(model, { layout: state.layout ?? "single" });
    viewerSheet.addEventListener("click", handleSheetClick);
    canvas.appendChild(viewerSheet);
    scroller.appendChild(canvas);
    const footer = el("p", "cs-viewer-hint", "ドラッグで移動・2本の指で拡大縮小。曲名を押すと曲のページへ");
    overlay.append(header, scroller, footer);
    document.body.appendChild(overlay);
    applyHighlight(viewerSheet);

    const natural = { width: viewerSheet.offsetWidth, height: viewerSheet.offsetHeight };
    const useCssZoom = supportsCssZoom();
    overlay.classList.toggle("uses-css-zoom", useCssZoom);
    const viewer = { overlay, sheet: viewerSheet, scroller, canvas, natural, zoom: 1, minZoom: 0.2, scrollY: window.scrollY, useCssZoom };
    state.viewer = viewer;

    const fitZoom = () => fitSheetScale(natural, { width: scroller.clientWidth - 16, height: scroller.clientHeight - 16 }, 1);
    viewer.minZoom = Math.min(1, fitZoom());

    // 拡大率を変える。anchor（画面上の位置）の下にある表の位置が、変えたあとも同じ所に来るようにする
    function setZoom(nextZoom, anchor = null) {
      const zoom = Math.max(viewer.minZoom, Math.min(VIEWER_MAX_ZOOM, nextZoom));
      const rect = scroller.getBoundingClientRect();
      const ax = anchor ? anchor.x - rect.left : scroller.clientWidth / 2;
      const ay = anchor ? anchor.y - rect.top : scroller.clientHeight / 2;
      const contentX = (scroller.scrollLeft + ax) / viewer.zoom;
      const contentY = (scroller.scrollTop + ay) / viewer.zoom;
      viewer.zoom = zoom;
      if (useCssZoom) {
        viewerSheet.style.zoom = String(zoom);
      } else {
        viewerSheet.style.transform = `scale(${zoom})`;
        canvas.style.width = `${Math.ceil(natural.width * zoom)}px`;
        canvas.style.height = `${Math.ceil(natural.height * zoom)}px`;
      }
      scroller.scrollLeft = contentX * zoom - ax;
      scroller.scrollTop = contentY * zoom - ay;
      zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
      zoomOut.disabled = zoom <= viewer.minZoom + 0.001;
      zoomIn.disabled = zoom >= VIEWER_MAX_ZOOM - 0.001;
    }
    viewer.setZoom = setZoom;

    zoomIn.addEventListener("click", () => setZoom(viewer.zoom * 1.25));
    zoomOut.addEventListener("click", () => setZoom(viewer.zoom / 1.25));
    fitAll.addEventListener("click", () => {
      setZoom(viewer.minZoom);
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
    });
    close.addEventListener("click", closeViewer);

    // 2本の指（ピンチ）で拡大縮小。1本の指はふつうのスクロール（CSS の touch-action: pan-x pan-y）
    let pinch = null;
    const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    const middle = (touches) => ({ x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 });
    scroller.addEventListener("touchstart", (event) => {
      if (event.touches.length === 2) pinch = { startDistance: distance(event.touches), startZoom: viewer.zoom };
    }, { passive: true });
    scroller.addEventListener("touchmove", (event) => {
      if (!pinch || event.touches.length !== 2) return;
      event.preventDefault();
      setZoom(pinch.startZoom * (distance(event.touches) / pinch.startDistance), middle(event.touches));
    }, { passive: false });
    scroller.addEventListener("touchend", (event) => {
      if (event.touches.length < 2) pinch = null;
    });
    // PC：Ctrl＋ホイール（トラックパッドのピンチも同じイベントになる）
    scroller.addEventListener("wheel", (event) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      setZoom(viewer.zoom * Math.exp(-event.deltaY / 300), { x: event.clientX, y: event.clientY });
    }, { passive: false });

    // 最初の表示：押した所があれば、その付近を等倍（文字 12px）で。無ければ等倍で左上から
    const startZoom = Math.max(viewer.minZoom, 1);
    setZoom(startZoom);
    if (point) {
      scroller.scrollLeft = point.x * startZoom - scroller.clientWidth / 2;
      scroller.scrollTop = point.y * startZoom - scroller.clientHeight / 2;
    } else {
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
    }

    applyScrollLock(viewer.scrollY);
    document.addEventListener("keydown", handleViewerKeydown);
    window.addEventListener("popstate", closeViewer);
    close.focus();
  }

  function handleViewerKeydown(event) {
    if (event.key === "Escape") closeViewer();
  }

  function closeViewer() {
    const viewer = state.viewer;
    if (!viewer) return;
    state.viewer = null;
    viewer.overlay.remove();
    releaseScrollLock(viewer.scrollY);
    document.removeEventListener("keydown", handleViewerKeydown);
    window.removeEventListener("popstate", closeViewer);
  }

  // 収録曲一覧などから「この曲」を指定して開いたとき：その曲のマスを少しのあいだ光らせる
  function focusSong(songId) {
    if (!songId || !sheet) return false;
    const cell = sheet.querySelector(`.cs-song[data-song-id="${CSS.escape(songId)}"]`);
    if (!cell) return false;
    cell.classList.add("is-focus");
    setTimeout(() => cell.classList.remove("is-focus"), 2600);
    return true;
  }

  renderInto("single");
  return {
    element: panel,
    fit,
    focusSong,
    openViewer,
    closeViewer,
    getState: () => ({
      layout: state.layout,
      scale: state.scale,
      natural: { ...state.natural },
      highlight: state.highlight,
      viewerZoom: state.viewer?.zoom ?? null,
      isViewerOpen: Boolean(state.viewer),
    }),
  };
}
