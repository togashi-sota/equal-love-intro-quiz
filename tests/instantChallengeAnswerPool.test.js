// js/instantChallengeQuestionBuilder.jsのbuildInstantChallengeQuestion()（1問分の
// 回答候補プールの組み立て）のテスト。
//
// 【2026-11-XX追加・本人指示：オリジナル一瞬チャレンジ回帰の再発防止】実機で「回答選択肢が
// 1件も出なくなる」重大バグが発生した。原因は、不正解候補の母集団（distractorPool＝
// 設定したカテゴリー全体）に正解の曲そのものが含まれていないケース（例：カテゴリーを
// 「表題曲のみ」にしたまま、表題曲ではない曲を選んで出題した場合）で、
// generateAnswerPool()が「正解曲が母集団に無いので空配列」を返し、フォールバックの
// buildFallbackAnswerPool()も同じ理由でnullを返してしまい、回答候補が0件になっていたこと。
// このテストは、その状況を実際に再現し、修正後は正解曲を含む形で必ず回答候補が
// 作られることを確認する（購入商品テスト＝実際に壊れた条件をそのまま再現するのが目的）。

import { buildInstantChallengeQuestion } from "../js/instantChallengeQuestionBuilder.js";
import { validateLyricsQuizQuestionAnswerPool } from "../js/lyricsQuizEngine.js";
import { SONGS } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

export function runInstantChallengeAnswerPoolTests() {
  // 実在の曲を使う（回答候補の曲名表示に使われるだけなので歌詞データは不要）。
  const selectedSong = SONGS[0]; // オリジナル問題作成で選んだ、正解になる曲
  const categorySongs = SONGS.slice(1, 5); // 正解曲を含まない「カテゴリー全体」という想定

  // ===== 実機バグの再現：正解曲がdistractorPoolに含まれないケース =====
  {
    const question = buildInstantChallengeQuestion(selectedSong, [selectedSong], { answerPoolSizeValue: "4" }, categorySongs);
    assertEqual(
      question.answerPool.length > 0,
      true,
      "正解曲がdistractorPoolに含まれていなくても、回答候補は0件にならない（実機バグの再現・修正確認）"
    );
    assertEqual(
      question.answerPool.some((song) => song.id === selectedSong.id),
      true,
      "正解曲がdistractorPoolに含まれていなくても、回答候補には必ず正解曲自身が含まれる"
    );
    assertEqual(
      validateLyricsQuizQuestionAnswerPool(question).ok,
      true,
      "生成された回答候補は検証（validateLyricsQuizQuestionAnswerPool）にも合格する"
    );
  }

  // ===== 通常ケース：正解曲がdistractorPoolに元から含まれている場合は今までどおり =====
  {
    const distractorPoolWithCorrectSong = [selectedSong, ...categorySongs];
    const question = buildInstantChallengeQuestion(
      selectedSong,
      [selectedSong],
      { answerPoolSizeValue: "4" },
      distractorPoolWithCorrectSong
    );
    assertEqual(question.answerPool.length, 4, "正解曲が最初から含まれる通常ケースでは、指定どおり4択になる");
    assertEqual(
      question.answerPool.some((song) => song.id === selectedSong.id),
      true,
      "通常ケースでも回答候補に正解曲が含まれる"
    );
  }

  // ===== distractorPool省略時（既存呼び出し元）は今までどおりpool自身が母集団になる =====
  {
    const pool = SONGS.slice(0, 4);
    const question = buildInstantChallengeQuestion(pool[0], pool, { answerPoolSizeValue: "4" });
    assertEqual(question.answerPool.length, 4, "distractorPool省略時は今までどおりpool全体から4択が作られる");
  }
}
