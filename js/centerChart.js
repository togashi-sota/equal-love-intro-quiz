// 歴代センター一覧（js/centersScreen.js）のための、画面に依存しない計算だけを集めたファイル（2026-10-27新設）。
// DOM を触らないので、tests.html から直接テストできる（tests/centersAndSetlists.test.js）。
//
// 役割は3つ：
//  1. 曲ごとの「センターの状態」と「根拠の強さ」を判定する（classifyCenter）
//  2. メンバーカラーを背景にしたとき、文字を黒と白のどちらにすると読みやすいかを計算する（pickReadableTextColor）
//  3. 曲を発売順に並べ、作品の種類（シングル・アルバム・配信）と曲の役割（表題曲・カップリング等）を付ける（buildCenterRows）
import { CATEGORY } from "./data/songs.js";
import { CENTER_SOURCES } from "./data/centerSources.js";

// 根拠の種類の表示名。並び順は「強い順」（凡例の表示順にも使う）。
export const CENTER_EVIDENCE_LABELS = {
  official: "公式",
  press: "報道",
  member: "メンバー発言",
  fan: "ファン資料のみ",
  // 【2026-10-28改称】「本人指定」はメンバー本人が決めたように読めるため、アプリの設定であることが分かる名前にした
  user: "アプリ内設定・公式未確認",
  unknown: "根拠未確認",
};

// 公式・報道・メンバー本人の発言だけを「確認済み」とみなす。
// ファンのまとめと一致していても、それは公式の確認にはならない（本人方針）。
const CONFIRMED_EVIDENCE_KINDS = new Set(["official", "press", "member"]);

// 凡例に出す短い説明（画面下部の「根拠ラベルについて」）
export const CENTER_EVIDENCE_DESCRIPTIONS = {
  official: "公式YouTubeのMV説明欄・公式X などにセンターの記載がある",
  press: "音楽ナタリー・Real Sound などの記事・インタビューに記載がある",
  member: "報道に載ったメンバー本人の発言で確認できる",
  fan: "ファンのまとめにしか記載が無い（公式の情報としては扱っていません）",
  user: "このアプリの作成者が指定したもの（公式の記載はありません）",
  unknown: "センターの有無を書いた資料が見つかっていない",
};

// センターの状態（state）
//   single / double / all / none … songs.js の centerType そのもの（double は2人以上も含む）
//   solo / duo                    … ソロ曲・2人の曲（センターの区別が無い）
//   unconfirmed                   … 3人以上の曲だが、センターが未入力
export function classifyCenter(song, sources = CENTER_SOURCES) {
  const centerNames = Array.isArray(song.center) ? song.center.filter((name) => name !== "全員") : [];
  const source = sources[song.id] ?? null;

  let state;
  if (song.centerType === "all") state = "all";
  else if (song.centerType === "none") state = "none";
  else if (song.centerType === "double" || centerNames.length >= 2) state = "double";
  else if (song.centerType === "single" && centerNames.length === 1) state = "single";
  else if (Array.isArray(song.members) && song.members.length === 1) state = "solo";
  else if (Array.isArray(song.members) && song.members.length === 2) state = "duo";
  else state = "unconfirmed";

  const hasCenterConcept = !["solo", "duo"].includes(state);
  // センター情報があるのに根拠データが無い曲は「根拠未確認」として扱う（推測で公式扱いしない）
  const evidenceKind = hasCenterConcept ? source?.kind ?? "unknown" : null;

  return {
    state,
    centerNames,
    evidenceKind,
    evidenceLabel: evidenceKind ? CENTER_EVIDENCE_LABELS[evidenceKind] : null,
    isConfirmed: evidenceKind ? CONFIRMED_EVIDENCE_KINDS.has(evidenceKind) : false,
    sourceUrl: source?.url ?? null,
    sourceNote: source?.note ?? null,
  };
}

// センター欄の文字列を組み立てる。単独／Wセンター／全員センター／センターなしの4パターン。
// 収録曲一覧（js/songlist.js）の曲の行で使う。centerTypeが省略されている曲（未確認、またはソロ・デュオ曲）では呼び出さない。
export function formatCenterLine(center, centerType) {
  if (centerType === "none") {
    return "センター：なし";
  }
  // 【2026-10-27追加】全員センター（songs.js の centerType "all"）
  if (centerType === "all") {
    return "センター：全員";
  }
  if (centerType === "double") {
    return `Wセンター：${center.join("・")}`;
  }
  return `センター：${center[0]}`;
}

// センター欄の見出し（「センター」「Wセンター」「3人センター」など）
export function describeCenterState(classification) {
  const count = classification.centerNames.length;
  switch (classification.state) {
    case "single":
      return "センター";
    case "double":
      return count === 2 ? "Wセンター" : `${count}人センター`;
    case "all":
      return "全員センター";
    case "none":
      return "センターなし";
    case "solo":
      return "ソロ曲";
    case "duo":
      return "2人の曲";
    default:
      return "センター未確認";
  }
}

// ---- 文字色の自動選択（WCAG の相対輝度とコントラスト比） ----

const DARK_TEXT = "#24151f";
const LIGHT_TEXT = "#ffffff";

// "#rrggbb"（または "#rgb"）を 0〜1 の RGB へ。読めない値は null。
function parseHexColor(hex) {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex ?? "").trim());
  if (!match) return null;
  const body = match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  return [0, 2, 4].map((i) => parseInt(body.slice(i, i + 2), 16) / 255);
}

// 相対輝度（0＝黒〜1＝白）
export function relativeLuminance(hex) {
  const rgb = parseHexColor(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// 2色のコントラスト比（1〜21）
export function contrastRatio(hexA, hexB) {
  const a = relativeLuminance(hexA);
  const b = relativeLuminance(hexB);
  if (a === null || b === null) return null;
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

// 背景色に対して、黒っぽい文字と白い文字のうちコントラストが高いほうを選ぶ。
// どちらを選んでも 4.5（通常の文字の推奨値）に届かないときは needsOutline を true にし、
// 画面側で文字に縁取りを付けて読みやすさを補う。背景色が読めないときは黒文字にする。
export function pickReadableTextColor(backgroundHex) {
  const onDark = contrastRatio(backgroundHex, DARK_TEXT);
  const onLight = contrastRatio(backgroundHex, LIGHT_TEXT);
  if (onDark === null || onLight === null) return { color: DARK_TEXT, ratio: null, needsOutline: false };
  const useDark = onDark >= onLight;
  const ratio = useDark ? onDark : onLight;
  return { color: useDark ? DARK_TEXT : LIGHT_TEXT, ratio: Math.round(ratio * 100) / 100, needsOutline: ratio < 4.5 };
}

// ---- 発売順の並びと、作品・曲の種類 ----

const WORK_KIND_BY_PREFIX = { single: "single", album: "album", digital: "digital", special: "special" };

function toOrdinal(number) {
  const remainder100 = number % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${number}th`;
  return `${number}${{ 1: "st", 2: "nd", 3: "rd" }[number % 10] ?? "th"}`;
}

// workId（"single-06" 等）から作品の種類と表示名を求める
export function describeWork(workId) {
  const [prefix, numberText] = String(workId ?? "").split("-");
  const kind = WORK_KIND_BY_PREFIX[prefix] ?? "other";
  const number = Number(numberText);
  if (kind === "single" && Number.isFinite(number)) return { kind, label: `${toOrdinal(number)}シングル` };
  if (kind === "album" && Number.isFinite(number)) return { kind, label: `${toOrdinal(number)}アルバム` };
  if (kind === "digital") return { kind, label: "配信限定" };
  if (kind === "special") return { kind, label: "特別曲" };
  return { kind, label: "その他" };
}

// 曲の役割（表題曲／カップリング／全員曲／ユニット曲）
export function describeSongRole(song, workKind) {
  if (song.category === CATEGORY.TITLE_TRACK) return { kind: "title", label: "表題曲" };
  if (song.category === CATEGORY.UNIT_SONG) return { kind: "unit", label: "ユニット曲" };
  if (song.category === CATEGORY.GROUP_SONG && workKind === "single") return { kind: "coupling", label: "カップリング" };
  if (song.category === CATEGORY.GROUP_SONG) return { kind: "group", label: "全員曲" };
  return { kind: "other", label: song.category ?? "その他" };
}

// 一覧の行を発売順に組み立てる。
// 並び：作品の発売日（作品内で最も早い曲の発売日）→ 同じ日なら作品ID → 作品内は表題曲を先頭、あとは songs.js の並び。
// Overture のような特別収録曲（センターと関係の無い曲）は除く。
export function buildCenterRows(songs, sources = CENTER_SOURCES) {
  const workDates = new Map();
  songs.forEach((song) => {
    const current = workDates.get(song.workId);
    if (!current || (song.releaseDate ?? "") < current) workDates.set(song.workId, song.releaseDate ?? "");
  });
  return songs
    .map((song, index) => ({ song, index }))
    .filter(({ song }) => song.category !== CATEGORY.SPECIAL)
    .sort((a, b) => {
      const dateA = workDates.get(a.song.workId) ?? "";
      const dateB = workDates.get(b.song.workId) ?? "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      if (a.song.workId !== b.song.workId) return String(a.song.workId).localeCompare(String(b.song.workId));
      const titleA = a.song.category === CATEGORY.TITLE_TRACK ? 0 : 1;
      const titleB = b.song.category === CATEGORY.TITLE_TRACK ? 0 : 1;
      if (titleA !== titleB) return titleA - titleB;
      return a.index - b.index;
    })
    .map(({ song }) => {
      const work = describeWork(song.workId);
      return {
        song,
        work,
        role: describeSongRole(song, work.kind),
        center: classifyCenter(song, sources),
      };
    });
}

// 絞り込み：memberName（センターに含むメンバー）・query（曲名の一部）・includeNoCenterSongs（ソロ・2人の曲も出すか）
export function filterCenterRows(rows, { memberName = null, query = "", includeNoCenterSongs = false, normalize = (text) => text } = {}) {
  const normalizedQuery = normalize(String(query ?? "").trim());
  return rows.filter((row) => {
    if (!includeNoCenterSongs && ["solo", "duo"].includes(row.center.state)) return false;
    if (memberName && !row.center.centerNames.includes(memberName)) return false;
    if (normalizedQuery) {
      const haystacks = [row.song.title, row.song.searchReading ?? ""].map((text) => normalize(text));
      if (!haystacks.some((text) => text.includes(normalizedQuery))) return false;
    }
    return true;
  });
}

// 根拠の種類ごとの件数（画面上部のまとめと、テストに使う）
export function countEvidenceKinds(rows) {
  const counts = {};
  rows.forEach((row) => {
    if (!row.center.evidenceKind) return;
    counts[row.center.evidenceKind] = (counts[row.center.evidenceKind] ?? 0) + 1;
  });
  return counts;
}
