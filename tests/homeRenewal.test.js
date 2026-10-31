// リニューアル第2段階（2026-10-30）のテスト：
//   A. 画面の行き来の記録（ナビゲーションスタック）と、端末の「戻る」の判断（js/appNavigationStack.js）
//   B. 端末の「戻る」の動き（偽物の履歴の上で js/appHistory.js を動かす：戻る・進む・モーダル・クイズ中・対戦中）
//   C. お祝いポップアップの順番待ち（1回の起動で1件・ローテーション。js/centerCelebration.js）
//   D. ホーム案F の純粋関数（ランク・出題設定・自己ベスト・案内・バックアップの表示・目次・入口の行き先。js/homeScreen.js）
//   D2. バックアップの状態の取り出し口（js/backupSync.js の getBackupStatusForDisplay。同期は動かさない）
//   D3. 本物のホームの部品で、ホームとゲーム画面の出題設定の同期・［この設定でスタート］の経路
//   E. ホームの並び・入口がそれぞれ正しい画面へつながっていること（index.html・js/main.js・js/homeScreen.js のソース確認）
//   F. 2026-10-30 夜間：全部のゲームをホームに・カテゴリのデザイン・iPad / PC の段組み（数の出し方・まとまり・アイコン・CSS の範囲）
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
  buildHomeInfoStats,
  setLiveCallEntryHandler,
} from "../js/homeScreen.js";
import { MEMBERS } from "../js/data/members.js";
import { ANNIVERSARY_PERIODS } from "../js/data/anniversaryHistory.js";
import { TV_APPEARANCES } from "../js/data/tvAppearances.js";
import { DISCOGRAPHY } from "../js/data/discography.js";
import { SETLIST_PERFORMANCES } from "../js/data/setlists.js";
import { getGroupCommercials } from "../js/commercialsSection.js";
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
  // 2026-10-30 夜間：ゲーム画面の10種類をすべてホームに。ライブコール（前の版）はゲーム画面の「ライブコールモード」のカードと同じ処理
  assertEqual(modes, ["randomPlayback", "lyricsQuiz", "outroQuiz", "instantChallenge", "timeAttack", "weakSongs", "onlineBattle", "partyBattle", "originalQuiz", "liveCallMode"], "D: 10種類のゲームは、ゲーム画面のカードと同じ処理");
  assertEqual(new Set(modes).size, modes.length, "D: 同じモードを二重に数えない（HOME_ACTIONS の中で1回ずつ）");
  assertEqual([...modes].sort(), [...HOME_SPECIAL_MODES_ORDER].sort(), "D: ゲーム画面の10種類と、ホームの10種類が同じ（作っていないものを足さない・漏れもない）");
  assertEqual(modes.every((id) => HOME_SPECIAL_MODES_ORDER.includes(id)), true, "D: どれも実在するモード");
  // 【2026-10-31・本人の依頼 D】行き先を昔の「ゲーム」の画面から「ゲームの遊び方・記録」へ
  assertEqual(HOME_ACTIONS["all-games"], { type: "callback", value: "openGameGuide" }, "D: ゲームの遊び方・記録 → 新しいゲームのガイド（main.js の openGameGuide）");
  // 【2026-10-31 live-unify・本人の指示】入口は「コールを覚える」の1つ（ゲーム画面の「コールを覚える」のカードと同じ処理＝新しいライブコール）。
  // 前の版の入口・「おためし版」の3つの入口は無くした
  assertEqual(HOME_ACTIONS["learn-calls"], { type: "mode", value: "liveCallMode" }, "D: コールを覚える＝ゲーム画面の「コールを覚える」と同じ処理（新しいライブコール）");
  assertEqual(["live-call-classic", "live-call-sheet", "live-call-live", "live-call-karaoke"].filter((name) => name in HOME_ACTIONS), [], "D: 前の版・おためし版の3つの入口は無い（二重にしない）");
  assertEqual(HOME_ACTIONS["about-group"], { type: "callback", value: "openDiscographyAbout", ownSound: true }, "D: ＝LOVEについて →「＝LOVEについて」タブ");
  assertEqual(HOME_ACTIONS["next-live"], { type: "click", value: "live-hub-link" }, "D: 次のライブ →【ライブ】ページ");
  // 【2026-10-31・本人の依頼 A・C】ガイドのまとめ画面を通さず、アプリ全体のガイドを直接開く
  assertEqual(HOME_ACTIONS.guides, { type: "callback", value: "openAppGuide" }, "D: 遊び方・機能ガイド（使い方ガイド）→ アプリ全体のガイド（main.js の openAppGuide）");
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
  const savedScreen = document.body.dataset.screen;
  document.body.dataset.screen = "start"; // ほかのテストの残りに左右されないよう、ホームにいる状態で確かめる
  try {
    localStorage.setItem(key, JSON.stringify({ questionCount: "20", category: "title-and-group" }));
    const homeRoot = sandbox.querySelector("#start-screen");
    const startButton = hub.querySelector("#start-button");
    const calls = { start: 0, data: 0, navigate: [], modes: [], callbacks: [], live: [] };
    const screenListeners = [];
    startButton.addEventListener("click", () => calls.start++);
    initHomeScreen(homeRoot, {
      songs: SONGS,
      getHighScore: (count, category) => (count === "20" && category === "title-and-group" ? 120 : 0),
      startButton,
      navigate: (name) => calls.navigate.push(name),
      playClickSound: () => {},
      onScreenChange: (listener) => screenListeners.push(listener),
      openGameMode: (id) => calls.modes.push(id),
      openDataManagement: () => calls.data++,
      openTransferRecovery: () => calls.callbacks.push("transfer"),
      openDataStatus: () => calls.callbacks.push("status"),
      openCenters: () => calls.callbacks.push("centers"),
      openDiscographyWorks: () => calls.callbacks.push("works"),
      openDiscographyAbout: () => calls.callbacks.push("about"),
      openGroupCommercials: () => calls.callbacks.push("commercials"),
      openGameGuide: () => calls.callbacks.push("gameGuide"),
      openAppGuide: () => calls.callbacks.push("appGuide"),
    });
    const checked = (name) => hub.querySelector(`input[name="${name}"]:checked`)?.value;
    const homeChecked = (attr) => homeRoot.querySelector(`[${attr}][aria-checked="true"]`)?.getAttribute(attr);
    assertEqual([checked("question-count"), checked("category-filter")], ["20", "title-and-group"], "D3: 前回の設定をゲーム画面のラジオボタンへ戻す");
    assertEqual([homeChecked("data-home-count"), homeChecked("data-home-category")], ["20", "title-and-group"], "D3: ホームも同じ設定を表示");
    assertEqual(homeRoot.querySelector("#home-intro-best").textContent.replace(/\s+/g, " ").trim(), "20問・表題＋全員 ベスト 120点", "D3: ホームの自己ベスト（getHighScore の値・同じ文。トロフィーは SVG のアイコン）");
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
    // 本物ではクイズの画面へ移る（画面が変わると、次に押せるようになる）
    screenListeners.forEach((listener) => listener("quiz"));
    start.dataset.state = "noAudio";
    start.click();
    assertEqual([calls.start, calls.data], [1, 1], "D3: 音源が無いときは「音源を取り込む」＝データ管理を開く（クイズは始めない）");

    homeRoot.querySelector('[data-home-action="outro-quiz"]').click();
    homeRoot.querySelector('[data-home-action="all-games"]').click();
    homeRoot.querySelector('[data-home-action="settings"]').click();
    assertEqual([calls.modes, calls.navigate, calls.callbacks], [["outroQuiz"], ["settings"], ["gameGuide"]], "D3: 入口ボタンの行き先（アウトロ・ゲームの遊び方・記録・設定）");
    calls.callbacks.length = 0;

    // 2026-10-30 夜間：ホームの10種類のゲームを本物の部品で全部押す → ゲーム画面のカードと同じ処理（モードの id）が1回ずつ
    calls.modes.length = 0;
    homeRoot.querySelectorAll("#home-games .home-game").forEach((button) => button.click());
    assertEqual(calls.modes, ["randomPlayback", "lyricsQuiz", "outroQuiz", "instantChallenge", "timeAttack", "weakSongs", "onlineBattle", "partyBattle", "originalQuiz", "liveCallMode"], "D3: ホームの10種類を押す → それぞれのモードを1回ずつ開く");
    // ライブ：コールを覚える（入口は1つ）＝ゲーム画面の「コールを覚える」と同じ処理
    calls.modes.length = 0;
    setLiveCallEntryHandler((mode) => calls.live.push(mode));
    homeRoot.querySelectorAll("#home-card-live [data-home-action]").forEach((button) => {
      if (button.dataset.homeAction === "learn-calls" || button.dataset.homeAction.startsWith("live-call")) button.click();
    });
    setLiveCallEntryHandler(null);
    assertEqual([calls.modes, calls.live], [["liveCallMode"], []], "D3: ライブ：コールを覚える（1つだけ。曲の一覧 → 曲のページ → 3つのモード）");
    // 既存のボタンを押す行き先：同じ id のボタンを押す（ホームの外のボタンは、この箱には無いので偽物で受ける）
    const clicked = [];
    const fakeTargets = ["live-guide-link", "continuous-play-link", "playlist-link", "songlist-favorites-link", "songlist-link", "lyrics-search-link", "history-link"].map((id) => {
      const fakeButton = document.createElement("button");
      fakeButton.id = id;
      fakeButton.addEventListener("click", () => clicked.push(id));
      sandbox.appendChild(fakeButton);
      return fakeButton;
    });
    const liveHub = homeRoot.querySelector("#live-hub-link");
    liveHub.addEventListener("click", () => clicked.push("live-hub-link"));
    ["live-guide", "continuous-play", "playlists", "favorites", "songlist", "lyrics-search", "history", "next-live"].forEach((name) => homeRoot.querySelector(`[data-home-action="${name}"]`).click());
    assertEqual(clicked, ["live-guide-link", "continuous-play-link", "playlist-link", "songlist-favorites-link", "songlist-link", "lyrics-search-link", "history-link", "live-hub-link"], "D3: 既存の画面のボタンへつなぐ入口（ガイド・楽曲・履歴・次のライブ）");
    fakeTargets.forEach((element) => element.remove());
    ["works", "centers", "commercials", "about-group", "data-status", "data-transfer"].forEach((name) => homeRoot.querySelector(`[data-home-action="${name}"]`).click());
    assertEqual(calls.callbacks, ["works", "centers", "commercials", "about", "status", "transfer"], "D3: 作品一覧・歴代センター・CM・＝LOVEについて・データの状態・引き継ぎ");
    calls.navigate.length = 0;
    calls.callbacks.length = 0;
    homeRoot.querySelectorAll('[data-home-action="guides"]').forEach((button) => button.click());
    assertEqual([calls.navigate, calls.callbacks], [[], ["appGuide"]], "D3: イントロの下の「遊び方・機能ガイド」→ アプリ全体のガイド");
  } finally {
    sandbox.remove();
    if (savedScreen === undefined) delete document.body.dataset.screen;
    else document.body.dataset.screen = savedScreen;
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
  const cardIds = (cardId, selector) => [...home.querySelectorAll(`#${cardId} ${selector}`)].map((element) => element.id || element.dataset.homeAction);
  assertEqual(cardIds("home-card-game", ".home-game"), ["random-playback", "lyrics-quiz", "outro-quiz", "instant-challenge", "time-attack", "weak-songs", "online-battle", "party-battle", "original-quiz", "learn-calls"], "E: ゲーム：10種類（ひとりで挑戦6・友達と対戦2・つくる・覚える2）");
  assertEqual(cardIds("home-card-game", ".home-games-more"), ["all-games"], "E: ゲーム：「ゲームの遊び方・記録」（2026-10-31 から新しいゲームのガイド）");
  assertEqual(cardIds("home-card-live", "button"), ["home-next-live", "learn-calls", "live-hub-link", "live-guide"], "E: ライブ：次のライブ・コールを覚える（入口は1つ）・ライブ履歴・はじめてのライブ");
  assertEqual(cardIds("home-card-music", "button"), ["continuous-play", "playlists", "favorites", "songlist", "works", "lyrics-search"], "E: 楽曲：聴く（曲を聴く・プレイリスト・お気に入り）・読む・調べる（楽曲一覧・シングル・アルバム）・探す（歌詞検索）");
  assertEqual(cardIds("home-card-know", "button"), ["members-link", "centers", "anniversary-home-link", "cd-sales-home-link", "tv-appearances-home-link", "commercials", "about-group"], "E: ＝LOVE：メンバー・歴代センター・周年ヒストリー・CD売上・チャート（2026-10-31追加）・音楽番組・CM・企業コラボ・＝LOVEについて");
  // 【2026-10-31・本人の依頼 A】プレイ履歴・遊び方・機能ガイドはイントロクイズの箱のすぐ下へ移した（2か所に置かない）
  assertEqual(cardIds("home-card-my", ".home-my-link"), ["settings"], "E: マイページ：設定（プレイ履歴・ガイドはイントロの下へ移した。フレンド・ランキング・実績・プロフィールは置かない）");
  assertEqual(cardIds("home-card-game", ".home-intro-link"), ["history", "guides"], "E: イントロクイズの箱のすぐ下：プレイ履歴・遊び方・機能ガイド");
  assertEqual([...home.querySelectorAll("#home-data-box [data-home-action]")].map((element) => element.dataset.homeAction), ["data-update", "data-status", "data-transfer"], "E: データの箱：データを追加・更新／データの状態を確かめる（v403 で追加）／引き継ぎ・復旧");
  assertEqual(home.querySelector("#home-card-music .home-card-note")?.textContent, "曲の情報・歌詞は音源なしでも見られます", "E: 楽曲の一言");
  assertEqual(home.querySelector("#home-data-box .home-data-note")?.textContent, "音源・歌詞・コールはこの端末だけに保存。消えたときは入れ直しが必要です", "E: データの箱の一言");
  const usedActions = [...home.querySelectorAll("[data-home-action]")].map((element) => element.dataset.homeAction);
  assertEqual(usedActions.filter((name) => !HOME_ACTIONS[name]), [], "E: ホームのボタンの行き先はすべて HOME_ACTIONS にある");
  assertEqual(Object.keys(HOME_ACTIONS).filter((name) => !usedActions.includes(name)), [], "E: HOME_ACTIONS はすべてホームで使っている");
  // 「既存のボタンを押す」行き先が、正しい画面にあること
  const clickTargets = {
    "live-hub-link": "start-screen",
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
  const liveOpen = main.slice(main.indexOf("function openLiveCallFrom("), main.indexOf("function openLiveCallFrom(") + 600);
  assertEqual(liveOpen.indexOf('navigateWithScrollMemory("liveCall");') >= 0 && liveOpen.indexOf('navigateWithScrollMemory("liveCall");') < liveOpen.indexOf("openLiveCallScreen({ mode });"), true, "E: ライブコールを開く前にホームのスクロール位置を覚える（戻ると同じ位置）");
  const partyBack = main.slice(main.indexOf("navigateHomeToPartyCard: () => {"), main.indexOf("navigateHomeToPartyCard: () => {") + 500);
  assertEqual(partyBack.includes('navigateBattleScreen("start");') && !partyBack.includes('navigateBattleScreen("gameHub")'), true, "E: 1台で対戦の［戻る］は、ホームから来たらホームへ（ゲーム画面から来たらゲーム画面へ）");
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

// ---- F. 2026-10-30 夜間：全部のゲーム・カテゴリのデザイン・iPad / PC ----
async function runHomeNightTests() {
  console.log("--- リニューアル F：全部のゲームをホームに・カテゴリのデザイン・iPad / PC ---");
  // 数の出し方（純粋関数）
  const fake = buildHomeInfoStats({
    members: [{ status: "active", memberColor: { hex: "#111111" } }, { status: "active", memberColor: { hex: "#222222" } }, { status: "graduated", memberColor: { hex: "#333333" } }],
    periods: [{ label: "結成・デビュー" }, { label: "1周年" }, { label: "3周年" }, { label: "これから（10周年へ）" }],
    tvAppearances: [{ date: "2019-01-01" }, { date: "2024-05-05" }, { date: "2021-03-03" }],
    commercials: [{}, {}],
    discography: [{ type: "single" }, { type: "single" }, { type: "album" }, { type: "digital" }],
    setlists: [{}, {}, {}],
    songs: [{ centerType: "single" }, { centerType: "none" }],
    nextLive: { title: "テスト公演", startDate: "2027-01-19", endDate: "2027-01-20" },
  });
  // 【2026-10-30 fix-home】＝LOVE のカードは「見どころの札（数）」と「何が見られるか（文）」に分けた（文に同じ数を重ねない）
  assertEqual([fake.membersBadge, fake.membersHook], ["現役2人", "プロフィールと|メンバーカラー"], "F: メンバーは現役だけ数える（卒業メンバーは数えない）。数は札に");
  assertEqual(fake.memberColors, ["#111111", "#222222"], "F: メンバーカラーの帯も現役だけ");
  assertEqual([fake.historyBadge, fake.historyHook], ["3周年まで", "デビューから|1年ずつ振り返る"], "F: 周年は来ている「N周年」のいちばん大きい数（「これから（10周年へ）」は数えない）");
  assertEqual([fake.tvBadge, fake.tvHook], ["3件", "2019〜2024年の|番組と披露曲"], "F: 音楽番組の件数（札）と年の範囲（文）");
  assertEqual(fake.centersBadge, "1曲", "F: 歴代センター：センターが記録されている曲の数（「なし」は数えない）");
  assertEqual([fake.cmBadge, fake.cmHook, fake.worksSub, fake.songsSub, fake.liveHubSub], ["2件", "＝LOVE名義の|CM・企業コラボ", "シングル2枚|・アルバム1枚", "2曲の|歌詞・曲の情報", "3公演の|セットリスト"], "F: CM・作品・曲・セットリストの数");
  assertEqual(fake.nextLive?.title, "テスト公演", "F: 次のライブの名前");
  assertEqual(fake.nextLive?.date.replaceAll("|", "").includes("〜"), true, "F: 次のライブの日付（2日以上は「〜」でつなぐ）");
  const empty = buildHomeInfoStats({});
  assertEqual([empty.membersHook, empty.historyHook, empty.tvHook, empty.cmHook, empty.worksSub, empty.songsSub, empty.liveHubSub, empty.nextLive], [null, null, null, null, null, null, null, null], "F: データが無ければ数を出さない（HTML の数なしの文のまま）");
  assertEqual([empty.membersBadge, empty.centersBadge, empty.historyBadge, empty.tvBadge, empty.cmBadge], [null, null, null, null, null], "F: データが無ければ見どころの札も出さない");
  // 本物のデータ：画面に出る数は、各ページが持つデータと同じ
  const real = buildHomeInfoStats({ members: MEMBERS, periods: ANNIVERSARY_PERIODS, tvAppearances: TV_APPEARANCES, commercials: getGroupCommercials(), discography: DISCOGRAPHY, setlists: SETLIST_PERFORMANCES, songs: SONGS });
  assertEqual(real.membersBadge, `現役${MEMBERS.filter((member) => member.status === "active").length}人`, "F: 本物のメンバーの数");
  assertEqual(real.tvBadge, `${TV_APPEARANCES.length}件`, "F: 本物の音楽番組の件数（音楽番組のページと同じデータ）");
  assertEqual(real.cmBadge, `${getGroupCommercials().length}件`, "F: 本物の CM の件数（＝LOVE名義。CM の欄と同じ）");
  assertEqual(real.centersBadge, `${SONGS.filter((song) => ["single", "double", "all"].includes(song.centerType)).length}曲`, "F: 本物の、センターが記録されている曲の数");
  assertEqual(real.songsSub.startsWith(`${SONGS.length}曲`), true, "F: 本物の曲数");

  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const home = doc.getElementById("start-screen");
  // まとまりはゲーム画面の GAME_HUB_GROUPS と同じ（ひとりで・みんなで・つくる）
  const groupModes = (cls) => [...home.querySelectorAll(`.home-game-group--${cls} .home-game`)].map((button) => HOME_ACTIONS[button.dataset.homeAction]?.value);
  assertEqual([groupModes("solo"), groupModes("together"), groupModes("make")], GAME_HUB_GROUPS.map((group) => group.modeIds), "F: ホームの3つのまとまりは、ゲーム画面のまとまりと同じモード・同じ順");
  assertEqual([...home.querySelectorAll(".home-game-group-title")].map((element) => element.textContent), ["ひとりで挑戦", "友達と対戦", "つくる・覚える"], "F: まとまりの見出しは3つだけ");
  const games = [...home.querySelectorAll(".home-game")];
  assertEqual(games.every((button) => button.querySelector(".home-game-title")?.textContent.trim() && button.querySelector(".home-game-desc")?.textContent.trim()), true, "F: どのゲームにも短い題と一言の説明");
  assertEqual(games.map((button) => button.querySelector(".home-game-title").textContent), ["ランダム再生クイズ", "歌詞クイズ", "アウトロクイズ", "一瞬チャレンジ", "タイムアタック", "苦手曲を練習", "オンライン対戦", "1台で対戦", "問題をつくる", "コールを覚える"], "F: 題名（何をするかが分かる名前）");
  const colorClasses = games.map((button) => [...button.classList].find((name) => name.startsWith("home-game--")));
  assertEqual(new Set(colorClasses).size, 10, "F: 10種類それぞれに別の色の印");
  const homeCss = await fetchText("css/homeRenewal.css");
  assertEqual(colorClasses.filter((name) => !homeCss.includes(`.${name} { --mode: #`)), [], "F: どの色の印にも CSS の色がある");
  // 行き先の重複：「コールを覚える」だけ、ゲームとライブの2か所（同じ行き先）。ほかは1か所
  const actionCount = {};
  home.querySelectorAll("[data-home-action]").forEach((element) => {
    actionCount[element.dataset.homeAction] = (actionCount[element.dataset.homeAction] ?? 0) + 1;
  });
  assertEqual(Object.entries(actionCount).filter(([, count]) => count > 1), [["learn-calls", 2]], "F: 2か所にあるのは「コールを覚える」（ゲームとライブ）だけ");
  assertEqual(
    home.querySelector('#home-card-game [data-home-action="learn-calls"] .home-game-title')?.textContent,
    home.querySelector('#home-card-live [data-home-action="learn-calls"] b')?.textContent,
    "F: 2か所の「コールを覚える」は同じ名前",
  );
  // アイコン：使っている <use> の行き先がすべてある。カードのアイコンは絵文字ではなく SVG
  const symbols = new Set([...home.querySelectorAll(".home-icon-sprite symbol")].map((symbol) => symbol.id));
  const uses = [...home.querySelectorAll("use")].map((use) => use.getAttribute("href").slice(1));
  assertEqual(uses.filter((id) => !symbols.has(id)), [], "F: アイコンの部品（<symbol>）はすべてある");
  assertEqual([...home.querySelectorAll(".home-game-icon, .home-know-icon, .home-data-row-icon, .home-tact-icon, .home-live-main-icon")].filter((element) => !element.querySelector("svg use")).length, 0, "F: カードのアイコンは SVG（絵文字を並べない）");
  assertEqual(/[\u{1F300}-\u{1FAFF}]/u.test([...home.querySelectorAll(".home-card")].map((card) => card.textContent).join("")), false, "F: カードの中に絵文字のアイコンが無い");
  // ＝LOVE：ページの名前と「何が見られるか」
  assertEqual(
    [...home.querySelectorAll(".home-know")].map((button) => [button.querySelector("b").textContent, (button.querySelector(".home-know-hook")?.textContent ?? "").length > 0]),
    [["メンバー", true], ["歴代センター", true], ["周年ヒストリー", true], ["CD売上・チャート", true], ["音楽番組", true], ["CM・企業コラボ", true], ["＝LOVEについて", true]],
    "F: ＝LOVE の7つのページに名前と見どころ（2026-10-31：CD売上・チャートを追加）",
  );
  assertEqual(home.querySelectorAll("#home-card-know img, #home-card-live img, #home-card-music img").length, 0, "F: 写真などの画像は足さない");
  // 楽曲：聴く・読む・探す
  assertEqual([...home.querySelectorAll(".home-music-col-title")].map((element) => element.textContent.trim()), ["聴く", "読む・調べる", "探す"], "F: 楽曲は「聴く・読む・調べる・探す」に分ける（2026-11-01 r7-home：「曲を聴く」が主役。詳しくは tests/discographyAuto.test.js）");
  // ライブ：入口は1つ。中に3つの見せ方の名前（2026-10-31 live-unify）
  assertEqual([...home.querySelectorAll(".home-live-learn-mode")].map((element) => element.textContent.trim()), ["コール表", "ライブコール", "カラオケ"], "F: コールを覚えるの3つの見せ方の名前");
  assertEqual(home.querySelector("#home-next-live")?.hasAttribute("hidden"), true, "F: 次のライブは、データがあるときだけ JS が出す（初めは隠す）");
  // CSS：広い画面で広げるのはホームだけ。動きはホームを表示している間だけで、動きを減らす設定では止める
  const frameRules = homeCss.match(/[^{}]*\.game-frame\s*\{[^}]*max-width[^}]*\}/g) ?? [];
  assertEqual(frameRules.length > 0 && frameRules.every((rule) => rule.includes('body[data-screen="start"] .game-frame')), true, "F: 枠を広げるのはホームのときだけ（ほかの画面は 480px のまま）");
  const animations = homeCss.match(/[^{};]+\{\s*animation:[^}]+\}/g) ?? [];
  assertEqual(animations.length > 0 && animations.every((rule) => rule.includes('body[data-screen="start"]')), true, "F: 動きはホームを表示している間だけ");
  assertEqual(homeCss.includes('@media (prefers-reduced-motion: no-preference) {\n  body[data-screen="start"] .home-live-lights i {'), true, "F: ライブの光の動きは「動きを減らす」設定では付けない");
  assertEqual(homeCss.includes("@media (min-width: 768px)") && homeCss.includes("@media (min-width: 1024px)") && homeCss.includes("@container (min-width: 50rem)"), true, "F: 768（枠を広げる）・1024（カードを2列）・カードが広いとき（イントロと全ゲームを横に）の段組み");
  assertEqual(homeCss.includes(".home-f[data-variant"), false, "F: 案の比較用の CSS を残していない");
  // 案内の文：ホームのボタンの名前に合わせた
  const guide = await fetchText("js/data/guideContent.js");
  assertEqual(guide.includes("全部のゲーム"), false, "F: ガイドに無くなったボタン（「全部のゲーム」）の名前が残っていない");
  // 【2026-10-31】ゲームの説明は js/data/gameGuideContent.js（全体のガイドと共通）へ移した
  const gameGuide = await fetchText("js/data/gameGuideContent.js");
  assertEqual(gameGuide.includes("ホームの「ゲームで遊ぶ」→「苦手曲を練習」"), true, "F: ガイドの文は今のホームの名前");
  assertEqual(gameGuide.includes("全部のゲーム"), false, "F: ゲームのガイドにも、無くなったボタンの名前が残っていない");
  const main = await fetchText("js/main.js");
  const aboutStart = main.indexOf("openDiscographyAbout: () => {");
  const aboutBody = main.slice(aboutStart, aboutStart + 200);
  assertEqual(aboutStart >= 0 && aboutBody.includes("discographyLinkElement.click();") && aboutBody.includes('activateDiscographyTab("about");'), true, "F: ＝LOVEについて → 前に別のタブを開いていても「＝LOVEについて」タブ");
}

// 【2026-10-30 夜間の修正（fix-home）】独立レビューの指摘への直し（G）
// 色の明るさ（WCAG の相対輝度）とコントラスト比
function relativeLuminance(hex) {
  const value = hex.replace("#", "");
  const channel = (index) => {
    const c = parseInt(value.slice(index, index + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}
function contrastRatio(hexA, hexB) {
  const [high, low] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
  return (high + 0.05) / (low + 0.05);
}
// CSS の文字列から、そのセレクタの最後の指定の中身を取り出す（上書きした値を確かめるため）
// （行の頭から始まるセレクタだけを探し、コメントは除く。コメントの中の古い色を数えないため）
function lastRuleBody(css, selector) {
  const index = css.lastIndexOf(`\n${selector} {`);
  if (index < 0) return "";
  return css.slice(index, css.indexOf("}", index)).replace(/\/\*[\s\S]*?\*\//g, "");
}

async function runHomeFixTests() {
  console.log("--- リニューアル G：独立レビューの指摘の直し（ライブの名前・コントラスト・新曲の案内・320 の改行・楽曲の空き） ---");
  const html = await fetchText("index.html");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const home = doc.getElementById("start-screen");
  const homeCss = await fetchText("css/homeRenewal.css");
  const styleCss = await fetchText("css/style.css");

  // 【2026-10-31 live-unify】ライブ：入口は「コールを覚える」の1つ。中の3つの札（コール表・ライブコール・カラオケ）は飾り（押す所は1つ）
  const learnLive = home.querySelector('#home-card-live [data-home-action="learn-calls"]');
  assertEqual(learnLive?.querySelector("b")?.textContent, "コールを覚える", "G: ライブの入口は「コールを覚える」");
  assertEqual(learnLive?.querySelector("small")?.textContent.includes("3つの見せ方"), true, "G: 説明で3つの見せ方があると分かる");
  assertEqual([...(learnLive?.querySelectorAll(".home-live-learn-mode") ?? [])].map((chip) => chip.textContent.trim()), ["コール表", "ライブコール", "カラオケ"], "G: 3つの見せ方の名前（読み上げにも入る）");
  // 【2026-10-31 live-polish】名前はボタンに見えない見た目（枠・地なし）。押す所はボタン全体の1つ
  const learnModeRule = lastRuleBody(homeCss, ".home-live-learn-mode");
  assertEqual(learnModeRule.includes("border: none") && learnModeRule.includes("background: none"), true, "G: 3つの名前は枠・地の無い文字（ボタンに見せない）");
  assertEqual(learnLive?.querySelectorAll("button, a").length, 0, "G: ボタンの中に別のボタンを入れない（押す所は1つ）");
  assertEqual([home.querySelector("#home-live-new-title"), home.querySelector(".home-live-new-grid"), home.querySelector('[data-home-action="live-call-classic"]')], [null, null, null], "G: 「おためし版」の3つ・前の版の入口はホームに無い");
  const liveMain = lastRuleBody(homeCss, ".home-live-main.home-live-main--learn");
  assertEqual(liveMain.includes("#d6286e") && liveMain.includes("min-height: 72px"), true, "G: 入口は主役のボタン（濃いピンク〜紫・高さ 72px）");

  // 言葉・改行
  assertEqual(home.querySelector(".home-game--random .home-game-title")?.innerHTML, "ランダム再生クイズ", "G: 「ランダム再生クイズ」の題名の途中に改行の候補（<wbr>）を置かない");
  assertEqual(home.querySelector(".home-game--online .home-game-desc")?.textContent, "離れた友達とルームで対戦", "G: オンライン対戦の説明「離れた友達とルームで対戦」");
  const nowrapRule = homeCss.slice(homeCss.lastIndexOf(".home-game-title,\n.home-live-mode b,"));
  assertEqual(nowrapRule.slice(0, 200).includes("white-space: nowrap;"), true, "G: カードの題名は折り返さない（「ライブ履歴・／セトリ」「はじめてのライ／ブ」にしない）");
  assertEqual(homeCss.includes("@container (max-width: 23rem) {\n  .home-game {\n    flex-direction: column;"), true, "G: 狭いゲームの一覧ではアイコンを題名の上に（題名を1行に入れる）");
  assertEqual(homeCss.includes("@container (max-width: 19rem) {\n  .home-live-sub {\n    grid-template-columns: 1fr;"), true, "G: 320px ではライブ履歴・はじめてのライブを1列に");

  // iPad 横・PC：楽曲の下の空き
  const wide = homeCss.slice(homeCss.lastIndexOf("@media (min-width: 1024px) {"));
  assertEqual(wide.includes("align-items: stretch;") && wide.includes(".home-card--music .home-music-cols {\n    flex: 1;"), true, "G: 1024px 以上で、楽曲のカードをライブと同じ高さにし、中のボタンで埋める（下の空きを作らない）");

  // ＝LOVE：見どころの札・メンバーカラーの帯
  assertEqual([...home.querySelectorAll(".home-know")].map((button) => Boolean(button.querySelector(".home-know-badge"))), [true, true, true, true, true, true, true], "G: ＝LOVE の7つのカードに見どころの札");
  assertEqual(home.querySelector(".home-know--about .home-know-badge")?.textContent, "はじめに", "G: ＝LOVEについては「はじめに」");
  assertEqual(lastRuleBody(homeCss, ".home-know--members .home-know-colors").includes("position: absolute;"), true, "G: メンバーはメンバーカラーの帯（カードの下）");

  // コントラスト：ピンクの地に白い文字（4.5 以上。19px の太字の開始ボタンは大きい文字なので 3 以上）。色は CSS の指定から計算
  const hexes = (text) => text.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
  const minContrastWithWhite = (text) => Math.min(...hexes(text).map((hex) => contrastRatio(hex, "#ffffff")));
  const seg = lastRuleBody(homeCss, '.home-seg-button[aria-checked="true"]');
  assertEqual(hexes(seg).length >= 2 && minContrastWithWhite(seg) >= 4.5, true, `G: 選ばれた「5問」「表題曲のみ」の地と白い文字 ${minContrastWithWhite(seg).toFixed(2)}:1（4.5 以上）`);
  const start = lastRuleBody(homeCss, ".home-intro-start");
  assertEqual(hexes(start).length >= 2 && minContrastWithWhite(start) >= 3, true, `G: 開始ボタンの地と白い文字 ${minContrastWithWhite(start).toFixed(2)}:1（大きい文字 3 以上）`);
  const nav = lastRuleBody(homeCss, '.home-cat-nav-item[aria-current="true"]');
  assertEqual(hexes(nav).length >= 1 && minContrastWithWhite(nav) >= 4.5, true, `G: 目次の「ゲーム」の地と白い文字 ${minContrastWithWhite(nav).toFixed(2)}:1`);
  const oshi = lastRuleBody(homeCss, ".home-topbar .home-topbar-oshi.is-empty");
  assertEqual(hexes(oshi).length >= 2 && minContrastWithWhite(oshi) >= 4.5, true, `G: 「推しメンを登録しよう」の地と白い文字 ${minContrastWithWhite(oshi).toFixed(2)}:1`);
  // 「ゲームで遊ぶ」の見出し：上に重ねる濃いピンク rgba(176,18,88,0.72) を、いちばん明るい地（光の円の白 42% の上）に重ねた色で計算
  const band = lastRuleBody(homeCss, ".home-card--game");
  assertEqual(band.includes("rgba(176, 18, 88, 0.72) 0, rgba(176, 18, 88, 0.72) 2.5rem"), true, "G: 「ゲームで遊ぶ」の見出しの所だけ、濃いピンクを重ねる");
  const mix = (top, bottom, alpha) => top.map((value, index) => Math.round(value * alpha + bottom[index] * (1 - alpha)));
  const toHex = (rgb) => `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  const brightest = mix([255, 255, 255], [255, 134, 184], 0.42); // 光の円（白 42%）を #ff86b8 に重ねた、見出しの所で最も明るい地
  const headingGround = toHex(mix([176, 18, 88], brightest, 0.72));
  assertEqual(contrastRatio(headingGround, "#ffffff") >= 4.5, true, `G: 「ゲームで遊ぶ」の見出し・副題は、いちばん明るい所でも 4.5 以上（${contrastRatio(headingGround, "#ffffff").toFixed(2)}:1）`);
  // 黄色の地の「データ管理を開く」
  const openButton = lastRuleBody(styleCss, ".new-single-announcement-open-button");
  const accent = /--color-accent:\s*(#[0-9a-fA-F]{6})/.exec(styleCss)?.[1];
  const openColor = /color:\s*(#[0-9a-fA-F]{6})/.exec(openButton.replace(/background[^;]*;/, ""))?.[1];
  assertEqual(Boolean(accent && openColor) && contrastRatio(accent, openColor) >= 4.5, true, `G: 黄色の地の「データ管理を開く」 ${accent && openColor ? contrastRatio(accent, openColor).toFixed(2) : "?"}:1`);
  // プレイヤーのモーダル：「この名前で登録／この名前にする」と「✓ 登録しました」
  const addButton = lastRuleBody(styleCss, ".player-add-section .player-add-button");
  assertEqual(minContrastWithWhite(addButton) >= 4.5, true, `G: プレイヤーの登録ボタンの地と白い文字 ${minContrastWithWhite(addButton).toFixed(2)}:1`);
  assertEqual(minContrastWithWhite(lastRuleBody(styleCss, ".player-add-section .player-add-button:disabled")) >= 4.5, true, "G: 「✓ 登録しました」の緑と白い文字 4.5 以上");
  assertEqual(minContrastWithWhite(lastRuleBody(styleCss, ".player-row-active-tag")) >= 4.5, true, "G: 「使用中」の印と白い文字 4.5 以上");
  // 320px で下に動かしても × が見える（プレイヤーのモーダルだけ。カードの中に貼り付ける）
  const close = lastRuleBody(styleCss, "#player-modal .modal-close-button");
  assertEqual(close.includes("position: sticky;") && close.includes("float: right;"), true, "G: プレイヤーのモーダルの × は、中を動かしても上に貼り付く");
}

export async function runHomeRenewalTests() {
  runNavigationStackTests();
  await runHistoryIntegrationTests();
  runCelebrationQueueTests();
  runHomePureFunctionTests();
  runBackupDisplayTests();
  await runHomeIntroSyncTests();
  await runHomeEntryWiringTests();
  await runHomeNightTests();
  await runHomeFixTests();
}
