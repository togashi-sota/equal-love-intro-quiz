// callSync.js（ライブコールモードの同期表示）のテスト。
// DOM・音源に一切触れない純粋関数isShortCallText()だけを対象にする
// （「短いコールかどうか」の判定で、画面中央への飛び出しバースト演出の対象を決める）。
// 著作権保護のため、コール本文はダミー文言のみを使う。

import { isShortCallText, getLongCallDisplayLengthTier } from "../js/callSync.js";
import { assertEqual } from "./test-utils.js";

export function runCallSyncTests() {
  // ---- 短いコール（バースト演出の対象） ----
  assertEqual(isShortCallText("Hi!"), true, "3文字の英語コールは短いコール扱い");
  assertEqual(isShortCallText("Yeah!"), true, "5文字の英語コールは短いコール扱い");
  assertEqual(isShortCallText("オレ！"), true, "3文字の日本語コールは短いコール扱い");
  assertEqual(isShortCallText("フゥ！"), true, "3文字の日本語コールは短いコール扱い");
  assertEqual(isShortCallText("123456"), true, "ちょうど6文字は短いコール扱い（境界値）");

  // ---- 長いコール（従来通り行内ハイライトのみ） ----
  assertEqual(isShortCallText("1234567"), false, "7文字は短いコール扱いではない（境界値）");
  assertEqual(isShortCallText("せーの！せーの！ドンドコドーン！"), false, "長いMIX等は短いコール扱いではない");

  // ---- 異常系 ----
  assertEqual(isShortCallText(""), false, "空文字は短いコール扱いではない");
  assertEqual(isShortCallText(null), false, "nullは短いコール扱いではない（型ガード）");
  assertEqual(isShortCallText(undefined), false, "undefinedは短いコール扱いではない（型ガード）");

  // ---- 長いコール持続表示オーバーレイの文字サイズ段階（getLongCallDisplayLengthTier） ----
  assertEqual(getLongCallDisplayLengthTier("a"), "compact", "1文字はcompact");
  assertEqual(getLongCallDisplayLengthTier("a".repeat(20)), "compact", "ちょうど20文字はcompact（境界値）");
  assertEqual(getLongCallDisplayLengthTier("a".repeat(21)), "cozy", "21文字はcozy（境界値）");
  assertEqual(getLongCallDisplayLengthTier("a".repeat(40)), "cozy", "ちょうど40文字はcozy（境界値）");
  assertEqual(getLongCallDisplayLengthTier("a".repeat(41)), "roomy", "41文字はroomy（境界値）");
  assertEqual(getLongCallDisplayLengthTier("a".repeat(70)), "roomy", "ちょうど70文字はroomy（境界値）");
  assertEqual(getLongCallDisplayLengthTier("a".repeat(71)), "packed", "71文字はpacked（境界値）");
  assertEqual(getLongCallDisplayLengthTier("a".repeat(300)), "packed", "非常に長い本文もpacked");
  assertEqual(getLongCallDisplayLengthTier(""), "compact", "空文字はcompact（0文字扱い）");
  assertEqual(getLongCallDisplayLengthTier(null), "compact", "nullは0文字扱いでcompact（型ガード）");
  assertEqual(getLongCallDisplayLengthTier(undefined), "compact", "undefinedは0文字扱いでcompact（型ガード）");
}
