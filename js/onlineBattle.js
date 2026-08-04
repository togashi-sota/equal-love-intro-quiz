// オンライン対戦（Firebase Realtime Database）のルーム管理を担当するデータ層。
// Step1：ルーム作成・参加・参加者一覧のリアルタイム監視・退出・切断検知・再接続。
// Step2：対戦モード切り替え・対戦設定の同期・準備完了・サーバー時刻を使ったカウントダウン開始。
//
// 【設計方針：roomId中心のデータ構造、gameModeで拡張】Realtime Database上のデータは
// rooms/{roomId}/{version, host, createdAt, maxPlayers, status, gameMode, settings,
//                  settingsRevision, seed, countdownStartedAt, players, results}
// という形にしている。resultsはStep3で使う項目のため、Step2ではまだ書き込まない（空のまま）。
//
// gameMode（"timeAttack"等）ごとの出題・結果ロジックは、このファイルからは一切参照せず、
// js/battleModes/配下のアダプター（js/battleModes/index.js経由）に委ねている。
// 将来ランダム再生クイズ・歌詞クイズ・推しメンクイズ等を追加するときも、このファイルの
// 変更は基本的に不要（js/battleModes/に新しいアダプターを1つ追加するだけで済む設計）。
//
// versionはRoomのデータ構造そのもののバージョン（将来、構造を変えるときの互換性判定に使う。
// 構造を変えたら必ず上げること）。
//
// 【画面側との役割分担】このファイルはFirebaseとの読み書きだけを担当し、画面の組み立て・
// ボタンのイベント登録はjs/onlineBattleScreen.js側が担当する（このプロジェクトの
// 「エンジンは再利用、画面は専用ファイル」という既存パターンと同じ考え方）。

import {
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  off,
  onDisconnect,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { BASE32_ALPHABET } from "./bitCode.js";
import { generateRandomSeed } from "./seededRandom.js";
import { createDefaultSettings, isKnownGameMode, validateRoomSettings } from "./battleModes/index.js";

const ROOM_ID_LENGTH = 6;
const LAST_ROOM_STORAGE_KEY = "equalLoveIntroQuiz.onlineBattle.lastRoom";

// Roomのデータ構造そのもののバージョン。将来フィールド構成を変えた際、
// 「古い構造のRoomが残っていないか」等の判定に使える。構造を変えたら必ず上げること。
export const ROOM_SCHEMA_VERSION = 1;

// Step2時点で選べる対戦モードはタイムアタックのみ。将来ロビー画面にモード選択UIを
// 追加するまでは、ルーム作成時に常にこのモードを使う。
export const DEFAULT_GAME_MODE = "timeAttack";

// ルームの進行状態。文字列の列挙にしているのは、後から値を追加しても既存コードの
// 型を壊さずに済むため。Step2で実際に使うのはWAITING・COUNTDOWN・PLAYINGの3つだが、
// 観戦モード・大会モード等を将来追加しやすいよう、想定される状態を先に名前だけ確保しておく
// （本人の要望）。
export const ROOM_STATUS = {
  WAITING: "waiting", // ロビーで参加者を待っている・設定を調整している
  SETTING: "setting", // （将来用）設定変更中であることを明示的に示したい場合
  READY: "ready", // （将来用）全員準備完了
  COUNTDOWN: "countdown", // 開始直前のカウントダウン演出中（Step2で実装）
  PLAYING: "playing", // 出題中（Step2はここまで。実際の出題・回答画面はStep3で実装）
  RESULT: "result", // （将来用）結果集計・表示中
  FINISHED: "finished", // （将来用）対戦終了
};

// ホストが「開始する」を押してから、実際に出題が始まるまでの固定の待ち時間。
// 全端末がこの同じ長さを知っているからこそ、「サーバー時刻＋この時間」を共有するだけで
// 開始タイミングを揃えられる。
export const COUNTDOWN_DURATION_MS = 3000;

// オンライン対戦のシードは、対戦コードのような短い文字列に収める制約が無いため、
// オフライン対戦（js/localBattle.js、24bit）より広い32bitをそのまま使う。
const ONLINE_SEED_BITS = 32;

// 6文字のルームコードを1つ作る。対戦コード（js/localBattle.js）と同じBase32文字セット
// （紛らわしいI・L・O・Uを含まない）を再利用し、見た目の一貫性を保っている。
function generateRoomId() {
  let id = "";
  for (let i = 0; i < ROOM_ID_LENGTH; i++) {
    id += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)];
  }
  return id;
}

// 既存のルームと重複しないコードが見つかるまで生成し直す（最大5回試行）。
// 32^6 ≈ 10億通りあるため、個人利用の規模で衝突することはまず無いが、
// 念のため「万一衝突したら作り直す」安全策を入れている。
async function generateUniqueRoomId() {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateRoomId();
    const snapshot = await get(ref(database, `rooms/${candidate}`));
    if (!snapshot.exists()) return candidate;
  }
  throw new Error("ルームコードの生成に失敗しました。もう一度お試しください。");
}

// 【接続状態の自己修復（プレゼンス管理）】実機検証で発見：onDisconnect()の予約は
// 「接続が切れた瞬間に1回だけ実行される」ものでしかなく、その後アプリに戻って接続が
// 回復しても、connected:trueへは自動的に戻らない。そのため、スマホをバックグラウンドに
// 回して戻ってくると「切断中」の表示が直らないまま固定されてしまう不具合があった。
//
// 対策として、Firebase公式が推奨する「.info/connected」という特別な監視パス
// （クライアントSDKが、サーバーとの接続の生死を常に反映してくれる仕組み）を使う。
// 接続が確立・再確立されるたびに、自分の接続状態をconnected:trueへ書き戻し、
// 次に切断したときのためにonDisconnectの予約も毎回張り直す。
let presenceUnsubscribe = null;
let presenceRoomId = null;
let presenceUid = null;

function startPresenceTracking(roomId, uid) {
  stopPresenceTracking();
  presenceRoomId = roomId;
  presenceUid = uid;
  const infoConnectedRef = ref(database, ".info/connected");
  const playerConnectedRef = ref(database, `rooms/${roomId}/players/${uid}/connected`);

  const handleValue = (snapshot) => {
    if (snapshot.val() !== true) {
      return; // 切断中はここでは何もしない（onDisconnectの予約に任せる）
    }
    // 「次に切断したらfalseにする」予約を毎回張り直してから、今の接続状態をtrueにする。
    onDisconnect(playerConnectedRef).set(false);
    set(playerConnectedRef, true);
  };
  onValue(infoConnectedRef, handleValue);
  presenceUnsubscribe = () => off(infoConnectedRef, "value", handleValue);
}

// 【画面の表示/非表示による、より速く確実な切断表示】実機検証で発見：OS（特にiOS）は
// アプリをバックグラウンドに回しても、しばらく通信を維持し続けることがあり、サーバー側の
// 切断検知（onDisconnect）だけに頼ると、実際に画面を離れてから「切断中」と表示されるまで
// 数分以上かかる・反映されないことがあった。
// 「その場を離れたら、ちゃんとすぐ切断中と分かるようにしたい」という要望に対応し、
// ページの表示/非表示が切り替わった瞬間に、自分でconnectedを書き換えることで、
// OS側の通信維持のタイミングに左右されず、即座に反映されるようにする。
function handlePresenceVisibilityChange() {
  if (!presenceRoomId || !presenceUid) return;
  const playerConnectedRef = ref(database, `rooms/${presenceRoomId}/players/${presenceUid}/connected`);
  set(playerConnectedRef, document.visibilityState === "visible");
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", handlePresenceVisibilityChange);
}

function stopPresenceTracking() {
  presenceRoomId = null;
  presenceUid = null;
  if (presenceUnsubscribe) {
    presenceUnsubscribe();
    presenceUnsubscribe = null;
  }
}

// ===== 公開API：ルーム作成・参加・退出 =====

// 新しいルームを作り、自分をホストとして登録する。
// gameModeはStep2時点では省略可（DEFAULT_GAME_MODEが使われる）。
// 戻り値：{ ok: true, roomId } または { ok: false, reason }
export async function createRoom({ playerName, maxPlayers, gameMode = DEFAULT_GAME_MODE }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const settings = createDefaultSettings(gameMode);
  if (!settings) return { ok: false, reason: "unsupported-mode" };

  let roomId;
  try {
    roomId = await generateUniqueRoomId();
  } catch (error) {
    return { ok: false, reason: "id-generation-failed" };
  }

  const roomData = {
    version: ROOM_SCHEMA_VERSION,
    host: uid,
    createdAt: Date.now(),
    maxPlayers,
    status: ROOM_STATUS.WAITING,
    gameMode,
    settings,
    settingsRevision: 0,
    players: {
      [uid]: { name: playerName, isHost: true, joinedAt: Date.now(), connected: true, ready: false, readyForRevision: 0 },
    },
  };

  try {
    await set(ref(database, `rooms/${roomId}`), roomData);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }

  startPresenceTracking(roomId, uid);
  saveLastRoom(roomId, playerName);
  return { ok: true, roomId };
}

// ===== 参加処理（3つの小さな関数に分割）=====
// 本人の要望：将来「大会モード」「公開ルーム（誰でも参加できる）」「パスワード付きルーム」
// のように参加条件だけが違うバリエーションを追加しやすいよう、joinRoom()を
// 「参加できるか確認する」「自分の枠を確保する」「後片付けをする」の3段階に分けておく。
// 今のところ呼び出し順が変わることはないが、将来checkCapacity()やreservePlayerSlot()
// だけを差し替える形で拡張できる。

// 現在のルームの状態から、参加できるかどうかを判定する（読み取り専用、書き込みは行わない）。
// 戻り値：{ ok: true, alreadyJoined } または { ok: false, reason }
function checkCapacity(room, uid) {
  const isWellFormedRoom =
    room !== null &&
    typeof room.host === "string" &&
    typeof room.maxPlayers === "number" &&
    typeof room.status === "string";
  if (!isWellFormedRoom) {
    return { ok: false, reason: "not-found" };
  }

  // 【本人の要望：バージョン不一致・未対応モードの安全な拒否】自分のアプリが知らない
  // データ構造・対戦モードのルームに、中途半端な理解のまま参加してしまう事故を防ぐ。
  if (room.version !== ROOM_SCHEMA_VERSION) {
    return { ok: false, reason: "version-mismatch" };
  }
  if (!isKnownGameMode(room.gameMode)) {
    return { ok: false, reason: "unsupported-mode" };
  }

  const players = room.players || {};
  const alreadyJoined = Object.prototype.hasOwnProperty.call(players, uid);
  if (alreadyJoined) {
    return { ok: true, alreadyJoined: true }; // 再接続は満員・状態チェックの対象外
  }

  if (Object.keys(players).length >= room.maxPlayers) {
    return { ok: false, reason: "full" };
  }
  if (room.status !== ROOM_STATUS.WAITING) {
    return { ok: false, reason: "not-waiting" };
  }
  return { ok: true, alreadyJoined: false };
}

// 自分の参加者エントリを実際に書き込む。新規参加ならisHost:false・ready:falseで
// 新規作成し、再接続なら既存のisHost・joinedAt等を保ったまま名前とconnectedだけ更新する。
// 【設計メモ：runTransaction()を使わない理由】Step1では「ルーム全体」を対象にした
// runTransaction()で参加人数を厳密にチェックしていたが、実機検証でFirebase RTDB SDK側の
// 未解明の癖（本来nullを受け取るべき場面で中途半端なデータを受け取る等）に何度も悩まされた。
// また、ルーム全体を対象にすると「ホストだけが設定を書き換えられる」というセキュリティルールと
// 両立しない（参加者はルーム全体への書き込み権限を持たないため）。
// 本人と相談のうえ、「参加人数を確認してから、自分の枠だけ直接書き込む」というシンプルな
// 方式に変更した。ごく稀に「満員ちょうどのタイミングで2人が同時に参加すると、一瞬だけ
// 定員を1人超える」可能性が理論上残るが、友達内で遊ぶ規模では実害がほぼ無いと判断し、
// 安定性・保守性を優先した（本人合意済み、2026-08-08）。
async function reservePlayerSlot({ roomId, uid, playerName, alreadyJoined }) {
  const playerRef = ref(database, `rooms/${roomId}/players/${uid}`);
  if (alreadyJoined) {
    const snapshot = await get(playerRef);
    const existing = snapshot.val() || {};
    await set(playerRef, { ...existing, name: playerName, connected: true });
  } else {
    await set(playerRef, {
      name: playerName,
      isHost: false,
      joinedAt: Date.now(),
      connected: true,
      ready: false,
      readyForRevision: 0,
    });
  }
}

// 参加成功後の後片付け（切断検知の登録・「前回のルーム」記憶の保存）。
function finalizeJoin(roomId, playerName, uid) {
  startPresenceTracking(roomId, uid);
  saveLastRoom(roomId, playerName);
}

// 既存のルームに参加する。すでに自分（同じUID）がそのルームの参加者だった場合は、
// 新規参加ではなく「再接続」として扱う（connectedをtrueに戻すだけで、名前だけ更新する）。
// 戻り値：{ ok: true, roomId } または
//   { ok: false, reason: "not-found" | "full" | "not-waiting" | "version-mismatch" | "unsupported-mode" }
export async function joinRoom({ roomId, playerName }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  const capacity = checkCapacity(snapshot.exists() ? snapshot.val() : null, uid);
  if (!capacity.ok) {
    return { ok: false, reason: capacity.reason };
  }

  try {
    await reservePlayerSlot({ roomId, uid, playerName, alreadyJoined: capacity.alreadyJoined });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }

  finalizeJoin(roomId, playerName, uid);
  return { ok: true, roomId };
}

// ルームから退出する。ホストが退出した場合はルームごと解散する
// （Step1では権限の引き継ぎ等は行わない、という本人合意済みの方針。カウントダウン中・
// 出題中にホストが退出した場合も同じ扱いで、ルームごと解散して全員を安全に終了させる）。
// 参加者が退出した場合は、自分の参加者エントリだけを削除する。
export async function leaveRoom({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;

  stopPresenceTracking();
  try {
    // 自分で退出した後に、遅れてonDisconnectが発火して幽霊のconnected:falseだけが
    // 残る事故を防ぐため、予約を取り消しておく。
    await onDisconnect(ref(database, `rooms/${roomId}/players/${uid}/connected`)).cancel();
  } catch (error) {
    // 通信が切れている状態で退出しようとした場合など、キャンセル自体に失敗しても
    // このあとの退出処理は続行する（致命的ではないため）。
  }

  const roomRef = ref(database, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    clearLastRoom();
    return;
  }

  const room = snapshot.val();
  if (room.host === uid) {
    await remove(roomRef);
  } else {
    await remove(ref(database, `rooms/${roomId}/players/${uid}`));
  }
  clearLastRoom();
}

// ルームの内容をリアルタイムで監視する。変化があるたびcallbackが呼ばれる。
// ルームが存在しない（削除された等）場合はcallback(null)が呼ばれる。
// 戻り値は監視を止めるための関数（画面を離れるときに必ず呼ぶこと）。
export function listenToRoom(roomId, callback) {
  const roomRef = ref(database, `rooms/${roomId}`);
  const handleValue = (snapshot) => {
    callback(snapshot.exists() ? { roomId, ...snapshot.val() } : null);
  };
  onValue(roomRef, handleValue);
  return () => off(roomRef, "value", handleValue);
}

// ===== 公開API：Step2（対戦設定・準備完了・カウントダウン開始）=====

// ホストが対戦設定を変更する。設定を書き換えると同時にsettingsRevisionを1つ進め、
// その時点の参加者（ホスト以外）全員の準備完了状態を自動的に解除する
// （本人の要望：設定変更後に古いreadyのまま開始してしまう事故を防ぐため）。
//
// 【settingsRevisionを使う理由】READY操作と設定変更がほぼ同時に行われた場合、
// 「参加者のREADY書き込み」と「ホストの設定変更によるREADYリセット書き込み」の
// 到着順が前後することがある（Firebaseへの2つの独立した書き込みのため、順序は保証されない）。
// setReady()が「今のsettingsRevision」を一緒に書き込んでおき（readyForRevision）、
// 開始条件の判定側でsettingsRevisionと一致するかも確認することで、
// 「古い設定に対するREADYを、新しい設定のREADYと誤認する」事故を防ぐ
// （ChatGPTからの提案・本人採用、2026-08-08）。
// ホスト以外が呼んだ場合はreason:"not-host"を返す。
export async function updateRoomSettings({ roomId, settings }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };

  const errorMessage = validateRoomSettings(room.gameMode, settings);
  if (errorMessage) return { ok: false, reason: "invalid-settings", message: errorMessage };

  const nextRevision = (room.settingsRevision ?? 0) + 1;
  const players = room.players || {};
  const updates = {
    [`rooms/${roomId}/settings`]: settings,
    [`rooms/${roomId}/settingsRevision`]: nextRevision,
  };
  Object.keys(players).forEach((playerUid) => {
    if (playerUid !== uid) {
      updates[`rooms/${roomId}/players/${playerUid}/ready`] = false;
    }
  });

  await update(ref(database), updates);
  return { ok: true, settingsRevision: nextRevision };
}

// 自分の準備完了状態を変更する（参加者用）。ホストは「開始する」ボタンを押すこと自体が
// 意思表示になるため、readyの概念は非ホストの参加者だけが画面上で使う想定。
// readyForRevisionに「今読めている最新のsettingsRevision」を刻んでおくことで、
// 開始条件の判定側が「その場のREADYが今の設定に対するものか」を確認できるようにする。
export async function setReady({ roomId, ready }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const revisionSnapshot = await get(ref(database, `rooms/${roomId}/settingsRevision`));
  const currentRevision = revisionSnapshot.val() ?? 0;

  await update(ref(database), {
    [`rooms/${roomId}/players/${uid}/ready`]: ready,
    [`rooms/${roomId}/players/${uid}/readyForRevision`]: currentRevision,
  });
  return { ok: true };
}

// ホストが対戦の開始を宣言する。実際に出題（status: playing）にするのではなく、
// まずカウントダウンを開始する（status: countdown）。新しいシードをここで確定させ、
// Firebaseサーバーの現在時刻（countdownStartedAt）も一緒に記録する。
//
// 【なぜクライアントのDate.now()を使わないか】ホスト端末の時計は、他の参加者の時計と
// 完全に同期している保証がない（秒単位でズレることがある）。全端末が「サーバーが記録した
// 同じ瞬間」を基準にできるよう、serverTimestamp()（Firebaseサーバー側で確定する値）を使う。
// 各端末は、これに固定長のCOUNTDOWN_DURATION_MSを足した時刻を「開始予定時刻」として
// 使い、.info/serverTimeOffsetで自分の時計とサーバー時計のズレを補正してから
// カウントダウン表示・開始判定を行う（js/onlineBattleScreen.js側の実装）。
// ホスト以外が呼んだ場合、または全員の準備が整っていない場合はreason付きで失敗を返す。
export async function startBattle({ roomId, settings }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };

  const errorMessage = validateRoomSettings(room.gameMode, settings);
  if (errorMessage) return { ok: false, reason: "invalid-settings", message: errorMessage };

  // 【防御的な再確認】ロビー画面のボタン自体も「全員READYでないと押せない」よう
  // 制御しているが、ここでもデータ層として同じ条件を再確認しておく
  // （画面側の制御漏れ・多重クリック等があっても、開始条件を必ず守るため）。
  const players = room.players || {};
  const nonHostEntries = Object.entries(players).filter(([playerUid]) => playerUid !== uid);
  const currentRevision = room.settingsRevision ?? 0;
  const allReady =
    nonHostEntries.length > 0 &&
    nonHostEntries.every(([, player]) => player.ready && player.readyForRevision === currentRevision);
  if (!allReady) {
    return { ok: false, reason: "not-all-ready" };
  }

  const seed = generateRandomSeed(ONLINE_SEED_BITS);
  const updates = {
    [`rooms/${roomId}/settings`]: settings,
    [`rooms/${roomId}/seed`]: seed,
    [`rooms/${roomId}/status`]: ROOM_STATUS.COUNTDOWN,
    [`rooms/${roomId}/countdownStartedAt`]: serverTimestamp(),
  };
  await update(ref(database), updates);
  return { ok: true, seed };
}

// カウントダウンが終わったタイミングで、ホストの端末だけが呼ぶ。statusをplayingに進める。
// （書き込むのはホストの端末1台だけなので、複数端末が競合して書き込む心配はない。
// 他の参加者の端末は、自分自身のローカルなカウントダウン表示が0になった時点で、
// このstatus変化を待たずに先に出題画面表示へ進んで構わない設計にしている
// ＝js/onlineBattleScreen.js側が、ローカルタイマーとstatus変化のどちらか早い方で遷移する）。
export async function finishCountdown({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status !== ROOM_STATUS.COUNTDOWN) return { ok: false, reason: "not-countdown" };

  await update(ref(database), { [`rooms/${roomId}/status`]: ROOM_STATUS.PLAYING });
  return { ok: true };
}

// クライアントの時計とFirebaseサーバーの時計のズレ（ミリ秒）を継続的に教えてくれる
// 特別なパス（Firebase公式の.info/serverTimeOffset）。カウントダウンの表示・判定で、
// 「サーバー時刻で記録されたcountdownStartedAt」を「自分の時計での実時刻」に変換するために使う
// （ズレを考慮しないと、時計が数秒ずれている端末でカウントダウンの終わるタイミングもずれてしまう）。
// 戻り値は監視を止めるための関数。
export function subscribeServerTimeOffset(callback) {
  const offsetRef = ref(database, ".info/serverTimeOffset");
  const handleValue = (snapshot) => callback(snapshot.val() ?? 0);
  onValue(offsetRef, handleValue);
  return () => off(offsetRef, "value", handleValue);
}

// ===== 公開API：再接続のための「前回のルーム」記憶 =====
// localStorageに保存するだけの単純な仕組み。本人以外のプレイヤー情報は含まない。

export function saveLastRoom(roomId, playerName) {
  try {
    localStorage.setItem(LAST_ROOM_STORAGE_KEY, JSON.stringify({ roomId, playerName }));
  } catch (error) {
    // localStorageが使えない環境（プライベートブラウジング等）でも、
    // 再接続の便利機能が使えなくなるだけで致命的ではないため、エラーは握りつぶす。
  }
}

export function getLastRoom() {
  try {
    const raw = localStorage.getItem(LAST_ROOM_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
}

export function clearLastRoom() {
  try {
    localStorage.removeItem(LAST_ROOM_STORAGE_KEY);
  } catch (error) {
    // 上と同じ理由で無視する。
  }
}
