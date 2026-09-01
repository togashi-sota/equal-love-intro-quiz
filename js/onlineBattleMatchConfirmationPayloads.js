// 対戦開始前ルール確認画面（2026-09-13新設・本人指示）のうち、Firebaseの読み書きを
// 一切伴わない純粋な判定ロジックだけを切り出したファイル。
// js/onlineBattleHostTransitionPayloads.js・js/onlineBattleSongAvailabilityPayloads.jsと
// 同じ設計方針（本人指示：判定ロジックはFirebase処理と分離し、恒久テストで検証できる形にする）。

// 直前の試合の参加者（room.matches/{matchId}/participantsのキー）と、今のルーム参加者
// （room.playersのキー）を比べ、構成が変わっていれば true を返す。
// js/onlineBattle.jsのrematchAndStartNow()が、「もう一度」でルール確認を再表示すべきか
// （本人指示15：参加者構成が変わった場合は再戦でも確認画面を挟む）の判定に使う。
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
