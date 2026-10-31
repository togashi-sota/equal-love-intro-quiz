// 長いページを下へ動かしたときに出る、小さな「戻る」の浮くボタンを担当するファイル
// （2026-11-01新設・本人の追加依頼 3「長いページでも『戻る』を押しやすく」）。
//
// 【なぜ必要か】各画面の［戻る］（.back-link）は画面の一番上の見出しの横にしか無いので、
// ＝LOVE について・コールを覚える・ガイド・一覧のような長いページを下まで読むと、
// 戻るためにいちばん上まで指で戻す必要があった。
//
// 【どう動くか】
// - 画面の［戻る］が上へ隠れたら、左上に小さな「‹ 戻る」の札をふわっと出す。上へ戻して
//   元の［戻る］が見えたら消す（同じボタンが2つ同時に見えないように）。
// - 札を押すと、その画面の元の［戻る］ボタンを「押したこと」にするだけ（element.click()）。
//   戻り先・効果音・試聴の停止・ナビゲーションの記録（js/appHistory.js・js/appNavigationStack.js）は
//   今までの［戻る］の処理がそのまま動くので、戻る動きは何も変わらない。
// - 元の［戻る］の探し方は、端末の「戻る」と同じ findBackControl（js/appHistory.js）を使う。
// - 見出しの下に貼り付く帯（コール表の操作の帯など）があるときは、その帯の下へずらして重ねない。
// - モーダル・全画面の表示が開いている間は出さない。
//
// 【出さない画面】FLOATING_BACK_EXCLUDED_SCREENS（理由つき）。それ以外で［戻る］（.back-link）がある画面はすべて対象。

// 出さない画面と、その理由（本人への報告とテストで使う）
export const FLOATING_BACK_EXCLUDED_SCREENS = Object.freeze({
  start: "ホーム（戻る先が無い。カテゴリの帯が上に貼り付く）",
  onboarding: "初回のセットアップ（戻る操作を受け付けない画面）",
  // プレイ中の画面：画面の高さに合わせて作ってあり縦に長くならない。押すとプレイが中断になるので誤タップを避ける
  quiz: "プレイ中（イントロクイズの問題）",
  lyricsQuizQuestion: "プレイ中（歌詞クイズの問題）",
  instantChallengeQuestion: "プレイ中（一瞬チャレンジの問題）",
  partyBattlePlay: "プレイ中（パーティー対戦の盤面）",
  // 前の版のライブコール：動きを変えない約束（COMMON.md）。再生の画面は全画面で、専用の戻るが常に見える
  liveCallModePlayer: "前の版のライブコール（同期モード）の再生画面。動きを変えない約束",
  liveCallModeKaraoke: "前の版のカラオケ（全画面）。専用の戻るのアイコンが常に見える",
  // 対戦の進行中：端末の「戻る」も受け付けない画面。誤タップでルームを出る・対戦が壊れるのを防ぐ
  onlineBattleLobby: "オンライン対戦の進行中（ルームを誤って出ないように）",
  onlineBattleConfirm: "オンライン対戦の進行中",
  onlineBattleRematchReady: "オンライン対戦の進行中",
  onlineBattleCountdown: "オンライン対戦の進行中",
  onlineBattleWaiting: "オンライン対戦の進行中",
  onlineBattleSpectator: "オンライン対戦の進行中",
  onlineBattleSongPicker: "オンライン対戦の進行中（下に固定のバーがある）",
  onlineBattleResult: "オンライン対戦の進行中",
  onlineInstantBattleQuestion: "オンライン対戦の進行中",
  onlineInstantBattleResult: "オンライン対戦の進行中",
  onlineInstantCoopBattleQuestion: "オンライン対戦の進行中",
  onlineInstantCoopBattleResult: "オンライン対戦の進行中",
  onlineLyricsBattleQuestion: "オンライン対戦の進行中",
  onlineLyricsBattleResult: "オンライン対戦の進行中",
  battleSetup: "1台対戦（旧）の進行中（端末の戻るも受け付けない）",
  battleCodeShare: "1台対戦（旧）の進行中",
  battleJoin: "1台対戦（旧）の進行中",
  battleRuleConfirm: "1台対戦（旧）の進行中",
  battleResultCollect: "1台対戦（旧）の進行中",
  battleResultRanking: "1台対戦（旧）の進行中",
});

// 見出しの下に貼り付く（sticky / fixed で画面の上に残る）帯。札をこの下へずらす
export const STICKY_TOP_SELECTORS = [".lc-toolbar", ".calls-toggle-button", ".lyrics-mode-toggle-button", ".ct-section-label"];

// 札の上の基本の余白（安全領域の下から）と、帯との間
const BASE_GAP_PX = 8;
const STICKY_GAP_PX = 6;

// 画面の元の［戻る］が「上へ隠れた」とみなす位置（下端がこれより上なら隠れた）
const HIDDEN_ABOVE_PX = 2;

// その画面が対象かどうか（［戻る］があるかは別に調べる）
export function isFloatingBackScreen(screenName) {
  return Boolean(screenName) && !Object.prototype.hasOwnProperty.call(FLOATING_BACK_EXCLUDED_SCREENS, screenName);
}

// 札を出すかどうかの判断だけ（DOM に触らない。テストしやすくするため）
//   screenName：今の画面、hasControl：元の［戻る］が見えているか、controlBottom：その下端の位置（画面の上からの px）、
//   overlayOpen：モーダル・全画面の表示が開いているか
export function decideFloatingBack({ screenName, hasControl, controlBottom, overlayOpen }) {
  if (!isFloatingBackScreen(screenName)) return false;
  if (!hasControl || overlayOpen) return false;
  return typeof controlBottom === "number" && controlBottom < HIDDEN_ABOVE_PX;
}

// 札の上の位置を、貼り付いている帯の下へずらす量（px）。
//   baseTop：札の本来の上端、pill：{ left, right, height }、obstacles：帯の { top, bottom, left, right } の一覧
export function computeStickyOffset(baseTop, pill, obstacles) {
  let top = baseTop;
  // 帯が2段に重なる場合もあるので、ずらした位置でもう一度確かめる（最大で帯の数だけ）
  for (let pass = 0; pass < obstacles.length; pass++) {
    let moved = false;
    for (const rect of obstacles) {
      const horizontallyOverlaps = rect.left < pill.right && rect.right > pill.left;
      const stuckAtTop = rect.top <= top + 1; // 画面の上に貼り付いている（札より上から始まる）
      const verticallyOverlaps = rect.bottom > top - STICKY_GAP_PX && rect.top < top + pill.height;
      if (horizontallyOverlaps && stuckAtTop && verticallyOverlaps) {
        top = rect.bottom + STICKY_GAP_PX;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return Math.max(0, Math.round(top - baseTop));
}

// 元の［戻る］の文字（「ホーム」「戻る」など）を札にも使う。長すぎるときは「戻る」
export function buildFloatingBackLabel(control) {
  const text = (control?.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text || text.length > 10) return "戻る";
  return text;
}

// ---- 画面への組み込み ----

let state = null;

function isVisible(element) {
  return Boolean(element) && !element.hidden && element.getClientRects().length > 0;
}

function createPill() {
  const button = document.createElement("button");
  button.type = "button";
  button.id = "floating-back-button";
  button.className = "floating-back";
  button.setAttribute("aria-hidden", "true");
  button.tabIndex = -1;
  button.innerHTML =
    '<svg class="floating-back-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M15 5 8 12l7 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
    '<span class="floating-back-label">戻る</span>';
  return button;
}

function setShown(shown) {
  const { button } = state;
  if (state.shown === shown) return;
  state.shown = shown;
  button.classList.toggle("is-shown", shown);
  // 見えていない間は読み上げ・キーボードの移動の対象にしない
  button.setAttribute("aria-hidden", shown ? "false" : "true");
  button.tabIndex = shown ? 0 : -1;
  if (!shown && document.activeElement === button) button.blur();
}

// 今の画面の元の［戻る］を探す（見えていないものは使わない）
function currentControl() {
  const screenName = document.body.dataset.screen;
  if (!isFloatingBackScreen(screenName)) return null;
  const control = state.findBackControl(state.getScreenElement(screenName));
  // 対象は見出しの［戻る］（.back-link）だけ。問題画面の「タイトルへ」・カラオケのアイコンは使わない
  return control && control.classList.contains("back-link") ? control : null;
}

// 札の本来の上端（安全領域＋余白。帯でずらした分は除く）。CSS の top は px に解決された値で読める
function readBaseTop() {
  const top = parseFloat(getComputedStyle(state.button).top);
  return Number.isFinite(top) ? top - state.offset : BASE_GAP_PX;
}

// 札の位置を決める：横は外側の枠（.game-frame）の左端にそろえ、縦は貼り付いている帯の下へ
function placePill(screenElement) {
  const { button } = state;
  const frame = document.querySelector(".game-frame");
  const frameLeft = frame ? frame.getBoundingClientRect().left : 0;
  button.style.setProperty("--fb-frame-left", `${Math.max(0, Math.round(frameLeft))}px`);

  const baseTop = readBaseTop();
  const pillRect = button.getBoundingClientRect();
  const pill = { left: pillRect.left, right: pillRect.right, height: pillRect.height || 40 };
  const obstacles = [];
  STICKY_TOP_SELECTORS.forEach((selector) => {
    screenElement.querySelectorAll(selector).forEach((element) => {
      if (!isVisible(element)) return;
      const position = getComputedStyle(element).position;
      if (position !== "sticky" && position !== "fixed") return;
      obstacles.push(element.getBoundingClientRect());
    });
  });
  state.offset = computeStickyOffset(baseTop, pill, obstacles);
  button.style.setProperty("--fb-offset", `${state.offset}px`);
}

// 今の状態から、札を出すか・どこに出すかを決め直す（スクロール・画面の切り替え・モーダルの開閉のたび）
export function updateFloatingBack() {
  if (!state) return false;
  const screenName = document.body.dataset.screen;
  const control = currentControl();
  const overlayOpen = state.isOverlayOpen();
  const shown = decideFloatingBack({
    screenName,
    hasControl: isVisible(control),
    controlBottom: control ? control.getBoundingClientRect().bottom : null,
    overlayOpen,
  });
  if (shown) {
    const label = buildFloatingBackLabel(control);
    state.labelElement.textContent = label;
    state.button.setAttribute("aria-label", label === "戻る" ? "戻る" : `戻る（${label}）`);
    placePill(state.getScreenElement(screenName));
  }
  setShown(shown);
  return shown;
}

function scheduleUpdate() {
  if (!state || state.frameRequested) return;
  state.frameRequested = true;
  requestAnimationFrame(() => {
    if (!state) return;
    state.frameRequested = false;
    updateFloatingBack();
  });
}

function defaultIsOverlayOpen() {
  // js/scrollLock.js のモーダル・歌詞の全画面と、歴代センター表の全画面（js/appHistory.js と同じ対象）
  return [...document.querySelectorAll(".modal-overlay, .lyrics-fullscreen-overlay, .centers-table-overlay")].some(
    (element) => !element.hidden
  );
}

// main.js から1回だけ呼ぶ。
//   onScreenChange：js/screens.js の画面の切り替えの通知、getScreenElement：画面名 → section、
//   findBackControl：js/appHistory.js の「その画面の［戻る］を探す」
export function initFloatingBack({ onScreenChange, getScreenElement, findBackControl, isOverlayOpen = defaultIsOverlayOpen }) {
  if (state) return state.button;
  const button = createPill();
  document.body.appendChild(button);
  state = {
    button,
    labelElement: button.querySelector(".floating-back-label"),
    getScreenElement,
    findBackControl,
    isOverlayOpen,
    shown: false,
    offset: 0,
    frameRequested: false,
  };

  button.addEventListener("click", () => {
    const control = currentControl();
    setShown(false);
    // 元の［戻る］を押したことにする（戻り先・効果音・記録は今までの処理のまま）
    if (control) control.click();
  });

  window.addEventListener("scroll", scheduleUpdate, { passive: true });
  window.addEventListener("resize", scheduleUpdate, { passive: true });
  onScreenChange(() => {
    // 画面が変わったら、まず消してから（前の画面の札が残らないように）新しい画面で決め直す
    setShown(false);
    scheduleUpdate();
  });
  // モーダルの開閉（js/scrollLock.js が body の style を変える）・全画面の表（body の直下に足される）・
  // 画面の中の表示の切り替え（タブ・ガイドの項目の開け閉めなどで高さが変わる）にも追いつく
  new MutationObserver(scheduleUpdate).observe(document.body, { attributes: true, attributeFilter: ["style"], childList: true });
  document.addEventListener("click", scheduleUpdate, { passive: true });
  scheduleUpdate();
  return button;
}
