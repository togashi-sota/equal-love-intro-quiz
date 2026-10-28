// エミュレータ検証の共通部品（本番には絶対に繋がない）。
//   ・名前解決（DNS）を localhost 以外すべて拒否し、fetch も 127.0.0.1 以外を拒否する
//   ・エミュレータの REST（管理者＝owner 権限）でルールの設定・データの準備・確認を行う
//   ・「通信が固まる（iPhone のバックグラウンド・電波が切れたのにサーバーがまだ気付かない）」を再現する TCP 中継
import dns from "node:dns";
import net from "node:net";

export const PROJECT_ID = "demo-equallove-presence";
export const DB_PORT = Number(process.env.EMU_DB_PORT ?? 9200);
export const AUTH_PORT = Number(process.env.EMU_AUTH_PORT ?? 9299);
if (!/^demo-/.test(PROJECT_ID)) throw new Error("demo- 以外のプロジェクトIDは使いません");

// ---- 本番へ繋がる経路を塞ぐ ----
const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const realLookup = dns.lookup;
dns.lookup = function guardedLookup(hostname, ...args) {
  if (!LOCAL_NAMES.has(String(hostname))) {
    const cb = args[args.length - 1];
    const err = Object.assign(new Error(`検証中は外部の名前解決を禁止しています: ${hostname}`), { code: "ENOTFOUND" });
    if (typeof cb === "function") return process.nextTick(() => cb(err));
    throw err;
  }
  return realLookup.call(dns, hostname, ...args);
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (!LOCAL_NAMES.has(url.hostname)) throw new Error(`検証中は外部への通信を禁止しています: ${url.href}`);
  return realFetch(input, init);
};

// ---- 結果の集計 ----
const results = [];
let currentGroup = "";
export function group(name) {
  currentGroup = name;
  console.log(`\n=== ${name} ===`);
}
export function check(actual, expected, description) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  results.push({ group: currentGroup, description, pass, actual, expected });
  console.log(`${pass ? "✅" : "❌"} ${description}${pass ? "" : ` — 期待値: ${JSON.stringify(expected)} / 実際: ${JSON.stringify(actual)}`}`);
  return pass;
}
export function getResults() {
  return results;
}

// ---- エミュレータ REST ----
const OWNER = { Authorization: "Bearer owner" };
function dbUrl(ns, path) {
  const clean = String(path).replace(/^\/+|\/+$/g, "");
  return `http://127.0.0.1:${DB_PORT}/${clean ? `${clean}.json` : ".json"}?ns=${ns}`;
}
export async function putRules(ns, rulesText) {
  const res = await fetch(`http://127.0.0.1:${DB_PORT}/.settings/rules.json?ns=${ns}`, { method: "PUT", headers: OWNER, body: rulesText });
  if (!res.ok) throw new Error(`ルールを設定できません(${ns}): ${res.status} ${await res.text()}`);
}
export async function adminSet(ns, path, value) {
  const res = await fetch(dbUrl(ns, path), { method: "PUT", headers: OWNER, body: JSON.stringify(value) });
  if (!res.ok) throw new Error(`adminSet ${path}: ${res.status} ${await res.text()}`);
}
export async function adminGet(ns, path) {
  const res = await fetch(dbUrl(ns, path), { headers: OWNER });
  if (!res.ok) throw new Error(`adminGet ${path}: ${res.status}`);
  return res.json();
}
export async function adminDelete(ns, path) {
  await fetch(dbUrl(ns, path), { method: "DELETE", headers: OWNER });
}
export async function clearAuthUsers() {
  await fetch(`http://127.0.0.1:${AUTH_PORT}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
}
export async function setEmailProviderEnabled(enabled) {
  const res = await fetch(
    `http://127.0.0.1:${AUTH_PORT}/identitytoolkit.googleapis.com/v2/projects/${PROJECT_ID}/config?updateMask=signIn.email.enabled`,
    { method: "PATCH", headers: { ...OWNER, "Content-Type": "application/json" }, body: JSON.stringify({ signIn: { email: { enabled } } }) }
  );
  return res.ok;
}
export async function listOobCodes() {
  const res = await fetch(`http://127.0.0.1:${AUTH_PORT}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  return (await res.json()).oobCodes ?? [];
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function waitFor(fn, { timeoutMs = 10000, intervalMs = 150, label = "条件" } = {}) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeoutMs) {
    last = await fn();
    if (last) return last;
    await sleep(intervalMs);
  }
  return last ?? false;
}

// ---- 固まる通信の再現（TCP 中継） ----
// freeze()：今ある接続のデータを両方向とも捨てる（ソケットは閉じない＝クライアントもサーバーも切れたことに気付かない）
// serverDetectsTimeout()：サーバー側のソケットだけ閉じる（実機ではサーバーが約60秒〜で無応答を検知したのに相当）→ onDisconnect が動く
// clientDetectsLoss()：クライアント側のソケットだけ閉じる（電波が戻って iPhone が切断に気付いたのに相当）→ SDK が再接続する
// 新しく張られた接続は固まっていない状態で中継する。bytes は方向ごとの転送量（書き込み量の見積もり用）。
export function createFreezableProxy(targetPort) {
  const pairs = new Set();
  const bytes = { up: 0, down: 0 };
  let refuse = false;
  const server = net.createServer((client) => {
    if (refuse) {
      client.destroy();
      return;
    }
    const upstream = net.connect(targetPort, "127.0.0.1");
    const pair = { client, upstream, frozen: false };
    pairs.add(pair);
    client.on("data", (d) => {
      if (pair.frozen) return;
      bytes.up += d.length;
      upstream.write(d);
    });
    upstream.on("data", (d) => {
      if (pair.frozen) return;
      bytes.down += d.length;
      client.write(d);
    });
    const ignore = () => {};
    client.on("error", ignore);
    upstream.on("error", ignore);
    // 片側が正常に閉じたら（goOffline・アプリ終了など）もう片側も閉じる。固めている間は伝えない
    client.on("close", () => {
      if (!pair.frozen) upstream.destroy();
    });
    upstream.on("close", () => {
      if (!pair.frozen) client.destroy();
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        port: server.address().port,
        bytes,
        freeze() {
          pairs.forEach((p) => {
            p.frozen = true;
          });
        },
        serverDetectsTimeout() {
          pairs.forEach((p) => p.frozen && p.upstream.destroy());
        },
        clientDetectsLoss() {
          pairs.forEach((p) => {
            if (p.frozen) {
              p.client.destroy();
              pairs.delete(p);
            }
          });
        },
        // 中継を止めて新しい接続も拒否する（「通信できない」状態）
        cutAll() {
          refuse = true;
          pairs.forEach((p) => {
            p.client.destroy();
            p.upstream.destroy();
          });
          pairs.clear();
        },
        close() {
          refuse = true;
          pairs.forEach((p) => {
            p.client.destroy();
            p.upstream.destroy();
          });
          server.close();
        },
      });
    });
  });
}
