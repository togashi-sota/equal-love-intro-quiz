// 一瞬バトル オンライン対戦の「Firebaseデータ層」（2026-09-15新設、本人指示：一瞬バトルの
// 同期方式への全面書き換え）。
//
// 【位置づけ】js/instantBattleMatchProgress.js（Firebase不使用の進行エンジン、恒久テスト済み）が
// 「1試合分の進行ロジックが正しいこと」を既に保証している。このファイルはその進行ロジックを
// Firebase Realtime Databaseへ実際に保存・同期するための薄い層に徹する（判定ロジックを
// ここへ重複させない）。js/instantCoopBattleFirebase.jsと同じ設計方針（authReadyを待ってから
// getCurrentUid・読む→条件確認→書く・失敗時は間隔を空けて再試行〈最大3回〉・
// runTransaction()は使わない）に厳密に従う。
//
// 【一瞬協力・歌詞クイズとの書き込み先の使い分け】
// ・currentQuestionIndex・currentQuestionStartedAt・questionStatus・resolvedAtは、
//   他のオンライン対戦と全く同じ汎用パス（rooms/{roomId}/matches/{matchId}/配下、
//   gameModeを問わない既存のFirebase Rules）をそのまま使う。新しいRulesは不要。
// ・instantAnswers・instantQuestionOutcomes・instantBattleResultsは、一瞬バトル専用の
//   新しいパス（Firebase Rules側にも追加が必要）。
// ・audioFailuresは、一瞬協力と全く同じ汎用パス（js/instantCoopBattleFirebase.jsの
//   reportAudioFailure()と同じ形）をそのまま使う（既にFirebase Rulesへ登録済み）。

import {
  ref,
  set,
  get,
  update,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { UNKNOWN_ANSWER } from "./instantBattleMatchProgress.js";

export { UNKNOWN_ANSWER };

export const QUESTION_STATUS = { ACTIVE: "active", RESOLVED: "resolved" };

export const FIREBASE_FAILURE_REASON = {
  NOT_SIGNED_IN: "not-signed-in",
  NOT_FOUND: "not-found",
  NOT_HOST: "not-host",
  STALE_MATCH: "stale-match",
  STALE_QUESTION: "stale-question",
  QUESTION_RESOLVED: "question-resolved",
  ALREADY_ANSWERED: "already-answered",
  NOT_PARTICIPANT: "not-participant",
  PERMISSION_DENIED: "permission-denied",
  NETWORK_ERROR: "network-error",
};

const REASON = FIREBASE_FAILURE_REASON;

// ホストが問題を開始する（新しい問題の開始・次の問題への進行の両方で使う）。
export async function startInstantBattleQuestion({ roomId, matchId, questionIndex }) {
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

      const match = room.matches?.[matchId];
      if (match?.currentQuestionIndex === questionIndex && match?.questionStatus === QUESTION_STATUS.ACTIVE) {
        return { ok: true }; // 既に目標状態（再送時の冪等性）
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/currentQuestionIndex`]: questionIndex,
        [`rooms/${roomId}/matches/${matchId}/currentQuestionStartedAt`]: serverTimestamp(),
        [`rooms/${roomId}/matches/${matchId}/questionStatus`]: QUESTION_STATUS.ACTIVE,
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// 本人の回答を書き込む（write-once：既に回答済みなら拒否）。selectedSongIdは
// UNKNOWN_ANSWERの場合もある（js/instantBattleMatchProgress.js参照）。
export async function submitInstantAnswer({ roomId, matchId, questionIndex, selectedSongId, replayCount }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  let room;
  try {
    const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
    room = roomSnapshot.exists() ? roomSnapshot.val() : null;
  } catch (error) {
    return { ok: false, reason: REASON.NETWORK_ERROR };
  }
  if (!room) return { ok: false, reason: REASON.NOT_FOUND };
  if (room.activeMatchId !== matchId) return { ok: false, reason: REASON.STALE_MATCH };
  const match = room.matches?.[matchId];
  if (!match) return { ok: false, reason: REASON.STALE_MATCH };
  if (match.currentQuestionIndex !== questionIndex) return { ok: false, reason: REASON.STALE_QUESTION };
  if (match.questionStatus !== QUESTION_STATUS.ACTIVE) return { ok: false, reason: REASON.QUESTION_RESOLVED };
  if (!match.participants?.[uid]) return { ok: false, reason: REASON.NOT_PARTICIPANT };
  if (match.instantAnswers?.[questionIndex]?.[uid]) return { ok: false, reason: REASON.ALREADY_ANSWERED };

  try {
    await set(ref(database, `rooms/${roomId}/matches/${matchId}/instantAnswers/${questionIndex}/${uid}`), {
      selectedSongId,
      replayCount,
      submittedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    if (error?.code === "PERMISSION_DENIED") return { ok: false, reason: REASON.PERMISSION_DENIED };
    return { ok: false, reason: REASON.NETWORK_ERROR };
  }
}

// ホストが現在の問題を確定する（questionStatus→resolved、答え合わせ用にoutcomeも一緒に書く）。
export async function resolveInstantBattleQuestion({ roomId, matchId, questionIndex, outcome }) {
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

      if (room.matches?.[matchId]?.questionStatus === QUESTION_STATUS.RESOLVED) {
        return { ok: true }; // 既に目標状態
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/questionStatus`]: QUESTION_STATUS.RESOLVED,
        [`rooms/${roomId}/matches/${matchId}/resolvedAt`]: serverTimestamp(),
        [`rooms/${roomId}/matches/${matchId}/instantQuestionOutcomes/${questionIndex}`]: outcome,
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// ホストが次の問題へ進める。
export async function advanceInstantBattleQuestion({ roomId, matchId, nextQuestionIndex }) {
  return startInstantBattleQuestion({ roomId, matchId, questionIndex: nextQuestionIndex });
}

// 【音源再生失敗時の公平性対策】自分の音源が今の問題で正常に再生できなかったことを報告する。
// js/instantCoopBattleFirebase.jsのreportAudioFailure()と全く同じ形・同じFirebaseパス
// （gameModeを問わない汎用パスとして既にRulesへ登録済みのため、新しいRulesは不要）。
export async function reportInstantBattleAudioFailure({ roomId, matchId, questionIndex }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  try {
    await set(ref(database, `rooms/${roomId}/matches/${matchId}/audioFailures/${questionIndex}/${uid}`), true);
    return { ok: true };
  } catch (error) {
    if (error?.code === "PERMISSION_DENIED") return { ok: false, reason: REASON.PERMISSION_DENIED };
    return { ok: false, reason: REASON.NETWORK_ERROR };
  }
}

// ホストが、音源再生失敗の続発により対戦を安全に中断したことを全員へ伝える。
// js/instantCoopBattleFirebase.jsのabortCoopMatchDueToAudioFailure()と同じ考え方。
export async function abortInstantBattleMatchDueToAudioFailure({ roomId, matchId }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
      const room = roomSnapshot.exists() ? roomSnapshot.val() : null;
      if (!room) return { ok: false, reason: REASON.NOT_FOUND };
      if (room.host !== uid) return { ok: false, reason: REASON.NOT_HOST };
      if (room.activeMatchId !== matchId) return { ok: false, reason: REASON.STALE_MATCH };
      if (room.status === "result") return { ok: true }; // 既に目標状態（冪等性）

      await update(ref(database), {
        [`rooms/${roomId}/status`]: "result",
        [`rooms/${roomId}/matches/${matchId}/instantBattleAudioFailureAborted`]: true,
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// ホストが最終結果（全員分）を確定する。room.statusとinstantBattleResultsを同じ
// update()でまとめて書き、中間状態を避ける（js/instantCoopBattleFirebase.jsの
// finalizeCoopMatch()と同じ考え方。resultsByUidはjs/instantBattleMatchProgress.jsの
// computeFinalResults()の戻り値をそのまま渡す想定）。
export async function finalizeInstantBattleMatch({ roomId, matchId, resultsByUid }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
      const room = roomSnapshot.exists() ? roomSnapshot.val() : null;
      if (!room) return { ok: false, reason: REASON.NOT_FOUND };
      if (room.host !== uid) return { ok: false, reason: REASON.NOT_HOST };
      if (room.activeMatchId !== matchId) return { ok: false, reason: REASON.STALE_MATCH };
      if (room.status === "result") return { ok: true }; // 既に目標状態（ホストの再試行を含む冪等性）

      await update(ref(database), {
        [`rooms/${roomId}/status`]: "result",
        [`rooms/${roomId}/matches/${matchId}/instantBattleResults`]: resultsByUid,
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}
