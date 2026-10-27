// 【2026-10-27新設】歴代センター一覧（根拠の判定・文字色の自動選択・発売順）と、
// ライブのセットリスト（データの整合性・「確認できた範囲で」の披露の計算・映像商品）の回帰テスト。
import { SONGS } from "../js/data/songs.js";
import { MEMBERS } from "../js/data/members.js";
import { CENTER_SOURCES } from "../js/data/centerSources.js";
import { LIVE_EVENTS } from "../js/data/liveHistory.js";
import { SETLIST_PERFORMANCES, UNVERIFIED_SETLIST_PERFORMANCES, LIVE_VIDEO_PRODUCTS } from "../js/data/setlists.js";
import {
  classifyCenter,
  describeCenterState,
  pickReadableTextColor,
  contrastRatio,
  relativeLuminance,
  buildCenterRows,
  filterCenterRows,
  countEvidenceKinds,
  describeWork,
  formatCenterLine,
} from "../js/centerChart.js";
import {
  daysBetween,
  describeYearsSpan,
  summarizeSongLive,
  buildLiveSummarySentences,
  findVideosForSong,
  describeVideoRelease,
  findPerformancesForLive,
  findUnlinkedPerformances,
  describeVideoEditions,
  describeVideoStreaming,
  findVideoPosition,
  findVideosBySongQuery,
} from "../js/liveSetlistStats.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { normalizeForSearch } from "../js/songSearch.js";
import { assertEqual } from "./test-utils.js";

const songById = (id) => SONGS.find((song) => song.id === id);

function runCenterTests() {
  console.log("--- 歴代センター一覧 ---");

  // ---- A. 根拠の判定 ----
  const love = classifyCenter(songById("love"));
  assertEqual([love.state, love.centerNames, love.evidenceKind, love.isConfirmed], ["single", ["髙松瞳"], "press", true], "A: ＝LOVEは単独センター・報道で確認");
  const kioku = classifyCenter(songById("kioku-no-dokoka-de"));
  assertEqual([kioku.state, kioku.evidenceKind, kioku.isConfirmed, describeCenterState(kioku)], ["double", "official", true, "Wセンター"], "A: 記憶のどこかでは複数センター・公式（2026-10-28 公式リリースで確認）");
  ["start", "youkoso-ikorabu-numa", "bukatsuchu-ni-megaau-natte-omotteta-nda", "aikatsu-happy-end"].forEach((id) => {
    const center = classifyCenter(songById(id));
    assertEqual([center.state, center.evidenceKind, center.evidenceLabel, center.isConfirmed], ["single", "fan", "ファン資料のみ", false], `A: ${id} はデータを残したまま「ファン資料のみ」（公式扱いしない）`);
  });
  // 【2026-10-28再調査】恋、はじめました。は報道（特定のセンターを置かない構成）で確認。夢の続きは根拠なしのまま
  const koi = classifyCenter(songById("koi-hajimemashita"));
  assertEqual([koi.state, koi.evidenceLabel, koi.isConfirmed, describeCenterState(koi)], ["all", "報道", true, "全員センター"], "A: 恋、はじめました。は全員センター・報道");
  const yume = classifyCenter(songById("yume-no-tsuzuki"));
  assertEqual([yume.state, yume.evidenceLabel, yume.isConfirmed, describeCenterState(yume)], ["all", "アプリ内設定・公式未確認", false, "全員センター"], "A: 夢の続きは全員センター・アプリ内設定（公式未確認）");
  const doko = classifyCenter(songById("doko-ga-suki-ka-itte"));
  assertEqual([doko.state, doko.evidenceLabel, doko.isConfirmed], ["none", "根拠未確認", false], "A: どこが好きか言っては「センターなし」だが根拠未確認");
  assertEqual(describeCenterState(doko), "センター未確認", "A: 根拠が無い「センターなし」は「未確認」と出す（断定しない）");
  const solo = classifyCenter(songById("genneki-idol-chu"));
  assertEqual([solo.state, solo.evidenceKind], ["solo", null], "A: ソロ曲はセンターの区別なし（根拠ラベルも出さない）");
  assertEqual(classifyCenter(songById("ryuseigun")).state, "duo", "A: 2人の曲はセンターの区別なし");
  assertEqual(classifyCenter({ id: "x", center: ["髙松瞳"], centerType: "single" }, {}).evidenceKind, "unknown", "A: 根拠データが無いセンターは「根拠未確認」（推測で公式にしない）");

  // ---- B. データの整合性（誰がセンターかは変えていない／既存の利用箇所との互換） ----
  const withCenterType = SONGS.filter((song) => song.centerType);
  assertEqual(withCenterType.every((song) => ["single", "double", "none", "all"].includes(song.centerType)), true, "B: centerType は single/double/none/all のどれか");
  assertEqual(withCenterType.every((song) => CENTER_SOURCES[song.id]), true, "B: センター情報のある曲は全曲、根拠データを持つ");
  assertEqual(Object.keys(CENTER_SOURCES).every((id) => songById(id)?.centerType), true, "B: 根拠データは実在する・センター情報のある曲だけ");
  const memberNames = new Set(MEMBERS.map((member) => member.name));
  assertEqual(SONGS.flatMap((song) => song.center ?? []).every((name) => name === "全員" || memberNames.has(name)), true, "B: センターの名前は実在メンバーか「全員」");
  assertEqual(SONGS.filter((song) => song.centerType === "all").every((song) => JSON.stringify(song.center) === '["全員"]'), true, "B: 全員センターの center は従来どおり [\"全員\"]（既存の表示・検索と互換）");
  assertEqual(formatCenterLine(["全員"], "all"), "センター：全員", "B: 収録曲一覧の表示は「センター：全員」のまま");
  assertEqual([formatCenterLine(["髙松瞳"], "single"), formatCenterLine(["野口衣織", "諸橋沙夏"], "double"), formatCenterLine([], "none")], ["センター：髙松瞳", "Wセンター：野口衣織・諸橋沙夏", "センター：なし"], "B: 既存の3パターンの表示は変わらない");
  assertEqual(Object.values(CENTER_SOURCES).filter((source) => ["official", "press", "member"].includes(source.kind)).every((source) => /^https:\/\//.test(source.url ?? "")), true, "B: 公式・報道・メンバー発言には出典URLがある");

  // ---- C. 文字色の自動選択 ----
  assertEqual(Math.round(contrastRatio("#000000", "#ffffff")), 21, "C: 黒と白のコントラスト比は21");
  assertEqual(relativeLuminance("not-a-color"), null, "C: 色として読めない値は null");
  assertEqual(pickReadableTextColor("#ffffff").color, "#24151f", "C: 白い背景には黒っぽい文字");
  assertEqual(pickReadableTextColor("#1a1a40").color, "#ffffff", "C: 暗い背景には白い文字");
  assertEqual(pickReadableTextColor("#fff").color, "#24151f", "C: 3桁の色指定も読める");
  assertEqual(pickReadableTextColor(undefined), { color: "#24151f", ratio: null, needsOutline: false }, "C: 色が無いときは黒文字（落ちない）");
  const memberColorResults = MEMBERS.map((member) => pickReadableTextColor(member.memberColor.hex));
  assertEqual(memberColorResults.every((result) => result.ratio >= 4.5 || result.needsOutline), true, "C: 全メンバーカラーで、4.5未満なら必ず縁取り指定が付く");
  assertEqual(memberColorResults.every((result) => result.ratio >= 3), true, "C: 全メンバーカラーで、選んだ文字色のコントラスト比が3以上");

  // ---- D. 発売順・作品の種類・絞り込み ----
  const rows = buildCenterRows(SONGS);
  assertEqual(rows.length, SONGS.length - 1, "D: Overture（特別収録曲）以外の全曲が並ぶ");
  assertEqual(rows[0].song.id, "love", "D: 先頭は1stシングル表題曲");
  assertEqual(rows.every((row, index) => index === 0 || rows[index - 1].song.releaseDate <= row.song.releaseDate || rows[index - 1].song.workId === row.song.workId), true, "D: 発売日の古い順");
  const single01 = rows.filter((row) => row.song.workId === "single-01");
  assertEqual([single01[0].role.label, single01[1].role.label], ["表題曲", "カップリング"], "D: 作品内は表題曲が先頭、シングルの全員曲はカップリング");
  assertEqual([describeWork("single-21").label, describeWork("album-01").label, describeWork("digital-04").label], ["21stシングル", "1stアルバム", "配信限定"], "D: 作品の種類の表示名");
  const defaultRows = filterCenterRows(rows, { normalize: normalizeForSearch });
  assertEqual(defaultRows.some((row) => ["solo", "duo"].includes(row.center.state)), false, "D: 初期表示はソロ・2人の曲を出さない");
  assertEqual(filterCenterRows(rows, { includeNoCenterSongs: true }).length, rows.length, "D: 切り替えでソロ・2人の曲も出せる");
  const noguchi = filterCenterRows(rows, { memberName: "野口衣織" });
  assertEqual(noguchi.length > 0 && noguchi.every((row) => row.center.centerNames.includes("野口衣織")), true, "D: メンバーで絞り込める（Wセンターも含む）");
  assertEqual(filterCenterRows(rows, { query: "らぶろけ", normalize: normalizeForSearch }).map((row) => row.song.id), ["love-locke"], "D: 曲名（読み）で絞り込める");
  assertEqual(countEvidenceKinds(rows), { press: 19, fan: 4, official: 44, unknown: 2, user: 1 }, "D: 根拠の内訳（2026-10-28再調査後：公式44・報道19・ファン資料のみ4・アプリ内設定1・根拠未確認2）");
}

function runSetlistDataTests() {
  console.log("--- ライブのセットリスト（データ） ---");
  const songIds = new Set(SONGS.map((song) => song.id));
  const liveIds = new Set(LIVE_EVENTS.map((event) => event.id));
  const ids = SETLIST_PERFORMANCES.map((performance) => performance.id);
  assertEqual(new Set(ids).size, ids.length, "E: 公演IDに重複が無い");
  assertEqual(SETLIST_PERFORMANCES.every((performance) => performance.liveId === null || liveIds.has(performance.liveId)), true, "E: liveId は liveHistory.js に実在するか null");
  assertEqual(SETLIST_PERFORMANCES.every((performance) => performance.items.every((item) => !item.songId || songIds.has(item.songId))), true, "E: songId は songs.js に実在する");
  assertEqual(SETLIST_PERFORMANCES.every((performance) => ["official", "press"].includes(performance.verification)), true, "E: 曲順は公式か報道で確認できた公演だけ（ファンのまとめだけの公演は入れない）");
  assertEqual(SETLIST_PERFORMANCES.every((performance) => performance.sources.every((source) => source.kind !== "fan")), true, "E: 出典にファンサイトを載せない");
  assertEqual(SETLIST_PERFORMANCES.every((performance) => /^\d{4}-\d{2}-\d{2}$/.test(performance.date)), true, "E: 日付の形式");
  assertEqual(SETLIST_PERFORMANCES.every((performance) => performance.items.every((item) => Object.keys(item).every((key) => ["order", "title", "songId", "section", "form", "note", "referenceOnly"].includes(key)))), true, "E: 曲の行は曲名・曲順だけ（歌詞の項目は持たない）");
  assertEqual(UNVERIFIED_SETLIST_PERFORMANCES.length > 0 && UNVERIFIED_SETLIST_PERFORMANCES.every((performance) => performance.reason), true, "E: 未確定の公演は理由付きで別に記録");
  const sixth = findPerformancesForLive("live-6th-anniversary");
  assertEqual(sixth.map((performance) => performance.dayLabel), ["DAY1", "DAY2"], "E: 6周年は DAY1・DAY2 を別々に持つ");
  assertEqual(findUnlinkedPerformances().every((performance) => performance.liveId === null), true, "E: ライブ履歴のカードが無い公演を一覧できる");
  const videoPerformanceIds = LIVE_VIDEO_PRODUCTS.flatMap((video) => video.coverage.map((cover) => cover.performanceId));
  assertEqual(videoPerformanceIds.every((id) => ids.includes(id)), true, "E: 映像商品の収録公演は実在する公演");
  assertEqual(LIVE_VIDEO_PRODUCTS.every((video) => ["released", "upcoming"].includes(video.status)), true, "E: 映像商品は発売済み／発売予定のどちらか");
  assertEqual(LIVE_VIDEO_PRODUCTS.filter((video) => video.status === "upcoming").every((video) => video.coverage.every((cover) => cover.songIds === null)), true, "E: 発売予定で曲目未発表の映像に、推測で収録曲を入れない");

  // 【2026-10-28追加調査】公式ディスコグラフィー・PR TIMES・報道との照合後の件数と、個別の修正
  const allItems = SETLIST_PERFORMANCES.flatMap((performance) => performance.items);
  assertEqual(
    [SETLIST_PERFORMANCES.length, allItems.length, SETLIST_PERFORMANCES.filter((performance) => performance.completeness === "full").length, SETLIST_PERFORMANCES.filter((performance) => performance.verification === "official").length, SETLIST_PERFORMANCES.filter((performance) => performance.verification === "press").length],
    [33, 794, 33, 27, 6],
    "E: 公演33件・曲の行794件（全曲判明33・公式27・報道6）",
  );
  assertEqual([LIVE_VIDEO_PRODUCTS.length, UNVERIFIED_SETLIST_PERFORMANCES.length], [17, 32], "E: 映像商品17件・未確定の公演32件");
  assertEqual(SETLIST_PERFORMANCES.every((performance) => {
    const orders = performance.items.map((item) => item.order);
    const start = orders[0] === 0 ? 0 : 1;
    return orders.every((order, index) => order === start + index);
  }), true, "E: 曲順の番号が公演ごとに連番（Overture は 0）");
  assertEqual(LIVE_VIDEO_PRODUCTS.every((video) => video.coverage.every((cover) => {
    const performance = SETLIST_PERFORMANCES.find((p) => p.id === cover.performanceId);
    return (cover.songIds ?? []).every((id) => songIds.has(id) && performance.items.some((item) => item.songId === id));
  })), true, "E: 映像の収録曲は、その公演で披露した曲（songs.js に実在）");
  const yokohamaVideo = LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-8th-tour-yokohama-final").coverage[0];
  assertEqual([yokohamaVideo.songIds.includes("kono-sora-ga-trigger"), yokohamaVideo.note.includes("記載なし")], [false, true], "E: 横浜FINALの映像は公式の曲目に無い「この空がトリガー」を収録曲に入れない（注記で伝える）");
  assertEqual([findVideoPosition(yokohamaVideo, "natsumatsuri-koishitau"), findVideoPosition(yokohamaVideo, "nakanaori-shu-cream")], [21, 20], "E: 横浜FINALの映像は公式の番号どおり（20 仲直りシュークリーム→21 夏祭り恋慕う）");
  const natsu1 = SETLIST_PERFORMANCES.find((performance) => performance.id === "perf-yokohama-natsumatsuri-2023-part1");
  const natsu2 = SETLIST_PERFORMANCES.find((performance) => performance.id === "perf-yokohama-natsumatsuri-2023-part2");
  assertEqual([natsu1.completeness, natsu1.items.length, natsu1.items[8].songId, natsu2.completeness, natsu2.items[4].songId, natsu2.items[5].songId], ["full", 22, "love-locke", "full", "24-7", "oneesan-ja-dame-desuka"], "E: 夏祭り1部・2部は公式リリースの全曲（2部は5・6曲目のユニット曲が違う）");
  const videoById = (id) => LIVE_VIDEO_PRODUCTS.find((video) => video.id === id);
  assertEqual([videoById("video-3rd-anniversary").streaming.status, videoById("video-3rd-anniversary").releaseDate], ["none", "2021-02-08"], "E: 3周年の映像は公式に配信なし・発売日は公式ディスコグラフィーの2021-02-08");
  const firstStreaming = describeVideoStreaming(videoById("video-1st-concert-2019"));
  assertEqual([firstStreaming.status, firstStreaming.text.includes("カバー曲"), firstStreaming.url], ["available", true, "https://equal-love.jp/news/detail/7211"], "E: 1stコンサートは公式の映像配信あり（カバー曲は配信対象外と注記）");
  assertEqual(["video-timeless-tales-2025", "video-8th-tour-ig-arena"].every((id) => videoById(id).streaming.status !== "available" && videoById(id).streaming.note.includes("音声のみ")), true, "E: 音声だけの配信は「映像の配信あり」にしない");
  assertEqual([describeVideoEditions(videoById("video-winter-tour-2021")), videoById("video-zenbu-naisho-2021").productCodes.includes("VVBL-156～157")], [["Type A Blu-ray（2枚組） VVXL-72～73", "Type B Blu-ray VVXL-74", "Type C DVD（2枚組） VVBL-150～151"], true], "E: 武道館・全部、内緒。の品番を公式どおりに修正");
  const yokohamaDay1 = SETLIST_PERFORMANCES.find((performance) => performance.id === "perf-8th-anniversary-tour-yokohama-final-day1");
  assertEqual([yokohamaDay1?.date, yokohamaDay1?.verification, yokohamaDay1?.items.some((item) => item.section === "double-encore"), UNVERIFIED_SETLIST_PERFORMANCES.some((performance) => performance.date === "2026-04-18")], ["2026-04-18", "official", false, false], "E: 横浜スタジアム DAY1（4/18）は公式で確認（Wアンコールは4/19のみ）・未確定リストから外した");
  const ariake = SETLIST_PERFORMANCES.find((performance) => performance.id === "perf-arena-tour-2025-ariake-day2");
  assertEqual([ariake.items.filter((item) => item.referenceOnly).map((item) => item.order), UNVERIFIED_SETLIST_PERFORMANCES.some((performance) => performance.date === "2025-07-13")], [[12], false], "E: 有明追加公演 DAY2 は資料が食い違う12曲目だけ参考扱い");
  assertEqual(SETLIST_PERFORMANCES.filter((performance) => performance.kind === "festival").every((performance) => performance.liveId === null && performance.verification === "press"), true, "E: フェス出演は報道で確認・ライブ履歴のカードなし");

  // liveHistory.js の修正（公式ニュースで確認：Blu-ray+CD＝VVXL-140、DVD＝VVBL-184）
  const nagisa = LIVE_EVENTS.find((event) => event.id === "live-nagisa-graduation");
  assertEqual(nagisa.productLinks.find((link) => link.label.startsWith("Blu-ray+CD")).url.endsWith("VVXL-140"), true, "E: 齊藤なぎさ卒業の Blu-ray+CD ボタンは VVXL-140");
  assertEqual(LIVE_EVENTS.length >= 21, true, "E: ライブ履歴の公演を削除していない");
}

function runLiveStatsTests() {
  console.log("--- ライブでの披露（計算と言い方） ---");
  assertEqual(daysBetween("2023-10-19", "2026-10-16"), 1093, "F: 日数の差");
  assertEqual(daysBetween("bad", "2026-10-16"), null, "F: 読めない日付は null");
  assertEqual([describeYearsSpan(364), describeYearsSpan(365), describeYearsSpan(548), describeYearsSpan(1093), describeYearsSpan(null)], [null, "約1年", "約1年半", "約3年", null], "F: 年の言い方（1年未満は言わない）");

  // ラブロケ（本人資料の確認例）
  const locke = summarizeSongLive("love-locke", { today: "2026-10-27" });
  assertEqual(locke.confirmed.map((entry) => entry.performance.date), ["2023-08-05", "2023-08-05", "2023-10-18", "2023-10-19", "2026-10-16"], "F: ラブロケは夏祭り2部・6周年2日・9周年DAY2");
  assertEqual([locke.count, locke.previous.performance.date, locke.gapDays, locke.gapText], [5, "2023-10-19", 1093, "約3年"], "F: ラブロケの前回は6周年DAY2・約3年ぶり");
  const lockeText = buildLiveSummarySentences(locke).join("");
  assertEqual(lockeText.includes("確認できた範囲では") && lockeText.includes("約3年ぶり") && lockeText.includes(`調査済みの${SETLIST_PERFORMANCES.length}公演`), true, "F: 「確認できた範囲」「調査済み○公演」の言い方");
  assertEqual(/初披露|ぶりに披露された|久しぶりの披露となった/.test(lockeText), false, "F: 「初披露」などの断定をしない");
  const lockeVideos = findVideosForSong("love-locke");
  assertEqual([lockeVideos.included.map((entry) => entry.video.id), lockeVideos.undisclosed.length], [["video-6th-anniversary"], 0], "F: ラブロケの映像は6周年のみ（披露と収録を分ける）");
  assertEqual(lockeVideos.included[0].coverage[0].note.includes("推定"), true, "F: 映像の公演日が公式に無いことを伝える");

  // 一部だけのデータ・ファン資料のみの行
  const fake = [
    { id: "p1", date: "2020-01-01", title: "A", dayLabel: null, items: [{ order: 1, songId: "s", section: "main", form: "normal" }] },
    { id: "p2", date: "2024-06-01", title: "B", dayLabel: "DAY1", items: [{ order: 3, songId: "s", section: "main", form: "normal" }] },
    { id: "p3", date: "2024-06-02", title: "B", dayLabel: "DAY2", items: [{ order: 3, songId: "s", section: "main", form: "normal" }] },
    { id: "p4", date: "2026-01-01", title: "C", dayLabel: null, items: [{ order: 30, songId: "s", section: "double-encore", form: "normal", referenceOnly: true }] },
  ];
  const partial = summarizeSongLive("s", { performances: fake, today: "2026-10-27" });
  assertEqual([partial.count, partial.last.performance.id, partial.previous.performance.id], [3, "p3", "p2"], "F: ファン資料のみの行は最新の披露に数えない");
  assertEqual([partial.gapDays, partial.gapText, partial.sinceLastText], [1, null, "約2年半"], "F: 前日（DAY1）からの披露は「〜ぶり」と言わない／最新の披露からの経過");
  const gap = summarizeSongLive("s", { performances: fake.slice(0, 2) });
  assertEqual([gap.previous.performance.id, gap.gapText], ["p1", "約4年半"], "F: 前回の披露から1年以上あいたときだけ「約○年ぶり」");
  const none = summarizeSongLive("zzz", { performances: fake });
  assertEqual([none.count, none.first, none.gapText], [0, null, null], "F: 披露が無い曲でも落ちない");
  assertEqual(buildLiveSummarySentences(none)[0].includes("調査済みの4公演では、披露を確認できませんでした"), true, "F: 0件のときも「調査済みの範囲」で言う");
  const once = summarizeSongLive("s", { performances: fake.slice(0, 1) });
  assertEqual([once.previous, once.gapText, buildLiveSummarySentences(once).some((text) => text.includes("ぶり"))], [null, null, false], "F: 1回だけなら「〜ぶり」を出さない");

  // 映像商品
  const stadiumSong = SETLIST_PERFORMANCES.find((performance) => performance.id === "perf-stadium-beyond-kyun-day1").items.find((item) => item.songId && item.songId !== "overture").songId;
  assertEqual(findVideosForSong(stadiumSong).undisclosed.some((entry) => entry.video.id === "video-stadium-beyond-kyun"), true, "F: 曲目未発表の映像は「収録曲未発表」として分ける");
  const upcoming = LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-stadium-beyond-kyun");
  assertEqual([describeVideoRelease(upcoming, "2026-10-27"), describeVideoRelease({ status: "released", releaseDate: "2021-03" })], ["2026年12月23日発売予定", "2021年3月発売"], "F: 発売予定・年月だけの発売日の言い方");
}

function runSearchTests() {
  console.log("--- 全体検索（センター一覧・セットリスト） ---");
  const entries = buildAppSearchEntries();
  assertEqual(entries.some((entry) => entry.key === "feature:feature-centers"), true, "G: 歴代センター一覧が機能として検索できる");
  assertEqual(searchAppEntries(entries, "歴代センター", "all").results[0]?.entry.key, "feature:feature-centers", "G: 「歴代センター」で一番上に出る");
  const sixth = entries.find((entry) => entry.key === "live:live-6th-anniversary");
  assertEqual(sixth.lines.some((line) => line.startsWith("セットリスト：2公演分")), true, "G: セットリストのある公演は件数を表示");
  const lockeLives = searchAppEntries(entries, "ラブロケ", "live").results.map((result) => result.entry.key);
  assertEqual(["live:live-6th-anniversary", "live:live-9th-anniversary-premium-concert"].every((key) => lockeLives.includes(key)), true, "G: 曲名で、その曲を披露した公演が見つかる");
}

// 【2026-10-28追加】曲からライブ映像を探す・映像商品の形態／配信の言い方・映像商品の検索
function runVideoFinderTests() {
  console.log("--- 曲からライブ映像を探す（2026-10-28） ---");
  // 形態：editions があればそれを、無ければ従来の productCodes の文
  assertEqual(describeVideoEditions({ productCodes: "Blu-ray X-1" }), ["Blu-ray X-1"], "H: editions が無い古いデータは productCodes をそのまま");
  assertEqual(describeVideoEditions({ editions: [{ label: "TYPE-A", format: "Blu-ray", productCode: "A-1" }, { label: "TYPE-C", format: "DVD", productCode: "C-1" }] }), ["TYPE-A Blu-ray A-1", "TYPE-C DVD C-1"], "H: 形態ごとに「種類 形式 品番」");
  // 配信：映像商品にあることと配信で見られることは別。データが無ければ「未確認」（あるとは言わない）
  assertEqual(describeVideoStreaming({}).status, "unknown", "H: 配信の記録が無ければ未確認");
  assertEqual(describeVideoStreaming({ streaming: { status: "available", note: "カバー曲は配信対象外", sourceUrl: "u" } }), { status: "available", text: "公式配信あり（カバー曲は配信対象外）", url: "u" }, "H: 公式配信ありは注意書きと出典つき");
  // 収録順：公式の収録順に並べたもの（ordered）だけ「何曲目」を出す
  assertEqual([findVideoPosition({ ordered: true, songIds: ["a", "b"] }, "b"), findVideoPosition({ songIds: ["a", "b"] }, "b"), findVideoPosition({ ordered: true, songIds: null }, "a")], [2, null, null], "H: 収録順が確かなときだけ「何曲目」");
  // 曲名から探す：アイカツハッピーエンドは公式の収録内容で確認できる映像がある
  const aikatsu = findVideosBySongQuery("アイカツ", SONGS).find((entry) => entry.song.id === "aikatsu-happy-end");
  assertEqual(Boolean(aikatsu) && aikatsu.included.length > 0, true, "H: 曲名の一部から、その曲が入っている映像商品が見つかる");
  assertEqual(findVideosBySongQuery("", SONGS), [], "H: 空の入力では何も出さない");
  assertEqual(findVideosBySongQuery("Overture", SONGS).length, 0, "H: Overture（SE）は対象外");
  // 全体検索：映像商品も「ライブ」に出て、曲名で見つかる。リンクは公式の紹介（購入とは書かない）
  const entries = buildAppSearchEntries();
  const videoEntries = entries.filter((entry) => entry.key.startsWith("video:"));
  assertEqual(videoEntries.length, LIVE_VIDEO_PRODUCTS.length, "H: 映像商品がすべて検索の対象");
  assertEqual(videoEntries.every((entry) => entry.category === "live"), true, "H: 映像商品は「ライブ」に分類");
  assertEqual(videoEntries.every((entry) => entry.links.every((link) => !link.label.includes("購入"))), true, "H: 映像のリンクに「購入」と書かない");
  const hits = searchAppEntries(entries, "アイカツハッピーエンド", "live").results.map((result) => result.entry.key);
  assertEqual(hits.some((key) => key.startsWith("video:")), true, "H: 曲名で、その曲が入っている映像商品が見つかる");
  const songEntry = entries.find((entry) => entry.key === "song:aikatsu-happy-end");
  assertEqual(songEntry.lines.some((line) => line.startsWith("ライブ映像：")), true, "H: 曲の検索結果に、収録を確認できた映像の数を出す");
}

export function runCentersAndSetlistsTests() {
  runCenterTests();
  runSetlistDataTests();
  runLiveStatsTests();
  runSearchTests();
  runVideoFinderTests();
}
