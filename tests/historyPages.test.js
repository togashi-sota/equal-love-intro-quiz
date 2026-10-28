// 【2026-10-29新設】「＝LOVEの歩み・周年ヒストリー」と「音楽番組出演・披露曲アーカイブ」の回帰テスト
// （データの整合性・周年の区切り・検索と絞り込み・画面の組み立て・全体検索への登録）。
import { SONGS } from "../js/data/songs.js";
import { LIVE_EVENTS } from "../js/data/liveHistory.js";
import { ANNIVERSARY_PERIODS, ANNIVERSARY_EVENTS } from "../js/data/anniversaryHistory.js";
import { TV_APPEARANCES } from "../js/data/tvAppearances.js";
import {
  buildAnniversaryModel,
  defaultAnniversaryPeriod,
  formatHistoryDate,
  formatPeriodRange,
  relatedTargets,
} from "../js/anniversaryHistoryModel.js";
import { filterTvAppearances, groupTvAppearancesByYear, seriesOf, appearancesForSong, availableSeries, describeAppearanceKind } from "../js/tvAppearanceModel.js";
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

  // 音楽番組
  assertEqual(TV_APPEARANCES.length > 100, true, "音楽番組：2017〜2026年の出演がある");
  const keys = TV_APPEARANCES.map((t) => `${t.date}|${t.program}`);
  assertEqual(new Set(keys).size, keys.length, "音楽番組：同じ日・同じ番組が重ならない");
  assertEqual(TV_APPEARANCES.every((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.program), true, "音楽番組：日付と番組名がある");
  assertEqual(TV_APPEARANCES.every((t) => ["確認済み", "準確認", "要確認"].includes(t.confidence)), true, "音楽番組：確度は3種類のどれか");
  const badTvSongs = TV_APPEARANCES.flatMap((t) => t.songs).filter((s) => s.songId && !songIds.has(s.songId)).map((s) => s.songId);
  assertEqual(badTvSongs, [], "音楽番組：曲IDはすべてアプリの曲にある（無い曲は null）");
  assertEqual(TV_APPEARANCES.every((t) => (t.sources ?? []).length > 0), true, "音楽番組：全部の放送に出典がある");
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
