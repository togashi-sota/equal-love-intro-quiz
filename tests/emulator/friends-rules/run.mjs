// フレンド・ランキング・プロフィール・在席・管理者・以前のIDの引き継ぎが、Rules ごとにどう動くかを
// Firebase Local Emulator Suite で確かめる（2026-10-31・fb-friends 担当）。
// ・今の本番 Rules（firebase/database.rules.json）・v2.2（firebase/database.rules.proposed.json）・ロールバック用
//   （firebase/database.rules.rollback-safe.json）の3つ（＋ FRIENDS_EXTRA_RULES で渡した1つ）を、名前空間ごとに設定して比べる
// ・アプリのコード（js/uidSupersession.js・js/playerProfile.js・js/adminConfig.js・js/presenceSync.js・js/fanProfilesIdentity.js
//   ・js/publicProfilePayloads.js・js/timeAttackLeaderboard.js・js/dataStatusShare.js）をそのまま動かす
// ・匿名ログインは Auth エミュレータで本当に行う（UID は毎回ランダム）
// 接続先はローカルのエミュレータ（demo- のプロジェクトID）だけ。本番には繋がない（../presence-auth/lib.mjs で外部通信を遮断）。
import { readFileSync } from "node:fs";
import { ref, set, get, update, remove, serverTimestamp } from "firebase/database";
import { group, check, getResults, putRules, adminSet, adminGet, sleep, waitFor } from "../presence-auth/lib.mjs";
import { createDevice, readRepoText, REPO_JS } from "../presence-auth/env.mjs";

// 端末ごとの localStorage（env.mjs は1つを共有するので、端末を操作する直前に差し替える）
function makeStore() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
}
// プレイヤー情報の保存のたびに予約される「4秒後のバックアップ同期」は、この検証では動かさない
// （端末を次々に切り替えるため、別の端末の保存領域で動いてしまう。検証したいのは Rules と整理の流れ）
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms, ...args) => (ms === 4000 ? realSetTimeout(() => {}, 0) : realSetTimeout(fn, ms, ...args));

const PAY = await import(`${REPO_JS}publicProfilePayloads.js`);
const DS = await import(`${REPO_JS}dataStatusShare.js`);
const LB = await import(`${REPO_JS}timeAttackLeaderboard.js`);
const IDN = await import(`${REPO_JS}fanProfilesIdentity.js`);
const PRS = await import(`${REPO_JS}presencePayloads.js`);
const buildPresenceDisplayFor = (entry, nowMs) => PRS.buildPresenceDisplay(entry, nowMs).state;

const RULESETS = [
  ["prod", "firebase/database.rules.json"],
  ["v22", "firebase/database.rules.proposed.json"],
  ["rb", "firebase/database.rules.rollback-safe.json"],
];
if (process.env.FRIENDS_EXTRA_RULES) RULESETS.push(["extra", process.env.FRIENDS_EXTRA_RULES]);

async function attempt(promise) {
  try {
    await promise;
    return "allowed";
  } catch (error) {
    return /permission|PERMISSION_DENIED/i.test(String(error?.message ?? error)) ? "denied" : `error:${error?.message ?? error}`;
  }
}

function readRules(path) {
  return /^[A-Za-z]:|^\//.test(path) ? readFileSync(path, "utf8") : readRepoText(path);
}

const anon = async (auth, authSdk) => (await authSdk.signInAnonymously(auth)).user;
const SUMMARY = {
  audio: { have: 80, total: 84, missing: ["ダミー曲A"] },
  lyrics: { have: 83, total: 83, missing: [], old: [] },
  calls: { have: 46, usable: 46, notUsable: [], version: { exportedAt: "2026-10-29T03:00:00.000Z", editsRevision: 1, timingRevision: 1 } },
};
function profilePayload(name, identityKey, achievementIds = []) {
  return PAY.buildPublicProfilePayload({
    playerName: name,
    oshiMemberId: null,
    achievementsSnapshot: achievementIds.map((id) => ({ id, isUnlocked: true })),
    oshiBadgeState: { hasNoMissMaster: false, hasEqualLoveMaster: false, hasEqualLoveComplete: false },
    identityKey,
    dataStatus: DS.buildSharedDataStatus(SUMMARY),
  });
}
function lbEntry(name, ms, identityKey) {
  return LB.buildLeaderboardEntryPayload({ displayName: name, oshiMemberId: null, clearTimeMs: ms, missCount: 0, rule: LB.LEADERBOARD_RULE_VALUES[0], source: LB.LEADERBOARD_SOURCE_VALUES[0], achievedAt: 1, actualQuestionCount: 84, identityKey });
}

const summary = {};
for (const [label, file] of RULESETS) {
  const ns = `demo-equallove-presence-friends${label}`;
  await putRules(ns, readRules(file));
  const out = {};
  const ok = (key, actual, expected, description) => {
    const pass = check(actual, expected, `[${label}] ${description}`);
    out[key] = pass;
    return pass;
  };

  // ---- 端末を用意（全員が本物の匿名ログイン）----
  globalThis.localStorage = makeStore();
  const admin = await createDevice(`admin-${label}`, { ns, signIn: anon });
  const alice = await createDevice(`alice-${label}`, { ns, signIn: anon });
  const bob = await createDevice(`bob-${label}`, { ns, signIn: anon });
  await adminSet(ns, `admins/${admin.uid}`, true);

  group(`[${label}] プロフィール（自分のは書ける・他人のは変えられない・消せない）`);
  const KEY_A = await LB.computeLeaderboardIdentityKey("alice-backup-0001");
  const KEY_B = await LB.computeLeaderboardIdentityKey("bob-backup-0001");
  ok("P1", await attempt(set(ref(alice.client.database, `publicProfiles/${alice.uid}`), { ...profilePayload("ありす", KEY_A, ["a1"]), updatedAt: serverTimestamp() })), "allowed", "自分の公開プロフィール（データ数つき）を作れる");
  ok("P2", await attempt(set(ref(alice.client.database, `publicProfiles/${alice.uid}`), { ...profilePayload("ありす", KEY_A, ["a1", "a2"]), updatedAt: serverTimestamp() })), "allowed", "自分の公開プロフィールを更新できる（称号が増えた）");
  ok("P3", await attempt(set(ref(bob.client.database, `publicProfiles/${bob.uid}`), { ...profilePayload("ぼぶ", KEY_B), updatedAt: serverTimestamp() })), "allowed", "別の人も自分のプロフィールを作れる");
  ok("P4", await attempt(set(ref(bob.client.database, `publicProfiles/${alice.uid}`), { ...profilePayload("のっとり", KEY_B), updatedAt: serverTimestamp() })), "denied", "他人のプロフィールを上書きできない");
  ok("P5", await attempt(update(ref(bob.client.database, `publicProfiles/${alice.uid}`), { displayName: "のっとり" })), "denied", "他人のプロフィールの一部（名前）も変えられない");
  ok("P6", await attempt(remove(ref(bob.client.database, `publicProfiles/${alice.uid}`))), "denied", "他人のプロフィールを消せない");
  ok("P7", await attempt(set(ref(alice.client.database, `publicProfiles/${alice.uid}/identityKey`), KEY_B)), "allowed", "【既知・記録】自分のプロフィールの本人キーは書き換えられる（消すことだけ禁止）→ 表示では本人キーだけで同じ人とみなさない");
  ok("P8", (await adminGet(ns, `publicProfiles/${alice.uid}/displayName`)) === "ありす", true, "他人の操作の後も、本人のプロフィールはそのまま");

  group(`[${label}] フレンド一覧の読み取り（プロフィール・オンライン状態）`);
  let list = null;
  ok("L1", await attempt(get(ref(bob.client.database, "publicProfiles")).then((s) => (list = s.val()))), "allowed", "フレンド一覧（全員の公開プロフィール）を読める");
  const normalized = Object.entries(list ?? {}).map(([uid, entry]) => PAY.normalizePublicProfileEntry(uid, entry)).filter(Boolean);
  ok("L2", IDN.dedupeProfilesByUid(normalized).map((p) => p.uid).sort(), [alice.uid, bob.uid].sort(), "同じUIDは1行（読み取った一覧から2人）");
  const aliceShared = normalized.find((p) => p.uid === alice.uid);
  ok("L3", aliceShared?.dataStatus?.audio ?? null, 80, "データ数（音源の曲数）が友だちから見える");

  group(`[${label}] オンライン状態（アプリの presenceSync.js）`);
  globalThis.localStorage = makeStore();
  await alice.startPresence();
  const connected = await waitFor(async () => {
    const c = await adminGet(ns, `presence/${alice.uid}/connections`);
    return c && Object.keys(c).length > 0;
  }, { label: "接続ノード" });
  ok("O1", !!connected, true, "自分のオンライン状態を書ける（接続ノードができる）");
  let presenceAll = null;
  ok("O2", await attempt(get(ref(bob.client.database, "presence")).then((s) => (presenceAll = s.val()))), "allowed", "全員のオンライン状態を読める");
  ok("O3", Object.keys(presenceAll?.[alice.uid]?.connections ?? {}).length >= 1, true, "友だちから、オンラインが見える");
  ok("O4", await attempt(set(ref(bob.client.database, `presence/${alice.uid}/lastSeen`), serverTimestamp())), "denied", "他人のオンライン状態を書き換えられない");
  ok("O5", await attempt(remove(ref(bob.client.database, `presence/${alice.uid}`))), "denied", "他人のオンライン状態を消せない");
  ok("O6", await attempt(remove(ref(admin.client.database, `presence/${alice.uid}`))), "denied", "管理者でも他人のオンライン状態は消せない（後継者＝本人だけ）");

  group(`[${label}] 画面が隠れたらオフライン・戻ったらオンライン（2026-10-31・アプリの presenceSync.js）`);
  {
    const conns = async (uid) => Object.keys((await adminGet(ns, `presence/${uid}/connections`)) ?? {});
    const before = await conns(alice.uid);
    const lastSeenBefore = await adminGet(ns, `presence/${alice.uid}/lastSeen`);
    await sleep(50);
    alice.setVisibility("hidden");
    const gone = await waitFor(async () => (await conns(alice.uid)).length === 0, { label: "接続ノードが消える" });
    ok("H1", [before.length >= 1, !!gone], [true, true], "ホームへ戻す（画面が隠れる）と、この端末の接続ノードが消える");
    const hiddenEntry = await adminGet(ns, `presence/${alice.uid}`);
    ok("H2", (hiddenEntry?.lastSeen ?? 0) >= (lastSeenBefore ?? 0), true, "隠れたときに lastSeen を最後に1回書く");
    ok("H3", buildPresenceDisplayFor(hiddenEntry, Date.now() + 13000), "offline", "友だちからはオフラインに見える（猶予12秒の後）");
    alice.setVisibility("visible");
    const back = await waitFor(async () => (await conns(alice.uid)).length === 1, { label: "接続ノードが戻る" });
    ok("H4", !!back, true, "画面へ戻ると、接続ノードを1つだけ付け直す（オンラインに戻る）");
    // オンライン対戦の画面では60秒の猶予（ルームコードを LINE で送る間に外れない）
    alice.doc.body.dataset.screen = "onlineBattleLobby";
    alice.setVisibility("hidden");
    await sleep(1500);
    ok("H5", (await conns(alice.uid)).length, 1, "オンライン対戦の画面では、隠れてもすぐには外さない（60秒の猶予）");
    alice.setVisibility("visible");
    await sleep(800);
    ok("H6", (await conns(alice.uid)).length, 1, "猶予の間に戻れば何も変わらない（接続ノードは増えない）");
    alice.doc.body.dataset.screen = "home";
  }

  group(`[${label}] ランキング（自分の記録は書ける・他人のは変えられない・管理者は削除だけ）`);
  const lbPath = LB.buildLeaderboardPath("intro", "all", "all");
  ok("R1", await attempt(set(ref(alice.client.database, `${lbPath}/${alice.uid}`), lbEntry("ありす", 150000, KEY_A))), "allowed", "自分の記録を書ける");
  ok("R2", await attempt(get(ref(bob.client.database, lbPath))), "allowed", "ランキングを読める");
  ok("R3", await attempt(set(ref(bob.client.database, `${lbPath}/${alice.uid}`), lbEntry("のっとり", 1000, KEY_B))), "denied", "他人の記録を上書きできない");
  ok("R4", await attempt(remove(ref(bob.client.database, `${lbPath}/${alice.uid}`))), "denied", "他人の記録を消せない");
  ok("R5", await attempt(set(ref(admin.client.database, `${lbPath}/${alice.uid}`), lbEntry("管理者", 1000, KEY_B))), "denied", "管理者でも他人の記録は書き換えられない");

  group(`[${label}] 管理者（admins に載っている人だけ）`);
  globalThis.localStorage = makeStore();
  const adminCfgAdmin = await import(`${REPO_JS}adminConfig.js?device=${admin.name}`);
  ok("A1", await adminCfgAdmin.resolveIsAdminUser(), true, "admins に載っている人は、アプリの判定で管理者");
  globalThis.localStorage = makeStore();
  const adminCfgAlice = await import(`${REPO_JS}adminConfig.js?device=${alice.name}`);
  ok("A2", await adminCfgAlice.resolveIsAdminUser(), false, "一般の人は、アプリの判定で管理者ではない");
  ok("A3", await attempt(set(ref(alice.client.database, `admins/${alice.uid}`), true)), "denied", "一般の人は自分を管理者にできない");
  ok("A4", await attempt(set(ref(admin.client.database, `admins/${alice.uid}`), true)), "denied", "管理者でもアプリから admins は書けない（Console だけ）");
  ok("A5", await attempt(remove(ref(alice.client.database, `${lbPath}/${bob.uid}`))), "denied", "一般の人は他人の記録を消せない（管理者の操作）");
  await set(ref(bob.client.database, `${lbPath}/${bob.uid}`), lbEntry("ぼぶ", 160000, KEY_B)).catch(() => {});
  ok("A6", await attempt(remove(ref(admin.client.database, `${lbPath}/${bob.uid}`))), "allowed", "管理者は他人のランキングの記録を消せる（削除だけ）");
  ok("A7", await attempt(remove(ref(admin.client.database, `publicProfiles/${bob.uid}`))), "allowed", "管理者は他人の公開プロフィールを消せる（フレンドのごみ箱と同じ書き込み）");
  ok("A8", await attempt(set(ref(admin.client.database, `publicProfiles/${alice.uid}/displayName`), "かえた")), "denied", "管理者でも他人の公開プロフィールの書き換えはできない");

  group(`[${label}] 以前のIDの引き継ぎ（アプリの uidSupersession.js。本人の承認なしには公開データを消さない）`);
  // 「今の端末」：本物の匿名ログイン（今のID）。以前のID は実在しない UID（Auth から消えた想定）
  const nowStore = makeStore();
  globalThis.localStorage = nowStore;
  const me = await createDevice(`me-${label}`, { ns, signIn: anon });
  const OLD = `OLDuid${label}0000000000000PWW2`.slice(0, 28);
  const BID = `bid-friends-${label}`;
  const KEY_ME = await LB.computeLeaderboardIdentityKey(BID);
  await adminSet(ns, `backups/${BID}`, { schemaVersion: 1, currentUid: me.uid, updatedAt: 1, payload: { x: "{}" }, previousUids: { [OLD]: 1 } });
  await adminSet(ns, `publicProfiles/${OLD}`, { ...profilePayload("がしお", KEY_ME, ["t1", "t2", "t3"]), updatedAt: 1 });
  await adminSet(ns, `presence/${OLD}`, { lastSeen: 1 });
  await adminSet(ns, `${lbPath}/${OLD}`, lbEntry("がしお", 137030, KEY_ME));
  await set(ref(me.client.database, `publicProfiles/${me.uid}`), { ...profilePayload("がしお", KEY_ME, ["t1"]), updatedAt: serverTimestamp() });
  await set(ref(me.client.database, `${lbPath}/${me.uid}`), lbEntry("がしお", 140000, KEY_ME));
  const pp = await import(`${REPO_JS}playerProfile.js?device=${me.name}`);
  const us = await import(`${REPO_JS}uidSupersession.js?device=${me.name}`);
  const pid = pp.getActivePlayer().playerId;
  pp.applyRestoredPlayerInfo(pid, { backupId: BID, playerName: "がしお" });
  pp.setPendingUidMerge(pid, { oldUid: OLD, backupId: BID });

  // 起動時の自動処理（本人確認の関門から呼ばれるもの）
  const auto = await us.runPendingUidMigration({ identityKey: KEY_ME });
  ok("M1", auto.status, "awaiting-approval", "起動時の自動処理：ランキングの引き継ぎの後は「本人の確認待ち」で止まる");
  ok("M2", (await adminGet(ns, `${lbPath}/${me.uid}/clearTimeMs`)), 137030, "ランキング：以前のIDの速い方の記録が今のIDへ引き継がれる（記録は失わない）");
  ok("M3", (await adminGet(ns, `${lbPath}/${OLD}`)), null, "ランキング：複製を確かめてから以前のIDの記録を消す（同じ人が2行にならない）");
  ok("M4", (await adminGet(ns, `publicProfiles/${OLD}/displayName`)), "がしお", "起動時の自動処理では、以前のIDのフレンドのカードを消さない");
  ok("M5", (await adminGet(ns, `presence/${OLD}/lastSeen`)), 1, "起動時の自動処理では、以前のIDのオンライン記録を消さない");
  ok("M6", us.hasPendingUidMerge(), true, "本人の確認待ち（フレンド画面の案内）が残る");
  ok("M7", (await adminGet(ns, `uidSupersession/${OLD}/newUid`)), me.uid, "以前のID→今のIDの対応表ができる（所有権の確認つき）");

  // 本人の端末の画面：以前のIDは「確かめた自分の旧ID」として1行にまとまる
  const meView = IDN.collapseSamePlayerProfiles(
    IDN.dedupeProfilesByUid(Object.entries((await get(ref(me.client.database, "publicProfiles"))).val() ?? {}).map(([uid, e]) => PAY.normalizePublicProfileEntry(uid, e)).filter(Boolean)),
    { myUid: me.uid, myKnownOldUids: pp.getKnownOldUidsForPlayer(pid, me.uid) }
  );
  ok("V1", meView.hidden.map((h) => [h.uid, h.reason]), [[OLD, "my-old-uid"]], "本人の画面：以前のIDのカードは隠れて1行（データは消していない）");
  // 友だちの画面：対応表を読めるか（v2.2 で読める。今の本番では読めない）で変わる
  globalThis.localStorage = makeStore();
  const usFriend = await import(`${REPO_JS}uidSupersession.js?device=${bob.name}`);
  const links = await usFriend.fetchSupersessionLinks([OLD]);
  const friendView = IDN.annotateSameNameProfiles(
    IDN.collapseSamePlayerProfiles(
      Object.entries((await get(ref(bob.client.database, "publicProfiles"))).val() ?? {}).map(([uid, e]) => PAY.normalizePublicProfileEntry(uid, e)).filter(Boolean),
      { myUid: bob.uid, supersessionLinks: links }
    ).profiles
  );
  const friendOld = friendView.find((p) => p.uid === OLD);
  summary[`${label}:friendSeesOld`] = friendOld ? IDN.buildProfileIdentityNote(friendOld, { myUid: bob.uid }) : "（1行にまとまる）";
  check(typeof summary[`${label}:friendSeesOld`] === "string", true, `[${label}] 友だちの画面の以前のIDの扱い：${summary[`${label}:friendSeesOld`]}`);

  // 本人が「内容を確認する」→ 違いを見る → 「引き継いで整理する」
  globalThis.localStorage = nowStore;
  const plan = await us.planUidMerge();
  ok("M8", plan.ok, true, "内容を確認する（読み取りだけ）");
  const lines = us.describeUidMergePlan(plan);
  ok("M9", lines.some((l) => l.includes("称号の表示：以前のIDだけ 2個")), true, "違い（称号）が見える");
  ok("M10", lines.some((l) => l.startsWith("整理すると消えるもの：以前のID")), true, "消えるものが見える");
  const executed = await us.executeUidMerge(plan);
  ok("M11", executed.ok, true, "本人が承認すると整理できる");
  ok("M12", [await adminGet(ns, `publicProfiles/${OLD}`), await adminGet(ns, `presence/${OLD}`)], [null, null], "承認の後だけ、以前のIDのカードとオンライン記録が消える");
  const snapshot = JSON.parse(nowStore.getItem(`equalLoveIntroQuiz.uidMergeSnapshot.${OLD}`) ?? "null");
  ok("M13", snapshot?.oldPublicProfile?.displayName ?? null, "がしお", "消す前に、以前のIDのカードの中身を端末へ控えた");
  ok("M14", us.hasPendingUidMerge(), false, "整理が済むと案内が消える");
  ok("M15", (await adminGet(ns, `publicProfiles/${me.uid}/displayName`)), "がしお", "今のIDのカードはそのまま");

  group(`[${label}] 乗っ取りの防止（他人の以前のIDを自分のものにできない）`);
  const VICTIM_OLD = `VICTIMold${label}000000000000`.slice(0, 28);
  await adminSet(ns, `publicProfiles/${VICTIM_OLD}`, { ...profilePayload("ひがいしゃ", KEY_A), updatedAt: 1 });
  await adminSet(ns, `backups/victim-${label}`, { schemaVersion: 1, currentUid: alice.uid, updatedAt: 1, payload: { x: "{}" }, previousUids: { [VICTIM_OLD]: 1 } });
  ok("X1", await attempt(set(ref(bob.client.database, `uidSupersession/${VICTIM_OLD}`), { newUid: bob.uid, backupId: `victim-${label}`, recordedAt: serverTimestamp() })), "denied", "他人のバックアップの以前のIDの対応表を作れない");
  ok("X2", await attempt(remove(ref(bob.client.database, `publicProfiles/${VICTIM_OLD}`))), "denied", "他人の以前のIDのカードを消せない");
  ok("X3", await attempt(set(ref(bob.client.database, `uidSupersession/${me.uid}`), { newUid: bob.uid, backupId: BID, recordedAt: serverTimestamp() })), "denied", "他人の今のIDを「以前のID」として乗っ取れない");

  summary[label] = out;
}

const results = getResults();
const failed = results.filter((r) => !r.pass);
console.log(`\n=== フレンド・Rules 検証：${results.length} 件中 ${results.length - failed.length} 件成功 / ${failed.length} 件失敗 ===`);
for (const [label] of RULESETS) console.log(`  友だちの画面の以前のID（${label}）：${summary[`${label}:friendSeesOld`]}`);
if (failed.length) failed.forEach((r) => console.log(`  ❌ ${r.description}`));
await sleep(200);
process.exit(failed.length ? 1 : 0);
