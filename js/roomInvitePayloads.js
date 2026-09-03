// フレンドから「今のオンライン対戦ルームへの招待」機能の、Firebase・DOMに一切触れない
// 純粋なロジックだけを集めたファイル（2026-11-XX新設、本人指示）。
//
// 【データ構造（Firebase Realtime Database）】
//   invites/{recipientUid}/{roomId}/
//     inviterUid: 招待した人のuid
//     inviterDisplayName: 招待した人の表示名（招待時点のスナップショット。後から表示名が
//       変わっても招待自体の文言は変えない＝一覧に本人プロフィールを毎回引き直さずに
//       表示できるようにするための非正規化）
//     recipientUid: 招待された本人のuid（Rules側で「自分宛の招待か」を検証するため、
//       パスのキーと二重に持たせる）
//     roomId: 招待先のルームID
//     createdAt: 送信時刻（サーバータイムスタンプ）
//     expiresAt: 失効時刻（createdAt + INVITE_EXPIRY_MS）
//
// 【招待のキーをroomIdにした理由】「同じ人→同じルームへの招待連打防止」「古い招待を
// 大量に積み上げない」を、複雑な重複排除ロジック無しで自然に満たすため。同じ相手を
// 同じルームへ再度招待すると、新しいデータで上書きされるだけになる（別々のレコードが
// 増え続けることはない）。複数の異なるルーム・複数の招待者からの招待は、それぞれ別の
// roomIdキーとして共存できるため、「複数人から招待が来ていた場合も扱える」も満たす。
//
// 【招待時点ではなく参加時点の最新ルーム状態を利用】この招待データ自体には出題数・
// モード等のルーム設定を一切含めない（roomIdだけを持つ）。実際に参加するときは、
// js/onlineBattle.jsの既存joinRoom()がその時点の最新のルーム状態を読み直して
// 検証するため、招待後にホストが設定を変更していても、参加自体はいつも「今の設定」で
// 行われる（本人指示どおり）。

export const INVITE_EXPIRY_MS = 5 * 60 * 1000; // 5分
export const INVITE_RESEND_COOLDOWN_MS = 30 * 1000; // 30秒

// 招待データ（{createdAt, expiresAt, ...}）と「今」の時刻から、まだ有効かどうかを判定する。
export function isInviteActive(invite, nowMs) {
  if (!invite) return false;
  if (typeof invite.expiresAt !== "number") return false;
  return invite.expiresAt > nowMs;
}

// 招待を新しく送る前に、直近に同じ相手・同じルームへ送った招待（あれば）との
// クールダウンを確認する。existingInviteが無ければ常に送信可（初回招待）。
export function canResendInvite(existingInvite, nowMs) {
  if (!existingInvite) return true;
  if (typeof existingInvite.createdAt !== "number") return true;
  return nowMs - existingInvite.createdAt >= INVITE_RESEND_COOLDOWN_MS;
}

// 新規招待のpayloadを組み立てる（Firebaseへ書き込む直前の材料。createdAt/expiresAtは
// 呼び出し側（js/roomInvites.js）がサーバータイムスタンプと純粋なnowMsの両方を
// 使い分けられるよう、ここでは数値のnowMsだけを受け取って計算する）。
export function buildInvitePayload({ inviterUid, inviterDisplayName, recipientUid, roomId, nowMs }) {
  return {
    inviterUid,
    inviterDisplayName,
    recipientUid,
    roomId,
    createdAt: nowMs,
    expiresAt: nowMs + INVITE_EXPIRY_MS,
  };
}

// 生のinvitesスナップショット（{ [roomId]: inviteData, ... } 形式、または
// null/undefined）から、有効な招待だけを新しい順に並べた配列にする。
// 期限切れの招待は結果に含めない（呼び出し側の表示対象からは自然に除外されるが、
// Firebase側のデータそのものの削除は別途js/roomInvites.jsの掃除ロジックが行う）。
export function listActiveInvites(invitesSnapshotValue, nowMs) {
  if (!invitesSnapshotValue || typeof invitesSnapshotValue !== "object") return [];
  return Object.entries(invitesSnapshotValue)
    .map(([roomId, invite]) => ({ ...invite, roomId }))
    .filter((invite) => isInviteActive(invite, nowMs))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

// 期限切れになった招待のroomId一覧（掃除対象）。listActiveInvites()と対になる関数。
export function listExpiredInviteRoomIds(invitesSnapshotValue, nowMs) {
  if (!invitesSnapshotValue || typeof invitesSnapshotValue !== "object") return [];
  return Object.entries(invitesSnapshotValue)
    .filter(([, invite]) => !isInviteActive(invite, nowMs))
    .map(([roomId]) => roomId);
}
