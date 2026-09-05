// アプリ全体でのユーザー操作によるページ拡大縮小（ダブルタップズーム・ピンチズーム）禁止
// （2026-09-05新設、本人指示）の回帰防止テスト。
//
// 【なぜ通常の関数呼び出しテストではなく、ソーステキストの構造チェックなのか】
// css/style.cssはJavaScriptモジュールではないため通常のimportテストができず、
// js/main.jsはアプリ全体のブートストラップ処理（DOM要素の大量取得・Firebase初期化等の
// 副作用）を大量に含むため、tests.htmlのようなテスト環境へ安全にimportできない
// （tests/songlist.test.js・tests/onlineBattleRoomStateRestoreRegression.test.js冒頭の
// コメントと同じ理由）。そのため、実際のファイルの中身を`fetch()`で取得し、
// 期待する記述が存在するかを機械的に確認する。
import { assertEqual } from "./test-utils.js";

export async function runPageZoomPreventionTests() {
  // ---- CSS側：html/bodyにtouch-action: pan-x pan-y が設定されている ----
  {
    const response = await fetch("css/style.css");
    const rawSourceText = await response.text();
    assertEqual(rawSourceText.length > 1000, true, "css/style.cssのソースを取得できた（テストの前提条件）");
    // 改行コード（\r\nと\n）の違いに依存しないよう正規化する（CRLF/LFどちらの保存状態でも
    // このテストが誤って失敗しないようにするため）。
    const sourceText = rawSourceText.replace(/\r\n/g, "\n");

    // html, body { ... touch-action: pan-x pan-y; ... } という形のルールを探す
    // （厳密な1行一致ではなく、"html,"と"body {"が近くにあり、その後ろにtouch-actionの
    // 指定が続くことを確認する、多少の書式変更に耐えられる緩やかな検査にする）。
    const htmlBodyRuleIndex = sourceText.indexOf("html,\nbody {");
    assertEqual(htmlBodyRuleIndex !== -1, true, "html, body { ... } の基本ルールが存在する（前提条件）");

    const ruleBlock = sourceText.slice(htmlBodyRuleIndex, htmlBodyRuleIndex + 200);
    assertEqual(
      ruleBlock.includes("touch-action: pan-x pan-y;"),
      true,
      "html/body全体に touch-action: pan-x pan-y が設定されている" +
        "（ピンチズーム・ダブルタップズームを防ぎつつ、縦横のパン操作は許可する設定）"
    );
  }

  // ---- JS側：gesturestart/gesturechange/gestureendがpreventDefaultされている（iOS Safari向け補助） ----
  {
    const response = await fetch("js/main.js");
    const sourceText = await response.text();
    assertEqual(sourceText.length > 1000, true, "js/main.jsのソースを取得できた（テストの前提条件）");

    const gestureEventNames = ["gesturestart", "gesturechange", "gestureend"];
    gestureEventNames.forEach((eventName) => {
      assertEqual(
        sourceText.includes(`"${eventName}"`),
        true,
        `js/main.jsが"${eventName}"イベントを扱っている（iOS Safariのピンチズーム対策）`
      );
    });

    // 上記3イベントが、実際にpreventDefault()する1つの登録処理としてまとまっていることを、
    // 大まかな近接判定で確認する（3つのイベント名がすべて含まれる、そう長くない範囲の中に
    // event.preventDefault()の呼び出しが存在すること）。
    const firstEventIndex = sourceText.indexOf('"gesturestart"');
    const nearbyBlock = sourceText.slice(firstEventIndex, firstEventIndex + 400);
    assertEqual(
      gestureEventNames.every((eventName) => nearbyBlock.includes(`"${eventName}"`)),
      true,
      "gesturestart/gesturechange/gestureendの3つが、近い範囲でまとめて登録されている"
    );
    assertEqual(
      nearbyBlock.includes("preventDefault()"),
      true,
      "ジェスチャーイベントに対してpreventDefault()が呼ばれている"
    );
  }
}
