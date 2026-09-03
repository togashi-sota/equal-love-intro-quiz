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
import { QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { pickNextHostUid } from "./onlineBattleHostTransitionPayloads.js";
import {
  computeAllPlayersRematchReady,
  computeAllPlayersResultReturned,
  buildRematchProposalUpdates,
} from "./onlineBattleMatchConfirmationPayloads.js";
import { startActivityPresenceTracking, stopActivityPresenceTracking } from "./onlineBattlePresence.js";
import { isMatchReadyToFinalize } from "./onlineBattleMatchProgress.js";

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

// 【2026-11-XX新設・本人指示Q7：Firebase read/writeの一時失敗でUnhandled Promise Rejection
// を起こさない】get(ref(database, path))を直接呼ぶと、オフライン・切断・セキュリティルール
// 拒否等で例外が投げられた場合、呼び出し元がtry/catchで囲んでいない限りそのまま
// Unhandled Promise Rejectionとして伝播してしまう。この関数は例外を握りつぶして
// 「成功扱い」にはせず、必ずconsole.warnで原因を残した上でnullを返す（本人指示：
// 「catchして何もせず成功扱いにはしない」）。呼び出し元は、nullを「読み取れなかった」
// という安全な失敗として扱い、既存の{ok:false, reason:"..."}という戻り値契約に沿って
// 呼び出し元（画面）へ伝える。
async function safeGetSnapshot(path) {
  try {
    return await get(ref(database, path));
  } catch (error) {
    console.warn(`[onlineBattle] Firebase読み取りに失敗しました（path: ${path}）`, error);
    return null;
  }
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

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はsafeGetSnapshot()がnullを返すが、
  // checkCapacity(null, uid)は元々「不正な形のroom」をnot-foundとして安全に扱う設計の
  // ため、`snapshot?.exists()`にするだけで既存の戻り値契約を変えずに保護できる。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  const room = snapshot?.exists() ? snapshot.val() : null;
  const capacity = checkCapacity(room, uid);
  if (!capacity.ok) {
    return { ok: false, reason: capacity.reason };
  }

  try {
    await reservePlayerSlot({ roomId, uid, playerName, alreadyJoined: capacity.alreadyJoined });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }

  // 【2026-09-13追加・本人指示：対戦開始前ルール確認画面】ルール確認中（room.confirmingMatch）
  // に新しく参加した場合、既存参加者を含めて確認状態を一度リセットする（本人指示24）。
  // 参加自体を失敗させないよう、この後始末はfire-and-forgetで行う
  // （resetRuleConfirmationsIfConfirming自体が失敗を握りつぶす設計）。
  resetRuleConfirmationsIfConfirming({ roomId, room, joiningUid: uid });
  // 【2026-11-XX変更・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
  // 以前はここでresetRematchReadyIfConfirming()を呼び、再戦準備中に新しく参加した人が
  // いれば提案そのものを取り消していたが、今は新規参加者をrematchParticipantUidsの
  // スナップショットから自然に除外する方式へ変更したため、この呼び出しは不要になった
  // （進行中の再戦・既存参加者のREADY状態には一切触れない）。

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

  // 【2026-11-XX修正・本人指示Q7】上のjoinRoom()と同じ理由・同じパターン。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  const room = snapshot?.exists() ? snapshot.val() : null;
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
  // 【2026-11-XX修正・本人指示Q7】上のremove()もtry/catchが無かった。leaveRoom()と同じ理由・
  // 同じ方針（失敗を記録した上で、呼び出し元のその後の画面遷移は妨げない）で保護する。
  try {
    await remove(ref(database, `rooms/${roomId}/spectators/${uid}`));
  } catch (error) {
    console.warn(`[onlineBattle] leaveSpectating()のFirebase削除に失敗しました（roomId: ${roomId}）`, error);
  }
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

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.status !== ROOM_STATUS.WAITING) return { ok: false, reason: "not-waiting" };

  const players = room.players || {};
  const spectators = room.spectators || {};
  if (!Object.prototype.hasOwnProperty.call(spectators, uid)) return { ok: false, reason: "not-spectating" };
  // 既にプレイヤーとしても存在する場合（通常起こらないが、安全のため）は何もせず成功扱い。
  if (Object.prototype.hasOwnProperty.call(players, uid)) {
    // 【2026-11-XX修正・本人指示Q7】このremove()もtry/catchが無かった。
    try {
      await remove(ref(database, `rooms/${roomId}/spectators/${uid}`));
    } catch (error) {
      return { ok: false, reason: "write-failed" };
    }
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
  // 【2026-09-13追加・本人指示：対戦開始前ルール確認画面】観戦者が競技参加へ昇格した
  // 場合もjoinRoom()と同じ理由でルール確認状態をリセットする（js/onlineBattle.jsの
  // joinRoom()参照）。
  resetRuleConfirmationsIfConfirming({ roomId, room, joiningUid: uid });
  // 【2026-11-XX変更・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
  // 観戦者からの昇格も「新規参加」の一種のため、上のjoinRoom()と同じ理由で
  // resetRematchReadyIfConfirming()の呼び出しを廃止した（rematchParticipantUidsの
  // スナップショットに含まれない限り、この人は自動的に今の再戦の対象外になる）。
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

  // 【2026-11-XX修正・本人指示Q7】この関数は読み取り・分岐後の書き込みのどちらも
  // try/catchで守られていなかった。「退出する」という頻繁な操作のたびにFirebaseの
  // 一時的な失敗でUnhandled Promise Rejectionになりうる経路だったため保護する。
  // 呼び出し元（js/onlineBattleScreen.js）はいずれもawaitするだけで戻り値を見ておらず、
  // Firebase側の書き込みが失敗しても、その後のstopListeningToRoom()・画面遷移は
  // 変わらず実行する設計のため、ここでは例外を記録してから安全側（clearLastRoom()まで
  // 到達させる）に倒すのが最も既存動作に近い。
  try {
    const roomRef = ref(database, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      clearLastRoom();
      return;
    }

    const room = snapshot.val();
    // 【2026-10-01追加・本人指示：結果画面/再戦フロー全面設計12-6/12-7/12-9章】再戦準備中
    // （confirmingRematch===true）に誰かが退出する場合、①ホスト自身の退出なら（ホスト移譲の
    // 有無に関わらず）旧ホストが出した再戦提案をキャンセルする、②残る人数が2人未満になる
    // なら（オンライン対戦の再戦には最低2人必要なため）再戦提案をキャンセルする。
    const remainingCount = Object.keys(room.players || {}).filter((playerUid) => playerUid !== uid).length;
    const shouldCancelRematch = room.confirmingRematch === true && (room.host === uid || remainingCount < 2);
    if (room.host === uid) {
      const nextHostUid = pickNextHostUid(room.players || {}, uid);
      if (nextHostUid === null) {
        // 他に誰も残っていない：今までどおりルームごと削除する。
        await remove(roomRef);
      } else {
        // host（新ホストへ）とplayers/{自分}（削除）を1回のupdate()にまとめることで、
        // 「ホストは変わったのに自分の参加者情報がまだ残っている」ような一瞬の不整合を防ぐ。
        const updates = {
          [`rooms/${roomId}/host`]: nextHostUid,
          [`rooms/${roomId}/players/${uid}`]: null,
        };
        if (shouldCancelRematch) updates[`rooms/${roomId}/confirmingRematch`] = false;
        await update(ref(database), updates);
      }
    } else if (shouldCancelRematch) {
      await update(ref(database), {
        [`rooms/${roomId}/players/${uid}`]: null,
        [`rooms/${roomId}/confirmingRematch`]: false,
      });
    } else {
      await remove(ref(database, `rooms/${roomId}/players/${uid}`));
    }
  } catch (error) {
    console.warn(`[onlineBattle] leaveRoom()のFirebase読み書きに失敗しました（roomId: ${roomId}）`, error);
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

  // 【2026-11-XX追加・実機バグ調査：仕様総監査で発見】この関数だけ、読み取り（get）・
  // 書き込み（update）のどちらもtry/catchで守られていなかった。ロビーで設定を変更する
  // （出題数・ルール等のラジオを切り替える）という頻繁な操作のたびに呼ばれる経路のため、
  // オフライン・Firebase側の一時的な拒否等で例外が起きると、そのままUnhandled Promise
  // Rejectionとして伝播していた。他の同種関数（kickPlayer・transferHost等）と同じ
  // 「読み書き失敗時はok:falseを返す」設計へ揃える。
  let room;
  try {
    const snapshot = await get(ref(database, `rooms/${roomId}`));
    if (!snapshot.exists()) return { ok: false, reason: "not-found" };
    room = snapshot.val();
  } catch (error) {
    return { ok: false, reason: "read-failed" };
  }
  if (room.host !== uid) return { ok: false, reason: "not-host" };

  // 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-2/19-3章】以前はここで
  // validateRoomSettings()がエラーを返すと、設定そのものをFirebaseへ書き込まずに
  // 失敗として返していた。しかしこの検証は「今すぐ対戦を開始できるか」（出題数に対して
  // 曲が足りているか等）の検証であり、「設定として保存してよいか」とは別の話である。
  // 書き込みを拒否してしまうと、たとえば曲数が足りない状態で「曲を選んで出題」へ
  // 切り替えようとしても、その意思表示自体がFirebaseに残らず、次の画面更新で
  // ラジオ・選曲UIが「全曲から出題」へ強制的に戻される（＝曲を追加するための選曲画面へ
  // 二度と入れなくなる）という詰み状態を生んでいた（本人指示：「警告は開始できない
  // 理由を伝えるものであって、設定変更まで禁止するものにしないでください」）。
  // 実際に対戦を開始できるかどうかの検証は、resolveBattleStartValidation()
  // （startBattle()・beginMatchConfirmation()が呼ぶ）が独立して行っているため、
  // ここで検証エラーのまま書き込みを許しても、対戦の開始条件が緩むことはない。
  // 戻り値のmessageは、呼び出し側が警告文をそのまま表示できるよう引き続き返す。
  const errorMessage = validateRoomSettings(room.gameMode, settings);

  // 【2026-09-07改訂・本人指示：READY状態をルール変更で解除しない】以前はここで非ホスト
  // 全員のready/readyForRevisionを強制的に解除していたが、「ルールを少し変えるたびに
  // 毎回READYを押し直すのが面倒」という指示により撤廃した。READY＝「本人が参加する意思を
  // 示した」という表明として扱い、本人が自分で解除しない限り、ホストの設定変更では
  // 消えないようにする。「その設定で実際に開始できるか」（音源・歌詞等のデータが足りるか）は
  // READYとは別の話として、startBattle()側の絞り込み・検証（共通曲0件なら開始不可）が
  // 既に安全側に守っている（このコメントの少し下のresolveSongPoolForSettings関連の
  // 処理を参照。設定変更でREADYを解除しなくなっても、データが足りない状態のまま
  // 対戦が始まってしまうことは無い）。
  const nextRevision = (room.settingsRevision ?? 0) + 1;
  const updates = {
    [`rooms/${roomId}/settings`]: settings,
    [`rooms/${roomId}/settingsRevision`]: nextRevision,
  };

  try {
    await update(ref(database), updates);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return errorMessage
    ? { ok: true, settingsRevision: nextRevision, validationMessage: errorMessage }
    : { ok: true, settingsRevision: nextRevision };
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

  let snapshot;
  try {
    snapshot = await get(ref(database, `rooms/${roomId}`));
  } catch {
    // 【2026-11-XX追加・実機バグ調査：ロビー復帰直後にモード切替だけ反応しない】
    // updateRoomSettings()側のupdate()呼び出しは既にtry/catchで守られていたが、
    // ここのget()には無かった。一時的なネットワークエラーでこのget()が失敗すると、
    // 呼び出し元（js/onlineBattleScreen.jsのラジオchangeハンドラ）のawaitが
    // 例外で止まり、「書き込み中」フラグとラジオのdisabledが解除されないまま
    // 永続してしまう不具合があったため、update()と同じ形でここも守る。
    return { ok: false, reason: "read-failed" };
  }
  if (!snapshot.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  // 【2026-11-XX改訂・実機バグ調査：ロビー復帰直後だけモード切替が反応しない不具合】
  // 以前はstatus==='waiting'だけを許可していたが、試合終了直後は
  // 「playing→result（試合結果確定）→（全員がresultReturnedしてから）waiting」という
  // 複数のFirebase往復を経て初めて'waiting'になる。「ルーム設定へ戻る」を押した時点で
  // 画面は先にロビーへ進む設計（他の離脱系処理と同じ、通信を待たせずナビゲーションする
  // 方針）のため、'waiting'書き込みがまだ完了していない一瞬に対戦モードのボタンを押すと、
  // このガードにだけ弾かれて無反応に見えていた（出題数等のupdateRoomSettings()には
  // この種のガードが元々無いため、同じ状況でも問題なく通っていた）。
  // 'result'の時点で既に採点は確定しており、モードを変えても対戦中の公平性には一切
  // 影響しないため、'waiting'に加えて'result'でも書き込みを許可する
  // （firebase/database.rules.jsonのgameMode用ルールも同じ理由で合わせて緩和済み）。
  if (room.status !== ROOM_STATUS.WAITING && room.status !== ROOM_STATUS.RESULT) {
    return { ok: false, reason: "not-waiting" };
  }
  if (room.gameMode === gameMode) return { ok: true, settings: room.settings };

  const settings = createDefaultSettings(gameMode);
  if (!settings) return { ok: false, reason: "unsupported-mode" };

  // 【2026-09-26追加・本人指示：オンライン対戦総合改修19-2/19-3章】モードを変更しても、
  // 「曲を選んで出題」で選んだ曲は可能な限り引き継ぐ（本人指示：「モード変更したら選曲を
  // 全部リセットするのではなく、ユーザーが選んだ曲集合はルーム設定として可能な限り
  // 引き継ぎ、そのモードで使用可能な曲だけを有効曲として評価する」）。
  // 【何を引き継ぐか】players/{uid}/selectedSongIds（各参加者の生の選択）自体はこの関数では
  // 一切触れていないため、常にそのまま残る。ここで引き継ぐ必要があるのは、
  // settings.questionSource.type（「曲を選んで出題」を選んでいたという事実）だけである。
  // これをcreateDefaultSettings()の既定値（type省略＝全曲から出題）で上書きしてしまうと、
  // 曲選択UI（js/onlineBattleScreen.jsのupdateCollabSongSectionUi()）がsettings確定値だけを
  // 見て非表示になり、モード変更後に選曲編集へ入れなくなる不具合が起きていた。
  // songIdsは新モードでの有効曲数によって変わりうるため、ここでは空にしておき、次に
  // ホストが設定を保存する際（applyHostSettingsChangeFromForm等）に新モードの有効曲で
  // 絞り込んだ最新の値へ自動的に更新される（syncCollaborativeSongPoolIfHostが担当）。
  const wasCollaborativeSelection = room.settings?.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  if (wasCollaborativeSelection) {
    settings.questionSource = { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: [] };
  }

  // 【2026-09-07改訂・本人指示：READY状態をルール変更で解除しない】updateRoomSettings()と
  // 同じ理由でREADYの強制解除をやめた（詳しいコメントはそちら参照）。
  const nextRevision = (room.settingsRevision ?? 0) + 1;
  const updates = {
    [`rooms/${roomId}/gameMode`]: gameMode,
    [`rooms/${roomId}/settings`]: settings,
    [`rooms/${roomId}/settingsRevision`]: nextRevision,
  };

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

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (newHostUid === uid) return { ok: true }; // 自分自身への移譲は何もしない（冪等）
  if (!room.players?.[newHostUid]) return { ok: false, reason: "player-not-found" };

  const updates = { [`rooms/${roomId}/host`]: newHostUid };
  // 【2026-10-01追加・本人指示：結果画面/再戦フロー全面設計12-9章】再戦準備中に
  // ホストを移譲する場合、旧ホストが出した再戦提案は一旦キャンセルする（本人指示：
  // 新ホストの判断で改めて再戦/ロビー開始してほしいため、提案を引き継がない）。
  // 【2026-11-XX追加・実機バグ調査：再戦フロー仕様G】confirmingRematchだけでなく、
  // 各参加者のrematchReadyも合わせてリセットする（本人指示の仕様書どおり「READY状態も
  // 含め全てリセット」を厳密に満たすため）。新ホストが必要なら改めて再戦を提案し、
  // 参加者は改めて準備OKを押し直す。
  if (room.confirmingRematch === true) {
    updates[`rooms/${roomId}/confirmingRematch`] = false;
    for (const playerUid of Object.keys(room.players ?? {})) {
      updates[`rooms/${roomId}/players/${playerUid}/rematchReady`] = false;
    }
  }
  try {
    await update(ref(database), updates);
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

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host === uid) return { ok: true }; // 既に自分がホスト（冪等）
  if (!room.players?.[uid]) return { ok: false, reason: "not-in-room" };
  if (room.players[room.host]?.connected !== false) return { ok: false, reason: "host-still-connected" };

  const updates = { [`rooms/${roomId}/host`]: uid };
  // 【2026-10-01追加・本人指示：結果画面/再戦フロー全面設計12-9章】transferHost()と同じ理由で、
  // ホスト自動移譲でも再戦提案があれば一旦キャンセルする。
  // 【2026-11-XX追加・実機バグ調査：再戦フロー仕様G】transferHost()と同じく、各参加者の
  // rematchReadyも合わせてリセットする。
  if (room.confirmingRematch === true) {
    updates[`rooms/${roomId}/confirmingRematch`] = false;
    for (const playerUid of Object.keys(room.players ?? {})) {
      updates[`rooms/${roomId}/players/${playerUid}/rematchReady`] = false;
    }
  }
  try {
    await update(ref(database), updates);
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

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status !== ROOM_STATUS.WAITING) return { ok: false, reason: "not-waiting" };
  if (!room.players?.[targetUid]) return { ok: false, reason: "player-not-found" };

  // 【2026-10-01追加・本人指示：結果画面/再戦フロー全面設計12-5/12-6章】再戦準備中
  // （confirmingRematch===true）のキックで、キック後に残る人数が2人未満になる場合は、
  // オンライン対戦の再戦に最低2人必要という制約により再戦提案自体もキャンセルする。
  const remainingCount = Object.keys(room.players).filter((playerUid) => playerUid !== targetUid).length;
  const shouldCancelRematch = room.confirmingRematch === true && remainingCount < 2;

  try {
    if (shouldCancelRematch) {
      await update(ref(database), {
        [`rooms/${roomId}/players/${targetUid}`]: null,
        [`rooms/${roomId}/confirmingRematch`]: false,
      });
    } else {
      await remove(ref(database, `rooms/${roomId}/players/${targetUid}`));
    }
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

  // 【2026-11-XX修正・本人指示Q7】読み取り・書き込みともtry/catchが無く、Firebaseの
  // 一時的な失敗でUnhandled Promise Rejectionになっていたため保護する。
  try {
    const revisionSnapshot = await safeGetSnapshot(`rooms/${roomId}/settingsRevision`);
    const currentRevision = revisionSnapshot?.val() ?? 0;
    await update(ref(database), {
      [`rooms/${roomId}/players/${uid}/ready`]: ready,
      [`rooms/${roomId}/players/${uid}/readyForRevision`]: currentRevision,
    });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
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
// 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】startBattle()が対戦開始直前に
// 行っている一連のチェック（ホスト本人か・ロビー中か・設定が有効か・全員READYか・
// 参加者全員が実際に利用できる共通曲があるか）を、ここへ切り出した。
// beginMatchConfirmation()（ルール確認の開始）とstartBattle()（実際の対戦開始）の
// 両方から呼ぶことで、判定ロジックを2重に持たない（本人指示のとおり、既存の安全な
// チェックは複製せず再利用する）。戻り値は{ ok:false, reason, message? }、または
// { ok:true, room, players, finalSettings }。
async function resolveBattleStartValidation({ roomId, settings }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
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
  // 【2026-09-07改訂・本人指示：READY状態をルール変更で解除しない】以前はplayer.readyに
  // 加えてreadyForRevision===currentRevisionも必須にしており、設定変更のたびに
  // readyが実質的に無効化されていた（updateRoomSettings()側の強制解除と二重の仕組みに
  // なっていた）。READYを本人が明示的に解除しない限り維持する方針にしたため、
  // revision一致は もう条件にしない（player.readyだけを見る）。
  const players = room.players || {};
  const nonHostEntries = Object.entries(players).filter(([playerUid]) => playerUid !== uid);
  const allReady = nonHostEntries.length === 0 || nonHostEntries.every(([, player]) => player.ready);
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

  return { ok: true, uid, room, players, finalSettings };
}

// ロビーの「対戦を開始する」から呼ぶ、既存の実際の対戦開始処理。
export async function startBattle({ roomId, settings }) {
  const validation = await resolveBattleStartValidation({ roomId, settings });
  if (!validation.ok) return validation;
  const { uid, room, players, finalSettings } = validation;
  return writeNewMatchStart({ roomId, room, uid, players, finalSettings });
}

// 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】「対戦を開始する」を押した直後に
// 呼ぶ。startBattle()と全く同じ条件（ホスト・ロビー中・設定・READY・共通曲）を満たさない
// 限りルール確認へは進ませない（本人指示26「データ不足者がいる場合は確認画面で開始
// させない」を、確認画面に入る前の時点で満たす設計。開始不可の理由は、既存の
// 「対戦を開始する」ボタンと全く同じreasonをそのまま返すため、UI側の文言も再利用できる）。
// 確認済みなら、まずroom.confirmingMatchをtrueにし、全参加者のruleConfirmedを
// falseへリセットしてから書き込む（新しい確認ラウンドを毎回まっさらな状態で始めるため）。
// 実際の対戦開始（seed・activeMatchId・status:countdownへの書き込み）はここでは行わない
// ——全員の確認が完了した時点で、改めてstartBattle()を呼ぶ（本人指示：確認画面の途中で
// 設定が古くなっていないか、実際に開始する瞬間にもう一度確かめる二重構造にするため）。
export async function beginMatchConfirmation({ roomId, settings }) {
  const validation = await resolveBattleStartValidation({ roomId, settings });
  if (!validation.ok) return validation;
  const { players } = validation;

  const updates = {
    [`rooms/${roomId}/confirmingMatch`]: true,
  };
  Object.keys(players).forEach((playerUid) => {
    updates[`rooms/${roomId}/players/${playerUid}/ruleConfirmed`] = false;
  });
  try {
    await update(ref(database), updates);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 自分の「確認OK」状態をトグルする（js/onlineBattle.jsのsetReady()と全く同じ考え方：
// 本人指示19「確認OKはトグル式」。一度押したら取り消せない仕様にはしない）。
export async function setRuleConfirmed({ roomId, confirmed }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  try {
    await update(ref(database), { [`rooms/${roomId}/players/${uid}/ruleConfirmed`]: confirmed });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】ゲスト本人が、進行中の
// 試合から「自分だけ」抜けたことをFirebaseへ記録する。ホストの既存のreturnRoomToLobby()
// （room.statusをwaitingへ戻し、全員を巻き込んで対戦を中断する）とは全く別物：
// こちらはroom.status・room.players・matches全体には一切触れず、「この試合の、この人」
// だけに付く小さなフラグ（matches/{matchId}/participants/{uid}/leftDuringMatch）を
// 立てるだけ。ルーム在籍・他の参加者の対戦進行には一切影響しない。
// write-once（一度trueにしたら書き換え不可、Firebase Rules側でも保証）にしているのは、
// 「途中離脱した」という事実を後から本人が取り消せないようにするため（本人指示：
// 順位・勝敗・称号判定の対象外という扱いを確定させる必要があるため）。
export async function leaveMatchInProgress({ roomId, matchId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  try {
    await update(ref(database), { [`rooms/${roomId}/matches/${matchId}/participants/${uid}/leftDuringMatch`]: true });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・個人進行系）の再設計】
// タイムアタック・ランダム再生対戦・アウトロクイズ対戦のような「早さが勝敗・記録に直結する
// 速度勝負系」では、誰か1人でも本当に音が出なかった時点で、その試合自体の公平性が
// 既に失われている（音が出なかった人だけが圧倒的に不利になるため）。
// 【設計の変遷】当初は「申告した本人だけがこの試合から安全に抜け、残りのプレイヤーだけで
// 試合を続ける」設計（matches/{matchId}/participants/{uid}/audioTroubleAbort、本人だけに
// 付くフラグ）にしていたが、本人からの明確な訂正により、「本人だけが抜ける」のではなく
// 「試合全体を無効試合にし、勝敗を付けず、全員を安全にロビーへ戻す」設計へ作り直した。
// 【新しいデータ構造】matches/{matchId}/matchInvalidated（参加者の誰か1人につき1つの、
// 試合全体で共有する場所。個人ごとのフラグではない）に { reportedByUid, reportedAt } を
// write-once（最初の1件だけが有効＝js/audioTroubleRecoveryFirebase.jsのreports/{questionIndex}/
// {attemptSlot}と同じ「最初の申告者が勝つ」考え方。同時に2人以上が押しても、2人目以降の
// 書き込みはFirebase Rules側の!data.exists()で拒否される）で記録する。
// 【古い試合・既に結果確定した試合への後出しを防ぐ】Firebase Rules側で、activeMatchIdが
// 今の試合と一致し、かつroom.statusが'playing'のときだけ書き込みを許可する（この個人進行系は
// 同期進行ではないため、audioTroubleRecoveryのようなcurrentQuestionIndex・questionStatusの
// 一致確認は不要）。これにより「古いmatchIdから遅れて申告が届く」「既にホストが結果を確定
// させた後に申告が届く（すでに試合終了処理へ入っている場合）」を、書き込み自体の拒否として
// 安全に処理できる（js/onlineBattleMatchInvalidationSecurityRules.jsに、このルールの意図を
// JS純粋関数として再現したシミュレーターとテストがある）。
// 【この後どうなるか】matchInvalidatedが立った試合は、finalizeMatchIfReady()がstatus:result
// へ進めるのを止め（下記参照）、代わりにホスト（誰であっても、その時点の現ホスト）の端末が
// 既存のreturnRoomToLobby()を呼んで、room.status・room.players・ルーム設定はそのまま保った
// 安全な形で全員をロビーへ戻す（js/onlineBattleScreen.js参照）。「申告した本人だけが抜けて
// 残りのプレイヤーだけで続行する」という実装には絶対にしない、という本人指示のとおり。
export async function reportMatchInvalidatedDueToAudioTrouble({ roomId, matchId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  try {
    await update(ref(database), {
      [`rooms/${roomId}/matches/${matchId}/matchInvalidated`]: { reportedByUid: uid, reportedAt: serverTimestamp() },
    });
  } catch (error) {
    // 【本人指示：様々な競合ケースでも安全に】ここで失敗しうる理由は主に3つ：
    // ①既に誰か（自分を含む）が先に申告済み（write-once）、②古い試合（activeMatchIdが
    // 既に別の試合へ進んでいる）、③既にホストが結果を確定させ、room.statusがplaying
    // でなくなっている（すでに試合終了処理へ入っている）。いずれも「この申告はもう
    // 意味を持たない／既に他の手段で解決済み」という安全側の状態のため、リトライはせず
    // 静かに失敗を返す（呼び出し元のjs/onlineBattleScreen.jsも、この関数をfire-and-forgetで
    // 呼び、失敗時の特別なエラー表示は行わない設計。既存のleaveMatchInProgress()と同じ方針）。
    if (error?.code === "PERMISSION_DENIED") return { ok: false, reason: "permission-denied" };
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】ルール確認中に新しい参加者が
// ルームへ入った場合、既存参加者を含めて確認状態を一度リセットする（本人指示24）。
// Firebase Rules側で「false（未確認）に戻すことだけ」は誰でもできるようにしてあるため
// （自分以外の確認状態を勝手にtrueにはできない、安全な片方向の書き込み）、参加した本人の
// 端末がそのまま実行できる。confirmingMatchがtrueでない（通常の入室）場合は何もしない。
export async function resetRuleConfirmationsIfConfirming({ roomId, room, joiningUid }) {
  if (!room?.confirmingMatch) return;
  const players = room.players || {};
  const updates = {};
  Object.keys(players).forEach((playerUid) => {
    updates[`rooms/${roomId}/players/${playerUid}/ruleConfirmed`] = false;
  });
  updates[`rooms/${roomId}/players/${joiningUid}/ruleConfirmed`] = false;
  try {
    await update(ref(database), updates);
  } catch (error) {
    // 失敗しても致命的ではない（各参加者は自分の確認状態を自分で管理できるため、
    // 次に誰かが操作すれば整合する）。
  }
}

// 【再戦準備フェーズ新設・本人指示→2026-10-01改訂→2026-11-XX廃止・実機バグ調査】
// 再戦準備中（room.confirmingRematch）に新しい参加者がルームへ入った場合の扱いは、
// 過去2回仕様が変わっている：①当初は準備状態を全員分falseへリセットするだけで提案は
// 続行、②その後「途中から再戦へ混ぜない」方針により、新規参加者が入った瞬間に再戦提案
// そのものを取りやめる（confirmingRematch:false）方式に変更、③今回さらに
// 「新規参加者が来ても、進行中の再戦（既存参加者のREADY状態も含めて）は一切乱さず、
// その新規参加者だけを対象外にすればよい」という確定仕様になったため、この関数
// （新規参加者の入室をきっかけに再戦提案そのものを取り消す処理）自体が不要になった。
// 新規参加者を対象外にする仕組みは、beginRematchReadyCheck()が再戦提案の瞬間に固定する
// room.rematchParticipantUids（この再戦の対象者のスナップショット）と、
// computeAllPlayersRematchReady()・finishRematchReadyCheck()側のフィルタだけで完結する
// （js/onlineBattleMatchConfirmationPayloads.js参照）。joinRoom()・spectateRoom()からの
// 呼び出しは削除済み。

// ホスト専用：ルール確認を取りやめてロビーへ戻す（設定を直接変更したくなった場合の
// 逃げ道。本人からの明示的な要望ではないが、進行に行き詰まらないための安全な保険）。
export async function cancelMatchConfirmation({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  try {
    await update(ref(database), { [`rooms/${roomId}/confirmingMatch`]: false });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-09-05新設】startBattle()・finishRematchReadyCheck()の両方から呼ばれる、実際に
// 「新しい試合を開始する」書き込み処理そのもの（seed・matchIdの発行、
// participantsスナップショットの作成、status→countdown）。呼び出し元が、それぞれの
// 文脈に応じた事前条件（waiting+全員ready、またはresult+ホストのみ等）を確認した
// あとに呼ぶ想定（本人指示：「もう一度」を押したときの開始演出・試合初期化は、
// 通常の対戦開始と全く同じ処理であるべき＝ロジックを2重に持たない）。
async function writeNewMatchStart({ roomId, room, uid, players, finalSettings }) {
  const seed = generateRandomSeed(ONLINE_SEED_BITS);
  const matchId = generateMatchId();
  const updates = {
    [`rooms/${roomId}/settings`]: finalSettings,
    [`rooms/${roomId}/seed`]: seed,
    [`rooms/${roomId}/status`]: ROOM_STATUS.COUNTDOWN,
    [`rooms/${roomId}/countdownStartedAt`]: serverTimestamp(),
    [`rooms/${roomId}/activeMatchId`]: matchId,
    // 【2026-09-13追加・本人指示：対戦開始前ルール確認画面】対戦が実際に始まる瞬間に、
    // ルール確認中フラグを必ず片付けておく（beginMatchConfirmation()経由でなく
    // finishRematchReadyCheck()から呼ばれた場合はそもそも立っていないはずだが、念のため
    // 毎回クリアしておくことで、万一残っていても次回のロビー表示に影響しない）。
    [`rooms/${roomId}/confirmingMatch`]: false,
    // 【再戦準備フェーズ新設・本人指示】上と全く同じ理由で、再戦準備中フラグも対戦開始の
    // 瞬間に必ず片付けておく（startBattle()経由の通常開始ではそもそも立っていないはずだが、
    // 念のため毎回クリアする）。
    [`rooms/${roomId}/confirmingRematch`]: false,
  };
  Object.entries(players).forEach(([playerUid, player]) => {
    updates[`rooms/${roomId}/matches/${matchId}/participants/${playerUid}`] = {
      displayName: player.name,
      isHost: playerUid === uid,
      oshiMemberId: player.oshiMemberId ?? null, // nullなら未設定（Firebase上ではキー自体が作られない）
    };
    // 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド26-29章】結果画面の
    // 「ルーム設定に戻る」を個人ごとに管理するresultReturnedを、新しい試合が始まる瞬間に
    // 必ず全員分false（未戻り）へ戻す（前回の試合の「戻り終えた」状態が次の試合へ
    // 持ち越されないようにするため）。
    updates[`rooms/${roomId}/players/${playerUid}/resultReturned`] = false;
  });
  try {
    await update(ref(database), updates);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
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

  // 【2026-11-XX修正・本人指示Q7】1問答えるたびに呼ばれる高頻度な経路のため、Firebaseの
  // 一時的な読み取り失敗でUnhandled Promise Rejectionにならないよう保護する。
  let activeMatchSnapshot;
  let currentSnapshot;
  try {
    [activeMatchSnapshot, currentSnapshot] = await Promise.all([
      get(ref(database, `rooms/${roomId}/activeMatchId`)),
      get(ref(database, `rooms/${roomId}/matches/${matchId}/progress/${uid}/answeredCount`)),
    ]);
  } catch (error) {
    return { ok: false, reason: "read-failed" };
  }
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
//
// 【2026-09-16修正・本人指示：対戦中に自主退出したゲストを待ち続けない】「揃っているか」の
// 判定はjs/onlineBattleMatchProgress.jsのisMatchReadyToFinalize()に切り出した。対戦中に
// 「この試合だけ抜ける」を選んだ参加者（leftDuringMatch:true）は、progress.finishedが
// 永遠に立たないため、以前はこの判定が常にfalseのままになり、ホストが手動で
// 「結果を確定する」を押すまで自動で結果画面へ進めなかった（同期3モードで先に修正した
// 「途中退出者を待たない」という考え方が、この個人進行系には未適用だった不具合）。
//
// 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】この試合に
// matchInvalidated（誰かが音源トラブルを申告し、試合全体が無効になったことを示す
// write-onceフラグ）が立っていたら、force:trueが指定されていても絶対にstatus:resultへ
// 進めない。ここで先に判定することで、「ホストが『結果を確定する』を押した瞬間に、
// 別の参加者の音源トラブル申告が割り込む」という競合（すでに試合終了処理へ入っている
// ケース）でも、無効化が後追いで上書きされることなく、常に安全側（無効試合として扱う）に
// 倒れる。matchInvalidated後の実際のロビーへの復帰は、この関数の役目ではなく、
// js/onlineBattleScreen.js側がroom更新のたびにmatchInvalidatedを検知し、既存の
// returnRoomToLobby()を呼んで行う（勝敗を付けず、全員を安全にロビーへ戻す設計）。
export async function finalizeMatchIfReady({ roomId, matchId, force = false }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.activeMatchId !== matchId) return { ok: false, reason: "stale-match" };
  if (room.status === ROOM_STATUS.RESULT) return { ok: true, finalized: true };
  if (room.status !== ROOM_STATUS.PLAYING) return { ok: false, reason: "not-playing" };

  const match = (room.matches || {})[matchId] || {};
  if (match.matchInvalidated) {
    return { ok: true, finalized: false, invalidated: true };
  }
  const allFinished = isMatchReadyToFinalize({ participants: match.participants, progress: match.progress });

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

// ホストが結果画面・対戦中に「ルーム設定へ戻る」を選んだときに呼ぶ。ルーム・対戦設定
// （settings）はそのまま維持し、statusだけをwaitingへ戻して、次の対戦への準備をやり直せる
// 状態にする。
//
// 【何を変えて、何を変えないか】
//   ・変える  ：status（waiting）のみ
//   ・変えない：settings（前回の設定をそのまま引き継ぐ）、activeMatchId、過去のmatches/{matchId}
//               （participants・progress・resultsは削除せず、試合の履歴としてそのまま残す）、
//               全員のready（本人指示：READYは本人が明示的に解除しない限りどの操作でも維持する）
// activeMatchIdを今ここで消したり書き換えたりする必要はない。次にホストがstartBattle()を
// 呼んだ時点で、新しいmatchIdが自動的に発行されて上書きされる（js/onlineBattle.jsの
// startBattle()参照）。statusがwaitingの間は誰も出題画面へは進まないため、
// 古いactiveMatchIdが残っていても実害が無い設計にしている。
//
// 【冪等性】何度呼んでも安全：既にwaitingなら即座に成功扱い、waiting以外の状態
// （countdown・playing・result）から呼ばれた場合だけ実際にstatusを書き換える。
//
// 【2026-09-05改訂、本人指示】以前は「もう一度対戦する」専用（result状態からしか
// 呼べない）だったが、「対戦中にホストがルーム設定へ戻れるようにしてほしい」という
// 要望を受け、countdown・playing状態からも呼べるよう対象を広げ、関数名も実態に
// 合わせてrematchMatch→returnRoomToLobbyへ改めた。「もう一度」（同じ設定のまま
// 即座に新しい試合を始める）は、これとは別のbeginRematchReadyCheck()が担う
// （2026-09-17改訂・本人指示：再戦準備フェーズの新設に伴い、「もう一度」は即座に開始
// するのではなく、まず全員の「準備OK」を待つ準備フェーズを経由するよう変更した）。
// 【2026-09-07改訂、本人指示】以前は呼ぶたびに全員のreadyを強制的に解除していたが、
// 「READYは本人が明示的に解除しない限り、設定変更・ルーム設定への復帰を含むどんな
// 操作でも維持する」という統一方針を受け、このreadyリセットを撤廃した。
export async function returnRoomToLobby({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status === ROOM_STATUS.WAITING) return { ok: true }; // 既に目標状態（冪等）

  // 【2026-09-07改訂・本人指示：READYは本人の操作以外で解除しない、へ統一】以前はここで
  // 全員のreadyを強制的にfalseへ戻していたが、updateRoomSettings()・updateRoomGameMode()
  // 側で既に撤廃した「READYを設定変更で解除しない」という方針と矛盾するため、
  // 「ルーム設定に戻る」でも同様にREADYを維持するようにした（statusだけ書き換える）。
  try {
    await update(ref(database), { [`rooms/${roomId}/status`]: ROOM_STATUS.WAITING });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド23-29章】結果画面の
// 「ルーム設定に戻る」を押した瞬間に、本人（ホスト・ゲストどちらでも）が自分の分の
// resultReturnedをtrueにする。以前はこの操作自体がホスト専用で、しかもroom.status全体を
// 即座にwaitingへ書き換えていたため、まだ結果を見ている他の参加者の画面まで強制的に
// ロビーへ戻してしまっていた（本人指示：「結果画面は各自のペースで見て、他の人の画面を
// 勝手に閉じない」）。この関数はroom.statusには一切触れず、本人の分だけを記録する
// （実際にroom.statusをwaitingへ戻す処理は、全員のresultReturnedが揃った時点でホストの
// 端末が自動的に行う。js/onlineBattleScreen.jsのrenderLobby()内、
// maybeFinalizeAllPlayersReturnedFromResult()参照）。
export async function markResultReturned({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  try {
    await update(ref(database), { [`rooms/${roomId}/players/${uid}/resultReturned`]: true });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド26-29章】ホストの端末だけが
// 定期的に呼ぶ（js/onlineBattleScreen.jsのrenderLobby()から、room更新のたびに軽量に確認する）。
// room.statusがまだresultのまま・全員（切断中を除く）のresultReturnedが揃っていれば、
// 実際にreturnRoomToLobby()を呼んでroom.statusをwaitingへ戻す。揃っていなければ何もしない
// （本人指示：全員が結果画面から戻り終えるまで、次の試合を始められないようにする）。
// 【再戦準備中は対象外】confirmingRematch===trueの間（もう一度の準備フェーズ中）は、
// finishRematchReadyCheck()側が別途「全員rematchReady」を見て試合を開始するため、
// ここで先にstatusをwaitingへ戻してしまうと二重の遷移になり得るため対象から除外する。
export async function maybeFinalizeReturnToLobbyIfAllReturned({ roomId, room }) {
  if (room.status !== ROOM_STATUS.RESULT) return { ok: true, finalized: false };
  if (room.confirmingRematch === true) return { ok: true, finalized: false };
  if (!computeAllPlayersResultReturned(room.players)) return { ok: true, finalized: false };
  const result = await returnRoomToLobby({ roomId });
  return { ...result, finalized: result.ok };
}

// 【再戦準備フェーズ新設・本人指示】beginRematchReadyCheck()・finishRematchReadyCheck()の
// 両方が使う、設定の妥当性チェック（曲プールの絞り込みを含む）を1箇所へ切り出したもの。
// 元々は「もう一度」を押した瞬間に1回だけ行っていたチェックだったが、再戦準備フェーズの
// 新設に伴い、①フェーズに入れるかどうかの入り口チェック、②全員準備OKになった後の
// 開始直前の最終チェック、の2箇所で同じ内容を確認する必要が生まれたため
// （対戦開始前ルール確認画面のbeginMatchConfirmation()→startBattle()と同じ「入り口と
// 開始直前の二重チェック」構造。準備を待っている間に設定・所持データの状況が変わる
// 可能性があるため、開始直前にもう一度確かめる）。
// 【2026-11-XX追加・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
// playersOverrideを渡すと、共通曲の絞り込み判定をroom.players全員ではなくその集合だけで
// 行う。finishRematchReadyCheck()（開始直前の最終チェック）が、rematchParticipantUidsで
// 絞った「この再戦の対象者だけ」を渡すために使う。省略時（beginRematchReadyCheck()の
// 入り口チェック）は、まさに今ルームにいる全員がこれから固定される対象者そのものなので、
// 従来どおりroom.players全員を使う。
async function resolveRematchSettingsValidation({ roomId, room, playersOverride }) {
  const errorMessage = validateRoomSettings(room.gameMode, room.settings);
  if (errorMessage) return { ok: false, reason: "invalid-settings", message: errorMessage };

  const players = playersOverride ?? room.players ?? {};
  let finalSettings = room.settings;
  const resolvedSongPool = resolveSongPoolForSettings(room.gameMode, room.settings);
  if (resolvedSongPool) {
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
      settings: room.settings,
      resolvedSongPool,
      kind: getAvailabilityKind(room.gameMode),
    });
    if (finalSettings !== room.settings) {
      const restrictedSongCount = (finalSettings.questionSource?.songIds ?? []).length;
      const restrictedErrorMessage = validateRoomSettings(room.gameMode, finalSettings);
      if (restrictedErrorMessage) {
        const message =
          restrictedSongCount === 0
            ? "参加者全員が利用できる共通曲がありません。データパックの導入状況をご確認ください。"
            : "参加者全員が利用できる曲が足りないため、対戦を開始できません。出題範囲を見直すか、対戦相手のデータ導入状況をご確認ください。";
        return { ok: false, reason: "insufficient-common-songs", message };
      }
    }
  }
  return { ok: true, finalSettings };
}

// 【再戦準備フェーズ新設・本人指示】結果画面の「もう一度」：ホストが押した瞬間、
// 即座に新しい試合を開始するのではなく、まず「再戦準備フェーズ」に入る。全参加者に今回の
// 対戦設定の簡単な要約を見せ、全員が「準備OK」を押したら3→2→1のカウントダウンを経て
// 実際に試合が始まる（実際の開始処理はfinishRematchReadyCheck()。js/onlineBattleScreen.jsの
// renderRematchReadyScreen()参照）。
//
// 【以前の実装との違い】以前のrematchAndStartNow()は、参加者構成が変わっていなければ
// 確認なしで即座に試合を開始し、変わっている場合だけ対戦開始前ルール確認画面
// （confirmingMatch/ruleConfirmed）を経由していた。今回「全員が準備OKを押してから
// 始めたい」という要望を受け、参加者構成の変化に関わらず必ずこの準備フェーズを
// 経由するよう変更した（本人指示：「もう一度だから」を理由に確認を省略しない）。
//
// 【confirmingMatch/ruleConfirmedを再利用しない理由】対戦開始前ルール確認画面と
// 「見た目も文脈も似ている」ため一見同じフラグを使い回したくなるが、あえて
// room.confirmingRematch（room全体で1つ）・room.players/{uid}/rematchReady（本人ごと）
// という専用のフィールドに分けた。理由は2つ：
//   ①意味の違い：ruleConfirmedは「これから始まる対戦のルールを理解したという確認」、
//     rematchReadyは「直前まで遊んでいた対戦をもう一度始める準備ができたという合図」で、
//     同じ"true"でも意味が異なる。同じフィールドを使い回すと、どちらの文脈の変化かを
//     読み取れなくなる。
//   ②再監査コストの回避：room.statusは意図的にこれまでどおり"waiting"へ戻す
//     （confirmingMatchと同じ設計。room.statusの値を増やすと、参加・キック・観戦者の
//     昇格・ホスト移譲等、既存の"waiting"前提のあらゆる判定を1つずつ洗い直す必要が
//     あり危険なため）。room.status:waitingのままにしておくことで、ホストによる
//     キック・観戦者の昇格はこれまでどおり動作し、退出した参加者はroom.playersから
//     消えるため、computeAllPlayersRematchReady()が自動的に「待たない」対象から除外する
//     （js/onlineBattleMatchConfirmationPayloads.js参照）。途中参加（新規のjoin/観戦者昇格）は
//     2026-11-XX改訂により、rematchParticipantUidsのスナップショットへ含まれないことで
//     自然に今の再戦の対象外になる（resetRematchReadyIfConfirming()は廃止済み）。
export async function beginRematchReadyCheck({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status !== ROOM_STATUS.RESULT) return { ok: false, reason: "not-result" };
  // 【2026-10-01追加・本人指示：結果画面/再戦フロー全面設計12-6章】オンライン対戦の再戦は
  // 最低2人必要。ホストだけになっている場合は、そもそも再戦提案を始めさせない。
  if (Object.keys(room.players || {}).length < 2) {
    return { ok: false, reason: "rematch-needs-two-players" };
  }

  // フェーズに入れないほど設定が壊れている場合は、そもそも準備フェーズへ進ませない
  // （本人の要望どおり、開始できないことが分かっている待機画面を見せない）。
  const validation = await resolveRematchSettingsValidation({ roomId, room });
  if (!validation.ok) return validation;

  const players = room.players || {};
  // 【2026-11-XX追加・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
  // 「今この瞬間ルームにいる参加者」を、この再戦の対象者として固定する。この後
  // ルームへ新しく入ってくる人は、rematchParticipantUidsに含まれないため、
  // computeAllPlayersRematchReady()の判定にも、実際に始まる再戦の参加者にも含まれない
  // （js/onlineBattle.jsのwriteNewMatchStart()参照）。ホスト自身は提案した時点で
  // 既に準備OK扱いにする（本人指示12：「ホストが『もう一度』を押した時点でホスト自身は
  // 準備OK扱い」）。他の参加者はこれまでどおり未準備からスタートする。
  //
  // 【2026-11-XX修正・実機バグ調査：「もう一度」を押しても何も起きないバグの根本原因】
  // 書き込むキーの組み立て自体は、Firebase呼び出しを持たない純粋関数
  // buildRematchProposalUpdates()（js/onlineBattleMatchConfirmationPayloads.js）へ
  // 切り出した。以前はrematchParticipantUidsを{uid: true, ...}という1つのオブジェクトに
  // まとめ、`rooms/{roomId}/rematchParticipantUids`という「親キー」へ丸ごと書き込んで
  // いたが、firebase/database.rules.jsonのrematchParticipantUidsには子キー（$uid）単位の
  // .writeルールしか定義されておらず、親キーそのものへの.writeが無い。Firebase Realtime
  // Databaseのルールは、書き込み先のパスそのもの（またはその祖先）に許可が無い限り、
  // 子孫の.writeルールをさかのぼって適用してはくれないため、親キーへオブジェクトごと
  // 書き込むこの呼び出しは常にpermission_deniedで拒否されていた。update()による複数パスの
  // 書き込みは全パスがまとめて1つのアトミックな操作として扱われるため、この1箇所が
  // 拒否されるとstatus・confirmingRematch・rematchReadyを含む更新全体が丸ごと巻き戻り、
  // 画面上は「ボタンを押しても何も起きない」ように見えていた（実際に本番のFirebaseへ
  // 2クライアントで再現し、コンソールのpermission_deniedとFirebase REST APIでの
  // 直接検証により確定した）。対策として、players/{uid}/rematchReadyと同じく、子キー
  // （uidごと）へ1件ずつ書き込む形に変更した。ルール側の.writeがまさにこの粒度で
  // 許可されているため、これでホストによる書き込みが成立する。
  const updates = buildRematchProposalUpdates({ roomId, players, hostUid: uid });
  try {
    await update(ref(database), updates);
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 自分の「準備OK」状態をトグルする（js/onlineBattle.jsのsetRuleConfirmed()と全く同じ
// 考え方・同じトグル式の操作性）。
export async function setRematchReady({ roomId, confirmed }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  try {
    await update(ref(database), { [`rooms/${roomId}/players/${uid}/rematchReady`]: confirmed });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// 再戦準備フェーズを取りやめて、ルーム設定画面（ロビー）へ戻す。room.statusは
// beginRematchReadyCheck()の時点で既に"waiting"へ戻っているため、ここでは
// confirmingRematchを下ろすだけでロビー表示に切り替わる（cancelMatchConfirmation()と
// 全く同じ考え方）。ルーム自体・対戦設定（settings）は一切変更しないため、設定を
// 変えたいだけのホストがここから再設定できる。
// 【2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計】以前はホスト専用だったが、
// 「再戦提案中に誰か（ホスト・ゲスト問わず）が『ルーム設定に戻る』を選んだ場合、その
// 再戦提案自体をキャンセルする」という仕様に伴い、参加者なら誰でも呼べるよう変更した
// （Firebase Rules側もconfirmingRematchをfalseにする操作だけは誰でも許可するよう
// 合わせて変更済み。trueにする＝新しく提案する操作は引き続きホスト専用のまま）。
export async function cancelRematchReadyCheck({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  try {
    await update(ref(database), { [`rooms/${roomId}/confirmingRematch`]: false });
  } catch (error) {
    return { ok: false, reason: "write-failed" };
  }
  return { ok: true };
}

// ホストの端末だけが呼ぶ：再戦準備フェーズで全員が「準備OK」を押した（＝
// computeAllPlayersRematchReady()がtrueを返した）ときの、実際に新しい試合を書き込む処理
// （js/onlineBattleScreen.jsのrenderRematchReadyScreen()内、対戦開始前ルール確認画面の
// 自動開始と同じ「2秒待ってから最新状態を確かめて呼ぶ」設計から呼ばれる）。
//
// 【あえてstartBattle()を再利用しない理由】startBattle()（実際にはresolveBattleStartValidation()）
// は非ホスト全員のplayer.readyがtrueであることを必須条件にしているが、readyは
// 「ロビーで対戦に参加する意思を示した」という全く別の文脈のフラグであり、再戦準備
// フェーズの合否はrematchReadyだけで判定すべきもの（本人指示と同じ考え方：すぐ前まで
// 一緒に対戦していた相手に、無関係な既存のREADY状態を再度要求しない）。そのため
// resolveBattleStartValidation()は経由せず、実際に試合を書き込むwriteNewMatchStart()だけを
// 直接共有する。
export async function finishRematchReadyCheck({ roomId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };

  // 【2026-11-XX修正・本人指示Q7】読み取り失敗時はnot-foundと同じ扱いにする（安全側）。
  const snapshot = await safeGetSnapshot(`rooms/${roomId}`);
  if (!snapshot?.exists()) return { ok: false, reason: "not-found" };
  const room = snapshot.val();
  if (room.host !== uid) return { ok: false, reason: "not-host" };
  if (room.status !== ROOM_STATUS.WAITING || room.confirmingRematch !== true) {
    return { ok: false, reason: "not-confirming-rematch" };
  }
  const allPlayers = room.players || {};
  // 【2026-11-XX追加・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
  // beginRematchReadyCheck()が再戦提案の瞬間に固定したrematchParticipantUidsだけを
  // この再戦の対象にする。この後に入室した参加者はここに含まれないため、判定にも
  // 新しく始まる試合の参加者にも入らない（ロビーで待機し、次の再戦から参加できる）。
  // rematchParticipantUidsがまだ無い（古いデータ・想定外の状態）場合は、安全側の
  // フォールバックとして従来どおり全員を対象にする。
  const rematchParticipantUids = room.rematchParticipantUids;
  const players =
    rematchParticipantUids && Object.keys(rematchParticipantUids).length > 0
      ? Object.fromEntries(Object.entries(allPlayers).filter(([playerUid]) => rematchParticipantUids[playerUid] === true))
      : allPlayers;
  // 【2026-10-01追加・本人指示：結果画面/再戦フロー全面設計12-6章】オンライン対戦の再戦は
  // 最低2人必要（通常の対戦開始とは異なり、1人だけの再戦は成立させない）。他の書き込み
  // 経路（leaveRoom・kickPlayer等）で既に確認済みの人数チェックの、最後の砦としての防御。
  if (Object.keys(players).length < 2) {
    return { ok: false, reason: "rematch-needs-two-players" };
  }
  if (!computeAllPlayersRematchReady(players, rematchParticipantUids)) {
    return { ok: false, reason: "not-all-ready" };
  }

  const validation = await resolveRematchSettingsValidation({ roomId, room, playersOverride: players });
  if (!validation.ok) return validation;

  return writeNewMatchStart({ roomId, room, uid, players, finalSettings: validation.finalSettings });
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
