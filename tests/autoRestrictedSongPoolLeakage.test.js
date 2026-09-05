// 「①②③（表題曲のみ／表題曲＋全員曲／全曲）を選んでいるのに、参加者のデータ状況の差で
// 一時的にjs/onlineBattleSongAvailability.jsのrestrictSettingsToCommonlyAvailableSongs()が
// 自動でcollaborativeSelectionへ絞り込んだ後、その状態が「④曲を選んで出題を本人が選んだ」
// 場合と区別されずに扱われてしまい、以下の2つの不具合につながっていた問題
// （2026-09-05、実機・実Firebaseで確認・修正）の回帰防止テスト。
//
// 不具合A（即時にブロックされる）：js/onlineBattleScreen.jsのsyncCollaborativeSongPoolIfHost()
//   （・js/onlineLyricsQuizBattleScreen.jsの同等関数）が、自動絞り込みで確定したsongIdsを
//   「まだ誰も曲選択画面を開いていない（selectedSongIds空）」と誤認して0件へ上書きしてしまい、
//   「出題する曲が選ばれていません」で再戦がブロックされる。
// 不具合B（絞り込みが永久に戻らない）：参加者のデータ状況が改善して共通曲が増えても、
//   一度絞り込まれた曲数（songIds）を「絞り込み前の出題対象」として扱ってしまうため、
//   二度と元のカテゴリの広さへ戻らない（js/onlineBattle.jsのresolveBaseSettingsForSongPool()
//   参照）。
//
// 修正：restrictSettingsToCommonlyAvailableSongs()が付けるcollaborativeSelectionに
// autoRestrictedToCommonSongs:trueという目印を付け、「本人が④を選んだ場合」だけを対象に
// している各所（同期・UI表示・モード変更時の引き継ぎ）で、この目印が付いている場合は
// 対象外として扱うようにした。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineBattle.js・js/onlineBattleScreen.js・
// js/onlineLyricsQuizBattleScreen.js・js/onlineBattleSongAvailability.jsはFirebase接続・
// DOM要素の大量取得を伴い、tests.htmlのようなテスト環境へ安全にimportできない
// （tests/questionSourceModeLeakage.test.js等と同じ理由）。
import { assertEqual } from "./test-utils.js";

export async function runAutoRestrictedSongPoolLeakageTests() {
  // ---- js/onlineBattleSongAvailability.jsが、絞り込み結果にautoRestrictedToCommonSongsを
  //      付けている ----
  {
    const response = await fetch("js/onlineBattleSongAvailability.js");
    const source = await response.text();
    assertEqual(source.length > 500, true, "js/onlineBattleSongAvailability.jsのソースを取得できた（前提条件）");
    assertEqual(
      source.includes('questionSource: { type: "collaborativeSelection", songIds: restrictedPool, autoRestrictedToCommonSongs: true }'),
      true,
      "restrictSettingsToCommonlyAvailableSongs()が返すquestionSourceに、autoRestrictedToCommonSongs:trueの目印が付いている"
    );
  }

  // ---- js/onlineBattleScreen.jsの2箇所（選曲同期・UI表示2箇所）が目印を見ている ----
  {
    const response = await fetch("js/onlineBattleScreen.js");
    const source = await response.text();
    assertEqual(source.length > 1000, true, "js/onlineBattleScreen.jsのソースを取得できた（前提条件）");

    const syncFnStart = source.indexOf("async function syncCollaborativeSongPoolIfHost(room, isHost, isLyricsQuiz) {");
    assertEqual(syncFnStart !== -1, true, "syncCollaborativeSongPoolIfHost()が存在する（前提条件）");
    const syncFnBody = source.slice(syncFnStart, syncFnStart + 800);
    assertEqual(
      syncFnBody.includes("settings.questionSource.autoRestrictedToCommonSongs") && syncFnBody.includes("return;"),
      true,
      "syncCollaborativeSongPoolIfHost()が、自動絞り込み由来のcollaborativeSelectionでは選曲同期を行わずに抜ける"
    );

    const collabSectionFnStart = source.indexOf("function updateCollabSongSectionUi(room, isLyricsQuiz) {");
    assertEqual(collabSectionFnStart !== -1, true, "updateCollabSongSectionUi()が存在する（前提条件）");
    const collabSectionFnBody = source.slice(collabSectionFnStart, collabSectionFnStart + 600);
    assertEqual(
      collabSectionFnBody.includes("!room.settings.questionSource.autoRestrictedToCommonSongs"),
      true,
      "updateCollabSongSectionUi()が、自動絞り込み中は④専用の選曲編集UIを表示しない"
    );

    const noticeAnchor = "const isUsingCollaborativeSelection =";
    const noticeIndex = source.indexOf(noticeAnchor);
    assertEqual(noticeIndex !== -1, true, "isUsingCollaborativeSelectionの判定コードが存在する（前提条件）");
    const noticeBlock = source.slice(noticeIndex, noticeIndex + 300);
    assertEqual(
      noticeBlock.includes("!room.settings.questionSource.autoRestrictedToCommonSongs"),
      true,
      "自動絞り込み中は「現在、共通曲はN曲です」バナーを隠さない（利用者へ絞り込みを伝える唯一の表示のため）"
    );
  }

  // ---- js/onlineLyricsQuizBattleScreen.jsの同期関数・UI表示も目印を見ている ----
  {
    const response = await fetch("js/onlineLyricsQuizBattleScreen.js");
    const source = await response.text();
    assertEqual(source.length > 1000, true, "js/onlineLyricsQuizBattleScreen.jsのソースを取得できた（前提条件）");

    const syncFnStart = source.indexOf("async function syncLyricsCollaborativeSongPoolIfHost(room, isHost) {");
    assertEqual(syncFnStart !== -1, true, "syncLyricsCollaborativeSongPoolIfHost()が存在する（前提条件）");
    const syncFnBody = source.slice(syncFnStart, syncFnStart + 600);
    assertEqual(
      syncFnBody.includes("settings.questionSource.autoRestrictedToCommonSongs") && syncFnBody.includes("return;"),
      true,
      "syncLyricsCollaborativeSongPoolIfHost()が、自動絞り込み由来のcollaborativeSelectionでは選曲同期を行わずに抜ける"
    );

    const collabSectionFnStart = source.indexOf("function updateLyricsCollabSongSectionUi(room) {");
    assertEqual(collabSectionFnStart !== -1, true, "updateLyricsCollabSongSectionUi()が存在する（前提条件）");
    const collabSectionFnBody = source.slice(collabSectionFnStart, collabSectionFnStart + 400);
    assertEqual(
      collabSectionFnBody.includes("!room.settings.questionSource.autoRestrictedToCommonSongs"),
      true,
      "updateLyricsCollabSongSectionUi()も、自動絞り込み中は④専用の選曲編集UIを表示しない"
    );
  }

  // ---- js/onlineBattle.jsが、絞り込み前の出題対象の計算しなおし・モード変更時の
  //      引き継ぎ除外の両方に対応している ----
  {
    const response = await fetch("js/onlineBattle.js");
    const source = await response.text();
    assertEqual(source.length > 1000, true, "js/onlineBattle.jsのソースを取得できた（前提条件）");

    assertEqual(
      source.includes("function resolveBaseSettingsForSongPool(settings) {"),
      true,
      "resolveBaseSettingsForSongPool()が新設されている（絞り込み前の基準を計算しなおすための関数）"
    );

    // resolveBattleStartValidation()・resolveRematchSettingsValidation()の両方が、
    // resolveSongPoolForSettings()にsettingsそのものではなくbaseSettingsForSongPoolを渡している
    // （絞り込みが二度と元の広さへ戻らない不具合Bの回帰確認）。
    const usageCount = source.split("resolveSongPoolForSettings(room.gameMode, baseSettingsForSongPool)").length - 1;
    assertEqual(
      usageCount >= 2,
      true,
      "resolveBattleStartValidation()・resolveRematchSettingsValidation()の両方が、絞り込み前の基準（baseSettingsForSongPool）から出題対象を計算しなおしている"
    );

    const wasCollabAnchor = "const wasCollaborativeSelection =";
    const wasCollabIndex = source.indexOf(wasCollabAnchor);
    assertEqual(wasCollabIndex !== -1, true, "wasCollaborativeSelectionの判定コードが存在する（前提条件）");
    const wasCollabBlock = source.slice(wasCollabIndex, wasCollabIndex + 400);
    assertEqual(
      wasCollabBlock.includes("!room.settings.questionSource.autoRestrictedToCommonSongs"),
      true,
      "モード変更時の引き継ぎ判定（wasCollaborativeSelection）が、自動絞り込み由来のcollaborativeSelectionは引き継ぎ対象から除外している"
    );
  }
}
