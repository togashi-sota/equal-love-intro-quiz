// 「一緒に遊ぶ」（フレンド一覧から直接1対1で誘い、相手が参加した瞬間に新しいルームを
// 作る招待）機能の、Firebase・DOMに一切触れない純粋なロジックだけを集めたファイル
// （2026-11-XX新設、本人指示）。js/roomInvitePayloads.jsと同じ設計方針。
//
// 【既存のルーム招待（invites/）との違い】
// 既存のinvites/はroomId前提（＝既にあるルームへ人を追加する）。
// 「一緒に遊ぶ」はまだルームが存在しない状態から始まるため、別のデータ構造として分離する
// （本人指示：「無理に既存invitesへ押し込まないでください」）。
//
// 【データ構造（Firebase Realtime Database）】
//   playInvites/{recipientUid}/{inviteId}/
//     inviterUid: 招待した人のuid
//     inviterDisplayName: 招待した人の表示名（送信時点のスナップショット）
//     recipientUid: 招待された本人のuid（Rules側で「自分宛の招待か」を検証するため、
//       パスのキーと二重に持たせる。既存invites/と同じ考え方）
//     createdAt: 送信時刻（サーバータイムスタンプ）
//     expiresAt: 失効時刻（createdAt + PLAY_INVITE_EXPIRY_MS）
//     status: "pending"（返事待ち）→"accepted"（受信者が「参加する」を押した）
//     roomId: status:"accepted"になった後、送信者（inviter）が新しいルームを作成してから
//       書き込むフィールド（作成直後はまだ存在しない）
//
// 【なぜルームを作るのは常に送信者（inviter）なのか】firebase/database.rules.jsonの
// rooms/$roomIdは「ルームを新規作成できるのは、そのルームのhostに自分自身（auth.uid）を
// 指定した人だけ」という既存ルールになっている（他人をhostにしたルームを勝手に作ることは
// 誰にもできない、セキュリティ上重要な既存の制約）。「参加する」を押すのは受信者（recipient）
// だが、ルームのhostになるのは送信者（inviter）なので、受信者の操作だけでは新しいルームを
// 直接作れない。そこで、受信者は「参加します」という意思表示（status:"accepted"）だけを
// 書き込み、それを見た送信者側の端末（招待している間は当然オンラインのはず）が実際の
// ルーム作成を行い、できたroomIdをこの招待データへ書き戻す、という2段階の流れにしている
// （js/playInvites.jsのwatchOutgoingPlayInviteAcceptance()参照）。
// 送信者が既にオフラインになっていた場合は誰もルームを作らないため、受信者側は一定時間
// 待っても何も起きず、安全にタイムアウトする（js/playInviteUi.js参照）。

export const PLAY_INVITE_EXPIRY_MS = 5 * 60 * 1000; // 5分（既存invites/と同じ）
// 受信者が「参加する」を押してから、送信者側がルームを作ってroomIdを書き戻すまでの
// 待ち時間の上限。送信者の端末が既にオフライン・閉じている場合、誰もルームを作らないため
// このタイムアウトが無いと受信者は永久に待たされてしまう（本人指示：「参加する」自体が
// 意思確認、余計な確認は不要、という方針とは別に、失敗時に無反応のままにはしない）。
export const PLAY_INVITE_ROOM_WAIT_TIMEOUT_MS = 10000;

// 招待データ（{createdAt, expiresAt, status, ...}）と「今」の時刻から、まだ有効かどうかを判定する。
export function isPlayInviteActive(invite, nowMs) {
  if (!invite) return false;
  if (typeof invite.expiresAt !== "number") return false;
  return invite.expiresAt > nowMs;
}

// 新規招待のpayloadを組み立てる（Firebaseへ書き込む直前の材料）。
export function buildPlayInvitePayload({ inviterUid, inviterDisplayName, recipientUid, nowMs }) {
  return {
    inviterUid,
    inviterDisplayName,
    recipientUid,
    createdAt: nowMs,
    expiresAt: nowMs + PLAY_INVITE_EXPIRY_MS,
    status: "pending",
  };
}

// 生のplayInvitesスナップショット（{ [inviteId]: inviteData, ... } 形式、または
// null/undefined）から、有効な招待だけを新しい順に並べた配列にする
// （js/roomInvitePayloads.jsのlistActiveInvites()と同じ考え方）。
export function listActivePlayInvites(invitesSnapshotValue, nowMs) {
  if (!invitesSnapshotValue || typeof invitesSnapshotValue !== "object") return [];
  return Object.entries(invitesSnapshotValue)
    .map(([inviteId, invite]) => ({ ...invite, inviteId }))
    .filter((invite) => isPlayInviteActive(invite, nowMs))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

// 期限切れになった招待のinviteId一覧（掃除対象）。
export function listExpiredPlayInviteIds(invitesSnapshotValue, nowMs) {
  if (!invitesSnapshotValue || typeof invitesSnapshotValue !== "object") return [];
  return Object.entries(invitesSnapshotValue)
    .filter(([, invite]) => !isPlayInviteActive(invite, nowMs))
    .map(([inviteId]) => inviteId);
}
