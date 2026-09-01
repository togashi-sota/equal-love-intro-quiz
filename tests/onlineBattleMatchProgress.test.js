// js/onlineBattleMatchProgress.jsのテスト。
// タイムアタック・ランダム再生対戦・アウトロクイズ対戦（個人進行系3モード）が
// 「全員の結果が揃った（＝結果画面へ進めてよい）」と判定するisMatchReadyToFinalize()を、
// 2人対戦・3人対戦それぞれのシナリオで確認する。
// あわせて、「音が出ない」救済ボタンの試合全体無効化を検知するisMatchInvalidated()も確認する
// （本人指示：申告した本人だけが抜ける設計から、試合全体を無効試合にする設計への作り直し）。
import { isMatchReadyToFinalize, isMatchInvalidated } from "../js/onlineBattleMatchProgress.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleMatchProgressTests() {
  // ---- 2人対戦：全員がfinishedならtrue ----
  {
    const participants = { host: {}, guest: {} };
    const progress = { host: { finished: true }, guest: { finished: true } };
    assertEqual(isMatchReadyToFinalize({ participants, progress }), true, "2人対戦：全員finishedなら揃ったと判定する");
  }

  // ---- 2人対戦：片方がまだ未終了ならfalse（従来どおり待つ） ----
  {
    const participants = { host: {}, guest: {} };
    const progress = { host: { finished: true }, guest: { finished: false } };
    assertEqual(isMatchReadyToFinalize({ participants, progress }), false, "2人対戦：片方が未終了ならまだ待つ");
  }

  // ---- 2人対戦：片方が自主退出（leftDuringMatch）していれば、
  //      その人のresultsが無くても、残った1人だけで確定してよい（今回の修正の本題） ----
  {
    const participants = { host: {}, guest: { leftDuringMatch: true } };
    const progress = { host: { finished: true } }; // guestはresults/progressを一切書いていない
    assertEqual(
      isMatchReadyToFinalize({ participants, progress }),
      true,
      "2人対戦：自主退出したゲストの結果が無くても、残りのプレイヤーだけで確定できる（修正前は永遠にfalseだった）"
    );
  }

  // ---- 2人対戦：退出者がいても、残っている本人がまだ未終了ならまだ待つ ----
  {
    const participants = { host: {}, guest: { leftDuringMatch: true } };
    const progress = { host: { finished: false } };
    assertEqual(isMatchReadyToFinalize({ participants, progress }), false, "2人対戦：退出者がいても、残っている本人が未終了ならまだ待つ");
  }

  // ---- 3人対戦：全員finishedならtrue ----
  {
    const participants = { a: {}, b: {}, c: {} };
    const progress = { a: { finished: true }, b: { finished: true }, c: { finished: true } };
    assertEqual(isMatchReadyToFinalize({ participants, progress }), true, "3人対戦：全員finishedなら揃ったと判定する");
  }

  // ---- 3人対戦：1人が自主退出、残り2人がfinishedならtrue ----
  {
    const participants = { a: {}, b: {}, c: { leftDuringMatch: true } };
    const progress = { a: { finished: true }, b: { finished: true } };
    assertEqual(
      isMatchReadyToFinalize({ participants, progress }),
      true,
      "3人対戦：1人が自主退出していても、残り2人が終われば確定できる"
    );
  }

  // ---- 3人対戦：1人が自主退出、残り2人のうち1人がまだ未終了ならfalse ----
  {
    const participants = { a: {}, b: {}, c: { leftDuringMatch: true } };
    const progress = { a: { finished: true }, b: { finished: false } };
    assertEqual(
      isMatchReadyToFinalize({ participants, progress }),
      false,
      "3人対戦：退出していない人がまだ未終了なら、その人の結果は引き続き待つ"
    );
  }

  // ---- 3人対戦：2人が自主退出、残り1人がfinishedならtrue（1人だけでも確定できる） ----
  {
    const participants = { a: {}, b: { leftDuringMatch: true }, c: { leftDuringMatch: true } };
    const progress = { a: { finished: true } };
    assertEqual(
      isMatchReadyToFinalize({ participants, progress }),
      true,
      "3人対戦：2人が自主退出していても、残り1人が終われば確定できる"
    );
  }

  // ---- participantsが空なら、揃いようがないのでfalse（異常系での安全側） ----
  assertEqual(isMatchReadyToFinalize({ participants: {}, progress: {} }), false, "参加者が空ならfalse（異常系で誤って確定しない）");
  assertEqual(isMatchReadyToFinalize({ participants: undefined, progress: undefined }), false, "participants/progressがundefinedでも安全にfalseを返す");

  // ---- progress自体が丸ごと欠けているuidがいても、エラーにならず未終了扱い ----
  {
    const participants = { a: {}, b: {} };
    const progress = { a: { finished: true } }; // bのprogressエントリ自体が存在しない
    assertEqual(isMatchReadyToFinalize({ participants, progress }), false, "progressにエントリが無い（未着手）参加者は未終了扱いになる");
  }

  // ===== 【本人指示：「音が出ない」救済ボタン第2段階の再設計（試合全体無効化）】
  // isMatchInvalidated()：matches/{matchId}/matchInvalidated（試合全体で共有する
  // write-onceフラグ）の有無だけを見る単純な判定を確認する。以前あった「本人だけが
  // この試合から抜ける」設計（audioTroubleAbort、参加者ごとの個人フラグ）は撤廃したため、
  // isMatchReadyToFinalize()側にはもうaudioTroubleAbortの分岐が無い
  // （leftDuringMatchだけが残る＝上のテスト群のとおり）。 =====

  assertEqual(
    isMatchInvalidated({ match: { participants: {}, progress: {} } }),
    false,
    "matchInvalidatedが無い試合はfalse"
  );
  assertEqual(
    isMatchInvalidated({ match: { matchInvalidated: { reportedByUid: "guest", reportedAt: 12345 } } }),
    true,
    "matchInvalidatedが立っている試合はtrue（誰が申告したかに関わらず、試合全体が無効）"
  );
  assertEqual(isMatchInvalidated({ match: undefined }), false, "matchがundefinedでも安全にfalseを返す（異常系）");
  assertEqual(isMatchInvalidated({}), false, "matchキー自体が無くても安全にfalseを返す（異常系）");
}
