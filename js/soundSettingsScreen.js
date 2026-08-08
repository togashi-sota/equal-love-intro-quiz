// 効果音の詳細設定モーダル（2026-08-10新設）を担当するファイル。
// 設定の実体（保存・読み込み・音の合成）はjs/soundManager.jsに任せ、
// ここでは画面の組み立て（開閉・3つのON/OFFトグル・テーマ選択・音量スライダー・試聴）だけを扱う。
import {
  SFX_THEME_INFO,
  getSfxSettings,
  setSfxMasterEnabled,
  setSfxUiEnabled,
  setSfxGameEnabled,
  setSfxTheme,
  setSfxVolumePercent,
  previewSfxTheme,
} from "./soundManager.js";

let elements = null;

function isModalOpen() {
  return elements !== null && !elements.overlay.hidden;
}

function open() {
  renderSettings();
  elements.overlay.hidden = false;
}

function close() {
  elements.overlay.hidden = true;
}

function handleKeydown(event) {
  if (event.key !== "Escape") return;
  if (!isModalOpen()) return;
  close();
}

function handleOverlayClick(event) {
  if (event.target !== elements.overlay) return;
  close();
}

// ON/OFFトグルボタン1個分の見た目（ラベル・is-mutedクラス）を、現在の状態に合わせる。
function syncToggleButton(button, enabled) {
  button.classList.toggle("is-muted", !enabled);
  const label = button.querySelector(".sfx-settings-toggle-button-label");
  if (label) label.textContent = enabled ? "ON" : "OFF";
}

// サウンドテーマの選択肢（3枚）を組み立てる。選択中のテーマにはis-selectedを付ける。
function renderThemeOptions(currentTheme) {
  elements.themeList.innerHTML = "";
  SFX_THEME_INFO.forEach((theme) => {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "sfx-theme-option";
    option.classList.toggle("is-selected", theme.id === currentTheme);
    option.dataset.themeId = theme.id;

    const name = document.createElement("p");
    name.className = "sfx-theme-option-name";
    name.textContent = theme.name;
    option.appendChild(name);

    const description = document.createElement("p");
    description.className = "sfx-theme-option-description";
    description.textContent = theme.description;
    option.appendChild(description);

    option.addEventListener("click", () => {
      setSfxTheme(theme.id);
      renderThemeOptions(theme.id);
    });

    elements.themeList.appendChild(option);
  });
}

function renderSettings() {
  const settings = getSfxSettings();
  syncToggleButton(elements.masterToggle, settings.masterEnabled);
  syncToggleButton(elements.uiToggle, settings.uiEnabled);
  syncToggleButton(elements.gameToggle, settings.gameEnabled);
  renderThemeOptions(settings.theme);
  elements.volumeRange.value = String(settings.volumePercent);
  elements.volumeValue.textContent = `${settings.volumePercent}%`;
}

// 全体を再描画するmain.js側の関数（スタート画面のクイックトグルとこのモーダルの
// マスタートグルの表示を一致させるために、main.js側からも呼べるようにエクスポートする）。
export function refreshSfxSettingsUI() {
  if (elements === null) return;
  const settings = getSfxSettings();
  syncToggleButton(elements.masterToggle, settings.masterEnabled);
}

export function initSoundSettingsScreen(newElements) {
  elements = newElements;

  elements.openTriggers.forEach((trigger) => trigger.addEventListener("click", open));
  elements.closeButton.addEventListener("click", close);
  elements.overlay.addEventListener("click", handleOverlayClick);
  document.addEventListener("keydown", handleKeydown);

  elements.masterToggle.addEventListener("click", () => {
    const settings = getSfxSettings();
    setSfxMasterEnabled(!settings.masterEnabled);
    syncToggleButton(elements.masterToggle, !settings.masterEnabled);
    elements.onMasterToggle?.(!settings.masterEnabled);
  });
  elements.uiToggle.addEventListener("click", () => {
    const settings = getSfxSettings();
    setSfxUiEnabled(!settings.uiEnabled);
    syncToggleButton(elements.uiToggle, !settings.uiEnabled);
  });
  elements.gameToggle.addEventListener("click", () => {
    const settings = getSfxSettings();
    setSfxGameEnabled(!settings.gameEnabled);
    syncToggleButton(elements.gameToggle, !settings.gameEnabled);
  });

  elements.volumeRange.addEventListener("input", () => {
    const percent = Number(elements.volumeRange.value);
    setSfxVolumePercent(percent);
    elements.volumeValue.textContent = `${percent}%`;
  });

  // 試聴：スマホでうるさくならないよう、テーマを選ぶたびの自動再生はせず、
  // このボタンを押したときだけ「現在選択中のテーマ」の正解音を1回鳴らす（本人指示）。
  elements.previewButton.addEventListener("click", () => {
    previewSfxTheme(getSfxSettings().theme);
  });
}
