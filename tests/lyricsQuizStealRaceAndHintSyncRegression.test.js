// 歌詞クイズ対戦「早押しバトル」の3人実機テストで発見されたUX不具合の回帰防止テスト
// （2026-09-06、本人指示）。
//
// ①【根本原因・最重要】早押しバトルで本当に不正解だった場合、画面層
//   （js/onlineLyricsQuizBattleScreen.js）はsubmissionPlan.submitWinnerClaim
//   （＝正解だったかどうか）だけを見てsubmitLyricsQuizAnswerWithStealClaim()を呼ぶか
//   決めており、不正解のときは汎用のsubmitLyricsQuizAnswer()（outcomeを返さない）を
//   呼んでいた。そのためresult.outcomeが常にundefinedになり、「残念、不正解」という
//   専用表示（即時のお知らせ・待機中の持続表示のどちらも）が一度も出せていなかった
//   （2026-10-01に「実装したはずだった」機能が、実際には最初から一度も動いていなかった）。
//   js/battleRules/stealRule.jsのgetAnswerSubmissionPlan()にusesStealClaimSubmission
//   （正解・不正解を問わず早押しバトルなら常にtrue）を新設し、画面層はこちらで
//   どちらの関数を呼ぶかを決め、実際にwinner claimを試みるかはsubmitWinnerClaimで
//   別途渡すよう分離した。
// ②「正しい曲を選んだが、他の人が先にwinner claimを確定させていた」（LOST_RACE）場合、
//   待機中の持続表示（elements.battleStatusMessage）が「本当に違う曲を選んだ」
//   （ANSWERED_WRONG）と区別されず、一律「回答しました！他のプレイヤーの回答を
//   待っています…」に埋もれていた。LOST_RACE専用の文言を出すよう修正した。
// ③誤答・惜敗したプレイヤーに、ヒント1〜4を経過時間に関わらず即座に全段階フル表示して
//   いた（elapsedMsをPOSITIVE_INFINITYへ強制）。まだ回答中の他プレイヤーより先の情報を
//   見られてしまい不公平だったため、実際の経過時間（＝共有進行）をそのまま使うよう修正した。
// ④「今回はわからない」という結果表示が、結果判定そのもののように見えて分かりにくかった
//   ため、「『わからない』を選びました」という、押したボタン名と対応する文言へ変更した。
//
// 【実機・実Firebaseでの再確認】2クライアント（本物のFirebase匿名認証・別オリジン）で
// 早押しバトルを実際にプレイし、①の修正前は不正解時にresult.outcomeがundefinedのまま
// 「回答しました！」しか出ないことを確認→修正後はusesStealClaimSubmissionにより
// 正しく「残念、不正解。他のプレイヤーの回答を待っています…」が表示されることを確認した。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineLyricsQuizBattleScreen.jsはFirebase接続・
// DOM要素の大量取得を伴い、tests.htmlのようなテスト環境へ安全にimportできない
// （tests/questionSourceModeLeakage.test.js等と同じ理由）。早押しの勝者確定ロジック自体
// （js/battleRules/stealRule.jsのresolveQuestionAnswers()等）は本人指示により一切変更して
// いないため、そちらのテストは変更していない。
import { assertEqual } from "./test-utils.js";

export async function runLyricsQuizStealRaceAndHintSyncRegressionTests() {
  const response = await fetch("js/onlineLyricsQuizBattleScreen.js");
  const source = await response.text();
  assertEqual(source.length > 1000, true, "js/onlineLyricsQuizBattleScreen.jsのソースを取得できた（前提条件）");

  // ---- ①【根本原因】不正解でもsubmitLyricsQuizAnswerWithStealClaim()を呼ぶ経路になっている ----
  {
    const anchor = "const result = submissionPlan.usesStealClaimSubmission";
    assertEqual(source.includes(anchor), true, "画面層の分岐条件がsubmissionPlan.submitWinnerClaimからusesStealClaimSubmissionへ変わっている（不正解時もoutcomeを受け取れる経路を通すため）");
    const anchorIndex = source.indexOf(anchor);
    const block = source.slice(anchorIndex, anchorIndex + 400);
    assertEqual(
      block.includes("attemptWinnerClaim: submissionPlan.submitWinnerClaim"),
      true,
      "実際にwinner claimを試みるかどうかは、従来どおりsubmitWinnerClaim（正解のときだけtrue）で渡している"
    );
  }
  {
    const response2 = await fetch("js/battleRules/stealRule.js");
    const source2 = await response2.text();
    assertEqual(source2.length > 500, true, "js/battleRules/stealRule.jsのソースを取得できた（前提条件）");
    assertEqual(
      source2.includes("usesStealClaimSubmission: true"),
      true,
      "stealRule.jsのgetAnswerSubmissionPlan()が、正解・不正解を問わず常にusesStealClaimSubmission:trueを返す"
    );
  }

  // ---- ②LOST_RACEの持続表示 ----
  {
    const anchor = "elements.battleStatusMessage.textContent = myForcedSkip";
    const anchorIndex = source.indexOf(anchor);
    assertEqual(anchorIndex !== -1, true, "battleStatusMessageの出し分けコードが存在する（前提条件）");
    const block = source.slice(anchorIndex, anchorIndex + 500);
    assertEqual(
      block.includes("STEAL_CLAIM_OUTCOME.LOST_RACE") && block.includes("惜しい！先に正解した人がいます"),
      true,
      "早押しで惜敗（LOST_RACE）した場合、持続表示が「残念、不正解」とは別の専用文言を出す"
    );
    assertEqual(
      block.includes("STEAL_CLAIM_OUTCOME.ANSWERED_WRONG") && block.includes("残念、不正解。他のプレイヤーの回答を待っています"),
      true,
      "本当に違う曲を選んだ場合（ANSWERED_WRONG）の持続表示は引き続き「残念、不正解」のまま"
    );
  }

  // ---- mySubmissionOutcomeValueが実際のoutcomeを記録している ----
  {
    assertEqual(
      source.includes("mySubmissionOutcomeValue = isNotableLoss ? result.outcome : null;"),
      true,
      "回答結果（ANSWERED_WRONG・LOST_RACE）を実際のSTEAL_CLAIM_OUTCOME値として記録している（不正解と惜敗を区別できる形で保持）"
    );
  }

  // ---- ③ヒント同期：POSITIVE_INFINITYへの強制が撤去されている ----
  {
    assertEqual(
      source.includes("computeStealHintProgress({ elapsedMs, hintTexts })"),
      true,
      "renderHintArea()が、回答済みかどうかに関わらず実際の経過時間（共有進行）をそのままcomputeStealHintProgress()へ渡している"
    );
    assertEqual(
      source.includes("Number.POSITIVE_INFINITY"),
      false,
      "回答済みの本人にヒントを即座に全段階フル表示する仕組み（POSITIVE_INFINITYへの強制）が撤去されている（不公平な先読み対策）"
    );
  }

  // ---- ④「わからない」結果表示の文言変更 ----
  {
    assertEqual(
      source.includes('"「わからない」を選びました"'),
      true,
      "「わからない」を選んだ場合の結果表示が「『わからない』を選びました」になっている（結果判定と紛らわしい「今回はわからない」から変更）"
    );
    assertEqual(
      source.includes('"今回はわからない"'),
      false,
      "紛らわしかった旧文言「今回はわからない」が残っていない"
    );
  }
}
