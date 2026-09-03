// js/roomInvitePayloads.js（ルーム招待の有効期限・クールダウン・並び替えの純粋ロジック）のテスト。
// Firebase・DOMには一切触れないため、tests/presencePayloads.test.jsと同じく高速・決定論的に検証できる。
import {
  isInviteActive,
  canResendInvite,
  buildInvitePayload,
  listActiveInvites,
  listExpiredInviteRoomIds,
  INVITE_EXPIRY_MS,
  INVITE_RESEND_COOLDOWN_MS,
} from "../js/roomInvitePayloads.js";
import { assertEqual } from "./test-utils.js";

export function runRoomInvitePayloadsTests() {
  const now = 1_000_000_000;

  // ===== buildInvitePayload =====
  const payload = buildInvitePayload({
    inviterUid: "host-uid",
    inviterDisplayName: "ホストさん",
    recipientUid: "guest-uid",
    roomId: "ABC123",
    nowMs: now,
  });
  assertEqual(
    payload,
    {
      inviterUid: "host-uid",
      inviterDisplayName: "ホストさん",
      recipientUid: "guest-uid",
      roomId: "ABC123",
      createdAt: now,
      expiresAt: now + INVITE_EXPIRY_MS,
    },
    "buildInvitePayload：期限はcreatedAt+5分"
  );

  // ===== isInviteActive =====
  assertEqual(isInviteActive(null, now), false, "isInviteActive：招待自体が無ければfalse");
  assertEqual(isInviteActive({ expiresAt: now + 1 }, now), true, "isInviteActive：期限内はtrue");
  assertEqual(isInviteActive({ expiresAt: now - 1 }, now), false, "isInviteActive：期限切れはfalse");
  assertEqual(isInviteActive({ expiresAt: now }, now), false, "isInviteActive：ちょうど期限時刻は無効（境界は含めない）");

  // ===== canResendInvite =====
  assertEqual(canResendInvite(null, now), true, "canResendInvite：既存の招待が無ければ常に送信可");
  assertEqual(
    canResendInvite({ createdAt: now - INVITE_RESEND_COOLDOWN_MS + 1 }, now),
    false,
    "canResendInvite：クールダウン中はfalse"
  );
  assertEqual(
    canResendInvite({ createdAt: now - INVITE_RESEND_COOLDOWN_MS }, now),
    true,
    "canResendInvite：クールダウンがちょうど明けたらtrue"
  );

  // ===== listActiveInvites / listExpiredInviteRoomIds =====
  const snapshot = {
    ROOM_ACTIVE_NEW: { inviterDisplayName: "Aさん", createdAt: now - 1000, expiresAt: now + 60000 },
    ROOM_ACTIVE_OLD: { inviterDisplayName: "Bさん", createdAt: now - 60000, expiresAt: now + 1000 },
    ROOM_EXPIRED: { inviterDisplayName: "Cさん", createdAt: now - 400000, expiresAt: now - 1000 },
  };
  const active = listActiveInvites(snapshot, now);
  assertEqual(
    active.map((invite) => invite.roomId),
    ["ROOM_ACTIVE_NEW", "ROOM_ACTIVE_OLD"],
    "listActiveInvites：期限切れを除外し、新しい順に並べる"
  );
  assertEqual(active[0].inviterDisplayName, "Aさん", "listActiveInvites：各要素にroomIdを含む元データがマージされている");

  assertEqual(
    listExpiredInviteRoomIds(snapshot, now),
    ["ROOM_EXPIRED"],
    "listExpiredInviteRoomIds：期限切れのroomIdだけを返す（掃除対象）"
  );

  assertEqual(listActiveInvites(null, now), [], "listActiveInvites：データが無ければ空配列");
  assertEqual(listActiveInvites({}, now), [], "listActiveInvites：空オブジェクトなら空配列");
  assertEqual(listExpiredInviteRoomIds(undefined, now), [], "listExpiredInviteRoomIds：データが無ければ空配列");
}
