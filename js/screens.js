// 画面切り替えを担当するファイル。
// 「スタート画面」「クイズ画面」「結果画面」のうち、どれか1つだけに
// is-active クラスを付け、それ以外からは外すことで表示を切り替える。

// 画面名(screenName)と、対応するHTML要素(id)の対応表。
// 新しい画面を増やしたくなったときは、ここに1行足すだけでよい。
const SCREEN_ELEMENTS = {
  onboarding: document.getElementById("onboarding-screen"),
  start: document.getElementById("start-screen"),
  quiz: document.getElementById("quiz-screen"),
  result: document.getElementById("result-screen"),
  songlist: document.getElementById("songlist-screen"),
  history: document.getElementById("history-screen"),
  historyDetail: document.getElementById("history-detail-screen"),
  specialModes: document.getElementById("special-modes-screen"),
  guide: document.getElementById("guide-screen"),
  fanProfiles: document.getElementById("fan-profiles-screen"),
  adminBackup: document.getElementById("admin-backup-screen"),
  debugAudioLog: document.getElementById("debug-audio-log-screen"),
  weakSongs: document.getElementById("weak-songs-screen"),
  liveCallModeList: document.getElementById("live-call-mode-list-screen"),
  liveCallModePlayType: document.getElementById("live-call-mode-play-type-screen"),
  liveCallModePlayer: document.getElementById("live-call-mode-player-screen"),
  liveCallModeKaraoke: document.getElementById("live-call-mode-karaoke-screen"),
  timeAttackSetup: document.getElementById("time-attack-setup-screen"),
  timeAttackResult: document.getElementById("time-attack-result-screen"),
  timeAttackHistory: document.getElementById("time-attack-history-screen"),
  timeAttackHistoryDetail: document.getElementById("time-attack-history-detail-screen"),
  timeAttackLeaderboard: document.getElementById("time-attack-leaderboard-screen"),
  randomPlaybackSetup: document.getElementById("random-playback-setup-screen"),
  randomPlaybackResult: document.getElementById("random-playback-result-screen"),
  lyricsQuizSetup: document.getElementById("lyrics-quiz-setup-screen"),
  lyricsQuizQuestion: document.getElementById("lyrics-quiz-question-screen"),
  lyricsQuizResult: document.getElementById("lyrics-quiz-result-screen"),
  outroQuizSetup: document.getElementById("outro-quiz-setup-screen"),
  instantChallengeSetup: document.getElementById("instant-challenge-setup-screen"),
  instantChallengeQuestion: document.getElementById("instant-challenge-question-screen"),
  instantChallengeResult: document.getElementById("instant-challenge-result-screen"),
  customQuizTypeSelect: document.getElementById("custom-quiz-type-select-screen"),
  customQuizPresets: document.getElementById("custom-quiz-presets-screen"),
  customQuiz: document.getElementById("custom-quiz-screen"),
  discography: document.getElementById("discography-screen"),
  workDetail: document.getElementById("work-detail-screen"),
  members: document.getElementById("members-screen"),
  memberDetail: document.getElementById("member-detail-screen"),
  playlists: document.getElementById("playlist-screen"),
  playlistDetail: document.getElementById("playlist-detail-screen"),
  playlistAddSongs: document.getElementById("playlist-add-songs-screen"),
  continuousPlay: document.getElementById("continuous-play-screen"),
  continuousPlayQueue: document.getElementById("continuous-play-queue-screen"),
  battleModeSelect: document.getElementById("battle-mode-select-screen"),
  battleCreateOrJoin: document.getElementById("battle-create-or-join-screen"),
  battleSetup: document.getElementById("battle-setup-screen"),
  battleCodeShare: document.getElementById("battle-code-share-screen"),
  battleJoin: document.getElementById("battle-join-screen"),
  battleRuleConfirm: document.getElementById("battle-rule-confirm-screen"),
  battleResultCollect: document.getElementById("battle-result-collect-screen"),
  battleResultRanking: document.getElementById("battle-result-ranking-screen"),
  onlineBattleEntry: document.getElementById("online-battle-entry-screen"),
  onlineBattleCreate: document.getElementById("online-battle-create-screen"),
  onlineBattleJoin: document.getElementById("online-battle-join-screen"),
  onlineBattleLobby: document.getElementById("online-battle-lobby-screen"),
  onlineBattleSongPicker: document.getElementById("online-battle-song-picker-screen"),
  // 【2026-09-13新設・本人指示：対戦開始前ルール確認画面】
  onlineBattleConfirm: document.getElementById("online-battle-confirm-screen"),
  // 【再戦準備フェーズ新設・本人指示】
  onlineBattleRematchReady: document.getElementById("online-battle-rematch-ready-screen"),
  onlineBattleCountdown: document.getElementById("online-battle-countdown-screen"),
  onlineBattleWaiting: document.getElementById("online-battle-waiting-screen"),
  onlineBattleResult: document.getElementById("online-battle-result-screen"),
  onlineBattleSpectator: document.getElementById("online-battle-spectator-screen"),
  onlineInstantBattleQuestion: document.getElementById("online-instant-battle-question-screen"),
  onlineInstantBattleResult: document.getElementById("online-instant-battle-result-screen"),
  onlineInstantCoopBattleQuestion: document.getElementById("online-instant-coop-battle-question-screen"),
  onlineInstantCoopBattleResult: document.getElementById("online-instant-coop-battle-result-screen"),
  onlineLyricsBattleQuestion: document.getElementById("online-lyrics-battle-question-screen"),
  onlineLyricsBattleResult: document.getElementById("online-lyrics-battle-result-screen"),
};

// 画面が切り替わるたびに呼びたい処理（ミニプレイヤーの表示/非表示など）を登録できる、
// 軽量なpub-sub（playbackCoordinator.js・continuousPlay.jsのonPlaybackStateChangeと
// 同じ考え方）。showScreen()自体の動き（is-activeの付け外し・body.dataset.screenの更新）は
// 一切変更せず、末尾に通知を1行追加するだけにとどめている（2026-08-05追加）。
const screenChangeListeners = new Set();

export function onScreenChange(listener) {
  screenChangeListeners.add(listener);
}

// 指定した画面だけを表示し、それ以外の画面は隠す。
export function showScreen(screenName) {
  for (const [name, element] of Object.entries(SCREEN_ELEMENTS)) {
    element.classList.toggle("is-active", name === screenName);
  }

  // 今表示している画面名をbodyのdata属性にも反映する。
  // CSS側（style.css）が「クイズ画面のときだけ背景演出を控えめにする」といった
  // 画面ごとの見た目の調整をできるようにするためのフック。
  document.body.dataset.screen = screenName;

  screenChangeListeners.forEach((listener) => listener(screenName));
}
