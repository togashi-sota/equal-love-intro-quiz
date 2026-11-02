/**
 * YouTube 出演図鑑の自動更新の「外からの合図」（Google Apps Script。2026-11-03）
 *
 * 本人の Google アカウントの Apps Script で、週1回、GitHub の公開の仕組み（workflow_dispatch）を動かす。
 * GitHub の定期実行（schedule）は、公開リポジトリで60日間動きが無いと止まるが、外からの合図（workflow_dispatch）には
 * その決まりが無いので、何か月もアプリを更新しなくても更新が続く。
 *
 * 置くもの（scripts/youtube/SETUP.md の手順）：
 *  - スクリプト プロパティ GITHUB_TOKEN：fine-grained personal access token（このリポジトリだけ・Actions: Read and write だけ・期限なし）
 *    ※コードやチャットには書かない。Apps Script の［プロジェクトの設定］→［スクリプト プロパティ］に入れる
 *  - 時間主導型のトリガー：weeklyRefresh を毎週月曜 3〜4時（installWeeklyTrigger を1回実行すると作られる）
 *
 * 失敗したとき：Apps Script は、トリガーで動いた関数が失敗すると、本人にメールを送る（Google の仕組み）。
 * この関数は、次のときにわざと失敗して、メールで知らせる：
 *  - GitHub への合図が通らない（トークンの期限切れ・取り消し・権限の不足など）
 *  - 公開中のサイトの YouTube のデータが10日以上古い（前の週の更新が失敗した・止まっている）
 */

var REPOSITORY = "togashi-sota/equal-love-intro-quiz";
var WORKFLOW_FILE = "deploy-pages.yml";
var DATA_URL = "https://togashi-sota.github.io/equal-love-intro-quiz/data/youtube-appearances.json";
var STALE_DAYS = 10;

function weeklyRefresh() {
  var problems = [];

  // 1. 前の更新が生きているか（公開中のデータの取得日）
  var age = checkPublishedDataAgeDays_();
  if (age === null) problems.push("公開中のサイトに YouTube のデータがありません（期限切れで外されたか、まだ一度も作られていません）");
  else if (age >= STALE_DAYS) problems.push("公開中の YouTube のデータが " + Math.floor(age) + " 日前のままです（更新が失敗しているかもしれません）");

  // 2. GitHub に「今週の更新をして」と合図する
  var token = PropertiesService.getScriptProperties().getProperty("GITHUB_TOKEN");
  if (!token) {
    problems.push("スクリプト プロパティに GITHUB_TOKEN がありません");
  } else {
    var response = UrlFetchApp.fetch("https://api.github.com/repos/" + REPOSITORY + "/actions/workflows/" + WORKFLOW_FILE + "/dispatches", {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
      payload: JSON.stringify({ ref: "master", inputs: { reason: "scheduled-dispatch" } }),
      muteHttpExceptions: true,
    });
    var code = response.getResponseCode();
    if (code !== 204) problems.push("GitHub への合図が通りませんでした（HTTP " + code + "）。トークンの期限・権限を確かめてください");
  }

  if (problems.length) {
    // 失敗にすると、Apps Script が本人にメールで知らせる
    throw new Error("YouTube 出演図鑑の自動更新：" + problems.join(" ／ "));
  }
}

function checkPublishedDataAgeDays_() {
  var response = UrlFetchApp.fetch(DATA_URL + "?t=" + Date.now(), { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) return null;
  try {
    var data = JSON.parse(response.getContentText());
    var fetched = Date.parse(data.fetchedAt);
    if (isNaN(fetched)) return null;
    return (Date.now() - fetched) / (24 * 60 * 60 * 1000);
  } catch (error) {
    return null;
  }
}

// 1回だけ手で実行する：毎週月曜 3〜4時（日本時間）に weeklyRefresh を動かすトリガーを作る（前のものは消してから作る）
function installWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === "weeklyRefresh") ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger("weeklyRefresh").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).inTimezone("Asia/Tokyo").create();
}
