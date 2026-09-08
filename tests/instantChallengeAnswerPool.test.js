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

import {
  buildInstantChallengeQuestion,
  resolveInstantChallengeMinSongsRequired,
  MIN_SONGS_REQUIRED_FOR_WEAK_SONGS_PRACTICE,
} from "../js/instantChallengeQuestionBuilder.js";
import { MIN_SONGS_REQUIRED } from "../js/quiz.js";
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

// js/instantChallengeQuestionBuilder.jsのresolveInstantChallengeMinSongsRequired()のテスト。
//
// 【QAで発見・修正：2026-09-09・苦手曲モード「一瞬」実機バグの専用regression test】
// 本人の実機報告：苦手曲モード「一瞬」タブで、対象曲（=LOVE／ズルいよ ズルいね／
// 恋、はじめました。の3曲）が正しく表示され、それぞれの音源も実際に端末（audioStorage）へ
// 読み込み済みだったにもかかわらず、「対象曲の音源が読み込まれていないため開始できません
// でした」という誤った案内が出て開始できなかった。
//
// 原因は、通常の一瞬チャレンジ・オリジナル問題作成モードと同じ「4択を組み立てるための
// 最低4曲（MIN_SONGS_REQUIRED）」という下限チェックが、対象曲が元々少数（1桁）になり
// やすい苦手曲モードにもそのまま適用されていたこと。音源判定そのもの
// （js/audioStorage.jsのfilterSongsWithImportedAudio()、js/instantChallengeScreen.jsの
// resolvePlayableSongPool()経由）は通常モードと完全に同一の関数を使っており誤判定は
// 無かった（既存のtests/audioStorage.test.jsで別途検証済み）ため、ここでは「曲数が
// 足りているかどうかの判定」自体だけを、実際に壊れていた3曲というプールサイズを使って
// 再現・検証する。
export function runInstantChallengeMinSongsRequiredTests() {
  // ===== 実機バグの再現：苦手曲「一瞬」に3曲（音源読み込み済み想定）しか無いケース =====
  {
    const poolLength = 3; // 本人の実機報告どおりの曲数（=LOVE／ズルいよ ズルいね／恋、はじめました。）
    const minRequired = resolveInstantChallengeMinSongsRequired("weakSongsInstant");
    assertEqual(
      poolLength >= minRequired,
      true,
      "苦手曲モード「一瞬」：3曲（音源読み込み済み）なら、修正後は「音源無し」にならず開始可能と判定される（実機バグの再現・修正確認）"
    );
  }

  // ===== 同じ3曲のプールでも、通常の一瞬チャレンジ／オリジナル問題作成モードでは
  //       今までどおり「曲数が足りない」と判定される（既存動作を変えていないことの確認） =====
  {
    const poolLength = 3;
    assertEqual(
      poolLength < resolveInstantChallengeMinSongsRequired(null),
      true,
      "通常の一瞬チャレンジ（practiceModeId===null）は、3曲では今までどおり曲数不足のまま（4曲固定を維持）"
    );
    assertEqual(
      poolLength < resolveInstantChallengeMinSongsRequired("customQuizInstant"),
      true,
      "オリジナル問題作成モードの一瞬チャレンジも、3曲では今までどおり曲数不足のまま（4曲固定を維持）"
    );
  }

  // ===== 苦手曲モード「一瞬」の最低ラインそのものの確認 =====
  {
    assertEqual(
      resolveInstantChallengeMinSongsRequired("weakSongsInstant"),
      MIN_SONGS_REQUIRED_FOR_WEAK_SONGS_PRACTICE,
      "苦手曲モード「一瞬」の最低曲数はMIN_SONGS_REQUIRED_FOR_WEAK_SONGS_PRACTICE（2曲）"
    );
    assertEqual(
      resolveInstantChallengeMinSongsRequired(null),
      MIN_SONGS_REQUIRED,
      "通常モードの最低曲数は今までどおりMIN_SONGS_REQUIRED（4曲）のまま"
    );
  }

  // ===== 本当に音源が無い場合（＝プールが2曲未満）は、苦手曲モードでも引き続き
  //       開始不可のまま（「音源チェック自体を削除してはいけない」を満たす） =====
  {
    const minRequired = resolveInstantChallengeMinSongsRequired("weakSongsInstant");
    assertEqual(
      1 < minRequired,
      true,
      "苦手曲モード「一瞬」でも、音源読み込み済みの対象曲が1曲だけなら引き続き開始不可（本当に足りない場合の案内は維持）"
    );
    assertEqual(
      0 < minRequired,
      true,
      "苦手曲モード「一瞬」でも、音源読み込み済みの対象曲が0曲なら引き続き開始不可（本当に音源が無い場合の案内は維持）"
    );
  }

  // ===== ちょうど2曲なら苦手曲モード「一瞬」は開始可能（正解1＋誤答1の最低ライン） =====
  {
    const minRequired = resolveInstantChallengeMinSongsRequired("weakSongsInstant");
    assertEqual(2 >= minRequired, true, "苦手曲モード「一瞬」は、ちょうど2曲（正解1＋誤答1）でも開始可能な境界値");
  }
}
