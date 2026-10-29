// ライブコールの演出データ（本人が見直した「コール1件ごとの演出の種類」。2026-10-30新設・最初は空）。
// 形：{ [曲ID]: { [callKey]: { type, memberIds?, segmentOffsets?, nameFrom?, nameAt?, repeat?, textHash } } }
//   callKey はタイミングデータと同じキー（元のコール「種類@元の開始時刻」・分割「元のキー#番号」・追加「added-…」）。
//   textHash（js/callTextEdits.js の hashText）が端末の文章と合わないものは使わない（ふつうの演出に倒れる）。
// 空でも動く：超絶かわいい・MIX の決まった掛け声・フッフー／ふわふわ・短い掛け声（言葉）・4秒以上は自動で決まり、
// それ以外は「ふつう」。名前コールのメンバーカラーは、ここに本人が書いた曲だけに付く（自動では付けない）。
// 本文・歌詞は入れない（キー・種類・メンバーID・時刻の区切りだけ）。
export const CALL_EFFECTS = Object.freeze({});
