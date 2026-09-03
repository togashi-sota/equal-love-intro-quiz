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

// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド26-29章】結果画面で
// 各プレイヤーが個別に「ルーム設定に戻る」を押したかどうか（room.players/{uid}/resultReturned）を
// 見て、全員が戻り終えたかを判定する。次の試合（対戦を開始する・もう一度）は、この関数が
// trueを返すまで開始できないようにする（本人指示：各自のペースで結果を見終えるまで、
// 次の試合を勝手に始めない）。
// 【切断中の参加者は待たない】本人指示「既存のpresence/切断検知の仕組みをそのまま使う」に
// 従い、player.connectedがfalseの参加者は、結果画面をいつまでも閉じられず対戦全体が
// 詰んでしまうことを防ぐため、待つ対象から除外する（computeAllPlayersRematchReady()・
// computeAllPlayersConfirmed()は既存仕様のため変更しないが、この新設関数はより安全に作る）。
export function computeAllPlayersResultReturned(players) {
  const entries = Object.values(players ?? {});
  const waitingEntries = entries.filter((player) => player.connected !== false);
  if (waitingEntries.length === 0) return false;
  return waitingEntries.every((player) => player.resultReturned === true);
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

// 【2026-11-XX新設・実機バグ調査：再戦フロー】結果画面インライン再戦パネルの
// 「準備OK／再戦を取り消す」トグルボタンの文言・スタイルを、ホスト・ゲストの4画面
// （通常/歌詞クイズ対戦/一瞬バトル/一瞬協力）で必ず同じ判定にするための純粋関数。
// 【この関数を作った理由】以前はこの3分岐（ホスト＝取消／ゲスト準備済み＝取消／
// ゲスト未準備＝準備OK）を4つの画面ファイルへ個別に書いていたが、通常モードだけ
// 先に仕様変更され、他の3画面（歌詞クイズ対戦・一瞬バトル・一瞬協力）には
// ホスト分岐が移植されないまま取り残され、「ホストにも『準備OK』ボタンが出る」
// という実機不具合の直接原因になっていた。同じ判定を1箇所にまとめることで、
// 今後この4画面が再び食い違うことを構造的に防ぐ。
// ホストは提案した瞬間から常に準備済み扱い（js/onlineBattle.jsのbeginRematchReadyCheck()
// 参照）のため「準備OK」は出さず、押すと再戦提案そのものを取り消す専用ボタンとして扱う。
export function resolveRematchToggleButtonLabel({ isHost, myReady }) {
  if (isHost) {
    return { text: "再戦を取り消す", isConfirmed: false };
  }
  return myReady ? { text: "準備を取り消す", isConfirmed: true } : { text: "✓ 準備OK", isConfirmed: false };
}
