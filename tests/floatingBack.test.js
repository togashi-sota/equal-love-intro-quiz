// 長いページの「戻る」の浮く札（js/floatingBack.js）と、Overture の作品一覧での扱いのテスト
// （2026-11-01・本人の追加依頼 2-1・3）。
//   A. 判断だけの関数：出す／出さない・貼り付く帯の下へずらす量・札の文字
//   B. 対象の画面：見出しの［戻る］がある画面はすべて対象（除外は理由つきの一覧だけ）。対戦の進行中・プレイ中は必ず除外
//   C. 本物の部品を隠れた箱で動かす：上へ隠れたら出る・押すと元の［戻る］が1回押される・見えたら消える・モーダル中は出ない
//   D. 配線（main.js・sw.js・css）
//   E. Overture：アルバムの収録順（公式の曲順）・日付はアルバムの発売日のまま・一覧の日付順で先頭に固定しない・短い説明
//   ※ 本物のアプリでの全画面の確認（出る・押すと正しく戻る・消える）は renewal-notes/nx-nav-scripts/e2e_all.py（Firebase を遮断して開く）
import { assertEqual } from "./test-utils.js";
import {
  FLOATING_BACK_EXCLUDED_SCREENS,
  isFloatingBackScreen,
  decideFloatingBack,
  computeStickyOffset,
  buildFloatingBackLabel,
  initFloatingBack,
  updateFloatingBack,
} from "../js/floatingBack.js";
import { GUARDED_SCREENS, NON_RESTORABLE_SCREENS } from "../js/appNavigationStack.js";
import { SONGS, CATEGORY } from "../js/data/songs.js";
import { DISCOGRAPHY, ALBUM_TRACK_LISTS, sortSongsByTrackList, findTrackEntry } from "../js/data/discography.js";
import { buildWorkSummaries } from "../js/discographyScreen.js";
import { buildSongGroups } from "../js/songGrouping.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

// js/screens.js の「画面名: document.getElementById("id")」の対応を、ファイルの文字から読む
// （screens.js を読み込むと本物の画面の部品を探しに行くため、テストでは文字だけを使う）
function parseScreenMap(source) {
  const map = {};
  for (const match of source.matchAll(/^\s*(\w+): document\.getElementById\("([\w-]+)"\)/gm)) map[match[1]] = match[2];
  return map;
}

export async function runFloatingBackTests() {
  console.log("--- 長いページの「戻る」の浮く札・Overture の収録順（2026-11-01） ---");

  // ===== A. 判断だけの関数 =====
  const base = { screenName: "discography", hasControl: true, controlBottom: -40, overlayOpen: false };
  assertEqual(decideFloatingBack(base), true, "A: ［戻る］が上へ隠れたら出す");
  assertEqual(decideFloatingBack({ ...base, controlBottom: 30 }), false, "A: ［戻る］が見えている間は出さない（同じボタンを2つ見せない）");
  assertEqual(decideFloatingBack({ ...base, controlBottom: 1 }), true, "A: 下端が画面の上端（2px 以内）まで隠れたら出す");
  assertEqual(decideFloatingBack({ ...base, controlBottom: 3 }), false, "A: 少しでも見えていれば出さない");
  assertEqual(decideFloatingBack({ ...base, overlayOpen: true }), false, "A: モーダル・全画面の表示が開いている間は出さない");
  assertEqual(decideFloatingBack({ ...base, hasControl: false }), false, "A: ［戻る］が無い画面（結果画面など）では出さない");
  assertEqual(decideFloatingBack({ ...base, screenName: "quiz" }), false, "A: 除外の画面（プレイ中）では出さない");
  assertEqual(decideFloatingBack({ ...base, screenName: "onlineBattleLobby" }), false, "A: 除外の画面（対戦の進行中）では出さない");
  assertEqual(decideFloatingBack({ ...base, controlBottom: null }), false, "A: 位置が分からないときは出さない");
  assertEqual([isFloatingBackScreen("start"), isFloatingBackScreen(""), isFloatingBackScreen(undefined)], [false, false, false], "A: ホーム・画面名なしは対象外");

  const pill = { left: 8, right: 80, height: 44 };
  assertEqual(computeStickyOffset(8, pill, []), 0, "A: 貼り付く帯が無ければずらさない");
  assertEqual(computeStickyOffset(8, pill, [{ top: 0, bottom: 86, left: 0, right: 390 }]), 84, "A: 上に貼り付いた帯（0〜86px）があれば、その下（92px）へずらす");
  assertEqual(computeStickyOffset(8, pill, [{ top: 300, bottom: 360, left: 0, right: 390 }]), 0, "A: まだ貼り付いていない（下にある）帯ではずらさない");
  assertEqual(computeStickyOffset(8, pill, [{ top: 0, bottom: 60, left: 200, right: 390 }]), 0, "A: 横に重ならない帯ではずらさない");
  assertEqual(
    computeStickyOffset(8, pill, [{ top: 0, bottom: 50, left: 0, right: 390 }, { top: 50, bottom: 90, left: 0, right: 390 }]),
    88,
    "A: 帯が2段に重なっていれば、2段目の下へ"
  );
  assertEqual(computeStickyOffset(47, pill, [{ top: 0, bottom: 40, left: 0, right: 390 }]), 0, "A: 帯が札より上で終わっていれば（安全領域の分だけ下に札がある）ずらさない");

  const fakeControl = (text) => ({ textContent: text });
  assertEqual(buildFloatingBackLabel(fakeControl("\n   ホーム\n ")), "ホーム", "A: 札の文字は元の［戻る］の文字（空白は詰める）");
  assertEqual(buildFloatingBackLabel(fakeControl("設定へ戻る")), "設定へ戻る", "A: 「設定へ戻る」もそのまま");
  assertEqual(buildFloatingBackLabel(fakeControl("")), "戻る", "A: 文字が無ければ「戻る」");
  assertEqual(buildFloatingBackLabel(fakeControl("とても長い戻るボタンの文字のテスト")), "戻る", "A: 長すぎる文字は「戻る」に");

  // ===== B. 対象の画面 =====
  const screensSource = await fetchText("js/screens.js");
  const screenMap = parseScreenMap(screensSource);
  const screenNames = Object.keys(screenMap);
  const doc = new DOMParser().parseFromString(await fetchText("index.html"), "text/html");
  const withBack = screenNames.filter((name) => doc.getElementById(screenMap[name])?.querySelector(".back-link"));
  const targets = withBack.filter(isFloatingBackScreen);
  assertEqual(screenNames.length > 80, true, `B: 画面の一覧を読めた（${screenNames.length}画面）`);
  assertEqual(
    Object.keys(FLOATING_BACK_EXCLUDED_SCREENS).filter((name) => !screenNames.includes(name)),
    [],
    "B: 除外の一覧の画面名はすべて実在する（書き間違いが無い）"
  );
  assertEqual(
    Object.entries(FLOATING_BACK_EXCLUDED_SCREENS).filter(([, reason]) => typeof reason !== "string" || reason.length < 4).map(([name]) => name),
    [],
    "B: 除外の画面にはすべて理由が書いてある"
  );
  assertEqual(
    [...GUARDED_SCREENS].filter((name) => isFloatingBackScreen(name)),
    [],
    "B: 端末の「戻る」を受け付けない画面（対戦の進行中など）はすべて除外"
  );
  assertEqual(
    [...NON_RESTORABLE_SCREENS].filter((name) => isFloatingBackScreen(name)),
    [],
    "B: プレイ中の画面（戻り先にしない画面）はすべて除外"
  );
  const mustInclude = [
    "discography", // ＝LOVE について・作品一覧・年表・ライブ
    "workDetail",
    "liveCall", // コールを覚える
    "guide", // 遊び方・機能ガイド
    "gameGuide",
    "liveGuide",
    "songlist", // 一覧系
    "centers",
    "cdSales", // CD 売上・チャート記録
    "tvAppearances",
    "anniversary",
    "members",
    "memberDetail",
    "liveHub",
    "appSearch",
    "lyricsSearch",
    "history",
    "playlists",
    "settings",
  ];
  assertEqual(mustInclude.filter((name) => !targets.includes(name)), [], "B: ＝LOVE について・コールを覚える・ガイド・一覧系・CD 売上などはすべて対象");
  assertEqual(targets.length >= 50, true, `B: 見出しの［戻る］がある画面のうち ${targets.length} 画面が対象`);

  // ===== C. 本物の部品を隠れた箱で動かす =====
  const savedScreen = document.body.dataset.screen;
  const fixture = document.createElement("section");
  fixture.style.cssText = "position:fixed;left:0;top:-300px;width:300px;height:200px;opacity:0;pointer-events:none;";
  fixture.innerHTML = '<div class="list-header"><button class="back-link" type="button">ホーム</button></div>';
  document.body.appendChild(fixture);
  const backLink = fixture.querySelector(".back-link");
  let backClicks = 0;
  backLink.addEventListener("click", () => backClicks++);
  let overlayOpen = false;
  const listeners = [];
  const button = initFloatingBack({
    onScreenChange: (listener) => listeners.push(listener),
    getScreenElement: (name) => (name === "discography" ? fixture : null),
    findBackControl: (screenElement) => screenElement?.querySelector(".back-link") ?? null,
    isOverlayOpen: () => overlayOpen,
  });
  try {
    document.body.dataset.screen = "discography";
    assertEqual(updateFloatingBack(), true, "C: ［戻る］が上へ隠れている → 札が出る");
    assertEqual(
      [button.classList.contains("is-shown"), button.getAttribute("aria-hidden"), button.tabIndex, button.textContent.trim()],
      [true, "false", 0, "ホーム"],
      "C: 出ている札は押せて読み上げの対象・文字は元の［戻る］と同じ"
    );
    button.click();
    assertEqual(backClicks, 1, "C: 札を押すと元の［戻る］が1回だけ押される（戻る処理は今までのまま）");
    assertEqual(button.classList.contains("is-shown"), false, "C: 押したら札は消える");
    updateFloatingBack();
    overlayOpen = true;
    assertEqual(updateFloatingBack(), false, "C: モーダルが開いている間は出ない");
    overlayOpen = false;
    fixture.style.top = "40px";
    assertEqual(updateFloatingBack(), false, "C: 上へ戻して［戻る］が見えたら消える");
    assertEqual([button.getAttribute("aria-hidden"), button.tabIndex], ["true", -1], "C: 消えている札は読み上げ・キーボードの対象外");
    fixture.style.top = "-300px";
    updateFloatingBack();
    document.body.dataset.screen = "quiz";
    listeners.forEach((listener) => listener("quiz"));
    assertEqual(button.classList.contains("is-shown"), false, "C: 画面が変わったら、まず消える（前の画面の札を残さない）");
    assertEqual(updateFloatingBack(), false, "C: 除外の画面では出ない");
  } finally {
    if (savedScreen === undefined) delete document.body.dataset.screen;
    else document.body.dataset.screen = savedScreen;
    fixture.remove();
    updateFloatingBack();
    button.remove(); // テストのページ（css/homeRenewal.css を読まない）に札を残さない
  }

  // ===== D. 配線 =====
  const main = await fetchText("js/main.js");
  assertEqual(main.includes("initFloatingBack({ onScreenChange, getScreenElement, findBackControl })"), true, "D: main.js から1回だけ始める（appHistory の findBackControl を使う）");
  const sw = await fetchText("sw.js");
  assertEqual(sw.includes('"./js/floatingBack.js"'), true, "D: オフライン用のキャッシュに入っている");
  const homeCss = await fetchText("css/homeRenewal.css");
  const block = homeCss.slice(homeCss.indexOf(".floating-back {"), homeCss.indexOf(".floating-back.is-shown {"));
  assertEqual(
    ["safe-area-inset-top", "safe-area-inset-left", "min-height: 44px", "z-index: 14", "visibility: hidden", "pointer-events: none"].filter((text) => !block.includes(text)),
    [],
    "D: 安全領域の下・左・押しやすい高さ・モーダル（20）より奥・隠れている間は押せない"
  );
  assertEqual(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.floating-back \{/.test(homeCss), true, "D: 動き（ふわっと出る）は「視差効果を減らす」がオフのときだけ");

  // ===== E. Overture =====
  const overture = SONGS.find((song) => song.id === "overture");
  assertEqual([overture.releaseDate, overture.workId, overture.category], ["2021-05-12", "album-01", CATEGORY.SPECIAL], "E: 日付は1stアルバムの発売日のまま（作品は増やさない・特別収録曲のまま）");
  assertEqual(overture.shortNote, "ライブのオープニング曲・歌詞なし", "E: 短い説明「ライブのオープニング曲・歌詞なし」");
  const albumSongs = SONGS.filter((song) => song.workId === "album-01").map((song) => song.id);
  const albumTracks = ALBUM_TRACK_LISTS["album-01"].tracks;
  assertEqual([...albumSongs].sort(), albumTracks.map((track) => track.songId).sort(), "E: 収録順のデータは album-01 の曲とちょうど同じ（足りない・余分が無い）");
  assertEqual(albumTracks.every((track, index) => index === 0 || track.no >= albumTracks[index - 1].no), true, "E: 収録順の番号は小さい順");
  assertEqual([albumTracks[0].songId, albumTracks[0].no], ["overture", 1], "E: Overture は1曲目");
  assertEqual(
    albumTracks.filter((track) => track.edition).map((track) => `${track.no}:${track.songId}:${track.edition}`),
    ["10:genneki-idol-chu:Type-A のみ", "10:haikei-anata-sama:Type-B のみ"],
    "E: 10曲目は版で違う（公式：Type-A は現役アイドルちゅ～、Type-B は拝啓 貴方様）"
  );
  const work = buildWorkSummaries(SONGS, DISCOGRAPHY).find((entry) => entry.workId === "album-01");
  assertEqual(work.songs.map((song) => song.id), albumTracks.map((track) => track.songId), "E: 作品詳細の収録曲は公式の収録順（Overture が先頭）");
  assertEqual(work.title, "桜の咲く音がした", "E: 作品の代表曲（表題曲）は今までどおり");
  assertEqual(findTrackEntry(work.trackList, "cinema")?.no, 14, "E: cinema は14曲目");
  // 収録順のデータが無い作品（シングル）は、今までどおり songs.js の並び
  const before = new Map();
  SONGS.forEach((song) => {
    if (!before.has(song.workId)) before.set(song.workId, []);
    before.get(song.workId).push(song.id);
  });
  const changed = buildWorkSummaries(SONGS, DISCOGRAPHY)
    .filter((entry) => entry.workId !== "album-01")
    .filter((entry) => JSON.stringify(entry.songs.map((song) => song.id)) !== JSON.stringify(before.get(entry.workId) ?? []))
    .map((entry) => entry.workId);
  assertEqual(changed, [], "E: アルバム以外の作品の曲の並びは変わらない");
  assertEqual(sortSongsByTrackList([{ id: "x" }, { id: "y" }], null).map((song) => song.id), ["x", "y"], "E: 収録順のデータが無ければそのまま");
  // 楽曲一覧の日付順：特別収録曲の中で 866（2019）の次。いちばん上に固定しない
  const special = buildSongGroups(SONGS).find((group) => group.key === "special");
  assertEqual(special.songs.map((song) => song.id), ["866", "overture"], "E: 楽曲一覧では日付順（866 → Overture）。先頭に固定しない");
}
