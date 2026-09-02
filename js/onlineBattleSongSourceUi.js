// オンライン対戦の「出題する曲」設定の共通ロジック（2026-09-30新設・本人指示：
// オンライン対戦総合改修 第2ラウンド 5章）。
//
// 【変更の経緯】以前は「①全曲から出題／曲を選んで出題」と「②カテゴリ（表題曲のみ／
// 表題曲＋全員曲／全曲）」が別々のfieldsetになっており、「曲を選んで出題」を選んでいる間は
// カテゴリのfieldsetを隠す、という2段階のUIだった。本人指示により、次の4択1本にまとめる：
//   ①表題曲のみ ②表題曲＋全員曲 ③全曲 ④曲を選んで出題
// 「カテゴリ」という独立した設定概念自体をオンライン対戦からは廃止する。
//
// 【後方互換について】Firebase側のsettingsの形（categoryFilterValue・questionSource）は
// 一切変更しない。①②③は今までどおりcategoryFilterValueだけで表現し（questionSourceを
// 持たせない、または一部モードのようにquestionSource:{type:"allSongs"}を明示する）、
// ④は今までどおりcollaborativeSelectionとして表現する。そのため、この4択UIは既存の
// ルーム・既存のFirebaseデータ構造に対して読み取り専用の「見せ方」を変えるだけであり、
// 旧ルームの設定も何も壊さずそのまま4択のどれかに正しく収束する（resolveSongSourceOptionValue
// 参照）。
//
// 【④「曲を選んで出題」が隠れたカテゴリ二重フィルタを持たないようにする対応】
// js/battleModes/timeAttackBattleMode.js・lyricsQuizBattleMode.js内の
// resolveQuestionSourceSongPool()は、collaborativeSelectionのsongIdsを
// 引き続きcategoryFilterValueで絞り込む実装のままにしている（既存ロジックは変更しない）。
// その代わり、④を選んだ瞬間にcategoryFilterValueを"all"に強制することで、
// この絞り込みが実質的に「絞り込みなし」になり、「選んだ曲がそのまま出題対象になる」
// という新しい仕様を、既存コードを変更せずに実現している。

import { QUESTION_SOURCE_TYPE } from "./questionSource.js";

// 4択の選択値一覧（ラジオボタンのvalueとして使う）。
export const SONG_SOURCE_OPTION_VALUES = ["title-track", "title-and-group", "all", "manual"];

const SONG_SOURCE_CATEGORY_VALUES = new Set(["title-track", "title-and-group", "all"]);

export const SONG_SOURCE_OPTION_LABELS = {
  "title-track": "表題曲のみ",
  "title-and-group": "表題曲＋全員曲",
  all: "全曲",
  manual: "曲を選んで出題",
};

// settingsから、4択のうちどれを選ぶべきかを求める（読み取り専用・副作用なし）。
// 古い形のsettings（categoryFilterValueが無い・不明な値）でも、最も安全な既定
// （表題曲のみ）へ安全に収束する。
export function resolveSongSourceOptionValue(settings) {
  if (settings?.questionSource?.type === QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION) return "manual";
  const category = settings?.categoryFilterValue;
  return SONG_SOURCE_CATEGORY_VALUES.has(category) ? category : "title-track";
}

// 4択の選択値から、settingsへ書き込むべきフィールド（categoryFilterValue・questionSource）を
// 組み立てる。
// - mergedSongIds: ④「曲を選んで出題」のときに使う、現時点で確定している共有曲ID配列。
// - includeAllSongsQuestionSource: 歌詞クイズ画面のように、①②③でもquestionSourceに
//   明示的に{type: ALL_SONGS}を持たせる既存の流儀に合わせる場合はtrueを渡す
//   （js/battleModes/lyricsQuizBattleMode.jsのdefaultSettings()参照）。省略時（false）は
//   タイムアタック・一瞬バトルの既存の流儀どおり、①②③ではquestionSourceキー自体を持たせない。
export function buildSongSourceSettingsFields(optionValue, { mergedSongIds = [], includeAllSongsQuestionSource = false } = {}) {
  if (optionValue === "manual") {
    return {
      // 「隠れたカテゴリ二重フィルタを持たない」ようにするため、常にcategoryFilterValueを
      // "all"に固定する（コメント冒頭参照）。
      categoryFilterValue: "all",
      questionSource: { type: QUESTION_SOURCE_TYPE.COLLABORATIVE_SELECTION, songIds: mergedSongIds },
    };
  }
  const categoryFilterValue = SONG_SOURCE_CATEGORY_VALUES.has(optionValue) ? optionValue : "title-track";
  if (includeAllSongsQuestionSource) {
    return { categoryFilterValue, questionSource: { type: QUESTION_SOURCE_TYPE.ALL_SONGS } };
  }
  return { categoryFilterValue };
}

// 4択ラジオ（radioGroupName）に、settingsが表す現在の選択状態を反映する。
export function applySongSourceOptionToForm(radioGroupName, settings) {
  const value = resolveSongSourceOptionValue(settings);
  const input = document.querySelector(`input[name="${radioGroupName}"][value="${value}"]`);
  if (input) input.checked = true;
}

// 4択ラジオ（radioGroupName）から、現在チェックされている選択値を読み取る。
export function readSongSourceOptionFromForm(radioGroupName) {
  return document.querySelector(`input[name="${radioGroupName}"]:checked`)?.value ?? "title-track";
}

// ロビーのチップ・ルール確認画面など、設定を短い1行の文言で説明する共通ヘルパー。
// 「曲を選んで出題」のときは、既存のsongSourceChipロジックと同じく曲数を添える
// （本人指示：参加者には曲数だけ見せ、対戦開始前に曲名までは見せない）。
export function describeSongSourceForSettings(settings) {
  const optionValue = resolveSongSourceOptionValue(settings);
  if (optionValue === "manual") {
    const count = settings?.questionSource?.songIds?.length ?? 0;
    return `${count}曲から出題`;
  }
  return SONG_SOURCE_OPTION_LABELS[optionValue];
}
