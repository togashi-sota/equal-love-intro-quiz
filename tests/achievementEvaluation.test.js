// js/achievementEvaluation.jsの恒久テスト。DOM・localStorageに一切触れない純粋関数のみを対象にする。
import {
  normalizeQuizClearResult,
  isCleanClear,
  evaluateNoMissTierAchievements,
  evaluateModeMasterAchievements,
  evaluateSpeedAchievements,
  evaluateHintAchievements,
  evaluateCompositeAchievements,
  evaluateGrowthTierAchievements,
  evaluateDirectAchievements,
} from "../js/achievementEvaluation.js";
import { ACHIEVEMENTS } from "../js/achievementDefinitions.js";
import { assertEqual } from "./test-utils.js";

// テストを短く書くための組み立てヘルパー。デフォルトは「全問正解・誤答/未回答なし」。
function buildResult(overrides) {
  return normalizeQuizClearResult({
    modeId: "intro",
    questionCountValue: "5",
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
  // ---- ノーミス段階称号（イントロクイズ/タイムアタック） ----
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ questionCountValue: "5", correctCount: 5 })),
    ["no_miss_bronze"],
    "5問ノーミスでブロンズ"
  );
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ questionCountValue: "10", correctCount: 10 })),
    ["no_miss_bronze", "no_miss_silver"],
    "10問ノーミスでブロンズ＋シルバー"
  );
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ questionCountValue: "20", correctCount: 20 })),
    ["no_miss_bronze", "no_miss_silver", "no_miss_gold"],
    "20問ノーミスでブロンズ＋シルバー＋ゴールド"
  );
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ questionCountValue: "50", correctCount: 50 })),
    ["no_miss_bronze", "no_miss_silver", "no_miss_gold", "no_miss_platinum"],
    "50問ノーミスで4段階すべて"
  );
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ questionCountValue: "all", correctCount: 81 })),
    ["no_miss_bronze", "no_miss_silver", "no_miss_gold", "no_miss_platinum", "no_miss_master"],
    "全曲ノーミスで全段階＋ノーミスマスター"
  );
  assertEqual(
    evaluateNoMissTierAchievements(
      buildResult({ questionCountValue: "5", correctCount: 4, wrongCount: 1 })
    ),
    [],
    "誤答1回でノーミス称号を取得しない"
  );
  assertEqual(
    evaluateNoMissTierAchievements(
      buildResult({ questionCountValue: "5", correctCount: 4, skippedCount: 1 })
    ),
    [],
    "未回答1回でノーミス称号を取得しない"
  );
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ modeId: "intro", questionCountValue: "5", correctCount: 5 })),
    ["no_miss_bronze"],
    "イントロクイズでノーミス称号を取得可能"
  );
  assertEqual(
    evaluateNoMissTierAchievements(
      buildResult({ modeId: "timeAttack", questionCountValue: "5", correctCount: 5 })
    ),
    ["no_miss_bronze"],
    "タイムアタックでノーミス称号を取得可能"
  );
  assertEqual(
    evaluateNoMissTierAchievements(
      buildResult({ modeId: "randomPlayback", questionCountValue: "5", correctCount: 5 })
    ),
    [],
    "ランダム再生クイズはノーミス段階称号の対象外"
  );
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ questionCountValue: "7", correctCount: 7 })),
    [],
    "5/10/20/50/all以外の出題数はノーミス段階称号の対象外"
  );

  // ---- 表マスター（フルコーラスマスター・歌マスター） ----
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "randomPlayback", questionCountValue: "all", correctCount: 81 })
    ),
    ["full_chorus_master"],
    "ランダム再生全曲ノーミスでフルコーラスマスター"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "all", correctCount: 81, answerPoolSizeValue: "all" })
    ),
    ["song_master"],
    "歌詞クイズ全曲・回答候補allのノーミスで歌マスター"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "randomPlayback", questionCountValue: "20", correctCount: 20 })
    ),
    [],
    "全曲モードでなければフルコーラスマスターを取得しない"
  );
  // 【2026-08-13追加・本人指示】歌マスターは回答候補も最も難しいall設定が必須。
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "all", correctCount: 81, answerPoolSizeValue: "4" })
    ),
    [],
    "歌詞クイズ全曲ノーミスでも、回答候補が4択なら歌マスターを取得しない"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "all", correctCount: 81, answerPoolSizeValue: "50" })
    ),
    [],
    "回答候補50択でも、all（全曲から探す）でなければ歌マスターを取得しない"
  );

  // ---- 複合称号：＝LOVEマスター ----
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

  // ---- 裏称号：電光石火・メロディアス（平均回答時間） ----
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({ modeId: "intro", questionCountValue: "all", correctCount: 81, averageResponseMs: 1700 })
    ),
    ["lightning_fast"],
    "平均1.7秒ちょうどで電光石火"
  );
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({ modeId: "intro", questionCountValue: "all", correctCount: 81, averageResponseMs: 1701 })
    ),
    [],
    "平均1.701秒で電光石火を取得しない"
  );
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({ modeId: "timeAttack", questionCountValue: "all", correctCount: 81, averageResponseMs: 1500 })
    ),
    ["lightning_fast"],
    "タイムアタックでも電光石火を取得可能"
  );
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({
        modeId: "randomPlayback",
        questionCountValue: "all",
        correctCount: 81,
        averageResponseMs: 1200,
      })
    ),
    ["melody_ace"],
    "ランダム再生平均1.7秒以内でメロディアス"
  );
  assertEqual(
    evaluateSpeedAchievements(
      buildResult({ modeId: "intro", questionCountValue: "20", correctCount: 20, averageResponseMs: 1000 })
    ),
    [],
    "全曲モードでなければ電光石火を取得しない"
  );

  // ---- 裏称号：リリックマスター（ヒント段階） ----
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
    "歌詞クイズ全問ヒント1・回答候補allでリリックマスター"
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
  // 【2026-08-13追加・本人指示】リリックマスターも回答候補allが必須。
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

  // ---- 裏3称号で＝LOVE完全制覇 ----
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

  // ---- 成長段階系（イントロ/シャッフル/リリック、2026-08-13追加） ----
  // 5/10/20問オールクリアで付与・1問ミスで付与されないことを、3系統×3段階すべてで確認する。
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
  });

  // カテゴリー・回答方式は判定に一切使われない（normalizeQuizClearResultの引数に無い＝
  // 条件式が参照できない）ため、常に「自由」であることは構造的に保証されている。
  // 歌詞クイズの回答候補数（answerPoolSizeValue）を変えても、成長段階系は影響を受けないことを確認する。
  assertEqual(
    evaluateGrowthTierAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "5", correctCount: 5, answerPoolSizeValue: "4" })
    ),
    ["lyric_beginner"],
    "リリックビギナーは回答候補4択でも獲得できる（回答方式自由）"
  );
  assertEqual(
    evaluateGrowthTierAchievements(
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "5", correctCount: 5, answerPoolSizeValue: "all" })
    ),
    ["lyric_beginner"],
    "リリックビギナーは回答候補allでも同様に獲得できる（回答方式自由）"
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

  // ランダム再生クイズはノーミス段階称号（no_miss_*）の対象外だが、成長段階系（シャッフル系）は
  // 独立した仕組みのため対象になる（既存のnoMiss制限を壊していないことの確認）。
  assertEqual(
    evaluateNoMissTierAchievements(buildResult({ modeId: "randomPlayback", questionCountValue: "5", correctCount: 5 })),
    [],
    "ランダム再生クイズは既存のノーミス段階称号（no_miss_*）の対象外のまま"
  );
  assertEqual(
    evaluateGrowthTierAchievements(buildResult({ modeId: "randomPlayback", questionCountValue: "5", correctCount: 5 })),
    ["shuffle_beginner"],
    "ランダム再生クイズでもシャッフルビギナー（成長段階系）は獲得できる"
  );

  // 既存称号（ノーミス段階・表マスター等）が、成長段階系の追加によって壊れていないことの確認。
  assertEqual(
    evaluateDirectAchievements(buildResult({ modeId: "intro", questionCountValue: "5", correctCount: 5 })),
    ["intro_beginner", "no_miss_bronze"],
    "イントロ5問ノーミスは、成長段階系（イントロビギナー）と既存のノーミス段階（ブロンズ）を同時に獲得する（重複や欠落がない）"
  );

  // ---- isCleanClear単体 ----
  assertEqual(isCleanClear(buildResult({ correctCount: 5, wrongCount: 0, skippedCount: 0 })), true, "全問正解はクリーンクリア");
  assertEqual(isCleanClear(buildResult({ correctCount: 0, wrongCount: 0, skippedCount: 0 })), false, "0問はクリーンクリアではない（totalQuestions>0が必要）");
  assertEqual(
    isCleanClear(buildResult({ correctCount: 4, wrongCount: 0, skippedCount: 0, completed: false })),
    false,
    "LOVE連チャン等で途中終了(completed:false)はクリーンクリアではない"
  );
}
