// オンライン対戦「歌詞クイズ」専用の画面コントローラ（Phase6）。
//
// 【なぜjs/onlineBattleScreen.jsと分けたか】既存のonlineBattleScreen.js（タイムアタック・
// ランダム再生対戦）は「各自が同じ問題リストを自分のペースで解き進め、終わったら結果を
// 送信して待機する」という前提（js/onlineBattle.jsのmatches/{matchId}/progress・results）で
// 作られている。歌詞クイズ対戦は逆に「全員が同じ問題を同時に見て、ヒントが時間経過で
// 増える・奪い取りルールでは早押しになる」というホスト主導の同期進行のため、前提が
// 根本的に異なる（js/lyricsQuizBattleFirebase.jsのcurrentQuestionIndex・questionStatus・
// answers/{questionIndex}/{uid}という別のデータ構造を使う）。既存のonlineBattleScreen.jsを
// 無理に拡張せず、専用のファイルとして分離した。
//
// 【依存の向き】このファイルはjs/onlineBattleScreen.jsを一切importしない（一方向の依存に
// 保つため）。「対戦をやめる」「ホームへ戻る」で必要な後片付け（ルーム退出等）は、
// 呼び出し元（js/main.js）がコールバックとして渡す（elements.onQuitDuringBattle等）。
//
// 【ホストが進行を主導する仕組み】ホストの端末だけが、js/lyricsQuizMatchProgress.js
// （Phase3・Firebase不使用の進行エンジン、恒久テスト済み）をローカルの「進行ミラー」として
// 保持し、Firebaseから読んだ回答・奪い取りclaimを取り込みながらtick()を回す。
// 終了条件を満たしたらjs/lyricsQuizBattleFirebase.jsのresolveLyricsQuizQuestion()を呼び、
// 結果を少し見せてからadvanceLyricsQuizQuestion()（次の問題）かfinalizeLyricsQuizMatch()
// （最終結果）を呼ぶ。参加者側の端末は、Firebaseから読んだcurrentQuestionIndex・
// questionStatus・currentQuestionStartedAtを見て自分の画面を描画するだけで、進行の
// 決定権は一切持たない。
//
// 【Phase6.5・ホストのリロード復帰】ホストの端末がゲーム中にリロード・一時切断しても、
// 既存のオンライン対戦（タイムアタック等）で確認済みの「一時切断→復帰→結果確定まで
// 再開できる」という思想を維持するため、js/lyricsQuizMatchProgress.jsの
// restoreMatchProgressFromFirebase()を使って進行ミラーをFirebaseの現在状態から
// 再構築する（本人の指摘を受けて、Phase6時点の「既知の制約」を解消した）。

import { getCurrentUid } from "./firebaseClient.js";
import {
  ROOM_STATUS,
  updateRoomSettings,
  subscribeServerTimeOffset,
  beginRematchReadyCheck,
  setRematchReady,
  cancelRematchReadyCheck,
  finishRematchReadyCheck,
  kickPlayer,
  markResultReturned,
} from "./onlineBattle.js";
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】結果画面の「ルーム設定に
// 戻る」個別化・「もう一度」への非強制対応を、共有エンジンと全く同じ仕組みで実現する。
// js/onlineBattleScreen.jsは一切importしない設計方針（本ファイル冒頭コメント参照）のため、
// 状態・純粋な描画処理はどちらにも属さない中立ファイルから読み込む。
import {
  markResultScreenResponded,
  resetResultScreenResponded,
  hasRespondedToCurrentResultScreen,
  renderResultReturnStatusList,
  renderRematchReadinessList,
  createRematchKickHandler,
} from "./onlineBattleResultReturnState.js";
import { computeAllPlayersRematchReady, resolveRematchToggleButtonLabel } from "./onlineBattleMatchConfirmationPayloads.js";
import { computeRemainingRevealMs } from "./onlineBattleRevealTiming.js";
import { recordAudioDiagnostic } from "./audioDiagnosticLog.js";
import { promptReturnToLobby } from "./onlineBattleLobbyReturnPrompt.js";
import { promptLeaveMatch } from "./onlineBattleLeaveMatchPrompt.js";
import { promptResultLeaveRoom } from "./onlineBattleResultLeavePrompt.js";
import { promptResultGoHome } from "./onlineBattleResultHomePrompt.js";
import { promptAnswerConfirm } from "./answerConfirmPrompt.js";
import { validateRoomSettings, getAvailabilityKind, resolveAllEligibleSongIdsForMode } from "./battleModes/index.js";
import * as lyricsQuizBattleMode from "./battleModes/lyricsQuizBattleMode.js";
import { getBattleRuleLabel } from "./battleRules/index.js";
import {
  SKIP_SELECTION,
  MAX_HINT_LEVEL,
  IDLE_RESCUE_THRESHOLD_MS,
  createDefaultSettingsForRule,
} from "./battleModes/lyricsQuizBattleMode.js";
import {
  createMatchProgress,
  recordAnswer,
  recordStealClaim,
  tick,
  advanceToNextQuestion,
  finalizeMatch,
  restoreMatchProgressFromFirebase,
  markPlayerDnf,
  computeScoreSnapshotFromState,
} from "./lyricsQuizMatchProgress.js";
import {
  submitLyricsCoverage,
  startLyricsQuizQuestion,
  submitLyricsQuizAnswer,
  submitLyricsQuizAnswerWithStealClaim,
  resolveLyricsQuizQuestion,
  finalizeLyricsQuizMatch,
  computeSongPoolHash,
  reportQuestionActivity,
  forceSkipIdlePlayer,
} from "./lyricsQuizBattleFirebase.js";
import {
  loadSongsWithLyrics,
  isLyricsQuizEligibleSong,
} from "./lyricsQuizQuestionBuilder.js";
import {
  describeRuleOptions,
  describeAnswerPoolSizeOptions,
  describeSettingsForm,
  describeHudItems,
  describeResultTable,
  describeLyricsReadiness,
  describeOwnMissingLyricsTitles,
  resolveAnswerSubmissionBlock,
  describeAnswerSubmissionBlockMessage,
  describeStealClaimOutcomeMessage,
  describeAnswerSubmissionFailureMessage,
  renderRuleOptions,
  renderAnswerPoolSizeOptions,
  renderSettingsForm,
  renderHud,
  renderResultCards,
  renderLyricsReadinessStatus,
  renderOwnMissingLyricsTitles,
  describeScoreboard,
} from "./lyricsQuizBattleUi.js";
import { computeElapsedMs, computeStealHintProgress } from "./lyricsQuizBattleTiming.js";
// 【2026-08-31新設、本人指示：歌詞クイズ3ルール全面改修】30・50・全曲プールの検索は、
// 既存の「収録曲一覧」検索と完全に同じ判定にする（本人指示：新しい簡易検索を別に作らない）。
// 50音ジャンプバーの行分けも、この共有ファイルの定義をそのまま使う。
import { normalizeForSearch, songMatchesSearch, GOJUON_ROWS, deriveGojuonRowKey, sortSongsByReading } from "./songlist.js";
import { LARGE_ANSWER_POOL_THRESHOLD } from "./lyricsQuizEngine.js";
import { computeRevealedHintLines } from "./lyricsSegmentEngine.js";
// 【2026-08-08新設】出題する曲をホストが選べる機能。他の対戦モード（js/onlineBattleScreen.js）と
// 同じ曲選択画面を共有する（gameModeごとに別々の選曲UIを持たない、本人指示）。
import { openOnlineBattleSongPicker, updateOnlineBattleSongPickerLiveSelections } from "./onlineBattleSongPicker.js";
// 【2026-08-28新設】js/onlineBattleScreen.jsと同じ共有モーダル。お気に入り／プレイリストで
// 選んだ曲を、全曲一覧へ進む前にまず確認できる（このファイルはonlineBattleScreen.jsを
// importしない方針のため、そちら経由ではなく直接この共有部品をimportする）。
import { openOnlineBattleSongListConfirm } from "./onlineBattleSongListConfirmModal.js";
// 【2026-08-27新設】お気に入り・プレイリストから選ぶ機能も、js/onlineBattleScreen.jsと
// 同じ考え方・同じ共有モジュールを使う。
import { openOnlineBattlePlaylistPicker } from "./onlineBattlePlaylistPicker.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
// 【2026-08-27新設】このファイルはjs/onlineBattleScreen.jsを一切importしない設計
// （冒頭コメント参照）のため、「今のルーム参加者全員が実際に歌詞データを持っている曲」の
// 計算は、あちらと同じ関数を使いつつこのファイル自身で独立して行う（gameModeが違えば
// 絞り込みに使う所持データの種類も違うことに注意：ここでは常にavailabilityKind="lyrics"）。
import { computeRoomCommonSongPool } from "./onlineBattleSongAvailability.js";
// 【2026-08-27新設】共同選曲（参加者全員が選んだ曲の和集合を出題対象にする機能）。
import {
  reportMySelectedSongIds,
  computeMergedSelectedSongIds,
  areSongIdSetsEqual,
} from "./onlineBattleCollaborativeSelection.js";
import { QUESTION_SOURCE_TYPE, sanitizeSongIds } from "./questionSource.js";
import {
  resolveSongSourceOptionValue,
  buildSongSourceSettingsFields,
  describeSongSourceForSettings,
} from "./onlineBattleSongSourceUi.js";
import { savePlayHistoryEntryIfNew } from "./playHistory.js";
import { buildLyricsQuizQuestionBreakdown, capQuestionBreakdownForStorage } from "./battleQuestionBreakdown.js";
import { renderQuestionBreakdownAccordion } from "./battleQuestionBreakdownUi.js";
import { SONGS } from "./data/songs.js";
import { MEMBERS } from "./data/members.js";
import { renderCollaborativeSelectionBreakdown, wireCollaborativeSelectionDetailsToggle, resetCollaborativeSelectionDetailsPanel } from "./onlineBattleCollaborativeSelectionUi.js";
import { getMemberById } from "./memberUtils.js";
// 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-10章】参加者プロフィールモーダルを
// 歌詞クイズ対戦のスコアボードからも使う。このファイルはjs/onlineBattleScreen.jsを一切
// importしない方針（このファイル冒頭のコメント参照）のため、循環importを避けて中立な
// 共通ファイルjs/onlineParticipantIcon.jsから読み込む。
import { buildParticipantIcon } from "./onlineParticipantIcon.js";
// 【2026-09-26新設・本人指示：サウンドシステム全面整備8-10章】答え表示中だけ実際の楽曲を
// 流す新機能で使う。js/audio.jsの共通再生関数をそのまま再利用し（新しい再生経路は作らない）、
// 失敗時はonErrorをconsole.warnだけにして、Q1無音バグの教訓どおり「演出の失敗でゲーム進行を
// 止めない」設計にする（下のstartRevealMusic参照）。
import { playSongFromRandomPosition, stopAudio, attemptSilentUnlock, getAudioElementDiagnosticSnapshot } from "./audio.js";
import { QUESTION_COUNT_LABELS } from "./localBattleScreen.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { STEAL_CLAIM_OUTCOME } from "./lyricsQuizBattleFirebasePayloads.js";

// ホストが問題の確定（正解発表）を見せてから、次の問題／最終結果へ進むまでの待ち時間。
// 【2026-09-03改訂→2026-09-06再改訂、本人指示】一度「4秒固定」に変更していたが、
// 歌詞クイズ3ルール全面改修時の指示「結果表示→約3秒→次の問題」を正として3000へ戻した。
// 【2026-09-07改訂・本人指示：答え合わせ表示を4秒へ統一】以前は3秒だったが、答え合わせカードに
// 「あなたの回答」「獲得pt」等の読む情報が増えたため、対象モード共通で4秒へ揃えた。
// 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド10章】正解曲を実際に
// 聞かせる演出（startRevealMusic）と両立させるため、7秒（7000ms）へ延長する。この値は
// 答え表示時間の唯一の情報源であり、reveal音楽の再生時間（startRevealMusic参照）・
// ホストの次問題への進行判定（renderCurrentQuestionState内）の両方が自動的に追従する。
const REVEAL_DELAY_MS = 7000;
// ヒント表示・ホストの進行判定を更新する間隔。カウントダウン画面のsetInterval(100ms)ほど
// シビアな精度は不要なため、通信・電池消費とのバランスで少し長めにしている。
const HOST_TICK_INTERVAL_MS = 400;

let elements = null;

// 全クライアント共通の状態。
let latestRoom = null;
let currentMatchId = null;
let currentQuestions = []; // buildQuestions()の戻り値（song/hints/answerPool）
let runtimeReady = false;
let serverTimeOffset = 0;
let offsetUnsubscribe = null;
let tickTimerId = null;
let lastRenderedQuestionIndex = -1;
// 【2026-09-13新設・本人指示：答え合わせがずっと点滅する不具合の修正】答え合わせカードの
// 出現演出（CSSのanswerRevealPopアニメーション）を、同じ問題に対しては1度だけ再生する
// ための追跡。renderCurrentQuestionState()はHOST_TICK_INTERVAL_MS（400ms）ごとに
// 呼ばれ続けるが、これが無いと毎tickごとにDOM要素を作り直してアニメーションが
// 再生し直され、実機で「ピコピコ点滅して見える」原因になっていた。
let lastRevealedQuestionIndex = -1;
let lastHintRevealedQuestionIndex = -1; // renderResolvedHintSummary()の同種の追跡（answer choicesとは別カウンタ）
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド11章】正解/不正解SFXが
// renderCurrentQuestionState()のtick（400ms間隔）のたびに毎回鳴り、7秒の答え表示中に
// 十数回重ねて再生されていた不具合の修正用（answer choicesの点滅対策と同じ考え方の
// 「同じ問題には1回だけ」ガード。別カウンタにする理由も同上）。
let lastRevealSfxPlayedForQuestionIndex = -1;
let mySubmittedForQuestionIndex = -1;
// 【2026-10-01新設・本人指示：結果画面/再戦フロー全面設計6章】早押しバトルで、今の問題に
// 対する自分の回答結果（STEAL_CLAIM_OUTCOME.ANSWERED_WRONG等）を覚えておく。答え合わせ
// までの「待機中」表示を、正誤で出し分けるために使う（本人指示：本人が間違えたかどうか
// 「回答しました」だけでは分からない、を解消する）。
let mySubmissionOutcomeForQuestionIndex = -1;
let mySelectedSongId = null;
let submitInFlight = false;

// 自分自身のライブHUD用の集計（各クライアントが独立して積み上げる。詳しくはファイル末尾の
// maybeRecordMyOutcomeForResolvedQuestions()参照）。
let myOutcomeHistory = [];
let myComboCount = 0;
let myQuestionStartedAtCache = {};
// 【2026-08-31改訂】以前は単一のlastWinnerNameCache（直近の獲得者名）だったが、
// 「勝者が確定しなかった問題の後」でも前の問題の値が残り続ける不正確さがあったため、
// 問題インデックスごとに持つ形へ変更した（qIndex -> 表示名 | undefined）。
let winnerNameByQuestionIndex = {};

// 【2026-08-31新設、本人指示：ヒントを手動で開く方式への変更】正解数バトル・
// ポイントバトルで、自分が今のヒントで開いている最大段階（1〜4）。新しい問題に移るたびに
// 1へリセットする（renderCurrentQuestionState()のqIndex切り替わり時参照）。
let myOpenedHintLevel = 1;
// 【2026-10-01新設・本人指示：回答時点のヒント位置から答え合わせ再生】早押しバトルは
// 時間経過で自動的にヒントが積み上がるため、renderHintArea()の毎レンダリングで
// 「今、実際に画面へ表示されている最大ヒント段階」をここへ記録しておく
// （回答した瞬間の段階を後から知るため。正解数・ポイントバトルはmyOpenedHintLevelが
// 既にこの役目を果たすため、こちらは早押しバトル専用）。
let myCurrentStealHintLevel = 1;
// 【2026-11-XX新設・本人指示：新しいヒントだけ軽くフェードイン】正解数・ポイントバトルの
// renderHintArea()は、他プレイヤーの回答待ち等でも一定間隔（HOST_TICK_INTERVAL_MS）ごとに
// 呼ばれ続けるため、毎回「今開いている最大段階」をフェードイン対象にすると、tickのたびに
// 同じヒントのフェードインが再生され直してしまう（js/lyricsQuizBattleUi.jsの答え合わせ
// 点滅バグと同じ轍）。「前回描画時より段階が増えた（＝本当に今しがた新しく開いた）」
// ときだけフェードインさせるため、問題ごとに「最後にフェードインを再生した段階」を覚えておく。
let lastHintFadeInState = { questionIndex: null, level: 0 };
// 【2026-10-01新設】回答を確定した瞬間の「自分が最後に見ていたヒント段階」を固定する
// （本人指示：「回答時点の最後に開いたヒント位置から7秒再生」。答え合わせで全ヒントが
// 表示されても、この値は書き換えない）。新しい問題に移るたびに1へリセットする。
let myAnswerHintLevel = 1;
// 【2026-08-31新設】30・50・全曲プールでの検索文字列・50音ジャンプの選択行。
// 新しい問題に移るたびにリセットする。
let myAnswerSearchQuery = "";
let myAnswerJumpRowKey = null;

// 【2026-09-06新設・3分無操作の放置救済】自分の活動報告（reportQuestionActivity()）を
// 間隔を空けて送るための状態（毎回のクリック・入力のたびにFirebaseへ書き込まないため）。
let lastActivityReportedAtMs = 0;
let lastActivityReportedQIndex = -1;

// 【2026-09-09新設・本人指示4：通信切断時の自動復帰待ち→離脱処理】ホストの端末だけが持つ、
// 「今の問題で、いつからその参加者の接続が切れているか」の記録（uid→切断を検知した時刻）。
// Firebase側のconnectedフラグ自体には切断"時刻"が無いため、ホストのローカル状態として
// 補う（js/onlineBattle.jsの既存の接続監視には一切手を加えない、追加観測だけの設計）。
// DISCONNECT_AUTO_SKIP_MSだけ切断が続いた参加者は、既存の「3分無操作の放置救済」と
// 全く同じforceSkipIdlePlayer()を自動的に呼び、「わからない」扱いにして進行を止めない
// ようにする（新しい採点分岐・新しいFirebaseフィールドは増やさない）。
const disconnectedSinceMsByUid = new Map();
const DISCONNECT_AUTO_SKIP_MS = 20000;
const ACTIVITY_REPORT_THROTTLE_MS = 15000;

// ホスト専用の進行ミラー（js/lyricsQuizMatchProgress.js）。
let hostState = null;
let hostTickInFlight = false;
let resolvedAtLocalMs = null;

// 【Phase6.5新設・二重進行防止】enterLyricsQuizBattlePlay()は非同期
// （IndexedDB読み込みを挟む）ため、連続して呼ばれた場合に「古い呼び出しの続きが、
// 新しい呼び出しの状態を後から上書きしてしまう」事故を防ぐための世代番号。
// 呼ばれるたびに1増やし、各awaitの直後に「自分の世代がまだ最新か」を確認する。
let battlePlayEntryToken = 0;

// ロビーの歌詞データ充足チェック用。
let lyricsCoverageSubmittedHash = null;
let ownMissingSongTitlesCache = [];
// 自分自身のlyricsCoverageを、Firebaseへの送信完了を待たずにローカルで先に把握しておく値。
// room.players[自分のuid].lyricsCoverageだけに頼ると、送信中〜反映待ちの間は「まだ確認して
// いない」状態を「0曲で不足」と誤表示してしまうため（本人からの指摘・2026-08-06）。
let ownLyricsCoverageStatus = null;
// 【2026-08-08新設・2026-08-27全面刷新】以前はホストだけが選べる単一の選択リスト
// （hostSelectedManualSongIds）だったが、本人指示により「ホスト以外の参加者も選曲でき、
// 全員の選択がリアルタイムに共有される」共同選曲へ変更した（js/onlineBattleScreen.jsの
// 同じ変更と全く同じ考え方。詳細はあちらのコメント参照）。
// mySelectedSongIds: 自分（今の端末のプレイヤー）が選んだ曲id。
// room.players[myUid].selectedSongIdsのローカル反映で、renderLyricsQuizLobbySettings()の
// たびに同期し直す。
let mySelectedSongIds = [];
// 【2026-08-27新設】「今この瞬間、ルームにいる参加者全員が実際に歌詞データを持っている曲」の
// 集合。js/onlineBattleScreen.jsのcurrentCommonSongPoolと同じ考え方だが、このファイルは
// あちらをimportしない設計（冒頭コメント参照）のため、独立して計算・保持する。
// renderLyricsQuizLobbySettings()が呼ばれるたび（room更新のたび）に再計算する。
let currentLyricsCommonSongPool = new Set();

function clearElement(element) {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function resolveOshiColor(oshiMemberId) {
  const member = oshiMemberId ? getMemberById(MEMBERS, oshiMemberId) : null;
  return member?.memberColor?.hex ?? null;
}

// ===== 初期化 =====

export function initOnlineLyricsQuizBattleScreens(newElements) {
  elements = newElements;

  document.querySelectorAll('input[name="online-lyrics-battle-question-count"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!latestRoom || latestRoom.gameMode !== lyricsQuizBattleMode.gameMode) return;
      // 出題数設定変更操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      applyLyricsQuizSettingsChange(latestRoom, { ...latestRoom.settings, questionCountValue: radio.value });
    });
  });

  // 【2026-08-27変更】js/onlineBattleScreen.jsと全く同じ理由で、「曲を選んで出題」は
  // 0曲でも共同選曲(collaborativeSelection)として安全に保存できるようにしてある
  // （js/battleModes/lyricsQuizBattleMode.js参照）ため、以前のような「曲選択画面を
  // 先に開く」特別扱いは不要になった。
  // 【2026-09-30改訂・本人指示：出題する曲4択統合】以前は「全曲から出題／曲を選んで出題」と
  // 「カテゴリ」が別々のラジオ群だったが、js/onlineBattleSongSourceUi.jsの4択1本へ統合した。
  document.querySelectorAll('input[name="online-lyrics-battle-settings-song-source"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!latestRoom || latestRoom.gameMode !== lyricsQuizBattleMode.gameMode) return;
      // 出題対象曲の選び方の切り替え操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      applyLyricsQuizSettingsChange(latestRoom, {
        ...latestRoom.settings,
        ...buildSongSourceSettingsFields(radio.value, {
          mergedSongIds: getMergedRestrictedLyricsSongIds(),
          // 歌詞クイズはdefaultSettings()がquestionSource:{type:ALL_SONGS}を明示する既存の
          // 流儀のため、①②③でも同じ形を保つ（settingsの形を変えないため）。
          includeAllSongsQuestionSource: true,
        }),
      });
    });
  });
  // 【2026-08-27新設】共同選曲：全曲・お気に入り・プレイリストから選ぶ。ホスト・参加者を
  // 問わず誰でも使える（js/onlineBattleScreen.jsの同名ハンドラと同じ考え方）。
  // 歌詞クイズ対戦では「歌詞データの共通曲」で絞り込む。
  elements.lyricsCollabChooseSongsButton.addEventListener("click", () => {
    // 共同選曲：曲選択画面を開く操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    openLyricsCollabSongPicker();
  });
  elements.lyricsCollabChooseFavoritesButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    const favoriteSongIds = getFavoriteSongIds().filter((songId) => currentLyricsCommonSongPool.has(songId));
    openLyricsSongListConfirm("⭐ お気に入りから選ぶ", "お気に入りから選ばれている曲はこの曲です", favoriteSongIds);
  });
  elements.lyricsCollabChoosePlaylistButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    openOnlineBattlePlaylistPicker(currentLyricsCommonSongPool, (songIds) => {
      openLyricsSongListConfirm("📃 プレイリストから選ぶ", "このプレイリストから選ばれている曲はこの曲です", songIds);
    });
  });
  // 【2026-09-14新設・本人指示：誰がどの曲を選んだか／共有曲一覧を確認できるように】
  wireCollaborativeSelectionDetailsToggle(elements.lyricsCollabDetailsToggle, elements.lyricsCollabDetailsPanel, () => {
    if (!latestRoom) return;
    renderCollaborativeSelectionBreakdown({
      byPlayerListElement: elements.lyricsCollabByPlayerList,
      uniqueSongListElement: elements.lyricsCollabUniqueSongList,
      players: latestRoom.players || {},
      songTitleResolver: resolveSongTitleForLyricsCollabUi,
      currentUid: getCurrentUid(),
    });
  });

  // 【2026-08-31新設】30・50・全曲プールの検索欄。入力のたびに検索文字列を状態として
  // 覚え、一覧を再描画する（本人指示：検索は必須にしないため、空欄なら50音ジャンプ／
  // 全件表示に戻る）。検索を始めたら50音ジャンプの選択行はいったん解除する
  // （検索語のほうを優先して見せるため）。
  elements.battleAnswerSearchInput?.addEventListener("input", (event) => {
    myAnswerSearchQuery = event.target.value;
    myAnswerJumpRowKey = null;
    reportMyQuestionActivity();
    renderCurrentQuestionState();
  });

  // 【2026-09-06新設・3分無操作の放置救済】30・50・全曲プールの回答一覧をスクロールする
  // ことも「考えている」意味のある操作として扱う。
  elements.battleAnswerChoicesContainer?.addEventListener("scroll", () => {
    reportMyQuestionActivity();
  });

  elements.battleQuitButton.addEventListener("click", () => {
    // 対戦をやめる確認モーダルを開く操作音
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.quitConfirmModal.hidden = false;
  });
  elements.quitCancelButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    elements.quitConfirmModal.hidden = true;
  });
  elements.quitConfirmButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CONFIRM);
    elements.quitConfirmModal.hidden = true;
    stopAllLocalTimers();
    elements.onQuitDuringBattle();
    elements.navigateTo("onlineBattleEntry");
  });

  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  elements.battleBackToLobbyButton?.addEventListener("click", () => {
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleLobbyReturnPrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptReturnToLobby(latestRoom?.roomId);
  });

  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】
  elements.battleLeaveMatchButton?.addEventListener("click", () => {
    const roomId = latestRoom?.roomId;
    const matchId = currentMatchId;
    if (!roomId || !matchId) return;
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleLeaveMatchPrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptLeaveMatch(roomId, matchId, () => {
      saveVoluntaryLeaveLyricsHistoryEntry();
      resetLyricsQuizBattleState();
      elements.navigateTo("onlineBattleLobby");
    });
  });

  // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第3ラウンド】誤操作で結果画面を
  // 離れてしまわないよう、確認モーダルを挟んでから実行する。
  elements.resultHomeLink.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_CLICK);
    promptResultGoHome(() => {
      stopAllLocalTimers();
      elements.onLeaveResultToHome();
      elements.navigateTo("start");
    });
  });
  // 【2026-09-07新設・本人指示：ルームから退出＝完全離脱】js/onlineBattleScreen.jsの
  // 同じボタンと同じ考え方。実処理はonLeaveRoomCompletely()経由で
  // leaveOnlineBattleRoomCompletely()（あちらに集約）を呼ぶ。
  // 【2026-09-15改訂・本人指示：ゲスト側の退出操作にも必ず確認ダイアログ】
  elements.resultLeaveButton?.addEventListener("click", () => {
    // 確認モーダルを開くだけの軽い操作音（モーダル自体はjs/onlineBattleResultLeavePrompt.js
    // 側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptResultLeaveRoom(async () => {
      stopAllLocalTimers();
      elements.resultLeaveButton.disabled = true;
      await elements.onLeaveRoomCompletely();
      elements.resultLeaveButton.disabled = false;
      elements.navigateTo("start");
    });
  });
  // 【2026-09-30新設→2026-10-01全面改訂・本人指示：結果画面/再戦フロー全面設計】
  // 「もう一度」はホスト専用のまま。押した瞬間、beginRematchReadyCheck()で
  // confirmingRematchを立てる（このときホスト自身は既に準備OK扱いになる）。以前は
  // 別画面（再戦準備画面）へ遷移していたが、今は結果画面から離れず、下に現れる
  // インラインパネル（renderLyricsResultReturnPanel()参照）でそのまま完結する。
  elements.resultRematchButton.addEventListener("click", async () => {
    if (!latestRoom) return;
    playSfx(SFX_EVENTS.UI_CONFIRM);
    elements.resultRematchButton.disabled = true;
    const result = await beginRematchReadyCheck({ roomId: latestRoom.roomId });
    elements.resultRematchButton.disabled = false;
    if (result.ok) markResultScreenResponded();
  });
  // 【2026-10-01新設・本人指示】インライン再戦準備パネルの「準備OK」トグル。
  // 【2026-11-XX修正・実機バグ調査：再戦フロー】js/onlineBattleScreen.jsの通常モードでは
  // 既に対応済みだった「ホストが押した場合は再戦提案そのものを取り消す」分岐が、
  // このファイルには移植されておらず欠落していた（ホストが押しても自分のrematchReadyを
  // false/trueに切り替えるだけで、confirmingRematchが取り消されず、結果としてホストの
  // 画面に本来不要な「✓ 準備OK」ボタンが現れ続けていた）。
  elements.resultRematchToggleButton?.addEventListener("click", async () => {
    if (!latestRoom) return;
    if (latestRoom.host === getCurrentUid()) {
      playSfx(SFX_EVENTS.UI_BACK);
      elements.resultRematchToggleButton.disabled = true;
      await cancelRematchReadyCheck({ roomId: latestRoom.roomId });
      elements.resultRematchToggleButton.disabled = false;
      return;
    }
    const myUid = getCurrentUid();
    const myReady = latestRoom.players?.[myUid]?.rematchReady === true;
    playSfx(SFX_EVENTS.UI_CLICK);
    elements.resultRematchToggleButton.disabled = true;
    await setRematchReady({ roomId: latestRoom.roomId, confirmed: !myReady });
    elements.resultRematchToggleButton.disabled = false;
  });
  // 【2026-10-01新設・本人指示】再戦準備中のキック（ホストのみ表示されるボタン）。
  elements.resultRematchPlayerList?.addEventListener("click", handleLyricsRematchKickClick);
  // 【2026-09-30改訂→2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計】「ルーム設定に
  // 戻る」は、ホスト・ゲストどちらも押せる個別操作。再戦提案中であれば先に
  // cancelRematchReadyCheck()を呼んでキャンセルしてから、通常どおり自分の分だけ
  // markResultReturned()で記録する。
  elements.resultReturnButton?.addEventListener("click", async () => {
    if (!latestRoom) return;
    playSfx(SFX_EVENTS.UI_BACK);
    elements.resultReturnButton.disabled = true;
    markResultScreenResponded();
    if (latestRoom.confirmingRematch === true) {
      await cancelRematchReadyCheck({ roomId: latestRoom.roomId });
    }
    await markResultReturned({ roomId: latestRoom.roomId });
    elements.resultReturnButton.disabled = false;
    resetLyricsQuizBattleState();
    elements.navigateTo("onlineBattleLobby");
  });
}

// ===== 答え合わせ楽曲（2026-09-26新設・本人指示：サウンドシステム全面整備8-10章） =====
//
// 【仕様】答え表示が始まった瞬間に実際の楽曲を再生し、答え表示が終わる瞬間（＝次の問題へ
// 進む瞬間）に停止する。新しい秒数は作らず、既存の答え表示時間（REVEAL_DELAY_MS）を
// そのまま使う。将来REVEAL_DELAY_MSを変更しても、曲の再生時間は自動的に追従する。
//
// 【重要：Q1無音バグの教訓を踏まえた安全設計】この楽曲はあくまで演出。再生に失敗しても
// 問題無効・対戦中止等、ゲーム進行には一切影響させない（onErrorはconsole.warnのみ）。
// unlock・タイムアウト・fail-open等の既存の安全策（js/audio.js）には一切手を加えていない。
let revealMusicStopTimeoutId = null;

function stopRevealMusic() {
  if (revealMusicStopTimeoutId !== null) {
    clearTimeout(revealMusicStopTimeoutId);
    revealMusicStopTimeoutId = null;
  }
  stopAudio();
}

// question.revealStartTimeSec（js/lyricsQuizQuestionBuilder.jsが、ヒント1の歌詞が
// 実際に始まる位置から求めたもの）があればそこから、無ければ曲の先頭（0秒）から再生する
// （本人指示：正確な歌詞位置情報が無い曲で推測の再生位置を作らない）。
//
// 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド22章】以前は
// 「答え表示を検知した瞬間から必ずREVEAL_DELAY_MSぶん」再生していたが、これは
// この端末が答え表示を検知した時刻を起点にした、端末ローカルなタイマーだった。
// タブがバックグラウンドに回っている間に答え表示が始まり、しばらくしてから
// フォアグラウンドへ復帰した場合、実際にはサーバー上の答え表示時間が既に大きく
// 経過しているにもかかわらず、この端末だけ「今から7秒間」再生し始めてしまい、
// ホストが次の問題へ進んだ後まで音が鳴り続ける・演出がずれる、という問題があった。
// remainingMsSec（残り再生秒数）は、呼び出し元がサーバー時刻基準（match.resolvedAt・
// serverTimeOffset）で計算した「答え表示が終わるまでの本当の残り時間」を渡す。
// 【2026-10-01改訂・本人指示：回答時点のヒント位置から答え合わせ再生】以前は常に
// 「ヒント1」の歌詞位置から再生していたが、「本人がどのヒントまで見て回答したか」に
// 応じて、その人自身が最後に見ていたヒント段階（myAnswerHintLevel、回答確定時に
// handleAnswerChoiceClick()が固定した値）の歌詞位置から再生する。プレイヤーごとに
// 再生位置が違ってよい仕様のため、この関数はこの端末のmyAnswerHintLevelだけを見る
// （Firebaseへの同期は不要）。該当レベルの秒数が無ければヒント1・0秒の順にフォールバックする。
// 【2026-11-XX追加・本人指示：2人対戦で答え合わせ音楽が鳴らないことがある不具合の緩和策】
// remainingMsSecはresolvedAt（サーバー時刻）とこの端末のserverTimeOffsetから計算するため、
// 通信の遅延やクロック同期の小さなズレで、本当はまだ答え表示中のはずなのにわずかに
// マイナスへ振れることがある（実機報告：1人プレイでは鳴るのに2人対戦では鳴らないことが
// あった）。「バックグラウンドから長時間経って復帰し、答え表示が本当に終わっている」
// （STALE_REVEAL_THRESHOLD_MSより大きく遅れている）場合だけ鳴らさず、それ以外の
// わずかなマイナスは最低保証時間だけ鳴らす（無音より鳴る方を優先する、フェイルオープン方針）。
const REVEAL_MUSIC_MIN_GRACE_MS = 2000;
const STALE_REVEAL_THRESHOLD_MS = -2500;

function startRevealMusic(question, remainingMsSec) {
  if (remainingMsSec < STALE_REVEAL_THRESHOLD_MS) return; // 本当に手遅れ（長時間の復帰遅れ等）
  // 【2026-11-XX改訂・実機バグ調査：ホストだけ答え合わせ音源が鳴らないことがある不具合】
  // 以前はremainingMsSecが0以下（マイナス）のときだけ最低保証時間へ底上げしていたが、
  // ホストはresolvedAt（serverTimestamp()）の書き込み直後、サーバー確定前の
  // ローカル見積もり値を早期に受け取ることがあり、その結果remainingMsSecが「0より大きいが
  // 数百msしかない」小さな正の値になりうることが実機調査で判明した。この場合、下のsetTimeout
  // による自動停止が、IndexedDB取得→unlock→play()という非同期の再生準備が終わる前に
  // 発火し、体感上「一切鳴らない」状態になっていたと考えられる。マイナス値だけでなく、
  // 最低保証時間を下回るあらゆる小さな正の値も同じ理由で底上げする（本人指示の
  // 「無音より鳴る方を優先する、フェイルオープン方針」を、0付近の境界条件まで一貫させる）。
  if (remainingMsSec < REVEAL_MUSIC_MIN_GRACE_MS) {
    remainingMsSec = REVEAL_MUSIC_MIN_GRACE_MS;
  }
  const byLevel = question.revealStartTimeSecByHintLevel ?? {};
  const revealStartTimeSec = byLevel[myAnswerHintLevel] ?? question.revealStartTimeSec;
  playSongIntroFromOffset(question.song, typeof revealStartTimeSec === "number" ? revealStartTimeSec : 0, remainingMsSec);

  if (revealMusicStopTimeoutId !== null) clearTimeout(revealMusicStopTimeoutId);
  revealMusicStopTimeoutId = setTimeout(() => {
    revealMusicStopTimeoutId = null;
    // 【2026-11-XX追加・実機バグ調査】自動停止が実際に発火した時点でどこまで再生が
    // 進んでいたか（currentTime）を記録する。0秒に近ければ「音が鳴り始める前に
    // 停止させてしまった」ことの直接証拠になる。
    const snapshot = getAudioElementDiagnosticSnapshot();
    recordAudioDiagnostic("[ONLINE_LYRICS_BATTLE] 答え合わせ音源の自動停止", {
      uid: getCurrentUid(),
      isHost: latestRoom?.host === getCurrentUid(),
      currentTimeAtStop: snapshot.currentTime,
      pausedAtStop: snapshot.paused,
    });
    stopAudio();
  }, remainingMsSec);
}

// playSongIntro()は曲ごとに決まったintroLeadInSecからしか再生できないため、任意の秒数
// （ヒント1の歌詞位置）から再生できるplaySongFromRandomPosition()を使う。playDurationSec
// は呼び出し元（startRevealMusic）が渡す「答え表示の残り時間」と同じ値にし、上の
// setTimeoutと二重に守ることで、タブがバックグラウンドに回る等でどちらかのタイマーが
// 遅延しても、答え表示より大幅に長く楽曲が鳴り続けることがないようにしている。
function playSongIntroFromOffset(song, startTimeSec, durationMs) {
  playSongFromRandomPosition(
    song,
    (actualDurationSec) => Math.min(Math.max(startTimeSec, 0), Math.max(actualDurationSec - 0.5, 0)),
    durationMs / 1000,
    (message) =>
      console.warn(
        "[歌詞クイズ対戦] 答え合わせ楽曲の再生に失敗しました（演出のみのため対戦の進行には影響しません）",
        message
      ),
    () => {},
    () => {}
  );
}

function stopAllLocalTimers() {
  stopTickTimer();
  stopServerTimeOffsetTracking();
  stopRevealMusic();
}

// ルームを離れる・別のルームへ入り直す際に呼ぶ、状態の完全リセット。
export function resetLyricsQuizBattleState() {
  stopAllLocalTimers();
  latestRoom = null;
  currentMatchId = null;
  currentQuestions = [];
  runtimeReady = false;
  lastRenderedQuestionIndex = -1;
  lastRevealedQuestionIndex = -1;
  lastHintRevealedQuestionIndex = -1;
  lastRevealSfxPlayedForQuestionIndex = -1;
  mySubmittedForQuestionIndex = -1;
  mySubmissionOutcomeForQuestionIndex = -1;
  mySelectedSongId = null;
  submitInFlight = false;
  myOutcomeHistory = [];
  myComboCount = 0;
  myQuestionStartedAtCache = {};
  winnerNameByQuestionIndex = {};
  myOpenedHintLevel = 1;
  myCurrentStealHintLevel = 1;
  myAnswerHintLevel = 1;
  myAnswerSearchQuery = "";
  myAnswerJumpRowKey = null;
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;
  disconnectedSinceMsByUid.clear();
  hostState = null;
  hostTickInFlight = false;
  resolvedAtLocalMs = null;
  lyricsCoverageSubmittedHash = null;
  ownMissingSongTitlesCache = [];
  ownLyricsCoverageStatus = null;
  mySelectedSongIds = [];
}

// js/onlineBattleScreen.jsのrenderLobby()が、room更新のたびに（画面を問わず）呼ぶフック。
//
// 【2026-08-12修正】進行（次の問題を開始する・確定する等）は従来、400ms間隔のsetInterval
// （startTickTimer）だけに頼っていた。しかしスマホのPWA/ブラウザは、画面ロック・アプリ切替・
// 他タブ表示中などバックグラウンド相当になった瞬間にsetIntervalを大幅に間引く・一時停止する
// ことがある（本人の実機報告「対戦が進まない」の一因として疑われる）。Firebaseからのリアルタイム
// 更新通知（このハンドラ）は、setIntervalとは別の仕組み（WebSocket経由のプッシュ通知）で届くため、
// タイマーが間引かれていてもこちらは比較的届きやすい。ホストの進行チェックをここにも追加することで、
// 「参加者が回答した」「設定が変わった」等のroom更新が届くたびにも進行のきっかけを作り、
// setIntervalだけに依存しない多重の安全網にする（本人が就寝中の自律作業のため、確実性を優先）。
export function handleLyricsQuizRoomUpdate(room) {
  latestRoom = room;
  syncLyricsResultReturnPanel(room);
  // 【2026-09-15追加・本人指示：前試合の答え合わせが次試合の開始演出に一瞬表示される
  // バグの調査で発見】「もう一度」で新しい試合(room.activeMatchId)が始まると、
  // finishCountdown()がFirebase上のstatusを先に"playing"へ書き換えるが、この端末の
  // ローカルなcurrentMatchId・hostStateは、goToCountdownScreen()側のsetTimeout待ちが
  // 終わってenterLyricsQuizBattlePlay()が呼ばれるまで、まだ前の試合の値のまま残る
  // （このタイムラグの間もFirebaseのroom更新イベントはこの関数を呼び続ける）。
  // room.activeMatchIdとcurrentMatchIdが一致しない間は、前試合のmatches/{currentMatchId}
  // （最終問題がresolvedのままの古いデータ）に対して進行判定・Firebase書き込みを
  // 行ってしまわないよう、ここで確実に素通りさせる。
  if (currentMatchId && room.activeMatchId !== currentMatchId) return;
  if (getCurrentUid() === room.host && room.status === ROOM_STATUS.PLAYING) {
    // 【2026-09-12追加・本人指示9「ホスト切断・引き継ぎも最終確認」で発見し修正】
    // js/onlineInstantCoopBattleScreen.jsのhandleInstantCoopRoomUpdate()と全く同じ理由の
    // 修正：対戦の途中でホストが切断→自動移譲され、自分が新しくホストになった場合、
    // enterLyricsQuizBattlePlay()を非ホストとして通過した際はhostStateを一度も初期化して
    // いないため、このままrunHostProgressionTick()を呼んでもhostStateがnullのまま何もせず
    // 戻り、対戦の進行が永久に止まってしまう（コード調査で発見した実在するバグ。実機検証は
    // 別途必要）。runtimeReady・currentQuestionsは非ホストとして入場した時点で既に
    // 準備済みのため、ここではhostStateだけを再接続時と同じrestoreMatchProgressFromFirebase()
    // で組み立て直す。
    if (!hostState && runtimeReady && currentMatchId && currentQuestions.length > 0) {
      const match = room.matches?.[currentMatchId];
      if (match && typeof match.currentQuestionIndex === "number") {
        const participantUids = Object.keys(match.participants ?? {});
        hostState = restoreMatchProgressFromFirebase({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: getCurrentUid(),
          match,
          settings: room.settings,
          nowMs: Date.now(),
        });
      }
    }
    runHostProgressionTick();
  }
  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  // このモードは継続的にroom更新を受け取るため、ホスト交代が起きても正しく追随する。
  const isHostNowLyrics = room.host === getCurrentUid();
  if (elements?.battleBackToLobbyButton) {
    elements.battleBackToLobbyButton.hidden = !isHostNowLyrics;
  }
  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】
  if (elements?.battleLeaveMatchButton) {
    elements.battleLeaveMatchButton.hidden = isHostNowLyrics;
  }
  if (document.body.dataset.screen === "onlineLyricsBattleQuestion") {
    renderCurrentQuestionState();
  }
}

// ===== ロビー：対戦設定・歌詞データ充足状況 =====

// 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-3章】以前は検証エラー時に
// Firebaseへの書き込みそのものを取りやめていたが、js/onlineBattleScreen.jsの
// applyHostSettingsChangeFromForm()と同じ理由（「開始できない」ことと「設定として
// 保存できない」ことの混同が、曲数不足時に選曲UIへ二度と入れなくなる詰みを生んでいた）で、
// 検証エラー時も設定の保存自体は必ず行うようにする。開始条件はstartBattle()側が別途守る。
async function applyLyricsQuizSettingsChange(room, nextSettings) {
  const errorMessage = validateRoomSettings(room.gameMode, nextSettings);
  // 【2026-08-08追記】出題する曲を絞り込めるようになったことで、「出題数に対して選択曲が
  // 足りない」検証エラーが実際に起こりうるようになった（本人指示：「10問対戦を開始するには
  // 10曲以上選択してください」等、分かりやすいエラーを表示すること）。
  if (elements.lyricsSettingsError) {
    elements.lyricsSettingsError.textContent = errorMessage ?? "";
    elements.lyricsSettingsError.hidden = !errorMessage;
  }
  await updateRoomSettings({ roomId: room.roomId, settings: nextSettings });
}

// 【2026-10-01新設・本人指示：「曲を選んで出題」でモード変更後に有効曲数がおかしい問題の
// 根本調査】以前はlyricsSettingsErrorが「設定を実際に書き込んだ操作」の中でしか
// 更新されなかった（applyLyricsQuizSettingsChange・submitMySelectedLyricsSongIds参照）。
// syncLyricsCollaborativeSongPoolIfHost()は「前回書き込んだ内容と今回の計算結果が同じ
// なら書き込みをスキップする」設計のため、一度でも古い（実際より少ない）曲数でエラー文言が
// 表示された直後にモードが変わる・参加者の歌詞所持状況が追いついて共通曲プールが広がる等で
// 実際の有効曲数が増えても、書き込みが起きない限りエラー文言は古いまま残り続けていた
// （本人の実機報告「現在有効な共有曲は4曲です」が、実際には13曲使える状態でも消えない
// 不具合の原因）。room更新のたび、書き込みの有無に関わらず必ず「今のroom.settingsが
// 実際に検証エラーかどうか」を再計算し、表示をそのつど最新の状態へ同期し直す。
function refreshLyricsSettingsErrorDisplay(room) {
  if (!elements.lyricsSettingsError) return;
  const errorMessage = validateRoomSettings(room.gameMode, room.settings);
  elements.lyricsSettingsError.textContent = errorMessage ?? "";
  elements.lyricsSettingsError.hidden = !errorMessage;
}

function setQuestionCountRadio(value) {
  const input = document.querySelector(`input[name="online-lyrics-battle-question-count"][value="${value}"]`);
  if (input) input.checked = true;
}

// 【2026-08-08新設】出題する曲の状態を、ホスト用フォームへ復元する。renderLyricsQuizLobbySettings()の
// たびに呼ばれるため、リロード直後・他タブでの変更後もここで自動的に復元される
// （js/onlineBattleScreen.jsのapplySettingsToHostForm()と同じ考え方）。
// 【2026-08-27変更】曲そのものの選択は共同選曲セクション（updateLyricsCollabSongSectionUi）へ
// 切り出したため、ここではラジオの状態同期だけを行う。
// 【2026-09-30改訂・本人指示：出題する曲4択統合】カテゴリという概念が独立設定では
// なくなったため、専用fieldsetの表示切り替えは不要になった（js/onlineBattleSongSourceUi.js参照）。
function setLyricsSongSourceRadio(settings) {
  const value = resolveSongSourceOptionValue(settings);
  const input = document.querySelector(`input[name="online-lyrics-battle-settings-song-source"][value="${value}"]`);
  if (input) input.checked = true;
}

// 【2026-08-27新設】現在分かっている「参加者全員が選んだ曲の和集合」を、今のルーム
// 共通曲（currentLyricsCommonSongPool）で絞り込んだ配列を返す。
function getMergedRestrictedLyricsSongIds() {
  if (!latestRoom) return [];
  const merged = computeMergedSelectedSongIds(latestRoom.players || {});
  return merged.filter((songId) => currentLyricsCommonSongPool.has(songId));
}

// 【2026-09-14新設】js/onlineBattleScreen.jsのresolveSongTitleForCollabUi()と全く同じ。
function resolveSongTitleForLyricsCollabUi(songId) {
  return SONGS.find((song) => song.id === songId)?.title ?? songId;
}

// 【2026-09-15新設・本人指示：共有曲選択UIをモード変更しても壊れないように】
// renderLyricsQuizLobbySettings()（延いてはupdateLyricsCollabSongSectionUi()）は
// gameModeが歌詞クイズのときしか呼ばれないため、「歌詞クイズ→他モード」への切り替え時に
// このセクションを隠す機会が無かった（実機報告の根本原因）。js/onlineBattleScreen.jsの
// renderLobby()から、gameModeを問わず毎回呼んでもらう専用の強制非表示関数。
// 「選択曲を見る」パネルの開閉状態も、次に表示されたときに開いたままにならないよう
// あわせてリセットする。
export function forceHideLyricsCollabSongSection() {
  if (elements?.lyricsCollabSongSection) elements.lyricsCollabSongSection.hidden = true;
  resetCollaborativeSelectionDetailsPanel(elements?.lyricsCollabDetailsToggle, elements?.lyricsCollabDetailsPanel);
}

// 【2026-08-27新設】共同選曲セクション（ホスト・参加者共通）の表示を更新する。
function updateLyricsCollabSongSectionUi(room) {
  const isCollaborative = room.settings?.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  elements.lyricsCollabSongSection.hidden = !isCollaborative;
  if (!isCollaborative) {
    resetCollaborativeSelectionDetailsPanel(elements.lyricsCollabDetailsToggle, elements.lyricsCollabDetailsPanel);
    return;
  }

  const merged = computeMergedSelectedSongIds(room.players || {});
  const restrictedCount = merged.filter((songId) => currentLyricsCommonSongPool.has(songId)).length;
  elements.lyricsCollabMyCount.textContent = `自分が選んだ曲: ${mySelectedSongIds.length}曲`;
  elements.lyricsCollabTotalCount.textContent =
    merged.length === 0
      ? "まだ誰も曲を選んでいません。下のボタンから選んでください。"
      : `参加者全員の選択を合わせて${merged.length}曲（このうち${restrictedCount}曲がこの対戦で使えます）`;

  // 【2026-09-14新設・本人指示：誰がどの曲を選んだか／共有曲一覧をリアルタイム反映】
  // js/onlineBattleScreen.jsのupdateCollabSongSectionUi()と全く同じ考え方。
  renderCollaborativeSelectionBreakdown({
    byPlayerListElement: elements.lyricsCollabByPlayerList,
    uniqueSongListElement: elements.lyricsCollabUniqueSongList,
    players: room.players || {},
    songTitleResolver: resolveSongTitleForLyricsCollabUi,
    currentUid: getCurrentUid(),
  });

  // 【2026-09-15新設・本人指示：曲選択画面を開いたままリアルタイム同期】
  // js/onlineBattleScreen.jsの同じ変更と全く同じ考え方。
  if (document.body.dataset.screen === "onlineBattleSongPicker") {
    updateOnlineBattleSongPickerLiveSelections({
      players: room.players || {},
      currentUid: getCurrentUid(),
      mergedTotalCount: merged.length,
      restrictedCount,
    });
  }
}

// 【2026-08-27新設・ホスト専用】js/onlineBattleScreen.jsのsyncCollaborativeSongPoolIfHost()と
// 全く同じ考え方。参加者全員の選択の和集合を、今のルーム共通曲（歌詞データの所持状況）で
// 絞り込んだ結果が変わっていれば、ホストの端末からsettingsへ反映する。
async function syncLyricsCollaborativeSongPoolIfHost(room, isHost) {
  if (!isHost) return;
  const settings = room.settings;
  if (settings.questionSource?.type !== QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION) return;

  const merged = computeMergedSelectedSongIds(room.players || {});
  const restricted = merged.filter((songId) => currentLyricsCommonSongPool.has(songId));
  const currentSongIds = settings.questionSource.songIds ?? [];
  if (areSongIdSetsEqual(restricted, currentSongIds)) return;

  await applyLyricsQuizSettingsChange(room, {
    ...settings,
    questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: restricted },
  });
}

// 曲選択画面を開く。ホスト・参加者を問わず、誰でも「自分の選択」を編集できる
// （本人指示：全員で共同選曲する）。initialSongIds省略時は今の自分の選択
// （mySelectedSongIds）をそのまま引き継ぐ。お気に入り・プレイリストから選んだ場合は、
// その時点の曲id配列を渡す。
// 【2026-08-27重要】js/onlineBattleScreen.jsのopenCollabSongPicker()と全く同じ理由で、
// initialSongIdsは必ずcurrentLyricsCommonSongPoolでフィルタしてから渡す（一覧に表示
// されない曲が、内部の選択状態にだけ残ってしまう事故を防ぐため）。
function openLyricsCollabSongPicker(initialSongIds) {
  const songIdsToShow = sanitizeSongIds(
    (initialSongIds ?? mySelectedSongIds).filter((songId) => currentLyricsCommonSongPool.has(songId))
  );
  openOnlineBattleSongPicker(
    songIdsToShow,
    async (songIds) => {
      mySelectedSongIds = songIds;
      elements.navigateTo("onlineBattleLobby");
      await submitMySelectedLyricsSongIds(songIds);
    },
    () => {
      elements.navigateTo("onlineBattleLobby");
    },
    // 【2026-08-08新設・2026-08-27拡張】歌詞クイズ対戦の曲選択一覧には、Overture等の
    // 歌詞クイズ対象外の曲を表示しない。加えて、今のルーム参加者全員が実際に歌詞データを
    // 持っている曲だけに絞り込む（本人指示：曲指定画面でも共通曲以外は選べないようにする）。
    (song) => isLyricsQuizEligibleSong(song) && currentLyricsCommonSongPool.has(song.id)
  );
  // 【2026-09-15新設・本人指示：画面を開いたままリアルタイム同期】
  // js/onlineBattleScreen.jsのopenCollabSongPicker()と全く同じ考え方。
  if (latestRoom) {
    const merged = computeMergedSelectedSongIds(latestRoom.players || {});
    updateOnlineBattleSongPickerLiveSelections({
      players: latestRoom.players || {},
      currentUid: getCurrentUid(),
      mergedTotalCount: merged.length,
      restrictedCount: merged.filter((songId) => currentLyricsCommonSongPool.has(songId)).length,
    });
  }
}

// 【2026-08-28新設】js/onlineBattleScreen.jsのopenSongListConfirm()と全く同じ考え方。
function openLyricsSongListConfirm(title, subtitle, songIds) {
  openOnlineBattleSongListConfirm({
    title,
    subtitle,
    songIds,
    onConfirm: async () => {
      mySelectedSongIds = songIds;
      await submitMySelectedLyricsSongIds(songIds);
    },
    onAddMore: () => {
      openLyricsCollabSongPicker(songIds);
    },
  });
}

// 【2026-08-27新設】js/onlineBattleScreen.jsのsubmitMySelectedSongIds()と全く同じ考え方。
async function submitMySelectedLyricsSongIds(songIds) {
  if (!latestRoom) return;
  try {
    await reportMySelectedSongIds({ roomId: latestRoom.roomId, songIds });
    if (elements.lyricsSettingsError) elements.lyricsSettingsError.hidden = true;
  } catch {
    if (elements.lyricsSettingsError) {
      elements.lyricsSettingsError.textContent =
        "曲の選択を保存できませんでした。アプリの更新状況をご確認のうえ、もう一度お試しください。";
      elements.lyricsSettingsError.hidden = false;
    }
  }
}

function describeAnswerPoolChipLabel(size) {
  return size === "all" ? "全曲検索" : `${size}択`;
}

function findRuleLabel(ruleId) {
  return lyricsQuizBattleMode.listAvailableBattleRulesForSettings().find((rule) => rule.ruleId === ruleId)?.label ?? ruleId;
}

// 【2026-09-08新設・本人指示O：現在のルールの簡単説明】ホストの設定画面が持つ説明文
// （describeRuleOptions()と同じ出どころ）を、ゲスト向けサマリーでもそのまま使う。
function findRuleDescription(ruleId) {
  return lyricsQuizBattleMode.listAvailableBattleRulesForSettings().find((rule) => rule.ruleId === ruleId)?.description ?? "";
}

// 【再戦準備フェーズ新設・本人指示】チップ文字列の組み立てだけを行う純粋関数として
// 切り出した（DOM操作を含まない）。renderLyricsQuizParticipantSummary()（ロビーの参加者
// 向け設定サマリー）が使うのはもちろん、js/onlineBattleScreen.jsの再戦準備フェーズ画面
// （renderRematchSummaryChips()）でも「今回の設定の簡単な要約」として全く同じチップを
// 再利用する（本人指示：同じ内容を2箇所で別々に組み立てて食い違う事故を防ぐ）。
export function buildLyricsQuizSettingsSummaryChips(settings) {
  // 【2026-08-31改訂】ヒントは本人がボタンで手動で開く方式になり、settings.hintIntervalSec
  // （自動送り間隔）の設定項目自体が無くなったため、このチップからも外した。
  const chips = [
    "歌詞クイズ",
    findRuleLabel(settings.battleRuleId),
    describeAnswerPoolChipLabel(settings.answerPoolSizeValue),
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? settings.questionCountValue,
  ];
  // 【2026-09-30改訂・本人指示：出題する曲4択統合】js/onlineBattleSongSourceUi.jsの
  // 共通ヘルパーで、カテゴリ／曲を選んで出題のどちらでも1行の文言に変換する。
  chips.push(describeSongSourceForSettings(settings));
  return chips;
}

function renderLyricsQuizParticipantSummary(settings) {
  clearElement(elements.lyricsSettingsSummaryContainer);
  buildLyricsQuizSettingsSummaryChips(settings).forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    elements.lyricsSettingsSummaryContainer.appendChild(chip);
  });
  if (elements.lyricsSettingsRuleDescription) {
    elements.lyricsSettingsRuleDescription.textContent = findRuleDescription(settings.battleRuleId);
  }
}

// settings.questionSourceから解決した曲プールの歌詞データが自分の端末に揃っているかを
// 確認し、件数だけをFirebaseへ送る（曲名は送らない）。曲プール自体が変わっていなければ
// IndexedDBを読み直さない。
async function refreshAndSubmitLyricsCoverage(room) {
  // 【2026-08-08修正】questionSource.jsのresolveSongPool()ではなく、歌詞クイズ対象外の曲
  // （Overture等、ボーカルの無い曲）を除いた曲プールを使う。
  // 【2026-09-16改訂・本人指示：他モードとの機能差解消】categoryFilterValueが増えたため、
  // js/battleModes/lyricsQuizBattleMode.jsのresolveSettingsSongPool()（questionSourceに
  // 加えてcategoryFilterValueも考慮し、歌詞クイズ対象外の曲も除いた窓口）を経由するよう
  // 変更した。ここをそのままにすると、カテゴリで絞り込んだ範囲より広い「歌詞データの充足」を
  // 参加者に要求してしまい、実際の出題範囲と読み込み確認の範囲がずれてしまう。
  const songPool = lyricsQuizBattleMode.resolveSettingsSongPool(room.settings);
  const poolHash = computeSongPoolHash(songPool);
  if (lyricsCoverageSubmittedHash === poolHash) return;

  const availableEntries = await loadSongsWithLyrics(songPool);
  const availableIds = new Set(availableEntries.map((entry) => entry.song.id));
  ownMissingSongTitlesCache = songPool
    .filter((songId) => !availableIds.has(songId))
    .map((songId) => SONGS.find((song) => song.id === songId)?.title ?? songId);

  // Firebaseへの送信完了を待たずに、今わかった内容をすぐ自分の画面へ反映する。
  // 送信の往復を待つ形にしていたことで、ロビー初回表示が「未確認」のまま数秒〜
  // 取り残され、リロードしないと直らない不具合の原因になっていた（本人からの指摘・2026-08-06）。
  ownLyricsCoverageStatus = {
    availableCount: availableIds.size,
    requiredCount: songPool.length,
    complete: availableIds.size >= songPool.length,
    poolHash,
  };
  lyricsCoverageSubmittedHash = poolHash;
  if (document.body.dataset.screen === "onlineBattleLobby") {
    renderLyricsQuizReadinessSection(latestRoom ?? room, room.host === getCurrentUid());
  }

  await submitLyricsCoverage({
    roomId: room.roomId,
    availableCount: availableIds.size,
    requiredCount: songPool.length,
    poolHash,
  });
}

function renderLyricsQuizReadinessSection(room, isHost) {
  const players = room.players || {};
  const myUid = getCurrentUid();
  const displayNameByUid = Object.fromEntries(Object.entries(players).map(([uid, player]) => [uid, player.name]));
  // 自分の分だけは、Firebaseへ届いたroom.players側の値より、ローカルで確認済みの
  // ownLyricsCoverageStatusを優先する（未反映の間の誤表示を防ぐため）。
  // coverageが無い場合はnullのまま渡し、「確認中」として扱う（0曲と断定しない）。
  const lyricsCoverageByUid = Object.fromEntries(
    Object.entries(players).map(([uid, player]) => [
      uid,
      uid === myUid && ownLyricsCoverageStatus ? ownLyricsCoverageStatus : (player.lyricsCoverage ?? null),
    ])
  );
  // 【2026-09-16改訂・本人指示：他モードとの機能差解消】refreshAndSubmitLyricsCoverage()と
  // 同じ理由で、categoryFilterValueも考慮したresolveSettingsSongPool()を使う
  // （host側とguest側が同じ計算式でpoolHashを出さないと、常に「確認中」のまま揃わなくなる）。
  const hostPoolHash = computeSongPoolHash(lyricsQuizBattleMode.resolveSettingsSongPool(room.settings));
  const readiness = describeLyricsReadiness(lyricsCoverageByUid, hostPoolHash, displayNameByUid);
  renderLyricsReadinessStatus(elements.lyricsReadinessStatusContainer, readiness, { isHostView: isHost });

  if (isHost) {
    clearElement(elements.lyricsOwnMissingContainer);
  } else {
    renderOwnMissingLyricsTitles(elements.lyricsOwnMissingContainer, describeOwnMissingLyricsTitles(ownMissingSongTitlesCache));
  }
}

// js/onlineBattleScreen.jsのrenderLobby()から、ホスト/参加者どちらの視点かとともに呼ばれる。
export function renderLyricsQuizLobbySettings(room, isHost) {
  latestRoom = room;
  elements.lobbySettingsHostLyrics.hidden = !isHost;
  elements.lobbySettingsParticipantLyrics.hidden = isHost;
  const settings = room.settings;
  const myUid = getCurrentUid();

  // 【2026-08-27新設】room更新のたび（参加者の入退室・歌詞所持データ報告のたび）に
  // 「今この瞬間、参加者全員が実際に歌詞データを持っている曲」を再計算する
  // （js/onlineBattleScreen.jsのrenderLobby()と同じ考え方。共通曲数の表示自体は
  // あちらが一元的に担当するため、ここでは曲選択画面のフィルタ用にだけ使う）。
  const allEligibleSongIds = resolveAllEligibleSongIdsForMode(room.gameMode);
  currentLyricsCommonSongPool = new Set(
    computeRoomCommonSongPool({
      allEligibleSongIds,
      players: room.players || {},
      kind: getAvailabilityKind(room.gameMode),
    })
  );
  // 自分の選択曲一覧を、room.players側の値へ常に合わせておく。
  mySelectedSongIds = Array.isArray(room.players?.[myUid]?.selectedSongIds)
    ? room.players[myUid].selectedSongIds
    : [];

  if (isHost) {
    const ruleOptions = describeRuleOptions(settings.battleRuleId);
    renderRuleOptions(elements.lyricsRuleOptionsContainer, ruleOptions, (ruleId) => {
      if (ruleId === settings.battleRuleId) return;
      const ruleDefaults = createDefaultSettingsForRule(ruleId);
      const poolOptions = describeAnswerPoolSizeOptions(ruleId, settings.answerPoolSizeValue);
      const answerPoolSizeValue = poolOptions.some((option) => option.selected)
        ? settings.answerPoolSizeValue
        : poolOptions[0]?.size ?? settings.answerPoolSizeValue;
      applyLyricsQuizSettingsChange(room, { ...settings, ...ruleDefaults, answerPoolSizeValue });
    });

    const poolSizeOptions = describeAnswerPoolSizeOptions(settings.battleRuleId, settings.answerPoolSizeValue);
    renderAnswerPoolSizeOptions(elements.lyricsPoolSizeOptionsContainer, poolSizeOptions, (size) => {
      applyLyricsQuizSettingsChange(room, { ...settings, answerPoolSizeValue: size });
    });

    const formFields = describeSettingsForm(settings.battleRuleId, settings);
    renderSettingsForm(elements.lyricsSettingsFormContainer, formFields, (key, value) => {
      applyLyricsQuizSettingsChange(room, { ...settings, [key]: value });
    });

    setQuestionCountRadio(settings.questionCountValue);
    setLyricsSongSourceRadio(settings);
  } else {
    renderLyricsQuizParticipantSummary(settings);
  }

  // 【2026-08-27新設】共同選曲：ホスト・参加者を問わず同じ表示を行い、ホストの端末だけが
  // 「参加者全員の選択の和集合」をsettingsへ自動的に反映する。
  updateLyricsCollabSongSectionUi(room);
  syncLyricsCollaborativeSongPoolIfHost(room, isHost);
  // 【2026-10-01新設】syncLyricsCollaborativeSongPoolIfHost()が実際に書き込みを行った
  // かどうかに関わらず、room更新のたび必ずエラー表示を今のroom.settingsで同期し直す
  // （古い曲数のまま表示され続けるバグの修正、上のrefreshLyricsSettingsErrorDisplay()参照）。
  if (isHost) refreshLyricsSettingsErrorDisplay(room);

  renderLyricsQuizReadinessSection(room, isHost);
  refreshAndSubmitLyricsCoverage(room);
}

// ===== 対戦中：入場 =====
//
// 【Phase6.5・ホストのリロード復帰】この関数は、①対戦開始直後（ホスト・参加者とも）と
// ②ホストが試合中にリロード・再接続して戻ってきた場合の、両方の入口になる。
// ②かどうかは、Firebase上の試合に既にcurrentQuestionIndexが書き込まれているか
// （＝既に進行が始まっているか）で判定し、restoreMatchProgressFromFirebase()で
// 進行ミラーを再構築する（ゼロから作り直すcreateMatchProgress()は使わない）。
export async function enterLyricsQuizBattlePlay(room) {
  const myEntryToken = ++battlePlayEntryToken;

  // 【2026-09-03発見・修正】goToCountdownScreen()のsetTimeout(500ms)経由で呼ばれる場合、
  // 渡されるroomはカウントダウン開始時点のスナップショット（status:"countdown"のまま）で、
  // Firebase側が実際にstatus:"playing"へ進んでいてもこのクロージャは気づかない
  // （js/onlineInstantCoopBattleScreen.jsのenterInstantCoopBattlePlay()で既に見つかり
  // 修正済みの不具合と同じ原因）。この関数は「実際に対戦が始まる・再開する」瞬間にしか
  // 呼ばれないため、statusを強制的にPLAYINGへ正規化して問題ない。正規化しないと、
  // 400ms間隔のruntTick()がlatestRoom.status !== PLAYINGで永久に早期returnし続け、
  // 最初の問題が誰の端末でも初期化されず、画面が真っ白なまま進行しなくなる。
  const normalizedRoom = { ...room, status: ROOM_STATUS.PLAYING };
  latestRoom = normalizedRoom;
  currentMatchId = normalizedRoom.activeMatchId;
  runtimeReady = false;
  currentQuestions = [];
  hostState = null;
  hostTickInFlight = false;
  resolvedAtLocalMs = null;
  lastRenderedQuestionIndex = -1;
  lastRevealedQuestionIndex = -1;
  lastHintRevealedQuestionIndex = -1;
  lastRevealSfxPlayedForQuestionIndex = -1;
  mySubmittedForQuestionIndex = -1;
  mySubmissionOutcomeForQuestionIndex = -1;
  mySelectedSongId = null;
  myOutcomeHistory = [];
  myComboCount = 0;
  myQuestionStartedAtCache = {};
  winnerNameByQuestionIndex = {};
  myOpenedHintLevel = 1;
  myCurrentStealHintLevel = 1;
  myAnswerHintLevel = 1;
  myAnswerSearchQuery = "";
  myAnswerJumpRowKey = null;
  lastActivityReportedAtMs = 0;
  lastActivityReportedQIndex = -1;

  elements.battleError.hidden = true;
  // 【2026-09-08修正・本人指示：前問状態の持ち越し防止】is-notice・is-steal-successは
  // 条件付きtoggle()ではなく一部add()だけで付けている箇所があり、次の問題・次の試合まで
  // クラスが残ったままになる余地があったため、ここで明示的にリセットする。
  elements.battleError.classList.remove("is-notice", "is-steal-success");
  elements.battleStatusMessage.hidden = true;
  elements.battleAnswerReveal.hidden = true;
  clearElement(elements.battleHudContainer);
  clearElement(elements.battleAnswerChoicesContainer);
  clearElement(elements.battleHintLinesContainer);
  clearElement(elements.battleHintActions);
  if (elements.battleAnswerSearchInput) elements.battleAnswerSearchInput.value = "";
  elements.battleAnswerSearchRow.hidden = true;
  elements.battleAnswerJumpBar.hidden = true;
  clearElement(elements.idleNotice);
  elements.idleNotice.hidden = true;
  elements.navigateTo("onlineLyricsBattleQuestion");
  startServerTimeOffsetTracking();

  const runtimeContext = await lyricsQuizBattleMode.prepareRuntimeContext({ settings: room.settings });
  if (myEntryToken !== battlePlayEntryToken) return; // 待っている間に、より新しい入場処理が始まっていた
  if (!runtimeContext.ok) {
    elements.battleError.textContent = runtimeContext.reason ?? "歌詞データの読み込みに失敗しました。";
    elements.battleError.hidden = false;
    return;
  }

  const availability = lyricsQuizBattleMode.checkRuntimeAvailability({ runtimeContext, settings: room.settings });
  if (!availability.ok) {
    elements.battleError.textContent = availability.reason ?? "出題できる曲が足りません。";
    elements.battleError.hidden = false;
    return;
  }

  currentQuestions = lyricsQuizBattleMode.buildQuestions({ seed: room.seed, settings: room.settings, runtimeContext });
  if (currentQuestions.length === 0) {
    elements.battleError.textContent = "出題できる問題がありませんでした。";
    elements.battleError.hidden = false;
    return;
  }
  runtimeReady = true;

  const myUid = getCurrentUid();
  if (room.host === myUid) {
    const match = room.matches?.[currentMatchId] ?? {};
    const participantUids = Object.keys(match.participants ?? {});
    const isReconnect = typeof match.currentQuestionIndex === "number";
    hostState = isReconnect
      ? restoreMatchProgressFromFirebase({
          questions: currentQuestions,
          allPlayerUids: participantUids,
          hostUid: myUid,
          match,
          settings: room.settings,
          nowMs: Date.now(),
        })
      : createMatchProgress({ questions: currentQuestions, allPlayerUids: participantUids, hostUid: myUid, nowMs: Date.now() });

    // 復帰時、現在の問題が既に確定済みなら、「結果を見せる」残り時間をサーバー時刻基準の
    // resolvedAtから引き継ぐ（リロードのたびに見せる時間が延長され続けないようにするため）。
    if (hostState.currentQuestion.status === "resolved") {
      resolvedAtLocalMs = typeof match.resolvedAt === "number" ? match.resolvedAt - serverTimeOffset : Date.now();
    }
  }

  startTickTimer();
  renderCurrentQuestionState();
}

function startServerTimeOffsetTracking() {
  stopServerTimeOffsetTracking();
  offsetUnsubscribe = subscribeServerTimeOffset((offset) => {
    serverTimeOffset = offset;
  });
}
function stopServerTimeOffsetTracking() {
  if (offsetUnsubscribe) {
    offsetUnsubscribe();
    offsetUnsubscribe = null;
  }
}

function startTickTimer() {
  stopTickTimer();
  tickTimerId = setInterval(runTick, HOST_TICK_INTERVAL_MS);
}
function stopTickTimer() {
  if (tickTimerId) {
    clearInterval(tickTimerId);
    tickTimerId = null;
  }
}

function runTick() {
  if (!latestRoom || latestRoom.status !== ROOM_STATUS.PLAYING) return;
  if (getCurrentUid() === latestRoom.host) {
    runHostProgressionTick();
  }
  renderCurrentQuestionState();
}

// ===== ホスト専用：進行ミラー（js/lyricsQuizMatchProgress.js）の駆動 =====

// 【2026-08-12修正・重大バグ】この関数の途中で例外が発生すると、hostTickInFlightを
// falseへ戻す行が実行されないまま関数を抜けてしまい、以後すべてのtickが冒頭の
// `hostTickInFlight`ガードで無条件に早期returnし続ける＝進行が永久に止まる、という
// 致命的な不具合があった（本人からの実機報告「歌詞クイズ対戦がどのルールでも進まない」の
// 根本原因の1つ）。呼び出し側（runTick）はこの関数の戻り値を待たず・catchもしないため、
// 例外は「未処理のPromise拒否」として静かに握りつぶされ、画面には何のエラーも表示されずに
// 進行だけが止まる＝ユーザー視点では「真っ白のまま何も起きない」状態になっていた。
// try/finallyで必ずhostTickInFlightを解除し、想定外の失敗はconsole.errorで可視化する
// （UIをこれ以上壊さないよう、ユーザー向けの表示は変えず開発者向けの可視化のみ行う）。
async function runHostProgressionTick() {
  if (!currentMatchId || !latestRoom || hostTickInFlight) return;
  // 【2026-09-15追加】runTick()はsetIntervalで独立に動いており、
  // handleLyricsQuizRoomUpdate()側のガードを経由しないため、ここでも同じ
  // 「currentMatchIdが今のroom.activeMatchIdと一致しているか」を確認する。
  // 一致していなければ、前試合のmatches/{currentMatchId}に対する進行処理
  // （最悪の場合はadvanceToNextQuestion()等の書き込み）を止める。
  if (latestRoom.activeMatchId !== currentMatchId) return;
  const match = latestRoom.matches?.[currentMatchId];
  if (!match) return;

  if (typeof match.currentQuestionIndex !== "number") {
    hostTickInFlight = true;
    try {
      // 【2026-09-01新設・本人指示：ライブスコアボード】最初の問題を開始する時点で、
      // 全員0点のscoreSnapshotも一緒に書いておく（参加者側が「まだデータが無い」ではなく
      // 「全員0点」から一覧を表示できるようにするため。hostStateはこの時点で
      // createMatchProgress()直後＝全員の履歴が空のはずなので、常に全員0点になる）。
      const scoreSnapshot = hostState ? computeScoreSnapshotFromState(hostState) : undefined;
      const result = await startLyricsQuizQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: 0, scoreSnapshot });
      if (!result.ok) {
        // eslint-disable-next-line no-console
        console.error("歌詞クイズ対戦：最初の問題の開始に失敗しました", result.reason);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("歌詞クイズ対戦：進行タイマーで想定外のエラーが発生しました（最初の問題の開始）", error);
    } finally {
      hostTickInFlight = false;
    }
    return;
  }

  if (!hostState || !runtimeReady) return;
  if (hostState.currentQuestionIndex !== match.currentQuestionIndex) return; // Firebase側の反映待ち

  const qIndex = hostState.currentQuestionIndex;
  const firebaseAnswers = match.answers?.[qIndex] ?? {};
  for (const [uid, answer] of Object.entries(firebaseAnswers)) {
    if (!(uid in hostState.currentQuestion.answersByUid)) {
      hostState = recordAnswer(hostState, uid, answer);
    }
  }
  const firebaseWinner = match.questionClaims?.[qIndex]?.winner;
  if (firebaseWinner && !hostState.currentQuestion.winner) {
    hostState = recordStealClaim(hostState, firebaseWinner.uid, firebaseWinner.submittedAt);
  }
  // 【2026-09-06新設・3分無操作の放置救済】ホストがforceSkipIdlePlayer()で書き込んだ
  // forcedSkipsは、「本人がわからないボタンを押した場合」と全く同じ経路
  // （recordAnswer()へSKIP_SELECTIONの回答を渡す）で進行ミラーへ取り込む。
  // 新しいFirebaseフィールド・新しい採点分岐は一切増やさず、既存の「わからない」処理を
  // ホストの操作からも呼べるようにするだけ、という設計にしてある。
  const firebaseForcedSkips = match.forcedSkips?.[qIndex] ?? {};
  for (const uid of Object.keys(firebaseForcedSkips)) {
    if (!(uid in hostState.currentQuestion.answersByUid)) {
      hostState = recordAnswer(hostState, uid, { selectedSongId: SKIP_SELECTION, hintLevel: 1, submittedAt: Date.now() });
    }
  }
  // 【2026-09-15追加・本人指示：途中退出者を待ち続けない】markPlayerDnf()自体は既に
  // 用意されていたが、「この試合だけ抜ける」（leftDuringMatch）からは一度も呼ばれておらず、
  // 離脱した人がまだこの問題へ回答していないと、3分無操作救済がホストの手動操作で発動する
  // までtick()の終了判定（shouldEndQuestion、dnfUidsを除いたactivePlayerUidsで判定）が
  // 満たされず進行が止まっていた（実際のバグ調査で発見）。離脱を検知したら即座にDNF化する
  // （markPlayerDnf()自身が「既に全問完走済みの人はDNF化しない」安全策を持っているため、
  // ここでは条件を絞らずbroadcastしてよい）。
  for (const [uid, participant] of Object.entries(match.participants ?? {})) {
    if (participant?.leftDuringMatch === true) {
      hostState = markPlayerDnf(hostState, uid);
    }
  }

  // 【2026-09-09新設・本人指示4：通信切断時の自動復帰待ち→離脱処理】まだ回答していない
  // 参加者のうち、実際に接続が切れている（connected:false）人だけを対象に、切断が続いている
  // 時間を計測する。復帰すればカウントをリセットし、DISCONNECT_AUTO_SKIP_MS以上切断が
  // 続いたままなら、既存の放置救済と同じ経路で自動的に「わからない」扱いにする
  // （本人指示：一時的な通信の乱れでは即座に離脱扱いにしない）。
  if (hostState.currentQuestion.status === "active") {
    const activeUids = hostState.allPlayerUids.filter((uid) => !hostState.dnfUids.includes(uid));
    for (const uid of activeUids) {
      if (uid in hostState.currentQuestion.answersByUid) {
        disconnectedSinceMsByUid.delete(uid);
        continue;
      }
      const isConnected = latestRoom.players?.[uid]?.connected !== false;
      if (isConnected) {
        disconnectedSinceMsByUid.delete(uid);
        continue;
      }
      if (!disconnectedSinceMsByUid.has(uid)) {
        disconnectedSinceMsByUid.set(uid, Date.now());
        continue;
      }
      const disconnectedForMs = Date.now() - disconnectedSinceMsByUid.get(uid);
      if (disconnectedForMs >= DISCONNECT_AUTO_SKIP_MS && !firebaseForcedSkips[uid]) {
        forceSkipIdlePlayer({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, targetUid: uid }).catch(() => {});
      }
    }
  }

  if (hostState.currentQuestion.status === "active") {
    const before = hostState;
    hostState = tick(hostState, latestRoom.settings, Date.now());
    if (hostState !== before && hostState.currentQuestion.status === "resolved") {
      resolvedAtLocalMs = Date.now();
      hostTickInFlight = true;
      try {
        const result = await resolveLyricsQuizQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId });
        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error("歌詞クイズ対戦：問題の確定に失敗しました", result.reason);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("歌詞クイズ対戦：進行タイマーで想定外のエラーが発生しました（問題の確定）", error);
      } finally {
        hostTickInFlight = false;
      }
    }
    return;
  }

  if (hostState.currentQuestion.status === "resolved" && resolvedAtLocalMs !== null && Date.now() - resolvedAtLocalMs >= REVEAL_DELAY_MS) {
    hostTickInFlight = true;
    try {
      const nextState = advanceToNextQuestion(hostState, Date.now());
      hostState = nextState;
      // 【2026-09-09新設・本人指示4】新しい問題へ移るタイミングで、前の問題の切断計測を
      // リセットする（次の問題でも切断が続いていれば、その時点から改めて計測し直す）。
      disconnectedSinceMsByUid.clear();
      // 【2026-09-01新設・本人指示：ライブスコアボード】ちょうど今確定した問題（reveal演出を
      // REVEAL_DELAY_MSぶん見せ終えた問題）までの累計スコアを計算し、次の問題の開始／
      // 最終結果の確定と「全く同じFirebase update()」に混ぜて書き込む。これにより、
      // 「revealが終わったタイミングで全員のスコアが同時に更新される」という最重要要件を、
      // 進行タイマー本来の仕組みだけで（新しい同期の仕組みを増やさずに）満たしている。
      const scoreSnapshot = computeScoreSnapshotFromState(nextState);
      if (nextState.status === "inProgress") {
        resolvedAtLocalMs = null;
        const result = await startLyricsQuizQuestion({
          roomId: latestRoom.roomId,
          matchId: currentMatchId,
          questionIndex: nextState.currentQuestionIndex,
          scoreSnapshot,
        });
        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error("歌詞クイズ対戦：次の問題の開始に失敗しました", result.reason);
        }
      } else {
        const entries = finalizeMatch(nextState, latestRoom.settings);
        if (entries) {
          const resultsByUid = Object.fromEntries(entries.map((entry) => [entry.uid, entry.result]));
          const result = await finalizeLyricsQuizMatch({ roomId: latestRoom.roomId, matchId: currentMatchId, resultsByUid, scoreSnapshot });
          if (!result.ok) {
            // eslint-disable-next-line no-console
            console.error("歌詞クイズ対戦：最終結果の確定に失敗しました", result.reason);
          }
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("歌詞クイズ対戦：進行タイマーで想定外のエラーが発生しました（次の問題／最終結果）", error);
    } finally {
      hostTickInFlight = false;
    }
  }
}

// ===== 対戦中：全クライアント共通の描画 =====

// 自分自身のライブHUD用に、確定済みの問題を出題順に1問ずつ「自分の結果」だけ計算して
// 積み上げる。ホストのhostStateとは別に、参加者を含む全クライアントが独立して行う
// （HUD表示は自分の分だけ分かればよく、全員分の進行を持つ必要が無いため）。
// 自分が未回答のまま問題が終わった場合は、ホストと同じくSKIP扱いで補完する。
//
// 【2026-08-31改訂・早押しバトルの勝者表示の正確化】以前はwinner claimが存在するだけで
// （実際に正解だったかの検算をせずに）表示名をlastWinnerNameCacheへ覚えていたため、
// 「誰も正解しなかった問題」の直後でも直前の勝者名が残り続ける不正確さがあった。
// resolveQuestionAnswers()に自分（myUid）だけでなく勝者候補（winnerUid）も一緒に渡し、
// js/battleRules/stealRule.js内部の再検算（isWinnerActuallyCorrect）を経たwonQuestionの
// 結果を見てから、問題インデックスごと（winnerNameByQuestionIndex[qIndex]）に確定させる
// （奪い取り以外のルールではwinnerが常にnullのため、この処理は実質何もしない）。
function maybeRecordMyOutcomeForResolvedQuestions(match) {
  const myUid = getCurrentUid();
  if (!myUid || !latestRoom) return;

  const resolvedUpToIndex = match.questionStatus === "resolved" ? match.currentQuestionIndex : match.currentQuestionIndex - 1;
  while (myOutcomeHistory.length <= resolvedUpToIndex) {
    const qIndex = myOutcomeHistory.length;
    const question = currentQuestions[qIndex];
    if (!question) break;

    const winner = match.questionClaims?.[qIndex]?.winner ?? null;
    const winnerUid = winner?.uid;
    const uidsToResolve = winnerUid && winnerUid !== myUid ? [myUid, winnerUid] : [myUid];
    const answersByUid = {};
    uidsToResolve.forEach((uid) => {
      answersByUid[uid] =
        uid === myUid
          ? ((match.answers?.[qIndex] ?? {})[myUid] ?? {
              selectedSongId: SKIP_SELECTION,
              hintLevel: MAX_HINT_LEVEL,
              submittedAt: myQuestionStartedAtCache[qIndex] ?? Date.now(),
            })
          : ((match.answers?.[qIndex] ?? {})[uid] ?? {
              selectedSongId: SKIP_SELECTION,
              hintLevel: MAX_HINT_LEVEL,
              submittedAt: match.currentQuestionStartedAt ?? Date.now(),
            });
    });
    const context = {
      answersByUid,
      correctSongId: question.song.id,
      winner,
      comboCountByUid: { [myUid]: myComboCount },
      questionStartedAt: myQuestionStartedAtCache[qIndex] ?? match.currentQuestionStartedAt,
      allPlayerUids: uidsToResolve,
      nowMs: Date.now(),
      settings: latestRoom.settings,
    };
    const outcomesByUid = lyricsQuizBattleMode.resolveQuestionAnswers(latestRoom.settings, context);
    const myOutcome = outcomesByUid[myUid];
    if (!myOutcome) break; // 安全側：万一取得できなければこれ以上進めない
    myOutcomeHistory.push(myOutcome);
    myComboCount = myOutcome.nextComboCount;

    if (winnerUid && outcomesByUid[winnerUid]?.wonQuestion) {
      winnerNameByQuestionIndex[qIndex] = match.participants?.[winnerUid]?.displayName ?? winnerUid;
    }
  }
}

// 【Phase6.5・HUDの完成度について】js/lyricsQuizBattleUi.jsのhudFields宣言にある項目のうち、
// 確定済み履歴（myOutcomeHistory）・直近の勝者名から求まるものは、すべてここで実値を計算する。
// 「現在の問題の獲得ポイント」（currentQuestionPoints）は、配点テーブルを画面層へ公開しないと
// 計算できず、かつ「今答えたら何点か」という予測的な意味合いが強く仕様として曖昧だったため、
// js/battleRules/stealRule.jsのhudFields宣言自体から削除した（未実装のまま「―」表示を
// 残さないため。詳しくはstealRule.jsのコメント参照）。
function computeMyLiveHudStats() {
  const totalPoints = myOutcomeHistory.reduce((sum, outcome) => sum + (outcome.pointsAwarded ?? 0), 0);
  const correctCount = myOutcomeHistory.filter((outcome) => outcome.outcome === "correct").length;
  const firstHintCorrectCount = myOutcomeHistory.filter((outcome) => outcome.outcome === "correct" && outcome.hintLevel === 1).length;
  const totalHintsUsed = myOutcomeHistory.reduce((sum, outcome) => sum + (outcome.hintLevel ?? 0), 0);
  const totalElapsedMs = myOutcomeHistory.reduce((sum, outcome) => sum + (outcome.responseMs ?? 0), 0);
  const questionsWon = myOutcomeHistory.filter((outcome) => outcome.wonQuestion === true).length;
  const maxCombo = myOutcomeHistory.reduce((max, outcome) => Math.max(max, outcome.nextComboCount ?? 0), 0);
  const currentMultiplier = lyricsQuizBattleMode.getComboMultiplierForCount(latestRoom.settings, myComboCount);
  return {
    totalPoints,
    correctCount,
    firstHintCorrectCount,
    totalHintsUsed,
    totalElapsedMs,
    questionsWon,
    currentCombo: myComboCount,
    maxCombo,
    ...(currentMultiplier !== null ? { currentMultiplier } : {}),
  };
}

// 【2026-08-31全面改訂、本人指示：歌詞クイズ3ルール全面改修】以前は「経過時間から
// 自動計算したヒント段階」を全ルール共通で表示していたが、新仕様では表示方法自体が
// ルールごとに異なる：
//   ・正解数バトル／ポイントバトル：本人が「ヒントNを見る」ボタンで開いた段階
//     （myOpenedHintLevel）までの歌詞を、これまでどおり行ごとに表示する。
//   ・早押しバトル：歌詞の該当箇所（最も詳しいヒント段階のテキスト）が、経過時間に応じて
//     1文字ずつ自動的に表示される（本人がボタンを押す必要はない）。
// 【2026-09-13追加・本人指示：答え合わせ時にヒント1〜4をすべて表示】回答確定後（isResolved）は、
// 採点に使った実際のヒント段階（myOpenedHintLevel）・ルール（早押しの連続表示方式を含む）に
// 関係なく、ヒント1〜4を1つのコンパクトな一覧として表示する。「残りのヒントは何だったのか」を
// 確認したい、という本人の要望に対応するもので、採点（pointsAwarded・myOutcomeHistory等）には
// 一切触れない、あくまで確定後の閲覧用の表示だけの変更。
// DOM再構築は1問につき1回だけに抑える（renderCurrentQuestionState()はHOST_TICK_INTERVAL_MS
// ごとに呼ばれ続けるため、歌詞クイズの答え合わせ点滅バグ〈同じ内容を毎tick作り直すとCSSの
// 出現アニメーションが再生し直される〉と同じ轍を踏まないよう、lastHintRevealedQuestionIndexで
// 「この問題はもう組み立て済みか」を追跡する）。
function renderResolvedHintSummary(question, questionIndex) {
  elements.battleHintLevel.textContent = "ヒント（全4段階）";
  elements.battleHintActions.hidden = true;
  if (lastHintRevealedQuestionIndex === questionIndex) return;
  lastHintRevealedQuestionIndex = questionIndex;

  // 回答前の1段階ずつの表示（.online-lyrics-battle-hint-line、行ごとに①②③…と自動採番）とは
  // 別の、コンパクトな一覧専用クラスを使う。同じクラスを使い回すと「ヒント1の1行目・2行目・
  // ヒント2の1行目…」のように連番が振られてしまい、どこからどのヒント段階かが分かりづらく
  // なるため（本人指示：ヒント1〜4がひと目で分かるように）、ヒント段階ごとにバッジを添える。
  clearElement(elements.battleHintLinesContainer);
  elements.battleHintLinesContainer.classList.add("online-lyrics-battle-hint-summary-list");
  // 【2026-11-XX改訂・本人指示：画面表示は歌詞の時系列順】回答前の一覧
  // （このすぐ上のrenderHintArea内）と同じく、答え合わせ時も歌詞の登場順に並べて見せる
  // （バッジのヒント番号は元のhintLevelのまま変えない）。
  const hintsSortedByTime = [...question.hints].sort((a, b) => a.startLine - b.startLine);
  hintsSortedByTime.forEach((hint) => {
    const text = (hint.segment?.text ?? "").replace(/\n/g, " ").trim();
    if (!text) return;
    const item = document.createElement("p");
    item.className = "online-lyrics-battle-hint-summary-item";
    const levelBadge = document.createElement("span");
    levelBadge.className = "online-lyrics-battle-hint-summary-level";
    levelBadge.textContent = `ヒント${hint.hintLevel}`;
    item.appendChild(levelBadge);
    const textSpan = document.createElement("span");
    textSpan.className = "online-lyrics-battle-hint-summary-text";
    textSpan.textContent = text;
    item.appendChild(textSpan);
    elements.battleHintLinesContainer.appendChild(item);
  });
}

function renderHintArea(question, { ruleId, elapsedMs, isResolved, myAnsweredThisQuestion, questionIndex }) {
  if (isResolved) {
    renderResolvedHintSummary(question, questionIndex);
    return;
  }

  elements.battleHintLinesContainer.classList.remove("online-lyrics-battle-hint-summary-list");
  clearElement(elements.battleHintLinesContainer);

  if (ruleId === "steal") {
    // 【2026-09-14全面改訂・本人指示：ヒント1〜4を順番に1文字ずつ表示】以前は最も詳しい
    // 1段階（hints[length-1]）だけを表示していたが、ヒント1から順番に「1文字/秒で
    // 全文表示→2秒待機→次のヒントへ」を繰り返し、既に表示済みのヒントは消さずに
    // 積み上げて見せる仕様に変更した（js/lyricsQuizBattleTiming.jsのcomputeStealHintProgress
    // 参照）。回答済みの本人には全段階を即座にフル表示する（他プレイヤーの回答を
    // 待っている間、自分の画面だけヒントが止まって見えるのを避けるため）。
    elements.battleHintActions.hidden = true;
    elements.battleHintLevel.textContent = "";
    const hintTexts = question.hints.map((hint) => hint.segment?.text ?? "");
    const effectiveElapsedMs = myAnsweredThisQuestion ? Number.POSITIVE_INFINITY : elapsedMs;
    const { levels } = computeStealHintProgress({ elapsedMs: effectiveElapsedMs, hintTexts });
    // 【2026-10-01新設】回答前（まだelapsedMsが進み続けている間）だけ、今画面に出ている
    // 最大ヒント段階を記録する（回答した瞬間にhandleAnswerChoiceClick()がこの値を固定
    // コピーして使う。myAnsweredThisQuestion===trueの間はeffectiveElapsedMsが無限大になり
    // levelsが常に全段階を返してしまうため、ここでは更新しない＝回答時点の値のまま保つ）。
    if (!myAnsweredThisQuestion && levels.length > 0) {
      myCurrentStealHintLevel = levels[levels.length - 1].level;
    }
    // 答え合わせ時のヒント一覧（renderResolvedHintSummary）と全く同じCSSクラスを使い、
    // 回答中・答え合わせ後でヒントのフォント・見た目が食い違わないようにする
    // （本人指示：ヒントフォントの統一）。
    // 【2026-11-XX改訂・本人指示：画面表示は歌詞の時系列順】levels自体は「時間経過で
    // 開放された順（＝hintLevelの順）」のまま（myCurrentStealHintLevelの記録に使うため、
    // 上の代入では並べ替え前のlevelsを使っている）。表示専用に、歌詞の登場順
    // （startLine昇順）へ並べ替えたコピーを作る。バッジのヒント番号は元のhintLevelのまま。
    const levelToStartLine = new Map(question.hints.map((hint) => [hint.hintLevel, hint.startLine]));
    const sortedLevelsForDisplay = [...levels].sort(
      (a, b) => (levelToStartLine.get(a.level) ?? 0) - (levelToStartLine.get(b.level) ?? 0)
    );
    elements.battleHintLinesContainer.classList.add("online-lyrics-battle-hint-summary-list");
    sortedLevelsForDisplay.forEach(({ level, revealedText }) => {
      const item = document.createElement("p");
      item.className = "online-lyrics-battle-hint-summary-item";
      const levelBadge = document.createElement("span");
      levelBadge.className = "online-lyrics-battle-hint-summary-level";
      levelBadge.textContent = `ヒント${level}`;
      item.appendChild(levelBadge);
      const textSpan = document.createElement("span");
      textSpan.className = "online-lyrics-battle-hint-summary-text";
      textSpan.textContent = revealedText;
      item.appendChild(textSpan);
      elements.battleHintLinesContainer.appendChild(item);
    });
    // 【2026-10-01新設・本人指示：歌詞クイズ問題画面モバイルレイアウト再設計5章】早押しバトルは
    // ヒント1〜4が時間経過で自動的に積み上がっていく（css/style.cssの
    // .online-lyrics-battle-hint-linesのmax-height+内部スクロール参照）。新しいヒントが
    // 追加されるたびに、常に最新のヒント（一番下）が見える位置まで自動スクロールする。
    elements.battleHintLinesContainer.scrollTop = elements.battleHintLinesContainer.scrollHeight;
    return;
  }

  // 【2026-11-XX改訂・本人指示：ヒント1〜4を積み上げ表示・歌詞の時系列順に並べ替え】
  // 以前は「今開いている段階のヒントだけ」を表示し、次のヒントを開くと前のヒントが
  // 消えていた（本人の実機報告：「ヒント2を開くとヒント1が消える」不具合）。
  // js/lyricsSegmentEngine.jsのcomputeRevealedHintLines()（オフライン歌詞クイズと共通）で、
  // これまでに開いた段階（1〜myOpenedHintLevel）すべてを、歌詞の登場順に並べ替えて
  // 積み上げ表示する。各行のバッジには、並べ替え後の位置ではなく、元のhintLevel
  // （抽選順）をそのまま表示する（番号を書き換えない、という本人指示）。
  elements.battleHintLevel.textContent = `ヒント ${myOpenedHintLevel} / ${MAX_HINT_LEVEL}`;
  elements.battleHintLinesContainer.classList.add("online-lyrics-battle-hint-summary-list");

  if (lastHintFadeInState.questionIndex !== questionIndex) {
    lastHintFadeInState = { questionIndex, level: 0 };
  }
  const newlyRevealedLevel = myOpenedHintLevel > lastHintFadeInState.level ? myOpenedHintLevel : null;
  lastHintFadeInState.level = myOpenedHintLevel;

  const revealed = computeRevealedHintLines(question.hints, myOpenedHintLevel);
  let newlyRevealedElement = null;
  revealed.forEach((entry) => {
    const item = document.createElement("p");
    item.className = "online-lyrics-battle-hint-summary-item";
    const levelBadge = document.createElement("span");
    levelBadge.className = "online-lyrics-battle-hint-summary-level";
    levelBadge.textContent = `ヒント${entry.level}`;
    item.appendChild(levelBadge);
    const textSpan = document.createElement("span");
    textSpan.className = "online-lyrics-battle-hint-summary-text";
    textSpan.textContent = entry.text;
    item.appendChild(textSpan);
    elements.battleHintLinesContainer.appendChild(item);
    if (entry.level === newlyRevealedLevel) {
      item.classList.add("is-newly-revealed");
      newlyRevealedElement = item;
    }
  });
  // 新しく開放したヒントが見える位置まで、ヒント領域内だけ自動スクロールする
  // （回答候補一覧のスクロール位置は触らない）。
  if (newlyRevealedElement) {
    newlyRevealedElement.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  renderHintActionButtons({ isResolved, myAnsweredThisQuestion });
}

// 【2026-09-06新設・3分無操作の放置救済】本人がこの問題の中で意味のある操作をした
// 瞬間に呼ぶ。ホスト側の「3分間操作していません」判定に使われる（js/lyricsQuizBattleFirebase.js
// のreportQuestionActivity()参照）。呼ばれるたびに毎回Firebaseへ書き込むと通信量が
// 増えすぎるため、同じ問題の中では既定で15秒に1回までしか実際には送信しない
// （本人指示：「操作していれば無操作時間をリセットする」を、通信コストを抑えつつ満たす）。
function reportMyQuestionActivity() {
  const match = latestRoom?.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  if (typeof qIndex !== "number" || !latestRoom) return;
  const now = Date.now();
  if (qIndex === lastActivityReportedQIndex && now - lastActivityReportedAtMs < ACTIVITY_REPORT_THROTTLE_MS) return;
  lastActivityReportedQIndex = qIndex;
  lastActivityReportedAtMs = now;
  reportQuestionActivity({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex });
}

// 【2026-08-31新設】「ヒントNを見る」（未開放の次の段階が残っていれば1つだけ）と
// 「わからない」ボタン。早押しバトルでは使わない（呼び出し元でhidden=trueにする）。
function renderHintActionButtons({ isResolved, myAnsweredThisQuestion }) {
  clearElement(elements.battleHintActions);
  const shouldHide = isResolved || myAnsweredThisQuestion;
  elements.battleHintActions.hidden = shouldHide;
  if (shouldHide) return;

  if (myOpenedHintLevel < MAX_HINT_LEVEL) {
    const nextLevel = myOpenedHintLevel + 1;
    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.className = "secondary-button online-lyrics-battle-hint-open-button";
    openButton.textContent = `ヒント${nextLevel}を見る`;
    openButton.addEventListener("click", () => {
      // ヒントを開く操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      myOpenedHintLevel = nextLevel;
      reportMyQuestionActivity();
      renderCurrentQuestionState();
    });
    elements.battleHintActions.appendChild(openButton);
  }

  const giveUpButton = document.createElement("button");
  giveUpButton.type = "button";
  giveUpButton.className = "secondary-button online-lyrics-battle-give-up-button";
  giveUpButton.textContent = "わからない";
  // 【2026-09-15追加・本人指示：「わからない」確認ダイアログを全対象モードへ展開】
  // このボタンは早押しバトルでは表示されない（呼び出し元でhidden）ため、通常の回答
  // ボタンと同じく確認を挟んでよい（早押しのみ速度重視のため確認を省略する設計）。
  // handleAnswerChoiceClick()自身のresolveAnswerSubmissionBlock()が二重回答・状態不整合を
  // 防ぐため、確認画面が開いている間に問題が確定していても安全。
  giveUpButton.addEventListener("click", () => {
    // 確認モーダルを開くだけの軽い操作音（モーダル内の確定・キャンセルは
    // js/answerConfirmPrompt.js側で既に対応済みのため、ここでは重ねない）。
    playSfx(SFX_EVENTS.UI_CLICK);
    promptAnswerConfirm("わからない", () => handleAnswerChoiceClick(SKIP_SELECTION));
  });
  elements.battleHintActions.appendChild(giveUpButton);
}

// 【2026-08-31新設】30・50・全曲プールの検索文字列・50音ジャンプによる絞り込み。
// 「収録曲一覧」（js/songlist.js）と全く同じnormalizeForSearch・songMatchesSearchを
// 使うことで、検索結果が完全に一致するようにする（本人指示：新しい簡易検索を別に作らない）。
// 検索文字列が入力されている間は、50音ジャンプの選択行より検索を優先する
// （検索を始めたらmyAnswerJumpRowKeyをnullへ戻す呼び出し側の挙動と合わせている）。
function filterAnswerPool(pool) {
  const normalizedQuery = normalizeForSearch(myAnswerSearchQuery);
  if (normalizedQuery !== "") {
    return pool.filter((song) => songMatchesSearch(song.title, song.searchReading, song.searchAliases, normalizedQuery));
  }
  if (myAnswerJumpRowKey && myAnswerJumpRowKey !== "all") {
    // 【2026-09-15改訂・本人指示：50音ジャンプ後は表示順も五十音順にする】
    // js/answerPoolBrowseUi.jsのfilterAnswerPool()と同じ改訂。
    return sortSongsByReading(pool.filter((song) => deriveGojuonRowKey(song.searchReading ?? song.title) === myAnswerJumpRowKey));
  }
  return pool;
}

// 【2026-08-31新設】全曲プール専用の50音ジャンプバー（「すべて｜あ｜か｜さ｜…」）。
// 検索と違い、曲名が分からなくても「読み仮名の行」からブラウズして見つけられるようにする
// （本人指示：検索を必須にしない）。
function renderAnswerJumpBar() {
  clearElement(elements.battleAnswerJumpBar);
  const chips = [{ key: "all", label: "すべて" }, ...GOJUON_ROWS];
  chips.forEach(({ key, label }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-lyrics-battle-jump-chip";
    button.textContent = label;
    const isActive = key === "all" ? !myAnswerJumpRowKey || myAnswerJumpRowKey === "all" : myAnswerJumpRowKey === key;
    if (isActive) button.classList.add("is-active");
    button.addEventListener("click", () => {
      // 50音ジャンプチップの選択操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      myAnswerJumpRowKey = key;
      myAnswerSearchQuery = "";
      if (elements.battleAnswerSearchInput) elements.battleAnswerSearchInput.value = "";
      reportMyQuestionActivity();
      renderCurrentQuestionState();
    });
    elements.battleAnswerJumpBar.appendChild(button);
  });
}

function renderAnswerChoices(question, { isResolved, myAnsweredThisQuestion, questionIndex, resolvedAt }) {
  // 【2026-09-06新設・本人指示：実機フィードバック第3弾①】30・50・全曲プールでは、
  // 選択肢一覧をスクロールした状態のまま回答が確定すると、答え合わせカード
  // （elements.battleAnswerReveal、別の場所に静的配置されていた）がスクロール外に
  // 隠れて見えなくなる問題があった。確定した瞬間、選択肢一覧そのものを答え合わせカードへ
  // 差し替える（元のボタン一覧は消す）ことで、直前のスクロール位置に関係なく、
  // 選択肢があった同じ場所に必ず結果が表示されるようにする。
  if (isResolved) {
    // 【2026-09-13追加・本人指示：答え合わせがずっと点滅する不具合の修正】この関数は
    // 400ms間隔のtickのたびに毎回呼ばれるが、同じ問題の答え合わせを既に表示済みなら
    // 以下のDOM操作（clearElement→appendChild）を再度行わない。ここを毎tick実行すると、
    // 表示内容は同じでもelements.battleAnswerRevealがDOMから外れて入れ直され続け、
    // CSSの出現アニメーション（answerRevealPop）が0.4秒ごとに再生し直されて、実機では
    // カード全体・文字がずっと点滅しているように見えていた（本人からの実機報告で発覚）。
    if (lastRevealedQuestionIndex === questionIndex) return;
    lastRevealedQuestionIndex = questionIndex;

    elements.battleAnswerSearchRow.hidden = true;
    elements.battleAnswerJumpBar.hidden = true;
    elements.battleAnswerChoicesContainer.classList.remove("online-lyrics-battle-answer-list", "online-lyrics-battle-answer-list-compact");
    elements.battleAnswerChoicesContainer.classList.add("is-showing-reveal");
    clearElement(elements.battleAnswerChoicesContainer);
    elements.battleAnswerChoicesContainer.appendChild(elements.battleAnswerReveal);
    // 【2026-09-26新設・本人指示：サウンドシステム全面整備8章】答え表示が始まった、まさに
    // この瞬間（このガードにより1問につき1回だけ通る）に答え合わせ楽曲の再生を始める。
    // 【2026-09-30改訂・本人指示：22章】この端末が答え表示を検知した時刻ではなく、
    // サーバー時刻基準のresolvedAtから「本当の残り時間」を計算して渡す（バックグラウンド
    // からの復帰等で検知が遅れても、実際の答え表示終了時刻に正しく追従するため）。
    const remainingMsSec = computeRemainingRevealMs({
      revealDelayMs: REVEAL_DELAY_MS,
      resolvedAt,
      serverTimeOffset,
      nowMs: Date.now(),
    });
    // 【2026-11-XX追加・実機バグ調査：ホストだけ答え合わせ音源が鳴らないことがある不具合】
    // ホスト固有のタイミング差（resolvedAtのローカルエコーvs.サーバー確定値）が原因の
    // 可能性を実機で検証できるよう、再生開始時点の主要な値をすべて記録しておく。
    recordAudioDiagnostic("[ONLINE_LYRICS_BATTLE] 答え合わせ音源の開始判定", {
      uid: getCurrentUid(),
      isHost: latestRoom?.host === getCurrentUid(),
      questionIndex,
      songId: question.song?.id,
      myAnswerHintLevel,
      resolvedAt,
      serverTimeOffset,
      nowMs: Date.now(),
      remainingMsSec,
    });
    startRevealMusic(question, remainingMsSec);
    return;
  }
  elements.battleAnswerChoicesContainer.classList.remove("is-showing-reveal");

  // 【2026-09-15修正・実機回帰バグ】回答確定後・他プレイヤー待ち中（isResolvedになる前）は、
  // 選択肢ボタン自体はdisabledになっていたが、検索欄・50音ジャンプバーは
  // isLargePool（30・50・全曲プールか）だけを見て表示され続けており、myAnsweredThisQuestionを
  // 見ていなかった。検索・絞り込みは実際に機能してしまい、絞り込んだ結果に自分の回答
  // （is-selectedのハイライト）が含まれないと、画面上「まだ何も選んでいない／選び直せる」
  // ように見えてしまっていた（本人の実機報告と一致）。js/onlineInstantCoopBattleScreen.jsの
  // 「回答確定後は選択肢UIごと隠す」パターンに合わせ、検索欄・50音・選択肢一覧をまとめて
  // 隠す（代わりに.battleStatusMessageが「回答しました。他のプレイヤーを待っています…」を表示する）。
  if (myAnsweredThisQuestion) {
    elements.battleAnswerSearchRow.hidden = true;
    elements.battleAnswerJumpBar.hidden = true;
    clearElement(elements.battleAnswerChoicesContainer);
    return;
  }

  const pool = question.answerPool;
  // 【2026-08-31新設】30・50・全曲プールでは、検索欄＋スクロールする一覧に切り替える
  // （4択・10択は従来どおりのボタン一覧のまま。js/lyricsQuizEngine.jsの
  // LARGE_ANSWER_POOL_THRESHOLDは、既存の収録曲一覧・オフライン歌詞クイズと共通の基準）。
  const isLargePool = pool.length >= LARGE_ANSWER_POOL_THRESHOLD;
  const isAllPool = latestRoom.settings.answerPoolSizeValue === "all";
  elements.battleAnswerSearchRow.hidden = !isLargePool;
  elements.battleAnswerJumpBar.hidden = !isLargePool || !isAllPool;
  // 【2026-08-31新設】30・50プールは本人指示どおりコンパクトな2列一覧、全曲プールは
  // 50音ジャンプバーと組み合わせやすいフル幅の1列一覧にする（見た目のクラスを分ける）。
  elements.battleAnswerChoicesContainer.classList.toggle("online-lyrics-battle-answer-list", isLargePool && isAllPool);
  elements.battleAnswerChoicesContainer.classList.toggle("online-lyrics-battle-answer-list-compact", isLargePool && !isAllPool);
  if (isLargePool) {
    elements.battleAnswerCount.textContent = `${pool.length}曲`;
    if (isAllPool) renderAnswerJumpBar();
  }

  clearElement(elements.battleAnswerChoicesContainer);
  const correctSongId = question.song.id;
  const visiblePool = isLargePool ? filterAnswerPool(pool) : pool;
  visiblePool.forEach((choiceSong) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-lyrics-battle-answer-button";
    const isMyChoice = mySelectedSongId === choiceSong.id;
    const isCorrectChoice = choiceSong.id === correctSongId;
    if (isMyChoice) button.classList.add("is-selected");
    // 【2026-09-03改訂、本人指摘】色だけに頼らず、✓/✕と「あなたの回答」の文字でも
    // 区別できるようにした（正解確認カードとは別に、選択肢そのものにも印を付ける）。
    if (isResolved && isCorrectChoice) {
      button.classList.add("is-correct-answer");
      button.textContent = `✓ ${choiceSong.title}`;
    } else if (isResolved && isMyChoice) {
      button.classList.add("is-my-wrong-answer");
      button.textContent = `✕ ${choiceSong.title}（あなたの回答）`;
    } else {
      button.textContent = choiceSong.title;
    }
    button.disabled = isResolved || myAnsweredThisQuestion || submitInFlight;
    // 【2026-09-06新設、本人指示：実機フィードバック②】早押しバトルは回答速度そのものが
    // 勝敗に直結するモードのため確認を挟まない（即回答のまま）。正解数バトル・
    // ポイントバトルは手動ヒント方式で回答速度が順位に影響しないため、誤タップ対策として
    // 1回の確認を挟む。handleAnswerChoiceClick()自身のresolveAnswerSubmissionBlock()が
    // 二重回答・状態不整合を防ぐため、確認画面が開いている間に問題が確定していても安全。
    button.addEventListener("click", () => {
      // 回答選択肢タップ操作音（早押しは即回答、それ以外は確認モーダルを開くだけ。
      // モーダル内の確定・キャンセルはjs/answerConfirmPrompt.js側で既に対応済みのため
      // ここでは重ねない）。
      playSfx(SFX_EVENTS.UI_CLICK);
      if (latestRoom?.settings?.battleRuleId === "steal") {
        handleAnswerChoiceClick(choiceSong.id);
        return;
      }
      promptAnswerConfirm(choiceSong.title, () => handleAnswerChoiceClick(choiceSong.id));
    });
    elements.battleAnswerChoicesContainer.appendChild(button);
  });
}

// 回答受付が終わっている・送信中・既に回答済みのときに、押しても無反応に見えないよう
// 案内文を表示する（本人からの指摘・2026-08-06）。実際の送信失敗（elements.battleError内で
// 別途表示）とは違い、赤いエラーではなく控えめな案内として見せるため"is-notice"を付ける。
// 【2026-11-XX新設・本人指示：ポイントバトル等で発生する「権限エラー」の根本調査】
// elements.battleErrorは「送信できなかった案内（権限エラー等の失敗通知）」と
// 「奪い取りの勝敗結果（本人指示により残し続けたい成功/惜敗の案内）」の両方を兼用している。
// 実機で「ヒント4まで正しく表示され、正解者もいませんでしたと出ているのに、権限エラーの
// 案内だけがいつまでも残る」不具合が報告されたが、原因はFirebase側の権限・書き込み内容が
// 誤っているのではなく（回答受付終了ぎりぎりの送信がセキュリティルールに正しく拒否された、
// 想定どおりの競合）、この失敗通知を「次の問題に切り替わるまで」しか消していなかった
// 表示側の不具合だった。同じ問題の答え合わせ（isResolved）が始まった時点で、まだ失敗通知が
// 出ていれば自動的に消す（勝敗結果の案内は別フラグで区別し、消さない）。
let battleErrorIsFailureNotice = false;

function showAnswerSubmissionNotice(reason) {
  const message = describeAnswerSubmissionBlockMessage(reason);
  if (!message) return;
  elements.battleError.textContent = message;
  elements.battleError.hidden = false;
  elements.battleError.classList.add("is-notice");
  battleErrorIsFailureNotice = true;
}

function hideAnswerSubmissionNotice() {
  elements.battleError.hidden = true;
  elements.battleError.classList.remove("is-notice", "is-steal-success");
  battleErrorIsFailureNotice = false;
}

// 答え合わせ（isResolved）に切り替わった時点で、まだ「送信できなかった」失敗通知が
// 残っていれば消す（回答受付は既に終了しており、遅れて表示され続けても混乱を招くだけ
// のため）。勝敗結果の案内（is-steal-success等）はbattleErrorIsFailureNoticeがfalseの
// ままなので、この関数では消さない。
function clearStaleFailureNoticeOnResolve() {
  if (battleErrorIsFailureNotice) hideAnswerSubmissionNotice();
}

async function handleAnswerChoiceClick(selectedSongId) {
  const match = latestRoom?.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
  // 【2026-09-15追加・本人指示：前問／前試合の表示が一瞬混ざるバグの調査で発見】
  // このあとのawait（Firebaseへの回答送信）の間に、進行が次の問題へ進んだり
  // 「もう一度」で次の試合が始まったりすると、送信結果が返ってきた時点では
  // qIndex・currentMatchIdがもう「今表示している問題」ではなくなっている。
  // その状態でelements.battleErrorに書き込むと、次の問題／試合の画面に
  // 前問の送信結果メッセージが一瞬混ざって見えてしまう。送信開始時点の
  // matchIdを覚えておき、結果が返ってきた時点で今の状態と食い違っていないかを
  // 確認してから画面へ反映する。
  const submittedMatchId = currentMatchId;
  const block = resolveAnswerSubmissionBlock({
    hasRoom: !!latestRoom,
    submitInFlight,
    hasMatch: !!match,
    questionStatus: match?.questionStatus,
    alreadyAnsweredThisQuestion: typeof qIndex === "number" && mySubmittedForQuestionIndex === qIndex,
  });
  if (block.blocked) {
    showAnswerSubmissionNotice(block.reason);
    return;
  }

  mySelectedSongId = selectedSongId;
  submitInFlight = true;
  hideAnswerSubmissionNotice();
  renderCurrentQuestionState();

  // 【2026-08-31改訂、本人指示：ヒントを手動で開く方式への変更】以前は経過時間から
  // ヒント段階を自動計算していたが、新仕様では本人がボタンで開いた段階
  // （myOpenedHintLevel）をそのまま送る。早押しバトルはヒント段階が採点に一切影響しない
  // ため（js/battleRules/stealRule.js参照）、固定値1を送るだけでよい。
  const ruleId = latestRoom.settings.battleRuleId;
  const hintLevel = ruleId === "steal" ? 1 : myOpenedHintLevel;
  // 【2026-10-01新設・本人指示：回答時点のヒント位置から答え合わせ再生】採点用に
  // Firebaseへ送るhintLevel（早押しバトルは既存どおり固定値1）とは別に、答え合わせ楽曲の
  // 再生位置にだけ使う「実際に最後に見ていたヒント段階」をこの端末だけで記録する
  // （早押しバトルは時間経過で自動的に積み上がるためmyOpenedHintLevelでは追えず、
  // myCurrentStealHintLevelを使う。プレイヤーごとに再生位置が違ってよい仕様のため、
  // Firebaseへ送る必要はない）。
  myAnswerHintLevel = ruleId === "steal" ? myCurrentStealHintLevel : myOpenedHintLevel;
  const correctSongId = currentQuestions[qIndex].song.id;
  // 【Phase6.5・ruleId分岐の撤去】「回答ログだけでよいか、勝者claimも一緒に送るべきか」は
  // js/battleRules/各ルールが持つgetAnswerSubmissionPlan()にルール自身が決めさせる
  // （このファイルはbattleRuleId === "steal"のような文字列比較を一切行わない）。
  const submissionPlan = lyricsQuizBattleMode.getAnswerSubmissionPlan(latestRoom.settings, { selectedSongId, correctSongId });

  // 【Phase6.5・2段階送信】奪い取りのwinner claimは、submitLyricsQuizAnswerWithStealClaim()
  // 内部でanswer保存→claim送信の2段階を行う（claim側のセキュリティルールが、確定済みの
  // answerをroot経由で必ず参照できるようにするため。詳細は同関数のコメント参照）。
  const result = submissionPlan.submitWinnerClaim
    ? await submitLyricsQuizAnswerWithStealClaim({
        roomId: latestRoom.roomId,
        matchId: currentMatchId,
        questionIndex: qIndex,
        selectedSongId,
        hintLevel,
        attemptWinnerClaim: true,
      })
    : await submitLyricsQuizAnswer({
        roomId: latestRoom.roomId,
        matchId: currentMatchId,
        questionIndex: qIndex,
        selectedSongId,
        hintLevel,
      });

  submitInFlight = false;
  // 送信結果が返ってきた時点で、今表示している問題／試合と食い違っていないか確認する。
  const isStaleQuestion =
    submittedMatchId !== currentMatchId ||
    latestRoom?.matches?.[currentMatchId]?.currentQuestionIndex !== qIndex;
  if (result.ok) {
    mySubmittedForQuestionIndex = qIndex;
    // 【2026-10-01新設】待機メッセージの出し分け用（下のrenderCurrentQuestionState()参照）。
    // 不正解だった場合だけこの問題番号を記録し、それ以外（正解・惜敗）はクリアする。
    mySubmissionOutcomeForQuestionIndex = result.outcome === STEAL_CLAIM_OUTCOME.ANSWERED_WRONG ? qIndex : -1;
    // 奪い取り成功音（2026-08-09新設）は、Firebase側でwinner claimの書き込みが実際に
    // 成功した（＝サーバー側で自分が勝者だと確定した）STEAL_CLAIM_OUTCOME.WONの
    // ときだけ鳴らす。ローカルで選択した直後や、通信結果を待っている段階では鳴らさない。
    // ただし、その通知が届く前に次の問題／試合へ進んでいた場合は、今の画面に
    // 前問の効果音・メッセージを混ぜないよう鳴らさない・表示しない。
    if (result.outcome === STEAL_CLAIM_OUTCOME.WON && !isStaleQuestion) {
      playSfx(SFX_EVENTS.STEAL_SUCCESS);
    }
    // 【2026-10-01新設・本人指示：早押しで不正解だった本人にその場で分かるようにする】
    // 不正解SEを1回だけ鳴らす（7秒間の答え合わせ演出中に繰り返し鳴らす既存のSFX多重発火
    // 対策＝lastRevealSfxPlayedForQuestionIndexとは別軸で、ここは送信結果が返ってきた
    // 瞬間の1回きりの通知のため重複の心配はない）。
    if (result.outcome === STEAL_CLAIM_OUTCOME.ANSWERED_WRONG && !isStaleQuestion) {
      playSfx(SFX_EVENTS.QUIZ_WRONG);
    }
    const outcomeMessage = describeStealClaimOutcomeMessage(result.outcome);
    if (outcomeMessage && !isStaleQuestion) {
      // 【2026-09-08改訂・本人指示F：早押し成功表示の再デザイン】勝者確定時だけ、
      // 汎用の「お知らせ」グレー表示ではなく専用の華やかな見た目にする
      // （惜しくも負けた場合はこれまでどおり控えめなis-noticeのまま）。
      const isWin = result.outcome === STEAL_CLAIM_OUTCOME.WON;
      elements.battleError.classList.toggle("is-steal-success", isWin);
      elements.battleError.classList.toggle("is-notice", !isWin);
      elements.battleError.textContent = outcomeMessage;
      elements.battleError.hidden = false;
      // 勝敗結果の案内であり、失敗通知ではない（answered＝送信自体は成功しているため）。
      // clearStaleFailureNoticeOnResolve()が誤って消してしまわないようにする。
      battleErrorIsFailureNotice = false;
    }
  } else if (result.reason === "already-answered") {
    mySubmittedForQuestionIndex = qIndex;
  } else if (!isStaleQuestion) {
    const failureMessage = describeAnswerSubmissionFailureMessage(result.reason);
    elements.battleError.classList.toggle("is-notice", !!failureMessage);
    elements.battleError.textContent = failureMessage ?? "回答の送信に失敗しました。通信環境をご確認ください。";
    elements.battleError.hidden = false;
    // 【2026-11-XX新設】送信失敗の案内は、答え合わせが始まった時点でclearStaleFailureNoticeOnResolve()
    // が自動的に消す（回答受付終了後まで居座り続ける実機バグの修正）。
    battleErrorIsFailureNotice = true;
  }
  renderCurrentQuestionState();
}

// 【2026-09-06新設・本人指示：3分無操作の放置救済】ホストにだけ見える、3分間操作していない
// プレイヤーへの通知。まだ回答済み・強制スキップ済みでない参加者のうち、最後に活動報告した
// 時刻（無ければ問題開始時刻）からIDLE_RESCUE_THRESHOLD_MS以上経っている人を一覧表示する。
// 押しっぱなしの通知ではなく毎回の描画で現在の状態をそのまま反映するだけの単純な作りのため、
// 本人が操作を再開すれば自然に一覧から消え、再び止まればまた3分後に現れる
// （「同じ通知を何度も出さない」は、そもそも都度のポップアップではなく常時表示の一覧にする
// ことで、本人指示の趣旨を満たす設計にした）。
function renderIdleNotice(match, qIndex, nowServerTimeMs) {
  const isHost = latestRoom && getCurrentUid() === latestRoom.host;
  if (!isHost) {
    elements.idleNotice.hidden = true;
    return;
  }

  const participantUids = Object.keys(match.participants ?? {});
  const answeredUids = new Set(Object.keys(match.answers?.[qIndex] ?? {}));
  const forcedSkipUids = new Set(Object.keys(match.forcedSkips?.[qIndex] ?? {}));
  const idleUids = participantUids.filter((uid) => {
    if (answeredUids.has(uid) || forcedSkipUids.has(uid)) return false;
    const lastActivity = match.questionActivity?.[qIndex]?.[uid] ?? match.currentQuestionStartedAt ?? nowServerTimeMs;
    return nowServerTimeMs - lastActivity >= IDLE_RESCUE_THRESHOLD_MS;
  });

  clearElement(elements.idleNotice);
  elements.idleNotice.hidden = idleUids.length === 0;
  idleUids.forEach((uid) => {
    const displayName = match.participants?.[uid]?.displayName ?? uid;
    const row = document.createElement("div");
    row.className = "online-lyrics-battle-idle-notice-row";

    // 【2026-09-08新設・本人指示M：通信切断時の仕様】3分間操作が無い原因が「単に考え込んで
    // いる」のか「実際に通信が切れている」のかで、ホストが取るべき対応の緊急度が変わる。
    // 既存の接続監視（rooms/{roomId}/players/{uid}/connected、js/onlineBattle.js）を
    // そのまま参照し、実際に切断中と分かる場合だけ文言を変える（新しい監視の仕組みは追加しない）。
    const isActuallyDisconnected = latestRoom?.players?.[uid]?.connected === false;
    const text = document.createElement("span");
    text.className = "online-lyrics-battle-idle-notice-text";
    text.textContent = isActuallyDisconnected
      ? `${displayName}さんとの接続が切れているようです（3分以上復帰していません）`
      : `${displayName}さんが3分間操作していません`;
    row.appendChild(text);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button online-lyrics-battle-idle-notice-button";
    button.textContent = "わからない扱いにする";
    button.addEventListener("click", () => {
      // 3分無操作の参加者を「わからない」扱いにする操作音
      playSfx(SFX_EVENTS.UI_CLICK);
      button.disabled = true;
      forceSkipIdlePlayer({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: qIndex, targetUid: uid });
    });
    row.appendChild(button);

    elements.idleNotice.appendChild(row);
  });
}

// 【2026-09-01新設・本人指示：ライブスコアボード】他プレイヤーの累計スコアを、問題画面上部の
// 折りたたみ可能な一覧として表示する。<details>要素自体はindex.html側に静的に配置してあり、
// このJSは中身（一覧の行・見出しの補足）だけを差し替える。<details>をclearElement()等で
// 作り直さないのは、要素を作り直すと開閉状態（open属性）が失われるため（本人がスコアボードを
// 開いたまま次の問題へ進んでも、開いた状態を保てるようにするため）。
//
// 【最重要の情報漏洩防止】この関数が参照するのはmatch.scoreSnapshotだけ（ホストがreveal
// 完了時にまとめて書き込む、1つ前の問題までの確定スコア）。今の問題のanswers・
// questionClaims等、まだ確定していないデータには一切触れない。
//
// 【2026-10-01改訂・本人指示：歌詞クイズ問題画面モバイルレイアウト再設計5章】以前は
// 早押しバトルだけ「途中経過を見せると不公平になる」という理由で出題中（questionStatus:
// "active"）は隠していたが、この関数が参照するscoreSnapshotは「1つ前の問題までの確定値」
// でしかなく、今の問題の途中経過を一切含まない（上のコメント参照）。表示するデータの
// 安全性は変わらないため、3ルールすべて常時表示に統一した。
function renderScoreboard(match, { ruleId }) {
  const container = elements.battleScoreboard;
  if (!container) return; // この要素が無い画面構成では何もしない（安全側）
  container.hidden = false;

  const scoreboard = describeScoreboard({
    ruleId,
    scoreSnapshot: match.scoreSnapshot,
    participantsByUid: match.participants ?? {},
    myUid: getCurrentUid(),
  });

  if (elements.battleScoreboardSummaryHint) {
    elements.battleScoreboardSummaryHint.textContent = scoreboard.hasData
      ? `（${scoreboard.questionsScoredCount}問終了時点）`
      : "（まだ結果が確定していません）";
  }

  // 【2026-10-01新設】横スクロールする一覧を見なくても自分の順位/得点が分かる固定表示。
  if (elements.battleMyRank) {
    const myRow = scoreboard.rows.find((row) => row.isMe);
    elements.battleMyRank.textContent = myRow ? `あなた：${myRow.rank}位 / ${myRow.value}${scoreboard.valueUnit}` : "";
  }

  if (!elements.battleScoreboardList) return;
  clearElement(elements.battleScoreboardList);
  scoreboard.rows.forEach((row) => {
    const item = document.createElement("li");
    item.className = "online-lyrics-battle-scoreboard-item";
    if (row.isMe) item.classList.add("is-me");

    const rankSpan = document.createElement("span");
    rankSpan.className = "online-lyrics-battle-scoreboard-rank";
    rankSpan.textContent = `${row.rank}`;
    item.appendChild(rankSpan);

    item.appendChild(buildParticipantIcon(row.oshiMemberId, row.uid));

    // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド3章】以前は問題確定後
    // （isResolved）だけ名前をタップ可能にしてプロフィールを開けたが、「プロフィールはロビー
    // でだけ開けるようにしてほしい」との指示により、対戦中の画面からは一切開けなくする。
    // クリック可能に見えるボタン装飾（online-lyrics-battle-scoreboard-name-button）も付けない。
    const nameSpan = document.createElement("span");
    nameSpan.className = "online-lyrics-battle-scoreboard-name";
    nameSpan.textContent = row.isMe ? `${row.displayName}（あなた）` : row.displayName;
    item.appendChild(nameSpan);

    const valueSpan = document.createElement("span");
    valueSpan.className = "online-lyrics-battle-scoreboard-value";
    valueSpan.textContent = `${row.value}${scoreboard.valueUnit}`;
    item.appendChild(valueSpan);

    elements.battleScoreboardList.appendChild(item);
  });
}

function renderCurrentQuestionState() {
  if (!latestRoom || !runtimeReady || currentQuestions.length === 0) return;
  const match = latestRoom.matches?.[currentMatchId];
  if (!match || typeof match.currentQuestionIndex !== "number") return;

  const qIndex = match.currentQuestionIndex;
  const question = currentQuestions[qIndex];
  if (!question) return;

  if (qIndex !== lastRenderedQuestionIndex) {
    lastRenderedQuestionIndex = qIndex;
    mySubmittedForQuestionIndex = -1;
    mySubmissionOutcomeForQuestionIndex = -1;
    mySelectedSongId = null;
    hideAnswerSubmissionNotice();
    // 【2026-09-07新設・本人指示：前問の答え合わせが一瞬見えるバグ対策】この下の
    // isResolved再計算（elements.battleAnswerReveal.hidden = !isResolved）は、この関数の
    // 後半でしか行われない。関数の実行が万一そこへ到達する前に中断される場合に備え、
    // 新しい問題を検知した瞬間にも前問の答え合わせカードを同期的に隠しておく（保険）。
    elements.battleAnswerReveal.hidden = true;
    // 【2026-09-26追加・本人指示：サウンドシステム全面整備8章】新しい問題に切り替わったら、
    // 前問の答え合わせ楽曲が鳴り続けないよう必ず止める（通常はREVEAL_DELAY_MS経過後の
    // 自動停止で既に止まっているはずだが、保険として毎回呼ぶ。stopAudio()は何も再生して
    // いなくても安全に呼べる）。
    stopRevealMusic();
    // 【2026-08-31新設】新しい問題に移ったら、開いたヒント段階・検索状態をリセットする。
    myOpenedHintLevel = 1;
    myCurrentStealHintLevel = 1;
    myAnswerHintLevel = 1;
    myAnswerSearchQuery = "";
    myAnswerJumpRowKey = null;
    if (elements.battleAnswerSearchInput) elements.battleAnswerSearchInput.value = "";
    // 【2026-09-06新設・本人指示：実機フィードバック第3弾⑥】検索文字列・50音ジャンプは
    // 既にリセットしていたが、選択肢一覧のスクロール位置は問題が変わっても前の問題の
    // ままだった（実機で発覚）。新しい問題では常に一覧の先頭が見えるようにする。
    if (elements.battleAnswerChoicesContainer) elements.battleAnswerChoicesContainer.scrollTop = 0;
  }
  if (typeof match.currentQuestionStartedAt === "number" && !(qIndex in myQuestionStartedAtCache)) {
    myQuestionStartedAtCache[qIndex] = match.currentQuestionStartedAt;
  }

  // 【2026-09-06新設・3分無操作の放置救済】ホストにより「わからない」扱いにされた場合、
  // 自分の端末では本人がボタンを押した場合と同じ状態（回答済み・SKIP選択）にする。
  const myUid = getCurrentUid();
  const myForcedSkip = match.forcedSkips?.[qIndex]?.[myUid] === true;
  if (myForcedSkip && mySubmittedForQuestionIndex !== qIndex) {
    mySubmittedForQuestionIndex = qIndex;
    mySelectedSongId = SKIP_SELECTION;
  }

  elements.battleProgress.textContent = `第${qIndex + 1}問 / 全${currentQuestions.length}問`;
  // 【2026-11-XX新設・本人指示：優先度2】今どのルール（正解数/早押し/ポイントバトル）で
  // 遊んでいるか一目で分かるバッジ。ルールは試合中に変わらないため軽量な更新で十分。
  if (elements.battleRuleBadge) {
    elements.battleRuleBadge.textContent = getBattleRuleLabel(latestRoom.settings.battleRuleId);
  }

  const isResolved = match.questionStatus === "resolved";
  if (isResolved) clearStaleFailureNoticeOnResolve();
  const ruleId = latestRoom.settings.battleRuleId;
  const myAnsweredThisQuestion = mySubmittedForQuestionIndex === qIndex;
  const nowServerTimeMs = Date.now() + serverTimeOffset;
  const elapsedMs = computeElapsedMs({ questionStartedAt: match.currentQuestionStartedAt, nowServerTimeMs });

  renderHintArea(question, { ruleId, elapsedMs, isResolved, myAnsweredThisQuestion, questionIndex: qIndex });
  renderAnswerChoices(question, {
    isResolved,
    myAnsweredThisQuestion,
    questionIndex: qIndex,
    resolvedAt: typeof match.resolvedAt === "number" ? match.resolvedAt : null,
  });
  renderIdleNotice(match, qIndex, nowServerTimeMs);

  maybeRecordMyOutcomeForResolvedQuestions(match);
  // 【2026-09-26改訂・本人指示：オンライン対戦総合改修19-6章】以前は「📊 みんなのスコア」
  // とは別に、自分の得点だけを表示する大きなカード（現在のポイント）を常に表示しており、
  // 縦スペースを大きく使って回答候補が下へ押し出されていた。しかも早押しバトル以外では
  // スコアボードにも自分の行（is-me）が既に表示されており、情報が完全に重複していた。
  // スコアボードが見えている間はこのHUDを出さず、スコアボード自体が意図的に隠れている
  // 早押しバトルの回答収集中（本人指示：他人の途中経過を見せると不公平になるため）だけ、
  // 唯一自分の得点を確認する手段としてHUDを表示する（役割自体は削除しない）。
  const isScoreboardVisible = ruleId !== "steal" || isResolved;
  if (elements.battleHudContainer) {
    elements.battleHudContainer.hidden = isScoreboardVisible;
    if (!isScoreboardVisible) {
      const hudItems = describeHudItems(latestRoom.settings.battleRuleId, computeMyLiveHudStats());
      renderHud(elements.battleHudContainer, hudItems);
    }
  }
  renderScoreboard(match, { ruleId, isResolved });

  // 【2026-08-31改訂、本人指示：歌詞クイズ3ルール全面改修】「先に回答したプレイヤーだけに
  // 正解を先に表示しない」ため、自分が回答済みでもまだ全員が揃っていない間は
  // 「回答しました！他のプレイヤーの回答を待っています」の待機表示にとどめ、正解確認カードは
  // 全員の回答が揃って問題が確定するまで出さない（js/battleRules/各ルールのshouldEndQuestion()
  // が「全員回答済み」を確定条件にしているため、確定＝isResolvedの時点で必ず全員分揃っている）。
  elements.battleStatusMessage.hidden = !(myAnsweredThisQuestion && !isResolved);
  if (myAnsweredThisQuestion && !isResolved) {
    // 【2026-09-06新設・本人指示】ホストにより強制的に「わからない」扱いにされた場合は、
    // 何が起きたか本人にも分かるよう、通常の待機メッセージとは別の文言を出す
    // （本人指示：「突然問題が終わって理由が分からない状態にはしないでください」）。
    // 【2026-10-01追加・本人指示：早押しで不正解だった場合】「回答しました」だけだと
    // 本人も間違えたのか分かりづらいため、待機メッセージ自体にも「残念、不正解」を含める
    // （即時の案内＝elements.battleErrorは一定時間で消えるが、こちらは正誤確定まで
    // 表示され続けるため、遅れて画面を見た場合でも分かるようにする）。
    const wasWrong = mySubmissionOutcomeForQuestionIndex === qIndex;
    elements.battleStatusMessage.textContent = myForcedSkip
      ? "ホストにより、この問題は「わからない」扱いになりました。他のプレイヤーの回答を待っています…"
      : wasWrong
        ? "残念、不正解。他のプレイヤーの回答を待っています…"
        : "回答しました！他のプレイヤーの回答を待っています…";
  }

  // 【2026-08-31改訂、本人指示：歌詞クイズ3ルール全面改修】対戦中は他プレイヤーとの
  // 順位・ポイント比較を一切見せない方針のため、途中順位表示（現在の順位：N位／M人中）は
  // 撤去した（最終結果画面まで順位を伏せる。以前の実装はcomputeCurrentStandings()参照、
  // 本人指示によりこの画面からの呼び出しを取りやめた）。
  elements.battleAnswerReveal.hidden = !isResolved;
  if (isResolved) {
    const myOutcome = myOutcomeHistory[qIndex] ?? null;
    const gotPoints = (myOutcome?.pointsAwarded ?? 0) > 0;
    // 【2026-09-26追加・本人指示：サウンドシステム全面整備7章】正解数バトル・ポイントバトルは
    // 毎問の正解/不正解が完全に無音だった（本人指示の監査で発覚）。他モードと同じ
    // QUIZ_CORRECT/QUIZ_WRONGで統一する。早押しバトルは「勝者だけSTEAL_SUCCESSが鳴る」
    // という既存の専用設計（js/onlineLyricsQuizBattleScreen.js内の別箇所）をそのまま活かし、
    // ここでは対象外にする（早押しでは「非勝者＝不正解」ではないため、統一するとかえって
    // 誤解を招く）。
    // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第2ラウンド11章】この
    // if(isResolved)ブロックはtickのたびに毎回実行されるため、同じ問題には1回だけ鳴らす
    // ガードを追加した（7秒の答え表示中に答え合わせ楽曲へ重ねて何度も鳴っていた不具合）。
    if (ruleId !== "steal" && lastRevealSfxPlayedForQuestionIndex !== qIndex) {
      lastRevealSfxPlayedForQuestionIndex = qIndex;
      playSfx(gotPoints ? SFX_EVENTS.QUIZ_CORRECT : SFX_EVENTS.QUIZ_WRONG);
    }
    elements.battleAnswerRevealTitle.textContent = question.song.title;

    // 【2026-09-06新設・本人指示：実機フィードバック第3弾①】選択肢一覧が答え合わせカードに
    // 差し替わる仕様に合わせ、選択肢側の「✓/✕」マーク（renderAnswerChoices参照）に頼らずとも
    // このカード単体で「自分が何を選んだか」が分かるよう、「あなたの回答」欄を追加した。
    // 早押しバトルは勝者確定と同時に問題が終わるため、非勝者はそもそも回答していないことが
    // あり得る（js/battleRules/stealRule.jsのshouldEndQuestion()参照）。誤解を招く表示を
    // 避けるため、この欄は正解数バトル・ポイントバトルに限定する。
    const myAnswerSong =
      ruleId !== "steal" && mySelectedSongId && mySelectedSongId !== SKIP_SELECTION
        ? question.answerPool.find((song) => song.id === mySelectedSongId) ?? null
        : null;
    if (elements.battleAnswerRevealMyAnswer) {
      elements.battleAnswerRevealMyAnswer.hidden = !myAnswerSong;
      elements.battleAnswerRevealMyAnswer.textContent = myAnswerSong ? `あなたの回答：${myAnswerSong.title}` : "";
    }

    const metaParts = [];
    if (ruleId === "steal") {
      // 【2026-09-06改訂、本人指示：早押しバトルの表示を仕様どおりに再確認】
      // 「勝者本人は『正解！』、他プレイヤーは『○○さんが正解！』」という指示を厳密に
      // 満たすため、非勝者には「✕ 不正解」を出さず（不正解だった人・答える間もなかった人を
      // 一緒くたに「不正解」と表示すると、早押しでは意味が薄れるため）、勝者名（または
      // 誰も正解しなかった場合の案内）だけをstatusとして見せる。勝者の正当性は
      // winnerNameByQuestionIndexが検算済みの値のみ持つ（詳しくは
      // maybeRecordMyOutcomeForResolvedQuestions()参照）。
      const winnerName = winnerNameByQuestionIndex[qIndex];
      elements.battleAnswerRevealStatus.textContent = gotPoints
        ? "🎉 正解！"
        : winnerName
          ? `${winnerName}さんが正解！`
          : "正解者はいませんでした";
      if (gotPoints) metaParts.push(`+${myOutcome.pointsAwarded}pt`);
    } else {
      // 【2026-09-06改訂、本人指示：実機フィードバック第3弾①】以前は「わからない」選択も
      // 時間切れ未回答も一律「✕ 不正解」に統一していたが、本人が自分の意思で選んだ
      // 「わからない」は不正解と区別して伝えたほうが分かりやすいとの指示により、
      // 「今回はわからない」という専用の文言に変更した。獲得ポイントは、正解時は
      // 実際の獲得値、それ以外は明示的に「0pt」と表示する（ポイントバトルの配点が
      // ヒント段階で変わることを、0の場合も含めて毎回はっきり伝えるため）。
      const isSkip = mySelectedSongId === SKIP_SELECTION;
      elements.battleAnswerRevealStatus.textContent = gotPoints ? "🎉 正解！" : isSkip ? "今回はわからない" : "残念、不正解";
      metaParts.push(`獲得：${gotPoints ? `+${myOutcome.pointsAwarded}pt` : "0pt"}`);
    }
    elements.battleAnswerRevealStatus.classList.toggle("is-correct-answer-reveal-status", gotPoints);
    elements.battleAnswerRevealMeta.textContent = metaParts.join("・");
  }
}

// ===== 結果画面 =====

// 【2026-09-15新設・本人指示：ゲスト結果画面の再監査（ホスト移譲との関係）】以前は
// enterLyricsQuizResult()内でしかisHostOnResultScreenを計算しておらず、結果画面を
// 表示している最中にホスト自動移譲（8秒切断ルール）が起きても、ボタンの出し分けが
// 遷移した瞬間のまま固まっていた。room更新のたびに呼べる軽量な同期専用関数として
// 切り出し、js/onlineBattleScreen.js側から結果画面表示中は毎回呼んでもらう
// （answerReveal等の重い再構築・効果音の再生は行わない、ボタンの出し分けだけ）。
export function syncLyricsResultHostGuestButtons(room) {
  if (document.body.dataset.screen !== "onlineLyricsBattleResult") return;
  const isHostOnResultScreen = room.host === getCurrentUid();
  // 【2026-11-XX修正・本人指示：再戦フロー再々監査で発見した重大バグ】
  // js/onlineBattleScreen.jsのsyncResultScreenHostGuestButtons()と同じ修正・同じ理由。
  // confirmingRematch中も最初の「同じ条件でもう一度」ボタンが残り続け、下のインライン
  // パネルの「再戦を取り消す」と二重に表示されていた。
  const isConfirmingRematch = room.confirmingRematch === true;
  elements.resultHostActions.hidden = !isHostOnResultScreen || isConfirmingRematch;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
}

// 【2026-10-01新設・本人指示：結果画面/再戦フロー全面設計】全員準備OK後、2秒待ってから
// 実際に再戦を開始する処理。js/onlineBattleScreen.jsのdriveRematchReadyAutoStart()と
// 全く同じ考え方だが、タイマー変数（lyricsRematchAutoStartTimerId）はこのファイル専用。
let lyricsRematchAutoStartTimerId = null;
const REMATCH_AUTO_START_DELAY_MS = 2000;
function driveLyricsRematchReadyAutoStart(room) {
  const myUid = getCurrentUid();
  const isHost = room.host === myUid;
  const players = room.players || {};
  const allReady = computeAllPlayersRematchReady(players);

  if (isHost && allReady && lyricsRematchAutoStartTimerId === null) {
    const roomId = room.roomId;
    lyricsRematchAutoStartTimerId = setTimeout(async () => {
      lyricsRematchAutoStartTimerId = null;
      const latest = latestRoom;
      if (!latest || latest.roomId !== roomId || latest.confirmingRematch !== true) return;
      if (!computeAllPlayersRematchReady(latest.players)) return;
      attemptSilentUnlock();
      await finishRematchReadyCheck({ roomId });
    }, REMATCH_AUTO_START_DELAY_MS);
  } else if (!allReady && lyricsRematchAutoStartTimerId !== null) {
    clearTimeout(lyricsRematchAutoStartTimerId);
    lyricsRematchAutoStartTimerId = null;
  }
}

const handleLyricsRematchKickClick = createRematchKickHandler({
  getRoomId: () => latestRoom?.roomId ?? null,
  kickPlayerFn: kickPlayer,
  playConfirmSfx: () => playSfx(SFX_EVENTS.UI_CONFIRM),
});

// 【2026-09-30新設→2026-10-01全面改訂・本人指示：結果画面/再戦フロー全面設計】
// js/onlineBattleScreen.jsのrenderResultReturnPanel()と全く同じ考え方。「結果確認の状況」
// 一覧・再戦準備のインラインパネルを、room更新のたびに軽量に再描画する。
function renderLyricsResultReturnPanel(room) {
  const match = room.matches?.[room.activeMatchId] ?? {};
  const participants = match.participants || {};
  const players = room.players || {};
  const myUid = getCurrentUid();
  const isHostOnResultScreen = room.host === myUid;

  renderResultReturnStatusList(elements.resultReturnStatusList, participants, players, myUid);

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
    renderRematchReadinessList(elements.resultRematchPlayerList, players, myUid, isHostOnResultScreen);
    const allReady = computeAllPlayersRematchReady(players);
    const myReady = players[myUid]?.rematchReady === true;
    // 【2026-11-XX修正・実機バグ調査：再戦フロー】js/onlineBattleScreen.jsの通常モードでは
    // 既に対応済みだったホスト分岐が、このファイルには移植されておらず欠落していた。
    // resolveRematchToggleButtonLabel()（js/onlineBattleMatchConfirmationPayloads.js）へ
    // 共通化し、4画面が再び食い違うことを構造的に防ぐ。
    if (elements.resultRematchToggleButton) {
      const label = resolveRematchToggleButtonLabel({ isHost: isHostOnResultScreen, myReady });
      elements.resultRematchToggleButton.textContent = label.text;
      elements.resultRematchToggleButton.classList.toggle("is-confirmed", label.isConfirmed);
    }
    if (elements.resultRematchAllDoneNotice) {
      elements.resultRematchAllDoneNotice.hidden = !allReady;
    }
    driveLyricsRematchReadyAutoStart(room);
  }
}

// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】結果画面を見ている間、
// room更新のたびに「結果確認の状況」一覧・「もう一度」提案の案内を再同期する
// （js/onlineBattleScreen.jsのsyncResultScreenHostGuestButtons()と同じ考え方）。
function syncLyricsResultReturnPanel(room) {
  if (document.body.dataset.screen !== "onlineLyricsBattleResult") return;
  renderLyricsResultReturnPanel(room);
}

export function enterLyricsQuizResult(room) {
  latestRoom = room;
  stopAllLocalTimers();
  // 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】新しい結果画面に
  // 入るたび、「もう一度」「ルーム設定に戻る」への自分自身の意思表示をまだしていない状態
  // から始める。
  resetResultScreenResponded();
  elements.navigateTo("onlineLyricsBattleResult");

  const match = room.matches?.[room.activeMatchId] ?? {};
  const participants = match.participants || {};
  // 【Phase7訂正】既存gameMode（timeAttack等）のmatches/{matchId}/resultsは「本人が自分の
  // 結果だけを書く」前提のルールのため、ホストが全員分をまとめて書く歌詞クイズとは
  // 書き込み主体が異なる。既存ルールに触れないよう、専用のlyricsResultsパスを使う。
  const results = match.lyricsResults || {};
  const myUid = getCurrentUid();

  // 【2026-09-30改訂・本人指示：オンライン対戦総合改修 第3ラウンド】試合後の選択肢
  // 「もう一度」はホスト専用。非ホストには代わりに「⌂ホームへ戻る」だけを見せる。
  const isHostOnResultScreen = room.host === myUid;
  // 【2026-11-XX修正】js/onlineBattleScreen.jsのgoToResultScreen()と同じ理由の保険。
  elements.resultHostActions.hidden = !isHostOnResultScreen || room.confirmingRematch === true;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  // 【2026-09-07新設・本人指示：ゲスト結果画面】ホスト専用ボタンの代わりに
  // 「ルームから退出」を見せる（js/onlineBattleScreen.jsの同じ変更と揃えている）。
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
  // 【2026-09-30新設】「結果確認の状況」一覧・「もう一度」提案への案内は、ホスト・ゲスト
  // 共通で毎回再描画する。
  renderLyricsResultReturnPanel(room);
  elements.resultRuleNote.textContent = lyricsQuizBattleMode.getRuleDescription(room.settings);

  // 【2026-09-14追加・本人指示：対戦中のゲストが自分だけ途中離脱する】leftDuringMatchが
  // 立っている参加者は、途中まで得点していても正式な順位には含めない（js/onlineBattleScreen.js
  // のgoToResultScreen()と同じ考え方）。既存のDNF扱いにそのまま合流させる。
  const rankedEntries = Object.entries(participants).map(([uid, participant]) => ({
    uid,
    displayName: participant.displayName,
    isHost: participant.isHost === true,
    isYou: uid === myUid,
    isDnf: !results[uid] || participant.leftDuringMatch === true,
    oshiColor: resolveOshiColor(participant.oshiMemberId),
    result: results[uid] && participant.leftDuringMatch !== true ? { detail: results[uid].detail } : null,
  }));

  rankedEntries.sort((entryA, entryB) => {
    if (entryA.isDnf !== entryB.isDnf) return entryA.isDnf ? 1 : -1;
    if (entryA.isDnf) return 0;
    return lyricsQuizBattleMode.compareResults(results[entryA.uid], results[entryB.uid], room.settings);
  });

  const table = describeResultTable(room.settings.battleRuleId, rankedEntries);
  renderResultCards(elements.resultTableContainer, table);

  // 対戦の勝敗音（2026-08-10新設）。DNF（自分の結果が確定していない）のときは鳴らさない。
  const myRankedIndex = rankedEntries.findIndex((entry) => entry.isYou);
  if (myRankedIndex !== -1 && !rankedEntries[myRankedIndex].isDnf) {
    playSfx(myRankedIndex === 0 ? SFX_EVENTS.BATTLE_WIN : SFX_EVENTS.BATTLE_LOSE);
  }

  // 【2026-09-12新設・本人指示：結果画面の問題別結果アコーディオンを完成させる】
  // 歌詞クイズ対戦は音源を一切再生しないため、音源再生失敗による無効化の概念が無く、
  // 全問がそのまま問題別結果になる。得点計算（ルールごとのポイント計算）には一切触れず、
  // 「選んだ曲」と「実際の正解曲」を突き合わせるだけで正誤を出す
  // （js/battleQuestionBreakdown.jsのbuildLyricsQuizQuestionBreakdown参照）。
  const questionBreakdown = buildLyricsQuizQuestionBreakdown({
    questions: currentQuestions,
    answers: match.answers,
    questionClaims: match.questionClaims,
    participants,
    myUid,
  });
  if (elements.resultQuestionBreakdownSection) {
    elements.resultQuestionBreakdownSection.hidden = questionBreakdown.length === 0;
  }
  renderQuestionBreakdownAccordion(elements.resultQuestionBreakdown, questionBreakdown);

  saveLyricsQuizBattleHistoryEntry(room, rankedEntries, questionBreakdown);
}

// 【2026-08-08新設】オンライン歌詞クイズ対戦の結果を、統一プレイ履歴（js/playHistory.js）へ保存する。
// idをonline:{matchId}にすることで、リロード・再接続・画面再描画で何度この結果画面へ到達しても
// 同じ試合が重複保存されない（本人指示）。ルール（クラシック／奪い取り／コンボ）は必ず記録する。
function saveLyricsQuizBattleHistoryEntry(room, rankedEntries, questionBreakdown = []) {
  const matchId = room.activeMatchId;
  if (!matchId) return;

  const myIndex = rankedEntries.findIndex((entry) => entry.isYou);
  const myEntry = rankedEntries[myIndex];
  if (!myEntry) return;
  const isDnf = myEntry.isDnf;
  const myDetail = myEntry.result?.detail ?? null;

  const isAllSongsMode =
    !room.settings.questionSource || room.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS;

  savePlayHistoryEntryIfNew({
    id: `online:${matchId}`,
    playedAt: Date.now(),
    modeId: "onlineLyricsQuiz",
    modeLabel: "オンライン対戦（歌詞）",
    questionCount:
      room.settings.questionCountValue === "all" ? null : Number(room.settings.questionCountValue) || null,
    isAllSongsMode,
    correctCount: isDnf ? null : (myDetail?.correctCount ?? null),
    wrongCount: isDnf ? null : (myDetail?.missCount ?? null),
    skippedCount: isDnf ? null : (myDetail?.skippedCount ?? null),
    score: isDnf ? null : (myDetail?.totalPoints ?? null),
    averageResponseMs: null,
    completed: !isDnf,
    details: {
      battleRuleId: room.settings.battleRuleId,
      myRank: isDnf ? null : myIndex + 1,
      isDnf,
      myDetail,
      participantCount: rankedEntries.length,
      standings: rankedEntries.map((entry, index) => ({
        displayName: entry.displayName,
        rank: entry.isDnf ? null : index + 1,
        isDnf: entry.isDnf,
        isYou: entry.isYou,
        detail: entry.result?.detail ?? null,
      })),
      // 結果画面と同じデータをそのまま保存し、履歴詳細でも同じ描画関数を使えるようにする
      // （js/onlineBattleScreen.jsのsaveOnlineBattleHistoryEntry()と同じ設計）。
      questionBreakdown: capQuestionBreakdownForStorage(questionBreakdown),
    },
  });
}

// 【2026-09-15新設・本人指示：プレイ履歴へ「途中退出」を保存する】途中離脱ボタンが
// 確定した瞬間（resetLyricsQuizBattleState()でmyOutcomeHistory等が消える前）に呼ぶ。
// myOutcomeHistoryはまだ何問も無い（0問の場合すらある）配列だが、
// lyricsQuizBattleMode.createResult()は「何問あるか」を前提にしない集計関数のため、
// そのまま渡せば完走時と全く同じ計算式で「ここまでの成績」が得られる
// （js/battleRules/各ルールのaggregateResult()参照）。
function saveVoluntaryLeaveLyricsHistoryEntry() {
  if (!currentMatchId || !latestRoom) return;
  const result = lyricsQuizBattleMode.createResult(myOutcomeHistory, latestRoom.settings);
  const isAllSongsMode =
    !latestRoom.settings.questionSource || latestRoom.settings.questionSource.type === QUESTION_SOURCE_TYPE.ALL_SONGS;

  savePlayHistoryEntryIfNew({
    id: `online:${currentMatchId}`,
    playedAt: Date.now(),
    modeId: "onlineLyricsQuiz",
    modeLabel: "オンライン対戦（歌詞）",
    questionCount:
      latestRoom.settings.questionCountValue === "all" ? null : Number(latestRoom.settings.questionCountValue) || null,
    isAllSongsMode,
    correctCount: result.common.correctCount,
    wrongCount: result.common.missCount,
    skippedCount: result.detail?.skippedCount ?? null,
    score: result.detail?.totalPoints ?? null,
    averageResponseMs: null,
    completed: false,
    details: {
      battleRuleId: latestRoom.settings.battleRuleId,
      isVoluntaryLeave: true,
      isDnf: false,
      myRank: null,
      myDetail: result.detail,
      participantCount: Object.keys(latestRoom.players ?? {}).length,
    },
  });
}
