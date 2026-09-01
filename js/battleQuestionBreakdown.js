// オンライン対戦の「問題別結果」を、モードごとにバラバラなFirebase上のデータ形から、
// 共通の形（questionNumber・rows[]）へ変換する純粋関数群。
//
// 【なぜこのファイルが必要か、本人指示：19-25章「結果画面の問題別結果アコーディオンを完成させる」】
// 対戦結果画面と、あとから見るオンラインプレイ履歴の詳細ビューの両方で、同じ「問題別結果」を
// 表示したい。表示ロジック（js/battleQuestionBreakdownUi.jsの描画関数）を2回別々に作ると
// 将来ズレてしまうため、まずこのファイルで「共通の形のデータ」を1回だけ組み立て、
// 結果画面はその場で描画に使い、プレイ履歴はそのデータをそのまま保存しておいて、
// 詳細を開いたときに同じ描画関数へ渡す（js/historyScreen.jsのopenDetailModal()参照）。
//
// 【共通の行（row）の形】
// { uid, name, isYou, selectedTitle, isCorrect, correctSongTitle, hintLevel, missCount, isWinner }
// モードによって意味を持たないフィールドはundefined/nullのままにしておき、
// js/battleQuestionBreakdownUi.js側で「値がある項目だけ」表示する。

import { SONGS } from "./data/songs.js";

// 【2026-09-12追加・本人指示：オンライン履歴詳細も完成させる】問題別結果は「全曲」設定
// （最大84問）×参加人数ぶん、プレイ履歴（localStorage）へそのまま保存され続けると、
// 対戦を重ねるたびに保存容量を圧迫しかねない。結果画面での表示はそのまま全問数ぶん行うが、
// あとから見るプレイ履歴への保存だけ、この件数で安全側に切り詰める（表示上は「後半の問題は
// 履歴には残っていません」という穏当な制限に留め、履歴自体が使えなくなることは避ける）。
const MAX_STORED_QUESTION_BREAKDOWN_ENTRIES = 30;

export function capQuestionBreakdownForStorage(breakdown) {
  return breakdown.slice(0, MAX_STORED_QUESTION_BREAKDOWN_ENTRIES);
}

function songTitleById(songId) {
  if (!songId) return null;
  return SONGS.find((song) => song.id === songId)?.title ?? songId;
}

// タイムアタック・ランダム再生・アウトロクイズ・一瞬バトル共通：各参加者が対戦終了時に
// 自分のperQuestionSnapshot（js/main.jsのfinishOnlineBattlePlay()・
// js/onlineInstantBattleScreen.jsのfinishMatch()が組み立てる）をFirebaseへ提出する。
// これらのモードは各自が独立して進行するため、音源再生失敗時の予備曲差し替えが
// 参加者ごとに違うタイミングで起きることがあり、「同じ問題番号でも参加者によって
// 出題された曲が違う」ことがありうる。そのため「正解曲」は問題単位ではなく
// 行（参加者1人ぶん）単位で持たせる。
//
// results: room.matches[matchId].results（{uid: 対戦結果オブジェクト}）
// participants: room.matches[matchId].participants（{uid: {displayName}}）
export function buildSharedEngineQuestionBreakdown({ results, participants, myUid }) {
  const uidsWithSnapshot = Object.keys(results ?? {}).filter((uid) =>
    Array.isArray(results[uid]?.perQuestionSnapshot)
  );
  if (uidsWithSnapshot.length === 0) return [];

  const maxQuestionCount = Math.max(
    ...uidsWithSnapshot.map((uid) => results[uid].perQuestionSnapshot.length)
  );

  const breakdown = [];
  for (let questionIndex = 0; questionIndex < maxQuestionCount; questionIndex++) {
    const rows = uidsWithSnapshot
      .map((uid) => {
        const snapshot = results[uid].perQuestionSnapshot[questionIndex];
        if (!snapshot) return null;
        const selectedAnswers = snapshot.selectedAnswers ?? [];
        return {
          uid,
          name: participants?.[uid]?.displayName ?? "参加者",
          isYou: uid === myUid,
          correctSongTitle: snapshot.correctSongTitle ?? null,
          selectedTitle: selectedAnswers.length > 0 ? selectedAnswers[selectedAnswers.length - 1] : null,
          isCorrect: snapshot.isCorrect ?? null,
          missCount: snapshot.missCount ?? null,
        };
      })
      .filter((row) => row !== null);
    if (rows.length === 0) continue;
    breakdown.push({ questionNumber: questionIndex + 1, rows });
  }
  return breakdown;
}

// 一瞬協力：音源再生失敗で無効になった問題（isVoid）はteamHistoryに積まれず得点にも
// 出題数にも数えないため、問題別結果からも除外する（結果画面・履歴のどちらも、
// 「実際に成立した問題」だけを見せる）。
//
// questions: js/battleModes/instantCoopBattleMode.jsのbuildQuestions()の戻り値
//   （isReserve:trueの予備曲も含む配列。出題されていない予備曲は除外する）
// coopVotes: match.coopVotes（{questionIndex: {roundNumber: {uid: {selectedSongId}}}}）
// coopQuestionOutcomes: match.coopQuestionOutcomes（{questionIndex: {teamAnswer, isCorrect, isVoid, sharedReplayCount}}）
// participants: match.participants（{uid: {displayName}}）
export function buildInstantCoopQuestionBreakdown({ questions, coopVotes, coopQuestionOutcomes, participants, myUid }) {
  const breakdown = [];
  (questions ?? []).forEach((question, questionIndex) => {
    if (question.isReserve) return;
    const outcome = coopQuestionOutcomes?.[questionIndex];
    if (!outcome) return; // まだ解決していない問題（結果画面まで来ていれば通常は起こらない）
    if (outcome.isVoid) return; // 音源再生失敗で無効になった問題は結果に含めない

    const roundNumber = outcome.sharedReplayCount ?? 0;
    const roundVotes = coopVotes?.[questionIndex]?.[roundNumber] ?? {};
    const rows = Object.keys(participants ?? {}).map((uid) => {
      const vote = roundVotes[uid];
      const selectedTitle = vote ? (vote.selectedSongId === "unknown" ? "わからない" : songTitleById(vote.selectedSongId)) : null;
      return {
        uid,
        name: participants[uid]?.displayName ?? "参加者",
        isYou: uid === myUid,
        selectedTitle,
        isCorrect: vote ? vote.selectedSongId === question.song.id : null,
      };
    });

    breakdown.push({
      questionNumber: breakdown.length + 1,
      correctSongTitle: songTitleById(question.song.id),
      teamAnswerTitle: outcome.teamAnswer ? songTitleById(outcome.teamAnswer) : null,
      rows,
    });
  });
  return breakdown;
}

// 一瞬バトル：一瞬協力と同じ理由（音源再生失敗で無効になった問題は結果から除外する）だが、
// チームで1つの回答ではなく各自が個別に回答するため、行（row）の正誤も参加者ごとに別々になる。
//
// questions: js/battleModes/instantBattleMode.jsのbuildQuestions()の戻り値
// instantQuestionOutcomes: match.instantQuestionOutcomes
//   （{questionIndex: {isVoid, perPlayerOutcome: {uid: {isCorrect, isUnknown, selectedSongId, replayCount}}}}）
// participants: match.participants（{uid: {displayName}}）
export function buildInstantBattleQuestionBreakdown({ questions, instantQuestionOutcomes, participants, myUid }) {
  const breakdown = [];
  (questions ?? []).forEach((question, questionIndex) => {
    if (question.isReserve) return;
    const outcome = instantQuestionOutcomes?.[questionIndex];
    if (!outcome) return;
    if (outcome.isVoid) return;

    const rows = Object.keys(participants ?? {}).map((uid) => {
      const playerOutcome = outcome.perPlayerOutcome?.[uid];
      const selectedTitle = playerOutcome
        ? playerOutcome.isUnknown
          ? "わからない"
          : songTitleById(playerOutcome.selectedSongId)
        : null;
      return {
        uid,
        name: participants[uid]?.displayName ?? "参加者",
        isYou: uid === myUid,
        selectedTitle,
        isCorrect: playerOutcome ? playerOutcome.isCorrect : null,
      };
    });

    breakdown.push({
      questionNumber: breakdown.length + 1,
      correctSongTitle: songTitleById(question.song.id),
      rows,
    });
  });
  return breakdown;
}

// 歌詞クイズ対戦：match.answers・match.questionClaimsは、音源再生失敗のような無効化の
// 仕組みが無いため（このモードは音源を一切再生しない）、全問がそのまま結果に含まれる。
// 各ルール（ノーマル／ハード／早押し）ごとの得点計算ロジックには一切触れず、
// 「選んだ曲」と「本当の正解曲」を突き合わせるだけの単純な比較で正誤を出す
// （得点計算を再現する必要が無いため、既存のルール別ロジックを複製しないで済む）。
//
// questions: js/battleModes/lyricsQuizBattleMode.jsのbuildQuestions()の戻り値（{song, hints, answerPool}[]）
// answers: match.answers（{questionIndex: {uid: {selectedSongId, hintLevel}}}）
// questionClaims: match.questionClaims（{questionIndex: {winner: {uid}}}。早押しルールのときだけ意味を持つ）
// participants: match.participants（{uid: {displayName}}）
export function buildLyricsQuizQuestionBreakdown({ questions, answers, questionClaims, participants, myUid }) {
  return (questions ?? []).map((question, questionIndex) => {
    const questionAnswers = answers?.[questionIndex] ?? {};
    const winnerUid = questionClaims?.[questionIndex]?.winner?.uid ?? null;
    const rows = Object.keys(participants ?? {}).map((uid) => {
      const answer = questionAnswers[uid];
      return {
        uid,
        name: participants[uid]?.displayName ?? "参加者",
        isYou: uid === myUid,
        selectedTitle: answer ? songTitleById(answer.selectedSongId) : null,
        isCorrect: answer ? answer.selectedSongId === question.song.id : null,
        hintLevel: answer?.hintLevel ?? null,
        isWinner: winnerUid !== null && uid === winnerUid,
      };
    });
    return {
      questionNumber: questionIndex + 1,
      correctSongTitle: question.song.title,
      rows,
    };
  });
}
