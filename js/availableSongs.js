// 「この端末に実際にどの曲のデータが入っているか」を種類ごとに横断的に調べるための、
// 共通の窓口ファイル（2026-08-26新設）。
//
// 【なぜ必要か】これまで「音源が読み込み済みか」「歌詞データがあるか」「コールデータが
// あるか」は、js/audioStorage.js・js/lyricsStorage.js・js/callStorage.jsがそれぞれ別々の
// 関数（filterSongsWithImportedAudio・hasLyricsData・getSongIdsWithCallData等）として
// 提供しており、呼び出し側が種類ごとに別々のimportを書く必要があった。
// 今後「21枚目以降の新曲パックを追加した端末だけ、その曲を出題対象にする」という判定を
// 複数の画面（通常クイズ・歌詞クイズ・タイムアタック・オンライン対戦の共通曲判定等）で
// 一貫して行うため、種類ごとの取得を1箇所にまとめた。
//
// 【既存コードへの影響】既存の各ストレージモジュールの関数はそのまま残しており、
// このファイルはそれらを呼び出すだけの薄いラッパー。既存の呼び出し元
// （js/main.js・js/timeAttackScreen.js等）を書き換える必要はなく、新しく
// 「端末ごとの所持曲」を意識する必要がある新規コード（データパック・オンライン対戦の
// 共通曲判定・今後のオンボーディング画面等）だけがこのファイルを使う想定
// （本人指示：既存コードを必要以上に全面改修せず、安全に段階導入する）。

import { getImportedSongIds } from "./audioStorage.js";
import { getImportedLyricsSongIds } from "./lyricsStorage.js";
import { getSongIdsWithCallData } from "./callStorage.js";

// この端末が持っているデータの種類。オンライン対戦の共通曲判定・データパックの
// マニフェスト表示など、種類を文字列で扱いたい箇所で共通の定数として使う。
export const AVAILABLE_DATA_KIND = {
  AUDIO: "audio",
  LYRICS: "lyrics",
  CALL: "call",
};

// 指定した種類のデータについて、この端末に実際に保存済みの曲ID一覧を返す。
// 未対応の種類を渡した場合は空配列を返す（呼び出し側で防御的に扱えるようにするため、
// 例外は投げない）。
export async function getAvailableSongIds(kind) {
  switch (kind) {
    case AVAILABLE_DATA_KIND.AUDIO:
      return getImportedSongIds();
    case AVAILABLE_DATA_KIND.LYRICS:
      return getImportedLyricsSongIds();
    case AVAILABLE_DATA_KIND.CALL:
      return getSongIdsWithCallData();
    default:
      return [];
  }
}

// 音源・歌詞・コールの3種類すべてを一度にまとめて取得する。
// オンボーディング画面の「現在の所持状況」表示や、データパック読み込み後の
// 「○曲追加しました」集計など、3種類まとめて必要になる場面で使う。
// 戻り値: { audio: string[], lyrics: string[], call: string[] }
export async function getAllAvailableSongIds() {
  const [audio, lyrics, call] = await Promise.all([
    getImportedSongIds(),
    getImportedLyricsSongIds(),
    getSongIdsWithCallData(),
  ]);
  return { audio, lyrics, call };
}
