// 連続再生の「再生キューの組み立て方」だけを置く、DOM に触れないファイル
// （2026-11-01 r8-music：「曲を選んで再生」を足すときに、js/continuousPlay.js の buildAndStartQueue と
// shuffleSongs の中身を、1文字も意味を変えずにここへ移した。continuousPlay.js はモジュールの読み込み時に
// <audio> 要素へ触れるため tests.html から import できず、全曲・お気に入り・プレイリスト・選んだ曲の
// キューが今までどおりに作られるかをテストで確かめられなかったため）。

// Fisher-Yatesシャッフル。元の配列は変更せず、新しい配列を返す。
// random は 0 以上 1 未満を返す関数（テストで差し替えられるよう引数にする。普段は Math.random）。
export function shuffleSongs(songs, random = Math.random) {
  const result = [...songs];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 候補曲のリストから、実際に再生するキューを決める。
// - 同じ曲が重複しないようにする（Mapでid単位にまとめる。最初に出てきた位置に残る）
// - 端末に音源が読み込まれていない曲は除外し、その数を unavailableCount で返す
// - shuffle のときは並びを混ぜる（順番再生のときは候補の並びのまま）
// 戻り値の kind：
//   "empty-source" … 候補が0曲（再生元が空）
//   "no-playable"  … 候補はあるが、音源のある曲が1曲もない
//   "ok"           … queue に1曲以上
export function planPlaybackQueue({ songs, importedIds, shuffle, random = Math.random }) {
  const dedupedById = new Map(songs.map((song) => [song.id, song]));
  const deduped = [...dedupedById.values()];
  if (deduped.length === 0) return { kind: "empty-source", queue: [], unavailableCount: 0 };

  const playable = deduped.filter((song) => importedIds.has(song.id));
  const unavailableCount = deduped.length - playable.length;
  if (playable.length === 0) return { kind: "no-playable", queue: [], unavailableCount };

  return { kind: "ok", queue: shuffle ? shuffleSongs(playable, random) : playable, unavailableCount };
}
