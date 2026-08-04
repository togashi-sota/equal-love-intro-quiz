// 歌詞クイズモード（仮名）の出題範囲選択・出題画面・結果画面を担当する予定のファイル。
//
// 【現在の状態】
// これはプレースホルダー（土台）であり、まだ実装は一切行っていない。
// 中身は空で、index.html・js/main.js・js/screens.js・sw.jsのどこからも読み込まれていない
// （importされていない・scriptタグもない・sw.jsのAPP_SHELL_FILESにも含まれていない）ため、
// このファイルが存在しても既存のアプリの動作には一切影響しない。
//
// 【このファイルの役割（実装時の想定）】
// 歌詞の抜粋フレーズだけをヒントとして段階的に見せ、曲名を当てるモード。
// 詳しい設計は docs/mode-design-random-playback-and-lyrics-quiz.md の「②歌詞クイズモード」章
// （2026-08-04追記分を含む）を参照。実装に着手する前に、必ずこの設計書を読み直すこと。
//
// 【設計方針の要点（設計書からの抜粋メモ）】
// - 回答方式は「曲一覧から探す方式」を採用する想定（4択は運・消去法で崩れるという本人の懸念のため
//   不採用の方向）。js/songlist.jsの検索・一覧UI（normalizeForSearch・songMatchesSearch等）を
//   かなり再利用できる。
// - 出題範囲は「全曲／表題曲のみ／最近20曲／プレイリストから／お気に入りから」の5種類に対応する
//   想定（お気に入りはjs/favoriteSongs.jsのgetFavoriteSongIds()がプレイリストのsongIdsと
//   同じ形＝曲idの配列なので、新しいデータアクセス方法を作らず流用できる）。
// - ヒント用の歌詞データ（lyricsQuizPhrases）は、試聴同期用のjs/lyricsStorage.jsの歌詞データとは
//   別の新規データとして持つ。歌詞本文そのものを扱うため、既存の運用ルール
//   （Claudeは歌詞本文を一切入力・生成・チャットへの書き出しをしない。本人専用の入力ツール
//   〈dev/lyricsQuizEditor.html等〉から本人が直接入力する）を必ず踏襲すること。
// - 将来「イベント限定」等のカテゴリ分けに対応できるよう、歌詞データに曲単位でtagsフィールド
//   （文字列配列）を持たせる拡張性を設計済み。詳細は設計書の追記②を参照。
//
// 【今後の実装予定（着手時に本人と相談のうえ、小さな単位に分けて進める）】
// 1. js/lyricsQuizStorage.js（データ層）を新設し、ヒントフレーズ・難易度・tagsの保存/読込を実装する。
// 2. 本人専用の入力ツール（dev/lyricsQuizEditor.html・dev/lyricsQuizEditor.js）を新設し、
//    本人がフレーズ・難易度を直接入力できるようにする（Claudeは歌詞本文を書かない）。
// 3. 出題範囲の選択画面・出題画面（ヒント段階表示＋曲一覧からの回答選択）・結果画面を実装する。
// 4. js/specialModesScreen.jsのSPECIAL_MODES配列・js/screens.jsに登録し、index.html側の
//    マークアップを追加して、初めて画面として配線する。
// 5. 履歴を残す場合は、js/history.jsを変更せず、js/timeAttackHistory.jsと同じパターンで
//    専用の履歴ファイル（js/lyricsQuizHistory.js）を新設する（設計書の追記③を参照）。

// ============================================================================
// 【2026-08-04追記：データ構造・ロジックの確定事項（設計書の「追記⑤」に対応する抜粋メモ）】
// メインのFirebaseオンライン対戦モード実装と並行するバックグラウンド作業として、
// 歌詞クイズモードのデータ構造・段階的ヒント表示のロジックをさらに具体化した。
// 以下はすべて設計メモ・コード例であり、このファイル自体はまだ実行可能なコードを
// 一切含まない（コメント/コメントアウトのみ）。歌詞本文は一切書いていない（プレースホルダーのみ）。
//
// 【確定】難易度★の向き：★5＝最も分かりにくい歌詞、★1＝最も分かりやすい歌詞
// （数字が大きいほど「難しい」という直感に合わせている。titleDefinitions.jsの実績設計と同じ考え方）。
// 段階的ヒントは、この★5（分かりにくい）側から先に見せ、あとから★の低い（分かりやすい）行を
// 追加していく。
//
// // 確定版のデータ構造（歌詞本文はダミー値。実際の入力は本人専用ツールから行う）。
// {
//   songId: "xxx",
//   tags: [], // 「イベント限定」等の将来のカテゴリ分け用。空配列は「特になし」
//   lyricsQuizPhrases: [
//     // difficultyの降順（5→1）で並べておくと、下記revealNextHint系のロジックが
//     // 「配列の先頭からrevealedCount件を表示するだけ」で済む。
//     { text: "（最も分かりにくい歌詞フレーズ・ダミー）", difficulty: 5 },
//     { text: "（比較的分かりやすい歌詞フレーズ・ダミー）", difficulty: 2 },
//   ],
//   schemaVersion: 2,
// }
//
// // 段階的ヒント表示ロジック（revealedCountを1ずつ増やす、を実装レベルまで具体化したもの）。
// // phrasesはdifficultyの降順に並び替え済みの配列という前提。
// function revealNextHint(phrases, currentRevealedCount) {
//   return Math.min(currentRevealedCount + 1, phrases.length);
// }
// function getVisiblePhrases(phrases, revealedCount) {
//   return phrases.slice(0, revealedCount);
// }
// // 「ノーヒントで正解」称号は revealedCount === 1 のまま正解、として判定できる。
//
// 【出題範囲の絞り込み（実装レベルまで詳細化）】
// const LYRICS_QUIZ_SOURCE = { ALL: "all", TITLE_TRACK: "titleTrack", RECENT_20: "recent20",
//   PLAYLIST: "playlist", FAVORITE: "favorite" };
// 全曲／表題曲：quiz.jsのfilterSongsByCategoryをそのまま再利用。
// 最近20曲：songs.jsのreleaseDateで降順ソートし先頭20件。
// プレイリスト／お気に入り：playlists.js／favoriteSongs.jsのsongId配列をsongs.jsに引き直す
// （どちらも「曲idの配列」という同じ形なので、同じ引き直し処理を共用できる）。
// どの絞り込みでも最後に「lyricsQuizPhrasesが実際に登録されている曲だけ」へさらに絞る処理が必須。
//
// 【新しい追加提案：入力ツールで既存の同期歌詞データを参考表示する】
// js/lyricsStorage.jsのgetLyricsData(songId)で同期歌詞のlines配列を取得し、一覧表示→行を選択→
// 「歌詞クイズ候補へ追加」ボタンでlyricsQuizPhrasesの下書きにコピー、という入力補助フローの案。
// 著作権面：本人がすでに自分で入力・確認済みの歌詞データを、本人専用ツールの中で本人自身が
// 参照するだけなので、既存の運用ルール（Claudeは歌詞本文を一切入力・生成・書き出ししない）には
// 抵触しない。詳細・モックアップはdev/lyricsQuizEditorMockup.html、設計の背景は設計書の
// 「追記⑤」を参照。
//
// 【履歴の保存キー案（設計書「追記⑤」より）】
// equalLoveIntroQuiz.${getPlayerKeyPrefix()}lyricsQuizHistory
// 記録項目には revealedCountAtAnswer（何段階ヒントを見て正解/不正解になったか）を
// 問題ごとに含めておくと、「ノーヒント正解の回数」のような称号判定に使える。
// ============================================================================
