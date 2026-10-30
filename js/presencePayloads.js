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

// 【2026-10-23追加・本人指示（「ゆき」が1週間以上オンライン表示のままの不具合）】
// 本番データで、切断時に消えるはずの接続ノード（connections/{id}）が1件だけ残り続け、lastSeen は
// 8日以上前で止まっている状態を確認した（onDisconnect が何らかの理由で実行されなかった残骸）。
// 接続中の端末は js/presenceSync.js の専用ハートビートで lastSeen を2分ごとに更新し続けるため、
// 「接続ノードはあるのに lastSeen が長く更新されていない」ものは、実際には接続していない残骸とみなす
// （Firebase公式の presence 例と同じ「接続ノード＋最終オンライン時刻」の2本立ての考え方）。
// 2分ごとの更新が7回続けて届かない時間（15分）を基準にし、通常プレイ中の人を誤ってオフラインにしない。
// 端末どうしの時計のずれ（数分程度）を吸収できる余裕も含めた値。
export const PRESENCE_STALE_CONNECTION_MS = 15 * 60 * 1000;

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
  if (hasActiveConnections(presenceEntry.connections)) {
    // lastSeen が無い古い形式の記録は、従来どおり接続ノードだけで判定する
    if (typeof presenceEntry.lastSeen !== "number") return true;
    // 接続ノードがあっても lastSeen が長く更新されていなければ、切断済みの残骸として扱う
    return nowMs - presenceEntry.lastSeen <= PRESENCE_STALE_CONNECTION_MS;
  }
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

// 【2026-10-23追加】Firebase の push() で作られた子キー（例："-P3tBH9O..."）の先頭8文字には、
// 作成時刻（ミリ秒）が埋め込まれている。本人の端末が自分の古い接続ノードを掃除するときに、
// 「いつ作られた接続か」を知るために使う。形式が違えば null。
const PUSH_ID_CHARS = "-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz";

export function getPushIdTimestampMs(pushId) {
  if (typeof pushId !== "string" || pushId.length < 8) return null;
  let timestamp = 0;
  for (let i = 0; i < 8; i += 1) {
    const value = PUSH_ID_CHARS.indexOf(pushId.charAt(i));
    if (value < 0) return null;
    timestamp = timestamp * 64 + value;
  }
  return timestamp;
}

// 本人の端末が接続したときに消してよい「自分の古い接続ノード」を選ぶ（純粋関数）。
// ・今この端末が作った接続（currentConnectionId）は絶対に選ばない
// ・作成から maxAgeMs（既定24時間）以上たったものだけを選ぶ（別の端末で今まさに遊んでいる
//   接続を消してしまわないよう、十分に古いものに限定する）
// ・作成時刻が読めないキーは選ばない（安全側）
export const PRESENCE_OWN_GHOST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

// 【2026-10-28追加（エミュレータ検証で確認）】接続ごとの生存時刻（数値）を持つ接続ノードは、作成時刻ではなく
// 「最後に生存を書いた時刻」で判断できる。PRESENCE_UNKNOWN_MAX_MS（1時間）を超えて更新されていない数値ノードは、
// 表示上も既に「オフライン」扱いの残骸なので、本人の端末が次に接続したときに消してよい
// （別の端末で今まさに遊んでいる接続は2分ごとに時刻が新しくなるため、1時間止まっていることはない）。
//   serverNowMs … サーバー時刻の推定値（数値ノードはサーバー時刻で書かれているため）。省略時は nowMs。
export function selectStaleOwnConnectionIds(connections, currentConnectionId, nowMs, maxAgeMs = PRESENCE_OWN_GHOST_MAX_AGE_MS, { serverNowMs = nowMs, staleTimedMs = PRESENCE_UNKNOWN_MAX_MS } = {}) {
  if (!connections || typeof connections !== "object") return [];
  return Object.keys(connections).filter((connectionId) => {
    if (connectionId === currentConnectionId) return false;
    const value = connections[connectionId];
    if (typeof value === "number" && Number.isFinite(value) && serverNowMs - value > staleTimedMs) return true;
    const createdAt = getPushIdTimestampMs(connectionId);
    if (createdAt === null) return false;
    return nowMs - createdAt >= maxAgeMs;
  });
}

// ---------------------------------------------------------------------------
// 【2026-10-28追加・本人の実機報告（オンラインのまま／オフラインにならない／オンラインなのに
// オフライン／最終接続がおかしい／「記録なし」）への対応】
// 既存の computeIsOnlineForDisplay()・buildPresenceStatusLabel() は互換のためそのまま残し、
// フレンド一覧の表示は下の classifyPresenceEntry()／buildPresenceDisplay() で「5つの状態」に分ける。
//   online  … 接続ノードがあり、サーバー時刻で見た最新の生存記録（lastSeen または接続ごとの時刻）が新しい
//   playing … online のうち「🎮 プレイ中」
//   unknown … 接続ノードは残っているが、生存記録が PRESENCE_STALE_CONNECTION_MS〜PRESENCE_UNKNOWN_MAX_MS の間
//             更新されていない（本当に切れたのか、通信が詰まっているだけか判断できない）→「通信不明」
//   offline … 接続ノードが無い、または生存記録が PRESENCE_UNKNOWN_MAX_MS より古い残骸だけ →「最終接続 ○前」
//   none    … presence の記録そのものが無い（または接続も lastSeen も無い）→「記録なし」
// 【時刻はサーバー基準】nowMs には端末の Date.now() ではなく、computeServerNowMs()（端末時刻＋
// Firebase の .info/serverTimeOffset）を渡す。lastSeen は serverTimestamp() で書かれるため、
// 見る側の端末の時計が15分以上ずれていると「オンラインなのにオフライン」になっていた。
// 【複数端末】接続ノードの値が数値（将来 Rules を変えて接続ごとの生存時刻を書く場合）のときは
// 接続ごとに判定し、1つでも新しければ online。値が true（現行 Rules）のときは共有の lastSeen で判定する。
// ---------------------------------------------------------------------------

// 接続ノードは残っているのに生存記録が止まっている状態を「通信不明」と表示する上限。
// これより古い残骸は、ハートビート（2分ごと）が30回以上届いていない＝確実に切断済みとみなし、
// 既存の「ゆき」対応と同じく最終接続時刻だけを表示する。
export const PRESENCE_UNKNOWN_MAX_MS = 60 * 60 * 1000;

// サーバー時刻の推定値（端末時刻＋オフセット）。オフセットが分からなければ端末時刻のまま。
export function computeServerNowMs(localNowMs, serverTimeOffsetMs) {
  const offset = typeof serverTimeOffsetMs === "number" && Number.isFinite(serverTimeOffsetMs) ? serverTimeOffsetMs : 0;
  return localNowMs + offset;
}

// 接続ノード（connections）の中身を「時刻つき」「時刻なし（true）」に分けて数える。
function summarizeConnections(connections) {
  const summary = { total: 0, withTime: [], withoutTime: 0 };
  if (!connections || typeof connections !== "object") return summary;
  Object.values(connections).forEach((value) => {
    summary.total += 1;
    if (typeof value === "number" && Number.isFinite(value)) summary.withTime.push(value);
    else summary.withoutTime += 1;
  });
  return summary;
}

// presence 1件を5状態のどれかに分類する（純粋関数）。
// 戻り値：{ state, lastSeen: number|null（表示に使う最終接続時刻）, connectionCount, freshConnectionCount }
// 【2026-10-28改訂（エミュレータ検証で発見）】「通信不明」か「オフライン」かは、接続ノードごとの生存時刻で決める。
//   以前は「共有の lastSeen と接続時刻のうち最新のもの」で1時間の線を判定していたため、
//   iPhone（数値ノードが2時間止まった残骸）＋PC（今閉じた＝onDisconnect が lastSeen を今の時刻にした）のような場合に、
//   本当は残骸しか無いのに「通信不明」と出ていた。今は：
//   ・数値の接続ノード … そのノード自身の時刻で判定（15分以内＝生存／15分〜1時間＝通信不明／1時間超＝残骸）
//   ・true の接続ノード（今の本番 Rules・古いアプリ）… 共有の lastSeen で判定（従来どおり）
//   表示する時刻：生存・通信不明のときは、その接続の最終確認時刻。オフラインのときは全体の最終接続時刻。
export function classifyPresenceEntry(presenceEntry, nowMs) {
  if (!presenceEntry || typeof presenceEntry !== "object") {
    return { state: "none", lastSeen: null, connectionCount: 0, freshConnectionCount: 0 };
  }
  const lastSeen = typeof presenceEntry.lastSeen === "number" && Number.isFinite(presenceEntry.lastSeen) ? presenceEntry.lastSeen : null;
  const connections = summarizeConnections(presenceEntry.connections);
  const ageOf = (time) => nowMs - time;
  const isFresh = (time) => ageOf(time) <= PRESENCE_STALE_CONNECTION_MS;
  const isUnknownAge = (time) => !isFresh(time) && ageOf(time) <= PRESENCE_UNKNOWN_MAX_MS;
  const freshTimed = connections.withTime.filter(isFresh).length;
  // 時刻なし（true）の接続は、共有の lastSeen が新しければ生きているとみなす（lastSeen が無い古い形式は従来どおり生存扱い）
  const freshUntimed = connections.withoutTime > 0 && (lastSeen === null || isFresh(lastSeen)) ? connections.withoutTime : 0;
  const freshConnectionCount = freshTimed + freshUntimed;
  // 全体の最終接続時刻：lastSeen と接続ごとの時刻のうち最も新しいもの（オフライン表示に使う）
  const newestOf = (list) => {
    const newest = list.filter((t) => typeof t === "number" && Number.isFinite(t)).reduce((a, b) => Math.max(a, b), -Infinity);
    return Number.isFinite(newest) ? newest : null;
  };
  const shownLastSeen = newestOf([lastSeen, ...connections.withTime]);
  const base = { lastSeen: shownLastSeen, connectionCount: connections.total, freshConnectionCount };

  if (freshConnectionCount > 0) {
    return { ...base, state: presenceEntry.isPlaying === true ? "playing" : "online" };
  }
  if (connections.total > 0) {
    // 接続ノードはあるが、どれも生存記録が古い。「通信不明」の候補＝15分〜1時間止まっている接続
    const unknownTimes = connections.withTime.filter(isUnknownAge);
    if (connections.withoutTime > 0 && lastSeen !== null && isUnknownAge(lastSeen)) unknownTimes.push(lastSeen);
    if (unknownTimes.length > 0) return { ...base, lastSeen: newestOf(unknownTimes), state: "unknown" };
    // 時刻の分からない接続（数値でも true でもない壊れた値で、lastSeen も無い）は判断できないので通信不明
    if (shownLastSeen === null) return { ...base, state: "unknown" };
    return { ...base, state: "offline" };
  }
  // 接続ノードが無い：瞬断の猶予（既存と同じ）だけオンライン相当、それ以外は最終接続時刻
  if (shownLastSeen !== null && nowMs - shownLastSeen <= PRESENCE_OFFLINE_GRACE_MS) {
    return { ...base, state: presenceEntry.isPlaying === true ? "playing" : "online" };
  }
  if (shownLastSeen !== null) return { ...base, state: "offline" };
  return { ...base, state: "none" };
}

// フレンドカード用の表示（アイコン・文言・オンライン扱いか）を組み立てる（純粋関数）。
// isOnline は「一緒に遊ぶ」ボタン・並び順に使う。unknown は安全側（オンライン扱いにしない）。
export function buildPresenceDisplay(presenceEntry, nowMs) {
  const result = classifyPresenceEntry(presenceEntry, nowMs);
  const lastSeenLabel = formatLastSeenLabel(result.lastSeen ?? undefined, nowMs);
  switch (result.state) {
    case "playing":
      return { state: "playing", icon: "🎮", text: "プレイ中", isOnline: true, isPlaying: true };
    case "online":
      return { state: "online", icon: "🟢", text: "オンライン", isOnline: true, isPlaying: false };
    case "unknown":
      return {
        state: "unknown",
        icon: "❔",
        text: lastSeenLabel ? `通信不明（最終確認 ${lastSeenLabel}）` : "通信不明",
        isOnline: false,
        isPlaying: false,
      };
    case "offline":
      return { state: "offline", icon: "⚫", text: lastSeenLabel ?? "記録なし", isOnline: false, isPlaying: false };
    default:
      return { state: "none", icon: "⚫", text: "記録なし", isOnline: false, isPlaying: false };
  }
}

// 【2026-10-28追加】画面がバックグラウンド・ロックから戻ったときに lastSeen を即時更新するかの判定（純粋関数）。
// iOS ではバックグラウンド中に setInterval が止まるため、復帰直後は lastSeen が数分古いことがある。
export const PRESENCE_RESUME_HEARTBEAT_MIN_INTERVAL_MS = 30000;

export function shouldWriteResumeHeartbeat({ visibilityState, trackedUid: uid, nowMs, lastWrittenAtMs, minIntervalMs = PRESENCE_RESUME_HEARTBEAT_MIN_INTERVAL_MS }) {
  if (visibilityState !== "visible") return false;
  if (!uid) return false;
  return nowMs - lastWrittenAtMs >= minIntervalMs;
}

// ---------------------------------------------------------------------------
// 【2026-10-28追加：接続ごとの生存時刻（後方互換）】
// presence/{uid}/connections/{接続キー} の値を true ではなくサーバー時刻（数値）にし、2分ごとのハートビートで
// lastSeen と一緒に更新する。複数端末・複数タブでも「どの接続が今も生きているか」を接続ごとに判定できる
// （classifyPresenceEntry は値が数値なら接続ごとに判定、true なら共有の lastSeen で判定＝古いアプリも混在できる）。
// 【今の本番 Rules との互換】今の Rules は接続ノードに true しか許さない。数値の書き込みが拒否されたら
// その場で true を書き直し（従来どおりの表示）、「この環境では使えない」ことを端末に覚えて24時間は試さない
// （無駄な失敗を繰り返さない）。Rules を更新した後は、24時間以内に自動で数値方式へ切り替わる。
// ---------------------------------------------------------------------------
export const PRESENCE_CONNECTION_TIMESTAMP_RETRY_MS = 24 * 60 * 60 * 1000;
export const PRESENCE_CONNECTION_TIMESTAMP_UNSUPPORTED_KEY = "equalLoveIntroQuiz.presenceConnectionTimestampUnsupportedAt";

// 接続ノードへ数値（時刻）を書いてみるか（純粋関数）。
export function shouldTryConnectionTimestamp({ unsupportedAtMs = null, nowMs }) {
  if (typeof unsupportedAtMs !== "number" || !Number.isFinite(unsupportedAtMs)) return true;
  return nowMs - unsupportedAtMs >= PRESENCE_CONNECTION_TIMESTAMP_RETRY_MS;
}

// ハートビート1回で書く内容（presence/{uid} からの相対パス → 値）を作る（純粋関数）。
//   timestampMode: "supported" のときだけ、接続中（connected）の自分の接続ノードも同じ時刻へ更新する。
//   切断中は接続ノードを書かない（再接続時に、サーバーが既に消した古い接続ノードを書き戻して残骸にしないため）。
//   serverTimestampValue には serverTimestamp() の戻り値を渡す（テストでは任意の値）。
export function buildPresenceHeartbeatWrites({ timestampMode, connectionKey, connected, serverTimestampValue }) {
  const writes = { lastSeen: serverTimestampValue };
  if (timestampMode === "supported" && connected === true && typeof connectionKey === "string" && connectionKey) {
    writes[`connections/${connectionKey}`] = serverTimestampValue;
  }
  return writes;
}

// 【2026-10-28追加】ハートビート（lastSeen＋自分の接続ノード）が Rules に拒否されたときの対応（純粋関数）。
//   提案 Rules では「存在しない接続ノードへ時刻を書く」ことが拒否される。拒否されたのが
//   ・今も使っている接続（再接続していない・接続中）のノード → 誰かに消された → "recreate-connection"（作り直す）
//   ・再接続より前の古い接続のノード（切断中に送れなかった分の送り直し）→ "ignore"（書き戻さないのが正しい）
export function decideHeartbeatDenialAction({ deniedConnectionKey, currentConnectionKey, connected }) {
  if (connected !== true) return "ignore";
  if (typeof deniedConnectionKey !== "string" || !deniedConnectionKey) return "ignore";
  return deniedConnectionKey === currentConnectionKey ? "recreate-connection" : "ignore";
}

// 書き込み量の見積もり（純粋関数。報告書・テスト用）。1時間あたりの書き込み回数と概算バイト数。
//   heartbeat は2分ごと（PRESENCE_LASTSEEN_HEARTBEAT_INTERVAL_MS と同じ値を渡す）。
export function estimatePresenceWriteBudget({ heartbeatIntervalMs = 120000, connectionsPerUser = 1, timestampMode = "supported", resumesPerHour = 0 } = {}) {
  const heartbeatsPerHour = Math.round((60 * 60 * 1000) / heartbeatIntervalMs);
  const writesPerHour = (heartbeatsPerHour + resumesPerHour) * connectionsPerUser;
  // lastSeen だけ ≒ 60バイト、接続ノードも書くと ≒ 110バイト（パス＋値の概算）
  const bytesPerWrite = timestampMode === "supported" ? 110 : 60;
  return { heartbeatsPerHour, writesPerHour, approxBytesPerHour: writesPerHour * bytesPerWrite };
}

// ---------------------------------------------------------------------------
// 【2026-10-31追加・本人の実機報告「サブがアプリを閉じたのに、1日ずっとオンライン」】
// ホーム画面へ戻しただけ（完全には終了していない）の端末は、裏でアプリが動き続け、2分ごとのハートビートで
// lastSeen を更新し続けるため、ずっと「オンライン」に見えていた。今は画面が隠れたら自分の接続ノードを外し、
// 画面へ戻ったら付け直す（本人の判断：この仕様で進めてよい）。
// オンライン対戦・パーティーなど、ルームコードを LINE で送るために少しだけアプリを離れることがある画面では、
// すぐには外さず、短い猶予（60秒）の後に外す（戻ってくれば何もしない）。
// ---------------------------------------------------------------------------
export const PRESENCE_HIDDEN_GRACE_MS = 60 * 1000;

// 画面が隠れたときに、何ミリ秒後に接続ノードを外すか（純粋関数）。0 ならすぐ外す。
//   reason: "hidden"（visibilitychange）／"pagehide"（ページを離れる・閉じる。猶予なし）
export function decideHiddenPresenceDelayMs({ screenName = null, reason = "hidden" } = {}) {
  if (reason === "pagehide") return 0;
  if (typeof screenName === "string" && (screenName.startsWith("online") || isGameplayScreenName(screenName))) {
    return PRESENCE_HIDDEN_GRACE_MS;
  }
  return 0;
}

// 【2026-10-31追加・本人の実機報告「ルームを解散したのに、フレンドに『🏠 同じルームにいます』が残る」】
// 「今いるルームの参加者」を、今いるルーム（currentRoomId）と最後に受け取ったルームの中身（latestRoom）の両方から決める
// （純粋関数）。ルームを出た・解散した・キックされた後は currentRoomId が無くなるので、古い中身が残っていても空にする。
// 別のルームの古い中身（ルームIDが違う）も使わない。
export function selectCurrentRoomPlayerUids({ currentRoomId = null, latestRoom = null } = {}) {
  if (!currentRoomId || !latestRoom || typeof latestRoom !== "object") return new Set();
  if (latestRoom.roomId && latestRoom.roomId !== currentRoomId) return new Set();
  return new Set(Object.keys(latestRoom.players ?? {}));
}
