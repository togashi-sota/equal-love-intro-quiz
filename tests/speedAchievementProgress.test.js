// js/speedAchievementProgress.js（電光石火・メロディアスへの進捗計算）のテスト。
// しきい値はSPEED_THRESHOLD_MSを直接importして使い、1700をテスト側にベタ書きしない
// （本人指示と同じ方針：将来しきい値が変わってもテストが追従する）。
import {
  describeSpeedProgressForPlay,
  computeBestSpeedProgress,
} from "../js/speedAchievementProgress.js";
import { SPEED_THRESHOLD_MS } from "../js/achievementEvaluation.js";
import { saveHistoryEntry, clearHistoryEntries } from "../js/history.js";
import { saveTimeAttackHistoryEntry, clearTimeAttackHistoryEntries } from "../js/timeAttackHistory.js";
import { savePlayHistoryEntry, clearNativePlayHistoryEntries } from "../js/playHistory.js";
import { assertEqual } from "./test-utils.js";

function buildIntroGameState(overrides) {
  return {
    questionCountValue: "5",
    categoryFilterValue: "all",
    score: 50,
    answerLog: [
      { song: { id: "song-a" }, resultType: "correct", elapsedMs: 1000, pointsEarned: 10 },
      { song: { id: "song-b" }, resultType: "correct", elapsedMs: 1200, pointsEarned: 10 },
      { song: { id: "song-c" }, resultType: "correct", elapsedMs: 1400, pointsEarned: 10 },
      { song: { id: "song-d" }, resultType: "correct", elapsedMs: 800, pointsEarned: 10 },
      { song: { id: "song-e" }, resultType: "correct", elapsedMs: 1100, pointsEarned: 10 },
    ],
    ...overrides,
  };
}

export function runSpeedAchievementProgressTests() {
  // ===== describeSpeedProgressForPlay =====
  {
    // 対象外のmodeId
    assertEqual(
      describeSpeedProgressForPlay({ modeId: "lyricsQuiz", isAllSongsMode: true, isCleanClear: true, averageResponseMs: 1000 }),
      null,
      "対象外のmodeId（歌詞クイズ等）はnullを返す"
    );

    // 5/10/20/50問モードでは称号への距離を出さない
    const notAllSongs = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: false,
      isCleanClear: true,
      averageResponseMs: 1000,
    });
    assertEqual(notAllSongs.status, "not-applicable", "全曲モードでないときはnot-applicable");

    // データなし
    const noData = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: true,
      isCleanClear: true,
      averageResponseMs: null,
    });
    assertEqual(noData.status, "no-data", "averageResponseMsがnullならno-data");

    // ノーミスでない・速度未達
    const notCleanSlow = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: true,
      isCleanClear: false,
      averageResponseMs: SPEED_THRESHOLD_MS + 350,
    });
    assertEqual(notCleanSlow.status, "needs-clean-clear", "ノーミスでなければneeds-clean-clear");
    assertEqual(notCleanSlow.speedConditionMet, false, "速度未達のときはspeedConditionMet:false");

    // ノーミスでない・速度は達成済み（本人指示の「平均1.55秒・ミス1」相当のケース）
    const notCleanFast = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: true,
      isCleanClear: false,
      averageResponseMs: SPEED_THRESHOLD_MS - 150,
    });
    assertEqual(notCleanFast.status, "needs-clean-clear", "速度条件を満たしていてもノーミスでなければneeds-clean-clear");
    assertEqual(notCleanFast.speedConditionMet, true, "速度条件自体はspeedConditionMet:trueになる");

    // ノーミス・全曲・条件達成（しきい値ちょうど）
    const achieved = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: true,
      isCleanClear: true,
      averageResponseMs: SPEED_THRESHOLD_MS,
    });
    assertEqual(achieved.status, "achieved", "しきい値ちょうどは条件達成（以内）");

    // ノーミス・全曲・1ms未達
    const barelyMissed = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: true,
      isCleanClear: true,
      averageResponseMs: SPEED_THRESHOLD_MS + 1,
    });
    assertEqual(barelyMissed.status, "progress", "しきい値+1msはprogress（未達）");
    assertEqual(barelyMissed.secondsRemaining, "0.00", "1msの差は表示上0.00秒になる（四捨五入）");

    // 「あと0.13秒」のケース
    const progress130ms = describeSpeedProgressForPlay({
      modeId: "intro",
      isAllSongsMode: true,
      isCleanClear: true,
      averageResponseMs: SPEED_THRESHOLD_MS + 130,
    });
    assertEqual(progress130ms.secondsRemaining, "0.13", "しきい値+130msは「あと0.13秒」");

    // タイムアタック・ランダム再生も対象modeId
    assertEqual(
      describeSpeedProgressForPlay({ modeId: "timeAttack", isAllSongsMode: true, isCleanClear: true, averageResponseMs: 1000 })
        .achievementId,
      "lightning_fast",
      "modeId:timeAttackは電光石火が対象"
    );
    assertEqual(
      describeSpeedProgressForPlay({
        modeId: "randomPlayback",
        isAllSongsMode: true,
        isCleanClear: true,
        averageResponseMs: 1000,
      }).achievementId,
      "melody_ace",
      "modeId:randomPlaybackはメロディアスが対象"
    );
    // タイムアタックのランダム再生variantは、電光石火・メロディアスどちらの対象でもない
    assertEqual(
      describeSpeedProgressForPlay({
        modeId: "timeAttackRandomPlayback",
        isAllSongsMode: true,
        isCleanClear: true,
        averageResponseMs: 1000,
      }),
      null,
      "timeAttackRandomPlaybackは速度称号の対象外"
    );
  }

  // ===== computeBestSpeedProgress（電光石火：イントロ+タイムアタック） =====
  clearHistoryEntries();
  clearTimeAttackHistoryEntries();
  {
    const noPlayYet = computeBestSpeedProgress("lightning_fast");
    assertEqual(noPlayYet.hasQualifyingPlay, false, "該当プレイが無ければhasQualifyingPlay:false");
    assertEqual(noPlayYet.bestAverageResponseMs, null, "該当プレイが無ければbestAverageResponseMs:null（推測値を出さない）");

    // 5問モード（全曲でない）は対象外
    saveHistoryEntry(
      buildIntroGameState({ questionCountValue: "5", categoryFilterValue: "title-track", score: 50 }),
      { totalQuestions: 5, correctCount: 5, averageCorrectElapsedMs: 500 },
      { rank: "S", isNewRecord: false, titleEvents: [] }
    );
    assertEqual(
      computeBestSpeedProgress("lightning_fast").hasQualifyingPlay,
      false,
      "全曲モードでないイントロ履歴は対象外（絞り込みなしでも同様）"
    );
    clearHistoryEntries();

    // 全曲だが誤答ありは対象外
    saveHistoryEntry(
      buildIntroGameState({
        answerLog: [
          { song: { id: "song-a" }, resultType: "correct", elapsedMs: 900, pointsEarned: 10 },
          { song: { id: "song-b" }, resultType: "wrong", elapsedMs: null, pointsEarned: 0 },
        ],
      }),
      { totalQuestions: 2, correctCount: 1, averageCorrectElapsedMs: 900 },
      { rank: "B", isNewRecord: false, titleEvents: [] }
    );
    assertEqual(
      computeBestSpeedProgress("lightning_fast").hasQualifyingPlay,
      false,
      "誤答がある全曲イントロ履歴は対象外"
    );
    clearHistoryEntries();

    // 全曲・ノーミスのイントロ履歴（平均900ms）
    saveHistoryEntry(
      buildIntroGameState({
        answerLog: [
          { song: { id: "song-a" }, resultType: "correct", elapsedMs: 800, pointsEarned: 10 },
          { song: { id: "song-b" }, resultType: "correct", elapsedMs: 1000, pointsEarned: 10 },
        ],
      }),
      { totalQuestions: 2, correctCount: 2, averageCorrectElapsedMs: 900 },
      { rank: "S", isNewRecord: false, titleEvents: [] }
    );
    const afterIntro = computeBestSpeedProgress("lightning_fast");
    assertEqual(afterIntro.hasQualifyingPlay, true, "全曲ノーミスのイントロ履歴が1件あれば対象になる");
    assertEqual(afterIntro.bestAverageResponseMs, 900, "平均900msが正しく反映される");

    // より速いタイムアタック（イントロ形式、全曲ノーミス、平均700ms）を追加すると更新される
    saveTimeAttackHistoryEntry({
      rule: "normal",
      questionCountValue: "all",
      categoryFilterValue: "all",
      totalElapsedMs: 1400,
      correctCount: 2,
      missCount: 0,
      completed: true,
      failedAtQuestionNumber: null,
      isNewRecord: true,
      perQuestionResults: [
        { questionNumber: 1, songId: "song-a", choices: [], correctAnswer: "a", selectedAnswers: ["a"], elapsedMs: 600, missCountThisQuestion: 0, isCorrect: true },
        { questionNumber: 2, songId: "song-b", choices: [], correctAnswer: "b", selectedAnswers: ["b"], elapsedMs: 800, missCountThisQuestion: 0, isCorrect: true },
      ],
      variant: "intro",
    });
    const afterTimeAttack = computeBestSpeedProgress("lightning_fast");
    assertEqual(afterTimeAttack.bestAverageResponseMs, 700, "より速いタイムアタック記録（平均700ms）が新しいベストになる");

    // ランダム再生variantのタイムアタックは対象外（平均100msという極端に速い記録でも影響しない）
    saveTimeAttackHistoryEntry({
      rule: "normal",
      questionCountValue: "all",
      categoryFilterValue: "all",
      totalElapsedMs: 200,
      correctCount: 2,
      missCount: 0,
      completed: true,
      failedAtQuestionNumber: null,
      isNewRecord: false,
      perQuestionResults: [
        { questionNumber: 1, songId: "song-a", choices: [], correctAnswer: "a", selectedAnswers: ["a"], elapsedMs: 100, missCountThisQuestion: 0, isCorrect: true },
        { questionNumber: 2, songId: "song-b", choices: [], correctAnswer: "b", selectedAnswers: ["b"], elapsedMs: 100, missCountThisQuestion: 0, isCorrect: true },
      ],
      variant: "randomPlayback",
    });
    assertEqual(
      computeBestSpeedProgress("lightning_fast").bestAverageResponseMs,
      700,
      "ランダム再生variantのタイムアタックはベストの計算に影響しない"
    );

    // ミスが1回でもあったタイムアタック（1問でもmistakeCount>0）は対象外
    saveTimeAttackHistoryEntry({
      rule: "normal",
      questionCountValue: "all",
      categoryFilterValue: "all",
      totalElapsedMs: 100,
      correctCount: 2,
      missCount: 0,
      completed: true,
      failedAtQuestionNumber: null,
      isNewRecord: false,
      perQuestionResults: [
        { questionNumber: 1, songId: "song-a", choices: [], correctAnswer: "a", selectedAnswers: ["a"], elapsedMs: 50, missCountThisQuestion: 1, isCorrect: true },
        { questionNumber: 2, songId: "song-b", choices: [], correctAnswer: "b", selectedAnswers: ["b"], elapsedMs: 50, missCountThisQuestion: 0, isCorrect: true },
      ],
      variant: "intro",
    });
    assertEqual(
      computeBestSpeedProgress("lightning_fast").bestAverageResponseMs,
      700,
      "消去法等で一度でも間違えた問題を含む記録はベストの計算に影響しない"
    );
  }
  clearHistoryEntries();
  clearTimeAttackHistoryEntries();

  // ===== computeBestSpeedProgress（メロディアス：ランダム再生） =====
  clearNativePlayHistoryEntries();
  {
    const noPlayYet = computeBestSpeedProgress("melody_ace");
    assertEqual(noPlayYet.hasQualifyingPlay, false, "ランダム再生も、該当プレイが無ければhasQualifyingPlay:false");

    savePlayHistoryEntry({
      playedAt: Date.now(),
      modeId: "randomPlayback",
      modeLabel: "ランダム再生クイズ",
      questionCount: 70,
      isAllSongsMode: true,
      correctCount: 70,
      wrongCount: 0,
      skippedCount: null,
      score: null,
      averageResponseMs: 1250,
      completed: true,
      details: { rule: "normal", totalElapsedMs: 90000, isNewRecord: true },
    });
    const afterRandom = computeBestSpeedProgress("melody_ace");
    assertEqual(afterRandom.hasQualifyingPlay, true, "全曲ノーミスのランダム再生履歴が対象になる");
    assertEqual(afterRandom.bestAverageResponseMs, 1250, "平均1250msが正しく反映される");

    // ミスがあるランダム再生履歴は対象外
    savePlayHistoryEntry({
      playedAt: Date.now(),
      modeId: "randomPlayback",
      modeLabel: "ランダム再生クイズ",
      questionCount: 70,
      isAllSongsMode: true,
      correctCount: 69,
      wrongCount: 1,
      skippedCount: null,
      score: null,
      averageResponseMs: 500,
      completed: true,
      details: { rule: "normal", totalElapsedMs: 50000, isNewRecord: false },
    });
    assertEqual(
      computeBestSpeedProgress("melody_ace").bestAverageResponseMs,
      1250,
      "ミスがある記録（平均500ms）はベストの計算に影響しない"
    );
  }
  clearNativePlayHistoryEntries();
}
