// 遊び方・機能ガイドとゲームの遊び方・記録のテスト（2026-10-31・本人の依頼 A〜D）。
//   A. ホームの入口（イントロの箱のすぐ下の［プレイ履歴］［遊び方・機能ガイド］・［ゲームの遊び方・記録］の行き先）
//   B. ゲームの説明データ（js/data/gameGuideContent.js）：全モードを漏れなく・10の項目・行き先・アイコン・画像
//   C. 全体のガイドの目次（js/data/guideContent.js）：決められた並び・項目の実在・「開く」の行き先・検索の使い分け・
//      ゲームの説明を共通のデータから作っていること・全体検索から開く id を残していること
//   D. 画面の組み立て（本物の部品を隠れた箱の中で動かす）：目次・項目の開け閉め・「開く」の行き先・カードの10の項目
//   E. ［戻る］の行き先（ガイドから開いた画面はガイドへ。js/appNavigationStack.js）
//   F. 配線（index.html・js/main.js・js/screens.js・sw.js・css）。昔の「ゲーム」の画面は消していない
//   G. 履歴・データに影響が無いこと（ガイドは端末の保存場所に書かない・描いても押しても localStorage が変わらない）
import { assertEqual } from "./test-utils.js";
import {
  GAME_GUIDE_MODES,
  GAME_GUIDE_ITEMS,
  GAME_GUIDE_GROUPS,
  ONLINE_BATTLE_MODES,
  LYRICS_BATTLE_RULES,
  fillGameGuideCounts,
  getGameGuideModeById,
} from "../js/data/gameGuideContent.js";
import { GUIDE_CATEGORIES, GUIDE_SECTIONS, GUIDE_FIRST_STEPS, GUIDE_SEARCH_FIELDS, getGuideSectionById, listGameModeIdsInGuide } from "../js/data/guideContent.js";
import { initGuideScreen, openGuideScreen, revealGuideSection, buildGuideCounts, fillGuideCounts } from "../js/guideScreen.js";
import { initGameGuideScreen, openGameGuideScreen } from "../js/gameGuideScreen.js";
import { HOME_ACTIONS } from "../js/homeScreen.js";
import { HOME_SPECIAL_MODES_ORDER } from "../js/specialModesScreen.js";
import { createNavStack, planScreenChange, applyScreenChange, resolveHubReturn, planSystemBack, findFallbackIndex, HUB_OF_SCREEN } from "../js/appNavigationStack.js";
import { SONGS } from "../js/data/songs.js";
import { filterSongsByCategory } from "../js/quiz.js";
import { ACHIEVEMENTS } from "../js/achievementDefinitions.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const exists = async (file) => (await fetch(file, { method: "HEAD", cache: "no-store" })).ok;

// 「開く」の形が正しいか（行き先が実在するか）。html：index.html の文書
function describeOpenProblem(open, doc) {
  if (!open || typeof open !== "object") return "open が無い";
  const keys = Object.keys(open);
  if (keys.length !== 1) return `鍵が1つではない：${keys.join(",")}`;
  if (open.home !== undefined) return HOME_ACTIONS[open.home] ? null : `HOME_ACTIONS に無い：${open.home}`;
  if (open.click !== undefined) return doc.getElementById(open.click) ? null : `index.html に無い id：${open.click}`;
  if (open.mode !== undefined) return HOME_SPECIAL_MODES_ORDER.includes(open.mode) ? null : `モードが無い：${open.mode}`;
  if (open.gameGuide !== undefined) return open.gameGuide === "" || getGameGuideModeById(open.gameGuide) ? null : `ゲームのガイドに無い：${open.gameGuide}`;
  if (open.guideSection !== undefined) return getGuideSectionById(open.guideSection) ? null : `ガイドに無い：${open.guideSection}`;
  if (open.intro !== undefined) return open.intro === true ? null : "intro は true";
  if (open.appGuide !== undefined) return open.appGuide === true ? null : "appGuide は true";
  if (open.help !== undefined) return ["timeAttack", "randomPlayback", "lyricsQuiz", "partyBattle", "onlineBattle", "weakSongs", "originalQuiz"].includes(open.help) ? null : `「？」の説明が無い：${open.help}`;
  if (open.url !== undefined) return null; // ファイルの有無は別に確かめる
  return `知らない形：${keys[0]}`;
}

export async function runGuidesTests() {
  console.log("--- ガイド（2026-10-31）：遊び方・機能ガイド／ゲームの遊び方・記録 ---");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");

  // ===== A. ホームの入口 =====
  const home = doc.getElementById("start-screen");
  const introPanel = home.querySelector("#home-intro-panel");
  const introLinks = introPanel?.nextElementSibling;
  assertEqual(introLinks?.classList.contains("home-intro-links"), true, "A: イントロクイズの箱のすぐ次に入口の並び");
  assertEqual(
    [...(introLinks?.querySelectorAll("[data-home-action]") ?? [])].map((button) => `${button.dataset.homeAction}:${button.textContent.trim()}`),
    ["history:プレイ履歴", "guides:遊び方・機能ガイド"],
    "A: 横に2つ：［プレイ履歴］［遊び方・機能ガイド］"
  );
  assertEqual(introLinks?.parentElement?.classList.contains("home-game-layout"), true, "A: 入口は「ゲームで遊ぶ」のカードの中（新しい大きなカードは足さない）");
  assertEqual(HOME_ACTIONS.history, { type: "click", value: "history-link" }, "A: プレイ履歴 → 今の履歴の画面（#history-link と同じ）");
  assertEqual(HOME_ACTIONS.guides, { type: "callback", value: "openAppGuide" }, "A: 遊び方・機能ガイド → アプリ全体のガイド");
  assertEqual(HOME_ACTIONS["all-games"], { type: "callback", value: "openGameGuide" }, "D: ［ゲームの遊び方・記録］→ ゲームのガイド");
  assertEqual(home.querySelector('.home-games-more[data-home-action="all-games"] .home-games-more-text')?.textContent, "ゲームの遊び方・記録", "D: ボタンの名前は行き先の画面の名前");
  assertEqual(["history", "guides"].map((name) => home.querySelectorAll(`[data-home-action="${name}"]`).length), [1, 1], "A: マイページ・データの下から移した（ホームの中で2か所に置かない）");

  // ===== B. ゲームの説明データ =====
  const modeIds = GAME_GUIDE_MODES.map((mode) => mode.id);
  const homeModeIds = Object.values(HOME_ACTIONS).filter((action) => action.type === "mode").map((action) => action.value);
  assertEqual([...modeIds].sort(), ["intro", ...homeModeIds].sort(), "B: ゲームのガイドのモード＝イントロクイズ＋ホームの全ゲーム（漏れ・架空のモードなし）");
  assertEqual(GAME_GUIDE_MODES.length, 11, "B: 載せたモードは11");
  assertEqual(new Set(modeIds).size, modeIds.length, "B: 同じモードを二重に載せない");
  assertEqual(GAME_GUIDE_ITEMS.map((item) => item.key), ["what", "correct", "controls", "settings", "rules", "scoring", "records", "difference", "forWhom", "start"], "B: 10の項目（本人の依頼の順）");
  GAME_GUIDE_MODES.forEach((mode) => {
    const missing = GAME_GUIDE_ITEMS.filter((item) => !Array.isArray(mode.items[item.key]) || mode.items[item.key].length === 0 || mode.items[item.key].some((line) => typeof line !== "string" || line.trim() === ""));
    assertEqual(missing.map((item) => item.key), [], `B: 「${mode.title}」は10の項目をすべて持つ`);
    assertEqual(Array.isArray(mode.keyPoints) && mode.keyPoints.length >= 2, true, `B: 「${mode.title}」は大事な操作を持つ`);
    assertEqual(GAME_GUIDE_GROUPS.some((group) => group.id === mode.group), true, `B: 「${mode.title}」のまとまりが実在する`);
    assertEqual(doc.getElementById(mode.icon)?.tagName.toLowerCase(), "symbol", `B: 「${mode.title}」のアイコン（${mode.icon}）は index.html にある`);
    const play = mode.play.type === "intro" ? { intro: true } : { mode: mode.play.modeId };
    assertEqual(describeOpenProblem(play, doc), null, `B: 「${mode.title}」の［このゲームを遊ぶ］の行き先がある`);
    if (mode.helpModalId) assertEqual(describeOpenProblem({ help: mode.helpModalId }, doc), null, `B: 「${mode.title}」の「？」の説明がある`);
    assertEqual(mode.items.start.join("").includes("ホーム"), true, `B: 「${mode.title}」の始め方はホームのボタンの名前で書く`);
  });
  // ホームのボタンの名前と同じ題名
  const homeTitles = Object.fromEntries([...home.querySelectorAll(".home-game")].map((button) => [HOME_ACTIONS[button.dataset.homeAction].value, button.querySelector(".home-game-title").textContent]));
  assertEqual(GAME_GUIDE_MODES.filter((mode) => mode.id !== "intro" && homeTitles[mode.id] !== mode.title).map((mode) => mode.id), [], "B: モードの名前はホームのボタンと同じ");
  for (const mode of GAME_GUIDE_MODES) {
    for (const image of mode.images) {
      assertEqual(await exists(image.src), true, `B: 画像がある：${image.src}`);
      assertEqual(typeof image.alt === "string" && image.alt.length > 0, true, `B: 画像に代わりの文：${image.src}`);
    }
  }
  assertEqual(ONLINE_BATTLE_MODES.map((mode) => mode.name), ["イントロ対戦", "ランダム再生対戦", "アウトロ対戦", "歌詞クイズ対戦", "一瞬バトル", "一瞬協力"], "B: オンライン対戦の6つの対戦モード");
  const onlineBattleSource = await fetchText("index.html");
  assertEqual(ONLINE_BATTLE_MODES.every((mode) => onlineBattleSource.includes(mode.name)), true, "B: 対戦モードの名前は画面（index.html）と同じ");
  assertEqual(LYRICS_BATTLE_RULES.map((rule) => rule.name), ["正解数バトル", "早押しバトル", "ポイントバトル"], "B: 歌詞クイズ対戦の3つのルール");
  // 曲数は文に書かず、今のデータから入れる
  const counts = buildGuideCounts();
  assertEqual(counts, { all: SONGS.length, "title-track": filterSongsByCategory(SONGS, "title-track").length, "title-and-group": filterSongsByCategory(SONGS, "title-and-group").length, achievements: ACHIEVEMENTS.length }, "B: 数は js/data/songs.js・称号の定義から数える");
  assertEqual(fillGameGuideCounts("表題曲のみ（{count:title-track}曲）", counts), `表題曲のみ（${counts["title-track"]}曲）`, "B: 曲数を差し込む");
  assertEqual(fillGameGuideCounts("表題曲のみ（{count:none}曲）", counts), "表題曲のみ", "B: 数が分からないときは（…曲）ごと出さない");
  assertEqual(fillGuideCounts("全{count:all}曲", counts), `全${SONGS.length}曲`, "B: 全体のガイドも同じ数");
  const gameGuideSource = await fetchText("js/data/gameGuideContent.js");
  const guideSource = await fetchText("js/data/guideContent.js");
  assertEqual(/\d+曲[）)]/.test(gameGuideSource.replace(/\/\/.*$/gm, "")) || /[（(]\d+曲/.test(guideSource.replace(/\/\/.*$/gm, "")), false, "B: 文の中にカテゴリの曲数を直接書いていない（古い数を残さない）");
  assertEqual(/全27|27件|27個/.test(gameGuideSource + guideSource), false, "B: 称号の数も直接書いていない");
  // 昔の説明の誤り（コードと違う）を残していない
  assertEqual(gameGuideSource.includes("8段階"), false, "B: 点数は9段階（10〜2点）。「8段階」と書かない");
  assertEqual(gameGuideSource.includes("3秒以内10点") && gameGuideSource.includes("それより後2点"), true, "B: 点数の表（js/score.js と同じ）");
  assertEqual(/正解数バトル[^。]*正解した問題数で記録/.test(gameGuideSource), false, "B: 1人用の正解数バトルの自己ベストは合計タイム（「正解数で記録」と書かない）");
  assertEqual(gameGuideSource.includes("共有リンク"), false, "B: 無い機能（ルームの共有リンク）を書かない");
  assertEqual(/accountprotect|バックアップ管理|音源診断ログ|calltext/.test(gameGuideSource + guideSource.replace(/\/\/.*$/gm, "")), false, "B: 管理者・開発用の機能を一般向けに書かない");

  // ===== C. 全体のガイドの目次 =====
  assertEqual(GUIDE_CATEGORIES.map((category) => category.id), ["games", "online", "live", "music", "info", "mydata", "search", "faq", "storage", "trouble"], "C: 分類の並び（各機能 → 検索の使い分け → よくある質問 → データの保存と引き継ぎ → 困ったとき）");
  const referenced = GUIDE_CATEGORIES.flatMap((category) => category.sectionIds);
  assertEqual(referenced.length, new Set(referenced).size, "C: 1つの項目は目次の1か所だけ");
  assertEqual(referenced.filter((id) => !getGuideSectionById(id)), [], "C: 目次の項目はすべて実在する");
  assertEqual(GUIDE_SECTIONS.map((section) => section.id).filter((id) => !referenced.includes(id)), [], "C: 目次から辿れない項目が無い");
  // 全体検索の「ガイドで詳しく見る」が使う、以前からの id（2026-10-31 以前の32件）を残している
  const legacyIds = ["intro", "outroQuiz", "randomPlayback", "lyricsQuiz", "instantChallenge", "timeAttack", "originalQuiz", "weakSongs", "partyBattle", "onlineBattle", "onlineBattleModes", "liveCallMode", "achievements", "playHistory", "timeAttackLeaderboard", "favorites", "playlists", "offlinePlayer", "fanProfiles", "dataPackImport", "deviceTransfer", "backupRestore", "faqNoSound", "faqReady", "faqLeaveVsHome", "faqRematch", "faqDisconnect", "faqProfilePublic", "faqTieBreak", "faqDataMismatch", "faqDataPack", "faqBackup"];
  assertEqual(legacyIds.filter((id) => !getGuideSectionById(id)), [], "C: 全体検索から開く以前の id を残している（32件）");
  // ゲームの説明は共通のデータから作る（同じ説明を2か所で持たない）
  assertEqual([...listGameModeIdsInGuide()].sort(), [...modeIds].sort(), "C: 全体のガイドは全モードを短く紹介する（共通のデータから作る）");
  GUIDE_SECTIONS.filter((section) => section.kind === "game").forEach((section) => {
    const mode = getGameGuideModeById(section.gameModeId);
    assertEqual([section.steps, section.actions.some((action) => action.open.gameGuide === mode.id)], [mode.keyPoints, true], `C: 「${mode.title}」の紹介は共通のデータの大事な操作＋「詳しい遊び方」へのボタン`);
  });
  // 「開く」の行き先
  const opens = [
    ...GUIDE_SECTIONS.flatMap((section) => (section.actions ?? []).map((action) => ({ where: section.id, open: action.open }))),
    ...GUIDE_FIRST_STEPS.filter((step) => step.open).map((step) => ({ where: step.title, open: step.open })),
  ];
  const problems = opens.map(({ where, open }) => [where, describeOpenProblem(open, doc)]).filter(([, problem]) => problem);
  assertEqual(problems, [], `C: ガイドの「開く」ボタン（${opens.length}個）の行き先はすべて実在する`);
  for (const url of [...new Set(opens.filter(({ open }) => open.url).map(({ open }) => open.url).concat(GUIDE_FIRST_STEPS.filter((step) => step.link).map((step) => step.link.href)))]) {
    assertEqual(await exists(url), true, `C: 案内のページがある：${url}`);
  }
  // はじめての人の流れ（本人の依頼の順）
  assertEqual(GUIDE_FIRST_STEPS.map((step) => step.title), ["アプリを開く", "ホーム画面に追加する", "名前と推しメンを登録する", "データを入れる", "入ったか確かめる", "イントロクイズで遊ぶ", "ほかのモードも遊ぶ", "オンライン対戦をする", "履歴・称号を見る", "データが消えたとき"], "C: はじめての人の流れ（10の手順）");
  // 検索の使い分け
  const searchSections = GUIDE_CATEGORIES.find((category) => category.id === "search").sectionIds.map(getGuideSectionById);
  assertEqual(searchSections.map((section) => section.title), ["アプリ内検索（全体検索）", "歌詞検索", "曲名の検索（楽曲一覧・曲を選ぶ画面）", "曲からライブを探す", "プレイ履歴の絞り込み", "画面の中の検索"], "C: 検索の使い分け：全体・歌詞・曲名・ライブ・履歴・画面の中");
  searchSections.forEach((section) => {
    assertEqual(GUIDE_SEARCH_FIELDS.filter((field) => !section.search[field.key]).map((field) => field.key), [], `C: 「${section.title}」は9つの観点をすべて書いている`);
  });
  assertEqual(getGuideSectionById("searchLyrics").search.needs.includes("歌詞のデータ"), true, "C: 歌詞検索には端末の歌詞が要る、と書く");
  assertEqual(getGuideSectionById("searchApp").search.notTarget.includes("歌詞の本文"), true, "C: 全体検索は歌詞の本文を探さない、と書く");
  // ライブは新しい仕様（live-unify）で書く
  const liveText = GUIDE_CATEGORIES.find((category) => category.id === "live").sectionIds.map(getGuideSectionById).map((section) => JSON.stringify(section)).join("");
  assertEqual(["コール表", "ライブコール", "カラオケ", "演出 あり／なし", "コール表示 ON／OFF", "曲スタート", "今までの版を開く"].filter((word) => !liveText.includes(word)), [], "C: ライブは新しい3つのモード・演出 あり／なし・コール表示 ON／OFF・音源なしのカラオケで書く");
  assertEqual(/おためし版|標準・控えめ/.test(liveText), false, "C: ライブに古い仕様（おためし版・演出の標準／控えめ）を書かない");

  // ===== D. 画面の組み立て =====
  const sandbox = document.createElement("div");
  sandbox.hidden = true;
  const content = document.createElement("div");
  const gameContent = document.createElement("div");
  sandbox.append(content, gameContent);
  document.body.appendChild(sandbox);
  const storageBefore = JSON.stringify(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]));
  try {
    const opened = [];
    initGuideScreen({ content }, { onOpen: (open) => opened.push(open) });
    openGuideScreen("start");
    assertEqual([...content.querySelectorAll(".gd-toc-button")].map((button) => button.dataset.guideJump), ["first", ...GUIDE_CATEGORIES.map((category) => category.id)], "D: 目次＝はじめての人へ＋分類");
    assertEqual(content.querySelectorAll("details.gd-item").length, referenced.length, "D: 項目はすべて開け閉めできる形（details）");
    assertEqual([...content.querySelectorAll("details.gd-item")].every((item) => !item.open), true, "D: 開いたときはすべて閉じている");
    assertEqual(content.querySelectorAll(".gd-first-step").length, GUIDE_FIRST_STEPS.length, "D: はじめての人の流れを番号つきで出す");
    assertEqual(content.querySelector(".gd-overview-list").textContent.includes(`${SONGS.length}曲`), true, "D: 概要の曲数は今のデータの数");
    assertEqual(/\{count:/.test(content.textContent), false, "D: 差し込み忘れ（{count:…}）が画面に出ない");
    assertEqual(revealGuideSection("searchLyrics"), true, "D: 項目を開ける（全体検索・目次から）");
    assertEqual(content.querySelector("#guide-item-searchLyrics").open, true, "D: 開いた項目は開いている");
    assertEqual(content.querySelectorAll("#guide-item-searchLyrics .gd-search-row").length, GUIDE_SEARCH_FIELDS.length, "D: 検索の項目は表で出す");
    content.querySelector("#guide-item-songlist .gd-open").click();
    content.querySelector("#guide-item-intro .gd-open.is-primary").click();
    content.querySelector("#guide-item-dataPackImport a.gd-open")?.getAttribute("href");
    assertEqual(opened, [{ home: "songlist" }, { intro: true }], "D: 「開く」はホームの同じボタンと同じ行き先を渡す");
    assertEqual(content.querySelector("#guide-item-dataPackImport a.gd-open")?.getAttribute("href"), "guide-data-pack.html", "D: 画像つきの入れ方はページへのリンク");
    openGuideScreen("start");
    assertEqual(content.querySelector("#guide-item-searchLyrics").open, false, "D: ホームから開き直すと閉じた状態から");

    const gameOpened = [];
    initGameGuideScreen({ content: gameContent }, { onOpen: (open) => gameOpened.push(open) });
    openGameGuideScreen("", "start");
    const cards = [...gameContent.querySelectorAll("details.gg-mode")];
    assertEqual(cards.map((card) => card.dataset.modeId), modeIds, "D: ゲームのガイド：全モードのカード");
    assertEqual(cards.every((card) => card.querySelectorAll(".gg-item").length === 10), true, "D: どのカードも10の項目");
    assertEqual(cards.every((card) => card.querySelector(".gg-key")), true, "D: 大事な操作を目立たせる箱がある");
    assertEqual(gameContent.querySelector(".gg-quick").textContent.replace(/\s+/g, ""), "ゲームの遊び方プレイ履歴を見る", "D: 上に［ゲームの遊び方］［プレイ履歴を見る］");
    gameContent.querySelector(".gg-quick-button + .gg-quick-button").click();
    cards.forEach((card) => card.querySelector(".gg-play").click());
    assertEqual(gameOpened, [{ home: "history" }, { intro: true }, ...GAME_GUIDE_MODES.filter((mode) => mode.id !== "intro").map((mode) => ({ mode: mode.play.modeId }))], "D: ［プレイ履歴を見る］は今の記録の画面、［このゲームを遊ぶ］はそれぞれの開始画面");
    const target = openGameGuideScreen("onlineBattle", "start");
    assertEqual([target?.open, cards.filter((card) => card.open).map((card) => card.dataset.modeId)], [true, ["onlineBattle"]], "D: モードを指定して開くと、そのカードだけ開く");
    assertEqual(gameContent.querySelector("#gg-mode-liveCallMode .gg-images img")?.getAttribute("alt").includes("ダミー"), true, "D: 画像はダミーの文字で撮った見本（本物の歌詞を写さない）");
    assertEqual(gameContent.textContent.includes(`表題曲のみ（${counts["title-track"]}曲）`), true, "D: カテゴリの曲数は今のデータから");
  } finally {
    sandbox.remove();
  }

  // ===== G. 履歴・データに影響が無いこと =====
  const storageAfter = JSON.stringify(Object.keys(localStorage).sort().map((key) => [key, localStorage.getItem(key)]));
  assertEqual(storageAfter === storageBefore, true, "G: ガイドを描いて押しても、端末の保存（localStorage）は変わらない");
  for (const file of ["js/guideScreen.js", "js/gameGuideScreen.js", "js/data/guideContent.js", "js/data/gameGuideContent.js"]) {
    const source = (await fetchText(file)).replace(/\/\/.*$/gm, "");
    assertEqual(/localStorage|sessionStorage|indexedDB|firebase|saveHistory|savePlayHistory|setItem\(/i.test(source), false, `G: ${file} は記録・端末の保存・Firebase に触れない`);
  }

  // ===== E. ［戻る］の行き先 =====
  const walk = (screens) => screens.slice(1).reduce((stack, screen) => applyScreenChange(stack, planScreenChange(stack, screen), screen), createNavStack(screens[0]));
  assertEqual(resolveHubReturn(walk(["start", "gameGuide", "timeAttackSetup"]), "timeAttackSetup", "start"), "gameGuide", "E: ゲームのガイド → タイムアタックの設定 →［戻る］→ ゲームのガイド");
  assertEqual(resolveHubReturn(walk(["start", "gameHub", "timeAttackSetup"]), "timeAttackSetup", "start"), "gameHub", "E: 昔のゲームの画面から来たときは今までどおりゲームの画面へ");
  assertEqual(resolveHubReturn(walk(["start", "gameHub", "gameGuide", "lyricsQuizSetup"]), "lyricsQuizSetup", "start"), "gameGuide", "E: 両方を通ったときは、あとから通った方へ");
  assertEqual(resolveHubReturn(walk(["start", "guide", "gameGuide", "history"]), "history", "start"), "gameGuide", "E: ガイド → ゲームのガイド → プレイ履歴 →［戻る］→ ゲームのガイド");
  assertEqual(resolveHubReturn(walk(["start", "history"]), "history", "start"), "start", "E: ホームの［プレイ履歴］から来たときはホームへ");
  assertEqual(resolveHubReturn(walk(["start", "guide", "songlist"]), "songlist", "start"), "guide", "E: ガイド → 楽曲一覧 →［戻る］→ ガイド");
  assertEqual(resolveHubReturn(walk(["start", "musicHub", "songlist"]), "songlist", "start"), "musicHub", "E: 楽曲・歌詞から来たときは今までどおり");
  assertEqual(resolveHubReturn(walk(["start", "guide", "settings"]), "settings", "start"), "guide", "E: ガイド → 設定 →［戻る］→ ガイド");
  assertEqual(resolveHubReturn(walk(["start", "guide", "songlist"]), "songlist", "appSearch"), "appSearch", "E: ホーム以外への［戻る］は変えない");
  assertEqual(Object.values(HUB_OF_SCREEN).every((hub) => ["gameHub", "musicHub", "guideHub"].includes(hub)), true, "E: 今までのまとめ画面の対応はそのまま");
  // 【2026-10-31 guides-fix】ガイド → ランキング →［戻る］→ ガイド（ほかの「開く」と同じ）
  assertEqual(resolveHubReturn(walk(["start", "guide", "timeAttackLeaderboard"]), "timeAttackLeaderboard", "start"), "guide", "E2: ガイド → ランキング →［戻る］→ ガイド");
  assertEqual(resolveHubReturn(walk(["start", "timeAttackLeaderboard"]), "timeAttackLeaderboard", "start"), "start", "E2: ホームのランキングから来たときはホームへ");
  {
    const mainSource = await fetchText("js/main.js");
    const homeRank = mainSource.slice(mainSource.indexOf('homeLeaderboardLinkElement.addEventListener("click"'), mainSource.indexOf("initTimeAttackHistoryScreen({"));
    assertEqual(homeRank.includes("timeAttackLeaderboardReturnScreen = fromScreen") && !homeRank.includes('timeAttackLeaderboardReturnScreen = "start";'), true, "E2: ホーム上の［ランキング］（ガイドの「ランキングを開く」も同じボタン）の戻り先は、押した画面");
    const onBack = mainSource.slice(mainSource.indexOf("backButton: timeAttackLeaderboardBackButtonElement,"), mainSource.indexOf("adminDeleteOverlay: timeAttackLeaderboardAdminDeleteOverlayElement"));
    assertEqual(onBack.includes("navigateWithScrollMemory(timeAttackLeaderboardReturnScreen)"), true, "E2: ランキングの［戻る］（端末の戻るも同じボタン）は、スクロールの位置ごと戻す");
    // ガイド →［イントロクイズへ］：ホームを新しく積む（ガイドの記録を消さない）→ 端末の「戻る」でガイドへ
    const toIntro = mainSource.slice(mainSource.indexOf("} else if (open.intro) {"), mainSource.indexOf("} else if (open.help) {"));
    assertEqual(toIntro.indexOf('forcePushNextScreen("start");') >= 0 && toIntro.indexOf('forcePushNextScreen("start");') < toIntro.indexOf('navigateWithScrollMemory("start");'), true, "E2: ［イントロクイズへ］はホームを新しく積んでから移る");
    const appHistorySource = await fetchText("js/appHistory.js");
    assertEqual(appHistorySource.includes("export function forcePushNextScreen(screenName)") && appHistorySource.includes("planScreenChange(stack, screenName, { forcePush })"), true, "E2: 次の1回だけ積む仕組み（js/appHistory.js）");
  }
  const guideStack = walk(["start", "guide"]);
  const forced = planScreenChange(guideStack, "start", { forcePush: true });
  assertEqual([planScreenChange(guideStack, "start").type, forced.type], ["back", "push"], "E2: ふつうはホームへ「戻る」、ガイドの［イントロクイズへ］だけ新しく積む");
  const introStack = applyScreenChange(guideStack, forced, "start");
  assertEqual([introStack.entries, introStack.index], [["start", "guide", "start"], 2], "E2: 記録は ホーム → ガイド → ホーム（ガイドが残る）");
  const homeBack = planSystemBack({ screen: "start", modalOpen: false, hasBackControl: false });
  assertEqual([homeBack.type, introStack.entries[findFallbackIndex(introStack, introStack.index - 1)]], ["fallback", "guide"], "E2: そのホームで端末の「戻る」→ ガイドへ（アプリの外へ出ない）");
  assertEqual(resolveHubReturn(applyScreenChange(introStack, planScreenChange(introStack, "songlist"), "songlist"), "songlist", "start"), "start", "E2: 積み直したホームから開いた画面の［戻る］はホームへ（前のガイドへは行かない）");
  const backHome = applyScreenChange(introStack, planScreenChange(introStack, "quiz"), "quiz");
  assertEqual(planScreenChange(backHome, "start"), { type: "back", toIndex: 2, steps: 1 }, "E2: クイズのあとホームへは、すぐ前のホームへ戻る");

  // ===== F. 配線 =====
  assertEqual(Boolean(doc.querySelector("#game-guide-screen #game-guide-back-button.back-link")) && Boolean(doc.querySelector("#game-guide-screen #game-guide-content")), true, "F: ゲームのガイドの画面（戻る・中身の入れ物）");
  assertEqual(doc.querySelector("#game-guide-screen h2")?.textContent, "ゲームの遊び方・記録", "F: 画面の名前");
  assertEqual(doc.querySelector("#guide-screen h2")?.textContent, "遊び方・機能ガイド", "F: 全体のガイドの名前（ホームの入口と同じ）");
  assertEqual(Boolean(doc.querySelector("#guide-screen #guide-content")) && Boolean(doc.querySelector('#guide-screen #guide-video-card[target="_blank"][rel="noopener noreferrer"]')), true, "F: 全体のガイドの入れ物と動画のカード（新しいタブ）");
  // 昔の「ゲーム」の画面は消していない（イントロクイズの設定・スタート・エラーの表示に使う）
  assertEqual(["start-button", "start-error", "mode-best-chip", "question-count-notice", "history-link", "home-special-modes-grid"].filter((id) => !doc.querySelector(`#game-hub-screen #${id}`)), [], "F: 昔の「ゲーム」の画面と、その部品は残っている");
  const screens = await fetchText("js/screens.js");
  assertEqual(screens.includes('gameGuide: document.getElementById("game-guide-screen")') && screens.includes('gameHub: document.getElementById("game-hub-screen")'), true, "F: 画面の一覧に gameGuide（gameHub も残す）");
  const main = await fetchText("js/main.js");
  const openFromGuide = main.slice(main.indexOf("function openFromGuide(open)"), main.indexOf("function openAppGuide("));
  assertEqual(["open.home", "open.click", "open.mode", "open.gameGuide", "open.appGuide", "open.intro", "open.help"].filter((key) => !openFromGuide.includes(key)), [], "F: main.js がガイドの「開く」の形をすべて扱う");
  assertEqual(openFromGuide.includes("runHomeAction(open.home)") && openFromGuide.includes("openSpecialModeById(open.mode)"), true, "F: 「開く」はホームのボタン・ゲームのカードと同じ処理");
  assertEqual(main.includes("openGameGuide: () => openGameGuide(),") && main.includes("openAppGuide: () => openAppGuide(),"), true, "F: ホームへ2つのガイドの開き方を渡す");
  assertEqual(main.includes('openGuideSection(target.sectionId, searchScreen);'), true, "F: 全体検索の「ガイドで詳しく見る」はその項目を開き、戻ると検索へ");
  const helpStart = main.indexOf("function openSpecialModeHelp(modeId)");
  assertEqual(main.slice(helpStart, helpStart + 900).includes("openGameGuide(modeId);"), true, "F: 「？」の説明が無いモード（アウトロ・一瞬）の「？」はゲームのガイドを開く（何も起きない、をなくす）");
  const sw = await fetchText("sw.js");
  assertEqual(['"./js/gameGuideScreen.js"', '"./js/data/gameGuideContent.js"', '"./css/guides.css"'].every((file) => sw.includes(file)), true, "F: 新しいファイルはオフラインでも使える（APP_SHELL）");
  assertEqual(/const CACHE_VERSION = "v405";/.test(sw), true, "F: CACHE_VERSION は変えていない（統合のときに上げる）");
  assertEqual(html.includes('<link rel="stylesheet" href="css/guides.css">'), true, "F: css/guides.css を読み込む");
  const css = await fetchText("css/guides.css");
  assertEqual(css.includes("@media (prefers-reduced-motion: reduce)"), true, "F: 動きを減らす設定に合わせる");
  assertEqual(/animation\s*:/.test(css), false, "F: ずっと動き続けるアニメーションは使わない");
  assertEqual((css.match(/min-height:\s*(\d+)px/g) ?? []).map((rule) => Number(rule.match(/\d+/)[0])).every((px) => px >= 44), true, "F: 押せる部品の高さは 44px 以上");
  const guidePack = await fetchText("guide-data-pack.html");
  assertEqual(guidePack.includes("ホーム画面を一番下までスクロール"), false, "F: 画像つきの入れ方：今は無い道（ホームの一番下）を案内しない");
  assertEqual(guidePack.includes("「データを追加・更新」"), true, "F: 画像つきの入れ方：今の道（マイページ・データ →［データを追加・更新］）");
}
