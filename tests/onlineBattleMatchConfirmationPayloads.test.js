// js/onlineBattleMatchConfirmationPayloads.jsのテスト（2026-09-13新設・本人指示：
// 対戦開始前ルール確認画面）。Firebaseの読み書きを一切伴わない純粋な判定ロジックだけを
// 検証する（js/onlineBattle.js自体はFirebase初期化が必要なため、恒久テストの対象外）。

import {
  hasMatchMembershipChanged,
  computeAllPlayersConfirmed,
  computeAllPlayersRematchReady,
  computeAllPlayersResultReturned,
} from "../js/onlineBattleMatchConfirmationPayloads.js";
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

  // ---- computeAllPlayersRematchReady（再戦準備フェーズ新設・本人指示） ----
  {
    // 2人対戦：基本パターン
    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true }, b: { rematchReady: true } }),
      true,
      "2人対戦：全員がrematchReady:trueなら準備完了と判定する"
    );
    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true }, b: { rematchReady: false } }),
      false,
      "2人対戦：1人でも未準備がいれば準備完了ではないと判定する"
    );

    // 3人対戦：基本パターン
    assertEqual(
      computeAllPlayersRematchReady({
        a: { rematchReady: true },
        b: { rematchReady: true },
        c: { rematchReady: true },
      }),
      true,
      "3人対戦：全員がrematchReady:trueなら準備完了と判定する"
    );
    assertEqual(
      computeAllPlayersRematchReady({
        a: { rematchReady: true },
        b: { rematchReady: true },
        c: { rematchReady: false },
      }),
      false,
      "3人対戦：3人中1人でも未準備がいれば準備完了ではないと判定する"
    );

    // 【エッジケース：準備待ち中に途中退出】退出したプレイヤーはroom.playersから削除される
    // （js/onlineBattle.jsのleaveRoom()参照）ため、「退出者を除いた残りのプレイヤーだけ」を
    // 渡した状態で判定できることを確認する＝退出者を待たずに準備完了と判定できる。
    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true } }),
      true,
      "3人→1人退出：残った参加者だけが準備OKなら、退出者を待たずに準備完了と判定する"
    );

    // 【エッジケース：準備待ち中に新しい参加者が入室】新規参加時はjs/onlineBattle.jsの
    // resetRematchReadyIfConfirming()が既存参加者を含めて全員のrematchReadyをfalseへ戻す
    // （本人指示：新しく入った人を含めて、もう一度全員で準備OKを押し直す必要がある）。
    // ここでは「リセット後の状態」を渡し、新しい参加者が混ざると準備完了ではなくなることを確認する。
    assertEqual(
      computeAllPlayersRematchReady({
        a: { rematchReady: false }, // リセットされた既存参加者
        b: { rematchReady: false }, // リセットされた既存参加者
        c: { rematchReady: false }, // 新しく入室した参加者
      }),
      false,
      "3人（うち1人が新規参加者）：全員リセット直後は準備完了ではないと判定する"
    );
    assertEqual(
      computeAllPlayersRematchReady({
        a: { rematchReady: true },
        b: { rematchReady: true },
        c: { rematchReady: true },
      }),
      true,
      "3人（うち1人が新規参加者）：新規参加者を含め全員が改めて準備OKを押せば準備完了と判定する"
    );

    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true }, b: {} }),
      false,
      "rematchReadyフィールド自体が無い参加者は未準備として扱う"
    );
    assertEqual(computeAllPlayersRematchReady({}), false, "参加者が1人もいなければ準備完了とはみなさない（安全側）");
    assertEqual(computeAllPlayersRematchReady(undefined), false, "playersがundefinedでも安全にfalseを返す");
  }

  // ---- computeAllPlayersResultReturned（オンライン対戦総合改修 第2ラウンド26-29章新設） ----
  {
    assertEqual(
      computeAllPlayersResultReturned({ a: { resultReturned: true }, b: { resultReturned: true } }),
      true,
      "全員がresultReturned:trueなら全員戻り終えたと判定する"
    );
    assertEqual(
      computeAllPlayersResultReturned({ a: { resultReturned: true }, b: { resultReturned: false } }),
      false,
      "1人でもまだ戻っていなければ全員戻り終えたとは判定しない"
    );
    assertEqual(
      computeAllPlayersResultReturned({ a: { resultReturned: true }, b: {} }),
      false,
      "resultReturnedフィールド自体が無い参加者はまだ戻っていないとして扱う"
    );
    assertEqual(computeAllPlayersResultReturned({}), false, "参加者が1人もいなければ戻り終えたとはみなさない（安全側）");
    assertEqual(computeAllPlayersResultReturned(undefined), false, "playersがundefinedでも安全にfalseを返す");

    // 【本人指示：切断中の参加者を待たない】既存のconnectedフラグ（presence/切断検知）で
    // 除外することで、詰み（誰かの端末が落ちて二度と次の試合が始められない）を防ぐ。
    assertEqual(
      computeAllPlayersResultReturned({
        a: { resultReturned: true },
        b: { resultReturned: false, connected: false }, // 切断中：待たない
      }),
      true,
      "切断中の参加者は、resultReturnedがfalseのままでも待たずに全員戻り終えたと判定する"
    );
    assertEqual(
      computeAllPlayersResultReturned({
        a: { resultReturned: false, connected: false },
        b: { resultReturned: false, connected: false },
      }),
      false,
      "全員が切断中の場合は、待つべき相手が1人もいない扱い（安全側）として戻り終えたとは判定しない"
    );
    assertEqual(
      computeAllPlayersResultReturned({
        a: { resultReturned: true, connected: true },
        b: { resultReturned: true, connected: true },
        c: { resultReturned: false, connected: false },
      }),
      true,
      "3人中1人が切断中：残り2人が戻り終えていれば、切断中の1人を待たずに戻り終えたと判定する"
    );
  }
}
