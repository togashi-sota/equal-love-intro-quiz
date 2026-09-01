// js/questionSource.js（出題範囲の解決）のテスト。
// 【2026-09-14追加】共有曲選択の仕様変更（カテゴリ変更時も選択状態を保持しつつ、
// 現在有効な曲だけに絞り込む）に伴い新設したfilterSongIdsByCategory()と、
// buildQuestionsFromPool()のdistractorPool引数（出題曲プールと回答選択肢プールの分離）
// のテストを中心に扱う。

import { filterSongIdsByCategory, buildQuestionsFromPool, sanitizeSongIds } from "../js/questionSource.js";
import { SONGS, CATEGORY } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

export function runQuestionSourceTests() {
  const titleTrackSong = SONGS.find((song) => song.category === CATEGORY.TITLE_TRACK);
  const nonTitleTrackSong = SONGS.find((song) => song.category !== CATEGORY.TITLE_TRACK);

  // ---- filterSongIdsByCategory ----
  {
    const mixedIds = [titleTrackSong.id, nonTitleTrackSong.id];
    const filtered = filterSongIdsByCategory(mixedIds, "title-track");
    assertEqual(filtered.includes(titleTrackSong.id), true, "表題曲は「表題曲のみ」フィルタを通過する");
    assertEqual(filtered.includes(nonTitleTrackSong.id), false, "表題曲以外は「表題曲のみ」フィルタで除外される");

    const allFiltered = filterSongIdsByCategory(mixedIds, "all");
    assertEqual(allFiltered.length, mixedIds.length, "「全曲」カテゴリでは何も除外されない");

    assertEqual(
      filterSongIdsByCategory(["not-a-real-song-id"], "all"),
      [],
      "存在しない曲idは安全に除外される"
    );

    assertEqual(filterSongIdsByCategory([], "title-track"), [], "空配列を渡せば空配列が返る");

    // 【本人指示：カテゴリ変更時も選択状態は保持する】この関数自体は渡された配列を
    // 書き換えない（新しい配列を返すだけ）ことを確認する。
    const original = [titleTrackSong.id, nonTitleTrackSong.id];
    const originalCopy = [...original];
    filterSongIdsByCategory(original, "title-track");
    assertEqual(original, originalCopy, "filterSongIdsByCategoryは元の配列を書き換えない");
  }

  // ---- buildQuestionsFromPool：distractorPool（出題曲プールと回答選択肢プールの分離）----
  {
    // songPoolは意図的に2曲だけに絞った「共有曲プール」を模した状況。
    const songPool = [titleTrackSong.id, nonTitleTrackSong.id];
    // distractorPoolは「現在のカテゴリ条件全体」を模した、songPoolより広いプール。
    const distractorPool = sanitizeSongIds(SONGS.filter((song) => song.category !== undefined).map((song) => song.id)).slice(0, 20);

    const questions = buildQuestionsFromPool({
      seed: "test-seed-distractor-pool",
      songPool,
      distractorPool,
      questionCountValue: "2",
    });

    assertEqual(questions.length, 2, "songPool2曲・出題数2で2問生成される");
    questions.forEach((question) => {
      assertEqual(
        songPool.includes(question.song.id),
        true,
        "正解曲は必ずsongPool（共有曲プール）由来"
      );
      assertEqual(
        question.choices.some((choice) => choice.id === question.song.id),
        true,
        "選択肢の中に正解曲が必ず含まれる"
      );
      const dummyChoices = question.choices.filter((choice) => choice.id !== question.song.id);
      assertEqual(
        dummyChoices.every((choice) => distractorPool.includes(choice.id)),
        true,
        "ダミー選択肢はすべてdistractorPool（カテゴリ全体）由来"
      );
      // songPoolが2曲だけなので、正解ではない方のsongPool曲がダミーとして紛れ込む可能性は
      // あるが、それ以外の（songPoolに含まれない）distractorPool由来の曲も選ばれうることを
      // 確認する（＝ダミーがsongPoolの中だけに限定されていないことの確認）。
      assertEqual(
        dummyChoices.some((choice) => !songPool.includes(choice.id)),
        true,
        "ダミー選択肢に、songPool（共有曲プール）に含まれない曲が含まれうる（母集団がカテゴリ全体である証拠）"
      );
    });

    // distractorPoolを省略した場合は、今までどおりsongPool自身がダミーの母集団になる
    // （後方互換：既存の呼び出し元の挙動を変えない）。
    const withoutDistractorPool = buildQuestionsFromPool({
      seed: "test-seed-no-distractor-pool",
      songPool: distractorPool.slice(0, 6),
      questionCountValue: "3",
    });
    assertEqual(withoutDistractorPool.length, 3, "distractorPool省略時も出題数どおり生成される");
    withoutDistractorPool.forEach((question) => {
      assertEqual(
        question.choices.every((choice) => distractorPool.slice(0, 6).includes(choice.id)),
        true,
        "distractorPool省略時：選択肢はすべてsongPool内の曲に限定される"
      );
    });
  }
}
