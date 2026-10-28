// js/firebaseClient.js の代わり（エミュレータ検証専用）。本番の設定は一切持たない。
// 端末ごと（?device=名前）に別の Firebase アプリを作り、ローカルのエミュレータ（demo- のプロジェクト）にだけ繋ぐ。
// 端末の設定は run.mjs が globalThis.__EMU_DEVICES__[名前] に入れておく：
//   { projectId, ns, dbPort, authPort, signIn: async (auth, authSdk) => user }
import { initializeApp } from "firebase/app";
import * as authSdk from "firebase/auth";
import { getDatabase, connectDatabaseEmulator } from "firebase/database";

const device = new URL(import.meta.url).searchParams.get("device") ?? "default";
const cfg = globalThis.__EMU_DEVICES__?.[device];
if (!cfg) throw new Error(`端末 ${device} の設定がありません`);
if (!/^demo-/.test(cfg.projectId)) throw new Error("demo- で始まるプロジェクトIDだけを使います（本番に繋がないため）");

export const app = initializeApp(
  { apiKey: "demo-api-key", projectId: cfg.projectId, databaseURL: `http://127.0.0.1:${cfg.dbPort}?ns=${cfg.ns}` },
  `device-${device}-${Math.random().toString(36).slice(2)}`
);
export const auth = authSdk.initializeAuth(app, { persistence: authSdk.inMemoryPersistence });
authSdk.connectAuthEmulator(auth, `http://127.0.0.1:${cfg.authPort}`, { disableWarnings: true });
export const database = getDatabase(app);
connectDatabaseEmulator(database, "127.0.0.1", cfg.dbPort);

export const IS_TEST_RUNNER = false;
export const authReady = Promise.resolve(cfg.signIn(auth, authSdk));

export function getCurrentUid() {
  return auth.currentUser?.uid ?? null;
}
export function getAuthUidHistory() {
  return { entries: [] };
}
export function getAuthSessionInfo() {
  return { createdNewAnonymousUserThisSession: false, preSignInProbe: null };
}
