// 【2026-10-23新設】ライブ情報の更新・全体検索（アプリ内検索）・歌詞検索 の回帰テスト。
// 歌詞検索のテストは、実在の歌詞を使わずテスト用のダミー文だけで行う（歌詞データはGit管理外のため）。
import { LIVE_EVENTS, LIVE_STATUS } from "../js/data/liveHistory.js";
import { HISTORY_EVENTS } from "../js/data/historyEvents.js";
import { MEMBERS } from "../js/data/members.js";
import { COMMERCIALS } from "../js/data/commercials.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { SPECIAL_MODES } from "../js/specialModesScreen.js";
import {
  normalizeSearchText,
  normalizeWithIndexMap,
  editDistanceWithin,
  allowedTypoCount,
  findApproximateSubstring,
} from "../js/searchNormalize.js";
import {
  APP_SEARCH_CATEGORIES,
  APP_SEARCH_SUGGESTION_LIMIT,
  buildAppSearchEntries,
  searchAppEntries,
  tokenizeAppSearchQuery,
  describeLiveStatus,
  describeLiveVideo,
} from "../js/appSearchIndex.js";
import { buildLyricsSearchIndex, searchLyrics, LYRICS_SNIPPET_LIMIT, LYRICS_SIMILAR_LIMIT } from "../js/lyricsSearch.js";
import { appendHighlightedText, buildExpandableResult, buildMoreButton, createSearchSessionState, SEARCH_PAGE_SIZE } from "../js/searchResultUi.js";
import { assertEqual } from "./test-utils.js";

const TODAY = "2026-10-23";

async function fetchText(path) {
  return (await fetch(path, { cache: "no-store" })).text();
}

function findLive(id) {
  return LIVE_EVENTS.find((event) => event.id === id);
}

// テスト用のダミー曲（実在の曲名・歌詞は使わない）
const DUMMY_SONGS = [
  { id: "dummy-a", title: "ダミー曲A" },
  { id: "dummy-b", title: "ダミー曲B" },
  { id: "dummy-c", title: "ダミー曲C" },
  { id: "dummy-d", title: "ダミー曲D" },
];
const DUMMY_LYRICS = [
  { songId: "dummy-a", lines: ["君と歩いた帰り道", "テスト用の一行", "また君と笑いたい", "君と見た景色", "君と", "歩いた道"].map((text) => ({ text })) },
  { songId: "dummy-b", lines: ["ダミーの二曲目", "君と未来を描く"].map((text) => ({ text })) },
  { songId: "dummy-c", lines: ["カタカナのキミトテスト", "記号！？　も・あります"].map((text) => ({ text })) },
  { songId: "dummy-d", lines: ["ＡＢＣ　ｄｅｆ　テスト", "ﾊﾝｶｸｶﾅ"].map((text) => ({ text })) },
  // 曲一覧に無い曲の歌詞は対象外（古いデータが残っていても結果に出さない）
  { songId: "not-in-songs", lines: [{ text: "君と君と君と" }] },
];

export async function runSearchFeaturesTests() {
  // ===== A. ライブ情報・映像商品の更新（2026-10-23、公式情報で確認） =====
  const yokohama = findLive("live-8th-anniversary-tour-yokohama-final");
  assertEqual(yokohama.status, LIVE_STATUS.HELD, "A: 横浜スタジアム公演は開催済み");
  assertEqual(yokohama.blurayReleased, true, "A: 横浜スタジアム公演の映像は発売済み（2026-10-14）");
  assertEqual(yokohama.productLinks[0].label.includes("発売予定"), false, "A: 横浜スタジアムの映像に「発売予定」の表記が残っていない");
  assertEqual(yokohama.productLinks[0].url, "https://equal-love.jp/news/detail/11855", "A: 横浜スタジアムの映像は公式ニュースへ");

  const stadium = findLive("live-stadium-beyond-kyun");
  assertEqual(stadium.status, LIVE_STATUS.HELD, "A: 国立競技場公演は開催済み");
  assertEqual(stadium.blurayReleased, false, "A: 国立競技場の映像はまだ発売前（発売済みにしていない）");
  assertEqual(stadium.videoReleaseDate, "2026-12-23", "A: 国立競技場の映像は2026-12-23発売予定");
  assertEqual(stadium.productLinks.map((link) => link.url), ["https://equal-love.jp/news/detail/12281"], "A: 国立競技場の映像は公式ニュース（12281）へ");
  assertEqual(describeLiveVideo(stadium, TODAY), "映像化決定（2026年12月23日発売予定）", "A: 発売日前は「発売予定」と表示");
  assertEqual(describeLiveVideo(stadium, "2026-12-24"), "映像化決定（発売日：2026年12月23日）", "A: 発売日を過ぎても「発売済み」とは断定しない表記");
  assertEqual(describeLiveVideo(yokohama, TODAY), "映像作品あり（Blu-ray／DVD）", "A: 発売済みは「映像作品あり」");

  const ninth = findLive("live-9th-anniversary-premium-concert");
  assertEqual(ninth.status, LIVE_STATUS.HELD, "A: 9周年公演（TOYOTA ARENA TOKYO）は開催済み");

  const dome = findLive("live-tokyo-dome-announced");
  assertEqual(dome.status, LIVE_STATUS.ANNOUNCED, "A: 東京ドーム公演は開催予定のまま");
  assertEqual(dome.title, "＝LOVE in TOKYO DOME", "A: 東京ドーム公演は公式の公演名");
  assertEqual([dome.startDate, dome.endDate], ["2027-01-19", "2027-01-20"], "A: 東京ドームの日程（2027-01-19・20）");
  assertEqual(dome.sourceUrls.includes("https://equal-love.jp/news/detail/11613"), true, "A: 東京ドームの出典に公式ニュース");
  assertEqual(describeLiveStatus(dome, TODAY), "開催予定", "A: 東京ドームは「開催予定」");

  const nagoya = findLive("live-nagoya-dome-announced");
  assertEqual(nagoya?.status, LIVE_STATUS.ANNOUNCED, "A: バンテリンドーム ナゴヤ公演を開催予定として追加");
  assertEqual(nagoya?.title, "＝LOVE DOME LIVE in NAGOYA「全ては＝LOVE」", "A: ナゴヤ公演の公式の公演名");
  assertEqual([nagoya?.startDate, nagoya?.endDate, nagoya?.venues[0].name], ["2027-02-24", "2027-02-25", "バンテリンドーム ナゴヤ"], "A: ナゴヤ公演の日程・会場");
  assertEqual(nagoya?.sourceUrls, ["https://equal-love.jp/news/detail/12275"], "A: ナゴヤ公演の出典は公式ニュース");
  assertEqual(new Set(LIVE_EVENTS.map((event) => event.id)).size, LIVE_EVENTS.length, "A: 公演IDに重複が無い");
  assertEqual(LIVE_EVENTS.length >= 20, true, "A: 過去の公演履歴を削除していない");
  assertEqual(
    LIVE_EVENTS.filter((event) => event.status === LIVE_STATUS.ANNOUNCED && (event.endDate ?? event.startDate) < TODAY).map((event) => event.id),
    [],
    "A: 開催予定のまま日程が過ぎた公演が無い"
  );
  const domeHistory = HISTORY_EVENTS.find((event) => event.date === "2027-01-19");
  assertEqual(domeHistory.sourceUrls[0], "https://equal-love.jp/news/detail/11613", "A: 年表の東京ドームも公式ニュースを出典に");
  // 【2026-10-28】ライブ履歴のカードは【ライブ】ページ（js/liveHubScreen.js）へ移した
  const liveHubSource = await fetchText("js/liveHubScreen.js");
  assertEqual(liveHubSource.includes("映像化決定（発売予定）"), true, "A: ライブ履歴に「映像化決定（発売予定）」タグ");
  assertEqual(liveHubSource.includes("card.dataset.liveId = event.id;"), true, "A: ライブカードに検索からの移動用の目印");

  // ===== B. 検索用の正規化（表記揺れ） =====
  assertEqual(normalizeSearchText("サクラ"), normalizeSearchText("さくら"), "B: カタカナとひらがなを同じに扱う");
  assertEqual(normalizeSearchText("ＡＢＣ　１２３"), "abc123", "B: 全角英数字・全角空白を吸収");
  assertEqual(normalizeSearchText("ﾃｽﾄ"), normalizeSearchText("てすと"), "B: 半角カナを吸収");
  assertEqual(normalizeSearchText("＝LOVE！？「ラブ」・♡"), "loveらぶ", "B: 記号・絵文字を無視");
  assertEqual(normalizeSearchText("ラーメン"), "らーめん", "B: 長音は残す");
  const mapped = normalizeWithIndexMap("A　ｂ！c");
  assertEqual([mapped.normalized, mapped.map], ["abc", [0, 2, 4]], "B: 正規化後の各文字が元の何文字目かを持つ");
  assertEqual(editDistanceWithin("ささきまいか", "ささきまいかあ", 1), 1, "B: 1文字違いを検出");
  assertEqual(editDistanceWithin("あいう", "かきく", 1), null, "B: 違いが大きいものは候補にしない");
  assertEqual([allowedTypoCount(2), allowedTypoCount(4), allowedTypoCount(10)], [0, 1, 2], "B: 誤字許容数は短い語ほど厳しい（2文字以下は0）");
  assertEqual(findApproximateSubstring("きみとみらいをえがく", "みらいおえがく", 1)?.distance, 1, "B: 長い文の中の近い部分を見つける");

  // ===== C. 全体検索（アプリ内検索）=====
  const entries = buildAppSearchEntries({ today: TODAY });
  assertEqual(entries.length > 250, true, "C: 既存データから検索用の項目を組み立てる（250件超）");
  assertEqual(new Set(entries.map((entry) => entry.key)).size, entries.length, "C: 検索項目のキーに重複が無い");
  const categoryIds = APP_SEARCH_CATEGORIES.map((category) => category.id);
  assertEqual(entries.every((entry) => categoryIds.includes(entry.category) && entry.category !== "all"), true, "C: すべての項目が既定のカテゴリに属する");
  assertEqual(entries.filter((entry) => entry.category === "member").length, MEMBERS.length, "C: メンバー全員が検索対象");
  assertEqual(entries.filter((entry) => entry.key.startsWith("cm:")).length, COMMERCIALS.length, "C: CM・広告が全件検索対象（データ追加で自動的に増える）");
  assertEqual(entries.filter((entry) => entry.key.startsWith("live:")).length, LIVE_EVENTS.length, "C: ライブが全件検索対象");
  assertEqual(entries.filter((entry) => entry.key.startsWith("mode:")).length, SPECIAL_MODES.filter((mode) => mode.available).length, "C: 特別モードはSPECIAL_MODESから自動で組み立てる");
  const allTargetsValid = entries.every((entry) => entry.action && ["member", "membersList", "discography", "work", "song", "guide", "feature", "liveHub"].includes(entry.action.target.kind));
  assertEqual(allTargetsValid, true, "C: すべての項目に元ページへの移動先がある");

  const top = (query, category = "all") => searchAppEntries(entries, query, category).results.map(({ entry }) => entry.title);
  assertEqual(searchAppEntries(entries, "", "all").results.length, 0, "C: 空欄のときは全件を出さない");
  assertEqual(searchAppEntries(entries, "   ", "all").results.length, 0, "C: 空白だけでも全件を出さない");
  assertEqual(top("佐々木")[0], "佐々木舞香", "C: 名前で検索するとメンバー本人が先頭");
  assertEqual(top("ささき")[0], "佐々木舞香", "C: 読み仮名でも見つかる");
  assertEqual(top("ササキ")[0], "佐々木舞香", "C: カタカナの読みでも見つかる");
  assertEqual(searchAppEntries(entries, "ささき", "cm").results.length >= 7, true, "C: 読み仮名で、その人のCM・広告も見つかる");
  assertEqual(top("みりにゃ")[0], "大谷映美里", "C: 愛称でメンバーが見つかる");
  assertEqual(top("マック", "cm").length >= 3, true, "C: 企業・商品名でCMが見つかる");
  assertEqual(top("東京ドーム")[0], "＝LOVE in TOKYO DOME", "C: 会場名でライブが見つかる");
  // 【2026-10-27】瀧脇笙古の『BAY☆スタ』コラム（説明文に「横浜DeNA」「2026年6月」を含む）が加わり、両方の語に一致する
  // 正しい結果が1件増えたため、「ライブが先頭」かつ「結果が2件以内に絞られる」ことを確かめる形にした
  const yokohama2026 = top("横浜 2026");
  assertEqual(yokohama2026[0], "＝LOVE 8th ANNIVERSARY PREMIUM TOUR FINAL in 横浜スタジアム", "C: 空白区切りの複数語で絞り込める（ライブが先頭）");
  assertEqual(yokohama2026.length <= 2, true, "C: 空白区切りの複数語で絞り込める（件数が絞られる）");
  assertEqual(top("バンテリン")[0], "＝LOVE DOME LIVE in NAGOYA「全ては＝LOVE」", "C: 追加したナゴヤ公演も検索できる");
  assertEqual(top("効果音")[0], "サウンド設定（効果音の詳細設定）", "C: 設定項目が見つかる");
  assertEqual(top("タイムアタック").includes("タイムアタック"), true, "C: 機能・ガイドが見つかる");
  assertEqual(top("イコラブ")[0], "＝LOVEについて", "C: グループの略称で＝LOVEについてが見つかる");
  assertEqual(tokenizeAppSearchQuery("　横浜　 2026 "), ["横浜", "2026"], "C: 全角・半角の空白で語を区切る");

  const counts = searchAppEntries(entries, "佐々木", "all").countsByCategory;
  const sumOfCategories = categoryIds.filter((id) => id !== "all").reduce((sum, id) => sum + counts[id], 0);
  assertEqual(sumOfCategories, counts.all, "C: カテゴリ別件数の合計が「すべて」と一致");
  assertEqual(searchAppEntries(entries, "佐々木", "cm").results.every(({ entry }) => entry.category === "cm"), true, "C: カテゴリで絞り込める");

  const typo = searchAppEntries(entries, "ささきまいかあ", "all");
  assertEqual([typo.results.length, typo.suggestions[0]?.title], [0, "佐々木舞香"], "C: 一致なしのとき、軽微な誤字の候補を別枠で出す");
  assertEqual(searchAppEntries(entries, "zzzz", "all").suggestions.length, 0, "C: 近い候補が無ければ候補を出さない（乱発しない）");
  assertEqual(searchAppEntries(entries, "あい", "all").suggestions.length, 0, "C: 一致があるときは「もしかして」を出さない／短い語では誤字候補を出さない");
  assertEqual(APP_SEARCH_SUGGESTION_LIMIT, 5, "C: 誤字候補は最大5件");

  const groupCm = entries.find((entry) => entry.key === "cm:cm-group-hotpepper-beauty-2026");
  assertEqual([groupCm.action.target.kind, groupCm.action.target.tab], ["discography", "about"], "C: 全員出演のCMは＝LOVEについてへ");
  const memberCm = entries.find((entry) => entry.key.startsWith("cm:") && entry.action.target.kind === "member");
  assertEqual(memberCm.action.target.focusSelector.startsWith("[data-commercial-id="), true, "C: 個人CMはメンバーページの該当カードへ");
  const liveEntry = entries.find((entry) => entry.key === "live:live-tokyo-dome-announced");
  // 【2026-10-28】ライブ履歴は【ライブ】ページ（js/liveHubScreen.js）の「過去のライブ」へ移した
  assertEqual([liveEntry.action.target.kind, liveEntry.action.target.view, liveEntry.lines.includes("状態：開催予定")], ["liveHub", "history", true], "C: ライブは【ライブ】ページの過去のライブへ・状態を表示");

  // 個人データ・管理者情報・歌詞本文を検索対象にしていない（データの読み込み元を確認）
  const indexSource = await fetchText("js/appSearchIndex.js");
  const forbiddenSources = ["lyricsStorage", "playHistory", "firebase", "fanProfile", "weakSong", "adminAccess", "localStorage"];
  assertEqual(forbiddenSources.filter((word) => indexSource.includes(word)), [], "C: 全体検索は個人データ・歌詞・管理者情報・Firebaseを読まない");

  // 機能・設定の「開く」ボタンの行き先がアプリに実在する
  const indexHtml = new DOMParser().parseFromString(await fetchText("index.html"), "text/html");
  const missingSelectors = APP_SEARCH_FEATURES.filter((feature) => feature.action.selector && !indexHtml.querySelector(feature.action.selector)).map((feature) => feature.id);
  assertEqual(missingSelectors, [], "C: 機能・設定の移動先（ボタン・欄）がindex.htmlに実在する");
  const modeIds = SPECIAL_MODES.map((mode) => mode.id);
  assertEqual(APP_SEARCH_FEATURES.filter((feature) => feature.action.type === "specialMode").every((feature) => modeIds.includes(feature.action.modeId)), true, "C: 特別モードの移動先が実在する");

  // ===== D. 歌詞検索（ダミーデータ） =====
  const lyricsIndex = buildLyricsSearchIndex(DUMMY_LYRICS, DUMMY_SONGS);
  assertEqual(lyricsIndex.map((song) => song.songId), ["dummy-a", "dummy-b", "dummy-c", "dummy-d"], "D: 曲一覧に無い曲の歌詞は索引に入れない");
  assertEqual(searchLyrics(lyricsIndex, "").status, "empty", "D: 空欄は案内を出す");
  assertEqual(searchLyrics(lyricsIndex, "君").status, "tooShort", "D: 1文字は2文字以上を案内");
  const kimito = searchLyrics(lyricsIndex, "君と");
  assertEqual(kimito.results.map((result) => [result.songId, result.matchCount]), [["dummy-a", 4], ["dummy-b", 1]], "D: 1曲1件にまとめ、一致数の多い順");
  assertEqual(kimito.results[0].snippets.length, LYRICS_SNIPPET_LIMIT, "D: 一致箇所は最初の3か所だけ抜粋");
  const firstSnippet = kimito.results[0].snippets[0][0];
  assertEqual(firstSnippet.text.slice(firstSnippet.ranges[0].start, firstSnippet.ranges[0].end), "君と", "D: 抜粋のハイライト位置が正しい");
  assertEqual([...kimito.results[0].highlightsByLine.keys()], [0, 2, 3, 4], "D: 全文表示用に一致した行をすべて持つ");
  assertEqual(kimito.similar.length, 0, "D: 一致があるときは類似候補を出さない");

  const crossLine = searchLyrics(lyricsIndex, "君と歩いた道");
  assertEqual(crossLine.results.map((result) => result.songId), ["dummy-a"], "D: 行をまたいだ歌詞も見つかる");
  assertEqual(crossLine.results[0].snippets[0].map((line) => line.text), ["君と", "歩いた道"], "D: 行をまたぐ一致は2行分を抜粋");
  assertEqual(searchLyrics(lyricsIndex, "きみと").results.map((result) => result.songId), ["dummy-c"], "D: ひらがなでカタカナの歌詞が見つかる");
  assertEqual(searchLyrics(lyricsIndex, "abc def").results.map((result) => result.songId), ["dummy-d"], "D: 全角英字・空白の違いを吸収");
  assertEqual(searchLyrics(lyricsIndex, "はんかく").results.map((result) => result.songId), ["dummy-d"], "D: 半角カナの歌詞も見つかる");
  assertEqual(searchLyrics(lyricsIndex, "も・あります！").results.length, 1, "D: 記号の違いを吸収");

  const similar = searchLyrics(lyricsIndex, "君と未来お描く");
  assertEqual(similar.results.length, 0, "D: 一字違いは「一致」として扱わない");
  assertEqual(similar.similar.map((candidate) => candidate.songId), ["dummy-b"], "D: 一致が無いときだけ類似候補を別枠で出す");
  assertEqual(similar.similar[0].lineText, "君と未来を描く", "D: 類似候補は近い行を見せる");
  assertEqual(searchLyrics(lyricsIndex, "ぜんぜん無い言葉です").similar.length, 0, "D: 近い歌詞が無ければ類似候補を出さない");
  assertEqual(LYRICS_SIMILAR_LIMIT, 5, "D: 類似候補は最大5曲");
  const manySongs = Array.from({ length: 25 }, (_, index) => ({ id: `many-${index}`, title: `多数${index}` }));
  const manyIndex = buildLyricsSearchIndex(manySongs.map((song) => ({ songId: song.id, lines: [{ text: "共通の言葉" }] })), manySongs);
  assertEqual(searchLyrics(manyIndex, "共通").results.length, 25, "D: 一致した曲はすべて結果に含める（表示は10件ずつ）");

  // 歌詞検索は歌詞データを読み取るだけ（外部送信・保存をしない）
  const lyricsScreenSource = await fetchText("js/lyricsSearchScreen.js");
  const lyricsEngineSource = await fetchText("js/lyricsSearch.js");
  const storageSource = await fetchText("js/lyricsStorage.js");
  const sendWords = ["fetch(", "firebase", "localStorage", "sessionStorage", "saveLyricsData", "deleteLyricsData"];
  assertEqual(sendWords.filter((word) => (lyricsScreenSource + lyricsEngineSource).includes(word)), [], "D: 歌詞・検索語を送信・保存しない");
  const getAllBody = storageSource.slice(storageSource.indexOf("export async function getAllLyricsData"), storageSource.indexOf("export async function getLyricsContentHashes"));
  assertEqual([getAllBody.includes('"readonly"'), getAllBody.includes("readwrite")], [true, false], "D: 歌詞の一括読み取りは読み取り専用");

  // ===== D2. レビュー指摘の修正（濁点・サロゲートペア・ハイライトのつなぎ・速度） =====
  assertEqual([normalizeSearchText("ｶﾞｰﾙ"), normalizeSearchText("ガール")], ["がーる", "がーる"], "D2: 半角カナの濁点を落とさない");
  assertEqual(normalizeSearchText(String.fromCharCode(0x30ab, 0x3099)), "が", "D2: 結合用の濁点（分解された文字）も1文字にまとめる");
  assertEqual(normalizeSearchText("ﾊﾟﾝ"), "ぱん", "D2: 半角カナの半濁点を落とさない");
  const rareKanji = String.fromCodePoint(0x20bb7);
  const rareMapped = normalizeWithIndexMap(`${rareKanji}野家`);
  assertEqual([rareMapped.normalized.length, rareMapped.map, rareMapped.mapEnd], [4, [0, 0, 2, 3], [2, 2, 3, 4]], "D2: 2単位の文字（𠮷など）の後も位置がずれない");
  const tricky = buildLyricsSearchIndex(
    [{ songId: "dummy-a", lines: [{ text: `${rareKanji}野家の歌` }, { text: "ｶﾞｰﾙの歌" }, { text: "君 と 歩く" }] }],
    DUMMY_SONGS
  );
  const highlightedText = (query) => {
    const result = searchLyrics(tricky, query).results[0];
    const snippetLine = result?.snippets[0][0];
    return snippetLine ? snippetLine.ranges.map((range) => snippetLine.text.slice(range.start, range.end)) : null;
  };
  assertEqual(highlightedText("野家"), ["野家"], "D2: 珍しい漢字の後ろの一致も正しい位置をハイライト");
  assertEqual(highlightedText("がーる"), ["ｶﾞｰﾙ"], "D2: 半角カナの濁点まで含めてハイライト");
  assertEqual(highlightedText("君と歩"), ["君 と 歩"], "D2: 間の空白は1つのハイライトにつなげる");
  const bigSongs = Array.from({ length: 100 }, (_, index) => ({ id: `big-${index}`, title: `曲${index}` }));
  const bigRecords = bigSongs.map((song) => ({ songId: song.id, lines: Array.from({ length: 40 }, (_, lineIndex) => ({ text: `テスト用のダミー歌詞 ${lineIndex} 行目 きみとあるく` })) }));
  const startedAt = performance.now();
  const bigIndex = buildLyricsSearchIndex(bigRecords, bigSongs);
  searchLyrics(bigIndex, "あるく");
  const elapsedMs = performance.now() - startedAt;
  assertEqual(elapsedMs < 1500, true, `D2: 100曲分の歌詞の索引づくり＋検索が十分速い（${Math.round(elapsedMs)}ms）`);
  const lyricsScreenSourceAfterFix = await fetchText("js/lyricsSearchScreen.js");
  assertEqual(lyricsScreenSourceAfterFix.includes("signature !== indexSignature"), true, "D2: 歌詞データが変わらなければ索引を作り直さない");

  // ===== C2. レビュー指摘の修正（移動先・戻り先） =====
  const graduatedIds = MEMBERS.filter((member) => member.status === "graduated").map((member) => member.id);
  const memberTargets = entries.filter((entry) => entry.action.target.kind === "member").map((entry) => entry.action.target.memberId);
  assertEqual(memberTargets.filter((memberId) => graduatedIds.includes(memberId)), [], "C2: 卒業メンバーの個人ページ（通常は開けない画面）へは移動しない");
  const graduatedActivity = entries.find((entry) => entry.key === "activity:saito-nagisa-acting");
  assertEqual(graduatedActivity?.action.target.kind ?? "membersList", "membersList", "C2: 卒業メンバーの活動はメンバー紹介の卒業メンバー欄へ");
  assertEqual(APP_SEARCH_FEATURES.find((feature) => feature.id === "feature-lyrics-search").action.type, "lyricsSearch", "C2: 全体検索から開いた歌詞検索の「戻る」で全体検索へ戻れる（専用の開き方）");
  const mainSourceAfterFix = await fetchText("js/main.js");
  assertEqual(mainSourceAfterFix.includes('} else if (screenAfter === "start") {'), true, "C2: 別の経路でホームへ戻ったら「検索へ戻る」記録を消す");
  assertEqual(mainSourceAfterFix.includes('for (let details = element.parentElement?.closest("details"); details;'), true, "C2: 入れ子の折りたたみをすべて開いてから移動");
  assertEqual(mainSourceAfterFix.includes("if (backClickScreenBefore !== null) return;"), true, "C2: 検索へ戻る途中でアプリ更新の再読み込みをしない");

  // ===== E. 共通の表示部品 =====
  const line = document.createElement("p");
  appendHighlightedText(line, "また君と笑いたい", [{ start: 2, end: 4 }]);
  assertEqual([line.textContent, line.querySelector("mark")?.textContent], ["また君と笑いたい", "君と"], "E: 一致箇所だけをハイライト");
  const htmlLike = document.createElement("p");
  appendHighlightedText(htmlLike, "<b>太字</b>", []);
  assertEqual(htmlLike.querySelector("b"), null, "E: 文字はHTMLとして解釈しない");
  const state = createSearchSessionState();
  const list = document.createElement("ol");
  ["a", "b"].forEach((key) => {
    list.appendChild(
      buildExpandableResult({
        key,
        expandedKeys: state.expandedKeys,
        buildHeader: (header) => header.append(key),
        buildBody: (body) => body.append(`本文${key}`),
      })
    );
  });
  list.querySelectorAll(".search-result-header").forEach((header) => header.click());
  assertEqual([...state.expandedKeys], ["a", "b"], "E: 複数の結果を同時に開ける");
  assertEqual([...list.querySelectorAll(".search-result-body")].map((body) => body.hidden), [false, false], "E: 開いた結果の本文が表示される");
  list.querySelector(".search-result-header").click();
  assertEqual([...state.expandedKeys], ["b"], "E: もう一度押すと閉じる（他の結果は開いたまま）");
  assertEqual(SEARCH_PAGE_SIZE, 10, "E: 最初は10件");
  assertEqual(buildMoreButton(10, 10, () => {}), null, "E: 全件表示済みなら「もっと見る」は出さない");
  assertEqual(buildMoreButton(10, 38, () => {}).textContent, "もっと見る（残り28件）", "E: 「もっと見る」に残り件数");

  // ===== F. 画面・導線（ソースとHTMLの確認） =====
  const startScreen = indexHtml.getElementById("start-screen");
  const startChildren = [...startScreen.querySelectorAll("#app-search-link, .home-quicknav-grid")].map((element) => element.id || element.className);
  assertEqual(startChildren, ["app-search-link", "home-quicknav-grid"], "F: 全体検索の入口はホーム上部（クイックナビの上）");
  assertEqual(indexHtml.querySelector(".listen-section #lyrics-search-link") !== null, true, "F: 歌詞検索の入口は「曲を聴く」の中");
  assertEqual(indexHtml.querySelector("#home-special-modes-grid #lyrics-search-link"), null, "F: 歌詞検索は特別モードに置かない");
  assertEqual(["app-search-screen", "lyrics-search-screen"].every((id) => indexHtml.getElementById(id)?.classList.contains("screen")), true, "F: 検索画面2つがある");
  const screensSource = await fetchText("js/screens.js");
  assertEqual(['appSearch: document.getElementById("app-search-screen")', 'lyricsSearch: document.getElementById("lyrics-search-screen")'].every((text) => screensSource.includes(text)), true, "F: 画面切り替えに登録");
  const mainSource = await fetchText("js/main.js");
  assertEqual(mainSource.includes("function openSearchTarget(target)") && mainSource.includes("revealSongInList(target.songId)"), true, "F: 検索結果から元ページ・曲の位置へ移動する");
  assertEqual(mainSource.includes("navigateWithScrollMemory(target);"), true, "F: 移動先の「戻る」で検索画面（スクロール位置付き）へ戻る");
  const screenSources = (await fetchText("js/appSearchScreen.js")) + (await fetchText("js/searchResultUi.js"));
  assertEqual(["localStorage", "sessionStorage", "indexedDB", "firebase", "fetch("].filter((word) => screenSources.includes(word)), [], "F: 検索履歴を保存・送信しない");
  const songlistSource = await fetchText("js/songlist.js");
  const revealBody = songlistSource.slice(songlistSource.indexOf("export function revealSongInList"), songlistSource.indexOf("export function resetSongListToDefaultView"));
  assertEqual(/play|Preview/.test(revealBody), false, "F: 「曲を聴く」で自動再生しない");
  const swSource = await fetchText("sw.js");
  const newFiles = ["searchNormalize.js", "searchResultUi.js", "appSearchIndex.js", "appSearchScreen.js", "lyricsSearch.js", "lyricsSearchScreen.js", "data/appSearchFeatures.js"];
  assertEqual(newFiles.filter((file) => !swSource.includes(`"./js/${file}"`)), [], "F: 新しいファイルをオフライン用キャッシュに追加");
}
