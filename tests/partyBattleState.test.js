// パーティー対戦（2026-09-15新設）の純粋な状態遷移（js/partyBattleState.js）のテスト。
// 席・カウントダウン中の入力無効・4択の同順／グローバル消去・お手つき・PASS・一瞬・サドンデス・
// 得点の二重計上防止など、本人確定の仕様を1つずつ機械的に確認する。

import {
  PARTY_PHASE,
  PARTY_SEAT_IDS,
  resolveSeatAssignments,
  resolveSeatRotation,
  normalizePartySettings,
  createDefaultPartySettings,
  buildPartyPlayers,
  createPartyMatch,
  createQuestionRuntime,
  beginCountdown,
  activateQuestion,
  canPlayerAnswer,
  canTapChoice,
  claimAnswer,
  isClaimedChoiceCorrect,
  resolveCorrect,
  resolveWrong,
  finishWrongResult,
  passQuestion,
  instantPass,
  resolveInstantAllPassed,
  applyQuestionOutcome,
  creditCorrectScore,
  revokeCorrectScore,
  computeStandings,
  resolveTopTiePlayerIds,
  resolveAfterPlannedQuestions,
  resolveSuddenDeathOutcome,
  resolveParticipantIds,
  pickSuddenDeathSong,
  buildRevealOrder,
  isWaitingForNext,
  canRevealSolution,
  voidRevealedCorrect,
} from "../js/partyBattleState.js";
import { assertEqual } from "./test-utils.js";

const SONG_A = { id: "a", title: "A" };
const SONG_B = { id: "b", title: "B" };
const SONG_C = { id: "c", title: "C" };
const SONG_D = { id: "d", title: "D" };
const SONG_E = { id: "e", title: "E" };

function buildQuestion(song = SONG_A) {
  return { song, choices: [SONG_A, SONG_B, SONG_C, SONG_D], hints: [] };
}

function buildMatch({ playerCount = 4, plannedCount = 2, emptySeatId = null } = {}) {
  const settings = normalizePartySettings({ ...createDefaultPartySettings(), playerCount, emptySeatId, questionCountValue: String(plannedCount) });
  const built = buildPartyPlayers(settings);
  return createPartyMatch({
    settings,
    players: built.players,
    layout: built.layout,
    seats: built.seats,
    questions: [buildQuestion(SONG_A), buildQuestion(SONG_B), buildQuestion(SONG_C)],
    plannedCount,
    seed: 1,
  });
}

function buildActiveRuntime(match, question = buildQuestion(SONG_A)) {
  const runtime = createQuestionRuntime({
    question,
    questionNumber: 1,
    totalQuestions: match.plannedCount,
    isSuddenDeath: false,
    participantIds: resolveParticipantIds(match),
  });
  return activateQuestion(beginCountdown(runtime));
}

export function runPartyBattleStateTests() {
  // ===== 席 =====
  {
    const two = resolveSeatAssignments(2);
    assertEqual(two.layout, "two", "2人は対面2席の専用レイアウト");
    assertEqual(two.seats.map((seat) => seat.seatId), ["top", "bottom"], "2人は上下の2席で固定");
    const four = resolveSeatAssignments(4);
    assertEqual(four.seats.map((seat) => seat.playerIndex), [0, 1, 2, 3], "4人は4席すべて使う");
    assertEqual(resolveSeatAssignments(3), null, "3人で空席が未指定なら開始できない（null）");
    assertEqual(resolveSeatAssignments(3, "nowhere"), null, "3人で不正な席IDも開始できない");
    PARTY_SEAT_IDS.forEach((emptySeatId) => {
      const three = resolveSeatAssignments(3, emptySeatId);
      assertEqual(three.layout, "four", `3人（空席:${emptySeatId}）は4分割グリッドを共用する`);
      assertEqual(three.seats.find((seat) => seat.seatId === emptySeatId).playerIndex, null, `空席:${emptySeatId}にはプレイヤーが入らない`);
      assertEqual(
        three.seats.filter((seat) => seat.playerIndex !== null).map((seat) => seat.playerIndex),
        [0, 1, 2],
        `空席:${emptySeatId}以外の3席にP1〜P3が順に入る（重複なし）`
      );
    });
    assertEqual(resolveSeatRotation("topLeft", { layout: "four", isLandscape: false }), 180, "4分割の上段は180度回転");
    assertEqual(resolveSeatRotation("bottomRight", { layout: "four", isLandscape: false }), 0, "4分割の下段は回転しない");
    assertEqual(resolveSeatRotation("top", { layout: "two", isLandscape: false }), 180, "2人縦向きの上席は180度");
    assertEqual(resolveSeatRotation("top", { layout: "two", isLandscape: true }), 90, "2人横向きの左席は90度");
    assertEqual(resolveSeatRotation("bottom", { layout: "two", isLandscape: true }), -90, "2人横向きの右席は-90度");
  }

  // ===== 設定の正規化 =====
  {
    const normalized = normalizePartySettings({ playerCount: "9", quizType: "instant", questionCountValue: "50", voiceStartTimeoutSec: 7, instantMaxListens: 4 });
    assertEqual(normalized.playerCount, 2, "不正な人数は既定（2人）へ");
    assertEqual(normalized.questionCountValue, "3", "一瞬で不正な問題数は一瞬の先頭（3問）へ");
    assertEqual(normalized.voiceStartTimeoutSec, 3, "不正な音声制限時間は既定3秒へ");
    assertEqual(normalized.instantMaxListens, 3, "不正な最大試聴回数は既定3回へ");
    assertEqual(normalizePartySettings(null).playerNames.length, 4, "nullでも名前4枠を持つ");
    const players = buildPartyPlayers(normalizePartySettings({ playerCount: 2, playerNames: ["  ", "ゆい"] }));
    assertEqual(players.players.map((player) => player.name), ["プレイヤー1", "ゆい"], "空の名前は「プレイヤーN」");
  }

  // ===== カウントダウン中は入力無効、ACTIVEで最初の1件だけ =====
  {
    const match = buildMatch({ playerCount: 4 });
    let runtime = createQuestionRuntime({ question: buildQuestion(), questionNumber: 1, totalQuestions: 2, isSuddenDeath: false, participantIds: resolveParticipantIds(match) });
    assertEqual(runtime.phase, PARTY_PHASE.QUESTION_INTRO, "最初はQUESTION_INTRO");
    runtime = beginCountdown(runtime);
    assertEqual(canPlayerAnswer(runtime, "p1"), false, "カウントダウン中は回答できない");
    assertEqual(claimAnswer(runtime, { playerId: "p1", choiceId: "a" }), null, "カウントダウン中の入力は受理されない");
    runtime = activateQuestion(runtime);
    assertEqual(canPlayerAnswer(runtime, "p1"), true, "START後は回答できる");
    const first = claimAnswer(runtime, { playerId: "p2", choiceId: "b" });
    assertEqual(first.phase, PARTY_PHASE.CLAIMED, "最初の入力で回答権が確定する");
    assertEqual(claimAnswer(first, { playerId: "p1", choiceId: "a" }), null, "回答権確定後の2件目は受理されない（二重得点防止）");
    assertEqual(claimAnswer(runtime, { playerId: "p9", choiceId: "a" }), null, "参加していないプレイヤーは受理されない");
  }

  // ===== 4択：正解／誤答候補のグローバル消去／残り1候補でも自動正解しない =====
  {
    const match = buildMatch({ playerCount: 2 });
    let runtime = buildActiveRuntime(match);
    runtime = claimAnswer(runtime, { playerId: "p1", choiceId: "b" });
    assertEqual(isClaimedChoiceCorrect(runtime), false, "正解曲以外の選択肢は不正解");
    runtime = resolveWrong(runtime, { otetsuki: false });
    assertEqual(runtime.phase, PARTY_PHASE.WRONG_RESULT, "不正解でWRONG_RESULT");
    assertEqual(runtime.eliminatedChoiceIds, ["b"], "選ばれた誤答候補が消える");
    assertEqual(runtime.lockedPlayerIds, [], "お手つきOFFなら本人はロックされない");
    runtime = finishWrongResult(runtime);
    assertEqual(runtime.phase, PARTY_PHASE.COUNTDOWN, "不正解表示のあとは必ずCOUNTDOWNへ");
    runtime = activateQuestion(runtime);
    assertEqual(canTapChoice(runtime, "p2", "b"), false, "消えた候補は全プレイヤーが押せない（グローバル）");
    assertEqual(canTapChoice(runtime, "p2", "a"), true, "残っている候補は押せる");
    // c, d も消して正解だけ残す
    runtime = resolveWrong(claimAnswer(runtime, { playerId: "p1", choiceId: "c" }), { otetsuki: false });
    runtime = activateQuestion(finishWrongResult(runtime));
    runtime = resolveWrong(claimAnswer(runtime, { playerId: "p2", choiceId: "d" }), { otetsuki: false });
    runtime = activateQuestion(finishWrongResult(runtime));
    assertEqual(runtime.eliminatedChoiceIds.length, 3, "3つの誤答候補が消えている");
    assertEqual(runtime.phase, PARTY_PHASE.ACTIVE, "残り1候補が正解だけでも自動正解にはならず、ACTIVEのまま待つ");
    assertEqual(runtime.lastResult.type, "wrong", "まだ正解は確定していない");
    runtime = resolveCorrect(claimAnswer(runtime, { playerId: "p2", choiceId: "a" }));
    assertEqual(runtime.phase, PARTY_PHASE.CORRECT_RESULT, "残った正解候補をタップして初めて正解");
    assertEqual(isWaitingForNext(runtime), true, "正解後は「次の問題へ」待ち（自動では進まない）");
  }

  // ===== お手つき：ONでロック、全員ロックで全員復活（消えた候補は復活しない） =====
  {
    const match = buildMatch({ playerCount: 3, emptySeatId: "bottomRight" });
    let runtime = buildActiveRuntime(match);
    runtime = resolveWrong(claimAnswer(runtime, { playerId: "p1", choiceId: "b" }), { otetsuki: true });
    assertEqual(runtime.lockedPlayerIds, ["p1"], "お手つきONで誤答者がロックされる");
    runtime = activateQuestion(finishWrongResult(runtime));
    assertEqual(canPlayerAnswer(runtime, "p1"), false, "ロック中は再開後も回答できない");
    runtime = resolveWrong(claimAnswer(runtime, { playerId: "p2", choiceId: "c" }), { otetsuki: true });
    assertEqual(runtime.revivedAll, false, "まだ1人残っているので復活しない");
    runtime = activateQuestion(finishWrongResult(runtime));
    runtime = resolveWrong(claimAnswer(runtime, { playerId: "p3", choiceId: "d" }), { otetsuki: true });
    assertEqual(runtime.revivedAll, true, "全員ロックされたら「全員復活！」");
    assertEqual(runtime.lockedPlayerIds, [], "全員復活でプレイヤーロックだけ解除");
    assertEqual(runtime.eliminatedChoiceIds, ["b", "c", "d"], "消えた候補は復活しない");
    runtime = activateQuestion(finishWrongResult(runtime));
    assertEqual(runtime.revivedAll, false, "再カウント後は復活表示フラグが消える");
    assertEqual(canPlayerAnswer(runtime, "p1"), true, "全員復活後は再び回答できる");
  }

  // ===== 通常モードの全員PASS =====
  {
    const match = buildMatch({ playerCount: 2 });
    let runtime = buildActiveRuntime(match);
    runtime = passQuestion(runtime);
    assertEqual(runtime.phase, PARTY_PHASE.PASS_RESULT, "全員PASSでPASS_RESULT");
    assertEqual(runtime.lastResult.type, "pass", "結果種別はpass");
    assertEqual(passQuestion(runtime), null, "PASS_RESULT中に再度PASSはできない");
    assertEqual(passQuestion(beginCountdown(buildActiveRuntime(match))), null, "カウントダウン中はPASSできない");
    const after = applyQuestionOutcome(match, runtime);
    assertEqual(after.stats.passCount, 1, "PASSは統計に数える");
    assertEqual(after.completedQuestionCount, 1, "PASSでも問題は完了扱い");
    assertEqual(after.scores.p1 + after.scores.p2, 0, "PASSは0点");
  }

  // ===== 一瞬：個別PASS、全員PASSで同じ箇所を再試聴、最終試聴で終了。お手つきロックは試聴を跨ぐ =====
  {
    const match = buildMatch({ playerCount: 3, emptySeatId: "topLeft" });
    let runtime = buildActiveRuntime(match);
    runtime = resolveWrong(claimAnswer(runtime, { playerId: "p1", choiceId: "b" }), { otetsuki: true });
    runtime = activateQuestion(finishWrongResult(runtime));
    let result = instantPass(runtime, "p2");
    assertEqual(result.allPassed, false, "p3がまだ回答できるので全員PASSではない");
    assertEqual(canPlayerAnswer(result.runtime, "p2"), false, "PASSした人はその試聴回は回答不可");
    assertEqual(instantPass(result.runtime, "p1"), null, "お手つきロック中の人はPASSできない");
    result = instantPass(result.runtime, "p3");
    assertEqual(result.allPassed, true, "回答可能な全員がPASSしたら全員PASS");
    runtime = resolveInstantAllPassed(result.runtime, 3);
    assertEqual(runtime.phase, PARTY_PHASE.COUNTDOWN, "残り試聴があれば3・2・1から再試聴");
    assertEqual(runtime.instantListenIndex, 2, "試聴回数が進む");
    assertEqual(runtime.instantPassedPlayerIds, [], "PASSロックは試聴単位でリセット");
    assertEqual(runtime.lockedPlayerIds, ["p1"], "お手つきロックは試聴を跨いで維持");
    runtime = activateQuestion(runtime);
    runtime = resolveInstantAllPassed(instantPass(instantPass(runtime, "p2").runtime, "p3").runtime, 3);
    assertEqual(runtime.instantListenIndex, 3, "3回目");
    runtime = activateQuestion(runtime);
    runtime = resolveInstantAllPassed(instantPass(instantPass(runtime, "p2").runtime, "p3").runtime, 3);
    assertEqual(runtime.phase, PARTY_PHASE.PASS_RESULT, "最終試聴で全員PASSなら問題終了（0点）");
  }

  // ===== 得点：正解確定時に+1、人間判定で覆したら戻す（二重計上なし） =====
  {
    let match = buildMatch({ playerCount: 2 });
    let runtime = buildActiveRuntime(match);
    runtime = resolveCorrect(claimAnswer(runtime, { playerId: "p2", choiceId: "a" }));
    ({ match, runtime } = creditCorrectScore(match, runtime));
    assertEqual(match.scores.p2, 1, "正解確定で+1");
    ({ match, runtime } = creditCorrectScore(match, runtime));
    assertEqual(match.scores.p2, 1, "同じ回答に二重計上しない");
    ({ match, runtime } = revokeCorrectScore(match, runtime, "p2"));
    assertEqual(match.scores.p2, 0, "人間判定で不正解へ覆したら1点戻す");
    ({ match, runtime } = revokeCorrectScore(match, runtime, "p2"));
    assertEqual(match.scores.p2, 0, "二重に戻さない");
    // 【公開ルール】正解表示中（曲名公開済み）からは、不正解へ「覆して同じ問題を再開」できない
    assertEqual(resolveWrong(runtime, { otetsuki: true, judgedBy: "human" }), null, "CORRECT_RESULT（曲名公開済み）から WRONG_RESULT へは戻せない");
    assertEqual(beginCountdown(runtime), null, "曲名を公開した問題はカウントダウン（出題中）へ戻せない");
    const voided = voidRevealedCorrect(runtime);
    assertEqual(voided.phase, PARTY_PHASE.PASS_RESULT, "正解→不正解へ修正したら、その問題は0点で終了（結果表示のまま次へ）");
    assertEqual(voided.lastResult.type, "voided", "結果種別は voided");
    assertEqual(isWaitingForNext(voided), true, "終了確定なので「次へ」を押せる");
    // 不正解表示（未公開）→ 正解へ覆すのは可能
    let runtime2 = buildActiveRuntime(match);
    runtime2 = resolveWrong(claimAnswer(runtime2, { playerId: "p1", choiceId: null }), { otetsuki: true });
    assertEqual(canRevealSolution(runtime2), false, "不正解表示中は曲名を公開しない");
    runtime2 = resolveCorrect(runtime2, { judgedBy: "human" });
    assertEqual(runtime2.phase, PARTY_PHASE.CORRECT_RESULT, "WRONG_RESULTからCORRECT_RESULTへは覆せる");
    assertEqual(runtime2.lockedPlayerIds, [], "不正解→正解へ覆したらロックも取り消す");
    assertEqual(canRevealSolution(runtime2), true, "正解確定で初めて曲名を公開できる");
    const after = applyQuestionOutcome(match, voided);
    assertEqual(after.scores.p2, 0, "voided は0点のまま（問題終了時に加算しない）");
    assertEqual(after.completedQuestionCount, 1, "voided でも問題は完了扱い");
    assertEqual(after.usedSongIds, ["a"], "出題済みの曲を記録する");
  }

  // ===== 正解曲名の公開ルール：問題継続中は非公開、終了確定で公開（5出題タイプ共通の状態遷移） =====
  {
    const match = buildMatch({ playerCount: 2 });
    let runtime = buildActiveRuntime(match);
    assertEqual(canRevealSolution(runtime), false, "出題中は非公開");
    runtime = claimAnswer(runtime, { playerId: "p1", choiceId: null });
    assertEqual(canRevealSolution(runtime), false, "回答権獲得中（音声の認識中・人間判定待ち）は非公開");
    runtime = resolveWrong(runtime, { otetsuki: false });
    assertEqual(canRevealSolution(runtime), false, "不正解（問題継続）は非公開");
    runtime = activateQuestion(finishWrongResult(runtime));
    assertEqual(canRevealSolution(runtime), false, "再開後も非公開");
    runtime = resolveCorrect(claimAnswer(runtime, { playerId: "p2", choiceId: "a" }));
    assertEqual(canRevealSolution(runtime), true, "正解確定で公開");
    assertEqual(canRevealSolution(passQuestion(buildActiveRuntime(match))), true, "全員PASS（問題終了）で公開");
    // 一瞬：途中の試聴回の全員PASSでは非公開、最終試聴で公開
    let instant = buildActiveRuntime(match);
    let replay = resolveInstantAllPassed(instantPass(instantPass(instant, "p1").runtime, "p2").runtime, 3);
    assertEqual(replay.phase, PARTY_PHASE.COUNTDOWN, "一瞬：残り試聴があれば再試聴");
    assertEqual(canRevealSolution(replay), false, "一瞬：再試聴に進む全員PASSでは非公開");
    replay = activateQuestion(replay);
    replay = { ...replay, instantListenIndex: 3 };
    const final = resolveInstantAllPassed(instantPass(instantPass(replay, "p1").runtime, "p2").runtime, 3);
    assertEqual(final.phase, PARTY_PHASE.PASS_RESULT, "一瞬：最終試聴の全員PASSで問題終了");
    assertEqual(canRevealSolution(final), true, "一瞬：最終試聴の全員PASSで公開");
  }

  // ===== 順位・サドンデス =====
  {
    let match = buildMatch({ playerCount: 4, plannedCount: 1 });
    match = { ...match, scores: { p1: 3, p2: 3, p3: 1, p4: 1 } };
    const standings = computeStandings(match);
    assertEqual(standings.map((row) => `${row.playerId}:${row.rank}`), ["p1:1", "p2:1", "p3:3", "p4:3"], "同点は同順位（1,1,3,3）");
    assertEqual(resolveTopTiePlayerIds(match), ["p1", "p2"], "首位タイの2人だけがサドンデス参加");
    assertEqual(resolveAfterPlannedQuestions(match).kind, "suddenDeath", "首位タイなら予定問題終了後にサドンデスへ");
    const solo = { ...match, scores: { p1: 4, p2: 3, p3: 1, p4: 1 } };
    assertEqual(resolveAfterPlannedQuestions(solo), { kind: "finished", winnerId: "p1" }, "単独首位ならそのまま終了");
    assertEqual(buildRevealOrder(computeStandings(match)).map((row) => row.playerId), ["p4", "p3", "p2", "p1"], "発表順は下位→上位");

    const sdMatch = { ...match, status: "suddenDeath", suddenDeath: { participantIds: ["p1", "p2"], round: 0 } };
    assertEqual(resolveParticipantIds(sdMatch), ["p1", "p2"], "サドンデス中の参加者は首位タイだけ");
    let runtime = createQuestionRuntime({ question: buildQuestion(SONG_C), questionNumber: 2, totalQuestions: 1, isSuddenDeath: true, participantIds: resolveParticipantIds(sdMatch) });
    runtime = activateQuestion(beginCountdown(runtime));
    assertEqual(claimAnswer(runtime, { playerId: "p3", choiceId: "c" }), null, "下位のプレイヤーはサドンデスに参加できない");
    const wrong = resolveWrong(claimAnswer(runtime, { playerId: "p1", choiceId: "a" }), { otetsuki: true });
    assertEqual(resolveSuddenDeathOutcome({ ...wrong, phase: PARTY_PHASE.PASS_RESULT, lastResult: { type: "pass" } }).kind, "continue", "誰も正解しなければ次のサドンデス問題へ（誤答で相手に自動勝利を与えない）");
    const correct = resolveCorrect(claimAnswer(activateQuestion(finishWrongResult(wrong)), { playerId: "p2", choiceId: "c" }));
    assertEqual(resolveSuddenDeathOutcome(correct), { kind: "finished", winnerId: "p2" }, "最初に正解した首位タイのプレイヤーが最終勝者");
    const afterSd = applyQuestionOutcome(sdMatch, correct);
    assertEqual(afterSd.stats.suddenDeathQuestionCount, 1, "サドンデス問題は別カウント");
    assertEqual(afterSd.completedQuestionCount, sdMatch.completedQuestionCount, "サドンデス問題は予定問題の完了数に数えない");
  }

  // ===== サドンデスの選曲：未出題→尽きたら既出（直前の即リピートは避ける） =====
  {
    const pool = [SONG_A, SONG_B, SONG_C];
    assertEqual(pickSuddenDeathSong(pool, ["a", "b"], "b", () => 0).id, "c", "未出題の曲を優先");
    assertEqual(pickSuddenDeathSong(pool, ["a", "b", "c"], "c", () => 0).id, "a", "全曲使い切ったら既出から再利用（直前のcは避ける）");
    assertEqual(pickSuddenDeathSong(pool, ["a", "b", "c"], "c", () => 0.99).id, "b", "乱数で再シャッフルされる");
    assertEqual(pickSuddenDeathSong([SONG_E], ["e"], "e", () => 0).id, "e", "1曲しかなければその曲");
    assertEqual(pickSuddenDeathSong([], [], null), null, "曲が無ければnull");
  }
}
