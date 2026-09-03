// js/onlineBattle.jsのgenerateRoomId()（オンライン対戦のルームコード生成）のテスト。
//
// 【本人指示：数字の「0」と英大文字の「O」が紛らわしい】新しく生成するルームコードには
// 0/Oを絶対に含めないことを検証する（既存の0/O入りルームコードへの参加互換性は、
// generateRoomId()側を変えても影響しない＝参加処理は文字種チェックをしていないため対象外）。
import { generateRoomId } from "../js/onlineBattle.js";
import { assertEqual } from "./test-utils.js";

export function runOnlineBattleRoomIdTests() {
  // 統計的な偶然での見落としを避けるため、十分な回数生成して全件チェックする。
  const SAMPLE_COUNT = 2000;
  let containsZero = 0;
  let containsLetterO = 0;
  let wrongLength = 0;

  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const code = generateRoomId();
    if (code.length !== 6) wrongLength++;
    if (code.includes("0")) containsZero++;
    if (code.includes("O")) containsLetterO++;
  }

  assertEqual(wrongLength, 0, `${SAMPLE_COUNT}回生成してもルームコードは常に6文字`);
  assertEqual(containsZero, 0, `${SAMPLE_COUNT}回生成しても数字の「0」を含むルームコードは1つも無い`);
  assertEqual(containsLetterO, 0, `${SAMPLE_COUNT}回生成しても英大文字の「O」を含むルームコードは1つも無い`);
}
