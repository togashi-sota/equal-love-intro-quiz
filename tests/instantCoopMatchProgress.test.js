// js/instantCoopMatchProgress.jsのテスト（2026-08-31新設、本人指示：19-3章「一瞬協力」）。
//
// 【確認したいこと】
// ・全員が投票するまでtick()が進行しないこと。
// ・多数決で単独トップがいれば、そのままチームの回答として確定すること（正解・不正解とも）。
// ・同率タイの場合、即座にタイブレーク（同率トップの中から決定論的な乱数で1つ選ぶ）で
//   確定すること（2026-09-05改訂：以前あった「共有の再視聴（最大2回）→再投票」の
//   ラウンドは廃止し、代わりに各自が個別に無制限で再視聴できるボタンをUI側に追加した。
//   進行状態としてはタイ＝即タイブレークになった）。
// ・全員「わからない」なら不正解として確定すること。
// ・同じseed・同じ状況なら、タイブレークの結果が毎回一致すること（決定論性）。
// ・advanceToNextQuestion()が、確定済みの問題からteamHistoryへ積みつつ次へ進むこと。
// ・finalizeMatch()が、正解数を正しく集計すること。
// ・【2026-08-31追加→2026-09-06撤廃、本人指示】以前は投票タイムアウト（20秒固定）で
//   未投票者を自動的に「わからない」扱いにしていたが、実機で「操作していないのに勝手に
//   次の問題へ進む」問題が起きたため撤廃した。tick()は経過時間に一切関係なく、
//   全員分の投票が揃うまでは何度呼ばれても進行しないこと（放置プレイヤーの救済は
//   js/onlineInstantCoopBattleScreen.jsのホスト向け3分無操作通知が、recordVote()へ
//   UNKNOWN_VOTEを渡す形でこの関数の外から行う。歌詞クイズ対戦のforcedSkipsと同じ設計）。

import {
  UNKNOWN_VOTE,
  createMatchProgress,
  recordVote,
  countVotedPlayers,
  tallyVotes,
  tick,
  advanceToNextQuestion,
  finalizeMatch,
  restoreMatchProgressFromFirebase,
} from "../js/instantCoopMatchProgress.js";
import { assertEqual } from "./test-utils.js";

function buildDummyQuestions(count) {
  return Array.from({ length: count }, (_, index) => ({
    song: { id: `song-${index}` },
    answerPool: [{ id: `song-${index}` }, { id: `distractor-${index}-a` }, { id: `distractor-${index}-b` }],
  }));
}

export function runInstantCoopMatchProgressTests() {
  const allPlayerUids = ["p1", "p2", "p3"];

  // ---- tallyVotes：単独トップ・タイ・全員わからないの3パターン ----
  {
    const single = tallyVotes({ p1: "a", p2: "a", p3: "b" }, allPlayerUids);
    assertEqual(single.winners, ["a"], "単独トップが1つなら、それだけがwinners");

    const tie = tallyVotes({ p1: "a", p2: "b", p3: UNKNOWN_VOTE }, allPlayerUids);
    assertEqual(tie.winners.sort(), ["a", "b"], "同数タイならどちらもwinnersに入る");

    const allUnknown = tallyVotes({ p1: UNKNOWN_VOTE, p2: UNKNOWN_VOTE, p3: UNKNOWN_VOTE }, allPlayerUids);
    assertEqual(allUnknown.winners, [], "全員わからないならwinnersは空");

    const noVotesYet = tallyVotes({}, allPlayerUids);
    assertEqual(noVotesYet.winners, [], "誰も投票していなければwinnersは空");
  }

  // ---- countVotedPlayers：「わからない」も投票済みとして数える ----
  {
    const count = countVotedPlayers({ p1: "a", p2: UNKNOWN_VOTE }, allPlayerUids);
    assertEqual(count, 2, "「わからない」も投票済みとして数える");
  }

  // ---- recordVote：write-once（2回目の投票は無視） ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p1", "distractor-0-a"); // 上書きされないはず
    assertEqual(state.currentQuestion.votesByUid.p1, "song-0", "同じ人の2回目の投票は無視される（write-once）");
  }

  // ---- tick：全員投票するまで何も起きない ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "song-0");
    const before = state;
    state = tick(state, 100);
    assertEqual(state, before, "全員が投票していなければtick()は何も変えない");
  }

  // ---- tick：単独トップ（正解）でそのまま確定 ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "song-0");
    state = recordVote(state, "p3", "distractor-0-a");
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "resolved", "単独トップが出れば即座に確定する");
    assertEqual(state.currentQuestion.outcome.teamAnswer, "song-0", "多数決で選ばれた曲がチームの回答になる");
    assertEqual(state.currentQuestion.outcome.isCorrect, true, "正解曲と一致すれば正解");
    assertEqual(state.currentQuestion.outcome.usedTieBreakRandom, false, "タイブレークを使っていない");
  }

  // ---- tick：単独トップだが不正解 ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "distractor-0-a");
    state = recordVote(state, "p2", "distractor-0-a");
    state = recordVote(state, "p3", "song-0");
    state = tick(state, 100);
    assertEqual(state.currentQuestion.outcome.teamAnswer, "distractor-0-a", "多数決の結果は不正解でもそのまま採用される");
    assertEqual(state.currentQuestion.outcome.isCorrect, false, "正解曲と一致しなければ不正解");
  }

  // ---- tick：全員が同じ回答（満場一致） ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "song-0");
    state = recordVote(state, "p3", "song-0");
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "resolved", "満場一致でも通常どおり確定する");
    assertEqual(state.currentQuestion.outcome.teamAnswer, "song-0", "全員一致した回答がそのままチームの回答になる");
    assertEqual(state.currentQuestion.outcome.usedTieBreakRandom, false, "満場一致はタイブレークを使わない");
  }

  // ---- tick：3人全員が別々の回答（同率3すくみ、多数決が成立しない） ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "distractor-0-a");
    state = recordVote(state, "p3", "distractor-0-b");
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "resolved", "3人全員別回答（同率3すくみ）でも、即座にタイブレークで確定する");
    assertEqual(state.currentQuestion.outcome.usedTieBreakRandom, true, "3すくみのタイもタイブレークを使う");
    assertEqual(
      ["song-0", "distractor-0-a", "distractor-0-b"].includes(state.currentQuestion.outcome.teamAnswer),
      true,
      "タイブレークの結果は同率トップのいずれかになる"
    );
  }

  // ---- tick：全員わからない → 不正解として確定 ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids, hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", UNKNOWN_VOTE);
    state = recordVote(state, "p2", UNKNOWN_VOTE);
    state = recordVote(state, "p3", UNKNOWN_VOTE);
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "resolved", "全員わからないでも確定する（無限待ちにならない）");
    assertEqual(state.currentQuestion.outcome.teamAnswer, null, "チームの回答は無し（null）");
    assertEqual(state.currentQuestion.outcome.isCorrect, false, "全員わからないは不正解として扱う");
  }

  // ---- tick：同数タイなら、共有再視聴ラウンドを挟まず即座にタイブレークで確定する
  //      （2026-09-05改訂：共有再視聴〈最大2回〉方式を廃止したため） ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 42, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "distractor-0-a");
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "resolved", "タイの場合でも、再投票ラウンドを挟まず即座に確定する");
    assertEqual(state.currentQuestion.outcome.usedTieBreakRandom, true, "タイブレークの乱数が使われたことが記録される");
    assertEqual(
      ["song-0", "distractor-0-a"].includes(state.currentQuestion.outcome.teamAnswer),
      true,
      "タイブレークの結果は、同率トップのどちらかになる"
    );
  }

  // ---- タイブレーク：同じseed・同じ状況なら、毎回同じ結果になる（決定論性） ----
  {
    function runToTieBreak(seed) {
      let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed, nowMs: 0 });
      state = recordVote(state, "p1", "song-0");
      state = recordVote(state, "p2", "distractor-0-a");
      state = tick(state, 100);
      return state.currentQuestion.outcome.teamAnswer;
    }
    const resultA = runToTieBreak(777);
    const resultB = runToTieBreak(777);
    assertEqual(resultA, resultB, "同じseedなら、タイブレークの結果は毎回一致する");
  }

  // ---- advanceToNextQuestion：確定済みの問題をteamHistoryへ積みつつ次へ進む ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(2), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "song-0");
    state = tick(state, 100);
    state = advanceToNextQuestion(state, 150);
    assertEqual(state.currentQuestionIndex, 1, "次の問題（インデックス1）へ進む");
    assertEqual(state.currentQuestion.status, "collecting", "次の問題は投票受付中の新しい状態になる");
    assertEqual(state.teamHistory.length, 1, "確定した問題がteamHistoryへ1件積まれる");
    assertEqual(state.status, "inProgress", "まだ最終問題ではないため試合は続く");
  }

  // ---- advanceToNextQuestion：最後の問題を終えたらfinishedになる ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "song-0");
    state = tick(state, 100);
    state = advanceToNextQuestion(state, 150);
    assertEqual(state.status, "finished", "最後の問題を終えたら試合はfinishedになる");
  }

  // ---- advanceToNextQuestion：確定していない問題では何も進めない ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(2), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    const before = state;
    state = advanceToNextQuestion(state, 150);
    assertEqual(state, before, "投票受付中のまま次へ進めようとしても何も変わらない");
  }

  // ---- finalizeMatch：正解数を正しく集計する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(2), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    // 第1問：単独トップで正解。
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "song-0");
    state = tick(state, 100);
    state = advanceToNextQuestion(state, 150);
    // 第2問：満場一致だが不正解。
    state = recordVote(state, "p1", "distractor-1-a");
    state = recordVote(state, "p2", "distractor-1-a");
    state = tick(state, 200);
    state = advanceToNextQuestion(state, 250);

    assertEqual(state.status, "finished", "2問とも終えたので試合はfinished");
    const result = finalizeMatch(state);
    assertEqual(result.totalQuestions, 2, "全2問");
    assertEqual(result.correctCount, 1, "正解は第1問の1問だけ");
    // 【2026-09-05改訂】共有再視聴の仕組みを廃止したため、sharedReplayCountは常に0になり、
    // totalSharedReplayCountも常に0になる（値自体はデータ構造の互換性のため残っている）。
    assertEqual(result.totalSharedReplayCount, 0, "共有再視聴を廃止したため、常に0になる");
  }

  // ---- finalizeMatch：試合が終わっていなければnullを返す ----
  {
    const state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1"], hostUid: "p1", seed: 1, nowMs: 0 });
    assertEqual(finalizeMatch(state), null, "試合が終わっていない間はnull");
  }

  // ---- restoreMatchProgressFromFirebase：確定済みの問題をcoopQuestionOutcomesから復元する ----
  {
    const questions = buildDummyQuestions(3);
    const match = {
      currentQuestionIndex: 2,
      questionStatus: "active",
      coopRoundNumber: 0,
      coopVotes: { 2: { 0: { p1: { selectedSongId: "song-2" } } } },
      coopQuestionOutcomes: {
        0: { teamAnswer: "song-0", isCorrect: true, usedTieBreakRandom: false, sharedReplayCount: 0 },
        1: { teamAnswer: "distractor-1-a", isCorrect: false, usedTieBreakRandom: true, sharedReplayCount: 2 },
      },
    };
    const state = restoreMatchProgressFromFirebase({ questions, allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 5, match, nowMs: 1000 });
    assertEqual(state.status, "inProgress", "3問中2問目（インデックス2）はまだ進行中");
    assertEqual(state.currentQuestionIndex, 2, "現在の問題インデックスが復元される");
    assertEqual(state.teamHistory.length, 2, "確定済みの2問分がteamHistoryへ復元される");
    assertEqual(state.teamHistory[1].usedTieBreakRandom, true, "確定済み問題の内訳（タイブレーク使用有無）も復元される");
    assertEqual(state.currentQuestion.status, "collecting", "現在の問題はまだ投票受付中として復元される");
    assertEqual(state.currentQuestion.votesByUid, { p1: "song-2" }, "現在のラウンドの投票状況が復元される");

    // 復元した状態から、通常どおりtick()・advanceToNextQuestion()を続けられることを確認する。
    let resumedState = recordVote(state, "p2", "song-2");
    resumedState = tick(resumedState, 1100);
    assertEqual(resumedState.currentQuestion.status, "resolved", "復元後もtick()で通常どおり進行できる");
  }

  // ---- restoreMatchProgressFromFirebase：全問終了済みならfinishedとして復元される ----
  {
    const questions = buildDummyQuestions(1);
    const match = {
      currentQuestionIndex: 1,
      questionStatus: "resolved",
      coopRoundNumber: 0,
      coopQuestionOutcomes: { 0: { teamAnswer: "song-0", isCorrect: true, usedTieBreakRandom: false, sharedReplayCount: 0 } },
    };
    const state = restoreMatchProgressFromFirebase({ questions, allPlayerUids: ["p1"], hostUid: "p1", seed: 5, match, nowMs: 1000 });
    assertEqual(state.status, "finished", "全問終了済みならfinishedとして復元される");
    const result = finalizeMatch(state);
    assertEqual(result.correctCount, 1, "復元後もfinalizeMatch()が正しい結果を返す");
  }

  // ===== 固定タイムアウトの撤廃確認（2026-09-06改訂、本人指示） =====

  // ---- 未投票者がいる限り、どれだけ時間が経ってもtick()は進行しない ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2", "p3"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    const before = state;
    // 以前のVOTE_TIMEOUT_MS（20秒）を大きく超える経過時間でも進行しないことを確認する。
    state = tick(state, 999999999);
    assertEqual(state, before, "未投票者がいる限り、経過時間に関係なくtick()は何も変えない（固定タイムアウトが無いことの確認）");
  }

  // ---- 未投票者の分をUNKNOWN_VOTEで補完すれば、経過時間に関係なく即座に確定する
  //      （ホストの3分無操作救済＝forcedSkipsは、この関数の外でrecordVote(...,UNKNOWN_VOTE)を
  //      呼ぶだけで実現する。js/onlineInstantCoopBattleScreen.jsのrunHostProgressionTick()参照） ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2", "p3"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", UNKNOWN_VOTE); // ホストの放置救済で補完されたのと同じ状態
    state = recordVote(state, "p3", UNKNOWN_VOTE);
    state = tick(state, 100); // 経過時間はごくわずかでも、全員分揃っていれば確定する
    assertEqual(state.currentQuestion.status, "resolved", "全員分（UNKNOWN_VOTE補完分を含む）揃えば、時間を待たずに確定する");
    assertEqual(state.currentQuestion.outcome.teamAnswer, "song-0", "わからない扱いの分を除いた多数決で決まる");
    assertEqual(state.currentQuestion.outcome.isCorrect, true, "通常どおり正誤判定される");
  }

  // ---- 全員がUNKNOWN_VOTEなら不正解として確定する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", UNKNOWN_VOTE);
    state = recordVote(state, "p2", UNKNOWN_VOTE);
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "resolved", "全員わからないでも、揃った時点で確定する");
    assertEqual(state.currentQuestion.outcome.teamAnswer, null, "全員わからないなら、チームの回答は無し");
    assertEqual(state.currentQuestion.outcome.isCorrect, false, "全員わからないは不正解として扱う");
  }

  // ---- 1人がギブアップ（自分で「わからない」を選択）しても、他の人の回答権はそのまま残る ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2", "p3"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", UNKNOWN_VOTE); // p1が自分からギブアップ
    state = recordVote(state, "p2", "song-0");
    // p3はまだ投票していない状態でtick()を呼んでも、固定タイムアウトが無いため進まない。
    const before = state;
    state = tick(state, 999999999);
    assertEqual(state, before, "1人がギブアップしても、残りの人が投票し終えるまでは進まない");
    // p3も投票すれば、ギブアップした人がいてもすぐに確定する。
    state = recordVote(state, "p3", "song-0");
    state = tick(state, 200);
    assertEqual(state.currentQuestion.status, "resolved", "全員分（ギブアップ含む）揃えば確定する");
    assertEqual(state.currentQuestion.outcome.teamAnswer, "song-0", "ギブアップした人の分を除いた多数決で決まる");
  }
}
