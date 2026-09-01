// js/battleModes/timeAttackBattleMode.jsの、resolveSettingsSongPool()のテスト
// （2026-08-26新設。オンライン対戦の共通曲＝intersection判定
// 〈js/onlineBattleSongAvailability.js〉が、対戦開始直前に「絞り込む前の出題対象」を
// 知るために追加した関数）。
//
// 【何を確認したいか】この関数は既存の内部ロジック（validateSettings・buildQuestions内部で
// 元々使っていたresolveQuestionSourceSongPool）を、外部から呼べる形に切り出しただけで、
// 判定内容自体は変更していない。そのため「questionSourceの種類ごとに、既存の出題ロジックと
// 同じ曲プールが返ること」を確認する（新しいロジックを追加検証するのではなく、
// 既存の挙動を壊していないことの回帰防止テスト）。

import { resolveSettingsSongPool, validateSettings, buildQuestions } from "../../js/battleModes/timeAttackBattleMode.js";
import { QUESTION_SOURCE_TYPE, resolveSongPool } from "../../js/questionSource.js";
import { SONGS } from "../../js/data/songs.js";
import { assertEqual } from "../test-utils.js";

export function runTimeAttackBattleModeTests() {
  // ---- questionSourceが無い（レガシー：categoryFilterValueのみ）場合 ----
  {
    const pool = resolveSettingsSongPool({ categoryFilterValue: "title-track" });
    assertEqual(
      pool,
      resolveSongPool({ type: QUESTION_SOURCE_TYPE.CATEGORY, categoryFilterValue: "title-track" }),
      "questionSource省略時は、categoryFilterValueをresolveSongPool()に通した結果と一致する"
    );
    assertEqual(pool.length > 0, true, "表題曲カテゴリの絞り込み結果は1曲以上ある");
  }

  // ---- questionSource: manualSelection（本人が直接選んだ曲） ----
  {
    const existingIds = SONGS.slice(0, 3).map((song) => song.id);
    const pool = resolveSettingsSongPool({
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: [...existingIds, "存在しない曲id"] },
    });
    assertEqual(pool, existingIds, "manualSelectionは、実在しない曲idを除いた上でsongIdsを解決する");
  }

  // ---- questionSource: collaborativeSelection（オンライン共同選曲・確定済みsongIds） ----
  {
    // 【本人確認済みの仕様】collaborativeSelectionは、Firebase書き込み時点で既にサニタイズ
    // 済みという前提のため、resolveSongPool()を経由せずsongIdsをそのまま使う
    // （js/battleModes/timeAttackBattleMode.js内のコメント参照）。
    const songIds = ["song-a", "song-b"];
    const pool = resolveSettingsSongPool({
      questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds },
    });
    assertEqual(pool, songIds, "collaborativeSelectionはsongIdsをサニタイズせずそのまま返す");
  }

  // ---- questionSource: allSongs ----
  {
    const pool = resolveSettingsSongPool({ questionSource: { type: QUESTION_SOURCE_TYPE.ALL_SONGS } });
    assertEqual(pool.length, SONGS.length, "allSongsは全曲分のIDを返す");
  }

  // ---- validateSettings：共同選曲(collaborativeSelection)の0曲は、ロビーでの
  // 設定保存自体はエラーにしない（2026-08-27新設。本人指示：「曲を選んで出題」へ
  // 切り替えた直後、まだ誰も選んでいない一時的な状態を安全に保存できるようにする）。
  {
    const baseSettings = { questionCountValue: "5", rule: "normal", penaltySeconds: 2 };
    assertEqual(
      validateSettings({ ...baseSettings, questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: [] } }),
      null,
      "共同選曲が0曲でも、設定の保存自体はエラーにならない（開始できるかは別途startBattle()側が判定する）"
    );
    // 曲が実際に選ばれていれば、今までどおり出題数に対する不足チェックは働く
    // （MIN_SONGS_REQUIRED=4は満たしつつ、questionCountValueには足りない曲数にする）。
    assertEqual(
      validateSettings({
        ...baseSettings,
        questionCountValue: "10",
        questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: ["a", "b", "c", "d"] },
      }),
      "選択した曲は4曲です。10問を出題するには10曲以上必要です。",
      "共同選曲で曲が選ばれている場合は、今までどおり出題数に対する不足チェックが働く"
    );
  }

  // ---- buildQuestions：reserveCount（2026-09-12新設・本人指示：共有クイズエンジンの
  // 音源再生失敗対策）。randomPlaybackBattleMode.js・outroBattleMode.jsはこの関数を
  // そのまま再エクスポートしているため、ここでの確認がその2モード分も兼ねる。 ----
  {
    const settings = { questionCountValue: "5", categoryFilterValue: "title-track", rule: "normal", penaltySeconds: 2 };

    // reserveCountを渡さない（省略時）は、今までと完全に同じ挙動のまま。
    const withoutReserve = buildQuestions({ seed: "seed-a", settings });
    assertEqual(withoutReserve.length, 5, "reserveCount省略時は出題数ぶんだけの問題が返る");
    assertEqual(
      withoutReserve.every((question) => question.isReserve === false),
      true,
      "reserveCount省略時はisReserveが全問false"
    );

    // reserveCountを渡すと、出題数に予備を加えた件数が返り、後半だけisReserve:trueになる。
    const withReserve = buildQuestions({ seed: "seed-a", settings, reserveCount: 3 });
    assertEqual(withReserve.length, 8, "reserveCountを渡すと出題数(5)+予備(3)件が返る");
    assertEqual(
      withReserve.slice(0, 5).every((question) => question.isReserve === false),
      true,
      "先頭の出題数ぶんはisReserve:false"
    );
    assertEqual(
      withReserve.slice(5).every((question) => question.isReserve === true),
      true,
      "末尾の予備ぶんはisReserve:true"
    );
    assertEqual(
      withReserve.slice(0, 5).map((question) => question.song.id),
      withoutReserve.map((question) => question.song.id),
      "同じseedなら、本番の出題部分（先頭の出題数ぶん）はreserveCountの有無に関わらず完全に一致する（全端末が同じ本番の曲を引く公平性のため）"
    );

    // 同じseedなら、予備曲の並びも毎回同じになる（全端末が同じ予備曲を引けることの確認）。
    const withReserveAgain = buildQuestions({ seed: "seed-a", settings, reserveCount: 3 });
    assertEqual(
      withReserve.map((question) => question.song.id),
      withReserveAgain.map((question) => question.song.id),
      "同じseed・同じreserveCountなら、予備曲を含めて毎回同じ並びになる"
    );

    // 出題数(questionCount)+reserveCountが曲プールの総数を超える場合、プールの曲数で頭打ちになる
    // （instantBattleMode.jsのbuildQuestions()と同じ安全策）。
    const hugeReserve = buildQuestions({ seed: "seed-a", settings, reserveCount: 9999 });
    const pool = resolveSettingsSongPool(settings);
    assertEqual(hugeReserve.length, pool.length, "reserveCountが大きすぎても、曲プールの総数を超えない");
  }
}
