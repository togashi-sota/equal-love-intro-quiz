// js/playInvitePayloads.js（「一緒に遊ぶ」1対1招待の有効期限・並び替えの純粋ロジック）のテスト。
// Firebase・DOMには一切触れないため、tests/roomInvitePayloads.test.jsと同じく高速・決定論的に検証できる。
import {
  isPlayInviteActive,
  buildPlayInvitePayload,
  listActivePlayInvites,
  listExpiredPlayInviteIds,
  PLAY_INVITE_EXPIRY_MS,
} from "../js/playInvitePayloads.js";
import { assertEqual } from "./test-utils.js";

export function runPlayInvitePayloadsTests() {
  const now = 1_000_000_000;

  // ===== buildPlayInvitePayload =====
  const payload = buildPlayInvitePayload({
    inviterUid: "inviter-uid",
    inviterDisplayName: "招待する人",
    recipientUid: "recipient-uid",
    nowMs: now,
  });
  assertEqual(
    payload,
    {
      inviterUid: "inviter-uid",
      inviterDisplayName: "招待する人",
      recipientUid: "recipient-uid",
      createdAt: now,
      expiresAt: now + PLAY_INVITE_EXPIRY_MS,
      status: "pending",
    },
    "buildPlayInvitePayload：期限はcreatedAt+5分、statusは常にpendingで始まる"
  );

  // ===== isPlayInviteActive =====
  assertEqual(isPlayInviteActive(null, now), false, "isPlayInviteActive：招待自体が無ければfalse");
  assertEqual(isPlayInviteActive({ expiresAt: now + 1 }, now), true, "isPlayInviteActive：期限内はtrue");
  assertEqual(isPlayInviteActive({ expiresAt: now - 1 }, now), false, "isPlayInviteActive：期限切れはfalse");
  assertEqual(
    isPlayInviteActive({ expiresAt: now }, now),
    false,
    "isPlayInviteActive：ちょうど期限時刻は無効（境界は含めない、既存invites/と同じ判定）"
  );

  // ===== listActivePlayInvites / listExpiredPlayInviteIds =====
  const snapshot = {
    INVITE_ACTIVE_NEW: { inviterDisplayName: "Aさん", createdAt: now - 1000, expiresAt: now + 60000, status: "pending" },
    INVITE_ACTIVE_OLD: { inviterDisplayName: "Bさん", createdAt: now - 60000, expiresAt: now + 1000, status: "pending" },
    INVITE_EXPIRED: { inviterDisplayName: "Cさん", createdAt: now - 400000, expiresAt: now - 1000, status: "pending" },
  };
  const active = listActivePlayInvites(snapshot, now);
  assertEqual(
    active.map((invite) => invite.inviteId),
    ["INVITE_ACTIVE_NEW", "INVITE_ACTIVE_OLD"],
    "listActivePlayInvites：期限切れを除外し、新しい順に並べる"
  );
  assertEqual(
    active[0].inviterDisplayName,
    "Aさん",
    "listActivePlayInvites：各要素にinviteIdを含む元データがマージされている"
  );

  assertEqual(
    listExpiredPlayInviteIds(snapshot, now),
    ["INVITE_EXPIRED"],
    "listExpiredPlayInviteIds：期限切れのinviteIdだけを返す（掃除対象）"
  );

  assertEqual(listActivePlayInvites(null, now), [], "listActivePlayInvites：データが無ければ空配列");
  assertEqual(listActivePlayInvites({}, now), [], "listActivePlayInvites：空オブジェクトなら空配列");
  assertEqual(listExpiredPlayInviteIds(undefined, now), [], "listExpiredPlayInviteIds：データが無ければ空配列");

  // ===== statusが"accepted"へ変わってもisPlayInviteActive自体の判定は変わらない =====
  // （status遷移とexpiresAtによる有効期限は独立した概念であることの確認）
  assertEqual(
    isPlayInviteActive({ status: "accepted", expiresAt: now + 1000 }, now),
    true,
    "isPlayInviteActive：statusが'accepted'でも、expiresAt自体が有効なら引き続きtrue"
  );
}
