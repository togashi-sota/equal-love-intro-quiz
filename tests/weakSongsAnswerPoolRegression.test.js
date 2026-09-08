// 【QAで発見・修正：2026-09-09・本人指示：苦手曲モード全体の出題プールと回答候補プールの
// 設計統一】苦手曲モードは「正解として出題される曲（question pool）」は苦手曲だけに絞る一方、
// 「回答候補・ダミー選択肢（answer candidate pool）」はそのモードで通常利用可能な全対象曲から
// 選ぶ、というのが本人の想定する設計。実機で苦手曲モード「一瞬」の対象曲が3曲しかない状態で
// 4択を選んでも3択にしかならないバグが見つかり、コード監査の結果、苦手曲モード「リリック」にも
// 全く同型の未修正バグ（本人が「既に正しい」と想定していたが実際は違った）が見つかった。
//
// 原因は共通：js/instantChallengeScreen.jsのstartInstantChallengeWeakSongsPractice()・
// js/main.jsのbeginWeakSongsLyricsPractice()のどちらも、回答候補の母集団を「カテゴリー全体」
// にするための合図（distractorMode）を渡していなかったため、内部のbuildAndStartRun()が
// 「distractorPool（answer candidate pool）＝出題対象の曲プール（question pool＝苦手曲）
// そのもの」という分岐を選んでしまい、苦手曲が要求回答数より少ないとgenerateAnswerPool()が
// 自動的に回答候補数を切り詰めていた。
//
// 修正は、オリジナル問題作成モードの「全曲」選択と同じ既存の値（distractorMode: "all"）を
// 苦手曲タブの呼び出し元2箇所で渡すだけ（新しいロジックは追加していない）。
//
// このテストは、
// 1) 修正の核となる各エンジン側の純粋関数（buildInstantChallengeQuestion・
//    buildLyricsQuizQuestions）が、実機の本人報告どおりの曲数（3曲）でも、より広い
//    distractorPoolを渡せば要求どおりの回答候補数になることを確認する。
// 2) 苦手曲一瞬／苦手曲リリックの呼び出し元（DOM直結でこの環境から直接importできない
//    js/instantChallengeScreen.js・js/main.js）が、実際に"all"を渡す配線になっている
//    ことを、既存のtests/audioIndexedDbErrorRegression.test.js等と同じ
//    「配信されるソースコードの構造を直接検証する」方式で確認する。
// 3) 既に正しく実装されていたイントロ／アウトロ／シャッフルの3系統（js/main.jsの
//    beginSpecialQuiz・beginWeakSongsOutroPractice・beginWeakSongsShufflePractice）が、
//    今回の変更で誤って書き換えられていないことを確認する。

import { buildInstantChallengeQuestion } from "../js/instantChallengeQuestionBuilder.js";
import { buildLyricsQuizQuestions } from "../js/lyricsQuizQuestionBuilder.js";
import { SONGS } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

async function fetchSource(path) {
  const response = await fetch(path);
  return response.text();
}

// 十分な行数・十分な多様性を持つダミー歌詞（tests/lyricsQuizQuestionBuilder.test.jsと同じもの）。
function buildRichDummyLines() {
  return [
    { line: 1, text: "あさのひかりがまどからさす", start: 0, end: 3 },
    { line: 2, text: "きみのことをおもいだしてる", start: 3.2, end: 6 },
    { line: 3, text: "そらはあおくてかぜはあたたかい。", start: 6.2, end: 9 },
    { line: 4, text: "あしたもおなじみちをあるく", start: 9.2, end: 12 },
    { line: 5, text: "とおくのまちへむかっている", start: 12.2, end: 15 },
  ];
}

export function runWeakSongsAnswerPoolEngineTests() {
  // ===== 苦手曲「一瞬」：buildInstantChallengeQuestion()の回答候補プール ===== //
  {
    // 本人の実機報告どおり、苦手曲（question pool）が3曲しかないケース。
    const weakSongsPool = SONGS.slice(0, 3);
    // 通常の一瞬チャレンジで利用可能な全曲（answer candidate pool）という想定。10曲以上ある。
    const allAvailableSongs = SONGS.slice(0, 15);
    const correctSong = weakSongsPool[0];

    // ----- 修正前と同じ状態（distractorPool省略＝questionと同じ苦手曲3曲）だと3択になる ----- //
    const questionWithoutWideDistractorPool = buildInstantChallengeQuestion(correctSong, weakSongsPool, {
      answerPoolSizeValue: "4",
    });
    assertEqual(
      questionWithoutWideDistractorPool.answerPool.length,
      3,
      "distractorPool省略時（修正前の苦手曲一瞬タブと同じ状態）は、苦手曲が3曲しかないと4択を要求しても3択にしかならない（バグの再現）"
    );

    // ----- 修正後と同じ状態（distractorPool＝通常利用可能な全曲）だと要求どおり4択になる ----- //
    const questionWithWideDistractorPool = buildInstantChallengeQuestion(
      correctSong,
      weakSongsPool,
      { answerPoolSizeValue: "4" },
      allAvailableSongs
    );
    assertEqual(
      questionWithWideDistractorPool.answerPool.length,
      4,
      "苦手曲が3曲でも、回答候補の母集団（distractorPool）を通常利用可能な全曲にすれば、要求どおり4択になる（修正確認）"
    );
    assertEqual(
      questionWithWideDistractorPool.answerPool.some((song) => song.id === correctSong.id),
      true,
      "回答候補には必ず正解曲（苦手曲）自身が含まれる"
    );
    assertEqual(
      new Set(questionWithWideDistractorPool.answerPool.map((song) => song.id)).size,
      questionWithWideDistractorPool.answerPool.length,
      "回答候補にダミー曲の重複が無い"
    );

    // ----- 10択でも同様に、苦手曲3曲より多い10択が成立する ----- //
    const questionWith10Choices = buildInstantChallengeQuestion(
      correctSong,
      weakSongsPool,
      { answerPoolSizeValue: "10" },
      allAvailableSongs
    );
    assertEqual(
      questionWith10Choices.answerPool.length,
      10,
      "苦手曲が3曲でも、通常利用可能な全曲（15曲）から選べば10択も要求どおり成立する"
    );
  }

  // ===== 苦手曲「リリック」：buildLyricsQuizQuestions()の回答候補プール ===== //
  // （エンジン自体はtests/lyricsQuizQuestionBuilder.test.jsの
  //   「オリジナル問題作成モードの歌詞クイズタイプ」向けテストで既に汎用的に検証済みだが、
  //   本人の実機報告と同じ「苦手曲3曲」という曲数で、苦手曲モードBの名前を冠した
  //   専用の回帰テストとして明示的に残す）。
  {
    const weakSongs = SONGS.slice(0, 3);
    const songPool = weakSongs.map((song) => song.id);
    const songsWithLyrics = weakSongs.map((song) => ({ song, lines: buildRichDummyLines() }));
    const allAvailableSongIds = SONGS.slice(0, 15).map((song) => song.id);

    const questionsWithoutDistractorSongPool = buildLyricsQuizQuestions({
      songsWithLyrics,
      songPool,
      questionCountValue: "all",
      answerPoolSizeValue: "4",
      seed: 2026,
    });
    assertEqual(
      questionsWithoutDistractorSongPool.every((q) => q.answerPool.length === 3),
      true,
      "distractorSongPool省略時（修正前の苦手曲リリックタブと同じ状態）は、苦手曲が3曲しかないと4択を要求しても3択にしかならない（バグの再現）"
    );

    const questionsWithDistractorSongPool = buildLyricsQuizQuestions({
      songsWithLyrics,
      songPool,
      distractorSongPool: allAvailableSongIds,
      questionCountValue: "all",
      answerPoolSizeValue: "4",
      seed: 2026,
    });
    assertEqual(
      questionsWithDistractorSongPool.every((q) => q.answerPool.length === 4),
      true,
      "苦手曲が3曲でも、回答候補の母集団（distractorSongPool）を通常利用可能な全曲にすれば、要求どおり4択になる（修正確認）"
    );
    assertEqual(
      questionsWithDistractorSongPool.every((q) => q.answerPool.some((song) => song.id === q.song.id)),
      true,
      "回答候補には必ず正解曲（苦手曲）自身が含まれる"
    );
    assertEqual(
      questionsWithDistractorSongPool.length,
      3,
      "出題される問題数（question pool）自体は今までどおり苦手曲3曲のまま変わらない（回答候補プールを広げても出題対象は苦手曲のまま）"
    );
  }
}

export async function runWeakSongsAnswerPoolWiringRegressionTests() {
  // ===== js/instantChallengeScreen.js：苦手曲「一瞬」タブの配線 ===== //
  {
    const source = await fetchSource("js/instantChallengeScreen.js");
    assertEqual(source.length > 500, true, "js/instantChallengeScreen.jsのソースを取得できた（前提条件）");

    const fnStart = source.indexOf("export async function startInstantChallengeWeakSongsPractice(songIds, settings) {");
    assertEqual(fnStart !== -1, true, "js/instantChallengeScreen.js：startInstantChallengeWeakSongsPractice()が存在する（前提条件）");
    const fnBody = source.slice(fnStart, fnStart + 400);
    assertEqual(
      fnBody.includes('distractorMode: "all"'),
      true,
      'js/instantChallengeScreen.js：startInstantChallengeWeakSongsPractice()がbuildAndStartRun()へdistractorMode: "all"を渡している（回答候補の母集団を通常利用可能な全曲にするための配線）'
    );
    assertEqual(
      fnBody.includes('categoryFilterValue: "weakSongs"'),
      true,
      "js/instantChallengeScreen.js：出題対象曲の絞り込み（categoryFilterValue: \"weakSongs\"）自体は今までどおり維持されている"
    );
  }

  // ===== js/main.js：苦手曲「リリック」タブの配線 ===== //
  {
    const source = await fetchSource("js/main.js");
    assertEqual(source.length > 500, true, "js/main.jsのソースを取得できた（前提条件）");

    const fnStart = source.indexOf("async function beginWeakSongsLyricsPractice(songIds, answerPoolSizeValue) {");
    assertEqual(fnStart !== -1, true, "js/main.js：beginWeakSongsLyricsPractice()が存在する（前提条件）");
    const fnBody = source.slice(fnStart, fnStart + 400);
    assertEqual(
      fnBody.includes('startManualSelectionLyricsQuizRun(songIds, answerPoolSizeValue, "weakSongPractice", "all")'),
      true,
      'js/main.js：beginWeakSongsLyricsPractice()がstartManualSelectionLyricsQuizRun()へ第4引数"all"を渡している（回答候補の母集団を通常利用可能な全曲にするための配線）'
    );

    // ===== イントロ／アウトロ／シャッフルは、既に正しい設計だったため無変更であることの確認 ===== //
    const specialQuizFnStart = source.indexOf(
      "async function beginSpecialQuiz(songIds, questionCountValue, specialModeId) {"
    );
    assertEqual(specialQuizFnStart !== -1, true, "js/main.js：beginSpecialQuiz()が存在する（前提条件）");
    const specialQuizFnBody = source.slice(specialQuizFnStart, specialQuizFnStart + 400);
    assertEqual(
      specialQuizFnBody.includes('filterSongsWithImportedAudio(filterSongsByCategory(SONGS, "all"))'),
      true,
      "js/main.js：beginSpecialQuiz()（苦手曲イントロ含む）は今までどおり回答候補の母集団を全曲から作っている（無変更の確認）"
    );

    const outroFnStart = source.indexOf("async function beginWeakSongsOutroPractice(songIds, questionCountValue) {");
    assertEqual(outroFnStart !== -1, true, "js/main.js：beginWeakSongsOutroPractice()が存在する（前提条件）");
    const outroFnBody = source.slice(outroFnStart, outroFnStart + 400);
    assertEqual(
      outroFnBody.includes('filterSongsWithImportedAudio(filterSongsByCategory(SONGS, "all"))'),
      true,
      "js/main.js：beginWeakSongsOutroPractice()（苦手曲アウトロ）は今までどおり回答候補の母集団を全曲から作っている（無変更の確認）"
    );

    const shuffleFnStart = source.indexOf(
      "async function beginWeakSongsShufflePractice(songIds, questionCountValue) {"
    );
    assertEqual(shuffleFnStart !== -1, true, "js/main.js：beginWeakSongsShufflePractice()が存在する（前提条件）");
    const shuffleFnBody = source.slice(shuffleFnStart, shuffleFnStart + 400);
    assertEqual(
      shuffleFnBody.includes('filterSongsWithImportedAudio(filterSongsByCategory(SONGS, "all"))'),
      true,
      "js/main.js：beginWeakSongsShufflePractice()（苦手曲シャッフル）は今までどおり回答候補の母集団を全曲から作っている（無変更の確認）"
    );
  }

  // ===== 前回実装した答え合わせ音源「最後まで再生」仕様が今回の変更で壊れていないことの確認 ===== //
  {
    const instantSource = await fetchSource("js/instantChallengeScreen.js");
    assertEqual(
      instantSource.includes("const REVEAL_AUDIO_MAX_DURATION_SEC = 600;"),
      true,
      "js/instantChallengeScreen.js：前回実装したREVEAL_AUDIO_MAX_DURATION_SEC（答え合わせ音源を最後まで再生する仕様）が維持されている"
    );
    const lyricsSource = await fetchSource("js/lyricsQuizScreen.js");
    assertEqual(
      lyricsSource.includes("const REVEAL_AUDIO_MAX_DURATION_SEC = 600;"),
      true,
      "js/lyricsQuizScreen.js：前回実装したREVEAL_AUDIO_MAX_DURATION_SEC（答え合わせ音源を最後まで再生する仕様）が維持されている"
    );
  }

  // ===== オンライン対戦・おさらいは今回も一切変更していないことの確認 ===== //
  {
    const onlineFiles = [
      "js/onlineLyricsQuizBattleScreen.js",
      "js/onlineInstantBattleScreen.js",
      "js/onlineInstantCoopBattleScreen.js",
    ];
    for (const path of onlineFiles) {
      const source = await fetchSource(path);
      assertEqual(source.length > 500, true, `${path}のソースを取得できた（前提条件）`);
      assertEqual(
        source.includes('distractorMode: "all"'),
        false,
        `${path}：今回苦手曲モード向けに追加したdistractorMode: "all"の配線を一切含まない（オンライン対戦は無関係のまま）`
      );
    }
  }
}
