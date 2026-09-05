// js/onlineBattleSongSourceUi.js（オンライン対戦「出題する曲」4択の共通ロジック）のテスト。
// 【2026-09-30新設・本人指示：オンライン対戦総合改修 第2ラウンド5章】
// 「出題する曲(全曲/曲を選んで出題)」＋「カテゴリー」の2段階UIを、①表題曲のみ
// ②表題曲＋全員曲 ③全曲 ④曲を選んで出題 の4択1本へ統合したことに伴うテスト。
// 特に、旧ルーム（categoryFilterValueのみ・questionSourceが無い/不明な形）が
// クラッシュせず正しい選択肢へ収束すること（後方互換）と、④「曲を選んで出題」が
// categoryFilterValueを"all"に固定することで隠れたカテゴリ二重フィルタを持たないことを
// 重点的に確認する。

import {
  resolveSongSourceOptionValue,
  buildSongSourceSettingsFields,
  describeSongSourceForSettings,
} from "../js/onlineBattleSongSourceUi.js";
import { QUESTION_SOURCE_TYPE } from "../js/questionSource.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleSongSourceUiTests() {
  // ---- resolveSongSourceOptionValue：後方互換（旧ルーム・不明な値） ----
  {
    assertEqual(
      resolveSongSourceOptionValue({ categoryFilterValue: "title-track" }),
      "title-track",
      "categoryFilterValue=title-trackは①表題曲のみに収束する"
    );
    assertEqual(
      resolveSongSourceOptionValue({ categoryFilterValue: "title-and-group" }),
      "title-and-group",
      "categoryFilterValue=title-and-groupは②表題曲＋全員曲に収束する"
    );
    assertEqual(
      resolveSongSourceOptionValue({ categoryFilterValue: "all" }),
      "all",
      "categoryFilterValue=allは③全曲に収束する"
    );
    assertEqual(
      resolveSongSourceOptionValue({}),
      "title-track",
      "categoryFilterValueが無い旧settingsでもクラッシュせず①表題曲のみへ安全に収束する"
    );
    assertEqual(
      resolveSongSourceOptionValue({ categoryFilterValue: "unknown-value" }),
      "title-track",
      "不明なcategoryFilterValueでも①表題曲のみへ安全に収束する"
    );
    assertEqual(
      resolveSongSourceOptionValue(null),
      "title-track",
      "settings自体がnullでもクラッシュせず①表題曲のみへ収束する"
    );
    assertEqual(
      resolveSongSourceOptionValue({
        categoryFilterValue: "title-track",
        questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: ["a"] },
      }),
      "manual",
      "questionSource.type=collaborativeSelectionは④曲を選んで出題に収束する（categoryFilterValueの値によらない）"
    );
    assertEqual(
      resolveSongSourceOptionValue({ categoryFilterValue: "all", questionSource: { type: QUESTION_SOURCE_TYPE.ALL_SONGS } }),
      "all",
      "questionSource.type=allSongs（歌詞クイズの流儀）はcategoryFilterValueどおりに収束する"
    );
  }

  // ---- 2026-09-05追加（本人指示）：自動絞り込み（autoRestrictedToCommonSongs）は④として
  // 表示しない ----
  // 実機・実Firebeaseで発見：js/onlineBattleSongAvailability.jsのrestrictSettingsTo
  // CommonlyAvailableSongs()が「参加者全員が利用できる曲」へ自動的に絞り込んだ結果
  // （ホストは①②③のどれかを選んだままで、システムが裏で付けたcollaborativeSelection）を
  // ④「曲を選んで出題」として表示してしまうと、実際には選んでいないのに選んでいるように
  // 見える上、js/onlineBattleScreen.jsのsyncCollaborativeSongPoolIfHost()が「まだ誰も
  // 選曲画面を開いていない（selectedSongIds空）」と誤認してsongIdsを0件へ上書きし、
  // 「出題する曲が選ばれていません」で再戦がブロックされる不具合につながっていた
  // （questionSourceのモード間残留が原因だった不具合1とは別の発生経路）。
  {
    assertEqual(
      resolveSongSourceOptionValue({
        categoryFilterValue: "all",
        questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: ["a"], autoRestrictedToCommonSongs: true },
      }),
      "all",
      "autoRestrictedToCommonSongs:trueのcollaborativeSelectionは④に見せず、categoryFilterValueどおり③全曲として表示する"
    );
    assertEqual(
      resolveSongSourceOptionValue({
        categoryFilterValue: "title-track",
        questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: [], autoRestrictedToCommonSongs: true },
      }),
      "title-track",
      "songIdsが0件の自動絞り込みでも④には見せず、categoryFilterValueどおり①表題曲のみとして表示する"
    );
    assertEqual(
      resolveSongSourceOptionValue({
        categoryFilterValue: "all",
        questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: ["a"], autoRestrictedToCommonSongs: false },
      }),
      "manual",
      "autoRestrictedToCommonSongsが明示的にfalseなら、今までどおり④として表示する（本人が実際に選んだ場合）"
    );
  }

  // ---- buildSongSourceSettingsFields：①②③はcategoryFilterValueのみ（既存動作を維持） ----
  {
    const fields = buildSongSourceSettingsFields("title-track", { mergedSongIds: ["x", "y"] });
    assertEqual(fields.categoryFilterValue, "title-track", "①を選ぶとcategoryFilterValueがtitle-trackになる");
    assertEqual("questionSource" in fields, false, "①②③はquestionSourceキー自体を持たない（既存の後方互換動作を維持）");
  }
  {
    const fields = buildSongSourceSettingsFields("all", { mergedSongIds: ["x", "y"] });
    assertEqual(fields.categoryFilterValue, "all", "③を選ぶとcategoryFilterValueがallになる");
    assertEqual("questionSource" in fields, false, "③もquestionSourceキーを持たない");
  }

  // ---- buildSongSourceSettingsFields：④は隠れたカテゴリ二重フィルタを持たない ----
  {
    const fields = buildSongSourceSettingsFields("manual", { mergedSongIds: ["song-a", "song-b"] });
    assertEqual(
      fields.categoryFilterValue,
      "all",
      "④「曲を選んで出題」はcategoryFilterValueを常にallへ固定する（隠れたカテゴリ二重フィルタが起きないようにするため）"
    );
    assertEqual(
      fields.questionSource,
      { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: ["song-a", "song-b"] },
      "④は共同選曲（collaborativeSelection）として、渡された曲ID配列そのものを保存する"
    );
  }
  {
    // 曲を選んで出題を選んだ直後、まだ誰も選んでいない場合（0曲）も安全に保存できる
    // （js/battleModes/timeAttackBattleMode.js・lyricsQuizBattleMode.jsの既存仕様）。
    const fields = buildSongSourceSettingsFields("manual", { mergedSongIds: [] });
    assertEqual(fields.questionSource.songIds, [], "④は0曲でも安全にsongIds:[]として保存できる");
  }

  // ---- buildSongSourceSettingsFields：includeAllSongsQuestionSource（歌詞クイズの流儀） ----
  {
    const fields = buildSongSourceSettingsFields("title-and-group", { includeAllSongsQuestionSource: true });
    assertEqual(fields.categoryFilterValue, "title-and-group", "includeAllSongsQuestionSource指定時もcategoryFilterValueは選択どおり");
    assertEqual(
      fields.questionSource,
      { type: QUESTION_SOURCE_TYPE.ALL_SONGS },
      "includeAllSongsQuestionSource指定時、①②③でもquestionSource:{type:allSongs}を明示する（歌詞クイズのdefaultSettings()と同じ形を維持するため）"
    );
  }

  // ---- buildSongSourceSettingsFields：不明な選択値は安全に①へフォールバックする ----
  {
    const fields = buildSongSourceSettingsFields("not-a-real-option", {});
    assertEqual(fields.categoryFilterValue, "title-track", "不明な選択値が渡されても①表題曲のみへ安全にフォールバックする");
  }

  // ---- describeSongSourceForSettings：チップ・ルール確認画面向けの文言 ----
  {
    assertEqual(describeSongSourceForSettings({ categoryFilterValue: "title-track" }), "表題曲のみ", "①のラベル文言");
    assertEqual(describeSongSourceForSettings({ categoryFilterValue: "title-and-group" }), "表題曲＋全員曲", "②のラベル文言");
    assertEqual(describeSongSourceForSettings({ categoryFilterValue: "all" }), "全曲", "③のラベル文言");
    assertEqual(
      describeSongSourceForSettings({
        categoryFilterValue: "all",
        questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: ["a", "b", "c"] },
      }),
      "3曲から出題",
      "④は曲名を見せず、曲数だけを表示する（本人指示：対戦開始前に曲名までは見せない）"
    );
    assertEqual(
      describeSongSourceForSettings({
        categoryFilterValue: "all",
        questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: [] },
      }),
      "0曲から出題",
      "④でまだ誰も選んでいない場合は0曲から出題と表示される"
    );
  }

  // ---- 往復（round-trip）：4択のどれを選んでも、resolveで同じ値に戻る ----
  {
    ["title-track", "title-and-group", "all", "manual"].forEach((optionValue) => {
      const fields = buildSongSourceSettingsFields(optionValue, { mergedSongIds: ["a"] });
      assertEqual(
        resolveSongSourceOptionValue(fields),
        optionValue,
        `buildSongSourceSettingsFields("${optionValue}")の結果をresolveSongSourceOptionValue()に渡すと同じ値に戻る（往復の整合性）`
      );
    });
  }
}
