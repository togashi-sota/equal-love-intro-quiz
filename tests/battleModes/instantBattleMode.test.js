// js/battleModes/instantBattleMode.jsのテスト（2026-08-30新設、本人指示：19-3章「一瞬バトル」）。
//
// 【確認したいこと】
// ・buildQuestions()が、同じseed・settingsから毎回まったく同じ問題セット（曲順・回答候補の
//   並び順まで）を返すこと（全端末で問題が一致するための必須条件）。
// ・compareResults()が「正解数が多い順→合計再視聴回数が少ない順」で並び、回答タイム
//   （elapsedMs）を一切見ないこと（本人指示）。
// ・validateSettings()が、曲数不足・durationSec未生成の曲混入を正しく拒否すること
//   （randomPlaybackBattleMode.jsと同じ設計方針の踏襲確認）。

import {
  gameMode,
  label,
  playbackType,
  defaultSettings,
  validateSettings,
  buildQuestions,
  createResult,
  compareResults,
  resolveSettingsSongPool,
} from "../../js/battleModes/instantBattleMode.js";
import { QUESTION_SOURCE_TYPE } from "../../js/questionSource.js";
import { AUDIO_METADATA } from "../../js/data/audioMetadata.js";
import { assertEqual } from "../test-utils.js";

export function runInstantBattleModeTests() {
  assertEqual(gameMode, "instantBattle", "gameModeは'instantBattle'");
  assertEqual(label, "一瞬バトル", "表示名は「一瞬バトル」");
  assertEqual(playbackType, "instant", "playbackTypeは'instant'");

  const settings = { ...defaultSettings(), questionCountValue: "5", answerPoolSizeValue: "10" };

  // ---- buildQuestions：同じseedなら完全に同じ問題セットになる（決定論性） ----
  {
    const questionsA = buildQuestions({ seed: 12345, settings });
    const questionsB = buildQuestions({ seed: 12345, settings });
    assertEqual(questionsA.length, 5, "questionCountValue通りの問題数になる");
    assertEqual(
      questionsA.map((q) => q.song.id),
      questionsB.map((q) => q.song.id),
      "同じseedなら曲の並び順まで完全に一致する"
    );
    assertEqual(
      questionsA.map((q) => q.answerPool.map((s) => s.id)),
      questionsB.map((q) => q.answerPool.map((s) => s.id)),
      "同じseedなら回答候補の並び順まで完全に一致する"
    );
    questionsA.forEach((q) => {
      assertEqual(
        q.answerPool.some((choice) => choice.id === q.song.id),
        true,
        "回答候補には必ず正解曲が含まれる"
      );
    });
  }

  // ---- buildQuestions：seedが違えば違う結果になりうる ----
  {
    const questionsA = buildQuestions({ seed: 1, settings });
    const questionsC = buildQuestions({ seed: 999999, settings });
    const isSameOrder = questionsA.every((q, i) => q.song.id === questionsC[i].song.id);
    assertEqual(isSameOrder, false, "seedが違えば曲順は基本的に変わる（同じになる確率は極めて低い）");
  }

  // ---- compareResults：正解数が多い順 ----
  {
    const resultA = createResult({ correctCount: 4, missCount: 1, totalElapsedMs: 999999, totalReplayCount: 10, completed: true });
    const resultB = createResult({ correctCount: 3, missCount: 2, totalElapsedMs: 1, totalReplayCount: 0, completed: true });
    assertEqual(compareResults(resultA, resultB) < 0, true, "正解数が多い方が上位（回答タイムが遅くても関係ない）");
  }

  // ---- compareResults：正解数が同じなら合計再視聴回数が少ない順 ----
  {
    const resultA = createResult({ correctCount: 3, missCount: 2, totalElapsedMs: 1, totalReplayCount: 5, completed: true });
    const resultB = createResult({ correctCount: 3, missCount: 2, totalElapsedMs: 999999, totalReplayCount: 2, completed: true });
    assertEqual(compareResults(resultA, resultB) > 0, true, "正解数が同じなら再視聴回数が少ない方が上位（回答タイムが速くても関係ない）");
  }

  // ---- compareResults：正解数・再視聴回数とも同じなら同着（0） ----
  {
    const resultA = createResult({ correctCount: 3, missCount: 2, totalElapsedMs: 1, totalReplayCount: 2, completed: true });
    const resultB = createResult({ correctCount: 3, missCount: 2, totalElapsedMs: 999999, totalReplayCount: 2, completed: true });
    assertEqual(compareResults(resultA, resultB), 0, "正解数・再視聴回数が同じなら同着");
  }

  // ---- compareResults：本人指定の具体例（A/B/Cの3人）で最終順位を確認 ----
  // A：8問正解・再視聴5回、B：8問正解・再視聴2回、C：7問正解・再視聴0回
  // → 期待される順位：1位B、2位A、3位C（正解数が同じA・Bは再視聴回数の少ないBが上位。
  //   Cは再視聴0回でもAB両方より正解数が少ないため3位のまま）。
  {
    const resultA = createResult({ correctCount: 8, missCount: 0, totalElapsedMs: 1000, totalReplayCount: 5, completed: true });
    const resultB = createResult({ correctCount: 8, missCount: 0, totalElapsedMs: 1000, totalReplayCount: 2, completed: true });
    const resultC = createResult({ correctCount: 7, missCount: 1, totalElapsedMs: 1000, totalReplayCount: 0, completed: true });
    const entries = [
      { name: "A", result: resultA },
      { name: "B", result: resultB },
      { name: "C", result: resultC },
    ];
    entries.sort((entryA, entryB) => compareResults(entryA.result, entryB.result));
    assertEqual(
      entries.map((entry) => entry.name),
      ["B", "A", "C"],
      "本人指定の具体例どおり、1位B・2位A・3位Cの順になる"
    );
  }

  // ---- resolveSettingsSongPool：カテゴリー絞り込み・共同選曲どちらも解決できる ----
  {
    const pool = resolveSettingsSongPool({
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: ["love", "存在しない曲id"] },
    });
    assertEqual(pool, ["love"], "resolveSettingsSongPoolは実在しない曲idを除いて解決する");
  }

  const enoughRealSongIds = ["love", "start", "zurui-yo-zurui-ne", "kioku-no-dokoka-de", "bokura-no-seifuku-christmas"];

  // ---- validateSettings：曲数が十分・durationSecも揃っていればOK ----
  {
    const result = validateSettings({
      ...settings,
      questionCountValue: "3",
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: enoughRealSongIds },
    });
    assertEqual(result, null, "曲数・durationSecが揃っていれば対戦を開始できる（エラーなし）");
  }

  // ---- validateSettings：曲数が出題数に足りない ----
  {
    const result = validateSettings({
      ...settings,
      questionCountValue: "10",
      questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: enoughRealSongIds },
    });
    assertEqual(typeof result === "string" && result.length > 0, true, "曲数が出題数に足りない場合はエラー文を返す");
  }

  // ---- validateSettings：durationSecを持たない曲が混ざっていれば拒否する ----
  // 【outroBattleMode.test.jsと同じ理由】AUDIO_METADATAを一時的に書き換えて境界ケースを再現し、
  // テスト後は必ず元に戻す。
  {
    const targetSongId = "love";
    const originalMetadata = AUDIO_METADATA[targetSongId];
    AUDIO_METADATA[targetSongId] = { outroStartSec: originalMetadata.outroStartSec };
    try {
      const result = validateSettings({
        ...settings,
        questionCountValue: "3",
        questionSource: { type: QUESTION_SOURCE_TYPE.MANUAL_SELECTION, songIds: enoughRealSongIds },
      });
      assertEqual(
        typeof result === "string" && result.includes("＝LOVE"),
        true,
        "durationSecが無い曲が混ざっていると、その曲名を含むエラー文を返す"
      );
    } finally {
      AUDIO_METADATA[targetSongId] = originalMetadata;
    }
  }

  // ---- 2026-09-05追加（本人指示）：questionSourceのモード間残留バグの回帰確認 ----
  // 「歌詞クイズ対戦を遊んだ後に一瞬バトルへモード変更すると、他モードから引き継がれた
  // 『誰も編集できない、曲数0件のcollaborativeSelection』が原因で再戦がブロックされる」
  // 不具合の修正（js/battleModes/index.jsのsupportsManualSongSelection()新設）に伴い、
  // 一瞬バトル自身のresolveSettingsSongPool()・validateSettings()の既存動作
  // （questionSourceが実際に渡された場合はそのまま尊重する）が変わっていないことを確認する
  // （修正はモード変更時の引き継ぎ側で行っており、このモード自身の判定ロジックは
  // 意図的に変更していないため）。
  {
    // 他モードから引き継がれた「曲数0件」のcollaborativeSelectionが渡された場合、
    // 一瞬バトル自身は今までどおり空配列を返す（＝呼び出し元が「曲が選ばれていない」と
    // 正しく検出できる。本人指示のシナリオE：曲を選んで出題を本当に選択していて曲数が
    // 0件の場合は、引き続き正しくエラーになるべき）。
    const leakedSettings = {
      ...settings,
      questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: [] },
    };
    assertEqual(
      resolveSettingsSongPool(leakedSettings),
      [],
      "questionSourceがcollaborativeSelectionで曲数0件なら、一瞬バトルの曲プールは空配列になる（今回の修正で挙動を変えていない）"
    );
    // 【validateSettings()自体は0曲をエラーにしない、既存の仕様】共同選曲がまだ0曲の
    // 「選択中」状態は、ロビーでの設定保存自体はエラーにしない設計になっている
    // （instantBattleMode.js内のコメント「共同選曲がまだ0曲の一時状態は、設定の保存自体は
    // エラーにしない」参照）。実際に「出題する曲が選ばれていません」という利用者向けの
    // エラーになるのは、対戦開始直前のjs/onlineBattle.jsのresolveBattleStartValidation()
    // （resolvedSongPool.length === 0の分岐）であり、そちらはFirebase接続を伴うため
    // tests/questionSourceModeLeakage.test.jsのソース構造確認で別途カバーしている。
    assertEqual(
      validateSettings(leakedSettings),
      null,
      "曲数0件のcollaborativeSelectionは、一瞬バトルのvalidateSettings()単体では（既存仕様どおり）エラーにしない"
    );
  }
}
