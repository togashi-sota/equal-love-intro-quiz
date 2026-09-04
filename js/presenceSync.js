// フレンド（みんなのプロフィール）一覧の「オンライン状態」を管理する、Firebase実データと
// やり取りする層（2026-11-XX新設、本人指示）。純粋なロジック（オンライン判定・表示文言の
// 組み立て）はjs/presencePayloads.jsに分離してあり、このファイルはFirebaseの読み書きだけを
// 担当する（js/publicProfileSync.js・js/publicProfilePayloads.jsと同じ分離方針）。
//
// 【本人指示：既存のheartbeatと絶対に共用しない】このファイルはjs/audio.jsの
// startAudioUnlockHeartbeat()（iOS自動再生アンロック用）・js/onlineBattle.jsの
// 各種ルーム内プレゼンス（rooms/{roomId}/players/{uid}/connected等、対戦中の
// 在席確認用）とは完全に独立した、新規のFirebaseパス（presence/{uid}）・新規の
// setInterval・新規のonDisconnect予約だけを使う。既存のどのheartbeat・タイマー・
// Firebaseパスにも一切触れない。
//
// 【設計方針：複数端末対応】presence/{uid}/connectionsの下に、この接続（タブ／端末）
// ごとの一意な子ノードを1つ発行し、切断時にそのノードだけを自動で消す
// （onDisconnect().remove()）。「オンラインかどうか」はconnectionsに1件でも子が
// あるかで判定するため、複数端末で開いていても、どれか1台が閉じただけでは
// オフラインにならない（本人指示どおり）。
//
// 【なぜrooms/{roomId}/players/{uid}/connectedと同じ「単一のtrue/false」方式を
// 使わないか】その方式は「1つの接続だけを想定した状態」を表すのに向いているが、
// 複数端末が同じuidで同時に書き込むと、片方が切断した瞬間に他方がまだ繋がっていても
// falseに上書きされてしまう（本人が今回明確に禁止した挙動）。そのため、対戦ルーム内の
// 在席確認（1端末で1試合をプレイする前提）とは別の設計を、あえて新しく採用している。
import {
  ref,
  set,
  get,
  remove,
  push,
  onValue,
  off,
  onDisconnect,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
// 【2026-11-XX新設・本人指示：「🎮 プレイ中」表示】既存のonScreenChange（js/roomInviteUi.jsの
// 招待バナー表示判定と同じ、js/screens.jsの画面切り替え通知フック）を再利用する。新しい
// heartbeat・新しいタイマーは一切増やさず、「今どの画面を表示しているか」という既に
// 存在する情報だけからisPlayingを判定する（本人指示：ゲーム内heartbeat・audio
// heartbeatとは結合しない）。
import { onScreenChange } from "./screens.js";
import { isGameplayScreenName } from "./presencePayloads.js";

// 【本人指示：presence heartbeatは他のheartbeatと共用しない】接続が続いている間、
// lastSeenを定期的に上書きしておくための専用インターバル。onDisconnect()による
// 「切断時に自動で記録される」仕組みが主だが、万一の（サーバー側が切断を検知できない
// 特殊なネットワーク状況等の）保険として、接続中も定期的に更新しておく。
const PRESENCE_LASTSEEN_HEARTBEAT_INTERVAL_MS = 120000; // 2分ごと

let currentConnectionRef = null;
let infoConnectedUnsubscribe = null;
let lastSeenHeartbeatTimerId = null;
let isTracking = false;
// 【2026-11-XX新設・本人指示：「🎮 プレイ中」表示】自分のuidが分かった後だけ、
// 画面切り替えのたびにisPlayingを書き込めるようにするための保持。
let trackedUid = null;
let lastWrittenIsPlaying = null;

async function armPresenceForUid(uid) {
  const infoConnectedRef = ref(database, ".info/connected");
  const lastSeenRef = ref(database, `presence/${uid}/lastSeen`);
  const isPlayingRef = ref(database, `presence/${uid}/isPlaying`);

  // 【js/onlineBattle.jsの既存の.info/connected実装と同じ教訓】この監視は「接続が
  // 確立・再確立されるたびに」何度も発火する（切断→自動再接続のたびに再度trueになる）。
  // そのたびに新しい接続子ノードを発行し直す必要がある（onDisconnectの予約は個々の
  // 物理的な接続に紐づくため、再接続後は前回の予約が失われているとされている）。
  const handleValue = (snapshot) => {
    if (snapshot.val() !== true) return; // 切断中はここでは何もしない（onDisconnectの予約に任せる）
    const connectionRef = push(ref(database, `presence/${uid}/connections`));
    currentConnectionRef = connectionRef;
    onDisconnect(connectionRef).remove();
    set(connectionRef, true).catch(() => {});
    onDisconnect(lastSeenRef).set(serverTimestamp());
    set(lastSeenRef, serverTimestamp()).catch(() => {});
    // 【本人指示：切断時はプレイ中表示を残さない】再接続のたびに毎回予約し直す
    // （connectionRef・lastSeenRefの予約と同じ理由）。
    onDisconnect(isPlayingRef).set(false);
  };
  onValue(infoConnectedRef, handleValue);
  infoConnectedUnsubscribe = () => off(infoConnectedRef, "value", handleValue);
}

// 【2026-11-XX新設・本人指示：「🎮 プレイ中」表示】画面が切り替わるたびに1回だけ呼ばれる
// （js/screens.jsのshowScreen()からの通知）。対戦・出題中の画面かどうかをisGameplayScreenName()
// だけで判定し、直前と同じ値なら無駄な書き込みをしない。認証未完了・presence未開始の間は
// 何もしない（起動直後の画面遷移で失敗ログを出さないため）。
onScreenChange((screenName) => {
  if (!trackedUid) return;
  const isPlaying = isGameplayScreenName(screenName);
  if (isPlaying === lastWrittenIsPlaying) return;
  lastWrittenIsPlaying = isPlaying;
  set(ref(database, `presence/${trackedUid}/isPlaying`), isPlaying).catch(() => {});
});

// アプリ起動時に1回だけ呼ぶ想定（js/main.js参照）。認証待ちを含むため非同期だが、
// 呼び出し側をブロックしない（awaitせず呼び捨てにされてよい設計）。
export async function startFriendPresenceTracking() {
  if (isTracking) return;
  isTracking = true;
  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) {
      isTracking = false;
      return;
    }
    await armPresenceForUid(uid);
    const lastSeenRef = ref(database, `presence/${uid}/lastSeen`);
    lastSeenHeartbeatTimerId = setInterval(() => {
      set(lastSeenRef, serverTimestamp()).catch(() => {});
    }, PRESENCE_LASTSEEN_HEARTBEAT_INTERVAL_MS);
    // 【実機相当のBrowserペイン確認で発見・修正済みの過去のバグ（js/roomInviteUi.jsの
    // currentScreenName初期化漏れ）と同じ理由】起動時点で既にshowScreen()が呼ばれ終えて
    // いる可能性があるため、以後のonScreenChange通知を待つだけでなく、ここで現在画面を
    // 直接読んで初期値を書き込む。
    trackedUid = uid;
    const initialIsPlaying = isGameplayScreenName(document.body.dataset.screen ?? null);
    lastWrittenIsPlaying = initialIsPlaying;
    set(ref(database, `presence/${uid}/isPlaying`), initialIsPlaying).catch(() => {});
  } catch (error) {
    console.warn("フレンドpresenceの開始に失敗しました（フレンド一覧のオンライン表示に影響する可能性があります）", error);
    isTracking = false;
  }
}

// テスト・将来の明示的な後始末のために用意する（現状、通常のアプリ利用では
// ページを開いている間ずっと呼び続けたままでよく、明示的に停止する必要はない）。
export function stopFriendPresenceTracking() {
  if (infoConnectedUnsubscribe) {
    infoConnectedUnsubscribe();
    infoConnectedUnsubscribe = null;
  }
  if (lastSeenHeartbeatTimerId !== null) {
    clearInterval(lastSeenHeartbeatTimerId);
    lastSeenHeartbeatTimerId = null;
  }
  if (currentConnectionRef) {
    remove(currentConnectionRef).catch(() => {});
    currentConnectionRef = null;
  }
  trackedUid = null;
  lastWrittenIsPlaying = null;
  isTracking = false;
}

export function hasActiveFriendPresenceTracking() {
  return isTracking;
}

// フレンド一覧画面が開いている間だけ、全員分のpresenceを1本のonValueで監視する
// （本人指示と同じく「みんなのプロフィール」は全員分をまとめて扱う設計のため、
// publicProfilesの一括取得と対になる形にした）。callbackには
// { [uid]: {connections, lastSeen} } 形式の生データをそのまま渡す（画面側で
// js/presencePayloads.jsの関数を使って表示用に変換する）。
export function subscribeToAllPresence(callback) {
  const presenceRef = ref(database, "presence");
  const handleValue = (snapshot) => {
    callback(snapshot.exists() ? snapshot.val() : {});
  };
  onValue(presenceRef, handleValue);
  return () => off(presenceRef, "value", handleValue);
}

// 【2026-11-XX新設・本人指示：ルーム招待】招待相手（オンラインのフレンド）を選ぶ一覧のように、
// 画面を開いている間ずっと監視し続ける必要はなく「今この瞬間のオンライン状況」が1回わかれば
// 十分な場面向けの、一回だけの取得版。subscribeToAllPresence()と違い、購読の開始・停止管理を
// 呼び出し側に持たせずに済む（js/publicProfileSync.jsのfetchAllPublicProfiles()と同じ考え方）。
export async function fetchAllPresenceOnce() {
  try {
    await authReady;
    const snapshot = await get(ref(database, "presence"));
    return snapshot.exists() ? snapshot.val() : {};
  } catch (error) {
    console.warn("presenceの一括取得に失敗しました", error);
    return {};
  }
}
