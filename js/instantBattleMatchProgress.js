// 一瞬バトル オンライン対戦「1試合分の進行状態」を、Firebase・画面から完全に切り離した
// 純粋関数として表現するモジュール（2026-09-15新設、本人指示：一瞬バトルの同期方式への
// 全面書き換え）。js/instantCoopMatchProgress.jsと同じ設計方針（進行状態はこのファイルの
// 中だけで完結させ、Firebaseは保存・同期する層に限定する）を踏襲している。
//
// 【一瞬協力との違い、重要】一瞬協力は「全員の投票を1つのチーム回答にまとめる」仕組みだが、
// 一瞬バトルは「全員が同じ問題を同時に見て、各自が自分の回答を出す」対戦（本人指示）。
// そのため、このファイルは投票の集計（多数決・タイブレーク）を一切持たず、代わりに
// 「全員が回答したか」「その問題が無効かどうか」という進行の判定だけに専念する。
//
// 【最終順位の計算をこのファイルに置かない理由】各問題の確定結果（instantQuestionOutcomes、
// 誰が何を選び、正解したか・再視聴を何回使ったか）は、答え合わせ画面のために元々全員へ
// Firebaseで同期される（js/instantBattleFirebase.js参照）。そのため、最終順位に必要な
// 「自分の正解数・正解した問題だけの再視聴合計」は、ホストだけでなく参加者の端末でも
// 同じ同期済みデータから独立に計算できる。この対称性を活かし、他のオンライン対戦
// （タイムアタック等）と全く同じ「各自が自分の結果をresults/{uid}へ書く」既存の仕組みを
// そのまま再利用する（js/battleModes/instantBattleMode.jsのcompareResults()が比較する）。
// このファイルはそのための材料（summarizePlayerOutcomes()）だけを提供する。
//
// 【一瞬バトルの新しい進行ルール（本人指示、2026-09-15確定）】
// ・全員が同じ問題を同時に見て、同じ音源を聞き、各自が個別に回答（または「わからない」）を選ぶ。
// ・回答中、他プレイヤーの回答内容は完全に秘密。「回答済み／未回答」の状態だけが見える。
// ・全員が回答したら、全員の回答・正誤・その問題で使った「もう一度聞く」回数を同時に公開する
//   （5秒間の答え合わせ画面。js/onlineInstantBattleScreen.js側の定数で管理）。
// ・音源再生に失敗した参加者がいた問題は、一瞬協力と全く同じ考え方で「無効」（問題数を
//   消費せず、得点にも一切影響しない）として扱い、予備曲へ差し替える。
//
// 【順位判定（本人指示、2026-09-15確定）】
// ①正解数が多い順。②同数なら、「正解した問題でだけ」使った『もう一度聞く』の合計回数が
// 少ない順（不正解・わからないの問題で使った再視聴は、この比較には一切使わない）。
// ③それでも並んだら、本当の同着（同順位）として扱う。回答時間・不正解数・わからない数は
// 順位に一切使わない（本人指示：明示的に除外）。実際の比較はjs/battleModes/
// instantBattleMode.jsのcompareResults()が行う（js/battleModes/index.jsのcomputeFinisherRanks()
// が、一瞬バトルは完全同着を同じ順位として扱うことは既に対応済み）。
//
// 【状態の形】
// {
//   status: "inProgress" | "finished" | MATCH_STATUS_ABORTED_AUDIO_FAILURE,
//   allPlayerUids: string[],
//   hostUid: string,
//   questions: buildQuestions()の戻り値そのまま（js/battleModes/instantBattleMode.jsを再利用）,
//   targetQuestionCount: number,
//   consecutiveVoidCount: number,
//   resolvedQuestionCount: number,  // 無効でなかった、確定済みの問題数
//   currentQuestionIndex: number,
//   currentQuestion: {
//     status: "collecting" | "resolved",
//     startedAt: number,
//     resolvedAt: number | null,
//     answersByUid: { [uid]: { selectedSongId: string, replayCount: number } },
//     outcome: null | { isVoid: true } | { isVoid: false, perPlayerOutcome: { [uid]: QuestionOutcome } },
//   },
// }
//
// QuestionOutcome: { isCorrect: boolean, isUnknown: boolean, selectedSongId: string, replayCount: number }

export const UNKNOWN_ANSWER = "unknown";
// 【音源再生失敗時の公平性対策】js/instantCoopMatchProgress.jsと同じ値・同じ考え方。
export const MAX_CONSECUTIVE_VOID_QUESTIONS = 3;
export const MATCH_STATUS_ABORTED_AUDIO_FAILURE = "abortedAudioFailure";

export function createMatchProgress({ questions, allPlayerUids, hostUid, nowMs, targetQuestionCount }) {
  const hasQuestions = questions.length > 0;
  return {
    status: hasQuestions ? "inProgress" : "finished",
    allPlayerUids,
    hostUid,
    questions,
    targetQuestionCount: targetQuestionCount ?? questions.length,
    consecutiveVoidCount: 0,
    resolvedQuestionCount: 0,
    currentQuestionIndex: 0,
    currentQuestion: createFreshQuestionState(nowMs),
  };
}

function createFreshQuestionState(nowMs) {
  return { status: "collecting", startedAt: nowMs, resolvedAt: null, answersByUid: {}, outcome: null };
}

// ===== 1問中の回答（1人1回答・write-once） =====
export function recordAnswer(state, uid, answer) {
  if (state.status !== "inProgress") return state;
  if (state.currentQuestion.status !== "collecting") return state;
  if (uid in state.currentQuestion.answersByUid) return state;

  return {
    ...state,
    currentQuestion: {
      ...state.currentQuestion,
      answersByUid: { ...state.currentQuestion.answersByUid, [uid]: answer },
    },
  };
}

function haveAllAnswered(answersByUid, allPlayerUids) {
  return allPlayerUids.every((uid) => uid in answersByUid);
}

// 【エクスポートする理由】画面側が「あと何人の回答を待っているか」を表示するために使う。
export function countAnsweredPlayers(answersByUid, allPlayerUids) {
  return allPlayerUids.filter((uid) => uid in answersByUid).length;
}

// 呼び出し元（ホストの端末）が、Firebaseの変化を受けるたびに／定期タイマーで繰り返し呼ぶ
// ことを想定した、1回分の進行チェック。全員が回答済みになるまで、何度呼ばれても何もしない。
export function tick(state, nowMs, hasAudioFailureReport = false) {
  if (state.status !== "inProgress") return state;
  if (state.currentQuestion.status !== "collecting") return state;

  if (hasAudioFailureReport) {
    return resolveCurrentQuestion(state, { isVoid: true }, nowMs);
  }

  const allAnswered = haveAllAnswered(state.currentQuestion.answersByUid, state.allPlayerUids);
  if (!allAnswered) return state;

  const correctSongId = state.questions[state.currentQuestionIndex].song.id;
  const perPlayerOutcome = {};
  for (const uid of state.allPlayerUids) {
    const answer = state.currentQuestion.answersByUid[uid];
    const isUnknown = answer.selectedSongId === UNKNOWN_ANSWER;
    perPlayerOutcome[uid] = {
      isCorrect: !isUnknown && answer.selectedSongId === correctSongId,
      isUnknown,
      selectedSongId: answer.selectedSongId,
      replayCount: answer.replayCount,
    };
  }
  return resolveCurrentQuestion(state, { isVoid: false, perPlayerOutcome }, nowMs);
}

function resolveCurrentQuestion(state, outcome, nowMs) {
  return {
    ...state,
    currentQuestion: { ...state.currentQuestion, status: "resolved", resolvedAt: nowMs, outcome },
  };
}

export function canAdvanceToNextQuestion(state) {
  return state.status === "inProgress" && state.currentQuestion.status === "resolved";
}

// 確定済みの問題から、次の問題へ進める（ホスト限定の操作という想定。
// js/instantCoopMatchProgress.jsのadvanceToNextQuestion()と同じ役割分担）。
export function advanceToNextQuestion(state, nowMs) {
  if (!canAdvanceToNextQuestion(state)) return state;

  const isVoid = state.currentQuestion.outcome?.isVoid === true;
  const resolvedQuestionCount = isVoid ? state.resolvedQuestionCount : state.resolvedQuestionCount + 1;
  const consecutiveVoidCount = isVoid ? state.consecutiveVoidCount + 1 : 0;
  const nextIndex = state.currentQuestionIndex + 1;

  if (consecutiveVoidCount >= MAX_CONSECUTIVE_VOID_QUESTIONS) {
    return { ...state, status: MATCH_STATUS_ABORTED_AUDIO_FAILURE, currentQuestionIndex: nextIndex, resolvedQuestionCount, consecutiveVoidCount };
  }
  if (resolvedQuestionCount >= state.targetQuestionCount) {
    return { ...state, status: "finished", currentQuestionIndex: nextIndex, resolvedQuestionCount, consecutiveVoidCount };
  }
  if (nextIndex >= state.questions.length) {
    // 採点対象の問題数にまだ届いていないのに、予備を含めても曲が尽きた場合。
    return { ...state, status: MATCH_STATUS_ABORTED_AUDIO_FAILURE, currentQuestionIndex: nextIndex, resolvedQuestionCount, consecutiveVoidCount };
  }
  return {
    ...state,
    currentQuestionIndex: nextIndex,
    currentQuestion: createFreshQuestionState(nowMs),
    resolvedQuestionCount,
    consecutiveVoidCount,
  };
}

// ===== 1人分の成績集計（本人指示：正解数→正解した問題だけの再視聴合計、の順で順位付け） =====
//
// 【なぜ「正解した問題だけ」の再視聴回数か】本人指示：不正解・わからないの問題で
// 何度再視聴しても、その問題ではどうせ得点していないため順位には関係させない、
// という考え方（「正解できた問題を、どれだけ再視聴に頼らず当てられたか」を見る）。
//
// outcomes: この人の、無効でなかった問題ぶんのQuestionOutcome[]（呼び出し元が
// Firebaseのmatches/{matchId}/instantQuestionOutcomesから、自分のuid分だけ集めて渡す）。
export function summarizePlayerOutcomes(outcomes) {
  const correctOutcomes = outcomes.filter((outcome) => outcome.isCorrect);
  return {
    totalQuestions: outcomes.length,
    correctCount: correctOutcomes.length,
    wrongCount: outcomes.filter((outcome) => !outcome.isCorrect && !outcome.isUnknown).length,
    dontKnowCount: outcomes.filter((outcome) => outcome.isUnknown).length,
    // 順位判定に使う値（本人指示の②。js/battleModes/instantBattleMode.jsのcompareResults()参照）。
    correctOnlyReplaySum: correctOutcomes.reduce((sum, outcome) => sum + outcome.replayCount, 0),
    // 参考記録として表示するだけの、全問題を通した再視聴合計（順位には使わない）。
    totalReplayCount: outcomes.reduce((sum, outcome) => sum + outcome.replayCount, 0),
  };
}

// ===== 最終結果（全員分の順位を1回で計算する） =====
//
// 【なぜここで受け取るのがquestionOutcomesByIndexか】各問題の確定結果（isVoid・
// perPlayerOutcome）は、答え合わせ画面のために元々Firebaseで全員へ同期される
// （js/instantBattleFirebase.js参照）。ホストはこの関数を、進行が終わった瞬間に
// match.instantQuestionOutcomesをそのまま渡して1回だけ呼び、全員分の順位まで
// まとめて計算してからFirebaseへ書く（js/instantCoopBattleFirebase.jsの
// finalizeCoopMatch()と同じ「host-finalizes-once」パターン）。
export function computeFinalResults({ allPlayerUids, questionOutcomesByIndex }) {
  const nonVoidOutcomes = Object.values(questionOutcomesByIndex ?? {}).filter((outcome) => outcome && outcome.isVoid !== true);

  const resultsByUid = {};
  for (const uid of allPlayerUids) {
    const outcomes = nonVoidOutcomes.map((outcome) => outcome.perPlayerOutcome?.[uid]).filter(Boolean);
    resultsByUid[uid] = summarizePlayerOutcomes(outcomes);
  }

  const rankedUids = [...allPlayerUids].sort((uidA, uidB) => compareInstantBattlePlayerResults(resultsByUid[uidA], resultsByUid[uidB]));
  let currentRank = 1;
  rankedUids.forEach((uid, index) => {
    if (index > 0 && compareInstantBattlePlayerResults(resultsByUid[rankedUids[index - 1]], resultsByUid[uid]) !== 0) {
      currentRank = index + 1;
    }
    resultsByUid[uid].rank = currentRank;
  });

  return resultsByUid;
}

// 本人指示の順位判定：①正解数が多い順、②正解した問題だけの再視聴合計が少ない順。
// ③それでも同じなら0（本当の同着）。回答時間・不正解数・わからない数は一切見ない。
export function compareInstantBattlePlayerResults(resultA, resultB) {
  if (resultA.correctCount !== resultB.correctCount) return resultB.correctCount - resultA.correctCount;
  return resultA.correctOnlyReplaySum - resultB.correctOnlyReplaySum;
}

// ===== ホストのリロード・再接続からの復元 =====
//
// 【なぜ必要か】js/instantCoopMatchProgress.jsのrestoreMatchProgressFromFirebase()と同じ理由。
// このstateはホストの端末のメモリ上にしか存在しないため、リロード・一時切断で失われる。
// Firebase側には確定済みの各問題の結果（matches/{matchId}/instantQuestionOutcomes、
// js/instantBattleFirebase.jsのresolveInstantBattleQuestion()が書き込む）が残っているため、
// それを読み直すだけで進行状態を再構築できる。
//
// match: Firebaseから読んだ生データ（rooms/{roomId}/matches/{matchId}の中身の一部）:
//   { currentQuestionIndex, questionStatus: "active"|"resolved",
//     instantAnswers: { [questionIndex]: { [uid]: { selectedSongId, replayCount } } },
//     instantQuestionOutcomes: { [questionIndex]: { isVoid, perPlayerOutcome } } }
export function restoreMatchProgressFromFirebase({ questions, allPlayerUids, hostUid, match, nowMs, targetQuestionCount }) {
  const currentIndex = Math.min(match.currentQuestionIndex ?? 0, questions.length);
  const isCurrentResolved = match.questionStatus === "resolved";
  const replayUpToIndex = isCurrentResolved ? currentIndex : currentIndex - 1;

  let resolvedQuestionCount = 0;
  let consecutiveVoidCount = 0;
  for (let questionIndex = 0; questionIndex <= replayUpToIndex && questionIndex < questions.length; questionIndex++) {
    const outcome = match.instantQuestionOutcomes?.[questionIndex];
    if (!outcome) continue;
    if (outcome.isVoid) {
      consecutiveVoidCount += 1;
      continue;
    }
    consecutiveVoidCount = 0;
    resolvedQuestionCount += 1;
  }

  const resolvedTargetQuestionCount = targetQuestionCount ?? questions.length;
  const hasFinishedAllQuestions = resolvedQuestionCount >= resolvedTargetQuestionCount || currentIndex >= questions.length;

  const rawAnswersForCurrent = match.instantAnswers?.[currentIndex] ?? {};
  const answersByUid = Object.fromEntries(
    Object.entries(rawAnswersForCurrent).map(([uid, answer]) => [uid, { selectedSongId: answer.selectedSongId, replayCount: answer.replayCount }])
  );

  const currentQuestion = hasFinishedAllQuestions
    ? createFreshQuestionState(nowMs)
    : {
        status: isCurrentResolved ? "resolved" : "collecting",
        startedAt: nowMs,
        resolvedAt: isCurrentResolved ? nowMs : null,
        answersByUid: isCurrentResolved ? {} : answersByUid,
        outcome: isCurrentResolved ? (match.instantQuestionOutcomes?.[currentIndex] ?? null) : null,
      };

  return {
    status: hasFinishedAllQuestions ? "finished" : "inProgress",
    allPlayerUids,
    hostUid,
    questions,
    targetQuestionCount: resolvedTargetQuestionCount,
    consecutiveVoidCount,
    resolvedQuestionCount,
    currentQuestionIndex: currentIndex,
    currentQuestion,
  };
}
