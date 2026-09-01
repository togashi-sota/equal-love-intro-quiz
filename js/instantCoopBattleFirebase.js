// 一瞬協力 オンライン対戦の「Firebaseデータ層」（2026-08-31新設、本人指示：19-3章）。
//
// 【位置づけ】js/instantCoopMatchProgress.js（Firebase不使用の進行エンジン、恒久テスト済み）が
// 「1試合分の進行ロジックが正しいこと」を既に保証している。このファイルはその進行ロジックを
// Firebase Realtime Databaseへ実際に保存・同期するための薄い層に徹する（判定ロジックを
// ここへ重複させない）。js/lyricsQuizBattleFirebase.jsと同じ設計方針（authReadyを待ってから
// getCurrentUid・読む→条件確認→書く・失敗時は間隔を空けて再試行〈最大3回〉・
// runTransaction()は使わない）に厳密に従う。
//
// 【一瞬バトル・歌詞クイズとの書き込み先の使い分け】
// ・currentQuestionIndex・currentQuestionStartedAt・questionStatus・resolvedAtは、
//   歌詞クイズと全く同じ汎用パス（rooms/{roomId}/matches/{matchId}/配下、gameModeを
//   問わない既存のFirebase Rules）をそのまま使う。新しいRulesは不要。
// ・coopVotes・coopRoundNumber・coopQuestionOutcomes・coopTeamResultは、一瞬協力専用の
//   新しいパス（Firebase Rules側にも追加が必要）。
//
// 【coopVotesがquestionIndexだけでなくroundNumberでも分かれている理由】同数タイの場合、
// 同じ問題（questionIndex）のまま再投票が起こる（本人指示：共有の再視聴→再投票、最大2回）。
// 投票欄は「本人だけが1回だけ書ける」write-once方式のため、再投票のたびに新しい書き込み先が
// 必要になる。questionIndexはそのまま、roundNumber（0始まり、再視聴のたびに+1）を
// 組み合わせたパスにすることで、削除・上書きを一切行わずに再投票を実現している。

import {
  ref,
  set,
  get,
  update,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { UNKNOWN_VOTE } from "./instantCoopMatchProgress.js";

export { UNKNOWN_VOTE };

export const QUESTION_STATUS = { ACTIVE: "active", RESOLVED: "resolved" };

export const FIREBASE_FAILURE_REASON = {
  NOT_SIGNED_IN: "not-signed-in",
  NOT_FOUND: "not-found",
  NOT_HOST: "not-host",
  STALE_MATCH: "stale-match",
  STALE_QUESTION: "stale-question",
  STALE_ROUND: "stale-round",
  QUESTION_RESOLVED: "question-resolved",
  ALREADY_VOTED: "already-voted",
  NOT_PARTICIPANT: "not-participant",
  PERMISSION_DENIED: "permission-denied",
  NETWORK_ERROR: "network-error",
};

const REASON = FIREBASE_FAILURE_REASON;

// ホストが問題を開始する（新しい問題の開始・「もう一度聞く」を挟まない通常の次の問題への
// 進行の両方で使う）。coopRoundNumberを0へ戻すのは、この問題の1回目の投票ラウンドだから。
export async function startCoopQuestion({ roomId, matchId, questionIndex }) {
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
      if (match?.currentQuestionIndex === questionIndex && match?.questionStatus === QUESTION_STATUS.ACTIVE && (match?.coopRoundNumber ?? 0) === 0) {
        return { ok: true }; // 既に目標状態（再送時の冪等性）
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/currentQuestionIndex`]: questionIndex,
        [`rooms/${roomId}/matches/${matchId}/currentQuestionStartedAt`]: serverTimestamp(),
        [`rooms/${roomId}/matches/${matchId}/questionStatus`]: QUESTION_STATUS.ACTIVE,
        [`rooms/${roomId}/matches/${matchId}/coopRoundNumber`]: 0,
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// ホストが「もう一度聞く→再投票」のラウンドへ進める（同じquestionIndexのまま、
// coopRoundNumberだけを+1する）。
export async function startNextCoopVotingRound({ roomId, matchId, nextRoundNumber }) {
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
      if ((match?.coopRoundNumber ?? 0) >= nextRoundNumber) {
        return { ok: true }; // 既に目標状態（再送時の冪等性）
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/coopRoundNumber`]: nextRoundNumber,
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// 本人の投票を書き込む（write-once：既にこのラウンドで投票済みなら拒否）。
export async function submitCoopVote({ roomId, matchId, questionIndex, roundNumber, vote }) {
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
  if ((match.coopRoundNumber ?? 0) !== roundNumber) return { ok: false, reason: REASON.STALE_ROUND };
  if (match.questionStatus !== QUESTION_STATUS.ACTIVE) return { ok: false, reason: REASON.QUESTION_RESOLVED };
  if (!match.participants?.[uid]) return { ok: false, reason: REASON.NOT_PARTICIPANT };
  if (match.coopVotes?.[questionIndex]?.[roundNumber]?.[uid]) return { ok: false, reason: REASON.ALREADY_VOTED };

  try {
    await set(ref(database, `rooms/${roomId}/matches/${matchId}/coopVotes/${questionIndex}/${roundNumber}/${uid}`), {
      selectedSongId: vote,
      submittedAt: serverTimestamp(),
    });
    return { ok: true };
  } catch (error) {
    if (error?.code === "PERMISSION_DENIED") return { ok: false, reason: REASON.PERMISSION_DENIED };
    return { ok: false, reason: REASON.NETWORK_ERROR };
  }
}

// ホストが現在の問題を確定する（questionStatus→resolved、正解表示用にoutcomeも一緒に書く）。
export async function resolveCoopQuestion({ roomId, matchId, questionIndex, outcome }) {
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
        [`rooms/${roomId}/matches/${matchId}/coopQuestionOutcomes/${questionIndex}`]: outcome,
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
export async function advanceCoopQuestion({ roomId, matchId, nextQuestionIndex }) {
  return startCoopQuestion({ roomId, matchId, questionIndex: nextQuestionIndex });
}

// 【2026-09-09新設・本人指示：音源再生失敗時の公平性対策】自分の音源が今の問題で正常に
// 再生できなかったことを報告する。ホストの進行ミラー（js/instantCoopMatchProgress.js）が
// これを見て、その問題を「音源を正常に再生できない参加者がいたため無効」として全員一律に
// 扱う（誰の得点・正解数・ペナルティにも影響させず、出題数も消費しない）。
// write-once（1人1問題につき1回）：連打・再試行で複数回呼ばれても実害が無いようにする。
// 【本人操作が必要】このパス（matches/{matchId}/audioFailures）はFirebase Rulesにまだ
// 登録していないため、Rulesを公開するまではPERMISSION_DENIEDで失敗する
// （失敗しても対戦の進行自体は止めない設計。docs/HANDOFF.md・最終報告のRules案を参照）。
export async function reportAudioFailure({ roomId, matchId, questionIndex }) {
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
// finalizeCoopMatch()と同じくroom.status→"result"にして結果画面への自動遷移に乗せるが、
// coopTeamResultは書かず、代わりにaudioFailureAbortedフラグだけを立てる（結果画面側が
// このフラグを見て、通常の成績表示ではなく中断案内を出す。プレイ履歴への保存も
// このフラグがある場合はスキップする設計）。
export async function abortCoopMatchDueToAudioFailure({ roomId, matchId }) {
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
        [`rooms/${roomId}/matches/${matchId}/coopTeamResult`]: { totalQuestions: 0, correctCount: 0, totalSharedReplayCount: 0, audioFailureAborted: true },
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// ホストが最終結果（チーム全体で1つ）を確定する。room.statusとcoopTeamResultを同じ
// update()でまとめて書き、中間状態を避ける（js/lyricsQuizBattleFirebase.jsのfinalizeLyricsQuizMatchと
// 同じ考え方）。
export async function finalizeCoopMatch({ roomId, matchId, teamResult }) {
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
        [`rooms/${roomId}/matches/${matchId}/coopTeamResult`]: teamResult,
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}
