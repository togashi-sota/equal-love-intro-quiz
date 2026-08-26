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

// rooms/{roomId}/players（Firebaseからそのまま同期された、各参加者の生データ）を材料に、
// 「今このルームに実際にいる全員」の共通曲プールを計算する純粋関数（2026-08-27新設）。
//
// 【なぜこの関数が必要か】本人指示：「参加者が入退室するたびに共通曲を自動で再計算してほしい」
// 「1対1でも4人対戦でも、"今その部屋にいる全員"を基準に共通曲を決めてほしい（最大人数ではない）」。
// js/onlineBattleScreen.jsのrenderLobby(room)は、players一覧が変わるたびに呼ばれる
// （Firebaseのリアルタイム監視）ため、そのたびにこの関数を呼べば「その場で自動再計算」が
// 実現できる。room.playersには各参加者が報告したavailableAudioSongIds/availableLyricsSongIds
// （js/onlineBattleSongAvailability.jsが書き込む）が既に同期済みで含まれているため、
// 追加でFirebaseへ読みに行く必要が無い（既存のrestrictSettingsToCommonlyAvailableSongsが
// 対戦開始の瞬間だけ別途読み直すのとは別に、ロビー表示用の「今の見込み」を軽量に出せる）。
//
// allEligibleSongIds: このgameModeでそもそも出題対象になりうる全曲ID
//   （js/battleModes/index.jsのresolveAllEligibleSongIdsForMode()が返す値。
//   音源を使うモードは全曲、歌詞クイズは歌詞クイズ対象外の曲を除いた曲、という違いを
//   ここでは意識せず、呼び出し側から渡してもらうだけにする）。
// players: room.players（{ [uid]: { ...availableAudioSongIds, availableLyricsSongIds等 } }）
// kind: "audio" | "lyrics"（どちらの所持データで絞り込むか）
//
// 戻り値: string[]（allEligibleSongIdsの並び順を維持したまま、今いる参加者全員が
//   共通して持っている曲だけを残した配列）。
export function computeRoomCommonSongPool({ allEligibleSongIds, players, kind }) {
  const field = kind === "lyrics" ? "availableLyricsSongIds" : "availableAudioSongIds";
  const availabilityList = Object.values(players ?? {}).map((player) =>
    Array.isArray(player?.[field]) ? player[field] : null
  );
  return restrictSongPoolToCommonAvailability(allEligibleSongIds, availabilityList);
}
