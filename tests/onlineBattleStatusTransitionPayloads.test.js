// js/onlineBattleStatusTransitionPayloads.js（対戦開始・カウントダウン・結果画面などの
// 「状態が変わった瞬間、次にどの画面へ進むべきか」の判定）のテスト
// （2026-10-01新設・本人指示：オンライン対戦の同期回帰の緊急調査）。
//
// 【本人指示への対応】「対戦開始直後、host/guestで別の画面に分岐する」という実機報告を
// 受け、host/guestで判定結果が食い違わないことを型で保証している
// resolveOnlineBattleStatusTransition()（isHostという引数自体を持たない）が、実際に
// あらゆる状況で同じ入力に対して同じ行動を返すことを確認する。あわせて、本人指示の
// T0〜T10の時系列、および「古いsetTimeout/callbackが後から発火した場合」を想定した
// テストも用意する。

import {
  ONLINE_BATTLE_TRANSITION_ACTION,
  ONLINE_BATTLE_RESULT_KIND,
  resolveOnlineBattleStatusTransition,
  isCountdownCompletionStillValid,
} from "../js/onlineBattleStatusTransitionPayloads.js";
import { assertEqual } from "./test-utils.js";

// 呼び出し側（renderLobby()）が毎回渡す引数の「基準値」。個別のテストでは
// 必要な項目だけ上書きする。
function baseArgs(overrides = {}) {
  return {
    statusJustChanged: false,
    previousStatus: "waiting",
    roomStatus: "waiting",
    hasVoluntarilyLeftActiveMatch: false,
    isActiveMatchInvalidated: false,
    isReturnedToLobby: false,
    currentScreenIsQuiz: false,
    currentScreenIsResultScreen: false,
    hasRespondedToCurrentResultScreen: false,
    isLyricsQuiz: false,
    isInstantBattle: false,
    isInstantCoop: false,
    ...overrides,
  };
}

export function runOnlineBattleStatusTransitionPayloadsTests() {
  // ---- statusが変わっていなければ、何度呼んでも常にNONE（同じ遷移をやり直さない） ----
  {
    assertEqual(
      resolveOnlineBattleStatusTransition(baseArgs({ statusJustChanged: false, roomStatus: "countdown" })).action,
      ONLINE_BATTLE_TRANSITION_ACTION.NONE,
      "statusJustChanged:falseなら、roomStatusが何であっても行動はNONE（多重発火の防止）"
    );
  }

  // ---- countdown検知：ホスト・ゲストいずれの立場でも同じ結果になる ----
  // 【本人指示・確認ポイント4への回答】この関数はisHostという引数自体を持たないため、
  // 「ホストかどうか」で呼び分けが起きようがないことを、実際に同じ引数で2回呼んで確認する。
  {
    const args = baseArgs({ statusJustChanged: true, previousStatus: "waiting", roomStatus: "countdown" });
    const resultAsIfHost = resolveOnlineBattleStatusTransition(args);
    const resultAsIfGuest = resolveOnlineBattleStatusTransition(args);
    assertEqual(
      resultAsIfHost,
      resultAsIfGuest,
      "同じroomスナップショットなら、ホスト視点・ゲスト視点で呼んでも判定結果は完全に同じ（isHostを渡していないため）"
    );
    assertEqual(resultAsIfHost.action, ONLINE_BATTLE_TRANSITION_ACTION.ENTER_COUNTDOWN, "waiting→countdownはENTER_COUNTDOWN");
  }

  // ---- T0〜T10：本人指示の時系列どおりに状態を進め、各段階の判定を確認する ----
  {
    // T5: countdown開始（writeNewMatchStart()がstatus:countdownを書き込んだ直後）
    const t5 = resolveOnlineBattleStatusTransition(
      baseArgs({ statusJustChanged: true, previousStatus: "waiting", roomStatus: "countdown" })
    );
    assertEqual(t5.action, ONLINE_BATTLE_TRANSITION_ACTION.ENTER_COUNTDOWN, "T5：countdown検知でENTER_COUNTDOWN");

    // T6〜T9（3・2・1・START表示中）：room.statusは"countdown"のまま変化しないため、
    // 同じrenderLobby()がもう一度呼ばれてもstatusJustChanged:falseで何もしない
    // （countdownの数字自体はgoToCountdownScreen()側のローカルタイマーが進める。
    // 本人指示・確認ポイント3への回答：Firebase側のstatus変化とローカル演出のタイマーは
    // 別軸で、この関数はFirebase側のstatus変化だけを見る）。
    const t6to9 = resolveOnlineBattleStatusTransition(
      baseArgs({ statusJustChanged: false, previousStatus: "countdown", roomStatus: "countdown" })
    );
    assertEqual(t6to9.action, ONLINE_BATTLE_TRANSITION_ACTION.NONE, "T6〜T9：countdown中のroom再描画は何もしない");

    // T10: 出遅れて参加/再接続した端末が、途中からplayingを検知した場合
    // （countdownを経由した端末は、この経路ではなく自分のローカルタイマー＝
    // goToCountdownScreen()のsetTimeout経由でenterOnlineBattlePlay()へ進む。
    // 本人指示・確認ポイント1〜2への回答：countdown経由の端末にとって、
    // 「誰がplayingへ変更するか」はこの関数の外側＝ホストのfinishCountdown()が担うが、
    // ゲーム画面へ進む条件自体はhost/guestとも「ローカルカウントダウンが0になったこと」で
    // 揃えてあり、Firebase側のstatus:playingへの反映を待たない設計になっている）。
    const t10LateJoiner = resolveOnlineBattleStatusTransition(
      baseArgs({ statusJustChanged: true, previousStatus: "waiting", roomStatus: "playing" })
    );
    assertEqual(
      t10LateJoiner.action,
      ONLINE_BATTLE_TRANSITION_ACTION.ENTER_PLAY,
      "T10（出遅れ参加）：previousStatusがcountdownでなければ、playing検知で直接ENTER_PLAY"
    );

    const t10NormalPath = resolveOnlineBattleStatusTransition(
      baseArgs({ statusJustChanged: true, previousStatus: "countdown", roomStatus: "playing" })
    );
    assertEqual(
      t10NormalPath.action,
      ONLINE_BATTLE_TRANSITION_ACTION.NONE,
      "T10（通常経路）：previousStatusがcountdownの場合はNONE（ローカルタイマー側が進行を担当するため、二重に開始しない）"
    );
  }

  // ---- 途中離脱・試合無効化の除外条件 ----
  {
    const leftMatch = resolveOnlineBattleStatusTransition(
      baseArgs({
        statusJustChanged: true,
        previousStatus: "waiting",
        roomStatus: "playing",
        hasVoluntarilyLeftActiveMatch: true,
      })
    );
    assertEqual(
      leftMatch.action,
      ONLINE_BATTLE_TRANSITION_ACTION.NONE,
      "自分の意思で既に途中離脱した試合には、playing検知でも自動的に戻さない"
    );

    const invalidatedMatch = resolveOnlineBattleStatusTransition(
      baseArgs({
        statusJustChanged: true,
        previousStatus: "waiting",
        roomStatus: "playing",
        isActiveMatchInvalidated: true,
      })
    );
    assertEqual(
      invalidatedMatch.action,
      ONLINE_BATTLE_TRANSITION_ACTION.NONE,
      "音源トラブル等で無効化済みの試合には、playing検知でも進まない"
    );
  }

  // ---- 結果画面：gameModeの種類ごとに正しいresultKindを返す ----
  {
    [
      { flags: {}, expected: ONLINE_BATTLE_RESULT_KIND.SHARED },
      { flags: { isLyricsQuiz: true }, expected: ONLINE_BATTLE_RESULT_KIND.LYRICS_QUIZ },
      { flags: { isInstantBattle: true }, expected: ONLINE_BATTLE_RESULT_KIND.INSTANT_BATTLE },
      { flags: { isInstantCoop: true }, expected: ONLINE_BATTLE_RESULT_KIND.INSTANT_COOP },
    ].forEach(({ flags, expected }) => {
      const result = resolveOnlineBattleStatusTransition(
        baseArgs({ statusJustChanged: true, previousStatus: "playing", roomStatus: "result", ...flags })
      );
      assertEqual(result.action, ONLINE_BATTLE_TRANSITION_ACTION.ENTER_RESULT, `result検知でENTER_RESULT（${expected}）`);
      assertEqual(result.resultKind, expected, `gameModeに対応したresultKind（${expected}）を返す`);
    });

    const stillAnswering = resolveOnlineBattleStatusTransition(
      baseArgs({ statusJustChanged: true, previousStatus: "playing", roomStatus: "result", currentScreenIsQuiz: true })
    );
    assertEqual(
      stillAnswering.action,
      ONLINE_BATTLE_TRANSITION_ACTION.NONE,
      "自分がまだquiz画面で回答中なら、result検知でも割り込まない"
    );
  }

  // ---- ロビーへの復帰：結果画面で未応答なら待機、応答済みなら戻る ----
  {
    const waiting = resolveOnlineBattleStatusTransition(
      baseArgs({
        statusJustChanged: true,
        previousStatus: "result",
        roomStatus: "waiting",
        isReturnedToLobby: true,
        currentScreenIsResultScreen: true,
        hasRespondedToCurrentResultScreen: false,
      })
    );
    assertEqual(
      waiting.action,
      ONLINE_BATTLE_TRANSITION_ACTION.WAIT_FOR_RESULT_RESPONSE,
      "結果画面を見ていて、まだ自分の意思表示をしていなければ待機する（他人の結果画面を勝手に閉じない）"
    );

    const responded = resolveOnlineBattleStatusTransition(
      baseArgs({
        statusJustChanged: true,
        previousStatus: "result",
        roomStatus: "waiting",
        isReturnedToLobby: true,
        currentScreenIsResultScreen: true,
        hasRespondedToCurrentResultScreen: true,
      })
    );
    assertEqual(
      responded.action,
      ONLINE_BATTLE_TRANSITION_ACTION.RETURN_TO_LOBBY,
      "自分の意思表示を既にしていれば、ロビーへ戻る"
    );

    const notOnResultScreen = resolveOnlineBattleStatusTransition(
      baseArgs({
        statusJustChanged: true,
        previousStatus: "playing",
        roomStatus: "waiting",
        isReturnedToLobby: true,
        currentScreenIsResultScreen: false,
      })
    );
    assertEqual(
      notOnResultScreen.action,
      ONLINE_BATTLE_TRANSITION_ACTION.RETURN_TO_LOBBY,
      "結果画面以外（対戦中断・音源トラブル無効化等）から直接waitingへ戻った場合は、そのままロビーへ戻る"
    );
  }

  // ---- isCountdownCompletionStillValid：古いsetTimeoutコールバックの無視 ----
  // 【本人指示・確認ポイント5〜6への回答】goToCountdownScreen()の0.5秒後のsetTimeoutが、
  // 発火時点で既に別の部屋・別の試合へ状況が変わっていた場合は、古いroomスナップショットで
  // 誤って出題を始めないことを確認する。
  {
    assertEqual(
      isCountdownCompletionStillValid({
        capturedRoomId: "ROOM1",
        capturedActiveMatchId: "MATCH1",
        currentRoomId: "ROOM1",
        latestActiveMatchId: "MATCH1",
      }),
      true,
      "部屋・試合とも変わっていなければ、そのまま開始してよい"
    );
    assertEqual(
      isCountdownCompletionStillValid({
        capturedRoomId: "ROOM1",
        capturedActiveMatchId: "MATCH1",
        currentRoomId: "ROOM2",
        latestActiveMatchId: "MATCH1",
      }),
      false,
      "発火until別の部屋へ移動していれば、古いコールバックは無視する"
    );
    assertEqual(
      isCountdownCompletionStillValid({
        capturedRoomId: "ROOM1",
        capturedActiveMatchId: "MATCH1",
        currentRoomId: "ROOM1",
        latestActiveMatchId: "MATCH2",
      }),
      false,
      "同じ部屋のままでも、既に次の試合（新しいactiveMatchId）へ進んでいれば古いコールバックは無視する"
    );
    assertEqual(
      isCountdownCompletionStillValid({
        capturedRoomId: null,
        capturedActiveMatchId: "MATCH1",
        currentRoomId: "ROOM1",
        latestActiveMatchId: "MATCH1",
      }),
      false,
      "捕捉したroomIdが無い（異常系）場合は安全側でfalse"
    );
  }
}
