// オンライン対戦（Firebase）の画面群を担当するファイル。
// Step1：「入口（作る/参加する）→ルーム作成 or 参加→ロビー（参加者一覧）」という一連の流れ。
// Step2：対戦設定の同期・準備完了・サーバー時刻を使ったカウントダウン→開始確認。
// Realtime Databaseとの実際の読み書きはjs/onlineBattle.js（データ層）が担当し、
// このファイルは画面の組み立て・ボタンのイベント登録に専念する。
//
// 【設計メモ：navigateToについて】js/localBattleScreen.jsと同じ理由・同じパターンで、
// 画面遷移（showScreen）・効果音（playClickSound）はmain.js側にまとめてもらい、
// このファイルは"navigateTo(screenName)"という1つの汎用コールバックだけを使う。
//
// 【設計メモ：対戦モードの中身を知らない】出題ロジック・ルールの判定文言などは、
// このファイルから一切直接扱わず、必ずjs/battleModes/index.js経由で呼ぶ
// （gameModeの条件分岐をこのファイルに増やさない、という本人の方針）。
// タイムアタック専用の設定フォーム（ラジオボタン群）自体はStep2時点で唯一のモードのため
// このファイルに残しているが、将来モードが増えたときは、フォームの出し分けもここで行う想定。

import { getActivePlayer } from "./playerProfile.js";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  listenToRoom,
  getLastRoom,
  updateRoomSettings,
  setReady,
  startBattle,
  finishCountdown,
  subscribeServerTimeOffset,
  COUNTDOWN_DURATION_MS,
  ROOM_STATUS,
} from "./onlineBattle.js";
import { getCurrentUid } from "./firebaseClient.js";
import { validateRoomSettings, buildQuestionsForMode } from "./battleModes/index.js";
import { QUESTION_COUNT_LABELS, CATEGORY_LABELS, RULE_LABELS } from "./localBattleScreen.js";

let elements = null;
let currentRoomId = null;
let unsubscribeRoom = null;

// Step2：対戦設定・準備完了・カウントダウンまわりの状態。
let lastHandledRoomStatus = null; // status変化での自動遷移を、状態が変わった瞬間だけに絞る
let suppressNextReadyChangeNotice = false; // 自分でREADYボタンを押した直後だけ、変更通知を出さない
let lastKnownMyReady = null;
let countdownTimerId = null; // カウントダウン表示の更新タイマー（setInterval）
let countdownOffsetUnsubscribe = null; // .info/serverTimeOffsetの購読解除
let hasFinishedCountdownLocally = false; // 自分の端末のカウントダウンが0になったことを表す
let currentGameMode = null; // 今のルームのgameMode（設定変更ハンドラ等、room引数を持たない箇所から参照する）

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

function stopCountdownWatching() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  if (countdownOffsetUnsubscribe) {
    countdownOffsetUnsubscribe();
    countdownOffsetUnsubscribe = null;
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

// joinRoom()・「前回のルームに戻る」共通のエラー文言。reasonごとに分ける。
const JOIN_ERROR_MESSAGES = {
  "not-found": "ルームが見つかりませんでした。通信環境をご確認のうえ、もう一度お試しください。",
  full: "このルームはすでに満員です。",
  "not-waiting": "この対戦はすでに開始されているため、参加できません。",
  "not-signed-in": "通信環境をご確認のうえ、もう一度お試しください。",
  "version-mismatch": "アプリのバージョンがルームの作成者と異なります。アプリを更新してください。",
  "unsupported-mode": "このルームの対戦モードには対応していません。アプリを更新してください。",
};

// 対戦設定を、既存のオフライン対戦と同じチップ（出題数・カテゴリ・ルール・ペナルティ）で
// コンテナに並べる。js/localBattleScreen.jsのbuildConfigSummaryChips()と考え方は同じだが、
// あちらは同ファイル内に閉じた非公開関数のため、ここでは同じロジックを短く再実装している。
// 【Step2時点ではtimeAttackモードしか無いため、ラベル解決も同モード専用のものを使う】
function renderSettingsChips(container, settings) {
  container.innerHTML = "";
  const chips = [
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? settings.questionCountValue,
    CATEGORY_LABELS[settings.categoryFilterValue] ?? settings.categoryFilterValue,
    RULE_LABELS[settings.rule] ?? settings.rule,
  ];
  if (settings.rule === "normal") {
    chips.push(`ペナルティ+${settings.penaltySeconds}秒`);
  }
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    container.appendChild(chip);
  });
}

// ホスト用の設定フォーム（ラジオボタン群）に、現在ルームに保存されている設定値を反映する。
function applySettingsToHostForm(settings) {
  const setChecked = (name, value) => {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  setChecked("online-battle-settings-question-count", settings.questionCountValue);
  setChecked("online-battle-settings-category", settings.categoryFilterValue);
  setChecked("online-battle-settings-rule", settings.rule);
  setChecked("online-battle-settings-penalty", String(settings.penaltySeconds));
  elements.lobbySettingsPenaltyFieldset.hidden = settings.rule !== "normal";
}

function readSettingsFromHostForm() {
  return {
    questionCountValue: document.querySelector('input[name="online-battle-settings-question-count"]:checked').value,
    categoryFilterValue: document.querySelector('input[name="online-battle-settings-category"]:checked').value,
    rule: document.querySelector('input[name="online-battle-settings-rule"]:checked').value,
    penaltySeconds: Number(document.querySelector('input[name="online-battle-settings-penalty"]:checked').value),
  };
}

// 参加者用のREADYボタンの見た目を、今のREADY状態に合わせて更新する。
function updateReadyButton(ready) {
  elements.lobbyReadyButton.textContent = ready ? "✓ 準備完了しました（解除する）" : "準備完了にする";
  elements.lobbyReadyButton.classList.toggle("is-ready", ready);
}

// ホスト用の開始ボタンを、参加者（ホスト以外）が1人以上いて、かつ全員が「今の設定に対して」
// READYのときだけ押せるようにする。readyForRevisionがsettingsRevisionと一致しない場合は
// 「古い設定に対するREADY」とみなし、未準備扱いにする（js/onlineBattle.jsのコメント参照）。
function updateStartButton(room) {
  const players = room.players || {};
  const currentRevision = room.settingsRevision ?? 0;
  const nonHostPlayers = Object.entries(players).filter(([uid]) => uid !== room.host);
  const isPlayerReady = (player) => player.ready && player.readyForRevision === currentRevision;
  const allReady = nonHostPlayers.length > 0 && nonHostPlayers.every(([, player]) => isPlayerReady(player));

  elements.lobbyStartButton.disabled = !allReady;
  if (nonHostPlayers.length === 0) {
    elements.lobbyStartHint.textContent = "参加者が来るのを待っています。";
  } else if (!allReady) {
    const readyCount = nonHostPlayers.filter(([, player]) => isPlayerReady(player)).length;
    elements.lobbyStartHint.textContent = `参加者の準備完了を待っています（${readyCount}/${nonHostPlayers.length}人）。`;
  } else {
    elements.lobbyStartHint.textContent = "全員の準備が完了しました。開始できます。";
  }
}

// 対戦開始（status: playing）を検知したときの画面。同じseed・settingsから
// js/battleModes/index.js経由で問題順を再現し、全端末で本当に一致するかを
// 目視確認できるようにする（Step2の到達点。実際の出題画面はStep3で実装する）。
function goToStartedScreen(room) {
  renderSettingsChips(elements.startedConfigSummary, room.settings);
  elements.startedSeed.textContent = String(room.seed);

  const questions = buildQuestionsForMode(room.gameMode, room.settings, room.seed);
  elements.startedQuestionList.innerHTML = "";
  questions.forEach((question) => {
    const item = document.createElement("li");
    item.textContent = question.song.title;
    elements.startedQuestionList.appendChild(item);
  });

  elements.navigateTo("onlineBattleStarted");
}

// カウントダウン画面へ遷移し、Firebaseサーバーの時刻を基準にした表示更新を開始する。
//
// 【なぜ自分の時計をそのまま使わないか】スマホ・PCの時計は、数秒程度ズレていることがある。
// ホストが記録したcountdownStartedAtは「Firebaseサーバーが確定させた瞬間」なので、
// 全端末で共通の基準になる。ただし各端末の Date.now() は、そのサーバー時刻とズレている
// 可能性があるため、.info/serverTimeOffset（自分の時計とサーバー時計の差、ミリ秒）を
// 使って補正してから、残り時間を計算する。
//
// 【自分のローカルタイマーだけで開始判定する理由】status:"playing"へのFirebase上の変化を
// 待って画面遷移すると、その変化が届くタイミングにも通信環境による差が出てしまい、
// カウントダウンを揃えた意味が薄れる。そのため、カウントダウン中はstatusの変化を無視し、
// 自分の端末で計算した残り時間が0になった瞬間に、自発的に開始確認画面へ進む
// （ホストの端末だけが、0になったタイミングでfinishCountdown()を呼び、Firebase側の
// statusも追って更新する。これは主に、後から参加/再接続した人のための後片付け）。
function goToCountdownScreen(room) {
  hasFinishedCountdownLocally = false;
  stopCountdownWatching();
  elements.navigateTo("onlineBattleCountdown");

  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const targetServerTime = room.countdownStartedAt + COUNTDOWN_DURATION_MS;

  let serverTimeOffset = 0;
  countdownOffsetUnsubscribe = subscribeServerTimeOffset((offset) => {
    serverTimeOffset = offset;
  });

  const tick = () => {
    const nowServerTime = Date.now() + serverTimeOffset;
    const msRemaining = targetServerTime - nowServerTime;

    if (msRemaining <= 0) {
      elements.countdownNumber.textContent = "START!";
      if (!hasFinishedCountdownLocally) {
        hasFinishedCountdownLocally = true;
        stopCountdownWatching();
        if (isHost) {
          finishCountdown({ roomId: room.roomId });
        }
        // 「START!」の表示を一瞬でも目に見えるようにしてから次の画面へ進む
        // （即座に画面遷移すると、ブラウザが再描画する前に切り替わってしまい、
        // 「START!」の文字がほぼ見えないまま終わってしまうため）。
        setTimeout(() => goToStartedScreen(room), 500);
      }
      return;
    }
    elements.countdownNumber.textContent = String(Math.ceil(msRemaining / 1000));
  };

  tick();
  countdownTimerId = setInterval(tick, 100);
}

// ロビー画面の参加者一覧・対戦設定・準備完了/開始ボタンを再描画する。
// 参加者一覧・接続状態・対戦設定・READY状態・進行状態のいずれかが変わるたびに呼ばれる。
function renderLobby(room) {
  if (!room) {
    // ルームが無くなった＝ホストが退出して解散した、または何らかの理由で消えた。
    // カウントダウン中・開始確認画面を見ている最中にホストが退出した場合も、
    // ここでロビー画面へ強制的に戻し、「終了しました」の案内を必ず見せる
    // （本人からのテスト項目：カウントダウン中にホストが退出しても安全に終了すること）。
    stopCountdownWatching();
    lastHandledRoomStatus = null;
    elements.lobbyGoneNotice.hidden = false;
    elements.lobbyContent.hidden = true;
    elements.navigateTo("onlineBattleLobby");
    return;
  }
  elements.lobbyGoneNotice.hidden = true;
  elements.lobbyContent.hidden = false;

  elements.lobbyRoomCode.textContent = room.roomId;
  elements.lobbyMaxPlayersText.textContent = `最大${room.maxPlayers}人`;
  currentGameMode = room.gameMode;

  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const settings = room.settings;
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
    if (!player.isHost) {
      const isReadyForCurrentSettings = player.ready && player.readyForRevision === (room.settingsRevision ?? 0);
      const readyBadge = document.createElement("span");
      readyBadge.className = `online-lobby-badge ${isReadyForCurrentSettings ? "online-lobby-badge-connected" : "online-lobby-badge-disconnected"}`;
      readyBadge.textContent = isReadyForCurrentSettings ? "準備完了" : "未準備";
      badges.appendChild(readyBadge);
    }
    const connectionBadge = document.createElement("span");
    connectionBadge.className = `online-lobby-badge ${player.connected ? "online-lobby-badge-connected" : "online-lobby-badge-disconnected"}`;
    connectionBadge.textContent = player.connected ? "接続中" : "切断中";
    badges.appendChild(connectionBadge);
    row.appendChild(badges);

    elements.lobbyPlayerList.appendChild(row);
  });

  elements.lobbyPlayerCount.textContent = `${playerList.length}人 / 最大${room.maxPlayers}人`;

  // ===== Step2：対戦設定・準備完了・開始 =====
  elements.lobbySettingsHost.hidden = !isHost;
  elements.lobbySettingsParticipant.hidden = isHost;
  elements.lobbyReadyButton.hidden = isHost;
  elements.lobbyStartButton.hidden = !isHost;
  elements.lobbyStartHint.hidden = !isHost;

  if (isHost) {
    applySettingsToHostForm(settings);
    updateStartButton(room);
  } else {
    renderSettingsChips(elements.lobbySettingsSummary, settings);

    const myPlayer = players[myUid];
    const myReady = Boolean(myPlayer?.ready && myPlayer?.readyForRevision === (room.settingsRevision ?? 0));
    updateReadyButton(myReady);

    // READYがtrue→falseに変わった瞬間（＝ホストが設定を変更してリセットされた瞬間）だけ、
    // 「設定が変更されました」通知を出す。自分でREADYボタンを押して解除した直後は出さない。
    if (lastKnownMyReady === true && myReady === false && !suppressNextReadyChangeNotice) {
      elements.lobbySettingsChangedNotice.hidden = false;
    }
    suppressNextReadyChangeNotice = false;
    lastKnownMyReady = myReady;
  }

  // ホストが開始すると、まずcountdown・その後playingへ進む。状態が変わった瞬間だけ
  // 画面遷移を行い（同じ状態のまま何度renderLobbyが呼ばれても遷移し直さない）、
  // カウントダウンを自分の端末で見ている最中は、statusのplayingへの変化を無視する
  // （goToCountdownScreen()側のローカルタイマーが、開始確認画面への遷移を担当するため。
  // 上のコメント参照：通信環境の差でタイミングがずれるのを防ぐ設計）。
  if (room.status !== lastHandledRoomStatus) {
    const previousStatus = lastHandledRoomStatus;
    lastHandledRoomStatus = room.status;
    if (room.status === ROOM_STATUS.COUNTDOWN) {
      goToCountdownScreen(room);
    } else if (room.status === ROOM_STATUS.PLAYING && previousStatus !== ROOM_STATUS.COUNTDOWN) {
      // カウントダウンを経由せずplayingを検知した＝出遅れて参加/再接続した端末。
      // 自分のローカルカウントダウンは持っていないので、直接開始確認画面へ進む。
      goToStartedScreen(room);
    }
  }
}

function goToLobby(roomId) {
  currentRoomId = roomId;
  currentGameMode = null;
  lastHandledRoomStatus = null;
  suppressNextReadyChangeNotice = false;
  lastKnownMyReady = null;
  stopCountdownWatching();
  elements.lobbySettingsChangedNotice.hidden = true;
  elements.lobbyStartError.hidden = true;
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
    elements.entryLastRoomError.textContent = JOIN_ERROR_MESSAGES[result.reason] ?? "再接続に失敗しました。もう一度お試しください。";
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
      elements.joinError.textContent =
        JOIN_ERROR_MESSAGES[result.reason] ?? "参加に失敗しました。もう一度お試しください。";
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
    stopCountdownWatching();
    currentRoomId = null;
    renderLastRoomBanner();
    elements.navigateTo("onlineBattleEntry");
  });

  // ===== Step2：対戦設定・準備完了・開始 =====

  // ホストが設定ラジオボタンを変更するたびに、Firebaseへ書き込んで全員へ同期する
  // （js/localBattleScreen.jsのupdateSetupRuleHint()と同じ「変更のたびに反映」という考え方）。
  document
    .querySelectorAll(
      'input[name="online-battle-settings-question-count"], input[name="online-battle-settings-category"], input[name="online-battle-settings-rule"], input[name="online-battle-settings-penalty"]'
    )
    .forEach((radio) => {
      radio.addEventListener("change", async () => {
        if (!currentRoomId) return;
        const settings = readSettingsFromHostForm();
        elements.lobbySettingsPenaltyFieldset.hidden = settings.rule !== "normal";

        const errorMessage = validateRoomSettings(currentGameMode, settings);
        if (errorMessage) {
          elements.lobbyStartError.textContent = errorMessage;
          elements.lobbyStartError.hidden = false;
          return;
        }
        elements.lobbyStartError.hidden = true;
        await updateRoomSettings({ roomId: currentRoomId, settings });
      });
    });

  elements.lobbyReadyButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    const nowReady = elements.lobbyReadyButton.classList.contains("is-ready");
    suppressNextReadyChangeNotice = true;
    elements.lobbySettingsChangedNotice.hidden = true;
    await setReady({ roomId: currentRoomId, ready: !nowReady });
  });

  elements.lobbyStartButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    const settings = readSettingsFromHostForm();

    elements.lobbyStartButton.disabled = true;
    const result = await startBattle({ roomId: currentRoomId, settings });
    elements.lobbyStartButton.disabled = false;

    if (!result.ok) {
      const messages = {
        "not-all-ready": "まだ準備が完了していない参加者がいます。",
        "invalid-settings": result.message ?? "対戦設定を確認してください。",
        "not-host": "ホストのみ開始できます。",
        "not-found": "ルームが見つかりませんでした。",
      };
      elements.lobbyStartError.textContent = messages[result.reason] ?? "対戦の開始に失敗しました。通信環境をご確認のうえ、もう一度お試しください。";
      elements.lobbyStartError.hidden = false;
    } else {
      elements.lobbyStartError.hidden = true;
    }
  });

  elements.startedBackButton.addEventListener("click", () => elements.navigateTo("onlineBattleLobby"));

  renderLastRoomBanner();
}
