// 【2026-10-23新設】歌詞検索のグループ名「＝LOVE」表記揺れ・曲名／愛称（国歌）での検索の回帰テスト。
// 実在の歌詞は使わず、テスト用のダミー文だけで確認する（歌詞データはGit管理外のため）。
import { SONGS } from "../js/data/songs.js";
import { normalizeWithGroupNameToken, normalizeSearchText, GROUP_NAME_TOKEN } from "../js/searchNormalize.js";
import { buildLyricsSearchIndex, searchLyrics, findSongNameMatches } from "../js/lyricsSearch.js";
import { normalizeForSearch, songMatchesSearch } from "../js/songSearch.js";
import { buildAppSearchEntries, searchAppEntries, suggestSimilarEntries } from "../js/appSearchIndex.js";
import { assertEqual } from "./test-utils.js";

const DUMMY_SONGS = [
  { id: "gn-a", title: "ダミーA" },
  { id: "gn-b", title: "ダミーB" },
  { id: "gn-c", title: "ダミーC" },
  { id: "gn-d", title: "ダミーD" },
];
const DUMMY_LYRICS = [
  { songId: "gn-a", lines: [{ text: "わたしたちは＝LOVE" }, { text: "love のテスト" }] },
  { songId: "gn-b", lines: [{ text: "イコールラブが好き" }] },
  { songId: "gn-c", lines: [{ text: "イコラブと=LOVE" }, { text: "いこーるらぶ" }] },
  { songId: "gn-d", lines: [{ text: "I love you テスト" }] },
];

async function fetchText(path) {
  return (await fetch(path, { cache: "no-store" })).text();
}

export async function runLyricsGroupNameTests() {
  // ===== A. グループ名だけを1文字にまとめる正規化 =====
  for (const text of ["＝LOVE", "=LOVE", "＝ＬＯＶＥ", "= love", "イコールラブ", "いこーるらぶ", "イコラブ", "いこらぶ", "ｲｺｰﾙﾗﾌﾞ"]) {
    assertEqual(normalizeWithGroupNameToken(text).normalized, GROUP_NAME_TOKEN, `A: 「${text}」はグループ名として同じ1文字になる`);
  }
  assertEqual(normalizeWithGroupNameToken("love").normalized, "love", "A: ただの英単語 love はグループ名にしない");
  assertEqual(normalizeWithGroupNameToken("LOVE").normalized, "love", "A: ＝の無い LOVE はグループ名にしない");
  const mapped = normalizeWithGroupNameToken("ああイコールラブです");
  assertEqual([mapped.normalized, mapped.map, mapped.mapEnd], [`ああ${GROUP_NAME_TOKEN}です`, [0, 1, 2, 8, 9], [1, 2, 8, 9, 10]], "A: グループ名1文字は元の表記全体（6文字）を指す");
  assertEqual(normalizeSearchText("＝LOVE"), "love", "A: 通常の正規化（全体検索・曲名検索で使用）は変えていない");

  // ===== B. 歌詞検索：表記が違っても同じ言葉として見つかる =====
  const index = buildLyricsSearchIndex(DUMMY_LYRICS, DUMMY_SONGS);
  const ids = (query) => searchLyrics(index, query).results.map((result) => result.songId);
  for (const query of ["イコールラブ", "いこーるらぶ", "イコラブ", "いこらぶ", "＝LOVE", "=LOVE"]) {
    assertEqual(ids(query).sort(), ["gn-a", "gn-b", "gn-c"], `B: 「${query}」で＝LOVE／イコールラブ／イコラブの表記の曲がすべて見つかる`);
  }
  assertEqual(searchLyrics(index, "＝LOVE").status, "ok", "B: 「＝LOVE」だけでも短すぎる扱いにしない");
  const both = searchLyrics(index, "イコールラブ").results.find((result) => result.songId === "gn-c");
  assertEqual([searchLyrics(index, "イコールラブ").results.filter((result) => result.songId === "gn-c").length, both.matchCount], [1, 3], "B: 複数の表記を含む曲も1曲1結果（一致数は3か所）");
  const highlightOf = (query, songId) => {
    const result = searchLyrics(index, query).results.find((entry) => entry.songId === songId);
    const line = result.snippets[0][0];
    return line.ranges.map((range) => line.text.slice(range.start, range.end));
  };
  assertEqual(highlightOf("イコールラブ", "gn-a"), ["＝LOVE"], "B: 「＝LOVE」の表記全体をハイライト");
  assertEqual(highlightOf("＝LOVE", "gn-b"), ["イコールラブ"], "B: 「イコールラブ」の表記全体をハイライト");
  assertEqual(highlightOf("イコールラブが", "gn-b"), ["イコールラブが"], "B: グループ名＋前後の言葉もつなげて検索・ハイライト");
  assertEqual(ids("ラブが好き"), ["gn-b"], "B: グループ名を含まない検索は従来どおり");
  assertEqual(ids("love").sort(), ["gn-a", "gn-c", "gn-d"], "B: 「love」の検索結果は従来どおり（＝LOVE表記は従来どおり一致し、イコールラブだけの曲は混ざらない）");
  assertEqual(DUMMY_LYRICS[0].lines[0].text, "わたしたちは＝LOVE", "B: 歌詞本文そのものは変更しない");
  assertEqual(searchLyrics(index, "イコールラブがすき").similar.map((candidate) => candidate.songId).includes("gn-b"), true, "B: グループ名を含む検索でも類似候補は別枠で出る");

  // ===== C. 曲名・愛称（国歌）での一致は歌詞の一致と別枠 =====
  const debut = SONGS.find((song) => song.searchAliases?.some((alias) => alias?.text === "国歌"));
  assertEqual(Boolean(debut), true, "C: デビュー曲に「国歌」の愛称がある");
  assertEqual(findSongNameMatches(SONGS, "国歌").map((match) => match.songId), [debut.id], "C: 歌詞検索で「国歌」→デビュー曲（曲名・愛称の一致）");
  assertEqual(findSongNameMatches(SONGS, "こっか").map((match) => match.songId), [debut.id], "C: 「こっか」でも見つかる");
  const kokka = searchLyrics(index, "国歌", { songs: SONGS });
  assertEqual([kokka.results.length, kokka.nameMatches.map((match) => match.songId)], [0, [debut.id]], "C: 「国歌」は歌詞の一致としては出さず、曲名・愛称の一致だけに出す");
  assertEqual(kokka.nameMatches[0].hasLyrics, false, "C: 歌詞データが無い曲は全文表示の対象にしない");
  assertEqual(searchLyrics(index, "国歌").nameMatches, [], "C: 曲一覧を渡さないときは曲名の一致を返さない");

  // ===== D. 全体検索・収録曲一覧の曲名検索 =====
  assertEqual(songMatchesSearch(debut.title, debut.searchReading, debut.searchAliases, normalizeForSearch("国歌")), true, "D: 収録曲一覧の曲検索で「国歌」");
  assertEqual(songMatchesSearch(debut.title, debut.searchReading, debut.searchAliases, normalizeForSearch("こっか")), true, "D: 収録曲一覧の曲検索で「こっか」");
  const entries = buildAppSearchEntries({ today: "2026-10-23" });
  assertEqual(searchAppEntries(entries, "国歌", "all").results[0]?.entry.key, `song:${debut.id}`, "D: 全体検索で「国歌」→デビュー曲が先頭");
  assertEqual(searchAppEntries(entries, "こっか", "all").results[0]?.entry.key, `song:${debut.id}`, "D: 全体検索で「こっか」→デビュー曲が先頭");
  assertEqual(suggestSimilarEntries(entries, "国家").map((entry) => entry.key).includes(`song:${debut.id}`), true, "D: 誤字「国家」で「国歌」（デビュー曲）を候補に出す");
  assertEqual(suggestSimilarEntries(entries, "あい"), [], "D: 漢字以外の2文字では誤字候補を出さない");

  // ===== E. 画面 =====
  const screenSource = await fetchText("js/lyricsSearchScreen.js");
  assertEqual(screenSource.includes("曲名・愛称で一致した曲（歌詞の一致ではありません）"), true, "E: 曲名・愛称の一致は「歌詞の一致ではありません」と明記した別枠");
  const html = new DOMParser().parseFromString(await fetchText("index.html"), "text/html");
  const order = [...html.querySelectorAll("#lyrics-search-results, #lyrics-search-name-matches, #lyrics-search-similar")].map((element) => element.id);
  assertEqual(order, ["lyrics-search-results", "lyrics-search-name-matches", "lyrics-search-similar"], "E: 歌詞の一致→曲名・愛称の一致→類似候補の順に別々の枠");
  const mainSource = await fetchText("js/main.js");
  assertEqual(mainSource.includes('nameMatches: document.getElementById("lyrics-search-name-matches")'), true, "E: 画面へ枠を渡している");
}
