// 【2026-11-03新設】YouTube 出演図鑑の自動更新（30日ルール）の回帰テスト。
// 判定とデータ作り（js/youtubeRefreshCore.js）・アプリでの読み込みと期限（js/youtubeAppearanceData.js）・
// 公開の決め方（正常・失敗・期限切れ・削除・壊れたデータ・件数の急減）・前の確定を下げない決まり・
// 自動更新が YouTube のデータ以外に触れない仕組み（公開のワークフロー・スクリプト）・Service Worker（network-first）を確かめる。
// YouTube の API・GitHub には繋がない（動画はテストの中で作ったダミー）。
import { MEMBERS } from "../js/data/members.js";
import { APPEARANCE_STATUS } from "../js/youtubeAppearanceClassifier.js";
import {
  HOLD_MAX_DAYS,
  SUDDEN_DROP_RATIO,
  buildYoutubePublishedData,
  checkYoutubePublication,
  decideYoutubePublication,
  describeYoutubeRefreshForIssue,
  isAllowedRefreshOutput,
} from "../js/youtubeRefreshCore.js";
import {
  YOUTUBE_DATA_PATH,
  YOUTUBE_DATA_STATE,
  getYoutubeAppearanceSnapshot,
  interpretYoutubeData,
  isYoutubeDataExpired,
  loadYoutubeAppearanceData,
  setYoutubeAppearanceSnapshotForTest,
  validateYoutubePublishedData,
  youtubeDataExpiry,
} from "../js/youtubeAppearanceData.js";
import { assertEqual } from "./test-utils.js";

const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();
const DAY = 24 * 60 * 60 * 1000;
const memberIdSet = new Set(MEMBERS.map((member) => member.id));

function castDescription(lead, names) {
  return [lead, "", "▼是非チャンネル登録お願いします！", "https://example.invalid/sub", "", ...(names ? ["▼出演メンバー", ...names, ""] : []), "★公式X", "https://example.invalid/x"].join("\n");
}

function rawVideo(id, title, description, publishedAt = "2024-01-01T09:00:00Z") {
  return { id, title, description, publishedAt, duration: "PT10M", privacyStatus: "public", liveStreaming: null };
}

function makeFetched({ fetchedAt = "2026-11-02T00:00:00.000Z", videos }) {
  return { meta: { fetchedAt, channelVideoCount: videos.length }, videos, shortsIds: [], liveIds: [], playlists: [{ title: "ダミーの企画", videoIds: ["fixVideo001"] }] };
}

const BASE_VIDEOS = [
  rawVideo("fixVideo001", "料理対決", castDescription("料理をしました", ["野口 衣織 (Iori Noguchi)", "大場 花菜 (Hana Oba)"]), "2021-05-01T09:00:00Z"),
  rawVideo("fixVideo002", "【ノイミー】旅行", castDescription("旅行", ["ダミー 一子", "ダミー 二葉"])),
  rawVideo("fixVideo003", "年末のごあいさつ", castDescription("あいさつ", null), "2022-12-31T09:00:00Z"),
  rawVideo("fixVideo004", "クレーンゲーム", castDescription("ゲーム", ["山本 杏奈 (Anna Yamamoto)"]), "2023-03-03T09:00:00Z"),
];
const NOW = new Date("2026-11-02T12:00:00.000Z");

function runBuildTests() {
  const { data, report } = buildYoutubePublishedData({ fetched: makeFetched({ videos: BASE_VIDEOS }), verifiedJudgments: [], previous: null, now: NOW });
  const ids = data.videos.map((video) => video.id);
  assertEqual(ids, ["fixVideo001", "fixVideo003", "fixVideo004"], "正常：収録と未確認を古い順に。≠ME・≒JOY だけの動画は入れない");
  const first = data.videos[0];
  assertEqual([first.status, first.memberIds, first.footageMemberIds, first.publishedAt, first.series], [APPEARANCE_STATUS.CAST_LIST, ["noguchi-iori", "oba-hana"], [], "2021-05-01", ["ダミーの企画"]], "正常：公式の出演者の表記で確定・日本時間の公開日・再生リスト");
  assertEqual(data.videos.find((video) => video.id === "fixVideo003").status, APPEARANCE_STATUS.UNCONFIRMED, "正常：分からないものは未確認");
  assertEqual(data.videos.every((video) => !("description" in video)), true, "正常：説明の全文は入れない（要約だけ）");
  assertEqual(data.expiresAt, new Date(Date.parse(data.fetchedAt) + 30 * DAY).toISOString(), "正常：期限は取得から30日");
  assertEqual(data.counts, { channelVideos: 4, checked: 4, included: 2, unconfirmed: 1, excluded: 1, ended: 0 }, "正常：数");
  assertEqual(report.excluded.map((item) => item.id), ["fixVideo002"], "正常：除外の一覧（理由つき）");
  assertEqual(checkYoutubePublication(data, { now: NOW }).ok, true, "正常：検査に通る");

  // 本人が確かめた判定（映像で登場）
  const verified = [{ videoId: "fixVideo003", decision: "include", memberIds: [], footageMemberIds: ["satake-nonno", "not-a-member"], verifiedBy: "owner", verifiedOn: "2026-11-03", note: "ライブ映像" }];
  const withVerified = buildYoutubePublishedData({ fetched: makeFetched({ videos: BASE_VIDEOS }), verifiedJudgments: verified, now: NOW }).data.videos.find((video) => video.id === "fixVideo003");
  assertEqual([withVerified.status, withVerified.memberIds, withVerified.footageMemberIds, withVerified.verified], [APPEARANCE_STATUS.MANUAL, [], ["satake-nonno"], { by: "owner", on: "2026-11-03" }], "本人の確認：映像で登場として収録（知らない ID は捨てる）");
  const excludedByOwner = buildYoutubePublishedData({ fetched: makeFetched({ videos: BASE_VIDEOS }), verifiedJudgments: [{ videoId: "fixVideo004", decision: "exclude", verifiedBy: "owner", verifiedOn: "2026-11-03", note: "" }], now: NOW }).data;
  assertEqual(excludedByOwner.videos.some((video) => video.id === "fixVideo004"), false, "本人の確認：除外");

  // タイトルが変わっても判定は消えない
  const renamed = BASE_VIDEOS.map((video) => (video.id === "fixVideo001" ? { ...video, title: "【新しいタイトル】料理対決" } : video));
  const renamedData = buildYoutubePublishedData({ fetched: makeFetched({ fetchedAt: "2026-11-09T00:00:00.000Z", videos: renamed }), previous: data, now: new Date("2026-11-09T01:00:00Z") }).data;
  const renamedVideo = renamedData.videos.find((video) => video.id === "fixVideo001");
  assertEqual([renamedVideo.title, renamedVideo.memberIds], ["【新しいタイトル】料理対決", ["noguchi-iori", "oba-hana"]], "更新：タイトルの変化を反映し、判定は残る");

  // 説明欄から名前が消えても、前の確定を自動で下げない（30日まで保留して要確認）
  const shrunk = BASE_VIDEOS.map((video) => (video.id === "fixVideo001" ? { ...video, description: castDescription("料理", ["野口 衣織 (Iori Noguchi)"]) } : video));
  const held = buildYoutubePublishedData({ fetched: makeFetched({ fetchedAt: "2026-11-09T00:00:00.000Z", videos: shrunk }), previous: data, now: new Date("2026-11-09T01:00:00Z") });
  const heldVideo = held.data.videos.find((video) => video.id === "fixVideo001");
  assertEqual([heldVideo.memberIds.sort(), heldVideo.hold?.since], [["noguchi-iori", "oba-hana"], "2026-11-09T00:00:00.000Z"], "更新：前の確定を下げずに保留");
  assertEqual(held.report.review.some((item) => item.kind === "downgrade" && item.id === "fixVideo001"), true, "更新：要確認に出す（Issue で知らせる）");
  const longHeldPrevious = { ...held.data, videos: held.data.videos.map((video) => (video.id === "fixVideo001" ? { ...video, hold: { since: "2026-10-01T00:00:00.000Z" } } : video)), fetchedAt: "2026-10-30T00:00:00.000Z", expiresAt: "2026-11-29T00:00:00.000Z" };
  const released = buildYoutubePublishedData({ fetched: makeFetched({ fetchedAt: "2026-11-09T00:00:00.000Z", videos: shrunk }), previous: longHeldPrevious, now: new Date("2026-11-09T01:00:00Z") }).data.videos.find((video) => video.id === "fixVideo001");
  assertEqual([released.memberIds, Boolean(released.hold)], [["noguchi-iori"], false], `更新：保留は${HOLD_MAX_DAYS}日まで（API のデータから作った判定を30日を超えて持ち越さない）`);

  // 削除・非公開（今回の取得に無い）
  const withoutFour = BASE_VIDEOS.filter((video) => video.id !== "fixVideo004");
  const ended = buildYoutubePublishedData({ fetched: makeFetched({ fetchedAt: "2026-11-09T00:00:00.000Z", videos: withoutFour }), previous: data, now: new Date("2026-11-09T01:00:00Z") });
  assertEqual([ended.data.videos.some((video) => video.id === "fixVideo004"), ended.data.counts.ended, ended.report.endedIds], [false, 1, ["fixVideo004"]], "削除・非公開：画面から外し、数だけ残す");
  const privateNow = BASE_VIDEOS.map((video) => (video.id === "fixVideo004" ? { ...video, privacyStatus: "private" } : video));
  assertEqual(buildYoutubePublishedData({ fetched: makeFetched({ videos: privateNow }), now: NOW }).data.videos.some((video) => video.id === "fixVideo004"), false, "削除・非公開：公開でない動画は載せない");

  // 新しい動画（強い根拠だけが確定。推定・未確認は印のまま）
  const added = [...BASE_VIDEOS, rawVideo("fixVideo005", "新しい企画", castDescription("新企画", ["佐々木 舞香 (Maika Sasaki)"]), "2026-11-05T09:00:00Z"), rawVideo("fixVideo006", "野口衣織の部屋", "本文だけ", "2026-11-06T09:00:00Z")];
  const addedResult = buildYoutubePublishedData({ fetched: makeFetched({ fetchedAt: "2026-11-09T00:00:00.000Z", videos: added }), previous: data, now: new Date("2026-11-09T01:00:00Z") });
  assertEqual(addedResult.data.videos.find((video) => video.id === "fixVideo005").status, APPEARANCE_STATUS.CAST_LIST, "新しい動画：公式の表記があれば自動で確定");
  assertEqual(addedResult.data.videos.find((video) => video.id === "fixVideo006").status, APPEARANCE_STATUS.TITLE_NAME, "新しい動画：タイトルだけなら推定の印のまま");
  assertEqual(addedResult.report.review.filter((item) => item.kind === "new").map((item) => item.id), ["fixVideo005", "fixVideo006"], "新しい動画：新しく増えた動画を記録する");

  // 期限切れの前のデータは使わない
  const expiredPrevious = { ...data, fetchedAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z" };
  const fromExpired = buildYoutubePublishedData({ fetched: makeFetched({ fetchedAt: "2026-11-09T00:00:00.000Z", videos: shrunk }), previous: expiredPrevious, now: new Date("2026-11-09T01:00:00Z") });
  assertEqual(fromExpired.data.videos.find((video) => video.id === "fixVideo001").memberIds, ["noguchi-iori"], "期限：30日を過ぎた前のデータからは何も持ち越さない");
  let threw = false;
  try {
    buildYoutubePublishedData({ fetched: { meta: {}, videos: [] }, now: NOW });
  } catch (error) {
    threw = true;
  }
  assertEqual(threw, true, "壊れた取得結果（取得の日時が無い）は失敗にする");
}

function runCheckAndDecideTests() {
  const { data } = buildYoutubePublishedData({ fetched: makeFetched({ videos: BASE_VIDEOS }), now: NOW });
  // 壊れたデータ
  assertEqual(validateYoutubePublishedData({ schema: 1, fetchedAt: data.fetchedAt, expiresAt: data.expiresAt, videos: "x" }).ok, false, "検査：videos が配列でない");
  assertEqual(validateYoutubePublishedData(null).ok, false, "検査：JSON でない");
  assertEqual(validateYoutubePublishedData({ ...data, videos: [{ ...data.videos[0], id: "bad" }] }).ok, false, "検査：動画 ID の形");
  assertEqual(validateYoutubePublishedData({ ...data, videos: [data.videos[0], data.videos[0]] }).ok, false, "検査：ID の重なり");
  assertEqual(validateYoutubePublishedData({ ...data, videos: [{ ...data.videos[0], description: "全文" }] }).ok, false, "検査：説明の全文を入れない");
  assertEqual(validateYoutubePublishedData({ ...data, videos: [{ ...data.videos[0], memberIds: ["someone"] }] }, { memberIds: memberIdSet }).ok, false, "検査：知らないメンバー");
  assertEqual(validateYoutubePublishedData({ ...data, fetchedAt: "2099-01-01T00:00:00Z" }, { now: NOW }).ok, false, "検査：未来の取得日");
  // 件数の急な減り
  const bigPrevious = { ...data, videos: Array.from({ length: 10 }, (_, index) => ({ ...data.videos[0], id: `prevVideo${String(index).padStart(2, "0")}` })) };
  const drop = checkYoutubePublication(data, { previous: bigPrevious, now: NOW });
  assertEqual([drop.ok, drop.errors.some((error) => error.includes("件数が急に減った"))], [false, true], `検査：件数が前の${SUDDEN_DROP_RATIO * 100}%未満に減ったら公開しない`);
  // 期限
  assertEqual(isYoutubeDataExpired(data, new Date(Date.parse(data.fetchedAt) + 29 * DAY)), false, "期限：29日目は期限内");
  assertEqual(isYoutubeDataExpired(data, new Date(Date.parse(data.fetchedAt) + 30 * DAY)), true, "期限：30日で期限切れ");
  assertEqual(youtubeDataExpiry({ ...data, expiresAt: "2099-01-01T00:00:00Z" }).toISOString(), data.expiresAt, "期限：expiresAt を書き換えても30日を超えない");
  // 公開の決め方
  const ok = { ok: true, data };
  const failed = { ok: false, error: "API が 403 quotaExceeded" };
  const recent = { ...data, fetchedAt: new Date(NOW.getTime() - 5 * DAY).toISOString(), expiresAt: new Date(NOW.getTime() + 25 * DAY).toISOString() };
  const old = { ...data, fetchedAt: new Date(NOW.getTime() - 31 * DAY).toISOString(), expiresAt: new Date(NOW.getTime() - DAY).toISOString() };
  assertEqual(decideYoutubePublication({ trigger: "dispatch", fresh: ok, previous: recent, now: NOW }).action, "publish-fresh", "公開：正常なら取り直したデータで公開");
  const keep = decideYoutubePublication({ trigger: "dispatch", fresh: failed, previous: recent, now: NOW });
  assertEqual([keep.action, keep.alert], ["keep-live", true], "公開：定期の更新で失敗 → 公開しない（前のまま）・知らせる");
  assertEqual(decideYoutubePublication({ trigger: "push", fresh: failed, previous: recent, now: NOW }).action, "publish-previous", "公開：アプリの更新（push）で失敗 → 前のデータ（30日以内）で公開");
  const stale = decideYoutubePublication({ trigger: "schedule", fresh: failed, previous: old, now: NOW });
  assertEqual([stale.action, stale.alert], ["publish-without-data", true], "公開：前のデータも30日を過ぎた → データを外して公開・知らせる");
  assertEqual(decideYoutubePublication({ trigger: "push", fresh: failed, previous: null, now: NOW }).action, "publish-without-data", "公開：前のデータが無い → データ無しで公開");
  assertEqual(decideYoutubePublication({ trigger: "dispatch", fresh: failed, previous: { ...recent, videos: "broken" }, now: NOW }).action, "publish-without-data", "公開：前のデータが壊れていたら使わない");
  const body = describeYoutubeRefreshForIssue({ decision: keep, check: drop, report: { review: [{ kind: "downgrade", id: "fixVideo001" }] }, trigger: "dispatch", runUrl: "https://example.invalid/run" });
  assertEqual(body.includes("公開しない") || body.includes("前のまま"), true, "知らせ：Issue の本文に結果");
  assertEqual(body.includes("fixVideo001") && !/AIza/.test(body), true, "知らせ：要確認の動画 ID は書き、キーは書かない");
  // 書き出してよい場所
  assertEqual(
    ["data/youtube-appearances.json", "./data/youtube-appearances.json", "data\\youtube-appearances.json", "js/data/youtubeVerifiedJudgments.js", "index.html", "data/other.json", "../data/youtube-appearances.json"].map(isAllowedRefreshOutput),
    [true, true, true, false, false, false, false],
    "自動更新：書き出してよいのは data/youtube-appearances.json だけ"
  );
  assertEqual(YOUTUBE_DATA_PATH, "data/youtube-appearances.json", "自動更新：アプリが読む場所と同じ");
}

async function runLoaderTests() {
  const { data } = buildYoutubePublishedData({ fetched: makeFetched({ videos: BASE_VIDEOS }), now: NOW });
  const respond = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === "string" ? JSON.parse(body) : body) });
  const cases = [
    ["正常", respond(200, data), NOW, YOUTUBE_DATA_STATE.READY, 3],
    ["期限切れ", respond(200, data), new Date(Date.parse(data.fetchedAt) + 31 * DAY), YOUTUBE_DATA_STATE.EXPIRED, 0],
    ["データが無い（404）", respond(404, {}), NOW, YOUTUBE_DATA_STATE.MISSING, 0],
    ["壊れた JSON", respond(200, "{broken"), NOW, YOUTUBE_DATA_STATE.INVALID, 0],
    ["形が壊れている", respond(200, { schema: 1 }), NOW, YOUTUBE_DATA_STATE.INVALID, 0],
    ["通信できない", async () => { throw new TypeError("Failed to fetch"); }, NOW, YOUTUBE_DATA_STATE.ERROR, 0],
  ];
  try {
    for (const [label, fetchImpl, now, state, count] of cases) {
      setYoutubeAppearanceSnapshotForTest(null);
      const snapshot = await loadYoutubeAppearanceData({ fetchImpl, now: () => now, force: true });
      assertEqual([snapshot.state, snapshot.videos.length], [state, count], `アプリの読み込み：${label}`);
    }
    const expired = interpretYoutubeData(data, { now: new Date(Date.parse(data.fetchedAt) + 31 * DAY) });
    assertEqual([expired.data.fetchedAt, "videos" in expired.data, expired.videos.length], [data.fetchedAt, false, 0], "アプリの読み込み：期限切れのときは動画の情報を持たない（最後の更新の日だけ）");
    let requested = null;
    setYoutubeAppearanceSnapshotForTest(null);
    await loadYoutubeAppearanceData({ fetchImpl: async (url, init) => ((requested = [url, init?.cache]), { ok: false, status: 404 }), force: true });
    assertEqual(requested, ["data/youtube-appearances.json", "no-cache"], "アプリの読み込み：同じサイトの data/youtube-appearances.json を、キャッシュを確かめながら読む");
  } finally {
    setYoutubeAppearanceSnapshotForTest(null);
  }
  assertEqual(getYoutubeAppearanceSnapshot().state, YOUTUBE_DATA_STATE.IDLE, "テストのあと、状態を初めに戻した");
}

async function runPipelineFilesTests() {
  const [workflow, refresh, fetchScript, appsScript, setup, sw, main, gitignore] = await Promise.all(
    [
      "./.github/workflows/deploy-pages.yml",
      "./scripts/youtube/refresh.mjs",
      "./scripts/youtube/fetch-youtube.mjs",
      "./scripts/youtube/apps-script/Code.gs",
      "./scripts/youtube/SETUP.md",
      "./sw.js",
      "./js/main.js",
      "./.gitignore",
    ].map(fetchText)
  );
  // 公開のワークフロー（2026-11-03：本人の許可のあとで .github/workflows に入れた）
  assertEqual(workflow.includes("scripts/youtube/refresh.mjs") && workflow.includes("rm -rf scripts"), true, "公開のワークフロー：YouTube のデータを作り、scripts/ は公開しない");
  assertEqual(/permissions:\s*\n\s*contents: read\n/.test(workflow) && !/contents:\s*write/.test(workflow), true, "公開のワークフロー：リポジトリは読むだけ（contents: read）");
  assertEqual(/git (push|commit|add)\b/.test(workflow), false, "公開のワークフロー：git にコミット・push しない");
  assertEqual(workflow.includes("pull_request_target"), false, "公開のワークフロー：フォークからの PR でキーを使わない");
  assertEqual(workflow.includes("YOUTUBE_API_KEY: ${{ secrets.YOUTUBE_API_KEY }}") && (workflow.match(/secrets\./g) ?? []).length === 1, true, "公開のワークフロー：キーは Secrets から環境変数で1か所だけ渡す");
  assertEqual(workflow.includes("git diff --exit-code") && workflow.includes("data/youtube-appearances.json$"), true, "公開のワークフロー：YouTube のデータ以外が変わっていたら止める");
  assertEqual(/workflow_dispatch:/.test(workflow) && /schedule:/.test(workflow) && /push:\s*\n\s*branches:\s*\n\s*- master/.test(workflow), true, "公開のワークフロー：push・外からの合図・予備の定期実行");
  assertEqual(workflow.includes("gh issue create") && workflow.includes("issues: write") && workflow.includes("failure()"), true, "公開のワークフロー：失敗・要確認は Issue で知らせる");
  assertEqual(workflow.includes("if: needs.build.outputs.deploy == 'true'"), true, "公開のワークフロー：公開しないと決めたら deploy しない（前のまま）");
  // スクリプト
  assertEqual((refresh.match(/writeFile\(/g) ?? []).length, 2, "スクリプト：書き出しは2か所だけ（データと、Issue の本文）");
  assertEqual(refresh.includes("isAllowedRefreshOutput(outRelative)") && refresh.includes("const outRelative = YOUTUBE_DATA_PATH;"), true, "スクリプト：書き出し先を決まりで確かめる");
  assertEqual(/console\.log\([^)]*key/i.test(refresh + fetchScript), false, "スクリプト：キーを表示しない");
  assertEqual(fetchScript.includes("process.env.YOUTUBE_API_KEY") && !/AIza[0-9A-Za-z_-]{20,}/.test(fetchScript + refresh + workflow + appsScript + setup), true, "スクリプト：キーは環境変数から。どのファイルにもキーの値が無い");
  // 外からの合図（Apps Script）
  assertEqual(appsScript.includes('getProperty("GITHUB_TOKEN")') && !/ghp_|github_pat_/.test(appsScript + setup), true, "外からの合図：トークンはスクリプト プロパティから（コードに書かない）");
  assertEqual(appsScript.includes("/actions/workflows/") && appsScript.includes("/dispatches") && appsScript.includes("throw new Error"), true, "外からの合図：workflow_dispatch を呼び、問題があれば失敗にしてメールで知らせる");
  assertEqual(setup.includes("No expiration") && setup.includes("Only select repositories") && setup.includes("Actions：Read and write"), true, "手順：トークンは期限なし・このリポジトリだけ・Actions だけ");
  assertEqual(setup.includes("チャット") && setup.includes("貼らないで"), true, "手順：キーをチャットに貼らせない");
  // Service Worker
  const shell = sw.slice(sw.indexOf("const APP_SHELL_FILES = ["), sw.indexOf("];", sw.indexOf("const APP_SHELL_FILES = [")));
  assertEqual(/"[^"]*youtube-appearances\.json"/.test(shell), false, "Service Worker：データは APP_SHELL に入れない（CACHE_VERSION なしで新しいデータが届く）");
  assertEqual(shell.includes('"./js/youtubeAppearanceData.js"'), true, "Service Worker：読み込みの部品は APP_SHELL に入れる");
  const fetchHandler = sw.slice(sw.indexOf('self.addEventListener("fetch"'));
  assertEqual(fetchHandler.indexOf("isYoutubeDataRequest") !== -1 && fetchHandler.indexOf("isYoutubeDataRequest") < fetchHandler.indexOf("caches.match(event.request)"), true, "Service Worker：データは network-first（キャッシュ優先より前に分ける）");
  assertEqual(sw.includes("response.status === 404) await cache.delete(request)") && sw.includes("key !== YOUTUBE_DATA_CACHE_NAME"), true, "Service Worker：データが外されたら箱からも消す／版の更新で消さない");
  assertEqual(Number(/const CACHE_VERSION = "v(\d+)";/.exec(sw)?.[1]) >= 412, true, "CACHE_VERSION は v412 以上（自動更新の仕組みを入れるとき1回だけ上げた）");
  assertEqual(main.includes("loadYoutubeAppearanceData("), true, "アプリ：起動のあとでデータを読む");
  assertEqual(gitignore.includes("data/youtube-appearances.json"), true, "git：データは入れない");
}

export async function runYoutubeAutomationTests() {
  console.log("--- YouTube 出演図鑑の自動更新（2026-11-03） ---");
  runBuildTests();
  runCheckAndDecideTests();
  await runLoaderTests();
  await runPipelineFilesTests();
}
