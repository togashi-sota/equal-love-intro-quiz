// 「対戦が既にresultになっているルームへ、このタブでは一度も対戦中(playing/countdown)を
// 経由せずに入ると、結果画面のルール概要（対戦モード・出題数等のチップ）は表示されるのに、
// 参加者ごとの順位一覧（誰が何位・正解数・タイム）が0件のまま表示される」不具合
// （2026-09-05、5人でのオンライン対戦テスト中に実機・実Firebaseで発見・修正）の回帰防止テスト。
//
// 【原因】js/onlineBattleScreen.jsのgoToResultScreen()は、モジュール変数currentMatchIdを
// キーにroom.matches[currentMatchId]から試合記録を取得するが、以前はこの関数自身が
// currentMatchIdを設定し直さず、対戦中の画面（enterOnlineBattlePlay()）が過去に設定した値を
// そのまま信じていた。ブラウザのリロード・アプリの再読み込み等で「対戦中を経由せず
// 直接resultへ入る」タブでは、currentMatchIdがnull（または前回の試合のまま）になっており、
// room.matches[currentMatchId]が空オブジェクトとなって、参加者一覧（finishers/dnfEntries）が
// 0件になっていた。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineBattleScreen.jsはFirebase接続・DOM要素の
// 大量取得を伴い、tests.htmlのようなテスト環境へ安全にimportできない
// （tests/questionSourceModeLeakage.test.js等と同じ理由）。
import { assertEqual } from "./test-utils.js";

export async function runOnlineBattleResultScreenMatchIdRegressionTests() {
  const response = await fetch("js/onlineBattleScreen.js");
  const source = await response.text();
  assertEqual(source.length > 1000, true, "js/onlineBattleScreen.jsのソースを取得できた（前提条件）");

  const fnStart = source.indexOf("function goToResultScreen(room) {");
  assertEqual(fnStart !== -1, true, "goToResultScreen()が存在する（前提条件）");
  const fnBody = source.slice(fnStart, fnStart + 1600);
  assertEqual(
    fnBody.includes("currentMatchId = room.activeMatchId;"),
    true,
    "goToResultScreen()が、呼ばれるたび必ずcurrentMatchIdをroom.activeMatchIdへ設定しなおしている" +
      "（対戦中を経由せず直接resultへ入った場合でも、順位一覧が正しくroom.matchesから解決できるようにするため）"
  );
}
