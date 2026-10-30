// 画面の行き来の記録（ナビゲーションスタック）と、「戻る」をどう扱うかの判断だけを担当するファイル
// （2026-10-30新設・リニューアル第2段階）。
//
// 【なぜ必要か】このアプリは1つのHTMLの中で画面（section）を切り替えているだけなので、
// 何もしないとブラウザの履歴は1件のままになり、Androidの戻るボタン・iPhoneのスワイプで戻る・
// ブラウザの「戻る」を押すと、アプリの外へ出てしまう。そこで「画面を移るたびにブラウザの履歴にも
// 1件積む」「アプリの［戻る］ボタンで戻ったときは、ブラウザの履歴も1件戻す」という形で、
// アプリの中の行き来とブラウザの履歴をそろえる。
//
// このファイルは DOM・history には一切触らない「判断だけ」の純粋な関数の集まり
// （テストしやすくするため）。実際に history.pushState などを呼ぶのは js/appHistory.js。

// オンライン対戦の進行中など、端末の「戻る」でうっかり抜けると困る画面。
// これらの画面では端末の「戻る」を受け付けず、「画面のボタンを使ってください」と案内するだけにする。
// （画面にある［戻る］・［ルームを出る］などのボタンは今までどおり使える）
export const GUARDED_SCREENS = new Set([
  "onboarding",
  "partyBattlePlay",
  "onlineBattleLobby",
  "onlineBattleConfirm",
  "onlineBattleRematchReady",
  "onlineBattleCountdown",
  "onlineBattleWaiting",
  "onlineBattleSpectator",
  "onlineBattleSongPicker",
  "onlineBattleResult",
  "onlineInstantBattleQuestion",
  "onlineInstantBattleResult",
  "onlineInstantCoopBattleQuestion",
  "onlineInstantCoopBattleResult",
  "onlineLyricsBattleQuestion",
  "onlineLyricsBattleResult",
  "battleSetup",
  "battleCodeShare",
  "battleJoin",
  "battleRuleConfirm",
  "battleResultCollect",
  "battleResultRanking",
]);

// プレイ中の画面（問題画面など）。「戻る」で戻ってくる先としては使わない
// （終わったクイズの問題画面へ戻すと、壊れた状態の画面が見えてしまうため）。
export const NON_RESTORABLE_SCREENS = new Set([
  "onboarding",
  "quiz",
  "lyricsQuizQuestion",
  "instantChallengeQuestion",
  "partyBattlePlay",
  "onlineBattleCountdown",
  "onlineBattleWaiting",
  "onlineInstantBattleQuestion",
  "onlineInstantCoopBattleQuestion",
  "onlineLyricsBattleQuestion",
]);

// ホームの入口から開く「まとめ画面」（ハブ）と、そこから開く画面の対応。
// 子の画面の［戻る］は今まで「ホームへ」だったが、ハブを通って来ていればハブへ戻す（ホームまで戻さない）。
// 例：ゲーム → 歌詞クイズの設定 →［戻る］→ ゲーム、楽曲・歌詞 → 収録曲一覧 →［戻る］→ 楽曲・歌詞
export const HUB_OF_SCREEN = {
  // ゲーム（#game-hub-screen）
  weakSongs: "gameHub",
  customQuizTypeSelect: "gameHub",
  liveCallModeList: "gameHub",
  timeAttackSetup: "gameHub",
  randomPlaybackSetup: "gameHub",
  lyricsQuizSetup: "gameHub",
  partyBattleSetup: "gameHub",
  onlineBattleEntry: "gameHub",
  outroQuizSetup: "gameHub",
  instantChallengeSetup: "gameHub",
  history: "gameHub",
  battleModeSelect: "gameHub",
  // 楽曲・歌詞（#music-hub-screen）
  songlist: "musicHub",
  playlists: "musicHub",
  continuousPlay: "musicHub",
  lyricsSearch: "musicHub",
  discography: "musicHub",
  // ガイド（#guide-hub-screen）
  guide: "guideHub",
  liveGuide: "guideHub",
};

// 【2026-10-31 新設・本人の依頼 C・D】ガイドから開いた画面の［戻る］を、ガイドへ戻すための対応。
// 「ゲームの遊び方・記録」（gameGuide）・「遊び方・機能ガイド」（guide）は、上の3つのまとめ画面と同じように「戻る先」になる。
// HUB_OF_SCREEN と両方に当てはまるときは、記録の中で新しい方（あとから通った方）へ戻す
// （例：ホーム → ゲームの遊び方・記録 → 歌詞クイズの設定 →［戻る］→ ゲームの遊び方・記録）。
const GAME_SCREENS_FROM_GUIDES = [
  "weakSongs",
  "customQuizTypeSelect",
  "timeAttackSetup",
  "randomPlaybackSetup",
  "lyricsQuizSetup",
  "partyBattleSetup",
  "onlineBattleEntry",
  "outroQuizSetup",
  "instantChallengeSetup",
  "history",
];
const FEATURE_SCREENS_FROM_GUIDE = [
  "songlist",
  "playlists",
  "continuousPlay",
  "lyricsSearch",
  "appSearch",
  "discography",
  "settings",
  "liveGuide",
  "members",
  "centers",
  "anniversary",
  "tvAppearances",
  "fanProfiles",
  "timeAttackLeaderboard",
];
export const GUIDE_RETURN_HUBS_OF_SCREEN = Object.freeze({
  ...Object.fromEntries(GAME_SCREENS_FROM_GUIDES.map((screen) => [screen, ["gameGuide", "guide"]])),
  ...Object.fromEntries(FEATURE_SCREENS_FROM_GUIDE.map((screen) => [screen, ["guide"]])),
});

// 新しいスタック（最初の画面だけが入った状態）を作る。
// entries：画面名の並び（ブラウザの履歴1件＝1要素）、index：今いる位置。
export function createNavStack(rootScreen) {
  return { entries: [rootScreen], index: 0 };
}

export function currentScreenOf(stack) {
  return stack.entries[stack.index];
}

// 画面が切り替わったとき（端末の「戻る」以外で）、履歴をどう動かすかを決める。
// 戻り値：
//   { type: "none" }                    同じ画面のまま（何もしない）
//   { type: "replace" }                 今の1件を書き換える（初回セットアップ→ホームなど、戻れなくてよい移動）
//   { type: "back", toIndex, steps }    すでに通ってきた画面へ戻る（アプリの［戻る］・ホームへ・同じ条件で再挑戦など）
//   { type: "push" }                    新しい画面を1件積む
export function planScreenChange(stack, nextScreen) {
  const current = currentScreenOf(stack);
  if (nextScreen === current) return { type: "none" };
  if (current === "onboarding") return { type: "replace" };
  for (let i = stack.index - 1; i >= 0; i--) {
    if (stack.entries[i] === nextScreen) {
      return { type: "back", toIndex: i, steps: stack.index - i };
    }
  }
  return { type: "push" };
}

// planScreenChange の結果をスタックへ反映した、新しいスタックを返す（元のスタックは変えない）。
export function applyScreenChange(stack, plan, nextScreen) {
  if (plan.type === "none") return stack;
  if (plan.type === "replace") {
    const entries = stack.entries.slice();
    entries[stack.index] = nextScreen;
    return { entries, index: stack.index };
  }
  if (plan.type === "back") {
    return { entries: stack.entries.slice(), index: plan.toIndex };
  }
  // push：今より先の記録（「進む」で行ける先）は捨ててから積む
  const entries = stack.entries.slice(0, stack.index + 1);
  entries.push(nextScreen);
  return { entries, index: entries.length - 1 };
}

// 端末・ブラウザの「戻る」が押されたとき、何をするかを決める。
// context：{ screen, modalOpen, hasBackControl }
// 戻り値の type：
//   "closeModal"  … 開いているモーダル（確認画面・設定など）を先に閉じる。画面は変えない
//   "blocked"     … オンライン対戦中などで受け付けない（画面のボタンを使うよう案内する）
//   "clickBack"   … 画面にある［戻る］ボタンを押したのと同じ動きにする（スクロール・絞り込みの復元も同じになる）
//   "fallback"    … 画面に［戻る］ボタンが無いので、記録にある前の画面へ直接戻す
export function planSystemBack(context) {
  if (context.modalOpen) return { type: "closeModal" };
  if (GUARDED_SCREENS.has(context.screen)) return { type: "blocked" };
  if (context.hasBackControl) return { type: "clickBack" };
  // プレイ中の画面で［戻る］が見えていない（オンライン対戦で問題画面を使っているときなど）：抜けさせない
  if (NON_RESTORABLE_SCREENS.has(context.screen)) return { type: "blocked" };
  return { type: "fallback" };
}

// fallback のときの戻り先：記録の poppedIndex から前へさかのぼり、プレイ中の画面ではない最初の画面。
// 見つからなければホーム（"start"）。
export function findFallbackIndex(stack, poppedIndex) {
  for (let i = Math.min(poppedIndex, stack.entries.length - 1); i >= 0; i--) {
    const screen = stack.entries[i];
    if (screen && !NON_RESTORABLE_SCREENS.has(screen)) return i;
  }
  return -1;
}

// アプリの［戻る］で「ホームへ」戻ろうとしたとき、本当の戻り先を返す。
// fromScreen がハブから開く画面で、今までの記録（今いる位置まで）の中にそのハブがあればハブ、それ以外は targetScreen のまま。
export function resolveHubReturn(stack, fromScreen, targetScreen) {
  if (targetScreen !== "start") return targetScreen;
  const hubs = [HUB_OF_SCREEN[fromScreen], ...(GUIDE_RETURN_HUBS_OF_SCREEN[fromScreen] ?? [])].filter(Boolean);
  if (hubs.length === 0) return targetScreen;
  // 今いる位置までの記録で、いちばん新しく通った戻り先（ホームへ戻ると記録は先頭まで戻るので、古い寄り道は残らない）
  const path = stack.entries.slice(0, stack.index + 1);
  let found = targetScreen;
  let foundIndex = -1;
  hubs.forEach((hub) => {
    const index = path.lastIndexOf(hub);
    if (index > foundIndex) {
      foundIndex = index;
      found = hub;
    }
  });
  return found;
}
