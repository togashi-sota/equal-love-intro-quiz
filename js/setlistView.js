// セットリスト・「ライブでの披露」の表示部品（2026-10-27新設）。
//  - buildSetlistDetails：ライブ履歴の公演カードに入れる、1公演（1日・1部）分のセットリスト（折りたたみ）
//  - buildSongLiveSection：収録曲一覧の曲の行に入れる「ライブでの披露」（折りたたみ。開いたときに中身を作る）
// 計算と文の組み立ては js/liveSetlistStats.js、データは js/data/setlists.js。
// 画面移動は、呼び出し側から渡される関数（onOpenSong / onOpenLive）に任せる。
import { SONGS } from "./data/songs.js";
import { SETLIST_SECTION_LABELS, SETLIST_FORM_LABELS, UNVERIFIED_SETLIST_PERFORMANCES, SETLIST_PERFORMANCES, LIVE_VIDEO_PRODUCTS } from "./data/setlists.js";
import {
  summarizeSongLive,
  buildLiveSummarySentences,
  findVideosForSong,
  describeVideoRelease,
  performanceLabel,
  formatJapaneseDate,
  describeVideoEditions,
  describeVideoStreaming,
  findVideoPosition,
  findVideosBySongQuery,
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

// 映像商品の公式ページへのリンク（形態ごとの公式ディスコグラフィーがあればそれ、無ければ公式ニュース）。
// どれも「商品の紹介ページ」で、購入ページではないので「購入」とは書かない（本人方針 2026-10-28）
function appendVideoOfficialLinks(container, video) {
  const editions = (video.editions ?? []).filter((edition) => edition.url);
  const row = el("span", "song-live-video-links");
  if (editions.length > 0) {
    editions.forEach((edition) => row.appendChild(externalLink("song-live-video-link", `公式の商品紹介（${edition.label ?? edition.format ?? "商品"}）↗`, edition.url)));
  } else if (video.sourceUrl) {
    row.appendChild(externalLink("song-live-video-link", "公式の情報 ↗", video.sourceUrl));
  }
  if (row.childNodes.length > 0) container.appendChild(row);
}

function buildVideoLine(entry, today, kind, songId = null) {
  const item = el("li", `song-live-video is-${entry.video.status}`);
  const tag = el("span", `song-live-video-tag is-${kind}`, kind === "included" ? "映像収録確認済み" : "収録曲未発表");
  item.appendChild(tag);
  const text = el("span", "song-live-video-text", `${entry.video.title}（${describeVideoRelease(entry.video, today)}）`);
  item.appendChild(text);
  const editions = describeVideoEditions(entry.video);
  if (editions.length > 0) item.appendChild(el("span", "song-live-video-meta", `形態・品番：${editions.join("／")}`));
  if (kind === "included" && songId) {
    const places = entry.coverage
      .map((cover) => {
        const performance = SETLIST_PERFORMANCES.find((p) => p.id === cover.performanceId);
        const position = findVideoPosition(cover, songId);
        const where = performance ? `${formatJapaneseDate(performance.date)}${performance.dayLabel ? `（${performance.dayLabel}）` : ""}の公演` : null;
        return [where, position ? `本編 ${position}曲目` : null].filter(Boolean).join("・");
      })
      .filter(Boolean);
    if (places.length > 0) item.appendChild(el("span", "song-live-video-meta", `収録：${places.join("／")}`));
  }
  const streaming = describeVideoStreaming(entry.video);
  item.appendChild(el("span", `song-live-video-meta is-streaming-${streaming.status}`, streaming.text));
  const notes = entry.coverage.map((cover) => cover.note).filter(Boolean);
  if (entry.video.note) notes.push(entry.video.note);
  if (notes.length > 0) item.appendChild(el("span", "song-live-video-note", notes.join(" ")));
  appendVideoOfficialLinks(item, entry.video);
  if (streaming.status === "available" && streaming.url) item.appendChild(externalLink("song-live-video-link", "公式配信のお知らせ ↗", streaming.url));
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
    videos.included.forEach((entry) => list.appendChild(buildVideoLine(entry, today, "included", song.id)));
    videos.undisclosed.forEach((entry) => list.appendChild(buildVideoLine(entry, today, "undisclosed", song.id)));
    container.appendChild(list);
  }
  container.appendChild(el("p", "song-live-caption", "確認できた披露履歴のみ表示しています。記録が無いことは「披露していない」という意味ではありません。"));
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

// ---- 曲からライブ映像を探す（ライブタブの上。2026-10-28追加） ----
// 「どの映像商品を見れば（買えば）その曲が見られるか」を、曲名から調べる。結果は公式の収録内容で確認できたものだけ
export function buildSongVideoFinder(options = {}) {
  const section = el("section", "song-video-finder");
  section.appendChild(el("p", "section-heading", "曲からライブ映像を探す"));
  section.appendChild(el("p", "song-live-caption", "曲名を入れると、その曲が公式の収録内容で確認できるライブ映像（Blu-ray／DVD）を表示します。"));
  const input = el("input", "song-video-finder-input");
  input.type = "search";
  input.placeholder = "曲名（例：アイカツハッピーエンド）";
  input.setAttribute("aria-label", "ライブ映像を探す曲名");
  const datalistId = "song-video-finder-songs";
  input.setAttribute("list", datalistId);
  const datalist = el("datalist");
  datalist.id = datalistId;
  SONGS.filter((song) => song.id !== "overture").forEach((song) => {
    const option = el("option");
    option.value = song.title;
    datalist.appendChild(option);
  });
  const results = el("div", "song-video-finder-results");
  results.setAttribute("aria-live", "polite");
  const render = () => {
    results.innerHTML = "";
    const query = input.value.trim();
    if (!query) return;
    const today = options.today ?? todayInJapan();
    const matches = findVideosBySongQuery(query, SONGS).slice(0, 5);
    if (matches.length === 0) {
      results.appendChild(el("p", "song-live-sentence", `「${query}」に一致する曲が見つかりませんでした。`));
      return;
    }
    matches.forEach(({ song, included, undisclosed }) => {
      const block = el("div", "song-video-finder-song");
      const title = el("button", "setlist-item-title is-link", song.title);
      title.type = "button";
      if (options.onOpenSong) title.addEventListener("click", () => options.onOpenSong(song.id));
      block.appendChild(title);
      if (included.length === 0 && undisclosed.length === 0) {
        block.appendChild(el("p", "song-live-sentence", "公式の収録内容で確認できたライブ映像はありません（調べていない映像商品に入っている可能性があります）。"));
      } else {
        const list = el("ul", "song-live-videos");
        included.forEach((entry) => list.appendChild(buildVideoLine(entry, today, "included", song.id)));
        undisclosed.forEach((entry) => list.appendChild(buildVideoLine(entry, today, "undisclosed", song.id)));
        block.appendChild(list);
      }
      results.appendChild(block);
    });
  };
  input.addEventListener("input", render);
  section.append(input, datalist, results);
  return section;
}

// ---- ライブ映像（Blu-ray／DVD）の一覧と、それぞれの収録曲（2026-10-28追加） ----
export function buildVideoProductList(options = {}) {
  const section = el("section", "video-product-list");
  section.appendChild(el("p", "section-heading", "ライブ映像（Blu-ray／DVD）"));
  section.appendChild(el("p", "song-live-caption", "公式の商品情報で確認できた映像商品です。リンク先は公式の商品紹介ページで、販売中とは限りません。"));
  const today = options.today ?? todayInJapan();
  [...LIVE_VIDEO_PRODUCTS]
    .sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))
    .forEach((video) => {
      const details = el("details", "video-product");
      details.dataset.videoId = video.id;
      details.appendChild(el("summary", "live-setlist-summary", `${video.title}（${describeVideoRelease(video, today)}）`));
      details.addEventListener("toggle", () => {
        if (!details.open || details.dataset.rendered) return;
        details.dataset.rendered = "1";
        const body = el("div", "live-setlist-body");
        const editions = describeVideoEditions(video);
        if (editions.length > 0) body.appendChild(el("p", "live-setlist-meta", `形態・品番：${editions.join("／")}`));
        const streaming = describeVideoStreaming(video);
        body.appendChild(el("p", `live-setlist-meta is-streaming-${streaming.status}`, streaming.text));
        if (video.note) body.appendChild(el("p", "live-setlist-note", video.note));
        video.coverage.forEach((cover) => {
          const performance = SETLIST_PERFORMANCES.find((p) => p.id === cover.performanceId);
          body.appendChild(el("p", "song-live-subheading", performance ? `収録公演：${performanceLabel(performance)}` : "収録公演"));
          if (cover.note) body.appendChild(el("p", "live-setlist-note", cover.note));
          if (!Array.isArray(cover.songIds)) {
            body.appendChild(el("p", "live-setlist-note", "収録曲は未発表です。"));
            return;
          }
          const list = el(cover.ordered ? "ol" : "ul", "setlist-items");
          cover.songIds.forEach((songId) => {
            const song = songById.get(songId);
            const row = el("li", "setlist-item");
            const position = findVideoPosition(cover, songId);
            row.appendChild(el("span", "setlist-item-order", position ? String(position) : "・"));
            const bodyCell = el("div", "setlist-item-body");
            if (song && options.onOpenSong) {
              const button = el("button", "setlist-item-title is-link", song.title);
              button.type = "button";
              button.addEventListener("click", () => options.onOpenSong(song.id));
              bodyCell.appendChild(button);
            } else bodyCell.appendChild(el("span", "setlist-item-title", song ? song.title : songId));
            row.appendChild(bodyCell);
            list.appendChild(row);
          });
          body.appendChild(list);
          if (!cover.ordered) body.appendChild(el("p", "live-setlist-note", "＝LOVEのオリジナル曲だけを載せています（並びは収録順とは限りません。カバー曲などは含みません）。"));
        });
        appendVideoOfficialLinks(body, video);
        if (streaming.status === "available" && streaming.url) body.appendChild(externalLink("song-live-video-link", "公式配信のお知らせ ↗", streaming.url));
        details.appendChild(body);
      });
      section.appendChild(details);
    });
  return section;
}
