// 「🔇 音が出ない」救済ボタン・第2段階（オンライン対戦：一瞬バトル・一瞬協力）の
// 「Firebaseデータ層」（2026-09-17新設、本人指示）。
//
// 【位置づけ】js/audioTroubleRecovery.js（Firebase不使用の進行ロジック）が「誰が・
// いつ・何をすべきか」の判定を担う。このファイルはその判定結果を実際にFirebase
// Realtime Databaseへ保存・同期するための薄い層に徹する（判定ロジックをここへ
// 重複させない）。js/instantBattleFirebase.js・js/instantCoopBattleFirebase.jsと
// 同じ設計方針（authReadyを待ってから getCurrentUid・読む→条件確認→書く・失敗時は
// 間隔を空けて再試行〈最大3回〉・runTransaction()は使わない）に厳密に従う。
//
// 【一瞬バトル・一瞬協力の両方から共有する理由】このパス（matches/{matchId}/
// audioTroubleRecovery）はどちらのモードでも全く同じデータ形・全く同じ進行判定
// （js/audioTroubleRecovery.js）を使うため、js/lyricsQuizBattleFirebase.jsの
// reportQuestionActivity()・forceSkipIdlePlayer()（歌詞クイズ・一瞬バトル・一瞬協力の
// 3モードが共有する3分無操作救済）と同じく、モードをまたいで1つのファイルを共有する。

import {
  ref,
  set,
  get,
  update,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";

export const AUDIO_TROUBLE_RECOVERY_FAILURE_REASON = {
  NOT_SIGNED_IN: "not-signed-in",
  NOT_FOUND: "not-found",
  NOT_HOST: "not-host",
  STALE_MATCH: "stale-match",
  PERMISSION_DENIED: "permission-denied",
  NETWORK_ERROR: "network-error",
};

const REASON = AUDIO_TROUBLE_RECOVERY_FAILURE_REASON;

// 参加者：「音が出ない」を申告する。write-once（同じ(questionIndex, attemptSlot)への
// 2回目以降の書き込みはFirebase Rulesが拒否する。js/instantBattleFirebase.jsの
// submitInstantAnswer()と同じ「拒否理由はPERMISSION_DENIEDとして返る」設計）。
// attemptSlotはjs/audioTroubleRecovery.jsのcomputeNextReportAttemptSlot()で計算した値を
// 呼び出し元（各画面）が渡す。
export async function reportAudioTroubleRecovery({ roomId, matchId, questionIndex, attemptSlot }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  try {
    await set(
      ref(database, `rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/reports/${questionIndex}/${attemptSlot}`),
      { uid, reportedAt: serverTimestamp() }
    );
    return { ok: true };
  } catch (error) {
    if (error?.code === "PERMISSION_DENIED") return { ok: false, reason: REASON.PERMISSION_DENIED };
    return { ok: false, reason: REASON.NETWORK_ERROR };
  }
}

// ホスト：新しい申告を検知し、リカバリー再生を開始する（status:"replaying"へ遷移）。
// js/instantBattleFirebase.jsのstartInstantBattleQuestion()と同じ「読む→ホスト・matchId
// 確認→書く、失敗時は間隔を空けて最大3回再試行、既に目標状態なら冪等に成功扱い」構造。
export async function startAudioTroubleRecoveryReplay({ roomId, matchId, questionIndex, attemptCount, reportedByUid }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
      if (!roomSnapshot.exists()) return { ok: false, reason: REASON.NOT_FOUND };
      const room = roomSnapshot.val();
      if (room.host !== uid) return { ok: false, reason: REASON.NOT_HOST };
      if (room.activeMatchId !== matchId) return { ok: false, reason: REASON.STALE_MATCH };

      const existing = room.matches?.[matchId]?.audioTroubleRecovery;
      if (
        existing?.status === "replaying" &&
        existing?.questionIndex === questionIndex &&
        existing?.attemptCount === attemptCount
      ) {
        return { ok: true }; // 既に目標状態（再送時の冪等性）
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/status`]: "replaying",
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/questionIndex`]: questionIndex,
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/attemptCount`]: attemptCount,
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/reportedByUid`]: reportedByUid,
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/startedAt`]: serverTimestamp(),
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// ホスト：リカバリー再生の待機時間が終わった。通常の進行（回答ロック解除・tick()再開）を
// 再開してよい状態（"resolved"）に戻す。
export async function finishAudioTroubleRecoveryReplay({ roomId, matchId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
      if (!roomSnapshot.exists()) return { ok: false, reason: REASON.NOT_FOUND };
      const room = roomSnapshot.val();
      if (room.host !== uid) return { ok: false, reason: REASON.NOT_HOST };
      if (room.activeMatchId !== matchId) return { ok: false, reason: REASON.STALE_MATCH };

      if (room.matches?.[matchId]?.audioTroubleRecovery?.status === "resolved") {
        return { ok: true }; // 既に目標状態
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/status`]: "resolved",
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/resolvedAt`]: serverTimestamp(),
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// ホスト：安全な回数リカバリー再生を試みても改善しなかったため、予備曲へ静かに
// 差し替える（実際の差し替え自体は、呼び出し元が既存のreportInstantBattleAudioFailure()/
// reportAudioFailure()を別途呼ぶ。この関数はaudioTroubleRecovery側の記録
// 〈swapCountを1つ進め、status:"resolved"に戻す〉だけを担当する）。
export async function markAudioTroubleRecoverySwapped({ roomId, matchId, swapCount }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
      if (!roomSnapshot.exists()) return { ok: false, reason: REASON.NOT_FOUND };
      const room = roomSnapshot.val();
      if (room.host !== uid) return { ok: false, reason: REASON.NOT_HOST };
      if (room.activeMatchId !== matchId) return { ok: false, reason: REASON.STALE_MATCH };

      if ((room.matches?.[matchId]?.audioTroubleRecovery?.swapCount ?? 0) >= swapCount) {
        return { ok: true }; // 既に目標状態（再送時の冪等性）
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/status`]: "resolved",
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/swapCount`]: swapCount,
        [`rooms/${roomId}/matches/${matchId}/audioTroubleRecovery/resolvedAt`]: serverTimestamp(),
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}
