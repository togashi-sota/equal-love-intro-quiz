// quiz.js（出題プールの絞り込み・4択生成）のテスト。

import {
  filterSongsByCategory,
  resolveQuestionCount,
  validatePoolSize,
  filterSongsByAvailableAudio,
  validatePlayablePoolSize,
  pickQuestionSongs,
  generateChoices,
  buildQuizQuestions,
} from "../js/quiz.js";
import { CATEGORY } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

// テスト用の仮の曲プール（本物のsongs.jsとは別に、テスト専用のデータを用意する）
const samplePool = [
  { id: "a", title: "曲A", category: CATEGORY.TITLE_TRACK },
  { id: "b", title: "曲B", category: CATEGORY.TITLE_TRACK },
  { id: "c", title: "曲C", category: CATEGORY.GROUP_SONG },
  { id: "d", title: "曲D", category: CATEGORY.GROUP_SONG },
  { id: "e", title: "曲E", category: CATEGORY.UNIT_SONG },
];

export function runQuizTests() {
  assertEqual(filterSongsByCategory(samplePool, "title-track").length, 2, "表題曲のみで絞り込むと2曲になる");
  assertEqual(
    filterSongsByCategory(samplePool, "title-and-group").length,
    4,
    "表題曲＋全員曲で絞り込むと、ユニット曲を除いた4曲になる"
  );
  assertEqual(filterSongsByCategory(samplePool, "all").length, 5, "「全曲」を選ぶと絞り込まれない");

  assertEqual(resolveQuestionCount("5", 5), 5, "出題数5・プール5曲 → 5問");
  assertEqual(resolveQuestionCount("10", 5), 5, "出題数10・プール5曲 → プール数に切り詰めて5問");
  assertEqual(resolveQuestionCount("all", 5), 5, "出題数「全曲」・プール5曲 → 5問");

  assertEqual(validatePoolSize(samplePool), null, "5曲あれば曲数不足エラーは出ない");
  assertEqual(validatePoolSize(samplePool.slice(0, 3)) !== null, true, "3曲だと曲数不足エラーが出る");

  const choices = generateChoices(samplePool[0], samplePool);
  assertEqual(choices.length, 4, "選択肢はちょうど4つ生成される");
  assertEqual(choices.filter((c) => c.id === samplePool[0].id).length, 1, "正解の選択肢がちょうど1つ含まれる");
  assertEqual(new Set(choices.map((c) => c.id)).size, 4, "選択肢に重複がない");

  const picked = pickQuestionSongs(samplePool, 3);
  assertEqual(picked.length, 3, "出題数3を指定すると3曲選ばれる");
  assertEqual(new Set(picked.map((s) => s.id)).size, 3, "選ばれた3曲に重複がない");

  // ---- filterSongsByAvailableAudio（2026-08-15追加：音源未読み込みの曲を出題・選択肢から除外する）----
  const importedSet = new Set(["a", "b", "c"]);
  const availableOnly = filterSongsByAvailableAudio(samplePool, importedSet);
  assertEqual(availableOnly.length, 3, "音源読み込み済みの3曲だけが残る");
  assertEqual(
    availableOnly.every((song) => importedSet.has(song.id)),
    true,
    "残った曲はすべて音源読み込み済みの曲だけ"
  );
  assertEqual(
    filterSongsByAvailableAudio(samplePool, []).length,
    0,
    "1曲も読み込んでいなければ0曲になる（配列で渡してもSetと同じ結果）"
  );
  assertEqual(
    filterSongsByAvailableAudio(samplePool, new Set(samplePool.map((s) => s.id))).length,
    samplePool.length,
    "全曲読み込み済みなら絞り込まれない"
  );

  // ---- validatePlayablePoolSize ----
  assertEqual(validatePlayablePoolSize(samplePool), null, "5曲あれば音源不足エラーは出ない");
  assertEqual(
    validatePlayablePoolSize(samplePool.slice(0, 3)) !== null,
    true,
    "3曲だと音源不足エラーが出る"
  );
  assertEqual(
    validatePlayablePoolSize(samplePool.slice(0, 3)) !== validatePoolSize(samplePool.slice(0, 3)),
    true,
    "音源不足のメッセージは、カテゴリ不足のメッセージとは異なる文言になる"
  );

  // ---- buildQuizQuestions（2026-09-14追加：出題曲プールと回答選択肢プールの分離）----
  {
    // distractorPoolを省略した場合、今までどおりpool自身からダミー選択肢が選ばれる（後方互換）。
    const withoutDistractorPool = buildQuizQuestions(samplePool.slice(0, 4), 4);
    assertEqual(withoutDistractorPool.length, 4, "distractorPool省略時：4問生成される");
    withoutDistractorPool.forEach((question) => {
      assertEqual(question.choices.length, 4, "distractorPool省略時：各問題の選択肢は4つ");
      assertEqual(
        question.choices.every((choice) => samplePool.slice(0, 4).some((song) => song.id === choice.id)),
        true,
        "distractorPool省略時：選択肢はすべて出題対象プール内の曲"
      );
    });

    // distractorPoolを渡した場合、正解は出題対象プール（restrictedPool）から選ばれるが、
    // ダミー選択肢はdistractorPool（より広いカテゴリ全体）から選ばれる。
    const restrictedPool = samplePool.slice(0, 2); // 曲A・曲Bだけの共有曲プール（想定）
    const distractorPool = samplePool; // カテゴリ全体（5曲）
    const withDistractorPool = buildQuizQuestions(restrictedPool, 2, Math.random, distractorPool);
    assertEqual(withDistractorPool.length, 2, "distractorPool指定時：出題数どおり2問生成される");
    withDistractorPool.forEach((question) => {
      assertEqual(
        restrictedPool.some((song) => song.id === question.song.id),
        true,
        "distractorPool指定時：正解曲は必ず出題対象プール（restrictedPool）由来"
      );
      assertEqual(
        question.choices.some((choice) => choice.id === question.song.id),
        true,
        "distractorPool指定時：選択肢の中に正解曲が必ず含まれる"
      );
      assertEqual(
        question.choices.every((choice) => distractorPool.some((song) => song.id === choice.id)),
        true,
        "distractorPool指定時：ダミー選択肢はdistractorPool（カテゴリ全体）由来"
      );
      // restrictedPoolが2曲しかないため、正解以外の3つのダミーはdistractorPoolの
      // 「restrictedPoolに含まれない曲（曲C・D・E）」から選ばれているはず（曲指定4曲だけが
      // 選択肢にならない、という本人指示の確認）。
      const dummyChoices = question.choices.filter((choice) => choice.id !== question.song.id);
      assertEqual(dummyChoices.length, 3, "distractorPool指定時：ダミー選択肢は3つ");
      assertEqual(
        dummyChoices.some((choice) => !restrictedPool.some((song) => song.id === choice.id)),
        true,
        "distractorPool指定時：ダミー選択肢に、出題対象プールに無い曲（カテゴリ全体由来）が含まれうる"
      );
    });
  }
}
