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
  clearLastRoom,
  updateRoomSettings,
  setReady,
  startBattle,
  finishCountdown,
  subscribeServerTimeOffset,
  initializeMyMatchProgress,
  submitAnswerProgress,
  finishMyMatch,
  finalizeMatchIfReady,
  rematchMatch,
  COUNTDOWN_DURATION_MS,
  ROOM_STATUS,
} from "./onlineBattle.js";
import { getCurrentUid } from "./firebaseClient.js";
import {
  validateRoomSettings,
  buildQuestionsForMode,
  compareBattleResults,
  getRuleDescription,
  getModeLabel,
} from "./battleModes/index.js";
import { QUESTION_COUNT_LABELS, CATEGORY_LABELS, RULE_LABELS } from "./localBattleScreen.js";
import { computeNormalFinalRecordMs } from "./localBattleResult.js";
import { MEMBERS } from "./data/members.js";
import { getMemberById } from "./memberUtils.js";
// 【2026-08-08新設・Phase6】歌詞クイズ対戦だけ、進行の前提（全員同期・ホスト主導）が
// 他のgameModeと根本的に異なるため、専用の画面ファイルへ委譲する（js/onlineLyricsQuizBattleScreen.js
// 冒頭コメント参照）。依存は一方向（このファイル→あちら）に保ち、あちらからはこのファイルを
// 一切importしない。gameMode名の直接比較が数箇所だけ残るが、「出題ロジック・ルールの判定文言を
// このファイルへ持ち込まない」という上記の方針自体は変えていない（委譲するのはあくまで
// "どの専用画面へ進めるか"の分岐だけで、歌詞クイズの中身の判定は一切ここに書かない）。
import {
  renderLyricsQuizLobbySettings,
  enterLyricsQuizBattlePlay,
  enterLyricsQuizResult,
  handleLyricsQuizRoomUpdate,
  resetLyricsQuizBattleState,
} from "./onlineLyricsQuizBattleScreen.js";
// 【2026-08-06新設・回帰防止】「対戦を開始する」時にどの設定を使うか決める判定ロジックは、
// DOM・Firebaseに一切触れない別ファイルへ切り出し、恒久テストの対象にした
// （js/onlineBattleStartSettings.js冒頭コメント参照）。
import {
  LYRICS_QUIZ_GAME_MODE,
  resolveStartSettingsForSubmit,
  resolveLastRoomRejoinOutcome,
} from "./onlineBattleStartSettings.js";
// 【2026-08-08新設】出題する曲をホストが選べる機能。曲の一覧・選択UI自体は3対戦モード共通の
// 別画面（js/onlineBattleSongPicker.js）に任せ、このファイルは「今の選択曲id配列」を
// 保持し、settings.questionSourceへ変換するだけに専念する（gameModeを問わない設計）。
import { openOnlineBattleSongPicker } from "./onlineBattleSongPicker.js";
import { QUESTION_SOURCE_TYPE } from "./questionSource.js";
import { savePlayHistoryEntryIfNew } from "./playHistory.js";

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
// 【2026-08-06新設】歌詞クイズの対戦設定は、既存のタイムアタック用フォーム
// （readSettingsFromHostForm、online-battle-settings-*という名前のラジオボタン群）とは
// 別物で、ロビーの各設定項目を触るたびにapplyLyricsQuizSettingsChange()が
// 即座にFirebaseへ書き込んでいる（=room.settingsが常に最新）。そのため「対戦を開始する」を
// 押した時点でフォームから読み直す必要が無く、renderLobby()のたびにここへ最新値を
// 控えておくだけでよい。
let currentLyricsQuizSettings = null;
// 【2026-08-08新設】ホストが「曲を選んで出題」を選んだときの、現在の選択曲id配列。
// room.settings.questionSource.songIdsと常に一致させる（applySettingsToHostForm()で
// room更新のたびに同期し直す。リロード直後・他ホスト操作の反映もこの経路で行われる）。
let hostSelectedManualSongIds = [];
// 【2026-08-08追記】上の同期を「room.settingsRevisionが実際に変わったときだけ」に限定するための
// 記録用。出題数に対して選択曲が足りず保存に失敗した場合、room.settingsRevisionは変わらない
// （Firebaseへの書き込み自体が行われないため）。ここで無条件に同期してしまうと、ホストが曲を
// 選び足している最中に他の参加者の接続状態変化などでrenderLobby()が再実行されるたびに、
// 選択中の内容が保存済みの古い内容へ巻き戻ってしまう（js/onlineLyricsQuizBattleScreen.jsの
// 実機検証で発見した不具合と同じ原因のため、同じ対策をこちらにも入れる）。
let lastSyncedManualSongsRevision = null;

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

// 【Phase6新設】結果画面の「ホームへ戻る」で、room.status・players等のFirebase側データは
// 一切変更せずにルーム監視だけを止める後片付け。既存の#online-battle-result-screen用
// resultHomeLinkハンドラ（下記）と全く同じ処理を、js/onlineLyricsQuizBattleScreen.js側の
// 「ホームへ戻る」からも呼べるように公開する（あちらはこのファイルをimportしない設計の
// ため、js/main.js経由のコールバックとして渡す）。
export function leaveOnlineBattleRoomView() {
  stopListeningToRoom();
  currentRoomId = null;
  resetOnlineBattleMatchState();
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
// 【2026-08-08追記・Phase4】gameModeを引数に追加し、先頭に対戦モード名のチップを
// 必ず表示するようにした（モードが複数になったため。将来ランキング機能を作る際も、
// 「どのモードの結果か」が画面から常に読み取れることを優先する、本人の指示どおり）。
function renderSettingsChips(container, settings, gameMode) {
  container.innerHTML = "";
  // 【2026-08-08新設】曲を手動選択している場合は、カテゴリの代わりに「N曲から出題」を表示する
  // （本人指示：参加者には曲数だけ見せ、対戦開始前に曲名までは見せない）。
  const isManualSongSource = settings.questionSource?.type === QUESTION_SOURCE_TYPE.MANUAL_SELECTION;
  const songSourceChip = isManualSongSource
    ? `${settings.questionSource.songIds?.length ?? 0}曲から出題`
    : CATEGORY_LABELS[settings.categoryFilterValue] ?? settings.categoryFilterValue;
  const chips = [
    getModeLabel(gameMode),
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? settings.questionCountValue,
    songSourceChip,
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
// リロード直後・他タブでの変更後もrenderLobby()経由で必ず呼ばれるため、ここで
// hostSelectedManualSongIds・出題する曲UIの状態も一緒に復元する（本人指示：リロード対応）。
function applySettingsToHostForm(settings, settingsRevision) {
  const setChecked = (name, value) => {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  setChecked("online-battle-settings-question-count", settings.questionCountValue);
  setChecked("online-battle-settings-category", settings.categoryFilterValue);
  setChecked("online-battle-settings-rule", settings.rule);
  setChecked("online-battle-settings-penalty", String(settings.penaltySeconds));
  elements.lobbySettingsPenaltyFieldset.hidden = settings.rule !== "normal";

  // settingsRevisionが前回同期時から変わっていなければ、room.settingsは「保存済みの古い内容」の
  // ままなので同期をスキップする（ホストが選び直している最中の内容を守るため。詳細は
  // lastSyncedManualSongsRevisionの定義コメント参照）。
  if (settingsRevision === lastSyncedManualSongsRevision) return;
  lastSyncedManualSongsRevision = settingsRevision;
  const isManualSongSource = settings.questionSource?.type === QUESTION_SOURCE_TYPE.MANUAL_SELECTION;
  setChecked("online-battle-settings-song-source", isManualSongSource ? "manual" : "all");
  hostSelectedManualSongIds = isManualSongSource ? (settings.questionSource.songIds ?? []) : [];
  updateManualSongSourceUi(isManualSongSource);
}

// 「出題する曲」の選択状態に合わせて、「曲を選ぶ」ボタン・選択数表示・カテゴリ欄の
// 表示/非表示を切り替える。カテゴリは曲を手動選択している間は意味を持たないため隠す
// （settings.questionSourceがある間、js/battleModes/timeAttackBattleMode.jsが
// categoryFilterValueを一切参照しないことと対応させている）。
function updateManualSongSourceUi(isManual) {
  elements.lobbySettingsManualSongRow.hidden = !isManual;
  elements.lobbySettingsCategoryFieldset.hidden = isManual;
  elements.lobbySettingsManualSongCount.textContent = `${hostSelectedManualSongIds.length}曲選択中`;
}

function readSettingsFromHostForm() {
  const songSourceValue =
    document.querySelector('input[name="online-battle-settings-song-source"]:checked')?.value ?? "all";
  const settings = {
    questionCountValue: document.querySelector('input[name="online-battle-settings-question-count"]:checked').value,
    categoryFilterValue: document.querySelector('input[name="online-battle-settings-category"]:checked').value,
    rule: document.querySelector('input[name="online-battle-settings-rule"]:checked').value,
    penaltySeconds: Number(document.querySelector('input[name="online-battle-settings-penalty"]:checked').value),
  };
  // 「全曲から出題」のときはquestionSource自体を持たせない（今までと全く同じ、
  // categoryFilterValueだけを見る動作を維持するため。本人指示：既存動作を変えない）。
  if (songSourceValue === "manual") {
    settings.questionSource = { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: hostSelectedManualSongIds };
  }
  return settings;
}

// ホストの設定フォームの今の内容を検証し、問題なければFirebaseへ反映する
// （設定ラジオの変更・曲選択画面での「決定」の両方から呼ばれる共通処理）。
async function applyHostSettingsChangeFromForm() {
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
}

// 曲選択画面を開く（新規に選ぶ場合・すでに選んだ内容を編集する場合の両方で使う）。
function openSongPickerForHost() {
  openOnlineBattleSongPicker(
    hostSelectedManualSongIds,
    async (songIds) => {
      hostSelectedManualSongIds = songIds;
      updateManualSongSourceUi(true);
      elements.navigateTo("onlineBattleLobby");
      await applyHostSettingsChangeFromForm();
    },
    () => {
      // キャンセル時：一度も曲を選んだことが無ければ「全曲から出題」に戻す
      // （0曲のまま「曲を選んで出題」の状態で放置しない）。既に選択済みなら維持する。
      if (hostSelectedManualSongIds.length === 0) {
        const allRadio = document.querySelector('input[name="online-battle-settings-song-source"][value="all"]');
        if (allRadio) allRadio.checked = true;
        updateManualSongSourceUi(false);
      }
      elements.navigateTo("onlineBattleLobby");
    }
  );
}

// 参加者用のREADYボタンの見た目を、今のREADY状態に合わせて更新する。
function updateReadyButton(ready) {
  elements.lobbyReadyButton.textContent = ready ? "✓ 準備完了しました（解除する）" : "準備完了にする";
  elements.lobbyReadyButton.classList.toggle("is-ready", ready);
}

// ホスト用の開始ボタンを、①room.statusが実際にwaitingであり、②参加者（ホスト以外）が
// 1人以上いて、③全員が「今の設定に対して」READYのときだけ押せるようにする。
// readyForRevisionがsettingsRevisionと一致しない場合は「古い設定に対するREADY」とみなし、
// 未準備扱いにする（js/onlineBattle.jsのコメント参照）。
//
// 【room.statusを確認する理由】以前はREADY状態だけを見ており、status（waiting/countdown/
// playing/result等）を一切確認していなかった。そのため、何らかの理由で対戦が既に開始・終了
// していても、READY条件さえ揃っていれば「開始できます」と表示され続けてしまい、実際に
// 「対戦を開始する」を押すとstartBattle()側は正しくnot-waitingで拒否する、という
// 矛盾した表示（本人からの実機報告で発覚）が起きていた。ここでstatusを見ることで、
// 「開始できます」という案内自体が、実際に開始できない状況では出ないようにする。
function updateStartButton(room) {
  const isWaiting = room.status === ROOM_STATUS.WAITING;
  const players = room.players || {};
  const currentRevision = room.settingsRevision ?? 0;
  const nonHostPlayers = Object.entries(players).filter(([uid]) => uid !== room.host);
  const isPlayerReady = (player) => player.ready && player.readyForRevision === currentRevision;
  const allReady = nonHostPlayers.length > 0 && nonHostPlayers.every(([, player]) => isPlayerReady(player));

  elements.lobbyStartButton.disabled = !isWaiting || !allReady;

  if (!isWaiting) {
    // 通常はstatusがwaitingでなくなった瞬間に画面遷移でロビーを離れるため、ここに来るのは
    // 遷移の合間の一瞬程度のはずだが、念のため「開始できます」等の案内は一切出さない。
    elements.lobbyStartHint.textContent = "";
  } else if (nonHostPlayers.length === 0) {
    elements.lobbyStartHint.textContent = "参加者が来るのを待っています。";
  } else if (!allReady) {
    const readyCount = nonHostPlayers.filter(([, player]) => isPlayerReady(player)).length;
    elements.lobbyStartHint.textContent = `参加者の準備完了を待っています（${readyCount}/${nonHostPlayers.length}人）。`;
  } else {
    elements.lobbyStartHint.textContent = "全員の準備が完了しました。開始できます。";
    // 「開始できます」を表示する以上、それより前に出ていたかもしれない「開始に失敗しました」
    // 系のエラー（例：not-waiting）は、今この瞬間には矛盾する古い情報になっているため消す。
    // 【本人からの実機報告で発覚】以前はこのエラー表示を、次にstartBattle()を試みるまで
    // 消していなかったため、「開始できます」と「すでに開始・終了しています」が同時に
    // 画面へ残ってしまうことがあった。
    elements.lobbyStartError.hidden = true;
  }
}

// 対戦開始（status: playing）を検知したときに呼ぶ（Step3）。同じseed・settingsから
// js/battleModes/index.js経由で問題順を組み立て、実際にクイズを始める。
// 出題・回答そのものはjs/main.js（既存のクイズエンジン）が担当するため、ここでは
// 「今の試合の情報を覚えておく」「自分の進捗を初期化する」「main.js側に開始を依頼する」
// ところまでを行う。
function enterOnlineBattlePlay(room) {
  // 歌詞クイズだけは進行の前提が根本的に異なるため、専用画面へ完全に委譲する
  // （currentMatchId等、このファイル自身のStep3状態は一切使わないままにしておく。
  // js/onlineLyricsQuizBattleScreen.js冒頭コメント参照）。
  if (room.gameMode === LYRICS_QUIZ_GAME_MODE) {
    enterLyricsQuizBattlePlay(room);
    return;
  }

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

// カウントダウン・タイマー・進捗ストリップ・試合固有のローカル状態をまとめて後片付けする。
// 「ルームが消えた」「対戦をやめる」「もう一度対戦する」など、今の試合の文脈から離れる
// タイミングでは必ずこれを通す（本人の指摘：クリーンアップ処理が複数箇所に散らばっていると
// 一部だけ漏れる事故が起きやすいため、共通処理として1箇所にまとめている）。
function resetOnlineBattleMatchState() {
  stopCountdownWatching();
  currentMatchId = null;
  currentMatchTotalQuestions = 0;
  pendingFinishResult = null;
  if (elements.quizProgressStrip) elements.quizProgressStrip.hidden = true;
  // ルームを離れる際は必ずリセットする。次に入るルームのsettingsRevisionが
  // たまたま同じ値（例：新規作成直後は毎回0）だった場合に、前のルームの選択曲を
  // 誤って引き継いでしまう事故を防ぐため。
  hostSelectedManualSongIds = [];
  lastSyncedManualSongsRevision = null;
}

// ロビー画面の参加者一覧・対戦設定・準備完了/開始ボタンを再描画する。
// 参加者一覧・接続状態・対戦設定・READY状態・進行状態のいずれかが変わるたびに呼ばれる。
function renderLobby(room) {
  if (!room) {
    // ルームが無くなった＝ホストが退出して解散した、または何らかの理由で消えた。
    // カウントダウン中・開始確認画面を見ている最中にホストが退出した場合も、
    // ここでロビー画面へ強制的に戻し、「終了しました」の案内を必ず見せる
    // （本人からのテスト項目：カウントダウン中にホストが退出しても安全に終了すること）。
    lastHandledRoomStatus = null;
    resetOnlineBattleMatchState();
    resetLyricsQuizBattleState();
    elements.lobbyGoneNotice.hidden = false;
    elements.lobbyContent.hidden = true;
    elements.navigateTo("onlineBattleLobby");
    return;
  }
  elements.lobbyGoneNotice.hidden = true;
  elements.lobbyContent.hidden = false;

  elements.lobbyRoomCode.textContent = room.roomId;
  elements.lobbyMaxPlayersText.textContent = `最大${room.maxPlayers}人`;
  // 対戦モードは作成後に変更できない固定値のため、ホスト・参加者どちらにも常に見える
  // 場所に表示する（2026-08-08新設・Phase4）。
  elements.lobbyGameModeText.textContent = `モード: ${getModeLabel(room.gameMode)}`;
  currentGameMode = room.gameMode;
  if (room.gameMode === LYRICS_QUIZ_GAME_MODE) {
    currentLyricsQuizSettings = room.settings;
  }

  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const settings = room.settings;
  const players = room.players || {};

  // 状態遷移の検知は、後続の描画判定（設定変更通知の抑制など）でも使うため先に行っておく。
  const previousStatus = lastHandledRoomStatus;
  const statusJustChanged = room.status !== previousStatus;
  // ホストが「もう一度対戦する」を選んだ結果のREADYリセットでは、既存の「設定が変更されました」
  // 通知（本来は設定変更によるREADY解除用）を誤って出さないよう、別扱いにする。
  const isRematchReset = statusJustChanged && room.status === ROOM_STATUS.WAITING && previousStatus === ROOM_STATUS.RESULT;
  if (statusJustChanged) {
    lastHandledRoomStatus = room.status;
  }
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
  const isLyricsQuiz = room.gameMode === LYRICS_QUIZ_GAME_MODE;
  // 歌詞クイズは設定の形自体が別物（ルール選択・回答方式・ヒント秒数等）のため、
  // 既存の設定コンテナ（timeAttack/randomPlayback用の固定ラジオ群）は隠し、
  // js/onlineLyricsQuizBattleScreen.jsが持つ専用コンテナへ描画を委譲する。
  elements.lobbySettingsHost.hidden = !isHost || isLyricsQuiz;
  elements.lobbySettingsParticipant.hidden = isHost || isLyricsQuiz;
  elements.lobbyReadyButton.hidden = isHost;
  elements.lobbyStartButton.hidden = !isHost;
  elements.lobbyStartHint.hidden = !isHost;

  if (isHost) {
    if (isLyricsQuiz) {
      renderLyricsQuizLobbySettings(room, true);
    } else {
      applySettingsToHostForm(settings, room.settingsRevision);
    }
    updateStartButton(room);
  } else {
    if (isLyricsQuiz) {
      renderLyricsQuizLobbySettings(room, false);
    } else {
      renderSettingsChips(elements.lobbySettingsSummary, settings, room.gameMode);
    }

    const myPlayer = players[myUid];
    const myReady = Boolean(myPlayer?.ready && myPlayer?.readyForRevision === (room.settingsRevision ?? 0));
    updateReadyButton(myReady);

    if (isRematchReset) {
      // 再戦によるREADYリセットは、設定自体は変わっていないため「設定が変更されました」
      // 通知は出さず、代わりに専用の再戦案内を出す。
      elements.lobbySettingsChangedNotice.hidden = true;
      elements.lobbyRematchNotice.hidden = false;
    } else if (lastKnownMyReady === true && myReady === false && !suppressNextReadyChangeNotice) {
      // READYがtrue→falseに変わった瞬間（＝ホストが設定を変更してリセットされた瞬間）だけ、
      // 「設定が変更されました」通知を出す。自分でREADYボタンを押して解除した直後は出さない。
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
  if (statusJustChanged) {
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
      if (isLyricsQuiz) {
        enterLyricsQuizResult(room);
      } else {
        goToResultScreen(room);
      }
    } else if (isRematchReset) {
      // ホストが「もう一度対戦する」を選んだ→全端末（ホスト含む）を自動的にロビーへ戻す。
      // 前回の試合に関するローカル状態（progress/results監視の元になるcurrentMatchId、
      // カウントダウンタイマー、進捗ストリップ等）を確実に後片付けしてから遷移する
      // （本人の要望：次の試合を始めたときに前回の画面・データが混ざらないこと）。
      resetOnlineBattleMatchState();
      elements.navigateTo("onlineBattleLobby");
    }
  }

  updateOnlineBattlePlayUi(room);
  if (isLyricsQuiz) {
    handleLyricsQuizRoomUpdate(room);
  }
}

function goToLobby(roomId) {
  currentRoomId = roomId;
  currentGameMode = null;
  currentLyricsQuizSettings = null;
  lastHandledRoomStatus = null;
  suppressNextReadyChangeNotice = false;
  lastKnownMyReady = null;
  resetLyricsQuizBattleState();
  resetOnlineBattleMatchState();
  elements.lobbySettingsChangedNotice.hidden = true;
  elements.lobbyRematchNotice.hidden = true;
  elements.lobbyStartError.hidden = true;
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
  elements.waitingGameModeText.textContent = `モード: ${getModeLabel(room.gameMode)}`;
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

  // 「もう一度対戦する」はホスト専用（対戦設定を書き換えられるのがホストだけという
  // 既存の権限設計と揃えている）。
  elements.resultRematchButton.hidden = room.host !== myUid;

  renderSettingsChips(elements.resultConfigSummary, room.settings, room.gameMode);
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

  saveOnlineBattleHistoryEntry(room, currentMatchId, finishers, dnfEntries, myUid);
  elements.navigateTo("onlineBattleResult");
}

// 【2026-08-08新設】オンライン対戦（イントロ対戦・ランダム再生対戦）の結果を、統一プレイ履歴
// （js/playHistory.js）へ保存する。id を online:{matchId} にすることで、リロード・再接続・
// 画面再描画でこの結果画面へ何度到達しても、同じ試合が重複して保存されないようにする
// （本人指示の「matchIdによる重複防止」）。DNFで終わった場合も、可能な範囲で記録する
// （順位・スコアは推測で作らず、null・isDnf:trueのままにする）。
const HISTORY_MODE_ID_BY_GAME_MODE = { timeAttack: "onlineTimeAttack", randomPlayback: "onlineRandomPlayback" };
const HISTORY_MODE_LABEL_BY_GAME_MODE = {
  timeAttack: "オンライン対戦（イントロ）",
  randomPlayback: "オンライン対戦（ランダム再生）",
};

function saveOnlineBattleHistoryEntry(room, matchId, finishers, dnfEntries, myUid) {
  if (!matchId) return;
  const myFinisherIndex = finishers.findIndex((entry) => entry.uid === myUid);
  const isDnf = myFinisherIndex === -1;
  const myEntry = isDnf ? dnfEntries.find((entry) => entry.uid === myUid) : finishers[myFinisherIndex];
  if (!myEntry) return; // 自分自身がparticipantsに存在しない状況は通常起きないが、念のため安全側に倒す

  const isAllSongsMode =
    !room.settings.questionSource || room.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS;

  savePlayHistoryEntryIfNew({
    id: `online:${matchId}`,
    playedAt: Date.now(),
    modeId: HISTORY_MODE_ID_BY_GAME_MODE[room.gameMode] ?? "onlineTimeAttack",
    modeLabel: HISTORY_MODE_LABEL_BY_GAME_MODE[room.gameMode] ?? "オンライン対戦",
    questionCount: currentMatchTotalQuestions,
    isAllSongsMode,
    correctCount: isDnf ? null : myEntry.result.common.correctCount,
    wrongCount: isDnf ? null : myEntry.result.common.missCount,
    skippedCount: null,
    score: null,
    averageResponseMs: null,
    completed: !isDnf,
    details: {
      rule: room.settings.rule,
      penaltySeconds: room.settings.penaltySeconds,
      myRank: isDnf ? null : myFinisherIndex + 1,
      isDnf,
      participantCount: finishers.length + dnfEntries.length,
      standings: [
        ...finishers.map((entry, index) => ({
          displayName: entry.participant.displayName,
          rank: index + 1,
          correctCount: entry.result.common.correctCount,
          missCount: entry.result.common.missCount,
          completed: entry.result.completed,
          totalElapsedMs: entry.result.completed ? entry.result.common.elapsedMs : null,
          isDnf: false,
          isYou: entry.uid === myUid,
        })),
        ...dnfEntries.map((entry) => ({
          displayName: entry.participant.displayName,
          rank: null,
          correctCount: null,
          missCount: null,
          completed: false,
          totalElapsedMs: null,
          isDnf: true,
          isYou: entry.uid === myUid,
        })),
      ],
    },
  });
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
export async function quitOnlineBattleDuringQuiz() {
  const roomId = currentRoomId;
  stopListeningToRoom();
  resetOnlineBattleMatchState();
  currentRoomId = null;
  lastHandledRoomStatus = null;
  // 【本人の指摘・2026-08-11】leaveRoom()はrooms/{roomId}/players配下の書き込みに加えて
  // clearLastRoom()も内部で行う。ここをawaitせずrenderLastRoomBanner()を呼ぶと、
  // clearLastRoom()が終わる前に「前回のルームに戻る」バナーが（まだ消えていない
  // 古いlastRoomの値で）表示されてしまい、実際に押した頃にはlastRoomが既に無くなっていて
  // 無反応になる、という不具合があった。leaveRoom()の完了を待ってから再描画することで解消する。
  if (roomId) await leaveRoom({ roomId });
  renderLastRoomBanner();
}

// 対戦モード画面群を使えるようにする。main.jsの初期化処理から1回だけ呼ぶ想定。
export function initOnlineBattleScreens(newElements) {
  elements = newElements;

  // 2026-08-08修正：ホームの特別モードカードから直接この画面を開くようになったため、
  // 「戻る」は間に古い「特別モード一覧画面」を挟まずホーム画面へ直接戻す。
  elements.entryBackButton.addEventListener("click", () => elements.navigateTo("start"));
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
    if (!lastRoom) {
      // 万一、記憶が既に消えた状態でボタンが表示されたまま押された場合も、
      // 無反応にはせずその場でバナーごと隠す（本人の指摘・2026-08-11）。
      renderLastRoomBanner();
      return;
    }
    elements.entryLastRoomButtonLabel.textContent = "再接続中…";
    elements.entryLastRoomError.hidden = true;
    const result = await joinRoom({ roomId: lastRoom.roomId, playerName: lastRoom.playerName });
    elements.entryLastRoomButtonLabel.textContent = "前回のルームに戻る";
    const outcome = resolveLastRoomRejoinOutcome(result);
    if (outcome.action === "enter-lobby") {
      goToLobby(outcome.roomId);
      return;
    }
    // ルームが本当に存在しない場合（reason:"not-found"）は、無効な「前回のルーム」記憶を
    // 残したままにしない。それ以外（書き込み失敗等、一時的な通信の癖の可能性がある失敗）は
    // 記憶を残し、ボタンを残してもう一度押せば再試行できるようにしておく。
    if (outcome.forgetLastRoom) {
      clearLastRoom();
    }
    elements.entryLastRoomError.textContent = JOIN_ERROR_MESSAGES[outcome.reason] ?? "再接続に失敗しました。もう一度お試しください。";
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
    // 2026-08-08新設（Phase4）：対戦モード選択。一度ルームを作成した後はgameModeを
    // 変更できない仕様のため（js/onlineBattle.jsのルーム作成ルール参照）、ここで選んだ値が
    // そのままルームの対戦モードとして固定される。
    const gameMode = document.querySelector('input[name="online-battle-game-mode"]:checked').value;

    elements.createSubmitButton.disabled = true;
    const result = await createRoom({ playerName, maxPlayers, gameMode });
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
  // 【2026-08-08追記】出題する曲のラジオも同じ仕組みに含める。「曲を選んで出題」へ切り替えた
  // 瞬間だけは、曲がまだ0曲で検証エラーになるのを避けるため、先に曲選択画面を開く。
  document
    .querySelectorAll(
      'input[name="online-battle-settings-question-count"], input[name="online-battle-settings-category"], input[name="online-battle-settings-rule"], input[name="online-battle-settings-penalty"], input[name="online-battle-settings-song-source"]'
    )
    .forEach((radio) => {
      radio.addEventListener("change", async () => {
        if (!currentRoomId) return;
        if (radio.name === "online-battle-settings-song-source" && radio.value === "manual") {
          updateManualSongSourceUi(true);
          openSongPickerForHost();
          return;
        }
        await applyHostSettingsChangeFromForm();
      });
    });

  elements.lobbySettingsChooseSongsButton.addEventListener("click", () => {
    openSongPickerForHost();
  });

  elements.lobbyReadyButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    const nowReady = elements.lobbyReadyButton.classList.contains("is-ready");
    suppressNextReadyChangeNotice = true;
    elements.lobbySettingsChangedNotice.hidden = true;
    elements.lobbyRematchNotice.hidden = true;
    await setReady({ roomId: currentRoomId, ready: !nowReady });
  });

  elements.lobbyStartButton.addEventListener("click", async () => {
    if (!currentRoomId) return;

    elements.lobbyStartButton.disabled = true;
    elements.lobbyStartError.hidden = true;

    // 【本人からの実機報告で発覚・2026-08-06修正】歌詞クイズは既存のタイムアタック用
    // フォーム（readSettingsFromHostForm）とは全く別の設定項目を持つため、そのまま
    // 読み込むと該当するラジオボタンが見つからず例外が発生し、しかもtry/catchが
    // 無かったため画面には何も表示されないまま「対戦を開始する」が無反応になっていた
    // （startBattle()自体は正しく動くため、原因の切り分けに時間がかかった）。
    // try/catchで必ずエラーを画面へ出すようにし、歌詞クイズは「常に最新のroom.settings」
    // （各設定項目を触るたびに即座にFirebaseへ書き込まれている値）をそのまま使う形にした。
    try {
      const settings = resolveStartSettingsForSubmit({
        gameMode: currentGameMode,
        readFormSettings: readSettingsFromHostForm,
        lyricsQuizRoomSettings: currentLyricsQuizSettings,
      });

      const result = await startBattle({ roomId: currentRoomId, settings });

      if (!result.ok) {
        // 失敗時（設定不備・READY不足など、room.statusはwaitingのままのはず）だけ、
        // ここで再挑戦できるようボタンを戻す。
        // 【成功時にdisabled=falseへ戻さない理由】成功した瞬間、room.statusは既にwaiting
        // ではなくなっている（countdown）。ここで無条件にdisabled=falseへ戻してしまうと、
        // 本来もう押せないはずのボタンが一瞬だけ有効に見えてしまう（本人からの実機報告で発覚）。
        // 成功後の正しいdisabled状態は、次のrenderLobby()内のupdateStartButton()が
        // room.statusを見て設定するため、ここでは何もしない。
        elements.lobbyStartButton.disabled = false;
        const messages = {
          "not-all-ready": "まだ準備が完了していない参加者がいます。",
          "invalid-settings": result.message ?? "対戦設定が正しくありません。設定内容をご確認ください。",
          "not-host": "ホストのみ開始できます。",
          "not-found": "ルームが見つかりませんでした。",
          "not-waiting": "この対戦はすでに開始・終了しています。",
        };
        elements.lobbyStartError.textContent = messages[result.reason] ?? "対戦の開始に失敗しました。通信環境をご確認のうえ、もう一度お試しください。";
        elements.lobbyStartError.hidden = false;
      } else {
        elements.lobbyStartError.hidden = true;
      }
    } catch (error) {
      // Firebaseの権限エラー・通信エラー・予期しない例外を、無反応にせず必ず画面へ出す。
      elements.lobbyStartButton.disabled = false;
      const isPermissionError = error?.code === "PERMISSION_DENIED" || /permission/i.test(error?.message ?? "");
      elements.lobbyStartError.textContent = isPermissionError
        ? "権限エラーが発生しました（ルールの設定をご確認ください）。"
        : error?.message || "対戦の開始に失敗しました。通信環境をご確認のうえ、もう一度お試しください。";
      elements.lobbyStartError.hidden = false;
      console.error("対戦開始処理でエラーが発生しました:", error);
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

  // 「ホームへ戻る」：room.status・players等のFirebase側データは一切変更しない。
  // ここでロビー画面へ直接navigateTo()していた旧「ロビーに戻る」ボタンは、
  // status=resultのままロビー表示（READY操作・設定変更・開始ボタン）ができてしまう
  // 矛盾状態の原因だったため廃止した（本人からの実機報告・実データ確認により特定）。
  // 「ロビーに戻る」のように見せかけの画面遷移をするのではなく、素直にタイトルへ戻り、
  // 再入場時は必ずroom.statusを見て正しい画面へ復帰する設計（前回のルームに戻るボタン、
  // renderLobby()のstatus分岐）に一本化する。
  elements.resultHomeLink.addEventListener("click", () => {
    // ホーム画面にいる間、この部屋のリアルタイム監視を続ける必要は無いため停止する
    // （再入場時はgoToLobby()が改めてlistenToRoom()し直すので、二重登録の心配もない）。
    stopListeningToRoom();
    currentRoomId = null;
    resetOnlineBattleMatchState();
    elements.navigateTo("start");
  });

  // ホスト専用：「もう一度対戦する」。実際のstatus変更はrematchMatch()に任せ、ここでは
  // ローカルの画面遷移を直接行わない（DNF確定ボタンと同じ設計：Firebase側の変化を
  // renderLobby()側の状態遷移検知が拾って、ホスト・参加者とも自動的にロビーへ戻す。
  // ここで直接navigateTo()もしてしまうと、その直後に届くroom更新による自動遷移と
  // 二重に画面が切り替わってしまうため）。
  elements.resultRematchButton.addEventListener("click", () => {
    elements.resultRematchConfirmModal.hidden = false;
  });
  elements.resultRematchCancelButton.addEventListener("click", () => {
    elements.resultRematchConfirmModal.hidden = true;
  });
  elements.resultRematchConfirmButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    // 通信遅延中の連打・二重イベントで何度も書き込みが飛ばないよう、処理中はボタンを無効化する
    // （rematchMatch()自体も冪等だが、UI側でも素直に多重送信を防いでおく）。
    elements.resultRematchConfirmButton.disabled = true;
    await rematchMatch({ roomId: currentRoomId });
    elements.resultRematchConfirmButton.disabled = false;
    elements.resultRematchConfirmModal.hidden = true;
  });

  renderLastRoomBanner();
}
