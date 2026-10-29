// 「音楽番組出演・披露曲アーカイブ」の絞り込み・検索・並べ方を決める純粋関数（2026-10-29新設）。DOM に触れない
// （tests/historyPages.test.js で確かめる）。データは js/data/tvAppearances.js。
import { normalizeSearchText } from "./searchNormalize.js";
import { SONGS } from "./data/songs.js";

// 曲IDごとの読み（ひらがな）。曲名を読みで探しても、その曲を披露した放送が見つかるようにする（2026-10-30）
const SONG_READINGS = new Map(SONGS.map((song) => [song.id, [song.searchReading, ...(song.searchAliases ?? [])].filter(Boolean).join(" ")]));

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

// 画面に出す曲（確認できた曲）。includeUnverified のときは、ファンの記録だけの曲（unverifiedSongs）も含める
export function visibleSongs(entry, { includeUnverified = false } = {}) {
  return [...(entry?.songs ?? []), ...(includeUnverified ? entry?.unverifiedSongs ?? [] : [])];
}

export function visibleCollabs(entry, { includeUnverified = false } = {}) {
  return [...(entry?.collabs ?? []), ...(includeUnverified ? entry?.unverifiedCollabs ?? [] : [])];
}

// 検索の対象になる文字：番組名・放送局・曲名（読みも）・コラボ・メモ・年。
// 確認できていない曲は、includeUnverified のときだけ検索の対象にする（出していない曲で見つかると紛らわしいため）
function searchableText(entry, options = {}) {
  const songs = visibleSongs(entry, options)
    .map((song) => `${song.title} ${song.songId ? SONG_READINGS.get(song.songId) ?? "" : ""}`)
    .join(" ");
  const collabs = visibleCollabs(entry, options).map((c) => (typeof c === "string" ? c : `${c.with ?? ""} ${c.title ?? ""}`)).join(" ");
  const aliases = (TV_SERIES_ALIASES[seriesOf(entry)] ?? []).join(" ");
  return normalizeSearchText(`${entry.program} ${aliases} ${entry.station ?? ""} ${songs} ${collabs} ${entry.notes ?? ""} ${String(entry.date).slice(0, 4)}年`);
}

// series：TV_SERIES の id／"all"。query：空白区切りの言葉（すべて含む行だけ。ひらがな・カタカナ・全角半角の違いは無視）
// year：西暦の文字列（"2021"）／"all"。includeUnverified：要確認の曲も検索の対象にする
export function filterTvAppearances(entries, { series = "all", query = "", year = "all", includeUnverified = false } = {}) {
  const words = String(query ?? "").split(/\s+/).map(normalizeSearchText).filter(Boolean);
  return (entries ?? []).filter((entry) => {
    if (series !== "all" && seriesOf(entry) !== series) return false;
    if (year !== "all" && String(entry.date).slice(0, 4) !== String(year)) return false;
    if (!words.length) return true;
    const text = searchableText(entry, { includeUnverified });
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

// 曲ごとのテレビでの披露回数（収録曲一覧などから「この曲を披露した番組」を出すときに使う）。確認できた曲だけで数える
export function appearancesForSong(entries, songId, options = {}) {
  return (entries ?? []).filter((entry) => visibleSongs(entry, options).some((song) => song.songId === songId));
}

// 公開する記録だけ（出演が要確認の回＝publish:false を除く）。publish の無い古いデータは公開扱い
export function publishedAppearances(entries) {
  return (entries ?? []).filter((entry) => entry.publish !== false);
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

// 放送の種類の表示名（broadcastType）。初回放送は印を付けない
export const BROADCAST_TYPE_LABELS = { original: "", rebroadcast: "再放送", digest: "再編集・ダイジェスト" };

// カバー／コラボの種類の表示名（collabs の kind）
export const COLLAB_KIND_LABELS = { cover: "カバー", collab: "コラボ", medley: "メドレー企画", joint: "合同曲" };

// 1回の放送の「記録の種類」（画面の印に使う）。歌唱・コラボ・曲の未確認・再放送・再編集を区別する
export function describeAppearanceKind(entry) {
  const broadcastType = entry?.broadcastType ?? (/再放送/.test(entry?.program ?? "") ? "rebroadcast" : "original");
  const isRebroadcast = broadcastType === "rebroadcast" || /再放送/.test(entry?.program ?? "");
  const isDigest = broadcastType === "digest";
  const sang = (entry?.songs ?? []).length > 0;
  const collab = (entry?.collabs ?? []).length > 0;
  const performance = sang ? (collab ? "歌唱・コラボ" : "歌唱") : collab ? "コラボ歌唱" : "出演（披露曲は未確認）";
  return {
    isRebroadcast,
    isDigest,
    broadcastType: isRebroadcast ? "rebroadcast" : broadcastType,
    sang,
    collab,
    songUnknown: !sang && !collab,
    label: isRebroadcast ? "再放送" : isDigest ? "再編集・ダイジェスト" : performance,
  };
}
