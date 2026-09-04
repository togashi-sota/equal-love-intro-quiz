// js/battleQuestionBreakdown.jsのテスト（2026-09-12新設・本人指示：19-25章
// 「結果画面の問題別結果アコーディオンを完成させる」）。
// 対戦結果画面・オンラインプレイ履歴の詳細ビューの両方が使う「問題別結果」データを、
// モードごとのFirebase上のデータ形から正しく組み立てられているかを確認する。

import {
  buildSharedEngineQuestionBreakdown,
  buildInstantCoopQuestionBreakdown,
  buildLyricsQuizQuestionBreakdown,
  computeCoopMvpStats,
} from "../js/battleQuestionBreakdown.js";
import { SONGS } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

export function runBattleQuestionBreakdownTests() {
  const songA = SONGS[0];
  const songB = SONGS[1];
  const songC = SONGS[2];

  // ---- buildSharedEngineQuestionBreakdown：タイムアタック・ランダム再生・アウトロクイズ・一瞬バトル共通 ----
  {
    const results = {
      "uid-host": {
        perQuestionSnapshot: [
          { correctSongTitle: songA.title, selectedAnswers: [songA.title], missCount: 0, isCorrect: true },
          { correctSongTitle: songB.title, selectedAnswers: [songC.title, songB.title], missCount: 1, isCorrect: true },
        ],
      },
      "uid-guest": {
        perQuestionSnapshot: [
          { correctSongTitle: songA.title, selectedAnswers: [songC.title], missCount: 1, isCorrect: false },
        ],
      },
    };
    const participants = { "uid-host": { displayName: "ホスト" }, "uid-guest": { displayName: "ゲスト" } };

    const breakdown = buildSharedEngineQuestionBreakdown({ results, participants, myUid: "uid-guest" });

    assertEqual(breakdown.length, 2, "参加者の中で一番多く回答した人の問題数ぶん、問題別結果が作られる");
    assertEqual(breakdown[0].questionNumber, 1, "1問目のquestionNumberは1");
    assertEqual(breakdown[0].rows.length, 2, "1問目は両方の参加者が回答しているので2行");
    assertEqual(breakdown[1].rows.length, 1, "2問目はホストしか回答していないので1行のみ（ゲストは含まれない）");

    const guestRow = breakdown[0].rows.find((row) => row.uid === "uid-guest");
    assertEqual(guestRow.isYou, true, "myUidと一致する行はisYou:true");
    assertEqual(guestRow.selectedTitle, songC.title, "selectedAnswersの最後の1件がselectedTitleになる");
    assertEqual(guestRow.isCorrect, false, "不正解の行はisCorrect:false");

    const hostRow2 = breakdown[1].rows[0];
    assertEqual(hostRow2.selectedTitle, songB.title, "複数回選び直した場合は最後に選んだ曲名だけを表示する");
    assertEqual(hostRow2.missCount, 1, "missCountはそのまま引き継がれる");

    assertEqual(
      buildSharedEngineQuestionBreakdown({ results: {}, participants: {}, myUid: "uid-guest" }),
      [],
      "resultsが空なら空配列を返す（安全に何も表示しない）"
    );
    assertEqual(
      buildSharedEngineQuestionBreakdown({
        results: { "uid-x": { completed: true } }, // perQuestionSnapshotを持たない（旧データ・一瞬協力等）
        participants: {},
        myUid: "uid-x",
      }),
      [],
      "perQuestionSnapshotを持たない結果しか無い場合も空配列を返す（他モードのresultsを誤って混ぜない）"
    );
  }

  // ---- buildInstantCoopQuestionBreakdown ----
  {
    const questions = [
      { song: songA, isReserve: false },
      { song: songB, isReserve: false },
      { song: songC, isReserve: true }, // 出題されていない予備曲
    ];
    const coopQuestionOutcomes = {
      0: { teamAnswer: songA.id, isCorrect: true, isVoid: false, sharedReplayCount: 0 },
      1: { teamAnswer: null, isCorrect: false, isVoid: true, sharedReplayCount: 0 }, // 音源再生失敗で無効
    };
    const coopVotes = {
      0: { 0: { "uid-a": { selectedSongId: songA.id }, "uid-b": { selectedSongId: "unknown" } } },
    };
    const participants = { "uid-a": { displayName: "Aさん" }, "uid-b": { displayName: "Bさん" } };

    const breakdown = buildInstantCoopQuestionBreakdown({
      questions,
      coopVotes,
      coopQuestionOutcomes,
      participants,
      myUid: "uid-a",
    });

    assertEqual(breakdown.length, 1, "無効(isVoid)になった問題・出題されていない予備曲は結果に含まない");
    assertEqual(breakdown[0].correctSongTitle, songA.title, "正解曲のタイトルが曲IDから正しく引ける");
    assertEqual(breakdown[0].teamAnswerTitle, songA.title, "チームの最終回答のタイトルが正しく引ける");
    const rowA = breakdown[0].rows.find((row) => row.uid === "uid-a");
    const rowB = breakdown[0].rows.find((row) => row.uid === "uid-b");
    assertEqual(rowA.isYou, true, "myUidと一致する行はisYou:true");
    assertEqual(rowA.selectedTitle, songA.title, "投票した曲のタイトルが正しく引ける");
    assertEqual(rowB.selectedTitle, "わからない", "「わからない」投票は専用の表示文言になる");
    assertEqual(rowB.isCorrect, false, "「わからない」は不正解扱い");
  }

  // ---- buildLyricsQuizQuestionBreakdown ----
  {
    const questions = [{ song: songA }, { song: songB }];
    const answers = {
      0: { "uid-a": { selectedSongId: songA.id, hintLevel: 2 }, "uid-b": { selectedSongId: songC.id, hintLevel: 4 } },
      1: { "uid-a": { selectedSongId: songB.id, hintLevel: 1 } },
    };
    const questionClaims = { 0: { winner: { uid: "uid-a" } } };
    const participants = { "uid-a": { displayName: "Aさん" }, "uid-b": { displayName: "Bさん" } };

    const breakdown = buildLyricsQuizQuestionBreakdown({ questions, answers, questionClaims, participants, myUid: "uid-b" });

    assertEqual(breakdown.length, 2, "全問（音源を使わないため無効化の概念が無く、全問がそのまま結果になる）");
    assertEqual(breakdown[0].correctSongTitle, songA.title, "正解曲のタイトルはquestionsから直接取れる");
    const rowA = breakdown[0].rows.find((row) => row.uid === "uid-a");
    assertEqual(rowA.isCorrect, true, "選んだ曲IDが正解曲IDと一致すればisCorrect:true");
    assertEqual(rowA.isWinner, true, "questionClaimsのwinnerと一致すればisWinner:true");
    const rowB = breakdown[0].rows.find((row) => row.uid === "uid-b");
    assertEqual(rowB.isYou, true, "myUidと一致する行はisYou:true");
    assertEqual(rowB.isCorrect, false, "選んだ曲IDが正解曲IDと違えばisCorrect:false");
    assertEqual(
      breakdown[1].rows.find((row) => row.uid === "uid-b").selectedTitle,
      null,
      "回答していない参加者はselectedTitleがnull（未回答として表示される）"
    );
  }

  // ---- computeCoopMvpStats（2026-09-05新設・本人指示：一瞬協力結果画面のMVP集計） ----
  {
    // チームの最終回答（多数決）が不正解でも、本人が正解曲を選んでいればカウントする、
    // という定義の確認：Q1はチームとしては不正解想定でも、Aさんは正解曲を選んでいる。
    const breakdown = [
      {
        questionNumber: 1,
        rows: [
          { uid: "a", isCorrect: true }, // Aさんは正解曲を選択（チームの最終回答が別でも関係ない）
          { uid: "b", isCorrect: false },
          { uid: "c", isCorrect: false },
        ],
      },
      {
        questionNumber: 2,
        rows: [
          { uid: "a", isCorrect: true },
          { uid: "b", isCorrect: true },
          { uid: "c", isCorrect: false },
        ],
      },
    ];
    const stats = computeCoopMvpStats(breakdown);
    assertEqual(stats.totalQuestions, 2, "totalQuestionsは実際に成立した問題数");
    assertEqual(stats.countsByUid, { a: 2, b: 1, c: 0 }, "正解選択数は本人が正解曲を選んだ回数（チームの最終回答とは独立）");
    assertEqual(stats.maxCount, 2, "最大値はAさんの2問");
    assertEqual(stats.mvpUids, ["a"], "MVPは正解選択数が最も多い1人");
  }

  // ---- computeCoopMvpStats：同率MVP（無理に1人へ絞らない） ----
  {
    const breakdown = [
      { questionNumber: 1, rows: [{ uid: "a", isCorrect: true }, { uid: "b", isCorrect: true }, { uid: "c", isCorrect: false }] },
      { questionNumber: 2, rows: [{ uid: "a", isCorrect: false }, { uid: "b", isCorrect: false }, { uid: "c", isCorrect: true }] },
      { questionNumber: 3, rows: [{ uid: "a", isCorrect: true }, { uid: "b", isCorrect: true }, { uid: "c", isCorrect: false }] },
    ];
    const stats = computeCoopMvpStats(breakdown);
    assertEqual(stats.countsByUid, { a: 2, b: 2, c: 1 }, "正解選択数の内訳");
    assertEqual(stats.maxCount, 2, "最大値は2");
    assertEqual(stats.mvpUids, ["a", "b"], "同率最多は全員をMVPとして返す（無理に1人へ絞らない）");
  }

  // ---- computeCoopMvpStats：全員0問の場合はmvpUidsが空配列（「該当者なし」の判定に使う） ----
  {
    const breakdown = [
      { questionNumber: 1, rows: [{ uid: "a", isCorrect: false }, { uid: "b", isCorrect: false }] },
    ];
    const stats = computeCoopMvpStats(breakdown);
    assertEqual(stats.maxCount, 0, "全員不正解なら最大値は0");
    assertEqual(stats.mvpUids, [], "全員0問の場合はmvpUidsが空配列（呼び出し側が「該当者なし」を表示する）");
  }

  // ---- computeCoopMvpStats：問題別結果が空（結果を計算できない状況）でも例外を投げない ----
  {
    const stats = computeCoopMvpStats([]);
    assertEqual(stats.totalQuestions, 0, "問題が無ければtotalQuestionsは0");
    assertEqual(stats.countsByUid, {}, "問題が無ければcountsByUidは空オブジェクト");
    assertEqual(stats.mvpUids, [], "問題が無ければmvpUidsは空配列");
  }
}
