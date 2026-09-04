// オフラインのクイズ問題中に開ける簡易効果音設定パネル（2026-09-05新設・本人指示：
// 実機フィードバックによる改善）。
//
// 既存の本設定画面（js/soundSettingsScreen.js）と同じ効果音システム（js/soundManager.js）を
// そのまま使い回し、「効果音音量（OFF/小/中/大の4段階）」「サウンドテーマ」「試し聴き」だけに
// 絞った軽量版を提供する。「音ごとの詳細設定」はここには含めない（本人指示：問題中は
// この3項目だけで十分、細かい調整は今までどおり本設定画面で行う）。既存の
// カスタム（音ごとの個別上書き）設定は、パネルを開いただけでは一切変更しない
// （テーマを実際にタップしたときだけ、本設定画面と同じ確認ダイアログを経て変更する）。
//
// 【設計方針：既存の音声再生（js/audio.js）・タイマー（js/timer.js）には一切触れない】
// パネルを開いている間の楽曲・タイマーの一時停止/再開は、呼び出し元（js/main.js）が
// initQuickSfxSettingsPanel()のonOpen/onCloseコールバック経由で行う。このファイル自体は
// 「効果音設定の表示・変更」だけに専念する（責務を分離し、音声再生まわりの改変を
// 最小限に抑えるため）。
import {
  SFX_EVENTS,
  SFX_THEME_INFO,
  getSfxSettings,
  setSfxMasterEnabled,
  setSfxTheme,
  setSfxVolumePercent,
  previewSfxEvent,
  hasAnyEventThemeOverrides,
  clearAllEventThemeOverrides,
  playSfx,
} from "./soundManager.js";

// 【本人指示】効果音音量はOFF/小/中/大の4段階固定（OFF=0%・小=30%・中=60%・大=100%）。
const VOLUME_LEVELS = [
  { key: "off", label: "OFF", percent: 0 },
  { key: "low", label: "小", percent: 30 },
  { key: "mid", label: "中", percent: 60 },
  { key: "high", label: "大", percent: 100 },
];

let elements = null;
let onOpenCallback = null;
let onCloseCallback = null;

function isOpen() {
  return elements !== null && !elements.overlay.hidden;
}

function showHint(text) {
  if (!elements.hint) return;
  elements.hint.textContent = text;
  elements.hint.hidden = false;
}

function hideHint() {
  if (!elements.hint) return;
  elements.hint.hidden = true;
}

// OFFは「マスターOFF」として扱う（既存のsfxMasterEnabledと整合させ、他の効果音ON/OFF
// 判定と食い違わないようにするため）。小・中・大はマスターON＋既存のsfxVolumePercent
// （0-100の連続値）を3段階の固定値へ当てはめるだけなので、既存の音量計算方式
// （playSfx側のsfxVolumePercent/100の掛け算）とも安全に整合する。
function renderVolumeOptions() {
  const { masterEnabled, volumePercent } = getSfxSettings();
  elements.volumeList.innerHTML = "";
  VOLUME_LEVELS.forEach((level) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quick-sfx-volume-option";
    const isSelected = level.key === "off" ? !masterEnabled : masterEnabled && volumePercent === level.percent;
    button.classList.toggle("is-selected", isSelected);
    button.textContent = level.label;
    button.addEventListener("click", () => {
      hideHint();
      playSfx(SFX_EVENTS.UI_CLICK);
      if (level.key === "off") {
        setSfxMasterEnabled(false);
      } else {
        setSfxMasterEnabled(true);
        setSfxVolumePercent(level.percent);
      }
      // 選んだ瞬間に保存・反映済み（本人指示：「保存して戻る」ボタンは作らない）。
      renderVolumeOptions();
    });
    elements.volumeList.appendChild(button);
  });
}

// 既存の本設定画面（js/soundSettingsScreen.js）のrenderThemeOptions()と同じ設計・同じ
// クラス名（.sfx-theme-option等）をそのまま使い回す。カード自体をタップしたときだけ
// テーマを実際に変更し、個別カスタム（sfxEventOverrides）が1件でもあれば、本設定画面と
// 同じ文言の確認ダイアログを挟む（本人指示：「知らないうちにカスタムが消えるのは避ける」
// という既存方針を、この簡易パネルでも同じく守る）。
function renderThemeOptions() {
  const { theme: currentTheme } = getSfxSettings();
  elements.themeList.innerHTML = "";
  SFX_THEME_INFO.forEach((theme) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "sfx-theme-option";
    option.classList.toggle("is-selected", theme.id === currentTheme);

    const name = document.createElement("p");
    name.className = "sfx-theme-option-name";
    name.textContent = theme.name;
    option.appendChild(name);

    const description = document.createElement("p");
    description.className = "sfx-theme-option-description";
    description.textContent = theme.description;
    option.appendChild(description);

    // 【本人指示】代表として「正解時の効果音」だけを試し聴きできればよい
    // （本設定画面のpreviewSfxTheme()のような5音シーケンスは、この簡易パネルには不要）。
    const previewButton = document.createElement("button");
    previewButton.type = "button";
    previewButton.className = "sfx-theme-option-preview-button";
    previewButton.textContent = "▶ 正解音を試聴";
    previewButton.addEventListener("click", (event) => {
      event.stopPropagation();
      // 【本人指示】OFFのときは勝手に音を鳴らさず、案内だけ出す
      // （previewSfxEvent()自体はON/OFF状態を無視して鳴らせてしまう設計のため、
      // ここで呼び出し側が明示的に止める）。
      if (!getSfxSettings().masterEnabled) {
        showHint("試し聴きするには効果音をONにしてください");
        return;
      }
      hideHint();
      previewSfxEvent(SFX_EVENTS.QUIZ_CORRECT, theme.id);
    });
    option.appendChild(previewButton);

    option.addEventListener("click", () => {
      if (theme.id === currentTheme) return;
      if (hasAnyEventThemeOverrides()) {
        const confirmed = window.confirm(
          `テーマを「${theme.name}」に変更すると、音ごとに個別カスタマイズした効果音は、このテーマの標準サウンドセットに切り替わります。よろしいですか？`
        );
        if (!confirmed) return;
        clearAllEventThemeOverrides();
      }
      hideHint();
      playSfx(SFX_EVENTS.UI_CONFIRM);
      setSfxTheme(theme.id);
      renderThemeOptions();
    });

    elements.themeList.appendChild(option);
  });
}

function renderSettings() {
  hideHint();
  renderVolumeOptions();
  renderThemeOptions();
}

export function openQuickSfxSettingsPanel() {
  if (!elements || isOpen()) return;
  renderSettings();
  elements.overlay.hidden = false;
  if (onOpenCallback) onOpenCallback();
}

export function closeQuickSfxSettingsPanel() {
  if (!elements || !isOpen()) return;
  elements.overlay.hidden = true;
  if (onCloseCallback) onCloseCallback();
}

function handleOverlayClick(event) {
  if (event.target !== elements.overlay) return;
  playSfx(SFX_EVENTS.UI_BACK);
  closeQuickSfxSettingsPanel();
}

function handleKeydown(event) {
  if (event.key !== "Escape") return;
  if (!isOpen()) return;
  playSfx(SFX_EVENTS.UI_BACK);
  closeQuickSfxSettingsPanel();
}

// js/main.jsから一度だけ呼ぶ。onOpen/onCloseは、問題の楽曲・タイマーの一時停止/再開を
// 呼び出し元に委ねるためのコールバック（このモジュール自体は音声再生に一切触れない）。
export function initQuickSfxSettingsPanel(newElements, { onOpen, onClose } = {}) {
  elements = newElements;
  onOpenCallback = onOpen ?? null;
  onCloseCallback = onClose ?? null;
  elements.closeButton.addEventListener("click", () => {
    playSfx(SFX_EVENTS.UI_BACK);
    closeQuickSfxSettingsPanel();
  });
  elements.overlay.addEventListener("click", handleOverlayClick);
  document.addEventListener("keydown", handleKeydown);
}
