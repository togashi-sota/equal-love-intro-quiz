// クイズ本編（audio.js）・収録曲一覧/プレイリストの試聴（songlist.js）・連続再生
// （continuousPlay.js）は、それぞれ独立した<audio>要素を持っており、
// 何も対策しないと2つ以上が同時に鳴ってしまう可能性がある。
// このファイルは、そうならないための小さな調整役。
//
// 各モジュールは起動時に「自分を止める関数」をここへ登録しておき（registerPlaybackStopper）、
// 自分の再生を実際に始める直前に「自分以外を止めて」と呼びかける（notifyPlaybackStarting）。
// モジュール同士が互いをimportし合う必要がなく、循環参照も起きない（2026-08-04新設）。

const stoppers = new Map();

export function registerPlaybackStopper(key, stopFn) {
  stoppers.set(key, stopFn);
}

export function notifyPlaybackStarting(exceptKey) {
  stoppers.forEach((stopFn, key) => {
    if (key !== exceptKey) stopFn();
  });
}
