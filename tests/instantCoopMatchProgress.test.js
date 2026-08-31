// js/instantCoopMatchProgress.jsのテスト（2026-08-31新設、本人指示：19-3章「一瞬協力」）。
//
// 【確認したいこと】
// ・全員が投票するまでtick()が進行しないこと。
// ・多数決で単独トップがいれば、そのままチームの回答として確定すること（正解・不正解とも）。
// ・同率タイの場合、共有の再視聴（最大2回）→再投票のラウンドへ進むこと。
// ・2回再視聴してもタイなら、同率トップの中から決定論的な乱数で1つ選び、必ず確定すること
//   （無限ループしないこと）。
// ・全員「わからない」なら不正解として確定すること。
// ・同じseed・同じ状況なら、タイブレークの結果が毎回一致すること（決定論性）。
// ・advanceToNextQuestion()が、確定済みの問題からteamHistoryへ積みつつ次へ進むこと。
// ・finalizeMatch()が、正解数・合計共有再視聴回数を正しく集計すること。
// ・【2026-08-31追加、本人指示】投票タイムアウト（20秒固定）：未投票者を自動的に
//   「わからない」扱いで補完し、退出・切断扱いにはせず、他プレイヤーの回答権はそのまま
//   残ること。全員タイムアウトなら不正解として確定すること。タイムアウトで生じたタイでも
//   通常の共有再視聴→タイブレークの流れがそのまま働くこと。

import {
  UNKNOWN_VOTE,
  MAX_SHARED_REPLAY_COUNT,
  VOTE_TIMEOUT_MS,
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
    assertEqual(state.currentQuestion.status, "collecting", "3人全員別回答（1票ずつの3すくみ）はタイとして扱い、確定しない");
    assertEqual(state.currentQuestion.sharedReplayCount, 1, "3すくみのタイでも通常のタイと同じく共有再視聴が1回消費される");
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

  // ---- tick：同数タイ→再視聴→再投票→それでもタイ→再視聴→再投票→タイブレークで必ず確定する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 42, nowMs: 0 });
    // 1回目の投票：p1=song-0, p2=distractor-0-a → タイ
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "distractor-0-a");
    state = tick(state, 100);
    assertEqual(state.currentQuestion.status, "collecting", "タイの場合は確定せず、再投票のラウンドへ進む");
    assertEqual(state.currentQuestion.sharedReplayCount, 1, "1回目の共有再視聴が消費される");
    assertEqual(Object.keys(state.currentQuestion.votesByUid).length, 0, "再投票のため票がクリアされる");

    // 2回目の投票：またタイ
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "distractor-0-a");
    state = tick(state, 200);
    assertEqual(state.currentQuestion.status, "collecting", "2回目もタイなら、まだ確定しない（残り再視聴があるため）");
    assertEqual(state.currentQuestion.sharedReplayCount, MAX_SHARED_REPLAY_COUNT, "2回目の共有再視聴が消費される（上限に到達）");

    // 3回目の投票：またタイ→再視聴の上限に達しているため、タイブレークで必ず確定する
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "distractor-0-a");
    state = tick(state, 300);
    assertEqual(state.currentQuestion.status, "resolved", "再視聴の上限に達したら、タイでも必ず確定する（無限ループしない）");
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
      for (let round = 0; round <= MAX_SHARED_REPLAY_COUNT; round++) {
        state = recordVote(state, "p1", "song-0");
        state = recordVote(state, "p2", "distractor-0-a");
        state = tick(state, 100);
      }
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

  // ---- finalizeMatch：正解数・合計共有再視聴回数を正しく集計する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(2), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    // 第1問：単独トップで正解（再視聴0回）。
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "song-0");
    state = tick(state, 100);
    state = advanceToNextQuestion(state, 150);
    // 第2問：タイ→再視聴1回→単独トップで不正解。
    state = recordVote(state, "p1", "song-1");
    state = recordVote(state, "p2", "distractor-1-a");
    state = tick(state, 200);
    state = recordVote(state, "p1", "distractor-1-a");
    state = recordVote(state, "p2", "distractor-1-a");
    state = tick(state, 300);
    state = advanceToNextQuestion(state, 350);

    assertEqual(state.status, "finished", "2問とも終えたので試合はfinished");
    const result = finalizeMatch(state);
    assertEqual(result.totalQuestions, 2, "全2問");
    assertEqual(result.correctCount, 1, "正解は第1問の1問だけ");
    assertEqual(result.totalSharedReplayCount, 1, "第2問で使った共有再視聴1回が合計される");
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

  // ===== 投票タイムアウト（2026-08-31追加、本人指示：20秒固定） =====

  // ---- タイムアウト前：全員揃っていなければ何も進まない（既存動作の維持を再確認） ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    const before = state;
    state = tick(state, VOTE_TIMEOUT_MS - 1);
    assertEqual(state, before, "タイムアウト直前（19999ms）では、未投票者がいればまだ進行しない");
  }

  // ---- タイムアウト成立：未投票者を「わからない」で自動補完し、退出扱いにせず進行する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2", "p3"], hostUid: "p1", seed: 1, nowMs: 0 });
    // p1だけが期限内に回答。p2・p3は何も押さないまま放置。
    state = recordVote(state, "p1", "song-0");
    state = tick(state, VOTE_TIMEOUT_MS);
    assertEqual(state.currentQuestion.status, "resolved", "20秒経過すれば、未投票者がいても確定へ進む（無限待ちにならない）");
    assertEqual(state.currentQuestion.outcome.teamAnswer, "song-0", "期限内に回答した人の投票がそのまま多数決に使われる");
    assertEqual(state.currentQuestion.outcome.isCorrect, true, "タイムアウトが絡んでも、通常どおり正誤判定される");
    assertEqual(state.allPlayerUids, ["p1", "p2", "p3"], "タイムアウトしたプレイヤーもallPlayerUidsから除外されない（退出・切断扱いにしない）");
  }

  // ---- 全員タイムアウト（誰も投票しない）→ 不正解として確定する ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = tick(state, VOTE_TIMEOUT_MS);
    assertEqual(state.currentQuestion.status, "resolved", "全員が投票しなくても20秒で確定する");
    assertEqual(state.currentQuestion.outcome.teamAnswer, null, "全員タイムアウトなら、全員わからないと同じくチームの回答は無し");
    assertEqual(state.currentQuestion.outcome.isCorrect, false, "全員タイムアウトは不正解として扱う");
  }

  // ---- タイムアウトで生じたタイも、通常どおり共有再視聴のラウンドへ進む ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2", "p3"], hostUid: "p1", seed: 1, nowMs: 0 });
    // p1とp2が別の曲へ投票、p3は放置（タイムアウトで「わからない」扱い）。
    // わからないは集計から除外されるため、p1とp2の1票ずつでタイになる。
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "distractor-0-a");
    state = tick(state, VOTE_TIMEOUT_MS);
    assertEqual(state.currentQuestion.status, "collecting", "タイムアウトが絡んだタイでも、確定せず再視聴ラウンドへ進む");
    assertEqual(state.currentQuestion.sharedReplayCount, 1, "共有再視聴が1回消費される（通常のタイと同じ扱い）");
    assertEqual(Object.keys(state.currentQuestion.votesByUid).length, 0, "再投票のため票がクリアされる");
  }

  // ---- 再視聴ラウンドが始まると、タイムアウト計測も新しいラウンドの開始からやり直しになる ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", "song-0");
    state = recordVote(state, "p2", "distractor-0-a");
    state = tick(state, 100); // タイ発生。時刻100msの時点で再視聴ラウンドへ。
    assertEqual(state.currentQuestion.startedAt, 100, "再視聴ラウンド開始時刻が更新される");
    // 新ラウンド開始（100ms）から19999ms後（合計19999+100=20099ms未満）では、
    // 旧ラウンド基準なら20秒を超えていても、新ラウンド基準ではまだタイムアウトしない。
    const before = state;
    state = tick(state, 100 + VOTE_TIMEOUT_MS - 1);
    assertEqual(state, before, "新ラウンド開始から20秒経っていなければ、まだタイムアウトしない");
  }

  // ---- 1人がギブアップ（自分で「わからない」を選択）しても、他の人の回答権はそのまま残る ----
  {
    let state = createMatchProgress({ questions: buildDummyQuestions(1), allPlayerUids: ["p1", "p2", "p3"], hostUid: "p1", seed: 1, nowMs: 0 });
    state = recordVote(state, "p1", UNKNOWN_VOTE); // p1が自分からギブアップ
    state = recordVote(state, "p2", "song-0");
    // p3はまだ投票していない状態でtick()を呼んでも、20秒経っていなければ進まない
    // （p1のギブアップだけでは全員分にならず、p3の回答権〈または期限到来〉を待つ）。
    const before = state;
    state = tick(state, 100);
    assertEqual(state, before, "1人がギブアップしても、残りの人が投票し終える／タイムアウトするまでは進まない");
    // p3も投票すれば、ギブアップした人がいてもすぐに確定する。
    state = recordVote(state, "p3", "song-0");
    state = tick(state, 200);
    assertEqual(state.currentQuestion.status, "resolved", "全員分（ギブアップ含む）揃えば、20秒を待たずに確定する");
    assertEqual(state.currentQuestion.outcome.teamAnswer, "song-0", "ギブアップした人の分を除いた多数決で決まる");
  }
}
