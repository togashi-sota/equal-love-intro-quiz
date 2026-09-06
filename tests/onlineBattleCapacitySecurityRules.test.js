// js/onlineBattleCapacitySecurityRules.js（ルーム定員チェックのセキュリティルール案の
// JSシミュレーター）のテスト。許可すべき正常系・拒否すべき異常系の一覧に加え、
// 「N人がランダムな到着順で真に同時参加を試みても、定員を絶対に超えない」という
// 集合的な不変条件を、tests/stealRaceArbitrationFuzz.test.jsと同じ考え方の
// 逐次シミュレーションで大量にfuzz検査する。
import { createSeededRandom } from "../js/seededRandom.js";
import { canWritePlayerCount } from "../js/onlineBattleCapacitySecurityRules.js";
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
  // ===== canWritePlayerCount：許可/拒否一覧 =====
  {
    assertEqual(
      canWritePlayerCount({ authUid: "p1", previousCount: 3, newCount: 4, maxPlayers: 5 }),
      true,
      "許可：+1で、定員以内"
    );
    assertEqual(
      canWritePlayerCount({ authUid: "p1", previousCount: 4, newCount: 5, maxPlayers: 5 }),
      true,
      "許可：+1で、ちょうど定員（境界値）"
    );
    assertEqual(
      canWritePlayerCount({ authUid: "p1", previousCount: 5, newCount: 6, maxPlayers: 5 }),
      false,
      "拒否：+1した結果が定員を1人超える"
    );
    assertEqual(
      canWritePlayerCount({ authUid: "p1", previousCount: 3, newCount: 2, maxPlayers: 5 }),
      true,
      "許可：-1（退出・キック）"
    );
    assertEqual(
      canWritePlayerCount({ authUid: "p1", previousCount: 3, newCount: 5, maxPlayers: 5 }),
      false,
      "拒否：±1以外の飛び値（他の参加者の増減を無視した古い読み取りに基づく書き込み＝レースに負けた）"
    );
    assertEqual(
      canWritePlayerCount({ authUid: "p1", previousCount: null, newCount: 1, maxPlayers: 5 }),
      true,
      "許可：ルーム作成時の初回書き込み（previousCountがまだ存在しない）"
    );
    assertEqual(
      canWritePlayerCount({ authUid: null, previousCount: 3, newCount: 4, maxPlayers: 5 }),
      false,
      "拒否：未認証"
    );
    assertEqual(
      canWritePlayerCount({ authUid: "p1", previousCount: 3, newCount: "4", maxPlayers: 5 }),
      false,
      "拒否：数値でない値"
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
      // 到着した順に1件ずつ、「その時点でサーバーが実際に保持している値」から+1した値を
      // 書き込もうとする（実際のFirebaseの動作を模す：各clientは自分が読んだ古い値から
      // +1を計算するが、ルールは常にその瞬間の実際のprevious値と比較する）。
      const allowed = canWritePlayerCount({
        authUid: uid,
        previousCount: currentCount,
        newCount: currentCount + 1,
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

  // ===== fuzz2（2026-09-06追加・独立レビューで指摘・是正）=====
  // 上のfuzzは、各joinerが提案する値を常に「その時点の最新currentCount」から
  // その都度計算し直しており、この修正が本来防ぐべき「複数人が同じ古い読み取り値を
  // 見て、同じ提案値でconflictする」という本物の同時実行レース—CASのズレ判定
  // （newCount !== previousCount±1）による拒否—を一度も踏んでいなかった（成功人数の
  // 上限は、専らmaxPlayers境界チェックの分岐だけで実現されていた）。
  // このfuzz2は、「N人が同じ古いスナップショットから同じnewCountを提案する」という
  // より実機に近い同時参加を再現し、①CASのズレによる拒否が実際に発生すること
  // （＝この修正の核心部分が本当にテストされていること）②同じ提案値である以上、
  // 成功できるのは高々1人であること、の2点を検査する。
  const random2 = createSeededRandom(FUZZ_SEED + 1);
  const failures2 = [];
  let staleRejectionCount = 0;
  let capRejectionCount = 0;

  for (let trial = 0; trial < TRIAL_COUNT; trial++) {
    const maxPlayers = 1 + Math.floor(random2() * 9); // 1〜9人
    const initialCount = Math.floor(random2() * maxPlayers); // 0〜maxPlayers-1人が既に在室
    const waveSize = 2 + Math.floor(random2() * 8); // 2〜9人が「真に同時」に参加を試みる

    // 全員がルームの状態を読み取った「その瞬間」のスナップショット（以降、誰も
    // 読み直さずに一斉に書き込みを試みる＝実機の「真の同時実行」テストと同じ状況）。
    const staleSnapshot = initialCount;
    let currentCount = initialCount;
    let successCount = 0;

    for (let i = 0; i < waveSize; i++) {
      const proposedNewCount = staleSnapshot + 1; // 全員が同じ古い値から同じ+1を提案する
      const allowed = canWritePlayerCount({
        authUid: `wave-${trial}-${i}`,
        previousCount: currentCount,
        newCount: proposedNewCount,
        maxPlayers,
      });
      if (allowed) {
        currentCount = proposedNewCount;
        successCount++;
      } else if (proposedNewCount > maxPlayers) {
        capRejectionCount++;
      } else {
        staleRejectionCount++;
      }
    }

    // 【不変条件1】最終人数は定員を絶対に超えない。
    if (currentCount > maxPlayers) {
      failures2.push({ trial, reason: `最終人数(${currentCount})が定員(${maxPlayers})を超えた`, maxPlayers, initialCount, waveSize });
    }
    // 【不変条件2】全員が同じ提案値である以上、成功できるのは高々1人のはず
    // （2人以上が成功したなら、CASのズレ検知が機能していない＝この修正の根幹が壊れている）。
    if (successCount > 1) {
      failures2.push({ trial, reason: `同じ古い値からの同一提案なのに${successCount}人が成功した`, maxPlayers, initialCount, waveSize });
    }
  }

  if (failures2.length > 0) {
    console.error(`onlineBattleCapacitySecurityRulesTests(fuzz2): ${failures2.length}件の不変条件違反を検出（seed=${FUZZ_SEED + 1}）`, failures2.slice(0, 10));
  }
  assertEqual(
    failures2.length,
    0,
    `シード${FUZZ_SEED + 1}による${TRIAL_COUNT}件の「同じ古い値から同時提案」シミュレーションで、` +
      `「最終人数は定員を超えない」「同一提案での成功者は高々1人」が全トライアルで成立する` +
      `（詳細はconsole.error参照。1件目: ${failures2[0] ? JSON.stringify(failures2[0]) : "なし"}）`
  );
  // 【最重要】このfuzz2自体が「CASのズレによる拒否」という、この修正の核心部分を
  // 実際に踏んでいることを確認する（踏んでいなければ、上の不変条件チェック自体が
  // 無意味になってしまうため）。
  assertEqual(
    staleRejectionCount > 0,
    true,
    `fuzz2の${TRIAL_COUNT}トライアル中、CASのズレ（newCount !== previousCount±1）による拒否が` +
      `少なくとも1回は発生している（実際: staleRejectionCount=${staleRejectionCount}, capRejectionCount=${capRejectionCount}）` +
      `＝この修正が防ごうとしている本物の同時参加レースの拒否ロジックが、fuzzで実際に検証されている`
  );
}
