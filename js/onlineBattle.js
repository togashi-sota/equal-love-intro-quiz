// オンライン対戦（Firebase Realtime Database）のルーム管理を担当するデータ層。
// Step1の範囲：ルーム作成・参加・参加者一覧のリアルタイム監視・退出・切断検知・再接続。
//
// 【設計方針：roomId中心のデータ構造】本人の指定どおり、Realtime Database上のデータは
// rooms/{roomId}/{host, createdAt, maxPlayers, status, players, settings, seed, results}
// という形にしている。settings・seed・resultsはStep2・Step3で使う項目のため、Step1では
// 書き込まない（空のまま）。
//
// 【画面側との役割分担】このファイルはFirebaseとの読み書きだけを担当し、画面の組み立て・
// ボタンのイベント登録はjs/onlineBattleScreen.js側が担当する（このプロジェクトの
// 「エンジンは再利用、画面は専用ファイル」という既存パターンと同じ考え方）。

import { ref, set, get, update, remove, onValue, off, runTransaction, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { BASE32_ALPHABET } from "./bitCode.js";

const ROOM_ID_LENGTH = 6;
const LAST_ROOM_STORAGE_KEY = "equalLoveIntroQuiz.onlineBattle.lastRoom";

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

// 切断検知（onDisconnect）の登録を、直近1件だけ覚えておく。
// 退出時にこれを取り消す（cancel）ことで、「もう自分でルームを出た後に、
// 遅れてonDisconnectが発火して幽霊のconnected:falseだけが残る」事故を防ぐ。
let currentDisconnectRef = null;

function registerDisconnectHandling(roomId, uid) {
  const connectedRef = ref(database, `rooms/${roomId}/players/${uid}/connected`);
  onDisconnect(connectedRef).set(false);
  currentDisconnectRef = connectedRef;
}

async function cancelDisconnectHandling() {
  if (currentDisconnectRef) {
    await onDisconnect(currentDisconnectRef).cancel();
    currentDisconnectRef = null;
  }
}

// 【重要・実機検証で発見したFirebase RTDBの癖】runTransaction()は、実行している「その瞬間」に
// 対象パスへ生きたonValueリスナーが張られていないと、サーバー上には確かにデータが存在していても
// コールバックにnullが渡り、そのまま中断してしまうことがある。
//
// 最初は「get()で事前に1回読んでおけばキャッシュが温まるはず」と考えたが、実機検証では
// 事前にget()やonValue→即off()（購読して1回受け取ったらすぐ解除する方式）を挟んでも
// 再現することを確認した。つまり「過去に一度読んだかどうか」ではなく「トランザクションを
// 実行している瞬間にリスナーが生きているかどうか」が条件だった。
// 対策として、この関数の間だけonValueリスナーを張ったままにし、トランザクションの完了後に
// 初めて解除する（keepAliveDuring関数）。
function keepAliveDuring(pathRef, work) {
  return new Promise((resolve, reject) => {
    let notifyReady;
    const readyPromise = new Promise((r) => { notifyReady = r; });
    const handleValue = () => notifyReady();
    const handleError = (error) => {
      off(pathRef, "value", handleValue);
      reject(error);
    };
    onValue(pathRef, handleValue, handleError);

    readyPromise
      .then(() => work())
      .then(
        (value) => {
          off(pathRef, "value", handleValue);
          resolve(value);
        },
        (error) => {
          off(pathRef, "value", handleValue);
          reject(error);
        }
      );
  });
}

// ===== 公開API：ルーム作成・参加・退出 =====

// 新しいルームを作り、自分をホストとして登録する。
// 戻り値：{ ok: true, roomId } または { ok: false, reason }
export async function createRoom({ playerName, maxPlayers }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  let roomId;
  try {
    roomId = await generateUniqueRoomId();
  } catch (error) {
    return { ok: false, reason: "id-generation-failed" };
  }

  const roomData = {
    host: uid,
    createdAt: Date.now(),
    maxPlayers,
    status: "waiting",
    players: {
      [uid]: { name: playerName, isHost: true, joinedAt: Date.now(), connected: true },
    },
  };

  try {
    await set(ref(database, `rooms/${roomId}`), roomData);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }

  registerDisconnectHandling(roomId, uid);
  saveLastRoom(roomId, playerName);
  return { ok: true, roomId };
}

// 既存のルームに参加する。すでに自分（同じUID）がそのルームの参加者だった場合は、
// 新規参加ではなく「再接続」として扱う（connectedをtrueに戻すだけで、名前だけ更新する）。
// 戻り値：{ ok: true, roomId } または { ok: false, reason: "not-found" | "full" | "not-waiting" }
export async function joinRoom({ roomId, playerName }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const roomRef = ref(database, `rooms/${roomId}`);

  // トランザクション実行中はkeepAliveDuring()がリスナーを維持し続ける
  // （上のコメント参照：runTransaction()単体では稀にnullを受け取ってしまうバグへの対策）。
  //
  // 【さらなる保険：not-foundだけを対象にした再試行】keepAliveDuring()を使ってもなお、
  // ごく稀に「実際にはルームが存在するのに、そのトランザクション実行のその1回だけnullを
  // 受け取ってしまう」ケースが実機検証で確認できた（頻度は低いが再現性はある、Firebase
  // RTDB SDK側の未解明の癖）。これをユーザーの体験に持ち込まない（「そのコードは存在しません」
  // という誤ったエラーを見せない）ため、not-foundで中断した場合だけ、get()で本当に
  // 存在しないのかを直接確認し、実際には存在するなら少し待って再試行する。
  // full・not-waitingは再試行しても結果が変わらないため、その場で確定させる。
  const MAX_JOIN_ATTEMPTS = 5;
  let abortReason = null;
  let result;
  for (let attempt = 1; attempt <= MAX_JOIN_ATTEMPTS; attempt++) {
    abortReason = null;
    result = await keepAliveDuring(roomRef, () =>
      runTransaction(roomRef, (room) => {
        if (room === null) {
          abortReason = "not-found";
          return undefined; // undefinedを返すとトランザクションを中断できる（Firebaseの仕様）
        }

        const players = room.players || {};
        const alreadyJoined = Object.prototype.hasOwnProperty.call(players, uid);

        if (!alreadyJoined) {
          const currentCount = Object.keys(players).length;
          if (currentCount >= room.maxPlayers) {
            abortReason = "full";
            return undefined;
          }
          if (room.status !== "waiting") {
            abortReason = "not-waiting";
            return undefined;
          }
          players[uid] = { name: playerName, isHost: false, joinedAt: Date.now(), connected: true };
        } else {
          // 再接続：既存のエントリの名前とconnectedフラグだけ更新する。isHostは変えない。
          players[uid] = { ...players[uid], name: playerName, connected: true };
        }

        room.players = players;
        return room;
      })
    );

    if (result.committed || abortReason !== "not-found" || attempt === MAX_JOIN_ATTEMPTS) {
      break;
    }

    const directCheck = await get(roomRef);
    if (!directCheck.exists()) {
      break; // 本当に存在しないルームコードだった
    }
    // 待ち時間は試行のたびに少しずつ延ばす（150ms→300ms→450ms→600ms）。
    await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
  }

  if (!result.committed) {
    return { ok: false, reason: abortReason ?? "unknown" };
  }

  registerDisconnectHandling(roomId, uid);
  saveLastRoom(roomId, playerName);
  return { ok: true, roomId };
}

// ルームから退出する。ホストが退出した場合はルームごと解散する
// （Step1では権限の引き継ぎ等は行わない、という本人合意済みの方針）。
// 参加者が退出した場合は、自分の参加者エントリだけを削除する。
export async function leaveRoom({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;

  await cancelDisconnectHandling();

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
