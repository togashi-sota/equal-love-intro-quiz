// オンライン速度勝負系対戦（タイムアタック・ランダム再生対戦・アウトロクイズ対戦）の
// 「音が出ない」救済ボタン・試合全体無効化の新規Firebaseパス
// （rooms/{roomId}/matches/{matchId}/matchInvalidated）に対するセキュリティルール案の
// 「意図」をJavaScriptの純粋関数として再現したシミュレーター（本人指示：申告した本人だけが
// 抜ける設計から、試合全体を無効試合にする設計への作り直しに伴い新設）。
// js/audioTroubleRecoverySecurityRules.jsと全く同じ位置づけ・同じ限界を持つ
// （実際のFirebase Rules言語そのものではなく、込めたい意図をコードとして書き下し、
// 様々な攻撃・正常系シナリオが期待どおりの許可/拒否になるかを自動テストするためのもの。
// 実際の公開前にはFirebase Rules Playgroundでの確認が必要）。
//
// room: { host, activeMatchId, status, matches: { [matchId]: { participants: { [uid]: true } } } }
//
// 【この機能が同期進行系（歌詞クイズ対戦・一瞬バトル・一瞬協力）のaudioTroubleRecoveryと
// 違う点】タイムアタック・ランダム再生対戦・アウトロクイズ対戦は「各自が自分のペースで
// 進む」個人進行系のため、currentQuestionIndex・questionStatusのような「今どの問題を
// みんなで見ているか」という同期情報が存在しない。そのため、audioTroubleRecoveryの
// reports/{questionIndex}/{attemptSlot}のような問題単位の申告ではなく、試合（matchId）
// 単位でただ1つだけ存在する共有フラグにしている。

// rooms/{roomId}/matches/{matchId}/matchInvalidatedへの書き込み可否。
// 【本人指示：レース安全性】以下をすべてこの関数1つが担う：
// ・existingMatchInvalidatedExists（write-once）が、2回目以降の書き込み（連打・複数人が
//   ほぼ同時に押した場合の2人目以降）をすべて拒否する＝「最初の有効な1件だけが採用される」。
// ・activeMatchId一致確認が、古い試合（既に新しい試合が始まっている）への遅延した申告を拒否する。
// ・status==='playing'の確認が、まだ対戦が始まっていない（ロビー・カウントダウン）、または
//   既にホストが結果を確定させた後（すでに試合終了処理へ入っている）の申告を拒否する。
// ・participants[uid]の存在確認が、その試合の参加者でない人からの申告を拒否する
//   （なりすまし・部外者からの妨害を防ぐ）。
// ・ホスト専用の操作にはしていない（本人指示：ホスト自身が押した場合もゲストが押した場合も
//   同じように機能する必要がある）。
export function canWriteMatchInvalidated({ authUid, room, matchId, existingMatchInvalidatedExists }) {
  if (authUid == null) return false; // 未認証
  if (existingMatchInvalidatedExists) return false; // write-once：この試合は既に無効化申告済み
  if (room.activeMatchId !== matchId) return false; // 古い試合への遅延申告を拒否
  if (room.status !== "playing") return false; // 対戦中でなければ拒否（ロビー・結果確定後等）
  const match = room.matches?.[matchId];
  if (!match) return false;
  if (!match.participants?.[authUid]) return false; // その試合の参加者本人でなければ拒否
  return true;
}
