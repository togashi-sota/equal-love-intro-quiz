// 「一緒に遊ぶ」機能の、Firebaseとやり取りする層（2026-11-XX新設、本人指示）。
// 純粋なロジック（有効期限・並び替え・状態名）はjs/playInvitePayloads.jsに分離してあり、
// このファイルはFirebaseの読み書きだけを担当する（js/roomInvites.jsと同じ分離方針）。
import {
  ref,
  push,
  set,
  get,
  remove,
  update,
  onValue,
  off,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { buildPlayInvitePayload, buildPlayInviteOutboxPayload, PLAY_INVITE_STATUS } from "./playInvitePayloads.js";

// 新しい1対1招待を送る。inviteIdはFirebaseのpush()キー（時系列でほぼ一意、
// 推測が困難）をそのまま使う。
//
// 【2026-11-XX改訂・実機テストで発見：送信者1件制限をFirebaseへ正本化】
// playInviteOutbox/{自分のuid}を先に作成し、それが成功した場合だけ実際の招待を作成する。
// Firebase Rules側（firebase/database.rules.json）で「playInviteOutbox/{uid}は、
// 既存ドキュメントが無いときだけ新規作成できる」という条件にしているため、複数タブ・
// 複数端末から同時に送信しようとしても、どちらか片方しか成立しない（サーバー側で
// 同じパスへの書き込みは順序付けられるため、後勝ちにはならず、最初の1件だけが成功する）。
// 戻り値：{ ok: true, inviteId } または
//   { ok: false, reason: "not-signed-in" | "invalid-arguments" | "already-sending" | "write-failed" }
export async function sendPlayInvite({ recipientUid, recipientDisplayName, inviterDisplayName }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  if (!recipientUid || recipientUid === uid) return { ok: false, reason: "invalid-arguments" };

  const listRef = ref(database, `playInvites/${recipientUid}`);
  const newInviteRef = push(listRef);
  const inviteId = newInviteRef.key;
  const nowMs = Date.now();

  const outboxRef = ref(database, `playInviteOutbox/${uid}`);
  try {
    await set(
      outboxRef,
      buildPlayInviteOutboxPayload({ recipientUid, recipientDisplayName, inviteId, nowMs })
    );
  } catch (error) {
    console.warn("一緒に遊ぶ招待の送信予約に失敗しました", error);
    // 【本人指示：送信者は同時に1件だけ】既に別の招待が進行中で、Rulesに拒否された
    // 可能性が高い（別タブ・別端末からの同時送信を含む）。
    return { ok: false, reason: "already-sending" };
  }

  try {
    const payload = buildPlayInvitePayload({
      inviterUid: uid,
      inviterDisplayName: inviterDisplayName || "フレンド",
      recipientUid,
      nowMs,
    });
    await set(newInviteRef, payload);
    return { ok: true, inviteId };
  } catch (error) {
    console.warn("一緒に遊ぶ招待の送信に失敗しました", error);
    // outboxだけ作られて実際の招待が作れなかった場合、ポインタを残さない（後始末）。
    await remove(outboxRef).catch(() => {});
    return { ok: false, reason: "write-failed" };
  }
}

// 送信者（inviter）が、自分が送った招待を取り消す（またはやり取りが完全に終わった後の
// 後片付けとして呼ぶ）。playInvites側・playInviteOutbox側の両方を消す。
export async function cancelOutgoingPlayInvite({ recipientUid, inviteId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false };
  try {
    await remove(ref(database, `playInviteOutbox/${uid}`));
  } catch (error) {
    console.warn("一緒に遊ぶ招待outboxの取り消しに失敗しました", error);
  }
  if (!recipientUid || !inviteId) return { ok: true };
  try {
    await remove(ref(database, `playInvites/${recipientUid}/${inviteId}`));
    return { ok: true };
  } catch (error) {
    console.warn("一緒に遊ぶ招待の取り消しに失敗しました", error);
    return { ok: false };
  }
}

// 【2026-11-XX新設・実機テストで発見：状態のFirebase正本化】自分（送信者）が今送っている
// 招待へのポインタを継続監視する。ページの再読み込み・バックグラウンド復帰の後も、
// このポインタさえ読めれば「自分は今誰を招待しているか」を復元できる。
// callbackには { recipientUid, recipientDisplayName, inviteId, createdAt } | null が渡る。
// 戻り値：購読解除用の関数。
export function subscribeToMyOutbox(callback) {
  let unsubscribeValue = null;
  let cancelled = false;
  (async () => {
    await authReady;
    if (cancelled) return;
    const uid = getCurrentUid();
    if (!uid) return;
    const outboxRef = ref(database, `playInviteOutbox/${uid}`);
    const handleValue = (snapshot) => callback(snapshot.exists() ? snapshot.val() : null);
    onValue(outboxRef, handleValue);
    unsubscribeValue = () => off(outboxRef, "value", handleValue);
  })();
  return () => {
    cancelled = true;
    if (unsubscribeValue) unsubscribeValue();
  };
}

// 自分（受信者）宛の1対1招待一覧をリアルタイム監視する。callbackには
// playInvites/{自分のuid} の生データをそのまま渡す（js/roomInvites.jsの
// subscribeToMyInvites()と同じ形）。
// 戻り値：購読解除用の関数。
export function subscribeToMyIncomingPlayInvites(callback) {
  let unsubscribeValue = null;
  let cancelled = false;
  (async () => {
    await authReady;
    if (cancelled) return;
    const uid = getCurrentUid();
    if (!uid) return;
    const invitesRef = ref(database, `playInvites/${uid}`);
    const handleValue = (snapshot) => callback(snapshot.exists() ? snapshot.val() : {});
    onValue(invitesRef, handleValue);
    unsubscribeValue = () => off(invitesRef, "value", handleValue);
  })();
  return () => {
    cancelled = true;
    if (unsubscribeValue) unsubscribeValue();
  };
}

// 送信者（inviter）側から、自分が送った1件の招待の変化をリアルタイム監視する
// （playInviteOutboxが指しているinviteIdを、実際に読みに行くための窓口）。
// callbackには、招待データ（存在しなければnull）がそのまま渡る。
// 戻り値：購読解除用の関数。
export function watchPlayInvite({ recipientUid, inviteId }, callback) {
  const inviteRef = ref(database, `playInvites/${recipientUid}/${inviteId}`);
  const handleValue = (snapshot) => callback(snapshot.exists() ? snapshot.val() : null);
  onValue(inviteRef, handleValue);
  return () => off(inviteRef, "value", handleValue);
}

// 受信者側が、自分宛の招待のstatusを書き換える共通処理（参加する／断る／あとで／
// 後から参加する／後からの参加希望を取り消す、のいずれも最終的にはこの1本を通る）。
// Firebase Rules側（$recipientUid === auth.uid かつ、遷移元・遷移先の組み合わせが
// 許可されているものだけ）が実際の妥当性を検証する。ここでは呼び出しの形を揃えるだけ。
async function setMyIncomingInviteStatus(inviteId, status) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid || !inviteId) return { ok: false };
  try {
    await set(ref(database, `playInvites/${uid}/${inviteId}/status`), status);
    return { ok: true };
  } catch (error) {
    console.warn("一緒に遊ぶ招待の状態更新に失敗しました", error);
    return { ok: false };
  }
}

// 受信者が最初の3択のうち「参加する」を押したとき（pending→accepted）。
export function acceptIncomingPlayInvite(inviteId) {
  return setMyIncomingInviteStatus(inviteId, PLAY_INVITE_STATUS.ACCEPTED);
}

// 受信者が「断る」を押したとき（pending/snoozed→declinedByRecipient）。
// 【2026-11-XX改訂・実機テストで発見：送信者への通知を追加】以前はここで即座に
// remove()していたが、それだと送信者側のwatchPlayInvite()が「null（＝データ消失）」しか
// 観測できず、「断られた」のか「期限切れで掃除された」のか区別できなかった。まず
// declinedByRecipientへ状態を書き込み、送信者側がそれを見てトースト表示・
// 後始末（このドキュメント自体の削除）を行う設計にした（js/playInviteUi.js参照）。
export function declineIncomingPlayInvite(inviteId) {
  return setMyIncomingInviteStatus(inviteId, PLAY_INVITE_STATUS.DECLINED_BY_RECIPIENT);
}

// 受信者が「あとで」を押したとき（pending/snoozed→snoozed。既にsnoozedでも無害な冪等操作）。
export function snoozeIncomingPlayInvite(inviteId) {
  return setMyIncomingInviteStatus(inviteId, PLAY_INVITE_STATUS.SNOOZED);
}

// 【2026-11-XX新設・本人指示：あとで→後から参加フロー】受信者が保留中の招待から
// 「参加する」を押したとき（snoozed→joinRequested）。ここではまだルームを作らず、
// 送信者の再承認を待つ。
export function requestJoinPlayInvite(inviteId) {
  return setMyIncomingInviteStatus(inviteId, PLAY_INVITE_STATUS.JOIN_REQUESTED);
}

// 受信者が「（後から参加希望を出したが）取り消す」を押したとき（joinRequested→snoozed）。
export function cancelJoinRequestPlayInvite(inviteId) {
  return setMyIncomingInviteStatus(inviteId, PLAY_INVITE_STATUS.SNOOZED);
}

// 受信者が自分の受信箱からその招待データを消す（期限切れの後片付け・
// declinedBySenderを確認した後の後片付け、の両方で使う）。
export async function removeMyIncomingPlayInvite(inviteId) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid || !inviteId) return;
  try {
    await remove(ref(database, `playInvites/${uid}/${inviteId}`));
  } catch (error) {
    console.warn("一緒に遊ぶ招待の削除に失敗しました", error);
  }
}

// 【2026-11-XX新設・本人指示：あとで→後から参加フロー】送信者側が、受信者からの
// 「後から参加したい」（joinRequested）表明に回答する。
// accept:true→'accepted'（ここでルーム作成フローが始まる）、
// accept:false→'declinedBySender'（「今回はやめる」）。
export async function respondToJoinRequest({ recipientUid, inviteId }, accept) {
  await authReady;
  try {
    await set(
      ref(database, `playInvites/${recipientUid}/${inviteId}/status`),
      accept ? PLAY_INVITE_STATUS.ACCEPTED : PLAY_INVITE_STATUS.DECLINED_BY_SENDER
    );
    return { ok: true };
  } catch (error) {
    console.warn("後からの参加希望への応答に失敗しました", error);
    return { ok: false };
  }
}

// 送信者（inviter）が、受信者の"accepted"を確認した後に新しいルームを作り、
// そのroomIdをこの招待データへ書き戻す（js/playInviteUi.jsのacceptFlow参照）。
// 戻り値：{ ok: true } または { ok: false }。
export async function attachRoomIdToOutgoingPlayInvite({ recipientUid, inviteId, roomId }) {
  await authReady;
  try {
    await set(ref(database, `playInvites/${recipientUid}/${inviteId}/roomId`), roomId);
    return { ok: true };
  } catch (error) {
    console.warn("一緒に遊ぶ招待へのルームID書き込みに失敗しました", error);
    return { ok: false };
  }
}

// 【2026-11-XX新設・実機テストで発見：ルームID受け渡しの競合回避】送信者がroomIdを
// 書き込んだ直後は、outbox（自分側の状態表示）だけを片付け、招待データ本体は消さない。
// もしここで招待データごと消してしまうと、受信者側のonValue購読がroomIdを読み取る
// 前にデータが消えてしまう競合を起こしうる（Firebaseは連続した書き込みを1回の
// 通知へまとめることがあるため）。招待データ本体は、実際に参加した受信者自身が
// 後片付けする（js/playInviteUi.jsのhandleIncomingInvitesUpdate参照）。
export async function clearMyOutboxOnly() {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;
  try {
    await remove(ref(database, `playInviteOutbox/${uid}`));
  } catch (error) {
    console.warn("一緒に遊ぶ招待outboxの後片付けに失敗しました", error);
  }
}

// 送信者側が、招待のやり取りが完全に終わった（断られた・期限切れ・自分が取り消した等）後の
// 後片付けとして、playInvites側のドキュメントとoutboxの両方を消す。
// 【設計メモ】declinedByRecipientを確認した送信者が呼ぶ（js/playInviteUi.js参照）。
// roomId成立時はclearMyOutboxOnly()を使う（上記コメント参照、こちらは使わない）。
export async function finalizeOutgoingPlayInvite({ recipientUid, inviteId }) {
  await authReady;
  const uid = getCurrentUid();
  if (uid) {
    try {
      await remove(ref(database, `playInviteOutbox/${uid}`));
    } catch (error) {
      console.warn("一緒に遊ぶ招待outboxの後片付けに失敗しました", error);
    }
  }
  if (!recipientUid || !inviteId) return;
  try {
    await remove(ref(database, `playInvites/${recipientUid}/${inviteId}`));
  } catch (error) {
    // 既に受信者側が消していた場合等はここで失敗しうるが、実害は無い（後片付けの重複試行）。
  }
}

// 期限切れになった招待をまとめて掃除する（js/roomInvites.jsのcleanupExpiredInvites()と
// 同じ、失敗しても表示上の実害が無い後片付け）。受信者が自分の受信箱に対して呼ぶ。
export async function cleanupExpiredPlayInvites(inviteIds) {
  if (!inviteIds || inviteIds.length === 0) return;
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;
  const updates = {};
  for (const inviteId of inviteIds) {
    updates[`playInvites/${uid}/${inviteId}`] = null;
  }
  try {
    await update(ref(database), updates);
  } catch (error) {
    // 掃除の失敗は無視してよい（js/roomInvites.jsと同じ方針）。
  }
}

// 【2026-11-XX新設・実機テストで発見：オフライン/別ルーム中の再検証】受信者が
// 「あとで」の後に「参加する」を押す直前・送信者が再承認する直前に、送信者の現在の
// 状態を安全に確認するための1回だけの取得。presence（オンライン状態）とルーム在籍
// （rooms/{roomId}/players/{uid}の逆引きは無いため、呼び出し側はplayInviteOutbox等
// 既知の情報と組み合わせて判定する。ここではpresenceの生データだけを返す）。
export async function fetchInviterPresenceOnce(inviterUid) {
  await authReady;
  try {
    const snap = await get(ref(database, `presence/${inviterUid}`));
    return snap.exists() ? snap.val() : null;
  } catch (error) {
    console.warn("送信者のpresence確認に失敗しました", error);
    return null;
  }
}
