// js/playHistory.js（全モード共通プレイ履歴のデータ層）のテスト。
// js/tests/timeAttackHistory.test.jsと同じ方針：実際のlocalStorageを使い、各テスト区画の
// 前後でキーをremoveItemして独立させる（プレイヤー未切替時のキー名をそのまま使う）。

import {
  savePlayHistoryEntry,
  savePlayHistoryEntryIfNew,
  getNativePlayHistoryEntries,
  clearNativePlayHistoryEntries,
  MAX_PLAY_HISTORY_ENTRIES,
  adaptIntroHistoryEntry,
  adaptTimeAttackHistoryEntry,
  getUnifiedPlayHistoryEntries,
  filterUnifiedPlayHistoryEntries,
  describeEntrySummaryLines,
  describeEntryDetailFields,
  computeUnifiedHistorySummary,
  HISTORY_FILTER_CATEGORY,
  HISTORY_FILTER_ORDER,
} from "../js/playHistory.js";
import { saveHistoryEntry, clearHistoryEntries } from "../js/history.js";
import { saveTimeAttackHistoryEntry, clearTimeAttackHistoryEntries } from "../js/timeAttackHistory.js";
import { assertEqual } from "./test-utils.js";

const NATIVE_KEY = "equalLoveIntroQuiz.unifiedPlayHistory";

function buildIntroEntry(overrides) {
  return {
    modeId: "randomPlayback",
    modeLabel: "ランダム再生クイズ",
    questionCount: 10,
    isAllSongsMode: true,
    correctCount: 8,
    wrongCount: 2,
    skippedCount: null,
    score: null,
    averageResponseMs: null,
    completed: true,
    details: { rule: "normal", totalElapsedMs: 30000, isNewRecord: false },
    ...overrides,
  };
}

// 最低限のgameStateもどきから、通常イントロクイズ1件を実際にhistory.js経由で保存する
// （history.jsの保存形式そのものは変更していないことの裏付けも兼ねる）。
function saveRealIntroEntry(overrides) {
  const gameState = {
    questionCountValue: "5",
    categoryFilterValue: "all",
    score: 40,
    answerLog: [
      { song: { id: "song-a" }, resultType: "correct", elapsedMs: 1000, pointsEarned: 10 },
      { song: { id: "song-b" }, resultType: "correct", elapsedMs: 1200, pointsEarned: 10 },
      { song: { id: "song-c" }, resultType: "wrong", elapsedMs: null, pointsEarned: 0 },
      { song: { id: "song-d" }, resultType: "correct", elapsedMs: 800, pointsEarned: 10 },
      { song: { id: "song-e" }, resultType: "correct", elapsedMs: 1500, pointsEarned: 10 },
    ],
  };
  const playResult = { totalQuestions: 5, correctCount: 4, averageCorrectElapsedMs: 1125 };
  return saveHistoryEntry(gameState, playResult, {
    rank: "A",
    isNewRecord: false,
    titleEvents: [],
    ...overrides,
  });
}

export function runPlayHistoryTests() {
  // ===== savePlayHistoryEntry / getNativePlayHistoryEntries / clearNativePlayHistoryEntries =====
  localStorage.removeItem(NATIVE_KEY);
  {
    const saved = savePlayHistoryEntry(buildIntroEntry());
    assertEqual(typeof saved.id === "string" && saved.id.length > 0, true, "savePlayHistoryEntry()はidを自動採番する");
    const entries = getNativePlayHistoryEntries();
    assertEqual(entries.length, 1, "保存した1件がそのまま読み取れる");
    assertEqual(entries[0].modeId, "randomPlayback", "保存した内容が正しく反映されている");

    savePlayHistoryEntry(buildIntroEntry({ modeId: "lyricsQuiz" }));
    const entriesAfterSecond = getNativePlayHistoryEntries();
    assertEqual(entriesAfterSecond.length, 2, "2件目を保存すると合計2件になる");
    assertEqual(entriesAfterSecond[0].modeId, "lyricsQuiz", "新しい順（先頭が最新）で並ぶ");

    clearNativePlayHistoryEntries();
    assertEqual(getNativePlayHistoryEntries(), [], "clearNativePlayHistoryEntries()で空になる");
  }
  localStorage.removeItem(NATIVE_KEY);

  // ===== 最大件数での切り捨て =====
  {
    for (let i = 0; i < MAX_PLAY_HISTORY_ENTRIES + 5; i += 1) {
      savePlayHistoryEntry(buildIntroEntry({ modeId: `entry-${i}` }));
    }
    const entries = getNativePlayHistoryEntries();
    assertEqual(entries.length, MAX_PLAY_HISTORY_ENTRIES, `最大件数(${MAX_PLAY_HISTORY_ENTRIES}件)を超えると古いものが切り捨てられる`);
    assertEqual(entries[0].modeId, `entry-${MAX_PLAY_HISTORY_ENTRIES + 4}`, "残るのは最新のものから");
  }
  localStorage.removeItem(NATIVE_KEY);

  // ===== savePlayHistoryEntryIfNew（オンライン対戦のmatchId重複防止） =====
  {
    const first = savePlayHistoryEntryIfNew({ id: "online:match-1", ...buildIntroEntry({ modeId: "onlineTimeAttack" }) });
    assertEqual(first, true, "初回保存はtrueを返す");
    assertEqual(getNativePlayHistoryEntries().length, 1, "1件保存される");

    const second = savePlayHistoryEntryIfNew({ id: "online:match-1", ...buildIntroEntry({ modeId: "onlineTimeAttack" }) });
    assertEqual(second, false, "同じidの2回目はfalseを返す（保存しない）");
    assertEqual(getNativePlayHistoryEntries().length, 1, "同じmatchIdは重複保存されず1件のまま");

    const differentMatch = savePlayHistoryEntryIfNew({ id: "online:match-2", ...buildIntroEntry({ modeId: "onlineTimeAttack" }) });
    assertEqual(differentMatch, true, "異なるidなら新規保存される");
    assertEqual(getNativePlayHistoryEntries().length, 2, "異なるmatchIdは2件目として保存される");
  }
  localStorage.removeItem(NATIVE_KEY);

  // ===== adaptIntroHistoryEntry（既存history.jsの保存形式は変更していないことの確認込み） =====
  localStorage.removeItem("equalLoveIntroQuiz.playHistory");
  {
    const rawEntry = saveRealIntroEntry();
    assertEqual(rawEntry.questionCount, 5, "history.js側は今までどおりの形で保存される（回帰確認）");

    const adapted = adaptIntroHistoryEntry(rawEntry);
    assertEqual(adapted.modeId, "intro", "adaptIntroHistoryEntry()はmodeId:'intro'になる");
    assertEqual(adapted.questionCount, 5, "questionCountがそのまま引き継がれる");
    assertEqual(adapted.correctCount, 4, "correctCountがそのまま引き継がれる");
    assertEqual(adapted.wrongCount, 1, "wrongCountはquestionCount-correctCountで計算される");
    assertEqual(adapted.isAllSongsMode, true, "categoryFilterValue:'all'はisAllSongsMode:trueになる");
    assertEqual(adapted.completed, true, "通常イントロは常にcompleted:true");
    assertEqual(adapted.id.startsWith("intro:"), true, "idは他のソースと衝突しないよう'intro:'で始まる");
  }
  clearHistoryEntries();

  // ===== adaptTimeAttackHistoryEntry（variant別のmodeId振り分け） =====
  localStorage.removeItem("equalLoveIntroQuiz.timeAttackHistory");
  {
    const introVariant = saveTimeAttackHistoryEntry({
      rule: "normal", questionCountValue: "10", categoryFilterValue: "all",
      totalElapsedMs: 20000, correctCount: 10, missCount: 0, completed: true,
      failedAtQuestionNumber: null, isNewRecord: true, perQuestionResults: [],
    });
    const adaptedIntro = adaptTimeAttackHistoryEntry(introVariant);
    assertEqual(adaptedIntro.modeId, "timeAttack", "variant省略（=intro）はmodeId:'timeAttack'になる");
    assertEqual(adaptedIntro.wrongCount, 0, "wrongCountはmissCountがそのまま入る");
    assertEqual(adaptedIntro.details.isNewRecord, true, "detailsに新記録フラグが残る");

    const randomVariant = saveTimeAttackHistoryEntry({
      rule: "hard", questionCountValue: "all", categoryFilterValue: "title-track",
      totalElapsedMs: 15000, correctCount: 22, missCount: 3, completed: false,
      failedAtQuestionNumber: 22, isNewRecord: false,
      perQuestionResults: Array.from({ length: 22 }, (_, i) => ({ questionNumber: i + 1 })),
      variant: "randomPlayback",
    });
    const adaptedRandom = adaptTimeAttackHistoryEntry(randomVariant);
    assertEqual(adaptedRandom.modeId, "timeAttackRandomPlayback", "variant:'randomPlayback'は専用のmodeIdになる");
    assertEqual(adaptedRandom.questionCount, 22, "questionCountValue:'all'のときは実際の問題数(questions.length)を使う");
    assertEqual(adaptedRandom.completed, false, "未完了(LOVE連チャン失敗等)はcompleted:falseのまま引き継がれる");
  }
  clearTimeAttackHistoryEntries();

  // ===== getUnifiedPlayHistoryEntries（3ストア統合・新しい順ソート） =====
  localStorage.removeItem(NATIVE_KEY);
  localStorage.removeItem("equalLoveIntroQuiz.playHistory");
  localStorage.removeItem("equalLoveIntroQuiz.timeAttackHistory");
  {
    saveRealIntroEntry();
    saveTimeAttackHistoryEntry({
      rule: "normal", questionCountValue: "5", categoryFilterValue: "all",
      totalElapsedMs: 10000, correctCount: 5, missCount: 0, completed: true,
      failedAtQuestionNumber: null, isNewRecord: false, perQuestionResults: [],
    });
    savePlayHistoryEntry(buildIntroEntry());

    const unified = getUnifiedPlayHistoryEntries();
    assertEqual(unified.length, 3, "3つの保存先の合計件数が返る（1+1+1）");
    const sortedCopy = [...unified].sort((a, b) => b.playedAt - a.playedAt);
    assertEqual(
      unified.map((e) => e.id),
      sortedCopy.map((e) => e.id),
      "playedAtの新しい順に並んでいる"
    );
    const modeIds = unified.map((e) => e.modeId).sort();
    assertEqual(modeIds, ["intro", "randomPlayback", "timeAttack"].sort(), "3種類のモードがすべて含まれる");
  }
  clearHistoryEntries();
  clearTimeAttackHistoryEntries();
  clearNativePlayHistoryEntries();

  // ===== filterUnifiedPlayHistoryEntries =====
  {
    const entries = [
      { modeId: "intro" },
      { modeId: "timeAttack" },
      { modeId: "timeAttackRandomPlayback" },
      { modeId: "randomPlayback" },
      { modeId: "lyricsQuiz" },
      { modeId: "localBattle" },
      { modeId: "onlineTimeAttack" },
      { modeId: "onlineRandomPlayback" },
      { modeId: "onlineLyricsQuiz" },
      { modeId: "weakSongs" },
      { modeId: "customQuiz" },
    ];
    assertEqual(filterUnifiedPlayHistoryEntries(entries, "all").length, 11, "'all'は絞り込まない");
    assertEqual(
      filterUnifiedPlayHistoryEntries(entries, "intro").map((e) => e.modeId),
      ["intro", "weakSongs", "customQuiz"],
      "'intro'フィルターはintro・weakSongs・customQuizをまとめる"
    );
    assertEqual(
      filterUnifiedPlayHistoryEntries(entries, "timeAttack").map((e) => e.modeId),
      ["timeAttack", "timeAttackRandomPlayback"],
      "'timeAttack'フィルターは通常・ランダム再生variantの両方を含む"
    );
    assertEqual(
      filterUnifiedPlayHistoryEntries(entries, "battle").map((e) => e.modeId),
      ["localBattle", "onlineTimeAttack", "onlineRandomPlayback", "onlineLyricsQuiz"],
      "'battle'フィルターはローカル対戦・オンライン対戦3種をまとめる（本人指示）"
    );
    // すべてのmodeIdがどこかのフィルターに属していることの網羅チェック。
    entries.forEach((entry) => {
      assertEqual(
        HISTORY_FILTER_ORDER.includes(HISTORY_FILTER_CATEGORY[entry.modeId]),
        true,
        `modeId:"${entry.modeId}"はいずれかのフィルターに属している`
      );
    });
  }

  // ===== describeEntrySummaryLines（一覧カード用の要約行、モードごとの出し分け） =====
  {
    const introLines = describeEntrySummaryLines(
      buildIntroEntry({ modeId: "intro", score: 40, questionCount: 5, correctCount: 4 })
    );
    assertEqual(introLines.length >= 1, true, "イントロの要約は最低1行返る");
    assertEqual(introLines.some((line) => line.includes("4/5問正解")), true, "正解数/問題数が要約に含まれる");

    const dnfEntry = buildIntroEntry({
      modeId: "onlineTimeAttack",
      correctCount: null,
      wrongCount: null,
      completed: false,
      details: { rule: "normal", myRank: null, participantCount: 2 },
    });
    const dnfLines = describeEntrySummaryLines(dnfEntry);
    assertEqual(dnfLines.some((line) => line.includes("DNF")), true, "DNF（未完了）のオンライン対戦は要約にDNFと表示される");

    const lyricsBattleEntry = buildIntroEntry({
      modeId: "onlineLyricsQuiz",
      score: 80,
      completed: true,
      details: { battleRuleId: "steal", myRank: 2, participantCount: 3 },
    });
    const lyricsBattleLines = describeEntrySummaryLines(lyricsBattleEntry);
    // 【2026-09-06修正】3ルール全面改修（本人指示）で表示名が奪い取り→早押しバトルへ
    // 変更されたのに、このテストの期待値だけ更新し忘れていた（js/playHistory.jsの
    // LYRICS_BATTLE_RULE_LABELS参照。実装は既に正しく「早押しバトル」を返しており、
    // 今回のユニットテスト全件実行で本来の実装と食い違っていたこの1件だけが発覚した）。
    assertEqual(
      lyricsBattleLines.some((line) => line.includes("早押しバトル")),
      true,
      "オンライン歌詞対戦の要約にルール名（早押しバトル）が表示される"
    );
    assertEqual(lyricsBattleLines.some((line) => line.includes("80pt")), true, "スコアが要約に表示される");

    // ===== 2026-09-15追加：途中退出（isVoluntaryLeave）はDNF・通常完走のいずれとも
    // 明確に区別され、順位・勝敗として表示されないことを確認する。 =====
    const voluntaryLeaveTimeAttack = buildIntroEntry({
      modeId: "onlineInstantBattle",
      correctCount: 3,
      wrongCount: 1,
      completed: false,
      details: { rule: "hard", myRank: null, participantCount: 2, isVoluntaryLeave: true, isDnf: false },
    });
    const voluntaryLeaveLines = describeEntrySummaryLines(voluntaryLeaveTimeAttack);
    assertEqual(
      voluntaryLeaveLines.some((line) => line.includes("途中退出")),
      true,
      "途中退出（共有エンジン系）は要約に「途中退出」と表示される"
    );
    assertEqual(
      voluntaryLeaveLines.some((line) => line.includes("DNF")),
      false,
      "途中退出は通信エラー等のDNFとは違う文言で表示される（DNFという文字列を含まない）"
    );
    assertEqual(
      voluntaryLeaveLines.some((line) => /🥇|🥈|🥉|\d+位/.test(line)),
      false,
      "途中退出は順位（メダル・◯位）としては一切表示されない"
    );

    const voluntaryLeaveLyrics = buildIntroEntry({
      modeId: "onlineLyricsQuiz",
      score: 12,
      completed: false,
      details: { battleRuleId: "combo", myRank: null, participantCount: 3, isVoluntaryLeave: true, isDnf: false },
    });
    const voluntaryLeaveLyricsLines = describeEntrySummaryLines(voluntaryLeaveLyrics);
    assertEqual(
      voluntaryLeaveLyricsLines.some((line) => line.includes("途中退出")),
      true,
      "途中退出（歌詞クイズ）も要約に「途中退出」と表示される"
    );
    assertEqual(
      voluntaryLeaveLyricsLines.some((line) => /🥇|🥈|🥉|\d+位/.test(line)),
      false,
      "途中退出（歌詞クイズ）も順位としては表示されない"
    );

    const voluntaryLeaveCoop = buildIntroEntry({
      modeId: "onlineInstantCoop",
      questionCount: 3,
      correctCount: 2,
      completed: false,
      details: { memberCount: 2, isVoluntaryLeave: true, isDnf: false },
    });
    const voluntaryLeaveCoopLines = describeEntrySummaryLines(voluntaryLeaveCoop);
    assertEqual(
      voluntaryLeaveCoopLines.some((line) => line.includes("途中退出")),
      true,
      "途中退出（一瞬協力）も要約に「途中退出」と表示される"
    );
    assertEqual(
      voluntaryLeaveCoopLines.some((line) => line.includes("正解！")),
      false,
      "途中退出（一瞬協力）は完走時の「正解！」という祝福文言では表示されない"
    );

    // 通常のDNF（本人の意思ではない）は、途中退出とは別の文言のまま維持されていることの回帰確認。
    assertEqual(
      dnfLines.some((line) => line.includes("途中退出")),
      false,
      "通常のDNF（details.isVoluntaryLeave無し）は「途中退出」という文言にはならない（回帰確認）"
    );
  }

  // ===== describeEntryDetailFields（存在しない項目は出さない） =====
  {
    const minimalEntry = {
      playedAt: Date.now(),
      modeLabel: "テストモード",
      questionCount: null,
      isAllSongsMode: null,
      correctCount: null,
      wrongCount: null,
      skippedCount: null,
      score: null,
      averageResponseMs: null,
      details: {},
    };
    const fields = describeEntryDetailFields(minimalEntry);
    const labels = fields.map((f) => f.label);
    assertEqual(labels.includes("問題数"), false, "questionCountがnullなら「問題数」の行自体が無い");
    assertEqual(labels.includes("正解数"), false, "correctCountがnullなら「正解数」の行自体が無い");
    assertEqual(labels.includes("日時"), true, "日時は常に存在する");
    assertEqual(labels.includes("モード"), true, "モードは常に存在する");

    const fullEntry = buildIntroEntry({
      questionCount: 10,
      correctCount: 8,
      wrongCount: 2,
      skippedCount: 0,
      score: 50,
      averageResponseMs: 1500,
      playedAt: Date.now(),
      modeLabel: "テストモード",
    });
    const fullFields = describeEntryDetailFields(fullEntry);
    const fullLabels = fullFields.map((f) => f.label);
    assertEqual(fullLabels.includes("問題数"), true, "値がある項目は表示される");
    assertEqual(fullLabels.includes("正解数"), true, "正解数も表示される");
    assertEqual(fullLabels.includes("平均回答時間"), true, "平均回答時間も表示される");

    // ===== 2026-09-15追加：途中退出は詳細モーダルの「あなたの順位」欄でも、
    // 順位・DNFのいずれとも異なる専用の文言になり、myRank（null）を順位として
    // 表示しないことを確認する。 =====
    const voluntaryLeaveEntry = buildIntroEntry({
      questionCount: 5,
      correctCount: 2,
      wrongCount: 1,
      details: { rule: "normal", myRank: null, participantCount: 2, isVoluntaryLeave: true, isDnf: false },
    });
    const voluntaryLeaveFields = describeEntryDetailFields(voluntaryLeaveEntry);
    const myRankField = voluntaryLeaveFields.find((f) => f.label === "あなたの順位");
    assertEqual(myRankField !== undefined, true, "途中退出でも「あなたの順位」の行自体は表示される");
    assertEqual(myRankField.value.includes("途中退出"), true, "途中退出の順位欄には「途中退出」という文言が入る");
    assertEqual(myRankField.value.includes("DNF"), false, "途中退出の順位欄はDNFという文言にはならない");
    assertEqual(/🥇|🥈|🥉|\d+位/.test(myRankField.value), false, "途中退出の順位欄は実際の順位番号・メダルにはならない");

    // 通常のDNF（isVoluntaryLeave無し）は、既存どおり「途中終了（DNF）」のまま
    // であることの回帰確認。
    const dnfDetailEntry = buildIntroEntry({
      correctCount: null,
      wrongCount: null,
      details: { rule: "normal", myRank: null, participantCount: 2, isDnf: true },
    });
    const dnfDetailFields = describeEntryDetailFields(dnfDetailEntry);
    const dnfRankField = dnfDetailFields.find((f) => f.label === "あなたの順位");
    assertEqual(dnfRankField.value, "途中終了（DNF）", "通常のDNFは既存の文言のまま変わらない（回帰確認）");
  }

  // ===== computeUnifiedHistorySummary（DNF等のnullを正答率計算から除外する） =====
  {
    const summaryEntries = [
      { correctCount: 8, questionCount: 10 },
      { correctCount: 4, questionCount: 5 },
      { correctCount: null, questionCount: null }, // DNF等
    ];
    const summary = computeUnifiedHistorySummary(summaryEntries);
    assertEqual(summary.totalPlayCount, 3, "総プレイ回数はnullの記録も含めて数える");
    assertEqual(summary.totalQuestionCount, 15, "総回答数はnullの記録を除いて合計する（10+5）");
    assertEqual(summary.overallAccuracy, 12 / 15, "全体正答率もnullの記録を除いて計算する");
    assertEqual(computeUnifiedHistorySummary([]).overallAccuracy, null, "1件も無ければ正答率はnull");
  }
}
