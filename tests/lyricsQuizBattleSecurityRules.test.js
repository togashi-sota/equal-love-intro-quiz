// js/lyricsQuizBattleSecurityRules.js（Phase4：セキュリティルール案のJSシミュレーター）のテスト。
// 許可すべき正常系・拒否すべき攻撃/異常系の両方を一覧できる形で確認する。
// 実際のFirebaseルール構文の検証（Rules Playground）とは別物であることに注意
// （js/lyricsQuizBattleSecurityRules.js冒頭のコメント参照）。

import {
  canWriteLyricsCoverage,
  canWriteAnswer,
  isHintLevelConsistentWithElapsedTime,
  canWriteStealClaim,
  canWriteHostOnlyMatchField,
  hasOnlyAllowedFields,
  canWriteLyricsResult,
  isValidBattleRuleId,
  isValidBattleRuleVersion,
  isValidHintIntervalSec,
  isValidAnswerPoolSizeValue,
} from "../js/lyricsQuizBattleSecurityRules.js";
import { assertEqual } from "./test-utils.js";

function buildRoom(overrides) {
  return {
    host: "host-uid",
    activeMatchId: "MATCH1",
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

export function runLyricsQuizBattleSecurityRulesTests() {
  // ===== canWriteLyricsCoverage =====
  {
    assertEqual(canWriteLyricsCoverage({ authUid: "p1", targetUid: "p1" }), true, "許可：本人自身のlyricsCoverage");
    assertEqual(canWriteLyricsCoverage({ authUid: "p1", targetUid: "p2" }), false, "拒否：他人のlyricsCoverageへの書き込み");
    assertEqual(canWriteLyricsCoverage({ authUid: null, targetUid: "p1" }), false, "拒否：未認証");
  }

  // ===== canWriteAnswer：許可/拒否一覧 =====
  {
    const room = buildRoom({});
    const base = { authUid: "p1", targetUid: "p1", room, matchId: "MATCH1", questionIndex: 2, existingAnswerExists: false };

    assertEqual(canWriteAnswer(base), true, "許可：本人・現在の試合・現在の問題・進行中・参加者");
    assertEqual(canWriteAnswer({ ...base, targetUid: "p2" }), false, "拒否：他人のuidで回答しようとする（なりすまし）");
    assertEqual(canWriteAnswer({ ...base, existingAnswerExists: true }), false, "拒否：同じ問題への二重回答（write-once）");
    assertEqual(canWriteAnswer({ ...base, matchId: "OLD-MATCH" }), false, "拒否：古い試合IDへの遅延回答");
    assertEqual(canWriteAnswer({ ...base, questionIndex: 1 }), false, "拒否：古いquestionIndexへの遅延回答");
    assertEqual(canWriteAnswer({ ...base, questionIndex: 3 }), false, "拒否：まだ来ていない未来のquestionIndex");
    assertEqual(
      canWriteAnswer({ ...base, room: buildRoom({ matches: { MATCH1: { ...room.matches.MATCH1, questionStatus: "resolved" } } }) }),
      false,
      "拒否：問題終了後（questionStatus:resolved）の回答"
    );
    assertEqual(
      canWriteAnswer({ ...base, room: buildRoom({ matches: { MATCH1: { ...room.matches.MATCH1, participants: { p2: true } } } }) }),
      false,
      "拒否：未参加者（participantsに存在しない）の書き込み"
    );
    assertEqual(canWriteAnswer({ ...base, authUid: null }), false, "拒否：未認証");
  }

  // ===== isHintLevelConsistentWithElapsedTime =====
  //
  // hintIntervalSec=6・latencyToleranceMs=1000（既定値）のとき、各hintLevelが
  // 許可される経過時間の範囲（本人の要望どおり、未来・過去とも原則拒否し、
  // 通信遅延用に±1000msだけ許容する）：
  //   hintLevel 1： [-1000, 7000)  ※実際には経過時間が負になることは無いので実質[0, 7000)
  //   hintLevel 2： [5000, 13000)
  //   hintLevel 3： [11000, 19000)
  //   hintLevel 4： [17000, 25000)
  // 各段階の境界（6000/12000/18000ms付近）は前後の段階の範囲が1000msずつ重なる
  // （例：5000〜7000msはヒント1・ヒント2のどちらを申告しても許可される）。これは
  // 「切り替わりの瞬間ぎりぎりに回答した正直な人を誤って拒否しない」ための意図的な
  // 許容であり、完全に唯一の正解に絞り込めるわけではないという限界を正直に記録しておく。
  {
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 1, submittedAtMs: 500, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      true,
      "許可：ヒント1の範囲内（0〜6秒）で正直に回答"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 2, submittedAtMs: 8000, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      true,
      "許可：ヒント2の範囲内（6〜12秒）で正直に回答"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 1, submittedAtMs: 20000, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      false,
      "拒否：実際は20秒経っている（ヒント4の範囲）のに『ヒント1で回答した』と偽って高得点を狙う"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 4, submittedAtMs: 500, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      false,
      "拒否：まだ0.5秒しか経っていないのにヒント4扱いを申告（本人の要望どおり、過去方向の食い違いも原則拒否する）"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 1, submittedAtMs: 6999, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      true,
      "許可：ヒント1の許容範囲ぎりぎり（7000ms未満、通信遅延の許容幅内）"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 1, submittedAtMs: 7000, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      false,
      "拒否：ヒント1の許容範囲（7000ms）を過ぎている"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 2, submittedAtMs: 4999, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      false,
      "拒否：ヒント2の許容範囲（5000ms〜）にまだ入っていない"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 2, submittedAtMs: 5000, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      true,
      "許可：ヒント2の許容範囲の開始ちょうど"
    );
    assertEqual(
      isHintLevelConsistentWithElapsedTime({ hintLevel: 5, submittedAtMs: 30000, questionStartedAtMs: 0, hintIntervalSec: 6 }),
      false,
      "拒否：ヒント段階が1〜4の範囲外"
    );
    // 許容幅を明示的に0へ指定すれば、重なりの無い厳密な判定にできることも確認する。
    assertEqual(
      isHintLevelConsistentWithElapsedTime({
        hintLevel: 1,
        submittedAtMs: 6500,
        questionStartedAtMs: 0,
        hintIntervalSec: 6,
        latencyToleranceMs: 0,
      }),
      false,
      "許容幅を0にすれば、6000ms以降のヒント1申告は厳密に拒否される"
    );
  }

  // ===== canWriteStealClaim：許可/拒否一覧 =====
  {
    const room = buildRoom({});
    const base = {
      authUid: "p1",
      newWinnerUid: "p1",
      room,
      matchId: "MATCH1",
      questionIndex: 2,
      existingWinnerExists: false,
      hasOwnAnswerInSameWrite: true,
    };

    assertEqual(canWriteStealClaim(base), true, "許可：本人が自分の回答済みの上でclaim");
    assertEqual(canWriteStealClaim({ ...base, newWinnerUid: "p2" }), false, "拒否：他人を勝者としてclaimしようとする");
    assertEqual(canWriteStealClaim({ ...base, existingWinnerExists: true }), false, "拒否：既に勝者が確定済み（write-once、2人目以降のclaim）");
    assertEqual(canWriteStealClaim({ ...base, hasOwnAnswerInSameWrite: false }), false, "拒否：自分の回答ログが無いのに即claimしようとする");
    assertEqual(canWriteStealClaim({ ...base, matchId: "OLD-MATCH" }), false, "拒否：古い試合IDでのclaim");
    assertEqual(canWriteStealClaim({ ...base, questionIndex: 1 }), false, "拒否：古いquestionIndexでのclaim");
    assertEqual(
      canWriteStealClaim({ ...base, room: buildRoom({ matches: { MATCH1: { ...room.matches.MATCH1, questionStatus: "resolved" } } }) }),
      false,
      "拒否：問題終了後のclaim"
    );
    assertEqual(canWriteStealClaim({ ...base, authUid: null }), false, "拒否：未認証");
  }

  // ===== canWriteHostOnlyMatchField =====
  {
    const room = buildRoom({});
    assertEqual(canWriteHostOnlyMatchField({ authUid: "host-uid", room }), true, "許可：ホスト本人");
    assertEqual(canWriteHostOnlyMatchField({ authUid: "p1", room }), false, "拒否：ホスト以外の参加者");
    assertEqual(canWriteHostOnlyMatchField({ authUid: null, room }), false, "拒否：未認証");
  }

  // ===== hasOnlyAllowedFields =====
  {
    assertEqual(
      hasOnlyAllowedFields({ uid: "p1", submittedAt: 123 }, ["uid", "submittedAt"]),
      true,
      "許可：宣言した項目だけを持つ"
    );
    assertEqual(
      hasOnlyAllowedFields({ uid: "p1", submittedAt: 123, points: 999 }, ["uid", "submittedAt"]),
      false,
      "拒否：ポイント等、想定外のフィールドが混入している"
    );
  }

  // ===== canWriteLyricsResult（Phase7新設） =====
  {
    const room = buildRoom({ status: "playing" });
    const base = { authUid: "host-uid", targetUid: "p1", room, matchId: "MATCH1", existingResultExists: false };

    assertEqual(canWriteLyricsResult(base), true, "許可：ホスト本人が、活動中の試合・playing中・参加者へ結果を確定");
    assertEqual(canWriteLyricsResult({ ...base, authUid: "p1" }), false, "拒否：非ホスト（参加者自身）による結果確定");
    assertEqual(canWriteLyricsResult({ ...base, existingResultExists: true }), false, "拒否：既に確定済みの結果への再書き込み（write-once、内容の異同を問わず一律拒否）");
    assertEqual(canWriteLyricsResult({ ...base, matchId: "OLD-MATCH" }), false, "拒否：古い試合IDでの結果確定");
    assertEqual(canWriteLyricsResult({ ...base, room: buildRoom({ status: "waiting" }) }), false, "拒否：playing中でない（waiting等）ときの結果確定");
    assertEqual(canWriteLyricsResult({ ...base, room: buildRoom({ status: "result" }) }), false, "拒否：statusが既にresultへ進んだ後の結果確定（atomic updateでは書き込み前のplayingを見るため、この状態は通常発生しないが念のため確認）");
    assertEqual(
      canWriteLyricsResult({ ...base, targetUid: "not-a-participant" }),
      false,
      "拒否：参加者スナップショットに存在しないuidへの結果確定"
    );
    assertEqual(canWriteLyricsResult({ ...base, authUid: null }), false, "拒否：未認証");
  }

  // ===== settings検証（Phase7新設・本人指摘④） =====
  {
    // ----- isValidBattleRuleId -----
    assertEqual(isValidBattleRuleId("classic"), true, "許可：classic");
    assertEqual(isValidBattleRuleId("steal"), true, "許可：steal");
    assertEqual(isValidBattleRuleId("combo"), true, "許可：combo");
    assertEqual(isValidBattleRuleId("unknown-rule"), false, "拒否：存在しないruleId");
    assertEqual(isValidBattleRuleId(""), false, "拒否：空文字");

    // ----- isValidBattleRuleVersion -----
    assertEqual(isValidBattleRuleVersion(1), true, "許可：現在対応しているバージョン1");
    assertEqual(isValidBattleRuleVersion(0), false, "拒否：0");
    assertEqual(isValidBattleRuleVersion(-1), false, "拒否：負数");
    assertEqual(isValidBattleRuleVersion(1.5), false, "拒否：小数");
    assertEqual(isValidBattleRuleVersion("1"), false, "拒否：文字列（型が違う）");
    assertEqual(isValidBattleRuleVersion(2), false, "拒否：まだ対応していないバージョン2以上");

    // ----- isValidHintIntervalSec -----
    assertEqual(isValidHintIntervalSec(4), true, "許可：4秒");
    assertEqual(isValidHintIntervalSec(6), true, "許可：6秒");
    assertEqual(isValidHintIntervalSec(8), true, "許可：8秒");
    assertEqual(isValidHintIntervalSec(5), false, "拒否：4/6/8以外の値");
    assertEqual(isValidHintIntervalSec(0), false, "拒否：0");

    // ----- isValidAnswerPoolSizeValue -----
    assertEqual(isValidAnswerPoolSizeValue({ answerPoolSizeValue: 4, battleRuleId: "classic" }), true, "許可：classicの4択");
    assertEqual(isValidAnswerPoolSizeValue({ answerPoolSizeValue: 50, battleRuleId: "combo" }), true, "許可：comboの50択");
    assertEqual(isValidAnswerPoolSizeValue({ answerPoolSizeValue: "all", battleRuleId: "classic" }), true, "許可：classicの全曲検索");
    assertEqual(isValidAnswerPoolSizeValue({ answerPoolSizeValue: 4, battleRuleId: "steal" }), true, "許可：stealの4択");
    assertEqual(isValidAnswerPoolSizeValue({ answerPoolSizeValue: 10, battleRuleId: "steal" }), true, "許可：stealの10択");
    assertEqual(
      isValidAnswerPoolSizeValue({ answerPoolSizeValue: 30, battleRuleId: "steal" }),
      false,
      "拒否：奪い取りで30択以上を設定する組み合わせ（本人が明示的に挙げた必須拒否ケース）"
    );
    assertEqual(isValidAnswerPoolSizeValue({ answerPoolSizeValue: "all", battleRuleId: "steal" }), false, "拒否：奪い取りで全曲検索");
    assertEqual(isValidAnswerPoolSizeValue({ answerPoolSizeValue: 3, battleRuleId: "classic" }), false, "拒否：宣言されていない選択肢数");
  }
}
