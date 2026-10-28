// アプリのモジュールを node で動かすための最小限の偽物（document・localStorage・2分タイマー）と、
// 「端末」（Firebase アプリ1つ＋presenceSync.js 1つ）を作る関数。
import { readFileSync } from "node:fs";
import { PROJECT_ID, DB_PORT, AUTH_PORT } from "./lib.mjs";

export const REPO_URL = new URL("../../../", import.meta.url);
export const REPO_JS = new URL("js/", REPO_URL).href;
const STUB_DIR = new URL("./stubs/", import.meta.url).href;
export function readRepoText(path) {
  return readFileSync(new URL(path, REPO_URL), "utf8");
}

// ---- localStorage（全端末で共有。シナリオの最初に clear する）----
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
  key: (i) => [...store.keys()][i] ?? null,
  get length() {
    return store.size;
  },
};

// ---- document（画面の表示状態だけ）----
class FakeDocument extends EventTarget {
  constructor() {
    super();
    this.visibilityState = "visible";
    this.body = { dataset: { screen: "home" } };
  }
  setVisibility(state) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }
}
globalThis.document = new FakeDocument();

// ---- 2分ごとのハートビートだけを手動で進められるようにする ----
// （本物の2分を待たずに「タイマーが動いた／iOS で止まっていた」を再現する。他のタイマーは本物のまま）
const realSetInterval = globalThis.setInterval;
const realClearInterval = globalThis.clearInterval;
const heartbeatTimers = new Map();
let fakeId = 0;
globalThis.__startingDevice = null;
globalThis.setInterval = (fn, ms, ...args) => {
  if (ms === 120000) {
    const id = { fakeHeartbeat: (fakeId += 1) };
    heartbeatTimers.set(id, { fn, device: globalThis.__startingDevice });
    return id;
  }
  return realSetInterval(fn, ms, ...args);
};
globalThis.clearInterval = (id) => {
  if (heartbeatTimers.has(id)) heartbeatTimers.delete(id);
  else realClearInterval(id);
};
export function tickHeartbeat(deviceName) {
  let count = 0;
  heartbeatTimers.forEach((t) => {
    if (t.device === deviceName) {
      t.fn();
      count += 1;
    }
  });
  return count;
}

// ---- 端末 ----
globalThis.__EMU_DEVICES__ = {};
let deviceSeq = 0;
// signIn(auth, authSdk) は user を返す（匿名・メールなど）。null を返すと未ログインの端末。
export async function createDevice(label, { ns, dbPort = DB_PORT, authPort = AUTH_PORT, signIn }) {
  deviceSeq += 1;
  const name = `${label}-${deviceSeq}`;
  globalThis.__EMU_DEVICES__[name] = { projectId: PROJECT_ID, ns, dbPort, authPort, signIn };
  const client = await import(`${STUB_DIR}firebaseClient.js?device=${name}`);
  const user = await client.authReady;
  // 端末ごとの document（presenceSync.js は読み込んだ時点の document に visibilitychange を登録するため）
  const doc = new FakeDocument();
  return {
    name,
    client,
    user,
    doc,
    uid: user?.uid ?? null,
    // legacy=true で、修正前の presenceSync.js（git の記録、hooks.mjs 参照）を使う
    legacy: false,
    async presence() {
      globalThis.document = doc;
      return import(`${REPO_JS}${this.legacy ? "presenceSync.legacy.js" : "presenceSync.js"}?device=${name}`);
    },
    // この端末の画面を隠す／表示する（iPhone のバックグラウンド・復帰）
    setVisibility(state) {
      globalThis.document = doc;
      doc.setVisibility(state);
    },
    async startPresence() {
      const presence = await this.presence();
      globalThis.document = doc;
      globalThis.__startingDevice = name;
      await presence.startFriendPresenceTracking();
      globalThis.__startingDevice = null;
      return presence;
    },
    tick() {
      return tickHeartbeat(name);
    },
  };
}
