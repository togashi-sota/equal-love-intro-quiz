// js/presencePayloads.js（フレンドのオンライン状態・最終ログイン表示の純粋ロジック）のテスト。
// Firebase・DOMには一切触れないため、js/publicProfilePayloads.test.jsと同じく高速・
// 決定論的に検証できる。
import {
  hasActiveConnections,
  computeIsOnlineForDisplay,
  formatLastSeenLabel,
  sortProfilesByPresence,
  buildPresenceStatusLabel,
  PRESENCE_OFFLINE_GRACE_MS,
} from "../js/presencePayloads.js";
import { assertEqual } from "./test-utils.js";

export function runPresencePayloadsTests() {
  // ===== hasActiveConnections =====
  assertEqual(hasActiveConnections(null), false, "hasActiveConnections: nullはfalse");
  assertEqual(hasActiveConnections(undefined), false, "hasActiveConnections: undefinedはfalse");
  assertEqual(hasActiveConnections({}), false, "hasActiveConnections: 空オブジェクトはfalse");
  assertEqual(hasActiveConnections({ abc: true }), true, "hasActiveConnections: 1件でもあればtrue");
  assertEqual(hasActiveConnections({ a: true, b: true }), true, "hasActiveConnections: 複数端末分あってもtrue");

  // ===== computeIsOnlineForDisplay =====
  const now = 1_000_000_000;
  assertEqual(computeIsOnlineForDisplay(undefined, now), false, "presence記録が無ければオフライン扱い");
  assertEqual(
    computeIsOnlineForDisplay({ connections: { a: true }, lastSeen: now }, now),
    true,
    "connectionsが1件でもあればオンライン"
  );
  // 【本人指示：複数端末で片方を閉じただけではオフラインにならない】2台のうち1台分の
  // connectionsだけが残っていてもオンラインのままであることを確認する。
  assertEqual(
    computeIsOnlineForDisplay({ connections: { deviceB: true }, lastSeen: now }, now),
    true,
    "複数端末のうち1台分のconnectionsが残っていればオンラインのまま"
  );
  assertEqual(
    computeIsOnlineForDisplay({ connections: {}, lastSeen: now - PRESENCE_OFFLINE_GRACE_MS + 1 }, now),
    true,
    "connectionsが0件でも、猶予時間内のlastSeenならオンライン相当（瞬断からの再接続中のちらつき防止）"
  );
  assertEqual(
    computeIsOnlineForDisplay({ connections: {}, lastSeen: now - PRESENCE_OFFLINE_GRACE_MS - 1 }, now),
    false,
    "connectionsが0件で、猶予時間を過ぎたlastSeenならオフライン"
  );
  assertEqual(
    computeIsOnlineForDisplay({ connections: {}, lastSeen: undefined }, now),
    false,
    "connectionsが0件でlastSeenも無ければオフライン"
  );

  // ===== formatLastSeenLabel =====
  assertEqual(formatLastSeenLabel(undefined, now), null, "lastSeenが無ければnull（呼び出し側で「記録なし」に読み替える）");
  assertEqual(formatLastSeenLabel(now - 30 * 1000, now), "たった今", "1分未満はたった今");
  assertEqual(formatLastSeenLabel(now - 5 * 60 * 1000, now), "5分前", "60分未満は○分前");
  assertEqual(formatLastSeenLabel(now - 3 * 60 * 60 * 1000, now), "3時間前", "24時間未満は○時間前");
  assertEqual(formatLastSeenLabel(now - 5 * 24 * 60 * 60 * 1000, now), "5日前", "30日未満は○日前");
  assertEqual(formatLastSeenLabel(now - 90 * 24 * 60 * 60 * 1000, now), "3か月前", "30日以上は○か月前");
  assertEqual(formatLastSeenLabel(now - 400 * 24 * 60 * 60 * 1000, now), "13か月前", "1年を超えても壊れず○か月前のまま");

  // ===== buildPresenceStatusLabel =====
  assertEqual(
    buildPresenceStatusLabel({ connections: { a: true }, lastSeen: now }, now),
    { text: "オンライン", isOnline: true },
    "オンライン中のラベル"
  );
  assertEqual(
    buildPresenceStatusLabel({ connections: {}, lastSeen: now - 3 * 60 * 60 * 1000 - PRESENCE_OFFLINE_GRACE_MS }, now),
    { text: "3時間前", isOnline: false },
    "オフライン中のラベル（最終ログイン表示）"
  );
  assertEqual(
    buildPresenceStatusLabel(undefined, now),
    { text: "記録なし", isOnline: false },
    "presence記録が一度も無い場合は「記録なし」（エラーにしない）"
  );

  // ===== sortProfilesByPresence =====
  const profiles = [
    { uid: "u-offline-old", displayName: "ろろろ" },
    { uid: "u-online-b", displayName: "びびび" },
    { uid: "u-offline-new", displayName: "ににに" },
    { uid: "u-online-a", displayName: "ああああ" },
    { uid: "u-no-presence", displayName: "むむむ" },
  ];
  const presenceByUid = {
    "u-online-a": { connections: { a: true }, lastSeen: now },
    "u-online-b": { connections: { a: true }, lastSeen: now },
    "u-offline-new": { connections: {}, lastSeen: now - PRESENCE_OFFLINE_GRACE_MS - 60_000 },
    "u-offline-old": { connections: {}, lastSeen: now - PRESENCE_OFFLINE_GRACE_MS - 10_000_000 },
  };
  const sorted = sortProfilesByPresence(profiles, presenceByUid, now).map((p) => p.uid);
  assertEqual(
    sorted,
    ["u-online-a", "u-online-b", "u-offline-new", "u-offline-old", "u-no-presence"],
    "並び順：オンライン（表示名順）→最近オフライン→古いオフライン→presence記録なし"
  );
}
