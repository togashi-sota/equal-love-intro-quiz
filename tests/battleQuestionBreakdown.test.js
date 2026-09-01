// js/battleQuestionBreakdown.jsのテスト（2026-09-12新設・本人指示：19-25章
// 「結果画面の問題別結果アコーディオンを完成させる」）。
// 対戦結果画面・オンラインプレイ履歴の詳細ビューの両方が使う「問題別結果」データを、
// モードごとのFirebase上のデータ形から正しく組み立てられているかを確認する。

import {
  buildSharedEngineQuestionBreakdown,
  buildInstantCoopQuestionBreakdown,
  buildLyricsQuizQuestionBreakdown,
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
}
