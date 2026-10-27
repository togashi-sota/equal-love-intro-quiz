// Firebaseとの接続を1箇所にまとめる、本番用の初期化ファイル。
// dev/firebaseConnectionTest.htmlで確認した内容をもとに、オンライン対戦機能で使う形に整理した。
//
// 【設計方針】オンライン対戦関連のファイル（js/onlineBattle.js等）だけがこのファイルをimportする。
// 既存のオフライン機能（通常クイズ・ローカル対戦等）は一切importしないため、オンライン対戦の
// 画面を開かない限りFirebase関連のコードは実行されず、既存の動作に影響しない。
//
// 【apiKeyについて】ここに書かれているapiKey等は秘密鍵ではなく、Webアプリ向けに公開される
// ことを前提とした識別子（コードに含めてよいもの）。実際のアクセス制御はRealtime Databaseの
// セキュリティルール側で行う（詳細はdocs/HANDOFF.md参照）。

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { recordAuthUidObservation, normalizeAuthUidHistory } from "./identityBootstrap.js";

const firebaseConfig = {
  apiKey: "AIzaSyBgkSOeXf9-6q0j2PgMpLzZ7HJuGhrB1B4",
  authDomain: "equal-love-intro-quiz.firebaseapp.com",
  databaseURL: "https://equal-love-intro-quiz-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "equal-love-intro-quiz",
  storageBucket: "equal-love-intro-quiz.firebasestorage.app",
  messagingSenderId: "394462420674",
  appId: "1:394462420674:web:85d08546838d502291655b",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

// 匿名ログインが完了するまで、オンライン対戦の各画面はここで待つ。
// （Realtime Databaseへの読み書きは、セキュリティルール上ログイン済みである必要があるため）
let resolveAuthReady;
export const authReady = new Promise((resolve) => {
  resolveAuthReady = resolve;
});

// 【2026-09-15追加：自動テストでの匿名ユーザー増殖防止】tests.html（自動テスト）から読み込まれた
// 場合は匿名ログインを行わない。理由：Firebase匿名認証は「ブラウザの保存領域ごと」に新しい
// ユーザーを作るため、Claude Code等のブラウザ検証で tests.html を新しい環境で開くたびに
// Authentication上の匿名ユーザーが1件ずつ増えていた（js/playerProfile.js → js/backupSync.js →
// このファイル、という間接importの経路で、テスト自身は意図せずログインしていた）。
// テストは本番Firebaseへ書き込まない設計（tests/onlineBattleSongAvailability.test.js等の
// コメント参照）なので、ログインしなくても結果に影響しない。ログインしない場合 authReady は
// 解決されないままになるが、待っている処理（バックアップ同期等）が静かに待機するだけで
// 例外にはならない。本番アプリ（index.html）・開発用ツール（dev/）の挙動は変わらない。
export const IS_TEST_RUNNER =
  typeof location !== "undefined" && /\/tests\.html$/.test(location.pathname);

// ---------------------------------------------------------------------------
// 【2026-10-28追加・本人の実機報告「プレイヤーIDがまた変わった」】認証UIDの端末内履歴（診断専用）。
// 【永続化について】このファイルは setPersistence()／initializeAuth() を使っていない。getAuth() の既定
// （IndexedDB → 使えなければ localStorage → sessionStorage の順で最初に使えるもの）でログイン情報を保存する。
// iOS ではホーム画面アプリ（PWA）と Safari の保存領域が別なので、同じ端末でも起動方法が違えば別のUIDになる。
// Service Worker の更新（sw.js）は Cache Storage しか消さないため、ログイン情報には影響しない。
// ここでは挙動を一切変えず、「いつ・どんな状況でUIDが変わったか」を端末に記録するだけにする。
// ---------------------------------------------------------------------------
const AUTH_UID_HISTORY_STORAGE_KEY = "equalLoveIntroQuiz.authUidHistory";
let createdNewAnonymousUserThisSession = false;
let preSignInProbe = null;

export function getAuthUidHistory() {
  try {
    return normalizeAuthUidHistory(JSON.parse(localStorage.getItem(AUTH_UID_HISTORY_STORAGE_KEY) ?? "null"));
  } catch {
    return normalizeAuthUidHistory(null);
  }
}

export function getAuthSessionInfo() {
  return { createdNewAnonymousUserThisSession, preSignInProbe };
}

function isStandaloneLaunch() {
  try {
    if (typeof window === "undefined") return null;
    if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) return true;
    return window.navigator?.standalone === true;
  } catch {
    return null;
  }
}

function recordAuthUid(uid) {
  try {
    const { history } = recordAuthUidObservation(getAuthUidHistory(), {
      uid,
      nowMs: Date.now(),
      createdNewAnonymousUser: createdNewAnonymousUserThisSession,
      standalone: isStandaloneLaunch(),
      probe: preSignInProbe,
    });
    localStorage.setItem(AUTH_UID_HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    // 診断用の記録なので、保存できなくてもログイン自体には影響させない
  }
}

// 新しい匿名ユーザーを作る直前に、端末の保存領域に以前のログイン情報が残っているかを「読むだけ」で確認する。
// 【安全のための約束】①IndexedDB は indexedDB.databases() で存在を確認できたときだけ開く（開くだけで
// 空のデータベースが作られ、Firebase SDK 側の初期化を壊すことがあるため）②バージョンを指定せずに開き、
// 万一アップグレードが走ったら中止する ③書き込みは一切しない ④最大800ミリ秒で打ち切る。
function probeStoredAuthUser() {
  const result = { indexedDbHasAuthUser: null, localStorageHasAuthUser: null };
  try {
    result.localStorageHasAuthUser = Object.keys(localStorage).some((key) => key.startsWith("firebase:authUser:"));
  } catch {
    result.localStorageHasAuthUser = null;
  }
  const probeIndexedDb = async () => {
    if (typeof indexedDB === "undefined" || typeof indexedDB.databases !== "function") return;
    const databases = await indexedDB.databases();
    if (!databases.some((db) => db?.name === "firebaseLocalStorageDb")) {
      result.indexedDbHasAuthUser = false;
      return;
    }
    await new Promise((resolve) => {
      const request = indexedDB.open("firebaseLocalStorageDb");
      request.onupgradeneeded = () => {
        request.transaction?.abort();
      };
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
      request.onsuccess = () => {
        const db = request.result;
        try {
          if (!db.objectStoreNames.contains("firebaseLocalStorage")) {
            result.indexedDbHasAuthUser = false;
            db.close();
            resolve();
            return;
          }
          const keysRequest = db.transaction("firebaseLocalStorage", "readonly").objectStore("firebaseLocalStorage").getAllKeys();
          keysRequest.onsuccess = () => {
            result.indexedDbHasAuthUser = (keysRequest.result ?? []).some((key) => String(key).startsWith("firebase:authUser:"));
            db.close();
            resolve();
          };
          keysRequest.onerror = () => {
            db.close();
            resolve();
          };
        } catch {
          db.close();
          resolve();
        }
      };
    });
  };
  const timeout = new Promise((resolve) => setTimeout(resolve, 800));
  return Promise.race([probeIndexedDb().catch(() => {}), timeout]).then(() => result);
}

let hasStartedSignIn = false;
onAuthStateChanged(auth, (user) => {
  if (user) {
    recordAuthUid(user.uid);
    resolveAuthReady(user);
    return;
  }
  // ログインしていない状態で呼ばれるのは、初回アクセス時の1回だけの想定
  // （匿名ログイン成功後は必ずuserが渡ってくるため）。
  if (!hasStartedSignIn) {
    hasStartedSignIn = true;
    if (IS_TEST_RUNNER) {
      console.info("自動テスト（tests.html）のため、Firebaseへの匿名ログインは行いません");
      return;
    }
    // 【2026-10-28】新規作成の前に、保存領域の状態を読むだけで記録しておく（最大800ミリ秒。挙動は変えない）
    probeStoredAuthUser()
      .catch(() => null)
      .then((probe) => {
        preSignInProbe = probe;
        createdNewAnonymousUserThisSession = true;
        return signInAnonymously(auth);
      })
      .catch((error) => {
        console.error("匿名ログインに失敗しました", error);
      });
  }
});

// 現在ログイン中のユーザーIDを返す。authReadyを待った後に呼ぶ想定。
export function getCurrentUid() {
  return auth.currentUser?.uid ?? null;
}
