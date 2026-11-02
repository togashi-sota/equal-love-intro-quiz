// 【2026-11-02新設】「CD・特典映像図鑑」の回帰テスト。
// データ（作品・TYPE の数、songs.js との一致、品番・URL の形、関連の言葉は公式の題名にある言葉だけ、画像を持たない、再収録の結び付き）、
// 絞り込み（分類・言葉。「富士山」と「富士急」を取り違えない）、画面（一覧・特典映像から探す・詳細の TYPE のタブ・映像特典なし・
// 続きの映像・別の作品へ移って戻る・条件を保つ）、入口（ホーム・全体検索・openCdBonus・浮く戻る・Service Worker）を確かめる。
import { CD_BONUS_WORKS, CD_BONUS_CATEGORIES, CD_BONUS_SERIES, CD_BONUS_OTHER_RELEASES, CD_BONUS_CHECKED_AT } from "../js/data/cdBonus.js";
import { SONGS } from "../js/data/songs.js";
import { MEMBERS } from "../js/data/members.js";
import {
  CD_BONUS_ORDER,
  CD_BONUS_ALL,
  ordinal,
  cdBonusWorkLabel,
  buildCdBonusVideoIndex,
  countCdBonusVideosByCategory,
  describeCdBonusVideoHomes,
  filterCdBonusVideos,
  findCdBonusSeriesSiblings,
  findCdBonusVideo,
  sortCdBonusWorks,
  summarizeCdBonusTypeVideos,
  summarizeCdBonusWork,
  isBonusVideo,
  canShowCdBonusJacket,
} from "../js/cdBonusModel.js";
import {
  initCdBonusScreen,
  openCdBonusList,
  renderCdBonusDetail,
  goBackInCdBonusDetail,
  getCdBonusState,
  resetCdBonusListState,
  openCdBonus,
  setCdBonusNavigator,
} from "../js/cdBonusScreen.js";
import { buildAppSearchEntries, searchAppEntries, APP_SEARCH_CATEGORIES } from "../js/appSearchIndex.js";
import { APP_SEARCH_FEATURES } from "../js/data/appSearchFeatures.js";
import { isFloatingBackScreen } from "../js/floatingBack.js";
import { normalizeSearchText } from "../js/searchNormalize.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const allTypes = () => CD_BONUS_WORKS.flatMap((work) => work.types.map((type) => ({ work, type })));
const allVideos = () => buildCdBonusVideoIndex();

function runDataTests() {
  const works = CD_BONUS_WORKS;
  assertEqual(/^\d{4}-\d{2}-\d{2}$/.test(CD_BONUS_CHECKED_AT), true, "データ：調べた日がある");
  assertEqual(works.filter((work) => work.kind === "single").map((work) => work.number), Array.from({ length: 21 }, (_, index) => index + 1), "データ：1st〜21st シングルが番号順にそろう");
  assertEqual(works.filter((work) => work.kind === "album").map((work) => work.workId), ["album-01"], "データ：アルバム「全部、内緒。」");
  assertEqual(
    works.map((work) => work.types.length),
    [3, 3, 3, 3, 3, 4, 4, 4, 3, 4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6],
    "データ：TYPE の数は作品ごとに違う（A〜F と決めつけない。公式サイトの TYPE の数）"
  );
  assertEqual(allTypes().length, 96, "データ：TYPE は全部で96");
  // songs.js と食い違わない（番号・作品名・発売日・曲）
  works.forEach((work) => {
    const songs = SONGS.filter((song) => song.workId === work.workId);
    assertEqual(songs.length > 0, true, `データ：${work.workId} は songs.js の作品`);
    assertEqual(songs.every((song) => song.releaseDate === work.releaseDate), true, `データ：${work.workId} の発売日は songs.js と同じ`);
    const label = cdBonusWorkLabel(work);
    assertEqual(songs.some((song) => normalizeSearchText(song.single).includes(normalizeSearchText(label)) && normalizeSearchText(song.single).includes(normalizeSearchText(work.title))), true, `データ：${label}「${work.title}」は songs.js の表記と同じ番号・作品名`);
    const onCd = new Set(work.types.flatMap((type) => type.tracks.filter((track) => !track.instrumental && !track.version).map((track) => track.songId)));
    assertEqual(songs.filter((song) => !onCd.has(song.id)).map((song) => song.title), [], `データ：${work.workId} の songs.js の曲は、どれかの TYPE の CD に入っている`);
  });
  const songIds = new Set(SONGS.map((song) => song.id));
  assertEqual(allTypes().every(({ type }) => type.tracks.every((track) => !track.songId || songIds.has(track.songId))), true, "データ：CD の曲の songId は songs.js の曲");
  // TYPE の形
  const formats = new Set(["CD+DVD", "CD+Blu-ray", "CD のみ"]);
  allTypes().forEach(({ work, type }) => {
    const where = `${work.workId} ${type.name}`;
    assertEqual(type.name === `Type-${type.id}` && /^[A-F]$/.test(type.id), true, `データ：${where} の TYPE 名`);
    assertEqual(formats.has(type.format), true, `データ：${where} の形（${type.format}）`);
    assertEqual(/^VVCL-\d{4}(〜\d{4})?$/.test(type.catalog), true, `データ：${where} の品番の形（${type.catalog}）`);
    assertEqual(/^https:\/\/equal-love\.jp\/discography\/detail\/\d+\/$/.test(type.officialUrl), true, `データ：${where} の公式サイトの URL`);
    assertEqual(type.sonyUrl === null || /^https:\/\/www\.sonymusic\.co\.jp\/artist\/equal-love\/discography\/VVCL-\d{4}$/.test(type.sonyUrl), true, `データ：${where} のソニーの URL`);
    assertEqual(["both", "official"].includes(type.check), true, `データ：${where} の確認の状態`);
    assertEqual(type.tracks.length > 0, true, `データ：${where} に CD の曲がある`);
    if (type.format === "CD のみ") assertEqual(type.videos.length === 0 && type.disc === null, true, `データ：${where} は CD だけ（映像なし）`);
    else assertEqual(type.videos.length > 0 && ["DVD", "Blu-ray"].includes(type.disc) && type.format.endsWith(type.disc), true, `データ：${where} は映像あり（${type.disc}）`);
    assertEqual(type.edition === null || ["official", "sony"].includes(type.editionSource), true, `データ：${where} の仕様には出典がある`);
  });
  assertEqual(new Set(allTypes().map(({ type }) => type.officialUrl)).size, 96, "データ：公式サイトのページは TYPE ごとに別");
  assertEqual(new Set(allTypes().map(({ type }) => type.catalog)).size, 96, "データ：品番が重ならない");
  // 映像
  const videos = allVideos();
  const categoryIds = new Set(CD_BONUS_CATEGORIES.map((category) => category.id));
  assertEqual(new Set(videos.map(({ video }) => video.id)).size, videos.length, `データ：映像の id が重ならない（${videos.length}本）`);
  assertEqual(videos.every(({ video, work, type }) => video.id.startsWith(`${work.workId}-${type.id}-`)), true, "データ：映像の id は作品と TYPE から");
  assertEqual(videos.every(({ video }) => video.categories.length > 0 && video.categories.every((id) => categoryIds.has(id))), true, "データ：映像の分類は決まったもの");
  const notInTitle = videos.flatMap(({ video }) => (video.keywords ?? []).filter((keyword) => !normalizeSearchText(`${video.title}${video.group ?? ""}`).includes(normalizeSearchText(keyword))).map((keyword) => `${video.id}:${keyword}`));
  assertEqual(notInTitle, [], "データ：関連の言葉は、公式の題名・見出しに出てくる言葉だけ（公式に無い細部を作らない）");
  assertEqual(videos.some(({ video }) => (video.keywords ?? []).includes("富士山")), false, "データ：「富士山」は公式の題名に無いので付けない");
  // 分類（2026-11-03 本人の決定：名前だけで中身が分かる分類に作り直し）
  assertEqual(CD_BONUS_CATEGORIES.map((category) => category.label), ["ロケ・旅行", "ゲーム・企画", "メイキング", "ライブ・パフォーマンス", "テレビ番組", "イベント", "MV", "その他"], "データ：分類の一覧");
  assertEqual(CD_BONUS_CATEGORIES.every((category) => typeof category.lead === "string" && category.lead.length >= 8), true, "データ：分類ごとに短い説明");
  const categoryCounts = Object.fromEntries(CD_BONUS_CATEGORIES.map((category) => [category.id, videos.filter(({ video }) => video.categories.includes(category.id)).length]));
  assertEqual(categoryCounts, { trip: 21, variety: 10, making: 26, live: 37, tv: 45, event: 5, mv: 35, other: 13 }, "データ：分類ごとの本数（1本に複数の分類あり）");
  assertEqual(videos.filter(({ video }) => video.categories.includes("other")).every(({ video }) => /制服クリスマス|Documentary of/.test(video.title)), true, "データ：「その他」は、題名だけでは分けられない映像（制服クリスマス・ドキュメンタリーの総集編）だけ");
  assertEqual(videos.filter(({ video }) => (video.group ?? "").includes("キミは＝LOVEを愛せるか")).every(({ video }) => video.categories.includes("tv")), true, "データ：『キミは＝LOVEを愛せるか!!!』の Blu-ray の映像は、どれも「テレビ番組」");
  // ジャケットの入れ物（2026-11-03 本人の決定：今は画像なし）
  assertEqual(allTypes().every(({ type }) => Object.hasOwn(type, "jacket") && type.jacket === null), true, "データ：TYPE ごとにジャケットの入れ物があり、今は全部 null（画像なし）");
  assertEqual(
    [canShowCdBonusJacket(null), canShowCdBonusJacket({ imageUrl: "https://example.invalid/a.jpg", sourceUrl: "https://equal-love.jp/" }), canShowCdBonusJacket({ imageUrl: "https://example.invalid/a.jpg", sourceUrl: "https://equal-love.jp/", terms: "許諾あり", termsUrl: "https://equal-love.jp/terms" })],
    [false, false, true],
    "データ：ジャケットは、出典と利用条件がそろったときだけ出せる"
  );
  const memberIds = new Set(MEMBERS.map((member) => member.id));
  assertEqual(videos.every(({ video }) => (video.memberIds ?? []).every((id) => memberIds.has(id)) && (!video.memberIds || Boolean(video.membersBasis))), true, "データ：メンバーは members.js の id で、根拠がある");
  assertEqual(videos.every(({ video }) => !video.songId || songIds.has(video.songId)), true, "データ：映像の曲は songs.js の曲");
  assertEqual(videos.every(({ video }) => !video.series || Boolean(CD_BONUS_SERIES[video.series])), true, "データ：続き物の名前がある");
  Object.keys(CD_BONUS_SERIES).forEach((seriesId) => {
    assertEqual(videos.filter(({ video }) => video.series === seriesId).length >= 2, true, `データ：続き物「${seriesId}」は2本以上`);
  });
  // 再収録
  const links = videos.flatMap(({ video }) => (video.alsoOn ?? []).map((entry) => ({ video, entry })));
  assertEqual(links.every(({ entry }) => ["stated", "sameTitle", "unverified"].includes(entry.match)), true, "データ：再収録の確かさの印");
  assertEqual(links.every(({ entry }) => (entry.videoId ? Boolean(findCdBonusVideo(entry.videoId)) : Boolean(CD_BONUS_OTHER_RELEASES[entry.release]))), true, "データ：再収録の行き先がある");
  const stated = links.filter(({ entry }) => entry.match === "stated");
  assertEqual(stated.length, 9, "データ：公式に再収録と書いてある特典映像（MV 集の Disc 4・5）は9本");
  assertEqual(stated.every(({ video }) => /^(album-01|single-(09|10|11|12))-/.test(video.id)), true, "データ：再収録は「1stアルバム、9th〜12thシングル」の特典映像だけ（公式の説明のとおり）");
  // 画像を持たない
  const json = JSON.stringify(CD_BONUS_WORKS);
  assertEqual(/\.(jpe?g|png|webp|gif)\b/i.test(json) || /plusmember|adm_image|jacket_image/i.test(json), false, "データ：ジャケットの画像・画像の URL を持たない");
  // songs.js の TYPE の注記（「収録（Type-A/E）」など）は、公式の TYPE と一致する（2026-11-03 に 3rd・12th・14th・15th を直した）
  SONGS.filter((song) => /（Type-/.test(song.single ?? "")).forEach((song) => {
    const note = /（(Type-[^）]*)）$/.exec(song.single)?.[1] ?? "";
    const noted = [...note.matchAll(/(?:Type-|\/)([A-F])/g)].map((match) => match[1]).sort();
    const work = works.find((entry) => entry.workId === song.workId);
    const official = work.types.filter((type) => type.tracks.some((track) => track.songId === song.id && !track.instrumental && !track.version)).map((type) => type.id).sort();
    assertEqual(noted, official, `データ：songs.js「${song.title}」の TYPE の注記（${note}）が公式の TYPE と同じ`);
  });
  assertEqual(SONGS.some((song) => /通常盤/.test(song.single ?? "")), false, "データ：songs.js に公式に無い「通常盤」の書き方が無い（15th は公式の表記 Type-E〈CD Only〉）");
  // 人狼
  const jinro = videos.filter(({ video }) => video.title.includes("人狼"));
  assertEqual(jinro.map(({ work, type }) => `${work.workId}:${type.id}`), ["single-09:B", "single-09:C"], "データ：人狼ゲームは 9th「ウィークエンドシトロン」の Type-B と Type-C");
}

function runModelTests() {
  assertEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd"], "モデル：番号の書き方");
  assertEqual(sortCdBonusWorks(CD_BONUS_WORKS, CD_BONUS_ORDER.OLD)[0].workId, "single-01", "モデル：古い順は 1st から");
  assertEqual(sortCdBonusWorks(CD_BONUS_WORKS, CD_BONUS_ORDER.NEW)[0].workId, "single-21", "モデル：新しい順は 21st から");
  assertEqual(sortCdBonusWorks(CD_BONUS_WORKS).findIndex((work) => work.workId === "album-01"), 8, "モデル：アルバムは発売日の順（8th と 9th の間）");
  const flat = (groups) => groups.flatMap((group) => group.rows.map((row) => row.video.id));
  assertEqual(flat(filterCdBonusVideos({ query: "人狼" })), ["single-09-B-1", "single-09-C-1"], "モデル：「人狼」で2本");
  assertEqual(flat(filterCdBonusVideos({ query: "富士山" })), [], "モデル：「富士山」では何も出ない（富士急の映像を出さない）");
  const fujiq = flat(filterCdBonusVideos({ query: "富士急" }));
  assertEqual(fujiq.length, 16, "モデル：「富士急」で富士急ハイランドのライブ16本（劇薬中毒 Type-B 6・Type-C 6、恋、はじめました。Type-C 4）");
  assertEqual(flat(filterCdBonusVideos({ query: "ふじきゅう" })).length, 0, "モデル：読み仮名の言い換えはしない（公式の表記の言葉だけ）");
  assertEqual(flat(filterCdBonusVideos({ query: "河口湖" })), ["single-19-B-1", "single-19-C-1"], "モデル：「河口湖」で前編・後編");
  assertEqual(flat(filterCdBonusVideos({ query: "沖縄", order: CD_BONUS_ORDER.NEW })), ["single-12-B-1", "single-12-C-1"], "モデル：「沖縄」で DAY-1・DAY-2");
  assertEqual(flat(filterCdBonusVideos({ query: "諸橋沙夏" })).includes("single-15-D-1"), true, "モデル：題名に名前がある映像は、メンバーの名前で見つかる");
  const games = filterCdBonusVideos({ category: "variety" });
  assertEqual(["single-09-B-1", "single-10-B-1", "single-11-B-1", "single-06-B-1", "album-01-B-1", "single-19-B-1"].every((id) => flat(games).includes(id)), true, "モデル：分類「ゲーム・企画」に人狼・鬼ごっこ・イレブンHOUSE・大運動会・初体験チャレンジ・最強ペア決定戦");
  assertEqual(flat(filterCdBonusVideos({ query: "企画" })).length, 10, "モデル：分類の名前の1語（「企画」）でも、ぴったりで当たる");
  assertEqual(flat(filterCdBonusVideos({ query: "テレビ番組" })).includes("single-18-E-1"), true, "モデル：TVアニメのオープニング映像は「テレビ番組」");
  assertEqual(flat(filterCdBonusVideos({})).every((id) => isBonusVideo(findCdBonusVideo(id).video)), true, "モデル：初めは MV 以外");
  assertEqual(flat(filterCdBonusVideos({ category: CD_BONUS_ALL })).length, allVideos().length, "モデル：「すべて」は全部の映像");
  const counts = countCdBonusVideosByCategory();
  assertEqual(CD_BONUS_CATEGORIES.every((category) => counts[category.id] > 0), true, `モデル：どの分類にも映像がある（${JSON.stringify(counts)}）`);
  // この映像はどこに入っている？
  const homes = describeCdBonusVideoHomes("single-09-B-1");
  assertEqual(homes[0], { kind: "type", workId: "single-09", typeId: "B", videoId: "single-09-B-1", match: "self" }, "モデル：まずその TYPE");
  assertEqual(homes.some((home) => home.kind === "release" && home.releaseId === "mv-kakosaijo-kyun" && home.match === "stated"), true, "モデル：MV 集の完全生産限定盤にも（公式に再収録と書いてある）");
  assertEqual(findCdBonusSeriesSiblings("single-09-B-1").map((row) => row.video.id), ["single-09-C-1"], "モデル：続きの映像（人狼 Ⅱ）");
  // 完全版とダイジェストを同じものにまとめない：番組のダイジェストは月ごとに別の映像
  const digests = allVideos().filter(({ video }) => video.categories.includes("tv") && video.title.includes("ダイジェスト"));
  assertEqual(new Set(digests.map(({ video }) => video.id)).size === digests.length && digests.length >= 20, true, `モデル：番組ダイジェストは放送月ごとに1本ずつ（${digests.length}本）`);
  const typeD = CD_BONUS_WORKS.find((work) => work.workId === "single-09").types.find((type) => type.id === "D");
  assertEqual(summarizeCdBonusTypeVideos(typeD), { has: false, text: "映像特典なし" }, "モデル：映像が無い TYPE は「映像特典なし」");
  const summary = summarizeCdBonusWork(CD_BONUS_WORKS.find((work) => work.workId === "single-09"));
  assertEqual([summary.typeCount, summary.videoTypeIds, summary.bonusTypeIds], [4, ["A", "B", "C"], ["A", "B", "C"]], "モデル：作品の要約（TYPE の数・映像つき・MV 以外の映像つき〈メイキングも特典映像に数える〉）");
}

function makeContainers() {
  const list = document.createElement("div");
  const detail = document.createElement("div");
  [list, detail].forEach((element) => {
    element.style.position = "absolute";
    element.style.left = "-9999px";
    document.body.appendChild(element);
  });
  return { list, detail };
}

function runScreenTests() {
  const { list, detail } = makeContainers();
  const opened = [];
  try {
    resetCdBonusListState();
    initCdBonusScreen({ listContainer: list, detailContainer: detail }, { onOpenDetail: (target) => opened.push(target) });
    openCdBonusList();
    assertEqual(list.querySelectorAll(".cdb-work-card").length, 22, "画面：作品のカードが22枚");
    assertEqual(list.querySelector(".cdb-work-card").dataset.workId, "single-01", "画面：初めは古い順（1st から）");
    assertEqual(list.querySelectorAll("img, picture, iframe, video").length, 0, "画面：ジャケットの画像を出さない");
    assertEqual(list.querySelector('.cdb-work-card[data-work-id="single-09"] .cdb-work-types').textContent, "TYPE 4種", "画面：カードに TYPE の数");
    assertEqual(list.querySelector('.cdb-work-card[data-work-id="single-01"] .cdb-work-bonus').textContent, "特典映像：＝LOVE メイキング映像", "画面：カードに特典映像の題名（MV 以外）");
    assertEqual(list.querySelector('.cdb-work-card[data-work-id="single-09"] .cdb-work-bonus').textContent.startsWith("特典映像：イコラブ社員研修 人狼ゲーム"), true, "画面：カードの特典映像は、メイキングより企画の映像を先に");
    list.querySelector('.cdb-order-button[data-order="new"]').click();
    assertEqual(list.querySelector(".cdb-work-card").dataset.workId, "single-21", "画面：新しい順");
    list.querySelector('.cdb-work-card[data-work-id="single-09"]').click();
    assertEqual(opened.at(-1), { workId: "single-09" }, "画面：作品を押すとその作品の詳細へ");
    // 特典映像から探す
    list.querySelector('.cdb-tab[data-tab="videos"]').click();
    assertEqual(list.querySelector('.cdb-tab[data-tab="videos"]').getAttribute("aria-selected"), "true", "画面：［特典映像から探す］");
    assertEqual(list.querySelector(".cdb-video-controls").hidden, false, "画面：分類と言葉の欄が出る");
    const input = list.querySelector(".cdb-search");
    input.value = "人狼";
    input.dispatchEvent(new Event("input"));
    const results = [...list.querySelectorAll(".cdb-result")];
    assertEqual(results.map((button) => button.dataset.videoId), ["single-09-B-1", "single-09-C-1"], "画面：「人狼」で 9th の Type-B・C");
    assertEqual(list.querySelector(".cdb-result-work-title").textContent, "ウィークエンドシトロン", "画面：結果は作品ごと（作品 → TYPE → 映像）");
    list.querySelector('.cdb-category[data-category="variety"]').click();
    assertEqual(list.querySelector(".cdb-category-lead").textContent.startsWith("ゲーム・企画："), true, "画面：選んだ分類の短い説明を出す");
    assertEqual([...list.querySelectorAll(".cdb-result")].map((button) => button.dataset.videoId), ["single-09-B-1", "single-09-C-1"], "画面：分類と言葉で絞る");
    list.querySelector('.cdb-category[data-category="bonus"]').click();
    assertEqual(results[0].querySelector(".cdb-result-where").textContent, "Type-B（CD+DVD・初回仕様限定盤）に収録", "画面：どの TYPE に入っているか");
    assertEqual(results[0].querySelector(".cdb-result-also")?.textContent.includes("過去最上キュン"), true, "画面：再収録も出す");
    results[0].click();
    assertEqual(opened.at(-1), { workId: "single-09", typeId: "B", videoId: "single-09-B-1" }, "画面：映像を押すと、その作品・TYPE・映像へ");
    input.value = "富士山";
    input.dispatchEvent(new Event("input"));
    assertEqual(list.querySelectorAll(".cdb-result").length === 0 && Boolean(list.querySelector(".cdb-empty")), true, "画面：「富士山」は0本（富士急を出さない）と案内");
    input.value = "人狼";
    input.dispatchEvent(new Event("input"));
    // 詳細
    renderCdBonusDetail({ workId: "single-09", videoId: "single-09-C-1" });
    assertEqual(detail.querySelector(".cdb-type-tab.is-active")?.dataset.typeId, "C", "詳細：映像から開くと、その TYPE のタブ");
    assertEqual(Boolean(detail.querySelector('.cdb-video[data-video-id="single-09-C-1"]')), true, "詳細：その映像がある");
    assertEqual(detail.querySelectorAll(".cdb-matrix-row").length, 4, "詳細：「どの TYPE に、どの映像？」に TYPE が4つ");
    assertEqual(detail.querySelector('.cdb-matrix-row[data-type-id="D"] .cdb-matrix-videos').textContent, "映像特典なし", "詳細：映像の無い TYPE は「映像特典なし」");
    assertEqual(detail.querySelector('.cdb-matrix-row[data-type-id="B"] .cdb-matrix-videos').textContent, "イコラブ社員研修 人狼ゲーム Ⅰ 嘘つき編", "詳細：表で、映像がどの TYPE かが一目で分かる");
    detail.querySelector('.cdb-type-tab[data-type-id="D"]').click();
    assertEqual(detail.querySelector(".cdb-novideo")?.textContent.startsWith("映像特典なし"), true, "詳細：Type-D は「映像特典なし」");
    assertEqual(detail.querySelectorAll(".cdb-track").length, 8, "詳細：Type-D の CD は8曲");
    assertEqual(Boolean(detail.querySelector('.cdb-link.is-official[href="https://equal-love.jp/discography/detail/38/"]')), true, "詳細：公式サイトのページへのリンク");
    assertEqual(detail.querySelectorAll("img, picture, iframe, video").length, 0, "詳細：ジャケットの画像を出さない");
    detail.querySelector('.cdb-type-tab[data-type-id="B"]').click();
    detail.querySelector(".cdb-series-link").click();
    assertEqual(getCdBonusState().detail.typeId, "C", "詳細：［続きの映像］で同じ作品の Type-C へ");
    // 別の作品へ移って戻る
    renderCdBonusDetail({ workId: "album-01", typeId: "A" });
    const toSingle = [...detail.querySelectorAll(".cdb-home-link")].find((button) => button.textContent.includes("1stシングル"));
    toSingle.click();
    assertEqual([getCdBonusState().detail.workId, getCdBonusState().historyDepth], ["single-01", 1], "詳細：再収録の行き先（元のシングル）へ移れる");
    assertEqual(goBackInCdBonusDetail(), true, "詳細：［一覧へ］はまず元の作品へ戻る");
    assertEqual([getCdBonusState().detail.workId, getCdBonusState().detail.typeId], ["album-01", "A"], "詳細：元の作品・TYPE に戻った");
    assertEqual(goBackInCdBonusDetail(), false, "詳細：それ以上は一覧へ（main.js が戻す）");
    // 戻ったら一覧の条件を保つ
    openCdBonusList({ keep: true });
    assertEqual(getCdBonusState().list, { tab: "videos", order: "new", category: "bonus", query: "人狼" }, "画面：戻ったとき、探し方・並び・言葉はそのまま");
    assertEqual(list.querySelector(".cdb-search").value, "人狼", "画面：言葉の欄もそのまま");
    // openCdBonus（入口の関数）
    const calls = [];
    setCdBonusNavigator((target, options) => calls.push({ target, from: options.from ?? null }));
    openCdBonus({ videoId: "single-09-B-1", from: "appSearch" });
    openCdBonus({ workId: "single-21", type: "C" });
    openCdBonus();
    assertEqual(
      calls,
      [
        { target: { workId: "single-09", typeId: "B", videoId: "single-09-B-1" }, from: "appSearch" },
        { target: { workId: "single-21", typeId: "C", videoId: null }, from: null },
        { target: { workId: null, typeId: null, videoId: null }, from: null },
      ],
      "入口：openCdBonus({ workId, type, videoId })"
    );
  } finally {
    setCdBonusNavigator(null);
    resetCdBonusListState();
    list.remove();
    detail.remove();
  }
}

function runSearchTests() {
  assertEqual(APP_SEARCH_CATEGORIES.find((category) => category.id === "cdBonus")?.label, "CD・特典映像", "検索：カテゴリ「CD・特典映像」");
  const entries = buildAppSearchEntries();
  const keysOf = (query, category = "all") => searchAppEntries(entries, query, category).results.map((result) => result.entry.key);
  const jinro = keysOf("人狼", "cdBonus");
  assertEqual(jinro.slice(0, 2), ["cdBonusVideo:single-09-B-1", "cdBonusVideo:single-09-C-1"], "検索：「人狼」で人狼ゲームの映像が先頭");
  const hit = searchAppEntries(entries, "人狼", "cdBonus").results[0].entry;
  assertEqual(hit.action.target, { kind: "cdBonus", workId: "single-09", typeId: "B", videoId: "single-09-B-1" }, "検索：結果から作品 → TYPE → 映像へ直接開く");
  assertEqual(hit.subtitle, "9thシングル「ウィークエンドシトロン」Type-B（CD+DVD・初回仕様限定盤）", "検索：どの作品のどの TYPE かが分かる");
  const fujisan = searchAppEntries(entries, "富士山");
  assertEqual(fujisan.results.filter((result) => result.entry.category === "cdBonus").length, 0, "検索：「富士山」で CD・特典映像は出ない");
  assertEqual(fujisan.suggestions.filter((entry) => entry.category === "cdBonus").length, 0, "検索：「富士山」の「もしかして」にも富士急の映像を出さない");
  assertEqual(keysOf("富士急", "cdBonus").filter((key) => key.startsWith("cdBonusVideo:")).length, 16, "検索：「富士急」で富士急のライブ16本");
  assertEqual(keysOf("ウィークエンドシトロン", "cdBonus")[0], "cdBonus:single-09", "検索：作品名で、その作品の CD・特典映像が先頭");
  assertEqual(keysOf("ウィークエンドシトロン")[0].startsWith("cdBonus"), false, "検索：作品名では、曲・作品の結果が先（CD・特典映像は下）");
  assertEqual(keysOf("CAMEO")[0].startsWith("cdBonus"), false, "検索：曲名で、曲より先に MV の項目を出さない");
  const travel = keysOf("社員旅行", "cdBonus").filter((key) => key.startsWith("cdBonusVideo:"));
  assertEqual(travel.length, 14, `検索：「社員旅行」で社員旅行の映像14本（三浦半島・雪山・沖縄2・北海道2・納涼2・広島2・埼玉2・ヒューストン2）（${travel.join(",")}）`);
  assertEqual(keysOf("特典映像").includes("feature:feature-cd-bonus"), true, "検索：「特典映像」で図鑑の機能が見つかる");
  assertEqual(APP_SEARCH_FEATURES.find((feature) => feature.id === "feature-cd-bonus")?.action, { type: "click", selector: "#cd-bonus-home-link" }, "検索：機能の入口はホームのボタン");
  assertEqual([isFloatingBackScreen("cdBonus"), isFloatingBackScreen("cdBonusDetail")], [true, true], "浮く戻る：一覧・詳細の両方で出る");
}

async function runMarkupTests() {
  const [html, sw, main, screens, css] = await Promise.all([fetchText("index.html"), fetchText("sw.js"), fetchText("js/main.js"), fetchText("js/screens.js"), fetchText("css/cdBonus.css")]);
  const doc = new DOMParser().parseFromString(html, "text/html");
  assertEqual(doc.querySelector("#home-card-know #cd-bonus-home-link b")?.textContent, "CD・特典映像図鑑", "入口：ホームの「＝LOVEをもっと知る」に［CD・特典映像図鑑］（仮の入口）");
  assertEqual(Boolean(doc.querySelector("#cd-bonus-home-link use[href='#hi-disc-video']")) && Boolean(doc.querySelector("symbol#hi-disc-video")), true, "入口：SVG のアイコン");
  assertEqual(Boolean(doc.querySelector("#cd-bonus-screen #cd-bonus-back-button.back-link")) && Boolean(doc.querySelector("#cd-bonus-content")), true, "画面：一覧に戻るボタンと入れ物");
  assertEqual(Boolean(doc.querySelector("#cd-bonus-detail-screen #cd-bonus-detail-back-button.back-link")) && Boolean(doc.querySelector("#cd-bonus-detail-content")), true, "画面：詳細に戻るボタンと入れ物（浮く戻るは .back-link を押す）");
  assertEqual(doc.querySelector("#cd-bonus-screen h2")?.textContent, "CD・特典映像図鑑", "画面：題名");
  assertEqual(Boolean(doc.querySelector('link[href="css/cdBonus.css"]')), true, "画面：CSS を読み込む");
  assertEqual(/plusmember\.jp\/prod\/public\/equallove\/contents\/discography|adm_image/.test(html), false, "画像：ジャケットの画像を直接表示しない");
  assertEqual(screens.includes('cdBonus: document.getElementById("cd-bonus-screen")') && screens.includes('cdBonusDetail: document.getElementById("cd-bonus-detail-screen")'), true, "画面の一覧に2つの画面");
  assertEqual(main.includes('openCdBonusFrom("start")') && main.includes('navigateWithScrollMemory("cdBonusDetail")') && main.includes('navigateWithScrollMemory("cdBonus")') && main.includes('target.kind === "cdBonus"'), true, "行き先：ホーム・全体検索 → 一覧／詳細 →［一覧へ］");
  assertEqual(["./css/cdBonus.css", "./js/cdBonusScreen.js", "./js/cdBonusModel.js", "./js/data/cdBonus.js"].every((file) => sw.includes(`"${file}"`)), true, "オフライン：新しいファイルを APP_SHELL に入れた");
  assertEqual(css.includes("prefers-reduced-motion"), true, "軽さ：見つけた映像を光らせる動きは、動きを減らす設定で止める");
}

export async function runCdBonusTests() {
  console.log("--- CD・特典映像図鑑（2026-11-02） ---");
  runDataTests();
  runModelTests();
  runScreenTests();
  runSearchTests();
  await runMarkupTests();
}
