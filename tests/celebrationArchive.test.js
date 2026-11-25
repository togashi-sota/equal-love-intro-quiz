// 【2026-11-25新設・本人の依頼】記念ポップアップ：起動時の自動表示を止め、一覧（アーカイブ）から見返せるようにした件のテスト。
// 期待する値（題名・MV の URL・入口の場所）は、前の実装（js/centerCelebration.js の CELEBRATIONS）と本人の依頼から人が書いたもの。
import {
  initCenterCelebration,
  isLaunchAutoShow,
  listCelebrationArchive,
  resetCelebrationLaunchStateForTest,
  showCelebrationFromArchive,
  showCenterCelebrationIfEligible,
} from "../js/centerCelebration.js";
import { initCelebrationArchiveScreen } from "../js/celebrationArchiveScreen.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const PREFIX = "player.celebration-archive-test.";
const IDS = ["obaCenterNatsunagori", "yumeNoTsuzuki"];
const SONGS = [{ id: "natsunagori-summer-tune", center: ["大場花菜"] }];

function clearStorage() {
  resetCelebrationLaunchStateForTest();
  IDS.forEach((id) => {
    sessionStorage.removeItem(`equalLoveIntroQuiz.${PREFIX}seenCelebration.${id}`);
    localStorage.removeItem(`equalLoveIntroQuiz.${PREFIX}celebrationLastShownAt.${id}`);
  });
}

// 本物と同じ形のポップアップ（index.html の #center-celebration-overlay と同じ部品）
function buildOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay celebration-overlay";
  overlay.hidden = true;
  overlay.innerHTML = `<div class="celebration-frame"><img class="celebration-bg" alt=""><a class="celebration-thumb-overlay" target="_blank" rel="noopener noreferrer"><img alt="" hidden></a><a class="celebration-hotspot" target="_blank" rel="noopener noreferrer"></a><button type="button" class="celebration-hotspot"></button></div>`;
  document.body.appendChild(overlay);
  const [bgImage, thumbImage] = overlay.querySelectorAll("img");
  const [thumbLink, mvButton] = overlay.querySelectorAll("a");
  return { overlay, bgImage, thumbLink, thumbImage, mvButton, seenButton: overlay.querySelector("button") };
}

function runLaunchTests() {
  clearStorage();
  const archive = listCelebrationArchive();
  assertEqual(archive.map((entry) => entry.autoShowOnLaunch), [false, false], "起動時：今の2件（はなちゃんセンター・夢の続き）は自動表示しない設定");
  const elements = { overlay: { hidden: true, dataset: {} } };
  assertEqual(showCenterCelebrationIfEligible(SONGS, PREFIX, elements, { enabled: true }), false, "① 初めて開いた人（記録なし）にも、起動時に出さない");
  assertEqual(elements.overlay.hidden, true, "① ポップアップに触れない（ホームがそのまま使える）");
  clearStorage();
  assertEqual(showCenterCelebrationIfEligible(SONGS, PREFIX, elements, { enabled: true }), false, "② 2回目以降の起動（新しい起動）でも出さない");
  localStorage.setItem(`equalLoveIntroQuiz.${PREFIX}celebrationLastShownAt.obaCenterNatsunagori`, "1000");
  clearStorage();
  assertEqual(showCenterCelebrationIfEligible(SONGS, PREFIX, elements, { enabled: true }), false, "③ 前の版で一度見た人（アップデートの後）にも出さない");
  assertEqual(isLaunchAutoShow({ autoShowOnLaunch: true }) && !isLaunchAutoShow({}), true, "今後のお祝い：autoShowOnLaunch を書かなければ起動時には出ない（本人が決めたものだけ出す）");
}

function runArchiveTests() {
  clearStorage();
  const archive = listCelebrationArchive();
  assertEqual(
    archive.map((entry) => [entry.id, entry.title, entry.youtubeUrl]),
    [
      ["obaCenterNatsunagori", "祝！はなちゃんセンターおめでとう！", "https://www.youtube.com/watch?v=_Bm66BRnM1A"],
      ["yumeNoTsuzuki", "『夢の続き』MV公開！", "https://www.youtube.com/watch?v=RjHjQlEjs_E"],
    ],
    "一覧：2件・並び順・前と同じ公式の MV の URL"
  );
  assertEqual(archive.every((entry) => entry.title && entry.description && /^assets\/images\/.+\.webp$/.test(entry.imageSrc)), true, "一覧：どれにも題名・説明・前と同じ画像がある（新しいお祝いも同じ項目を書けば並ぶ）");

  const elements = buildOverlay();
  initCenterCelebration(elements, SONGS);
  let closed = 0;
  assertEqual(showCelebrationFromArchive("yumeNoTsuzuki", elements, { onClose: () => (closed += 1) }), true, "⑤ 一覧から『夢の続き』を開ける");
  assertEqual([elements.overlay.hidden, elements.overlay.dataset.mode, elements.bgImage.getAttribute("src"), elements.mvButton.href], [false, "archive", "assets/images/celebration-yume-no-tsuzuki.webp", "https://www.youtube.com/watch?v=RjHjQlEjs_E"], "⑤ 前と同じ画像・MV のリンクで出る");
  assertEqual([elements.mvButton.target, elements.mvButton.rel], ["_blank", "noopener noreferrer"], "⑦ 「MVを見る」は新しいタブで開く（アプリの画面は残る）");
  elements.seenButton.click();
  assertEqual([elements.overlay.hidden, closed, document.body.style.position], [true, 1, ""], "⑥ 「見た！」で閉じて一覧へ戻る（画面の固定も外す）");
  assertEqual(
    [sessionStorage.getItem(`equalLoveIntroQuiz.${PREFIX}seenCelebration.yumeNoTsuzuki`), sessionStorage.getItem("equalLoveIntroQuiz.celebrationShownThisLaunch"), localStorage.getItem(`equalLoveIntroQuiz.${PREFIX}celebrationLastShownAt.yumeNoTsuzuki`)],
    [null, null, null],
    "一覧から見ても、既読・起動時の記録は変えない（起動時の表示がまた有効になったりしない）"
  );
  assertEqual(showCelebrationFromArchive("obaCenterNatsunagori", elements), true, "⑤ 一覧から『はなちゃんセンター』も開ける");
  assertEqual(elements.mvButton.href, "https://www.youtube.com/watch?v=_Bm66BRnM1A", "⑤ はなちゃんセンターの MV の URL");
  elements.seenButton.click();
  assertEqual(elements.overlay.hidden, true, "⑥ 閉じられる");
  assertEqual(showCelebrationFromArchive("no-such-id", elements), false, "知らない ID は開かない");
  assertEqual(showCenterCelebrationIfEligible(SONGS, PREFIX, elements, { enabled: true }), false, "一覧で見たあとも、起動時の自動表示は出ないまま");
  elements.overlay.remove();
  clearStorage();
}

function runScreenTests() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const opened = [];
  initCelebrationArchiveScreen({ container }, { onOpen: (id) => opened.push(id) });
  const items = [...container.querySelectorAll(".cel-archive-item")];
  assertEqual(items.map((item) => item.querySelector(".cel-archive-title").textContent), ["祝！はなちゃんセンターおめでとう！", "『夢の続き』MV公開！"], "④ 一覧の画面：2件の題名");
  assertEqual(items.every((item) => item.querySelector("img.cel-archive-thumb") && item.querySelector(".cel-archive-open")?.textContent === "見る"), true, "④ 一覧の画面：画像・「見る」");
  const links = items.map((item) => item.querySelector(".cel-archive-mv"));
  assertEqual(links.map((link) => [link.href, link.target, link.rel]), [["https://www.youtube.com/watch?v=_Bm66BRnM1A", "_blank", "noopener noreferrer"], ["https://www.youtube.com/watch?v=RjHjQlEjs_E", "_blank", "noopener noreferrer"]], "⑦ 一覧から YouTube の MV へ（新しいタブ）");
  items[1].querySelector(".cel-archive-open").click();
  assertEqual(opened, ["yumeNoTsuzuki"], "④ 「見る」でそのポップアップを開く");
  container.remove();
}

async function runMarkupTests() {
  const html = await fetchText("./index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const link = doc.getElementById("celebration-archive-home-link");
  assertEqual([link?.closest("#home-card-know")?.id, link?.classList.contains("home-know")], ["home-card-know", false], "入口：ホーム「＝LOVEをもっと知る」の中の小さな入口（大きなカードではない）");
  assertEqual(Boolean(doc.getElementById("celebration-archive-screen")?.querySelector(".back-link")), true, "一覧の画面と［戻る］がある");
  assertEqual(Boolean(doc.getElementById("center-celebration-overlay")), true, "ポップアップ本体（画像・ボタン）は消していない");
  const sw = await fetchText("./sw.js");
  assertEqual(["./css/celebrationArchive.css", "./js/celebrationArchiveScreen.js", "./assets/images/center-celebration-oba-natsunagori.webp", "./assets/images/celebration-yume-no-tsuzuki.webp"].every((file) => sw.includes(`"${file}"`)), true, "オフラインでも一覧と画像を開ける（APP_SHELL）");
  const history = await fetchText("./js/appHistory.js");
  assertEqual(history.includes('"#center-celebration-seen-button"'), true, "端末の「戻る」でもポップアップを閉じられる（前のまま）");
}

export async function runCelebrationArchiveTests() {
  console.log("\n=== 記念ポップアップ（起動時に出さない・一覧から見返す） ===");
  runLaunchTests();
  runArchiveTests();
  runScreenTests();
  await runMarkupTests();
}
