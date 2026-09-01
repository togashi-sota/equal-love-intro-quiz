// js/onlineBattleMatchInvalidationSecurityRules.js（オンライン速度勝負系対戦の「試合全体
// 無効化」セキュリティルール案のJSシミュレーター）のテスト。本人指示にある競合・安全性の
// 要件（同時押し・連打・すでに試合終了処理へ入っている・古いmatchId・ホスト/ゲストどちらも
// 機能する等）を、許可すべき正常系・拒否すべき異常系の両方で確認する。
// js/audioTroubleRecoverySecurityRules.test.jsと同じ位置づけ（実際のFirebase Rules構文の
// 検証＝Rules Playgroundとは別物）。

import { canWriteMatchInvalidated } from "../js/onlineBattleMatchInvalidationSecurityRules.js";
import { assertEqual } from "./test-utils.js";

function buildRoom(overrides) {
  return {
    host: "host-uid",
    activeMatchId: "MATCH1",
    status: "playing",
    matches: {
      MATCH1: {
        participants: { "host-uid": true, "guest-uid": true },
      },
    },
    ...overrides,
  };
}

export function runOnlineBattleMatchInvalidationSecurityRulesTests() {
  const room = buildRoom({});
  const base = { authUid: "guest-uid", room, matchId: "MATCH1", existingMatchInvalidatedExists: false };

  // ---- 正常系 ----
  assertEqual(canWriteMatchInvalidated(base), true, "許可：試合中の参加者（ゲスト）が申告する");
  assertEqual(
    canWriteMatchInvalidated({ ...base, authUid: "host-uid" }),
    true,
    "許可：試合中の参加者（ホスト）が申告する（本人指示：ホストが押しても同じように機能する）"
  );

  // ---- 【本人指示：連打対策】同じユーザーであっても、既にこの試合が無効化済みなら拒否 ----
  assertEqual(
    canWriteMatchInvalidated({ ...base, existingMatchInvalidatedExists: true }),
    false,
    "拒否：既に無効化済みの試合への2回目の書き込み（連打対策）"
  );

  // ---- 【本人指示：レース安全性】複数人がほぼ同時に押した場合の擬似シミュレーション ----
  {
    let matchIsInvalidated = false; // Firebase上の実際の状態を模した簡易フラグ
    const firstAttempt = canWriteMatchInvalidated({
      ...base,
      authUid: "host-uid",
      existingMatchInvalidatedExists: matchIsInvalidated,
    });
    assertEqual(firstAttempt, true, "レース：1人目（ホスト）の申告は許可される");
    if (firstAttempt) matchIsInvalidated = true; // 1人目の書き込みが先に反映されたと仮定

    const secondAttempt = canWriteMatchInvalidated({
      ...base,
      authUid: "guest-uid",
      existingMatchInvalidatedExists: matchIsInvalidated,
    });
    assertEqual(
      secondAttempt,
      false,
      "レース：ほぼ同時に来た2人目（ゲスト）の申告は、1人目が先に成立した後なので拒否される"
    );
  }

  // ---- 【本人指示：古いmatchIdから遅れてイベントが届いた】新しい試合が既に始まっている ----
  assertEqual(
    canWriteMatchInvalidated({ ...base, room: buildRoom({ activeMatchId: "MATCH2" }) }),
    false,
    "拒否：古い試合（既に次の試合が始まっている）への遅延申告"
  );

  // ---- 【本人指示：すでに試合終了処理へ入っている】ホストが結果を確定させた直後 ----
  assertEqual(
    canWriteMatchInvalidated({ ...base, room: buildRoom({ status: "result" }) }),
    false,
    "拒否：既にホストが結果を確定させた後（すでに試合終了処理へ入っている）の申告"
  );

  // ---- 対戦開始前（ロビー・カウントダウン）の申告も拒否 ----
  assertEqual(
    canWriteMatchInvalidated({ ...base, room: buildRoom({ status: "waiting" }) }),
    false,
    "拒否：まだ対戦が始まっていない（ロビー）ときの申告"
  );
  assertEqual(
    canWriteMatchInvalidated({ ...base, room: buildRoom({ status: "countdown" }) }),
    false,
    "拒否：カウントダウン中（まだ出題が始まっていない）の申告"
  );

  // ---- 未参加者・なりすまし・未認証 ----
  assertEqual(
    canWriteMatchInvalidated({
      ...base,
      authUid: "outsider-uid",
      room: buildRoom({ matches: { MATCH1: { participants: { "host-uid": true, "guest-uid": true } } } }),
    }),
    false,
    "拒否：その試合の参加者でない人（部外者）からの申告"
  );
  assertEqual(canWriteMatchInvalidated({ ...base, authUid: null }), false, "拒否：未認証");

  // ---- 存在しない試合IDへの申告（異常系での安全側） ----
  assertEqual(
    canWriteMatchInvalidated({ ...base, room: buildRoom({ activeMatchId: "MATCH1", matches: {} }) }),
    false,
    "拒否：matches配下にその試合のデータ自体が存在しない（異常系）"
  );
}
