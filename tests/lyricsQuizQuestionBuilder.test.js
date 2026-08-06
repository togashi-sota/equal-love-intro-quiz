// js/lyricsQuizQuestionBuilder.js（歌詞クイズの問題セット組み立て）のテスト。
// IndexedDBに実際に触れる loadSongsWithLyrics() はここではテストしない
// （tests/lyricsStorage.test.jsと同じ方針：IndexedDBに触れる部分は薄いラッパーとして
// 分離し、中心ロジックだけを純粋関数としてテストする）。
//
// 歌詞テキストはすべて合成のダミー文（実在の楽曲とは無関係）。

import {
  filterQuizzableSongs,
  validateLyricsQuizAvailability,
  buildLyricsQuizQuestions,
  MIN_USABLE_SEGMENTS_REQUIRED,
} from "../js/lyricsQuizQuestionBuilder.js";
import { validateLyricsQuizQuestionAnswerPool } from "../js/lyricsQuizEngine.js";
import { SONGS } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

// buildLyricsQuizQuestions()は内部でjs/questionSource.jsのresolveSongObjects()を使い、
// songPoolの曲IDをjs/data/songs.jsの実データと照合する（回答候補の生成に曲オブジェクトが
// 必要なため）。そのため、このテストでは「架空の曲ID」ではなく、実在するsongs.jsの曲ID・
// 曲名（歌詞本文ではなく公開情報の曲名なので問題ない）を使い、歌詞テキストの部分だけを
// ダミーに差し替える（tests/lyricsStorage.test.jsと同じ方針）。
const REAL_SONGS_SAMPLE = SONGS.slice(0, 6);

// 十分な行数・十分な多様性を持つダミー歌詞（出題可能な曲を作るときに使う）。
function buildRichDummyLines() {
  return [
    { line: 1, text: "あさのひかりがまどからさす", start: 0, end: 3 },
    { line: 2, text: "きみのことをおもいだしてる", start: 3.2, end: 6 },
    { line: 3, text: "そらはあおくてかぜはあたたかい。", start: 6.2, end: 9 },
    { line: 4, text: "あしたもおなじみちをあるく", start: 9.2, end: 12 },
    { line: 5, text: "とおくのまちへむかっている", start: 12.2, end: 15 },
  ];
}

// 曲名だらけで出題に使える区間がほぼ無い、極端なダミー歌詞。
function buildTitleHeavyLines(title) {
  return [
    { line: 1, text: title, start: 0, end: 2 },
    { line: 2, text: title, start: 2.2, end: 4 },
  ];
}

function buildDummySong(id, title) {
  return { id, title, searchAliases: [] };
}

export function runLyricsQuizQuestionBuilderTests() {
  // ===== filterQuizzableSongs() / countUsableSegments（内部） =====

  {
    const richSong = buildDummySong("rich-song", "夜明けの歌");
    const titleHeavySong = buildDummySong("title-heavy-song", "おなじことば");

    const songsWithLyrics = [
      { song: richSong, lines: buildRichDummyLines() },
      { song: titleHeavySong, lines: buildTitleHeavyLines("おなじことば") },
    ];

    const quizzable = filterQuizzableSongs(songsWithLyrics);
    assertEqual(quizzable.length, 1, "曲名だらけで出題候補が無い曲は除外され、通常の曲だけが残る");
    assertEqual(quizzable[0].song.id, "rich-song", "残った曲は歌詞が豊富な方の曲である");
  }

  assertEqual(filterQuizzableSongs([]), [], "songsWithLyricsが空 → 空配列（例外を投げない）");

  // ===== validateLyricsQuizAvailability() =====

  {
    const songsWithLyrics = [
      { song: buildDummySong("a", "曲A"), lines: buildRichDummyLines() },
      { song: buildDummySong("b", "曲B"), lines: buildRichDummyLines() },
      { song: buildDummySong("c", "曲C"), lines: buildRichDummyLines() },
    ];

    assertEqual(validateLyricsQuizAvailability(songsWithLyrics, "3").ok, true, "出題可能な曲数＝要求数 → ok:true");
    assertEqual(validateLyricsQuizAvailability(songsWithLyrics, "5").ok, false, "出題可能な曲数<要求数 → ok:false");
    assertEqual(
      validateLyricsQuizAvailability(songsWithLyrics, "5").requiredCount,
      5,
      "ok:falseのときrequiredCountに要求数が入る"
    );
    assertEqual(validateLyricsQuizAvailability(songsWithLyrics, "all").ok, true, "\"all\"かつ1曲以上 → ok:true");
    assertEqual(validateLyricsQuizAvailability([], "all").ok, false, "\"all\"かつ0曲 → ok:false");
  }

  // ===== buildLyricsQuizQuestions() =====

  {
    const songs = REAL_SONGS_SAMPLE;
    const songsWithLyrics = songs.map((song) => ({ song, lines: buildRichDummyLines() }));
    const songPool = songs.map((song) => song.id);

    const questionsA = buildLyricsQuizQuestions({
      songsWithLyrics,
      songPool,
      questionCountValue: "4",
      answerPoolSizeValue: "4",
      seed: 777,
    });
    const questionsB = buildLyricsQuizQuestions({
      songsWithLyrics,
      songPool,
      questionCountValue: "4",
      answerPoolSizeValue: "4",
      seed: 777,
    });

    assertEqual(questionsA.length, 4, "questionCountValueどおりの問題数が生成される");
    assertEqual(
      questionsA.map((q) => q.song.id),
      questionsB.map((q) => q.song.id),
      "同じseedなら、出題される曲の並びも常に同じになる"
    );

    assertEqual(
      questionsA.every((q) => q.hints.length >= 1),
      true,
      "どの問題も最低1段階のヒントを持つ"
    );
    assertEqual(
      questionsA.every((q) => q.answerPool.length === 4),
      true,
      "どの問題も回答候補数がanswerPoolSizeValueどおりになる"
    );
    assertEqual(
      questionsA.every((q) => q.answerPool.some((s) => s.id === q.song.id)),
      true,
      "どの問題も回答候補に正解曲が含まれる"
    );

    const questionsWithDifferentSeed = buildLyricsQuizQuestions({
      songsWithLyrics,
      songPool,
      questionCountValue: "4",
      answerPoolSizeValue: "4",
      seed: 42,
    });
    // 必ずしも異なるとは限らないが、少なくとも同じ形の結果を安全に返すことを確認する。
    assertEqual(questionsWithDifferentSeed.length, 4, "seedが違っても問題数は指定どおりになる");
  }

  {
    // 出題可能な曲がsongPoolより少ない（一部の曲名だらけの曲が除外される）場合でも、
    // 例外を投げずに残った曲数までで問題セットを作る。
    const richSong = REAL_SONGS_SAMPLE[0];
    const titleHeavySong = REAL_SONGS_SAMPLE[1];
    const songsWithLyrics = [
      { song: richSong, lines: buildRichDummyLines() },
      { song: titleHeavySong, lines: buildTitleHeavyLines(titleHeavySong.title) },
    ];
    const questions = buildLyricsQuizQuestions({
      songsWithLyrics,
      songPool: [richSong.id, titleHeavySong.id],
      questionCountValue: "5",
      answerPoolSizeValue: "4",
      seed: 1,
    });
    assertEqual(questions.length, 1, "出題可能な曲が要求数より少ない場合、出題可能な曲数までに縮退する");
    assertEqual(questions[0].song.id, richSong.id, "出題可能な曲だけが問題として選ばれる");
  }

  assertEqual(MIN_USABLE_SEGMENTS_REQUIRED, 1, "MIN_USABLE_SEGMENTS_REQUIREDの既定値は1");

  // ===== 全曲を対象にした機械的検証（2026-08-07追加） =====
  // 「正解がヒロインズだと思われる問題で、正解曲が選択肢に存在しない」という報告の
  // 再発防止として、特定の1曲だけをピンポイントで直すのではなく、実在する全曲を
  // 1曲ずつ正解にして、4/10/30/50/全曲検索のどの回答方式でも正解songIdが必ず
  // 候補に含まれることを機械的に確認する。歌詞本文は一切使わず、songId・曲名・
  // 候補件数だけで判定する（歌詞本文を読み取ったりログへ出したりしない）。
  {
    const ANSWER_POOL_SIZE_VALUES_TO_CHECK = ["4", "10", "30", "50", "all"];

    // ---- パターンA：全曲に歌詞データがある想定（songPoolとsongsWithLyricsが完全一致） ----
    const allSongsWithLyrics = SONGS.map((song) => ({ song, lines: buildRichDummyLines() }));
    const fullSongPool = SONGS.map((song) => song.id);

    // ---- パターンB：一部の曲だけ歌詞データがある想定（実際の端末に近い状態。
    //      songPool＝カテゴリ全曲だが、songsWithLyrics＝その一部だけ、という非対称な状況で
    //      answerPool生成に使うsongPoolと出題対象songsWithLyricsがズレていないかを確認する） ----
    const partialSongsWithLyrics = SONGS.filter((_, index) => index % 3 === 0).map((song) => ({
      song,
      lines: buildRichDummyLines(),
    }));

    const failures = [];

    [
      { label: "全曲に歌詞データがある場合", songsWithLyrics: allSongsWithLyrics },
      { label: "一部の曲だけ歌詞データがある場合", songsWithLyrics: partialSongsWithLyrics },
    ].forEach(({ label, songsWithLyrics }) => {
      const targetSongs = songsWithLyrics.map((entry) => entry.song);

      ANSWER_POOL_SIZE_VALUES_TO_CHECK.forEach((answerPoolSizeValue, sizeIndex) => {
        const questions = buildLyricsQuizQuestions({
          songsWithLyrics,
          songPool: fullSongPool,
          questionCountValue: "all",
          answerPoolSizeValue,
          seed: 1000 + sizeIndex,
        });

        targetSongs.forEach((song) => {
          const question = questions.find((q) => q.song.id === song.id);
          if (!question) {
            failures.push({ pattern: label, songId: song.id, title: song.title, answerPoolSizeValue, reason: "question-not-generated" });
            return;
          }
          const validation = validateLyricsQuizQuestionAnswerPool(question);
          if (!validation.ok) {
            failures.push({ pattern: label, songId: song.id, title: song.title, answerPoolSizeValue, reason: validation.reason });
          }
        });
      });
    });

    assertEqual(
      failures,
      [],
      `全${SONGS.length}曲×5回答方式×2パターンで、正解が候補から欠ける組み合わせが無いこと` +
        (failures.length > 0 ? `（欠けた組み合わせ: ${JSON.stringify(failures)}）` : "")
    );
  }
}
