// 【2026-10-28新設】【ライブ】ページ（js/liveHubScreen.js）・映像カード（js/setlistView.js の buildVideoCard）・
// ライブ用の計算（js/liveSetlistStats.js の追加分）・収録曲一覧の簡素化・全体検索⇄歌詞検索の戻り先の回帰テスト。
import { SONGS } from "../js/data/songs.js";
import { LIVE_EVENTS } from "../js/data/liveHistory.js";
import { SETLIST_PERFORMANCES, LIVE_VIDEO_PRODUCTS } from "../js/data/setlists.js";
import {
  groupPerformancesByYear,
  findVideosForPerformance,
  findVideosForLive,
  sortVideosByRelease,
  summarizeVideoFormats,
  describeVideoLiveDates,
  describeSongPositionInVideo,
  describeStreamingBadge,
  buildOfficialProductLinks,
  findNextAnnouncedLive,
  setlistButtonLabel,
} from "../js/liveSetlistStats.js";
import { buildVideoCard } from "../js/setlistView.js";
import { LIVE_HUB_TILES, LIVE_HUB_VIEWS, initLiveHubScreen, openLiveHubScreen, goBackInLiveHub } from "../js/liveHubScreen.js";
import { buildAppSearchEntries, searchAppEntries } from "../js/appSearchIndex.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { assertEqual } from "./test-utils.js";

async function fetchText(path) {
  return (await fetch(`./${path}`, { cache: "no-store" })).text();
}

function runLiveHubHelperTests() {
  console.log("--- ライブページ：計算 ---");
  // 年ごと（新しい年が先・年の中も新しい日付が先）
  const groups = groupPerformancesByYear();
  assertEqual(groups.map((group) => group.year), [...groups.map((group) => group.year)].sort().reverse(), "A: 年は新しい順");
  assertEqual(groups.reduce((sum, group) => sum + group.performances.length, 0), SETLIST_PERFORMANCES.length, "A: すべての公演がどこかの年に入る");
  assertEqual(groups.every((group) => group.performances.every((p, i, list) => i === 0 || list[i - 1].date >= p.date)), true, "A: 年の中も新しい日付が先");

  // 公演・ライブ履歴のカード → 映像商品
  assertEqual(findVideosForPerformance("perf-2nd-anniversary").map((video) => video.id), ["video-2nd-anniversary"], "A: 公演から、それを収録した映像");
  assertEqual(findVideosForPerformance("perf-xxx"), [], "A: 映像の無い公演は空");
  assertEqual(findVideosForLive("live-2nd-anniversary").map((video) => video.id), ["video-2nd-anniversary"], "A: ライブ履歴のカードから映像");
  assertEqual(findVideosForLive("live-tif2017-first-stage"), [], "A: 映像化されていない公演は空");

  // 発売順
  const desc = sortVideosByRelease(LIVE_VIDEO_PRODUCTS, "desc");
  const asc = sortVideosByRelease(LIVE_VIDEO_PRODUCTS, "asc");
  assertEqual([desc.length, desc[0].releaseDate >= desc[desc.length - 1].releaseDate, asc[0].releaseDate <= asc[asc.length - 1].releaseDate], [LIVE_VIDEO_PRODUCTS.length, true, true], "A: 発売日の新しい順・古い順");

  // 形式・開催日・収録位置
  assertEqual(summarizeVideoFormats({ editions: [{ format: "Blu-ray（2枚組）" }, { format: "DVD" }] }), "Blu-ray／DVD", "A: 形式を短く（Blu-ray／DVD）");
  assertEqual(summarizeVideoFormats({ productCodes: "Blu-ray VVXL-1" }), "Blu-ray", "A: 形態が無ければ品番の文から");
  assertEqual(summarizeVideoFormats({}), "形式未確認", "A: 分からなければ未確認");
  const second = LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-2nd-anniversary");
  assertEqual(describeVideoLiveDates(second), ["2019年9月12日"], "A: 映像に収録された公演の開催日");
  assertEqual(describeSongPositionInVideo(second, "aikatsu-happy-end"), { included: true, undisclosed: false, positions: ["2曲目"] }, "A: 公式の曲目どおりなら「N曲目」");
  assertEqual(describeSongPositionInVideo(second, "bokura-no-seifuku-christmas").positions, ["7曲目・17曲目"], "A: 同じ曲が2回入っていれば両方の曲目");
  const first = LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-1st-concert-2019");
  assertEqual(describeSongPositionInVideo(first, "start").positions[0].includes("曲目で確認"), true, "A: 収録順が確かでないときは曲目を断定しない");
  const stadium = LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-stadium-beyond-kyun");
  assertEqual([describeSongPositionInVideo(stadium, "love").included, describeSongPositionInVideo(stadium, "love").undisclosed], [false, true], "A: 収録曲未発表は「収録」と言わない");
  const timeless = LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-timeless-tales-2025");
  assertEqual(describeSongPositionInVideo(timeless, "want-you-want-you").positions.every((text) => text.includes("の公演：")), true, "A: 2公演を収録した映像では、どの公演の何曲目かを付ける");

  // 公式配信のバッジ（配信と収録は別の事実）
  assertEqual(
    [describeStreamingBadge({ streaming: { status: "available" } }).label, describeStreamingBadge({ streaming: { status: "none" } }).label, describeStreamingBadge({}).label],
    ["公式配信あり", "公式配信：確認できず", "公式配信：未確認"],
    "A: 公式配信あり／確認できず／未確認"
  );

  // 公式商品ページ（「購入」と書かない・同じページはまとめる）
  const firstLinks = buildOfficialProductLinks(first);
  assertEqual([firstLinks.length, firstLinks[0].label], [1, "公式商品ページ（Blu-ray・DVD（2枚組））"], "A: 同じ商品ページを指す形態は1つにまとめる");
  const allLinks = LIVE_VIDEO_PRODUCTS.flatMap((video) => buildOfficialProductLinks(video));
  assertEqual(allLinks.filter((link) => link.label.includes("購入")), [], "A: リンクに「購入」と書かない");
  assertEqual(buildOfficialProductLinks(stadium).map((link) => link.label), ["公式の告知ページ"], "A: 商品ページが無い（発売前）ときは公式の告知ページ");

  // 次のライブ・セットリストのボタン
  const events = [
    { id: "a", status: "announced", startDate: "2026-12-01", endDate: "2026-12-02" },
    { id: "b", status: "announced", startDate: "2026-11-01", endDate: null },
    { id: "c", status: "announced", startDate: "2026-01-01", endDate: null },
    { id: "d", status: "held", startDate: "2026-10-30", endDate: null },
  ];
  assertEqual(findNextAnnouncedLive(events, "2026-10-28")?.id, "b", "A: 次のライブ＝今日以降でいちばん近い開催予定");
  assertEqual(findNextAnnouncedLive(events, "2027-01-01"), null, "A: 日程を過ぎた開催予定は「次のライブ」にしない");
  assertEqual(
    [setlistButtonLabel({ completeness: "full", dayLabel: "DAY1" }), setlistButtonLabel({ completeness: "partial", dayLabel: null })],
    ["セットリスト DAY1", "披露を確認できた曲"],
    "A: DAY1／DAY2 付きのボタン名・一部だけの公演は言い方を変える"
  );
}

function runVideoCardTests() {
  console.log("--- ライブページ：映像カード ---");
  const sixth = LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-6th-anniversary");
  const card = buildVideoCard(sixth, { songId: "love-locke", today: "2026-10-28" });
  const text = card.textContent;
  assertEqual(card.dataset.videoId, "video-6th-anniversary", "B: カードに映像の目印（data-video-id）");
  assertEqual(["映像収録確認済み", "Blu-ray／DVD", "ライブ開催日", "映像発売日", "収録位置", "7曲目（ラブロケ）", "公式配信あり"].every((word) => text.includes(word)), true, "B: 最初に要点（開催日・発売日・形式・収録位置・配信）");
  assertEqual(["VVXL-205", "正式名称", "公式商品ページ"].some((word) => text.includes(word)), false, "B: 品番・商品ページは最初は出さない（詳細の中）");
  const more = card.querySelector("details.live-video-more");
  more.open = true;
  more.dispatchEvent(new Event("toggle"));
  const opened = card.textContent;
  assertEqual(["正式名称", "形態・品番", "VVXL-205", "形態別の違い", "収録曲", "公式商品ページ", "公式配信", "注意事項"].every((word) => opened.includes(word)), true, "B: 「詳細を見る」で正式名称・品番・形態の違い・収録曲・リンク・注意事項");
  assertEqual(opened.includes("購入"), false, "B: 「購入」と書かない");
  assertEqual(card.querySelector(".setlist-item.is-current-song") !== null, true, "B: 収録曲の中で、探した曲を目立たせる");
  more.dispatchEvent(new Event("toggle"));
  assertEqual(card.querySelectorAll(".live-video-detail").length, 1, "B: 開き直しても中身を二重に作らない");
  const plain = buildVideoCard(sixth, { today: "2026-10-28" });
  assertEqual(plain.textContent.includes("映像収録確認済み") || plain.textContent.includes("収録位置"), false, "B: 曲を指定しない一覧では収録の表示を出さない");
  const stadium = buildVideoCard(LIVE_VIDEO_PRODUCTS.find((video) => video.id === "video-stadium-beyond-kyun"), { songId: "love", today: "2026-10-28" });
  assertEqual([stadium.textContent.includes("収録曲未発表"), stadium.textContent.includes("映像収録確認済み"), stadium.textContent.includes("発売予定")], [true, false, true], "B: 発売前・曲目未発表の映像は「収録曲未発表」「発売予定」");
}

function runLiveHubScreenTests() {
  console.log("--- ライブページ：画面 ---");
  const container = document.createElement("div");
  const opened = [];
  const actions = [];
  initLiveHubScreen({ container }, { onOpenSong: (id) => opened.push(id), onOpenAction: (action) => actions.push(action), onRevealTarget: () => {} });
  openLiveHubScreen();
  const tiles = [...container.querySelectorAll(".live-hub-tile")];
  assertEqual(tiles.map((tile) => tile.querySelector(".live-hub-tile-label").textContent), ["過去のライブを調べる", "セットリストを見る", "曲からライブを探す", "ライブ映像を探す", "ライブ初心者ガイド", "コールを調べる"], "C: トップは目的別の6タイル");
  assertEqual(LIVE_HUB_TILES.filter((tile) => tile.action).map((tile) => tile.action), [{ type: "click", selector: "#live-guide-link" }, { type: "specialMode", modeId: "liveCallMode" }], "C: ガイド・コールは既存の画面へ（公開済みのライブコールモードの入口だけ）");
  assertEqual(container.textContent.includes("VVXL") || container.textContent.includes("calltext"), false, "C: トップに品番・未公開の機能を出さない");

  // トップ → セットリスト一覧 → 1公演 → 戻る → 戻る
  tiles[1].click();
  assertEqual(container.dataset.activeView, "setlists", "C: タイルで「セットリスト」へ");
  container.querySelector('[data-view="setlists"] .live-hub-row').click();
  assertEqual(container.dataset.activeView, "setlistDetail", "C: 公演を選ぶとセットリスト");
  const songButton = container.querySelector('[data-view="setlistDetail"] .setlist-item-title.is-link');
  songButton.click();
  assertEqual(opened.length, 1, "C: セットリストの曲名から曲へ（収録曲一覧）");
  assertEqual([goBackInLiveHub(), container.dataset.activeView], [true, "setlists"], "C: 戻るでセットリスト一覧へ");
  assertEqual([goBackInLiveHub(), container.dataset.activeView], [true, "home"], "C: もう一度戻るでトップへ");
  assertEqual(goBackInLiveHub(), false, "C: トップで戻ると画面を出る（main.js が来た画面へ戻す）");

  // 検索などから直接開いた表示では、戻るでそのまま画面を出る
  const { focusSelector } = openLiveHubScreen({ view: "videos", videoId: "video-2nd-anniversary" });
  assertEqual([container.dataset.activeView, focusSelector], ["videos", '[data-video-id="video-2nd-anniversary"]'], "C: 映像カードを直接開ける");
  assertEqual(container.querySelector('[data-view="videos"] [data-video-id="video-2nd-anniversary"]') !== null, true, "C: 映像の一覧に該当カードがある");
  assertEqual(goBackInLiveHub(), false, "C: 直接開いた表示の「戻る」は来た画面へ");
  const history = openLiveHubScreen({ view: "history", liveId: "live-2nd-anniversary" });
  const liveCard = container.querySelector('[data-view="history"] [data-live-id="live-2nd-anniversary"]');
  assertEqual([history.focusSelector, liveCard !== null], ['[data-live-id="live-2nd-anniversary"]', true], "C: 過去のライブの該当カードを開ける");
  assertEqual([...liveCard.querySelectorAll(".live-hub-chip")].map((chip) => chip.textContent), ["セットリスト", "ライブ映像"], "C: 公演カードから、セットリスト・ライブ映像へ");
  assertEqual(container.querySelectorAll('[data-view="history"] [data-live-id]').length, LIVE_EVENTS.length, "C: ライブ履歴の公演をすべて載せる");

  // 曲からライブを探す：曲名を入れると公演、映像は分けて件数とボタン
  openLiveHubScreen({ view: "songLive", songQuery: "ラブロケ" });
  const songView = container.querySelector('[data-view="songLive"]');
  assertEqual(songView.querySelector("input").value, "ラブロケ", "C: 曲名を入れた状態で開ける（検索語を残す）");
  assertEqual(songView.querySelectorAll(".live-hub-song-block .live-hub-row").length >= 5, true, "C: その曲を披露した公演の一覧");
  assertEqual(/確認できた(公演の)?範囲/.test(songView.textContent), true, "C: 「確認できた範囲」の言い方");
  assertEqual(/(\d+|約\d+)年(間)?歌っていない|初披露/.test(songView.textContent), false, "C: 「N年歌っていない」「初披露」と断定しない");
  songView.querySelector(".live-hub-inline-link").click();
  const videoView = container.querySelector('[data-view="videos"]');
  assertEqual([container.dataset.activeView, videoView.querySelector("input").value], ["videos", "ラブロケ"], "C: 曲から探す → その曲のライブ映像（曲名を引き継ぐ）");
  assertEqual(videoView.textContent.includes("映像収録確認済み"), true, "C: 映像は「映像収録確認済み」を付けて別に出す");
  assertEqual([goBackInLiveHub(), container.dataset.activeView, songView.querySelector("input").value], [true, "songLive", "ラブロケ"], "C: 戻ると曲から探す（入力を残したまま）");
  openLiveHubScreen();
  assertEqual(LIVE_HUB_VIEWS.includes("setlistDetail"), true, "C: 表示の一覧");
}

async function runLiveHubWiringTests() {
  console.log("--- ライブページ：画面・導線（ソースとHTML） ---");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(doc.getElementById("live-hub-screen")?.classList.contains("screen"), true, "D: 【ライブ】画面がある");
  assertEqual(doc.querySelector("#live-hub-screen #live-hub-back-button.back-link") !== null, true, "D: 戻るは共通の back-link（検索・ライブから来たとき元の画面へ戻れる）");
  // 【2026-10-30改訂・リニューアル第2段階】【ライブ】はホームの入口（案B）、ライブ初心者ガイドはガイド画面へ移した
  assertEqual(doc.querySelector("#start-screen .home-entry-grid #live-hub-link") !== null && doc.querySelector("#guide-hub-screen #live-guide-link") !== null, true, "D: ホームの入口に【ライブ】、ガイド画面にライブ初心者ガイドの入口");
  assertEqual(html.includes('href="css/liveHub.css"'), true, "D: ライブページの CSS を読み込む");
  const lyricsSwitch = doc.getElementById("lyrics-search-to-app-switch");
  assertEqual([lyricsSwitch?.hasAttribute("hidden"), lyricsSwitch?.querySelector("#lyrics-search-to-app-button")?.textContent.includes("全体検索へ")], [true, true], "D: 歌詞検索の「全体検索へ」は最初は隠す（全体検索から来たときだけ出す）");

  const screens = await fetchText("js/screens.js");
  assertEqual(screens.includes('liveHub: document.getElementById("live-hub-screen")'), true, "D: 画面切り替えに登録");
  const main = await fetchText("js/main.js");
  assertEqual(main.includes("navigateWithScrollMemory(lyricsSearchReturnScreen)"), true, "E: 歌詞検索の「戻る」は開いた画面へ（全体検索から来たら全体検索）");
  assertEqual(main.includes('lyricsSearchToAppSwitchElement.hidden = lyricsSearchReturnScreen !== "appSearch"'), true, "E: 全体検索から来たときだけ「全体検索へ」を出す");
  assertEqual(main.includes("searchReturn = searchReturn.previous ?? null;"), true, "F: 検索→ライブ→曲 の「戻る」を重ねて戻れる");
  assertEqual(main.includes("if (goBackInLiveHub()) return;"), true, "F: ライブページの戻るは、ページの中の1つ前の表示へ");

  const songlist = await fetchText("js/songlist.js");
  assertEqual(songlist.includes("buildSongLiveSection(") || songlist.includes("has-live-section"), false, "A: 収録曲一覧から「ライブでの披露」を外した");
  const setlistView = await fetchText("js/setlistView.js");
  assertEqual(setlistView.includes("export function buildSongLiveSection"), true, "A: 表示部品とデータは残す");
  const discography = await fetchText("js/discographyScreen.js");
  assertEqual(discography.includes('screen: "liveHub"') && !discography.includes("buildLiveEventCard"), true, "D: ＝LOVEについて→ライブ タブは【ライブ】ページへの案内だけ（内容を二重に持たない）");
  const hub = await fetchText("js/liveHubScreen.js");
  assertEqual(["calltext", "callTextEdits", "localStorage", "fetch(", "firebase"].filter((word) => hub.includes(word)), [], "D: ライブページは未公開のコール文字データ・保存・通信を使わない");
  const lyricsSources = (await fetchText("js/lyricsSearchScreen.js")) + (await fetchText("js/lyricsSearch.js"));
  assertEqual(["fetch(", "firebase", "sendBeacon", "XMLHttpRequest"].filter((word) => lyricsSources.includes(word)), [], "E: 歌詞検索は端末内だけ（通信しない）");
}

function runLiveHubSearchTests() {
  console.log("--- ライブページ：全体検索 ---");
  const entries = buildAppSearchEntries({ today: "2026-10-28" });
  const live = entries.find((entry) => entry.key === "live:live-2nd-anniversary");
  assertEqual(live.action.target, { kind: "liveHub", view: "history", liveId: "live-2nd-anniversary" }, "G: 公演の検索結果は【ライブ】ページの該当公演へ");
  const video = entries.find((entry) => entry.key === "video:video-2nd-anniversary");
  assertEqual(video.action.target, { kind: "liveHub", view: "videos", videoId: "video-2nd-anniversary" }, "G: 映像の検索結果は【ライブ】ページの該当カードへ");
  assertEqual(entries.filter((entry) => entry.key.startsWith("video:")).every((entry) => entry.links.every((link) => !link.label.includes("購入"))), true, "G: 映像のリンクに「購入」と書かない");
  assertEqual(APP_SEARCH_FEATURES.find((feature) => feature.id === "feature-live-hub")?.action.selector, "#live-hub-link", "G: 【ライブ】ページを機能として登録");
  const top = searchAppEntries(entries, "セットリスト", "all").results.map(({ entry }) => entry.key);
  assertEqual(top.includes("feature:feature-live-hub"), true, "G: 「セットリスト」で【ライブ】ページが見つかる");
  const bySong = searchAppEntries(entries, "アイカツハッピーエンド", "live").results.map(({ entry }) => entry.action.target.kind);
  assertEqual(bySong.length > 0 && bySong.every((kind) => kind === "liveHub"), true, "G: 曲名検索 → 該当公演・映像商品は【ライブ】ページへ");
  assertEqual(SONGS.length > 0, true, "G: 曲データ");
}

export async function runLiveHubTests() {
  runLiveHubHelperTests();
  runVideoCardTests();
  runLiveHubScreenTests();
  await runLiveHubWiringTests();
  runLiveHubSearchTests();
}
