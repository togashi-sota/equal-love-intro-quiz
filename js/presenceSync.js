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
  update,
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
import {
  isGameplayScreenName,
  selectStaleOwnConnectionIds,
  computeServerNowMs,
  shouldWriteResumeHeartbeat,
  shouldTryConnectionTimestamp,
  buildPresenceHeartbeatWrites,
  decideHeartbeatDenialAction,
  decideHiddenPresenceDelayMs,
  PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY,
} from "./presencePayloads.js";
import { setPresenceFact } from "./presenceDiagnostics.js";

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
// 【2026-10-28追加・本人の実機報告「オンラインなのにオフライン表示」】在席ノードの書き込みが Rules に
// 拒否された（例：UIDが変わった直後で publicProfiles/{新UID} がまだ無い）とき、.info/connected は
// 再発火しないため、以前はそのセッションの間ずっと在席ノードが作られなかった（isTracking は true のまま）。
// 拒否されたことを覚えておき、公開プロフィールの作成に成功した後などに「張り直し」できるようにする。
let connectionWriteFailed = false;
// 直近に lastSeen を書いた時刻（端末時刻）。画面復帰時の即時更新を短時間に何度も行わないため。
let lastHeartbeatWrittenAtMs = 0;
// 【2026-10-31追加・本人の実機報告「サブがアプリを閉じたのに、1日ずっとオンライン」】
// 画面が隠れている間（ホームへ戻した・別のアプリへ切り替えた）は、自分の接続ノードを外してハートビートを止める。
// backgroundPaused … 外している最中か。true の間は .info/connected が再発火しても接続ノードを作らない。
// hiddenPauseTimerId … 猶予つきで外すときの予約（オンライン対戦の画面など。戻ってきたら取り消す）。
let backgroundPaused = false;
let hiddenPauseTimerId = null;

// 【2026-10-28追加】Firebase のサーバー時刻と端末時刻の差（.info/serverTimeOffset、端末内で計算される値で
// 読み取り課金は発生しない）。フレンド一覧の「オンライン／最終接続」をサーバー時刻基準で判定するために使う。
let serverTimeOffsetMs = 0;
let serverTimeOffsetListening = false;

function ensureServerTimeOffsetListener() {
  if (serverTimeOffsetListening) return;
  serverTimeOffsetListening = true;
  try {
    onValue(ref(database, ".info/serverTimeOffset"), (snapshot) => {
      const value = snapshot.val();
      serverTimeOffsetMs = typeof value === "number" && Number.isFinite(value) ? value : 0;
    });
  } catch {
    serverTimeOffsetListening = false;
  }
}

// フレンド一覧の判定に使う「今」（サーバー時刻の推定値）。
export function getPresenceNowMs() {
  return computeServerNowMs(Date.now(), serverTimeOffsetMs);
}

// 在席ノードの書き込みが拒否されたまま（＝張り直しが必要）かどうか。
export function needsFriendPresenceRearm() {
  return isTracking && connectionWriteFailed;
}

// 【2026-10-28追加：接続ごとの生存時刻（js/presencePayloads.js の説明参照）】
//   "unknown"  … まだ試していない
//   "supported" … 接続ノードへ時刻を書けた（Rules 更新済み）→ ハートビートで接続ノードも更新する
//   "unsupported" … 今の Rules では拒否された → 従来どおり true のまま（24時間は試さない）
let connectionTimestampMode = "unknown";
let isInfoConnected = false;

function readConnectionTimestampUnsupportedAt() {
  try {
    const value = Number(localStorage.getItem(PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function rememberConnectionTimestampUnsupported() {
  connectionTimestampMode = "unsupported";
  try {
    localStorage.setItem(PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY, String(Date.now()));
  } catch {
    // 覚えられなくても、このセッション中は unsupported のまま
  }
}

function isPresencePermissionDenied(error) {
  return /PERMISSION_DENIED|permission_denied|permission-denied/i.test(`${error?.code ?? ""} ${error?.message ?? ""}`);
}

// 接続ノードを書く。
// 【2026-10-28改訂（エミュレータ検証で発見した「消えた接続の書き戻し」対策）】
//   まず必ず true で作り（今の本番 Rules・提案 Rules のどちらでも通る）、その後に時刻（数値）へ書き換えてみる。
//   提案 Rules は「既に存在する接続ノードしか時刻へ更新できない」（data.exists()）ため、通信が切れている間に
//   送れなかったハートビートが再接続後に送り直されても、サーバーが onDisconnect で消した古い接続ノードは
//   書き戻されない（以前は書き戻されて「閉じた後も通信不明」の残骸になっていた）。
//   今の本番 Rules では時刻への書き換えが拒否される → true のまま（従来どおりの表示）。24時間は試さない。
function writeConnectionNode(connectionRef) {
  const tryTimestamp =
    connectionTimestampMode !== "unsupported" &&
    shouldTryConnectionTimestamp({ unsupportedAtMs: readConnectionTimestampUnsupportedAt(), nowMs: Date.now() });
  if (!tryTimestamp) return set(connectionRef, true);
  return set(connectionRef, true).then(() =>
    set(connectionRef, serverTimestamp()).then(
      () => {
        connectionTimestampMode = "supported";
      },
      (error) => {
        // 通信エラー等は true のまま（表示は従来どおり）。次の接続で再挑戦する
        if (!isPresencePermissionDenied(error)) return;
        // 拒否の理由が「接続ノードがもう無い」（作った直後に切断され、サーバーが消した）なら Rules の問題ではない。
        // 読み取り1回で確かめ、ノードが残っている（＝Rules が時刻を許さない）ときだけ「使えない」と覚える
        return get(connectionRef).then(
          (snapshot) => {
            if (snapshot.exists()) rememberConnectionTimestampUnsupported();
          },
          () => {}
        );
      }
    )
  );
}

function writeHeartbeat(uid) {
  lastHeartbeatWrittenAtMs = Date.now();
  const connectionRefAtWrite = currentConnectionRef;
  const writes = buildPresenceHeartbeatWrites({
    timestampMode: connectionTimestampMode,
    connectionKey: connectionRefAtWrite?.key ?? null,
    connected: isInfoConnected,
    serverTimestampValue: serverTimestamp(),
  });
  const lastSeenRef = ref(database, `presence/${uid}/lastSeen`);
  if (Object.keys(writes).length === 1) {
    set(lastSeenRef, writes.lastSeen).catch(() => {});
    return;
  }
  // lastSeen と自分の接続ノードを1回の書き込みでまとめて更新する（書き込み回数は増やさない）
  update(ref(database, `presence/${uid}`), writes).catch((error) => {
    if (!isPresencePermissionDenied(error)) return;
    // 提案 Rules で拒否された＝自分の接続ノードがサーバーに無い。lastSeen だけは書いておく
    set(lastSeenRef, serverTimestamp()).catch(() => {});
    const action = decideHeartbeatDenialAction({
      deniedConnectionKey: connectionRefAtWrite?.key ?? null,
      currentConnectionKey: currentConnectionRef?.key ?? null,
      connected: isInfoConnected,
    });
    // 今も使っている接続のノードが消されていた（例：別の端末の掃除・手動削除）ときだけ作り直す。
    // 再接続前の古い接続の送り直しが拒否された場合は、何もしない（新しい接続ノードは既に作ってある）
    if (action === "recreate-connection" && currentConnectionRef) {
      writeConnectionNode(currentConnectionRef).catch(() => {});
    }
  });
}

async function armPresenceForUid(uid) {
  const infoConnectedRef = ref(database, ".info/connected");

  // 【js/onlineBattle.jsの既存の.info/connected実装と同じ教訓】この監視は「接続が
  // 確立・再確立されるたびに」何度も発火する（切断→自動再接続のたびに再度trueになる）。
  // そのたびに新しい接続子ノードを発行し直す必要がある（onDisconnectの予約は個々の
  // 物理的な接続に紐づくため、再接続後は前回の予約が失われているとされている）。
  const handleValue = (snapshot) => {
    isInfoConnected = snapshot.val() === true;
    if (snapshot.val() !== true) return; // 切断中はここでは何もしない（onDisconnectの予約に任せる）
    // 【2026-10-31】画面が隠れている間は接続ノードを作らない（戻ったときに resumePresenceFromBackground が作る）
    if (backgroundPaused) return;
    armConnectionNode(uid);
  };
  onValue(infoConnectedRef, handleValue);
  infoConnectedUnsubscribe = () => off(infoConnectedRef, "value", handleValue);
}

// 接続ノードを1つ作り、切断時の後片付け（onDisconnect）を予約する。.info/connected が true になるたび、
// および画面へ戻ったとき（2026-10-31）に呼ぶ。
function armConnectionNode(uid) {
  const lastSeenRef = ref(database, `presence/${uid}/lastSeen`);
  const isPlayingRef = ref(database, `presence/${uid}/isPlaying`);
  // 【2026-10-31追加（エミュレータ検証で発見）】このタブが前に作った接続ノードが残っていれば、先に外す。
  // 画面へ戻った瞬間に通信が実は固まっていた場合、そのとき作った接続ノードの onDisconnect はサーバーに届かず、
  // 再接続の後に「誰も消さない残骸」になっていた。1つのタブの接続ノードは常に1つだけにする。
  const previousConnectionRef = currentConnectionRef;
  if (previousConnectionRef) {
    onDisconnect(previousConnectionRef).cancel().catch(() => {});
    remove(previousConnectionRef).catch(() => {});
  }
  {
    const connectionRef = push(ref(database, `presence/${uid}/connections`));
    currentConnectionRef = connectionRef;
    onDisconnect(connectionRef).remove();
    // 【2026-10-28】接続ごとの生存時刻（Rules が許せば数値、拒否されたら従来どおり true）
    writeConnectionNode(connectionRef)
      .then(() => {
        connectionWriteFailed = false;
        setPresenceFact("writeError", null);
      })
      .catch((error) => {
        // 診断表示用：Rulesに拒否された場合（permission_denied＝今のIDに公開プロフィールが無い等）が分かるようにする
        connectionWriteFailed = true;
        setPresenceFact("writeError", error?.code ?? error?.message ?? "unknown");
      });
    setPresenceFact("connected", true);
    onDisconnect(lastSeenRef).set(serverTimestamp());
    lastHeartbeatWrittenAtMs = Date.now();
    set(lastSeenRef, serverTimestamp()).catch(() => {});
    // 【本人指示：切断時はプレイ中表示を残さない】再接続のたびに毎回予約し直す
    // （connectionRef・lastSeenRefの予約と同じ理由）。
    onDisconnect(isPlayingRef).set(false);
    // 【2026-10-23追加・「ゆき」の不具合】onDisconnect が実行されずに残った「自分の」古い接続ノードを、
    // 次に接続したときに本人の端末が掃除する。消すのは作成から24時間以上たったものだけで、
    // 今作った接続と、他の人の presence には一切触れない（Rules上も本人の presence しか書けない）。
    const thisConnectionId = connectionRef.key;
    get(ref(database, `presence/${uid}/connections`))
      .then((snapshot) => {
        // 【2026-10-28】時刻つきの接続ノードは「最後の生存時刻」がサーバー時刻で1時間より古ければ残骸として消す
        const staleIds = selectStaleOwnConnectionIds(snapshot.val(), thisConnectionId, Date.now(), undefined, { serverNowMs: getPresenceNowMs() });
        staleIds.forEach((connectionId) => {
          remove(ref(database, `presence/${uid}/connections/${connectionId}`)).catch(() => {});
        });
      })
      .catch(() => {});
  }
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
  if (isTracking) {
    // 【2026-10-28追加】在席ノードの書き込みが拒否されたままなら、いったん止めて張り直す
    // （公開プロフィールが後から作られた場合に、そのセッションのうちにオンライン表示へ戻すため）
    if (!connectionWriteFailed) return;
    stopFriendPresenceTracking();
    connectionWriteFailed = false;
  }
  isTracking = true;
  ensureServerTimeOffsetListener();
  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) {
      isTracking = false;
      return;
    }
    setPresenceFact("tracking", true);
    // 【2026-10-31】起動した時点で画面が隠れていれば（裏で開かれた等）、接続ノードは画面へ戻ったときに作る
    backgroundPaused = typeof document !== "undefined" && document.visibilityState === "hidden";
    await armPresenceForUid(uid);
    if (!backgroundPaused) startHeartbeatTimer(uid);
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
    setPresenceFact("tracking", false);
    setPresenceFact("writeError", error?.code ?? error?.message ?? "start-failed");
  }
}

// 2分ごとのハートビート（lastSeen の更新）を始める。二重には始めない。
function startHeartbeatTimer(uid) {
  if (lastSeenHeartbeatTimerId !== null) return;
  const lastSeenRef = ref(database, `presence/${uid}/lastSeen`);
  lastSeenHeartbeatTimerId = setInterval(() => {
    // 【2026-10-28】接続ごとの生存時刻が使えるときは、lastSeen と一緒に自分の接続ノードも更新する（1回の書き込み）
    if (connectionTimestampMode === "supported") {
      writeHeartbeat(uid);
      return;
    }
    lastHeartbeatWrittenAtMs = Date.now();
    set(lastSeenRef, serverTimestamp()).catch(() => {});
  }, PRESENCE_LASTSEEN_HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeatTimer() {
  if (lastSeenHeartbeatTimerId !== null) {
    clearInterval(lastSeenHeartbeatTimerId);
    lastSeenHeartbeatTimerId = null;
  }
}

function clearHiddenPauseTimer() {
  if (hiddenPauseTimerId !== null) {
    clearTimeout(hiddenPauseTimerId);
    hiddenPauseTimerId = null;
  }
}

// 【2026-10-31追加】画面が隠れた：ハートビートを止め、この端末（このタブ）の接続ノードだけを外し、lastSeen を最後に1回書く。
// 他の端末・他のタブの接続ノードには触れない（同じ人が別の端末で開いていれば、そちらでオンラインのまま）。
// .info/connected の監視・lastSeen と isPlaying の onDisconnect の予約はそのまま（切断時の後片付けは今までどおり）。
export function pausePresenceForBackground() {
  clearHiddenPauseTimer();
  if (!isTracking || !trackedUid || backgroundPaused) return false;
  backgroundPaused = true;
  stopHeartbeatTimer();
  const connectionRef = currentConnectionRef;
  currentConnectionRef = null;
  if (connectionRef) {
    onDisconnect(connectionRef).cancel().catch(() => {});
    remove(connectionRef).catch(() => {});
  }
  lastHeartbeatWrittenAtMs = Date.now();
  set(ref(database, `presence/${trackedUid}/lastSeen`), serverTimestamp()).catch(() => {});
  setPresenceFact("connected", false);
  return true;
}

// 【2026-10-31追加】画面へ戻った：接続ノードを付け直し（onDisconnect も付け直す）、ハートビートを再開する。
export function resumePresenceFromBackground() {
  clearHiddenPauseTimer();
  if (!backgroundPaused) return false;
  backgroundPaused = false;
  if (!isTracking || !trackedUid) return false;
  if (isInfoConnected) armConnectionNode(trackedUid); // 切断中なら、再接続（.info/connected）のときに作られる
  startHeartbeatTimer(trackedUid);
  return true;
}

// テスト・診断用：今、画面が隠れているために接続ノードを外しているか
export function isPresencePausedForBackground() {
  return backgroundPaused;
}

// 【Stage1・本人指示】公開プロフィールをOFFにしたとき、および同じ端末で公開OFFの
// プレイヤーへ切り替えたときに呼ぶ（js/publicProfileSync.jsのsyncFriendPresenceToActivePlayer()・
// setPublicProfileSharingEnabled()参照）。connections子ノードの削除に加えて、
// armPresenceForUid()がlastSeen・isPlayingへ予約したonDisconnect自体もここで明示的に
// cancel()する。cancelしないまま放置すると、その後何らかの理由でこのタブが切断された
// ときに、既に停止・削除したはずのpresenceへ古いonDisconnect予約が発火してしまう
// 可能性があるため（本人指示：「OFF後に古いonDisconnect予約が残らないようにする」）。
export function stopFriendPresenceTracking() {
  if (infoConnectedUnsubscribe) {
    infoConnectedUnsubscribe();
    infoConnectedUnsubscribe = null;
  }
  stopHeartbeatTimer();
  clearHiddenPauseTimer();
  backgroundPaused = false;
  if (currentConnectionRef) {
    onDisconnect(currentConnectionRef).cancel().catch(() => {});
    remove(currentConnectionRef).catch(() => {});
    currentConnectionRef = null;
  }
  if (trackedUid) {
    onDisconnect(ref(database, `presence/${trackedUid}/lastSeen`)).cancel().catch(() => {});
    onDisconnect(ref(database, `presence/${trackedUid}/isPlaying`)).cancel().catch(() => {});
  }
  trackedUid = null;
  lastWrittenIsPlaying = null;
  isInfoConnected = false;
  isTracking = false;
  setPresenceFact("tracking", false);
  setPresenceFact("connected", false);
}

// 【Stage1・本人指示】presence/{uid}を丸ごと削除する。公開プロフィールをOFFにしたときに、
// stopFriendPresenceTracking()の直後（まだpublicProfiles/{uid}が存在するうちに。
// firebase/database.rules.jsonのpresence書き込みルールは「publicProfiles/{uid}が
// 存在すること」を書き込み条件にする予定のため、削除する順番はpublicProfiles削除より
// 必ず先にする必要がある）に呼ぶ想定。js/publicProfileSync.jsのdeletePublicProfile()と
// 対になる、presence側の削除関数。
export async function deleteFriendPresence() {
  try {
    await authReady;
    const uid = getCurrentUid();
    if (!uid) return;
    await remove(ref(database, `presence/${uid}`));
  } catch (error) {
    console.warn("presenceの削除に失敗しました", error);
  }
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
  ensureServerTimeOffsetListener();
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

// 【2026-10-28追加・本人の実機報告（iPhoneでロック・バックグラウンドから戻った直後の表示ずれ）】
// iOS ではバックグラウンド中に setInterval が止まるため、復帰直後は lastSeen が最大で数分古いまま
// 残ることがある。画面が再び表示されたときに1回だけ lastSeen を更新する（30秒以内に書いていれば書かない）。
// 追加の書き込みは「アプリへ戻った回数」ぶんだけ（1回数十バイト）で、読み取りは増えない。
// 【2026-10-31改訂・本人の判断】バックグラウンドへ行ったら、自分の接続ノードを外す（上の pausePresenceForBackground）。
// オンライン対戦などの画面では60秒の猶予の後に外す（js/presencePayloads.js の decideHiddenPresenceDelayMs）。
// 画面へ戻ったら付け直す。ページを離れる・閉じる（pagehide）ときは猶予なしで外す。
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (!isTracking || backgroundPaused) return;
      const delayMs = decideHiddenPresenceDelayMs({ screenName: document.body?.dataset?.screen ?? null, reason: "hidden" });
      clearHiddenPauseTimer();
      if (delayMs <= 0) pausePresenceForBackground();
      else hiddenPauseTimerId = setTimeout(pausePresenceForBackground, delayMs);
      return;
    }
    if (document.visibilityState === "visible") {
      clearHiddenPauseTimer();
      if (resumePresenceFromBackground()) return; // 付け直しで lastSeen も書かれる
    }
    if (
      shouldWriteResumeHeartbeat({
        visibilityState: document.visibilityState,
        trackedUid,
        nowMs: Date.now(),
        lastWrittenAtMs: lastHeartbeatWrittenAtMs,
      })
    ) {
      writeHeartbeat(trackedUid);
    }
  });
  // 【2026-10-31追加】ページを離れる・アプリを閉じる（iOS のホーム画面アプリを上へスワイプして終了した場合など）。
  // 猶予なしで、この端末の接続ノードを外す（届かなくても、サーバーが切断に気付けば onDisconnect が消す）。
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("pagehide", () => {
      if (isTracking) pausePresenceForBackground();
    });
    // 戻る・進むのキャッシュ（bfcache）から戻ったときは、画面へ戻ったのと同じ扱い
    window.addEventListener("pageshow", (event) => {
      if (event?.persisted && document.visibilityState === "visible") resumePresenceFromBackground();
    });
  }
}
