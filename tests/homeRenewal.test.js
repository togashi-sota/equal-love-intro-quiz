// リニューアル第2段階（2026-10-30）のテスト：
//   A. 画面の行き来の記録（ナビゲーションスタック）と、端末の「戻る」の判断（js/appNavigationStack.js）
//   B. 端末の「戻る」の動き（偽物の履歴の上で js/appHistory.js を動かす：戻る・進む・モーダル・クイズ中・対戦中）
//   C. お祝いポップアップの順番待ち（1回の起動で1件・ローテーション。js/centerCelebration.js）
//   D. ホーム案F の純粋関数（ランク・出題設定・自己ベスト・案内・バックアップの表示・目次・入口の行き先。js/homeScreen.js）
//   D2. バックアップの状態の取り出し口（js/backupSync.js の getBackupStatusForDisplay。同期は動かさない）
//   D3. 本物のホームの部品で、ホームとゲーム画面の出題設定の同期・［この設定でスタート］の経路
//   E. ホームの並び・入口がそれぞれ正しい画面へつながっていること（index.html・js/main.js・js/homeScreen.js のソース確認）
//   （2026-10-30 ホーム案F：D・E を作り直し、D2・D3 を追加）
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
import {
  buildHomePlayerStats,
  parseQuickPlaySelection,
  QUESTION_COUNT_OPTIONS,
  CATEGORY_OPTIONS,
  DEFAULT_INTRO_SELECTION,
  formatIntroBest,
  buildQuestionCountNotice,
  describeIntroPool,
  describeBackupStatus,
  buildHomeDataAlert,
  HOME_NAV_SECTIONS,
  pickCurrentNavIndex,
  HOME_ACTIONS,
  initHomeScreen,
} from "../js/homeScreen.js";
import {
  getBackupStatusForDisplay,
  recordSyncResultForDisplayForTest,
  resetBackupDisplayStateForTest,
  isBackupWorthyLogicalKey,
} from "../js/backupSync.js";
import { getActivePlayer } from "../js/playerProfile.js";
import { resolvePreferredModeOpen } from "../js/liveCallScreen.js";
import { SONGS } from "../js/data/songs.js";
import { filterSongsByCategory } from "../js/quiz.js";
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

// ---- D. ホーム（案F）の純粋関数 ----
function runHomePureFunctionTests() {
  console.log("--- リニューアル D：ホーム案F の純粋関数（ランク・出題設定・自己ベスト・案内・バックアップ・目次） ---");
  assertEqual(buildHomePlayerStats([], 27), { rankLabel: "これから挑戦！", titlesText: "称号 0/27" }, "D: 称号0個は「これから挑戦！」");
  assertEqual(buildHomePlayerStats(["equal_love_complete", "equal_love_master"], 27).rankLabel, "＝LOVE完全制覇", "D: ＝LOVE完全制覇が一番上");
  assertEqual(buildHomePlayerStats(["unknown_id"], 27), { rankLabel: "CHALLENGER", titlesText: "称号 1/27" }, "D: 代表にならない称号だけなら CHALLENGER");

  // 出題数・カテゴリ（値はゲーム画面のラジオボタンと同じ。全問は表示名だけで、値は all）
  assertEqual(QUESTION_COUNT_OPTIONS, [["5", "5問"], ["10", "10問"], ["20", "20問"], ["50", "50問"], ["all", "全問"]], "D: 出題数は 5/10/20/50/全問（全問の値は all）");
  assertEqual(CATEGORY_OPTIONS.map(([value, label]) => `${value}:${label}`), ["title-track:表題曲のみ", "title-and-group:表題曲＋全員曲", "all:全曲"], "D: カテゴリの値と表示名");
  assertEqual(DEFAULT_INTRO_SELECTION, { questionCount: "5", category: "title-track" }, "D: 初めては 5問・表題曲のみ");
  assertEqual(parseQuickPlaySelection('{"questionCount":"10","category":"all"}'), { questionCount: "10", category: "all" }, "D: 前回の出題数・カテゴリを読める");
  assertEqual(parseQuickPlaySelection('{"questionCount":"all","category":"title-and-group"}'), { questionCount: "all", category: "title-and-group" }, "D: 全問（all）も読める");
  assertEqual(parseQuickPlaySelection('{"questionCount":"7","category":"all"}'), null, "D: 無い選択肢は使わない");
  assertEqual(parseQuickPlaySelection("壊れた値"), null, "D: 壊れた値は使わない");

  // 自己ベスト：ゲーム画面のチップと同じ文（main.js の updateModeBestScoreDisplay もこの関数を使う）
  assertEqual(formatIntroBest("5", "title-track", 0), { condition: "5問・表題のみ", value: "ベスト 記録なし", empty: true }, "D: 自己ベスト：記録なし");
  assertEqual(formatIntroBest("all", "all", 87), { condition: "全問・全曲", value: "ベスト 87点", empty: false }, "D: 自己ベスト：全問・全曲 ベスト 87点");
  assertEqual(formatIntroBest("20", "title-and-group", 140).condition, "20問・表題＋全員", "D: 自己ベスト：表題＋全員");

  // 案内
  assertEqual(buildQuestionCountNotice("50", 21), "対象曲数が50曲未満のため、全21問を出題します", "D: 出題数の案内（ゲーム画面と同じ文）");
  assertEqual(buildQuestionCountNotice("5", 21), "", "D: 足りていれば出題数の案内は出さない");
  assertEqual(buildQuestionCountNotice("all", 3), "", "D: 全問では出題数の案内は出さない");
  const full = describeIntroPool({ questionCount: "5", category: "title-track", categoryCount: 23, playableCount: 23, importedCount: 84 });
  assertEqual(full, { state: "ok", notices: [] }, "D: 全部そろっていれば案内なし");
  const partial = describeIntroPool({ questionCount: "5", category: "title-track", categoryCount: 23, playableCount: 21, importedCount: 60 });
  assertEqual(partial.notices, ["表題曲 23曲のうち、この端末に音源がある21曲から出題します"], "D: 音源が一部なら「表題曲 N曲のうち、この端末に音源がある M曲から出題します」");
  const both = describeIntroPool({ questionCount: "50", category: "title-and-group", categoryCount: 62, playableCount: 40, importedCount: 40 });
  assertEqual(both.notices, ["対象曲数が50曲未満のため、全40問を出題します", "表題曲＋全員曲 62曲のうち、この端末に音源がある40曲から出題します"], "D: 出題数の案内と音源の案内を両方");
  assertEqual(describeIntroPool({ questionCount: "all", category: "all", categoryCount: 84, playableCount: 84, importedCount: 84 }).notices, ["全問＝出題できる84曲をすべて出題します"], "D: 全問の説明");
  assertEqual(describeIntroPool({ questionCount: "5", category: "title-track", categoryCount: 23, playableCount: 0, importedCount: 0 }).state, "noAudio", "D: 音源が1曲も無い → 「音源を取り込む」");
  assertEqual(describeIntroPool({ questionCount: "5", category: "title-track", categoryCount: 23, playableCount: 2, importedCount: 10 }).state, "tooFew", "D: 4曲未満 → 遊べない（理由を出す）");

  // バックアップの状態（backup-status-spec.md）：確かめられたことだけ
  const now = new Date(2026, 9, 30, 15, 0).getTime();
  const at = new Date(2026, 9, 30, 14, 20).getTime();
  assertEqual(describeBackupStatus({ result: "synced", lastSuccessAt: at }, now), { kind: "ok", text: "記録・称号などは 14:20 にバックアップできました" }, "D: 書き込めた → 時刻つき");
  assertEqual(describeBackupStatus({ result: "claimed", lastSuccessAt: at }, now).kind, "ok", "D: claimed も書き込めた扱い");
  assertEqual(describeBackupStatus({ result: "no-change", lastSuccessAt: at }, now).kind, "ok", "D: 前回と同じ内容（no-change）→ 最後に書き込めた時刻のまま");
  assertEqual(describeBackupStatus({ result: null, lastSuccessAt: new Date(2026, 9, 28, 9, 5).getTime() }, now).text, "記録・称号などは 10/28 09:05 にバックアップできました", "D: 別の日の成功は日付つき");
  assertEqual(describeBackupStatus({ result: "denied", lastSuccessAt: at }, now), { kind: "error", text: "記録をバックアップに書き込めていません" }, "D: denied → 書き込めていません");
  assertEqual(describeBackupStatus({ result: "error", lastSuccessAt: null }, now).kind, "error", "D: error → 書き込めていません");
  assertEqual(describeBackupStatus({ result: null, lastSuccessAt: null }, now), { kind: "unknown", text: "バックアップはまだ確認していません" }, "D: 何も分からない → まだ確認していません");
  assertEqual(describeBackupStatus({ result: "no-auth", lastSuccessAt: null }, now).kind, "unknown", "D: no-auth → まだ確認していません");
  assertEqual(describeBackupStatus({ result: "synced", lastSuccessAt: null }, now).kind, "unknown", "D: 成功の時刻が無ければ「できました」と書かない");
  const allTexts = ["synced", "claimed", "denied", "error", "no-change", "no-auth", null].map((result) => describeBackupStatus({ result, lastSuccessAt: at }, now).text).join("");
  assertEqual(/いつでも|完全に|最新版/.test(allTexts), false, "D: 「いつでも」「完全に」「最新版」とは書かない");

  // 必要なときだけの案内
  assertEqual(buildHomeDataAlert({ importedCount: 0, backupKind: "ok" })?.title, "まず音源・歌詞を取り込もう", "D: 音源が1曲も無い → 取り込もう");
  assertEqual(buildHomeDataAlert({ importedCount: 30, backupKind: "error" })?.kind, "warn", "D: バックアップ失敗 → 注意");
  assertEqual(buildHomeDataAlert({ importedCount: 30, backupKind: "ok" }), null, "D: 問題なければ何も出さない");
  assertEqual(buildHomeDataAlert({ importedCount: 30, backupKind: "unknown" }), null, "D: 未確認だけでは出さない（「最新版です」とも言わない）");

  // 目次
  assertEqual(HOME_NAV_SECTIONS.map((section) => section.label), ["ゲーム", "ライブ", "楽曲", "＝LOVE", "マイ・データ"], "D: 目次の5つ");
  assertEqual(HOME_NAV_SECTIONS.find((section) => section.id === "my").target, "home-data-box", "D: マイ・データはデータの箱へスクロール");
  assertEqual(pickCurrentNavIndex([100, 800, 1400, 1900, 2400], 120, false), 0, "D: 一番上ではゲーム");
  assertEqual(pickCurrentNavIndex([-900, -200, 60, 700, 1200], 120, false), 2, "D: 目次のすぐ下を通り過ぎた最後のカード（楽曲）");
  assertEqual(pickCurrentNavIndex([-2000, -1500, -900, -300, 300], 120, true), 4, "D: ページの一番下ではマイ・データ");

  // 入口の行き先
  const modes = Object.values(HOME_ACTIONS).filter((action) => action.type === "mode").map((action) => action.value);
  assertEqual(modes, ["outroQuiz", "lyricsQuiz", "onlineBattle", "partyBattle", "weakSongs"], "D: ほかのゲーム：アウトロ・歌詞・オンライン・1台で対戦・苦手曲は、ゲーム画面のカードと同じ処理");
  assertEqual(modes.every((id) => HOME_SPECIAL_MODES_ORDER.includes(id)), true, "D: どれも実在するモード");
  assertEqual(HOME_ACTIONS["all-games"], { type: "navigate", value: "gameHub" }, "D: 全部のゲーム → ゲーム画面");
  assertEqual(["live-sheet", "live-live", "live-karaoke"].map((name) => HOME_ACTIONS[name].value), ["sheet", "live", "karaoke"], "D: コール表／ライブコール／カラオケ → その遊び方を選んだ曲一覧");
  assertEqual(HOME_ACTIONS.guides, { type: "navigate", value: "guideHub" }, "D: 使い方ガイド → ガイド画面");
  assertEqual(HOME_ACTIONS.settings, { type: "navigate", value: "settings" }, "D: 設定 → 設定・データ管理");

  // ライブコール：選んである遊び方を直接開くか
  const avail = { sheet: { ok: true }, live: { ok: false }, karaoke: { ok: true } };
  assertEqual([resolvePreferredModeOpen("sheet", avail), resolvePreferredModeOpen("live", avail), resolvePreferredModeOpen(null, avail), resolvePreferredModeOpen("penlight", avail)], ["sheet", null, null, null], "D: 使える遊び方だけ直接開く（使えなければ曲のページで理由）");

  // ゲーム画面のグループ（第2段階のまま）
  const grouped = GAME_HUB_GROUPS.flatMap((group) => group.modeIds);
  assertEqual([...grouped].sort(), [...HOME_SPECIAL_MODES_ORDER].sort(), "D: ゲーム画面のグループに10モードすべてが1回ずつ入っている");
}

// ---- D2. バックアップの状態の取り出し口（js/backupSync.js。同期・書き込みは動かさない） ----
function runBackupDisplayTests() {
  console.log("--- リニューアル D2：バックアップの状態の取り出し口 ---");
  const key = "equalLoveIntroQuiz.backupLastSuccessAt";
  const saved = localStorage.getItem(key);
  try {
    localStorage.removeItem(key);
    resetBackupDisplayStateForTest();
    const playerId = getActivePlayer().playerId;
    assertEqual(getBackupStatusForDisplay(), { result: null, lastSuccessAt: null, checkedThisSession: false }, "D2: 起動直後は何も分からない");
    recordSyncResultForDisplayForTest({ status: "synced" }, false, playerId, 1000);
    assertEqual(getBackupStatusForDisplay().lastSuccessAt, null, "D2: 書かずに済ませた（前回と同じ内容）ときは成功の時刻を残さない");
    recordSyncResultForDisplayForTest({ status: "synced" }, true, playerId, 2000);
    assertEqual(getBackupStatusForDisplay(), { result: "synced", lastSuccessAt: 2000, checkedThisSession: true }, "D2: 本当に書けたときだけ時刻を残す");
    recordSyncResultForDisplayForTest({ status: "error" }, true, playerId, 3000);
    assertEqual(getBackupStatusForDisplay(), { result: "error", lastSuccessAt: 2000, checkedThisSession: true }, "D2: 失敗しても前の成功の時刻は変えない");
    recordSyncResultForDisplayForTest({ status: "synced" }, true, "other-player", 4000);
    assertEqual(getBackupStatusForDisplay().lastSuccessAt, 2000, "D2: 別のプレイヤーの成功の時刻は出さない");
    assertEqual(isBackupWorthyLogicalKey("backupLastSuccessAt"), false, "D2: 成功の時刻はクラウドへ送るデータに入れない");
  } finally {
    resetBackupDisplayStateForTest();
    if (saved === null) localStorage.removeItem(key);
    else localStorage.setItem(key, saved);
  }
}

// ---- D3. 本物のホームの部品で：出題設定の同期・［この設定でスタート］がゲーム画面の［スタート］と同じ処理を1回だけ呼ぶ ----
async function runHomeIntroSyncTests() {
  console.log("--- リニューアル D3：ホームとゲーム画面の出題設定の同期・スタートの経路 ---");
  const key = "equalLoveIntroQuiz.homeQuickPlaySelection";
  const saved = localStorage.getItem(key);
  const doc = new DOMParser().parseFromString(await fetchText("index.html"), "text/html");
  const sandbox = document.createElement("div");
  sandbox.hidden = true;
  sandbox.appendChild(document.importNode(doc.getElementById("start-screen"), true));
  const hub = document.importNode(doc.querySelector("#game-hub-screen .game-hub-intro"), true);
  sandbox.appendChild(hub);
  document.body.appendChild(sandbox);
  try {
    localStorage.setItem(key, JSON.stringify({ questionCount: "20", category: "title-and-group" }));
    const homeRoot = sandbox.querySelector("#start-screen");
    const startButton = hub.querySelector("#start-button");
    const calls = { start: 0, data: 0, navigate: [], modes: [] };
    startButton.addEventListener("click", () => calls.start++);
    initHomeScreen(homeRoot, {
      songs: SONGS,
      getHighScore: (count, category) => (count === "20" && category === "title-and-group" ? 120 : 0),
      startButton,
      navigate: (name) => calls.navigate.push(name),
      playClickSound: () => {},
      onScreenChange: () => {},
      openGameMode: (id) => calls.modes.push(id),
      openDataManagement: () => calls.data++,
      openTransferRecovery: () => {},
      openCenters: () => {},
      openDiscographyWorks: () => {},
      openGroupCommercials: () => {},
    });
    const checked = (name) => hub.querySelector(`input[name="${name}"]:checked`)?.value;
    const homeChecked = (attr) => homeRoot.querySelector(`[${attr}][aria-checked="true"]`)?.getAttribute(attr);
    assertEqual([checked("question-count"), checked("category-filter")], ["20", "title-and-group"], "D3: 前回の設定をゲーム画面のラジオボタンへ戻す");
    assertEqual([homeChecked("data-home-count"), homeChecked("data-home-category")], ["20", "title-and-group"], "D3: ホームも同じ設定を表示");
    assertEqual(homeRoot.querySelector("#home-intro-best").textContent.replace(/\s+/g, " ").trim(), "🏆 20問・表題＋全員 ベスト 120点", "D3: ホームの自己ベスト（getHighScore の値・同じ文）");
    assertEqual([...homeRoot.querySelectorAll("[data-home-category-count]")].map((element) => element.textContent), ["23曲", "62曲", "84曲"].map((text, i) => `${filterSongsByCategory(SONGS, ["title-track", "title-and-group", "all"][i]).length}曲`), "D3: カテゴリの曲数は SONGS から数える");

    homeRoot.querySelector('[data-home-count="all"]').click();
    homeRoot.querySelector('[data-home-category="title-track"]').click();
    assertEqual([checked("question-count"), checked("category-filter")], ["all", "title-track"], "D3: ホームで選ぶ → ゲーム画面のラジオボタンも同じ値（全問の値は all）");
    assertEqual(JSON.parse(localStorage.getItem(key)), { questionCount: "all", category: "title-track" }, "D3: 選んだら保存（homeQuickPlaySelection）");
    const radio10 = hub.querySelector('input[name="question-count"][value="10"]');
    radio10.checked = true;
    radio10.dispatchEvent(new Event("change", { bubbles: true }));
    assertEqual(homeChecked("data-home-count"), "10", "D3: ゲーム画面で変える → ホームも同じ値");
    assertEqual(homeRoot.querySelector('[data-home-count="all"]').textContent, "全問", "D3: 全問は表示名");

    // スタート：音源がある状態にして押す（2回続けて押しても1回だけ）
    const start = homeRoot.querySelector("#home-intro-start-button");
    start.dataset.state = "ok";
    start.click();
    start.click();
    assertEqual(calls.start, 1, "D3: ［この設定でスタート］は #start-button を押したのと同じ。2回続けて押しても1回だけ");
    await new Promise((resolve) => setTimeout(resolve, 250));
    start.dataset.state = "noAudio";
    start.click();
    assertEqual([calls.start, calls.data], [1, 1], "D3: 音源が無いときは「音源を取り込む」＝データ管理を開く（クイズは始めない）");

    homeRoot.querySelector('[data-home-action="outro-quiz"]').click();
    homeRoot.querySelector('[data-home-action="all-games"]').click();
    homeRoot.querySelector('[data-home-action="settings"]').click();
    assertEqual([calls.modes, calls.navigate], [["outroQuiz"], ["gameHub", "settings"]], "D3: 入口ボタンの行き先（アウトロ・全部のゲーム・設定）");
  } finally {
    sandbox.remove();
    if (saved === null) localStorage.removeItem(key);
    else localStorage.setItem(key, saved);
  }
}

// ---- E. ホームの入口の配線（index.html・js/main.js のソース） ----
async function runHomeEntryWiringTests() {
  console.log("--- リニューアル E：ホーム案F の並び・入口 → 正しい画面 ---");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const home = doc.getElementById("start-screen");
  const order = [...home.querySelectorAll(".home-topbar, #app-search-link, #home-data-alert, #home-category-nav, .home-card")].map((element) => element.id || "home-topbar");
  assertEqual(order, ["home-topbar", "app-search-link", "home-data-alert", "home-category-nav", "home-card-game", "home-card-live", "home-card-music", "home-card-know", "home-card-my"], "E: ホームの並び：上部バー → 検索 → 案内 → 目次 → ゲーム・ライブ・楽曲・＝LOVE・マイページ");
  const barIds = ["player-name-chip", "oshi-summary-chip", "player-hero-swatch", "home-player-rank", "home-player-titles", "home-oshi-dot", "fan-profiles-link", "home-leaderboard-link", "title-list-link"];
  assertEqual(barIds.filter((id) => !home.querySelector(`.home-topbar #${id}`)), [], "E: 上部バーに名前・ランク・推し（色の点）・フレンド・ランキング・実績");
  assertEqual([...home.querySelectorAll(".home-topbar-actions .home-tact-label")].map((element) => element.textContent), ["フレンド", "ランキング", "実績"], "E: 右上の3つ");
  assertEqual(home.querySelectorAll("#home-category-nav [data-home-jump]").length, 5, "E: 目次は5つ");
  assertEqual(
    [...home.querySelectorAll("#home-category-nav [data-home-jump]")].map((button) => button.dataset.homeJump),
    HOME_NAV_SECTIONS.map((section) => section.target),
    "E: 目次の行き先（index.html と js/homeScreen.js が同じ）",
  );
  HOME_NAV_SECTIONS.forEach((section) => assertEqual(home.querySelector(`#${section.target}`) !== null && home.querySelector(`#${section.card}`) !== null, true, `E: 目次「${section.label}」の行き先がある`));
  const cardIds = (cardId) => [...home.querySelectorAll(`#${cardId} .home-chip`)].map((element) => element.id || element.dataset.homeAction);
  assertEqual(cardIds("home-card-game"), ["outro-quiz", "lyrics-quiz", "online-battle", "party-battle", "weak-songs", "all-games"], "E: ゲーム：ほかのゲーム6つ");
  assertEqual(cardIds("home-card-live"), ["live-sheet", "live-live", "live-karaoke", "live-hub-link", "live-guide"], "E: ライブ：コール表・ライブコール・カラオケ・ライブ履歴・初心者ガイド");
  assertEqual(cardIds("home-card-music"), ["songlist", "lyrics-search", "continuous-play", "playlists", "favorites", "works"], "E: 楽曲：楽曲一覧・歌詞検索・曲を聴く・プレイリスト・お気に入り・シングル・アルバム");
  assertEqual(cardIds("home-card-know"), ["members-link", "centers", "anniversary-home-link", "tv-appearances-home-link", "commercials"], "E: ＝LOVE：メンバー・歴代センター・周年ヒストリー・音楽番組・CM・企業コラボ");
  assertEqual(cardIds("home-card-my"), ["history", "guides", "settings"], "E: マイページ：プレイ履歴・使い方ガイド・設定（フレンド・ランキング・実績・プロフィールは置かない）");
  assertEqual([...home.querySelectorAll("#home-data-box [data-home-action]")].map((element) => element.dataset.homeAction), ["data-update", "data-transfer"], "E: データの箱：データを追加・更新／引き継ぎ・復旧");
  assertEqual(home.querySelector("#home-card-music .home-card-note")?.textContent, "曲の情報・歌詞は音源なしでも見られます", "E: 楽曲の一言");
  assertEqual(home.querySelector("#home-data-box .home-data-note")?.textContent, "音源・歌詞・コールはこの端末だけに保存。消えたときは入れ直しが必要です", "E: データの箱の一言");
  const usedActions = [...home.querySelectorAll("[data-home-action]")].map((element) => element.dataset.homeAction);
  assertEqual(usedActions.filter((name) => !HOME_ACTIONS[name]), [], "E: ホームのボタンの行き先はすべて HOME_ACTIONS にある");
  assertEqual(Object.keys(HOME_ACTIONS).filter((name) => !usedActions.includes(name)), [], "E: HOME_ACTIONS はすべてホームで使っている");
  // 「既存のボタンを押す」行き先が、正しい画面にあること
  const clickTargets = {
    "live-guide-link": "guide-hub-screen",
    "songlist-link": "music-hub-screen",
    "lyrics-search-link": "music-hub-screen",
    "continuous-play-link": "music-hub-screen",
    "playlist-link": "music-hub-screen",
    "songlist-favorites-link": "music-hub-screen",
    "history-link": "game-hub-screen",
  };
  Object.values(HOME_ACTIONS)
    .filter((action) => action.type === "click")
    .forEach((action) => assertEqual(doc.querySelector(`#${clickTargets[action.value]} #${action.value}`) !== null, true, `E: ${action.value} は ${clickTargets[action.value]} にある`));
  assertEqual(/デモ/.test(home.textContent), false, "E: 「デモ」「デモ未対応」の印は出さない");
  assertEqual(/最新版です|いつでも|完全に/.test(home.textContent), false, "E: 「最新版です」「いつでも」「完全に」とは書かない");
  assertEqual(["home-game-start-button", "home-quick-play-button", "home-live-call-button", "home-entry-music", "home-entry-guides", "home-entry-settings"].filter((id) => doc.getElementById(id)), [], "E: 案Bのボタン（ゲームスタート・すぐ遊ぶ など）は無い");
  assertEqual(doc.querySelector("#songlist-screen h2")?.textContent, "楽曲一覧", "E: 収録曲一覧の見出しは「楽曲一覧」");
  // 移した要素がそれぞれの画面にあること（id は変えずに場所だけ移動）
  const placed = {
    "game-hub-screen": ["start-button", "home-special-modes-grid", "history-link", "question-count-notice", "mode-best-chip", "start-error"],
    "music-hub-screen": ["songlist-link", "songlist-favorites-link", "playlist-link", "continuous-play-link", "lyrics-search-link", "discography-link"],
    "guide-hub-screen": ["guide-link", "rules-link", "live-guide-link"],
    "settings-screen": ["sfx-toggle-button-start", "sfx-settings-open-button", "data-management-section", "unified-pack-import-section", "data-pack-import-section", "audio-import-section", "lyrics-import-section", "device-transfer-section", "data-recovery-section", "settings-account-protection-link"],
  };
  for (const [screenId, ids] of Object.entries(placed)) {
    assertEqual(ids.filter((id) => !doc.querySelector(`#${screenId} #${id}`)), [], `E: ${screenId} に移した要素がある`);
  }
  assertEqual(doc.querySelector("#data-management-section #unified-pack-import-section")?.textContent.includes("最新版データを読み込む"), true, "E: データを追加・更新の行き先に「最新版データを読み込む」");
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
  assertEqual(homeSource.includes("callbacks.startButton.click();"), true, "E: ［この設定でスタート］は #start-button を押す（新しい開始処理を作らない）");
  assertEqual(homeSource.includes("export function setLiveCallEntryHandler(handler)"), true, "E: ライブコールの入口は差し替え口（setLiveCallEntryHandler）");
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
  assertEqual(main.includes('initHomeScreen(document.getElementById("start-screen"), {'), true, "E: ホームの初期化");
  assertEqual(main.includes("openGameMode: (modeId) => openSpecialModeById(modeId),") && main.includes("onSelectMode: (modeId) => openSpecialModeById(modeId),"), true, "E: ほかのゲーム＝ゲーム画面のカードと同じ関数");
  assertEqual(main.includes('openCenters: () => openCentersFrom("start"),'), true, "E: 歴代センター（戻る先はホーム）");
  assertEqual(main.includes('scrollToId: "group-cm-section"'), true, "E: CM・企業コラボ → ＝LOVEについての CM の欄");
  assertEqual(main.includes('activateDiscographyTab("works");'), true, "E: シングル・アルバム → 作品一覧タブ");
  assertEqual(main.includes('document.getElementById("unified-pack-import-section")'), true, "E: データを追加・更新 → 最新版データを読み込む の欄");
  assertEqual(main.includes("setLiveCallEntryHandler((mode) => openLiveCallFrom(document.body.dataset.screen || \"start\", mode));"), true, "E: ライブコールの遊び方を選んで開く");
  assertEqual(main.includes("const display = formatIntroBest(questionCountValue, categoryFilterValue, best);"), true, "E: ゲーム画面の自己ベストもホームと同じ関数");
  assertEqual(main.includes("const targetScreen = resolveBackTarget(fromScreen, requestedScreen);"), true, "E: ［戻る］でまとめ画面へ戻す判断を navigateWithScrollMemory に入れた");
  assertEqual(main.includes("initAppHistory({"), true, "E: 端末の戻るの仕組みを起動する");
  const sw = await fetchText("sw.js");
  assertEqual(["./css/homeRenewal.css", "./js/homeScreen.js", "./js/appHistory.js", "./js/appNavigationStack.js"].filter((file) => !sw.includes(`"${file}"`)), [], "E: ホームのファイルはオフライン用キャッシュにある");
  assertEqual(Number(sw.match(/CACHE_VERSION = "v(\d+)"/)?.[1]) >= 393, true, "E: CACHE_VERSION を上げた（v393 以上）");
  assertEqual(/media="print" onload="this\.media='all'"/.test(html), true, "E: Google Fonts は画面の表示を待たせない読み込み方");
  const css = await fetchText("css/style.css");
  assertEqual(["Hiragino", "Yu Gothic", "Noto Sans JP", "sans-serif"].every((name) => css.slice(0, 4000).includes(name)), true, "E: フォントが読み込めないときの代わり（ヒラギノ・游ゴシック・Noto Sans JP）");
  const homeCss = await fetchText("css/homeRenewal.css");
  assertEqual(homeCss.includes("position: sticky;") && homeCss.includes("top: var(--home-sticky-top);") && homeCss.includes("env(safe-area-inset-top, 0px)"), true, "E: 目次は上に貼り付き、安全領域（ノッチ）を避ける");
  const live = await fetchText("js/liveCallScreen.js");
  assertEqual(/penlight|ペンライト/i.test(live + homeSource), false, "E: ペンライトの機能は入れない");
}

export async function runHomeRenewalTests() {
  runNavigationStackTests();
  await runHistoryIntegrationTests();
  runCelebrationQueueTests();
  runHomePureFunctionTests();
  runBackupDisplayTests();
  await runHomeIntroSyncTests();
  await runHomeEntryWiringTests();
}
