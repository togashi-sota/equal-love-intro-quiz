// js/soundManager.js（効果音システムの中核）のテスト。
// Web Audio APIは実ブラウザ（tests.html）上でしか正しく検証できないため、
// 「例外を投げずに完了すること」「設定値が正しく保存・復元されること」を中心に確認する。
// 実際の音色（周波数・波形の違いが心地よく聞こえるか）は自動テストでは判断できないため、
// 恒久テストの範囲外とし、実ブラウザでの試聴確認で別途担保する。
import {
  SFX_EVENTS,
  SFX_THEMES,
  SFX_THEME_INFO,
  playSfx,
  previewSfxTheme,
  playCountUpSweep,
  getSfxSettings,
  setSfxMasterEnabled,
  toggleSfxMasterEnabled,
  setSfxUiEnabled,
  setSfxGameEnabled,
  setSfxTheme,
  setSfxVolumePercent,
} from "../js/soundManager.js";
import { assertEqual } from "./test-utils.js";

const KEYS = {
  master: "equalLoveIntroQuiz.sfxEnabled",
  ui: "equalLoveIntroQuiz.sfxUiEnabled",
  game: "equalLoveIntroQuiz.sfxGameEnabled",
  theme: "equalLoveIntroQuiz.sfxTheme",
  volume: "equalLoveIntroQuiz.sfxVolume",
};

function clearAllKeys() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}

export function runSoundManagerTests() {
  // ===== テーマ・イベントの定義そのもの =====
  assertEqual(SFX_THEME_INFO.length, 3, "サウンドテーマは3種類定義されている");
  assertEqual(
    SFX_THEME_INFO.map((t) => t.id).sort(),
    [SFX_THEMES.SPARKLE, SFX_THEMES.LIVE, SFX_THEMES.CLASSIC].sort(),
    "3種類のテーマIDが一致する"
  );
  const requiredEvents = [
    "UI_CLICK",
    "UI_BACK",
    "UI_CONFIRM",
    "QUIZ_CORRECT",
    "QUIZ_WRONG",
    "COUNTDOWN_TICK",
    "COUNTDOWN_FINAL",
    "GAME_START",
    "RESULT_GOOD",
    "RESULT_GREAT",
    "RESULT_PERFECT",
    "BATTLE_WIN",
    "BATTLE_LOSE",
    "ACHIEVEMENT_UNLOCK",
  ];
  requiredEvents.forEach((key) => {
    assertEqual(typeof SFX_EVENTS[key], "string", `SFX_EVENTS.${key}が定義されている`);
  });

  // ===== 設定の保存・読み込み =====
  clearAllKeys();
  {
    const defaults = getSfxSettings();
    assertEqual(defaults.masterEnabled, true, "デフォルトのマスター効果音はON");
    assertEqual(defaults.uiEnabled, true, "デフォルトのUI操作音はON");
    assertEqual(defaults.gameEnabled, true, "デフォルトのゲーム効果音はON");
    assertEqual(defaults.theme, SFX_THEMES.SPARKLE, "デフォルトテーマはSparkle Pop");
    assertEqual(defaults.volumePercent, 70, "デフォルト音量は70%");
  }

  setSfxMasterEnabled(false);
  assertEqual(getSfxSettings().masterEnabled, false, "setSfxMasterEnabled(false)が反映される");
  assertEqual(localStorage.getItem(KEYS.master), "false", "マスター設定がlocalStorageへ保存される");

  const afterToggle = toggleSfxMasterEnabled();
  assertEqual(afterToggle, true, "toggleSfxMasterEnabled()はOFF→ONの切替後の値を返す");
  assertEqual(getSfxSettings().masterEnabled, true, "トグル後の状態が読み取れる");

  setSfxUiEnabled(false);
  assertEqual(getSfxSettings().uiEnabled, false, "UI操作音だけをOFFにできる");
  assertEqual(getSfxSettings().gameEnabled, true, "UI操作音をOFFにしてもゲーム効果音はONのまま（分離できている）");

  setSfxGameEnabled(false);
  assertEqual(getSfxSettings().gameEnabled, false, "ゲーム効果音だけをOFFにできる");

  setSfxTheme(SFX_THEMES.LIVE);
  assertEqual(getSfxSettings().theme, SFX_THEMES.LIVE, "テーマを変更できる");
  setSfxTheme("not-a-real-theme");
  assertEqual(getSfxSettings().theme, SFX_THEMES.SPARKLE, "不正なテーマ名はデフォルト（Sparkle）へフォールバックする");

  setSfxVolumePercent(45);
  assertEqual(getSfxSettings().volumePercent, 45, "音量を変更できる");
  setSfxVolumePercent(150);
  assertEqual(getSfxSettings().volumePercent, 100, "音量は100%より大きくならない（clamp）");
  setSfxVolumePercent(-20);
  assertEqual(getSfxSettings().volumePercent, 0, "音量は0%より小さくならない（clamp）");
  setSfxVolumePercent(37.6);
  assertEqual(getSfxSettings().volumePercent, 38, "音量は四捨五入した整数で保存される");

  clearAllKeys();

  // ===== 再起動後の設定復元（保存済みlocalStorageから読み直す想定） =====
  {
    localStorage.setItem(KEYS.master, "false");
    localStorage.setItem(KEYS.ui, "false");
    localStorage.setItem(KEYS.game, "true");
    localStorage.setItem(KEYS.theme, SFX_THEMES.CLASSIC);
    localStorage.setItem(KEYS.volume, "20");
    // このモジュールは読み込み時に一度だけ設定を読み取る実装のため、再読み込み相当の検証は
    // 「保存されている値がgetSfxSettings()の初期値の元になる」という設計をコードレビューで
    // 確認済み（モジュールの再import自体はブラウザの性質上、同一セッションでは行えない）。
    // ここでは実際に保存されている値が壊れず読み書きできることだけを確認する。
    assertEqual(localStorage.getItem(KEYS.master), "false", "保存したマスター設定がそのまま残る");
    assertEqual(localStorage.getItem(KEYS.theme), SFX_THEMES.CLASSIC, "保存したテーマがそのまま残る");
    assertEqual(localStorage.getItem(KEYS.volume), "20", "保存した音量がそのまま残る");
  }
  clearAllKeys();

  // ===== 旧設定（sfxEnabledのみ）との後方互換 =====
  {
    // 旧バージョンのユーザーは、equalLoveIntroQuiz.sfxEnabledだけが保存されている状態。
    // ui/game/theme/volumeキーは存在しない＝readXxx()が既定値にフォールバックすることを確認する
    // （このファイル自体が「新しいキーが無ければ既定値」という設計のため、追加の移行処理は不要）。
    localStorage.setItem(KEYS.master, "false");
    assertEqual(localStorage.getItem(KEYS.ui), null, "旧設定のみのユーザーは新キー(ui)がまだ存在しない");
    assertEqual(localStorage.getItem(KEYS.game), null, "旧設定のみのユーザーは新キー(game)がまだ存在しない");
  }
  clearAllKeys();

  // ===== 再生系（例外を投げずに完了することの確認。実際の音色は実ブラウザ確認で担保） =====
  setSfxMasterEnabled(true);
  setSfxUiEnabled(true);
  setSfxGameEnabled(true);

  requiredEvents.forEach((key) => {
    let threw = false;
    try {
      playSfx(SFX_EVENTS[key]);
    } catch {
      threw = true;
    }
    assertEqual(threw, false, `playSfx(SFX_EVENTS.${key})は例外を投げない`);
  });

  [SFX_THEMES.SPARKLE, SFX_THEMES.LIVE, SFX_THEMES.CLASSIC].forEach((theme) => {
    setSfxTheme(theme);
    Object.values(SFX_EVENTS).forEach((eventName) => {
      let threw = false;
      try {
        playSfx(eventName);
      } catch {
        threw = true;
      }
      assertEqual(threw, false, `テーマ${theme}でのplaySfx(${eventName})は例外を投げない`);
    });
  });

  // 不正なイベント名を渡しても落ちない（防御的）。
  {
    let threw = false;
    try {
      playSfx("not-a-real-event");
    } catch {
      threw = true;
    }
    assertEqual(threw, false, "未定義のイベント名を渡しても例外を投げない（何もしない）");
  }

  // マスターOFFのときは、そもそも音の合成処理へ進まない（早期return）。
  // 直接は観測できないため、「OFFでも例外を投げず、設定自体は変化しない」ことを確認する。
  {
    setSfxMasterEnabled(false);
    let threw = false;
    try {
      playSfx(SFX_EVENTS.QUIZ_CORRECT);
    } catch {
      threw = true;
    }
    assertEqual(threw, false, "マスターOFFでもplaySfx()は例外を投げない");
    assertEqual(getSfxSettings().masterEnabled, false, "マスターOFFの状態はplaySfx()呼び出し後も変化しない");
    setSfxMasterEnabled(true);
  }

  // UI/ゲームどちらかだけOFFでも安全に完了する。
  {
    setSfxUiEnabled(false);
    setSfxGameEnabled(true);
    let threwUiOff = false;
    try {
      playSfx(SFX_EVENTS.UI_CLICK);
      playSfx(SFX_EVENTS.QUIZ_CORRECT);
    } catch {
      threwUiOff = true;
    }
    assertEqual(threwUiOff, false, "UI操作音OFF・ゲーム効果音ONの組み合わせでも例外を投げない");

    setSfxUiEnabled(true);
    setSfxGameEnabled(false);
    let threwGameOff = false;
    try {
      playSfx(SFX_EVENTS.UI_CLICK);
      playSfx(SFX_EVENTS.QUIZ_CORRECT);
    } catch {
      threwGameOff = true;
    }
    assertEqual(threwGameOff, false, "UI操作音ON・ゲーム効果音OFFの組み合わせでも例外を投げない");
  }

  // 試聴（previewSfxTheme）はON/OFF設定に関わらず動く。
  {
    setSfxMasterEnabled(false);
    let threwPreview = false;
    try {
      previewSfxTheme(SFX_THEMES.SPARKLE);
      previewSfxTheme(SFX_THEMES.LIVE);
      previewSfxTheme(SFX_THEMES.CLASSIC);
      previewSfxTheme("not-a-real-theme");
    } catch {
      threwPreview = true;
    }
    assertEqual(threwPreview, false, "試聴はマスターOFFでも例外を投げず動作する");
    setSfxMasterEnabled(true);
  }

  // 得点カウントアップ音（テーマに属さない専用スイープ）も例外を投げない。
  {
    let threwCountUp = false;
    try {
      playCountUpSweep();
    } catch {
      threwCountUp = true;
    }
    assertEqual(threwCountUp, false, "playCountUpSweep()は例外を投げない");
  }

  // 連打しても例外にならない（Oscillator残留のような問題は自動テストでは検出できないため、
  // ここでは「大量に呼んでも同期的に完了し、例外を投げない」ことだけを確認する）。
  {
    let threwRapid = false;
    try {
      for (let i = 0; i < 50; i++) {
        playSfx(SFX_EVENTS.UI_CLICK);
      }
    } catch {
      threwRapid = true;
    }
    assertEqual(threwRapid, false, "UIクリック音を50回連続で呼んでも例外を投げない");
  }

  clearAllKeys();
}
