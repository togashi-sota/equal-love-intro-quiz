// ブラウザの履歴（History API）と、アプリの画面の行き来をつなぐファイル（2026-10-30新設・リニューアル第2段階）。
//
// 【やっていること】
// 1. 画面が切り替わるたびに（showScreen の onScreenChange）、ブラウザの履歴に1件積む（pushState）。
//    URL は変えない（今の URL のまま。?calltext=on などの URL の働き・リロードの動きは今までどおり）。
// 2. アプリの［戻る］ボタンで1つ前の画面へ戻ったときは、ブラウザの履歴も1件戻す（history.go）。
//    こうしておくと、アプリの［戻る］と端末の「戻る」を交互に使っても、記録がずれない。
// 3. 端末・ブラウザの「戻る」（popstate）が来たら、次の順に判断する（判断は js/appNavigationStack.js）。
//    ① モーダル（確認画面・設定など）が開いていれば、まずそれを閉じる
//    ② オンライン対戦の進行中などは受け付けず、画面のボタンを使うよう短く案内する
//    ③ 画面に［戻る］ボタンがあれば、それを押したのと同じ動きにする
//       （各画面の戻り先・スクロール位置・検索語・絞り込みの復元は、今までの［戻る］の仕組みがそのまま働く。
//         クイズ中の［タイトルへ］は「やめますか？」の確認が出る）
//    ④ ［戻る］ボタンが無い画面は、記録にある前の画面（プレイ中の画面は飛ばす）へ戻す
//
// 【注意】history.go() は「すぐには終わらない」（後から popstate が届く）。そのあいだに次の pushState を
// すると順番が狂うため、履歴の操作はすべて順番待ちの列（operationQueue）に入れて1つずつ実行する。

import {
  createNavStack,
  currentScreenOf,
  planScreenChange,
  applyScreenChange,
  planSystemBack,
  findFallbackIndex,
  resolveHubReturn,
} from "./appNavigationStack.js";

// このページを開くたびに変わる番号。リロード前の古い履歴（同じタブの中に残っている）と区別するために使う。
const SESSION_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const STATE_MARK = "equalLoveNav";

// 画面の中で「戻る」の役をするボタンを探すときの候補（上から順に、見えているものを使う）
const BACK_CONTROL_SELECTORS = [".back-link", "#karaoke-back-button", ".quiz-back-link"];
// 「戻る」で閉じる対象のモーダル（js/scrollLock.js の判定と同じもの＋歴代センター表の全画面）
const MODAL_SELECTORS = [".modal-overlay", ".lyrics-fullscreen-overlay", ".centers-table-overlay"];
// モーダルの中の「閉じる」役のボタンの候補
const MODAL_CLOSE_SELECTORS = [
  "#center-celebration-seen-button",
  '[id$="-close"]',
  '[id$="-close-button"]',
  '[id$="-cancel-button"]',
  ".modal-close-button",
  ".centers-table-overlay-close",
];

let stack = null;
// 使う History API・popstate を受け取る相手・モーダルを探す範囲。ふだんは本物（window.history・window・document）。
// テスト（tests/homeRenewal.test.js）では、偽物の履歴と小さな画面を渡して、本物の履歴を汚さずに確かめる。
let historyApi = null;
let popStateTarget = null;
let domRoot = null;
let navigateFallback = null; // main.js の navigateWithScrollMemory（［戻る］ボタンが無い画面用）
let getScreenElement = null; // 画面名 → section 要素
let handlingSystemBack = false; // 端末の「戻る」を処理している最中か
let systemBackScreenChanged = false;
const operationQueue = [];
let waitingForPopIndex = null; // history.go() の結果の popstate を待っているとき、その行き先の番号
let waitTimer = null;

function makeState(index) {
  return { [STATE_MARK]: 1, sid: SESSION_ID, idx: index, screen: stack.entries[index] };
}

// ---- 履歴の操作（順番待ちの列で1つずつ） ----

function enqueue(operation) {
  operationQueue.push(operation);
  if (waitingForPopIndex === null) runQueue();
}

function runQueue() {
  while (operationQueue.length > 0 && waitingForPopIndex === null) {
    const operation = operationQueue.shift();
    try {
      if (operation.kind === "push") {
        historyApi.pushState(operation.state, "", currentUrl());
      } else if (operation.kind === "replace") {
        historyApi.replaceState(operation.state, "", currentUrl());
      } else if (operation.kind === "go" && operation.delta !== 0) {
        waitingForPopIndex = operation.expectIndex;
        // 念のため：popstate が届かない環境でも、列が止まったままにならないようにする
        waitTimer = setTimeout(() => {
          waitingForPopIndex = null;
          runQueue();
        }, 800);
        historyApi.go(operation.delta);
      }
    } catch (error) {
      console.warn("[appHistory] 履歴の操作に失敗しました", error);
    }
  }
}

function finishWaiting() {
  waitingForPopIndex = null;
  clearTimeout(waitTimer);
  runQueue();
}

// ---- 画面が切り替わったとき ----

// 1回の操作の中で画面が2回切り替わることがある（例：検索から開いた画面の［戻る］→ いったんホーム → すぐ検索画面）。
// 途中の画面を履歴に残さないよう、切り替えは少しだけ（setTimeout 0）まとめてから、最後の画面だけを反映する。
let pendingScreen = null;
let pendingTimer = null;
let systemBackFinalScreen = null;

function handleScreenChange(screenName) {
  if (!stack) return;
  if (handlingSystemBack) {
    systemBackScreenChanged = true;
    systemBackFinalScreen = screenName;
    return;
  }
  pendingScreen = screenName;
  if (pendingTimer === null) pendingTimer = setTimeout(flushPendingScreenChange, 0);
}

function flushPendingScreenChange() {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = null;
  const screenName = pendingScreen;
  pendingScreen = null;
  if (screenName !== null && stack) applyScreenChangeNow(screenName);
}

function applyScreenChangeNow(screenName) {
  const plan = planScreenChange(stack, screenName);
  const fromIndex = stack.index;
  stack = applyScreenChange(stack, plan, screenName);
  if (modalEntryActive) {
    // モーダルの記録（今の画面の1つ先）の上にいる状態で画面が変わった（例：「やめますか？」→［やめる］でホームへ）。
    // ブラウザは fromIndex + 1 にいるので、その分を数え直す
    modalEntryActive = false;
    if (plan.type === "push") enqueue({ kind: "replace", state: makeState(stack.index) });
    else if (plan.type === "back") enqueue({ kind: "go", delta: plan.toIndex - (fromIndex + 1), expectIndex: plan.toIndex });
    else {
      enqueue({ kind: "go", delta: -1, expectIndex: fromIndex });
      if (plan.type === "replace") enqueue({ kind: "replace", state: makeState(stack.index) });
    }
  } else if (plan.type === "push") enqueue({ kind: "push", state: makeState(stack.index) });
  else if (plan.type === "replace") enqueue({ kind: "replace", state: makeState(stack.index) });
  else if (plan.type === "back") enqueue({ kind: "go", delta: plan.toIndex - fromIndex, expectIndex: plan.toIndex });
  // 新しい画面でもモーダルが開いたままなら、その分の記録を積み直す
  queueMicrotask(syncModalEntry);
}

// ---- モーダル（確認画面・設定・称号一覧など）にも履歴を1件 ----
// モーダルが開いたら履歴を1件積み、端末の「戻る」で（画面ではなく）モーダルだけが閉じるようにする。
// 画面のボタンでモーダルを閉じたときは、積んだ1件を戻して記録をそろえる。
let modalEntryActive = false;

function syncModalEntry() {
  if (!stack) return;
  flushPendingScreenChange(); // 画面の切り替えの記録を先に（モーダルの記録と順番が逆にならないように）
  const open = Boolean(findOpenModal());
  if (open && !modalEntryActive) {
    modalEntryActive = true;
    enqueue({ kind: "push", state: { ...makeState(stack.index), idx: stack.index + 1, modal: true } });
  } else if (!open && modalEntryActive) {
    modalEntryActive = false;
    enqueue({ kind: "go", delta: -1, expectIndex: stack.index });
  }
}

function watchModals() {
  const isModalMutation = (mutation) =>
    mutation.type === "childList" ||
    MODAL_SELECTORS.some((selector) => mutation.target.matches?.(selector));
  const onMutations = (mutations) => {
    if (mutations.some(isModalMutation)) syncModalEntry();
  };
  // モーダルの表示・非表示は hidden 属性で切り替わる。歴代センター表の全画面は body の直下に足し引きされる。
  // （同じ監視役で observe を2回呼ぶと設定が上書きされるため、監視役を2つに分ける）
  const observeTarget = domRoot.body ?? domRoot;
  new MutationObserver(onMutations).observe(observeTarget, { attributes: true, attributeFilter: ["hidden"], subtree: true });
  new MutationObserver(onMutations).observe(observeTarget, { childList: true });
}

// 端末の「戻る」で［戻る］ボタンを押した（または前の画面へ直接戻した）結果を、最後に1回だけ記録へ反映する。
// ブラウザはすでに baseIndex の位置にいる。finalScreen：最後に表示された画面（変わらなければ null）
function reconcileAfterSystemBack(baseIndex, finalScreen, screenBefore) {
  if (finalScreen === null) {
    // 画面は変わらなかった（ライブページの中の表示だけ戻った・「やめますか？」の確認を出した など）：
    // ブラウザの記録を今の画面の位置へ積み直す
    stack = { entries: stack.entries.slice(0, baseIndex + 1).concat(screenBefore), index: baseIndex + 1 };
    enqueue({ kind: "push", state: makeState(stack.index) });
    return;
  }
  if (stack.entries[baseIndex] === finalScreen) {
    stack = { entries: stack.entries.slice(), index: baseIndex }; // 記録どおりの画面へ戻った
    return;
  }
  for (let i = baseIndex - 1; i >= 0; i--) {
    if (stack.entries[i] === finalScreen) {
      // さらに前の記録の画面へ戻った（例：ホームへ戻る［戻る］）
      stack = { entries: stack.entries.slice(), index: i };
      enqueue({ kind: "go", delta: i - baseIndex, expectIndex: i });
      return;
    }
  }
  // 記録と違う画面へ戻った（例：検索から開いた画面の［戻る］が検索画面へ戻す）：今の1件を書き換える
  const entries = stack.entries.slice(0, baseIndex + 1);
  entries[baseIndex] = finalScreen;
  stack = { entries, index: baseIndex };
  enqueue({ kind: "replace", state: makeState(baseIndex) });
}

// 端末の「戻る」の処理の中で、画面のボタンを押す・画面を移す（その間の画面の切り替えは最後の1つだけを使う）
function runAsSystemBack(baseIndex, action) {
  const screenBefore = currentScreenOf(stack);
  stack = { entries: stack.entries.slice(), index: baseIndex };
  handlingSystemBack = true;
  systemBackScreenChanged = false;
  systemBackFinalScreen = null;
  try {
    action();
  } finally {
    handlingSystemBack = false;
  }
  reconcileAfterSystemBack(baseIndex, systemBackScreenChanged ? systemBackFinalScreen : null, screenBefore);
}

// ---- 端末・ブラウザの「戻る」「進む」 ----

function isVisible(element) {
  return Boolean(element) && !element.hidden && element.getClientRects().length > 0;
}

function findOpenModal() {
  for (const selector of MODAL_SELECTORS) {
    const found = [...domRoot.querySelectorAll(selector)].filter((element) => !element.hidden);
    if (found.length > 0) return found[found.length - 1];
  }
  return null;
}

export function findBackControl(screenElement) {
  if (!screenElement) return null;
  for (const selector of BACK_CONTROL_SELECTORS) {
    const control = [...screenElement.querySelectorAll(selector)].find(isVisible);
    if (control) return control;
  }
  return null;
}

function closeModal(modal) {
  const closeButton = MODAL_CLOSE_SELECTORS.map((selector) => modal.querySelector(selector)).find(isVisible);
  if (closeButton) {
    closeButton.click();
    return;
  }
  // 閉じるボタンが見つからないモーダルは、各画面が用意している Escape キーの処理に任せる
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

let toastElement = null;
let toastTimer = null;
function showToast(message) {
  if (!toastElement) {
    toastElement = document.createElement("div");
    toastElement.className = "app-nav-toast";
    toastElement.setAttribute("role", "status");
    toastElement.setAttribute("aria-live", "polite");
    document.body.appendChild(toastElement);
  }
  toastElement.textContent = message;
  toastElement.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastElement.hidden = true;
  }, 2600);
}

// ブラウザを今いる画面の記録の位置へ戻し直す（「戻る」を受け付けなかったとき用）
function restoreCurrentEntry() {
  const entries = stack.entries.slice(0, stack.index + 1);
  stack = { entries, index: stack.index };
  enqueue({ kind: "push", state: makeState(stack.index) });
}

function handlePopState(event) {
  const state = event.state;
  if (waitingForPopIndex !== null && state && state[STATE_MARK] && state.sid === SESSION_ID && state.idx === waitingForPopIndex) {
    finishWaiting(); // 自分で呼んだ history.go() の結果
    return;
  }
  if (!stack) return;
  flushPendingScreenChange();

  // モーダルの記録から戻った：モーダルだけを閉じる（画面はそのまま）
  if (modalEntryActive && state && state[STATE_MARK] && state.sid === SESSION_ID && state.idx === stack.index) {
    modalEntryActive = false;
    const modal = findOpenModal();
    if (modal) closeModal(modal);
    // 閉じられないモーダル（各画面の都合で閉じない）だった場合は、記録を積み直す
    queueMicrotask(syncModalEntry);
    return;
  }

  // リロード前の古い記録・このアプリの記録ではない位置へ戻った：ホームを最初の記録として置き直す
  if (!state || !state[STATE_MARK] || state.sid !== SESSION_ID) {
    const screen = currentScreenOf(stack);
    const goHome = screen !== "start" && planSystemBack({ screen, modalOpen: false, hasBackControl: true }).type !== "blocked";
    stack = createNavStack(goHome ? "start" : screen);
    historyApi.replaceState(makeState(0), "", currentUrl());
    if (goHome) runAsSystemBack(0, () => navigateFallback?.("start"));
    return;
  }

  const poppedIndex = state.idx;
  if (poppedIndex > stack.index) {
    handleForward(poppedIndex, state);
    return;
  }
  if (poppedIndex === stack.index) return;

  const screen = currentScreenOf(stack);
  const modal = findOpenModal();
  const backControl = findBackControl(getScreenElement?.(screen));
  const plan = planSystemBack({ screen, modalOpen: Boolean(modal), hasBackControl: Boolean(backControl) });

  if (plan.type === "closeModal") {
    closeModal(modal);
    restoreCurrentEntry();
    return;
  }
  if (plan.type === "blocked") {
    showToast("この画面では、画面の中のボタンで戻ってください");
    restoreCurrentEntry();
    return;
  }
  if (plan.type === "clickBack") {
    // 画面の［戻る］を押したのと同じ（戻り先・スクロール位置・検索語・絞り込みの復元は各画面の仕組みのまま）
    runAsSystemBack(poppedIndex, () => backControl.click());
    return;
  }
  // fallback：記録にある前の画面（プレイ中の画面は飛ばす）へ直接戻す
  const targetIndex = findFallbackIndex(stack, poppedIndex);
  const targetScreen = targetIndex >= 0 ? stack.entries[targetIndex] : "start";
  runAsSystemBack(poppedIndex, () => navigateFallback?.(targetScreen));
}

// 「進む」：前に開いていた画面へもう一度移る（閉じたモーダル・プレイ中の画面・対戦中の画面には進まない）
function handleForward(poppedIndex, state) {
  const current = currentScreenOf(stack);
  const screen = state.screen;
  const blocked = planSystemBack({ screen: current, modalOpen: Boolean(findOpenModal()), hasBackControl: true }).type !== "clickBack";
  if (state.modal || blocked || !screen || findFallbackIndex({ entries: [screen], index: 0 }, 0) < 0) {
    enqueue({ kind: "go", delta: stack.index - poppedIndex, expectIndex: stack.index });
    return;
  }
  const entries = stack.entries.slice();
  entries[poppedIndex] = screen;
  stack = { entries, index: stack.index };
  runAsSystemBack(poppedIndex, () => navigateFallback?.(screen));
}

// ---- 外から使う関数 ----

// main.js から1回だけ呼ぶ。
// options：{ initialScreen, onScreenChange（screens.js の登録関数）, navigate（navigateWithScrollMemory）, getScreenElement }
export function initAppHistory({
  initialScreen,
  onScreenChange,
  navigate,
  getScreenElement: getElement,
  historyApi: historyOverride = null,
  popStateTarget: popStateTargetOverride = null,
  domRoot: domRootOverride = null,
}) {
  historyApi = historyOverride ?? (typeof history !== "undefined" ? history : null);
  if (!historyApi || typeof historyApi.pushState !== "function") return;
  popStateTarget = popStateTargetOverride ?? window;
  domRoot = domRootOverride ?? document;
  stack = createNavStack(initialScreen);
  navigateFallback = navigate;
  getScreenElement = getElement;
  try {
    // スクロール位置はアプリ（navigateWithScrollMemory・各画面）が画面ごとに戻すので、ブラウザには戻させない
    // （ブラウザが履歴ごとの位置へ勝手に戻すと、アプリが戻した位置を上書きしてしまう）
    if ("scrollRestoration" in historyApi) historyApi.scrollRestoration = "manual";
    historyApi.replaceState(makeState(0), "", currentUrl());
  } catch (error) {
    console.warn("[appHistory] 履歴の初期化に失敗しました", error);
    stack = null;
    return;
  }
  onScreenChange(handleScreenChange);
  popStateTarget.addEventListener("popstate", handlePopState);
  watchModals();
  syncModalEntry(); // 起動時にすでに開いているモーダル（お祝いなど）の分
}

function currentUrl() {
  return typeof location !== "undefined" ? location.href : "";
}

// アプリの［戻る］で「ホームへ」戻ろうとしたとき、ハブ（ゲーム・楽曲・ガイド）を通って来ていればハブを返す（main.js から使う）
export function resolveBackTarget(fromScreen, targetScreen) {
  if (!stack) return targetScreen;
  if (!handlingSystemBack) flushPendingScreenChange();
  return resolveHubReturn(stack, fromScreen, targetScreen);
}

// テスト・確認用：今のスタックの写し
export function getNavStackSnapshot() {
  return stack ? { entries: stack.entries.slice(), index: stack.index } : null;
}

// テスト・確認用：履歴の操作の待ち状態
export function getAppHistoryDebugState() {
  return { modalEntryActive, waitingForPopIndex, queuedOperations: operationQueue.length, stack: getNavStackSnapshot() };
}
