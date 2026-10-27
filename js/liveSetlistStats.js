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
