// オンライン対戦の「ランダム再生クイズ」モード用アダプター。
//
// 【設計方針】進行ルール（ノーマル/ハード/LOVE連チャン）・出題の組み立て・結果の生成/比較は、
// js/battleModes/timeAttackBattleMode.jsと完全に同じロジックをそのまま使う
// （1人用のjs/randomPlaybackScreen.jsが、既存のタイムアタックエンジンをアダプター方式で
// 再利用しているのと全く同じ考え方。差し替えるのは「音源のどこを再生するか」だけ）。
// このファイルが独自に持つのは、gameMode名・表示名・説明文・「再生方式の識別子
// （playbackType）」、そして「出題対象の全曲が固定durationSecを持っているか」の検証、の4つ。
//
// 【playbackTypeについて、2026-08-08新設】js/main.jsのrenderQuestion()が
// `gameMode === "randomPlayback"` のような文字列比較をモードの数だけ増やさずに済むよう、
// 「この対戦モードがどう再生されるか」を表す短い識別子をここで公開する
// （"intro"＝曲の冒頭から再生、"randomPosition"＝曲の途中からplayDurationSec秒だけ再生）。
// 将来、歌詞クイズ等さらに違う再生方法のモードが増えても、main.js側の分岐を増やさず
// この値を見るだけで対応できるようにするための準備（詳細はHANDOFF.md参照）。

import * as timeAttackBattleMode from "./timeAttackBattleMode.js";
import { resolveSongPool } from "../questionSource.js";
import { AUDIO_METADATA } from "../data/audioMetadata.js";
import { SONGS } from "../data/songs.js";

export const gameMode = "randomPlayback";
export const label = "ランダム再生クイズ";
export const description = "曲の途中から5秒間流れる音を聴いて当てます";
export const playbackType = "randomPosition";

export const defaultSettings = timeAttackBattleMode.defaultSettings;
export const buildQuestions = timeAttackBattleMode.buildQuestions;
export const createResult = timeAttackBattleMode.createResult;
export const compareResults = timeAttackBattleMode.compareResults;
export const getRuleDescription = timeAttackBattleMode.getRuleDescription;
export const PENALTY_SECONDS_VALUES = timeAttackBattleMode.PENALTY_SECONDS_VALUES;

// settings.questionSourceから、出題対象になりうる曲プールを解決する。
//
// 【2026-08-08訂正】js/questionSource.jsのresolveSongPool()は、collaborativeSelection
// （オンライン共同選曲）を含むすべてのtypeに対応しており（内部でsanitizeSongIds()を通す）、
// このファイル側で追加の分岐を持つ必要はない。そのため、共同選曲のFirebaseルールが
// 将来公開され、ランダム再生対戦と組み合わせて使われるようになった場合も、確定songPoolに
// 固定durationが無い曲が含まれていれば、下のvalidateSettings()が変更不要のまま
// そのまま検出・開始拒否する（本人からの確認依頼を受けて、当初「未対応」と書いていた
// コメントを訂正した）。
function resolveSongPoolForValidation(questionSource) {
  return resolveSongPool(questionSource);
}

// 出題対象のsongPoolのうち、js/data/audioMetadata.js（音源から自動生成した固定duration）を
// 持たない曲のIDだけを抜き出す。
function findSongIdsMissingFixedDuration(songPool) {
  return songPool.filter((songId) => !AUDIO_METADATA[songId]);
}

// songId配列を、画面表示用の曲名配列へ変換する（見つからない場合はsongIdをそのまま使う、
// 通常発生しない異常系への保険）。
function resolveSongTitles(songIds) {
  return songIds.map((songId) => SONGS.find((song) => song.id === songId)?.title ?? songId);
}

// 設定が実際に出題できる内容か検証する。
//
// 【固定durationの必須化について、本人の指示】ランダム再生の開始位置は、全端末で同じ
// 固定durationSec（js/data/audioMetadata.js）から計算することが同期の前提のため、
// 対象曲が1曲でもこのデータを持たない場合は、公平性を優先して対戦の開始自体を拒否する
// （安全側に倒し、無音再生や機種依存の位置ズレが起きる曲を黙って混ぜない）。
// 通常、audioMetadata.jsはsongs.jsの全曲を自動生成でカバーしているため、この分岐に
// 実際に入るのは「曲を追加したが生成スクリプトの再実行を忘れた」場合だけの想定。
//
// 【イントロ対戦（timeAttack）への影響について】この検証はrandomPlaybackBattleMode.js
// 独自のvalidateSettings（gameMode="randomPlayback"のときだけ呼ばれる）でのみ行われる。
// timeAttackBattleMode.jsのvalidateSettingsは一切変更していないため、audioMetadata.jsの
// 内容にかかわらずイントロ対戦の開始判定には影響しない。
export function validateSettings(settings) {
  const baseError = timeAttackBattleMode.validateSettings(settings);
  if (baseError) return baseError;

  const songPool = resolveSongPoolForValidation(settings.questionSource);
  const missingSongIds = findSongIdsMissingFixedDuration(songPool);
  if (missingSongIds.length > 0) {
    const missingTitles = resolveSongTitles(missingSongIds);
    return `一部の曲で再生位置データが未生成のため、ランダム再生対戦を開始できません（${missingTitles.join("、")}）。対象範囲を変更するか、音源データの生成をやり直してください。`;
  }
  return null;
}
