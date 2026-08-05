// 歌詞クイズ オンライン対戦の「Firebaseデータ層」（Phase4）。
//
// 【位置づけ】js/lyricsQuizMatchProgress.js（Phase3、Firebase不使用の進行エンジン）が
// 「1試合分の進行ロジックが正しいこと」を既に恒久テストで保証している。このファイルは
// その進行ロジックをFirebase Realtime Databaseへ実際に保存・同期するための薄い層に
// 徹する（判定ロジックをここへ重複させない）。
//
// 【設計方針の継承】js/onlineBattle.jsと同じ規約に厳密に従う：
//   ・authReadyを待ってからgetCurrentUid()
//   ・書き込みは「読む→条件確認→書く」＋失敗時は間隔を空けて再試行（最大3回）
//   ・runTransaction()は使わない（過去の不具合、設計⑧②で詳述）
//   ・書き込み一発勝負（!data.exists()相当の考え方）で「早い者勝ち」を実現する箇所
//     （回答ログ・奪い取りclaim）はセキュリティルール側で保証し、クライアント側は
//     「本人の分だけ・現在の問題だけ」書くという最小限の配慮に留める
// このファイル自身はjs/onlineBattle.jsを一切importせず、既存のオンライン対戦コードには
// 触れない（新設のパスだけを扱う、完全に独立したデータ層）。
//
// 【設計⑫⑤：失敗理由の統一】どの関数も例外をそのまま投げず、必ず
// { ok: false, reason } を返す。reasonはjs/lyricsQuizBattleFirebasePayloads.jsの
// FIREBASE_FAILURE_REASONのいずれかで、isRetryableFailureReason(reason)で
// 「再試行してよいか」を機械的に判定できる（network-errorだけが再試行可）。
// answers・questionClaims等、セキュリティルールが「拒否した理由」を教えてくれない
// 書き込みについては、実際に書く前にroomスナップショットを読んで事前チェックし
// （checkAnswerSubmissionAllowed等）、より具体的な理由を返せるようにしている。
//
// 【ペイロード組み立て・事前チェックロジックの分離について】実際にFirebaseへ送る中身の
// 組み立てと、書き込み前の事前チェックはjs/lyricsQuizBattleFirebasePayloads.js
// （Firebaseに一切触れない純粋関数）に分離してある。このファイルはFirebase SDKを
// importした時点でアプリの初期化・匿名ログインが走り出すため、合成データによる
// 自動テストはpayloads側だけをimportして行う設計にしている。
//
// 【まだ行っていないこと】画面への結線（js/onlineBattleScreen.js等からの呼び出し）、
// Firebaseセキュリティルールの本番公開、battleModes/index.jsへのlyricsQuizBattleMode登録。
// セキュリティルール案自体も、js/lyricsQuizBattleSecurityRules.jsによるJSシミュレーションと
// 純粋テストが完了した段階であり、本物のFirebase Rules Playground・実環境での検証は
// Phase7で行う（「セキュリティルール確定済み」ではなく「ルール案とシミュレーション完了」）。

import {
  ref,
  set,
  get,
  update,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import {
  QUESTION_STATUS,
  FIREBASE_FAILURE_REASON,
  STEAL_CLAIM_OUTCOME,
  buildLyricsCoveragePayload,
  buildAnswerPayload,
  buildAnswerAndStealClaimUpdatePaths,
  checkAnswerSubmissionAllowed,
  checkStealClaimAllowed,
  checkFinalizeLyricsQuizMatchAllowed,
  buildFinalizeLyricsQuizMatchUpdatePaths,
} from "./lyricsQuizBattleFirebasePayloads.js";

// 純粋関数群も、このファイルを経由して使えるように再エクスポートしておく
// （Firebase読み書き関数と同じ場所からimportしたい呼び出し元の利便性のため）。
export {
  QUESTION_STATUS,
  FIREBASE_FAILURE_REASON,
  STEAL_CLAIM_OUTCOME,
  isRetryableFailureReason,
  buildLyricsCoveragePayload,
  isLyricsCoverageReady,
  doesLyricsPoolHashMatch,
  checkAllPlayersLyricsReady,
  buildAnswerPayload,
  buildAnswerAndStealClaimUpdatePaths,
  checkAnswerSubmissionAllowed,
  checkStealClaimAllowed,
  checkFinalizeLyricsQuizMatchAllowed,
  buildFinalizeLyricsQuizMatchUpdatePaths,
  deriveDnfUidsFromAnswerCounts,
  computeSongPoolHash,
} from "./lyricsQuizBattleFirebasePayloads.js";

const REASON = FIREBASE_FAILURE_REASON;

// ===== Firebase読み書き（実際のSDK呼び出し） =====

// players/{uid}/lyricsCoverageを送信する（本人限定の自己スコープ書き込み）。
// 曲名・不足曲名は一切含めない（件数だけ）。
export async function submitLyricsCoverage({ roomId, availableCount, requiredCount, poolHash }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  try {
    await set(
      ref(database, `rooms/${roomId}/players/${uid}/lyricsCoverage`),
      buildLyricsCoveragePayload({ availableCount, requiredCount, poolHash })
    );
    return { ok: true };
  } catch (error) {
    if (error?.code === "PERMISSION_DENIED") return { ok: false, reason: REASON.PERMISSION_DENIED };
    return { ok: false, reason: REASON.NETWORK_ERROR };
  }
}

// ホストが問題を開始する（currentQuestionIndex・currentQuestionStartedAt・questionStatusを
// 1回のupdate()でまとめて書く）。finishCountdown()と同じ「読む→条件確認→書く」＋
// 間隔を空けた再試行（最大3回、network-error時のみ）のパターン。
export async function startLyricsQuizQuestion({ roomId, matchId, questionIndex }) {
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

      const currentIndex = room.matches?.[matchId]?.currentQuestionIndex;
      if (currentIndex === questionIndex && room.matches?.[matchId]?.questionStatus === QUESTION_STATUS.ACTIVE) {
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

// 本人の回答を書き込む（クラシック・コンボ用。奪い取りはsubmitLyricsQuizAnswerWithStealClaimを使う）。
// 書く前にcheckAnswerSubmissionAllowed()で事前チェックし、可能な限り具体的な理由を返す
// （セキュリティルールのPERMISSION_DENIEDだけでは「何が原因で拒否されたか」が
// 分からないため）。再試行してよいのはnetwork-errorのときだけ。
export async function submitLyricsQuizAnswer({ roomId, matchId, questionIndex, selectedSongId, hintLevel }) {
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

  const preCheck = checkAnswerSubmissionAllowed({ room, matchId, questionIndex, uid });
  if (!preCheck.ok) return preCheck;

  try {
    await set(
      ref(database, `rooms/${roomId}/matches/${matchId}/answers/${questionIndex}/${uid}`),
      buildAnswerPayload({ selectedSongId, hintLevel, answeredAt: Date.now(), submittedAtValue: serverTimestamp() })
    );
    return { ok: true };
  } catch (error) {
    // 事前チェックを通過していても、他の要因（直前に問題が終了した等の競合）で
    // セキュリティルールに拒否されることがあり得るため、最終防衛線としてここでも判定する。
    if (error?.code === "PERMISSION_DENIED") return { ok: false, reason: REASON.PERMISSION_DENIED };
    return { ok: false, reason: REASON.NETWORK_ERROR };
  }
}

// 奪い取りで正解と判定した場合の送信。
//
// 【2026-08-06・2段階送信へ変更】以前はanswerとwinner claimを1回のupdate()に
// まとめて送っていたが、実機テストでwinner側のセキュリティルールがpermission_denied
// になる不具合が判明した。Realtime Database Rulesのrootは書き込み前の状態を参照する
// ため、同じmulti-location update内で新規作成するanswerを、winner側の.write条件が
// root経由で参照できていなかったことが原因と考えられる（本人の指摘・Firebase公式仕様）。
// これを避けるため、①answerを先に確定させ、②その保存成功を確認してから、
// ③別の書き込みとしてwinner claimを送る、という2段階へ変更した。こうすることで、
// winner側のルールが参照するroot（＝2段階目の書き込み時点でのDB全体の状態）には、
// 既に確定済みのanswerが必ず含まれる。
//
// 戻り値は { ok: true, outcome } または { ok: false, reason } のどちらか：
//   outcome "won"           : answer保存成功＋winner claim成功
//   outcome "lost-race"     : answer保存成功＋他の人が先にwinnerになっていた（正常な競合結果）
//   outcome "answered-wrong": 不正解だったためanswerだけ保存し、claimは送っていない
//   reason  "already-answered" / "question-resolved" 等: js/lyricsQuizBattleFirebasePayloads.js
//     のFIREBASE_FAILURE_REASON参照（answer保存自体が事前チェックで拒否された場合）
//   reason  "network-error" : 通信失敗（answer段階・claim段階どちらでも起こり得る。状態不明のため
//     呼び出し元は「もう一度押してください」等、再試行を促してよい）
//   reason  "permission-denied": winnerが存在しないのに拒否された、想定外のルール拒否
//     （lost-raceとは区別する。実際に起きた場合はルールの見直しが必要）
export async function submitLyricsQuizAnswerWithStealClaim({ roomId, matchId, questionIndex, selectedSongId, hintLevel, attemptWinnerClaim }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  // ステージ1：回答ログを先に確定させる（claimより先に送ることを厳守する）。
  const answerResult = await submitLyricsQuizAnswer({ roomId, matchId, questionIndex, selectedSongId, hintLevel });
  if (!answerResult.ok) return answerResult;

  if (!attemptWinnerClaim) {
    return { ok: true, outcome: STEAL_CLAIM_OUTCOME.ANSWERED_WRONG };
  }

  // ステージ2：answerの保存が確定した後で、別の書き込みとしてwinner claimを送る。
  try {
    await set(
      ref(database, `rooms/${roomId}/matches/${matchId}/questionClaims/${questionIndex}/winner`),
      { uid, submittedAt: serverTimestamp() }
    );
    return { ok: true, outcome: STEAL_CLAIM_OUTCOME.WON };
  } catch (error) {
    if (error?.code !== "PERMISSION_DENIED") {
      // answerは既に保存済みのため、失われることはない。claim側だけが通信エラーで
      // 不確定な状態（本当は成功していた可能性も、失敗した可能性もある）。
      return { ok: false, reason: REASON.NETWORK_ERROR };
    }
    // 拒否された理由が「既に他の人がwinnerだったから（正常な競合結果）」なのか、
    // 「想定外のルール拒否」なのかを、現在のwinnerを読み直して切り分ける。
    try {
      const winnerSnapshot = await get(ref(database, `rooms/${roomId}/matches/${matchId}/questionClaims/${questionIndex}/winner`));
      if (winnerSnapshot.exists()) {
        return { ok: true, outcome: STEAL_CLAIM_OUTCOME.LOST_RACE };
      }
    } catch (readError) {
      return { ok: false, reason: REASON.NETWORK_ERROR };
    }
    // winnerがまだ誰も居ないのに拒否された＝lost-raceでは説明が付かない、想定外の拒否。
    return { ok: false, reason: REASON.PERMISSION_DENIED };
  }
}

// ホストが現在の問題を確定する（questionStatus→resolved）。
export async function resolveLyricsQuizQuestion({ roomId, matchId }) {
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
        return { ok: true }; // 既に目標状態（再送時の冪等性）
      }

      await update(ref(database), {
        [`rooms/${roomId}/matches/${matchId}/questionStatus`]: QUESTION_STATUS.RESOLVED,
        [`rooms/${roomId}/matches/${matchId}/resolvedAt`]: serverTimestamp(),
      });
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}

// ホストが次の問題へ進める（resolved済みのときだけ意味を持つが、その前提チェックは
// js/lyricsQuizMatchProgress.jsのcanAdvanceToNextQuestion()相当の判断を呼び出し元が
// 既に行っている想定。ここではstartLyricsQuizQuestion()をそのまま呼ぶだけで十分
// （経路を1本化し、書き込み内容の重複実装を避ける）。
export async function advanceLyricsQuizQuestion({ roomId, matchId, nextQuestionIndex }) {
  return startLyricsQuizQuestion({ roomId, matchId, questionIndex: nextQuestionIndex });
}

// 通信失敗後の復旧用：現在の試合の進行状態を読み直す（書き込みに失敗しても、
// 実際にはサーバー側で成立していたかどうかをこれで確認できる。finishCountdown()等の
// 「既に目標状態なら成功扱い」という判定にも使われている考え方と同じ）。
export async function readLyricsQuizMatchState({ roomId, matchId }) {
  const snapshot = await get(ref(database, `rooms/${roomId}/matches/${matchId}`));
  return snapshot.exists() ? snapshot.val() : null;
}

// 【Phase6新設】ホストが最終問題を確定・進行し終えたときに呼ぶ。全参加者分の最終結果
// （js/lyricsQuizMatchProgress.jsのfinalizeMatch()が返す { uid, result } の集まり）を
// matches/{matchId}/results/{uid}へまとめて書き込み、同じ1回のupdate()でroom.statusも
// "result"へ進める（本人指示どおり、中間状態を避けるため）。
//
// 【"result"という文字列について】js/onlineBattle.jsのROOM_STATUS.RESULTと同じ値だが、
// このファイルは既存のjs/onlineBattle.jsを一切importしない設計方針（ファイル冒頭コメント参照）
// のため、あえて同じ文字列をここで独立して持つ（QUESTION_STATUSを独自定義しているのと同じ考え方）。
// 他のgameMode（timeAttack等）が結果確定後に読む場所（matches/{matchId}/results・room.status）と
// 完全に同じ場所・同じ値を使うことで、js/onlineBattleScreen.js側の「結果画面へ進む」検知の
// 仕組み自体は使い回せるようにしている（実際の結果表示はルールごとに列が異なるため専用の
// 描画を別途行うが、"いつ結果画面へ進むか"の検知は既存の仕組みに乗せる）。
export async function finalizeLyricsQuizMatch({ roomId, matchId, resultsByUid }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) return { ok: false, reason: REASON.NOT_SIGNED_IN };

  const MAX_ATTEMPTS = 3;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
      const room = roomSnapshot.exists() ? roomSnapshot.val() : null;
      const precheck = checkFinalizeLyricsQuizMatchAllowed({ room, matchId, uid });
      if (!precheck.ok) return precheck;
      if (precheck.alreadyDone) return { ok: true }; // 既に目標状態（ホストの再試行を含む冪等性）

      await update(ref(database), buildFinalizeLyricsQuizMatchUpdatePaths({ roomId, matchId, resultsByUid }));
      return { ok: true };
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) return { ok: false, reason: REASON.NETWORK_ERROR };
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  return { ok: false, reason: REASON.NETWORK_ERROR };
}
