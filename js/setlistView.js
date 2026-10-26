// セットリスト・「ライブでの披露」の表示部品（2026-10-27新設）。
//  - buildSetlistDetails：ライブ履歴の公演カードに入れる、1公演（1日・1部）分のセットリスト（折りたたみ）
//  - buildSongLiveSection：収録曲一覧の曲の行に入れる「ライブでの披露」（折りたたみ。開いたときに中身を作る）
// 計算と文の組み立ては js/liveSetlistStats.js、データは js/data/setlists.js。
// 画面移動は、呼び出し側から渡される関数（onOpenSong / onOpenLive）に任せる。
import { SONGS } from "./data/songs.js";
import { SETLIST_SECTION_LABELS, SETLIST_FORM_LABELS, UNVERIFIED_SETLIST_PERFORMANCES } from "./data/setlists.js";
import {
  summarizeSongLive,
  buildLiveSummarySentences,
  findVideosForSong,
  describeVideoRelease,
  performanceLabel,
  formatJapaneseDate,
} from "./liveSetlistStats.js";

const songById = new Map(SONGS.map((song) => [song.id, song]));
const VERIFICATION_LABELS = { official: "公式で確認", press: "報道で確認" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function externalLink(className, text, url) {
  const link = el("a", className, text);
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function todayInJapan() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

// ---- 1公演分のセットリスト ----

function buildSetlistItem(item, onOpenSong) {
  const row = el("li", `setlist-item is-${item.section}${item.referenceOnly ? " is-reference" : ""}`);
  row.appendChild(el("span", "setlist-item-order", item.order === 0 ? "—" : String(item.order)));
  const body = el("div", "setlist-item-body");
  const song = item.songId ? songById.get(item.songId) : null;
  if (song && onOpenSong) {
    const button = el("button", "setlist-item-title is-link", song.title);
    button.type = "button";
    button.addEventListener("click", () => onOpenSong(song.id));
    body.appendChild(button);
  } else {
    body.appendChild(el("span", "setlist-item-title", song ? song.title : item.title));
  }
  const tags = [];
  if (item.section !== "main" && SETLIST_SECTION_LABELS[item.section]) tags.push(SETLIST_SECTION_LABELS[item.section]);
  if (SETLIST_FORM_LABELS[item.form]) tags.push(SETLIST_FORM_LABELS[item.form]);
  if (item.referenceOnly) tags.push("参考（ファン資料のみ）");
  tags.forEach((tag) => body.appendChild(el("span", "setlist-item-tag", tag)));
  if (item.note) body.appendChild(el("span", "setlist-item-note", item.note));
  row.appendChild(body);
  return row;
}

// performance：js/data/setlists.js の1件。options.onOpenSong(songId)：曲名をタップしたとき
export function buildSetlistDetails(performance, options = {}) {
  const details = el("details", "live-setlist");
  details.dataset.performanceId = performance.id;
  const songCount = performance.items.filter((item) => item.order > 0).length;
  const dayText = performance.dayLabel ? `（${performance.dayLabel}）` : "";
  const summaryText =
    performance.completeness === "full"
      ? `セットリスト${dayText}・${formatJapaneseDate(performance.date)}・${songCount}曲`
      : `披露を確認できた曲${dayText}・${formatJapaneseDate(performance.date)}`;
  details.appendChild(el("summary", "live-setlist-summary", summaryText));

  // 中身は開いたときに初めて作る（公演カードが20件以上あるため、最初の表示を軽くする）
  details.addEventListener(
    "toggle",
    () => {
      if (!details.open || details.dataset.rendered) return;
      details.dataset.rendered = "1";
      const body = el("div", "live-setlist-body");
      const meta = el("p", "live-setlist-meta");
      meta.textContent = [performance.venue, VERIFICATION_LABELS[performance.verification]].filter(Boolean).join("／");
      body.appendChild(meta);
      if (performance.dayNote) body.appendChild(el("p", "live-setlist-note", performance.dayNote));
      if (performance.membersNote) body.appendChild(el("p", "live-setlist-note", `出演：${performance.membersNote}`));
      const list = el("ol", "setlist-items");
      performance.items.forEach((item) => list.appendChild(buildSetlistItem(item, options.onOpenSong)));
      body.appendChild(list);
      if (performance.sources.length > 0) {
        const sources = el("p", "live-setlist-sources");
        sources.appendChild(document.createTextNode("出典："));
        performance.sources.forEach((source, index) => {
          if (index > 0) sources.appendChild(document.createTextNode("／"));
          sources.appendChild(externalLink("live-setlist-source-link", source.kind === "official" ? "公式" : "報道", source.url)).title = source.title;
        });
        body.appendChild(sources);
      }
      details.appendChild(body);
    },
    { once: false }
  );
  return details;
}

// ライブ履歴タブの下に出す「セットリストについて」の注記
export function buildSetlistCoverageNote() {
  const unverifiedCount = UNVERIFIED_SETLIST_PERFORMANCES.length;
  return el(
    "p",
    "live-list-notice",
    `セットリストは、曲順を公式（公式リリース・映像商品の収録内容）または報道で確認できた公演だけを載せています。曲順を確定できなかった公演（ファンのまとめにしか無い公演など${unverifiedCount}公演）は載せていません。`
  );
}

// ---- 曲ごとの「ライブでの披露」 ----

function buildVideoLine(entry, today, kind) {
  const item = el("li", `song-live-video is-${entry.video.status}`);
  const tag = el("span", `song-live-video-tag is-${kind}`, kind === "included" ? "映像に収録" : "収録曲未発表");
  item.appendChild(tag);
  const text = el("span", "song-live-video-text", `${entry.video.title}（${describeVideoRelease(entry.video, today)}）`);
  item.appendChild(text);
  const notes = entry.coverage.map((cover) => cover.note).filter(Boolean);
  if (entry.video.note) notes.push(entry.video.note);
  if (notes.length > 0) item.appendChild(el("span", "song-live-video-note", notes.join(" ")));
  if (entry.video.sourceUrl) item.appendChild(externalLink("song-live-video-link", "公式の情報 ↗", entry.video.sourceUrl));
  return item;
}

function renderSongLiveBody(container, song, options) {
  const today = options.today ?? todayInJapan();
  const summary = summarizeSongLive(song.id, { today });
  buildLiveSummarySentences(summary).forEach((sentence) => container.appendChild(el("p", "song-live-sentence", sentence)));

  if (summary.count > 0) {
    const list = el("ol", "song-live-performances");
    summary.confirmed.forEach(({ performance, items }) => {
      const row = el("li", "song-live-performance");
      const label = performanceLabel(performance);
      if (performance.liveId && options.onOpenLive) {
        const button = el("button", "song-live-performance-link", label);
        button.type = "button";
        button.addEventListener("click", () => options.onOpenLive(performance.liveId));
        row.appendChild(button);
      } else {
        row.appendChild(el("span", "song-live-performance-text", label));
      }
      const positions = items.map((item) => (item.order === 0 ? "オープニング" : `${SETLIST_SECTION_LABELS[item.section] ?? ""}${item.section === "main" ? "" : " "}M${item.order}`.trim()));
      row.appendChild(el("span", "song-live-performance-meta", positions.join("・")));
      items.filter((item) => item.note).forEach((item) => row.appendChild(el("span", "song-live-performance-note", item.note)));
      list.appendChild(row);
    });
    container.appendChild(list);
  }

  const videos = findVideosForSong(song.id);
  if (videos.included.length > 0 || videos.undisclosed.length > 0) {
    container.appendChild(el("p", "song-live-subheading", "ライブ映像（Blu-ray／DVD）"));
    container.appendChild(el("p", "song-live-caption", "「映像に収録」は公式の収録内容で確認できたもの。ライブで披露したことと、映像に収録されていることは別に表示しています。"));
    const list = el("ul", "song-live-videos");
    videos.included.forEach((entry) => list.appendChild(buildVideoLine(entry, today, "included")));
    videos.undisclosed.forEach((entry) => list.appendChild(buildVideoLine(entry, today, "undisclosed")));
    container.appendChild(list);
  }
}

// song：songs.js の1曲。options.onOpenLive(liveId)：公演名をタップしたとき（ライブ履歴の該当カードを開く）
export function buildSongLiveSection(song, options = {}) {
  if (song.id === "overture") return null; // SE のため対象外
  const summary = summarizeSongLive(song.id);
  const videos = findVideosForSong(song.id);
  const details = el("details", "song-live-section");
  const countText = summary.count > 0 ? `確認できた披露 ${summary.count}公演` : "披露は未確認";
  const videoText = videos.included.length > 0 ? `・映像 ${videos.included.length}作品` : "";
  details.appendChild(el("summary", "song-live-section-summary", `ライブでの披露（${countText}${videoText}）`));
  details.addEventListener("toggle", () => {
    if (!details.open || details.dataset.rendered) return;
    details.dataset.rendered = "1";
    const body = el("div", "song-live-section-body");
    renderSongLiveBody(body, song, options);
    details.appendChild(body);
  });
  return details;
}
