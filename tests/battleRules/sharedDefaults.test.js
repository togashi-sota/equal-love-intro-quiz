// js/battleRules/sharedDefaults.js（3ルール共通の純粋関数）のテスト。
// 歌詞本文は一切扱わないファイルのため、ダミーの曲ID・数値だけでテストする。

import {
  deriveAnswerOutcome,
  computeResponseMs,
  getComboMultiplier,
  validatePointTable,
  validateHintIntervalSec,
  SKIP_SELECTION,
} from "../../js/battleRules/sharedDefaults.js";
import { assertEqual } from "../test-utils.js";

export function runBattleRulesSharedDefaultsTests() {
  // ===== deriveAnswerOutcome =====
  {
    assertEqual(deriveAnswerOutcome("song-1", "song-1"), "correct", "選んだ曲が正解と一致すればcorrect");
    assertEqual(deriveAnswerOutcome("song-1", "song-2"), "wrongAnswer", "選んだ曲が正解と違えばwrongAnswer");
    assertEqual(deriveAnswerOutcome("song-1", SKIP_SELECTION), "skipped", "SKIP予約語ならskipped");
    assertEqual(
      deriveAnswerOutcome("song-1", "not-in-pool"),
      "wrongAnswer",
      "回答候補に無いようなIDでも、正解と一致しなければ単にwrongAnswer扱いになる（不正解に見せかけることはできない）"
    );
  }

  // ===== computeResponseMs =====
  {
    // questionStartedAt=0, hintIntervalSec=6, hintLevel=2 → ヒント2は6000msから表示開始
    const base = { questionStartedAt: 0, hintLevel: 2, hintIntervalSec: 6 };
    assertEqual(
      computeResponseMs({ ...base, submittedAt: 7000 }),
      1000,
      "ヒント表示開始から1秒後に回答したらresponseMsは1000"
    );
    assertEqual(
      computeResponseMs({ ...base, submittedAt: 5000 }),
      0,
      "時計のズレ等でヒント表示より前の時刻になっても、0未満にはクランプされる"
    );
    assertEqual(
      computeResponseMs({ ...base, submittedAt: 999999 }),
      6000,
      "極端に大きい値でも、そのヒント段階の制限時間（6000ms）を超えないようクランプされる"
    );
  }

  // ===== getComboMultiplier =====
  {
    const table = { 1: 1.0, 3: 1.2, 5: 1.5, 7: 2.0 };
    assertEqual(getComboMultiplier(0, table), 1.0, "コンボ0（未定義）は既定値1.0");
    assertEqual(getComboMultiplier(1, table), 1.0, "コンボ1はしきい値1の倍率1.0");
    assertEqual(getComboMultiplier(2, table), 1.0, "コンボ2はまだしきい値3に届かないので1.0のまま");
    assertEqual(getComboMultiplier(3, table), 1.2, "コンボ3はしきい値3の倍率1.2");
    assertEqual(getComboMultiplier(4, table), 1.2, "コンボ4はしきい値3の倍率1.2のまま");
    assertEqual(getComboMultiplier(5, table), 1.5, "コンボ5はしきい値5の倍率1.5");
    assertEqual(getComboMultiplier(7, table), 2.0, "コンボ7はしきい値7の倍率2.0");
    assertEqual(getComboMultiplier(100, table), 2.0, "しきい値を大きく超えても、最も高いしきい値の倍率が続く");
  }

  // ===== validatePointTable =====
  {
    assertEqual(validatePointTable({ 1: 50, 2: 40, 3: 30, 4: 20 }), null, "1〜4すべて揃っていればnull（正常）");
    assertEqual(validatePointTable({ 1: 50, 2: 40, 3: 30 }), "ヒント4の配点が不正です。", "ヒント4が欠けていればエラー");
    assertEqual(
      validatePointTable({ 1: 50, 2: 40, 3: 30, 4: -1 }),
      "ヒント4の配点が不正です。",
      "負の配点はエラー"
    );
    assertEqual(validatePointTable(null), "配点テーブルが不正です。", "nullはエラー");
  }

  // ===== validateHintIntervalSec =====
  {
    assertEqual(validateHintIntervalSec(6), null, "正の数値はnull（正常）");
    assertEqual(validateHintIntervalSec(0), "ヒント表示時間が不正です。", "0はエラー");
    assertEqual(validateHintIntervalSec(-1), "ヒント表示時間が不正です。", "負の値はエラー");
    assertEqual(validateHintIntervalSec("6"), "ヒント表示時間が不正です。", "文字列はエラー");
  }
}
