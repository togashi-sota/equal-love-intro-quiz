// js/onlineBattleStartSettings.js（「対戦を開始する」時にどの設定を使うかの判定）のテスト。
//
// 【背景】歌詞クイズ対戦で、既存のタイムアタック用フォームを読もうとして例外になり、
// 「対戦を開始する」が無反応になる不具合があった（本人からの実機報告で発覚）。
// 同じ不具合が将来（新しいgameModeの追加時など）に戻らないよう、この判定ロジックだけを
// 恒久テストの対象にする。

import {
  LYRICS_QUIZ_GAME_MODE,
  INSTANT_BATTLE_GAME_MODE,
  INSTANT_COOP_GAME_MODE,
  resolveStartSettingsForSubmit,
  resolveLastRoomRejoinOutcome,
} from "../js/onlineBattleStartSettings.js";
import { assertEqual } from "./test-utils.js";

function assertThrows(fn, messagePattern, label) {
  try {
    fn();
  } catch (error) {
    if (messagePattern && !messagePattern.test(error.message)) {
      throw new Error(`${label}: エラーメッセージが想定と異なります（実際: ${error.message}）`);
    }
    return; // 期待どおり例外が発生した
  }
  throw new Error(`${label}: 例外が発生しませんでした`);
}

export function runOnlineBattleStartSettingsTests() {
  // timeAttackはフォーム設定を使う
  {
    const formSettings = { questionCountValue: "10", categoryFilterValue: "all", rule: "normal", penaltySeconds: 3 };
    const result = resolveStartSettingsForSubmit({
      gameMode: "timeAttack",
      readFormSettings: () => formSettings,
      lyricsQuizRoomSettings: null,
    });
    assertEqual(result, formSettings, "timeAttackはreadFormSettings()の戻り値をそのまま使う");
  }

  // randomPlaybackもtimeAttackと同じくフォーム設定を使う（timeAttackBattleModeのdefaultSettingsを再利用しているため）
  {
    const formSettings = { questionCountValue: "5", categoryFilterValue: "signature", rule: "hard", penaltySeconds: 5 };
    const result = resolveStartSettingsForSubmit({
      gameMode: "randomPlayback",
      readFormSettings: () => formSettings,
      lyricsQuizRoomSettings: null,
    });
    assertEqual(result, formSettings, "randomPlaybackはreadFormSettings()の戻り値をそのまま使う");
  }

  // outroQuizもtimeAttack・randomPlaybackと同じくフォーム設定を使う
  // 【2026-08-30発見・修正】以前はFORM_BASED_GAME_MODESに含まれておらず、アウトロ対戦の
  // 「対戦を開始する」が必ず「未対応の対戦モードです」で失敗していた不具合の再発防止。
  {
    const formSettings = { questionCountValue: "5", categoryFilterValue: "title-track", rule: "normal", penaltySeconds: 2 };
    const result = resolveStartSettingsForSubmit({
      gameMode: "outroQuiz",
      readFormSettings: () => formSettings,
      lyricsQuizRoomSettings: null,
    });
    assertEqual(result, formSettings, "outroQuizはreadFormSettings()の戻り値をそのまま使う");
  }

  // 一瞬バトルはroom.settingsをそのまま使い、フォームは一切読まない（歌詞クイズと同じ理由）
  {
    const instantBattleRoomSettings = {
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      playDurationValue: "1",
      answerPoolSizeValue: "10",
    };
    let formSettingsWasRead = false;
    const result = resolveStartSettingsForSubmit({
      gameMode: INSTANT_BATTLE_GAME_MODE,
      readFormSettings: () => {
        formSettingsWasRead = true;
        return { questionCountValue: "10", categoryFilterValue: "all", rule: "normal", penaltySeconds: 3 };
      },
      instantBattleRoomSettings,
    });
    assertEqual(result, instantBattleRoomSettings, "instantBattleはinstantBattleRoomSettingsをそのまま使う");
    assertEqual(formSettingsWasRead, false, "instantBattleのときreadFormSettings()は呼ばれない");
  }

  // 一瞬バトルで、まだroom.settingsを受け取っていない場合はエラー
  assertThrows(
    () =>
      resolveStartSettingsForSubmit({
        gameMode: INSTANT_BATTLE_GAME_MODE,
        readFormSettings: () => ({}),
        instantBattleRoomSettings: null,
      }),
    /対戦設定をまだ読み込めていません/,
    "instantBattleでinstantBattleRoomSettingsが無い場合は例外"
  );

  // 一瞬協力はroom.settingsをそのまま使い、フォームは一切読まない（一瞬バトルと同じ理由）
  {
    const instantCoopRoomSettings = {
      questionCountValue: "5",
      categoryFilterValue: "title-track",
      playDurationValue: "1",
      answerPoolSizeValue: "10",
    };
    const result = resolveStartSettingsForSubmit({
      gameMode: INSTANT_COOP_GAME_MODE,
      readFormSettings: () => ({}),
      instantCoopRoomSettings,
    });
    assertEqual(result, instantCoopRoomSettings, "instantCoopはinstantCoopRoomSettingsをそのまま使う");
  }

  // 一瞬協力で、まだroom.settingsを受け取っていない場合はエラー
  assertThrows(
    () =>
      resolveStartSettingsForSubmit({
        gameMode: INSTANT_COOP_GAME_MODE,
        readFormSettings: () => ({}),
        instantCoopRoomSettings: null,
      }),
    /対戦設定をまだ読み込めていません/,
    "instantCoopでinstantCoopRoomSettingsが無い場合は例外"
  );

  // lyricsQuizはroom.settingsをそのまま使い、フォームは一切読まない
  {
    const lyricsQuizRoomSettings = {
      battleRuleId: "classic",
      battleRuleVersion: 1,
      answerPoolSizeValue: 4,
      questionCountValue: "5",
      hintIntervalSec: 6,
      questionSource: { type: "allSongs" },
    };
    let formSettingsWasRead = false;
    const result = resolveStartSettingsForSubmit({
      gameMode: LYRICS_QUIZ_GAME_MODE,
      readFormSettings: () => {
        formSettingsWasRead = true;
        return { questionCountValue: "10", categoryFilterValue: "all", rule: "normal", penaltySeconds: 3 };
      },
      lyricsQuizRoomSettings,
    });
    assertEqual(result, lyricsQuizRoomSettings, "lyricsQuizはlyricsQuizRoomSettingsをそのまま使う");
    assertEqual(formSettingsWasRead, false, "lyricsQuizのときreadFormSettings()は呼ばれない");
  }

  // lyricsQuizで、まだroom.settingsを受け取っていない（renderLobby()がまだ一度も走っていない）場合はエラー
  assertThrows(
    () =>
      resolveStartSettingsForSubmit({
        gameMode: LYRICS_QUIZ_GAME_MODE,
        readFormSettings: () => ({}),
        lyricsQuizRoomSettings: null,
      }),
    /対戦設定をまだ読み込めていません/,
    "lyricsQuizでlyricsQuizRoomSettingsが無い場合は例外"
  );

  // 未対応のgameMode（将来モードが増えて、この分岐の更新を忘れた場合）は、無反応にならず明示的にエラー
  assertThrows(
    () =>
      resolveStartSettingsForSubmit({
        gameMode: "unknownFutureMode",
        readFormSettings: () => ({}),
        lyricsQuizRoomSettings: null,
      }),
    /未対応の対戦モードです/,
    "未対応のgameModeは例外（無反応で握りつぶさない）"
  );

  // ===== resolveLastRoomRejoinOutcome：「前回のルームに戻る」が無反応になる不具合の再発防止 =====
  // （本人の指摘・2026-08-11：退出直後、lastRoomが既に消えているのに古い表示のまま
  // ボタンが残り、押しても何も起きなかった）
  {
    assertEqual(
      resolveLastRoomRejoinOutcome({ ok: true, roomId: "ABCDEF" }),
      { action: "enter-lobby", roomId: "ABCDEF" },
      "参加に成功すればロビーへ入る"
    );
    assertEqual(
      resolveLastRoomRejoinOutcome({ ok: false, reason: "not-found" }),
      { action: "show-error", forgetLastRoom: true, reason: "not-found" },
      "ルームが本当に存在しない場合はエラー表示し、無効な前回ルーム記憶を消す"
    );
    assertEqual(
      resolveLastRoomRejoinOutcome({ ok: false, reason: "write-failed" }),
      { action: "show-error", forgetLastRoom: false, reason: "write-failed" },
      "書き込み失敗等の一時的なエラーではエラー表示のみで、記憶は残して再試行できるようにする"
    );
    assertEqual(
      resolveLastRoomRejoinOutcome({ ok: false, reason: "not-signed-in" }),
      { action: "show-error", forgetLastRoom: false, reason: "not-signed-in" },
      "サインインエラーも同様に記憶を残す"
    );
  }
}
