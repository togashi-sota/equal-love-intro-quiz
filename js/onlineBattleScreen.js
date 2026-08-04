// オンライン対戦（Firebase）の画面群を担当するファイル。Step1の範囲：
// 「入口（作る/参加する）→ルーム作成 or 参加→ロビー（参加者一覧）」という一連の流れ。
// Realtime Databaseとの実際の読み書きはjs/onlineBattle.js（データ層）が担当し、
// このファイルは画面の組み立て・ボタンのイベント登録に専念する。
//
// 【設計メモ：navigateToについて】js/localBattleScreen.jsと同じ理由・同じパターンで、
// 画面遷移（showScreen）・効果音（playClickSound）はmain.js側にまとめてもらい、
// このファイルは"navigateTo(screenName)"という1つの汎用コールバックだけを使う。

import { getActivePlayer } from "./playerProfile.js";
import { createRoom, joinRoom, leaveRoom, listenToRoom, getLastRoom } from "./onlineBattle.js";
import { getCurrentUid } from "./firebaseClient.js";

let elements = null;
let currentRoomId = null;
let unsubscribeRoom = null;

// 今どのルームにいるか（結果画面等、将来のStep2以降から読み取れるようにする窓口）。
export function getCurrentOnlineRoomId() {
  return currentRoomId;
}

function stopListeningToRoom() {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
}

function renderLastRoomBanner() {
  const lastRoom = getLastRoom();
  if (lastRoom) {
    elements.entryLastRoomBanner.hidden = false;
    elements.entryLastRoomText.textContent = `前回参加していたルーム「${lastRoom.roomId}」に戻りますか？`;
    elements.entryLastRoomError.hidden = true;
  } else {
    elements.entryLastRoomBanner.hidden = true;
  }
}

// 「前回のルームに戻る」失敗時のメッセージ。joinRoomの戻り値reasonごとに文言を分ける
// （js/onlineBattleScreen.jsの参加画面と同じ考え方）。
const REJOIN_ERROR_MESSAGES = {
  "not-found": "ルームが見つかりませんでした。通信環境をご確認のうえ、もう一度お試しください。",
  full: "このルームはすでに満員です。",
  "not-waiting": "この対戦はすでに開始されているため、参加できません。",
  "not-signed-in": "通信環境をご確認のうえ、もう一度お試しください。",
};

// ロビー画面の参加者一覧を再描画する。ホスト・接続状態が変わるたびに呼ばれる。
function renderLobby(room) {
  if (!room) {
    // ルームが無くなった＝ホストが退出して解散した、または何らかの理由で消えた。
    elements.lobbyGoneNotice.hidden = false;
    elements.lobbyContent.hidden = true;
    return;
  }
  elements.lobbyGoneNotice.hidden = true;
  elements.lobbyContent.hidden = false;

  elements.lobbyRoomCode.textContent = room.roomId;
  elements.lobbyMaxPlayersText.textContent = `最大${room.maxPlayers}人`;

  const myUid = getCurrentUid();
  const players = room.players || {};
  const playerList = Object.entries(players)
    .map(([uid, player]) => ({ uid, ...player }))
    .sort((a, b) => a.joinedAt - b.joinedAt);

  elements.lobbyPlayerList.innerHTML = "";
  playerList.forEach((player) => {
    const row = document.createElement("li");
    row.className = "online-lobby-player-row";
    if (player.uid === myUid) row.classList.add("is-me");

    const name = document.createElement("span");
    name.className = "online-lobby-player-name";
    name.textContent = player.name + (player.uid === myUid ? "（あなた）" : "");
    row.appendChild(name);

    const badges = document.createElement("span");
    badges.className = "online-lobby-player-badges";
    if (player.isHost) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "online-lobby-badge online-lobby-badge-host";
      hostBadge.textContent = "ホスト";
      badges.appendChild(hostBadge);
    }
    const connectionBadge = document.createElement("span");
    connectionBadge.className = `online-lobby-badge ${player.connected ? "online-lobby-badge-connected" : "online-lobby-badge-disconnected"}`;
    connectionBadge.textContent = player.connected ? "接続中" : "切断中";
    badges.appendChild(connectionBadge);
    row.appendChild(badges);

    elements.lobbyPlayerList.appendChild(row);
  });

  elements.lobbyPlayerCount.textContent = `${playerList.length}人 / 最大${room.maxPlayers}人`;
}

function goToLobby(roomId) {
  currentRoomId = roomId;
  stopListeningToRoom();
  unsubscribeRoom = listenToRoom(roomId, renderLobby);
  elements.navigateTo("onlineBattleLobby");
}

// 対戦モード画面群を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
export function initOnlineBattleScreens(newElements) {
  elements = newElements;

  elements.entryBackButton.addEventListener("click", () => elements.navigateTo("specialModes"));
  elements.entryCreateButton.addEventListener("click", () => {
    elements.createNameInput.value = getActivePlayer().playerName || "";
    elements.createError.hidden = true;
    elements.navigateTo("onlineBattleCreate");
  });
  elements.entryJoinButton.addEventListener("click", () => {
    elements.joinNameInput.value = getActivePlayer().playerName || "";
    elements.joinRoomCodeInput.value = "";
    elements.joinError.hidden = true;
    elements.navigateTo("onlineBattleJoin");
  });
  elements.entryLastRoomRejoinButton.addEventListener("click", async () => {
    const lastRoom = getLastRoom();
    if (!lastRoom) return;
    elements.entryLastRoomButtonLabel.textContent = "再接続中…";
    elements.entryLastRoomError.hidden = true;
    const result = await joinRoom({ roomId: lastRoom.roomId, playerName: lastRoom.playerName });
    elements.entryLastRoomButtonLabel.textContent = "前回のルームに戻る";
    if (result.ok) {
      goToLobby(result.roomId);
      return;
    }
    // 失敗してもここでlastRoomは消さない。ごく稀にFirebase側の一時的な通信の癖で
    // 実際には存在するルームへの再接続が失敗することがあるため、ボタンを残して
    // もう一度押せば再試行できるようにしておく（本当に存在しない場合は、そのまま
    // 「ルームを作る」「ルームに参加する」を選べばよい）。
    elements.entryLastRoomError.textContent = REJOIN_ERROR_MESSAGES[result.reason] ?? "再接続に失敗しました。もう一度お試しください。";
    elements.entryLastRoomError.hidden = false;
  });

  elements.createBackButton.addEventListener("click", () => elements.navigateTo("onlineBattleEntry"));
  elements.createSubmitButton.addEventListener("click", async () => {
    const playerName = elements.createNameInput.value.trim();
    if (!playerName) {
      elements.createError.textContent = "表示名を入力してください。";
      elements.createError.hidden = false;
      return;
    }
    const maxPlayers = Number(document.querySelector('input[name="online-battle-max-players"]:checked').value);

    elements.createSubmitButton.disabled = true;
    const result = await createRoom({ playerName, maxPlayers });
    elements.createSubmitButton.disabled = false;

    if (!result.ok) {
      elements.createError.textContent = "ルームの作成に失敗しました。通信環境をご確認のうえ、もう一度お試しください。";
      elements.createError.hidden = false;
      return;
    }
    elements.createError.hidden = true;
    goToLobby(result.roomId);
  });

  elements.joinBackButton.addEventListener("click", () => elements.navigateTo("onlineBattleEntry"));
  elements.joinSubmitButton.addEventListener("click", async () => {
    const roomId = elements.joinRoomCodeInput.value.trim().toUpperCase();
    const playerName = elements.joinNameInput.value.trim();

    if (!roomId) {
      elements.joinError.textContent = "ルームコードを入力してください。";
      elements.joinError.hidden = false;
      return;
    }
    if (!playerName) {
      elements.joinError.textContent = "表示名を入力してください。";
      elements.joinError.hidden = false;
      return;
    }

    elements.joinSubmitButton.disabled = true;
    const result = await joinRoom({ roomId, playerName });
    elements.joinSubmitButton.disabled = false;

    if (!result.ok) {
      const messages = {
        "not-found": "そのルームコードは見つかりませんでした。入力内容をご確認ください。",
        full: "このルームはすでに満員です。",
        "not-waiting": "この対戦はすでに開始されているため、参加できません。",
        "not-signed-in": "通信環境をご確認のうえ、もう一度お試しください。",
      };
      elements.joinError.textContent = messages[result.reason] ?? "参加に失敗しました。もう一度お試しください。";
      elements.joinError.hidden = false;
      return;
    }
    elements.joinError.hidden = true;
    goToLobby(result.roomId);
  });

  elements.lobbyLeaveButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    elements.lobbyLeaveButton.disabled = true;
    await leaveRoom({ roomId: currentRoomId });
    elements.lobbyLeaveButton.disabled = false;
    stopListeningToRoom();
    currentRoomId = null;
    renderLastRoomBanner();
    elements.navigateTo("onlineBattleEntry");
  });

  // ロビー画面から「入口」以外の画面へ離脱するケース（今はまだ無いが、Step2で
  // 対戦開始ボタン等が増える想定のため、離脱時に必ず監視を止める共通処理をここに置く）は、
  // Step2実装時にnavigateTo呼び出し側で個別にstopListeningToRoom()を呼ぶ形にする。

  renderLastRoomBanner();
}
