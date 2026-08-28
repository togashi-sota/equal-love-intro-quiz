// js/customQuizPresets.js のテスト（2026-08-29新設）。
// 【本人指示（⑭）】オリジナル問題作成モードを3種類（イントロ／ランダム再生／歌詞クイズ）へ
// 拡張するのにあわせてquizType・answerPoolSizeValueを追加した。既存プリセット（この変更より
// 前に保存された、quizTypeを持たないデータ）が「イントロクイズのセット」として今までどおり
// 動き続けることが最重要のため、後方互換を重点的に検証する。
import {
  CUSTOM_QUIZ_TYPE,
  getPresets,
  saveNewPreset,
  updatePreset,
  duplicatePreset,
  deletePreset,
} from "../js/customQuizPresets.js";
import { assertEqual } from "./test-utils.js";

const PRESETS_KEY = "equalLoveIntroQuiz.customQuizPresets";

function cleanup() {
  localStorage.removeItem(PRESETS_KEY);
}

export function runCustomQuizPresetsTests() {
  cleanup();

  // ---- 後方互換：quizTypeを持たない旧形式のデータをそのまま書き込んでも、
  //      getPresets()は自動的にquizType:"intro"・answerPoolSizeValue:"4"として返す ----
  localStorage.setItem(
    PRESETS_KEY,
    JSON.stringify({
      schemaVersion: 1,
      presets: [
        {
          id: "legacy-1",
          name: "旧形式のセット",
          memo: "",
          songIds: ["aitakatta"],
          distractorMode: "selected",
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    })
  );
  const legacyPresets = getPresets();
  assertEqual(legacyPresets.length, 1, "旧形式のプリセットも1件として読み込める");
  assertEqual(
    legacyPresets[0].quizType,
    CUSTOM_QUIZ_TYPE.INTRO,
    "quizTypeを持たない旧形式のプリセットは、自動的にintro扱いになる（後方互換の核心）"
  );
  assertEqual(
    legacyPresets[0].answerPoolSizeValue,
    "4",
    "answerPoolSizeValueを持たない旧形式のプリセットは、既定値'4'になる"
  );
  assertEqual(legacyPresets[0].songIds, ["aitakatta"], "songIds等、既存の項目はそのまま保たれる");
  cleanup();

  // ---- 新規保存：quizType・answerPoolSizeValueを指定して保存できる ----
  const introPreset = saveNewPreset({
    name: "イントロのセット",
    memo: "",
    songIds: ["aitakatta", "koibumi"],
    distractorMode: "selected",
    quizType: CUSTOM_QUIZ_TYPE.INTRO,
  });
  assertEqual(introPreset.quizType, CUSTOM_QUIZ_TYPE.INTRO, "quizTypeを明示して保存できる");

  const lyricsPreset = saveNewPreset({
    name: "歌詞のセット",
    memo: "",
    songIds: ["aitakatta", "koibumi", "song-3", "song-4"],
    distractorMode: "selected",
    quizType: CUSTOM_QUIZ_TYPE.LYRICS_QUIZ,
    answerPoolSizeValue: "10",
  });
  assertEqual(lyricsPreset.quizType, CUSTOM_QUIZ_TYPE.LYRICS_QUIZ, "歌詞クイズタイプとして保存できる");
  assertEqual(lyricsPreset.answerPoolSizeValue, "10", "answerPoolSizeValueも指定どおり保存される");

  const randomPreset = saveNewPreset({
    name: "ランダム再生のセット",
    memo: "",
    songIds: ["aitakatta"],
    distractorMode: "all",
    quizType: CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK,
  });
  assertEqual(randomPreset.quizType, CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK, "ランダム再生タイプとして保存できる");

  assertEqual(getPresets().length, 3, "3件とも保存されている");
  cleanup();

  // ---- quizTypeを省略した場合は既定でintroになる（呼び出し側の変更漏れに対する保険） ----
  const defaultedPreset = saveNewPreset({ name: "省略テスト", memo: "", songIds: ["aitakatta"], distractorMode: "selected" });
  assertEqual(defaultedPreset.quizType, CUSTOM_QUIZ_TYPE.INTRO, "quizType省略時はintroになる");
  cleanup();

  // ---- 複製：quizType・answerPoolSizeValueも引き継がれる ----
  const original = saveNewPreset({
    name: "元セット",
    memo: "メモ",
    songIds: ["aitakatta", "koibumi", "song-3", "song-4"],
    distractorMode: "selected",
    quizType: CUSTOM_QUIZ_TYPE.LYRICS_QUIZ,
    answerPoolSizeValue: "30",
  });
  const duplicated = duplicatePreset(original.id);
  assertEqual(duplicated.quizType, CUSTOM_QUIZ_TYPE.LYRICS_QUIZ, "複製してもquizTypeは引き継がれる");
  assertEqual(duplicated.answerPoolSizeValue, "30", "複製してもanswerPoolSizeValueは引き継がれる");
  assertEqual(duplicated.name, "元セット（コピー）", "複製の名前には（コピー）が付く");
  assertEqual(duplicated.id !== original.id, true, "複製はidが新しく発行される");
  cleanup();

  // ---- 更新：quizTypeは変更されない（編集画面では作り直しが必要という設計） ----
  const toUpdate = saveNewPreset({
    name: "更新前",
    memo: "",
    songIds: ["aitakatta"],
    distractorMode: "selected",
    quizType: CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK,
  });
  updatePreset(toUpdate.id, { name: "更新後", memo: "新メモ", songIds: ["koibumi"], distractorMode: "all" });
  const afterUpdate = getPresets().find((p) => p.id === toUpdate.id);
  assertEqual(afterUpdate.name, "更新後", "名前は更新される");
  assertEqual(
    afterUpdate.quizType,
    CUSTOM_QUIZ_TYPE.RANDOM_PLAYBACK,
    "quizTypeはupdatePreset()では変更されず、保存時のまま維持される"
  );
  cleanup();

  // ---- 削除：既存の挙動に変化が無いことの回帰確認 ----
  const toDelete = saveNewPreset({ name: "削除対象", memo: "", songIds: ["aitakatta"], distractorMode: "selected" });
  deletePreset(toDelete.id);
  assertEqual(getPresets().length, 0, "削除したプリセットは一覧から消える");

  cleanup();
}
