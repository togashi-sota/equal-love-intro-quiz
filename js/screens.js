// 画面切り替えを担当するファイル。
// 「スタート画面」「クイズ画面」「結果画面」のうち、どれか1つだけに
// is-active クラスを付け、それ以外からは外すことで表示を切り替える。

import { hasVisibleOverlay, applyScrollLock, releaseScrollLock } from "./scrollLock.js";
import { remeasureViewportVars } from "./viewportMeasurement.js";

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

// 【2026-09-06新設・実機バグ調査：問題画面の縦位置が設定開閉で変わる問題】
// css/style.cssの--game-frame-safe-height（100dvh基準）を使う4つの問題画面
// （通常クイズ・歌詞クイズ対戦・オンライン歌詞クイズ対戦・一瞬チャレンジ）で、
// 画面に入った直後だけ.quiz-middle-zone-innerの縦位置が本来より上すぎる状態になる
// 実機不具合があった。原因調査の結果、js/scrollLock.jsがモーダルの開閉時にbodyへ
// 一瞬position:fixedを適用→解除する副作用として、iOS Safariの動的ツールバー起因の
// dvh測定が正しく再計算されていたことが判明した（クイック効果音設定を開いて閉じると
// 位置が直ることの原因）。ユーザーが偶然モーダルを開くのを待つのではなく、この画面へ
// 入った直後に同じposition:fixed往復を意図的に1回だけ起こし、dvhを最初から正しく
// 確定させる。
const GAME_FRAME_SAFE_HEIGHT_SCREENS = new Set([
  "quiz",
  "lyricsQuizQuestion",
  "onlineLyricsBattleQuestion",
  "instantChallengeQuestion",
]);

function forceViewportHeightRecalcForGameFrame() {
  // 【2026-09-05改訂・本人指示：この対策だけでは実機で直っていなかった不具合の追加対応】
  // 主な対策はjs/viewportMeasurement.jsのremeasureViewportVars()（実測値をCSS変数へ
  // 直接書き込む方式）へ移した。この関数（position:fixedの瞬間的な切り替え）は、
  // 万一実測方式でも直らない環境があった場合の保険として、そのまま残しておく
  // （二重に安全策を持たせる。害はないため削除しない）。
  remeasureViewportVars();

  // 既に本物のモーダル（js/scrollLock.jsのisLocked）でbodyがロックされている場合は
  // 何もしない。ここでbody.styleを上書きすると、そのモーダルの復元処理と競合するため。
  if (hasVisibleOverlay()) return;
  const scrollY = window.scrollY;
  applyScrollLock(scrollY);
  // 固定してすぐ解除する。見た目の位置は変えず（top:-scrollYで同じスクロール位置に
  // 固定するだけ）、ブラウザ側の再計算だけを狙って起こす。
  // 【2026-09-05改訂】以前はrequestAnimationFrame 1回分（約16ms）だけ固定して即解除して
  // いたが、実機ではこの短さでは足りなかった可能性があるため、2フレーム分待ってから
  // 解除するよう変更した（ブラウザに再計算のための時間を少しだけ多く与える）。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!hasVisibleOverlay()) {
        releaseScrollLock(scrollY);
        remeasureViewportVars();
      }
    });
  });
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

  if (GAME_FRAME_SAFE_HEIGHT_SCREENS.has(screenName)) {
    forceViewportHeightRecalcForGameFrame();
  }

  screenChangeListeners.forEach((listener) => listener(screenName));
}

// 【2026-11-XX新設・実機バグ調査：結果画面のスクロール位置】.game-frame自体は
// overflow:hiddenで内部スクロールを持たず、実際のスクロールはページ（window/html/body）が
// 担っている（css/style.css内の既存コメント参照）。オンライン対戦で「同じ条件でもう一度」を
// 連続で使うと、前回の結果画面で見ていたスクロール位置（「問題別結果」付近など）を
// 引き継いだまま次の結果画面が表示され、本来一番上にあるべき「対戦結果」「順位」が
// 見えない状態で始まってしまっていた。結果画面へ遷移する各箇所（js/onlineBattleScreen.js・
// js/onlineLyricsQuizBattleScreen.js・js/onlineInstantBattleScreen.js・
// js/onlineInstantCoopBattleScreen.js）から個別に呼ぶための、単純な共通ユーティリティ。
// 【呼び出しのタイミングについて】DOM更新・レイアウト確定より前に呼ぶとブラウザが
// まだ古い高さのままスクロール位置を計算してしまう場合があるため、requestAnimationFrameで
// 1フレーム後に実行する（本人指示：「scrollToだけではタイミングによって失敗する可能性が
// あるので、画面render・DOM更新・SPA内画面切替とのタイミングも考慮して確実に行ってください」）。
export function scrollToTop() {
  requestAnimationFrame(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  });
}
