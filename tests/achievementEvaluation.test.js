// js/achievementEvaluation.jsの恒久テスト。DOM・localStorageに一切触れない純粋関数のみを対象にする。
//
// 【2026-08-14全面改訂】称号体系の最終仕様（本人・ChatGPT確認済み）に合わせて全面的に書き直した。
//   ・ブロンズ/シルバー/ゴールド/プラチナ廃止（成長段階系と完全重複していたため）
//   ・成長段階系（イントロ/シャッフル/リリック）は5/10/20問のカスケードに加え、
//     「本当の全曲」マスター達成時にも3段階すべてを自動取得するようになった
//   ・「全曲」の定義が、questionCountValue==="all"だけでなく、categoryFilterValue==="all"
//     （カテゴリー絞り込みなし）も同時に要求するよう厳格化された（isUnrestrictedFullPool）
import {
  normalizeQuizClearResult,
  isCleanClear,
  isUnrestrictedFullPool,
  evaluateNoMissMasterAchievement,
  evaluateModeMasterAchievements,
  evaluateSpeedAchievements,
  evaluateHintAchievements,
  evaluateCompositeAchievements,
  evaluateGrowthTierAchievements,
  evaluateDirectAchievements,
} from "../js/achievementEvaluation.js";
import { ACHIEVEMENTS } from "../js/achievementDefinitions.js";
import { assertEqual } from "./test-utils.js";

// テストを短く書くための組み立てヘルパー。デフォルトは「カテゴリー絞り込みなし・5問・全問正解」。
// categoryFilterValueのデフォルトを"all"にしているのは、questionCountValue:"all"を指定するテストの
// 大半が「本当の全曲」を意図しているため（カテゴリー絞り込みを試したいテストだけ明示的に上書きする）。
function buildResult(overrides) {
  return normalizeQuizClearResult({
    modeId: "intro",
    questionCountValue: "5",
    categoryFilterValue: "all",
    correctCount: 5,
    wrongCount: 0,
    skippedCount: 0,
    completed: true,
    averageResponseMs: null,
    maxHintLevelByQuestion: null,
    ...overrides,
  });
}

export function runAchievementEvaluationTests() {
  // ==================================================================
  // 1. isUnrestrictedFullPool（「本当の全曲」共通判定関数）
  // ==================================================================
  // 固定の曲数を一切参照しない、文字列比較だけの純粋関数であることの確認
  // （新曲・新音源・新歌詞が追加されても、この関数自体は変更不要という設計の裏付け）。
  assertEqual(
    isUnrestrictedFullPool({ categoryFilterValue: "all", questionCountValue: "all" }),
    true,
    "カテゴリー全曲・出題数全曲＝本当の全曲"
  );
  assertEqual(
    isUnrestrictedFullPool({ categoryFilterValue: "title-track", questionCountValue: "all" }),
    false,
    "「表題曲のみ」＋出題数allは、本当の全曲ではない"
  );
  assertEqual(
    isUnrestrictedFullPool({ categoryFilterValue: "title-and-group", questionCountValue: "all" }),
    false,
    "「表題曲＋全員曲」＋出題数allも、本当の全曲ではない"
  );
  assertEqual(
    isUnrestrictedFullPool({ categoryFilterValue: "all", questionCountValue: "20" }),
    false,
    "カテゴリー全曲でも、出題数が20問固定なら本当の全曲ではない"
  );
  assertEqual(
    isUnrestrictedFullPool({ categoryFilterValue: null, questionCountValue: "all" }),
    false,
    "categoryFilterValue省略（null）は本当の全曲として扱わない（安全側）"
  );

  // ==================================================================
  // 2. ノーミスマスター（イントロ系。旧ブロンズ〜プラチナは廃止）
  // ==================================================================
  assertEqual(
    evaluateNoMissMasterAchievement(buildResult({ questionCountValue: "all" })),
    ["no_miss_master"],
    "カテゴリー絞り込みなしの全曲ノーミスでノーミスマスターを獲得"
  );
  assertEqual(
    evaluateNoMissMasterAchievement(
      buildResult({ questionCountValue: "all", categoryFilterValue: "title-track" })
    ),
    [],
    "「表題曲のみ」＋全曲では、ノーミスマスターを獲得できない"
  );
  assertEqual(
    evaluateNoMissMasterAchievement(buildResult({ questionCountValue: "20" })),
    [],
    "20問固定では、カテゴリーを絞っていなくてもノーミスマスターを獲得できない"
  );
  assertEqual(
    evaluateNoMissMasterAchievement(
      buildResult({ questionCountValue: "all", correctCount: 4, wrongCount: 1, skippedCount: 0 })
    ),
    [],
    "1問でも誤答があればノーミスマスターを獲得できない"
  );
  assertEqual(
    evaluateNoMissMasterAchievement(buildResult({ modeId: "timeAttack", questionCountValue: "all" })),
    ["no_miss_master"],
    "タイムアタックでもノーミスマスターを獲得できる"
  );
  assertEqual(
    evaluateNoMissMasterAchievement(buildResult({ modeId: "randomPlayback", questionCountValue: "all" })),
    [],
    "ランダム再生クイズはノーミスマスターの対象外"
  );

  // ==================================================================
  // 3. 表マスター（フルコーラスマスター・歌マスター）
  // ==================================================================
  assertEqual(
    evaluateModeMasterAchievements(buildResult({ modeId: "randomPlayback", questionCountValue: "all" })),
    ["full_chorus_master"],
    "ランダム再生・カテゴリー絞り込みなしの全曲ノーミスでフルコーラスマスター"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "randomPlayback", questionCountValue: "all", categoryFilterValue: "title-and-group" })
    ),
    [],
    "「表題曲＋全員曲」＋全曲では、フルコーラスマスターを獲得できない"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "all", answerPoolSizeValue: "all" })
    ),
    ["song_master"],
    "歌詞クイズ・カテゴリー絞り込みなし・回答候補allの全曲ノーミスで歌マスター"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({
        modeId: "lyricsQuiz",
        questionCountValue: "all",
        categoryFilterValue: "title-track",
        answerPoolSizeValue: "all",
      })
    ),
    [],
    "歌詞クイズも、カテゴリーを絞った状態では歌マスターを獲得できない"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "all", answerPoolSizeValue: "4" })
    ),
    [],
    "歌詞クイズ全曲ノーミスでも、回答候補が4択なら歌マスターを取得しない"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "all", answerPoolSizeValue: "50" })
    ),
    [],
    "回答候補50択でも、all（全曲検索）でなければ歌マスターを取得しない"
  );

  // ==================================================================
  // 4. 複合称号：＝LOVEマスター・＝LOVE完全制覇
  // ==================================================================
  assertEqual(
    evaluateCompositeAchievements(
      new Set(["no_miss_master", "full_chorus_master", "song_master"]),
      ACHIEVEMENTS
    ),
    ["equal_love_master"],
    "表3称号で＝LOVEマスター"
  );
  assertEqual(
    evaluateCompositeAchievements(new Set(["no_miss_master", "full_chorus_master"]), ACHIEVEMENTS),
    [],
    "表2称号だけでは＝LOVEマスターを取得しない"
  );
  assertEqual(
    evaluateCompositeAchievements(
      new Set(["lightning_fast", "melody_ace", "lyric_master"]),
      ACHIEVEMENTS
    ),
    ["equal_love_complete"],
    "裏3称号で＝LOVE完全制覇"
  );
  assertEqual(
    evaluateCompositeAchievements(new Set(["lightning_fast", "melody_ace"]), ACHIEVEMENTS),
    [],
    "裏2称号だけでは＝LOVE完全制覇を取得しない"
  );
  assertEqual(
    evaluateCompositeAchievements(
      new Set(["no_miss_master", "full_chorus_master", "song_master", "equal_love_master"]),
      ACHIEVEMENTS
    ),
    [],
    "すでに達成済みの複合称号は再度返さない"
  );

  // ==================================================================
  // 5. 裏称号：電光石火・メロディアス（平均回答時間、境界値1.70秒）
  // ==================================================================
  assertEqual(
    evaluateSpeedAchievements(buildResult({ questionCountValue: "all", averageResponseMs: 1700 })),
    ["lightning_fast"],
    "平均1.7秒ちょうどで電光石火"
  );
  assertEqual(
    evaluateSpeedAchievements(buildResult({ questionCountValue: "all", averageResponseMs: 1701 })),
    [],
    "平均1.701秒で電光石火を取得しない"
  );
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({ modeId: "timeAttack", questionCountValue: "all", averageResponseMs: 1500 })
    ),
    ["lightning_fast"],
    "タイムアタックでも電光石火を取得可能"
  );
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({ modeId: "randomPlayback", questionCountValue: "all", averageResponseMs: 1200 })
    ),
    ["melody_ace"],
    "ランダム再生平均1.7秒以内でメロディアス"
  );
  assertEqual(
    evaluateSpeedAchievements(buildResult({ questionCountValue: "20", averageResponseMs: 1000 })),
    [],
    "20問固定では電光石火を取得しない"
  );
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({ questionCountValue: "all", categoryFilterValue: "title-track", averageResponseMs: 1000 })
    ),
    [],
    "カテゴリーを絞った状態では電光石火を取得しない"
  );

  // ==================================================================
  // 6. 裏称号：リリックマスター（ヒント段階）
  // ==================================================================
  assertEqual(
    evaluateHintAchievements(
      buildResult({
        modeId: "lyricsQuiz",
        questionCountValue: "all",
        correctCount: 3,
        maxHintLevelByQuestion: [1, 1, 1],
        answerPoolSizeValue: "all",
      })
    ),
    ["lyric_master"],
    "歌詞クイズ全問ヒント1・回答候補all・カテゴリー絞り込みなしでリリックマスター"
  );
  assertEqual(
    evaluateHintAchievements(
      buildResult({
        modeId: "lyricsQuiz",
        questionCountValue: "all",
        categoryFilterValue: "title-track",
        correctCount: 3,
        maxHintLevelByQuestion: [1, 1, 1],
        answerPoolSizeValue: "all",
      })
    ),
    [],
    "カテゴリーを絞った状態ではリリックマスターを取得しない"
  );
  assertEqual(
    evaluateHintAchievements(
      buildResult({
        modeId: "lyricsQuiz",
        questionCountValue: "all",
        correctCount: 3,
        maxHintLevelByQuestion: [1, 2, 1],
        answerPoolSizeValue: "all",
      })
    ),
    [],
    "1問でもヒント2へ到達したら取得しない"
  );
  assertEqual(
    evaluateHintAchievements(
      buildResult({
        modeId: "lyricsQuiz",
        questionCountValue: "all",
        correctCount: 3,
        // 表示だけヒント1へ戻しても、「到達した最大ヒント段階」は2のまま渡ってくる想定
        // （js/lyricsQuizScreen.jsのhintsUsedCount仕様）。このテストはその値をそのまま
        // 信頼して判定していることを確認する。
        maxHintLevelByQuestion: [2, 1, 1],
        answerPoolSizeValue: "all",
      })
    ),
    [],
    "表示をヒント1へ戻しても最大到達2ならリリックマスターを取得しない"
  );
  assertEqual(
    evaluateHintAchievements(
      buildResult({
        modeId: "lyricsQuiz",
        questionCountValue: "all",
        correctCount: 3,
        maxHintLevelByQuestion: [1, 1, 1],
        answerPoolSizeValue: "10",
      })
    ),
    [],
    "全問ヒント1でも、回答候補が10択ならリリックマスターを取得しない"
  );

  // ==================================================================
  // 7. 成長段階系（イントロ/シャッフル/リリック）：5/10/20問カスケード
  // ==================================================================
  const GROWTH_CASES = [
    { modeId: "intro", ids: ["intro_beginner", "intro_challenger", "intro_ace"], label: "イントロ" },
    { modeId: "timeAttack", ids: ["intro_beginner", "intro_challenger", "intro_ace"], label: "イントロ（タイムアタック）" },
    { modeId: "randomPlayback", ids: ["shuffle_beginner", "shuffle_challenger", "shuffle_ace"], label: "シャッフル" },
    {
      modeId: "timeAttackRandomPlayback",
      ids: ["shuffle_beginner", "shuffle_challenger", "shuffle_ace"],
      label: "シャッフル（タイムアタック）",
    },
    { modeId: "lyricsQuiz", ids: ["lyric_beginner", "lyric_challenger", "lyric_ace"], label: "リリック" },
  ];
  const GROWTH_QUESTION_COUNTS = ["5", "10", "20"];

  GROWTH_CASES.forEach(({ modeId, ids, label }) => {
    GROWTH_QUESTION_COUNTS.forEach((questionCountValue, tierIndex) => {
      const expectedIds = ids.slice(0, tierIndex + 1);
      assertEqual(
        evaluateGrowthTierAchievements(
          buildResult({ modeId, questionCountValue, correctCount: Number(questionCountValue) })
        ),
        expectedIds,
        `${label}: ${questionCountValue}問オールクリアで${expectedIds.join("・")}を獲得`
      );
      assertEqual(
        evaluateGrowthTierAchievements(
          buildResult({
            modeId,
            questionCountValue,
            correctCount: Number(questionCountValue) - 1,
            wrongCount: 1,
          })
        ),
        [],
        `${label}: ${questionCountValue}問中1問ミスでは成長段階称号を獲得しない`
      );
    });

    // ---- 2026-08-14追加：本当の全曲マスター達成時は3段階すべてを自動取得する ----
    assertEqual(
      evaluateGrowthTierAchievements(buildResult({ modeId, questionCountValue: "all" })),
      ids,
      `${label}: 本当の全曲ノーミス達成で3段階すべて（${ids.join("・")}）を同時取得する`
    );
    assertEqual(
      evaluateGrowthTierAchievements(
        buildResult({ modeId, questionCountValue: "all", categoryFilterValue: "title-track" })
      ),
      [],
      `${label}: カテゴリーを絞った状態の全曲では、成長段階系マスター連動を発生させない（5/10/20の厳密一致にも当てはまらないため）`
    );
  });

  // カテゴリー・回答方式は判定に一切使われない（normalizeQuizClearResultの引数に無い＝
  // 条件式が参照できない）ため、常に「自由」であることは構造的に保証されている。
  assertEqual(
    evaluateGrowthTierAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "5", correctCount: 5, answerPoolSizeValue: "4" })
    ),
    ["lyric_beginner"],
    "リリックビギナーは回答候補4択でも獲得できる（回答方式自由）"
  );
  assertEqual(
    evaluateGrowthTierAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "5", categoryFilterValue: "title-track", correctCount: 5 })
    ),
    ["lyric_beginner"],
    "リリックビギナーはカテゴリーを絞っていても獲得できる（カテゴリー自由、5/10/20の厳密一致のケース）"
  );

  // LOVE連チャン等、ミス後にゲームが続くモードでも、その回でミスがあった時点でcompleted:falseに
  // なる（js/timeAttackScreen.jsのrunFailed仕様）ため、20問目まで表示上は進んでいても
  // エースは付与されない（本人指示の worked example: ○○○×○○○○○○ → 付与しない）。
  assertEqual(
    evaluateGrowthTierAchievements(
      buildResult({
        modeId: "timeAttack",
        questionCountValue: "20",
        correctCount: 9,
        wrongCount: 1,
        skippedCount: 0,
        completed: false,
      })
    ),
    [],
    "LOVE連チャン等で途中ミス（completed:false）なら20問中9問時点でもイントロエースを獲得しない"
  );

  // ランダム再生クイズはノーミスマスターの対象外だが、成長段階系（シャッフル系）は
  // 独立した仕組みのため対象になる（既存の対象モード制限を壊していないことの確認）。
  assertEqual(
    evaluateNoMissMasterAchievement(buildResult({ modeId: "randomPlayback", questionCountValue: "all" })),
    [],
    "ランダム再生クイズは既存どおりノーミスマスターの対象外のまま"
  );
  assertEqual(
    evaluateGrowthTierAchievements(buildResult({ modeId: "randomPlayback", questionCountValue: "5", correctCount: 5 })),
    ["shuffle_beginner"],
    "ランダム再生クイズでもシャッフルビギナー（成長段階系）は獲得できる"
  );

  // 既存称号（ノーミスマスター等）が、成長段階系の追加によって壊れていないことの確認。
  // 【2026-08-14更新】ブロンズ廃止により、5問ノーミスでは成長段階系のみが解放される
  // （全曲マスター系はここでは対象外＝questionCountValue"5"のため）。
  assertEqual(
    evaluateDirectAchievements(buildResult({ modeId: "intro", questionCountValue: "5", correctCount: 5 })),
    ["intro_beginner"],
    "イントロ5問ノーミスは、成長段階系（イントロビギナー）だけを獲得する（ブロンズ等は廃止済み）"
  );
  assertEqual(
    evaluateDirectAchievements(buildResult({ modeId: "intro", questionCountValue: "all" })),
    ["intro_beginner", "intro_challenger", "intro_ace", "no_miss_master"],
    "イントロ・本当の全曲ノーミスは、成長段階系3つとノーミスマスターを同時に獲得する（不自然な欠落がない）"
  );

  // ==================================================================
  // 8. isCleanClear単体
  // ==================================================================
  assertEqual(isCleanClear(buildResult({ correctCount: 5, wrongCount: 0, skippedCount: 0 })), true, "全問正解はクリーンクリア");
  assertEqual(isCleanClear(buildResult({ correctCount: 0, wrongCount: 0, skippedCount: 0 })), false, "0問はクリーンクリアではない（totalQuestions>0が必要）");
  assertEqual(
    isCleanClear(buildResult({ correctCount: 4, wrongCount: 0, skippedCount: 0, completed: false })),
    false,
    "LOVE連チャン等で途中終了(completed:false)はクリーンクリアではない"
  );
}
