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
import { promptLeaveMatch, hasVoluntarilyLeftMatch } from "./onlineBattleLeaveMatchPrompt.js";
import { promptResultLeaveRoom } from "./onlineBattleResultLeavePrompt.js";
import { promptResultGoHome } from "./onlineBattleResultHomePrompt.js";
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
  beginMatchConfirmation,
  setRuleConfirmed,
  cancelMatchConfirmation,
  // 【再戦準備フェーズ新設・本人指示】対戦開始前ルール確認画面（beginMatchConfirmation等）と
  // 全く同じ考え方の、結果画面の「もう一度」用の一段階。
  beginRematchReadyCheck,
  setRematchReady,
  cancelRematchReadyCheck,
  finishRematchReadyCheck,
  finishCountdown,
  subscribeServerTimeOffset,
  initializeMyMatchProgress,
  submitAnswerProgress,
  finishMyMatch,
  finalizeMatchIfReady,
  returnRoomToLobby,
  markResultReturned,
  maybeFinalizeReturnToLobbyIfAllReturned,
  COUNTDOWN_DURATION_MS,
  ROOM_STATUS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  DEFAULT_MAX_SPECTATORS,
  syncMyHostBadge,
  spectateRoom,
  leaveSpectating,
  promoteSpectatorToPlayer,
  // 【本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・個人進行系）の再設計】
  // 本人だけがこの試合から抜ける設計から、試合全体を無効試合にする設計へ作り直した。
  reportMatchInvalidatedDueToAudioTrouble,
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
  resolveSongPoolForSettings,
} from "./battleModes/index.js";
import { QUESTION_COUNT_LABELS, RULE_LABELS } from "./localBattleScreen.js";
import { ONLINE_BATTLE_MODE_GUIDES } from "./onlineBattleRulesContent.js";
import { buildSharedEngineQuestionBreakdown, capQuestionBreakdownForStorage } from "./battleQuestionBreakdown.js";
import {
  computeAllPlayersConfirmed,
  computeAllPlayersRematchReady,
  computeAllPlayersResultReturned,
} from "./onlineBattleMatchConfirmationPayloads.js";
// 【2026-09-16新設・本人指示：対戦中に自主退出したゲストを待ち続けない】タイムアタック・
// ランダム再生対戦・アウトロクイズ対戦（このファイルが担当する個人進行系3モード）が
// 「全員の結果が揃ったか」を判定するための純粋関数。js/onlineBattle.jsのfinalizeMatchIfReady()
// と全く同じ判定を、待機画面側の表示（下記allFinished）にも使うことで、判定ロジックを
// 2重に持たないようにする。
// 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】
// isMatchInvalidated()は、matches/{matchId}/matchInvalidated（誰かが音源トラブルを申告し、
// 試合全体が無効になったことを示すwrite-onceフラグ）の有無を判定する。
import { isMatchReadyToFinalize, isMatchInvalidated } from "./onlineBattleMatchProgress.js";
import { renderQuestionBreakdownAccordion } from "./battleQuestionBreakdownUi.js";
import { computeNormalFinalRecordMs } from "./localBattleResult.js";
import { MEMBERS } from "./data/members.js";
import { SONGS } from "./data/songs.js";
import { renderCollaborativeSelectionBreakdown, wireCollaborativeSelectionDetailsToggle, resetCollaborativeSelectionDetailsPanel } from "./onlineBattleCollaborativeSelectionUi.js";
import {
  markResultScreenResponded,
  resetResultScreenResponded,
  hasRespondedToCurrentResultScreen,
  RESULT_SCREEN_NAMES,
  renderRematchReadinessList as renderRematchReadinessListShared,
  createRematchKickHandler,
} from "./onlineBattleResultReturnState.js";
import {
  ONLINE_BATTLE_TRANSITION_ACTION,
  ONLINE_BATTLE_RESULT_KIND,
  resolveOnlineBattleStatusTransition,
  isCountdownCompletionStillValid,
} from "./onlineBattleStatusTransitionPayloads.js";
import { buildSelectorUidsBySongId } from "./onlineBattleCollaborativeSelectionPayloads.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { getMemberById } from "./memberUtils.js";
// 【2026-09-07新設・本人指示：ルーム参加者プロフィール】参加者の名前タップで簡易
// プロフィールを見る機能、および推し色＋代表称号バッジの丸アイコン。どちらも
// js/onlineInstantBattleScreen.js・js/onlineInstantCoopBattleScreen.js・
// js/onlineLyricsQuizBattleScreen.jsからも使うため、中立な共通ファイル
// js/onlineParticipantIcon.jsに実体を置いている（2026-09-26移設・本人指示：
// js/onlineLyricsQuizBattleScreen.js冒頭の「一方向の依存に保つ」方針を守るため、
// このファイル自身もあちらから直接importされない共通の置き場所を経由する）。
import { buildParticipantIcon, openParticipantProfile, initParticipantProfileModal } from "./onlineParticipantIcon.js";
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
  syncLyricsResultHostGuestButtons,
  handleLyricsQuizRoomUpdate,
  resetLyricsQuizBattleState,
  forceHideLyricsCollabSongSection,
  // 【再戦準備フェーズ新設・本人指示】再戦準備画面の「今回の設定の簡単な要約」チップに、
  // ロビーの参加者向けサマリーと全く同じ組み立てロジックを再利用する。
  buildLyricsQuizSettingsSummaryChips,
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
// 【2026-08-30新設→2026-09-15全面書き換え、本人指示：一瞬バトルの同期方式への変更】
// 歌詞クイズ・一瞬協力と同じ理由・同じ一方向依存で、全員同期進行のこのモードを
// 専用ファイルへ委譲する（待機画面・結果画面も専用、独立進行のタイムアタック等とは別）。
import {
  enterOnlineInstantBattlePlay,
  enterInstantBattleResult,
  syncInstantBattleResultHostGuestButtons,
  handleInstantBattleRoomUpdate,
  resetOnlineInstantBattleState,
} from "./onlineInstantBattleScreen.js";
// 【2026-08-31新設、本人指示：19-3章「一瞬協力」】歌詞クイズと全く同じ理由・同じ一方向依存で、
// 全員同期進行のこのモードを専用ファイルへ委譲する（待機画面・結果画面も専用、一瞬バトルとは違う）。
import {
  renderInstantCoopLobbySettings,
  enterInstantCoopBattlePlay,
  enterInstantCoopResult,
  syncInstantCoopResultHostGuestButtons,
  handleInstantCoopRoomUpdate,
  resetInstantCoopBattleState,
  // 【再戦準備フェーズ新設・本人指示】上のbuildLyricsQuizSettingsSummaryChipsと同じ理由。
  buildInstantCoopSettingsSummaryChips,
} from "./onlineInstantCoopBattleScreen.js";
// 【2026-08-08新設】出題する曲をホストが選べる機能。曲の一覧・選択UI自体は3対戦モード共通の
// 別画面（js/onlineBattleSongPicker.js）に任せ、このファイルは「今の選択曲id配列」を
// 保持し、settings.questionSourceへ変換するだけに専念する（gameModeを問わない設計）。
import { openOnlineBattleSongPicker, updateOnlineBattleSongPickerLiveSelections } from "./onlineBattleSongPicker.js";
import { openOnlineBattlePlaylistPicker } from "./onlineBattlePlaylistPicker.js";
// 【2026-08-28新設】お気に入り／プレイリストで選んだ曲を、全曲一覧へ進む前にまず
// 確認できる共有モーダル。js/onlineLyricsQuizBattleScreen.js側でも同じ部品を使う
// （gameModeを問わない共通UIのため、js/onlineBattleSongPicker.js等と同じ階層に置く）。
import { openOnlineBattleSongListConfirm } from "./onlineBattleSongListConfirmModal.js";
import { QUESTION_SOURCE_TYPE, sanitizeSongIds } from "./questionSource.js";
import {
  resolveSongSourceOptionValue,
  buildSongSourceSettingsFields,
  applySongSourceOptionToForm,
  readSongSourceOptionFromForm,
  describeSongSourceForSettings,
} from "./onlineBattleSongSourceUi.js";
import { resolveQuestionCount } from "./quiz.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { savePlayHistoryEntryIfNew } from "./playHistory.js";
import { getCurrentTimeAttackStats } from "./timeAttackScreen.js";
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
// 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】
let lastHandledConfirmingMatch = false; // confirmingMatchの変化を検知するための追跡
let matchConfirmAutoStartTimerId = null; // 全員確認後の「2秒待ってから開始」タイマー（ホストのみ使用）
const MATCH_CONFIRM_AUTO_START_DELAY_MS = 2000; // 本人指示21：全員確認後、約2秒待ってから開始する
// 【再戦準備フェーズ新設・本人指示】上のconfirmingMatch系の状態と全く同じ役割を、
// 結果画面の「もう一度」→再戦準備フェーズでも持つ（意味が違うフラグのため、あえて
// 変数も分けている。goToLobby()で毎回リセットする点は上と少し異なる：確認フェーズの
// 途中でルームを離れる・別のルームへ移る、といった経路をまたいでタイマー予約や
// 「前回どちらの状態だったか」の記憶が残り続けると、前のルームの状態が新しいルームの
// 画面にチラつく事故（本人が繰り返し報告してきたmatchId混入バグと同じ種類の問題）に
// つながりかねないため、新設にあたって明示的にリセット対象へ加えた）。
let lastHandledConfirmingRematch = false; // confirmingRematchの変化を検知するための追跡
let rematchReadyAutoStartTimerId = null; // 全員準備OK後の「2秒待ってから開始」タイマー（ホストのみ使用）
let suppressNextReadyChangeNotice = false; // 自分でREADYボタンを押した直後だけ、変更通知を出さない
// 【2026-09-07改訂】以前はlastKnownMyReady（READYの前回値）を見ていたが、READYが設定変更で
// 解除されなくなったため、settingsRevision自体の変化を直接追跡する方式に変更した。
let lastKnownSettingsRevision = null;
let countdownTimerId = null; // カウントダウン表示の更新タイマー（setInterval）
let countdownOffsetUnsubscribe = null; // .info/serverTimeOffsetの購読解除
// 【2026-10-01新設・本人指示：オンライン対戦の同期回帰の緊急調査】.info/serverTimeOffset
// （自分の時計とサーバー時計のズレ）を、ロビーに入った時点から継続して購読しておく値。
// 以前はgoToCountdownScreen()がカウントダウン開始の瞬間に初めて購読を始めており、
// Firebaseから最初の値が届くまでの間（初回tickの一瞬）は暫定的にオフセット0（＝自分の
// 時計をそのまま信用する）で計算していた。通信環境が悪い端末では、この「最初の値が届く
// までの間」自体が実機で数百ms〜数秒に伸びる可能性があり、カウントダウンが0になる
// タイミングが端末ごとにズレる一因になりうる（本人指示：ホスト/ゲストで対戦開始直後の
// 画面遷移が数秒ずれる不具合の調査）。ロビー入室時点から購読を始めておけば、
// カウントダウン開始時点で既に最新のオフセット値が分かっているため、この「最初の値待ち」の
// 空白を無くせる。
let cachedServerTimeOffset = 0;
let persistentOffsetUnsubscribe = null;
function ensureServerTimeOffsetWarm() {
  if (persistentOffsetUnsubscribe) return;
  persistentOffsetUnsubscribe = subscribeServerTimeOffset((offset) => {
    cachedServerTimeOffset = offset;
  });
}

// 【2026-10-01新設・本人指示：対戦モード常時表示化】対戦モード選択を折りたたみから常時
// 表示へ変更したことに伴い、renderLobby()がroom更新のたびに（他プレイヤーのpresence更新等、
// モード変更と無関係な理由でも）呼ばれる中で、ホストが「まだ確定していない候補」を選んでいる
// 最中にラジオを勝手に今のモードへ戻してしまわないためのガード。this自体は
// updateRoomGameMode()の書き込みが実際にroom.gameModeへ反映されるまでの間だけ立てておく
// フラグで、書き込みが反映された（＝room.gameModeが変わった）ら自動的に解除される。
let modeChangeHasPendingSelection = false;
let lastSyncedRoomGameModeForModeChange = null;
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
// 【2026-09-15新設・本人指示8：対戦開始前ルール確認画面に出題対象曲一覧を表示】
// 「指定曲一覧を見る」の開閉状態。buildCurrentRuleExplanation()はrenderMatchConfirmScreen()
// から他プレイヤーが確認するたびに何度も呼ばれ、その都度DOMを作り直すため、開閉状態自体は
// この関数の外（モジュール変数）で持たないと、他の人が確認しただけでパネルが閉じてしまう。
let confirmSongListExpanded = false;

// Step3：試合の進行・進捗表示・結果まわりの状態。
let currentMatchId = null; // 今参加している試合のID（開始〜結果画面まで保持）
let currentMatchTotalQuestions = 0; // 今の試合の全問題数（進捗表示の分母、buildQuestionsForModeの結果の長さ）

// 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】自分がホストの
// とき、この試合（matchId）について既にreturnRoomToLobby()を呼んだかどうかを覚えておく。
// renderLobby()はroomが更新されるたび（presence等の些細な変化でも）呼ばれるため、
// 追跡なしにmatchInvalidatedを見て毎回returnRoomToLobby()を呼ぶと、無駄なFirebase書き込みが
// 連発してしまう（呼び出し自体は冪等で安全だが、効率のためにも1試合につき1回に絞る）。
let matchInvalidationReturnRequestedForMatchId = null;

// 推し（最推し）が設定されていれば、色ドットの要素を1つ作って返す。未設定・不正な値
// （既存のメンバーデータに一致しない等）の場合はnullを返す（エラーにせず何も表示しない）。
// ロビー・待機画面・結果画面のいずれも同じ見た目のドットを使うため、共通化している。
// 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-8章】以前は推し色だけの
// 小さなドット（16px、称号バッジ無し）だったが、「ロビー・スコア一覧・結果画面を
// 見ただけで、この人がどんな称号を持っているか分かるようにしたい」という指示により、
// js/onlineParticipantIcon.jsの共通アイコン（推し色の丸＋代表称号バッジ、みんなの
// プロフィールと同じ王冠・ダイヤ装飾）へ差し替えた。呼び出し側の6箇所（対戦開始前
// ルール確認・再戦準備・ロビー本体・観戦者一覧・待機画面・結果画面）はこの関数を
// そのまま使い続けられるよう、関数名・戻り値の形（挿入可能なDOM要素）は変えていない。
// 推し未設定の相手でも（以前は何も表示しなかったが）灰色のプレースホルダー丸を返す
// ことで、「参加者には必ずアイコンがある」という一貫した見た目にする。
function createOshiDotElement(oshiMemberId, uid) {
  return buildParticipantIcon(oshiMemberId, uid);
}

// 【2026-09-26新設・本人指示：オンライン対戦総合改修19-14章】ロビー・設定画面の参加者
// 並び順は「①自分→②それ以外は参加順」に統一する（本人とChatGPTで決めた仕様）。
// 対戦中・スコア表示・結果画面は既存の順位ロジック（compareBattleResults等）を
// そのまま使うため、この関数の対象外。
function compareParticipantEntriesForLobbyDisplay(myUid) {
  return ([uidA, playerA], [uidB, playerB]) => {
    if (uidA === myUid && uidB !== myUid) return -1;
    if (uidB === myUid && uidA !== myUid) return 1;
    return (playerA.joinedAt ?? 0) - (playerB.joinedAt ?? 0);
  };
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
  // 【2026-09-30改訂・本人指示：出題する曲4択統合】カテゴリ／曲を選んで出題のどちらでも、
  // 共通ヘルパー（js/onlineBattleSongSourceUi.js）で1行の文言に変換する。
  const songSourceChip = describeSongSourceForSettings(settings);
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
// 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】「今このルームで選ばれている
// 設定」の説明文を組み立てる純粋なDOM構築処理。以前はrenderLobbyHelpModal()の中に
// 直接書かれていたが、新設の対戦開始前ルール確認画面（renderMatchConfirmScreen()）でも
// 全く同じ内容を表示したいため、共通関数として切り出した（本人指示：ロビー説明書と
// 確認画面で説明内容が食い違わないよう、同じルール定義データから生成・共有すること）。
// containerElementを丸ごと空にしてから組み立て直す（呼び出し側は空のコンテナを渡すこと）。
function buildCurrentRuleExplanation(containerElement, room) {
  containerElement.innerHTML = "";
  const gameMode = room.gameMode;
  const settings = room.settings ?? {};

  const modeHeading = document.createElement("p");
  modeHeading.className = "online-lobby-help-current-mode";
  modeHeading.textContent = `現在のモード：${getModeLabel(gameMode)}`;
  containerElement.appendChild(modeHeading);

  const modeDescription = document.createElement("p");
  modeDescription.className = "online-lobby-help-current-description";
  modeDescription.textContent = getModeDescription(gameMode);
  containerElement.appendChild(modeDescription);

  // 【2026-09-14改訂・本人指示：ルール確認画面に「順位の決まり方」を明示】
  // js/battleModes/*・js/battleRules/*のgetRuleDescription()は、以前から実際の
  // compareResults()の判定基準（何が同点で、同点時に何を見るか等）と完全に一致する
  // 文言を返しており（例：一瞬バトル「正解数が多い人が上位。同数の場合は…」、歌詞クイズ
  // 各ルール「…同点の場合は同じ順位になります」）、内容自体は既に正確だった。ただし
  // 見出しが無く「対戦ルールの説明の一部」として埋もれて見えるという指摘があったため、
  // 「🏆 順位の決まり方」という明示的な見出しを付け、必ず目に入る形にする
  // （推測で新しい文言を書くのではなく、既存のgetRuleDescription()をそのまま使う）。
  const ruleDescription = getRuleDescription(gameMode, settings);
  if (ruleDescription) {
    const rankingHeading = document.createElement("p");
    rankingHeading.className = "online-lobby-help-current-mode online-battle-ranking-heading";
    rankingHeading.textContent = "🏆 順位の決まり方";
    containerElement.appendChild(rankingHeading);

    const ruleText = document.createElement("p");
    ruleText.className = "battle-rule-description";
    ruleText.textContent = ruleDescription;
    containerElement.appendChild(ruleText);
  }

  const countLabel = QUESTION_COUNT_LABELS[settings.questionCountValue] ?? settings.questionCountValue;
  if (countLabel) {
    const questionCountText = document.createElement("p");
    questionCountText.className = "online-lobby-help-current-description";
    questionCountText.textContent = `出題数：${countLabel}`;
    containerElement.appendChild(questionCountText);
  }

  // 【2026-09-30新設・本人指示：ルール確認画面に出題する曲の情報が無かった】以前は
  // 「共同選曲を使っている場合」だけ曲の情報を表示しており、①〜③（表題曲のみ／
  // 表題曲＋全員曲／全曲）を選んでいる場合は出題対象曲の情報が一切表示されていなかった
  // （ゲストが対戦開始前に「今回どの範囲の曲が出るか」を確認できないバグ）。
  // 4択のうちどれを選んでいても必ず1行表示するようにする。
  const songSourceText = document.createElement("p");
  songSourceText.className = "online-lobby-help-current-description";
  songSourceText.textContent = `出題する曲：${describeSongSourceForSettings(settings)}`;
  containerElement.appendChild(songSourceText);

  // ミスペナルティは「ノーマル」ルールを持つモード（イントロ対戦・ランダム再生対戦・
  // アウトロ対戦）だけに存在する設定のため、無い場合は何も表示しない。
  if (settings.rule === "normal" && typeof settings.penaltySeconds === "number") {
    const penaltyText = document.createElement("p");
    penaltyText.className = "online-lobby-help-current-description";
    penaltyText.textContent = `ミスペナルティ：${settings.penaltySeconds}秒`;
    containerElement.appendChild(penaltyText);
  }

  // 【2026-09-30新設・本人指示：ルール確認画面にモード固有設定を表示】一瞬バトル・
  // 一瞬協力だけが持つ「再生時間」「回答候補」も、他の設定と同じ並びで確認できるようにする。
  if (typeof settings.playDurationValue !== "undefined") {
    const playDurationText = document.createElement("p");
    playDurationText.className = "online-lobby-help-current-description";
    playDurationText.textContent = `再生時間：${settings.playDurationValue}秒`;
    containerElement.appendChild(playDurationText);
  }
  if (typeof settings.answerPoolSizeValue !== "undefined") {
    const answerPoolText = document.createElement("p");
    answerPoolText.className = "online-lobby-help-current-description";
    answerPoolText.textContent = `回答候補：${settings.answerPoolSizeValue === "all" ? "全曲検索" : `${settings.answerPoolSizeValue}択`}`;
    containerElement.appendChild(answerPoolText);
  }

  // 【2026-09-14新設→2026-09-15拡張・本人指示：ルール確認画面に出題対象曲一覧を表示】
  // 共同選曲を使っている場合、「共有曲指定あり」「現在有効な出題候補が何曲あるか」
  // 「今回何問出題されるか」に加え、開閉式の一覧で実際の曲名・誰が選んだかまで確認できる
  // ようにする。カテゴリー変更等で「選択状態は保存されているが今回のカテゴリでは対象外」の
  // 曲は、絶対に「今回出題される曲」として見せてはいけない（本人指示）ため、
  // resolveSongPoolForSettings()が返す、既にカテゴリー絞り込み済みのeffectivePoolだけを
  // 「今回有効な出題対象曲」として扱う。対象外だが選択状態は保存されている曲は、
  // 誤解を避けるため別セクションへ分けて表示する。
  if (settings.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION) {
    const effectivePool = resolveSongPoolForSettings(gameMode, settings) ?? [];
    const questionCount = resolveQuestionCount(settings.questionCountValue, effectivePool.length);
    const collabText = document.createElement("p");
    collabText.className = "online-lobby-help-current-description online-battle-confirm-collab-summary";
    collabText.textContent =
      effectivePool.length === 0
        ? "共有曲指定あり：現在有効な出題候補は0曲です。参加者に曲を選んでもらってください。"
        : `共有曲指定あり：現在有効な出題候補${effectivePool.length}曲の中から、今回${questionCount}問出題されます`;
    containerElement.appendChild(collabText);

    const players = room.players ?? {};
    const mergedSelection = computeMergedSelectedSongIds(players);
    const effectivePoolSet = new Set(effectivePool);
    const excludedByCategory = mergedSelection.filter((songId) => !effectivePoolSet.has(songId));
    const selectorUidsBySongId = buildSelectorUidsBySongId(players);
    const songTitleById = (songId) => SONGS.find((song) => song.id === songId)?.title ?? songId;

    const buildSongChipList = (songIds) => {
      const list = document.createElement("div");
      list.className = "online-battle-collab-song-chip-list";
      if (songIds.length === 0) {
        const empty = document.createElement("p");
        empty.className = "online-battle-collab-breakdown-empty";
        empty.textContent = "該当する曲はありません。";
        list.appendChild(empty);
        return list;
      }
      songIds.forEach((songId) => {
        const chip = document.createElement("span");
        chip.className = "online-battle-collab-song-chip";
        const selectorNames = (selectorUidsBySongId[songId] ?? []).map((uid) => players[uid]?.displayName ?? players[uid]?.name ?? "参加者");
        chip.textContent = selectorNames.length > 0 ? `${songTitleById(songId)}（${selectorNames.join("・")}）` : songTitleById(songId);
        list.appendChild(chip);
      });
      return list;
    };

    if (effectivePool.length > 0 || excludedByCategory.length > 0) {
      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.className = "secondary-button online-battle-confirm-song-list-toggle";
      toggleButton.setAttribute("aria-expanded", String(confirmSongListExpanded));
      toggleButton.textContent = confirmSongListExpanded ? "指定曲一覧を閉じる ▴" : "指定曲一覧を見る ▾";
      containerElement.appendChild(toggleButton);

      const panel = document.createElement("div");
      panel.className = "online-battle-confirm-song-list-panel";
      panel.hidden = !confirmSongListExpanded;

      const effectiveHeading = document.createElement("p");
      effectiveHeading.className = "online-battle-confirm-song-list-heading";
      effectiveHeading.textContent = "🎵 今回有効な出題対象曲";
      panel.appendChild(effectiveHeading);
      panel.appendChild(buildSongChipList(effectivePool));

      // カテゴリー変更で対象外になった、選択状態だけが残っている曲。誤解を避けるため
      // 「今回有効な出題対象曲」とは明確に見た目・文言を分けて表示する（本人指示）。
      if (excludedByCategory.length > 0) {
        const excludedHeading = document.createElement("p");
        excludedHeading.className = "online-battle-confirm-song-list-heading online-battle-confirm-song-list-heading-excluded";
        excludedHeading.textContent = "🚫 現在は対象外だが選択状態は保存中（今回は出題されません）";
        panel.appendChild(excludedHeading);
        panel.appendChild(buildSongChipList(excludedByCategory));
      }

      containerElement.appendChild(panel);

      toggleButton.addEventListener("click", () => {
        // 曲一覧パネルの開閉トグル操作音
        playSfx(SFX_EVENTS.UI_CLICK);
        confirmSongListExpanded = !confirmSongListExpanded;
        panel.hidden = !confirmSongListExpanded;
        toggleButton.setAttribute("aria-expanded", String(confirmSongListExpanded));
        toggleButton.textContent = confirmSongListExpanded ? "指定曲一覧を閉じる ▴" : "指定曲一覧を見る ▾";
      });
    }
  }
}

function renderLobbyHelpModal(room) {
  if (!elements.lobbyHelpCurrentSettings) return;
  const gameMode = room.gameMode;

  buildCurrentRuleExplanation(elements.lobbyHelpCurrentSettings, room);

  renderLobbyHelpModeList(elements.lobbyHelpModeList, gameMode);
}

// 【2026-11-XX全面改訂・本人指示：優先度3「ルール・遊び方」の内容拡充】
// 6モードそれぞれを独立した<details>アコーディオンにし、js/onlineBattleRulesContent.jsの
// 詳細な説明（遊び方・回答方法・勝敗条件・得点・ミス時の扱い・出題数・共同選曲・
// モード固有の注意点）を表示する。歌詞クイズ対戦だけ、内側にもう1段
// 「正解数バトル/早押しバトル/ポイントバトル」の3ルールぶんのアコーディオンを持つ。
// 現在選択中のモードだけ最初から開いた状態にする（探しやすさのため）。
function buildDetailList(sections) {
  const dl = document.createElement("dl");
  dl.className = "online-lobby-help-detail-list";
  sections.forEach(({ heading, body }) => {
    const dt = document.createElement("dt");
    dt.textContent = heading;
    const dd = document.createElement("dd");
    // 本文中の改行（\n）を段落として保持する（style.cssでwhite-space:pre-lineにする）。
    dd.textContent = body;
    dl.append(dt, dd);
  });
  return dl;
}

function renderLobbyHelpModeList(containerElement, currentGameMode) {
  containerElement.innerHTML = "";
  listAvailableGameModes().forEach((mode) => {
    const guide = ONLINE_BATTLE_MODE_GUIDES[mode.gameMode];
    const item = document.createElement("details");
    item.className = "online-lobby-help-mode-item";
    // 【本人指示：優先度10】ゲストが6択カードをタップしたとき、
    // openLobbyHelpModal(focusGameMode)がこの属性を目印にスクロール先を探す。
    item.dataset.gameMode = mode.gameMode;
    const isCurrent = mode.gameMode === currentGameMode;
    if (isCurrent) {
      item.classList.add("is-current");
      item.open = true;
    }

    const summary = document.createElement("summary");
    summary.className = "online-lobby-help-mode-item-summary";
    const name = document.createElement("span");
    name.className = "online-lobby-help-mode-item-name";
    name.textContent = mode.label;
    const desc = document.createElement("span");
    desc.className = "online-lobby-help-mode-item-description";
    desc.textContent = mode.description;
    summary.append(name, desc);
    item.appendChild(summary);

    const body = document.createElement("div");
    body.className = "online-lobby-help-mode-item-body";
    if (guide) {
      body.appendChild(buildDetailList(guide.sections));
      if (guide.ruleSections) {
        guide.ruleSections.forEach((rule) => {
          const ruleBlock = document.createElement("div");
          ruleBlock.className = "online-lobby-help-rule-block";
          const ruleHeading = document.createElement("h4");
          ruleHeading.textContent = rule.label;
          ruleBlock.appendChild(ruleHeading);
          ruleBlock.appendChild(buildDetailList(rule.sections));
          body.appendChild(ruleBlock);
        });
      }
    }
    item.appendChild(body);
    containerElement.appendChild(item);
  });
}

// focusGameMode: 【2026-11-XX新設・本人指示：優先度10】ゲストが6択のカードをタップして
// 開いた場合、そのモードの説明までスクロールして見せる（省略時は先頭のまま、従来どおり）。
function openLobbyHelpModal(focusGameMode) {
  if (!latestRoom || !elements.lobbyHelpModal) return;
  confirmSongListExpanded = false;
  renderLobbyHelpModal(latestRoom);
  elements.lobbyHelpModal.hidden = false;
  if (focusGameMode && elements.lobbyHelpModeList) {
    const target = elements.lobbyHelpModeList.querySelector(`[data-game-mode="${focusGameMode}"]`);
    target?.scrollIntoView({ block: "nearest" });
  }
}

function closeLobbyHelpModal() {
  if (!elements.lobbyHelpModal) return;
  elements.lobbyHelpModal.hidden = true;
}

// ===== 対戦開始前ルール確認画面（2026-09-13新設・本人指示） =====
// ロビーで「対戦を開始する」を押した直後〜3→2→1カウントダウンの間に挟まる、全員が
// 今回のルールを確認するための画面。room.status自体は"waiting"のまま変えず、
// room.confirmingMatch（room全体で1つ）とroom.players/{uid}/ruleConfirmed（本人ごと）の
// 2つのFirebaseフィールドだけで成り立たせている（本人指示のとおり、room.statusを増やすと
// 参加・キック・モード変更等、既存の"waiting"前提のあらゆる判定を1つずつ洗い直す必要が
// あり危険なため。confirmingMatch中もstatusはwaitingのままなので、途中参加・ホストによる
// キックはこれまでどおり動く）。

function enterMatchConfirmScreen(room) {
  clearTimeout(matchConfirmAutoStartTimerId);
  matchConfirmAutoStartTimerId = null;
  confirmSongListExpanded = false;
  elements.navigateTo("onlineBattleConfirm");
  renderMatchConfirmScreen(room);
}

function renderMatchConfirmScreen(room) {
  if (!elements.confirmPlayerList) return;
  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const players = room.players || {};

  buildCurrentRuleExplanation(elements.confirmRuleExplanation, room);

  const playerEntries = Object.entries(players).sort(compareParticipantEntriesForLobbyDisplay(myUid));
  const allConfirmed = computeAllPlayersConfirmed(players);

  elements.confirmPlayerList.innerHTML = "";
  playerEntries.forEach(([uid, player]) => {
    const li = document.createElement("li");
    li.className = "online-lobby-player-row";
    if (uid === myUid) li.classList.add("is-me");

    const oshiDot = createOshiDotElement(player.oshiMemberId, uid);
    if (oshiDot) li.appendChild(oshiDot);

    const name = document.createElement("span");
    name.className = "online-lobby-player-name";
    name.textContent = player.name + (uid === myUid ? "（あなた）" : "");
    li.appendChild(name);

    const badges = document.createElement("span");
    badges.className = "online-lobby-player-badges";
    if (player.isHost) {
      const hostBadge = document.createElement("span");
      hostBadge.className = "online-lobby-badge online-lobby-badge-host";
      hostBadge.textContent = "ホスト";
      badges.appendChild(hostBadge);
    }
    const statusBadge = document.createElement("span");
    statusBadge.className = player.ruleConfirmed
      ? "online-lobby-badge online-lobby-badge-connected"
      : "online-lobby-badge online-lobby-badge-progress";
    statusBadge.textContent = player.ruleConfirmed ? "確認OK" : "未確認";
    badges.appendChild(statusBadge);
    li.appendChild(badges);

    elements.confirmPlayerList.appendChild(li);
  });

  const myConfirmed = players[myUid]?.ruleConfirmed === true;
  if (elements.confirmToggleButton) {
    elements.confirmToggleButton.textContent = myConfirmed ? "確認を取り消す" : "✓ 確認OK";
    elements.confirmToggleButton.classList.toggle("is-confirmed", myConfirmed);
  }
  if (elements.confirmAllDoneNotice) {
    elements.confirmAllDoneNotice.hidden = !allConfirmed;
  }
  // 【本人指示13章と同じ役割分担】確認をやめてロビーへ戻る操作はホストだけができる
  // （設定を変更できるのがホストだけという既存の権限設計と揃えている）。
  if (elements.confirmCancelButton) {
    elements.confirmCancelButton.hidden = !isHost;
  }

  // 【本人指示21：全員確認後、2秒待ってから開始】ホストの端末だけがこの判定・実際の
  // 対戦開始（startBattle()の再実行）を担当する（finishCountdown()・一瞬協力の進行tick等、
  // 既存のホスト主導の遷移と同じ設計方針）。renderLobby()はroom更新のたびに何度も
  // 呼ばれるため、タイマーの二重予約を防ぐガード（matchConfirmAutoStartTimerId）を持つ。
  if (isHost && allConfirmed && matchConfirmAutoStartTimerId === null) {
    const roomId = room.roomId;
    matchConfirmAutoStartTimerId = setTimeout(async () => {
      matchConfirmAutoStartTimerId = null;
      // 2秒の間に誰かが確認を取り消した・退出した可能性があるため、実行直前の
      // 最新状態（latestRoom、renderLobby()のたびに更新される）で改めて確認する。
      const latest = latestRoom;
      if (!latest || latest.roomId !== roomId || latest.confirmingMatch !== true) return;
      if (!computeAllPlayersConfirmed(latest.players)) return;
      attemptSilentUnlock();
      await startBattle({ roomId, settings: latest.settings });
      // 失敗した場合（設定が直前で不正になった等）は、renderLobby()の次回呼び出しで
      // confirmingMatchがまだtrueのままなのでこの画面に留まり、ホストは改めて
      // 確認OKを見て再試行できる（新しいエラー表示は今回は設けない。安全側に倒し、
      // 稀なケースのため確認画面へ留まる挙動で十分と判断）。
    }, MATCH_CONFIRM_AUTO_START_DELAY_MS);
  } else if (!allConfirmed && matchConfirmAutoStartTimerId !== null) {
    clearTimeout(matchConfirmAutoStartTimerId);
    matchConfirmAutoStartTimerId = null;
  }
}

// ===== 再戦準備フェーズ（新設・本人指示） =====
// 結果画面の「もう一度」を押した直後〜3→2→1カウントダウンの間に挟まる、全員が今回の
// 対戦設定の簡単な要約を確認し「準備OK」を押すための画面。上の対戦開始前ルール確認画面
// （enterMatchConfirmScreen/renderMatchConfirmScreen）と全く同じ構造・同じ設計方針
// （room.statusは"waiting"のまま変えず、room.confirmingRematch（room全体で1つ）と
// room.players/{uid}/rematchReady（本人ごと）の2つのフィールドだけで成り立たせる）を
// 踏襲しているが、あえて同じ関数へは統合していない：
// ・表示内容が違う（詳しいルール説明ではなく、モード名・ルール名・問題数・カテゴリ等の
// 　主要項目だけのコンパクトな要約）。
// ・「対戦開始前」と「再戦前」は文脈（何を確認しているか）が異なり、1つの関数に混ぜると
// 　却って読みにくくなるという判断（本人指示：無理に1箇所へ統合しない）。
// 一方で、判定ロジック（全員のフラグが揃ったか）はcomputeAllPlayersConfirmed()と対になる
// computeAllPlayersRematchReady()として、上と同じくjs/onlineBattleMatchConfirmationPayloads.js
// に置き、恒久テストで検証できる形にしてある。

// 【2026-09-30新設→2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計】結果画面を
// 見ていない人（ロビー画面等にいる人）向けの後方互換フォールバック。結果画面を見ている
// 人は別画面へは遷移せず、結果画面内のインラインパネル（renderResultReturnPanel()等）で
// そのまま完結する（js/onlineBattleScreen.jsのrenderLobby()内、isConfirmingRematchNow
// ガード参照）。
function enterRematchReadyScreen(room) {
  clearTimeout(rematchReadyAutoStartTimerId);
  rematchReadyAutoStartTimerId = null;
  elements.navigateTo("onlineBattleRematchReady");
  renderRematchReadyScreen(room);
}

// containerElementへ、chips（文字列配列）をそのままチップ表示として流し込む小さな
// 共通ヘルパー。renderSettingsChips()・renderInstantBattleSettingsChips()は元々
// 「チップ文字列の組み立て」と「DOMへ流し込む」を1つの関数で行っているためそのまま
// 呼べるが、歌詞クイズ・一瞬協力側は「文字列配列を返す純粋関数」として切り出した
// （buildLyricsQuizSettingsSummaryChips/buildInstantCoopSettingsSummaryChips）ため、
// こちらでDOMへ流し込む部分だけを共通化する。
function renderChipList(containerElement, chips) {
  containerElement.innerHTML = "";
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    containerElement.appendChild(chip);
  });
}

// 「今回の対戦設定の簡単な要約」チップを組み立てる。詳しいルール説明
// （buildCurrentRuleExplanation()）とは別物で、モード名・ルール名・問題数・カテゴリ等の
// 主要項目だけに絞る（本人指示1：詳しい説明ではなくコンパクトな要約にすること）。
// gameModeごとに既存のチップ組み立て（ロビーの参加者向け設定サマリーと全く同じもの）を
// そのまま再利用することで、「ロビーで見える設定」と「再戦準備フェーズで見える設定」が
// 食い違う事故を防ぐ。
function renderRematchSummaryChips(containerElement, room) {
  const gameMode = room.gameMode;
  const settings = room.settings ?? {};
  if (gameMode === LYRICS_QUIZ_GAME_MODE) {
    renderChipList(containerElement, buildLyricsQuizSettingsSummaryChips(settings));
  } else if (gameMode === INSTANT_BATTLE_GAME_MODE) {
    renderInstantBattleSettingsChips(containerElement, settings);
  } else if (gameMode === INSTANT_COOP_GAME_MODE) {
    renderChipList(containerElement, buildInstantCoopSettingsSummaryChips(settings));
  } else {
    renderSettingsChips(containerElement, settings, gameMode);
  }
}

// 【2026-10-01新設・本人指示：結果画面/再戦フロー全面設計】再戦準備の「参加者ごとの
// 準備状況リスト」の描画・キック処理は、js/onlineBattleResultReturnState.js（4画面共通の
// 中立ファイル）のrenderRematchReadinessList()/createRematchKickHandler()をそのまま使う
// （本人指示：同じロジックを2重に持たない。js/onlineLyricsQuizBattleScreen.js等、
// 他3画面もこの中立ファイル経由で全く同じ処理を共有する）。
function renderRematchPlayerList(listElement, room) {
  const myUid = getCurrentUid();
  renderRematchReadinessListShared(listElement, room.players || {}, myUid, room.host === myUid);
}
const handleRematchKickClick = createRematchKickHandler({
  getRoomId: () => currentRoomId,
  kickPlayerFn: kickPlayer,
  playConfirmSfx: () => playSfx(SFX_EVENTS.UI_CONFIRM),
});

// 【2026-10-01新設・本人指示】全員準備OK後、2秒待ってから実際に再戦を開始する処理。
// 結果画面のインラインパネル・専用の別画面のどちらを見ていても、ホストの端末が
// room更新のたびに1回だけ呼べば足りる（タイマーの二重予約防止ガード
// rematchReadyAutoStartTimerIdは共通のモジュール変数のまま）。
export function driveRematchReadyAutoStart(room) {
  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const players = room.players || {};
  const allReady = computeAllPlayersRematchReady(players);

  // 【全員準備OK後、2秒待ってから開始】対戦開始前ルール確認画面の自動開始と全く同じ設計
  // （本人指示21と同じ考え方をこちらにも踏襲）。ホストの端末だけがこの判定・実際の開始
  // （finishRematchReadyCheck()）を担当し、タイマーの二重予約防止ガード
  // （rematchReadyAutoStartTimerId）で「全員準備OKになった瞬間に誤って2回カウントダウンが
  // 始まる」事故を防ぐ（本人指示7）。準備を待っている間はこのタイマー自体が存在しないため、
  // 時間経過だけで自動的に開始してしまうことは絶対に無い（本人指示3）。
  if (isHost && allReady && rematchReadyAutoStartTimerId === null) {
    const roomId = room.roomId;
    rematchReadyAutoStartTimerId = setTimeout(async () => {
      rematchReadyAutoStartTimerId = null;
      // 2秒の間に誰かが準備を取り消した・退出した可能性があるため、実行直前の
      // 最新状態（latestRoom、renderLobby()のたびに更新される）で改めて確認する
      // （本人指示8：前の状態が新しい状態に紛れ込まないよう、roomId・フラグの両方を
      // 実行直前に再チェックする）。
      const latest = latestRoom;
      if (!latest || latest.roomId !== roomId || latest.confirmingRematch !== true) return;
      if (!computeAllPlayersRematchReady(latest.players)) return;
      attemptSilentUnlock();
      await finishRematchReadyCheck({ roomId });
      // 失敗した場合（設定が直前で不正になった等）は、renderLobby()の次回呼び出しで
      // confirmingRematchがまだtrueのままなのでこの画面に留まり、ホストは改めて
      // 準備OKの状況を見て再試行できる（対戦開始前ルール確認画面と同じ安全側の設計）。
    }, MATCH_CONFIRM_AUTO_START_DELAY_MS);
  } else if (!allReady && rematchReadyAutoStartTimerId !== null) {
    clearTimeout(rematchReadyAutoStartTimerId);
    rematchReadyAutoStartTimerId = null;
  }
}

// 【後方互換のフォールバック】結果画面を見ていない人（ロビー画面等）向けの、専用の
// 再戦準備別画面の描画。renderRematchReadinessList()・driveRematchReadyAutoStart()を
// 共有し、こちらはその画面専用のsummary/toggle/allDone/cancel要素だけを担当する。
function renderRematchReadyScreen(room) {
  if (!elements.rematchReadyPlayerList) return;
  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const players = room.players || {};

  renderRematchSummaryChips(elements.rematchReadySummary, room);
  renderRematchPlayerList(elements.rematchReadyPlayerList, room);

  const allReady = computeAllPlayersRematchReady(players);
  const myReady = players[myUid]?.rematchReady === true;
  if (elements.rematchReadyToggleButton) {
    elements.rematchReadyToggleButton.textContent = myReady ? "準備を取り消す" : "✓ 準備OK";
    elements.rematchReadyToggleButton.classList.toggle("is-confirmed", myReady);
  }
  if (elements.rematchReadyAllDoneNotice) {
    elements.rematchReadyAllDoneNotice.hidden = !allReady;
  }
  // 再戦準備をやめてロビーへ戻る操作はホストだけができる（対戦開始前ルール確認画面と
  // 同じ権限設計）。
  if (elements.rematchReadyCancelButton) {
    elements.rematchReadyCancelButton.hidden = !isHost;
  }

  driveRematchReadyAutoStart(room);
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
  setChecked("online-battle-settings-rule", settings.rule);
  setChecked("online-battle-settings-penalty", String(settings.penaltySeconds));
  elements.lobbySettingsPenaltyFieldset.hidden = settings.rule !== "normal";

  // 【2026-09-30改訂・本人指示：出題する曲4択統合】以前は「全曲から出題／曲を選んで出題」と
  // 「カテゴリ」が別々のfieldsetだったが、④択の1本のラジオへ統合した
  // （js/onlineBattleSongSourceUi.js参照）。カテゴリ専用fieldsetの表示切り替えは不要になった。
  applySongSourceOptionToForm("online-battle-settings-song-source", settings);
}

function readSettingsFromHostForm() {
  const songSourceValue = readSongSourceOptionFromForm("online-battle-settings-song-source");
  const settings = {
    questionCountValue: document.querySelector('input[name="online-battle-settings-question-count"]:checked').value,
    rule: document.querySelector('input[name="online-battle-settings-rule"]:checked').value,
    penaltySeconds: Number(document.querySelector('input[name="online-battle-settings-penalty"]:checked').value),
    // 【2026-09-30改訂】①②③はcategoryFilterValueのみ（questionSourceは持たせない。今までと
    // 全く同じ、categoryFilterValueだけを見る動作を維持するため）、④は共同選曲
    // （collaborativeSelection）として保存する。songIdsは、その時点で分かっている
    // 「参加者全員の選択の和集合を、今のルーム共通曲で絞り込んだもの」を入れる（0件でもよい。
    // まだ誰も選んでいない状態を安全に表せるよう、js/battleModes/timeAttackBattleMode.js側で
    // この型の0件は検証エラーにしないようにしてある）。
    ...buildSongSourceSettingsFields(songSourceValue, { mergedSongIds: getMergedRestrictedSongIds() }),
  };
  return settings;
}

// ホストの設定フォームの今の内容を検証し、問題なければFirebaseへ反映する
// （設定ラジオの変更から呼ばれる。曲そのものの選択はsyncCollaborativeSongPoolIfHost()が
// 別途、参加者全員の選択が変わるたびに自動的に反映する）。
// 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-3章】以前は、対戦を始めるには
// 曲数が足りない等の検証エラーがあると、ここでFirebaseへの書き込みそのものを取りやめて
// いた。しかしその結果、settings.questionSourceがFirebase上では「曲を選んで出題」に
// 更新されないまま古い状態（全曲から出題）に取り残され、次にroomが再描画されるたびに
// updateCollabSongSectionUi()がFirebase確定値だけを見て「曲を選んで出題」の選曲UI一式を
// 非表示に戻してしまい、曲数が足りないのに曲を追加する手段が無くなる、という詰み状態を
// 生んでいた（本人指示：「警告は開始できない理由を伝えるものであって、設定変更まで禁止
// するものにしないでください」「選曲ボタん→条件不足でも常に使用可能」）。
// 対戦を実際に開始できるかどうかの検証は、この関数とは別に「対戦を開始する」ボタンの
// クリック処理（startBattle()・beginMatchConfirmation()）が改めて行っているため、
// ここで検証エラー時にも設定を保存すること自体は安全（開始条件の判定を緩めることには
// ならない）。
async function applyHostSettingsChangeFromForm() {
  if (!currentRoomId) return;
  const settings = readSettingsFromHostForm();
  elements.lobbySettingsPenaltyFieldset.hidden = settings.rule !== "normal";

  const errorMessage = validateRoomSettings(currentGameMode, settings);
  elements.lobbyStartError.textContent = errorMessage ?? "";
  elements.lobbyStartError.hidden = !errorMessage;
  await updateRoomSettings({ roomId: currentRoomId, settings });
}

// 【2026-08-30新設、本人指示：19-3章「一瞬バトル」】上のrenderSettingsChips/
// applySettingsToHostForm/readSettingsFromHostFormと同じ考え方だが、一瞬バトルの設定の形
// （questionCountValue・categoryFilterValue・playDurationValue・answerPoolSizeValue）に合わせた
// 専用版。settings.ruleを一切持たないため、既存の関数をそのまま使うと存在しないプロパティ
// （undefined）がチップに出てしまう問題があり、共用せず分けた。
function renderInstantBattleSettingsChips(container, settings) {
  container.innerHTML = "";
  const songSourceChip = describeSongSourceForSettings(settings);
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
  setChecked("online-instant-battle-settings-play-duration", settings.playDurationValue);
  setChecked("online-instant-battle-settings-answer-pool-size", settings.answerPoolSizeValue);

  // 【2026-09-30改訂・本人指示：出題する曲4択統合】js/onlineBattleSongSourceUi.js参照。
  applySongSourceOptionToForm("online-instant-battle-settings-song-source", settings);
}

function readInstantBattleSettingsFromHostForm() {
  const songSourceValue = readSongSourceOptionFromForm("online-instant-battle-settings-song-source");
  const settings = {
    questionCountValue: document.querySelector('input[name="online-instant-battle-settings-question-count"]:checked').value,
    playDurationValue: document.querySelector('input[name="online-instant-battle-settings-play-duration"]:checked').value,
    answerPoolSizeValue: document.querySelector('input[name="online-instant-battle-settings-answer-pool-size"]:checked').value,
    ...buildSongSourceSettingsFields(songSourceValue, { mergedSongIds: getMergedRestrictedSongIds() }),
  };
  return settings;
}

// 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-3章】applyHostSettingsChangeFromForm()と
// 同じ理由で、検証エラー時もFirebaseへの書き込み自体は必ず行う（曲数不足等で「開始できない」
// ことと「設定として保存できない」ことを区別する。開始条件はstartBattle()側が別途守る）。
async function applyInstantBattleHostSettingsChangeFromForm() {
  if (!currentRoomId) return;
  const settings = readInstantBattleSettingsFromHostForm();
  const errorMessage = validateRoomSettings(currentGameMode, settings);
  elements.instantBattleSettingsError.textContent = errorMessage ?? "";
  elements.instantBattleSettingsError.hidden = !errorMessage;
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

// 【2026-09-14新設】共同選曲の内訳UI（js/onlineBattleCollaborativeSelectionUi.js）へ渡す
// 曲id→曲名の解決関数。存在しない曲id（データ不整合等）は安全にidそのものを表示する。
function resolveSongTitleForCollabUi(songId) {
  return SONGS.find((song) => song.id === songId)?.title ?? songId;
}

// 【2026-08-27新設】共同選曲セクション（ホスト・参加者共通）の表示を更新する。
// 「今の自分の選択数」「参加者全員を合わせた選択数・実際に使える数」を表示するだけの
// 表示専用関数（Firebaseへは一切書き込まない）。
function updateCollabSongSectionUi(room, isLyricsQuiz) {
  const isCollaborative =
    !isLyricsQuiz && room.settings?.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  elements.collabSongSection.hidden = !isCollaborative;
  if (!isCollaborative) {
    // 【2026-09-15新設・本人指示：共有曲選択UIをモード変更しても壊れないように】
    resetCollaborativeSelectionDetailsPanel(elements.collabDetailsToggle, elements.collabDetailsPanel);
    return;
  }

  const merged = computeMergedSelectedSongIds(room.players || {});
  const restrictedCount = merged.filter((songId) => currentCommonSongPool.has(songId)).length;
  elements.collabMyCount.textContent = `自分が選んだ曲: ${mySelectedSongIds.length}曲`;
  elements.collabTotalCount.textContent =
    merged.length === 0
      ? "まだ誰も曲を選んでいません。下のボタンから選んでください。"
      : `参加者全員の選択を合わせて${merged.length}曲（このうち${restrictedCount}曲がこの対戦で使えます）`;

  // 【2026-09-14新設・本人指示：誰がどの曲を選んだか／共有曲一覧をリアルタイム反映】
  // パネルが開いているかどうかに関わらず常に最新内容へ描画し直す（開いている間に他の
  // 参加者が選択を変えても、ロビー画面自体はroom監視で再描画され続けているため自然に
  // 追従する）。人数・曲数ともに小規模なため、毎回作り直しても負荷は問題にならない。
  renderCollaborativeSelectionBreakdown({
    byPlayerListElement: elements.collabByPlayerList,
    uniqueSongListElement: elements.collabUniqueSongList,
    players: room.players || {},
    songTitleResolver: resolveSongTitleForCollabUi,
    currentUid: getCurrentUid(),
  });

  // 【2026-09-15新設・本人指示：曲選択画面を開いたままリアルタイム同期】全曲選択画面
  // （js/onlineBattleSongPicker.js）を開いている間も、room監視のたびにこの関数は呼ばれ
  // 続けている。画面が今まさに開かれている場合だけ、検索・スクロール状態を壊さない
  // 差分更新関数を呼ぶ（room.playersの購読を新しく増やさず、既存の購読へ相乗りする）。
  if (document.body.dataset.screen === "onlineBattleSongPicker") {
    updateOnlineBattleSongPickerLiveSelections({
      players: room.players || {},
      currentUid: getCurrentUid(),
      mergedTotalCount: merged.length,
      restrictedCount,
    });
  }
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
  // 【2026-09-15新設・本人指示：画面を開いたままリアルタイム同期】画面を開いた瞬間は
  // Firebaseからの新しい通知を待たずに、既に持っている最新のroomデータで即座に
  // バッジ・サマリーを表示する（次にroomが更新されるまで空欄のままになるのを防ぐ）。
  if (latestRoom) {
    const merged = computeMergedSelectedSongIds(latestRoom.players || {});
    updateOnlineBattleSongPickerLiveSelections({
      players: latestRoom.players || {},
      currentUid: getCurrentUid(),
      mergedTotalCount: merged.length,
      restrictedCount: merged.filter((songId) => currentCommonSongPool.has(songId)).length,
    });
  }
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

  // 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド26章】ホストが自分の分の
  // 「ルーム設定に戻る」を押すと、room.statusがまだresultのまま（他の参加者が結果画面から
  // 戻り終えていない）でも、ホストの画面だけはロビー表示へ進む。この状態でも「対戦を
  // 開始する」は既存のisWaitingチェック（room.status===waiting）により自動的に押せない
  // ままになる（安全設計・変更不要）が、以前は理由が一切表示されなかったため、
  // 「誰の結果確認待ちか」が分かる専用の案内を出す。
  if (room.status === ROOM_STATUS.RESULT) {
    const allReturned = computeAllPlayersResultReturned(players);
    const waitingCount = Object.values(players).filter(
      (player) => player.connected !== false && player.resultReturned !== true
    ).length;
    elements.lobbyStartHint.textContent = allReturned
      ? ""
      : `他の参加者が結果画面を確認中です（あと${waitingCount}人）。全員が戻るまで次の対戦を開始できません。`;
    return;
  }

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
  // 【2026-08-30新設→2026-09-15全面書き換え、本人指示：一瞬バトルの同期方式への変更】
  // 一瞬バトルは、歌詞クイズ・一瞬協力と同じ「全員が同じ問題を同時に見る」ホスト主導の
  // 同期進行になったため、これらと同じ理由でprogress/results（このファイルのcurrentMatchIdに
  // 紐づく独立進行専用の仕組み）は一切使わない専用画面へ完全に委譲する。
  if (room.gameMode === INSTANT_BATTLE_GAME_MODE) {
    enterOnlineInstantBattlePlay(room);
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

  // 【2026-09-13追加・本人指示：初回問題消失バグの調査で判明した防御策】
  // js/onlineInstantCoopBattleScreen.jsのenterInstantCoopBattlePlay()・
  // js/onlineLyricsQuizBattleScreen.jsのenterLyricsQuizBattlePlay()と同じ理由の保険。
  // goToCountdownScreen()のsetTimeout経由で呼ばれる場合、渡されるroomがカウントダウン
  // 開始時点のスナップショット（status:"countdown"のまま）のことがある。今のところ
  // js/main.jsのbeginOnlineBattlePlay()はroom.statusを一切参照しないため実害は無いが、
  // 将来status依存のロジックが増えても同じ不具合クラスを再発させないための予防的な統一。
  elements.onStartOnlineBattleQuiz(questions, { ...room, status: ROOM_STATUS.PLAYING });
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

  // 【2026-10-01改訂・本人指示：オンライン対戦の同期回帰の緊急調査】初期値を0固定ではなく、
  // ロビー入室時点から継続購読しているcachedServerTimeOffset（ensureServerTimeOffsetWarm()
  // 参照）から始める。カウントダウン中も継続してこの専用の購読で最新値へ更新し続ける
  // （countdownOffsetUnsubscribeで個別に解除できる、という既存の設計はそのまま維持）。
  let serverTimeOffset = cachedServerTimeOffset;
  countdownOffsetUnsubscribe = subscribeServerTimeOffset((offset) => {
    serverTimeOffset = offset;
    cachedServerTimeOffset = offset;
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
        elements.countdownNumber.classList.remove("is-ticking");
        void elements.countdownNumber.offsetWidth;
        elements.countdownNumber.classList.add("is-ticking");
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
        // 【2026-10-01追加・本人指示：オンライン対戦の同期回帰の緊急調査】この0.5秒の間に、
        // 万一別の部屋へ移動した・試合が無効化されて新しいactiveMatchIdへ進んだ等、
        // 状況が変わっていた場合に備え、発火直前に「今も同じ部屋・同じ試合を指しているか」を
        // 確認する（js/onlineInstantBattleScreen.jsのhandlePlaybackFailure()で見つかった
        // matchIdの古さチェックと同じ考え方）。古くなっていれば何もしない
        // （renderLobby()側の別のroom更新が、その時点の正しい画面へ既に進めているはず）。
        const capturedRoomId = room.roomId;
        const capturedActiveMatchId = room.activeMatchId;
        setTimeout(() => {
          if (
            !isCountdownCompletionStillValid({
              capturedRoomId,
              capturedActiveMatchId,
              currentRoomId,
              latestActiveMatchId: latestRoom?.activeMatchId ?? null,
            })
          ) {
            return;
          }
          enterOnlineBattlePlay(room);
        }, 500);
      }
      return;
    }
    const secondsRemaining = String(Math.ceil(msRemaining / 1000));
    if (secondsRemaining !== lastCountdownDisplayValue) {
      lastCountdownDisplayValue = secondsRemaining;
      playSfx(SFX_EVENTS.COUNTDOWN_TICK);
      // 【2026-09-16修正・本人指摘：一瞬バトルと同じチラつきパターン】数字が実際に
      // 切り替わった瞬間だけ拍動アニメーションを1回再生する（js/localReplayCountdown.js
      // と同じ、一度クラスを外してreflowを挟んでから付け直す手法）。
      elements.countdownNumber.classList.remove("is-ticking");
      void elements.countdownNumber.offsetWidth;
      elements.countdownNumber.classList.add("is-ticking");
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
  // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】誰か1人でも
  // 音源トラブルを申告し、matchInvalidatedが立った試合は、勝敗を付けず全員を安全にロビーへ
  // 戻す。「申告した本人だけが抜けて残りのプレイヤーだけで続行する」実装には絶対にしない、
  // という本人指示のとおり、実際にroom.statusをwaitingへ戻す操作（returnRoomToLobby()）は、
  // 申告した本人ではなく、その時点の現ホスト（room.host。申告者自身がホストでもよい）の
  // 端末だけが行う。既存のreturnRoomToLobby()をそのまま再利用することで、ルーム設定・
  // 参加者・共有曲選択など、再戦に必要な設定を壊さず保ったままロビーへ戻せる。
  if (isHost && room.status === ROOM_STATUS.PLAYING && matchInvalidationReturnRequestedForMatchId !== room.activeMatchId) {
    const activeMatch = room.matches?.[room.activeMatchId];
    if (isMatchInvalidated({ match: activeMatch })) {
      matchInvalidationReturnRequestedForMatchId = room.activeMatchId;
      returnRoomToLobby({ roomId: room.roomId });
    }
  }
  // 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド26-29章】ホストの端末だけが、
  // room更新のたびに「結果画面から全員（切断中を除く）が戻り終えたか」を確認し、揃っていれば
  // room.statusをwaitingへ戻す。関数自体が「既にwaiting・条件未成立なら何もしない」安全設計
  // （js/onlineBattle.jsのmaybeFinalizeReturnToLobbyIfAllReturned()参照）のため、
  // 何度呼んでも安全（本人指示：全員が結果画面を確認し終えるまで、次の試合を始めさせない）。
  if (isHost && room.status === ROOM_STATUS.RESULT) {
    maybeFinalizeReturnToLobbyIfAllReturned({ roomId: room.roomId, room });
  }
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
  // 【2026-10-01改訂・本人指示：実機で発覚、「曲を選んで出題」なのに「現在有効な共有曲は
  // N曲です」という無関係な数字が表示されて混乱するバグの調査】このnoticeは「このgameModeで
  // 出題されうる全曲のうち、今何曲分のデータを参加者全員が持っているか」という、選択した曲とは
  // 無関係な指標。④「曲を選んで出題」を使っている間は、js/onlineBattleCollaborativeSelectionUi.js
  // の内訳表示（「参加者全員の選択を合わせてN曲（このうちM曲がこの対戦で使えます）」）が
  // 既に同じ種類のより正確な情報を出しているため、二重に矛盾した数字を見せないよう
  // このnoticeは隠す（categoryFilterValueによる絞り込み自体は行っていない・今回追加調査でも
  // 発見できなかった。この通知の重複表示が「隠れフィルタが効いている」ように見えていた
  // 主因と判断した）。
  const isUsingCollaborativeSelection =
    room.settings?.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  if (isUsingCollaborativeSelection) {
    elements.lobbyCommonSongNotice.hidden = true;
    elements.lobbyCommonSongNotice.classList.remove("is-empty");
  } else {
    renderCommonSongNotice(allEligibleSongIds.length, currentCommonSongPool.size);
  }

  // 状態遷移の検知は、後続の描画判定（設定変更通知の抑制など）でも使うため先に行っておく。
  const previousStatus = lastHandledRoomStatus;
  const statusJustChanged = room.status !== previousStatus;
  // ホストが「ルーム設定に戻る」を選んだ結果のREADYリセットでは、既存の「設定が変更されました」
  // 通知（本来は設定変更によるREADY解除用）を誤って出さないよう、別扱いにする。
  // 【2026-09-05改訂、本人指示】以前はresultからの遷移だけを見ていたが、「対戦中にホストが
  // ルーム設定へ戻れるようにしてほしい」という要望を受け、countdown・playing中からの
  // 復帰（returnRoomToLobby()）も同じ扱いにする。
  // 【2026-09-13追加・本人指示：対戦開始前ルール確認画面】「もう一度」の再戦で参加者構成が
  // 変わっていた場合、result→waitingへ戻ると同時にconfirmingMatchも立てて再戦前にルール
  // 確認を挟む（js/onlineBattle.jsのbeginMatchConfirmation()参照）。この場合は「ロビーへ
  // 戻った」のではなく「ルール確認画面へ進む」ため、通常の「ロビーへ戻る」扱いからは除外する。
  // 【再戦準備フェーズ新設・本人指示】結果画面の「もう一度」は今、必ずresult→waitingへ戻ると
  // 同時にconfirmingRematchを立てる（js/onlineBattle.jsのbeginRematchReadyCheck()参照）。
  // これも「ロビーへ戻った」のではなく「再戦準備フェーズへ進んだ」ため、上と全く同じ理由で
  // 通常の「ロビーへ戻る」扱いからは除外する（除外しないと、ゲスト端末が再戦準備画面では
  // なく素のロビー画面へ誤って遷移してしまう）。
  const isReturnedToLobby =
    statusJustChanged &&
    room.status === ROOM_STATUS.WAITING &&
    room.confirmingMatch !== true &&
    room.confirmingRematch !== true &&
    (previousStatus === ROOM_STATUS.RESULT || previousStatus === ROOM_STATUS.COUNTDOWN || previousStatus === ROOM_STATUS.PLAYING);
  // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】この「ロビーへ
  // 戻った」が、誰かの音源トラブル申告による試合全体無効化（matchInvalidated）が原因かどうか。
  // room.activeMatchIdは、returnRoomToLobby()を呼んでもここでは書き換えないため（既存の
  // 設計、js/onlineBattle.jsのreturnRoomToLobby()のコメント参照）、statusがwaitingへ
  // 変わった後も、直前まで進行していた（無効になった）試合のmatches/{matchId}を
  // 引き続き参照できる。ホスト・ゲストどちらの画面でも、この判定だけを見て専用の通知を
  // 出し分ける（下記参照）。
  const wasMatchInvalidatedOnReturn = isReturnedToLobby && isMatchInvalidated({ match: room.matches?.[room.activeMatchId] });
  if (statusJustChanged) {
    lastHandledRoomStatus = room.status;
  }
  const playerList = Object.entries(players)
    .sort(compareParticipantEntriesForLobbyDisplay(myUid))
    .map(([uid, player]) => ({ uid, ...player }));

  elements.lobbyPlayerList.innerHTML = "";
  playerList.forEach((player) => {
    const row = document.createElement("li");
    row.className = "online-lobby-player-row";
    if (player.uid === myUid) row.classList.add("is-me");

    // 推し（最推し）が設定されていれば、名前の左に推し色＋代表称号バッジのアイコンを添える。
    const oshiDot = createOshiDotElement(player.oshiMemberId, player.uid);
    if (oshiDot) row.appendChild(oshiDot);

    // 【2026-09-07新設・本人指示：ルーム参加者プロフィール】名前をタップすると、その人の
    // 簡易プロフィール（表示名・推し・獲得済み称号）をモーダルで見られる。READY等の
    // 参加状態には一切触れない、読み取り専用の操作。
    const name = document.createElement("button");
    name.type = "button";
    name.className = "online-lobby-player-name online-lobby-player-name-button";
    name.textContent = player.name + (player.uid === myUid ? "（あなた）" : "");
    name.addEventListener("click", () => {
      // 参加者名タップでプロフィールモーダルを開く操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      openParticipantProfile(player);
    });
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

  // 【2026-08-30新設→2026-10-01改訂・本人指示】対戦モード選択は、待機中だけ表示する
  // （試合中はFirebase Rules側でも書き込みを拒否するため、UI側でも先に隠しておく）。
  // 常時表示化に伴い、ホスト・参加者どちらにも見えるようにした（参加者側はラジオを
  // disabledにして読み取り専用にし、今のモードとの同期だけを受け取る）。
  elements.lobbyModeChange.hidden = room.status !== ROOM_STATUS.WAITING;
  if (!elements.lobbyModeChange.hidden) {
    // 【本人指示：候補選択中にラジオが勝手に戻るチラつきを防ぐ】ホストがまだ確定させて
    // いない候補を選んでいる間（modeChangeHasPendingSelection===true）は、room.gameMode
    // 自体が実際にはまだ変わっていない（＝自分の書き込みがまだ反映されていない）限り、
    // このroom更新による再同期をスキップする。room.gameModeが実際に変わった（自分の
    // 書き込みが反映された、または他の要因でモードが変わった）ら、通常どおり同期する。
    const gameModeActuallyChanged = room.gameMode !== lastSyncedRoomGameModeForModeChange;
    const shouldSkipResync = isHost && modeChangeHasPendingSelection && !gameModeActuallyChanged;
    if (!shouldSkipResync) {
      const modeRadios = document.querySelectorAll('input[name="online-battle-lobby-mode-change-select"]');
      modeRadios.forEach((radio) => {
        radio.checked = radio.value === room.gameMode;
        radio.disabled = !isHost;
      });
      modeChangeHasPendingSelection = false;
      lastSyncedRoomGameModeForModeChange = room.gameMode;
    }
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
  // 【2026-09-15新設・本人指示：共有曲選択UIをモード変更しても壊れないように】
  // updateLyricsCollabSongSectionUi()はrenderLyricsQuizLobbySettings()経由でしか
  // 呼ばれず、それはisLyricsQuizのときしか呼ばれないため、「歌詞クイズ→他モード」への
  // 切り替え時にこのセクションを隠す機会が無かった（上のlobbySettingsHostLyricsと
  // 全く同じ理由・同じ対策パターン）。歌詞クイズ以外のときは、renderLobby()から毎回
  // 無条件でこのセクションを強制的に隠す。
  if (!isLyricsQuiz) forceHideLyricsCollabSongSection();
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
      // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】音源トラブルに
      // よる試合無効化が理由でロビーへ戻った場合は、「ホストがルーム設定に戻しました。」という
      // 通常の文言では理由が伝わらないため、この汎用通知は出さず、専用の通知
      // （lobbyMatchInvalidatedNotice、下のstatusJustChanged分岐で全員に表示する）に譲る。
      elements.lobbyRematchNotice.hidden = wasMatchInvalidatedOnReturn;
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
  // 【2026-10-01新設・本人指示：「曲を選んで出題」でモード変更後に有効曲数がおかしい問題の
  // 根本調査】js/onlineLyricsQuizBattleScreen.jsのrefreshLyricsSettingsErrorDisplay()と
  // 全く同じ理由。エラー文言は「実際に設定を書き込んだ操作」の中でしか更新されておらず、
  // syncCollaborativeSongPoolIfHost()が書き込みをスキップした場合（既に最新値と一致）は
  // 古い曲数のまま表示され続けていた。room更新のたび、書き込みの有無に関わらず必ず
  // 「今のフォーム内容（＝最新のcurrentCommonSongPoolで絞り込んだ曲数を含む）」で
  // 検証エラー表示を同期し直す。
  if (isHost && !isLyricsQuiz) {
    if (isInstantBattle) {
      const freshError = validateRoomSettings(currentGameMode, readInstantBattleSettingsFromHostForm());
      elements.instantBattleSettingsError.textContent = freshError ?? "";
      elements.instantBattleSettingsError.hidden = !freshError;
    } else if (!isInstantCoop) {
      const freshError = validateRoomSettings(currentGameMode, readSettingsFromHostForm());
      elements.lobbyStartError.textContent = freshError ?? "";
      elements.lobbyStartError.hidden = !freshError;
    }
  }

  // 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】room.statusは意図的に
  // 変更していない（"waiting"のまま）ため、confirmingMatchの変化はstatusJustChanged
  // では検知できない。別枠のフラグとして追跡する。room.statusがwaiting以外に
  // なった瞬間（＝全員確認完了→startBattle()成功）は、confirmingMatchも同時にfalseへ
  // 戻るため、下のstatusJustChanged分岐（countdown等）へ自然に引き継がれる。
  const wasConfirmingMatch = lastHandledConfirmingMatch;
  const isConfirmingMatchNow = room.confirmingMatch === true && room.status === ROOM_STATUS.WAITING;
  if (isConfirmingMatchNow !== wasConfirmingMatch) {
    lastHandledConfirmingMatch = isConfirmingMatchNow;
    if (isConfirmingMatchNow) {
      enterMatchConfirmScreen(room);
    } else if (room.status === ROOM_STATUS.WAITING) {
      // ホストが確認をキャンセルした場合だけここに来る（対戦開始成功時はstatusが
      // waiting以外になっているため、この分岐には来ない）。
      clearTimeout(matchConfirmAutoStartTimerId);
      matchConfirmAutoStartTimerId = null;
      elements.navigateTo("onlineBattleLobby");
    }
  }
  if (isConfirmingMatchNow) {
    renderMatchConfirmScreen(room);
  }

  // 【再戦準備フェーズ新設・本人指示】上のconfirmingMatchと全く同じ考え方・同じ理由で、
  // confirmingRematchも別枠のフラグとして追跡する。room.statusがwaiting以外になった
  // 瞬間（＝全員準備OK完了→finishRematchReadyCheck()成功）は、confirmingRematchも同時に
  // falseへ戻るため、下のstatusJustChanged分岐（countdown等）へ自然に引き継がれる。
  // 【再戦準備フェーズ新設・本人指示→2026-10-01全面改訂：結果画面/再戦フロー全面設計】
  // 再戦準備専用の別画面（#online-battle-rematch-ready-screen）は廃止し、結果画面を見ている
  // 人はその場（インラインの再戦準備パネル、renderResultReturnPanel()参照）で完結させる。
  // 結果画面を見ていない人（ロビー画面等にいる人）だけ、従来どおり専用の別画面
  // （enterRematchReadyScreen/renderRematchReadyScreen、後方互換のフォールバック）へ案内する。
  const wasConfirmingRematch = lastHandledConfirmingRematch;
  const isConfirmingRematchNow = room.confirmingRematch === true && room.status === ROOM_STATUS.WAITING;
  const isOnResultScreenNow = RESULT_SCREEN_NAMES.has(document.body.dataset.screen);
  if (isConfirmingRematchNow !== wasConfirmingRematch) {
    lastHandledConfirmingRematch = isConfirmingRematchNow;
    if (isConfirmingRematchNow) {
      if (!isOnResultScreenNow) {
        enterRematchReadyScreen(room);
      }
      // 結果画面を見ている人は、renderResultReturnPanel()側の再同期が
      // このconfirmingRematch:trueを検知してインラインパネルを表示する。
    } else if (room.status === ROOM_STATUS.WAITING) {
      // 再戦準備がキャンセルされた（全員準備OKで開始成功した場合はstatusが
      // waiting以外になっているため、この分岐には来ない）。
      clearTimeout(rematchReadyAutoStartTimerId);
      rematchReadyAutoStartTimerId = null;
      // 【2026-10-01改訂】結果画面を見ている人は、そのまま結果画面に留める（強制的に
      // ロビーへ切り替えない。本人指示：再戦提案がキャンセルされても、通常の
      // 「各自のペースでルーム設定に戻る」フローへ戻るだけで、画面を強制的に切り替える
      // 必要は無い）。結果画面にいない人（専用の別画面を見ていた人）だけ、
      // 今までどおりロビーへ切り替える。
      if (!isOnResultScreenNow) {
        elements.navigateTo("onlineBattleLobby");
        // 【本人指示6：ゲストへの通知】ホスト自身は自分の操作の結果なので通知は不要だが、
        // 待っていたゲストには「なぜロビーへ戻ったのか」が分かる短い通知を出す（既存の
        // lobbyRematchNotice/lobbySettingsChangedNoticeと同じく、!isHostのときだけ表示する）。
        if (!isHost && elements.lobbyRematchCancelledNotice) elements.lobbyRematchCancelledNotice.hidden = false;
      }
    }
  }
  if (isConfirmingRematchNow && !isOnResultScreenNow) {
    renderRematchReadyScreen(room);
  }

  // ホストが開始すると、まずcountdown・その後playingへ進む。状態が変わった瞬間だけ
  // 画面遷移を行い（同じ状態のまま何度renderLobbyが呼ばれても遷移し直さない）、
  // カウントダウンを自分の端末で見ている最中は、statusのplayingへの変化を無視する
  // （goToCountdownScreen()側のローカルタイマーが、開始確認画面への遷移を担当するため。
  // 上のコメント参照：通信環境の差でタイミングがずれるのを防ぐ設計）。
  // 【2026-10-01改訂・本人指示：オンライン対戦の同期回帰の緊急調査】「状態が変わった瞬間、
  // 次にどの画面へ進むべきか」の判定そのものは、Firebase書き込み・DOM操作を一切伴わない
  // 純粋関数resolveOnlineBattleStatusTransition()（js/onlineBattleStatusTransitionPayloads.js）
  // へ切り出した。判定内容自体は以前のif/elseと完全に同じで、動きは変えていない
  // （本人指示：ホスト・ゲストが同じroomスナップショットに対して必ず同じ行動を取ることを、
  // この関数の型そのもの＝isHostという引数を持たないことで保証し、恒久テストで検証できる
  // 形にする）。
  const transition = resolveOnlineBattleStatusTransition({
    statusJustChanged,
    previousStatus,
    roomStatus: room.status,
    hasVoluntarilyLeftActiveMatch: hasVoluntarilyLeftMatch(room.activeMatchId),
    isActiveMatchInvalidated: isMatchInvalidated({ match: room.matches?.[room.activeMatchId] }),
    isReturnedToLobby,
    currentScreenIsQuiz: document.body.dataset.screen === "quiz",
    currentScreenIsResultScreen: RESULT_SCREEN_NAMES.has(document.body.dataset.screen),
    hasRespondedToCurrentResultScreen: hasRespondedToCurrentResultScreen(),
    isLyricsQuiz,
    isInstantBattle,
    isInstantCoop,
  });

  switch (transition.action) {
    case ONLINE_BATTLE_TRANSITION_ACTION.ENTER_COUNTDOWN:
      goToCountdownScreen(room);
      break;
    case ONLINE_BATTLE_TRANSITION_ACTION.ENTER_PLAY:
      // カウントダウンを経由せずplayingを検知した＝出遅れて参加/再接続した端末。
      // 自分のローカルカウントダウンは持っていないので、直接出題を開始する。
      enterOnlineBattlePlay(room);
      break;
    case ONLINE_BATTLE_TRANSITION_ACTION.ENTER_RESULT:
      // 結果確定を検知したら結果画面へ進む（自分がまだクイズ回答中のときは
      // resolveOnlineBattleStatusTransition()側で既に除外済み）。
      if (transition.resultKind === ONLINE_BATTLE_RESULT_KIND.LYRICS_QUIZ) {
        enterLyricsQuizResult(room);
      } else if (transition.resultKind === ONLINE_BATTLE_RESULT_KIND.INSTANT_BATTLE) {
        enterInstantBattleResult(room);
      } else if (transition.resultKind === ONLINE_BATTLE_RESULT_KIND.INSTANT_COOP) {
        enterInstantCoopResult(room);
      } else {
        goToResultScreen(room);
      }
      break;
    case ONLINE_BATTLE_TRANSITION_ACTION.WAIT_FOR_RESULT_RESPONSE:
      // 自分自身が今まさに結果画面を見ていて、まだ自分の意思表示（ルーム設定に戻る／
      // もう一度の準備をする）をしていない場合は、この自動遷移を行わない（本人指示：
      // 他人の結果画面を勝手に閉じない）。renderLobby()自体はこの後も最後まで実行を
      // 続ける（updateOnlineBattlePlayUi()等、下の処理を巻き込んでスキップしない）。
      break;
    case ONLINE_BATTLE_TRANSITION_ACTION.RETURN_TO_LOBBY:
      // ホストが「もう一度」以外の操作（ルーム設定に戻る／対戦中断／音源トラブルによる
      // 試合全体無効化）を選んだ→全端末（ホスト含む）を自動的にロビーへ戻す。前回の試合に
      // 関するローカル状態（progress/results監視の元になるcurrentMatchId、カウントダウン
      // タイマー、進捗ストリップ、歌詞クイズ・一瞬協力それぞれの進行状態）を確実に後片付けして
      // から遷移する（本人の要望：次の試合を始めたときに前回の画面・データが
      // 混ざらないこと。対戦の途中で呼ばれた場合も同じ後片付けで安全に戻せる）。
      resetOnlineBattleMatchState();
      resetLyricsQuizBattleState();
      elements.navigateTo("onlineBattleLobby");
      // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】ホスト・
      // ゲストを問わず、全参加者に「なぜこの試合が無効になり、ロビーへ戻ったのか」が
      // ひと目で分かる専用の通知を出す（本人指示：理由が明確に伝わる通知を表示すること）。
      // ロビーへ戻るたびに、今回の試合が無効化によるものかどうかで毎回表示を決め直す
      // ことで、「次の試合に移った段階で前試合の無効理由が分かる程度」に留め、それ以降の
      // 試合には持ち越さないようにする。
      if (elements.lobbyMatchInvalidatedNotice) {
        elements.lobbyMatchInvalidatedNotice.hidden = !wasMatchInvalidatedOnReturn;
      }
      break;
    default:
      break;
  }

  updateOnlineBattlePlayUi(room);
  if (isLyricsQuiz) {
    handleLyricsQuizRoomUpdate(room);
  } else if (isInstantBattle) {
    handleInstantBattleRoomUpdate(room);
  } else if (isInstantCoop) {
    handleInstantCoopRoomUpdate(room);
  }

  // 【2026-09-15新設・本人指示：ゲスト結果画面の再監査（ホスト移譲との関係）】結果画面の
  // ホスト/ゲスト用ボタンの出し分けは、以前は結果画面へ「遷移した瞬間」（statusJustChanged）
  // にしか計算されておらず、結果画面を表示したままホスト自動移譲（8秒切断ルール）が
  // 起きても再計算されなかった。room更新のたび（このrenderLobby()が呼ばれるたび）に、
  // 今まさに結果画面を見ている場合だけ、ボタンの出し分けを軽量に再同期する
  // （3画面とも同じ考え方、重いDOM再構築・効果音の再生は行わない）。
  syncResultScreenHostGuestButtons(room);
  syncLyricsResultHostGuestButtons(room);
  syncInstantBattleResultHostGuestButtons(room);
  syncInstantCoopResultHostGuestButtons(room);
}

function syncResultScreenHostGuestButtons(room) {
  if (document.body.dataset.screen !== "onlineBattleResult") return;
  const isHostOnResultScreen = room.host === getCurrentUid();
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
  renderResultReturnPanel(room);
}

// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド23-29章】結果画面の
// 「結果確認の状況」一覧・「もう一度」提案への案内を、room更新のたびに軽量に再描画する。
// js/onlineLyricsQuizBattleScreen.js・js/onlineInstantBattleScreen.js・
// js/onlineInstantCoopBattleScreen.jsも同じ考え方の専用関数を持つ（本人指示：共通処理は
// 再利用しつつ、各モードのmatch.participantsの形が微妙に異なるため、描画自体は分ける）。
function renderResultReturnPanel(room) {
  const match = (room.matches || {})[currentMatchId] || {};
  const participants = match.participants || {};
  const players = room.players || {};
  const myUid = getCurrentUid();
  const isHostOnResultScreen = room.host === myUid;

  if (elements.resultReturnStatusList) {
    elements.resultReturnStatusList.innerHTML = "";
    Object.entries(participants).forEach(([uid, participant]) => {
      const hasReturned = players[uid]?.resultReturned === true;
      const row = document.createElement("li");
      row.className = "online-battle-result-return-status-row";
      const nameSpan = document.createElement("span");
      nameSpan.className = "online-battle-result-return-status-name";
      nameSpan.textContent = uid === myUid ? `${participant.displayName}（あなた）` : participant.displayName;
      row.appendChild(nameSpan);
      const badge = document.createElement("span");
      badge.className = `online-battle-result-return-status-badge ${hasReturned ? "is-done" : "is-waiting"}`;
      badge.textContent = hasReturned ? "ロビーへ戻りました" : "結果確認中";
      row.appendChild(badge);
      elements.resultReturnStatusList.appendChild(row);
    });
  }

  // 【2026-10-01全面改訂・本人指示：結果画面/再戦フロー全面設計】「もう一度」が提案されて
  // いる間（room.confirmingRematch）、結果画面を離れさせず、この場（インラインパネル）で
  // 再戦準備を完結させる。ホスト・ゲストどちらにも表示し、参加者ごとの準備状況・
  // 準備OKの切り替えをその場で行える（本人指示：再戦準備専用の別画面は使わない）。
  const isConfirmingRematch = room.confirmingRematch === true;
  if (elements.resultRematchPanel) {
    elements.resultRematchPanel.hidden = !isConfirmingRematch;
  }
  if (isConfirmingRematch) {
    if (elements.resultRematchPanelLead) {
      elements.resultRematchPanelLead.textContent = isHostOnResultScreen
        ? "再戦を準備中です。全員の準備が揃うと自動的に始まります。"
        : "ホストが「もう一度」を選びました。準備ができたら「準備OK」を押してください。";
    }
    if (elements.resultRematchSummary) renderRematchSummaryChips(elements.resultRematchSummary, room);
    renderRematchPlayerList(elements.resultRematchPlayerList, room);
    const allReady = computeAllPlayersRematchReady(players);
    const myReady = players[myUid]?.rematchReady === true;
    // 【2026-11-XX改訂・本人指示：結果/再戦フロー最終仕様】ホストは提案した瞬間から
    // 常に準備済み扱い（beginRematchReadyCheck()参照）のため「準備OK」は出さず、
    // 押すと再戦提案そのものを取り消す専用ボタンとして見せる（新しい取消ボタンを
    // 追加するのではなく、この同じボタンを切り替える）。ゲストは今までどおり
    // 自分の準備状態をトグルするボタンのまま。
    if (elements.resultRematchToggleButton) {
      elements.resultRematchToggleButton.textContent = isHostOnResultScreen
        ? "再戦を取り消す"
        : myReady
          ? "準備を取り消す"
          : "✓ 準備OK";
      elements.resultRematchToggleButton.classList.toggle("is-confirmed", myReady && !isHostOnResultScreen);
    }
    if (elements.resultRematchAllDoneNotice) {
      elements.resultRematchAllDoneNotice.hidden = !allReady;
    }
    driveRematchReadyAutoStart(room);
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
  // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】前のルーム・
  // 前の試合の通知・追跡状態が新しいルームの画面へチラついて紛れ込まないよう、必ずリセットする
  // （下のlobbyRematchCancelledNoticeと同じ理由）。
  if (elements.lobbyMatchInvalidatedNotice) elements.lobbyMatchInvalidatedNotice.hidden = true;
  matchInvalidationReturnRequestedForMatchId = null;
  // 【再戦準備フェーズ新設・本人指示】前のルーム・前の試合の状態が新しいルームの画面へ
  // チラついて紛れ込まないよう、確認フェーズの追跡状態も必ずリセットする（このファイル
  // 冒頭のlastHandledConfirmingRematch宣言部のコメント参照）。
  if (elements.lobbyRematchCancelledNotice) elements.lobbyRematchCancelledNotice.hidden = true;
  lastHandledConfirmingRematch = false;
  clearTimeout(rematchReadyAutoStartTimerId);
  rematchReadyAutoStartTimerId = null;
  elements.lobbyStartError.hidden = true;
  stopListeningToRoom();
  unsubscribeRoom = listenToRoom(roomId, renderLobby);
  elements.navigateTo("onlineBattleLobby");
  reportMyAvailableSongIdsForRoom(roomId);
  // 【2026-10-01新設・本人指示：オンライン対戦の同期回帰の緊急調査】カウントダウンが
  // 始まる前（ロビー滞在中）からサーバー時計とのズレを購読しておく（上のコメント参照）。
  ensureServerTimeOffsetWarm();
  // 【2026-10-01新設・本人指示：対戦モード常時表示化】前のルームでの候補選択待ち状態を、
  // 新しいルームへ持ち越さない。
  modeChangeHasPendingSelection = false;
  lastSyncedRoomGameModeForModeChange = null;
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
    const oshiDot = createOshiDotElement(row.oshiMemberId, row.uid);
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
//
// 【2026-09-16改訂・本人指示：対戦中に自主退出したゲストを待ち続けない】hasLeftは元々
// 「room.playersから消えた（実際に切断・退出した）」ことだけを表していたが、「この試合
// だけ抜ける」（leftDuringMatch:true）はroom.players・接続状態には一切触れない設計
// （js/onlineBattleLeaveMatchPrompt.js参照）のため、以前はこの2つの状態が区別されず、
// 自主退出した本人はいつまでも「対戦中（answeredCount）」のまま表示され続けていた。
// どちらも「もうこの人の結果は待たない」という意味では同じなので、hasLeftの意味を
// 「実際に退出／自主的にこの試合から抜けた、のどちらか」へ広げ、表示・待機判定の両方で
// 同じ1つのフラグとして扱えるようにした。
// 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】以前はここに
// audioTroubleAbort（音源トラブルの自己申告によるマッチ離脱・本人だけに付く個人フラグ）を
// hasLeftへ含める分岐があったが撤廃した。今の設計では音源トラブルの申告は「試合全体の
// 無効化」（matches/{matchId}/matchInvalidated）を引き起こし、無効になった試合は
// status:resultへ進まない＝この一覧・結果画面そのものが表示されなくなる（全員が
// 自動的にロビーへ戻される）ため、参加者ごとの個別表示は不要になった。
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
      hasLeft: !livePlayer || participant.leftDuringMatch === true,
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

    const oshiDot = createOshiDotElement(row.oshiMemberId, row.uid);
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
  // 【2026-09-16改訂・本人指示：対戦中に自主退出したゲストを待ち続けない】単純に
  // rows.every(finished)にすると、途中退出者が待つ対象から外れず、DNF確定ボタンが
  // 意図せず出続けてしまう。js/onlineBattle.jsのfinalizeMatchIfReady()と全く同じ
  // isMatchReadyToFinalize()を使い、判定を1本化する。
  const match = (room.matches || {})[currentMatchId] || {};
  const allFinished = isMatchReadyToFinalize({ participants: match.participants, progress: match.progress });

  // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】この試合が
  // 誰かの音源トラブル申告で既に無効試合になっている場合は、ホストが「結果を確定する」を
  // 押しても意味が無い（js/onlineBattle.jsのfinalizeMatchIfReady()側でも同じ理由で拒否する
  // 二重の安全策になっている）。ボタン自体を隠しておき、押せない・押しても無駄という
  // 混乱をUI側でも防ぐ。無効化を検知したこの試合は、renderLobby()側が自動的に
  // returnRoomToLobby()を呼ぶため、この待機画面もまもなくロビーへ切り替わる。
  const isInvalidated = isMatchInvalidated({ match });

  const hostRow = rows.find((row) => row.isHost);
  elements.waitingHostDisconnectNotice.hidden = !(hostRow && !hostRow.hasLeft && !hostRow.connected);
  elements.waitingFinalizeButton.hidden = !(isHost && myFinished && !allFinished) || isInvalidated;

  if (isHost && room.status === ROOM_STATUS.PLAYING && !isInvalidated) {
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
    const isHostNow = room.host === myUid;
    if (elements.quizBackToLobbyButton) {
      elements.quizBackToLobbyButton.hidden = !isHostNow;
    }
    // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】ホストには出さず、
    // ゲストにだけ見せる。
    if (elements.quizLeaveMatchButton) {
      elements.quizLeaveMatchButton.hidden = isHostNow;
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

  // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド23-29章】新しい結果画面に
  // 入るたび、「もう一度」「ルーム設定に戻る」への自分自身の意思表示をまだしていない状態
  // から始める（他モードの結果画面と混ざらないよう、必ずここでリセットする）。
  resetResultScreenResponded();

  // 【2026-09-05改訂、本人指示】試合後の選択肢「もう一度」は
  // ホスト専用（対戦設定を書き換えられるのがホストだけという既存の権限設計と揃えている）。
  // 非ホストには代わりに「⌂ホームへ戻る」だけを見せる。
  const isHostOnResultScreen = room.host === myUid;
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  // 【2026-09-07新設・本人指示：ゲスト結果画面】ホスト専用ボタンの代わりに、待機案内＋
  // 「ルームから退出」を見せる。
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
  // 【2026-09-30新設】「結果確認の状況」一覧・「もう一度」提案への案内は、ホスト・ゲスト
  // 共通で毎回再描画する。
  renderResultReturnPanel(room);

  renderSettingsChips(elements.resultConfigSummary, room.settings, room.gameMode);
  elements.resultRuleNote.textContent = getRuleDescription(room.gameMode, room.settings);

  const finishers = [];
  const dnfEntries = [];
  Object.entries(participants).forEach(([uid, participant]) => {
    const result = results[uid];
    // 【2026-09-14追加・本人指示：対戦中のゲストが自分だけ途中離脱する】leftDuringMatchが
    // 立っている参加者は、途中まで得点していても正式な順位（finishers）には含めない
    // （本人指示：順位・勝敗・ランキング・称号判定の対象外）。既存のDNF（未終了）扱いの
    // 一覧にそのまま合流させることで、新しい表示区分を増やさずに済む。
    // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】音源トラブルで
    // 試合全体が無効になった（matchInvalidated）場合、この結果画面そのものへ到達しない
    // （status:resultへ進む前にホストが自動的にreturnRoomToLobby()を呼ぶため）。そのため
    // ここではparticipant.leftDuringMatchだけを見ればよく、以前あったaudioTroubleAbort
    // （本人だけがこの試合から抜ける、という撤廃した設計）の条件はもう存在しない。
    if (result && participant.leftDuringMatch !== true) {
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
    const oshiDot = createOshiDotElement(participant.oshiMemberId, uid);
    if (oshiDot) nameRow.appendChild(oshiDot);

    // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド3章】以前は結果画面でも
    // 名前タップでプロフィールを開けたが、「プロフィールはロビーでだけ開けるようにして
    // ほしい」との指示により、結果画面からは開けなくする（タップできそうに見えるボタンの
    // 見た目も付けない）。
    const nameText = document.createElement("span");
    nameText.className = "battle-rank-name-text";
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
  // 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】この関数は
  // goToResultScreen()からしか呼ばれず、goToResultScreen()自体、音源トラブルで試合全体が
  // 無効になった試合（matchInvalidated）では呼ばれない（status:resultへ進む前にホストが
  // 自動的にreturnRoomToLobby()を呼ぶため）。そのため、以前あったaudioTroubleAbort
  // （本人だけがこの試合から抜ける、という撤廃した設計）に基づく早期returnはもう不要——
  // 「誰か1人でも音源トラブルを申告したら、参加者全員分、記録を一切残さない」という
  // 本人指示は、この関数に個別の分岐を持たせるのではなく、そもそも結果画面自体へ
  // 到達させない（＝この関数自体が呼ばれない）という、より確実な形で実現している。

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

// 【2026-09-15新設・本人指示：プレイ履歴へ「途中退出」を保存する】ゲストが対戦中に
// 自分だけ途中離脱した瞬間に呼ぶ。saveOnlineBattleHistoryEntry()と同じid（online:{matchId}）を
// 使うことで、万一この試合が既に何らかの理由で保存済みだった場合の重複を防ぐ
// （savePlayHistoryEntryIfNew()のidベース重複防止をそのまま流用）。
// 【途中退出とDNFの違い】既存のisDnf（結果未送信＝通信断・タイムアウト等、原因を問わない）とは
// 別に、details.isVoluntaryLeave:trueで「本人がルーム設定へ戻るを押した」という意思表示を
// 区別して残す。順位・勝敗・称号には一切関与しない（completed:falseのまま、myRank等は
// 持たせない）ため、既存のDNF向け表示ロジック（「途中終了（DNF）」相当）にそのまま乗るが、
// 履歴画面側は今後isVoluntaryLeaveを見て「途中退出」という文言に出し分けられる。
function saveVoluntaryLeaveHistoryEntry(room, matchId) {
  if (!matchId || !room) return;
  const stats = getCurrentTimeAttackStats();
  const isAllSongsMode =
    !room.settings.questionSource || room.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS;

  savePlayHistoryEntryIfNew({
    id: `online:${matchId}`,
    playedAt: Date.now(),
    modeId: HISTORY_MODE_ID_BY_GAME_MODE[room.gameMode] ?? "onlineTimeAttack",
    modeLabel: HISTORY_MODE_LABEL_BY_GAME_MODE[room.gameMode] ?? "オンライン対戦",
    questionCount: currentMatchTotalQuestions,
    isAllSongsMode,
    correctCount: stats.correctCount,
    wrongCount: stats.missCount,
    skippedCount: null,
    score: null,
    averageResponseMs: null,
    completed: false,
    details: {
      rule: room.settings.rule,
      penaltySeconds: room.settings.penaltySeconds,
      isVoluntaryLeave: true,
      isDnf: false,
      myRank: null,
      participantCount: Object.keys(room.players ?? {}).length,
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

// 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】
// タイムアタック・ランダム再生対戦・アウトロクイズ対戦中に「音が出ない」を確定したときに
// js/main.jsから呼ばれる。
//
// 【設計の変遷】当初は「申告した本人だけがこの試合から安全に抜け、他のプレイヤーの対戦は
// 妨げない」設計（audioTroubleAbort、本人だけに付くフラグ）だったが、本人からの明確な
// 訂正により作り直した：早さが勝敗・記録に直結する速度勝負系では、誰か1人でも本当に
// 音が出なかった時点で、その試合自体の公平性が失われている。そのため今は、この関数の
// 呼び出しがmatches/{matchId}/matchInvalidated（試合全体で共有するwrite-onceフラグ）を
// 立て、勝敗を付けず、参加者全員分の記録を一切残さず、全員を安全にロビーへ戻す
// （実際にroom.statusをwaitingへ戻す操作は、renderLobby()側がmatchInvalidatedを検知した
// 現ホストの端末が行う。js/onlineBattle.jsのreportMatchInvalidatedDueToAudioTrouble()・
// このファイルのrenderLobby()内のreturnRoomToLobby()呼び出し箇所を参照）。
// 「申告した本人だけを抜けさせて残りの人だけで続行する」実装には絶対にしない、という
// 本人指示のとおり。
//
// 【quitOnlineBattleDuringQuiz()との違い】あちらは「対戦をやめる」＝ルームごと完全に退出する
// （leaveRoom()を呼び、ホーム導線のonlineBattleEntry画面へ戻す）のに対し、こちらは
// ルームに残ったまま試合全体を無効化する点が異なる。本人指示どおり、申告した本人を含む
// 全員がルーム設定画面（ロビー）へ戻り、あとから同じルームで再戦を続けられる
// （ルーム・参加者・共有曲選択など、再戦に必要な設定は壊さず保たれる）。
//
// 【画面遷移を先に行う理由】js/onlineBattleLeaveMatchPrompt.jsのpromptLeaveMatch()と同じ
// 安全側の判断：Firebase書き込みの完了を待たずに、まず手元のlatestRoom（直近のroomスナップ
// ショット）でロビー画面を描画してしまう。ネットワークが不安定でもユーザーがクイズ画面に
// 閉じ込められることがないようにするため（書き込みが後から失敗しても、申告した本人の
// ローカルなナビゲーション自体は必ず成功する。他の参加者側は、実際に書き込みが成功した
// ときだけ、room更新を通じて自動的にロビーへ戻る＝データが正としてすべてを決める設計）。
export function abortOnlineBattleMatchDueToAudioTrouble() {
  const roomId = currentRoomId;
  const matchId = currentMatchId;
  if (!roomId || !matchId) return;
  elements.navigateTo("onlineBattleLobby");
  if (latestRoom) renderLobby(latestRoom);
  // fire-and-forget：js/onlineBattle.js側で例外を握りつぶしてreason付きの{ok:false}を返す
  // 設計のため、ここで結果を待つ・エラー処理する必要はない（leaveMatchInProgress()の
  // 呼び出し元と同じ扱い）。書き込みが拒否された場合（既に他の人が先に申告済み・古い試合・
  // 既に結果確定済み等）も、room更新を通じて実際の状態へ自動的に追従する。
  reportMatchInvalidatedDueToAudioTrouble({ roomId, matchId });
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
  elements.entryBackButton.addEventListener("click", () => {
    // ホーム画面へ戻る操作音
    playSfx(SFX_EVENTS.UI_BACK);
    elements.navigateTo("start");
  });
  // 【2026-09-26追加・本人指示：サウンドシステム全面整備5章】オンライン対戦の主要導線
  // （ルーム作成・参加・準備完了・対戦開始・再戦）は、本人の監査で無音だと分かった
  // 箇所のうち特に優先度が高いものとして、他の画面遷移ボタンと同じUI_CLICK/UI_CONFIRMで揃える。
  elements.entryCreateButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.createNameInput.value = getActivePlayer().playerName || "";
    elements.createError.hidden = true;
    if (elements.entryAudioFailureNotice) elements.entryAudioFailureNotice.hidden = true;
    elements.navigateTo("onlineBattleCreate");
  });
  elements.entryJoinButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.joinNameInput.value = getActivePlayer().playerName || "";
    elements.joinRoomCodeInput.value = "";
    elements.joinError.hidden = true;
    if (elements.entryAudioFailureNotice) elements.entryAudioFailureNotice.hidden = true;
    elements.navigateTo("onlineBattleJoin");
  });
  elements.entryLastRoomRejoinButton.addEventListener("click", async () => {
    playSfx(SFX_EVENTS.UI_CLICK);
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

  elements.createBackButton.addEventListener("click", () => {
    // ルーム作成画面から一つ前へ戻る操作音
    playSfx(SFX_EVENTS.UI_BACK);
    elements.navigateTo("onlineBattleEntry");
  });
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
    playSfx(SFX_EVENTS.UI_CONFIRM);
    goToLobby(result.roomId);
  });

  elements.joinBackButton.addEventListener("click", () => {
    // ルーム参加画面から一つ前へ戻る操作音
    playSfx(SFX_EVENTS.UI_BACK);
    elements.navigateTo("onlineBattleEntry");
  });
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
      playSfx(SFX_EVENTS.UI_CONFIRM);
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
    playSfx(SFX_EVENTS.UI_CONFIRM);
    goToLobby(result.roomId);
  });

  // 【2026-08-28変更】誤操作防止のため、いきなり退出せず確認モーダルを必ず挟む
  // （本人指示。「はい」で実際の退出処理、「いいえ」でロビーへ戻るだけ）。
  elements.lobbyLeaveButton.addEventListener("click", () => {
    if (!currentRoomId) return;
    // 退出確認モーダルを開く操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.lobbyLeaveConfirmModal.hidden = false;
  });
  elements.lobbyLeaveCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    elements.lobbyLeaveConfirmModal.hidden = true;
  });
  // 背景部分をクリックしたときも閉じる（#quiz-quit-confirm-modal等、他のモーダルと同じ考え方）。
  elements.lobbyLeaveConfirmModal.addEventListener("click", (event) => {
    if (event.target === elements.lobbyLeaveConfirmModal) {
      playSfx(SFX_EVENTS.UI_BACK);
      elements.lobbyLeaveConfirmModal.hidden = true;
    }
  });
  elements.lobbyLeaveConfirmButton.addEventListener("click", async () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
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

  // 【2026-08-30新設→2026-10-01全面改訂・本人指示：確認ボタン方式の廃止】以前は候補を
  // 選んでから別途「このモードに変更する」を押す2段階方式だったが、「見た目上は選択した
  // つもりで実際の設定はまだ変わっておらず、その状態のまま対戦を始めてしまった」という
  // 誤操作が実機で発生した。タップした瞬間にそのモードを正式なgameModeとしてFirebaseへ
  // 書き込む1段階方式へ変更する。書き込み中（通信の往復が終わるまで）は6択すべてを
  // disabledにし、連打による複数回のFirebase更新・見た目と正式gameModeのズレを防ぐ
  // （本人指示：「内部的には安全にしてください」）。
  document.querySelectorAll('input[name="online-battle-lobby-mode-change-select"]').forEach((radio) => {
    radio.addEventListener("change", async () => {
      if (!currentRoomId) return;
      const nextGameMode = radio.value;
      if (nextGameMode === currentGameMode) return; // 実質変化なし（同じモードの再クリック等）
      // モード変更操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      // 【本人指示：候補選択中にラジオが勝手に戻るチラつきを防ぐ】renderLobby()側の
      // 再同期（room更新のたびに毎回走る）は、room.gameModeが実際にこの値へ追いつくまで
      // スキップする（下のrenderLobby()内、modeChangeHasPendingSelectionの説明コメント参照）。
      modeChangeHasPendingSelection = true;
      const modeRadios = document.querySelectorAll('input[name="online-battle-lobby-mode-change-select"]');
      modeRadios.forEach((input) => {
        input.disabled = true;
      });
      const result = await updateRoomGameMode({ roomId: currentRoomId, gameMode: nextGameMode });
      if (result.ok) {
        playSfx(SFX_EVENTS.UI_CONFIRM);
      } else {
        // 失敗時（通信エラー等）は候補選択を取り消し、今のモードへ戻す。renderLobby()の
        // 次のroom更新で改めてradioが再度有効化される。
        modeChangeHasPendingSelection = false;
        modeRadios.forEach((input) => {
          input.checked = input.value === currentGameMode;
          input.disabled = false;
        });
      }
    });
  });

  // 【2026-11-XX新設・本人指示：優先度10】ゲストはモード変更権限が無いため、6択のラジオは
  // disabledのまま（上のロジックは変更しない）。ただし「見えているのに押しても何も起きない」
  // ままにはせず、ゲストがラベルをタップした場合はそのモードの「ルール・遊び方」を
  // 開いて説明を読めるようにする（実際のモード変更はしない）。ホストはカードタップ＝
  // モード変更のため、ホストの説明閲覧は上の「ルール・遊び方」ボタンから行う想定
  // （本人指示のとおり、ここではホストのクリックには介入しない）。
  document.querySelectorAll('#online-battle-lobby-mode-change-fieldset label').forEach((label) => {
    label.addEventListener("click", (event) => {
      const uid = getCurrentUid();
      const isHost = latestRoom?.host === uid;
      if (isHost) return; // ホストは通常どおりタップ＝モード変更
      const radio = label.querySelector('input[name="online-battle-lobby-mode-change-select"]');
      if (!radio) return;
      event.preventDefault(); // disabled状態でも念のため既定動作を止める
      playSfx(SFX_EVENTS.UI_CLICK);
      openLobbyHelpModal(radio.value);
    });
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
      playSfx(SFX_EVENTS.UI_CONFIRM);
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
      playSfx(SFX_EVENTS.UI_CONFIRM);
      transferButton.disabled = true;
      await transferHost({ roomId: currentRoomId, newHostUid: targetUid });
      return;
    }
  });

  // 【2026-08-30新設、本人指示→2026-09-15改訂・本人指示：ゲスト側の戻る／退出操作を
  // 全画面横断監査】観戦をやめて入口へ戻る。全画面監査の結果、誤タップ防止の確認が
  // 無いまま即座に退出する唯一の残存箇所だったため追加した。ルーム退出・結果画面退出の
  // ような大掛かりな独立モーダルではなく、同じファイル内の「キック」「ホストを渡す」と
  // 同じ軽量なwindow.confirm()を使う（観戦はルームコードで何度でも入り直せるため、
  // 対戦そのものからの退出より影響が小さい操作という判断）。
  elements.spectatorLeaveButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    if (!window.confirm("観戦をやめてホーム画面へ戻りますか？")) return;
    playSfx(SFX_EVENTS.UI_CONFIRM);
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
      'input[name="online-battle-settings-question-count"], input[name="online-battle-settings-rule"], input[name="online-battle-settings-penalty"], input[name="online-battle-settings-song-source"]'
    )
    .forEach((radio) => {
      radio.addEventListener("change", async () => {
        if (!currentRoomId) return;
        // 出題数・カテゴリー等の設定変更操作音
        playSfx(SFX_EVENTS.UI_CLICK);
        await applyHostSettingsChangeFromForm();
      });
    });

  // 【2026-08-30新設、本人指示：19-3章「一瞬バトル」】上と全く同じ考え方の、一瞬バトル専用版。
  document
    .querySelectorAll(
      'input[name="online-instant-battle-settings-question-count"], input[name="online-instant-battle-settings-play-duration"], input[name="online-instant-battle-settings-answer-pool-size"], input[name="online-instant-battle-settings-song-source"]'
    )
    .forEach((radio) => {
      radio.addEventListener("change", async () => {
        if (!currentRoomId) return;
        // 一瞬バトル設定変更操作音
        playSfx(SFX_EVENTS.UI_CLICK);
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
    // 共同選曲：曲選択画面を開く操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    openCollabSongPicker();
  });
  elements.collabChooseFavoritesButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const favoriteSongIds = getFavoriteSongIds().filter((songId) => currentCommonSongPool.has(songId));
    openSongListConfirm("⭐ お気に入りから選ぶ", "お気に入りから選ばれている曲はこの曲です", favoriteSongIds);
  });
  elements.collabChoosePlaylistButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openOnlineBattlePlaylistPicker(currentCommonSongPool, (songIds) => {
      openSongListConfirm("📃 プレイリストから選ぶ", "このプレイリストから選ばれている曲はこの曲です", songIds);
    });
  });

  elements.lobbyReadyButton.addEventListener("click", async () => {
    if (!currentRoomId) return;
    playSfx(SFX_EVENTS.UI_CLICK);
    // 【2026-09-09新設・本人指示：音源再生失敗の本対策】参加者側の「準備完了」も、
    // 対戦開始前の確実なユーザージェスチャーの1つとして、同じくunlockを再実行しておく。
    attemptSilentUnlock();
    const nowReady = elements.lobbyReadyButton.classList.contains("is-ready");
    suppressNextReadyChangeNotice = true;
    elements.lobbySettingsChangedNotice.hidden = true;
    elements.lobbyRematchNotice.hidden = true;
    if (elements.lobbyRematchCancelledNotice) elements.lobbyRematchCancelledNotice.hidden = true;
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
    playSfx(SFX_EVENTS.UI_CONFIRM);

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

      // 【2026-09-13改訂・本人指示：対戦開始前ルール確認画面】以前はここで直接startBattle()を
      // 呼んでいたが、今回から「対戦を開始する」は、まずルール確認画面へ進むための
      // beginMatchConfirmation()を呼ぶ（判定条件・エラー理由はstartBattle()と完全に共通）。
      // 実際の対戦開始（seed発行・カウントダウン）は、全員の確認が揃った後に
      // driveMatchConfirmationHostTick()がstartBattle()を改めて呼ぶ。
      const result = await beginMatchConfirmation({ roomId: currentRoomId, settings });

      if (!result.ok) {
        // 失敗時（設定不備・READY不足など、room.statusはwaitingのままのはず）だけ、
        // ここで再挑戦できるようボタンを戻す。
        // 【成功時にdisabled=falseへ戻さない理由】成功した瞬間、room.confirmingMatchが
        // trueになり画面がルール確認画面へ切り替わる。ここで無条件にdisabled=falseへ
        // 戻してしまうと、本来もう押せないはずのボタンが一瞬だけ有効に見えてしまう
        // （本人からの実機報告で発覚した、以前のstartBattle()版と同じ理由）。
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
    // 結果送信の再試行操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    finishOnlineBattleMatch(pendingFinishResult.result, pendingFinishResult.answeredCount);
  });

  elements.waitingFinalizeButton.addEventListener("click", () => {
    // 強制終了確認モーダルを開く操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.waitingFinalizeConfirmModal.hidden = false;
  });
  elements.waitingFinalizeCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    elements.waitingFinalizeConfirmModal.hidden = true;
  });
  elements.waitingFinalizeConfirmButton.addEventListener("click", async () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
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
  // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第3ラウンド】誤操作で結果画面を
  // 離れてしまわないよう、押した瞬間ではなく確認モーダルを挟んでから実行する
  // （js/onlineBattleResultLeavePrompt.jsの「ルームから退出」確認と同じ考え方）。
  elements.resultHomeLink.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    promptResultGoHome(() => {
      resetOnlineBattleMatchState();
      elements.navigateTo("start");
    });
  });

  // 【2026-09-07新設・本人指示：ルームから退出＝完全離脱】ホームへ戻るとは違い、
  // Firebase上の参加者からも削除し、以後ホストの再戦・設定変更操作の影響を受けなくする。
  // 既存の「ロビーからの退出」ボタン（lobbyLeaveConfirmButton、上記）と同じ手順
  // （isLeavingIntentionally→leaveRoom()完了を待つ→stopListeningToRoom()の順）にしている。
  // 実際の処理はleaveOnlineBattleRoomCompletely()に集約し、歌詞クイズ・一瞬協力の
  // 結果画面（onLeaveRoomCompletelyコールバック経由）とも共有する。
  // 【2026-09-15改訂・本人指示：ゲスト側の退出操作にも必ず確認ダイアログ】以前は
  // 確認なしで即座にルームから完全退出していた。誤タップで戻れない状態にならないよう、
  // 共有の確認モーダル（js/onlineBattleResultLeavePrompt.js）を必ず挟む。
  elements.resultLeaveButton?.addEventListener("click", () => {
    if (!currentRoomId) return;
    // 確認モーダルを開くだけの軽い操作音（モーダル内の確定・キャンセルは
    // js/onlineBattleResultLeavePrompt.js側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptResultLeaveRoom(async () => {
      elements.resultLeaveButton.disabled = true;
      await leaveOnlineBattleRoomCompletely();
      elements.resultLeaveButton.disabled = false;
      elements.navigateTo("start");
    });
  });

  // 【2026-09-30新設→2026-10-01全面改訂・本人指示：結果画面/再戦フロー全面設計】
  // 「もう一度」はホスト専用のまま。押した瞬間、beginRematchReadyCheck()で
  // confirmingRematchを立てる（このときホスト自身は既に準備OK扱いになる。
  // js/onlineBattle.jsのbeginRematchReadyCheck()参照）。以前は別画面（再戦準備画面）へ
  // 遷移していたが、今は結果画面から離れず、下に現れるインラインパネル
  // （renderResultReturnPanel()参照）でそのまま完結する。
  elements.resultRematchButton.addEventListener("click", async () => {
    if (!currentRoomId || !latestRoom) return;
    // 【2026-09-09新設・本人指示：音源再生失敗の本対策】「もう一度」はロビーの開始ボタンを
    // 経由せず次の対戦（の準備）へ進むため、こちらでもunlockを再実行しておく。
    attemptSilentUnlock();
    playSfx(SFX_EVENTS.UI_CONFIRM);
    elements.resultRematchButton.disabled = true;
    const result = await beginRematchReadyCheck({ roomId: currentRoomId });
    elements.resultRematchButton.disabled = false;
    if (result.ok) markResultScreenResponded();
  });
  // 【2026-10-01新設・本人指示：結果画面/再戦フロー全面設計】インライン再戦準備パネルの
  // 「準備OK」トグル。ホスト・ゲストどちらも同じボタンで自分の準備状態を切り替える
  // （全員の準備が揃うまでは何度でも取り消せる。押しても画面は一切切り替わらない）。
  elements.resultRematchToggleButton?.addEventListener("click", async () => {
    if (!currentRoomId || !latestRoom) return;
    attemptSilentUnlock();
    // 【2026-11-XX新設・本人指示：結果/再戦フロー最終仕様】ホストがこのボタンを押した場合は
    // 「再戦を取り消す」＝再戦提案そのものの解除。自分の準備を外すだけの
    // setRematchReady(false)ではなく、cancelRematchReadyCheck()で提案全体をキャンセルする
    // （ゲスト側は今までどおり自分の準備状態だけをトグルする）。
    if (latestRoom.host === getCurrentUid()) {
      playSfx(SFX_EVENTS.UI_BACK);
      elements.resultRematchToggleButton.disabled = true;
      await cancelRematchReadyCheck({ roomId: currentRoomId });
      elements.resultRematchToggleButton.disabled = false;
      return;
    }
    const myUid = getCurrentUid();
    const myReady = latestRoom.players?.[myUid]?.rematchReady === true;
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.resultRematchToggleButton.disabled = true;
    await setRematchReady({ roomId: currentRoomId, confirmed: !myReady });
    elements.resultRematchToggleButton.disabled = false;
  });
  // 【2026-09-30改訂→2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計】「ルーム設定に
  // 戻る」は、ホスト・ゲストどちらも押せる個別操作。押した瞬間、自分の分だけ
  // markResultReturned()で記録し、room.statusの変化を待たずに自分の画面だけを即座に
  // ロビーへ切り替える（他の参加者の画面には一切影響しない）。実際にroom.statusを
  // waitingへ戻す処理は、全員分が揃った時点でホストの端末が自動的に行う
  // （js/onlineBattle.jsのmaybeFinalizeReturnToLobbyIfAllReturned()参照）。
  // 【本人指示：再戦提案中に誰かが「ルーム設定に戻る」を選んだ場合、その再戦提案自体を
  // キャンセルする】押した瞬間、再戦提案中であれば先にcancelRematchReadyCheck()を呼ぶ
  // （host専用ではなく誰でも呼べるよう変更済み。js/onlineBattle.jsのコメント参照）。
  elements.resultReturnButton?.addEventListener("click", async () => {
    if (!currentRoomId) return;
    playSfx(SFX_EVENTS.UI_BACK);
    elements.resultReturnButton.disabled = true;
    markResultScreenResponded();
    if (latestRoom?.confirmingRematch === true) {
      await cancelRematchReadyCheck({ roomId: currentRoomId });
    }
    await markResultReturned({ roomId: currentRoomId });
    elements.resultReturnButton.disabled = false;
    resetOnlineBattleMatchState();
    resetLyricsQuizBattleState();
    elements.navigateTo("onlineBattleLobby");
  });

  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  // 誤操作で対戦を中断してしまわないよう、共有の確認モーダル
  // （js/onlineBattleLobbyReturnPrompt.js）を必ず挟む。
  elements.quizBackToLobbyButton?.addEventListener("click", () => {
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleLobbyReturnPrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptReturnToLobby(currentRoomId);
  });

  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】ホスト用とは別の
  // 確認モーダルを挟む（js/onlineBattleLeaveMatchPrompt.js）。確定後はローカルの画面遷移
  // だけ行い、room.status等には一切触れない（他の参加者の対戦はそのまま続く）。
  elements.quizLeaveMatchButton?.addEventListener("click", () => {
    if (!currentRoomId || !currentMatchId) return;
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleLeaveMatchPrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptLeaveMatch(currentRoomId, currentMatchId, () => {
      elements.navigateTo("onlineBattleLobby");
      if (latestRoom) renderLobby(latestRoom);
    });
  });

  // 【2026-09-09新設・本人指示：ロビー専用の詳細説明書】
  elements.lobbyHelpButton?.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openLobbyHelpModal();
  });
  elements.lobbyHelpClose?.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeLobbyHelpModal();
  });
  elements.lobbyHelpModal?.addEventListener("click", (event) => {
    if (event.target !== elements.lobbyHelpModal) return;
    playSfx(SFX_EVENTS.UI_BACK);
    closeLobbyHelpModal();
  });
  elements.lobbyHelpGuideLink?.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    closeLobbyHelpModal();
    elements.onOpenGuideFromLobby?.();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!elements.lobbyHelpModal || elements.lobbyHelpModal.hidden) return;
    playSfx(SFX_EVENTS.UI_BACK);
    closeLobbyHelpModal();
  });

  // 【2026-09-07新設・本人指示：ルーム参加者プロフィール】閉じるボタン・オーバーレイの
  // 外側タップ・Escapeキーのいずれでも閉じられるようにする（既存のfan-profile-detail-modal
  // 等、他のモーダルと同じ操作性に揃える）。
  // 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】
  // 【2026-09-14修正・実機回帰バグ：fresh room初回音源無音】ルール確認画面の追加により、
  // 実際にaudio.play()が呼ばれる瞬間（確認OK後2秒待機→startBattle→カウントダウン→再生）が
  // ユーザージェスチャーの呼び出しスタックから完全に切り離されてしまい、iOSのautoplay
  // 制限に引っかかっていた。全参加者が必ず押す「確認OK」タップは対戦開始に最も近い
  // 確実なユーザージェスチャーなので、ここでunlockしておく（ホスト・ゲスト両方の端末で
  // 実行されるため、参加者全員分の再生準備が整う）。
  elements.confirmToggleButton?.addEventListener("click", async () => {
    if (!currentRoomId || !latestRoom) return;
    // ルール確認画面の「確認OK」トグル操作音（既存のlobbyReadyButtonと同じ、
    // トグル式の準備系ボタンとしてUI_CLICKに揃える）。
    playSfx(SFX_EVENTS.UI_CLICK);
    attemptSilentUnlock();
    const myUid = getCurrentUid();
    const nowConfirmed = latestRoom.players?.[myUid]?.ruleConfirmed === true;
    // 【本人指示19：確認OKはトグル式】押すたびに反転させるだけの単純な操作にする。
    await setRuleConfirmed({ roomId: currentRoomId, confirmed: !nowConfirmed });
  });
  elements.confirmCancelButton?.addEventListener("click", async () => {
    if (!currentRoomId) return;
    playSfx(SFX_EVENTS.UI_BACK);
    await cancelMatchConfirmation({ roomId: currentRoomId });
  });

  // 【再戦準備フェーズ新設・本人指示】上のconfirmToggleButton/confirmCancelButtonと
  // 全く同じ考え方（トグル式の「準備OK」・ホスト専用の「キャンセル」）。
  elements.rematchReadyToggleButton?.addEventListener("click", async () => {
    if (!currentRoomId || !latestRoom) return;
    playSfx(SFX_EVENTS.UI_CLICK);
    attemptSilentUnlock();
    const myUid = getCurrentUid();
    const nowReady = latestRoom.players?.[myUid]?.rematchReady === true;
    await setRematchReady({ roomId: currentRoomId, confirmed: !nowReady });
  });
  elements.rematchReadyCancelButton?.addEventListener("click", async () => {
    if (!currentRoomId) return;
    playSfx(SFX_EVENTS.UI_BACK);
    await cancelRematchReadyCheck({ roomId: currentRoomId });
  });
  // 【2026-10-01新設・本人指示：結果画面/再戦フロー全面設計12-5章】再戦準備中のキック。
  // インラインパネル・専用の別画面（フォールバック）どちらの参加者リストでも、
  // renderRematchReadinessList()が出すキックボタンのクリックを1つのイベント委任で拾う。
  elements.resultRematchPlayerList?.addEventListener("click", handleRematchKickClick);
  elements.rematchReadyPlayerList?.addEventListener("click", handleRematchKickClick);

  // 【2026-09-14新設・本人指示：誰がどの曲を選んだか／共有曲一覧を確認できるように】
  wireCollaborativeSelectionDetailsToggle(elements.collabDetailsToggle, elements.collabDetailsPanel, () => {
    if (!latestRoom) return;
    renderCollaborativeSelectionBreakdown({
      byPlayerListElement: elements.collabByPlayerList,
      uniqueSongListElement: elements.collabUniqueSongList,
      players: latestRoom.players || {},
      songTitleResolver: resolveSongTitleForCollabUi,
      currentUid: getCurrentUid(),
    });
  });

  // 【2026-09-26移設・本人指示：オンライン対戦総合改修19-10章】実体はjs/onlineParticipantIcon.js
  // へ移したため、ここでは受け取ったDOM要素を渡して初期化するだけ。
  initParticipantProfileModal({
    modal: elements.lobbyProfileModal,
    closeButton: elements.lobbyProfileClose,
    name: elements.lobbyProfileName,
    oshi: elements.lobbyProfileOshi,
    swatch: elements.lobbyProfileSwatch,
    body: elements.lobbyProfileBody,
    unavailable: elements.lobbyProfileUnavailable,
    loading: elements.lobbyProfileLoading,
    achievementCount: elements.lobbyProfileAchievementCount,
    summary: elements.lobbyProfileSummary,
    allToggle: elements.lobbyProfileAllToggle,
    achievements: elements.lobbyProfileAchievements,
  });

  renderLastRoomBanner();
}
