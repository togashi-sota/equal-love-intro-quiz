// パーティー対戦の終了後の戻り先（2026-09-15 第4回実機QA修正・本人指示）のテスト。
//
// 【仕様】試合中の「終了｜長押し」→確認→終了、および結果画面の「終了」は、ホーム最上部ではなく
// 「パーティー対戦カードを押した直後の設定画面（設定トップ）」へ戻る。設定トップの「戻る」はホームの
// 「パーティー対戦」カード付近へ（スクロール記憶＋カードへの scrollIntoView）。
// 画面遷移は main.js の配線（navigateBattleScreen＝効果音＋navigateWithScrollMemory）に依存するため、
// ここでは (1) 設定画面の遷移関数が呼ばれる先をソース構造で固定し、(2) ホームのカードが data-mode-id を持つことを
// 実DOMで確認し、(3) 「カード付近へ戻す」処理が実際に scrollIntoView でカードを画面内へ持ってくることを
// iframe で再現して検証する。
import { assertEqual } from "./test-utils.js";
import { buildAvailableCard } from "../js/specialModesScreen.js";

export async function runPartyBattleNavigationTests() {
  const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

  // ===== (1) ソース構造：戻り先 =====
  const screen = await fetchText("js/partyBattleScreen.js");
  const abortBody = screen.slice(screen.indexOf("function finishAbort() {"), screen.indexOf("// 「終了｜長押し」成立"));
  assertEqual(abortBody.includes("returnToPartySetupTop()"), true, "試合中の終了（finishAbort）は設定トップへ戻す");
  assertEqual(abortBody.includes('navigateTo("start")'), false, "試合中の終了でホームへは戻さない");
  const returnBody = screen.slice(screen.indexOf("function returnToPartySetupTop() {"), screen.indexOf("function finishAbort() {"));
  assertEqual(returnBody.includes('elements.navigateTo("partyBattleSetup")') && returnBody.includes("elements.scrollToTop?.()"), true, "設定トップへ戻すときは設定画面へ遷移し、先頭までスクロールを戻す");
  assertEqual(returnBody.includes("renderSetupFromSettings()"), true, "設定画面はその試合の設定内容で描き直す（再入力不要）");
  const resultHomeBody = screen.slice(screen.indexOf('elements.resultHomeButton.addEventListener("click"'), screen.indexOf("});", screen.indexOf('elements.resultHomeButton.addEventListener("click"')) + 3);
  assertEqual(resultHomeBody.includes("returnToPartySetupTop()"), true, "結果画面の「終了」も設定トップへ");
  assertEqual(resultHomeBody.includes('navigateTo("start")'), false, "結果画面の「終了」でホームへは戻さない");
  const setupBackBody = screen.slice(screen.indexOf('elements.setupBackButton.addEventListener("click"'), screen.indexOf("});", screen.indexOf('elements.setupBackButton.addEventListener("click"')) + 3);
  assertEqual(setupBackBody.includes("elements.navigateHomeToPartyCard()"), true, "設定トップの「戻る」はホームの「パーティー対戦」カード付近へ");
  const rematchExists = screen.includes("elements.rematchButton.addEventListener") && screen.includes("elements.changeSettingsButton.addEventListener");
  assertEqual(rematchExists, true, "「同じ設定でもう一戦」「設定を変えて再戦」は従来どおり（二重遷移を作らない）");
  const html = await fetchText("index.html");
  assertEqual(html.includes('id="party-result-home-button" class="secondary-button" type="button">終了（設定画面へ）</button>'), true, "結果画面の「終了」ボタンの文言が戻り先（設定画面）を示す");

  const main = await fetchText("js/main.js");
  assertEqual(main.includes("navigateHomeToPartyCard: () => {") && main.includes('scrollHomeToSpecialModeCard("partyBattle")'), true, "main.js：設定トップの「戻る」でホームのパーティー対戦カードへスクロール");
  const scrollBody = main.slice(main.indexOf("function scrollHomeToSpecialModeCard(modeId) {"), main.indexOf("initLocalBattleScreens({"));
  assertEqual(scrollBody.includes("requestAnimationFrame(") && scrollBody.includes('scrollIntoView({ block: "center"'), true, "main.js：レイアウト確定後（1フレーム後）にカードを画面中央へ");
  assertEqual(scrollBody.includes('#start-screen .special-mode-card[data-mode-id="${modeId}"]'), true, "main.js：ホーム画面のカードを data-mode-id で特定");
  assertEqual(main.includes("  scrollToTop,\n") && main.includes("import { showScreen, onScreenChange, scrollToTop }"), true, "main.js：設定トップへ戻すための scrollToTop（screens.js）を渡す");

  // ===== (2) ホームのカードが data-mode-id を持つ =====
  const card = buildAvailableCard({ id: "partyBattle", title: "パーティー対戦", description: "テスト", icon: "party", iconClass: "", isNew: false });
  assertEqual(card.dataset.modeId, "partyBattle", "特別モードカードは data-mode-id を持つ（戻り先の目印）");
  assertEqual(card.className.includes("special-mode-card"), true, "カードのクラスは従来どおり");

  // ===== (3) iframe で再現：ホーム相当の長いページで、カード付近へ戻す処理が実際にカードを画面内へ持ってくる =====
  await new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-3000px;top:0;width:393px;height:852px;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}.filler{height:2400px}.special-mode-card{height:160px;background:#fce}</style></head>
      <body><section id="start-screen"><div class="filler"></div><div class="special-mode-card" data-mode-id="partyBattle"></div><div class="filler"></div></section></body></html>`);
    doc.close();
    const win = iframe.contentWindow;
    const run = () => {
      try {
        win.scrollTo(0, 0);
        // main.js の scrollHomeToSpecialModeCard と同じ処理
        // （main.js は requestAnimationFrame。テストでは Browser pane が非表示だと rAF が止まるため setTimeout で代替）
        setTimeout(() => {
          const cardElement = doc.querySelector('#start-screen .special-mode-card[data-mode-id="partyBattle"]');
          cardElement.scrollIntoView({ block: "center", behavior: "auto" });
          setTimeout(() => {
            const rect = cardElement.getBoundingClientRect();
            assertEqual(rect.top >= 0 && rect.bottom <= 852, true, `カード付近へ戻す処理でカードが画面内に入る（top=${Math.round(rect.top)}）`);
            assertEqual(win.scrollY > 1000, true, "ホーム最上部（scrollY=0）ではない");
            iframe.remove();
            resolve();
          }, 50);
        }, 0);
      } catch (error) {
        iframe.remove();
        reject(error);
      }
    };
    if (doc.readyState === "complete") run();
    else win.addEventListener("load", run);
  });
}
