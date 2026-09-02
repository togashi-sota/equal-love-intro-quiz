// js/onlineBattleScreen.jsのrenderLobby()が持つ「room.statusが変わった瞬間、次に
// どの画面へ進むべきか」の判定ロジックだけを切り出した、Firebase処理を一切伴わない
// 純粋関数（2026-10-01新設・本人指示：オンライン対戦の同期回帰の緊急調査・恒久テスト化）。
//
// 【切り出した理由】renderLobby()自体はDOM操作・Firebase書き込み・タイマー起動などの
// 副作用が多く、そのままではテストしづらい。「今どの行動を取るべきか」の判定部分だけを
// この関数に集約し、renderLobby()側は戻り値（action）を見て対応する副作用を呼ぶだけに
// することで、判定ロジック自体を実際の副作用なしに恒久テストで検証できるようにする
// （本人指示：ホスト・ゲストの両方が同じ条件で同じ画面へ進むことを、コード側で保証したい）。
// 判定内容自体はrenderLobby()の元の if/else 分岐と完全に同じにしてあり、動きは変えていない。

export const ONLINE_BATTLE_TRANSITION_ACTION = {
  NONE: "none",
  ENTER_COUNTDOWN: "enterCountdown",
  ENTER_PLAY: "enterPlay",
  ENTER_RESULT: "enterResult",
  RETURN_TO_LOBBY: "returnToLobby",
  // 「もう一度」提案・結果画面のresultReturned待ちなど、まだ自分の意思表示をしていない
  // 結果画面を勝手に閉じないための「今は何もしない」（NONEとは区別し、テストで
  // 「意図して待っている」ことを確認できるようにする）。
  WAIT_FOR_RESULT_RESPONSE: "waitForResultResponse",
};

// room.gameModeの種類ごとに、結果画面への遷移先が異なる（js/onlineBattleScreen.js
// のenterLyricsQuizResult/enterInstantBattleResult/enterInstantCoopResult/
// goToResultScreenへの呼び分けと対応する）。
export const ONLINE_BATTLE_RESULT_KIND = {
  SHARED: "shared",
  LYRICS_QUIZ: "lyricsQuiz",
  INSTANT_BATTLE: "instantBattle",
  INSTANT_COOP: "instantCoop",
};

function resolveResultKind({ isLyricsQuiz, isInstantBattle, isInstantCoop }) {
  if (isLyricsQuiz) return ONLINE_BATTLE_RESULT_KIND.LYRICS_QUIZ;
  if (isInstantBattle) return ONLINE_BATTLE_RESULT_KIND.INSTANT_BATTLE;
  if (isInstantCoop) return ONLINE_BATTLE_RESULT_KIND.INSTANT_COOP;
  return ONLINE_BATTLE_RESULT_KIND.SHARED;
}

// 【本人指示・確認ポイント1〜4への回答】この関数はhost/guestで呼び分けを一切行わない
// （isHostという引数自体を持たない）。ホスト・ゲストどちらの端末で呼んでも、同じroom
// スナップショットを渡せば必ず同じactionが返る＝「ゲーム画面へ進んでよい条件」は
// host/guestで対称であることを、この関数の型そのものが保証する（isHostによって
// 変わるのは、この関数の外側でfinishCountdown()等の追加のFirebase書き込みを
// 行うかどうかだけで、画面遷移の可否には一切関わらない）。
//
// 引数：
// - statusJustChanged: room.statusが前回描画時から変わった瞬間かどうか
// - previousStatus / roomStatus: ROOM_STATUSの値
// - activeMatchId: room.activeMatchId
// - hasVoluntarilyLeftActiveMatch: 自分の意思でこの試合を既に離脱済みか（呼び出し側で
//   hasVoluntarilyLeftMatch(activeMatchId)を評価してから渡す）
// - isActiveMatchInvalidated: 今の試合が音源トラブル等で無効化済みか（呼び出し側で
//   isMatchInvalidated({match})を評価してから渡す）
// - isReturnedToLobby: room.statusがresult/countdown/playingからwaitingへ戻った瞬間か
// - currentScreenIsQuiz: 自分が今「quiz」画面（個人進行系の出題中）にいるか
// - currentScreenIsResultScreen: 自分が今4種類の結果画面のいずれかにいるか
// - hasRespondedToCurrentResultScreen: 今の結果画面で「もう一度」「ルーム設定に戻る」の
//   いずれかへの意思表示を既に行ったか
// - isLyricsQuiz / isInstantBattle / isInstantCoop: room.gameModeの種類
export function resolveOnlineBattleStatusTransition({
  statusJustChanged,
  previousStatus,
  roomStatus,
  hasVoluntarilyLeftActiveMatch,
  isActiveMatchInvalidated,
  isReturnedToLobby,
  currentScreenIsQuiz,
  currentScreenIsResultScreen,
  hasRespondedToCurrentResultScreen,
  isLyricsQuiz,
  isInstantBattle,
  isInstantCoop,
}) {
  if (!statusJustChanged) {
    return { action: ONLINE_BATTLE_TRANSITION_ACTION.NONE };
  }

  if (roomStatus === "countdown") {
    return { action: ONLINE_BATTLE_TRANSITION_ACTION.ENTER_COUNTDOWN };
  }

  if (
    roomStatus === "playing" &&
    previousStatus !== "countdown" &&
    !hasVoluntarilyLeftActiveMatch &&
    !isActiveMatchInvalidated
  ) {
    return { action: ONLINE_BATTLE_TRANSITION_ACTION.ENTER_PLAY };
  }

  if (roomStatus === "result" && !currentScreenIsQuiz) {
    return {
      action: ONLINE_BATTLE_TRANSITION_ACTION.ENTER_RESULT,
      resultKind: resolveResultKind({ isLyricsQuiz, isInstantBattle, isInstantCoop }),
    };
  }

  if (isReturnedToLobby) {
    if (currentScreenIsResultScreen && !hasRespondedToCurrentResultScreen) {
      return { action: ONLINE_BATTLE_TRANSITION_ACTION.WAIT_FOR_RESULT_RESPONSE };
    }
    return { action: ONLINE_BATTLE_TRANSITION_ACTION.RETURN_TO_LOBBY };
  }

  return { action: ONLINE_BATTLE_TRANSITION_ACTION.NONE };
}

// 【本人指示・確認ポイント5〜6への回答】goToCountdownScreen()は、カウントダウンが
// 0になった0.5秒後にsetTimeout経由でenterOnlineBattlePlay(room)を呼ぶ（「START!」の
// 文字を一瞬見せるための演出上のディレイ）。このsetTimeoutが発火する時点で、もし既に
// 別の部屋・別の試合へ進んでいた場合（例：カウントダウン中にホストが試合を無効化した、
// 部屋を退出した等、極端なタイミングの操作が重なった場合）、古い試合のroomスナップショットで
// 誤って出題を始めてしまわないよう、発火直前に「今も同じ部屋・同じ試合を指しているか」を
// 確認するための純粋関数。true＝そのまま進めてよい、false＝何もせず無視する。
export function isCountdownCompletionStillValid({
  capturedRoomId,
  capturedActiveMatchId,
  currentRoomId,
  latestActiveMatchId,
}) {
  if (!capturedRoomId || !currentRoomId) return false;
  if (capturedRoomId !== currentRoomId) return false;
  if (capturedActiveMatchId !== latestActiveMatchId) return false;
  return true;
}
