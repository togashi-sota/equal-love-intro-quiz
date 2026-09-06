// js/localBattleResult.js（ローカル対戦＝2台のスマホ間で結果コードをやり取りする方式）の
// テスト。2026-09-06、ポートフォリオ公開に向けた最終QAフェーズのテストカバレッジ監査で、
// この結果コード・順位判定（rankBattleParticipants()/compareResults()）が一切テストされて
// いないことが判明した。「勝者・順位を間違って表示する」というアプリで最も目立つ種類の
// 不具合に直結するため、優先して追加する。
import { createSeededRandom } from "../js/seededRandom.js";
import { encodeResultCode, decodeResultCode, computeNormalFinalRecordMs, rankBattleParticipants } from "../js/localBattleResult.js";
import { assertEqual } from "./test-utils.js";

function makeResult({ totalElapsedMs, correctCount, missCount, completed = true, reachedQuestionNumber = 10 }) {
  return { totalElapsedMs, correctCount, missCount, completed, reachedQuestionNumber };
}

export function runLocalBattleResultTests() {
  // ===== encodeResultCode / decodeResultCode の往復 =====
  {
    const battleSeed = 123456;
    const code = encodeResultCode({
      battleSeed,
      totalElapsedMs: 12345,
      correctCount: 8,
      missCount: 2,
      completed: true,
      reachedQuestionNumber: 10,
    });
    const decoded = decodeResultCode(code, battleSeed);
    assertEqual(decoded.ok, true, "結果コードのエンコード→デコードが成功する");
    assertEqual(decoded.result.totalElapsedMs, 12350, "totalElapsedMsはセンチ秒（10ms）単位に丸められて復元される（12345→四捨五入で12350）");
    assertEqual(decoded.result.correctCount, 8, "correctCountが正しく復元される");
    assertEqual(decoded.result.missCount, 2, "missCountが正しく復元される");
    assertEqual(decoded.result.completed, true, "completedが正しく復元される");
    assertEqual(decoded.result.reachedQuestionNumber, 10, "reachedQuestionNumberが正しく復元される");

    const decodedWrongBattle = decodeResultCode(code, 999999);
    assertEqual(decodedWrongBattle, { ok: false, reason: "wrong-battle" }, "違う対戦のbattleSeedを渡すとwrong-battleになる");

    assertEqual(decodeResultCode("", battleSeed).ok, false, "空文字はinvalid扱いになる（例外を投げない）");
    assertEqual(decodeResultCode("AAAA-AAAA-AAAA", battleSeed).reason, "invalid", "改ざんされたコード（チェックサム不一致）はinvalid扱いになる");
  }

  // ===== 上限値の丸め（MAX_CORRECT_COUNT等）が例外を投げず切り詰められる =====
  {
    const battleSeed = 1;
    const code = encodeResultCode({
      battleSeed,
      totalElapsedMs: 999999999,
      correctCount: 9999,
      missCount: 9999,
      completed: false,
      reachedQuestionNumber: 9999,
    });
    const decoded = decodeResultCode(code, battleSeed);
    assertEqual(decoded.ok, true, "極端に大きい値を渡しても例外を投げずエンコードできる");
    assertEqual(decoded.result.correctCount, 127, "correctCountの上限(127)に切り詰められる");
    assertEqual(decoded.result.missCount, 127, "missCountの上限(127)に切り詰められる");
    assertEqual(decoded.result.reachedQuestionNumber, 127, "reachedQuestionNumberの上限(127)に切り詰められる");
  }

  // ===== computeNormalFinalRecordMs =====
  {
    const result = makeResult({ totalElapsedMs: 10000, correctCount: 5, missCount: 3 });
    assertEqual(computeNormalFinalRecordMs(result, 2), 16000, "ノーマルの最終記録＝実測タイム＋ミス数×ペナルティ秒（3ミス×2秒=6000ms加算）");
    assertEqual(computeNormalFinalRecordMs(result, 0), 10000, "ペナルティ秒0なら実測タイムのまま");
  }

  // ===== ノーマルルールの順位判定（本人指定仕様：①最終記録②ミス数） =====
  {
    const penalty = 2; // 秒
    const fast = { playerName: "速いがミス多い", result: makeResult({ totalElapsedMs: 10000, correctCount: 5, missCount: 5 }) }; // final=20000
    const slow = { playerName: "遅いがミス少ない", result: makeResult({ totalElapsedMs: 15000, correctCount: 5, missCount: 1 }) }; // final=17000
    const ranked = rankBattleParticipants([fast, slow], "normal", penalty);
    assertEqual(ranked[0].playerName, "遅いがミス少ない", "ノーマル：最終記録（実測+ペナルティ）が短い方が1位になる（実測タイムだけでは判定しない）");
    assertEqual(ranked[0].rank, 1, "1位のrankが1");
    assertEqual(ranked[1].rank, 2, "2位のrankが2");

    // 最終記録が同じ場合はミス数が少ない方が上位
    const tieA = { playerName: "A", result: makeResult({ totalElapsedMs: 10000, correctCount: 5, missCount: 2 }) }; // final=14000
    const tieB = { playerName: "B", result: makeResult({ totalElapsedMs: 12000, correctCount: 5, missCount: 1 }) }; // final=14000
    const rankedTie = rankBattleParticipants([tieA, tieB], "normal", penalty);
    assertEqual(rankedTie[0].playerName, "B", "ノーマル：最終記録が同じならミス数が少ない方が1位");
  }

  // ===== ハードルールの順位判定（本人指定仕様：①正解数②タイム③ミス数） =====
  {
    const moreCorrectSlow = { playerName: "正解数多いが遅い", result: makeResult({ totalElapsedMs: 20000, correctCount: 9, missCount: 1 }) };
    const fewerCorrectFast = { playerName: "正解数少ないが速い", result: makeResult({ totalElapsedMs: 5000, correctCount: 7, missCount: 3 }) };
    const ranked = rankBattleParticipants([fewerCorrectFast, moreCorrectSlow], "hard", 2);
    assertEqual(ranked[0].playerName, "正解数多いが遅い", "ハード：正解数が多い方が1位（連打で速く終わらせても正解数が優先される）");

    const sameCorrectA = { playerName: "同正解・遅い", result: makeResult({ totalElapsedMs: 20000, correctCount: 8, missCount: 2 }) };
    const sameCorrectB = { playerName: "同正解・速い", result: makeResult({ totalElapsedMs: 10000, correctCount: 8, missCount: 2 }) };
    const rankedSame = rankBattleParticipants([sameCorrectA, sameCorrectB], "hard", 2);
    assertEqual(rankedSame[0].playerName, "同正解・速い", "ハード：正解数が同じならタイムが短い方が1位");
  }

  // ===== LOVE連チャンルールの順位判定（本人指定仕様：①クリア②到達数③タイム④ミス数） =====
  {
    const completedSlow = { playerName: "クリア・遅い", result: makeResult({ totalElapsedMs: 60000, correctCount: 10, missCount: 3, completed: true, reachedQuestionNumber: 10 }) };
    const dnfFast = { playerName: "未クリア・速い", result: makeResult({ totalElapsedMs: 5000, correctCount: 9, missCount: 0, completed: false, reachedQuestionNumber: 9 }) };
    const ranked = rankBattleParticipants([dnfFast, completedSlow], "loveChain", 2);
    assertEqual(ranked[0].playerName, "クリア・遅い", "LOVE連チャン：全問クリアした人が、未クリアの人より必ず上位になる（タイムに関わらず）");

    const dnfA = { playerName: "到達9", result: makeResult({ totalElapsedMs: 5000, correctCount: 9, missCount: 0, completed: false, reachedQuestionNumber: 9 }) };
    const dnfB = { playerName: "到達7", result: makeResult({ totalElapsedMs: 1000, correctCount: 7, missCount: 0, completed: false, reachedQuestionNumber: 7 }) };
    const rankedDnf = rankBattleParticipants([dnfB, dnfA], "loveChain", 2);
    assertEqual(rankedDnf[0].playerName, "到達9", "LOVE連チャン：未クリア同士は到達問題数が多い方が上位（タイムより優先）");

    const bothCompletedSlow = { playerName: "クリア・遅い2", result: makeResult({ totalElapsedMs: 60000, correctCount: 10, missCount: 0, completed: true, reachedQuestionNumber: 10 }) };
    const bothCompletedFast = { playerName: "クリア・速い2", result: makeResult({ totalElapsedMs: 30000, correctCount: 10, missCount: 0, completed: true, reachedQuestionNumber: 10 }) };
    const rankedBothCompleted = rankBattleParticipants([bothCompletedSlow, bothCompletedFast], "loveChain", 2);
    assertEqual(rankedBothCompleted[0].playerName, "クリア・速い2", "LOVE連チャン：両者クリア済みならタイムが短い方が上位");
  }

  // ===== fuzz：ランダムな参加者一覧でも、各ルールの不変条件が崩れない =====
  const FUZZ_SEED = 20260906;
  const TRIAL_COUNT = 500;
  const random = createSeededRandom(FUZZ_SEED);
  const rules = ["normal", "hard", "loveChain"];
  const failures = [];

  function randomResult() {
    return makeResult({
      totalElapsedMs: Math.floor(random() * 300000),
      correctCount: Math.floor(random() * 20),
      missCount: Math.floor(random() * 10),
      completed: random() < 0.5,
      reachedQuestionNumber: Math.floor(random() * 15),
    });
  }

  for (let trial = 0; trial < TRIAL_COUNT; trial++) {
    const rule = rules[Math.floor(random() * rules.length)];
    const penaltySecondsPerMiss = Math.floor(random() * 6);
    const participantCount = 2 + Math.floor(random() * 8); // 2〜9人
    const participants = Array.from({ length: participantCount }, (_, i) => ({
      playerName: `P${i}`,
      result: randomResult(),
    }));

    const ranked = rankBattleParticipants(participants, rule, penaltySecondsPerMiss);

    // 【不変条件1】人数が変わらない・rankが1からparticipantCountまで重複無く1つずつ割り振られる。
    if (ranked.length !== participantCount) {
      failures.push({ trial, reason: `参加人数が変化した(${participantCount}→${ranked.length})` });
    }
    const ranks = ranked.map((p) => p.rank);
    const expectedRanks = Array.from({ length: participantCount }, (_, i) => i + 1);
    if (JSON.stringify(ranks) !== JSON.stringify(expectedRanks)) {
      failures.push({ trial, reason: `rankが1〜${participantCount}の連番になっていない: ${JSON.stringify(ranks)}` });
    }

    // 【不変条件2】隣接する2人について、compareResultsが「上位が下位より真に優れているか、
    // 少なくとも劣っていない」という順序が実際に保たれているかを、ルールごとの一次指標で検算する。
    for (let i = 0; i + 1 < ranked.length; i++) {
      const upper = ranked[i].result;
      const lower = ranked[i + 1].result;
      if (rule === "hard") {
        if (upper.correctCount < lower.correctCount) {
          failures.push({ trial, reason: `hard: 上位(${upper.correctCount}問正解)が下位(${lower.correctCount}問正解)より正解数が少ない` });
        }
      } else if (rule === "normal") {
        const upperFinal = computeNormalFinalRecordMs(upper, penaltySecondsPerMiss);
        const lowerFinal = computeNormalFinalRecordMs(lower, penaltySecondsPerMiss);
        if (upperFinal > lowerFinal) {
          failures.push({ trial, reason: `normal: 上位の最終記録(${upperFinal}ms)が下位(${lowerFinal}ms)より長い` });
        }
      } else if (rule === "loveChain") {
        if (!upper.completed && lower.completed) {
          failures.push({ trial, reason: `loveChain: 未クリアの人がクリア済みの人より上位になっている` });
        }
      }
    }
  }

  if (failures.length > 0) {
    console.error(`localBattleResultTests(fuzz): ${failures.length}件の不変条件違反を検出（seed=${FUZZ_SEED}）`, failures.slice(0, 10));
  }
  assertEqual(
    failures.length,
    0,
    `シード${FUZZ_SEED}による${TRIAL_COUNT}件のランダム参加者一覧（2〜9人・normal/hard/loveChainランダム）で、` +
      `各ルールの順位判定の一次指標が矛盾なく守られている（詳細はconsole.error参照。1件目: ${failures[0] ? JSON.stringify(failures[0]) : "なし"}）`
  );
}
