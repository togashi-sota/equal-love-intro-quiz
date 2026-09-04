// フレンド（みんなのプロフィール）のオンライン状態・最終ログイン表示に関する、Firebase・
// DOMに一切触れない純粋なロジックだけを集めたファイル（2026-11-XX新設、本人指示）。
// js/publicProfilePayloads.jsと同じ設計方針：Firebase初期化を発生させずに恒久テストから
// 直接検証できるよう、実際の読み書きを行うjs/presenceSync.jsとはファイルを分ける。
//
// 【データ構造（Firebase Realtime Database）】
//   presence/{uid}/connections/{connectionId}: true
//   presence/{uid}/lastSeen: サーバータイムスタンプ（ミリ秒）
// 「オンラインかどうか」は「connectionsに1件でも子がある」ことで判定する（複数端末で
// 同じユーザーを開いていても、どれか1台でも有効な接続があればオンライン扱いになる、
// 本人指示どおりの設計）。1台だけ閉じても他の接続が残っていればオンラインのまま。

// 【一瞬の通信断で即オフラインにならないようにする猶予】onDisconnect()自体はサーバー側が
// 接続断を検知した時点で発火する（クライアントのJSが止まっていても働く、信頼性の高い仕組み）
// ため基本的には過敏に反応しないが、瞬断からの再接続の間にconnectionsが一瞬0件になる
// ごく短い時間帯だけ「まだオンライン扱いにする」ための猶予（ミリ秒）。UIのちらつき防止が
// 主目的で、実際のオンライン判定そのものはFirebase側のonDisconnectに委ねる。
export const PRESENCE_OFFLINE_GRACE_MS = 12000;

// connections（{connectionId: true, ...} 形式のオブジェクト、またはnull/undefined）から、
// 有効な接続が1件でもあるかを判定する。
export function hasActiveConnections(connections) {
  if (!connections || typeof connections !== "object") return false;
  return Object.keys(connections).length > 0;
}

// 生のpresenceエントリ（{connections, lastSeen} または undefined＝該当uidの記録が無い）と、
// 「今」の時刻（テスト容易性のため呼び出し側から渡す）から、表示用の「オンラインかどうか」を
// 判定する。connectionsが0件でも、lastSeenがPRESENCE_OFFLINE_GRACE_MS以内なら、まだ
// オンライン相当として扱う（瞬断からの再接続中の短いちらつきを防ぐための猶予）。
export function computeIsOnlineForDisplay(presenceEntry, nowMs) {
  if (!presenceEntry) return false;
  if (hasActiveConnections(presenceEntry.connections)) return true;
  const lastSeen = presenceEntry.lastSeen;
  if (typeof lastSeen !== "number") return false;
  return nowMs - lastSeen <= PRESENCE_OFFLINE_GRACE_MS;
}

// 【本人指示どおりの区分】1分未満→たった今、60分未満→○分前、24時間未満→○時間前、
// 30日未満→○日前、それ以上→○か月前。lastSeenが無い（一度もpresence記録が無い＝
// このアプリのpresence機能が入る前からの公開プロフィール等）場合はnullを返し、
// 呼び出し側で「記録なし」等に読み替えられるようにする。
export function formatLastSeenLabel(lastSeenMs, nowMs) {
  if (typeof lastSeenMs !== "number" || !Number.isFinite(lastSeenMs)) return null;
  const diffMs = Math.max(0, nowMs - lastSeenMs);
  const diffMin = diffMs / 60000;
  if (diffMin < 1) return "たった今";
  if (diffMin < 60) return `${Math.floor(diffMin)}分前`;
  const diffHour = diffMin / 60;
  if (diffHour < 24) return `${Math.floor(diffHour)}時間前`;
  const diffDay = diffHour / 24;
  if (diffDay < 30) return `${Math.floor(diffDay)}日前`;
  const diffMonth = diffDay / 30;
  return `${Math.max(1, Math.floor(diffMonth))}か月前`;
}

// フレンド一覧の並び替え：オンラインの人→最近オフラインになった人→長期間オフラインの人。
// 同じオンライン状態同士は表示名順（既存のsortProfiles()と同じロケール比較）で安定させる。
// presenceByUid: { [uid]: {connections, lastSeen} } 形式のマップ（存在しないuidは
// 「presence記録なし＝常にオフライン・最終ログイン不明」として扱う）。
export function sortProfilesByPresence(profiles, presenceByUid, nowMs) {
  const withMeta = profiles.map((profile) => {
    const entry = presenceByUid?.[profile.uid];
    const isOnline = computeIsOnlineForDisplay(entry, nowMs);
    const lastSeen = typeof entry?.lastSeen === "number" ? entry.lastSeen : -Infinity;
    return { profile, isOnline, lastSeen };
  });
  withMeta.sort((a, b) => {
    if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
    if (!a.isOnline && a.lastSeen !== b.lastSeen) return b.lastSeen - a.lastSeen;
    return a.profile.displayName.localeCompare(b.profile.displayName, "ja");
  });
  return withMeta.map((m) => m.profile);
}

// フレンドカードに表示する短いラベル（例："🟢 オンライン" または "⚫ 3時間前"）を組み立てる。
// presence記録が一度も無いuid（このアプリのpresence機能導入前からの公開プロフィール等）は
// 「記録なし」と表示し、エラーにはしない。
// 【2026-11-XX追加・本人指示：「🎮 プレイ中」表示】presenceEntry.isPlayingがtrueのときは、
// オンラインである前提のもとで表示テキストだけを「プレイ中」に差し替える（isOnline自体は
// 常にtrue側で扱う＝「プレイ中」は「オンライン」の一種であり、独立した3値目ではない）。
export function buildPresenceStatusLabel(presenceEntry, nowMs) {
  const isOnline = computeIsOnlineForDisplay(presenceEntry, nowMs);
  if (isOnline) {
    if (presenceEntry?.isPlaying === true) return { text: "プレイ中", isOnline: true, isPlaying: true };
    return { text: "オンライン", isOnline: true, isPlaying: false };
  }
  const label = formatLastSeenLabel(presenceEntry?.lastSeen, nowMs);
  return { text: label ?? "記録なし", isOnline: false, isPlaying: false };
}

// 【2026-11-XX新設・本人指示：「🎮 プレイ中」表示】今表示している画面が「対戦・出題中の
// 画面」かどうかを判定する。js/screens.jsの画面名（SCREEN_ELEMENTSのキー）を直接使い、
// 新しい概念を増やさない。既存のaudio unlock heartbeat・ルーム内presence・ゲーム進行
// ロジックには一切触れず、「今どの画面を表示しているか」という既に存在する情報だけから
// 判定する（本人指示：「ゲーム内heartbeatやaudio heartbeatと結合しない」）。
// 【対象に含めた理由】いずれも「出題中で、離脱すると対戦相手やスコアに影響しうる」画面。
// ロビー・設定・結果画面・待機画面は、離脱してもゲーム進行に実害が無いため含めない
// （「プレイ中」は本人の言う「今まさに遊んでいる最中かどうか」に絞る）。
const GAMEPLAY_SCREEN_NAMES = new Set([
  "quiz",
  "lyricsQuizQuestion",
  "instantChallengeQuestion",
  "onlineBattleCountdown",
  "onlineInstantBattleQuestion",
  "onlineInstantCoopBattleQuestion",
  "onlineLyricsBattleQuestion",
  "liveCallModePlayer",
  "liveCallModeKaraoke",
]);

export function isGameplayScreenName(screenName) {
  return GAMEPLAY_SCREEN_NAMES.has(screenName);
}

// 【2026-11-XX新設・本人指示：招待通知を表示してよい画面の一元管理】ルーム招待・
// 「一緒に遊ぶ」招待のどちらのバナーも、この1つの関数だけで「今表示してよいか」を
// 判定する（本人指示：「画面ごとにバラバラのif文を大量に書くのではなく、
// canShowInviteNotification()等で一元管理することを検討してください」）。
// 判定基準は「出題・回答中の画面（＝GAMEPLAY_SCREEN_NAMES、isGameplayScreenName()）
// でなければ表示してよい」というシンプルな1本のルールにする。GAMEPLAY_SCREEN_NAMESは
// 元々「プレイ中」表示のために作った"今まさに遊んでいる最中かどうか"の定義だが、
// 本人指示の「実際のバトルを邪魔しない画面なら表示してよい／出題中・回答中・早押し中・
// 歌詞クイズ進行中・一瞬バトル進行中・一瞬協力進行中には表示しない」という基準と
// ちょうど一致するため、新しい画面リストを二重管理せずそのまま流用する。
// オンボーディング中（screenNameがまだ無い＝null）も安全側として非表示にする。
export function canShowInviteNotification(screenName) {
  if (!screenName) return false;
  return !isGameplayScreenName(screenName);
}
