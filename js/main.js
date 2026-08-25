// アプリの起点となるファイル。
// 各モジュール（state.js, screens.js など）を import してつなぎ合わせていく。

import { SONGS } from "./data/songs.js";
import { AUDIO_METADATA } from "./data/audioMetadata.js";
import { showScreen, onScreenChange } from "./screens.js";
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
import { playSongIntro, playSongFromRandomPosition, stopAudio } from "./audio.js";
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
import { initWeakSongsScreen, renderWeakSongsScreen, resolveWeakSongIds } from "./weakSongsScreen.js";
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
import {
  initRandomPlaybackScreen,
  initRandomPlaybackResultScreen,
  startRandomPlaybackRun,
  getCurrentRandomPlaybackSeed,
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
} from "./lyricsQuizScreen.js";
import { buildBattleQuestions } from "./localBattle.js";
import { initLocalBattleScreens, getCurrentBattleSession } from "./localBattleScreen.js";
import {
  initOnlineBattleScreens,
  finishOnlineBattleMatch,
  reportOnlineBattleProgress,
  quitOnlineBattleDuringQuiz,
  leaveOnlineBattleRoomView,
} from "./onlineBattleScreen.js";
import { initOnlineLyricsQuizBattleScreens } from "./onlineLyricsQuizBattleScreen.js";
import { initOnlineBattleSongPicker } from "./onlineBattleSongPicker.js";
import { calculateBattleResult, getPlaybackType } from "./battleModes/index.js";
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
  stopCustomQuizPreview,
} from "./customQuizScreen.js";
import { getPresets, saveNewPreset, updatePreset, deletePreset, duplicatePreset } from "./customQuizPresets.js";
import {
  initCustomQuizPresetsScreen,
  renderCustomQuizPresetsScreen,
  showPresetActionBanner,
} from "./customQuizPresetsScreen.js";
import { importAudioFiles, getImportedSongIds, filterSongsWithImportedAudio } from "./audioStorage.js";
import { requestPersistentStorage } from "./storagePersistence.js";
import { analyzeLyricsFiles, saveLyricsData, getImportedLyricsSongIds } from "./lyricsStorage.js";
import { analyzeCallDataBackupFile, importCallDataSongs, getSongIdsWithCallData } from "./callStorage.js";
import {
  analyzeCallGuideBackupFile,
  importCallGuideDataEntries,
  getAllCallGuideData,
} from "./callGuideStorage.js";
import { closeFullscreenLyrics } from "./lyricsFullscreen.js";
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
import { initGuideScreen, openGuideScreen } from "./guideScreen.js";
import { initFanProfilesScreen, renderFanProfilesScreen } from "./fanProfilesScreen.js";
import { syncPublicProfileIfEnabled } from "./publicProfileSync.js";
import { getFavoriteSongIds } from "./favoriteSongs.js";
import { getPlaylists } from "./playlists.js";
import { initPlaylistScreen, renderPlaylistList, renderPlaylistDetail } from "./playlistScreen.js";
import { initPlaylistAddSongsScreen, renderPlaylistAddSongsScreen } from "./playlistAddSongsScreen.js";
import { initContinuousPlayScreen, refreshContinuousPlayScreen } from "./continuousPlayScreen.js";
import { initContinuousPlayQueueScreen, renderQueueScreen } from "./continuousPlayQueueScreen.js";
import { initMiniPlayer } from "./miniPlayer.js";
import { handlePlayerChanged as handleContinuousPlayerChanged } from "./continuousPlay.js";

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
  previewButton: document.getElementById("sfx-settings-preview-button"),
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
const timerDisplayElement = document.getElementById("timer-display");
const totalScoreElement = document.getElementById("total-score-display");
const rankElement = document.getElementById("rank-display");
const rankLetterElement = document.getElementById("rank-letter");
const highScoreElement = document.getElementById("high-score-display");
const newRecordElement = document.getElementById("new-record-badge");
const averageResponseTimeDisplayElement = document.getElementById("average-response-time-display");
const speedProgressContainerElement = document.getElementById("speed-progress-container");
const resultLeaderboardStatusElement = document.getElementById("result-leaderboard-status");
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
const songlistFavoritesLinkElement = document.getElementById("songlist-favorites-link");
const listenTileFavoritesCountElement = document.getElementById("listen-tile-favorites-count");
const listenTilePlaylistCountElement = document.getElementById("listen-tile-playlist-count");
const songlistBackButtonElement = document.getElementById("songlist-back-button");
const addToPlaylistModalElement = document.getElementById("add-to-playlist-modal");
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
const fanProfileDetailAchievementsElement = document.getElementById("fan-profile-detail-achievements");
const fanProfilesMyUidElement = document.getElementById("fan-profiles-my-uid");
const fanProfilesAdminDeleteOverlayElement = document.getElementById("fan-profiles-admin-delete-confirm-modal");
const fanProfilesAdminDeleteTargetNameElement = document.getElementById("fan-profiles-admin-delete-target-name");
const fanProfilesAdminDeleteCancelButtonElement = document.getElementById("fan-profiles-admin-delete-cancel-button");
const fanProfilesAdminDeleteConfirmButtonElement = document.getElementById("fan-profiles-admin-delete-confirm-button");
const weakSongsBackButtonElement = document.getElementById("weak-songs-back-button");
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
const lyricsQuizAnswerListElement = document.getElementById("lyrics-quiz-answer-list");
const lyricsQuizAnswerSectionElement = document.getElementById("lyrics-quiz-answer-section");
const lyricsQuizAnswerRevealElement = document.getElementById("lyrics-quiz-answer-reveal");
const lyricsQuizAnswerRevealStatusElement = document.getElementById("lyrics-quiz-answer-reveal-status");
const lyricsQuizAnswerRevealTitleElement = document.getElementById("lyrics-quiz-answer-reveal-title");
const lyricsQuizAnswerRevealMetaElement = document.getElementById("lyrics-quiz-answer-reveal-meta");
const lyricsQuizAnswerRevealNextButtonElement = document.getElementById("lyrics-quiz-answer-reveal-next-button");
const lyricsQuizBackButtonElement = document.getElementById("lyrics-quiz-back-button");
const lyricsQuizQuitConfirmModalElement = document.getElementById("lyrics-quiz-quit-confirm-modal");
const lyricsQuizQuitCancelButtonElement = document.getElementById("lyrics-quiz-quit-cancel-button");
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
const onlineBattleLobbyGoneNoticeElement = document.getElementById("online-battle-lobby-gone-notice");
const onlineBattleLobbyContentElement = document.getElementById("online-battle-lobby-content");
const onlineBattleLobbyRoomCodeElement = document.getElementById("online-battle-lobby-room-code");
const onlineBattleLobbyPlayerCountElement = document.getElementById("online-battle-lobby-player-count");
const onlineBattleLobbyMaxPlayersElement = document.getElementById("online-battle-lobby-max-players");
const onlineBattleLobbyGameModeElement = document.getElementById("online-battle-lobby-game-mode");
const onlineBattleLobbyPlayerListElement = document.getElementById("online-battle-lobby-player-list");
const onlineBattleLobbySettingsHostElement = document.getElementById("online-battle-lobby-settings-host");
const onlineBattleLobbySettingsParticipantElement = document.getElementById("online-battle-lobby-settings-participant");
const onlineBattleLobbySettingsSummaryElement = document.getElementById("online-battle-lobby-settings-summary");
const onlineBattleLobbySettingsPenaltyFieldsetElement = document.getElementById("online-battle-lobby-settings-penalty-fieldset");
// 出題する曲（2026-08-08新設）。
const onlineBattleLobbySettingsCategoryFieldsetElement = document.getElementById("online-battle-lobby-settings-category-fieldset");
const onlineBattleLobbySettingsManualSongRowElement = document.getElementById("online-battle-settings-manual-song-row");
const onlineBattleLobbySettingsManualSongCountElement = document.getElementById("online-battle-settings-manual-song-count");
const onlineBattleLobbySettingsChooseSongsButtonElement = document.getElementById("online-battle-settings-choose-songs-button");
const onlineBattleLobbySettingsChangedNoticeElement = document.getElementById("online-battle-lobby-settings-changed-notice");
const onlineBattleLobbyRematchNoticeElement = document.getElementById("online-battle-lobby-rematch-notice");
const onlineBattleLobbyReadyButtonElement = document.getElementById("online-battle-lobby-ready-button");
const onlineBattleLobbyStartButtonElement = document.getElementById("online-battle-lobby-start-button");
const onlineBattleLobbyStartHintElement = document.getElementById("online-battle-lobby-start-hint");
const onlineBattleLobbyStartErrorElement = document.getElementById("online-battle-lobby-start-error");
const onlineBattleCountdownNumberElement = document.getElementById("online-battle-countdown-number");
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
const onlineBattleResultHomeLinkElement = document.getElementById("online-battle-result-home-link");
const onlineBattleResultRematchButtonElement = document.getElementById("online-battle-result-rematch-button");
const onlineBattleResultRematchConfirmModalElement = document.getElementById("online-battle-result-rematch-confirm-modal");
const onlineBattleResultRematchCancelButtonElement = document.getElementById("online-battle-result-rematch-cancel-button");
const onlineBattleResultRematchConfirmButtonElement = document.getElementById("online-battle-result-rematch-confirm-button");

// オンライン対戦：出題する曲を選ぶ画面（2026-08-08新設）。イントロ対戦・ランダム再生対戦・
// 歌詞クイズ対戦の3つで共通利用する。
const onlineBattleSongPickerBackButtonElement = document.getElementById("online-battle-song-picker-back-button");
const onlineBattleSongPickerSelectedCountValueElement = document.getElementById("online-battle-song-picker-selected-count-value");
const onlineBattleSongPickerSelectAllButtonElement = document.getElementById("online-battle-song-picker-select-all-button");
const onlineBattleSongPickerDeselectAllButtonElement = document.getElementById("online-battle-song-picker-deselect-all-button");
const onlineBattleSongPickerSearchInputElement = document.getElementById("online-battle-song-picker-search-input");
const onlineBattleSongPickerSearchClearButtonElement = document.getElementById("online-battle-song-picker-search-clear-button");
const onlineBattleSongPickerSelectedOnlyCheckboxElement = document.getElementById("online-battle-song-picker-selected-only-checkbox");
const onlineBattleSongPickerGroupsElement = document.getElementById("online-battle-song-picker-groups");
const onlineBattleSongPickerNoResultsNoticeElement = document.getElementById("online-battle-song-picker-no-results-notice");
const onlineBattleSongPickerMinNoticeElement = document.getElementById("online-battle-song-picker-min-notice");
const onlineBattleSongPickerConfirmButtonElement = document.getElementById("online-battle-song-picker-confirm-button");

// オンライン対戦：歌詞クイズ専用（Phase6新設）。
const onlineLyricsBattleLobbySettingsHostElement = document.getElementById("online-battle-lobby-settings-host-lyrics");
const onlineLyricsBattleLobbySettingsParticipantElement = document.getElementById("online-battle-lobby-settings-participant-lyrics");
const onlineLyricsBattleRuleOptionsElement = document.getElementById("online-lyrics-battle-rule-options");
const onlineLyricsBattlePoolSizeOptionsElement = document.getElementById("online-lyrics-battle-pool-size-options");
const onlineLyricsBattleSettingsFormElement = document.getElementById("online-lyrics-battle-settings-form");
const onlineLyricsBattleSettingsSummaryElement = document.getElementById("online-lyrics-battle-settings-summary");
// 出題する曲（2026-08-08新設）。
const onlineLyricsBattleManualSongRowElement = document.getElementById("online-lyrics-battle-settings-manual-song-row");
const onlineLyricsBattleManualSongCountElement = document.getElementById("online-lyrics-battle-settings-manual-song-count");
const onlineLyricsBattleChooseSongsButtonElement = document.getElementById("online-lyrics-battle-settings-choose-songs-button");
const onlineLyricsBattleSettingsErrorElement = document.getElementById("online-lyrics-battle-settings-error");
const onlineLyricsBattleReadinessStatusElement = document.getElementById("online-lyrics-battle-readiness-status");
const onlineLyricsBattleOwnMissingElement = document.getElementById("online-lyrics-battle-own-missing");
const onlineLyricsBattleQuitButtonElement = document.getElementById("online-lyrics-battle-quit-button");
const onlineLyricsBattleProgressElement = document.getElementById("online-lyrics-battle-progress");
const onlineLyricsBattleHudElement = document.getElementById("online-lyrics-battle-hud");
const onlineLyricsBattleHintLevelElement = document.getElementById("online-lyrics-battle-hint-level");
const onlineLyricsBattleHintLinesElement = document.getElementById("online-lyrics-battle-hint-lines");
const onlineLyricsBattleAnswerChoicesElement = document.getElementById("online-lyrics-battle-answer-choices");
const onlineLyricsBattleStatusMessageElement = document.getElementById("online-lyrics-battle-status-message");
const onlineLyricsBattleErrorElement = document.getElementById("online-lyrics-battle-error");
const onlineLyricsBattleQuitConfirmModalElement = document.getElementById("online-lyrics-battle-quit-confirm-modal");
const onlineLyricsBattleQuitCancelButtonElement = document.getElementById("online-lyrics-battle-quit-cancel-button");
const onlineLyricsBattleQuitConfirmButtonElement = document.getElementById("online-lyrics-battle-quit-confirm-button");
const onlineLyricsBattleResultHomeLinkElement = document.getElementById("online-lyrics-battle-result-home-link");
const onlineLyricsBattleResultRuleNoteElement = document.getElementById("online-lyrics-battle-result-rule-note");
const onlineLyricsBattleResultTableElement = document.getElementById("online-lyrics-battle-result-table");
const onlineLyricsBattleResultRematchButtonElement = document.getElementById("online-lyrics-battle-result-rematch-button");

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
};
const quizBackButtonElement = document.getElementById("quiz-back-button");
const quizBackButtonLabelElement = document.getElementById("quiz-back-button-label");
const quizQuitConfirmModalElement = document.getElementById("quiz-quit-confirm-modal");
const lyricsFullscreenOverlayElement = document.getElementById("lyrics-fullscreen-overlay");
const quizQuitConfirmTitleElement = document.getElementById("quiz-quit-confirm-title");
const quizQuitCancelButtonElement = document.getElementById("quiz-quit-cancel-button");
const quizQuitConfirmButtonElement = document.getElementById("quiz-quit-confirm-button");
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
const callGuideImportStatusElement = document.getElementById("call-guide-import-status");
const callGuideImportInputElement = document.getElementById("call-guide-import-input");
const callGuideImportResultElement = document.getElementById("call-guide-import-result");
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
    renderQuestion();
    showScreen("quiz");
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
      renderCustomQuizPresetsScreen();
      navigateWithScrollMemory("customQuizPresets");
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
    detailAchievementList: fanProfileDetailAchievementsElement,
    myUidValue: fanProfilesMyUidElement,
    adminDeleteOverlay: fanProfilesAdminDeleteOverlayElement,
    adminDeleteTargetName: fanProfilesAdminDeleteTargetNameElement,
    adminDeleteCancelButton: fanProfilesAdminDeleteCancelButtonElement,
    adminDeleteConfirmButton: fanProfilesAdminDeleteConfirmButtonElement,
  },
  MEMBERS
);

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

// オリジナル問題作成モードのプリセット一覧画面：「＋新しいセットを作る」／
// 保存済みプリセットのタップ、どちらも選曲画面（#custom-quiz-screen）を開く。
initCustomQuizPresetsScreen({
  listContainer: document.getElementById("custom-quiz-presets-list"),
  emptyState: document.getElementById("custom-quiz-presets-empty-state"),
  searchInput: document.getElementById("custom-quiz-presets-search-input"),
  savedBanner: document.getElementById("custom-quiz-presets-saved-banner"),
  onCreateNew: () => {
    playClickSound();
    openCustomQuizScreenForNewPreset();
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
    setLastStartedCustomQuizSelection(preset.songIds, preset.distractorMode);
    beginCustomQuiz(preset.songIds, preset.distractorMode);
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
  renderQuestion();
  showScreen("quiz");
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
  const distractorCategoryPool = distractorMode === "selected" ? selectedSongs : filterSongsByCategory(SONGS, "all");
  const distractorPool = await filterSongsWithImportedAudio(distractorCategoryPool);
  const questions = buildQuestionsFromSongIds(questionSongIds, distractorPool);
  startSpecialQuiz(questions, String(questions.length), "customQuiz");
  renderQuestion();
  showScreen("quiz");
}

// 苦手曲モード確認画面の描画に使うDOM要素一式を渡して初期化する。
initWeakSongsScreen({
  availableSection: document.getElementById("weak-songs-available-section"),
  emptyState: document.getElementById("weak-songs-empty-state"),
  countValue: document.getElementById("weak-songs-count-value"),
  allLabel: document.getElementById("weak-songs-all-label"),
  chipRow: document.getElementById("weak-songs-chip-row"),
  countNotice: document.getElementById("weak-songs-count-notice"),
  startButton: document.getElementById("weak-songs-start-button"),
  onStart: (songIds, questionCountValue) => {
    playClickSound();
    beginSpecialQuiz(songIds, questionCountValue, "weakSongs");
  },
});

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
  onStart: (songIds, distractorMode) => {
    playClickSound();
    beginCustomQuiz(songIds, distractorMode);
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
  if (isCorrect && gameState.playMode === "normal" && gameState.currentIndex === gameState.questions.length - 1) {
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
    return;
  }

  if (isRandomPlayback) {
    // ランダム再生クイズもタイムアタックと同じ考え方（結果画面を経由せず設定画面へ戻る）。
    quizBackButtonLabelElement.textContent = "設定画面へ";
    quizQuitConfirmTitleElement.textContent = "ランダム再生クイズを中断して設定画面に戻りますか？";
    quizQuitConfirmButtonElement.textContent = "設定画面に戻る";
    return;
  }

  if (isLocalBattle) {
    // 対戦モードは中断すると、その対戦自体を諦めることになる（対戦コードを作り直す必要がある）。
    quizBackButtonLabelElement.textContent = "対戦をやめる";
    quizQuitConfirmTitleElement.textContent = "対戦を中断してホームに戻りますか？（この対戦の結果コードは作られません）";
    quizQuitConfirmButtonElement.textContent = "対戦をやめる";
    return;
  }

  if (isOnlineBattle) {
    // オンライン対戦も中断すると結果を送信しない（ローカル対戦と同じ考え方）。
    // ルームからは退出するが、他の参加者はそのまま対戦を続けられる。
    quizBackButtonLabelElement.textContent = "対戦をやめる";
    quizQuitConfirmTitleElement.textContent = "対戦を中断してルームを退出しますか？（あなたの結果は送信されません）";
    quizQuitConfirmButtonElement.textContent = "対戦をやめる";
    return;
  }

  quizBackButtonLabelElement.textContent = display?.quizBackLabel ?? "タイトルへ";
  quizQuitConfirmTitleElement.textContent = display?.quizQuitTitle ?? "クイズを中断してタイトルに戻りますか？";
  quizQuitConfirmButtonElement.textContent = display?.quizQuitConfirmLabel ?? "タイトルに戻る";
}

// 今の問題の内容（進捗・4択の曲名）をクイズ画面に反映し、イントロ音源とタイマーを開始する。
function renderQuestion() {
  updateQuizQuitDisplay();
  const question = getCurrentQuestion();
  const progressLabel = `第${gameState.currentIndex + 1}問 / ${gameState.questions.length}問`;
  // 復習中は進捗表示に「🔁 復習」を、特別モード中はモードごとの接頭辞を添えて、
  // 通常プレイと見分けられるようにする。
  let progressPrefix = "";
  if (gameState.playMode === "review") {
    progressPrefix = "🔁 復習 ";
  } else if (gameState.playMode === "special") {
    progressPrefix = SPECIAL_MODES_DISPLAY[gameState.specialModeId]?.progressPrefix ?? "";
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

  // 再生を試みる直前の時刻をいったん暫定の計測起点にしておく。
  // 曲が実際に鳴り始めたら（onPlaybackStart）、より正確な値に上書きされる。
  markPlaybackStarted();
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
      showAudioError("この曲の同期用データが見つかりません（audioMetadata.js未生成の可能性があります）。");
    } else {
      const computeStartTimeSec = (actualDurationSec) => {
        if (!isDurationMismatchWithinTolerance(fixedDurationSec, actualDurationSec)) {
          // 【本人の指示、2026-08-08】固定durationと実際の音源長の差が許容範囲
          // （js/randomPlaybackEngine.jsのMAX_DURATION_MISMATCH_SEC）を超える場合、
          // 端末ごとに開始位置がズレて対戦の公平性が崩れるため、無言でクランプして
          // 続行せず、この曲の再生を中止する。stopAudio()は世代番号を進めて
          // 再生要求そのものを無効化するため、この直後に走るplay()も安全に何もしない。
          stopAudio();
          showAudioError("この曲の音源が他の端末と異なる可能性があります。音源を入れ直してください。");
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
        showAudioError,
        markPlaybackStarted,
        () => {}
      );
    }
  } else {
    playSongIntro(question.song, showAudioError, markPlaybackStarted);
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
      savePlayHistoryEntry({
        playedAt: Date.now(),
        modeId: specialModeId,
        modeLabel: HISTORY_MODE_DISPLAY[specialModeId]?.label ?? specialModeDisplay?.eyebrowLabel ?? specialModeId,
        questionCount: gameState.questions.length,
        isAllSongsMode: gameState.categoryFilterValue === "all",
        correctCount: correctEntries.length,
        wrongCount,
        skippedCount,
        score: gameState.score,
        averageResponseMs,
        completed: true,
        details: { categoryFilterValue: gameState.categoryFilterValue },
      });
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

// 4つの選択肢ボタンに、それぞれクリック時の処理を割り当てる。
// ボタンの並び自体は固定なので、クリック時に「今の問題」の該当インデックスの選択肢を参照する。
choiceButtonElements.forEach((button, index) => {
  button.addEventListener("click", () => {
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
  renderQuestion();

  showScreen("quiz");
}

// スタートボタンを押したときの処理。今選ばれている出題数・カテゴリを読み取って開始する。
document.getElementById("start-button").addEventListener("click", () => {
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

// 「もう一度挑戦する」：スタート画面を経由せず、直前と同じ出題数・カテゴリのまま
// クイズを再抽選して開始する。
// 特別モードの結果では、通常のもう一度挑戦する（beginQuiz）ではなく、そのモードの判定を
// 再計算して再開する。将来モードが増えたときは、ここに分岐を1つ足すだけでよい。
function retrySpecialQuiz() {
  if (gameState.specialModeId === "weakSongs") {
    const songIds = resolveWeakSongIds(gameState.questionCountValue);
    beginSpecialQuiz(songIds, gameState.questionCountValue, "weakSongs");
  } else if (gameState.specialModeId === "customQuiz") {
    const { songIds, distractorMode } = getLastStartedCustomQuizSelection();
    beginCustomQuiz(songIds, distractorMode);
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
  renderQuestion();
  showScreen("quiz");
}

reviewMissedSongsButtonElement.addEventListener("click", () => {
  playClickSound();
  beginReviewQuiz();
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
quizQuitConfirmButtonElement.addEventListener("click", () => {
  playClickSound();
  closeQuizQuitConfirmModal();
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
    // （他のモードと同じく、main.js側でplayClickSound()を既に呼んでいるため、
    // elements.navigateTo経由にはせず直接showScreen()する）。
    quitOnlineBattleDuringQuiz();
    showScreen("onlineBattleEntry");
  } else if (onQuizBack) {
    onQuizBack();
  } else {
    showScreen("start");
    updateModeBestScoreDisplay();
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

// 歌詞クイズオンライン対戦：3つの対戦ルール（クラシック/奪い取り/コンボ）の説明モーダル。
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
  navigateWithScrollMemory("start");
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

// オリジナル問題作成モードのプリセット一覧画面の「戻る」：ホーム画面へ戻る（2026-08-08修正：
// ホームの特別モードカードから直接この画面を開くようになったため、間に古い
// 「特別モード一覧画面」を挟まない）。
customQuizPresetsBackButtonElement.addEventListener("click", () => {
  playSfx(SFX_EVENTS.UI_BACK);
  navigateWithScrollMemory("start");
});

// 出題数・カテゴリのラジオボタンが切り替わるたびに、自己ベスト表示・出題数の案内を更新する。
// ページを開いた直後（初期選択の状態）の分も、ここで一度呼んでおく。
document
  .querySelectorAll('input[name="question-count"], input[name="category-filter"]')
  .forEach((radio) => {
    radio.addEventListener("change", updateModeBestScoreDisplay);
    radio.addEventListener("change", updateQuestionCountNotice);
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
  renderQuestion();
  showScreen("quiz");
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
  onNewRecord: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount }) => {
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
  onCleanClear: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount }) => {
    saveRankingCandidateIfBetter({
      variant,
      questionCountValue,
      categoryFilterValue,
      clearTimeMs: totalElapsedMs,
      missCount,
      rule,
      source: "timeAttack",
      achievedAt: Date.now(),
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
  renderQuestion();
  showScreen("quiz");
}

initRandomPlaybackScreen({
  startButton: randomPlaybackStartButtonElement,
  onStart: (questionCountValue, categoryFilterValue, rule) => {
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
  onNewRecord: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount }) => {
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
  onCleanClear: ({ variant, questionCountValue, categoryFilterValue, rule, totalElapsedMs, missCount }) => {
    saveRankingCandidateIfBetter({
      variant,
      questionCountValue,
      categoryFilterValue,
      clearTimeMs: totalElapsedMs,
      missCount,
      rule,
      source: "normal",
      achievedAt: Date.now(),
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

initLyricsQuizSetupScreen({
  startButton: lyricsQuizStartButtonElement,
  startError: lyricsQuizStartErrorElement,
  bestChip: lyricsQuizBestChipElement,
  onStart: () => {
    playSfx(SFX_EVENTS.GAME_START);
    showScreen("lyricsQuizQuestion");
    startLyricsQuizPlay();
  },
  onFinish: () => {
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
  answerList: lyricsQuizAnswerListElement,
  answerReveal: lyricsQuizAnswerRevealElement,
  answerRevealStatus: lyricsQuizAnswerRevealStatusElement,
  answerRevealTitle: lyricsQuizAnswerRevealTitleElement,
  answerRevealMeta: lyricsQuizAnswerRevealMetaElement,
  answerRevealNextButton: lyricsQuizAnswerRevealNextButtonElement,
  backButton: lyricsQuizBackButtonElement,
  quitConfirmModal: lyricsQuizQuitConfirmModalElement,
  quitCancelButton: lyricsQuizQuitCancelButtonElement,
  quitConfirmButton: lyricsQuizQuitConfirmButtonElement,
  onQuit: () => {
    playSfx(SFX_EVENTS.UI_BACK);
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

// オンライン対戦（Firebase）画面群。navigateToは既存のnavigateBattleScreen（効果音＋showScreen）を
// そのまま再利用する（オフライン対戦と同じ、画面数が多いモードでの確立されたパターン）。
initOnlineBattleScreens({
  navigateTo: navigateBattleScreen,
  entryBackButton: onlineBattleEntryBackButtonElement,
  entryCreateButton: onlineBattleEntryCreateButtonElement,
  entryJoinButton: onlineBattleEntryJoinButtonElement,
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
  lobbyGoneNotice: onlineBattleLobbyGoneNoticeElement,
  lobbyContent: onlineBattleLobbyContentElement,
  lobbyRoomCode: onlineBattleLobbyRoomCodeElement,
  lobbyPlayerCount: onlineBattleLobbyPlayerCountElement,
  lobbyMaxPlayersText: onlineBattleLobbyMaxPlayersElement,
  lobbyGameModeText: onlineBattleLobbyGameModeElement,
  lobbyPlayerList: onlineBattleLobbyPlayerListElement,
  lobbySettingsHost: onlineBattleLobbySettingsHostElement,
  lobbySettingsParticipant: onlineBattleLobbySettingsParticipantElement,
  lobbySettingsSummary: onlineBattleLobbySettingsSummaryElement,
  lobbySettingsPenaltyFieldset: onlineBattleLobbySettingsPenaltyFieldsetElement,
  lobbySettingsCategoryFieldset: onlineBattleLobbySettingsCategoryFieldsetElement,
  lobbySettingsManualSongRow: onlineBattleLobbySettingsManualSongRowElement,
  lobbySettingsManualSongCount: onlineBattleLobbySettingsManualSongCountElement,
  lobbySettingsChooseSongsButton: onlineBattleLobbySettingsChooseSongsButtonElement,
  lobbySettingsChangedNotice: onlineBattleLobbySettingsChangedNoticeElement,
  lobbyRematchNotice: onlineBattleLobbyRematchNoticeElement,
  lobbyReadyButton: onlineBattleLobbyReadyButtonElement,
  lobbyStartButton: onlineBattleLobbyStartButtonElement,
  lobbyStartHint: onlineBattleLobbyStartHintElement,
  lobbyStartError: onlineBattleLobbyStartErrorElement,
  countdownNumber: onlineBattleCountdownNumberElement,
  quizProgressStrip: onlineBattleQuizProgressStripElement,
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
  resultHomeLink: onlineBattleResultHomeLinkElement,
  resultRematchButton: onlineBattleResultRematchButtonElement,
  resultRematchConfirmModal: onlineBattleResultRematchConfirmModalElement,
  resultRematchCancelButton: onlineBattleResultRematchCancelButtonElement,
  resultRematchConfirmButton: onlineBattleResultRematchConfirmButtonElement,
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
  lyricsReadinessStatusContainer: onlineLyricsBattleReadinessStatusElement,
  lyricsOwnMissingContainer: onlineLyricsBattleOwnMissingElement,
  battleQuitButton: onlineLyricsBattleQuitButtonElement,
  battleProgress: onlineLyricsBattleProgressElement,
  battleHudContainer: onlineLyricsBattleHudElement,
  battleHintLevel: onlineLyricsBattleHintLevelElement,
  battleHintLinesContainer: onlineLyricsBattleHintLinesElement,
  battleAnswerChoicesContainer: onlineLyricsBattleAnswerChoicesElement,
  battleStatusMessage: onlineLyricsBattleStatusMessageElement,
  battleError: onlineLyricsBattleErrorElement,
  quitConfirmModal: onlineLyricsBattleQuitConfirmModalElement,
  quitCancelButton: onlineLyricsBattleQuitCancelButtonElement,
  quitConfirmButton: onlineLyricsBattleQuitConfirmButtonElement,
  resultHomeLink: onlineLyricsBattleResultHomeLinkElement,
  resultRuleNote: onlineLyricsBattleResultRuleNoteElement,
  resultTableContainer: onlineLyricsBattleResultTableElement,
  resultRematchButton: onlineLyricsBattleResultRematchButtonElement,
  // 既存のオンライン対戦結果画面が持つ「もう一度対戦する」確認モーダルをそのまま再利用する
  // （ルーム再戦処理自体はgameModeを問わない共通ロジックのため）。
  resultRematchConfirmModal: onlineBattleResultRematchConfirmModalElement,
  lyricsManualSongRow: onlineLyricsBattleManualSongRowElement,
  lyricsManualSongCount: onlineLyricsBattleManualSongCountElement,
  lyricsChooseSongsButton: onlineLyricsBattleChooseSongsButtonElement,
  lyricsSettingsError: onlineLyricsBattleSettingsErrorElement,
  onQuitDuringBattle: () => quitOnlineBattleDuringQuiz(),
  onLeaveResultToHome: () => leaveOnlineBattleRoomView(),
});

// オンライン対戦：出題する曲を選ぶ画面（2026-08-08新設）。イントロ対戦・ランダム再生対戦・
// 歌詞クイズ対戦の3つが、js/onlineBattleScreen.js・js/onlineLyricsQuizBattleScreen.js経由で
// この1つの画面を共有する（同じ機能を3回別々に実装しない、という本人の指示どおり）。
initOnlineBattleSongPicker({
  navigateTo: navigateBattleScreen,
  backButton: onlineBattleSongPickerBackButtonElement,
  selectedCountValue: onlineBattleSongPickerSelectedCountValueElement,
  selectAllButton: onlineBattleSongPickerSelectAllButtonElement,
  deselectAllButton: onlineBattleSongPickerDeselectAllButtonElement,
  searchInput: onlineBattleSongPickerSearchInputElement,
  searchClearButton: onlineBattleSongPickerSearchClearButtonElement,
  selectedOnlyCheckbox: onlineBattleSongPickerSelectedOnlyCheckboxElement,
  groupsContainer: onlineBattleSongPickerGroupsElement,
  noResultsNotice: onlineBattleSongPickerNoResultsNoticeElement,
  minNotice: onlineBattleSongPickerMinNoticeElement,
  confirmButton: onlineBattleSongPickerConfirmButtonElement,
});

// 対戦コードの設定から、実際にクイズを組み立てて開始する。既存のbeginTimeAttackQuiz()と
// 全く同じ考え方（問題を組み立てる→実行中の記録をリセット→gameStateに反映→描画→画面遷移）。
// startTimeAttackRun()をそのまま再利用しているのは、対戦モードもタイムアタックと全く同じ
// 「ノーマル/ハード/LOVE連チャンのテンポ良い進行ルール」を使うため（handleBattleChoiceClick参照）。
function beginLocalBattlePlay(config) {
  const questions = buildBattleQuestions(config);
  startTimeAttackRun(config.rule, config.questionCountValue, config.categoryFilterValue);
  startLocalBattleQuiz(questions, config.questionCountValue, config.categoryFilterValue);
  renderQuestion();
  showScreen("quiz");
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

// js/onlineBattleScreen.jsが、開始確認（status:playing検知）のタイミングで呼ぶ。
// questionsは同じseed・settingsからjs/battleModes/index.js経由で組み立て済みのもの。
function beginOnlineBattlePlay(questions, room) {
  onlineBattleGameMode = room.gameMode;
  onlineRandomPlaybackContext =
    getPlaybackType(room.gameMode) === "randomPosition"
      ? { seed: room.seed, matchId: room.activeMatchId }
      : null;
  startTimeAttackRun(room.settings.rule, room.settings.questionCountValue, room.settings.categoryFilterValue);
  startOnlineBattleQuiz(questions, room.settings.questionCountValue, room.settings.categoryFilterValue);
  renderQuestion();
  showScreen("quiz");
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
  const result = calculateBattleResult(onlineBattleGameMode, {
    correctCount: stats.correctCount,
    missCount: stats.missCount,
    totalElapsedMs: stats.totalElapsedMs,
    completed: !stats.runFailed,
    reachedQuestionNumber,
  });
  finishOnlineBattleMatch(result, reachedQuestionNumber);
}

// カテゴリの選択肢に添える対象曲数は、ゲームの状態と関係なく最初に1回だけ計算すればよい。
updateCategoryCountHints();

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

// 更新の反映を試みる。ホーム画面にいるときだけ実際に反映し、それ以外の画面では何もしない
// （呼び出し側は「今安全かどうか」を気にせず、何度でも安全にこの関数を呼べる）。
function tryApplyPendingUpdate() {
  if (!pendingUpdateRegistration || hasAppliedPendingUpdate) return;
  if (document.body.dataset.screen !== "start") return;
  hasAppliedPendingUpdate = true;
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

// ホーム画面に来るたびに、待機中の更新が無いか確認する。危険な画面からホーム画面へ
// 戻ってきた瞬間に、待機中の更新があればここで初めて反映される。
onScreenChange((screenName) => {
  if (screenName === "start") {
    tryApplyPendingUpdate();
  }
});

initServiceWorker();

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
