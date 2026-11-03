// 【2026-11-03新設・本人の依頼 R12-4】ホームを横にスワイプすると、画面が横にずれて白い画面が出る・別の画面（質問AI）へ飛ぶ問題の回帰テスト。
// 原因：画面を移るたびにブラウザの履歴に記録を積み（pushState）、戻るときは history.go(-n) で戻るので、「戻る」「進む」の記録が残る。
// iOS では画面の端からのスワイプで履歴の「戻る」「進む」が始まり、その記録の画面（白）が滑り込む・進んだ先の画面が開く。
// 直し方（js/appHistory.js の singleHistoryEntry）：iOS ではブラウザの履歴に記録を積まない（最初の1件だけ）。画面の記録はアプリの中だけで持つ。
// ここでは偽物の履歴（本物と同じく go() の結果が後から popstate で届く）で、iOS では履歴が1件のまま・端からのスワイプ（戻る／進む）の
// 行き先が無いこと、アプリの［戻る］・モーダルが今までどおり動くこと、iOS 以外は今までどおりであることを確かめる。
import { assertEqual } from "./test-utils.js";

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
  return { api, target, getIndex: () => index, hasForward: () => index < entries.length - 1, hasBack: () => index > 0 };
}

const wait = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

async function runScenario(singleHistoryEntry) {
  const root = document.createElement("div");
  root.style.cssText = "position:fixed;left:-3000px;top:0;width:390px;";
  root.innerHTML = `
    <section id="ih-s-start"></section>
    <section id="ih-s-memberDetail" hidden><button class="back-link" id="ih-detail-back">戻る</button></section>
    <section id="ih-s-youtube" hidden><button class="back-link" id="ih-youtube-back">戻る</button></section>
    <div id="ih-modal" class="modal-overlay" hidden><button id="ih-modal-close">閉じる</button></div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector(`#${id}`);
  const screens = ["start", "memberDetail", "youtube"];
  const listeners = [];
  let current = "start";
  const show = (name) => {
    screens.forEach((screen) => ($(`ih-s-${screen}`).hidden = screen !== name));
    current = name;
    listeners.forEach((listener) => listener(name));
  };
  $("ih-detail-back").addEventListener("click", () => show("start"));
  $("ih-youtube-back").addEventListener("click", () => show("memberDetail"));
  $("ih-modal-close").addEventListener("click", () => ($("ih-modal").hidden = true));

  const fake = createFakeHistory();
  const appHistory = await import(`../js/appHistory.js?ios=${singleHistoryEntry}-${Date.now()}`);
  appHistory.initAppHistory({
    initialScreen: "start",
    onScreenChange: (listener) => listeners.push(listener),
    navigate: (screen) => show(screen),
    getScreenElement: (name) => $(`ih-s-${name}`),
    historyApi: fake.api,
    popStateTarget: fake.target,
    domRoot: root,
    singleHistoryEntry,
  });
  const result = {};
  // 1. 起動時のお祝い（モーダル）を画面のボタンで閉じる
  $("ih-modal").hidden = false;
  await wait();
  $("ih-modal-close").click();
  await wait(120);
  result.afterModalClose = { forward: fake.hasForward(), back: fake.hasBack(), screen: current };
  // 2. ホーム → 個人ページ → アプリの［戻る］
  show("memberDetail");
  await wait();
  $("ih-detail-back").click();
  await wait(150);
  result.afterAppBack = { forward: fake.hasForward(), back: fake.hasBack(), screen: current };
  // 3. ホーム → 個人ページ → YouTube → 戻る → 戻る（2段）
  show("memberDetail");
  await wait();
  show("youtube");
  await wait();
  $("ih-youtube-back").click();
  await wait(150);
  result.afterYoutubeBack = { forward: fake.hasForward(), screen: current };
  $("ih-detail-back").click();
  await wait(150);
  result.afterTwoBacks = { forward: fake.hasForward(), back: fake.hasBack(), screen: current, length: fake.api.length, stack: appHistory.getNavStackSnapshot() };
  // 4. 個人ページで、端末の「戻る」（iOS の左の端からのスワイプと同じ history.back）
  show("memberDetail");
  await wait();
  result.onDetail = { back: fake.hasBack(), length: fake.api.length };
  fake.api.back();
  await wait(200);
  result.afterSystemBack = { forward: fake.hasForward(), screen: current };
  if (current !== "start") {
    $("ih-detail-back").click();
    await wait(150);
  }
  // 5. モーダルを端末の「戻る」で閉じる
  $("ih-modal").hidden = false;
  await wait();
  fake.api.back();
  await wait(200);
  result.afterModalSystemBack = { forward: fake.hasForward(), screen: current, modalHidden: $("ih-modal").hidden };
  // 6. 「進む」をしても何も起きない（iOS）／前の画面へ進む（iOS 以外）
  fake.api.forward();
  await wait(200);
  result.afterForward = { screen: current };
  root.remove();
  return result;
}

export async function runIosForwardHistoryTests() {
  console.log("--- R12-4：iOS で画面の端からスワイプしても、白い画面・別の画面へ飛ばない（履歴に記録を積まない） ---");
  const ios = await runScenario(true);
  assertEqual(ios.afterModalClose, { forward: false, back: false, screen: "start" }, "iOS：お祝い（モーダル）を閉じたあと、「戻る」「進む」の記録が無い（以前は「進む」が残り、右からの白い画面の原因になった）");
  assertEqual(ios.afterAppBack, { forward: false, back: false, screen: "start" }, "iOS：アプリの［戻る］でホームへ戻れる。「戻る」「進む」の記録は無い");
  assertEqual(ios.afterYoutubeBack, { forward: false, screen: "memberDetail" }, "iOS：2段の途中（YouTube → 個人ページ）も、アプリの［戻る］で戻れる");
  assertEqual(
    [ios.afterTwoBacks.screen, ios.afterTwoBacks.length, ios.afterTwoBacks.forward, ios.afterTwoBacks.back, ios.afterTwoBacks.stack.entries[ios.afterTwoBacks.stack.index]],
    ["start", 1, false, false, "start"],
    "iOS：ブラウザの履歴はずっと1件。画面の記録（ハブ・戻り先の判断に使う）はアプリの中で今までどおり持つ"
  );
  assertEqual(ios.onDetail, { back: false, length: 1 }, "iOS：個人ページを開いても、左の端からのスワイプ（戻る）の行き先が無い");
  assertEqual(ios.afterSystemBack, { forward: false, screen: "memberDetail" }, "iOS：端からスワイプしても画面は動かない（白い画面・別の画面へ飛ばない）。戻るのは［戻る］ボタンで");
  assertEqual(ios.afterModalSystemBack.forward, false, "iOS：モーダルを開いても記録を積まない");
  assertEqual(ios.afterForward, { screen: "start" }, "iOS：右の端からのスワイプ（進む）をしても、前に開いた画面（例：質問AI）へ飛ばない");

  const others = await runScenario(false);
  assertEqual(others.afterAppBack, { forward: true, back: false, screen: "start" }, "iOS 以外：今までどおり（記録を積み、アプリの［戻る］で履歴も戻る）");
  assertEqual(others.onDetail.back, true, "iOS 以外：端末の「戻る」ボタン（Android）・ブラウザの戻るが今までどおり使える");
  assertEqual(others.afterSystemBack.screen, "start", "iOS 以外：端末の「戻る」で前の画面へ戻る（今までどおり）");
  assertEqual(others.afterModalSystemBack, { forward: true, screen: "start", modalHidden: true }, "iOS 以外：端末の「戻る」でモーダルだけ閉じる（今までどおり）");
  // iPhone・iPad の見分け方
  const { isIosLike } = await import("../js/appHistory.js");
  assertEqual(
    [
      isIosLike({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", platform: "iPhone", maxTouchPoints: 5 }),
      isIosLike({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 5 }),
      isIosLike({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", platform: "MacIntel", maxTouchPoints: 0 }),
      isIosLike({ userAgent: "Mozilla/5.0 (Linux; Android 14)", platform: "Linux armv8l", maxTouchPoints: 5 }),
    ],
    [true, true, false, false],
    "見分け方：iPhone・iPad（Mac を名乗る iPadOS も）だけ。Mac・Android は含めない"
  );
  // 【本人の確認 4】記録を積まないのは、ホーム画面に追加した Web アプリ（standalone）のときだけ。Safari のタブでは今までどおり
  const { isStandaloneDisplay } = await import("../js/appHistory.js");
  const fakeWindow = (standalone, displayMode) => ({ navigator: { standalone }, matchMedia: (query) => ({ matches: query === "(display-mode: standalone)" && displayMode }) });
  assertEqual(
    [isStandaloneDisplay(fakeWindow(true, false)), isStandaloneDisplay(fakeWindow(undefined, true)), isStandaloneDisplay(fakeWindow(false, false))],
    [true, true, false],
    "見分け方：ホーム画面の Web アプリ（iOS の navigator.standalone・display-mode: standalone）だけ。Safari のタブは含めない"
  );
  const source = await (await fetch("js/appHistory.js", { cache: "no-store" })).text();
  assertEqual(source.includes("singleHistoryEntry = singleOverride ?? (isIosLike() && isStandaloneDisplay());"), true, "記録を積まないのは「iOS かつ ホーム画面の Web アプリ」のときだけ（Safari のタブでは Safari の［戻る］でアプリの前の画面へ戻れる）");
}
