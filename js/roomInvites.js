// ルーム招待（フレンドを、今のオンライン対戦ルームへ招待する）機能の、Firebaseとやり取りする層
// （2026-11-XX新設、本人指示）。純粋なロジック（有効期限・クールダウン判定・並び替え）は
// js/roomInvitePayloads.jsに分離してあり、このファイルはFirebaseの読み書きだけを担当する
// （js/presenceSync.js・js/presencePayloads.jsと同じ分離方針）。
//
// 【本人指示：招待はホスト・ゲストを問わず「今このルームにいる人」から送れる】送信元が
// ホストかどうかはこのファイルでは一切判定しない（UI側で「ルームに入っている間だけ
// 招待ボタンを出す」という形で自然に制限する）。
//
// 【本人指示：招待経由なら合言葉（ルームコード）入力は不要】招待を受け取った側は
// js/onlineBattleScreen.jsの既存joinRoom()をそのまま呼ぶだけで参加できる（招待データ自体は
// roomIdしか持たないため、参加時点の最新のルーム状態で毎回検証される。詳しい設計理由は
// js/roomInvitePayloads.js冒頭のコメント参照）。
import {
  ref,
  set,
  get,
  remove,
  update,
  onValue,
  off,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { buildInvitePayload, canResendInvite } from "./roomInvitePayloads.js";

// 招待を1件送る（または、クールダウンが明けていれば送り直す）。
// 戻り値：{ ok: true } または
//   { ok: false, reason: "not-signed-in" | "invalid-arguments" | "cooldown" | "write-failed" }
export async function sendRoomInvite({ roomId, recipientUid, inviterDisplayName }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: "not-signed-in" };
  if (!roomId || !recipientUid || recipientUid === uid) return { ok: false, reason: "invalid-arguments" };

  const inviteRef = ref(database, `invites/${recipientUid}/${roomId}`);
  try {
    const existingSnapshot = await get(inviteRef);
    const existing = existingSnapshot.exists() ? existingSnapshot.val() : null;
    if (!canResendInvite(existing, Date.now())) {
      return { ok: false, reason: "cooldown" };
    }
    const payload = buildInvitePayload({
      inviterUid: uid,
      inviterDisplayName: inviterDisplayName || "フレンド",
      recipientUid,
      roomId,
      nowMs: Date.now(),
    });
    await set(inviteRef, payload);
    return { ok: true };
  } catch (error) {
    console.warn("ルーム招待の送信に失敗しました", error);
    return { ok: false, reason: "write-failed" };
  }
}

// 自分宛の招待一覧をリアルタイム監視する。callbackには invites/{自分のuid} の生データ
// （{ [roomId]: inviteData, ... } 形式、または一件も無ければ{}）をそのまま渡す
// （表示用の変換・期限切れの除外はjs/roomInvitePayloads.jsの関数を呼び出し側で使う）。
// 戻り値：購読解除用の関数（js/presenceSync.jsのsubscribeToAllPresence()と同じ形）。
export function subscribeToMyInvites(callback) {
  let unsubscribeValue = null;
  let cancelled = false;
  (async () => {
    await authReady;
    if (cancelled) return;
    const uid = getCurrentUid();
    if (!uid) return;
    const invitesRef = ref(database, `invites/${uid}`);
    const handleValue = (snapshot) => callback(snapshot.exists() ? snapshot.val() : {});
    onValue(invitesRef, handleValue);
    unsubscribeValue = () => off(invitesRef, "value", handleValue);
  })();
  return () => {
    cancelled = true;
    if (unsubscribeValue) unsubscribeValue();
  };
}

// 招待に応答した（参加した／辞退した）ときに、自分宛のその招待データを消す。
// 参加を伴う場合は、実際の参加（js/onlineBattleScreen.jsのjoinRoomFromInvite）が
// 成功した後に呼び出し側が呼ぶ想定（参加に失敗した場合は招待を残し、再挑戦できるようにする）。
export async function removeMyInvite(roomId) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;
  try {
    await remove(ref(database, `invites/${uid}/${roomId}`));
  } catch (error) {
    console.warn("招待の削除に失敗しました", error);
  }
}

// 期限切れになった招待をまとめて掃除する（表示側でjs/roomInvitePayloads.jsの
// listExpiredInviteRoomIds()を使って対象を割り出し、ここへ渡す想定）。呼び出し側の表示は
// 既にlistActiveInvites()側で期限切れを除外済みのため、これは純粋な後片付け（失敗しても
// 表示上の実害は無い）であり、await必須にはしない。
export async function cleanupExpiredInvites(roomIds) {
  if (!roomIds || roomIds.length === 0) return;
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return;
  const updates = {};
  for (const roomId of roomIds) {
    updates[`invites/${uid}/${roomId}`] = null;
  }
  try {
    await update(ref(database), updates);
  } catch (error) {
    // 掃除の失敗は無視してよい（次回listActiveInvites()が呼ばれたときも、期限切れとして
    // 表示からは除外され続けるため、実害はない）。
  }
}
