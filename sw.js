// PWA化のためのService Worker。
// アプリ本体（HTML/CSS/JS等）をキャッシュし、オフラインでも起動できるようにする。
//
// 音源ファイルはここでは扱わない。音源はネットワーク経由で配信せず、
// 利用者が選んだファイルをIndexedDBに保存する設計になっているため
// （js/audioStorage.js参照）、Service Workerがキャッシュする対象にはならない。
//
// 新しいバージョンを配信したいときは、CACHE_VERSIONの値を必ず上げること。
// 上げないと、ブラウザが「内容が変わっていない」と判断し、更新が反映されない。
const CACHE_VERSION = "v233";
const CACHE_NAME = `equal-love-intro-quiz-${CACHE_VERSION}`;

// キャッシュするアプリ本体のファイル一覧。
// 新しいJSファイルなどを追加したときは、ここにも追記すること（忘れるとそのファイルだけ
// オフライン時に読み込めなくなる）。
const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./guide-data-pack.html",
  "./manifest.json",
  "./favicon.svg",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/images/center-celebration-oba-natsunagori.webp",
  "./assets/images/celebration-yume-no-tsuzuki.webp",
  "./assets/images/guide/datapack-iphone-step1-share.png",
  "./assets/images/guide/datapack-iphone-step2-save-to-files.png",
  "./assets/images/guide/datapack-iphone-step3-recent-files.png",
  "./assets/images/guide/datapack-iphone-step4-open.png",
  "./assets/images/guide/datapack-android-step-zip-preview.png",
  "./assets/images/guide/datapack-android-step-recent-files.png",
  "./css/style.css",
  "./js/main.js",
  "./js/onboardingScreen.js",
  "./js/guideScreen.js",
  "./js/storagePersistence.js",
  "./js/data/guideContent.js",
  "./js/state.js",
  "./js/quiz.js",
  "./js/questionSource.js",
  "./js/score.js",
  "./js/timer.js",
  "./js/audio.js",
  "./js/audioStorage.js",
  "./js/audioPreview.js",
  "./js/availableSongs.js",
  "./js/dataPackImport.js",
  "./js/zipPackImport.js",
  "./js/contentHash.js",
  "./js/backupSync.js",
  "./js/backupAdmin.js",
  "./js/adminBackupScreen.js",
  "./js/lyricsStorage.js",
  "./js/lyricsSync.js",
  "./js/lyricsFullscreen.js",
  "./js/scrollLock.js",
  "./js/sfx.js",
  "./js/soundManager.js",
  "./js/soundSettingsScreen.js",
  "./js/highscore.js",
  "./js/screens.js",
  "./js/decorations.js",
  "./js/songlist.js",
  "./js/youtubeThumbnail.js",
  "./js/specialModeIcons.js",
  "./js/achievementDefinitions.js",
  "./js/achievementEvaluation.js",
  "./js/achievementProgress.js",
  "./js/achievementDisplay.js",
  "./js/achievementList.js",
  "./js/achievementIcons.js",
  "./js/oshiBadge.js",
  "./js/responseTime.js",
  "./js/speedAchievementProgress.js",
  "./js/history.js",
  "./js/weakSongStats.js",
  "./js/shuffleWeakSongStats.js",
  "./js/outroWeakSongStats.js",
  "./js/lyricsQuizWeakSongStats.js",
  "./js/instantChallengeWeakSongStats.js",
  "./js/instantChallengeClearStore.js",
  "./js/instantChallengeScreen.js",
  "./js/normalQuizTimeScore.js",
  "./js/outroQuizTimeScore.js",
  "./js/playHistory.js",
  "./js/historyScreen.js",
  "./js/historyDetailScreen.js",
  "./js/specialModesScreen.js",
  "./js/weakSongsScreen.js",
  "./js/callStorage.js",
  "./js/callSync.js",
  "./js/liveCallModeScreen.js",
  "./js/karaokeSync.js",
  "./js/karaokeSyncScreen.js",
  "./js/callGuidePanel.js",
  "./js/callGuideStorage.js",
  "./js/timeAttackScore.js",
  "./js/timeAttackScreen.js",
  "./js/timeAttackHistory.js",
  "./js/timeAttackHistoryScreen.js",
  "./js/timeAttackHistoryDetailScreen.js",
  "./js/timeAttackLeaderboard.js",
  "./js/timeAttackLeaderboardSync.js",
  "./js/timeAttackLeaderboardScreen.js",
  "./js/rankingCandidateStore.js",
  "./js/onlineBattleSongPicker.js",
  "./js/onlineBattlePlaylistPicker.js",
  "./js/onlineBattleSongListConfirmModal.js",
  "./js/randomPlaybackEngine.js",
  "./js/randomPlaybackScore.js",
  "./js/randomPlaybackScreen.js",
  "./js/lyricsSegmentEngine.js",
  "./js/lyricsQuizEngine.js",
  "./js/lyricsQuizQuestionBuilder.js",
  "./js/lyricsQuizRunState.js",
  "./js/lyricsQuizScore.js",
  "./js/lyricsQuizScreen.js",
  "./js/seededRandom.js",
  "./js/bitCode.js",
  "./js/localBattle.js",
  "./js/localBattleScreen.js",
  "./js/localBattleResult.js",
  "./js/localBattleResultScreen.js",
  "./js/firebaseClient.js",
  "./js/onlineBattle.js",
  "./js/onlineBattleHostTransitionPayloads.js",
  "./js/onlineBattleSongAvailability.js",
  "./js/onlineBattleSongAvailabilityPayloads.js",
  "./js/onlineBattleCollaborativeSelection.js",
  "./js/onlineBattleCollaborativeSelectionPayloads.js",
  "./js/onlineBattleScreen.js",
  "./js/onlineBattleStartSettings.js",
  "./js/onlineInstantBattleScreen.js",
  "./js/onlineInstantCoopBattleScreen.js",
  "./js/instantCoopMatchProgress.js",
  "./js/instantCoopBattleFirebase.js",
  "./js/onlineLyricsQuizBattleScreen.js",
  "./js/lyricsQuizMatchProgress.js",
  "./js/lyricsQuizBattleFirebase.js",
  "./js/lyricsQuizBattleFirebasePayloads.js",
  "./js/lyricsQuizBattleTiming.js",
  "./js/lyricsQuizBattleUi.js",
  "./js/battleModes/index.js",
  "./js/battleModes/timeAttackBattleMode.js",
  "./js/battleModes/randomPlaybackBattleMode.js",
  "./js/battleModes/lyricsQuizBattleMode.js",
  "./js/battleModes/outroBattleMode.js",
  "./js/battleModes/instantBattleMode.js",
  "./js/battleModes/instantCoopBattleMode.js",
  "./js/battleRules/index.js",
  "./js/battleRules/sharedDefaults.js",
  "./js/battleRules/classicRule.js",
  "./js/battleRules/stealRule.js",
  "./js/battleRules/comboRule.js",
  "./js/customQuizScreen.js",
  "./js/customQuizPresets.js",
  "./js/customQuizPresetsScreen.js",
  "./js/memberUtils.js",
  "./js/playerProfile.js",
  "./js/playerScreen.js",
  "./js/oshiMembers.js",
  "./js/fanProfilesScreen.js",
  "./js/fanProfileCard.js",
  "./js/publicProfileSync.js",
  "./js/publicProfilePayloads.js",
  "./js/adminConfig.js",
  "./js/favoriteSongs.js",
  "./js/playlists.js",
  "./js/playlistScreen.js",
  "./js/playlistAddSongsScreen.js",
  "./js/playbackCoordinator.js",
  "./js/continuousPlay.js",
  "./js/continuousPlayScreen.js",
  "./js/continuousPlayQueueScreen.js",
  "./js/miniPlayer.js",
  "./js/discographyScreen.js",
  "./js/membersScreen.js",
  "./js/data/songs.js",
  "./js/data/audioMetadata.js",
  "./js/data/members.js",
  "./js/data/memberProfiles.js",
  "./js/data/memberActivities.js",
  "./js/data/groupActivities.js",
  "./js/data/liveHistory.js",
  "./js/data/discography.js",
  "./js/data/groupInfo.js",
  "./js/data/historyEvents.js",
  "./js/data/sisterGroups.js",
  "./js/data/upcomingRelease.js",
  "./js/data/songPenlightGuide.js",
  "./js/data/songCallCredits.js",
  "./js/data/mixAndKoujouGuide.js",
  "./js/centerCelebration.js",
  "./js/newSingleAnnouncement.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
});

// 古いバージョンのキャッシュを削除する。CACHE_VERSIONを上げてデプロイすると、
// 次にアプリが開かれたときにこの処理が走り、前のバージョンのキャッシュが自動的に消える。
//
// 【2026-08-24追加】clients.claim()を呼び、activate完了と同時に「今すでに開いている
// タブ」もこの新しいService Workerの制御下に置く。これが無いと、新しいSWがactivateしても
// 既に開いているページのcontroller（navigator.serviceWorker.controller）は古いSWのままで、
// controllerchangeイベントが発火せず、js/main.js側の自動更新（安全な画面に来たときだけ
// リロードする仕組み）が動かなくなってしまう。
// 【安全性】clients.claim()自体は「どのSWが今後のfetchを処理するか」を切り替えるだけで、
// 既存のlocalStorage・IndexedDB（音源データ）・Firebase上のデータには一切影響しない。
// 実際にページを再読み込みするタイミングは、引き続きjs/main.js側が「安全な画面にいるか」を
// 見てから判断する（このファイルはその判断に関与しない）。
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// キャッシュ優先で返し、キャッシュになければネットワークから取得する。
// POSTなど、GET以外のリクエスト（今のところ存在しないが将来のため）はそのままネットワークに任せる。
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => cachedResponse || fetch(event.request))
  );
});

// ページ側から「skipWaiting」のメッセージを受け取ったら、待機中の新しいService Workerを
// すぐに有効化する。
// 【2026-08-24改訂】以前は「新しいバージョンがあります」バナーの「更新する」ボタンから
// 送られていたが、本人指示によりボタンを撤廃し、js/main.js側が「クイズ中・対戦中などの
// 危険な画面ではない」と判断できた瞬間に自動的に送るようになった（送信タイミングの判断は
// このファイルの外、js/main.js側の責務。詳細はjs/main.jsのコメント参照）。
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
