// PWA化のためのService Worker。
// アプリ本体（HTML/CSS/JS等）をキャッシュし、オフラインでも起動できるようにする。
//
// 音源ファイルはここでは扱わない。音源はネットワーク経由で配信せず、
// 利用者が選んだファイルをIndexedDBに保存する設計になっているため
// （js/audioStorage.js参照）、Service Workerがキャッシュする対象にはならない。
//
// 新しいバージョンを配信したいときは、CACHE_VERSIONの値を必ず上げること。
// 上げないと、ブラウザが「内容が変わっていない」と判断し、更新が反映されない。
const CACHE_VERSION = "v98";
const CACHE_NAME = `equal-love-intro-quiz-${CACHE_VERSION}`;

// キャッシュするアプリ本体のファイル一覧。
// 新しいJSファイルなどを追加したときは、ここにも追記すること（忘れるとそのファイルだけ
// オフライン時に読み込めなくなる）。
const APP_SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./favicon.svg",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./css/style.css",
  "./js/main.js",
  "./js/state.js",
  "./js/quiz.js",
  "./js/score.js",
  "./js/timer.js",
  "./js/audio.js",
  "./js/audioStorage.js",
  "./js/audioPreview.js",
  "./js/lyricsStorage.js",
  "./js/lyricsSync.js",
  "./js/lyricsFullscreen.js",
  "./js/sfx.js",
  "./js/highscore.js",
  "./js/screens.js",
  "./js/decorations.js",
  "./js/songlist.js",
  "./js/titleDefinitions.js",
  "./js/titleProgress.js",
  "./js/titleDisplay.js",
  "./js/titleList.js",
  "./js/titleIcons.js",
  "./js/history.js",
  "./js/historyScreen.js",
  "./js/historyDetailScreen.js",
  "./js/specialModesScreen.js",
  "./js/weakSongsScreen.js",
  "./js/callStorage.js",
  "./js/callSync.js",
  "./js/liveCallModeScreen.js",
  "./js/timeAttackScore.js",
  "./js/timeAttackScreen.js",
  "./js/timeAttackHistory.js",
  "./js/timeAttackHistoryScreen.js",
  "./js/timeAttackHistoryDetailScreen.js",
  "./js/seededRandom.js",
  "./js/bitCode.js",
  "./js/localBattle.js",
  "./js/localBattleScreen.js",
  "./js/localBattleResult.js",
  "./js/localBattleResultScreen.js",
  "./js/firebaseClient.js",
  "./js/onlineBattle.js",
  "./js/onlineBattleScreen.js",
  "./js/customQuizScreen.js",
  "./js/customQuizPresets.js",
  "./js/customQuizPresetsScreen.js",
  "./js/memberUtils.js",
  "./js/playerProfile.js",
  "./js/playerScreen.js",
  "./js/oshiMembers.js",
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
  "./js/data/members.js",
  "./js/data/memberProfiles.js",
  "./js/data/memberActivities.js",
  "./js/data/groupActivities.js",
  "./js/data/liveHistory.js",
  "./js/data/discography.js",
  "./js/data/groupInfo.js",
  "./js/data/historyEvents.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_FILES))
  );
});

// 古いバージョンのキャッシュを削除する。CACHE_VERSIONを上げてデプロイすると、
// 次にアプリが開かれたときにこの処理が走り、前のバージョンのキャッシュが自動的に消える。
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
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
// すぐに有効化する。「新しいバージョンがあります」バナーの「更新する」ボタンから送られてくる。
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
