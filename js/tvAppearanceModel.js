// 「音楽番組出演・披露曲アーカイブ」の絞り込み・検索・並べ方を決める純粋関数（2026-10-29新設）。DOM に触れない
// （tests/historyPages.test.js で確かめる）。データは js/data/tvAppearances.js。
import { normalizeSearchText } from "./searchNormalize.js";

// 絞り込みのボタン（番組のシリーズ）。番組名の書き方の揺れ（「Mステ」「ミュージックステーション」等）をまとめる
export const TV_SERIES = [
  { id: "mstation", label: "Mステ", pattern: /ミュージックステーション|Mステ|MUSIC STATION/i },
  { id: "cdtv", label: "CDTV", pattern: /CDTV/i },
  { id: "buzzrhythm", label: "バズリズム", pattern: /バズリズム/ },
  { id: "utacon", label: "うたコン", pattern: /うたコン/ },
  { id: "fns", label: "FNS歌謡祭", pattern: /FNS/ },
  { id: "musicfair", label: "MUSIC FAIR", pattern: /MUSIC FAIR/i },
  { id: "tvtokyo", label: "テレ東の音楽祭", pattern: /テレ東音楽祭|テレ東60祭/ },
  { id: "melodix", label: "MelodiX!", pattern: /MelodiX/i },
  { id: "overseas", label: "海外", pattern: /人気歌謡|SBS|Mnet|KBS|MBC/ },
];

// シリーズの別名（全体検索・この画面の検索で、どの書き方でも見つかるように）
export const TV_SERIES_ALIASES = {
  mstation: ["ミュージックステーション", "Mステ", "MUSIC STATION"],
  cdtv: ["CDTV", "CDTVライブ!ライブ!", "シーディーティーヴィー"],
  buzzrhythm: ["バズリズム", "バズリズム02"],
  utacon: ["うたコン"],
  fns: ["FNS歌謡祭", "FNS"],
  musicfair: ["MUSIC FAIR", "ミュージックフェア"],
  tvtokyo: ["テレ東音楽祭"],
  melodix: ["プレミアMelodiX!", "メロディックス"],
  overseas: ["人気歌謡", "韓国"],
};

export function seriesOf(entry) {
  const name = `${entry?.program ?? ""} ${entry?.station ?? ""}`;
  return TV_SERIES.find((series) => series.pattern.test(name))?.id ?? "other";
}

// 検索の対象になる文字：番組名・放送局・曲名・コラボ・メモ・年
function searchableText(entry) {
  const songs = (entry.songs ?? []).map((song) => song.title).join(" ");
  const collabs = (entry.collabs ?? []).map((c) => (typeof c === "string" ? c : `${c.with ?? ""} ${c.title ?? ""}`)).join(" ");
  const aliases = (TV_SERIES_ALIASES[seriesOf(entry)] ?? []).join(" ");
  return normalizeSearchText(`${entry.program} ${aliases} ${entry.station ?? ""} ${songs} ${collabs} ${entry.notes ?? ""} ${String(entry.date).slice(0, 4)}年`);
}

// series：TV_SERIES の id／"all"。query：空白区切りの言葉（すべて含む行だけ。ひらがな・カタカナ・全角半角の違いは無視）
// year：西暦の文字列（"2021"）／"all"
export function filterTvAppearances(entries, { series = "all", query = "", year = "all" } = {}) {
  const words = String(query ?? "").split(/\s+/).map(normalizeSearchText).filter(Boolean);
  return (entries ?? []).filter((entry) => {
    if (series !== "all" && seriesOf(entry) !== series) return false;
    if (year !== "all" && String(entry.date).slice(0, 4) !== String(year)) return false;
    if (!words.length) return true;
    const text = searchableText(entry);
    return words.every((word) => text.includes(word));
  });
}

// 新しい順に並べ、年ごとにまとめる：[{ year, entries }]
export function groupTvAppearancesByYear(entries) {
  const sorted = [...(entries ?? [])].sort((a, b) => (a.date === b.date ? 0 : a.date < b.date ? 1 : -1));
  const groups = [];
  sorted.forEach((entry) => {
    const year = String(entry.date).slice(0, 4);
    if (!groups.length || groups[groups.length - 1].year !== year) groups.push({ year, entries: [] });
    groups[groups.length - 1].entries.push(entry);
  });
  return groups;
}

// 曲ごとのテレビでの披露回数（収録曲一覧などから「この曲を披露した番組」を出すときに使う）
export function appearancesForSong(entries, songId) {
  return (entries ?? []).filter((entry) => (entry.songs ?? []).some((song) => song.songId === songId));
}

// 絞り込みのボタンに出すシリーズ（データに1件以上あるものだけ。「その他」は最後）
export function availableSeries(entries) {
  const used = new Set((entries ?? []).map(seriesOf));
  return [...TV_SERIES.filter((series) => used.has(series.id)), ...(used.has("other") ? [{ id: "other", label: "その他" }] : [])];
}

// データにある年（新しい順）
export function availableYears(entries) {
  return [...new Set((entries ?? []).map((entry) => String(entry.date).slice(0, 4)))].sort((a, b) => (a < b ? 1 : -1));
}

// 1回の放送の「記録の種類」（画面の印に使う）。歌唱・コラボ・曲の未確認・再放送を区別する
export function describeAppearanceKind(entry) {
  const isRebroadcast = /再放送/.test(entry?.program ?? "");
  const sang = (entry?.songs ?? []).length > 0;
  const collab = (entry?.collabs ?? []).length > 0;
  return {
    isRebroadcast,
    sang,
    collab,
    songUnknown: !sang && !collab,
    label: isRebroadcast ? "再放送" : sang ? (collab ? "歌唱・コラボ" : "歌唱") : collab ? "コラボ歌唱" : "出演（披露曲は未確認）",
  };
}
