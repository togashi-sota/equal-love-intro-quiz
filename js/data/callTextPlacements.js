// ライブコール「文字モード」の、本人が承認したコールの配置（2026-10-24新設）。
// 中身は「曲ID・コールのキー（種類＋開始時刻）・行番号・位置」だけで、歌詞本文・コール本文は含めない
// （歌詞とコールは各端末の IndexedDB にあるデータを使い、表示時に組み合わせる）。
// 確認用プレビュー（tools/live-call-text/preview.html、ローカル専用）の「承認済みの配置を書き出す」で作った内容を、
// 本人の確認後にここへ追加する。承認前の曲は空のまま（時刻からの推定で並べ、「配置要確認」を表示する）。
//
// 形式：{ [songId]: { approvedAt: "YYYY-MM-DD", placements: { [callKey]: { lineNo, position } } } }
export const APPROVED_CALL_TEXT_PLACEMENTS = {};
