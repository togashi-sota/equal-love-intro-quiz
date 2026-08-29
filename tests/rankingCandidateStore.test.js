// js/rankingCandidateStore.js のテスト（2026-08-16新設）。
// 「フレンド」公開設定がOFFのときも、ランキング条件を満たした自己ベストを端末内に
// 保存しておき、後からONにした瞬間にまとめてFirebaseへ同期できるようにする仕組みの、
// ローカル保存部分だけを対象にする（Firebaseとのやり取りはjs/timeAttackLeaderboardSync.jsの
// syncRankingCandidatesToFirebase側の責務で、Firebase初期化を伴うためこのファイルの
// 恒久テストの対象外＝実ブラウザでの確認に任せる）。
import {
  getRankingCandidateBest,
  saveRankingCandidateIfBetter,
  getAllRankingCandidateBests,
} from "../js/rankingCandidateStore.js";
import { addPlayer, deletePlayer, setActivePlayerId, DEFAULT_PLAYER_ID } from "../js/playerProfile.js";
import { assertEqual } from "./test-utils.js";

const STORAGE_KEY = "equalLoveIntroQuiz.rankingCandidateBest";

function cleanup() {
  localStorage.removeItem(STORAGE_KEY);
}

export function runRankingCandidateStoreTests() {
  cleanup();

  // ---- 未保存の組み合わせはnull ----
  assertEqual(
    getRankingCandidateBest("intro", "5", "title-track"),
    null,
    "まだ保存されていない組み合わせはnullを返す"
  );
  assertEqual(getAllRankingCandidateBests(), [], "何も保存されていなければ空配列を返す");

  // ---- 初回保存は常に保存される ----
  assertEqual(
    saveRankingCandidateIfBetter({
      variant: "intro",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      clearTimeMs: 20000,
      missCount: 0,
      rule: "normal",
      source: "normal",
      achievedAt: 1000,
    }),
    true,
    "記録が無い状態からの初回保存は常に保存される"
  );
  assertEqual(
    getRankingCandidateBest("intro", "5", "title-track").clearTimeMs,
    20000,
    "保存した記録がそのまま読み出せる"
  );

  // ---- 本人指示のケース：20秒→17秒→19秒と出した場合、17秒だけが残る ----
  assertEqual(
    saveRankingCandidateIfBetter({
      variant: "intro",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      clearTimeMs: 17000,
      missCount: 0,
      rule: "hard",
      source: "timeAttack",
      achievedAt: 2000,
    }),
    true,
    "20秒→17秒は更新される（速くなったため）"
  );
  assertEqual(
    saveRankingCandidateIfBetter({
      variant: "intro",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      clearTimeMs: 19000,
      missCount: 0,
      rule: "loveChain",
      source: "timeAttack",
      achievedAt: 3000,
    }),
    false,
    "17秒→19秒は更新されない（遅くなったため、保存済みの17秒がそのまま残る）"
  );
  const best = getRankingCandidateBest("intro", "5", "title-track");
  assertEqual(best.clearTimeMs, 17000, "20秒→17秒→19秒の同期候補は最速の17秒だけが残る");
  assertEqual(best.rule, "hard", "残っているのは17秒を記録したときのrule（hard）");

  // ---- 同タイムは更新しない（登録日時をむやみに更新しないため、既存の記録を優先） ----
  assertEqual(
    saveRankingCandidateIfBetter({
      variant: "intro",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      clearTimeMs: 17000,
      missCount: 0,
      rule: "normal",
      source: "normal",
      achievedAt: 4000,
    }),
    false,
    "全く同じタイムは「速くなっていない」として更新しない"
  );

  cleanup();

  // ---- 2026-08-29追加、本人指示：同タイム再送信でも、既存記録に欠けているactualQuestionCount
  //      だけは後から補える（ランキング平均タイムが永久に欠けたままになるバグの修正） ----
  saveRankingCandidateIfBetter({
    variant: "randomPlayback",
    questionCountValue: "all",
    categoryFilterValue: "all",
    clearTimeMs: 159060,
    missCount: 0,
    rule: null,
    source: null,
    achievedAt: 1,
    // actualQuestionCountを渡さない＝バックフィル機能追加より前の古い記録を再現している
  });
  assertEqual(
    getRankingCandidateBest("randomPlayback", "all", "all").actualQuestionCount,
    null,
    "actualQuestionCountを渡さずに保存した古い記録は、そのままnullで保存される"
  );
  const backfillResult = saveRankingCandidateIfBetter({
    variant: "randomPlayback",
    questionCountValue: "all",
    categoryFilterValue: "all",
    clearTimeMs: 159060,
    missCount: 0,
    rule: null,
    source: null,
    achievedAt: 2,
    actualQuestionCount: 82,
  });
  assertEqual(
    backfillResult,
    false,
    "同タイム・同ミス数の再送信は、今までどおり「新記録ではない」としてfalseを返す（登録日時等は更新しない）"
  );
  assertEqual(
    getRankingCandidateBest("randomPlayback", "all", "all").actualQuestionCount,
    82,
    "ただしactualQuestionCountだけは、欠けていた分がこっそり補完される"
  );
  assertEqual(
    getRankingCandidateBest("randomPlayback", "all", "all").achievedAt,
    1,
    "actualQuestionCountの補完では、登録日時（achievedAt）など他の項目は一切変更されない"
  );

  cleanup();

  // ---- variant・出題数・カテゴリーが違えば、それぞれ独立して保存される（混ざらない） ----
  saveRankingCandidateIfBetter({
    variant: "intro",
    questionCountValue: "5",
    categoryFilterValue: "title-track",
    clearTimeMs: 10000,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
  });
  saveRankingCandidateIfBetter({
    variant: "randomPlayback",
    questionCountValue: "5",
    categoryFilterValue: "title-track",
    clearTimeMs: 11000,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
  });
  saveRankingCandidateIfBetter({
    variant: "intro",
    questionCountValue: "10",
    categoryFilterValue: "title-track",
    clearTimeMs: 12000,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
  });
  saveRankingCandidateIfBetter({
    variant: "intro",
    questionCountValue: "5",
    categoryFilterValue: "title-and-group",
    clearTimeMs: 13000,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
  });
  saveRankingCandidateIfBetter({
    variant: "intro",
    questionCountValue: "5",
    categoryFilterValue: "all",
    clearTimeMs: 14000,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
  });

  assertEqual(getRankingCandidateBest("intro", "5", "title-track").clearTimeMs, 10000, "intro記録はintroだけに残る");
  assertEqual(
    getRankingCandidateBest("randomPlayback", "5", "title-track").clearTimeMs,
    11000,
    "randomPlayback記録はrandomPlaybackだけに残る（introと混ざらない）"
  );
  assertEqual(getRankingCandidateBest("intro", "10", "title-track").clearTimeMs, 12000, "出題数が違えば別記録として残る");
  assertEqual(
    getRankingCandidateBest("intro", "5", "title-and-group").clearTimeMs,
    13000,
    "カテゴリーが違えば別記録として残る"
  );
  assertEqual(
    getRankingCandidateBest("intro", "5", "all").clearTimeMs,
    14000,
    "カテゴリー「全曲」も出題数・他カテゴリーと混ざらず別記録として残る"
  );
  assertEqual(getAllRankingCandidateBests().length, 5, "保存した5パターンすべてがgetAllRankingCandidateBestsで取得できる");

  cleanup();

  // ---- プレイヤーごとに完全に分離される（本人指示：Player AのBESTとPlayer BのBESTが混ざらない） ----
  const originalActivePlayerId = DEFAULT_PLAYER_ID;
  saveRankingCandidateIfBetter({
    variant: "intro",
    questionCountValue: "5",
    categoryFilterValue: "title-track",
    clearTimeMs: 30000,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
  });

  const testPlayer = addPlayer("同期テスト用プレイヤー");
  setActivePlayerId(testPlayer.playerId);
  try {
    assertEqual(
      getRankingCandidateBest("intro", "5", "title-track"),
      null,
      "新しいプレイヤーに切り替えた直後は、別プレイヤーの記録が見えない（混ざらない）"
    );
    saveRankingCandidateIfBetter({
      variant: "intro",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      clearTimeMs: 25000,
      missCount: 0,
      rule: null,
      source: "normal",
      achievedAt: 1,
    });
    assertEqual(
      getRankingCandidateBest("intro", "5", "title-track").clearTimeMs,
      25000,
      "2人目のプレイヤーの記録は2人目のプレイヤーのキーに保存される"
    );
  } finally {
    setActivePlayerId(originalActivePlayerId);
    deletePlayer(testPlayer.playerId);
    localStorage.removeItem(`equalLoveIntroQuiz.player.${testPlayer.playerId}.rankingCandidateBest`);
  }

  assertEqual(
    getRankingCandidateBest("intro", "5", "title-track").clearTimeMs,
    30000,
    "元のプレイヤーへ戻すと、元のプレイヤー自身の記録（30000）がそのまま残っている（2人目の25000で上書きされていない）"
  );

  cleanup();
}
