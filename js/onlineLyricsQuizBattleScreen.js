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
  returnRoomToLobby,
  beginRematchReadyCheck,
} from "./onlineBattle.js";
import { promptReturnToLobby } from "./onlineBattleLobbyReturnPrompt.js";
import { promptLeaveMatch } from "./onlineBattleLeaveMatchPrompt.js";
import { promptResultLeaveRoom } from "./onlineBattleResultLeavePrompt.js";
import { promptAnswerConfirm } from "./answerConfirmPrompt.js";
import { validateRoomSettings, getAvailabilityKind, resolveAllEligibleSongIdsForMode } from "./battleModes/index.js";
import * as lyricsQuizBattleMode from "./battleModes/lyricsQuizBattleMode.js";
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
import { savePlayHistoryEntryIfNew } from "./playHistory.js";
import { buildLyricsQuizQuestionBreakdown, capQuestionBreakdownForStorage } from "./battleQuestionBreakdown.js";
import { renderQuestionBreakdownAccordion } from "./battleQuestionBreakdownUi.js";
import { SONGS } from "./data/songs.js";
import { MEMBERS } from "./data/members.js";
import { renderCollaborativeSelectionBreakdown, wireCollaborativeSelectionDetailsToggle, resetCollaborativeSelectionDetailsPanel } from "./onlineBattleCollaborativeSelectionUi.js";
import { getMemberById } from "./memberUtils.js";
import { QUESTION_COUNT_LABELS, CATEGORY_LABELS } from "./localBattleScreen.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { STEAL_CLAIM_OUTCOME } from "./lyricsQuizBattleFirebasePayloads.js";

// ホストが問題の確定（正解発表）を見せてから、次の問題／最終結果へ進むまでの待ち時間。
// 【2026-09-03改訂→2026-09-06再改訂、本人指示】一度「4秒固定」に変更していたが、
// 歌詞クイズ3ルール全面改修時の指示「結果表示→約3秒→次の問題」を正として3000へ戻した。
// 【2026-09-07改訂・本人指示：答え合わせ表示を4秒へ統一】以前は3秒だったが、答え合わせカードに
// 「あなたの回答」「獲得pt」等の読む情報が増えたため、対象モード共通で4秒へ揃えた。
const REVEAL_DELAY_MS = 4000;
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
let mySubmittedForQuestionIndex = -1;
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
      applyLyricsQuizSettingsChange(latestRoom, { ...latestRoom.settings, questionCountValue: radio.value });
    });
  });

  // 【2026-08-27変更】js/onlineBattleScreen.jsと全く同じ理由で、「曲を選んで出題」は
  // 0曲でも共同選曲(collaborativeSelection)として安全に保存できるようにしてある
  // （js/battleModes/lyricsQuizBattleMode.js参照）ため、以前のような「曲選択画面を
  // 先に開く」特別扱いは不要になった。
  document.querySelectorAll('input[name="online-lyrics-battle-settings-song-source"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!latestRoom || latestRoom.gameMode !== lyricsQuizBattleMode.gameMode) return;
      if (radio.value === "manual") {
        applyLyricsQuizSettingsChange(latestRoom, {
          ...latestRoom.settings,
          questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: getMergedRestrictedLyricsSongIds() },
        });
        return;
      }
      applyLyricsQuizSettingsChange(latestRoom, {
        ...latestRoom.settings,
        questionSource: { type: QUESTION_SOURCE_TYPE.ALL_SONGS },
      });
    });
  });

  // 【2026-09-16新設・本人指示：他モードとの機能差解消】カテゴリ設定。
  // js/onlineBattleScreen.jsの同名ハンドラ（online-battle-settings-category等）と
  // 全く同じ考え方。categoryFilterValueだけを差し替え、questionSource（共同選曲の
  // 選択状態）はそのまま保持する（カテゴリで対象外になった選択曲を消してはいけない、
  // 既存の重要な仕様）。
  document.querySelectorAll('input[name="online-lyrics-battle-settings-category"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (!latestRoom || latestRoom.gameMode !== lyricsQuizBattleMode.gameMode) return;
      applyLyricsQuizSettingsChange(latestRoom, { ...latestRoom.settings, categoryFilterValue: radio.value });
    });
  });
  // 【2026-08-27新設】共同選曲：全曲・お気に入り・プレイリストから選ぶ。ホスト・参加者を
  // 問わず誰でも使える（js/onlineBattleScreen.jsの同名ハンドラと同じ考え方）。
  // 歌詞クイズ対戦では「歌詞データの共通曲」で絞り込む。
  elements.lyricsCollabChooseSongsButton.addEventListener("click", () => {
    openLyricsCollabSongPicker();
  });
  elements.lyricsCollabChooseFavoritesButton.addEventListener("click", () => {
    const favoriteSongIds = getFavoriteSongIds().filter((songId) => currentLyricsCommonSongPool.has(songId));
    openLyricsSongListConfirm("⭐ お気に入りから選ぶ", "お気に入りから選ばれている曲はこの曲です", favoriteSongIds);
  });
  elements.lyricsCollabChoosePlaylistButton.addEventListener("click", () => {
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
    elements.quitConfirmModal.hidden = false;
  });
  elements.quitCancelButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = true;
  });
  elements.quitConfirmButton.addEventListener("click", () => {
    elements.quitConfirmModal.hidden = true;
    stopAllLocalTimers();
    elements.onQuitDuringBattle();
    elements.navigateTo("onlineBattleEntry");
  });

  // 【2026-09-05新設、本人指示】対戦中、ホストだけに見える「ルーム設定へ戻る」。
  elements.battleBackToLobbyButton?.addEventListener("click", () => {
    promptReturnToLobby(latestRoom?.roomId);
  });

  // 【2026-09-14新設・本人指示：対戦中のゲストが自分だけ途中離脱する】
  elements.battleLeaveMatchButton?.addEventListener("click", () => {
    const roomId = latestRoom?.roomId;
    const matchId = currentMatchId;
    if (!roomId || !matchId) return;
    promptLeaveMatch(roomId, matchId, () => {
      saveVoluntaryLeaveLyricsHistoryEntry();
      resetLyricsQuizBattleState();
      elements.navigateTo("onlineBattleLobby");
    });
  });

  elements.resultHomeLink.addEventListener("click", () => {
    stopAllLocalTimers();
    elements.onLeaveResultToHome();
    elements.navigateTo("start");
  });
  // 【2026-09-07新設・本人指示：ルームから退出＝完全離脱】js/onlineBattleScreen.jsの
  // 同じボタンと同じ考え方。実処理はonLeaveRoomCompletely()経由で
  // leaveOnlineBattleRoomCompletely()（あちらに集約）を呼ぶ。
  // 【2026-09-15改訂・本人指示：ゲスト側の退出操作にも必ず確認ダイアログ】
  elements.resultLeaveButton?.addEventListener("click", () => {
    promptResultLeaveRoom(async () => {
      stopAllLocalTimers();
      elements.resultLeaveButton.disabled = true;
      await elements.onLeaveRoomCompletely();
      elements.resultLeaveButton.disabled = false;
      elements.navigateTo("start");
    });
  });
  // 【2026-09-05改訂、本人指示】試合後の選択肢を「もう一度」「ルーム設定に戻る」の
  // 2つ（ホスト専用）へ統一。
  // 【再戦準備フェーズ新設・本人指示】以前は「もう一度」を確認モーダルを挟まず即座に
  // 実行していたが、今はbeginRematchReadyCheck()を呼び、全員が「準備OK」を押すのを待つ
  // 準備フェーズへ進む（js/onlineBattleScreen.jsのrenderRematchReadyScreen()参照）。
  elements.resultRematchButton.addEventListener("click", async () => {
    if (!latestRoom) return;
    elements.resultRematchButton.disabled = true;
    await beginRematchReadyCheck({ roomId: latestRoom.roomId });
    elements.resultRematchButton.disabled = false;
  });
  elements.resultBackToLobbyButton.addEventListener("click", async () => {
    if (!latestRoom) return;
    elements.resultBackToLobbyButton.disabled = true;
    await returnRoomToLobby({ roomId: latestRoom.roomId });
    elements.resultBackToLobbyButton.disabled = false;
  });
}

function stopAllLocalTimers() {
  stopTickTimer();
  stopServerTimeOffsetTracking();
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
  mySubmittedForQuestionIndex = -1;
  mySelectedSongId = null;
  submitInFlight = false;
  myOutcomeHistory = [];
  myComboCount = 0;
  myQuestionStartedAtCache = {};
  winnerNameByQuestionIndex = {};
  myOpenedHintLevel = 1;
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

async function applyLyricsQuizSettingsChange(room, nextSettings) {
  const errorMessage = validateRoomSettings(room.gameMode, nextSettings);
  if (errorMessage) {
    // 【2026-08-08追記】出題する曲を絞り込めるようになったことで、「出題数に対して選択曲が
    // 足りない」検証エラーが実際に起こりうるようになった（本人指示：「10問対戦を開始するには
    // 10曲以上選択してください」等、分かりやすいエラーを表示すること）。以前はconsole.errorだけで
    // 画面には何も出ていなかったため、ここで可視化する。
    if (elements.lyricsSettingsError) {
      elements.lyricsSettingsError.textContent = errorMessage;
      elements.lyricsSettingsError.hidden = false;
    }
    console.error("歌詞クイズ対戦設定が不正です:", errorMessage);
    return;
  }
  if (elements.lyricsSettingsError) elements.lyricsSettingsError.hidden = true;
  await updateRoomSettings({ roomId: room.roomId, settings: nextSettings });
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
function setLyricsSongSourceRadio(settings) {
  const isCollaborative = settings.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  const value = isCollaborative ? "manual" : "all";
  const input = document.querySelector(`input[name="online-lyrics-battle-settings-song-source"][value="${value}"]`);
  if (input) input.checked = true;

  // 【2026-09-16新設・本人指示：他モードとの機能差解消】カテゴリのラジオ自体は、曲を
  // 共同選択している間は「一覧をどのカテゴリで絞り込むか」を選ぶ意味が無いため隠す
  // （js/onlineBattleScreen.jsのapplySettingsToHostForm()と同じ考え方）。ただし、隠れている
  // 間もcategoryFilterValueの値自体はsettingsに残ったままで、js/battleModes/
  // lyricsQuizBattleMode.jsのresolveQuestionSourceSongPool()が共同選曲の選択曲を
  // 引き続き絞り込みに使う（「全曲から出題」へ戻せば、隠れていたカテゴリ設定がそのまま
  // 効いていたことが分かる。選択状態を破壊しない既存仕様の一部）。
  if (elements.lobbySettingsCategoryFieldsetLyrics) {
    elements.lobbySettingsCategoryFieldsetLyrics.hidden = isCollaborative;
  }
}

// 【2026-09-16新設・本人指示：他モードとの機能差解消】setQuestionCountRadio()と同じ考え方。
function setLyricsCategoryRadio(value) {
  const input = document.querySelector(`input[name="online-lyrics-battle-settings-category"][value="${value}"]`);
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
  // 【2026-09-16修正】オンライン対戦の「曲を選んで出題」は共同選曲
  // （QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION）として保存される
  // （js/onlineLyricsQuizBattleScreen.jsのsong-sourceラジオのchangeハンドラ参照）。
  // ここが本来存在しないMANUAL_SELECTIONを見ていたため、参加者向けの「N曲から出題」
  // チップが実際には一度も表示されない不具合になっていた。今回カテゴリのチップを
  // 追加するにあたって判定を実態に合わせて修正した。
  const isManualSongSource = settings.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  // 【2026-08-31改訂】ヒントは本人がボタンで手動で開く方式になり、settings.hintIntervalSec
  // （自動送り間隔）の設定項目自体が無くなったため、このチップからも外した。
  const chips = [
    "歌詞クイズ",
    findRuleLabel(settings.battleRuleId),
    describeAnswerPoolChipLabel(settings.answerPoolSizeValue),
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? settings.questionCountValue,
  ];
  // 【2026-08-08新設】曲を手動選択している場合だけ、参加者にも「N曲から出題」を見せる
  // （本人指示：曲名までは見せない）。
  // 【2026-09-16追加・本人指示：他モードとの機能差解消】そうでない場合（＝カテゴリで
  // 絞り込んだ全曲から出題している場合）は、js/onlineBattleScreen.jsの
  // renderInstantBattleSettingsChips()と同じくカテゴリのチップを見せる。
  if (isManualSongSource) {
    chips.push(`${settings.questionSource.songIds?.length ?? 0}曲から出題`);
  } else {
    chips.push(CATEGORY_LABELS[settings.categoryFilterValue] ?? settings.categoryFilterValue);
  }
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
    setLyricsCategoryRadio(settings.categoryFilterValue);
    setLyricsSongSourceRadio(settings);
  } else {
    renderLyricsQuizParticipantSummary(settings);
  }

  // 【2026-08-27新設】共同選曲：ホスト・参加者を問わず同じ表示を行い、ホストの端末だけが
  // 「参加者全員の選択の和集合」をsettingsへ自動的に反映する。
  updateLyricsCollabSongSectionUi(room);
  syncLyricsCollaborativeSongPoolIfHost(room, isHost);

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
  mySubmittedForQuestionIndex = -1;
  mySelectedSongId = null;
  myOutcomeHistory = [];
  myComboCount = 0;
  myQuestionStartedAtCache = {};
  winnerNameByQuestionIndex = {};
  myOpenedHintLevel = 1;
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
  // 【2026-09-01新設・本人指示：ライブスコアボード】新しい試合のたびに、開閉状態を閉じた
  // 状態から始める（前の試合で開いたままでも、次の試合の最初は畳んだ状態にする）。
  if (elements.battleScoreboard) elements.battleScoreboard.open = false;
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
  question.hints.forEach((hint) => {
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
    // 答え合わせ時のヒント一覧（renderResolvedHintSummary）と全く同じCSSクラスを使い、
    // 回答中・答え合わせ後でヒントのフォント・見た目が食い違わないようにする
    // （本人指示：ヒントフォントの統一）。
    elements.battleHintLinesContainer.classList.add("online-lyrics-battle-hint-summary-list");
    levels.forEach(({ level, revealedText }) => {
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
    return;
  }

  const hint = question.hints.find((h) => h.hintLevel === myOpenedHintLevel) ?? question.hints[0];
  elements.battleHintLevel.textContent = `ヒント ${myOpenedHintLevel} / ${MAX_HINT_LEVEL}`;
  const lines = (hint?.segment?.text ?? "").split("\n").filter((line) => line.length > 0);
  lines.forEach((lineText) => {
    const lineElement = document.createElement("p");
    lineElement.className = "online-lyrics-battle-hint-line";
    lineElement.textContent = lineText;
    elements.battleHintLinesContainer.appendChild(lineElement);
  });
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
      myAnswerJumpRowKey = key;
      myAnswerSearchQuery = "";
      if (elements.battleAnswerSearchInput) elements.battleAnswerSearchInput.value = "";
      reportMyQuestionActivity();
      renderCurrentQuestionState();
    });
    elements.battleAnswerJumpBar.appendChild(button);
  });
}

function renderAnswerChoices(question, { isResolved, myAnsweredThisQuestion, questionIndex }) {
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
function showAnswerSubmissionNotice(reason) {
  const message = describeAnswerSubmissionBlockMessage(reason);
  if (!message) return;
  elements.battleError.textContent = message;
  elements.battleError.hidden = false;
  elements.battleError.classList.add("is-notice");
}

function hideAnswerSubmissionNotice() {
  elements.battleError.hidden = true;
  elements.battleError.classList.remove("is-notice", "is-steal-success");
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
    // 奪い取り成功音（2026-08-09新設）は、Firebase側でwinner claimの書き込みが実際に
    // 成功した（＝サーバー側で自分が勝者だと確定した）STEAL_CLAIM_OUTCOME.WONの
    // ときだけ鳴らす。ローカルで選択した直後や、通信結果を待っている段階では鳴らさない。
    // ただし、その通知が届く前に次の問題／試合へ進んでいた場合は、今の画面に
    // 前問の効果音・メッセージを混ぜないよう鳴らさない・表示しない。
    if (result.outcome === STEAL_CLAIM_OUTCOME.WON && !isStaleQuestion) {
      playSfx(SFX_EVENTS.STEAL_SUCCESS);
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
    }
  } else if (result.reason === "already-answered") {
    mySubmittedForQuestionIndex = qIndex;
  } else if (!isStaleQuestion) {
    const failureMessage = describeAnswerSubmissionFailureMessage(result.reason);
    elements.battleError.classList.toggle("is-notice", !!failureMessage);
    elements.battleError.textContent = failureMessage ?? "回答の送信に失敗しました。通信環境をご確認ください。";
    elements.battleError.hidden = false;
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
// 【早押しバトルの出し分け】早押しバトルは「途中経過を見せると不公平になる」という本人指示
// により、出題中（回答収集中＝questionStatus:"active"）はスコアボード自体を隠す。reveal後
// （questionStatus:"resolved"）は他の2ルールと同様に見せる。
function renderScoreboard(match, { ruleId, isResolved }) {
  const container = elements.battleScoreboard;
  if (!container) return; // この要素が無い画面構成では何もしない（安全側）

  const shouldShow = ruleId !== "steal" || isResolved;
  container.hidden = !shouldShow;
  if (!shouldShow) return;

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

  if (!elements.battleScoreboardList) return;
  clearElement(elements.battleScoreboardList);
  scoreboard.rows.forEach((row, index) => {
    const item = document.createElement("li");
    item.className = "online-lyrics-battle-scoreboard-item";
    if (row.isMe) item.classList.add("is-me");

    const rankSpan = document.createElement("span");
    rankSpan.className = "online-lyrics-battle-scoreboard-rank";
    rankSpan.textContent = `${index + 1}`;
    item.appendChild(rankSpan);

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
    mySelectedSongId = null;
    hideAnswerSubmissionNotice();
    // 【2026-09-07新設・本人指示：前問の答え合わせが一瞬見えるバグ対策】この下の
    // isResolved再計算（elements.battleAnswerReveal.hidden = !isResolved）は、この関数の
    // 後半でしか行われない。関数の実行が万一そこへ到達する前に中断される場合に備え、
    // 新しい問題を検知した瞬間にも前問の答え合わせカードを同期的に隠しておく（保険）。
    elements.battleAnswerReveal.hidden = true;
    // 【2026-08-31新設】新しい問題に移ったら、開いたヒント段階・検索状態をリセットする。
    myOpenedHintLevel = 1;
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

  const isResolved = match.questionStatus === "resolved";
  const ruleId = latestRoom.settings.battleRuleId;
  const myAnsweredThisQuestion = mySubmittedForQuestionIndex === qIndex;
  const nowServerTimeMs = Date.now() + serverTimeOffset;
  const elapsedMs = computeElapsedMs({ questionStartedAt: match.currentQuestionStartedAt, nowServerTimeMs });

  renderHintArea(question, { ruleId, elapsedMs, isResolved, myAnsweredThisQuestion, questionIndex: qIndex });
  renderAnswerChoices(question, { isResolved, myAnsweredThisQuestion, questionIndex: qIndex });
  renderIdleNotice(match, qIndex, nowServerTimeMs);

  maybeRecordMyOutcomeForResolvedQuestions(match);
  const hudItems = describeHudItems(latestRoom.settings.battleRuleId, computeMyLiveHudStats());
  renderHud(elements.battleHudContainer, hudItems);
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
    elements.battleStatusMessage.textContent = myForcedSkip
      ? "ホストにより、この問題は「わからない」扱いになりました。他のプレイヤーの回答を待っています…"
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
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
}

export function enterLyricsQuizResult(room) {
  latestRoom = room;
  stopAllLocalTimers();
  elements.navigateTo("onlineLyricsBattleResult");

  const match = room.matches?.[room.activeMatchId] ?? {};
  const participants = match.participants || {};
  // 【Phase7訂正】既存gameMode（timeAttack等）のmatches/{matchId}/resultsは「本人が自分の
  // 結果だけを書く」前提のルールのため、ホストが全員分をまとめて書く歌詞クイズとは
  // 書き込み主体が異なる。既存ルールに触れないよう、専用のlyricsResultsパスを使う。
  const results = match.lyricsResults || {};
  const myUid = getCurrentUid();

  // 【2026-09-05改訂、本人指示】試合後の選択肢「もう一度」「ルーム設定に戻る」は
  // ホスト専用。非ホストには代わりに「⌂ホームへ戻る」だけを見せる。
  const isHostOnResultScreen = room.host === myUid;
  elements.resultHostActions.hidden = !isHostOnResultScreen;
  elements.resultHomeLink.hidden = isHostOnResultScreen;
  // 【2026-09-07新設・本人指示：ゲスト結果画面】ホスト専用ボタンの代わりに、待機案内＋
  // 「ルームから退出」を見せる（js/onlineBattleScreen.jsの同じ変更と揃えている）。
  if (elements.resultGuestActions) elements.resultGuestActions.hidden = isHostOnResultScreen;
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
