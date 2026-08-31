// オンライン対戦（Firebase Realtime Database）のルーム管理を担当するデータ層。
// Step1：ルーム作成・参加・参加者一覧のリアルタイム監視・退出・切断検知・再接続。
// Step2：対戦モード切り替え・対戦設定の同期・準備完了・サーバー時刻を使ったカウントダウン開始。
// Step3：実際の出題進行・進捗共有・結果送信・全員終了判定・ホストによる結果確定。
//
// 【設計方針：roomId中心のデータ構造、gameModeで拡張】Realtime Database上のデータは
// rooms/{roomId}/{version, host, createdAt, maxPlayers, status, gameMode, settings,
//                  settingsRevision, seed, countdownStartedAt, activeMatchId, players,
//                  matches/{matchId}/{participants, progress, results}}
// という形にしている。
//
// 【Step3：matchIdによる試合単位の分離】同じルームで何度も対戦できるようにするため、
// 進捗（progress）・結果（results）は「今の試合（activeMatchId）」ごとに完全に分けた場所へ
// 保存する。過去の試合（別のmatchId）への書き込みは、コード側の確認（submitAnswerProgress等の
// activeMatchIdチェック）とFirebaseセキュリティルールの両方で拒否される。matches/{matchId}/
// participantsは、その試合の開始時点（startBattle実行時）のplayers一覧を固定したスナップショット
// （displayName・oshiMemberId・isHost）で、対戦中に参加者が退出・切断してもplayersからは
// 消えるが、participantsには残るため、結果画面等で名前・推しカラーを表示し続けられる。
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
import { getMostOshiMemberId } from "./oshiMembers.js";
import {
  createDefaultSettings,
  isKnownGameMode,
  validateRoomSettings,
  resolveSongPoolForSettings,
  getAvailabilityKind,
} from "./battleModes/index.js";
import { restrictSettingsToCommonlyAvailableSongs } from "./onlineBattleSongAvailability.js";
import { pickNextHostUid } from "./onlineBattleHostTransitionPayloads.js";
import { startActivityPresenceTracking, stopActivityPresenceTracking } from "./onlineBattlePresence.js";

const ROOM_ID_LENGTH = 6;
const LAST_ROOM_STORAGE_KEY = "equalLoveIntroQuiz.onlineBattle.lastRoom";

// Roomのデータ構造そのもののバージョン。将来フィールド構成を変えた際、
// 「古い構造のRoomが残っていないか」等の判定に使える。構造を変えたら必ず上げること。
export const ROOM_SCHEMA_VERSION = 1;

// Step2時点で選べる対戦モードはタイムアタックのみ。将来ロビー画面にモード選択UIを
// 追加するまでは、ルーム作成時に常にこのモードを使う。
export const DEFAULT_GAME_MODE = "timeAttack";

// 【2026-09-03改訂、本人指示：大型改修】プレイヤー最大人数の選択範囲。
// 2026-09-02時点では2〜10人だったが、「友達が来るまで1人で遊ぶ」使い方も正式対応する
// ため、1人ルームも作れるようにした（js/onlineBattleScreen.jsのルーム作成UIが使う）。
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 10;

// 【2026-09-02新設、本人指示：観戦者を別枠にする】観戦者の上限は、プレイヤー人数とは
// 独立した固定値とし、ホストが毎回設定する必要はない（本人指示）。ルーム作成のたびに
// この値をroom.maxSpectatorsへ保存しておく（後からアプリ側の既定値だけを変えても、
// 既に作られたルームの実際の上限は変わらないようにするため）。
// 【DEFAULT_MAX_SPECTATORSを変更した場合】Firebase Rules側（firebase/database.rules.json）の
// 観戦者定員チェックにある「古いルーム（maxSpectatorsフィールドが無い場合）のフォールバック値」も
// 必ず同じ値に揃えること（片方だけ変えると、新しい既定値と食い違ったRulesが残ってしまう）。
export const DEFAULT_MAX_SPECTATORS = 10;

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

// 試合（1回の対戦）を一意に区別するためのID。ルームコードと違い人に伝える必要が無いので、
// 短さより「衝突しないこと」を優先し、8文字（32^8 ≈ 1兆通り）にしている。
// 同じルーム内で作られる試合の数は現実的に数十〜数百止まりのため、重複チェックは行わない
// （ルームコードのgenerateUniqueRoomId()のような再試行の仕組みは、この規模では過剰と判断）。
const MATCH_ID_LENGTH = 8;
function generateMatchId() {
  let id = "";
  for (let i = 0; i < MATCH_ID_LENGTH; i++) {
    id += BASE32_ALPHABET[Math.floor(Math.random() * BASE32_ALPHABET.length)];
  }
  return id;
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
// 【2026-08-30追加、本人指示：観戦機能】プレゼンス（接続状態）の書き込み先を
// players/{uid}/connectedだけでなく、spectators/{uid}/connectedにも対応させる。
// 既定値"players"を保つことで、既存の呼び出し（引数を省略した呼び出し）は
// これまでと完全に同じ動作のまま変わらない。
let presenceKind = "players";

function startPresenceTracking(roomId, uid, kind = "players") {
  stopPresenceTracking();
  presenceRoomId = roomId;
  presenceUid = uid;
  presenceKind = kind;
  const infoConnectedRef = ref(database, ".info/connected");
  const entityConnectedRef = ref(database, `rooms/${roomId}/${kind}/${uid}/connected`);

  const handleValue = (snapshot) => {
    if (snapshot.val() !== true) {
      return; // 切断中はここでは何もしない（onDisconnectの予約に任せる）
    }
    // 「次に切断したらfalseにする」予約を毎回張り直してから、今の接続状態をtrueにする。
    onDisconnect(entityConnectedRef).set(false);
    set(entityConnectedRef, true);
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
  const entityConnectedRef = ref(database, `rooms/${presenceRoomId}/${presenceKind}/${presenceUid}/connected`);
  set(entityConnectedRef, document.visibilityState === "visible");
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", handlePresenceVisibilityChange);
}

function stopPresenceTracking() {
  presenceRoomId = null;
  presenceUid = null;
  presenceKind = "players";
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
    // 【2026-09-02新設、本人指示】観戦者の上限はホストが選ぶものではなく、アプリ側の
    // 固定値をルーム作成時にそのまま保存する（DEFAULT_MAX_SPECTATORS参照）。
    maxSpectators: DEFAULT_MAX_SPECTATORS,
    status: ROOM_STATUS.WAITING,
    gameMode,
    settings,
    settingsRevision: 0,
    players: {
      [uid]: {
        name: playerName,
        isHost: true,
        joinedAt: Date.now(),
        connected: true,
        ready: false,
        readyForRevision: 0,
        oshiMemberId: getMostOshiMemberId(), // nullなら未設定（Firebase上ではキー自体が作られない）
      },
    },
  };

  try {
    await set(ref(database, `rooms/${roomId}`), roomData);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }

  startPresenceTracking(roomId, uid);
  startActivityPresenceTracking(roomId, uid);
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

  // 【2026-09-02改訂、本人指示：観戦者を別枠にする】以前はプレイヤー＋観戦者の合計で
  // maxPlayersと比較していたが、「観戦者が入ったことでプレイヤー枠が減る」仕様を
  // やめたいという指示により、プレイヤー人数だけをmaxPlayersと比較する（観戦者は
  // 別途maxSpectatorsで独立して数える。checkSpectatorCapacity()参照）。
  if (Object.keys(players).length >= room.maxPlayers) {
    return { ok: false, reason: "full" };
  }
  if (room.status !== ROOM_STATUS.WAITING) {
    return { ok: false, reason: "not-waiting" };
  }
  return { ok: true, alreadyJoined: false };
}

// 【2026-08-30新設、本人指示：観戦機能】観戦として参加できるかどうかを判定する
// （読み取り専用、書き込みは行わない）。checkCapacity()と同じ考え方だが、
// 「waitingでなければ拒否」ではなく、むしろ「waiting中は観戦ではなく本来のjoinRoom()で
// 参加すべき」という逆の関係にある（呼び出し側のspectateRoom()が使う）。
function checkSpectatorCapacity(room, uid) {
  const isWellFormedRoom =
    room !== null &&
    typeof room.host === "string" &&
    typeof room.maxPlayers === "number" &&
    typeof room.status === "string";
  if (!isWellFormedRoom) {
    return { ok: false, reason: "not-found" };
  }
  if (room.version !== ROOM_SCHEMA_VERSION) {
    return { ok: false, reason: "version-mismatch" };
  }
  if (!isKnownGameMode(room.gameMode)) {
    return { ok: false, reason: "unsupported-mode" };
  }

  const spectators = room.spectators || {};
  const alreadySpectating = Object.prototype.hasOwnProperty.call(spectators, uid);
  if (alreadySpectating) {
    return { ok: true, alreadySpectating: true };
  }

  // 【2026-09-02改訂、本人指示：観戦者を別枠にする】プレイヤー人数とは無関係に、
  // 観戦者だけの人数をmaxSpectatorsと比較する。古いルーム（このフィールドが無い場合）は
  // DEFAULT_MAX_SPECTATORSを既定値として使う（Firebase Rules側の考え方と揃えている。
  // firebase/database.rules.jsonのspectatorsの.validate参照）。
  const maxSpectators = typeof room.maxSpectators === "number" ? room.maxSpectators : DEFAULT_MAX_SPECTATORS;
  if (Object.keys(spectators).length >= maxSpectators) {
    return { ok: false, reason: "full" };
  }
  return { ok: true, alreadySpectating: false };
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
    // 再接続のたびに推しメンも今の設定へ更新する（対戦の合間に最推しを変更していた場合、
    // 次に同じルームへ戻ってきたときに新しい推しが反映されるようにするため）。
    await set(playerRef, { ...existing, name: playerName, connected: true, oshiMemberId: getMostOshiMemberId() });
  } else {
    await set(playerRef, {
      name: playerName,
      isHost: false,
      joinedAt: Date.now(),
      connected: true,
      ready: false,
      readyForRevision: 0,
      oshiMemberId: getMostOshiMemberId(),
    });
  }
}

// 参加成功後の後片付け（切断検知の登録・「前回のルーム」記憶の保存）。
function finalizeJoin(roomId, playerName, uid) {
  startPresenceTracking(roomId, uid);
  startActivityPresenceTracking(roomId, uid);
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

// 【2026-08-30新設、本人指示：観戦機能】試合中（waiting以外）のルームへ、競技参加ではなく
// 観戦として加わる。既にこの人が観戦中なら、名前・接続状態だけ更新する（再接続と同じ考え方）。
// 【なぜjoinRoom()と別関数にするか】呼び出し元（js/onlineBattleScreen.js）が
// 「waiting中はjoinRoom()、それ以外はspectateRoom()」を出し分けるだけで済むようにし、
// 既存のjoinRoom()自体（多くのテスト・実績のあるコード）には一切手を加えないため。
// 戻り値：{ ok: true, roomId } または
//   { ok: false, reason: "not-found" | "full" | "version-mismatch" | "unsupported-mode" | "write-failed" | "not-signed-in" }
export async function spectateRoom({ roomId, playerName }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  const room = snapshot.exists() ? snapshot.val() : null;
  const capacity = checkSpectatorCapacity(room, uid);
  if (!capacity.ok) {
    return { ok: false, reason: capacity.reason };
  }

  const spectatorRef = ref(database, `rooms/${roomId}/spectators/${uid}`);
  try {
    if (capacity.alreadySpectating) {
      const existingSnapshot = await get(spectatorRef);
      const existing = existingSnapshot.val() || {};
      await set(spectatorRef, { ...existing, name: playerName, connected: true, oshiMemberId: getMostOshiMemberId() });
    } else {
      await set(spectatorRef, {
        name: playerName,
        joinedAt: Date.now(),
        connected: true,
        oshiMemberId: getMostOshiMemberId(),
      });
    }
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }

  startPresenceTracking(roomId, uid, "spectators");
  startActivityPresenceTracking(roomId, uid, "spectators");
  saveLastRoom(roomId, playerName);
  return { ok: true, roomId };
}

// 【2026-08-30新設、本人指示：観戦機能】観戦をやめる（自分のspectatorsエントリを削除する）。
// ルーム自体には一切影響しない（観戦者が抜けてもホスト・対戦は続行される）。
export async function leaveSpectating({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;

  stopPresenceTracking();
  stopActivityPresenceTracking();
  try {
    await onDisconnect(ref(database, `rooms/${roomId}/spectators/${uid}/connected`)).cancel();
  } catch (error) {
    // 通信が切れている状態での退出等、キャンセル自体に失敗しても後続の処理は続行する。
  }
  await remove(ref(database, `rooms/${roomId}/spectators/${uid}`));
  clearLastRoom();
}

// 【2026-08-30新設、本人指示：観戦機能】次の試合（status:waiting）から観戦者を正式参加へ
// 昇格させる。呼び出し側（js/onlineBattleScreen.js）が、room.statusがwaitingに変わった
// 瞬間を検知して、自分が観戦者ならこれを呼ぶ想定。プレイヤー定員に余裕が無い場合は
// 失敗を返す（他のプレイヤーが増えていた場合等の保険。2026-09-02改訂：観戦者を別枠に
// したため、この判定はプレイヤー人数だけを見る＝以前から変わらず単独カウントのまま）。
export async function promoteSpectatorToPlayer({ roomId, playerName }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.status !== ROOM_STATUS.WAITING) return { ok: false, reason: "not-waiting" };

  const players = room.players || {};
  const spectators = room.spectators || {};
  if (!Object.prototype.hasOwnProperty.call(spectators, uid)) return { ok: false, reason: "not-spectating" };
  // 既にプレイヤーとしても存在する場合（通常起こらないが、安全のため）は何もせず成功扱い。
  if (Object.prototype.hasOwnProperty.call(players, uid)) {
    await remove(ref(database, `rooms/${roomId}/spectators/${uid}`));
    return { ok: true };
  }
  if (Object.keys(players).length >= room.maxPlayers) {
    return { ok: false, reason: "full" };
  }

  try {
    await update(ref(database), {
      [`rooms/${roomId}/players/${uid}`]: {
        name: playerName,
        isHost: false,
        joinedAt: Date.now(),
        connected: true,
        ready: false,
        readyForRevision: 0,
        oshiMemberId: getMostOshiMemberId(),
      },
      [`rooms/${roomId}/spectators/${uid}`]: null,
    });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  startPresenceTracking(roomId, uid, "players");
  startActivityPresenceTracking(roomId, uid, "players");
  return { ok: true };
}

// ルームから退出する。
// 【2026-08-30改訂、本人指示：オンライン対戦全面アップデート】以前はホストが退出すると
// 常にルームごと解散していたが（Step1時点の暫定方針）、「誰か1人のせいでゲームが永久停止・
// 消滅しない」という今回の方針に合わせ、ホストが退出しても他の参加者が残っていれば
// ルームを解散せず、残っている中で最も古くから参加している人へホスト権限を自動的に
// 引き継ぐ（pickNextHostUid参照）。誰も残っていない場合だけ、今までどおりルームごと削除する。
// 対戦中（countdown/playing）のホスト退出でも同じ扱いにする（試合自体は続行され、
// 新ホストが結果確定等のホスト専用操作を引き継ぐ）。
// 参加者（非ホスト）が退出した場合は、今までどおり自分の参加者エントリだけを削除する。
export async function leaveRoom({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;

  stopPresenceTracking();
  stopActivityPresenceTracking();
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
    const nextHostUid = pickNextHostUid(room.players || {}, uid);
    if (nextHostUid === null) {
      // 他に誰も残っていない：今までどおりルームごと削除する。
      await remove(roomRef);
    } else {
      // host（新ホストへ）とplayers/{自分}（削除）を1回のupdate()にまとめることで、
      // 「ホストは変わったのに自分の参加者情報がまだ残っている」ような一瞬の不整合を防ぐ。
      await update(ref(database), {
        [`rooms/${roomId}/host`]: nextHostUid,
        [`rooms/${roomId}/players/${uid}`]: null,
      });
    }
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

// 【2026-08-30新設、本人指示：オンライン対戦全面アップデート】ホストがロビーで対戦モード
// そのものを変更する。「ルームを試合ごとに作り直さない」の核心部分。
// 【Firebase Rules前提】firebase/database.rules.jsonのrooms/$roomId/gameModeに、
// 「ホストだけ・status===waitingのときだけ書ける」という専用の書き込みルールを追加済み
// （以前は新規作成時にしか書けなかった）。このルールが本番へ反映されていない環境では、
// この関数のupdate()自体がFirebase側で拒否される想定（＝安全側に倒れる。既存ルームの
// 動作には影響しない）。
// モードを変更したら、そのモードの既定値（defaultSettings）へ設定を差し替え、
// settingsRevisionを進めて非ホスト全員のreadyを解除する（updateRoomSettings()と同じ
// 「設定が変わったら準備完了を解除する」パターンをそのまま踏襲）。
// 既に同じgameModeが指定された場合は何もせず成功を返す（冪等）。
export async function updateRoomGameMode({ roomId, gameMode }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  if (!isKnownGameMode(gameMode)) return { ok: false, reason: "unsupported-mode" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status !== ROOM_STATUS.WAITING) return { ok: false, reason: "not-waiting" };
  if (room.gameMode === gameMode) return { ok: true, settings: room.settings };

  const settings = createDefaultSettings(gameMode);
  if (!settings) return { ok: false, reason: "unsupported-mode" };

  const nextRevision = (room.settingsRevision ?? 0) + 1;
  const players = room.players || {};
  const updates = {
    [`rooms/${roomId}/gameMode`]: gameMode,
    [`rooms/${roomId}/settings`]: settings,
    [`rooms/${roomId}/settingsRevision`]: nextRevision,
  };
  Object.keys(players).forEach((playerUid) => {
    if (playerUid !== uid) {
      updates[`rooms/${roomId}/players/${playerUid}/ready`] = false;
    }
  });

  try {
    await update(ref(database), updates);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true, settings };
}

// 【2026-08-30新設、本人指示】ホストが、ルーム内の別の参加者へホスト権限を手動で譲る。
// 対象は今のルームに実在する参加者（players）でなければならない。自分自身への指定は
// 何もせず成功扱い（冪等）。
// 【players/{uid}/isHostの扱いについて】この関数はrooms/{roomId}/hostだけを書き換える。
// 表示用バッジ（players/{uid}/isHost）は、各クライアントが自分自身の値だけを自分で
// 書き換えられる権限しか持たない（Firebase Rules上の制約、既存のplayers/$uidの書き込み
// ルールをそのまま維持するため）ため、ここではホスト以外の人のisHostを直接書き換えない。
// 代わりに、各端末がroom.hostの変化を検知して、自分自身のisHostを自分で書き直す
// （js/onlineBattleScreen.jsのsyncMyHostBadge()参照）。実権限の判定は常にroom.host自体を
// 見るため（players[uid].isHostは表示専用）、この一瞬のズレが安全性に影響することはない。
export async function transferHost({ roomId, newHostUid }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (newHostUid === uid) return { ok: true }; // 自分自身への移譲は何もしない（冪等）
  if (!room.players?.[newHostUid]) return { ok: false, reason: "player-not-found" };

  try {
    await update(ref(database), { [`rooms/${roomId}/host`]: newHostUid });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-08-30新設、本人指示】ホストが切断中（players[host].connected===false）のとき、
// ルームに残っている自分自身がホスト権限を引き継ぐ（自動移譲）。
// 【横取り防止】Firebase Rules側で「現ホストがconnected:falseであること」を必須条件に
// しているため、接続中のホストから勝手に奪うことはできない。ただし「切断した直後の一瞬」に
// 複数人が同時に呼ぶ可能性はあるため、呼び出し側（js/onlineBattleScreen.js）は
// 「ホストの切断が一定秒数続いた場合だけ」呼ぶよう節度を持たせる（本人指示のとおり、
// Rules側だけで秒数条件を安全に書くのは複雑なため、クライアント側の節度と組み合わせる）。
// 既に自分がホストなら何もせず成功扱い（冪等）。
export async function claimHostIfDisconnected({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host === uid) return { ok: true }; // 既に自分がホスト（冪等）
  if (!room.players?.[uid]) return { ok: false, reason: "not-in-room" };
  if (room.players[room.host]?.connected !== false) return { ok: false, reason: "host-still-connected" };

  try {
    await update(ref(database), { [`rooms/${roomId}/host`]: uid });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-08-30新設、本人指示】ホストが、ロビー（status===waiting）にいる別の参加者を
// ルームから退出させる（キック）。試合中はキックできない（本人指示：「試合中のキックは
// 不要」）。自分自身・現ホスト自身は対象にできない。
// キックされた側の検知・案内表示はクライアント側（js/onlineBattleScreen.js）が、
// 「自分がplayersから消えたのに、ルーム自体はまだ存在する」状態を見て行う
// （このFirebase書き込み自体には、キックの理由をキックされた側へ直接伝える仕組みは無い。
// 同じルームコードで入り直せば再参加できる＝既存のjoinRoom()をそのまま使える）。
export async function kickPlayer({ roomId, targetUid }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  if (targetUid === uid) return { ok: false, reason: "cannot-kick-self" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status !== ROOM_STATUS.WAITING) return { ok: false, reason: "not-waiting" };
  if (!room.players?.[targetUid]) return { ok: false, reason: "player-not-found" };

  try {
    await remove(ref(database, `rooms/${roomId}/players/${targetUid}`));
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-08-30新設、本人指示】自分の参加者情報（players/{自分}/isHost）が、実際の権限
// （rooms/{roomId}/host）とズレていたら、自分の値だけを自分で書き直す。
// 【なぜこの一手間が必要か】ホスト移譲（transferHost・claimHostIfDisconnected）は
// rooms/{roomId}/hostだけを書き換える設計にしている。これはFirebase Rules上、
// players/{uid}の各フィールドは「本人だけが書き込める」制約になっており（既存の設計、
// 他人のisHostを移譲元・移譲先以外の第三者が書き換えることを許すと安全性が下がるため）、
// 移譲する側が相手のisHostまで直接書き換えることができないからである。
// 実際の権限判定は常にrooms/{roomId}/host自体を見るため（players[uid].isHostは
// 表示バッジ専用）、この関数を呼ぶタイミングが多少遅れても安全性には影響しない。
// 呼び出し側（js/onlineBattleScreen.jsのrenderLobby）が、room更新のたびに
// 「今の自分はホストか」を渡し、実際のisHostと食い違っていた場合だけ書き込みが発生する。
export async function syncMyHostBadge({ roomId, isHost }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;

  try {
    const snapshot = await get(ref(database, `rooms/${roomId}/players/${uid}/isHost`));
    if (snapshot.val() === isHost) return; // 既に一致している（無駄な書き込みをしない）
    await update(ref(database), { [`rooms/${roomId}/players/${uid}/isHost`]: isHost });
  } catch (error) {
    // 失敗してもロビー表示のバッジが一時的にズレるだけで、実権限判定には影響しないため、
    // ここでは静かに諦める（次のroom更新のたびに再試行される）。
  }
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
//
// 【Step3・matchId】同じルームで何度も対戦できるようにするため、進捗（progress）・結果（results）を
// 「今回の試合」単位で完全に分離する。ここで新しいmatchIdを発行し、その瞬間のplayers一覧から
// 「参加者スナップショット」（displayName・oshiMemberId・isHost）を作って、settings・seed・
// status・countdownStartedAtと同じ1回のupdate()でまとめて確定させる。これにより、他端末が
// status:countdownを検知した時点で、activeMatchId・参加者スナップショットも必ず揃っている
// （本人と合意済みの設計、2026-08-08）。各参加者自身の進捗（progress）はここでは作らない。
// 「本人だけが自分のprogressを書ける」というセキュリティルールと両立させるため、各端末が
// activeMatchIdの変化を検知した時点で、自分の分だけを自分で初期化する
// （initializeMyMatchProgress()参照）。
//
// ホスト以外が呼んだ場合、全員の準備が整っていない場合、ルームが対戦開始できる状態
// （status: waiting）でない場合は、reason付きで失敗を返す。
export async function startBattle({ roomId, settings }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status !== ROOM_STATUS.WAITING) return { ok: false, reason: "not-waiting" };

  const errorMessage = validateRoomSettings(room.gameMode, settings);
  if (errorMessage) return { ok: false, reason: "invalid-settings", message: errorMessage };

  // 【防御的な再確認】ロビー画面のボタン自体も「全員READYでないと押せない」よう
  // 制御しているが、ここでもデータ層として同じ条件を再確認しておく
  // （画面側の制御漏れ・多重クリック等があっても、開始条件を必ず守るため）。
  // 【2026-09-03改訂、本人指示：大型改修】以前は「非ホストが1人もいなければ開始不可」
  // だったため、ホスト1人だけのルーム（友達が来るまで1人で遊ぶ、を含む）は対戦を
  // 開始できなかった。1人からの正式対応（MIN_PLAYERS = 1）に伴い、非ホストが0人の場合は
  // 「誰も待つ相手がいない」ので条件を満たしたものとして扱う（非ホストが1人以上いる場合は、
  // 従来どおり全員のREADYを必須とする）。
  const players = room.players || {};
  const nonHostEntries = Object.entries(players).filter(([playerUid]) => playerUid !== uid);
  const currentRevision = room.settingsRevision ?? 0;
  const allReady =
    nonHostEntries.length === 0 ||
    nonHostEntries.every(([, player]) => player.ready && player.readyForRevision === currentRevision);
  if (!allReady) {
    return { ok: false, reason: "not-all-ready" };
  }

  // 【2026-08-26新設・2026-08-27拡張：参加者の共通曲（intersection）への絞り込み】
  // 21枚目以降の新曲データパック（js/dataPackImport.js）導入により、端末ごとに
  // 「持っている曲」が異なる状態が正式に起こりうる。誰か1人でもそのモードに必要な
  // データ（音源、または歌詞データ）を持っていない曲が出題されると対戦が成立しないため、
  // 開始直前に「参加者全員が実際に利用できる曲」だけへ絞り込む。
  // 【2026-08-27拡張】どの所持データ（音源／歌詞）で絞り込むかは、gameModeごとに異なる
  // （イントロ対戦・ランダム再生対戦は音源、歌詞クイズ対戦は歌詞データ）。
  // js/battleModes/index.jsのgetAvailabilityKind()が、そのモードに合った種類を返す
  // （本人指示：重複ロジックを増やさず、既存の絞り込み基盤を種類だけ切り替えて全モードへ
  // 統合する）。resolveSongPoolForSettings()がnullを返すモード（対応していない・未登録の
  // gameMode）では、この処理を一切行わない。
  // 【安全設計】restrictSettingsToCommonlyAvailableSongs()自体が「誰も所持曲を報告して
  // いなければ絞り込まない」設計（js/onlineBattleSongAvailability.js参照）のため、
  // Firebaseセキュリティルールがまだ対応していない環境では、この処理は何も変えない
  // （今までと完全に同じ動作のまま安全に開始できる）。
  let finalSettings = settings;
  const resolvedSongPool = resolveSongPoolForSettings(room.gameMode, settings);
  if (resolvedSongPool) {
    // 【2026-08-27新設】共同選曲（collaborativeSelection）は、ロビーでの設定保存自体は
    // 0曲でもエラーにしない設計にしてある（js/battleModes/timeAttackBattleMode.js・
    // lyricsQuizBattleMode.js参照）ため、「まだ誰も曲を選んでいない」状態のまま
    // 対戦を開始しようとするケースをここで明示的に検出する（絞り込みが何も変えない＝
    // resolvedSongPoolが既に空のときは、下の「絞り込みが発生した場合だけ再検証する」
    // 分岐を素通りしてしまい、0問の対戦が始まってしまうため）。
    if (resolvedSongPool.length === 0) {
      return {
        ok: false,
        reason: "insufficient-common-songs",
        message: "出題する曲が選ばれていません。参加者で曲を選ぶか、「全曲から出題」に切り替えてください。",
      };
    }
    finalSettings = await restrictSettingsToCommonlyAvailableSongs({
      roomId,
      playerUids: Object.keys(players),
      settings,
      resolvedSongPool,
      kind: getAvailabilityKind(room.gameMode),
    });
    if (finalSettings !== settings) {
      // 絞り込みが実際に発生した場合のみ、絞り込んだ結果でも出題可能か再検証する
      // （絞り込みすぎて曲数が足りなくなる可能性があるため、安全側に倒して開始を拒否する）。
      const restrictedSongCount = (finalSettings.questionSource?.songIds ?? []).length;
      const restrictedErrorMessage = validateRoomSettings(room.gameMode, finalSettings);
      if (restrictedErrorMessage) {
        // 【本人指示：共通曲が0曲の場合は原因がひと目でわかる専用の文言にする】
        // 「曲数が足りない」（出題数の設定に対して少ない）のか、「そもそも共通する曲が
        // 1曲も無い」のかで、利用者が取るべき対応が違う（前者は出題数を減らせば解決するが、
        // 後者はそもそも参加者同士のデータ状況を見直す必要がある）ため、文言を分ける。
        const message =
          restrictedSongCount === 0
            ? "参加者全員が利用できる共通曲がありません。データパックの導入状況をご確認ください。"
            : "参加者全員が利用できる曲が足りないため、対戦を開始できません。出題範囲を見直すか、対戦相手のデータ導入状況をご確認ください。";
        return {
          ok: false,
          reason: "insufficient-common-songs",
          message,
        };
      }
    }
  }

  const seed = generateRandomSeed(ONLINE_SEED_BITS);
  const matchId = generateMatchId();
  const updates = {
    [`rooms/${roomId}/settings`]: finalSettings,
    [`rooms/${roomId}/seed`]: seed,
    [`rooms/${roomId}/status`]: ROOM_STATUS.COUNTDOWN,
    [`rooms/${roomId}/countdownStartedAt`]: serverTimestamp(),
    [`rooms/${roomId}/activeMatchId`]: matchId,
  };
  Object.entries(players).forEach(([playerUid, player]) => {
    updates[`rooms/${roomId}/matches/${matchId}/participants/${playerUid}`] = {
      displayName: player.name,
      isHost: playerUid === uid,
      oshiMemberId: player.oshiMemberId ?? null, // nullなら未設定（Firebase上ではキー自体が作られない）
    };
  });
  await update(ref(database), updates);
  return { ok: true, seed, matchId };
}

// カウントダウンが終わったタイミングで、ホストの端末だけが呼ぶ。statusをplayingに進める。
// （書き込むのはホストの端末1台だけなので、複数端末が競合して書き込む心配はない。
// 他の参加者の端末は、自分自身のローカルなカウントダウン表示が0になった時点で、
// このstatus変化を待たずに先に出題画面表示へ進んで構わない設計にしている
// ＝js/onlineBattleScreen.js側が、ローカルタイマーとstatus変化のどちらか早い方で遷移する）。
//
// 【本人の要望：確実にplayingへ進める＋何度呼ばれても安全に】通信の一時的な不調等で
// 書き込みに失敗した場合に備え、間隔を空けて最大3回まで再試行する。単に同じ書き込みを
// 繰り返すのではなく、試行のたびに現在のstatusを読み直し、
//   ・既にplaying → 目標にすでに到達しているので成功扱いで終了
//   ・countdown   → playingへの書き込みを試みる（失敗したら間隔を空けて再試行）
//   ・それ以外    → ルームが無い/ホストでない/そもそもcountdownでない等の確定した
//                   状態なので、再試行しても意味がなく即座に終了する
// という形にすることで、ホストが再接続して呼び直した場合や、複数回連続で
// 呼ばれた場合でも安全（何度呼んでも同じ結果に収束する）。
//
// 【runTransaction()を使わない理由】Step1で発見した「runTransaction()が実際には
// データが存在するのに稀にnullを受け取る」不具合（と、その対策のkeepAliveDuring・
// 再試行の仕組み）は、"複数の書き込み元が同じ値を同時に奪い合う"状況を安全に処理する
// ためのものだった。ここではstatusを書き込むのは常にホスト1人だけで、
// 競合する書き込み元が存在しないため、transactionの複雑さ・既知の不具合リスクを
// 持ち込む必要がない。read→条件確認→writeを素直に行うだけで十分安全と判断した。
export async function finishCountdown({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const snapshot = await get(ref(database, `rooms/${roomId}`));
      if (!snapshot.exists()) return { ok: false, reason: "not-found" };
      const room = snapshot.val();
      if (room.host !== uid) return { ok: false, reason: "not-host" };
      if (room.status === ROOM_STATUS.PLAYING) return { ok: true }; // 既に目標状態
      if (room.status !== ROOM_STATUS.COUNTDOWN) return { ok: false, reason: "not-countdown" };

      await update(ref(database), { [`rooms/${roomId}/status`]: ROOM_STATUS.PLAYING });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: "write-failed" };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: "write-failed" };
}

// ===== 公開API：Step3（試合の進捗・結果・確定）=====
//
// 【設計方針：各自のペースで進む】対戦中は1問ごとの同期待ちを一切行わない。各端末は
// 独立してクイズを進め、Firebaseへは「進捗の報告」だけを一方向に送る。他プレイヤーの
// 回答を待って自分の画面が止まる、ということは起きない。

// 自分の進捗（matches/{matchId}/progress/{uid}）がまだ無ければ、0問・未完了で作成する。
// 既に存在する場合は何もしない（再接続時に0へ巻き戻さないため）。ホストが対戦開始時に
// 全員分をまとめて作るのではなく、各端末が自分の分だけを自分で作る設計にしている
// （セキュリティルール上、progressは本人しか書き込めないため）。
export async function initializeMyMatchProgress({ roomId, matchId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const progressRef = ref(database, `rooms/${roomId}/matches/${matchId}/progress/${uid}`);
  try {
    const snapshot = await get(progressRef);
    if (snapshot.exists()) return { ok: true };
    await set(progressRef, { answeredCount: 0, finished: false, updatedAt: serverTimestamp() });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
}

// 1問終える（正解して次へ進む、またはハードルールで1回answeredした）たびに呼ぶ。
// answeredCountは「ここまでに完了した問題数」の絶対値（Firebase上の値を読んで+1する方式では
// ない）。呼び出し元でイベントが二重発火したり、通信失敗後にリトライしても、
// 同じ値を再送するだけになるため安全（冪等）。
//
// 【逆戻り防止】一時的な再接続・通信の遅延で、古い（小さい）answeredCountが後から遅れて
// 届いても、進捗表示が逆戻りしないよう、現在値より大きい場合だけ実際に書き込む
// （finishCountdown()と同じ「読む→確認する→書く」方式。単一の書き手＝本人しかいない場面
// なので、runTransaction()は使わずシンプルな方式で十分安全）。
// また、activeMatchIdが今の試合と一致しているかも送信前に確認し、古い試合の書き込みが
// 混ざらないようにする（Firebaseセキュリティルール側にも同じ制約を入れている、二重の安全策）。
export async function submitAnswerProgress({ roomId, matchId, answeredCount }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const [activeMatchSnapshot, currentSnapshot] = await Promise.all([
    get(ref(database, `rooms/${roomId}/activeMatchId`)),
    get(ref(database, `rooms/${roomId}/matches/${matchId}/progress/${uid}/answeredCount`)),
  ]);
  if (activeMatchSnapshot.val() !== matchId) {
    return { ok: false, reason: "stale-match" };
  }
  const currentValue = currentSnapshot.val() ?? 0;
  if (answeredCount <= currentValue) {
    return { ok: true }; // 既に同じか新しい値が反映済み（逆戻り防止）
  }

  try {
    await update(ref(database), {
      [`rooms/${roomId}/matches/${matchId}/progress/${uid}/answeredCount`]: answeredCount,
      [`rooms/${roomId}/matches/${matchId}/progress/${uid}/updatedAt`]: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
}

// 2つの値が「Firebase上での見え方として」同じかどうかを比較する。ふつうのdeep-equalと違い、
// 「キーが無い」と「値がnull/undefined」を同じ扱いにする点がポイント（Firebaseはnull/undefinedの
// フィールドを書き込まず、キーごと省略してしまうため。js/onlineBattle.js内の他の場所でも
// 「nullなら未設定＝キー自体が作られない」という同じ考え方を使っている）。
// finishMyMatch()が、送信失敗後にFirebase上の既存resultsと「今回送ろうとした内容」を
// 比較するために使う。
function isEquivalentIgnoringNullish(a, b) {
  const isMissing = (value) => value === undefined || value === null;
  if (isMissing(a) && isMissing(b)) return true;
  if (isMissing(a) || isMissing(b)) return false;
  if (a === b) return true;

  const isPlainObject = (value) => typeof value === "object" && !Array.isArray(value);
  if (!isPlainObject(a) || !isPlainObject(b)) return false;

  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!isEquivalentIgnoringNullish(a[key], b[key])) return false;
  }
  return true;
}

// 全問終了、またはLOVE連チャンで脱落が確定したときに呼ぶ。自分の結果（js/battleModes/配下の
// createResult()の戻り値）をmatches/{matchId}/results/{uid}へ送信し、成功したら
// progress.finished をtrueにする（この順序が重要：ホストは「全員finished」を見て結果確定を
// 判断するため、finishedがtrueになる前に必ずresultsが保存済みである状態を保証したい）。
//
// 【送信失敗時の冪等な復旧】通信の一時的な不調でset()自体が失敗しても、実際にはサーバー側で
// 保存に成功していることがある（resultsは初回作成のみ許可というルールのため、既に存在すれば
// 「送信済み」とみなせる）。失敗のたびに存在確認を挟みながら、間隔を空けて最大3回まで試行する
// （finishCountdown()と同じ考え方）。
//
// 【本人の指摘・2026-08-08】既存のresultsが「存在するかどうか」だけで成功扱いにすると、
// 万一Firebase上に自分以外の書き込みが紛れ込んでいた場合（本来起こらないはずだが）、
// ローカルで計算した結果とFirebase上の結果が食い違ったまま待機画面へ進んでしまう危険がある。
// そのため、既存のresultsが見つかった場合は「今回送ろうとしている内容と本当に同じか」を
// isEquivalentIgnoringNullish()で確認し、一致する場合だけ成功扱いにする。内容が異なる場合は
// （＝本来起こらないはずの異常事態のため）これ以上リトライしても意味がないので、即座に
// reason:"result-mismatch"として処理を打ち切る。
export async function finishMyMatch({ roomId, matchId, result, answeredCount }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const resultRef = ref(database, `rooms/${roomId}/matches/${matchId}/results/${uid}`);
  const MAX_ATTEMPTS = 3;
  let resultSaved = false;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !resultSaved; attempt++) {
    try {
      await set(resultRef, result);
      resultSaved = true;
    } catch (error) {
      let existing;
      try {
        const snapshot = await get(resultRef);
        existing = snapshot.exists() ? snapshot.val() : undefined;
      } catch (checkError) {
        existing = undefined;
      }

      if (existing !== undefined) {
        if (isEquivalentIgnoringNullish(existing, result)) {
          resultSaved = true;
        } else {
          // 既に別の内容で保存済み。書き込みルール上、本人であっても上書きはできないため、
          // リトライしても状況は変わらない。ここで即座に諦める。
          return { ok: false, reason: "result-mismatch" };
        }
      }
      if (!resultSaved && attempt < MAX_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
      }
    }
  }
  if (!resultSaved) {
    return { ok: false, reason: "result-write-failed" };
  }

  try {
    await update(ref(database), {
      [`rooms/${roomId}/matches/${matchId}/progress/${uid}/answeredCount`]: answeredCount,
      [`rooms/${roomId}/matches/${matchId}/progress/${uid}/finished`]: true,
      [`rooms/${roomId}/matches/${matchId}/progress/${uid}/updatedAt`]: serverTimestamp(),
    });
  } catch (error) {
    return { ok: false, reason: "finished-flag-write-failed" };
  }
  return { ok: true };
}

// ホストが呼ぶ。固定参加者（matches/{matchId}/participants）全員のprogress.finishedが
// そろっていれば、statusをresultへ進める。force:trueを指定すると、そろっていなくても
// 強制的に進める（未完了者はDNF扱いになる＝結果画面でresultsが無い人として表示される）。
// 何度呼んでも安全（冪等）：既にresultなら成功扱いで即終了、playing以外なら失敗を返す。
//
// 【呼ばれるタイミング】①待機画面に入るたび（初回表示・再接続どちらも）自動判定として、
// force:falseで呼ばれる。②ホストが「結果を確定する」ボタンを押したとき、force:trueで呼ばれる。
// どちらも同じ関数を使うことで、判定ロジックを2重に持たないようにしている。
export async function finalizeMatchIfReady({ roomId, matchId, force = false }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.activeMatchId !== matchId) return { ok: false, reason: "stale-match" };
  if (room.status === ROOM_STATUS.RESULT) return { ok: true, finalized: true };
  if (room.status !== ROOM_STATUS.PLAYING) return { ok: false, reason: "not-playing" };

  const match = (room.matches || {})[matchId] || {};
  const participantUids = Object.keys(match.participants || {});
  const progress = match.progress || {};
  const allFinished =
    participantUids.length > 0 && participantUids.every((participantUid) => progress[participantUid]?.finished === true);

  if (!allFinished && !force) {
    return { ok: true, finalized: false };
  }

  try {
    await update(ref(database), { [`rooms/${roomId}/status`]: ROOM_STATUS.RESULT });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true, finalized: true };
}

// ホストが結果画面で「もう一度対戦する」を選んだときに呼ぶ。ルーム・対戦設定（settings）は
// そのまま維持し、statusだけをwaitingへ戻して、次の対戦への準備をやり直せる状態にする。
//
// 【何を変えて、何を変えないか】
//   ・変える  ：status（waiting）、現在ルームに残っている参加者全員のready・readyForRevision
//   ・変えない：settings（前回の設定をそのまま引き継ぐ）、activeMatchId、過去のmatches/{matchId}
//               （participants・progress・resultsは削除せず、試合の履歴としてそのまま残す）
// activeMatchIdを今ここで消したり書き換えたりする必要はない。次にホストがstartBattle()を
// 呼んだ時点で、新しいmatchIdが自動的に発行されて上書きされる（js/onlineBattle.jsの
// startBattle()参照）。statusがwaitingの間は誰も出題画面へは進まないため、
// 古いactiveMatchIdが残っていても実害が無い設計にしている。
//
// 【READYリセットの対象】前回の試合の参加者スナップショット（matches/{matchId}/participants）
// ではなく、今の時点でrooms/{roomId}/playersに実際に残っている人だけを対象にする。
// 前回の試合後に退出した人は自然に対象外になり、逆に結果確定後に新しく参加した人がいれば、
// 次回のstartBattle()がその時点のplayers一覧から新しい参加者スナップショットを作る
// （既存のstartBattle()の実装をそのまま利用するだけで対応できる）。
//
// 【冪等性】何度呼んでも安全：既にwaitingなら即座に成功扱い、result以外の状態（waiting・
// countdown・playing等）から呼ばれた場合は失敗を返す（resultのときだけ許可）。
export async function rematchMatch({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  const snapshot = await get(ref(database, `rooms/${roomId}`));
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status === ROOM_STATUS.WAITING) return { ok: true }; // 既に目標状態（冪等）
  if (room.status !== ROOM_STATUS.RESULT) return { ok: false, reason: "not-result" };

  // statusとREADYリセットを1回のupdate()にまとめる。分けて書き込むと、一部の端末が
  // 「statusはwaitingになったのに、READYはまだ前回のまま」という一瞬の不整合を
  // 観測してしまう可能性があるため（本人の指摘）。
  const players = room.players || {};
  const updates = { [`rooms/${roomId}/status`]: ROOM_STATUS.WAITING };
  Object.keys(players).forEach((playerUid) => {
    updates[`rooms/${roomId}/players/${playerUid}/ready`] = false;
    // -1は「有効なsettingsRevision（0以上の整数）とは絶対に一致しない」ことを保証するための値。
    // readyを同時にfalseへ戻しているため実質どんな値でも安全だが、万一の食い違いも防ぐ意味で
    // 明確な「未準備」を表す値にしている。
    updates[`rooms/${roomId}/players/${playerUid}/readyForRevision`] = -1;
  });

  try {
    await update(ref(database), updates);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
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
