// 【2026-10-29新設】「＝LOVEの歩み・周年ヒストリー」と「音楽番組出演・披露曲アーカイブ」の回帰テスト
// （データの整合性・周年の区切り・検索と絞り込み・画面の組み立て・全体検索への登録）。
import { SONGS } from "../js/data/songs.js";
import { LIVE_EVENTS } from "../js/data/liveHistory.js";
import { ANNIVERSARY_PERIODS, ANNIVERSARY_EVENTS } from "../js/data/anniversaryHistory.js";
import { TV_APPEARANCES, TV_APPEARANCE_RECORDS } from "../js/data/tvAppearances.js";
import {
  buildAnniversaryModel,
  comparePeriodGroupings,
  defaultAnniversaryPeriod,
  formatConcertDates,
  formatHistoryDate,
  formatPeriodRange,
  isAnniversaryConcert,
  relatedTargets,
  splitPeriodEvents,
} from "../js/anniversaryHistoryModel.js";
import {
  filterTvAppearances,
  groupTvAppearancesByYear,
  seriesOf,
  appearancesForSong,
  availableSeries,
  describeAppearanceKind,
  publishedAppearances,
} from "../js/tvAppearanceModel.js";
import { initAnniversaryScreen, openAnniversaryScreen } from "../js/anniversaryScreen.js";
import { initTvAppearancesScreen, openTvAppearancesScreen } from "../js/tvAppearancesScreen.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { assertEqual } from "./test-utils.js";

const songIds = new Set(SONGS.map((song) => song.id));
const liveIds = new Set(LIVE_EVENTS.map((live) => live.id));

function runDataTests() {
  // 周年ヒストリー
  assertEqual(ANNIVERSARY_EVENTS.length > 0, true, "周年：出来事がある");
  assertEqual(ANNIVERSARY_EVENTS.every((e) => /^\d{4}-\d{2}(-\d{2})?$/.test(e.date)), true, "周年：日付の形（YYYY-MM-DD か YYYY-MM）");
  assertEqual(ANNIVERSARY_EVENTS.every((e) => e.confidence === "確認済み" || e.confidence === "準確認"), true, "周年：要確認の出来事は載せない");
  assertEqual(ANNIVERSARY_EVENTS.every((e) => (e.sources ?? []).length > 0 && e.sources.every((s) => /^https?:\/\//.test(s.url))), true, "周年：全部の出来事に出典URLがある");
  assertEqual(new Set(ANNIVERSARY_EVENTS.map((e) => e.id)).size, ANNIVERSARY_EVENTS.length, "周年：IDが重ならない");
  const periodOf = (title) => ANNIVERSARY_EVENTS.find((e) => e.title.includes(title))?.period;
  assertEqual(periodOf("ミュージックステーション"), 4, "周年の区切り：Mステ初出演（2021-09-17）は4周年（4周年記念公演 2021-09-20 まで）");
  assertEqual(periodOf("国立競技場"), 9, "周年の区切り：国立競技場（2026-06）は9周年");
  assertEqual(ANNIVERSARY_EVENTS.filter((e) => e.liveId).length, 0, "周年：ライブの結び付けは related.liveHistoryId に入れる");
  const badLive = ANNIVERSARY_EVENTS.filter((e) => e.related?.liveHistoryId && !liveIds.has(e.related.liveHistoryId)).map((e) => e.id);
  assertEqual(badLive, [], "周年：結び付けたライブ履歴のIDはすべて存在する");
  const badSong = ANNIVERSARY_EVENTS.filter((e) => e.related?.songId && !songIds.has(e.related.songId)).map((e) => e.id);
  assertEqual(badSong, [], "周年：結び付けた曲のIDはすべて存在する");
  const tvDates = new Set(TV_APPEARANCES.map((t) => t.date));
  const badTv = ANNIVERSARY_EVENTS.filter((e) => e.related?.tvAppearanceDate && !tvDates.has(e.related.tvAppearanceDate)).map((e) => e.id);
  assertEqual(badTv, [], "周年：音楽番組へのリンク先の放送がアーカイブにある");

  // 【2026-10-30】周年の区切りを3つに分けて持つ（記念公演で区切る周年・デビュー日で区切る周年・記念公演そのもの）
  assertEqual(ANNIVERSARY_EVENTS.every((e) => e.periodByConcert === e.period), true, "周年の区切り：period は記念公演で区切った周年（periodByConcert）と同じ");
  // デビュー日（9/6）で区切った周年を、テストの中で別に計算して照らし合わせる（N周年＝(2016+N)/9/7〜(2017+N)/9/6）
  const debutPeriodOf = (date) => {
    const d = date.length === 10 ? date : `${date}-15`;
    if (d <= "2017-09-06") return 0;
    const year = Number(d.slice(0, 4));
    return Math.min(10, d.slice(5) <= "09-06" ? year - 2017 : year - 2016);
  };
  const badDebut = ANNIVERSARY_EVENTS.filter((e) => e.periodByDebut !== debutPeriodOf(e.date)).map((e) => e.id);
  assertEqual(badDebut, [], "周年の区切り：periodByDebut はデビュー日（9/6）で区切った周年");
  const concertEvents = ANNIVERSARY_EVENTS.filter((e) => e.concertOfPeriod !== null);
  assertEqual(concertEvents.map((e) => e.concertOfPeriod).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9], "周年の区切り：1〜9周年の記念公演が1件ずつある（concertOfPeriod）");
  assertEqual(concertEvents.every((e) => e.period === e.concertOfPeriod), true, "周年の区切り：記念公演は自分の周年に入る（記念公演で区切る場合）");
  const badConcertPeriods = ANNIVERSARY_PERIODS.filter((p) => p.period >= 1 && p.period <= 9).filter((p) => {
    const event = ANNIVERSARY_EVENTS.find((e) => e.id === p.concert?.eventId);
    return !event || event.concertOfPeriod !== p.period || p.to !== p.concert.dates.at(-1) || !p.concert.venue || p.concert.dates[0] !== event.date;
  }).map((p) => p.period);
  assertEqual(badConcertPeriods, [], "周年の区切り：各周年の concert（日付・会場）が記念公演の出来事と合っている");
  assertEqual(ANNIVERSARY_PERIODS.find((p) => p.period === 6)?.concert?.dates, ["2023-10-18", "2023-10-19"], "周年の区切り：6周年記念公演は 2023-10-18・19（さいたまスーパーアリーナ）");
  assertEqual(ANNIVERSARY_PERIODS.filter((p) => p.period >= 1 && p.period <= 9).every((p) => p.debutTo === `${2017 + p.period}-09-06` && p.debutFrom === `${2016 + p.period}-09-07`), true, "周年の区切り：デビュー日で区切った期間（debutFrom〜debutTo）");
  const moved = comparePeriodGroupings(ANNIVERSARY_EVENTS).map((row) => row.event.id);
  assertEqual(moved.includes("anv-2021-first-mstation"), true, "周年の比較：Mステ初出演（2021-09-17）は区切り方で周年が変わる（4周年／5周年）");
  assertEqual(moved.includes("anv-2026-national-stadium"), false, "周年の比較：国立競技場（2026-06）はどちらの区切りでも同じ周年");
  assertEqual(moved.length, 9, "周年の比較：区切り方で周年が変わる出来事は9件（renewal-notes/stage6.md の比較表と同じ）");
  // 「初」と書いた出来事には、確かめた根拠（誤りではないもの）がある
  const firstWithoutEvidence = ANNIVERSARY_EVENTS.filter((e) => /初(?!期|週|め)/.test(e.title))
    .filter((e) => !(e.firstEvidence ?? []).some((f) => f.verdict === "確認済み" || f.verdict === "準確認"))
    .map((e) => e.id);
  assertEqual(firstWithoutEvidence, [], "周年：題名に「初」がある出来事には、確かめた根拠（firstEvidence）がある");
  assertEqual(ANNIVERSARY_EVENTS.some((e) => (e.firstEvidence ?? []).some((f) => f.verdict === "誤り")), false, "周年：「初」の根拠に「誤り」が残っていない");
  assertEqual(ANNIVERSARY_EVENTS.find((e) => e.id === "anv-2019-shanghai")?.date, "2019-04-05", "周年：上海の出演は公式告知の 2019-04-05（2019-05-04 は誤り）");

  // 音楽番組
  assertEqual(TV_APPEARANCES.length > 100, true, "音楽番組：2017〜2026年の出演がある");
  const keys = TV_APPEARANCE_RECORDS.map((t) => `${t.date}|${t.program}`);
  assertEqual(new Set(keys).size, keys.length, "音楽番組：同じ日・同じ番組が重ならない（要確認の記録も含めて）");
  // 【2026-10-30】公開の方針：出演が 確認済み・準確認 → 公開、要確認 → publish:false（データには残す）
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => t.publish === (t.confidence !== "要確認")), true, "音楽番組：要確認の回だけ publish:false");
  assertEqual(TV_APPEARANCES.every((t) => t.publish === true), true, "音楽番組：TV_APPEARANCES は公開する記録だけ（要確認は既定で隠れる）");
  assertEqual(TV_APPEARANCES.length, publishedAppearances(TV_APPEARANCE_RECORDS).length, "音楽番組：公開する記録の数が合う");
  assertEqual(TV_APPEARANCE_RECORDS.length > TV_APPEARANCES.length, true, "音楽番組：要確認の記録もデータには残っている");
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => ["original", "rebroadcast", "digest"].includes(t.broadcastType)), true, "音楽番組：放送の種類（初回・再放送・再編集）が付いている");
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => t.songs.every((s) => s.confidence === "確認済み" || s.confidence === "準確認")), true, "音楽番組：表に出す曲は確認できた曲だけ");
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => (t.unverifiedSongs ?? []).every((s) => s.confidence === "要確認")), true, "音楽番組：ファンの記録だけの曲は unverifiedSongs に分ける");
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => t.collabs.every((c) => ["cover", "collab", "medley", "joint"].includes(c.kind))), true, "音楽番組：カバー・コラボの種類が付いている");
  const coverInSongs = TV_APPEARANCE_RECORDS.filter((t) => t.songs.some((s) => !s.songId && t.collabs.some((c) => c.title === s.title))).map((t) => t.date);
  assertEqual(coverInSongs, [], "音楽番組：カバー・コラボの曲を持ち歌（songs）に重ねて入れない");
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => (t.songsConfidence === "未確認") === (t.songs.length === 0 && t.collabs.length === 0)), true, "音楽番組：曲が1つも確認できない回は songsConfidence が「未確認」");
  assertEqual(TV_APPEARANCE_RECORDS.filter((t) => t.milestone).every((t) => t.publish && ["確認済み", "準確認"].includes(t.milestoneConfidence) && t.milestoneSources.length > 0), true, "音楽番組：★初出演の印は根拠のある公開の回だけ");
  assertEqual(TV_APPEARANCE_RECORDS.find((t) => t.date === "2026-08-23")?.milestone, "SBS「人気歌謡」通常回に初出演", "音楽番組：人気歌謡は「通常回に初出演」（2025-04 の東京ドーム特番があるため）");
  assertEqual(TV_APPEARANCES.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.program), true, "音楽番組：日付と番組名がある");
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => ["確認済み", "準確認", "要確認"].includes(t.confidence)), true, "音楽番組：確度は3種類のどれか");
  const badTvSongs = TV_APPEARANCE_RECORDS.flatMap((t) => [...t.songs, ...t.unverifiedSongs]).filter((s) => s.songId && !songIds.has(s.songId)).map((s) => s.songId);
  assertEqual(badTvSongs, [], "音楽番組：曲IDはすべてアプリの曲にある（無い曲は null）");
  assertEqual(TV_APPEARANCE_RECORDS.every((t) => (t.sources ?? []).length > 0), true, "音楽番組：全部の放送に出典がある");
  assertEqual(TV_APPEARANCES.every((t) => t.sources.some((s) => s.type !== "fan")), true, "音楽番組：公開する回には、ファン以外（公式・番組・放送局・報道）の出典がある");
  // 曲の検索：その曲を披露した公開の回が、曲名でも読みでも全部見つかる
  const missingBySong = SONGS.filter((song) => appearancesForSong(TV_APPEARANCES, song.id).length > 0).filter((song) => {
    const expected = appearancesForSong(TV_APPEARANCES, song.id);
    const byTitle = filterTvAppearances(TV_APPEARANCES, { query: song.title });
    const byReading = song.searchReading ? filterTvAppearances(TV_APPEARANCES, { query: song.searchReading }) : expected;
    return !expected.every((entry) => byTitle.includes(entry) && byReading.includes(entry));
  }).map((song) => song.id);
  assertEqual(missingBySong, [], "音楽番組：曲名（読みも）で探すと、その曲を披露した番組が全部出る");
  const firstMstation = TV_APPEARANCES.filter((t) => seriesOf(t) === "mstation").sort((a, b) => (a.date < b.date ? -1 : 1))[0];
  assertEqual([firstMstation?.date, firstMstation?.songs.map((s) => s.songId)], ["2021-09-17", ["weekend-citron"]], "音楽番組：Mステ初出演は 2021-09-17 のウィークエンドシトロン");
}

function runModelTests() {
  assertEqual([formatHistoryDate("2021-09-17"), formatHistoryDate("2021-09"), formatHistoryDate("x")], ["2021年9月17日", "2021年9月", ""], "日付の表示");
  assertEqual(formatPeriodRange({ from: "2020-09-06", to: "2021-09-20" }), "2020年9月〜2021年9月", "周年の期間の表示");
  const periods = [{ period: 1, label: "1周年" }, { period: 2, label: "2周年" }, { period: 10, label: "これから" }];
  const events = [
    { id: "b", date: "2019-01-01", period: 2, highlight: false },
    { id: "a", date: "2018-12-01", period: 1, highlight: true },
    { id: "c", date: "2018-10-01", period: 1, highlight: false },
    { id: "d", date: "2027-01-01", period: 10, highlight: true },
  ];
  const model = buildAnniversaryModel(periods, events);
  assertEqual(model.map((m) => [m.period, m.events.map((e) => e.id), m.headlines.map((e) => e.id)]), [[1, ["c", "a"], ["a"]], [2, ["b"], ["b"]], [10, ["d"], ["d"]]], "周年：日付順・見出しは highlight（無ければ最初の出来事）");
  assertEqual(defaultAnniversaryPeriod(model), 2, "周年：最初に開くのは「これから」以外でいちばん新しい周年");
  // 【2026-10-30】区切り方を選べる（既定は記念公演で区切る）
  const groupedEvents = [
    { id: "m", date: "2021-09-17", period: 4, periodByConcert: 4, periodByDebut: 5, concertOfPeriod: null, category: "tv", title: "Mステ" },
    { id: "k", date: "2021-09-20", period: 4, periodByConcert: 4, periodByDebut: 5, concertOfPeriod: 4, category: "concert", title: "4周年記念コンサート" },
  ];
  const groupedPeriods = [{ period: 4, label: "4周年" }, { period: 5, label: "5周年" }];
  assertEqual(buildAnniversaryModel(groupedPeriods, groupedEvents).map((m) => m.period), [4], "周年：既定は記念公演で区切る（Mステも4周年記念公演も4周年）");
  const byDebut = buildAnniversaryModel(groupedPeriods, groupedEvents, { grouping: "debut" });
  assertEqual(byDebut.map((m) => m.period), [5], "周年：デビュー日で区切ると、どちらも5周年");
  assertEqual(splitPeriodEvents(byDebut[0]).concerts.length, 0, "周年：デビュー日で区切っても、4周年の記念公演を「5周年の記念公演」の枠には入れない");
  assertEqual([isAnniversaryConcert(groupedEvents[1]), isAnniversaryConcert(groupedEvents[0]), isAnniversaryConcert({ category: "concert", title: "3周年記念" })], [true, false, true], "周年：記念公演かどうか（concertOfPeriod、無いデータは題名）");
  assertEqual([formatConcertDates(["2023-10-18", "2023-10-19"]), formatConcertDates(["2021-09-20"]), formatConcertDates(["2026-12-31", "2027-01-01"])], ["2023年10月18日・19日", "2021年9月20日", "2026年12月31日・2027年1月1日"], "周年：記念公演の日付の表示");
  assertEqual(relatedTargets({ related: { liveHistoryId: "nope", songId: "love" } }, { songIds: new Set(["love"]) }).map((t) => t.kind), ["song"], "周年：存在しないページへのリンクは作らない");

  const sample = [
    { date: "2021-09-17", program: "ミュージックステーション", station: "テレビ朝日", songs: [{ title: "ウィークエンドシトロン", songId: "weekend-citron" }], collabs: [], notes: "初出演" },
    { date: "2025-12-03", program: "FNS歌謡祭 第1夜", station: "フジテレビ", songs: [], collabs: [{ title: "絶対アイドル辞めないで", with: "中島健人" }], notes: null },
    { date: "2019-11-08", program: "バズリズム02", station: "日本テレビ", songs: [{ title: "ズルいよ ズルいね", songId: "zurui" }], collabs: [], notes: null },
  ];
  assertEqual(filterTvAppearances(sample, { query: "うぃーくえんど" }).map((t) => t.date), ["2021-09-17"], "音楽番組の検索：曲名（ひらがな・カタカナの違いを無視）");
  assertEqual(filterTvAppearances(sample, { query: "中島健人" }).map((t) => t.date), ["2025-12-03"], "音楽番組の検索：コラボの相手");
  assertEqual(filterTvAppearances(sample, { query: "2019" }).map((t) => t.date), ["2019-11-08"], "音楽番組の検索：年");
  assertEqual(filterTvAppearances(sample, { series: "fns" }).map((t) => t.date), ["2025-12-03"], "音楽番組の絞り込み：番組のシリーズ");
  assertEqual(filterTvAppearances(sample, { series: "mstation", query: "バズリズム" }).length, 0, "音楽番組：絞り込みと検索は両方満たすものだけ");
  assertEqual(groupTvAppearancesByYear(sample).map((g) => g.year), ["2025", "2021", "2019"], "音楽番組：新しい年から");
  assertEqual(appearancesForSong(sample, "weekend-citron").length, 1, "音楽番組：曲から披露した番組を引ける");
  assertEqual(availableSeries(sample).map((s) => s.id), ["mstation", "buzzrhythm", "fns"], "音楽番組：絞り込みのボタンはデータにあるシリーズだけ");
  assertEqual([describeAppearanceKind(sample[0]).label, describeAppearanceKind(sample[1]).label, describeAppearanceKind({ program: "X（再放送）", songs: [], collabs: [] }).label, describeAppearanceKind({ program: "Y", songs: [], collabs: [] }).label], ["歌唱", "コラボ歌唱", "再放送", "出演（披露曲は未確認）"], "音楽番組：記録の種類（歌唱・コラボ・再放送・曲が未確認）");
  assertEqual([describeAppearanceKind({ program: "Z", broadcastType: "digest", songs: [], collabs: [] }).label, describeAppearanceKind({ program: "W", broadcastType: "rebroadcast", songs: [], collabs: [] }).label], ["再編集・ダイジェスト", "再放送"], "音楽番組：再放送と再編集（ダイジェスト・総集編）を分ける");
  // 要確認の曲：普段は検索の対象にしない（出していない曲で見つかると紛らわしい）
  const unverifiedSample = [{ date: "2017-12-19", program: "ライブB♪", station: "TBS", songs: [], unverifiedSongs: [{ title: "僕らの制服クリスマス", songId: null, confidence: "要確認" }], collabs: [], notes: null }];
  assertEqual([filterTvAppearances(unverifiedSample, { query: "制服クリスマス" }).length, filterTvAppearances(unverifiedSample, { query: "制服クリスマス", includeUnverified: true }).length], [0, 1], "音楽番組の検索：要確認の曲は「要確認の記録も表示」のときだけ探せる");
  assertEqual(publishedAppearances([{ publish: false }, { publish: true }, {}]).length, 2, "音楽番組：publish:false だけを隠す");
}

function runScreenTests() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const opened = [];
  initAnniversaryScreen({ container: host }, { onOpenTarget: (target) => opened.push(target) });
  openAnniversaryScreen();
  assertEqual(host.querySelectorAll(".anniv-card").length, buildAnniversaryModel(ANNIVERSARY_PERIODS, ANNIVERSARY_EVENTS).length, "周年の画面：周年のカードが全部出る");
  assertEqual(host.querySelector(".anniv-card.is-active")?.dataset.period, "9", "周年の画面：最初は9周年");
  host.querySelector('.anniv-card[data-period="4"]').click();
  assertEqual(host.querySelector(".anniv-detail-title")?.textContent, "4周年", "周年の画面：カードを押すとその周年の出来事");
  assertEqual(host.querySelector(".anniv-concert-box")?.textContent.includes("4周年記念コンサート"), true, "周年の画面：周年記念公演は「記念公演」の枠に分けて出る");
  const more = host.querySelector(".anniv-more-button");
  if (more) {
    const rest = host.querySelector(".anniv-rest-list");
    assertEqual(rest.hidden, true, "周年の画面：そのほかの出来事は最初は閉じている");
    more.click();
    assertEqual(rest.hidden, false, "周年の画面：「もっと見る」で開く");
  }
  host.querySelector('.anniv-view-tabs [data-view="timeline"]').click();
  assertEqual(host.querySelectorAll(".anniv-timeline .anniv-event").length, ANNIVERSARY_EVENTS.length, "周年の画面：年表で見ると全部の出来事が時系列で出る");
  host.querySelector('.anniv-view-tabs [data-view="period"]').click();
  const tvLink = [...host.querySelectorAll(".anniv-event-link")].find((b) => b.textContent.includes("音楽番組"));
  tvLink?.click();
  assertEqual(opened[0]?.kind, "tv", "周年の画面：Mステ初出演から音楽番組アーカイブへ飛べる");
  host.remove();

  const tvHost = document.createElement("div");
  document.body.appendChild(tvHost);
  const songs = [];
  initTvAppearancesScreen({ container: tvHost }, { onOpenSong: (id) => songs.push(id) });
  openTvAppearancesScreen();
  assertEqual(tvHost.querySelectorAll(".tv-item").length, Math.min(20, TV_APPEARANCES.length), "音楽番組の画面：最初は新しい20件");
  assertEqual(tvHost.querySelector(".tv-item")?.dataset.date, [...TV_APPEARANCES].sort((a, b) => (a.date < b.date ? 1 : -1))[0].date, "音楽番組の画面：いちばん上は最新の出演");
  tvHost.querySelector(".tv-more-button").click();
  assertEqual(tvHost.querySelectorAll(".tv-item").length, Math.min(40, TV_APPEARANCES.length), "音楽番組の画面：「もっと見る」で20件ずつ増える");
  const yearSelect = tvHost.querySelector(".tv-year-select");
  yearSelect.value = "2021";
  yearSelect.dispatchEvent(new Event("change"));
  assertEqual([...tvHost.querySelectorAll(".tv-item")].every((item) => item.dataset.date.startsWith("2021")), true, "音楽番組の画面：年で絞り込める");
  assertEqual(tvHost.querySelectorAll(".tv-item.is-milestone").length >= 1, true, "音楽番組の画面：Mステ初出演などの節目に特別な印");
  yearSelect.value = "all";
  yearSelect.dispatchEvent(new Event("change"));
  openTvAppearancesScreen({ query: "ウィークエンドシトロン" });
  const items = [...tvHost.querySelectorAll(".tv-item")];
  assertEqual(items.length > 0 && items.every((item) => item.textContent.includes("ウィークエンドシトロン")), true, "音楽番組の画面：曲名で検索できる");
  items.find((item) => item.dataset.date === "2021-09-17")?.querySelector("button.tv-song")?.click();
  assertEqual(songs[0], "weekend-citron", "音楽番組の画面：曲名を押すと収録曲へ");
  openTvAppearancesScreen({ query: "", focusDate: "2021-09-17" });
  assertEqual(tvHost.querySelector(".tv-item.is-focused")?.dataset.date, "2021-09-17", "音楽番組の画面：指定した日の放送を目立たせる");
  // 【2026-10-30】要確認の記録は最初は隠れていて、「要確認の記録も表示」で出る
  openTvAppearancesScreen({ query: "" });
  const toggle = tvHost.querySelector(".tv-unverified-toggle input");
  assertEqual(toggle?.checked, false, "音楽番組の画面：「要確認の記録も表示」は最初はオフ");
  assertEqual(tvHost.querySelector(".tv-count")?.textContent.includes(`全${TV_APPEARANCES.length}件`), true, "音楽番組の画面：最初は公開する記録だけを数える");
  const hiddenDates = TV_APPEARANCE_RECORDS.filter((t) => !t.publish).map((t) => t.date);
  for (let i = 0; i < 10 && !tvHost.querySelector(".tv-more-button").hidden; i += 1) tvHost.querySelector(".tv-more-button").click();
  assertEqual(tvHost.querySelectorAll(".tv-item").length, TV_APPEARANCES.length, "音楽番組の画面：オフのときは公開する記録だけが全部出る");
  assertEqual(tvHost.querySelectorAll(".tv-item.is-unverified").length, 0, "音楽番組の画面：オフのときは要確認の回が出ない");
  assertEqual(tvHost.textContent.includes("（要確認）"), false, "音楽番組の画面：オフのときはファンの記録だけの曲も出ない");
  const unknownEntry = TV_APPEARANCES.find((t) => t.songsConfidence === "未確認");
  const unknownItem = [...tvHost.querySelectorAll(".tv-item")].find((item) => item.dataset.date === unknownEntry?.date);
  assertEqual(unknownItem?.textContent.includes("披露曲：未確認"), true, "音楽番組の画面：出演は確かめられたが曲が分からない回は「披露曲：未確認」");
  toggle.checked = true;
  toggle.dispatchEvent(new Event("change"));
  for (let i = 0; i < 10 && !tvHost.querySelector(".tv-more-button").hidden; i += 1) tvHost.querySelector(".tv-more-button").click();
  assertEqual(tvHost.querySelectorAll(".tv-item").length, TV_APPEARANCE_RECORDS.length, "音楽番組の画面：オンにすると要確認の記録も全部出る");
  assertEqual(tvHost.querySelectorAll(".tv-item.is-unverified").length, hiddenDates.length, "音楽番組の画面：要確認の回には点線の印");
  toggle.checked = false;
  toggle.dispatchEvent(new Event("change"));
  tvHost.remove();
}

function runSearchTests() {
  const entries = buildAppSearchEntries();
  const keysOf = (query) => searchAppEntries(entries, query).results.map((r) => r.entry.key);
  const hits = keysOf("ミュージックステーション");
  assertEqual(hits.some((key) => key.startsWith("tv:2021-09-17")), true, "全体検索：番組名で音楽番組出演が見つかる");
  const anniv = keysOf("4周年");
  assertEqual(anniv.includes("anniversary:4"), true, "全体検索：「4周年」で周年ヒストリーが見つかる");
  assertEqual(keysOf("Mステ").some((key) => key.startsWith("tv:")), true, "全体検索：「Mステ」で音楽番組出演が見つかる");
  assertEqual(keysOf("ウィークエンドシトロン").some((key) => key.startsWith("tv:2021-09-17")), true, "全体検索：曲名で、その曲を披露した放送が見つかる");
  assertEqual(keysOf("武道館").some((key) => key.startsWith("anniversary:")), true, "全体検索：「武道館」で周年ヒストリーが見つかる");
  assertEqual(keysOf("2025年").some((key) => key.startsWith("tv:2025")), true, "全体検索：「2025年」でその年の音楽番組出演が見つかる");
}

export function runHistoryPagesTests() {
  console.log("--- 周年ヒストリー・音楽番組出演アーカイブ（2026-10-29） ---");
  runDataTests();
  runModelTests();
  runScreenTests();
  runSearchTests();
}
