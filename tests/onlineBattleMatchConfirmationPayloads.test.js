// js/onlineBattleMatchConfirmationPayloads.jsのテスト（2026-09-13新設・本人指示：
// 対戦開始前ルール確認画面）。Firebaseの読み書きを一切伴わない純粋な判定ロジックだけを
// 検証する（js/onlineBattle.js自体はFirebase初期化が必要なため、恒久テストの対象外）。

import {
  hasMatchMembershipChanged,
  computeAllPlayersConfirmed,
  computeAllPlayersRematchReady,
  computeAllPlayersResultReturned,
  resolveRematchToggleButtonLabel,
  filterPlayersForRematchParticipants,
  buildRematchProposalUpdates,
  canBeginRematchReadyCheckFromRoomStatus,
} from "../js/onlineBattleMatchConfirmationPayloads.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleMatchConfirmationPayloadsTests() {
  // ---- hasMatchMembershipChanged ----
  {
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a", "b"] }),
      false,
      "参加者が全く同じなら変化なしと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["b", "a"] }),
      false,
      "並び順が違うだけ（Object.keysの順序差）は変化とみなさない"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a", "b", "c"] }),
      true,
      "新しい参加者が増えていれば変化ありと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a"] }),
      true,
      "誰かが抜けていれば変化ありと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: ["a", "b"], currentPlayerUids: ["a", "c"] }),
      true,
      "人数は同じでも中身が入れ替わっていれば変化ありと判定する"
    );
    assertEqual(
      hasMatchMembershipChanged({ previousParticipantUids: [], currentPlayerUids: [] }),
      false,
      "どちらも空なら変化なしと判定する"
    );
  }

  // ---- computeAllPlayersConfirmed ----
  {
    assertEqual(
      computeAllPlayersConfirmed({ a: { ruleConfirmed: true }, b: { ruleConfirmed: true } }),
      true,
      "全員がruleConfirmed:trueなら全員確認済みと判定する"
    );
    assertEqual(
      computeAllPlayersConfirmed({ a: { ruleConfirmed: true }, b: { ruleConfirmed: false } }),
      false,
      "1人でも未確認がいれば全員確認済みではないと判定する"
    );
    assertEqual(
      computeAllPlayersConfirmed({ a: { ruleConfirmed: true }, b: {} }),
      false,
      "ruleConfirmedフィールド自体が無い参加者は未確認として扱う"
    );
    assertEqual(computeAllPlayersConfirmed({}), false, "参加者が1人もいなければ確認済みとはみなさない（安全側）");
    assertEqual(computeAllPlayersConfirmed(undefined), false, "playersがundefinedでも安全にfalseを返す");
  }

  // ---- computeAllPlayersRematchReady（再戦準備フェーズ新設・本人指示） ----
  {
    // 2人対戦：基本パターン
    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true }, b: { rematchReady: true } }),
      true,
      "2人対戦：全員がrematchReady:trueなら準備完了と判定する"
    );
    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true }, b: { rematchReady: false } }),
      false,
      "2人対戦：1人でも未準備がいれば準備完了ではないと判定する"
    );

    // 3人対戦：基本パターン
    assertEqual(
      computeAllPlayersRematchReady({
        a: { rematchReady: true },
        b: { rematchReady: true },
        c: { rematchReady: true },
      }),
      true,
      "3人対戦：全員がrematchReady:trueなら準備完了と判定する"
    );
    assertEqual(
      computeAllPlayersRematchReady({
        a: { rematchReady: true },
        b: { rematchReady: true },
        c: { rematchReady: false },
      }),
      false,
      "3人対戦：3人中1人でも未準備がいれば準備完了ではないと判定する"
    );

    // 【エッジケース：準備待ち中に途中退出】退出したプレイヤーはroom.playersから削除される
    // （js/onlineBattle.jsのleaveRoom()参照）ため、「退出者を除いた残りのプレイヤーだけ」を
    // 渡した状態で判定できることを確認する＝退出者を待たずに準備完了と判定できる。
    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true } }),
      true,
      "3人→1人退出：残った参加者だけが準備OKなら、退出者を待たずに準備完了と判定する"
    );

    // 【エッジケース：準備待ち中に新しい参加者が入室】2026-11-XX改訂・実機バグ調査：
    // 以前は新規参加時にjs/onlineBattle.jsのresetRematchReadyIfConfirming()が
    // 既存参加者を含めて全員のrematchReadyをfalseへ戻し、再戦提案そのものを取り消して
    // いたが、「新規参加者が来ても進行中の再戦は一切乱さない」という確定仕様への変更に
    // 伴い、この関数は廃止された。代わりに、beginRematchReadyCheck()が再戦提案の瞬間に
    // 固定するparticipantUids（第2引数）で対象者を絞り込むことで、新規参加者を
    // 判定から除外する。
    assertEqual(
      computeAllPlayersRematchReady(
        {
          a: { rematchReady: true }, // 再戦の対象者：準備OK
          b: { rematchReady: false }, // 再戦の対象者：未準備
          c: { rematchReady: false }, // 再戦提案後に新しく入室した参加者（対象外）
        },
        { a: true, b: true } // participantUids：この再戦の対象はa・bだけ
      ),
      false,
      "3人（うち1人が再戦提案後の新規参加者）：対象者bが未準備の間はfalseのまま（新規参加者cの状態は無視する）"
    );
    assertEqual(
      computeAllPlayersRematchReady(
        {
          a: { rematchReady: true },
          b: { rematchReady: true },
          c: { rematchReady: false }, // 新規参加者は準備OKを押していなくても無関係
        },
        { a: true, b: true }
      ),
      true,
      "3人（うち1人が再戦提案後の新規参加者）：対象者a・bが両方準備OKなら、新規参加者cが未準備でも準備完了と判定する（cを待たない）"
    );
    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true }, b: { rematchReady: true } }),
      true,
      "participantUidsを省略した場合は、従来どおりplayers全員を対象に判定する（後方互換）"
    );

    assertEqual(
      computeAllPlayersRematchReady({ a: { rematchReady: true }, b: {} }),
      false,
      "rematchReadyフィールド自体が無い参加者は未準備として扱う"
    );
    assertEqual(computeAllPlayersRematchReady({}), false, "参加者が1人もいなければ準備完了とはみなさない（安全側）");
    assertEqual(computeAllPlayersRematchReady(undefined), false, "playersがundefinedでも安全にfalseを返す");
  }

  // ---- computeAllPlayersResultReturned（オンライン対戦総合改修 第2ラウンド26-29章新設） ----
  {
    assertEqual(
      computeAllPlayersResultReturned({ a: { resultReturned: true }, b: { resultReturned: true } }),
      true,
      "全員がresultReturned:trueなら全員戻り終えたと判定する"
    );
    assertEqual(
      computeAllPlayersResultReturned({ a: { resultReturned: true }, b: { resultReturned: false } }),
      false,
      "1人でもまだ戻っていなければ全員戻り終えたとは判定しない"
    );
    assertEqual(
      computeAllPlayersResultReturned({ a: { resultReturned: true }, b: {} }),
      false,
      "resultReturnedフィールド自体が無い参加者はまだ戻っていないとして扱う"
    );
    assertEqual(computeAllPlayersResultReturned({}), false, "参加者が1人もいなければ戻り終えたとはみなさない（安全側）");
    assertEqual(computeAllPlayersResultReturned(undefined), false, "playersがundefinedでも安全にfalseを返す");

    // 【本人指示：切断中の参加者を待たない】既存のconnectedフラグ（presence/切断検知）で
    // 除外することで、詰み（誰かの端末が落ちて二度と次の試合が始められない）を防ぐ。
    assertEqual(
      computeAllPlayersResultReturned({
        a: { resultReturned: true },
        b: { resultReturned: false, connected: false }, // 切断中：待たない
      }),
      true,
      "切断中の参加者は、resultReturnedがfalseのままでも待たずに全員戻り終えたと判定する"
    );
    assertEqual(
      computeAllPlayersResultReturned({
        a: { resultReturned: false, connected: false },
        b: { resultReturned: false, connected: false },
      }),
      false,
      "全員が切断中の場合は、待つべき相手が1人もいない扱い（安全側）として戻り終えたとは判定しない"
    );
    assertEqual(
      computeAllPlayersResultReturned({
        a: { resultReturned: true, connected: true },
        b: { resultReturned: true, connected: true },
        c: { resultReturned: false, connected: false },
      }),
      true,
      "3人中1人が切断中：残り2人が戻り終えていれば、切断中の1人を待たずに戻り終えたと判定する"
    );
  }

  // ---- N人（2/3/5/10人）：「最後の1人」が揃った瞬間だけtrueになることの確認 ----
  // 【2026-10-01新設・本人指示：オンライン対戦の同期回帰の緊急調査】本人指示により、
  // 実機2台では確認できない最大10人までの人数でも、「最後の1人が条件を満たすまでは
  // 絶対にfalseのまま」「最後の1人が満たした瞬間だけtrueになる」ことを、恒久テストで
  // 確認する（最大人数10人はjs/onlineBattle.jsのDEFAULT_MAX_SPECTATORS等ではなく、
  // 部屋のmaxPlayers設定の実運用上の上限に合わせた値）。
  {
    const buildNPlayers = (count, fieldName, { allTrueExceptLast = false } = {}) => {
      const players = {};
      for (let i = 0; i < count; i += 1) {
        const isLast = i === count - 1;
        players[`p${i}`] = { [fieldName]: allTrueExceptLast ? !isLast : false };
      }
      return players;
    };

    [2, 3, 5, 10].forEach((n) => {
      // computeAllPlayersConfirmed：最後の1人以外は全員ruleConfirmed:true
      const almostConfirmed = buildNPlayers(n, "ruleConfirmed", { allTrueExceptLast: true });
      assertEqual(
        computeAllPlayersConfirmed(almostConfirmed),
        false,
        `${n}人：最後の1人だけruleConfirmedが揃っていない間はfalseのまま`
      );
      const lastKey = `p${n - 1}`;
      const fullyConfirmed = { ...almostConfirmed, [lastKey]: { ruleConfirmed: true } };
      assertEqual(
        computeAllPlayersConfirmed(fullyConfirmed),
        true,
        `${n}人：最後の1人がruleConfirmed:trueになった瞬間にtrueへ変わる`
      );

      // computeAllPlayersRematchReady：同じ形の検証
      const almostRematchReady = buildNPlayers(n, "rematchReady", { allTrueExceptLast: true });
      assertEqual(
        computeAllPlayersRematchReady(almostRematchReady),
        false,
        `${n}人：最後の1人だけrematchReadyが揃っていない間はfalseのまま`
      );
      const fullyRematchReady = { ...almostRematchReady, [lastKey]: { rematchReady: true } };
      assertEqual(
        computeAllPlayersRematchReady(fullyRematchReady),
        true,
        `${n}人：最後の1人がrematchReady:trueになった瞬間にtrueへ変わる`
      );

      // computeAllPlayersResultReturned：同じ形の検証（connected:trueを明示し、
      // 切断中の除外ロジックに引っかからないようにする）
      const almostReturned = {};
      for (let i = 0; i < n; i += 1) {
        almostReturned[`p${i}`] = { resultReturned: i !== n - 1, connected: true };
      }
      assertEqual(
        computeAllPlayersResultReturned(almostReturned),
        false,
        `${n}人：最後の1人だけresultReturnedが揃っていない間はfalseのまま`
      );
      const fullyReturned = { ...almostReturned, [lastKey]: { resultReturned: true, connected: true } };
      assertEqual(
        computeAllPlayersResultReturned(fullyReturned),
        true,
        `${n}人：最後の1人がresultReturned:trueになった瞬間にtrueへ変わる`
      );
    });

    // ---- resolveRematchToggleButtonLabel（2026-11-XX新設・実機バグ調査：再戦フロー） ----
    // 【症状の再現条件】以前は通常モード（js/onlineBattleScreen.js）だけがホスト分岐を
    // 持ち、歌詞クイズ対戦・一瞬バトル・一瞬協力の3画面はこの分岐が欠落していたため、
    // ホストの画面にも「✓ 準備OK」ボタンが誤って表示されていた。4画面すべてが
    // この1つの純粋関数を経由するようになったため、ここでの検証がそのまま4画面すべての
    // 正しさを保証する。
    {
      assertEqual(
        resolveRematchToggleButtonLabel({ isHost: true, myReady: true }).text,
        "再戦を取り消す",
        "ホストは自分のrematchReadyの値に関わらず「再戦を取り消す」を表示する（提案した瞬間から常に準備済み扱いのため）"
      );
      assertEqual(
        resolveRematchToggleButtonLabel({ isHost: true, myReady: false }).text,
        "再戦を取り消す",
        "ホスト：myReadyがfalseでも「✓ 準備OK」は絶対に表示しない"
      );
      assertEqual(
        resolveRematchToggleButtonLabel({ isHost: true, myReady: true }).isConfirmed,
        false,
        "ホストの取消ボタンには、ゲスト向けの準備完了スタイル（is-confirmed）を付けない"
      );
      assertEqual(
        resolveRematchToggleButtonLabel({ isHost: false, myReady: false }).text,
        "✓ 準備OK",
        "ゲスト・未準備：「✓ 準備OK」を表示する"
      );
      assertEqual(
        resolveRematchToggleButtonLabel({ isHost: false, myReady: true }).text,
        "準備を取り消す",
        "ゲスト・準備済み：「準備を取り消す」を表示する"
      );
      assertEqual(
        resolveRematchToggleButtonLabel({ isHost: false, myReady: true }).isConfirmed,
        true,
        "ゲスト・準備済み：is-confirmedスタイルを付ける"
      );
      assertEqual(
        resolveRematchToggleButtonLabel({ isHost: false, myReady: false }).isConfirmed,
        false,
        "ゲスト・未準備：is-confirmedスタイルは付けない"
      );
    }

    // ---- filterPlayersForRematchParticipants（2026-11-XX新設・実機バグ調査：
    // 再戦準備中に新規参加者が来ても巻き込まない仕様） ----
    {
      const players = {
        a: { name: "ホスト" },
        b: { name: "既存参加者" },
        c: { name: "再戦提案後の新規参加者" },
      };
      const filtered = filterPlayersForRematchParticipants(players, { a: true, b: true });
      assertEqual(Object.keys(filtered).sort().join(","), "a,b", "participantUidsに含まれる参加者だけを残す");
      assertEqual(filtered.c, undefined, "participantUidsに含まれない新規参加者は除外される");

      assertEqual(
        filterPlayersForRematchParticipants(players, {}),
        players,
        "participantUidsが空オブジェクトの場合は、従来どおりplayers全員を返す（安全側フォールバック）"
      );
      assertEqual(
        filterPlayersForRematchParticipants(players, undefined),
        players,
        "participantUidsを省略した場合は、従来どおりplayers全員を返す（安全側フォールバック）"
      );
      assertEqual(
        Object.keys(filterPlayersForRematchParticipants(undefined, { a: true })).length,
        0,
        "playersがundefinedでも安全に空オブジェクトを返す"
      );
    }

    // ---- buildRematchProposalUpdates（2026-11-XX新設・実機バグ調査：「もう一度」を
    // 押しても何も起きないバグの再発防止） ----
    // 【この関数が守るべきこと】firebase/database.rules.jsonのrematchParticipantUidsには
    // 子キー（$uid）単位の.writeルールしか無く、親キー（rematchParticipantUids自体）への
    // .writeが定義されていない。そのため、ここで組み立てるupdatesオブジェクトのキーに
    // `rooms/{roomId}/rematchParticipantUids`（親キーへオブジェクトを丸ごと書き込む形）が
    // 1つでも含まれていると、実際のFirebase書き込みが必ずpermission_deniedで拒否される
    // （実機・本番Firebaseで確認済みの根本原因）。このテストは、Firebase呼び出しを
    // 一切行わずに、update()へ渡す直前のオブジェクトの「キーの粒度」そのものを検証する。
    {
      const updates = buildRematchProposalUpdates({
        roomId: "ROOM1",
        players: { host1: { name: "ホスト" }, guest1: { name: "ゲスト" } },
        hostUid: "host1",
      });

      assertEqual(
        Object.prototype.hasOwnProperty.call(updates, "rooms/ROOM1/rematchParticipantUids"),
        false,
        "rematchParticipantUidsを「親キー」へオブジェクトごと書き込むキーを絶対に含めない（このキーが1つでもあると、実際のFirebaseルール上は書き込み全体がpermission_deniedで拒否される）"
      );
      assertEqual(
        updates["rooms/ROOM1/rematchParticipantUids/host1"],
        true,
        "rematchParticipantUidsは参加者ごとの「子キー」へ1件ずつtrueを書き込む（ホスト自身）"
      );
      assertEqual(
        updates["rooms/ROOM1/rematchParticipantUids/guest1"],
        true,
        "rematchParticipantUidsは参加者ごとの「子キー」へ1件ずつtrueを書き込む（ホスト以外の参加者）"
      );
      assertEqual(updates["rooms/ROOM1/status"], "waiting", "room.statusをwaitingへ戻す");
      assertEqual(updates["rooms/ROOM1/confirmingRematch"], true, "confirmingRematchをtrueにする");
      assertEqual(
        updates["rooms/ROOM1/players/host1/rematchReady"],
        true,
        "「もう一度」を押した本人（ホスト）は、提案した瞬間から準備OK扱いにする"
      );
      assertEqual(
        updates["rooms/ROOM1/players/guest1/rematchReady"],
        false,
        "ホスト以外の参加者は、まだ準備OKを押していない未準備状態からスタートする"
      );
    }
    {
      // 3人以上でも、全参加者ぶんの子キーが漏れなく作られることを確認する。
      const updates = buildRematchProposalUpdates({
        roomId: "ROOM2",
        players: { a: {}, b: {}, c: {} },
        hostUid: "b",
      });
      assertEqual(
        Object.prototype.hasOwnProperty.call(updates, "rooms/ROOM2/rematchParticipantUids"),
        false,
        "3人対戦でも、rematchParticipantUidsの親キーへの書き込みを含めない"
      );
      ["a", "b", "c"].forEach((uid) => {
        assertEqual(
          updates[`rooms/ROOM2/rematchParticipantUids/${uid}`],
          true,
          `3人対戦：参加者${uid}の子キーが漏れなく作られる`
        );
      });
      assertEqual(updates["rooms/ROOM2/players/b/rematchReady"], true, "3人対戦：提案したホスト（b）は準備OK扱い");
      assertEqual(updates["rooms/ROOM2/players/a/rematchReady"], false, "3人対戦：ホスト以外（a）は未準備からスタート");
      assertEqual(updates["rooms/ROOM2/players/c/rematchReady"], false, "3人対戦：ホスト以外（c）は未準備からスタート");
    }

    // 【10人・複数人が同時に切断中】切断中の人数が複数でも、残りの接続中メンバーだけで
    // 正しく判定できることを確認する（本人指示：最大10人ではタイミング差が出やすいため）。
    {
      const players = {};
      for (let i = 0; i < 10; i += 1) {
        const isDisconnected = i < 3; // 先頭3人が切断中
        players[`p${i}`] = {
          resultReturned: isDisconnected ? false : true,
          connected: !isDisconnected,
        };
      }
      assertEqual(
        computeAllPlayersResultReturned(players),
        true,
        "10人中3人が切断中：残り7人全員が戻り終えていれば、切断中の3人を待たずに戻り終えたと判定する"
      );
    }

    // ---- canBeginRematchReadyCheckFromRoomStatus（2026-09-06新設・実機バグ調査：
    // 「もう一度」→キャンセル→もう一度が2回目以降効かないバグの再発防止） ----
    {
      assertEqual(
        canBeginRematchReadyCheckFromRoomStatus({ status: "result", confirmingRematch: undefined }),
        true,
        "結果画面（status:result）からは常に再戦提案を開始できる（1回目の通常ケース）"
      );
      assertEqual(
        canBeginRematchReadyCheckFromRoomStatus({ status: "waiting", confirmingRematch: false }),
        true,
        "1回目の提案がキャンセル済み（status:waiting・confirmingRematch:false）なら、2回目の提案を開始できる（今回のバグ修正の核心）"
      );
      assertEqual(
        canBeginRematchReadyCheckFromRoomStatus({ status: "waiting", confirmingRematch: undefined }),
        true,
        "confirmingRematchが未設定（そもそも一度も再戦提案していないwaiting状態）でも開始できる"
      );
      assertEqual(
        canBeginRematchReadyCheckFromRoomStatus({ status: "waiting", confirmingRematch: true }),
        false,
        "既に再戦提案が進行中（status:waiting・confirmingRematch:true）のときは、二重に開始させない"
      );
      assertEqual(
        canBeginRematchReadyCheckFromRoomStatus({ status: "playing", confirmingRematch: false }),
        false,
        "対戦中（status:playing）は再戦提案を開始できない"
      );
      assertEqual(
        canBeginRematchReadyCheckFromRoomStatus({ status: "countdown", confirmingRematch: false }),
        false,
        "カウントダウン中（status:countdown）は再戦提案を開始できない"
      );
    }

    // ---- 「もう一度→キャンセル」を100回連続シミュレーション（本人指示5：耐久確認） ----
    // 【シミュレーションの設計】実際のFirebase呼び出しは行わず、buildRematchProposalUpdates()
    // が返すupdatesを素朴なインメモリのroomオブジェクトへ適用する→
    // canBeginRematchReadyCheckFromRoomStatus()で次の提案が開始できるか確認する→
    // キャンセル（confirmingRematch:falseだけを反映、cancelRematchReadyCheck()と同じ）を
    // 適用する、を1サイクルとして100回繰り返す。毎サイクル必ず開始できることを確認する
    // （1回でも失敗すれば、今回のバグが再発したことを意味する）。
    {
      const REMATCH_CANCEL_CYCLE_COUNT = 100;
      let room = { status: "result", confirmingRematch: undefined, players: { host1: {}, guest1: {} } };
      let successfulCycles = 0;

      for (let cycle = 0; cycle < REMATCH_CANCEL_CYCLE_COUNT; cycle++) {
        const canBegin = canBeginRematchReadyCheckFromRoomStatus({
          status: room.status,
          confirmingRematch: room.confirmingRematch,
        });
        if (!canBegin) break; // 失敗した時点で打ち切り、下のassertで検出させる

        // 「もう一度」：buildRematchProposalUpdates()が返すキーのうち、room直下の値だけを反映する。
        const updates = buildRematchProposalUpdates({ roomId: "R", players: room.players, hostUid: "host1" });
        room = { ...room, status: updates["rooms/R/status"], confirmingRematch: updates["rooms/R/confirmingRematch"] };

        // 「キャンセル」：cancelRematchReadyCheck()と同じく、confirmingRematchだけを下ろす
        // （statusは意図的に"result"へは戻さない、既存の設計どおり）。
        room = { ...room, confirmingRematch: false };

        successfulCycles++;
      }

      assertEqual(
        successfulCycles,
        REMATCH_CANCEL_CYCLE_COUNT,
        `「もう一度→キャンセル」のサイクルを${REMATCH_CANCEL_CYCLE_COUNT}回連続で実行し、毎回必ず次の「もう一度」を開始できることを確認した（1回でも失敗すれば今回のバグの再発を意味する）`
      );
    }

    // ---- 正常系（キャンセルせず最後まで再戦を成立させる）を50回繰り返しても壊れないこと ----
    // 【本人指示5】「もう一度→ゲストready→再戦開始→結果→もう一度」の正常系も繰り返して
    // 確認する、との指示に対応。試合が成立すると、js/onlineBattle.jsのwriteNewMatchStart()
    // 相当の処理でstatusは"result"以外（実際には次の試合が進行して最終的にまた"result"）へ
    // 遷移する想定のため、ここでは「試合成立後、次の結果画面（status:result）に戻った時点で
    // 再び提案できるか」をシミュレートする。
    {
      const NORMAL_CYCLE_COUNT = 50;
      let room = { status: "result", confirmingRematch: undefined, players: { host1: {}, guest1: {}, guest2: {} } };
      let successfulCycles = 0;

      for (let cycle = 0; cycle < NORMAL_CYCLE_COUNT; cycle++) {
        const canBegin = canBeginRematchReadyCheckFromRoomStatus({
          status: room.status,
          confirmingRematch: room.confirmingRematch,
        });
        if (!canBegin) break;

        const updates = buildRematchProposalUpdates({ roomId: "R", players: room.players, hostUid: "host1" });
        room = { ...room, status: updates["rooms/R/status"], confirmingRematch: updates["rooms/R/confirmingRematch"] };

        // 全員がrematchReady:trueになった（ゲストも準備OKを押した）ことを表す。
        const allReady = computeAllPlayersRematchReady({
          host1: { rematchReady: true },
          guest1: { rematchReady: true },
          guest2: { rematchReady: true },
        });
        if (!allReady) break;

        // 再戦が実際に開始・終了し、次の結果画面へ戻った状態を表す
        // （writeNewMatchStart()相当：confirmingRematchは下ろされ、新しい試合の結果が
        // 出た時点でstatusは再びresultに戻る）。
        room = { ...room, status: "result", confirmingRematch: false };

        successfulCycles++;
      }

      assertEqual(
        successfulCycles,
        NORMAL_CYCLE_COUNT,
        `「もう一度→全員準備OK→再戦成立→結果」の正常系サイクルを3人参加で${NORMAL_CYCLE_COUNT}回連続実行し、毎回問題なく次のサイクルへ進めることを確認した`
      );
    }
  }
}
