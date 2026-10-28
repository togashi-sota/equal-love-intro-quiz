// Node のモジュール読み込みフック（エミュレータ検証専用・本番アプリでは使わない）。
// ・アプリが読み込む https://www.gstatic.com/firebasejs/10.7.1/firebase-*.js を、npm の firebase@10.7.1（同じ版）へ差し替える
// ・js/presenceSync.js などが読む ./firebaseClient.js・./screens.js を、エミュレータにだけ繋ぐ偽物（stubs/）へ差し替える
// ・「?device=名前」を付けて読み込むと、そのモジュールが読む子モジュールにも同じ印を付ける
//   → 端末（タブ）ごとに別々の presenceSync.js の状態と、別々の Firebase アプリを持てる（複数端末・複数タブの再現）
// ・それ以外の http(s) からの読み込みは全部拒否する（本番へ繋がる経路を作らないため）
import { pathToFileURL } from "node:url";

const TOOLS_DIR = process.env.EMU_TOOLS_DIR;
if (!TOOLS_DIR) throw new Error("EMU_TOOLS_DIR（firebase@10.7.1 を入れたフォルダ）が指定されていません");
const TOOLS_PARENT = pathToFileURL(`${TOOLS_DIR.replace(/\\/g, "/")}/package.json`).href;
const STUB_DIR = new URL("./stubs/", import.meta.url).href;
const REPO_JS = new URL("../../../js/", import.meta.url).href;
const GSTATIC = /^https:\/\/www\.gstatic\.com\/firebasejs\/10\.7\.1\/firebase-(app|auth|database)\.js$/;
const STUBBED = new Set(["./firebaseClient.js", "./screens.js"]);

function deviceOf(url) {
  try {
    return new URL(url).searchParams.get("device");
  } catch {
    return null;
  }
}

function withDevice(url, device) {
  if (!device) return url;
  const u = new URL(url);
  u.searchParams.set("device", device);
  return u.href;
}

// 修正前の js/presenceSync.js（git の記録から取り出したもの）を js/presenceSync.legacy.js として読めるようにする
// （古い版のアプリと新しい Rules の組み合わせを確かめるため。ファイルは作らず、読み込み時に中身を渡す）
const LEGACY_FILE = process.env.EMU_LEGACY_PRESENCE_FILE ?? null;
const LEGACY_URL = `${REPO_JS}presenceSync.legacy.js`;

export async function load(url, context, nextLoad) {
  if (url.split("?")[0] === LEGACY_URL) {
    if (!LEGACY_FILE) throw new Error("EMU_LEGACY_PRESENCE_FILE が指定されていません");
    const { readFileSync } = await import("node:fs");
    return { format: "module", source: readFileSync(LEGACY_FILE, "utf8"), shortCircuit: true };
  }
  return nextLoad(url, context);
}

export async function resolve(specifier, context, nextResolve) {
  if (/presenceSync\.legacy\.js(\?.*)?$/.test(specifier)) {
    return { url: new URL(specifier, context.parentURL).href, shortCircuit: true };
  }
  const m = specifier.match(GSTATIC);
  if (m) return nextResolve(`firebase/${m[1]}`, { ...context, parentURL: TOOLS_PARENT });
  if (/^https?:/i.test(specifier)) throw new Error(`検証環境では外部からの読み込みを禁止しています: ${specifier}`);
  const parent = context.parentURL ?? "";
  if (/^(firebase\/|@firebase\/)/.test(specifier) && !parent.includes("/node_modules/")) {
    return nextResolve(specifier, { ...context, parentURL: TOOLS_PARENT });
  }
  const device = deviceOf(parent);
  if (parent.startsWith(REPO_JS) && STUBBED.has(specifier)) {
    return { url: withDevice(new URL(specifier.slice(2), STUB_DIR).href, device), shortCircuit: true };
  }
  const resolved = await nextResolve(specifier, context);
  if (device && (resolved.url.startsWith(REPO_JS) || resolved.url.startsWith(STUB_DIR))) {
    return { ...resolved, url: withDevice(resolved.url, device) };
  }
  return resolved;
}
