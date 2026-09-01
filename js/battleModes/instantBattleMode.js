// オンライン対戦の「一瞬バトル」モード用アダプター（2026-08-30新設、本人指示：19-3章）。
//
// 【設計方針】1人用の一瞬チャレンジ（js/instantChallengeScreen.js）と同じ「曲の途中から
// 一瞬〈1.5/1/0.5秒〉だけ再生し、回答候補（4/10/全曲）から曲名を当てる」ルールを、
// オンライン対戦向けに全端末で再現できる形（seedベースの決定論的な計算）へ置き換えたもの。
//
// 【進行モデルについて、重要】歌詞クイズ対戦（js/onlineLyricsQuizBattleScreen.js）とは違い、
// 「もう一度聞く」はプレイヤーごとに完全独立（本人指示：Aさんの聞き直しはBさんに影響しない）
// であり、全員が同じ問題を同時に見る同期進行は不要。そのため、js/battleModes/
// timeAttackBattleMode.jsと同じ「各自が同じ問題セットを自分のペースで解き進め、終わったら
// results/progressを送信する」独立進行モデルを採用する（js/onlineBattle.jsの既存の
// progress/resultsパスをそのまま使え、新しいFirebase Rulesの追加は最小限で済む）。
//
// 【出題の組み立てが全端末で一致する仕組み】
// ・出題する曲の選定：questionSource.jsのbuildQuestionsFromPool()と同じ考え方
//   （createSeededRandom(seed) + pickQuestionSongs()）。
// ・再生開始位置：js/randomPlaybackEngine.jsのcomputeRandomStartTimeSec()を、
//   js/data/audioMetadata.jsの固定durationSec（実機の音源長ではなく、全端末で共通の値）と
//   組み合わせて計算する（js/battleModes/randomPlaybackBattleMode.jsと全く同じ理由・同じ方式）。
// ・回答候補：js/lyricsQuizEngine.jsのcreateAnswerPoolRandom()（seed・songId・questionIndexから
//   決定論的な乱数を作る、まさにオンライン対戦用に用意された関数）+ generateAnswerPool()。
//
// 【もう一度聞くの回数について】プレイヤーごと・問題ごとに最大3回まで（本人指示）。
// この上限はオンライン対戦専用のこのファイル・画面側（js/onlineInstantBattleScreen.js）だけが
// 持つ制約で、1人用の一瞬チャレンジ（無制限）には一切影響しない。
//
// 【順位判定について、本人指示】「正解数が多い順→合計再視聴回数が少ない順」。回答タイムは
// 順位に一切使わない。そのため、createResult()のcommonには回答タイム（elapsedMs）は
// 参考記録として残しつつ、比較にはcorrectCount・replayCountだけを使う。

import { SONGS } from "../data/songs.js";
import { AUDIO_METADATA } from "../data/audioMetadata.js";
import { resolveSongPool, validateSongPoolForQuestionCount, sanitizeSongIds, filterSongIdsByCategory } from "../questionSource.js";
import { MIN_SONGS_REQUIRED, resolveQuestionCount, pickQuestionSongs, filterSongsByCategory } from "../quiz.js";
import { createSeededRandom } from "../seededRandom.js";
import {
  generateAnswerPool,
  createAnswerPoolRandom,
  validateLyricsQuizQuestionAnswerPool,
  buildFallbackAnswerPool,
} from "../lyricsQuizEngine.js";

export const gameMode = "instantBattle";
export const label = "一瞬バトル";
export const description = "曲を一瞬だけ聴いて当てます（対戦）";
// 【2026-08-30】js/main.jsの共有クイズ画面（renderQuestion）は一切経由しない専用画面
// （js/onlineInstantBattleScreen.js）で再生・回答を扱うため、playbackTypeはここでは
// 識別のためだけに宣言する（main.js側のplaybackType分岐には登場しない）。
export const playbackType = "instant";
export const availabilityKind = "audio";

// 再生時間の選択肢（1人用の一瞬チャレンジと同じ3段階。本人指示：0.3秒は今回見送り）。
export const PLAY_DURATION_VALUES = ["1.5", "1", "0.5"];
// 回答候補の選択肢（1人用の一瞬チャレンジと同じ3段階）。
export const ANSWER_POOL_SIZE_VALUES = ["4", "10", "all"];
// 出題数の選択肢（1人用の一瞬チャレンジと同じ3段階）。
export const QUESTION_COUNT_VALUES = ["3", "5", "10"];
// プレイヤー1人・1問あたりの「もう一度聞く」上限（本人指示）。
export const MAX_REPLAY_COUNT_PER_QUESTION = 3;

export function defaultSettings() {
  return {
    questionCountValue: "5",
    categoryFilterValue: "title-track",
    playDurationValue: "1",
    answerPoolSizeValue: "10",
  };
}

// 【2026-09-14改訂・本人指示：カテゴリ変更時も選択状態は保持するが出題対象外の曲は
// 出題しない】js/battleModes/timeAttackBattleMode.jsと同じ考え方（詳細はそちらのコメント
// 参照）。共同選曲の選択状態（settings.questionSource.songIds）自体は書き換えず、
// ここで現在のcategoryFilterValueに合う曲だけへ絞り込んだ結果だけを返す。
function resolveSettingsSongPoolIds(settings) {
  if (settings.questionSource) {
    if (settings.questionSource.type === "collaborativeSelection") {
      return filterSongIdsByCategory(sanitizeSongIds(settings.questionSource.songIds ?? []), settings.categoryFilterValue);
    }
    return resolveSongPool(settings.questionSource);
  }
  return resolveSongPool({ type: "category", categoryFilterValue: settings.categoryFilterValue });
}

export function resolveSettingsSongPool(settings) {
  return resolveSettingsSongPoolIds(settings);
}

// 【2026-08-27新設パターンを踏襲】このモードで「そもそも出題対象になりうる全曲ID」。
export function resolveAllEligibleSongIds() {
  return sanitizeSongIds(SONGS.map((song) => song.id));
}

// songPool（曲ID配列）のうち、js/data/audioMetadata.jsの固定durationSecを持たない曲を返す。
// randomPlaybackBattleMode.jsと全く同じ理由：全端末で同じ再生開始位置を計算するには、
// 実機の音源長ではなく固定値が必須。
function findSongIdsMissingFixedDuration(songPool) {
  return songPool.filter((songId) => AUDIO_METADATA[songId]?.durationSec === undefined);
}

function resolveSongTitles(songIds) {
  return songIds.map((songId) => SONGS.find((song) => song.id === songId)?.title ?? songId);
}

export function validateSettings(settings) {
  const songPoolIds = resolveSettingsSongPoolIds(settings);

  // 【2026-08-27パターンを踏襲】共同選曲がまだ0曲の一時状態は、設定の保存自体はエラーにしない。
  if (settings.questionSource?.type === "collaborativeSelection" && songPoolIds.length === 0) {
    return null;
  }

  if (songPoolIds.length < MIN_SONGS_REQUIRED) {
    return "曲数が足りません。出題範囲を広げてください。";
  }
  const sizeCheck = validateSongPoolForQuestionCount(songPoolIds, settings.questionCountValue);
  if (!sizeCheck.ok) {
    return `選択した曲は${sizeCheck.currentCount}曲です。${sizeCheck.requiredCount}問を出題するには${sizeCheck.requiredCount}曲以上必要です。`;
  }

  const missingSongIds = findSongIdsMissingFixedDuration(songPoolIds);
  if (missingSongIds.length > 0) {
    const missingTitles = resolveSongTitles(missingSongIds);
    return `一部の曲で再生位置データが未生成のため、一瞬バトルを開始できません（${missingTitles.join("、")}）。対象範囲を変更するか、音源データの生成をやり直してください。`;
  }
  return null;
}

// seed・settingsから、全端末で完全に一致する問題セット（{song, answerPool}[]）を組み立てる。
// 再生開始位置はここでは計算しない（js/onlineInstantBattleScreen.js側が、seed・songId・
// questionIndexから再生の瞬間に計算する。js/main.jsのrandomPosition系と同じ役割分担）。
// 【2026-09-09改訂・本人指示：音源再生失敗時の公平性対策】reserveCountを渡すと、
// 出題数（questionCount）に加えて、その分だけ余分な曲も同じ決定論的な乱数列から
// 続けて確保する。全端末が同じseedから同じ計算をするため、予備曲の並びも全員一致する
// （このモードは各自が独立して進行するため、予備曲を使うかどうか自体は各端末の判断で
// よく、他プレイヤーと同期する必要が無い）。戻り値の並びは
// [出題する曲...questionCount件, 予備の曲...reserveCount件]。省略時（reserveCount未指定）は
// 今までと完全に同じ挙動（予備なし）。
// 【2026-09-14追加・本人指示：出題曲プールと回答選択肢プールの完全分離】曲指定
// （questionSource）で出題対象（poolSongs）が絞られていても、回答候補
// （distractorPoolSongs）は「現在のカテゴリ条件全体」から選ぶ。questionSourceが無い、
// またはALL_SONGS/CATEGORY型の場合は元々poolSongsと同じ集合になるため既存動作に影響しない。
export function buildQuestions({ seed, settings, reserveCount = 0 }) {
  const songPoolIds = resolveSettingsSongPoolIds(settings);
  const poolSongs = songPoolIds.map((songId) => SONGS.find((song) => song.id === songId)).filter((song) => song !== undefined);
  const distractorPoolSongs = filterSongsByCategory(SONGS, settings.categoryFilterValue);
  const questionCount = resolveQuestionCount(settings.questionCountValue, poolSongs.length);
  const extendedCount = Math.min(questionCount + reserveCount, poolSongs.length);

  const random = createSeededRandom(seed);
  const questionSongs = pickQuestionSongs(poolSongs, extendedCount, random);

  return questionSongs.map((song, questionIndex) => {
    const answerPoolRandom = createAnswerPoolRandom(seed, song.id, questionIndex);
    let answerPool = generateAnswerPool(distractorPoolSongs, song.id, settings.answerPoolSizeValue, answerPoolRandom);
    const validation = validateLyricsQuizQuestionAnswerPool({ song, answerPool });
    if (!validation.ok) {
      answerPool = buildFallbackAnswerPool(distractorPoolSongs, song.id, settings.answerPoolSizeValue) ?? [];
    }
    // isReserve: このモードの出題数（questionCount）を超えた、音源再生失敗時の差し替え専用の
    // 予備曲かどうか。reserveCountを渡さない既存の呼び出し元では常にfalseになるだけで、
    // {song, answerPool}を前提にする既存コードには一切影響しない追加プロパティ。
    return { song, answerPool, isReserve: questionIndex >= questionCount };
  });
}

// 1人分のプレイ結果。common.replayCountは、この結果同士の比較（compareResults）専用の
// 新フィールド（Firebase Rules側もresults/{uid}/common/replayCountとして追加済み）。
// 【2026-09-12追加・本人指示：結果画面の問題別結果アコーディオンを完成させる】
// perQuestionSnapshotの扱いはjs/battleModes/timeAttackBattleMode.jsのcreateResult()と同じ
// （省略時は今までと完全に同じ結果オブジェクトのまま）。
export function createResult({ correctCount, missCount, totalElapsedMs, totalReplayCount, completed, perQuestionSnapshot }) {
  return {
    completed,
    common: { elapsedMs: totalElapsedMs, correctCount, missCount, replayCount: totalReplayCount },
    detail: {},
    ...(perQuestionSnapshot ? { perQuestionSnapshot } : {}),
  };
}

// 順位判定（本人指示）：①正解数が多い順、②合計再視聴回数が少ない順。回答タイムは使わない。
export function compareResults(resultA, resultB) {
  const a = resultA.common;
  const b = resultB.common;
  if (a.correctCount !== b.correctCount) return b.correctCount - a.correctCount;
  return (a.replayCount ?? 0) - (b.replayCount ?? 0);
}

export function getRuleDescription() {
  return "正解数が多い人が上位。同数の場合は「もう一度聞く」の合計回数が少ない人が上位です";
}
