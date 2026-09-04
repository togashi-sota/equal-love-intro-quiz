// 歌詞クイズ「早押しバトル」の僅差競合バグ対策（2026-09-06新設・実機バグ調査）。
//
// 【背景】Firebase Realtime DatabaseのクライアントSDKは、自分自身が送ったset()の
// 結果がサーバーで確定・却下される前に、その場で書き込んだ値を一瞬ローカルの
// キャッシュへ楽観的に反映する。早押しの勝者判定（questionClaims/{qIndex}/winner）は
// 「最初の1件だけ書き込み成立」という一発勝負のFirebase Rulesのため、僅差で負けた
// 側の端末では、winner.uidが一瞬「自分のuid」に見えることがある——実際には
// サーバーからPERMISSION_DENIEDで却下される直前の状態であるにもかかわらず。
// これをそのまま信用すると、「わずかな差で先に正解されました」という正しい通知の
// 直後に、誤って「🎉正解！+1pt」という二重の勝利表示が出てしまう
// （js/onlineLyricsQuizBattleScreen.jsで実際に確認されたバグ）。
//
// 【この関数の役割】呼び出し元（js/onlineLyricsQuizBattleScreen.js）は、
// submitLyricsQuizAnswerWithStealClaim()のawait結果（サーバー確定後にしか
// 分からないSTEAL_CLAIM_OUTCOME.WON）を得た問題番号だけを
// confirmedSelfWinQuestionIndexesへ記録する。この関数はDOM・Firebaseに一切触れない
// 純粋関数として、「今見えている勝者情報をそのまま信用してよいか」だけを判定する。

// rawWinnerUid: 今のroomスナップショットが示すquestionClaims/{qIndex}/winner.uid（無ければnull/undefined）。
// myUid: 自分のuid。
// qIndex: 判定対象の問題インデックス。
// confirmedSelfWinQuestionIndexes: 自分の勝利がサーバー確定済みだと分かっている問題インデックスのSet。
//
// 戻り値: true＝そのままwinnerUidを信用してよい／false＝まだ信用できない（次のroom更新を待つ）。
//
// 【判定の核心】勝者が自分以外（他人・null）の場合は、この楽観的反映の問題が起こらない
// （自分がset()した対象ではないため）ので、常にそのまま信用してよい。勝者が自分自身の
// 場合だけ、confirmedSelfWinQuestionIndexesに記録済みかどうかを確認する。
export function isSelfWinnerClaimTrustworthy({ rawWinnerUid, myUid, qIndex, confirmedSelfWinQuestionIndexes }) {
  if (rawWinnerUid == null || rawWinnerUid !== myUid) return true;
  return confirmedSelfWinQuestionIndexes.has(qIndex);
}
