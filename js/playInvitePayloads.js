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
//     expiresAt: 失効時刻（createdAt + PLAY_INVITE_EXPIRY_MS。「あとで」→後から参加、の
//       場合も延長しない。本人指示：「そこから新しく5分延長しないでください」）
//     status: PLAY_INVITE_STATUSのいずれか（下記参照）
//     roomId: status:"accepted"になった後、送信者（inviter）が新しいルームを作成してから
//       書き込むフィールド（作成直後はまだ存在しない）
//
//   playInviteOutbox/{inviterUid}/
//     （送信者1人につき、常にこの1件だけ。「今誰を招待しているか」のポインタ）
//     recipientUid, recipientDisplayName, inviteId, createdAt
//
// 【2026-11-XX全面改訂・本人の実機テスト指摘を受けて：状態をFirebaseへ正本化】
// 以前は送信者側の状態（「今誰かを招待中か」「断られた／あとでにされた」等）を
// js/playInviteUi.jsのモジュール変数（メモリ上）だけで管理していた。実機（特にiOSの
// バックグラウンド復帰・ページ再読み込み）では、この購読・変数がリセットされてしまい、
// 「相手が断った／あとでにしたのに、送信者側では『招待しています…』が残り続ける」という
// 実害のあるバグになっていた（本人の実機テストで発見）。
// 対策として、送信者側の状態もplayInviteOutbox/{自分のuid}という新しいFirebaseパスへ
// 正本化する。これにより、ページを再読み込みしても・別タブ/別端末で開いても、
// 「自分が今誰を招待しているか」をFirebaseから毎回復元できる。
// playInviteOutbox/{inviterUid}は1人につき常に1件（＝送信者は同時に1件だけ、という
// 本人指示をFirebase Rules側でも「既存ドキュメントが無いときだけ新規作成できる」という
// 形で強制する。js/playInvites.jsのsendPlayInvite()参照）。
//
// 【本人の実機テストで新規に決定した状態遷移（あとで→後から参加フロー）】
//   pending（送信直後・返事待ち）
//     → 受信者が「参加する」 → accepted（即座に成立、以前からの挙動を維持）
//     → 受信者が「断る」 → declinedByRecipient（送信者へ通知される）
//     → 受信者が「あとで」 → snoozed（送信者の待機は解除されるが、招待自体は有効なまま）
//   snoozed
//     → 受信者が保留チップ経由で「参加する」 → joinRequested（送信者の再承認が必要）
//     → 受信者が保留チップ経由で「断る」 → declinedByRecipient
//   joinRequested（受信者が後から参加したいと表明、送信者の返事待ち）
//     → 受信者が「取り消す」 → snoozed（送信者への再承認通知も消える）
//     → 送信者が「一緒に遊ぶ」 → accepted（ここで初めてルームが作られる）
//     → 送信者が「今回はやめる」 → declinedBySender（受信者へ柔らかく通知）
export const PLAY_INVITE_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED_BY_RECIPIENT: "declinedByRecipient",
  DECLINED_BY_SENDER: "declinedBySender",
  SNOOZED: "snoozed",
  JOIN_REQUESTED: "joinRequested",
};

export const PLAY_INVITE_EXPIRY_MS = 5 * 60 * 1000; // 5分（既存invites/と同じ）
// 受信者が「参加する」を押してから、送信者側がルームを作ってroomIdを書き戻すまでの
// 待ち時間の上限。送信者の端末が既にオフライン・閉じている場合、誰もルームを作らないため
// このタイムアウトが無いと受信者は永久に待たされてしまう（本人指示：「参加する」自体が
// 意思確認、余計な確認は不要、という方針とは別に、失敗時に無反応のままにはしない）。
export const PLAY_INVITE_ROOM_WAIT_TIMEOUT_MS = 10000;
// 表示名（ユーザーが自由入力できる値）を通知の1行に収めるための、控えめな省略の目安。
// 本人指示：「長いユーザー名の場合もレイアウトを壊さず、必要なら通知上では省略表示」。
export const PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH = 12;

// 招待データ（{createdAt, expiresAt, status, ...}）と「今」の時刻から、まだ有効かどうかを判定する。
export function isPlayInviteActive(invite, nowMs) {
  if (!invite) return false;
  if (typeof invite.expiresAt !== "number") return false;
  return invite.expiresAt > nowMs;
}

// 受信者の一覧（バナー・保留チップ）に「未決定の招待」として出してよいかどうか。
// pending/snoozedは受信者がまだ意思決定できる状態。accepted・declinedByRecipient・
// declinedBySender・joinRequestedは、それぞれ別の専用UI（参加処理中／待機中／トースト）が
// 担当するため、通常のバナー一覧からは除外する（本人指示：複数招待が積み上がらないように）。
export function isPlayInviteAwaitingRecipientDecision(invite, nowMs) {
  if (!isPlayInviteActive(invite, nowMs)) return false;
  return invite.status === PLAY_INVITE_STATUS.PENDING || invite.status === PLAY_INVITE_STATUS.SNOOZED;
}

// 新規招待のpayloadを組み立てる（Firebaseへ書き込む直前の材料）。
export function buildPlayInvitePayload({ inviterUid, inviterDisplayName, recipientUid, nowMs }) {
  return {
    inviterUid,
    inviterDisplayName,
    recipientUid,
    createdAt: nowMs,
    expiresAt: nowMs + PLAY_INVITE_EXPIRY_MS,
    status: PLAY_INVITE_STATUS.PENDING,
  };
}

// playInviteOutbox/{inviterUid}のpayload。
export function buildPlayInviteOutboxPayload({ recipientUid, recipientDisplayName, inviteId, nowMs }) {
  return { recipientUid, recipientDisplayName, inviteId, createdAt: nowMs };
}

// 生のplayInvitesスナップショット（{ [inviteId]: inviteData, ... } 形式、または
// null/undefined）から、受信者がまだ意思決定できる（pending/snoozedの）有効な招待だけを
// 新しい順に並べた配列にする（js/roomInvitePayloads.jsのlistActiveInvites()と同じ考え方）。
export function listActivePlayInvites(invitesSnapshotValue, nowMs) {
  if (!invitesSnapshotValue || typeof invitesSnapshotValue !== "object") return [];
  return Object.entries(invitesSnapshotValue)
    .map(([inviteId, invite]) => ({ ...invite, inviteId }))
    .filter((invite) => isPlayInviteAwaitingRecipientDecision(invite, nowMs))
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

// 期限切れになった招待のinviteId一覧（掃除対象）。有効期限が過ぎていれば、statusを問わず
// 掃除してよい（送信者・受信者どちらの後片付け経路からも安全に呼べる）。
export function listExpiredPlayInviteIds(invitesSnapshotValue, nowMs) {
  if (!invitesSnapshotValue || typeof invitesSnapshotValue !== "object") return [];
  return Object.entries(invitesSnapshotValue)
    .filter(([, invite]) => !isPlayInviteActive(invite, nowMs))
    .map(([inviteId]) => inviteId);
}

// 表示名を通知1行向けに短く整形する（本人指示：長いユーザー名でもレイアウトを壊さない）。
export function truncateDisplayNameForNotice(displayName) {
  const name = typeof displayName === "string" && displayName.length > 0 ? displayName : "フレンド";
  if (name.length <= PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH) return name;
  return `${name.slice(0, PLAY_INVITE_DISPLAY_NAME_MAX_LENGTH)}…`;
}
