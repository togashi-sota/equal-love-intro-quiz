// オンライン対戦の状態遷移・絞り込みロジックに対する、シード付きランダム操作列による
// property-based（性質ベース）テスト（2026-09-06、本人指示：長時間耐久検証PHASE M
// 「ランダムな操作列を生成し、禁止状態へ入らないことを検査する」「1000seed規模」）。
//
// 【対象を「Firebase接続を伴わない純粋関数」に絞った理由】このテストはtests.htmlの
// ブラウザ環境で高速に大量回数（1000+）実行する必要があるため、実際のFirebase書き込み・
// 複数クライアント間の通信を伴う検証はここでは行わない（それは実機・実Firebaseでの
// 少数だが本物の多人数テストが別途担当する）。ここでは、状態遷移・絞り込みの「判定ロジック
// そのもの」が、あらゆる入力の組み合わせに対して例外を投げず、かつドキュメント化された
// 不変条件（invariant）を破らないことを、ランダムな入力生成で広く検査する。
//
// 各関数について、同じシードから同じテストが再現できるよう、js/seededRandom.jsの
// createSeededRandom()をそのまま使う（対戦の問題順再現と同じ仕組み）。
import { createSeededRandom } from "../js/seededRandom.js";
import {
  resolveOnlineBattleStatusTransition,
  isCountdownCompletionStillValid,
  ONLINE_BATTLE_TRANSITION_ACTION,
  ONLINE_BATTLE_RESULT_KIND,
} from "../js/onlineBattleStatusTransitionPayloads.js";
import { checkAnswerSubmissionAllowed, checkStealClaimAllowed } from "../js/lyricsQuizBattleFirebasePayloads.js";
import { isMatchReadyToFinalize } from "../js/onlineBattleMatchProgress.js";
import { computeFinisherRanks } from "../js/battleModes/index.js";
import { createResult as createInstantBattleResult, compareResults as compareInstantBattleResults } from "../js/battleModes/instantBattleMode.js";
import { restrictSongPoolToCommonAvailability } from "../js/onlineBattleSongAvailabilityPayloads.js";
import { assertEqual } from "./test-utils.js";

const FUZZ_SEED = 20260906;
// 2026-09-06追記・最終QAフェーズ（本人指示PHASE21：「最終ランダムstate-machine fuzz」は
// 最低1000seed・可能なら5000seedを要求）を受け、300→850へ引き上げた
// （6つの対象関数×850回＝5100回で5000回規模を満たす）。
const ITERATIONS_PER_TARGET = 850;

function pickBool(random) {
  return random() < 0.5;
}
function pickOneOf(random, values) {
  return values[Math.floor(random() * values.length)];
}

export function runOnlineBattlePropertyFuzzTests() {
  const random = createSeededRandom(FUZZ_SEED);
  let totalCases = 0;
  const failures = [];

  // ---- ①resolveOnlineBattleStatusTransition：あらゆる入力組み合わせで例外を投げない・
  //      ドキュメント化された不変条件を破らない ----
  const roomStatusValues = ["waiting", "countdown", "playing", "result", undefined, "unknown-status"];
  const resultKindFlags = [
    { isLyricsQuiz: false, isInstantBattle: false, isInstantCoop: false },
    { isLyricsQuiz: true, isInstantBattle: false, isInstantCoop: false },
    { isLyricsQuiz: false, isInstantBattle: true, isInstantCoop: false },
    { isLyricsQuiz: false, isInstantBattle: false, isInstantCoop: true },
  ];
  for (let i = 0; i < ITERATIONS_PER_TARGET; i++) {
    totalCases++;
    const input = {
      statusJustChanged: pickBool(random),
      previousStatus: pickOneOf(random, roomStatusValues),
      roomStatus: pickOneOf(random, roomStatusValues),
      hasVoluntarilyLeftActiveMatch: pickBool(random),
      isActiveMatchInvalidated: pickBool(random),
      isReturnedToLobby: pickBool(random),
      currentScreenIsQuiz: pickBool(random),
      currentScreenIsResultScreen: pickBool(random),
      hasRespondedToCurrentResultScreen: pickBool(random),
      ...pickOneOf(random, resultKindFlags),
    };
    try {
      const result = resolveOnlineBattleStatusTransition(input);
      // 【不変条件1】statusJustChangedがfalseなら、他の入力に関わらず必ずNONE
      // （関数冒頭のコメントどおり「今回だけ何もしない」を保証する最重要の前提）。
      if (!input.statusJustChanged && result.action !== ONLINE_BATTLE_TRANSITION_ACTION.NONE) {
        failures.push({ target: "resolveOnlineBattleStatusTransition", input, result, reason: "statusJustChanged=falseなのにNONE以外を返した" });
      }
      // 【不変条件2】roomStatus==="countdown"かつstatusJustChangedなら、他の入力に
      // 関わらず必ずENTER_COUNTDOWN（本人指示・確認ポイント1〜4：host/guest対称性の核心）。
      if (input.statusJustChanged && input.roomStatus === "countdown" && result.action !== ONLINE_BATTLE_TRANSITION_ACTION.ENTER_COUNTDOWN) {
        failures.push({ target: "resolveOnlineBattleStatusTransition", input, result, reason: "countdown中なのにENTER_COUNTDOWN以外を返した" });
      }
      // 【不変条件3】ENTER_RESULTを返す場合、resultKindは必ず4種類のいずれか。
      if (result.action === ONLINE_BATTLE_TRANSITION_ACTION.ENTER_RESULT) {
        const validKinds = Object.values(ONLINE_BATTLE_RESULT_KIND);
        if (!validKinds.includes(result.resultKind)) {
          failures.push({ target: "resolveOnlineBattleStatusTransition", input, result, reason: "resultKindが不正な値" });
        }
      }
    } catch (error) {
      failures.push({ target: "resolveOnlineBattleStatusTransition", input, error: error.message });
    }
  }

  // ---- ②isCountdownCompletionStillValid：あらゆる入力で例外を投げない ----
  const idPool = ["room-A", "room-B", "match-1", "match-2", null, undefined, ""];
  for (let i = 0; i < ITERATIONS_PER_TARGET; i++) {
    totalCases++;
    const input = {
      capturedRoomId: pickOneOf(random, idPool),
      capturedActiveMatchId: pickOneOf(random, idPool),
      currentRoomId: pickOneOf(random, idPool),
      latestActiveMatchId: pickOneOf(random, idPool),
    };
    try {
      const result = isCountdownCompletionStillValid(input);
      if (typeof result !== "boolean") {
        failures.push({ target: "isCountdownCompletionStillValid", input, result, reason: "戻り値がbooleanでない" });
      }
      // 【不変条件】room/matchのどちらかが食い違っていれば、絶対にtrueにならない。
      const shouldBeFalse =
        !input.capturedRoomId ||
        !input.currentRoomId ||
        input.capturedRoomId !== input.currentRoomId ||
        input.capturedActiveMatchId !== input.latestActiveMatchId;
      if (shouldBeFalse && result === true) {
        failures.push({ target: "isCountdownCompletionStillValid", input, result, reason: "食い違っているのにtrueを返した（古い試合へ誤進行する危険）" });
      }
    } catch (error) {
      failures.push({ target: "isCountdownCompletionStillValid", input, error: error.message });
    }
  }

  // ---- ③checkAnswerSubmissionAllowed / checkStealClaimAllowed：ランダムなroom形状で
  //      例外を投げない・ok:falseのときは必ずreasonが付く ----
  function randomRoomShape(random) {
    const hasRoom = pickBool(random);
    if (!hasRoom) return null;
    const matchId = pickOneOf(random, ["match-1", "match-2", undefined]);
    const questionIndex = pickOneOf(random, [0, 1, 2, undefined]);
    const uid = "uid-1";
    const hasMatch = pickBool(random);
    const match = hasMatch
      ? {
          currentQuestionIndex: pickOneOf(random, [0, 1, 2, undefined]),
          questionStatus: pickOneOf(random, ["active", "resolved", undefined]),
          answers: pickBool(random) ? { 0: { [uid]: { selectedSongId: "song-1" } } } : {},
          participants: pickBool(random) ? { [uid]: { displayName: "テスト" } } : {},
          questionClaims: pickBool(random) ? { 0: { winner: { uid: "uid-2" } } } : {},
        }
      : undefined;
    return {
      activeMatchId: pickOneOf(random, ["match-1", "match-2", undefined]),
      matches: hasMatch ? { [matchId]: match } : {},
    };
  }
  for (let i = 0; i < ITERATIONS_PER_TARGET; i++) {
    totalCases++;
    const room = randomRoomShape(random);
    const matchId = pickOneOf(random, ["match-1", "match-2", undefined]);
    const questionIndex = pickOneOf(random, [0, 1, 2, undefined]);
    const uid = "uid-1";
    try {
      const r1 = checkAnswerSubmissionAllowed({ room, matchId, questionIndex, uid });
      const r2 = checkStealClaimAllowed({ room, matchId, questionIndex });
      for (const [name, r] of [["checkAnswerSubmissionAllowed", r1], ["checkStealClaimAllowed", r2]]) {
        if (typeof r.ok !== "boolean") {
          failures.push({ target: name, input: { room, matchId, questionIndex }, result: r, reason: "ok が boolean でない" });
        }
        if (r.ok === false && !r.reason) {
          failures.push({ target: name, input: { room, matchId, questionIndex }, result: r, reason: "ok:falseなのにreasonが無い" });
        }
      }
    } catch (error) {
      failures.push({ target: "checkAnswerSubmissionAllowed/checkStealClaimAllowed", input: { room, matchId, questionIndex }, error: error.message });
    }
  }

  // ---- ④isMatchReadyToFinalize：ランダムな参加者・進捗の組み合わせで例外を投げない・
  //      「参加者0人なら絶対にfalse」の不変条件を守る ----
  for (let i = 0; i < ITERATIONS_PER_TARGET; i++) {
    totalCases++;
    const participantCount = Math.floor(random() * 4); // 0〜3人
    const participants = {};
    const progress = {};
    for (let p = 0; p < participantCount; p++) {
      const uid = `uid-${p}`;
      participants[uid] = { displayName: `参加者${p}`, leftDuringMatch: pickBool(random) ? true : undefined };
      if (pickBool(random)) progress[uid] = { finished: pickBool(random) };
    }
    try {
      const result = isMatchReadyToFinalize({ participants, progress });
      if (typeof result !== "boolean") {
        failures.push({ target: "isMatchReadyToFinalize", input: { participants, progress }, result, reason: "戻り値がbooleanでない" });
      }
      if (participantCount === 0 && result !== false) {
        failures.push({ target: "isMatchReadyToFinalize", input: { participants, progress }, result, reason: "参加者0人なのにfalse以外を返した" });
      }
    } catch (error) {
      failures.push({ target: "isMatchReadyToFinalize", input: { participants, progress }, error: error.message });
    }
  }

  // ---- ⑤computeFinisherRanks（一瞬バトルの同着判定）：ランダムな正解数・再視聴回数の
  //      組み合わせで、同着なら同順位・順位が単調非減少であることを検査 ----
  for (let i = 0; i < ITERATIONS_PER_TARGET; i++) {
    totalCases++;
    const finisherCount = 1 + Math.floor(random() * 8); // 1〜8人
    const finishers = [];
    for (let p = 0; p < finisherCount; p++) {
      const correctCount = Math.floor(random() * 6);
      const totalReplayCount = Math.floor(random() * 6);
      finishers.push({
        uid: `uid-${p}`,
        participant: { displayName: `P${p}` },
        result: createInstantBattleResult({ correctCount, missCount: 0, totalElapsedMs: 1000, totalReplayCount, completed: true }),
      });
    }
    finishers.sort((a, b) => compareInstantBattleResults(a.result, b.result));
    try {
      const ranks = computeFinisherRanks("instantBattle", finishers, {});
      if (ranks.length !== finishers.length) {
        failures.push({ target: "computeFinisherRanks", input: finishers.map((f) => f.result.detail), ranks, reason: "順位の件数が参加者数と一致しない" });
      }
      for (let idx = 1; idx < ranks.length; idx++) {
        const isTied = compareInstantBattleResults(finishers[idx - 1].result, finishers[idx].result) === 0;
        if (isTied && ranks[idx] !== ranks[idx - 1]) {
          failures.push({ target: "computeFinisherRanks", input: finishers.map((f) => f.result.detail), ranks, reason: "完全同着なのに同じ順位にならなかった" });
        }
        if (!isTied && ranks[idx] <= ranks[idx - 1]) {
          failures.push({ target: "computeFinisherRanks", input: finishers.map((f) => f.result.detail), ranks, reason: "同着でないのに順位が単調増加していない" });
        }
      }
    } catch (error) {
      failures.push({ target: "computeFinisherRanks", input: finishers.map((f) => f.result.detail), error: error.message });
    }
  }

  // ---- ⑥restrictSongPoolToCommonAvailability：結果が必ずbasePoolの部分集合であること・
  //      報告者全員が持っている曲だけが残ること ----
  const allSongIds = ["a", "b", "c", "d", "e", "f", "g", "h"];
  for (let i = 0; i < ITERATIONS_PER_TARGET; i++) {
    totalCases++;
    const basePool = allSongIds.filter(() => pickBool(random));
    const reporterCount = Math.floor(random() * 4);
    const availabilityList = [];
    for (let r = 0; r < reporterCount; r++) {
      if (pickBool(random)) {
        availabilityList.push(allSongIds.filter(() => pickBool(random)));
      } else {
        availabilityList.push(null); // 未報告（nullはフィルタ対象外として無視される想定）
      }
    }
    try {
      const result = restrictSongPoolToCommonAvailability(basePool, availabilityList);
      const notSubset = result.some((id) => !basePool.includes(id));
      if (notSubset) {
        failures.push({ target: "restrictSongPoolToCommonAvailability", input: { basePool, availabilityList }, result, reason: "basePoolに無い曲が結果に含まれている" });
      }
      const reportedSets = availabilityList.filter((ids) => Array.isArray(ids)).map((ids) => new Set(ids));
      if (reportedSets.length > 0) {
        const missingSomewhere = result.some((id) => !reportedSets.every((set) => set.has(id)));
        if (missingSomewhere) {
          failures.push({ target: "restrictSongPoolToCommonAvailability", input: { basePool, availabilityList }, result, reason: "報告者全員が持っているとは限らない曲が残っている" });
        }
      }
    } catch (error) {
      failures.push({ target: "restrictSongPoolToCommonAvailability", input: { basePool, availabilityList }, error: error.message });
    }
  }

  if (failures.length > 0) {
    console.error(`onlineBattlePropertyFuzzTests: ${failures.length}件の不変条件違反/例外を検出（seed=${FUZZ_SEED}）`, failures.slice(0, 10));
  }
  assertEqual(
    failures.length,
    0,
    `シード${FUZZ_SEED}による${totalCases}回のランダム入力検査で、不変条件違反・例外が0件である（詳細はconsole.error参照。1件目: ${
      failures[0] ? JSON.stringify(failures[0]).slice(0, 300) : "なし"
    }）`
  );
}
