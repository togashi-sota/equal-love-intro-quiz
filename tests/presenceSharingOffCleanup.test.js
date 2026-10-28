// 公開OFFの端末の起動時の「在席の後片付け」（js/publicProfilePayloads.js の cleanupPresenceWhileSharingOff）のテスト（2026-10-28新設）。
// 【何を確かめるか】
//   ・匿名のログイン（1つの保存領域だけ）で公開OFF → 従来どおり presence/{uid} を丸ごと消す
//   ・メールで保護した同じUIDを2つの保存領域で使い、片方だけ公開OFF → もう片方の生きている接続は消さない
//   ・保護済みでも、生きている接続が無ければ見えているもの（残骸・lastSeen・isPlaying）は消える（公開OFFなら何も見せない）
//   ・読んだ後に別の保存領域が作った接続は消さない／読めなければ何も消さない
// 【Firebase に触れない】偽の presence（メモリ上のオブジェクト）を2つの「保存領域」から共有して使う。
// 本物の SDK・Rules での確認は tests/emulator/presence-auth（エミュレーター、node 専用）の担当。
import { assertEqual } from "./test-utils.js";
import { cleanupPresenceWhileSharingOff, planPresenceCleanupWhileSharingOff, PRESENCE_OFF_CLEANUP } from "../js/publicProfilePayloads.js";

const NOW = 1761600000000; // 2025-10-27T21:20:00Z 付近（固定）
const HOUR = 60 * 60 * 1000;
const PUSH_ID_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

// Firebase の push() と同じ形の ID（先頭8文字が作成時刻）を作る
function pushIdAt(ms, suffix = "abcdefghijkl") {
  let t = ms;
  let head = "";
  for (let i = 0; i < 8; i += 1) {
    head = PUSH_ID_CHARS.charAt(t % 64) + head;
    t = Math.floor(t / 64);
  }
  return `${head}${suffix}`.slice(0, 20);
}

// 偽の Realtime Database（presence/{uid} だけ）。2つの保存領域が同じオブジェクトを共有する
function createFakePresenceDb(initial) {
  const db = { presence: JSON.parse(JSON.stringify(initial ?? {})), log: [] };
  db.read = async (uid) => {
    db.log.push(["read", uid]);
    const value = db.presence[uid];
    return value === undefined ? null : JSON.parse(JSON.stringify(value));
  };
  db.removeAll = async (uid) => {
    db.log.push(["removeAll", uid]);
    delete db.presence[uid];
  };
  db.update = async (uid, updates) => {
    db.log.push(["update", uid, updates]);
    const node = db.presence[uid] ?? {};
    Object.entries(updates).forEach(([path, value]) => {
      const parts = path.split("/");
      let target = node;
      for (let i = 0; i < parts.length - 1; i += 1) target = target[parts[i]] ?? (target[parts[i]] = {});
      if (value === null) delete target[parts[parts.length - 1]];
      else target[parts[parts.length - 1]] = value;
    });
    if (node.connections && Object.keys(node.connections).length === 0) delete node.connections;
    if (Object.keys(node).length === 0) delete db.presence[uid];
    else db.presence[uid] = node;
  };
  return db;
}

// 1つの保存領域（端末のブラウザの保存場所）から見た依存
function storageDeps(db, { uid, isAnonymous, readHook = null }) {
  return {
    getUid: async () => uid,
    isAnonymous: () => isAnonymous,
    deleteAll: () => db.removeAll(uid),
    readPresence: async (u) => {
      const value = await db.read(u);
      if (readHook) await readHook();
      return value;
    },
    applyUpdates: (u, updates) => db.update(u, updates),
    nowMs: () => NOW,
    serverNowMs: () => NOW,
  };
}

export async function runPresenceSharingOffCleanupTests() {
  const liveA = pushIdAt(NOW - 5 * 60 * 1000, "AAAAAAAAAAAA"); // ホーム画面アプリ（公開ON）の今の接続（5分前に作成）
  const ghost = pushIdAt(NOW - 25 * HOUR, "GGGGGGGGGGGG"); // 25時間前の true の残骸

  // PO1. 匿名・1つの保存領域で公開OFF → 従来どおり丸ごと消す
  {
    const db = createFakePresenceDb({ ANON: { connections: { [ghost]: true, [liveA]: true }, lastSeen: NOW - 1000, isPlaying: false } });
    const r = await cleanupPresenceWhileSharingOff(storageDeps(db, { uid: "ANON", isAnonymous: true }));
    assertEqual([r.action, db.presence.ANON, db.log.map((l) => l[0])], [PRESENCE_OFF_CLEANUP.DELETE_ALL, undefined, ["removeAll"]], "PO1: 匿名の公開OFFは presence/{uid} を丸ごと消す（従来どおり・読み取りもしない）");
  }
  // PO2. ログイン状態が分からない（currentUser が無い）→ 匿名と同じ扱い（丸ごと）
  {
    const db = createFakePresenceDb({ U: { lastSeen: NOW } });
    const r = await cleanupPresenceWhileSharingOff(storageDeps(db, { uid: "U", isAnonymous: null }));
    assertEqual([r.action, db.presence.U], [PRESENCE_OFF_CLEANUP.DELETE_ALL, undefined], "PO2: 匿名か分からないときは従来どおり丸ごと消す");
  }
  // PO3. 保護済みの同じUID：ホーム画面アプリ（公開ON）が遊んでいる間に Safari（公開OFF）が起動 → アプリの接続は残る
  {
    const db = createFakePresenceDb({ PROT: { connections: { [liveA]: true }, lastSeen: NOW - 30 * 1000, isPlaying: true } });
    const before = JSON.stringify(db.presence.PROT);
    const r = await cleanupPresenceWhileSharingOff(storageDeps(db, { uid: "PROT", isAnonymous: false }));
    assertEqual([r.action, r.liveConnectionCount, JSON.stringify(db.presence.PROT) === before], [PRESENCE_OFF_CLEANUP.NONE, 1, true], "PO3: もう片方の保存領域の生きている接続・lastSeen・isPlaying に触れない");
    assertEqual(db.log.some((l) => l[0] === "removeAll"), false, "PO3: 丸ごとの削除は行わない");
  }
  // PO4. 保護済み：生きている接続＋自分の古い残骸 → 残骸だけ消す
  {
    const db = createFakePresenceDb({ PROT: { connections: { [liveA]: true, [ghost]: true }, lastSeen: NOW - 30 * 1000, isPlaying: false } });
    const r = await cleanupPresenceWhileSharingOff(storageDeps(db, { uid: "PROT", isAnonymous: false }));
    assertEqual([r.action, Object.keys(db.presence.PROT.connections), db.presence.PROT.lastSeen, db.presence.PROT.isPlaying], [PRESENCE_OFF_CLEANUP.REMOVE_STALE_ONLY, [liveA], NOW - 30 * 1000, false], "PO4: 24時間以上前の残骸だけ消し、生きている接続と lastSeen・isPlaying は残す");
  }
  // PO5. 保護済み：生きている接続が無い（残骸と lastSeen だけ）→ 見えているものを消す（公開OFFなら在席を見せない）
  {
    const db = createFakePresenceDb({ PROT: { connections: { [ghost]: true }, lastSeen: NOW - 2 * HOUR, isPlaying: false } });
    const r = await cleanupPresenceWhileSharingOff(storageDeps(db, { uid: "PROT", isAnonymous: false }));
    assertEqual([r.action, db.presence.PROT], [PRESENCE_OFF_CLEANUP.CLEAR_SEEN, undefined], "PO5: 他に生きている接続が無ければ、従来と同じく在席は何も残らない");
  }
  // PO6. 保護済み：接続ごとの時刻（提案 Rules 公開後）→ 1時間以上止まった接続は残骸、2分前のものは生きている
  {
    const timedLive = pushIdAt(NOW - 3 * HOUR, "TLTLTLTLTLTL");
    const timedStale = pushIdAt(NOW - 3 * HOUR, "TSTSTSTSTSTS");
    const db = createFakePresenceDb({ PROT: { connections: { [timedLive]: NOW - 2 * 60 * 1000, [timedStale]: NOW - 2 * HOUR }, lastSeen: NOW - 60 * 1000 } });
    const r = await cleanupPresenceWhileSharingOff(storageDeps(db, { uid: "PROT", isAnonymous: false }));
    assertEqual([r.action, Object.keys(db.presence.PROT.connections)], [PRESENCE_OFF_CLEANUP.REMOVE_STALE_ONLY, [timedLive]], "PO6: 時刻つきの接続は時刻で判定し、止まった残骸だけ消す");
  }
  // PO7. 読んだ後に、もう片方の保存領域が新しい接続を作った → その接続は消さない（丸ごと消さず、読んだ子だけ消すため）
  {
    const lateConn = pushIdAt(NOW, "LLLLLLLLLLLL");
    const db = createFakePresenceDb({ PROT: { connections: { [ghost]: true }, lastSeen: NOW - 2 * HOUR } });
    const r = await cleanupPresenceWhileSharingOff(
      storageDeps(db, {
        uid: "PROT",
        isAnonymous: false,
        readHook: async () => {
          db.presence.PROT.connections[lateConn] = true; // 別の保存領域の再接続
        },
      })
    );
    assertEqual([r.action, Object.keys(db.presence.PROT?.connections ?? {})], [PRESENCE_OFF_CLEANUP.CLEAR_SEEN, [lateConn]], "PO7: 読み取りの後に作られた接続は残る");
  }
  // PO8. 保護済みで presence が読めない → 何も消さない（他の保存領域の接続を消す危険を取らない）
  {
    const db = createFakePresenceDb({ PROT: { connections: { [liveA]: true }, lastSeen: NOW } });
    const deps = storageDeps(db, { uid: "PROT", isAnonymous: false });
    deps.readPresence = async () => {
      throw Object.assign(new Error("offline"), { code: "NETWORK" });
    };
    const r = await cleanupPresenceWhileSharingOff(deps);
    assertEqual([r.action, r.reason, Object.keys(db.presence.PROT.connections)], [PRESENCE_OFF_CLEANUP.NONE, "read-failed", [liveA]], "PO8: 読めなければ何も消さない（次の起動で再試行）");
  }
  // PO9. UID が無い → 何もしない／書き込みの失敗でも例外を投げない（起動を止めない）
  {
    const db = createFakePresenceDb({});
    const r1 = await cleanupPresenceWhileSharingOff(storageDeps(db, { uid: null, isAnonymous: true }));
    const deps = storageDeps(createFakePresenceDb({ PROT: { connections: { [ghost]: true } } }), { uid: "PROT", isAnonymous: false });
    deps.applyUpdates = async () => {
      throw new Error("PERMISSION_DENIED");
    };
    const originalWarn = console.warn;
    console.warn = () => {};
    let r2;
    try {
      r2 = await cleanupPresenceWhileSharingOff(deps);
    } finally {
      console.warn = originalWarn;
    }
    assertEqual([r1.action, r1.reason, db.log.length, r2.action, r2.reason], [PRESENCE_OFF_CLEANUP.NONE, "no-uid", 0, PRESENCE_OFF_CLEANUP.NONE, "error"], "PO9: UID が無ければ何もしない・失敗しても例外を投げない");
  }
  // PO10. 2つの保存領域の通しシナリオ：アプリ（ON）が接続中 → Safari（OFF）が起動 → アプリはオンラインのまま →
  //       アプリが閉じた（onDisconnect で接続ノードが消え lastSeen が残る）→ Safari をもう一度起動 → 在席は何も残らない
  {
    const db = createFakePresenceDb({ PROT: { connections: { [liveA]: true }, lastSeen: NOW - 10 * 1000, isPlaying: false } });
    const safari = storageDeps(db, { uid: "PROT", isAnonymous: false });
    await cleanupPresenceWhileSharingOff(safari);
    const stillOnline = !!db.presence.PROT?.connections?.[liveA];
    delete db.presence.PROT.connections; // アプリを閉じた（サーバーの onDisconnect）
    db.presence.PROT.lastSeen = NOW;
    await cleanupPresenceWhileSharingOff(safari);
    assertEqual([stillOnline, db.presence.PROT], [true, undefined], "PO10: 片方だけ公開OFFでも、もう片方が遊んでいる間はオンラインのまま。誰も繋いでいなければ在席は残らない");
  }
  // PO11. 純粋関数：匿名なら updates を作らない／保護済みで presence が無ければ何もしない
  assertEqual(planPresenceCleanupWhileSharingOff({ isAnonymous: true, presenceEntry: { lastSeen: 1 }, nowMs: NOW }).action, PRESENCE_OFF_CLEANUP.DELETE_ALL, "PO11: 匿名は丸ごと");
  assertEqual(planPresenceCleanupWhileSharingOff({ isAnonymous: false, presenceEntry: null, nowMs: NOW }), { action: PRESENCE_OFF_CLEANUP.NONE, updates: {}, liveConnectionCount: 0 }, "PO11: 保護済みで presence が無ければ何もしない");

  // PO12. 配線（ソースの構造）：起動時の OFF 側は「自分の接続を止める → 後片付け（匿名なら deleteFriendPresence）」の順。
  //       明示的に OFF にする操作（公開プロフィールも消す）は従来どおり丸ごと消す。
  {
    const source = await readSource("js/publicProfileSync.js");
    const syncStart = source.indexOf("export function syncFriendPresenceToActivePlayer");
    const syncBody = source.slice(syncStart, source.indexOf("// TOP10ランキング", syncStart));
    const elseBody = syncBody.slice(syncBody.indexOf("} else {"));
    const stopAt = elseBody.indexOf("stopFriendPresenceTracking();");
    const cleanupAt = elseBody.indexOf("await cleanupPresenceWhileSharingOff({");
    assertEqual(stopAt !== -1 && cleanupAt !== -1 && stopAt < cleanupAt, true, "PO12: 起動時の OFF 側は、自分の接続を止めてから後片付けする");
    assertEqual(elseBody.includes("deleteAll: () => deleteFriendPresence(),") && elseBody.includes("auth.currentUser.isAnonymous !== false"), true, "PO12: 匿名の判定は auth.currentUser.isAnonymous、匿名なら deleteFriendPresence()（丸ごと）");
    assertEqual(/\bremove\(ref\(database, `presence\/\$\{uid\}`\)\)/.test(elseBody), false, "PO12: 起動時の OFF 側で presence/{uid} を直接丸ごと消していない");
    const disabledStart = source.indexOf("async function applyPublicProfileSharingDisabled");
    const disabledBody = source.slice(disabledStart, source.indexOf("\n}", disabledStart));
    assertEqual(
      disabledBody.indexOf("stopFriendPresenceTracking()") < disabledBody.indexOf("await deleteFriendPresence()") && disabledBody.indexOf("await deleteFriendPresence()") < disabledBody.indexOf("await deletePublicProfile()"),
      true,
      "PO12: 明示的な OFF の操作は従来どおり「停止→在席を丸ごと削除→公開プロフィール削除」"
    );
  }
}

async function readSource(path) {
  if (typeof window !== "undefined" && typeof fetch === "function") {
    return (await fetch(path, { cache: "no-store" })).text();
  }
  const fs = await import("node:fs");
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
