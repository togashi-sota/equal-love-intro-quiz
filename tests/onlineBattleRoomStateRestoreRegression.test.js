// js/onlineBattleScreen.jsの「結果→ロビー復帰後、latestRoomがnullのままになり『ルール・
// 遊び方』『友達を招待』等が無反応になる」バグ（2026-09-06修正：v303で一度直した箇所とは
// 別の、もう1つの遷移経路が漏れていた再発）の回帰防止テスト。
//
// 【なぜ通常の関数呼び出しテストではなく、ソーステキストの構造チェックなのか】
// この不具合の本体は「resetOnlineBattleMatchState()がlatestRoom（モジュール内の
// プライベートな状態変数）をnullへ戻した後、特定の分岐（RETURN_TO_LOBBY）だけが
// それを復元し忘れる」という、巨大でDOM・Firebaseに強く依存する画面モジュール内の
// 手続き的な「順序」のバグだった。この画面全体をテスト環境へ安全にimportする（DOM要素・
// Firebase初期化を伴う大量の副作用がある）のは現実的ではないため、既存の恒久テストは
// 主に「Firebaseに触れない純粋関数」だけを切り出して検証する方針を取っている
// （tests/onlineBattleStatusTransitionPayloads.test.js等）。
//
// このバグは「復元し忘れる」という手続き上の欠落そのものが本質のため、ソースコードの
// テキスト構造を直接検査し、「resetOnlineBattleMatchState()を呼んだ分岐では、必ず
// その後にlatestRoomの復元（またはrenderLobbyへの再委譲）が続いている」という不変条件を
// 機械的に確認する。将来また同じ分岐（またはresetOnlineBattleMatchState()を呼ぶ新しい
// 分岐）が追加されたときに、復元を書き忘れると即座にこのテストが失敗するようにする。
import { assertEqual } from "./test-utils.js";

// resetOnlineBattleMatchState()の呼び出し位置から、次の閉じ括弧（同じネスト深さの終端）
// までの範囲を1つの「ブロック」として切り出す、ごく単純な括弧カウント方式の抽出。
function extractBlocksAfter(sourceText, marker) {
  const blocks = [];
  let searchFrom = 0;
  while (true) {
    const markerIndex = sourceText.indexOf(marker, searchFrom);
    if (markerIndex === -1) break;
    // markerの直後から、次の "break;"（switch caseの終端。このファイルの各caseは
    // 必ずbreak;で終わる規約になっている）までを1ブロックとして扱う。
    const breakIndex = sourceText.indexOf("break;", markerIndex);
    const blockEnd = breakIndex === -1 ? Math.min(sourceText.length, markerIndex + 2000) : breakIndex;
    blocks.push(sourceText.slice(markerIndex, blockEnd));
    searchFrom = blockEnd + 1;
  }
  return blocks;
}

export async function runOnlineBattleRoomStateRestoreRegressionTests() {
  const response = await fetch("js/onlineBattleScreen.js");
  const sourceText = await response.text();

  assertEqual(sourceText.length > 1000, true, "js/onlineBattleScreen.jsのソースを取得できた（テストの前提条件）");

  // ---- RETURN_TO_LOBBY分岐：resetOnlineBattleMatchState()の直後、同じcaseブロック内で
  //      latestRoomが復元されていることを確認する（2026-09-06修正の核心）。 ----
  {
    const returnToLobbyCaseIndex = sourceText.indexOf("ONLINE_BATTLE_TRANSITION_ACTION.RETURN_TO_LOBBY:");
    assertEqual(returnToLobbyCaseIndex !== -1, true, "RETURN_TO_LOBBY分岐が存在する");

    const resetCallIndexInCase = sourceText.indexOf("resetOnlineBattleMatchState();", returnToLobbyCaseIndex);
    assertEqual(
      resetCallIndexInCase !== -1 && resetCallIndexInCase - returnToLobbyCaseIndex < 2000,
      true,
      "RETURN_TO_LOBBY分岐の中でresetOnlineBattleMatchState()が呼ばれている"
    );

    const caseBlockEnd = sourceText.indexOf("break;", resetCallIndexInCase);
    const caseBlockText = sourceText.slice(resetCallIndexInCase, caseBlockEnd);

    assertEqual(
      /latestRoom\s*=\s*room\s*;/.test(caseBlockText),
      true,
      "【回帰防止の核心】RETURN_TO_LOBBY分岐で、resetOnlineBattleMatchState()の後に必ずlatestRoom=roomの復元が続いている。" +
        "これが無いと、結果→ロビー自動復帰のたびにlatestRoomがnullのまま固まり、「ルール・遊び方」「友達を招待」等が無反応になる（今回発見・修正したバグそのもの）"
    );
  }

  // ---- resultReturnButtonのクリックハンドラ：v303で修正済みの箇所が壊れていないことも
  //      合わせて確認する（同じ根本原因の別の顔のため、退行しやすい）。 ----
  {
    const handlerIndex = sourceText.indexOf('resultReturnButton?.addEventListener("click"');
    assertEqual(handlerIndex !== -1, true, "resultReturnButtonのクリックハンドラが存在する");

    // 【固定文字数の窓で切り出す理由】ハンドラ本体には`cancelRematchReadyCheck({ ... });`の
    // ような、末尾が"});"で終わる関数呼び出しがハンドラの途中に含まれており、単純な
    // indexOf("});", ...)ではその内側の呼び出しの終端を誤って「ハンドラの終わり」と
    // 検出してしまう（実際に一度この誤検出でテストが誤って失敗した）。ハンドラ本体は
    // 数十行程度のため、十分に余裕を持った固定windowで代用する。
    const handlerText = sourceText.slice(handlerIndex, handlerIndex + 1500);

    assertEqual(
      /const roomForImmediateLobbyRerender = latestRoom;/.test(handlerText),
      true,
      "resultReturnButtonハンドラで、resetOnlineBattleMatchState()を呼ぶ前にlatestRoomを確保している（v303修正の維持確認）"
    );
    assertEqual(
      /renderLobby\(roomForImmediateLobbyRerender\)/.test(handlerText),
      true,
      "resultReturnButtonハンドラで、確保しておいたroomを使って即座にrenderLobby()を呼び直している（v303修正の維持確認）"
    );
  }

  // ---- resetOnlineBattleMatchState()を呼ぶ全箇所を洗い出し、「ロビーへnavigateTo する
  //      箇所は、必ず同じ関数内でlatestRoomの復元が伴う」という不変条件を、既知の
  //      6箇所（調査で確認済みの呼び出し元）について再確認する。新しい呼び出し箇所が
  //      増えた場合、この件数自体が変わるためこのテストで検知できる。 ----
  {
    const resetCallCount = (sourceText.match(/resetOnlineBattleMatchState\(\);/g) || []).length;
    assertEqual(
      resetCallCount,
      8,
      "resetOnlineBattleMatchState()の呼び出し箇所は8箇所のまま（新しい呼び出し箇所が増えた場合は、そこでもlatestRoom復元が必要かどうかを確認すること。件数が変わったらこの数値を更新した上で、追加箇所の復元有無を目視確認する）"
    );
  }
}
