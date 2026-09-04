// 「一緒に遊ぶ」機能の、Firebaseとやり取りする層（2026-11-XX新設、本人指示）。
// 純粋なロジック（有効期限・並び替え）はjs/playInvitePayloads.jsに分離してあり、
// このファイルはFirebaseの読み書きだけを担当する（js/roomInvites.jsと同じ分離方針）。
import {
  ref,
  push,
  set,
  remove,
  update,
  onValue,
  off,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { buildPlayInvitePayload } from "./playInvitePayloads.js";

// 新しい1対1招待を送る。inviteIdはFirebaseのpush()キー（時系列でほぼ一意、
// 推測が困難）をそのまま使う。
// 戻り値：{ ok: true, inviteId } または
//   { ok: false, reason: "not-signed-in" | "invalid-arguments" | "write-failed" }
export async function sendPlayInvite({ recipientUid, inviterDisplayName }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  if (!recipientUid || recipientUid === uid) return { ok: false, reason: "invalid-arguments" };

  const listRef = ref(database, `playInvites/${recipientUid}`);
  const newInviteRef = push(listRef);
  const inviteId = newInviteRef.key;
  try {
    const payload = buildPlayInvitePayload({
      inviterUid: uid,
      inviterDisplayName: inviterDisplayName || "フレンド",
      recipientUid,
      nowMs: Date.now(),
    });
    await set(newInviteRef, payload);
    return { ok: true, inviteId };
  } catch (error) {
    console.warn("一緒に遊ぶ招待の送信に失敗しました", error);
    return { ok: false, reason: "write-failed" };
  }
}

// 送信者（inviter）が、自分が送った招待を取り消す。
// 【本人指示：招待を取り消す】recipient側のバナーからも即座に消える（Firebase上の
// データそのものを消すため、recipient側のonValue購読が自動的に検知する）。
export async function cancelOutgoingPlayInvite({ recipientUid, inviteId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid || !recipientUid || !inviteId) return { ok: false };
  try {
    await remove(ref(database, `playInvites/${recipientUid}/${inviteId}`));
    return { ok: true };
  } catch (error) {
    console.warn("一緒に遊ぶ招待の取り消しに失敗しました", error);
    return { ok: false };
  }
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

// 受信者が「断る」を押したときに、自分宛のその招待データを消す。
export async function declineIncomingPlayInvite(inviteId) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid || !inviteId) return;
  try {
    await remove(ref(database, `playInvites/${uid}/${inviteId}`));
  } catch (error) {
    console.warn("一緒に遊ぶ招待の辞退に失敗しました", error);
  }
}

// 受信者が「参加する」を押したときに呼ぶ。ルームはまだ作らず、statusを
// "pending"→"accepted"へ書き換えるだけ（実際のルーム作成は送信者側が行う。
// js/playInvitePayloads.js冒頭のコメント参照）。
// 戻り値：{ ok: true } または { ok: false }（Rules側で拒否された＝招待が既に無効、等）。
export async function acceptIncomingPlayInvite(inviteId) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid || !inviteId) return { ok: false };
  try {
    await set(ref(database, `playInvites/${uid}/${inviteId}/status`), "accepted");
    return { ok: true };
  } catch (error) {
    console.warn("一緒に遊ぶ招待への参加表明に失敗しました", error);
    return { ok: false };
  }
}

// 送信者（inviter）側から、自分が送った1件の招待の変化（受信者がstatusを"accepted"へ
// 変えた・受信者やFirebase上のデータが消えた等）をリアルタイム監視する。
// callbackには、招待データ（存在しなければnull）がそのまま渡る。
// 戻り値：購読解除用の関数。
export function watchOutgoingPlayInvite({ recipientUid, inviteId }, callback) {
  const inviteRef = ref(database, `playInvites/${recipientUid}/${inviteId}`);
  const handleValue = (snapshot) => callback(snapshot.exists() ? snapshot.val() : null);
  onValue(inviteRef, handleValue);
  return () => off(inviteRef, "value", handleValue);
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

// 期限切れになった招待をまとめて掃除する（js/roomInvites.jsのcleanupExpiredInvites()と
// 同じ、失敗しても表示上の実害が無い後片付け）。
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
