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
import { promptReturnToLobby } from "./onlineBattleLobbyReturnPrompt.js";
import {
  createRoom,
  joinRoom,
  leaveRoom,
  listenToRoom,
  getLastRoom,
  clearLastRoom,
  updateRoomSettings,
  updateRoomGameMode,
  transferHost,
  claimHostIfDisconnected,
  kickPlayer,
  setReady,
  startBattle,
  finishCountdown,
  subscribeServerTimeOffset,
  initializeMyMatchProgress,
  submitAnswerProgress,
  finishMyMatch,
  finalizeMatchIfReady,
  returnRoomToLobby,
  rematchAndStartNow,
  COUNTDOWN_DURATION_MS,
  ROOM_STATUS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_MAX_SPECTATORS,
  syncMyHostBadge,
  spectateRoom,
  leaveSpectating,
  promoteSpectatorToPlayer,
} from "./onlineBattle.js";
import { getCurrentUid } from "./firebaseClient.js";
import {
  validateRoomSettings,
  buildQuestionsForMode,
  compareBattleResults,
  computeFinisherRanks,
  getRuleDescription,
  getModeLabel,
  getModeDescription,
  listAvailableGameModes,
  getAvailabilityKind,
  resolveAllEligibleSongIdsForMode,
} from "./battleModes/index.js";
import { QUESTION_COUNT_LABELS, CATEGORY_LABELS, RULE_LABELS } from "./localBattleScreen.js";
import { buildSharedEngineQuestionBreakdown, capQuestionBreakdownForStorage } from "./battleQuestionBreakdown.js";
import { renderQuestionBreakdownAccordion } from "./battleQuestionBreakdownUi.js";
import { computeNormalFinalRecordMs } from "./localBattleResult.js";
import { MEMBERS } from "./data/members.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { getMemberById } from "./memberUtils.js";
// 【2026-09-07新設・本人指示：ルーム参加者プロフィール】ロビー参加者の名前タップで
// 簡易プロフィールを見る機能。既存の「みんなのプロフィール」（js/fanProfilesScreen.js）と
// 同じ部品（DOM構築はjs/fanProfileCard.js、Firebase取得はjs/publicProfileSync.js）を
// そのまま再利用し、新しい取得ロジック・新しいカード見た目は作らない。
import { fetchPublicProfileByUid } from "./publicProfileSync.js";
import { buildOshiSwatch, buildAchievementCountText, buildFriendAchievementSummary } from "./fanProfileCard.js";
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
  INSTANT_BATTLE_GAME_MODE,
  INSTANT_COOP_GAME_MODE,
  resolveStartSettingsForSubmit,
  resolveLastRoomRejoinOutcome,
} from "./onlineBattleStartSettings.js";
// 【2026-08-30新設、本人指示：19-3章「一瞬バトル」】歌詞クイズと同じ理由・同じ一方向依存で、
// 一瞬バトルの対戦中画面（「もう一度聞く」がプレイヤーごとに独立、という既存の共有クイズ画面
// には無い挙動）だけを専用ファイルへ委譲する。ただし進行モデル自体はタイムアタック等と同じ
// 独立進行のため、待機画面・結果画面はこのファイルの既存の仕組み（finishOnlineBattleMatch・
// reportOnlineBattleProgress）をそのまま使う。
import { enterOnlineInstantBattlePlay, resetOnlineInstantBattleState, getTargetQuestionCount as getInstantBattleTargetQuestionCount } from "./onlineInstantBattleScreen.js";
// 【2026-08-31新設、本人指示：19-3章「一瞬協力」】歌詞クイズと全く同じ理由・同じ一方向依存で、
// 全員同期進行のこのモードを専用ファイルへ委譲する（待機画面・結果画面も専用、一瞬バトルとは違う）。
import {
  renderInstantCoopLobbySettings,
  enterInstantCoopBattlePlay,
  enterInstantCoopResult,
  handleInstantCoopRoomUpdate,
  resetInstantCoopBattleState,
} from "./onlineInstantCoopBattleScreen.js";
// 【2026-08-08新設】出題する曲をホストが選べる機能。曲の一覧・選択UI自体は3対戦モード共通の
// 別画面（js/onlineBattleSongPicker.js）に任せ、このファイルは「今の選択曲id配列」を
// 保持し、settings.questionSourceへ変換するだけに専念する（gameModeを問わない設計）。
import { openOnlineBattleSongPicker } from "./onlineBattleSongPicker.js";
import { openOnlineBattlePlaylistPicker } from "./onlineBattlePlaylistPicker.js";
// 【2026-08-28新設】お気に入り／プレイリストで選んだ曲を、全曲一覧へ進む前にまず
// 確認できる共有モーダル。js/onlineLyricsQuizBattleScreen.js側でも同じ部品を使う
// （gameModeを問わない共通UIのため、js/onlineBattleSongPicker.js等と同じ階層に置く）。
import { openOnlineBattleSongListConfirm } from "./onlineBattleSongListConfirmModal.js";
import { QUESTION_SOURCE_TYPE, sanitizeSongIds } from "./questionSource.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { savePlayHistoryEntryIfNew } from "./playHistory.js";
// 【2026-08-26新設・2026-08-27拡張】オンライン対戦の共通曲（intersection）判定のため、
// ロビーに入るたびに「この端末が実際に持っている曲」（音源・歌詞の両方）をルームへ
// 報告する。対戦開始直前の絞り込み自体はjs/onlineBattle.jsのstartBattle()側が担当するが、
// ロビー画面ではさらに「今この瞬間の参加者全員に共通する曲」をリアルタイムに見積もり、
// ①曲選択画面に出す一覧の絞り込み、②共通曲数の表示、に使う（本人指示：参加者の
// 入退室のたびに自動で再計算されること）。このファイルはgameModeの中身を知らない、
// という既存の方針どおり、絞り込みの種類（音源／歌詞）はjs/battleModes/index.jsの
// getAvailabilityKind()に一元的に委ねる。
import { getAvailableSongIds, AVAILABLE_DATA_KIND } from "./availableSongs.js";
import { reportMyAvailableSongIdsForKind, computeRoomCommonSongPool } from "./onlineBattleSongAvailability.js";
// 【2026-08-27新設】共同選曲（参加者全員がお気に入り・プレイリストから曲を選び、
// 全員の選択の和集合を実際の出題対象にする機能）。判定ロジック（和集合の計算）は
// js/onlineBattleCollaborativeSelectionPayloads.jsへ分離されている
// （js/onlineBattleCollaborativeSelection.js冒頭コメント参照）。
import {
  reportMySelectedSongIds,
  computeMergedSelectedSongIds,
  areSongIdSetsEqual,
} from "./onlineBattleCollaborativeSelection.js";
// 【2026-08-28新設】ルームが消える（ホストが退出した等）タイミングで、対戦中の問題音源が
// 止まらずに鳴り続けてしまう不具合の修正。resetOnlineBattleMatchState()は「今の試合の文脈から
// 離れるタイミングでは必ず通す」共通の後片付け関数（このファイル冒頭コメント参照）なので、
// ここに一度だけstopAudio()を足せば、全ての離脱経路（自分から退出／ルーム消滅／再戦）を
// 個別に直さなくても一括でカバーできる（本人指示：クリーンアップ処理を複数箇所に散らばらせない）。
import { stopAudio, attemptSilentUnlock } from "./audio.js";

let elements = null;
let currentRoomId = null;
let unsubscribeRoom = null;

// Step2：対戦設定・準備完了・カウントダウンまわりの状態。
let lastHandledRoomStatus = null; // status変化での自動遷移を、状態が変わった瞬間だけに絞る
let suppressNextReadyChangeNotice = false; // 自分でREADYボタンを押した直後だけ、変更通知を出さない
// 【2026-09-07改訂】以前はlastKnownMyReady（READYの前回値）を見ていたが、READYが設定変更で
// 解除されなくなったため、settingsRevision自体の変化を直接追跡する方式に変更した。
let lastKnownSettingsRevision = null;
let countdownTimerId = null; // カウントダウン表示の更新タイマー（setInterval）
let countdownOffsetUnsubscribe = null; // .info/serverTimeOffsetの購読解除
let hasFinishedCountdownLocally = false; // 自分の端末のカウントダウンが0になったことを表す
let currentGameMode = null; // 今のルームのgameMode（設定変更ハンドラ等、room引数を持たない箇所から参照する）
// 【2026-08-30新設、本人指示】ホスト自動移譲の「一定時間」を判定するための状態。
// 何秒切断が続いたら引き継ぐかは、Rules側で厳密に強制できないため、クライアント側の
// 節度として持たせる（本人指示：横取り防止のため慎重に）。
// 【2026-09-12追加・本人指示：共有クイズエンジンの音源再生失敗対策】タイムアタック・
// ランダム再生・アウトロクイズ対戦で、音源再生失敗時に差し替える予備曲の件数。
// js/instantChallengeScreen.js・js/onlineInstantBattleScreen.jsの同名の値と揃えている。
const AUDIO_FAILURE_RESERVE_SIZE = 3;
const HOST_DISCONNECT_CLAIM_MS = 8000;
// 上のHOST_DISCONNECT_CLAIM_MSより十分短い間隔で定期チェックする（詳細はstartHostDisconnectAutoClaimTimer()参照）。
const HOST_DISCONNECT_CHECK_INTERVAL_MS = 2000;
let hostDisconnectedSinceMs = null;
let lastObservedHostUid = null;
// 【2026-08-30新設、本人指示】自分から「退出する」を押した間だけtrueにする。
// leaveRoom()のFirebase書き込み中にもrenderLobby()（room監視のコールバック）が呼ばれうるため、
// これが無いと自主退出を「キックされた」と誤検知してしまう。
let isLeavingIntentionally = false;
// 【2026-08-06新設】歌詞クイズの対戦設定は、既存のタイムアタック用フォーム
// （readSettingsFromHostForm、online-battle-settings-*という名前のラジオボタン群）とは
// 別物で、ロビーの各設定項目を触るたびにapplyLyricsQuizSettingsChange()が
// 即座にFirebaseへ書き込んでいる（=room.settingsが常に最新）。そのため「対戦を開始する」を
// 押した時点でフォームから読み直す必要が無く、renderLobby()のたびにここへ最新値を
// 控えておくだけでよい。
let currentLyricsQuizSettings = null;
// 【2026-08-30新設】一瞬バトルも歌詞クイズと同じ「変更のたびに即座にFirebaseへ反映」方式
// （下のapplyInstantBattleHostSettingsChangeFromForm参照）のため、同じ理由でrenderLobby()の
// たびに最新値を控えておく。
let currentInstantBattleSettings = null;
// 一瞬協力も一瞬バトルと同じ理由で、renderLobby()のたびに最新値を控えておく。
let currentInstantCoopSettings = null;
// 【2026-08-08新設・2026-08-27全面刷新】以前はホストだけが選べる単一の選択リスト
// （hostSelectedManualSongIds）を、ホストの端末だけがsettings.questionSourceへ
// 書き込む設計だった。本人指示により「ホスト以外の参加者も選曲でき、全員の選択が
// リアルタイムに共有される」共同選曲へ変更したため、以下のように置き換えた：
//   - mySelectedSongIds: 自分（今の端末のプレイヤー）が選んだ曲id。
//     room.players[myUid].selectedSongIdsのローカル反映で、renderLobby()のたびに
//     同期し直す。誰でも自分の分だけをFirebaseへ書き込める
//     （js/onlineBattleCollaborativeSelection.js参照）。
//   - settings.questionSource（type: collaborativeSelection）は、参加者全員の
//     選択の和集合を「今のルーム参加者全員が実際に利用できる曲」で絞り込んだものを
//     ホストの端末だけが書き込む（settings自体はホスト専用書き込みという既存の
//     Firebaseルールをそのまま使い、新しい種類の許可を増やさないための設計）。
//     この同期はrenderLobby()側で、和集合が変化した場合だけ自動的に行われる。
let mySelectedSongIds = [];
// 【2026-08-27新設】最後にrenderLobby()へ渡されたroom（共同選曲ボタン押下時に
// 最新のplayers一覧・settingsを参照するために保持する。renderLobby()はroomが変わる
// たびに必ず呼ばれるため、ここに保持した値が古くなることはない）。
let latestRoom = null;
// 【2026-08-27新設】「今この瞬間、ルームにいる参加者全員が実際に利用できる曲」の集合。
// renderLobby()が呼ばれるたび（＝参加者の入退室・所持データ報告のたびに）再計算する
// （js/onlineBattleSongAvailabilityPayloads.jsのcomputeRoomCommonSongPool参照）。
// 曲選択画面を開く際の絞り込み・共通曲数の表示に使う。
let currentCommonSongPool = new Set();

// Step3：試合の進行・進捗表示・結果まわりの状態。
let currentMatchId = null; // 今参加している試合のID（開始〜結果画面まで保持）
let currentMatchTotalQuestions = 0; // 今の試合の全問題数（進捗表示の分母、buildQuestionsForModeの結果の長さ）

// 【2026-09-07新設・本人指示：ルーム参加者プロフィール】ロビーで参加者の名前をタップした
// ときに呼ぶ。FirebaseのpublicProfiles/{uid}を1件だけ読み、簡易プロフィールモーダルに
// 表示する（表示名・推し・獲得済み称号のみ。READY等の参加状態は一切変更しない読み取り専用）。
// 呼び出し中に別の参加者を連続でタップされても、最後にタップした人の結果だけが
// 画面に反映されるよう、リクエストごとに世代番号を振って古い応答を無視する。
let lobbyProfileRequestToken = 0;

async function openLobbyParticipantProfile(player) {
  if (!elements.lobbyProfileModal) return;
  const requestToken = ++lobbyProfileRequestToken;

  elements.lobbyProfileName.textContent = player.name;
  const oshiMember = player.oshiMemberId ? getMemberById(MEMBERS, player.oshiMemberId) : null;
  elements.lobbyProfileOshi.textContent = oshiMember ? `推し：${oshiMember.name}` : "推し：未設定";
  elements.lobbyProfileSwatch.innerHTML = "";
  elements.lobbyProfileSwatch.appendChild(buildOshiSwatch(MEMBERS, player.oshiMemberId, {}));

  elements.lobbyProfileBody.hidden = true;
  elements.lobbyProfileUnavailable.hidden = true;
  elements.lobbyProfileLoading.hidden = false;
  elements.lobbyProfileModal.hidden = false;

  const { profile } = await fetchPublicProfileByUid(player.uid);
  if (requestToken !== lobbyProfileRequestToken) return; // その間に別の参加者がタップされていた

  elements.lobbyProfileLoading.hidden = true;
  if (!profile) {
    elements.lobbyProfileUnavailable.hidden = false;
    return;
  }
  elements.lobbyProfileBody.hidden = false;
  // 【2026-09-08改訂・本人指示】ロビーの簡易プロフィールでは、王冠・ダイヤ等の称号バッジ
  // 装飾は付けず、推しメンカラーの丸だけにする（誰がホストかは既存の「ホスト」表示で
  // 十分伝わるため。スウォッチは開いた時点の{}のまま、ここでは再描画しない）。
  elements.lobbyProfileAchievementCount.textContent = buildAchievementCountText(profile.unlockedAchievementIds);
  elements.lobbyProfileSummary.innerHTML = "";
  elements.lobbyProfileSummary.appendChild(buildFriendAchievementSummary(profile.unlockedAchievementIds));
}

function closeLobbyParticipantProfile() {
  if (!elements.lobbyProfileModal) return;
  elements.lobbyProfileModal.hidden = true;
}

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

// 【2026-09-05新設、本人指示：在席確認システム】接続中（connected）の人の「在席確認中／
// 離席中」バッジを組み立てる。切断中の人・presence未設定（＝在席扱い）の人はnullを返し、
// 何も表示しない（本人指示：この状態はあくまで目安の表示で、対戦の進行には影響させない）。
function buildPresenceBadge(entity) {
  if (!entity.connected) return null;
  if (entity.presence !== "checking" && entity.presence !== "away") return null;

  const badge = document.createElement("span");
  const isChecking = entity.presence === "checking";
  badge.className = `online-lobby-badge ${isChecking ? "online-lobby-badge-presence-checking" : "online-lobby-badge-presence-away"}`;
  badge.textContent = isChecking ? "在席確認中" : "離席中";
  return badge;
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
// 【2026-09-01改訂、本人指示】「ホームへ戻る」はルーム退出ではなく、
// ルームに在籍したままホーム画面を見に行くだけの操作。
// Firebaseのルーム購読（listenToRoom）は止めずに維持することで、
// renderLobby()内の既存のstatusJustChanged自動遷移が働き、
// ホストが「もう一度」「ルーム設定に戻る」を選んだ時にホームにいる
// ゲストも自動的に対応する画面へ引き戻される（完全な退出はresultLeaveButton等の
// 「ルームから退出」操作でのみ行う）。
export function leaveOnlineBattleRoomView() {
  resetOnlineBattleMatchState();
}

// 【2026-09-07新設・本人指示：ルームから退出＝完全離脱】結果画面の「ルームから退出」の
// 実処理本体。歌詞クイズ・一瞬協力の各結果画面（このファイルをimportしない設計のため、
// js/main.jsのonLeaveRoomCompletelyコールバック経由で呼ばれる）とも共有する、
// 唯一の「完全退出」ロジック。既存のロビー退出ボタンと同じ
// isLeavingIntentionally→leaveRoom()完了を待つ→stopListeningToRoom()の順を守る。
export async function leaveOnlineBattleRoomCompletely() {
  if (!currentRoomId) return;
  isLeavingIntentionally = true;
  await leaveRoom({ roomId: currentRoomId });
  stopListeningToRoom();
  currentRoomId = null;
  isLeavingIntentionally = false;
  resetOnlineBattleMatchState();
  renderLastRoomBanner();
}

function stopListeningToRoom() {
  if (unsubscribeRoom) {
    unsubscribeRoom();
    unsubscribeRoom = null;
  }
  stopHostDisconnectAutoClaimTimer();
}

// 【2026-08-30新設、本人指示】ホスト自動移譲の判定を、実際に呼び出す関数本体。
// renderLobby()（room更新のたび）と、下のsetInterval（何も変化が無くても定期的に）の
// 両方から同じ判定を呼べるよう、独立した関数に切り出している（詳しい理由は
// renderLobby()内のコメント参照）。
function checkHostDisconnectAutoClaim(room) {
  if (!room) return;
  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const players = room.players || {};
  if (!isHost && players[myUid] && players[room.host] && players[room.host].connected === false) {
    if (hostDisconnectedSinceMs === null || lastObservedHostUid !== room.host) {
      hostDisconnectedSinceMs = Date.now();
    }
    lastObservedHostUid = room.host;
    if (Date.now() - hostDisconnectedSinceMs >= HOST_DISCONNECT_CLAIM_MS) {
      claimHostIfDisconnected({ roomId: room.roomId });
    }
  } else {
    hostDisconnectedSinceMs = null;
    lastObservedHostUid = room.host;
  }
}

let hostDisconnectAutoClaimTimerId = null;

// 【2026-08-30新設、本人指示】ロビーに入っている間、room側のデータに変化が無くても
// HOST_DISCONNECT_CHECK_INTERVAL_MSごとに「切断してから何秒経ったか」を再確認する。
// latestRoomは、renderLobby()が呼ばれるたびに必ず最新へ更新している（このファイル内、
// renderLobby()参照）ため、ここでは追加のFirebase読み取りを行わずに済む。
function startHostDisconnectAutoClaimTimer() {
  stopHostDisconnectAutoClaimTimer();
  hostDisconnectAutoClaimTimerId = setInterval(() => {
    checkHostDisconnectAutoClaim(latestRoom);
  }, HOST_DISCONNECT_CHECK_INTERVAL_MS);
}

function stopHostDisconnectAutoClaimTimer() {
  if (hostDisconnectAutoClaimTimerId) {
    clearInterval(hostDisconnectAutoClaimTimerId);
    hostDisconnectAutoClaimTimerId = null;
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

// 【2026-09-09新設・本人指示：ロビー専用の詳細説明書】完全版の「遊び方ガイド」とは違い、
// 「今この対戦を始める前に確認する簡易マニュアル」として、現在ロビーで選ばれている設定
// （モード・ルール・出題数・ミスペナルティ）に絞って説明する。本文はgetModeLabel・
// getModeDescription・getRuleDescription（いずれもjs/battleModes/index.js経由で各モードの
// アダプターへ委譲）からその場で組み立てるため、実装が変わっても文言がズレない。
function renderLobbyHelpModal(room) {
  if (!elements.lobbyHelpCurrentSettings) return;
  const gameMode = room.gameMode;
  const settings = room.settings ?? {};

  elements.lobbyHelpCurrentSettings.innerHTML = "";
  const modeHeading = document.createElement("p");
  modeHeading.className = "online-lobby-help-current-mode";
  modeHeading.textContent = `現在のモード：${getModeLabel(gameMode)}`;
  elements.lobbyHelpCurrentSettings.appendChild(modeHeading);

  const modeDescription = document.createElement("p");
  modeDescription.className = "online-lobby-help-current-description";
  modeDescription.textContent = getModeDescription(gameMode);
  elements.lobbyHelpCurrentSettings.appendChild(modeDescription);

  const ruleDescription = getRuleDescription(gameMode, settings);
  if (ruleDescription) {
    const ruleText = document.createElement("p");
    ruleText.className = "battle-rule-description";
    ruleText.textContent = ruleDescription;
    elements.lobbyHelpCurrentSettings.appendChild(ruleText);
  }

  const countLabel = QUESTION_COUNT_LABELS[settings.questionCountValue] ?? settings.questionCountValue;
  if (countLabel) {
    const questionCountText = document.createElement("p");
    questionCountText.className = "online-lobby-help-current-description";
    questionCountText.textContent = `出題数：${countLabel}`;
    elements.lobbyHelpCurrentSettings.appendChild(questionCountText);
  }

  // ミスペナルティは「ノーマル」ルールを持つモード（イントロ対戦・ランダム再生対戦・
  // アウトロ対戦）だけに存在する設定のため、無い場合は何も表示しない。
  if (settings.rule === "normal" && typeof settings.penaltySeconds === "number") {
    const penaltyText = document.createElement("p");
    penaltyText.className = "online-lobby-help-current-description";
    penaltyText.textContent = `ミスペナルティ：${settings.penaltySeconds}秒`;
    elements.lobbyHelpCurrentSettings.appendChild(penaltyText);
  }

  elements.lobbyHelpModeList.innerHTML = "";
  listAvailableGameModes().forEach((mode) => {
    const item = document.createElement("div");
    item.className = "online-lobby-help-mode-item";
    if (mode.gameMode === gameMode) item.classList.add("is-current");
    const name = document.createElement("p");
    name.className = "online-lobby-help-mode-item-name";
    name.textContent = mode.label;
    const desc = document.createElement("p");
    desc.className = "online-lobby-help-mode-item-description";
    desc.textContent = mode.description;
    item.append(name, desc);
    elements.lobbyHelpModeList.appendChild(item);
  });
}

function openLobbyHelpModal() {
  if (!latestRoom || !elements.lobbyHelpModal) return;
  renderLobbyHelpModal(latestRoom);
  elements.lobbyHelpModal.hidden = false;
}

function closeLobbyHelpModal() {
  if (!elements.lobbyHelpModal) return;
  elements.lobbyHelpModal.hidden = true;
}

// ホスト用の設定フォーム（ラジオボタン群）に、現在ルームに保存されている設定値を反映する。
// リロード直後・他タブでの変更後もrenderLobby()経由で必ず呼ばれる。
//
// 【2026-08-27設計変更】曲そのものの選択は、この関数（ホスト専用フォーム）の責務からは
// 外し、全員（ホスト・参加者共通）が使う共同選曲セクション（updateCollabSongSectionUi）
// へ切り出した。ここでは「全曲から出題／曲を選んで出題」のラジオ自体の状態同期だけを行う。
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

  const isCollaborativeSongSource = settings.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  setChecked("online-battle-settings-song-source", isCollaborativeSongSource ? "manual" : "all");
  // カテゴリは曲を共同選択している間は意味を持たないため隠す（settings.questionSourceがある間、
  // js/battleModes/timeAttackBattleMode.jsがcategoryFilterValueを一切参照しないことと対応させている）。
  elements.lobbySettingsCategoryFieldset.hidden = isCollaborativeSongSource;
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
  // 【2026-08-27変更】「曲を選んで出題」は共同選曲（collaborativeSelection）として保存する。
  // songIdsは、その時点で分かっている「参加者全員の選択の和集合を、今のルーム共通曲で
  // 絞り込んだもの」を入れる（0件でもよい。まだ誰も選んでいない状態を安全に表せるよう、
  // js/battleModes/timeAttackBattleMode.js側でこの型の0件は検証エラーにしないようにしてある）。
  if (songSourceValue === "manual") {
    settings.questionSource = {
      type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION,
      songIds: getMergedRestrictedSongIds(),
    };
  }
  return settings;
}

// ホストの設定フォームの今の内容を検証し、問題なければFirebaseへ反映する
// （設定ラジオの変更から呼ばれる。曲そのものの選択はsyncCollaborativeSongPoolIfHost()が
// 別途、参加者全員の選択が変わるたびに自動的に反映する）。
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

// 【2026-08-30新設、本人指示：19-3章「一瞬バトル」】上のrenderSettingsChips/
// applySettingsToHostForm/readSettingsFromHostFormと同じ考え方だが、一瞬バトルの設定の形
// （questionCountValue・categoryFilterValue・playDurationValue・answerPoolSizeValue）に合わせた
// 専用版。settings.ruleを一切持たないため、既存の関数をそのまま使うと存在しないプロパティ
// （undefined）がチップに出てしまう問題があり、共用せず分けた。
function renderInstantBattleSettingsChips(container, settings) {
  container.innerHTML = "";
  const isManualSongSource = settings.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  const songSourceChip = isManualSongSource
    ? `${settings.questionSource.songIds?.length ?? 0}曲から出題`
    : CATEGORY_LABELS[settings.categoryFilterValue] ?? settings.categoryFilterValue;
  const chips = [
    getModeLabel(INSTANT_BATTLE_GAME_MODE),
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? `${settings.questionCountValue}問`,
    songSourceChip,
    `再生${settings.playDurationValue}秒`,
    settings.answerPoolSizeValue === "all" ? "全曲検索" : `${settings.answerPoolSizeValue}択`,
  ];
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    container.appendChild(chip);
  });
}

function applyInstantBattleSettingsToHostForm(settings) {
  const setChecked = (name, value) => {
    const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  };
  setChecked("online-instant-battle-settings-question-count", settings.questionCountValue);
  setChecked("online-instant-battle-settings-category", settings.categoryFilterValue);
  setChecked("online-instant-battle-settings-play-duration", settings.playDurationValue);
  setChecked("online-instant-battle-settings-answer-pool-size", settings.answerPoolSizeValue);

  const isCollaborativeSongSource = settings.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  setChecked("online-instant-battle-settings-song-source", isCollaborativeSongSource ? "manual" : "all");
  elements.lobbySettingsCategoryFieldsetInstant.hidden = isCollaborativeSongSource;
}

function readInstantBattleSettingsFromHostForm() {
  const songSourceValue =
    document.querySelector('input[name="online-instant-battle-settings-song-source"]:checked')?.value ?? "all";
  const settings = {
    questionCountValue: document.querySelector('input[name="online-instant-battle-settings-question-count"]:checked').value,
    categoryFilterValue: document.querySelector('input[name="online-instant-battle-settings-category"]:checked').value,
    playDurationValue: document.querySelector('input[name="online-instant-battle-settings-play-duration"]:checked').value,
    answerPoolSizeValue: document.querySelector('input[name="online-instant-battle-settings-answer-pool-size"]:checked').value,
  };
  if (songSourceValue === "manual") {
    settings.questionSource = {
      type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION,
      songIds: getMergedRestrictedSongIds(),
    };
  }
  return settings;
}

async function applyInstantBattleHostSettingsChangeFromForm() {
  if (!currentRoomId) return;
  const settings = readInstantBattleSettingsFromHostForm();
  const errorMessage = validateRoomSettings(currentGameMode, settings);
  if (errorMessage) {
    elements.instantBattleSettingsError.textContent = errorMessage;
    elements.instantBattleSettingsError.hidden = false;
    return;
  }
  elements.instantBattleSettingsError.hidden = true;
  await updateRoomSettings({ roomId: currentRoomId, settings });
}

// 【2026-08-27新設】現在分かっている「参加者全員が選んだ曲の和集合」を、今のルーム
// 共通曲（currentCommonSongPool）で絞り込んだ配列を返す。latestRoomが無い
// （まだ一度もrenderLobby()を経ていない）場合は空配列を返す。
function getMergedRestrictedSongIds() {
  if (!latestRoom) return [];
  const merged = computeMergedSelectedSongIds(latestRoom.players || {});
  return merged.filter((songId) => currentCommonSongPool.has(songId));
}

// 【2026-08-27新設】共同選曲セクション（ホスト・参加者共通）の表示を更新する。
// 「今の自分の選択数」「参加者全員を合わせた選択数・実際に使える数」を表示するだけの
// 表示専用関数（Firebaseへは一切書き込まない）。
function updateCollabSongSectionUi(room, isLyricsQuiz) {
  const isCollaborative =
    !isLyricsQuiz && room.settings?.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  elements.collabSongSection.hidden = !isCollaborative;
  if (!isCollaborative) return;

  const merged = computeMergedSelectedSongIds(room.players || {});
  const restrictedCount = merged.filter((songId) => currentCommonSongPool.has(songId)).length;
  elements.collabMyCount.textContent = `自分が選んだ曲: ${mySelectedSongIds.length}曲`;
  elements.collabTotalCount.textContent =
    merged.length === 0
      ? "まだ誰も曲を選んでいません。下のボタンから選んでください。"
      : `参加者全員の選択を合わせて${merged.length}曲（このうち${restrictedCount}曲がこの対戦で使えます）`;
}

// 【2026-08-27新設・ホスト専用】参加者全員の選択（players/*/selectedSongIds）の和集合を
// 今のルーム共通曲で絞り込んだ結果が、今settingsに保存されている内容と変わっていれば、
// ホストの端末から新しい内容をFirebaseへ書き込む。
//
// 【設計の要点：なぜホストだけが書き込むか】settings自体は既存のFirebaseルールで
// 「ホストだけが書き込める」フィールドのため、新しい種類の許可（誰でもsettingsを
// 書き換えられる、という広い許可）を増やさずに済むよう、各参加者は自分のselectedSongIds
// （players/{uid}配下、本人だけが書き込める）を更新するだけにし、それらを合算して
// settingsへ反映する役目はホストの端末に一本化した。ホストの端末は全参加者のplayersを
// 既にリアルタイム購読しているため、renderLobby()のたびにこの関数を呼ぶだけで
// 「参加者の誰かが選曲を変えるたびに自動的に反映される」動作が実現できる。
//
// 【settingsRevisionが上がりREADYがリセットされることについて】updateRoomSettings()は
// 呼ばれるたびに非ホスト全員のreadyをfalseへ戻す（既存の仕様）。選曲内容が変わった
// 場合に準備完了を解除するのは安全側の挙動として本人が望んだ動作のため、そのまま利用する。
async function syncCollaborativeSongPoolIfHost(room, isHost, isLyricsQuiz) {
  if (!isHost || isLyricsQuiz) return;
  const settings = room.settings;
  if (settings.questionSource?.type !== QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION) return;

  const merged = computeMergedSelectedSongIds(room.players || {});
  const restricted = merged.filter((songId) => currentCommonSongPool.has(songId));
  const currentSongIds = settings.questionSource.songIds ?? [];
  if (areSongIdSetsEqual(restricted, currentSongIds)) return;

  await updateRoomSettings({
    roomId: room.roomId,
    settings: { ...settings, questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: restricted } },
  });
}

// 曲選択画面を開く（新規に選ぶ場合・すでに選んだ内容を編集する場合の両方で使う）。
// ホスト・参加者を問わず、誰でも「自分の選択」を編集できる（本人指示：全員で共同選曲する）。
// initialSongIds省略時は今の自分の選択（mySelectedSongIds）をそのまま引き継ぐ。
// お気に入り・プレイリストから選んだ場合は、その時点の曲id配列を渡す
// （呼び出し側が既にcurrentCommonSongPoolとの共通部分へ絞り込み済みの前提）。
//
// 【2026-08-27重要】initialSongIdsはcurrentCommonSongPoolでフィルタしてから渡す。
// js/onlineBattleSongPicker.jsのapplyCheckedState()は、一覧に表示されない
// （＝isSongEligibleで除外された）曲idも内部の選択状態にはそのまま残してしまうため、
// ここで先に絞っておかないと、参加者の入れ替わりで一覧から消えた曲が「決定」を押した
// 瞬間に復活してしまう事故につながる。
function openCollabSongPicker(initialSongIds) {
  const songIdsToShow = sanitizeSongIds(
    (initialSongIds ?? mySelectedSongIds).filter((songId) => currentCommonSongPool.has(songId))
  );
  openOnlineBattleSongPicker(
    songIdsToShow,
    async (songIds) => {
      mySelectedSongIds = songIds;
      elements.navigateTo("onlineBattleLobby");
      await submitMySelectedSongIds(songIds);
    },
    () => {
      elements.navigateTo("onlineBattleLobby");
    },
    // 【2026-08-27新設】一覧に出す曲そのものを、今のルーム参加者全員が利用できる曲だけに
    // 絞り込む（本人指示：問題・選択肢だけでなく曲指定画面でも選べないようにする）。
    (song) => currentCommonSongPool.has(song.id)
  );
}

// 【2026-08-28新設】「お気に入りから選ぶ」「プレイリストから選ぶ」で、いきなり全曲一覧を
// 開くのではなく、まずその曲だけを確認できる共通モーダル（js/onlineBattleSongListConfirmModal.js）
// を挟む（本人指示：「お気に入りから選ばれている曲はこの曲です」と分かりやすく確認できるように）。
// 「この曲で決定する」は今の画面（ロビー）のまま確定・送信し、「＋ほかの曲も追加する」は
// 既存の全曲選択画面をこの曲を初期選択状態にして開く（＝以前の挙動と同じ入口へ合流する）。
function openSongListConfirm(title, subtitle, songIds) {
  openOnlineBattleSongListConfirm({
    title,
    subtitle,
    songIds,
    onConfirm: async () => {
      mySelectedSongIds = songIds;
      await submitMySelectedSongIds(songIds);
    },
    onAddMore: () => {
      openCollabSongPicker(songIds);
    },
  });
}

// 【2026-08-27新設】自分の選択曲一覧を、今いるルームの自分の参加者エントリへ書き込む。
// 失敗した場合（本番のFirebaseルールがまだselectedSongIdsを許可していない等）は、
// 他の所持データ報告と違って画面へエラーを表示する（「選んだのに反映されない」という
// 分かりにくい状態を利用者に見せないため）。
async function submitMySelectedSongIds(songIds) {
  if (!currentRoomId) return;
  try {
    await reportMySelectedSongIds({ roomId: currentRoomId, songIds });
    elements.lobbyStartError.hidden = true;
  } catch {
    elements.lobbyStartError.textContent =
      "曲の選択を保存できませんでした。アプリの更新状況をご確認のうえ、もう一度お試しください。";
    elements.lobbyStartError.hidden = false;
  }
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
  const nonHostPlayers = Object.entries(players).filter(([uid]) => uid !== room.host);
  // 【2026-09-07改訂・本人指示：READY状態をルール変更で解除しない】js/onlineBattle.jsの
  // startBattle()と同じ理由でrevision一致条件を外した（詳しいコメントはそちら参照）。
  const isPlayerReady = (player) => !!player.ready;
  // 【2026-09-03改訂、本人指示：大型改修】以前は非ホストが1人もいなければ「参加者が来るのを
  // 待っています」で開始不可にしていたが、1人ルーム（友達が来るまで1人で遊ぶ）の正式対応に
  // 伴い、非ホストが0人の場合は待つ相手がいないため開始できるようにした
  // （js/onlineBattle.jsのstartBattle()側のallReady判定と揃えている）。
  const allReady = nonHostPlayers.length === 0 || nonHostPlayers.every(([, player]) => isPlayerReady(player));

  elements.lobbyStartButton.disabled = !isWaiting || !allReady;

  if (!isWaiting) {
    // 通常はstatusがwaitingでなくなった瞬間に画面遷移でロビーを離れるため、ここに来るのは
    // 遷移の合間の一瞬程度のはずだが、念のため「開始できます」等の案内は一切出さない。
    elements.lobbyStartHint.textContent = "";
  } else if (nonHostPlayers.length === 0) {
    elements.lobbyStartHint.textContent = "1人で対戦を開始できます（あとから友達を招待することもできます）。";
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
  // 【2026-08-30新設、本人指示：19-3章「一瞬バトル」】一瞬バトルは、進行モデル自体は
  // このファイルの独立進行と同じだが、「もう一度聞く」の独立カウント等、既存の共有クイズ画面
  // には無い挙動が必要なため専用画面へ委譲する（歌詞クイズと違い、progress/resultsは
  // このファイルの既存の仕組み〈initializeMyMatchProgress等〉をそのまま使う）。
  if (room.gameMode === INSTANT_BATTLE_GAME_MODE) {
    currentMatchId = room.activeMatchId;
    initializeMyMatchProgress({ roomId: room.roomId, matchId: currentMatchId });
    enterOnlineInstantBattlePlay(room);
    // 【2026-09-09修正・本人指示：プレイ履歴の完成】このモードは自前のquestions配列
    // （予備曲を含む）を持つため、実際の出題数をenterOnlineInstantBattlePlay()の直後に
    // 取得する（このファイル自身のbuildQuestionsForMode()は呼ばないため、通常のパス
    // 〈下記〉が行うcurrentMatchTotalQuestionsの更新をここで代わりに行う）。
    currentMatchTotalQuestions = getInstantBattleTargetQuestionCount();
    return;
  }
  // 【2026-08-31新設、本人指示：19-3章「一瞬協力」】歌詞クイズと同じ理由で、progress/results
  // （このファイルのcurrentMatchIdに紐づく既存の仕組み）は一切使わない専用画面へ委譲する。
  if (room.gameMode === INSTANT_COOP_GAME_MODE) {
    enterInstantCoopBattlePlay(room);
    return;
  }

  currentMatchId = room.activeMatchId;
  // 【2026-09-12追加・本人指示：共有クイズエンジンの音源再生失敗対策】タイムアタック・
  // ランダム再生・アウトロクイズ対戦は、一瞬バトル等と同じくAUDIO_FAILURE_RESERVE_SIZE件の
  // 予備曲を確保しておく（js/main.jsのbeginOnlineBattlePlay()が実際の曲配列と予備曲を
  // isReserveで仕分ける）。currentMatchTotalQuestionsは予備を除いた実際の出題数のまま。
  const questions = buildQuestionsForMode(room.gameMode, room.settings, room.seed, AUDIO_FAILURE_RESERVE_SIZE);
  currentMatchTotalQuestions = questions.filter((question) => !question.isReserve).length;

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

  // カウントダウン音（2026-08-10新設）。100msごとのポーリングそのものではなく、
  // 表示する数字が実際に変わった瞬間だけ鳴らす（tick関数のクロージャ内に持たせることで、
  // 再戦などでgoToCountdownScreen()が再度呼ばれるたびに自然にリセットされる）。
  let lastCountdownDisplayValue = null;

  const tick = () => {
    const nowServerTime = Date.now() + serverTimeOffset;
    const msRemaining = targetServerTime - nowServerTime;

    if (msRemaining <= 0) {
      if (lastCountdownDisplayValue !== "START!") {
        lastCountdownDisplayValue = "START!";
        playSfx(SFX_EVENTS.COUNTDOWN_FINAL);
      }
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
    const secondsRemaining = String(Math.ceil(msRemaining / 1000));
    if (secondsRemaining !== lastCountdownDisplayValue) {
      lastCountdownDisplayValue = secondsRemaining;
      playSfx(SFX_EVENTS.COUNTDOWN_TICK);
    }
    elements.countdownNumber.textContent = secondsRemaining;
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
  // 対戦中の問題音源が、退出・ルーム消滅・再戦などのタイミングで鳴り続けたままにならないよう、
  // ここで確実に止める（既に止まっている場合も安全に呼べる、js/audio.js側の設計どおり）。
  stopAudio();
  // 一瞬バトル専用画面（js/onlineInstantBattleScreen.js）が持つ問題・回答・再視聴回数等の
  // 状態も、離脱・ルーム消滅・再戦のたびに必ずリセットする（次のルーム・次の試合へ
  // 誤って引き継がないため）。
  resetOnlineInstantBattleState();
  // 一瞬協力専用画面（js/onlineInstantCoopBattleScreen.js）が持つホストの進行ミラー等も同様。
  resetInstantCoopBattleState();
  currentMatchId = null;
  currentMatchTotalQuestions = 0;
  pendingFinishResult = null;
  if (elements.quizProgressStrip) elements.quizProgressStrip.hidden = true;
  // ルームを離れる際は必ずリセットする。前のルームの選択曲を次のルームへ誤って
  // 引き継いでしまう事故を防ぐため。
  mySelectedSongIds = [];
  latestRoom = null;
}

// 【2026-08-27新設】参加者全員が実際に利用できる共通曲の数を、必要なときだけ知らせる。
// 全員がすべて持っている（＝絞り込みが発生していない）ときは、いつもと同じ表示のままで
// よいため何も出さない（本人指示：制限が発生している場合だけ分かればよい）。
// 0曲のときは「対戦を開始できない」ことがひと目で分かる強い表示にする。
function renderCommonSongNotice(allEligibleCount, commonCount) {
  if (commonCount >= allEligibleCount) {
    elements.lobbyCommonSongNotice.hidden = true;
    elements.lobbyCommonSongNotice.classList.remove("is-empty");
    return;
  }
  elements.lobbyCommonSongNotice.hidden = false;
  if (commonCount === 0) {
    elements.lobbyCommonSongNotice.classList.add("is-empty");
    elements.lobbyCommonSongNotice.textContent =
      "⚠️参加者全員が利用できる共通曲がありません。データパックの導入状況をご確認ください。";
  } else {
    elements.lobbyCommonSongNotice.classList.remove("is-empty");
    elements.lobbyCommonSongNotice.textContent = `現在、参加者全員が利用できる共通曲は${commonCount}曲です（${allEligibleCount}曲中）。`;
  }
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
  } else if (room.gameMode === INSTANT_BATTLE_GAME_MODE) {
    currentInstantBattleSettings = room.settings;
  } else if (room.gameMode === INSTANT_COOP_GAME_MODE) {
    currentInstantCoopSettings = room.settings;
  }

  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const settings = room.settings;
  const players = room.players || {};

  // 【2026-08-30新設、本人指示】キック検知：自分の意思で退出した場合を除き、
  // ルームはまだ存在するのに自分がplayersから消えていたら「ホストにキックされた」と判断し、
  // ロビーから退出させて理由が分かる案内を出す（同じルームコードで入り直せば再参加できる）。
  // isLeavingIntentionallyは、自分から「退出する」を押した場合だけtrueになるフラグ
  // （leaveRoom()のFirebase書き込み中にもこのrenderLobby()が呼ばれうるため、
  // 自主退出とキックを区別するために必要）。
  if (!players[myUid] && !isLeavingIntentionally) {
    stopListeningToRoom();
    stopCountdownWatching();
    currentRoomId = null;
    clearLastRoom();
    renderLastRoomBanner();
    elements.entryKickedNotice.hidden = false;
    elements.navigateTo("onlineBattleEntry");
    return;
  }

  // 【2026-08-30新設、本人指示】表示バッジ（players/{自分}/isHost）を、実際の権限
  // （room.host）に合わせて自分で書き直す（js/onlineBattle.jsのsyncMyHostBadge参照。
  // ホスト移譲は他人のisHostを直接書き換えられないため、各端末が自分の分だけ直す設計）。
  if (players[myUid] && players[myUid].isHost !== isHost) {
    syncMyHostBadge({ roomId: room.roomId, isHost });
  }

  // 【2026-08-27新設】共同選曲ボタン押下時・自動同期時に最新のroomを参照できるよう保持する。
  // 【2026-08-30改訂】ホスト自動移譲の定期チェック（checkHostDisconnectAutoClaim、下記）でも
  // 「今のroomの中身」を参照するために使うため、判定より前に更新しておく。
  latestRoom = room;

  // 【2026-08-30新設、本人指示】ホスト自動移譲：現ホストが一定時間（HOST_DISCONNECT_CLAIM_MS）
  // 切断したままなら、ルームに残っている自分がホスト権限を引き継ぐ。この判定自体は
  // checkHostDisconnectAutoClaim()（下記、setIntervalで定期的にも呼ばれる）に切り出した。
  // 【なぜrenderLobby()の中だけでは不十分か】room側のデータが何も変化しなければ
  // onValue()のコールバックは再度呼ばれないため、「切断からちょうど8秒経過した瞬間」を
  // renderLobby()の呼び出しだけで検知できるとは限らない（他に何のイベントも起きなければ、
  // 8秒経過を知るきっかけ自体が無い）。そのため、goToLobby()で開始する定期タイマー
  // （HOST_DISCONNECT_CHECK_INTERVAL_MS間隔）と、room更新のたびに呼ばれるこのrenderLobby()の
  // 両方からcheckHostDisconnectAutoClaim()を呼ぶ二重の仕組みにしている。
  checkHostDisconnectAutoClaim(room);
  // 自分の選択曲一覧を、room.players側の値へ常に合わせておく（リロード直後・他タブでの
  // 変更後もここで復元される）。
  mySelectedSongIds = Array.isArray(players[myUid]?.selectedSongIds) ? players[myUid].selectedSongIds : [];

  // 【2026-08-27新設】「今この瞬間、ルームにいる参加者全員が実際に利用できる曲」を
  // 再計算する。renderLobby()はplayersが変わるたび（入退室・所持データ報告のたび）に
  // 呼ばれるため、ここで計算し直すだけで「その場で自動的に再計算される」という
  // 本人指示を満たせる（Firebaseへの追加の読み取りは不要。room.players自体に
  // 各参加者のavailableAudioSongIds/availableLyricsSongIdsが同期済みのため）。
  // 歌詞クイズ対戦（availabilityKind: "lyrics"）も含め、全gameModeで同じ考え方を使う。
  const allEligibleSongIds = resolveAllEligibleSongIdsForMode(room.gameMode);
  currentCommonSongPool = new Set(
    computeRoomCommonSongPool({ allEligibleSongIds, players, kind: getAvailabilityKind(room.gameMode) })
  );
  renderCommonSongNotice(allEligibleSongIds.length, currentCommonSongPool.size);

  // 状態遷移の検知は、後続の描画判定（設定変更通知の抑制など）でも使うため先に行っておく。
  const previousStatus = lastHandledRoomStatus;
  const statusJustChanged = room.status !== previousStatus;
  // ホストが「ルーム設定に戻る」を選んだ結果のREADYリセットでは、既存の「設定が変更されました」
  // 通知（本来は設定変更によるREADY解除用）を誤って出さないよう、別扱いにする。
  // 【2026-09-05改訂、本人指示】以前はresultからの遷移だけを見ていたが、「対戦中にホストが
  // ルーム設定へ戻れるようにしてほしい」という要望を受け、countdown・playing中からの
  // 復帰（returnRoomToLobby()）も同じ扱いにする。
  const isReturnedToLobby =
    statusJustChanged &&
    room.status === ROOM_STATUS.WAITING &&
    (previousStatus === ROOM_STATUS.RESULT || previousStatus === ROOM_STATUS.COUNTDOWN || previousStatus === ROOM_STATUS.PLAYING);
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

    // 【2026-09-07新設・本人指示：ルーム参加者プロフィール】名前をタップすると、その人の
    // 簡易プロフィール（表示名・推し・獲得済み称号）をモーダルで見られる。READY等の
    // 参加状態には一切触れない、読み取り専用の操作。
    const name = document.createElement("button");
    name.type = "button";
    name.className = "online-lobby-player-name online-lobby-player-name-button";
    name.textContent = player.name + (player.uid === myUid ? "（あなた）" : "");
    name.addEventListener("click", () => openLobbyParticipantProfile(player));
    row.appendChild(name);

    // 【2026-08-30改訂・本人指示】「ホスト」バッジは、実際の権限（room.host）を正として
    // 判定する。player.isHostは各自が自分の分だけ書き直す表示専用フィールドのため、
    // ホスト移譲直後の一瞬だけズレる可能性がある（js/onlineBattle.jsのsyncMyHostBadge参照）。
    const isPlayerHost = player.uid === room.host;
    const badges = document.createElement("span");
    badges.className = "online-lobby-player-badges";
    if (isPlayerHost) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "online-lobby-badge online-lobby-badge-host";
      hostBadge.textContent = "ホスト";
      badges.appendChild(hostBadge);
    }
    if (!isPlayerHost) {
      // 【2026-09-07改訂・本人指示：READY状態をルール変更で解除しない】revision一致条件を
      // 外した（js/onlineBattle.jsのstartBattle()と同じ理由）。
      const isPlayerReady = !!player.ready;
      const readyBadge = document.createElement("span");
      readyBadge.className = `online-lobby-badge ${isPlayerReady ? "online-lobby-badge-connected" : "online-lobby-badge-disconnected"}`;
      readyBadge.textContent = isPlayerReady ? "準備完了" : "未準備";
      badges.appendChild(readyBadge);
    }
    const connectionBadge = document.createElement("span");
    connectionBadge.className = `online-lobby-badge ${player.connected ? "online-lobby-badge-connected" : "online-lobby-badge-disconnected"}`;
    connectionBadge.textContent = player.connected ? "接続中" : "切断中";
    badges.appendChild(connectionBadge);

    // 【2026-09-05新設、本人指示：在席確認システム】接続はしているが操作していない人を、
    // 「切断中」とは別に区別して表示する（js/onlineBattlePresence.js参照）。
    // 切断中の人にはこのバッジを重ねて出さない（「切断中」だけで十分伝わるため）。
    const presenceBadge = buildPresenceBadge(player);
    if (presenceBadge) badges.appendChild(presenceBadge);

    row.appendChild(badges);

    // 【2026-08-30新設、本人指示】ホストだけに見える、待機中だけの「キック」「ホストを渡す」
    // ボタン。自分自身の行・現ホストの行には出さない。
    if (isHost && !isPlayerHost && player.uid !== myUid && room.status === ROOM_STATUS.WAITING) {
      const actions = document.createElement("span");
      actions.className = "online-lobby-player-actions";

      const transferButton = document.createElement("button");
      transferButton.type = "button";
      transferButton.className = "online-lobby-mini-button";
      transferButton.textContent = "ホストを渡す";
      transferButton.dataset.transferHostUid = player.uid;
      transferButton.dataset.transferHostName = player.name;
      actions.appendChild(transferButton);

      const kickButton = document.createElement("button");
      kickButton.type = "button";
      kickButton.className = "online-lobby-mini-button online-lobby-mini-button-danger";
      kickButton.textContent = "キック";
      kickButton.dataset.kickUid = player.uid;
      kickButton.dataset.kickName = player.name;
      actions.appendChild(kickButton);

      row.appendChild(actions);
    }

    elements.lobbyPlayerList.appendChild(row);
  });

  // 【2026-08-30新設、本人指示】ホスト専用のモード変更UIは、待機中だけ表示する
  // （試合中はFirebase Rules側でも書き込みを拒否するため、UI側でも先に隠しておく）。
  elements.lobbyModeChange.hidden = !isHost || room.status !== ROOM_STATUS.WAITING;
  if (!elements.lobbyModeChange.hidden) {
    const modeRadio = document.querySelector(
      `input[name="online-battle-lobby-mode-change-select"][value="${room.gameMode}"]`
    );
    if (modeRadio) modeRadio.checked = true;
  }

  elements.lobbyPlayerCount.textContent = `${playerList.length}人 / 最大${room.maxPlayers}人`;

  // ===== Step2：対戦設定・準備完了・開始 =====
  const isLyricsQuiz = room.gameMode === LYRICS_QUIZ_GAME_MODE;
  const isInstantBattle = room.gameMode === INSTANT_BATTLE_GAME_MODE;
  const isInstantCoop = room.gameMode === INSTANT_COOP_GAME_MODE;
  // 歌詞クイズ・一瞬バトル・一瞬協力は設定の形自体が別物のため、既存の設定コンテナ
  // （timeAttack/randomPlayback/outroQuiz用の固定ラジオ群）は隠し、それぞれ専用のコンテナへ
  // 描画を委譲する。
  elements.lobbySettingsHost.hidden = !isHost || isLyricsQuiz || isInstantBattle || isInstantCoop;
  elements.lobbySettingsParticipant.hidden = isHost || isLyricsQuiz || isInstantBattle || isInstantCoop;
  elements.lobbySettingsHostInstant.hidden = !isHost || !isInstantBattle;
  elements.lobbySettingsParticipantInstant.hidden = isHost || !isInstantBattle;
  elements.lobbySettingsHostCoop.hidden = !isHost || !isInstantCoop;
  elements.lobbySettingsParticipantCoop.hidden = isHost || !isInstantCoop;
  // 【2026-08-31発見・修正】歌詞クイズ以外のgameModeのときは、歌詞クイズ専用の設定
  // セクションを明示的に隠す（renderLyricsQuizLobbySettings()はisLyricsQuizのときしか
  // 呼ばれず、それ自身に任せると「歌詞クイズ→別モード」の切り替え時に隠す機会が無いため）。
  elements.lobbySettingsHostLyrics.hidden = !isHost || !isLyricsQuiz;
  elements.lobbySettingsParticipantLyrics.hidden = isHost || !isLyricsQuiz;
  elements.lobbyReadyButton.hidden = isHost;
  elements.lobbyStartButton.hidden = !isHost;
  elements.lobbyStartHint.hidden = !isHost;

  if (isHost) {
    if (isLyricsQuiz) {
      renderLyricsQuizLobbySettings(room, true);
    } else if (isInstantBattle) {
      applyInstantBattleSettingsToHostForm(settings);
    } else if (isInstantCoop) {
      renderInstantCoopLobbySettings(room, true);
    } else {
      applySettingsToHostForm(settings);
    }
    updateStartButton(room);
  } else {
    if (isLyricsQuiz) {
      renderLyricsQuizLobbySettings(room, false);
    } else if (isInstantBattle) {
      renderInstantBattleSettingsChips(elements.instantBattleSettingsSummary, settings);
    } else if (isInstantCoop) {
      renderInstantCoopLobbySettings(room, false);
    } else {
      renderSettingsChips(elements.lobbySettingsSummary, settings, room.gameMode);
    }

    const myPlayer = players[myUid];
    // 【2026-09-07改訂・本人指示：READY状態をルール変更で解除しない】revision一致条件を
    // 外した（js/onlineBattle.jsのstartBattle()と同じ理由）。
    const myReady = Boolean(myPlayer?.ready);
    updateReadyButton(myReady);

    // 【2026-09-07改訂】以前はREADYがtrue→falseへ変わった瞬間（＝設定変更でリセットされた
    // 瞬間）を「設定が変更されました」通知のトリガーにしていたが、READYを設定変更で
    // 解除しなくなったため、この変化はもう起きない。代わりにsettingsRevision自体の変化を
    // 直接見る（READY状態とは無関係に、設定が変わったこと自体を知らせる通知のため）。
    const currentSettingsRevision = room.settingsRevision ?? 0;
    if (isReturnedToLobby) {
      // ルーム設定への復帰によるREADYリセットは、設定自体は変わっていないため
      // 「設定が変更されました」通知は出さず、代わりに専用の案内を出す。
      elements.lobbySettingsChangedNotice.hidden = true;
      elements.lobbyRematchNotice.hidden = false;
    } else if (
      lastKnownSettingsRevision !== null &&
      currentSettingsRevision !== lastKnownSettingsRevision &&
      !suppressNextReadyChangeNotice
    ) {
      elements.lobbySettingsChangedNotice.hidden = false;
    }
    suppressNextReadyChangeNotice = false;
    lastKnownSettingsRevision = currentSettingsRevision;
  }

  // 【2026-08-27新設】共同選曲：ホスト・参加者を問わず同じ表示を行い、ホストの端末だけが
  // 「参加者全員の選択の和集合」をsettingsへ自動的に反映する（isLyricsQuizのときは
  // js/onlineLyricsQuizBattleScreen.js側の同等の仕組みに任せ、ここでは何もしない）。
  updateCollabSongSectionUi(room, isLyricsQuiz);
  syncCollaborativeSongPoolIfHost(room, isHost, isLyricsQuiz);

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
      } else if (isInstantCoop) {
        enterInstantCoopResult(room);
      } else {
        goToResultScreen(room);
      }
    } else if (isReturnedToLobby) {
      // ホストが「もう一度」以外の操作（ルーム設定に戻る／対戦中断）を選んだ→
      // 全端末（ホスト含む）を自動的にロビーへ戻す。前回の試合に関するローカル状態
      // （progress/results監視の元になるcurrentMatchId、カウントダウンタイマー、
      // 進捗ストリップ、歌詞クイズ・一瞬協力それぞれの進行状態）を確実に後片付けして
      // から遷移する（本人の要望：次の試合を始めたときに前回の画面・データが
      // 混ざらないこと。対戦の途中で呼ばれた場合も同じ後片付けで安全に戻せる）。
      resetOnlineBattleMatchState();
      resetLyricsQuizBattleState();
      elements.navigateTo("onlineBattleLobby");
    }
  }

  updateOnlineBattlePlayUi(room);
  if (isLyricsQuiz) {
    handleLyricsQuizRoomUpdate(room);
  } else if (isInstantCoop) {
    handleInstantCoopRoomUpdate(room);
  }
}

function goToLobby(roomId) {
  currentRoomId = roomId;
  currentGameMode = null;
  currentLyricsQuizSettings = null;
  lastHandledRoomStatus = null;
  suppressNextReadyChangeNotice = false;
  lastKnownSettingsRevision = null;
  hostDisconnectedSinceMs = null;
  lastObservedHostUid = null;
  isLeavingIntentionally = false;
  elements.entryKickedNotice.hidden = true;
  startHostDisconnectAutoClaimTimer();
  resetLyricsQuizBattleState();
  resetOnlineBattleMatchState();
  elements.lobbySettingsChangedNotice.hidden = true;
  elements.lobbyRematchNotice.hidden = true;
  elements.lobbyStartError.hidden = true;
  stopListeningToRoom();
  unsubscribeRoom = listenToRoom(roomId, renderLobby);
  elements.navigateTo("onlineBattleLobby");
  reportMyAvailableSongIdsForRoom(roomId);
}

// 【2026-08-30新設、本人指示：観戦機能】試合中のルームコードを入力した人を、観戦画面へ導く。
// goToLobby()と同じ後片付け・監視の開始パターンだが、renderLobby()ではなく
// renderSpectatorView()を使う（自分はplayersに存在しないため、renderLobby()を
// そのまま使うと「キックされた」判定に誤って引っかかってしまう）。
let currentSpectatorPlayerName = "";
function goToSpectate(roomId, playerName) {
  currentRoomId = roomId;
  currentSpectatorPlayerName = playerName ?? currentSpectatorPlayerName;
  currentGameMode = null;
  currentMatchId = null;
  lastHandledRoomStatus = null;
  stopListeningToRoom();
  unsubscribeRoom = listenToRoom(roomId, renderSpectatorView);
  elements.navigateTo("onlineBattleSpectator");
}

// 観戦中の画面を、roomの最新状態に合わせて描画する。
function renderSpectatorView(room) {
  if (!room) {
    // ルームが無くなった＝試合が終わってホストが退出した等。観戦をやめて入口へ戻す。
    stopListeningToRoom();
    currentRoomId = null;
    elements.navigateTo("onlineBattleEntry");
    return;
  }

  // 【2026-08-30新設、本人指示】次の試合が始まる（status:waiting）タイミングで、
  // 観戦者を正式参加へ自動的に昇格させる（本人指示：「観戦者は次の試合から正式参加できる
  // ようにしてください」）。昇格に成功したら、通常のロビー画面へ切り替える。
  if (room.status === ROOM_STATUS.WAITING) {
    promoteSpectatorToPlayer({ roomId: room.roomId, playerName: currentSpectatorPlayerName }).then((result) => {
      if (result.ok) {
        goToLobby(room.roomId);
      }
      // 失敗した場合（定員超過等）は観戦のまま留まる。次の更新でまた判定し直される。
    });
    return;
  }

  if (room.status === ROOM_STATUS.RESULT) {
    currentMatchId = room.activeMatchId;
    goToResultScreen(room);
    return;
  }

  currentMatchId = room.activeMatchId;
  elements.spectatorGameModeText.textContent = `モード: ${getModeLabel(room.gameMode)}`;
  const players = room.players || {};
  const spectators = room.spectators || {};
  // 【2026-09-02改訂、本人指示：観戦者を別枠にする】以前は「観戦N人 / 最大M人」のように
  // プレイヤーと観戦者が同じ定員を分け合っているかのような表示だったが、実際には別枠の
  // ため、プレイヤー・観戦者それぞれの定員を個別に表示する。
  const maxSpectatorsText = typeof room.maxSpectators === "number" ? room.maxSpectators : DEFAULT_MAX_SPECTATORS;
  elements.spectatorPlayerCount.textContent = `${Object.keys(players).length}人プレイ中（最大${room.maxPlayers}人）・観戦${Object.keys(spectators).length}人（最大${maxSpectatorsText}人）`;

  const rows = getOnlineBattleMatchRows(room);
  elements.spectatorPlayerList.innerHTML = "";
  rows.forEach((row) => {
    const li = document.createElement("li");
    li.className = "online-lobby-player-row";
    const oshiDot = createOshiDotElement(row.oshiMemberId);
    if (oshiDot) li.appendChild(oshiDot);
    const name = document.createElement("span");
    name.className = "online-lobby-player-name";
    name.textContent = row.displayName;
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
      statusBadge.textContent = `${row.answeredCount}問`;
    }
    badges.appendChild(statusBadge);
    li.appendChild(badges);
    elements.spectatorPlayerList.appendChild(li);
  });
}

// 【2026-08-26新設・2026-08-27拡張】この端末が実際に持っている曲一覧（音源・歌詞の両方）を、
// 今入ったルームへ報告する。IndexedDBの読み取りを待たずに画面遷移させたいため、
// goToLobby()からは待ち合わせずに呼び出す（失敗しても致命的ではない設計。
// js/onlineBattleSongAvailability.js参照）。
// 【両方報告する理由】このルームのgameModeが音源基準（イントロ対戦・ランダム再生対戦）か
// 歌詞基準（歌詞クイズ対戦）かをこのファイルは意識しない、という既存方針を保つため、
// gameModeで分岐せず常に両方を報告する（各対戦モードのどちらを実際に使うかは
// js/battleModes/index.jsのgetAvailabilityKind()側の責務）。
async function reportMyAvailableSongIdsForRoom(roomId) {
  const [availableAudioSongIds, availableLyricsSongIds] = await Promise.all([
    getAvailableSongIds(AVAILABLE_DATA_KIND.AUDIO),
    getAvailableSongIds(AVAILABLE_DATA_KIND.LYRICS),
  ]);
  // 報告が完了するまでの間にルームを退出・別ルームへ移動している場合は、もう関係ない
  // 古いルームへ書き込んでしまわないよう、現在のルームと一致するときだけ送信する。
  if (currentRoomId !== roomId) return;
  await reportMyAvailableSongIdsForKind({ roomId, kind: "audio", availableSongIds: availableAudioSongIds });
  await reportMyAvailableSongIdsForKind({ roomId, kind: "lyrics", availableSongIds: availableLyricsSongIds });
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
      presence: livePlayer?.presence, // 【2026-09-05新設】在席確認システム用（下記の描画で使用）
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
      if (!row.connected) return `${base}（切断中）`;
      // 【2026-09-05新設、本人指示：在席確認システム】接続はしているが操作していない人を、
      // 対戦進行への影響なしに、簡易表示のこの一行にも反映する。
      if (row.presence === "away") return `${base}（離席中）`;
      if (row.presence === "checking") return `${base}（在席確認中）`;
      return base;
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

    // 【2026-09-05新設、本人指示：在席確認システム】切断中バッジが出ない（＝接続中の）
    // 未終了プレイヤーにだけ、在席確認中／離席中バッジを追加する。
    if (!row.hasLeft && !row.finished) {
      const presenceBadge = buildPresenceBadge(row);
      if (presenceBadge) badges.appendChild(presenceBadge);
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
    // 【2026-09-05新設、本人指示】対戦中、ホストだけに「ルーム設定へ戻る」を見せる。
    if (elements.quizBackToLobbyButton) {
      elements.quizBackToLobbyButton.hidden = room.host !== myUid;
    }
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

  // 【2026-09-05改訂、本人指示】試合後の選択肢「もう一度」「ルーム設定に戻る」は
  // ホスト専用（対戦設定を書き換えられるのがホストだけという既存の権限設計と揃えている）。
  // 非ホストには代わりに「⌂ホームへ戻る」だけを見せる。
  const isHostOnResultScreen = room.host === myUid;
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  // 【2026-09-07新設・本人指示：ゲスト結果画面】ホスト専用ボタンの代わりに、待機案内＋
  // 「ルームから退出」を見せる。
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;

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
  const finisherRanks = computeFinisherRanks(room.gameMode, finishers, room.settings);

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
    const rank = finisherRanks[index];
    const row = document.createElement("li");
    // 【2026-09-09改訂・本人指示2-6：結果画面のデザイン】1位だけでなく2位・3位も
    // 軽く装飾する（本人指示：「1位は少し特別、2位/3位も軽く装飾」）。
    const rankClass = rank === 1 ? " is-rank-1" : rank === 2 ? " is-rank-2" : rank === 3 ? " is-rank-3" : "";
    row.className = `battle-rank-row${rankClass}`;

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

  // 対戦の勝敗音（2026-08-10新設）。DNF（自分の結果が確定していない）のときは鳴らさない
  // （本人指示：通信結果待ちの前に勝利音を鳴らさない）。1位（同着1位を含む）なら勝利、それ以外は敗北。
  const myFinisherIndex = finishers.findIndex((entry) => entry.uid === myUid);
  if (myFinisherIndex !== -1) {
    playSfx(finisherRanks[myFinisherIndex] === 1 ? SFX_EVENTS.BATTLE_WIN : SFX_EVENTS.BATTLE_LOSE);
  }

  // 【2026-09-12新設・本人指示：結果画面の問題別結果アコーディオンを完成させる】
  // 各参加者が結果送信時に提出したperQuestionSnapshot（js/main.jsのfinishOnlineBattlePlay()・
  // js/onlineInstantBattleScreen.jsのfinishMatch()参照）から、問題別結果を組み立てて表示する。
  // 音源再生失敗の予備曲差し替え等が無かった旧仕様の試合・古いクライアントの相手には
  // perQuestionSnapshotが無いため、その場合はbreakdownが空配列になり、セクションごと隠れる
  // （表示できるデータが無いことを、空白や壊れた表示ではなく「セクション自体が無い」形で扱う）。
  const questionBreakdown = buildSharedEngineQuestionBreakdown({ results, participants, myUid });
  if (elements.resultQuestionBreakdownSection) {
    elements.resultQuestionBreakdownSection.hidden = questionBreakdown.length === 0;
  }
  renderQuestionBreakdownAccordion(elements.resultQuestionBreakdown, questionBreakdown);

  saveOnlineBattleHistoryEntry(room, currentMatchId, finishers, finisherRanks, dnfEntries, myUid, questionBreakdown);
  elements.navigateTo("onlineBattleResult");
}

// 【2026-08-08新設】オンライン対戦（イントロ対戦・ランダム再生対戦）の結果を、統一プレイ履歴
// （js/playHistory.js）へ保存する。id を online:{matchId} にすることで、リロード・再接続・
// 画面再描画でこの結果画面へ何度到達しても、同じ試合が重複して保存されないようにする
// （本人指示の「matchIdによる重複防止」）。DNFで終わった場合も、可能な範囲で記録する
// （順位・スコアは推測で作らず、null・isDnf:trueのままにする）。
// 【2026-09-08修正・本人指示】outroQuizが登録されておらず、タイムアタックとして誤保存
// されていた不具合を修正（本人指示Tのプレイ履歴確認作業で判明）。
// 【2026-09-09修正・本人指示：プレイ履歴の完成】instantBattleが登録されておらず、
// タイムアタックとして誤保存されていた不具合を修正（19-24章のoutroQuizと同じ原因）。
// 一瞬バトルはgoToResultScreen()（このファイルの共有結果画面）をそのまま使う設計のため、
// 専用の結果画面・専用の保存関数を持たず、この対応表に1行足すだけで正しく保存される。
const HISTORY_MODE_ID_BY_GAME_MODE = {
  timeAttack: "onlineTimeAttack",
  randomPlayback: "onlineRandomPlayback",
  outroQuiz: "onlineOutroQuiz",
  instantBattle: "onlineInstantBattle",
};
const HISTORY_MODE_LABEL_BY_GAME_MODE = {
  timeAttack: "オンライン対戦（イントロ）",
  randomPlayback: "オンライン対戦（ランダム再生）",
  outroQuiz: "オンライン対戦（アウトロ）",
  instantBattle: "オンライン対戦（一瞬バトル）",
};

function saveOnlineBattleHistoryEntry(room, matchId, finishers, finisherRanks, dnfEntries, myUid, questionBreakdown = []) {
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
      myRank: isDnf ? null : finisherRanks[myFinisherIndex],
      isDnf,
      participantCount: finishers.length + dnfEntries.length,
      standings: [
        ...finishers.map((entry, index) => ({
          displayName: entry.participant.displayName,
          rank: finisherRanks[index],
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
      // 【2026-09-12新設・本人指示：オンライン履歴詳細も完成させる】結果画面と全く同じデータを
      // そのまま保存しておくことで、あとから履歴詳細を開いたときも
      // js/battleQuestionBreakdownUi.jsの同じ描画関数で問題別結果を表示できるようにする
      // （結果画面と履歴詳細で表示ロジックが2つに分かれてズレることを防ぐ）。
      // 保存件数はcapQuestionBreakdownForStorage()で安全側に切り詰める（js/battleQuestionBreakdown.js参照）。
      questionBreakdown: capQuestionBreakdownForStorage(questionBreakdown),
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

  // 【2026-09-02新設、本人指示：人数拡張】プレイヤー最大人数のセレクトを、
  // MIN_PLAYERS〜MAX_PLAYERSの範囲でその場で組み立てる（選択肢を増やす／減らす際、
  // ここのHTMLを書き換える必要が無いようにするため）。既定値は変更前の既定と同じ2人のまま。
  const maxPlayersSelect = document.getElementById("online-battle-max-players-select");
  for (let count = MIN_PLAYERS; count <= MAX_PLAYERS; count++) {
    const option = document.createElement("option");
    option.value = String(count);
    option.textContent = count === 2 ? "1対1（2人）" : `${count}人対戦`;
    maxPlayersSelect.appendChild(option);
  }
  maxPlayersSelect.value = "2";

  // 2026-08-08修正：ホームの特別モードカードから直接この画面を開くようになったため、
  // 「戻る」は間に古い「特別モード一覧画面」を挟まずホーム画面へ直接戻す。
  elements.entryBackButton.addEventListener("click", () => elements.navigateTo("start"));
  elements.entryCreateButton.addEventListener("click", () => {
    elements.createNameInput.value = getActivePlayer().playerName || "";
    elements.createError.hidden = true;
    if (elements.entryAudioFailureNotice) elements.entryAudioFailureNotice.hidden = true;
    elements.navigateTo("onlineBattleCreate");
  });
  elements.entryJoinButton.addEventListener("click", () => {
    elements.joinNameInput.value = getActivePlayer().playerName || "";
    elements.joinRoomCodeInput.value = "";
    elements.joinError.hidden = true;
    if (elements.entryAudioFailureNotice) elements.entryAudioFailureNotice.hidden = true;
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
    const maxPlayers = Number(document.getElementById("online-battle-max-players-select").value);
    // 【2026-09-03改訂、本人指示：大型改修】ルーム作成前にモードを選ばせるのをやめたため、
    // 常にDEFAULT_GAME_MODE（イントロ対戦）で作成する。モードはロビーの「モードを変更する」
    // （既存のupdateRoomGameMode()）でいつでも選び直せる。

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

    // 【2026-08-30新設、本人指示：観戦機能】試合中（waiting以外）で参加できなかった場合は、
    // エラーで終わらせず、観戦として自動的に加わる（本人指示：「途中から現在の試合へ
    // 競技参加させる必要はない。現在の試合中は観戦として参加させる」）。
    if (!result.ok && result.reason === "not-waiting") {
      const spectateResult = await spectateRoom({ roomId, playerName });
      elements.joinSubmitButton.disabled = false;
      if (!spectateResult.ok) {
        elements.joinError.textContent =
          JOIN_ERROR_MESSAGES[spectateResult.reason] ?? "参加に失敗しました。もう一度お試しください。";
        elements.joinError.hidden = false;
        return;
      }
      elements.joinError.hidden = true;
      goToSpectate(spectateResult.roomId, playerName);
      return;
    }

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

  // 【2026-08-28変更】誤操作防止のため、いきなり退出せず確認モーダルを必ず挟む
  // （本人指示。「はい」で実際の退出処理、「いいえ」でロビーへ戻るだけ）。
  elements.lobbyLeaveButton.addEventListener("click", () => {
    if (!currentRoomId) return;
    elements.lobbyLeaveConfirmModal.hidden = false;
  });
  elements.lobbyLeaveCancelButton.addEventListener("click", () => {
    elements.lobbyLeaveConfirmModal.hidden = true;
  });
  // 背景部分をクリックしたときも閉じる（#quiz-quit-confirm-modal等、他のモーダルと同じ考え方）。
  elements.lobbyLeaveConfirmModal.addEventListener("click", (event) => {
    if (event.target === elements.lobbyLeaveConfirmModal) {
      elements.lobbyLeaveConfirmModal.hidden = true;
    }
  });
  elements.lobbyLeaveConfirmButton.addEventListener("click", async () => {
    elements.lobbyLeaveConfirmModal.hidden = true;
    if (!currentRoomId) return;
    isLeavingIntentionally = true;
    elements.lobbyLeaveButton.disabled = true;
    await leaveRoom({ roomId: currentRoomId });
    elements.lobbyLeaveButton.disabled = false;
    stopListeningToRoom();
    stopCountdownWatching();
    currentRoomId = null;
    isLeavingIntentionally = false;
    renderLastRoomBanner();
    elements.navigateTo("onlineBattleEntry");
  });

  // 【2026-08-30新設、本人指示】ホスト専用：対戦モードそのものの変更。
  // 押すたびに選択肢の折りたたみを開閉するだけの単純なトグル。
  elements.lobbyModeChangeToggle.addEventListener("click", () => {
    elements.lobbyModeChangeFieldset.hidden = !elements.lobbyModeChangeFieldset.hidden;
  });
  elements.lobbyModeChangeConfirmButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    const selected = document.querySelector('input[name="online-battle-lobby-mode-change-select"]:checked');
    if (!selected) return;
    elements.lobbyModeChangeConfirmButton.disabled = true;
    const result = await updateRoomGameMode({ roomId: currentRoomId, gameMode: selected.value });
    elements.lobbyModeChangeConfirmButton.disabled = false;
    if (result.ok) {
      elements.lobbyModeChangeFieldset.hidden = true;
    }
    // 失敗時（通信エラー等）も、renderLobby()が次のroom更新で今の実際のgameModeを
    // 表示し直すため、ここで個別のエラー文言は出さない（他の設定変更と同じ簡潔さを優先）。
  });

  // 【2026-08-30新設、本人指示】ホスト専用：ロビーの参加者行に添えた「キック」「ホストを渡す」
  // ボタンのクリックを、リスト全体への1つのイベント委任で受け取る（renderLobby()側は
  // 行ごとにリスナーを付け外ししない設計にして、再描画のたびの登録漏れ・二重登録を防ぐ）。
  elements.lobbyPlayerList.addEventListener("click", async (event) => {
    const kickButton = event.target.closest("[data-kick-uid]");
    if (kickButton) {
      if (!currentRoomId) return;
      const targetUid = kickButton.dataset.kickUid;
      const targetName = kickButton.dataset.kickName ?? "このプレイヤー";
      if (!window.confirm(`${targetName}さんをルームから退出させますか？`)) return;
      kickButton.disabled = true;
      await kickPlayer({ roomId: currentRoomId, targetUid });
      return;
    }
    const transferButton = event.target.closest("[data-transfer-host-uid]");
    if (transferButton) {
      if (!currentRoomId) return;
      const targetUid = transferButton.dataset.transferHostUid;
      const targetName = transferButton.dataset.transferHostName ?? "このプレイヤー";
      if (!window.confirm(`ホストを${targetName}さんに渡しますか？`)) return;
      transferButton.disabled = true;
      await transferHost({ roomId: currentRoomId, newHostUid: targetUid });
      return;
    }
  });

  // 【2026-08-30新設、本人指示】観戦をやめて入口へ戻る。
  elements.spectatorLeaveButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    elements.spectatorLeaveButton.disabled = true;
    await leaveSpectating({ roomId: currentRoomId });
    elements.spectatorLeaveButton.disabled = false;
    stopListeningToRoom();
    currentRoomId = null;
    elements.navigateTo("onlineBattleEntry");
  });

  // ===== Step2：対戦設定・準備完了・開始 =====

  // ホストが設定ラジオボタンを変更するたびに、Firebaseへ書き込んで全員へ同期する
  // （js/localBattleScreen.jsのupdateSetupRuleHint()と同じ「変更のたびに反映」という考え方）。
  // 【2026-08-27変更】「曲を選んで出題」は、まだ誰も選んでいなくても（0曲でも）
  // collaborativeSelectionとして安全に保存できるようにしてある（js/battleModes/
  // timeAttackBattleMode.js参照）ため、以前のような「曲選択画面を先に開く」特別扱いは
  // 不要になった。ラジオを切り替えた瞬間にsettingsへ反映され、共同選曲セクション
  // （updateCollabSongSectionUi）が全員の画面に現れる。
  document
    .querySelectorAll(
      'input[name="online-battle-settings-question-count"], input[name="online-battle-settings-category"], input[name="online-battle-settings-rule"], input[name="online-battle-settings-penalty"], input[name="online-battle-settings-song-source"]'
    )
    .forEach((radio) => {
      radio.addEventListener("change", async () => {
        if (!currentRoomId) return;
        await applyHostSettingsChangeFromForm();
      });
    });

  // 【2026-08-30新設、本人指示：19-3章「一瞬バトル」】上と全く同じ考え方の、一瞬バトル専用版。
  document
    .querySelectorAll(
      'input[name="online-instant-battle-settings-question-count"], input[name="online-instant-battle-settings-category"], input[name="online-instant-battle-settings-play-duration"], input[name="online-instant-battle-settings-answer-pool-size"], input[name="online-instant-battle-settings-song-source"]'
    )
    .forEach((radio) => {
      radio.addEventListener("change", async () => {
        if (!currentRoomId) return;
        await applyInstantBattleHostSettingsChangeFromForm();
      });
    });

  // 【2026-08-27新設】共同選曲：全曲・お気に入り・プレイリストから選ぶ。ホスト・参加者を
  // 問わず誰でも使える（本人指示：全員で共同選曲できるようにする）。お気に入り・
  // プレイリストは、それぞれ「選んだ曲」と「今のルーム参加者全員が利用できる曲
  // （currentCommonSongPool）」の共通部分だけを初期選択状態にして、既存の曲選択画面を
  // 開く（一覧から選んで確認・調整できる、という本人の要望どおり。決定を押すまでは
  // 何も保存されない）。
  elements.collabChooseSongsButton.addEventListener("click", () => {
    openCollabSongPicker();
  });
  elements.collabChooseFavoritesButton.addEventListener("click", () => {
    const favoriteSongIds = getFavoriteSongIds().filter((songId) => currentCommonSongPool.has(songId));
    openSongListConfirm("⭐ お気に入りから選ぶ", "お気に入りから選ばれている曲はこの曲です", favoriteSongIds);
  });
  elements.collabChoosePlaylistButton.addEventListener("click", () => {
    openOnlineBattlePlaylistPicker(currentCommonSongPool, (songIds) => {
      openSongListConfirm("📃 プレイリストから選ぶ", "このプレイリストから選ばれている曲はこの曲です", songIds);
    });
  });

  elements.lobbyReadyButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    // 【2026-09-09新設・本人指示：音源再生失敗の本対策】参加者側の「準備完了」も、
    // 対戦開始前の確実なユーザージェスチャーの1つとして、同じくunlockを再実行しておく。
    attemptSilentUnlock();
    const nowReady = elements.lobbyReadyButton.classList.contains("is-ready");
    suppressNextReadyChangeNotice = true;
    elements.lobbySettingsChangedNotice.hidden = true;
    elements.lobbyRematchNotice.hidden = true;
    await setReady({ roomId: currentRoomId, ready: !nowReady });
  });

  elements.lobbyStartButton.addEventListener("click", async () => {
    if (!currentRoomId) return;

    // 【2026-09-09新設・本人指示：音源再生失敗の本対策】「対戦を開始する」は、これから
    // 音源再生が始まる対戦全体の中で最も確実なユーザージェスチャーの1つ。ここで改めて
    // unlockを実行しておくことで、ページを開いた直後の操作から時間が経っている場合や、
    // iOS側で一度成立したunlockが再びロックされてしまった場合の成功率を上げる
    // （js/audio.js参照。全対戦モードのこの1つの開始ボタンを経由するため、6モード
    // すべてに効く）。
    attemptSilentUnlock();

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
        instantBattleRoomSettings: currentInstantBattleSettings,
        instantCoopRoomSettings: currentInstantCoopSettings,
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
          // 【2026-09-07修正・本人指示：データ不足の事前警告】以前はここに専用の文言が
          // 無く、startBattle()が組み立てた具体的な原因メッセージ（共通曲が0曲／
          // 出題数に対して曲が足りない、の区別つき）が使われず、意味の薄い汎用エラーに
          // すり替わってしまっていた。result.messageをそのまま使うよう修正。
          "insufficient-common-songs": result.message ?? "参加者全員が利用できる曲が足りないため、対戦を開始できません。",
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
  // 【2026-09-07改訂・本人指示：ホームへ戻る＝ルーム在籍維持】以前はここでリアルタイム
  // 監視を止めていたが、「ホームへ戻ってもルームには残ったままにし、ホストが『もう一度』
  // 『ルーム設定に戻る』を選んだら自動的に呼び戻してほしい」という指示を受け、監視を
  // 止めずに画面だけホームへ切り替える形に変更した。renderLobby()は今表示中の画面を
  // 問わず動き続けており、room.statusの変化を検知した瞬間に自動でnavigateTo()する
  // （goToCountdownScreen・enterOnlineBattlePlay・goToResultScreenへの分岐は
  // renderLobby()のstatusJustChanged判定を参照。あちらは元々どの画面からでも呼べる
  // 設計のため、ホーム画面から突然呼ばれても問題なく動く）。「ルームから退出」
  // （resultLeaveButton、下記）を押した場合だけ、今までどおり監視を止めて完全に離脱する。
  elements.resultHomeLink.addEventListener("click", () => {
    resetOnlineBattleMatchState();
    elements.navigateTo("start");
  });

  // 【2026-09-07新設・本人指示：ルームから退出＝完全離脱】ホームへ戻るとは違い、
  // Firebase上の参加者からも削除し、以後ホストの再戦・設定変更操作の影響を受けなくする。
  // 既存の「ロビーからの退出」ボタン（lobbyLeaveConfirmButton、上記）と同じ手順
  // （isLeavingIntentionally→leaveRoom()完了を待つ→stopListeningToRoom()の順）にしている。
  // 実際の処理はleaveOnlineBattleRoomCompletely()に集約し、歌詞クイズ・一瞬協力の
  // 結果画面（onLeaveRoomCompletelyコールバック経由）とも共有する。
  elements.resultLeaveButton?.addEventListener("click", async () => {
    if (!currentRoomId) return;
    elements.resultLeaveButton.disabled = true;
    await leaveOnlineBattleRoomCompletely();
    elements.resultLeaveButton.disabled = false;
    elements.navigateTo("start");
  });

  // 【2026-09-05改訂、本人指示】試合後の選択肢を「もう一度」「ルーム設定に戻る」の
  // 2つ（ホスト専用）へ統一した。どちらも実際のstatus変更はjs/onlineBattle.js側の
  // 関数に任せ、ここではローカルの画面遷移を直接行わない（DNF確定ボタンと同じ設計：
  // Firebase側の変化をrenderLobby()側の状態遷移検知が拾って、ホスト・参加者とも
  // 自動的に次の画面へ進む。ここで直接navigateTo()もしてしまうと、その直後に届く
  // room更新による自動遷移と二重に画面が切り替わってしまうため）。
  // 「もう一度」は、すぐ前まで一緒に対戦していた相手に改めてREADYを押させる必要が
  // 無いという判断から、確認モーダルを挟まず即座に実行する（本人の要望：1回押すだけで
  // 開始演出を経て始まること）。
  elements.resultRematchButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    // 【2026-09-09新設・本人指示：音源再生失敗の本対策】「もう一度」はロビーの開始ボタンを
    // 経由せず直接次の対戦へ進むため、こちらでもunlockを再実行しておく。
    attemptSilentUnlock();
    elements.resultRematchButton.disabled = true;
    await rematchAndStartNow({ roomId: currentRoomId });
    elements.resultRematchButton.disabled = false;
  });
  elements.resultBackToLobbyButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    elements.resultBackToLobbyButton.disabled = true;
    await returnRoomToLobby({ roomId: currentRoomId });
    elements.resultBackToLobbyButton.disabled = false;
  });

  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  // 誤操作で対戦を中断してしまわないよう、共有の確認モーダル
  // （js/onlineBattleLobbyReturnPrompt.js）を必ず挟む。
  elements.quizBackToLobbyButton?.addEventListener("click", () => {
    promptReturnToLobby(currentRoomId);
  });

  // 【2026-09-09新設・本人指示：ロビー専用の詳細説明書】
  elements.lobbyHelpButton?.addEventListener("click", () => openLobbyHelpModal());
  elements.lobbyHelpClose?.addEventListener("click", () => closeLobbyHelpModal());
  elements.lobbyHelpModal?.addEventListener("click", (event) => {
    if (event.target !== elements.lobbyHelpModal) return;
    closeLobbyHelpModal();
  });
  elements.lobbyHelpGuideLink?.addEventListener("click", () => {
    closeLobbyHelpModal();
    elements.onOpenGuideFromLobby?.();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!elements.lobbyHelpModal || elements.lobbyHelpModal.hidden) return;
    closeLobbyHelpModal();
  });

  // 【2026-09-07新設・本人指示：ルーム参加者プロフィール】閉じるボタン・オーバーレイの
  // 外側タップ・Escapeキーのいずれでも閉じられるようにする（既存のfan-profile-detail-modal
  // 等、他のモーダルと同じ操作性に揃える）。
  elements.lobbyProfileClose?.addEventListener("click", () => closeLobbyParticipantProfile());
  elements.lobbyProfileModal?.addEventListener("click", (event) => {
    if (event.target !== elements.lobbyProfileModal) return;
    closeLobbyParticipantProfile();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!elements.lobbyProfileModal || elements.lobbyProfileModal.hidden) return;
    closeLobbyParticipantProfile();
  });

  renderLastRoomBanner();
}
