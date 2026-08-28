// 歌詞クイズの回答候補生成に対する、全曲横断の整合性スイープ（2026-08-29新設）。
//
// 【経緯・本人指示】「ヒロインズ」「僕のヒロイン」のように曲名が似ている組み合わせで、
// 正解判定・4択がおかしくなっていないかを調べてほしいという依頼を受け、js/lyricsQuizEngine.js・
// js/lyricsQuizQuestionBuilder.js・js/data/songs.jsを精査した。結論：
//   ・generateAnswerPool()は「正解1曲＋songPoolから重複なく選んだ誤答」を組み立てる、
//     曲名の文字列比較を一切行わない設計（songIdだけで正解・誤答を区別する）。
//   ・2026-08-07の修正で、組み立てた回答候補をvalidateLyricsQuizQuestionAnswerPool()で
//     検証し、万一「正解が選択肢に無い／重複している」状態になった場合は
//     buildFallbackAnswerPool()（シャッフルを使わない決定論的な作り直し）へ切り替える
//     防御コードが既に入っている（js/lyricsQuizQuestionBuilder.jsのbuildLyricsQuizQuestions参照）。
//   ・「ヒロインズ」「僕のヒロイン」固有のバグを起こしうる分岐（曲名の部分一致・
//     Levenshtein等の類似度判定）はコード上どこにも存在しない。
// つまり、現在のコードを静的に読む限り、この2曲に限った再現可能な不具合は見つからなかった
// （本人への最終報告でもその旨を報告済み）。歌詞本文（実際の歌詞のどの行がどの曲のものか）は
// 著作権保護のため本テストでも一切読み書きしない。
//
// このテストは、その調査で「再現バグは見つからなかった」という結論を裏付けると同時に、
// 今後の新曲追加でも同じ保証が壊れないようにする恒久的な回帰防止テスト（本人指示の追加9）。
// js/data/songs.jsの実際の全曲（歌詞クイズ対象外のOverture等は除く）を対象に、
// 回答候補数（4/10/30/50/all）ごとに全曲を「正解」として回答候補を組み立て、
// 以下を機械的に検証する：
//   ①正解の曲が回答候補の中に必ずちょうど1件だけ存在する
//   ②回答候補の中にsongIdの重複が無い
//   ③「ヒロインズ」「僕のヒロイン」は登録上も別々の曲（別id）であり、
//     互いを正解として回答候補を組み立てても、上の①②が成立する
import { SONGS } from "../js/data/songs.js";
import { isLyricsQuizEligibleSong } from "../js/lyricsQuizQuestionBuilder.js";
import { ANSWER_POOL_SIZE_VALUES, generateAnswerPool, validateLyricsQuizQuestionAnswerPool } from "../js/lyricsQuizEngine.js";
import { assertEqual } from "./test-utils.js";

export function runLyricsQuizIntegritySweepTests() {
  const songPool = SONGS.filter(isLyricsQuizEligibleSong);

  assertEqual(songPool.length > 0, true, "歌詞クイズ対象の曲が1曲以上ある（前提条件）");

  // ---- 全曲×全回答候補数の組み合わせを総当たりで検証する ----
  let checkedCombinations = 0;
  const failures = [];
  songPool.forEach((song) => {
    ANSWER_POOL_SIZE_VALUES.forEach((answerPoolSizeValue) => {
      const answerPool = generateAnswerPool(songPool, song.id, answerPoolSizeValue);
      const validation = validateLyricsQuizQuestionAnswerPool({ song, answerPool });
      checkedCombinations += 1;
      if (!validation.ok) {
        failures.push({ songId: song.id, answerPoolSizeValue, reason: validation.reason });
      }
    });
  });

  assertEqual(
    checkedCombinations,
    songPool.length * ANSWER_POOL_SIZE_VALUES.length,
    `歌詞クイズ対象の全${songPool.length}曲×回答候補数${ANSWER_POOL_SIZE_VALUES.length}パターン、` +
      `合計${songPool.length * ANSWER_POOL_SIZE_VALUES.length}通りをすべて検証した`
  );
  assertEqual(
    failures,
    [],
    `不正な回答候補（正解が無い／重複している等）が1件も無い。` +
      `見つかった場合の内訳：${JSON.stringify(failures)}`
  );

  // ---- 「ヒロインズ」「僕のヒロイン」は別idの別曲として登録されている（本人指示の具体例） ----
  const heroines = songPool.find((song) => song.id === "heroines");
  const bokuNoHeroine = songPool.find((song) => song.id === "boku-no-heroine");
  assertEqual(heroines !== undefined, true, "「ヒロインズ」(id:heroines)が歌詞クイズ対象曲として登録されている");
  assertEqual(
    bokuNoHeroine !== undefined,
    true,
    "「僕のヒロイン」(id:boku-no-heroine)が歌詞クイズ対象曲として登録されている"
  );
  assertEqual(heroines?.id !== bokuNoHeroine?.id, true, "2曲は完全に別のsongIdとして区別されている");

  // ---- 「ヒロインズ」を正解にしたとき、回答候補に「ヒロインズ」が必ずちょうど1件だけ含まれ、
  //      「僕のヒロイン」が正解として紛れ込むことはない（逆方向も同様） ----
  ["4", "10", "30", "50", "all"].forEach((answerPoolSizeValue) => {
    const heroinesPool = generateAnswerPool(songPool, "heroines", answerPoolSizeValue);
    assertEqual(
      heroinesPool.filter((candidate) => candidate.id === "heroines").length,
      1,
      `「ヒロインズ」が正解のとき（回答候補${answerPoolSizeValue}）、選択肢の中に「ヒロインズ」がちょうど1件存在する`
    );

    const bokuPool = generateAnswerPool(songPool, "boku-no-heroine", answerPoolSizeValue);
    assertEqual(
      bokuPool.filter((candidate) => candidate.id === "boku-no-heroine").length,
      1,
      `「僕のヒロイン」が正解のとき（回答候補${answerPoolSizeValue}）、選択肢の中に「僕のヒロイン」がちょうど1件存在する`
    );
  });
}
