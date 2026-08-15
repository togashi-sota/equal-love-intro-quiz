// callGuidePanel.js（コールガイドの純粋関数部分）のテスト。
// DOM構築（render系）は対象外とし、事実情報の整形・検索ロジックだけを検証する。

import {
  getSourceTypeNote,
  formatCreditLabel,
  findSongPenlightGuide,
  findSongCallCredits,
  formatDifficultyLabel,
  formatFrequencyLabel,
  formatCategoryLabel,
  formatSourceBadgeLabel,
  formatUsedInEqualLoveNote,
  findSongSpecificKoujou,
  getMustKnowMixGuide,
  filterMixGuideByCategory,
} from "../js/callGuidePanel.js";
import { assertEqual } from "./test-utils.js";

export function runCallGuidePanelTests() {
  // ---- getSourceTypeNote ----
  // 本人指示（2026-08-06）により、officialを含む全種類で出典の確からしさを明示する。
  assertEqual(getSourceTypeNote("official"), "公式情報・公式動画で確認", "officialの注記");
  assertEqual(getSourceTypeNote("reliable"), "信頼できる媒体で確認", "reliableの注記");
  assertEqual(getSourceTypeNote("self"), "メンバー本人が発信", "selfの注記（本人＝メンバー自身）");
  assertEqual(
    getSourceTypeNote("fan"),
    "ファンの間で使われている、またはライブで定着しているとされる情報です",
    "fanは断定しない表現の注記"
  );
  assertEqual(
    getSourceTypeNote("unknown-type"),
    "出典が確認できていない情報です",
    "未知のsourceTypeは出典未確認の注記（安全側に倒す）"
  );

  // ---- formatCreditLabel ----
  assertEqual(
    formatCreditLabel({ creditType: "考案", creditName: "ダミー太郎" }),
    "考案：ダミー太郎",
    "考案タイプのラベルが正しく組み立てられる"
  );
  assertEqual(
    formatCreditLabel({ creditType: "発信", creditName: "ダミー花子" }),
    "発信：ダミー花子",
    "発信タイプのラベルが正しく組み立てられる"
  );

  // ---- findSongPenlightGuide / findSongCallCredits ----
  assertEqual(
    findSongPenlightGuide("this-song-id-does-not-exist"),
    null,
    "存在しないsongIdはnullを返す（曲指定色）"
  );
  assertEqual(
    findSongCallCredits("this-song-id-does-not-exist"),
    null,
    "存在しないsongIdはnullを返す（コール考案者）"
  );
  assertEqual(
    findSongPenlightGuide("boku-no-heroine") !== null,
    true,
    "実データに登録済みのsongIdは見つかる（曲指定色）"
  );
  assertEqual(
    findSongCallCredits("umi-to-lemon-tea") !== null,
    true,
    "実データに登録済みのsongIdは見つかる（コール考案者）"
  );

  // ---- formatDifficultyLabel / formatFrequencyLabel / formatCategoryLabel ----
  // 【2026-08-17改訂】本人指示により、絵文字付きの一目で分かるバッジ表記へ変更
  // （「🌟メンバー考案／📣ライブ定番／🔰初心者おすすめ」のような表現）。
  assertEqual(formatDifficultyLabel("beginner"), "🔰 初心者向け", "beginnerの難易度ラベル");
  assertEqual(formatDifficultyLabel("intermediate"), "🙂 慣れてきた人向け", "intermediateの難易度ラベル");
  assertEqual(formatDifficultyLabel("advanced"), "🔥🔥 上級者向け", "advancedの難易度ラベル");
  assertEqual(formatDifficultyLabel("unknown"), "難易度不明", "未知の難易度は安全側の表示");
  assertEqual(formatFrequencyLabel("common"), "🔥 よく使う", "commonの頻度ラベル");
  assertEqual(formatFrequencyLabel("situational"), "🎯 一部の曲で使う", "situationalの頻度ラベル");
  assertEqual(formatFrequencyLabel("rare"), "✨ 特殊", "rareの頻度ラベル");
  assertEqual(formatCategoryLabel("mix"), "基本MIX", "mixカテゴリのラベル");
  assertEqual(formatCategoryLabel("song-specific-koujou"), "曲専用口上", "曲専用口上カテゴリのラベル");

  // ---- formatSourceBadgeLabel（2026-08-17追加） ----
  assertEqual(formatSourceBadgeLabel("official"), "🏛 公式情報", "officialの出所バッジ");
  assertEqual(formatSourceBadgeLabel("self"), "🌟 メンバー発信", "selfの出所バッジ");
  assertEqual(formatSourceBadgeLabel("reliable"), "📰 報道で確認", "reliableの出所バッジ");
  assertEqual(formatSourceBadgeLabel("fan"), "📣 ライブ定番", "fanの出所バッジ");
  assertEqual(formatSourceBadgeLabel("unknown-type"), "❔ 出典未確認", "未知のsourceTypeは安全側の表示");

  // ---- formatUsedInEqualLoveNote ----
  assertEqual(formatUsedInEqualLoveNote(true), null, "使用確認済みなら注記なし");
  assertEqual(
    formatUsedInEqualLoveNote(false),
    "＝LOVEでの使用は確認できませんでした（参考情報）。",
    "使用が確認できなかった場合の注記"
  );
  assertEqual(
    formatUsedInEqualLoveNote(null),
    "＝LOVEでの使用有無は今回確認できませんでした。",
    "使用有無が未確認の場合の注記"
  );

  // ---- findSongSpecificKoujou ----
  assertEqual(findSongSpecificKoujou(null), [], "songIdがnullなら空配列");
  assertEqual(findSongSpecificKoujou("this-song-id-does-not-exist"), [], "対象がない曲は空配列");
  assertEqual(
    findSongSpecificKoujou("umi-to-lemon-tea").length,
    1,
    "海とレモンティーには専用口上が1件登録されている"
  );
  assertEqual(
    findSongSpecificKoujou("umi-to-lemon-tea")[0].id,
    "umi-lemon-koujou",
    "海とレモンティーの専用口上のIDが正しい"
  );

  // ---- getMustKnowMixGuide ----
  const mustKnow = getMustKnowMixGuide();
  assertEqual(mustKnow.length, 3, "「まず覚える3つ」は3件登録されている");
  assertEqual(
    mustKnow.every((entry) => entry.recommendedPriority === "must-know"),
    true,
    "「まず覚える3つ」は全てrecommendedPriority:must-know"
  );

  // ---- filterMixGuideByCategory ----
  assertEqual(
    filterMixGuideByCategory("song-specific-koujou").every((entry) => entry.category === "song-specific-koujou"),
    true,
    "カテゴリ絞り込みで指定外のカテゴリが混ざらない"
  );
  assertEqual(
    filterMixGuideByCategory("all").length >= filterMixGuideByCategory("mix").length,
    true,
    "'all'は他のどのカテゴリより件数が少なくならない"
  );
}
