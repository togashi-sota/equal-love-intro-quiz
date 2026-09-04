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

// 【2026-09-06新設・実機バグ調査：「もう一度」→キャンセル→もう一度が2回目以降効かない
// バグの再発防止】js/onlineBattle.jsのbeginRematchReadyCheck()が、今のroom.status/
// confirmingRematchから「ここで新しく再戦提案を開始してよいか」を判定する部分だけを
// 切り出した純粋関数（Firebase呼び出し自体はonlineBattle.js側に残す）。
//
// 【なぜ"waiting"も許可するか】1回目の再戦提案でroom.statusは意図的に"waiting"へ
// 書き換わる設計（buildRematchProposalUpdates参照）。cancelRematchReadyCheck()は
// confirmingRematchを下ろすだけでstatusを"result"へは戻さない。それでも結果画面の
// 参加者はこの画面に留まり続けるため、2回目の「もう一度」はstatus==="result"だけを
// 見るガードに常に弾かれていた（実機で再現・確定した根本原因）。
export function canBeginRematchReadyCheckFromRoomStatus({ status, confirmingRematch }) {
  if (status === "result") return true;
  return status === "waiting" && confirmingRematch !== true;
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
// 【2026-11-XX追加・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
// 第2引数participantUids（{uid: true, ...} または省略可）を渡すと、その集合に
// 含まれるplayersだけを判定対象にする。beginRematchReadyCheck()が再戦提案の瞬間に
// room.rematchParticipantUidsへ固定して書き込む「この再戦の対象者」のスナップショット
// （js/onlineBattle.js参照）。これにより、再戦準備中に新しく入室した参加者は、
// 全員の準備が揃ったかどうかの判定にも、再戦の実際の参加者にも含まれなくなる
// （新規参加者はロビーで待機し、次の再戦から通常どおり参加できる）。省略した場合は
// 従来どおりplayers全員を対象にする（呼び出し側の後方互換・スナップショットが
// 何らかの理由でまだ無い場合の安全側フォールバック）。
export function computeAllPlayersRematchReady(players, participantUids) {
  let entries = Object.entries(players ?? {});
  if (participantUids && Object.keys(participantUids).length > 0) {
    entries = entries.filter(([uid]) => participantUids[uid] === true);
  }
  if (entries.length === 0) return false;
  return entries.every(([, player]) => player.rematchReady === true);
}

// 【2026-11-XX新設・実機バグ調査：再戦準備中に新規参加者が来ても巻き込まない仕様】
// 再戦準備パネルの「結果確認の状況」参加者一覧は、room.players全員ではなく、この
// 再戦の対象者（participantUids）だけを表示する。新規参加者は一覧にすら出さず、
// ロビー画面側の通常の参加者一覧でだけ見えるようにする（本人指示：「新しく入った人は
// ロビー上で待機させ、現在進行中の再戦には含めない」）。participantUidsが無い
// （まだスナップショットが無い等）場合は、従来どおりplayers全員を返す。
export function filterPlayersForRematchParticipants(players, participantUids) {
  if (!participantUids || Object.keys(participantUids).length === 0) return players ?? {};
  return Object.fromEntries(Object.entries(players ?? {}).filter(([uid]) => participantUids[uid] === true));
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

// 【2026-11-XX新設・実機バグ調査：「もう一度」を押しても何も起きないバグの再発防止】
// js/onlineBattle.jsのbeginRematchReadyCheck()が、Firebaseへ実際に書き込むupdate()の
// キー一覧をこの純粋関数へ切り出したもの（Firebase呼び出し自体はonlineBattle.js側に残す）。
//
// 【なぜこの形に切り出したか】以前はrematchParticipantUidsを{uid: true, ...}という
// 1つのオブジェクトにまとめ、`rooms/{roomId}/rematchParticipantUids`という「親キー」へ
// 丸ごと書き込んでいた。しかしfirebase/database.rules.jsonのrematchParticipantUidsには
// 子キー（$uid）単位の.writeルールしか無く、親キーそのものへの.writeが定義されていない
// ため、Firebase Realtime Databaseはこの書き込みを常にpermission_deniedで拒否していた
// （update()による複数パスの書き込みは全パスがまとめて1つのアトミックな操作として
// 扱われるため、この1箇所が拒否されると更新全体が丸ごと巻き戻り、実機では「『もう一度』
// ボタンを押しても何も起きない」ように見えていた——これが再戦フローの真の根本原因）。
//
// 修正後は、rematchParticipantUidsも他のフィールド（players/{uid}/rematchReady等）と
// 同じく子キー（uidごと）へ1件ずつ書き込む形にした。この「キーの粒度」という間違えやすい
// 前提を、Firebase呼び出しを持たない純粋関数として切り出すことで、恒久テストで
// 直接検証できるようにしてある（実際のFirebase書き込みを伴わずに、update()へ渡す
// オブジェクトの形そのものを確認できる）。
export function buildRematchProposalUpdates({ roomId, players, hostUid }) {
  const updates = {
    [`rooms/${roomId}/status`]: "waiting",
    [`rooms/${roomId}/confirmingRematch`]: true,
  };
  Object.keys(players ?? {}).forEach((playerUid) => {
    updates[`rooms/${roomId}/players/${playerUid}/rematchReady`] = playerUid === hostUid;
    updates[`rooms/${roomId}/rematchParticipantUids/${playerUid}`] = true;
  });
  return updates;
}
