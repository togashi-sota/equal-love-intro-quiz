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

let hasStartedSignIn = false;
onAuthStateChanged(auth, (user) => {
  if (user) {
    resolveAuthReady(user);
    return;
  }
  // ログインしていない状態で呼ばれるのは、初回アクセス時の1回だけの想定
  // （匿名ログイン成功後は必ずuserが渡ってくるため）。
  if (!hasStartedSignIn) {
    hasStartedSignIn = true;
    signInAnonymously(auth).catch((error) => {
      console.error("匿名ログインに失敗しました", error);
    });
  }
});

// 現在ログイン中のユーザーIDを返す。authReadyを待った後に呼ぶ想定。
export function getCurrentUid() {
  return auth.currentUser?.uid ?? null;
}
