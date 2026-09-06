// オンライン対戦ルームの「定員（maxPlayers）チェック」に関するFirebase Realtime
// Databaseセキュリティルール案の「意図」をJavaScriptの純粋関数として再現した
// シミュレーター（2026-09-06新設、本人指示：真の同時実行テストで発見した定員超過
// 不具合の最優先修正）。js/lyricsQuizBattleSecurityRules.js・
// js/audioTroubleRecoverySecurityRules.jsと全く同じ位置づけ・同じ限界を持つ
// （実際のFirebase Rules言語そのものではなく、意図をコードとして書き下し、
// 様々なシナリオが期待どおりの許可/拒否になるかを自動テストするためのもの）。
//
// 【発見された不具合】js/onlineBattle.jsのjoinRoom()・promoteSpectatorToPlayer()は
// 「読む→現在の人数を確認→自分の枠だけ書く」というトランザクション無しの方式で、
// 定員チェック自体はクライアント側のJavaScriptだけで行っていた。複数のclientが
// 真に同時に参加を試みると、全員が同じ「まだ空きがある」という古い読み取り結果を
// 見てしまい、定員を超えて全員参加できてしまうことを実機の真の同時実行テストで
// 確認した（2人部屋に2人が同時参加で4/4回とも3人になる等）。
//
// 【対策の考え方】runTransaction()は過去の実機不具合（Firebase RTDB SDK側の
// 未解明の癖）により使わない方針を維持しつつ、rooms/$roomId/players/$uidの
// Firebase Rules（.validate）へ「新規追加のときだけ、書き込み後の人数が
// maxPlayersを超えないこと」を追加する。Firebase Realtime Databaseのルール評価時の
// root参照は「この書き込みが適用された後の状態」を表すため、サーバー側で1件ずつ
// 順に確定・評価されることで、クライアント側の事前チェックだけに頼らない、
// 本当の意味での定員超過防止を実現できる（questionClaims/{questionIndex}/winnerの
// write-once判定（js/lyricsQuizBattleSecurityRules.jsのcanWriteStealClaim()参照）と
// 全く同じ、既にこのアプリで実績のある「rootを使った原子的な検証」の考え方）。
//
// room: { maxPlayers, players: { [uid]: {...} } } という、Firebase上の該当部分を
// 模した最小限の形を引数として渡す想定。

// rooms/$roomId/players/$uidへの書き込み可否（本人の新規参加・観戦者からの昇格の
// どちらも、最終的にこの1つの検証を通る）。
//
// existingEntryExists: 書き込み先uidに、既に参加者エントリが存在するか
//   （再接続・ready変更等の「既存エントリの更新」なら、人数は変わらないため
//   定員チェックの対象外にする＝常に許可）。
// playerCountAfterWrite: この書き込みが実際に適用された「後」の参加者人数
//   （＝現在の人数＋新規追加なら1）。Firebase Rulesのroot参照が表す
//   「書き込み後の状態」をそのまま数値として渡す。
export function canWritePlayerSlot({ authUid, targetUid, existingEntryExists, playerCountAfterWrite, maxPlayers }) {
  if (authUid == null) return false;
  if (existingEntryExists) return true; // 既存エントリの更新（再接続・ready等）は人数が変わらないため常に許可
  if (targetUid !== authUid) return false; // 新規追加は必ず本人による自分の枠への書き込みのみ
  return playerCountAfterWrite <= maxPlayers;
}
