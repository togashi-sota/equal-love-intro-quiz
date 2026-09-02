// js/onlineBattleResultReturnState.js（結果画面の「ルーム設定に戻る」個別状態・
// 「結果確認の状況」一覧描画）のテスト（2026-09-30新設・本人指示：オンライン対戦総合改修
// 第3ラウンド）。このテストランナーは実際のブラウザ上で動くため、documentを使った
// DOM描画の検証もそのまま行える。

import {
  markResultScreenResponded,
  resetResultScreenResponded,
  hasRespondedToCurrentResultScreen,
  renderResultReturnStatusList,
  RESULT_SCREEN_NAMES,
} from "../js/onlineBattleResultReturnState.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleResultReturnStateTests() {
  // ---- hasRespondedToCurrentResultScreen / markResultScreenResponded / resetResultScreenResponded ----
  {
    resetResultScreenResponded();
    assertEqual(hasRespondedToCurrentResultScreen(), false, "resetResultScreenResponded()直後はfalse（まだ何も押していない）");
    markResultScreenResponded();
    assertEqual(hasRespondedToCurrentResultScreen(), true, "markResultScreenResponded()を呼ぶとtrueになる");
    resetResultScreenResponded();
    assertEqual(hasRespondedToCurrentResultScreen(), false, "resetResultScreenResponded()で再びfalseに戻る（新しい結果画面に入るたびの初期化）");
  }

  // ---- RESULT_SCREEN_NAMES：4モードすべてを含むこと（本人指示：全対象モードへ展開） ----
  {
    assertEqual(RESULT_SCREEN_NAMES.has("onlineBattleResult"), true, "共有エンジンの結果画面が対象に含まれる");
    assertEqual(RESULT_SCREEN_NAMES.has("onlineLyricsBattleResult"), true, "歌詞クイズの結果画面が対象に含まれる");
    assertEqual(RESULT_SCREEN_NAMES.has("onlineInstantBattleResult"), true, "一瞬バトルの結果画面が対象に含まれる");
    assertEqual(RESULT_SCREEN_NAMES.has("onlineInstantCoopBattleResult"), true, "一瞬協力の結果画面が対象に含まれる");
    assertEqual(RESULT_SCREEN_NAMES.size, 4, "結果画面の対象は4モードちょうど（想定外の画面名が紛れ込んでいない）");
  }

  // ---- renderResultReturnStatusList：DOM描画の検証 ----
  {
    const list = document.createElement("ul");
    const participants = {
      "uid-a": { displayName: "がしお" },
      "uid-b": { displayName: "サブ" },
    };
    const players = {
      "uid-a": { resultReturned: true },
      "uid-b": { resultReturned: false },
    };
    renderResultReturnStatusList(list, participants, players, "uid-a");

    assertEqual(list.children.length, 2, "参加者2人分の行が描画される");

    const rowA = list.children[0];
    assertEqual(
      rowA.querySelector(".online-battle-result-return-status-name").textContent,
      "がしお（あなた）",
      "自分の行には「（あなた）」が付く"
    );
    assertEqual(
      rowA.querySelector(".online-battle-result-return-status-badge").textContent,
      "ロビーへ戻りました",
      "resultReturned:trueの参加者は「ロビーへ戻りました」と表示される"
    );
    assertEqual(
      rowA.querySelector(".online-battle-result-return-status-badge").classList.contains("is-done"),
      true,
      "resultReturned:trueの参加者にはis-doneクラスが付く"
    );

    const rowB = list.children[1];
    assertEqual(
      rowB.querySelector(".online-battle-result-return-status-name").textContent,
      "サブ",
      "他人の行には「（あなた）」が付かない"
    );
    assertEqual(
      rowB.querySelector(".online-battle-result-return-status-badge").textContent,
      "結果確認中",
      "resultReturned:falseの参加者は「結果確認中」と表示される"
    );
    assertEqual(
      rowB.querySelector(".online-battle-result-return-status-badge").classList.contains("is-waiting"),
      true,
      "resultReturned:falseの参加者にはis-waitingクラスが付く"
    );
  }

  // ---- renderResultReturnStatusList：呼び出しのたびに前回の内容を消して描画し直す ----
  {
    const list = document.createElement("ul");
    renderResultReturnStatusList(list, { a: { displayName: "1人目" } }, { a: { resultReturned: false } }, "a");
    assertEqual(list.children.length, 1, "1回目の呼び出しで1行描画される");
    renderResultReturnStatusList(
      list,
      { a: { displayName: "1人目" }, b: { displayName: "2人目" } },
      { a: { resultReturned: true }, b: { resultReturned: false } },
      "a"
    );
    assertEqual(list.children.length, 2, "2回目の呼び出しでは前回の内容を消してから2行描画する（重複しない）");
  }

  // ---- renderResultReturnStatusList：安全側の挙動（要素が無い・参加者が空） ----
  {
    // listElementがnullでも例外を投げない（呼び出し元がelements.resultReturnStatusListを
    // オプショナルチェイニング無しで渡しても安全なように）。
    renderResultReturnStatusList(null, { a: { displayName: "x" } }, {}, "a");

    const emptyList = document.createElement("ul");
    renderResultReturnStatusList(emptyList, {}, {}, "a");
    assertEqual(emptyList.children.length, 0, "参加者が0人なら何も描画しない");

    const listWithMissingPlayer = document.createElement("ul");
    renderResultReturnStatusList(listWithMissingPlayer, { a: { displayName: "x" } }, {}, "a");
    assertEqual(
      listWithMissingPlayer.querySelector(".online-battle-result-return-status-badge").textContent,
      "結果確認中",
      "room.playersに該当uidの情報が無い場合も、安全に「結果確認中」（未戻り）として扱う"
    );
  }
}
