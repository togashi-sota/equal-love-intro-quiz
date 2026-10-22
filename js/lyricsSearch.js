// 歌詞検索の「探す処理」だけを担当するファイル（2026-10-23新設）。DOMにもデータベースにも触れない。
// 歌詞は js/lyricsStorage.js（端末内のIndexedDB）に保存済みのものを、画面側が読み取って渡す。
// 歌詞本文・検索語はどこにも送らず、保存もしない（本人資料：歌詞・検索語を外部送信しない）。
//
// 【仕様（本人資料「歌詞検索」より）】
// ・1曲につき結果は1件（同じ曲で何度一致しても1件にまとめ、一致した回数を数える）
// ・一致箇所は曲ごとに最初の3か所を見せる。全文を開いたときは一致箇所をすべてハイライトする
// ・空白・記号・ひらがな／カタカナ・全角／半角の違いは吸収する（行をまたいだ一致も見つける）
// ・一致が1曲も無いときだけ、軽微な違いで近い歌詞を「類似候補」として別枠で出す（一致とは混ぜない）
import { normalizeWithIndexMap, normalizeSearchText, allowedTypoCount, findApproximateSubstring } from "./searchNormalize.js";

// 1文字だと大量の曲に一致して役に立たないため、2文字から検索する
export const LYRICS_SEARCH_MIN_QUERY_LENGTH = 2;
export const LYRICS_SNIPPET_LIMIT = 3;
export const LYRICS_SIMILAR_LIMIT = 5;

// 保存済みの歌詞データ（[{ songId, lines: [{ text }] }]）から、検索用の索引を作る。
// 曲全体の歌詞を1本の正規化済み文字列にまとめ、各文字が「何行目の何文字目」から来たかを覚えておく。
export function buildLyricsSearchIndex(records, songs) {
  const songOrder = new Map(songs.map((song, index) => [song.id, index]));
  const songById = new Map(songs.map((song) => [song.id, song]));
  return (records ?? [])
    .filter((record) => songById.has(record?.songId) && Array.isArray(record.lines))
    .map((record) => {
      const lines = record.lines.map((line) => String(line?.text ?? ""));
      let normalized = "";
      const lineOfChar = [];
      const offsetOfChar = [];
      const offsetEndOfChar = [];
      lines.forEach((text, lineIndex) => {
        const mapped = normalizeWithIndexMap(text);
        normalized += mapped.normalized;
        mapped.map.forEach((offset, unitIndex) => {
          lineOfChar.push(lineIndex);
          offsetOfChar.push(offset);
          offsetEndOfChar.push(mapped.mapEnd[unitIndex]);
        });
      });
      const song = songById.get(record.songId);
      return { songId: record.songId, title: song.title, order: songOrder.get(record.songId), lines, normalized, lineOfChar, offsetOfChar, offsetEndOfChar };
    })
    .sort((a, b) => a.order - b.order);
}

// 正規化した文字列の [start, end) を、行ごとの元の歌詞の範囲 { lineIndex, start, end } の配列へ戻す
function toLineRanges(songIndex, start, end) {
  const ranges = [];
  for (let position = start; position < end; position += 1) {
    const lineIndex = songIndex.lineOfChar[position];
    const offset = songIndex.offsetOfChar[position];
    const offsetEnd = songIndex.offsetEndOfChar[position];
    const last = ranges[ranges.length - 1];
    // 同じ行で、間に検索では無視する文字（空白・記号）しか無ければ、1つのハイライトにつなげる
    const gapIsIgnorable = last && last.lineIndex === lineIndex && normalizeSearchText(songIndex.lines[lineIndex].slice(last.end, offset)) === "";
    if (last && last.lineIndex === lineIndex && (offset <= last.end || gapIsIgnorable)) {
      last.end = Math.max(last.end, offsetEnd);
    } else {
      ranges.push({ lineIndex, start: offset, end: offsetEnd });
    }
  }
  return ranges;
}

// 行ごとのハイライト範囲（全文表示用）を Map<lineIndex, [{start,end}]> にまとめる
function groupRangesByLine(allRanges) {
  const byLine = new Map();
  allRanges.forEach((range) => {
    if (!byLine.has(range.lineIndex)) byLine.set(range.lineIndex, []);
    byLine.get(range.lineIndex).push({ start: range.start, end: range.end });
  });
  return byLine;
}

// 1曲の中の一致箇所をすべて探す（重ならないように、見つけた位置の直後から次を探す）
function findMatchesInSong(songIndex, query) {
  const matches = [];
  let from = 0;
  while (from <= songIndex.normalized.length - query.length) {
    const position = songIndex.normalized.indexOf(query, from);
    if (position === -1) break;
    matches.push(toLineRanges(songIndex, position, position + query.length));
    from = position + query.length;
  }
  return matches;
}

// 一致箇所1つ分の「抜粋」：一致がまたがる行（1〜2行）と、その中のハイライト範囲
function buildSnippet(songIndex, ranges) {
  const lineIndexes = [...new Set(ranges.map((range) => range.lineIndex))];
  return lineIndexes.map((lineIndex) => ({
    lineIndex,
    text: songIndex.lines[lineIndex],
    ranges: ranges.filter((range) => range.lineIndex === lineIndex).map(({ start, end }) => ({ start, end })),
  }));
}

// 検索する。戻り値：
//   status      … "empty"（未入力）／"tooShort"（1文字）／"ok"
//   results     … 一致した曲（一致回数の多い順、同数なら収録曲一覧の順）。1曲1件。
//   similar     … 一致が0件のときだけ、近い歌詞を含む曲（類似候補。一致とは別扱い）
export function searchLyrics(index, rawQuery) {
  const query = normalizeSearchText(rawQuery);
  if (query.length === 0) return { status: "empty", query, results: [], similar: [] };
  if (query.length < LYRICS_SEARCH_MIN_QUERY_LENGTH) return { status: "tooShort", query, results: [], similar: [] };

  const results = [];
  index.forEach((songIndex) => {
    const matches = findMatchesInSong(songIndex, query);
    if (matches.length === 0) return;
    results.push({
      songId: songIndex.songId,
      title: songIndex.title,
      order: songIndex.order,
      matchCount: matches.length,
      snippets: matches.slice(0, LYRICS_SNIPPET_LIMIT).map((ranges) => buildSnippet(songIndex, ranges)),
      highlightsByLine: groupRangesByLine(matches.flat()),
      lines: songIndex.lines,
    });
  });
  results.sort((a, b) => b.matchCount - a.matchCount || a.order - b.order);

  const similar = results.length === 0 ? findSimilarLyrics(index, query) : [];
  return { status: "ok", query, results, similar };
}

// 類似候補：検索語と1〜2文字違いの部分を含む曲（短すぎる検索語では出さない＝不自然な候補を乱発しない）
export function findSimilarLyrics(index, normalizedQuery) {
  const maxDistance = allowedTypoCount(normalizedQuery.length);
  if (maxDistance === 0) return [];
  const candidates = [];
  index.forEach((songIndex) => {
    const found = findApproximateSubstring(songIndex.normalized, normalizedQuery, maxDistance);
    if (!found) return;
    const lineIndex = songIndex.lineOfChar[Math.max(0, found.end - 1)];
    candidates.push({
      songId: songIndex.songId,
      title: songIndex.title,
      order: songIndex.order,
      distance: found.distance,
      lineText: songIndex.lines[lineIndex],
      lines: songIndex.lines,
    });
  });
  return candidates.sort((a, b) => a.distance - b.distance || a.order - b.order).slice(0, LYRICS_SIMILAR_LIMIT);
}
