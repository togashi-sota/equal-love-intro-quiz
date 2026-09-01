// js/lyricsQuizBattleFirebasePayloads.js（Phase4：Firebase書き込み内容の組み立て）のテスト。
//
// このプロジェクトにはFirebaseエミュレーター環境が無いため、実際のSDK呼び出しを伴う
// 関数（js/lyricsQuizBattleFirebase.jsのsubmitLyricsCoverage等）は本番Firebaseへの
// 書き込みが必須になり、自動テストの対象にできない（実機・複数タブでの検証はPhase8で行う）。
// ここでは、Firebaseに一切触れない純粋関数（ペイロード組み立て・照合・DNF導出）だけを
// 対象にする（意図的にjs/lyricsQuizBattleFirebasePayloads.jsだけをimportし、
// Firebase SDKの初期化が走るjs/lyricsQuizBattleFirebase.js／js/firebaseClient.jsには
// 一切触れないようにしている）。歌詞本文は一切扱わず、ダミーの曲ID・数値のみ使用。

import {
  buildLyricsCoveragePayload,
  isLyricsCoverageReady,
  doesLyricsPoolHashMatch,
  checkAllPlayersLyricsReady,
  describeLyricsCoverageStatus,
  LYRICS_COVERAGE_STATUS,
  buildAnswerPayload,
  buildAnswerAndStealClaimUpdatePaths,
  deriveDnfUidsFromAnswerCounts,
  computeSongPoolHash,
  checkFinalizeLyricsQuizMatchAllowed,
  buildFinalizeLyricsQuizMatchUpdatePaths,
  buildScoreSnapshotUpdatePaths,
  FIREBASE_FAILURE_REASON,
  isRetryableFailureReason,
  checkAnswerSubmissionAllowed,
  checkStealClaimAllowed,
  QUESTION_STATUS,
} from "../js/lyricsQuizBattleFirebasePayloads.js";
import { assertEqual } from "./test-utils.js";

function buildRoomState(overrides) {
  return {
    activeMatchId: "MATCH1",
    matches: {
      MATCH1: {
        currentQuestionIndex: 2,
        questionStatus: QUESTION_STATUS.ACTIVE,
        answers: {},
        questionClaims: {},
        // 【2026-09-06追加】checkAnswerSubmissionAllowed()がparticipantsスナップショットの
        // 存在も確認するようになったため（本人指示：実機フィードバック⑤の権限エラー原因調査）、
        // 既定のフィクスチャにも実際のFirebase構造と同じくparticipantsを持たせる。
        participants: { p1: {} },
      },
    },
    ...overrides,
  };
}

export function runLyricsQuizBattleFirebaseTests() {
  // ===== buildLyricsCoveragePayload / isLyricsCoverageReady =====
  {
    const complete = buildLyricsCoveragePayload({ availableCount: 20, requiredCount: 20, poolHash: "abc" });
    assertEqual(complete, { availableCount: 20, requiredCount: 20, complete: true, poolHash: "abc" }, "件数が揃っていればcomplete:true");
    assertEqual(isLyricsCoverageReady(complete), true, "complete:trueならREADY可能");

    const incomplete = buildLyricsCoveragePayload({ availableCount: 18, requiredCount: 20, poolHash: "abc" });
    assertEqual(incomplete.complete, false, "件数が足りなければcomplete:false");
    assertEqual(isLyricsCoverageReady(incomplete), false, "complete:falseならREADY不可");
    assertEqual(isLyricsCoverageReady(null), false, "lyricsCoverage自体が無ければREADY不可");
  }

  // ===== doesLyricsPoolHashMatch =====
  {
    assertEqual(doesLyricsPoolHashMatch("hash-a", "hash-a"), true, "同じハッシュなら一致");
    assertEqual(doesLyricsPoolHashMatch("hash-a", "hash-b"), false, "違うハッシュなら不一致");
    assertEqual(doesLyricsPoolHashMatch("", "hash-b"), false, "空文字は一致扱いにしない（未計算の事故防止）");
    assertEqual(doesLyricsPoolHashMatch(undefined, "hash-b"), false, "未定義は一致扱いにしない");
  }

  // ===== checkAllPlayersLyricsReady =====
  {
    const hostPoolHash = "host-hash";
    const readyEveryone = {
      p1: { availableCount: 20, requiredCount: 20, complete: true, poolHash: hostPoolHash },
      p2: { availableCount: 20, requiredCount: 20, complete: true, poolHash: hostPoolHash },
    };
    assertEqual(checkAllPlayersLyricsReady(readyEveryone, hostPoolHash), { ok: true, notReadyUids: [] }, "全員揃っていればok:true");

    const oneShort = {
      p1: { availableCount: 20, requiredCount: 20, complete: true, poolHash: hostPoolHash },
      p2: { availableCount: 18, requiredCount: 20, complete: false, poolHash: hostPoolHash },
    };
    assertEqual(checkAllPlayersLyricsReady(oneShort, hostPoolHash), { ok: false, notReadyUids: ["p2"] }, "件数不足の参加者を検出する");

    const mismatchedHash = {
      p1: { availableCount: 20, requiredCount: 20, complete: true, poolHash: hostPoolHash },
      p2: { availableCount: 20, requiredCount: 20, complete: true, poolHash: "different-hash" },
    };
    assertEqual(
      checkAllPlayersLyricsReady(mismatchedHash, hostPoolHash),
      { ok: false, notReadyUids: ["p2"] },
      "件数は揃っていても内容ハッシュが違えば不足として扱う"
    );
  }

  // ===== describeLyricsCoverageStatus：未確認／不足／揃っているの3状態 =====
  // 「まだ確認できていない」を「0曲で不足」と誤って断定しないための判定
  // （本人からの指摘・2026-08-06：ロビー作成直後に実際は揃っているのに
  // 「81曲中0曲」と誤表示される不具合の原因だった）。
  {
    const hostPoolHash = "host-hash";

    assertEqual(
      describeLyricsCoverageStatus(null, hostPoolHash),
      { status: LYRICS_COVERAGE_STATUS.CHECKING, availableCount: null, requiredCount: null },
      "coverageが無い（未提出）場合は0曲不足ではなく確認中を返す"
    );
    assertEqual(
      describeLyricsCoverageStatus(undefined, hostPoolHash),
      { status: LYRICS_COVERAGE_STATUS.CHECKING, availableCount: null, requiredCount: null },
      "coverageがundefinedでも確認中を返す"
    );

    const staleHashCoverage = { availableCount: 81, requiredCount: 81, complete: true, poolHash: "old-hash" };
    assertEqual(
      describeLyricsCoverageStatus(staleHashCoverage, hostPoolHash),
      { status: LYRICS_COVERAGE_STATUS.CHECKING, availableCount: null, requiredCount: 81 },
      "曲プールのハッシュが今と違う（古い確認結果）場合も確認中扱い"
    );

    const insufficientCoverage = { availableCount: 18, requiredCount: 20, complete: false, poolHash: hostPoolHash };
    assertEqual(
      describeLyricsCoverageStatus(insufficientCoverage, hostPoolHash),
      { status: LYRICS_COVERAGE_STATUS.INSUFFICIENT, availableCount: 18, requiredCount: 20 },
      "確認済みで本当に不足している場合はinsufficient"
    );

    const readyCoverage = { availableCount: 81, requiredCount: 81, complete: true, poolHash: hostPoolHash };
    assertEqual(
      describeLyricsCoverageStatus(readyCoverage, hostPoolHash),
      { status: LYRICS_COVERAGE_STATUS.READY, availableCount: 81, requiredCount: 81 },
      "確認済みで揃っていればready"
    );
  }

  // ===== buildAnswerPayload：クライアントが書けるのは操作事実だけ =====
  {
    const payload = buildAnswerPayload({
      selectedSongId: "song-1",
      hintLevel: 2,
      answeredAt: 12345,
      submittedAtValue: "SERVER_TIMESTAMP_PLACEHOLDER",
    });
    assertEqual(
      payload,
      { selectedSongId: "song-1", hintLevel: 2, answeredAt: 12345, submittedAt: "SERVER_TIMESTAMP_PLACEHOLDER" },
      "回答ログにはselectedSongId/hintLevel/answeredAt/submittedAtの4項目だけが含まれる"
    );
    assertEqual(
      "isCorrect" in payload || "points" in payload || "responseMs" in payload,
      false,
      "isCorrect・points・responseMsのような計算済みの値は一切含まれない"
    );
  }

  // ===== buildAnswerAndStealClaimUpdatePaths：atomic multi-location updateの中身 =====
  {
    const updatePaths = buildAnswerAndStealClaimUpdatePaths({
      roomId: "ROOM1",
      matchId: "MATCH1",
      questionIndex: 2,
      uid: "p1",
      selectedSongId: "song-1",
      hintLevel: 1,
      answeredAt: 1000,
      submittedAtValue: "SERVER_TIMESTAMP_PLACEHOLDER",
    });
    const answerPath = "rooms/ROOM1/matches/MATCH1/answers/2/p1";
    const winnerPath = "rooms/ROOM1/matches/MATCH1/questionClaims/2/winner";
    assertEqual(Object.keys(updatePaths).sort(), [answerPath, winnerPath].sort(), "回答ログとwinner claimの2パスが1つのupdateにまとまっている");
    assertEqual(
      updatePaths[answerPath],
      { selectedSongId: "song-1", hintLevel: 1, answeredAt: 1000, submittedAt: "SERVER_TIMESTAMP_PLACEHOLDER" },
      "回答ログ側の中身"
    );
    assertEqual(
      updatePaths[winnerPath],
      { uid: "p1", submittedAt: "SERVER_TIMESTAMP_PLACEHOLDER" },
      "winner側は最小構造（uid・submittedAtのみ、selectedSongIdは重複保存しない）"
    );
    assertEqual(
      updatePaths[answerPath].submittedAt,
      updatePaths[winnerPath].submittedAt,
      "同じupdate()内なので、回答ログとwinner claimのsubmittedAtは同じ値になる（本番ではServerValue.TIMESTAMPが同一の実時刻へ解決される）"
    );
  }

  // ===== deriveDnfUidsFromAnswerCounts：DNFは書き込まず、都度導出する =====
  {
    const result = deriveDnfUidsFromAnswerCounts({
      allPlayerUids: ["p1", "p2", "p3"],
      answeredCountByUid: { p1: 5, p2: 3, p3: 5 },
      totalQuestions: 5,
    });
    assertEqual(result, ["p2"], "全問分の回答が無いプレイヤーだけがDNFとして導出される");

    const allComplete = deriveDnfUidsFromAnswerCounts({
      allPlayerUids: ["p1", "p2"],
      answeredCountByUid: { p1: 5, p2: 5 },
      totalQuestions: 5,
    });
    assertEqual(allComplete, [], "全員完走していればDNFは1人もいない");

    // 完走後にもう一度呼んでも（同じ入力なら）結果は変わらない＝冪等。
    const calledAgain = deriveDnfUidsFromAnswerCounts({
      allPlayerUids: ["p1", "p2"],
      answeredCountByUid: { p1: 5, p2: 5 },
      totalQuestions: 5,
    });
    assertEqual(calledAgain, allComplete, "同じ回答件数であれば、何度呼んでも同じ結果になる（書き込みを伴わないため上書き事故が起こらない）");
  }

  // ===== FIREBASE_FAILURE_REASON / isRetryableFailureReason：再試行してよいものだけを区別する =====
  {
    assertEqual(isRetryableFailureReason(FIREBASE_FAILURE_REASON.NETWORK_ERROR), true, "network-errorだけが再試行してよい");
    assertEqual(isRetryableFailureReason(FIREBASE_FAILURE_REASON.ALREADY_ANSWERED), false, "already-answeredは再試行してはいけない");
    assertEqual(isRetryableFailureReason(FIREBASE_FAILURE_REASON.STALE_MATCH), false, "stale-matchは再試行してはいけない");
    assertEqual(isRetryableFailureReason(FIREBASE_FAILURE_REASON.QUESTION_RESOLVED), false, "question-resolvedは再試行してはいけない");
    assertEqual(isRetryableFailureReason(FIREBASE_FAILURE_REASON.INVALID_SETTINGS), false, "invalid-settingsは再試行してはいけない");
    assertEqual(isRetryableFailureReason(FIREBASE_FAILURE_REASON.WINNER_ALREADY_CLAIMED), false, "winner-already-claimedは再試行してはいけない");
    assertEqual(isRetryableFailureReason(FIREBASE_FAILURE_REASON.PERMISSION_DENIED), false, "permission-deniedは再試行してはいけない");
  }

  // ===== checkAnswerSubmissionAllowed：書き込み前の事前チェック（許可/拒否一覧） =====
  {
    const room = buildRoomState({});
    const base = { room, matchId: "MATCH1", questionIndex: 2, uid: "p1" };

    assertEqual(checkAnswerSubmissionAllowed(base), { ok: true }, "許可：現在の試合・現在の問題・進行中・未回答");
    assertEqual(
      checkAnswerSubmissionAllowed({ ...base, room: null }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_FOUND },
      "拒否：ルーム自体が読めない"
    );
    assertEqual(
      checkAnswerSubmissionAllowed({ ...base, matchId: "OLD-MATCH" }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH },
      "拒否：古い試合ID"
    );
    assertEqual(
      checkAnswerSubmissionAllowed({ ...base, questionIndex: 1 }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_QUESTION },
      "拒否：古いquestionIndex"
    );
    assertEqual(
      checkAnswerSubmissionAllowed({
        ...base,
        room: buildRoomState({ matches: { MATCH1: { ...room.matches.MATCH1, questionStatus: QUESTION_STATUS.RESOLVED } } }),
      }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.QUESTION_RESOLVED },
      "拒否：問題は既に終了している"
    );
    assertEqual(
      checkAnswerSubmissionAllowed({
        ...base,
        room: buildRoomState({ matches: { MATCH1: { ...room.matches.MATCH1, answers: { 2: { p1: { selectedSongId: "song-1" } } } } } }),
      }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.ALREADY_ANSWERED },
      "拒否：既に回答済み（write-once）"
    );
    // 【2026-09-06追加・本人指示：実機フィードバック⑤の権限エラー原因調査】実際の
    // Firebaseセキュリティルール（canWriteAnswer）はparticipants/{uid}.exists()も要求している。
    // 事前チェック側にこの条件が抜けていると、「書けるはずなのに実際は拒否される」という
    // 原因不明のPERMISSION_DENIEDが起こり得たため、事前チェック側にも同じ条件を追加した。
    assertEqual(
      checkAnswerSubmissionAllowed({
        ...base,
        room: buildRoomState({ matches: { MATCH1: { ...room.matches.MATCH1, participants: {} } } }),
      }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_FOUND },
      "拒否：participantsスナップショットに本人が存在しない（実際のRulesの条件と一致させた）"
    );
  }

  // ===== checkStealClaimAllowed：書き込み前の事前チェック（許可/拒否一覧） =====
  {
    const room = buildRoomState({});
    const base = { room, matchId: "MATCH1", questionIndex: 2 };

    assertEqual(checkStealClaimAllowed(base), { ok: true }, "許可：現在の試合・現在の問題・進行中・未確定");
    assertEqual(
      checkStealClaimAllowed({ ...base, matchId: "OLD-MATCH" }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH },
      "拒否：古い試合ID"
    );
    assertEqual(
      checkStealClaimAllowed({
        ...base,
        room: buildRoomState({ matches: { MATCH1: { ...room.matches.MATCH1, questionStatus: QUESTION_STATUS.RESOLVED } } }),
      }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.QUESTION_RESOLVED },
      "拒否：問題は既に終了している"
    );
    assertEqual(
      checkStealClaimAllowed({
        ...base,
        room: buildRoomState({ matches: { MATCH1: { ...room.matches.MATCH1, questionClaims: { 2: { winner: { uid: "p2" } } } } } }),
      }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.WINNER_ALREADY_CLAIMED },
      "拒否：既に他の人が奪い取り済み（write-once）"
    );
  }

  // ===== computeSongPoolHash（Phase6新設） =====
  {
    assertEqual(
      computeSongPoolHash(["song-1", "song-2", "song-3"]),
      computeSongPoolHash(["song-3", "song-1", "song-2"]),
      "曲の並び順が違っても同じ中身なら同じハッシュになる"
    );
    assertEqual(
      computeSongPoolHash(["song-1", "song-2"]) === computeSongPoolHash(["song-1", "song-3"]),
      false,
      "中身が違えば別のハッシュになる"
    );
    assertEqual(
      computeSongPoolHash(["song-1"]) === computeSongPoolHash(["song-1", "song-2"]),
      false,
      "曲数が違えば別のハッシュになる"
    );
    assertEqual(typeof computeSongPoolHash([]), "string", "空配列でも例外を投げず文字列を返す");
  }

  // ===== checkFinalizeLyricsQuizMatchAllowed（Phase6.5新設） =====
  {
    const baseRoom = { host: "host-uid", activeMatchId: "MATCH1", status: "playing" };
    assertEqual(
      checkFinalizeLyricsQuizMatchAllowed({ room: null, matchId: "MATCH1", uid: "host-uid" }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_FOUND },
      "拒否：ルームが存在しない"
    );
    assertEqual(
      checkFinalizeLyricsQuizMatchAllowed({ room: baseRoom, matchId: "MATCH1", uid: "not-host-uid" }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.NOT_HOST },
      "拒否：非ホストによる確定は拒否される"
    );
    assertEqual(
      checkFinalizeLyricsQuizMatchAllowed({ room: baseRoom, matchId: "OLD_MATCH", uid: "host-uid" }),
      { ok: false, reason: FIREBASE_FAILURE_REASON.STALE_MATCH },
      "拒否：古い（現在と異なる）matchIdでの確定は拒否される"
    );
    assertEqual(
      checkFinalizeLyricsQuizMatchAllowed({ room: baseRoom, matchId: "MATCH1", uid: "host-uid" }),
      { ok: true, alreadyDone: false },
      "許可：ホスト本人・現在の試合であれば許可される"
    );
    assertEqual(
      checkFinalizeLyricsQuizMatchAllowed({ room: { ...baseRoom, status: "result" }, matchId: "MATCH1", uid: "host-uid" }),
      { ok: true, alreadyDone: true },
      "許可（冪等）：既にstatus:resultなら、書き込み不要の成功として扱う（ホストの再試行・リロード後の再実行を想定）"
    );
  }

  // ===== buildFinalizeLyricsQuizMatchUpdatePaths（Phase6.5新設） =====
  {
    const resultsByUid = {
      p1: { ruleVersion: 1, completed: true, common: { elapsedMs: 100, correctCount: 2, missCount: 0 }, detail: {} },
      p2: { ruleVersion: 1, completed: false, common: { elapsedMs: 50, correctCount: 1, missCount: 1 }, detail: {} },
    };
    const updates = buildFinalizeLyricsQuizMatchUpdatePaths({ roomId: "ROOM1", matchId: "MATCH1", resultsByUid });
    assertEqual(updates["rooms/ROOM1/status"], "result", "room.statusを1回のupdate()でresultへ進める");
    // 【Phase7訂正】既存gameModeのresults/{uid}（本人が自分の結果だけを書く前提のルール）とは
    // 書き込み主体が異なるため、専用のlyricsResults/{uid}パスへ変更した。
    assertEqual(updates["rooms/ROOM1/matches/MATCH1/lyricsResults/p1"], resultsByUid.p1, "p1の結果が正しいパスに書き込まれる");
    assertEqual(updates["rooms/ROOM1/matches/MATCH1/lyricsResults/p2"], resultsByUid.p2, "p2の結果が正しいパスに書き込まれる");
    assertEqual(Object.keys(updates).length, 3, "status1件＋参加者2人分の結果、計3件のパスだけが含まれる（余分な書き込みが無い）");
  }

  // ===== buildScoreSnapshotUpdatePaths（2026-09-01新設：ライブスコアボード） =====
  {
    const scoreSnapshot = {
      questionsScoredCount: 2,
      scoresByUid: { p1: { totalPoints: 2, correctCount: 2 }, p2: { totalPoints: 1, correctCount: 1 } },
    };
    const updates = buildScoreSnapshotUpdatePaths({ roomId: "ROOM1", matchId: "MATCH1", scoreSnapshot, updatedAtValue: "SERVER_TIME" });
    assertEqual(updates["rooms/ROOM1/matches/MATCH1/scoreSnapshot/questionsScoredCount"], 2, "確定済み問題数がそのまま書き込まれる");
    assertEqual(updates["rooms/ROOM1/matches/MATCH1/scoreSnapshot/scoresByUid"], scoreSnapshot.scoresByUid, "参加者全員分のスコアが1つのオブジェクトとしてまとめて書き込まれる（＝Firebase側では1回の値変更として全員に同時反映される）");
    assertEqual(updates["rooms/ROOM1/matches/MATCH1/scoreSnapshot/updatedAt"], "SERVER_TIME", "updatedAtValueがそのまま渡される（本番ではserverTimestamp()を渡す想定）");
    assertEqual(Object.keys(updates).length, 3, "scoreSnapshot関連の3パスだけが含まれる");
  }
  {
    // scoreSnapshotを渡さなかった場合は、何も書き込まない（既存のstartLyricsQuizQuestion()の
    // 挙動＝最初の問題以外の呼び出しでscoreSnapshotを省略しても、余計な書き込みが増えない）。
    const updates = buildScoreSnapshotUpdatePaths({ roomId: "ROOM1", matchId: "MATCH1", scoreSnapshot: undefined, updatedAtValue: "SERVER_TIME" });
    assertEqual(updates, {}, "scoreSnapshotが無ければ空オブジェクトを返す（書き込むパスが無い）");
  }

  // ===== buildFinalizeLyricsQuizMatchUpdatePaths：scoreSnapshotも同じupdate()に混ぜて書ける =====
  // 【最重要の情報漏洩防止の検証】最終問題のreveal完了（＝finalizeLyricsQuizMatch()の呼び出し）と
  // スコアの更新が、別々の書き込みに分かれず「1回のupdate()」に混ざっていることを確認する。
  {
    const resultsByUid = {
      p1: { ruleVersion: 1, completed: true, common: { elapsedMs: 100, correctCount: 2, missCount: 0 }, detail: {} },
    };
    const scoreSnapshot = { questionsScoredCount: 3, scoresByUid: { p1: { totalPoints: 3, correctCount: 3 } } };
    const updates = buildFinalizeLyricsQuizMatchUpdatePaths({
      roomId: "ROOM1",
      matchId: "MATCH1",
      resultsByUid,
      scoreSnapshot,
      updatedAtValue: "SERVER_TIME",
    });
    assertEqual(updates["rooms/ROOM1/status"], "result", "room.statusは引き続きresultへ進む");
    assertEqual(updates["rooms/ROOM1/matches/MATCH1/lyricsResults/p1"], resultsByUid.p1, "最終結果も引き続き書き込まれる");
    assertEqual(updates["rooms/ROOM1/matches/MATCH1/scoreSnapshot/scoresByUid"], scoreSnapshot.scoresByUid, "最終問題のscoreSnapshotも、結果確定と同じ1回のupdate()に混ざって書き込まれる（別々の書き込みタイミングにならない）");
    assertEqual(Object.keys(updates).length, 5, "status1件＋結果1件＋scoreSnapshot3件、計5件のパスが含まれる");
  }
}
