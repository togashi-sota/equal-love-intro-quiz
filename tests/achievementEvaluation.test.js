// js/achievementEvaluation.jsの恒久テスト。DOM・localStorageに一切触れない純粋関数のみを対象にする。
import {
  normalizeQuizClearResult,
  isCleanClear,
  evaluateNoMissTierAchievements,
  evaluateModeMasterAchievements,
  evaluateSpeedAchievements,
  evaluateHintAchievements,
  evaluateCompositeAchievements,
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
      buildResult({ modeId: "lyricsQuiz", questionCountValue: "all", correctCount: 81 })
    ),
    ["song_master"],
    "歌詞クイズ全曲ノーミスで歌マスター"
  );
  assertEqual(
    evaluateModeMasterAchievements(
      buildResult({ modeId: "randomPlayback", questionCountValue: "20", correctCount: 20 })
    ),
    [],
    "全曲モードでなければフルコーラスマスターを取得しない"
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
      })
    ),
    ["lyric_master"],
    "歌詞クイズ全問ヒント1でリリックマスター"
  );
  assertEqual(
    evaluateHintAchievements(
      buildResult({
        modeId: "lyricsQuiz",
        questionCountValue: "all",
        correctCount: 3,
        maxHintLevelByQuestion: [1, 2, 1],
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
      })
    ),
    [],
    "表示をヒント1へ戻しても最大到達2ならリリックマスターを取得しない"
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

  // ---- isCleanClear単体 ----
  assertEqual(isCleanClear(buildResult({ correctCount: 5, wrongCount: 0, skippedCount: 0 })), true, "全問正解はクリーンクリア");
  assertEqual(isCleanClear(buildResult({ correctCount: 0, wrongCount: 0, skippedCount: 0 })), false, "0問はクリーンクリアではない（totalQuestions>0が必要）");
  assertEqual(
    isCleanClear(buildResult({ correctCount: 4, wrongCount: 0, skippedCount: 0, completed: false })),
    false,
    "LOVE連チャン等で途中終了(completed:false)はクリーンクリアではない"
  );
}
