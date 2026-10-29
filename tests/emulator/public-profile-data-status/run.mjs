// 公開プロフィール（publicProfiles/{uid}）に「データの状態の曲数」（dataStatus）を足しても、
// 今の本番 Rules（firebase/database.rules.json）で書き込みが通るかを、Firebase Local Emulator Suite で確かめる（2026-10-29）。
// 本物の Firebase JS SDK（firebase@10.7.1＝アプリと同じ版）と、アプリの js/publicProfilePayloads.js・js/dataStatusShare.js を
// そのまま使い、アプリと同じ set(ref(db, `publicProfiles/${uid}`), { ...payload, updatedAt: serverTimestamp() }) を行う。
// 接続先はローカルのエミュレータ（demo- のプロジェクトID）だけ。本番には繋がない（../presence-auth/lib.mjs で外部通信を遮断）。
//
// 実行：run-emulator-tests.sh（起動→この検証→停止）。ポートは在席の検証（9200 等）とぶつからない 9330 / 9339。
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, connectAuthEmulator, signInAnonymously } from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, set, update, serverTimestamp } from "firebase/database";
import { PROJECT_ID, DB_PORT, AUTH_PORT, group, check, getResults, putRules, adminGet, adminSet } from "../presence-auth/lib.mjs";
import { readRepoText, REPO_JS } from "../presence-auth/env.mjs";

const { buildPublicProfilePayload } = await import(`${REPO_JS}publicProfilePayloads.js`);
const { buildSharedDataStatus } = await import(`${REPO_JS}dataStatusShare.js`);

const NS = {
  prod: `${PROJECT_ID}-dsprod`,
  proposed: `${PROJECT_ID}-dsproposed`,
  rollback: `${PROJECT_ID}-dsrollback`,
};
await putRules(NS.prod, readRepoText("firebase/database.rules.json"));
await putRules(NS.proposed, readRepoText("firebase/database.rules.proposed.json"));
await putRules(NS.rollback, readRepoText("firebase/database.rules.rollback-safe.json"));

const IDENTITY_KEY = "a".repeat(64); // identityKey は 16〜64 文字の文字列（Rules の決まり）
// dataStatusCheck.js の summarize の結果の形（曲名の一覧つき）。buildSharedDataStatus が数だけを抜き出す
const SUMMARY = {
  audio: { have: 80, total: 84, missing: ["ダミー曲A", "ダミー曲B", "ダミー曲C", "ダミー曲D"] },
  lyrics: { have: 83, total: 83, missing: [], old: [] },
  calls: { have: 46, usable: 45, notUsable: ["ダミー曲E"], version: { exportedAt: "2026-10-29T03:00:00.000Z", editsRevision: 1, timingRevision: 1 } },
};

let appIndex = 0;
async function device(ns) {
  appIndex += 1;
  const app = initializeApp(
    { apiKey: "demo-key", projectId: PROJECT_ID, databaseURL: `http://127.0.0.1:${DB_PORT}?ns=${ns}` },
    `ds-${appIndex}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, "127.0.0.1", DB_PORT);
  const { user } = await signInAnonymously(auth);
  return { app, db, uid: user.uid };
}

async function attempt(promise) {
  try {
    await promise;
    return "allowed";
  } catch (error) {
    return /permission|PERMISSION_DENIED/i.test(String(error?.message ?? error)) ? "denied" : `error:${error?.message ?? error}`;
  }
}

const dataStatus = buildSharedDataStatus(SUMMARY);
const payload = buildPublicProfilePayload({
  playerName: "ダミーさん",
  oshiMemberId: null,
  achievementsSnapshot: [],
  oshiBadgeState: { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false },
  identityKey: IDENTITY_KEY,
  dataStatus,
});

group("payload の中身（曲名・本文が入らない）");
check(Object.keys(payload.dataStatus).sort(), ["audio", "audioTotal", "calls", "callsUsable", "dataDate", "lyrics", "lyricsTotal", "v"], "dataStatus は数と日付だけ");
check(JSON.stringify(payload).includes("ダミー曲"), false, "曲名（summarize の missing・notUsable）は payload に入らない");

for (const [label, ns] of Object.entries(NS)) {
  group(`Rules：${label}`);
  const me = await device(ns);
  // ① 新しく作る（アプリと同じ set）
  check(await attempt(set(ref(me.db, `publicProfiles/${me.uid}`), { ...payload, updatedAt: serverTimestamp() })), "allowed", "dataStatus つきの公開プロフィールを新しく作れる");
  const stored = await adminGet(ns, `publicProfiles/${me.uid}`);
  const sortKeys = (obj) => Object.fromEntries(Object.entries(obj ?? {}).sort(([a], [b]) => a.localeCompare(b)));
  check(sortKeys(stored?.dataStatus), sortKeys(payload.dataStatus), "保存された dataStatus は送ったとおり（RTDB はキーを並べ替えて返す）");
  // ② dataStatus の無い古い形の上書き → dataStatus つきへ更新（古い版のアプリの人が新しい版にしたとき）
  const legacy = { ...payload };
  delete legacy.dataStatus;
  check(await attempt(set(ref(me.db, `publicProfiles/${me.uid}`), { ...legacy, updatedAt: serverTimestamp() })), "allowed", "dataStatus の無い形（古い版のアプリ）でも上書きできる");
  check(await attempt(set(ref(me.db, `publicProfiles/${me.uid}`), { ...payload, updatedAt: serverTimestamp() })), "allowed", "古い形の上から dataStatus つきに更新できる");
  // ③ 他人の公開プロフィールには書けない（今までどおり）
  const other = await device(ns);
  check(await attempt(set(ref(other.db, `publicProfiles/${me.uid}`), { ...payload, updatedAt: serverTimestamp() })), "denied", "他人の uid には書けない（権限は今までどおり）");
  check(await attempt(update(ref(other.db, `publicProfiles/${me.uid}/dataStatus`), { audio: 0 })), "denied", "他人の dataStatus だけを書き換えることもできない");
  // ④ identityKey の決まりも今までどおり（dataStatus があっても identityKey 無しでは作れない）
  const noKey = { ...payload };
  delete noKey.identityKey;
  check(await attempt(set(ref(other.db, `publicProfiles/${other.uid}`), { ...noKey, updatedAt: serverTimestamp() })), "denied", "identityKey の無い新規作成は今までどおり拒否される");
  await adminSet(ns, `publicProfiles/${me.uid}`, null);
  await deleteApp(me.app);
  await deleteApp(other.app);
}

const results = getResults();
const failed = results.filter((r) => !r.pass);
console.log(`\n合計: ${results.length}件中 ${results.length - failed.length}件成功 / ${failed.length}件失敗`);
process.exit(failed.length ? 1 : 0);
