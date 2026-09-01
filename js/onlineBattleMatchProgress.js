// 個人進行系オンライン対戦（タイムアタック・ランダム再生対戦・アウトロクイズ対戦）の
// 「全員の結果が揃ったか」判定を、Firebaseから完全に切り離した純粋関数として表現する
// モジュール（2026-09-16新設、本人指示：対戦中に自主退出したゲストを待ち続けてしまう
// 不具合の修正）。js/onlineBattleHostTransitionPayloads.js等と同じ設計方針（判定ロジック
// だけをこのファイルへ切り出し、Firebase I/O層のjs/onlineBattle.js・画面のjs/onlineBattleScreen.js
// から呼ぶ。tests.htmlへ直接importできるようにするため）。
//
// 【この3モードの進行方式】歌詞クイズ対戦・一瞬バトル・一瞬協力は、ホストが
// runHostProgressionTick()で全員の回答を定期的に集計しながら問題を進める「host-tick」方式
// だが、こちら（タイムアタック・ランダム再生対戦・アウトロクイズ対戦）は「各自が自分の
// ペースで全問終え、matches/{matchId}/progress/{uid}へfinished:trueを書く」方式
// （js/onlineBattleScreen.js参照）。js/onlineBattle.jsのfinalizeMatchIfReady()が、
// 参加者全員のfinishedが揃ったタイミングでroom.statusをresultへ進める。
//
// 【本人指示、2026-09-14：対戦中のゲストが自分だけ途中離脱する】「この試合だけ抜ける」
// （leftDuringMatch:true、js/onlineBattle.jsのleaveMatchInProgress()）を選んだ参加者は、
// 順位・勝敗判定の対象外になる（js/onlineBattleScreen.jsのgoToResultScreen()が既に
// DNF扱いにしている）。途中退出者はそもそも最後まで問題を解かないため、
// progress.finishedが立つことは無い。
//
// 【見つかった不具合】この「全員揃ったか」の判定が、途中退出者を待つ対象から外していな
// かったため、途中退出者のprogress.finishedが永遠に立たず、自動では結果画面へ進めなかった
// （ホストが待機画面で「結果を確定する」を手動で押すまで、他のプレイヤーが待たされ続けて
// いた）。同期3モード（歌詞クイズ対戦・一瞬バトル・一瞬協力）で既に採用した考え方
// （退出済みの人は待つ対象から外す）を、この個人進行系にも同じ形で適用する。

// 個人進行系の1試合ぶん、「残っているプレイヤーだけで最終結果を確定してよい」かどうかを
// 判定する。
// participants: matches/{matchId}/participants（対戦開始時点のスナップショット。
//               { [uid]: { leftDuringMatch?: boolean, ... } }）
// progress    : matches/{matchId}/progress（{ [uid]: { finished?: boolean, ... } }）
export function isMatchReadyToFinalize({ participants, progress }) {
  const participantUids = Object.keys(participants ?? {});
  if (participantUids.length === 0) return false;
  return participantUids.every((uid) => isParticipantAccountedFor(participants[uid], progress?.[uid]));
}

// 1人の参加者について、「これ以上、この人の結果を待たなくてよい」状態かどうか。
// ・対戦中に自主退出済み（leftDuringMatch:true）なら、結果を送っていなくても待たない
//   （書き込み後に取り消せないwrite-onceフラグのため、以後ずっとこの扱いになる）。
// ・【2026-09-16追加・本人指示：「音が出ない」救済ボタン第2段階（オンライン対戦・個人進行系）】
//   「音が出ない」を自己申告してこのマッチから抜けた（audioTroubleAbort:true）場合も、
//   leftDuringMatchと全く同じ理由（これ以上この人の結果を待つ必要が無い）で待つ対象から外す。
//   ただし意味は別物（本人の意思による途中退出ではなく、音源トラブルによる特別な離脱）なので、
//   leftDuringMatchとは別のフラグとして扱い、結果画面側の表示（js/onlineBattleScreen.js）は
//   混同しない。
// ・それ以外は、従来どおりprogress.finishedがtrueになるまで待つ。
function isParticipantAccountedFor(participant, participantProgress) {
  if (participant?.leftDuringMatch === true) return true;
  if (participant?.audioTroubleAbort === true) return true;
  return participantProgress?.finished === true;
}
