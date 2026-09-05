// Service Worker（sw.js）のAPP_SHELL_FILESに、実際に本番コードからimportされている
// jsファイルが漏れなく含まれているかの回帰防止テスト（2026-09-06、長時間耐久検証PHASE Lの
// 防御的ソース監査で発見）。
//
// 【発見された不具合】js/main.jsはjs/answerButtonInteraction.jsをimportして実際に使って
// いる（js/lyricsQuizScreen.js・js/onlineLyricsQuizBattleScreen.jsからも使われる）のに、
// sw.jsのAPP_SHELL_FILESにこのファイルが含まれていなかった。sw.js自身の冒頭コメントが
// 「新しいJSファイルなどを追加したときは、ここにも追記すること」と警告している、まさに
// その失敗モード。事前キャッシュされないため、オフライン起動時や初回アクセス時の通信状況
// によっては読み込みに失敗する可能性があった。
//
// 【なぜソーステキストの構造チェックなのか】sw.js・js/main.jsはService Worker登録や
// 大量の画面初期化処理を伴い、tests.htmlへ安全にimportできない
// （tests/inviteFullRoomRegression.test.js等と同じ理由）。
import { assertEqual } from "./test-utils.js";

export async function runServiceWorkerCacheCompletenessTests() {
  const swResponse = await fetch("sw.js");
  const swSource = await swResponse.text();
  assertEqual(swSource.length > 500, true, "sw.jsのソースを取得できた（前提条件）");

  const shellStart = swSource.indexOf("const APP_SHELL_FILES = [");
  assertEqual(shellStart !== -1, true, "APP_SHELL_FILESの定義が見つかる（前提条件）");
  const shellEnd = swSource.indexOf("];", shellStart);
  const shellBody = swSource.slice(shellStart, shellEnd);

  assertEqual(
    shellBody.includes('"./js/answerButtonInteraction.js"'),
    true,
    "answerButtonInteraction.jsがAPP_SHELL_FILESに含まれている（本番コードから実際にimportされているため）"
  );

  // 【一般化】main.jsが実際にimportしているローカルjsファイルを総ざらいし、
  // それら全てがAPP_SHELL_FILESに含まれていることを確認する。これにより、今後
  // main.jsへ新しいimportが追加されてsw.jsへの追記だけ忘れた場合も、このテストが検知する。
  const mainResponse = await fetch("js/main.js");
  const mainSource = await mainResponse.text();
  assertEqual(mainSource.length > 500, true, "js/main.jsのソースを取得できた（前提条件）");

  const importPattern = /from\s+"\.\/([a-zA-Z0-9_./-]+\.js)"/g;
  const importedRelativePaths = new Set();
  let match;
  while ((match = importPattern.exec(mainSource)) !== null) {
    importedRelativePaths.add(match[1]);
  }
  assertEqual(importedRelativePaths.size > 10, true, "js/main.jsから複数のローカルimportを検出できた（前提条件）");

  const missingFromCache = [...importedRelativePaths]
    .map((relativePath) => `./js/${relativePath}`)
    .filter((cachePath) => !shellBody.includes(`"${cachePath}"`));

  assertEqual(
    missingFromCache,
    [],
    `js/main.jsがimportしている全てのローカルjsファイルがAPP_SHELL_FILESに含まれている（漏れ: ${missingFromCache.join(", ")}）`
  );
}
