// 一瞬協力 オンライン対戦「1試合分の進行状態」を、Firebase・画面から完全に切り離した
// 純粋関数として表現するモジュール（2026-08-31新設、本人指示：19-3章）。
// js/lyricsQuizMatchProgress.jsと同じ設計方針（進行状態はこのファイルの中だけで完結させ、
// Firebaseは保存・同期する層に限定する）を踏襲しているが、進行ルール自体は全く別物：
//
// 【一瞬協力のルール（本人指示）】
// ・全員が同じ音源を同時に聞き、各自が回答または「わからない」を選ぶ。
// ・全員回答したら、多数決でチームの回答を決める（「わからない」は投票に含めない）。
// ・同数（タイ）なら、同率トップの中から公平なランダムで1つを選ぶ
//   （seedベースの決定論的な乱数。js/lyricsQuizEngine.jsのcreateAnswerPoolRandomと
//   同じ考え方＝「毎回同じ入力なら同じ乱数列になる」ことを優先し、暗号強度は求めない）。
// ・全員「わからない」なら不正解として扱う。
// ・勝敗・個人成績ではなく、チーム全体の「全◯問中◯問正解」という成績だけを記録する。
//
// 【2026-09-05改訂、本人指示：49項目仕様書】以前は「同数なら共有の『もう一度聞く』
// （最大2回）→再投票」という、タイのときだけホスト主導で発生する再視聴ラウンドが
// あったが、これを廃止した。代わりに、各プレイヤーが投票前ならいつでも個別に無制限で
// 再視聴できるボタンをjs/onlineInstantCoopBattleScreen.js側に追加している（このファイルの
// 進行状態には一切登場しない＝各端末のローカルな見た目の話であり、多数決の結果には
// 影響しない）。そのため、タイになった場合は即座に下記のタイブレークへ進む
// （sharedReplayCount・MAX_SHARED_REPLAY_COUNTは、Firebase側のcoopRoundNumber等の
// 既存データ構造との互換性を保つためフィールド名だけ残しているが、常に0のまま
// 変化しない＝実質的に使われなくなった過去の名残）。
//
// 【状態の形】
// {
//   status: "inProgress" | "finished",
//   allPlayerUids: string[],
//   hostUid: string,
//   seed: number,   // タイブレークの決定論的乱数に使う（試合開始時に確定したroom.seed）
//   questions: buildQuestions()の戻り値そのまま（js/battleModes/instantBattleMode.jsを再利用）,
//   currentQuestionIndex: number,
//   currentQuestion: {
//     status: "collecting" | "resolved",
//     startedAt: number,
//     resolvedAt: number | null,
//     votesByUid: { [uid]: songId | "unknown" },  // 今の投票ラウンドの回答
//     sharedReplayCount: number,   // この問題で使った共有再視聴の回数（0〜2）
//     outcome: null | { teamAnswer: songId | null, isCorrect: boolean, usedTieBreakRandom: boolean },
//   },
//   teamHistory: QuestionOutcome[],  // 確定済みの問題結果を出題順に積む（チーム全体で1つ）
// }

import { createSeededRandom } from "./seededRandom.js";

export const UNKNOWN_VOTE = "unknown";
// 共有の「もう一度聞く」の上限（本人指示：最大2回）。
export const MAX_SHARED_REPLAY_COUNT = 2;
// 【2026-08-31新設、本人指示】投票タイムアウト：この時間（1つの投票ラウンドの開始から）
// 誰かが投票しないままだと、その人はこの問題（このラウンド）だけ「わからない」を
// 自動的に選んだものとして扱う（本人が押す「わからない」ボタンと完全に同じ結果になる。
// 退出・切断扱いにはせず、次の問題からは通常どおり参加できる）。回答候補の数
// （4択／10択／全曲検索）によらず一律20秒（本人指示：テンポの良さを優先し、複雑な
// 可変秒数にはしない）。
export const VOTE_TIMEOUT_MS = 20000;

export function createMatchProgress({ questions, allPlayerUids, hostUid, seed, nowMs }) {
  const hasQuestions = questions.length > 0;
  return {
    status: hasQuestions ? "inProgress" : "finished",
    allPlayerUids,
    hostUid,
    seed,
    questions,
    currentQuestionIndex: 0,
    currentQuestion: createFreshQuestionState(nowMs),
    teamHistory: [],
  };
}

function createFreshQuestionState(nowMs) {
  return { status: "collecting", startedAt: nowMs, resolvedAt: null, votesByUid: {}, sharedReplayCount: 0, outcome: null };
}

// ===== 1問中の投票（1人1回答・write-onceという制約をここでも再現する） =====
export function recordVote(state, uid, vote) {
  if (state.status !== "inProgress") return state;
  if (state.currentQuestion.status !== "collecting") return state;
  if (uid in state.currentQuestion.votesByUid) return state;

  return {
    ...state,
    currentQuestion: {
      ...state.currentQuestion,
      votesByUid: { ...state.currentQuestion.votesByUid, [uid]: vote },
    },
  };
}

function haveAllVoted(votesByUid, allPlayerUids) {
  return allPlayerUids.every((uid) => uid in votesByUid);
}

// 【エクスポートする理由】画面側が「あと何人の回答を待っているか」を表示するために使う。
export function countVotedPlayers(votesByUid, allPlayerUids) {
  return allPlayerUids.filter((uid) => uid in votesByUid).length;
}

// 投票を集計する（「わからない」は除外）。同率トップが複数あればタイ。
// 全員「わからない」（または誰も投票していない）ならwinners:[]を返す。
export function tallyVotes(votesByUid, allPlayerUids) {
  const counts = {};
  for (const uid of allPlayerUids) {
    const vote = votesByUid[uid];
    if (vote === undefined || vote === UNKNOWN_VOTE) continue;
    counts[vote] = (counts[vote] ?? 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return { winners: [], maxCount: 0 };
  const maxCount = Math.max(...entries.map(([, count]) => count));
  const winners = entries.filter(([, count]) => count === maxCount).map(([songId]) => songId);
  return { winners, maxCount };
}

// タイブレーク用の決定論的な乱数関数を作る（seed・questionIndex・そのときの再視聴回数から
// 導出する。同じ入力なら常に同じ結果になる。js/lyricsQuizEngine.jsのcreateAnswerPoolRandomと
// 同じ考え方）。
function createTieBreakRandom(seed, questionIndex, sharedReplayCount) {
  // 32bit範囲に収まるよう、単純な合成で十分（暗号強度は求めない、既存方針どおり）。
  const combinedSeed = (seed + (questionIndex + 1) * 100003 + sharedReplayCount * 7919) >>> 0;
  return createSeededRandom(combinedSeed);
}

// 呼び出し元（ホストの端末が、Firebaseの変化を受けるたびに／定期タイマーで）が繰り返し
// 呼ぶことを想定した、1回分の進行チェック。全員が「回答済み・自分でわからないを選択・
// タイムアウト」のいずれかになっていなければ何もしない。
// 【2026-08-31追加、本人指示】全員が投票し終えていなくても、今のラウンドの開始から
// VOTE_TIMEOUT_MS（20秒固定）が経過していれば、未投票者を「わからない」を選んだものとして
// 自動的に補完してから先へ進む（本人の指示どおり、退出・切断扱いにはしない。次の問題〈次の
// ラウンド〉からは通常どおり投票できる＝votesByUidは毎ラウンドごとにリセットされる既存の
// 仕組みがそのまま働く）。
// 全員分が揃ったら、多数決→タイなら再視聴→タイブレークの流れをこの1呼び出しの中で完結させる。
export function tick(state, nowMs) {
  if (state.status !== "inProgress") return state;
  if (state.currentQuestion.status !== "collecting") return state;

  const allVoted = haveAllVoted(state.currentQuestion.votesByUid, state.allPlayerUids);
  const isTimedOut = nowMs - state.currentQuestion.startedAt >= VOTE_TIMEOUT_MS;
  if (!allVoted && !isTimedOut) return state;

  // タイムアウトで未投票者が残っている場合だけ、この呼び出しの中だけで使う「投票済み扱いの
  // votesByUid」を作る（stateそのものへは書き戻さない。実際の書き込み〈Firebase側〉は、
  // 呼び出し元がこの後resolveCurrentQuestion/次ラウンドへの遷移を検知して行う）。
  const effectiveVotesByUid = allVoted
    ? state.currentQuestion.votesByUid
    : (() => {
        const filled = { ...state.currentQuestion.votesByUid };
        for (const uid of state.allPlayerUids) {
          if (!(uid in filled)) filled[uid] = UNKNOWN_VOTE;
        }
        return filled;
      })();

  const { winners } = tallyVotes(effectiveVotesByUid, state.allPlayerUids);
  const correctSongId = state.questions[state.currentQuestionIndex].song.id;
  // 以降の分岐（再投票ラウンドへ進む場合を含む）で使うstateは、タイムアウト補完後の
  // votesByUidを反映したものにしておく（呼び出し元がFirebaseへの反映内容を正しく検知できるよう、
  // 実際にstateへ書き戻す）。
  state = { ...state, currentQuestion: { ...state.currentQuestion, votesByUid: effectiveVotesByUid } };

  if (winners.length === 0) {
    // 全員「わからない」→ 不正解として確定。
    return resolveCurrentQuestion(state, { teamAnswer: null, isCorrect: false, usedTieBreakRandom: false }, nowMs);
  }

  if (winners.length === 1) {
    const teamAnswer = winners[0];
    return resolveCurrentQuestion(
      state,
      { teamAnswer, isCorrect: teamAnswer === correctSongId, usedTieBreakRandom: false },
      nowMs
    );
  }

  // 【2026-09-05改訂】以前はここで「共有の再視聴がまだ残っていれば再投票ラウンドへ」
  // 進んでいたが、その仕組み自体を廃止したため、タイになったら即座にタイブレークへ進む。
  // 同率タイ → 同率トップの中から決定論的な乱数で1つ選ぶ。
  const randomFn = createTieBreakRandom(state.seed, state.currentQuestionIndex, state.currentQuestion.sharedReplayCount);
  const pickedIndex = Math.floor(randomFn() * winners.length);
  const teamAnswer = winners[pickedIndex];
  return resolveCurrentQuestion(
    state,
    { teamAnswer, isCorrect: teamAnswer === correctSongId, usedTieBreakRandom: true },
    nowMs
  );
}

function resolveCurrentQuestion(state, outcome, nowMs) {
  // sharedReplayCountをoutcome自身に含めておく（advanceToNextQuestion()がteamHistoryへ
  // 積む際、この値も一緒に残るようにするため。finalizeMatch()の合計再視聴回数の集計に使う）。
  const outcomeWithReplayCount = { ...outcome, sharedReplayCount: state.currentQuestion.sharedReplayCount };
  return {
    ...state,
    currentQuestion: { ...state.currentQuestion, status: "resolved", resolvedAt: nowMs, outcome: outcomeWithReplayCount },
  };
}

export function canAdvanceToNextQuestion(state) {
  return state.status === "inProgress" && state.currentQuestion.status === "resolved";
}

// 確定済みの問題から、次の問題へ進める（ホスト限定の操作という想定。js/lyricsQuizMatchProgress.js
// のadvanceToNextQuestion()と同じ役割分担：「誰が呼んだか」の検証はFirebaseセキュリティ
// ルール側の役割で、この純粋関数は「今の状態として進めてよいか」だけを守る）。
export function advanceToNextQuestion(state, nowMs) {
  if (!canAdvanceToNextQuestion(state)) return state;

  const teamHistory = [...state.teamHistory, state.currentQuestion.outcome];
  const nextIndex = state.currentQuestionIndex + 1;
  if (nextIndex >= state.questions.length) {
    return { ...state, status: "finished", currentQuestionIndex: nextIndex, teamHistory };
  }
  return {
    ...state,
    currentQuestionIndex: nextIndex,
    currentQuestion: createFreshQuestionState(nowMs),
    teamHistory,
  };
}

// ===== 最終結果（チーム全体で1つ。個人成績は持たない） =====
export function finalizeMatch(state) {
  if (state.status !== "finished") return null;

  const totalQuestions = state.teamHistory.length;
  const correctCount = state.teamHistory.filter((outcome) => outcome.isCorrect).length;
  const totalSharedReplayCount = state.teamHistory.reduce((sum, outcome) => sum + (outcome.sharedReplayCount ?? 0), 0);
  return { totalQuestions, correctCount, totalSharedReplayCount };
}

// ===== ホストのリロード・再接続からの復元 =====
//
// 【なぜ必要か】js/lyricsQuizMatchProgress.jsのrestoreMatchProgressFromFirebase()と同じ理由。
// このstateはホストの端末のメモリ上にしか存在しないため、リロード・一時切断で失われる。
// Firebase側には確定済みの各問題の結果（matches/{matchId}/coopQuestionOutcomes、
// resolveCoopQuestion()が書き込む）が残っているため、それを読み直すだけでteamHistoryを
// 再構築できる。今の問題（まだ確定していない）の投票状況は、そのまま今のラウンドの
// votesByUidとして復元する。
//
// match: Firebaseから読んだ生データ（rooms/{roomId}/matches/{matchId}の中身の一部）:
//   { currentQuestionIndex, questionStatus: "active"|"resolved", coopRoundNumber,
//     coopVotes: { [questionIndex]: { [roundNumber]: { [uid]: { selectedSongId } } } },
//     coopQuestionOutcomes: { [questionIndex]: { teamAnswer, isCorrect, usedTieBreakRandom, sharedReplayCount } } }
export function restoreMatchProgressFromFirebase({ questions, allPlayerUids, hostUid, seed, match, nowMs }) {
  const currentIndex = Math.min(match.currentQuestionIndex ?? 0, questions.length);
  const isCurrentResolved = match.questionStatus === "resolved";
  const replayUpToIndex = isCurrentResolved ? currentIndex : currentIndex - 1;

  const teamHistory = [];
  for (let questionIndex = 0; questionIndex <= replayUpToIndex && questionIndex < questions.length; questionIndex++) {
    const outcome = match.coopQuestionOutcomes?.[questionIndex];
    if (outcome) teamHistory.push(outcome);
  }

  const hasFinishedAllQuestions = currentIndex >= questions.length;
  const currentRoundNumber = match.coopRoundNumber ?? 0;
  const rawVotesForCurrentRound = match.coopVotes?.[currentIndex]?.[currentRoundNumber] ?? {};
  const votesByUid = Object.fromEntries(
    Object.entries(rawVotesForCurrentRound).map(([uid, vote]) => [uid, vote.selectedSongId])
  );

  const currentQuestion = hasFinishedAllQuestions
    ? createFreshQuestionState(nowMs)
    : {
        status: isCurrentResolved ? "resolved" : "collecting",
        startedAt: nowMs,
        resolvedAt: isCurrentResolved ? nowMs : null,
        votesByUid: isCurrentResolved ? {} : votesByUid,
        sharedReplayCount: currentRoundNumber,
        outcome: isCurrentResolved ? (match.coopQuestionOutcomes?.[currentIndex] ?? null) : null,
      };

  return {
    status: hasFinishedAllQuestions ? "finished" : "inProgress",
    allPlayerUids,
    hostUid,
    seed,
    questions,
    currentQuestionIndex: currentIndex,
    currentQuestion,
    teamHistory,
  };
}
