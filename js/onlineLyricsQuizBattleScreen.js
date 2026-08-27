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
import { ROOM_STATUS, updateRoomSettings, subscribeServerTimeOffset } from "./onlineBattle.js";
import { validateRoomSettings, getAvailabilityKind, resolveAllEligibleSongIdsForMode } from "./battleModes/index.js";
import * as lyricsQuizBattleMode from "./battleModes/lyricsQuizBattleMode.js";
import { SKIP_SELECTION, MAX_HINT_LEVEL, createDefaultSettingsForRule } from "./battleModes/lyricsQuizBattleMode.js";
import {
  createMatchProgress,
  recordAnswer,
  recordStealClaim,
  tick,
  advanceToNextQuestion,
  finalizeMatch,
  restoreMatchProgressFromFirebase,
} from "./lyricsQuizMatchProgress.js";
import {
  submitLyricsCoverage,
  startLyricsQuizQuestion,
  submitLyricsQuizAnswer,
  submitLyricsQuizAnswerWithStealClaim,
  resolveLyricsQuizQuestion,
  finalizeLyricsQuizMatch,
  computeSongPoolHash,
} from "./lyricsQuizBattleFirebase.js";
import {
  loadSongsWithLyrics,
  resolveLyricsQuizSongPool,
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
  renderResultTable,
  renderLyricsReadinessStatus,
  renderOwnMissingLyricsTitles,
} from "./lyricsQuizBattleUi.js";
import { deriveHintLevelFromElapsedMs, computeElapsedMs } from "./lyricsQuizBattleTiming.js";
// 【2026-08-08新設】出題する曲をホストが選べる機能。他の対戦モード（js/onlineBattleScreen.js）と
// 同じ曲選択画面を共有する（gameModeごとに別々の選曲UIを持たない、本人指示）。
import { openOnlineBattleSongPicker } from "./onlineBattleSongPicker.js";
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
import { SONGS } from "./data/songs.js";
import { MEMBERS } from "./data/members.js";
import { getMemberById } from "./memberUtils.js";
import { QUESTION_COUNT_LABELS } from "./localBattleScreen.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { STEAL_CLAIM_OUTCOME } from "./lyricsQuizBattleFirebasePayloads.js";

// ホストが問題の確定（正解発表）を見せてから、次の問題／最終結果へ進むまでの待ち時間。
const REVEAL_DELAY_MS = 3000;
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
let mySubmittedForQuestionIndex = -1;
let mySelectedSongId = null;
let submitInFlight = false;

// 自分自身のライブHUD用の集計（各クライアントが独立して積み上げる。詳しくはファイル末尾の
// maybeRecordMyOutcomeForResolvedQuestions()参照）。
let myOutcomeHistory = [];
let myComboCount = 0;
let myQuestionStartedAtCache = {};
let lastWinnerNameCache = null; // 奪い取りHUDの「直近の獲得者」用

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

  elements.resultHomeLink.addEventListener("click", () => {
    stopAllLocalTimers();
    elements.onLeaveResultToHome();
    elements.navigateTo("start");
  });
  elements.resultRematchButton.addEventListener("click", () => {
    elements.resultRematchConfirmModal.hidden = false;
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
  mySubmittedForQuestionIndex = -1;
  mySelectedSongId = null;
  submitInFlight = false;
  myOutcomeHistory = [];
  myComboCount = 0;
  myQuestionStartedAtCache = {};
  lastWinnerNameCache = null;
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
  if (getCurrentUid() === room.host && room.status === ROOM_STATUS.PLAYING) {
    runHostProgressionTick();
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
}

// 【2026-08-27新設】現在分かっている「参加者全員が選んだ曲の和集合」を、今のルーム
// 共通曲（currentLyricsCommonSongPool）で絞り込んだ配列を返す。
function getMergedRestrictedLyricsSongIds() {
  if (!latestRoom) return [];
  const merged = computeMergedSelectedSongIds(latestRoom.players || {});
  return merged.filter((songId) => currentLyricsCommonSongPool.has(songId));
}

// 【2026-08-27新設】共同選曲セクション（ホスト・参加者共通）の表示を更新する。
function updateLyricsCollabSongSectionUi(room) {
  const isCollaborative = room.settings?.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION;
  elements.lyricsCollabSongSection.hidden = !isCollaborative;
  if (!isCollaborative) return;

  const merged = computeMergedSelectedSongIds(room.players || {});
  const restrictedCount = merged.filter((songId) => currentLyricsCommonSongPool.has(songId)).length;
  elements.lyricsCollabMyCount.textContent = `自分が選んだ曲: ${mySelectedSongIds.length}曲`;
  elements.lyricsCollabTotalCount.textContent =
    merged.length === 0
      ? "まだ誰も曲を選んでいません。下のボタンから選んでください。"
      : `参加者全員の選択を合わせて${merged.length}曲（このうち${restrictedCount}曲がこの対戦で使えます）`;
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

function renderLyricsQuizParticipantSummary(settings) {
  clearElement(elements.lyricsSettingsSummaryContainer);
  const isManualSongSource = settings.questionSource?.type === QUESTION_SOURCE_TYPE.MANUAL_SELECTION;
  const chips = [
    "歌詞クイズ",
    findRuleLabel(settings.battleRuleId),
    describeAnswerPoolChipLabel(settings.answerPoolSizeValue),
    QUESTION_COUNT_LABELS[settings.questionCountValue] ?? settings.questionCountValue,
    `ヒント表示${settings.hintIntervalSec}秒`,
  ];
  // 【2026-08-08新設】曲を手動選択している場合だけ、参加者にも「N曲から出題」を見せる
  // （本人指示：曲名までは見せない）。
  if (isManualSongSource) {
    chips.push(`${settings.questionSource.songIds?.length ?? 0}曲から出題`);
  }
  chips.forEach((text) => {
    const chip = document.createElement("span");
    chip.className = "battle-config-chip";
    chip.textContent = text;
    elements.lyricsSettingsSummaryContainer.appendChild(chip);
  });
}

// settings.questionSourceから解決した曲プールの歌詞データが自分の端末に揃っているかを
// 確認し、件数だけをFirebaseへ送る（曲名は送らない）。曲プール自体が変わっていなければ
// IndexedDBを読み直さない。
async function refreshAndSubmitLyricsCoverage(room) {
  // 【2026-08-08修正】resolveSongPool()ではなく、歌詞クイズ対象外の曲
  // （Overture等、ボーカルの無い曲）を除いたresolveLyricsQuizSongPool()を使う。
  const songPool = resolveLyricsQuizSongPool(room.settings.questionSource);
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
  const hostPoolHash = computeSongPoolHash(resolveLyricsQuizSongPool(room.settings.questionSource));
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

  latestRoom = room;
  currentMatchId = room.activeMatchId;
  runtimeReady = false;
  currentQuestions = [];
  hostState = null;
  hostTickInFlight = false;
  resolvedAtLocalMs = null;
  lastRenderedQuestionIndex = -1;
  mySubmittedForQuestionIndex = -1;
  mySelectedSongId = null;
  myOutcomeHistory = [];
  myComboCount = 0;
  myQuestionStartedAtCache = {};
  lastWinnerNameCache = null;

  elements.battleError.hidden = true;
  elements.battleStatusMessage.hidden = true;
  clearElement(elements.battleHudContainer);
  clearElement(elements.battleAnswerChoicesContainer);
  clearElement(elements.battleHintLinesContainer);
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
  const match = latestRoom.matches?.[currentMatchId];
  if (!match) return;

  if (typeof match.currentQuestionIndex !== "number") {
    hostTickInFlight = true;
    try {
      const result = await startLyricsQuizQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: 0 });
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
      if (nextState.status === "inProgress") {
        resolvedAtLocalMs = null;
        const result = await startLyricsQuizQuestion({ roomId: latestRoom.roomId, matchId: currentMatchId, questionIndex: nextState.currentQuestionIndex });
        if (!result.ok) {
          // eslint-disable-next-line no-console
          console.error("歌詞クイズ対戦：次の問題の開始に失敗しました", result.reason);
        }
      } else {
        const entries = finalizeMatch(nextState, latestRoom.settings);
        if (entries) {
          const resultsByUid = Object.fromEntries(entries.map((entry) => [entry.uid, entry.result]));
          const result = await finalizeLyricsQuizMatch({ roomId: latestRoom.roomId, matchId: currentMatchId, resultsByUid });
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
function maybeRecordMyOutcomeForResolvedQuestions(match) {
  const myUid = getCurrentUid();
  if (!myUid || !latestRoom) return;

  const resolvedUpToIndex = match.questionStatus === "resolved" ? match.currentQuestionIndex : match.currentQuestionIndex - 1;
  while (myOutcomeHistory.length <= resolvedUpToIndex) {
    const qIndex = myOutcomeHistory.length;
    const question = currentQuestions[qIndex];
    if (!question) break;

    const myAnswer = (match.answers?.[qIndex] ?? {})[myUid] ?? {
      selectedSongId: SKIP_SELECTION,
      hintLevel: MAX_HINT_LEVEL,
      submittedAt: myQuestionStartedAtCache[qIndex] ?? Date.now(),
    };
    const context = {
      answersByUid: { [myUid]: myAnswer },
      correctSongId: question.song.id,
      winner: match.questionClaims?.[qIndex]?.winner ?? null,
      comboCountByUid: { [myUid]: myComboCount },
      questionStartedAt: myQuestionStartedAtCache[qIndex] ?? match.currentQuestionStartedAt,
      allPlayerUids: [myUid],
      nowMs: Date.now(),
      settings: latestRoom.settings,
    };
    const outcomesByUid = lyricsQuizBattleMode.resolveQuestionAnswers(latestRoom.settings, context);
    const myOutcome = outcomesByUid[myUid];
    if (!myOutcome) break; // 安全側：万一取得できなければこれ以上進めない
    myOutcomeHistory.push(myOutcome);
    myComboCount = myOutcome.nextComboCount;

    // 【Phase6.5・HUD「直近の獲得者」の実値化】この問題に勝者がいれば、表示名を
    // 参加者スナップショット（match.participants）から引いて覚えておく。奪い取り以外の
    // ルールではwinnerが常にnullのため、この処理は実質何もしない（安全に素通りする）。
    const winnerUid = context.winner?.uid;
    if (winnerUid) {
      lastWinnerNameCache = match.participants?.[winnerUid]?.displayName ?? winnerUid;
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
    lastWinnerName: lastWinnerNameCache,
    ...(currentMultiplier !== null ? { currentMultiplier } : {}),
  };
}

function renderHintLines(question, hintLevel) {
  clearElement(elements.battleHintLinesContainer);
  const hint = question.hints.find((h) => h.hintLevel === hintLevel) ?? question.hints[question.hints.length - 1];
  elements.battleHintLevel.textContent = `ヒント ${hintLevel} / ${MAX_HINT_LEVEL}`;
  if (!hint) return;
  const lines = (hint.segment?.text ?? "").split("\n").filter((line) => line.length > 0);
  lines.forEach((lineText) => {
    const lineElement = document.createElement("p");
    lineElement.className = "online-lyrics-battle-hint-line";
    lineElement.textContent = lineText;
    elements.battleHintLinesContainer.appendChild(lineElement);
  });
}

function renderAnswerChoices(question, { isResolved, myAnsweredThisQuestion }) {
  clearElement(elements.battleAnswerChoicesContainer);
  const correctSongId = question.song.id;
  question.answerPool.forEach((choiceSong) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "online-lyrics-battle-answer-button";
    button.textContent = choiceSong.title;
    if (mySelectedSongId === choiceSong.id) button.classList.add("is-selected");
    if (isResolved && choiceSong.id === correctSongId) button.classList.add("is-correct-answer");
    button.disabled = isResolved || myAnsweredThisQuestion || submitInFlight;
    button.addEventListener("click", () => handleAnswerChoiceClick(choiceSong.id));
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
  elements.battleError.classList.remove("is-notice");
}

async function handleAnswerChoiceClick(selectedSongId) {
  const match = latestRoom?.matches?.[currentMatchId];
  const qIndex = match?.currentQuestionIndex;
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

  const nowServerTimeMs = Date.now() + serverTimeOffset;
  const elapsedMs = computeElapsedMs({ questionStartedAt: match.currentQuestionStartedAt, nowServerTimeMs });
  const hintLevel = deriveHintLevelFromElapsedMs({
    elapsedMs,
    hintIntervalSec: latestRoom.settings.hintIntervalSec,
    maxHintLevel: MAX_HINT_LEVEL,
  });
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
  if (result.ok) {
    mySubmittedForQuestionIndex = qIndex;
    // 奪い取り成功音（2026-08-09新設）は、Firebase側でwinner claimの書き込みが実際に
    // 成功した（＝サーバー側で自分が勝者だと確定した）STEAL_CLAIM_OUTCOME.WONの
    // ときだけ鳴らす。ローカルで選択した直後や、通信結果を待っている段階では鳴らさない。
    if (result.outcome === STEAL_CLAIM_OUTCOME.WON) {
      playSfx(SFX_EVENTS.STEAL_SUCCESS);
    }
    const outcomeMessage = describeStealClaimOutcomeMessage(result.outcome);
    if (outcomeMessage) {
      elements.battleError.classList.add("is-notice");
      elements.battleError.textContent = outcomeMessage;
      elements.battleError.hidden = false;
    }
  } else if (result.reason === "already-answered") {
    mySubmittedForQuestionIndex = qIndex;
  } else {
    const failureMessage = describeAnswerSubmissionFailureMessage(result.reason);
    elements.battleError.classList.toggle("is-notice", !!failureMessage);
    elements.battleError.textContent = failureMessage ?? "回答の送信に失敗しました。通信環境をご確認ください。";
    elements.battleError.hidden = false;
  }
  renderCurrentQuestionState();
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
  }
  if (typeof match.currentQuestionStartedAt === "number" && !(qIndex in myQuestionStartedAtCache)) {
    myQuestionStartedAtCache[qIndex] = match.currentQuestionStartedAt;
  }

  elements.battleProgress.textContent = `第${qIndex + 1}問 / 全${currentQuestions.length}問`;

  const isResolved = match.questionStatus === "resolved";
  const nowServerTimeMs = Date.now() + serverTimeOffset;
  const elapsedMs = computeElapsedMs({ questionStartedAt: match.currentQuestionStartedAt, nowServerTimeMs });
  const hintLevel = isResolved
    ? MAX_HINT_LEVEL
    : deriveHintLevelFromElapsedMs({ elapsedMs, hintIntervalSec: latestRoom.settings.hintIntervalSec, maxHintLevel: MAX_HINT_LEVEL });

  renderHintLines(question, hintLevel);
  renderAnswerChoices(question, { isResolved, myAnsweredThisQuestion: mySubmittedForQuestionIndex === qIndex });

  maybeRecordMyOutcomeForResolvedQuestions(match);
  const hudItems = describeHudItems(latestRoom.settings.battleRuleId, computeMyLiveHudStats());
  renderHud(elements.battleHudContainer, hudItems);

  elements.battleStatusMessage.hidden = !isResolved;
  if (isResolved) {
    elements.battleStatusMessage.textContent = "正解が確定しました。まもなく次の問題です。";
  }
}

// ===== 結果画面 =====

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

  elements.resultRematchButton.hidden = room.host !== myUid;
  elements.resultRuleNote.textContent = lyricsQuizBattleMode.getRuleDescription(room.settings);

  const rankedEntries = Object.entries(participants).map(([uid, participant]) => ({
    uid,
    displayName: participant.displayName,
    isHost: participant.isHost === true,
    isYou: uid === myUid,
    isDnf: !results[uid],
    oshiColor: resolveOshiColor(participant.oshiMemberId),
    result: results[uid] ? { detail: results[uid].detail } : null,
  }));

  rankedEntries.sort((entryA, entryB) => {
    if (entryA.isDnf !== entryB.isDnf) return entryA.isDnf ? 1 : -1;
    if (entryA.isDnf) return 0;
    return lyricsQuizBattleMode.compareResults(results[entryA.uid], results[entryB.uid], room.settings);
  });

  const table = describeResultTable(room.settings.battleRuleId, rankedEntries);
  renderResultTable(elements.resultTableContainer, table);

  // 対戦の勝敗音（2026-08-10新設）。DNF（自分の結果が確定していない）のときは鳴らさない。
  const myRankedIndex = rankedEntries.findIndex((entry) => entry.isYou);
  if (myRankedIndex !== -1 && !rankedEntries[myRankedIndex].isDnf) {
    playSfx(myRankedIndex === 0 ? SFX_EVENTS.BATTLE_WIN : SFX_EVENTS.BATTLE_LOSE);
  }

  saveLyricsQuizBattleHistoryEntry(room, rankedEntries);
}

// 【2026-08-08新設】オンライン歌詞クイズ対戦の結果を、統一プレイ履歴（js/playHistory.js）へ保存する。
// idをonline:{matchId}にすることで、リロード・再接続・画面再描画で何度この結果画面へ到達しても
// 同じ試合が重複保存されない（本人指示）。ルール（クラシック／奪い取り／コンボ）は必ず記録する。
function saveLyricsQuizBattleHistoryEntry(room, rankedEntries) {
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
    },
  });
}
