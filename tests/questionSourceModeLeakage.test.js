// 「歌詞クイズ対戦を遊んだ後に一瞬バトル／一瞬協力へモード変更すると、
// 『もう一度』（再戦）が『出題する曲が選ばれていません』で誤ってブロックされる」不具合
// （2026-09-05、実機・実Firebaseで確認・修正）の回帰防止テスト。
//
// 【原因】settings.questionSource（「④曲を選んで出題」UI専用のフィールド）が、モード変更
// （js/onlineBattle.jsのupdateRoomGameMode()）や、参加者の共通曲への絞り込み後の再同期
// （js/onlineBattleScreen.jsのsyncCollaborativeSongPoolIfHost()）を経て、この4択UI自体を
// 持たない一瞬バトル・一瞬協力にまで引き継がれ、「誰も編集できない、曲数0件の
// questionSource」として残ってしまい、出題可能曲の判定を壊していた。
//
// 【なぜソーステキストの構造チェックなのか】js/onlineBattle.js・js/onlineBattleScreen.jsは
// Firebase接続・DOM要素の大量取得を伴い、tests.htmlのようなテスト環境へ安全にimport
// できない（tests/songlist.test.js等と同じ理由）。js/battleModes/index.jsの
// supportsManualSongSelection()自体は純粋関数のため、tests/battleModes/index.test.jsで
// 直接テスト済み。ここでは「その判定を実際に使っているか」をソース構造で確認する。
import { assertEqual } from "./test-utils.js";

export async function runQuestionSourceModeLeakageTests() {
  // ---- js/onlineBattle.jsのupdateRoomGameMode()：切り替え先モードが対応している場合だけ
  //      questionSourceを引き継ぐ ----
  {
    const response = await fetch("js/onlineBattle.js");
    const source = await response.text();
    assertEqual(source.length > 1000, true, "js/onlineBattle.jsのソースを取得できた（前提条件）");

    // 【2026-09-05改訂】自動絞り込み（autoRestrictedToCommonSongs）の横断監査に伴い、
    // wasCollaborativeSelectionの定義が複数行の条件式へ変わったため、アンカーも合わせて更新した。
    const anchor = "const wasCollaborativeSelection =";
    const anchorIndex = source.indexOf(anchor);
    assertEqual(anchorIndex !== -1, true, "wasCollaborativeSelectionの判定コードが存在する（前提条件）");

    const nearbyBlock = source.slice(anchorIndex, anchorIndex + 400);
    assertEqual(
      nearbyBlock.includes("supportsManualSongSelection(gameMode)"),
      true,
      "questionSourceの引き継ぎ条件に、切り替え先gameModeのsupportsManualSongSelection()判定が含まれている" +
        "（曲名/モード名の直接比較ではなく、モードごとの対応可否で判定している）"
    );
    // 修正前の「wasCollaborativeSelectionだけを条件にしていた」書き方に戻っていないことも確認する
    // （if文の条件式そのものに両方が含まれていること。括弧を含む関数呼び出しがあるため
    // 正規表現ではなく、if文の開始位置から閉じ括弧"{"までの範囲を素朴に切り出して確認する）。
    const ifStartIndex = nearbyBlock.indexOf("if (wasCollaborativeSelection");
    assertEqual(ifStartIndex !== -1, true, "questionSourceを引き継ぐif文が存在する（前提条件）");
    const ifOpenBraceIndex = nearbyBlock.indexOf("{", ifStartIndex);
    const ifConditionText = nearbyBlock.slice(ifStartIndex, ifOpenBraceIndex);
    assertEqual(
      ifConditionText.includes("supportsManualSongSelection"),
      true,
      "if文の条件式そのものにsupportsManualSongSelection()が含まれている（wasCollaborativeSelection単独の条件に戻っていない）"
    );
  }

  // ---- js/onlineBattleScreen.jsのsyncCollaborativeSongPoolIfHost()：対応していないモード
  //      （isLyricsQuiz以外にinstantBattle/instantCoopも含む）では何もしない ----
  {
    const response = await fetch("js/onlineBattleScreen.js");
    const source = await response.text();
    assertEqual(source.length > 1000, true, "js/onlineBattleScreen.jsのソースを取得できた（前提条件）");

    const fnStart = source.indexOf("async function syncCollaborativeSongPoolIfHost(room, isHost, isLyricsQuiz) {");
    assertEqual(fnStart !== -1, true, "syncCollaborativeSongPoolIfHost()関数が存在する（前提条件）");

    const fnBody = source.slice(fnStart, fnStart + 400);
    assertEqual(
      fnBody.includes("supportsManualSongSelection(room.gameMode)"),
      true,
      "syncCollaborativeSongPoolIfHost()の先頭ガードに、room.gameModeのsupportsManualSongSelection()判定が含まれている"
    );
  }

  // ---- js/main.jsが、歌詞データインポート成功後にrecheckLyricsCoverageAfterImport()を呼ぶ ----
  // （不具合2：ロビー内で歌詞データを追加インポートしても、同じカテゴリのままだと
  //  読み込み済み曲数の表示が更新されない問題の修正）
  {
    const response = await fetch("js/main.js");
    const source = await response.text();
    assertEqual(source.length > 1000, true, "js/main.jsのソースを取得できた（前提条件）");

    const callCount = source.split("recheckLyricsCoverageAfterImport()").length - 1;
    // import文1回 + 実際の呼び出し3箇所（直接インポート・警告確認保存・データパック取り込み）。
    assertEqual(callCount >= 3, true, "recheckLyricsCoverageAfterImport()が主要な歌詞データ取り込み経路すべてから呼ばれている");
  }
}
