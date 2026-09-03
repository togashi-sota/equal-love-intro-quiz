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
export function buildPresenceStatusLabel(presenceEntry, nowMs) {
  const isOnline = computeIsOnlineForDisplay(presenceEntry, nowMs);
  if (isOnline) return { text: "オンライン", isOnline: true };
  const label = formatLastSeenLabel(presenceEntry?.lastSeen, nowMs);
  return { text: label ?? "記録なし", isOnline: false };
}
