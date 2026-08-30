// js/onlineBattleHostTransitionPayloads.jsのテスト。
import { pickNextHostUid } from "../js/onlineBattleHostTransitionPayloads.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleHostTransitionPayloadsTests() {
  // ---- 参加順が最も早い人が次のホストになる ----
  {
    const players = {
      b: { joinedAt: 200 },
      a: { joinedAt: 100 },
      c: { joinedAt: 300 },
    };
    assertEqual(pickNextHostUid(players, "b"), "a", "退出者を除いた中で、参加順が最も早い人が次のホストになる");
  }

  // ---- 退出しようとしている本人自身は候補から除外される ----
  {
    const players = { host: { joinedAt: 100 }, second: { joinedAt: 200 } };
    assertEqual(pickNextHostUid(players, "host"), "second", "退出する本人は候補から除外される");
  }

  // ---- 他に誰も残っていなければnull（ルーム削除の合図） ----
  {
    const players = { host: { joinedAt: 100 } };
    assertEqual(pickNextHostUid(players, "host"), null, "他に誰も残っていなければnullを返す");
  }

  // ---- players自体が空でもエラーにならない ----
  assertEqual(pickNextHostUid({}, "host"), null, "playersが空でもnullを返す（エラーにならない）");
  assertEqual(pickNextHostUid(undefined, "host"), null, "playersがundefinedでも安全にnullを返す");

  // ---- joinedAtが無い（異常データ）でもエラーにならない ----
  {
    const players = { a: {}, b: { joinedAt: 100 } };
    assertEqual(pickNextHostUid(players, "host"), "a", "joinedAtが無い参加者も0扱いで安全に処理される");
  }
}
