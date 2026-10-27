// ライブのセットリスト（js/data/setlists.js）から、曲ごとの「ライブでの披露」の情報を計算するファイル（2026-10-27新設）。
// DOM を触らないので、tests.html から直接テストできる（tests/centersAndSetlists.test.js）。
//
// 【言い方のルール（本人方針）】調べた公演はすべての公演ではないため、「初披露」「〜年ぶり」と断定しない。
// 必ず「確認できた範囲で」「調査済み○公演では」を付けた文にする（文はこのファイルの関数で一か所にまとめる）。
// ファンの資料にしか無い行（referenceOnly）と、曲順を確定できなかった公演は、計算に一切使わない。
import { SETLIST_PERFORMANCES, LIVE_VIDEO_PRODUCTS } from "./data/setlists.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// "YYYY-MM-DD" 同士の日数の差（b − a）。読めない日付は null。
export function daysBetween(fromIso, toIso) {
  const from = Date.parse(`${fromIso}T00:00:00Z`);
  const to = Date.parse(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / DAY_MS);
}

// 日数を「約3年」「約1年半」のような言い方にする。1年未満は null（「〜ぶり」と言うほどの間ではない）。
export function describeYearsSpan(days) {
  if (typeof days !== "number" || days < 365) return null;
  const years = days / 365.25;
  const whole = Math.floor(years);
  const fraction = years - whole;
  if (fraction >= 0.75) return `約${whole + 1}年`;
  if (fraction >= 0.25) return `約${whole}年半`;
  return `約${whole}年`;
}

export function formatJapaneseDate(isoDate) {
  const [year, month, day] = String(isoDate ?? "").split("-").map(Number);
  if (!year || !month || !day) return "日付未確認";
  return `${year}年${month}月${day}日`;
}

// その曲を披露したことが確認できた公演（古い順）。1公演に同じ曲が2回あっても1件にまとめ、items に両方を持たせる。
export function findConfirmedPerformances(songId, performances = SETLIST_PERFORMANCES) {
  return performances
    .map((performance) => ({
      performance,
      items: performance.items.filter((item) => item.songId === songId && !item.referenceOnly),
    }))
    .filter((entry) => entry.items.length > 0)
    .sort((a, b) => a.performance.date.localeCompare(b.performance.date) || a.performance.id.localeCompare(b.performance.id));
}

// 曲ごとのまとめ。today（"YYYY-MM-DD"）は「最後の披露から今日まで」の計算に使う。
export function summarizeSongLive(songId, { performances = SETLIST_PERFORMANCES, today = null } = {}) {
  const confirmed = findConfirmedPerformances(songId, performances);
  const surveyedCount = performances.length;
  const first = confirmed[0] ?? null;
  const last = confirmed[confirmed.length - 1] ?? null;
  // 「前回」は、最後の披露より前の日付の披露（同じ日の昼夜・同じ日付は前回に数えない）
  const previous = last ? [...confirmed].reverse().find((entry) => entry.performance.date < last.performance.date) ?? null : null;
  const gapDays = previous ? daysBetween(previous.performance.date, last.performance.date) : null;
  const sinceLastDays = last && today ? daysBetween(last.performance.date, today) : null;
  return {
    songId,
    count: confirmed.length,
    surveyedCount,
    confirmed,
    first,
    last,
    previous,
    gapDays,
    gapText: describeYearsSpan(gapDays),
    sinceLastDays,
    sinceLastText: describeYearsSpan(sinceLastDays),
  };
}

// 画面に出す文。どれも「確認できた範囲」の言い方にそろえる。
export function buildLiveSummarySentences(summary) {
  if (summary.count === 0) {
    return [`調査済みの${summary.surveyedCount}公演では、披露を確認できませんでした（調べていない公演・イベントで披露している可能性があります）。`];
  }
  const sentences = [`調査済みの${summary.surveyedCount}公演のうち、${summary.count}公演で披露を確認できました。`];
  const firstLabel = performanceLabel(summary.first.performance);
  const lastLabel = performanceLabel(summary.last.performance);
  if (summary.count === 1) {
    sentences.push(`確認できた披露：${firstLabel}`);
  } else {
    sentences.push(`確認できた最初の披露：${firstLabel}`);
    sentences.push(`確認できた最新の披露：${lastLabel}`);
  }
  if (summary.gapText) {
    sentences.push(`確認できた範囲では、最新の披露は、その前の披露（${formatJapaneseDate(summary.previous.performance.date)}）から${summary.gapText}ぶりでした。`);
  }
  if (summary.sinceLastText) {
    sentences.push(`確認できた最新の披露から、${summary.sinceLastText}がたっています（調べていない公演がある点に注意）。`);
  }
  return sentences;
}

// 公演の短い呼び名（例：「2023年10月19日 ＝LOVE 6th ANNIVERSARY PREMIUM CONCERT（DAY2）」）
export function performanceLabel(performance) {
  const day = performance.dayLabel ? `（${performance.dayLabel}）` : "";
  return `${formatJapaneseDate(performance.date)} ${performance.title}${day}`;
}

// その曲が収録されている映像商品と、収録曲が未発表の映像商品（その曲を披露した公演を収録するもの）。
//   included   : [{ video, performanceIds }] 公式の収録内容でその曲が確認できるもの
//   undisclosed: [{ video, performanceIds }] 収録曲が未発表だが、その曲を披露した公演が収録予定・収録済みのもの
export function findVideosForSong(songId, { videos = LIVE_VIDEO_PRODUCTS, performances = SETLIST_PERFORMANCES } = {}) {
  const performedIds = new Set(findConfirmedPerformances(songId, performances).map((entry) => entry.performance.id));
  const included = [];
  const undisclosed = [];
  videos.forEach((video) => {
    const withSong = video.coverage.filter((cover) => Array.isArray(cover.songIds) && cover.songIds.includes(songId));
    if (withSong.length > 0) {
      included.push({ video, coverage: withSong });
      return;
    }
    const unknownButPerformed = video.coverage.filter((cover) => cover.songIds === null && performedIds.has(cover.performanceId));
    if (unknownButPerformed.length > 0) undisclosed.push({ video, coverage: unknownButPerformed });
  });
  const byDate = (a, b) => String(a.video.releaseDate).localeCompare(String(b.video.releaseDate));
  return { included: included.sort(byDate), undisclosed: undisclosed.sort(byDate) };
}

// 映像商品の発売状況の言い方（発売日は "YYYY-MM" だけのものもある）
export function describeVideoRelease(video, today = null) {
  const date = /^\d{4}-\d{2}$/.test(video.releaseDate)
    ? `${Number(video.releaseDate.slice(0, 4))}年${Number(video.releaseDate.slice(5, 7))}月`
    : formatJapaneseDate(video.releaseDate);
  if (video.status === "upcoming" && (!today || video.releaseDate > today)) return `${date}発売予定`;
  if (video.status === "upcoming") return `${date}発売（発売済みかはデータ未更新）`;
  return `${date}発売`;
}

// 【2026-10-28追加】映像商品の形態（TYPE-A／Blu-ray など）。editions が無い古いデータは productCodes の文をそのまま使う
export function describeVideoEditions(video) {
  const editions = Array.isArray(video.editions) ? video.editions : [];
  if (editions.length === 0) return video.productCodes ? [video.productCodes] : [];
  return editions.map((edition) => [edition.label, edition.format, edition.productCode].filter(Boolean).join(" "));
}

// 映像の中で、その曲が何曲目か（公式の収録順どおりに songIds を並べた商品だけ。それ以外は null）
export function findVideoPosition(coverage, songId) {
  if (!coverage?.ordered || !Array.isArray(coverage.songIds)) return null;
  const index = coverage.songIds.indexOf(songId);
  return index >= 0 ? index + 1 : null;
}

// 公式配信の状態の言い方。映像商品に入っていることと、配信で見られることは別の事実なので、必ず分けて言う
export function describeVideoStreaming(video) {
  const streaming = video.streaming;
  if (!streaming || streaming.status === "unknown") return { status: "unknown", text: "公式配信：未確認" };
  if (streaming.status === "available") return { status: "available", text: `公式配信あり${streaming.note ? `（${streaming.note}）` : ""}`, url: streaming.sourceUrl ?? null };
  return { status: "none", text: `公式配信：確認できず${streaming.note ? `（${streaming.note}）` : ""}`, url: streaming.sourceUrl ?? null };
}

// 曲名の一部から、その曲が入っている映像商品を探す（「曲から映像を探す」用）。曲の候補が複数なら全部返す
export function findVideosBySongQuery(query, songs, options = {}) {
  const text = String(query ?? "").trim();
  if (!text) return [];
  const normalize = (value) => String(value ?? "").toLowerCase().replace(/[\s　・、。！!？?「」『』"']/g, "");
  const needle = normalize(text);
  return songs
    .filter((song) => song.id !== "overture" && [song.title, song.searchReading].some((value) => normalize(value).includes(needle)))
    .map((song) => ({ song, ...findVideosForSong(song.id, options) }));
}

// 公演カード（liveHistory の id）ごとの、確定したセットリスト（日付順）
export function findPerformancesForLive(liveId, performances = SETLIST_PERFORMANCES) {
  return performances.filter((performance) => performance.liveId === liveId).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// ライブ履歴のカードが無い公演（1stコンサート等）
export function findUnlinkedPerformances(performances = SETLIST_PERFORMANCES) {
  return performances.filter((performance) => !performance.liveId).sort((a, b) => a.date.localeCompare(b.date));
}

// ===== 【2026-10-28追加】ライブページ（js/liveHubScreen.js）用の計算 =====
// 画面の文と並べ方をここに集め、tests/liveHub.test.js から直接テストする。

// 公演（1日・1部）を、年ごとにまとめる（新しい年が先、年の中も新しい日付が先）
export function groupPerformancesByYear(performances = SETLIST_PERFORMANCES) {
  const groups = new Map();
  [...performances]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .forEach((performance) => {
      const year = performance.date.slice(0, 4);
      if (!groups.has(year)) groups.set(year, []);
      groups.get(year).push(performance);
    });
  return [...groups.entries()].map(([year, items]) => ({ year, performances: items }));
}

// その公演（1日・1部）を収録している映像商品
export function findVideosForPerformance(performanceId, videos = LIVE_VIDEO_PRODUCTS) {
  return videos.filter((video) => video.coverage.some((cover) => cover.performanceId === performanceId));
}

// ライブ履歴の公演カード（liveHistory.js の id）に属する公演を収録している映像商品（発売日順）
export function findVideosForLive(liveId, { videos = LIVE_VIDEO_PRODUCTS, performances = SETLIST_PERFORMANCES } = {}) {
  const performanceIds = new Set(performances.filter((performance) => performance.liveId === liveId).map((performance) => performance.id));
  return videos
    .filter((video) => video.coverage.some((cover) => performanceIds.has(cover.performanceId)))
    .sort((a, b) => String(a.releaseDate).localeCompare(String(b.releaseDate)));
}

// 映像商品を発売日順に並べる（order: "desc" 新しい順／"asc" 古い順）
export function sortVideosByRelease(videos = LIVE_VIDEO_PRODUCTS, order = "desc") {
  const sign = order === "asc" ? 1 : -1;
  return [...videos].sort((a, b) => sign * String(a.releaseDate).localeCompare(String(b.releaseDate)) || a.id.localeCompare(b.id));
}

// 映像商品の形式（Blu-ray／DVD）を短くまとめる。形態の情報が無ければ productCodes の文から読む
export function summarizeVideoFormats(video) {
  const text = [...(video.editions ?? []).map((edition) => edition.format ?? ""), video.productCodes ?? ""].join(" ");
  const formats = [];
  if (/blu-?ray/i.test(text)) formats.push("Blu-ray");
  if (/DVD/i.test(text)) formats.push("DVD");
  return formats.length > 0 ? formats.join("／") : "形式未確認";
}

// 映像に収録されている公演の開催日（例：「2023年10月19日（DAY2）」）。公演の記録が無いものは出さない
export function describeVideoLiveDates(video, performances = SETLIST_PERFORMANCES) {
  return video.coverage
    .map((cover) => performances.find((performance) => performance.id === cover.performanceId))
    .filter(Boolean)
    .map((performance) => `${formatJapaneseDate(performance.date)}${performance.dayLabel ? `（${performance.dayLabel}）` : ""}`);
}

// その曲が、映像のどこに入っているか。収録順が公式の曲目どおりのときだけ「N曲目」と言う
//   { included: true/false, undisclosed: true/false, positions: ["本編 3曲目", ...] }
export function describeSongPositionInVideo(video, songId, performances = SETLIST_PERFORMANCES) {
  const withSong = video.coverage.filter((cover) => Array.isArray(cover.songIds) && cover.songIds.includes(songId));
  const undisclosed = withSong.length === 0 && video.coverage.some((cover) => cover.songIds === null);
  const multiple = video.coverage.length > 1;
  const positions = withSong.map((cover) => {
    const performance = performances.find((p) => p.id === cover.performanceId);
    const prefix = multiple && performance ? `${formatJapaneseDate(performance.date)}${performance.dayLabel ? `（${performance.dayLabel}）` : ""}の公演：` : "";
    // 同じ曲が2回入っている公演（アンコールでもう一度など）は、両方の曲目を出す
    const positions = cover.ordered ? cover.songIds.map((id, index) => (id === songId ? index + 1 : null)).filter(Boolean) : [];
    return `${prefix}${positions.length > 0 ? positions.map((n) => `${n}曲目`).join("・") : "収録（曲順は商品の曲目で確認してください）"}`;
  });
  return { included: withSong.length > 0, undisclosed, positions };
}

// 公式配信の短い表示（カードのバッジ用）。映像に収録されていることと、配信で見られることは別の事実
export function describeStreamingBadge(video) {
  const status = video.streaming?.status ?? "unknown";
  if (status === "available") return { status, label: "公式配信あり" };
  if (status === "none") return { status, label: "公式配信：確認できず" };
  return { status: "unknown", label: "公式配信：未確認" };
}

// 公式の商品ページへのリンク。同じページを指す形態はまとめる。
// どれも商品の紹介ページで、購入ページとは確認していないため「公式商品ページ」と書く（「購入」とは書かない）
export function buildOfficialProductLinks(video) {
  const byUrl = new Map();
  (video.editions ?? [])
    .filter((edition) => edition.url)
    .forEach((edition) => {
      const name = [edition.label, edition.format].filter(Boolean).join(" ");
      if (!byUrl.has(edition.url)) byUrl.set(edition.url, []);
      byUrl.get(edition.url).push(name);
    });
  const links = [...byUrl.entries()].map(([url, names]) => ({ label: `公式商品ページ（${names.filter(Boolean).join("・") || "商品"}）`, url }));
  if (links.length === 0 && video.sourceUrl) links.push({ label: "公式の告知ページ", url: video.sourceUrl });
  return links;
}

// 次に開催予定のライブ（今日以降に日程があるもののうち、いちばん近いもの）。無ければ null
export function findNextAnnouncedLive(liveEvents, today) {
  return (
    liveEvents
      .filter((event) => event.status === "announced" && typeof (event.endDate ?? event.startDate) === "string" && (event.endDate ?? event.startDate) >= today)
      .sort((a, b) => (a.startDate ?? "").localeCompare(b.startDate ?? ""))[0] ?? null
  );
}

// 公演カードの「セットリスト」ボタンの文字（DAY1／DAY2 などを付ける。「DAY2（ファイナル）」のように
// 括弧を含む呼び名があるので、括弧で囲まずに空白で続ける）
export function setlistButtonLabel(performance) {
  const day = performance.dayLabel ? ` ${performance.dayLabel}` : "";
  return performance.completeness === "full" ? `セットリスト${day}` : `披露を確認できた曲${day}`;
}
