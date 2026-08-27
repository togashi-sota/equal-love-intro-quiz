// オンライン対戦「共同選曲」（参加者全員が自分のお気に入り・プレイリストから曲を選び、
// 全員の選択を合わせたものを実際の出題対象にする機能）の、Firebase・DOMに一切触れない
// 純粋関数だけを集めたファイル（2026-08-27新設、本人指示）。
//
// 【データ設計：なぜ「各自が自分の分だけ持つ」形にしたか】
// 「参加者全員で1つの出題曲リストを共同編集する」という要望に対して、案として
// ①rooms/{roomId}/selectionという新しい共有ノードを1つ作り、みんなでそこへ書き込む方式と、
// ②既存のrooms/{roomId}/players/{uid}に「自分が選んだ曲」フィールドを1つ足すだけの方式を
// 検討した。②を採用した理由：
//   - players/{uid}は既にプレイヤー本人だけが書き込める設計（既存のready・oshiMemberId等と
//     同じ階層）で、Firebaseセキュリティルールの追加も「もう1つ、本人だけ書けるフィールドを
//     増やす」だけで済み、「参加者なら誰でも共有ノードへ書き込める」という新しい種類の
//     許可を作らずに済む（安全側・変更が小さい）。
//   - room.playersは既に全端末がリアルタイム購読済みのため、追加の購読も不要。
//   - 「誰が何曲選んだか」が自然にuid単位で分かれているため、本人指示にあった将来構想
//     （「毎回ランダムで1人を選び、その人のプレイリストを基準に出題する」モード）を
//     追加したくなったときも、この同じフィールドをそのまま使い回せる
//     （「全員の和集合」ではなく「特定の1人の分だけを読む」という読み方に変えるだけで済む）。
//   - 「同じ曲を複数人が選んだ場合の扱い」も、和集合（Set）を取るだけで自然に解決する
//     （重複が1件に畳まれるだけで、特別な調停ロジックは不要）。
//
// 【誰の選択がいつ消えるか】ある参加者がルームから退出すると、rooms/{roomId}/players/{uid}
// ごと削除される（既存のleaveRoom()の挙動）ため、その人が選んでいた曲も自動的に和集合から
// 外れる。新しく参加した人はselectedSongIdsが未設定（＝空扱い）から始まる。

// rooms/{roomId}/players（Firebaseの生データそのまま）から、参加者全員が選んだ曲IDの
// 和集合を返す純粋関数。並び順は「最初に見つかった参加者の選択順」を基準にする
// （Object.entries()の列挙順はFirebaseがuidキーで返す順のため、本人指示どおり
// 「厳密な公平性」までは求めず、決定論的であればよい設計）。
//
// players: { [uid]: { ...selectedSongIds? } }
// 戻り値: string[]（重複なし）
export function computeMergedSelectedSongIds(players) {
  const seen = new Set();
  const merged = [];
  for (const player of Object.values(players ?? {})) {
    const songIds = Array.isArray(player?.selectedSongIds) ? player.selectedSongIds : [];
    for (const songId of songIds) {
      if (seen.has(songId)) continue;
      seen.add(songId);
      merged.push(songId);
    }
  }
  return merged;
}

// 2つの曲ID配列が「同じ内容の集合」かどうかを判定する（並び順の違いは無視する）。
// ホスト側が「実際に変化があった場合だけFirebaseへ書き込む」ための変化検知に使う
// （本人指示：壊れにくい・無駄な書き込みをしない設計にする）。
export function areSongIdSetsEqual(a, b) {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  return b.every((songId) => setA.has(songId));
}
