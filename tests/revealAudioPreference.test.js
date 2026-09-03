// js/revealAudioPreference.jsの恒久テスト。
// 実際にlocalStorageへ読み書きする（js/soundManager.jsの既存テストと同じ手法）。
import {
  getLyricsQuizRevealAudioEnabled,
  setLyricsQuizRevealAudioEnabled,
  getInstantChallengeRevealAudioEnabled,
  setInstantChallengeRevealAudioEnabled,
} from "../js/revealAudioPreference.js";
import { assertEqual } from "./test-utils.js";

const KEYS = [
  "equalLoveIntroQuiz.revealAudioEnabled.lyricsQuiz",
  "equalLoveIntroQuiz.revealAudioEnabled.instantChallenge",
];

export function runRevealAudioPreferenceTests() {
  const originalValues = KEYS.map((key) => localStorage.getItem(key));
  try {
    KEYS.forEach((key) => localStorage.removeItem(key));

    // ---- 初期値は両方とも「再生する」（true） ----
    assertEqual(getLyricsQuizRevealAudioEnabled(), true, "歌詞クイズの初期値は再生する（true）");
    assertEqual(getInstantChallengeRevealAudioEnabled(), true, "一瞬チャレンジの初期値は再生する（true）");

    // ---- 歌詞クイズだけOFFにしても、一瞬チャレンジには影響しない（本人指示：別設定） ----
    setLyricsQuizRevealAudioEnabled(false);
    assertEqual(getLyricsQuizRevealAudioEnabled(), false, "歌詞クイズをOFFにすると反映される");
    assertEqual(
      getInstantChallengeRevealAudioEnabled(),
      true,
      "歌詞クイズをOFFにしても、一瞬チャレンジの設定は変わらない（別設定）"
    );

    // ---- 一瞬チャレンジだけOFFにしても、歌詞クイズには影響しない ----
    setInstantChallengeRevealAudioEnabled(false);
    assertEqual(getInstantChallengeRevealAudioEnabled(), false, "一瞬チャレンジをOFFにすると反映される");
    assertEqual(getLyricsQuizRevealAudioEnabled(), false, "歌詞クイズは直前にOFFにした値のまま（true化されない）");

    // ---- 再度ONへ戻せる ----
    setLyricsQuizRevealAudioEnabled(true);
    setInstantChallengeRevealAudioEnabled(true);
    assertEqual(getLyricsQuizRevealAudioEnabled(), true, "歌詞クイズを再度ONへ戻せる");
    assertEqual(getInstantChallengeRevealAudioEnabled(), true, "一瞬チャレンジを再度ONへ戻せる");
  } finally {
    // 他のテスト・実機確認に影響を残さないよう、テスト開始前の値へ必ず戻す。
    KEYS.forEach((key, index) => {
      const original = originalValues[index];
      if (original === null) localStorage.removeItem(key);
      else localStorage.setItem(key, original);
    });
  }
}
