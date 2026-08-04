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
  initializeMyMatchProgress,
  submitAnswerProgress,
  finishMyMatch,
  finalizeMatchIfReady,
  COUNTDOWN_DURATION_MS,
  ROOM_STATUS,
} from "./onlineBattle.js";
import { getCurrentUid } from "./firebaseClient.js";
import { validateRoomSettings, buildQuestionsForMode, compareBattleResults, getRuleDescription } from "./battleModes/index.js";
import { QUESTION_COUNT_LABELS, CATEGORY_LABELS, RULE_LABELS } from "./localBattleScreen.js";
import { computeNormalFinalRecordMs } from "./localBattleResult.js";
import { MEMBERS } from "./data/members.js";
import { getMemberById } from "./memberUtils.js";

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

// Step3：試合の進行・進捗表示・結果まわりの状態。
let currentMatchId = null; // 今参加している試合のID（開始〜結果画面まで保持）
let currentMatchTotalQuestions = 0; // 今の試合の全問題数（進捗表示の分母、buildQuestionsForModeの結果の長さ）

// 推し（最推し）が設定されていれば、色ドットの要素を1つ作って返す。未設定・不正な値
// （既存のメンバーデータに一致しない等）の場合はnullを返す（エラーにせず何も表示しない）。
// ロビー・待機画面・結果画面のいずれも同じ見た目のドットを使うため、共通化している。
function createOshiDotElement(oshiMemberId) {
  const oshiMember = oshiMemberId ? getMemberById(MEMBERS, oshiMemberId) : null;
  if (!oshiMember?.memberColor?.hex) return null;

  const dot = document.createElement("span");
  dot.className = "online-lobby-player-oshi-dot";
  dot.style.backgroundColor = oshiMember.memberColor.hex;
  dot.title = `推し：${oshiMember.name}`;
  dot.setAttribute("aria-label", `推し：${oshiMember.name}`);
  return dot;
}

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

// 対戦開始（status: playing）を検知したときに呼ぶ（Step3）。同じseed・settingsから
// js/battleModes/index.js経由で問題順を組み立て、実際にクイズを始める。
// 出題・回答そのものはjs/main.js（既存のクイズエンジン）が担当するため、ここでは
// 「今の試合の情報を覚えておく」「自分の進捗を初期化する」「main.js側に開始を依頼する」
// ところまでを行う。
function enterOnlineBattlePlay(room) {
  currentMatchId = room.activeMatchId;
  const questions = buildQuestionsForMode(room.gameMode, room.settings, room.seed);
  currentMatchTotalQuestions = questions.length;

  // 自分の進捗（progress）がまだ無ければ作る。再接続時は既存の値を保つため、
  // 既にあれば何もしない（js/onlineBattle.jsのinitializeMyMatchProgress参照）。
  // 待ってから開始する必要は無い（Firebase側への書き込みが後追いで完了しても実害が無いため）。
  initializeMyMatchProgress({ roomId: room.roomId, matchId: currentMatchId });

  if (elements.quizProgressStrip) {
    elements.quizProgressStrip.hidden = false;
    elements.quizProgressStrip.textContent = "";
  }

  elements.onStartOnlineBattleQuiz(questions, room);
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
        setTimeout(() => enterOnlineBattlePlay(room), 500);
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
    currentMatchId = null;
    currentMatchTotalQuestions = 0;
    if (elements.quizProgressStrip) elements.quizProgressStrip.hidden = true;
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

    // 推し（最推し）が設定されていれば、名前の左に色ドットを添える。
    // oshiMemberIdが無い、または既存のメンバーデータに一致しない場合（データの不整合・
    // 将来メンバーが削除された場合等）は、エラーにせず何も表示しないだけにする
    // （本人の要望：未設定時は今まで通り何も表示しない、不正な値でも安全に無視する）。
    const oshiDot = createOshiDotElement(player.oshiMemberId);
    if (oshiDot) row.appendChild(oshiDot);

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
      // 自分のローカルカウントダウンは持っていないので、直接出題を開始する。
      enterOnlineBattlePlay(room);
    } else if (room.status === ROOM_STATUS.RESULT && document.body.dataset.screen !== "quiz") {
      // 結果確定を検知したら結果画面へ進む。ただし、自分がまだクイズ回答中（quiz画面）の
      // ときは絶対に割り込まない（本人の要望：各自が自分のペースで最後まで進められること。
      // 自分が終わった後は待機画面のupdateOnlineBattlePlayUi()側でも同じ検知を行っており、
      // ここは主に「結果確定後に新しく再接続した」場合の受け皿になる）。
      goToResultScreen(room);
    }
  }

  updateOnlineBattlePlayUi(room);
}

function goToLobby(roomId) {
  currentRoomId = roomId;
  currentGameMode = null;
  currentMatchId = null;
  currentMatchTotalQuestions = 0;
  lastHandledRoomStatus = null;
  suppressNextReadyChangeNotice = false;
  lastKnownMyReady = null;
  stopCountdownWatching();
  elements.lobbySettingsChangedNotice.hidden = true;
  elements.lobbyStartError.hidden = true;
  if (elements.quizProgressStrip) elements.quizProgressStrip.hidden = true;
  stopListeningToRoom();
  unsubscribeRoom = listenToRoom(roomId, renderLobby);
  elements.navigateTo("onlineBattleLobby");
}

// ===== Step3：試合中の進捗表示・待機画面・結果画面 =====

// 今の試合の固定参加者（participants）を軸に、進捗（progress）・接続状態（players）を
// 1人ずつまとめた配列を作る。参加者が対戦中に退出・切断しても、参加者一覧の元になる
// participantsは対戦開始時点のスナップショットのまま残るため、表示が消えることはない。
function getOnlineBattleMatchRows(room) {
  const match = (room.matches || {})[currentMatchId] || {};
  const participants = match.participants || {};
  const progress = match.progress || {};
  const players = room.players || {};

  return Object.entries(participants).map(([uid, participant]) => {
    const playerProgress = progress[uid] || {};
    const livePlayer = players[uid]; // 退出済みならundefined
    return {
      uid,
      displayName: participant.displayName,
      oshiMemberId: participant.oshiMemberId,
      isHost: participant.isHost === true,
      answeredCount: playerProgress.answeredCount ?? 0,
      finished: playerProgress.finished === true,
      hasLeft: !livePlayer,
      connected: Boolean(livePlayer?.connected),
    };
  });
}

// クイズ画面の隅に出す、他プレイヤーの簡易進捗（自分は含めない）。
// 正解数・ミス数・経過時間・暫定順位は一切出さず、「回答数／全問」と完了・切断・退出状態だけ。
function renderOnlineBattleQuizStrip(rows, myUid) {
  if (!elements.quizProgressStrip) return;
  const text = rows
    .filter((row) => row.uid !== myUid)
    .map((row) => {
      if (row.hasLeft) return `${row.displayName} 退出済み`;
      if (row.finished) return `${row.displayName} 完了`;
      const base = `${row.displayName} ${row.answeredCount}/${currentMatchTotalQuestions}`;
      return row.connected ? base : `${base}（切断中）`;
    })
    .join("　");
  elements.quizProgressStrip.textContent = text;
}

// 待機画面の参加者一覧・ホスト切断通知・DNF確定ボタンを描画する。
// ホストの場合、statusがまだplayingであれば、ここで毎回finalizeMatchIfReady()を試みる
// （全員分のprogress.finishedがそろっていれば自動的にstatus:resultへ進む。冪等なので
// 何度呼んでも安全。これにより、ホストが待機画面を開くたび＝初回表示・再接続どちらでも、
// 自動的に再判定される）。
function renderOnlineBattleWaitingList(room, rows, myUid) {
  elements.waitingPlayerList.innerHTML = "";
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "online-lobby-player-row";
    if (row.uid === myUid) li.classList.add("is-me");

    const oshiDot = createOshiDotElement(row.oshiMemberId);
    if (oshiDot) li.appendChild(oshiDot);

    const name = document.createElement("span");
    name.className = "online-lobby-player-name";
    name.textContent = row.displayName + (row.uid === myUid ? "（あなた）" : "");
    li.appendChild(name);

    const badges = document.createElement("span");
    badges.className = "online-lobby-player-badges";

    if (row.isHost) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "online-lobby-badge online-lobby-badge-host";
      hostBadge.textContent = "ホスト";
      badges.appendChild(hostBadge);
    }

    const statusBadge = document.createElement("span");
    if (row.hasLeft) {
      statusBadge.className = "online-lobby-badge online-lobby-badge-disconnected";
      statusBadge.textContent = "退出済み";
    } else if (row.finished) {
      statusBadge.className = "online-lobby-badge online-lobby-badge-connected";
      statusBadge.textContent = "完了";
    } else {
      statusBadge.className = "online-lobby-badge online-lobby-badge-progress";
      statusBadge.textContent = `${row.answeredCount}/${currentMatchTotalQuestions}`;
    }
    badges.appendChild(statusBadge);

    if (!row.hasLeft && !row.finished && !row.connected) {
      const disconnectedBadge = document.createElement("span");
      disconnectedBadge.className = "online-lobby-badge online-lobby-badge-disconnected";
      disconnectedBadge.textContent = "切断中";
      badges.appendChild(disconnectedBadge);
    }

    li.appendChild(badges);
    elements.waitingPlayerList.appendChild(li);
  });

  const isHost = room.host === myUid;
  const myRow = rows.find((row) => row.uid === myUid);
  const myFinished = Boolean(myRow?.finished);
  const allFinished = rows.length > 0 && rows.every((row) => row.finished);

  const hostRow = rows.find((row) => row.isHost);
  elements.waitingHostDisconnectNotice.hidden = !(hostRow && !hostRow.hasLeft && !hostRow.connected);
  elements.waitingFinalizeButton.hidden = !(isHost && myFinished && !allFinished);

  if (isHost && room.status === ROOM_STATUS.PLAYING) {
    finalizeMatchIfReady({ roomId: room.roomId, matchId: currentMatchId, force: false });
  }

  if (room.status === ROOM_STATUS.RESULT) {
    goToResultScreen(room);
  }
}

// 今どの画面を表示しているかで、進捗表示の更新先を出し分ける（quiz画面の簡易ストリップ、
// または待機画面の詳細一覧）。currentMatchIdが無い（オンライン対戦の試合中でない）ときは
// 何もしない。document.body.dataset.screenはjs/screens.jsのshowScreen()が管理している。
function updateOnlineBattlePlayUi(room) {
  if (!currentMatchId) return;
  const rows = getOnlineBattleMatchRows(room);
  const myUid = getCurrentUid();
  const currentScreen = document.body.dataset.screen;

  if (currentScreen === "quiz") {
    renderOnlineBattleQuizStrip(rows, myUid);
  } else if (currentScreen === "onlineBattleWaiting") {
    renderOnlineBattleWaitingList(room, rows, myUid);
  }
}

// 結果画面を描画する。固定参加者（participants）のうち、結果を送信できた人だけを
// js/battleModes/index.js経由のcompareBattleResults()で順位付けし、送信できなかった人は
// DNFとして最下位グループに表示する（オフライン対戦のjs/localBattleResultScreen.jsと
// 同じ考え方だが、結果の集まり方がFirebase経由の自動集計である点が異なる）。
function goToResultScreen(room) {
  const match = (room.matches || {})[currentMatchId] || {};
  const participants = match.participants || {};
  const results = match.results || {};
  const myUid = getCurrentUid();

  renderSettingsChips(elements.resultConfigSummary, room.settings);
  elements.resultRuleNote.textContent = getRuleDescription(room.gameMode, room.settings);

  const finishers = [];
  const dnfEntries = [];
  Object.entries(participants).forEach(([uid, participant]) => {
    const result = results[uid];
    if (result) {
      finishers.push({ uid, participant, result });
    } else {
      dnfEntries.push({ uid, participant });
    }
  });
  finishers.sort((a, b) => compareBattleResults(room.gameMode, a.result, b.result, room.settings));

  const medalByRank = { 1: "🥇", 2: "🥈", 3: "🥉" };

  // 「あなた」は名前の文字列に直接連結せず、独立した小さいバッジとして分ける
  // （本人の指摘：表示名が長いと名前＋「（あなた）」が2行に折り返りやすいため）。
  function appendNameRow(container, participant, uid) {
    const nameRow = document.createElement("p");
    nameRow.className = "battle-rank-name";
    const oshiDot = createOshiDotElement(participant.oshiMemberId);
    if (oshiDot) nameRow.appendChild(oshiDot);

    const nameText = document.createElement("span");
    nameText.textContent = participant.displayName;
    nameRow.appendChild(nameText);

    if (uid === myUid) {
      const meBadge = document.createElement("span");
      meBadge.className = "battle-rank-me-badge";
      meBadge.textContent = "あなた";
      nameRow.appendChild(meBadge);
    }
    container.appendChild(nameRow);
  }

  elements.resultList.innerHTML = "";

  finishers.forEach((entry, index) => {
    const rank = index + 1;
    const row = document.createElement("li");
    row.className = `battle-rank-row${rank === 1 ? " is-rank-1" : ""}`;

    const medal = document.createElement("div");
    medal.className = "battle-rank-medal";
    medal.textContent = medalByRank[rank] ?? `${rank}位`;
    row.appendChild(medal);

    const info = document.createElement("div");
    info.className = "battle-rank-info";
    appendNameRow(info, entry.participant, entry.uid);

    const common = entry.result.common;
    const metaParts = [`正解${common.correctCount}／ミス${common.missCount}`];
    if (room.settings.rule === "loveChain" && !entry.result.completed) {
      metaParts.push(`到達${entry.result.detail?.reachedQuestionNumber ?? 0}問`);
    }
    const meta = document.createElement("p");
    meta.className = "battle-rank-meta";
    meta.textContent = metaParts.join("／");
    info.appendChild(meta);
    row.appendChild(info);

    const timeValue = document.createElement("div");
    timeValue.className = "battle-rank-time";
    if (room.settings.rule === "normal") {
      const finalMs = computeNormalFinalRecordMs(
        { totalElapsedMs: common.elapsedMs, missCount: common.missCount },
        room.settings.penaltySeconds
      );
      const finalLine = document.createElement("p");
      finalLine.className = "battle-rank-time-final";
      finalLine.textContent = `${(finalMs / 1000).toFixed(2)}秒`;
      const breakdownLine = document.createElement("p");
      breakdownLine.className = "battle-rank-time-breakdown";
      breakdownLine.textContent = `実測${(common.elapsedMs / 1000).toFixed(2)}秒＋ペナルティ${(common.missCount * room.settings.penaltySeconds).toFixed(2)}秒`;
      timeValue.appendChild(finalLine);
      timeValue.appendChild(breakdownLine);
    } else {
      timeValue.textContent = entry.result.completed
        ? `${(common.elapsedMs / 1000).toFixed(2)}秒`
        : `${entry.result.detail?.reachedQuestionNumber ?? 0}問目で終了`;
    }
    row.appendChild(timeValue);

    elements.resultList.appendChild(row);
  });

  dnfEntries.forEach((entry) => {
    const row = document.createElement("li");
    row.className = "battle-rank-row is-dnf";

    const medal = document.createElement("div");
    medal.className = "battle-rank-medal";
    medal.textContent = "―";
    row.appendChild(medal);

    const info = document.createElement("div");
    info.className = "battle-rank-info";
    appendNameRow(info, entry.participant, entry.uid);
    const meta = document.createElement("p");
    meta.className = "battle-rank-meta";
    meta.textContent = "未完了（DNF）";
    info.appendChild(meta);
    row.appendChild(info);

    const timeValue = document.createElement("div");
    timeValue.className = "battle-rank-time";
    timeValue.textContent = "―";
    row.appendChild(timeValue);

    elements.resultList.appendChild(row);
  });

  elements.navigateTo("onlineBattleResult");
}

// 再送ボタン用に、直前に送ろうとした結果を覚えておく。
let pendingFinishResult = null;

// クイズを終えた（全問終了、またはLOVE連チャンで脱落）直後にjs/main.jsから呼ばれる。
// 結果を送信し、成功したら待機画面へ、失敗したら再送ボタン付きのエラー表示にする。
export async function finishOnlineBattleMatch(result, answeredCount) {
  if (!currentRoomId || !currentMatchId) return;
  pendingFinishResult = { result, answeredCount };

  elements.waitingSubmitError.hidden = true;
  elements.waitingLeadText.textContent = "結果を送信しています…";
  elements.navigateTo("onlineBattleWaiting");

  const outcome = await finishMyMatch({ roomId: currentRoomId, matchId: currentMatchId, result, answeredCount });
  if (!outcome.ok) {
    if (outcome.reason === "result-mismatch") {
      // 通常は起こらないはずの異常事態（Firebase上に既にある結果が、今回送ろうとした内容と
      // 食い違っている）。再送しても解決しないため、通信エラーとは別の案内にし、
      // 再送ボタンからは呼び出せないようにする（pendingFinishResultをnullに戻して塞ぐ）。
      pendingFinishResult = null;
      elements.waitingLeadText.textContent = "結果の送信中に問題が発生しました。お手数ですが、ホストにご確認のうえ、もう一度対戦をやり直してください。";
      elements.waitingSubmitError.hidden = false;
      elements.waitingRetryButton.hidden = true;
      return;
    }
    elements.waitingLeadText.textContent = "結果の送信に失敗しました。";
    elements.waitingSubmitError.hidden = false;
    elements.waitingRetryButton.hidden = false;
    return;
  }
  pendingFinishResult = null;
  elements.waitingSubmitError.hidden = true;
  elements.waitingRetryButton.hidden = false;
  elements.waitingLeadText.textContent = "あなたの結果を送信しました。他のプレイヤーの終了を待っています。";
}

// 1問終える（正解して次へ進む、またはハードルールで1回answeredした）たびにjs/main.jsから
// 呼ばれる。fire-and-forget（呼び出し側はawaitしない）で構わない設計になっている
// （js/onlineBattle.jsのsubmitAnswerProgress参照：内部で全て握りつぶし、rejectしない）。
export function reportOnlineBattleProgress(answeredCount) {
  if (!currentRoomId || !currentMatchId) return;
  submitAnswerProgress({ roomId: currentRoomId, matchId: currentMatchId, answeredCount });
}

// クイズ中に「対戦をやめる」で中断したときにjs/main.jsから呼ばれる。結果は一切送信せず、
// ルームから退出するだけ（オフライン対戦の「結果コードは作られません」と同じ考え方：
// 「対戦の結果は送信されません」）。画面遷移自体はmain.js側が直接showScreen()するため、
// ここでは状態の後片付けだけを行う。
export function quitOnlineBattleDuringQuiz() {
  const roomId = currentRoomId;
  stopListeningToRoom();
  stopCountdownWatching();
  currentMatchId = null;
  currentMatchTotalQuestions = 0;
  currentRoomId = null;
  lastHandledRoomStatus = null;
  pendingFinishResult = null;
  if (elements.quizProgressStrip) elements.quizProgressStrip.hidden = true;
  if (roomId) leaveRoom({ roomId });
  renderLastRoomBanner();
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
        "not-waiting": "この対戦はすでに開始・終了しています。",
      };
      elements.lobbyStartError.textContent = messages[result.reason] ?? "対戦の開始に失敗しました。通信環境をご確認のうえ、もう一度お試しください。";
      elements.lobbyStartError.hidden = false;
    } else {
      elements.lobbyStartError.hidden = true;
    }
  });

  // ===== Step3：待機画面・結果画面 =====

  elements.waitingRetryButton.addEventListener("click", () => {
    if (!pendingFinishResult) return;
    finishOnlineBattleMatch(pendingFinishResult.result, pendingFinishResult.answeredCount);
  });

  elements.waitingFinalizeButton.addEventListener("click", () => {
    elements.waitingFinalizeConfirmModal.hidden = false;
  });
  elements.waitingFinalizeCancelButton.addEventListener("click", () => {
    elements.waitingFinalizeConfirmModal.hidden = true;
  });
  elements.waitingFinalizeConfirmButton.addEventListener("click", async () => {
    elements.waitingFinalizeConfirmModal.hidden = true;
    if (!currentRoomId || !currentMatchId) return;
    await finalizeMatchIfReady({ roomId: currentRoomId, matchId: currentMatchId, force: true });
  });

  elements.resultBackButton.addEventListener("click", () => {
    // 試合の文脈はここで終わり。currentMatchIdを残したままにすると、この後ロビー以外の
    // 無関係なクイズ（通常プレイ等）を始めたときに、古い試合の進捗ストリップが
    // 誤って出てしまう可能性があるため、明示的にクリアする。
    currentMatchId = null;
    currentMatchTotalQuestions = 0;
    if (elements.quizProgressStrip) elements.quizProgressStrip.hidden = true;
    elements.navigateTo("onlineBattleLobby");
  });

  renderLastRoomBanner();
}
