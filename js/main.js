// アプリの起点となるファイル。
// 各モジュール（state.js, screens.js など）を import してつなぎ合わせていく。

import { SONGS } from "./data/songs.js";
import { AUDIO_METADATA } from "./data/audioMetadata.js";
import { showScreen, onScreenChange } from "./screens.js";
import {
  getLyricsQuizRevealAudioEnabled,
  getInstantChallengeRevealAudioEnabled,
  syncRevealAudioToggle,
} from "./revealAudioPreference.js";
import { initCenterCelebration, showCenterCelebrationIfEligible } from "./centerCelebration.js";
import {
  gameState,
  resetGameState,
  startQuiz,
  startReviewQuiz,
  startSpecialQuiz,
  startTimeAttackQuiz,
  startLocalBattleQuiz,
  startOnlineBattleQuiz,
  startRandomPlaybackQuiz,
  getCurrentQuestion,
  recordAnswer,
  advanceToNextQuestion,
  markPlaybackStarted,
  getElapsedMsSincePlaybackStart,
  getMissedSongs,
  setReviewSongs,
} from "./state.js";
import {
  filterSongsByCategory,
  resolveQuestionCount,
  validatePlayablePoolSize,
  buildQuizQuestions,
  buildReviewQuizQuestions,
  buildQuestionsFromSongIds,
} from "./quiz.js";
import { playSongIntro, playSongFromRandomPosition, stopAudio, attemptSilentUnlock, reportPlaybackTrouble } from "./audio.js";
import { bindPressReleaseAnswer } from "./answerButtonInteraction.js";
import { recordAudioDiagnostic } from "./audioDiagnosticLog.js";
import { initDebugAudioLogScreen, renderDebugAudioLog } from "./debugAudioLogScreen.js";
import { captureViewportSnapshot } from "./viewportDiagnosticLog.js";
import { isAudioTroubleTimeSevere } from "./audioTroubleClassification.js";
import {
  initInstantChallengeSetupScreen,
  initInstantChallengeQuestionScreen,
  initInstantChallengeResultScreen,
  startInstantChallengePlay,
  renderInstantChallengeResult,
  retryInstantChallengeRun,
  startInstantChallengeWeakSongsPractice,
  isInstantChallengeWeakSongsPractice,
  startInstantChallengeFromCustomPreset,
  isInstantChallengeFromCustomPreset,
} from "./instantChallengeScreen.js";
import { startTimer, stopTimer } from "./timer.js";
import { calculateScore, calculateRank } from "./score.js";
import { getHighScore, saveHighScoreIfBetter } from "./highscore.js";
import {
  playClickSound,
  playCorrectSound,
  playWrongSound,
  playCountUpSound,
  isSfxEnabled,
  toggleSfxEnabled,
} from "./sfx.js";
import { SFX_EVENTS, playSfx } from "./soundManager.js";
import { initSoundSettingsScreen, refreshSfxSettingsUI } from "./soundSettingsScreen.js";
import { renderBackgroundSparkles } from "./decorations.js";
import {
  renderSongList,
  resetSongListToDefaultView,
  stopSongListPreview,
  refreshAllFavoriteButtons,
  getActiveSonglistTab,
} from "./songlist.js";
import { evaluateAndSaveAchievements, syncLegacyAchievements } from "./achievementProgress.js";
import { renderAchievementUnlockEvents, clearAchievementUnlockEvents } from "./achievementDisplay.js";
import { initAchievementListModal } from "./achievementList.js";
import { getAchievementById } from "./achievementDefinitions.js";
import { saveHistoryEntry } from "./history.js";
import { savePlayHistoryEntry, HISTORY_MODE_DISPLAY } from "./playHistory.js";
import { calculateAverageResponseMs, formatResponseSeconds } from "./responseTime.js";
import { describeSpeedProgressForPlay, buildSpeedProgressResultBlock } from "./speedAchievementProgress.js";
import { initHistoryScreen, renderHistoryScreen } from "./historyScreen.js";
import { initHistoryDetailScreen, renderHistoryDetail } from "./historyDetailScreen.js";
import { initSpecialModesScreen } from "./specialModesScreen.js";
import {
  initWeakSongsScreen,
  renderWeakSongsScreen,
  resolveWeakSongIds,
  resolveOutroWeakSongIds,
  resolveShuffleWeakSongIds,
} from "./weakSongsScreen.js";
import {
  initLiveCallModeScreen,
  renderLiveCallModeList,
  openLiveCallModePlayer,
  closeLiveCallModePlayer,
  getCurrentLiveCallSongId,
} from "./liveCallModeScreen.js";
import { renderCallGuideTab } from "./callGuidePanel.js";
import { initKaraokeSyncScreen, openKaraokeSyncScreen, closeKaraokeSyncScreen } from "./karaokeSyncScreen.js";
import { getTimeAttackBest } from "./timeAttackScore.js";
import {
  TIME_ATTACK_RULE,
  TIME_ATTACK_VARIANT,
  initTimeAttackScreen,
  initTimeAttackResultScreen,
  startTimeAttackRun,
  getCurrentTimeAttackRule,
  getCurrentTimeAttackVariant,
  getCurrentTimeAttackSeed,
  recordTimeAttackAnswer,
  registerTimeAttackMiss,
  registerTimeAttackSelection,
  markTimeAttackRunFailed,
  renderTimeAttackResult,
  buildTimeAttackQuestions,
  getLastTimeAttackSelection,
  getCurrentTimeAttackStats,
} from "./timeAttackScreen.js";
import { initTimeAttackHistoryScreen, renderTimeAttackHistoryScreen } from "./timeAttackHistoryScreen.js";
import { submitTimeAttackScoreIfBetter, backfillTimeAttackLeaderboardIfNeeded } from "./timeAttackLeaderboardSync.js";
import { saveRankingCandidateIfBetter } from "./rankingCandidateStore.js";
import {
  initTimeAttackLeaderboardScreen,
  showTimeAttackLeaderboard,
} from "./timeAttackLeaderboardScreen.js";
import {
  initTimeAttackHistoryDetailScreen,
  renderTimeAttackHistoryDetail,
} from "./timeAttackHistoryDetailScreen.js";
import {
  computeRandomStartTimeSec,
  RANDOM_PLAYBACK_DEFAULTS,
  clampStartTimeToActualDuration,
  isDurationMismatchWithinTolerance,
  MAX_DURATION_MISMATCH_SEC,
} from "./randomPlaybackEngine.js";
import { getRandomPlaybackBest } from "./randomPlaybackScore.js";
import { getNormalQuizTimeBest, saveNormalQuizTimeBestIfBetter } from "./normalQuizTimeScore.js";
import { getOutroQuizTimeBest, saveOutroQuizTimeBestIfBetter } from "./outroQuizTimeScore.js";
import {
  initRandomPlaybackScreen,
  initRandomPlaybackResultScreen,
  startRandomPlaybackRun,
  getCurrentRandomPlaybackSeed,
  generateNewRandomPlaybackSeed,
  renderRandomPlaybackResult,
} from "./randomPlaybackScreen.js";
import {
  initLyricsQuizSetupScreen,
  initLyricsQuizQuestionScreen,
  initLyricsQuizResultScreen,
  updateBestChip as updateLyricsQuizBestChip,
  startLyricsQuizPlay,
  retryLyricsQuizRun,
  renderLyricsQuizResult,
  startManualSelectionLyricsQuizRun,
  isLyricsQuizWeakSongsPractice,
  isLyricsQuizFromCustomPreset,
} from "./lyricsQuizScreen.js";
import { buildBattleQuestions } from "./localBattle.js";
import { initLocalBattleScreens, getCurrentBattleSession } from "./localBattleScreen.js";
import {
  initOnlineBattleScreens,
  finishOnlineBattleMatch,
  reportOnlineBattleProgress,
  quitOnlineBattleDuringQuiz,
  leaveOnlineBattleRoomView,
  leaveOnlineBattleRoomCompletely,
  // 【2026-09-16新設・本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・個人進行系）】
  abortOnlineBattleMatchDueToAudioTrouble,
  // 【2026-11-XX新設・本人指示：ルーム招待】
  getCurrentOnlineRoomId,
} from "./onlineBattleScreen.js";
import { initRoomInviteUi, openInvitePicker } from "./roomInviteUi.js";
import { initOnlineLyricsQuizBattleScreens } from "./onlineLyricsQuizBattleScreen.js";
import { initOnlineInstantBattleScreens } from "./onlineInstantBattleScreen.js";
import { initOnlineInstantCoopBattleScreens } from "./onlineInstantCoopBattleScreen.js";
import { initReturnToLobbyPrompt } from "./onlineBattleLobbyReturnPrompt.js";
import { initLeaveMatchPrompt } from "./onlineBattleLeaveMatchPrompt.js";
import { initResultLeavePrompt } from "./onlineBattleResultLeavePrompt.js";
import { initResultHomePrompt } from "./onlineBattleResultHomePrompt.js";
import { initAnswerConfirmPrompt } from "./answerConfirmPrompt.js";
import { initOnlineBattleSongPicker } from "./onlineBattleSongPicker.js";
import { initOnlineBattlePlaylistPicker } from "./onlineBattlePlaylistPicker.js";
import { initOnlineBattleSongListConfirmModal } from "./onlineBattleSongListConfirmModal.js";
import { calculateBattleResult, getPlaybackType, getModeLabel } from "./battleModes/index.js";
import { resolveQuizModeProgressPrefix } from "./quizModeLabel.js";
// 歌詞クイズ対戦の3ルール説明モーダル用。Firebase・画面のことを一切知らない純粋関数のみのため、
// js/firebaseClient.jsを経由せずここから直接importしてよい。
import {
  listAvailableBattleRules,
  getBattleRuleDescription,
  createDefaultBattleRuleSettings,
} from "./battleRules/index.js";
import { initLocalBattleResultScreens, startBattleResultCollection } from "./localBattleResultScreen.js";
import {
  initCustomQuizScreen,
  openCustomQuizScreenForNewPreset,
  openCustomQuizScreenForPreset,
  getLastStartedCustomQuizSelection,
  setLastStartedCustomQuizSelection,
  setCustomQuizType,
  getCustomQuizType,
  stopCustomQuizPreview,
} from "./customQuizScreen.js";
import {
  CUSTOM_QUIZ_TYPE,
  getPresets,
  saveNewPreset,
  updatePreset,
  deletePreset,
  duplicatePreset,
} from "./customQuizPresets.js";
import {
  initCustomQuizPresetsScreen,
  renderCustomQuizPresetsScreen,
  setCustomQuizPresetsType,
  showPresetActionBanner,
} from "./customQuizPresetsScreen.js";
import { importAudioFiles, getImportedSongIds, filterSongsWithImportedAudio } from "./audioStorage.js";
import { requestPersistentStorage } from "./storagePersistence.js";
import { analyzeLyricsFiles, saveLyricsData, getImportedLyricsSongIds } from "./lyricsStorage.js";
import {
  analyzeCallDataBackupFile,
  importCallDataSongs,
  getSongIdsWithCallData,
  exportAllCallData,
} from "./callStorage.js";
import {
  analyzeCallGuideBackupFile,
  importCallGuideDataEntries,
  getAllCallGuideData,
  exportAllCallGuideData,
} from "./callGuideStorage.js";
// 【2026-08-26新設】追加データパック（新曲の音源・歌詞・コールデータをまとめて読み込む機能）。
// 実際の解析・保存処理はjs/dataPackImport.jsに集約されており、ここでは結果を見て
// 画面表示を更新するだけ（既存の音源・歌詞・コールの各インポートUIと同じ役割分担）。
import { analyzeDataPack, importAnalyzedDataPack, PACK_KIND } from "./dataPackImport.js";
import { isZipFile, extractZipToFiles } from "./zipPackImport.js";
import { closeFullscreenLyrics } from "./lyricsFullscreen.js";
import { initScrollLock } from "./scrollLock.js";
import { MEMBERS } from "./data/members.js";
import { MEMBER_PROFILES } from "./data/memberProfiles.js";
import { MEMBER_ACTIVITIES } from "./data/memberActivities.js";
import { GROUP_ACTIVITIES } from "./data/groupActivities.js";
import { DISCOGRAPHY } from "./data/discography.js";
import { GROUP_INFO } from "./data/groupInfo.js";
import { SISTER_GROUPS } from "./data/sisterGroups.js";
import { UPCOMING_RELEASE } from "./data/upcomingRelease.js";
import { HISTORY_EVENTS } from "./data/historyEvents.js";
import { LIVE_EVENTS } from "./data/liveHistory.js";
import { initDiscographyScreen, renderDiscographyScreen, openWorkDetail } from "./discographyScreen.js";
import { initMembersScreen, renderMembersScreen, openMemberDetail } from "./membersScreen.js";
import { initPlayerScreen, renderPlayerSummary } from "./playerScreen.js";
import { getPlayerKeyPrefix } from "./playerProfile.js";
import { needsOnboarding, initOnboardingScreen } from "./onboardingScreen.js";
import { initGuideScreen, openGuideScreen, getGuideReturnScreenId } from "./guideScreen.js";
import { initFanProfilesScreen, renderFanProfilesScreen } from "./fanProfilesScreen.js";
import { initAdminBackupScreen, renderAdminBackupScreen } from "./adminBackupScreen.js";
import {
  createRecoveryRequest,
  checkRecoveryRequestStatus,
  restoreFromBackup,
  createTransferCode,
  claimTransferCode,
  scheduleBackupSync,
} from "./backupSync.js";
import { syncPublicProfileIfEnabled } from "./publicProfileSync.js";
import { startFriendPresenceTracking } from "./presenceSync.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { getPlaylists } from "./playlists.js";
import { initPlaylistScreen, renderPlaylistList, renderPlaylistDetail } from "./playlistScreen.js";
import { initPlaylistAddSongsScreen, renderPlaylistAddSongsScreen } from "./playlistAddSongsScreen.js";
import { initContinuousPlayScreen, refreshContinuousPlayScreen } from "./continuousPlayScreen.js";
import { initContinuousPlayQueueScreen, renderQueueScreen } from "./continuousPlayQueueScreen.js";
import { initMiniPlayer } from "./miniPlayer.js";
import { handlePlayerChanged as handleContinuousPlayerChanged } from "./continuousPlay.js";
import {
  initNewSingleAnnouncement,
  confirmAnnouncementDone,
  recheckNewSingleAnnouncementAfterImport,
  resetAnnouncementDoneAndRecheck,
} from "./newSingleAnnouncement.js";

// センターお祝いポップアップのDOM要素参照と、「見た！」ボタンのイベント登録。
// 下の「センターお祝いポップアップの表示判定」より前に用意しておく必要があるため、
// ファイルの早い位置に置いている（module scriptはHTML全体の解析後に実行されるため、
// この位置でもDOM要素は問題なく取得できる）。
const centerCelebrationElements = {
  overlay: document.getElementById("center-celebration-overlay"),
  bgImage: document.querySelector("#center-celebration-overlay .celebration-bg"),
  thumbLink: document.getElementById("center-celebration-thumb-link"),
  thumbImage: document.getElementById("center-celebration-thumb"),
  mvButton: document.getElementById("center-celebration-mv-button"),
  seenButton: document.getElementById("center-celebration-seen-button"),
};
initCenterCelebration(centerCelebrationElements, SONGS);

// 初回セットアップが必要な新規ユーザーかどうかを、他のどの初期化よりも先に判定する
// （2026-08-15新設）。例えばこの下のinitPlayerScreen()は、内部でgetActivePlayer()を通じて
// 「equalLoveIntroQuiz.players」キーを自動生成する副作用を持つため、判定を後回しにすると
// 真の新規ユーザーまで「既存データがある」と誤検出してしまう。プレイヤーデータに触れる
// 初期化処理より前にこの判定を済ませておく必要がある（上のセンターお祝いポップアップ用の
// DOM参照・イベント登録はプレイヤーデータに一切触れないため、順序に影響しない）。
// 「戻る」導線を持たない専用画面のため、リロード・PWA再起動・画面外タップのいずれでも
// 回避できない（登録完了までshowScreen("start")は呼ばれない）。既存ユーザーはこの分岐に
// 入らず、今まで通りスタート画面がそのまま表示される。
if (needsOnboarding()) {
  showScreen("onboarding");
}

// センターお祝いポップアップの表示判定（2026-08-24新設、本人指示）。
// 「更新するボタンを押したから」ではなく「対象の楽曲データが揃っていて、まだこのプレイヤーが
// 見ていない」ことだけを条件にする。新規ユーザー（初回セットアップ中）には、まだ推しメン等の
// 登録も済んでいないため対象外にする（body.dataset.screenが"onboarding"のときは呼ばない）。
if (document.body.dataset.screen === "start") {
  showCenterCelebrationIfEligible(SONGS, getPlayerKeyPrefix(), centerCelebrationElements);
}

// 新曲追加のお知らせバナー（2026-08-27新設）。データ管理セクションの折りたたみを開いて
// スクロールする処理・確認モーダルの表示制御は、DOM構造の詳細（details要素であること等）を
// 知っているこちら側で担当し、js/newSingleAnnouncement.js自体はそれを知らなくてよいように
// している。
const newSingleAnnouncementElements = {
  banner: document.getElementById("new-single-announcement-banner"),
  titleText: document.getElementById("new-single-announcement-title-text"),
  bodyText: document.getElementById("new-single-announcement-body-text"),
  openButton: document.getElementById("new-single-announcement-open-button"),
  laterButton: document.getElementById("new-single-announcement-later-button"),
  doneButton: document.getElementById("new-single-announcement-done-button"),
};
const newSingleAnnouncementDoneConfirmModalElement = document.getElementById(
  "new-single-announcement-done-confirm-modal"
);
const newSingleAnnouncementDoneConfirmCancelButtonElement = document.getElementById(
  "new-single-announcement-done-confirm-cancel-button"
);
const newSingleAnnouncementDoneConfirmButtonElement = document.getElementById(
  "new-single-announcement-done-confirm-button"
);
const newSingleAnnouncementResetButtonElement = document.getElementById("new-single-announcement-reset-button");
const newSingleAnnouncementResetResultElement = document.getElementById("new-single-announcement-reset-result");

function openDataManagementSectionForAnnouncement() {
  const dataManagementSection = document.querySelector(".data-management-section");
  if (!dataManagementSection) return;
  dataManagementSection.open = true;
  dataManagementSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// 「追加済み・今後表示しない」の誤操作防止（2026-08-27追加、本人指示：実際に誤操作で
// お知らせを消してしまったとの報告を受けて）。ボタンを押しても即座には確定させず、
// 確認モーダルを開くだけにする。実際にmarkDone()するのは、モーダルの確定ボタンが
// 押されたときだけ（confirmAnnouncementDone()）。
initNewSingleAnnouncement(newSingleAnnouncementElements, {
  onOpenDataManagement: openDataManagementSectionForAnnouncement,
  onRequestDoneConfirmation: () => {
    newSingleAnnouncementDoneConfirmModalElement.hidden = false;
  },
});

newSingleAnnouncementDoneConfirmCancelButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  newSingleAnnouncementDoneConfirmModalElement.hidden = true;
});

newSingleAnnouncementDoneConfirmButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_CONFIRM);
  confirmAnnouncementDone(newSingleAnnouncementElements);
  newSingleAnnouncementDoneConfirmModalElement.hidden = true;
});

// 「21枚目のお知らせを再表示」（データ管理画面の開発者・上級者向けセクション、2026-08-27新設）。
// 誤って「追加済み・今後表示しない」を押してしまった場合のリセット操作。
newSingleAnnouncementResetButtonElement.addEventListener("click", async () => {
  const { reappeared } = await resetAnnouncementDoneAndRecheck(newSingleAnnouncementElements);
  newSingleAnnouncementResetResultElement.hidden = false;
  newSingleAnnouncementResetResultElement.textContent = reappeared
    ? "解除しました。ホーム画面上部にお知らせが再表示されます"
    : "解除しましたが、この端末は21枚目の音源が既に揃っているため、お知らせは表示されません";
});

// 背景のキラキラ演出は、ゲームの状態と関係なく最初に1回だけ生成すればよい。
renderBackgroundSparkles();

// 収録曲一覧画面の中身も、ゲームの状態と関係なく最初に1回だけ組み立てればよい。
renderSongList(SONGS);

// 効果音ON/OFFボタン（スタート画面・クイズ画面の2箇所、どちらも同じ端末共通の設定を操作する。
// 2026-08-06追加）。ボタンを押した本人にもクリック音で切替が分かるよう、ONにした瞬間だけ
// 確認のクリック音を鳴らす（OFFにした瞬間に鳴らすと「消したのに鳴った」と紛らわしいため）。
const sfxToggleButtonQuizElement = document.getElementById("sfx-toggle-button-quiz");
const sfxToggleButtonStartElement = document.getElementById("sfx-toggle-button-start");
const sfxToggleButtonStartLabelElement = document.getElementById("sfx-toggle-button-start-label");

function syncSfxToggleUI() {
  const enabled = isSfxEnabled();
  sfxToggleButtonQuizElement.classList.toggle("is-muted", !enabled);
  sfxToggleButtonQuizElement.setAttribute("aria-label", enabled ? "効果音を消す" : "効果音を鳴らす");
  sfxToggleButtonStartElement.classList.toggle("is-muted", !enabled);
  sfxToggleButtonStartElement.setAttribute("aria-label", enabled ? "効果音を消す" : "効果音を鳴らす");
  sfxToggleButtonStartLabelElement.textContent = enabled ? "ON" : "OFF";
  refreshSfxSettingsUI(); // 詳細設定モーダル側のマスタートグル表示も一致させる
}

function handleSfxToggleClick() {
  const enabledAfterToggle = toggleSfxEnabled();
  syncSfxToggleUI();
  if (enabledAfterToggle) playClickSound();
}

sfxToggleButtonQuizElement.addEventListener("click", handleSfxToggleClick);
sfxToggleButtonStartElement.addEventListener("click", handleSfxToggleClick);
syncSfxToggleUI();

// 効果音の詳細設定モーダル（2026-08-10新設）。テーマ・音量・UI音/ゲーム音の分離設定。
initSoundSettingsScreen({
  overlay: document.getElementById("sfx-settings-modal"),
  closeButton: document.getElementById("sfx-settings-modal-close"),
  openTriggers: [document.getElementById("sfx-settings-open-button")],
  masterToggle: document.getElementById("sfx-settings-master-toggle"),
  uiToggle: document.getElementById("sfx-settings-ui-toggle"),
  gameToggle: document.getElementById("sfx-settings-game-toggle"),
  themeList: document.getElementById("sfx-settings-theme-list"),
  volumeRange: document.getElementById("sfx-settings-volume-range"),
  volumeValue: document.getElementById("sfx-settings-volume-value"),
  // 【2026-09-26追加・本人指示：サウンドシステム全面整備】詳細設定（音ごとの個別変更）と
  // 楽曲音量。試聴ボタンはテーマカード内・詳細設定の各行に移したため、単体のpreviewButtonは
  // 廃止した。
  advancedList: document.getElementById("sfx-settings-advanced-list"),
  advancedBadge: document.getElementById("sfx-settings-advanced-badge"),
  resetOverridesButton: document.getElementById("sfx-settings-reset-overrides-button"),
  musicVolumeRange: document.getElementById("sfx-settings-music-volume-range"),
  musicVolumeValue: document.getElementById("sfx-settings-music-volume-value"),
  // モーダル内のマスタートグルを操作したときも、スタート画面のクイックトグル表示を一致させる。
  onMasterToggle: () => syncSfxToggleUI(),
});

const startScreenElement = document.getElementById("start-screen");
const quizScreenElement = document.getElementById("quiz-screen");
const startErrorElement = document.getElementById("start-error");
const questionCountNoticeElement = document.getElementById("question-count-notice");
const questionProgressElement = document.getElementById("question-progress");
const progressDotsElement = document.getElementById("progress-dots");
const choiceButtonElements = document.querySelectorAll(".choice-button");
const feedbackElement = document.getElementById("feedback");
const nextButtonElement = document.getElementById("next-button");
const skipButtonElement = document.getElementById("skip-button");
const revealButtonElement = document.getElementById("reveal-button");
const audioErrorElement = document.getElementById("audio-error");
const audioTroubleButtonElement = document.getElementById("audio-trouble-button");
// 【2026-09-16新設・本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・個人進行系）】
const onlineBattleAudioTroubleButtonElement = document.getElementById("online-battle-audio-trouble-button");
const timerDisplayElement = document.getElementById("timer-display");
const totalScoreElement = document.getElementById("total-score-display");
const rankElement = document.getElementById("rank-display");
const rankLetterElement = document.getElementById("rank-letter");
const highScoreElement = document.getElementById("high-score-display");
const newRecordElement = document.getElementById("new-record-badge");
const averageResponseTimeDisplayElement = document.getElementById("average-response-time-display");
const speedProgressContainerElement = document.getElementById("speed-progress-container");
const resultLeaderboardStatusElement = document.getElementById("result-leaderboard-status");
// 【2026-08-29追加】合計タイム・平均回答時間（全問対象）・自己ベスト（追加1・追加4）と、
// ランキングへの入口（追加3）。
const resultTotalTimeBlockElement = document.getElementById("result-total-time-block");
const resultTotalTimeDisplayElement = document.getElementById("result-total-time-display");
const resultTotalTimeAverageDisplayElement = document.getElementById("result-total-time-average-display");
const resultTotalTimeBestDisplayElement = document.getElementById("result-total-time-best-display");
const resultLeaderboardLinkElement = document.getElementById("result-leaderboard-link");
const answerLogListElement = document.getElementById("answer-log-list");
const resultEyebrowLabelElement = document.getElementById("result-eyebrow-label");
const missedSongsSectionElement = document.getElementById("missed-songs-section");
const missedSongsChipRowElement = document.getElementById("missed-songs-chip-row");
const reviewMissedSongsButtonElement = document.getElementById("review-missed-songs-button");
const returnToNormalButtonElement = document.getElementById("return-to-normal-button");
const retryButtonElement = document.getElementById("retry-button");
const modeBestChipElement = document.getElementById("mode-best-chip");
const modeBestConditionElement = document.getElementById("mode-best-condition");
const modeBestValueElement = document.getElementById("mode-best-value");
const rulesLinkElement = document.getElementById("rules-link");
const rulesModalElement = document.getElementById("rules-modal");
const rulesModalCloseButtonElement = document.getElementById("rules-modal-close");
const songlistLinkElement = document.getElementById("songlist-link");
const songlistTileDescElement = document.getElementById("songlist-tile-desc");
const songlistFavoritesLinkElement = document.getElementById("songlist-favorites-link");
const listenTileFavoritesCountElement = document.getElementById("listen-tile-favorites-count");
const listenTilePlaylistCountElement = document.getElementById("listen-tile-playlist-count");
const songlistBackButtonElement = document.getElementById("songlist-back-button");
const addToPlaylistModalElement = document.getElementById("add-to-playlist-modal");
// オンライン対戦：「出題する曲」をプレイリストから選ぶモーダル（2026-08-27新設）。
const onlineBattlePlaylistPickerModalElement = document.getElementById("online-battle-playlist-picker-modal");
const onlineBattlePlaylistPickerCloseButtonElement = document.getElementById("online-battle-playlist-picker-close-button");
const onlineBattlePlaylistPickerListElement = document.getElementById("online-battle-playlist-picker-list");
const onlineBattlePlaylistPickerEmptyNoticeElement = document.getElementById("online-battle-playlist-picker-empty-notice");
// オンライン対戦：「お気に入り／プレイリストから選ぶ」の確認モーダル（2026-08-28新設）。
const onlineBattleSongListConfirmModalElement = document.getElementById("online-battle-song-list-confirm-modal");
const onlineBattleSongListConfirmCloseButtonElement = document.getElementById("online-battle-song-list-confirm-close-button");
const onlineBattleSongListConfirmTitleElement = document.getElementById("online-battle-song-list-confirm-title");
const onlineBattleSongListConfirmSubtitleElement = document.getElementById("online-battle-song-list-confirm-subtitle");
const onlineBattleSongListConfirmListElement = document.getElementById("online-battle-song-list-confirm-list");
const onlineBattleSongListConfirmEmptyNoticeElement = document.getElementById("online-battle-song-list-confirm-empty-notice");
const onlineBattleSongListConfirmAddMoreButtonElement = document.getElementById("online-battle-song-list-confirm-add-more-button");
const onlineBattleSongListConfirmConfirmButtonElement = document.getElementById("online-battle-song-list-confirm-confirm-button");
const playlistLinkElement = document.getElementById("playlist-link");
const playlistBackButtonElement = document.getElementById("playlist-back-button");
const playlistListElement = document.getElementById("playlist-list");
const playlistEmptyNoticeElement = document.getElementById("playlist-empty-notice");
const playlistCreateInputElement = document.getElementById("playlist-create-input");
const playlistCreateButtonElement = document.getElementById("playlist-create-button");
const playlistDeleteConfirmModalElement = document.getElementById("playlist-delete-confirm-modal");
const playlistDeleteCancelButtonElement = document.getElementById("playlist-delete-cancel-button");
const playlistDeleteConfirmButtonElement = document.getElementById("playlist-delete-confirm-button");
const playlistDetailBackButtonElement = document.getElementById("playlist-detail-back-button");
const playlistDetailNameElement = document.getElementById("playlist-detail-name");
const playlistDetailCountElement = document.getElementById("playlist-detail-count");
const playlistDetailListElement = document.getElementById("playlist-detail-list");
const playlistDetailEmptyStateElement = document.getElementById("playlist-detail-empty-state");
const playlistDetailAddSongsButtonElement = document.getElementById("playlist-detail-add-songs-button");
// プレイリストへの曲追加画面が、今どのプレイリストを対象にしているか（「戻る」で
// どの詳細画面に戻るかの判断にも使う。UI/UX再設計で追加）。
let playlistAddSongsTargetId = null;
const playlistAddSongsBackButtonElement = document.getElementById("playlist-add-songs-back-button");
const playlistAddSongsTitleElement = document.getElementById("playlist-add-songs-title");
const playlistAddSongsGroupsElement = document.getElementById("playlist-add-songs-groups");
const playlistAddSongsNoResultsNoticeElement = document.getElementById("playlist-add-songs-no-results-notice");
const playlistAddSongsSearchInputElement = document.getElementById("playlist-add-songs-search-input");
const playlistAddSongsSearchClearButtonElement = document.getElementById("playlist-add-songs-search-clear-button");
const playlistAddSongsSelectedCountElement = document.getElementById("playlist-add-songs-selected-count");
const playlistAddSongsSubmitButtonElement = document.getElementById("playlist-add-songs-submit-button");
const playlistAddSongsActionBannerElement = document.getElementById("playlist-add-songs-action-banner");
const continuousPlayLinkElement = document.getElementById("continuous-play-link");
const continuousPlayBackButtonElement = document.getElementById("continuous-play-back-button");
const continuousPlaySettingsIconButtonElement = document.getElementById("continuous-play-settings-icon-button");
const continuousPlaySettingsToggleElement = document.getElementById("continuous-play-settings-toggle");
const continuousPlaySettingsSummaryElement = document.getElementById("continuous-play-settings-summary");
const continuousPlaySettingsPanelElement = document.getElementById("continuous-play-settings-panel");
const continuousPlaySourceButtonElements = [
  ...document.querySelectorAll(".continuous-play-source-button"),
];
const continuousPlaySourceExplainElement = document.getElementById("continuous-play-source-explain");
const continuousPlayOrderButtonElements = [
  ...document.querySelectorAll(".continuous-play-order-button"),
];
const continuousPlayOrderExplainElement = document.getElementById("continuous-play-order-explain");
const continuousPlayRepeatButtonElement = document.getElementById("continuous-play-repeat-button");
const continuousPlayFavoritesBlockElement = document.getElementById("continuous-play-favorites-block");
const continuousPlayFavoritesOkElement = document.getElementById("continuous-play-favorites-ok");
const continuousPlayFavoritesEmptyElement = document.getElementById("continuous-play-favorites-empty");
const continuousPlayFavoritesExploreButtonElement = document.getElementById(
  "continuous-play-favorites-explore-button"
);
const continuousPlayPlaylistBlockElement = document.getElementById("continuous-play-playlist-block");
const continuousPlayPlaylistSummaryElement = document.getElementById("continuous-play-playlist-summary");
const continuousPlayPlaylistSummaryTextElement = document.getElementById(
  "continuous-play-playlist-summary-text"
);
const continuousPlayPlaylistPickerElement = document.getElementById("continuous-play-playlist-picker");
const continuousPlayPlaylistEmptyNoticeElement = document.getElementById(
  "continuous-play-playlist-empty-notice"
);
const continuousPlayApplyButtonElement = document.getElementById("continuous-play-apply-button");
const continuousPlayEmptyMessageElement = document.getElementById("continuous-play-empty-message");
const continuousPlayPositionElement = document.getElementById("continuous-play-position");
const continuousPlaySongTitleElement = document.getElementById("continuous-play-song-title");
const continuousPlaySongMetaElement = document.getElementById("continuous-play-song-meta");
const continuousPlayStatusTextElement = document.getElementById("continuous-play-status-text");
const continuousPlayNoticeElement = document.getElementById("continuous-play-notice");
const continuousPlaySeekRowElement = document.querySelector("#continuous-play-screen .continuous-play-seek-row");
const continuousPlaySeekRangeElement = document.getElementById("continuous-play-seek-range");
const continuousPlayCurrentTimeElement = document.getElementById("continuous-play-current-time");
const continuousPlayDurationElement = document.getElementById("continuous-play-duration");
const continuousPlayControlsElement = document.querySelector("#continuous-play-screen .continuous-play-controls");
const continuousPlayToggleButtonElement = document.getElementById("continuous-play-toggle-button");
const continuousPlayPrevButtonElement = document.getElementById("continuous-play-prev-button");
const continuousPlayNextButtonElement = document.getElementById("continuous-play-next-button");
const continuousPlayLyricsSectionElement = document.getElementById("continuous-play-lyrics-section");
const continuousPlayLyricsPanelElement = document.getElementById("continuous-play-lyrics-panel");
const continuousPlayLyricsFullscreenButtonElement = document.getElementById(
  "continuous-play-lyrics-fullscreen-button"
);
const continuousPlayNextCardElement = document.getElementById("continuous-play-next-card");
const continuousPlayNextTitleElement = document.getElementById("continuous-play-next-title");
const continuousPlayQueueLinkElement = document.getElementById("continuous-play-queue-link");
const continuousPlayQueueLinkCountElement = document.getElementById("continuous-play-queue-link-count");
const continuousPlayQueueBackButtonElement = document.getElementById("continuous-play-queue-back-button");
const continuousPlayQueueSourceChipElement = document.getElementById("continuous-play-queue-source-chip");
const continuousPlayQueueListElement = document.getElementById("continuous-play-queue-list");
const continuousPlayQueueActionBannerElement = document.getElementById(
  "continuous-play-queue-action-banner"
);
const songlistContinuousPlayLinkElement = document.getElementById("songlist-continuous-play-link");
const miniPlayerRootElement = document.getElementById("mini-player");
const miniPlayerMainElement = document.getElementById("mini-player-main");
const miniPlayerTitleElement = document.getElementById("mini-player-title");
const miniPlayerStatusElement = document.getElementById("mini-player-status");
const miniPlayerTimeElement = document.getElementById("mini-player-time");
const miniPlayerToggleButtonElement = document.getElementById("mini-player-toggle-button");
const miniPlayerStopButtonElement = document.getElementById("mini-player-stop-button");
const playlistDetailContinuousPlayButtonElement = document.getElementById(
  "playlist-detail-continuous-play-button"
);
// 連続再生画面を開く直前の画面名。「戻る」でここへ戻る（10-33章、1画面化に伴い追加）。
let continuousPlayReturnScreen = "start";

// 画面を離れるときのスクロール位置を覚えておき、戻ってきたときに同じ位置へ復元する仕組み。
// screens.js（showScreen自体）は変更せず、main.js側だけで完結する薄いラッパーとして実装する
// （「連続再生の戻り先を1つだけ覚えておく」continuousPlayReturnScreenと同じ考え方。
// UI/UX再設計：スタート画面下部の各機能を開いて戻ると一番上に戻ってしまうのがストレスという
// フィードバックを受けて追加。スタート⇄各機能画面、プレイリスト一覧⇄詳細、
// プレイリスト詳細⇄曲追加、連続再生⇄再生キュー、の行き来に使う）。
const screenScrollPositions = new Map();
function navigateWithScrollMemory(targetScreen) {
  const fromScreen = document.body.dataset.screen;
  screenScrollPositions.set(fromScreen, window.scrollY);
  showScreen(targetScreen);
  window.scrollTo(0, screenScrollPositions.get(targetScreen) || 0);
  if (targetScreen === "start") {
    updateListenTileCounts();
  }
}

// スタート画面「曲を聴く」タイルの、お気に入り・プレイリストの現在数を最新にする。
// お気に入り・プレイリストはプレイヤーごとのデータのため、スタート画面へ戻るたびに
// 描き直す（プレイヤー切替時はonPlayerChangedからも呼ぶ）。
function updateListenTileCounts() {
  listenTileFavoritesCountElement.textContent = `${getFavoriteSongIds().length}曲`;
  listenTilePlaylistCountElement.textContent = `${getPlaylists().length}個`;
}
const titleEventListElement = document.getElementById("title-event-list");
const titleListLinkFromResultElement = document.getElementById("title-list-link-from-result");
const titleListLinkElement = document.getElementById("title-list-link");
const titleListModalElement = document.getElementById("title-list-modal");
const titleListModalCardElement = titleListModalElement.querySelector(".modal-card");
const titleListModalCloseButtonElement = document.getElementById("title-list-modal-close");
const titleListContainerElement = document.getElementById("title-list-container");
const historyLinkElement = document.getElementById("history-link");
const historyBackButtonElement = document.getElementById("history-back-button");
const historyClearConfirmModalElement = document.getElementById("history-clear-confirm-modal");
const historyDetailBackButtonElement = document.getElementById("history-detail-back-button");
// 詳細画面を開く直前の、履歴一覧のスクロール位置。「戻る」で一覧に戻ったときに復元する。
let historyListScrollY = 0;
// タイムアタック履歴一覧についても、通常プレイ履歴と同じ考え方でスクロール位置を覚えておく。
let timeAttackHistoryListScrollY = 0;
const specialModesBackButtonElement = document.getElementById("special-modes-back-button");
const guideLinkElement = document.getElementById("guide-link");
const homeLeaderboardLinkElement = document.getElementById("home-leaderboard-link");
const guideBackButtonElement = document.getElementById("guide-back-button");
const guideTocViewElement = document.getElementById("guide-toc-view");
const guideDetailViewElement = document.getElementById("guide-detail-view");
const guideTocGroupsElement = document.getElementById("guide-toc-groups");
const guideDetailBackButtonElement = document.getElementById("guide-detail-back-button");
const guideDetailBackButtonBottomElement = document.getElementById("guide-detail-back-button-bottom");
const guideDetailIconElement = document.getElementById("guide-detail-icon");
const guideDetailTitleElement = document.getElementById("guide-detail-title");
const guideDetailTaglineElement = document.getElementById("guide-detail-tagline");
const guideDetailStepsHeadingElement = document.getElementById("guide-detail-steps-heading");
const guideDetailStepsElement = document.getElementById("guide-detail-steps");
const guideDetailPointElement = document.getElementById("guide-detail-point");
const fanProfilesLinkElement = document.getElementById("fan-profiles-link");
const fanProfilesBackButtonElement = document.getElementById("fan-profiles-back-button");
const fanProfilesSharingToggleElement = document.getElementById("fan-profiles-sharing-toggle");
const fanProfilesSharingToggleLabelElement = document.getElementById("fan-profiles-sharing-toggle-label");
const fanProfilesRankingSyncStatusElement = document.getElementById("fan-profiles-ranking-sync-status");
const fanProfilesListElement = document.getElementById("fan-profiles-list");
const fanProfileDetailOverlayElement = document.getElementById("fan-profile-detail-modal");
const fanProfileDetailCloseButtonElement = document.getElementById("fan-profile-detail-close");
const fanProfileDetailSwatchElement = document.getElementById("fan-profile-detail-swatch");
const fanProfileDetailNameElement = document.getElementById("fan-profile-detail-name");
const fanProfileDetailOshiElement = document.getElementById("fan-profile-detail-oshi");
// 称号だけに特化した再設計（2026-08-29、本人指示：ランキング順位は載せない）で追加した要素。
const fanProfileDetailAchievementCountElement = document.getElementById("fan-profile-detail-achievement-count");
const fanProfileDetailSummaryElement = document.getElementById("fan-profile-detail-summary");
const fanProfileDetailAllToggleElement = document.getElementById("fan-profile-detail-all-toggle");
const fanProfileDetailAchievementsElement = document.getElementById("fan-profile-detail-achievements");
// フレンドページ自体のヘッダーにある「🏅称号一覧」（2026-08-29改訂・本人指示：
// フレンド1人ずつの詳細モーダルからこちらへ移動した）。既存の称号一覧モーダルを開く
// トリガーの1つとして、下のinitAchievementListModal(openTriggers)に加える。
const fanProfilesTitleListLinkElement = document.getElementById("fan-profiles-title-list-link");
// 個人プロフィールモーダル側にも重ねて置いた「🏅称号一覧」（2026-08-29追加・本人指示）。
// 役割は上と全く同じ（このプレイヤー個人のデータは使わず、ゲーム全体の称号一覧を開くだけ）
// なので、同じopenTriggers配列に加えるだけでよい。
const fanProfileDetailTitleListLinkElement = document.getElementById("fan-profile-detail-title-list-link");
const fanProfilesMyUidElement = document.getElementById("fan-profiles-my-uid");
const adminBackupLinkButtonElement = document.getElementById("admin-backup-link");
// 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
const debugAudioLogLinkButtonElement = document.getElementById("debug-audio-log-link");
const fanProfilesAdminDeleteOverlayElement = document.getElementById("fan-profiles-admin-delete-confirm-modal");
const fanProfilesAdminDeleteTargetNameElement = document.getElementById("fan-profiles-admin-delete-target-name");
const fanProfilesAdminDeleteCancelButtonElement = document.getElementById("fan-profiles-admin-delete-cancel-button");
const fanProfilesAdminDeleteConfirmButtonElement = document.getElementById("fan-profiles-admin-delete-confirm-button");

// 管理者専用「バックアップ管理」画面（2026-08-29新設）。
const adminBackupBackButtonElement = document.getElementById("admin-backup-back-button");
// 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
const debugAudioLogBackButtonElement = document.getElementById("debug-audio-log-back-button");
const debugAudioLogRefreshButtonElement = document.getElementById("debug-audio-log-refresh-button");
const debugAudioLogCopyButtonElement = document.getElementById("debug-audio-log-copy-button");
const debugAudioLogClearButtonElement = document.getElementById("debug-audio-log-clear-button");
const debugAudioLogStatusElement = document.getElementById("debug-audio-log-status");
const debugAudioLogCountElement = document.getElementById("debug-audio-log-count");
const debugAudioLogTextareaElement = document.getElementById("debug-audio-log-textarea");
const adminBackupRefreshButtonElement = document.getElementById("admin-backup-refresh-button");
const adminBackupStatusElement = document.getElementById("admin-backup-status");
const adminRecoveryRequestsListElement = document.getElementById("admin-recovery-requests-list");
const adminBackupsListElement = document.getElementById("admin-backups-list");
const adminBackupsSearchInputElement = document.getElementById("admin-backups-search-input");
const adminBackupsUnnamedOnlyCheckboxElement = document.getElementById("admin-backups-unnamed-only-checkbox");
const adminBackupsSelectAllButtonElement = document.getElementById("admin-backups-select-all-button");
const adminBackupsClearSelectionButtonElement = document.getElementById("admin-backups-clear-selection-button");
const adminBackupsSelectionStatusElement = document.getElementById("admin-backups-selection-status");
const adminBackupsBulkDeleteButtonElement = document.getElementById("admin-backups-bulk-delete-button");
const adminBackupsBulkDeleteResultElement = document.getElementById("admin-backups-bulk-delete-result");
const adminCheckAtRiskButtonElement = document.getElementById("admin-check-at-risk-button");
const adminAtRiskStatusElement = document.getElementById("admin-at-risk-status");
const adminAtRiskListElement = document.getElementById("admin-at-risk-list");

// データ管理画面の「機種変更・データ引き継ぎ」（2026-08-29新設）。
const deviceTransferIssueButtonElement = document.getElementById("device-transfer-issue-button");
const deviceTransferCodePanelElement = document.getElementById("device-transfer-code-panel");
const deviceTransferCodeDisplayElement = document.getElementById("device-transfer-code-display");
const deviceTransferCodeExpiryElement = document.getElementById("device-transfer-code-expiry");
const deviceTransferCopyButtonElement = document.getElementById("device-transfer-copy-button");
const deviceTransferCopyFeedbackElement = document.getElementById("device-transfer-copy-feedback");
const deviceTransferIssueResultElement = document.getElementById("device-transfer-issue-result");
const deviceTransferCodeInputElement = document.getElementById("device-transfer-code-input");
const deviceTransferClaimButtonElement = document.getElementById("device-transfer-claim-button");
const deviceTransferClaimResultElement = document.getElementById("device-transfer-claim-result");

// データ管理画面の「データを復旧する」（2026-08-29新設）。
const dataRecoveryRequestButtonElement = document.getElementById("data-recovery-request-button");
const dataRecoveryCodePanelElement = document.getElementById("data-recovery-code-panel");
const dataRecoveryCodeDisplayElement = document.getElementById("data-recovery-code-display");
const dataRecoveryCheckButtonElement = document.getElementById("data-recovery-check-button");
const dataRecoveryResultElement = document.getElementById("data-recovery-result");

const weakSongsBackButtonElement = document.getElementById("weak-songs-back-button");
const weakSongsCountNoticeElement = document.getElementById("weak-songs-count-notice");
const liveCallModeListBackButtonElement = document.getElementById("live-call-mode-list-back-button");
const liveCallModePlayerBackButtonElement = document.getElementById("live-call-mode-player-back-button");
const liveCallModeSongListElement = document.getElementById("live-call-mode-song-list");
const liveCallModeListEmptyStateElement = document.getElementById("live-call-mode-list-empty-state");
const liveCallModeSongTitleElement = document.getElementById("live-call-mode-song-title");
const liveCallModePlayButtonElement = document.getElementById("live-call-mode-play-button");
const liveCallModeSeekRangeElement = document.getElementById("live-call-mode-seek-range");
const liveCallModeCurrentTimeElement = document.getElementById("live-call-mode-current-time");
const liveCallModeDurationElement = document.getElementById("live-call-mode-duration");
const liveCallModeSeekBackButtonElement = document.getElementById("live-call-mode-seek-back-button");
const liveCallModeAudioElement = document.getElementById("live-call-mode-audio");
const liveCallModeLyricsPanelElement = document.getElementById("live-call-mode-lyrics-panel");
const liveCallModeFullscreenButtonElement = document.getElementById("live-call-mode-fullscreen-button");
const liveCallModeNoLyricsNoticeElement = document.getElementById("live-call-mode-no-lyrics-notice");
const liveCallModePlayerHelpLinkElement = document.getElementById("live-call-mode-player-help-link");
const liveCallModeGuideButtonElement = document.getElementById("live-call-mode-guide-button");
const liveCallModeListHelpLinkElement = document.getElementById("live-call-mode-list-help-link");
const liveCallModeListGuideButtonElement = document.getElementById("live-call-mode-list-guide-button");

// ライブコールモード：再生方法選択画面（2026-08-09新設）。
const liveCallPlayTypeBackButtonElement = document.getElementById("live-call-play-type-back-button");
const liveCallPlayTypeSongTitleElement = document.getElementById("live-call-play-type-song-title");
const liveCallPlayTypeNormalButtonElement = document.getElementById("live-call-play-type-normal-button");
const liveCallPlayTypeKaraokeButtonElement = document.getElementById("live-call-play-type-karaoke-button");

// ライブコールモード：カラオケ同期・初心者ナビ画面（2026-08-09新設、UI/UX第3版で
// 「カラオケ中専用HUD」へ全面再設計）。
const karaokeBackButtonElement = document.getElementById("karaoke-back-button");
const karaokeMoreMenuButtonElement = document.getElementById("karaoke-more-menu-button");
const karaokeHelpLinkElement = document.getElementById("karaoke-help-link");
const karaokeSongTitleElement = document.getElementById("karaoke-song-title");
const karaokeNoCallsNoticeElement = document.getElementById("karaoke-no-calls-notice");
const karaokeStartPanelElement = document.getElementById("karaoke-start-panel");
const karaokeStartButtonElement = document.getElementById("karaoke-start-button");
const karaokeDeviceAudioNoticeElement = document.getElementById("karaoke-device-audio-notice");
const karaokeSyncPanelElement = document.getElementById("karaoke-sync-panel");
const karaokeLyricsContextPanelElement = document.getElementById("karaoke-lyrics-context-panel");
const karaokeCallHudCardElement = document.getElementById("karaoke-call-hud-card");
const karaokeCallHudEyebrowElement = document.getElementById("karaoke-call-hud-eyebrow");
const karaokeCallHudTextElement = document.getElementById("karaoke-call-hud-text");
const karaokeCallHudCountdownElement = document.getElementById("karaoke-call-hud-countdown");
const karaokeCallHudPreviewRowElement = document.getElementById("karaoke-call-hud-preview-row");
const karaokeCallHudPreviewItem1Element = document.getElementById("karaoke-call-hud-preview-item-1");
const karaokeCallHudPreviewItem2Element = document.getElementById("karaoke-call-hud-preview-item-2");
const karaokeSongEndBannerElement = document.getElementById("karaoke-song-end-banner");
const karaokeSongEndRestartButtonElement = document.getElementById("karaoke-song-end-restart-button");
const karaokeSongEndChooseButtonElement = document.getElementById("karaoke-song-end-choose-button");
const karaokeDeviceAudioElement = document.getElementById("karaoke-device-audio");
const karaokeFooterZoneElement = document.getElementById("karaoke-footer-zone");
const karaokeToastElement = document.getElementById("karaoke-toast");
const karaokePauseResumeButtonElement = document.getElementById("karaoke-pause-resume-button");
const karaokePauseResumeLabelElement = document.getElementById("karaoke-pause-resume-label");
const karaokeOffsetMinus05ButtonElement = document.getElementById("karaoke-offset-minus-05-button");
const karaokeOffsetMinus01ButtonElement = document.getElementById("karaoke-offset-minus-01-button");
const karaokeOffsetResetButtonElement = document.getElementById("karaoke-offset-reset-button");
const karaokeOffsetPlus01ButtonElement = document.getElementById("karaoke-offset-plus-01-button");
const karaokeOffsetPlus05ButtonElement = document.getElementById("karaoke-offset-plus-05-button");
const karaokeOffsetLabelElement = document.getElementById("karaoke-offset-label");
const karaokeMoreMenuModalElement = document.getElementById("karaoke-more-menu-modal");
const karaokeMoreMenuCloseButtonElement = document.getElementById("karaoke-more-menu-close");
const karaokeNowButtonElement = document.getElementById("karaoke-now-button");
const karaokeSyncPointLabelElement = document.getElementById("karaoke-sync-point-label");
const karaokeBeginnerNavToggleButtonElement = document.getElementById("karaoke-beginner-nav-toggle-button");
const karaokeBeginnerNavToggleLabelElement = document.getElementById("karaoke-beginner-nav-toggle-label");
const karaokeRestartSongButtonElement = document.getElementById("karaoke-restart-song-button");
const timeAttackSetupBackButtonElement = document.getElementById("time-attack-setup-back-button");
const timeAttackStartButtonElement = document.getElementById("time-attack-start-button");
const timeAttackStartErrorElement = document.getElementById("time-attack-start-error");
const timeAttackBestChipElement = document.getElementById("time-attack-best-chip");
const timeAttackResultNewRecordElement = document.getElementById("time-attack-result-new-record");
const timeAttackResultFailStatusElement = document.getElementById("time-attack-result-fail-status");
const timeAttackResultTotalTimeElement = document.getElementById("time-attack-result-total-time");
const timeAttackResultCorrectCountElement = document.getElementById("time-attack-result-correct-count");
const timeAttackResultMissCountElement = document.getElementById("time-attack-result-miss-count");
const timeAttackResultRuleLabelElement = document.getElementById("time-attack-result-rule-label");
const timeAttackResultAverageTimeElement = document.getElementById("time-attack-result-average-time");
const timeAttackResultSpeedProgressElement = document.getElementById("time-attack-result-speed-progress");
const timeAttackResultBestTimeElement = document.getElementById("time-attack-result-best-time");
const timeAttackResultLeaderboardStatusElement = document.getElementById("time-attack-result-leaderboard-status");
const timeAttackResultAchievementListElement = document.getElementById("time-attack-result-achievement-list");
const timeAttackResultAchievementListLinkElement = document.getElementById("time-attack-result-achievement-list-link");
const timeAttackResultRetryButtonElement = document.getElementById("time-attack-result-retry-button");
const timeAttackResultSetupButtonElement = document.getElementById("time-attack-result-setup-button");
const timeAttackResultHomeLinkElement = document.getElementById("time-attack-result-home-link");
const timeAttackResultLeaderboardLinkElement = document.getElementById("time-attack-result-leaderboard-link");
const timeAttackHistoryLinkElement = document.getElementById("time-attack-history-link");
const timeAttackHistoryBackButtonElement = document.getElementById("time-attack-history-back-button");
const timeAttackHistoryEmptyStateElement = document.getElementById("time-attack-history-empty-state");
const timeAttackHistoryListElement = document.getElementById("time-attack-history-list");
const timeAttackHistoryDetailBackButtonElement = document.getElementById("time-attack-history-detail-back-button");
const timeAttackLeaderboardLinkElement = document.getElementById("time-attack-leaderboard-link");
const timeAttackLeaderboardBackButtonElement = document.getElementById("time-attack-leaderboard-back-button");
const timeAttackLeaderboardVariantTabsElement = document.getElementById("time-attack-leaderboard-variant-tabs");
const timeAttackLeaderboardQuestionCountTabsElement = document.getElementById(
  "time-attack-leaderboard-question-count-tabs"
);
const timeAttackLeaderboardCategoryTabsElement = document.getElementById("time-attack-leaderboard-category-tabs");
const timeAttackLeaderboardLoadingElement = document.getElementById("time-attack-leaderboard-loading");
const timeAttackLeaderboardOfflineElement = document.getElementById("time-attack-leaderboard-offline");
const timeAttackLeaderboardEmptyElement = document.getElementById("time-attack-leaderboard-empty");
const timeAttackLeaderboardListElement = document.getElementById("time-attack-leaderboard-list");
const timeAttackLeaderboardMyRecordElement = document.getElementById("time-attack-leaderboard-my-record");
const timeAttackLeaderboardMyRecordTextElement = document.getElementById("time-attack-leaderboard-my-record-text");
const timeAttackLeaderboardAdminDeleteOverlayElement = document.getElementById(
  "time-attack-leaderboard-admin-delete-confirm-modal"
);
const timeAttackLeaderboardAdminDeleteNameElement = document.getElementById("time-attack-leaderboard-admin-delete-name");
const timeAttackLeaderboardAdminDeleteTimeElement = document.getElementById("time-attack-leaderboard-admin-delete-time");
const timeAttackLeaderboardAdminDeleteVariantElement = document.getElementById(
  "time-attack-leaderboard-admin-delete-variant"
);
const timeAttackLeaderboardAdminDeleteQuestionCountElement = document.getElementById(
  "time-attack-leaderboard-admin-delete-question-count"
);
const timeAttackLeaderboardAdminDeleteCategoryElement = document.getElementById(
  "time-attack-leaderboard-admin-delete-category"
);
const timeAttackLeaderboardAdminDeleteCancelButtonElement = document.getElementById(
  "time-attack-leaderboard-admin-delete-cancel-button"
);
const timeAttackLeaderboardAdminDeleteConfirmButtonElement = document.getElementById(
  "time-attack-leaderboard-admin-delete-confirm-button"
);
const randomPlaybackSetupBackButtonElement = document.getElementById("random-playback-setup-back-button");
const randomPlaybackStartButtonElement = document.getElementById("random-playback-start-button");
const randomPlaybackStartErrorElement = document.getElementById("random-playback-start-error");
const randomPlaybackBestChipElement = document.getElementById("random-playback-best-chip");
const randomPlaybackResultNewRecordElement = document.getElementById("random-playback-result-new-record");
const randomPlaybackResultFailStatusElement = document.getElementById("random-playback-result-fail-status");
const randomPlaybackResultTotalTimeElement = document.getElementById("random-playback-result-total-time");
const randomPlaybackResultCorrectCountElement = document.getElementById("random-playback-result-correct-count");
const randomPlaybackResultMissCountElement = document.getElementById("random-playback-result-miss-count");
const randomPlaybackResultRuleLabelElement = document.getElementById("random-playback-result-rule-label");
const randomPlaybackResultAverageTimeElement = document.getElementById("random-playback-result-average-time");
const randomPlaybackResultSpeedProgressElement = document.getElementById("random-playback-result-speed-progress");
const randomPlaybackResultBestTimeElement = document.getElementById("random-playback-result-best-time");
const randomPlaybackResultLeaderboardStatusElement = document.getElementById("random-playback-result-leaderboard-status");
const randomPlaybackResultAchievementListElement = document.getElementById("random-playback-result-achievement-list");
const randomPlaybackResultAchievementListLinkElement = document.getElementById(
  "random-playback-result-achievement-list-link"
);
const randomPlaybackResultRetryButtonElement = document.getElementById("random-playback-result-retry-button");
const randomPlaybackResultSetupButtonElement = document.getElementById("random-playback-result-setup-button");
const randomPlaybackResultHomeLinkElement = document.getElementById("random-playback-result-home-link");

// 歌詞クイズモード（1人用MVP）の画面要素一式（2026-08-09新設）。
const lyricsQuizSetupBackButtonElement = document.getElementById("lyrics-quiz-setup-back-button");
const lyricsQuizStartButtonElement = document.getElementById("lyrics-quiz-start-button");
const lyricsQuizStartErrorElement = document.getElementById("lyrics-quiz-start-error");
const lyricsQuizBestChipElement = document.getElementById("lyrics-quiz-best-chip");
const lyricsQuizProgressElement = document.getElementById("lyrics-quiz-progress");
const lyricsQuizElapsedTimeElement = document.getElementById("lyrics-quiz-elapsed-time");
const lyricsQuizHintLevelElement = document.getElementById("lyrics-quiz-hint-level");
const lyricsQuizHintLevelNavElement = document.getElementById("lyrics-quiz-hint-level-nav");
const lyricsQuizHintListElement = document.getElementById("lyrics-quiz-hint-list");
const lyricsQuizNextHintButtonElement = document.getElementById("lyrics-quiz-next-hint-button");
const lyricsQuizSkipButtonElement = document.getElementById("lyrics-quiz-skip-button");
const lyricsQuizAnswerSearchRowElement = document.getElementById("lyrics-quiz-answer-search-row");
const lyricsQuizAnswerSearchInputElement = document.getElementById("lyrics-quiz-answer-search-input");
const lyricsQuizAnswerCountElement = document.getElementById("lyrics-quiz-answer-count");
const lyricsQuizAnswerJumpBarElement = document.getElementById("lyrics-quiz-answer-jump-bar");
const lyricsQuizAnswerListElement = document.getElementById("lyrics-quiz-answer-list");
const lyricsQuizAnswerSectionElement = document.getElementById("lyrics-quiz-answer-section");
const lyricsQuizAnswerRevealElement = document.getElementById("lyrics-quiz-answer-reveal");
const lyricsQuizAnswerRevealStatusElement = document.getElementById("lyrics-quiz-answer-reveal-status");
const lyricsQuizAnswerRevealTitleElement = document.getElementById("lyrics-quiz-answer-reveal-title");
const lyricsQuizAnswerRevealMetaElement = document.getElementById("lyrics-quiz-answer-reveal-meta");
const lyricsQuizAnswerRevealNextButtonElement = document.getElementById("lyrics-quiz-answer-reveal-next-button");
const lyricsQuizBackButtonElement = document.getElementById("lyrics-quiz-back-button");
const lyricsQuizBackButtonLabelElement = document.getElementById("lyrics-quiz-back-button-label");
const lyricsQuizQuitConfirmModalElement = document.getElementById("lyrics-quiz-quit-confirm-modal");
const lyricsQuizQuitCancelButtonElement = document.getElementById("lyrics-quiz-quit-cancel-button");
const lyricsQuizQuitRestartButtonElement = document.getElementById("lyrics-quiz-quit-restart-button");
const lyricsQuizQuitConfirmButtonElement = document.getElementById("lyrics-quiz-quit-confirm-button");
const lyricsQuizResultHomeLinkElement = document.getElementById("lyrics-quiz-result-home-link");
const lyricsQuizResultNewRecordElement = document.getElementById("lyrics-quiz-result-new-record");
const lyricsQuizResultCorrectCountElement = document.getElementById("lyrics-quiz-result-correct-count");
const lyricsQuizResultMissCountElement = document.getElementById("lyrics-quiz-result-miss-count");
const lyricsQuizResultTotalElapsedTimeElement = document.getElementById("lyrics-quiz-result-total-elapsed-time");
const lyricsQuizResultTotalHintsUsedElement = document.getElementById("lyrics-quiz-result-total-hints-used");
const lyricsQuizResultAverageHintsUsedElement = document.getElementById("lyrics-quiz-result-average-hints-used");
const lyricsQuizResultFirstHintCorrectCountElement = document.getElementById(
  "lyrics-quiz-result-first-hint-correct-count"
);
const lyricsQuizResultBreakdownListElement = document.getElementById("lyrics-quiz-result-breakdown-list");
const lyricsQuizResultAchievementListElement = document.getElementById("lyrics-quiz-result-achievement-list");
const lyricsQuizResultAchievementListLinkElement = document.getElementById(
  "lyrics-quiz-result-achievement-list-link"
);
const lyricsQuizResultRetryButtonElement = document.getElementById("lyrics-quiz-result-retry-button");
const lyricsQuizResultSetupButtonElement = document.getElementById("lyrics-quiz-result-setup-button");
const lyricsQuizResultSetupButtonLabelElement = document.getElementById("lyrics-quiz-result-setup-button-label");

// 対戦モード（ローカル対戦）の画面要素一式（2026-08-06新設）。
const battleModeSelectBackButtonElement = document.getElementById("battle-mode-select-back-button");
const battleMode1v1ButtonElement = document.getElementById("battle-mode-select-1v1");
const battleMode4pButtonElement = document.getElementById("battle-mode-select-4p");
const battleCreateOrJoinBackButtonElement = document.getElementById("battle-create-or-join-back-button");
const battleCreateOrJoinTitleElement = document.getElementById("battle-create-or-join-title");
const battleCreateButtonElement = document.getElementById("battle-create-button");
const battleJoinButtonElement = document.getElementById("battle-join-button");
const battleSetupBackButtonElement = document.getElementById("battle-setup-back-button");
const battleSetupCreateCodeButtonElement = document.getElementById("battle-setup-create-code-button");
const battleSetupErrorElement = document.getElementById("battle-setup-error");
const battleSetupRuleHintElement = document.getElementById("battle-setup-rule-hint");
const battleSetupPenaltyFieldsetElement = document.getElementById("battle-setup-penalty-fieldset");
const battleCodeShareBackButtonElement = document.getElementById("battle-code-share-back-button");
const battleCodeShareConfigSummaryElement = document.getElementById("battle-code-share-config-summary");
const battleCodeShareValueElement = document.getElementById("battle-code-share-value");
const battleCodeShareStartButtonElement = document.getElementById("battle-code-share-start-button");
const battleJoinBackButtonElement = document.getElementById("battle-join-back-button");
const battleJoinCodeInputElement = document.getElementById("battle-join-code-input");
const battleJoinErrorElement = document.getElementById("battle-join-error");
const battleJoinConfirmButtonElement = document.getElementById("battle-join-confirm-button");
const battleRuleConfirmBackButtonElement = document.getElementById("battle-rule-confirm-back-button");
const battleRuleConfirmConfigSummaryElement = document.getElementById("battle-rule-confirm-config-summary");
const battleRuleConfirmRuleHintElement = document.getElementById("battle-rule-confirm-rule-hint");
const battleRuleConfirmAudioCheckElement = document.getElementById("battle-rule-confirm-audio-check");
const battleRuleConfirmPlayerNameElement = document.getElementById("battle-rule-confirm-player-name");
const battleRuleConfirmStartButtonElement = document.getElementById("battle-rule-confirm-start-button");
const battleResultCollectHomeLinkElement = document.getElementById("battle-result-collect-home-link");
const battleResultCollectProgressElement = document.getElementById("battle-result-collect-progress");
const battleResultCollectListElement = document.getElementById("battle-result-collect-list");
const battleResultCollectAddSectionElement = document.getElementById("battle-result-collect-add-section");
const battleResultCollectNameInputElement = document.getElementById("battle-result-collect-name-input");
const battleResultCollectCodeInputElement = document.getElementById("battle-result-collect-code-input");
const battleResultCollectErrorElement = document.getElementById("battle-result-collect-error");
const battleResultCollectAddButtonElement = document.getElementById("battle-result-collect-add-button");
const battleResultCollectFinishButtonElement = document.getElementById("battle-result-collect-finish-button");
const battleResultCollectMyCodeElement = document.getElementById("battle-result-collect-my-code");
const battleResultRankingConfigSummaryElement = document.getElementById("battle-result-ranking-config-summary");
const battleResultRankingListElement = document.getElementById("battle-result-ranking-list");
const battleResultRankingRuleNoteElement = document.getElementById("battle-result-ranking-rule-note");
const battleResultRankingHomeButtonElement = document.getElementById("battle-result-ranking-home-button");

const onlineBattleEntryBackButtonElement = document.getElementById("online-battle-entry-back-button");
const onlineBattleEntryCreateButtonElement = document.getElementById("online-battle-entry-create-button");
const onlineBattleEntryJoinButtonElement = document.getElementById("online-battle-entry-join-button");
const onlineBattleEntryKickedNoticeElement = document.getElementById("online-battle-entry-kicked-notice");
const onlineBattleEntryLastRoomBannerElement = document.getElementById("online-battle-entry-last-room-banner");
const onlineBattleEntryLastRoomTextElement = document.getElementById("online-battle-entry-last-room-text");
const onlineBattleEntryLastRoomRejoinButtonElement = document.getElementById("online-battle-entry-last-room-rejoin-button");
const onlineBattleEntryLastRoomButtonLabelElement = document.getElementById("online-battle-entry-last-room-button-label");
const onlineBattleEntryLastRoomErrorElement = document.getElementById("online-battle-entry-last-room-error");
const onlineBattleCreateBackButtonElement = document.getElementById("online-battle-create-back-button");
const onlineBattleCreateNameInputElement = document.getElementById("online-battle-create-name-input");
const onlineBattleCreateSubmitButtonElement = document.getElementById("online-battle-create-submit-button");
const onlineBattleCreateErrorElement = document.getElementById("online-battle-create-error");
const onlineBattleJoinBackButtonElement = document.getElementById("online-battle-join-back-button");
const onlineBattleJoinRoomCodeInputElement = document.getElementById("online-battle-join-room-code-input");
const onlineBattleJoinNameInputElement = document.getElementById("online-battle-join-name-input");
const onlineBattleJoinSubmitButtonElement = document.getElementById("online-battle-join-submit-button");
const onlineBattleJoinErrorElement = document.getElementById("online-battle-join-error");
const onlineBattleLobbyLeaveButtonElement = document.getElementById("online-battle-lobby-leave-button");
const onlineBattleLobbyLeaveConfirmModalElement = document.getElementById("online-battle-lobby-leave-confirm-modal");
const onlineBattleLobbyLeaveCancelButtonElement = document.getElementById("online-battle-lobby-leave-cancel-button");
const onlineBattleLobbyLeaveConfirmButtonElement = document.getElementById("online-battle-lobby-leave-confirm-button");
const onlineBattleLobbyGoneNoticeElement = document.getElementById("online-battle-lobby-gone-notice");
const onlineBattleLobbyContentElement = document.getElementById("online-battle-lobby-content");
const onlineBattleLobbyRoomCodeElement = document.getElementById("online-battle-lobby-room-code");
const onlineBattleLobbyPlayerCountElement = document.getElementById("online-battle-lobby-player-count");
const onlineBattleLobbyMaxPlayersElement = document.getElementById("online-battle-lobby-max-players");
const onlineBattleLobbyGameModeElement = document.getElementById("online-battle-lobby-game-mode");
// 【2026-08-30新設→2026-10-01改訂・本人指示】待機中の対戦モード変更UI。折りたたみ式から
// 対戦設定の最上段への常時表示へ変更したため、開閉トグルボタンは廃止した。
const onlineBattleLobbyModeChangeElement = document.getElementById("online-battle-lobby-mode-change");
const onlineBattleLobbyPlayerListElement = document.getElementById("online-battle-lobby-player-list");
const onlineBattleLobbySettingsHostElement = document.getElementById("online-battle-lobby-settings-host");
const onlineBattleLobbySettingsParticipantElement = document.getElementById("online-battle-lobby-settings-participant");
const onlineBattleLobbySettingsSummaryElement = document.getElementById("online-battle-lobby-settings-summary");
const onlineBattleLobbySettingsPenaltyFieldsetElement = document.getElementById("online-battle-lobby-settings-penalty-fieldset");
// 共同選曲セクション（2026-08-27全面刷新：ホスト専用だった選曲UIを、ホスト・参加者
// 共通の「共同選曲」セクションへ置き換えた。js/onlineBattleScreen.js参照）。
const onlineBattleCollabSongSectionElement = document.getElementById("online-battle-collab-song-section");
const onlineBattleCollabChooseSongsButtonElement = document.getElementById("online-battle-collab-choose-songs-button");
const onlineBattleCollabChooseFavoritesButtonElement = document.getElementById("online-battle-collab-choose-favorites-button");
const onlineBattleCollabChoosePlaylistButtonElement = document.getElementById("online-battle-collab-choose-playlist-button");
const onlineBattleCollabMyCountElement = document.getElementById("online-battle-collab-my-count");
const onlineBattleCollabTotalCountElement = document.getElementById("online-battle-collab-total-count");
// 【2026-09-14新設・本人指示：誰がどの曲を選んだか／共有曲一覧を確認できるように】
const onlineBattleCollabDetailsToggleElement = document.getElementById("online-battle-collab-details-toggle");
const onlineBattleCollabDetailsPanelElement = document.getElementById("online-battle-collab-details-panel");
const onlineBattleCollabByPlayerListElement = document.getElementById("online-battle-collab-by-player-list");
const onlineBattleCollabUniqueSongListElement = document.getElementById("online-battle-collab-unique-song-list");
// 参加者全員が実際に利用できる共通曲の数（2026-08-27新設。ホスト・参加者・全gameModeで共有）。
const onlineBattleCommonSongNoticeElement = document.getElementById("online-battle-common-song-notice");
const onlineBattleLobbySettingsChangedNoticeElement = document.getElementById("online-battle-lobby-settings-changed-notice");
const onlineBattleLobbyRematchNoticeElement = document.getElementById("online-battle-lobby-rematch-notice");
// 【再戦準備フェーズ新設・本人指示】
const onlineBattleLobbyRematchCancelledNoticeElement = document.getElementById("online-battle-lobby-rematch-cancelled-notice");
// 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】
const onlineBattleLobbyMatchInvalidatedNoticeElement = document.getElementById("online-battle-lobby-match-invalidated-notice");
const onlineBattleLobbyReadyButtonElement = document.getElementById("online-battle-lobby-ready-button");
const onlineBattleLobbyStartButtonElement = document.getElementById("online-battle-lobby-start-button");
const onlineBattleLobbyStartHintElement = document.getElementById("online-battle-lobby-start-hint");
const onlineBattleLobbyStartErrorElement = document.getElementById("online-battle-lobby-start-error");
const onlineBattleCountdownNumberElement = document.getElementById("online-battle-countdown-number");
// 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】
const onlineBattleConfirmRuleExplanationElement = document.getElementById("online-battle-confirm-rule-explanation");
const onlineBattleConfirmPlayerListElement = document.getElementById("online-battle-confirm-player-list");
const onlineBattleConfirmAllDoneNoticeElement = document.getElementById("online-battle-confirm-all-done-notice");
const onlineBattleConfirmToggleButtonElement = document.getElementById("online-battle-confirm-toggle-button");
const onlineBattleConfirmCancelButtonElement = document.getElementById("online-battle-confirm-cancel-button");
// 【再戦準備フェーズ新設・本人指示】
const onlineBattleRematchReadyLeadElement = document.getElementById("online-battle-rematch-ready-lead");
const onlineBattleRematchReadySummaryElement = document.getElementById("online-battle-rematch-ready-summary");
const onlineBattleRematchReadyPlayerListElement = document.getElementById("online-battle-rematch-ready-player-list");
const onlineBattleRematchReadyAllDoneNoticeElement = document.getElementById("online-battle-rematch-ready-all-done-notice");
const onlineBattleRematchReadyToggleButtonElement = document.getElementById("online-battle-rematch-ready-toggle-button");
const onlineBattleQuizProgressStripElement = document.getElementById("online-battle-quiz-progress-strip");
const onlineBattleWaitingLeadTextElement = document.getElementById("online-battle-waiting-lead-text");
const onlineBattleWaitingHostDisconnectNoticeElement = document.getElementById("online-battle-waiting-host-disconnect-notice");
const onlineBattleWaitingSubmitErrorElement = document.getElementById("online-battle-waiting-submit-error");
const onlineBattleWaitingRetryButtonElement = document.getElementById("online-battle-waiting-retry-button");
const onlineBattleWaitingPlayerListElement = document.getElementById("online-battle-waiting-player-list");
const onlineBattleWaitingGameModeElement = document.getElementById("online-battle-waiting-game-mode");
const onlineBattleWaitingFinalizeButtonElement = document.getElementById("online-battle-waiting-finalize-button");
const onlineBattleWaitingFinalizeConfirmModalElement = document.getElementById("online-battle-waiting-finalize-confirm-modal");
const onlineBattleWaitingFinalizeCancelButtonElement = document.getElementById("online-battle-waiting-finalize-cancel-button");
const onlineBattleWaitingFinalizeConfirmButtonElement = document.getElementById("online-battle-waiting-finalize-confirm-button");
const onlineBattleResultConfigSummaryElement = document.getElementById("online-battle-result-config-summary");
const onlineBattleResultListElement = document.getElementById("online-battle-result-list");
const onlineBattleResultRuleNoteElement = document.getElementById("online-battle-result-rule-note");
// 【2026-09-12新設・本人指示：結果画面の問題別結果アコーディオンを完成させる】
const onlineBattleResultQuestionBreakdownSectionElement = document.getElementById("online-battle-result-question-breakdown-section");
const onlineBattleResultQuestionBreakdownElement = document.getElementById("online-battle-result-question-breakdown");
const onlineBattleResultHomeLinkElement = document.getElementById("online-battle-result-home-link");
const onlineBattleResultHostActionsElement = document.getElementById("online-battle-result-host-actions");
const onlineBattleResultRematchButtonElement = document.getElementById("online-battle-result-rematch-button");
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド23-29章】結果画面の
// 個別「ルーム設定に戻る」・「もう一度」提案への個別対応ボタン群。
// 【2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計】再戦準備専用の別画面を廃止し、
// 結果画面下部に常駐するインライン再戦準備パネルへ置き換えた。
const onlineBattleResultRematchPanelElement = document.getElementById("online-battle-result-rematch-panel");
const onlineBattleResultRematchPanelLeadElement = document.getElementById("online-battle-result-rematch-panel-lead");
const onlineBattleResultRematchSummaryElement = document.getElementById("online-battle-result-rematch-summary");
const onlineBattleResultRematchPlayerListElement = document.getElementById("online-battle-result-rematch-player-list");
const onlineBattleResultRematchAllDoneNoticeElement = document.getElementById("online-battle-result-rematch-all-done-notice");
const onlineBattleResultRematchToggleButtonElement = document.getElementById("online-battle-result-rematch-toggle-button");
const onlineBattleResultReturnPanelElement = document.getElementById("online-battle-result-return-panel");
const onlineBattleResultReturnStatusListElement = document.getElementById("online-battle-result-return-status-list");
const onlineBattleResultReturnButtonElement = document.getElementById("online-battle-result-return-button");
// 【2026-09-07新設、本人指示：ゲスト結果画面】
const onlineBattleResultGuestActionsElement = document.getElementById("online-battle-result-guest-actions");
const onlineBattleResultLeaveButtonElement = document.getElementById("online-battle-result-leave-button");
// 【2026-09-07新設・本人指示：ルーム参加者プロフィール】ロビーで参加者名をタップして
// 見る簡易プロフィールモーダル（js/onlineBattleScreen.js制御。全モードのロビーで共有）。
// 【2026-09-09新設・本人指示：ロビー専用の詳細説明書】
const onlineBattleLobbyHelpButtonElement = document.getElementById("online-battle-lobby-help-button");
// 【2026-11-XX新設・本人指示：ルーム招待】
const onlineBattleLobbyInviteButtonElement = document.getElementById("online-battle-lobby-invite-button");
const roomInvitePickerModalElement = document.getElementById("room-invite-picker-modal");
const roomInvitePickerCloseButtonElement = document.getElementById("room-invite-picker-close-button");
const roomInvitePickerListElement = document.getElementById("room-invite-picker-list");
const roomInvitePickerLoadingElement = document.getElementById("room-invite-picker-loading");
const roomInvitePickerEmptyElement = document.getElementById("room-invite-picker-empty");
const roomInviteBannerElement = document.getElementById("room-invite-banner");
const roomInviteBannerTextElement = document.getElementById("room-invite-banner-text");
const roomInviteBannerMoreLabelElement = document.getElementById("room-invite-banner-more-label");
const roomInviteBannerErrorElement = document.getElementById("room-invite-banner-error");
const roomInviteBannerAcceptButtonElement = document.getElementById("room-invite-banner-accept-button");
const roomInviteBannerDeclineButtonElement = document.getElementById("room-invite-banner-decline-button");
const roomInviteBannerLaterButtonElement = document.getElementById("room-invite-banner-later-button");
const onlineBattleLobbyHelpModalElement = document.getElementById("online-battle-lobby-help-modal");
const onlineBattleLobbyHelpCloseElement = document.getElementById("online-battle-lobby-help-close");
const onlineBattleLobbyHelpCurrentSettingsElement = document.getElementById("online-battle-lobby-help-current-settings");
const onlineBattleLobbyHelpModeListElement = document.getElementById("online-battle-lobby-help-mode-list");
const onlineLobbyProfileModalElement = document.getElementById("online-lobby-profile-modal");
const onlineLobbyProfileCloseElement = document.getElementById("online-lobby-profile-close");
const onlineLobbyProfileSwatchElement = document.getElementById("online-lobby-profile-swatch");
const onlineLobbyProfileNameElement = document.getElementById("online-lobby-profile-name");
const onlineLobbyProfileOshiElement = document.getElementById("online-lobby-profile-oshi");
const onlineLobbyProfileLoadingElement = document.getElementById("online-lobby-profile-loading");
const onlineLobbyProfileUnavailableElement = document.getElementById("online-lobby-profile-unavailable");
const onlineLobbyProfileBodyElement = document.getElementById("online-lobby-profile-body");
const onlineLobbyProfileAchievementCountElement = document.getElementById("online-lobby-profile-achievement-count");
const onlineLobbyProfileSummaryElement = document.getElementById("online-lobby-profile-summary");
// 【2026-09-13新設・本人指示11：ロビー参加者プロフィールに獲得称号の詳細を追加】
const onlineLobbyProfileAllToggleElement = document.getElementById("online-lobby-profile-all-toggle");
const onlineLobbyProfileAchievementsElement = document.getElementById("online-lobby-profile-achievements");
// 【2026-09-05新設、本人指示：対戦中にルーム設定へ戻る機能】複数の対戦画面で共有する、
// 「ルーム設定へ戻る」の確認モーダル（js/onlineBattleLobbyReturnPrompt.js参照）。
const onlineBattleReturnToLobbyModalElement = document.getElementById("online-battle-return-to-lobby-confirm-modal");
const onlineBattleReturnToLobbyCancelButtonElement = document.getElementById("online-battle-return-to-lobby-cancel-button");
const onlineBattleReturnToLobbyConfirmButtonElement = document.getElementById("online-battle-return-to-lobby-confirm-button");
// 【2026-09-14新設、本人指示：対戦中のゲストが自分だけ途中離脱する】複数の対戦画面で
// 共有する、ゲスト専用「この試合から途中離脱してルーム設定へ戻る」の確認モーダル
// （js/onlineBattleLeaveMatchPrompt.js参照）。上のホスト専用モーダルとは意味・DOMともに別。
const onlineBattleLeaveMatchModalElement = document.getElementById("online-battle-leave-match-confirm-modal");
const onlineBattleLeaveMatchCancelButtonElement = document.getElementById("online-battle-leave-match-cancel-button");
const onlineBattleLeaveMatchConfirmButtonElement = document.getElementById("online-battle-leave-match-confirm-button");
// 【2026-09-15新設、本人指示：ゲスト側の退出操作にも必ず確認ダイアログ】結果画面の
// 「ルームから退出」用の確認モーダル（js/onlineBattleResultLeavePrompt.js参照）。
const onlineBattleResultLeaveModalElement = document.getElementById("online-battle-result-leave-confirm-modal");
const onlineBattleResultLeaveCancelButtonElement = document.getElementById("online-battle-result-leave-cancel-button");
const onlineBattleResultLeaveConfirmButtonElement = document.getElementById("online-battle-result-leave-confirm-button");
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】結果画面の
// 「⌂ ホームへ戻る」用の確認モーダル（js/onlineBattleResultHomePrompt.js参照）。
const onlineBattleResultHomeConfirmModalElement = document.getElementById("online-battle-result-home-confirm-modal");
const onlineBattleResultHomeCancelButtonElement = document.getElementById("online-battle-result-home-cancel-button");
const onlineBattleResultHomeConfirmButtonElement = document.getElementById("online-battle-result-home-confirm-button");
// 【2026-09-06新設、本人指示：実機フィードバック②】回答確認モーダル。
const answerConfirmModalElement = document.getElementById("answer-confirm-modal");
const answerConfirmSongTitleElement = document.getElementById("answer-confirm-modal-song-title");
const answerConfirmConfirmButtonElement = document.getElementById("answer-confirm-confirm-button");
const answerConfirmCancelButtonElement = document.getElementById("answer-confirm-cancel-button");
const onlineBattleQuizBackToLobbyButtonElement = document.getElementById("online-battle-quiz-back-to-lobby-button");
// 【2026-09-14新設、本人指示】ゲスト専用「この試合だけ抜ける」（4画面分）。
const onlineBattleQuizLeaveMatchButtonElement = document.getElementById("online-battle-quiz-leave-match-button");
// 【2026-08-30新設、本人指示：観戦機能】
const onlineBattleSpectatorLeaveButtonElement = document.getElementById("online-battle-spectator-leave-button");
const onlineBattleSpectatorGameModeElement = document.getElementById("online-battle-spectator-game-mode");
const onlineBattleSpectatorPlayerCountElement = document.getElementById("online-battle-spectator-player-count");
const onlineBattleSpectatorPlayerListElement = document.getElementById("online-battle-spectator-player-list");

// オンライン対戦：一瞬バトル専用（2026-08-30新設、本人指示：19-3章）。
const onlineInstantBattleLobbySettingsHostElement = document.getElementById("online-battle-lobby-settings-host-instant");
const onlineInstantBattleLobbySettingsParticipantElement = document.getElementById("online-battle-lobby-settings-participant-instant");
const onlineInstantBattleSettingsSummaryElement = document.getElementById("online-instant-battle-settings-summary");
const onlineInstantBattleSettingsErrorElement = document.getElementById("online-instant-battle-settings-error");
const onlineInstantBattleQuitButtonElement = document.getElementById("online-instant-battle-quit-button");
const onlineInstantBattleBackToLobbyButtonElement = document.getElementById("online-instant-battle-back-to-lobby-button");
const onlineInstantBattleLeaveMatchButtonElement = document.getElementById("online-instant-battle-leave-match-button");
const onlineInstantBattleAudioTroubleButtonElement = document.getElementById("online-instant-battle-audio-trouble-button");
const onlineInstantBattleAudioTroubleNoticeElement = document.getElementById("online-instant-battle-audio-trouble-notice");
const onlineInstantBattleProgressElement = document.getElementById("online-instant-battle-progress");
const onlineInstantBattleErrorElement = document.getElementById("online-instant-battle-error");
const onlineInstantBattleCountdownElement = document.getElementById("online-instant-battle-countdown");
const onlineInstantBattleCountdownNumberElement = document.getElementById("online-instant-battle-countdown-number");
const onlineInstantBattleReplayButtonElement = document.getElementById("online-instant-battle-replay-button");
const onlineInstantBattleRankHintElement = document.getElementById("online-instant-battle-rank-hint");
const onlineInstantBattleAnswerSectionElement = document.getElementById("online-instant-battle-answer-section");
const onlineInstantBattleAnswerSearchRowElement = document.getElementById("online-instant-battle-answer-search-row");
const onlineInstantBattleAnswerSearchInputElement = document.getElementById("online-instant-battle-answer-search-input");
const onlineInstantBattleAnswerCountElement = document.getElementById("online-instant-battle-answer-count");
const onlineInstantBattleAnswerJumpBarElement = document.getElementById("online-instant-battle-answer-jump-bar");
const onlineInstantBattleAnswerListElement = document.getElementById("online-instant-battle-answer-list");
const onlineInstantBattleUnknownButtonElement = document.getElementById("online-instant-battle-unknown-button");
const onlineInstantBattleIdleNoticeElement = document.getElementById("online-instant-battle-idle-notice");
const onlineInstantBattleWaitingSectionElement = document.getElementById("online-instant-battle-waiting-section");
const onlineInstantBattleAnswerStatusListElement = document.getElementById("online-instant-battle-answer-status-list");
const onlineInstantBattleRevealSectionElement = document.getElementById("online-instant-battle-reveal-section");
const onlineInstantBattleRevealOutcomeBadgeElement = document.getElementById("online-instant-battle-reveal-outcome-badge");
const onlineInstantBattleRevealCorrectSongElement = document.getElementById("online-instant-battle-reveal-correct-song");
const onlineInstantBattleRevealAudioFailureNoticeElement = document.getElementById("online-instant-battle-reveal-audio-failure-notice");
const onlineInstantBattleRevealPlayerListElement = document.getElementById("online-instant-battle-reveal-player-list");
const onlineInstantBattleQuitConfirmModalElement = document.getElementById("online-instant-battle-quit-confirm-modal");
const onlineInstantBattleQuitCancelButtonElement = document.getElementById("online-instant-battle-quit-cancel-button");
const onlineInstantBattleQuitConfirmButtonElement = document.getElementById("online-instant-battle-quit-confirm-button");
const onlineInstantBattleResultHomeLinkElement = document.getElementById("online-instant-battle-result-home-link");
const onlineInstantBattleResultAudioFailureNoticeElement = document.getElementById("online-instant-battle-result-audio-failure-notice");
const onlineInstantBattleResultNormalElement = document.getElementById("online-instant-battle-result-normal");
const onlineInstantBattleResultListElement = document.getElementById("online-instant-battle-result-list");
const onlineInstantBattleResultRuleNoteElement = document.getElementById("online-instant-battle-result-rule-note");
const onlineInstantBattleResultQuestionBreakdownSectionElement = document.getElementById("online-instant-battle-result-question-breakdown-section");
const onlineInstantBattleResultQuestionBreakdownElement = document.getElementById("online-instant-battle-result-question-breakdown");
const onlineInstantBattleResultHostActionsElement = document.getElementById("online-instant-battle-result-host-actions");
const onlineInstantBattleResultGuestActionsElement = document.getElementById("online-instant-battle-result-guest-actions");
const onlineInstantBattleResultLeaveButtonElement = document.getElementById("online-instant-battle-result-leave-button");
const onlineInstantBattleResultRematchButtonElement = document.getElementById("online-instant-battle-result-rematch-button");
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】旧back-to-lobby-buttonは
// index.html側で個別操作パネル（online-instant-battle-result-return-panel）へ置き換えた。
const onlineInstantBattleResultRematchPanelElement = document.getElementById("online-instant-battle-result-rematch-panel");
const onlineInstantBattleResultRematchPanelLeadElement = document.getElementById("online-instant-battle-result-rematch-panel-lead");
const onlineInstantBattleResultRematchPlayerListElement = document.getElementById("online-instant-battle-result-rematch-player-list");
const onlineInstantBattleResultRematchAllDoneNoticeElement = document.getElementById("online-instant-battle-result-rematch-all-done-notice");
const onlineInstantBattleResultRematchToggleButtonElement = document.getElementById("online-instant-battle-result-rematch-toggle-button");
const onlineInstantBattleResultReturnPanelElement = document.getElementById("online-instant-battle-result-return-panel");
const onlineInstantBattleResultReturnStatusListElement = document.getElementById("online-instant-battle-result-return-status-list");
const onlineInstantBattleResultReturnButtonElement = document.getElementById("online-instant-battle-result-return-button");

// オンライン対戦：一瞬協力専用（2026-08-31新設、本人指示：19-3章）。
const onlineInstantCoopLobbySettingsHostElement = document.getElementById("online-battle-lobby-settings-host-coop");
const onlineInstantCoopLobbySettingsParticipantElement = document.getElementById("online-battle-lobby-settings-participant-coop");
const onlineInstantCoopSettingsSummaryElement = document.getElementById("online-instant-coop-settings-summary");
const onlineInstantCoopSettingsErrorElement = document.getElementById("online-instant-coop-settings-error");
const onlineInstantCoopQuitButtonElement = document.getElementById("online-instant-coop-battle-quit-button");
const onlineInstantCoopBackToLobbyButtonElement = document.getElementById("online-instant-coop-battle-back-to-lobby-button");
const onlineInstantCoopLeaveMatchButtonElement = document.getElementById("online-instant-coop-battle-leave-match-button");
const onlineInstantCoopAudioTroubleButtonElement = document.getElementById("online-instant-coop-battle-audio-trouble-button");
const onlineInstantCoopAudioTroubleNoticeElement = document.getElementById("online-instant-coop-battle-audio-trouble-notice");
const onlineInstantCoopProgressElement = document.getElementById("online-instant-coop-battle-progress");
const onlineInstantCoopErrorElement = document.getElementById("online-instant-coop-battle-error");
// 【2026-11-XX追加・実機バグ調査：一瞬協力にカウントダウンが無かった不具合】
const onlineInstantCoopCountdownElement = document.getElementById("online-instant-coop-battle-countdown");
const onlineInstantCoopCountdownNumberElement = document.getElementById("online-instant-coop-battle-countdown-number");
const onlineInstantCoopReplayButtonElement = document.getElementById("online-instant-coop-battle-replay-button");
const onlineInstantCoopAnswerSectionElement = document.getElementById("online-instant-coop-battle-answer-section");
const onlineInstantCoopAnswerSearchRowElement = document.getElementById("online-instant-coop-battle-answer-search-row");
const onlineInstantCoopAnswerSearchInputElement = document.getElementById("online-instant-coop-battle-answer-search-input");
const onlineInstantCoopAnswerCountElement = document.getElementById("online-instant-coop-battle-answer-count");
const onlineInstantCoopAnswerJumpBarElement = document.getElementById("online-instant-coop-battle-answer-jump-bar");
const onlineInstantCoopAnswerListElement = document.getElementById("online-instant-coop-battle-answer-list");
const onlineInstantCoopUnknownButtonElement = document.getElementById("online-instant-coop-battle-unknown-button");
const onlineInstantCoopIdleNoticeElement = document.getElementById("online-instant-coop-battle-idle-notice");
const onlineInstantCoopWaitingNoticeElement = document.getElementById("online-instant-coop-battle-waiting-notice");
const onlineInstantCoopAnswerStatusListElement = document.getElementById("online-instant-coop-battle-answer-status-list");
const onlineInstantCoopRevealSectionElement = document.getElementById("online-instant-coop-battle-reveal-section");
const onlineInstantCoopRevealOutcomeBadgeElement = document.getElementById("online-instant-coop-battle-reveal-outcome-badge");
const onlineInstantCoopRevealCorrectSongElement = document.getElementById("online-instant-coop-battle-reveal-correct-song");
const onlineInstantCoopRevealTeamAnswerElement = document.getElementById("online-instant-coop-battle-reveal-team-answer");
const onlineInstantCoopRevealTieBreakNoticeElement = document.getElementById("online-instant-coop-battle-reveal-tiebreak-notice");
const onlineInstantCoopRevealDecisionReasonElement = document.getElementById("online-instant-coop-battle-reveal-decision-reason");
const onlineInstantCoopRevealVoteListElement = document.getElementById("online-instant-coop-battle-reveal-vote-list");
const onlineInstantCoopQuitConfirmModalElement = document.getElementById("online-instant-coop-battle-quit-confirm-modal");
const onlineInstantCoopQuitCancelButtonElement = document.getElementById("online-instant-coop-battle-quit-cancel-button");
const onlineInstantCoopQuitConfirmButtonElement = document.getElementById("online-instant-coop-battle-quit-confirm-button");
const onlineInstantCoopResultHomeLinkElement = document.getElementById("online-instant-coop-battle-result-home-link");
const onlineInstantCoopResultHostActionsElement = document.getElementById("online-instant-coop-battle-result-host-actions");
const onlineInstantCoopResultGuestActionsElement = document.getElementById("online-instant-coop-battle-result-guest-actions");
const onlineInstantCoopResultLeaveButtonElement = document.getElementById("online-instant-coop-battle-result-leave-button");
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】旧back-to-lobby-buttonは
// index.html側で個別操作パネル（online-instant-coop-battle-result-return-panel）へ置き換えた。
const onlineInstantCoopResultRematchPanelElement = document.getElementById("online-instant-coop-battle-result-rematch-panel");
const onlineInstantCoopResultRematchPanelLeadElement = document.getElementById("online-instant-coop-battle-result-rematch-panel-lead");
const onlineInstantCoopResultRematchPlayerListElement = document.getElementById("online-instant-coop-battle-result-rematch-player-list");
const onlineInstantCoopResultRematchAllDoneNoticeElement = document.getElementById("online-instant-coop-battle-result-rematch-all-done-notice");
const onlineInstantCoopResultRematchToggleButtonElement = document.getElementById("online-instant-coop-battle-result-rematch-toggle-button");
const onlineInstantCoopResultReturnPanelElement = document.getElementById("online-instant-coop-battle-result-return-panel");
const onlineInstantCoopResultReturnStatusListElement = document.getElementById("online-instant-coop-battle-result-return-status-list");
const onlineInstantCoopResultReturnButtonElement = document.getElementById("online-instant-coop-battle-result-return-button");
const onlineInstantCoopResultCorrectCountElement = document.getElementById("online-instant-coop-battle-result-correct-count");
const onlineInstantCoopResultAudioFailureNoticeElement = document.getElementById("online-instant-coop-battle-result-audio-failure-notice");
const onlineInstantCoopResultNormalElement = document.getElementById("online-instant-coop-battle-result-normal");
const onlineInstantCoopResultMemberListElement = document.getElementById("online-instant-coop-battle-result-member-list");
// 【2026-09-12新設・本人指示：結果画面の問題別結果アコーディオンを完成させる】
const onlineInstantCoopResultQuestionBreakdownSectionElement = document.getElementById("online-instant-coop-battle-result-question-breakdown-section");
const onlineInstantCoopResultQuestionBreakdownElement = document.getElementById("online-instant-coop-battle-result-question-breakdown");
const onlineInstantCoopResultRematchButtonElement = document.getElementById("online-instant-coop-battle-result-rematch-button");

// オンライン対戦：出題する曲を選ぶ画面（2026-08-08新設）。イントロ対戦・ランダム再生対戦・
// 歌詞クイズ対戦の3つで共通利用する。
const onlineBattleSongPickerBackButtonElement = document.getElementById("online-battle-song-picker-back-button");
const onlineBattleSongPickerSelectedCountValueElement = document.getElementById("online-battle-song-picker-selected-count-value");
// 【2026-09-15新設・本人指示：画面を開いたままリアルタイム同期】
const onlineBattleSongPickerLiveSummaryElement = document.getElementById("online-battle-song-picker-live-summary");
const onlineBattleSongPickerSelectAllButtonElement = document.getElementById("online-battle-song-picker-select-all-button");
const onlineBattleSongPickerDeselectAllButtonElement = document.getElementById("online-battle-song-picker-deselect-all-button");
const onlineBattleSongPickerSearchInputElement = document.getElementById("online-battle-song-picker-search-input");
const onlineBattleSongPickerSearchClearButtonElement = document.getElementById("online-battle-song-picker-search-clear-button");
const onlineBattleSongPickerSelectedOnlyCheckboxElement = document.getElementById("online-battle-song-picker-selected-only-checkbox");
const onlineBattleSongPickerGroupsElement = document.getElementById("online-battle-song-picker-groups");
const onlineBattleSongPickerNoResultsNoticeElement = document.getElementById("online-battle-song-picker-no-results-notice");
const onlineBattleSongPickerMinNoticeElement = document.getElementById("online-battle-song-picker-min-notice");
const onlineBattleSongPickerConfirmButtonElement = document.getElementById("online-battle-song-picker-confirm-button");
const onlineBattleSongPickerStickyBarElement = document.getElementById("online-battle-song-picker-sticky-bar");
const onlineBattleSongPickerReviewPanelElement = document.getElementById("online-battle-song-picker-review-panel");
const onlineBattleSongPickerReviewChipsElement = document.getElementById("online-battle-song-picker-review-chips");
const onlineBattleSongPickerStickyToggleElement = document.getElementById("online-battle-song-picker-sticky-toggle");
const onlineBattleSongPickerStickyCountValueElement = document.getElementById("online-battle-song-picker-sticky-count");
const onlineBattleSongPickerStickyConfirmButtonElement = document.getElementById("online-battle-song-picker-sticky-confirm-button");

// オンライン対戦：歌詞クイズ専用（Phase6新設）。
const onlineLyricsBattleLobbySettingsHostElement = document.getElementById("online-battle-lobby-settings-host-lyrics");
const onlineLyricsBattleLobbySettingsParticipantElement = document.getElementById("online-battle-lobby-settings-participant-lyrics");
const onlineLyricsBattleRuleOptionsElement = document.getElementById("online-lyrics-battle-rule-options");
const onlineLyricsBattlePoolSizeOptionsElement = document.getElementById("online-lyrics-battle-pool-size-options");
const onlineLyricsBattleSettingsFormElement = document.getElementById("online-lyrics-battle-settings-form");
const onlineLyricsBattleSettingsSummaryElement = document.getElementById("online-lyrics-battle-settings-summary");
const onlineLyricsBattleSettingsRuleDescriptionElement = document.getElementById("online-lyrics-battle-settings-rule-description");
// 共同選曲セクション（2026-08-27全面刷新、js/onlineLyricsQuizBattleScreen.js参照）。
const onlineLyricsBattleCollabSongSectionElement = document.getElementById("online-lyrics-battle-collab-song-section");
const onlineLyricsBattleCollabChooseSongsButtonElement = document.getElementById("online-lyrics-battle-collab-choose-songs-button");
const onlineLyricsBattleCollabChooseFavoritesButtonElement = document.getElementById("online-lyrics-battle-collab-choose-favorites-button");
const onlineLyricsBattleCollabChoosePlaylistButtonElement = document.getElementById("online-lyrics-battle-collab-choose-playlist-button");
const onlineLyricsBattleCollabMyCountElement = document.getElementById("online-lyrics-battle-collab-my-count");
const onlineLyricsBattleCollabTotalCountElement = document.getElementById("online-lyrics-battle-collab-total-count");
// 【2026-09-14新設・本人指示：誰がどの曲を選んだか／共有曲一覧を確認できるように】
const onlineLyricsBattleCollabDetailsToggleElement = document.getElementById("online-lyrics-battle-collab-details-toggle");
const onlineLyricsBattleCollabDetailsPanelElement = document.getElementById("online-lyrics-battle-collab-details-panel");
const onlineLyricsBattleCollabByPlayerListElement = document.getElementById("online-lyrics-battle-collab-by-player-list");
const onlineLyricsBattleCollabUniqueSongListElement = document.getElementById("online-lyrics-battle-collab-unique-song-list");
const onlineLyricsBattleSettingsErrorElement = document.getElementById("online-lyrics-battle-settings-error");
const onlineLyricsBattleReadinessStatusElement = document.getElementById("online-lyrics-battle-readiness-status");
const onlineLyricsBattleOwnMissingElement = document.getElementById("online-lyrics-battle-own-missing");
const onlineLyricsBattleQuitButtonElement = document.getElementById("online-lyrics-battle-quit-button");
const onlineLyricsBattleBackToLobbyButtonElement = document.getElementById("online-lyrics-battle-back-to-lobby-button");
const onlineLyricsBattleLeaveMatchButtonElement = document.getElementById("online-lyrics-battle-leave-match-button");
const onlineLyricsBattleProgressElement = document.getElementById("online-lyrics-battle-progress");
const onlineLyricsBattleRuleBadgeElement = document.getElementById("online-lyrics-battle-rule-badge");
// 【2026-09-01新設・本人指示：ライブスコアボード】
const onlineLyricsBattleScoreboardElement = document.getElementById("online-lyrics-battle-scoreboard");
const onlineLyricsBattleScoreboardSummaryHintElement = document.getElementById("online-lyrics-battle-scoreboard-summary-hint");
const onlineLyricsBattleMyRankElement = document.getElementById("online-lyrics-battle-my-rank");
const onlineLyricsBattleScoreboardListElement = document.getElementById("online-lyrics-battle-scoreboard-list");
const onlineLyricsBattleHudElement = document.getElementById("online-lyrics-battle-hud");
const onlineLyricsBattleHintLevelElement = document.getElementById("online-lyrics-battle-hint-level");
const onlineLyricsBattleHintLinesElement = document.getElementById("online-lyrics-battle-hint-lines");
// 【2026-08-31新設、本人指示：歌詞クイズ3ルール全面改修】手動ヒント開放・わからないボタン。
const onlineLyricsBattleHintActionsElement = document.getElementById("online-lyrics-battle-hint-actions");
// 【2026-08-31新設】30・50・全曲プールの検索欄・50音ジャンプバー。
const onlineLyricsBattleAnswerSearchRowElement = document.getElementById("online-lyrics-battle-answer-search-row");
const onlineLyricsBattleAnswerSearchInputElement = document.getElementById("online-lyrics-battle-answer-search-input");
const onlineLyricsBattleAnswerCountElement = document.getElementById("online-lyrics-battle-answer-count");
const onlineLyricsBattleAnswerJumpBarElement = document.getElementById("online-lyrics-battle-answer-jump-bar");
const onlineLyricsBattleAnswerChoicesElement = document.getElementById("online-lyrics-battle-answer-choices");
// 【2026-09-06新設、本人指示：3分無操作の放置救済】ホストにだけ見える通知。
const onlineLyricsBattleIdleNoticeElement = document.getElementById("online-lyrics-battle-idle-notice");
const onlineLyricsBattleStatusMessageElement = document.getElementById("online-lyrics-battle-status-message");
const onlineLyricsBattleErrorElement = document.getElementById("online-lyrics-battle-error");
// 【2026-09-03新設、本人指摘：正解発表の強化】
const onlineLyricsBattleAnswerRevealElement = document.getElementById("online-lyrics-battle-answer-reveal");
const onlineLyricsBattleAnswerRevealStatusElement = document.getElementById("online-lyrics-battle-answer-reveal-status");
const onlineLyricsBattleAnswerRevealTitleElement = document.getElementById("online-lyrics-battle-answer-reveal-title");
const onlineLyricsBattleAnswerRevealMyAnswerElement = document.getElementById("online-lyrics-battle-answer-reveal-my-answer");
const onlineLyricsBattleAnswerRevealMetaElement = document.getElementById("online-lyrics-battle-answer-reveal-meta");
const onlineLyricsBattleQuitConfirmModalElement = document.getElementById("online-lyrics-battle-quit-confirm-modal");
const onlineLyricsBattleQuitCancelButtonElement = document.getElementById("online-lyrics-battle-quit-cancel-button");
const onlineLyricsBattleQuitConfirmButtonElement = document.getElementById("online-lyrics-battle-quit-confirm-button");
const onlineLyricsBattleResultHomeLinkElement = document.getElementById("online-lyrics-battle-result-home-link");
const onlineLyricsBattleResultHostActionsElement = document.getElementById("online-lyrics-battle-result-host-actions");
const onlineLyricsBattleResultGuestActionsElement = document.getElementById("online-lyrics-battle-result-guest-actions");
const onlineLyricsBattleResultLeaveButtonElement = document.getElementById("online-lyrics-battle-result-leave-button");
const onlineLyricsBattleResultRuleNoteElement = document.getElementById("online-lyrics-battle-result-rule-note");
const onlineLyricsBattleResultTableElement = document.getElementById("online-lyrics-battle-result-table");
// 【2026-09-12新設・本人指示：結果画面の問題別結果アコーディオンを完成させる】
const onlineLyricsBattleResultQuestionBreakdownSectionElement = document.getElementById("online-lyrics-battle-result-question-breakdown-section");
const onlineLyricsBattleResultQuestionBreakdownElement = document.getElementById("online-lyrics-battle-result-question-breakdown");
const onlineLyricsBattleResultRematchButtonElement = document.getElementById("online-lyrics-battle-result-rematch-button");
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】結果画面の個別
// 「ルーム設定に戻る」・「もう一度」提案への個別対応ボタン群。
// 【2026-10-01改訂・本人指示：結果画面/再戦フロー全面設計】結果画面下部に常駐する
// インライン再戦準備パネル（別画面への遷移は行わない）。
const onlineLyricsBattleResultRematchPanelElement = document.getElementById("online-lyrics-battle-result-rematch-panel");
const onlineLyricsBattleResultRematchPanelLeadElement = document.getElementById("online-lyrics-battle-result-rematch-panel-lead");
const onlineLyricsBattleResultRematchPlayerListElement = document.getElementById("online-lyrics-battle-result-rematch-player-list");
const onlineLyricsBattleResultRematchAllDoneNoticeElement = document.getElementById("online-lyrics-battle-result-rematch-all-done-notice");
const onlineLyricsBattleResultRematchToggleButtonElement = document.getElementById("online-lyrics-battle-result-rematch-toggle-button");
const onlineLyricsBattleResultReturnPanelElement = document.getElementById("online-lyrics-battle-result-return-panel");
const onlineLyricsBattleResultReturnStatusListElement = document.getElementById("online-lyrics-battle-result-return-status-list");
const onlineLyricsBattleResultReturnButtonElement = document.getElementById("online-lyrics-battle-result-return-button");

// 【2026-08-29追加、本人指示（⑭）】オリジナル問題作成モードの3種類選択画面。
const customQuizTypeSelectBackButtonElement = document.getElementById("custom-quiz-type-select-back-button");
const customQuizTypeSelectIntroButtonElement = document.getElementById("custom-quiz-type-select-intro");
const customQuizTypeSelectRandomPlaybackButtonElement = document.getElementById(
  "custom-quiz-type-select-random-playback"
);
const customQuizTypeSelectLyricsButtonElement = document.getElementById("custom-quiz-type-select-lyrics");
const customQuizTypeSelectOutroButtonElement = document.getElementById("custom-quiz-type-select-outro");
const customQuizTypeSelectInstantButtonElement = document.getElementById("custom-quiz-type-select-instant");
const customQuizPresetsEyebrowLabelElement = document.getElementById("custom-quiz-presets-eyebrow-label");
const customQuizDistractorModeFieldsetElement = document.getElementById("custom-quiz-distractor-mode-fieldset");
const customQuizAnswerPoolSizeFieldsetElement = document.getElementById("custom-quiz-answer-pool-size-fieldset");
const customQuizInstantDurationFieldsetElement = document.getElementById("custom-quiz-instant-duration-fieldset");
const customQuizInstantAnswerPoolSizeFieldsetElement = document.getElementById(
  "custom-quiz-instant-answer-pool-size-fieldset"
);
const customQuizLyricsRevealAudioFieldsetElement = document.getElementById("custom-quiz-lyrics-reveal-audio-fieldset");
const customQuizInstantRevealAudioFieldsetElement = document.getElementById("custom-quiz-instant-reveal-audio-fieldset");
const customQuizBackButtonElement = document.getElementById("custom-quiz-back-button");
const customQuizPresetsBackButtonElement = document.getElementById("custom-quiz-presets-back-button");
const customQuizRulesLinkElement = document.getElementById("custom-quiz-rules-link");
const customQuizRulesModalElement = document.getElementById("custom-quiz-rules-modal");
const customQuizRulesModalCloseButtonElement = document.getElementById("custom-quiz-rules-modal-close");
const customQuizPresetsRulesLinkElement = document.getElementById("custom-quiz-presets-rules-link");
const customQuizPresetsRulesModalElement = document.getElementById("custom-quiz-presets-rules-modal");
const customQuizPresetsRulesModalCloseButtonElement = document.getElementById(
  "custom-quiz-presets-rules-modal-close"
);
const customQuizPresetDetailModalElement = document.getElementById("custom-quiz-preset-detail-modal");
const customQuizDeleteConfirmModalElement = document.getElementById("custom-quiz-delete-confirm-modal");
const customQuizPresetsDeleteConfirmModalElement = document.getElementById(
  "custom-quiz-presets-delete-confirm-modal"
);
const weakSongsRulesLinkElement = document.getElementById("weak-songs-rules-link");
const weakSongsRulesModalElement = document.getElementById("weak-songs-rules-modal");
const weakSongsRulesModalCloseButtonElement = document.getElementById("weak-songs-rules-modal-close");

// 特別モード一覧の「？」から開く、各モードの説明モーダル一式（2026-08-06新設）。
// 開閉の仕組みは苦手曲/オリジナル問題作成モードの説明モーダルと全く同じなので、
// SPECIAL_MODE_HELP_MODALSに1件ずつまとめ、openSpecialModeHelp()で共通に開閉する。
const timeAttackRulesModalElement = document.getElementById("time-attack-rules-modal");
const timeAttackRulesModalCloseButtonElement = document.getElementById("time-attack-rules-modal-close");
const randomPlaybackRulesModalElement = document.getElementById("random-playback-rules-modal");
const randomPlaybackRulesModalCloseButtonElement = document.getElementById("random-playback-rules-modal-close");
const liveCallModeRulesModalElement = document.getElementById("live-call-mode-rules-modal");
const liveCallModeRulesModalCloseButtonElement = document.getElementById("live-call-mode-rules-modal-close");
const karaokeSyncRulesModalElement = document.getElementById("karaoke-sync-rules-modal");
const karaokeSyncRulesModalCloseButtonElement = document.getElementById("karaoke-sync-rules-modal-close");
const callGuideModalElement = document.getElementById("call-guide-modal");
const callGuideModalCloseButtonElement = document.getElementById("call-guide-modal-close");
const callGuideTabButtonElements = Array.from(document.querySelectorAll(".call-guide-tab-button"));
const callGuideTabPanelElements = {
  member: document.getElementById("call-guide-tab-member"),
  songCall: document.getElementById("call-guide-tab-songCall"),
  songColor: document.getElementById("call-guide-tab-songColor"),
  mix: document.getElementById("call-guide-tab-mix"),
};
const lyricsQuizRulesModalElement = document.getElementById("lyrics-quiz-rules-modal");
const lyricsQuizRulesModalCloseButtonElement = document.getElementById("lyrics-quiz-rules-modal-close");
const localBattleRulesModalElement = document.getElementById("local-battle-rules-modal");
const localBattleRulesModalCloseButtonElement = document.getElementById("local-battle-rules-modal-close");
const onlineBattleRulesModalElement = document.getElementById("online-battle-rules-modal");
const onlineBattleRulesModalCloseButtonElement = document.getElementById("online-battle-rules-modal-close");

// 歌詞クイズオンライン対戦の3ルール説明モーダル（本文はjs/battleRules/index.jsから動的に組み立てる）。
const battleRulesHelpLinkElement = document.getElementById("battle-rules-help-link");
const battleRulesHelpModalElement = document.getElementById("battle-rules-help-modal");
const battleRulesHelpModalCloseButtonElement = document.getElementById("battle-rules-help-modal-close");
const battleRulesHelpBodyElement = document.getElementById("battle-rules-help-body");

const specialModeNoticeElement = document.getElementById("special-mode-notice");
const backToTitleButtonElement = document.getElementById("back-to-title-button");
const backToSpecialModesButtonElement = document.getElementById("back-to-special-modes-button");
const backToModeListButtonElement = document.getElementById("back-to-mode-list-button");
const backToSpecialModesLinkElement = document.getElementById("back-to-special-modes-link");
const backToTitleLinkFromSpecialElement = document.getElementById("back-to-title-link-from-special");

// 特別モードのクイズ画面から、それぞれの確認/一覧画面へ戻るための共通処理。
// SPECIAL_MODES_DISPLAYの中で複数回参照する（結果画面の「◯◯一覧に戻る」と、
// クイズ中断の確認モーダル確定後の戻り先で、同じ画面に戻るため）。
function goToWeakSongsScreen() {
  renderWeakSongsScreen();
  showScreen("weakSongs");
}

function goToCustomQuizPresetsList() {
  renderCustomQuizPresetsScreen();
  showScreen("customQuizPresets");
}

// 特別モードごとの表示（結果画面の見出し・案内文、クイズ画面の進捗表示・中断時の戻り先）を
// まとめた対応表。将来モードが増えるときは、ここに1件足すだけでよい。
//
// backToListLabel/onBackToListは、そのモードが専用の一覧画面を持つ場合だけ設定する
// （例：オリジナル問題作成モードのプリセット一覧）。持たないモード（苦手曲モード）は
// 設定しないことで、結果画面は従来通り「特別モード一覧に戻る」だけを表示する。
//
// quizBackLabel/quizQuitTitle/quizQuitConfirmLabel/onQuizBackは、そのモードのクイズ中
// （playMode==="special"のとき）に「タイトルへ」の代わりに表示する文言と戻り先。
// 設定がない場合（通常プレイ・復習）は、呼び出し側で従来通り「タイトルへ」にフォールバックする。
const SPECIAL_MODES_DISPLAY = {
  weakSongs: {
    eyebrowLabel: "WEAK SONGS",
    progressPrefix: "🎯 苦手曲 ",
    resultNotice: "苦手曲の判定は、通常プレイの成績によって更新されます",
    quizBackLabel: "苦手曲モードへ",
    quizQuitTitle: "クイズを中断して苦手曲モードに戻りますか？",
    quizQuitConfirmLabel: "苦手曲モードに戻る",
    onQuizBack: goToWeakSongsScreen,
  },
  // 【2026-08-30追加、本人指示：苦手曲5系統完全分離】苦手曲モード「アウトロ」タブ。
  // weakSongsとほぼ同じ内容だが、進捗表示の絵文字だけ🎬にして区別できるようにする。
  weakSongsOutro: {
    eyebrowLabel: "WEAK SONGS",
    progressPrefix: "🎯🎬 苦手曲 ",
    resultNotice: "苦手曲の判定は、アウトロクイズの成績によって更新されます",
    quizBackLabel: "苦手曲モードへ",
    quizQuitTitle: "クイズを中断して苦手曲モードに戻りますか？",
    quizQuitConfirmLabel: "苦手曲モードに戻る",
    onQuizBack: goToWeakSongsScreen,
  },
  // 苦手曲モード「シャッフル」タブ。
  weakSongsShuffle: {
    eyebrowLabel: "WEAK SONGS",
    progressPrefix: "🎯🔀 苦手曲 ",
    resultNotice: "苦手曲の判定は、シャッフル（ランダム再生）の成績によって更新されます",
    quizBackLabel: "苦手曲モードへ",
    quizQuitTitle: "クイズを中断して苦手曲モードに戻りますか？",
    quizQuitConfirmLabel: "苦手曲モードに戻る",
    onQuizBack: goToWeakSongsScreen,
  },
  customQuiz: {
    eyebrowLabel: "ORIGINAL QUIZ",
    progressPrefix: "📝 オリジナル ",
    // 【2026-08-08修正】プレイ履歴には記録されるようになったため、文言を「自己ベスト・称号」
    // だけに絞る（本人指示：オリジナル問題作成モードのプレイもプレイ履歴の対象に追加）。
    resultNotice: "この結果は、自己ベスト・称号には反映されません",
    backToListLabel: "オリジナル問題一覧に戻る",
    onBackToList: goToCustomQuizPresetsList,
    quizBackLabel: "セット一覧へ",
    quizQuitTitle: "クイズを中断してオリジナル問題作成モードに戻りますか？",
    quizQuitConfirmLabel: "セット一覧に戻る",
    onQuizBack: goToCustomQuizPresetsList,
  },
  // 【2026-08-29追加、本人指示（⑭）】オリジナル問題作成モードのランダム再生タイプ。
  // customQuizとほぼ同じ内容だが、進捗表示の絵文字だけ🔀にして区別できるようにする
  // （resultNotice・戻り先はcustomQuizと完全に同じ設計のため、そのまま踏襲する）。
  customQuizRandomPlayback: {
    eyebrowLabel: "ORIGINAL QUIZ",
    progressPrefix: "🔀 オリジナル ",
    resultNotice: "この結果は、自己ベスト・称号には反映されません",
    backToListLabel: "オリジナル問題一覧に戻る",
    onBackToList: goToCustomQuizPresetsList,
    quizBackLabel: "セット一覧へ",
    quizQuitTitle: "クイズを中断してオリジナル問題作成モードに戻りますか？",
    quizQuitConfirmLabel: "セット一覧に戻る",
    onQuizBack: goToCustomQuizPresetsList,
  },
  // 【2026-08-30追加、本人指示（⑦）】オリジナル問題作成モードのアウトロタイプ。
  // customQuizRandomPlaybackとほぼ同じ内容だが、進捗表示の絵文字だけ🎬にして区別できるようにする。
  customQuizOutro: {
    eyebrowLabel: "ORIGINAL QUIZ",
    progressPrefix: "🎬 オリジナル ",
    resultNotice: "この結果は、自己ベスト・称号には反映されません",
    backToListLabel: "オリジナル問題一覧に戻る",
    onBackToList: goToCustomQuizPresetsList,
    quizBackLabel: "セット一覧へ",
    quizQuitTitle: "クイズを中断してオリジナル問題作成モードに戻りますか？",
    quizQuitConfirmLabel: "セット一覧に戻る",
    onQuizBack: goToCustomQuizPresetsList,
  },
  // 【2026-08-30追加、本人指示】アウトロクイズ。既存の#quiz-screen・#result-screenを
  // そのまま再利用する（specialModeId経由の分岐だけで済む）。将来通常ランキングへ対応する際も、
  // このエントリはそのまま残せる設計にしている。
  outroQuiz: {
    eyebrowLabel: "OUTRO QUIZ",
    progressPrefix: "🎬 アウトロ ",
    // 【2026-08-30改訂・本人指示①⑥⑨（後半③）】アウトロクイズは主要モード化に伴い、称号・
    // 自己ベスト（合計タイム）・グローバルランキングのすべての対象になった（renderResult()内、
    // isSpecialブロックのisOutroQuiz分岐参照）。この分岐内でspecialModeNoticeElement.hidden=true
    // により、下のresultNoticeは実際には表示されない（通常クイズと同じ扱いになったため、
    // 専用の案内はもう不要）。resultNotice自体は他の特別モードと構造を揃えるために残す。
    resultNotice: "",
    quizBackLabel: "アウトロクイズへ",
    quizQuitTitle: "クイズを中断してアウトロクイズの設定画面に戻りますか？",
    quizQuitConfirmLabel: "設定画面に戻る",
    onQuizBack: () => navigateWithScrollMemory("outroQuizSetup"),
  },
};
const quizBackButtonElement = document.getElementById("quiz-back-button");
const quizBackButtonLabelElement = document.getElementById("quiz-back-button-label");
const quizQuitConfirmModalElement = document.getElementById("quiz-quit-confirm-modal");
const lyricsFullscreenOverlayElement = document.getElementById("lyrics-fullscreen-overlay");
const quizQuitConfirmTitleElement = document.getElementById("quiz-quit-confirm-title");
const quizQuitCancelButtonElement = document.getElementById("quiz-quit-cancel-button");
const quizQuitConfirmButtonElement = document.getElementById("quiz-quit-confirm-button");
const quizQuitRestartButtonElement = document.getElementById("quiz-quit-restart-button");

// 【2026-08-30追加】アウトロクイズの設定画面。
const outroQuizSetupBackButtonElement = document.getElementById("outro-quiz-setup-back-button");
const outroQuizStartButtonElement = document.getElementById("outro-quiz-start-button");
const outroQuizStartErrorElement = document.getElementById("outro-quiz-start-error");

// 一瞬チャレンジの設定・問題・結果画面。
const instantChallengeSetupBackButtonElement = document.getElementById("instant-challenge-setup-back-button");
const instantChallengeStartButtonElement = document.getElementById("instant-challenge-start-button");
const instantChallengeStartErrorElement = document.getElementById("instant-challenge-start-error");
const instantChallengeProgressElement = document.getElementById("instant-challenge-progress");
const instantChallengeAnswerSearchRowElement = document.getElementById("instant-challenge-answer-search-row");
const instantChallengeAnswerSearchInputElement = document.getElementById("instant-challenge-answer-search-input");
const instantChallengeAnswerCountElement = document.getElementById("instant-challenge-answer-count");
const instantChallengeAnswerJumpBarElement = document.getElementById("instant-challenge-answer-jump-bar");
const instantChallengeAnswerListElement = document.getElementById("instant-challenge-answer-list");
const instantChallengeAnswerRevealElement = document.getElementById("instant-challenge-answer-reveal");
const instantChallengeAnswerRevealStatusElement = document.getElementById("instant-challenge-answer-reveal-status");
const instantChallengeAnswerRevealTitleElement = document.getElementById("instant-challenge-answer-reveal-title");
const instantChallengeAnswerRevealMyAnswerElement = document.getElementById("instant-challenge-answer-reveal-my-answer");
const instantChallengeCountdownElement = document.getElementById("instant-challenge-countdown");
const instantChallengeCountdownNumberElement = document.getElementById("instant-challenge-countdown-number");
// 【2026-09-06新設・本人指摘：実機フィードバック】音源再生失敗を画面にも表示する。
const instantChallengeAudioErrorElement = document.getElementById("instant-challenge-audio-error");
const instantChallengeReplayButtonElement = document.getElementById("instant-challenge-replay-button");
const instantChallengeNextButtonElement = document.getElementById("instant-challenge-next-button");
const instantChallengeBackButtonElement = document.getElementById("instant-challenge-back-button");
const instantChallengeQuitConfirmModalElement = document.getElementById("instant-challenge-quit-confirm-modal");
const instantChallengeQuitCancelButtonElement = document.getElementById("instant-challenge-quit-cancel-button");
const instantChallengeQuitRestartButtonElement = document.getElementById("instant-challenge-quit-restart-button");
const instantChallengeQuitConfirmButtonElement = document.getElementById("instant-challenge-quit-confirm-button");
const instantChallengeResultHomeLinkElement = document.getElementById("instant-challenge-result-home-link");
const instantChallengeResultClearBadgeElement = document.getElementById("instant-challenge-result-clear-badge");
const instantChallengeResultCorrectCountElement = document.getElementById("instant-challenge-result-correct-count");
const instantChallengeResultMissCountElement = document.getElementById("instant-challenge-result-miss-count");
const instantChallengeResultBreakdownListElement = document.getElementById("instant-challenge-result-breakdown-list");
const instantChallengeResultAchievementListElement = document.getElementById("instant-challenge-result-achievement-list");
const instantChallengeResultAchievementListLinkElement = document.getElementById(
  "instant-challenge-result-achievement-list-link"
);
const instantChallengeResultRetryButtonElement = document.getElementById("instant-challenge-result-retry-button");
const instantChallengeResultSetupButtonElement = document.getElementById("instant-challenge-result-setup-button");
const dataPackImportStatusElement = document.getElementById("data-pack-import-status");
const dataPackImportInputElement = document.getElementById("data-pack-import-input");
const dataPackImportResultElement = document.getElementById("data-pack-import-result");
const audioImportStatusElement = document.getElementById("audio-import-status");
const audioImportInputElement = document.getElementById("audio-import-input");
const audioImportResultElement = document.getElementById("audio-import-result");
const lyricsImportStatusElement = document.getElementById("lyrics-import-status");
const lyricsImportInputElement = document.getElementById("lyrics-import-input");
const lyricsImportResultElement = document.getElementById("lyrics-import-result");
const lyricsWarningPanelElement = document.getElementById("lyrics-warning-panel");
const lyricsWarningListElement = document.getElementById("lyrics-warning-list");
const lyricsWarningSaveButtonElement = document.getElementById("lyrics-warning-save-button");
const lyricsWarningDiscardButtonElement = document.getElementById("lyrics-warning-discard-button");
const callImportStatusElement = document.getElementById("call-import-status");
const callImportInputElement = document.getElementById("call-import-input");
const callImportResultElement = document.getElementById("call-import-result");
const callImportConfirmModalElement = document.getElementById("call-import-confirm-modal");
const callImportConfirmMessageElement = document.getElementById("call-import-confirm-message");
const callImportConfirmFailedListElement = document.getElementById("call-import-confirm-failed-list");
const callImportConfirmCancelButtonElement = document.getElementById("call-import-confirm-cancel-button");
const callImportConfirmSaveButtonElement = document.getElementById("call-import-confirm-save-button");
const callExportButtonElement = document.getElementById("call-export-button");
const callExportResultElement = document.getElementById("call-export-result");
const callGuideImportStatusElement = document.getElementById("call-guide-import-status");
const callGuideImportInputElement = document.getElementById("call-guide-import-input");
const callGuideImportResultElement = document.getElementById("call-guide-import-result");
const callGuideExportButtonElement = document.getElementById("call-guide-export-button");
const callGuideExportResultElement = document.getElementById("call-guide-export-result");
const callGuideImportConfirmModalElement = document.getElementById("call-guide-import-confirm-modal");
const callGuideImportConfirmMessageElement = document.getElementById("call-guide-import-confirm-message");
const callGuideImportConfirmFailedListElement = document.getElementById("call-guide-import-confirm-failed-list");
const callGuideImportConfirmCancelButtonElement = document.getElementById("call-guide-import-confirm-cancel-button");
const callGuideImportConfirmSaveButtonElement = document.getElementById("call-guide-import-confirm-save-button");
const discographyLinkElement = document.getElementById("discography-link");
const discographyBackButtonElement = document.getElementById("discography-back-button");
const workDetailBackButtonElement = document.getElementById("work-detail-back-button");
// 作品詳細画面を開く直前の、ディスコグラフィー画面のスクロール位置。「戻る」で復元する。
let discographyScrollY = 0;
const membersLinkElement = document.getElementById("members-link");
const membersBackButtonElement = document.getElementById("members-back-button");
const memberDetailBackButtonElement = document.getElementById("member-detail-back-button");
// メンバー詳細画面を開く直前の、メンバー一覧画面のスクロール位置。「戻る」で復元する。
let membersScrollY = 0;
const playerHeroSwatchElement = document.getElementById("player-hero-swatch");
const playerNameChipElement = document.getElementById("player-name-chip");
const playerNameChipTextElement = document.getElementById("player-name-chip-text");
const oshiSummaryChipElement = document.getElementById("oshi-summary-chip");
const oshiSummaryChipTextElement = document.getElementById("oshi-summary-chip-text");
const playerModalElement = document.getElementById("player-modal");
const playerModalCloseButtonElement = document.getElementById("player-modal-close-button");
const playerListElement = document.getElementById("player-list");
const playerAddInputElement = document.getElementById("player-add-input");
const playerAddButtonElement = document.getElementById("player-add-button");
const playerDeleteConfirmModalElement = document.getElementById("player-delete-confirm-modal");
const playerDeleteCancelButtonElement = document.getElementById("player-delete-cancel-button");
const playerDeleteConfirmButtonElement = document.getElementById("player-delete-confirm-button");
const storagePersistenceStatusElement = document.getElementById("storage-persistence-status");
const onboardingNameInputElement = document.getElementById("onboarding-name-input");
const onboardingMemberGridElement = document.getElementById("onboarding-member-grid");
const onboardingSubmitButtonElement = document.getElementById("onboarding-submit-button");

// モーダル／オーバーレイ（.modal-overlay全般・歌詞全画面表示）が開いている間、背景ページが
// スクロールしないようにする共通の仕組み（2026-08-29新設、本人指示）。アプリ起動時に
// 1回だけ呼べば、以後は各モーダルのhidden属性の変化を自動的に監視する
// （js/scrollLock.js参照。個別のモーダルのopen/close処理を書き換える必要はない）。
initScrollLock();

// 称号一覧モーダルの開閉ロジックはjs/achievementList.jsに閉じ込めてあるので、
// ここでは必要なDOM要素を渡して初期化するだけでよい（要素id自体は旧称号システム時代の
// ままだが、中身は新しい称号システム＝js/achievementDefinitions.js準拠に置き換わっている）。
initAchievementListModal({
  overlay: titleListModalElement,
  modalCard: titleListModalCardElement,
  closeButton: titleListModalCloseButtonElement,
  listContainer: titleListContainerElement,
  openTriggers: [
    titleListLinkElement,
    titleListLinkFromResultElement,
    timeAttackResultAchievementListLinkElement,
    randomPlaybackResultAchievementListLinkElement,
    lyricsQuizResultAchievementListLinkElement,
    instantChallengeResultAchievementListLinkElement,
    fanProfilesTitleListLinkElement,
    fanProfileDetailTitleListLinkElement,
  ],
});

// 旧称号（js/titleDefinitions.js時代）のデータが残っていれば、対応するノーミス段階称号へ
// 読み取り専用で安全に引き継ぐ（本人指示。旧データ自体は削除しない）。アプリ起動時に1回だけ。
syncLegacyAchievements();

// プレイ履歴画面のサマリー・一覧の描画、削除確認モーダルの開閉ロジックはhistoryScreen.jsに
// 閉じ込めてあるので、ここでは必要なDOM要素を渡して初期化するだけでよい。
initHistoryScreen({
  summaryPlayCount: document.getElementById("history-summary-play-count"),
  summaryAnswerCount: document.getElementById("history-summary-answer-count"),
  summaryAccuracy: document.getElementById("history-summary-accuracy"),
  tabOfflineButton: document.getElementById("history-tab-offline"),
  tabOnlineButton: document.getElementById("history-tab-online"),
  filterChipsContainer: document.getElementById("history-filter-chips"),
  listContainer: document.getElementById("history-list"),
  emptyState: document.getElementById("history-empty-state"),
  clearButton: document.getElementById("history-clear-button"),
  confirmModalOverlay: historyClearConfirmModalElement,
  confirmCancelButton: document.getElementById("history-clear-cancel-button"),
  confirmDeleteButton: document.getElementById("history-clear-delete-button"),
  detailModalOverlay: document.getElementById("history-detail-modal"),
  detailModalTitle: document.getElementById("history-detail-modal-title"),
  detailModalBody: document.getElementById("history-detail-modal-body"),
  detailModalCloseButton: document.getElementById("history-detail-modal-close-button"),
});

// プレイ履歴詳細画面の描画に使うDOM要素一式と、復習ボタンのコールバックを渡して初期化する。
initHistoryDetailScreen({
  date: document.getElementById("history-detail-date"),
  mode: document.getElementById("history-detail-mode"),
  rankDisplay: document.getElementById("history-detail-rank-display"),
  rankLetter: document.getElementById("history-detail-rank-letter"),
  score: document.getElementById("history-detail-score"),
  averageTime: document.getElementById("history-detail-average-time"),
  newRecord: document.getElementById("history-detail-new-record"),
  titleBadges: document.getElementById("history-detail-title-badges"),
  missedSection: document.getElementById("history-detail-missed-section"),
  missedHeading: document.getElementById("history-detail-missed-heading"),
  missedChipRow: document.getElementById("history-detail-missed-chip-row"),
  reviewButton: document.getElementById("history-detail-review-button"),
  allCorrectMessage: document.getElementById("history-detail-all-correct-message"),
  answerList: document.getElementById("history-detail-answer-list"),
  listEnd: document.getElementById("history-detail-list-end"),
  // 「この回の間違えた曲だけ復習する」：この履歴の出題数・カテゴリを引き継いで復習クイズを
  // 開始する。beginReviewQuiz()（結果画面発の復習）とほぼ同じ処理だが、こちらは
  // startReviewQuiz()にmodeOverrideを渡し、今のgameStateではなくこの履歴のモードに
  // questionCountValue/categoryFilterValueを合わせる点が異なる。
  onStartReview: async (missedSongs, questionCountValue, categoryFilterValue) => {
    playClickSound();
    stopTimer();
    stopAudio();
    const categoryPool = filterSongsByCategory(SONGS, categoryFilterValue);
    const distractorPool = await filterSongsWithImportedAudio(categoryPool);
    const questions = buildReviewQuizQuestions(missedSongs, distractorPool);
    startReviewQuiz(questions, { questionCountValue, categoryFilterValue });
    showScreen("quiz");
    renderQuestion();
  },
});

// 特別モード一覧画面：モードカードがタップされたら、対応する画面を開く。
initSpecialModesScreen({
  listContainer: document.getElementById("special-modes-list"),
  homeGridContainer: document.getElementById("home-special-modes-grid"),
  // 【2026-08-09修正】ホームから開くときもnavigateWithScrollMemory()を通すことで、
  // 「戻る」で押した瞬間のカード位置へ復元できるようにする（本人指示：既存のスクロール
  // 位置復元の仕組み＝プレイリスト等と同じnavigateWithScrollMemoryを再利用し、新しい仕組みを
  // 重複して作らない）。
  onSelectMode: (modeId) => {
    playClickSound();
    if (modeId === "weakSongs") {
      renderWeakSongsScreen();
      navigateWithScrollMemory("weakSongs");
    } else if (modeId === "originalQuiz") {
      // 【2026-08-29改訂、本人指示（⑭)】以前は一覧画面へ直接進んでいたが、今は3種類
      // （イントロ／ランダム再生／歌詞クイズ）の選択画面を必ず経由するようにした。
      navigateWithScrollMemory("customQuizTypeSelect");
    } else if (modeId === "liveCallMode") {
      renderLiveCallModeList();
      navigateWithScrollMemory("liveCallModeList");
    } else if (modeId === "timeAttack") {
      updateTimeAttackBestChip();
      navigateWithScrollMemory("timeAttackSetup");
    } else if (modeId === "randomPlayback") {
      updateRandomPlaybackBestChip();
      navigateWithScrollMemory("randomPlaybackSetup");
    } else if (modeId === "lyricsQuiz") {
      updateLyricsQuizBestChip();
      navigateWithScrollMemory("lyricsQuizSetup");
    } else if (modeId === "localBattle") {
      navigateWithScrollMemory("battleModeSelect");
    } else if (modeId === "onlineBattle") {
      navigateWithScrollMemory("onlineBattleEntry");
    } else if (modeId === "outroQuiz") {
      navigateWithScrollMemory("outroQuizSetup");
    } else if (modeId === "instantChallenge") {
      navigateWithScrollMemory("instantChallengeSetup");
    }
  },
  onShowHelp: openSpecialModeHelp,
});

// ライブコールモード：曲一覧画面・再生画面。
// 収録曲一覧（songlist.js）とは完全に独立した専用の画面（本人の希望で新設、2026-08-06）。
initLiveCallModeScreen({
  listContainer: liveCallModeSongListElement,
  listEmptyState: liveCallModeListEmptyStateElement,
  songTitle: liveCallModeSongTitleElement,
  playButton: liveCallModePlayButtonElement,
  seekRange: liveCallModeSeekRangeElement,
  currentTime: liveCallModeCurrentTimeElement,
  duration: liveCallModeDurationElement,
  seekBackButton: liveCallModeSeekBackButtonElement,
  audio: liveCallModeAudioElement,
  lyricsPanel: liveCallModeLyricsPanelElement,
  fullscreenButton: liveCallModeFullscreenButtonElement,
  noLyricsNotice: liveCallModeNoLyricsNoticeElement,
  onSelectSong: (songId) => {
    playClickSound();
    openLiveCallPlayTypeChoice(songId);
    // 曲一覧のスクロール位置を覚えておき、この画面から戻ってきたときに復元する
    // （UI/UX第3版・本人指示：一覧の下の方の曲を選んでも、戻ったら先頭へ飛ばされないように）。
    navigateWithScrollMemory("liveCallModePlayType");
  },
});

// 曲一覧画面の「戻る」：ホーム画面へ戻る（2026-08-08修正：ホームの特別モードカードから
// 直接この画面を開くようになったため、間に古い「特別モード一覧画面」を挟まない）。
liveCallModeListBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// ライブコールモード：再生方法選択画面（2026-08-09新設）。
// 曲一覧で曲を選んだ直後に必ずここを経由し、「通常再生」（既存のアプリ内音源再生）と
// 「カラオケ同期」（js/karaokeSyncScreen.js、新機能）のどちらを使うかを選んでもらう。
let liveCallPlayTypeSongId = null;

function openLiveCallPlayTypeChoice(songId) {
  liveCallPlayTypeSongId = songId;
  const song = SONGS.find((entry) => entry.id === songId);
  liveCallPlayTypeSongTitleElement.textContent = song ? song.title : "";
}

liveCallPlayTypeBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  liveCallPlayTypeSongId = null;
  navigateWithScrollMemory("liveCallModeList");
});

liveCallPlayTypeNormalButtonElement.addEventListener("click", () => {
  playClickSound();
  if (!liveCallPlayTypeSongId) return;
  openLiveCallModePlayer(liveCallPlayTypeSongId);
  showScreen("liveCallModePlayer");
});

liveCallPlayTypeKaraokeButtonElement.addEventListener("click", async () => {
  playClickSound();
  if (!liveCallPlayTypeSongId) return;
  await openKaraokeSyncScreen(liveCallPlayTypeSongId);
  showScreen("liveCallModeKaraoke");
});

// 再生画面の「戻る」：再生を止め、曲一覧画面へ戻る（常にこの画面からしか開かないため、
// 他画面のような「開く前の画面を覚えておく」仕組みは不要と判断）。
liveCallModePlayerBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  closeLiveCallModePlayer();
  showScreen("liveCallModeList");
});

liveCallModePlayerHelpLinkElement.addEventListener("click", () => {
  openSpecialModeHelp("liveCallMode");
});

// カラオケ同期画面の「戻る」：同期タイマー・端末音源・歌詞表示を片付けたうえで、
// 1つ前の画面（その曲の「通常再生／カラオケ同期」選択画面）へ戻る
// （UI/UX第3版・本人指示：曲一覧まで一気に戻ってしまうと、下の方にある曲を選び直すのが
// 大変なため、「一つ前へ戻る」という自然な階層に変更した。曲の選択状態＝
// liveCallPlayTypeSongIdはここではクリアしないため、選択画面には同じ曲が表示され続ける）。
karaokeBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  closeKaraokeSyncScreen();
  showScreen("liveCallModePlayType");
});

karaokeHelpLinkElement.addEventListener("click", () => {
  openSpecialModeHelp("liveCallKaraoke");
});

initKaraokeSyncScreen({
  songTitle: karaokeSongTitleElement,
  moreMenuButton: karaokeMoreMenuButtonElement,
  noCallsNotice: karaokeNoCallsNoticeElement,
  startPanel: karaokeStartPanelElement,
  startButton: karaokeStartButtonElement,
  deviceAudioNotice: karaokeDeviceAudioNoticeElement,
  syncPanel: karaokeSyncPanelElement,
  lyricsContextPanel: karaokeLyricsContextPanelElement,
  callHudCard: karaokeCallHudCardElement,
  callHudEyebrow: karaokeCallHudEyebrowElement,
  callHudText: karaokeCallHudTextElement,
  callHudCountdown: karaokeCallHudCountdownElement,
  callHudPreviewRow: karaokeCallHudPreviewRowElement,
  callHudPreviewItem1: karaokeCallHudPreviewItem1Element,
  callHudPreviewItem2: karaokeCallHudPreviewItem2Element,
  songEndBanner: karaokeSongEndBannerElement,
  songEndRestartButton: karaokeSongEndRestartButtonElement,
  songEndChooseButton: karaokeSongEndChooseButtonElement,
  deviceAudio: karaokeDeviceAudioElement,
  footerZone: karaokeFooterZoneElement,
  toast: karaokeToastElement,
  pauseResumeButton: karaokePauseResumeButtonElement,
  pauseResumeLabel: karaokePauseResumeLabelElement,
  offsetMinus05Button: karaokeOffsetMinus05ButtonElement,
  offsetMinus01Button: karaokeOffsetMinus01ButtonElement,
  offsetResetButton: karaokeOffsetResetButtonElement,
  offsetPlus01Button: karaokeOffsetPlus01ButtonElement,
  offsetPlus05Button: karaokeOffsetPlus05ButtonElement,
  offsetLabel: karaokeOffsetLabelElement,
  moreMenuModal: karaokeMoreMenuModalElement,
  moreMenuCloseButton: karaokeMoreMenuCloseButtonElement,
  nowButton: karaokeNowButtonElement,
  syncPointLabel: karaokeSyncPointLabelElement,
  beginnerNavToggleButton: karaokeBeginnerNavToggleButtonElement,
  beginnerNavToggleLabel: karaokeBeginnerNavToggleLabelElement,
  restartSongButton: karaokeRestartSongButtonElement,
  // 「曲を選ぶ」（曲終了バナー）：この画面を完全に片付けたうえで、選択画面を経由せず
  // 曲一覧まで戻る（本人指示：曲終了時は「別の曲を選ぶ」意図が明確なため）。
  onRequestChooseSong: () => {
    playClickSound();
    closeKaraokeSyncScreen();
    liveCallPlayTypeSongId = null;
    navigateWithScrollMemory("liveCallModeList");
  },
});

// コールガイド（メンバーコール／曲指定コール／ペンライト指定曲／MIX）の開閉・タブ切り替え。
// 開くたびに、今開いているタブの中身だけを最新の状態で描画し直す
// （曲を切り替えてから開いた場合でも、今の曲のハイライトが正しく反映されるようにするため）。
let activeCallGuideTab = "member";

async function renderActiveCallGuideTab() {
  await renderCallGuideTab(activeCallGuideTab, callGuideTabPanelElements, getCurrentLiveCallSongId());
}

function openCallGuideModal() {
  playClickSound();
  renderActiveCallGuideTab();
  callGuideModalElement.hidden = false;
}

function closeCallGuideModal() {
  callGuideModalElement.hidden = true;
}

liveCallModeGuideButtonElement.addEventListener("click", openCallGuideModal);
// 曲一覧画面（曲を選ぶ前）からも同じコールガイド・使い方説明を開けるようにする（本人要望）。
// currentSongIdはgetCurrentLiveCallSongId()がnullを返すため、専用口上の案内バナー等は
// 自然に非表示になる（曲を選んで再生画面から開いたときだけ表示される）。
liveCallModeListGuideButtonElement.addEventListener("click", openCallGuideModal);
liveCallModeListHelpLinkElement.addEventListener("click", () => {
  openSpecialModeHelp("liveCallMode");
});
callGuideModalCloseButtonElement.addEventListener("click", closeCallGuideModal);
callGuideModalElement.addEventListener("click", (event) => {
  if (event.target === callGuideModalElement) {
    closeCallGuideModal();
  }
});

callGuideTabButtonElements.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.tab === activeCallGuideTab) return;
    activeCallGuideTab = button.dataset.tab;
    callGuideTabButtonElements.forEach((tabButton) => {
      const isActive = tabButton === button;
      tabButton.classList.toggle("is-active", isActive);
      tabButton.setAttribute("aria-selected", String(isActive));
    });
    Object.entries(callGuideTabPanelElements).forEach(([tabId, panel]) => {
      panel.hidden = tabId !== activeCallGuideTab;
    });
    renderActiveCallGuideTab();
  });
});

// ＝LOVEの歴史・ディスコグラフィー画面：作品カード（年表・作品一覧どちらから）が
// タップされたら作品詳細画面を開く。
initDiscographyScreen({
  tabButtons: {
    about: document.getElementById("discography-tab-about"),
    history: document.getElementById("discography-tab-history"),
    works: document.getElementById("discography-tab-works"),
    live: document.getElementById("discography-tab-live"),
  },
  tabPanels: {
    about: document.getElementById("discography-about-panel"),
    history: document.getElementById("discography-history-panel"),
    works: document.getElementById("discography-works-panel"),
    live: document.getElementById("discography-live-panel"),
  },
  aboutContent: document.getElementById("discography-about-content"),
  timeline: document.getElementById("discography-timeline"),
  workList: document.getElementById("discography-work-list"),
  liveList: document.getElementById("discography-live-list"),
  workDetailTitle: document.getElementById("work-detail-title"),
  workDetailContent: document.getElementById("work-detail-content"),
  onSelectWork: (workId) => {
    playClickSound();
    discographyScrollY = window.scrollY;
    openWorkDetail(SONGS, DISCOGRAPHY, workId);
    showScreen("workDetail");
  },
});

// メンバー一覧画面：現役メンバーのカードがタップされたらメンバー詳細画面を開く。
// 卒業メンバーの簡易カードはタップ不可（詳細画面を持たない仕様、13章参照）。
initMembersScreen({
  activeGrid: document.getElementById("members-active-grid"),
  activeCount: document.getElementById("members-active-count"),
  graduatedList: document.getElementById("members-graduated-list"),
  memberDetailName: document.getElementById("member-detail-name"),
  memberDetailContent: document.getElementById("member-detail-content"),
  onSelectMember: (memberId) => {
    playClickSound();
    membersScrollY = window.scrollY;
    openMemberDetail(SONGS, MEMBERS, MEMBER_PROFILES, MEMBER_ACTIVITIES, memberId);
    showScreen("memberDetail");
  },
});

// 【2026-11-XX新設・本人指示：フレンドのオンライン状態】アプリを開いている間ずっと、
// 自分のpresence（presence/{uid}）を維持する。認証待ちを含む非同期処理だが、ここでは
// 呼び捨てにする（起動シーケンス全体をこれで止めない。失敗してもフレンド一覧の
// オンライン表示に影響するだけで、他の機能には一切影響しない設計）。
startFriendPresenceTracking();

// 「みんなのプロフィール」画面：公開設定トグル・一覧・詳細モーダル（2026-08-07新設）。
initFanProfilesScreen(
  {
    sharingToggleButton: fanProfilesSharingToggleElement,
    sharingToggleLabel: fanProfilesSharingToggleLabelElement,
    rankingSyncStatus: fanProfilesRankingSyncStatusElement,
    listContainer: fanProfilesListElement,
    detailOverlay: fanProfileDetailOverlayElement,
    detailCloseButton: fanProfileDetailCloseButtonElement,
    detailSwatch: fanProfileDetailSwatchElement,
    detailName: fanProfileDetailNameElement,
    detailOshi: fanProfileDetailOshiElement,
    detailTitleListLink: fanProfileDetailTitleListLinkElement,
    detailAchievementCount: fanProfileDetailAchievementCountElement,
    detailSummary: fanProfileDetailSummaryElement,
    detailAllToggle: fanProfileDetailAllToggleElement,
    detailAchievementList: fanProfileDetailAchievementsElement,
    myUidValue: fanProfilesMyUidElement,
    adminBackupLinkButton: adminBackupLinkButtonElement,
    debugAudioLogLinkButton: debugAudioLogLinkButtonElement,
    adminDeleteOverlay: fanProfilesAdminDeleteOverlayElement,
    adminDeleteTargetName: fanProfilesAdminDeleteTargetNameElement,
    adminDeleteCancelButton: fanProfilesAdminDeleteCancelButtonElement,
    adminDeleteConfirmButton: fanProfilesAdminDeleteConfirmButtonElement,
  },
  MEMBERS
);

// 管理者専用「バックアップ管理」画面（2026-08-29新設）。
initAdminBackupScreen(
  {
    statusText: adminBackupStatusElement,
    refreshButton: adminBackupRefreshButtonElement,
    recoveryRequestsList: adminRecoveryRequestsListElement,
    backupsList: adminBackupsListElement,
    backupsSearchInput: adminBackupsSearchInputElement,
    backupsUnnamedOnlyCheckbox: adminBackupsUnnamedOnlyCheckboxElement,
    selectAllButton: adminBackupsSelectAllButtonElement,
    clearSelectionButton: adminBackupsClearSelectionButtonElement,
    selectionStatusText: adminBackupsSelectionStatusElement,
    bulkDeleteButton: adminBackupsBulkDeleteButtonElement,
    bulkDeleteResultText: adminBackupsBulkDeleteResultElement,
    checkAtRiskButton: adminCheckAtRiskButtonElement,
    atRiskStatusText: adminAtRiskStatusElement,
    atRiskList: adminAtRiskListElement,
  },
  MEMBERS
);

// 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
// 音源診断ログ画面（管理者専用）。
initDebugAudioLogScreen({
  backButton: debugAudioLogBackButtonElement,
  refreshButton: debugAudioLogRefreshButtonElement,
  copyButton: debugAudioLogCopyButtonElement,
  clearButton: debugAudioLogClearButtonElement,
  status: debugAudioLogStatusElement,
  count: debugAudioLogCountElement,
  textarea: debugAudioLogTextareaElement,
  onBack: () => navigateWithScrollMemory("fanProfiles"),
});

// 【2026-11-XX新設・本人指示：iPhone下部の白い帯バグの実機診断】画面が切り替わるたび、
// および画面サイズ・visualViewportが変化するたび（iOS Safariのツールバー収縮・
// ソフトウェアキーボードの開閉等）に、そのときの画面サイズ・game-frameの実測値を
// js/viewportDiagnosticLog.jsへ記録する。ユーザー向けの表示・ゲーム進行には一切影響しない
// （js/debugAudioLogScreen.jsの既存の診断ログ画面から、本人がまとめてコピーできる）。
onScreenChange((screenName) => {
  captureViewportSnapshot(`[SCREEN] ${screenName}`);
});
// 【2026-11-XX新設・本人指示：最優先1】正解発表の音源ON/OFFは、オリジナル問題作成モードの
// 選曲画面と同じ値を共有する（js/revealAudioPreference.js参照）。あちら側で値を変えたあと、
// この通常設定画面へ戻ってきた場合でも表示がズレないよう、画面に入るたび保存値へ合わせ直す
// （js/customQuizScreen.jsのupdateQuizTypeFieldsetVisibility()と同じ理由の反対向きの対応）。
onScreenChange((screenName) => {
  if (screenName === "lyricsQuizSetup") {
    syncRevealAudioToggle('input[name="lyrics-quiz-reveal-audio"]', getLyricsQuizRevealAudioEnabled);
  } else if (screenName === "instantChallengeSetup") {
    syncRevealAudioToggle('input[name="instant-challenge-reveal-audio"]', getInstantChallengeRevealAudioEnabled);
  }
});
window.addEventListener("resize", () => {
  captureViewportSnapshot("[RESIZE] window");
});
window.visualViewport?.addEventListener("resize", () => {
  captureViewportSnapshot("[RESIZE] visualViewport");
});

// スタート画面のプレイヤー名・推しメン表示と、プレイヤー管理モーダル（2026-08-03追加）。
initPlayerScreen(
  {
    playerHeroSwatch: playerHeroSwatchElement,
    playerNameChip: playerNameChipElement,
    playerNameChipText: playerNameChipTextElement,
    oshiSummaryChip: oshiSummaryChipElement,
    oshiSummaryChipText: oshiSummaryChipTextElement,
    playerModal: playerModalElement,
    playerModalCloseButton: playerModalCloseButtonElement,
    playerList: playerListElement,
    playerAddInput: playerAddInputElement,
    playerAddButton: playerAddButtonElement,
    playerDeleteConfirmModal: playerDeleteConfirmModalElement,
    playerDeleteCancelButton: playerDeleteCancelButtonElement,
    playerDeleteConfirmButton: playerDeleteConfirmButtonElement,
    storageStatusText: storagePersistenceStatusElement,
    onSelectOshiSummary: () => {
      playClickSound();
      renderMembersScreen(SONGS, MEMBERS, MEMBER_PROFILES);
      showScreen("members");
    },
    onPlayerChanged: () => {
      // プレイヤーが切り替わったら、スタート画面の自己ベスト表示も新しいプレイヤーのものに更新する。
      updateModeBestScoreDisplay();
      // 収録曲一覧「すべての曲」タブは起動時に一度だけ作られて使い回されるため、
      // ハートボタンの見た目も新しいプレイヤーのお気に入り状態に合わせて描き直す
      // （お気に入りタブ・プレイリスト画面は開くたびに作り直されるため対応不要）。
      refreshAllFavoriteButtons();
      // 連続再生が「お気に入り」「プレイリスト」を再生元にしていた場合、切替後も
      // 前のプレイヤーの曲を鳴らし続けてしまうため止める（「全曲」のときは何もしない）。
      handleContinuousPlayerChanged();
      // スタート画面タイルのお気に入り・プレイリスト数も、新しいプレイヤーのものに更新する。
      updateListenTileCounts();
    },
  },
  MEMBERS
);

// スタート画面（推しアイコン）に戻るたびに、王冠・ダイヤの表示を最新の状態にし直す
// （2026-08-07追加。タイムアタック・ランダム再生クイズ・歌詞クイズの結果画面で
// ＝LOVEマスター等を新規獲得した場合でも、ホームへ戻ってきた時点で必ず反映されるようにする）。
//
// 同じタイミングで、公開プロフィール（オン中のユーザーのみ）もFirebaseへ同期する
// （2026-08-07追加）。表示名変更・推し変更・新しい称号獲得は、いずれもこのタイミングで
// 必ずスタート画面を経由するため、呼び出し箇所を1つにまとめられる（本人指示のとおり
// 「変更があった時だけ更新」は、publicProfileSync.js内の内容比較で担保している。
// awaitしない＝プレイの流れを一切ブロックしない、失敗してもここで握りつぶす設計）。
onScreenChange((screenName) => {
  if (screenName === "start") {
    renderPlayerSummary();
    syncPublicProfileIfEnabled(getPlayerKeyPrefix());
    // 「みんなのプロフィール」ONユーザーの、既存タイムアタック自己ベストのランキング反映
    // （2026-08-07追加）。プレイヤーごとに1回だけ実行される（内部でフラグ管理）。
    backfillTimeAttackLeaderboardIfNeeded(getPlayerKeyPrefix());
    // 【2026-09-04新設、本人指示：実際に「一度もバックアップが作られていなかった」
    // プレイヤーが見つかったことを受けての対応】以前は称号取得・自己ベスト更新等、
    // データが変化した瞬間だけscheduleBackupSync()を呼んでいたため、何もデータが
    // 変化しないままアプリを開閉していたプレイヤーは、一度もバックアップが作られない
    // ままになりうる不具合があった。上のsyncPublicProfileIfEnabled()と同じく、
    // スタート画面へ戻るたびに（＝アプリを開くたびに、ほぼ必ず一度は通る場所）
    // ここでも同期を試みることで、この取りこぼしを防ぐ。scheduleBackupSync()自体は
    // 内部で「前回と内容が変わっていなければ書き込まない」判定を持つため、
    // 呼び出し回数が増えても無駄な書き込みは増えない。
    scheduleBackupSync();
  }
});

// スタート画面の「プレイリスト」リンクと、プレイリスト一覧・詳細画面（2026-08-04追加）。
initPlaylistScreen({
  playlistList: playlistListElement,
  playlistEmptyNotice: playlistEmptyNoticeElement,
  playlistCreateInput: playlistCreateInputElement,
  playlistCreateButton: playlistCreateButtonElement,
  playlistDeleteConfirmModal: playlistDeleteConfirmModalElement,
  playlistDeleteCancelButton: playlistDeleteCancelButtonElement,
  playlistDeleteConfirmButton: playlistDeleteConfirmButtonElement,
  playlistDetailName: playlistDetailNameElement,
  playlistDetailCount: playlistDetailCountElement,
  playlistDetailList: playlistDetailListElement,
  emptyState: playlistDetailEmptyStateElement,
  continuousPlayButton: playlistDetailContinuousPlayButtonElement,
  addSongsButton: playlistDetailAddSongsButtonElement,
  onSelectPlaylist: (playlistId) => {
    playClickSound();
    renderPlaylistDetail(playlistId);
    navigateWithScrollMemory("playlistDetail");
  },
  onContinuousPlay: openContinuousPlayFromPlaylistDetail,
  onAddSongs: (playlistId) => {
    playClickSound();
    playlistAddSongsTargetId = playlistId;
    renderPlaylistAddSongsScreen(playlistId);
    navigateWithScrollMemory("playlistAddSongs");
  },
});

playlistLinkElement.addEventListener("click", () => {
  playClickSound();
  renderPlaylistList();
  navigateWithScrollMemory("playlists");
});

playlistBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// プレイリスト詳細画面の「戻る」：試聴中の曲を必ず止めてから一覧へ戻る
// （songlist-back-buttonと同じ考え方。詳細画面では曲の削除・並び替えが起きるため、
// 一覧の曲数表示が最新になるよう描き直してから戻る）。
playlistDetailBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  stopSongListPreview();
  renderPlaylistList();
  navigateWithScrollMemory("playlists");
});

// プレイリストへの曲追加画面（UI/UX再設計で新設）。
initPlaylistAddSongsScreen({
  title: playlistAddSongsTitleElement,
  groupsContainer: playlistAddSongsGroupsElement,
  noResultsNotice: playlistAddSongsNoResultsNoticeElement,
  searchInput: playlistAddSongsSearchInputElement,
  searchClearButton: playlistAddSongsSearchClearButtonElement,
  selectedCount: playlistAddSongsSelectedCountElement,
  submitButton: playlistAddSongsSubmitButtonElement,
  actionBanner: playlistAddSongsActionBannerElement,
  onSubmit: (playlistId) => {
    playClickSound();
    renderPlaylistDetail(playlistId);
    navigateWithScrollMemory("playlistDetail");
  },
});

// 曲追加画面の「戻る」：何も追加せず、対象にしていたプレイリストの詳細画面へ戻る。
playlistAddSongsBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  if (playlistAddSongsTargetId) {
    renderPlaylistDetail(playlistAddSongsTargetId);
    navigateWithScrollMemory("playlistDetail");
  } else {
    navigateWithScrollMemory("playlists");
  }
});

// 連続再生画面（2026-08-04新設、同日中に1画面構成へ改訂。UI/UX再設計で「次に再生」
// カード・再生キュー入口を追加）。
initContinuousPlayScreen({
  settingsIconButton: continuousPlaySettingsIconButtonElement,
  settingsToggle: continuousPlaySettingsToggleElement,
  settingsSummary: continuousPlaySettingsSummaryElement,
  settingsPanel: continuousPlaySettingsPanelElement,
  sourceButtons: continuousPlaySourceButtonElements,
  sourceExplain: continuousPlaySourceExplainElement,
  orderButtons: continuousPlayOrderButtonElements,
  orderExplain: continuousPlayOrderExplainElement,
  favoritesBlock: continuousPlayFavoritesBlockElement,
  favoritesOk: continuousPlayFavoritesOkElement,
  favoritesEmpty: continuousPlayFavoritesEmptyElement,
  favoritesExploreButton: continuousPlayFavoritesExploreButtonElement,
  playlistBlock: continuousPlayPlaylistBlockElement,
  playlistSummary: continuousPlayPlaylistSummaryElement,
  playlistSummaryText: continuousPlayPlaylistSummaryTextElement,
  playlistPicker: continuousPlayPlaylistPickerElement,
  playlistEmptyNotice: continuousPlayPlaylistEmptyNoticeElement,
  applyButton: continuousPlayApplyButtonElement,
  position: continuousPlayPositionElement,
  songTitle: continuousPlaySongTitleElement,
  songMeta: continuousPlaySongMetaElement,
  statusText: continuousPlayStatusTextElement,
  notice: continuousPlayNoticeElement,
  repeatButton: continuousPlayRepeatButtonElement,
  seekRow: continuousPlaySeekRowElement,
  seekRange: continuousPlaySeekRangeElement,
  currentTime: continuousPlayCurrentTimeElement,
  duration: continuousPlayDurationElement,
  controls: continuousPlayControlsElement,
  toggleButton: continuousPlayToggleButtonElement,
  prevButton: continuousPlayPrevButtonElement,
  nextButton: continuousPlayNextButtonElement,
  nextCard: continuousPlayNextCardElement,
  nextTitle: continuousPlayNextTitleElement,
  queueLink: continuousPlayQueueLinkElement,
  queueLinkCount: continuousPlayQueueLinkCountElement,
  lyricsSection: continuousPlayLyricsSectionElement,
  lyricsPanel: continuousPlayLyricsPanelElement,
  lyricsFullscreenButton: continuousPlayLyricsFullscreenButtonElement,
  emptyMessage: continuousPlayEmptyMessageElement,
  onOpenQueue: () => {
    playClickSound();
    renderQueueScreen();
    navigateWithScrollMemory("continuousPlayQueue");
  },
  onExploreFavorites: () => {
    playClickSound();
    resetSongListToDefaultView("favorites");
    navigateWithScrollMemory("songlist");
  },
});

// 再生キュー画面（UI/UX再設計で新設）。「戻る」は常に連続再生画面へ戻る
// （この画面は連続再生画面からしか開かないサブ画面のため、他画面のような
// 「開く前の画面を覚えておく」仕組みは不要と判断した）。
initContinuousPlayQueueScreen({
  sourceChip: continuousPlayQueueSourceChipElement,
  list: continuousPlayQueueListElement,
  actionBanner: continuousPlayQueueActionBannerElement,
});

continuousPlayQueueBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("continuousPlay");
});

// ミニプレイヤー（UI/UX再設計で新設）：連続再生本体・再生キュー画面以外の
// どの画面からでも、今なにが流れているかが分かるよう常時表示する。
// 本体をタップすると、今いた画面を戻り先として覚えたうえで連続再生画面を開く
// （continuousPlayReturnScreen・navigateWithScrollMemoryは他の入口と共通の仕組み）。
initMiniPlayer({
  root: miniPlayerRootElement,
  main: miniPlayerMainElement,
  title: miniPlayerTitleElement,
  status: miniPlayerStatusElement,
  time: miniPlayerTimeElement,
  toggleButton: miniPlayerToggleButtonElement,
  stopButton: miniPlayerStopButtonElement,
  onOpen: () => {
    playClickSound();
    continuousPlayReturnScreen = document.body.dataset.screen;
    refreshContinuousPlayScreen();
    navigateWithScrollMemory("continuousPlay");
  },
});

// 「連続再生」リンク（スタート画面）：開くたびに、今の再生状態（再生中ならそのまま、
// まだ何も始めていなければ設定パネルを開いた状態）に合わせて表示し直す。
continuousPlayLinkElement.addEventListener("click", () => {
  playClickSound();
  continuousPlayReturnScreen = "start";
  refreshContinuousPlayScreen();
  navigateWithScrollMemory("continuousPlay");
});

// 収録曲一覧の「連続再生で聴く」：今見ているタブ（すべて/お気に入り）を再生元にする。
songlistContinuousPlayLinkElement.addEventListener("click", () => {
  playClickSound();
  continuousPlayReturnScreen = "songlist";
  const prefillSource = getActiveSonglistTab() === "favorites" ? "favorites" : "all";
  refreshContinuousPlayScreen({ source: prefillSource });
  navigateWithScrollMemory("continuousPlay");
});

// プレイリスト詳細の「このプレイリストを連続再生」：そのプレイリストを再生元にして開く。
function openContinuousPlayFromPlaylistDetail(playlistId) {
  playClickSound();
  continuousPlayReturnScreen = "playlistDetail";
  refreshContinuousPlayScreen({ source: "playlist", playlistId });
  navigateWithScrollMemory("continuousPlay");
}

// 連続再生画面の「戻る」：本人希望により、画面を移動しても再生は止めない
// （クイズ・試聴を別途開始したときだけ、playbackCoordinator.js経由で自動的に
// 一時停止される）。開いた直前の画面（スタート/収録曲一覧/プレイリスト詳細）へ戻す。
continuousPlayBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory(continuousPlayReturnScreen);
});

// 【2026-08-29追加、本人指示（⑭)】オリジナル問題作成モードの3種類選択画面。
// 選んだ種類を、一覧画面（プリセットの絞り込み・表示）と選曲画面（欄の出し分け・保存内容）の
// 両方へ反映してから、一覧画面へ進む。
function selectCustomQuizTypeAndGoToPresets(quizType) {
  playClickSound();
  setCustomQuizPresetsType(quizType);
  setCustomQuizType(quizType);
  renderCustomQuizPresetsScreen();
  navigateWithScrollMemory("customQuizPresets");
}

customQuizTypeSelectBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});
customQuizTypeSelectIntroButtonElement.addEventListener("click", () => {
  selectCustomQuizTypeAndGoToPresets(CUSTOM_QUIZ_TYPE.INTRO);
});
customQuizTypeSelectRandomPlaybackButtonElement.addEventListener("click", () => {
  selectCustomQuizTypeAndGoToPresets(CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK);
});
customQuizTypeSelectLyricsButtonElement.addEventListener("click", () => {
  selectCustomQuizTypeAndGoToPresets(CUSTOM_QUIZ_TYPE.LYRICS_QUIZ);
});
customQuizTypeSelectOutroButtonElement.addEventListener("click", () => {
  selectCustomQuizTypeAndGoToPresets(CUSTOM_QUIZ_TYPE.OUTRO_QUIZ);
});
customQuizTypeSelectInstantButtonElement.addEventListener("click", () => {
  selectCustomQuizTypeAndGoToPresets(CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE);
});

// オリジナル問題作成モード・一瞬チャレンジタイプの開始（2026-08-30新設、本人指示：後半②）。
// js/instantChallengeScreen.jsのstartInstantChallengeFromCustomPreset()が、あらかじめ選んだ
// 曲だけを出題プールにする（出題数は選んだ曲すべて＝questionCountValue:"all"固定）。
// 既存の一瞬チャレンジ問題・結果画面（#instant-challenge-question-screen等）をそのまま使う。
async function beginCustomInstantChallengeQuiz(songIds, settings) {
  const started = await startInstantChallengeFromCustomPreset(songIds, settings);
  if (!started) {
    console.warn("[オリジナル問題作成モード] 一瞬チャレンジタイプの開始に失敗しました（音源不足）", songIds);
    return;
  }
  setInstantChallengeBackLabels("customQuiz");
  showScreen("instantChallengeQuestion");
  startInstantChallengePlay();
}

// プリセットの種類（preset.quizType）に応じて、3つの開始処理のうちどれを呼ぶかを振り分ける
// 共通処理（2026-08-29追加、本人指示（⑭)）。「▶ プレイ」・プリセット詳細モーダルの
// 「▶ このセットでプレイ」の両方から使う。valueは種類に応じてdistractorModeまたは
// answerPoolSizeValueのどちらかの意味を持つ（preset自身が両方保持しているため、
// preset側の値をそのまま使えば呼び出し側で迷わない）。
async function beginCustomQuizByPreset(preset) {
  if (preset.quizType === CUSTOM_QUIZ_TYPE.LYRICS_QUIZ) {
    const started = await beginCustomLyricsQuiz(preset.songIds, {
      answerPoolSizeValue: preset.answerPoolSizeValue,
      distractorMode: preset.distractorMode,
    });
    if (!started) {
      // ごく稀なケース（対象曲の歌詞データが後から削除された等）。専用の案内欄が無いため、
      // デバッグ用にコンソールへだけ出す（js/lyricsQuizScreen.jsのlogInsufficientSongsForDebug
      // と同じ、一般利用者向け画面には出さない方針）。
      console.warn("[オリジナル問題作成モード] 歌詞クイズタイプの開始に失敗しました", preset);
    }
    return;
  }
  if (preset.quizType === CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK) {
    beginCustomRandomPlaybackQuiz(preset.songIds, preset.distractorMode);
    return;
  }
  if (preset.quizType === CUSTOM_QUIZ_TYPE.OUTRO_QUIZ) {
    beginCustomOutroQuiz(preset.songIds, preset.distractorMode);
    return;
  }
  if (preset.quizType === CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE) {
    beginCustomInstantChallengeQuiz(preset.songIds, {
      playDurationValue: preset.playDurationValue,
      answerPoolSizeValue: preset.answerPoolSizeValue,
      distractorMode: preset.distractorMode,
    });
    return;
  }
  beginCustomQuiz(preset.songIds, preset.distractorMode);
}

// オリジナル問題作成モードのプリセット一覧画面：「＋新しいセットを作る」／
// 保存済みプリセットのタップ、どちらも選曲画面（#custom-quiz-screen）を開く。
initCustomQuizPresetsScreen({
  eyebrowLabel: customQuizPresetsEyebrowLabelElement,
  listContainer: document.getElementById("custom-quiz-presets-list"),
  emptyState: document.getElementById("custom-quiz-presets-empty-state"),
  searchInput: document.getElementById("custom-quiz-presets-search-input"),
  savedBanner: document.getElementById("custom-quiz-presets-saved-banner"),
  onCreateNew: () => {
    playClickSound();
    openCustomQuizScreenForNewPreset(getCustomQuizType());
    showScreen("customQuiz");
  },
  onSelectPreset: (preset) => {
    playClickSound();
    openCustomQuizScreenForPreset(preset);
    showScreen("customQuiz");
  },
  // 「▶ プレイ」：選曲画面を経由せず直接クイズを始める。結果画面の「もう一度挑戦する」も
  // 正しく同じ内容を再開できるよう、先に「直前の開始内容」を更新しておく。
  onPlayPreset: (preset) => {
    playClickSound();
    setLastStartedCustomQuizSelection(preset.songIds, preset.distractorMode, preset.answerPoolSizeValue);
    beginCustomQuizByPreset(preset);
  },
  // 複製アイコン：一覧を離れず複製し、そのまま複製した内容の編集画面を開く
  // （複製は「少し変えて使いたい」場面が前提のため、名前や曲を調整しやすいようにする）。
  onDuplicatePreset: (preset) => {
    playClickSound();
    const duplicate = duplicatePreset(preset.id);
    if (duplicate) {
      openCustomQuizScreenForPreset(duplicate);
      showScreen("customQuiz");
    }
  },
  // 一覧カードのゴミ箱アイコン（確認モーダルで確定後）：プリセットを削除し、一覧を描画し直す。
  // すでにこの一覧画面にいるので、選曲画面からの削除と違いshowScreen()は不要。
  onDeletePreset: (preset) => {
    playClickSound();
    deletePreset(preset.id);
    renderCustomQuizPresetsScreen();
    showPresetActionBanner(`「${preset.name}」を削除しました`);
  },
  listDeleteConfirmModal: customQuizPresetsDeleteConfirmModalElement,
  listDeleteCancelButton: document.getElementById("custom-quiz-presets-delete-cancel-button"),
  listDeleteConfirmButton: document.getElementById("custom-quiz-presets-delete-confirm-button"),
  detailModal: customQuizPresetDetailModalElement,
  detailCloseButton: document.getElementById("custom-quiz-preset-detail-close"),
  detailTitle: document.getElementById("custom-quiz-preset-detail-title"),
  detailMemo: document.getElementById("custom-quiz-preset-detail-memo"),
  detailSummary: document.getElementById("custom-quiz-preset-detail-summary"),
  detailGroups: document.getElementById("custom-quiz-preset-detail-groups"),
  detailPlayButton: document.getElementById("custom-quiz-preset-detail-play-button"),
});

// 曲IDの配列を受け取ってクイズを組み立て、開始する共通処理。
// 苦手曲モードだけでなく、将来のモードなど「曲を選んでクイズを始める」系の特別モード全般で、
// そのまま使い回せるようにしてある（「どの曲を選ぶか」は各モードの確認画面が担当し、
// ここでは選ばれた曲でクイズを始めることだけに専念する）。
// ダミー選択肢のプールは常に全曲（"all"）から選ぶ（苦手曲モード用）。
async function beginSpecialQuiz(songIds, questionCountValue, specialModeId) {
  stopTimer();
  stopAudio();
  const distractorPool = await filterSongsWithImportedAudio(filterSongsByCategory(SONGS, "all"));
  const questions = buildQuestionsFromSongIds(songIds, distractorPool);
  startSpecialQuiz(questions, questionCountValue, specialModeId);
  showScreen("quiz");
  renderQuestion();
}

// 苦手曲モード「アウトロ」タブの練習開始（2026-08-30新設、本人指示：苦手曲5系統完全分離）。
// beginSpecialQuiz()と曲の絞り込み・問題の組み立ては全く同じで、specialModeIdだけ
// "weakSongsOutro"にする。renderQuestion()側の再生位置の分岐がこのidを見て、
// アウトロクイズと同じ「曲の最後5秒」再生になる。
async function beginWeakSongsOutroPractice(songIds, questionCountValue) {
  stopTimer();
  stopAudio();
  const distractorPool = await filterSongsWithImportedAudio(filterSongsByCategory(SONGS, "all"));
  const questions = buildQuestionsFromSongIds(songIds, distractorPool);
  startSpecialQuiz(questions, questionCountValue, "weakSongsOutro");
  showScreen("quiz");
  renderQuestion();
}

// 苦手曲モード「シャッフル」タブの練習開始（2026-08-30新設、本人指示：苦手曲5系統完全分離）。
// beginCustomRandomPlaybackQuiz()と同じ考え方：曲の絞り込み・問題の組み立てはイントロ形式と
// 変わらず、再生開始位置だけをランダム再生用の種（seed）とcomputeRandomStartTimeSec()で
// ランダムにする。specialModeIdを"weakSongsShuffle"にすることで、renderQuestion()側の
// 再生位置の分岐がランダム再生（js/randomPlaybackEngine.js）を使うようになる。
async function beginWeakSongsShufflePractice(songIds, questionCountValue) {
  stopTimer();
  stopAudio();
  const distractorPool = await filterSongsWithImportedAudio(filterSongsByCategory(SONGS, "all"));
  const questions = buildQuestionsFromSongIds(songIds, distractorPool);
  generateNewRandomPlaybackSeed();
  startSpecialQuiz(questions, questionCountValue, "weakSongsShuffle");
  showScreen("quiz");
  renderQuestion();
}

// 苦手曲モードB（歌詞クイズ版）の練習開始（2026-08-29新設、本人指示）。
// beginSpecialQuiz()（イントロ側の苦手曲モードA）と対になる関数だが、エンジン自体が
// 歌詞クイズ（js/lyricsQuizScreen.js）のため別関数にしている。曲IDから問題を組み立てる
// 部分は、既存の歌詞クイズの出題エンジン（js/lyricsQuizQuestionBuilder.js）をそのまま使う
// （js/lyricsQuizScreen.jsのstartManualSelectionLyricsQuizRun参照）。
// 戻り値：実際に開始できたか（曲の歌詞データが後から削除された等で開始できない、
// ごく稀なケースをjs/weakSongsScreen.js側が案内できるようにするため）。
async function beginWeakSongsLyricsPractice(songIds, answerPoolSizeValue) {
  const started = await startManualSelectionLyricsQuizRun(songIds, answerPoolSizeValue, "weakSongPractice");
  if (!started) return false;
  playSfx(SFX_EVENTS.GAME_START);
  updateLyricsQuizBackButtonLabel();
  showScreen("lyricsQuizQuestion");
  startLyricsQuizPlay();
  return true;
}

// オリジナル問題作成モード用のクイズ開始処理。beginSpecialQuiz()と違い、ダミー選択肢の
// プールを「選択した曲だけ」「全収録曲」から選べる点が異なるため、別関数にしている。
// 【2026-08-15改訂・本人指示】選曲画面（曲を選ぶ一覧）自体は「情報として見える」ことは
// 問題ないため音源の有無で絞り込まないが、実際にクイズを始める時点では、出題する曲
// （songIds）自体も音源読み込み済みの曲だけに絞り込む（音源が無い曲を選んでいても、
// 出題自体はスキップされる＝音源が無い曲がクイズ本編に登場することはなくなる）。
// ただし絞り込んだ結果、出題できる曲が1つも残らない場合は、本人の選曲を無視しないよう
// 絞り込み前のsongIdsのまま進める（既存の「音源が読み込まれていません」という
// 安全な案内に委ねる。選曲自体が全滅する事故を防ぐための保険）。
async function beginCustomQuiz(songIds, distractorMode) {
  stopTimer();
  stopAudio();
  const selectedSongs = SONGS.filter((song) => songIds.includes(song.id));
  const playableSelectedSongs = await filterSongsWithImportedAudio(selectedSongs);
  const playableSongIds = playableSelectedSongs.map((song) => song.id);
  const questionSongIds = playableSongIds.length > 0 ? playableSongIds : songIds;
  // 【2026-10-01改訂・本人指示：正解プールと選択肢全体の母集団を分離】以前は
  // distractorMode==="selected"のとき、正解も不正解候補も選んだ曲だけから生成していた
  // ため、選択曲数が少ないと（例：4曲選択で4択なら）毎回同じ顔ぶれしか出なくなっていた。
  // 今はdistractorModeがカテゴリー（表題曲のみ/表題曲＋全員曲/全曲）そのものになり、
  // 不正解候補は常にこのカテゴリー全体から選ぶ（本人指示：選んだ曲の数に関わらず、
  // 十分な数の不正解候補を確保する）。
  const distractorCategoryPool = filterSongsByCategory(SONGS, distractorMode);
  const distractorPool = await filterSongsWithImportedAudio(distractorCategoryPool);
  const questions = buildQuestionsFromSongIds(questionSongIds, distractorPool);
  startSpecialQuiz(questions, String(questions.length), "customQuiz");
  showScreen("quiz");
  renderQuestion();
}

// オリジナル問題作成モード・アウトロタイプの開始処理（2026-08-30新設、本人指示）。
// 曲の絞り込み・問題の組み立てはbeginCustomQuiz()と全く同じ（出題の仕組み自体はイントロと
// 共通のため）。specialModeIdを"outroQuiz"にすることで、renderQuestion()側の再生位置の分岐
// （js/main.jsのgameState.specialModeId参照）がアウトロ再生（曲の最後5秒）を使うようになる。
async function beginCustomOutroQuiz(songIds, distractorMode) {
  stopTimer();
  stopAudio();
  const selectedSongs = SONGS.filter((song) => songIds.includes(song.id));
  const playableSelectedSongs = await filterSongsWithImportedAudio(selectedSongs);
  const playableSongIds = playableSelectedSongs.map((song) => song.id);
  const questionSongIds = playableSongIds.length > 0 ? playableSongIds : songIds;
  // 【2026-10-01改訂・本人指示：正解プールと選択肢全体の母集団を分離】以前は
  // distractorMode==="selected"のとき、正解も不正解候補も選んだ曲だけから生成していた
  // ため、選択曲数が少ないと（例：4曲選択で4択なら）毎回同じ顔ぶれしか出なくなっていた。
  // 今はdistractorModeがカテゴリー（表題曲のみ/表題曲＋全員曲/全曲）そのものになり、
  // 不正解候補は常にこのカテゴリー全体から選ぶ（本人指示：選んだ曲の数に関わらず、
  // 十分な数の不正解候補を確保する）。
  const distractorCategoryPool = filterSongsByCategory(SONGS, distractorMode);
  const distractorPool = await filterSongsWithImportedAudio(distractorCategoryPool);
  const questions = buildQuestionsFromSongIds(questionSongIds, distractorPool);
  // 【重要】specialModeIdは専用の"outroQuiz"（カテゴリー絞り込みの設定画面から始まった回、
  // 通常クイズに近い扱いで苦手曲モードへ合流する）とは別の"customQuizOutro"にする
  // （既存のcustomQuiz/customQuizRandomPlaybackと同じく、厳選した曲だけのプレイを
  // 苦手曲判定へ混ぜないため。js/state.jsのrecordAnswer()参照）。再生ロジック自体は
  // renderQuestion()側で両方とも同じアウトロ再生を使うようにしている。
  startSpecialQuiz(questions, String(questions.length), "customQuizOutro");
  showScreen("quiz");
  renderQuestion();
}

// オリジナル問題作成モード・ランダム再生タイプの開始処理（2026-08-29新設、本人指示（⑭)）。
// 曲の絞り込み・問題の組み立て（buildQuestionsFromSongIds）はbeginCustomQuiz()と全く同じ
// （出題する曲・ダミー選択肢の決め方自体はイントロ形式と変わらない。違うのは「曲のどこを
// 再生するか」だけ）。specialModeIdを"customQuizRandomPlayback"にすることで、
// renderQuestion()側の再生位置の分岐（js/main.jsのgameState.specialModeId参照）が
// ランダム再生（js/randomPlaybackEngine.js）を使うようになる。
async function beginCustomRandomPlaybackQuiz(songIds, distractorMode) {
  stopTimer();
  stopAudio();
  const selectedSongs = SONGS.filter((song) => songIds.includes(song.id));
  const playableSelectedSongs = await filterSongsWithImportedAudio(selectedSongs);
  const playableSongIds = playableSelectedSongs.map((song) => song.id);
  const questionSongIds = playableSongIds.length > 0 ? playableSongIds : songIds;
  // 【2026-10-01改訂・本人指示：正解プールと選択肢全体の母集団を分離】以前は
  // distractorMode==="selected"のとき、正解も不正解候補も選んだ曲だけから生成していた
  // ため、選択曲数が少ないと（例：4曲選択で4択なら）毎回同じ顔ぶれしか出なくなっていた。
  // 今はdistractorModeがカテゴリー（表題曲のみ/表題曲＋全員曲/全曲）そのものになり、
  // 不正解候補は常にこのカテゴリー全体から選ぶ（本人指示：選んだ曲の数に関わらず、
  // 十分な数の不正解候補を確保する）。
  const distractorCategoryPool = filterSongsByCategory(SONGS, distractorMode);
  const distractorPool = await filterSongsWithImportedAudio(distractorCategoryPool);
  const questions = buildQuestionsFromSongIds(questionSongIds, distractorPool);
  generateNewRandomPlaybackSeed();
  startSpecialQuiz(questions, String(questions.length), "customQuizRandomPlayback");
  showScreen("quiz");
  renderQuestion();
}

// オリジナル問題作成モード・歌詞クイズタイプの開始処理（2026-08-29新設、本人指示（⑭)）。
// エンジン自体が歌詞クイズ（js/lyricsQuizScreen.js）のため、苦手曲モードBの練習開始
// （beginWeakSongsLyricsPractice）と同じ仕組みをそのまま再利用する。currentRunSourceを
// "customQuiz"にすることで、自己ベスト・称号・歌詞クイズ版の苦手曲統計のいずれにも
// 反映されない（既存のイントロ形式オリジナル問題作成モードと同じ方針。SPECIAL_MODES_DISPLAY.
// customQuizのresultNote「この結果は、自己ベスト・称号には反映されません」と揃えている）。
// 戻り値：実際に開始できたか（曲の歌詞データが後から削除された等、ごく稀なケース）。
async function beginCustomLyricsQuiz(songIds, { answerPoolSizeValue, distractorMode }) {
  const started = await startManualSelectionLyricsQuizRun(songIds, answerPoolSizeValue, "customQuiz", distractorMode);
  if (!started) return false;
  playSfx(SFX_EVENTS.GAME_START);
  updateLyricsQuizBackButtonLabel();
  showScreen("lyricsQuizQuestion");
  startLyricsQuizPlay();
  return true;
}

// 苦手曲モード確認画面の描画に使うDOM要素一式を渡して初期化する。
initWeakSongsScreen({
  availableSection: document.getElementById("weak-songs-available-section"),
  emptyState: document.getElementById("weak-songs-empty-state"),
  countValue: document.getElementById("weak-songs-count-value"),
  allLabel: document.getElementById("weak-songs-all-label"),
  chipRow: document.getElementById("weak-songs-chip-row"),
  countNotice: weakSongsCountNoticeElement,
  startButton: document.getElementById("weak-songs-start-button"),
  explanation: document.getElementById("weak-songs-explanation"),
  modeIntroButton: document.getElementById("weak-songs-mode-intro-button"),
  modeOutroButton: document.getElementById("weak-songs-mode-outro-button"),
  modeShuffleButton: document.getElementById("weak-songs-mode-shuffle-button"),
  modeLyricsButton: document.getElementById("weak-songs-mode-lyrics-button"),
  modeInstantButton: document.getElementById("weak-songs-mode-instant-button"),
  questionCountFieldset: document.getElementById("weak-songs-question-count-fieldset"),
  instantDurationFieldset: document.getElementById("weak-songs-instant-duration-fieldset"),
  instantAnswerPoolFieldset: document.getElementById("weak-songs-instant-answer-pool-fieldset"),
  instantQuestionCountFieldset: document.getElementById("weak-songs-instant-question-count-fieldset"),
  onStart: (songIds, questionCountValue) => {
    playClickSound();
    beginSpecialQuiz(songIds, questionCountValue, "weakSongs");
  },
  // 【2026-08-30追加、本人指示：苦手曲5系統完全分離】アウトロ・シャッフルタブの開始。
  onStartOutro: (songIds, questionCountValue) => {
    playClickSound();
    beginWeakSongsOutroPractice(songIds, questionCountValue);
  },
  onStartShuffle: (songIds, questionCountValue) => {
    playClickSound();
    beginWeakSongsShufflePractice(songIds, questionCountValue);
  },
  // 【2026-08-29追加】苦手曲モードB（歌詞クイズ版）の開始。開始できなかった場合
  // （対象曲の歌詞データが後から削除された等、ごく稀なケース）は、ネイティブのalert()では
  // なく既存の出題数案内欄を流用して画面内に案内を出す（本人指示に基づく既存デザインの再利用）。
  onStartLyrics: async (songIds, answerPoolSizeValue) => {
    playClickSound();
    const started = await beginWeakSongsLyricsPractice(songIds, answerPoolSizeValue);
    if (!started) {
      weakSongsCountNoticeElement.hidden = false;
      weakSongsCountNoticeElement.textContent =
        "対象曲の歌詞データが見つからないため開始できませんでした。データパックの導入状況を確認してください。";
    }
  },
  // 【2026-08-30追加、本人指示：苦手曲5系統完全分離】一瞬タブの開始。既存の
  // #instant-challenge-question-screen・#instant-challenge-result-screenをそのまま再利用する
  // （js/instantChallengeScreen.jsのstartInstantChallengeWeakSongsPractice()参照）。
  onStartInstant: async (songIds, settings) => {
    playClickSound();
    const started = await startInstantChallengeWeakSongsPractice(songIds, settings);
    if (!started) {
      weakSongsCountNoticeElement.hidden = false;
      weakSongsCountNoticeElement.textContent =
        "対象曲の音源が読み込まれていないため開始できませんでした。スタート画面の「音源を読み込む」から追加してください。";
      return;
    }
    setInstantChallengeBackLabels("weakSongs");
    showScreen("instantChallengeQuestion");
    startInstantChallengePlay();
  },
});

// 【2026-08-30追加、本人指示：苦手曲5系統完全分離／オリジナル問題作成モード一瞬対応】
// 苦手曲モード「一瞬」タブ・オリジナル問題作成モードからの開始中は、一瞬チャレンジ問題画面・
// 結果画面の「戻る」文言をそれぞれの遷移先に合わせて差し替える（遷移先自体はmain.js側の
// isInstantChallengeWeakSongsPractice()・isInstantChallengeFromCustomPreset()を見て
// すでに正しい画面になっているため、これは表示文言だけの調整）。
// entryMode: null（通常）| "weakSongs" | "customQuiz"
function setInstantChallengeBackLabels(entryMode) {
  const backButtonTextNode = Array.from(instantChallengeBackButtonElement.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== ""
  );
  const labels = {
    weakSongs: { back: "苦手曲モードへ", setup: "← 苦手曲モードへ戻る" },
    customQuiz: { back: "セット一覧へ", setup: "← オリジナル問題一覧へ戻る" },
  };
  const label = labels[entryMode] ?? { back: "設定に戻る", setup: "← 一瞬チャレンジ設定へ戻る" };
  if (backButtonTextNode) {
    backButtonTextNode.textContent = label.back;
  }
  instantChallengeResultSetupButtonElement.textContent = label.setup;
}

// オリジナル問題作成モードの選曲画面の描画に使うDOM要素一式を渡して初期化する。
initCustomQuizScreen({
  groupsContainer: document.getElementById("custom-quiz-groups"),
  selectedCountValue: document.getElementById("custom-quiz-selected-count-value"),
  minNotice: document.getElementById("custom-quiz-min-notice"),
  selectAllButton: document.getElementById("custom-quiz-select-all-button"),
  deselectAllButton: document.getElementById("custom-quiz-deselect-all-button"),
  searchInput: document.getElementById("custom-quiz-search-input"),
  searchClearButton: document.getElementById("custom-quiz-search-clear-button"),
  noResultsNotice: document.getElementById("custom-quiz-no-results-notice"),
  selectedOnlyCheckbox: document.getElementById("custom-quiz-selected-only-checkbox"),
  previewAudioElement: document.getElementById("custom-quiz-preview-audio"),
  previewPlayer: document.getElementById("custom-quiz-preview-player"),
  previewTitle: document.getElementById("custom-quiz-preview-title"),
  previewToggleButton: document.getElementById("custom-quiz-preview-toggle-button"),
  previewSeekBackButton: document.getElementById("custom-quiz-preview-seek-back"),
  previewSeekForwardButton: document.getElementById("custom-quiz-preview-seek-forward"),
  previewFullscreenButton: document.getElementById("custom-quiz-preview-fullscreen-button"),
  previewSeekRange: document.getElementById("custom-quiz-preview-seek-range"),
  previewCurrentTime: document.getElementById("custom-quiz-preview-current-time"),
  previewDuration: document.getElementById("custom-quiz-preview-duration"),
  previewLyricsPanel: document.getElementById("custom-quiz-preview-lyrics"),
  distractorModeFieldset: customQuizDistractorModeFieldsetElement,
  answerPoolSizeFieldset: customQuizAnswerPoolSizeFieldsetElement,
  instantDurationFieldset: customQuizInstantDurationFieldsetElement,
  instantAnswerPoolSizeFieldset: customQuizInstantAnswerPoolSizeFieldsetElement,
  lyricsRevealAudioFieldset: customQuizLyricsRevealAudioFieldsetElement,
  instantRevealAudioFieldset: customQuizInstantRevealAudioFieldsetElement,
  nameInput: document.getElementById("custom-quiz-name-input"),
  memoInput: document.getElementById("custom-quiz-memo-input"),
  nameError: document.getElementById("custom-quiz-name-error"),
  saveButton: document.getElementById("custom-quiz-save-button"),
  deleteButton: document.getElementById("custom-quiz-delete-button"),
  deleteConfirmModal: document.getElementById("custom-quiz-delete-confirm-modal"),
  deleteCancelButton: document.getElementById("custom-quiz-delete-cancel-button"),
  deleteConfirmButton: document.getElementById("custom-quiz-delete-confirm-button"),
  duplicateButton: document.getElementById("custom-quiz-duplicate-button"),
  startButton: document.getElementById("custom-quiz-start-button"),
  // 【2026-08-29改訂、本人指示（⑭)】songIds以降の第2引数は、種類によってdistractorMode
  // （イントロ・ランダム再生）またはanswerPoolSizeValue（歌詞クイズ）のどちらかの意味を持つ
  // （js/customQuizScreen.jsのhandleStart参照）。ここではgetCustomQuizType()を見て
  // beginCustomQuizByPreset()と同じ3分岐で振り分ける。
  onStart: async (songIds, distractorModeOrAnswerPoolSizeValue) => {
    playClickSound();
    const quizType = getCustomQuizType();
    if (quizType === CUSTOM_QUIZ_TYPE.LYRICS_QUIZ) {
      const started = await beginCustomLyricsQuiz(songIds, distractorModeOrAnswerPoolSizeValue);
      if (!started) {
        console.warn("[オリジナル問題作成モード] 歌詞クイズタイプの開始に失敗しました", songIds);
      }
      return;
    }
    if (quizType === CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK) {
      beginCustomRandomPlaybackQuiz(songIds, distractorModeOrAnswerPoolSizeValue);
      return;
    }
    if (quizType === CUSTOM_QUIZ_TYPE.OUTRO_QUIZ) {
      beginCustomOutroQuiz(songIds, distractorModeOrAnswerPoolSizeValue);
      return;
    }
    if (quizType === CUSTOM_QUIZ_TYPE.INSTANT_CHALLENGE) {
      // 一瞬チャレンジタイプだけは、distractorModeOrAnswerPoolSizeValueが
      // { playDurationValue, answerPoolSizeValue } のオブジェクトになる
      // （js/customQuizScreen.jsのhandleStart参照）。
      await beginCustomInstantChallengeQuiz(songIds, distractorModeOrAnswerPoolSizeValue);
      return;
    }
    beginCustomQuiz(songIds, distractorModeOrAnswerPoolSizeValue);
  },
  // 「セットを保存する」：新規プリセットとして保存し、一覧画面を最新の内容で描画し直してから戻る。
  // クイズを一度も始めなくても、この時点で保存自体は完結している
  // （保存完了バナーは、一覧に「保存できた」ことがひと目で伝わるよう添えている）。
  onSave: (presetData) => {
    playClickSound();
    saveNewPreset(presetData);
    renderCustomQuizPresetsScreen();
    showScreen("customQuizPresets");
    showPresetActionBanner(`「${presetData.name}」を保存しました`);
  },
  // 「上書き保存する」：同じidのプリセットを更新し、一覧画面へ戻る。
  onUpdate: (id, presetData) => {
    playClickSound();
    updatePreset(id, presetData);
    renderCustomQuizPresetsScreen();
    showScreen("customQuizPresets");
    showPresetActionBanner(`「${presetData.name}」を更新しました`);
  },
  // 「削除する」（確認モーダルで確定後）：プリセットを削除し、一覧画面へ戻る
  // （削除したカードが消えていることが分かるよう、必ず最新の内容で描画し直す）。
  // バナーに使う名前は、削除前の保存済みデータから取得する
  // （編集中の名前欄が保存前の未確定な入力である可能性があるため）。
  onDelete: (id) => {
    playClickSound();
    const preset = getPresets().find((p) => p.id === id);
    deletePreset(id);
    renderCustomQuizPresetsScreen();
    showScreen("customQuizPresets");
    showPresetActionBanner(`「${preset?.name ?? ""}」を削除しました`);
  },
  // 「複製する」：複製してできた新しいプリセットを、そのまま選曲画面で開き直す
  // （複製は「少し変えて使いたい」場面が前提のため、名前や曲を調整しやすいよう
  // 一覧へは戻らず、この画面のまま新しいプリセットの編集に進む）。
  onDuplicate: (id) => {
    playClickSound();
    const duplicate = duplicatePreset(id);
    if (duplicate) {
      openCustomQuizScreenForPreset(duplicate);
    }
  },
});

// 音源の再生に失敗したときの表示処理。
// タイマーや得点処理は止めず、エラーメッセージを出すだけに留める。
function showAudioError(message) {
  audioErrorElement.textContent = message;
  audioErrorElement.hidden = false;
}

// ===== 【2026-09-16新設・本人指示：「音が出ない」救済ボタン（第1段階・共通基盤＋オフラインモード）】=====
// iOS実機で「音源自体は正常に読み込まれているのに一瞬だけ無音になる」現象が稀に起きることへの、
// 根本原因対策（IndexedDB接続の事前ウォームアップ・unlockのタイミング調整等）とは別の
// 「最後の安全網」。ユーザー自身が気付いたときに申告できるボタンを、音源を使う問題の
// 回答収集中だけ表示する。
//
// タイムシビア／非タイムシビアの判定ロジック本体（判定根拠のコメントも含む）は、
// テストから直接検証できるようjs/audioTroubleClassification.jsへ切り出してある
// （js/main.jsはDOM要素への参照を大量に持つためテストから直接importできない）。
function isCurrentQuizAudioTroubleTimeSevere() {
  return isAudioTroubleTimeSevere({ playMode: gameState.playMode, specialModeId: gameState.specialModeId });
}

// 一瞬チャレンジ（js/instantChallengeScreen.js）のMAX_SLOT_PLAYBACK_ATTEMPTSと同じ考え方・
// 同じ回数（元の再生＋差し替え2回＝計3回まで）に合わせている。非タイムシビアなモードで、
// 同じ問題スロットにつき「音が出ない」を何回まで受け付けて再生し直すかの上限。
const AUDIO_TROUBLE_MAX_ATTEMPTS_PER_QUESTION = 3;
// 今の問題スロット（gameState.currentIndex）で、これまでに何回「音が出ない」を確定したか。
// audioTroubleTrackedQuestionIndexが今のcurrentIndexと違えば「新しいスロットの1回目」と
// みなして自動的に0へリセットする（renderQuestion()の呼び出し箇所をすべて洗い出して
// フックする代わりに、参照時に自己修復させる設計。renderQuestion()自体は「次の問題を出す」
// 場合と「同じ問題を再生し直す」場合の両方から呼ばれるため、後者では回数を消してはいけない）。
let audioTroubleTrackedQuestionIndex = -1;
let audioTroubleAttemptCount = 0;

function resetAudioTroubleTrackingIfNewQuestion() {
  if (audioTroubleTrackedQuestionIndex !== gameState.currentIndex) {
    audioTroubleTrackedQuestionIndex = gameState.currentIndex;
    audioTroubleAttemptCount = 0;
  }
}

// クイズ画面に入るたび（新しい問題の描画・回答確定のたび）に呼ぶ、ボタンの表示制御。
// 「音源を使う問題の回答収集中」だけ表示する（タスク仕様どおり、カウントダウン中・
// 結果発表中・結果画面・ロビー画面では出さない）。対象外のplayMode（localBattle。
// この対戦モードは今回のタスク範囲外のため、既存の対戦モード担当ファイルには
// 一切手を加えず、ここで表示対象から外すだけにとどめる）では常に非表示にする。
// 【2026-09-16改訂・本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・個人進行系）】
// タイムアタック・ランダム再生対戦・アウトロクイズ対戦のオンライン対戦（playMode==="onlineBattle"）
// は、第1段階の時点では対象外にしていたが、今回対応する。ただし押したときの処理・確認文言が
// オフライン版（audioTroubleButtonElement）とは別物のため、DOM要素ごと分けている
// （onlineBattleAudioTroubleButtonElement）。1つの問題で両方が同時に表示されることは
// playModeで完全に排他のため起こらない。
function updateAudioTroubleButtonVisibilityForQuestion() {
  const isSupportedPlayMode = ["normal", "review", "special", "timeAttack", "randomPlayback"].includes(
    gameState.playMode
  );
  audioTroubleButtonElement.hidden = !isSupportedPlayMode;
  audioTroubleButtonElement.disabled = false;

  const isOnlineBattle = gameState.playMode === "onlineBattle";
  onlineBattleAudioTroubleButtonElement.hidden = !isOnlineBattle;
  onlineBattleAudioTroubleButtonElement.disabled = false;
}

// 回答が確定した瞬間（正解・不正解・スキップ・答えを見る、タイムアタックの正解/確定不正解の
// どのルートでも）に呼ぶ、ボタンを隠す共通処理。「回答収集中だけ表示する」を保証する。
// 【2026-09-16改訂】オンライン対戦（個人進行系）の回答確定もhandleTimedChoiceClick()経由で
// この関数を呼ぶため、両方のボタンをまとめて隠す（元々どちらか一方しか表示されていないため、
// 両方隠しても無害）。
function hideAudioTroubleButton() {
  audioTroubleButtonElement.hidden = true;
  onlineBattleAudioTroubleButtonElement.hidden = true;
}

// 「音が出ない」を確定したときの入口。連打対策（disabled）・確認ダイアログを経てから、
// タイムシビア/非タイムシビアで別の処理に分岐する。
function handleAudioTroubleButtonClick() {
  if (audioTroubleButtonElement.disabled) return; // 連打対策
  if (gameState.isAnswered) return; // 保険。回答確定後は本来ボタン自体が非表示になっている
  audioTroubleButtonElement.disabled = true;

  const isTimeSevere = isCurrentQuizAudioTroubleTimeSevere();
  // 【確認ダイアログについて】js/answerConfirmPrompt.jsのpromptAnswerConfirm()は
  // 「『曲名』で回答しますか？」という回答確定専用の固定文言・ボタン表示（「回答する」）を
  // 持つ共有モーダルで、一瞬チャレンジ・一瞬バトル等の「回答前の1回確認」専用に作られている
  // （役割が異なる今回の用途に流用すると、ユーザーに「回答した」と誤解させるおそれがある）。
  // 一方、js/onlineBattleScreen.jsは「退出させますか？」「ホストを渡しますか？」等、
  // 回答確定とは無関係な運用操作の確認にwindow.confirm()を使っている。今回の「音が出ない」も
  // 同じ「回答確定とは別の操作の確認」にあたるため、こちらのパターンを踏襲する。
  const confirmMessage = isTimeSevere
    ? "音が出ませんでしたか？\n\n「OK」を選ぶと、今回のプレイは中断し、記録（自己ベスト・ランキング等）には保存されません。"
    : "音が出ませんでしたか？\n\n「OK」を選ぶと、この問題をもう一度再生し直します。";
  const confirmed = window.confirm(confirmMessage);

  if (!confirmed) {
    audioTroubleButtonElement.disabled = false;
    return;
  }

  // js/audio.js（第2段階でも再利用する共通基盤）へ、今の再生トークンに対する
  // 「音が出ない」申告を記録しておく。オフライン各モードは以降の判断をgameState側で
  // 完結できるため、戻り値自体は今回使わないが、共通基盤を経由させておくことで
  // 診断ログ（audio.js側）にも記録が残る。
  reportPlaybackTrouble();

  if (isTimeSevere) {
    abortCurrentRunDueToAudioTrouble();
    return;
  }

  handleNonTimeSevereAudioTrouble();
}

// タイムシビアなモード用：今回のプレイを「無効」として扱い、記録には一切残さず、
// 既存の「クイズを中断してタイトル/設定画面に戻る」処理（quitCurrentQuizWithoutSaving、
// 元は#quiz-quit-confirm-buttonのクリック処理）をそのまま再利用して安全な画面へ戻る。
// その後、静かに「保存されなかった」ことを伝える一言をwindow.alert()で出す
// （新しいバナーUIを増やさず、確認ダイアログと同じwindow.confirm系の作法に揃える）。
function abortCurrentRunDueToAudioTrouble() {
  quitCurrentQuizWithoutSaving();
  window.alert("音源のトラブルのため、今回のプレイは中断しました。自己ベスト・ランキング等の記録には保存されていません。");
}

// 非タイムシビアなモード用：既定回数（AUDIO_TROUBLE_MAX_ATTEMPTS_PER_QUESTION）までは
// 同じ問題を最初から再生し直し、それでも改善しなければこの問題だけを「出題されなかった扱い」
// にして次へ進む。
function handleNonTimeSevereAudioTrouble() {
  resetAudioTroubleTrackingIfNewQuestion();
  audioTroubleAttemptCount += 1;

  if (audioTroubleAttemptCount < AUDIO_TROUBLE_MAX_ATTEMPTS_PER_QUESTION) {
    // 【2026-09-16新設】同じ問題を最初から再生し直す、特別な再生。既存の「もう一度聞く」の
    // ような専用カウンターは持たず、通常のリプレイ回数・成績には一切数えない
    // （renderQuestion()は「新しい問題を出す」ときと全く同じ処理を、たまたま同じ
    // currentIndexのまま呼び出すだけで、スコア計算（handleChoiceClick等）には一切触れない）。
    stopTimer();
    stopAudio();
    renderQuestion();
    return;
  }

  skipCurrentQuestionAsNotAdministered();
}

// 既定回数試しても改善しなかった問題を、出題数から取り除く（「出題されなかった扱い」）。
// 【既存の予備曲差し替え機能との関係】js/instantChallengeScreen.jsには同じ考え方の
// 予備曲差し替え機能があるが、gameStateを経由しないこのモード専用の作り（モジュール内変数で
// 完結）になっており、通常/復習/特別モード（gameStateベース）から直接再利用できない。
// 本人指示のとおり、無ければ「この曲だけをスキップして次の問題へ進める」という
// 単純な形にとどめる（新しい曲を選び直して差し替える処理は今回追加しない）。
function skipCurrentQuestionAsNotAdministered() {
  stopTimer();
  stopAudio();
  hideAudioTroubleButton();
  gameState.questions.splice(gameState.currentIndex, 1);
  audioTroubleTrackedQuestionIndex = -1; // 次のスロットのために追跡状態をリセットしておく

  if (gameState.questions.length === 0) {
    // 出題できる問題が1問も残らなかった場合の最終手段：安全な画面へ戻る
    // （quitCurrentQuizWithoutSavingは特別モードごとの適切な戻り先も判定してくれる）。
    quitCurrentQuizWithoutSaving();
    window.alert("音源のトラブルが続いたため、この回は中断しました。データパックの導入状況や通信環境をご確認のうえ、もう一度お試しください。");
    return;
  }

  if (gameState.currentIndex >= gameState.questions.length) {
    // 取り除いたのがちょうど最後の1問だった場合：ここまでの内容で結果画面へ進む。
    renderResult();
    showScreen("result");
    return;
  }

  renderQuestion();
}

// ===== 【本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・
// 個人進行系：タイムアタック・ランダム再生対戦・アウトロクイズ対戦）】=====
// 上のオフライン版（handleAudioTroubleButtonClick）とは別のボタン（onlineBattleAudioTroubleButtonElement）
// 専用の入口。オンライン対戦のこの3モードは、js/battleModes/timeAttackBattleMode.jsの
// compareResults()を（ランダム再生・アウトロも含めて）共有しており、いずれのrule
// （normal/hard/loveChain）でも必ずelapsedMs（経過時間）を順位判定に使う、常にタイムシビアな
// モードのため、オフライン版のような「非タイムシビアなら同じ問題を再生し直す」分岐は存在しない。
// 【本人指示による再設計：試合全体無効化】早さが勝敗・記録に直結するこの3モードでは、
// 誰か1人でも本当に音が出なかった時点で試合全体の公平性が失われているため、
// 「申告した本人だけがこの試合から抜け、残りのプレイヤーだけで続行する」設計ではなく、
// 「試合全体を無効試合にし、勝敗を付けず、参加者全員分の記録を一切残さず、全員を
// 安全にロビーへ戻す」設計にしている（js/onlineBattleScreen.jsの
// abortOnlineBattleMatchDueToAudioTrouble()参照）。
function handleOnlineBattleAudioTroubleButtonClick() {
  if (onlineBattleAudioTroubleButtonElement.disabled) return; // 連打対策：押した瞬間に無効化する
  if (gameState.isAnswered) return; // 保険。回答確定後は本来ボタン自体が非表示になっている
  onlineBattleAudioTroubleButtonElement.disabled = true;

  // 【確認ダイアログについて】js/onlineBattleScreen.jsが退出確認・ホスト移譲確認等で
  // 使っているwindow.confirm()のパターンをそのまま踏襲する（上のオフライン版と同じ理由）。
  // 【本人指示による文言の作り直し】「あなただけ抜ける」ではなく、「この試合は公平に
  // 続けられないため、全員の対戦を中止してルームに戻る」という、何が起こるかが
  // 一目で分かる文言に変更した。
  const confirmed = window.confirm(
    "本当に音が出ませんでしたか？\n\nこの試合は公平に続けられないため、全員の対戦を中止してルームに戻ります。"
  );

  if (!confirmed) {
    onlineBattleAudioTroubleButtonElement.disabled = false;
    return;
  }

  // js/audio.jsの共通基盤へ申告を記録しておく（オフライン版と同じ理由、診断ログ用）。
  reportPlaybackTrouble();

  // 【2026-09-16追加】タイムアタックの正解/不正解演出後の自動進行予約（setTimeout）が
  // 残っていると、この画面を離れた後に発火して勝手に次の問題や結果画面へ進めてしまう
  // ため、quitCurrentQuizWithoutSaving()と全く同じ手順で確実に後始末してから離脱する。
  clearPendingTimeAttackAdvance();
  stopTimer();
  stopAudio();
  resetGameState();
  // 画面遷移（ルーム設定画面へ戻る）はabortOnlineBattleMatchDueToAudioTrouble()側が
  // 自分の持つ最新のroom情報を使って行う（js/onlineBattleScreen.js側の設計に合わせる）。
  abortOnlineBattleMatchDueToAudioTrouble();
}

// 自己ベストのチップに表示する、出題数・カテゴリの短縮ラベル。
// 出題数の「全曲」（5問/10問/20問/50問/全曲）とカテゴリの「全曲」が
// どちらも同じ表記だと紛らわしいため、出題数側だけ「全問」と表記して区別する。
const QUESTION_COUNT_LABELS = { "5": "5問", "10": "10問", "20": "20問", "50": "50問", all: "全問" };
const CATEGORY_LABELS = { all: "全曲", "title-and-group": "表題＋全員", "title-track": "表題のみ" };

// スタート画面で選択中の出題数・カテゴリに対応する自己ベストを表示する。
// ラジオボタンが切り替わるたびと、スタート画面に戻るたびに呼び出す。
function updateModeBestScoreDisplay() {
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;
  const best = getHighScore(questionCountValue, categoryFilterValue);

  modeBestConditionElement.textContent =
    `${QUESTION_COUNT_LABELS[questionCountValue]}・${CATEGORY_LABELS[categoryFilterValue]}`;
  modeBestValueElement.textContent = best > 0 ? `ベスト ${best}点` : "ベスト 記録なし";
  modeBestChipElement.classList.toggle("is-empty", best === 0);
}

// カテゴリの選択肢に、現在の対象曲数を添える。SONGSから毎回数え直すので、
// 新曲・アルバム曲・配信限定曲を追加しても自動的に数字が更新される。起動時に1回だけ呼べばよい。
function updateCategoryCountHints() {
  document.querySelectorAll(".count-hint[data-category-count]").forEach((hintElement) => {
    const categoryFilterValue = hintElement.dataset.categoryCount;
    const count = filterSongsByCategory(SONGS, categoryFilterValue).length;
    hintElement.textContent = `${count}曲`;
  });
}

// 選んだ出題数が、選んだカテゴリ・音源読み込み済みの対象曲数を上回っているときだけ、
// 「実際は何問になるか」を事前に案内する。ラジオボタンが切り替わるたびに呼び出す。
// resolveQuestionCount自体（quiz.js）はすでに曲数に収まるよう切り詰める作りなので、
// ここでは同じ考え方でその結果を先に見せているだけで、出題ロジックには手を加えていない。
// 【2026-08-15改訂】音源未読み込みの曲も出題対象から除外されるようになったため、
// 「対象曲数」はカテゴリの絞り込みだけでなく音源の読み込み状況も反映する（非同期）。
async function updateQuestionCountNotice() {
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;

  if (questionCountValue === "all") {
    questionCountNoticeElement.hidden = true;
    return;
  }

  const categoryPool = filterSongsByCategory(SONGS, categoryFilterValue);
  const playablePool = await filterSongsWithImportedAudio(categoryPool);
  const poolSize = playablePool.length;
  const requestedCount = Number(questionCountValue);
  if (requestedCount > poolSize) {
    questionCountNoticeElement.textContent = `対象曲数が${questionCountValue}曲未満のため、全${poolSize}問を出題します`;
    questionCountNoticeElement.hidden = false;
  } else {
    questionCountNoticeElement.hidden = true;
  }
}

// 得点カウントアップ演出にかける時間。
const SCORE_COUNT_UP_DURATION_MS = 800;

// 合計得点を0から実際の点数まで、アニメーションしながらカウントアップ表示する。
// 「モーションを減らす」設定が有効な環境では、演出をせず即座に最終的な点数を表示する。
function animateScoreCountUp(finalScore) {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) {
    totalScoreElement.textContent = `合計得点: ${finalScore}点`;
    return;
  }

  playCountUpSound();
  const startTime = performance.now();

  function step(now) {
    const progress = Math.min(1, (now - startTime) / SCORE_COUNT_UP_DURATION_MS);
    const currentScore = Math.floor(finalScore * progress);
    totalScoreElement.textContent = `合計得点: ${currentScore}点`;

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

// タイマーの経過秒数表示を更新する。
function updateTimerDisplay(elapsedSec) {
  timerDisplayElement.textContent = `経過: ${elapsedSec}秒`;
}

// 正解の選択肢に「is-correct」（キラキラ演出）、選んでしまった不正解の選択肢に
// 「is-wrong」（シェイク演出）のクラスを付ける。selectedChoiceIdがnullなら
// （＝時間切れで何も選んでいない）正解の表示だけを行う。
function markChoiceButtons(selectedChoiceId) {
  const question = getCurrentQuestion();
  choiceButtonElements.forEach((button, index) => {
    const choice = question.choices[index];
    if (choice.id === question.song.id) {
      button.classList.add("is-correct");
    } else if (choice.id === selectedChoiceId) {
      button.classList.add("is-wrong");
    }
  });
}

// 次の問題を表示する前に、前の問題の演出クラス・無効化状態を消しておく。
// disabledのリセットは、タイムアタック（ノーマルルール）で前の問題で無効化した
// ボタンが次の問題に持ち越されないようにするためのもの。他のモードでは
// ボタンを無効化することがないため、ここで一律にリセットしても影響はない。
function clearChoiceButtonStates() {
  choiceButtonElements.forEach((button) => {
    button.classList.remove("is-correct", "is-wrong");
    button.disabled = false;
  });
}

// 次の問題があればそれを表示し、なければ結果画面を表示する共通処理。
// 「次へ」ボタン・スキップの両方から呼ばれる。
function goToNextQuestionOrResult() {
  const hasMoreQuestions = advanceToNextQuestion();
  if (hasMoreQuestions) {
    renderQuestion();
    return;
  }

  // タイムアタックは、既存の結果画面（result）ではなく専用の結果画面に飛ばす。
  // 自己ベスト判定・保存もrenderTimeAttackResult()の中で完結している。
  if (gameState.playMode === "timeAttack") {
    renderTimeAttackResult();
    showScreen("timeAttackResult");
    return;
  }

  // ランダム再生クイズも、既存の結果画面（result）ではなく専用の結果画面に飛ばす。
  // タイムアタックと同じ考え方だが、自己ベストの保存先だけが別（js/randomPlaybackScore.js）。
  if (gameState.playMode === "randomPlayback") {
    showRandomPlaybackResult();
    return;
  }

  renderResult();
  showScreen("result");
}

// 回答済みになったときに、スキップ・答えを見るボタンを隠す共通処理。
// （選択肢クリック・スキップ・答えを見る、どのルートで回答済みになっても呼ぶ）
function hideSkipAndRevealButtons() {
  skipButtonElement.hidden = true;
  revealButtonElement.hidden = true;
}

// 正解時・不正解時（ハード／LOVE連チャン）の自動遷移までの間（演出を見せる時間）。
// 正解は一瞬でよいので短め、不正解は「どれが正解だったか」を読み取れるよう少し長めにしている。
const TIME_ATTACK_CORRECT_ADVANCE_DELAY_MS = 200;
const TIME_ATTACK_WRONG_REVEAL_DELAY_MS = 430;

// 上記の演出時間のあいだに予約したsetTimeoutのID。「タイトルへ」で中断されたときに
// 確実に取り消すために保持しておく（保持しないと、中断して別の画面に移った後で
// タイマーが発火し、勝手に結果画面へ飛ばされる/次の問題が描画される、という不具合になる）。
let pendingTimeAttackAdvanceTimeoutId = null;

function scheduleTimeAttackAdvance(callback, delayMs) {
  clearPendingTimeAttackAdvance();
  pendingTimeAttackAdvanceTimeoutId = window.setTimeout(() => {
    pendingTimeAttackAdvanceTimeoutId = null;
    callback();
  }, delayMs);
}

function clearPendingTimeAttackAdvance() {
  if (pendingTimeAttackAdvanceTimeoutId === null) return;
  window.clearTimeout(pendingTimeAttackAdvanceTimeoutId);
  pendingTimeAttackAdvanceTimeoutId = null;
}

// タイムアタック専用の選択肢クリック処理。
// 通常モードの「正解！次へ」のような手動確認は挟まず、短い演出のあと自動で次に進む。
// ノーマルルール：不正解の選択肢はその場で無効化するだけで、問題そのものは終わらせない
// （正解するまでgameState.isAnsweredはfalseのままにし、他の選択肢を選び直せるようにする。
// 遅延も挟まず、テンポを落とさない）。
// ハード・LOVE連チャンルール：1回間違えたら、押した選択肢を赤、本当の正解を黄色で少しだけ見せてから、
// 自動で次の問題（ハード）または結果画面（LOVE連チャン）へ進む。
// タイムアタック・対戦モード共通：正解/不正解のクリック処理の本体。
// ノーマル/ハード/LOVE連チャンのルール分岐・ボタンの色演出・記録は、この2つのモードで
// 完全に同じ（対戦モードは「タイムアタックと全く同じ進め方を、対戦用の問題で行う」ため）。
// 「次の問題へ進む処理」と「（LOVE連チャンで）その場でゲームが終わったときの処理」だけを
// 呼び出し側から受け取ることで、コードを2重に持たないようにしている。
//
// onAdvance : 正解した／ハードで即座に次へ進めるとき呼ぶ（残り問題があるかどうかの判定も
//             呼び出し側の責務。既存のgoToNextQuestionOrResult()と同じ形にすること）。
// onRunEnd  : LOVE連チャンで1回間違えて、残りの問題を待たずゲームが終わるときだけ呼ぶ。
function handleTimedChoiceClick(selectedChoice, { onAdvance, onRunEnd }) {
  // 他の操作とほぼ同時に起きても二重に処理しないためのガード。
  // ノーマルルールの不正解時はisAnsweredをtrueにしないため、このガードに引っかからず
  // 続けて他の選択肢を選べる。
  if (gameState.isAnswered) return;

  const question = getCurrentQuestion();
  const isCorrect = selectedChoice.id === question.song.id;
  const rule = getCurrentTimeAttackRule();

  // 押した選択肢の曲名を、正解・不正解を問わず記録しておく（タイムアタック履歴の詳細表示用。
  // 対戦モードはこの詳細を履歴として保存しないが、記録すること自体は無害なのでそのまま呼ぶ）。
  registerTimeAttackSelection(selectedChoice.title);

  if (isCorrect) {
    gameState.isAnswered = true;
    hideAudioTroubleButton();
    stopTimer();
    stopAudio();
    playCorrectSound();
    markChoiceButtons(selectedChoice.id); // 押した（＝正解の）選択肢だけを黄色く光らせる
    choiceButtonElements.forEach((button) => {
      button.disabled = true;
    });
    recordTimeAttackAnswer({ elapsedMs: getElapsedMsSincePlaybackStart(), isCorrect: true, question });
    scheduleTimeAttackAdvance(onAdvance, TIME_ATTACK_CORRECT_ADVANCE_DELAY_MS);
    return;
  }

  playWrongSound();

  if (rule === TIME_ATTACK_RULE.NORMAL) {
    // ノーマルルール：この選択肢だけ赤くして無効化する。正解はまだ明かさず、
    // 遅延なしですぐ残りの選択肢から選び直せるようにする（テンポを落とさない）。
    registerTimeAttackMiss();
    const wrongButtonIndex = question.choices.findIndex((choice) => choice.id === selectedChoice.id);
    if (wrongButtonIndex !== -1) {
      choiceButtonElements[wrongButtonIndex].classList.add("is-wrong");
      choiceButtonElements[wrongButtonIndex].disabled = true;
    }
    return;
  }

  // ハード・LOVE連チャンは、どちらも「1回間違えたらその問題は即確定」という点までは共通。
  // 押した選択肢を赤、本当の正解を黄色で表示してから（markChoiceButtons）、少し間を置いて進める。
  // LOVE連チャンだけ、さらに残りの問題を待たずゲーム自体をその場で終了させる
  // （markTimeAttackRunFailed()で「全問クリアできなかった」ことを記録する）。
  gameState.isAnswered = true;
  hideAudioTroubleButton();
  stopTimer();
  stopAudio();
  registerTimeAttackMiss();
  markChoiceButtons(selectedChoice.id);
  choiceButtonElements.forEach((button) => {
    button.disabled = true;
  });
  recordTimeAttackAnswer({ elapsedMs: getElapsedMsSincePlaybackStart(), isCorrect: false, question });

  if (rule === TIME_ATTACK_RULE.LOVE_CHAIN) {
    markTimeAttackRunFailed();
    scheduleTimeAttackAdvance(onRunEnd, TIME_ATTACK_WRONG_REVEAL_DELAY_MS);
    return;
  }

  scheduleTimeAttackAdvance(onAdvance, TIME_ATTACK_WRONG_REVEAL_DELAY_MS);
}

function handleTimeAttackChoiceClick(selectedChoice) {
  handleTimedChoiceClick(selectedChoice, {
    onAdvance: goToNextQuestionOrResult,
    onRunEnd: () => {
      renderTimeAttackResult();
      showScreen("timeAttackResult");
    },
  });
}

// ランダム再生クイズ専用の結果画面表示。js/randomPlaybackScreen.jsのrenderRandomPlaybackResult()に
// 出題数・カテゴリを渡す必要があるため、getLastTimeAttackSelection()（進行エンジンを共有している
// ため、ここにこのプレイの出題数・カテゴリが残っている）から取得する。
function showRandomPlaybackResult() {
  const { questionCountValue, categoryFilterValue } = getLastTimeAttackSelection();
  renderRandomPlaybackResult(questionCountValue, categoryFilterValue);
  showScreen("randomPlaybackResult");
}

// ランダム再生クイズの選択肢クリック処理。ルール進行はタイムアタックと完全に共通
// （上のhandleTimedChoiceClick）。違うのは「終わったときの行き先」だけ：
// ランダム再生専用の結果画面へ進み、タイムアタックの自己ベスト・履歴には一切保存しない。
function handleRandomPlaybackChoiceClick(selectedChoice) {
  handleTimedChoiceClick(selectedChoice, {
    onAdvance: goToNextQuestionOrResult,
    onRunEnd: showRandomPlaybackResult,
  });
}

// 対戦モードの選択肢クリック処理。ルール進行はタイムアタックと完全に共通（上のhandleTimedChoiceClick）。
// 違うのは「終わったときの行き先」だけ：対戦専用の結果画面へ進み、自己ベスト・タイムアタック履歴には
// 一切保存しない（js/localBattleScreen.jsのfinishBattlePlay参照）。
function handleBattleChoiceClick(selectedChoice) {
  handleTimedChoiceClick(selectedChoice, {
    onAdvance: goToNextBattleQuestionOrResult,
    onRunEnd: finishBattlePlay,
  });
}

// 選択肢ボタンをクリックしたときの処理。
// 正解なら経過秒数に応じた段階式のボーナス、不正解なら0点として記録する。
function handleChoiceClick(selectedChoice) {
  // タイムアタック・対戦モードだけは進め方が大きく異なるため、専用の処理に完全に任せる
  // （既存の通常/復習/特別モードのロジックには一切触れない）。
  if (gameState.playMode === "timeAttack") {
    handleTimeAttackChoiceClick(selectedChoice);
    return;
  }
  if (gameState.playMode === "randomPlayback") {
    handleRandomPlaybackChoiceClick(selectedChoice);
    return;
  }
  if (gameState.playMode === "localBattle") {
    handleBattleChoiceClick(selectedChoice);
    return;
  }
  if (gameState.playMode === "onlineBattle") {
    handleOnlineBattleChoiceClick(selectedChoice);
    return;
  }

  // 他の操作とほぼ同時に起きても二重に処理しないためのガード。
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  hideAudioTroubleButton();
  stopTimer();
  hideSkipAndRevealButtons();

  const question = getCurrentQuestion();
  const isCorrect = selectedChoice.id === question.song.id;
  // 無音の頭出しはaudio.js側で再生位置をずらして対応済みなので、
  // ここではもう曲ごとの無音秒数を差し引かない（elapsedSecがそのまま実際の聴取時間になる）。
  const points = isCorrect ? calculateScore(gameState.elapsedSec) : 0;
  recordAnswer(isCorrect ? "correct" : "wrong", points, getElapsedMsSincePlaybackStart());
  // 【2026-08-16追加】ランキング参加用のセッション所要時間の終了地点。「次へ」ボタンで
  // 結果画面へ移動する操作より前、通常プレイの最後の問題に自力で正解した瞬間だけを記録する
  // （本人指示：システム側の待ち時間・演出時間は含めない）。復習・特別モードはランキング対象外
  // のため対象外（playMode==="normal"のときだけ）。
  // 【2026-08-30追加、本人指示（後半③）】アウトロクイズ（通常導線）だけは例外的にランキング
  // 対象のため、こちらも対象に含める（customQuizOutro等は含まない、specialModeId==="outroQuiz"の
  // ときだけ）。
  const isOutroQuizDedicatedFlow = gameState.playMode === "special" && gameState.specialModeId === "outroQuiz";
  if (
    isCorrect &&
    (gameState.playMode === "normal" || isOutroQuizDedicatedFlow) &&
    gameState.currentIndex === gameState.questions.length - 1
  ) {
    gameState.quizFinishedAtMs = performance.now();
  }
  markChoiceButtons(selectedChoice.id);
  if (isCorrect) {
    playCorrectSound();
  } else {
    playWrongSound();
  }

  feedbackElement.textContent = isCorrect
    ? `正解！ +${points}点`
    : `不正解…（正解は「${question.song.title}」）`;
  // 正解/不正解を文字色でも一目で分かるようにするための、見た目だけのクラス切り替え
  feedbackElement.classList.toggle("is-correct", isCorrect);
  feedbackElement.classList.toggle("is-wrong", !isCorrect);
  feedbackElement.hidden = false;
  nextButtonElement.hidden = false;
}

// 「スキップ」ボタンを押したときの処理。
// 0点として記録し、正解は見せずにそのまま次の問題（または結果画面）へ進める。
function handleSkip() {
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  hideAudioTroubleButton();
  stopTimer();
  stopAudio();
  playClickSound();

  recordAnswer("skip", 0, getElapsedMsSincePlaybackStart());
  goToNextQuestionOrResult();
}

// 「答えを見る」ボタンを押したときの処理。
// 0点として記録し、正解の曲名を表示してから「次へ」ボタンで進めるようにする。
function handleReveal() {
  if (gameState.isAnswered) return;
  gameState.isAnswered = true;
  hideAudioTroubleButton();
  stopTimer();
  stopAudio();
  hideSkipAndRevealButtons();

  const question = getCurrentQuestion();
  recordAnswer("reveal", 0, getElapsedMsSincePlaybackStart());
  markChoiceButtons(null);
  playWrongSound();
  feedbackElement.textContent = `正解は「${question.song.title}」でした`;
  feedbackElement.hidden = false;
  nextButtonElement.hidden = false;
}

// 出題の進み具合を示すドットを表示する。
// 答え終えた問題は塗りつぶし、今の問題は少し大きく強調し、まだの問題は白抜きにする。
function renderProgressDots() {
  progressDotsElement.innerHTML = "";
  gameState.questions.forEach((_, index) => {
    const dot = document.createElement("span");
    dot.classList.add("dot");
    if (index < gameState.currentIndex) {
      dot.classList.add("is-done");
    } else if (index === gameState.currentIndex) {
      dot.classList.add("is-current");
    }
    progressDotsElement.appendChild(dot);
  });
}

// クイズ画面左上の「タイトルへ」（中断ボタン）と、その確認モーダルの文言を、
// 今のモードに合わせて切り替える。特別モードのクイズ中（playMode==="special"）だけ、
// そのモードの確認/一覧画面に戻れるよう文言・戻り先を差し替え、それ以外（通常プレイ・復習）は
// 従来通り常に「タイトルへ」にする。
// 復習クイズ中は、特別モードから来た場合も含めて一律「🔁復習」表示にしている既存の方針
// （renderQuestion内のprogressPrefix）に合わせ、ここでもreviewは対象外にしている。
function updateQuizQuitDisplay() {
  const isSpecial = gameState.playMode === "special";
  const isTimeAttack = gameState.playMode === "timeAttack";
  const isRandomPlayback = gameState.playMode === "randomPlayback";
  const isLocalBattle = gameState.playMode === "localBattle";
  const isOnlineBattle = gameState.playMode === "onlineBattle";
  const display = isSpecial ? SPECIAL_MODES_DISPLAY[gameState.specialModeId] : null;

  if (isTimeAttack) {
    // タイムアタックはモードが1種類しかないため、SPECIAL_MODES_DISPLAYのような
    // 一覧テーブルは作らず、ここに直接文言を書く。
    quizBackButtonLabelElement.textContent = "設定画面へ";
    quizQuitConfirmTitleElement.textContent = "タイムアタックを中断して設定画面に戻りますか？";
    quizQuitConfirmButtonElement.textContent = "設定画面に戻る";
    quizQuitRestartButtonElement.hidden = false;
    return;
  }

  if (isRandomPlayback) {
    // ランダム再生クイズもタイムアタックと同じ考え方（結果画面を経由せず設定画面へ戻る）。
    quizBackButtonLabelElement.textContent = "設定画面へ";
    quizQuitConfirmTitleElement.textContent = "ランダム再生クイズを中断して設定画面に戻りますか？";
    quizQuitConfirmButtonElement.textContent = "設定画面に戻る";
    quizQuitRestartButtonElement.hidden = false;
    return;
  }

  if (isLocalBattle) {
    // 対戦モードは中断すると、その対戦自体を諦めることになる（対戦コードを作り直す必要がある）。
    // 【2026-08-29追加、本人指示（追加5）】「やり直す」は対戦モード（ローカル・オンライン）では
    // 安全に成立しない（対戦相手・ルームの状態が絡むため）ため表示しない。
    quizBackButtonLabelElement.textContent = "対戦をやめる";
    quizQuitConfirmTitleElement.textContent = "対戦を中断してホームに戻りますか？（この対戦の結果コードは作られません）";
    quizQuitConfirmButtonElement.textContent = "対戦をやめる";
    quizQuitRestartButtonElement.hidden = true;
    return;
  }

  if (isOnlineBattle) {
    // オンライン対戦も中断すると結果を送信しない（ローカル対戦と同じ考え方）。
    // ルームからは退出するが、他の参加者はそのまま対戦を続けられる。
    quizBackButtonLabelElement.textContent = "対戦をやめる";
    quizQuitConfirmTitleElement.textContent = "対戦を中断してルームを退出しますか？（あなたの結果は送信されません）";
    quizQuitConfirmButtonElement.textContent = "対戦をやめる";
    quizQuitRestartButtonElement.hidden = true;
    return;
  }

  // 通常プレイ・復習・特別モード（苦手曲モードA・オリジナル問題作成モード）は
  // すべて「やり直す」を表示する。
  quizQuitRestartButtonElement.hidden = false;
  quizBackButtonLabelElement.textContent = display?.quizBackLabel ?? "タイトルへ";
  quizQuitConfirmTitleElement.textContent = display?.quizQuitTitle ?? "クイズを中断してタイトルに戻りますか？";
  quizQuitConfirmButtonElement.textContent = display?.quizQuitConfirmLabel ?? "タイトルに戻る";
}

// アウトロクイズの再生時間（本人指示：5秒固定）。
const OUTRO_QUIZ_PLAY_DURATION_SEC = 5;

// 【2026-11-XX新設・本人指示：最優先1（モード名表示の完成）】共通クイズ画面
// （#question-progress）は、通常プレイ・タイムアタック・ローカル対戦・オンライン対戦・
// ランダム再生クイズ・アウトロクイズ・苦手曲モード・オリジナル問題作成モードなど、
// 非常に多くの入口が共有している。「今どの種類（イントロ／ランダム再生／アウトロ）を
// 遊んでいるか」を一意に判断できる単一のgameStateフィールドがこれまで存在しなかったため、
// 新しいフィールドを追加する代わりに、renderQuestion()内の実際の音源再生位置判定
// （このすぐ下のif/elseチェーン。gameState.playMode・getCurrentTimeAttackVariant()・
// getPlaybackType(onlineBattleGameMode)・gameState.specialModeIdを見て、どの位置から
// 曲を再生するかを既に正しく決めている、対戦の公平性にも関わる既存のロジック）と
// 完全に同じ条件分岐をこの関数でも辿るだけにした。この既存ロジックが間違っていれば
// 音源の再生位置自体が既に壊れているはずなので、ここに新しい判定ミスが入り込む余地がない
// （「後から見た目のためだけに作った判定」ではなく「既に他の目的で正しさが保証されている
// 判定」に相乗りする設計）。
//
// special（苦手曲モード・オリジナル問題作成モード）・review（復習）は、
// SPECIAL_MODES_DISPLAYの絵文字接頭辞・「🔁 復習」という既存の表示が既にモードの種類を
// 伝えているため、この関数の対象外のまま変更していない（本人指示：「既に十分明確な
// 画面には、無理に追加しなくても構いません」）。
//
// 巨大な見出しは増やさず、既存の進捗表示への短い接頭辞の追記だけにとどめている
// （本人指示：「回答領域を狭くしないことを優先」）。オンライン対戦は、その場で
// gameMode文字列から既存のgetModeLabel()（js/battleModes/index.jsの各モードファイルが
// 持つexport const label、既にロビー等の表示と完全に同じ文言）をそのまま使うため、
// 表示名を新しく作らず・二重管理も発生しない。実際の判定ロジック本体（純粋関数）は
// js/quizModeLabel.jsへ切り出し、恒久テストから直接検証できるようにしている。
function computeNormalModeProgressPrefix() {
  return resolveQuizModeProgressPrefix({
    playMode: gameState.playMode,
    timeAttackVariant: gameState.playMode === "timeAttack" ? getCurrentTimeAttackVariant() : null,
    onlineBattleModeLabel: gameState.playMode === "onlineBattle" ? getModeLabel(onlineBattleGameMode) : null,
  });
}

// 今の問題の内容（進捗・4択の曲名）をクイズ画面に反映し、イントロ音源とタイマーを開始する。
function renderQuestion() {
  // 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
  // どのモードの、何問目の描画かを共有の音源診断タイムラインへ記録する
  // （js/audioDiagnosticLog.js。js/audio.js・js/soundManager.js側の記録と同じ
  // タイムラインに並ぶため、「このモードのこの問題番号のときに何が起きたか」を
  // 時系列で追えるようになる）。
  recordAudioDiagnostic("[QUESTION] renderQuestion開始", {
    playMode: gameState.playMode,
    specialModeId: gameState.specialModeId,
    questionIndex: gameState.currentIndex,
    questionCount: gameState.questions.length,
  });
  updateQuizQuitDisplay();
  const question = getCurrentQuestion();
  const progressLabel = `第${gameState.currentIndex + 1}問 / ${gameState.questions.length}問`;
  // 復習中は進捗表示に「🔁 復習」を、特別モード中はモードごとの接頭辞を添えて、
  // 通常プレイと見分けられるようにする。
  // 【2026-11-XX追加・本人指示：最優先1（モード名表示の完成）】review・special以外
  // （normal・randomPlayback・timeAttack・onlineBattle・localBattle）はこれまで接頭辞が
  // 常に空文字列で、「今何を遊んでいるか」が進捗表示からは分からなかった。
  // computeNormalModeProgressPrefix()が、この共通クイズ画面の実際の音源再生位置の
  // 判定（このすぐ下にある、gameState.playMode等を見る既存のif/elseチェーン）と
  // 完全に同じ条件分岐で接頭辞を決めるため、両者がズレることはない
  // （音源再生が正しい位置から鳴っている＝この判定の元になる状態自体が既に正しいことの
  // 証拠、という考え方。新しいgameStateフィールドは追加していない）。
  let progressPrefix = "";
  if (gameState.playMode === "review") {
    progressPrefix = "🔁 復習 ";
  } else if (gameState.playMode === "special") {
    progressPrefix = SPECIAL_MODES_DISPLAY[gameState.specialModeId]?.progressPrefix ?? "";
  } else {
    progressPrefix = computeNormalModeProgressPrefix();
  }
  questionProgressElement.textContent = `${progressPrefix}${progressLabel}`;
  renderProgressDots();

  choiceButtonElements.forEach((button, index) => {
    button.textContent = question.choices[index].title;
  });

  feedbackElement.hidden = true;
  feedbackElement.classList.remove("is-correct", "is-wrong");
  nextButtonElement.hidden = true;
  // タイムアタック・対戦モードは「正解！次へ」の一時停止を挟まないテンポ重視の進め方のため、
  // スキップ・答えを見るボタンは表示しない（正解するか、ハードルールで間違えるまで進めない）。
  const isTimedMode =
    gameState.playMode === "timeAttack" ||
    gameState.playMode === "randomPlayback" ||
    gameState.playMode === "localBattle" ||
    gameState.playMode === "onlineBattle";
  skipButtonElement.hidden = isTimedMode;
  revealButtonElement.hidden = isTimedMode;
  audioErrorElement.hidden = true;
  clearChoiceButtonStates();
  // 「🔇 音が出ない」救済ボタン：音源を使う問題の回答収集中だけ表示する
  // （タイムアタック等のisTimedModeでも、ボタン自体は隠さない＝出題対象に含める）。
  updateAudioTroubleButtonVisibilityForQuestion();

  // 再生を試みる直前の時刻をいったん暫定の計測起点にしておく。
  // 曲が実際に鳴り始めたら（onPlaybackStart）、より正確な値に上書きされる。
  markPlaybackStarted();

  // 【2026-09-12追加・本人指示：共有クイズエンジンの音源再生失敗対策】オンライン対戦中だけ、
  // 再生失敗時にshowAudioError（メッセージを出すだけ）の代わりにhandleOnlineBattleAudioFailure
  // （予備曲への差し替え・3回連続失敗時の安全な中断）を使う。オフライン（normal/review/special/
  // timeAttack/randomPlayback/localBattle）は今までと完全に同じshowAudioErrorのまま、
  // 挙動は一切変わらない。questionIndexをこの時点の値でクロージャに固定しておくことで、
  // 回答済み・次の問題へ進んだ後に遅れて届いた失敗report を安全に無視できるようにする。
  const audioFailureQuestionIndex = gameState.currentIndex;
  const audioFailureCallback =
    gameState.playMode === "onlineBattle"
      ? (message) => handleOnlineBattleAudioFailure(audioFailureQuestionIndex, message)
      : showAudioError;
  if (gameState.playMode === "randomPlayback") {
    // 1人用ランダム再生クイズ：曲の任意の位置から数秒間再生するplaySongFromRandomPosition()を使う。
    // 開始位置は、このプレイ開始時に発行したseed・曲ID・今の問題番号から純粋関数で計算する
    // （js/randomPlaybackEngine.js参照。同じ組み合わせなら毎回同じ位置になるが、
    // 問題番号や曲が変われば別の位置になる）。1台の端末で完結するモードのため、
    // durationSecはブラウザが実際に読み込んだ音源の長さ（audioElement.duration）を
    // そのまま使う（複数端末間の同期を考える必要が無いため、Phase4のような固定値化は不要）。
    // 自動停止時（onAutoStop）は、選択肢はそのまま操作できる状態を保つだけでよいため、
    // 特に何もしない。
    const seed = getCurrentRandomPlaybackSeed();
    const questionIndex = gameState.currentIndex;
    const computeStartTimeSec = (durationSec) =>
      computeRandomStartTimeSec({ seed, songId: question.song.id, questionIndex, durationSec });
    playSongFromRandomPosition(
      question.song,
      computeStartTimeSec,
      RANDOM_PLAYBACK_DEFAULTS.playDurationSec,
      showAudioError,
      markPlaybackStarted,
      () => {}
    );
  } else if (gameState.playMode === "timeAttack" && getCurrentTimeAttackVariant() === TIME_ATTACK_VARIANT.RANDOM_PLAYBACK) {
    // タイムアタックのランダム再生variant（2026-08-07新設）：上のスタンドアロン版
    // 「ランダム再生クイズ」と全く同じ考え方・全く同じ既存関数（js/randomPlaybackEngine.js）を
    // そのまま再利用し、種(seed)の取得元だけがtimeAttackScreen.js（getCurrentTimeAttackSeed）に
    // なっている。複製ではなく、同じ計算式を別の呼び出し元から使っているだけ。
    const seed = getCurrentTimeAttackSeed();
    const questionIndex = gameState.currentIndex;
    const computeStartTimeSec = (durationSec) =>
      computeRandomStartTimeSec({ seed, songId: question.song.id, questionIndex, durationSec });
    playSongFromRandomPosition(
      question.song,
      computeStartTimeSec,
      RANDOM_PLAYBACK_DEFAULTS.playDurationSec,
      showAudioError,
      markPlaybackStarted,
      () => {}
    );
  } else if (gameState.playMode === "onlineBattle" && onlineRandomPlaybackContext) {
    // 【2026-08-08新設・Phase4】オンライン対戦のランダム再生クイズ：全端末が同じ結果になる
    // ことが必須のため、乱数計算にはonlineRandomPlaybackContext.seed（試合開始時に確定した
    // room.seed）と、js/data/audioMetadata.jsの固定durationSecだけを使う。実際にブラウザが
    // 読み込んだ音源の長さ（actualDurationSec）は、乱数計算そのものには一切混ぜず、
    // 「実際にシークできる範囲を超えない」ための安全策（クランプ）にしか使わない
    // （本人の指示どおり。詳細はHANDOFF.md参照）。
    const { seed, matchId } = onlineRandomPlaybackContext;
    const questionIndex = gameState.currentIndex;
    const songId = question.song.id;
    const fixedDurationSec = AUDIO_METADATA[songId]?.durationSec ?? null;

    if (fixedDurationSec === null) {
      // 【本人の指示、2026-08-08】固定durationが無い曲は、黙って先頭再生へフォールバック
      // せず、この問題の再生自体を行わない（全端末で公平な位置を保証できないため）。
      // 本来はvalidateSettings()（js/battleModes/randomPlaybackBattleMode.js）が対戦開始
      // 自体を拒否しているはずで、通常はここに到達しない。その防御が万一漏れた場合の保険。
      audioFailureCallback("この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    } else {
      const computeStartTimeSec = (actualDurationSec) => {
        if (!isDurationMismatchWithinTolerance(fixedDurationSec, actualDurationSec)) {
          // 【本人の指示、2026-08-08】固定durationと実際の音源長の差が許容範囲
          // （js/randomPlaybackEngine.jsのMAX_DURATION_MISMATCH_SEC）を超える場合、
          // 端末ごとに開始位置がズレて対戦の公平性が崩れるため、無言でクランプして
          // 続行せず、この曲の再生を中止する。stopAudio()は世代番号を進めて
          // 再生要求そのものを無効化するため、この直後に走るplay()も安全に何もしない。
          stopAudio();
          audioFailureCallback("この曲の音源が他の端末と異なる可能性があります。音源を入れ直してください。");
          if (isRandomPlaybackDebugLoggingEnabled()) {
            // 【本人の指示、2026-08-08】MAX_DURATION_MISMATCH_SEC（現在0.75秒、実機検証後に
            // 確定予定の仮の安全値。HANDOFF.md参照）の妥当性を実機で判断できるよう、
            // 曲名・固定duration・実際のduration・差分をデバッグ時だけ確認できるようにする。
            // 一般ユーザー向け画面には出さない（showAudioErrorの文言は簡潔なまま）。
            console.warn("[randomPlayback] durationの許容差を超えたため再生を中止しました", {
              matchId,
              songId,
              songTitle: question.song.title,
              fixedDurationSec,
              actualDurationSec,
              diffSec: Math.abs(actualDurationSec - fixedDurationSec),
              maxMismatchSec: MAX_DURATION_MISMATCH_SEC,
            });
          }
          return 0;
        }
        const canonicalStartTimeSec = computeRandomStartTimeSec({
          seed,
          songId,
          questionIndex,
          durationSec: fixedDurationSec,
        });
        const clampedStartTimeSec = clampStartTimeToActualDuration(canonicalStartTimeSec, actualDurationSec);
        if (isRandomPlaybackDebugLoggingEnabled()) {
          // 【2026-08-08追記・本人の指示】実機でMAX_DURATION_MISMATCH_SEC（0.75秒）の妥当性を
          // 判断できるよう、クランプが発生した場合だけでなく、正常時（差が無い・小さい場合）も
          // 毎問記録する。PC・iPhone・Androidそれぞれでこのログを見比べれば、
          // 「同じ曲でどれくらいdurationの差が出るか」を実際の数値で確認できる。
          const diffSec = Math.abs(actualDurationSec - fixedDurationSec);
          console.log("[randomPlayback] duration確認", {
            matchId,
            songId,
            songTitle: question.song.title,
            fixedDurationSec,
            actualDurationSec,
            diffSec: Number(diffSec.toFixed(3)),
            clamped: clampedStartTimeSec !== canonicalStartTimeSec,
          });
        }
        return clampedStartTimeSec;
      };
      playSongFromRandomPosition(
        question.song,
        computeStartTimeSec,
        RANDOM_PLAYBACK_DEFAULTS.playDurationSec,
        audioFailureCallback,
        markPlaybackStarted,
        () => {}
      );
    }
  } else if (gameState.playMode === "onlineBattle" && getPlaybackType(onlineBattleGameMode) === "outroPosition") {
    // 【2026-08-30新設、本人指示㉔】オンライン対戦「アウトロクイズ」：曲の最後5秒を再生する。
    // ランダム再生対戦と違い、開始位置はseedに関係なく曲ごとに固定（js/data/audioMetadata.jsの
    // outroStartSec）なので、乱数計算・durationの許容差チェックは一切不要（js/battleModes/
    // outroBattleMode.jsのvalidateSettingsが、outroStartSecを持たない曲を対戦開始時点で
    // 弾いているため、ここに来る時点で必ず値が存在する）。
    const outroStartSec = AUDIO_METADATA[question.song.id]?.outroStartSec;
    if (outroStartSec === undefined) {
      // validateSettingsの防御が万一漏れた場合の保険（本来ここには来ない想定）。
      audioFailureCallback("この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    } else {
      playSongFromRandomPosition(
        question.song,
        () => outroStartSec,
        OUTRO_QUIZ_PLAY_DURATION_SEC,
        audioFailureCallback,
        markPlaybackStarted,
        () => {}
      );
    }
  } else if (
    gameState.playMode === "special" &&
    (gameState.specialModeId === "customQuizRandomPlayback" || gameState.specialModeId === "weakSongsShuffle")
  ) {
    // 【2026-08-29追加、本人指示（⑭）】オリジナル問題作成モードのランダム再生タイプ。
    // 【2026-08-30追加、本人指示：苦手曲5系統完全分離】苦手曲モード「シャッフル」タブの練習も
    // 同じ再生位置ロジックを使う（js/main.jsのbeginWeakSongsShufflePractice()参照）。
    // 上のスタンドアロン版「ランダム再生クイズ」・タイムアタックのランダム再生variantと
    // 全く同じ既存関数（js/randomPlaybackEngine.js）をそのまま再利用し、種(seed)の取得元だけが
    // js/randomPlaybackScreen.jsのgenerateNewRandomPlaybackSeed()（beginCustomRandomPlaybackQuiz・
    // beginWeakSongsShufflePractice参照）になっている。1台の端末で完結するモードのため、
    // 複数端末間の同期は考慮不要。
    const seed = getCurrentRandomPlaybackSeed();
    const questionIndex = gameState.currentIndex;
    const computeStartTimeSec = (durationSec) =>
      computeRandomStartTimeSec({ seed, songId: question.song.id, questionIndex, durationSec });
    playSongFromRandomPosition(
      question.song,
      computeStartTimeSec,
      RANDOM_PLAYBACK_DEFAULTS.playDurationSec,
      showAudioError,
      markPlaybackStarted,
      () => {}
    );
  } else if (
    gameState.playMode === "special" &&
    (gameState.specialModeId === "outroQuiz" ||
      gameState.specialModeId === "customQuizOutro" ||
      gameState.specialModeId === "weakSongsOutro")
  ) {
    // 【2026-08-30新設、本人指示】アウトロクイズ：曲の最後5秒（無音・フェードアウトを
    // 機械的に避けた位置、js/data/audioMetadata.jsのoutroStartSec参照）を再生する。
    // この値が無い曲（音源はあるがまだdev/generate_audio_metadata.pyを再実行していない場合の
    // 保険）は、単純に「曲の長さ-5秒」へフォールバックする。
    const audioMeta = AUDIO_METADATA[question.song.id];
    const computeStartTimeSec = (durationSec) =>
      audioMeta?.outroStartSec ?? Math.max(0, durationSec - OUTRO_QUIZ_PLAY_DURATION_SEC);
    playSongFromRandomPosition(
      question.song,
      computeStartTimeSec,
      OUTRO_QUIZ_PLAY_DURATION_SEC,
      showAudioError,
      markPlaybackStarted,
      () => {}
    );
  } else {
    playSongIntro(question.song, audioFailureCallback, markPlaybackStarted);
  }
  startTimer(updateTimerDisplay);
}

// 「今回間違えた曲」セクションを描画する。通常プレイ・復習プレイどちらの結果でも呼ばれる、
// 共通の処理。間違いが1曲もなければセクションごと隠す
// （復習ですべて正解した場合に再復習ボタンが消えるのも、この分岐だけで自然に実現される）。
function renderMissedSongsSection(missedSongs) {
  const hasMissedSongs = missedSongs.length > 0;
  missedSongsSectionElement.hidden = !hasMissedSongs;

  missedSongsChipRowElement.innerHTML = "";
  missedSongs.forEach((song) => {
    const chip = document.createElement("span");
    chip.classList.add("missed-song-chip");
    chip.textContent = song.title;
    missedSongsChipRowElement.appendChild(chip);
  });
}

// 結果画面の「🏆 ランキングを見る」がどのランキング（variant・出題数・カテゴリー）を
// 開くべきかを覚えておくための一時保持。以前は通常クイズ専用でTIME_ATTACK_VARIANT.INTROに
// 固定していたが、2026-08-30追加（本人指示・後半③）でアウトロクイズ（通常導線）も同じ
// リンクを共有するようになったため、renderResult()内でそのつど書き換える方式にした。
let resultLeaderboardVariant = TIME_ATTACK_VARIANT.INTRO;
let resultLeaderboardQuestionCountValue = null;
let resultLeaderboardCategoryFilterValue = null;

// 結果画面に、合計得点・自己ベスト・1問ごとの内訳を反映する。
// 通常プレイと復習プレイの両方から呼ばれ、gameState.playModeに応じて表示・保存内容を出し分ける。
function renderResult() {
  animateScoreCountUp(gameState.score);
  const rank = calculateRank(gameState.score, gameState.questions.length);
  rankLetterElement.textContent = rank;
  // ランクごとにメダルの色・縁取り・光・飾りを切り替える見た目用のクラス
  rankElement.classList.remove("rank-s", "rank-a", "rank-b", "rank-c");
  rankElement.classList.add(`rank-${rank.toLowerCase()}`);

  const isReview = gameState.playMode === "review";
  // 苦手曲モードなど「特別モード」も、復習と同じく自己ベスト・称号・プレイ履歴には反映しない
  // （本人と合意済みの方針）。
  const isSpecial = gameState.playMode === "special";
  const specialModeDisplay = SPECIAL_MODES_DISPLAY[gameState.specialModeId];
  resultEyebrowLabelElement.textContent = isReview
    ? "REVIEW"
    : isSpecial
      ? (specialModeDisplay?.eyebrowLabel ?? "SPECIAL")
      : "RESULT";

  if (isReview || isSpecial) {
    // 復習プレイ・特別モードは自己ベスト・称号・プレイ履歴のいずれにも反映しない。
    // 保存処理そのものを呼ばないことに加え、前回（通常プレイ）の結果表示が
    // 残ってしまわないよう、自己ベスト欄・称号欄を明示的に隠す／空にする。
    highScoreElement.hidden = true;
    newRecordElement.hidden = true;
    averageResponseTimeDisplayElement.hidden = true;
    resultTotalTimeBlockElement.hidden = true;
    resultLeaderboardLinkElement.hidden = true;
    speedProgressContainerElement.innerHTML = "";
    clearAchievementUnlockEvents({
      chipContainer: titleEventListElement,
      achievementListLinkElement: titleListLinkFromResultElement,
    });

    // 特別モードのときだけ、自己ベスト欄の代わりに「記録には反映されない」ことを伝える一言を表示する。
    specialModeNoticeElement.hidden = !isSpecial;
    if (isSpecial) {
      specialModeNoticeElement.textContent = specialModeDisplay?.resultNotice ?? "";

      // 【2026-08-08新設】苦手曲モード・オリジナル問題作成モードは、自己ベスト・称号には
      // 今までどおり反映しないが、統一プレイ履歴（js/playHistory.js）にだけは記録する
      // （本人指示）。「復習プレイ」（isReviewのみでisSpecialでない場合）は対象外のまま。
      const correctEntries = gameState.answerLog.filter((entry) => entry.resultType === "correct");
      const wrongCount = gameState.answerLog.filter((entry) => entry.resultType === "wrong").length;
      const skippedCount = gameState.answerLog.filter(
        (entry) => entry.resultType === "skip" || entry.resultType === "reveal"
      ).length;
      const averageResponseMs = calculateAverageResponseMs(
        correctEntries.filter((entry) => entry.elapsedMs !== null).map((entry) => entry.elapsedMs)
      );
      const specialModeId = gameState.specialModeId;
      // 【2026-08-30追加・本人指示⑥】アウトロクイズ（通常導線のみ、specialModeId:"outroQuiz"）は
      // 5系統目の主要モードとして称号に反映する。オリジナル問題作成モード経由
      // （customQuizOutro）は、他モードのオリジナル問題作成モードと同じく対象外のまま
      // （本人方針：カスタム選曲プレイを判定に混ぜない）。
      // 【categoryFilterValueについて】startSpecialQuiz()はgameState.categoryFilterValueを
      // 常にnullへ戻すため、実際に選んだカテゴリーはlastOutroQuizSelection（このファイル内、
      // beginOutroQuiz()が更新するモジュール変数）から取得する。
      const isOutroQuiz = specialModeId === "outroQuiz";
      const outroCategoryFilterValue = isOutroQuiz ? lastOutroQuizSelection.categoryFilterValue : null;
      savePlayHistoryEntry({
        playedAt: Date.now(),
        modeId: specialModeId,
        modeLabel: HISTORY_MODE_DISPLAY[specialModeId]?.label ?? specialModeDisplay?.eyebrowLabel ?? specialModeId,
        questionCount: gameState.questions.length,
        isAllSongsMode: isOutroQuiz
          ? outroCategoryFilterValue === "all"
          : gameState.categoryFilterValue === "all",
        correctCount: correctEntries.length,
        wrongCount,
        skippedCount,
        score: gameState.score,
        averageResponseMs,
        completed: true,
        details: { categoryFilterValue: isOutroQuiz ? outroCategoryFilterValue : gameState.categoryFilterValue },
      });

      if (isOutroQuiz) {
        const outroAchievementResult = evaluateAndSaveAchievements({
          modeId: "outroQuiz",
          questionCountValue: gameState.questionCountValue,
          categoryFilterValue: outroCategoryFilterValue,
          correctCount: correctEntries.length,
          wrongCount,
          skippedCount,
          completed: true,
          averageResponseMs,
        });
        renderAchievementUnlockEvents(outroAchievementResult.newlyUnlockedIds, {
          chipContainer: titleEventListElement,
          achievementListLinkElement: titleListLinkFromResultElement,
        });
        if (outroAchievementResult.newlyUnlockedIds.length > 0) {
          renderPlayerSummary(); // ＝LOVEマスター等を新規獲得した場合、推しアイコンの王冠・ダイヤを即座に反映する
        }

        // 【2026-08-30追加、本人指示（後半③）】アウトロクイズ（通常導線）を、通常イントロ
        // クイズと全く同じグローバルランキング（js/timeAttackLeaderboard.js）へ参加させる。
        // 合計タイムの自己ベストは専用の保存領域（js/outroQuizTimeScore.js）を使う理由は
        // そのファイル冒頭のコメント参照。出題数・カテゴリーは、gameState.categoryFilterValueが
        // nullに戻っているため、lastOutroQuizSelection（このブロック内のoutroCategoryFilterValue）
        // から取得する。これにより「自己ベスト・ランキングには反映されません」の案内はもう
        // 正しくないため、専用の案内（specialModeNoticeElement）は非表示にする。
        specialModeNoticeElement.hidden = true;
        const outroQuestionCountValue = lastOutroQuizSelection.questionCountValue;

        const totalThinkTimeMs = gameState.answerLog.reduce((sum, entry) => sum + (entry.elapsedMs ?? 0), 0);
        const outroDeliveredQuestionCount = gameState.questions.length;
        resultTotalTimeBlockElement.hidden = false;
        resultTotalTimeDisplayElement.textContent = `合計 ${formatResponseSeconds(totalThinkTimeMs)}`;
        resultTotalTimeAverageDisplayElement.textContent = `平均回答時間（全${outroDeliveredQuestionCount}問） ${formatResponseSeconds(totalThinkTimeMs / outroDeliveredQuestionCount)}`;
        const outroTotalTimeIsNewRecord = saveOutroQuizTimeBestIfBetter(
          totalThinkTimeMs,
          outroQuestionCountValue,
          outroCategoryFilterValue
        );
        const outroTotalTimeBest = getOutroQuizTimeBest(outroQuestionCountValue, outroCategoryFilterValue);
        resultTotalTimeBestDisplayElement.hidden = false;
        resultTotalTimeBestDisplayElement.textContent =
          outroTotalTimeIsNewRecord && outroTotalTimeBest === totalThinkTimeMs
            ? "🎉 このモードの自己ベスト合計タイムを更新しました！"
            : `このモードの自己ベスト合計タイム：${formatResponseSeconds(outroTotalTimeBest)}`;

        // 平均回答時間（正解した問題だけが対象。称号判定と同じaverageResponseMsをそのまま表示する）。
        const outroFormattedAverageResponseTime = formatResponseSeconds(averageResponseMs);
        averageResponseTimeDisplayElement.hidden = outroFormattedAverageResponseTime === null;
        if (outroFormattedAverageResponseTime !== null) {
          averageResponseTimeDisplayElement.textContent = `平均回答時間 ${outroFormattedAverageResponseTime}`;
        }

        resultLeaderboardLinkElement.hidden = false;
        resultLeaderboardVariant = TIME_ATTACK_VARIANT.OUTRO;
        resultLeaderboardQuestionCountValue = outroQuestionCountValue;
        resultLeaderboardCategoryFilterValue = outroCategoryFilterValue;

        const outroIsCleanClear =
          wrongCount === 0 && skippedCount === 0 && correctEntries.length === gameState.questions.length;
        resultLeaderboardStatusElement.hidden = true;
        if (outroIsCleanClear && gameState.quizStartedAtMs !== null && gameState.quizFinishedAtMs !== null) {
          const outroClearTimeMs = gameState.quizFinishedAtMs - gameState.quizStartedAtMs;
          // 公開設定OFF中でも、ランキング条件を満たした記録は常にローカルへ保存しておく
          // （通常イントロクイズと同じ方針、js/rankingCandidateStore.js参照）。
          saveRankingCandidateIfBetter({
            variant: TIME_ATTACK_VARIANT.OUTRO,
            questionCountValue: outroQuestionCountValue,
            categoryFilterValue: outroCategoryFilterValue,
            clearTimeMs: outroClearTimeMs,
            missCount: 0,
            rule: null,
            source: "normal",
            achievedAt: Date.now(),
            actualQuestionCount: gameState.questions.length,
          });
          resultLeaderboardStatusElement.hidden = false;
          resultLeaderboardStatusElement.textContent = "ランキングを確認しています…";
          submitTimeAttackScoreIfBetter({
            variant: TIME_ATTACK_VARIANT.OUTRO,
            rule: null,
            source: "normal",
            questionCountValue: outroQuestionCountValue,
            categoryFilterValue: outroCategoryFilterValue,
            clearTimeMs: outroClearTimeMs,
            missCount: 0,
            playerKeyPrefix: getPlayerKeyPrefix(),
            actualQuestionCount: gameState.questions.length,
          }).then((result) => {
            if (!result.ok) {
              const messageByReason = {
                "privacy-disabled": "「フレンド」を公開するとランキングに参加できます",
                offline: "オフラインのため、ランキングへの送信はできませんでした",
                error: "ランキングへの送信に失敗しました",
                "invalid-record": "1問でも間違えると、公開ランキングには反映されません（自己ベストには保存済みです）",
                "unsupported-dimension": "このカテゴリーはランキング対象外です（表題曲のみ・表題曲＋全員曲が対象）",
              };
              resultLeaderboardStatusElement.textContent =
                messageByReason[result.reason] ?? "ランキングへの送信に失敗しました";
              return;
            }
            resultLeaderboardStatusElement.textContent = result.updated
              ? "🏆 ランキングの記録を更新しました！"
              : "ランキング上の記録はすでにこのタイム以上でした";
          });
        } else if (!outroIsCleanClear) {
          const outroSkipOnlyCount = gameState.answerLog.filter((entry) => entry.resultType === "skip").length;
          const outroRevealOnlyCount = gameState.answerLog.filter((entry) => entry.resultType === "reveal").length;
          resultLeaderboardStatusElement.hidden = false;
          if (wrongCount > 0) {
            resultLeaderboardStatusElement.textContent = `今回はランキング対象外（${wrongCount}問ミスしたため）`;
          } else if (outroSkipOnlyCount > 0) {
            resultLeaderboardStatusElement.textContent = "今回はランキング対象外（スキップを使用したため）";
          } else if (outroRevealOnlyCount > 0) {
            resultLeaderboardStatusElement.textContent = "今回はランキング対象外（答えを見るを使用したため）";
          } else {
            resultLeaderboardStatusElement.hidden = true;
          }
        }
      }
    }
  } else {
    specialModeNoticeElement.hidden = true;
    const { questionCountValue, categoryFilterValue } = gameState;
    const isNewRecord = saveHighScoreIfBetter(gameState.score, questionCountValue, categoryFilterValue);
    highScoreElement.hidden = false;
    highScoreElement.textContent = `このモードの自己ベスト: ${getHighScore(questionCountValue, categoryFilterValue)}点`;
    newRecordElement.hidden = !isNewRecord;

    // 称号（実績）判定用の共通結果オブジェクトを組み立てる（js/achievementEvaluation.js参照）。
    // resultTypeのうち、"wrong"は誤答、"skip"と"reveal"（答えを見る）はどちらも
    // 「自力で正解しなかった」という点で共通なので、未回答側にまとめている
    // （どちらの側に数えても、称号の判定条件＝誤答・未回答なしの成立可否は変わらない）。
    const correctEntries = gameState.answerLog.filter((entry) => entry.resultType === "correct");
    const wrongCount = gameState.answerLog.filter((entry) => entry.resultType === "wrong").length;
    const skippedCount = gameState.answerLog.filter(
      (entry) => entry.resultType === "skip" || entry.resultType === "reveal"
    ).length;
    const averageResponseMs = calculateAverageResponseMs(
      correctEntries.filter((entry) => entry.elapsedMs !== null).map((entry) => entry.elapsedMs)
    );

    const achievementResult = evaluateAndSaveAchievements({
      modeId: "intro",
      questionCountValue,
      categoryFilterValue,
      correctCount: correctEntries.length,
      wrongCount,
      skippedCount,
      completed: true,
      averageResponseMs,
    });
    renderAchievementUnlockEvents(achievementResult.newlyUnlockedIds, {
      chipContainer: titleEventListElement,
      achievementListLinkElement: titleListLinkFromResultElement,
    });
    renderPlayerSummary(); // ＝LOVEマスター等を新規獲得した場合、推しアイコンの王冠・ダイヤを即座に反映する

    // 結果の達成度に応じた効果音（2026-08-10新設）。全問正解は通常のGOODより豪華なPERFECT、
    // ランクSはGREAT、それ以外はGOOD。称号を新規獲得した回はachievementUnlock側の音と
    // 重ならないよう、こちらは鳴らさない（本人指示：鳴らしすぎない）。
    if (achievementResult.newlyUnlockedIds.length === 0) {
      const isCleanClear = wrongCount === 0 && skippedCount === 0 && correctEntries.length === gameState.questions.length;
      if (isCleanClear) {
        playSfx(SFX_EVENTS.RESULT_PERFECT);
      } else if (rank === "S") {
        playSfx(SFX_EVENTS.RESULT_GREAT);
      } else {
        playSfx(SFX_EVENTS.RESULT_GOOD);
      }
    }

    // 【2026-08-29追加、本人指示（追加1・追加3・追加4）】合計タイム・平均回答時間（全問対象）・
    // このモードの自己ベスト・ランキングへの入口。
    // 【合計タイムの定義】各問題の「出題開始〜回答確定」までの思考時間（elapsedMs）だけを
    // 全問分合計した値。「次へ」ボタンでの移動待ち時間・結果表示の演出時間は、
    // そもそもelapsedMsの計測に含まれていない（js/responseTime.jsのコメント参照）ため、
    // 単純に合計するだけで「思考時間だけの合計」になる。上のaverageResponseMs
    // （電光石火の速度条件、正解した問題だけが対象）とは異なり、誤答・スキップ・
    // 答えを見た問題の時間も含めた「全問対象」の値である点が違う。
    const totalThinkTimeMs = gameState.answerLog.reduce((sum, entry) => sum + (entry.elapsedMs ?? 0), 0);
    const deliveredQuestionCount = gameState.questions.length;
    resultTotalTimeBlockElement.hidden = false;
    resultTotalTimeDisplayElement.textContent = `合計 ${formatResponseSeconds(totalThinkTimeMs)}`;
    resultTotalTimeAverageDisplayElement.textContent = `平均回答時間（全${deliveredQuestionCount}問） ${formatResponseSeconds(totalThinkTimeMs / deliveredQuestionCount)}`;
    const totalTimeIsNewRecord = saveNormalQuizTimeBestIfBetter(totalThinkTimeMs, questionCountValue, categoryFilterValue);
    const totalTimeBest = getNormalQuizTimeBest(questionCountValue, categoryFilterValue);
    resultTotalTimeBestDisplayElement.hidden = false;
    resultTotalTimeBestDisplayElement.textContent =
      totalTimeIsNewRecord && totalTimeBest === totalThinkTimeMs
        ? "🎉 このモードの自己ベスト合計タイムを更新しました！"
        : `このモードの自己ベスト合計タイム：${formatResponseSeconds(totalTimeBest)}`;

    // ランキングへの入口（追加3）：直前にプレイしたのと同じ出題数・カテゴリーのランキングを
    // 最初から表示する。既存のタイムアタック結果画面の「🏆 ランキングを見る」と同じ仕組み
    // （js/timeAttackLeaderboardScreen.jsのshowTimeAttackLeaderboard）をそのまま再利用する。
    // ランキングの閲覧自体は公開設定・完走可否を問わず誰でもできるため、常に表示する。
    resultLeaderboardLinkElement.hidden = false;
    resultLeaderboardVariant = TIME_ATTACK_VARIANT.INTRO;
    resultLeaderboardQuestionCountValue = questionCountValue;
    resultLeaderboardCategoryFilterValue = categoryFilterValue;

    // 平均回答時間の表示（2026-08-09新設）。称号判定に渡したaverageResponseMsと
    // 完全に同じ値を表示することで、「画面と称号判定で数値がずれる」ことを防ぐ。
    const formattedAverageResponseTime = formatResponseSeconds(averageResponseMs);
    averageResponseTimeDisplayElement.hidden = formattedAverageResponseTime === null;
    if (formattedAverageResponseTime !== null) {
      averageResponseTimeDisplayElement.textContent = `平均回答時間 ${formattedAverageResponseTime}`;
    }

    // 電光石火までの進捗（全曲モードのときだけ、js/speedAchievementProgress.js参照）。
    const isCleanClear = wrongCount === 0 && skippedCount === 0 && correctEntries.length === gameState.questions.length;
    const speedProgress = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: categoryFilterValue === "all",
      isCleanClear,
      averageResponseMs,
    });
    speedProgressContainerElement.innerHTML = "";
    const speedProgressBlock = buildSpeedProgressResultBlock(
      speedProgress,
      getAchievementById("lightning_fast")?.name ?? "電光石火"
    );
    if (speedProgressBlock) speedProgressContainerElement.appendChild(speedProgressBlock);

    // js/history.jsのsaveHistoryEntry()は、旧称号システム時代の引数の形
    // （playResult.totalQuestions/correctCount/averageCorrectElapsedMs、titleEvents:{id,type}[]）を
    // そのまま使い続けている（保存スキーマ自体は変更しないため）。新しい称号システムの値から、
    // 同じ形を組み立てて渡す。type は常に"new"（このタイミングで新規解放された分だけを
    // 渡しているため、"repeat"は発生しない）。
    saveHistoryEntry(
      gameState,
      {
        totalQuestions: gameState.questions.length,
        correctCount: correctEntries.length,
        averageCorrectElapsedMs: averageResponseMs,
      },
      {
        rank,
        isNewRecord,
        titleEvents: achievementResult.newlyUnlockedIds.map((id) => ({ id, type: "new" })),
      }
    );

    // グローバルランキングへの送信（2026-08-16追加、本人指示）。タイムアタック・ランダム再生
    // クイズと全く同じ送信関数（submitTimeAttackScoreIfBetter）を再利用する（source:"normal"）。
    // 通常クイズにはルールの概念が無いためruleはnullのまま送る。
    // 【計測方法】gameState.quizStartedAtMs（開始）〜gameState.quizFinishedAtMs（最後の問題に
    // 正解した瞬間、js/main.jsのhandleChoiceClick参照）の差分を、問題間の「次へ」ボタンでの
    // 移動時間も含めた「セッション所要時間」として送る（本人指示：タイムアタックより
    // ゆっくりでもよい、システム側の待ち時間だけを除く）。
    // 【対象外の表示】全問正解・スキップなし・答えを見るなしで完走した回だけ送信を試みる。
    // それ以外は、理由を簡潔に表示するだけにとどめる（本人指示：説明しすぎない）。
    resultLeaderboardStatusElement.hidden = true;
    if (isCleanClear && gameState.quizStartedAtMs !== null && gameState.quizFinishedAtMs !== null) {
      const clearTimeMs = gameState.quizFinishedAtMs - gameState.quizStartedAtMs;
      // 【2026-08-16追加、本人指示】公開設定OFF中でも、ランキング条件を満たした記録は
      // 常にローカルへ保存しておく（js/rankingCandidateStore.js）。下のsubmitTimeAttackScoreIfBetter
      // 自体は公開設定OFFだと送信をスキップするが、この保存はその判定より前に必ず行う。
      saveRankingCandidateIfBetter({
        variant: TIME_ATTACK_VARIANT.INTRO,
        questionCountValue,
        categoryFilterValue,
        clearTimeMs,
        missCount: 0,
        rule: null,
        source: "normal",
        achievedAt: Date.now(),
        actualQuestionCount: gameState.questions.length,
      });
      resultLeaderboardStatusElement.hidden = false;
      resultLeaderboardStatusElement.textContent = "ランキングを確認しています…";
      submitTimeAttackScoreIfBetter({
        variant: TIME_ATTACK_VARIANT.INTRO,
        rule: null,
        source: "normal",
        questionCountValue,
        categoryFilterValue,
        clearTimeMs,
        missCount: 0,
        playerKeyPrefix: getPlayerKeyPrefix(),
        actualQuestionCount: gameState.questions.length,
      }).then((result) => {
        if (!result.ok) {
          const messageByReason = {
            "privacy-disabled": "「フレンド」を公開するとランキングに参加できます",
            offline: "オフラインのため、ランキングへの送信はできませんでした",
            error: "ランキングへの送信に失敗しました",
            "invalid-record": "1問でも間違えると、公開ランキングには反映されません（自己ベストには保存済みです）",
            "unsupported-dimension": "このカテゴリーはランキング対象外です（表題曲のみ・表題曲＋全員曲が対象）",
          };
          resultLeaderboardStatusElement.textContent =
            messageByReason[result.reason] ?? "ランキングへの送信に失敗しました";
          return;
        }
        resultLeaderboardStatusElement.textContent = result.updated
          ? "🏆 ランキングの記録を更新しました！"
          : "ランキング上の記録はすでにこのタイム以上でした";
      });
    } else if (!isCleanClear) {
      const skipOnlyCount = gameState.answerLog.filter((entry) => entry.resultType === "skip").length;
      const revealOnlyCount = gameState.answerLog.filter((entry) => entry.resultType === "reveal").length;
      resultLeaderboardStatusElement.hidden = false;
      if (wrongCount > 0) {
        resultLeaderboardStatusElement.textContent = `今回はランキング対象外（${wrongCount}問ミスしたため）`;
      } else if (skipOnlyCount > 0) {
        resultLeaderboardStatusElement.textContent = "今回はランキング対象外（スキップを使用したため）";
      } else if (revealOnlyCount > 0) {
        resultLeaderboardStatusElement.textContent = "今回はランキング対象外（答えを見るを使用したため）";
      } else {
        resultLeaderboardStatusElement.hidden = true;
      }
    }
  }

  answerLogListElement.innerHTML = "";
  gameState.answerLog.forEach((entry, index) => {
    const item = document.createElement("li");
    const isCorrect = entry.resultType === "correct";
    item.classList.add(isCorrect ? "is-correct-row" : "is-wrong-row");

    const resultLabel = isCorrect ? "正解" : "不正解";
    const textElement = document.createElement("span");
    textElement.classList.add("answer-log-text");
    textElement.textContent = `第${index + 1}問「${entry.song.title}」: ${resultLabel}（${entry.pointsEarned}点）`;
    item.appendChild(textElement);

    // 回答時間は、音源の再生に失敗した等の理由で計測できていない場合があるので、
    // データがあるときだけバッジを表示する。
    if (entry.elapsedMs !== null) {
      const timeBadge = document.createElement("span");
      timeBadge.classList.add("answer-time-badge");
      timeBadge.textContent = `${(entry.elapsedMs / 1000).toFixed(1)}秒`;
      item.appendChild(timeBadge);
    }

    answerLogListElement.appendChild(item);
  });

  // 間違えた曲の抽出・表示・復習ボタンの出し分け。通常プレイ・復習プレイどちらの結果でも
  // 同じ処理を行う（「まだ間違えた曲」を再抽出することで、復習の連続実行に対応する）。
  const missedSongs = getMissedSongs(gameState.answerLog);
  setReviewSongs(missedSongs, gameState.categoryFilterValue);
  renderMissedSongsSection(missedSongs);

  // 特別モード（苦手曲モード等）の結果画面から「間違えた曲だけ復習する」に入った場合、
  // playModeは"review"になるが、specialModeIdはstartReviewQuiz()で書き換えられずそのまま残る。
  // これを利用して「特別モードから来た復習」かどうかを判定する。
  // このケースでは、復習後に「通常プレイを始める」を出すと、特別モード側のcategoryFilterValue
  // （常にnull）を引き継いでしまい、意図しない条件で通常クイズが始まってしまうため出さない。
  const isReviewFromSpecial = isReview && gameState.specialModeId !== null;

  // このモードが専用の一覧画面を持つかどうか（例：オリジナル問題作成モードのプリセット一覧）。
  // 持たないモード（苦手曲モード）は、従来通り「特別モード一覧に戻る」がそのまま副ボタンになる。
  const hasOwnListScreen = Boolean(specialModeDisplay?.onBackToList);
  const isSpecialWithList = isSpecial && hasOwnListScreen;
  const isReviewFromSpecialWithList = isReviewFromSpecial && hasOwnListScreen;

  // ボタン列の出し分け：「もう一度挑戦する」（通常プレイ・特別モードの結果）と
  // 「通常プレイを始める」（通常プレイ発の復習の結果）は互いに排他。
  //
  // 「タイトルに戻る」（#back-to-title-button）：
  //   通常プレイ・通常プレイ発の復習では、従来通り副ボタン。
  //   専用一覧を持たないモードから来た復習（例：苦手曲モード）では主役（primary-button）。
  //   専用一覧を持つモードから来た復習（例：オリジナル問題作成モード）では、
  //   「◯◯一覧に戻る」の方を主役にするため、こちらは副ボタンのまま。
  // 「◯◯一覧に戻る」（#back-to-mode-list-button）：専用一覧を持つモードの結果でだけ表示。
  //   そのモード自身の結果では副ボタン、そのモードから来た復習では主役にする
  //   （元の作業に最短で戻れるようにするため）。
  // 「特別モード一覧に戻る」：専用一覧を持たないモードでは副ボタン（従来通り）、
  //   専用一覧を持つモードでは控えめなテキストリンクに格下げする。
  retryButtonElement.hidden = isReview;
  returnToNormalButtonElement.hidden = !isReview || isReviewFromSpecial;

  backToTitleButtonElement.hidden = isSpecial;
  const showTitleAsPrimary = isReviewFromSpecial && !hasOwnListScreen;
  backToTitleButtonElement.classList.toggle("primary-button", showTitleAsPrimary);
  backToTitleButtonElement.classList.toggle("secondary-button", !showTitleAsPrimary);

  backToModeListButtonElement.hidden = !(isSpecialWithList || isReviewFromSpecialWithList);
  if (!backToModeListButtonElement.hidden) {
    backToModeListButtonElement.textContent = specialModeDisplay.backToListLabel;
  }
  backToModeListButtonElement.classList.toggle("primary-button", isReviewFromSpecialWithList);
  backToModeListButtonElement.classList.toggle("secondary-button", !isReviewFromSpecialWithList);

  backToSpecialModesButtonElement.hidden = !(isSpecial || isReviewFromSpecial) || hasOwnListScreen;
  backToSpecialModesLinkElement.hidden = !(isSpecialWithList || isReviewFromSpecialWithList);
  backToTitleLinkFromSpecialElement.hidden = !isSpecial;
}

// 4つの選択肢ボタンに、それぞれ回答確定時の処理を割り当てる。
// ボタンの並び自体は固定なので、確定時に「今の問題」の該当インデックスの選択肢を参照する。
// 【2026-11-XX改訂・本人指示：回答ボタンの操作性改善】以前は「押した瞬間（click）」に
// 即確定していたが、「押し間違えて指を外へ逃がしたのに確定してしまう」という実プレイでの
// 報告を受け、「そのボタンの中で指を離した瞬間」に確定する方式（js/answerButtonInteraction.js）
// へ変更した。このボタン一覧は固定DOM（画面遷移で再生成されない）のため、ここで1回だけ
// bindすれば以後ずっと有効（onlineBattleScreen.jsのモード変更バグのような
// 「古いDOMに新しいlistenerが付いていない」問題は起きない）。
choiceButtonElements.forEach((button, index) => {
  bindPressReleaseAnswer(button, () => {
    const question = getCurrentQuestion();
    handleChoiceClick(question.choices[index]);
  });
});

// 指定した出題数・カテゴリで、曲プールの絞り込み・検証から問題生成までを行い、
// クイズ画面を開始する共通処理。スタートボタンと、結果画面の「もう一度挑戦する」の
// 両方から呼ばれる（後者は毎回この関数を通すことで、曲順・4択が必ず再抽選される）。
async function beginQuiz(questionCountValue, categoryFilterValue) {
  const categoryPool = filterSongsByCategory(SONGS, categoryFilterValue);
  const pool = await filterSongsWithImportedAudio(categoryPool);
  const errorMessage = validatePlayablePoolSize(pool);

  if (errorMessage) {
    startErrorElement.textContent = errorMessage;
    startErrorElement.hidden = false;
    return;
  }

  startErrorElement.hidden = true;
  const questionCount = resolveQuestionCount(questionCountValue, pool.length);
  const questions = buildQuizQuestions(pool, questionCount);
  startQuiz(questions, questionCountValue, categoryFilterValue);
  showScreen("quiz");

  renderQuestion();
}

// 【2026-08-30追加、本人指示】アウトロクイズ：曲の最後5秒だけを聞いて当てる、
// 通常クイズに近いモード。beginQuiz()と全く同じ組み立て方（カテゴリ絞り込み→音源読み込み済み
// フィルタ→4択生成）で、playMode:"special"・specialModeId:"outroQuiz"としてstartSpecialQuiz()を
// 呼ぶ点だけが異なる（既存の#quiz-screen・#result-screenをそのまま再利用するため）。
// startSpecialQuiz()はgameState.categoryFilterValueを常にnullに戻してしまう
// （既存の苦手曲モード等と同じ設計）ため、「やり直す」でカテゴリを覚えておくために
// このモジュール内だけで最後に選ばれた設定を保持しておく
// （js/main.jsのgetLastStartedCustomQuizSelection()と同じ考え方）。
let lastOutroQuizSelection = { questionCountValue: "5", categoryFilterValue: "title-track" };

async function beginOutroQuiz(questionCountValue, categoryFilterValue) {
  const categoryPool = filterSongsByCategory(SONGS, categoryFilterValue);
  const pool = await filterSongsWithImportedAudio(categoryPool);
  const errorMessage = validatePlayablePoolSize(pool);

  if (errorMessage) {
    outroQuizStartErrorElement.textContent = errorMessage;
    outroQuizStartErrorElement.hidden = false;
    return;
  }

  outroQuizStartErrorElement.hidden = true;
  lastOutroQuizSelection = { questionCountValue, categoryFilterValue };
  const questionCount = resolveQuestionCount(questionCountValue, pool.length);
  const questions = buildQuizQuestions(pool, questionCount);
  startSpecialQuiz(questions, questionCountValue, "outroQuiz");
  showScreen("quiz");
  renderQuestion();
}

// 【2026-08-30改訂・本人指示②】アウトロ・一瞬チャレンジは特殊モードではなく、
// イントロ・ランダム再生・歌詞クイズと並ぶ通常の主要モードとして扱うため、
// 「戻る」は旧特殊モード一覧（specialModes）ではなく、他の主要モードと同じくホームへ直接戻す。
outroQuizSetupBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// 【2026-10-01追加・本人指示：実機再確認で発覚、アウトロクイズ設定の出題数・カテゴリー
// ボタンにchangeリスナー自体が無く無音だった】既存の他モードと同じ、変更のたびに
// UI_CLICK効果音を鳴らす操作音を追加する。
document
  .querySelectorAll('input[name="outro-quiz-question-count"], input[name="outro-quiz-category-filter"]')
  .forEach((radio) => {
    radio.addEventListener("change", () => playSfx(SFX_EVENTS.UI_CLICK));
  });

outroQuizStartButtonElement.addEventListener("click", () => {
  // 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
  recordAudioDiagnostic("[GAME_START] スタートボタン押下（アウトロクイズ）");
  // 【2026-09-15追加・本人指示：アプリ起動後最初の第1問だけ無音になるバグ対策】
  attemptSilentUnlock();
  playSfx(SFX_EVENTS.GAME_START);
  const questionCountValue = document.querySelector('input[name="outro-quiz-question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="outro-quiz-category-filter"]:checked').value;
  beginOutroQuiz(questionCountValue, categoryFilterValue);
});

// 【2026-08-30追加】一瞬チャレンジ：設定・問題・結果画面の初期化・画面遷移の配線。
// 実際の進行ロジック（回答候補生成・採点・クリア判定）はjs/instantChallengeScreen.jsに任せ、
// ここでは既存の他モードと同じく「画面遷移だけ」を担当する。
initInstantChallengeSetupScreen({
  startButton: instantChallengeStartButtonElement,
  startError: instantChallengeStartErrorElement,
  onStart: () => {
    setInstantChallengeBackLabels(null);
    showScreen("instantChallengeQuestion");
    startInstantChallengePlay();
  },
});

initInstantChallengeQuestionScreen({
  progress: instantChallengeProgressElement,
  answerSearchRow: instantChallengeAnswerSearchRowElement,
  answerSearchInput: instantChallengeAnswerSearchInputElement,
  answerCount: instantChallengeAnswerCountElement,
  answerJumpBar: instantChallengeAnswerJumpBarElement,
  answerList: instantChallengeAnswerListElement,
  answerReveal: instantChallengeAnswerRevealElement,
  answerRevealStatus: instantChallengeAnswerRevealStatusElement,
  answerRevealTitle: instantChallengeAnswerRevealTitleElement,
  answerRevealMyAnswer: instantChallengeAnswerRevealMyAnswerElement,
  countdown: instantChallengeCountdownElement,
  countdownNumber: instantChallengeCountdownNumberElement,
  audioError: instantChallengeAudioErrorElement,
  replayButton: instantChallengeReplayButtonElement,
  nextButton: instantChallengeNextButtonElement,
  backButton: instantChallengeBackButtonElement,
  quitConfirmModal: instantChallengeQuitConfirmModalElement,
  quitCancelButton: instantChallengeQuitCancelButtonElement,
  quitRestartButton: instantChallengeQuitRestartButtonElement,
  quitConfirmButton: instantChallengeQuitConfirmButtonElement,
  // 【2026-08-30追加、本人指示：苦手曲5系統完全分離／オリジナル問題作成モード一瞬対応】
  // 苦手曲モード「一瞬」タブ・オリジナル問題作成モードからの開始中は、「戻る」の先を
  // それぞれの一覧画面にする。
  onQuit: () => {
    if (isInstantChallengeWeakSongsPractice()) {
      goToWeakSongsScreen();
      return;
    }
    if (isInstantChallengeFromCustomPreset()) {
      goToCustomQuizPresetsList();
      return;
    }
    navigateWithScrollMemory("instantChallengeSetup");
  },
  onFinish: () => {
    renderInstantChallengeResult();
    showScreen("instantChallengeResult");
  },
  // 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】同じ問題スロットで3回連続
  // （元の曲＋差し替え2回）再生に失敗した場合、この回を安全に中断し、設定画面へ戻して
  // 理由を表示する（クリア記録・称号判定・プレイ履歴のいずれにも保存しない）。
  onAudioFailureAbort: (message) => {
    if (isInstantChallengeWeakSongsPractice()) {
      goToWeakSongsScreen();
    } else if (isInstantChallengeFromCustomPreset()) {
      goToCustomQuizPresetsList();
    } else {
      navigateWithScrollMemory("instantChallengeSetup");
    }
    instantChallengeStartErrorElement.textContent = message;
    instantChallengeStartErrorElement.hidden = false;
  },
});

initInstantChallengeResultScreen({
  correctCount: instantChallengeResultCorrectCountElement,
  missCount: instantChallengeResultMissCountElement,
  clearBadge: instantChallengeResultClearBadgeElement,
  breakdownList: instantChallengeResultBreakdownListElement,
  achievementList: instantChallengeResultAchievementListElement,
  achievementListLink: instantChallengeResultAchievementListLinkElement,
});

// 【2026-08-30改訂・本人指示②】上のアウトロと同じ理由でホームへ直接戻す。
instantChallengeSetupBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

instantChallengeResultHomeLinkElement.addEventListener("click", () => {
  playClickSound();
  navigateWithScrollMemory("start");
});

// 【2026-09-15修正・実機回帰バグ：前問／前試合の答え合わせが一瞬表示される】以前は
// showScreen("instantChallengeQuestion")を先に呼んでいたため、まだ前回の周回の
// answerReveal（答え合わせカード）が表示されたままの問題画面が一瞬見えてから、
// retryInstantChallengeRun()（内部でIndexedDB読み込み等の非同期処理を挟む）が
// 完了して初めて状態がリセットされていた。retryInstantChallengeRun()→buildAndStartRun()
// は、内部の最後でelements.onStart()（初期化時に登録した、状態リセット後に
// showScreen＋startInstantChallengePlay()を呼ぶコールバック）を自分で呼び出すため、
// ここで重複してshowScreen/startInstantChallengePlay()を呼ぶ必要も無い
// （画面遷移は必ず状態リセットの"後"にだけ起きるようにする）。
instantChallengeResultRetryButtonElement.addEventListener("click", async () => {
  playClickSound();
  await retryInstantChallengeRun();
});

instantChallengeResultSetupButtonElement.addEventListener("click", () => {
  playClickSound();
  if (isInstantChallengeWeakSongsPractice()) {
    goToWeakSongsScreen();
    return;
  }
  if (isInstantChallengeFromCustomPreset()) {
    goToCustomQuizPresetsList();
    return;
  }
  navigateWithScrollMemory("instantChallengeSetup");
});

// スタートボタンを押したときの処理。今選ばれている出題数・カテゴリを読み取って開始する。
document.getElementById("start-button").addEventListener("click", () => {
  // 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
  recordAudioDiagnostic("[GAME_START] スタートボタン押下（通常イントロクイズ）");
  // 【2026-09-15追加・本人指示：アプリ起動後最初の第1問だけ無音になるバグ対策】
  attemptSilentUnlock();
  // 「専用イベントがあるボタンでは、汎用クリック音と二重に鳴らさない」方針により、
  // ここではplayClickSound()ではなくgameStartだけを鳴らす（2026-08-10）。
  playSfx(SFX_EVENTS.GAME_START);
  const questionCountValue = document.querySelector('input[name="question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="category-filter"]:checked').value;
  beginQuiz(questionCountValue, categoryFilterValue);
});

document.getElementById("next-button").addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  goToNextQuestionOrResult();
});

skipButtonElement.addEventListener("click", handleSkip);
revealButtonElement.addEventListener("click", handleReveal);
audioTroubleButtonElement.addEventListener("click", handleAudioTroubleButtonClick);
// 【2026-09-16新設・本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・個人進行系）】
onlineBattleAudioTroubleButtonElement.addEventListener("click", handleOnlineBattleAudioTroubleButtonClick);

// 「もう一度挑戦する」：スタート画面を経由せず、直前と同じ出題数・カテゴリのまま
// クイズを再抽選して開始する。
// 特別モードの結果では、通常のもう一度挑戦する（beginQuiz）ではなく、そのモードの判定を
// 再計算して再開する。将来モードが増えたときは、ここに分岐を1つ足すだけでよい。
function retrySpecialQuiz() {
  if (gameState.specialModeId === "weakSongs") {
    const songIds = resolveWeakSongIds(gameState.questionCountValue);
    beginSpecialQuiz(songIds, gameState.questionCountValue, "weakSongs");
  } else if (gameState.specialModeId === "weakSongsOutro") {
    // 【2026-08-30追加、本人指示：苦手曲5系統完全分離】
    const songIds = resolveOutroWeakSongIds(gameState.questionCountValue);
    beginWeakSongsOutroPractice(songIds, gameState.questionCountValue);
  } else if (gameState.specialModeId === "weakSongsShuffle") {
    const songIds = resolveShuffleWeakSongIds(gameState.questionCountValue);
    beginWeakSongsShufflePractice(songIds, gameState.questionCountValue);
  } else if (gameState.specialModeId === "customQuiz") {
    const { songIds, distractorMode } = getLastStartedCustomQuizSelection();
    beginCustomQuiz(songIds, distractorMode);
  } else if (gameState.specialModeId === "customQuizRandomPlayback") {
    // 【2026-08-29追加、本人指示（⑭)】オリジナル問題作成モード・ランダム再生タイプの
    // 「もう一度挑戦する」・「やり直す」。
    const { songIds, distractorMode } = getLastStartedCustomQuizSelection();
    beginCustomRandomPlaybackQuiz(songIds, distractorMode);
  } else if (gameState.specialModeId === "outroQuiz") {
    // 【2026-08-30追加、本人指示】アウトロクイズの「もう一度挑戦する」・「やり直す」。
    beginOutroQuiz(lastOutroQuizSelection.questionCountValue, lastOutroQuizSelection.categoryFilterValue);
  } else if (gameState.specialModeId === "customQuizOutro") {
    // 【2026-08-30追加、本人指示（⑦）】オリジナル問題作成モード・アウトロタイプの
    // 「もう一度挑戦する」・「やり直す」。
    const { songIds, distractorMode } = getLastStartedCustomQuizSelection();
    beginCustomOutroQuiz(songIds, distractorMode);
  }
}

retryButtonElement.addEventListener("click", () => {
  playClickSound();
  if (gameState.playMode === "special") {
    retrySpecialQuiz();
    return;
  }
  stopTimer();
  stopAudio();
  beginQuiz(gameState.questionCountValue, gameState.categoryFilterValue);
});

// 「通常プレイを始める」（復習の結果画面にだけ表示）：復習に入る前と同じ出題数・カテゴリで、
// 新しい通常クイズを始める。処理内容は「もう一度挑戦する」と全く同じ
// （beginQuiz→startQuizが必ずplayModeを"normal"に戻すため、ここで個別に戻す必要はない）。
returnToNormalButtonElement.addEventListener("click", () => {
  playClickSound();
  stopTimer();
  stopAudio();
  beginQuiz(gameState.questionCountValue, gameState.categoryFilterValue);
});

// 「間違えた曲だけ復習する」：直前のrenderResult()でgameState.reviewSongs/
// reviewCategoryFilterValueに保持しておいた内容をもとに、復習クイズを組み立てて開始する。
// 通常プレイ後・復習プレイ後のどちらの結果画面から呼ばれても、同じ処理でそのまま動く。
async function beginReviewQuiz() {
  stopTimer();
  stopAudio();
  const categoryPool = filterSongsByCategory(SONGS, gameState.reviewCategoryFilterValue);
  const distractorPool = await filterSongsWithImportedAudio(categoryPool);
  const questions = buildReviewQuizQuestions(gameState.reviewSongs, distractorPool);
  startReviewQuiz(questions);
  showScreen("quiz");
  renderQuestion();
}

reviewMissedSongsButtonElement.addEventListener("click", () => {
  playClickSound();
  beginReviewQuiz();
});

// 【2026-08-29追加、本人指示（追加3）】通常クイズ結果画面から：直前にプレイした
// 出題数・カテゴリーのランキングへ直接ジャンプする（タイムアタック結果画面の
// 「🏆 ランキングを見る」と全く同じ仕組み）。
// 【2026-08-30改訂、本人指示（後半③）】アウトロクイズ（通常導線）の結果画面もこの同じ
// ボタン・リスナーを共有するため、variant等をgameStateから直接読まず、renderResult()が
// そのつど更新するresultLeaderboardVariant等の一時保持を使う。
resultLeaderboardLinkElement.addEventListener("click", () => {
  playClickSound();
  timeAttackLeaderboardReturnScreen = "result";
  showTimeAttackLeaderboard(
    resultLeaderboardVariant,
    resultLeaderboardQuestionCountValue,
    resultLeaderboardCategoryFilterValue
  );
  showScreen("timeAttackLeaderboard");
});

// 「タイトルに戻る」：出題数・カテゴリの選択も含めて初期状態に戻し、スタート画面へ。
// タイトル（スタート画面）へ戻る共通処理。「タイトルに戻る」ボタン（通常プレイ・復習の結果）と、
// 特別モードの結果に表示する控えめなテキストリンクの、両方から呼ばれる。
function goToTitle() {
  stopTimer();
  stopAudio();
  resetGameState();
  showScreen("start");
  updateModeBestScoreDisplay(); // 直前のプレイで自己ベストが更新されている可能性があるので表示し直す
}

backToTitleButtonElement.addEventListener("click", () => {
  playClickSound();
  goToTitle();
});

// 「特別モード一覧に戻る」（特別モードの結果にだけ表示）：特別モード一覧画面へ戻る。
function goToSpecialModes() {
  stopTimer();
  stopAudio();
  resetGameState();
  showScreen("specialModes");
}

backToSpecialModesButtonElement.addEventListener("click", () => {
  playClickSound();
  goToSpecialModes();
});

// 専用の一覧画面を持つモード（例：オリジナル問題作成モード）でだけ表示する「◯◯一覧に戻る」。
// 戻り先の処理はSPECIAL_MODES_DISPLAYのonBackToListに任せる（モードが増えても分岐を足す必要がない）。
// resetGameState()はgameState.specialModeIdをnullに戻してしまうため、必ず先にonBackToListを
// 取り出しておく。
backToModeListButtonElement.addEventListener("click", () => {
  playClickSound();
  const onBackToList = SPECIAL_MODES_DISPLAY[gameState.specialModeId]?.onBackToList;
  stopTimer();
  stopAudio();
  resetGameState();
  onBackToList?.();
});

// 専用の一覧画面を持つモードの結果でだけ表示する、控えめな「特別モード一覧に戻る」リンク。
// 動きはボタン版（back-to-special-modes-button）と同じ。
backToSpecialModesLinkElement.addEventListener("click", () => {
  playClickSound();
  goToSpecialModes();
});

// 特別モードの結果にだけ表示する、控えめな「タイトルに戻る」リンク。動きはボタン版と同じ。
backToTitleLinkFromSpecialElement.addEventListener("click", () => {
  playClickSound();
  goToTitle();
});

// クイズ画面の「タイトルへ」：いきなり戻らず、必ず確認モーダルを挟む。
function openQuizQuitConfirmModal() {
  playClickSound();
  quizQuitConfirmModalElement.hidden = false;
}

function closeQuizQuitConfirmModal() {
  quizQuitConfirmModalElement.hidden = true;
}

quizBackButtonElement.addEventListener("click", openQuizQuitConfirmModal);

quizQuitCancelButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
});

// オーバーレイの背景部分をクリックしたときも閉じる（他のモーダルと同じ考え方）。
quizQuitConfirmModalElement.addEventListener("click", (event) => {
  if (event.target === quizQuitConfirmModalElement) {
    closeQuizQuitConfirmModal();
  }
});

// 確認モーダルの確定ボタン：通常プレイ・復習では、結果画面の「タイトルに戻る」ボタンと
// 全く同じ処理を行う。苦手曲モード・オリジナル問題作成モードのクイズ中（playMode==="special"）
// だけ、それぞれの確認/一覧画面に戻る（文言もupdateQuizQuitDisplay()で切り替え済み）。
// どちらの場合も、renderResult()を経由しないため、自己ベスト・称号・プレイ履歴の
// いずれにも一切反映されない（この3つはすべてrenderResult()の中でのみ保存処理が呼ばれる設計）。
// resetGameState()はgameState.specialModeIdをnullに戻してしまうため、必ず先にonQuizBackを
// 取り出しておく（backToModeListButtonElementのクリック処理と同じ理由）。
// クイズを中断し、記録を一切残さず安全な画面へ戻る（結果画面を経由しないため、自己ベスト・
// 称号・プレイ履歴のいずれにも反映されない）。元は#quiz-quit-confirm-buttonのクリック処理
// だけが行っていた処理だが、「音が出ない」救済ボタン（タイムシビアなモードでの中断・
// 非タイムシビアなモードで出題できる問題が尽きた場合の最終手段）からも全く同じ挙動が
// 必要なため、named functionとして切り出して両方から呼べるようにした（2026-09-16、本人指示）。
function quitCurrentQuizWithoutSaving() {
  const isSpecial = gameState.playMode === "special";
  const isTimeAttack = gameState.playMode === "timeAttack";
  const isRandomPlayback = gameState.playMode === "randomPlayback";
  const isLocalBattle = gameState.playMode === "localBattle";
  const isOnlineBattle = gameState.playMode === "onlineBattle";
  const onQuizBack = isSpecial ? SPECIAL_MODES_DISPLAY[gameState.specialModeId]?.onQuizBack : null;
  // タイムアタック・対戦モードの正解/不正解演出のあと、自動で次へ進む予約（setTimeout）が
  // 残っていると、この画面を離れた後にタイマーが発火して勝手に次の問題や結果画面へ飛ばされて
  // しまうため、中断時は必ず取り消す。
  clearPendingTimeAttackAdvance();
  stopTimer();
  stopAudio();
  resetGameState();
  if (isTimeAttack) {
    // タイムアタックは結果画面を経由しないため、ここでも自己ベスト等には一切反映されない。
    showScreen("timeAttackSetup");
  } else if (isRandomPlayback) {
    // ランダム再生クイズも結果画面を経由しないため、自己ベストには一切反映されない。
    showScreen("randomPlaybackSetup");
  } else if (isLocalBattle) {
    // 対戦モードも結果コードを経由しないため、対戦結果としては一切残らない
    // （この対戦コード自体を使い直すことはできず、やり直すには新しく対戦を作る必要がある）。
    showScreen("battleModeSelect");
  } else if (isOnlineBattle) {
    // オンライン対戦も結果は一切送信しない。ルームから退出する後片付けは
    // js/onlineBattleScreen.js側（quitOnlineBattleDuringQuiz）に任せ、ここでは画面遷移だけ行う
    // （他のモードと同じく、呼び出し元でplayClickSound()を既に呼んでいるため、
    // elements.navigateTo経由にはせず直接showScreen()する）。
    quitOnlineBattleDuringQuiz();
    showScreen("onlineBattleEntry");
  } else if (onQuizBack) {
    onQuizBack();
  } else {
    showScreen("start");
    updateModeBestScoreDisplay();
  }
}

quizQuitConfirmButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
  quitCurrentQuizWithoutSaving();
});

// 【2026-08-29追加、本人指示（追加5）】「やり直す」：同じ設定のまま最初から再抽選して
// 始め直す。対戦モード（ローカル・オンライン）はquizQuitRestartButtonElement.hidden=trueに
// なっているため、このハンドラ自体は呼ばれない想定だが、念のためどちらの分岐にも
// 含めていない（何もしない）。
// resetGameState()は呼ばない（各begin系関数がstartQuiz()等を通じて内部で必ず
// gameStateを作り直すため、既存の#retry-button・タイムアタック/ランダム再生の
// 「もう一度挑戦する」ボタンと全く同じ考え方。それぞれの記録保存（自己ベスト・称号・
// プレイ履歴・苦手曲統計）は、いずれも今回中断した回のぶんは一切行われないまま
// （renderResult()を経由していないため）、新しい回だけがまっさらな状態で始まる）。
quizQuitRestartButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
  clearPendingTimeAttackAdvance();
  stopTimer();
  stopAudio();

  if (gameState.playMode === "special") {
    retrySpecialQuiz();
  } else if (gameState.playMode === "timeAttack") {
    const { questionCountValue, categoryFilterValue, rule, variant } = getLastTimeAttackSelection();
    beginTimeAttackQuiz(questionCountValue, categoryFilterValue, rule, variant);
  } else if (gameState.playMode === "randomPlayback") {
    const { questionCountValue, categoryFilterValue, rule } = getLastTimeAttackSelection();
    beginRandomPlaybackQuiz(questionCountValue, categoryFilterValue, rule);
  } else if (gameState.playMode === "normal" || gameState.playMode === "review") {
    // 通常プレイ・復習：#retry-button（もう一度挑戦する）と全く同じ処理。
    beginQuiz(gameState.questionCountValue, gameState.categoryFilterValue);
  }
});

// ルール説明モーダルの開閉。start/quiz/resultの画面切り替え（showScreen）とは無関係な、
// 単純な表示/非表示の切り替えのみで済ませている（出題数・カテゴリの選択状態には一切触れない）。
function openRulesModal() {
  playClickSound();
  rulesModalElement.hidden = false;
}

function closeRulesModal() {
  rulesModalElement.hidden = true;
}

rulesLinkElement.addEventListener("click", openRulesModal);
rulesModalCloseButtonElement.addEventListener("click", closeRulesModal);

// オーバーレイ部分（背景）をクリックしたときも閉じる。
// モーダルカード自体のクリックはバブリングで拾ってしまうと誤って閉じるため、
// クリックされた要素がオーバーレイそのものだったときだけ閉じるようにする。
rulesModalElement.addEventListener("click", (event) => {
  if (event.target === rulesModalElement) {
    closeRulesModal();
  }
});

// 苦手曲モードの判定ルール説明モーダル。開閉の仕組みはルール説明モーダルと全く同じ。
function openWeakSongsRulesModal() {
  playClickSound();
  weakSongsRulesModalElement.hidden = false;
}

function closeWeakSongsRulesModal() {
  weakSongsRulesModalElement.hidden = true;
}

weakSongsRulesLinkElement.addEventListener("click", openWeakSongsRulesModal);
weakSongsRulesModalCloseButtonElement.addEventListener("click", closeWeakSongsRulesModal);

weakSongsRulesModalElement.addEventListener("click", (event) => {
  if (event.target === weakSongsRulesModalElement) {
    closeWeakSongsRulesModal();
  }
});

// 特別モード一覧「？」の説明モーダル一式（タイムアタック・ランダム再生クイズ・
// ライブコールモード・歌詞クイズ・対戦モード・オンライン対戦）。中身は静的なHTMLで、
// 開閉の仕組みが6件とも完全に共通なため、他の説明モーダルのように1件ずつ関数を
// 書かず、ここでまとめて処理する（苦手曲/オリジナル問題作成モードは、専用画面の
// 「？」からも開ける既存の開閉関数をそのまま再利用するため、ここには含めない）。
const SPECIAL_MODE_HELP_MODALS = {
  timeAttack: { modal: timeAttackRulesModalElement, closeButton: timeAttackRulesModalCloseButtonElement },
  randomPlayback: { modal: randomPlaybackRulesModalElement, closeButton: randomPlaybackRulesModalCloseButtonElement },
  liveCallMode: { modal: liveCallModeRulesModalElement, closeButton: liveCallModeRulesModalCloseButtonElement },
  liveCallKaraoke: { modal: karaokeSyncRulesModalElement, closeButton: karaokeSyncRulesModalCloseButtonElement },
  lyricsQuiz: { modal: lyricsQuizRulesModalElement, closeButton: lyricsQuizRulesModalCloseButtonElement },
  localBattle: { modal: localBattleRulesModalElement, closeButton: localBattleRulesModalCloseButtonElement },
  onlineBattle: { modal: onlineBattleRulesModalElement, closeButton: onlineBattleRulesModalCloseButtonElement },
};

Object.values(SPECIAL_MODE_HELP_MODALS).forEach(({ modal, closeButton }) => {
  closeButton.addEventListener("click", () => {
    modal.hidden = true;
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.hidden = true;
    }
  });
});

// 特別モード一覧の「？」ボタン（js/specialModesScreen.jsのonShowHelp）から呼ばれる窓口。
function openSpecialModeHelp(modeId) {
  if (modeId === "weakSongs") {
    openWeakSongsRulesModal(); // 内部でplayClickSound()を呼ぶ
    return;
  }
  if (modeId === "originalQuiz") {
    openCustomQuizPresetsRulesModal(); // 内部でplayClickSound()を呼ぶ
    return;
  }
  const entry = SPECIAL_MODE_HELP_MODALS[modeId];
  if (!entry) return;
  playClickSound();
  entry.modal.hidden = false;
}

// 歌詞クイズオンライン対戦：3つの対戦ルール（正解数バトル/早押しバトル/ポイントバトル）の説明モーダル。
// 本文はjs/battleRules/index.jsのlabel・getRuleDescription()から毎回組み立てる。
// ハードコードした説明文を別に持たせないことで、ルールの実装（配点・タイブレーク順など）が
// 変わったときにこの説明が古いまま残ってしまう事故を防ぐ（本人指示）。
function renderBattleRulesHelpBody() {
  battleRulesHelpBodyElement.innerHTML = "";
  listAvailableBattleRules().forEach((rule) => {
    const heading = document.createElement("h3");
    heading.textContent = rule.label;
    battleRulesHelpBodyElement.appendChild(heading);

    const description = document.createElement("p");
    const defaultSettings = createDefaultBattleRuleSettings(rule.ruleId);
    description.textContent = getBattleRuleDescription(rule.ruleId, defaultSettings);
    battleRulesHelpBodyElement.appendChild(description);
  });
}

function openBattleRulesHelpModal() {
  playClickSound();
  renderBattleRulesHelpBody();
  battleRulesHelpModalElement.hidden = false;
}

function closeBattleRulesHelpModal() {
  battleRulesHelpModalElement.hidden = true;
}

battleRulesHelpLinkElement.addEventListener("click", openBattleRulesHelpModal);
battleRulesHelpModalCloseButtonElement.addEventListener("click", closeBattleRulesHelpModal);
battleRulesHelpModalElement.addEventListener("click", (event) => {
  if (event.target === battleRulesHelpModalElement) {
    closeBattleRulesHelpModal();
  }
});

// オリジナル問題作成モードの説明モーダル。開閉の仕組みは他の説明モーダルと全く同じ。
function openCustomQuizRulesModal() {
  playClickSound();
  customQuizRulesModalElement.hidden = false;
}

function closeCustomQuizRulesModal() {
  customQuizRulesModalElement.hidden = true;
}

customQuizRulesLinkElement.addEventListener("click", openCustomQuizRulesModal);
customQuizRulesModalCloseButtonElement.addEventListener("click", closeCustomQuizRulesModal);

customQuizRulesModalElement.addEventListener("click", (event) => {
  if (event.target === customQuizRulesModalElement) {
    closeCustomQuizRulesModal();
  }
});

// オリジナル問題作成モード「一覧画面」の説明モーダル（モード全体の説明）。
// 選曲画面側の説明モーダルとは別に、開閉の仕組みだけ同じものを用意する。
function openCustomQuizPresetsRulesModal() {
  playClickSound();
  customQuizPresetsRulesModalElement.hidden = false;
}

function closeCustomQuizPresetsRulesModal() {
  customQuizPresetsRulesModalElement.hidden = true;
}

customQuizPresetsRulesLinkElement.addEventListener("click", openCustomQuizPresetsRulesModal);
customQuizPresetsRulesModalCloseButtonElement.addEventListener("click", closeCustomQuizPresetsRulesModal);

customQuizPresetsRulesModalElement.addEventListener("click", (event) => {
  if (event.target === customQuizPresetsRulesModalElement) {
    closeCustomQuizPresetsRulesModal();
  }
});

// 「収録曲一覧」リンク：開くたびに、最新のシングルだけ展開した状態から始める。
songlistLinkElement.addEventListener("click", () => {
  playClickSound();
  resetSongListToDefaultView();
  navigateWithScrollMemory("songlist");
});

// 「お気に入り」タイル（スタート画面）：収録曲一覧画面を開いた直後から「お気に入り」タブを
// 表示する（UI/UX再設計で追加）。
songlistFavoritesLinkElement.addEventListener("click", () => {
  playClickSound();
  resetSongListToDefaultView("favorites");
  navigateWithScrollMemory("songlist");
});

// 収録曲一覧画面の「戻る」：試聴中の曲を必ず止めてからスタート画面へ戻る。
songlistBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  stopSongListPreview();
  navigateWithScrollMemory("start");
});

// 「プレイ履歴」リンク：開くたびに最新の記録で描画し直す
// （直前のプレイがあれば、その分もすぐ反映されるようにするため）。
historyLinkElement.addEventListener("click", () => {
  playClickSound();
  renderHistoryScreen();
  navigateWithScrollMemory("history");
});

// 「フレンド」リンク：開くたびに公開設定・一覧を最新の状態で描画し直す。
fanProfilesLinkElement.addEventListener("click", () => {
  playClickSound();
  renderFanProfilesScreen();
  navigateWithScrollMemory("fanProfiles");
});

// 管理者専用「🔧バックアップ管理」リンク（フレンド画面ヘッダー、2026-08-29新設）。
// このボタン自体は管理者判定がtrueのときだけ表示される（js/fanProfilesScreen.js参照）。
adminBackupLinkButtonElement.addEventListener("click", () => {
  playClickSound();
  renderAdminBackupScreen();
  navigateWithScrollMemory("adminBackup");
});
// 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
// 管理者専用「🔧音源診断ログ」リンク（上のバックアップ管理と全く同じ考え方）。
debugAudioLogLinkButtonElement.addEventListener("click", () => {
  playClickSound();
  renderDebugAudioLog();
  navigateWithScrollMemory("debugAudioLog");
});
adminBackupBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("fanProfiles");
});

// 「機種変更・データ引き継ぎ」（データ管理画面、2026-08-29新設）。管理者の承認を挟まず、
// 旧端末を操作できる本人だけでその場で完結する引き継ぎ。js/backupSync.jsの
// createTransferCode()/claimTransferCode()参照。
deviceTransferIssueButtonElement.addEventListener("click", async () => {
  playClickSound();
  deviceTransferIssueButtonElement.disabled = true;
  deviceTransferIssueResultElement.hidden = false;
  deviceTransferIssueResultElement.textContent = "発行しています…";
  deviceTransferCodePanelElement.hidden = true;

  const result = await createTransferCode();
  deviceTransferIssueButtonElement.disabled = false;

  if (!result.ok) {
    deviceTransferIssueResultElement.textContent = result.reason;
    return;
  }

  deviceTransferIssueResultElement.hidden = true;
  deviceTransferCodePanelElement.hidden = false;
  deviceTransferCodeDisplayElement.textContent = result.code;
  deviceTransferCodeExpiryElement.textContent = `有効期限：${new Date(result.expiresAt).toLocaleString("ja-JP")} まで（24時間）`;
  deviceTransferCopyFeedbackElement.hidden = true;
});

deviceTransferCopyButtonElement.addEventListener("click", async () => {
  playClickSound();
  const code = deviceTransferCodeDisplayElement.textContent;
  try {
    await navigator.clipboard.writeText(code);
    deviceTransferCopyFeedbackElement.hidden = false;
    deviceTransferCopyFeedbackElement.textContent = "コピーしました";
  } catch {
    deviceTransferCopyFeedbackElement.hidden = false;
    deviceTransferCopyFeedbackElement.textContent = "コピーに失敗しました。コードを長押しして手動で選択・コピーしてください";
  }
});

deviceTransferClaimButtonElement.addEventListener("click", async () => {
  playClickSound();
  const code = deviceTransferCodeInputElement.value;
  if (!code.trim()) return;

  deviceTransferClaimButtonElement.disabled = true;
  deviceTransferClaimResultElement.hidden = false;
  deviceTransferClaimResultElement.textContent = "確認しています…";

  const result = await claimTransferCode(code);
  deviceTransferClaimButtonElement.disabled = false;

  if (!result.ok) {
    deviceTransferClaimResultElement.textContent = result.reason;
    return;
  }

  deviceTransferClaimResultElement.textContent = `引き継ぎが完了しました（${result.displayName ?? "プレイヤー"}さんのデータ）。ホーム画面に戻ってご確認ください。`;
  // 称号・自己ベスト等の表示を復元後の内容へ確実に合わせるため、ページを再読み込みする。
  setTimeout(() => window.location.reload(), 2000);
});

// 「データを復旧する」（データ管理画面、2026-08-29新設）。称号・履歴・自己ベスト等の
// クラウドバックアップ（js/backupSync.js）から、管理者経由で復旧するための入口。
// 【流れ】①「復旧を依頼する」で6桁番号を発行→本人が管理者へLINE等で伝える→
// ②管理者がバックアップ管理画面（js/adminBackupScreen.js）で対応→③この端末で
// 「確認する」を押すと、対応済みならその場で自動的に復元される。
dataRecoveryRequestButtonElement.addEventListener("click", async () => {
  playClickSound();
  dataRecoveryRequestButtonElement.disabled = true;
  dataRecoveryResultElement.hidden = false;
  dataRecoveryResultElement.textContent = "依頼を作成しています…";

  const result = await createRecoveryRequest();
  dataRecoveryRequestButtonElement.disabled = false;

  if (!result.ok) {
    dataRecoveryResultElement.textContent = result.reason;
    return;
  }

  dataRecoveryResultElement.hidden = true;
  dataRecoveryCodePanelElement.hidden = false;
  dataRecoveryCodeDisplayElement.textContent = result.code;
});

dataRecoveryCheckButtonElement.addEventListener("click", async () => {
  playClickSound();
  const code = dataRecoveryCodeDisplayElement.textContent.trim();
  if (!code) return;

  dataRecoveryCheckButtonElement.disabled = true;
  dataRecoveryResultElement.hidden = false;
  dataRecoveryResultElement.textContent = "確認しています…";

  const statusResult = await checkRecoveryRequestStatus(code);
  if (!statusResult.ok) {
    dataRecoveryCheckButtonElement.disabled = false;
    dataRecoveryResultElement.textContent = statusResult.reason;
    return;
  }

  if (statusResult.status !== "resolved" || !statusResult.resolvedBackupId) {
    dataRecoveryCheckButtonElement.disabled = false;
    dataRecoveryResultElement.textContent = "まだ管理者が対応していません。しばらくしてからもう一度お試しください。";
    return;
  }

  dataRecoveryResultElement.textContent = "復元しています…";
  const restoreResult = await restoreFromBackup(statusResult.resolvedBackupId);
  dataRecoveryCheckButtonElement.disabled = false;

  if (!restoreResult.ok) {
    dataRecoveryResultElement.textContent = restoreResult.reason;
    return;
  }

  dataRecoveryCodePanelElement.hidden = true;
  dataRecoveryResultElement.textContent = `復元が完了しました（${restoreResult.displayName ?? "プレイヤー"}さんのデータ）。ホーム画面に戻ってご確認ください。`;
  // 称号・自己ベスト等の表示を復元後の内容へ確実に合わせるため、ページを再読み込みする
  // （プレイヤー名表示・称号一覧など、多くの画面が起動時に一度だけ読み込む値を持っているため）。
  setTimeout(() => window.location.reload(), 2000);
});

// 「遊び方ガイド」リンク：開くたびに必ず目次から表示する（2026-08-15新設）。
initGuideScreen({
  tocView: guideTocViewElement,
  detailView: guideDetailViewElement,
  tocGroups: guideTocGroupsElement,
  detailBackButton: guideDetailBackButtonElement,
  detailBackButtonBottom: guideDetailBackButtonBottomElement,
  detailIcon: guideDetailIconElement,
  detailTitle: guideDetailTitleElement,
  detailTagline: guideDetailTaglineElement,
  detailStepsHeading: guideDetailStepsHeadingElement,
  detailSteps: guideDetailStepsElement,
  detailPoint: guideDetailPointElement,
});
guideLinkElement.addEventListener("click", () => {
  playClickSound();
  openGuideScreen();
  navigateWithScrollMemory("guide");
});
guideBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory(getGuideReturnScreenId());
});

fanProfilesBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// プレイ履歴画面の「戻る」：スタート画面へ戻る。
historyBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// プレイ履歴詳細画面の「戻る」：一覧画面へ戻る。
// renderHistoryScreen()は呼び直さない（詳細画面を見ている間に履歴データが増えることはない
// ＝復習プレイは履歴に保存されないため、一覧を再構築する必要がない）。
// ただし、画面はページ全体が縦スクロールする作りのため、一覧を再構築しないだけでは
// スクロール位置は保たれない（詳細画面の表示中に、ページのスクロール位置自体が変わるため）。
// そのため、詳細画面を開く直前の位置をhistoryListScrollYに保存しておき、ここで復元する。
historyDetailBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  showScreen("history");
  window.scrollTo(0, historyListScrollY);
});

// 「歴史・ディスコグラフィー」リンク：開くたびに描画し直す
// （曲データ・メンバーデータが増えることはあっても、画面を開いたまま変わることはないが、
// 他の画面と同じ描画パターンに揃えている）。
discographyLinkElement.addEventListener("click", () => {
  playClickSound();
  renderDiscographyScreen({
    songs: SONGS,
    members: MEMBERS,
    discographyEntries: DISCOGRAPHY,
    historyEvents: HISTORY_EVENTS,
    groupInfo: GROUP_INFO,
    groupActivities: GROUP_ACTIVITIES,
    liveEvents: LIVE_EVENTS,
    sisterGroups: SISTER_GROUPS,
    upcomingRelease: UPCOMING_RELEASE,
  });
  navigateWithScrollMemory("discography");
});

discographyBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// ドラマ紹介カード・収録曲一覧の特別クレジットなど、離れた画面同士を相互リンクさせたい箇所が
// 増えてきたため、カスタムイベント経由の汎用ナビゲーションを用意する（js/songlist.js・
// js/discographyScreen.jsは画面遷移の仕組みを直接importしなくてよくなる。2026-08-23追加）。
window.addEventListener("app-navigate", (event) => {
  const screen = event.detail?.screen;
  playClickSound();
  if (screen === "discography") {
    renderDiscographyScreen({
      songs: SONGS,
      members: MEMBERS,
      discographyEntries: DISCOGRAPHY,
      historyEvents: HISTORY_EVENTS,
      groupInfo: GROUP_INFO,
      groupActivities: GROUP_ACTIVITIES,
      liveEvents: LIVE_EVENTS,
      sisterGroups: SISTER_GROUPS,
      upcomingRelease: UPCOMING_RELEASE,
    });
    navigateWithScrollMemory("discography");
  } else if (screen === "songlist") {
    resetSongListToDefaultView();
    navigateWithScrollMemory("songlist");
  }
});

workDetailBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  showScreen("discography");
  window.scrollTo(0, discographyScrollY);
});

// 「メンバー紹介」リンク：開くたびに描画し直す（選択中メンバーの強調表示を反映するため）。
membersLinkElement.addEventListener("click", () => {
  playClickSound();
  renderMembersScreen(SONGS, MEMBERS, MEMBER_PROFILES);
  navigateWithScrollMemory("members");
});

membersBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
  renderPlayerSummary(); // メンバー一覧で推し登録を変更した可能性があるので表示し直す
});

memberDetailBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  // 選択中メンバーの強調表示（is-selected）を反映するため、一覧を描画し直してから戻る。
  renderMembersScreen(SONGS, MEMBERS, MEMBER_PROFILES);
  showScreen("members");
  window.scrollTo(0, membersScrollY);
});

// 特別モード一覧画面の「戻る」：スタート画面へ戻る。
specialModesBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// 苦手曲モード確認画面の「戻る」：ホーム画面へ戻る（2026-08-08修正：ホームの特別モードカードから
// 直接この画面を開くようになったため、間に古い「特別モード一覧画面」を挟まない）。
weakSongsBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// オリジナル問題作成モードの選曲画面の「戻る」：プリセット一覧画面へ戻る
// （スタート画面まで一気には戻らない。特別モード一覧までは、プリセット一覧の「戻る」で戻る）。
// 画面内の「複製する」で保存せずこの画面に留まったまま新しいプリセットができている場合があるため、
// 必ず最新の内容で一覧を描画し直してから戻る。試聴中の曲があれば必ず止める。
customQuizBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  stopCustomQuizPreview();
  renderCustomQuizPresetsScreen();
  showScreen("customQuizPresets");
});

// オリジナル問題作成モードのプリセット一覧画面の「戻る」（2026-08-29改訂、本人指示（⑭)）：
// 3種類の選択画面（#custom-quiz-type-select-screen）へ戻る。以前はホームへ直接戻っていたが、
// 今は必ず種類選択を経由するようになったため、その1つ手前の画面に戻す。
customQuizPresetsBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("customQuizTypeSelect");
});

// 出題数・カテゴリのラジオボタンが切り替わるたびに、自己ベスト表示・出題数の案内を更新する。
// ページを開いた直後（初期選択の状態）の分も、ここで一度呼んでおく。
document
  .querySelectorAll('input[name="question-count"], input[name="category-filter"]')
  .forEach((radio) => {
    radio.addEventListener("change", updateModeBestScoreDisplay);
    radio.addEventListener("change", updateQuestionCountNotice);
    // 【2026-10-01追加・本人指示：実機再確認で発覚、ホーム画面本体（最も使用頻度の高い
    // 通常のイントロクイズ設定）の出題数・カテゴリーボタンが無音だった】既存のオンライン
    // 対戦側と同じ、変更のたびにUI_CLICK効果音を鳴らす操作音を追加する。
    radio.addEventListener("change", () => playSfx(SFX_EVENTS.UI_CLICK));
  });
updateModeBestScoreDisplay();
updateQuestionCountNotice();
updateListenTileCounts();

// ===== タイムアタック（2026-08-06新設） =====
// 設定画面の選択中の出題数・カテゴリに対応する自己ベストを表示する。
// 通常プレイのupdateModeBestScoreDisplay()と同じ考え方だが、保存先（timeAttackScore.js）が
// 完全に別のため、既存のgetHighScore()は一切呼ばない。
function updateTimeAttackBestChip() {
  const questionCountValue = document.querySelector('input[name="time-attack-question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="time-attack-category-filter"]:checked').value;
  const rule = document.querySelector('input[name="time-attack-rule"]:checked').value;
  const variant =
    document.querySelector('input[name="time-attack-variant"]:checked')?.value ?? TIME_ATTACK_VARIANT.INTRO;
  const bestMs = getTimeAttackBest(rule, questionCountValue, categoryFilterValue, variant);

  timeAttackBestChipElement.textContent =
    bestMs !== null ? `自己ベスト：${(bestMs / 1000).toFixed(2)}秒` : "自己ベスト：記録なし";
  timeAttackBestChipElement.classList.toggle("is-empty", bestMs === null);
}

// ルール・出題タイプも自己ベストの対象（それぞれ別々に保存する）に含まれるため、
// 出題数・カテゴリだけでなく、ルール・出題タイプを切り替えたときも表示を更新する。
document
  .querySelectorAll(
    'input[name="time-attack-question-count"], input[name="time-attack-category-filter"], input[name="time-attack-rule"], input[name="time-attack-variant"]'
  )
  .forEach((radio) => radio.addEventListener("change", updateTimeAttackBestChip));

// タイムアタックの設定画面の「戻る」：ホーム画面へ戻る（2026-08-08修正：ホームの特別モード
// カードから直接この画面を開くようになったため、間に古い「特別モード一覧画面」を挟まない）。
timeAttackSetupBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// 指定した出題数・カテゴリ・ルールで、タイムアタックのクイズ画面を開始する共通処理。
// 既存のbeginQuiz()と同じ考え方（曲プールの絞り込み・検証→問題生成→開始）だが、
// 実際の問題生成はjs/timeAttackScreen.jsのbuildTimeAttackQuestions()に任せている
// （既存のfilterSongsByCategory・validatePoolSize・resolveQuestionCount・buildQuizQuestionsを
// 内部でそのまま再利用しているだけで、出題ロジック自体には一切手を加えていない）。
async function beginTimeAttackQuiz(questionCountValue, categoryFilterValue, rule, variant = TIME_ATTACK_VARIANT.INTRO) {
  // 出題タイプ（イントロ／ランダム再生）は「音源をどこから再生するか」だけの違いで、
  // 出題する曲・4択の作り方自体はどちらも同じため、問題生成はvariantによらず共通のまま
  // （実際の再生開始位置の計算はshowQuestion()側でvariantを見て分岐する）。
  const questions = await buildTimeAttackQuestions(questionCountValue, categoryFilterValue);

  if (!questions) {
    timeAttackStartErrorElement.textContent =
      "音源を読み込んだ曲が足りません。スタート画面の「音源を読み込む」から曲を追加するか、カテゴリの範囲を広げてください。";
    timeAttackStartErrorElement.hidden = false;
    return;
  }

  timeAttackStartErrorElement.hidden = true;
  startTimeAttackRun(rule, questionCountValue, categoryFilterValue, variant);
  startTimeAttackQuiz(questions, questionCountValue, categoryFilterValue);
  showScreen("quiz");
  renderQuestion();
}

initTimeAttackScreen({
  startButton: timeAttackStartButtonElement,
  onStart: (questionCountValue, categoryFilterValue, rule, variant) => {
    playSfx(SFX_EVENTS.GAME_START);
    beginTimeAttackQuiz(questionCountValue, categoryFilterValue, rule, variant);
  },
});

initTimeAttackResultScreen({
  newRecordBadge: timeAttackResultNewRecordElement,
  failStatus: timeAttackResultFailStatusElement,
  totalTime: timeAttackResultTotalTimeElement,
  correctCount: timeAttackResultCorrectCountElement,
  missCount: timeAttackResultMissCountElement,
  ruleLabel: timeAttackResultRuleLabelElement,
  averageTime: timeAttackResultAverageTimeElement,
  speedProgressContainer: timeAttackResultSpeedProgressElement,
  bestTime: timeAttackResultBestTimeElement,
  achievementChipContainer: timeAttackResultAchievementListElement,
  achievementListLink: timeAttackResultAchievementListLinkElement,
  leaderboardStatus: timeAttackResultLeaderboardStatusElement,
  // グローバルランキングへの送信（2026-08-07追加）。ローカルの自己ベスト更新が確定した
  // ときだけ呼ばれる（js/timeAttackScreen.jsのrenderTimeAttackResult参照）。
  // 呼び出し側（結果画面の表示）を絶対にブロックしないよう、awaitせず呼び捨てる
  // （js/publicProfileSync.jsのsyncPublicProfileIfEnabled()と同じ設計方針）。
  // 【2026-08-16改訂・本人指示】ルール（ノーマル/ハード/LOVE連チャン）を問わず対象にする。
  // 1問でも間違えたプレイ（missCount>0）はsubmitTimeAttackScoreIfBetter側で弾かれ、
  // "invalid-record"として案内する（不正扱いではなく「対象外」と分かる文言にする）。
  onNewRecord: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount, actualQuestionCount }) => {
    timeAttackResultLeaderboardStatusElement.hidden = false;
    timeAttackResultLeaderboardStatusElement.textContent = "ランキングを確認しています…";
    submitTimeAttackScoreIfBetter({
      variant,
      rule,
      source: "timeAttack",
      questionCountValue,
      categoryFilterValue,
      clearTimeMs: totalElapsedMs,
      missCount,
      playerKeyPrefix: getPlayerKeyPrefix(),
      actualQuestionCount,
    }).then((result) => {
      if (!result.ok) {
        const messageByReason = {
          "privacy-disabled": "「フレンド」を公開するとランキングに参加できます",
          offline: "オフラインのため、ランキングへの送信はできませんでした",
          error: "ランキングへの送信に失敗しました",
          "invalid-record": "1問でも間違えると、公開ランキングには反映されません（自己ベストには保存済みです）",
          "unsupported-dimension": "このカテゴリーはランキング対象外です（表題曲のみ・表題曲＋全員曲が対象）",
        };
        timeAttackResultLeaderboardStatusElement.textContent =
          messageByReason[result.reason] ?? "ランキングへの送信に失敗しました";
        return;
      }
      timeAttackResultLeaderboardStatusElement.textContent = result.updated
        ? "🏆 ランキングの記録を更新しました！"
        : "ランキング上の記録はすでにこのタイム以上でした";
    });
  },
  // 【2026-08-16追加、本人指示】公開設定OFF中でも、ランキング条件を満たした記録は
  // 常にローカルへ保存しておく（js/rankingCandidateStore.js）。onNewRecordと違い、
  // ローカル自己ベストを更新したかどうかに関係なく、ミス0で完走した記録なら毎回呼ばれる
  // （js/timeAttackScreen.jsのrenderTimeAttackResult参照）。
  onCleanClear: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount, actualQuestionCount }) => {
    saveRankingCandidateIfBetter({
      variant,
      questionCountValue,
      categoryFilterValue,
      clearTimeMs: totalElapsedMs,
      missCount,
      rule,
      source: "timeAttack",
      achievedAt: Date.now(),
      actualQuestionCount,
    });
  },
});

// 「もう一度挑戦する」：直前と同じ出題数・カテゴリ・ルールのまま、問題を再抽選して開始する。
timeAttackResultRetryButtonElement.addEventListener("click", () => {
  playClickSound();
  const { questionCountValue, categoryFilterValue, rule, variant } = getLastTimeAttackSelection();
  beginTimeAttackQuiz(questionCountValue, categoryFilterValue, rule, variant);
});

// 「タイムアタック設定へ戻る」：条件を変えて挑戦し直したいときの導線。設定画面のラジオボタンは
// このボタンでは一切操作していない（＝ここまで選んでいた出題数・カテゴリ・ルールがそのまま
// 残っている）ため、素直に画面を切り替えるだけでよい。自己ベストチップだけは、今回の結果で
// 更新されている可能性があるため、表示し直しておく。
timeAttackResultSetupButtonElement.addEventListener("click", () => {
  playClickSound();
  updateTimeAttackBestChip();
  showScreen("timeAttackSetup");
});

// 左上の「⌂ ホームへ戻る」リンク：タイムアタックそのものを終えてタイトルへ戻る、一番奥の導線。
timeAttackResultHomeLinkElement.addEventListener("click", () => {
  playClickSound();
  showScreen("start");
});

// ===== タイムアタック：グローバルランキング（TOP10、2026-08-07新設） =====
// どこから戻るかを覚えておき、「戻る」で元の画面（設定 or 結果）へ戻す
// （js/timeAttackHistoryScreen.jsのスクロール位置記憶と同じ「呼び出し元を覚えておく」考え方）。
let timeAttackLeaderboardReturnScreen = "timeAttackSetup";

initTimeAttackLeaderboardScreen(
  {
    variantTabs: timeAttackLeaderboardVariantTabsElement,
    questionCountTabs: timeAttackLeaderboardQuestionCountTabsElement,
    categoryTabs: timeAttackLeaderboardCategoryTabsElement,
    loadingState: timeAttackLeaderboardLoadingElement,
    offlineState: timeAttackLeaderboardOfflineElement,
    emptyState: timeAttackLeaderboardEmptyElement,
    listContainer: timeAttackLeaderboardListElement,
    myRecordSection: timeAttackLeaderboardMyRecordElement,
    myRecordText: timeAttackLeaderboardMyRecordTextElement,
    backButton: timeAttackLeaderboardBackButtonElement,
    onBack: () => {
      playClickSound();
      showScreen(timeAttackLeaderboardReturnScreen);
    },
    adminDeleteOverlay: timeAttackLeaderboardAdminDeleteOverlayElement,
    adminDeleteName: timeAttackLeaderboardAdminDeleteNameElement,
    adminDeleteTime: timeAttackLeaderboardAdminDeleteTimeElement,
    adminDeleteVariant: timeAttackLeaderboardAdminDeleteVariantElement,
    adminDeleteQuestionCount: timeAttackLeaderboardAdminDeleteQuestionCountElement,
    adminDeleteCategory: timeAttackLeaderboardAdminDeleteCategoryElement,
    adminDeleteCancelButton: timeAttackLeaderboardAdminDeleteCancelButtonElement,
    adminDeleteConfirmButton: timeAttackLeaderboardAdminDeleteConfirmButtonElement,
  },
  MEMBERS
);

// タイムアタック設定画面から：今選んでいる出題タイプ・出題数・カテゴリーの
// ランキングを最初に表示する（2026-08-16改訂：ルールはもう区分ではないため渡さない）。
timeAttackLeaderboardLinkElement.addEventListener("click", () => {
  playClickSound();
  const questionCountValue = document.querySelector('input[name="time-attack-question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="time-attack-category-filter"]:checked').value;
  const variant =
    document.querySelector('input[name="time-attack-variant"]:checked')?.value ?? TIME_ATTACK_VARIANT.INTRO;
  timeAttackLeaderboardReturnScreen = "timeAttackSetup";
  showTimeAttackLeaderboard(variant, questionCountValue, categoryFilterValue);
  showScreen("timeAttackLeaderboard");
});

// タイムアタック結果画面から：直前にプレイした条件のランキングを最初に表示する。
timeAttackResultLeaderboardLinkElement.addEventListener("click", () => {
  playClickSound();
  const { questionCountValue, categoryFilterValue, variant } = getLastTimeAttackSelection();
  timeAttackLeaderboardReturnScreen = "timeAttackResult";
  showTimeAttackLeaderboard(variant, questionCountValue, categoryFilterValue);
  showScreen("timeAttackLeaderboard");
});

// ホーム上部「🏆ランキング」から：直前にプレイした条件が分かればそれを、無ければ
// イントロ・5問から表示する（2026-08-16追加）。「戻る」はホームへ。
homeLeaderboardLinkElement.addEventListener("click", () => {
  playClickSound();
  const { questionCountValue, categoryFilterValue, variant } = getLastTimeAttackSelection();
  timeAttackLeaderboardReturnScreen = "start";
  showTimeAttackLeaderboard(variant, questionCountValue, categoryFilterValue);
  navigateWithScrollMemory("timeAttackLeaderboard");
});

// タイムアタック履歴一覧・詳細画面の初期化。通常プレイ履歴（historyScreen.js/historyDetailScreen.js）
// と同じ配線パターン（onSelectEntryで詳細を開く、スクロール位置を覚えておく）に揃えている。
initTimeAttackHistoryScreen({
  listContainer: timeAttackHistoryListElement,
  emptyState: timeAttackHistoryEmptyStateElement,
  onSelectEntry: (entry) => {
    playClickSound();
    timeAttackHistoryListScrollY = window.scrollY;
    renderTimeAttackHistoryDetail(entry);
    showScreen("timeAttackHistoryDetail");
  },
});

initTimeAttackHistoryDetailScreen({
  date: document.getElementById("time-attack-history-detail-date"),
  mode: document.getElementById("time-attack-history-detail-mode"),
  totalTime: document.getElementById("time-attack-history-detail-total-time"),
  correctCount: document.getElementById("time-attack-history-detail-correct-count"),
  missCount: document.getElementById("time-attack-history-detail-miss-count"),
  newRecord: document.getElementById("time-attack-history-detail-new-record"),
  failStatus: document.getElementById("time-attack-history-detail-fail-status"),
  questionList: document.getElementById("time-attack-history-detail-question-list"),
});

// タイムアタック設定画面の「タイムアタック履歴」：開くたびに最新の内容で描画し直す
// （直前のプレイ結果もすぐ反映されるようにするため。historyScreen.jsのrenderHistoryScreen()と同じ考え方）。
timeAttackHistoryLinkElement.addEventListener("click", () => {
  playClickSound();
  renderTimeAttackHistoryScreen();
  showScreen("timeAttackHistory");
});

timeAttackHistoryBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  showScreen("timeAttackSetup");
});

timeAttackHistoryDetailBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  showScreen("timeAttackHistory");
  window.scrollTo(0, timeAttackHistoryListScrollY);
});

// ===== ランダム再生クイズ（2026-08-08新設） =====
// 設定画面の選択中の出題数・カテゴリ・ルールに対応する自己ベストを表示する。
// updateTimeAttackBestChip()と全く同じ考え方だが、保存先（randomPlaybackScore.js）が別のため、
// getTimeAttackBest()は呼ばない。
function updateRandomPlaybackBestChip() {
  const questionCountValue = document.querySelector('input[name="random-playback-question-count"]:checked').value;
  const categoryFilterValue = document.querySelector('input[name="random-playback-category-filter"]:checked').value;
  const rule = document.querySelector('input[name="random-playback-rule"]:checked').value;
  const bestMs = getRandomPlaybackBest(rule, questionCountValue, categoryFilterValue);

  randomPlaybackBestChipElement.textContent =
    bestMs !== null ? `自己ベスト：${(bestMs / 1000).toFixed(2)}秒` : "自己ベスト：記録なし";
  randomPlaybackBestChipElement.classList.toggle("is-empty", bestMs === null);
}

document
  .querySelectorAll(
    'input[name="random-playback-question-count"], input[name="random-playback-category-filter"], input[name="random-playback-rule"]'
  )
  .forEach((radio) => radio.addEventListener("change", updateRandomPlaybackBestChip));

// 2026-08-08修正：ホームの特別モードカードから直接この画面を開くようになったため、
// 「戻る」は間に古い「特別モード一覧画面」を挟まずホーム画面へ直接戻す。
randomPlaybackSetupBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// 指定した出題数・カテゴリ・ルールで、ランダム再生クイズの画面を開始する共通処理。
// beginTimeAttackQuiz()と全く同じ考え方だが、問題生成自体はbuildTimeAttackQuestions()を
// そのまま再利用する（曲・選択肢の選び方自体はタイムアタックと変える必要がないため。
// 変わるのは「どこから再生するか」だけで、それはrenderQuestion()側で処理する）。
async function beginRandomPlaybackQuiz(questionCountValue, categoryFilterValue, rule) {
  const questions = await buildTimeAttackQuestions(questionCountValue, categoryFilterValue);

  if (!questions) {
    randomPlaybackStartErrorElement.textContent =
      "音源を読み込んだ曲が足りません。スタート画面の「音源を読み込む」から曲を追加するか、カテゴリの範囲を広げてください。";
    randomPlaybackStartErrorElement.hidden = false;
    return;
  }

  randomPlaybackStartErrorElement.hidden = true;
  startRandomPlaybackRun(rule, questionCountValue, categoryFilterValue);
  startRandomPlaybackQuiz(questions, questionCountValue, categoryFilterValue);
  showScreen("quiz");
  renderQuestion();
}

initRandomPlaybackScreen({
  startButton: randomPlaybackStartButtonElement,
  onStart: (questionCountValue, categoryFilterValue, rule) => {
    // 【2026-09-23新設・本人指示：新規プレイのたびに第1問だけ無音になる問題の再調査】
    recordAudioDiagnostic("[GAME_START] スタートボタン押下（ランダム再生クイズ）");
    playSfx(SFX_EVENTS.GAME_START);
    beginRandomPlaybackQuiz(questionCountValue, categoryFilterValue, rule);
  },
});

initRandomPlaybackResultScreen({
  newRecordBadge: randomPlaybackResultNewRecordElement,
  failStatus: randomPlaybackResultFailStatusElement,
  totalTime: randomPlaybackResultTotalTimeElement,
  correctCount: randomPlaybackResultCorrectCountElement,
  missCount: randomPlaybackResultMissCountElement,
  ruleLabel: randomPlaybackResultRuleLabelElement,
  averageTime: randomPlaybackResultAverageTimeElement,
  speedProgressContainer: randomPlaybackResultSpeedProgressElement,
  bestTime: randomPlaybackResultBestTimeElement,
  achievementChipContainer: randomPlaybackResultAchievementListElement,
  achievementListLink: randomPlaybackResultAchievementListLinkElement,
  leaderboardStatus: randomPlaybackResultLeaderboardStatusElement,
  // グローバルランキングへの送信（2026-08-16追加）。js/timeAttackScreen.jsのonNewRecordと
  // 全く同じ設計・同じ送信関数を再利用する（本人指示：同じランキング実装を再利用する）。
  // sourceだけ"normal"にして、タイムアタック経由の記録と区別する。
  onNewRecord: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount, actualQuestionCount }) => {
    randomPlaybackResultLeaderboardStatusElement.hidden = false;
    randomPlaybackResultLeaderboardStatusElement.textContent = "ランキングを確認しています…";
    submitTimeAttackScoreIfBetter({
      variant,
      rule,
      source: "normal",
      questionCountValue,
      categoryFilterValue,
      clearTimeMs: totalElapsedMs,
      missCount,
      playerKeyPrefix: getPlayerKeyPrefix(),
      actualQuestionCount,
    }).then((result) => {
      if (!result.ok) {
        const messageByReason = {
          "privacy-disabled": "「フレンド」を公開するとランキングに参加できます",
          offline: "オフラインのため、ランキングへの送信はできませんでした",
          error: "ランキングへの送信に失敗しました",
          "invalid-record": "1問でも間違えると、公開ランキングには反映されません（自己ベストには保存済みです）",
          "unsupported-dimension": "このカテゴリーはランキング対象外です（表題曲のみ・表題曲＋全員曲が対象）",
        };
        randomPlaybackResultLeaderboardStatusElement.textContent =
          messageByReason[result.reason] ?? "ランキングへの送信に失敗しました";
        return;
      }
      randomPlaybackResultLeaderboardStatusElement.textContent = result.updated
        ? "🏆 ランキングの記録を更新しました！"
        : "ランキング上の記録はすでにこのタイム以上でした";
    });
  },
  // 【2026-08-16追加、本人指示】js/timeAttackScreen.jsのonCleanClearと同じ理由・同じ設計。
  onCleanClear: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount, actualQuestionCount }) => {
    saveRankingCandidateIfBetter({
      variant,
      questionCountValue,
      categoryFilterValue,
      clearTimeMs: totalElapsedMs,
      missCount,
      rule,
      source: "normal",
      achievedAt: Date.now(),
      actualQuestionCount,
    });
  },
});

// 「もう一度挑戦する」：直前と同じ出題数・カテゴリ・ルールのまま、問題を再抽選して開始する。
randomPlaybackResultRetryButtonElement.addEventListener("click", () => {
  playClickSound();
  const { questionCountValue, categoryFilterValue, rule } = getLastTimeAttackSelection();
  beginRandomPlaybackQuiz(questionCountValue, categoryFilterValue, rule);
});

randomPlaybackResultSetupButtonElement.addEventListener("click", () => {
  playClickSound();
  updateRandomPlaybackBestChip();
  showScreen("randomPlaybackSetup");
});

randomPlaybackResultHomeLinkElement.addEventListener("click", () => {
  playClickSound();
  showScreen("start");
});

// ===== 歌詞クイズモード（1人用MVP、2026-08-09新設） =====
// 通常クイズ・タイムアタック・ランダム再生クイズと違い、既存の#quiz-screen（4択）は使わず、
// 「ヒントを見ながら曲名を探す」専用の問題画面（#lyrics-quiz-question-screen）を使う。
// 進行状態（今何問目か・今のヒント段階・回答済みか等）はgameStateに乗せず、
// js/lyricsQuizScreen.js側で完結させている。

// 2026-08-08修正：ホームの特別モードカードから直接この画面を開くようになったため、
// 「戻る」は間に古い「特別モード一覧画面」を挟まずホーム画面へ直接戻す。
lyricsQuizSetupBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// 【2026-08-29追加】戻る導線（問題画面の「設定に戻る」・結果画面の「歌詞クイズ設定へ戻る」）の
// 文言を、苦手曲モードB（歌詞クイズ版）の練習中かどうかで切り替える。
// js/lyricsQuizScreen.jsのisLyricsQuizPracticeRun()を、開始直後・結果表示直後の両方で
// 呼び直すことで、常に「今の回」に合った文言になる。
function updateLyricsQuizBackButtonLabel() {
  // 【2026-10-01修正・実機で発覚：オリジナル問題作成モードから始めた歌詞クイズなのに
  // 「苦手曲モードへ戻る」と表示され、実際に苦手曲モードへ遷移してしまうバグの修正】
  // isLyricsQuizPracticeRun()は「通常入口かどうか」しか区別せず、苦手曲モード由来と
  // オリジナル問題作成モード由来を1つにまとめてしまっていた。起点ごとに正しい文言・
  // 戻り先を出し分ける（js/instantChallengeScreen.jsの
  // isInstantChallengeWeakSongsPractice()/isInstantChallengeFromCustomPreset()と同じ設計）。
  const label = isLyricsQuizWeakSongsPractice()
    ? "苦手曲モードへ戻る"
    : isLyricsQuizFromCustomPreset()
      ? "オリジナル問題一覧へ戻る"
      : "設定に戻る";
  const resultLabel = isLyricsQuizWeakSongsPractice()
    ? "苦手曲モードへ戻る"
    : isLyricsQuizFromCustomPreset()
      ? "オリジナル問題一覧へ戻る"
      : "歌詞クイズ設定へ戻る";
  if (lyricsQuizBackButtonLabelElement) lyricsQuizBackButtonLabelElement.textContent = label;
  if (lyricsQuizResultSetupButtonLabelElement) lyricsQuizResultSetupButtonLabelElement.textContent = resultLabel;
}

initLyricsQuizSetupScreen({
  startButton: lyricsQuizStartButtonElement,
  startError: lyricsQuizStartErrorElement,
  bestChip: lyricsQuizBestChipElement,
  onStart: () => {
    playSfx(SFX_EVENTS.GAME_START);
    updateLyricsQuizBackButtonLabel();
    showScreen("lyricsQuizQuestion");
    startLyricsQuizPlay();
  },
  onFinish: () => {
    updateLyricsQuizBackButtonLabel();
    showScreen("lyricsQuizResult");
    renderLyricsQuizResult();
  },
});

initLyricsQuizQuestionScreen({
  progress: lyricsQuizProgressElement,
  elapsedTime: lyricsQuizElapsedTimeElement,
  hintLevelLabel: lyricsQuizHintLevelElement,
  hintLevelNav: lyricsQuizHintLevelNavElement,
  hintList: lyricsQuizHintListElement,
  nextHintButton: lyricsQuizNextHintButtonElement,
  skipButton: lyricsQuizSkipButtonElement,
  answerSection: lyricsQuizAnswerSectionElement,
  answerSearchRow: lyricsQuizAnswerSearchRowElement,
  answerSearchInput: lyricsQuizAnswerSearchInputElement,
  answerCount: lyricsQuizAnswerCountElement,
  answerJumpBar: lyricsQuizAnswerJumpBarElement,
  answerList: lyricsQuizAnswerListElement,
  answerReveal: lyricsQuizAnswerRevealElement,
  answerRevealStatus: lyricsQuizAnswerRevealStatusElement,
  answerRevealTitle: lyricsQuizAnswerRevealTitleElement,
  answerRevealMeta: lyricsQuizAnswerRevealMetaElement,
  answerRevealNextButton: lyricsQuizAnswerRevealNextButtonElement,
  backButton: lyricsQuizBackButtonElement,
  quitConfirmModal: lyricsQuizQuitConfirmModalElement,
  quitCancelButton: lyricsQuizQuitCancelButtonElement,
  quitRestartButton: lyricsQuizQuitRestartButtonElement,
  quitConfirmButton: lyricsQuizQuitConfirmButtonElement,
  onQuit: () => {
    playSfx(SFX_EVENTS.UI_BACK);
    // 【2026-08-29追加→2026-10-01修正】苦手曲モードBの練習中は苦手曲モード確認画面へ、
    // オリジナル問題作成モードから始めた回はオリジナル問題一覧へ戻す（本人指示：起点を
    // 混同しない）。js/weakSongsScreen.jsのgoToWeakSongsScreen・
    // goToCustomQuizPresetsListと同じ戻り先。
    if (isLyricsQuizWeakSongsPractice()) {
      goToWeakSongsScreen();
      return;
    }
    if (isLyricsQuizFromCustomPreset()) {
      goToCustomQuizPresetsList();
      return;
    }
    updateLyricsQuizBestChip();
    showScreen("lyricsQuizSetup");
  },
});

initLyricsQuizResultScreen({
  correctCount: lyricsQuizResultCorrectCountElement,
  missCount: lyricsQuizResultMissCountElement,
  totalHintsUsed: lyricsQuizResultTotalHintsUsedElement,
  averageHintsUsed: lyricsQuizResultAverageHintsUsedElement,
  firstHintCorrectCount: lyricsQuizResultFirstHintCorrectCountElement,
  totalElapsedTime: lyricsQuizResultTotalElapsedTimeElement,
  newRecordBadge: lyricsQuizResultNewRecordElement,
  breakdownList: lyricsQuizResultBreakdownListElement,
  achievementChipContainer: lyricsQuizResultAchievementListElement,
  achievementListLink: lyricsQuizResultAchievementListLinkElement,
});

lyricsQuizResultRetryButtonElement.addEventListener("click", () => {
  playClickSound();
  retryLyricsQuizRun();
});

lyricsQuizResultSetupButtonElement.addEventListener("click", () => {
  playClickSound();
  // 【2026-10-01修正】上のonQuitと同じ理由で、起点ごとに戻り先を出し分ける。
  if (isLyricsQuizWeakSongsPractice()) {
    goToWeakSongsScreen();
    return;
  }
  if (isLyricsQuizFromCustomPreset()) {
    goToCustomQuizPresetsList();
    return;
  }
  updateLyricsQuizBestChip();
  showScreen("lyricsQuizSetup");
});

lyricsQuizResultHomeLinkElement.addEventListener("click", () => {
  playClickSound();
  showScreen("start");
});

// ===== 対戦モード（ローカル対戦、2026-08-06新設） =====
// 画面遷移・効果音はこのプロジェクトの決まりどおりmain.js側だけで扱うため、
// js/localBattleScreen.js・js/localBattleResultScreen.js側からは、この1つの
// navigateToコールバック経由でだけ画面を切り替えてもらう（詳細は各ファイルの冒頭コメント参照）。
// 【2026-08-09修正】対戦モード・オンライン対戦の画面遷移すべてに、既存の
// navigateWithScrollMemory()を通す（本人指示：新しい仕組みを重複して作らず既存を再利用）。
// 対象になっていないtargetScreenは今までどおりscrollTo(0,0)相当の挙動のままなので、
// 対戦フロー内の他の画面遷移に副作用はない。
function navigateBattleScreen(screenName) {
  playClickSound();
  navigateWithScrollMemory(screenName);
}

initLocalBattleScreens({
  navigateTo: navigateBattleScreen,
  modeSelectBackButton: battleModeSelectBackButtonElement,
  mode1v1Button: battleMode1v1ButtonElement,
  mode4pButton: battleMode4pButtonElement,
  createOrJoinBackButton: battleCreateOrJoinBackButtonElement,
  createOrJoinTitle: battleCreateOrJoinTitleElement,
  createButton: battleCreateButtonElement,
  joinButton: battleJoinButtonElement,
  setupBackButton: battleSetupBackButtonElement,
  setupCreateCodeButton: battleSetupCreateCodeButtonElement,
  setupError: battleSetupErrorElement,
  setupRuleHint: battleSetupRuleHintElement,
  setupPenaltyFieldset: battleSetupPenaltyFieldsetElement,
  codeShareBackButton: battleCodeShareBackButtonElement,
  codeShareConfigSummary: battleCodeShareConfigSummaryElement,
  codeShareValue: battleCodeShareValueElement,
  codeShareStartButton: battleCodeShareStartButtonElement,
  joinBackButton: battleJoinBackButtonElement,
  joinCodeInput: battleJoinCodeInputElement,
  joinError: battleJoinErrorElement,
  joinConfirmButton: battleJoinConfirmButtonElement,
  ruleConfirmBackButton: battleRuleConfirmBackButtonElement,
  ruleConfirmConfigSummary: battleRuleConfirmConfigSummaryElement,
  ruleConfirmRuleHint: battleRuleConfirmRuleHintElement,
  ruleConfirmAudioCheck: battleRuleConfirmAudioCheckElement,
  ruleConfirmPlayerName: battleRuleConfirmPlayerNameElement,
  ruleConfirmStartButton: battleRuleConfirmStartButtonElement,
  onStartBattle: (config) => {
    playClickSound();
    beginLocalBattlePlay(config);
  },
});

initLocalBattleResultScreens({
  navigateTo: navigateBattleScreen,
  homeLink: battleResultCollectHomeLinkElement,
  progress: battleResultCollectProgressElement,
  list: battleResultCollectListElement,
  myResultCode: battleResultCollectMyCodeElement,
  addSection: battleResultCollectAddSectionElement,
  nameInput: battleResultCollectNameInputElement,
  codeInput: battleResultCollectCodeInputElement,
  error: battleResultCollectErrorElement,
  addButton: battleResultCollectAddButtonElement,
  finishButton: battleResultCollectFinishButtonElement,
  rankingConfigSummary: battleResultRankingConfigSummaryElement,
  rankingList: battleResultRankingListElement,
  rankingRuleNote: battleResultRankingRuleNoteElement,
  rankingHomeButton: battleResultRankingHomeButtonElement,
});

// 【2026-09-05新設、本人指示：対戦中にルーム設定へ戻る機能】4つの対戦画面（個人進行・
// 一瞬バトル・歌詞クイズ・一瞬協力）が共有する「ルーム設定へ戻る」確認モーダルを、
// それぞれのinit呼び出しより先に一度だけ配線する。
initReturnToLobbyPrompt({
  modal: onlineBattleReturnToLobbyModalElement,
  cancelButton: onlineBattleReturnToLobbyCancelButtonElement,
  confirmButton: onlineBattleReturnToLobbyConfirmButtonElement,
});
// 【2026-09-14新設、本人指示：対戦中のゲストが自分だけ途中離脱する】
initLeaveMatchPrompt({
  modal: onlineBattleLeaveMatchModalElement,
  cancelButton: onlineBattleLeaveMatchCancelButtonElement,
  confirmButton: onlineBattleLeaveMatchConfirmButtonElement,
});
// 【2026-11-XX新設・本人指示：ルーム招待】js/roomInviteUi.jsはjs/onlineBattleScreen.jsを
// importしない末端モジュールのため（循環import回避）、ロビーの「友達を招待」ボタンの
// クリック配線だけはここ（両方をimportできる場所）で行う。
onlineBattleLobbyInviteButtonElement?.addEventListener("click", () => {
  const roomId = getCurrentOnlineRoomId();
  if (roomId) openInvitePicker(roomId);
});
initRoomInviteUi({
  pickerModal: roomInvitePickerModalElement,
  pickerCloseButton: roomInvitePickerCloseButtonElement,
  pickerList: roomInvitePickerListElement,
  pickerLoading: roomInvitePickerLoadingElement,
  pickerEmpty: roomInvitePickerEmptyElement,
  banner: roomInviteBannerElement,
  bannerText: roomInviteBannerTextElement,
  bannerMoreLabel: roomInviteBannerMoreLabelElement,
  bannerError: roomInviteBannerErrorElement,
  bannerAcceptButton: roomInviteBannerAcceptButtonElement,
  bannerDeclineButton: roomInviteBannerDeclineButtonElement,
  bannerLaterButton: roomInviteBannerLaterButtonElement,
});
// 【2026-09-15新設、本人指示：ゲスト側の退出操作にも必ず確認ダイアログ】
initResultLeavePrompt({
  modal: onlineBattleResultLeaveModalElement,
  cancelButton: onlineBattleResultLeaveCancelButtonElement,
  confirmButton: onlineBattleResultLeaveConfirmButtonElement,
});
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第3ラウンド】結果画面の
// 「⌂ ホームへ戻る」用の二重確認。
initResultHomePrompt({
  modal: onlineBattleResultHomeConfirmModalElement,
  cancelButton: onlineBattleResultHomeCancelButtonElement,
  confirmButton: onlineBattleResultHomeConfirmButtonElement,
});

// 【2026-09-06新設、本人指示：実機フィードバック②】回答速度が勝敗に直接関係しない
// モード（一瞬チャレンジ・一瞬バトル・一瞬協力・歌詞クイズ「正解数バトル」
// 「ポイントバトル」）が共有する回答確認モーダルを、それぞれのinit呼び出しより先に配線する。
initAnswerConfirmPrompt({
  modal: answerConfirmModalElement,
  songTitleElement: answerConfirmSongTitleElement,
  confirmButton: answerConfirmConfirmButtonElement,
  cancelButton: answerConfirmCancelButtonElement,
});

// オンライン対戦（Firebase）画面群。navigateToは既存のnavigateBattleScreen（効果音＋showScreen）を
// そのまま再利用する（オフライン対戦と同じ、画面数が多いモードでの確立されたパターン）。
initOnlineBattleScreens({
  navigateTo: navigateBattleScreen,
  entryBackButton: onlineBattleEntryBackButtonElement,
  entryCreateButton: onlineBattleEntryCreateButtonElement,
  entryJoinButton: onlineBattleEntryJoinButtonElement,
  entryKickedNotice: onlineBattleEntryKickedNoticeElement,
  entryLastRoomBanner: onlineBattleEntryLastRoomBannerElement,
  entryLastRoomText: onlineBattleEntryLastRoomTextElement,
  entryLastRoomRejoinButton: onlineBattleEntryLastRoomRejoinButtonElement,
  entryLastRoomButtonLabel: onlineBattleEntryLastRoomButtonLabelElement,
  entryLastRoomError: onlineBattleEntryLastRoomErrorElement,
  createBackButton: onlineBattleCreateBackButtonElement,
  createNameInput: onlineBattleCreateNameInputElement,
  createSubmitButton: onlineBattleCreateSubmitButtonElement,
  createError: onlineBattleCreateErrorElement,
  joinBackButton: onlineBattleJoinBackButtonElement,
  joinRoomCodeInput: onlineBattleJoinRoomCodeInputElement,
  joinNameInput: onlineBattleJoinNameInputElement,
  joinSubmitButton: onlineBattleJoinSubmitButtonElement,
  joinError: onlineBattleJoinErrorElement,
  lobbyLeaveButton: onlineBattleLobbyLeaveButtonElement,
  lobbyLeaveConfirmModal: onlineBattleLobbyLeaveConfirmModalElement,
  lobbyLeaveCancelButton: onlineBattleLobbyLeaveCancelButtonElement,
  lobbyLeaveConfirmButton: onlineBattleLobbyLeaveConfirmButtonElement,
  lobbyGoneNotice: onlineBattleLobbyGoneNoticeElement,
  lobbyContent: onlineBattleLobbyContentElement,
  lobbyRoomCode: onlineBattleLobbyRoomCodeElement,
  lobbyPlayerCount: onlineBattleLobbyPlayerCountElement,
  lobbyMaxPlayersText: onlineBattleLobbyMaxPlayersElement,
  lobbyGameModeText: onlineBattleLobbyGameModeElement,
  lobbyModeChange: onlineBattleLobbyModeChangeElement,
  lobbyPlayerList: onlineBattleLobbyPlayerListElement,
  lobbySettingsHost: onlineBattleLobbySettingsHostElement,
  lobbySettingsParticipant: onlineBattleLobbySettingsParticipantElement,
  lobbySettingsSummary: onlineBattleLobbySettingsSummaryElement,
  lobbySettingsPenaltyFieldset: onlineBattleLobbySettingsPenaltyFieldsetElement,
  lobbySettingsHostInstant: onlineInstantBattleLobbySettingsHostElement,
  lobbySettingsParticipantInstant: onlineInstantBattleLobbySettingsParticipantElement,
  instantBattleSettingsSummary: onlineInstantBattleSettingsSummaryElement,
  instantBattleSettingsError: onlineInstantBattleSettingsErrorElement,
  lobbySettingsHostCoop: onlineInstantCoopLobbySettingsHostElement,
  lobbySettingsParticipantCoop: onlineInstantCoopLobbySettingsParticipantElement,
  // 【2026-08-31発見・修正】歌詞クイズ専用の設定セクション自体は、これまでこのファイルの
  // elementsに含まれておらず、renderLyricsQuizLobbySettings()（isLyricsQuizのときだけ呼ばれる）
  // 側でのみhidden切り替えを行っていた。歌詞クイズ以外のgameModeへ切り替えたときに
  // このセクションを隠す処理がどこにも無く、同一タブ内でリロードせずに歌詞クイズ→別モードの
  // ルームへ移動すると、歌詞クイズの設定UIが残ったまま表示され続ける既存の不具合があった
  // （新モード追加時の回帰テストで発覚。歌詞クイズ自体の実装バグではなく、既存モードの
  // 切り替え時に隠す処理が最初から抜けていたことが原因）。ここでも参照を渡し、
  // isLyricsQuizでないときは明示的に隠す（下記renderLobby()参照）。
  lobbySettingsHostLyrics: onlineLyricsBattleLobbySettingsHostElement,
  lobbySettingsParticipantLyrics: onlineLyricsBattleLobbySettingsParticipantElement,
  collabSongSection: onlineBattleCollabSongSectionElement,
  collabChooseSongsButton: onlineBattleCollabChooseSongsButtonElement,
  collabChooseFavoritesButton: onlineBattleCollabChooseFavoritesButtonElement,
  collabChoosePlaylistButton: onlineBattleCollabChoosePlaylistButtonElement,
  collabMyCount: onlineBattleCollabMyCountElement,
  collabTotalCount: onlineBattleCollabTotalCountElement,
  collabDetailsToggle: onlineBattleCollabDetailsToggleElement,
  collabDetailsPanel: onlineBattleCollabDetailsPanelElement,
  collabByPlayerList: onlineBattleCollabByPlayerListElement,
  collabUniqueSongList: onlineBattleCollabUniqueSongListElement,
  lobbyCommonSongNotice: onlineBattleCommonSongNoticeElement,
  lobbySettingsChangedNotice: onlineBattleLobbySettingsChangedNoticeElement,
  lobbyRematchNotice: onlineBattleLobbyRematchNoticeElement,
  lobbyRematchCancelledNotice: onlineBattleLobbyRematchCancelledNoticeElement,
  lobbyMatchInvalidatedNotice: onlineBattleLobbyMatchInvalidatedNoticeElement,
  lobbyReadyButton: onlineBattleLobbyReadyButtonElement,
  lobbyStartButton: onlineBattleLobbyStartButtonElement,
  lobbyStartHint: onlineBattleLobbyStartHintElement,
  lobbyStartError: onlineBattleLobbyStartErrorElement,
  countdownNumber: onlineBattleCountdownNumberElement,
  // 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】
  confirmRuleExplanation: onlineBattleConfirmRuleExplanationElement,
  confirmPlayerList: onlineBattleConfirmPlayerListElement,
  confirmAllDoneNotice: onlineBattleConfirmAllDoneNoticeElement,
  confirmToggleButton: onlineBattleConfirmToggleButtonElement,
  confirmCancelButton: onlineBattleConfirmCancelButtonElement,
  // 【再戦準備フェーズ新設・本人指示】
  rematchReadyLead: onlineBattleRematchReadyLeadElement,
  rematchReadySummary: onlineBattleRematchReadySummaryElement,
  rematchReadyPlayerList: onlineBattleRematchReadyPlayerListElement,
  rematchReadyAllDoneNotice: onlineBattleRematchReadyAllDoneNoticeElement,
  rematchReadyToggleButton: onlineBattleRematchReadyToggleButtonElement,
  quizProgressStrip: onlineBattleQuizProgressStripElement,
  quizBackToLobbyButton: onlineBattleQuizBackToLobbyButtonElement,
  quizLeaveMatchButton: onlineBattleQuizLeaveMatchButtonElement,
  waitingLeadText: onlineBattleWaitingLeadTextElement,
  waitingHostDisconnectNotice: onlineBattleWaitingHostDisconnectNoticeElement,
  waitingSubmitError: onlineBattleWaitingSubmitErrorElement,
  waitingRetryButton: onlineBattleWaitingRetryButtonElement,
  waitingPlayerList: onlineBattleWaitingPlayerListElement,
  waitingGameModeText: onlineBattleWaitingGameModeElement,
  waitingFinalizeButton: onlineBattleWaitingFinalizeButtonElement,
  waitingFinalizeConfirmModal: onlineBattleWaitingFinalizeConfirmModalElement,
  waitingFinalizeCancelButton: onlineBattleWaitingFinalizeCancelButtonElement,
  waitingFinalizeConfirmButton: onlineBattleWaitingFinalizeConfirmButtonElement,
  resultConfigSummary: onlineBattleResultConfigSummaryElement,
  resultList: onlineBattleResultListElement,
  resultRuleNote: onlineBattleResultRuleNoteElement,
  resultQuestionBreakdownSection: onlineBattleResultQuestionBreakdownSectionElement,
  resultQuestionBreakdown: onlineBattleResultQuestionBreakdownElement,
  resultHomeLink: onlineBattleResultHomeLinkElement,
  resultHostActions: onlineBattleResultHostActionsElement,
  resultRematchButton: onlineBattleResultRematchButtonElement,
  resultRematchPanel: onlineBattleResultRematchPanelElement,
  resultRematchPanelLead: onlineBattleResultRematchPanelLeadElement,
  resultRematchSummary: onlineBattleResultRematchSummaryElement,
  resultRematchPlayerList: onlineBattleResultRematchPlayerListElement,
  resultRematchAllDoneNotice: onlineBattleResultRematchAllDoneNoticeElement,
  resultRematchToggleButton: onlineBattleResultRematchToggleButtonElement,
  resultReturnPanel: onlineBattleResultReturnPanelElement,
  resultReturnStatusList: onlineBattleResultReturnStatusListElement,
  resultReturnButton: onlineBattleResultReturnButtonElement,
  resultGuestActions: onlineBattleResultGuestActionsElement,
  resultLeaveButton: onlineBattleResultLeaveButtonElement,
  lobbyHelpButton: onlineBattleLobbyHelpButtonElement,
  lobbyHelpModal: onlineBattleLobbyHelpModalElement,
  lobbyHelpClose: onlineBattleLobbyHelpCloseElement,
  lobbyHelpCurrentSettings: onlineBattleLobbyHelpCurrentSettingsElement,
  lobbyHelpModeList: onlineBattleLobbyHelpModeListElement,
  lobbyProfileModal: onlineLobbyProfileModalElement,
  lobbyProfileClose: onlineLobbyProfileCloseElement,
  lobbyProfileSwatch: onlineLobbyProfileSwatchElement,
  lobbyProfileName: onlineLobbyProfileNameElement,
  lobbyProfileOshi: onlineLobbyProfileOshiElement,
  lobbyProfileLoading: onlineLobbyProfileLoadingElement,
  lobbyProfileUnavailable: onlineLobbyProfileUnavailableElement,
  lobbyProfileBody: onlineLobbyProfileBodyElement,
  lobbyProfileAchievementCount: onlineLobbyProfileAchievementCountElement,
  lobbyProfileSummary: onlineLobbyProfileSummaryElement,
  lobbyProfileAllToggle: onlineLobbyProfileAllToggleElement,
  lobbyProfileAchievements: onlineLobbyProfileAchievementsElement,
  spectatorLeaveButton: onlineBattleSpectatorLeaveButtonElement,
  spectatorGameModeText: onlineBattleSpectatorGameModeElement,
  spectatorPlayerCount: onlineBattleSpectatorPlayerCountElement,
  spectatorPlayerList: onlineBattleSpectatorPlayerListElement,
  onStartOnlineBattleQuiz: (questions, room) => {
    beginOnlineBattlePlay(questions, room);
  },
});

// オンライン対戦「歌詞クイズ」専用画面（Phase6）。navigateToは既存のオンライン対戦と
// 同じnavigateBattleScreenを再利用し、「対戦をやめる」「ホームへ戻る」の後片付けだけは
// js/onlineBattleScreen.js側の既存処理をコールバックとして渡す（依存が一方向になるよう、
// js/onlineLyricsQuizBattleScreen.js自身はjs/onlineBattleScreen.jsを一切importしない設計）。
initOnlineLyricsQuizBattleScreens({
  navigateTo: navigateBattleScreen,
  lobbySettingsHostLyrics: onlineLyricsBattleLobbySettingsHostElement,
  lobbySettingsParticipantLyrics: onlineLyricsBattleLobbySettingsParticipantElement,
  lyricsRuleOptionsContainer: onlineLyricsBattleRuleOptionsElement,
  lyricsPoolSizeOptionsContainer: onlineLyricsBattlePoolSizeOptionsElement,
  lyricsSettingsFormContainer: onlineLyricsBattleSettingsFormElement,
  lyricsSettingsSummaryContainer: onlineLyricsBattleSettingsSummaryElement,
  lyricsSettingsRuleDescription: onlineLyricsBattleSettingsRuleDescriptionElement,
  lyricsReadinessStatusContainer: onlineLyricsBattleReadinessStatusElement,
  lyricsOwnMissingContainer: onlineLyricsBattleOwnMissingElement,
  battleQuitButton: onlineLyricsBattleQuitButtonElement,
  battleBackToLobbyButton: onlineLyricsBattleBackToLobbyButtonElement,
  battleLeaveMatchButton: onlineLyricsBattleLeaveMatchButtonElement,
  battleProgress: onlineLyricsBattleProgressElement,
  battleRuleBadge: onlineLyricsBattleRuleBadgeElement,
  battleScoreboard: onlineLyricsBattleScoreboardElement,
  battleScoreboardSummaryHint: onlineLyricsBattleScoreboardSummaryHintElement,
  battleMyRank: onlineLyricsBattleMyRankElement,
  battleScoreboardList: onlineLyricsBattleScoreboardListElement,
  battleHudContainer: onlineLyricsBattleHudElement,
  battleHintLevel: onlineLyricsBattleHintLevelElement,
  battleHintLinesContainer: onlineLyricsBattleHintLinesElement,
  battleHintActions: onlineLyricsBattleHintActionsElement,
  battleAnswerSearchRow: onlineLyricsBattleAnswerSearchRowElement,
  battleAnswerSearchInput: onlineLyricsBattleAnswerSearchInputElement,
  battleAnswerCount: onlineLyricsBattleAnswerCountElement,
  battleAnswerJumpBar: onlineLyricsBattleAnswerJumpBarElement,
  battleAnswerChoicesContainer: onlineLyricsBattleAnswerChoicesElement,
  idleNotice: onlineLyricsBattleIdleNoticeElement,
  battleStatusMessage: onlineLyricsBattleStatusMessageElement,
  battleError: onlineLyricsBattleErrorElement,
  battleAnswerReveal: onlineLyricsBattleAnswerRevealElement,
  battleAnswerRevealStatus: onlineLyricsBattleAnswerRevealStatusElement,
  battleAnswerRevealTitle: onlineLyricsBattleAnswerRevealTitleElement,
  battleAnswerRevealMyAnswer: onlineLyricsBattleAnswerRevealMyAnswerElement,
  battleAnswerRevealMeta: onlineLyricsBattleAnswerRevealMetaElement,
  quitConfirmModal: onlineLyricsBattleQuitConfirmModalElement,
  quitCancelButton: onlineLyricsBattleQuitCancelButtonElement,
  quitConfirmButton: onlineLyricsBattleQuitConfirmButtonElement,
  resultHomeLink: onlineLyricsBattleResultHomeLinkElement,
  resultHostActions: onlineLyricsBattleResultHostActionsElement,
  resultGuestActions: onlineLyricsBattleResultGuestActionsElement,
  resultLeaveButton: onlineLyricsBattleResultLeaveButtonElement,
  resultRuleNote: onlineLyricsBattleResultRuleNoteElement,
  resultTableContainer: onlineLyricsBattleResultTableElement,
  resultQuestionBreakdownSection: onlineLyricsBattleResultQuestionBreakdownSectionElement,
  resultQuestionBreakdown: onlineLyricsBattleResultQuestionBreakdownElement,
  resultRematchButton: onlineLyricsBattleResultRematchButtonElement,
  resultRematchPanel: onlineLyricsBattleResultRematchPanelElement,
  resultRematchPanelLead: onlineLyricsBattleResultRematchPanelLeadElement,
  resultRematchPlayerList: onlineLyricsBattleResultRematchPlayerListElement,
  resultRematchAllDoneNotice: onlineLyricsBattleResultRematchAllDoneNoticeElement,
  resultRematchToggleButton: onlineLyricsBattleResultRematchToggleButtonElement,
  resultReturnPanel: onlineLyricsBattleResultReturnPanelElement,
  resultReturnStatusList: onlineLyricsBattleResultReturnStatusListElement,
  resultReturnButton: onlineLyricsBattleResultReturnButtonElement,
  lyricsCollabSongSection: onlineLyricsBattleCollabSongSectionElement,
  lyricsCollabChooseSongsButton: onlineLyricsBattleCollabChooseSongsButtonElement,
  lyricsCollabChooseFavoritesButton: onlineLyricsBattleCollabChooseFavoritesButtonElement,
  lyricsCollabChoosePlaylistButton: onlineLyricsBattleCollabChoosePlaylistButtonElement,
  lyricsCollabMyCount: onlineLyricsBattleCollabMyCountElement,
  lyricsCollabTotalCount: onlineLyricsBattleCollabTotalCountElement,
  lyricsCollabDetailsToggle: onlineLyricsBattleCollabDetailsToggleElement,
  lyricsCollabDetailsPanel: onlineLyricsBattleCollabDetailsPanelElement,
  lyricsCollabByPlayerList: onlineLyricsBattleCollabByPlayerListElement,
  lyricsCollabUniqueSongList: onlineLyricsBattleCollabUniqueSongListElement,
  lyricsSettingsError: onlineLyricsBattleSettingsErrorElement,
  onQuitDuringBattle: () => quitOnlineBattleDuringQuiz(),
  onLeaveResultToHome: () => leaveOnlineBattleRoomView(),
  onLeaveRoomCompletely: () => leaveOnlineBattleRoomCompletely(),
});

// オンライン対戦「一瞬バトル」専用画面（2026-08-30新設、本人指示：19-3章）。
// 進行モデル自体はタイムアタック等と同じ独立進行のため、待機画面・結果画面への遷移は
// 既存のfinishOnlineBattleMatch/reportOnlineBattleProgress（js/onlineBattleScreen.js）を
// そのままコールバックとして渡す（js/onlineLyricsQuizBattleScreen.jsと同じ、依存が一方向に
// なる配線パターン）。
initOnlineInstantBattleScreens({
  navigateTo: navigateBattleScreen,
  quitButton: onlineInstantBattleQuitButtonElement,
  quitConfirmModal: onlineInstantBattleQuitConfirmModalElement,
  quitCancelButton: onlineInstantBattleQuitCancelButtonElement,
  quitConfirmButton: onlineInstantBattleQuitConfirmButtonElement,
  backToLobbyButton: onlineInstantBattleBackToLobbyButtonElement,
  leaveMatchButton: onlineInstantBattleLeaveMatchButtonElement,
  audioTroubleButton: onlineInstantBattleAudioTroubleButtonElement,
  audioTroubleNotice: onlineInstantBattleAudioTroubleNoticeElement,
  progress: onlineInstantBattleProgressElement,
  error: onlineInstantBattleErrorElement,
  countdown: onlineInstantBattleCountdownElement,
  countdownNumber: onlineInstantBattleCountdownNumberElement,
  replayButton: onlineInstantBattleReplayButtonElement,
  rankHint: onlineInstantBattleRankHintElement,
  answerSection: onlineInstantBattleAnswerSectionElement,
  answerSearchRow: onlineInstantBattleAnswerSearchRowElement,
  answerSearchInput: onlineInstantBattleAnswerSearchInputElement,
  answerCount: onlineInstantBattleAnswerCountElement,
  answerJumpBar: onlineInstantBattleAnswerJumpBarElement,
  answerList: onlineInstantBattleAnswerListElement,
  unknownButton: onlineInstantBattleUnknownButtonElement,
  idleNotice: onlineInstantBattleIdleNoticeElement,
  waitingSection: onlineInstantBattleWaitingSectionElement,
  answerStatusList: onlineInstantBattleAnswerStatusListElement,
  revealSection: onlineInstantBattleRevealSectionElement,
  revealOutcomeBadge: onlineInstantBattleRevealOutcomeBadgeElement,
  revealCorrectSong: onlineInstantBattleRevealCorrectSongElement,
  revealAudioFailureNotice: onlineInstantBattleRevealAudioFailureNoticeElement,
  revealPlayerList: onlineInstantBattleRevealPlayerListElement,
  resultHomeLink: onlineInstantBattleResultHomeLinkElement,
  resultHostActions: onlineInstantBattleResultHostActionsElement,
  resultGuestActions: onlineInstantBattleResultGuestActionsElement,
  resultLeaveButton: onlineInstantBattleResultLeaveButtonElement,
  resultAudioFailureNotice: onlineInstantBattleResultAudioFailureNoticeElement,
  resultNormalContainer: onlineInstantBattleResultNormalElement,
  resultList: onlineInstantBattleResultListElement,
  resultRuleNote: onlineInstantBattleResultRuleNoteElement,
  resultQuestionBreakdownSection: onlineInstantBattleResultQuestionBreakdownSectionElement,
  resultQuestionBreakdown: onlineInstantBattleResultQuestionBreakdownElement,
  resultRematchButton: onlineInstantBattleResultRematchButtonElement,
  resultRematchPanel: onlineInstantBattleResultRematchPanelElement,
  resultRematchPanelLead: onlineInstantBattleResultRematchPanelLeadElement,
  resultRematchPlayerList: onlineInstantBattleResultRematchPlayerListElement,
  resultRematchAllDoneNotice: onlineInstantBattleResultRematchAllDoneNoticeElement,
  resultRematchToggleButton: onlineInstantBattleResultRematchToggleButtonElement,
  resultReturnPanel: onlineInstantBattleResultReturnPanelElement,
  resultReturnStatusList: onlineInstantBattleResultReturnStatusListElement,
  resultReturnButton: onlineInstantBattleResultReturnButtonElement,
  onQuitDuringBattle: () => quitOnlineBattleDuringQuiz(),
  onLeaveResultToHome: () => leaveOnlineBattleRoomView(),
  onLeaveRoomCompletely: () => leaveOnlineBattleRoomCompletely(),
});

// オンライン対戦「一瞬協力」専用画面（2026-08-31新設、本人指示：19-3章）。歌詞クイズと同じ
// ホスト主導の同期進行のため、待機画面・結果画面は既存のものを再利用せず、このモード専用の
// 結果画面（チーム成績）を持つ。「対戦をやめる」の後片付けだけは既存の共通処理を再利用する。
initOnlineInstantCoopBattleScreens({
  navigateTo: navigateBattleScreen,
  lobbySettingsHost: onlineInstantCoopLobbySettingsHostElement,
  lobbySettingsParticipant: onlineInstantCoopLobbySettingsParticipantElement,
  settingsSummaryContainer: onlineInstantCoopSettingsSummaryElement,
  settingsError: onlineInstantCoopSettingsErrorElement,
  quitButton: onlineInstantCoopQuitButtonElement,
  quitConfirmModal: onlineInstantCoopQuitConfirmModalElement,
  quitCancelButton: onlineInstantCoopQuitCancelButtonElement,
  quitConfirmButton: onlineInstantCoopQuitConfirmButtonElement,
  backToLobbyButton: onlineInstantCoopBackToLobbyButtonElement,
  leaveMatchButton: onlineInstantCoopLeaveMatchButtonElement,
  audioTroubleButton: onlineInstantCoopAudioTroubleButtonElement,
  audioTroubleNotice: onlineInstantCoopAudioTroubleNoticeElement,
  progress: onlineInstantCoopProgressElement,
  error: onlineInstantCoopErrorElement,
  // 【2026-11-XX追加・実機バグ調査：一瞬協力にカウントダウンが無かった不具合】
  countdown: onlineInstantCoopCountdownElement,
  countdownNumber: onlineInstantCoopCountdownNumberElement,
  replayButton: onlineInstantCoopReplayButtonElement,
  answerSection: onlineInstantCoopAnswerSectionElement,
  answerSearchRow: onlineInstantCoopAnswerSearchRowElement,
  answerSearchInput: onlineInstantCoopAnswerSearchInputElement,
  answerCount: onlineInstantCoopAnswerCountElement,
  answerJumpBar: onlineInstantCoopAnswerJumpBarElement,
  answerList: onlineInstantCoopAnswerListElement,
  unknownButton: onlineInstantCoopUnknownButtonElement,
  idleNotice: onlineInstantCoopIdleNoticeElement,
  waitingNotice: onlineInstantCoopWaitingNoticeElement,
  answerStatusList: onlineInstantCoopAnswerStatusListElement,
  revealSection: onlineInstantCoopRevealSectionElement,
  revealOutcomeBadge: onlineInstantCoopRevealOutcomeBadgeElement,
  revealCorrectSong: onlineInstantCoopRevealCorrectSongElement,
  revealTeamAnswer: onlineInstantCoopRevealTeamAnswerElement,
  revealTieBreakNotice: onlineInstantCoopRevealTieBreakNoticeElement,
  revealDecisionReason: onlineInstantCoopRevealDecisionReasonElement,
  revealVoteList: onlineInstantCoopRevealVoteListElement,
  resultHomeLink: onlineInstantCoopResultHomeLinkElement,
  resultHostActions: onlineInstantCoopResultHostActionsElement,
  resultGuestActions: onlineInstantCoopResultGuestActionsElement,
  resultLeaveButton: onlineInstantCoopResultLeaveButtonElement,
  resultCorrectCount: onlineInstantCoopResultCorrectCountElement,
  resultAudioFailureNotice: onlineInstantCoopResultAudioFailureNoticeElement,
  resultNormalContainer: onlineInstantCoopResultNormalElement,
  resultMemberList: onlineInstantCoopResultMemberListElement,
  resultQuestionBreakdownSection: onlineInstantCoopResultQuestionBreakdownSectionElement,
  resultQuestionBreakdown: onlineInstantCoopResultQuestionBreakdownElement,
  resultRematchButton: onlineInstantCoopResultRematchButtonElement,
  resultRematchPanel: onlineInstantCoopResultRematchPanelElement,
  resultRematchPanelLead: onlineInstantCoopResultRematchPanelLeadElement,
  resultRematchPlayerList: onlineInstantCoopResultRematchPlayerListElement,
  resultRematchAllDoneNotice: onlineInstantCoopResultRematchAllDoneNoticeElement,
  resultRematchToggleButton: onlineInstantCoopResultRematchToggleButtonElement,
  resultReturnPanel: onlineInstantCoopResultReturnPanelElement,
  resultReturnStatusList: onlineInstantCoopResultReturnStatusListElement,
  resultReturnButton: onlineInstantCoopResultReturnButtonElement,
  onQuitDuringBattle: () => quitOnlineBattleDuringQuiz(),
  onLeaveResultToHome: () => leaveOnlineBattleRoomView(),
  onLeaveRoomCompletely: () => leaveOnlineBattleRoomCompletely(),
});

// オンライン対戦：出題する曲を選ぶ画面（2026-08-08新設）。イントロ対戦・ランダム再生対戦・
// 歌詞クイズ対戦の3つが、js/onlineBattleScreen.js・js/onlineLyricsQuizBattleScreen.js経由で
// この1つの画面を共有する（同じ機能を3回別々に実装しない、という本人の指示どおり）。
initOnlineBattleSongPicker({
  navigateTo: navigateBattleScreen,
  backButton: onlineBattleSongPickerBackButtonElement,
  selectedCountValue: onlineBattleSongPickerSelectedCountValueElement,
  liveSummary: onlineBattleSongPickerLiveSummaryElement,
  selectAllButton: onlineBattleSongPickerSelectAllButtonElement,
  deselectAllButton: onlineBattleSongPickerDeselectAllButtonElement,
  searchInput: onlineBattleSongPickerSearchInputElement,
  searchClearButton: onlineBattleSongPickerSearchClearButtonElement,
  selectedOnlyCheckbox: onlineBattleSongPickerSelectedOnlyCheckboxElement,
  groupsContainer: onlineBattleSongPickerGroupsElement,
  noResultsNotice: onlineBattleSongPickerNoResultsNoticeElement,
  minNotice: onlineBattleSongPickerMinNoticeElement,
  confirmButton: onlineBattleSongPickerConfirmButtonElement,
  stickyBar: onlineBattleSongPickerStickyBarElement,
  reviewPanel: onlineBattleSongPickerReviewPanelElement,
  reviewChips: onlineBattleSongPickerReviewChipsElement,
  stickyToggle: onlineBattleSongPickerStickyToggleElement,
  stickyCountValue: onlineBattleSongPickerStickyCountValueElement,
  stickyConfirmButton: onlineBattleSongPickerStickyConfirmButtonElement,
});

// オンライン対戦：「出題する曲」をプレイリストから選ぶモーダル（2026-08-27新設）。
// こちらもイントロ対戦・ランダム再生対戦・歌詞クイズ対戦の3つで共通利用する。
initOnlineBattlePlaylistPicker({
  overlay: onlineBattlePlaylistPickerModalElement,
  closeButton: onlineBattlePlaylistPickerCloseButtonElement,
  listContainer: onlineBattlePlaylistPickerListElement,
  emptyNotice: onlineBattlePlaylistPickerEmptyNoticeElement,
});

// オンライン対戦：「お気に入り／プレイリストから選ぶ」の確認モーダル（2026-08-28新設）。
// こちらも3対戦モード共通利用する。
initOnlineBattleSongListConfirmModal({
  overlay: onlineBattleSongListConfirmModalElement,
  closeButton: onlineBattleSongListConfirmCloseButtonElement,
  title: onlineBattleSongListConfirmTitleElement,
  subtitle: onlineBattleSongListConfirmSubtitleElement,
  list: onlineBattleSongListConfirmListElement,
  emptyNotice: onlineBattleSongListConfirmEmptyNoticeElement,
  addMoreButton: onlineBattleSongListConfirmAddMoreButtonElement,
  confirmButton: onlineBattleSongListConfirmConfirmButtonElement,
});

// 対戦コードの設定から、実際にクイズを組み立てて開始する。既存のbeginTimeAttackQuiz()と
// 全く同じ考え方（問題を組み立てる→実行中の記録をリセット→gameStateに反映→描画→画面遷移）。
// startTimeAttackRun()をそのまま再利用しているのは、対戦モードもタイムアタックと全く同じ
// 「ノーマル/ハード/LOVE連チャンのテンポ良い進行ルール」を使うため（handleBattleChoiceClick参照）。
function beginLocalBattlePlay(config) {
  const questions = buildBattleQuestions(config);
  startTimeAttackRun(config.rule, config.questionCountValue, config.categoryFilterValue);
  startLocalBattleQuiz(questions, config.questionCountValue, config.categoryFilterValue);
  showScreen("quiz");
  renderQuestion();
}

// 次の問題があれば表示し、なければ対戦の結果集計画面へ進む。
// 既存のgoToNextQuestionOrResult()と同じ構造だが、行き先が対戦専用の画面である点だけが違う。
function goToNextBattleQuestionOrResult() {
  const hasMoreQuestions = advanceToNextQuestion();
  if (hasMoreQuestions) {
    renderQuestion();
    return;
  }
  finishBattlePlay();
}

// 対戦の出題が終わった（全問終了、またはLOVE連チャンで1回間違えた）ときに呼ばれる。
// タイムアタックのrenderTimeAttackResult()と違い、自己ベスト・履歴への保存は一切行わない
// （対戦の記録は結果コード・結果集計画面だけで完結する、完全に別の保存領域のため）。
function finishBattlePlay() {
  const stats = getCurrentTimeAttackStats();
  startBattleResultCollection(stats);
  showScreen("battleResultCollect");
}

// ===== オンライン対戦（Firebase）Step3：実際の出題進行 =====
// 出題・回答の進め方自体は、ローカル対戦・タイムアタックと完全に共通（handleTimedChoiceClick）。
// 違うのは、進捗・結果をFirebase（js/onlineBattle.js経由）へ送る点と、行き先が
// オンライン対戦専用の待機画面・結果画面になる点だけ。

let onlineBattleGameMode = null; // 今の試合のgameMode（結果オブジェクトの組み立てに使うためだけ）

// 【2026-08-08新設・Phase4】オンライン対戦「ランダム再生クイズ」用の再生コンテキスト。
// 試合開始（beginOnlineBattlePlay）のタイミングで1回だけ確定し、試合中は書き換えない。
// gameModeのplaybackTypeが"randomPosition"（＝ランダム再生系のモード）でない試合中はnullのまま。
// 再戦・再接続時もこの関数が呼ばれ直すたびに新しい試合の値へ丸ごと差し替わるため、
// 古い試合のseed・matchIdをrenderQuestion()が参照し続ける事故を防ぐ（本人の指摘どおり）。
// 「前の試合の音が混ざらないこと」自体の保証は、これとは別にjs/audio.jsの世代番号・
// stopAudio()の仕組みが担う（詳細はHANDOFF.md参照）。
let onlineRandomPlaybackContext = null; // { seed, matchId } | null

// 【2026-09-12新設・本人指示：共有クイズエンジンの音源再生失敗対策】タイムアタック・
// ランダム再生・アウトロクイズのオンライン対戦で使う、音源再生失敗の検知用カウンタ。
let onlineBattleSlotFailureCount = 0; // 今の問題スロットで何回再生に失敗したか（問題が進むたびに0へ戻す）
// 【2026-11-XX改訂・実機バグ調査：アウトロ対戦の同期崩れ】以前は「元の曲＋差し替え2回」の
// 意味でこの回数だったが、差し替え自体を廃止した（下のhandleOnlineBattleAudioFailure()の
// コメント参照）ため、今は純粋に「同じ曲を最大何回再試行するか」の回数。
const ONLINE_BATTLE_MAX_SLOT_PLAYBACK_ATTEMPTS = 3;
// 【2026-11-XX追加・実機バグ調査：イントロ対戦だけ開始直後に音源トラブルになる不具合】
// 本人の実機ログ（音源診断ログ）を解析した結果、audioElement.onerror（js/audio.jsの
// playSongIntro/playSongFromRandomPosition内）が発火すると、js/audio.js側のattemptPlay()
// 自身が持つ300ms/600ms間隔のリトライ（PLAY_RETRY_WAIT_MS_LIST）を一切経由せず、
// ほぼ即座にこのhandleOnlineBattleAudioFailure()へ失敗が伝わっていたことが分かった。
// さらにここでの再試行（renderQuestion()の再呼び出し）自体にも遅延が無かったため、
// 3回まで許容しているはずのリトライが、実機ログでは合計300ms未満で使い切られていた
// （＝iOS側の一時的な状態が回復する時間を一切与えられていなかった）。
// attemptPlay()側の設計思想（本番音源の再生失敗は、間隔を空けて回復を待ってから
// 再試行する）と、この最上位のリトライだけが歩調を合わせていなかったのが実質的な原因。
// js/audio.jsのPLAY_RETRY_WAIT_MS_LIST=[300,600]と全く同じ間隔（1回目の再試行前は300ms、
// 2回目の再試行前は600ms）にすることで、「再試行のたびに少し長く待つ」という
// attemptPlay()側の設計思想までそのまま踏襲する。
const ONLINE_BATTLE_AUDIO_RETRY_DELAY_MS_LIST = [300, 600];

// js/onlineBattleScreen.jsが、開始確認（status:playing検知）のタイミングで呼ぶ。
// questionsは同じseed・settingsからjs/battleModes/index.js経由で組み立て済みのもの。
function beginOnlineBattlePlay(questions, room) {
  onlineBattleGameMode = room.gameMode;
  onlineRandomPlaybackContext =
    getPlaybackType(room.gameMode) === "randomPosition"
      ? { seed: room.seed, matchId: room.activeMatchId }
      : null;
  // 【2026-09-12追加→2026-11-XX改訂】questionsには出題数ぶんの本番の曲に続けて予備の曲
  // （isReserve:true）が入っている場合があるが（js/onlineBattleScreen.jsの
  // enterOnlineBattlePlay()参照）、この予備曲はもう使わない（音源再生失敗時は曲を差し替えず
  // 試合全体を無効化する設計にしたため。下のhandleOnlineBattleAudioFailure()参照）。
  // gameState.questionsには引き続き本番の曲だけを渡す（既存の進捗表示・終了判定を
  // 一切変えないため）。
  const realQuestions = questions.filter((question) => !question.isReserve);
  onlineBattleSlotFailureCount = 0;
  startTimeAttackRun(room.settings.rule, room.settings.questionCountValue, room.settings.categoryFilterValue);
  startOnlineBattleQuiz(realQuestions, room.settings.questionCountValue, room.settings.categoryFilterValue);
  showScreen("quiz");
  renderQuestion();
}

// 【2026-09-12新設→2026-11-XX全面改訂・実機バグ調査：アウトロ対戦の同期崩れ】タイムアタック・
// ランダム再生・アウトロクイズのオンライン対戦で、音源の再生に失敗したときに呼ばれる。
// questionIndexは、この再生を試みた時点のgameState.currentIndexを呼び出し元がクロージャで
// 渡す。ユーザーが既に回答して次の問題へ進んだ後に遅れて届いた失敗report（audio.jsの
// リトライは非同期のため起こりうる）を無視するためのガード。
//
// 【2026-11-XX改訂の理由：実機2台テストで判明した重大な同期崩れ】以前はここで「予備曲へ
// ローカルだけで差し替えて続行する」処理をしていたが、この差し替えはFirebaseへ一切
// 通知されないため、音源再生に失敗した端末だけが他の端末と異なる曲・選択肢を見る
// （同じ第1問なのに全く別の曲が出題される）という重大な不具合を引き起こしていた。
// このファイル上部のhandleOnlineBattleAudioTroubleButtonClick()（「音が出ない」ボタン、
// 手動申告）は、本人の明確な指示により既に「試合全体を無効試合にし、勝敗を付けず、
// 参加者全員分の記録を一切残さず、全員を安全にロビーへ戻す」設計（js/onlineBattle.jsの
// reportMatchInvalidatedDueToAudioTrouble()参照）に作り直されている。理由は「早さが
// 勝敗・記録に直結するこの3モードでは、誰か1人でも本当に音が出なかった時点で試合全体の
// 公平性が既に失われている」ため。この自動検知パス（handleOnlineBattleAudioFailure）
// だけが、この本人指示より前の「ローカルだけで差し替えて何とか続行する」設計のまま
// 取り残されていたのが今回の実機不具合の根本原因。
// 【新しい設計】同じ曲のままONLINE_BATTLE_MAX_SLOT_PLAYBACK_ATTEMPTS回までは、通信の
// 一時的な乱れ等からの回復を期待してローカルで再試行する（曲を差し替えないため、
// この再試行自体は他の端末との同期に一切影響しない）。それでも再生できない場合は、
// 曲を差し替えて独自に続行するのではなく、手動の「音が出ない」ボタンと全く同じ
// abortOnlineBattleMatchDueToAudioTrouble()を呼び、試合全体を安全に無効化する
// （予備曲プール自体・buildQuestionsForMode()側の生成ロジックは変更していない。
// 単にこの関数が予備曲を消費しなくなっただけ）。
function handleOnlineBattleAudioFailure(questionIndex, message) {
  if (gameState.playMode !== "onlineBattle" || questionIndex !== gameState.currentIndex || gameState.isAnswered) {
    return;
  }

  onlineBattleSlotFailureCount += 1;
  recordAudioDiagnostic("[ONLINE_BATTLE_AUDIO_FAILURE] 音源再生失敗", {
    questionIndex,
    attemptCount: onlineBattleSlotFailureCount,
    willAbortMatch: onlineBattleSlotFailureCount >= ONLINE_BATTLE_MAX_SLOT_PLAYBACK_ATTEMPTS,
    message,
  });
  if (onlineBattleSlotFailureCount >= ONLINE_BATTLE_MAX_SLOT_PLAYBACK_ATTEMPTS) {
    // 手動の「🔇 音が出ない」ボタン（handleOnlineBattleAudioTroubleButtonClick()）と
    // 全く同じ後始末の手順で試合全体を無効化する。message引数は診断用の内部情報
    // （audio.js側のエラー文言）のため、ユーザー向けの案内文はここで統一する。
    clearPendingTimeAttackAdvance();
    stopTimer();
    stopAudio();
    resetGameState();
    abortOnlineBattleMatchDueToAudioTrouble();
    return;
  }
  // 同じ曲のまま再試行する（曲を差し替えないため、他の端末との同期は崩れない）。
  // 【2026-11-XX改訂・実機バグ調査】即座に再試行せず、js/audio.jsのattemptPlay()自身の
  // リトライ間隔（PLAY_RETRY_WAIT_MS_LIST=[300,600]）と歩調を合わせて短い間隔を空ける
  // （1回目の失敗後は300ms、2回目の失敗後は600ms）。この間に正解して次の問題へ進んだ・
  // 画面を離れた等でquestionIndexがずれていた場合は再試行を行わない
  // （scheduleTimeAttackAdvance()は「タイトルへ」等の中断で呼ばれる
  // clearPendingTimeAttackAdvance()により、遷移時に確実に取り消される）。
  const retryDelayMs =
    ONLINE_BATTLE_AUDIO_RETRY_DELAY_MS_LIST[onlineBattleSlotFailureCount - 1] ??
    ONLINE_BATTLE_AUDIO_RETRY_DELAY_MS_LIST[ONLINE_BATTLE_AUDIO_RETRY_DELAY_MS_LIST.length - 1];
  scheduleTimeAttackAdvance(() => {
    if (gameState.playMode !== "onlineBattle" || questionIndex !== gameState.currentIndex || gameState.isAnswered) {
      return;
    }
    renderQuestion();
  }, retryDelayMs);
}

// デバッグ用ログ（固定durationと実際の音源長がズレてクランプが発生した場合のみ）を
// 出すかどうか。通常のプレイでは表示しない。複数端末での同期テスト時だけ、
// ブラウザのコンソールで以下を実行してから再読み込みすると有効になる：
//   localStorage.setItem("equalLoveIntroQuiz.debugRandomPlayback", "1")
function isRandomPlaybackDebugLoggingEnabled() {
  try {
    return localStorage.getItem("equalLoveIntroQuiz.debugRandomPlayback") === "1";
  } catch {
    return false;
  }
}

function handleOnlineBattleChoiceClick(selectedChoice) {
  // 【2026-09-13追加・本人指示：一瞬バトルで実機再生失敗が再発（原因調査）】タイムアタック・
  // ランダム再生・アウトロクイズのオンライン対戦も、次の問題の音源再生はすべて
  // setTimeout経由（handleTimedChoiceClick()のscheduleTimeAttackAdvance）でしか
  // 呼ばれない。選択肢を選ぶタップは対戦中に毎問必ず起きる本物のユーザー操作のため、
  // ここでunlockを試みておく（js/onlineInstantBattleScreen.jsのhandleAnswerSelected()と
  // 同じ理由）。
  attemptSilentUnlock();
  handleTimedChoiceClick(selectedChoice, {
    onAdvance: goToNextOnlineBattleQuestionOrFinish,
    onRunEnd: finishOnlineBattlePlay,
  });
}

// 1問終える（正解して次へ進む、またはハードルールで1回answeredした）たびに呼ばれる。
// 今の問題（currentIndex）が完了した、という進捗をFirebaseへ一方向に報告してから、
// 次の問題があれば進み、無ければ結果送信へ進む。
// 【本人の要望どおりの基準】ノーマルの不正解選び直し（handleTimedChoiceClick内でisAnswered
// をtrueにせず即return する分岐）ではこの関数自体が呼ばれないため、answeredCountは
// 増えない。正解して次へ進んだ時点、またはハードで1回answeredした時点（正解・不正解を
// 問わず、この関数を必ず通る）でだけ増える。
function goToNextOnlineBattleQuestionOrFinish() {
  reportOnlineBattleProgress(gameState.currentIndex + 1);
  const hasMoreQuestions = advanceToNextQuestion();
  if (hasMoreQuestions) {
    // 【2026-09-12追加】音源再生失敗のカウントは「同じ問題スロットで何回失敗したか」を
    // 数えるものなので、次の問題へ進むたびに0へ戻す。
    onlineBattleSlotFailureCount = 0;
    renderQuestion();
    return;
  }
  finishOnlineBattlePlay();
}

// 全問終了、またはLOVE連チャンで脱落が確定したときに呼ばれる。自分の結果
// （js/battleModes/配下のcreateResult()の戻り値）を組み立て、js/onlineBattleScreen.js
// （Firebaseへの送信・待機画面への遷移）に渡す。タイムアタック・ローカル対戦と違い、
// 自己ベスト・プレイ履歴への保存は一切行わない（対戦の記録はFirebase上のresultsだけで完結する）。
function finishOnlineBattlePlay() {
  const stats = getCurrentTimeAttackStats();
  const reachedQuestionNumber = stats.perQuestionResults.length;
  // 【2026-09-12追加・本人指示：結果画面の問題別結果アコーディオンを完成させる】
  // 自分がこの対戦で実際に辿った問題ごとの記録（perQuestionResults、既存のタイムアタック
  // 履歴詳細と同じデータ）を、結果画面・オンラインプレイ履歴向けに軽量な形へ絞り込んで
  // 一緒に提出する。「選んだ曲」は押した順の最後（＝その問題が確定した選択）だけを残す
  // （途中で何度か外した履歴自体はcorrectAnswer比較には不要なため）。
  const perQuestionSnapshot = stats.perQuestionResults.map((entry) => ({
    correctSongTitle: entry.correctAnswer,
    selectedAnswers: entry.selectedAnswers,
    missCount: entry.missCountThisQuestion,
    isCorrect: entry.isCorrect,
  }));
  const result = calculateBattleResult(onlineBattleGameMode, {
    correctCount: stats.correctCount,
    missCount: stats.missCount,
    totalElapsedMs: stats.totalElapsedMs,
    completed: !stats.runFailed,
    reachedQuestionNumber,
    perQuestionSnapshot,
  });
  finishOnlineBattleMatch(result, reachedQuestionNumber);
}

// カテゴリの選択肢に添える対象曲数は、ゲームの状態と関係なく最初に1回だけ計算すればよい。
updateCategoryCountHints();

// ホーム画面「収録曲一覧」タイルの「全◯曲から探す」を、songs.jsの実際の登録曲数から
// 表示する（2026-08-29新設）。以前は"全82曲"のようにHTMLへ固定で書いており、新曲追加の
// たびに手で書き換える必要があった。SONGSは起動時に確定した静的配列（データパックの
// 読み込みでは曲そのものは増えない）のため、起動時に1回セットすれば十分。
if (songlistTileDescElement) {
  songlistTileDescElement.textContent = `全${SONGS.length}曲から探す`;
}

// 追加データパック（新曲の音源・歌詞・コールデータをまとめて読み込む機能、2026-08-26新設）。
// 解析・保存の実処理はjs/dataPackImport.jsに任せ、ここでは結果を見て画面表示を更新するだけ
// （既存の音源・歌詞・コールの各インポートUIと同じ役割分担）。
function resetDataPackImportStatus() {
  dataPackImportStatusElement.textContent = "パックのファイル一式（manifest.jsonを含む）、またはそれをまとめたZIPファイルを選んでください";
}
resetDataPackImportStatus();

// 「追加データパックを読み込む」ボタン（実体は隠したinput[type=file]）でファイルが
// 選ばれたときの処理。パックの中身の解析（マニフェスト・音源・歌詞・コールの仕分けと検証）は
// analyzeDataPack()に任せ、問題なければimportAnalyzedDataPack()で実際に保存する。
// マニフェストが見つからない・壊れているなど、パックとして成立しない場合は
// 一切保存を行わずエラーを表示する（本人指示：不正なパックを読み込んでも既存データが壊れない）。
dataPackImportInputElement.addEventListener("change", async () => {
  let files = [...dataPackImportInputElement.files];
  if (files.length === 0) return;

  dataPackImportResultElement.hidden = true;
  dataPackImportStatusElement.textContent = "パックを確認しています…";

  // ZIP1個にまとめて配布されたパック（2026-08-27新設）にも対応する。選ばれたファイルが
  // ちょうど1個で、それがZIPファイルだった場合だけ展開し、中身のFile[]を以降の解析へ渡す。
  // 従来どおりの複数ファイル選択（manifest.json＋mp3…を直接選ぶ方式）は、この分岐を
  // 一切通らないため、既存の動作に影響しない。
  if (files.length === 1 && isZipFile(files[0])) {
    try {
      files = await extractZipToFiles(files[0]);
    } catch (error) {
      dataPackImportInputElement.value = "";
      resetDataPackImportStatus();
      dataPackImportResultElement.hidden = false;
      dataPackImportResultElement.textContent = `ZIPの展開に失敗しました: ${error.message}`;
      return;
    }
  }

  const analyzed = await analyzeDataPack(files);
  if (!analyzed.ok) {
    dataPackImportInputElement.value = "";
    resetDataPackImportStatus();
    dataPackImportResultElement.hidden = false;
    dataPackImportResultElement.textContent = `読み込めませんでした: ${analyzed.fileError}`;
    return;
  }

  const result = await importAnalyzedDataPack(analyzed);

  // 新しく保護すべきデータ（音源等）が増えた直後のタイミングで、改めて永続ストレージを要求する
  // （音源インポート時と同じ理由。js/main.jsの「音源を読み込む」ハンドラ参照）。
  requestPersistentStorage();

  // packKind（本人指示：全曲パック/追加パック/修正版パックを同じ仕組みで扱う）は表示文言の
  // 出し分けだけに使う。省略時（後方互換）はincremental扱いにし、これまでどおり
  // 「読み込みました」と表示する。
  const isFullPack = analyzed.manifest.packKind === PACK_KIND.FULL;
  const isCorrectionPack = analyzed.manifest.packKind === PACK_KIND.CORRECTION;

  const lines = [];
  lines.push(
    isFullPack
      ? `「${analyzed.manifest.packLabel}」でセットアップしました`
      : isCorrectionPack
        ? `「${analyzed.manifest.packLabel}」を読み込みました（修正版データ）`
        : `「${analyzed.manifest.packLabel}」を読み込みました`
  );

  // 【2026-08-29新設】correctedXxxSongIds（正式な修正版として上書きされたID、savedXxxSongIdsの
  // 部分集合）を「新規追加」と別立てで表示する（本人指示：単なる新曲追加と、既存データの
  // 修正版への更新を、画面上ではっきり区別したい）。
  const correctedSongIds = [
    ...result.correctedAudioSongIds,
    ...result.correctedLyricsSongIds,
    ...result.correctedCallSongIds,
  ];
  const totalCorrected = correctedSongIds.length + result.correctedCallGuideIds.length;

  // 「新規追加」は、修正版として上書きされた分を二重計上しないよう、saved件数から
  // corrected件数を差し引く（correctedはsavedの部分集合のため）。
  const genuinelyNewCounts = {
    audio: result.savedAudioSongIds.length - result.correctedAudioSongIds.length,
    lyrics: result.savedLyricsSongIds.length - result.correctedLyricsSongIds.length,
    calls: result.savedCallSongIds.length - result.correctedCallSongIds.length,
    callGuides: result.savedCallGuideIds.length - result.correctedCallGuideIds.length,
  };
  const totalGenuinelyNew =
    genuinelyNewCounts.audio + genuinelyNewCounts.lyrics + genuinelyNewCounts.calls + genuinelyNewCounts.callGuides;

  if (totalGenuinelyNew > 0) {
    const addedParts = [
      `音源${genuinelyNewCounts.audio}曲`,
      `歌詞${genuinelyNewCounts.lyrics}曲`,
      `コール${genuinelyNewCounts.calls}曲`,
    ];
    if (genuinelyNewCounts.callGuides > 0) {
      addedParts.push(`コールガイド${genuinelyNewCounts.callGuides}件`);
    }
    lines.push(`新規追加：${addedParts.join("・")}`);
  }

  if (totalCorrected > 0) {
    const correctedParts = [];
    if (result.correctedAudioSongIds.length > 0) correctedParts.push(`音源${result.correctedAudioSongIds.length}曲`);
    if (result.correctedLyricsSongIds.length > 0) correctedParts.push(`歌詞${result.correctedLyricsSongIds.length}曲`);
    if (result.correctedCallSongIds.length > 0) correctedParts.push(`コール${result.correctedCallSongIds.length}曲`);
    if (result.correctedCallGuideIds.length > 0) correctedParts.push(`コールガイド${result.correctedCallGuideIds.length}件`);
    lines.push(`修正版に更新：${correctedParts.join("・")}`);
    if (correctedSongIds.length > 0 && correctedSongIds.length <= 5) {
      const uniqueCorrectedTitles = [...new Set(correctedSongIds)].map(findSongTitle);
      lines.push(`「${uniqueCorrectedTitles.join("」「")}」を最新版に更新しました`);
    }
    lines.push("その他の既存データは変更していません");
  }

  if (totalGenuinelyNew === 0 && totalCorrected === 0) {
    lines.push(`新規追加はありませんでした（この端末には既にすべて導入済みです）`);
  }

  const totalSkipped =
    result.skippedAudioSongIds.length +
    result.skippedLyricsSongIds.length +
    result.skippedCallSongIds.length +
    result.skippedCallGuideIds.length;
  if (totalSkipped > 0) {
    const skippedParts = [
      `音源${result.skippedAudioSongIds.length}曲`,
      `歌詞${result.skippedLyricsSongIds.length}曲`,
      `コール${result.skippedCallSongIds.length}曲`,
    ];
    if (result.skippedCallGuideIds.length > 0) {
      skippedParts.push(`コールガイド${result.skippedCallGuideIds.length}件`);
    }
    lines.push(`既に導入済みのためスキップ：${skippedParts.join("・")}`);
  }
  if (analyzed.manifestSongIdsNotCovered.length > 0) {
    lines.push(
      `※このパックに含まれていない曲があります（${analyzed.manifestSongIdsNotCovered.map(findSongTitle).join("、")}）`
    );
  }
  if (result.lyricsFailures.length > 0) {
    lines.push(`歌詞の保存に失敗したファイル：${result.lyricsFailures.length}件`);
  }
  if (result.callFailures.length > 0) {
    lines.push(`コールデータの保存に失敗した曲：${result.callFailures.length}件`);
  }
  if (result.callGuideFailures.length > 0) {
    lines.push(`コールガイドの保存に失敗した項目：${result.callGuideFailures.length}件`);
  }

  dataPackImportResultElement.hidden = false;
  dataPackImportResultElement.textContent = lines.join("\n");

  // 同じファイル一式をもう一度選んでも change イベントが発火するように、選択状態をリセットする
  dataPackImportInputElement.value = "";
  resetDataPackImportStatus();

  // パックには音源・歌詞・コール・コールガイドが混在するため、4種類すべての状況表示・
  // 出題数の案内をまとめて更新する（本人指示・D：新しく増えた曲がすぐにクイズへ反映されるように）。
  await updateAudioImportStatus();
  await updateLyricsImportStatus();
  await updateCallImportStatus();
  await updateCallGuideImportStatus();
  await updateQuestionCountNotice();

  // 新曲追加のお知らせバナーが表示中で、かつ今回のインポートで対象曲の音源が揃った場合は、
  // ボタンを押さなくても自動的に閉じる（本人指示・項目8）。
  await recheckNewSingleAnnouncementAfterImport(newSingleAnnouncementElements);
});

// 音源の読み込み状況（IndexedDBに何曲保存済みか）を表示に反映する。
// SONGSの曲数と突き合わせ、未読み込みの曲があれば件数を案内する。
async function updateAudioImportStatus() {
  const importedSongIds = await getImportedSongIds();
  const importedSet = new Set(importedSongIds);
  const missingCount = SONGS.filter((song) => !importedSet.has(song.id)).length;

  audioImportStatusElement.textContent =
    missingCount === 0
      ? `音源：全${SONGS.length}曲 読み込み済み`
      : `音源：${SONGS.length - missingCount}/${SONGS.length}曲 読み込み済み（${missingCount}曲未読み込み）`;
}

// 「音源を読み込む」ボタン（実体は隠したinput[type=file]）でファイルが選ばれたときの処理。
// 選んだファイルのうちファイル名がsongsのidと一致するものだけをIndexedDBに保存する。
// 一部の曲だけを選んでも、選んだ分だけが追加・上書きされる（差分インポート。js/audioStorage.js参照）。
audioImportInputElement.addEventListener("change", async () => {
  const files = [...audioImportInputElement.files];
  if (files.length === 0) return;

  const { savedSongIds, unmatchedFileNames } = await importAudioFiles(files);

  // 音源を読み込んだタイミングは「保護してほしいデータが増えた瞬間」であり、ブラウザによっては
  // ユーザー操作の直後の方が永続ストレージの許可判定に有利なため、ここでも改めて要求する
  // （起動時にも1回要求済みだが、失敗していた場合の再挑戦を兼ねる。失敗しても無視して進む）。
  requestPersistentStorage();

  audioImportResultElement.hidden = false;
  audioImportResultElement.textContent =
    unmatchedFileNames.length > 0
      ? `${savedSongIds.length}曲を読み込みました（${unmatchedFileNames.length}件はファイル名が曲データと一致しませんでした）`
      : `${savedSongIds.length}曲を読み込みました`;

  // 同じファイルをもう一度選んでも change イベントが発火するように、選択状態をリセットする
  audioImportInputElement.value = "";
  await updateAudioImportStatus();
  // 音源を読み込んだ直後に、出題数の案内（対象曲数が音源読み込み済みの曲数に基づく）も
  // 最新の状態へ更新する（本人指示・2026-08-15：音源を入れたらすぐクイズにも反映されるように）。
  await updateQuestionCountNotice();
});

updateAudioImportStatus();

// 音源・歌詞データをブラウザの「ベストエフォート」扱いのまま放置すると、端末の空き容量が
// 少なくなったときに自動で削除される場合がある。起動のたびに永続ストレージを要求しておく
// （対応していないブラウザでは何もしない。結果はプレイヤーモーダルの表示で確認できる）。
requestPersistentStorage();

// songIdから曲名を引く（見つからない場合はsongIdそのものを表示に使う）。
// 歌詞インポートの結果表示・警告確認パネルで、歌詞本文の代わりに曲名を示すために使う。
function findSongTitle(songId) {
  const song = SONGS.find((item) => item.id === songId);
  return song ? song.title : songId;
}

// 歌詞データの読み込み状況をスタート画面に反映する。
// 音源の「◯/81曲」という分母付きの表示とは違い、あえて分母を出さない。
// 歌詞データは当面すべての曲が揃う予定はないため、分母を出すと長期間「未完成」に
// 見えてしまうのを避けるための表現上の判断（本人と合意済み）。
async function updateLyricsImportStatus() {
  const importedSongIds = await getImportedLyricsSongIds();
  lyricsImportStatusElement.textContent =
    importedSongIds.length === 0
      ? "歌詞データ：未読み込み"
      : `歌詞データ：${importedSongIds.length}曲分 読み込み済み`;
}

// 警告があるファイルの一覧を確認パネルへ組み立てる。
// 歌詞本文（text）は一切表示せず、ファイル名・曲名・新規/更新・警告内容（行番号や秒数）だけを見せる。
// innerHTMLでの文字列組み立てはファイル名に含まれる文字によって崩れる可能性があるため、
// DOM APIで安全に組み立てる。
function renderLyricsWarningList(warningFiles) {
  lyricsWarningListElement.textContent = "";

  warningFiles.forEach((file) => {
    const details = document.createElement("details");
    details.className = "lyrics-warning-item";

    const summary = document.createElement("summary");
    const songTitle = findSongTitle(file.normalizedData.songId);
    const updateLabel = file.isUpdate ? "更新" : "新規";
    summary.textContent = `${file.fileName}｜${songTitle}（${updateLabel}）｜警告${file.warnings.length}件`;
    details.appendChild(summary);

    const warningListElement = document.createElement("ul");
    file.warnings.forEach((warningText) => {
      const item = document.createElement("li");
      item.textContent = warningText;
      warningListElement.appendChild(item);
    });
    details.appendChild(warningListElement);

    lyricsWarningListElement.appendChild(details);
  });
}

// 1回のファイル選択の中で、警告確認パネルの表示中〜結果表示までの間だけ必要になる一時的な状態。
// ファイルを選び直すたびに作り直すため、前回選択分が混ざることはない。
let pendingLyricsWarningFiles = [];
let pendingLyricsFailedFiles = [];
let pendingLyricsReadyTally = { newCount: 0, updateCount: 0 };

// 「問題なし／警告あり／エラー」の3行にまとめた最終結果を表示する。
function showLyricsImportResult({ readyTally, warningOutcome, failedFiles }) {
  const lines = [];

  lines.push(
    `問題なし：${readyTally.newCount + readyTally.updateCount}件保存（新規${readyTally.newCount}・更新${readyTally.updateCount}）`
  );

  if (warningOutcome.total > 0) {
    lines.push(
      warningOutcome.saved
        ? `警告あり：${warningOutcome.total}件保存（新規${warningOutcome.newCount}・更新${warningOutcome.updateCount}）`
        : `警告あり：${warningOutcome.total}件保存せず`
    );
  }

  if (failedFiles.length > 0) {
    lines.push(`エラー：${failedFiles.length}件保存失敗`);
    failedFiles.forEach((file) => {
      lines.push(`　- ${file.fileName}：${file.errors.join(" / ")}`);
    });
  }

  lyricsImportResultElement.hidden = false;
  lyricsImportResultElement.textContent = lines.join("\n");
}

// 「歌詞を読み込む」ボタン（実体は隠したinput[type=file]）でファイルが選ばれたときの処理。
// データの解析（読み取り・正規化・検証・重複songIdの確認）はjs/lyricsStorage.jsの
// analyzeLyricsFiles()に任せ、ここではその結果を見て「保存するかどうか」「どう表示するか」だけを扱う。
lyricsImportInputElement.addEventListener("change", async () => {
  const files = [...lyricsImportInputElement.files];
  if (files.length === 0) return;

  const { readyFiles, warningFiles, failedFiles } = await analyzeLyricsFiles(files);

  // 警告のないファイルは、確認を待たずにその場で保存する。
  let newCount = 0;
  let updateCount = 0;
  const collectedFailures = [...failedFiles];

  for (const file of readyFiles) {
    const result = await saveLyricsData(file.normalizedData);
    if (result.saved) {
      if (file.isUpdate) updateCount++;
      else newCount++;
    } else {
      collectedFailures.push({ fileName: file.fileName, errors: result.errors });
    }
  }

  await updateLyricsImportStatus();

  pendingLyricsReadyTally = { newCount, updateCount };
  pendingLyricsFailedFiles = collectedFailures;

  if (warningFiles.length > 0) {
    // 警告があるファイルは、1件ずつモーダルを出さず、まとめて確認してから保存するかどうかを決める。
    pendingLyricsWarningFiles = warningFiles;
    renderLyricsWarningList(warningFiles);
    lyricsWarningPanelElement.hidden = false;
    lyricsImportResultElement.hidden = true;
  } else {
    showLyricsImportResult({
      readyTally: pendingLyricsReadyTally,
      warningOutcome: { total: 0, saved: false, newCount: 0, updateCount: 0 },
      failedFiles: pendingLyricsFailedFiles,
    });
  }

  // 同じファイルをもう一度選んでも change イベントが発火するように、選択状態をリセットする
  lyricsImportInputElement.value = "";
});

// 警告確認パネル：「警告があるファイルも保存する」
lyricsWarningSaveButtonElement.addEventListener("click", async () => {
  let warningNewCount = 0;
  let warningUpdateCount = 0;

  for (const file of pendingLyricsWarningFiles) {
    const result = await saveLyricsData(file.normalizedData);
    if (result.saved) {
      if (file.isUpdate) warningUpdateCount++;
      else warningNewCount++;
    } else {
      pendingLyricsFailedFiles.push({ fileName: file.fileName, errors: result.errors });
    }
  }

  await updateLyricsImportStatus();
  lyricsWarningPanelElement.hidden = true;

  showLyricsImportResult({
    readyTally: pendingLyricsReadyTally,
    warningOutcome: {
      total: pendingLyricsWarningFiles.length,
      saved: true,
      newCount: warningNewCount,
      updateCount: warningUpdateCount,
    },
    failedFiles: pendingLyricsFailedFiles,
  });

  pendingLyricsWarningFiles = [];
});

// 警告確認パネル：「警告があるファイルは保存しない」（＝既存データはそのまま変更しない）
lyricsWarningDiscardButtonElement.addEventListener("click", () => {
  const discardedCount = pendingLyricsWarningFiles.length;
  lyricsWarningPanelElement.hidden = true;

  showLyricsImportResult({
    readyTally: pendingLyricsReadyTally,
    warningOutcome: { total: discardedCount, saved: false, newCount: 0, updateCount: 0 },
    failedFiles: pendingLyricsFailedFiles,
  });

  pendingLyricsWarningFiles = [];
});

updateLyricsImportStatus();

// ===== コールデータの読み込み（2026-08-06新設） =====
// 音源・歌詞と違い、この端末で新規作成することはできない（PCのdev/callEditor.htmlだけで
// 作成する運用）。別端末で書き出した専用JSON（js/callStorage.jsのexportAllCallData()が
// 作る形式）を読み込む入口だけをここに用意する。

// 歌詞と同じく、あえて分母（全何曲中）は出さない
// （ライブコール対応曲は今後も限られた曲数のままの想定のため）。
async function updateCallImportStatus() {
  const importedSongIds = await getSongIdsWithCallData();
  callImportStatusElement.textContent =
    importedSongIds.length === 0
      ? "コールデータ：未読み込み"
      : `コールデータ：${importedSongIds.length}曲分 読み込み済み`;
}

// 1回のファイル選択の中で、確認モーダル表示中〜保存実行までの間だけ必要になる一時的な状態。
let pendingCallImportReadySongs = [];

// 確認モーダルの中身（曲数・件数・置き換え対象・読み込めない曲）を組み立てる。
function renderCallImportConfirmModal({ readySongs, failedSongs }) {
  const totalCallCount = readySongs.reduce((sum, song) => sum + song.calls.length, 0);
  const updateSongs = readySongs.filter((song) => song.isUpdate);
  const newSongs = readySongs.filter((song) => !song.isUpdate);

  const messageLines = [`このファイルに含まれる${readySongs.length}曲・${totalCallCount}件のコールデータを読み込みます。`];
  if (updateSongs.length > 0) {
    messageLines.push(`同じ曲の既存コールは置き換えられます（${updateSongs.length}曲）。`);
  }
  if (newSongs.length > 0) {
    messageLines.push(`新しく追加される曲：${newSongs.length}曲。`);
  }
  messageLines.push("ファイルに含まれない曲の既存データは、そのまま残ります。");
  callImportConfirmMessageElement.textContent = messageLines.join(" ");

  callImportConfirmFailedListElement.textContent = "";
  if (failedSongs.length > 0) {
    const title = document.createElement("p");
    title.className = "lyrics-warning-panel-title";
    title.textContent = `読み込めない曲が${failedSongs.length}件あります`;
    callImportConfirmFailedListElement.appendChild(title);

    failedSongs.forEach((failure) => {
      const item = document.createElement("p");
      item.textContent = `${findSongTitle(failure.songId)}（${failure.songId}）：${failure.errors.join(" / ")}`;
      callImportConfirmFailedListElement.appendChild(item);
    });
    callImportConfirmFailedListElement.hidden = false;
  } else {
    callImportConfirmFailedListElement.hidden = true;
  }
}

function closeCallImportConfirmModal() {
  callImportConfirmModalElement.hidden = true;
  pendingCallImportReadySongs = [];
}

// 「コールJSONを読み込む」ボタン（実体は隠したinput[type=file]）でファイルが選ばれたときの処理。
// ファイル自体がコール専用バックアップとして不正な場合（歌詞JSONを間違えて選んだ場合を含む）は、
// モーダルを出さずその場でエラー表示のみ行い、既存のコールデータには一切触れない。
callImportInputElement.addEventListener("change", async () => {
  const files = [...callImportInputElement.files];
  if (files.length === 0) return;

  const { fileValid, fileError, readySongs, failedSongs } = await analyzeCallDataBackupFile(files[0]);

  // 同じファイルをもう一度選んでも change イベントが発火するように、選択状態をリセットする
  callImportInputElement.value = "";

  if (!fileValid) {
    callImportResultElement.hidden = false;
    callImportResultElement.textContent = fileError;
    return;
  }

  if (readySongs.length === 0) {
    callImportResultElement.hidden = false;
    callImportResultElement.textContent =
      failedSongs.length > 0
        ? `読み込める曲がありませんでした（${failedSongs.length}曲がエラーのため除外されました）`
        : "このファイルには曲データが含まれていませんでした";
    return;
  }

  pendingCallImportReadySongs = readySongs;
  renderCallImportConfirmModal({ readySongs, failedSongs });
  callImportResultElement.hidden = true;
  callImportConfirmModalElement.hidden = false;
});

callImportConfirmCancelButtonElement.addEventListener("click", closeCallImportConfirmModal);
callImportConfirmModalElement.addEventListener("click", (event) => {
  if (event.target === callImportConfirmModalElement) closeCallImportConfirmModal();
});

callImportConfirmSaveButtonElement.addEventListener("click", async () => {
  const readySongs = pendingCallImportReadySongs;
  closeCallImportConfirmModal();

  const { savedSongIds, saveFailures } = await importCallDataSongs(readySongs);
  const totalCallCount = readySongs
    .filter((song) => savedSongIds.includes(song.songId))
    .reduce((sum, song) => sum + song.calls.length, 0);

  const lines = [`${savedSongIds.length}曲・${totalCallCount}件のコールを読み込みました`];
  if (saveFailures.length > 0) {
    lines.push(`保存できなかった曲：${saveFailures.length}件`);
    saveFailures.forEach((failure) => {
      lines.push(`　- ${findSongTitle(failure.songId)}（${failure.songId}）：${failure.reason}`);
    });
  }

  callImportResultElement.hidden = false;
  callImportResultElement.textContent = lines.join("\n");
  await updateCallImportStatus();
});

updateCallImportStatus();

// 【2026-09-06新設、本人指示】この端末（iPhone等のPWAを含む）に保存されているコールデータを
// 別端末（PC等）へ持ち出すための書き出しボタン。今までPCのdev/callEditor.htmlにしか
// 無かった「全コールデータを書き出す」を配布版アプリ側にも用意した。dev/callEditor.jsの
// 同名処理と全く同じ形式（type: "equal-love-call-data"）で書き出すため、書き出したJSONは
// 他端末の「コールJSONを読み込む」・追加データパック（ZIP）のどちらでもそのまま使える。
// 書き出すだけで、この端末のIndexedDBの中身は一切変更しない。
callExportButtonElement?.addEventListener("click", async () => {
  const backup = await exportAllCallData();

  if (backup.songs.length === 0) {
    callExportResultElement.hidden = false;
    callExportResultElement.textContent = "書き出せるコールデータがありません（まだ何も保存されていません）";
    return;
  }

  const totalCallCount = backup.songs.reduce((sum, song) => sum + song.calls.length, 0);
  const dateLabel = backup.exportedAt.slice(0, 10);
  const fileName = `equal-love-calls-${dateLabel}.json`;

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  callExportResultElement.hidden = false;
  callExportResultElement.textContent = `${backup.songs.length}曲・${totalCallCount}件のコールを書き出しました（ファイル名：${fileName}）`;
});

// ===== コールガイド（MIX・口上の練習本文）の読み込み（2026-08-06新設） =====
// js/callStorage.jsのコールデータ読み込みと全く同じ設計だが、対象がguideId単位・
// 保存先が別のIndexedDB（equalLoveIntroQuizCallGuide）である点が異なる。
// 音源・歌詞・タイミング付きコールのいずれにも一切触れない。

async function updateCallGuideImportStatus() {
  const records = await getAllCallGuideData();
  callGuideImportStatusElement.textContent =
    records.length === 0 ? "コールガイドデータ：未読み込み" : `コールガイドデータ：${records.length}項目 読み込み済み`;
}

let pendingCallGuideImportReadyGuides = [];

function renderCallGuideImportConfirmModal({ readyGuides, failedGuides }) {
  const updateGuides = readyGuides.filter((guide) => guide.isUpdate);
  const newGuides = readyGuides.filter((guide) => !guide.isUpdate);

  const messageLines = [`このファイルに含まれる${readyGuides.length}項目のコールガイドを読み込みます。`];
  if (updateGuides.length > 0) {
    messageLines.push(`同じIDの既存ガイドは置き換えられます（${updateGuides.length}項目）。`);
  }
  if (newGuides.length > 0) {
    messageLines.push(`新しく追加される項目：${newGuides.length}項目。`);
  }
  messageLines.push("ファイルに含まれないガイドの既存データは、そのまま残ります。");
  callGuideImportConfirmMessageElement.textContent = messageLines.join(" ");

  callGuideImportConfirmFailedListElement.textContent = "";
  if (failedGuides.length > 0) {
    const title = document.createElement("p");
    title.className = "lyrics-warning-panel-title";
    title.textContent = `読み込めない項目が${failedGuides.length}件あります`;
    callGuideImportConfirmFailedListElement.appendChild(title);

    failedGuides.forEach((failure) => {
      const item = document.createElement("p");
      item.textContent = `${failure.guideId}：${failure.errors.join(" / ")}`;
      callGuideImportConfirmFailedListElement.appendChild(item);
    });
    callGuideImportConfirmFailedListElement.hidden = false;
  } else {
    callGuideImportConfirmFailedListElement.hidden = true;
  }
}

function closeCallGuideImportConfirmModal() {
  callGuideImportConfirmModalElement.hidden = true;
  pendingCallGuideImportReadyGuides = [];
}

callGuideImportInputElement.addEventListener("change", async () => {
  const files = [...callGuideImportInputElement.files];
  if (files.length === 0) return;

  const { fileValid, fileError, readyGuides, failedGuides } = await analyzeCallGuideBackupFile(files[0]);
  callGuideImportInputElement.value = "";

  if (!fileValid) {
    callGuideImportResultElement.hidden = false;
    callGuideImportResultElement.textContent = fileError;
    return;
  }

  if (readyGuides.length === 0) {
    callGuideImportResultElement.hidden = false;
    callGuideImportResultElement.textContent =
      failedGuides.length > 0
        ? `読み込める項目がありませんでした（${failedGuides.length}項目がエラーのため除外されました）`
        : "このファイルには項目が含まれていませんでした";
    return;
  }

  pendingCallGuideImportReadyGuides = readyGuides;
  renderCallGuideImportConfirmModal({ readyGuides, failedGuides });
  callGuideImportResultElement.hidden = true;
  callGuideImportConfirmModalElement.hidden = false;
});

callGuideImportConfirmCancelButtonElement.addEventListener("click", closeCallGuideImportConfirmModal);
callGuideImportConfirmModalElement.addEventListener("click", (event) => {
  if (event.target === callGuideImportConfirmModalElement) closeCallGuideImportConfirmModal();
});

callGuideImportConfirmSaveButtonElement.addEventListener("click", async () => {
  const readyGuides = pendingCallGuideImportReadyGuides;
  closeCallGuideImportConfirmModal();

  const { savedGuideIds, saveFailures } = await importCallGuideDataEntries(readyGuides);

  const lines = [`${savedGuideIds.length}項目のコールガイドを読み込みました`];
  if (saveFailures.length > 0) {
    lines.push(`保存できなかった項目：${saveFailures.length}件`);
    saveFailures.forEach((failure) => {
      lines.push(`　- ${failure.guideId}：${failure.reason}`);
    });
  }

  callGuideImportResultElement.hidden = false;
  callGuideImportResultElement.textContent = lines.join("\n");
  await updateCallGuideImportStatus();
  renderActiveCallGuideTab();
});

updateCallGuideImportStatus();

// 【2026-09-06新設、本人指示】コールデータの書き出しボタンと同じ理由・同じ実装方針。
callGuideExportButtonElement?.addEventListener("click", async () => {
  const backup = await exportAllCallGuideData();

  if (backup.guides.length === 0) {
    callGuideExportResultElement.hidden = false;
    callGuideExportResultElement.textContent = "書き出せるコールガイドがありません（まだ何も保存されていません）";
    return;
  }

  const dateLabel = backup.exportedAt.slice(0, 10);
  const fileName = `equal-love-call-guides-${dateLabel}.json`;

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);

  callGuideExportResultElement.hidden = false;
  callGuideExportResultElement.textContent = `${backup.guides.length}件のコールガイドを書き出しました（ファイル名：${fileName}）`;
});

// PWA対応：Service Workerを登録し、新しいバージョンが使えるようになったら、安全な
// タイミングで自動的に切り替える。
// 【2026-08-24改訂・本人指示】以前は「更新する」ボタンを押した瞬間に切り替えていたが、
// ボタンを撤廃し、ユーザーが何も操作しなくても最新版になるよう変更した。
// 重要なのは「更新しない」のではなく「安全なタイミングまで待たせる」という設計であること：
// クイズ・タイムアタック・ランダム再生・歌詞クイズ・1台対戦・オンライン対戦など、途中状態が
// 失われる可能性がある画面にいる間は何もせず、ホーム画面（"start"）に戻ってきたときだけ
// 切り替える（本人指示：安全な画面はホーム画面のみとする）。
// 【安全性】切り替え自体（Service Workerの有効化・ページの再読み込み）は、localStorage・
// IndexedDB（音源データ）・Firebase上のデータには一切触れない。唯一のリスクは「画面上だけの
// 未保存の途中経過」が失われることなので、そのリスクがある画面では待たせることで対応する。
let pendingUpdateRegistration = null;
let hasAppliedPendingUpdate = false;

// 【2026-08-29追加、本人指示】自動更新が実際に適用された直後だけ、画面上部に
// 「最新版に更新しました」と一度だけ知らせるための一時フラグ用のキー。
// sessionStorageを使うのは、このすぐ後に走るwindow.location.reload()をまたいで
// 値を持ち越したいが、それ以外の場面（新しいタブを開いた、次回アプリを開いた等）には
// 一切持ち越したくないため。つまり「更新が無い通常起動」では絶対にこのフラグは立たない。
const UPDATE_APPLIED_FLAG_KEY = "equalLoveIntroQuiz.updateJustApplied";

// 【2026-11-XX追加・実機バグ調査：再戦フロー等が「直したはずなのに実機でまた同じ症状」を
// 繰り返す根本原因】以前は安全な画面を「ホーム画面（"start"）だけ」に限定していたが、
// オンライン対戦のテストはホーム画面へ一切戻らず何十分も続くことが多く、その間は
// 新しいバージョンが待機したままずっと反映されない（＝修正を配信しても、実機テスト中の
// タブが更新を一度も受け取れないまま、直っていないように見え続ける）ことが実機ログの
// 状況証拠と一致した。安全な画面の判定基準は変えていない（本人指示どおり「途中状態が
// 失われる可能性がある画面では待たせる」）：追加したのはいずれも、その場に取り消し可能な
// 未保存のローカル状態を持たない画面だけ。
//   ・onlineBattleEntry／onlineBattleLobby：対戦開始前の待機・設定画面。ここでの
//     ローカル状態はFirebase側の設定にすでに反映済みで、再読み込みしても失われない。
//   ・onlineBattleResult／onlineInstantBattleResult／onlineInstantCoopBattleResult／
//     onlineLyricsBattleResult：対戦は既に終了し、結果・再戦のready状態もFirebase側の
//     正本のため、再読み込みしても失われない（再戦準備中のインラインパネルも同様）。
// クイズ回答中・カウントダウン中・一瞬系の出題中など、未送信のローカル回答が
// 存在しうる画面は引き続き対象外のまま。
const SAFE_SCREENS_FOR_UPDATE = new Set([
  "start",
  "onlineBattleEntry",
  "onlineBattleLobby",
  "onlineBattleResult",
  "onlineInstantBattleResult",
  "onlineInstantCoopBattleResult",
  "onlineLyricsBattleResult",
]);

// 更新の反映を試みる。安全な画面にいるときだけ実際に反映し、それ以外の画面では何もしない
// （呼び出し側は「今安全かどうか」を気にせず、何度でも安全にこの関数を呼べる）。
function tryApplyPendingUpdate() {
  if (!pendingUpdateRegistration || hasAppliedPendingUpdate) return;
  if (!SAFE_SCREENS_FOR_UPDATE.has(document.body.dataset.screen)) return;
  hasAppliedPendingUpdate = true;
  // 実際にskipWaitingを送る＝本当にバージョンが切り替わる瞬間なので、ここでだけ
  // 「次の読み込みで更新完了バナーを出す」フラグを立てる。
  try {
    sessionStorage.setItem(UPDATE_APPLIED_FLAG_KEY, "1");
  } catch {
    // プライベートブラウジング等でsessionStorageが使えなくても、更新の適用自体は続行する
  }
  pendingUpdateRegistration.waiting?.postMessage("skipWaiting");
}

// ①すでに待機中のバージョンがある場合（アプリを閉じている間に更新の準備が整っていた等）と、
// ②今まさに新しいバージョンが見つかった場合（updatefound）の、2箇所から呼ばれる。
function handleUpdateReady(registration) {
  pendingUpdateRegistration = registration;
  tryApplyPendingUpdate();
}

function initServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("./sw.js")
    .then((registration) => {
      // ①登録が完了した時点で、すでに待機中の新しいバージョンがないかを確認する。
      // 前回のセッション中にインストールだけ終わっていた（スマホでアプリを閉じた等）場合、
      // updatefoundは発生し直さないため、このチェックがないと更新可能な状態のまま
      // 二度と反映されない。
      if (registration.waiting) {
        handleUpdateReady(registration);
      }

      // ②今まさにこのセッション中に新しいバージョンが見つかった場合。
      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          // controllerがある（＝すでに動いているService Workerがいる）状態での
          // installedは「新しいバージョンが準備できた」を意味する。
          // controllerがまだない初回登録時のinstalledはただの初回セットアップなので無視する。
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            handleUpdateReady(registration);
          }
        });
      });
    })
    .catch(() => {
      // Service Workerが使えない環境（非対応ブラウザ等）でも、アプリ自体は問題なく動き続けられるようにする
    });

  // 新しいService Workerが有効化されたら、最新のコードを反映するために1回だけ再読み込みする。
  // sw.js側でclients.claim()を呼んでいるため、tryApplyPendingUpdate()がskipWaitingを
  // 送った直後にこのイベントが発火する（本人指示に基づく2026-08-24の変更で追加）。
  let hasReloadedForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });
}

// 安全な画面（SAFE_SCREENS_FOR_UPDATE）に来るたびに、待機中の更新が無いか確認する。
// 危険な画面から安全な画面へ戻ってきた瞬間に、待機中の更新があればここで初めて反映される。
onScreenChange((screenName) => {
  if (SAFE_SCREENS_FOR_UPDATE.has(screenName)) {
    tryApplyPendingUpdate();
  }
});

initServiceWorker();

// 【2026-08-29追加、本人指示】ページ読み込み時に「直前の読み込みで自動更新を適用した」
// フラグ（UPDATE_APPLIED_FLAG_KEY、tryApplyPendingUpdate()参照）が立っていれば、
// 更新完了バナーを表示する。フラグは読み取った直後に消すので、その後の再読み込みや
// 次回以降の通常起動では二度と表示されない（＝実際にバージョンが切り替わった、その1回だけ）。
function showUpdateAppliedBannerIfNeeded() {
  let updateWasJustApplied = false;
  try {
    updateWasJustApplied = sessionStorage.getItem(UPDATE_APPLIED_FLAG_KEY) === "1";
    sessionStorage.removeItem(UPDATE_APPLIED_FLAG_KEY);
  } catch {
    // プライベートブラウジング等でsessionStorageが使えない環境では、通知自体を諦める
    return;
  }
  if (!updateWasJustApplied) return;

  const bannerElement = document.getElementById("update-applied-banner");
  if (!bannerElement) return;
  bannerElement.hidden = false;
  setTimeout(() => {
    bannerElement.hidden = true;
  }, 10000);
}

showUpdateAppliedBannerIfNeeded();

// キーボード操作対応。マウス・タップ操作は今まで通り使えるようにしたうえで、
// 今表示されている画面に応じてキー入力を割り当てる。
document.addEventListener("keydown", (event) => {
  // 歌詞の全画面表示が開いているときは、Escキーで閉じる。画面全体を覆っているため、
  // 他のモーダルより先に、最優先でここでガードする。
  if (!lyricsFullscreenOverlayElement.hidden) {
    if (event.key === "Escape") {
      closeFullscreenLyrics();
    }
    return;
  }

  // ルール説明モーダルが開いているときは、Escキーで閉じる。
  // それ以外のキー（スタート画面のEnterなど）は、モーダルを読んでいる間に
  // 誤って反応してしまわないよう、ここで処理を止めて下の分岐に進ませない。
  if (!rulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeRulesModal();
    }
    return;
  }

  // 苦手曲モードの判定ルール説明モーダルが開いているときも、同じ考え方でEscキーに対応する。
  if (!weakSongsRulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeWeakSongsRulesModal();
    }
    return;
  }

  // 特別モード一覧「？」の説明モーダル（6件）が開いているときも、同じ考え方でEscキーに対応する。
  const openSpecialModeHelpEntry = Object.values(SPECIAL_MODE_HELP_MODALS).find(({ modal }) => !modal.hidden);
  if (openSpecialModeHelpEntry) {
    if (event.key === "Escape") {
      openSpecialModeHelpEntry.modal.hidden = true;
    }
    return;
  }

  // 歌詞クイズ対戦の3ルール説明モーダルが開いているときも、同じ考え方でEscキーに対応する。
  if (!battleRulesHelpModalElement.hidden) {
    if (event.key === "Escape") {
      closeBattleRulesHelpModal();
    }
    return;
  }

  // コールデータ読み込みの確認モーダルが開いているときも、同じ考え方でEscキーに対応する。
  if (!callImportConfirmModalElement.hidden) {
    if (event.key === "Escape") {
      closeCallImportConfirmModal();
    }
    return;
  }

  // コールガイドデータ読み込みの確認モーダルが開いているときも、同じ考え方でEscキーに対応する。
  if (!callGuideImportConfirmModalElement.hidden) {
    if (event.key === "Escape") {
      closeCallGuideImportConfirmModal();
    }
    return;
  }

  // コールガイドパネルが開いているときも、同じ考え方でEscキーに対応する。
  if (!callGuideModalElement.hidden) {
    if (event.key === "Escape") {
      closeCallGuideModal();
    }
    return;
  }

  // オリジナル問題作成モードの説明モーダルが開いているときも、同じ考え方でEscキーに対応する。
  if (!customQuizRulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeCustomQuizRulesModal();
    }
    return;
  }

  // オリジナル問題作成モード「一覧画面」の説明モーダルも同様。
  if (!customQuizPresetsRulesModalElement.hidden) {
    if (event.key === "Escape") {
      closeCustomQuizPresetsRulesModal();
    }
    return;
  }

  // 称号一覧モーダルが開いているときも、他画面のショートカットを妨げないよう先に止める。
  // 開閉（Escキーを含む）自体はtitleList.js側のリスナーがすでに処理しているので、
  // ここでは何もせずreturnするだけでよい。
  if (!titleListModalElement.hidden) {
    return;
  }

  // プレイ履歴の削除確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はhistoryScreen.js側のリスナーがすでに処理している。
  if (!historyClearConfirmModalElement.hidden) {
    return;
  }

  // オリジナル問題作成モードのプリセット詳細モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はcustomQuizPresetsScreen.js側のリスナーがすでに処理している。
  if (!customQuizPresetDetailModalElement.hidden) {
    return;
  }

  // プリセット削除の確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はcustomQuizScreen.js側のリスナーがすでに処理している。
  if (!customQuizDeleteConfirmModalElement.hidden) {
    return;
  }

  // 一覧カードから削除するときの確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はcustomQuizPresetsScreen.js側のリスナーがすでに処理している。
  if (!customQuizPresetsDeleteConfirmModalElement.hidden) {
    return;
  }

  // プレイヤー管理モーダルが開いているときも、同じ理由で先に止める。
  // 名前入力中にEnterキーを押すと、ここでガードしないと下の「スタート画面：Enterキーでスタート」
  // まで処理が通り抜けてしまい、裏でクイズが始まってしまう不具合があったため追加
  // （2026-08-04、実機での不具合報告により発見）。Escキーでの閉じる処理自体はplayerScreen.js側の
  // リスナーがすでに処理している。
  if (!playerModalElement.hidden) {
    return;
  }

  // プレイヤー削除確認モーダルが開いているときも、同じ理由で先に止める。
  if (!playerDeleteConfirmModalElement.hidden) {
    return;
  }

  // 「プレイリストに追加」モーダル・プレイリスト削除確認モーダルが開いているときも、
  // 同じ理由で先に止める（2026-08-04追加）。
  if (!addToPlaylistModalElement.hidden) {
    return;
  }

  if (!playlistDeleteConfirmModalElement.hidden) {
    return;
  }

  // クイズ中断・確認モーダルが開いているときは、Escキーで閉じる（＝中断をキャンセル）。
  // このモーダルの開閉ロジックはこのファイルで直接管理しているため、rulesModalと同じ書き方にする。
  if (!quizQuitConfirmModalElement.hidden) {
    if (event.key === "Escape") {
      closeQuizQuitConfirmModal();
    }
    return;
  }

  // 歌詞クイズの中断確認モーダルが開いているときも、同じ理由で先に止める。
  // Escキーでの閉じる処理自体はjs/lyricsQuizScreen.js側のリスナーがすでに処理している。
  if (!lyricsQuizQuitConfirmModalElement.hidden) {
    return;
  }

  // スタート画面：Enterキーでスタート
  if (startScreenElement.classList.contains("is-active") && event.key === "Enter") {
    document.getElementById("start-button").click();
    return;
  }

  if (quizScreenElement.classList.contains("is-active")) {
    // クイズ画面：Escキーで、クイズ中断の確認モーダルを開く。
    // ここに到達している時点で（上のガードにより）他のモーダルは開いていないと分かっているため、
    // 「開いていなければ開く」の判定を別途書く必要はない。Escだけで即座にタイトルへ戻ることはなく、
    // 必ずこの確認モーダルを経由する。
    if (event.key === "Escape") {
      openQuizQuitConfirmModal();
      return;
    }

    // クイズ画面：1〜4キーで、対応する選択肢を選ぶ
    const choiceIndex = Number(event.key) - 1;
    if (choiceIndex >= 0 && choiceIndex < choiceButtonElements.length) {
      choiceButtonElements[choiceIndex].click();
      return;
    }

    // クイズ画面：回答後（次へボタンが表示されているとき）にEnterキーで次の問題へ
    if (event.key === "Enter" && !nextButtonElement.hidden) {
      nextButtonElement.click();
    }
  }
});

// ===== 初回セットアップ（プレイヤー名＋推しメン必須登録、2026-08-15新設） =====
// 正真正銘の新規ユーザーだけに表示する。既存ユーザー（equalLoveIntroQuiz.で始まる
// 保存データを何か1つでも持つ端末）には一切影響しない（js/onboardingScreen.js参照）。
initOnboardingScreen(
  {
    nameInput: onboardingNameInputElement,
    memberGrid: onboardingMemberGridElement,
    submitButton: onboardingSubmitButtonElement,
  },
  MEMBERS,
  () => {
    // 登録完了直後：スタート画面へ切り替え、プレイヤー表示（名前・推し・スワッチ）を
    // 最新の状態で描き直す。この時点ではまだ記録・お気に入り等は無いため、
    // renderPlayerSummary()以外の再描画（updateListenTileCounts等）は不要。
    showScreen("start");
    renderPlayerSummary();
  }
);
