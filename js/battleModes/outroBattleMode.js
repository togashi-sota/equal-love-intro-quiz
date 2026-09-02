// オンライン対戦の「アウトロクイズ」モード用アダプター（2026-08-30新設、本人指示㉔）。
//
// 【設計方針】js/battleModes/randomPlaybackBattleMode.jsと全く同じ考え方で、進行ルール・
// 出題の組み立て・結果の生成/比較はjs/battleModes/timeAttackBattleMode.jsをそのまま使う。
// 差し替えるのは「音源のどこを再生するか」（曲の最後5秒）だけ。
//
// 【ランダム再生対戦との違い】ランダム再生は毎回ランダムな開始位置を全端末で一致させる
// 必要があるため、seed・questionIndexから計算する（js/randomPlaybackEngine.js）。
// アウトロは「曲の最後5秒」という位置そのものが曲ごとに固定（js/data/audioMetadata.jsの
// outroStartSec）で、ランダム性が無いため、乱数計算は一切不要（同じ曲なら常に同じ位置）。
// そのため、このモードのplaybackTypeは"randomPosition"とは別の"outroPosition"にし、
// js/main.jsのrenderQuestion()側もseed/matchIdを持ち回らない、より単純な分岐で済ませる。
//
// 【outroStartSecを必須にする理由、本人の指示どおりrandomPlaybackBattleMode.jsと同じ方針】
// 1人用のアウトロクイズ（js/main.jsのbeginOutroQuiz()）は、outroStartSecが無い曲を
// 「曲の長さ-5秒」へフォールバックするが、そのフォールバックは実際にブラウザが読み込んだ
// 音源の長さ（audioElement.duration）を使うため、端末ごとに値がズレるおそれがある。
// オンライン対戦は複数端末の公平性が最優先のため、フォールバックを許さず、
// outroStartSecを持たない曲が対象に含まれる場合は対戦の開始自体を拒否する。

import * as timeAttackBattleMode from "./timeAttackBattleMode.js";
import { resolveSongPool } from "../questionSource.js";
import { AUDIO_METADATA } from "../data/audioMetadata.js";
import { SONGS } from "../data/songs.js";

export const gameMode = "outroQuiz";
// 【2026-11-XX修正・本人指示：二重確認レビューで発見】ロビーのモード選択（index.html）は
// 「アウトロ対戦」と表示しているため、getModeLabel()経由の表示もそれに合わせる
// （timeAttackBattleMode.jsの同じ修正と同じ理由）。
export const label = "アウトロ対戦";
export const description = "曲の最後5秒を聴いて当てます";
export const playbackType = "outroPosition";

export const defaultSettings = timeAttackBattleMode.defaultSettings;
export const buildQuestions = timeAttackBattleMode.buildQuestions;
export const createResult = timeAttackBattleMode.createResult;
export const compareResults = timeAttackBattleMode.compareResults;
export const getRuleDescription = timeAttackBattleMode.getRuleDescription;
export const PENALTY_SECONDS_VALUES = timeAttackBattleMode.PENALTY_SECONDS_VALUES;
export const resolveSettingsSongPool = timeAttackBattleMode.resolveSettingsSongPool;
export const resolveAllEligibleSongIds = timeAttackBattleMode.resolveAllEligibleSongIds;
// 音源の所持状況で共通曲を絞り込む（歌詞データは使わないモードのため）。
export const availabilityKind = "audio";

function resolveSongPoolForValidation(questionSource) {
  return resolveSongPool(questionSource);
}

// 出題対象のsongPoolのうち、outroStartSec（js/data/audioMetadata.js）を持たない曲のIDを抜き出す。
function findSongIdsMissingOutroStart(songPool) {
  return songPool.filter((songId) => AUDIO_METADATA[songId]?.outroStartSec === undefined);
}

function resolveSongTitles(songIds) {
  return songIds.map((songId) => SONGS.find((song) => song.id === songId)?.title ?? songId);
}

export function validateSettings(settings) {
  const baseError = timeAttackBattleMode.validateSettings(settings);
  if (baseError) return baseError;

  const songPool = resolveSongPoolForValidation(settings.questionSource);
  const missingSongIds = findSongIdsMissingOutroStart(songPool);
  if (missingSongIds.length > 0) {
    const missingTitles = resolveSongTitles(missingSongIds);
    return `一部の曲でアウトロ再生位置データが未生成のため、アウトロ対戦を開始できません（${missingTitles.join("、")}）。対象範囲を変更するか、音源データの生成をやり直してください。`;
  }
  return null;
}
