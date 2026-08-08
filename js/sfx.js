// ボタン操作・正解/不正解の効果音を再生するファイル。
//
// 【2026-08-10改修】効果音の実体（AudioContext管理・テーマ別の音の合成・設定保存）は
// js/soundManager.jsへ移した。このファイルは、既存の100箇所以上のimport元（js/main.js等）を
// 書き換えずに済むよう、同じ関数名（playClickSound等）のまま新しい仕組みへ橋渡しする
// 薄いラッパーとして残している。新しく効果音を鳴らす箇所を追加するときは、
// このファイルではなくjs/soundManager.jsのplaySfx(SFX_EVENTS.xxx)を直接使うこと。
import {
  SFX_EVENTS,
  playSfx,
  playCountUpSweep,
  getSfxSettings,
  setSfxMasterEnabled,
  toggleSfxMasterEnabled,
} from "./soundManager.js";

export function isSfxEnabled() {
  return getSfxSettings().masterEnabled;
}

// 効果音のON/OFFを切り替える。切り替え後の状態を返す（呼び出し側でボタンの見た目を
// 更新するのに使う）。
export function toggleSfxEnabled() {
  return toggleSfxMasterEnabled();
}

export function setSfxEnabled(enabled) {
  setSfxMasterEnabled(enabled);
}

// ボタンを押したときの、短く控えめなクリック音。
export function playClickSound() {
  playSfx(SFX_EVENTS.UI_CLICK);
}

// 正解したときのチャイム。
export function playCorrectSound() {
  playSfx(SFX_EVENTS.QUIZ_CORRECT);
}

// 不正解のときの音。
export function playWrongSound() {
  playSfx(SFX_EVENTS.QUIZ_WRONG);
}

// 結果画面の得点カウントアップに合わせて鳴らす、上昇するスイープ音。
export function playCountUpSound() {
  playCountUpSweep();
}
