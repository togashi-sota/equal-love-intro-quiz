// オンライン対戦「共同選曲」のFirebase書き込み窓口（2026-08-27新設）。
// 判定ロジック（和集合の計算）はjs/onlineBattleCollaborativeSelectionPayloads.jsへ分離してあり
// （Firebase SDKをimportするこのファイルを自動テストの対象にしないため、既存の
// js/onlineBattleSongAvailability(Payloads).jsと同じ分割パターン）、このファイルは
// 実際の読み書きだけを担当する。

import { ref, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { database, authReady, getCurrentUid } from "./firebaseClient.js";
import { computeMergedSelectedSongIds, areSongIdSetsEqual } from "./onlineBattleCollaborativeSelectionPayloads.js";

export { computeMergedSelectedSongIds, areSongIdSetsEqual };

// この端末（＝今ログインしているプレイヤー）が選んだ曲一覧を、今いるルームの
// 自分の参加者エントリ（players/{uid}/selectedSongIds）へ書き込む。
// ホストか参加者かを問わず、誰でも自分の分だけを書き込める設計（本人指示：
// 全員が共同で選曲できるようにする）。
//
// 【重要・現状の制約】本番のFirebaseセキュリティルールがこの新しいフィールド
// （selectedSongIds）へのplayers/{uid}書き込みをまだ許可していない環境では、
// この書き込みはPERMISSION_DENIEDで失敗する。この機能は「今までの動作を変えない
// background機能」ではなく「選んだはずなのに反映されない」と利用者を混乱させる
// 可能性がある操作のため、他の所持データ報告（reportMyAvailableSongIdsForKind）とは
// 異なり、例外を握りつぶさずそのまま呼び出し元へ伝える（呼び出し元がエラーを
// 画面に表示できるようにするため）。
export async function reportMySelectedSongIds({ roomId, songIds }) {
  await authReady;
  const uid = getCurrentUid();
  if (!uid) throw new Error("not-signed-in");
  await update(ref(database, `rooms/${roomId}/players/${uid}`), {
    selectedSongIds: songIds,
  });
}
