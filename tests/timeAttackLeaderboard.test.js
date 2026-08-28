// js/timeAttackLeaderboard.js（Firebaseに一切触れない純粋関数群）のテスト。
// 【2026-08-16再改訂】タイムアタック専用のランキングから、通常のイントロクイズ・
// 通常のランダム再生クイズも含めた統合ランキングへ拡張した仕様変更に合わせて全面更新。
// ルール（ノーマル/ハード/LOVE連チャン）はもう区分ではなく統合。出題タイプ2種類×出題数
// 5種類（5/10/20/50/全曲）×カテゴリー3種類（表題曲のみ/表題曲＋全員曲/全曲）の
// 合計30パターンすべてがランキング対応（一度出題数を5問・10問だけ、カテゴリーを
// 表題曲のみ/表題曲＋全員曲だけに絞ったが、本人指示により両方とも元の全種類に戻した）。
import {
  LEADERBOARD_QUESTION_COUNT_VALUES,
  LEADERBOARD_CATEGORY_VALUES,
  isSupportedLeaderboardDimension,
  buildLeaderboardPath,
  buildLeaderboardEntryPayload,
  isBetterLeaderboardRecord,
  normalizeLeaderboardEntry,
  sortLeaderboardEntries,
  findRankByUid,
  findBestEntryPerVariantQuestionCountAndCategory,
  isValidLeaderboardCandidate,
  computeAverageSecondsPerQuestion,
  findVerifiedAllModeAverageSeconds,
  resolveAverageSecondsPerQuestion,
} from "../js/timeAttackLeaderboard.js";
import { assertEqual } from "./test-utils.js";

export function runTimeAttackLeaderboardTests() {
  // ---- 対応次元の値一覧：出題数は5種類すべて、カテゴリーは表題曲のみ／表題曲＋全員曲だけ ----
  assertEqual(
    LEADERBOARD_QUESTION_COUNT_VALUES,
    ["5", "10", "20", "50", "all"],
    "出題数は5問・10問・20問・50問・全曲の5種類すべてがランキング対応"
  );
  assertEqual(
    LEADERBOARD_CATEGORY_VALUES,
    ["title-track", "title-and-group", "all"],
    "カテゴリーは表題曲のみ・表題曲＋全員曲・全曲の3種類すべてがランキング対応"
  );

  // ---- 対応次元の判定 ----
  assertEqual(isSupportedLeaderboardDimension("5", "title-track"), true, "5問・表題曲のみは対応次元");
  assertEqual(isSupportedLeaderboardDimension("10", "title-and-group"), true, "10問・表題曲＋全員曲は対応次元");
  assertEqual(isSupportedLeaderboardDimension("20", "title-track"), true, "20問・表題曲のみも対応次元");
  assertEqual(isSupportedLeaderboardDimension("50", "title-and-group"), true, "50問・表題曲＋全員曲も対応次元");
  assertEqual(isSupportedLeaderboardDimension("all", "title-track"), true, "全曲（出題数）・表題曲のみも対応次元");
  assertEqual(isSupportedLeaderboardDimension("5", "all"), true, "カテゴリー「全曲」も対応次元（出題数の「全曲」とは別の軸）");
  assertEqual(isSupportedLeaderboardDimension("all", "all"), true, "出題数・カテゴリーとも「全曲」の組み合わせも対応次元");
  assertEqual(isSupportedLeaderboardDimension("999", "title-track"), false, "定義されていない出題数の値は対応次元外");
  assertEqual(isSupportedLeaderboardDimension("5", "not-a-real-category"), false, "定義されていないカテゴリーの値は対応次元外");

  // ---- パス組み立て：variant×questionCount×categoryで分離される。ruleはもう区分に含めない ----
  assertEqual(
    buildLeaderboardPath("intro", "5", "title-track"),
    "timeAttackLeaderboardsV3/intro/5/title-track",
    "イントロ・5問・表題曲のみの組み合わせのパスになる"
  );
  assertEqual(
    buildLeaderboardPath("randomPlayback", "10", "title-and-group"),
    "timeAttackLeaderboardsV3/randomPlayback/10/title-and-group",
    "ランダム再生・10問・表題曲＋全員曲は別のパスになる"
  );
  assertEqual(
    buildLeaderboardPath("intro", "5", "title-track") === buildLeaderboardPath("intro", "10", "title-track"),
    false,
    "出題数が違えば別パスになる"
  );
  assertEqual(
    buildLeaderboardPath("intro", "5", "title-track") === buildLeaderboardPath("intro", "5", "title-and-group"),
    false,
    "カテゴリーが違えば別パスになる"
  );
  assertEqual(
    buildLeaderboardPath("intro", "5", "title-track").startsWith("timeAttackLeaderboardsV3/"),
    true,
    "新しいランキングは旧構造（timeAttackLeaderboardsV2、ルール別に分かれていた構造）とは別のキー配下に置かれる"
  );

  // ---- 30パターン（出題タイプ2×出題数5×カテゴリー3）が、すべて別パスになることを機械的に確認 ----
  const VARIANTS_FOR_TEST = ["intro", "randomPlayback"];
  const allPaths = [];
  VARIANTS_FOR_TEST.forEach((variant) => {
    LEADERBOARD_QUESTION_COUNT_VALUES.forEach((questionCountValue) => {
      LEADERBOARD_CATEGORY_VALUES.forEach((categoryFilterValue) => {
        allPaths.push(buildLeaderboardPath(variant, questionCountValue, categoryFilterValue));
      });
    });
  });
  assertEqual(allPaths.length, 30, "出題タイプ2×出題数5×カテゴリー3＝30パターンぶんのパスが作られる");
  assertEqual(new Set(allPaths).size, 30, "30パターンすべてが重複なく別々のパスになる（混ざるパターンが1つも無い）");
  assertEqual(
    allPaths.includes("timeAttackLeaderboardsV3/intro/all/all"),
    true,
    "出題数の「全曲」とカテゴリーの「全曲」を組み合わせたパスも、他とは独立した1つのパスとして存在する"
  );
  assertEqual(
    buildLeaderboardPath("intro", "5", "all") === buildLeaderboardPath("intro", "all", "all"),
    false,
    "出題数の「全曲」とカテゴリーの「全曲」は別の軸なので、片方だけ「全曲」のパスと両方「全曲」のパスは混ざらない"
  );

  // ---- payload組み立て：uidを含まない、表示名の空欄はフォールバックする。
  //      rule・sourceは表示用の参考情報として含まれる（2026-08-16追加） ----
  const payload = buildLeaderboardEntryPayload({
    displayName: "颯太",
    oshiMemberId: "noguchi-iori",
    clearTimeMs: 12345,
    missCount: 0,
    rule: "hard",
    source: "timeAttack",
    achievedAt: "SERVER_TIMESTAMP_PLACEHOLDER",
  });
  assertEqual(
    Object.keys(payload).sort(),
    ["achievedAt", "actualQuestionCount", "clearTimeMs", "displayName", "missCount", "oshiMemberId", "rule", "source"].sort(),
    "payloadにuidは含まれない（キーとして使うため）。ruleとsourceとactualQuestionCountは含まれる"
  );
  assertEqual(payload.displayName, "颯太", "displayNameがそのまま反映される");
  assertEqual(payload.rule, "hard", "ruleがそのまま反映される");
  assertEqual(payload.source, "timeAttack", "sourceがそのまま反映される");
  assertEqual(payload.actualQuestionCount, null, "actualQuestionCountを渡さなければnullになる（2026-08-29追加）");

  const withActualQuestionCountPayload = buildLeaderboardEntryPayload({
    displayName: "颯太",
    oshiMemberId: null,
    clearTimeMs: 9999,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
    actualQuestionCount: 81,
  });
  assertEqual(
    withActualQuestionCountPayload.actualQuestionCount,
    81,
    "actualQuestionCountを渡せばそのまま保存される（2026-08-29追加）"
  );
  const invalidActualQuestionCountPayload = buildLeaderboardEntryPayload({
    displayName: "颯太",
    oshiMemberId: null,
    clearTimeMs: 9999,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
    actualQuestionCount: 0,
  });
  assertEqual(
    invalidActualQuestionCountPayload.actualQuestionCount,
    null,
    "0以下のactualQuestionCountはnullへフォールバックする"
  );

  const normalSourcePayload = buildLeaderboardEntryPayload({
    displayName: "颯太",
    oshiMemberId: null,
    clearTimeMs: 9999,
    missCount: 0,
    rule: null,
    source: "normal",
    achievedAt: 1,
  });
  assertEqual(normalSourcePayload.rule, null, "通常クイズにはルールの概念が無いためnullのまま送られる");
  assertEqual(normalSourcePayload.source, "normal", "通常クイズ経由の記録はsource:normalになる");

  const invalidRuleSourcePayload = buildLeaderboardEntryPayload({
    displayName: "颯太",
    oshiMemberId: null,
    clearTimeMs: 9999,
    missCount: 0,
    rule: "not-a-real-rule",
    source: "not-a-real-source",
    achievedAt: 1,
  });
  assertEqual(invalidRuleSourcePayload.rule, null, "未知のrule値はnullへフォールバックする（不正データ混入対策）");
  assertEqual(invalidRuleSourcePayload.source, null, "未知のsource値はnullへフォールバックする（不正データ混入対策）");

  const emptyNamePayload = buildLeaderboardEntryPayload({
    displayName: "",
    oshiMemberId: null,
    clearTimeMs: 1000,
    missCount: 0,
    achievedAt: 1,
  });
  assertEqual(emptyNamePayload.displayName, "名無しのファン", "表示名が空でも安全なフォールバック名になる");

  // ---- 自己ベスト更新判定：記録なしからは常に更新、タイムが縮んだときだけ更新 ----
  assertEqual(
    isBetterLeaderboardRecord(null, { clearTimeMs: 5000, missCount: 0 }),
    true,
    "記録が無い状態からの初記録は常に更新対象になる"
  );
  assertEqual(
    isBetterLeaderboardRecord({ clearTimeMs: 5000, missCount: 0 }, { clearTimeMs: 6000, missCount: 0 }),
    false,
    "自己ベストより遅いタイムは更新されない"
  );
  assertEqual(
    isBetterLeaderboardRecord({ clearTimeMs: 5000, missCount: 2 }, { clearTimeMs: 5000, missCount: 1 }),
    true,
    "同タイムでもミス数が減っていれば更新される"
  );
  assertEqual(
    isBetterLeaderboardRecord({ clearTimeMs: 5000, missCount: 1 }, { clearTimeMs: 5000, missCount: 1 }),
    false,
    "タイム・ミス数とも全く同じなら更新しない（登録日時をむやみに更新しない）"
  );

  // ---- 正規化：壊れたデータでも安全なデフォルトへ復旧する ----
  assertEqual(normalizeLeaderboardEntry("uid1", null), null, "entryがnullならnullを返す");
  assertEqual(normalizeLeaderboardEntry("uid1", { clearTimeMs: "not-a-number" }), null, "clearTimeMsが数値でなければnull");
  assertEqual(normalizeLeaderboardEntry("uid1", { clearTimeMs: -100 }), null, "clearTimeMsが負数ならnull（異常値として除外）");

  const normalized = normalizeLeaderboardEntry("uid2", {
    displayName: "テスト太郎",
    oshiMemberId: "otani-emiri",
    clearTimeMs: 4321,
    missCount: 2,
    rule: "normal",
    source: "normal",
    achievedAt: 1700000000000,
  });
  assertEqual(
    normalized,
    {
      uid: "uid2",
      displayName: "テスト太郎",
      oshiMemberId: "otani-emiri",
      clearTimeMs: 4321,
      missCount: 2,
      rule: "normal",
      source: "normal",
      achievedAt: 1700000000000,
      actualQuestionCount: null,
    },
    "正常な形のentryは、値をそのまま保った形に正規化される（actualQuestionCountが無い旧データはnullになる）"
  );

  const normalizedWithActualQuestionCount = normalizeLeaderboardEntry("uid4", {
    displayName: "テスト花子",
    clearTimeMs: 137000,
    missCount: 0,
    achievedAt: 1700000000000,
    actualQuestionCount: 81,
  });
  assertEqual(
    normalizedWithActualQuestionCount.actualQuestionCount,
    81,
    "actualQuestionCountが保存されている記録はそのまま読み込まれる（2026-08-29追加）"
  );

  const brokenEntry = normalizeLeaderboardEntry("uid3", {
    clearTimeMs: 999,
    missCount: "not-a-number",
    displayName: 12345,
    oshiMemberId: 999,
    rule: "not-a-real-rule",
    source: 12345,
  });
  assertEqual(brokenEntry.missCount, 0, "missCountが数値でなければ0にフォールバックする");
  assertEqual(brokenEntry.displayName, "名無しのファン", "displayNameが文字列でなければフォールバックする");
  assertEqual(brokenEntry.oshiMemberId, null, "oshiMemberIdが文字列でなければnullにフォールバックする");
  assertEqual(brokenEntry.rule, null, "ruleが既知の値でなければnullにフォールバックする");
  assertEqual(brokenEntry.source, null, "sourceが既知の値でなければnullにフォールバックする");

  // ---- 並び替え：①タイム②ミス数③登録日時の順 ----
  const entries = [
    { uid: "a", clearTimeMs: 5000, missCount: 1, achievedAt: 300 },
    { uid: "b", clearTimeMs: 4000, missCount: 3, achievedAt: 100 },
    { uid: "c", clearTimeMs: 4000, missCount: 1, achievedAt: 200 },
    { uid: "d", clearTimeMs: 4000, missCount: 1, achievedAt: 50 },
  ];
  const sorted = sortLeaderboardEntries(entries);
  assertEqual(
    sorted.map((entry) => entry.uid),
    ["d", "c", "b", "a"],
    "①クリアタイム昇順②ミス数昇順③登録日時昇順の順で並び替えられる"
  );
  assertEqual(entries.map((entry) => entry.uid), ["a", "b", "c", "d"], "sortLeaderboardEntriesは元の配列を変更しない");

  // ---- 順位検索 ----
  assertEqual(findRankByUid(sorted, "b"), 3, "並び替え後の配列からuidの順位（1始まり）を取得できる");
  assertEqual(findRankByUid(sorted, "not-in-list"), null, "圏外のuidはnullを返す");

  // ---- ランキング登録候補の妥当性検証（ルールを問わず、ミス0のみ有効。次元の対応可否は
  //      isSupportedLeaderboardDimensionが別途担当するため、ここではタイム・ミス数だけを見る） ----
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: 0 }), true, "ミス0の正常な記録は有効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: 1 }), false, "1問でも間違えていれば無効（ルール問わず）");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: 4 }), false, "ミスが複数あっても同様に無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 0, missCount: 0 }), false, "0秒は不正な記録として無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: -100, missCount: 0 }), false, "負のタイムは無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: NaN, missCount: 0 }), false, "NaNのタイムは無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: -1 }), false, "負のミス数は無効");
  assertEqual(isValidLeaderboardCandidate({ clearTimeMs: 12345, missCount: NaN }), false, "NaNのミス数は無効");

  // ---- 履歴からの最速記録抽出（バックフィル用、2026-08-07新設、2026-08-16に
  //      ルールをまたいで統合し、対応次元だけに絞る形へ再改訂） ----
  const historyEntries = [
    {
      variant: "intro",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      totalElapsedMs: 8000,
      missCount: 2,
      completed: true,
    }, // ミスありなので対象外
    {
      variant: "intro",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      totalElapsedMs: 6000,
      missCount: 0,
      completed: true,
    },
    {
      variant: "intro",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      totalElapsedMs: 9000,
      missCount: 0,
      completed: false,
    }, // LOVE連チャン失敗（completed:false）、対象外
    {
      variant: "intro",
      rule: "normal",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      totalElapsedMs: 4000,
      missCount: 0,
      completed: true,
    }, // ルールが違っても、同じvariant×questionCount×categoryなら同じ枠として統合される
    {
      variant: "intro",
      rule: "hard",
      questionCountValue: "5",
      categoryFilterValue: "title-and-group",
      totalElapsedMs: 3000,
      missCount: 0,
      completed: true,
    }, // カテゴリーが違うので上の記録とは別枠
    {
      variant: "randomPlayback",
      rule: "loveChain",
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      totalElapsedMs: 7000,
      missCount: 1,
      completed: true,
    }, // ミスありなので対象外
    {
      rule: "loveChain",
      questionCountValue: "10",
      categoryFilterValue: "title-track",
      totalElapsedMs: 15000,
      missCount: 0,
      completed: true,
    }, // variant省略はintro扱い
    {
      variant: "intro",
      rule: "normal",
      questionCountValue: "20",
      categoryFilterValue: "title-track",
      totalElapsedMs: 1000,
      missCount: 0,
      completed: true,
    }, // 出題数20問も対応次元（本人指示により5/10/20/50/全曲すべて対応）なので抽出される
    {
      variant: "intro",
      rule: "normal",
      questionCountValue: "5",
      categoryFilterValue: "all",
      totalElapsedMs: 500,
      missCount: 0,
      completed: true,
    }, // カテゴリー「全曲」も対応次元（本人指示により表題曲のみ/表題曲＋全員曲/全曲の3種類すべて対応）なので抽出される
  ];
  const bestEntries = findBestEntryPerVariantQuestionCountAndCategory(historyEntries);
  assertEqual(
    bestEntries.length,
    5,
    "variant×questionCount×category（対応次元のみ）の組み合わせごとに、ミス0で完走した記録だけが1件ずつ抽出される"
  );

  const introTwentyTitleTrack = bestEntries.find((e) => e.questionCountValue === "20");
  assertEqual(introTwentyTitleTrack.clearTimeMs, 1000, "出題数20問の記録も対応次元として正しく抽出される");

  const introFiveTitleTrack = bestEntries.find(
    (e) => e.variant === "intro" && e.questionCountValue === "5" && e.categoryFilterValue === "title-track"
  );
  assertEqual(
    introFiveTitleTrack.clearTimeMs,
    4000,
    "同じvariant×questionCount×categoryなら、ルール（LOVE連チャン6000msとノーマル4000ms）をまたいで最速の記録が採用される"
  );
  assertEqual(introFiveTitleTrack.source, "timeAttack", "バックフィルはタイムアタック履歴由来なのでsource:timeAttackになる");

  const introFiveTitleAndGroup = bestEntries.find(
    (e) => e.variant === "intro" && e.categoryFilterValue === "title-and-group"
  );
  assertEqual(introFiveTitleAndGroup.clearTimeMs, 3000, "カテゴリーが違えば別記録として抽出される");

  const randomEntry = bestEntries.find((e) => e.variant === "randomPlayback");
  assertEqual(randomEntry, undefined, "ミスがある記録（randomPlaybackの1件）はどのルールでも抽出されない");

  const introTen = bestEntries.find((e) => e.questionCountValue === "10");
  assertEqual(introTen.variant, "intro", "entry.variant省略（古い履歴データ）はintroとして扱われる");
  assertEqual(introTen.clearTimeMs, 15000, "10問の記録も正しく抽出される");

  const introFiveCategoryAll = bestEntries.find((e) => e.categoryFilterValue === "all");
  assertEqual(introFiveCategoryAll.clearTimeMs, 500, "カテゴリー「全曲」の記録も対応次元として正しく抽出される");
  assertEqual(
    introFiveCategoryAll.categoryFilterValue !== introFiveTitleTrack.categoryFilterValue,
    true,
    "カテゴリー「全曲」の記録と表題曲のみの記録は別枠として抽出される（混ざらない）"
  );

  // ---- 1問あたりの平均タイム（2026-08-24追加）：固定出題数だけが対象、「全曲」は対象外 ----
  assertEqual(
    computeAverageSecondsPerQuestion(11824, "5"),
    2.3648,
    "5問・11.824秒の記録は1問あたり2.3648秒になる"
  );
  assertEqual(
    computeAverageSecondsPerQuestion(117973.2, "20"),
    5.89866,
    "20問の記録も正しく1問あたりの秒数に変換される"
  );
  assertEqual(
    computeAverageSecondsPerQuestion(137029, "all"),
    null,
    "出題数「全曲」は実際の出題数が記録に残っておらず、曲数も時期で変わるため平均を計算しない"
  );
  assertEqual(computeAverageSecondsPerQuestion(0, "5"), null, "クリアタイムが0（異常値）ならnull");
  assertEqual(computeAverageSecondsPerQuestion(-100, "5"), null, "クリアタイムが負数ならnull");
  assertEqual(computeAverageSecondsPerQuestion(NaN, "5"), null, "クリアタイムがNaNならnull");
  assertEqual(computeAverageSecondsPerQuestion(5000, "not-a-number"), null, "出題数が不正な値ならnull");

  // ---- 出題数「全曲」の特例（本人が履歴から確認した記録だけ手動登録、2026-08-24追加） ----
  assertEqual(
    findVerifiedAllModeAverageSeconds("intro", "all", "all", 137029.00000000026),
    137029.00000000026 / 1000 / 81,
    "本人が履歴から確認した特例記録は、完全一致で平均タイムを返す"
  );
  assertEqual(
    findVerifiedAllModeAverageSeconds("intro", "all", "all", 137029),
    137029 / 1000 / 81,
    "浮動小数点の微小な誤差（1ms未満）は同一記録として一致する"
  );
  assertEqual(
    findVerifiedAllModeAverageSeconds("intro", "all", "all", 99999),
    null,
    "登録されていないclearTimeMsの記録（＝新しい記録に更新された場合等）はnullを返す（古い平均を誤表示しない）"
  );
  assertEqual(
    findVerifiedAllModeAverageSeconds("randomPlayback", "all", "all", 137029.00000000026),
    null,
    "variantが違えば一致しない"
  );

  // ---- resolveAverageSecondsPerQuestion（2026-08-29追加）：出題数「全曲」でも
  //      平均タイムが表示されないバグの修正。優先順位①actualQuestionCount②固定出題数の
  //      計算式③手作業の特例リスト④null、の4段階すべてを確認する ----
  assertEqual(
    resolveAverageSecondsPerQuestion({ clearTimeMs: 162000, actualQuestionCount: 81 }, "intro", "all", "all"),
    162000 / 1000 / 81,
    "actualQuestionCountを持つ記録（今後の新しい記録）は、出題数「全曲」でも直接計算できる"
  );
  assertEqual(
    resolveAverageSecondsPerQuestion({ clearTimeMs: 11824, actualQuestionCount: null }, "intro", "5", "title-track"),
    2.3648,
    "actualQuestionCountが無い記録でも、固定出題数（5/10/20/50）なら既存の計算式にフォールバックする"
  );
  assertEqual(
    resolveAverageSecondsPerQuestion(
      { clearTimeMs: 137029.00000000026, actualQuestionCount: null },
      "intro",
      "all",
      "all"
    ),
    137029.00000000026 / 1000 / 81,
    "actualQuestionCountが無い旧「全曲」記録は、手作業の特例リストにフォールバックする"
  );
  assertEqual(
    resolveAverageSecondsPerQuestion({ clearTimeMs: 99999, actualQuestionCount: null }, "intro", "all", "all"),
    null,
    "actualQuestionCountも特例リストも無い旧「全曲」記録は、無理に計算せずnullのまま（誤った平均を表示しない）"
  );
  assertEqual(
    resolveAverageSecondsPerQuestion({ clearTimeMs: 5000, actualQuestionCount: 0 }, "intro", "all", "all"),
    null,
    "actualQuestionCountが0以下（不正値）なら、直接計算を使わずフォールバック側へ回る"
  );
}
