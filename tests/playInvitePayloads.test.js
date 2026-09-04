// js/playInvitePayloads.js（「一緒に遊ぶ」1対1招待の有効期限・並び替えの純粋ロジック）のテスト。
// Firebase・DOMには一切触れないため、tests/roomInvitePayloads.test.jsと同じく高速・決定論的に検証できる。
import {
  isPlayInviteActive,
  isPlayInviteAwaitingRecipientDecision,
  buildPlayInvitePayload,
  buildPlayInviteOutboxPayload,
  listActivePlayInvites,
  listExpiredPlayInviteIds,
  truncateDisplayNameForNotice,
  PLAY_INVITE_STATUS,
  PLAY_INVITE_EXPIRY_MS,
  PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH,
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
    // 2026-11-XX追加：期限内でも、既に受信者が決定済み（accepted等）の招待は
    // 通常バナー一覧には出さない（専用UIが別に担当するため）。
    INVITE_ACCEPTED: { inviterDisplayName: "Dさん", createdAt: now - 500, expiresAt: now + 60000, status: "accepted" },
    INVITE_SNOOZED: { inviterDisplayName: "Eさん", createdAt: now - 200, expiresAt: now + 60000, status: "snoozed" },
  };
  const active = listActivePlayInvites(snapshot, now);
  assertEqual(
    active.map((invite) => invite.inviteId),
    ["INVITE_SNOOZED", "INVITE_ACTIVE_NEW", "INVITE_ACTIVE_OLD"],
    "listActivePlayInvites：期限切れ・pending/snoozed以外を除外し、新しい順に並べる"
  );
  assertEqual(
    active[0].inviterDisplayName,
    "Eさん",
    "listActivePlayInvites：各要素にinviteIdを含む元データがマージされている（最新のINVITE_SNOOZEDが先頭）"
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

  // ===== isPlayInviteAwaitingRecipientDecision =====
  // 2026-11-XX新設：「あとで→後から参加」フローで状態が増えたため、
  // 通常の招待バナーに出してよい状態（pending/snoozed）だけを判定する専用関数。
  assertEqual(
    isPlayInviteAwaitingRecipientDecision(null, now),
    false,
    "isPlayInviteAwaitingRecipientDecision：招待自体が無ければfalse"
  );
  assertEqual(
    isPlayInviteAwaitingRecipientDecision({ status: "pending", expiresAt: now + 1000 }, now),
    true,
    "isPlayInviteAwaitingRecipientDecision：pendingは対象"
  );
  assertEqual(
    isPlayInviteAwaitingRecipientDecision({ status: "snoozed", expiresAt: now + 1000 }, now),
    true,
    "isPlayInviteAwaitingRecipientDecision：snoozedも対象（保留チップから再表示するため）"
  );
  for (const status of ["accepted", "declinedByRecipient", "declinedBySender", "joinRequested"]) {
    assertEqual(
      isPlayInviteAwaitingRecipientDecision({ status, expiresAt: now + 1000 }, now),
      false,
      `isPlayInviteAwaitingRecipientDecision：status="${status}"は専用UIが担当するため対象外`
    );
  }
  assertEqual(
    isPlayInviteAwaitingRecipientDecision({ status: "pending", expiresAt: now - 1000 }, now),
    false,
    "isPlayInviteAwaitingRecipientDecision：statusがpendingでも期限切れならfalse"
  );

  // ===== buildPlayInviteOutboxPayload =====
  assertEqual(
    buildPlayInviteOutboxPayload({
      recipientUid: "recipient-uid",
      recipientDisplayName: "受け手さん",
      inviteId: "invite-123",
      nowMs: now,
    }),
    {
      recipientUid: "recipient-uid",
      recipientDisplayName: "受け手さん",
      inviteId: "invite-123",
      createdAt: now,
    },
    "buildPlayInviteOutboxPayload：playInviteOutbox/{自分のuid}へ書き込む材料をそのまま組み立てる"
  );

  // ===== PLAY_INVITE_STATUS =====
  assertEqual(
    PLAY_INVITE_STATUS,
    {
      PENDING: "pending",
      ACCEPTED: "accepted",
      DECLINED_BY_RECIPIENT: "declinedByRecipient",
      DECLINED_BY_SENDER: "declinedBySender",
      SNOOZED: "snoozed",
      JOIN_REQUESTED: "joinRequested",
    },
    "PLAY_INVITE_STATUS：Firebase Rules側の状態遷移表と一致する6つの文字列定数"
  );

  // ===== truncateDisplayNameForNotice =====
  assertEqual(
    truncateDisplayNameForNotice("みじかい名前"),
    "みじかい名前",
    "truncateDisplayNameForNotice：上限以下ならそのまま返す"
  );
  const longName = "あ".repeat(PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH + 5);
  assertEqual(
    truncateDisplayNameForNotice(longName),
    `${"あ".repeat(PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH)}…`,
    "truncateDisplayNameForNotice：上限を超えたら切り詰めて「…」を付ける"
  );
  assertEqual(
    truncateDisplayNameForNotice(""),
    "フレンド",
    "truncateDisplayNameForNotice：表示名が空ならフォールバック文言を返す"
  );
  assertEqual(
    truncateDisplayNameForNotice(null),
    "フレンド",
    "truncateDisplayNameForNotice：表示名がnullでもフォールバック文言を返す（例外を投げない）"
  );
  assertEqual(
    truncateDisplayNameForNotice("あ".repeat(PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH)),
    "あ".repeat(PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH),
    "truncateDisplayNameForNotice：ちょうど上限の長さなら省略しない（境界値）"
  );
}
