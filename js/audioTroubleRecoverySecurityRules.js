// 「🔇 音が出ない」救済ボタン・第2段階（オンライン対戦）の新規Firebaseパス
// （matches/{matchId}/audioTroubleRecovery/reports/{questionIndex}/{attemptSlot}）に対する
// セキュリティルール案の「意図」をJavaScriptの純粋関数として再現したシミュレーター
// （2026-09-17新設、本人指示）。js/lyricsQuizBattleSecurityRules.jsと全く同じ位置づけ・
// 同じ限界を持つ（実際のFirebase Rules言語そのものではなく、込めたい意図をコードとして
// 書き下し、様々な攻撃・正常系シナリオが期待どおりの許可/拒否になるかを自動テストする
// ためのもの。実際の公開前にはFirebase Rules Playgroundでの確認が必要）。
//
// room: { host, activeMatchId, status, matches: { [matchId]: {
//   currentQuestionIndex, questionStatus, participants: { [uid]: true } } } }

// reports/{questionIndex}/{attemptSlot}への書き込み可否。
// 【本人指示：レース安全性】「1つの問題内で同じユーザーが連打できない」「複数人がほぼ
// 同時に押した場合、最初の有効な1件だけが採用される」の両方を、この関数1つが担う：
// ・existingReportExists（write-once）が、同じ(questionIndex, attemptSlot)への2回目以降の
//   書き込み（連打・別ユーザーの後追い）をすべて拒否する。
// ・matchId・questionIndex・questionStatusの一致確認が、古い試合・古い問題番号への
//   遅延した申告を拒否する（このプロジェクトで繰り返し発生した「前の試合のmatchIdの
//   通知が新しい試合に紛れ込む」バグと同じ問題を防ぐ）。
export function canWriteAudioTroubleReport({ authUid, targetUid, room, matchId, questionIndex, existingReportExists }) {
  if (authUid == null || authUid !== targetUid) return false; // 他人の代わりに申告することはできない
  if (existingReportExists) return false; // write-once：この(questionIndex, attemptSlot)は最初の1件だけ
  if (room.activeMatchId !== matchId) return false; // 古い試合の遅延通信を拒否
  if (room.status !== "playing") return false; // 対戦中以外（ロビー・結果画面等）は拒否
  const match = room.matches?.[matchId];
  if (!match) return false;
  if (match.currentQuestionIndex !== questionIndex) return false; // 古い/未来のquestionIndexを拒否
  if (match.questionStatus !== "active") return false; // 回答収集中以外（確定後・答え合わせ中）は拒否
  if (!match.participants?.[targetUid]) return false; // 未参加者の申告を拒否
  return true;
}

// status・questionIndex・attemptCount・swapCount・reportedByUid・startedAt・resolvedAtへの
// 書き込み可否（ホスト限定の進行フィールド。js/lyricsQuizBattleSecurityRules.jsの
// canWriteHostOnlyMatchField()と全く同じ考え方をこの新規パスにも適用する）。
export function canWriteAudioTroubleRecoveryHostField({ authUid, room }) {
  return authUid != null && authUid === room.host;
}

// instantAnswers・coopVotesの回答送信ルールへ追加する「リカバリー再生中は回答を
// 受け付けない」ガードの意図（本人指示：「他の全員の回答操作を一時的にロックし、
// 新しい回答を送れないようにする」）。既存の回答送信ルール（write-once・questionIndex
// 一致・questionStatus:'active'）へ、この関数の結果をAND条件として追加する想定。
export function isAudioTroubleRecoveryBlockingAnswers({ audioTroubleRecovery, questionIndex }) {
  if (!audioTroubleRecovery) return false;
  if (audioTroubleRecovery.status !== "replaying") return false;
  return audioTroubleRecovery.questionIndex === questionIndex;
}
