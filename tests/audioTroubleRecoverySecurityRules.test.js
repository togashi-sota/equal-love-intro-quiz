// js/audioTroubleRecoverySecurityRules.js（「音が出ない」救済ボタン第2段階・
// セキュリティルール案のJSシミュレーター）のテスト。許可すべき正常系・拒否すべき
// 攻撃/異常系の両方を一覧できる形で確認する。js/lyricsQuizBattleSecurityRules.test.jsと
// 同じ位置づけ（実際のFirebase Rules構文の検証＝Rules Playgroundとは別物）。

import {
  canWriteAudioTroubleReport,
  canWriteAudioTroubleRecoveryHostField,
  isAudioTroubleRecoveryBlockingAnswers,
} from "../js/audioTroubleRecoverySecurityRules.js";
import { assertEqual } from "./test-utils.js";

function buildRoom(overrides) {
  return {
    host: "host-uid",
    activeMatchId: "MATCH1",
    status: "playing",
    matches: {
      MATCH1: {
        currentQuestionIndex: 2,
        questionStatus: "active",
        participants: { p1: true, p2: true },
      },
    },
    ...overrides,
  };
}

export function runAudioTroubleRecoverySecurityRulesTests() {
  // ===== canWriteAudioTroubleReport：許可/拒否一覧 =====
  {
    const room = buildRoom({});
    const base = { authUid: "p1", targetUid: "p1", room, matchId: "MATCH1", questionIndex: 2, existingReportExists: false };

    assertEqual(canWriteAudioTroubleReport(base), true, "許可：本人・現在の試合・現在の問題・回答収集中・参加者・まだ誰も申告していないslot");

    assertEqual(canWriteAudioTroubleReport({ ...base, targetUid: "p2" }), false, "拒否：他人のuidで申告しようとする（なりすまし）");

    // 【本人指示：連打対策】同じユーザーであっても、既に誰か（自分を含む）がこのslotへ
    // 書き込み済みなら拒否される＝write-once。
    assertEqual(canWriteAudioTroubleReport({ ...base, existingReportExists: true }), false, "拒否：同じ(questionIndex, attemptSlot)への2回目の書き込み（連打対策）");

    // 【本人指示：レース安全性】複数人がほぼ同時に押した場合の擬似シミュレーション。
    // 1人目が書き込んだ直後（existingReportExists:trueになった状態）に2人目が同じslotへ
    // 書こうとしても拒否される＝「最初の有効な1件だけが採用される」。
    {
      let slotIsClaimed = false; // Firebase上の実際の状態を模した簡易フラグ
      const firstAttempt = canWriteAudioTroubleReport({ ...base, targetUid: "p1", existingReportExists: slotIsClaimed });
      assertEqual(firstAttempt, true, "レース：1人目（p1）の申告は許可される");
      if (firstAttempt) slotIsClaimed = true; // 1人目の書き込みが先に反映されたと仮定
      const secondAttempt = canWriteAudioTroubleReport({ ...base, targetUid: "p2", authUid: "p2", existingReportExists: slotIsClaimed });
      assertEqual(secondAttempt, false, "レース：ほぼ同時に来た2人目（p2）の申告は、1人目が先に成立した後なので拒否される");
    }

    // 【本人指示：古い試合・古い問題番号の申告を無視する】
    assertEqual(canWriteAudioTroubleReport({ ...base, matchId: "OLD-MATCH" }), false, "拒否：古い試合IDへの遅延申告");
    assertEqual(canWriteAudioTroubleReport({ ...base, questionIndex: 1 }), false, "拒否：古いquestionIndexへの遅延申告");
    assertEqual(canWriteAudioTroubleReport({ ...base, questionIndex: 3 }), false, "拒否：まだ来ていない未来のquestionIndexへの申告");

    assertEqual(
      canWriteAudioTroubleReport({ ...base, room: buildRoom({ matches: { MATCH1: { ...room.matches.MATCH1, questionStatus: "resolved" } } }) }),
      false,
      "拒否：問題確定後（questionStatus:resolved、答え合わせ中）の申告"
    );
    assertEqual(
      canWriteAudioTroubleReport({ ...base, room: buildRoom({ status: "result" }) }),
      false,
      "拒否：対戦中でない（結果画面・ロビー等）ときの申告"
    );
    assertEqual(
      canWriteAudioTroubleReport({ ...base, room: buildRoom({ matches: { MATCH1: { ...room.matches.MATCH1, participants: { p2: true } } } }) }),
      false,
      "拒否：未参加者（participantsに存在しない）の申告"
    );
    assertEqual(canWriteAudioTroubleReport({ ...base, authUid: null }), false, "拒否：未認証");
  }

  // ===== canWriteAudioTroubleRecoveryHostField =====
  {
    const room = buildRoom({});
    assertEqual(canWriteAudioTroubleRecoveryHostField({ authUid: "host-uid", room }), true, "許可：ホスト本人");
    assertEqual(canWriteAudioTroubleRecoveryHostField({ authUid: "p1", room }), false, "拒否：ホスト以外");
    assertEqual(canWriteAudioTroubleRecoveryHostField({ authUid: null, room }), false, "拒否：未認証");
  }

  // ===== isAudioTroubleRecoveryBlockingAnswers =====
  {
    assertEqual(isAudioTroubleRecoveryBlockingAnswers({ audioTroubleRecovery: undefined, questionIndex: 0 }), false, "リカバリー記録が無ければ回答をブロックしない");
    assertEqual(
      isAudioTroubleRecoveryBlockingAnswers({ audioTroubleRecovery: { status: "resolved", questionIndex: 0 }, questionIndex: 0 }),
      false,
      "resolvedのときは回答をブロックしない"
    );
    assertEqual(
      isAudioTroubleRecoveryBlockingAnswers({ audioTroubleRecovery: { status: "replaying", questionIndex: 1 }, questionIndex: 0 }),
      false,
      "別の問題に対するreplayingは、今の問題の回答をブロックしない"
    );
    assertEqual(
      isAudioTroubleRecoveryBlockingAnswers({ audioTroubleRecovery: { status: "replaying", questionIndex: 0 }, questionIndex: 0 }),
      true,
      "同じ問題に対するreplaying中は回答をブロックする（本人指示：全員の回答操作を一時的にロック）"
    );
  }
}
