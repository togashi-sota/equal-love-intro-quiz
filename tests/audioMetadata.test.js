// js/data/audioMetadata.js（dev/generate_audio_metadata.pyの生成物）の整合性テスト。
//
// 【このテストが必要な理由】ランダム再生クイズのオンライン対戦は、全曲がこのファイルに
// 正しいdurationSecを持っていることを前提にしている。新曲追加時に生成スクリプトの
// 再実行を忘れる、手で編集して壊す、といったミスを早期に検出するためのテスト
// （本人の指示、HANDOFF.md 10-64章参照）。
//
// 【決定論性（同じ入力なら同じ出力）について】生成スクリプト自体を2回実行して出力が
// 一致することは、dev/generate_audio_metadata.pyを直接2回実行して確認済み
// （ブラウザ側のテストでは検証できないビルドプロセスの性質のため、このファイルの対象外）。

import { SONGS } from "../js/data/songs.js";
import { AUDIO_METADATA } from "../js/data/audioMetadata.js";
import { assertEqual } from "./test-utils.js";

// 実在する曲でこの範囲を外れることは通常ないため、極端な値の検出に使う
// （dev/generate_audio_metadata.pyのSUSPICIOUSLY_SHORT_SEC / SUSPICIOUSLY_LONG_SECと同じ考え方）。
const SUSPICIOUSLY_SHORT_SEC = 10.0;
const SUSPICIOUSLY_LONG_SEC = 600.0;
const DURATION_DECIMAL_PLACES = 3;

// 音源ファイル自体がまだアプリに存在しないため、dev/generate_audio_metadata.pyで
// 実測できない曲のID（2026-08-17追加）。本人が実際に音源を登録し、生成スクリプトを
// 再実行してAUDIO_METADATAに実測値が追加され次第、この配列から取り除くこと
// （そのときAUDIO_METADATAへ実データが増えるので、下のテストが自動的に検出してくれる）。
// オンラインのランダム再生対戦は、js/battleModes/randomPlaybackBattleMode.jsの
// validateSettings()が「この曲は同期用の固定durationを持たない」を検出して対戦開始自体を
// 安全に拒否する設計のため、この曲が音源未登録のままでも対戦が壊れたり不正な同期が
// 起きたりすることはない（本人指示：音源未登録の曲として安全に存在できればよい）。
// 【2026-08-27更新】21stシングル3曲（koi-hajimemashita・natsunagori-summer-tune・
// yume-no-tsuzuki）は、本人が実際に音源を登録し、dev/generate_audio_metadata.pyを
// 再実行してAUDIO_METADATAへ実測値が追加されたため、この配列から取り除いた。
const SONG_IDS_WITHOUT_REGISTERED_AUDIO_YET = new Set([]);

export function runAudioMetadataTests() {
  const songIds = SONGS.map((song) => song.id).filter(
    (id) => !SONG_IDS_WITHOUT_REGISTERED_AUDIO_YET.has(id)
  );
  const metadataIds = Object.keys(AUDIO_METADATA);

  // 曲数の一致：SONGS（音源登録待ちの曲を除く）とAUDIO_METADATAが常に同じ件数であることを
  // 確認する。曲を追加してAUDIO_METADATAの再生成を忘れた場合、ここで必ず失敗する
  // （具体的な曲数を決め打ちしないことで、将来曲が増えても更新不要なテストにしている）。
  assertEqual(
    metadataIds.length,
    songIds.length,
    `SONGS（${songIds.length}曲、音源登録待ちを除く）とAUDIO_METADATA（${metadataIds.length}件）の件数が一致する`
  );

  // SONGSの全曲（音源登録待ちを除く）がAUDIO_METADATAに存在する（欠落なし）。
  const missingIds = songIds.filter((id) => !(id in AUDIO_METADATA));
  assertEqual(missingIds, [], `SONGSの全曲にAUDIO_METADATAが存在する（欠落: ${missingIds.join(", ") || "なし"}）`);

  // AUDIO_METADATA側に、SONGSに存在しない余分なsongIdが無い。
  const songIdSet = new Set(songIds);
  const orphanIds = metadataIds.filter((id) => !songIdSet.has(id));
  assertEqual(orphanIds, [], `AUDIO_METADATAに余分なsongIdが無い（余分: ${orphanIds.join(", ") || "なし"}）`);

  // durationSecがすべて「有限な数値」「0より大きい」「小数第3位までに収まっている」
  // 「極端に短い/長い値ではない」ことを確認する。
  const invalidFinite = [];
  const invalidPositive = [];
  const invalidPrecision = [];
  const suspiciousRange = [];

  for (const [songId, entry] of Object.entries(AUDIO_METADATA)) {
    const durationSec = entry.durationSec;
    if (!Number.isFinite(durationSec)) {
      invalidFinite.push(songId);
      continue;
    }
    if (durationSec <= 0) {
      invalidPositive.push(songId);
    }
    const rounded = Math.round(durationSec * 10 ** DURATION_DECIMAL_PLACES) / 10 ** DURATION_DECIMAL_PLACES;
    if (rounded !== durationSec) {
      invalidPrecision.push(songId);
    }
    if (durationSec < SUSPICIOUSLY_SHORT_SEC || durationSec > SUSPICIOUSLY_LONG_SEC) {
      suspiciousRange.push(songId);
    }
  }

  assertEqual(invalidFinite, [], `durationSecがすべて有限数（不正: ${invalidFinite.join(", ") || "なし"}）`);
  assertEqual(invalidPositive, [], `durationSecがすべて0より大きい（不正: ${invalidPositive.join(", ") || "なし"}）`);
  assertEqual(
    invalidPrecision,
    [],
    `durationSecがすべて小数第${DURATION_DECIMAL_PLACES}位以内に収まっている（不正: ${invalidPrecision.join(", ") || "なし"}）`
  );
  assertEqual(
    suspiciousRange,
    [],
    `durationSecが${SUSPICIOUSLY_SHORT_SEC}秒未満・${SUSPICIOUSLY_LONG_SEC}秒超の曲が無い（該当: ${suspiciousRange.join(", ") || "なし"}）`
  );
}
