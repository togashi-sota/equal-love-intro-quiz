// 対戦開始前ルール確認画面（2026-09-13新設・本人指示）のうち、Firebaseの読み書きを
// 一切伴わない純粋な判定ロジックだけを切り出したファイル。
// js/onlineBattleHostTransitionPayloads.js・js/onlineBattleSongAvailabilityPayloads.jsと
// 同じ設計方針（本人指示：判定ロジックはFirebase処理と分離し、恒久テストで検証できる形にする）。

// 直前の試合の参加者（room.matches/{matchId}/participantsのキー）と、今のルーム参加者
// （room.playersのキー）を比べ、構成が変わっていれば true を返す。
// 【2026-09-13新設時点の役割】当初は、js/onlineBattle.jsの「もう一度」処理（旧
// rematchAndStartNow()）が、参加者構成が変わった場合だけルール確認を再表示するかどうかの
// 判定に使っていた（本人指示15）。
// 【再戦準備フェーズ新設・本人指示】その後、「もう一度」は参加者構成の変化に関わらず
// 必ず再戦準備フェーズ（room.confirmingRematch/rematchReady）を経由するよう変更されたため、
// 現在この関数は本流のコードからは呼ばれていない。判定ロジック自体は今後また必要になる
// 可能性があるテスト済みの純粋関数のため、恒久テスト（tests/onlineBattleMatchConfirmationPayloads.test.js）
// ごと残してある。
export function hasMatchMembershipChanged({ previousParticipantUids, currentPlayerUids }) {
  if (previousParticipantUids.length !== currentPlayerUids.length) return true;
  const currentSet = new Set(currentPlayerUids);
  return !previousParticipantUids.every((uid) => currentSet.has(uid));
}

// room.players（{uid: {..., ruleConfirmed}}）を渡すと、1人以上存在し、かつ全員が
// ruleConfirmed===trueであればtrueを返す。0人（誰もいない）の場合はfalse
// （安全側：誰もいないのに「全員確認済み」として開始してしまうことを防ぐ）。
export function computeAllPlayersConfirmed(players) {
  const entries = Object.values(players ?? {});
  if (entries.length === 0) return false;
  return entries.every((player) => player.ruleConfirmed === true);
}

// 【再戦準備フェーズ新設・本人指示】結果画面の「もう一度」を押した直後に挟む、
// 「今回の設定を確認し、全員が『準備OK』を押したら再戦を始める」ための判定。
// computeAllPlayersConfirmed()と全く同じ形（1人以上存在し、全員がtrueなら成立／
// 0人なら安全側でfalse）だが、あえて同じ関数にまとめない：ruleConfirmedは
// 「対戦開始前のルール確認」、rematchReadyは「再戦前の準備確認」という別々の文脈の
// 別々のFirebaseフィールドを見ており、1つの関数に統合すると、呼び出し側から見て
// 「今どちらの文脈を判定しているか」が読み取りにくくなるため（本人指示：無理に1箇所へ
// 統合しない）。
// js/onlineBattle.jsのfinishRematchReadyCheck()・js/onlineBattleScreen.jsの
// renderRematchReadyScreen()が使う。room.players（{uid: {..., rematchReady}}）を渡す。
// 【途中退出者を待たない】退出したプレイヤーはroom.playersから削除される
// （js/onlineBattle.jsのleaveRoom()参照）ため、この関数は常に「今ルームに残っている
// 参加者だけ」を見ることになり、途中退出者を除外する処理を別途持つ必要がない。
export function computeAllPlayersRematchReady(players) {
  const entries = Object.values(players ?? {});
  if (entries.length === 0) return false;
  return entries.every((player) => player.rematchReady === true);
}
