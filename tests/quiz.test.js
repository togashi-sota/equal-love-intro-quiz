// quiz.js（出題プールの絞り込み・4択生成）のテスト。

import {
  filterSongsByCategory,
  resolveQuestionCount,
  validatePoolSize,
  pickQuestionSongs,
  generateChoices,
} from "../js/quiz.js";
import { CATEGORY } from "../js/data/songs.js";
import { assertEqual } from "./test-utils.js";

// テスト用の仮の曲プール（本物のsongs.jsとは別に、テスト専用のデータを用意する）
const samplePool = [
  { id: "a", title: "曲A", category: CATEGORY.TITLE_TRACK },
  { id: "b", title: "曲B", category: CATEGORY.TITLE_TRACK },
  { id: "c", title: "曲C", category: CATEGORY.COUPLING },
  { id: "d", title: "曲D", category: CATEGORY.COUPLING },
  { id: "e", title: "曲E", category: CATEGORY.COUPLING },
];

export function runQuizTests() {
  assertEqual(filterSongsByCategory(samplePool, "title-track").length, 2, "表題曲のみで絞り込むと2曲になる");
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
}
