// js/data/audioMetadata.js のhasAudioSource()のテスト。
// 「収録曲一覧・オリジナル問題作成モードで、再生/試聴ボタンを表示してよいか」を判定する関数
// （2026-08-17新設、本人指示：曲名のハードコードではなく、実際の音源データ
// （AUDIO_METADATA）の有無で判定する。22nd以降の新曲追加にも自動的に対応する）。
// js/songlist.js自体はモジュール読み込み時に#preview-audio等のDOM要素へ直接触れるため、
// tests.htmlのようなDOMを持たないテスト環境からは安全にimportできない。そのため
// hasAudioSource()は、DOM操作を一切含まないjs/data/audioMetadata.js側に置いている。
import { hasAudioSource } from "../js/data/audioMetadata.js";
import { assertEqual } from "./test-utils.js";

export function runSonglistTests() {
  // ---- 実在する音源データを持つ曲は、再生できると判定される ----
  assertEqual(
    hasAudioSource({ id: "love" }),
    true,
    "AUDIO_METADATAに載っている曲（love）はhasAudioSourceがtrueを返す"
  );

  // ---- 本人指示のケース：21stシングル表題曲は、まだ音源データが存在しない ----
  assertEqual(
    hasAudioSource({ id: "koi-hajimemashita" }),
    false,
    "21stシングル表題曲（koi-hajimemashita）はAUDIO_METADATAに未登録のためfalseを返す"
  );

  // ---- 未知の曲idでも安全にfalseを返す（クラッシュしない） ----
  assertEqual(
    hasAudioSource({ id: "this-song-id-does-not-exist" }),
    false,
    "存在しない曲idでもクラッシュせずfalseを返す"
  );
}
