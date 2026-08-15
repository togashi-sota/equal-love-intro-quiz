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
  findSongRelatedGuideEntries,
  getMustKnowMixGuide,
  filterMixGuideByCategory,
  getCurrentOshiName,
} from "../js/callGuidePanel.js";
import { MEMBERS } from "../js/data/members.js";
import { setMostOshiMember, clearMostOshiMember } from "../js/oshiMembers.js";
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

  // ---- formatSourceBadgeLabel ----
  // 【2026-08-24改訂】本人指示（コールガイド大規模改修セクション11）により、
  // 「🔵公式指定／🩷メンバー発信／✨ファン定番」を混同しない表記へ統一
  // （曲指定コール・ペンライト・MIX/口上の全タブで共通のバッジとして使う）。
  assertEqual(formatSourceBadgeLabel("official"), "🔵 公式情報", "officialの出所バッジ");
  assertEqual(formatSourceBadgeLabel("self"), "🩷 メンバー発信", "selfの出所バッジ");
  assertEqual(formatSourceBadgeLabel("reliable"), "📰 報道で確認", "reliableの出所バッジ");
  assertEqual(formatSourceBadgeLabel("fan"), "✨ ファン定番", "fanの出所バッジ");
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

  // ---- findSongRelatedGuideEntries（2026-08-24追加） ----
  // カテゴリを問わず、その曲に関連するガイド（曲専用口上・ガチ恋キャンセル等）を全て拾えることを確認する。
  assertEqual(findSongRelatedGuideEntries(null), [], "songIdがnullなら空配列");
  assertEqual(
    findSongRelatedGuideEntries("naisho-banashi").some((entry) => entry.id === "gachikoi-cancel"),
    true,
    "内緒バナシはガチ恋キャンセルの対象曲として見つかる（本人指示セクション6）"
  );
  assertEqual(
    findSongRelatedGuideEntries("bukatsuchu-ni-megaau-natte-omotteta-nda").some(
      (entry) => entry.id === "gachikoi-cancel"
    ),
    true,
    "「部活中に目が合うなって思ってたんだ」もガチ恋キャンセルの対象曲として見つかる"
  );
  assertEqual(
    findSongRelatedGuideEntries("umi-to-lemon-tea").some((entry) => entry.id === "umi-lemon-koujou"),
    true,
    "曲専用口上（category違い）もfindSongRelatedGuideEntriesで見つかる"
  );

  // ---- 園長MIX（danchou-mix）が削除されていることの確認（本人指示セクション3） ----
  assertEqual(
    filterMixGuideByCategory("all").some((entry) => entry.id === "danchou-mix"),
    false,
    "＝LOVEでの使用実績が確認できなかった園長MIXは一覧に残っていない"
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

  // ---- 一続き表示（continuousText）が英語MIX・日本語MIXに追加されていることの確認 ----
  // 本人指示セクション1・2：「単語別」と「一続き」の両方を用意する。
  const englishMix = filterMixGuideByCategory("mix").find((entry) => entry.id === "english-mix");
  const japaneseMix = filterMixGuideByCategory("mix").find((entry) => entry.id === "japanese-mix");
  assertEqual(typeof englishMix.continuousText, "string", "英語MIXに一続き表示用のテキストがある");
  assertEqual(englishMix.continuousText.length > 0, true, "英語MIXの一続きテキストが空でない");
  assertEqual(typeof japaneseMix.continuousText, "string", "日本語MIXに一続き表示用のテキストがある");

  // ---- ガチ恋口上のplaceholderNote（本人指示セクション5） ----
  const gachikoiKoujou = filterMixGuideByCategory("koujou").find((entry) => entry.id === "gachikoi-koujou");
  assertEqual(
    typeof gachikoiKoujou.placeholderNote === "string" && gachikoiKoujou.placeholderNote.length > 0,
    true,
    "ガチ恋口上に「○○には推しの名前を入れる」という説明がある"
  );
  assertEqual(
    formatDifficultyLabel(gachikoiKoujou.difficulty),
    "🔰 初心者向け",
    "ガチ恋口上は初心者向けに分類されている（本人指示セクション4）"
  );

  // ---- 掛け声本文の著作権区分（2026-08-15改訂） ----
  // ガチ恋口上・ガチ恋キャンセルは、＝LOVE固有の創作物ではなく複数の独立した一般的な
  // アイドル文化解説サイトで内容が一致する定型文であることを確認できたため、本文を追加した。
  // 一方、メンバー個人の創作性が高い曲専用口上（海レモ口上・推しセカ口上）は、
  // 引き続き本文を含めない方針を維持している（Gitに掲載する情報の境界を明確にする）。
  const gachikoiCancel = filterMixGuideByCategory("koujou").find((entry) => entry.id === "gachikoi-cancel");
  assertEqual(gachikoiKoujou.textLines.length > 0, true, "ガチ恋口上は定型文のため本文を含む");
  assertEqual(gachikoiKoujou.continuousText.length > 0, true, "ガチ恋口上に一続き表示用のテキストがある");
  assertEqual(gachikoiCancel.textLines.length > 0, true, "ガチ恋キャンセルはガチ恋口上と共通の本文を含む");
  const umiLemonKoujou = filterMixGuideByCategory("song-specific-koujou").find(
    (entry) => entry.id === "umi-lemon-koujou"
  );
  const oshiSekaKoujou = filterMixGuideByCategory("song-specific-koujou").find(
    (entry) => entry.id === "oshi-no-iru-sekai-koujou"
  );
  assertEqual(umiLemonKoujou.textLines.length, 0, "海レモ口上は個人の創作物のため本文を含めない");
  assertEqual(oshiSekaKoujou.textLines.length, 0, "推しセカ口上も本文を含めない（考案者・文面とも未確認のため）");

  // ---- getCurrentOshiName（2026-08-24追加） ----
  // membersScreen.test.jsと同じく、実在のメンバーIDでsetMostOshiMember/clearMostOshiMemberを
  // 使い、テスト前後で状態を元に戻す（localStorageを使う関数のため）。
  const testOshiMember = MEMBERS[0];
  clearMostOshiMember();
  assertEqual(getCurrentOshiName(), null, "推し未設定のときはnullを返す");
  setMostOshiMember(testOshiMember.id);
  assertEqual(getCurrentOshiName(), testOshiMember.name, "最推し設定済みのときはその名前を返す");
  clearMostOshiMember();
}
