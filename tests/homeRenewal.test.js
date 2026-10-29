// リニューアル第2段階（2026-10-30）のテスト：
//   A. 画面の行き来の記録（ナビゲーションスタック）と、端末の「戻る」の判断（js/appNavigationStack.js）
//   B. 端末の「戻る」の動き（偽物の履歴の上で js/appHistory.js を動かす：戻る・進む・モーダル・クイズ中・対戦中）
//   C. お祝いポップアップの順番待ち（1回の起動で1件・ローテーション。js/centerCelebration.js）
//   D. ホームのプレイヤーのバー・［すぐ遊ぶ］の純粋関数（js/homeScreen.js）
//   E. ホームの入口がそれぞれ正しい画面へつながっていること（index.html・js/main.js・js/homeScreen.js のソース確認）
import { assertEqual } from "./test-utils.js";
import {
  createNavStack,
  planScreenChange,
  applyScreenChange,
  planSystemBack,
  findFallbackIndex,
  resolveHubReturn,
  GUARDED_SCREENS,
  HUB_OF_SCREEN,
} from "../js/appNavigationStack.js";
import { chooseCelebrationForLaunch, pickLaunchCelebration, resetCelebrationLaunchStateForTest } from "../js/centerCelebration.js";
import { buildHomePlayerStats, parseQuickPlaySelection, describeQuickPlaySelection } from "../js/homeScreen.js";
import { GAME_HUB_GROUPS, HOME_SPECIAL_MODES_ORDER } from "../js/specialModesScreen.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

// 画面名の並びを順に移動したときのスタックを作る（テスト用の小さな道具）
function walk(screens) {
  let stack = createNavStack(screens[0]);
  const plans = [];
  for (const screen of screens.slice(1)) {
    const plan = planScreenChange(stack, screen);
    plans.push(plan.type);
    stack = applyScreenChange(stack, plan, screen);
  }
  return { stack, plans };
}

function runNavigationStackTests() {
  console.log("--- リニューアル A：ナビゲーションスタック ---");
  const a = walk(["start", "gameHub", "lyricsQuizSetup"]);
  assertEqual(a.plans, ["push", "push"], "A: 新しい画面へ進むたびに履歴を1件積む");
  assertEqual([a.stack.entries, a.stack.index], [["start", "gameHub", "lyricsQuizSetup"], 2], "A: 記録は通った順");

  const back = planScreenChange(a.stack, "gameHub");
  assertEqual(back, { type: "back", toIndex: 1, steps: 1 }, "A: アプリの［戻る］で1つ前の画面へ → ブラウザの履歴も1件戻す");
  const home = planScreenChange(a.stack, "start");
  assertEqual(home, { type: "back", toIndex: 0, steps: 2 }, "A: ホームへ戻るときは、ホームの記録まで戻す（履歴が増え続けない）");
  assertEqual(planScreenChange(a.stack, "lyricsQuizSetup"), { type: "none" }, "A: 同じ画面のままなら何もしない");

  const afterBack = applyScreenChange(a.stack, back, "gameHub");
  assertEqual([afterBack.entries.length, afterBack.index], [3, 1], "A: 戻っても「進む」用の記録は残る");
  const pushed = applyScreenChange(afterBack, planScreenChange(afterBack, "timeAttackSetup"), "timeAttackSetup");
  assertEqual(pushed.entries, ["start", "gameHub", "timeAttackSetup"], "A: 戻った後に別の画面へ進むと、先の記録は捨てる");

  const onboarding = walk(["onboarding", "start"]);
  assertEqual([onboarding.plans, onboarding.stack.entries], [["replace"], ["start"]], "A: 初回セットアップ → ホームは書き換え（戻るでセットアップへ戻らない）");

  const retry = walk(["start", "gameHub", "quiz", "result", "quiz"]);
  assertEqual([retry.plans[3], retry.stack.index], ["back", 2], "A: 結果 →［もう一度］で問題画面へ：記録を巻き戻す（履歴が伸び続けない）");

  // 端末の「戻る」の判断
  assertEqual(planSystemBack({ screen: "songlist", modalOpen: true, hasBackControl: true }).type, "closeModal", "A: モーダルが開いていれば、まずモーダルを閉じる");
  assertEqual(planSystemBack({ screen: "onlineBattleLobby", modalOpen: false, hasBackControl: true }).type, "blocked", "A: オンライン対戦のルームでは端末の戻るを受け付けない");
  assertEqual(planSystemBack({ screen: "onlineLyricsBattleQuestion", modalOpen: false, hasBackControl: false }).type, "blocked", "A: オンライン対戦の問題中も受け付けない");
  assertEqual(planSystemBack({ screen: "quiz", modalOpen: false, hasBackControl: true }).type, "clickBack", "A: クイズ中は［タイトルへ］を押したのと同じ（やめますか？の確認が出る）");
  assertEqual(planSystemBack({ screen: "tvAppearances", modalOpen: false, hasBackControl: true }).type, "clickBack", "A: ふつうの画面は画面の［戻る］と同じ動き");
  assertEqual(planSystemBack({ screen: "result", modalOpen: false, hasBackControl: false }).type, "fallback", "A: ［戻る］が無い画面は記録の前の画面へ");
  assertEqual(planSystemBack({ screen: "quiz", modalOpen: false, hasBackControl: false }).type, "blocked", "A: 問題画面で［タイトルへ］が隠れているとき（オンライン対戦中）は抜けさせない");
  assertEqual(["onboarding", "partyBattlePlay", "onlineBattleCountdown"].every((screen) => GUARDED_SCREENS.has(screen)), true, "A: 受け付けない画面の一覧");

  const played = walk(["start", "gameHub", "quiz", "result"]).stack;
  assertEqual(findFallbackIndex(played, 2), 1, "A: 戻り先が問題画面なら飛ばしてゲーム画面へ（終わった問題画面へは戻さない）");
  assertEqual(findFallbackIndex({ entries: ["quiz"], index: 0 }, 0), -1, "A: 戻れる画面が無ければ -1（ホームへ）");

  // まとめ画面（ハブ）への戻り
  const viaHub = walk(["start", "gameHub", "lyricsQuizSetup"]).stack;
  assertEqual(resolveHubReturn(viaHub, "lyricsQuizSetup", "start"), "gameHub", "A: ゲームから開いた設定画面の［戻る］はゲームへ");
  const direct = walk(["start", "liveCallModeList"]).stack;
  assertEqual(resolveHubReturn(direct, "liveCallModeList", "start"), "start", "A: ホームのライブコールから開いたときはホームへ");
  const viaMusic = walk(["start", "musicHub", "songlist"]).stack;
  assertEqual(resolveHubReturn(viaMusic, "songlist", "start"), "musicHub", "A: 楽曲・歌詞 → 収録曲一覧の［戻る］は楽曲・歌詞へ");
  assertEqual(resolveHubReturn(viaMusic, "songlist", "appSearch"), "appSearch", "A: ホーム以外への［戻る］は変えない");
  assertEqual(resolveHubReturn(walk(["start", "guideHub", "liveGuide"]).stack, "liveGuide", "start"), "guideHub", "A: ガイド → ライブ初心者ガイドの［戻る］はガイドへ");
  assertEqual(Object.values(HUB_OF_SCREEN).every((hub) => ["gameHub", "musicHub", "guideHub"].includes(hub)), true, "A: 戻り先のまとめ画面は3つだけ");
}

// ---- B. 端末の「戻る」の動き：js/appHistory.js を、偽物の履歴（本物と同じく go() の結果が後から popstate で届く）と
//      小さな画面（ホーム・検索・曲一覧・ライブ・クイズ・対戦ルーム＋モーダル）の上で動かす。本物のブラウザ履歴は汚さない
//      （本物のブラウザでの確認は、Edge の自動操作で page.go_back() を使って別に行う：renewal-notes/stage2.md）。
function createFakeHistory() {
  const target = new EventTarget();
  const entries = [{ state: null }];
  let index = 0;
  const api = {
    scrollRestoration: "auto",
    get state() {
      return entries[index].state;
    },
    get length() {
      return entries.length;
    },
    pushState(state) {
      entries.splice(index + 1);
      entries.push({ state: JSON.parse(JSON.stringify(state)) });
      index = entries.length - 1;
    },
    replaceState(state) {
      entries[index] = { state: JSON.parse(JSON.stringify(state)) };
    },
    go(delta) {
      const next = index + delta;
      if (delta === 0 || next < 0 || next >= entries.length) return;
      setTimeout(() => {
        index = next;
        target.dispatchEvent(new PopStateEvent("popstate", { state: entries[index].state }));
      }, 5);
    },
    back() {
      api.go(-1);
    },
    forward() {
      api.go(1);
    },
  };
  return { api, target, getIndex: () => index };
}

const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

async function runHistoryIntegrationTests() {
  console.log("--- リニューアル B：端末の「戻る」（History API の動き） ---");
  // 小さなアプリの画面（ページの外に置き、hidden で切り替える）
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:-3000px;top:0;width:390px;";
  root.innerHTML = `
    <section id="hr-s-start"></section>
    <section id="hr-s-appSearch" hidden><button class="back-link" id="hr-search-back">戻る</button><input id="hr-q"></section>
    <section id="hr-s-songlist" hidden><button class="back-link" id="hr-songlist-back">戻る</button><input id="hr-filter"></section>
    <section id="hr-s-liveHub" hidden><button class="back-link" id="hr-live-back">戻る</button></section>
    <section id="hr-s-quiz" hidden><button class="quiz-back-link" id="hr-quiz-back">タイトルへ</button></section>
    <section id="hr-s-onlineBattleLobby" hidden><button class="back-link" id="hr-lobby-leave">ルームを出る</button></section>
    <div id="hr-modal" class="modal-overlay" hidden><button id="hr-modal-close">閉じる</button></div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector(`#${id}`);
  const screens = ["start", "appSearch", "songlist", "liveHub", "quiz", "onlineBattleLobby"];
  const listeners = [];
  let current = "start";
  const show = (name) => {
    screens.forEach((screen) => ($(`hr-s-${screen}`).hidden = screen !== name));
    current = name;
    listeners.forEach((listener) => listener(name));
  };
  let liveInnerViews = 1; // ライブページの中の表示の数（中で戻れる）
  let quitConfirmOpened = 0;
  let lobbyLeft = 0;
  $("hr-search-back").addEventListener("click", () => show("start"));
  // 検索から開いた曲一覧の［戻る］：いったんホームへ移ってから検索へ（本物の main.js と同じ二段の動き）
  $("hr-songlist-back").addEventListener("click", () => {
    show("start");
    show("appSearch");
  });
  $("hr-live-back").addEventListener("click", () => {
    if (liveInnerViews > 1) liveInnerViews -= 1;
    else show("start");
  });
  $("hr-quiz-back").addEventListener("click", () => {
    quitConfirmOpened += 1;
    $("hr-modal").hidden = false; // 「やめますか？」の確認
  });
  $("hr-lobby-leave").addEventListener("click", () => (lobbyLeft += 1));
  $("hr-modal-close").addEventListener("click", () => ($("hr-modal").hidden = true));

  const fake = createFakeHistory();
  const appHistory = await import(`../js/appHistory.js?test=${Date.now()}`);
  appHistory.initAppHistory({
    initialScreen: "start",
    onScreenChange: (listener) => listeners.push(listener),
    navigate: (screen) => show(screen),
    getScreenElement: (name) => $(`hr-s-${name}`),
    historyApi: fake.api,
    popStateTarget: fake.target,
    domRoot: root,
  });
  const snapshot = () => appHistory.getNavStackSnapshot();

  // ホーム → 検索（検索語を入れる）→ 曲一覧（絞り込みを入れる）。操作ごとに少し待つ（1回の操作の最後の画面だけを記録するため）
  show("appSearch");
  $("hr-q").value = "夏名残";
  await wait();
  show("songlist");
  $("hr-filter").value = "表題曲";
  await wait();
  assertEqual(snapshot().entries, ["start", "appSearch", "songlist"], "B: 画面を移るたびに記録が積まれる");
  assertEqual([fake.api.length, fake.api.state?.screen], [3, "songlist"], "B: ブラウザの履歴も1件ずつ増え、画面名が入る");
  assertEqual(fake.api.scrollRestoration, "manual", "B: スクロール位置はアプリが戻す（ブラウザには戻させない）");

  // 端末の「戻る」→ 曲一覧の［戻る］と同じ動き（いったんホーム → 検索）。途中のホームは記録に残らない
  fake.api.back();
  await wait(120);
  assertEqual([current, $("hr-q").value], ["appSearch", "夏名残"], "B: 端末の戻るで、1つ前の画面（検索）へ戻り、検索語が残る");
  assertEqual([snapshot().index, fake.getIndex()], [1, 1], "B: 記録とブラウザの位置がそろっている");

  // 「進む」で曲一覧へ（絞り込みはそのまま）
  fake.api.forward();
  await wait(120);
  assertEqual([current, $("hr-filter").value], ["songlist", "表題曲"], "B: 進むで曲一覧へ（絞り込みが残る）");

  // アプリの［戻る］→ ブラウザの履歴も1件戻る（アプリの戻ると端末の戻るがずれない）
  $("hr-songlist-back").click();
  await wait(120);
  assertEqual([current, fake.api.state?.screen, fake.getIndex(), snapshot().index], ["appSearch", "appSearch", 1, 1], "B: アプリの［戻る］でブラウザの履歴も戻る");

  // モーダル：開くと履歴が1件増え、端末の戻るでモーダルだけ閉じる
  $("hr-modal").hidden = false;
  await wait();
  assertEqual(fake.api.state?.modal, true, "B: モーダルを開くと履歴を1件積む");
  fake.api.back();
  await wait(120);
  assertEqual([$("hr-modal").hidden, current, fake.api.state?.screen, fake.api.state?.modal ?? false], [true, "appSearch", "appSearch", false], "B: 端末の戻るは、まずモーダルを閉じる（画面は変わらない）");
  // 画面のボタンで閉じたときは、積んだ1件を戻す
  $("hr-modal").hidden = false;
  await wait();
  $("hr-modal-close").click();
  await wait(120);
  assertEqual([fake.getIndex(), fake.api.state?.modal ?? false], [1, false], "B: 画面のボタンでモーダルを閉じると、積んだ履歴も戻す");

  // ライブページの中の表示：端末の戻るで中の表示が1つ戻る（画面はそのまま）→ もう一度でホーム
  show("liveHub");
  liveInnerViews = 2;
  await wait();
  fake.api.back();
  await wait(120);
  assertEqual([current, liveInnerViews, fake.api.state?.screen], ["liveHub", 1, "liveHub"], "B: ライブページは中の表示が1つ戻る（画面は出ない）");
  fake.api.back();
  await wait(120);
  assertEqual([current, snapshot().index], ["start", 0], "B: もう一度戻るとホームへ（記録もホームまで戻る）");

  // クイズ中：端末の戻る →［タイトルへ］と同じ（「やめますか？」の確認を出すだけ）。もう一度戻ると確認が閉じる
  show("quiz");
  await wait();
  fake.api.back();
  await wait(150);
  assertEqual([quitConfirmOpened, current, $("hr-modal").hidden], [1, "quiz", false], "B: クイズ中の端末の戻るは「やめますか？」の確認を出すだけ");
  fake.api.back();
  await wait(150);
  assertEqual([$("hr-modal").hidden, current], [true, "quiz"], "B: もう一度戻ると確認が閉じる（クイズは続く）");
  // 「やめる」相当：確認が開いた状態でホームへ（モーダルの1件を含めて、ホームの記録まで戻る）
  $("hr-quiz-back").click();
  await wait();
  $("hr-modal").hidden = true;
  show("start");
  await wait(150);
  assertEqual([current, fake.getIndex(), snapshot().index], ["start", 0, 0], "B: 確認からホームへ移ると、履歴もホームの位置へ");

  // オンライン対戦のルーム：端末の戻るは受け付けない（ルームを出るボタンは押さない）
  show("onlineBattleLobby");
  await wait();
  const lengthBefore = fake.api.length;
  fake.api.back();
  await wait(150);
  assertEqual([current, lobbyLeft, fake.api.state?.screen], ["onlineBattleLobby", 0, "onlineBattleLobby"], "B: 対戦のルームでは端末の戻るで抜けない（画面のボタンを使う）");
  assertEqual(fake.api.length, lengthBefore, "B: 受け付けなかったときは、履歴を元の位置へ積み直す");
  assertEqual(document.querySelector(".app-nav-toast")?.textContent.includes("画面の中のボタン"), true, "B: 受け付けなかった理由を短く案内する");
  document.querySelector(".app-nav-toast")?.remove();
  root.remove();
}

// ---- C. お祝いポップアップ ----
function runCelebrationQueueTests() {
  console.log("--- リニューアル C：お祝いポップアップの順番待ち ---");
  const a = { id: "a" };
  const b = { id: "b" };
  assertEqual(chooseCelebrationForLaunch([], {}), null, "C: 候補が無ければ出さない");
  assertEqual(chooseCelebrationForLaunch([a, b], {})?.id, "a", "C: どれもまだ出していなければ並び順の最初");
  assertEqual(chooseCelebrationForLaunch([a, b], { a: 1000 })?.id, "b", "C: 前回 a を出したら、次の起動は b（同じものばかり出ない）");
  assertEqual(chooseCelebrationForLaunch([a, b], { a: 3000, b: 2000 })?.id, "b", "C: 一番長く出していないものから");

  // 1回の起動で1件だけ（2件とも条件を満たしていても、2件目は出さない）
  const prefix = "player.home-renewal-test.";
  const songs = [{ id: "natsunagori-summer-tune", center: ["大場花菜"] }];
  const cleanup = () => {
    resetCelebrationLaunchStateForTest();
    ["obaCenterNatsunagori", "yumeNoTsuzuki"].forEach((id) => {
      sessionStorage.removeItem(`equalLoveIntroQuiz.${prefix}seenCelebration.${id}`);
      localStorage.removeItem(`equalLoveIntroQuiz.${prefix}celebrationLastShownAt.${id}`);
    });
  };
  cleanup();
  assertEqual(pickLaunchCelebration(songs, prefix)?.id, "obaCenterNatsunagori", "C: 起動時は1件目");
  localStorage.setItem(`equalLoveIntroQuiz.${prefix}celebrationLastShownAt.obaCenterNatsunagori`, String(Date.now()));
  assertEqual(pickLaunchCelebration(songs, prefix)?.id, "yumeNoTsuzuki", "C: 前回1件目を出していれば、次の起動は2件目");
  sessionStorage.setItem("equalLoveIntroQuiz.celebrationShownThisLaunch", "true");
  assertEqual(pickLaunchCelebration(songs, prefix), null, "C: この起動ですでに1件出していれば、もう出さない（2枚続けて出ない）");
  cleanup();
}

// ---- D. ホームの純粋関数 ----
function runHomePureFunctionTests() {
  console.log("--- リニューアル D：プレイヤーのバー・すぐ遊ぶ ---");
  assertEqual(buildHomePlayerStats([], 27), { rankLabel: "これから挑戦！", titlesText: "称号 0/27" }, "D: 称号0個は「これから挑戦！」");
  assertEqual(buildHomePlayerStats(["equal_love_complete", "equal_love_master"], 27).rankLabel, "＝LOVE完全制覇", "D: ＝LOVE完全制覇が一番上");
  assertEqual(buildHomePlayerStats(["unknown_id"], 27), { rankLabel: "CHALLENGER", titlesText: "称号 1/27" }, "D: 代表にならない称号だけなら CHALLENGER");
  assertEqual(parseQuickPlaySelection('{"questionCount":"10","category":"all"}'), { questionCount: "10", category: "all" }, "D: 前回の出題数・カテゴリを読める");
  assertEqual(parseQuickPlaySelection('{"questionCount":"7","category":"all"}'), null, "D: 無い選択肢は使わない");
  assertEqual(parseQuickPlaySelection("壊れた値"), null, "D: 壊れた値は使わない");
  assertEqual(describeQuickPlaySelection({ questionCount: "5", category: "title-track" }), "イントロクイズ 5問・表題曲のみ", "D: すぐ遊ぶの説明");
  const grouped = GAME_HUB_GROUPS.flatMap((group) => group.modeIds);
  assertEqual([...grouped].sort(), [...HOME_SPECIAL_MODES_ORDER].sort(), "D: ゲーム画面のグループに10モードすべてが1回ずつ入っている");
  const orderInGroups = GAME_HUB_GROUPS.every((group) => {
    const positions = group.modeIds.map((id) => HOME_SPECIAL_MODES_ORDER.indexOf(id));
    return positions.every((position, i) => i === 0 || position > positions[i - 1]);
  });
  assertEqual(orderInGroups, true, "D: グループの中の並びは今までの並び順のまま");
}

// ---- E. ホームの入口の配線 ----
async function runHomeEntryWiringTests() {
  console.log("--- リニューアル E：ホームの入口 → 正しい画面 ---");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const home = doc.getElementById("start-screen");
  const order = [...home.querySelectorAll(".home-player-bar, #home-game-start-button, #home-live-call-button, #app-search-link, .home-entry-grid")].map(
    (element) => element.id || element.className.split(" ").find((name) => name.startsWith("home-"))
  );
  assertEqual(order, ["home-player-bar", "home-game-start-button", "home-live-call-button", "app-search-link", "home-entry-grid"], "E: ホームの並び：プレイヤー → ゲームスタート → ライブコール → 検索 → 入口");
  const barIds = ["player-name-chip", "oshi-summary-chip", "player-hero-swatch", "home-player-rank", "home-player-titles", "fan-profiles-link", "home-leaderboard-link", "title-list-link"];
  assertEqual(barIds.filter((id) => !home.querySelector(`.home-player-bar #${id}`)), [], "E: プレイヤーのバーに名前・推し・ランク・称号・フレンド・ランキング");
  const entryIds = [...home.querySelectorAll(".home-entry-grid .home-entry-tile")].map((element) => element.id);
  assertEqual(entryIds, ["home-entry-music", "live-hub-link", "anniversary-home-link", "tv-appearances-home-link", "members-link", "home-entry-guides"], "E: 入口6つの並び");
  assertEqual(home.querySelector("#home-entry-settings") !== null, true, "E: 設定・データ管理の入口");
  // 移した要素がそれぞれの画面にあること（id は変えずに場所だけ移動）
  const placed = {
    "game-hub-screen": ["start-button", "home-special-modes-grid", "history-link", "question-count-notice", "mode-best-chip", "start-error"],
    "music-hub-screen": ["songlist-link", "songlist-favorites-link", "playlist-link", "continuous-play-link", "lyrics-search-link", "discography-link"],
    "guide-hub-screen": ["guide-link", "rules-link", "live-guide-link"],
    "settings-screen": ["sfx-toggle-button-start", "sfx-settings-open-button", "data-pack-import-section", "audio-import-section", "lyrics-import-section", "device-transfer-section", "data-recovery-section", "settings-account-protection-link"],
  };
  for (const [screenId, ids] of Object.entries(placed)) {
    assertEqual(ids.filter((id) => !doc.querySelector(`#${screenId} #${id}`)), [], `E: ${screenId} に移した要素がある`);
  }
  const allIds = [...doc.querySelectorAll("[id]")].map((element) => element.id);
  assertEqual(allIds.length, new Set(allIds).size, "E: id の重複が無い");
  const backLinks = ["game-hub", "music-hub", "guide-hub", "settings"].filter((name) => !doc.querySelector(`#${name}-screen #${name}-back-button.back-link`));
  assertEqual(backLinks, [], "E: まとめ画面はどれも共通の［戻る］（back-link）を持つ");

  const screens = await fetchText("js/screens.js");
  assertEqual(
    ['gameHub: document.getElementById("game-hub-screen")', 'musicHub: document.getElementById("music-hub-screen")', 'guideHub: document.getElementById("guide-hub-screen")', 'settings: document.getElementById("settings-screen")'].every((text) => screens.includes(text)),
    true,
    "E: 4つのまとめ画面を画面切り替えに登録"
  );
  const homeSource = await fetchText("js/homeScreen.js");
  const wiring = [
    ['elements.gameStartButton.addEventListener("click"', 'callbacks.navigate("gameHub")'],
    ['elements.musicEntry.addEventListener("click"', 'callbacks.navigate("musicHub")'],
    ['elements.guidesEntry.addEventListener("click"', 'callbacks.navigate("guideHub")'],
    ['elements.settingsEntry.addEventListener("click"', 'callbacks.navigate("settings")'],
    ['elements.quickPlayButton.addEventListener("click"', "elements.startButton.click()"],
    ['elements.liveCallButton.addEventListener("click"', "openLiveCallEntry()"],
  ];
  for (const [listener, action] of wiring) {
    const start = homeSource.indexOf(listener);
    const body = start >= 0 ? homeSource.slice(start, homeSource.indexOf("});", start)) : "";
    assertEqual(body.includes(action), true, `E: ${listener.split(".")[1]} → ${action}`);
  }
  assertEqual(homeSource.includes("export function setLiveCallEntryHandler(handler)"), true, "E: ライブコールの入口は第3段階で差し替えられる（setLiveCallEntryHandler）");
  const main = await fetchText("js/main.js");
  const mainWiring = [
    ["fanProfilesLinkElement.addEventListener", 'navigateWithScrollMemory("fanProfiles")'],
    ['document.getElementById("live-hub-link").addEventListener', "openLiveHubFrom("],
    ['document.getElementById("anniversary-home-link")', "openAnniversaryFrom("],
    ['document.getElementById("tv-appearances-home-link")', "openTvAppearancesFrom("],
    ["membersLinkElement.addEventListener", 'navigateWithScrollMemory("members")'],
    ['document.getElementById("app-search-link").addEventListener', 'navigateWithScrollMemory("appSearch")'],
  ];
  for (const [listener, action] of mainWiring) {
    const start = main.indexOf(listener);
    const body = start >= 0 ? main.slice(start, main.indexOf("});", start)) : "";
    assertEqual(body.includes(action), true, `E: main.js ${listener.slice(0, 48)} → ${action}`);
  }
  assertEqual(main.includes("openDefaultLiveCall: () =>") && main.includes('[data-mode-id="liveCallMode"] .special-mode-card-tap-target'), true, "E: 第2段階のライブコールは今のライブコールモードを開く");
  assertEqual(main.includes("const targetScreen = resolveBackTarget(fromScreen, requestedScreen);"), true, "E: ［戻る］でまとめ画面へ戻す判断を navigateWithScrollMemory に入れた");
  assertEqual(main.includes("initAppHistory({"), true, "E: 端末の戻るの仕組みを起動する");
  const sw = await fetchText("sw.js");
  assertEqual(["./css/homeRenewal.css", "./js/homeScreen.js", "./js/appHistory.js", "./js/appNavigationStack.js"].filter((file) => !sw.includes(`"${file}"`)), [], "E: 新しいファイルをオフライン用キャッシュに追加");
  assertEqual(/media="print" onload="this\.media='all'"/.test(html), true, "E: Google Fonts は画面の表示を待たせない読み込み方");
  const css = await fetchText("css/style.css");
  assertEqual(["Hiragino", "Yu Gothic", "Noto Sans JP", "sans-serif"].every((name) => css.slice(0, 4000).includes(name)), true, "E: フォントが読み込めないときの代わり（ヒラギノ・游ゴシック・Noto Sans JP）");
}

export async function runHomeRenewalTests() {
  runNavigationStackTests();
  await runHistoryIntegrationTests();
  runCelebrationQueueTests();
  runHomePureFunctionTests();
  await runHomeEntryWiringTests();
}
