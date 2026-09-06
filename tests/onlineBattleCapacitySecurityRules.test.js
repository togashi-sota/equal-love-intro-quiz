// js/onlineBattleCapacitySecurityRules.js（ルーム定員チェックのセキュリティルール案の
// JSシミュレーター）のテスト。許可すべき正常系・拒否すべき異常系の一覧に加え、
// 「N人がランダムな到着順で真に同時参加を試みても、定員を絶対に超えない」という
// 集合的な不変条件を、tests/stealRaceArbitrationFuzz.test.jsと同じ考え方の
// 逐次シミュレーションで大量にfuzz検査する。
import { createSeededRandom } from "../js/seededRandom.js";
import { canWritePlayerSlot } from "../js/onlineBattleCapacitySecurityRules.js";
import { assertEqual } from "./test-utils.js";

const FUZZ_SEED = 20260906;
const TRIAL_COUNT = 300;

function shuffle(array, random) {
  const result = array.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function runOnlineBattleCapacitySecurityRulesTests() {
  // ===== canWritePlayerSlot：許可/拒否一覧 =====
  {
    assertEqual(
      canWritePlayerSlot({ authUid: "p1", targetUid: "p1", existingEntryExists: false, playerCountAfterWrite: 3, maxPlayers: 5 }),
      true,
      "許可：新規参加で、書き込み後の人数が定員以内"
    );
    assertEqual(
      canWritePlayerSlot({ authUid: "p1", targetUid: "p1", existingEntryExists: false, playerCountAfterWrite: 5, maxPlayers: 5 }),
      true,
      "許可：新規参加で、書き込み後の人数がちょうど定員（境界値）"
    );
    assertEqual(
      canWritePlayerSlot({ authUid: "p1", targetUid: "p1", existingEntryExists: false, playerCountAfterWrite: 6, maxPlayers: 5 }),
      false,
      "拒否：新規参加で、書き込み後の人数が定員を1人超える"
    );
    assertEqual(
      canWritePlayerSlot({ authUid: "p1", targetUid: "p2", existingEntryExists: false, playerCountAfterWrite: 3, maxPlayers: 5 }),
      false,
      "拒否：他人の枠への新規書き込み（なりすまし）"
    );
    assertEqual(
      canWritePlayerSlot({ authUid: "p1", targetUid: "p1", existingEntryExists: true, playerCountAfterWrite: 999, maxPlayers: 5 }),
      true,
      "許可：既存エントリの更新（再接続等）は人数に関わらず常に許可"
    );
    assertEqual(
      canWritePlayerSlot({ authUid: null, targetUid: "p1", existingEntryExists: false, playerCountAfterWrite: 1, maxPlayers: 5 }),
      false,
      "拒否：未認証"
    );
  }

  // ===== fuzz：N人がランダムな到着順で真に同時参加を試みても定員を絶対に超えない =====
  const random = createSeededRandom(FUZZ_SEED);
  const failures = [];

  for (let trial = 0; trial < TRIAL_COUNT; trial++) {
    const maxPlayers = 1 + Math.floor(random() * 9); // 1〜9人
    const initialCount = Math.floor(random() * maxPlayers); // 0〜maxPlayers-1人が既に在室
    const joinerCount = 1 + Math.floor(random() * 12); // 1〜12人が新規参加を試みる
    const joiners = Array.from({ length: joinerCount }, (_, i) => `joiner-${i}`);
    const arrivalOrder = shuffle(joiners, random);

    let currentCount = initialCount;
    let successCount = 0;
    for (const uid of arrivalOrder) {
      // 到着した順に1件ずつ、Firebaseのroot参照が表す「この書き込みが適用された後」の
      // 人数（＝現在の人数＋1）を渡して判定する。
      const allowed = canWritePlayerSlot({
        authUid: uid,
        targetUid: uid,
        existingEntryExists: false,
        playerCountAfterWrite: currentCount + 1,
        maxPlayers,
      });
      if (allowed) {
        currentCount++;
        successCount++;
      }
    }

    // 【不変条件1】最終人数は定員を絶対に超えない。
    if (currentCount > maxPlayers) {
      failures.push({ trial, reason: `最終人数(${currentCount})が定員(${maxPlayers})を超えた`, maxPlayers, initialCount, joinerCount });
    }
    // 【不変条件2】成功した人数は「空いていた枠数」を絶対に超えない。
    const availableSlots = maxPlayers - initialCount;
    if (successCount > availableSlots) {
      failures.push({ trial, reason: `成功人数(${successCount})が空き枠数(${availableSlots})を超えた`, maxPlayers, initialCount, joinerCount });
    }
    // 【不変条件3】空き枠が余っているのに参加者が拒否されることは無い
    // （joinerCountが空き枠以下なら全員成功するはず）。
    if (joinerCount <= availableSlots && successCount !== joinerCount) {
      failures.push({ trial, reason: `空き枠(${availableSlots})が足りているのに全員成功しなかった(${successCount}/${joinerCount})`, maxPlayers, initialCount, joinerCount });
    }
  }

  if (failures.length > 0) {
    console.error(`onlineBattleCapacitySecurityRulesTests: ${failures.length}件の不変条件違反を検出（seed=${FUZZ_SEED}）`, failures.slice(0, 10));
  }
  assertEqual(
    failures.length,
    0,
    `シード${FUZZ_SEED}による${TRIAL_COUNT}件のランダム同時参加（1〜9人部屋・1〜12人が同時参加）で、` +
      `「最終人数は定員を超えない」「成功人数は空き枠数を超えない」「空き枠が足りていれば全員成功する」が全トライアルで成立する` +
      `（詳細はconsole.error参照。1件目: ${failures[0] ? JSON.stringify(failures[0]) : "なし"}）`
  );
}
