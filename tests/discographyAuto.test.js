// 【2026-11-01 r7-home・本人の依頼 5・6】
// ・作品の枠（discography.js の DISCOGRAPHY）が songs.js の workId から自動で作られ、新しいシングル（22nd）を
//   songs.js に足すだけで、作品一覧・年表・全体検索・収録曲一覧・歴代センター・周年ヒストリーの作品リンク・
//   ホームの「シングル○枚」が増えること（テストの中で仮の 22nd を足して確かめる。本物のデータは変えない）
// ・楽曲の数（84曲）とシングルの数（21枚）を混ぜないこと
// ・「20枚」「21枚目以降」などの固定の文が残っていないこと
// ・ホームの楽曲エリア（「曲を聴く」が主役）の作りと、ボタンの行き先が今までと同じこと
import { assertEqual } from "./test-utils.js";
import { SONGS, CATEGORY, DIFFICULTY } from "../js/data/songs.js";
import { DISCOGRAPHY, WORK_TYPE, buildDiscographyEntries, resolveWorkType } from "../js/data/discography.js";
import { buildWorkSummaries } from "../js/discographyScreen.js";
import { buildHomeInfoStats, HOME_ACTIONS, runHomeAction } from "../js/homeScreen.js";
import { buildAppSearchEntries, searchAppEntries, buildWorkNumberAliases } from "../js/appSearchIndex.js";
import { initCdSalesScreen, openCdSalesScreen } from "../js/cdSalesScreen.js";
import { formatCertificationBadge } from "../js/cdSalesModel.js";
import { buildSongGroups } from "../js/songGrouping.js";
import { relatedTargets } from "../js/anniversaryHistoryModel.js";
import { buildCenterTableModel } from "../js/centerTable.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

const singleIdsInSongs = () => [...new Set(SONGS.map((song) => song.workId).filter((id) => /^single-/.test(id ?? "")))];

// テストの中だけの仮の 22nd（本物の songs.js には足さない）
const FAKE_22ND = {
  id: "test-fake-22nd-title",
  workId: "single-22",
  title: "テスト用の仮の22nd",
  searchReading: "てすとようのかりの",
  category: CATEGORY.TITLE_TRACK,
  releaseDate: "2027-03-03",
  single: "22ndシングル「テスト用の仮の22nd」",
  difficulty: DIFFICULTY.NORMAL,
  introLeadInSec: 0,
  center: ["全員"],
  centerType: "all",
};

function runDiscographyAutoTests() {
  console.log("--- r7-home：作品の枠は songs.js から自動（21st・22nd） ---");
  const singles = DISCOGRAPHY.filter((entry) => entry.type === WORK_TYPE.SINGLE);
  assertEqual(singles.length, singleIdsInSongs().length, "作品の枠のシングルの数 = songs.js に出てくるシングルの数");
  assertEqual(singles.length, 21, "今のデータではシングルは21作（1st〜21st）");
  assertEqual(singles.map((entry) => entry.workId), Array.from({ length: 21 }, (_, i) => `single-${String(i + 1).padStart(2, "0")}`), "シングルは番号順（1st〜21st）");
  assertEqual(singles.at(-1).workId, "single-21", "最新のシングルの枠は 21st");
  assertEqual(DISCOGRAPHY.map((entry) => entry.workId).slice(21), ["album-01", "digital-01", "digital-02", "digital-03", "digital-04", "special-866"], "シングルのあと：アルバム → 配信限定 → 特別枠（今までと同じ並び）");
  assertEqual(DISCOGRAPHY.length, new Set(SONGS.map((song) => song.workId).filter(Boolean)).size, "songs.js のどの作品にも枠がある（漏れなし）");
  assertEqual(new Set(DISCOGRAPHY.map((entry) => entry.workId)).size, DISCOGRAPHY.length, "作品の枠に重複が無い");
  assertEqual(DISCOGRAPHY.find((entry) => entry.workId === "single-21")?.centerNote?.includes("公式のセンター発表は未確認"), true, "21st のセンターの注記は残る");
  assertEqual(DISCOGRAPHY.filter((entry) => entry.centerNote).map((entry) => entry.workId), ["single-21"], "センターの注記は 21st だけ");
  assertEqual([resolveWorkType("single-22"), resolveWorkType("album-02"), resolveWorkType("digital-05"), resolveWorkType("special-866"), resolveWorkType("unknown-1"), resolveWorkType(undefined)], ["single", "album", "digital", "special", null, null], "workId の頭から種類を決める（知らない頭は枠にしない）");

  // 仮の 22nd を足す
  const grownSongs = [...SONGS, FAKE_22ND];
  const grown = buildDiscographyEntries(grownSongs);
  assertEqual(grown.filter((entry) => entry.type === "single").length, 22, "22nd：songs.js に曲を足すだけで、シングルの枠が22作に");
  assertEqual(grown.filter((entry) => entry.type === "single").at(-1).workId, "single-22", "22nd：最新のシングルの枠が 22nd");
  assertEqual(grown.indexOf(grown.find((entry) => entry.workId === "single-22")), 21, "22nd：シングルの最後（アルバムより前）に入る");
  assertEqual(buildDiscographyEntries([...SONGS, { ...FAKE_22ND, id: "test-fake-22nd-c/w" }, FAKE_22ND]).length, DISCOGRAPHY.length + 1, "22nd：同じ作品の曲が2曲あっても枠は1つ");
  assertEqual(buildDiscographyEntries([...SONGS, { ...FAKE_22ND, workId: "single-100" }]).filter((e) => e.type === "single").at(-1).workId, "single-100", "番号は数で並べる（single-100 も最後）");

  // 作品一覧（作品の情報・発売日順の最後が最新作）
  const summaries = buildWorkSummaries(grownSongs, grown);
  const work22 = summaries.find((work) => work.workId === "single-22");
  assertEqual([work22?.title, work22?.releaseDate, work22?.songs.length], ["テスト用の仮の22nd", "2027-03-03", 1], "22nd：作品一覧・作品詳細の題名・発売日・収録曲が songs.js から");
  const ascending = [...summaries].sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
  assertEqual(ascending.at(-1).workId, "single-22", "22nd：作品一覧（発売日順）のいちばん下が 22nd");
  const realAscending = [...buildWorkSummaries(SONGS, DISCOGRAPHY)].sort((a, b) => (a.releaseDate ?? "").localeCompare(b.releaseDate ?? ""));
  assertEqual([realAscending.at(-1).workId, realAscending.at(-1).title], ["single-21", "恋、はじめました。"], "今のデータ：作品一覧のいちばん下は 21st「恋、はじめました。」");

  // ホームの件数（シングルの数と楽曲の数を混ぜない）
  const real = buildHomeInfoStats({ discography: DISCOGRAPHY, songs: SONGS });
  assertEqual(real.worksSub, `シングル21枚|・アルバム1枚`, "ホーム：シングル21枚・アルバム1枚");
  assertEqual(real.songsSub, `${SONGS.length}曲の|歌詞・曲の情報`, "ホーム：楽曲一覧は曲の数（シングルの数ではない）");
  assertEqual(real.songsSub.includes("21"), false, "ホーム：楽曲の数の所にシングルの数（21）が入っていない");
  assertEqual(real.worksSub.includes(String(SONGS.length)), false, "ホーム：シングルの数の所に曲の数が入っていない");
  const grownStats = buildHomeInfoStats({ discography: grown, songs: grownSongs });
  assertEqual([grownStats.worksSub, grownStats.songsSub], [`シングル22枚|・アルバム1枚`, `${SONGS.length + 1}曲の|歌詞・曲の情報`], "22nd：ホームの「シングル22枚」・曲の数も1つ増える（別々に数える）");

  // 収録曲一覧（新しいシングルが先頭・開いた状態の対象）
  assertEqual(buildSongGroups(SONGS)[0].key, "single-21", "収録曲一覧：今のデータでは先頭が 21st");
  assertEqual([buildSongGroups(grownSongs)[0].key, buildSongGroups(grownSongs)[0].label], ["single-22", "22nd テスト用の仮の22nd"], "22nd：収録曲一覧の先頭（最新）が 22nd");

  // 歴代センター
  const centerGroups = buildCenterTableModel(grownSongs, { discography: grown }).groups;
  assertEqual(centerGroups.some((group) => group.workId === "single-22" && group.kind === "single"), true, "22nd：歴代センターに 22nd の行が出る");
  assertEqual(buildCenterTableModel(SONGS, { discography: DISCOGRAPHY }).groups.some((group) => group.workId === "single-21"), true, "今のデータ：歴代センターに 21st");

  // 周年ヒストリーの作品リンク
  const workIds = new Set(grown.map((entry) => entry.workId));
  assertEqual(relatedTargets({ related: { workId: "single-22" } }, { workIds }).map((target) => target.kind), ["work"], "22nd：周年ヒストリーの出来事から作品へのリンクが出る");
  assertEqual(relatedTargets({ related: { workId: "single-21" } }, { workIds: new Set(DISCOGRAPHY.map((entry) => entry.workId)) }).map((target) => target.kind), ["work"], "今のデータ：21st の出来事から作品へ");

  // 全体検索
  const entries = buildAppSearchEntries({ songs: grownSongs, discographyEntries: grown });
  assertEqual(entries.some((entry) => entry.key === "work:single-22"), true, "22nd：全体検索に作品が出る");
  assertEqual(searchAppEntries(entries, "テスト用の仮の22nd").results.some(({ entry }) => entry.key === "work:single-22"), true, "22nd：曲名で検索すると作品が見つかる");
  const realEntries = buildAppSearchEntries();
  assertEqual(searchAppEntries(realEntries, "21st").results.some(({ entry }) => entry.key === "work:single-21"), true, "今のデータ：「21st」で 21st の作品が見つかる");
}

async function runNoFixedCountTests() {
  console.log("--- r7-home：「20枚」などの固定の数が残っていない ---");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const visible = doc.body.textContent;
  ["シングル20枚", "20枚", "20作", "1st〜20th", "20thまで", "21枚目以降"].forEach((word) => {
    assertEqual(visible.includes(word), false, `index.html の表示の文に「${word}」が無い`);
  });
  const disco = await fetchText("js/data/discography.js");
  assertEqual(/length:\s*\d+\s*}/.test(disco.replace(/\/\/.*$/gm, "")), false, "discography.js にシングルの数を手で書いていない（Array.from({ length: N }) が無い）");
  assertEqual(disco.includes("buildDiscographyEntries(SONGS)"), true, "discography.js は songs.js から作品の枠を作る");
  const home = await fetchText("js/homeScreen.js");
  assertEqual(home.includes('discography.filter((work) => work.type === "single").length'), true, "ホームのシングルの数は作品の枠から数える");
  const guide = await fetchText("js/data/guideContent.js");
  assertEqual(/シングル\s*\d+\s*枚|\d+\s*作品/.test(guide), false, "使い方ガイドに作品の数を固定で書いていない");
}

async function runHomeMusicCardTests() {
  console.log("--- r7-home：ホームの楽曲エリア（「曲を聴く」が主役） ---");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const card = doc.getElementById("home-card-music");
  const actions = [...card.querySelectorAll("button")].map((button) => button.dataset.homeAction);
  assertEqual(actions, ["continuous-play", "playlists", "favorites", "songlist", "works", "lyrics-search"], "楽曲：ボタンの数と並び（行き先）は今までと同じ6つ");
  const hero = card.querySelector(".home-music-hero");
  assertEqual(hero?.dataset.homeAction, "continuous-play", "主役は「曲を聴く」（連続再生へ。行き先は今までと同じ）");
  assertEqual(hero?.querySelector("b")?.textContent, "曲を聴く", "主役の題名は「曲を聴く」");
  assertEqual(hero?.querySelector("small")?.textContent, "好きな曲を、続けて再生", "主役の短い誘導文");
  assertEqual(card.querySelectorAll(".home-music-hero").length, 1, "主役は1つだけ");
  assertEqual(Boolean(hero?.querySelector(".home-music-hero-disc") && hero?.querySelector(".home-music-hero-notes") && hero?.querySelector(".home-music-play use[href='#hi-play']")), true, "主役にレコード・音符・再生マーク（CSS・SVG）");
  assertEqual(hero?.querySelectorAll(".home-music-wave i").length, 12, "主役に波形（12本）");
  assertEqual([...hero.querySelectorAll(".home-music-hero-disc, .home-music-hero-notes, .home-music-wave, .home-music-play")].every((element) => element.getAttribute("aria-hidden") === "true"), true, "飾りは読み上げない（aria-hidden）");
  assertEqual(card.querySelectorAll("img").length, 0, "画像（他人のアルバム画像など）は使わない");
  assertEqual([...card.querySelectorAll(".home-music-col-title")].map((element) => element.textContent.trim()), ["聴く", "読む・調べる", "探す"], "聴く／読む・調べる／探す に分ける");
  assertEqual([...card.querySelectorAll(".home-music-col--listen .home-music-item")].map((button) => button.dataset.homeAction), ["playlists", "favorites"], "プレイリスト・お気に入りは「聴く」のサブ");
  assertEqual([...card.querySelectorAll(".home-music-col--read .home-music-item")].map((button) => button.dataset.homeAction), ["songlist", "works"], "楽曲一覧・シングル・アルバムは「読む・調べる」");
  assertEqual([...card.querySelectorAll(".home-music-col--find .home-music-item")].map((button) => button.dataset.homeAction), ["lyrics-search"], "歌詞検索は「探す」");
  assertEqual([card.querySelector("#home-music-songs-sub") !== null, card.querySelector("#home-music-works-sub") !== null], [true, true], "曲の数・作品の数を入れる所（JS が数えて入れる）は残る");
  const symbols = new Set([...doc.querySelectorAll(".home-icon-sprite symbol")].map((symbol) => symbol.id));
  assertEqual([...card.querySelectorAll("use")].map((use) => use.getAttribute("href").slice(1)).filter((id) => !symbols.has(id)), [], "楽曲エリアのアイコンの部品はすべてある");

  const css = await fetchText("css/homeRenewal.css");
  const heroRule = css.slice(css.indexOf(".home-music-hero {"), css.indexOf("}", css.indexOf(".home-music-hero {")));
  assertEqual(heroRule.includes("#c81e63") && heroRule.includes("#5b3fd6"), true, "主役はピンク〜紫のグラデーション");
  assertEqual(css.includes('@media (prefers-reduced-motion: no-preference) {\n  body[data-screen="start"] .home-music-hero-disc::after {'), true, "レコード・波形の動きは「動きを減らす」設定では付けない・ホームの表示中だけ");
  assertEqual(css.includes("@container (min-width: 32rem) {\n  .home-music-cols {"), true, "iPad・PC（カードが広いとき）は左に主役・右に読む・調べる／探す");
  const heroMin = /\.home-music-hero \{[^}]*min-height:\s*(\d+)px/.exec(css)?.[1];
  assertEqual(Number(heroMin) >= 44 && Number(heroMin) <= 110, true, `主役の高さはスマホで大きくしすぎない（${heroMin}px）`);
  const subMin = /\.home-music-item--sub \{[^}]*min-height:\s*(\d+)px/.exec(css)?.[1];
  assertEqual(Number(subMin) >= 44, true, `サブのボタンも押しやすい高さ（${subMin}px 以上）`);
  // 主役の白い文字と地（グラデーションの両端と中間）のコントラスト
  const lum = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (hex) => 1.05 / (lum(hex) + 0.05);
  ["#c81e63", "#a52aa8", "#5b3fd6"].forEach((hex) => assertEqual(ratio(hex) >= 4.5, true, `主役の地 ${hex} と白い文字 ${ratio(hex).toFixed(2)}:1（4.5 以上）`));
}

// ボタンを押したときの行き先（"click" の種類は、楽曲・歌詞の画面の今までのボタンを押す）
function runHomeMusicClickTests() {
  console.log("--- r7-home：楽曲エリアのボタンを押す → 今までのボタンが押される ---");
  const expected = {
    "continuous-play": "continuous-play-link",
    playlists: "playlist-link",
    favorites: "songlist-favorites-link",
    songlist: "songlist-link",
    "lyrics-search": "lyrics-search-link",
  };
  Object.entries(expected).forEach(([action, targetId]) => {
    assertEqual([HOME_ACTIONS[action]?.type, HOME_ACTIONS[action]?.value], ["click", targetId], `「${action}」→ #${targetId} を押す（今までと同じ）`);
    const existing = document.getElementById(targetId);
    const target = existing ?? document.createElement("button");
    if (!existing) {
      target.id = targetId;
      target.hidden = true;
      document.body.appendChild(target);
    }
    let clicked = 0;
    const onClick = (event) => {
      clicked += 1;
      event.stopImmediatePropagation();
    };
    target.addEventListener("click", onClick, { capture: true });
    runHomeAction(action);
    target.removeEventListener("click", onClick, { capture: true });
    if (!existing) target.remove();
    assertEqual(clicked, 1, `「${action}」を押すと #${targetId} が1回押される`);
  });
  assertEqual([HOME_ACTIONS.works?.type, HOME_ACTIONS.works?.value], ["callback", "openDiscographyWorks"], "「シングル・アルバム」→ 作品一覧のタブを開く（今までと同じ）");
}

// 【2026-11-01 r7-home-fix】独立レビューの指摘への直し
async function runReviewFixTests() {
  console.log("--- r7-home-fix：番号の言い方で検索・CD売上の札と要約・棒の読み上げ・iPad 縦の段組み ---");
  // 検索：「21枚目」など
  assertEqual(buildWorkNumberAliases("single-21", "single"), ["21枚目", "21枚目のシングル", "21枚目シングル", "21作目", "シングル21", "21st"], "番号の言い方（シングル）は workId から自動");
  assertEqual(buildWorkNumberAliases("album-01", "album"), ["1枚目のアルバム", "1枚目アルバム", "アルバム1", "1st"], "番号の言い方（アルバム。「1枚目」だけは付けない）");
  assertEqual([buildWorkNumberAliases("digital-02", "digital"), buildWorkNumberAliases("special-866", "special")], [[], []], "配信限定・特別作品には番号の言い方を付けない");
  const entries = buildAppSearchEntries();
  const top = (query) => searchAppEntries(entries, query).results.map(({ entry }) => entry.key);
  assertEqual(top("21枚目")[0], "work:single-21", "「21枚目」で検索すると、先頭が 21st の作品（0件にならない）");
  assertEqual(top("21枚目").includes("cdSales:single-21"), true, "「21枚目」で 21st の売上・チャートも出る");
  assertEqual(top("21枚目のシングル")[0], "work:single-21", "「21枚目のシングル」でも 21st");
  assertEqual(top("2枚目")[0], "work:single-02", "「2枚目」は 2nd（21st・12th などと混ざらない）");
  assertEqual(top("2枚目").includes("work:single-21") || top("2枚目").includes("work:single-12"), false, "「2枚目」で 12th・21st は出ない");
  assertEqual(top("1枚目")[0], "work:single-01", "「1枚目」は 1st シングル");
  assertEqual(top("1枚目のアルバム")[0], "work:album-01", "「1枚目のアルバム」は 1st アルバム");
  assertEqual(top("21枚目 売上")[0], "cdSales:single-21", "「21枚目 売上」は 21st の売上・チャートが先頭");
  assertEqual(DISCOGRAPHY.filter((work) => work.type === "single").every((work) => top(`${Number(work.workId.slice(-2))}枚目`)[0] === work.workId.replace(/^/, "work:")), true, "どのシングルも「N枚目」で、その作品が先頭");
  const grownSongs = [...SONGS, FAKE_22ND];
  const grownEntries = buildAppSearchEntries({ songs: grownSongs, discographyEntries: buildDiscographyEntries(grownSongs) });
  assertEqual(searchAppEntries(grownEntries, "22枚目").results[0]?.entry.key, "work:single-22", "仮の 22nd も「22枚目」で見つかる（データから自動）");

  // CD売上：札・要約・棒
  assertEqual([formatCertificationBadge("ゴールド"), formatCertificationBadge("ダブル・プラチナ"), formatCertificationBadge("プラチナ認定"), formatCertificationBadge(null)], ["ゴールド認定", "ダブル・プラチナ認定", "プラチナ認定", null], "一覧の札は「○○認定」");
  const container = document.createElement("div");
  container.hidden = true;
  document.body.appendChild(container);
  initCdSalesScreen({ container }, {});
  openCdSalesScreen();
  const certs = [...container.querySelectorAll(".cds-item-cert")].map((node) => node.textContent);
  assertEqual(certs.length > 0 && certs.every((text) => text.endsWith("認定")), true, `一覧の札がすべて「認定」付き（${certs.length}件）`);
  assertEqual(certs.includes("ゴールド"), false, "「ゴールド」だけの札が無い");
  const labels = [...container.querySelectorAll(".cds-headline-label")].map((node) => node.textContent);
  assertEqual(labels, ["デビュー作の初週（Billboard）", "初週の自己最高（Billboard）"], "上の要約に Billboard を添える（オリコンの数と取り違えない）");
  const values = [...container.querySelectorAll(".cds-headline-value")].map((node) => node.textContent);
  assertEqual(values[1], "503,043枚", "初週の自己最高は Billboard の 503,043枚のまま");
  const bars = [...container.querySelectorAll(".cds-bar")];
  assertEqual(bars.length, 21, "グラフの棒は21本");
  assertEqual(bars.every((bar) => bar.getAttribute("aria-label")?.includes("初週") && [...bar.children].every((child) => child.getAttribute("aria-hidden") === "true")), true, "棒の名前は aria-label、中の数と番号は読み上げない");
  assertEqual(bars.some((bar) => /\d(st|nd|rd|th)/.test(bar.textContent.replace(/(\d+\.\d)万枚、/, ""))) && bars.every((bar) => !/\d\.\d\d+(st|nd|rd|th)/.test(bar.textContent)), true, "棒の中の文字が「2.21st」のようにつながらない（数のあとに区切り）");
  assertEqual(bars[0].textContent, "2.2万枚、1st", "1st の棒の文字：「2.2万枚、1st」");
  container.remove();

  // iPad 縦（1024px・カード2列）：楽曲のカードを低くし、ライブのカードの空きを埋める
  const css = await fetchText("css/homeRenewal.css");
  assertEqual(css.includes("@container (min-width: 26rem) and (max-width: 31.99rem) {\n  .home-music-cols {\n    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);"), true, "中くらいの幅（iPad 縦の2列）は読む・調べると探すを1段に");
  const wide = css.slice(css.lastIndexOf("@media (min-width: 1024px) {"));
  assertEqual(wide.includes(".home-card--live {\n    display: flex;\n    flex-direction: column;") && wide.includes(".home-card--live .home-live-main.home-live-main--learn {\n    flex: 1 0 auto;"), true, "1024px 以上：ライブのカードの「コールを覚える」が伸びて、下に紫の空きを作らない");
}

export async function runDiscographyAutoAndHomeMusicTests() {
  runDiscographyAutoTests();
  await runNoFixedCountTests();
  await runHomeMusicCardTests();
  runHomeMusicClickTests();
  await runReviewFixTests();
}
