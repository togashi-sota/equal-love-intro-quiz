// 【2026-10-29新設】公開プロフィールの「データの状態の曲数」（js/dataStatusShare.js）と、その周りのテスト。
//   ・数だけを抜き出す（曲名・本文は入れない）・壊れた値を表示しない・古い相手は「まだ記録がありません」
//   ・payload への載せ方（渡さなければ今までと同じ形）・Firebase から読んだ値の正規化
//   ・今の本番 Rules（firebase/database.rules.json）で publicProfiles/{uid} に dataStatus を足しても拒否されないこと
//     （Rules の中身を読んで確かめる。実際の書き込みは tests/emulator/public-profile-data-status/ のエミュレータの検証）
//   ・読み込みのあと・起動のときに次の同期へ乗る配線、「最新版データを読み込む」のボタンが選ぶ前に見えない直し
// ダミーの数・ダミーの曲名だけを使う（本物の曲名・歌詞・コールは使わない）。
import {
  buildSharedDataStatus,
  normalizeSharedDataStatus,
  describeSharedDataStatus,
  toJapanDateString,
  refreshSharedDataStatus,
  getSharedDataStatusForProfile,
  setSharedDataStatusFromSummary,
  resetSharedDataStatusForTest,
  SHARED_DATA_STATUS_VERSION,
} from "../js/dataStatusShare.js";
import { buildPublicProfilePayload, normalizePublicProfileEntry } from "../js/publicProfilePayloads.js";
import { evaluatePublicProfileWrite } from "../js/identityRules.js";
import { assertEqual } from "./test-utils.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchText = async (file) => (await fetch(file, { cache: "no-store" })).text();

const SUMMARY = {
  audio: { have: 80, total: 84, missing: ["ダミー曲A", "ダミー曲B", "ダミー曲C", "ダミー曲D"] },
  lyrics: { have: 82, total: 83, missing: ["ダミー曲E"], old: ["ダミー曲F"] },
  calls: { have: 46, usable: 45, notUsable: ["ダミー曲G"], version: { exportedAt: "2026-10-29T03:00:00.000Z", editsRevision: 7, timingRevision: 3 } },
};
const BASE_PROFILE = {
  playerName: "ダミーさん",
  oshiMemberId: null,
  achievementsSnapshot: [],
  oshiBadgeState: { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false },
};

function checkHidden(className) {
  const wrapper = document.createElement("div");
  wrapper.style.display = "block";
  document.body.appendChild(wrapper);
  const el = document.createElement("div");
  el.className = className;
  wrapper.appendChild(el);
  el.hidden = true;
  const hidden = getComputedStyle(el).display;
  wrapper.remove();
  return hidden;
}

export async function runDataStatusShareTests() {
  // ---- 数だけを抜き出す ----
  const shared = buildSharedDataStatus(SUMMARY);
  assertEqual(
    shared,
    { v: SHARED_DATA_STATUS_VERSION, audio: 80, audioTotal: 84, lyrics: 82, lyricsTotal: 83, calls: 46, callsUsable: 45, dataDate: "2026-10-29" },
    "データの曲数：音源・歌詞・コール・使える曲・版の日付だけを抜き出す"
  );
  assertEqual(JSON.stringify(shared).includes("ダミー曲"), false, "データの曲数：曲名（足りない曲・古い版・使えない曲）は入らない");
  assertEqual(JSON.stringify(shared).includes("Revision"), false, "データの曲数：版の番号の細部は入らない");
  assertEqual(buildSharedDataStatus({ audio: null, lyrics: null, calls: null }), null, "何も数えられなかったら null（載せない）");
  assertEqual(buildSharedDataStatus(null), null, "summary が無ければ null");
  assertEqual(
    buildSharedDataStatus({ audio: SUMMARY.audio, lyrics: null, calls: null }),
    { v: SHARED_DATA_STATUS_VERSION, audio: 80, audioTotal: 84 },
    "数えられなかった項目は入れない（0 と書かない）"
  );
  assertEqual(
    buildSharedDataStatus({ ...SUMMARY, calls: { have: 0, usable: 0, notUsable: [], version: null } }).dataDate,
    undefined,
    "コール表が入っていなければ版の日付は無い"
  );
  assertEqual(toJapanDateString("2026-10-29T16:00:00.000Z"), "2026-10-30", "版の日付は日本の日付（UTC 16時＝日本の翌日1時）");
  assertEqual(toJapanDateString("not-a-date"), null, "読めない日時は null");

  // ---- Firebase から読んだ値の正規化（壊れた値・ありえない値を表示しない） ----
  assertEqual(normalizeSharedDataStatus(shared), { audio: 80, audioTotal: 84, lyrics: 82, lyricsTotal: 83, calls: 46, callsUsable: 45, dataDate: "2026-10-29" }, "正規化：正しい値はそのまま（v は捨てる）");
  assertEqual(normalizeSharedDataStatus(null), null, "正規化：無ければ null");
  assertEqual(normalizeSharedDataStatus([1, 2]), null, "正規化：配列は null");
  assertEqual(normalizeSharedDataStatus({ audio: "80", audioTotal: 84 }), null, "正規化：文字列の数は使わない");
  assertEqual(normalizeSharedDataStatus({ audio: 90, audioTotal: 84 }), null, "正規化：入っている数が全体より多いのはおかしいので使わない");
  assertEqual(normalizeSharedDataStatus({ calls: 10, callsUsable: 11 }), null, "正規化：使える数が入っている数より多いのは使わない");
  assertEqual(normalizeSharedDataStatus({ audio: -1, audioTotal: 84 }), null, "正規化：負の数は使わない");
  assertEqual(normalizeSharedDataStatus({ audio: 1.5, audioTotal: 84 }), null, "正規化：小数は使わない");
  assertEqual(normalizeSharedDataStatus({ audio: 5000, audioTotal: 9000 }), null, "正規化：大きすぎる数は使わない");
  assertEqual(normalizeSharedDataStatus({ audio: 3, audioTotal: 84, songTitles: ["x"], dataDate: "2026-10-29" }), { audio: 3, audioTotal: 84 }, "正規化：知らない項目・コール無しの日付は捨てる");
  assertEqual(normalizeSharedDataStatus({ calls: 3, callsUsable: 3, dataDate: "<b>2026</b>" }), { calls: 3, callsUsable: 3 }, "正規化：形の違う日付は捨てる");

  // ---- フレンドの詳しい画面の1行 ----
  assertEqual(describeSharedDataStatus(shared).text, "データ：音源 80／84・歌詞 82／83・コール 46曲", "表示：「データ：音源 ○／84・歌詞 ○／83・コール ○曲」");
  assertEqual(describeSharedDataStatus(shared).detail, "コールのうち今使える曲 45曲・コール表の版 2026/10/29", "表示：使える曲が違うときと版の日付は、小さい2行目に");
  assertEqual(describeSharedDataStatus(null), { text: "データ：まだ記録がありません", detail: "", hasRecord: false }, "表示：古い相手で値が無いときは「まだ記録がありません」");
  assertEqual(describeSharedDataStatus({ audio: 99, audioTotal: 84 }).text, "データ：まだ記録がありません", "表示：壊れた値しか無いときも「まだ記録がありません」");
  assertEqual(describeSharedDataStatus({ audio: 0, audioTotal: 84 }).text, "データ：音源 0／84", "表示：0曲は 0 と出す（記録はある）");

  // ---- payload ----
  const withStatus = buildPublicProfilePayload({ ...BASE_PROFILE, identityKey: "k".repeat(32), dataStatus: shared });
  assertEqual(withStatus.dataStatus, shared, "payload：dataStatus を渡すと載る");
  const without = buildPublicProfilePayload({ ...BASE_PROFILE });
  assertEqual("dataStatus" in without, false, "payload：渡さなければ今までと同じ形（dataStatus のキーも無い）");
  assertEqual("dataStatus" in buildPublicProfilePayload({ ...BASE_PROFILE, dataStatus: { audio: "x" } }), false, "payload：壊れた dataStatus は載せない");
  assertEqual(
    "dataStatus" in buildPublicProfilePayload({ ...BASE_PROFILE, dataStatus: { ...shared, missing: ["ダミー曲A"] } }) &&
      JSON.stringify(buildPublicProfilePayload({ ...BASE_PROFILE, dataStatus: { ...shared, missing: ["ダミー曲A"] } })).includes("ダミー曲"),
    false,
    "payload：曲名を混ぜて渡しても、曲名は載らない"
  );
  assertEqual(normalizePublicProfileEntry("u1", { displayName: "a", dataStatus: shared }).dataStatus, normalizeSharedDataStatus(shared), "読んだプロフィール：dataStatus を正規化して持つ");
  assertEqual("dataStatus" in normalizePublicProfileEntry("u2", { displayName: "古い相手" }), false, "読んだプロフィール：古い相手には dataStatus のキー自体が無い（今までの形のまま）");

  // ---- Rules（今の本番）で通るか ----
  const rulesText = await fetchText("firebase/database.rules.json");
  const prodRules = JSON.parse(rulesText).rules;
  const profileRule = prodRules.publicProfiles?.$uid ?? null;
  assertEqual(Boolean(profileRule), true, "Rules：本番の publicProfiles/$uid の決まりを読めた");
  const childKeys = Object.keys(profileRule ?? {}).filter((key) => !key.startsWith("."));
  assertEqual(childKeys, ["identityKey"], "Rules：本番の publicProfiles/$uid の子の決まりは identityKey だけ（$other で他の子を拒む決まりが無い）");
  assertEqual(/hasChildren|\$other|dataStatus/.test(JSON.stringify(profileRule)), false, "Rules：子の一覧を限る書き方（hasChildren・$other）も dataStatus への決まりも無い＝dataStatus を足しても .validate で拒否されない");
  assertEqual(profileRule[".validate"].includes("identityKey"), true, "Rules：$uid の .validate は identityKey の有無だけを見る（dataStatus は無関係）");
  for (const file of ["firebase/database.rules.proposed.json", "firebase/database.rules.rollback-safe.json"]) {
    const rule = JSON.parse(await fetchText(file)).rules.publicProfiles.$uid;
    assertEqual(Object.keys(rule).filter((key) => !key.startsWith(".")), ["identityKey"], `Rules：${file} でも子の決まりは identityKey だけ（v2.2 を当てたあとも通る）`);
  }
  // 書き込みのシミュレーター（js/identityRules.js：本番 Rules と1対1）
  const created = evaluatePublicProfileWrite({ authUid: "uA", targetUid: "uA", existing: null, incoming: withStatus });
  assertEqual(created.allowed, true, "Rules のシミュレーター：dataStatus つきの新規作成は通る");
  const fromLegacy = evaluatePublicProfileWrite({ authUid: "uA", targetUid: "uA", existing: { ...without, identityKey: "k".repeat(32) }, incoming: withStatus });
  assertEqual(fromLegacy.allowed, true, "Rules のシミュレーター：古い形の上から dataStatus つきへの更新は通る");
  assertEqual(evaluatePublicProfileWrite({ authUid: "uB", targetUid: "uA", existing: null, incoming: withStatus }).allowed, false, "Rules のシミュレーター：他人の uid には今までどおり書けない");

  // ---- 「今の数」を覚えておく仕組み ----
  resetSharedDataStatusForTest();
  let collectCount = 0;
  const fakeCollect = async () => {
    collectCount += 1;
    return SUMMARY;
  };
  assertEqual(await getSharedDataStatusForProfile({ collectSummary: fakeCollect }), shared, "同期：まだ数えていなければ、その場で数えて返す（起動のときの最初の同期に乗る）");
  assertEqual(await getSharedDataStatusForProfile({ collectSummary: fakeCollect }), shared, "同期：2回目は覚えている数を返す");
  assertEqual(collectCount, 1, "同期：同期のたびに端末を数え直さない");
  await refreshSharedDataStatus({ collectSummary: async () => ({ ...SUMMARY, audio: { have: 84, total: 84, missing: [] } }) });
  assertEqual((await getSharedDataStatusForProfile()).audio, 84, "読み込みのあと：数え直した数が次の同期に乗る");
  setSharedDataStatusFromSummary({ ...SUMMARY, lyrics: { have: 83, total: 83, missing: [], old: [] } });
  assertEqual((await getSharedDataStatusForProfile()).lyrics, 83, "「データの状態を確かめる」で数えた結果をそのまま使う");
  resetSharedDataStatusForTest();
  const slow = () => wait(300).then(() => SUMMARY);
  assertEqual(await getSharedDataStatusForProfile({ collectSummary: slow, timeoutMs: 20 }), null, "同期：数えるのが遅いときは長く待たない（今回は載せない）");
  await wait(350);
  assertEqual(await getSharedDataStatusForProfile(), shared, "同期：数え終わったあとの同期では載る");
  resetSharedDataStatusForTest();
  await refreshSharedDataStatus({
    collectSummary: async () => {
      throw new Error("テスト：読めない");
    },
  });
  assertEqual(await getSharedDataStatusForProfile({ collectSummary: async () => null, timeoutMs: 50 }), null, "数えられなかったときは null（例外で同期を止めない）");
  resetSharedDataStatusForTest();

  // ---- 配線（読み込みのあと・起動のとき・フレンドの画面） ----
  const [mainJs, syncJs, fanJs, indexHtml, swJs] = await Promise.all(["js/main.js", "js/publicProfileSync.js", "js/fanProfilesScreen.js", "index.html", "sw.js"].map(fetchText));
  assertEqual(/const dataStatus = await getSharedDataStatusForProfile\(\);\s*\n\s*if \(!isStillSameTarget\(\)\) return false;\s*\n\s*const payload = buildPublicProfilePayload\(\{ \.\.\.materials, identityKey, dataStatus \}\);/.test(syncJs), true, "配線：公開プロフィールの同期が dataStatus を載せる（待ったあとに、同じ人・公開ONのままかを確かめる）");
  const materialsAt = syncJs.indexOf("const materials = collectCurrentProfileMaterials();");
  assertEqual(materialsAt > 0 && materialsAt < syncJs.indexOf("const dataStatus = await getSharedDataStatusForProfile();"), true, "配線：表示名・推し・称号は、曲数を数えて待つ前に集める（待つ間に別の人へ切り替わっても混ざらない）");
  assertEqual((syncJs.match(/if \(!isStillSameTarget\(\)\) return false;/g) ?? []).length, 2, "配線：書き込みの直前にも、同じ人・公開ONのままかを確かめる");
  assertEqual((mainJs.match(/await recheckLyricsCoverageAfterImport\(\);\n\s*refreshSharedDataStatusAndSync\(\);/g) ?? []).length, 4, "配線：歌詞・データパック・最新版データの読み込み（と元に戻す）のあと、数え直して同期する（4か所）");
  assertEqual(/await updateQuestionCountNotice\(\);\n\s*refreshSharedDataStatusAndSync\(\);/.test(mainJs), true, "配線：音源の読み込みのあとも数え直す");
  assertEqual(/setSharedDataStatusFromSummary\(summary\);/.test(mainJs), true, "配線：「データの状態を確かめる」の結果も使う");
  assertEqual(/describeSharedDataStatus\(profile\.dataStatus \?\? null\)/.test(fanJs), true, "配線：フレンドの詳しい画面が1行の文を出す");
  assertEqual(indexHtml.includes('id="fan-profile-detail-data-status-text"'), true, "配線：フレンドの詳しい画面に表示の場所がある");
  assertEqual(swJs.includes('"./js/dataStatusShare.js"'), true, "配線：APP_SHELL に js/dataStatusShare.js（オフラインでも動く）");

  // ---- 「最新版データを読み込む」のボタン・新しい表示の [hidden] が本当に消える ----
  assertEqual(checkHidden("lyrics-warning-actions"), "none", "最新版データ：「やめる／この内容で読み込む」の行は hidden のとき本当に消える（選ぶ前・読み込みのあと）");
  assertEqual(checkHidden("player-add-message"), "none", "プレイヤー：理由の行は hidden のとき消える");
  assertEqual(checkHidden("player-toast"), "none", "プレイヤー：知らせは hidden のとき消える");
  assertEqual(checkHidden("fan-profile-detail-data-status-detail"), "none", "フレンド：2行目は hidden のとき消える");
  const actionsMarkup = indexHtml.match(/<div id="unified-pack-import-actions"[^>]*>/)?.[0] ?? "";
  assertEqual(/\shidden(\s|>)/.test(actionsMarkup), true, "最新版データ：ボタンの行は最初から hidden（ファイルを選ぶ前は出さない）");
}
