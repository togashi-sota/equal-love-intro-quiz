// js/onlineBattleSongAvailability.jsが使う、Firebase・DOMに一切触れない純粋関数だけを
// 集めたファイル（2026-08-26新設）。
//
// 【なぜ分離しているか】js/lyricsQuizBattleFirebasePayloads.js（純粋関数）と
// js/lyricsQuizBattleFirebase.js（Firebase SDK呼び出し）を分けている、このプロジェクトの
// 既存パターンと同じ理由。tests.htmlは実際のブラウザで動作し、importした時点でモジュールの
// トップレベルコードが実行されるため、Firebase SDKの初期化コード（js/firebaseClient.js）を
// importするファイルを自動テストの対象にすると、本番のFirebaseへ接続しようとしてしまう。
// 判定ロジック（本人指示Gの中核＝共通曲の交差計算）だけをこちらへ独立させることで、
// tests/onlineBattleSongAvailability.test.jsから安全にimportしてテストできるようにしている。

// basePool（そのまま出題しようとしていた曲ID一覧）を、参加者たちの所持曲一覧の共通部分に
// 絞り込む純粋関数。
//
// availabilityList: (string[] | null | undefined)[]
//   各参加者の「所持している曲ID一覧」。書き込みに失敗した・まだ報告していない参加者は
//   null/undefinedを渡す（＝その参加者については「わからない」という扱いになり、
//   共通曲の計算からは除外される。1人も報告が無ければ絞り込みは行わない）。
//
// 戻り値: string[]（basePoolの並び順を維持したまま、報告があった全員が共通して
//   持っている曲だけを残した配列。誰も報告していなければbasePoolをそのまま返す）。
export function restrictSongPoolToCommonAvailability(basePool, availabilityList) {
  const reported = (availabilityList ?? []).filter((ids) => Array.isArray(ids));
  if (reported.length === 0) return basePool;

  const availableSets = reported.map((ids) => new Set(ids));
  return basePool.filter((songId) => availableSets.every((set) => set.has(songId)));
}
