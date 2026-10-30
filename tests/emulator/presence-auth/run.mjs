// 在席（presence）とアカウント保護（メール＋パスワードの結び付け）の、Firebase Local Emulator Suite での検証（2026-10-28）。
// 本物の Firebase JS SDK（firebase@10.7.1＝アプリと同じ版）と、アプリの js/presenceSync.js・js/accountRecovery.js をそのまま動かす。
// 接続先はローカルのエミュレータ（demo- のプロジェクトID）だけ。本番の Firebase には一切繋がない（lib.mjs で外部通信を遮断）。
//
// 実行方法：run-emulator-tests.sh（エミュレータの起動→この検証→エミュレータの停止までを1回で行う）
//
// ルールは3種類を名前空間（ns）ごとに設定して比べる：
//   prod      … firebase/database.rules.json（今の本番と同じ）
//   propAsIs  … firebase/database.rules.proposed.json（別担当が改訂中の提案、そのまま）
//   propFixed … 上の提案のうち presence の接続ノードの1行だけを、この検証で必要と分かった行（REQUIRED_CONNECTION_RULE）に置き換えたもの
import { initializeApp, deleteApp } from "firebase/app";
import * as authSdk from "firebase/auth";
import { getDatabase, connectDatabaseEmulator, ref, set, get, update, remove, serverTimestamp, goOffline, goOnline, onValue } from "firebase/database";
import {
  PROJECT_ID,
  DB_PORT,
  AUTH_PORT,
  group,
  check,
  getResults,
  putRules,
  adminSet,
  adminGet,
  adminDelete,
  clearAuthUsers,
  setEmailProviderEnabled,
  listOobCodes,
  sleep,
  waitFor,
  createFreezableProxy,
} from "./lib.mjs";
import { createDevice, readRepoText, REPO_JS } from "./env.mjs";

const presencePayloads = await import(`${REPO_JS}presencePayloads.js`);
const accountRecovery = await import(`${REPO_JS}accountRecovery.js`);
const uidMergeQueue = await import(`${REPO_JS}uidMergeQueue.js`);
const { classifyPresenceEntry, buildPresenceDisplay, PRESENCE_OFFLINE_GRACE_MS, PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY } = presencePayloads;

// この検証で必要と分かった、presence の接続ノードの Rules（報告書に記載。提案ファイルは別担当が編集するのでここでは書き換えない）
export const REQUIRED_CONNECTION_RULE = "newData.val() === true || (newData.isNumber() && newData.val() === now && data.exists())";

const MIN = 60 * 1000;
const NS = {
  prod: `${PROJECT_ID}-prod`,
  propAsIs: `${PROJECT_ID}-propasis`,
  propFixed: `${PROJECT_ID}-propfixed`,
};

// 【2026-10-31追加】提案（v2.2）は、この検証で分かった接続ノードの行（REQUIRED_CONNECTION_RULE）を既に取り込んでいる。
// その場合「提案のまま」は「直した提案」と同じ動きになるので、提案のままの不具合を再現する期待は使わない。
const PROPOSED_ALREADY_FIXED =
  JSON.parse(readRepoText("firebase/database.rules.proposed.json")).rules.presence.$uid.connections.$connectionId[".validate"] === REQUIRED_CONNECTION_RULE;
const isUnfixedProposal = (kind) => kind === "propAsIs" && !PROPOSED_ALREADY_FIXED;

function rulesFor(kind) {
  if (kind === "prod") return readRepoText("firebase/database.rules.json");
  const proposed = JSON.parse(readRepoText("firebase/database.rules.proposed.json"));
  if (kind === "propFixed") proposed.rules.presence.$uid.connections.$connectionId[".validate"] = REQUIRED_CONNECTION_RULE;
  return JSON.stringify(proposed);
}

const anon = (auth, sdk) => sdk.signInAnonymously(auth).then((c) => c.user);
const withEmail = (email, password) => (auth, sdk) => sdk.signInWithEmailAndPassword(auth, email, password).then((c) => c.user);
const noSignIn = () => null;

async function seedProfile(ns, uid) {
  await adminSet(ns, `publicProfiles/${uid}`, { identityKey: `ik-${uid}`.padEnd(16, "x").slice(0, 40), displayName: "テスト" });
}
async function presenceOf(ns, uid) {
  return adminGet(ns, `presence/${uid}`);
}
function connectionKeys(entry) {
  return Object.keys(entry?.connections ?? {});
}
async function allowed(promise) {
  try {
    await promise;
    return "許可";
  } catch (error) {
    return /permission/i.test(`${error?.code} ${error?.message}`) ? "拒否" : `エラー:${error?.code ?? error?.message}`;
  }
}
async function closeDevice(device) {
  try {
    await deleteApp(device.client.app);
  } catch {
    // 既に閉じている
  }
}
async function createEmailUser(email, password) {
  const app = initializeApp({ apiKey: "demo-api-key", projectId: PROJECT_ID }, `setup-${Math.random()}`);
  const auth = authSdk.initializeAuth(app, { persistence: authSdk.inMemoryPersistence });
  authSdk.connectAuthEmulator(auth, `http://127.0.0.1:${AUTH_PORT}`, { disableWarnings: true });
  const cred = await authSdk.createUserWithEmailAndPassword(auth, email, password);
  await deleteApp(app);
  return cred.user.uid;
}

// ===========================================================================
// R. Rules の攻撃テスト（本物の SDK で、他人・未来の時刻・偽の値を書いてみる）
// ===========================================================================
async function runRulesAdversarial(kind) {
  const ns = NS[kind];
  group(`R(${kind}) Rules の攻撃テスト`);
  const a = await createDevice(`R-${kind}-A`, { ns, signIn: anon });
  const b = await createDevice(`R-${kind}-B`, { ns, signIn: anon });
  const c = await createDevice(`R-${kind}-C`, { ns, signIn: anon });
  const nobody = await createDevice(`R-${kind}-none`, { ns, signIn: noSignIn });
  await seedProfile(ns, a.uid);
  await seedProfile(ns, b.uid);
  const dbA = a.client.database;
  const dbB = b.client.database;
  const P = (uid, sub = "") => `presence/${uid}${sub}`;

  check(await allowed(set(ref(dbB, P(a.uid, "/connections/x")), true)), "拒否", `R1(${kind}): 他人（B）は A の接続ノードを作れない`);
  check(await allowed(set(ref(dbB, P(a.uid, "/lastSeen")), serverTimestamp())), "拒否", `R2(${kind}): 他人は A の lastSeen を書けない`);
  await set(ref(dbA, P(a.uid, "/connections/live")), true);
  check(await allowed(remove(ref(dbB, P(a.uid)))), "拒否", `R3(${kind}): 他人は A の在席を消せない`);
  check(await allowed(set(ref(dbB, P(a.uid, "/connections/live")), null)), "拒否", `R3(${kind}): 他人は A の接続ノードを1つだけ消すこともできない`);
  check(await allowed(set(ref(dbA, P(a.uid, "/connections/live")), Date.now() + 10 * MIN)), "拒否", `R4(${kind}): 自分でも10分先の時刻は書けない（未来の偽装）`);
  check(await allowed(set(ref(dbA, P(a.uid, "/connections/live")), Date.now() - 60 * MIN)), "拒否", `R4(${kind}): 1時間前の時刻も書けない（過去の偽装）`);
  check(await allowed(set(ref(dbA, P(a.uid, "/connections/live")), Date.now())), isUnfixedProposal(kind) ? "許可" : "拒否", `R5(${kind}): 端末の時計の数値をそのまま書く（${isUnfixedProposal(kind) ? "提案のままでは±2分まで通る" : "サーバー時刻以外は不可"}）`);
  check(await allowed(set(ref(dbA, P(a.uid, "/connections/live")), serverTimestamp())), kind === "prod" ? "拒否" : "許可", `R6(${kind}): 既存の接続ノードをサーバー時刻へ更新（${kind === "prod" ? "今の本番は true だけ" : "提案は可"}）`);
  check(await allowed(set(ref(dbA, P(a.uid, "/connections/brandnew")), serverTimestamp())), isUnfixedProposal(kind) ? "許可" : "拒否", `R7(${kind}): 存在しない接続ノードをいきなり時刻で作る（${!isUnfixedProposal(kind) && kind !== "prod" ? "不可＝消えた接続の書き戻しを防ぐ" : kind === "prod" ? "不可" : "提案のままでは通る＝書き戻しの原因"}）`);
  check(await allowed(set(ref(dbA, P(a.uid, "/connections/s")), "online")), "拒否", `R8(${kind}): 文字列は書けない`);
  check(await allowed(set(ref(dbA, P(a.uid, "/connections/o")), { at: 1 })), "拒否", `R8(${kind}): オブジェクトは書けない`);
  check(await allowed(set(ref(dbA, P(a.uid, "/lastSeen")), Date.now() + 10 * MIN)), "拒否", `R9(${kind}): lastSeen も10分先は不可`);
  check(await allowed(set(ref(dbA, P(a.uid, "/lastSeen")), "yesterday")), "拒否", `R9(${kind}): lastSeen に文字列は不可`);
  check(await allowed(set(ref(dbA, P(a.uid, "/lastSeen")), serverTimestamp())), "許可", `R9(${kind}): lastSeen をサーバー時刻で書くのは可`);
  check(await allowed(set(ref(dbA, P(a.uid, "/extra")), 1)), "拒否", `R10(${kind}): 決まった項目以外は書けない`);
  check(await allowed(set(ref(dbA, P(a.uid, "/isPlaying")), "yes")), "拒否", `R10(${kind}): isPlaying は真偽値だけ`);
  check(await allowed(set(ref(dbA, P(c.uid, "/connections/x")), true)), "拒否", `R11(${kind}): 他人の UID 宛ては自分でも書けない`);
  check(await allowed(set(ref(c.client.database, P(c.uid, "/connections/x")), true)), "拒否", `R11(${kind}): 公開プロフィールが無い人は在席を書けない`);
  check(await allowed(get(ref(nobody.client.database, "presence"))), "拒否", `R12(${kind}): ログインしていない人は在席を読めない`);
  check(await allowed(get(ref(dbB, "presence"))), "許可", `R12(${kind}): ログイン済みの人は在席を読める（フレンド一覧）`);
  // 複数パスの一括更新（ハートビート）：接続ノードがあれば通る／無ければ全体が拒否（lastSeen も書かれない）
  if (kind !== "prod") {
    await set(ref(dbA, P(a.uid, "/connections/hb")), true);
    check(await allowed(update(ref(dbA, P(a.uid)), { lastSeen: serverTimestamp(), "connections/hb": serverTimestamp() })), "許可", `R13(${kind}): ハートビート（lastSeen＋自分の接続）を1回で更新できる`);
    await adminDelete(ns, P(a.uid, "/connections/hb"));
    check(
      await allowed(update(ref(dbA, P(a.uid)), { lastSeen: serverTimestamp(), "connections/hb": serverTimestamp() })),
      !isUnfixedProposal(kind) ? "拒否" : "許可",
      `R13(${kind}): 消えた接続ノードへのハートビートは${!isUnfixedProposal(kind) ? "拒否（書き戻さない）" : "通ってしまう（書き戻し）"}`
    );
  }
  // 管理者の欄は誰も書けない（自己昇格不可）
  check(await allowed(set(ref(dbA, `admins/${a.uid}`), true)), "拒否", `R14(${kind}): 自分を管理者にはできない`);
  check(await allowed(get(ref(dbA, `admins/${b.uid}`))), "拒否", `R14(${kind}): 他人の管理者フラグは読めない`);
  check(await allowed(get(ref(dbA, `admins/${a.uid}`))), "許可", `R14(${kind}): 自分の管理者フラグは読める`);
  // 後継者（uidSupersession/{旧}/newUid が自分）は旧UIDの在席を「消す」ことだけできる
  await adminSet(ns, `uidSupersession/${a.uid}`, { newUid: b.uid, backupId: "bk-R", recordedAt: Date.now() });
  check(await allowed(set(ref(dbB, P(a.uid, "/lastSeen")), serverTimestamp())), "拒否", `R15(${kind}): 後継者でも旧UIDの在席を書き換えることはできない`);
  check(await allowed(remove(ref(dbB, P(a.uid)))), "許可", `R15(${kind}): 後継者は旧UIDの在席を消せる（整理）`);
  await Promise.all([a, b, c, nobody].map(closeDevice));
}

// ===========================================================================
// P. 在席：アプリの js/presenceSync.js を本物の SDK で動かす
// ===========================================================================
async function runPresenceScenarios(kind) {
  const ns = NS[kind];
  const timed = kind !== "prod";
  const expectValueKind = timed ? "number" : "boolean";

  // ---- P1 通常：開始→ハートビート→閉じる ----
  group(`P1(${kind}) 通常の起動・ハートビート・終了`);
  localStorage.clear();
  {
    const d = await createDevice(`P1-${kind}`, { ns, signIn: anon });
    await seedProfile(ns, d.uid);
    const presence = await d.startPresence();
    const first = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      const k = connectionKeys(e)[0];
      return k && typeof e.connections[k] === expectValueKind ? e : null;
    });
    const key = connectionKeys(first)[0];
    check(typeof first?.connections?.[key], expectValueKind, `P1(${kind}): 接続ノードの値は${timed ? "サーバー時刻（数値）" : "true（今の本番 Rules・従来方式へ自動で戻る）"}`);
    check(localStorage.getItem(PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY) !== null, !timed, `P1(${kind}): 「時刻は使えない」の記録は${timed ? "残さない" : "残す（24時間は試さない）"}`);
    check(classifyPresenceEntry(first, Date.now()).state, "online", `P1(${kind}): 接続直後はオンライン`);
    await sleep(30);
    d.tick();
    const afterTick = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      return e && e.lastSeen > first.lastSeen ? e : null;
    });
    check(Boolean(afterTick), true, `P1(${kind}): 2分ごとのハートビートで lastSeen が新しくなる`);
    if (timed) check(afterTick?.connections?.[key] > first.connections[key], true, `P1(${kind}): 同じ1回の書き込みで自分の接続ノードの時刻も新しくなる`);
    check(presence.needsFriendPresenceRearm(), false, `P1(${kind}): 書き込みは拒否されていない`);
    await closeDevice(d);
    const closed = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      return e && connectionKeys(e).length === 0 ? e : null;
    });
    check(connectionKeys(closed).length, 0, `P1(${kind}): アプリを閉じるとサーバーの onDisconnect が接続ノードを消す`);
    check(closed?.isPlaying, false, `P1(${kind}): 閉じたらプレイ中の印も消える`);
    check(classifyPresenceEntry(closed, Date.now() + PRESENCE_OFFLINE_GRACE_MS + 1000).state, "offline", `P1(${kind}): 閉じた後（瞬断の猶予12秒を過ぎたら）オフライン＝「オンラインのまま」にならない`);
    check(buildPresenceDisplay(closed, Date.now() + PRESENCE_OFFLINE_GRACE_MS + 1000).text, "たった今", `P1(${kind}): 最終接続は閉じた時刻（サーバー時刻）`);
  }

  // ---- P2 複数端末：1台閉じてもオンライン、全部閉じたらオフライン ----
  group(`P2(${kind}) 複数端末（同じアカウント）`);
  localStorage.clear();
  {
    const email = `multi-${kind}@example.com`;
    const uid = await createEmailUser(email, "password-1234");
    await seedProfile(ns, uid);
    const d1 = await createDevice(`P2-${kind}-iphone`, { ns, signIn: withEmail(email, "password-1234") });
    const d2 = await createDevice(`P2-${kind}-pc`, { ns, signIn: withEmail(email, "password-1234") });
    check(d1.uid === d2.uid, true, `P2(${kind}): 2台とも同じ UID`);
    await d1.startPresence();
    await d2.startPresence();
    const both = await waitFor(async () => {
      const e = await presenceOf(ns, uid);
      return connectionKeys(e).length === 2 && Object.values(e.connections).every((v) => typeof v === expectValueKind) ? e : null;
    });
    check(connectionKeys(both).length, 2, `P2(${kind}): 接続ノードは端末ごとに1つずつ（2つ）`);
    goOffline(d1.client.database);
    const one = await waitFor(async () => {
      const e = await presenceOf(ns, uid);
      return connectionKeys(e).length === 1 ? e : null;
    });
    check(connectionKeys(one).length, 1, `P2(${kind}): 1台が切断すると、その端末の接続ノードだけ消える`);
    check(classifyPresenceEntry(one, Date.now() + 20000).state, "online", `P2(${kind}): もう1台が繋がっているのでオンラインのまま`);
    goOffline(d2.client.database);
    const none = await waitFor(async () => {
      const e = await presenceOf(ns, uid);
      return e && connectionKeys(e).length === 0 ? e : null;
    });
    check(classifyPresenceEntry(none, Date.now() + PRESENCE_OFFLINE_GRACE_MS + 1000).state, "offline", `P2(${kind}): 全部の端末が切断したらオフライン`);
    await Promise.all([d1, d2].map(closeDevice));
  }

  // ---- P3 複数タブ：同じ端末の2つのタブ（保存領域を共有）。1つのタブで公開OFF→そのタブの接続だけ消える ----
  group(`P3(${kind}) 複数タブ（同じ端末）`);
  localStorage.clear();
  {
    const email = `tabs-${kind}@example.com`;
    const uid = await createEmailUser(email, "password-1234");
    await seedProfile(ns, uid);
    const t1 = await createDevice(`P3-${kind}-tab1`, { ns, signIn: withEmail(email, "password-1234") });
    const t2 = await createDevice(`P3-${kind}-tab2`, { ns, signIn: withEmail(email, "password-1234") });
    const p1 = await t1.startPresence();
    await t2.startPresence();
    await waitFor(async () => connectionKeys(await presenceOf(ns, uid)).length === 2);
    p1.stopFriendPresenceTracking();
    const after = await waitFor(async () => {
      const e = await presenceOf(ns, uid);
      return connectionKeys(e).length === 1 ? e : null;
    });
    check(connectionKeys(after).length, 1, `P3(${kind}): タブ1で在席を止めても、タブ2の接続は残る`);
    check(classifyPresenceEntry(after, Date.now()).state, "online", `P3(${kind}): タブ2があるのでオンライン`);
    await closeDevice(t1);
    await sleep(500);
    check(connectionKeys(await presenceOf(ns, uid)).length, 1, `P3(${kind}): 止めたタブを閉じても、取り消した onDisconnect は動かない（タブ2の表示を壊さない）`);
    await closeDevice(t2);
    const gone = await waitFor(async () => connectionKeys(await presenceOf(ns, uid)).length === 0);
    check(gone, true, `P3(${kind}): 最後のタブを閉じたら接続ノードは0`);
  }

  // ---- P4 再接続：切断→再接続で新しい接続ノード、古いものは残らない ----
  group(`P4(${kind}) 再接続`);
  localStorage.clear();
  {
    const d = await createDevice(`P4-${kind}`, { ns, signIn: anon });
    await seedProfile(ns, d.uid);
    await d.startPresence();
    const before = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      const k = connectionKeys(e)[0];
      return k && typeof e.connections[k] === expectValueKind ? e : null;
    });
    const oldKey = connectionKeys(before)[0];
    goOffline(d.client.database);
    await waitFor(async () => connectionKeys(await presenceOf(ns, d.uid)).length === 0);
    d.tick(); // 切断中にハートビートが動いても、接続ノードは書かない（lastSeen だけ。再接続後に送られる）
    goOnline(d.client.database);
    const after = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      const keys = connectionKeys(e);
      return keys.length >= 1 && !keys.includes(oldKey) && typeof e.connections[keys[0]] === expectValueKind ? e : null;
    });
    await sleep(800);
    const settled = await presenceOf(ns, d.uid);
    check(connectionKeys(settled).length, 1, `P4(${kind}): 再接続後の接続ノードは1つだけ`);
    check(connectionKeys(settled).includes(oldKey), false, `P4(${kind}): 切断前の接続ノードは書き戻されない`);
    check(Boolean(after) && classifyPresenceEntry(settled, Date.now()).state, "online", `P4(${kind}): 再接続でオンラインに戻る`);
    await closeDevice(d);
  }

  // ---- P5 iPhone のバックグラウンド：通信が固まる→サーバーが気付く→復帰でタイマーが動く→再接続 ----
  group(`P5(${kind}) iPhone のバックグラウンド・ロック（通信が固まる）と復帰`);
  localStorage.clear();
  {
    const proxy = await createFreezableProxy(DB_PORT);
    const d = await createDevice(`P5-${kind}`, { ns, dbPort: proxy.port, signIn: anon });
    await seedProfile(ns, d.uid);
    await d.startPresence();
    const start = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      const k = connectionKeys(e)[0];
      return k && typeof e.connections[k] === expectValueKind ? e : null;
    });
    const oldKey = connectionKeys(start)[0];
    const lastAlive = timed ? start.connections[oldKey] : start.lastSeen;
    // バックグラウンドへ：iOS が通信とタイマーを止める（ここでは先に通信が固まった場合を再現する）。
    // 【2026-10-31】画面が隠れると、アプリは自分の接続ノードを外す（js/presenceSync.js の pausePresenceForBackground）。
    // 通信が先に固まっていれば、その書き込みはサーバーに届かない（＝下の「サーバーが気付かない」状況のまま）。
    proxy.freeze();
    d.setVisibility("hidden");
    await sleep(1500);
    const frozen = await presenceOf(ns, d.uid);
    check(connectionKeys(frozen).includes(oldKey), true, `P5(${kind}): 通信が固まっている間、サーバーはまだ切断に気付かない（接続ノードが残る）`);
    check(frozen.lastSeen, start.lastSeen, `P5(${kind}): 画面が隠れても書き込みはしない（タイマーも止まっている）`);
    check(classifyPresenceEntry(frozen, lastAlive + 10 * MIN).state, "online", `P5(${kind}): 止まってから15分以内はオンライン（通常プレイ中の人を誤ってオフラインにしない余裕）`);
    const d16 = buildPresenceDisplay(frozen, lastAlive + 16 * MIN);
    check([d16.state, d16.text], ["unknown", "通信不明（最終確認 16分前）"], `P5(${kind}): 16分止まると「❔ 通信不明（最終確認 16分前）」`);
    check(buildPresenceDisplay(frozen, lastAlive + 16 * MIN).isOnline, false, `P5(${kind}): 通信不明は「一緒に遊ぶ」の対象にしない`);
    const d61 = buildPresenceDisplay(frozen, lastAlive + 61 * MIN);
    check([d61.state, d61.text], ["offline", "1時間前"], `P5(${kind}): 1時間を超えたら「⚫ 1時間前」（オフライン）`);
    // サーバーが無応答に気付く（本番の RTDB では約60秒〜数分）→ onDisconnect が動く
    proxy.serverDetectsTimeout();
    const detected = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      return e && !connectionKeys(e).includes(oldKey) ? e : null;
    });
    check(Boolean(detected), true, `P5(${kind}): サーバーが切断を検知すると onDisconnect で接続ノードが消える`);
    check(classifyPresenceEntry(detected, Date.now() + PRESENCE_OFFLINE_GRACE_MS + 1000).state, "offline", `P5(${kind}): 検知後はオフライン（最終接続＝検知した時刻）`);
    // 復帰：止まっていた2分タイマーがすぐ動く（クライアントはまだ繋がっているつもり）→ 送った書き込みは届かない
    d.setVisibility("visible");
    d.tick();
    await sleep(300);
    // 電波が戻り、iPhone が切断に気付いて再接続 → 届いていなかった書き込みが送り直される
    proxy.clientDetectsLoss();
    const reconnected = await waitFor(
      async () => {
        const e = await presenceOf(ns, d.uid);
        return connectionKeys(e).some((k) => k !== oldKey) ? e : null;
      },
      { timeoutMs: 15000 }
    );
    await sleep(1500);
    const settled = await presenceOf(ns, d.uid);
    const resurrected = connectionKeys(settled).includes(oldKey);
    check(Boolean(reconnected), true, `P5(${kind}): 再接続で新しい接続ノードを作る`);
    check(resurrected, isUnfixedProposal(kind), `P5(${kind}): 消えた古い接続ノードが送り直しで${isUnfixedProposal(kind) ? "書き戻される（＝提案のままの不具合を再現）" : "書き戻されない"}`);
    await closeDevice(d);
    const final = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      return e && connectionKeys(e).filter((k) => k !== oldKey).length === 0 ? e : null;
    });
    const finalState = classifyPresenceEntry(final, Date.now() + PRESENCE_OFFLINE_GRACE_MS + 1000).state;
    check(finalState, isUnfixedProposal(kind) ? "online" : "offline", `P5(${kind}): アプリを閉じた後の表示は${isUnfixedProposal(kind) ? "「オンライン」のまま（書き戻された残骸のせい。15分後に通信不明、1時間後にオフライン）" : "オフライン"}`);
    proxy.close();
    if (resurrected) await adminDelete(ns, `presence/${d.uid}/connections/${oldKey}`);
  }

  // ---- P6 電波が切れたのに onDisconnect がまだ動かない（サーバーのタイムアウト待ち）----
  group(`P6(${kind}) 電波が切れたまま（サーバーが気付くまで）`);
  localStorage.clear();
  {
    const proxy = await createFreezableProxy(DB_PORT);
    const d = await createDevice(`P6-${kind}`, { ns, dbPort: proxy.port, signIn: anon });
    await seedProfile(ns, d.uid);
    await d.startPresence();
    const start = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      const k = connectionKeys(e)[0];
      return k && typeof e.connections[k] === expectValueKind ? e : null;
    });
    const key = connectionKeys(start)[0];
    proxy.freeze();
    await sleep(3000);
    const still = await presenceOf(ns, d.uid);
    check(connectionKeys(still).includes(key), true, `P6(${kind}): 電波が切れても、サーバーが気付くまで接続ノードは残る（この間は最大15分オンライン表示）`);
    proxy.serverDetectsTimeout();
    const gone = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      return e && !connectionKeys(e).includes(key) ? e : null;
    });
    check(Boolean(gone) && gone.lastSeen >= start.lastSeen, true, `P6(${kind}): サーバーが気付いた時点で接続ノードが消え、lastSeen は気付いた時刻`);
    proxy.clientDetectsLoss();
    const back = await waitFor(async () => connectionKeys(await presenceOf(ns, d.uid)).length === 1, { timeoutMs: 15000 });
    check(back, true, `P6(${kind}): 電波が戻ると自動で再接続し、オンラインに戻る`);
    await closeDevice(d);
    proxy.close();
  }

  // ---- P7 自分の古い接続ノードの掃除 ----
  group(`P7(${kind}) 自分の古い接続ノードの掃除`);
  localStorage.clear();
  {
    const d = await createDevice(`P7-${kind}`, { ns, signIn: anon });
    await seedProfile(ns, d.uid);
    const freshPushKey = "-P5" + "z".repeat(17); // 作成時刻が未来に読めるキー（＝作成時刻の判定では消えない）
    const freshPushKey2 = "-P5" + "y".repeat(17);
    const oldPushKey = "-A" + "a".repeat(18); // 作成時刻が大昔（24時間超）
    await adminSet(ns, `presence/${d.uid}/connections`, {
      [freshPushKey]: Date.now() - 2 * 60 * MIN, // 2時間止まった数値ノード（表示上オフラインの残骸）
      [freshPushKey2]: Date.now() - 20 * MIN, // 20分止まった数値ノード（通信不明＝別の iPhone かもしれない）
      [oldPushKey]: true, // 24時間以上前に作られた true の残骸
    });
    await d.startPresence();
    const cleaned = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      return e && !connectionKeys(e).includes(oldPushKey) && !connectionKeys(e).includes(freshPushKey) ? e : null;
    });
    check(connectionKeys(cleaned).includes(freshPushKey), false, `P7(${kind}): 1時間以上止まった数値の接続ノードは消す（オフライン扱いの残骸）`);
    check(connectionKeys(cleaned).includes(freshPushKey2), true, `P7(${kind}): 20分止まっただけの接続ノードは消さない（別の端末かもしれない）`);
    check(connectionKeys(cleaned).includes(oldPushKey), false, `P7(${kind}): 24時間以上前の true の残骸は従来どおり消す`);
    await closeDevice(d);
    await adminDelete(ns, `presence/${d.uid}`);
  }

  // ---- P8 公開プロフィールが無い間は拒否→作った後に張り直し ----
  group(`P8(${kind}) UID が変わった直後（公開プロフィールが無い）→張り直し`);
  localStorage.clear();
  {
    const d = await createDevice(`P8-${kind}`, { ns, signIn: anon });
    const presence = await d.startPresence();
    const failed = await waitFor(() => presence.needsFriendPresenceRearm());
    check(failed, true, `P8(${kind}): 公開プロフィールが無い間は在席の書き込みが拒否され、張り直しが必要と分かる`);
    check(localStorage.getItem(PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY), null, `P8(${kind}): この拒否を「時刻は使えない」と取り違えない`);
    await seedProfile(ns, d.uid);
    globalThis.__startingDevice = d.name;
    await presence.startFriendPresenceTracking();
    globalThis.__startingDevice = null;
    const ok = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      const k = connectionKeys(e)[0];
      return k && typeof e.connections[k] === expectValueKind;
    });
    check(ok, true, `P8(${kind}): 公開プロフィールを作った後の張り直しで接続ノードができる`);
    check(presence.needsFriendPresenceRearm(), false, `P8(${kind}): 張り直し後は正常`);
    await closeDevice(d);
  }

  if (timed) {
    // ---- P9 自分の接続ノードが（掃除・手動削除で）消された：ハートビートが拒否→作り直す ----
    group(`P9(${kind}) 接続中に自分の接続ノードが消された`);
    localStorage.clear();
    {
      const d = await createDevice(`P9-${kind}`, { ns, signIn: anon });
      await seedProfile(ns, d.uid);
      await d.startPresence();
      const start = await waitFor(async () => {
        const e = await presenceOf(ns, d.uid);
        const k = connectionKeys(e)[0];
        return k && typeof e.connections[k] === "number" ? e : null;
      });
      const key = connectionKeys(start)[0];
      await adminDelete(ns, `presence/${d.uid}/connections/${key}`);
      d.tick();
      const recreated = await waitFor(async () => {
        const e = await presenceOf(ns, d.uid);
        return typeof e?.connections?.[key] === "number" ? e : null;
      });
      check(Boolean(recreated), kind === "propFixed" ? true : true, `P9(${kind}): ${kind === "propFixed" ? "拒否を受けて同じ接続ノードを作り直す（オンライン表示が戻る）" : "提案のままではそのまま書かれる"}`);
      check(recreated && recreated.lastSeen > start.lastSeen, true, `P9(${kind}): lastSeen も更新される`);
      await closeDevice(d);
      const gone = await waitFor(async () => connectionKeys(await presenceOf(ns, d.uid)).length === 0);
      check(gone, true, `P9(${kind}): 作り直した接続ノードも閉じると消える（onDisconnect は同じ接続に残っている）`);
    }
  }
}

// ---- P10 今の本番 Rules で「時刻は使えない」を覚えた端末が、Rules 更新後に自動で切り替わる ----
async function runFallbackMemoryScenario() {
  group("P10 24時間の記録と、Rules 更新後の自動切り替え");
  localStorage.clear();
  const ns = NS.propFixed;
  localStorage.setItem(PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY, String(Date.now() - 60 * MIN));
  const d1 = await createDevice("P10-recent", { ns, signIn: anon });
  await seedProfile(ns, d1.uid);
  await d1.startPresence();
  const v1 = await waitFor(async () => {
    const e = await presenceOf(ns, d1.uid);
    return connectionKeys(e)[0] ? e.connections[connectionKeys(e)[0]] : null;
  });
  await sleep(600);
  const v1b = Object.values((await presenceOf(ns, d1.uid)).connections)[0];
  check([v1, v1b], [true, true], "P10: 1時間前に「使えない」と覚えた端末は、Rules 更新後でも24時間は true のまま（試さない＝無駄な拒否を出さない）");
  await closeDevice(d1);
  localStorage.setItem(PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY, String(Date.now() - 25 * 60 * MIN));
  const d2 = await createDevice("P10-expired", { ns, signIn: anon });
  await seedProfile(ns, d2.uid);
  await d2.startPresence();
  const v2 = await waitFor(async () => {
    const e = await presenceOf(ns, d2.uid);
    const v = Object.values(e?.connections ?? {})[0];
    return typeof v === "number" ? v : null;
  });
  check(typeof v2, "number", "P10: 24時間たつと再挑戦し、Rules が許せば時刻方式へ切り替わる");
  await closeDevice(d2);
}

// ---- P13 修正前のアプリ（git の 82000d6 の presenceSync.js）と各 Rules の組み合わせ ----
async function runLegacyClientScenario() {
  if (!process.env.EMU_LEGACY_PRESENCE_FILE) {
    console.log("\n（P13 は EMU_LEGACY_PRESENCE_FILE が無いので省略）");
    return;
  }
  for (const kind of ["prod", "propAsIs", "propFixed"]) {
    group(`P13(${kind}) 修正前のアプリ（82000d6）が混ざっても動く`);
    localStorage.clear();
    const ns = NS[kind];
    const d = await createDevice(`P13-${kind}`, { ns, signIn: anon });
    d.legacy = true;
    await seedProfile(ns, d.uid);
    await d.startPresence();
    const expectNumber = isUnfixedProposal(kind);
    const entry = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      const v = Object.values(e?.connections ?? {})[0];
      return (expectNumber ? typeof v === "number" : v === true) ? e : null;
    });
    await sleep(500);
    const v = Object.values((await presenceOf(ns, d.uid)).connections)[0];
    check(expectNumber ? typeof v : v, expectNumber ? "number" : true, `P13(${kind}): 修正前のアプリの接続ノードは${expectNumber ? "時刻（提案のままなら通る）" : "true（時刻を拒否されたら従来方式へ戻る）"}`);
    check(classifyPresenceEntry(entry, Date.now()).state, "online", `P13(${kind}): 修正前のアプリでもオンライン表示`);
    d.tick();
    const ticked = await waitFor(async () => {
      const e = await presenceOf(ns, d.uid);
      return e.lastSeen > entry.lastSeen ? e : null;
    });
    check(Boolean(ticked), true, `P13(${kind}): 修正前のアプリのハートビートも通る`);
    await closeDevice(d);
    const gone = await waitFor(async () => connectionKeys(await presenceOf(ns, d.uid)).length === 0);
    check(gone, true, `P13(${kind}): 閉じたら接続ノードは消える`);
  }
}

// ---- P14 同じ保護済みアカウントを、公開OFFの別の保存領域（Safari など）で開いた ----
// publicProfileSync.js は公開OFFの端末の起動時に deleteFriendPresence()（presence/{uid} 全体の削除）を呼ぶ。
// メールで保護すると「同じ UID を2つの保存領域で使う」ことができるため、その影響を測る（担当外のファイルなので修正はしない）
async function runSharedUidSharingOffScenario() {
  for (const kind of ["prod", "propFixed"]) {
    group(`P14(${kind}) 同じ UID の別の保存領域（公開OFF）が起動したとき`);
    localStorage.clear();
    const ns = NS[kind];
    const email = `shared-${kind}@example.com`;
    const uid = await createEmailUser(email, "password-1234");
    await seedProfile(ns, uid);
    const pwa = await createDevice(`P14-${kind}-pwa`, { ns, signIn: withEmail(email, "password-1234") });
    await pwa.startPresence();
    await waitFor(async () => {
      const v = Object.values((await presenceOf(ns, uid))?.connections ?? {})[0];
      return kind === "prod" ? v === true : typeof v === "number";
    });
    const safari = await createDevice(`P14-${kind}-safari`, { ns, signIn: withEmail(email, "password-1234") });
    const safariPresence = await safari.presence();
    await safariPresence.deleteFriendPresence(); // 公開OFFの端末の起動時の後片付け（publicProfileSync.js と同じ呼び出し）
    const wiped = await presenceOf(ns, uid);
    check(connectionKeys(wiped).length, 0, `P14(${kind}): 公開OFFの側の起動で、ホーム画面アプリの接続ノードまで消える`);
    pwa.tick();
    const after = await waitFor(
      async () => {
        const e = await presenceOf(ns, uid);
        return e?.lastSeen ? e : null;
      },
      { timeoutMs: 4000 }
    );
    await sleep(kind === "prod" ? 1500 : 0);
    const settled = kind === "prod" ? await presenceOf(ns, uid) : await waitFor(async () => {
      const e = await presenceOf(ns, uid);
      return connectionKeys(e).length ? e : null;
    });
    const state = classifyPresenceEntry(settled, Date.now() + PRESENCE_OFFLINE_GRACE_MS + 1000).state;
    check(
      state,
      kind === "prod" ? "offline" : "online",
      `P14(${kind}): ホーム画面アプリは開いたまま → ${kind === "prod" ? "今の本番 Rules では次に再接続するまで「オフライン」に見える（残るリスク）" : "時刻方式では次のハートビートで接続ノードを作り直し「オンライン」に戻る"}`
    );
    check(Boolean(after), true, `P14(${kind}): lastSeen はハートビートで書き直される`);
    await Promise.all([pwa, safari].map(closeDevice));
  }
}

// ---- P11 見る側の時計がずれていても、サーバー時刻で判定する ----
async function runServerTimeScenario() {
  group("P11 見る側の端末の時計のずれ（サーバー時刻で判定）");
  localStorage.clear();
  const ns = NS.propFixed;
  const RealDate = Date;
  const skew = 20 * MIN;
  // 見る側の端末だけ時計が20分進んでいる（SDK が .info/serverTimeOffset を計算する前にずらす）
  class SkewedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [RealDate.now() + skew]));
    }
    static now() {
      return RealDate.now() + skew;
    }
  }
  const owner = await createDevice("P11-owner", { ns, signIn: anon });
  await seedProfile(ns, owner.uid);
  await owner.startPresence();
  await waitFor(async () => connectionKeys(await presenceOf(ns, owner.uid)).length === 1);
  globalThis.Date = SkewedDate;
  try {
    const viewer = await createDevice("P11-viewer", { ns, signIn: anon });
    const viewerPresence = await viewer.presence();
    let latest = null;
    const unsubscribe = viewerPresence.subscribeToAllPresence((all) => {
      latest = all;
    });
    await waitFor(() => latest?.[owner.uid]);
    await sleep(800);
    const serverNow = viewerPresence.getPresenceNowMs();
    check(Math.abs(serverNow - RealDate.now()) < 5000, true, "P11: 20分進んだ端末でも、getPresenceNowMs() はサーバー時刻（誤差5秒以内）");
    check(classifyPresenceEntry(latest[owner.uid], serverNow).state, "online", "P11: サーバー時刻で判定すればオンライン");
    check(classifyPresenceEntry(latest[owner.uid], Date.now()).state, "unknown", "P11: （比較）端末の時計のままだと20分前に見えて「通信不明」になっていた");
    unsubscribe();
    await closeDevice(viewer);
  } finally {
    globalThis.Date = RealDate;
  }
  await closeDevice(owner);
}

// ---- P12 書き込み量（中継で実際のバイト数を測る）----
async function runWriteBudgetScenario() {
  group("P12 書き込み量・配信量の実測（提案＋修正の Rules）");
  localStorage.clear();
  const ns = NS.propFixed;
  const upProxy = await createFreezableProxy(DB_PORT);
  const downProxy = await createFreezableProxy(DB_PORT);
  const d = await createDevice("P12-writer", { ns, dbPort: upProxy.port, signIn: anon });
  await seedProfile(ns, d.uid);
  await d.startPresence();
  await waitFor(async () => typeof Object.values((await presenceOf(ns, d.uid))?.connections ?? {})[0] === "number");
  const viewer = await createDevice("P12-viewer", { ns, dbPort: downProxy.port, signIn: anon });
  const vp = await viewer.presence();
  let updates = 0;
  const unsub = vp.subscribeToAllPresence(() => {
    updates += 1;
  });
  await waitFor(() => updates > 0);
  await sleep(500);
  const up0 = upProxy.bytes.up;
  const down0 = downProxy.bytes.down;
  const N = 10;
  for (let i = 0; i < N; i += 1) {
    d.tick();
    await sleep(250);
  }
  await sleep(800);
  const upPer = Math.round((upProxy.bytes.up - up0) / N);
  const downPer = Math.round((downProxy.bytes.down - down0) / N);
  console.log(`   計測：ハートビート1回あたり 送信 ${upPer} バイト（書く側）／ フレンド一覧を開いている1人への配信 ${downPer} バイト`);
  check(upPer > 0 && upPer < 400, true, `P12: ハートビート1回の送信は400バイト未満（実測 ${upPer} バイト）`);
  check(downPer > 0 && downPer < 400, true, `P12: 見る側1人への配信は1回400バイト未満（実測 ${downPer} バイト）`);
  globalThis.__writeBudget = { upPerHeartbeat: upPer, downPerHeartbeatPerViewer: downPer };
  unsub();
  await closeDevice(viewer);
  await closeDevice(d);
  upProxy.close();
  downProxy.close();
}

// ===========================================================================
// B. アカウント保護：Auth エミュレータ＋本物の SDK＋js/accountRecovery.js
// ===========================================================================
function protectionFor(device) {
  const auth = device.client.auth;
  return accountRecovery.createAccountProtection({
    getCurrentUser: () => auth.currentUser,
    makeEmailCredential: (email, password) => authSdk.EmailAuthProvider.credential(email, password),
    linkWithCredential: (user, credential) => authSdk.linkWithCredential(user, credential),
    signInWithEmailAndPassword: (email, password) => authSdk.signInWithEmailAndPassword(auth, email, password),
    sendPasswordResetEmail: (email) => authSdk.sendPasswordResetEmail(auth, email),
  });
}
const codeOf = async (promise) => {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error?.code ?? String(error);
  }
};

async function runAccountScenarios() {
  const ns = NS.prod; // アカウント保護は Rules を変えずに使える（今の本番 Rules で確認）
  const OWNER_EMAIL = "owner@example.com";
  const OWNER_PASS = "correct-horse-1";

  group("B1 匿名アカウントにメールを結び付けても UID は変わらない");
  const iphone = await createDevice("B-iphone-pwa", { ns, signIn: anon });
  const U = iphone.uid;
  const prot = protectionFor(iphone);
  check(prot.getStatus().protected, false, "B1: 結び付け前は「未保護（匿名ログイン）」");
  const linked = await prot.protectWithEmail({ email: OWNER_EMAIL, password: OWNER_PASS, passwordConfirm: OWNER_PASS, confirmed: true });
  check([linked.ok, linked.uid, linked.switched], [true, U, false], "B1: linkWithCredential 成功・UID はそのまま・切り替えなし");
  check(iphone.client.auth.currentUser.uid, U, "B1: SDK の currentUser も同じ UID");
  check(iphone.client.auth.currentUser.isAnonymous, false, "B1: 匿名ではなくなる（メールでログインし直せる）");
  check(prot.getStatus().protected && prot.getStatus().email === OWNER_EMAIL, true, "B1: 状態表示が「メールで保護済み」になる");
  const twice = await prot.protectWithEmail({ email: OWNER_EMAIL, password: OWNER_PASS, confirmed: true });
  check(twice.code, "auth/provider-already-linked", "B1: 二重には結び付けない");

  group("B2 そのメールが別のアカウントで使われている");
  const other = await createDevice("B-other-device", { ns, signIn: anon });
  const V = other.uid;
  const r2 = await protectionFor(other).protectWithEmail({ email: OWNER_EMAIL, password: "another-pass-9", confirmed: true });
  check([r2.ok, r2.switched], [false, false], "B2: 失敗・切り替えない");
  check(["auth/email-already-in-use", "auth/credential-already-in-use"].includes(r2.code), true, `B2: SDK のエラーコードは ${r2.code}`);
  check(r2.reason.includes("切り替えていません"), true, "B2: 「今のアカウントはそのまま（切り替えていません）」と説明する");
  check([other.client.auth.currentUser.uid, other.client.auth.currentUser.isAnonymous], [V, true], "B2: この端末は元の匿名 UID のまま");

  group("B3 結び付けの失敗（弱いパスワード・メールの形・通信）でも匿名の同じ UID のまま");
  const shortResult = await protectionFor(other).protectWithEmail({ email: "v@example.com", password: "1234567", confirmed: true });
  check([shortResult.ok, shortResult.reason.includes("8文字以上")], [false, true], "B3: 8文字未満はアプリ側で止める（SDK を呼ばない）");
  const weak = await codeOf(authSdk.linkWithCredential(other.client.auth.currentUser, authSdk.EmailAuthProvider.credential("v@example.com", "12345")));
  check(weak, "auth/weak-password", "B3: SDK 側でも6文字未満は auth/weak-password");
  check(accountRecovery.describeAuthErrorJa(weak).includes("短すぎます"), true, "B3: 日本語の説明がある");
  const badEmail = await codeOf(authSdk.linkWithCredential(other.client.auth.currentUser, authSdk.EmailAuthProvider.credential("not-an-email", "password-1234")));
  check(badEmail, "auth/invalid-email", "B3: 形の正しくないメールは auth/invalid-email");
  check([other.client.auth.currentUser.uid, other.client.auth.currentUser.isAnonymous], [V, true], "B3: 失敗の後も同じ匿名 UID");
  const authProxy = await createFreezableProxy(AUTH_PORT);
  const flaky = await createDevice("B-flaky", { ns, authPort: authProxy.port, signIn: anon });
  const N = flaky.uid;
  authProxy.cutAll();
  const r3 = await protectionFor(flaky).protectWithEmail({ email: "flaky@example.com", password: "password-1234", confirmed: true });
  check([r3.ok, r3.code], [false, "auth/network-request-failed"], "B3: 通信できないときは auth/network-request-failed");
  check(r3.reason.includes("何も変更していません"), true, "B3: 「何も変更していません」と説明する");
  check([flaky.client.auth.currentUser.uid, flaky.client.auth.currentUser.isAnonymous], [N, true], "B3: 通信失敗の後も同じ匿名 UID");
  authProxy.close();

  group("B4 別の端末（保存領域が空）で同じメールでログイン → 同じ UID・管理者・データがそのまま");
  await adminSet(ns, `admins/${U}`, true);
  await adminSet(ns, `backups/bk-owner-pwa`, { schemaVersion: 1, currentUid: U, updatedAt: Date.now(), payload: { "achievements~first": true }, ownerSecret: "s".repeat(40) });
  await adminSet(ns, `publicProfiles/${U}`, { identityKey: "ik-owner-xxxxxxxx", displayName: "がしお" });
  await adminSet(ns, `timeAttackLeaderboardsV3/normal/10/all/${U}`, { displayName: "がしお", timeMs: 12345, identityKey: "ik-owner-xxxxxxxx" });
  const fresh = await createDevice("B-new-iphone", { ns, signIn: withEmail(OWNER_EMAIL, OWNER_PASS) });
  check(fresh.uid, U, "B4: 新しい端末（ログイン情報なし）でも同じメールなら同じ UID");
  const db = fresh.client.database;
  check((await get(ref(db, `admins/${U}`))).val(), true, "B4: admins/{UID} はそのまま true（管理者のまま）");
  check((await get(ref(db, "backups/bk-owner-pwa/currentUid"))).val(), U, "B4: 自分のバックアップを読める（持ち主のまま）");
  check((await get(ref(db, `publicProfiles/${U}/displayName`))).val(), "がしお", "B4: フレンドのカードは同じ UID のまま");
  check((await get(ref(db, `timeAttackLeaderboardsV3/normal/10/all/${U}/timeMs`))).val(), 12345, "B4: ランキングの記録も同じ UID のまま");
  check(await allowed(get(ref(db, "backups"))), "許可", "B4: 管理者なのでバックアップ一覧（🔧 バックアップ管理）も読める");

  group("B5 匿名の別 UID になっていた側（例：Safari）でメールにログインし直す → 保護した UID へ。旧匿名 UID は整理待ちへ");
  const safari = await createDevice("B-safari", { ns, signIn: anon });
  const W1 = safari.uid;
  const ownerSecret = "o".repeat(40);
  await adminSet(ns, `backups/bk-safari`, { schemaVersion: 1, currentUid: W1, updatedAt: Date.now(), payload: { x: 1 }, ownerSecret });
  await adminSet(ns, `publicProfiles/${W1}`, { identityKey: "ik-safari-xxxxxxx", displayName: "がしお" });
  await adminSet(ns, `presence/${W1}`, { connections: { "-Psafari": true }, lastSeen: Date.now() });
  const sp = protectionFor(safari);
  const wrong = await sp.reloginWithEmail({ email: OWNER_EMAIL, password: "wrong-pass-0", confirmed: true });
  check([wrong.ok, safari.client.auth.currentUser.uid], [false, W1], "B5: パスワード違いは何も変えない（匿名 UID のまま）");
  const re = await sp.reloginWithEmail({ email: OWNER_EMAIL, password: OWNER_PASS, confirmed: true });
  check([re.ok, re.switched, re.beforeUid, re.afterUid, re.needsReload], [true, true, W1, U, true], "B5: 保護した UID へ切り替わり、画面の読み込み直しを求める");
  const sdb = safari.client.database;
  // 読み込み直した後の backupSync.js と同じ形の書き込み（claim：ownerSecret で持ち主を取り戻し、旧UIDを previousUids へ）
  const claim = await allowed(
    update(ref(sdb, "backups/bk-safari"), {
      schemaVersion: 1,
      currentUid: U,
      updatedAt: serverTimestamp(),
      payload: { x: 1 },
      ownerClaim: { secret: ownerSecret, at: serverTimestamp() },
      ownerSecret: "n".repeat(40),
      [`previousUids/${W1}`]: serverTimestamp(),
    })
  );
  check(claim, "許可", "B5: 今の本番 Rules で、端末の ownerSecret による持ち主の取り戻し（claim）が通る");
  const sup = await allowed(set(ref(sdb, `uidSupersession/${W1}`), { newUid: U, backupId: "bk-safari", recordedAt: serverTimestamp() }));
  check(sup, "許可", "B5: 旧匿名 UID の対応表（uidSupersession）を作れる");
  check(await allowed(remove(ref(sdb, `presence/${W1}`))), "許可", "B5: 後継者として旧匿名 UID の在席を消せる");
  check(await allowed(remove(ref(sdb, `publicProfiles/${W1}`))), "許可", "B5: 後継者として旧匿名 UID のカードを消せる");
  const q1 = uidMergeQueue.enqueueUidMerge([], { oldUid: W1, backupId: "bk-safari", currentUid: U, nowMs: Date.now() });
  check([q1.added, q1.reason], [true, "added"], "B5: 整理待ちの列（uidMergeQueue）に旧匿名 UID が入る（既存の API のまま）");
  check(uidMergeQueue.selectActiveUidMerge(q1.queue, { currentUid: U })?.oldUid, W1, "B5: 次に整理する旧 UID として選ばれる");
  const q2 = uidMergeQueue.enqueueUidMerge(q1.queue, { oldUid: U, backupId: "bk-safari", currentUid: U });
  check(q2.reason, "same-as-current", "B5: 今の UID（保護した UID）は列に入らない");
  const attacker = await createDevice("B-attacker", { ns, signIn: anon });
  const adb = attacker.client.database;
  check(
    await allowed(update(ref(adb, "backups/bk-owner-pwa"), { schemaVersion: 1, currentUid: attacker.uid, updatedAt: serverTimestamp(), payload: {}, ownerClaim: { secret: "x".repeat(40), at: serverTimestamp() }, ownerSecret: "y".repeat(40) })),
    "拒否",
    "B5: 秘密を知らない他人は持ち主を取り戻せない"
  );
  check(await allowed(set(ref(adb, `uidSupersession/${U}`), { newUid: attacker.uid, backupId: "bk-owner-pwa", recordedAt: serverTimestamp() })), "拒否", "B5: 他人は本人の対応表を作れない（本人のデータを消せない）");
  check(await allowed(set(ref(adb, `admins/${attacker.uid}`), true)), "拒否", "B5: 他人は管理者になれない");

  group("B6 パスワードを忘れた（再設定メール）");
  const fp = protectionFor(other);
  const neutral = await fp.requestPasswordReset({ email: OWNER_EMAIL, confirmed: true });
  check([neutral.ok, neutral.sent], [true, true], "B6: 再設定メールを送れる（エミュレータでは送信の記録を確認）");
  const codes = (await listOobCodes()).filter((c) => c.email === OWNER_EMAIL && c.requestType === "PASSWORD_RESET");
  check(codes.length >= 1, true, "B6: エミュレータに PASSWORD_RESET のメールが記録された");
  check(other.client.auth.currentUser.uid, V, "B6: 送っても今のログイン（UID）は変わらない");
  const unknownMail = await fp.requestPasswordReset({ email: "nobody@example.com", confirmed: true });
  check([unknownMail.ok, unknownMail.reason], [true, accountRecovery.PASSWORD_RESET_NEUTRAL_MESSAGE], "B6: 登録の無いメールでも同じ文言（登録の有無を漏らさない）");
  const oob = codes[codes.length - 1]?.oobCode;
  const NEW_PASS = "brand-new-pass-2";
  check(await codeOf(authSdk.confirmPasswordReset(other.client.auth, oob, NEW_PASS)), "ok", "B6: メールのリンク（コード）で新しいパスワードを決められる");
  const afterReset = await createDevice("B-after-reset", { ns, signIn: withEmail(OWNER_EMAIL, NEW_PASS) });
  check(afterReset.uid, U, "B6: 新しいパスワードでログインしても同じ UID");
  check(["auth/wrong-password", "auth/invalid-credential", "auth/invalid-login-credentials"].includes(await codeOf(authSdk.signInWithEmailAndPassword(afterReset.client.auth, OWNER_EMAIL, OWNER_PASS))), true, "B6: 古いパスワードは使えなくなる");

  group("B7 Console で「メール/パスワード」が無効のとき");
  const disabledOk = await setEmailProviderEnabled(false);
  // エミュレータが無効化を守るかを、使い捨てのメールで確かめる（守らない版では結び付いてしまうので、その端末は以後使わない）
  const probe = await createDevice("B-disabled-probe", { ns, signIn: anon });
  const probeCode = await codeOf(authSdk.linkWithCredential(probe.client.auth.currentUser, authSdk.EmailAuthProvider.credential("probe@example.com", "password-1234")));
  const enforced = disabledOk && probeCode === "auth/operation-not-allowed";
  console.log(`   ※ Auth エミュレータは「メール/パスワード無効」を${enforced ? "再現できました" : `再現しません（結果：${probeCode}）。本番の Firebase が返す auth/operation-not-allowed を、本物の匿名ユーザーに対して差し込んで確認します`}`);
  const off = await createDevice("B-disabled", { ns, signIn: anon });
  const offUid = off.uid;
  const offProtection = enforced
    ? protectionFor(off)
    : accountRecovery.createAccountProtection({
        getCurrentUser: () => off.client.auth.currentUser,
        makeEmailCredential: (email, password) => authSdk.EmailAuthProvider.credential(email, password),
        linkWithCredential: async () => {
          throw Object.assign(new Error("OPERATION_NOT_ALLOWED"), { code: "auth/operation-not-allowed" });
        },
        signInWithEmailAndPassword: async () => {
          throw Object.assign(new Error("OPERATION_NOT_ALLOWED"), { code: "auth/operation-not-allowed" });
        },
        sendPasswordResetEmail: async () => {
          throw Object.assign(new Error("OPERATION_NOT_ALLOWED"), { code: "auth/operation-not-allowed" });
        },
      });
  const rOff = await offProtection.protectWithEmail({ email: "off@example.com", password: "password-1234", confirmed: true });
  check([rOff.ok, rOff.code, rOff.reason.includes("Console")], [false, "auth/operation-not-allowed", true], "B7: 結び付けは失敗し、「Console で『メール/パスワード』を有効にする必要がある」と説明");
  check([off.client.auth.currentUser.uid, off.client.auth.currentUser.isAnonymous], [offUid, true], "B7: 失敗しても同じ匿名 UID のまま");
  const reOff = await offProtection.reloginWithEmail({ email: OWNER_EMAIL, password: "x", confirmed: true });
  check([reOff.ok, off.client.auth.currentUser.uid], [false, offUid], "B7: ログインし直しも失敗し、切り替わらない");
  const resetOff = await offProtection.requestPasswordReset({ email: OWNER_EMAIL, confirmed: true });
  check([resetOff.ok, resetOff.sent, resetOff.reason.includes("Console")], [false, false, true], "B7: 再設定メールも「有効にする必要がある」と説明（送ったことにしない）");
  await setEmailProviderEnabled(true);
  await closeDevice(probe);

  await Promise.all([iphone, other, flaky, fresh, safari, attacker, afterReset, off].map(closeDevice));
}

// ===========================================================================
// D. パネル（js/accountRecoveryPanel.js）：一般の利用者には「保護する」を出さない・管理者を付与する入口が無い
// ===========================================================================
class FakeNode {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.attributes = {};
    this.dataset = {};
    this.hidden = false;
    this.textContent = "";
    this.className = "";
    this.listeners = {};
    this.disabled = false;
    this.value = "";
    this.open = false;
    const self = this;
    this.classList = {
      add: (c) => {
        self.className = `${self.className} ${c}`.trim();
      },
      contains: (c) => self.className.split(/\s+/).includes(c),
      toggle: () => {},
    };
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  appendChild(n) {
    this.children.push(n);
    return n;
  }
  append(...ns) {
    ns.forEach((n) => this.children.push(n));
  }
  set innerHTML(_v) {
    this.children = [];
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  all() {
    return [this, ...this.children.flatMap((c) => c.all())];
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  querySelectorAll(sel) {
    const nodes = this.all().slice(1);
    if (sel.startsWith(".")) return nodes.filter((n) => n.classList.contains(sel.slice(1)));
    const m = sel.match(/^\[data-role="(.+)"\]$/);
    if (m) return nodes.filter((n) => n.dataset.role === m[1]);
    return nodes.filter((n) => n.tagName === sel.toUpperCase());
  }
}

async function runPanelScenario() {
  group("D パネル：一般の利用者・管理者の出し分け");
  const prevDocument = globalThis.document;
  const prevLocation = globalThis.location;
  try {
    globalThis.document = Object.assign(prevDocument, { createElement: (tag) => new FakeNode(tag) });
    globalThis.location = { search: "" };
    localStorage.clear();
    const panelMod = await import(`${REPO_JS}accountRecoveryPanel.js?panel=general`);
    const container = new FakeNode("div");
    const ctx = {
      getMyUid: () => "GENERAL-UID",
      isAdmin: () => false,
      getRememberedAdminUids: () => [],
      getUidMergeQueue: () => [],
      getPendingUidMerge: () => null,
    };
    panelMod.mountAccountRecoveryPanel(container, ctx);
    const texts = container.all().map((n) => n.textContent).join("\n");
    const protection = container.querySelector('[data-role="account-protection"]');
    const protectOnly = protection.querySelectorAll(".is-protect-only");
    check(protectOnly.length > 0 && protectOnly.every((n) => n.hidden), true, "D1: 一般の利用者には「このアカウントを保護する」とその説明を出さない");
    check(protection.querySelector("summary").textContent, "🔐 保護したメールでログインし直す（保護済みの方だけ）", "D1: 一般の利用者に見えるのは折りたたまれた「ログインし直す」の見出しだけ（保存領域が消えた後に使うため常設）");
    check(protection.open, false, "D1: 折りたたまれたまま（自分で開かない限り入力欄は見えない）");
    check(/管理者にする|管理者に追加|admins に書|管理者権限を付与/.test(texts.replace(/アプリから自分を管理者にする方法はありません/g, "")), false, "D2: 管理者を付与するボタン・文言は無い");
    const buttons = container.all().filter((n) => n.tagName === "BUTTON").map((n) => n.textContent);
    check(buttons.some((t) => /管理者/.test(t)), false, `D2: ボタンは ${buttons.length} 個、管理者に関わる操作は無い（コピーのみ）`);
    const src = readRepoText("js/accountRecoveryPanel.js") + readRepoText("js/accountRecovery.js");
    check(/ref\([^)]*admins/.test(src), false, "D2: パネルとアカウント保護のコードに admins への読み書きが無い");
    ctx.isAdmin = () => true;
    panelMod.refreshAccountRecoveryPanel();
    check(protectOnly.every((n) => n.hidden === false), true, "D3: 管理者と確認できた後は「保護する」を出す");
    check(protection.querySelector("summary").textContent.startsWith("🛡 アカウントを保護する"), true, "D3: 見出しも「アカウントを保護する」になる");
  } finally {
    globalThis.document = prevDocument;
    globalThis.location = prevLocation;
  }
}

// ===========================================================================
async function main() {
  const started = Date.now();
  await clearAuthUsers();
  for (const kind of ["prod", "propAsIs", "propFixed"]) {
    await adminSet(NS[kind], "", null);
    await putRules(NS[kind], rulesFor(kind));
  }
  for (const kind of ["prod", "propAsIs", "propFixed"]) await runRulesAdversarial(kind);
  for (const kind of ["prod", "propAsIs", "propFixed"]) await runPresenceScenarios(kind);
  await runFallbackMemoryScenario();
  await runLegacyClientScenario();
  await runSharedUidSharingOffScenario();
  await runWriteBudgetScenario();
  await runAccountScenarios();
  await runPanelScenario();
  await runServerTimeScenario();

  const results = getResults();
  const failed = results.filter((r) => !r.pass);
  const byGroup = {};
  results.forEach((r) => {
    const key = r.group.split(" ")[0];
    byGroup[key] = byGroup[key] ?? { pass: 0, fail: 0 };
    byGroup[key][r.pass ? "pass" : "fail"] += 1;
  });
  console.log("\n--- 集計 ---");
  Object.entries(byGroup).forEach(([k, v]) => console.log(`${k}: ${v.pass}件成功 / ${v.fail}件失敗`));
  console.log(`合計: ${results.length}件中 ${results.length - failed.length}件成功 / ${failed.length}件失敗（${Math.round((Date.now() - started) / 1000)}秒）`);
  if (globalThis.__writeBudget) console.log(`書き込み量の実測: ${JSON.stringify(globalThis.__writeBudget)}`);
  if (failed.length) {
    console.log("失敗:");
    failed.forEach((f) => console.log(` - [${f.group}] ${f.description}`));
  }
  process.exit(failed.length ? 1 : 0);
}

process.on("uncaughtException", (error) => {
  check(String(error?.message ?? error), "（想定外の例外なし）", "想定外の例外が起きていない");
});
process.on("unhandledRejection", (error) => {
  check(String(error?.message ?? error), "（想定外の例外なし）", "処理されない Promise の失敗が起きていない");
});

main().catch((error) => {
  console.error("検証の実行に失敗しました", error);
  process.exit(2);
});
