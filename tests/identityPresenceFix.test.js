// 【2026-10-28新設・本人の実機報告】プレイヤーID（匿名UID）の変化・フレンド一覧の重複「がしお」・
// オンライン表示の不具合（オンラインのまま／オフラインにならない／オンラインなのにオフライン／
// 最終接続がおかしい／「記録なし」）・管理者機能の喪失 に対する修正の回帰テスト。
//
// Firebase には一切接続しない。本物の Firebase の動き（onDisconnect・serverTimestamp・push キー・
// 匿名ログインの保存領域）を、小さな偽物（FakePresenceServer・FakeAuthStorage）で再現し、
// 純粋関数（js/presencePayloads.js・js/fanProfilesIdentity.js・js/identityBootstrap.js・js/adminAccess.js）
// を通して画面に出る状態を検証する。Firebase SDK を読み込むファイル（presenceSync.js 等）は
// ソースをテキストとして読む構造チェックだけにする（このプロジェクトの既存テストと同じ方針）。
// tests.html からも、node（このファイルを import して runIdentityPresenceFixTests() を呼ぶ薄い起動スクリプト）からも動く。
import {
  classifyPresenceEntry,
  buildPresenceDisplay,
  computeServerNowMs,
  computeIsOnlineForDisplay,
  buildPresenceStatusLabel,
  shouldWriteResumeHeartbeat,
  PRESENCE_STALE_CONNECTION_MS,
  PRESENCE_UNKNOWN_MAX_MS,
  PRESENCE_OFFLINE_GRACE_MS,
  PRESENCE_RESUME_HEARTBEAT_MIN_INTERVAL_MS,
} from "../js/presencePayloads.js";
import {
  collapseSamePlayerProfiles,
  annotateSameNameProfiles,
  buildProfileIdentityNote,
  collectMyKnownOldUids,
  shortUidSuffix,
  normalizeDisplayNameForCompare,
} from "../js/fanProfilesIdentity.js";
import {
  recordAuthUidObservation,
  summarizeAuthUidHistory,
  describeAuthUidChangeEvent,
  normalizeAuthUidHistory,
  createIdentityBootstrapRunner,
  IDENTITY_STATE,
  AUTH_UID_HISTORY_MAX_ENTRIES,
} from "../js/identityBootstrap.js";
import {
  describeAdminDiagnostics,
  rememberAdminUid,
  isAdminByRules,
  evaluateAdminsNodeAccess,
  ADMIN_REMEMBERED_UIDS_MAX,
} from "../js/adminAccess.js";
import { assertEqual } from "./test-utils.js";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// ---------------------------------------------------------------------------
// 偽の presence サーバー（Firebase Realtime Database の presence/{uid} 部分だけを再現）
// ・connect() … .info/connected=true の瞬間の処理（接続ノードを push・lastSeen を serverTimestamp・onDisconnect 予約）
// ・heartbeat() … 2分ごとの lastSeen 更新
// ・serverDetectsDisconnect() … サーバーが切断を検知して onDisconnect を実行（接続ノード削除＋lastSeen）
// ・loseSocketSilently() … onDisconnect が実行されないまま接続ノードが残る（「ゆき」の残骸）
// 時刻はすべてサーバー時刻。端末の時計のずれは viewer 側で別に与える。
// ---------------------------------------------------------------------------
class FakePresenceServer {
  constructor(startMs) {
    this.now = startMs;
    this.data = {}; // { [uid]: { connections: {id: true}, lastSeen } }
    this.pending = []; // onDisconnect 予約 [{ uid, connectionId }]
    this.seq = 0;
    this.writeCount = 0;
  }
  advance(ms) {
    this.now += ms;
  }
  entry(uid) {
    if (!this.data[uid]) this.data[uid] = { connections: {} };
    return this.data[uid];
  }
  connect(uid, { allowed = true } = {}) {
    const connectionId = `conn-${(this.seq += 1)}`;
    if (!allowed) return { connectionId, ok: false }; // Rules に拒否（publicProfiles/{uid} が無い等）
    const e = this.entry(uid);
    e.connections = { ...(e.connections ?? {}), [connectionId]: true };
    e.lastSeen = this.now;
    this.pending.push({ uid, connectionId });
    this.writeCount += 2;
    return { connectionId, ok: true };
  }
  heartbeat(uid) {
    this.entry(uid).lastSeen = this.now;
    this.writeCount += 1;
  }
  serverDetectsDisconnect(uid, connectionId) {
    const e = this.entry(uid);
    if (e.connections) delete e.connections[connectionId];
    e.lastSeen = this.now;
    this.pending = this.pending.filter((p) => !(p.uid === uid && p.connectionId === connectionId));
  }
  loseSocketSilently(uid, connectionId) {
    // 予約だけが消えて接続ノードは残る
    this.pending = this.pending.filter((p) => !(p.uid === uid && p.connectionId === connectionId));
  }
  snapshot(uid) {
    const e = this.data[uid];
    if (!e) return undefined;
    return JSON.parse(JSON.stringify(e));
  }
}

// 見る側の端末：端末時計のずれ（clockSkewMs）と、Firebase の .info/serverTimeOffset を持つ
function viewerNow(server, { clockSkewMs = 0, knowsOffset = true } = {}) {
  const localNow = server.now + clockSkewMs;
  return computeServerNowMs(localNow, knowsOffset ? -clockSkewMs : 0);
}

function stateOf(server, uid, viewer = {}) {
  return buildPresenceDisplay(server.snapshot(uid), viewerNow(server, viewer)).state;
}

function runPresenceStateTests() {
  // ---- 基本の5状態 ----
  const now = 1_800_000_000_000;
  assertEqual(classifyPresenceEntry(undefined, now).state, "none", "P0: 記録が無ければ「記録なし」");
  assertEqual(classifyPresenceEntry({}, now).state, "none", "P0: 接続も lastSeen も無ければ「記録なし」");
  assertEqual(buildPresenceDisplay(undefined, now).text, "記録なし", "P0: 「記録なし」の文言");
  assertEqual(classifyPresenceEntry({ connections: { a: true }, lastSeen: now - 2 * MIN }, now).state, "online", "P1: 接続あり＋2分前の生存記録ならオンライン");
  assertEqual(classifyPresenceEntry({ connections: { a: true }, lastSeen: now, isPlaying: true }, now).state, "playing", "P1: isPlaying ならプレイ中");
  assertEqual(classifyPresenceEntry({ connections: {}, lastSeen: now - 3 * HOUR }, now).state, "offline", "P2: 接続なしならオフライン");
  assertEqual(buildPresenceDisplay({ connections: {}, lastSeen: now - 3 * HOUR }, now).text, "3時間前", "P2: オフラインの文言は従来どおり「3時間前」");
  const unknown = buildPresenceDisplay({ connections: { a: true }, lastSeen: now - 20 * MIN }, now);
  assertEqual(unknown.state, "unknown", "P3: 接続ノードはあるが20分更新なし＝通信不明");
  assertEqual(unknown.text, "通信不明（最終確認 20分前）", "P3: 通信不明の文言に最終確認時刻を添える");
  assertEqual(unknown.isOnline, false, "P3: 通信不明はオンライン扱いにしない（「一緒に遊ぶ」も出さない）");
  assertEqual(
    classifyPresenceEntry({ connections: { a: true }, lastSeen: now - PRESENCE_UNKNOWN_MAX_MS - 1 }, now).state,
    "offline",
    "P4: 1時間を超えて更新の無い残骸は確実に切断済み＝オフライン"
  );
  assertEqual(buildPresenceDisplay({ connections: { a: true }, lastSeen: now - 8 * DAY }, now).text, "8日前", "P4: ゆきの残骸ケースは従来どおり「8日前」");
  assertEqual(classifyPresenceEntry({ connections: { a: true } }, now).state, "online", "P5: lastSeen の無い古い形式は従来どおり接続ノードで判定");
  assertEqual(classifyPresenceEntry({ connections: {}, lastSeen: now - 1000 }, now).state, "online", "P5: 瞬断の猶予（12秒）は従来どおりオンライン相当");
  assertEqual(classifyPresenceEntry({ connections: {}, lastSeen: now - PRESENCE_OFFLINE_GRACE_MS - 1 }, now).state, "offline", "P5: 猶予を過ぎればオフライン");

  // ---- 既存関数との整合（互換） ----
  [
    { connections: { a: true }, lastSeen: now - 14 * MIN },
    { connections: { a: true }, lastSeen: now - PRESENCE_STALE_CONNECTION_MS - 1 },
    { connections: {}, lastSeen: now - 5000 },
    { connections: {}, lastSeen: now - HOUR },
    undefined,
    { connections: { a: true } },
  ].forEach((entry, index) => {
    assertEqual(
      buildPresenceDisplay(entry, now).isOnline,
      computeIsOnlineForDisplay(entry, now),
      `P6-${index}: 新しい表示の isOnline は既存の computeIsOnlineForDisplay と一致する（並び順・招待と食い違わない）`
    );
  });
  assertEqual(buildPresenceStatusLabel({ connections: { a: true }, lastSeen: now }, now), { text: "オンライン", isOnline: true, isPlaying: false }, "P6: 既存の buildPresenceStatusLabel の戻り値の形は変えていない");

  // ---- 将来（Rules 変更後）の接続ごとの時刻 ----
  assertEqual(classifyPresenceEntry({ connections: { a: now - 30 * MIN, b: now - MIN }, lastSeen: now - 30 * MIN }, now).state, "online", "P7: 接続ごとの時刻：1台でも新しければオンライン");
  assertEqual(classifyPresenceEntry({ connections: { a: now - 30 * MIN }, lastSeen: now - 30 * MIN }, now).state, "unknown", "P7: 接続ごとの時刻が全部古ければ通信不明");
  assertEqual(classifyPresenceEntry({ connections: { a: now - 30 * MIN, b: true }, lastSeen: now - 30 * MIN }, now).state, "unknown", "P7: 時刻あり・なしが混在しても全部古ければ通信不明");

  // ---- 時刻：サーバー時刻基準 ----
  assertEqual(computeServerNowMs(1000, 250), 1250, "T1: 端末時刻＋オフセット");
  assertEqual(computeServerNowMs(1000, undefined), 1000, "T1: オフセット不明なら端末時刻");
  assertEqual(computeServerNowMs(1000, Number.NaN), 1000, "T1: 不正なオフセットは無視");
}

function runPresenceScenarioTests() {
  // S1. 通常：起動→接続→2分ごとの更新→アプリを閉じる（サーバーが切断検知）
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const { connectionId } = server.connect("A");
    assertEqual(stateOf(server, "A"), "online", "S1: 接続直後はオンライン");
    for (let i = 0; i < 10; i += 1) {
      server.advance(2 * MIN);
      server.heartbeat("A");
    }
    assertEqual(stateOf(server, "A"), "online", "S1: 20分遊び続けてもオンラインのまま");
    server.advance(5000);
    server.serverDetectsDisconnect("A", connectionId);
    server.advance(20 * 1000);
    assertEqual(stateOf(server, "A"), "offline", "S1: 閉じた後はオフライン");
    assertEqual(buildPresenceDisplay(server.snapshot("A"), viewerNow(server)).text, "たった今", "S1: 最終接続は閉じた時刻（サーバー時刻）");
  }

  // S2. 見る側の端末の時計が20分進んでいる（以前は「オンラインなのにオフライン」になった）
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    server.connect("A");
    server.advance(MIN);
    assertEqual(stateOf(server, "A", { clockSkewMs: 20 * MIN, knowsOffset: false }), "unknown", "S2: 修正前相当（端末時刻だけ）だと誤判定される");
    assertEqual(stateOf(server, "A", { clockSkewMs: 20 * MIN, knowsOffset: true }), "online", "S2: サーバー時刻オフセットを使えば正しくオンライン");
    assertEqual(stateOf(server, "A", { clockSkewMs: -20 * MIN, knowsOffset: true }), "online", "S2: 時計が遅れていても正しくオンライン");
  }

  // S3. 2台（iPhone と PC）で同じプレイヤー：片方を閉じてもオンライン、両方閉じたらオフライン
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const phone = server.connect("A").connectionId;
    const pc = server.connect("A").connectionId;
    server.advance(MIN);
    server.serverDetectsDisconnect("A", phone);
    assertEqual(stateOf(server, "A"), "online", "S3: 1台閉じてももう1台が繋がっていればオンライン");
    server.advance(2 * MIN);
    server.heartbeat("A");
    server.advance(MIN);
    server.serverDetectsDisconnect("A", pc);
    server.advance(30 * 1000);
    assertEqual(stateOf(server, "A"), "offline", "S3: 全部の接続が消えたらオフライン");
  }

  // S4. 同じ端末で複数タブ
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const tab1 = server.connect("A").connectionId;
    server.connect("A");
    server.advance(MIN);
    server.serverDetectsDisconnect("A", tab1);
    assertEqual(stateOf(server, "A"), "online", "S4: タブを1つ閉じてもオンライン");
  }

  // S5. 通信断→再接続（地下鉄など）：瞬断中はちらつかず、再接続で新しい接続ノード
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const first = server.connect("A").connectionId;
    server.advance(MIN);
    server.serverDetectsDisconnect("A", first);
    server.advance(5000);
    assertEqual(stateOf(server, "A"), "online", "S5: 瞬断直後は猶予でオンライン相当（ちらつき防止）");
    server.advance(60 * 1000);
    assertEqual(stateOf(server, "A"), "offline", "S5: 通信断が続けばオフライン");
    server.connect("A");
    assertEqual(stateOf(server, "A"), "online", "S5: 再接続でオンラインに戻る");
  }

  // S6. iPhone でバックグラウンド／ロック：タイマーが止まり、少し後に iOS が通信を切る
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const conn = server.connect("A").connectionId;
    server.advance(MIN); // ここでロック。以後ハートビートなし
    server.advance(90 * 1000);
    assertEqual(stateOf(server, "A"), "online", "S6: ロック直後（通信が切れる前）はまだオンライン");
    server.serverDetectsDisconnect("A", conn);
    server.advance(MIN);
    assertEqual(stateOf(server, "A"), "offline", "S6: 通信が切れたらオフライン");
  }

  // S7. ロック中に onDisconnect が実行されなかった（接続ノードの残骸）：オンラインのままにならない
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const conn = server.connect("A").connectionId;
    server.advance(MIN);
    server.loseSocketSilently("A", conn);
    server.advance(10 * MIN);
    assertEqual(stateOf(server, "A"), "online", "S7: 15分以内は判断できずオンラインのまま（通常プレイの人を誤ってオフラインにしない余裕）");
    server.advance(10 * MIN);
    assertEqual(stateOf(server, "A"), "unknown", "S7: 20分たつと「通信不明」（以前は15分〜ずっと曖昧だった）");
    server.advance(2 * HOUR);
    assertEqual(stateOf(server, "A"), "offline", "S7: 1時間を超えればオフライン（最終接続の時刻を表示）");
  }

  // S8. 復帰時の即時更新（iOS の復帰直後に lastSeen が古いまま残らない）
  {
    const t = 1_800_000_000_000;
    assertEqual(shouldWriteResumeHeartbeat({ visibilityState: "visible", trackedUid: "A", nowMs: t, lastWrittenAtMs: t - 3 * MIN }), true, "S8: 3分ぶりに画面へ戻ったら1回だけ更新する");
    assertEqual(shouldWriteResumeHeartbeat({ visibilityState: "visible", trackedUid: "A", nowMs: t, lastWrittenAtMs: t - 10 * 1000 }), false, "S8: 直前に書いていれば書かない（書き込みを増やさない）");
    assertEqual(shouldWriteResumeHeartbeat({ visibilityState: "hidden", trackedUid: "A", nowMs: t, lastWrittenAtMs: 0 }), false, "S8: 隠れたときは書かない");
    assertEqual(shouldWriteResumeHeartbeat({ visibilityState: "visible", trackedUid: null, nowMs: t, lastWrittenAtMs: 0 }), false, "S8: 在席を送っていない（公開OFF）なら書かない");
    assertEqual(PRESENCE_RESUME_HEARTBEAT_MIN_INTERVAL_MS, 30000, "S8: 復帰時の更新は30秒に1回まで");
  }

  // S9. UID が変わった直後：公開プロフィールが無いので在席ノードが Rules に拒否される → プロフィール作成後に張り直し
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const denied = server.connect("NEW", { allowed: false });
    assertEqual(denied.ok, false, "S9: 公開プロフィールが無い間は在席ノードを書けない（Rules）");
    assertEqual(stateOf(server, "NEW"), "none", "S9: その間は「記録なし」");
    // 修正後：公開プロフィール作成成功 → needsFriendPresenceRearm() → 張り直し
    server.connect("NEW", { allowed: true });
    assertEqual(stateOf(server, "NEW"), "online", "S9: 張り直し後はオンライン");
  }

  // S10. 旧UIDの presence は「4日前」のまま残る（重複カードは下の重複まとめで隠す）
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    const old = server.connect("OLD").connectionId;
    server.advance(MIN);
    server.serverDetectsDisconnect("OLD", old);
    server.advance(4 * DAY);
    server.connect("NEW");
    assertEqual(buildPresenceDisplay(server.snapshot("OLD"), viewerNow(server)).text, "4日前", "S10: 旧UIDは「4日前」（本人のスクリーンショットと同じ）");
    assertEqual(stateOf(server, "NEW"), "online", "S10: 新UIDはオンライン");
  }

  // S11. 書き込み量の見積もり（1人が1時間アプリを開いていた場合）
  {
    const server = new FakePresenceServer(1_800_000_000_000);
    server.connect("A");
    for (let i = 0; i < 30; i += 1) {
      server.advance(2 * MIN);
      server.heartbeat("A");
    }
    assertEqual(server.writeCount, 32, "S11: 1時間あたり接続2＋ハートビート30＝32回（今回の修正で常時の書き込みは増やしていない）");
  }
}

// ---------------------------------------------------------------------------
// 偽の匿名ログイン保存領域（端末）。Firebase 匿名認証は「保存領域ごと」にUIDを持つ。
// ---------------------------------------------------------------------------
class FakeDevice {
  constructor() {
    this.storage = { safari: { authUid: null, local: {} }, pwa: { authUid: null, local: {} } };
    this.uidSeq = 0;
    this.history = { safari: null, pwa: null };
  }
  // 起動：保存領域にログイン情報があればそれ、無ければ新しい匿名UID（signInAnonymously）
  launch(where, { idbReadFails = false } = {}) {
    const box = this.storage[where];
    let created = false;
    const probe = { indexedDbHasAuthUser: box.authUid !== null, localStorageHasAuthUser: false };
    if (!box.authUid || idbReadFails) {
      box.authUid = `uid-${(this.uidSeq += 1)}`;
      created = true;
    }
    const { history, changed } = recordAuthUidObservation(this.history[where], {
      uid: box.authUid,
      nowMs: 1_800_000_000_000 + this.uidSeq * DAY,
      createdNewAnonymousUser: created,
      standalone: where === "pwa",
      probe: created ? probe : null,
    });
    this.history[where] = history;
    return { uid: box.authUid, created, changed };
  }
  swUpdate() {
    // sw.js の activate は Cache Storage だけを消す（IndexedDB・localStorage は触らない）
  }
  clearSiteData(where) {
    this.storage[where] = { authUid: null, local: {} };
    this.history[where] = null;
  }
  loseAuthOnly(where) {
    // Firebase 側でユーザーが削除された／IndexedDB だけ消えた（localStorage は残る）
    this.storage[where].authUid = null;
  }
}

function runAuthScenarioTests() {
  // A1. 再起動・PWA再起動・Safari再読み込み・SW更新：同じ保存領域ならUIDは変わらない
  {
    const device = new FakeDevice();
    const first = device.launch("pwa");
    assertEqual(first.created, true, "A1: 初回は新しい匿名UIDを作る");
    assertEqual(device.launch("pwa").uid, first.uid, "A1: PWAを閉じて開き直しても同じUID");
    device.swUpdate();
    assertEqual(device.launch("pwa").uid, first.uid, "A1: Service Worker が更新されても同じUID（SW はログイン情報を消さない）");
    assertEqual(summarizeAuthUidHistory(device.history.pwa).uidChangeCount, 0, "A1: 変化の記録は0回");
  }

  // A2. Safari とホーム画面アプリ（PWA）は保存領域が別 → 別のUID
  {
    const device = new FakeDevice();
    const pwa = device.launch("pwa");
    const safari = device.launch("safari");
    assertEqual(pwa.uid !== safari.uid, true, "A2: Safari で開くとPWAとは別のUIDになる（iOSの仕様）");
    assertEqual(device.launch("safari").uid, safari.uid, "A2: Safari の再読み込みでは変わらない");
  }

  // A3. ログイン情報だけが失われた（localStorage のデータは残る）→ 新UID、原因の記録が残る
  {
    const device = new FakeDevice();
    const before = device.launch("pwa");
    device.loseAuthOnly("pwa");
    const after = device.launch("pwa");
    assertEqual(after.uid !== before.uid && after.created, true, "A3: 新しい匿名UIDが作られる");
    const summary = summarizeAuthUidHistory(device.history.pwa);
    assertEqual(summary.uidChangeCount, 1, "A3: 変化が1回記録される");
    assertEqual(summary.lastChange.fromUid, before.uid, "A3: 旧UIDが記録される");
    assertEqual(summary.lastChange.createdNewAnonymousUser, true, "A3: 新規作成だったことが記録される");
    assertEqual(summary.lastChange.standalone, true, "A3: PWA起動だったことが記録される");
    assertEqual(summary.lastChangeReason.includes("見つからず"), true, "A3: 原因の推定：保存領域が消えた／Firebase側で削除");
  }

  // A4. 保存領域にログイン情報が残っているのに読めなかった（WebKit の IndexedDB 不調の疑い）
  {
    const device = new FakeDevice();
    device.launch("pwa");
    device.launch("pwa", { idbReadFails: true });
    const summary = summarizeAuthUidHistory(device.history.pwa);
    assertEqual(summary.lastChange.storedAuthUserInIndexedDb, true, "A4: 新規作成の直前に IndexedDB に以前のログイン情報があった");
    assertEqual(summary.lastChangeReason.includes("読み込めず"), true, "A4: 原因の推定：保存領域の読み込み失敗");
  }

  // A5. サイトデータ消去：端末の記録ごと消えるので、旧UIDの記録は残らない（引き継ぎコードでの復元が必要）
  {
    const device = new FakeDevice();
    device.launch("pwa");
    device.clearSiteData("pwa");
    device.launch("pwa");
    assertEqual(summarizeAuthUidHistory(device.history.pwa).uidChangeCount, 0, "A5: サイトデータ消去後は旧UIDを知る手段が端末に無い");
  }

  // A6. 履歴の形・上限
  {
    let history = null;
    for (let i = 0; i < AUTH_UID_HISTORY_MAX_ENTRIES + 5; i += 1) {
      history = recordAuthUidObservation(history, { uid: `u${i}`, nowMs: i, createdNewAnonymousUser: true }).history;
    }
    assertEqual(history.entries.length, AUTH_UID_HISTORY_MAX_ENTRIES, "A6: UIDの履歴は最大10件");
    assertEqual(history.events.length <= 10, true, "A6: 変化の記録は最大10件");
    const same = recordAuthUidObservation(history, { uid: `u${AUTH_UID_HISTORY_MAX_ENTRIES + 4}`, nowMs: 999 });
    assertEqual(same.changed, false, "A6: 同じUIDの再観測は変化扱いにしない");
    const returned = recordAuthUidObservation(history, { uid: "u10", nowMs: 1000 });
    assertEqual(returned.history.events[returned.history.events.length - 1].type, "uid-returned", "A6: 以前のUIDに戻ったら「戻った」と記録");
    assertEqual(normalizeAuthUidHistory("壊れた値"), { entries: [], events: [] }, "A6: 壊れた保存値でも落ちない");
    const frozen = Object.freeze({ entries: Object.freeze([Object.freeze({ uid: "x", firstSeenAt: 1, lastSeenAt: 1 })]), events: Object.freeze([]) });
    assertEqual(recordAuthUidObservation(frozen, { uid: "x", nowMs: 5 }).history.entries[0].lastSeenAt, 5, "A6: 元の履歴を書き換えずに新しい履歴を返す");
    assertEqual(describeAuthUidChangeEvent({ type: "uid-changed", createdNewAnonymousUser: false }).includes("復元"), true, "A6: 新規作成でない変化（別の保存領域）も区別して説明する");
  }
}

// ---------------------------------------------------------------------------
// 起動時の本人確認（UIDが変わったときに、ownerSecret による安全な引き継ぎへ進むか）
// ---------------------------------------------------------------------------
async function runRecoveryFlowTests() {
  // R1. 新UID＋端末に backupId・ownerSecret がある → claim（ownerSecret）→ 旧UIDの引き継ぎ → ready
  {
    const calls = [];
    let pending = false;
    const runner = createIdentityBootstrapRunner({
      waitAuthReady: async () => {},
      getCurrentUid: () => "uid-new",
      isOffline: () => false,
      getBackupId: () => "backup-1",
      syncBackupOwnership: async () => {
        calls.push("claim-with-owner-secret");
        pending = true;
        return { status: "claimed", previousUid: "uid-old" };
      },
      hasPendingMigration: () => pending,
      runMigration: async () => {
        calls.push("migrate");
        return { status: "completed" };
      },
    });
    assertEqual(await runner.ensure(), IDENTITY_STATE.READY, "R1: ownerSecret で取り戻せれば ready");
    assertEqual(calls, ["claim-with-owner-secret", "migrate"], "R1: 新UIDで何かを書く前に、所有権の回復→旧UIDの引き継ぎの順で進む");
  }
  // R2. ownerSecret が合わない（他人・古い端末）→ 自動で結び付けない（unresolved）
  {
    const runner = createIdentityBootstrapRunner({
      waitAuthReady: async () => {},
      getCurrentUid: () => "uid-new",
      isOffline: () => false,
      getBackupId: () => "backup-1",
      syncBackupOwnership: async () => ({ status: "denied", previousUid: null }),
      hasPendingMigration: () => false,
      runMigration: async () => ({ status: "none" }),
    });
    assertEqual(await runner.ensure(), IDENTITY_STATE.UNRESOLVED, "R2: 秘密が無ければ自動で結び付けない（管理者の付け替えか引き継ぎコードが必要）");
  }
  // R3. 旧UIDのランキング引き継ぎが終わらない間は ready にしない（重複を作らない）
  {
    const runner = createIdentityBootstrapRunner({
      waitAuthReady: async () => {},
      getCurrentUid: () => "uid-new",
      isOffline: () => false,
      getBackupId: () => "backup-1",
      syncBackupOwnership: async () => ({ status: "claimed", previousUid: "uid-old" }),
      hasPendingMigration: () => true,
      runMigration: async () => ({ status: "leaderboard-incomplete", errors: ["x"] }),
    });
    assertEqual(await runner.ensure(), IDENTITY_STATE.MIGRATING, "R3: 引き継ぎ未完了なら migrating のまま（次の機会に再試行）");
  }
  // R4. バックアップからの復元（backupId はあるが通信できない）→ pending で待つ
  {
    const runner = createIdentityBootstrapRunner({
      waitAuthReady: async () => {},
      getCurrentUid: () => "uid-new",
      isOffline: () => true,
      getBackupId: () => "backup-1",
      syncBackupOwnership: async () => ({ status: "synced" }),
      hasPendingMigration: () => false,
      runMigration: async () => ({ status: "none" }),
    });
    assertEqual(await runner.ensure(), IDENTITY_STATE.PENDING, "R4: オフラインなら何も書かずに待つ");
  }
}

// ---------------------------------------------------------------------------
// フレンド一覧：同じプレイヤーの重複・同じ名前の別プレイヤー
// ---------------------------------------------------------------------------
const KEY_GASHIO = "k".repeat(64);
const KEY_OTHER = "z".repeat(64);
function profile(uid, displayName, extra = {}) {
  return { uid, displayName, identityKey: null, updatedAt: null, unlockedAchievementIds: [], ...extra };
}

function runFriendListTests() {
  // F1. 本人の状況の再現：「がしお」（新UID・オンライン）と「がしお」（旧UID・4日前）。同じ identityKey
  {
    const profiles = [
      profile("OLD-uid-0001", "がしお", { identityKey: KEY_GASHIO, updatedAt: 1 }),
      profile("XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", "がしお", { identityKey: KEY_GASHIO, updatedAt: 2 }),
      profile("nanashi-1", "名無しのファン"),
    ];
    // 【2026-10-28改訂】identityKey は誰でも書き写せるため、一致だけでは隠さない。改ざんできない証拠（対応表）があるときだけまとめる
    const rank = { "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72": { online: true, lastSeen: 10 }, "OLD-uid-0001": { online: false, lastSeen: 1 } };
    const friendNoProof = collapseSamePlayerProfiles(profiles, { myUid: "friend-uid", presenceRankByUid: rank });
    assertEqual(friendNoProof.profiles.map((p) => p.uid), ["OLD-uid-0001", "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", "nanashi-1"], "F1: 対応表が読めない間は、本人キーが同じでも隠さない（安全側）");
    assertEqual(friendNoProof.profiles[0].unverifiedSameAsUid, "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", "F1: 旧カードには「以前のIDかもしれません（未確認）」の補足");
    const viewedByFriend = collapseSamePlayerProfiles(profiles, {
      myUid: "friend-uid",
      supersessionLinks: { "OLD-uid-0001": "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72" },
      presenceRankByUid: rank,
    });
    assertEqual(viewedByFriend.profiles.map((p) => p.uid), ["XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", "nanashi-1"], "F1: 対応表（uidSupersession）が読めれば、友だちから見ても「がしお」は1人");
    assertEqual(viewedByFriend.hidden, [{ uid: "OLD-uid-0001", primaryUid: "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", reason: "superseded" }], "F1: 隠したのは旧UIDだけ（データは消さない）");
    assertEqual(viewedByFriend.profiles[0].mergedUids, ["OLD-uid-0001"], "F1: 代表カードにまとめた旧UIDを記録");
    const viewedByMe = collapseSamePlayerProfiles(profiles, { myUid: "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", myKnownOldUids: ["OLD-uid-0001"] });
    assertEqual(viewedByMe.profiles.map((p) => p.uid), ["XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", "nanashi-1"], "F1: 本人から見ると（端末が旧UIDを知っている）、自分の今のカードが必ず代表");
  }

  // F2. 引き継ぎ済み（completedUidMerges）・確認待ち（pendingUidMerge）の旧UIDは、identityKey が無い古いプロフィールでも隠す
  {
    const profiles = [profile("OLD", "がしお"), profile("NEW", "がしお", { identityKey: KEY_GASHIO })];
    const oldUids = collectMyKnownOldUids({ currentUid: "NEW", pendingOldUid: "OLD", completedOldUids: ["OLDER"], lastKnownUid: "NEW" });
    assertEqual(oldUids, ["OLD", "OLDER"], "F2: 端末が知る自分の旧UID（今のUIDは含めない）");
    const result = collapseSamePlayerProfiles(profiles, { myUid: "NEW", myKnownOldUids: oldUids });
    assertEqual(result.profiles.map((p) => p.uid), ["NEW"], "F2: 自分の旧UIDのカードは出さない");
    assertEqual(result.hidden[0].reason, "my-old-uid", "F2: 理由は「自分の旧UID」");
    const beforeMyProfile = collapseSamePlayerProfiles([profile("OLD", "がしお")], { myUid: "NEW", myKnownOldUids: ["OLD"] });
    assertEqual(beforeMyProfile.profiles.map((p) => p.uid), ["OLD"], "F2: 今のプロフィールがまだ無い間は旧カードを隠さない（自分が一覧から消えない）");
  }

  // F3. 同じ名前の別プレイヤーは絶対にまとめない。短い印で見分けられるようにする
  {
    const profiles = [
      profile("aaaa-1111", "がしお", { identityKey: KEY_GASHIO }),
      profile("bbbb-2222", "がしお", { identityKey: KEY_OTHER }),
      profile("cccc-3333", "がしお"),
      profile("dddd-4444", "ゆき"),
    ];
    const collapsed = collapseSamePlayerProfiles(profiles, { myUid: "aaaa-1111" });
    assertEqual(collapsed.profiles.length, 4, "F3: 名前が同じでも identityKey が違えば3人とも表示");
    const annotated = annotateSameNameProfiles(collapsed.profiles);
    assertEqual(annotated.map((p) => p.sameNameSuffix ?? null), ["1111", "2222", "3333", null], "F3: 同じ名前のカードにだけUID末尾4文字の印");
    assertEqual(buildProfileIdentityNote(annotated[0], { myUid: "aaaa-1111" }), "#1111（あなた）・同じ名前の別プレイヤーがいます", "F3: 自分のカードの補足");
    assertEqual(buildProfileIdentityNote(annotated[1], { myUid: "aaaa-1111" }), "#2222・同じ名前の別プレイヤー", "F3: 他人のカードの補足");
    assertEqual(buildProfileIdentityNote(annotated[3]), null, "F3: 名前が重ならなければ補足なし");
    assertEqual(
      annotateSameNameProfiles([profile("x1", "ガシオ "), profile("x2", "ｶﾞｼｵ"), profile("x3", "ガシオ"), profile("x4", "がしお")]).map((p) => p.sameNameSuffix ?? null),
      ["x1", "x2", "x3", null],
      "F3: 空白・半角カナの違いは同じ名前として印を付ける（ひらがなとカタカナは別の名前。まとめはしない）"
    );
    assertEqual(normalizeDisplayNameForCompare(null), "", "F3: 名前が無くても落ちない");
  }

  // F4. 管理者には旧UIDのカードも「以前のID」と明記して残す（削除ボタンで整理できるように）
  {
    const profiles = [profile("OLD-x9z1", "がしお", { identityKey: KEY_GASHIO }), profile("NEW-ab12", "がしお", { identityKey: KEY_GASHIO })];
    const result = collapseSamePlayerProfiles(profiles, { myUid: "NEW-ab12", myKnownOldUids: ["OLD-x9z1"], keepHiddenForAdmin: true });
    assertEqual(result.profiles.length, 2, "F4: 管理者には2枚とも出す");
    const oldCard = result.profiles.find((p) => p.uid === "OLD-x9z1");
    assertEqual(oldCard.duplicateOfUid, "NEW-ab12", "F4: 旧カードに「誰と同じか」を付ける");
    assertEqual(buildProfileIdentityNote(oldCard), "以前のID（#x9z1）：#ab12 と同じプレイヤー（管理者のみ表示）", "F4: 旧カードの補足");
    assertEqual(annotateSameNameProfiles(result.profiles).find((p) => p.uid === "NEW-ab12").sameNameSuffix, undefined, "F4: 旧IDカードは「同じ名前の別プレイヤー」として数えない");
  }

  // F5. identityKey の書き写し（悪意）でも、本人のカードは隠されない
  {
    const profiles = [profile("victim", "A", { identityKey: KEY_GASHIO }), profile("copycat", "B", { identityKey: KEY_GASHIO })];
    const asVictim = collapseSamePlayerProfiles(profiles, { myUid: "victim", presenceRankByUid: { copycat: { online: true, lastSeen: 99 } } });
    assertEqual(asVictim.profiles.map((p) => p.uid), ["victim", "copycat"], "F5: 本人の画面では本人のカードが隠されない（書き写しでは誰もまとめない）");
    const asThirdParty = collapseSamePlayerProfiles(profiles, { myUid: "someone", presenceRankByUid: { copycat: { online: true, lastSeen: 99 } } });
    assertEqual(asThirdParty.profiles.map((p) => p.uid), ["victim", "copycat"], "F5: 【2026-10-28】第三者の画面でも、書き写した人の裏に本物が隠れない");
  }

  // F6. 壊れた入力
  {
    assertEqual(collapseSamePlayerProfiles(null).profiles, [], "F6: null でも落ちない");
    assertEqual(collapseSamePlayerProfiles([null, { displayName: "uidなし" }]).profiles, [], "F6: uid の無い要素は無視");
    assertEqual(shortUidSuffix(""), "", "F6: 空UIDの印は空");
    assertEqual(collapseSamePlayerProfiles([profile("a", "x", { identityKey: "short" }), profile("b", "x", { identityKey: "short" })]).profiles.length, 2, "F6: 形式が不正な identityKey ではまとめない");
  }
}

// ---------------------------------------------------------------------------
// 管理者：UIDが変わったときの診断（自分で権限を付けることは絶対にできない）
// ---------------------------------------------------------------------------
function runAdminTests() {
  const adminsMap = { "uid-old-admin": true };
  assertEqual(isAdminByRules(adminsMap, "uid-old-admin"), true, "AD1: 旧UIDは管理者");
  assertEqual(isAdminByRules(adminsMap, "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72"), false, "AD1: UIDが変わると新UIDは管理者ではない（本人の報告と一致）");
  assertEqual(evaluateAdminsNodeAccess({ authUid: "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", targetUid: "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", operation: "write" }), false, "AD2: アプリから admins へは自分のぶんでも書けない（自己付与不可）");
  assertEqual(isAdminByRules({ ...adminsMap, XwpK1Ca6CTVh8h6ewjm0BMh7Gr72: true }, "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72"), true, "AD3: Console で admins/{新UID}: true を追加すれば復旧");
  assertEqual(isAdminByRules({ XwpK1Ca6CTVh8h6ewjm0BMh7Gr72: "true" }, "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72"), false, "AD3: 文字列 \"true\" では管理者にならない（型は boolean）");

  const remembered = rememberAdminUid(rememberAdminUid([], "uid-old-admin"), "uid-old-admin");
  assertEqual(remembered, ["uid-old-admin"], "AD4: 管理者と確認できたUIDを重複なく覚える");
  let many = [];
  for (let i = 0; i < ADMIN_REMEMBERED_UIDS_MAX + 3; i += 1) many = rememberAdminUid(many, `u${i}`);
  assertEqual(many.length, ADMIN_REMEMBERED_UIDS_MAX, "AD4: 覚えるのは最大5件");

  const lost = describeAdminDiagnostics({ currentUid: "XwpK1Ca6CTVh8h6ewjm0BMh7Gr72", checkResult: "not-registered", rememberedAdminUids: ["uid-old-admin"] });
  assertEqual(lost.status, "lost-after-uid-change", "AD5: 以前のIDで管理者だった端末なら「UID変更で外れた」と診断");
  assertEqual(lost.lines.some((line) => line.includes("admins に「XwpK1Ca6CTVh8h6ewjm0BMh7Gr72」を true")), true, "AD5: Console で追加すべきキーをそのまま示す");
  assertEqual(describeAdminDiagnostics({ currentUid: "u", checkResult: "not-registered", rememberedAdminUids: [] }).status, "not-admin", "AD6: 一般ユーザーは「管理者ではない」（画面には出さない）");
  assertEqual(describeAdminDiagnostics({ currentUid: "u", checkResult: "error", rememberedAdminUids: ["x"] }).status, "check-failed", "AD6: 通信エラーは「未登録」と区別する");
  assertEqual(describeAdminDiagnostics({ currentUid: "u", checkResult: "admin", rememberedAdminUids: ["u"] }).status, "admin", "AD6: 管理者");
  assertEqual(describeAdminDiagnostics({ currentUid: null }).status, "no-auth", "AD6: ログイン前");
}

// ---------------------------------------------------------------------------
// Firebase SDK を読み込むファイルの構造チェック（ソースをテキストとして読む）
// ---------------------------------------------------------------------------
async function readSource(path) {
  if (typeof window !== "undefined" && typeof fetch === "function") {
    return (await fetch(path, { cache: "no-store" })).text();
  }
  const fs = await import("node:fs");
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

async function runWiringTests() {
  const presenceSync = await readSource("js/presenceSync.js");
  assertEqual(presenceSync.includes("export function needsFriendPresenceRearm()"), true, "W1: 在席ノードの張り直しが必要かを返す関数がある");
  assertEqual(/\.catch\(\(error\) => \{\s*\/\/[^\n]*\n\s*connectionWriteFailed = true;/.test(presenceSync), true, "W1: 在席ノードの書き込みが拒否されたら覚えておく");
  const startBody = presenceSync.slice(presenceSync.indexOf("export async function startFriendPresenceTracking"), presenceSync.indexOf("export function stopFriendPresenceTracking"));
  assertEqual(/if \(isTracking\) \{[\s\S]*if \(!connectionWriteFailed\) return;[\s\S]*stopFriendPresenceTracking\(\);/.test(startBody), true, "W1: 拒否されたままなら止めて張り直す（そうでなければ従来どおり二重開始しない）");
  assertEqual(presenceSync.includes('ref(database, ".info/serverTimeOffset")'), true, "W2: サーバー時刻オフセットを使う");
  assertEqual(presenceSync.includes("export function getPresenceNowMs()"), true, "W2: 判定用の「今」を提供する");
  assertEqual(presenceSync.includes('document.addEventListener("visibilitychange"'), true, "W3: 画面復帰時の即時更新がある");
  assertEqual(presenceSync.includes("PRESENCE_LASTSEEN_HEARTBEAT_INTERVAL_MS = 120000"), true, "W3: 常時のハートビート間隔（2分）は変えていない");

  const publicProfileSync = await readSource("js/publicProfileSync.js");
  assertEqual(publicProfileSync.includes("if (hasActiveFriendPresenceTracking() && !needsFriendPresenceRearm()) return;"), true, "W4: 追跡中でも拒否されたままなら張り直しへ進む");
  const profileBody = publicProfileSync.slice(publicProfileSync.indexOf("export async function syncPublicProfileIfEnabled("), publicProfileSync.indexOf("export async function deletePublicProfile("));
  assertEqual(profileBody.indexOf("await set(ref(database, `publicProfiles/${uid}`)") < profileBody.indexOf("if (needsFriendPresenceRearm()) startFriendPresenceTracking();"), true, "W4: 公開プロフィールを書けた後でだけ在席ノードを張り直す");

  const firebaseClient = await readSource("js/firebaseClient.js");
  assertEqual(/setPersistence\(auth|initializeAuth\(app/.test(firebaseClient), false, "W5: ログインの保存方法（永続化）は変更していない（getAuth の既定のまま）");
  const probeBody = firebaseClient.slice(firebaseClient.indexOf("function probeStoredAuthUser()"), firebaseClient.indexOf("let hasStartedSignIn = false;"));
  assertEqual(probeBody.indexOf("indexedDB.databases()") !== -1 && probeBody.indexOf("indexedDB.databases()") < probeBody.indexOf('indexedDB.open("firebaseLocalStorageDb")'), true, "W5: 保存領域は存在を確認してから開く（空のDBを作らない）");
  assertEqual(probeBody.includes("request.transaction?.abort()"), true, "W5: 万一のアップグレードは中止する");
  assertEqual(/\.(put|add|delete|clear)\(/.test(probeBody) || probeBody.includes('"readwrite"'), false, "W5: 保存領域へは一切書かない（読むだけ）");
  assertEqual(firebaseClient.indexOf("if (IS_TEST_RUNNER) {") < firebaseClient.indexOf("signInAnonymously(auth)"), true, "W5: tests.html では従来どおり匿名ログインしない");

  const adminConfig = await readSource("js/adminConfig.js");
  assertEqual(/\b(set|update|push)\(ref\(database/.test(adminConfig), false, "W6: 管理者判定のファイルは Firebase へ一切書かない（自己付与しない）");

  const fanProfilesScreen = await readSource("js/fanProfilesScreen.js");
  assertEqual(fanProfilesScreen.includes("collapseSamePlayerProfiles(") && fanProfilesScreen.includes("annotateSameNameProfiles("), true, "W7: フレンド一覧で重複まとめ・同名の印を使う");
  assertEqual(fanProfilesScreen.includes("const nowMs = getPresenceNowMs();"), true, "W7: フレンド一覧の判定はサーバー時刻基準");
  assertEqual(/remove\(|deletePublicProfileByAdmin\(profile/.test(fanProfilesScreen.slice(fanProfilesScreen.indexOf("function buildDisplayProfiles"), fanProfilesScreen.indexOf("function renderIdentityDiagnostics"))), false, "W7: 重複まとめは表示だけ（削除しない）");

  const fanProfileCard = await readSource("js/fanProfileCard.js");
  assertEqual(fanProfileCard.includes("buildPresenceDisplay(presenceEntry, nowMs)"), true, "W8: カードの状態表示と「一緒に遊ぶ」は同じ判定を使う");
}

export async function runIdentityPresenceFixTests() {
  runPresenceStateTests();
  runPresenceScenarioTests();
  runAuthScenarioTests();
  await runRecoveryFlowTests();
  runFriendListTests();
  runAdminTests();
  await runWiringTests();
}
