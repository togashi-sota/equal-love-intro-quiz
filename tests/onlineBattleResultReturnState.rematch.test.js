// js/onlineBattleResultReturnState.jsに追加した、再戦準備の「参加者ごとの準備状況リスト」
// 共通描画（renderRematchReadinessList）・キック処理（createRematchKickHandler）のテスト
// （2026-10-01新設・本人指示：結果画面/再戦フロー全面設計）。
//
// 【本人指示：最大10人までの状態遷移を自動テストで検証】実機は2台しか用意できないため、
// 2/3/5/10人でリストが正しく描画されること・ホストだけにキックボタンが出ることを、
// 実際のDOM要素を使って確認する（tests.htmlは実ブラウザ上で動くため、本物のDOM操作を
// そのままテストできる）。

import { renderRematchReadinessList, createRematchKickHandler } from "../js/onlineBattleResultReturnState.js";
import { assertEqual } from "./test-utils.js";

function buildPlayers(count, { readyUptoIndex = -1, hostIndex = 0 } = {}) {
  const players = {};
  for (let i = 0; i < count; i += 1) {
    players[`p${i}`] = {
      name: `プレイヤー${i}`,
      isHost: i === hostIndex,
      rematchReady: i <= readyUptoIndex,
    };
  }
  return players;
}

export async function runOnlineBattleResultReturnStateRematchTests() {
  // ---- renderRematchReadinessList：N人（2/3/5/10）で行数・準備バッジ・キックボタンの出し分け ----
  [2, 3, 5, 10].forEach((n) => {
    const container = document.createElement("ul");
    const players = buildPlayers(n, { readyUptoIndex: 0, hostIndex: 0 }); // p0（ホスト）だけ準備OK

    // ホスト（p0）視点：自分以外の全員にキックボタンが出る。
    renderRematchReadinessList(container, players, "p0", true);
    assertEqual(container.children.length, n, `${n}人：ホスト視点でリストの行数がN人ぶんになる`);
    const kickButtonsAsHost = container.querySelectorAll("[data-rematch-kick-uid]");
    assertEqual(kickButtonsAsHost.length, n - 1, `${n}人：ホスト視点では自分以外の${n - 1}人ぶんキックボタンが出る`);
    assertEqual(
      [...kickButtonsAsHost].every((btn) => btn.dataset.rematchKickUid !== "p0"),
      true,
      `${n}人：ホスト自身の行にはキックボタンが出ない`
    );

    // ゲスト（p1）視点：誰にもキックボタンが出ない。
    renderRematchReadinessList(container, players, "p1", false);
    assertEqual(container.children.length, n, `${n}人：ゲスト視点でもリストの行数はN人ぶん`);
    assertEqual(
      container.querySelectorAll("[data-rematch-kick-uid]").length,
      0,
      `${n}人：ゲスト視点（isHost=false）ではキックボタンが1つも出ない`
    );

    // 準備OKバッジのテキストが正しいか（p0だけ「準備OK」、残りは「未準備」）。
    renderRematchReadinessList(container, players, "p0", true);
    const badgeTexts = [...container.querySelectorAll(".online-lobby-badge")]
      .map((el) => el.textContent)
      .filter((text) => text === "準備OK" || text === "未準備");
    const readyCount = badgeTexts.filter((text) => text === "準備OK").length;
    assertEqual(readyCount, 1, `${n}人：準備OKバッジが付くのはp0（1人）だけ`);
  });

  // ---- renderRematchReadinessList：全員準備OKの場合、キックボタン以外の描画も崩れない ----
  {
    const container = document.createElement("ul");
    const players = buildPlayers(5, { readyUptoIndex: 4, hostIndex: 0 }); // 全員準備OK
    renderRematchReadinessList(container, players, "p0", true);
    const readyBadges = [...container.querySelectorAll(".online-lobby-badge")].filter(
      (el) => el.textContent === "準備OK"
    );
    assertEqual(readyBadges.length, 5, "5人：全員準備OKなら5人ぶん「準備OK」バッジが付く");
  }

  // 【2026-09-05改訂・本人指示：OS標準confirmから独自モーダルへ】以前はwindow.confirm()を
  // モックして同期的に承認/拒否をシミュレートしていたが、確認手段がアプリ独自モーダル
  // （tests.htmlに用意した#online-battle-rematch-kick-confirm-modal、js/onlineBattleResultReturnState.js
  // 参照）へ変わったため、実際のキャンセル/確定ボタンをクリックする形に書き換える。
  const rematchKickCancelButton = document.getElementById("online-battle-rematch-kick-cancel-button");
  const rematchKickConfirmButton = document.getElementById("online-battle-rematch-kick-confirm-button");

  // ---- createRematchKickHandler：モーダルを開くだけではkickPlayerFnを呼ばない（確定操作が必要） ----
  {
    const container = document.createElement("ul");
    const players = buildPlayers(3, { hostIndex: 0 });
    renderRematchReadinessList(container, players, "p0", true);
    const kickButton = container.querySelector("[data-rematch-kick-uid]");

    let kickCallCount = 0;
    const handler = createRematchKickHandler({
      getRoomId: () => "ROOM1",
      kickPlayerFn: async () => {
        kickCallCount += 1;
      },
      playConfirmSfx: () => {},
    });
    handler({ target: kickButton });
    assertEqual(kickCallCount, 0, "モーダルを開いただけ（まだ確定していない）ではkickPlayerFnを呼ばない");
    rematchKickCancelButton.click();
    assertEqual(kickCallCount, 0, "キャンセルボタンを押した場合はkickPlayerFnを呼ばない");
  }

  // ---- createRematchKickHandler：確定ボタンを押した場合はkickPlayerFnを正しい引数で呼ぶ ----
  {
    const container = document.createElement("ul");
    const players = buildPlayers(3, { hostIndex: 0 });
    renderRematchReadinessList(container, players, "p0", true);
    const kickButton = container.querySelector("[data-rematch-kick-uid]");
    const targetUid = kickButton.dataset.rematchKickUid;

    let calledWith = null;
    const handler = createRematchKickHandler({
      getRoomId: () => "ROOM1",
      kickPlayerFn: async (args) => {
        calledWith = args;
      },
      playConfirmSfx: () => {},
    });
    handler({ target: kickButton });
    rematchKickConfirmButton.click();
    await Promise.resolve(); // kickPlayerFnの非同期呼び出しが解決するのを待つ
    assertEqual(calledWith, { roomId: "ROOM1", targetUid }, "確定ボタンを押した場合、正しいroomId・targetUidでkickPlayerFnを呼ぶ");
  }

  // ---- createRematchKickHandler：モーダルを二重に確定しても、1回しかkickPlayerFnを呼ばない ----
  {
    const container = document.createElement("ul");
    const players = buildPlayers(3, { hostIndex: 0 });
    renderRematchReadinessList(container, players, "p0", true);
    const kickButton = container.querySelector("[data-rematch-kick-uid]");

    let kickCallCount = 0;
    const handler = createRematchKickHandler({
      getRoomId: () => "ROOM1",
      kickPlayerFn: async () => {
        kickCallCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
      },
      playConfirmSfx: () => {},
    });
    handler({ target: kickButton });
    rematchKickConfirmButton.click();
    rematchKickConfirmButton.click(); // 連打（二重確定）を模擬
    rematchKickConfirmButton.click();
    await new Promise((resolve) => setTimeout(resolve, 50));
    assertEqual(kickCallCount, 1, "確定ボタンを連打しても、kickPlayerFnは1回しか呼ばれない（二重確定防止）");
  }

  // ---- createRematchKickHandler：roomIdが取得できない場合は何もしない（安全側） ----
  {
    const container = document.createElement("ul");
    const players = buildPlayers(2, { hostIndex: 0 });
    renderRematchReadinessList(container, players, "p0", true);
    const kickButton = container.querySelector("[data-rematch-kick-uid]");

    let kickCallCount = 0;
    const handler = createRematchKickHandler({
      getRoomId: () => null,
      kickPlayerFn: async () => {
        kickCallCount += 1;
      },
      playConfirmSfx: () => {},
    });
    handler({ target: kickButton });
    assertEqual(kickCallCount, 0, "roomIdが無い（部屋を離れた後等）場合は安全側でkickPlayerFnを呼ばない");
  }
}
