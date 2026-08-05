// 歌詞クイズ オンライン対戦「1試合分の進行状態」を、Firebase・画面から完全に切り離した
// 純粋関数として表現するモジュール（設計⑩⑥）。
//
// 【狙い】進行状態（今何問目か・各問題が進行中/確定済みか・誰が何を回答したか・
// 誰が奪い取ったか・コンボの推移・DNF・切断状態）をこのファイルの中だけで完結させ、
// 「Firebaseはこの状態を保存・同期する層に限定する」という設計にする。こうしておけば、
// 次フェーズでFirebaseへ実際に書き込む処理を足すときも、進行ロジック自体はここで
// 既にテスト済みのものをそのまま使い回せる（デバッグしやすさを優先した設計）。
//
// このファイルはjs/battleModes/lyricsQuizBattleMode.js経由でのみbattleRulesの機能を使い、
// js/battleRules/index.jsを直接importしない（既存の設計方針の踏襲）。
//
// 【状態の形】
// {
//   status: "inProgress" | "finished",
//   allPlayerUids: string[],
//   hostUid: string,
//   questions: buildQuestions()の戻り値そのまま（song.idを正解判定に使う）,
//   currentQuestionIndex: number,
//   currentQuestion: {
//     status: "active" | "resolved",
//     startedAt: number,      // この問題が始まった仮想時刻（実運用ではサーバー時刻）
//     resolvedAt: number | null,
//     answersByUid: { [uid]: { selectedSongId, hintLevel, submittedAt } },
//     winner: { uid, submittedAt } | null,   // 奪い取りルールのみ使う
//   },
//   comboCountByUid: { [uid]: number },   // コンボルールのみ使う。問題をまたいで引き継ぐ
//   historyByUid: { [uid]: QuestionOutcome[] },  // 確定済みの問題結果を出題順に積み上げる
//   playerConnection: { [uid]: "connected" | "disconnected" },
//   dnfUids: string[],   // 試合を最後まで完走できなかった参加者
// }

import * as lyricsQuizBattleMode from "./battleModes/lyricsQuizBattleMode.js";
import { SKIP_SELECTION, MAX_HINT_LEVEL } from "./battleModes/lyricsQuizBattleMode.js";

// ===== 試合の作成 =====

export function createMatchProgress({ questions, allPlayerUids, hostUid, nowMs }) {
  const hasQuestions = questions.length > 0;
  return {
    status: hasQuestions ? "inProgress" : "finished",
    allPlayerUids,
    hostUid,
    questions,
    currentQuestionIndex: 0,
    currentQuestion: hasQuestions
      ? { status: "active", startedAt: nowMs, resolvedAt: null, answersByUid: {}, winner: null }
      : { status: "resolved", startedAt: nowMs, resolvedAt: nowMs, answersByUid: {}, winner: null },
    comboCountByUid: Object.fromEntries(allPlayerUids.map((uid) => [uid, 0])),
    historyByUid: Object.fromEntries(allPlayerUids.map((uid) => [uid, []])),
    playerConnection: Object.fromEntries(allPlayerUids.map((uid) => [uid, "connected"])),
    dnfUids: [],
  };
}

// ===== 1問中の回答・奪い取り（本人限定・1回だけ、という制約をここでも再現する） =====

// 1人1回答（write-once）。既に回答済み・問題が進行中でない・DNF済みの場合は
// 何もせず同じstateを返す（実際のFirebaseセキュリティルールが最終的に強制する内容を、
// ローカルの進行シミュレーションでも矛盾なく再現するための設計）。
export function recordAnswer(state, uid, answer) {
  if (state.status !== "inProgress") return state;
  if (state.currentQuestion.status !== "active") return state;
  if (state.dnfUids.includes(uid)) return state;
  if (uid in state.currentQuestion.answersByUid) return state;

  return {
    ...state,
    currentQuestion: {
      ...state.currentQuestion,
      answersByUid: { ...state.currentQuestion.answersByUid, [uid]: answer },
    },
  };
}

// 奪い取り専用。write-once：既にwinnerが確定していれば何もしない
// （Firebaseのquestion Claims/{questionIndex}/winnerへの!data.exists()書き込みと同じ挙動）。
export function recordStealClaim(state, uid, submittedAt) {
  if (state.status !== "inProgress") return state;
  if (state.currentQuestion.status !== "active") return state;
  if (state.currentQuestion.winner) return state;

  return {
    ...state,
    currentQuestion: { ...state.currentQuestion, winner: { uid, submittedAt } },
  };
}

// ===== 接続状態・DNF =====

export function setPlayerConnection(state, uid, connectionStatus) {
  return { ...state, playerConnection: { ...state.playerConnection, [uid]: connectionStatus } };
}

// 【設計⑪①・完走済み結果を上書きしない】DNFにできるのは「まだ全問の結果が
// 揃っていない」プレイヤーだけ。すでに全問分の履歴がある（＝完走済み）プレイヤーを
// 誤ってDNF扱いにしてしまうと、本当は正しく届いていた結果がcompleted:falseへ
// 上書きされてしまうため、ここで確実に弾く。既にDNF済みへの再呼び出しも
// 何も変えない（冪等）。
export function markPlayerDnf(state, uid) {
  if (state.dnfUids.includes(uid)) return state;
  const answeredCount = state.historyByUid[uid]?.length ?? 0;
  const totalQuestions = state.questions.length;
  if (answeredCount >= totalQuestions) return state; // 完走済みはDNFにできない
  return { ...state, dnfUids: [...state.dnfUids, uid] };
}

// ホストが切断中は、現在の問題が確定済みでも次の問題へ進められない
// （追記⑧⑤：進行の確定はホスト限定の書き込みのため。ヒント進行・本人の回答自体は
// 各端末が独立に続けられるので、この関数はあくまで「進める」操作だけをガードする）。
export function canAdvanceToNextQuestion(state) {
  return (
    state.status === "inProgress" &&
    state.currentQuestion.status === "resolved" &&
    state.playerConnection[state.hostUid] === "connected"
  );
}

// ===== 問題の終了判定・確定 =====

// 未回答のまま期限切れになったプレイヤーを、スキップとして扱うための補完。
// 「何もしなかった」ことが、回答した人より不利にも有利にもならないよう
// （historyの長さが人によって変わらないよう）、明示的にスキップ扱いの回答を合成する。
// 【Phase6.5でexport化】restoreMatchProgressFromFirebase()（同ファイル内）が、
// ホストのリロード復帰時に過去問題を再現するためにも使うため公開した。
export function fillMissingAnswersWithTimeoutSkip(answersByUid, activePlayerUids, nowMs) {
  const filled = { ...answersByUid };
  for (const uid of activePlayerUids) {
    if (!(uid in filled)) {
      filled[uid] = { selectedSongId: SKIP_SELECTION, hintLevel: MAX_HINT_LEVEL, submittedAt: nowMs };
    }
  }
  return filled;
}

function buildQuestionContext(state, settings, nowMs) {
  const activePlayerUids = state.allPlayerUids.filter((uid) => !state.dnfUids.includes(uid));
  const correctSongId = state.questions[state.currentQuestionIndex].song.id;
  return {
    answersByUid: state.currentQuestion.answersByUid,
    correctSongId,
    winner: state.currentQuestion.winner,
    comboCountByUid: state.comboCountByUid,
    questionStartedAt: state.currentQuestion.startedAt,
    allPlayerUids: activePlayerUids,
    nowMs,
    settings,
  };
}

// 呼び出し元（将来はFirebaseの変化を受けるたびに／定期タイマーで）が繰り返し呼ぶことを
// 想定した、1回分の進行チェック。終了条件を満たしていなければ何もしない。
// 満たしていれば、その問題を確定（resolve）する：battleRules経由で参加者ごとの結果を
// 導出し、historyByUid・comboCountByUidへ反映し、currentQuestion.statusを"resolved"にする。
// （次の問題へ進める＝advanceToNextQuestion()は、ここでは呼ばない。結果を少し見せる間を
// 置いてから進める、という追記⑨の二段階設計をそのまま再現するため。）
export function tick(state, settings, nowMs) {
  if (state.status !== "inProgress") return state;
  if (state.currentQuestion.status !== "active") return state;

  const context = buildQuestionContext(state, settings, nowMs);
  if (!lyricsQuizBattleMode.shouldEndQuestion(settings, context)) return state;

  // 期限切れで終了した場合（全員回答済みではない場合）、未回答者をスキップ扱いで補完する。
  const isTimeoutEnd = context.allPlayerUids.some((uid) => !(uid in context.answersByUid));
  const answersByUid = isTimeoutEnd
    ? fillMissingAnswersWithTimeoutSkip(context.answersByUid, context.allPlayerUids, nowMs)
    : context.answersByUid;

  const outcomesByUid = lyricsQuizBattleMode.resolveQuestionAnswers(settings, { ...context, answersByUid });

  const nextHistoryByUid = { ...state.historyByUid };
  const nextComboCountByUid = { ...state.comboCountByUid };
  for (const uid of context.allPlayerUids) {
    const outcome = outcomesByUid[uid];
    if (!outcome) continue;
    nextHistoryByUid[uid] = [...(nextHistoryByUid[uid] ?? []), outcome];
    nextComboCountByUid[uid] = outcome.nextComboCount;
  }

  return {
    ...state,
    historyByUid: nextHistoryByUid,
    comboCountByUid: nextComboCountByUid,
    currentQuestion: { ...state.currentQuestion, status: "resolved", resolvedAt: nowMs },
  };
}

// 確定済みの問題から、次の問題へ進める（ホスト限定の操作という想定。「誰が呼んだか」の
// 検証はFirebaseセキュリティルール側の役割でこの純粋関数は行わないが、「今の状態として
// 進めてよいか」（問題が確定済みか・ホストが接続中か）はcanAdvanceToNextQuestion()と
// 同じ条件をここでも守る。満たしていなければ何もせず同じstateを返す。
// 最後の問題を終えていれば、試合全体をfinishedにする。
export function advanceToNextQuestion(state, nowMs) {
  if (!canAdvanceToNextQuestion(state)) return state;

  const nextIndex = state.currentQuestionIndex + 1;
  if (nextIndex >= state.questions.length) {
    return { ...state, status: "finished", currentQuestionIndex: nextIndex };
  }
  return {
    ...state,
    currentQuestionIndex: nextIndex,
    currentQuestion: { status: "active", startedAt: nowMs, resolvedAt: null, answersByUid: {}, winner: null },
  };
}

// ===== 最終結果 =====

// 試合が終了（status === "finished"）していなければnullを返す。
// DNFの参加者は、完走した参加者より必ず下位に置く（completed:falseへ上書きする）。
// DNF同士は、回答できた問題数が多い方を上位とする（既存のLOVE連チャンの
// 「到達数」による順位付けと同じ考え方）。
//
// 【設計⑪①・二重の安全策】dnfUidsをそのまま信用せず、「実際に全問分の履歴が
// 揃っているか」をここでも再計算する。markPlayerDnf()が既に完走済みプレイヤーを
// 弾いているため通常は起こらないはずだが、万一の不整合があっても、完走済みの結果を
// 誤ってcompleted:falseへ上書きしないよう、finalizeMatch自身でも判定し直す。
export function finalizeMatch(state, settings) {
  if (state.status !== "finished") return null;

  const totalQuestions = state.questions.length;
  const entries = state.allPlayerUids.map((uid) => {
    const answeredCount = state.historyByUid[uid]?.length ?? 0;
    const isActuallyComplete = answeredCount >= totalQuestions;
    const isDnf = state.dnfUids.includes(uid) && !isActuallyComplete;
    const rawResult = lyricsQuizBattleMode.createResult(state.historyByUid[uid] ?? [], settings);
    return { uid, isDnf, result: { ...rawResult, completed: !isDnf } };
  });

  entries.sort((entryA, entryB) => {
    if (entryA.isDnf !== entryB.isDnf) return entryA.isDnf ? 1 : -1;
    if (entryA.isDnf) {
      const answeredA = state.historyByUid[entryA.uid]?.length ?? 0;
      const answeredB = state.historyByUid[entryB.uid]?.length ?? 0;
      return answeredB - answeredA;
    }
    return lyricsQuizBattleMode.compareResults(entryA.result, entryB.result, settings);
  });

  return entries;
}

// ===== ホストのリロード・再接続からの復元（Phase6.5新設） =====
//
// 【なぜ必要か】この状態（state）はホストの端末のメモリ上にしか存在しない。ホストが
// ページをリロードする、または一時的に切断して再接続すると、メモリ上の状態は失われる。
// 一方Firebase側には「今何問目か・各問題が進行中か確定済みか・誰が何を回答したか・
// 誰が奪い取ったか」がすべて残っているため、それらを読み直すだけで進行状態を再構築できる
// （本人の指示どおり、既存のオンライン対戦で確認済みの「一時切断→復帰→結果確定まで再開できる」
// という思想を、歌詞クイズ対戦でも維持する）。
//
// 【過去問題のresponseMsについての既知の制約】Firebaseが保持しているのは「現在の問題の
// 開始時刻」（match.currentQuestionStartedAt）だけで、既に通過した問題の開始時刻は
// 次の問題が始まった時点で上書きされ失われている。得点・コンボ・正誤判定は
// 自己申告のhintLevelを使うため一切影響しないが、通過済み問題のresponseMs（反応時間の
// 表示用の値）だけは、この関数の中では0（questionStartedAt:0で計算した値）になる。
// 正確な値ではないが、採点・順位には影響しない既知の制約として設計書にも記録している。
//
// match: Firebaseから読んだ生データ（rooms/{roomId}/matches/{matchId}の中身の一部）:
//   { currentQuestionIndex, questionStatus: "active"|"resolved", currentQuestionStartedAt,
//     resolvedAt, answers: { [questionIndex]: { [uid]: answer } },
//     questionClaims: { [questionIndex]: { winner } } }
// questionsは呼び出し元が（seed・settingsから）別途組み立て済みのものを渡す
// （このファイルはFirebase・歌詞データに一切触れないため）。
export function restoreMatchProgressFromFirebase({ questions, allPlayerUids, hostUid, match, settings, nowMs }) {
  let historyByUid = Object.fromEntries(allPlayerUids.map((uid) => [uid, []]));
  let comboCountByUid = Object.fromEntries(allPlayerUids.map((uid) => [uid, 0]));

  const currentIndex = Math.min(match.currentQuestionIndex ?? 0, questions.length);
  const isCurrentResolved = match.questionStatus === "resolved";
  // 出題順に見て、historyByUidへ積むべき最後のインデックス。現在の問題も確定済みなら含める
  // （tick()が「確定」と「historyへ積む」を同時に行う既存の挙動と合わせるため）。
  const replayUpToIndex = isCurrentResolved ? currentIndex : currentIndex - 1;

  for (let questionIndex = 0; questionIndex <= replayUpToIndex && questionIndex < questions.length; questionIndex++) {
    const question = questions[questionIndex];
    const rawAnswers = (match.answers ?? {})[questionIndex] ?? {};
    const answersByUid = fillMissingAnswersWithTimeoutSkip(rawAnswers, allPlayerUids, nowMs);
    const context = {
      answersByUid,
      correctSongId: question.song.id,
      winner: (match.questionClaims ?? {})[questionIndex]?.winner ?? null,
      comboCountByUid,
      questionStartedAt: 0, // 過去問題の実際の開始時刻は失われているため、既知の制約として0扱い
      allPlayerUids,
      nowMs: 0,
      settings,
    };
    const outcomesByUid = lyricsQuizBattleMode.resolveQuestionAnswers(settings, context);
    const nextHistoryByUid = { ...historyByUid };
    const nextComboCountByUid = { ...comboCountByUid };
    for (const uid of allPlayerUids) {
      const outcome = outcomesByUid[uid];
      if (!outcome) continue;
      nextHistoryByUid[uid] = [...(nextHistoryByUid[uid] ?? []), outcome];
      nextComboCountByUid[uid] = outcome.nextComboCount;
    }
    historyByUid = nextHistoryByUid;
    comboCountByUid = nextComboCountByUid;
  }

  const hasFinishedAllQuestions = currentIndex >= questions.length;
  const currentQuestion = hasFinishedAllQuestions
    ? { status: "resolved", startedAt: match.currentQuestionStartedAt ?? nowMs, resolvedAt: match.resolvedAt ?? nowMs, answersByUid: {}, winner: null }
    : {
        status: isCurrentResolved ? "resolved" : "active",
        startedAt: match.currentQuestionStartedAt ?? nowMs,
        resolvedAt: isCurrentResolved ? match.resolvedAt ?? nowMs : null,
        answersByUid: (match.answers ?? {})[currentIndex] ?? {},
        winner: (match.questionClaims ?? {})[currentIndex]?.winner ?? null,
      };

  return {
    status: hasFinishedAllQuestions ? "finished" : "inProgress",
    allPlayerUids,
    hostUid,
    questions,
    currentQuestionIndex: currentIndex,
    currentQuestion,
    comboCountByUid,
    historyByUid,
    playerConnection: Object.fromEntries(allPlayerUids.map((uid) => [uid, "connected"])),
    dnfUids: [],
  };
}
