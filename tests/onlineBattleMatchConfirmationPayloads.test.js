// js/onlineBattleMatchConfirmationPayloads.jsのテスト（2026-09-13新設・本人指示：
// 対戦開始前ルール確認画面）。Firebaseの読み書きを一切伴わない純粋な判定ロジックだけを
// 検証する（js/onlineBattle.js自体はFirebase初期化が必要なため、恒久テストの対象外）。

import { hasMatchMembershipChanged, computeAllPlayersConfirmed } from "../js/onlineBattleMatchConfirmationPayloads.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleMatchConfirmationPayloadsTests() {
  // ---- hasMatchMembershipChanged ----
  {
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a", "b"] }),
      false,
      "参加者が全く同じなら変化なしと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["b", "a"] }),
      false,
      "並び順が違うだけ（Object.keysの順序差）は変化とみなさない"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a", "b", "c"] }),
      true,
      "新しい参加者が増えていれば変化ありと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a"] }),
      true,
      "誰かが抜けていれば変化ありと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a", "c"] }),
      true,
      "人数は同じでも中身が入れ替わっていれば変化ありと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: [], currentPlayerUids: [] }),
      false,
      "どちらも空なら変化なしと判定する"
    );
  }

  // ---- computeAllPlayersConfirmed ----
  {
    assertEqual(
      computeAllPlayersConfirmed({ a: { ruleConfirmed: true }, b: { ruleConfirmed: true } }),
      true,
      "全員がruleConfirmed:trueなら全員確認済みと判定する"
    );
    assertEqual(
      computeAllPlayersConfirmed({ a: { ruleConfirmed: true }, b: { ruleConfirmed: false } }),
      false,
      "1人でも未確認がいれば全員確認済みではないと判定する"
    );
    assertEqual(
      computeAllPlayersConfirmed({ a: { ruleConfirmed: true }, b: {} }),
      false,
      "ruleConfirmedフィールド自体が無い参加者は未確認として扱う"
    );
    assertEqual(computeAllPlayersConfirmed({}), false, "参加者が1人もいなければ確認済みとはみなさない（安全側）");
    assertEqual(computeAllPlayersConfirmed(undefined), false, "playersがundefinedでも安全にfalseを返す");
  }
}
